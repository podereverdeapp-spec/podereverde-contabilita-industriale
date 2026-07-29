import { useState, useRef } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro } from "./parsingUtils";

function normalizzaTesto(t) { return String(t || "").trim().toLowerCase(); }
function importoVicino(a, b, tolleranzaPct = 0.02, tolleranzaAssoluta = 0.05) {
  const x = parseFloat(a), y = parseFloat(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const diff = Math.abs(x - y);
  if (diff <= tolleranzaAssoluta) return true; // differenze piccole in assoluto, sempre ok (arrotondamenti)
  return diff / Math.max(Math.abs(x), Math.abs(y)) <= tolleranzaPct;
}

export default function VerificaRigheMancanti() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [righeExcel, setRigheExcel] = useState([]);
  const [colonne, setColonne] = useState([]);
  const [mappaFornitore, setMappaFornitore] = useState("");
  const [mappaDescrizione, setMappaDescrizione] = useState("");
  const [mappaImporto, setMappaImporto] = useState("");
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
        const trovaColonna = parole => Object.keys(dati[0]).find(c => parole.some(p => c.toLowerCase().includes(p)));
        setMappaFornitore(trovaColonna(["fornitore", "cedente"]) || "");
        setMappaDescrizione(trovaColonna(["descrizione"]) || "");
        setMappaImporto(trovaColonna(["imponibile", "importo"]) || "");
        setMappaData(trovaColonna(["data"]) || "");
      } catch (err) {
        setErrore(`Impossibile leggere il file: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
  }

  async function confrontaRighe() {
    if (!mappaFornitore || !mappaImporto) { alert("Indica almeno le colonne Fornitore e Importo."); return; }
    setCaricando(true);
    setErrore(null);
    try {
      const righeAnno = righeExcel.filter(r => {
        if (!mappaData) return true;
        const d = String(r[mappaData] instanceof Date ? r[mappaData].toISOString() : r[mappaData]);
        return d.startsWith(String(anno));
      });

      const { data: fornitori } = await supabase.from("ci_fornitori").select("id, nome");
      const mappaFornitori = new Map((fornitori || []).map(f => [normalizzaTesto(f.nome), f.id]));

      // Per ogni fornitore distinto nelle righe da controllare, carica TUTTI i costi
      // registrati per lui nell'anno, nelle 3 tabelle possibili — poi confronta
      const fornitoriDaControllare = [...new Set(righeAnno.map(r => normalizzaTesto(r[mappaFornitore])))];
      const poolPerFornitore = new Map(); // nomeNormalizzato -> [{descrizione, importo}]

      for (const nomeFornitore of fornitoriDaControllare) {
        const fornitoreId = mappaFornitori.get(nomeFornitore);
        if (!fornitoreId) { poolPerFornitore.set(nomeFornitore, null); continue; } // fornitore non trovato in anagrafica

        const [{ data: fatture }, { data: cespiti }, { data: acquistiAnimali }] = await Promise.all([
          supabase.from("ci_fatture").select("id").eq("fornitore_id", fornitoreId).eq("tipo", "PASSIVA")
            .gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`),
          supabase.from("ci_cespiti").select("descrizione, costo_acquisto").eq("fornitore_id", fornitoreId)
            .gte("data_acquisto", `${anno}-01-01`).lte("data_acquisto", `${anno}-12-31`),
          supabase.from("ci_report_acquisto_animali").select("specie, razza, importo").eq("fornitore_id", fornitoreId)
            .gte("data_fattura", `${anno}-01-01`).lte("data_fattura", `${anno}-12-31`),
        ]);

        const idFatture = (fatture || []).map(f => f.id);
        let articoli = [];
        if (idFatture.length > 0) {
          const { data } = await supabase.from("ci_articoli_fattura").select("descrizione, totale_riga").in("fattura_id", idFatture);
          articoli = data || [];
        }

        const pool = [
          ...articoli.map(a => ({ descrizione: a.descrizione, importo: a.totale_riga })),
          ...(cespiti || []).map(c => ({ descrizione: c.descrizione, importo: c.costo_acquisto })),
          ...(acquistiAnimali || []).map(a => ({ descrizione: `${a.specie || ""} ${a.razza || ""}`.trim() || "Acquisto animali", importo: a.importo })),
        ];
        poolPerFornitore.set(nomeFornitore, pool);
      }

      const mancanti = [];
      const fornitoriNonTrovati = new Set();
      righeAnno.forEach(r => {
        const nomeFornitore = normalizzaTesto(r[mappaFornitore]);
        const pool = poolPerFornitore.get(nomeFornitore);
        if (pool === null) { fornitoriNonTrovati.add(r[mappaFornitore]); mancanti.push({ ...r, _motivo: "Fornitore non trovato in anagrafica" }); return; }
        const importoRiga = r[mappaImporto];
        const trovata = (pool || []).some(p => importoVicino(p.importo, importoRiga));
        if (!trovata) mancanti.push({ ...r, _motivo: "Nessun importo corrispondente trovato" });
      });

      setRisultato({ totaleControllate: righeAnno.length, mancanti, fornitoriNonTrovati: [...fornitoriNonTrovati] });
    } catch (err) {
      setErrore(err.message);
    }
    setCaricando(false);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Verifica Righe Mancanti</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Carica un file Excel con una riga per ogni voce/articolo (es. quello prodotto dal prompt di estrazione PDF) e confrontalo con TUTTO quello che risulta caricato per quel fornitore — fatture normali, Cespiti (Ammortamenti) e Acquisto Animali insieme — per trovare righe che potrebbero non essere state salvate da nessuna parte.
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
            <CampoMappa label="Fornitore (obbligatorio)" value={mappaFornitore} colonne={colonne} onChange={setMappaFornitore} />
            <CampoMappa label="Importo (obbligatorio)" value={mappaImporto} colonne={colonne} onChange={setMappaImporto} />
            <CampoMappa label="Descrizione (informativa)" value={mappaDescrizione} colonne={colonne} onChange={setMappaDescrizione} />
            <CampoMappa label="Data (per filtrare l'anno)" value={mappaData} colonne={colonne} onChange={setMappaData} />
          </div>
          <button onClick={confrontaRighe} disabled={caricando}
            style={{ marginTop: 12, background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {caricando ? "Confronto..." : "🔍 Confronta con il database"}
          </button>
        </div>
      )}

      {risultato && (
        <div>
          <p style={{ fontSize: 13, color: C.muted }}>{risultato.totaleControllate} righe controllate</p>
          {risultato.fornitoriNonTrovati.length > 0 && (
            <div style={{ background: "#FFF2DC", border: `1px solid ${C.yellow}`, borderRadius: 8, padding: "10px 16px", fontSize: 13, marginBottom: 10 }}>
              ⚠️ Fornitori del file non trovati in anagrafica (controlla il nome esatto): {risultato.fornitoriNonTrovati.join(", ")}
            </div>
          )}
          {risultato.mancanti.length === 0 ? (
            <div style={{ background: "#E8F3EA", border: `1px solid ${C.green}`, borderRadius: 8, padding: "10px 16px", fontSize: 13 }}>
              ✓ Tutte le righe del file risultano registrate da qualche parte (fatture, Cespiti, o Acquisto Animali).
            </div>
          ) : (
            <>
              <div style={{ background: "#FFF2DC", border: `1px solid ${C.yellow}`, borderRadius: 8, padding: "10px 16px", fontSize: 13, marginBottom: 10 }}>
                ⚠️ {risultato.mancanti.length} righe del file NON risultano registrate.
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <thead style={{ background: C.primary, color: "#fff" }}>
                    <tr>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 11 }}>Fornitore</th>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 11 }}>Descrizione</th>
                      <th style={{ padding: "6px 10px", textAlign: "right", fontSize: 11 }}>Importo</th>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 11 }}>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risultato.mancanti.map((r, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: "6px 10px" }}>{r[mappaFornitore]}</td>
                        <td style={{ padding: "6px 10px" }}>{mappaDescrizione ? r[mappaDescrizione] : "—"}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>{formattaEuro(parseFloat(r[mappaImporto]) || 0)}</td>
                        <td style={{ padding: "6px 10px", fontSize: 11, color: C.muted }}>{r._motivo}</td>
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
        Il confronto principale è per importo (tolleranza ~2%, dato che l'imponibile può essere arrotondato diversamente tra l'estrazione e la registrazione) — la descrizione è mostrata a titolo informativo, non è richiesta per il match, dato che classificando una riga la descrizione può cambiare leggermente.
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
