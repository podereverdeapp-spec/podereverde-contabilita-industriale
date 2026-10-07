// Versione 236 — Riepilogo Costi (Break Even): quanto è costato produrre un chilo di carcassa in un anno.
// Decisioni del Dott. Bizzarri del 07/10/2026: si divide per i capi MACELLATI nell'anno e per i chili di
// carcassa realmente prodotti (non per i capi presenti oggi); senza spese di macello e lavorazione; il
// costo dei capi non macellati passa all'anno dopo (valore degli animali in stalla).
// Sola lettura: nessuna scrittura nel database.
import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { formattaEuro, formattaNumero, round2 } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { statoCalcoli, testoAvvisoCalcoli } from "./statoCalcoli";
import { caricaDatiBase, capiAnno, valoreStalla, SPECIE, ETICHETTE } from "./calcoloBreakEven";

const leggi = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const euro = (n, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : formattaEuro(n, d));
const numero = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : formattaNumero(n, d));
const COLORE = { bovino: C.bovini, suino: C.suini, ovino: C.ovini };
const th = { padding: "6px 8px", textAlign: "right", fontSize: 11.5, background: C.bg, borderBottom: `1px solid ${C.border}` };
const td = { padding: "6px 8px", textAlign: "right", borderBottom: `1px solid ${C.border}` };
const casella = { padding: "5px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13.5, fontWeight: 700, width: 110 };

function calcolaSpecie(base, specie, anno) {
  const costi = base.costiAnno(anno, "BE");
  const cs = costi.perSpecie[specie];
  const capi = capiAnno(base, specie, anno);
  const inizio = valoreStalla(base, specie, anno - 1), fine = valoreStalla(base, specie, anno);
  const spese = round2(cs.fissi + cs.variabili);
  // chili dei capi macellati senza peso: stimati con il peso medio dei macellati dello stesso anno
  const pesoMedio = capi.macellatiConCarcassa > 0 ? capi.kgCarcassa / capi.macellatiConCarcassa : null;
  const senzaPeso = capi.macellati - capi.macellatiConCarcassa;
  const kgStimati = pesoMedio !== null ? senzaPeso * pesoMedio : 0;
  return { costi, cs, capi, inizio, fine, spese, pesoMedio, senzaPeso, kgStimati, kgTotali: capi.kgCarcassa + kgStimati,
    costoUscito: round2(spese + inizio.valore - fine.valore) };
}

export default function RiepilogoCostiBreakEven({ onNavigate }) {
  const [base, setBase] = useState(null);
  const [errore, setErrore] = useState("");
  const [avviso, setAvviso] = useState(null);
  const [anno, setAnno] = useState(null);
  const [scritti, setScritti] = useState({});

  useEffect(() => {
    caricaDatiBase().then(b => { setBase(b); const c = new Date().getFullYear(); setAnno(b.anniCalcolati.includes(c - 1) ? c - 1 : b.ultimoAnno); }).catch(e => setErrore(e.message));
    statoCalcoli().then(s => setAvviso(testoAvvisoCalcoli(s))).catch(() => {});
  }, []);

  const risultati = useMemo(() => (base && anno ? Object.fromEntries(SPECIE.map(s => [s, calcolaSpecie(base, s, anno)])) : null), [base, anno]);

  function scarica() {
    const righe = [];
    SPECIE.forEach(s => {
      const x = risultati[s];
      x.costi.perArea.forEach(a => righe.push({ "Specie": ETICHETTE[s], "Voce": a.area, "Costi variabili": numeroExcel(a.perSpecie[s].variabili), "Costi fissi": numeroExcel(a.perSpecie[s].fissi), "Totale": numeroExcel(a.perSpecie[s].variabili + a.perSpecie[s].fissi) }));
      righe.push({ "Specie": ETICHETTE[s], "Voce": "Spese di allevamento dell'anno", "Costi variabili": numeroExcel(x.cs.variabili), "Costi fissi": numeroExcel(x.cs.fissi), "Totale": numeroExcel(x.spese) });
      righe.push({ "Specie": ETICHETTE[s], "Voce": `Valore degli animali in stalla al 31/12/${anno - 1}`, "Costi variabili": "", "Costi fissi": "", "Totale": numeroExcel(x.inizio.valore) });
      righe.push({ "Specie": ETICHETTE[s], "Voce": `Valore degli animali in stalla al 31/12/${anno}`, "Costi variabili": "", "Costi fissi": "", "Totale": numeroExcel(x.fine.valore) });
      righe.push({ "Specie": ETICHETTE[s], "Voce": "Costo della carne uscita", "Costi variabili": "", "Costi fissi": "", "Totale": numeroExcel(x.costoUscito) });
    });
    esportaExcel(`Riepilogo_costi_break_even_${anno}`, [{ nome: `Riepilogo ${anno}`, righe }]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1150, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ color: C.primary, fontSize: 24, margin: "0 0 4px" }}>📋 Riepilogo Costi (Break Even)</h1>
          <p style={{ color: C.muted, margin: 0, fontSize: 13.5, maxWidth: 800, lineHeight: 1.5 }}>
            Quanto è costato, in un anno, produrre un chilo di carcassa: spese di allevamento dell'anno, più il valore degli animali in stalla a inizio anno,
            meno quello a fine anno, diviso per i chili di carcassa dei capi macellati. Senza spese di macello e lavorazione.
          </p>
        </div>
        <span style={{ display: "flex", gap: 8 }}>
          <button onClick={() => onNavigate?.("istr-break-even")} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>📖 Istruzioni del Break Even</button>
          {risultati && <button onClick={scarica} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>📥 Scarica Excel</button>}
        </span>
      </div>
      {avviso && <div style={{ background: "#FFF3E0", border: "1px solid #F0B44C", borderRadius: 8, padding: "8px 12px", marginTop: 14, fontSize: 13 }}>🔄 {avviso} Finché non si ricalcola, i numeri di questa pagina non sono definitivi.</div>}
      {base?.avvisiDati.map((t, i) => <div key={i} style={{ background: "#FFF8E1", border: `1px solid ${C.yellow}`, borderRadius: 8, padding: "8px 12px", marginTop: 8, fontSize: 13 }}>⚠️ {t}</div>)}
      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}
      {!base && !errore && <p style={{ color: C.muted }}>Caricamento dei dati…</p>}

      {risultati && (
        <>
          <div style={{ margin: "16px 0", fontSize: 13.5, fontWeight: 700 }}>
            Anno:{" "}
            <select value={anno} onChange={e => { setAnno(parseInt(e.target.value)); setScritti({}); }} style={{ ...casella, width: 110 }}>
              {base.anniCalcolati.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {!risultati.bovino.costi.haCalcolo && <span style={{ color: C.red, marginLeft: 10 }}>⚠️ Report Costi non salvato per il {anno}.</span>}
            {risultati.bovino.costi.lavorazioniEscluse > 0 && <span style={{ fontWeight: 400, color: C.muted, marginLeft: 10 }}>Spese di macello e lavorazione escluse (tutte le specie): {euro(risultati.bovino.costi.lavorazioniEscluse)}</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {SPECIE.map(s => <SchedaRiepilogo key={s} specie={s} anno={anno} x={risultati[s]}
              scritti={scritti[s] || {}} imposta={(k, v) => setScritti(p => ({ ...p, [s]: { ...(p[s] || {}), [k]: v } }))} />)}
          </div>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 14, lineHeight: 1.6 }}>
            Il valore degli animali in stalla è quanto sono costati fino a quella data i capi presenti che non sono riproduttori (acquisto, nascita e mantenimento
            salvati dal Report Costi e dal Report Riproduttori). I costi dei riproduttori passano ai figli attraverso il costo di nascita.
          </p>
        </>
      )}
    </div>
  );
}

