// Versione 325 (29/10/2026): Alimentaria → Razioni attive e Controllo costi → Bovini, Suini, Ovini.
// In alto le razioni in uso (salvate con «Metti in uso» in Costruisci razione; per i suini la «Composizione Razioni»),
// sotto il confronto tra il consumo teorico delle razioni e quello reale (acquisti + produzione aziendale).
import { useState, useEffect } from "react";
import { C } from "./style";
import { formattaNumero, formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { caricaRazioniSpecie, confrontoSpecie, PARAMETRI_INIZIALI, PRODOTTI_SUINI_ALIMENTI } from "./calcoloControlloRazioni";
import RazioniSuiniComposizione from "./RazioniSuiniComposizione";
import RazioniSuiniConsumi from "./RazioniSuiniConsumi";

const NOMI = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };
const ICONE = { bovino: "🐄", suino: "🐖", ovino: "🐑" };
const dataIt = d => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const th = { padding: "7px 8px", textAlign: "left", background: C.primary, color: "#fff", fontWeight: 700, fontSize: 12, verticalAlign: "bottom" };
const td = { padding: "6px 8px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
const num = { ...td, textAlign: "right", whiteSpace: "nowrap" };
const box = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 18 };
const kg = v => (v ? formattaNumero(v, 0) : "—");
const SOGLIA_PCT = 20;

function elencoAlimenti(alimenti) {
  return (alimenti || []).filter(x => x.alimento && Number(x.quantita) > 0)
    .map(x => `${x.alimento} ${formattaNumero(Number(x.quantita), x.unita === "grammi" ? 0 : 2)} ${x.unita === "grammi" ? "g" : "kg"}`).join(" · ");
}

