import { useState, Fragment } from "react";
import { C } from "./style";
import { formattaNumero, formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { calcolaPerformanceEta } from "./calcoloPerformanceEta";

const SPECIE_LABEL = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };
const COLORE_COPPIA = "#FFF2DC";

export default function StoricoPerformanceEta() {
  const [annoBase, setAnnoBase] = useState(new Date().getFullYear());
  const [calcolando, setCalcolando] = useState(false);
  const [risultato, setRisultato] = useState(null);
  const [errore, setErrore] = useState(null);

  const anni = [annoBase, annoBase - 1, annoBase - 2, annoBase - 3];

  async function calcola() {
    setCalcolando(true);
    setErrore(null);
    setRisultato(null);
    try {
      // Stessa curva peso/IPG per tutti gli anni (costruita su tutti gli animali di
      // sempre — non abbiamo ancora abbastanza dati per farne una per anno) — cambia
      // solo il tasso mangime dell'anno, che già incorpora gli UBA-giorni REALI di
      // quell'anno (quanti animali c'erano davvero), da calcoloPerformanceEta.
      const datiPerAnno = await Promise.all(anni.map(a => calcolaPerformanceEta(a)));
      const perSpecie = {};
      for (const specie of ["bovino", "suino", "ovino"]) {
        const fasceUnite = new Map();
        datiPerAnno.forEach((d, i) => {
          const step = d[specie]?.stepVivoDaCurva;
          if (!step) return;
          step.forEach(s => {
            if (!fasceUnite.has(s.label)) fasceUnite.set(s.label, { label: s.label, perAnno: anni.map(() => ({ costo: null, kg: null })) });
            fasceUnite.get(s.label).perAnno[i] = { costo: s.costoMangimeKg, kg: s.fcrMangime };
          });
        });
        const righe = [...fasceUnite.values()].map(r => {
          const valoriValidi = r.perAnno.filter(v => v.costo != null);
          const mediaCosto = valoriValidi.length > 0 ? Math.round((valoriValidi.reduce((s, v) => s + v.costo, 0) / valoriValidi.length) * 100) / 100 : null;
          const valoriValidiKg = r.perAnno.filter(v => v.kg != null);
          const mediaKg = valoriValidiKg.length > 0 ? Math.round((valoriValidiKg.reduce((s, v) => s + v.kg, 0) / valoriValidiKg.length) * 100) / 100 : null;
          return { ...r, media: { costo: mediaCosto, kg: mediaKg } };
        });
        perSpecie[specie] = { righe, nAnimaliTotali: datiPerAnno[0][specie]?.nAnimaliTotali ?? 0 };
      }
      setRisultato(perSpecie);
    } catch (err) {
      setErrore(err.message);
    }
    setCalcolando(false);
  }

  function esporta() {
    if (!risultato) return;
    const fogli = [];
    for (const specie of ["bovino", "suino", "ovino"]) {
      const d = risultato[specie];
      if (!d || d.righe.length === 0) continue;
      const righeExcel = d.righe.map(r => {
        const riga = { "Fascia": r.label };
        anni.forEach((a, i) => {
          riga[`Costo/kg ${a}`] = r.perAnno[i].costo != null ? numeroExcel(r.perAnno[i].costo) : null;
          riga[`Kg alimenti/kg ${a}`] = r.perAnno[i].kg != null ? numeroExcel(r.perAnno[i].kg) : null;
        });
        riga["Costo/kg Media"] = r.media.costo != null ? numeroExcel(r.media.costo) : null;
        riga["Kg alimenti/kg Media"] = r.media.kg != null ? numeroExcel(r.media.kg) : null;
        return riga;
      });
      fogli.push({ nome: SPECIE_LABEL[specie], righe: righeExcel });
    }
    esportaExcel(`StoricoPerformanceEta_${annoBase}`, fogli);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Storico Performance per Fascia d'Età</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Confronto tra l'anno scelto e i 3 precedenti (+ media): come cambia il <strong>costo per kg di incremento peso</strong> e i <strong>kg di alimenti (mangimi+foraggio) per kg di incremento</strong>, fascia per fascia — stessa curva di crescita (peso ponderato M/F), ma tassi mangime+foraggio diversi per anno, che già riflettono quanti animali c'erano realmente in azienda in ciascun anno. Utile per vedere se, al crescere della mandria, l'efficienza migliora o peggiora.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <label style={{ fontSize: 13, color: C.muted }}>Anno più recente del confronto:</label>
        <input type="number" value={annoBase} onChange={e => setAnnoBase(parseInt(e.target.value))}
          style={{ width: 100, padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
        <button onClick={calcola} disabled={calcolando}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {calcolando ? "Calcolo (4 anni)..." : "📊 Calcola confronto"}
        </button>
      </div>
      <p style={{ fontSize: 11, color: C.muted, marginTop: -12, marginBottom: 20 }}>Confronta {anni.slice().reverse().join(", ")} — gli anni senza tasso mangime+foraggio armonizzato mostreranno "—".</p>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}

      {risultato && (
        <>
          <button onClick={esporta}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 20 }}>
            📥 Esporta Excel
          </button>
          {["bovino", "suino", "ovino"].map(specie => {
            const d = risultato[specie];
            if (!d || d.righe.length === 0) return null;
            return (
              <div key={specie} style={{ marginBottom: 28 }}>
                <h2 style={{ color: C.primary, fontSize: 18, marginBottom: 10 }}>{SPECIE_LABEL[specie]} ({d.nAnimaliTotali} animali)</h2>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
                  <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                    <thead style={{ background: C.primary, color: "#fff" }}>
                      <tr>
                        <th style={th} rowSpan={2}>Fascia</th>
                        {anni.map((a, i) => <th key={a} style={{ ...th, borderLeft: i === 0 ? undefined : "1px solid #ffffff55" }} colSpan={2}>{a}</th>)}
                        <th style={{ ...th, borderLeft: "1px solid #ffffff55" }} colSpan={2}>Media 4 anni</th>
                      </tr>
                      <tr>
                        {anni.map(a => (
                          <Fragment key={a}>
                            <th style={th}>Costo/kg</th>
                            <th style={th}>Kg alim./kg</th>
                          </Fragment>
                        ))}
                        <th style={th}>Costo/kg</th>
                        <th style={th}>Kg alim./kg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.righe.map((r, ri) => (
                        <tr key={ri} style={{ borderTop: `1px solid ${C.border}` }}>
                          <td style={{ ...td, fontWeight: 700, textAlign: "left" }}>{r.label}</td>
                          {r.perAnno.map((v, i) => (
                            <Fragment key={i}>
                              <td style={{ ...td, background: COLORE_COPPIA }}>{v.costo != null ? formattaEuro(v.costo, 2) : "—"}</td>
                              <td style={{ ...td, background: COLORE_COPPIA }}>{v.kg != null ? formattaNumero(v.kg, 2) : "—"}</td>
                            </Fragment>
                          ))}
                          <td style={{ ...td, background: COLORE_COPPIA, fontWeight: 700 }}>{r.media.costo != null ? formattaEuro(r.media.costo, 2) : "—"}</td>
                          <td style={{ ...td, background: COLORE_COPPIA, fontWeight: 700 }}>{r.media.kg != null ? formattaNumero(r.media.kg, 2) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

const th = { padding: "6px 8px", textAlign: "center", fontSize: 10, fontWeight: 700 };
const td = { padding: "5px 8px", fontSize: 11, textAlign: "right" };
