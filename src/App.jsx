import { useState } from "react";
import Dashboard from "./Dashboard";
import Fornitori from "./Fornitori";
import Clienti from "./Clienti";
import FatturePassive from "./FatturePassive";
import FattureAttive from "./FattureAttive";
import NuovaFatturaAttiva from "./NuovaFatturaAttiva";
import CaricaFatture from "./CaricaFatture";
import CaricaFattureAttive from "./CaricaFattureAttive";
import SezioneCespiti from "./SezioneCespiti";
import ReportUba from "./ReportUba";
import SezioneReportCosti from "./SezioneReportCosti";
import SchedaAnimale from "./SchedaAnimale";
import ReportRiproduttori from "./ReportRiproduttori";
import ArticoliPrezzi from "./ArticoliPrezzi";
import CostiDiretti from "./CostiDiretti";
import ControlloAnomalie from "./ControlloAnomalie";
import DaArmonizzare from "./DaArmonizzare";
import ReportQuantitaMangimi from "./ReportQuantitaMangimi";
import PerformanceEta from "./PerformanceEta";
import PerformanceEtaMaschi from "./PerformanceEtaMaschi";
import PerformanceEtaFemmine from "./PerformanceEtaFemmine";
import StoricoPerformanceEta from "./StoricoPerformanceEta";
import ReportStoricoMangimi from "./ReportStoricoMangimi";
import ReportQuantitaForaggio from "./ReportQuantitaForaggio";
import ReportStoricoForaggio from "./ReportStoricoForaggio";
import AccrescimentoCostiPagina from "./AccrescimentoCostiPagina";
import RazioniSuiniComposizione from "./RazioniSuiniComposizione";
import RazioniSuiniConsumi from "./RazioniSuiniConsumi";
import IstruzioniFatture from "./IstruzioniFatture";
import IstruzioniAnagrafiche from "./IstruzioniAnagrafiche";
import IstruzioniAnimali from "./IstruzioniAnimali";
import IstruzioniCosti from "./IstruzioniCosti";
import IstruzioniStudi from "./IstruzioniStudi";
import Ricerca from "./Ricerca";
import Parametri from "./Parametri";
import ReportAcquistoAnimali from "./ReportAcquistoAnimali";
import { C, FONT } from "./style";

