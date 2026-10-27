// Versione 312 (richiesta del Dott. Bizzarri del 27/10/2026 ore 10:41): nella sottocartella «Analisi Break Even» la lista dei
// suini usciti nell'app ma che non tornano con le fatture di vendita (senza peso, oppure pesati e non fatturati), mese per mese.
// Si ricalcola da sola ogni volta che si apre: quando Sborchia corregge i dati nell'app, la lista cambia. Sola lettura.
import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { formattaNumero } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { caricaDatiBase } from "./calcoloBreakEven";
import { caricaFattureSuini, confronta, MESI } from "./calcoloUsciteFatture";

const data = d => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const kg = c => formattaNumero(c / 100, 2);
const th = { padding: "6px 8px", textAlign: "left", fontSize: 11.5, background: C.primary, color: "#fff", fontWeight: 700, verticalAlign: "bottom" };
const td = { padding: "5px 8px", borderBottom: `1px solid ${C.border}`, fontSize: 12.5, verticalAlign: "top" };
const num = { ...td, textAlign: "right", whiteSpace: "nowrap" };
const scheda = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 };

export default function SuiniUscitiFatture() {
  const [base, setBase] = useState(null);
  const [righe, setRighe] = useState(null);
  const [errore, setErrore] = useState("");
  const [anno, setAnno] = useState(new Date().getFullYear() - 1);

  useEffect(() => {
    Promise.all([caricaDatiBase(), caricaFattureSuini()]).then(([b, r]) => { setBase(b); setRighe(r); }).catch(e => setErrore(e.message));
  }, []);

  const capi = useMemo(() => {
    if (!base) return [];
    const lotti = new Map((base.g.lotti || []).map(l => [l.id, l]));
    return base.soggetti.filter(s => s.specie === "suino" && s.stato === "macellato").map(s => {
      const lotto = s.tipo === "unita" ? lotti.get(parseInt(s.chiave.slice(2))) : null;
      return { chiave: s.chiave, codice: s.codice, lotto: lotto ? (lotto.codice_lotto || lotto.codice) : null, scheda: s.tipo === "animale" ? s.id : null,
        provenienza: s.acquistato ? "comprato" : s.natoInAzienda ? "nato in azienda" : "—", nascita: s.nascita, sesso: s.sesso, uscita: s.uscita,
        pesoVivo: s.pesoVivo || 0, pesoCarcassa: s.pesoCarcassa || 0, riproduttore: s.riproduttore };
    });
  }, [base]);
  const anni = useMemo(() => [...new Set(capi.filter(c => c.uscita).map(c => parseInt(c.uscita.slice(0, 4))))].sort((a, b) => b - a), [capi]);
  const r = useMemo(() => (righe ? confronta(capi, righe, anno) : null), [capi, righe, anno]);

  function scarica() {
    esportaExcel(`Suini_usciti_e_fatture_${anno}`, [
      { nome: "Mese per mese", righe: r.mesi.map(m => ({ "Mese": MESI[m.mese - 1], "Macellati nell'app": m.capi, "Di cui senza peso": m.senzaPeso, "Chili nell'app": numeroExcel(m.kg / 100),
        "Capi fatturati": m.capiFatturati ?? "", "Chili fatturati": numeroExcel(m.kgFatturati / 100), "Fatture": m.numeri.join(", "), "Esito": m.esito })) },
      { nome: "Senza peso", righe: r.senzaPeso.map((c, i) => ({ "Numero": i + 1, "Uscita nell'app": data(c.uscita), "Capo": c.codice, "Lotto": c.lotto || (c.scheda ? `scheda ${c.scheda}` : ""),
        "Provenienza": c.provenienza, "Nascita": data(c.nascita), "Sesso": c.sesso || "", "Verifica di Sborchia": "" })) },
      { nome: "Pesati non fatturati", righe: r.nonFatturati.map(c => ({ "Capo": c.codice, "Lotto o scheda": c.lotto || (c.scheda ? `scheda ${c.scheda}` : ""), "Provenienza": c.provenienza,
        "Nascita": data(c.nascita), "Sesso": c.sesso || "", "Uscita": data(c.uscita), "Peso vivo": numeroExcel(c.pesoVivo), "Peso della carcassa": numeroExcel(c.kg / 100),
        "Osservazione": c.osservazione, "Verifica di Sborchia": "" })) },
    ]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1250, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Suini usciti e fatture</h1>
      <p style={{ color: C.muted, marginTop: 0, fontSize: 13.5, lineHeight: 1.5 }}>
        Confronto, mese per mese, tra i suini segnati «macellato» nell'app e le fatture di vendita dei suini. Elenca i capi usciti senza peso e i capi pesati
        che non sono in nessuna fattura, da verificare con Sborchia. Si aggiorna da solo: quando i dati nell'app vengono corretti, la lista cambia.
      </p>
      {errore && <div style={{ ...scheda, color: C.red }}>⚠️ {errore}</div>}
      {!r && !errore && <p>Caricamento dei suini e delle fatture…</p>}
      {r && <>
        <div style={{ ...scheda, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 13.5 }}>Anno di uscita</b>
          <select value={anno} onChange={e => setAnno(parseInt(e.target.value))} style={{ padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 14, fontWeight: 700 }}>
            {anni.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <span style={{ fontSize: 13 }}>
            Macellati nell'app: <b>{r.totali.capi}</b> (di cui <b style={{ color: C.red }}>{r.totali.senzaPeso} senza peso</b>), {kg(r.totali.kg)} kg ·
            fatturati: <b>{r.totali.capiFatturati}</b> capi, {kg(r.totali.kgFatturati)} kg ·
            pesati non fatturati: <b style={{ color: C.red }}>{r.nonFatturati.length}</b> capi, {kg(r.totali.kgNonFatturati)} kg
            {r.nonAbbinati.length > 0 && <> · <b style={{ color: C.red }}>{r.nonAbbinati.length} mesi</b> da confrontare solo nei totali</>}
          </span>
          <button onClick={scarica} style={{ marginLeft: "auto", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 14px", fontWeight: 700, fontSize: 13 }}>📥 Scarica Excel</button>
        </div>

        <div style={scheda}>
          <div style={{ fontWeight: 800, color: C.primary, fontSize: 15, marginBottom: 6 }}>1. Mese per mese</div>
          <table style={{ width: "100%" }}>
            <thead><tr>{["Mese", "Macellati nell'app", "Di cui senza peso", "Chili nell'app", "Capi fatturati", "Chili fatturati", "Fatture", "Esito"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{r.mesi.map(m => {
              const torna = m.capi === (m.capiFatturati ?? -1) && m.kg === m.kgFatturati;
              return (<tr key={m.mese}>
                <td style={{ ...td, fontWeight: 700 }}>{MESI[m.mese - 1]}</td><td style={num}>{m.capi}</td><td style={{ ...num, color: m.senzaPeso ? C.red : C.text }}>{m.senzaPeso}</td>
                <td style={num}>{kg(m.kg)}</td><td style={num}>{m.capiFatturati ?? "—"}</td><td style={num}>{kg(m.kgFatturati)}</td>
                <td style={td}>{m.numeri.join(", ") || "—"}</td>
                <td style={{ ...td, color: torna ? C.green : m.esito === "trovati" ? C.text : C.red }}>{torna ? "torna" : m.esito === "trovati" ? "fattura abbinata ai capi pesati; vedere sotto i capi che restano fuori" : m.esito}</td>
              </tr>);
            })}</tbody>
            <tfoot><tr style={{ fontWeight: 800 }}>
              <td style={td}>Totale</td><td style={num}>{r.totali.capi}</td><td style={num}>{r.totali.senzaPeso}</td><td style={num}>{kg(r.totali.kg)}</td>
              <td style={num}>{r.totali.capiFatturati}</td><td style={num}>{kg(r.totali.kgFatturati)}</td><td style={td} colSpan={2}></td>
            </tr></tfoot>
          </table>
        </div>

        <div style={scheda}>
          <div style={{ fontWeight: 800, color: C.primary, fontSize: 15, marginBottom: 6 }}>2. Suini usciti senza peso: {r.senzaPeso.length}</div>
          <p style={{ fontSize: 12.5, color: C.muted, marginTop: 0 }}>Segnati «macellato» senza peso della carcassa. Nel Riepilogo Costi i loro chili sono stimati con il peso medio dell'anno: se non sono stati venduti, il costo al kg risulta più basso del vero.</p>
          {r.senzaPeso.length === 0 ? <p style={{ fontSize: 13, color: C.green }}>Nessuno.</p> : (
            <table style={{ width: "100%" }}>
              <thead><tr>{["Numero", "Uscita nell'app", "Capo", "Lotto o scheda", "Provenienza", "Nascita", "Sesso"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{r.senzaPeso.map((c, i) => (
                <tr key={c.chiave}><td style={num}>{i + 1}</td><td style={td}>{data(c.uscita)}</td><td style={{ ...td, fontWeight: 700 }}>{c.codice}</td>
                  <td style={td}>{c.lotto || (c.scheda ? `scheda ${c.scheda}` : "—")}</td><td style={td}>{c.provenienza}{c.riproduttore ? ", riproduttore" : ""}</td><td style={td}>{data(c.nascita)}</td><td style={td}>{c.sesso || "—"}</td></tr>))}</tbody>
            </table>)}
        </div>

        <div style={scheda}>
          <div style={{ fontWeight: 800, color: C.primary, fontSize: 15, marginBottom: 6 }}>3. Suini pesati ma non fatturati: {r.nonFatturati.length} ({kg(r.totali.kgNonFatturati)} kg)</div>
          <p style={{ fontSize: 12.5, color: C.muted, marginTop: 0 }}>Restano nei calcoli come carne uscita (decisione del 27/10/2026). Riproduttori di riforma, possibili doppioni e pesi uguali nello stesso giorno sono indicati nell'ultima colonna.</p>
          {r.nonFatturati.length === 0 ? <p style={{ fontSize: 13, color: C.green }}>Nessuno.</p> : (
            <table style={{ width: "100%" }}>
              <thead><tr>{["Capo", "Lotto o scheda", "Provenienza", "Nascita", "Sesso", "Uscita", "Peso vivo", "Peso della carcassa", "Osservazione"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{r.nonFatturati.map(c => (
                <tr key={c.chiave}><td style={{ ...td, fontWeight: 700 }}>{c.codice}</td><td style={td}>{c.lotto || (c.scheda ? `scheda ${c.scheda}` : "—")}</td>
                  <td style={td}>{c.provenienza}</td><td style={td}>{data(c.nascita)}</td><td style={td}>{c.sesso || "—"}</td><td style={td}>{data(c.uscita)}</td>
                  <td style={num}>{c.pesoVivo ? `${formattaNumero(c.pesoVivo, 2)} kg` : "—"}</td><td style={num}>{kg(c.kg)} kg</td>
                  <td style={{ ...td, color: c.osservazione ? C.text : C.muted }}>{c.osservazione}</td></tr>))}</tbody>
            </table>)}
        </div>

        {r.nonAbbinati.length > 0 && (
          <div style={scheda}>
            <div style={{ fontWeight: 800, color: C.primary, fontSize: 15, marginBottom: 6 }}>4. Mesi in cui il confronto capo per capo non si può fare: {r.nonAbbinati.length}</div>
            <p style={{ fontSize: 12.5, color: C.muted, marginTop: 0 }}>In questi mesi i pesi dell'app non tornano con le fatture: non si può dire quali capi pesati sono fatturati e quali no. Si confrontano solo i totali.</p>
            <table style={{ width: "100%" }}>
              <thead><tr>{["Mese", "Capi pesati nell'app non abbinati", "Chili", "Capi fatturati", "Chili fatturati", "Fatture", "Perché"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{r.nonAbbinati.map(m => (
                <tr key={m.mese}><td style={{ ...td, fontWeight: 700 }}>{MESI[m.mese - 1]}</td><td style={num}>{m.capiPesati}</td><td style={num}>{kg(m.kgPesati)}</td>
                  <td style={num}>{m.capiFatturati ?? "—"}</td><td style={num}>{kg(m.kgFatturati)}</td><td style={td}>{m.numeri.join(", ")}</td><td style={{ ...td, color: C.red }}>{m.esito}</td></tr>))}</tbody>
            </table>
          </div>
        )}

        <div style={{ ...scheda, fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
          <b style={{ color: C.text }}>Come si fa il confronto.</b> Il mese di una fattura è quello scritto nella descrizione («PERIODO SETTEMBRE 2025»): le fatture si emettono
          anche mesi dopo (per esempio quelle del 27/01/2026 per settembre–dicembre 2025). Le fatture non nominano i suinetti: i capi fatturati si riconoscono dai pesi,
          cercando i capi del mese il cui peso della carcassa somma esattamente ai chili della fattura, con il numero di capi scritto. Se la fattura pesa più dei capi del mese,
          si cercano anche i capi pesati del mese prima. Se più gruppi di capi tornano con la stessa fattura, il programma non sceglie e lo scrive. Le fatture emesse dal
          programma hanno il codice del capo e si abbinano direttamente.
        </div>
      </>}
    </div>
  );
}
