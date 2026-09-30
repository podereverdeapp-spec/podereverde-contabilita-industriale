import { useState, useEffect } from "react";
import { C } from "./style";
import { esportaExcel } from "./esportaExcel";
import { caricaArchivioReport, caricaFogliReport, fogliPerExcel } from "./calcoloCampiStagioni";
import { formattaDataItaliana } from "./calcoloFattureColtivazione";

// Coltivazioni → Campi e Stagioni → Archivio dei Report
// Sola lettura: i report sulle coltivazioni consegnati dall'app Podere Verde al Dott. Bizzarri,
// con tutte le versioni. «corrente» = da usare; «non aggiornato» = precedente alle correzioni,
// non usare i numeri; «superato» = sostituito da una versione più recente.
const STATI = {
  "corrente": { colore: C.green, testo: "CORRENTE — da usare" },
  "non aggiornato": { colore: C.yellow, testo: "NON AGGIORNATO — non usare i numeri" },
  "superato": { colore: C.muted, testo: "SUPERATO" },
};

export default function ColtArchivioReport() {
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [tutti, setTutti] = useState(false);
  const [scarico, setScarico] = useState(null);
  const [senzaDati, setSenzaDati] = useState(() => new Set());

  useEffect(() => {
    (async () => {
      try { setReport(await caricaArchivioReport()); } catch (err) { setErrore(err.message); }
      setLoading(false);
    })();
  }, []);

  async function scarica(r) {
    setScarico(r.id);
    try {
      const fogli = await caricaFogliReport(r.id);
      const lista = fogliPerExcel(fogli);
      if (!lista.length) setSenzaDati(prev => new Set(prev).add(r.id));
      else esportaExcel(`${r.nome_file.replace(/\.xlsx$/i, "")}_versione_${r.versione}`, lista);
    } catch (err) { setErrore(err.message); }
    setScarico(null);
  }

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Lettura dell'archivio dei report...</div>;
  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;

  const ordine = { "corrente": 0, "non aggiornato": 1, "superato": 2 };
  const visibili = report.filter(r => tutti || r.stato !== "superato")
    .sort((a, b) => (ordine[a.stato] ?? 3) - (ordine[b.stato] ?? 3) || a.nome_file.localeCompare(b.nome_file) || b.versione - a.versione);

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Archivio dei Report</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
        I report sulle coltivazioni preparati dall'app Podere Verde, con la versione e la data. Da ogni report si può scaricare l'Excel con i dati archiviati.
        Per i numeri sempre aggiornati si usano le pagine Schede Campi e Rese e Costi per Stagione, che leggono i dati dell'app in tempo reale.
      </p>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={tutti} onChange={e => setTutti(e.target.checked)} /> Mostra anche le versioni superate
      </label>

      {visibili.map(r => {
        const st = STATI[r.stato] || { colore: C.muted, testo: (r.stato || "").toUpperCase() };
        return (
          <div key={r.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `6px solid ${st.colore}`, borderRadius: 12, padding: "12px 16px", marginBottom: 10, opacity: r.stato === "superato" ? 0.75 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.primary }}>{r.titolo}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{r.nome_file} · versione {r.versione} · {r.data_report ? formattaDataItaliana(r.data_report) : "senza data"} · campagne {r.campagne}</div>
              </div>
              <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 800, background: st.colore + "22", color: st.colore, whiteSpace: "nowrap" }}>{st.testo}</span>
            </div>
            {r.descrizione && <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.45 }}>{r.descrizione}</div>}
            {r.note && <div style={{ fontSize: 12.5, marginTop: 6, color: r.stato === "corrente" ? C.text : C.red, lineHeight: 1.45 }}><b>Note:</b> {r.note}</div>}
            {r.sostituito_da && <div style={{ fontSize: 12, marginTop: 4, color: C.muted }}>Sostituito da: {r.sostituito_da}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11.5, color: C.muted }}>Fonti: {r.fonti || "—"}</div>
              {senzaDati.has(r.id) ? <span style={{ fontSize: 12, color: C.muted }}>L'archivio non contiene i dati di questo file: il file Excel ce l'ha il Dott. Bizzarri.</span> :
              <button onClick={() => scarica(r)} disabled={scarico === r.id}
                style={{ height: 34, padding: "0 14px", border: `1.5px solid ${C.primary}`, borderRadius: 8, background: "#fff", color: C.primary, fontSize: 12.5, fontWeight: 700 }}>
                {scarico === r.id ? "Preparazione..." : "Scarica Excel"}
              </button>}
            </div>
          </div>
        );
      })}
      {visibili.length === 0 && <div style={{ color: C.muted }}>Nessun report nell'archivio.</div>}
    </div>
  );
}
