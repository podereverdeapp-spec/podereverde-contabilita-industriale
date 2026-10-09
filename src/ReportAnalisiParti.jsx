// Versione 239 — Pezzi comuni delle pagine «Report di Analisi»: riquadri, cose buone, criticità con cause e
// bollini, segnali, affidabilità, grafici a barre e a cascata. Solo presentazione: i numeri arrivano già
// calcolati da calcoloReportAnalisi.js.
import { C } from "./style";
import { it } from "./calcoloReportAnalisi";

export const COLORI_GRUPPO = {
  "Lavoro": "#3A5A40",
  "Alimentazione comprata": "#D4A017",
  "Coltivazione (alimenti prodotti in azienda)": "#6B8E4E",
  "Ammortamenti": "#2C6E9B",
  "Altre spese": "#8B6F47",
  "Quota dei riproduttori": "#B5657A",
  "Acquisto del capo": "#7A756A",
};
export const SALE = C.red, SCENDE = C.green;

const BOLLINI = {
  "b-verde": { bg: "#E6F0E8", fg: "#2F5E3B" },
  "b-arancio": { bg: "#FBF0D9", fg: "#8A5A00" },
  "b-rosso": { bg: "#F8E1DE", fg: "#9B2C20" },
};
const CAUSE = { dimostrata: ["b-verde", "dimostrata"], probabile: ["b-arancio", "probabile"], ipotesi: ["b-rosso", "ipotesi"] };

export function Bollino({ tipo, children }) {
  const b = BOLLINI[tipo] || BOLLINI["b-arancio"];
  return <span style={{ display: "inline-block", background: b.bg, color: b.fg, borderRadius: 10, padding: "2px 9px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>;
}

export function Sezione({ titolo, sottotitolo, children }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 19, color: C.primary, margin: "0 0 4px", borderBottom: `2px solid ${C.border}`, paddingBottom: 6 }}>{titolo}</h2>
      {sottotitolo && <p style={{ margin: "6px 0 12px", color: C.muted, fontSize: 13.5 }}>{sottotitolo}</p>}
      {children}
    </section>
  );
}

export function Riquadri({ voci }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 12 }}>
      {voci.map((v, i) => (
        <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 12.5, color: C.muted }}>{v.etichetta}</div>
          <div style={{ fontSize: 24, fontWeight: 700, margin: "4px 0", color: C.text }}>{v.valore}</div>
          {v.nota && <div style={{ fontSize: 12.5, color: C.text, marginBottom: 6 }}>{v.nota}</div>}
          {v.bollino && <Bollino tipo={v.bollino[0]}>{v.bollino[1]}</Bollino>}
        </div>
      ))}
    </div>
  );
}

function Serie({ serie }) {
  if (!serie || !serie.length) return null;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
      {serie.map(([a, v], i) => (
        <span key={i} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 8px", fontSize: 12.5 }}>
          <b style={{ marginRight: 6 }}>{a}</b>{v}
        </span>
      ))}
    </span>
  );
}

export function Buoni({ voci }) {
  if (!voci.length) return <p style={{ color: C.muted }}>Nessun miglioramento evidente rispetto all'anno prima.</p>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 12 }}>
      {voci.map((x, i) => (
        <div key={i} style={{ background: "#F1F6F2", border: `1px solid #CFE0D3`, borderLeft: `4px solid ${C.green}`, borderRadius: 8, padding: "10px 14px" }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 15.5, color: "#2F5E3B" }}>{x.t}</h3>
          <Serie serie={x.serie} />
          <p style={{ margin: "8px 0 0", fontSize: 13.5 }}>{x.testo}</p>
        </div>
      ))}
    </div>
  );
}

