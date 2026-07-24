import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, formattaEuro, formattaNumero, round2, fetchAllPages } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { categoriaEtàExp, categoriaContabileExp } from "./motoreUba";

export default function SchedaAnimale({ ricercaIniziale, onRicercaConsumata }) {
  const [ricerca, setRicerca] = useState(ricercaIniziale || "");
  const [risultatiRicerca, setRisultatiRicerca] = useState([]);
  const [cercando, setCercando] = useState(false);
  const [selezionato, setSelezionato] = useState(null); // { tipo:"animale"|"lotto", ...dati }
  const [storicoCosto, setStoricoCosto] = useState(null);
  const [caricandoStorico, setCaricandoStorico] = useState(false);
  const [traghettando, setTraghettando] = useState(false);
  const [dettagliAggiuntivi, setDettagliAggiuntivi] = useState(null);

  useEffect(() => {
    if (ricercaIniziale) {
      setRicerca(ricercaIniziale);
      cerca(ricercaIniziale);
      if (onRicercaConsumata) onRicercaConsumata();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ricercaIniziale]);

  async function cerca(termine) {
    const q = (termine ?? ricerca).trim();
    if (!q) return;
    setCercando(true);
    setSelezionato(null);
    try {
      const { data: animaliTrovati, error: eA } = await supabase
        .from("animali").select("id,bdn,nome,specie,razza,sesso,stato,nascita,data_ingresso,data_uscita,motivo_uscita,riproduttore,prezzo_acquisto,provenienza,peso_nascita,peso_attuale,peso_vivo_uscita,peso_carcassa,resa_percent,padre_id,madre_id")
        .or(`bdn.ilike.%${q}%,nome.ilike.%${q}%`).limit(20);
      if (eA) throw new Error(eA.message);

      const { data: unitaTrovate, error: eU } = await supabase
        .from("suini_lotto").select("id,lotto_id,nr,codice_completo,bdn,matricola,stato")
        .or(`codice_completo.ilike.%${q}%,matricola.ilike.%${q}%`).limit(20);
      if (eU) throw new Error(eU.message);

      let unitaConLotto = [];
      if (unitaTrovate && unitaTrovate.length > 0) {
        const idLotti = [...new Set(unitaTrovate.map(u => u.lotto_id))];
        const { data: lottiRel } = await supabase.from("lotti_suini").select("id, codice_lotto, codice, prezzo_acquisto, tipo_provenienza, nati_totali").in("id", idLotti);
        const mappaLotti = new Map((lottiRel || []).map(l => [l.id, l]));
        unitaConLotto = unitaTrovate.map(u => ({ ...u, lotto: mappaLotti.get(u.lotto_id) }));
      }

      setRisultatiRicerca([
        ...(animaliTrovati || []).map(a => ({ tipo: "animale", ...a })),
        ...unitaConLotto.map(u => ({ tipo: "lotto", ...u })),
      ]);
    } catch (err) {
      alert(`⚠️ Errore nella ricerca:\n\n${err.message}`);
    }
    setCercando(false);
  }

  async function selezionaEd(item) {
    setSelezionato(item);
    setCaricandoStorico(true);
    setStoricoCosto(null);
    setDettagliAggiuntivi(null);
    try {
      let query = supabase.from("ci_costo_animale_annuale").select("*").order("anno");
      if (item.tipo === "animale") query = query.eq("animale_id", item.id);
      else query = query.eq("lotto_id", item.lotto_id).eq("unita_nr", item.nr);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      setStoricoCosto(numerizzaCampi(data || [], ["uba_giorni", "costo_mantenimento", "costo_nascita_ereditato", "quota_scaricata_su_figli", "costo_totale_anno"]));

      if (item.tipo === "animale") {
        const { data: completo } = await supabase.from("animali")
          .select("data_ingresso,motivo_uscita,peso_nascita,peso_attuale,peso_vivo_uscita,peso_carcassa,resa_percent,padre_id,madre_id")
          .eq("id", item.id).maybeSingle();

        let padre = null, madre = null;
        if (completo?.padre_id || completo?.madre_id) {
          const { data: genitori } = await supabase.from("animali").select("id,bdn,nome")
            .in("id", [completo.padre_id, completo.madre_id].filter(Boolean));
          padre = (genitori || []).find(g => g.id === completo.padre_id) || null;
          madre = (genitori || []).find(g => g.id === completo.madre_id) || null;
        }

        let residuo = null, figliPerAnno = [];
        if (item.riproduttore) {
          const { data: r } = await supabase.from("ci_residuo_riproduttore").select("*").eq("animale_id", item.id).maybeSingle();
          if (r) residuo = numerizzaCampi([r], ["residuo_totale", "residuo_rimanente", "conto_sospeso", "valore_realizzo_stimato", "valore_realizzo_reale"])[0];
          const { data: figli } = await supabase.from("animali").select("nascita").or(`padre_id.eq.${item.id},madre_id.eq.${item.id}`);
          const conteggi = {};
          (figli || []).forEach(f => { if (f.nascita) { const a = new Date(f.nascita).getFullYear(); conteggi[a] = (conteggi[a] || 0) + 1; } });
          figliPerAnno = Object.entries(conteggi).sort((a, b) => a[0] - b[0]).map(([anno, n]) => ({ anno, n }));
        }

        setDettagliAggiuntivi({ ...completo, padre, madre, residuo, figliPerAnno });
      }
    } catch (err) {
      alert(`⚠️ Errore nel caricamento dello storico costo:\n\n${err.message}`);
    }
    setCaricandoStorico(false);
  }

  // Costo iniziale: prezzo di acquisto (se l'animale/lotto è stato acquistato) — se nato in
  // azienda, il suo costo di nascita è già dentro lo storico sopra (costo_nascita_ereditato),
  // quindi qui non si aggiunge nulla per non contare due volte lo stesso costo.
  const costoIniziale = (() => {
    if (!selezionato) return 0;
    if (selezionato.tipo === "animale") return selezionato.prezzo_acquisto || 0;
    const lotto = selezionato.lotto;
    if (lotto?.tipo_provenienza === "acquistato" && lotto.prezzo_acquisto) {
      const nTotale = lotto.nati_totali || 1;
      return round2(lotto.prezzo_acquisto / nTotale);
    }
    return 0;
  })();

  const totaleCumulato = (storicoCosto ? storicoCosto.reduce((s, r) => s + (r.costo_totale_anno || 0), 0) : 0) + costoIniziale;

  // Età (da nascita) e permanenza in azienda (da ingresso) — due date diverse, non vanno confuse
  const datiTempo = (() => {
    if (!selezionato || selezionato.tipo !== "animale" || !selezionato.nascita) return null;
    const oggi = new Date();
    const dataFine = selezionato.data_uscita ? new Date(selezionato.data_uscita) : oggi;
    const nascita = new Date(selezionato.nascita);
    const ingresso = dettagliAggiuntivi?.data_ingresso ? new Date(dettagliAggiuntivi.data_ingresso) : nascita;

    const giorniEta = Math.round((dataFine - nascita) / 86400000);
    const giorniPermanenza = Math.round((dataFine - ingresso) / 86400000);
    const aAnniMesi = giorni => {
      const anni = Math.floor(giorni / 365.25);
      const mesi = Math.round((giorni - anni * 365.25) / 30.44);
      return `${anni} ann${anni === 1 ? "o" : "i"} e ${mesi} mes${mesi === 1 ? "e" : "i"}`;
    };
    return {
      giorniEta, giorniPermanenza,
      etaAnniMesi: aAnniMesi(giorniEta), permanenzaAnniMesi: aAnniMesi(giorniPermanenza),
      categoriaEta: categoriaEtàExp(selezionato.specie, 0, giorniEta),
    };
  })();

  async function traghettaCostiLottoBDN() {
    if (!window.confirm("Cerca tutti i suinetti passati da lotto ad animale individuale (BDN assegnato) e trasferisce i loro costi già calcolati (mantenimento, nascita ereditata) dal lotto al nuovo animale. Procedere?")) return;
    setTraghettando(true);
    try {
      const { data: unitaTrasferite, error: eU } = await fetchAllPages((da, a) => supabase
        .from("suini_lotto").select("id,lotto_id,nr,bdn").eq("stato", "registrato_individuale").not("bdn", "is", null).range(da, a));
      if (eU) throw new Error(eU.message);
      if (!unitaTrasferite || unitaTrasferite.length === 0) {
        alert("Nessuna unità di lotto risulta ancora trasferita a BDN individuale.");
        setTraghettando(false);
        return;
      }

      let righeTraghettate = 0, fuse = 0, animaliNonTrovati = 0;
      for (const unita of unitaTrasferite) {
        const { data: animale } = await supabase.from("animali").select("id").eq("bdn", unita.bdn).maybeSingle();
        if (!animale) { animaliNonTrovati++; continue; }

        const { data: righeLotto } = await supabase.from("ci_costo_animale_annuale").select("*")
          .eq("lotto_id", unita.lotto_id).eq("unita_nr", unita.nr);
        if (!righeLotto || righeLotto.length === 0) continue;

        for (const riga of righeLotto) {
          const { data: rigaEsistente } = await supabase.from("ci_costo_animale_annuale").select("*")
            .eq("animale_id", animale.id).eq("anno", riga.anno).maybeSingle();

          if (rigaEsistente) {
            await supabase.from("ci_costo_animale_annuale").update({
              uba_giorni: round2((parseFloat(rigaEsistente.uba_giorni) || 0) + (parseFloat(riga.uba_giorni) || 0)),
              costo_mantenimento: round2((parseFloat(rigaEsistente.costo_mantenimento) || 0) + (parseFloat(riga.costo_mantenimento) || 0)),
              costo_nascita_ereditato: round2((parseFloat(rigaEsistente.costo_nascita_ereditato) || 0) + (parseFloat(riga.costo_nascita_ereditato) || 0)),
              quota_scaricata_su_figli: round2((parseFloat(rigaEsistente.quota_scaricata_su_figli) || 0) + (parseFloat(riga.quota_scaricata_su_figli) || 0)),
              costo_totale_anno: round2((parseFloat(rigaEsistente.costo_totale_anno) || 0) + (parseFloat(riga.costo_totale_anno) || 0)),
            }).eq("id", rigaEsistente.id);
            await supabase.from("ci_costo_animale_annuale").delete().eq("id", riga.id);
            fuse++;
          } else {
            await supabase.from("ci_costo_animale_annuale").update({
              animale_id: animale.id, lotto_id: null, unita_nr: null,
            }).eq("id", riga.id);
          }
          righeTraghettate++;
        }
      }

      alert(`✓ Traghettate ${righeTraghettate} righe di costo (${fuse} fuse con costi già esistenti sull'animale).${animaliNonTrovati > 0 ? ` ${animaliNonTrovati} unità con BDN non trovato in anagrafica, saltate.` : ""}`);
    } catch (err) {
      alert(`⚠️ Errore nel traghettamento:\n\n${err.message}`);
    }
    setTraghettando(false);
  }

  function esporta() {
    const righeExcel = (storicoCosto || []).map(r => ({
      "Anno": r.anno, "UBA-giorni": numeroExcel(r.uba_giorni), "Categoria": r.categoria_contabile,
      "Costo mantenimento": numeroExcel(r.costo_mantenimento), "Costo nascita ereditato": numeroExcel(r.costo_nascita_ereditato),
      "Scaricato sui figli": numeroExcel(r.quota_scaricata_su_figli), "Totale anno": numeroExcel(r.costo_totale_anno),
    }));
    const nome = selezionato.tipo === "animale" ? (selezionato.bdn || selezionato.nome) : (selezionato.codice_completo || selezionato.matricola);
    esportaExcel(`SchedaAnimale_${nome}`, [
      { nome: "Riepilogo", righe: [{ "Costo iniziale (acquisto)": numeroExcel(costoIniziale), "Valore Complessivo": numeroExcel(totaleCumulato) }] },
      { nome: "Storico Costo", righe: righeExcel },
    ]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Scheda Animale</h1>
        <button onClick={traghettaCostiLottoBDN} disabled={traghettando}
          style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {traghettando ? "Traghettamento..." : "🔄 Traghetta costi lotto→BDN"}
        </button>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Cerca per BDN o nome (anche unità di lotto suini) per vedere lo storico costo anno per anno e il totale cumulato.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={ricerca} onChange={e => setRicerca(e.target.value)}
          onKeyDown={e => e.key === "Enter" && cerca()}
          placeholder="BDN, nome, o codice unità (es. IT058990123456, BELLA, L2501CN03)"
          style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14 }} />
        <button onClick={() => cerca()} disabled={cercando}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {cercando ? "..." : "🔍 Cerca"}
        </button>
      </div>

      {risultatiRicerca.length > 0 && !selezionato && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 20 }}>
          {risultatiRicerca.map(item => (
            <div key={`${item.tipo}-${item.id}`} onClick={() => selezionaEd(item)}
              style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
              <strong>{item.tipo === "animale" ? (item.bdn || item.nome) : (item.codice_completo || item.matricola)}</strong>
              {item.tipo === "animale" && <span style={{ color: C.muted, fontSize: 12 }}> — {item.nome} · {item.specie} · {item.razza}</span>}
              {item.tipo === "lotto" && <span style={{ color: C.muted, fontSize: 12 }}> — unità di lotto {item.lotto?.codice_lotto || item.lotto?.codice}</span>}
            </div>
          ))}
        </div>
      )}

      {risultatiRicerca.length === 0 && ricerca && !cercando && !selezionato && (
        <p style={{ color: C.muted }}>Nessun risultato per "{ricerca}".</p>
      )}

      {selezionato && (
        <>
          <button onClick={() => { setSelezionato(null); setStoricoCosto(null); }}
            style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: C.muted, cursor: "pointer", marginBottom: 16 }}>
            ← Nuova ricerca
          </button>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.primary }}>
                  {selezionato.tipo === "animale" ? (selezionato.bdn || selezionato.nome) : (selezionato.codice_completo || selezionato.matricola)}
                </div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                  {selezionato.tipo === "animale"
                    ? `${selezionato.nome || "—"} · ${selezionato.specie} · ${selezionato.razza || "—"} · ${selezionato.sesso || "—"}`
                    : `Unità di lotto ${selezionato.lotto?.codice_lotto || selezionato.lotto?.codice}`}
                </div>
              </div>
              {selezionato.tipo === "animale" && (() => {
                const cat = categoriaContabileExp({ stato: selezionato.stato, motivo_uscita: dettagliAggiuntivi?.motivo_uscita, riproduttore: selezionato.riproduttore });
                const nonProduttivo = cat === "IMPRODUTTIVO_USCITO";
                return (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span style={{ background: nonProduttivo ? C.red : C.green, color: "#fff", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>
                      {selezionato.stato ? selezionato.stato.charAt(0).toUpperCase() + selezionato.stato.slice(1) : "—"}
                    </span>
                    {selezionato.riproduttore && (
                      <span style={{ background: C.blue, color: "#fff", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>
                        {selezionato.sesso === "M" ? "Riproduttore" : "Riproduttrice"}
                      </span>
                    )}
                    {selezionato.provenienza === "Acquistato" && !selezionato.prezzo_acquisto && (
                      <span style={{ background: C.red, color: "#fff", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>
                        ⚠️ Manca costo acquisto
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {selezionato.tipo === "animale" && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 10 }}>DATI ANAGRAFICI (informativi — non usati per l'attribuzione dei costi)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "4px 20px", fontSize: 13 }}>
                <RigaInfo label="Nascita" val={selezionato.nascita} />
                <RigaInfo label="Ingresso in azienda" val={dettagliAggiuntivi?.data_ingresso || selezionato.nascita} />
                <RigaInfo label="Uscita" val={selezionato.data_uscita} />
                <RigaInfo label="Motivo uscita" val={dettagliAggiuntivi?.motivo_uscita} />
                {datiTempo && <>
                  <RigaInfo label="Età" val={`${formattaNumero(datiTempo.giorniEta, 0)} giorni (${datiTempo.etaAnniMesi})`} />
                  <RigaInfo label="Categoria età" val={datiTempo.categoriaEta} />
                  <RigaInfo label="Permanenza in azienda" val={`${formattaNumero(datiTempo.giorniPermanenza, 0)} giorni (${datiTempo.permanenzaAnniMesi})`} />
                </>}
                {dettagliAggiuntivi?.padre && <RigaInfo label="Padre" val={dettagliAggiuntivi.padre.bdn || dettagliAggiuntivi.padre.nome} />}
                {dettagliAggiuntivi?.madre && <RigaInfo label="Madre" val={dettagliAggiuntivi.madre.bdn || dettagliAggiuntivi.madre.nome} />}
              </div>
            </div>
          )}

          {selezionato.tipo === "animale" && (dettagliAggiuntivi?.peso_nascita || dettagliAggiuntivi?.peso_attuale || dettagliAggiuntivi?.peso_vivo_uscita) && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 10 }}>PESI (da podereverdeapp.it)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "4px 20px", fontSize: 13 }}>
                {dettagliAggiuntivi?.peso_nascita && <RigaInfo label="Peso nascita" val={`${dettagliAggiuntivi.peso_nascita} kg`} />}
                {dettagliAggiuntivi?.peso_attuale && <RigaInfo label="Peso attuale" val={`${dettagliAggiuntivi.peso_attuale} kg`} />}
                {dettagliAggiuntivi?.peso_vivo_uscita && <RigaInfo label="Peso vivo uscita" val={`${dettagliAggiuntivi.peso_vivo_uscita} kg`} />}
                {dettagliAggiuntivi?.peso_carcassa && <RigaInfo label="Peso carcassa" val={`${dettagliAggiuntivi.peso_carcassa} kg`} />}
                {dettagliAggiuntivi?.resa_percent && <RigaInfo label="Resa" val={`${dettagliAggiuntivi.resa_percent}%`} />}
              </div>
            </div>
          )}

          {selezionato.tipo === "animale" && selezionato.riproduttore && dettagliAggiuntivi?.residuo && (
            <div style={{ background: "#F5F0E8", border: `1.5px solid ${C.accent}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 10 }}>DATI RIPRODUTTORE</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "4px 20px", fontSize: 13, marginBottom: 10 }}>
                <RigaInfo label="Residuo totale da recuperare" val={formattaEuro(dettagliAggiuntivi.residuo.residuo_totale)} />
                <RigaInfo label="Residuo rimanente" val={formattaEuro(dettagliAggiuntivi.residuo.residuo_rimanente)} />
                <RigaInfo label="Conto sospeso" val={formattaEuro(dettagliAggiuntivi.residuo.conto_sospeso)} />
                <RigaInfo label="Valore realizzo stimato" val={formattaEuro(dettagliAggiuntivi.residuo.valore_realizzo_stimato)} />
                {dettagliAggiuntivi.residuo.conguaglio_applicato && (
                  <RigaInfo label="Valore realizzo reale (conguagliato)" val={formattaEuro(dettagliAggiuntivi.residuo.valore_realizzo_reale)} />
                )}
              </div>
              {dettagliAggiuntivi.figliPerAnno.length > 0 && (
                <div style={{ fontSize: 12, color: C.text }}>
                  <strong>Figli per anno:</strong> {dettagliAggiuntivi.figliPerAnno.map(f => `${f.anno} (${f.n})`).join(", ")}
                </div>
              )}
            </div>
          )}

          {caricandoStorico ? (
            <p style={{ color: C.muted }}>Caricamento storico costo...</p>
          ) : (!storicoCosto || storicoCosto.length === 0) && costoIniziale === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <p style={{ color: C.muted, margin: 0 }}>Nessun costo ancora calcolato per questo animale — usa "Report Costi" per l'anno di interesse, poi salva il calcolo.</p>
            </div>
          ) : (
            <>
              {storicoCosto && storicoCosto.length > 0 && (
                <button onClick={esporta}
                  style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 16 }}>
                  📥 Esporta Excel
                </button>
              )}
              {costoIniziale > 0 && (
                <div style={{ background: "#F5F0E8", borderRadius: 10, padding: "10px 16px", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, color: C.text }}>
                    {selezionato.tipo === "animale" ? "Costo di acquisto" : "Costo di acquisto (quota pro-capite del lotto)"}
                  </span>
                  <span style={{ fontWeight: 700 }}>{formattaEuro(costoIniziale)}</span>
                </div>
              )}
              {storicoCosto && storicoCosto.length > 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
                  <table style={{ width: "100%", fontSize: 13 }}>
                    <thead style={{ background: C.primary, color: "#fff" }}>
                      <tr>
                        <th style={th}>Anno</th><th style={th}>UBA-giorni</th><th style={th}>Categoria</th>
                        <th style={th}>Costo mantenimento</th><th style={th}>Costo nascita ereditato</th>
                        <th style={th}>Scaricato sui figli</th><th style={th}>Totale anno</th>
                      </tr>
                    </thead>
                    <tbody>
                      {storicoCosto.map(r => (
                        <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                          <td style={td}>{r.anno}</td>
                          <td style={{ ...td, textAlign: "right" }}>{formattaNumero(r.uba_giorni, 1)}</td>
                          <td style={td}>{r.categoria_contabile}</td>
                          <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.costo_mantenimento)}</td>
                          <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.costo_nascita_ereditato)}</td>
                          <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.quota_scaricata_su_figli)}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(r.costo_totale_anno)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ background: C.primary + "15", borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, color: C.primary }}>VALORE COMPLESSIVO (costo iniziale + tutti gli anni)</span>
                <span style={{ fontWeight: 800, fontSize: 18, color: C.primary }}>{formattaEuro(totaleCumulato)}</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function RigaInfo({ label, val }) {
  if (!val) return null;
  return (
    <div>
      <span style={{ color: C.muted }}>{label}: </span>
      <strong>{val}</strong>
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700 };
const td = { padding: "6px 10px", fontSize: 12 };
