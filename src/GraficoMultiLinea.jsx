import { C, FONT } from "./style";
import { formattaNumero } from "./parsingUtils";

// Grafico lineare multi-serie in SVG puro. serie: [{ nome, colore, punti: [{anno, valore}] }].
// Tutte le serie devono avere gli stessi anni (non verificato, ma assunto per l'asse X condiviso).
// mostraVariazione: se true, etichetta ogni segmento della PRIMA serie con la variazione %
// rispetto al punto precedente (blu se diminuisce, rosso se aumenta) — pensato per una
// singola serie "principale" (es. il Totale), per non affollare il grafico con troppe etichette.
export default function GraficoMultiLinea({ serie, decimaliValore = 0, mostraVariazione = false }) {
  const tuttiGliAnni = [...new Set(serie.flatMap(s => s.punti.map(p => p.anno)))].sort((a, b) => a - b);
  if (tuttiGliAnni.length < 2) return <div style={{ padding: 12, color: C.muted, fontSize: 12 }}>Servono almeno 2 anni per tracciare un andamento.</div>;

  const W = 620, H = 260, PAD_X = 50, PAD_TOP = 30, PAD_BOTTOM = 34;
  const tuttiIValori = serie.flatMap(s => s.punti.map(p => p.valore));
  const min = Math.min(...tuttiIValori, 0), max = Math.max(...tuttiIValori);
  const range = (max - min) || Math.max(Math.abs(max), 1) * 0.2 || 1;
  const margine = range * 0.15;
  const minY = min - margine, maxY = max + margine, rangeY = maxY - minY || 1;

  const x = anno => PAD_X + (tuttiGliAnni.indexOf(anno) / (tuttiGliAnni.length - 1)) * (W - 2 * PAD_X);
  const y = v => H - PAD_BOTTOM - ((v - minY) / rangeY) * (H - PAD_TOP - PAD_BOTTOM);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: "auto", fontFamily: FONT }}>
      {tuttiGliAnni.map(anno => (
        <text key={anno} x={x(anno)} y={H - PAD_BOTTOM + 18} fontSize="11" fill={C.muted} textAnchor="middle">{anno}</text>
      ))}

      {serie.map((s, si) => {
        const puntiOrdinati = s.punti.slice().sort((a, b) => a.anno - b.anno);
        const linea = puntiOrdinati.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.anno).toFixed(1)} ${y(p.valore).toFixed(1)}`).join(" ");
        return (
          <g key={si}>
            <path d={linea} fill="none" stroke={s.colore} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
            {puntiOrdinati.map((p, i) => (
              <circle key={i} cx={x(p.anno)} cy={y(p.valore)} r="3.5" fill="#fff" stroke={s.colore} strokeWidth="2" />
            ))}
            {mostraVariazione && si === 0 && puntiOrdinati.slice(1).map((p, i) => {
              const precedente = puntiOrdinati[i];
              const variazionePct = precedente.valore !== 0 ? ((p.valore - precedente.valore) / precedente.valore) * 100 : 0;
              const xm = (x(precedente.anno) + x(p.anno)) / 2, ym = (y(precedente.valore) + y(p.valore)) / 2;
              const colore = variazionePct < 0 ? C.blue : variazionePct > 0 ? C.red : C.muted;
              return (
                <g key={"var" + i}>
                  <rect x={xm - 22} y={ym - 22} width={44} height={15} fill="#fff" opacity="0.85" />
                  <text x={xm} y={ym - 11} fontSize="10.5" fontWeight="700" fill={colore} textAnchor="middle">
                    {variazionePct > 0 ? "+" : ""}{variazionePct.toFixed(1)}%
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Legenda in alto */}
      {serie.map((s, si) => (
        <g key={"leg" + si} transform={`translate(${PAD_X + si * 130}, 12)`}>
          <rect width="10" height="10" fill={s.colore} rx="2" />
          <text x="14" y="9" fontSize="10.5" fill={C.text}>{s.nome}</text>
        </g>
      ))}
    </svg>
  );
}
