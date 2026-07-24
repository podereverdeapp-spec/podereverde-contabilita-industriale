import { useState, Fragment } from "react";
import { C } from "./style";
import { calcolaDatiPerArea, calcolaDatiPerAreaCentro } from "./calcoloReportCosti";
import { formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

// Unisce le righe di 4 anni per una data chiave (area, o area+centro), restituendo
// per ognuna i 4 valori annuali + la media. Le aree assenti in un anno valgono 0 quell'anno.
function unisciPerChiave(datiPerAnno, estraiChiavi, estraiValori) {
  const tutteChiavi = [...new Set(datiPerAnno.flatMap(d => estraiChiavi(d)))];
  return tutteChiavi.map(chiave => {
    const valoriPerAnno = datiPerAnno.map(d => estraiValori(d, chiave));
    const media = {};
    const campi = Object.keys(valoriPerAnno[0] || {});
    campi.forEach(campo => {
      media[campo] = round2(valoriPerAnno.reduce((s, v) => s + (v[campo] || 0), 0) / valoriPerAnno.length);
    });
    return { chiave, valoriPerAnno, media };
  });
}

export default function ReportStorico({ specieFiltro, titolo }) {
  const [annoBase, setAnnoBase] = useState(new Date().getFullYear());
  const [calcolando, setCalcolando] = useState(false);
  const [risultato, setRisultato] = useState(null);

  const anni = [annoBase, annoBase - 1, annoBase - 2, annoBase - 3];

  async function calcola() {
    setCalcolando(true);
    setRisultato(null);
    try {
      const datiPerArea = await Promise.all(anni.map(a => calcolaDatiPerArea(a).catch(() => ({ righe: [], rigaRossa: [] }))));
      const datiPerAreaCentro = await Promise.all(anni.map(a => calcolaDatiPerAreaCentro(a).catch(() => ({ gruppi: [], rigaRossa: [] }))));

      function valoriArea(d, area) {
        const r = d.righe.find(x => x.area === area);
        if (!r) return { imponibile: 0, tasso: 0, costoAllocato: 0, incidenza: 0 };
        return specieFiltro
          ? { costoAllocato: r.perSpecie[specieFiltro].costoAllocato, incidenza: r.perSpecie[specieFiltro].incidenza }
          : { imponibile: r.imponibileComplessivo, tasso: r.tassoArea };
      }
      const righeArea = unisciPerChiave(datiPerArea, d => d.righe.map(r => r.area), valoriArea);

      function valoriRossa(d, label) {
        const r = d.rigaRossa.find(x => x.label === label);
        return { valore: r ? r.valore : 0, tasso: r ? r.tasso : 0 };
      }
      const rigaRossa = unisciPerChiave(datiPerArea, d => d.rigaRossa.map(r => r.label), valoriRossa);

      // Disaggregato per Centro di Costo/Categoria (chiave = "Area||Centro")
      function chiaviCentro(d) {
        return d.gruppi.flatMap(g => g.sottoRighe.map(sr => `${g.area}||${sr.etichetta}`));
      }
      function valoriCentro(d, chiaveCompleta) {
        const [area, etichetta] = chiaveCompleta.split("||");
        const gruppo = d.gruppi.find(g => g.area === area);
        const sr = gruppo?.sottoRighe.find(s => s.etichetta === etichetta);
        if (!sr) return { imponibile: 0, tasso: 0, costoAllocato: 0, incidenza: 0 };
        return specieFiltro
          ? { costoAllocato: sr.perSpecie[specieFiltro].costoAllocato, incidenza: sr.perSpecie[specieFiltro].incidenza }
          : { imponibile: sr.imponibileComplessivo, tasso: sr.tassoArea };
      }
      const righeCentro = unisciPerChiave(datiPerAreaCentro, chiaviCentro, valoriCentro)
        .map(r => { const [area, etichetta] = r.chiave.split("||"); return { ...r, area, etichetta }; });

      setRisultato({ righeArea, rigaRossa, righeCentro });
    } catch (err) {
      alert(`⚠️ Errore nel calcolo storico:\n\n${err.message}`);
    }
    setCalcolando(false);
  }

  const campo1 = specieFiltro ? "costoAllocato" : "imponibile";
  const campo2 = specieFiltro ? "incidenza" : "tasso";
  const labelCampo1 = specieFiltro ? "Costo allocato" : "Imponibile";
  const labelCampo2 = "€/UBA-gg";

  function esporta() {
    function righeExcelDa(righe, etichettaFn, c1 = campo1, c2 = campo2, l1 = labelCampo1, l2 = labelCampo2) {
      return righe.map(r => {
        const riga = { "Voce": etichettaFn(r) };
        anni.forEach((a, i) => {
          riga[`${l1} ${a}`] = numeroExcel(r.valoriPerAnno[i][c1]);
          riga[`${l2} ${a}`] = numeroExcel(r.valoriPerAnno[i][c2]);
        });
        riga[`${l1} Media`] = numeroExcel(r.media[c1]);
        riga[`${l2} Media`] = numeroExcel(r.media[c2]);
        return riga;
      });
    }
    esportaExcel(`ReportStorico_${specieFiltro || "Generale"}_${annoBase}`, [
      { nome: "Per Area", righe: righeExcelDa(risultato.righeArea, r => r.chiave) },
      { nome: "Orto e Non Allevamento", righe: righeExcelDa(risultato.rigaRossa, r => r.chiave, "valore", "tasso", "Imponibile", "€/UBA-gg") },
      { nome: "Per Centro di Costo", righe: righeExcelDa(risultato.righeCentro, r => `${r.area} - ${r.etichetta}`) },
    ]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Confronto tra l'anno scelto e i 3 precedenti, con la media dei 4 — per vedere l'andamento nel tempo dell'efficacia della contabilità industriale.{titolo && ` (${titolo})`}
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Anno più recente del confronto</label>
            <input type="number" value={annoBase} onChange={e => setAnnoBase(parseInt(e.target.value))}
              style={{ padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, width: 100 }} />
          </div>
          <button onClick={calcola} disabled={calcolando}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {calcolando ? "Calcolo (4 anni)..." : "📊 Calcola confronto"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Confronta {anni.slice().reverse().join(", ")} — gli anni non ancora caricati mostreranno semplicemente 0.</div>
      </div>

      {risultato && (
        <>
          <button onClick={esporta}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 16 }}>
            📥 Esporta Excel
          </button>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>PER AREA</div>
          <TabellaConfronto righe={risultato.righeArea} anni={anni} campo1={campo1} campo2={campo2} labelCampo1={labelCampo1} labelCampo2={labelCampo2} etichettaRiga={r => r.chiave} />

          {risultato.rigaRossa.length > 0 && (
            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 8 }}>⚠️ ORTO, ANIMALI NON D'ALLEVAMENTO E AMMORTAMENTI SENZA IMPUTAZIONE</div>
              <TabellaConfronto righe={risultato.rigaRossa} anni={anni} campo1="valore" campo2="tasso" labelCampo1="Imponibile" labelCampo2="€/UBA-gg" etichettaRiga={r => r.chiave} rosso />
            </div>
          )}

          <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginTop: 24, marginBottom: 8 }}>DISAGGREGATO PER CENTRO DI COSTO / CATEGORIA AMMORTAMENTO</div>
          <TabellaConfronto righe={risultato.righeCentro} anni={anni} campo1={campo1} campo2={campo2} labelCampo1={labelCampo1} labelCampo2={labelCampo2}
            etichettaRiga={r => `${r.area} ↳ ${r.etichetta}`} />
        </>
      )}
    </div>
  );
}

