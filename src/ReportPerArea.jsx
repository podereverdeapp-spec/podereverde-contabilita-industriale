import { useState } from "react";
import { C } from "./style";
import { calcolaDatiPerArea } from "./calcoloReportCosti";
import { formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

export default function ReportPerArea({ anno }) {
  const [calcolando, setCalcolando] = useState(false);
  const [righe, setRighe] = useState(null);
  const [rigaRossa, setRigaRossa] = useState(null);

  async function calcola() {
    setCalcolando(true);
    setRighe(null);
    setRigaRossa(null);
    try {
      const { righe: r, rigaRossa: rr } = await calcolaDatiPerArea(anno);
      if (r.length === 0 && rr.length === 0) {
        alert(`Nessun dato trovato per l'anno ${anno}. Verifica prima con "Report UBA".`);
      }
      setRighe(r);
      setRigaRossa(rr);
    } catch (err) {
      alert(`⚠️ Errore nel calcolo:\n\n${err.message}`);
    }
    setCalcolando(false);
  }

  function esporta() {
    const righeExcel = righe.map(r => ({
      "Area": r.area, "Imponibile complessivo": numeroExcel(r.imponibileComplessivo), "€/UBA-gg (tutte le specie)": numeroExcel(r.tassoArea),
      "Bovini - Costo allocato": numeroExcel(r.perSpecie.bovino.costoAllocato), "Bovini - €/UBA-gg": numeroExcel(r.perSpecie.bovino.incidenza),
      "Suini - Costo allocato": numeroExcel(r.perSpecie.suino.costoAllocato), "Suini - €/UBA-gg": numeroExcel(r.perSpecie.suino.incidenza),
      "Ovini - Costo allocato": numeroExcel(r.perSpecie.ovino.costoAllocato), "Ovini - €/UBA-gg": numeroExcel(r.perSpecie.ovino.incidenza),
    }));
    const righeRossaExcel = rigaRossa.map(r => ({ "Voce": r.label, "Imponibile complessivo": numeroExcel(r.valore), "€/UBA-gg (tutte le specie)": numeroExcel(r.tasso) }));
    esportaExcel(`ReportPerArea_${anno}`, [
      { nome: "Per Area", righe: righeExcel },
      { nome: "Orto e Non Allevamento", righe: righeRossaExcel },
    ]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Una riga per ogni Area: imponibile complessivo, incidenza €/UBA-giorno aziendale, e la scomposizione per specie (costo allocato + incidenza specifica).
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <button onClick={calcola} disabled={calcolando}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {calcolando ? "Calcolo..." : "📊 Calcola"}
        </button>
      </div>

      {righe && (
        <>
          <button onClick={esporta}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 16 }}>
            📥 Esporta Excel
          </button>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto", marginBottom: 16 }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead style={{ background: C.primary, color: "#fff", position: "sticky", top: 0, zIndex: 1 }}>
              <tr>
                <th style={th} rowSpan={2}>Area</th>
                <th style={th} rowSpan={2}>Imponibile<br />complessivo</th>
                <th style={th} rowSpan={2}>€/UBA-gg<br />(tutte le specie)</th>
                <th style={{ ...th, borderLeft: "1px solid #ffffff55" }} colSpan={2}>Bovini</th>
                <th style={{ ...th, borderLeft: "1px solid #ffffff55" }} colSpan={2}>Suini (suini+lotti)</th>
                <th style={{ ...th, borderLeft: "1px solid #ffffff55" }} colSpan={2}>Ovini</th>
              </tr>
              <tr>
                <th style={{ ...th, borderLeft: "1px solid #ffffff55" }}>Costo allocato</th>
                <th style={th}>€/UBA-gg</th>
                <th style={{ ...th, borderLeft: "1px solid #ffffff55" }}>Costo allocato</th>
                <th style={th}>€/UBA-gg</th>
                <th style={{ ...th, borderLeft: "1px solid #ffffff55" }}>Costo allocato</th>
                <th style={th}>€/UBA-gg</th>
              </tr>
            </thead>
            <tbody>
              {righe.map(r => (
                <tr key={r.area} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ ...td, fontWeight: 700 }}>{r.area}</td>
                  <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.imponibileComplessivo)}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(r.tassoArea, 4)}</td>
                  <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(r.perSpecie.bovino.costoAllocato)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.perSpecie.bovino.incidenza, 4)}</td>
                  <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(r.perSpecie.suino.costoAllocato)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.perSpecie.suino.incidenza, 4)}</td>
                  <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(r.perSpecie.ovino.costoAllocato)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.perSpecie.ovino.incidenza, 4)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: `2px solid ${C.border}`, fontWeight: 700, background: C.bg }}>
                <td style={td}>Totale</td>
                <td style={{ ...td, textAlign: "right" }}>{formattaEuro(righe.reduce((s, r) => s + r.imponibileComplessivo, 0))}</td>
                <td style={{ ...td, textAlign: "right" }}>{formattaEuro(righe.reduce((s, r) => s + r.tassoArea, 0), 4)}</td>
                <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(righe.reduce((s, r) => s + r.perSpecie.bovino.costoAllocato, 0))}</td>
                <td style={{ ...td, textAlign: "right" }}>{formattaEuro(righe.reduce((s, r) => s + r.perSpecie.bovino.incidenza, 0), 4)}</td>
                <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(righe.reduce((s, r) => s + r.perSpecie.suino.costoAllocato, 0))}</td>
                <td style={{ ...td, textAlign: "right" }}>{formattaEuro(righe.reduce((s, r) => s + r.perSpecie.suino.incidenza, 0), 4)}</td>
                <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(righe.reduce((s, r) => s + r.perSpecie.ovino.costoAllocato, 0))}</td>
                <td style={{ ...td, textAlign: "right" }}>{formattaEuro(righe.reduce((s, r) => s + r.perSpecie.ovino.incidenza, 0), 4)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        </>
      )}

      {rigaRossa && rigaRossa.length > 0 && (
        <div style={{ background: "#FDECEC", border: `1.5px solid ${C.red}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 8 }}>⚠️ ORTO, ANIMALI NON D'ALLEVAMENTO E AMMORTAMENTI SENZA IMPUTAZIONE</div>
          <table style={{ width: "100%", fontSize: 13 }}>
            <thead>
              <tr style={{ color: C.muted, textAlign: "left" }}>
                <th style={{ padding: "4px 8px" }}></th>
                <th style={{ padding: "4px 8px", textAlign: "right" }}>Imponibile complessivo</th>
                <th style={{ padding: "4px 8px", textAlign: "right" }}>€/UBA-gg (tutte le specie)</th>
              </tr>
            </thead>
            <tbody>
              {rigaRossa.map(r => (
                <tr key={r.label} style={{ borderTop: `1px solid ${C.red}55` }}>
                  <td style={{ padding: "6px 8px", fontWeight: 700, color: C.red }}>{r.label}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: C.red }}>{formattaEuro(r.valore)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: C.red }}>{formattaEuro(r.tasso, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: C.text, marginTop: 8 }}>
            Non si spalmano su nessuna specie — l'incidenza è calcolata sul totale degli UBA-giorni produttivi di Bovini+Suini+Ovini, come dato di confronto.
          </div>
        </div>
      )}
    </div>
  );
}

const th = { padding: "8px 8px", textAlign: "center", fontSize: 11, fontWeight: 700 };
const td = { padding: "6px 8px", fontSize: 12 };
