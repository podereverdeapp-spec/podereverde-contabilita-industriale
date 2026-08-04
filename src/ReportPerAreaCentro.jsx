import { useState, Fragment } from "react";
import { C } from "./style";
import { calcolaDatiPerAreaCentro } from "./calcoloReportCosti";
import { formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

export default function ReportPerAreaCentro({ anno }) {
  const [calcolando, setCalcolando] = useState(false);
  const [gruppi, setGruppi] = useState(null);
  const [rigaRossa, setRigaRossa] = useState(null);
  const [espansi, setEspansi] = useState({});

  async function calcola() {
    setCalcolando(true);
    setGruppi(null);
    setRigaRossa(null);
    try {
      const { gruppi: g, rigaRossa: rr } = await calcolaDatiPerAreaCentro(anno);
      if (g.length === 0 && rr.length === 0) {
        alert(`Nessun dato trovato per l'anno ${anno}. Verifica prima con "Report UBA".`);
      }
      setGruppi(g);
      setRigaRossa(rr);
    } catch (err) {
      alert(`⚠️ Errore nel calcolo:\n\n${err.message}`);
    }
    setCalcolando(false);
  }

  function toggleEspanso(area) {
    setEspansi(prev => ({ ...prev, [area]: !prev[area] }));
  }

  function esporta() {
    const righeExcel = gruppi.flatMap(g => [
      {
        "Area / Centro": g.area, "Imponibile complessivo": numeroExcel(g.riga.imponibileComplessivo), "€/UBA-gg (tutte le specie)": numeroExcel(g.riga.tassoArea),
        "Bovini - Costo allocato": numeroExcel(g.riga.perSpecie.bovino.costoAllocato), "Bovini - €/UBA-gg": numeroExcel(g.riga.perSpecie.bovino.incidenza),
        "Suini - Costo allocato": numeroExcel(g.riga.perSpecie.suino.costoAllocato), "Suini - €/UBA-gg": numeroExcel(g.riga.perSpecie.suino.incidenza),
        "Ovini - Costo allocato": numeroExcel(g.riga.perSpecie.ovino.costoAllocato), "Ovini - €/UBA-gg": numeroExcel(g.riga.perSpecie.ovino.incidenza),
      },
      ...g.sottoRighe.map(sr => ({
        "Area / Centro": `  ↳ ${sr.etichetta}`, "Imponibile complessivo": numeroExcel(sr.imponibileComplessivo), "€/UBA-gg (tutte le specie)": numeroExcel(sr.tassoArea),
        "Bovini - Costo allocato": numeroExcel(sr.perSpecie.bovino.costoAllocato), "Bovini - €/UBA-gg": numeroExcel(sr.perSpecie.bovino.incidenza),
        "Suini - Costo allocato": numeroExcel(sr.perSpecie.suino.costoAllocato), "Suini - €/UBA-gg": numeroExcel(sr.perSpecie.suino.incidenza),
        "Ovini - Costo allocato": numeroExcel(sr.perSpecie.ovino.costoAllocato), "Ovini - €/UBA-gg": numeroExcel(sr.perSpecie.ovino.incidenza),
      })),
    ]);
    const righeRossaExcel = rigaRossa.map(r => ({ "Voce": r.label, "Imponibile complessivo": numeroExcel(r.valore), "€/UBA-gg (tutte le specie)": numeroExcel(r.tasso) }));
    esportaExcel(`ReportPerAreaCentro_${anno}`, [
      { nome: "Per Area e Centro", righe: righeExcel },
      { nome: "Orto e Non Allevamento", righe: righeRossaExcel },
    ]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Come Report per Area, ma con il dettaglio di ogni Centro di Costo sotto l'area (per gli Ammortamenti, la Categoria Ammortamento fa le veci del centro di costo). Clicca su un'area per espandere.
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <button onClick={calcola} disabled={calcolando}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {calcolando ? "Calcolo..." : "📊 Calcola"}
        </button>
      </div>

      {gruppi && (
        <>
          <button onClick={esporta}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 16 }}>
            📥 Esporta Excel
          </button>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto", marginBottom: 16 }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead style={{ background: C.primary, color: "#fff", position: "sticky", top: 0, zIndex: 1 }}>
              <tr>
                <th style={th} rowSpan={2}>Area / Centro di Costo</th>
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
              {gruppi.map(g => (
                <Fragment key={g.area}>
                  <tr key={g.area} onClick={() => toggleEspanso(g.area)}
                    style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer", background: C.primary + "10" }}>
                    <td style={{ ...td, fontWeight: 800 }}>{espansi[g.area] ? "▼" : "▶"} {g.area}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(g.riga.imponibileComplessivo)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(g.riga.tassoArea, 4)}</td>
                    <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(g.riga.perSpecie.bovino.costoAllocato)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(g.riga.perSpecie.bovino.incidenza, 4)}</td>
                    <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(g.riga.perSpecie.suino.costoAllocato)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(g.riga.perSpecie.suino.incidenza, 4)}</td>
                    <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(g.riga.perSpecie.ovino.costoAllocato)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(g.riga.perSpecie.ovino.incidenza, 4)}</td>
                  </tr>
                  {espansi[g.area] && g.sottoRighe.map(sr => (
                    <tr key={g.area + sr.etichetta} style={{ borderTop: `1px solid ${C.border}`, background: "#FAFAF8" }}>
                      <td style={{ ...td, paddingLeft: 28, color: C.muted }}>↳ {sr.etichetta}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(sr.imponibileComplessivo)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(sr.tassoArea, 4)}</td>
                      <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(sr.perSpecie.bovino.costoAllocato)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(sr.perSpecie.bovino.incidenza, 4)}</td>
                      <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(sr.perSpecie.suino.costoAllocato)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(sr.perSpecie.suino.incidenza, 4)}</td>
                      <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(sr.perSpecie.ovino.costoAllocato)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(sr.perSpecie.ovino.incidenza, 4)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr style={{ borderTop: `2px solid ${C.border}`, fontWeight: 700, background: C.bg }}>
                <td style={td}>Totale</td>
                <td style={{ ...td, textAlign: "right" }}>{formattaEuro(gruppi.reduce((s, g) => s + g.riga.imponibileComplessivo, 0))}</td>
                <td style={{ ...td, textAlign: "right" }}>{formattaEuro(gruppi.reduce((s, g) => s + g.riga.tassoArea, 0), 4)}</td>
                <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(gruppi.reduce((s, g) => s + g.riga.perSpecie.bovino.costoAllocato, 0))}</td>
                <td style={{ ...td, textAlign: "right" }}>{formattaEuro(gruppi.reduce((s, g) => s + g.riga.perSpecie.bovino.incidenza, 0), 4)}</td>
                <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(gruppi.reduce((s, g) => s + g.riga.perSpecie.suino.costoAllocato, 0))}</td>
                <td style={{ ...td, textAlign: "right" }}>{formattaEuro(gruppi.reduce((s, g) => s + g.riga.perSpecie.suino.incidenza, 0), 4)}</td>
                <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(gruppi.reduce((s, g) => s + g.riga.perSpecie.ovino.costoAllocato, 0))}</td>
                <td style={{ ...td, textAlign: "right" }}>{formattaEuro(gruppi.reduce((s, g) => s + g.riga.perSpecie.ovino.incidenza, 0), 4)}</td>
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
        </div>
      )}
    </div>
  );
}

const th = { padding: "8px 8px", textAlign: "center", fontSize: 11, fontWeight: 700 };
const td = { padding: "6px 8px", fontSize: 12 };
