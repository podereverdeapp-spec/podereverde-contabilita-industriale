import { useState } from "react";
import { C } from "./style";
import { formattaEuro, formattaNumero } from "./parsingUtils";
import { confrontaConsumoSuini } from "./calcoloConsumiRazioniSuini";
import { esportaExcel, numeroExcel } from "./esportaExcel";

export default function RazioniSuiniConsumi() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [dati, setDati] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState(null);

  async function calcola() {
    setLoading(true);
    setErrore(null);
    setDati(null);
    try {
      setDati(await confrontaConsumoSuini(anno));
    } catch (err) {
      setErrore(err.message);
    }
    setLoading(false);
  }

  function esporta() {
    if (!dati) return;
    const righeExcel = dati.righe.map(r => ({
      "Alimento": r.prodotto,
      "Kg teorico": numeroExcel(r.kgTeorico),
      "Kg reale": numeroExcel(r.kgReale),
      "Scarto kg": numeroExcel(r.scartoKg),
      "Valore teorico (€)": r.valoreTeorico != null ? numeroExcel(r.valoreTeorico) : null,
      "Valore reale (€)": numeroExcel(r.valoreReale),
      "Scarto (€)": r.scartoValore != null ? numeroExcel(r.scartoValore) : null,
      "Fatture corrispondenti": r.prodottiRealiCorrispondenti.join("; "),
    }));
    esportaExcel(`ConsumiSuini_${anno}`, [{ nome: "Consumi Suini", righe: righeExcel }]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Razioni → Suini → Consumi</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Per l'anno scelto: consumo teorico (razioni × suini/lotti realmente presenti in azienda quell'anno) confrontato con quanto realmente acquistato e speso — suddiviso per singolo alimento.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <label style={{ fontSize: 13, color: C.muted }}>Anno:</label>
        <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
          style={{ width: 100, padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
        <button onClick={calcola} disabled={loading}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "Calcolo..." : "📊 Calcola confronto"}
        </button>
        {dati && dati.nCategorieUsate > 0 && (
          <button onClick={esporta}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            📥 Esporta Excel
          </button>
        )}
      </div>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}

      {dati && (
        dati.nCategorieUsate === 0 ? (
          <p style={{ color: C.muted, fontSize: 13 }}>Nessuna razione trovata per il {anno} — vai su Composizione Razioni e caricala prima (o copiala dall'anno precedente).</p>
        ) : (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead style={{ background: C.primary, color: "#fff", position: "sticky", top: 0, zIndex: 1 }}>
                <tr>
                  <th style={th}>Alimento</th>
                  <th style={th}>Kg teorico</th>
                  <th style={th}>Kg reale</th>
                  <th style={th}>Scarto kg</th>
                  <th style={th}>Valore teorico (€)</th>
                  <th style={th}>Valore reale (€)</th>
                  <th style={th}>Scarto (€)</th>
                </tr>
              </thead>
              <tbody>
                {dati.righe.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 700 }} title={r.prodottiRealiCorrispondenti.join(", ") || "nessuna fattura corrispondente trovata"}>
                      {r.prodotto}
                    </td>
                    <td style={td}>{formattaNumero(r.kgTeorico, 1)}</td>
                    <td style={td}>{formattaNumero(r.kgReale, 1)}</td>
                    <td style={{ ...td, color: Math.abs(r.scartoKg) > r.kgReale * 0.2 ? C.red : C.text }}>{r.scartoKg > 0 ? "+" : ""}{formattaNumero(r.scartoKg, 1)}</td>
                    <td style={td}>{r.valoreTeorico != null ? formattaEuro(r.valoreTeorico, 2) : "—"}</td>
                    <td style={td}>{formattaEuro(r.valoreReale, 2)}</td>
                    <td style={td}>{r.scartoValore != null ? (r.scartoValore > 0 ? "+" : "") + formattaEuro(r.scartoValore, 2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      <p style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>
        "Valore teorico" usa il prezzo medio reale pagato per kg di quell'alimento (non esiste un listino prezzi teorico separato). Passa il mouse su un alimento per vedere quali descrizioni di fattura sono state riconosciute come corrispondenti.
      </p>
    </div>
  );
}

const th = { padding: "8px 12px", textAlign: "right", fontSize: 12, fontWeight: 700 };
const td = { padding: "8px 12px", textAlign: "right" };
