import { useState, useEffect } from "react";
import { statoCalcoli } from "./statoCalcoli";
import { C } from "./style";
import ReportCosti from "./ReportCosti";
import ReportPerArea from "./ReportPerArea";
import ReportPerAreaCentro from "./ReportPerAreaCentro";
import ReportStorico from "./ReportStorico";

// Un tocco di sfondo diverso per ciascun livello di dettaglio, per non confondersi
// passando dall'uno all'altro — dal più aggregato (aziendale) al più dettagliato (centro di costo)
const LIVELLI = [
  { id: "aggregato", label: "Aggregato (aziendale)", sfondo: "#F4F7FB", accento: C.blue },
  { id: "area", label: "Per Area", sfondo: "#F3FAF3", accento: C.green },
  { id: "areacentro", label: "Per Area e Centro di Costo", sfondo: "#FFF8ED", accento: C.accent },
  { id: "storico_generale", label: "Storico — Generale", sfondo: "#F4F7FB", accento: C.blue },
  { id: "storico_bovini", label: "Storico — Bovini", sfondo: "#F7F1EC", accento: C.bovini },
  { id: "storico_suini", label: "Storico — Suini", sfondo: "#FBF0F2", accento: C.suini },
  { id: "storico_ovini", label: "Storico — Ovini", sfondo: "#F1F6EC", accento: C.ovini },
];

// Versione 236: stato dei calcoli salvati, anno per anno (aggiornato / da ricalcolare / non verificabile)
function StatoCalcoli() {
  const [stato, setStato] = useState(null);
  const [errore, setErrore] = useState("");
  useEffect(() => { statoCalcoli().then(setStato).catch(e => setErrore(e.message)); }, []);
  if (errore) return <div style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>Stato dei calcoli non disponibile: {errore}</div>;
  if (!stato) return null;
  const quando = t => t ? new Date(t).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "mai";
  const colore = { aggiornato: C.green, da_rifare: "#B86E00", sconosciuto: C.muted };
  const testo = { aggiornato: "✓ aggiornato", da_rifare: "🔄 da ricalcolare", sconosciuto: "da ricalcolare una volta (calcolo precedente al registro delle modifiche)" };
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12.5 }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>Stato dei calcoli salvati</div>
      <table style={{ width: "auto" }}>
        <tbody>
          {stato.anni.map(a => (
            <tr key={a.anno}>
              <td style={{ padding: "2px 10px 2px 0", fontWeight: 700 }}>{a.anno}</td>
              <td style={{ padding: "2px 10px", color: C.muted }}>salvato il {quando(a.salvatoAt)}</td>
              <td style={{ padding: "2px 10px", color: colore[a.stato], fontWeight: 700 }}>{testo[a.stato]}</td>
              <td style={{ padding: "2px 10px", color: C.muted }}>{a.dettaglio.length ? `modificati dopo: ${a.dettaglio.join(", ")}` : ""}</td>
            </tr>))}
          <tr>
            <td style={{ padding: "4px 10px 2px 0", fontWeight: 700 }}>Riproduttori</td>
            <td style={{ padding: "4px 10px 2px", color: C.muted }}>elaborato il {quando(stato.riproduttori.elaboratoAt)}</td>
            <td style={{ padding: "4px 10px 2px", color: stato.riproduttori.daRifare ? "#B86E00" : C.green, fontWeight: 700 }}>
              {stato.riproduttori.daRifare ? "🔄 da rifare (pagina «Report Riproduttori», dopo aver salvato gli anni)" : "✓ aggiornato"}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

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
        <StatoCalcoli />

        {!livello.startsWith("storico_") && (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Anno (condiviso tra Aggregato/Area/Area e Centro)</label>
              <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
                style={{ padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, width: 100 }} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
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
        {livello === "storico_generale" && <ReportStorico specieFiltro={null} titolo="tutte le specie" />}
        {livello === "storico_bovini" && <ReportStorico specieFiltro="bovino" titolo="Bovini" />}
        {livello === "storico_suini" && <ReportStorico specieFiltro="suino" titolo="Suini (suini+lotti)" />}
        {livello === "storico_ovini" && <ReportStorico specieFiltro="ovino" titolo="Ovini" />}
      </div>
    </div>
  );
}
