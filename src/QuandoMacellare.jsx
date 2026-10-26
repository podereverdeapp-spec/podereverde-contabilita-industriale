// Versione 309 (decisioni del Dott. Bizzarri del 26/10/2026, ore 20:26–20:52) — «Quando macellare», al posto del
// «Grafico per le Macellazioni». Regola: si macella quando un mese in più in azienda costa più di quanto fa guadagnare.
// Per ogni specie, dai capi da macello già usciti con il peso della carcassa (pesi veri), per fascia d'età all'uscita:
// costo per capo, valore della carcassa al prezzo scelto, guadagno per capo e per mese in azienda; tutti insieme oppure
// divisi per provenienza (nati in azienda / comprati); poi i capi in stalla oggi con il semaforo.
// Il costo di ogni capo è quello di tutto il programma (Riepilogo Costo Animali, Prezzo di Pareggio, Break Even):
// acquisto o nascita + mantenimento + costo rimasto ricevuto dai riproduttori, dai costi salvati del Report Costi.
// Sola lettura: nessuna scrittura nel database.
import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { formattaEuro, formattaNumero, round2 } from "./parsingUtils";
import { caricaDatiBase } from "./calcoloBreakEven";
import { prezziDaFatture } from "./calcoloStalla";
import { statoCalcoli, testoAvvisoCalcoli } from "./statoCalcoli";
import { supabase } from "./supabase";