function Riga({ titolo, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(90px, 140px) minmax(0, 1fr)", gap: 10, padding: "6px 0", borderTop: `1px dashed ${C.border}`, fontSize: 13.5 }}>
      <b style={{ color: C.muted }}>{titolo}</b><div style={{ minWidth: 0, overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

export function Critiche({ voci, grafico }) {
  if (!voci.length) return <p style={{ color: C.muted }}>Non risultano criticità con i dati di oggi.</p>;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {voci.map((x, i) => (
        <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `5px solid ${x.liv === "alta" ? C.red : C.yellow}`, borderRadius: 8, padding: "12px 16px", display: "grid", gridTemplateColumns: "34px 1fr", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: x.liv === "alta" ? C.red : C.yellow, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{i + 1}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.5, color: C.muted }}>{x.liv === "alta" ? "criticità alta" : "criticità media"} · {x.stato}</div>
            <h3 style={{ margin: "2px 0 8px", fontSize: 16.5 }}>{x.t}</h3>
            <Riga titolo="Andamento"><Serie serie={x.serie} />{x.etichetta && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{x.etichetta}</div>}</Riga>
            {x.grafico && grafico}
            <Riga titolo="Il dato">{x.dato}</Riga>
            <Riga titolo="Quanto costa">{x.costo}</Riga>
            {x.indagine && x.indagine.length > 0 && <Riga titolo="Indagine"><ul style={{ margin: 0, paddingLeft: 18 }}>{x.indagine.map((t, j) => <li key={j}>{t}</li>)}</ul></Riga>}
            <Riga titolo="Cause">
              <div style={{ display: "grid", gap: 5 }}>
                {x.cause.map(([t, v], j) => <div key={j} style={{ display: "flex", gap: 8, alignItems: "baseline" }}><Bollino tipo={CAUSE[t][0]}>{CAUSE[t][1]}</Bollino><span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{v}</span></div>)}
              </div>
            </Riga>
            <Riga titolo="Cosa fare"><ul style={{ margin: 0, paddingLeft: 18 }}>{x.fare.map((t, j) => <li key={j}>{t}</li>)}</ul></Riga>
            {x.vale && <Riga titolo="Quanto vale">{x.vale}</Riga>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Avvisi({ voci, vuoto }) {
  if (!voci.length) return <p style={{ color: C.muted }}>{vuoto}</p>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {voci.map((v, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13.5 }}>
          <Bollino tipo={v[0]}>{v[1]}</Bollino><span>{v[2]}</span>
        </div>
      ))}
    </div>
  );
}

export function Segnali({ voci }) {
  return <Avvisi voci={voci.map(s => ["b-arancio", "▲ segnale", `${s.t}. ${s.testo}`])} vuoto="Nessuna area è peggiorata più della soglia rispetto all'anno prima." />;
}

// Barre orizzontali ordinate, con percentuale e cumulata: le barre piene arrivano insieme all'80% del costo
export function BarreOrdinate({ righe, titolo, unita = "€" }) {
  const tot = righe.reduce((s, r) => s + r.v, 0);
  if (!righe.length || !(tot > 0)) return null;
  const max = righe[0].v, W = 880, lab = 300, barW = 340, h = 30, top = 26, H = top + righe.length * h + 10;
  let cum = 0;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 560, fontSize: 13, fontFamily: "inherit" }} role="img" aria-label={titolo}>
        <text x={lab} y={14} fill={C.muted}>{titolo}</text>
        <text x={lab + barW + 175} y={14} fill={C.muted} textAnchor="end">percentuale</text>
        <text x={W - 4} y={14} fill={C.muted} textAnchor="end">cumulata</text>
        {righe.map((r, i) => {
          const prima = cum; cum += r.v;
          const yy = top + i * h, w = Math.max(2, r.v / max * barW), forte = prima / tot * 100 < 80;
          return (
            <g key={r.a}>
              <text x={lab - 10} y={yy + 19} textAnchor="end" fontWeight={forte ? 700 : 400} fill={forte ? C.text : C.muted}>{r.a}</text>
              <rect x={lab} y={yy + 6} width={w} height={18} rx={3} fill={r.colore} opacity={forte ? 1 : 0.45}><title>{`${r.a}: ${it(r.v)} ${unita}, ${it(r.v / tot * 100, 1)}%`}</title></rect>
              <text x={lab + w + 6} y={yy + 19} fill={C.text}>{it(r.v)} {unita}</text>
              <text x={lab + barW + 175} y={yy + 19} textAnchor="end" fill={C.text}>{it(r.v / tot * 100, 1)}%</text>
              <text x={W - 4} y={yy + 19} textAnchor="end" fill={C.muted}>{it(cum / tot * 100, 1)}%</text>
            </g>
          );
        })}
      </svg>
      <div style={{ fontSize: 12, color: C.muted }}>Le barre a colore pieno sono quelle che insieme arrivano all'80% del totale.</div>
    </div>
  );
}

// Cascata: da un valore di partenza a uno di arrivo, passo per passo (rosso sale, verde scende)
export function Cascata({ partenza, arrivo, passi, unita = "€", dec = 2, titolo }) {
  const W = 860, lab = 290, area = 470, h = 30, top = 10;
  const H = top + (passi.length + 2) * h + 10;
  let cur = partenza.v; const punti = [0, partenza.v, arrivo.v];
  passi.forEach(p => { cur += p.v; punti.push(cur); });
  const min = Math.min(...punti), max = Math.max(...punti) * 1.02 || 1;
  const X = v => lab + (v - min) / (max - min) * area;
  const righe = []; cur = partenza.v;
  righe.push({ n: partenza.n, da: 0, a: partenza.v, col: C.muted, t: `${it(partenza.v, dec)} ${unita}`, forte: true });
  passi.forEach(p => { righe.push({ n: p.n, da: cur, a: cur + p.v, col: p.v > 0 ? SALE : SCENDE, t: `${p.v > 0 ? "▲ +" : "▼ -"}${it(Math.abs(p.v), dec)} ${unita}` }); cur += p.v; });
  righe.push({ n: arrivo.n, da: 0, a: arrivo.v, col: C.muted, t: `${it(arrivo.v, dec)} ${unita}`, forte: true });
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 560, fontSize: 13, fontFamily: "inherit" }} role="img" aria-label={titolo}>
        <line x1={X(0)} x2={X(0)} y1={top} y2={H - 6} stroke={C.border} />
        {righe.map((r, i) => {
          const yy = top + i * h, x1 = X(Math.min(r.da, r.a)), x2 = X(Math.max(r.da, r.a));
          return (
            <g key={i}>
              <text x={lab - 10} y={yy + 19} textAnchor="end" fontWeight={r.forte ? 700 : 400} fill={C.text}>{r.n}</text>
              <rect x={x1} y={yy + 6} width={Math.max(2, x2 - x1)} height={18} rx={2} fill={r.col}><title>{`${r.n}: ${r.t}`}</title></rect>
              <text x={x2 + 6} y={yy + 19} fontWeight={r.forte ? 700 : 400} fill={C.text}>{r.t}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ fontSize: 12, color: C.muted }}><span style={{ color: SALE }}>▲ rosso: il costo sale</span> · <span style={{ color: SCENDE }}>▼ verde: il costo scende</span></div>
    </div>
  );
}

