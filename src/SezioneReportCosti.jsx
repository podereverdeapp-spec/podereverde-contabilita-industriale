import { useState } from "react";
import { C } from "./style";
import ReportCosti from "./ReportCosti";
import ReportPerArea from "./ReportPerArea";
import ReportPerAreaCentro from "./ReportPerAreaCentro";

// Un tocco di sfondo diverso per ciascun livello di dettaglio, per non confondersi
// passando dall'uno all'altro — dal più aggregato (aziendale) al più dettagliato (centro di costo)
const LIVELLI = [
  { id: "aggregato", label: "Aggregato (aziendale)", sfondo: "#F4F7FB", accento: C.blue },
  { id: "area", label: "Per Area", sfondo: "#F3FAF3", accento: C.green },
  { id: "areacentro", label: "Per Area e Centro di Costo", sfondo: "#FFF8ED", accento: C.accent },
];

export default function SezioneReportCosti() {
  const [livello, setLivello] = useState("aggregato");
  const [anno, setAnno] = useState(new Date().getFullYear());

  const correnteMeta = LIVELLI.find(l => l.id === livello);

  return (
    <div>
      <div style={{ padding: "20px 20px 0 20px", maxWidth: 1300, margin: "0 auto" }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Report Costi</h1>
        <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
          Dal costo aggregato aziendale, alle singole Aree, fino al dettaglio per Centro di Costo — stesso motore di calcolo, tre livelli di dettaglio.
        </p>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Anno (condiviso tra i tre livelli)</label>
            <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
              style={{ padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, width: 100 }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          {LIVELLI.map(l => (
            <button key={l.id} onClick={() => setLivello(l.id)}
              style={{
                background: livello === l.id ? l.accento : "transparent",
                color: livello === l.id ? "#fff" : C.muted,
                border: `1.5px solid ${livello === l.id ? l.accento : C.border}`,
                borderRadius: "8px 8px 0 0", padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: correnteMeta.sfondo, borderTop: `3px solid ${correnteMeta.accento}`, paddingBottom: 20 }}>
        {livello === "aggregato" && <ReportCosti anno={anno} />}
        {livello === "area" && <ReportPerArea anno={anno} />}
        {livello === "areacentro" && <ReportPerAreaCentro anno={anno} />}
      </div>
    </div>
  );
}
