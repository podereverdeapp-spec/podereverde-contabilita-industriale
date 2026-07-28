import { useState } from "react";
import { C } from "./style";

export default function RazioniSuiniConsumi() {
  const [anno, setAnno] = useState(new Date().getFullYear());

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Razioni → Suini → Consumi</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Per l'anno scelto: consumo teorico (razioni × suini/lotti realmente presenti in azienda quell'anno) confrontato con quanto realmente acquistato e speso.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <label style={{ fontSize: 13, color: C.muted }}>Anno:</label>
        <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
          style={{ width: 100, padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
          📋 Pagina non ancora costruita — è il prossimo passo: assegnare la razione giusta giorno per giorno a ogni suino/lotto presente in azienda durante l'anno (in base a fascia d'età, qualifica riproduttiva, ed eventuali date di parto per le riproduttrici), sommare il consumo teorico complessivo, e confrontarlo con il Report Quantità Mangimi reale per la stessa specie/anno.
        </p>
      </div>
    </div>
  );
}
