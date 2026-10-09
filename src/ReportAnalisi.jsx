// Versione 239 — Report di Analisi di una specie (suini, bovini, ovini).
// Si ricalcola a ogni apertura con i dati del momento: costi salvati dal Report Costi e dal Report
// Riproduttori, fatture, animali e parti dell'app. Dice cosa va, cosa non va, perché e cosa fare.
// Sola lettura: nessuna scrittura nel database.
import { useEffect, useMemo, useState } from "react";
import { C, FONT } from "./style";
import { caricaDatiReport, analisiSpecie, AREE, AREE_KG, GRUPPI, gruppoDi, it, SOGLIA_SEGNALE } from "./calcoloReportAnalisi";
import { Intestazione, Sezione, Riquadri, Buoni, Critiche, Segnali, Avvisi, BarreOrdinate, Cascata, COLORI_GRUPPO, SALE, stileTabella as T } from "./ReportAnalisiParti";

const ora = () => new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const coloreArea = a => COLORI_GRUPPO[a] || COLORI_GRUPPO[gruppoDi(a)];

export default function ReportAnalisi({ specie }) {
  const [dati, setDati] = useState(null);
  const [anno, setAnno] = useState(null);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState(null);
  const [calcolatoIl, setCalcolatoIl] = useState(null);
  const [vociAperte, setVociAperte] = useState(false);

  async function carica() {
    setCaricando(true); setErrore(null);
    try {
      const d = await caricaDatiReport();
      setDati(d); setCalcolatoIl(ora());
      const anni = d.base.anniCalcolati;
      // anno predefinito: l'ultimo anno intero calcolato (l'anno in corso è parziale)
      const corrente = new Date().getFullYear();
      setAnno(a => a ?? (anni.filter(y => y < corrente).pop() ?? anni[anni.length - 1] ?? null));
    } catch (e) { setErrore(e.message || String(e)); }
    setCaricando(false);
  }
  useEffect(() => { carica(); }, []);

  const r = useMemo(() => {
    if (!dati || !anno) return null;
    try { return analisiSpecie(dati, specie, anno); } catch (e) { return { errore: e.message || String(e) }; }
  }, [dati, specie, anno]);

  const N = { suino: "Suini", bovino: "Bovini", ovino: "Ovini" }[specie];
  const anni = dati ? dati.base.anniCalcolati : [];
  const selettore = (
    <label style={{ fontSize: 13.5 }}>Anno{" "}
      <select value={anno || ""} onChange={e => setAnno(parseInt(e.target.value))} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}` }}>
        {anni.map(y => <option key={y} value={y}>{y}{y === new Date().getFullYear() ? " (in corso)" : ""}</option>)}
      </select>
    </label>
  );

  return (
    <div style={{ fontFamily: FONT, color: C.text, maxWidth: 1100 }}>
      <Intestazione titolo={`Report di Analisi · ${N}`} sottotitolo="Cosa va, cosa non va, perché e cosa si può fare. Si ricalcola con i dati inseriti fino a oggi."
        selettore={selettore} aggiorna={carica} calcolatoIl={calcolatoIl} caricando={caricando} />
      {errore && <div style={{ background: "#F8E1DE", color: "#9B2C20", padding: 10, borderRadius: 8, marginTop: 10 }}>Errore nella lettura dei dati: {errore}</div>}
      {dati && dati.base.avvisiDati.length > 0 && <div style={{ marginTop: 10 }}><Avvisi voci={dati.base.avvisiDati.map(t => ["b-rosso", "● da sistemare", t])} vuoto="" /></div>}
      {!dati && !errore && <p style={{ color: C.muted }}>Calcolo in corso…</p>}
      {r && r.errore && <div style={{ background: "#F8E1DE", color: "#9B2C20", padding: 10, borderRadius: 8, marginTop: 10 }}>Errore nel calcolo: {r.errore}</div>}
      {r && r.vuoto && <p style={{ color: C.muted, marginTop: 16 }}>{r.motivo}</p>}
      {r && !r.vuoto && !r.errore && <Contenuto r={r} vociAperte={vociAperte} setVociAperte={setVociAperte} />}
    </div>
  );
}

function Contenuto({ r, vociAperte, setVociAperte }) {
  const { anno, c0, c1, k0, nomi, prezzo, q4 } = r;
  const P = prezzo ? prezzo.prezzo : null;
  const u0 = c0.totale / c0.ubaMedie, u1 = c1 && c1.ubaMedie ? c1.totale / c1.ubaMedie : null;
  const perUba = (c, a) => (c && c.ubaMedie ? (c.aree[a] || 0) / c.ubaMedie : 0);
  const haKg = k0.kg > 0;
  const alim = (c0.aree["Alimentazione comprata"] || 0) + (c0.aree["Coltivazione (alimenti prodotti in azienda)"] || 0);
  const parziale = anno === new Date().getFullYear();

  const riquadri = [
    { etichetta: `Costo per UBA ${anno}`, valore: `${it(u0)} €`, nota: u1 !== null ? <>{anno - 1}: {it(u1)} € · <span style={{ color: u0 < u1 ? C.green : C.red, fontWeight: 700 }}>{u0 < u1 ? "▼" : "▲"} {it(Math.abs(u0 - u1))} €</span></> : `UBA medie ${it(c0.ubaMedie)}`,
      bollino: ["b-verde", "● dal Report Costi"] },
    { etichetta: `Costo per kg di carcassa ${anno}`, valore: haKg ? `${it(k0.perKg)} €` : "dato mancante",
      nota: haKg ? (k0.nonPesati ? `Solo i ${k0.pesati} capi all'ingrasso pesati su ${k0.capi}. Con il peso medio anche per i non pesati: ${it(k0.perKgStima)} € (stima).` : `Tutti i ${k0.pesati} capi all'ingrasso macellati sono pesati.`) : `Nell'app non ci sono ${nomi.capi} macellati e pesati nel ${anno}.`,
      bollino: !haKg ? ["b-rosso", "● dato mancante"] : k0.nonPesati > k0.capi * 0.2 ? ["b-arancio", "▲ pesi incompleti"] : ["b-verde", "● dato quasi completo"] },
    { etichetta: "Prezzo di vendita della carcassa", valore: P ? `${it(P)} €` : "—",
      nota: prezzo ? `${it(prezzo.kg, 2)} kg fatturati nel ${prezzo.anno} per ${it(prezzo.euro)} €.${haKg ? ` Margine per kg: ${it(P - k0.perKg)} € sui pesati${k0.nonPesati ? `, ${it(P - k0.perKgStima)} € sulla stima di tutti` : ""}.` : ""}` : "Nessuna fattura di vendita trovata.",
      bollino: ["b-verde", "● dalle fatture"] },
    { etichetta: `Peso dell'alimentazione ${anno}`, valore: `${it(alim / c0.totale * 100, 1)}%`,
      nota: `Alimentazione comprata più coltivazione, sul costo ${nomi.dei}. Il lavoro pesa il ${it((c0.aree.Lavoro || 0) / c0.totale * 100, 1)}%.`, bollino: ["b-arancio", "▲ ripartizione per UBA"] },
  ];

  // Quadro 1: euro per UBA per area, ordinati
  const righe1 = AREE.map(a => ({ a, v: perUba(c0, a), colore: coloreArea(a) })).filter(x => x.v > 0.005).sort((p, q) => q.v - p.v);
  // Quadro 2: ultimi tre anni, colonne divise per gruppo
  const storia = r.anniStoria.slice(-3);
  // Quadro 3: variazione area per area
  const passi3 = c1 ? AREE.map(a => ({ n: a, v: perUba(c0, a) - perUba(c1, a) })).filter(p => Math.abs(p.v) >= 0.005).sort((p, q) => Math.abs(q.v) - Math.abs(p.v)) : [];

  return (
    <>
      {parziale && <div style={{ marginTop: 12 }}><Avvisi voci={[["b-arancio", "▲ anno in corso", `Il ${anno} non è finito: i costi e i capi sono quelli registrati fino a oggi, e il confronto con il ${anno - 1} è parziale.`]]} vuoto="" /></div>}
      <Sezione titolo="In sintesi"><Riquadri voci={riquadri} /></Sezione>
      <Sezione titolo="In breve">
        <p style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `5px solid ${C.primary}`, borderRadius: 8, padding: "12px 16px", margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>{r.giudizio}</p>
      </Sezione>
      <Sezione titolo="Cosa sta andando bene"><Buoni voci={r.buoni} /></Sezione>
      <Sezione titolo="Criticità: analisi, cause e cosa si può fare"
        sottotitolo="Prima le criticità alte, ordinate per quanto valgono. Le cause hanno un bollino: dimostrata (si vede nei dati), probabile (i dati la indicano), ipotesi (da verificare).">
        <Critiche voci={r.critiche} grafico={<GraficoEta eta={r.eta} prezzo={P} />} />
      </Sezione>
      <Sezione titolo={`Cosa è cambiato di più del ${it(SOGLIA_SEGNALE * 100, 0)}% rispetto all'anno prima`} sottotitolo="Aree il cui costo per UBA è cresciuto oltre la soglia: sono i segnali nuovi da tenere d'occhio.">
        <Segnali voci={r.segnali} />
      </Sezione>

      <Sezione titolo="Quali aree pesano di più" sottotitolo={`Euro per UBA ${nomi.dei} nel ${anno}, dalla più grande alla più piccola.`}>
        <BarreOrdinate righe={righe1} titolo={`Euro per UBA, ${anno}`} />
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <button onClick={() => setVociAperte(!vociAperte)} style={{ background: "transparent", border: `1px solid ${C.primary}`, color: C.primary, borderRadius: 6, padding: "4px 10px", fontSize: 12.5, marginBottom: 6 }}>
            {vociAperte ? "Nascondi le voci di conto" : "Mostra le voci di conto"}
          </button>
          <TabellaAree r={r} vociAperte={vociAperte} />
        </div>
      </Sezione>

      {storia.length >= 2 && <Sezione titolo="Come cambia la composizione negli anni" sottotitolo="Costo per UBA diviso per gruppi di aree.">
        <ColonneAnni storia={storia} />
      </Sezione>}

      {c1 && <Sezione titolo={`Cosa è migliorato e cosa è peggiorato, dal ${anno - 1} al ${anno}`} sottotitolo="Variazione del costo per UBA, area per area.">
        <Cascata partenza={{ n: `Costo per UBA ${anno - 1}`, v: u1 }} arrivo={{ n: `Costo per UBA ${anno}`, v: u0 }} passi={passi3} titolo="Variazione del costo per UBA" />
      </Sezione>}

      {q4 && <Sezione titolo="Mangimi: numero di animali, quantità, prezzo" sottotitolo={`Da cosa viene la differenza del costo dei mangimi ${nomi.dei} tra il ${anno - 1} e il ${anno}.`}>
        <table style={{ ...T.tabella, maxWidth: 680, marginBottom: 12 }}>
          <thead><tr><th style={T.thSx}></th><th style={T.th}>{anno - 1}</th><th style={T.th}>{anno}</th></tr></thead>
          <tbody>
            <tr><td style={T.tdSx}>UBA medie {nomi.dei}</td><td style={T.td}>{it(q4.a.ubaMedie, 4)}</td><td style={T.td}>{it(q4.b.ubaMedie, 4)}</td></tr>
            <tr><td style={T.tdSx}>Chili di mangime attribuiti {nomi.ai}</td><td style={T.td}>{it(q4.a.kg, 1)}</td><td style={T.td}>{it(q4.b.kg, 1)}</td></tr>
            <tr><td style={T.tdSx}>Chili di mangime per UBA</td><td style={T.td}>{it(q4.a.kgPerUba, 1)}</td><td style={T.td}>{it(q4.b.kgPerUba, 1)}</td></tr>
            <tr><td style={T.tdSx}>Prezzo pagato (€ per kg)</td><td style={T.td}>{it(q4.a.prezzoPagato, 4)}</td><td style={T.td}>{it(q4.b.prezzoPagato, 4)}</td></tr>
            <tr><td style={T.tdSx}>Orzo di Podere rientrato come farina (credito)</td><td style={T.td}>{it(q4.a.credito)} €</td><td style={T.td}>{it(q4.b.credito)} €</td></tr>
            <tr><td style={{ ...T.tdSx, fontWeight: 700 }}>Costo dei mangimi attribuito {nomi.ai}</td><td style={{ ...T.td, fontWeight: 700 }}>{it(q4.a.euro)} €</td><td style={{ ...T.td, fontWeight: 700 }}>{it(q4.b.euro)} €</td></tr>
          </tbody>
        </table>
        <Cascata partenza={{ n: `Mangimi ${anno - 1}`, v: q4.a.euro }} arrivo={{ n: `Mangimi ${anno}`, v: q4.b.euro }} titolo="Scomposizione della variazione dei mangimi"
          passi={[{ n: "Più o meno animali", v: q4.effetti.numero }, { n: "Più o meno chili per animale", v: q4.effetti.quantita }, { n: "Prezzo pagato", v: q4.effetti.prezzo }]
            .concat(Math.abs(q4.effetti.orzo) > 0.005 ? [{ n: "Orzo di Podere rientrato", v: q4.effetti.orzo }] : [])} />
        <p style={{ fontSize: 12.5, color: C.muted }}>Come si calcola: più animali = (UBA {anno} − UBA {anno - 1}) × chili per UBA {anno - 1} × prezzo {anno - 1}; più chili = UBA {anno} × (chili per UBA {anno} − {anno - 1}) × prezzo {anno - 1}; prezzo = UBA {anno} × chili per UBA {anno} × (prezzo {anno} − {anno - 1}). La somma degli effetti è {it(q4.effetti.totale)} €, uguale alla differenza {it(q4.effetti.differenza)} €.</p>
      </Sezione>}

      <Sezione titolo="Affidabilità dei dati: cosa va sistemato prima di fidarsi dei numeri">
        <Avvisi voci={r.affidabilita} vuoto="Nessun problema noto nei dati." />
      </Sezione>
      <p style={{ fontSize: 12, color: C.muted, marginTop: 24 }}>
        Regole: euro per UBA = costi dell'anno attribuiti {nomi.ai} (senza macello e lavorazioni) diviso le UBA medie. Euro per kg = vita intera dei capi all'ingrasso macellati nell'anno e pesati; le riforme sono escluse. Segnali: aumenti oltre il {it(SOGLIA_SEGNALE * 100, 0)}% e oltre 200 € nell'anno.
      </p>
    </>
  );
}