const MENU = [
  { tipo: "voce", id: "dashboard", label: "Dashboard", icon: "📊" },
  { tipo: "cartella", id: "cart-fatture", label: "Fatture", icon: "📥", contenuto: [
    { tipo: "voce", id: "istr-fatture", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "carica", label: "Carica Fatture", icon: "📥" },
    { tipo: "voce", id: "passive", label: "Fatture Passive", icon: "📄" },
    { tipo: "voce", id: "attive", label: "Fatture Attive", icon: "💰" },
    { tipo: "voce", id: "costidiretti", label: "Costi Diretti", icon: "💼" },
    { tipo: "voce", id: "ricerca", label: "Ricerca", icon: "🔎" },
    { tipo: "voce", id: "anomalie", label: "Controllo Anomalie", icon: "🔍" },
    { tipo: "voce", id: "armonizza", label: "Da Armonizzare", icon: "⚖️" },
    { tipo: "voce", id: "articoliprezzi", label: "Articoli & Prezzi", icon: "🏷️" },
  ]},
  { tipo: "cartella", id: "cart-anagrafiche", label: "Anagrafiche", icon: "🏢", contenuto: [
    { tipo: "voce", id: "istr-anagrafiche", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "fornitori", label: "Fornitori", icon: "🏢" },
    { tipo: "voce", id: "clienti", label: "Clienti", icon: "🤝" },
  ]},
  { tipo: "cartella", id: "cart-animali", label: "Animali", icon: "🐄", contenuto: [
    { tipo: "voce", id: "istr-animali", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "acquisto", label: "Report Acquisto Animali", icon: "🐄" },
    { tipo: "voce", id: "uba", label: "Report UBA", icon: "🐮" },
    { tipo: "voce", id: "scheda", label: "Scheda Animale", icon: "🔍" },
    { tipo: "voce", id: "riproduttori", label: "Report Riproduttori", icon: "🐄" },
  ]},
  { tipo: "cartella", id: "cart-costi", label: "Costi", icon: "📊", contenuto: [
    { tipo: "voce", id: "istr-costi", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "costi", label: "Report Costi", icon: "📊" },
    { tipo: "voce", id: "cespiti", label: "Cespiti", icon: "🏗️" },
  ]},
  { tipo: "cartella", id: "cart-studi", label: "Studi", icon: "🔎", contenuto: [
    { tipo: "voce", id: "istr-studi", label: "Istruzioni", icon: "📖" },
    { tipo: "sottocartella", id: "sub-mangimi", label: "Mangimi", icon: "🌾", voci: [
      { id: "quantitamangimi", label: "Report Quantità Mangimi", icon: "🌾" },
      { id: "storico-mangimi-bovini", label: "Storico Mangimi — Bovini", icon: "📈" },
      { id: "storico-mangimi-suini", label: "Storico Mangimi — Suini", icon: "📈" },
      { id: "storico-mangimi-ovini", label: "Storico Mangimi — Ovini", icon: "📈" },
    ]},
    { tipo: "sottocartella", id: "sub-foraggio", label: "Foraggio", icon: "🌱", voci: [
      { id: "quantitaforaggio", label: "Report Quantità Foraggio", icon: "🌱" },
      { id: "storico-foraggio-bovini", label: "Storico Foraggio — Bovini", icon: "📈" },
      { id: "storico-foraggio-suini", label: "Storico Foraggio — Suini", icon: "📈" },
      { id: "storico-foraggio-ovini", label: "Storico Foraggio — Ovini", icon: "📈" },
    ]},
    { tipo: "sottocartella", id: "sub-accrescimento-costi", label: "Accrescimento e Costi", icon: "⚖️", voci: [
      { id: "acc-bovini-tutti", label: "Bovini — Tutti gli Alimenti", icon: "🐄" },
      { id: "acc-bovini-mangimi", label: "Bovini — Mangimi", icon: "🌾" },
      { id: "acc-bovini-foraggio", label: "Bovini — Foraggio", icon: "🌱" },
      { id: "acc-bovini-pascolo", label: "Bovini — Pascolo", icon: "🌳" },
      { id: "performanceeta", label: "Bovini — Performance per Fascia d'Età", icon: "📐" },
      { id: "performanceeta-maschi", label: "Bovini — Solo Maschi", icon: "♂️" },
      { id: "performanceeta-femmine", label: "Bovini — Solo Femmine", icon: "♀️" },
      { id: "storico-performanceeta", label: "Bovini — Storico", icon: "📈" },
    ]},
  ]},
  { tipo: "cartella", id: "cart-razioni", label: "Razioni", icon: "🥣", contenuto: [
    { tipo: "sottocartella", id: "sub-razioni-suini", label: "Suini", icon: "🐖", voci: [
      { id: "razioni-suini-composizione", label: "Composizione Razioni", icon: "📋" },
      { id: "razioni-suini-consumi", label: "Consumi", icon: "📊" },
    ]},
  ]},
  { tipo: "voce", id: "parametri", label: "Parametri", icon: "⚙️" },
];

// Cerca ricorsivamente (cartella → sottocartella → voce) in quale cartella di primo
// livello si trova un dato id di pagina, per aprirla automaticamente quando si naviga
// lì da una scorciatoia esterna (es. dalla Dashboard)
function cartellaDiPagina(pageId) {
  for (const m of MENU) {
    if (m.tipo !== "cartella") continue;
    for (const c of m.contenuto) {
      if (c.tipo === "voce" && c.id === pageId) return { cartella: m.id, sottocartella: null };
      if (c.tipo === "sottocartella" && c.voci.some(v => v.id === pageId)) return { cartella: m.id, sottocartella: c.id };
    }
  }
  return null;
}