function TabellaConfronto({ righe, anni, campo1, campo2, labelCampo1, labelCampo2, etichettaRiga, rosso }) {
  if (righe.length === 0) return <p style={{ color: C.muted, fontSize: 13 }}>Nessun dato.</p>;
  const coloreTesto = rosso ? C.red : C.text;
  return (
    <div style={{ background: C.card, border: `1px solid ${rosso ? C.red : C.border}`, borderRadius: 12, overflow: "auto", marginBottom: 8 }}>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead style={{ background: rosso ? "#FDECEC" : C.primary, color: rosso ? C.red : "#fff" }}>
          <tr>
            <th style={th} rowSpan={2}></th>
            {anni.map((a, i) => <th key={a} style={{ ...th, borderLeft: i === 0 ? undefined : "1px solid #ffffff55" }} colSpan={2}>{a}</th>)}
            <th style={{ ...th, borderLeft: "1px solid #ffffff55" }} colSpan={2}>Media 4 anni</th>
          </tr>
          <tr>
            {anni.map(a => <Fragment key={a}>
              <th style={th}>{labelCampo1}</th>
              <th style={th}>{labelCampo2}</th>
            </Fragment>)}
            <th style={th}>{labelCampo1}</th>
            <th style={th}>{labelCampo2}</th>
          </tr>
        </thead>
        <tbody>
          {righe.map(r => (
            <tr key={r.chiave} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ ...td, fontWeight: 700, color: coloreTesto }}>{etichettaRiga(r)}</td>
              {r.valoriPerAnno.map((v, i) => (
                <Fragment key={i}>
                  <td style={{ ...td, textAlign: "right", color: coloreTesto }}>{formattaEuro(v[campo1])}</td>
                  <td style={{ ...td, textAlign: "right", color: coloreTesto }}>{formattaEuro(v[campo2], 4)}</td>
                </Fragment>
              ))}
              <td style={{ ...td, textAlign: "right", fontWeight: 700, color: coloreTesto }}>{formattaEuro(r.media[campo1])}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700, color: coloreTesto }}>{formattaEuro(r.media[campo2], 4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = { padding: "6px 8px", textAlign: "center", fontSize: 10, fontWeight: 700 };
const td = { padding: "5px 8px", fontSize: 11 };
