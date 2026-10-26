import { useState, useEffect } from "react";
import { statoCalcoli } from "./statoCalcoli";
import { C } from "./style";
import ReportCosti from "./ReportCosti";
import ReportStorico from "./ReportStorico";

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
            <td style={{ padding: "4px 10px 2px", color: C.muted }}>{stato.riproduttori.motivi?.length ? `motivo: ${stato.riproduttori.motivi.join(", ")}` : ""}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Versione 308 (decisione del Dott. Bizzarri del 26/10/2026, ore 19:04): due sole linguette. «Anno» unisce le vecchie
// pagine Aggregato, Per Area e Per Area e Centro di Costo; «Storico» unisce le quattro pagine storiche, con la scelta della specie.
const STORICI = [
  { id: null, label: "Tutte le specie", titolo: "tutte le specie" },
  { id: "bovino", label: "Bovini", titolo: "Bovini" },
  { id: "suino", label: "Suini", titolo: "Suini (suini+lotti)" },
  { id: "ovino", label: "Ovini", titolo: "Ovini" },
];

export default function SezioneReportCosti() {
  const [vista, setVista] = useState("anno");
  const [specieStorico, setSpecieStorico] = useState(null);
  const [anno, setAnno] = useState(new Date().getFullYear());
  const anni = []; for (let a = new Date().getFullYear(); a >= 2019; a--) anni.push(a);
  const linguetta = attiva => ({
    background: attiva ? C.primary : "transparent", color: attiva ? "#fff" : C.muted,
    border: `1.5px solid ${attiva ? C.primary : C.border}`, borderRadius: "8px 8px 0 0", padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
  });
  const storico = STORICI.find(s => s.id === specieStorico);

  return (
    <div>
      <div style={{ padding: "20px 20px 0 20px", maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Report Costi</h1>
        <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
          Quanto è costato l'allevamento in un anno, specie per specie, di cosa è fatto il costo e quanto valgono gli animali in stalla; nello Storico, il confronto con gli anni prima.
        </p>
        <StatoCalcoli />
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <button onClick={() => setVista("anno")} style={linguetta(vista === "anno")}>Anno</button>
          <button onClick={() => setVista("storico")} style={linguetta(vista === "storico")}>Storico</button>
          <div style={{ marginLeft: "auto", paddingBottom: 6, display: "flex", gap: 6, alignItems: "center" }}>
            {vista === "anno" ? (
              <>
                <span style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>Anno</span>
                <select value={anno} onChange={e => setAnno(parseInt(e.target.value))} style={{ padding: "6px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
                  {anni.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </>
            ) : STORICI.map(s => (
              <button key={String(s.id)} onClick={() => setSpecieStorico(s.id)} style={{ fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 6, cursor: "pointer", border: `1.5px solid ${C.primary}`, background: specieStorico === s.id ? C.primary : "#fff", color: specieStorico === s.id ? "#fff" : C.primary }}>{s.label}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ background: "#F4F7FB", borderTop: `3px solid ${C.primary}`, paddingBottom: 20 }}>
        {vista === "anno" && <ReportCosti anno={anno} />}
        {vista === "storico" && <ReportStorico key={String(specieStorico)} specieFiltro={specieStorico} titolo={storico.titolo} />}
      </div>
    </div>
  );
}