const MESE = 30.44, GIORNO = 86400000;
const mesiTra = (da, a) => (new Date(a) - new Date(da)) / GIORNO / MESE;
const num = v => { const n = parseFloat(String(v ?? "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const BLU = "#2a78d6", ARANCIO = "#eb6834", VERDE_F = "#dff3e4", ROSSO_F = "#fbe1e0";
const SPECIE = [{ id: "bovino", nome: "Bovini" }, { id: "suino", nome: "Suini" }, { id: "ovino", nome: "Ovini" }];
const FASCE = {
  bovino: [[0, 12, "sotto 12 mesi"], [12, 18, "12–18 mesi"], [18, 24, "18–24 mesi"], [24, 30, "24–30 mesi"], [30, 36, "30–36 mesi"], [36, Infinity, "oltre 36 mesi"]],
  suino: [[0, 7, "sotto 7 mesi"], [7, 9, "7–9 mesi"], [9, 11, "9–11 mesi"], [11, 14, "11–14 mesi"], [14, Infinity, "oltre 14 mesi"]],
  ovino: [[0, 6, "sotto 6 mesi"], [6, 9, "6–9 mesi"], [9, 12, "9–12 mesi"], [12, 18, "12–18 mesi"], [18, Infinity, "oltre 18 mesi"]],
};
const CAPI_MINIMI = 3; // una fascia con meno capi si mostra, ma non decide il semaforo
const oggi = () => new Date().toISOString().slice(0, 10);

// fattoreNascita (versione 309, simulazione): moltiplica il costo di nascita di ogni anno; senza, il costo è quello salvato
function costoDi(base, s, finoAl, fattoreNascita) {
  const righe = (base.righeSoggetto.get(s.chiave) || []).filter(r => !finoAl || r.anno <= finoAl);
  return round2((s.acquistato ? s.costoAcquisto : 0) + righe.reduce((t, r) => t + (+r.costo_mantenimento || 0) + (+r.costo_nascita_ereditato || 0) * (fattoreNascita ? fattoreNascita(r.anno) : 1) + (+r.quota_residuo_riproduttori || 0), 0));
}
const nascitaDi = (base, s, fattoreNascita) => (base.righeSoggetto.get(s.chiave) || []).reduce((t, r) => t + (+r.costo_nascita_ereditato || 0) * (fattoreNascita ? fattoreNascita(r.anno) : 1), 0);

// Le fasce di un gruppo di capi usciti: medie e risultati al prezzo scelto
function fasceDi(capi, specie, prezzo) {
  return FASCE[specie].map(([da, a, nome]) => {
    const c = capi.filter(x => x.eta >= da && x.eta < a);
    if (!c.length) return null;
    const n = c.length, med = f => c.reduce((t, x) => t + x[f], 0) / n;
    const costo = med("costo"), carcassa = med("carcassa"), mesi = med("mesi");
    const valore = carcassa * prezzo, guadagno = valore - costo;
    return { da, a, nome, n, eta: med("eta"), mesi, costo, carcassa, costoNascita: c[0].costoNascita !== undefined ? med("costoNascita") : null, acquisto: c[0].acquisto !== undefined ? med("acquisto") : null, costoKg: c.reduce((t, x) => t + x.costo, 0) / c.reduce((t, x) => t + x.carcassa, 0), valore, guadagno, alMese: mesi > 0 ? guadagno / mesi : 0 };
  }).filter(Boolean);
}
const migliore = fasce => {
  const valide = fasce.filter(f => f.n >= CAPI_MINIMI);
  return valide.length ? valide.reduce((m, f) => (f.alMese > m.alMese ? f : m), valide[0]) : null;
};

// ── Grafici in SVG (nessuna libreria esterna, come gli altri grafici del programma) ─────────────────────
function GraficoCostoValore({ fasce, prezzo, yMax }) {
  const W = 560, H = 300, L = 62, R = 14, T = 16, B = 46;
  const x = i => L + (i + 0.5) * (W - L - R) / fasce.length; // ogni fascia al centro del suo spazio: niente etichette tagliate ai bordi
  const y = v => T + (1 - v / yMax) * (H - T - B);
  const passo = yMax > 6000 ? 2000 : yMax > 2500 ? 1000 : yMax > 1200 ? 500 : 200;
  const griglia = []; for (let v = 0; v <= yMax; v += passo) griglia.push(v);
  const pc = fasce.map((f, i) => [x(i), y(f.costo)]), pv = fasce.map((f, i) => [x(i), y(f.valore)]);
  // zone tra le due linee, segmento per segmento: verde se il valore supera il costo, rosso se no
  const zone = [];
  for (let i = 0; i < fasce.length - 1; i++) {
    const d0 = fasce[i].valore - fasce[i].costo, d1 = fasce[i + 1].valore - fasce[i + 1].costo;
    if (d0 * d1 >= 0) zone.push({ pts: [pv[i], pv[i + 1], pc[i + 1], pc[i]], verde: d0 + d1 >= 0 });
    else {
      const t = d0 / (d0 - d1), xi = pv[i][0] + t * (pv[i + 1][0] - pv[i][0]), yi = pv[i][1] + t * (pv[i + 1][1] - pv[i][1]);
      zone.push({ pts: [pv[i], [xi, yi], pc[i]], verde: d0 >= 0 }, { pts: [[xi, yi], pv[i + 1], pc[i + 1]], verde: d1 >= 0 });
    }
  }
  const [hover, setHover] = useState(null);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {griglia.map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e7e6e2" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill={C.muted}>{formattaNumero(v, 0)} €</text></g>)}
      {zone.map((z, i) => <polygon key={i} points={z.pts.map(p => p.join(",")).join(" ")} fill={z.verde ? VERDE_F : ROSSO_F} />)}
      <polyline points={pc.map(p => p.join(",")).join(" ")} fill="none" stroke={ARANCIO} strokeWidth="2" />
      <polyline points={pv.map(p => p.join(",")).join(" ")} fill="none" stroke={BLU} strokeWidth="2" />
      {fasce.map((f, i) => {
        const sopraC = f.costo > f.valore;
        return (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={x(i) - 24} y={T} width={48} height={H - T - B} fill="transparent" />
            <circle cx={pc[i][0]} cy={pc[i][1]} r="4.5" fill={ARANCIO} stroke="#fff" strokeWidth="2" />
            <circle cx={pv[i][0]} cy={pv[i][1]} r="4.5" fill={BLU} stroke="#fff" strokeWidth="2" />
            <text x={x(i)} y={pc[i][1] + (sopraC ? -9 : 16)} textAnchor="middle" fontSize="9.5" fill={C.muted}>{formattaNumero(f.costo, 0)} €</text>
            <text x={x(i)} y={pv[i][1] + (sopraC ? 16 : -9)} textAnchor="middle" fontSize="9.5" fill={C.muted}>{formattaNumero(f.valore, 0)} €</text>
            <text x={x(i)} y={H - B + 16} textAnchor="middle" fontSize="10" fill={C.text}>{f.nome}</text>
            <text x={x(i)} y={H - B + 29} textAnchor="middle" fontSize="9.5" fill={C.muted}>{f.n} {f.n === 1 ? "capo" : "capi"}</text>
          </g>
        );
      })}
      {hover !== null && (() => { const f = fasce[hover]; const bx = Math.min(Math.max(x(hover) - 95, L), W - R - 190); return (
        <g pointerEvents="none">
          <rect x={bx} y={T + 2} width={190} height={74} rx="6" fill="#fff" stroke={C.border} />
          <text x={bx + 8} y={T + 18} fontSize="10.5" fontWeight="700" fill={C.text}>{f.nome}: {f.n} {f.n === 1 ? "capo" : "capi"}</text>
          <text x={bx + 8} y={T + 33} fontSize="10" fill={C.text}>età media {formattaNumero(f.eta, 1)} mesi, carcassa {formattaNumero(f.carcassa, 1)} kg</text>
          <text x={bx + 8} y={T + 48} fontSize="10" fill={C.text}>costo {formattaEuro(f.costo, 0)}, valore {formattaEuro(f.valore, 0)}</text>
          <text x={bx + 8} y={T + 63} fontSize="10" fill={f.guadagno >= 0 ? C.green : C.red} fontWeight="700">{f.guadagno >= 0 ? "guadagno" : "perdita"} {formattaEuro(Math.abs(f.guadagno), 0)} a capo</text>
        </g>); })()}
    </svg>
  );
}

function GraficoAlMese({ fasce, yMin, yMax, migliore: best }) {
  const W = 560, H = 220, L = 62, R = 14, T = 18, B = 40;
  const w = (W - L - R) / fasce.length;
  const y = v => T + (yMax - v) / (yMax - yMin) * (H - T - B);
  const passo = (yMax - yMin) > 400 ? 200 : (yMax - yMin) > 100 ? 50 : 20;
  const griglia = []; for (let v = Math.ceil(yMin / passo) * passo; v <= yMax; v += passo) griglia.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {griglia.map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? C.muted : "#e7e6e2"} /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill={C.muted}>{formattaNumero(v, 0)} €</text></g>)}
      {fasce.map((f, i) => {
        const cx = L + w * i + w / 2, v = f.alMese, top = y(Math.max(v, 0)), h = Math.abs(y(v) - y(0));
        const eBest = best && f.nome === best.nome;
        return (
          <g key={i}>
            <rect x={cx - w * 0.28} y={top} width={w * 0.56} height={Math.max(h, 1)} rx="3" fill={v >= 0 ? BLU : ARANCIO} opacity={f.n < CAPI_MINIMI ? 0.45 : 1} />
            <text x={cx} y={v >= 0 ? top - 5 : top + h + 13} textAnchor="middle" fontSize="10.5" fontWeight={eBest ? 800 : 400} fill={C.text}>{formattaNumero(v, 0)} €{eBest ? " ★" : ""}</text>
            <text x={cx} y={H - B + 15} textAnchor="middle" fontSize="10" fill={C.text}>{f.nome}</text>
            <text x={cx} y={H - B + 28} textAnchor="middle" fontSize="9.5" fill={C.muted}>{formattaNumero(f.mesi, 1)} mesi</text>
          </g>
        );
      })}
    </svg>
  );
}

