import { useState, useRef } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro } from "./parsingUtils";

export default function VerificaFattureMancanti() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [righeExcel, setRigheExcel] = useState([]);
  const [colonne, setColonne] = useState([]);
  const [mappaFornitore, setMappaFornitore] = useState("");
  const [mappaNumero, setMappaNumero] = useState("");
  const [mappaData, setMappaData] = useState("");
  const [risultato, setRisultato] = useState(null);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState(null);
  const inputRef = useRef(null);

  function gestisciFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary", cellDates: true });
        const foglio = wb.Sheets[wb.SheetNames[0]];
        const dati = XLSX.utils.sheet_to_json(foglio, { defval: "" });
        if (dati.length === 0) { setErrore("Il file sembra vuoto."); return; }
        setColonne(Object.keys(dati[0]));
        setRigheExcel(dati);
        setRisultato(null);
        setErrore(null);
        // Prova a indovinare le colonne giuste dal nome, per comodità (poi comunque modificabile)
        const trovaColonna = (parole) => Object.keys(dati[0]).find(c => parole.some(p => c.toLowerCase().includes(p)));
        setMappaFornitore(trovaColonna(["fornitore", "cedente", "ragione sociale", "denominazione"]) || "");
        setMappaNumero(trovaColonna(["numero"]) || "");
        setMappaData(trovaColonna(["data"]) || "");
      } catch (err) {
        setErrore(`Impossibile leggere il file: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
  }

  function normalizzaNumero(n) {
    return String(n || "").trim().toLowerCase().replace(/^0+/, "").replace(/[\/\-\s]/g, "");
  }
  function normalizzaTesto(t) {
    return String(t || "").trim().toLowerCase();
  }
  function normalizzaData(d) {
    if (!d) return "";
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    const s = String(d).trim();
    // Prova formato gg/mm/aaaa o gg-mm-aaaa
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return s.slice(0, 10);
  }

  async function confrontaFatture() {
    if (!mappaNumero) { alert("Indica almeno quale colonna contiene il Numero fattura."); return; }
    setCaricando(true);
    setErrore(null);
    try {
      const { data: fattureDb, error } = await supabase
        .from("ci_fatture").select("numero, data, ci_fornitori(nome)").eq("tipo", "PASSIVA")
        .gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`);
      if (error) throw new Error(error.message);

      const chiaviDb = new Set((fattureDb || []).map(f => `${normalizzaNumero(f.numero)}|${normalizzaTesto(f.ci_fornitori?.nome)}`));
      const chiaviDbSoloNumero = new Set((fattureDb || []).map(f => normalizzaNumero(f.numero)));

      const righeAnno = righeExcel.filter(r => {
        const d = normalizzaData(r[mappaData]);
        return !mappaData || d.startsWith(String(anno));
      });

      const mancanti = righeAnno.filter(r => {
        const numero = normalizzaNumero(r[mappaNumero]);
        const fornitore = mappaFornitore ? normalizzaTesto(r[mappaFornitore]) : "";
        if (mappaFornitore) return !chiaviDb.has(`${numero}|${fornitore}`);
        return !chiaviDbSoloNumero.has(numero); // se non c'è mappatura fornitore, confronta solo per numero
      });

      setRisultato({ totaleExcel: righeAnno.length, totaleDb: (fattureDb || []).length, mancanti });
    } catch (err) {
      setErrore(err.message);
    }
    setCaricando(false);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Verifica Fatture Mancanti</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Carica un file Excel con l'elenco delle fatture (es. dal portale Fatture e Corrispettivi, dal commercialista, o dalla PEC) e confrontalo con quello che risulta già caricato nel programma per l'anno scelto — per trovare fatture che potrebbero non essere state rilevate.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, color: C.muted }}>Anno:</label>
        <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
          style={{ width: 100, padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
        <button onClick={() => inputRef.current.click()}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          📎 Scegli file Excel
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={gestisciFile} style={{ display: "none" }} />
        {righeExcel.length > 0 && <span style={{ fontSize: 12, color: C.muted }}>{righeExcel.length} righe lette dal file</span>}
      </div>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}

      {colonne.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Indica quali colonne del file corrispondono a:</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <CampoMappa label="Numero fattura (obbligatorio)" value={mappaNumero} colonne={colonne} onChange={setMappaNumero} />
            <CampoMappa label="Fornitore (consigliato)" value={mappaFornitore} colonne={colonne} onChange={setMappaFornitore} />
            <CampoMappa label="Data (per filtrare l'anno)" value={mappaData} colonne={colonne} onChange={setMappaData} />
          </div>
          <button onClick={confrontaFatture} disabled={caricando}
            style={{ marginTop: 12, background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {caricando ? "Confronto..." : "🔍 Confronta con il database"}
          </button>
        </div>
      )}

      {risultato && (
        <div>
          <p style={{ fontSize: 13, color: C.muted }}>
            Nel file (anno {anno}): {risultato.totaleExcel} fatture · Nel database (anno {anno}): {risultato.totaleDb} fatture
          </p>
          {risultato.mancanti.length === 0 ? (
            <div style={{ background: "#E8F3EA", border: `1px solid ${C.green}`, borderRadius: 8, padding: "10px 16px", fontSize: 13 }}>
              ✓ Nessuna fattura del file risulta mancante nel database.
            </div>
          ) : (
            <>
              <div style={{ background: "#FFF2DC", border: `1px solid ${C.yellow}`, borderRadius: 8, padding: "10px 16px", fontSize: 13, marginBottom: 10 }}>
                ⚠️ {risultato.mancanti.length} fatture del file NON risultano nel database — potrebbero non essere state caricate.
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <thead style={{ background: C.primary, color: "#fff" }}>
                    <tr>{colonne.map(c => <th key={c} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11 }}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {risultato.mancanti.map((r, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                        {colonne.map(c => <td key={c} style={{ padding: "6px 10px" }}>{String(r[c] ?? "")}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
      <p style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>
        Il confronto è per Numero fattura (e Fornitore, se indicato) — normalizzato per ignorare zeri iniziali, spazi e maiuscole/minuscole. Senza la colonna Fornitore, confronta solo per numero (meno preciso, può dare falsi positivi se due fornitori diversi hanno lo stesso numero fattura).
      </p>
    </div>
  );
}

function CampoMappa({ label, value, colonne, onChange }) {
  return (
    <label style={{ fontSize: 11, color: C.muted }}>
      {label}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12, marginTop: 2 }}>
        <option value="">— nessuna —</option>
        {colonne.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}
