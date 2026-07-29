import { C, FONT } from "./style";
import { formattaNumero } from "./parsingUtils";

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

// Grafico a barre in SVG puro (nessuna libreria esterna) — stesso stile di
// GraficoAndamento (colori, font, riga tratteggiata della media), ma a colonne
// invece che a linea — pensato per confrontare l'anno di consultazione con i 3
// precedenti, per una singola Area/Centro di Costo dentro Report Costi Storico.
// punti: [{ anno, valore }] — non serve altro, l'estrazione del campo la fa il chiamante.
export default function GraficoBarre({ punti: puntiInput, decimaliValore = 3 }) {
  const punti = puntiInput.slice().sort((a, b) => a.anno - b.anno); // dal più vecchio al più recente
  if (punti.length < 2) return <div style={{ padding: 12, color: C.muted, fontSize: 12 }}>Servono almeno 2 anni per il confronto.</div>;

  const media = round2(punti.reduce((s, p) => s + p.valore, 0) / punti.length);
  const W = 360, H = 190, PAD_X = 28, PAD_TOP = 44, PAD_BOTTOM = 30;
  const valori = punti.map(p => p.valore);
  const max = Math.max(...valori, media, 0);
  const min = Math.min(...valori, media, 0);
  const range = (max - min) || Math.max(Math.abs(max), 1) * 0.2 || 1;
  const margine = range * 0.15;
  const minY = min - (min < 0 ? margine : 0), maxY = max + margine, rangeY = (maxY - minY) || 1;

  const yZero = H - PAD_BOTTOM - ((0 - minY) / rangeY) * (H - PAD_TOP - PAD_BOTTOM);
  const y = v => H - PAD_BOTTOM - ((v - minY) / rangeY) * (H - PAD_TOP - PAD_BOTTOM);
  const yMedia = y(media);

  const larghezzaBanda = (W - 2 * PAD_X) / punti.length;
  const larghezzaBarra = larghezzaBanda * 0.5;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: "auto", fontFamily: FONT }}>
      <line x1={PAD_X} y1={yMedia} x2={W - PAD_X} y2={yMedia} stroke={C.accent} strokeDasharray="3 4" strokeWidth="1.2" />
      <text x={PAD_X} y={16} fontSize="10.5" fontWeight="600" fill={C.accent}>media {formattaNumero(media, decimaliValore)}</text>

      {punti.map((p, i) => {
        const xCentro = PAD_X + larghezzaBanda * (i + 0.5);
        const xBarra = xCentro - larghezzaBarra / 2;
        const yBarra = Math.min(y(p.valore), yZero);
        const altezzaBarra = Math.abs(y(p.valore) - yZero) || 1;
        const ultimoAnno = i === punti.length - 1;
        return (
          <g key={i}>
            <rect x={xBarra} y={yBarra} width={larghezzaBarra} height={altezzaBarra}
              fill={ultimoAnno ? C.primary : C.primaryLight} rx="2" />
            <text x={xCentro} y={y(p.valore) - 8} fontSize="10.5" fontWeight="700" fill={C.text} textAnchor="middle">
              {formattaNumero(p.valore, decimaliValore)}
            </text>
            <text x={xCentro} y={H - PAD_BOTTOM + 18} fontSize="10.5" fill={C.muted} textAnchor="middle">{p.anno}</text>
          </g>
        );
      })}
    </svg>
  );
}
