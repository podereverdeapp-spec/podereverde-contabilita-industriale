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
import QuandoMacellare from "./QuandoMacellare";
import BreakEven from "./BreakEven";
import ContabilitaMuratella from "./ContabilitaMuratella";
import FotografiaDati from "./FotografiaDati";
import StruttureNecessarie from "./StruttureNecessarie";
import NatiOComprati from "./NatiOComprati";
import AnomalieInterventi from "./AnomalieInterventi";
import FotografieControllo from "./FotografieControllo";
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
import ControlloRazioniSpecie from "./ControlloRazioniSpecie";
import ControlloPollame from "./ControlloPollame";
import RiepilogoControlloRazioni from "./RiepilogoControlloRazioni";
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
import VenditePerAnno from "./VenditePerAnno";
import { contaAllarmiFatturazione } from "./calcoloAruba";
import PromptCedolini from "./PromptCedolini";
// Versione 347 (04/11/2026): «Scadenzari Clienti e Fornitori» nella cartella «Ricerca: Fatture e Anagrafiche» — posizione di ogni cliente e fornitore, scadenze dagli XML, pagamenti e incassi dagli estratti conto BPER abbinati alle fatture, dilazione concessa, dilazione media reale e ritardo; PDF delle fatture e PDF delle distinte dei pagamenti (archivio «distinte»); compensazioni (note di credito e tra cliente e fornitore con la stessa partita IVA, lettera di proposta nel Registro delle Comunicazioni «da inviare», accettazione, «Togli»).
import ScadenzariClientiFornitori from "./ScadenzariClientiFornitori";
// Versione 352 (10/11/2026): cartella «Banche, carte e cassa» (progetto della prima nota, sezione 10-bis); prima pagina «Conti: stato e controlli»
import BancheConti from "./BancheConti";
import CaricaDocumentiBanca from "./CaricaDocumentiBanca";
import ConsultaEstratti from "./ConsultaEstratti";
import ConfermaMovimenti from "./ConfermaMovimenti";
import PrimaNota from "./PrimaNota";
import GestioneIncassiPagamenti from "./GestioneIncassiPagamenti";
import AnticipiFornitori, { contaAnticipiDaGuardare } from "./AnticipiFornitori"; // versione 370
import { ISTRUZIONI_BANCHE, ISTRUZIONI_INCASSI_PAGAMENTI, ISTRUZIONI_PRIMA_NOTA } from "./istruzioniBancheIncassiPrimaNota";
// Versione 346 (03/11/2026): posta del programma — le mail ai clienti e ai fornitori partono da podereverdeapp@gmail.com attraverso il postino (funzione spedisci-mail), con intestazione, logo, firma modificabile e piè di pagina di legge; permesso «Può spedire mail dal programma» nella cartella Accessi; le mail della casella entrano da sole nel Registro delle Comunicazioni (cassetta comunicazioni-ricevi, ritiro ogni 5 minuti); «Togli dal registro» (recuperabile) e «Blocca mittente».
// Versione 363 (11/11/2026): avvisi in alto «F24 da pagare» e «F24 da caricare» (cartella FISCALE controllata in sola lettura), con i tasti per «F24 arrivati» e «Consulta F24».
// Versione 362 (11/11/2026): «Consulta F24» nel menu «4. Carica F24» — tutti gli F24 con stato, come e quando sono stati pagati, F24, quietanza e pagina dell'estratto conto.
// Versione 345 (02/11/2026): pagina F24 arrivati — un'archiviazione sola alla volta; un file esce da DA SMISTARE solo se è identico a un file dell'ARCHIVIO (altrimenti prima si conserva intero in ORIGINALI RICEVUTI); scrittura riprovata sul disco di rete.
// Versione 344 (02/11/2026): pagina F24 arrivati — «Archivia» archivia le righe a posto e lascia in sospeso le rosse con i loro file; la quietanza senza F24 ha il nome «F24 <data del pagamento>.pdf».
// Versione 343 (02/11/2026): pagina F24 arrivati provata sullo stato vero — prompt di lettura versione 3 (file indicati con il percorso dentro DA SMISTARE);
//   un F24 già nel programma resta com'è (righe e campi già scritti) e si riconosce anche se trascritto con punteggiatura diversa;
//   un file ricevuto archiviato solo in parte si conserva intero in ORIGINALI RICEVUTI; lo stesso F24 due volte nella lettura entra una volta sola;
//   il riquadro «F24 già nel programma» mostra solo gli F24 entrati prima della pagina nuova.
// Versione 342 (31/10/2026): nella pagina F24 arrivati la scatola «F24 già nel programma da mettere nell'archivio nuovo» (PDF del programma, senza rileggere).
// Versione 341 (31/10/2026): il nome provvisorio dei file non comincia più con «~» (Chrome non lo accetta sul disco: «Name is not allowed»); controllo dei nomi prima di scrivere.
// Versione 340 (31/10/2026): «Prepara la cartella F24» si può ripetere senza errore (usa il codice già nel programma) e la scrittura dei file riprova la rilettura sul disco di rete.
// Versione 339 (ordine del Dott. Bizzarri del 31/10/2026): la pagina «F24 arrivati: controlla e archivia» prende il posto dei prompt
// di smistamento e di carico e della pagina «Carica F24» (i loro file restano, ma non sono più nel menu).
import F24Arrivati from "./F24Arrivati";
import ConsultaF24 from "./ConsultaF24"; // Versione 362
import { useAvvisiF24, StrisciaAvvisiF24 } from "./AvvisiF24"; // Versione 363
import DocumentiArrivati from "./DocumentiArrivati"; // versione 355
import { ISTRUZIONI_DOCUMENTI_ARRIVATI } from "./istruzioniDocumentiArrivati"; // versione 356
import { ISTRUZIONI_F24_ARRIVATI } from "./istruzioniF24Arrivati";
// Versione 337: la cartella «Accessi» (chi entra nel programma e in quali parti)
import PaginaAccessi, { IstruzioniAccessi } from "./PaginaAccessi";
import { filtraMenu, pagineDelMenu, puoVedereParte } from "./accessiParti";
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
import ReportBreakEven from "./ReportBreakEven";
import AlimentiSenzaComposizione from "./AlimentiSenzaComposizione"; // versione 320
import { contaAlimentiSenzaComposizione } from "./calcoloAlimentiSenzaComposizione";
import OviniDaVerificare from "./OviniDaVerificare"; // versione 323
import { contaVerificheAnimali } from "./calcoloVerificheAnimali";
import { ISTRUZIONI_CARICA_FATTURE, PIANO_DEI_CONTI, ISTRUZIONI_COSTI_DIRETTI, ISTRUZIONI_COSTI_LAVORO, ISTRUZIONI_SISTEMA_DATI, ISTRUZIONI_VERIFICA, ISTRUZIONI_REGISTRO_MODIFICHE, ISTRUZIONI_CONTROLLI, ISTRUZIONI_FATTURAZIONE_ANIMALI, ISTRUZIONI_ALTRE_FATTURE, ISTRUZIONI_CONTROLLO_ATTIVA, ISTRUZIONI_RICERCA_ANAGRAFICHE, ISTRUZIONI_RIEPILOGO_CARICA_DATI, ISTRUZIONI_GENERALI_EMISSIONE, ISTRUZIONI_FATTURE_COMPETENZA, ISTRUZIONI_REPORT_COSTI, ISTRUZIONI_QUANDO_MACELLARE, ISTRUZIONI_BREAK_EVEN, ISTRUZIONI_CESPITI, ISTRUZIONI_GENERALI_ANALISI_COSTI, ISTRUZIONI_GENERALI_F24, ISTRUZIONI_PROMPT_SMISTAMENTO_F24, ISTRUZIONI_PROMPT_CARICO_F24 } from "./istruzioniDati";
// Versione 305: le istruzioni della cartella «Ricerca: Fatture e Anagrafiche» sono il documento Word (ISTRUZIONI_RICERCA_ANAGRAFICHE)
import IstruzioniPrezziAcquisto from "./IstruzioniPrezziAcquisto";
import IstruzioniAnimali from "./IstruzioniAnimali";
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
import Modelli4Chiusure from "./Modelli4Chiusure"; // versione 349
import { contaModelli4Aperti } from "./anomalieEsterne"; // versione 349
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
import RegistroComunicazioni from "./RegistroComunicazioni";
import Posta, { contaPostaDaAprire } from "./Posta"; // versione 364
import CompletaAnagraficheAruba from "./CompletaAnagraficheAruba";
import Parametri from "./Parametri";
import Glossario from "./Glossario";
import ReportAcquistoAnimali from "./ReportAcquistoAnimali";
import RegistroControlli from "./RegistroControlli";
import AbbinamentiFatture from "./AbbinamentiFatture";
import RegistroModifiche from "./RegistroModifiche";
// Versione 295: le Istruzioni dei Controlli vengono dal Word «Istruzioni_Controllo_finale_v295» (IstruzioniControlli.jsx non è più usata)
import AccessoProgramma, { useSessione, esci, useAccesso, SchermataAttesa } from "./AccessoProgramma";
import { eseguiControlli, contaAnomalieAperte } from "./controlliRegistri";
import { statoCalcoli, testoAvvisoCalcoli } from "./statoCalcoli";
import { C, FONT } from "./style";
import { supabase } from "./supabase"; // versione 337: conteggio delle richieste di accesso

