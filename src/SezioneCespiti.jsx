import { useState } from "react";
import { C } from "./style";
import Cespiti from "./Cespiti";
import ReportCespiti from "./ReportCespiti";

const VISTE = [
  { id: "gestione", label: "Gestione", sfondo: "#F4F7FB", accento: C.blue },
  { id: "report", label: "Report", sfondo: "#F3FAF3", accento: C.green },
];

export default function SezioneCespiti() {
  const [vista, setVista] = useState("gestione");
  const meta = VISTE.find(v => v.id === vista);

  return (
    <div>
      <div style={{ padding: "20px 20px 0 20px", maxWidth: 1300, margin: "0 auto" }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Cespiti</h1>
        <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
          Gestisci i singoli cespiti (elenco, modifica, quote di ammortamento) o consulta il report riepilogativo.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          {VISTE.map(v => (
            <button key={v.id} onClick={() => setVista(v.id)}
              style={{
                background: vista === v.id ? v.accento : "transparent",
                color: vista === v.id ? "#fff" : C.muted,
                border: `1.5px solid ${vista === v.id ? v.accento : C.border}`,
                borderRadius: "8px 8px 0 0", padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: meta.sfondo, borderTop: `3px solid ${meta.accento}`, paddingBottom: 20 }}>
        {vista === "gestione" && <Cespiti />}
        {vista === "report" && <ReportCespiti />}
      </div>
    </div>
  );
}
