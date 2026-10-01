import { useState, useMemo } from "react";
import { C } from "./style";
import { esportaExcel } from "./esportaExcel";
import { ALTRI_DOCUMENTI_CORTESI, DATA_AGGIORNAMENTO_ALTRI_DOCUMENTI } from "./datiAltriDocumentiCortesi";

// Modelli 4 → Altri documenti di Stefano Cortesi
// Sola consultazione: registri di stalla, certificati, attestati, censimenti, fatture e altri
// PDF arrivati per mail da Stefano Cortesi che non sono modelli 4. Il pulsante apre la mail in Gmail.

const COLORE_SPECIE = { Bovini: C.bovini, Suini: C.suini, Ovini: C.ovini, Caprini: C.accent };

function dataItaliana(iso) {
  if (!iso) return "—";
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}

export default function AltriDocumentiCortesi() {
  const [tipo, setTipo] = useState("tutti");
  const tipi = [...new Set(ALTRI_DOCUMENTI_CORTESI.map(d => d.tipo))];
  const visibili = useMemo(() => ALTRI_DOCUMENTI_CORTESI.filter(d => tipo === "tutti" || d.tipo === tipo), [tipo]);

  function esporta() {
    esportaExcel("Altri_documenti_Stefano_Cortesi", [{
      nome: "Altri documenti",
      righe: visibili.map(d => ({
        "Data della mail": dataItaliana(d.dataMail), "Tipo di documento": d.tipo, "Specie": d.specie.join(", "),
        "Nome del file": d.nomeFile, "Oggetto della mail": d.oggetto, "Collegamento alla mail": d.url,
      })),
    }]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Altri documenti di Stefano Cortesi</h1>
        <button onClick={esporta} style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700 }}>📥 Esporta Excel</button>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
        I PDF inviati per mail da Stefano Cortesi che non sono modelli 4: registri di stalla, certificati, attestati, censimenti, fatture e altro.
        Elenco al {dataItaliana(DATA_AGGIORNAMENTO_ALTRI_DOCUMENTI)}. «Apri la mail» apre la mail in Gmail (account filippobizz4@gmail.com) con il PDF allegato.
      </p>
      <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ height: 36, padding: "0 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, background: "#fff", marginBottom: 14 }}>
        <option value="tutti">Tutti i tipi ({ALTRI_DOCUMENTI_CORTESI.length})</option>
        {tipi.map(t => <option key={t} value={t}>{t} ({ALTRI_DOCUMENTI_CORTESI.filter(d => d.tipo === t).length})</option>)}
      </select>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: C.primary, color: "#fff", textAlign: "left" }}>
              <th style={th}>Data della mail</th><th style={th}>Tipo di documento</th><th style={th}>Specie</th>
              <th style={th}>Nome del file</th><th style={th}>Oggetto della mail</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {visibili.map((d, i) => (
              <tr key={d.id} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 ? C.bg : "#fff" }}>
                <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>{dataItaliana(d.dataMail)}</td>
                <td style={td}>{d.tipo}</td>
                <td style={td}>{d.specie.length ? d.specie.map(s => (
                  <span key={s} style={{ display: "inline-block", marginRight: 4, padding: "1px 7px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: COLORE_SPECIE[s] + "22", color: COLORE_SPECIE[s] }}>{s}</span>
                )) : <span style={{ color: C.muted }}>non indicata</span>}</td>
                <td style={{ ...td, wordBreak: "break-word" }}>{d.nomeFile}</td>
                <td style={{ ...td, color: C.muted, wordBreak: "break-word" }}>{d.oggetto}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <a href={d.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-block", padding: "5px 12px", borderRadius: 7, border: `1.5px solid ${C.primary}`, color: C.primary, background: "#fff", fontWeight: 700, textDecoration: "none", fontSize: 12 }}>
                    Apri la mail
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: "8px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" };
const td = { padding: "7px 10px", verticalAlign: "top" };
