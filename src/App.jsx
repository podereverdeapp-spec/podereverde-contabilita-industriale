import { useState } from "react";
import Dashboard from "./Dashboard";
import Fornitori from "./Fornitori";
import Clienti from "./Clienti";
import FatturePassive from "./FatturePassive";
import FattureAttive from "./FattureAttive";
import NuovaFatturaAttiva from "./NuovaFatturaAttiva";
import CaricaFatture from "./CaricaFatture";
import CaricaFattureAttive from "./CaricaFattureAttive";
import Cespiti from "./Cespiti";
import ReportUba from "./ReportUba";
import ReportCosti from "./ReportCosti";
import SchedaAnimale from "./SchedaAnimale";
import ReportRiproduttori from "./ReportRiproduttori";
import ReportPerArea from "./ReportPerArea";
import ReportPerAreaCentro from "./ReportPerAreaCentro";
import Parametri from "./Parametri";
import ReportAcquistoAnimali from "./ReportAcquistoAnimali";
import { C, FONT } from "./style";

const TAB = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "carica", label: "Carica Fatture", icon: "📥" },
  { id: "passive", label: "Fatture Passive", icon: "📄" },
  { id: "attive", label: "Fatture Attive", icon: "💰" },
  { id: "fornitori", label: "Fornitori", icon: "🏢" },
  { id: "clienti", label: "Clienti", icon: "🤝" },
  { id: "acquisto", label: "Report Acquisto Animali", icon: "🐄" },
  { id: "cespiti", label: "Cespiti", icon: "🏗️" },
  { id: "uba", label: "Report UBA", icon: "🐮" },
  { id: "costi", label: "Report Costi", icon: "📊" },
  { id: "scheda", label: "Scheda Animale", icon: "🔍" },
  { id: "riproduttori", label: "Report Riproduttori", icon: "🐄" },
  { id: "perarea", label: "Report per Area", icon: "📋" },
  { id: "perareacentro", label: "Report per Area e Centro", icon: "📋" },
  { id: "parametri", label: "Parametri", icon: "⚙️" },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [vistaAttive, setVistaAttive] = useState("elenco"); // "elenco" | "nuova"
  const [ricercaSchedaAnimale, setRicercaSchedaAnimale] = useState(null);

  function vaiAllaSchedaAnimale(termine) {
    setRicercaSchedaAnimale(termine);
    setTab("scheda");
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT }}>
      <header style={{ background: C.primary, padding: "16px 20px", color: "#fff" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Contabilità Industriale</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Podere Verde</div>
          </div>
          <nav style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TAB.map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); if (t.id === "attive") setVistaAttive("elenco"); }}
                style={{
                  background: tab === t.id ? "rgba(255,255,255,0.2)" : "transparent",
                  color: "#fff", border: "none", borderRadius: 8,
                  padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main>
        {tab === "dashboard" && <Dashboard onNavigate={setTab} />}
        {tab === "carica" && <CaricaFatture />}
        {tab === "passive" && <FatturePassive />}
        {tab === "attive" && (
          <>
            <div style={{ maxWidth: 1200, margin: "16px auto 0", padding: "0 20px", display: "flex", gap: 8 }}>
              <button onClick={() => setVistaAttive("elenco")}
                style={{ background: vistaAttive === "elenco" ? C.primary : "transparent", color: vistaAttive === "elenco" ? "#fff" : C.muted, border: `1.5px solid ${vistaAttive === "elenco" ? C.primary : C.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                📋 Elenco
              </button>
              <button onClick={() => setVistaAttive("nuova")}
                style={{ background: vistaAttive === "nuova" ? C.primary : "transparent", color: vistaAttive === "nuova" ? "#fff" : C.muted, border: `1.5px solid ${vistaAttive === "nuova" ? C.primary : C.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                + Nuova Fattura
              </button>
              <button onClick={() => setVistaAttive("carica")}
                style={{ background: vistaAttive === "carica" ? C.primary : "transparent", color: vistaAttive === "carica" ? "#fff" : C.muted, border: `1.5px solid ${vistaAttive === "carica" ? C.primary : C.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                📥 Carica Massivo
              </button>
            </div>
            {vistaAttive === "elenco" && <FattureAttive />}
            {vistaAttive === "nuova" && <NuovaFatturaAttiva onSalvata={() => setVistaAttive("elenco")} />}
            {vistaAttive === "carica" && <CaricaFattureAttive />}
          </>
        )}
        {tab === "fornitori" && <Fornitori />}
        {tab === "clienti" && <Clienti />}
        {tab === "acquisto" && <ReportAcquistoAnimali />}
        {tab === "cespiti" && <Cespiti />}
        {tab === "uba" && <ReportUba onVediScheda={vaiAllaSchedaAnimale} />}
        {tab === "costi" && <ReportCosti />}
        {tab === "scheda" && <SchedaAnimale ricercaIniziale={ricercaSchedaAnimale} onRicercaConsumata={() => setRicercaSchedaAnimale(null)} />}
        {tab === "riproduttori" && <ReportRiproduttori />}
        {tab === "perarea" && <ReportPerArea />}
        {tab === "perareacentro" && <ReportPerAreaCentro />}
        {tab === "parametri" && <Parametri />}
      </main>
    </div>
  );
}
