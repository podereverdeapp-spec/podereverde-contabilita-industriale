import { useState, useEffect } from "react";
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
import GraficoMacellazioni from "./GraficoMacellazioni";
import BreakEven from "./BreakEven";
import ContabilitaMuratella from "./ContabilitaMuratella";
import RiepilogoCostiBreakEven from "./RiepilogoCostiBreakEven";
import SchedaAnimale from "./SchedaAnimale";
import ReportRiproduttori from "./ReportRiproduttori";
import ArticoliPrezzi from "./ArticoliPrezzi";
import CostiDiretti from "./CostiDiretti";
import ControlloAnomalie from "./ControlloAnomalie";
import CaricaPdfFatture from "./CaricaPdfFatture";
import DaArmonizzare from "./DaArmonizzare";
import PerformanceEta from "./PerformanceEta";
import PerformanceEtaMaschi from "./PerformanceEtaMaschi";
import PerformanceEtaFemmine from "./PerformanceEtaFemmine";
import StoricoPerformanceEta from "./StoricoPerformanceEta";
import AccrescimentoCostiPagina from "./AccrescimentoCostiPagina";
import RazioniSuiniComposizione from "./RazioniSuiniComposizione";
import RazioniSuiniConsumi from "./RazioniSuiniConsumi";
import CostruisciRazione from "./CostruisciRazione";
import IstruzioniAlimentaria from "./IstruzioniAlimentaria";
import RazioniRiferimento from "./RazioniRiferimento";
import ReportFabbisogniBovini from "./ReportFabbisogniBovini";
import { ControllaPrezzi, ChiediPreventivi, PreventiviRicevuti } from "./PrezziAlimentaria";
import PromptEstrazionePDF from "./PromptEstrazionePDF";
import PromptCaricoAruba from "./PromptCaricoAruba";
import PromptFattureEmesseAruba from "./PromptFattureEmesseAruba";
import LetturaAruba from "./LetturaAruba";
import ControlloFatturazioneAttiva from "./ControlloFatturazioneAttiva";
import ElencoFattureAttive from "./ElencoFattureAttive";
import NumeroProgressivo from "./NumeroProgressivo";
import { contaAllarmiFatturazione } from "./calcoloAruba";
import PromptCedolini from "./PromptCedolini";
import CaricaCostiLavoro from "./CaricaCostiLavoro";
import ConsultaCostiLavoro from "./ConsultaCostiLavoro";
import InserimentoManualeFattura from "./InserimentoManualeFattura";
import VerificaFattureMancanti from "./VerificaFattureMancanti";
import VerificaRigheMancanti from "./VerificaRigheMancanti";
import ReportCostiQuantitaAlimentare from "./ReportCostiQuantitaAlimentare";
import ImportMassivoRiproduttori from "./ImportMassivoRiproduttori";
import RiepilogoCostoAnimali from "./RiepilogoCostoAnimali";
import PrezzoPareggio from "./PrezzoPareggio";
import DocumentoIstruzioni from "./DocumentoIstruzioni";
import { ISTRUZIONI_CARICA_FATTURE, PIANO_DEI_CONTI, ISTRUZIONI_COSTI_DIRETTI, ISTRUZIONI_COSTI_LAVORO, ISTRUZIONI_SISTEMA_DATI, ISTRUZIONI_VERIFICA, ISTRUZIONI_REGISTRO_MODIFICHE, ISTRUZIONI_CONTROLLI, ISTRUZIONI_FATTURAZIONE_ANIMALI, ISTRUZIONI_ALTRE_FATTURE, ISTRUZIONI_CONTROLLO_ATTIVA } from "./istruzioniDati";
import IstruzioniAnagrafiche from "./IstruzioniAnagrafiche";
import IstruzioniPrezziAcquisto from "./IstruzioniPrezziAcquisto";
import IstruzioniAnimali from "./IstruzioniAnimali";
import IstruzioniCosti from "./IstruzioniCosti";
import IstruzioniBreakEven from "./IstruzioniBreakEven";
// Versione 239: Report di Analisi
import ReportAnalisi from "./ReportAnalisi";
import ReportAnalisiColtivazioni from "./ReportAnalisiColtivazioni";
import IstruzioniReportAnalisi from "./IstruzioniReportAnalisi";
// Versione 240: Attenzione Variazione Prezzi e Famiglie di Prodotto
import VariazionePrezzi from "./VariazionePrezzi";
import FamiglieProdotto from "./FamiglieProdotto";
import IstruzioniStudi from "./IstruzioniStudi";
import IstruzioniColtivazioni from "./IstruzioniColtivazioni";
import Modelli4 from "./Modelli4";
import IstruzioniModelli4 from "./IstruzioniModelli4";
import IstruzioniEmissioneFatture from "./IstruzioniEmissioneFatture";
import FattureCompetenza from "./FattureCompetenza";
import UsciteDaFatturare from "./UsciteDaFatturare";
import PreparaFatture from "./PreparaFatture";
import FattureEmesse from "./FattureEmesse";
import NuovaFatturaLibera from "./NuovaFatturaLibera";
import { contaUsciteDaFatturare } from "./calcoloEmissioneFatture";
import AltriDocumentiCortesi from "./AltriDocumentiCortesi";
import FattureColtivazioneElenco from "./FattureColtivazioneElenco";
import FattureColtivazioneRiepilogo from "./FattureColtivazioneRiepilogo";
import ColtSchedeCampi from "./ColtSchedeCampi";
import ColtReseStagioni from "./ColtReseStagioni";
import ColtPianoCampagna from "./ColtPianoCampagna";
import ColtArchivioReport from "./ColtArchivioReport";
import ColtGrafici from "./ColtGrafici";
import ColtClassifiche from "./ColtClassifiche";
import ColtRegistroLavori from "./ColtRegistroLavori";
import Ricerca from "./Ricerca";
import Parametri from "./Parametri";
import Glossario from "./Glossario";
import ReportAcquistoAnimali from "./ReportAcquistoAnimali";
import RegistroControlli from "./RegistroControlli";
import AbbinamentiFatture from "./AbbinamentiFatture";
import RegistroModifiche from "./RegistroModifiche";
// Versione 295: le Istruzioni dei Controlli vengono dal Word «Istruzioni_Controllo_finale_v295» (IstruzioniControlli.jsx non è più usata)
import AccessoProgramma, { useSessione, esci } from "./AccessoProgramma";
import { eseguiControlli, contaAnomalieAperte } from "./controlliRegistri";
import { statoCalcoli, testoAvvisoCalcoli } from "./statoCalcoli";
import { C, FONT } from "./style";