export const stileTabella = {
  tabella: { width: "100%", borderCollapse: "collapse", fontSize: 13, background: C.card },
  th: { textAlign: "right", padding: "6px 8px", borderBottom: `2px solid ${C.border}`, color: C.muted, fontWeight: 700, whiteSpace: "nowrap" },
  thSx: { textAlign: "left", padding: "6px 8px", borderBottom: `2px solid ${C.border}`, color: C.muted, fontWeight: 700 },
  td: { textAlign: "right", padding: "5px 8px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" },
  tdSx: { textAlign: "left", padding: "5px 8px", borderBottom: `1px solid ${C.border}` },
};

export function Intestazione({ titolo, sottotitolo, selettore, aggiorna, calcolatoIl, caricando }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between", marginBottom: 6 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, color: C.primary }}>{titolo}</h1>
        <div style={{ color: C.muted, fontSize: 13.5, marginTop: 4 }}>{sottotitolo}</div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {selettore}
        <button onClick={aggiorna} disabled={caricando} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 13.5 }}>
          {caricando ? "Calcolo in corso…" : "Ricalcola con i dati di adesso"}
        </button>
        {calcolatoIl && <span style={{ fontSize: 12, color: C.muted }}>Calcolato il {calcolatoIl}</span>}
      </div>
    </div>
  );
}

