import { C, FONT } from "./style";
import { formattaNumero } from "./parsingUtils";

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

// Grafico lineare in SVG puro (nessuna libreria esterna) — area sfumata sotto la curva,
// etichette valore sui punti, linea tratteggiata per la media (in un angolo fisso, per
// non sovrapporsi mai alle etichette dei punti). Riusato da Storico Mangimi e Storico Costi.
// punti: [{ anno, valore }] — non serve altro, l'estrazione del campo la fa il chiamante.
export default function GraficoAndamento({ punti: puntiInput, decimaliValore = 3 }) {
  const punti = puntiInput.slice().sort((a, b) => a.anno - b.anno); // dal più vecchio al più recente
  if (punti.length < 2) return <div style={{ padding: 12, color: C.muted, fontSize: 12 }}>Servono almeno 2 anni per tracciare un andamento.</div>;

  const media = round2(punti.reduce((s, p) => s + p.valore, 0) / punti.length);
  const W = 360, H = 190, PAD_X = 34, PAD_TOP = 44, PAD_BOTTOM = 30;
  const valori = punti.map(p => p.valore);
  const min = Math.min(...valori, media), max = Math.max(...valori, media);
  const range = (max - min) || Math.max(Math.abs(max), 1) * 0.2 || 1;
  const margine = range * 0.15; // un po' d'aria sopra e sotto, non attaccato ai bordi
  const minY = min - margine, maxY = max + margine, rangeY = maxY - minY || 1;

  const x = i => PAD_X + (i / (punti.length - 1)) * (W - 2 * PAD_X);
  const y = v => H - PAD_BOTTOM - ((v - minY) / rangeY) * (H - PAD_TOP - PAD_BOTTOM);

  const linea = punti.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.valore).toFixed(1)}`).join(" ");
  const area = `${linea} L ${x(punti.length - 1).toFixed(1)} ${(H - PAD_BOTTOM)} L ${x(0).toFixed(1)} ${(H - PAD_BOTTOM)} Z`;
  const yMedia = y(media);
  const idGradiente = `areaGrad-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: "auto", fontFamily: FONT }}>
      <defs>
        <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.primary} stopOpacity="0.22" />
          <stop offset="100%" stopColor={C.primary} stopOpacity="0" />
        </linearGradient>
      </defs>

      <line x1={PAD_X} y1={yMedia} x2={W - PAD_X} y2={yMedia} stroke={C.accent} strokeDasharray="3 4" strokeWidth="1.2" />
      <text x={PAD_X} y={16} fontSize="10.5" fontWeight="600" fill={C.accent}>media {formattaNumero(media, decimaliValore)}</text>

      <path d={area} fill={`url(#${idGradiente})`} stroke="none" />
      <path d={linea} fill="none" stroke={C.primary} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />

      {punti.map((p, i) => (
        <g key={i}>
          <text x={x(i)} y={y(p.valore) - 11} fontSize="10.5" fontWeight="700" fill={C.text} textAnchor="middle">{formattaNumero(p.valore, decimaliValore)}</text>
          <circle cx={x(i)} cy={y(p.valore)} r="3.5" fill="#fff" stroke={C.primary} strokeWidth="2" />
          <text x={x(i)} y={H - PAD_BOTTOM + 18} fontSize="10.5" fill={C.muted} textAnchor="middle">{p.anno}</text>
        </g>
      ))}
    </svg>
  );
}
