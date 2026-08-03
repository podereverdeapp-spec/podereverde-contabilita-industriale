import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, round2, formattaEuro, fetchAllPages } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { calcolaResiduoIniziale, calcolaPianoScarico, calcolaValoreRealizzoStimato, calcolaValoreRealizzoReale, calcolaConguaglio } from "./motoreRiproduttori";
import SchedaRiproduttore from "./SchedaRiproduttore";

export default function ReportRiproduttori() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [elaborando, setElaborando] = useState(false);
  const [riproduttori, setRiproduttori] = useState(null);
  const [parametri, setParametri] = useState(null);
  const [provenienzeEspanse, setProvenienzeEspanse] = useState(new Set());
  const [specieEspanse, setSpecieEspanse] = useState(new Set());
  const [animaleSelezionato, setAnimaleSelezionato] = useState(null);

  function toggleProvenienza(p) {
    setProvenienzeEspanse(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; });
  }
  function toggleSpecie(chiave) {
    setSpecieEspanse(prev => { const n = new Set(prev); n.has(chiave) ? n.delete(chiave) : n.add(chiave); return n; });
  }

  useEffect(() => { caricaElenco(); }, []);

  async function caricaElenco() {
    const { data } = await supabase.from("ci_residuo_riproduttore").select("*, animali(bdn, nome, specie, stato, provenienza)").order("updated_at", { ascending: false });
    setRiproduttori(numerizzaCampi(data || [], ["costo_acquisto", "costi_crescita_preriproduttiva", "valore_realizzo_stimato", "valore_realizzo_reale", "residuo_totale", "residuo_rimanente", "conto_sospeso"]));
  }

  async function caricaParametri() {
    const { data } = await supabase.from("ci_parametri").select("chiave, valore");
    const mappa = {};
    (data || []).forEach(p => { mappa[p.chiave] = parseFloat(p.valore); });
    return mappa;
  }

  async function elabora() {
    setElaborando(true);
    try {
      const parametriMap = await caricaParametri();
      setParametri(parametriMap);

      const { data: tuttiAnimali, error: eA } = await fetchAllPages((da, a) => supabase
        .from("animali").select("id,bdn,nome,specie,razza,razza_calcolata,riproduttore,costo_iniziale,prezzo_acquisto,padre_id,madre_id,nascita,stato,data_uscita,peso_vivo_uscita,peso_carcassa,provenienza").range(da, a));
      if (eA) throw new Error(eA.message);

      const { data: tuttiLotti, error: eL } = await fetchAllPages((da, a) => supabase
        .from("lotti_suini").select("id,padre_id,madre_id,data_parto,codice_lotto,codice,tipo_provenienza").range(da, a));
      if (eL) throw new Error(eL.message);
      const { data: tutteUnita, error: eU } = await fetchAllPages((da, a) => supabase
        .from("suini_lotto").select("id,lotto_id,nr").range(da, a));
      if (eU) throw new Error(eU.message);
      const mappaLottiPerId = new Map((tuttiLotti || []).map(l => [l.id, l]));

      const { data: prezziRiforma } = await supabase.from("prezzi_riforma").select("*");
      const etaMinimaAnni = parametriMap.eta_minima_calcolo_peso_storico || 3;

      const riproduttoriAttivi = (tuttiAnimali || []).filter(a => a.riproduttore);
      if (riproduttoriAttivi.length === 0) {
        alert("Nessun animale marcato come riproduttore in anagrafica.");
        setElaborando(false);
        return;
      }

      let elaborati = 0, figliAggiornati = 0;

      for (const rip of riproduttoriAttivi) {
        // Figli di questo riproduttore: sia animali individuali (padre_id/madre_id su animali)
        // sia unità di lotto suini (padre_id/madre_id sono sul LOTTO, non sulla singola unità) —
        // prima di questa correzione i secondi venivano ignorati, perdendo il costo di nascita
        // per ogni suinetto ancora privo di BDN individuale.
        const figli = (tuttiAnimali || []).filter(a => (a.padre_id === rip.id || a.madre_id === rip.id) && a.provenienza === "Nato in azienda");
        const unitaFiglie = (tutteUnita || []).filter(u => {
          const lotto = mappaLottiPerId.get(u.lotto_id);
          return lotto && lotto.tipo_provenienza !== "acquistato" && (lotto.padre_id === rip.id || lotto.madre_id === rip.id);
        }).map(u => ({ ...u, nascita: mappaLottiPerId.get(u.lotto_id)?.data_parto, tipo: "lotto" }));

        const figliDellAnno = figli.filter(f => f.nascita && new Date(f.nascita).getFullYear() === anno);
        const unitaFiglieDellAnno = unitaFiglie.filter(u => u.nascita && new Date(u.nascita).getFullYear() === anno);
        const numeroFigliTotaleAnno = figliDellAnno.length + unitaFiglieDellAnno.length;

        const anniNascitaTutti = [
          ...figli.filter(f => f.nascita).map(f => new Date(f.nascita).getFullYear()),
          ...unitaFiglie.filter(u => u.nascita).map(u => new Date(u.nascita).getFullYear()),
        ];
        const primoAnnoRiproduzione = anniNascitaTutti.length > 0 ? Math.min(...anniNascitaTutti) : anno;

        // Costi di crescita pre-riproduttiva: somma costo_mantenimento negli anni prima del primo figlio
        const { data: costiPreRiprod } = await supabase
          .from("ci_costo_animale_annuale").select("costo_mantenimento, anno")
          .eq("animale_id", rip.id).lt("anno", primoAnnoRiproduzione);
        const costiCrescita = (numerizzaCampi(costiPreRiprod || [], ["costo_mantenimento"])).reduce((s, r) => s + (r.costo_mantenimento || 0), 0);

        // Trovo o creo il record di residuo per questo riproduttore
        const { data: esistente } = await supabase.from("ci_residuo_riproduttore").select("*").eq("animale_id", rip.id).maybeSingle();

        let residuoRecord = esistente ? numerizzaCampi([esistente], ["costo_acquisto", "costi_crescita_preriproduttiva", "valore_realizzo_stimato", "residuo_totale", "residuo_rimanente", "conto_sospeso"])[0] : null;

        if (!residuoRecord) {
          const razzaRip = rip.razza_calcolata || rip.razza;
          const realizzo = calcolaValoreRealizzoStimato({
            specie: rip.specie, razza: razzaRip, animaliUsciti: tuttiAnimali || [],
            prezziRiforma: prezziRiforma || [], etaMinimaAnni,
          });
          // Uso la valutazione "vivo" come stima prudenziale di default (di norma la più bassa
          // delle due) — quando il riproduttore uscirà davvero, si userà il valore reale.
          const valoreRealizzoStimato = Math.min(
            realizzo.valutazioneVivo || Infinity,
            realizzo.valutazioneCarcassa || Infinity
          );
          const valoreRealizzoFinale = Number.isFinite(valoreRealizzoStimato) ? valoreRealizzoStimato : 0;

          const residuoTotale = calcolaResiduoIniziale({
            // Due sole fonti possibili per il costo di partenza, mai mescolate: costo di
            // acquisto (prezzo_acquisto, per gli "Acquistato") oppure costo di nascita
            // (costo_iniziale, per i "Nato in azienda" — valorizzato da podereverdeapp.it
            // alla nascita). Quale delle due si guarda dipende SOLO dalla provenienza.
            costoAcquisto: rip.provenienza === "Nato in azienda" ? (rip.costo_iniziale || 0) : (rip.prezzo_acquisto || 0),
            costiCrescitaPreRiproduttiva: costiCrescita,
            valoreRealizzoStimato: valoreRealizzoFinale,
          });
          const chiaveVita = `vita_produttiva_attesa_${rip.specie === "bovino" ? "bovini" : rip.specie === "suino" ? "suini" : "ovini"}`;
          const vitaAttesa = parametriMap[chiaveVita] || 5;

          const { data: nuovo, error: eIns } = await supabase.from("ci_residuo_riproduttore").insert([{
            animale_id: rip.id, specie: rip.specie,
            costo_acquisto: rip.provenienza === "Nato in azienda" ? (rip.costo_iniziale || 0) : (rip.prezzo_acquisto || 0),
            costi_crescita_preriproduttiva: costiCrescita, valore_realizzo_stimato: valoreRealizzoFinale,
            residuo_totale: residuoTotale, residuo_rimanente: residuoTotale,
            vita_produttiva_attesa_anni: vitaAttesa, anno_inizio_riproduzione: primoAnnoRiproduzione, conto_sospeso: 0,
          }]).select().single();
          if (eIns) throw new Error(`Errore creando residuo per ${rip.bdn}: ${eIns.message}`);
          residuoRecord = numerizzaCampi([nuovo], ["costo_acquisto", "costi_crescita_preriproduttiva", "valore_realizzo_stimato", "residuo_totale", "residuo_rimanente", "conto_sospeso"])[0];
        }

        if (anno < residuoRecord.anno_inizio_riproduzione) continue; // non ancora riproduttore in quell'anno

        const anniProduttiviResiduiAllInizioAnno = residuoRecord.vita_produttiva_attesa_anni - (anno - residuoRecord.anno_inizio_riproduzione);
        const piano = calcolaPianoScarico({
          residuoRimanentePrimaDellAnno: residuoRecord.residuo_rimanente,
          anniProduttiviResiduiAllInizioAnno,
          numeroFigliAnno: numeroFigliTotaleAnno,
        });

        await supabase.from("ci_scarico_riproduttore_annuale").delete().eq("residuo_riproduttore_id", residuoRecord.id).eq("anno", anno);
        await supabase.from("ci_scarico_riproduttore_annuale").insert([{
          residuo_riproduttore_id: residuoRecord.id, anno,
          quota_annuale_dovuta: piano.quotaAnnualeDovuta, conto_sospeso_utilizzato: 0,
          totale_scaricato_anno: piano.totaleScaricatoAnno, n_figli_anno: numeroFigliTotaleAnno, quota_per_figlio: piano.quotaPerFiglio,
        }]);

        await supabase.from("ci_residuo_riproduttore").update({
          residuo_rimanente: piano.residuoRimanenteDopo, updated_at: new Date().toISOString(),
        }).eq("id", residuoRecord.id);

        // Aggiorno il costo_nascita_ereditato dei figli dell'anno (sommando, per il caso di 2 genitori riproduttori)
        for (const figlio of figliDellAnno) {
          const { data: costoEsistente } = await supabase.from("ci_costo_animale_annuale").select("id, costo_nascita_ereditato, costo_mantenimento, costo_totale_anno")
            .eq("animale_id", figlio.id).eq("anno", anno).maybeSingle();
          if (costoEsistente) {
            const nuovoNascita = round2((parseFloat(costoEsistente.costo_nascita_ereditato) || 0) + piano.quotaPerFiglio);
            const nuovoTotale = round2((parseFloat(costoEsistente.costo_mantenimento) || 0) + nuovoNascita);
            await supabase.from("ci_costo_animale_annuale").update({ costo_nascita_ereditato: nuovoNascita, costo_totale_anno: nuovoTotale }).eq("id", costoEsistente.id);
            figliAggiornati++;
          }
        }
        // Stesso aggiornamento per le unità di lotto figlie (chiave lotto_id+unita_nr, non animale_id)
        for (const unita of unitaFiglieDellAnno) {
          const { data: costoEsistente } = await supabase.from("ci_costo_animale_annuale").select("id, costo_nascita_ereditato, costo_mantenimento, costo_totale_anno")
            .eq("lotto_id", unita.lotto_id).eq("unita_nr", unita.nr).eq("anno", anno).maybeSingle();
          if (costoEsistente) {
            const nuovoNascita = round2((parseFloat(costoEsistente.costo_nascita_ereditato) || 0) + piano.quotaPerFiglio);
            const nuovoTotale = round2((parseFloat(costoEsistente.costo_mantenimento) || 0) + nuovoNascita);
            await supabase.from("ci_costo_animale_annuale").update({ costo_nascita_ereditato: nuovoNascita, costo_totale_anno: nuovoTotale }).eq("id", costoEsistente.id);
            figliAggiornati++;
          }
        }

        // Aggiorno quota_scaricata_su_figli sul riproduttore stesso, per l'anno
        const { data: costoRipEsistente } = await supabase.from("ci_costo_animale_annuale").select("id").eq("animale_id", rip.id).eq("anno", anno).maybeSingle();
        if (costoRipEsistente) {
          await supabase.from("ci_costo_animale_annuale").update({ quota_scaricata_su_figli: piano.totaleScaricatoAnno }).eq("id", costoRipEsistente.id);
        }

        elaborati++;
      }

      alert(`✓ Elaborati ${elaborati} riproduttori per l'anno ${anno}. Aggiornato il costo di nascita per ${figliAggiornati} figli (di quelli con costo già calcolato per quest'anno — per gli altri, ricalcola Report Costi prima).`);
      caricaElenco();
    } catch (err) {
      alert(`⚠️ Errore nell'elaborazione:\n\n${err.message}`);
    }
    setElaborando(false);
  }

  async function applicaConguagli() {
    setElaborando(true);
    try {
      const { data: residuiDaConguagliare, error: eR } = await supabase
        .from("ci_residuo_riproduttore").select("*, animali(id,bdn,specie,razza,razza_calcolata,stato,data_uscita,motivo_uscita,peso_vivo_uscita,peso_carcassa,padre_id,madre_id)")
        .eq("conguaglio_applicato", false);
      if (eR) throw new Error(eR.message);

      const daConguagliare = (residuiDaConguagliare || []).filter(r => r.animali && r.animali.stato !== "attivo" && r.animali.data_uscita);
      if (daConguagliare.length === 0) {
        alert("Nessun riproduttore uscito ancora da conguagliare.");
        setElaborando(false);
        return;
      }

      const { data: prezziRiforma } = await supabase.from("prezzi_riforma").select("*");
      const { data: tuttiAnimali } = await fetchAllPages((da, a) => supabase.from("animali").select("id,padre_id,madre_id,nascita,provenienza").range(da, a));
      const { data: tuttiLotti } = await fetchAllPages((da, a) => supabase.from("lotti_suini").select("id,padre_id,madre_id,data_parto,tipo_provenienza").range(da, a));
      const { data: tutteUnita } = await fetchAllPages((da, a) => supabase.from("suini_lotto").select("id,lotto_id,nr").range(da, a));
      const mappaLottiPerId = new Map((tuttiLotti || []).map(l => [l.id, l]));

      let conguagliati = 0;
      for (const res of daConguagliare) {
        const a = res.animali;
        const razza = a.razza_calcolata || a.razza;
        let prezzo = (prezziRiforma || []).find(p => p.specie === a.specie && p.razza === razza);
        if (!prezzo) prezzo = (prezziRiforma || []).find(p => p.specie === a.specie);

        const valoreReale = calcolaValoreRealizzoReale({
          motivoUscita: a.motivo_uscita, pesoVivoUscita: a.peso_vivo_uscita, pesoCarcassa: a.peso_carcassa,
          prezzoKgVivo: prezzo?.prezzo_kg_vivo, prezzoKgCarcassa: prezzo?.prezzo_kg_carcassa,
        });

        const annoUscita = new Date(a.data_uscita).getFullYear();
        const figliAnnoUscita = (tuttiAnimali || []).filter(f =>
          (f.padre_id === a.id || f.madre_id === a.id) && f.provenienza === "Nato in azienda" &&
          f.nascita && new Date(f.nascita).getFullYear() === annoUscita
        );
        const unitaFiglieAnnoUscita = (tutteUnita || []).filter(u => {
          const lotto = mappaLottiPerId.get(u.lotto_id);
          return lotto && lotto.tipo_provenienza !== "acquistato" && (lotto.padre_id === a.id || lotto.madre_id === a.id) &&
            lotto.data_parto && new Date(lotto.data_parto).getFullYear() === annoUscita;
        });
        const numeroFigliTotaleUscita = figliAnnoUscita.length + unitaFiglieAnnoUscita.length;

        const conguaglio = calcolaConguaglio({
          valoreRealizzoReale: valoreReale, valoreRealizzoStimato: parseFloat(res.valore_realizzo_stimato) || 0,
          numeroFigliAnnoUscita: numeroFigliTotaleUscita,
        });

        if (conguaglio.applicatoAiFigli) {
          for (const figlio of figliAnnoUscita) {
            const { data: costoEsistente } = await supabase.from("ci_costo_animale_annuale").select("id, costo_nascita_ereditato, costo_mantenimento")
              .eq("animale_id", figlio.id).eq("anno", annoUscita).maybeSingle();
            if (costoEsistente) {
              const nuovoNascita = round2((parseFloat(costoEsistente.costo_nascita_ereditato) || 0) + conguaglio.conguaglioPerFiglio);
              const nuovoTotale = round2((parseFloat(costoEsistente.costo_mantenimento) || 0) + nuovoNascita);
              await supabase.from("ci_costo_animale_annuale").update({ costo_nascita_ereditato: nuovoNascita, costo_totale_anno: nuovoTotale }).eq("id", costoEsistente.id);
            }
          }
          for (const unita of unitaFiglieAnnoUscita) {
            const { data: costoEsistente } = await supabase.from("ci_costo_animale_annuale").select("id, costo_nascita_ereditato, costo_mantenimento")
              .eq("lotto_id", unita.lotto_id).eq("unita_nr", unita.nr).eq("anno", annoUscita).maybeSingle();
            if (costoEsistente) {
              const nuovoNascita = round2((parseFloat(costoEsistente.costo_nascita_ereditato) || 0) + conguaglio.conguaglioPerFiglio);
              const nuovoTotale = round2((parseFloat(costoEsistente.costo_mantenimento) || 0) + nuovoNascita);
              await supabase.from("ci_costo_animale_annuale").update({ costo_nascita_ereditato: nuovoNascita, costo_totale_anno: nuovoTotale }).eq("id", costoEsistente.id);
            }
          }
        }

        await supabase.from("ci_residuo_riproduttore").update({
          valore_realizzo_reale: valoreReale, anno_uscita: annoUscita, conguaglio_applicato: true, updated_at: new Date().toISOString(),
        }).eq("id", res.id);

        conguagliati++;
      }

      alert(`✓ Conguaglio applicato per ${conguagliati} riproduttori usciti.`);
      caricaElenco();
    } catch (err) {
      alert(`⚠️ Errore nel conguaglio:\n\n${err.message}`);
    }
    setElaborando(false);
  }

  function esporta() {
    const righeExcel = riproduttori.map(r => ({
      "BDN/Nome": r.animali?.bdn || r.animali?.nome, "Specie": r.specie, "Stato": r.animali?.stato,
      "Costo acquisto": numeroExcel(r.costo_acquisto), "Costi crescita pre-riproduttiva": numeroExcel(r.costi_crescita_preriproduttiva),
      "Valore realizzo stimato": numeroExcel(r.valore_realizzo_stimato), "Residuo totale": numeroExcel(r.residuo_totale),
      "Residuo rimanente": numeroExcel(r.residuo_rimanente),
      "Vita produttiva attesa (anni)": r.vita_produttiva_attesa_anni, "Anno inizio riproduzione": r.anno_inizio_riproduzione,
      "Conguaglio applicato": r.conguaglio_applicato ? "Sì" : "No", "Valore realizzo reale": numeroExcel(r.valore_realizzo_reale), "Anno uscita": r.anno_uscita,
    }));
    esportaExcel("ReportRiproduttori", [{ nome: "Riproduttori", righe: righeExcel }]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Report Riproduttori</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Residuo da recuperare (acquisto + crescita − valore stimato), ammortizzato sulla vita produttiva attesa e scaricato sui figli nati ogni anno. Se un anno non ha figli, la quota si accumula nel conto sospeso.
      </p>

      <div style={{ background: "#FFF9E6", border: `1.5px solid ${C.accent}`, borderRadius: 10, padding: 12, marginBottom: 20, fontSize: 12, color: C.text }}>
        ⚠️ Esegui prima "Report Costi" per l'anno scelto (e salvalo) — questo passaggio aggiorna il costo di nascita dei figli che hanno già una riga di costo per quell'anno. Il valore di realizzo stimato ora usa il peso medio storico (animali della stessa specie/razza usciti con più di {parametri?.eta_minima_calcolo_peso_storico || 3} anni) × i prezzi di mercato da "prezzi_riforma" — per la stima iniziale si usa prudenzialmente la valutazione più bassa tra vivo e carcassa; il valore reale sostituirà questa stima quando il riproduttore uscirà davvero (conguaglio, non ancora costruito). Il valore di realizzo si calcola una sola volta, alla prima elaborazione di ogni riproduttore.
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Anno</label>
            <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
              style={{ padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, width: 100 }} />
          </div>
          <button onClick={elabora} disabled={elaborando}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {elaborando ? "Elaborazione..." : "🐄 Calcola e scarica sui figli"}
          </button>
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>CONGUAGLIO FINALE (riproduttori usciti davvero)</div>
        <p style={{ fontSize: 12, color: C.muted, marginTop: 0, marginBottom: 10 }}>
          Confronta il valore reale (peso effettivo alla sua uscita × prezzi di mercato) con la stima usata negli anni, e applica la differenza sui figli dell'anno di uscita.
        </p>
        <button onClick={applicaConguagli} disabled={elaborando}
          style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {elaborando ? "Elaborazione..." : "⚖️ Applica conguagli"}
        </button>
      </div>

      {riproduttori && riproduttori.length > 0 && (
        <button onClick={esporta}
          style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 16, display: "block" }}>
          📥 Esporta Excel
        </button>
      )}

      {riproduttori && riproduttori.length > 0 && (
        <TabellaRiproduttoriRaggruppata riproduttori={riproduttori}
          provenienzeEspanse={provenienzeEspanse} toggleProvenienza={toggleProvenienza}
          specieEspanse={specieEspanse} toggleSpecie={toggleSpecie}
          onSelezionaAnimale={id => setAnimaleSelezionato(id)} />
      )}
      {riproduttori && riproduttori.length === 0 && (
        <p style={{ color: C.muted }}>Nessun riproduttore ancora elaborato — usa "Calcola e scarica sui figli".</p>
      )}
      {animaleSelezionato && (
        <SchedaRiproduttore animaleId={animaleSelezionato} onClose={() => setAnimaleSelezionato(null)} onSalvato={caricaElenco} />
      )}
    </div>
  );
}