export default function ControlloRazioniSpecie({ specie, onNavigate }) {
  const annoCorrente = new Date().getFullYear();
  const [raz, setRaz] = useState(null);
  const [erroreRaz, setErroreRaz] = useState(null);
  const [mostraStorico, setMostraStorico] = useState(false);
  const [anno, setAnno] = useState(annoCorrente);
  const [parametri, setParametri] = useState(PARAMETRI_INIZIALI);
  const [dati, setDati] = useState(null);
  const [calcolo, setCalcolo] = useState(false);
  const [errore, setErrore] = useState(null);

  useEffect(() => {
    setRaz(null); setDati(null); setErrore(null);
    if (specie === "suino") return;
    caricaRazioniSpecie(specie).then(setRaz).catch(e => setErroreRaz(e.message));
  }, [specie]);

  async function calcola() {
    setCalcolo(true); setErrore(null); setDati(null);
    try { setDati(await confrontoSpecie(specie, anno, parametri)); } catch (e) { setErrore(e.message); }
    setCalcolo(false);
  }

  function esporta() {
    if (!dati) return;
    esportaExcel(`Controllo_razioni_${NOMI[specie]}_${anno}`, [
      { nome: "Confronto per alimento", righe: dati.righe.map(r => ({
        "Alimento": r.alimento, "Teorico dalle razioni (kg)": numeroExcel(r.kgTeorico), "Acquistato (kg)": numeroExcel(r.kgAcquistato),
        "Prodotto in azienda (kg)": numeroExcel(r.kgProdotto), "Reale (kg)": numeroExcel(r.kgReale), "Differenza (kg)": numeroExcel(r.differenzaKg),
        "Differenza (%)": r.differenzaPct, "Euro degli acquisti": numeroExcel(r.euroAcquisti), "Costo della produzione aziendale (già nei costi)": numeroExcel(r.euroProduzione),
        "Prezzo medio (euro al kg)": r.prezzoKg != null ? Math.round(r.prezzoKg * 1000) / 1000 : null, "Differenza (euro)": numeroExcel(r.differenzaEuro),
      })) },
      ...(dati.classi.length ? [{ nome: "Classi", righe: dati.classi.map(c => ({ "Classe": c.classe, "Capi medi": c.capiMedi, "Giorni-capo": c.giorniCapo, "Razioni usate": c.razioni.join("; "), "Giorni-capo senza razione": c.giorniSenzaRazione })) }] : []),
    ]);
  }

  const classiSenza = raz ? raz.classi.filter(c => !raz.inUso.some(r => r.classe === c.classe)) : [];
  const anni = []; for (let a = annoCorrente; a >= 2019; a--) anni.push(a);

  return (
    <div style={{ padding: 20, maxWidth: 1300 }}>
      <h1 style={{ color: C.primary, fontSize: 24, margin: "0 0 4px" }}>{ICONE[specie]} {NOMI[specie]} — razioni attive e controllo dei costi</h1>
      <p style={{ color: C.muted, fontSize: 13, marginTop: 0, maxWidth: 1000 }}>
        In alto le razioni in uso per ogni classe; sotto il confronto, anno per anno, tra quello che gli animali dovrebbero mangiare secondo le razioni
        (razione × capi presenti nella classe, giorno per giorno, contati dal registro) e quello che è arrivato davvero: acquistato con le fatture
        e prodotto in azienda. Gli acquisti «Generali» e quelli di più specie si dividono in base agli UBA, come nel Report Costi.
      </p>

      {/* 1. Razioni in uso */}
      <div style={box}>
        <div style={{ fontWeight: 800, color: C.primary, fontSize: 16, marginBottom: 8 }}>1. Razioni in uso</div>
        {specie === "suino" ? (
          <>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
              Per i suini le razioni sono scritte per categoria e per anno nella tabella qui sotto (la «Composizione Razioni» di prima).
              Nel confronto i prodotti diventano alimenti dell'anagrafe così: {Object.entries(PRODOTTI_SUINI_ALIMENTI).map(([p, a]) => `${p} → ${a}`).join("; ")}.
            </div>
            <RazioniSuiniComposizione />
          </>
        ) : erroreRaz ? <div style={{ color: C.red }}>Errore: {erroreRaz}</div> : !raz ? <div style={{ color: C.muted }}>Caricamento…</div> : (
          <>
            {!raz.colonneUso && <div style={{ background: "#FFF4D6", border: `2px solid ${C.yellow}`, padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 10 }}>⚠️ Il database non ha ancora le colonne della versione 324 (file contabilita_strutture_v324.sql): nessuna razione risulta in uso.</div>}
            <table style={{ fontSize: 12.5 }}>
              <thead><tr>{["Classe", "Razione in uso", "In uso dal", "Alimenti per capo al giorno"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {raz.classi.map(c => {
                  const r = raz.inUso.find(x => x.classe === c.classe);
                  return (
                    <tr key={c.classe} style={{ background: r ? undefined : "#FDF1EF" }}>
                      <td style={{ ...td, fontWeight: 700 }}>{c.classe}</td>
                      <td style={td}>{r ? r.nome : <span style={{ color: C.red, fontWeight: 700 }}>⚠️ nessuna razione in uso</span>}</td>
                      <td style={td}>{r ? dataIt(r.in_uso_dal) : ""}</td>
                      <td style={{ ...td, fontSize: 12 }}>{r ? elencoAlimenti(r.alimenti) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, fontSize: 13, flexWrap: "wrap" }}>
              {classiSenza.length > 0 && <span style={{ color: C.red, fontWeight: 700 }}>⚠️ {classiSenza.length} {classiSenza.length === 1 ? "classe" : "classi"} senza razione in uso: i loro capi non entrano nel teorico.</span>}
              <button onClick={() => onNavigate && onNavigate("costruisci-razione")} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontWeight: 700 }}>Vai a Costruisci razione</button>
              <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={mostraStorico} onChange={e => setMostraStorico(e.target.checked)} /> Mostra lo storico ({raz.storico.length})</label>
            </div>
            {mostraStorico && raz.storico.length > 0 && (
              <table style={{ fontSize: 12.5, marginTop: 10 }}>
                <thead><tr>{["Classe", "Razione", "Dal", "Al", "Alimenti per capo al giorno"].map(h => <th key={h} style={{ ...th, background: C.muted }}>{h}</th>)}</tr></thead>
                <tbody>{raz.storico.map(r => <tr key={r.id}><td style={td}>{r.classe}</td><td style={td}>{r.nome}</td><td style={td}>{dataIt(r.in_uso_dal)}</td><td style={td}>{dataIt(r.in_uso_al)}</td><td style={{ ...td, fontSize: 12 }}>{elencoAlimenti(r.alimenti)}</td></tr>)}</tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* 2. Confronto */}
      <div style={box}>
        <div style={{ fontWeight: 800, color: C.primary, fontSize: 16, marginBottom: 8 }}>2. Confronto tra razioni e acquisti</div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12, fontSize: 13 }}>
          <label>Anno<br /><select value={anno} onChange={e => setAnno(Number(e.target.value))} style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}` }}>{anni.map(a => <option key={a}>{a}</option>)}</select></label>
          {specie === "bovino" && <>
            <label>Giorni di finissaggio prima della macellazione<br /><input type="number" min={30} max={60} value={parametri.giorniFinissaggio} onChange={e => setParametri(p => ({ ...p, giorniFinissaggio: Math.min(60, Math.max(30, Number(e.target.value) || 45)) }))} style={{ width: 90, padding: 6, borderRadius: 6, border: `1px solid ${C.border}` }} /></label>
            <label>Mesi di lattazione dopo il parto<br /><input type="number" min={1} max={10} value={parametri.mesiLattazioneBovini} onChange={e => setParametri(p => ({ ...p, mesiLattazioneBovini: Math.max(1, Number(e.target.value) || 5) }))} style={{ width: 90, padding: 6, borderRadius: 6, border: `1px solid ${C.border}` }} /></label>
          </>}
          <button onClick={calcola} disabled={calcolo} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700 }}>{calcolo ? "Calcolo in corso…" : "Calcola"}</button>
          {dati && <button onClick={esporta} style={{ background: C.muted, color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700 }}>Esporta in Excel</button>}
        </div>
        {specie === "ovino" && <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>Pecora: fine gestazione = 6 settimane prima del parto; gestazione primi 3 mesi = da 150 giorni a 6 settimane prima; lattazione = 60 giorni dopo il parto (classe ancora da creare). Gli agnelloni non registrati entrano dai parti verificati nella pagina «Ovini da verificare con Sborchia» (cartella Animali).</div>}
        {errore && <div style={{ color: C.red, marginBottom: 10 }}>Errore: {errore}</div>}
        {dati && <>
          {dati.nota && <div style={{ background: "#FFF4D6", border: `2px solid ${C.yellow}`, padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 10 }}>⚠️ {dati.nota}</div>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            {[["Teorico dalle razioni", kg(dati.totali.kgTeorico) + " kg"], ["Reale (acquistato e prodotto)", kg(dati.totali.kgReale) + " kg"],
              ["Euro degli acquisti", formattaEuro(dati.totali.euroAcquisti)], ["Costo della produzione aziendale (già nei costi)", formattaEuro(dati.totali.euroProduzione)],
              ["Differenza in euro (reale − teorico)", formattaEuro(dati.totali.differenzaEuro)]].map(([t, v]) => (
              <div key={t} style={{ background: "#F4F8F2", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", minWidth: 170 }}><div style={{ fontSize: 11.5, color: C.muted }}>{t}</div><div style={{ fontWeight: 800, fontSize: 16 }}>{v}</div></div>
            ))}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ fontSize: 12.5, minWidth: 1100 }}>
              <thead><tr>{["Alimento", "Teorico dalle razioni (kg)", "Acquistato (kg)", "Prodotto in azienda (kg)", "Reale (kg)", "Differenza (kg)", "Differenza (%)", "Euro degli acquisti", "Costo della produzione (già nei costi)", "Prezzo medio (euro al kg)", "Differenza (euro)"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {dati.righe.map(r => {
                  const fuori = r.differenzaPct == null ? r.kgReale > 0 : Math.abs(r.differenzaPct) > SOGLIA_PCT;
                  return (
                    <tr key={r.alimento}>
                      <td style={{ ...td, fontWeight: 700 }}>{r.alimento}</td>
                      <td style={num}>{kg(r.kgTeorico)}</td><td style={num}>{kg(r.kgAcquistato)}</td><td style={num}>{kg(r.kgProdotto)}</td>
                      <td style={{ ...num, fontWeight: 700 }}>{kg(r.kgReale)}</td>
                      <td style={{ ...num, color: fuori ? C.red : C.text, fontWeight: fuori ? 700 : 400 }}>{formattaNumero(r.differenzaKg, 0)}</td>
                      <td style={{ ...num, color: fuori ? C.red : C.text, fontWeight: fuori ? 700 : 400 }}>{r.differenzaPct != null ? formattaNumero(r.differenzaPct, 1) + "%" : (r.kgReale > 0 ? "non in razione" : "—")}</td>
                      <td style={num}>{r.euroAcquisti ? formattaEuro(r.euroAcquisti) : "—"}</td><td style={num}>{r.euroProduzione ? formattaEuro(r.euroProduzione) : "—"}</td>
                      <td style={num}>{r.prezzoKg != null ? formattaNumero(r.prezzoKg, 3) : "—"}</td>
                      <td style={{ ...num, color: fuori ? C.red : C.text }}>{r.differenzaEuro != null ? formattaEuro(r.differenzaEuro) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>In rosso le differenze oltre il {SOGLIA_PCT}% e gli alimenti comprati ma assenti dalle razioni in uso. La produzione aziendale è fieno misto e fieno di medica (l'orzo conferito a Muratella e ricomprato come farina non si conta due volte); il suo costo è già nei costi degli animali attraverso le coltivazioni e qui si mostra solo per confronto.</div>

          {dati.classi.length > 0 && <>
            <div style={{ fontWeight: 700, color: C.primary, margin: "16px 0 6px" }}>Capi per classe nel {anno}{anno === annoCorrente ? " (fino a oggi)" : ""}</div>
            <table style={{ fontSize: 12.5 }}>
              <thead><tr>{["Classe", "Capi medi", "Giorni-capo", "Razioni usate", "Giorni-capo senza razione"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{dati.classi.map(c => (
                <tr key={c.classe}>
                  <td style={td}>{c.classe}</td><td style={num}>{formattaNumero(c.capiMedi, 2)}</td><td style={num}>{formattaNumero(c.giorniCapo, 0)}</td>
                  <td style={{ ...td, fontSize: 12 }}>{c.latte ? "latte della madre (nessuna razione)" : c.razioni.join("; ")}</td>
                  <td style={{ ...num, color: c.giorniSenzaRazione ? C.red : C.text, fontWeight: c.giorniSenzaRazione ? 700 : 400 }}>{c.giorniSenzaRazione ? "⚠️ " + formattaNumero(c.giorniSenzaRazione, 0) : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </>}
          {dati.anomalie.length > 0 && <div style={{ marginTop: 12, fontSize: 12.5 }}>
            <div style={{ fontWeight: 700, color: C.red }}>⚠️ Capi del registro non contati ({dati.anomalie.length})</div>
            <ul style={{ margin: "4px 0 0 18px", color: C.text }}>{dati.anomalie.map(a => <li key={a}>{a}</li>)}</ul>
          </div>}
        </>}
      </div>

      {/* 3. Suini: il calcolo «Consumi» di prima, per categoria e per prodotto */}
      {specie === "suino" && (
        <details style={box}>
          <summary style={{ fontWeight: 800, color: C.primary, fontSize: 16, cursor: "pointer" }}>3. Consumi per categoria e per prodotto (la pagina «Consumi» di prima)</summary>
          <RazioniSuiniConsumi />
        </details>
      )}
    </div>
  );
}