const MENU = [
  { tipo: "voce", id: "dashboard", label: "Dashboard", icon: "📊" },
  // Versione 239: Report di Analisi (cosa va, cosa non va, cause e interventi), richiesti il 09/10/2026
  { tipo: "cartella", id: "cart-report-analisi", label: "Report di Analisi", icon: "🧭", contenuto: [
    { tipo: "voce", id: "istr-report-analisi", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "analisi-suini", label: "Suini", icon: "🐖" },
    { tipo: "voce", id: "analisi-bovini", label: "Bovini", icon: "🐄" },
    { tipo: "voce", id: "analisi-ovini", label: "Ovini", icon: "🐑" },
    { tipo: "voce", id: "analisi-coltivazioni", label: "Coltivazioni", icon: "🌾" },
  ]},
  // Versione 241: cartella dedicata al controllo dei prezzi di acquisto (richiesta del Dott. Bizzarri del 09/10/2026)
  { tipo: "cartella", id: "cart-prezzi-acquisto", label: "Controllo Prezzi di Acquisto", icon: "💶", contenuto: [
    { tipo: "voce", id: "istr-prezzi-acquisto", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "variazione-prezzi", label: "Attenzione Variazione Prezzi", icon: "⚠️" },
    { tipo: "voce", id: "articoliprezzi", label: "Articoli & Prezzi", icon: "🏷️" },
    { tipo: "voce", id: "famiglie-prodotto", label: "Famiglie di Prodotto", icon: "🗂️" },
  ]},
  // Versione 261 (decisione del Dott. Bizzarri del 21/10/2026): «Carica Fatture» diventa «Carica Dati
  // Contabilità»; in cima le tre istruzioni, poi le pagine in quattro gruppi nell'ordine del lavoro.
  // La cartella «Controlli» confluisce nel gruppo «Controllo finale» (n. 6 dalla v265); «Import Fatture Acquisto
  // Animali» passa qui dalla cartella Animali; tolta nella versione 274 (decisione del Dott. Bizzarri del 22/10/2026:
  // serviva durante la costruzione del programma, ora non serve più).
  { tipo: "cartella", id: "cart-fatture", label: "Carica Dati Contabilità", icon: "📥", contenuto: [
    // Versione 265 (decisione del Dott. Bizzarri del 21/10/2026 ore 11:46; le Istruzioni Generali si scrivono
    // alla fine, quando la cartella è completa): sottocartelle per tipo di
    // dato da caricare (fatture passive, costi diretti, costi del lavoro), poi sistemazione, verifica e
    // controllo finale. «Carica Fatture Attive» passa in Emissione Fatture.
    { tipo: "voce", id: "piano-dei-conti", label: "Piano dei Conti", icon: "📖" },
    { tipo: "sottocartella", id: "sub-dati-fatture-passive", label: "1. Carica Fatture Passive", icon: "📥", voci: [
      { id: "istr-fatture", label: "Istruzioni Carica Fatture Passive", icon: "📖" },
      { id: "prompt-estrazione-pdf", label: "Prompt per carico Massivo", icon: "🤖" },
      // Versione 293: il carico diretto da Aruba con Claude (decisione del Dott. Bizzarri del 24/10/2026)
      { id: "prompt-carico-aruba", label: "Prompt per carico da Aruba", icon: "🌐" },
      { id: "carica", label: "Carica Fatture Passive massivamente", icon: "📥" },
      { id: "inserimento-manuale", label: "Inserimento Manuale Fattura", icon: "✍️" },
      // Versione 292: i PDF delle fatture nel programma (decisione del Dott. Bizzarri del 24/10/2026)
      { id: "carica-pdf-fatture", label: "Carica PDF delle Fatture", icon: "📎" },
    ]},
    { tipo: "sottocartella", id: "sub-dati-costi-diretti", label: "2. Carica Costi Diretti (non soggetti a fatturazione)", icon: "💼", voci: [
      { id: "istr-costi-diretti", label: "Istruzioni Carica Costi Diretti", icon: "📖" },
      { id: "costidiretti", label: "Carica Costi Diretti", icon: "💼" },
    ]},
    // Cartella 3: le pagine si progettano con il Dott. Bizzarri. Versione 270: il prompt per il carico dei cedolini; versione 271: carico e consultazione.
    // Versione 273: le istruzioni, dal Word approvato dal Dott. Bizzarri il 22/10/2026 alle 11:31.
    { tipo: "sottocartella", id: "sub-dati-lavoro", label: "3. Carica Costi del Lavoro", icon: "👷", voci: [
      { id: "istr-costi-lavoro", label: "Istruzioni Carica Costi del Lavoro", icon: "📖" },
      { id: "prompt-cedolini", label: "Prompt per carico cedolini", icon: "🤖" },
      { id: "carica-costi-lavoro", label: "Carica Costi del Lavoro", icon: "📥" },
      { id: "consulta-costi-lavoro", label: "Consulta Costi del Lavoro", icon: "🔍" },
    ]},
    // Versione 289: le istruzioni, dal Word approvato dal Dott. Bizzarri il 23/10/2026.
    { tipo: "sottocartella", id: "sub-dati-sistema", label: "4. Sistema i dati caricati", icon: "🧹", voci: [
      { id: "istr-sistema-dati", label: "Istruzioni Sistema i dati caricati", icon: "📖" },
      { id: "armonizza", label: "Armonizzare Unità Misura Fatture", icon: "⚖️" },
      { id: "abbinamenti-fatture", label: "Abbinamenti Fatture Acquisto", icon: "🔗" },
    ]},
    // Versione 291: le istruzioni, dal Word approvato dal Dott. Bizzarri il 24/10/2026.
    { tipo: "sottocartella", id: "sub-dati-verifica", label: "5. Verifica che non manchi niente", icon: "🔍", voci: [
      { id: "istr-verifica", label: "Istruzioni Verifica che non manchi niente", icon: "📖" },
      { id: "verifica-fatture-mancanti", label: "Verifica Fatture Mancanti", icon: "🔍" },
      { id: "verifica-righe-mancanti", label: "Verifica Righe Mancanti", icon: "🔎" },
      { id: "anomalie", label: "Fatture Incomplete", icon: "🧾" },
      { id: "passive", label: "Fatture Passive", icon: "📄" },
    ]},
    { tipo: "sottocartella", id: "sub-dati-controllo", label: "6. Controllo finale", icon: "🛡️", voci: [
      { id: "istr-controlli", label: "Istruzioni dei Controlli", icon: "📖" },
      { id: "registro-controlli", label: "Registro Controlli", icon: "🛡️" },
    ]},
  ]},
  // Versione 297 (decisione del Dott. Bizzarri del 26/10/2026): «Emissione Fatture» diventa «Emissione Fatture di Vendita»;
  // subito dopo le Istruzioni la sottocartella «Fatturazione Automatica Vendita Animali da Allevamento», con le sue Istruzioni.
  { tipo: "cartella", id: "cart-emissione-fatture", label: "Emissione Fatture di Vendita", icon: "🧾", contenuto: [
    { tipo: "voce", id: "istr-emissione-fatture", label: "Istruzioni", icon: "📖" },
    { tipo: "sottocartella", id: "sub-fatturazione-animali", label: "Fatturazione Automatica Vendita Animali da Allevamento", icon: "🐄", voci: [
      { id: "istr-fatturazione-animali", label: "Istruzioni", icon: "📖" },
      { id: "fatt-animali-da-fatturare", label: "Uscite da Fatturare", icon: "🔔" },
      { id: "fatt-animali-prepara", label: "Prepara Fatture", icon: "🧾" },
      { id: "fatt-animali-emesse", label: "Fatture Emesse", icon: "📤" },
    ]},
    // Versione 299 (decisione del Dott. Bizzarri del 26/10/2026): «Altre Fatturazioni» diventa «Emissione delle Altre Fatture Attive» e viene subito dopo gli animali
    { tipo: "sottocartella", id: "sub-altre-fatturazioni", label: "Emissione delle Altre Fatture Attive", icon: "📄", voci: [
      { id: "istr-altre-fatture", label: "Istruzioni", icon: "📖" },
      { id: "altre-nuova", label: "Nuova Fattura", icon: "✍️" },
      { id: "altre-emesse", label: "Fatture Emesse", icon: "📤" },
    ] },
    // Versione 300 (decisione del Dott. Bizzarri del 26/10/2026, ore 13:14): «Carica Fatture Attive» non serve più.
    // Le fatture di vendita si leggono da Aruba; controlli, elenco con ricerca e numero progressivo.
    { tipo: "sottocartella", id: "sub-controllo-attiva", label: "Controllo Fatturazione Attiva e Numero Progressivo", icon: "🔎", voci: [
      { id: "istr-controllo-attiva", label: "Istruzioni", icon: "📖" },
      { id: "prompt-aruba-emesse", label: "Prompt per Claude: Fatture Emesse in Aruba", icon: "🤖" },
      { id: "lettura-aruba", label: "Leggi le Fatture di Aruba", icon: "📥" },
      { id: "controllo-attiva", label: "Controlli e Allarmi", icon: "🔔" },
      { id: "elenco-attive", label: "Elenco Fatture Attive", icon: "📋" },
      { id: "numero-progressivo", label: "Numero Progressivo", icon: "🔢" },
    ] },
    { tipo: "sottocartella", id: "sub-fatture-competenza", label: "Fatture da Ricevere e da Emettere", icon: "🗂️", voci: [
      { id: "fatture-competenza", label: "Rapporti con Muratella", icon: "🏛️" },
    ] },
  ]},
  { tipo: "cartella", id: "cart-ricerca", label: "Ricerca: Fatture e Anagrafiche", icon: "🔎", contenuto: [
    { tipo: "voce", id: "istr-ricerca", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "ricerca", label: "Ricerca", icon: "🔎" },
    { tipo: "voce", id: "fornitori", label: "Fornitori", icon: "🏢" },
    { tipo: "voce", id: "clienti", label: "Clienti", icon: "🤝" },
  ]},
  { tipo: "cartella", id: "cart-costi", label: "Analisi Costi", icon: "📊", contenuto: [
    { tipo: "voce", id: "istr-costi", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "costi", label: "Report Costi", icon: "📊" },
    { tipo: "voce", id: "grafico-macellazioni", label: "Grafico per le Macellazioni", icon: "📈" },
    { tipo: "voce", id: "prezzo-pareggio", label: "Prezzo di Pareggio", icon: "🎯" },
    { tipo: "voce", id: "istr-break-even", label: "Istruzioni del Break Even", icon: "📖" },
    { tipo: "voce", id: "break-even", label: "Break Even sulla carcassa", icon: "⚖️" },
    { tipo: "voce", id: "break-even-vivo", label: "Break Even sul capo vivo", icon: "🐂" },
    { tipo: "voce", id: "riepilogo-costi-breakeven", label: "Riepilogo Costi (Break Even)", icon: "📋" },
    { tipo: "voce", id: "cespiti", label: "Cespiti", icon: "🏗️" },
  ]},
  { tipo: "cartella", id: "cart-alimentaria", label: "Alimentaria", icon: "🌾", contenuto: [
    { tipo: "voce", id: "istr-alimentaria", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "costi-quantita-alimentare", label: "Costi e Quantità", icon: "📊" },
    { tipo: "sottocartella", id: "sub-prezzi-preventivi", label: "Controlla prezzi e chiedi preventivi", icon: "💶", voci: [
      { id: "controlla-prezzi", label: "Controlla prezzi", icon: "💶" },
      { id: "chiedi-preventivi", label: "Chiedi preventivi", icon: "✉️" },
      { id: "preventivi-ricevuti", label: "Preventivi ricevuti", icon: "📥" },
    ]},
    { tipo: "sottocartella", id: "sub-razioni-bovini", label: "Razioni (bovini, suini e ovini)", icon: "🐄", voci: [
      { id: "razioni-bovini-riferimento", label: "Razioni di riferimento", icon: "📋" },
      { id: "razioni-bovini-report", label: "Report fabbisogni", icon: "📑" },
      { id: "costruisci-razione", label: "Costruisci razione", icon: "🥣" },
    ]},
    { tipo: "sottocartella", id: "sub-razioni-suini", label: "Razioni Suini", icon: "🥣", voci: [
      { id: "razioni-suini-composizione", label: "Composizione Razioni", icon: "📋" },
      { id: "razioni-suini-consumi", label: "Consumi", icon: "📊" },
    ]},
  ]},
  { tipo: "cartella", id: "cart-animali", label: "Animali", icon: "🐄", contenuto: [
    { tipo: "voce", id: "istr-animali", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "acquisto", label: "Report Acquisto Animali", icon: "🐄" },
    { tipo: "voce", id: "uba", label: "Report UBA", icon: "🐮" },
    { tipo: "voce", id: "riepilogo-costo-animali", label: "Riepilogo Costo Animali", icon: "📋" },
    { tipo: "voce", id: "riproduttori", label: "Report Riproduttori", icon: "🐄" },
    { tipo: "voce", id: "scheda", label: "Scheda Animale", icon: "🔍" },
    { tipo: "voce", id: "import-massivo-riproduttori", label: "Import Massivo Riproduttori", icon: "📥" },
    { tipo: "sottocartella", id: "sub-accrescimento-costi", label: "Accrescimento e Costi", icon: "⚖️", voci: [
      { id: "acc-bovini-alimenti", label: "Bovini — Costo per Alimento", icon: "🌾" },
      { id: "performanceeta", label: "Bovini — Performance per Fascia d'Età", icon: "📐" },
      { id: "performanceeta-maschi", label: "Bovini — Solo Maschi", icon: "♂️" },
      { id: "performanceeta-femmine", label: "Bovini — Solo Femmine", icon: "♀️" },
      { id: "storico-performanceeta", label: "Bovini — Storico", icon: "📈" },
    ]},
  ]},
  { tipo: "cartella", id: "cart-modelli4", label: "Modelli 4", icon: "📑", contenuto: [
    { tipo: "voce", id: "istr-modelli4", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "modelli4-elenco", label: "Elenco dei Modelli 4", icon: "📑" },
    { tipo: "voce", id: "modelli4-altri", label: "Altri documenti di Stefano Cortesi", icon: "🗂️" },
  ]},
  { tipo: "cartella", id: "cart-studi", label: "Studi", icon: "🔎", contenuto: [
    { tipo: "voce", id: "istr-studi", label: "Istruzioni", icon: "📖" },
  ]},
  { tipo: "cartella", id: "cart-coltivazioni", label: "Coltivazioni", icon: "🚜", contenuto: [
    { tipo: "voce", id: "istr-coltivazioni", label: "Istruzioni", icon: "📖" },
    { tipo: "sottocartella", id: "sub-fatture-coltivazione", label: "Fatture Coltivazione", icon: "🧾", voci: [
      { id: "colt-fatture-elenco", label: "Elenco Fatture", icon: "📋" },
      { id: "colt-fatture-riepilogo", label: "Riepilogo per Anno e Centro di Costo", icon: "📊" },
    ]},
    { tipo: "sottocartella", id: "sub-campi-stagioni", label: "Campi e Stagioni", icon: "🌾", voci: [
      { id: "colt-schede-campi", label: "Schede Campi", icon: "🗺️" },
      { id: "colt-registro-lavori", label: "Registro dei Lavori", icon: "🚜" },
      { id: "colt-rese-stagioni", label: "Rese e Costi per Stagione", icon: "📈" },
      { id: "colt-grafici", label: "Grafici", icon: "📊" },
      { id: "colt-classifiche", label: "Classifiche dei Campi", icon: "🏅" },
      { id: "colt-piano", label: "Piano della Campagna", icon: "🗓️" },
      { id: "colt-archivio-report", label: "Archivio dei Report", icon: "🗄️" },
    ]},
    { tipo: "sottocartella", id: "sub-muratella", label: "Muratella S.r.l.", icon: "🏛️", voci: [
      { id: "muratella-costi", label: "Contabilità Muratella", icon: "🏛️" },
    ]},
  ]},
  // Versione 294 (decisione del Dott. Bizzarri del 24/10/2026 ore 16:02): il Registro delle Modifiche esce da
  // «6. Controllo finale» e diventa una cartella del menu principale, con le sue istruzioni.
  { tipo: "cartella", id: "cart-registro-modifiche", label: "Registro delle modifiche", icon: "🕓", contenuto: [
    { tipo: "voce", id: "istr-registro-modifiche", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "registro-modifiche", label: "Registro delle Modifiche", icon: "🕓" },
  ]},
  // Versione 248: Glossario dei termini usati nelle istruzioni (cresce sezione per sezione)
  { tipo: "voce", id: "glossario", label: "Glossario", icon: "📚" },
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

// Avviso numerico rosso accanto alle voci del menu (es. capi usciti da fatturare)
function Avviso({ n }) {
  if (!n) return null;
  return <span title={`${n} da vedere`} style={{ marginLeft: "auto", background: "#C0392B", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 800, lineHeight: "16px" }}>{n}</span>;
}

function VoceMenuBottone({ v, attiva, onClick, piccola, avviso }) {
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
      <Avviso n={avviso} />
    </button>
  );
}

