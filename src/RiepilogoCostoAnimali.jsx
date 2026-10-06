import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro, formattaNumero, round2, fetchAllPages } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { stimaPesoCarcassaPerEta } from "./motoreRiproduttori";
import { conteggioUnitaPerLotto, costoAcquistoUnitario, costoAnimale, righePerSoggetto, eUscito, idGenitori, segnaRiproduttoriEffettivi, normalizzaAnimali } from "./costoAnimale";
import { caricaRigheVendita, uscitaTrasferimento } from "./venditeDaFatture";
import SchedaRiproduttore from "./SchedaRiproduttore";
import SchedaAnimaleMacello from "./SchedaAnimaleMacello";

// Riepilogo Costo Animali: TUTTI gli animali (riproduttori, animali da macello, suinetti nei
// lotti), con il loro costo calcolato in un solo modo (costoAnimale.js). Cliccando una riga si
// apre la scheda giusta: Scheda Riproduttore per i riproduttori, Scheda Animale per gli altri.
// Sostituisce il «Report Accrescimento/Ingrasso» e la «Consultazione Animali per Anno».

const ETICHETTE_SPECIE = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };
const ETICHETTE_SESSO = { M: "Maschio", F: "Femmina" };

export default function RiepilogoCostoAnimali() {
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);
  const [righe, setRighe] = useState([]);
  const [specie, setSpecie] = useState("bovino");
  const [categoria, setCategoria] = useState("macello"); // macello | riproduttori
  const [statoFiltro, setStatoFiltro] = useState("tutti"); // tutti | azienda | usciti
  const [anno, setAnno] = useState("");
  const [cerca, setCerca] = useState("");
  const [selezionato, setSelezionato] = useState(null);

  useEffect(() => { carica(); }, []);

  async function carica() {
    setCaricando(true);
    setErrore(null);
    try {
      const [rAnimali, rLotti, rUnita, rCosti, rVendite, rResidui] = await Promise.all([
        fetchAllPages((da, a) => supabase.from("animali").select("id,bdn,nome,specie,razza,razza_calcolata,sesso,riproduttore,provenienza,prezzo_acquisto,nascita,data_ingresso,stato,data_uscita,motivo_uscita,peso_vivo_uscita,peso_carcassa,madre_id,padre_id,note").range(da, a)),
        fetchAllPages((da, a) => supabase.from("lotti_suini").select("id,codice_lotto,codice,tipo_provenienza,prezzo_acquisto,razza_madre,specie,data_parto,madre_id,padre_id").range(da, a)),
        fetchAllPages((da, a) => supabase.from("suini_lotto").select("id,lotto_id,nr,codice_completo,bdn,sesso,stato,data_uscita,motivo_uscita,peso_carcassa,peso_vivo_uscita").range(da, a)),
        fetchAllPages((da, a) => supabase.from("ci_costo_animale_annuale").select("animale_id,lotto_id,unita_nr,anno,costo_mantenimento,costo_nascita_ereditato,quota_residuo_riproduttori,quota_scaricata_su_figli").range(da, a)),
        supabase.from("ci_dati_vendita_ingrasso").select("*"),
        supabase.from("ci_residuo_riproduttore").select("animale_id,residuo_rimanente,residuo_uscita_anno"),
      ]);
      for (const [r, cosa] of [[rAnimali, "gli animali"], [rLotti, "i lotti suini"], [rUnita, "i suinetti dei lotti"], [rCosti, "i costi annuali"], [rVendite, "i dati di vendita"], [rResidui, "i riproduttori"]]) {
        if (r.error) throw new Error(`Errore caricando ${cosa}: ${r.error.message}`);
      }
      const lotti = rLotti.data || [], unita = rUnita.data || [];
      // Chi ha un parto registrato è riproduttore anche senza il segno nell'app
      const base = normalizzaAnimali(rAnimali.data || [], lotti, unita);
      const animali = segnaRiproduttoriEffettivi(base, idGenitori(base, lotti));
      const mappaLotti = new Map(lotti.map(l => [l.id, l]));
      const unitaPerLotto = conteggioUnitaPerLotto(unita);
      const { perAnimale, perUnita } = righePerSoggetto(rCosti.data);
      const venditaAnimale = new Map((rVendite.data || []).filter(v => v.animale_id).map(v => [v.animale_id, v]));
      const venditaUnita = new Map((rVendite.data || []).filter(v => v.lotto_id).map(v => [`${v.lotto_id}|${v.unita_nr}`, v]));
      const residuo = new Map((rResidui.data || []).map(r => [r.animale_id, r]));
      // Animali trasferiti: venduti (con fattura attiva che ha la matricola) o scambiati
      const righeVendita = await caricaRigheVendita();

      // Pesi storici (animali e suinetti usciti con carcassa) per stimare il peso di chi è in azienda
      const poolPeso = [
        ...animali.filter(a => a.peso_carcassa > 0 && a.nascita && a.data_uscita).map(a => ({ specie: a.specie, razza: a.razza_calcolata || a.razza, sesso: a.sesso, nascita: a.nascita, data_uscita: a.data_uscita, peso_carcassa: a.peso_carcassa })),
        ...unita.filter(u => u.peso_carcassa > 0 && u.data_uscita).map(u => {
          const l = mappaLotti.get(u.lotto_id);
          return { specie: l?.specie || "suino", razza: l?.razza_madre, sesso: u.sesso, nascita: l?.data_parto, data_uscita: u.data_uscita, peso_carcassa: u.peso_carcassa };
        }).filter(x => x.nascita),
      ];
      const oggi = new Date();
      const pesoEEta = (sp, razza, sesso, nascita, uscito, dataUscita, pesoReale) => {
        if (!nascita) return { eta: null, peso: pesoReale || null, pesoStimato: false };
        const fine = uscito && dataUscita ? new Date(dataUscita) : oggi;
        const eta = round2((fine - new Date(nascita)) / (365.25 * 86400000));
        if (pesoReale > 0) return { eta, peso: parseFloat(pesoReale), pesoStimato: false };
        if (uscito) return { eta, peso: null, pesoStimato: false };
        const s = stimaPesoCarcassaPerEta({ specie: sp, razza, sesso, etaAnniAnimale: eta, animaliUsciti: poolPeso });
        return { eta, peso: s.pesoStimato, pesoStimato: s.pesoStimato != null };
      };
      const valoreVendita = (uscito, peso, pesoStimato, v) =>
        uscito && peso && !pesoStimato && v?.prezzo_vendita_kg_reale ? round2(peso * v.prezzo_vendita_kg_reale) : null;

      const risultati = [];
      for (const a of animali) {
        if (!ETICHETTE_SPECIE[a.specie]) continue;
        const uscito = eUscito(a.stato);
        const costo = costoAnimale({ righe: perAnimale.get(a.id), costoAcquisto: costoAcquistoUnitario({ animale: a }) });
        const { eta, peso, pesoStimato } = pesoEEta(a.specie, a.razza_calcolata || a.razza, a.sesso, a.nascita, uscito, a.data_uscita, a.peso_carcassa);
        const trasferimento = uscitaTrasferimento(a, righeVendita);
        const vendita = trasferimento?.incasso != null ? trasferimento.incasso : valoreVendita(uscito, peso, pesoStimato, venditaAnimale.get(a.id));
        risultati.push({ trasferimento,
          chiave: `a${a.id}`, tipo: "animale", animaleId: a.id, identificativo: a.bdn || a.nome || `animale ${a.id}`,
          specie: a.specie, razza: a.razza_calcolata || a.razza, sesso: a.sesso, provenienza: a.natoConLaMadre ? "Entrato con la madre (figlio della mandria)" : a.daLottoComprato ? `Acquistato nel lotto ${a.daLottoComprato}` : a.provenienza, riproduttore: !!a.riproduttore, riproduttoreDaiParti: !!a.riproduttoreDaiParti,
          stato: a.stato, uscito, dataUscita: a.data_uscita, motivoUscita: a.motivo_uscita, inizio: a.data_ingresso || a.nascita,
          eta, peso, pesoStimato, ...costo, costoAlKg: peso ? round2(costo.totale / peso) : null,
          valoreVendita: vendita, margine: vendita != null ? round2(vendita - costo.totale) : null,
          daRecuperare: a.riproduttore ? (parseFloat(residuo.get(a.id)?.residuo_rimanente) || 0) : null,
        });
      }
      for (const u of unita) {
        // Il suinetto già passato a matricola compare una volta sola, come animale
        if (u.stato === "registrato_individuale") continue;
        const l = mappaLotti.get(u.lotto_id);
        if (!l) continue;
        const uscito = eUscito(u.stato);
        const costo = costoAnimale({ righe: perUnita.get(`${u.lotto_id}|${u.nr}`), costoAcquisto: costoAcquistoUnitario({ unita: u, lotto: l, numeroUnitaLotto: unitaPerLotto.get(u.lotto_id) }) });
        const { eta, peso, pesoStimato } = pesoEEta(l.specie || "suino", l.razza_madre, u.sesso, l.data_parto, uscito, u.data_uscita, u.peso_carcassa);
        const vendita = valoreVendita(uscito, peso, pesoStimato, venditaUnita.get(`${u.lotto_id}|${u.nr}`));
        risultati.push({
          chiave: `u${u.id}`, tipo: "unita", lottoId: u.lotto_id, unitaNr: u.nr,
          identificativo: u.bdn || u.codice_completo || `${l.codice_lotto || l.codice} n. ${u.nr}`,
          specie: l.specie || "suino", razza: l.razza_madre, sesso: u.sesso, provenienza: l.tipo_provenienza === "acquistato" ? "Acquistato" : "Nato in azienda",
          riproduttore: false, stato: u.stato, uscito, dataUscita: u.data_uscita, motivoUscita: u.motivo_uscita, inizio: l.data_parto,
          eta, peso, pesoStimato, ...costo, costoAlKg: peso ? round2(costo.totale / peso) : null,
          valoreVendita: vendita, margine: vendita != null ? round2(vendita - costo.totale) : null, daRecuperare: null,
        });
      }
      setRighe(risultati);
    } catch (err) {
      setErrore(err.message || String(err));
    }
    setCaricando(false);
  }

  const visibili = useMemo(() => {
    const a = parseInt(anno);
    const q = cerca.trim().toLowerCase();
    return righe.filter(r => {
      if (r.specie !== specie) return false;
      if (categoria === "riproduttori" ? !r.riproduttore : r.riproduttore) return false;
      if (statoFiltro === "azienda" && r.uscito) return false;
      if (statoFiltro === "usciti" && !r.uscito) return false;
      if (a) {
        // Presente nell'anno: arrivato (nato o entrato) entro il 31/12 e non uscito prima del 1/1
        if (!r.inizio || r.inizio.slice(0, 10) > `${a}-12-31`) return false;
        if (r.dataUscita && r.dataUscita.slice(0, 10) < `${a}-01-01`) return false;
        if (!r.dataUscita && r.uscito) return false;
      }
      if (q && !String(r.identificativo).toLowerCase().includes(q)) return false;
      return true;
    }).sort((x, y) => (x.uscito - y.uscito) || (x.uscito ? String(y.dataUscita || "").localeCompare(String(x.dataUscita || "")) : y.totale - x.totale));
  }, [righe, specie, categoria, statoFiltro, anno, cerca]);

  const totali = useMemo(() => {
    const s = campo => round2(visibili.reduce((t, r) => t + (r[campo] || 0), 0));
    const venduti = visibili.filter(r => r.valoreVendita != null);
    return {
      capi: visibili.length, totale: s("totale"), messoNellaMandria: s("messoNellaMandria"), daRecuperare: s("daRecuperare"),
      venduti: venduti.length, valoreVendita: round2(venduti.reduce((t, r) => t + r.valoreVendita, 0)),
      costoVenduti: round2(venduti.reduce((t, r) => t + r.totale, 0)), margine: round2(venduti.reduce((t, r) => t + r.margine, 0)),
    };
  }, [visibili]);

  const trasferitiSenzaFattura = righe.filter(r => r.trasferimento?.tipo === "scambio");
  const riproduttoriNonSegnati = righe.filter(r => r.riproduttoreDaiParti);

  function statoTesto(r) {
    if (!r.uscito) return "In azienda";
    const data = r.dataUscita ? new Date(r.dataUscita).toLocaleDateString("it-IT") : "data non indicata";
    return `${r.motivoUscita || r.stato} il ${data}`;
  }

  function esporta() {
    const righeExcel = visibili.map(r => {
      const base = {
        "Animale": r.identificativo, "Specie": ETICHETTE_SPECIE[r.specie], "Razza": r.razza || "", "Sesso": ETICHETTE_SESSO[r.sesso] || r.sesso || "",
        "Provenienza": r.provenienza || "", "Età (anni)": r.eta, "Stato": statoTesto(r), "Uscita per trasferimento": r.trasferimento ? r.trasferimento.testo : "",
        "Costo di acquisto": numeroExcel(r.costoAcquisto), "Costo di nascita": numeroExcel(r.costoNascita), "Mantenimento": numeroExcel(r.mantenimento),
      };
      if (categoria === "riproduttori") return { ...base, "Costo totale sostenuto": numeroExcel(r.totale), "Messo nella mandria (passato ai nati)": numeroExcel(r.messoNellaMandria), "Ancora da recuperare": numeroExcel(r.daRecuperare) };
      return { ...base, "Costo rimasto di riproduttori usciti": numeroExcel(r.costoRimastoRicevuto), "Costo totale": numeroExcel(r.totale),
        "Peso della carcassa (kg)": r.peso, "Peso stimato o reale": r.peso ? (r.pesoStimato ? "stimato" : "reale") : "",
        "Costo al kg di carcassa": numeroExcel(r.costoAlKg), "Valore di vendita": numeroExcel(r.valoreVendita), "Margine": numeroExcel(r.margine) };
    });
    esportaExcel(`RiepilogoCostoAnimali_${ETICHETTE_SPECIE[specie]}_${categoria === "riproduttori" ? "Riproduttori" : "DaMacello"}${anno ? "_" + anno : ""}`, [{ nome: "Animali", righe: righeExcel }]);
  }

  const bottone = (attivo) => ({ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${C.primary}`, background: attivo ? C.primary : "#fff", color: attivo ? "#fff" : C.primary, fontWeight: 700, fontSize: 12, cursor: "pointer" });
  const destra = { ...td, textAlign: "right" };

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Riepilogo Costo Animali</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Tutti gli animali con il loro costo: acquisto o nascita, mantenimento, costo rimasto di riproduttori usciti. Per chi è uscito, valore di vendita e margine. Clicca un animale per aprire la sua scheda.
      </p>

      {riproduttoriNonSegnati.length > 0 && (
        <div style={{ background: "#FFF3CD", color: "#8A6D00", border: "1px solid #F0D98C", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
          <strong>Riproduttori dai parti registrati ma senza il segno «riproduttore» nell'app: {riproduttoriNonSegnati.length}</strong> ({riproduttoriNonSegnati.map(r => r.identificativo).join(", ")}).
          {" "}Il programma li tratta già come riproduttori; nell'app va messo il segno nella loro scheda.
        </div>
      )}

      {trasferitiSenzaFattura.length > 0 && (
        <div style={{ background: "#FDE2D3", color: "#A0440E", border: "1px solid #F0B48F", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
          <strong>Animali trasferiti senza fattura di vendita: {trasferitiSenzaFattura.length}</strong> ({trasferitiSenzaFattura.map(r => r.identificativo).join(", ")}).
          {" "}Il programma li considera scambiati e li valuta peso vivo × prezzo di riforma. Se sono stati venduti, caricare la fattura attiva con la matricola nella descrizione: l'incasso verrà preso da lì.
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
        <div>
          <div style={etichetta}>Specie</div>
          <div style={{ display: "flex", gap: 6 }}>{Object.entries(ETICHETTE_SPECIE).map(([k, v]) => <button key={k} style={bottone(specie === k)} onClick={() => setSpecie(k)}>{v}</button>)}</div>
        </div>
        <div>
          <div style={etichetta}>Categoria</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={bottone(categoria === "macello")} onClick={() => setCategoria("macello")}>Da macello</button>
            <button style={bottone(categoria === "riproduttori")} onClick={() => setCategoria("riproduttori")}>Riproduttori</button>
          </div>
        </div>
        <div>
          <div style={etichetta}>Stato</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={bottone(statoFiltro === "tutti")} onClick={() => setStatoFiltro("tutti")}>Tutti</button>
            <button style={bottone(statoFiltro === "azienda")} onClick={() => setStatoFiltro("azienda")}>In azienda</button>
            <button style={bottone(statoFiltro === "usciti")} onClick={() => setStatoFiltro("usciti")}>Usciti</button>
          </div>
        </div>
        <label style={etichetta}>Presenti nell'anno (vuoto = tutti)
          <input type="number" value={anno} onChange={e => setAnno(e.target.value)} placeholder="es. 2025"
            style={{ display: "block", width: 110, padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, marginTop: 3 }} />
        </label>
        <label style={etichetta}>Cerca matricola o nome
          <input value={cerca} onChange={e => setCerca(e.target.value)}
            style={{ display: "block", width: 180, padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, marginTop: 3 }} />
        </label>
        <button onClick={esporta} disabled={!visibili.length}
          style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}>
          📥 Esporta Excel
        </button>
      </div>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}
      {caricando ? <p style={{ color: C.muted }}>Caricamento...</p> : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <Riquadro titolo="Capi" valore={totali.capi} />
            <Riquadro titolo={categoria === "riproduttori" ? "Costo totale sostenuto" : "Costo totale"} valore={formattaEuro(totali.totale)} />
            {categoria === "riproduttori" ? (
              <>
                <Riquadro titolo="Messo nella mandria (passato ai nati)" valore={formattaEuro(totali.messoNellaMandria)} />
                <Riquadro titolo="Ancora da recuperare" valore={formattaEuro(totali.daRecuperare)} />
              </>
            ) : (
              <>
                <Riquadro titolo={`Venduti con prezzo (${totali.venduti} capi): costo`} valore={formattaEuro(totali.costoVenduti)} />
                <Riquadro titolo="Valore di vendita" valore={formattaEuro(totali.valoreVendita)} />
                <Riquadro titolo="Margine" valore={formattaEuro(totali.margine)} colore={totali.margine < 0 ? C.red : C.green} />
              </>
            )}
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead style={{ background: C.primary, color: "#fff" }}>
                {categoria === "riproduttori" ? (
                  <tr>
                    <th style={th}>Animale</th><th style={th}>Razza</th><th style={th}>Sesso</th><th style={th}>Provenienza</th><th style={th}>Età (anni)</th>
                    <th style={th}>Costo di acquisto o di nascita</th><th style={th}>Mantenimento</th><th style={th}>Costo totale sostenuto</th>
                    <th style={th}>Messo nella mandria (passato ai nati)</th><th style={th}>Ancora da recuperare</th><th style={th}>Stato</th>
                  </tr>
                ) : (
                  <tr>
                    <th style={th}>Animale</th><th style={th}>Razza</th><th style={th}>Sesso</th><th style={th}>Provenienza</th><th style={th}>Età (anni)</th>
                    <th style={th}>Costo di acquisto o di nascita</th><th style={th}>Mantenimento</th><th style={th}>Costo rimasto di riproduttori usciti</th>
                    <th style={th}>Costo totale</th><th style={th}>Peso della carcassa (kg)</th><th style={th}>Costo al kg di carcassa</th>
                    <th style={th}>Valore di vendita</th><th style={th}>Margine</th><th style={th}>Stato</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {visibili.length === 0 && <tr><td colSpan={14} style={{ ...td, color: C.muted }}>Nessun animale con questi filtri.</td></tr>}
                {visibili.map(r => (
                  <tr key={r.chiave} onClick={() => setSelezionato(r)} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}>
                    <td style={{ ...td, fontWeight: 700 }}>{r.identificativo}
                      {r.riproduttoreDaiParti && <div style={{ fontSize: 10, color: "#8A6D00", background: "#FFF3CD", borderRadius: 4, padding: "1px 4px", marginTop: 2, fontWeight: 700 }}>manca il segno nell'app</div>}
                    </td>
                    <td style={td}>{r.razza || "—"}</td>
                    <td style={td}>{ETICHETTE_SESSO[r.sesso] || r.sesso || "—"}</td>
                    <td style={td}>{r.provenienza || "—"}</td>
                    <td style={destra}>{r.eta != null ? formattaNumero(r.eta, 1) : "—"}</td>
                    <td style={destra}>{formattaEuro(r.costoPartenza)}</td>
                    <td style={destra}>{formattaEuro(r.mantenimento)}</td>
                    {categoria === "riproduttori" ? (
                      <>
                        <td style={{ ...destra, fontWeight: 700 }}>{formattaEuro(r.totale)}</td>
                        <td style={destra}>{formattaEuro(r.messoNellaMandria)}</td>
                        <td style={{ ...destra, fontWeight: 700 }}>{formattaEuro(r.daRecuperare)}</td>
                      </>
                    ) : (
                      <>
                        <td style={{ ...destra, ...(r.costoRimastoRicevuto > 0 ? { background: "#FDE2D3", color: "#A0440E" } : {}) }}>{r.costoRimastoRicevuto > 0 ? formattaEuro(r.costoRimastoRicevuto) : "—"}</td>
                        <td style={{ ...destra, fontWeight: 700 }}>{formattaEuro(r.totale)}</td>
                        <td style={destra}>{r.peso ? `${formattaNumero(r.peso, 1)}${r.pesoStimato ? " (stimato)" : ""}` : "—"}</td>
                        <td style={destra}>{r.costoAlKg != null ? formattaEuro(r.costoAlKg) : "—"}</td>
                        <td style={destra}>{r.valoreVendita != null ? formattaEuro(r.valoreVendita) : "—"}</td>
                        <td style={{ ...destra, fontWeight: 700, color: r.margine == null ? C.muted : r.margine >= 0 ? C.green : C.red }}>{r.margine != null ? formattaEuro(r.margine) : "—"}</td>
                      </>
                    )}
                    <td style={{ ...td, color: r.uscito ? C.text : C.muted, whiteSpace: "nowrap" }}>
                      {statoTesto(r)}
                      {r.trasferimento && (
                        <div title={r.trasferimento.testo} style={{ marginTop: 3, padding: "2px 6px", borderRadius: 6, fontSize: 11, fontWeight: 700, whiteSpace: "normal", maxWidth: 260,
                          background: r.trasferimento.tipo === "vendita" ? "#E3F1E4" : "#FDE2D3", color: r.trasferimento.tipo === "vendita" ? C.green : "#A0440E" }}>
                          {r.trasferimento.tipo === "vendita" ? `Venduto: fattura ${r.trasferimento.vendita.numero}` : "Senza fattura di vendita: scambio?"}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selezionato && (selezionato.riproduttore
        ? <SchedaRiproduttore animaleId={selezionato.animaleId} onClose={() => setSelezionato(null)} onSalvato={carica} />
        : <SchedaAnimaleMacello animaleId={selezionato.animaleId} lottoId={selezionato.lottoId} unitaNr={selezionato.unitaNr} onClose={() => setSelezionato(null)} onSalvato={carica} />)}
    </div>
  );
}

function Riquadro({ titolo, valore, colore }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 14px", minWidth: 150 }}>
      <div style={{ fontSize: 11, color: C.muted }}>{titolo}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: colore || C.text }}>{valore}</div>
    </div>
  );
}

const etichetta = { fontSize: 11, color: C.muted, marginBottom: 4 };
const th = { padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700 };
const td = { padding: "7px 10px" };
