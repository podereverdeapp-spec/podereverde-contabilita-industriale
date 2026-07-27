import { useState, useEffect } from "react";
import { C } from "./style";
import { formattaNumero } from "./parsingUtils";
import { calcolaPerformanceEta } from "./calcoloPerformanceEta";

const SPECIE_LABEL = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };

export default function PerformanceEta() {
  const [dati, setDati] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    setErrore(null);
    try {
      setDati(await calcolaPerformanceEta());
    } catch (err) {
      setErrore(err.message);
    }
    setLoading(false);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Performance per Fascia d'Età</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Peso stimato all'ingresso/uscita di ogni fascia d'età e IPG (Incremento Peso Giornaliero), calcolati per "step" successivi con una regressione lineare sugli animali già usciti/pesati — basato sui dati disponibili oggi, anche se pochi o parziali (alcuni animali hanno solo il peso vivo, altri solo la carcassa). Si affina automaticamente man mano che si accumulano pesate in podereverdeapp.it.
      </p>

      {loading ? <p style={{ color: C.muted }}>Calcolo in corso...</p> : errore ? (
        <p style={{ color: C.red }}>⚠️ {errore}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {["bovino", "suino", "ovino"].map(specie => {
            const d = dati[specie];
            if (!d) return null;
            return (
              <div key={specie}>
                <h2 style={{ color: C.primary, fontSize: 18, marginBottom: 4 }}>{SPECIE_LABEL[specie]}</h2>
                <p style={{ color: C.muted, fontSize: 12, marginTop: 0, marginBottom: 10 }}>
                  {d.nAnimaliTotali} animali usciti totali — {d.nConPesoVivo} con peso vivo noto, {d.nConPesoCarcassa} con peso carcassa noto.
                </p>
                {d.nAnimaliTotali === 0 ? (
                  <p style={{ color: C.muted, fontSize: 13 }}>Nessun animale uscito con data di nascita e uscita note.</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <TabellaStep titolo="Peso vivo" step={d.stepVivo} />
                    <TabellaStep titolo="Peso carcassa" step={d.stepCarcassa} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabellaStep({ titolo, step }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ background: C.primary, color: "#fff", padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>{titolo}</div>
      <table style={{ width: "100%", fontSize: 12 }}>
        <thead>
          <tr style={{ color: C.muted, textAlign: "left" }}>
            <th style={{ padding: "6px 8px" }}>Fascia</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Peso ingr. (kg)</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Peso usc. (kg)</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>IPG (kg/gg)</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>N. animali</th>
          </tr>
        </thead>
        <tbody>
          {step.map((s, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: "6px 8px" }}>{s.label}</td>
              {s.datiSufficienti ? (
                <>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{s.pesoIngresso != null ? formattaNumero(s.pesoIngresso, 1) : "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{s.pesoUscita != null ? formattaNumero(s.pesoUscita, 1) : "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{s.ipg != null ? formattaNumero(s.ipg, 3) : "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{s.nAnimali}</td>
                </>
              ) : (
                <td colSpan={4} style={{ padding: "6px 8px", textAlign: "center", color: C.muted, fontStyle: "italic" }}>
                  Dati insufficienti ({s.nAnimali} animal{s.nAnimali === 1 ? "e" : "i"} — ne servono almeno 2 con peso noto)
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