function Gruppo({ titolo, fasce, prezzo, scala }) {
  const best = migliore(fasce);
  if (!fasce.length) return <div style={{ flex: 1, minWidth: 320 }}><div style={{ fontWeight: 800, color: C.primary }}>{titolo}</div><p style={{ fontSize: 13, color: C.muted }}>Nessun capo uscito con età e peso della carcassa.</p></div>;
  const tot = fasce.reduce((t, f) => t + f.n, 0);
  return (
    <div style={{ flex: 1, minWidth: 320 }}>
      <div style={{ fontWeight: 800, color: C.primary, fontSize: 15 }}>{titolo} ({tot} capi)</div>
      <div style={{ fontSize: 12.5, margin: "4px 0 6px", color: C.text }}>
        {best ? (best.alMese >= 0
          ? <>★ Più conveniente: <b>{best.nome}</b>, {formattaEuro(best.alMese, 0)} di guadagno per mese in azienda ({formattaEuro(best.guadagno, 0)} a capo).</>
          : <>A {formattaEuro(prezzo)} al kg <b style={{ color: C.red }}>si perde a ogni età</b>; la perdita al mese più piccola è {best.nome} ({formattaEuro(best.alMese, 0)}). Per andare in pari in quella fascia servono {formattaEuro(best.costo / best.carcassa)} al kg.</>)
          : "Troppo pochi capi per ogni fascia: nessuna indicazione."}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginTop: 6 }}>Costo per capo e valore della carcassa, per età di uscita</div>
      <div style={{ display: "flex", gap: 14, fontSize: 11.5, marginTop: 4, flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 16, height: 3, background: ARANCIO, verticalAlign: "middle", marginRight: 5 }} />Costo per capo</span>
        <span><span style={{ display: "inline-block", width: 16, height: 3, background: BLU, verticalAlign: "middle", marginRight: 5 }} />Valore della carcassa a {formattaEuro(prezzo)} al kg</span>
        <span><span style={{ display: "inline-block", width: 12, height: 10, background: VERDE_F, verticalAlign: "middle", marginRight: 5 }} />guadagno</span>
        <span><span style={{ display: "inline-block", width: 12, height: 10, background: ROSSO_F, verticalAlign: "middle", marginRight: 5 }} />perdita</span>
      </div>
      <GraficoCostoValore fasce={fasce} prezzo={prezzo} yMax={scala.yMax} />
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginTop: 6 }}>Guadagno o perdita per mese in azienda (sotto ogni barra: mesi in azienda; ★ la fascia migliore; barre chiare: meno di {CAPI_MINIMI} capi)</div>
      <GraficoAlMese fasce={fasce} yMin={scala.yMin} yMax={scala.yMaxMese} migliore={best} />
      <table style={{ width: "100%", fontSize: 12, marginTop: 6 }}>
        <thead><tr style={{ color: C.muted }}>{["Età di uscita", "Capi", "Carcassa media", "Costo per capo", "Costo al kg", "Valore", "Per capo", "Per mese"].map(t => <th key={t} style={{ textAlign: t === "Età di uscita" ? "left" : "right", padding: "3px 4px" }}>{t}</th>)}</tr></thead>
        <tbody>{fasce.map(f => (
          <tr key={f.nome} style={{ borderTop: `1px solid ${C.border}`, fontWeight: best && f.nome === best.nome ? 800 : 400 }}>
            <td style={{ padding: "3px 4px" }}>{f.nome}</td><td style={{ textAlign: "right" }}>{f.n}</td>
            <td style={{ textAlign: "right" }}>{formattaNumero(f.carcassa, 1)} kg</td><td style={{ textAlign: "right" }}>{formattaEuro(f.costo, 0)}</td>
            <td style={{ textAlign: "right" }}>{formattaEuro(f.costoKg)}</td><td style={{ textAlign: "right" }}>{formattaEuro(f.valore, 0)}</td>
            <td style={{ textAlign: "right", color: f.guadagno >= 0 ? C.green : C.red }}>{formattaEuro(f.guadagno, 0)}</td>
            <td style={{ textAlign: "right", color: f.alMese >= 0 ? C.green : C.red }}>{formattaEuro(f.alMese, 0)}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

// ── Vista «Simulazione» (versione 309, decisione del Dott. Bizzarri del 26/10/2026, ore 21:17) ─────────────────────
// Prezzo al kg e, solo per i suini, mortalità dei suinetti: grafici e tabella si ricalcolano subito. Non si salva niente.
// Mortalità di un anno = nati morti ÷ nati totali dei lotti nati in azienda (parti dell'anno). Il costo della mandria si
// divide sui suinetti vivi, quindi con una mortalità diversa il costo di nascita di quell'anno diventa:
// costo di nascita × (1 − mortalità dell'anno) ÷ (1 − mortalità scelta). Mantenimento, pesi e valore restano quelli reali.
const VIOLA = "#6250d6", GRIGIO = "#52514e";
const scalaTonda = v => { const p = v > 6000 ? 2000 : v > 2500 ? 1000 : v > 1200 ? 500 : v > 400 ? 200 : 50; return Math.ceil(v / p) * p; };

function GraficoLinee({ etichette, serie, yMax }) {
  const W = 760, H = 320, L = 62, R = 190, T = 16, B = 46;
  const x = i => L + (i + 0.5) * (W - L - R) / etichette.length;
  const y = v => T + (1 - v / yMax) * (H - T - B);
  const passo = yMax > 6000 ? 2000 : yMax > 2500 ? 1000 : yMax > 1200 ? 500 : 200;
  const griglia = []; for (let v = 0; v <= yMax; v += passo) griglia.push(v);
  const [hover, setHover] = useState(null);
  const ultimo = etichette.length - 1;
  // etichette a destra senza sovrapposizioni: almeno 26 punti di distanza
  const fine = serie.map((s, k) => ({ k, yv: y(s.valori[ultimo]) })).sort((a, b) => a.yv - b.yv);
  for (let i = 1; i < fine.length; i++) if (fine[i].yv - fine[i - 1].yv < 26) fine[i].yv = fine[i - 1].yv + 26;
  const posFine = new Map(fine.map(f => [f.k, f.yv]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {griglia.map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e7e6e2" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill={C.muted}>{formattaNumero(v, 0)} €</text></g>)}
      {serie.map((s, k) => <polyline key={k} points={s.valori.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={s.colore} strokeWidth="2" strokeDasharray={s.tratteggio ? "6 4" : undefined} />)}
      {serie.map((s, k) => s.valori.map((v, i) => <circle key={`${k}-${i}`} cx={x(i)} cy={y(v)} r="4.5" fill={s.colore} stroke="#fff" strokeWidth="2" />))}
      {serie.map((s, k) => <text key={k} x={W - R + 12} y={posFine.get(k)} fontSize="10.5" fontWeight="700" fill={C.text}><tspan x={W - R + 12} dy="0">{s.nome}</tspan><tspan x={W - R + 12} dy="12" fontWeight="400" fill={C.muted}>{s.riga2 ? `${s.riga2}: ` : ""}{formattaEuro(s.valori[ultimo], 0)} a capo</tspan></text>)}
      {etichette.map((e, i) => (
        <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <rect x={x(i) - 40} y={T} width={80} height={H - T - B} fill="transparent" />
          <text x={x(i)} y={H - B + 16} textAnchor="middle" fontSize="10" fill={C.text}>{e.nome}</text>
          <text x={x(i)} y={H - B + 29} textAnchor="middle" fontSize="9.5" fill={C.muted}>{e.n} {e.n === 1 ? "capo" : "capi"}</text>
        </g>))}
      {hover !== null && (() => { const bx = Math.min(Math.max(x(hover) - 110, L), W - R - 220); return (
        <g pointerEvents="none">
          <rect x={bx} y={T + 2} width={220} height={22 + serie.length * 15} rx="6" fill="#fff" stroke={C.border} />
          <text x={bx + 8} y={T + 18} fontSize="10.5" fontWeight="700" fill={C.text}>{etichette[hover].nome}: {etichette[hover].n} capi</text>
          {serie.map((s, k) => <text key={k} x={bx + 8} y={T + 33 + k * 15} fontSize="10" fill={C.text}><tspan fill={s.colore} fontWeight="800">■ </tspan>{s.nome}: {formattaEuro(s.valori[hover], 0)}</text>)}
        </g>); })()}
    </svg>
  );
}

function GraficoBarre({ etichette, serie, yMin, yMax }) {
  const W = 760, H = 250, L = 62, R = 190, T = 18, B = 40;
  const w = (W - L - R) / etichette.length, bw = Math.min(30, w * 0.8 / serie.length);
  const y = v => T + (yMax - v) / (yMax - yMin) * (H - T - B);
  const passo = (yMax - yMin) > 400 ? 200 : (yMax - yMin) > 100 ? 50 : 20;
  const griglia = []; for (let v = Math.ceil(yMin / passo) * passo; v <= yMax; v += passo) griglia.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {griglia.map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? C.muted : "#e7e6e2"} /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill={C.muted}>{formattaNumero(v, 0)} €</text></g>)}
      {etichette.map((e, i) => {
        const cx = L + w * i + w / 2;
        return (
          <g key={i}>
            {serie.map((s, k) => {
              const v = s.valori[i]; if (v === null || v === undefined) return null;
              const bx = cx + (k - (serie.length - 1) / 2) * (bw + 3) - bw / 2, top = y(Math.max(v, 0)), h = Math.abs(y(v) - y(0));
              return <g key={k}>
                <rect x={bx} y={top} width={bw} height={Math.max(h, 1)} rx="3" fill={s.colore} opacity={s.chiari && s.chiari[i] ? 0.4 : 1} />
                <text x={bx + bw / 2} y={v >= 0 ? top - 4 : top + h + 11} textAnchor="middle" fontSize="9.5" fill={C.text}>{formattaNumero(v, 0)}</text>
              </g>;
            })}
            <text x={cx} y={H - B + 16} textAnchor="middle" fontSize="10" fill={C.text}>{e.nome}</text>
          </g>
        );
      })}
      {serie.map((s, k) => <g key={k}><rect x={W - R + 12} y={T + k * 20} width={12} height={12} rx="2" fill={s.colore} /><text x={W - R + 30} y={T + k * 20 + 10} fontSize="10.5" fill={C.text}>{s.nome}</text></g>)}
    </svg>
  );
}

function Simulazione({ base, specie, nomeSpecie, prezzo, usciti, mortalita }) {
  const [scelta, setScelta] = useState("attuale");
  const [aMano, setAMano] = useState("20");
  const suini = specie === "suino" && mortalita.perAnno.size > 0;
  const percentuale = suini ? (scelta === "dimezzata" ? null : scelta === "12" ? 12 : scelta === "mano" ? num(aMano) : null) : null;
  const sceltaValida = suini && scelta !== "attuale" && (scelta === "dimezzata" || (percentuale !== null && percentuale >= 0 && percentuale < 100));
  const fattore = useMemo(() => {
    if (!sceltaValida) return null;
    return anno => {
      const m = mortalita.perAnno.get(anno); if (m === undefined) return 1; // anno senza lotti: costo di nascita invariato
      const ms = scelta === "dimezzata" ? m / 2 : percentuale / 100;
      return (1 - m) / (1 - ms);
    };
  }, [sceltaValida, scelta, percentuale, mortalita]);

  const nati = useMemo(() => usciti.filter(s => !s.acquistato).map(s => ({ ...s, costoNascita: nascitaDi(base, s) })), [usciti, base]);
  const natiScelta = useMemo(() => !fattore ? null : nati.map(s => ({ ...s, costo: costoDi(base, s, null, fattore), costoNascita: nascitaDi(base, s, fattore) })), [nati, fattore, base]);
  const comprati = useMemo(() => usciti.filter(s => s.acquistato).map(s => ({ ...s, acquisto: s.costoAcquisto || 0 })), [usciti]);

  const fN = fasceDi(nati, specie, prezzo), fS = natiScelta ? fasceDi(natiScelta, specie, prezzo) : null, fC = fasceDi(comprati, specie, prezzo);
  const etichette = FASCE[specie].map(([, , nome]) => nome).filter(nome => fN.some(f => f.nome === nome) || fC.some(f => f.nome === nome));
  const per = (fasce, nome) => fasce ? fasce.find(f => f.nome === nome) || null : null;
  const nomeScelta = scelta === "dimezzata" ? "mortalità dimezzata" : `mortalità al ${formattaNumero(percentuale ?? 0, percentuale % 1 ? 1 : 0)}%`;

  const lineeEt = fN.map(f => ({ nome: f.nome, n: f.n }));
  const serieLinee = [
    { nome: suini ? "Costo con la mortalità attuale" : "Costo per capo", colore: ARANCIO, valori: fN.map(f => f.costo) },
    ...(fS ? [{ nome: `Costo con la ${nomeScelta}`, colore: VIOLA, valori: fS.map(f => f.costo) }] : []),
    { nome: "Valore della carcassa", riga2: `a ${formattaEuro(prezzo)} al kg`, colore: GRIGIO, valori: fN.map(f => f.valore), tratteggio: true },
  ];
  const yMax = scalaTonda(Math.max(1, ...serieLinee.flatMap(s => s.valori)) * 1.08);
  const serieBarre = [
    { nome: suini ? "Nati, mortalità attuale" : "Nati in azienda", colore: ARANCIO, valori: etichette.map(n => per(fN, n)?.alMese ?? null), chiari: etichette.map(n => (per(fN, n)?.n || 0) < CAPI_MINIMI) },
    ...(fS ? [{ nome: `Nati, ${nomeScelta}`, colore: VIOLA, valori: etichette.map(n => per(fS, n)?.alMese ?? null), chiari: etichette.map(n => (per(fS, n)?.n || 0) < CAPI_MINIMI) }] : []),
    { nome: "Comprati", colore: BLU, valori: etichette.map(n => per(fC, n)?.alMese ?? null), chiari: etichette.map(n => (per(fC, n)?.n || 0) < CAPI_MINIMI) },
  ];
  const tuttiMese = serieBarre.flatMap(s => s.valori).filter(v => v !== null);
  const lo = Math.min(0, ...tuttiMese), hi = Math.max(0, ...tuttiMese), pad = (hi - lo || 1) * 0.15;

  const media = (arr, f) => arr.length ? arr.reduce((t, x) => t + x[f], 0) / arr.length : 0;
  const bestN = migliore(fS || fN), bestC = migliore(fC);
  const linguetta = att => ({ background: att ? VIOLA : "#fff", color: att ? "#fff" : VIOLA, border: `1.5px solid ${VIOLA}`, borderRadius: 6, padding: "5px 10px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" });
  const th = { padding: "4px 5px", textAlign: "right", fontWeight: 700, verticalAlign: "bottom" };
  const td = { padding: "4px 5px", textAlign: "right" };
  const colore = v => (v >= 0 ? C.green : C.red);

  if (!fN.length && !fC.length) return null;
  return (
    <div>
      <div style={{ fontWeight: 800, color: C.primary, fontSize: 15 }}>Simulazione: {nomeSpecie.toLowerCase()} nati in azienda e comprati, al prezzo di {formattaEuro(prezzo)} al kg</div>
      <p style={{ fontSize: 12.5, color: C.muted, margin: "4px 0 10px" }}>Muova il prezzo in alto{suini ? " e scelga la mortalità dei suinetti" : ""}: grafici e tabella cambiano subito. Non si salva niente.</p>

      {suini && (
        <div style={{ background: "#F3F1FC", border: `1px solid #D5D0F5`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 13, marginRight: 4 }}>Mortalità dei suinetti</b>
            <button onClick={() => setScelta("attuale")} style={linguetta(scelta === "attuale")}>Attuale (in media {formattaNumero(mortalita.media * 100, 1)}%)</button>
            <button onClick={() => setScelta("dimezzata")} style={linguetta(scelta === "dimezzata")}>Dimezzata</button>
            <button onClick={() => setScelta("12")} style={linguetta(scelta === "12")}>12%</button>
            <button onClick={() => setScelta("mano")} style={linguetta(scelta === "mano")}>Scrivi tu</button>
            {scelta === "mano" && <><input value={aMano} onChange={e => setAMano(e.target.value)} inputMode="decimal" style={{ width: 60, textAlign: "right", padding: "5px 6px", border: `1.5px solid ${VIOLA}`, borderRadius: 6, fontSize: 13.5, fontWeight: 700 }} /><span style={{ fontSize: 13 }}>%</span></>}
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
            Mortalità attuale, anno per anno (nati morti diviso nati totali dei lotti nati in azienda): {[...mortalita.perAnno].sort((a, b) => a[0] - b[0]).map(([a, m]) => `${a} ${formattaNumero(m * 100, 1)}%`).join(" · ")}.
            {" "}«Dimezzata» dimezza la mortalità di ogni anno; «12%» e «Scrivi tu» la portano allo stesso valore in tutti gli anni.
          </div>
          {scelta === "mano" && !sceltaValida && <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>Scriva una percentuale tra 0 e 99.</div>}
        </div>
      )}

      <div style={{ fontSize: 13, margin: "0 0 8px", lineHeight: 1.55 }}>
        {bestN && <div>★ Nati in azienda{fS ? `, con la ${nomeScelta}` : ""}: {bestN.alMese >= 0 ? <>fascia migliore <b>{bestN.nome}</b>, {formattaEuro(bestN.alMese, 0)} di guadagno per mese in azienda.</> : <b style={{ color: C.red }}>si perde a ogni età.</b>}</div>}
        {bestC && <div>★ Comprati: {bestC.alMese >= 0 ? <>fascia migliore <b>{bestC.nome}</b>, {formattaEuro(bestC.alMese, 0)} per mese in azienda.</> : <b style={{ color: C.red }}>si perde a ogni età.</b>}</div>}
        {suini && nati.length > 0 && <div>Costo di nascita medio dei nati usciti: <b>{formattaEuro(media(nati, "costoNascita"), 0)}</b>{natiScelta ? <> con la mortalità attuale, <b style={{ color: VIOLA }}>{formattaEuro(media(natiScelta, "costoNascita"), 0)}</b> con la {nomeScelta}</> : ""}{comprati.length ? <>; un suinetto comprato è costato in media <b>{formattaEuro(media(comprati, "acquisto"), 0)}</b>.</> : "."}</div>}
      </div>

      {fN.length > 0 && <>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginTop: 6 }}>Nati in azienda: costo per capo{suini ? " con la mortalità attuale e con quella scelta" : ""} e valore della carcassa, per età di uscita</div>
        <GraficoLinee etichette={lineeEt} serie={serieLinee} yMax={yMax} />
      </>}
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginTop: 6 }}>Guadagno o perdita per mese in azienda, in euro (barre chiare: meno di {CAPI_MINIMI} capi)</div>
      <GraficoBarre etichette={etichette.map(nome => ({ nome }))} serie={serieBarre} yMin={lo - pad} yMax={hi + pad} />

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 12, marginTop: 8 }}>
          <thead>
            <tr style={{ color: C.muted }}>
              <th style={{ ...th, textAlign: "left" }}>Età di uscita</th>
              <th style={th}>Nati: capi</th><th style={th}>Carcassa media</th>
              {suini && <th style={th}>Costo di nascita{fS ? " con la mortalità attuale" : ""}</th>}
              {fS && <th style={{ ...th, color: VIOLA }}>Costo di nascita con la {nomeScelta}</th>}
              <th style={th}>Costo per capo</th><th style={th}>Valore della carcassa</th>
              <th style={th}>Guadagno per capo</th><th style={th}>Guadagno per mese</th>
              <th style={th}>Prezzo di pareggio al kg</th>
              <th style={{ ...th, borderLeft: `2px solid ${C.border}` }}>Comprati: capi</th><th style={th}>Comprati: guadagno per mese</th><th style={th}>Comprati: prezzo di pareggio al kg</th>
            </tr>
          </thead>
          <tbody>{etichette.map(nome => {
            const a = per(fN, nome), s = per(fS, nome), c = per(fC, nome), u = s || a;
            return (
              <tr key={nome} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 700, whiteSpace: "nowrap" }}>{nome}</td>
                <td style={td}>{a ? a.n : "—"}</td><td style={td}>{a ? `${formattaNumero(a.carcassa, 1)} kg` : "—"}</td>
                {suini && <td style={td}>{a ? formattaEuro(a.costoNascita, 0) : "—"}</td>}
                {fS && <td style={{ ...td, color: VIOLA, fontWeight: 700 }}>{s ? formattaEuro(s.costoNascita, 0) : "—"}</td>}
                <td style={td}>{u ? formattaEuro(u.costo, 0) : "—"}</td><td style={td}>{u ? formattaEuro(u.valore, 0) : "—"}</td>
                <td style={{ ...td, color: u ? colore(u.guadagno) : C.muted }}>{u ? formattaEuro(u.guadagno, 0) : "—"}</td>
                <td style={{ ...td, color: u ? colore(u.alMese) : C.muted, fontWeight: 700 }}>{u ? formattaEuro(u.alMese, 0) : "—"}</td>
                <td style={td}>{u ? formattaEuro(u.costoKg) : "—"}</td>
                <td style={{ ...td, borderLeft: `2px solid ${C.border}` }}>{c ? c.n : "—"}</td>
                <td style={{ ...td, color: c ? colore(c.alMese) : C.muted, fontWeight: 700 }}>{c ? formattaEuro(c.alMese, 0) : "—"}</td>
                <td style={td}>{c ? formattaEuro(c.costoKg) : "—"}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginTop: 10 }}>
        <b style={{ color: C.text }}>Cosa cambia.</b> Il <b>prezzo</b> cambia solo il valore della carcassa: il costo resta quello. Il <b>prezzo di pareggio al kg</b> è il prezzo
        sotto il quale quella fascia smette di guadagnare (costo per capo diviso carcassa media).
        {suini && <> La <b>mortalità dei suinetti</b> cambia solo il costo di nascita dei nati in azienda: il costo delle scrofe e dei verri si divide sui suinetti vivi,
        quindi con meno morti ogni suinetto ne porta di meno. Mantenimento e pesi restano quelli reali.</>}
        {suini && <> Nelle colonne del guadagno e del pareggio, i nati sono calcolati con la mortalità scelta. I comprati non dipendono dalla mortalità dei nostri suinetti.</>}
      </div>
    </div>
  );
}