function SchedaRiepilogo({ specie, anno, x, scritti, imposta }) {
  const { costi, cs, capi } = x;
  if (cs.fissi === 0 && cs.variabili === 0 && capi.macellati === 0 && capi.presenti === 0) return null;
  const capiUsati = scritti.capi !== undefined ? leggi(scritti.capi) : capi.macellati;
  const kgUsati = scritti.kg !== undefined ? leggi(scritti.kg) : x.kgTotali;
  const perCapo = capiUsati > 0 ? x.costoUscito / capiUsati : null;
  const perKg = kgUsati > 0 ? x.costoUscito / kgUsati : null;
  const perKgSenzaStalla = kgUsati > 0 ? x.spese / kgUsati : null;
  return (
    <div style={{ border: `2px solid ${COLORE[specie]}`, borderRadius: 14, overflow: "hidden", background: C.bg }}>
      <div style={{ background: COLORE[specie], color: "#fff", padding: "10px 16px", fontWeight: 800, fontSize: 17 }}>{ETICHETTE[specie]} — {anno}</div>
      <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 14 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Spese di allevamento dell'anno, per area</div>
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th style={{ ...th, textAlign: "left" }}>Area</th><th style={th}>Variabili</th><th style={th}>Fissi</th><th style={th}>Totale</th></tr></thead>
            <tbody>
              {costi.perArea.filter(a => a.perSpecie[specie].variabili + a.perSpecie[specie].fissi !== 0).map(a => (
                <tr key={a.area}><td style={{ ...td, textAlign: "left" }}>{a.area}</td><td style={td}>{euro(a.perSpecie[specie].variabili)}</td><td style={td}>{euro(a.perSpecie[specie].fissi)}</td>
                  <td style={td}>{euro(a.perSpecie[specie].variabili + a.perSpecie[specie].fissi)}</td></tr>))}
              <tr style={{ fontWeight: 800 }}><td style={{ ...td, textAlign: "left" }}>Totale</td><td style={td}>{euro(cs.variabili)}</td><td style={td}>{euro(cs.fissi)}</td><td style={td}>{euro(x.spese)}</td></tr>
            </tbody>
          </table>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, fontSize: 13 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Costo della carne uscita nell'anno</div>
          <table style={{ fontSize: 13 }}>
            <tbody>
              <tr><td style={{ ...td, textAlign: "left" }}>Spese di allevamento dell'anno</td><td style={td}>{euro(x.spese)}</td></tr>
              <tr><td style={{ ...td, textAlign: "left" }}>+ valore degli animali in stalla al 31/12/{anno - 1} ({numero(x.inizio.capi)} capi)</td><td style={td}>{euro(x.inizio.valore)}</td></tr>
              <tr><td style={{ ...td, textAlign: "left" }}>− valore degli animali in stalla al 31/12/{anno} ({numero(x.fine.capi)} capi)</td><td style={td}>{euro(x.fine.valore)}</td></tr>
              <tr style={{ fontWeight: 800 }}><td style={{ ...td, textAlign: "left" }}>= Costo della carne uscita</td><td style={td}>{euro(x.costoUscito)}</td></tr>
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 700 }}>Capi macellati
              <input type="text" inputMode="decimal" value={scritti.capi ?? String(capi.macellati)} onChange={e => imposta("capi", e.target.value)} style={{ ...casella, display: "block", marginTop: 3 }} />
              <span style={{ fontWeight: 400, color: C.muted, fontSize: 11 }}>reali: {capi.ingrasso} all'ingrasso + {capi.riforme} riforme</span>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>Chili di carcassa
              <input type="text" inputMode="decimal" value={scritti.kg ?? String(Math.round(x.kgTotali * 10) / 10).replace(".", ",")} onChange={e => imposta("kg", e.target.value)} style={{ ...casella, display: "block", marginTop: 3 }} />
              <span style={{ fontWeight: 400, color: C.muted, fontSize: 11 }}>pesati: {numero(capi.kgCarcassa, 1)} kg{x.senzaPeso > 0 ? ` + ${x.senzaPeso} ${x.senzaPeso === 1 ? "capo" : "capi"} senza peso, stimati ${numero(x.kgStimati, 1)} kg` : ""}</span>
            </label>
          </div>
          {x.senzaPeso > 0 && <div style={{ fontSize: 12, background: "#FFF6E5", border: "1px solid #F0B44C", borderRadius: 6, padding: "5px 8px", marginTop: 8 }}>
            ⚠️ {x.senzaPeso === 1 ? `1 capo macellato nel ${anno} non ha` : `${x.senzaPeso} capi macellati nel ${anno} non hanno`} il peso della carcassa: {x.senzaPeso === 1 ? "i suoi chili sono stimati" : "i loro chili sono stimati"} con il peso medio dei macellati dello stesso anno ({numero(x.pesoMedio, 1)} kg).</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <div><div style={{ fontSize: 11, color: C.muted }}>Costo per capo uscito</div><div style={{ fontSize: 16, fontWeight: 800 }}>{euro(perCapo)}</div></div>
            <div><div style={{ fontSize: 11, color: C.muted }}>COSTO DI UN KG DI CARCASSA</div><div style={{ fontSize: 18, fontWeight: 800, color: C.primary }}>{euro(perKg, 3)}</div></div>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
            Senza tener conto della stalla (solo spese dell'anno ÷ chili): {euro(perKgSenzaStalla, 3)} al kg.
            {capi.usciti > 0 && ` Usciti nell'anno senza carcassa (venduti vivi, morti o trasferiti): ${capi.usciti}.`}
          </div>
        </div>
      </div>
    </div>
  );
}