const MENU = [
  { tipo: "voce", id: "dashboard", label: "Dashboard", icon: "📊" },
  // Versione 364 (ordine del Dott. Bizzarri dell'11/11/2026 ore 13:09–13:19): la Posta della casella podereverdeapp, con il numero delle mail da aprire
  { tipo: "cartella", id: "cart-posta", label: "Posta", icon: "📬", contenuto: [
    { tipo: "voce", id: "posta", label: "Posta in arrivo e inviata", icon: "✉️" },
  ]},
  // Versione 239: Report di Analisi (cosa va, cosa non va, cause e interventi), richiesti il 09/10/2026
  { tipo: "cartella", id: "cart-report-analisi", label: "Report di Analisi", icon: "🧭", contenuto: [
    { tipo: "voce", id: "istr-report-analisi", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "analisi-suini", label: "Suini", icon: "🐖" },
    { tipo: "voce", id: "analisi-bovini", label: "Bovini", icon: "🐄" },
    { tipo: "voce", id: "analisi-ovini", label: "Ovini", icon: "🐑" },
    { tipo: "voce", id: "analisi-break-even", label: "Break Even", icon: "⚖️" }, // versione 316 (27/10/2026)
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
    // Versione 307 (richiesta del Dott. Bizzarri del 26/10/2026): in cima, prima del Piano dei Conti, le Istruzioni Generali
    // con il riepilogo delle sezioni e il rinvio alle istruzioni di ciascuna.
    { tipo: "voce", id: "istr-carica-dati", label: "Istruzioni Generali", icon: "📖" },
    { tipo: "voce", id: "piano-dei-conti", label: "Piano dei Conti", icon: "📖" },
    { tipo: "sottocartella", id: "sub-dati-fatture-passive", label: "1. Carica Fatture Passive", icon: "📥", voci: [
      // Versione 358 (giudizio del Dott. Bizzarri del 10/11/2026 ore 20:18: «bisogna riorganizzare 1. carica fatture passive»):
      // in cima le istruzioni e la pagina del carico da Aruba; poi l'inserimento manuale; in fondo, in ordine, le tre pagine delle fatture di carta.
      // Esce dal menu «Prompt per carico da Aruba»: lo scarico da Aruba ora lo legge la pagina «Carica le fatture da Aruba».
      { id: "istr-documenti-arrivati", label: "Istruzioni", icon: "📖" },
      { id: "documenti-arrivati", label: "Carica le fatture da Aruba", icon: "📬" },
      { id: "inserimento-manuale", label: "Inserimento Manuale Fattura", icon: "✍️" },
      { id: "istr-fatture", label: "Fatture di carta: istruzioni", icon: "📖" },
      { id: "prompt-estrazione-pdf", label: "Fatture di carta: 1. prompt di lettura", icon: "🤖" },
      { id: "carica", label: "Fatture di carta: 2. carica l'Excel", icon: "📥" },
      { id: "carica-pdf-fatture", label: "Fatture di carta: 3. carica i PDF", icon: "📎" },
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
    // Versione 326 (ordine del Dott. Bizzarri del 29/10/2026 ore 20:59): la sottocartella degli F24, con dentro la
    // sotto-sottocartella «Smistamento e Carico nel cloud» (terzo livello del menu); le cartelle seguenti passano da 4–6 a 5–7.
    // Da aggiungere: Istruzioni Generali F24 (in cima), Istruzioni Smistamento e Carico (con immagini), Carica F24, Ricerca F24.
    { tipo: "sottocartella", id: "sub-dati-f24", label: "4. Carica F24", icon: "🧾", voci: [
      // Versione 339 (ordine del Dott. Bizzarri del 31/10/2026): al posto delle due sottocartelle «Smistamento nel cloud» e
      // «Carico nel programma», le istruzioni nuove e la pagina che legge, controlla e archivia (cloud e programma).
      { id: "istr-generali-f24", label: "Istruzioni Generali", icon: "📖" },
      { id: "f24-arrivati", label: "F24 arrivati: controlla e archivia", icon: "🧾" },
      // Versione 362 (ordini del Dott. Bizzarri dell'11/11/2026 ore 12:52 e 13:07): consultazione degli F24, con come e quando sono stati pagati e le prove
      { id: "consulta-f24", label: "Consulta F24", icon: "🔍" },
    ]},
    // Versione 289: le istruzioni, dal Word approvato dal Dott. Bizzarri il 23/10/2026.
    { tipo: "sottocartella", id: "sub-dati-sistema", label: "5. Sistema i dati caricati", icon: "🧹", voci: [
      { id: "istr-sistema-dati", label: "Istruzioni Sistema i dati caricati", icon: "📖" },
      { id: "armonizza", label: "Armonizzare Unità Misura Fatture", icon: "⚖️" },
      { id: "abbinamenti-fatture", label: "Abbinamenti Fatture Acquisto", icon: "🔗" },
    ]},
    // Versione 291: le istruzioni, dal Word approvato dal Dott. Bizzarri il 24/10/2026.
    { tipo: "sottocartella", id: "sub-dati-verifica", label: "6. Verifica che non manchi niente", icon: "🔍", voci: [
      { id: "istr-verifica", label: "Istruzioni Verifica che non manchi niente", icon: "📖" },
      { id: "verifica-fatture-mancanti", label: "Verifica Fatture Mancanti", icon: "🔍" }, // versione 348: pagina riscritta (foglio, fatture raggruppate, numero + data + partita IVA)
      { id: "verifica-righe-mancanti", label: "Verifica Righe Mancanti", icon: "🔎" },
      { id: "anomalie", label: "Fatture Incomplete", icon: "🧾" },
      { id: "passive", label: "Fatture Passive", icon: "📄" },
    ]},
    { tipo: "sottocartella", id: "sub-dati-controllo", label: "7. Controllo finale", icon: "🛡️", voci: [
      { id: "istr-controlli", label: "Istruzioni dei Controlli", icon: "📖" },
      { id: "registro-controlli", label: "Registro Controlli", icon: "🛡️" },
    ]},
  ]},
  // Versione 297 (decisione del Dott. Bizzarri del 26/10/2026): «Emissione Fatture» diventa «Emissione Fatture di Vendita»;
  // subito dopo le Istruzioni la sottocartella «Fatturazione Automatica Vendita Animali da Allevamento», con le sue Istruzioni.
  { tipo: "cartella", id: "cart-emissione-fatture", label: "Emissione Fatture di Vendita", icon: "🧾", contenuto: [
    // Versione 307 (decisione del Dott. Bizzarri del 26/10/2026, ore 18:32): «Istruzioni» diventa «Istruzioni Generali», riepilogo delle
    // sottocartelle con il rinvio alle istruzioni di ciascuna; la sottocartella «Fatture da Ricevere e da Emettere» ha le sue Istruzioni.
    { tipo: "voce", id: "istr-emissione-fatture", label: "Istruzioni Generali", icon: "📖" },
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
      // Versione 303 (decisione del Dott. Bizzarri del 26/10/2026, ore 15:27): seconda pagina dell'elenco, anno per anno in quattro colonne
      { id: "vendite-per-anno", label: "Vendite per Anno e per Tipo", icon: "📊" },
      { id: "numero-progressivo", label: "Numero Progressivo", icon: "🔢" },
    ] },
    { tipo: "sottocartella", id: "sub-fatture-competenza", label: "Fatture da Ricevere e da Emettere", icon: "🗂️", voci: [
      { id: "istr-fatture-competenza", label: "Istruzioni", icon: "📖" },
      { id: "fatture-competenza", label: "Rapporti con Muratella", icon: "🏛️" },
    ] },
  ]},
  { tipo: "cartella", id: "cart-ricerca", label: "Ricerca: Fatture e Anagrafiche", icon: "🔎", contenuto: [
    { tipo: "voce", id: "istr-ricerca", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "ricerca", label: "Ricerca Fatture", icon: "🔎" },
    { tipo: "voce", id: "scadenzari", label: "Scadenzari Clienti e Fornitori", icon: "📅" }, // versione 347
    // Versione 304 (decisioni del Dott. Bizzarri del 26/10/2026): anagrafiche modificabili, Registro delle Comunicazioni,
    // completamento delle anagrafiche dai file di Aruba
    { tipo: "voce", id: "fornitori", label: "Fornitori", icon: "🏢" },
    { tipo: "voce", id: "clienti", label: "Clienti", icon: "🤝" },
    { tipo: "voce", id: "registro-comunicazioni", label: "Registro delle Comunicazioni", icon: "✉️" },
    { tipo: "voce", id: "completa-anagrafiche", label: "Completa le Anagrafiche da Aruba", icon: "🧾" },
  ]},
  // Versione 352 (decisioni del Dott. Bizzarri del 09/11/2026 ore 21:13–21:14 e del 10/11/2026): la sezione «Banche, carte e cassa».
  // Prima pagina: i conti con «Controllo … ok alla data …», «Quadratura con prima nota ok alla data …», periodi mancanti e partenza.
  { tipo: "cartella", id: "cart-banche", label: "Banche, carte e cassa", icon: "🏦", contenuto: [
    { tipo: "voce", id: "istr-banche", label: "Istruzioni", icon: "📖" }, // versione 357
    { tipo: "voce", id: "banche-conti", label: "Conti: stato e controlli", icon: "🏦" },
    { tipo: "voce", id: "banche-carica", label: "Carica documenti della banca", icon: "📥" },
    { tipo: "voce", id: "banche-consulta", label: "Estratti e movimenti: consulta", icon: "🔎" },
    { tipo: "voce", id: "banche-conferma", label: "Conferma dei movimenti", icon: "✅" }, // versione 354
  ]},
  // Versione 357 (10/11/2026): Gestione incassi e pagamenti, il motore che scrive la prima nota (progetto della prima nota, sezioni 2, 3, 5, 6, 10)
  { tipo: "cartella", id: "cart-incassi-pagamenti", label: "Gestione incassi e pagamenti", icon: "💶", contenuto: [
    { tipo: "voce", id: "istr-incassi-pagamenti", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "incassi-pagamenti", label: "Incassi e pagamenti", icon: "💶" },
    { tipo: "voce", id: "anticipi-fornitori", label: "Anticipi in attesa di fattura", icon: "⏳" }, // versione 370
  ]},
  // Versione 354 (10/11/2026): la prima nota (progetto della prima nota, sezioni 3, 4.1, 8 e 9)
  { tipo: "cartella", id: "cart-prima-nota", label: "Prima nota", icon: "📒", contenuto: [
    { tipo: "voce", id: "istr-prima-nota", label: "Istruzioni", icon: "📖" }, // versione 357
    { tipo: "voce", id: "prima-nota", label: "Prima nota", icon: "📒" },
  ]},
  { tipo: "cartella", id: "cart-costi", label: "Analisi Costi", icon: "📊", contenuto: [
    { tipo: "voce", id: "istr-costi", label: "Istruzioni Generali", icon: "📖" }, // versione 319 (28/10/2026): riepilogo delle sottocartelle
    // Versione 311 (decisione del Dott. Bizzarri del 27/10/2026 ore 09:10): la cartella è divisa in quattro sottocartelle
    // Versione 308 (richiesta del Dott. Bizzarri del 26/10/2026 ore 19:45): prima del Report Costi le sue istruzioni
    { tipo: "sottocartella", id: "sub-costi-report", label: "Report Costi", icon: "📊", voci: [
      { id: "istr-report-costi", label: "Istruzioni Report Costi", icon: "📖" },
      { id: "costi", label: "Report Costi", icon: "📊" },
    ] },
    // Versione 309 (decisione del Dott. Bizzarri del 26/10/2026 ore 20:26): «Grafico per le Macellazioni» diventa «Quando macellare»
    // Versione 309 (richiesta del Dott. Bizzarri del 26/10/2026 ore 21:17): prima di «Quando macellare» le sue istruzioni
    { tipo: "sottocartella", id: "sub-costi-macellare", label: "Quando macellare", icon: "📈", voci: [
      { id: "istr-quando-macellare", label: "Istruzioni Quando macellare", icon: "📖" },
      { id: "grafico-macellazioni", label: "Quando macellare", icon: "📈" },
    ] },
    // Versione 314 (decisioni del Dott. Bizzarri del 27/10/2026): la sottocartella rifatta in 8 pagine; le pagine 3–8
    // leggono la stessa fotografia dei dati e le stesse leve (stato condiviso in statoBreakEven.js)
    { tipo: "sottocartella", id: "sub-costi-break-even", label: "Analisi Break Even", icon: "⚖️", voci: [
      { id: "istr-break-even", label: "Istruzioni del Break Even", icon: "📖" },
      { id: "prezzo-pareggio", label: "Prezzo di Pareggio", icon: "🎯" },
      { id: "be-fotografia-dati", label: "Fotografia dei dati", icon: "📋" },
      { id: "break-even", label: "Break Even", icon: "⚖️" },
      { id: "be-strutture", label: "Strutture necessarie", icon: "🏠" },
      { id: "be-nati-comprati", label: "Nati o comprati", icon: "🐄" },
      { id: "be-anomalie", label: "Anomalie e interventi", icon: "🚩" },
      { id: "be-fotografie", label: "Fotografie e controllo", icon: "📸" },
    ] },
    { tipo: "sottocartella", id: "sub-costi-cespiti", label: "Libro Cespiti", icon: "🏗️", voci: [
      { id: "istr-cespiti", label: "Istruzioni del Libro Cespiti", icon: "📖" }, // versione 317 (28/10/2026)
      { id: "cespiti", label: "Cespiti", icon: "🏗️" },
    ] },
  ]},
  { tipo: "cartella", id: "cart-alimentaria", label: "Alimentaria", icon: "🌾", contenuto: [
    { tipo: "voce", id: "istr-alimentaria", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "costi-quantita-alimentare", label: "Costi e Quantità", icon: "📊" },
    { tipo: "voce", id: "alimenti-senza-composizione", label: "Alimenti senza composizione", icon: "⚠️" }, // versione 320 (28/10/2026)
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
    { tipo: "sottocartella", id: "sub-controllo-razioni", label: "Razioni attive e Controllo costi", icon: "⚖️", voci: [ // versione 325 (29/10/2026)
      { id: "controllo-bovini", label: "Bovini", icon: "🐄" },
      { id: "controllo-suini", label: "Suini", icon: "🐖" },
      { id: "controllo-ovini", label: "Ovini", icon: "🐑" },
      { id: "controllo-pollame", label: "Pollame", icon: "🐔" },
      { id: "controllo-riepilogo", label: "Riepilogo bovini, suini e ovini", icon: "📊" },
    ]},
  ]},
  { tipo: "cartella", id: "cart-animali", label: "Animali", icon: "🐄", contenuto: [
    { tipo: "voce", id: "istr-animali", label: "Istruzioni", icon: "📖" },
    { tipo: "voce", id: "verifiche-ovini", label: "Ovini da verificare con Sborchia", icon: "⚠️" }, // versione 323 (28/10/2026)
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
    { tipo: "voce", id: "modelli4-chiusure", label: "Modelli 4: chiusi e non chiusi", icon: "🚦" }, // versione 349
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
  // Versione 338 (ordine del Dott. Bizzarri del 31/10/2026 ore 14:40): «Accessi» (versione 337) e «Registro delle modifiche»
  // (versione 294) riuniti in una cartella con due sottocartelle. «Accessi» la vedono solo il Dott. Bizzarri e i gestori degli accessi.
  { tipo: "cartella", id: "cart-accessi-registro", label: "Accessi e Registro Modifiche", icon: "🔐", contenuto: [
    { tipo: "sottocartella", id: "sub-accessi", label: "Accessi", icon: "🔐", voci: [
      { id: "istr-accessi", label: "Istruzioni", icon: "📖" },
      { id: "accessi", label: "Chi entra nel programma", icon: "🔐" },
    ]},
    { tipo: "sottocartella", id: "sub-registro-modifiche", label: "Registro delle modifiche", icon: "🕓", voci: [
      { id: "istr-registro-modifiche", label: "Istruzioni", icon: "📖" },
      { id: "registro-modifiche", label: "Registro delle Modifiche", icon: "🕓" },
    ]},
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
      // Versione 326: terzo livello (sottocartella dentro una sottocartella)
      if (c.tipo === "sottocartella") for (const s of c.voci) {
        if (s.tipo === "sottocartella" && s.voci.some(v => v.id === pageId)) return { cartella: m.id, sottocartella: c.id, sottosottocartella: s.id };
      }
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
  return <ConAccesso key={sessione.user.id} utente={sessione.user} />;
}

// Versione 337: chi è entrato ma non è «Attivo» nella cartella «Accessi» vede solo la schermata d'attesa
function ConAccesso({ utente }) {
  const [accesso, ricarica] = useAccesso(utente);
  if (accesso.stato === "verifica") return <div style={{ fontFamily: FONT, padding: 40, color: C.muted }}>Verifica dell'accesso…</div>;
  if (accesso.stato !== "attivo") return <SchermataAttesa utente={utente} accesso={accesso} onRicontrolla={ricarica} />;
  return <Programma utente={utente} accesso={accesso} ricaricaAccesso={ricarica} />;
}

function Programma({ utente, accesso, ricaricaAccesso }) {
  // Versione 337: il menu mostra solo le parti date a questa persona; le altre pagine non si aprono
  const menuVisibile = filtraMenu(MENU, accesso);
  const pagineVisibili = pagineDelMenu(menuVisibile);
  const pagineDelProgramma = pagineDelMenu(MENU);
  const puo = (id) => pagineVisibili.has(id) || (!pagineDelProgramma.has(id) && (accesso.admin || accesso.tutto));
  const primaPagina = [...pagineVisibili][0] || null;
  const [tab, setTab] = useState(() => (pagineVisibili.has("dashboard") ? "dashboard" : primaPagina));
  const completo = accesso.admin || accesso.tutto;
  // Versione 337: richieste di accesso da decidere (solo per chi gestisce gli accessi)
  const [richiesteAccesso, setRichiesteAccesso] = useState(0);
  useEffect(() => {
    if (!accesso.gestore || accesso.senzaTabella) return;
    supabase.from("ci_accessi_programma").select("profilo_id", { count: "exact", head: true }).eq("stato", "In attesa")
      .then(({ count }) => setRichiesteAccesso(count || 0));
  }, [tab, accesso.gestore, accesso.senzaTabella]);
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
    // Versione 337: i controlli dei registri li fa partire solo chi vede tutto il programma (chi vede solo una parte li legge e basta)
    if (!completo) { contaAnomalieAperte().then(setAnomalieAperte).finally(() => setControlloInCorso(false)); return; }
    eseguiControlli("apertura del programma").then(e => setAnomalieAperte(e.aperte))
      .catch(() => contaAnomalieAperte().then(setAnomalieAperte))
      .finally(() => setControlloInCorso(false));
  }, []);
  useEffect(() => { if (!controlloInCorso) contaAnomalieAperte().then(setAnomalieAperte); }, [tab]);
  // Versione 236: avviso «occorre ricalcolare i costi» quando dopo l'ultimo calcolo salvato sono
  // cambiati dati che entrano nei costi (fatture, costi diretti, cespiti, animali…)
  const [avvisoCalcoli, setAvvisoCalcoli] = useState(null);
  useEffect(() => { statoCalcoli().then(st => setAvvisoCalcoli(testoAvvisoCalcoli(st))).catch(() => setAvvisoCalcoli(null)); }, [tab]);
  // Versione 320: alimenti acquistati senza composizione (avviso finché lo stato non è «Ricevuta»)
  const [senzaComposizione, setSenzaComposizione] = useState(0);
  useEffect(() => { contaAlimentiSenzaComposizione().then(setSenzaComposizione); }, [tab]);
  // Versione 323: punti degli ovini da verificare con Sborchia (avviso finché sono «Da verificare»)
  const [verificheAnimali, setVerificheAnimali] = useState(0);
  useEffect(() => { contaVerificheAnimali().then(setVerificheAnimali); }, [tab]);
  // Versione 349: modelli 4 non chiusi con la fattura (anomalie «M4» aperte, per colore)
  const [modelli4Aperti, setModelli4Aperti] = useState({ rosso: 0, arancione: 0, azzurro: 0, totale: 0 });
  useEffect(() => { contaModelli4Aperti().then(setModelli4Aperti); }, [tab]);
  // Versione 363: F24 da pagare (scaduti o entro 7 giorni) e F24 da caricare dalla cartella FISCALE, per chi ha la parte «4. Carica F24»
  const vedeF24 = puo("consulta-f24") || puo("f24-arrivati");
  const { avvisi: avvisiF24, numero: numeroF24 } = useAvvisiF24(vedeF24, tab);
  // Versione 364: mail ricevute che nessuno ha ancora aperto (all'apertura, a ogni cambio di pagina e ogni minuto)
  const [postaDaAprire, setPostaDaAprire] = useState(0);
  useEffect(() => {
    let attivo = true;
    const controlla = () => contaPostaDaAprire().then(n => { if (attivo) setPostaDaAprire(n); }).catch(() => {});
    controlla();
    const timer = setInterval(controlla, 60 * 1000);
    window.addEventListener("posta-cambiata", controlla);
    return () => { attivo = false; clearInterval(timer); window.removeEventListener("posta-cambiata", controlla); };
  }, [tab]);
  // Versione 370: anticipi su fattura da ricevere che chiedono un'azione (fattura arrivata da controllare, in ritardo, segnalazione)
  const [anticipiDaGuardare, setAnticipiDaGuardare] = useState(0);
  useEffect(() => { if (puo("anticipi-fornitori")) contaAnticipiDaGuardare().then(setAnticipiDaGuardare).catch(() => setAnticipiDaGuardare(0)); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const AVVISI = { "cart-incassi-pagamenti": anticipiDaGuardare, "anticipi-fornitori": anticipiDaGuardare, "cart-posta": postaDaAprire, "posta": postaDaAprire, "sub-dati-f24": numeroF24, "consulta-f24": numeroF24, "cart-modelli4": modelli4Aperti.totale, "modelli4-chiusure": modelli4Aperti.totale, "cart-animali": verificheAnimali, "verifiche-ovini": verificheAnimali, "cart-alimentaria": senzaComposizione, "alimenti-senza-composizione": senzaComposizione, "cart-fatture": (anomalieAperte || 0) + numeroF24, "sub-dati-controllo": anomalieAperte || 0, "registro-controlli": anomalieAperte || 0, "cart-emissione-fatture": daFatturare + allarmiAttiva, "sub-fatturazione-animali": daFatturare, "fatt-animali-da-fatturare": daFatturare, "fatt-animali-prepara": daFatturare, "sub-controllo-attiva": allarmiAttiva, "controllo-attiva": allarmiAttiva, "cart-accessi-registro": richiesteAccesso, "sub-accessi": richiesteAccesso, "accessi": richiesteAccesso };

  function vaiA(pageId) {
    if (!puo(pageId)) return; // versione 337: pagina non data a questa persona
    setTab(pageId);
    const posizione = cartellaDiPagina(pageId);
    if (posizione) {
      setCartelleAperte(prev => {
        const nuovo = new Set(prev).add(posizione.cartella);
        if (posizione.sottocartella) nuovo.add(posizione.sottocartella);
        if (posizione.sottosottocartella) nuovo.add(posizione.sottosottocartella);
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
          <div style={{ fontSize: 12, opacity: 0.8 }}>Podere Verde · versione 371</div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <span title={utente?.email}>👤 {utente?.email}</span>
            <button onClick={esci} style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.5)", borderRadius: 6, fontSize: 10.5, padding: "1px 6px", cursor: "pointer" }}>Esci</button>
          </div>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {menuVisibile.map(m => m.tipo === "voce" ? (
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
                          {c.voci.map(v => v.tipo === "sottocartella" ? (
                            <div key={v.id}>
                              <button
                                onClick={() => toggleCartella(v.id)}
                                style={{
                                  background: "transparent", color: "#fff", border: "none", borderRadius: 8,
                                  padding: "7px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                                  textAlign: "left", display: "flex", alignItems: "center", gap: 8, width: "100%", opacity: 0.9,
                                }}
                              >
                                <span>{cartelleAperte.has(v.id) ? "📂" : "📁"}</span> <span>{v.label}</span>
                                <Avviso n={AVVISI[v.id]} />
                                <span style={{ marginLeft: AVVISI[v.id] ? 6 : "auto", fontSize: 10, opacity: 0.7 }}>{cartelleAperte.has(v.id) ? "▾" : "▸"}</span>
                              </button>
                              {cartelleAperte.has(v.id) && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginLeft: 14, borderLeft: "1.5px solid rgba(255,255,255,0.15)", paddingLeft: 6 }}>
                                  {v.voci.map(w => (
                                    <VoceMenuBottone key={w.id} v={w} attiva={tab === w.id} onClick={() => vaiA(w.id)} piccola avviso={AVVISI[w.id]} />
                                  ))}
                                  {v.voci.length === 0 && (
                                    <div style={{ color: "#fff", opacity: 0.6, fontSize: 11.5, padding: "6px 10px", fontStyle: "italic" }}>Pagine in preparazione</div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
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
        {accesso.senzaTabella && accesso.admin && (
          <div style={{ background: "#FFF4D6", borderBottom: "2px solid #D4A017", color: "#6B5200", padding: "8px 20px", fontSize: 13 }}>
            ⚠️ La cartella «Accessi» non funziona ancora: il database non ha la tabella degli accessi (SQL della versione 337, blocchi 1–6). Per ora il programma resta aperto a tutti i registrati, come prima.
          </div>
        )}
        {vedeF24 && <StrisciaAvvisiF24 avvisi={avvisiF24} vaiA={vaiA} utente={utente} puoCaricare={puo("f24-arrivati")} puoConsultare={puo("consulta-f24")} />}
        {anticipiDaGuardare > 0 && tab !== "anticipi-fornitori" && puo("anticipi-fornitori") && (
          <div onClick={() => vaiA("anticipi-fornitori")}
            style={{ background: "#2C6E9B", color: "#fff", padding: "10px 20px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            ⏳ {anticipiDaGuardare === 1 ? "C'è 1 anticipo su fattura da ricevere" : `Ci sono ${anticipiDaGuardare} anticipi su fattura da ricevere`} da guardare (fattura arrivata da controllare, oppure in ritardo).
            <span style={{ textDecoration: "underline", fontWeight: 800 }}>Vai agli anticipi →</span>
          </div>
        )}
        {richiesteAccesso > 0 && tab !== "accessi" && (
          <div onClick={() => vaiA("accessi")}
            style={{ background: "#C0392B", color: "#fff", padding: "10px 20px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            🔐 {richiesteAccesso === 1 ? "C'è 1 richiesta di accesso al programma" : `Ci sono ${richiesteAccesso} richieste di accesso al programma`} da decidere.
            <span style={{ textDecoration: "underline", fontWeight: 800 }}>Vai agli Accessi →</span>
          </div>
        )}
        {anomalieAperte > 0 && tab !== "registro-controlli" && puo("registro-controlli") && (
          <div onClick={() => vaiA("registro-controlli")}
            style={{ background: "#C0392B", color: "#fff", padding: "10px 20px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            ⚠️ {anomalieAperte === 1 ? "C'è 1 anomalia" : `Ci sono ${anomalieAperte} anomalie`} nei registri da decidere.
            <span style={{ textDecoration: "underline", fontWeight: 800 }}>Vai al Registro Controlli →</span>
          </div>
        )}
        {modelli4Aperti.totale > 0 && tab !== "modelli4-chiusure" && puo("modelli4-chiusure") && (
          <div onClick={() => vaiA("modelli4-chiusure")}
            style={{ background: modelli4Aperti.rosso > 0 ? "#C0392B" : "#FFF1DC", color: modelli4Aperti.rosso > 0 ? "#fff" : "#7A4A00", borderBottom: modelli4Aperti.rosso > 0 ? "none" : "2px solid #D4880F", padding: "10px 20px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            🚦 Modelli 4 non chiusi con la fattura: {[modelli4Aperti.rosso ? `${modelli4Aperti.rosso} del 2026 (allarme)` : "", modelli4Aperti.azzurro ? `${modelli4Aperti.azzurro} scambio da verificare` : "", modelli4Aperti.arancione ? `${modelli4Aperti.arancione} degli anni precedenti da controllare` : ""].filter(Boolean).join(", ")}.
            <span style={{ textDecoration: "underline", fontWeight: 800 }}>Vai ai Modelli 4 →</span>
          </div>
        )}
        {modelli4Aperti.errore && puo("modelli4-chiusure") && (
          <div style={{ background: "#FFF4D6", borderBottom: "2px solid #D4A017", color: "#6B5200", padding: "8px 20px", fontSize: 13 }}>
            ⚠️ Non riesco a leggere gli allarmi dei Modelli 4 ({modelli4Aperti.errore}): aprire «Modelli 4 → Modelli 4: chiusi e non chiusi».
          </div>
        )}
        {avvisoCalcoli && tab !== "costi" && puo("costi") && (
          <div onClick={() => vaiA("costi")}
            style={{ background: "#FFF1DC", borderBottom: "2px solid #D4880F", color: "#7A4A00", padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            🔄 {avvisoCalcoli}
            <span style={{ textDecoration: "underline", fontWeight: 800 }}>Vai al Report Costi →</span>
          </div>
        )}
        {anomalieAperte === null && !controlloInCorso && puo("registro-controlli") && (
          <div style={{ background: "#FFF4D6", borderBottom: "2px solid #D4A017", color: "#6B5200", padding: "8px 20px", fontSize: 13 }}>
            ⚠️ I controlli dei registri non sono disponibili: il database non ha ancora le strutture della versione 232 (file contabilita_strutture_v232.sql).
          </div>
        )}
        {daFatturare > 0 && tab !== "fatt-animali-da-fatturare" && tab !== "fatt-animali-prepara" && puo("fatt-animali-da-fatturare") && (
          <div onClick={() => vaiA("fatt-animali-da-fatturare")}
            style={{ background: "#FBE1DE", borderBottom: "2px solid #C0392B", color: "#8B1E14", padding: "10px 20px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            🔔 {daFatturare === 1 ? "C'è 1 capo uscito" : `Ci sono ${daFatturare} capi usciti`} dall'allevamento da fatturare.
            <span style={{ textDecoration: "underline", fontWeight: 800 }}>Vai alle uscite da fatturare →</span>
          </div>
        )}        {allarmiAttiva > 0 && tab !== "controllo-attiva" && tab !== "lettura-aruba" && puo("controllo-attiva") && (
          <div onClick={() => vaiA("controllo-attiva")}
            style={{ background: "#FBE1DE", borderBottom: "2px solid #C0392B", color: "#8B1E14", padding: "10px 20px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            🧾 {allarmiAttiva === 1 ? "C'è 1 fattura di vendita da controllare" : `Ci sono ${allarmiAttiva} fatture di vendita da controllare`} (non trovate in Aruba, scartate o con differenze).
            <span style={{ textDecoration: "underline", fontWeight: 800 }}>Vai ai controlli →</span>
          </div>
        )}
        {/* Versione 337: una pagina non data a questa persona non si apre */}
        {(!tab || !puo(tab)) && (
          <div style={{ maxWidth: 700, margin: "40px auto", padding: 24, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, color: C.text }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.primary, marginBottom: 8 }}>🔐 Pagina non disponibile</div>
            {primaPagina ? "Questa pagina non fa parte delle parti del programma che Le sono state date. Usi il menu a sinistra." : "Non Le è stata ancora data nessuna parte del programma. Chieda al Dott. Filippo Bizzarri."}
          </div>
        )}
        {tab && puo(tab) && <>
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
        {tab === "istr-cespiti" && <DocumentoIstruzioni doc={ISTRUZIONI_CESPITI} />}
        {tab === "uba" && <ReportUba onVediScheda={vaiAllaSchedaAnimale} />}
        {tab === "istr-report-costi" && <DocumentoIstruzioni doc={ISTRUZIONI_REPORT_COSTI} />}
        {tab === "costi" && <SezioneReportCosti />}
        {tab === "istr-quando-macellare" && <DocumentoIstruzioni doc={ISTRUZIONI_QUANDO_MACELLARE} />}
        {tab === "grafico-macellazioni" && <QuandoMacellare />}
        {tab === "prezzo-pareggio" && <PrezzoPareggio />}
        {tab === "break-even" && <BreakEven onNavigate={vaiA} />}
        {tab === "be-fotografia-dati" && <FotografiaDati onNavigate={vaiA} />}
        {tab === "be-strutture" && <StruttureNecessarie onNavigate={vaiA} />}
        {tab === "be-nati-comprati" && <NatiOComprati onNavigate={vaiA} />}
        {tab === "be-anomalie" && <AnomalieInterventi onNavigate={vaiA} />}
        {tab === "be-fotografie" && <FotografieControllo onNavigate={vaiA} />}
        {tab === "muratella-costi" && <ContabilitaMuratella />}
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
        {tab === "controllo-bovini" && <ControlloRazioniSpecie specie="bovino" onNavigate={vaiA} />}
        {tab === "controllo-suini" && <ControlloRazioniSpecie specie="suino" onNavigate={vaiA} />}
        {tab === "controllo-ovini" && <ControlloRazioniSpecie specie="ovino" onNavigate={vaiA} />}
        {tab === "controllo-pollame" && <ControlloPollame />}
        {tab === "controllo-riepilogo" && <RiepilogoControlloRazioni />}
        {tab === "costruisci-razione" && <CostruisciRazione onNavigate={vaiA} />}
        {tab === "razioni-bovini-riferimento" && <RazioniRiferimento onNavigate={vaiA} />}
        {tab === "razioni-bovini-report" && <ReportFabbisogniBovini onNavigate={vaiA} />}
        {tab === "istr-alimentaria" && <IstruzioniAlimentaria />}
        {tab === "verifiche-ovini" && <OviniDaVerificare onAggiorna={() => contaVerificheAnimali().then(setVerificheAnimali)} />}
        {tab === "alimenti-senza-composizione" && <AlimentiSenzaComposizione onAggiorna={() => contaAlimentiSenzaComposizione().then(setSenzaComposizione)} />}
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
        {tab === "vendite-per-anno" && <VenditePerAnno />}
        {tab === "prompt-cedolini" && <PromptCedolini />}
        {tab === "f24-arrivati" && <F24Arrivati utente={utente} accesso={accesso} />}
        {tab === "consulta-f24" && <ConsultaF24 utente={utente} vaiA={vaiA} />}
        {tab === "istr-documenti-arrivati" && <DocumentoIstruzioni doc={ISTRUZIONI_DOCUMENTI_ARRIVATI} />}
        {tab === "documenti-arrivati" && <DocumentiArrivati utente={utente} accesso={accesso} vediF24={puo("f24-arrivati")} />}
        {tab === "istr-generali-f24" && <DocumentoIstruzioni doc={ISTRUZIONI_F24_ARRIVATI} />}
        {tab === "carica-costi-lavoro" && <CaricaCostiLavoro />}
        {tab === "consulta-costi-lavoro" && <ConsultaCostiLavoro />}
        {tab === "inserimento-manuale" && <InserimentoManualeFattura />}
        {tab === "verifica-fatture-mancanti" && <VerificaFattureMancanti />}
        {tab === "verifica-righe-mancanti" && <VerificaRigheMancanti />}
        {tab === "costi-quantita-alimentare" && <ReportCostiQuantitaAlimentare />}
        {tab === "import-massivo-riproduttori" && <ImportMassivoRiproduttori />}
        {tab === "riepilogo-costo-animali" && <RiepilogoCostoAnimali />}
        {tab === "istr-fatture" && <DocumentoIstruzioni doc={ISTRUZIONI_CARICA_FATTURE} />}
        {tab === "istr-carica-dati" && <DocumentoIstruzioni doc={ISTRUZIONI_RIEPILOGO_CARICA_DATI} />}
        {tab === "piano-dei-conti" && <DocumentoIstruzioni doc={PIANO_DEI_CONTI} />}
        {tab === "istr-costi-diretti" && <DocumentoIstruzioni doc={ISTRUZIONI_COSTI_DIRETTI} />}
        {tab === "istr-costi-lavoro" && <DocumentoIstruzioni doc={ISTRUZIONI_COSTI_LAVORO} />}
        {tab === "istr-sistema-dati" && <DocumentoIstruzioni doc={ISTRUZIONI_SISTEMA_DATI} />}
        {tab === "istr-verifica" && <DocumentoIstruzioni doc={ISTRUZIONI_VERIFICA} />}
        {tab === "carica-pdf-fatture" && <CaricaPdfFatture />}
        {tab === "istr-ricerca" && <DocumentoIstruzioni doc={ISTRUZIONI_RICERCA_ANAGRAFICHE} />}
        {tab === "istr-prezzi-acquisto" && <IstruzioniPrezziAcquisto />}
        {tab === "istr-animali" && <IstruzioniAnimali />}
        {tab === "istr-costi" && <DocumentoIstruzioni doc={ISTRUZIONI_GENERALI_ANALISI_COSTI} />}
        {tab === "istr-break-even" && <DocumentoIstruzioni doc={ISTRUZIONI_BREAK_EVEN} />}
        {tab === "istr-report-analisi" && <IstruzioniReportAnalisi />}
        {tab === "analisi-suini" && <ReportAnalisi key="suino" specie="suino" />}
        {tab === "analisi-bovini" && <ReportAnalisi key="bovino" specie="bovino" />}
        {tab === "analisi-ovini" && <ReportAnalisi key="ovino" specie="ovino" />}
        {tab === "analisi-break-even" && <ReportBreakEven onNavigate={vaiA} />}
        {tab === "analisi-coltivazioni" && <ReportAnalisiColtivazioni />}
        {tab === "istr-studi" && <IstruzioniStudi />}
        {tab === "istr-coltivazioni" && <IstruzioniColtivazioni />}
        {tab === "istr-modelli4" && <IstruzioniModelli4 />}
        {tab === "istr-emissione-fatture" && <DocumentoIstruzioni doc={ISTRUZIONI_GENERALI_EMISSIONE} />}
        {tab === "istr-fatture-competenza" && <DocumentoIstruzioni doc={ISTRUZIONI_FATTURE_COMPETENZA} />}
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
        {tab === "modelli4-chiusure" && <Modelli4Chiusure />}
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
        {tab === "scadenzari" && <ScadenzariClientiFornitori />}
        {tab === "banche-conti" && <BancheConti />}
        {tab === "banche-carica" && <CaricaDocumentiBanca />}
        {tab === "banche-consulta" && <ConsultaEstratti />}
        {tab === "banche-conferma" && <ConfermaMovimenti />}
        {tab === "prima-nota" && <PrimaNota />}
        {tab === "incassi-pagamenti" && <GestioneIncassiPagamenti />}
        {tab === "anticipi-fornitori" && <AnticipiFornitori vaiA={vaiA} />}
        {tab === "istr-banche" && <DocumentoIstruzioni doc={ISTRUZIONI_BANCHE} />}
        {tab === "istr-incassi-pagamenti" && <DocumentoIstruzioni doc={ISTRUZIONI_INCASSI_PAGAMENTI} />}
        {tab === "istr-prima-nota" && <DocumentoIstruzioni doc={ISTRUZIONI_PRIMA_NOTA} />}
        {tab === "registro-comunicazioni" && <RegistroComunicazioni />}
        {tab === "posta" && <Posta />}
        {tab === "completa-anagrafiche" && <CompletaAnagraficheAruba />}
        {tab === "glossario" && <Glossario />}
        {tab === "parametri" && <Parametri />}
        {tab === "istr-controlli" && <DocumentoIstruzioni doc={ISTRUZIONI_CONTROLLI} />}
        {tab === "registro-controlli" && <RegistroControlli onCambiaAperte={setAnomalieAperte} />}
        {tab === "abbinamenti-fatture" && <AbbinamentiFatture />}
        {tab === "istr-registro-modifiche" && <DocumentoIstruzioni doc={ISTRUZIONI_REGISTRO_MODIFICHE} />}
        {tab === "registro-modifiche" && <RegistroModifiche />}
        {tab === "istr-accessi" && <IstruzioniAccessi />}
        {tab === "accessi" && <PaginaAccessi accesso={accesso} utente={utente} onCambiato={() => { ricaricaAccesso(); setTab("accessi"); }} />}
        </>}
      </main>
    </div>
  );
}
