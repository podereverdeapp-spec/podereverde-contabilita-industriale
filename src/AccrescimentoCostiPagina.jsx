import { useState, useEffect } from "react";
import { C } from "./style";
import { calcolaPerformanceEta } from "./calcoloPerformanceEta";
import { TabellaStepCurva, NotaPochiDati } from "./PerformanceEta";

// Accrescimento e Costi per alimento (Bovini): una sola pagina con la scelta dell'alimento
// (prima erano quattro voci di menu con lo stesso calcolo). Stessa curva di sempre, cambia
// solo quale campo economico (già calcolato in calcoloPerformanceEta) si mostra. Il Pascolo
// si aggiungerà quando ci saranno i suoi dati di costo.
const ALIMENTI = [
  { campo: "stepVivoTuttiAlimenti", titolo: "Tutti gli alimenti", descrizione: "Mangimi e foraggio insieme: il quadro economico completo di quanto costa la crescita, per fascia d'età." },
  { campo: "stepVivoSoloMangimi", titolo: "Solo mangimi", descrizione: "Solo il costo e il consumo dei mangimi, separato dal foraggio." },
  { campo: "stepVivoSoloForaggio", titolo: "Solo foraggio", descrizione: "Solo il costo e il consumo del foraggio, separato dai mangimi." },
];

export default function AccrescimentoCostiPagina() {
  const [scelta, setScelta] = useState(0);
  const { campo, titolo, descrizione } = ALIMENTI[scelta];
  const vuota = false;
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
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {ALIMENTI.map((a, i) => (
          <button key={a.campo} onClick={() => setScelta(i)}
            style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${C.primary}`, background: scelta === i ? C.primary : "#fff", color: scelta === i ? "#fff" : C.primary, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            {a.titolo}
          </button>
        ))}
      </div>
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