function TabellaAree({ r, vociAperte }) {
  const { anno, c0, c1, k0 } = r;
  const haKg = k0.kg > 0;
  const u = (c, a) => (c && c.ubaMedie ? (c.aree[a] || 0) / c.ubaMedie : null);
  const totKg = Object.values(k0.aree).reduce((s, x) => s + x, 0);
  const totNasc = Object.values(k0.nascita).reduce((s, x) => s + x, 0);
  const tu0 = c0.totale / c0.ubaMedie, tu1 = c1 && c1.ubaMedie ? c1.totale / c1.ubaMedie : null;
  const pc = (v, t) => (v !== null && t ? `${it(v / t * 100, 1)}%` : "—");
  const righe = [];
  for (const a of AREE_KG) {
    const sotto = AREE.includes(a);
    if (!sotto && !(k0.aree[a] > 0)) continue;
    righe.push(
      <tr key={a}>
        <td style={{ ...T.tdSx, minWidth: 230 }}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: COLORI_GRUPPO[a] || COLORI_GRUPPO[gruppoDi(a)], marginRight: 6 }} />{a}</td>
        <td style={T.td}>{sotto && c1 ? it(u(c1, a)) : "—"}</td><td style={T.td}>{sotto && c1 ? pc(u(c1, a), tu1) : "—"}</td>
        <td style={T.td}>{sotto ? it(u(c0, a)) : "—"}</td><td style={T.td}>{sotto ? pc(u(c0, a), tu0) : "—"}</td>
        <td style={T.td}>{haKg ? it((k0.aree[a] || 0) / k0.kg, 4) : "—"}</td><td style={T.td}>{haKg ? pc(k0.aree[a] || 0, totKg) : "—"}</td>
        <td style={T.td}>{haKg ? it((k0.nascita[a] || 0) / k0.kg, 4) : "—"}</td>
      </tr>);
    if (sotto && vociAperte) {
      const v0 = c0.voci[a] || {}, v1 = (c1 && c1.voci[a]) || {};
      [...new Set(Object.keys(v0).concat(Object.keys(v1)))].sort((p, q) => (v0[q] || 0) - (v0[p] || 0)).forEach(n => righe.push(
        <tr key={`${a}|${n}`} style={{ color: C.muted }}>
          <td style={{ ...T.tdSx, paddingLeft: 26 }}>{n}</td>
          <td style={T.td}>{c1 ? it((v1[n] || 0) / c1.ubaMedie) : "—"}</td><td style={T.td}>{c1 ? pc(v1[n] || 0, c1.totale) : "—"}</td>
          <td style={T.td}>{it((v0[n] || 0) / c0.ubaMedie)}</td><td style={T.td}>{pc(v0[n] || 0, c0.totale)}</td><td style={T.td}></td><td style={T.td}></td><td style={T.td}></td>
        </tr>));
    }
  }
  return (
    <table style={T.tabella}>
      <thead><tr>
        <th style={T.thSx}>Area</th><th style={T.th}>Euro per UBA {anno - 1}</th><th style={T.th}>%</th><th style={T.th}>Euro per UBA {anno}</th><th style={T.th}>%</th>
        <th style={T.th}>Euro per kg di carcassa {anno}</th><th style={T.th}>%</th><th style={T.th}>di cui per farlo nascere (€ per kg)</th>
      </tr></thead>
      <tbody>{righe}</tbody>
      <tfoot><tr style={{ fontWeight: 700 }}>
        <td style={T.tdSx}>Totale</td><td style={T.td}>{it(tu1)}</td><td style={T.td}>{tu1 !== null ? "100%" : "—"}</td><td style={T.td}>{it(tu0)}</td><td style={T.td}>100%</td>
        <td style={T.td}>{haKg ? it(totKg / k0.kg, 4) : "—"}</td><td style={T.td}>{haKg ? "100%" : "—"}</td><td style={T.td}>{haKg ? it(totNasc / k0.kg, 4) : "—"}</td>
      </tr></tfoot>
    </table>
  );
}

