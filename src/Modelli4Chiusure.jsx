// Modelli 4 → Modelli 4: chiusi e non chiusi (versione 349, 05/11/2026)
// Sola lettura. Mostra i modelli 4 di uscita da Podere Verde che non si sono chiusi con una fattura,
// letti dal quaderno delle anomalie (codice «M4»), scritti dal database:
//   - controllo storico del 05/11/2026 (modelli 4 dell'app contro le fatture emesse, XML di Aruba);
//   - regola di fine mese, ogni mattina (preavviso due giorni prima della fine del mese di uscita, allarme a fine mese).
// Colori decisi dal Dott. Bizzarri (05/11/2026 ore 14:01): rosso = 2026; arancione = anni precedenti, da controllare;
// azzurro = scambio (fatture da verificare con i commercialisti).
// Il programma non chiude mai queste anomalie: si spengono solo dal database (fattura trovata, chiusura decisa).
import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { fetchAllPages } from "./parsingUtils";
import { dataUscitaDa, AVVIO_CONSEGNE } from "./anomalieEsterne";

const COLORI = {
  rosso:     { fondo: "#FBE1DE", bordo: "#C0392B", testo: "#8B1E14", etichetta: "Rosso — 2026: non chiusi con la fattura" },
  azzurro:   { fondo: "#DDEEF8", bordo: "#2C6E9B", testo: "#1B4A6B", etichetta: "Azzurro — scambio: fatture da verificare con i commercialisti" },
  arancione: { fondo: "#FFF1DC", bordo: "#D4880F", testo: "#7A4A00", etichetta: "Arancione — anni precedenti: da controllare" },
};
const ORDINE_COLORE = { rosso: 0, azzurro: 1, arancione: 2 };
const STATI = { aperta: "Aperta", decisa: "Decisa", ignorata: "Lasciata com'è", risolta: "Chiusa" };

const dataIt = (iso) => { if (!iso) return "—"; const [a, m, g] = String(iso).slice(0, 10).split("-"); return `${g}/${m}/${a}`; };
const quandoIt = (t) => t ? new Date(t).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const specieDa = (d) => { const m = /capi \((bovini|suini|ovini)\)/i.exec(d || ""); return m ? m[1].toLowerCase() : "altro"; };
const numeroDa = (rigaId) => String(rigaId || "").split("|")[0];

const bottone = (attivo, colore = C.primary) => ({
  background: attivo ? colore : "#fff", color: attivo ? "#fff" : colore, border: `1.5px solid ${colore}`,
  borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
});

