// Versione 325 (29/10/2026): Alimentaria → Razioni attive e Controllo costi → Riepilogo bovini, suini e ovini.
// Le tre specie viste insieme per un anno: teorico dalle razioni, reale (acquistato + prodotto), differenze in chili e in euro.
import { useState } from "react";
import { C } from "./style";
import { formattaNumero, formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { caricaAcquistiAlimenti, confrontoSpecie, PARAMETRI_INIZIALI } from "./calcoloControlloRazioni";

const NOMI = { bovino: "🐄 Bovini", suino: "🐖 Suini", ovino: "🐑 Ovini" };
const th = { padding: "7px 8px", textAlign: "left", background: C.primary, color: "#fff", fontWeight: 700, fontSize: 12, verticalAlign: "bottom" };
const td = { padding: "7px 8px", borderBottom: `1px solid ${C.border}` };
const num = { ...td, textAlign: "right", whiteSpace: "nowrap" };

export default function RiepilogoControlloRazioni() {
  const annoCorrente = new Date().getFullYear();
  const [anno, setAnno] = useState(annoCorrente);
  const [dati, setDati] = useState(null);
  const [calcolo, setCalcolo] = useState(false);
  const [errore, setErrore] = useState(null);
  const anni = []; for (let a = annoCorrente; a >= 2019; a--) anni.push(a);

  async function calcola() {
    setCalcolo(true); setErrore(null); setDati(null);
    try {
      const acq = await caricaAcquistiAlimenti(anno);
      const ris = [];
      for (const sp of ["bovino", "suino", "ovino"]) ris.push(await confrontoSpecie(sp, anno, PARAMETRI_INIZIALI, acq));
      const pollame = acq.acquisti.reduce((s, a) => ({ kg: s.kg + a.pollame.kg, euro: s.euro + a.pollame.euro }), { kg: 0, euro: 0 });
      setDati({ ris, pollame });
    } catch (e) { setErrore(e.message); }
    setCalcolo(false);
  }

  const righe = dati ? dati.ris.map(r => ({ specie: r.specie, ...r.totali, differenzaKg: r.totali.kgReale - r.totali.kgTeorico, pct: r.totali.kgTeorico > 0 ? (r.totali.kgReale - r.totali.kgTeorico) / r.totali.kgTeorico * 100 : null, senzaRazione: r.classi.reduce((s, c) => s + c.giorniSenzaRazione, 0), nota: r.nota })) : [];
  const tot = righe.reduce((s, r) => ({ kgTeorico: s.kgTeorico + r.kgTeorico, kgReale: s.kgReale + r.kgReale, euroAcquisti: s.euroAcquisti + r.euroAcquisti, euroProduzione: s.euroProduzione + r.euroProduzione, differenzaEuro: s.differenzaEuro + r.differenzaEuro }), { kgTeorico: 0, kgReale: 0, euroAcquisti: 0, euroProduzione: 0, differenzaEuro: 0 });

  function esporta() {
    esportaExcel(`Riepilogo_controllo_razioni_${anno}`, [
      { nome: "Riepilogo", righe: righe.map(r => ({ "Specie": NOMI[r.specie].slice(3), "Teorico dalle razioni (kg)": numeroExcel(r.kgTeorico), "Reale (kg)": numeroExcel(r.kgReale), "Differenza (kg)": numeroExcel(r.differenzaKg), "Differenza (%)": r.pct != null ? numeroExcel(r.pct) : null, "Euro degli acquisti": numeroExcel(r.euroAcquisti), "Costo della produzione aziendale (già nei costi)": numeroExcel(r.euroProduzione), "Differenza (euro)": numeroExcel(r.differenzaEuro), "Giorni-capo senza razione": r.senzaRazione })) },
      ...dati.ris.map(r => ({ nome: NOMI[r.specie].slice(3), righe: r.righe.map(x => ({ "Alimento": x.alimento, "Teorico (kg)": numeroExcel(x.kgTeorico), "Reale (kg)": numeroExcel(x.kgReale), "Differenza (kg)": numeroExcel(x.differenzaKg), "Differenza (%)": x.differenzaPct, "Euro degli acquisti": numeroExcel(x.euroAcquisti), "Differenza (euro)": numeroExcel(x.differenzaEuro) })) })),
    ]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1200 }}>
      <h1 style={{ color: C.primary, fontSize: 24, margin: "0 0 4px" }}>📊 Riepilogo bovini, suini e ovini</h1>
      <p style={{ color: C.muted, fontSize: 13, marginTop: 0, maxWidth: 950 }}>Le tre specie insieme per l'anno scelto: quanto dovrebbero mangiare secondo le razioni in uso e quanto è arrivato davvero (acquistato e prodotto in azienda). Il dettaglio di ogni specie è nella sua pagina.</p>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 14, fontSize: 13 }}>
        <label>Anno<br /><select value={anno} onChange={e => setAnno(Number(e.target.value))} style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}` }}>{anni.map(a => <option key={a}>{a}</option>)}</select></label>
        <button onClick={calcola} disabled={calcolo} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700 }}>{calcolo ? "Calcolo in corso…" : "Calcola"}</button>
        {dati && <button onClick={esporta} style={{ background: C.muted, color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700 }}>Esporta in Excel</button>}
      </div>
      {errore && <div style={{ color: C.red }}>Errore: {errore}</div>}
      {dati && <>
        <table style={{ fontSize: 13, background: C.card }}>
          <thead><tr>{["Specie", "Teorico dalle razioni (kg)", "Reale (kg)", "Differenza (kg)", "Differenza (%)", "Euro degli acquisti", "Costo della produzione (già nei costi)", "Differenza (euro)", "Giorni-capo senza razione"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {righe.map(r => (
              <tr key={r.specie}>
                <td style={{ ...td, fontWeight: 700 }}>{NOMI[r.specie]}{r.nota ? <div style={{ fontSize: 11, color: C.red, fontWeight: 400 }}>⚠️ {r.nota}</div> : null}</td>
                <td style={num}>{formattaNumero(r.kgTeorico, 0)}</td><td style={num}>{formattaNumero(r.kgReale, 0)}</td>
                <td style={{ ...num, color: Math.abs(r.pct || 0) > 20 ? C.red : C.text, fontWeight: 700 }}>{formattaNumero(r.differenzaKg, 0)}</td>
                <td style={{ ...num, color: Math.abs(r.pct || 0) > 20 ? C.red : C.text }}>{r.pct != null ? formattaNumero(r.pct, 1) + "%" : "—"}</td>
                <td style={num}>{formattaEuro(r.euroAcquisti)}</td><td style={num}>{formattaEuro(r.euroProduzione)}</td>
                <td style={{ ...num, fontWeight: 700 }}>{formattaEuro(r.differenzaEuro)}</td>
                <td style={{ ...num, color: r.senzaRazione ? C.red : C.text }}>{r.senzaRazione ? "⚠️ " + formattaNumero(r.senzaRazione, 0) : "—"}</td>
              </tr>
            ))}
            <tr style={{ background: "#DCE8D8", fontWeight: 800 }}>
              <td style={td}>Totale</td><td style={num}>{formattaNumero(tot.kgTeorico, 0)}</td><td style={num}>{formattaNumero(tot.kgReale, 0)}</td>
              <td style={num}>{formattaNumero(tot.kgReale - tot.kgTeorico, 0)}</td><td style={num}>{tot.kgTeorico > 0 ? formattaNumero((tot.kgReale - tot.kgTeorico) / tot.kgTeorico * 100, 1) + "%" : "—"}</td>
              <td style={num}>{formattaEuro(tot.euroAcquisti)}</td><td style={num}>{formattaEuro(tot.euroProduzione)}</td><td style={num}>{formattaEuro(tot.differenzaEuro)}</td><td style={td}></td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Fuori dal riepilogo: mangimi per il pollame {formattaNumero(dati.pollame.kg, 0)} kg, {formattaEuro(dati.pollame.euro)} (pagina Pollame). Se una specie non ha razioni in uso, il teorico è zero e la differenza è tutta «reale»: prima si mettono in uso le razioni.</div>
      </>}
    </div>
  );
}