function VoceMenuBottone({ v, attiva, onClick, piccola }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: attiva ? "rgba(255,255,255,0.2)" : "transparent",
        color: "#fff", border: "none", borderRadius: 8,
        padding: piccola ? "8px 10px" : "10px 12px", fontSize: piccola ? 12.5 : 13, fontWeight: piccola ? 600 : 700, cursor: "pointer",
        textAlign: "left", display: "flex", alignItems: "center", gap: 8, width: "100%",
      }}
    >
      <span>{v.icon}</span> <span>{v.label}</span>
    </button>
  );
}

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [cartelleAperte, setCartelleAperte] = useState(() => new Set());

  function vaiA(pageId) {
    setTab(pageId);
    const posizione = cartellaDiPagina(pageId);
    if (posizione) {
      setCartelleAperte(prev => {
        const nuovo = new Set(prev).add(posizione.cartella);
        if (posizione.sottocartella) nuovo.add(posizione.sottocartella);
        return nuovo;
      });
    }
    if (pageId === "attive") setVistaAttive("elenco");
  }

  function toggleCartella(cartellaId) {
    setCartelleAperte(prev => {
      const nuovo = new Set(prev);
      if (nuovo.has(cartellaId)) nuovo.delete(cartellaId); else nuovo.add(cartellaId);
      return nuovo;
    });
  }
  const [vistaAttive, setVistaAttive] = useState("elenco"); // "elenco" | "nuova"
  const [ricercaSchedaAnimale, setRicercaSchedaAnimale] = useState(null);

  function vaiAllaSchedaAnimale(termine) {
    setRicercaSchedaAnimale(termine);
    vaiA("scheda");
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT, display: "flex" }}>
      <aside style={{ background: C.primary, width: 240, minWidth: 240, minHeight: "100vh", padding: "20px 12px", color: "#fff", position: "sticky", top: 0, alignSelf: "flex-start" }}>
        <div style={{ marginBottom: 20, padding: "0 8px" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Contabilità Industriale</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Podere Verde</div>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {MENU.map(m => m.tipo === "voce" ? (
            <VoceMenuBottone key={m.id} v={m} attiva={tab === m.id} onClick={() => vaiA(m.id)} />
          ) : (
            <div key={m.id}>
              <button
                onClick={() => toggleCartella(m.id)}
                style={{
                  background: "transparent", color: "#fff", border: "none", borderRadius: 8,
                  padding: "10px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                  textAlign: "left", display: "flex", alignItems: "center", gap: 8, width: "100%",
                }}
              >
                <span>{cartelleAperte.has(m.id) ? "📂" : "📁"}</span> <span>{m.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7 }}>{cartelleAperte.has(m.id) ? "▾" : "▸"}</span>
              </button>
              {cartelleAperte.has(m.id) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginLeft: 14, borderLeft: "1.5px solid rgba(255,255,255,0.25)", paddingLeft: 6 }}>
                  {m.contenuto.map(c => c.tipo === "voce" ? (
                    <VoceMenuBottone key={c.id} v={c} attiva={tab === c.id} onClick={() => vaiA(c.id)} piccola />
                  ) : (
                    <div key={c.id}>
                      <button
                        onClick={() => toggleCartella(c.id)}
                        style={{
                          background: "transparent", color: "#fff", border: "none", borderRadius: 8,
                          padding: "8px 10px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                          textAlign: "left", display: "flex", alignItems: "center", gap: 8, width: "100%", opacity: 0.9,
                        }}
                      >
                        <span>{cartelleAperte.has(c.id) ? "📂" : "📁"}</span> <span>{c.label}</span>
                        <span style={{ marginLeft: "auto", fontSize: 10, opacity: 0.7 }}>{cartelleAperte.has(c.id) ? "▾" : "▸"}</span>
                      </button>
                      {cartelleAperte.has(c.id) && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginLeft: 14, borderLeft: "1.5px solid rgba(255,255,255,0.2)", paddingLeft: 6 }}>
                          {c.voci.map(v => (
                            <VoceMenuBottone key={v.id} v={v} attiva={tab === v.id} onClick={() => vaiA(v.id)} piccola />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>        {tab === "dashboard" && <Dashboard onNavigate={vaiA} />}
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
        {tab === "cespiti" && <SezioneCespiti />}
        {tab === "uba" && <ReportUba onVediScheda={vaiAllaSchedaAnimale} />}
        {tab === "costi" && <SezioneReportCosti />}
        {tab === "scheda" && <SchedaAnimale ricercaIniziale={ricercaSchedaAnimale} onRicercaConsumata={() => setRicercaSchedaAnimale(null)} />}
        {tab === "riproduttori" && <ReportRiproduttori />}
        {tab === "performanceeta" && <PerformanceEta onNavigate={vaiA} />}
        {tab === "performanceeta-maschi" && <PerformanceEtaMaschi onNavigate={vaiA} />}
        {tab === "performanceeta-femmine" && <PerformanceEtaFemmine onNavigate={vaiA} />}
        {tab === "storico-performanceeta" && <StoricoPerformanceEta />}
        {tab === "articoliprezzi" && <ArticoliPrezzi />}
        {tab === "costidiretti" && <CostiDiretti />}
        {tab === "anomalie" && <ControlloAnomalie />}
        {tab === "armonizza" && <DaArmonizzare />}
        {tab === "quantitamangimi" && <ReportQuantitaMangimi />}
        {tab === "storico-mangimi-bovini" && <ReportStoricoMangimi specieFiltro="bovino" titolo="Bovini" />}
        {tab === "storico-mangimi-suini" && <ReportStoricoMangimi specieFiltro="suino" titolo="Suini" />}
        {tab === "storico-mangimi-ovini" && <ReportStoricoMangimi specieFiltro="ovino" titolo="Ovini" />}
        {tab === "quantitaforaggio" && <ReportQuantitaForaggio />}
        {tab === "storico-foraggio-bovini" && <ReportStoricoForaggio specieFiltro="bovino" titolo="Bovini" />}
        {tab === "storico-foraggio-suini" && <ReportStoricoForaggio specieFiltro="suino" titolo="Suini" />}
        {tab === "storico-foraggio-ovini" && <ReportStoricoForaggio specieFiltro="ovino" titolo="Ovini" />}
        {tab === "acc-bovini-tutti" && <AccrescimentoCostiPagina campo="stepVivoTuttiAlimenti" titolo="Tutti gli Alimenti" descrizione="Mangimi + Foraggio insieme (il Pascolo si aggiungerà quando avremo i suoi dati) — il quadro economico completo di quanto costa la crescita, per fascia d'età." />}
        {tab === "acc-bovini-mangimi" && <AccrescimentoCostiPagina campo="stepVivoSoloMangimi" titolo="Mangimi" descrizione="Solo il costo/consumo Mangimi, isolato dal Foraggio — utile per capire il peso specifico di questo centro di costo da solo." />}
        {tab === "acc-bovini-foraggio" && <AccrescimentoCostiPagina campo="stepVivoSoloForaggio" titolo="Foraggio" descrizione="Solo il costo/consumo Foraggio, isolato dai Mangimi — utile per capire il peso specifico di questo centro di costo da solo." />}
        {tab === "acc-bovini-pascolo" && <AccrescimentoCostiPagina campo="stepVivoPascolo" titolo="Pascolo" descrizione="Pagina segnaposto — il Pascolo si affronterà insieme a Coltivazione." vuota />}
        {tab === "razioni-suini-composizione" && <RazioniSuiniComposizione />}
        {tab === "razioni-suini-consumi" && <RazioniSuiniConsumi />}
        {tab === "istr-fatture" && <IstruzioniFatture />}
        {tab === "istr-anagrafiche" && <IstruzioniAnagrafiche />}
        {tab === "istr-animali" && <IstruzioniAnimali />}
        {tab === "istr-costi" && <IstruzioniCosti />}
        {tab === "istr-studi" && <IstruzioniStudi />}
        {tab === "ricerca" && <Ricerca />}
        {tab === "parametri" && <Parametri />}
      </main>
    </div>
  );
}