export default function Modelli4Chiusure() {
  const [righe, setRighe] = useState([]);
  const [chiusure, setChiusure] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [colore, setColore] = useState("");
  const [stato, setStato] = useState("aperta");
  const [specie, setSpecie] = useState("");
  const [cerca, setCerca] = useState("");

  async function carica() {
    setLoading(true); setErrore(null);
    const { data, error } = await fetchAllPages((da, a) =>
      supabase.from("ci_anomalie").select("*").eq("codice", "M4").order("id").range(da, a));
    if (error) { setErrore(error.message); setLoading(false); return; }
    setRighe((data || []).map(x => {
      const uscita = dataUscitaDa(x.descrizione);
      return { ...x, uscita, specie: specieDa(x.descrizione), numero: numeroDa(x.riga_id),
        pregressa: !!uscita && uscita < AVVIO_CONSEGNE };
    }));
    // Le chiusure le vede solo l'amministratore (per gli altri l'elenco arriva vuoto)
    const { data: ch } = await fetchAllPages((da, a) =>
      supabase.from("ci_m4_chiusure").select("id, tipo, modo, annullata_il").order("id").range(da, a));
    const valide = (ch || []).filter(c => !c.annullata_il);
    setChiusure(valide.length ? {
      totale: valide.length,
      fattura: valide.filter(c => c.tipo === "fattura").length,
      scambio: valide.filter(c => c.tipo === "scambio").length,
      nessuna: valide.filter(c => c.tipo !== "fattura" && c.tipo !== "scambio").length,
      aMano: valide.filter(c => c.modo === "a mano").length,
    } : null);
    setLoading(false);
  }
  useEffect(() => { carica(); }, []);

  const conteggi = useMemo(() => {
    const n = { rosso: 0, arancione: 0, azzurro: 0, usciti: 0, pregresse: 0, recenti: 0 };
    for (const r of righe) {
      if (r.stato !== "aperta") continue;
      if (n[r.colore] !== undefined) n[r.colore]++;
      if (r.colore === "arancione" && /usciti di sicuro/.test(r.gruppo || "")) n.usciti++;
      if (r.pregressa) n.pregresse++; else n.recenti++;
    }
    return n;
  }, [righe]);

  const visibili = useMemo(() => {
    const t = cerca.trim().toLowerCase();
    return righe
      .filter(r => !stato || r.stato === stato)
      .filter(r => !colore || r.colore === colore)
      .filter(r => !specie || r.specie === specie)
      .filter(r => !t || `${r.titolo} ${r.descrizione} ${r.responsabile}`.toLowerCase().includes(t))
      .sort((a, b) => (ORDINE_COLORE[a.colore] ?? 9) - (ORDINE_COLORE[b.colore] ?? 9)
        || (/usciti di sicuro/.test(b.gruppo || "") - /usciti di sicuro/.test(a.gruppo || ""))
        || String(b.uscita || "").localeCompare(String(a.uscita || "")));
  }, [righe, stato, colore, specie, cerca]);

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Modelli 4: chiusi e non chiusi</h1>
        <button onClick={carica} style={bottone(false)}>↻ Aggiorna</button>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 14, fontSize: 13, lineHeight: 1.55 }}>
        I modelli 4 di uscita da Podere Verde che non si sono chiusi con una fattura, con il motivo e il responsabile.
        Le anomalie del 2026 si spengono da sole, ogni mattina, quando nel programma c'è la fattura con il numero del modello 4 e la stessa specie.
        Le altre restano finché non si decide. Il programma non le chiude mai da solo.
      </p>

      {loading && <div style={{ color: C.muted }}>Caricamento…</div>}
      {errore && <div style={{ background: "#FBE1DE", color: "#8B1E14", padding: 12, borderRadius: 8 }}>Errore nella lettura: {errore}</div>}

      {!loading && !errore && (<>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          {["rosso", "azzurro", "arancione"].map(k => (
            <div key={k} onClick={() => setColore(colore === k ? "" : k)}
              style={{ flex: "1 1 240px", background: COLORI[k].fondo, borderLeft: `6px solid ${COLORI[k].bordo}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer", outline: colore === k ? `2px solid ${COLORI[k].bordo}` : "none" }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: COLORI[k].testo }}>{conteggi[k]}</div>
              <div style={{ fontSize: 13, color: COLORI[k].testo, fontWeight: 700 }}>{COLORI[k].etichetta}</div>
              {k === "arancione" && conteggi.usciti > 0 && <div style={{ fontSize: 12, color: COLORI[k].testo, marginTop: 4 }}>di cui {conteggi.usciti} con capi usciti di sicuro e non fatturati</div>}
            </div>
          ))}
        </div>

        <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, lineHeight: 1.55 }}>
          <b>Anomalie aperte: {conteggi.rosso + conteggi.azzurro + conteggi.arancione}</b> — recenti {conteggi.recenti}, pregresse {conteggi.pregresse}.
          <br />
          <b>Pregressa</b> = uscita prima del {dataIt(AVVIO_CONSEGNE)}, quando la finestra delle consegne dell'app non era ancora in uso: il responsabile non è verificato.
          Dal {dataIt(AVVIO_CONSEGNE)} la consegna mancante (peso della carcassa, cliente, numeri di partita) è di Simone Nardi.
          {chiusure && <><br /><b>Chiusure registrate: {chiusure.totale}</b> — con fattura {chiusure.fattura}, scambio {chiusure.scambio}{chiusure.nessuna ? `, nessuna fattura dovuta ${chiusure.nessuna}` : ""}{chiusure.aMano ? ` (a mano ${chiusure.aMano})` : ""}.</>}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 700 }}>Stato:</span>
          {[["aperta", "Aperte"], ["", "Tutte"], ["decisa", "Decise"], ["ignorata", "Lasciate com'è"], ["risolta", "Chiuse"]].map(([v, l]) => (
            <button key={v || "tutte"} onClick={() => setStato(v)} style={bottone(stato === v)}>{l}</button>
          ))}
          <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 700, marginLeft: 10 }}>Specie:</span>
          {[["", "Tutte"], ["bovini", "Bovini"], ["suini", "Suini"], ["ovini", "Ovini"]].map(([v, l]) => (
            <button key={v || "tutte-sp"} onClick={() => setSpecie(v)} style={bottone(specie === v)}>{l}</button>
          ))}
          <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca numero, matricola, cliente…"
            style={{ marginLeft: "auto", padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, minWidth: 240 }} />
        </div>

        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>{visibili.length} su {righe.length}{colore ? ` · solo ${colore}` : ""}</div>

        {visibili.length === 0 && <div style={{ color: C.muted, padding: 20, textAlign: "center" }}>Nessun modello 4 con questi filtri.</div>}

        {visibili.map(r => {
          const col = COLORI[r.colore] || { fondo: "#fff", bordo: C.border, testo: C.text };
          return (
            <div key={r.id} style={{ background: "#fff", border: `1px solid ${C.border}`, borderLeft: `6px solid ${col.bordo}`, borderRadius: 10, padding: "12px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 14.5, color: C.text }}>{r.titolo}</span>
                <span style={{ background: col.fondo, color: col.testo, borderRadius: 6, padding: "2px 8px", fontSize: 11.5, fontWeight: 700 }}>{r.gruppo || r.colore}</span>
                {r.pregressa && <span style={{ background: "#EEE", color: "#555", borderRadius: 6, padding: "2px 8px", fontSize: 11.5, fontWeight: 700 }}>pregressa</span>}
                <span style={{ marginLeft: "auto", fontSize: 12, color: C.muted }}>{STATI[r.stato] || r.stato}</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: C.text, whiteSpace: "pre-wrap" }}>{r.descrizione}</div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12.5, marginTop: 8 }}>
                <span><b>Uscita:</b> {r.uscita ? dataIt(r.uscita) : "data non leggibile nella descrizione"}</span>
                <span><b>Modello 4:</b> {r.numero}</span>
                <span><b>Responsabile:</b> {r.responsabile || "—"}{r.pregressa && !/non verificato/.test(r.responsabile || "") ? " · pregressa: responsabile non verificato" : ""}</span>
                <span style={{ color: C.muted }}>Rilevata il {quandoIt(r.prima_rilevata_at)}</span>
              </div>
              {r.decisione && <div style={{ fontSize: 12.5, marginTop: 6, color: C.primary }}><b>Decisione:</b> {r.decisione}</div>}
            </div>
          );
        })}
      </>)}
    </div>
  );
}
