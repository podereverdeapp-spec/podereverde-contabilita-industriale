import { C } from "./style";
import { formattaEuro, formattaNumero } from "./parsingUtils";

// Grafico a dispersione: età alla macellazione/vendita (mesi) vs costo cumulato al kg di
// carcassa — SVG puro, stesso stile degli altri grafici dell'app (nessuna libreria esterna).
// Evidenzia in verde gli animali "migliori" (dentro la finestra di età con il costo/kg più
// basso — l'area del grafico dove conviene macellare/vendere).
export default function GraficoDispersioneCostoKg({ punti, etaMinOttimale, etaMaxOttimale, costoMaxOttimale }) {
  if (!punti || punti.length < 2) return <div style={{ padding: 12, color: C.muted, fontSize: 12 }}>Servono almeno 2 animali usciti con peso noto.</div>;

  const W = 720, H = 420, PAD_X = 60, PAD_TOP = 20, PAD_BOTTOM = 50;
  const etaValori = punti.map(p => p.etaMesi);
  const costoValori = punti.map(p => p.costoKg);
  const etaMax = Math.max(...etaValori) * 1.05;
  const costoMax = Math.max(...costoValori) * 1.08;

  const x = v => PAD_X + (v / etaMax) * (W - PAD_X - 20);
  const y = v => H - PAD_BOTTOM - (v / costoMax) * (H - PAD_TOP - PAD_BOTTOM);

  const rettX1 = x(etaMinOttimale), rettX2 = x(etaMaxOttimale);
  const rettY1 = y(costoMaxOttimale), rettY2 = y(0);

  // Griglia orizzontale: 5 linee guida sul costo/kg
  const gridLinee = [0.2, 0.4, 0.6, 0.8, 1].map(f => costoMax * f);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", fontFamily: "inherit" }}>
      {gridLinee.map((v, i) => (
        <g key={i}>
          <line x1={PAD_X} x2={W - 20} y1={y(v)} y2={y(v)} stroke={C.border} strokeWidth="1" />
          <text x={PAD_X - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill={C.muted}>{formattaNumero(v, 0)}</text>
        </g>
      ))}
      <line x1={PAD_X} x2={W - 20} y1={H - PAD_BOTTOM} y2={H - PAD_BOTTOM} stroke={C.border} strokeWidth="1.5" />
      <line x1={PAD_X} x2={PAD_X} y1={PAD_TOP} y2={H - PAD_BOTTOM} stroke={C.border} strokeWidth="1.5" />

      {/* Area macellazione bovini — la finestra di età col costo/kg migliore */}
      <rect x={rettX1} y={rettY1} width={rettX2 - rettX1} height={rettY2 - rettY1}
        fill={C.green} fillOpacity="0.08" stroke={C.green} strokeWidth="1.5" strokeDasharray="5,3" rx="4" />
      <text x={(rettX1 + rettX2) / 2} y={rettY1 - 8} textAnchor="middle" fontSize="12" fontWeight="700" fill={C.green}>
        Area macellazione bovini
      </text>

      {punti.map((p, i) => {
        const dentro = p.etaMesi >= etaMinOttimale && p.etaMesi <= etaMaxOttimale && p.costoKg <= costoMaxOttimale;
        return (
          <circle key={i} cx={x(p.etaMesi)} cy={y(p.costoKg)} r={dentro ? 5 : 4}
            fill={dentro ? C.green : C.primaryLight} fillOpacity={dentro ? 1 : 0.6}
            stroke={dentro ? "#fff" : "none"} strokeWidth="1">
            <title>{`${p.bdn}: ${formattaNumero(p.etaMesi, 1)} mesi, ${formattaEuro(p.costoKg, 2)}/kg`}</title>
          </circle>
        );
      })}

      <text x={(PAD_X + W - 20) / 2} y={H - 10} textAnchor="middle" fontSize="12" fill={C.muted}>
        Età alla macellazione/vendita (mesi)
      </text>
      <text x={16} y={(PAD_TOP + H - PAD_BOTTOM) / 2} textAnchor="middle" fontSize="12" fill={C.muted}
        transform={`rotate(-90, 16, ${(PAD_TOP + H - PAD_BOTTOM) / 2})`}>
        Costo cumulato al kg (€)
      </text>
    </svg>
  );
}