function ColonneAnni({ storia }) {
  const tot = c => c.totale / c.ubaMedie;
  const grp = (c, g) => AREE.filter(a => gruppoDi(a) === g).reduce((s, a) => s + (c.aree[a] || 0) / c.ubaMedie, 0);
  const maxV = Math.max(...storia.map(tot)), passoT = maxV > 2000 ? 500 : maxV > 800 ? 200 : 100;
  const max = Math.ceil(maxV * 1.08 / passoT) * passoT;
  const W = 860, H = 330, x0 = 70, base = 280, top = 24, colW = 120, passo = 200;
  const sc = v => (base - top) * v / max;
  const tacche = []; for (let t = 0; t <= max; t += passoT) tacche.push(t);
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 560, fontSize: 13, fontFamily: "inherit" }} role="img" aria-label="Costo per UBA negli anni diviso per gruppi">
        {tacche.map(t => <g key={t}><line x1={x0} x2={x0 + passo * storia.length} y1={base - sc(t)} y2={base - sc(t)} stroke={C.border} /><text x={x0 - 8} y={base - sc(t) + 4} textAnchor="end" fill={C.muted}>{it(t, 0)}</text></g>)}
        <text x={4} y={12} textAnchor="start" fill={C.muted}>€ per UBA</text>
        {storia.map((c, i) => {
          const cx = x0 + 40 + i * passo; let yy = base;
          return (
            <g key={c.anno}>
              {GRUPPI.map(g => {
                const v = grp(c, g), hh = sc(v); yy -= hh;
                return (
                  <g key={g}>
                    <rect x={cx} y={yy + 1} width={colW} height={Math.max(0, hh - 2)} fill={COLORI_GRUPPO[g]}><title>{`${c.anno} · ${g}: ${it(v)} € per UBA (${it(v / tot(c) * 100, 1)}%)`}</title></rect>
                    {hh > 16 && <text x={cx + colW + 6} y={yy + hh / 2 + 4} fill={C.muted}>{it(v / tot(c) * 100, 0)}%</text>}
                  </g>);
              })}
              <text x={cx + colW / 2} y={base - sc(tot(c)) - 8} textAnchor="middle" fontWeight={700} fill={C.text}>{it(tot(c))} €</text>
              <text x={cx + colW / 2} y={base + 20} textAnchor="middle" fill={C.text}>{c.anno}</text>
              <text x={cx + colW / 2} y={base + 38} textAnchor="middle" fill={C.muted}>{it(c.ubaMedie)} UBA medie</text>
            </g>);
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: C.muted }}>
        {GRUPPI.map(g => <span key={g}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: COLORI_GRUPPO[g], marginRight: 5 }} />{g}{g === "Altre spese" ? " (consulenze, assicurazioni, altre spese di allevamento, varie)" : ""}</span>)}
      </div>
    </div>
  );
}