const ETICHETTE_SPECIE = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };

function TabellaRiproduttoriRaggruppata({ riproduttori, provenienzeEspanse, toggleProvenienza, specieEspanse, toggleSpecie, onSelezionaAnimale }) {
  const gruppiProvenienza = [
    { chiave: "Acquistato", label: "Acquistati" },
    { chiave: "Nato in azienda", label: "Nati in azienda" },
  ];

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      {gruppiProvenienza.map(gp => {
        const righeProvenienza = riproduttori.filter(r => (r.animali?.provenienza || "Acquistato") === gp.chiave);
        if (righeProvenienza.length === 0) return null;
        const provenienzaAperta = provenienzeEspanse.has(gp.chiave);
        return (
          <div key={gp.chiave}>
            <div onClick={() => toggleProvenienza(gp.chiave)}
              style={{ padding: "12px 16px", background: C.primary, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
              <span>{provenienzaAperta ? "▼" : "▶"} {gp.label}</span>
              <span style={{ fontWeight: 400, fontSize: 12 }}>{righeProvenienza.length} riproduttori</span>
            </div>
            {provenienzaAperta && ["bovino", "suino", "ovino"].map(specie => {
              const righeSpecie = righeProvenienza.filter(r => r.specie === specie);
              if (righeSpecie.length === 0) return null;
              const chiaveSpecie = `${gp.chiave}|${specie}`;
              const specieAperta = specieEspanse.has(chiaveSpecie);
              return (
                <div key={specie}>
                  <div onClick={() => toggleSpecie(chiaveSpecie)}
                    style={{ padding: "9px 16px 9px 32px", background: C.bg, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.border}` }}>
                    <span>{specieAperta ? "▼" : "▶"} {ETICHETTE_SPECIE[specie]}</span>
                    <span style={{ fontWeight: 400, fontSize: 12, color: C.muted }}>{righeSpecie.length}</span>
                  </div>
                  {specieAperta && (
                    <table style={{ width: "100%", fontSize: 13 }}>
                      <thead style={{ background: C.primaryLight, color: "#fff" }}>
                        <tr>
                          <th style={th}>Riproduttore</th>
                          <th style={th}>Residuo totale</th><th style={th}>Residuo rimanente</th>
                          <th style={th}>Vita attesa (anni)</th><th style={th}>Valore realizzo stimato</th><th style={th}>Stato</th>
                        </tr>
                      </thead>
                      <tbody>
                        {righeSpecie.map(r => (
                          <tr key={r.id} onClick={() => onSelezionaAnimale(r.animale_id)} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}>
                            <td style={td}>{r.animali?.bdn || r.animali?.nome || "—"}</td>
                            <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.residuo_totale)}</td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(r.residuo_rimanente)}</td>
                            <td style={{ ...td, textAlign: "right" }}>{r.vita_produttiva_attesa_anni}</td>
                            <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.valore_realizzo_stimato)}</td>
                            <td style={td}>
                              {r.animali?.stato && r.animali.stato !== "attivo"
                                ? (r.conguaglio_applicato ? <span style={{ color: C.green, fontWeight: 700 }}>✓ Conguagliato ({r.valore_realizzo_reale != null ? formattaEuro(r.valore_realizzo_reale) : "—"} reale)</span> : <span style={{ color: C.accent, fontWeight: 700 }}>Uscito — da conguagliare</span>)
                                : <span style={{ color: C.muted }}>Attivo</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700 };
const td = { padding: "6px 10px", fontSize: 12 };
