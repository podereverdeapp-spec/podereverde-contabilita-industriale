import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { formattaEuro } from "./parsingUtils";
import { caricaReseStagioni, campagneContinue } from "./calcoloCampiStagioni";

// Coltivazioni → Campi e Stagioni → Grafici
// Sola lettura, stessi dati e stesse regole di «Rese e Costi per Stagione».
//  1. Costo per ettaro dell'azienda, campagna per campagna, diviso per voce
//  2. Costo per ettaro per coltura (barre affiancate, un colore per coltura)
//  3. Costo unitario dei prodotti: costo al quintale contro prezzo di mercato al quintale
// Grafici in SVG puro, come gli altri grafici del programma (nessuna libreria esterna).

// Colori per categoria (validati per daltonismo); ogni entità tiene sempre il suo colore
const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948", "#8B6F47"];
const ORDINE_COLTURE = ["Orzo", "Erba medica", "Erbaio misto", "Sulla", "Avena", "Trifoglio", "Pascolo erbaio", "Sorgo", "Favino"];
const VOCI = [
  { k: "semi", nome: "Semi", colore: "#1baf7a" },
  { k: "concimi", nome: "Concimi e fitosanitari", colore: "#eb6834" },
  { k: "lavorazioni", nome: "Lavorazioni", colore: "#2a78d6" },
  { k: "altro", nome: "Altro", colore: "#eda100" },
];
const FAMIGLIE = [
  { nome: "Fieni e paglia", test: p => /^fieno|^paglia/i.test(p) },
  { nome: "Granelle", test: p => /^granella/i.test(p) },
  { nome: "Sementi", test: p => /^seme/i.test(p) },
  { nome: "Altri prodotti", test: () => true },
];

// colore di una coltura: fisso per le colture note, poi i colori successivi per quelle nuove
const coloreDi = (n, tutte) => {
  const i = ORDINE_COLTURE.indexOf(n);
  if (i >= 0) return PALETTE[i];
  const nuove = tutte.filter(x => !ORDINE_COLTURE.includes(x));
  return RISERVA[Math.max(0, nuove.indexOf(n)) % RISERVA.length];
};
const RISERVA = ["#6b7280", "#0e7490", "#a16207", "#be185d", "#4d7c0f"];
const nomeColtura = s => { const t = String(s || "").trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const n0 = v => Math.round(v).toLocaleString("it-IT");
const n2 = v => Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n1q = v => Number(v).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const breve = v => (v >= 100 ? n0(v) : n2(v));
const passo = max => { const g = max / 5, p = Math.pow(10, Math.floor(Math.log10(g))); const m = g / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };

function Legenda({ voci, nascoste, onClick, extra }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12, margin: "6px 0 4px" }}>
      {voci.map(v => (
        <span key={v.nome} onClick={onClick ? () => onClick(v.nome) : undefined}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: onClick ? "pointer" : "default", opacity: nascoste?.has(v.nome) ? 0.35 : 1, userSelect: "none" }}>
          <i style={{ width: 12, height: 12, borderRadius: 3, background: v.colore, display: "inline-block" }} />{v.nome}
        </span>
      ))}
      {extra}
      {onClick && <span style={{ color: C.muted }}>(clic su un nome per nasconderlo o mostrarlo)</span>}
    </div>
  );
}

function Suggerimento({ tip }) {
  if (!tip) return null;
  return (
    <div style={{ position: "absolute", left: tip.x, top: tip.y, transform: "translate(-50%, -100%)", marginTop: -8, background: "#fff",
      border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 4px 14px rgba(0,0,0,0.12)", padding: "7px 10px", fontSize: 12,
      pointerEvents: "none", whiteSpace: "nowrap", zIndex: 5 }}>
      {tip.righe.map((r, i) => <div key={i} style={{ fontWeight: i === 0 ? 800 : 400 }}>{r}</div>)}
    </div>
  );
}