function GraficoEta({ eta, prezzo }) {
  const e = eta.filter(x => x.perKg !== null);
  if (!e.length) return null;
  const maxV = Math.max(...e.map(x => x.perKg), prezzo || 0) * 1.12;
  const passoT = maxV > 30 ? 10 : maxV > 12 ? 2 : 1, max = Math.ceil(maxV / passoT) * passoT;
  const W = 880, lab = 230, area = 400, h = 34, top = 40, H = top + e.length * h + 30;
  const X = v => lab + v / max * area;
  const tacche = []; for (let t = 0; t <= max; t += passoT) tacche.push(t);
  return (
    <div style={{ overflowX: "auto", margin: "8px 0" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 560, fontSize: 13, fontFamily: "inherit" }} role="img" aria-label="Costo di un kg di carcassa per età alla macellazione">
        <text x={0} y={14} fill={C.muted}>Costo di un kg di carcassa per età alla macellazione (nati in azienda)</text>
        {tacche.map(t => <g key={t}><line x1={X(t)} x2={X(t)} y1={top - 4} y2={H - 24} stroke={C.border} /><text x={X(t)} y={H - 8} textAnchor="middle" fill={C.muted}>{t}</text></g>)}
        {e.map((r, i) => {
          const yy = top + i * h, sopra = prezzo && r.perKg > prezzo;
          return (
            <g key={r.classe}>
              <text x={lab - 10} y={yy + 15} textAnchor="end" fontWeight={700} fill={C.text}>{r.classe}</text>
              <text x={lab - 10} y={yy + 29} textAnchor="end" fill={C.muted}>{r.capi} capi, {r.pesati} pesati</text>
              <rect x={lab} y={yy + 6} width={Math.max(2, X(r.perKg) - lab)} height={20} rx={2} fill={sopra ? SALE : C.green}><title>{`${r.classe}: ${it(r.perKg)} € per kg, costo medio ${it(r.costoMedio)} € a capo, carcassa media ${it(r.kgMedio, 1)} kg`}</title></rect>
              <text x={X(r.perKg) + 6} y={yy + 20} fontWeight={700} fill={C.text}>{it(r.perKg)} €</text>
              <text x={W - 4} y={yy + 20} textAnchor="end" fill={C.muted}>{it(r.costoMedio)} € a capo · {it(r.kgMedio, 1)} kg</text>
            </g>);
        })}
        {prezzo && <>
          <line x1={X(prezzo)} x2={X(prezzo)} y1={top - 8} y2={H - 24} stroke={C.text} strokeWidth={2} strokeDasharray="5 4" />
          <text x={X(prezzo)} y={top - 12} textAnchor="middle" fontWeight={700} fill={C.text}>prezzo di vendita {it(prezzo)} €</text>
        </>}
      </svg>
      <div style={{ fontSize: 12, color: C.muted }}><span style={{ color: C.green }}>■ sotto il prezzo di vendita</span> · <span style={{ color: SALE }}>■ sopra il prezzo di vendita: si perde</span></div>
    </div>
  );
}
