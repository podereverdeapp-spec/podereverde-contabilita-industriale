import { useState, useEffect } from "react";
import { C } from "./style";
import { formattaNumero } from "./parsingUtils";
import { esportaExcel } from "./esportaExcel";
import { caricaUsciteDaFatturare } from "./calcoloEmissioneFatture";

// Emissione Fatture → Fatturazione Animali Allevamento → Uscite da Fatturare
// Sola lettura: i capi usciti per la macellazione con qualcosa ancora da fatturare, raggruppati per
// cliente e data di uscita. Versione 238: per ogni capo i suoi pezzi (mezzene, quarti, carcassa intera)
// con numero di partita e peso. I dati mancanti si segnalano, non si inventano.

function dataItaliana(iso) {
  if (!iso) return "—";
  const [a, m, g] = String(iso).slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}
const SPECIE = { bovino: "Bovino", suino: "Suino", ovino: "Ovino" };

export default function UsciteDaFatturare({ onNavigate }) {
  const [gruppi, setGruppi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);

  async function carica() {
    setLoading(true); setErrore(null);
    try { setGruppi(await caricaUsciteDaFatturare()); } catch (err) { setErrore(err.message); }
    setLoading(false);
  }
  useEffect(() => { carica(); }, []);

  function esporta() {
    esportaExcel("Uscite_da_fatturare", [{
      nome: "Uscite da fatturare",
      righe: gruppi.flatMap(g => g.capi.map(c => ({
        "Cliente": g.cliente, "Data di uscita": dataItaliana(c.data_uscita), "Specie": SPECIE[c.specie] || c.specie,
        "Matricola o unità del lotto": c.matricola, "Lotto": c.lotto || "", "Modello 4": c.modello4_numero || "",
        "Macello": c.destinatario || "", "Peso vivo (kg)": c.peso_vivo != null ? Number(c.peso_vivo) : null,
        "Peso della carcassa (kg)": c.peso_carcassa != null ? Number(c.peso_carcassa) : null,
        "Resa (%)": c.resa_percentuale != null ? Number(c.resa_percentuale) : null,
        "Pezzi e numeri di partita": (c.pezzi || []).map(p => `${p.pezzo}: ${p.numero_partita}${Number(p.peso_kg) > 0 ? ` (${String(Number(p.peso_kg)).replace(".", ",")} kg)` : ""}${p.fatturato ? " già fatturato" : ""}`).join(" · "),
        "Dati mancanti": [...c.mancanti, ...(c.clienteInAnagrafica ? [] : ["cliente non presente in anagrafica"])].join(", "),
        "Avviso sui pesi": c.avvisoPesi || "",
      }))),
    }]);
  }

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Lettura delle uscite da fatturare...</div>;

  const totCapi = gruppi.reduce((s, g) => s + g.capi.length, 0);
  const conProblemi = gruppi.filter(g => !g.completi).length;

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Uscite da Fatturare</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {totCapi > 0 && <button onClick={() => onNavigate?.("fatt-animali-prepara")} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>🧾 Prepara le fatture →</button>}
          <button onClick={carica} style={{ background: "#fff", color: C.primary, border: `1.5px solid ${C.primary}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>↻ Aggiorna</button>
          <button onClick={esporta} disabled={!totCapi} style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700 }}>📥 Esporta Excel</button>
        </div>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
        I capi usciti per la macellazione registrati nell'app Podere Verde con qualcosa ancora da fatturare. Ogni capo ha i suoi pezzi, ognuno con il numero di partita del cliente:
        suino 2 mezzene, bovino 4 quarti, ovino carcassa intera. Un capo è pronto quando ha tutti i numeri di partita. I pezzi già fatturati non si fatturano di nuovo.
        Sono raggruppati per cliente e data di uscita. Sola consultazione: i dati si correggono nell'app.
      </p>
      {errore && <div style={{ color: C.red, marginBottom: 12 }}>⚠️ {errore}</div>}

      {totCapi === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `6px solid ${C.green}`, borderRadius: 12, padding: 16, fontSize: 14 }}>
          ✅ Nessuna uscita da fatturare: tutti i capi consegnati risultano già fatturati, oppure l'operatore non ha ancora completato le consegne nell'app.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, fontSize: 13 }}>
            <span style={{ padding: "5px 12px", borderRadius: 6, background: C.red, color: "#fff", fontWeight: 800 }}>🔔 {totCapi} capi da fatturare</span>
            <span style={{ padding: "5px 12px", borderRadius: 6, background: C.primary, color: "#fff", fontWeight: 700 }}>{gruppi.length} consegne (cliente e data)</span>
            {conProblemi > 0 && <span style={{ padding: "5px 12px", borderRadius: 6, background: C.yellow + "33", color: "#8a6500", fontWeight: 700 }}>⚠️ {conProblemi} consegne con dati da completare</span>}
          </div>

          {gruppi.map(g => (
            <div key={`${g.cliente}|${g.dataUscita}`} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `6px solid ${g.completi ? C.green : C.yellow}`, borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.primary }}>{g.cliente}</div>
                  <div style={{ fontSize: 12.5, color: C.muted }}>Uscita del {dataItaliana(g.dataUscita)} · {g.capi.length} capi · carcassa {formattaNumero(g.kgCarcassa, 2)} kg · vivo {formattaNumero(g.kgVivo, 2)} kg</div>
                </div>
                <span style={{ alignSelf: "flex-start", padding: "3px 10px", borderRadius: 6, fontSize: 11.5, fontWeight: 800, background: (g.completi ? C.green : C.yellow) + "22", color: g.completi ? C.green : "#8a6500" }}>
                  {g.completi ? "DATI COMPLETI" : "DATI DA COMPLETARE"}
                </span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ color: C.muted, textAlign: "left" }}>
                      <th style={th}>Specie</th><th style={th}>Matricola o unità del lotto</th><th style={th}>Modello 4</th><th style={th}>Macello</th>
                      <th style={{ ...th, textAlign: "right" }}>Peso vivo (kg)</th><th style={{ ...th, textAlign: "right" }}>Peso della carcassa (kg)</th>
                      <th style={{ ...th, textAlign: "right" }}>Resa</th><th style={th}>Pezzi e numeri di partita</th><th style={th}>Da completare</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.capi.map(c => {
                      const problemi = [...c.mancanti, ...(c.clienteInAnagrafica ? [] : ["cliente non presente in anagrafica"])];
                      return (
                        <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}>
                          <td style={td}>{SPECIE[c.specie] || c.specie}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{c.matricola || "—"}{c.lotto && <div style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>lotto {c.lotto}</div>}</td>
                          <td style={td}>{c.modello4_numero || "—"}</td>
                          <td style={{ ...td, minWidth: 170 }}>{c.destinatario || "—"}</td>
                          <td style={{ ...td, textAlign: "right" }}>{c.peso_vivo != null ? formattaNumero(c.peso_vivo, 2) : "—"}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{c.peso_carcassa != null ? formattaNumero(c.peso_carcassa, 2) : "—"}</td>
                          <td style={{ ...td, textAlign: "right" }}>{c.resa_percentuale != null ? `${formattaNumero(c.resa_percentuale, 1)}%` : "—"}</td>
                          <td style={{ ...td, minWidth: 220 }}>
                            {(c.pezzi || []).length === 0 ? "—" : c.pezzi.map(p => (
                              <div key={p.id} style={{ color: p.fatturato ? C.muted : C.text, textDecoration: p.fatturato ? "line-through" : "none" }}>
                                <b>{p.pezzo}</b>: {p.numero_partita}{Number(p.peso_kg) > 0 ? ` · ${formattaNumero(p.peso_kg, 2)} kg` : ""}{p.fatturato ? " (fatturato)" : ""}
                              </div>))}
                            {c.avvisoPesi && <div style={{ fontSize: 11, color: "#8a6500", fontWeight: 700 }}>⚠️ {c.avvisoPesi}</div>}
                          </td>
                          <td style={{ ...td, color: problemi.length ? C.red : C.green, fontWeight: 700 }}>{problemi.length ? problemi.join(", ") : "✓"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const th = { padding: "5px 8px", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" };
const td = { padding: "5px 8px", verticalAlign: "top" };