export default function QuandoMacellare() {
  const [base, setBase] = useState(null);
  const [errore, setErrore] = useState("");
  const [specie, setSpecie] = useState("bovino");
  const [vista, setVista] = useState("provenienza");
  const [prezzi, setPrezzi] = useState({});
  const [proposti, setProposti] = useState({});
  const [avviso, setAvviso] = useState(null);
  const [mortalita, setMortalita] = useState({ perAnno: new Map(), media: 0 });

  useEffect(() => {
    (async () => {
      try {
        const [b, p, st] = await Promise.all([caricaDatiBase(), prezziDaFatture(new Date().getFullYear()), statoCalcoli().catch(() => null)]);
        setBase(b); setProposti(p); setAvviso(testoAvvisoCalcoli(st));
        setPrezzi(Object.fromEntries(Object.entries(p).map(([s, v]) => [s, v ? Number(v.prezzo).toFixed(2).replace(".", ",") : ""])));
        // mortalità dei suinetti per anno del parto, dai lotti nati in azienda (per la vista Simulazione)
        const { data: lotti } = await supabase.from("lotti_suini").select("data_parto, nati_totali, nati_morti, tipo_provenienza").eq("tipo_provenienza", "nato");
        const perAnno = new Map(), tot = new Map(); let nt = 0, nm = 0;
        for (const l of lotti || []) {
          const an = l.data_parto ? parseInt(String(l.data_parto).slice(0, 4)) : null; const t = +l.nati_totali || 0, m = +l.nati_morti || 0;
          if (!an || t <= 0) continue;
          const x = tot.get(an) || [0, 0]; x[0] += t; x[1] += m; tot.set(an, x); nt += t; nm += m;
        }
        for (const [an, [t, m]] of tot) perAnno.set(an, m / t);
        setMortalita({ perAnno, media: nt ? nm / nt : 0 });
      } catch (e) { setErrore(e.message); }
    })();
  }, []);

  const prezzo = num(prezzi[specie]) || 0;
  const simulato = !!proposti[specie] && Math.abs(prezzo - proposti[specie].prezzo) > 0.004;
  const massimo = Math.max(15, Math.ceil((proposti[specie]?.prezzo || 0) * 2));
  const usciti = useMemo(() => !base ? [] : base.soggetti
    .filter(s => s.specie === specie && !s.riproduttore && !s.codiceNonValido && s.pesoCarcassa > 0 && s.nascita && s.uscita)
    .map(s => ({ ...s, eta: mesiTra(s.nascita, s.uscita), mesi: mesiTra(s.inizio || s.nascita, s.uscita), carcassa: s.pesoCarcassa, costo: costoDi(base, s) }))
    .filter(s => s.costo > 0), [base, specie]);
  const senzaCosto = useMemo(() => !base ? 0 : base.soggetti.filter(s => s.specie === specie && !s.riproduttore && s.pesoCarcassa > 0 && s.nascita && s.uscita && costoDi(base, s) <= 0).length, [base, specie]);

  const gruppi = useMemo(() => {
    const tutti = fasceDi(usciti, specie, prezzo);
    const nati = fasceDi(usciti.filter(s => !s.acquistato), specie, prezzo), comprati = fasceDi(usciti.filter(s => s.acquistato), specie, prezzo);
    return { tutti, nati, comprati };
  }, [usciti, specie, prezzo]);

  // stessa scala per i riquadri affiancati
  const scala = useMemo(() => {
    const tutte = [...gruppi.tutti, ...gruppi.nati, ...gruppi.comprati];
    const yMax = Math.max(1, ...tutte.flatMap(f => [f.costo, f.valore])) * 1.12;
    const mesi = tutte.map(f => f.alMese);
    const lo = Math.min(0, ...mesi), hi = Math.max(0, ...mesi), pad = (hi - lo || 1) * 0.18;
    return { yMax, yMin: lo - pad, yMaxMese: hi + pad };
  }, [gruppi]);

  // capi in stalla oggi, con il semaforo del loro gruppo
  const inStalla = useMemo(() => {
    if (!base) return [];
    const d = oggi();
    return base.soggetti.filter(s => s.specie === specie && !s.riproduttore && base.presenteIl(s, d) && s.nascita).map(s => {
      const eta = mesiTra(s.nascita, d), mesi = mesiTra(s.inizio || s.nascita, d);
      const fasce = s.acquistato ? gruppi.comprati : gruppi.nati, best = migliore(fasce);
      let stato, testo;
      if (!best) { stato = "grigio"; testo = "Troppo pochi capi usciti dello stesso gruppo per un'indicazione."; }
      else if (best.alMese < 0) { stato = "grigio"; testo = `Al prezzo scelto il suo gruppo perde a ogni età: decidere con il Prezzo di Pareggio e il Break Even.`; }
      else if (eta < best.da) { stato = "giallo"; testo = `Da crescere: alla fascia migliore (${best.nome}) mancano ${formattaNumero(best.da - eta, 1)} mesi.`; }
      else if (eta < best.a) { stato = "verde"; testo = `Pronto: è nella fascia migliore (${best.nome}).`; }
      else { stato = "rosso"; testo = `Oltre la fascia migliore (${best.nome}): ogni mese in più rende meno.`; }
      return { codice: s.codice, sesso: s.sesso, comprato: s.acquistato, eta, mesi, costo: costoDi(base, s), stato, testo };
    }).sort((a, b) => b.eta - a.eta);
  }, [base, specie, gruppi]);

  const ordineStato = { rosso: 0, verde: 1, giallo: 2, grigio: 3 };
  const coloreStato = { verde: C.green, giallo: "#B98900", rosso: C.red, grigio: C.muted };
  const nomeStato = { verde: "● Pronto", giallo: "● Da crescere", rosso: "● Oltre", grigio: "● Nessuna indicazione" };
  const scheda = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 };
  const linguetta = att => ({ background: att ? C.primary : "#fff", color: att ? "#fff" : C.primary, border: `1.5px solid ${C.primary}`, borderRadius: 6, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" });
  const nomeSpecie = SPECIE.find(s => s.id === specie).nome;

  return (
    <div style={{ padding: 20, maxWidth: 1250, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Quando macellare</h1>
      <p style={{ color: C.muted, marginTop: 0, fontSize: 13.5, lineHeight: 1.5 }}>
        Si macella quando un mese in più in azienda costa più di quanto fa guadagnare. La pagina lo misura sui capi da macello già usciti con il peso
        della carcassa: per ogni fascia d'età all'uscita, quanto è costato un capo, quanto vale la sua carcassa al prezzo scelto e quanto ha reso per
        ogni mese passato in azienda. Poi i capi in stalla oggi con il semaforo e la Simulazione, dove si prova un altro prezzo e, per i suini, un'altra mortalità dei suinetti.
      </p>
      {avviso && <div style={{ ...scheda, background: "#FFF7E6", borderColor: "#E8A33D", fontSize: 13 }}>🔄 {avviso} Finché non si ricalcola, i costi di questa pagina non sono definitivi.</div>}
      {errore && <div style={{ ...scheda, color: C.red }}>⚠️ {errore}</div>}
      <div style={{ ...scheda, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {SPECIE.map(s => <button key={s.id} onClick={() => setSpecie(s.id)} style={linguetta(specie === s.id)}>{s.nome}</button>)}
        <span style={{ width: 16 }} />
        {[["tutti", "Tutti insieme"], ["provenienza", "Per provenienza"], ["stalla", "Capi in stalla oggi"], ["simulazione", "Simulazione"]].map(([id, l]) => <button key={id} onClick={() => setVista(id)} style={linguetta(vista === id)}>{l}</button>)}
        <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.muted }}>Prezzo al kg di carcassa</span>
        <input type="range" min={1} max={massimo} step={0.1} value={Math.min(prezzo, massimo)} onChange={e => setPrezzi(p => ({ ...p, [specie]: Number(e.target.value).toFixed(2).replace(".", ",") }))}
          style={{ width: 150, accentColor: C.blue }} aria-label="Prezzo al kg di carcassa" />
        <input value={prezzi[specie] ?? ""} onChange={e => setPrezzi(p => ({ ...p, [specie]: e.target.value }))} inputMode="decimal"
          style={{ width: 80, textAlign: "right", padding: "6px 8px", border: `1.5px solid ${C.blue}`, borderRadius: 6, fontSize: 14, fontWeight: 700 }} />
        <span style={{ fontSize: 13 }}>€</span>
        </span>
        {proposti[specie] && <span style={{ fontSize: 11.5, color: C.muted, width: "100%", textAlign: "right" }}>Proposto: {formattaEuro(proposti[specie].prezzo)} al kg, media delle fatture di vendita del {proposti[specie].anno}. Si può cambiare per fare prove: non si salva niente.</span>}
      </div>
      {simulato && (
        <div style={{ ...scheda, background: "#FFF4CC", borderColor: "#E0B400", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 13.5 }}>
          <span><b>Simulazione:</b> prezzo {formattaEuro(prezzo)} al kg (fatture: {formattaEuro(proposti[specie].prezzo)}). Non viene salvato nulla.</span>
          <button onClick={() => setPrezzi(p => ({ ...p, [specie]: Number(proposti[specie].prezzo).toFixed(2).replace(".", ",") }))}
            style={{ marginLeft: "auto", background: "#fff", border: "1.5px solid #B08D00", color: "#7A6200", borderRadius: 6, padding: "5px 10px", fontWeight: 700, fontSize: 12.5 }}>Torna al prezzo delle fatture</button>
        </div>
      )}

      {!base && !errore && <p>Caricamento dei capi e dei costi…</p>}
      {base && !usciti.length && <div style={scheda}>{nomeSpecie}: nessun capo da macello uscito con età, peso della carcassa e costi salvati. I pesi della carcassa vanno inseriti nell'app.</div>}

      {base && usciti.length > 0 && vista === "tutti" && (
        <div style={scheda}><Gruppo titolo={`${nomeSpecie}, nati in azienda e comprati insieme`} fasce={gruppi.tutti} prezzo={prezzo} scala={scala} /></div>
      )}
      {base && usciti.length > 0 && vista === "provenienza" && (
        <div style={{ ...scheda, display: "flex", gap: 24, flexWrap: "wrap" }}>
          <Gruppo titolo={`${nomeSpecie} nati in azienda`} fasce={gruppi.nati} prezzo={prezzo} scala={scala} />
          <Gruppo titolo={`${nomeSpecie} comprati`} fasce={gruppi.comprati} prezzo={prezzo} scala={scala} />
        </div>
      )}
      {base && usciti.length > 0 && vista === "simulazione" && (
        <div style={scheda}><Simulazione base={base} specie={specie} nomeSpecie={nomeSpecie} prezzo={prezzo} usciti={usciti} mortalita={mortalita} /></div>
      )}
      {base && vista === "stalla" && (
        <div style={scheda}>
          <div style={{ fontWeight: 800, color: C.primary, fontSize: 15, marginBottom: 4 }}>{nomeSpecie} da macello in stalla oggi: {inStalla.length}</div>
          <p style={{ fontSize: 12.5, color: C.muted, marginTop: 0 }}>Il semaforo confronta l'età del capo con la fascia più conveniente del suo gruppo (nati in azienda o comprati), al prezzo scelto. Prima i capi oltre la fascia, poi quelli pronti.</p>
          <div style={{ display: "flex", gap: 14, fontSize: 12.5, marginBottom: 8, flexWrap: "wrap" }}>
            {Object.keys(nomeStato).map(k => <span key={k} style={{ color: coloreStato[k], fontWeight: 700 }}>{nomeStato[k]}: {inStalla.filter(c => c.stato === k).length}</span>)}
          </div>
          <table style={{ width: "100%", fontSize: 12.5 }}>
            <thead><tr style={{ color: C.muted }}>{["Capo", "Sesso", "Provenienza", "Età", "Mesi in azienda", "Costo finora", "Semaforo", "Perché"].map(t => <th key={t} style={{ textAlign: ["Età", "Mesi in azienda", "Costo finora"].includes(t) ? "right" : "left", padding: "4px 6px" }}>{t}</th>)}</tr></thead>
            <tbody>{[...inStalla].sort((a, b) => ordineStato[a.stato] - ordineStato[b.stato] || b.eta - a.eta).map(c => (
              <tr key={c.codice} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: "4px 6px", fontWeight: 700 }}>{c.codice}</td><td>{c.sesso || ""}</td><td>{c.comprato ? "comprato" : "nato in azienda"}</td>
                <td style={{ textAlign: "right" }}>{formattaNumero(c.eta, 1)} mesi</td><td style={{ textAlign: "right" }}>{formattaNumero(c.mesi, 1)}</td>
                <td style={{ textAlign: "right" }}>{formattaEuro(c.costo, 0)}</td>
                <td style={{ color: coloreStato[c.stato], fontWeight: 700, padding: "4px 6px", whiteSpace: "nowrap" }}>{nomeStato[c.stato]}</td>
                <td style={{ color: C.muted }}>{c.testo}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}

      {base && (
        <div style={{ ...scheda, fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
          <b style={{ color: C.text }}>Come si legge e cosa sapere.</b> Le fasce sono per età all'uscita; il guadagno per mese è diviso per i mesi passati
          in azienda (per i comprati, dall'ingresso). Il costo di un capo è quello di tutto il programma: acquisto o nascita, mantenimento e costo rimasto dei
          riproduttori, dai costi salvati del Report Costi. Si usano solo i capi da macello usciti con età, peso della carcassa e costi
          ({usciti.length} {nomeSpecie.toLowerCase()}{senzaCosto ? `; ${senzaCosto} senza costi salvati restano fuori` : ""}). Le fasce con meno di {CAPI_MINIMI} capi
          si vedono ma non decidono: sono indicazioni, non regole. Per i lotti di suini comprati l'app ha come data di nascita il giorno di arrivo, quindi l'età è
          quella in azienda. Contano anche la categoria commerciale e le richieste del cliente, che la pagina non vede.
        </div>
      )}
    </div>
  );
}