// Accesso con le credenziali dell'app (versione 232): senza sessione si vede solo la schermata d'accesso.
export default function App() {
  const sessione = useSessione();
  if (sessione === undefined) return <div style={{ fontFamily: FONT, padding: 40, color: C.muted }}>Verifica dell'accesso…</div>;
  if (!sessione) return <AccessoProgramma />;
  return <Programma utente={sessione.user} />;
}

function Programma({ utente }) {
  const [tab, setTab] = useState("dashboard");
  const [cartelleAperte, setCartelleAperte] = useState(() => new Set());
  // Avviso «fatture da emettere»: capi usciti segnati «pronto da fatturare» nell'app.
  // Si ricontrolla all'apertura, a ogni cambio di pagina e ogni 5 minuti.
  const [daFatturare, setDaFatturare] = useState(0);
  useEffect(() => {
    let attivo = true;
    const controlla = () => contaUsciteDaFatturare().then(n => { if (attivo) setDaFatturare(n); }).catch(() => {});
    controlla();
    const timer = setInterval(controlla, 5 * 60 * 1000);
    return () => { attivo = false; clearInterval(timer); };
  }, [tab]);
  // Versione 300: allarmi della fatturazione attiva (fatture del programma non trovate in Aruba, scartate, con differenze)
  const [allarmiAttiva, setAllarmiAttiva] = useState(0);
  useEffect(() => { contaAllarmiFatturazione().then(setAllarmiAttiva); }, [tab]);
  // Controlli dei registri: all'apertura del programma, poi il conteggio si aggiorna a ogni cambio di pagina
  const [anomalieAperte, setAnomalieAperte] = useState(null);
  const [controlloInCorso, setControlloInCorso] = useState(true);
  useEffect(() => {
    eseguiControlli("apertura del programma").then(e => setAnomalieAperte(e.aperte))
      .catch(() => contaAnomalieAperte().then(setAnomalieAperte))
      .finally(() => setControlloInCorso(false));
  }, []);
  useEffect(() => { if (!controlloInCorso) contaAnomalieAperte().then(setAnomalieAperte); }, [tab]);
  // Versione 236: avviso «occorre ricalcolare i costi» quando dopo l'ultimo calcolo salvato sono
  // cambiati dati che entrano nei costi (fatture, costi diretti, cespiti, animali…)
  const [avvisoCalcoli, setAvvisoCalcoli] = useState(null);
  useEffect(() => { statoCalcoli().then(st => setAvvisoCalcoli(testoAvvisoCalcoli(st))).catch(() => setAvvisoCalcoli(null)); }, [tab]);
  const AVVISI = { "cart-fatture": anomalieAperte || 0, "sub-dati-controllo": anomalieAperte || 0, "registro-controlli": anomalieAperte || 0, "cart-emissione-fatture": daFatturare + allarmiAttiva, "sub-fatturazione-animali": daFatturare, "fatt-animali-da-fatturare": daFatturare, "fatt-animali-prepara": daFatturare, "sub-controllo-attiva": allarmiAttiva, "controllo-attiva": allarmiAttiva };

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
          <div style={{ fontSize: 12, opacity: 0.8 }}>Podere Verde · versione 301</div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <span title={utente?.email}>👤 {utente?.email}</span>
            <button onClick={esci} style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.5)", borderRadius: 6, fontSize: 10.5, padding: "1px 6px", cursor: "pointer" }}>Esci</button>
          </div>
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
                <Avviso n={AVVISI[m.id]} />
                <span style={{ marginLeft: AVVISI[m.id] ? 6 : "auto", fontSize: 11, opacity: 0.7 }}>{cartelleAperte.has(m.id) ? "▾" : "▸"}</span>
              </button>
              {cartelleAperte.has(m.id) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginLeft: 14, borderLeft: "1.5px solid rgba(255,255,255,0.25)", paddingLeft: 6 }}>
                  {m.contenuto.map(c => c.tipo === "voce" ? (
                    <VoceMenuBottone key={c.id} v={c} attiva={tab === c.id} onClick={() => vaiA(c.id)} piccola avviso={AVVISI[c.id]} />
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
                        <Avviso n={AVVISI[c.id]} />
                        <span style={{ marginLeft: AVVISI[c.id] ? 6 : "auto", fontSize: 10, opacity: 0.7 }}>{cartelleAperte.has(c.id) ? "▾" : "▸"}</span>
                      </button>
                      {cartelleAperte.has(c.id) && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginLeft: 14, borderLeft: "1.5px solid rgba(255,255,255,0.2)", paddingLeft: 6 }}>
                          {c.voci.map(v => (
                            <VoceMenuBottone key={v.id} v={v} attiva={tab === v.id} onClick={() => vaiA(v.id)} piccola avviso={AVVISI[v.id]} />
                          ))}
                          {c.voci.length === 0 && (
                            <div style={{ color: "#fff", opacity: 0.6, fontSize: 11.5, padding: "6px 10px", fontStyle: "italic" }}>Pagine in preparazione</div>
                          )}
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

      <main style={{ flex: 1, minWidth: 0 }}>
        {anomalieAperte > 0 && tab !== "registro-controlli" && (
          <div onClick={() => vaiA("registro-controlli")}
            style={{ background: "#C0392B", color: "#fff", padding: "10px 20px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            ⚠️ {anomalieAperte === 1 ? "C'è 1 anomalia" : `Ci sono ${anomalieAperte} anomalie`} nei registri da decidere.
            <span style={{ textDecoration: "underline", fontWeight: 800 }}>Vai al Registro Controlli →</span>
          </div>
        )}
        {avvisoCalcoli && tab !== "costi" && (
          <div onClick={() => vaiA("costi")}
            style={{ background: "#FFF1DC", borderBottom: "2px solid #D4880F", color: "#7A4A00", padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            🔄 {avvisoCalcoli}
            <span style={{ textDecoration: "underline", fontWeight: 800 }}>Vai al Report Costi →</span>
          </div>
        )}
        {anomalieAperte === null && !controlloInCorso && (
          <div style={{ background: "#FFF4D6", borderBottom: "2px solid #D4A017", color: "#6B5200", padding: "8px 20px", fontSize: 13 }}>
            ⚠️ I controlli dei registri non sono disponibili: il database non ha ancora le strutture della versione 232 (file contabilita_strutture_v232.sql).
          </div>
        )}
        {daFatturare > 0 && tab !== "fatt-animali-da-fatturare" && tab !== "fatt-animali-prepara" && (
          <div onClick={() => vaiA("fatt-animali-da-fatturare")}
            style={{ background: "#FBE1DE", borderBottom: "2px solid #C0392B", color: "#8B1E14", padding: "10px 20px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            🔔 {daFatturare === 1 ? "C'è 1 capo uscito" : `Ci sono ${daFatturare} capi usciti`} dall'allevamento da fatturare.
            <span style={{ textDecoration: "underline", fontWeight: 800 }}>Vai alle uscite da fatturare →</span>
          </div>
        )}        {allarmiAttiva > 0 && tab !== "controllo-attiva" && tab !== "lettura-aruba" && (
          <div onClick={() => vaiA("controllo-attiva")}
            style={{ background: "#FBE1DE", borderBottom: "2px solid #C0392B", color: "#8B1E14", padding: "10px 20px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            🧾 {allarmiAttiva === 1 ? "C'è 1 fattura di vendita da controllare" : `Ci sono ${allarmiAttiva} fatture di vendita da controllare`} (non trovate in Aruba, scartate o con differenze).
            <span style={{ textDecoration: "underline", fontWeight: 800 }}>Vai ai controlli →</span>
          </div>
        )}
        {tab === "dashboard" && <Dashboard onNavigate={vaiA} />}
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
        {tab === "grafico-macellazioni" && <GraficoMacellazioni />}
        {tab === "prezzo-pareggio" && <PrezzoPareggio />}
        {tab === "break-even" && <BreakEven base="carcassa" onNavigate={vaiA} />}
        {tab === "break-even-vivo" && <BreakEven base="vivo" onNavigate={vaiA} />}
        {tab === "muratella-costi" && <ContabilitaMuratella />}
        {tab === "riepilogo-costi-breakeven" && <RiepilogoCostiBreakEven onNavigate={vaiA} />}
        {tab === "scheda" && <SchedaAnimale ricercaIniziale={ricercaSchedaAnimale} onRicercaConsumata={() => setRicercaSchedaAnimale(null)} />}
        {tab === "riproduttori" && <ReportRiproduttori />}
        {tab === "performanceeta" && <PerformanceEta onNavigate={vaiA} />}
        {tab === "performanceeta-maschi" && <PerformanceEtaMaschi onNavigate={vaiA} />}
        {tab === "performanceeta-femmine" && <PerformanceEtaFemmine onNavigate={vaiA} />}
        {tab === "storico-performanceeta" && <StoricoPerformanceEta />}
        {tab === "articoliprezzi" && <ArticoliPrezzi />}
        {tab === "variazione-prezzi" && <VariazionePrezzi onNavigate={vaiA} />}
        {tab === "famiglie-prodotto" && <FamiglieProdotto />}
        {tab === "costidiretti" && <CostiDiretti />}
        {tab === "anomalie" && <ControlloAnomalie />}
        {tab === "armonizza" && <DaArmonizzare />}
        {tab === "acc-bovini-alimenti" && <AccrescimentoCostiPagina />}
        {tab === "razioni-suini-composizione" && <RazioniSuiniComposizione />}
        {tab === "razioni-suini-consumi" && <RazioniSuiniConsumi />}
        {tab === "costruisci-razione" && <CostruisciRazione onNavigate={vaiA} />}
        {tab === "razioni-bovini-riferimento" && <RazioniRiferimento onNavigate={vaiA} />}
        {tab === "razioni-bovini-report" && <ReportFabbisogniBovini onNavigate={vaiA} />}
        {tab === "istr-alimentaria" && <IstruzioniAlimentaria />}
        {tab === "controlla-prezzi" && <ControllaPrezzi onNavigate={vaiA} />}
        {tab === "chiedi-preventivi" && <ChiediPreventivi />}
        {tab === "preventivi-ricevuti" && <PreventiviRicevuti />}
        {tab === "prompt-estrazione-pdf" && <PromptEstrazionePDF />}
        {tab === "prompt-carico-aruba" && <PromptCaricoAruba />}
        {tab === "prompt-aruba-emesse" && <PromptFattureEmesseAruba />}
        {tab === "lettura-aruba" && <LetturaAruba onNavigate={vaiA} />}
        {tab === "controllo-attiva" && <ControlloFatturazioneAttiva onNavigate={vaiA} />}
        {tab === "elenco-attive" && <ElencoFattureAttive />}
        {tab === "numero-progressivo" && <NumeroProgressivo />}
        {tab === "prompt-cedolini" && <PromptCedolini />}
        {tab === "carica-costi-lavoro" && <CaricaCostiLavoro />}
        {tab === "consulta-costi-lavoro" && <ConsultaCostiLavoro />}
        {tab === "inserimento-manuale" && <InserimentoManualeFattura />}
        {tab === "verifica-fatture-mancanti" && <VerificaFattureMancanti />}
        {tab === "verifica-righe-mancanti" && <VerificaRigheMancanti />}
        {tab === "costi-quantita-alimentare" && <ReportCostiQuantitaAlimentare />}
        {tab === "import-massivo-riproduttori" && <ImportMassivoRiproduttori />}
        {tab === "riepilogo-costo-animali" && <RiepilogoCostoAnimali />}
        {tab === "istr-fatture" && <DocumentoIstruzioni doc={ISTRUZIONI_CARICA_FATTURE} />}
        {tab === "piano-dei-conti" && <DocumentoIstruzioni doc={PIANO_DEI_CONTI} />}
        {tab === "istr-costi-diretti" && <DocumentoIstruzioni doc={ISTRUZIONI_COSTI_DIRETTI} />}
        {tab === "istr-costi-lavoro" && <DocumentoIstruzioni doc={ISTRUZIONI_COSTI_LAVORO} />}
        {tab === "istr-sistema-dati" && <DocumentoIstruzioni doc={ISTRUZIONI_SISTEMA_DATI} />}
        {tab === "istr-verifica" && <DocumentoIstruzioni doc={ISTRUZIONI_VERIFICA} />}
        {tab === "carica-pdf-fatture" && <CaricaPdfFatture />}
        {tab === "istr-ricerca" && <IstruzioniAnagrafiche />}
        {tab === "istr-prezzi-acquisto" && <IstruzioniPrezziAcquisto />}
        {tab === "istr-animali" && <IstruzioniAnimali />}
        {tab === "istr-costi" && <IstruzioniCosti />}
        {tab === "istr-break-even" && <IstruzioniBreakEven />}
        {tab === "istr-report-analisi" && <IstruzioniReportAnalisi />}
        {tab === "analisi-suini" && <ReportAnalisi key="suino" specie="suino" />}
        {tab === "analisi-bovini" && <ReportAnalisi key="bovino" specie="bovino" />}
        {tab === "analisi-ovini" && <ReportAnalisi key="ovino" specie="ovino" />}
        {tab === "analisi-coltivazioni" && <ReportAnalisiColtivazioni />}
        {tab === "istr-studi" && <IstruzioniStudi />}
        {tab === "istr-coltivazioni" && <IstruzioniColtivazioni />}
        {tab === "istr-modelli4" && <IstruzioniModelli4 />}
        {tab === "istr-emissione-fatture" && <IstruzioniEmissioneFatture />}
        {tab === "istr-fatturazione-animali" && <DocumentoIstruzioni doc={ISTRUZIONI_FATTURAZIONE_ANIMALI} />}
        {tab === "istr-altre-fatture" && <DocumentoIstruzioni doc={ISTRUZIONI_ALTRE_FATTURE} />}
        {tab === "istr-controllo-attiva" && <DocumentoIstruzioni doc={ISTRUZIONI_CONTROLLO_ATTIVA} />}
        {tab === "fatt-animali-da-fatturare" && <UsciteDaFatturare onNavigate={vaiA} />}
        {tab === "fatt-animali-prepara" && <PreparaFatture onNavigate={vaiA} />}
        {tab === "fatt-animali-emesse" && <FattureEmesse tipo="animali_allevamento" />}
        {tab === "altre-nuova" && <NuovaFatturaLibera onNavigate={vaiA} />}
        {tab === "altre-emesse" && <FattureEmesse tipo="altre_fatturazioni" />}
        {tab === "fatture-competenza" && <FattureCompetenza />}
        {tab === "modelli4-elenco" && <Modelli4 />}
        {tab === "modelli4-altri" && <AltriDocumentiCortesi />}
        {tab === "colt-fatture-elenco" && <FattureColtivazioneElenco />}
        {tab === "colt-fatture-riepilogo" && <FattureColtivazioneRiepilogo />}
        {tab === "colt-schede-campi" && <ColtSchedeCampi />}
        {tab === "colt-rese-stagioni" && <ColtReseStagioni />}
        {tab === "colt-grafici" && <ColtGrafici />}
        {tab === "colt-classifiche" && <ColtClassifiche />}
        {tab === "colt-registro-lavori" && <ColtRegistroLavori />}
        {tab === "colt-piano" && <ColtPianoCampagna />}
        {tab === "colt-archivio-report" && <ColtArchivioReport />}
        {tab === "ricerca" && <Ricerca />}
        {tab === "glossario" && <Glossario />}
        {tab === "parametri" && <Parametri />}
        {tab === "istr-controlli" && <DocumentoIstruzioni doc={ISTRUZIONI_CONTROLLI} />}
        {tab === "registro-controlli" && <RegistroControlli onCambiaAperte={setAnomalieAperte} />}
        {tab === "abbinamenti-fatture" && <AbbinamentiFatture />}
        {tab === "istr-registro-modifiche" && <DocumentoIstruzioni doc={ISTRUZIONI_REGISTRO_MODIFICHE} />}
        {tab === "registro-modifiche" && <RegistroModifiche />}
      </main>
    </div>
  );
}
