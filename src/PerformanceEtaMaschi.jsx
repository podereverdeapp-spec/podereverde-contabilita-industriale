import { useState, useEffect } from "react";
import { C } from "./style";
import { calcolaPerformanceEta } from "./calcoloPerformanceEta";
import { TabellaStepSemplice, NotaPochiDati } from "./PerformanceEta";

const SPECIE_LABEL = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };

export default function PerformanceEtaMaschi({ onNavigate }) {
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

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <button onClick={() => onNavigate?.("performanceeta")}
        style={{ background: "none", border: "none", color: C.primary, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: 10 }}>
        ← Torna a Performance per Fascia d'Età
      </button>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Performance per Fascia d'Età — ♂️ Solo Maschi</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Curva di Gompertz adattata solo sugli animali maschi — una delle due curve che compongono la media ponderata mostrata nella pagina principale.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <label style={{ fontSize: 13, color: C.muted }}>Anno di riferimento per il costo mangime+foraggio:</label>
        <input type="number" value={annoMangime} onChange={e => setAnnoMangime(parseInt(e.target.value))}
          style={{ width: 100, padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
        <button onClick={carica} disabled={loading}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "Calcolo..." : "Ricalcola"}
        </button>
      </div>

      {loading ? <p style={{ color: C.muted }}>Calcolo in corso...</p> : errore ? (
        <p style={{ color: C.red }}>⚠️ {errore}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {["bovino", "suino", "ovino"].map(specie => {
            const d = dati[specie];
            if (!d || d.nAnimaliTotali === 0) return null;
            return (
              <div key={specie}>
                <h2 style={{ color: C.primary, fontSize: 18, marginBottom: 10 }}>{SPECIE_LABEL[specie]}</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 16, overflowX: "auto" }}>
                  {d.stepVivoM ? <TabellaStepSemplice titolo="Peso vivo" step={d.stepVivoM} /> : <NotaPochiDati />}
                  {d.stepCarcassaM ? <TabellaStepSemplice titolo="Peso carcassa" step={d.stepCarcassaM} /> : <NotaPochiDati />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
