import { useState, useEffect } from "react";
import { C } from "./style";
import { calcolaPerformanceEta } from "./calcoloPerformanceEta";
import { TabellaStepCurva, NotaPochiDati } from "./PerformanceEta";

// Componente generico per le 4 pagine "Accrescimento e Costi" (Tutti gli Alimenti /
// Mangimi / Foraggio / Pascolo) — stessa curva Ponderata di sempre, cambia solo quale
// campo economico (già calcolato con il tasso giusto in calcoloPerformanceEta) si mostra.
// Per ora solo Bovini — Ovini/Suini si aggiungeranno in seguito.
export default function AccrescimentoCostiPagina({ campo, titolo, descrizione, vuota }) {
  const [dati, setDati] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [annoMangime, setAnnoMangime] = useState(new Date().getFullYear());

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    setErrore(null);
    try {
      setDati(await calcolaPerformanceEta(annoMangime));
    } catch (err) {
      setErrore(err.message);
    }
    setLoading(false);
  }

  const d = dati?.bovino;

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Accrescimento e Costi — Bovini — {titolo}</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>{descrizione}</p>

      {!vuota && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: C.muted }}>Anno di riferimento:</label>
          <input type="number" value={annoMangime} onChange={e => setAnnoMangime(parseInt(e.target.value))}
            style={{ width: 100, padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
          <button onClick={carica} disabled={loading}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {loading ? "Calcolo..." : "Ricalcola"}
          </button>
        </div>
      )}

      {vuota ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
            📋 Pagina segnaposto — non ci sono ancora dati di costo per il Pascolo (arriveranno quando parleremo di Coltivazione). Il peso e l'IPG sono già calcolabili (stessa curva delle altre pagine), ma le colonne economiche resteranno "—" finché non ci sarà un tasso Pascolo da collegare.
          </p>
        </div>
      ) : loading ? <p style={{ color: C.muted }}>Calcolo in corso...</p> : errore ? (
        <p style={{ color: C.red }}>⚠️ {errore}</p>
      ) : !d || d.nAnimaliTotali === 0 ? (
        <p style={{ color: C.muted, fontSize: 13 }}>Nessun animale uscito con dati sufficienti.</p>
      ) : d[campo] ? (
        <TabellaStepCurva titolo={`Peso vivo — maturo M: ${d.curveVivoPerSesso.M ? d.curveVivoPerSesso.M.A + " kg" : "—"}, F: ${d.curveVivoPerSesso.F ? d.curveVivoPerSesso.F.A + " kg" : "—"}`} step={d[campo]} />
      ) : <NotaPochiDati />}
    </div>
  );
}