// Asse e griglia comuni
function Griglia({ W, L, R, B, T, max, y, categorie, cw, vuote, suffisso = "€" }) {
  const st = passo(max), righe = [];
  for (let v = 0; v <= max + 1e-9; v += st) righe.push(v);
  return (<>
    {righe.map(v => (<g key={v}>
      <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#E3DFD4" />
      <text x={L - 8} y={y(v) + 4} fontSize="11" textAnchor="end" fill={C.muted}>{Number.isInteger(Math.round(v * 100) / 100) ? n0(v) : n2(v)} {suffisso}</text>
    </g>))}
    {categorie.map((c, i) => (<g key={c}>
      <text x={L + cw * i + cw / 2} y={B + 20} fontSize="12" textAnchor="middle" fontWeight="700" fill={C.text}>{c}</text>
      {vuote[c] && <text x={L + cw * i + cw / 2} y={B - 12} fontSize="11" textAnchor="middle" fill={C.muted}>{vuote[c]}</text>}
    </g>))}
    <line x1={L} x2={W - R} y1={B} y2={B} stroke={C.muted} />
  </>);
}

// ---------------------------------------------------------------------------
// Grafico 1 — colonne impilate per voce di costo
function ColonneImpilate({ campagne }) {
  const [tip, setTip] = useState(null);
  const W = 1100, H = 340, L = 64, R = 10, B = 300, T = 24;
  const cats = campagne.map(c => c.campagna);
  const tot = c => VOCI.reduce((s, v) => s + (c[v.k] || 0), 0);
  const max = Math.max(100, ...campagne.filter(c => c.ettari).map(tot)) * 1.12;
  const y = v => B - (v / max) * (B - T), cw = (W - L - R) / Math.max(cats.length, 1);
  const vuote = {}; campagne.forEach(c => { if (!c.ettari) vuote[c.campagna] = "non caricata"; });
  return (
    <div style={{ position: "relative" }}>
      <Legenda voci={VOCI} />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseLeave={() => setTip(null)}>
        <Griglia W={W} L={L} R={R} B={B} T={T} max={max} y={y} categorie={cats} cw={cw} vuote={vuote} />
        {campagne.map((c, i) => {
          if (!c.ettari) return null;
          const w = Math.min(70, cw * 0.44), x = L + cw * i + (cw - w) / 2;
          let acc = 0;
          const pezzi = VOCI.map(v => { const val = c[v.k] || 0; const y0 = y(acc), y1 = y(acc + val); acc += val; return { v, val, y0, y1 }; });
          return (<g key={c.campagna}>
            {pezzi.filter(p => p.val > 0).map(p => (<g key={p.v.k}>
              <rect x={x} y={p.y1 + 1} width={w} height={Math.max(p.y0 - p.y1 - 2, 0.5)} rx="3" fill={p.v.colore}
                onMouseMove={e => { const r = e.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect(); setTip({ x: e.clientX - r.left, y: e.clientY - r.top, righe: [`${c.campagna} · ${p.v.nome}`, `${formattaEuro(p.val)} per ettaro`, `${formattaEuro(p.val * c.ettari)} in totale`] }); }} />
              {p.y0 - p.y1 > 16 && <text x={x + w / 2} y={(p.y0 + p.y1) / 2 + 4} fontSize="10.5" textAnchor="middle" fill="#fff" fontWeight="700" pointerEvents="none">{n0(p.val)}</text>}
            </g>))}
            <text x={x + w / 2} y={y(acc) - 8} fontSize="13" textAnchor="middle" fontWeight="800" fill={C.primary}>{n0(acc)} €/ha</text>
          </g>);
        })}
      </svg>
      <Suggerimento tip={tip} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grafici 2 e 3 — barre affiancate, una per serie; facoltativo il trattino del prezzo di mercato
function BarreAffiancate({ categorie, serie, vuote, conMercato, unita, rif, suffisso = "€", formatoBarra = breve }) {
  // rif: { nome, nota, altoBene } — di serie il riferimento è il prezzo di mercato (sopra = male)
  rif = rif || { nome: "prezzo di mercato al quintale", altoBene: false,
    nota: <>Numero sopra la barra: costo {unita} — <b style={{ color: C.red }}>rosso</b> se sopra il mercato, <b style={{ color: "#2E7D32" }}>verde</b> se sotto.</> };
  const [tip, setTip] = useState(null);
  const [nascoste, setNascoste] = useState(() => new Set());
  const cambia = nome => setNascoste(p => { const n = new Set(p); n.has(nome) ? n.delete(nome) : n.add(nome); return n; });
  const visibili = serie.filter(s => !nascoste.has(s.nome));
  const W = 1100, H = 380, L = 64, R = 10, B = 340, T = 30;
  const valori = visibili.flatMap(s => Object.values(s.valori).flatMap(d => [d.v, conMercato ? d.mercato || 0 : 0]));
  const max = Math.max(1, ...valori) * 1.15;
  const y = v => B - (v / max) * (B - T), cw = (W - L - R) / Math.max(categorie.length, 1);
  return (
    <div style={{ position: "relative" }}>
      <Legenda voci={serie} nascoste={nascoste} onClick={cambia}
        extra={conMercato && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 16, height: 3, background: "#0b0b0b", display: "inline-block" }} />{rif.nome}</span>} />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseLeave={() => setTip(null)}>
        <Griglia W={W} L={L} R={R} B={B} T={T} max={max} y={y} categorie={categorie} cw={cw} suffisso={suffisso}
          vuote={Object.fromEntries(categorie.map(c => [c, vuote[c] || (visibili.some(s => s.valori[c]) ? null : "—")]))} />
        {categorie.map((c, i) => {
          const pres = visibili.filter(s => s.valori[c]);
          if (!pres.length) return null;
          const bw = Math.min(26, (cw - 16) / pres.length - 3), tot = pres.length * (bw + 3), sx = L + cw * i + (cw - tot) / 2;
          return pres.map((s, k) => {
            const d = s.valori[c], x = sx + k * (bw + 3);
            const sopra = conMercato && d.mercato != null ? (rif.altoBene ? d.v < d.mercato : d.v > d.mercato) : null;
            const top = y(d.v);
            return (<g key={s.nome + c}>
              <rect x={x} y={y(d.v)} width={bw} height={Math.max(B - y(d.v), 0.5)} rx="3" fill={s.colore}
                onMouseMove={e => { const r = e.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect(); setTip({ x: e.clientX - r.left, y: e.clientY - r.top, righe: [`${s.nome} · ${c}`, ...d.dettaglio] }); }} />
              {conMercato && d.mercato != null && <line x1={x - 3} x2={x + bw + 3} y1={y(d.mercato)} y2={y(d.mercato)} stroke="#0b0b0b" strokeWidth="2.5" pointerEvents="none" />}
              <text transform={`translate(${x + bw / 2 + 3},${top - 5}) rotate(-90)`} fontSize="10" fontWeight="700" pointerEvents="none"
                fill={sopra == null ? C.text : sopra ? C.red : "#2E7D32"}>{formatoBarra(d.v)}</text>
            </g>);
          });
        })}
      </svg>
      <Suggerimento tip={tip} />
      {conMercato && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{rif.nota}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saldo contro il mercato: colonne sotto lo zero, divise tra prodotti raccolti e pascoli
function ColonneSaldo({ categorie, saldi }) {
  const [tip, setTip] = useState(null);
  const W = 1100, H = 340, L = 76, R = 10, T = 30, B = 316;
  const vals = Object.values(saldi).flatMap(s => [s.saldo, s.prodotti, 0]);
  const minV = Math.min(-1000, ...vals) * 1.12, maxV = Math.max(0, ...vals) * 1.12;
  const y = v => T + ((maxV - v) / (maxV - minV)) * (B - T), cw = (W - L - R) / Math.max(categorie.length, 1);
  const st = passo(maxV - minV), righe = [];
  for (let v = Math.ceil(minV / st) * st; v <= maxV + 1e-9; v += st) righe.push(v);
  const tipDa = (e, righe) => { const r = e.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect(); setTip({ x: e.clientX - r.left, y: e.clientY - r.top, righe }); };
  return (
    <div style={{ position: "relative" }}>
      <Legenda voci={[{ nome: "Saldo sui prodotti raccolti", colore: "#d03b3b" }, { nome: "Costo dei pascoli (nessuna raccolta)", colore: "#f0a3a3" }]} />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseLeave={() => setTip(null)}>
        {righe.map(v => (<g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#E3DFD4" />
          <text x={L - 8} y={y(v) + 4} fontSize="11" textAnchor="end" fill={C.muted}>{n0(v)} €</text></g>))}
        {categorie.map((c, i) => {
          const x0 = L + cw * i, w = Math.min(70, cw * 0.44), x = x0 + (cw - w) / 2, s = saldi[c];
          return (<g key={c}>
            <text x={x0 + cw / 2} y={T - 12} fontSize="12" textAnchor="middle" fontWeight="700" fill={C.text}>{c}</text>
            {!s ? <text x={x0 + cw / 2} y={y(0) + 22} fontSize="11" textAnchor="middle" fill={C.muted}>non caricata</text> : <>
              <rect x={x} y={Math.min(y(0), y(s.prodotti))} width={w} height={Math.max(Math.abs(y(s.prodotti) - y(0)) - 1, 0.5)} rx="3" fill={s.prodotti < 0 ? "#d03b3b" : "#2E9E3A"}
                onMouseMove={e => tipDa(e, [`${c} · prodotti raccolti`, `valore di mercato ${formattaEuro(s.valore)}`, `costo ${formattaEuro(s.costoProdotti)}`, `saldo ${formattaEuro(s.prodotti)}`])} />
              {s.pascoli > 0 && <rect x={x} y={Math.min(y(s.prodotti), y(s.saldo)) + 1} width={w} height={Math.max(Math.abs(y(s.saldo) - y(s.prodotti)) - 1, 0.5)} rx="3" fill="#f0a3a3"
                onMouseMove={e => tipDa(e, [`${c} · pascoli`, `costo ${formattaEuro(s.pascoli)}`, "nessuna raccolta, nessun valore di mercato"])} />}
              <text x={x + w / 2} y={(s.saldo < 0 ? y(s.saldo) + 16 : y(s.saldo) - 6)} fontSize="13" textAnchor="middle" fontWeight="800" fill={s.saldo < 0 ? C.red : "#2E7D32"}>{n0(s.saldo)} €</text>
            </>}
          </g>);
        })}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke={C.muted} />
      </svg>
      <Suggerimento tip={tip} />
    </div>
  );
}

function Tabella({ categorie, serie, formato, conMercato, nomeRif = "mercato", altoBene = false }) {
  const th = { padding: "6px 8px", fontSize: 11, textAlign: "right", whiteSpace: "nowrap" };
  const td = { padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap", borderTop: `1px solid ${C.border}` };
  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: C.primary }}>Tabella dei numeri</summary>
      <div style={{ overflow: "auto", marginTop: 6 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}><th style={{ ...th, textAlign: "left" }}></th>{categorie.map(c => <th key={c} style={th}>{c}</th>)}</tr></thead>
          <tbody>{serie.map(s => (
            <tr key={s.nome}>
              <td style={{ ...td, textAlign: "left" }}><i style={{ width: 10, height: 10, borderRadius: 2, background: s.colore, display: "inline-block", marginRight: 6 }} />{s.nome}</td>
              {categorie.map(c => { const d = s.valori[c]; return (
                <td key={c} style={{ ...td, color: d && conMercato && d.mercato != null ? ((altoBene ? d.v < d.mercato : d.v > d.mercato) ? C.red : "#2E7D32") : undefined }}>
                  {d ? formato(d.v) : "—"}{d && conMercato && d.mercato != null && <div style={{ fontSize: 10.5, color: C.muted }}>{nomeRif} {formato(d.mercato)}</div>}
                </td>); })}
            </tr>))}</tbody>
        </table>
      </div>
    </details>
  );
}

const Card = ({ titolo, sotto, children }) => (
  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
    <h2 style={{ color: C.primary, fontSize: 16, margin: "0 0 2px" }}>{titolo}</h2>
    {sotto && <p style={{ color: C.muted, fontSize: 12.5, margin: "0 0 4px", lineHeight: 1.45 }}>{sotto}</p>}
    {children}
  </div>
);

// ---------------------------------------------------------------------------
export default function ColtGrafici() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);

  useEffect(() => {
    (async () => { try { setDati(await caricaReseStagioni()); } catch (err) { setErrore(err.message); } })();
  }, []);

  const m = useMemo(() => {
    if (!dati) return null;
    // campagne concluse (con costi), comprese quelle non caricate in mezzo
    const concluse = dati.campagne.filter(c => !c.inCorso);
    const categorie = campagneContinue(concluse.map(c => c.campagna));
    const per = Object.fromEntries(concluse.map(c => [c.campagna, c]));
    const vuote = Object.fromEntries(categorie.filter(c => !per[c]).map(c => [c, "non caricata"]));

    // 1 — per voce, per ettaro
    const campagne = categorie.map(c => {
      const x = per[c]; if (!x || !x.ettari) return { campagna: c, ettari: null };
      return { campagna: c, ettari: x.ettari, semi: x.semi / x.ettari, concimi: (x.concimi + x.fitosanitari) / x.ettari,
        lavorazioni: x.lavorazioni / x.ettari, altro: x.altro / x.ettari };
    });

    // 2 — per coltura: ogni coltura una volta sola (le righe della vista sono per prodotto)
    const colture = {};
    dati.prodotti.forEach(p => { if (per[p.campagna] && p.costoColtura > 0 && p.ettari > 0) colture[p.id] = p; });
    const agg = {};
    Object.values(colture).forEach(p => {
      const n = nomeColtura(p.coltura), a = ((agg[n] ||= {})[p.campagna] ||= { costo: 0, ettari: 0, campi: 0 });
      a.costo += p.costoColtura; a.ettari += p.ettari; a.campi += 1;
    });
    const nomiColture = Object.keys(agg).sort((a, b) => {
      const ia = ORDINE_COLTURE.indexOf(a), ib = ORDINE_COLTURE.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    const serieColture = nomiColture.map((n, i) => ({
      nome: n, colore: coloreDi(n, nomiColture),
      valori: Object.fromEntries(Object.entries(agg[n]).map(([cp, a]) => [cp, { v: a.costo / a.ettari,
        dettaglio: [`${formattaEuro(a.costo / a.ettari)} per ettaro`, `${n2(a.ettari)} ettari · ${a.campi} ${a.campi === 1 ? "campo" : "campi"}`, `costo ${formattaEuro(a.costo)}`] }])),
    }));

    // 3 — costo unitario dei prodotti, al quintale, contro il mercato
    const pr = {};
    dati.prodotti.forEach(p => {
      if (!p.prodotto || !per[p.campagna] || !(p.costoColtura > 0) || p.prezzoQ == null || !(p.quintali > 0)) return;
      const a = ((pr[p.prodotto] ||= {})[p.campagna] ||= { costo: 0, q: 0, valore: 0, quantita: 0, unita: p.unita });
      a.costo += p.costo || 0; a.q += p.quintali; a.valore += p.valore || 0; a.quantita += p.quantita || 0;
    });
    const famiglie = [];
    const usati = new Set();
    FAMIGLIE.forEach(f => {
      const nomi = Object.keys(pr).filter(n => !usati.has(n) && f.test(n)).sort();
      nomi.forEach(n => usati.add(n));
      if (!nomi.length) return;
      famiglie.push({ nome: f.nome, serie: nomi.map((n, i) => ({
        nome: n, colore: PALETTE[i % PALETTE.length],
        valori: Object.fromEntries(Object.entries(pr[n]).map(([cp, a]) => {
          const cu = a.costo / a.q, me = a.valore / a.q;
          const perBalla = a.unita === "balloni" || a.unita === "rotoballe";
          return [cp, { v: cu, mercato: me, dettaglio: [
            `costo ${formattaEuro(cu)} al quintale`, `mercato ${formattaEuro(me)} al quintale`,
            `${n0(a.quantita)} ${a.unita}${perBalla ? ` (${n0(a.q)} quintali) · ${formattaEuro(a.costo / a.quantita)} ${a.unita === "balloni" ? "per ballone" : "per rotoballa"}` : ""}`,
          ] }];
        })),
      })) });
    });
    // 4 — saldo contro il mercato, diviso tra prodotti raccolti e pascoli
    const saldi = {};
    concluse.forEach(c => {
      const pasc = Object.values(Object.fromEntries(dati.prodotti.filter(p => p.campagna === c.campagna && !p.prodotto).map(p => [p.id, p])))
        .reduce((s, p) => s + p.costoColtura, 0);
      const valore = c.valore || 0, costoProdotti = c.costo - pasc;
      saldi[c.campagna] = { saldo: valore - c.costo, prodotti: valore - costoProdotti, pascoli: pasc, valore, costoProdotti };
    });

    // 5 — resa per ettaro contro la resa di riferimento (solo i prodotti principali con un riferimento)
    // colture e prodotti con una resa di riferimento, ricavati dai dati dell'app (una resa nuova compare da sola)
    const conRif = {};
    dati.prodotti.filter(p => p.prodotto && p.resaRiferimento != null).forEach(p => { (conRif[nomeColtura(p.coltura)] ||= new Set()).add(p.prodotto); });
    const RESE = Object.keys(conRif).sort((a, b) => {
      const ia = ORDINE_COLTURE.indexOf(a), ib = ORDINE_COLTURE.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    }).map(k => [k, coloreDi(k, nomiColture), [...conRif[k]].sort()]);
    const serieRese = RESE.map(([nome, colore, prodotti]) => {
      const perCp = {};
      const perColtura = {};
      dati.prodotti.filter(p => per[p.campagna] && p.costoColtura > 0 && prodotti.includes(p.prodotto) && p.quintali > 0).forEach(p => {
        const k = p.id, a = (perColtura[k] ||= { campagna: p.campagna, ettari: p.ettari, q: 0, rif: p.resaRiferimento });
        a.q += p.quintali; if (a.rif == null) a.rif = p.resaRiferimento;
      });
      Object.values(perColtura).forEach(a => {
        const b = (perCp[a.campagna] ||= { q: 0, ettari: 0, rif: null }); b.q += a.q; b.ettari += a.ettari; if (b.rif == null) b.rif = a.rif;
      });
      return { nome: `${nome} (${prodotti.map(x => x.split(" ")[0].toLowerCase()).join(" e ")})`, colore,
        valori: Object.fromEntries(Object.entries(perCp).filter(([, b]) => b.ettari > 0).map(([cp, b]) => [cp, { v: b.q / b.ettari, mercato: b.rif,
          dettaglio: [`${n1q(b.q / b.ettari)} quintali per ettaro`, `riferimento ISTAT ${b.rif == null ? "non indicato" : n1q(b.rif)}`, `${n0(b.q)} quintali su ${n2(b.ettari)} ettari`] }])) };
    }).filter(s => Object.keys(s.valori).length);
    return { categorie, vuote, campagne, serieColture, famiglie, saldi, serieRese };
  }, [dati]);

  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;
  if (!m) return <div style={{ padding: 20, color: C.muted }}>Preparazione dei grafici...</div>;

  const tabCampagne = VOCI.map(v => ({ nome: v.nome, colore: v.colore,
    valori: Object.fromEntries(m.campagne.filter(c => c.ettari).map(c => [c.campagna, { v: c[v.k] }])) }));

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Grafici</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
        I costi delle coltivazioni, campagna per campagna, con i dati dell'app Podere Verde (gli stessi di «Rese e Costi per Stagione»). Passare il mouse su una barra per leggerne i dettagli.
      </p>

      <Card titolo="1. Costo per ettaro dell'azienda, campagna per campagna"
        sotto="Colonne divise per voce di costo; sopra ogni colonna il totale per ettaro. Ettari = superficie coltivata, ogni campo contato una volta.">
        <ColonneImpilate campagne={m.campagne} />
        <Tabella categorie={m.categorie.filter(c => !m.vuote[c])} serie={tabCampagne} formato={v => formattaEuro(v)} />
      </Card>

      <Card titolo="2. Costo per ettaro per coltura"
        sotto="Tutte le colture sullo stesso grafico: per ogni campagna una barra per coltura, ogni coltura sempre con lo stesso colore. Sopra ogni barra gli euro per ettaro.">
        <BarreAffiancate categorie={m.categorie} serie={m.serieColture} vuote={m.vuote} />
        <Tabella categorie={m.categorie.filter(c => !m.vuote[c])} serie={m.serieColture} formato={v => formattaEuro(v, 0)} />
      </Card>

      <h2 style={{ color: C.primary, fontSize: 19, margin: "26px 0 4px" }}>Costo unitario dei prodotti</h2>
      <p style={{ color: C.muted, fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.45 }}>
        L'altezza della barra è il costo al quintale del prodotto fatto in azienda; il trattino nero è il prezzo di mercato al quintale. Barra sopra il trattino = produrre è costato più che comprare.
        I prodotti sono divisi per famiglia perché i valori sono molto diversi (il fieno costa pochi euro al quintale, il seme di medica centinaia). Balloni e rotoballe: 340 chilogrammi.
      </p>
      {m.famiglie.map((f, i) => (
        <Card key={f.nome} titolo={`${3 + i}. ${f.nome}`}>
          <BarreAffiancate categorie={m.categorie} serie={f.serie} vuote={m.vuote} conMercato unita="al quintale" />
          <Tabella categorie={m.categorie.filter(c => !m.vuote[c])} serie={f.serie} formato={v => formattaEuro(v)} conMercato />
        </Card>
      ))}

      <Card titolo={`${3 + m.famiglie.length}. Saldo contro il mercato, campagna per campagna`}
        sotto="Valore di mercato dei prodotti raccolti meno il costo di coltivazione. Sotto lo zero: produrre è costato più che comprare. La colonna è divisa tra il saldo sui prodotti raccolti e il costo dei pascoli, che non hanno raccolta e quindi nessun valore di mercato.">
        <ColonneSaldo categorie={m.categorie} saldi={m.saldi} />
        <Tabella categorie={m.categorie.filter(c => !m.vuote[c])} formato={v => formattaEuro(v)} serie={[
          { nome: "Saldo sui prodotti raccolti", colore: "#d03b3b", valori: Object.fromEntries(Object.entries(m.saldi).map(([c, s]) => [c, { v: s.prodotti }])) },
          { nome: "Costo dei pascoli", colore: "#f0a3a3", valori: Object.fromEntries(Object.entries(m.saldi).map(([c, s]) => [c, { v: -s.pascoli }])) },
          { nome: "Saldo totale", colore: C.primary, valori: Object.fromEntries(Object.entries(m.saldi).map(([c, s]) => [c, { v: s.saldo }])) },
        ]} />
      </Card>

      {m.serieRese.length > 0 && (
        <Card titolo={`${4 + m.famiglie.length}. Resa per ettaro contro la resa di riferimento`}
          sotto="Quintali per ettaro raccolti in azienda (barra) contro la resa di riferimento, media della provincia di Roma, fonte ISTAT (trattino nero). Barra sotto il trattino = resa sotto la media provinciale. Solo le colture con una resa di riferimento.">
          <BarreAffiancate categorie={m.categorie} serie={m.serieRese} vuote={m.vuote} conMercato suffisso="q/ha" formatoBarra={n1q}
            rif={{ nome: "resa di riferimento ISTAT", altoBene: true, nota: <>Numero sopra la barra: resa in quintali per ettaro — <b style={{ color: C.red }}>rosso</b> se sotto il riferimento, <b style={{ color: "#2E7D32" }}>verde</b> se sopra.</> }} />
          <Tabella categorie={m.categorie.filter(c => !m.vuote[c])} serie={m.serieRese} formato={n1q} conMercato nomeRif="riferimento" altoBene />
        </Card>
      )}
    </div>
  );
}
