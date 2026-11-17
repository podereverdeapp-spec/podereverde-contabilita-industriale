// Versione 384 (ordini e decisioni del Dott. Bizzarri del 14/11/2026, 19:53–23:32; progetto claude/progetto_384_fatture_passive_aruba.md):
// «Leggi le fatture passive di Aruba». Le fatture passive si caricano come «Leggi le Fatture di Aruba» (vendite):
//  1. la persona scarica da Aruba i tre file (XML, PDF, Report Excel) e li mette in FATTURE PASSIVE DA SMISTARE (come sempre);
//  2. nel programma preme «Scegli i file» (la finestra di Windows degli allegati): da qualunque computer e con qualunque browser;
//  3. il programma mostra tutto SENZA SCRIVERE NIENTE: già presenti, da guardare, da sistemare, nuove con le righe già classificate
//     dalle regole di sempre (motoreClassificazione, la stessa classificazione di «Carica Fatture»);
//  4. la persona completa solo le righe che le regole non sanno classificare (gialle), con gli stessi campi di sempre (RigaFattura);
//  5. un solo tasto «Registra»: per ogni fattura il debito (come «Prima di tutto»), poi le righe (stesso codice di «Carica Fatture»:
//     salvataggioFatturePassive.js), poi il PDF dentro il programma;
//  6. confronto con il Report di Aruba, da solo;
//  7. «Archivia nel cloud» (strada A, decisione delle 22:56), facoltativo: solo da un computer che raggiunge la cartella FATTURE PASSIVE.
// Le regole di riconoscimento, i colori, le fatture «in lavorazione» e l'archiviazione sono quelle della pagina «Carica le fatture da Aruba»
// (DocumentiArrivati.jsx, versioni 355–381), riusate: una fattura caricata con una pagina è riconosciuta dall'altra.
import { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";
import { fetchAllPages, leggiInBlocchi, formattaEuro, formattaData } from "./parsingUtils";
import { C } from "./style";
import { md5 } from "./md5";
import { cartella, leggiFile, scriviVerificato, cancellaOriginale } from "./archivioF24";
import { assicuraScadenze, chiaveDocumento } from "./documentoFattura";
import { leggiScaricoAruba, collega, contiPerAnno, chiusura, nomeArchivio, nomeArchivioEstero, eIntegrazione, pulisciPiva, numeroRidotto, righeMancanti, righeDelDocumento, normDescr } from "./arubaCarico";
import {
  statoFatture, cosaMancaNelloScarico, contiene, leggiProgramma, scriviInLavorazione,
  FILE_RICONOSCIMENTO_FATTURE, PARAMETRO_CODICE, leggiTesto, leggiRiconoscimentoFatture, haGliAnni, fileDentroCartella,
} from "./DocumentiArrivati";
import { rigaDaGrezza, righeGrezzeDelDocumento, validaRiga } from "./righeFatturePassive";
import { salvaRigaFatturaPassiva, trovaOCreaFornitore as trovaOCreaFornitoreRiga } from "./salvataggioFatturePassive";
import { RigaFattura } from "./CaricaFatture";
import { caricaPdf } from "./pdfFatture";
import RiquadroDoveSonoIFile, { PERCORSO_DATI } from "./RiquadroDoveSonoIFile";

const COLORI = { verde: "#E3F2E1", arancione: "#FFF1DC", rosso: "#FBE1DE", grigio: "#F1F1F1", giallo: "#FFF6C2" };
const oraRoma = () => new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date()).replace(", ", " ore ");
const dataIt = d => { const s = String(d || "").slice(0, 10); const [a, m, g] = s.split("-"); return g ? `${g}/${m}/${a}` : (s || "—"); };
// I nomi dei file nell'archivio si calcolano come nelle versioni 359–382 (base «Z:\…»), così un file già archiviato si riconosce
// («Già presente uguale») e non nasce una seconda copia con un altro nome (ricontrollo indipendente del 16/11/2026, punto 7).
// Da un computer con un percorso più lungo, un file oltre il limite di Windows non si scrive: l'errore si vede e gli scarichi restano in DA SMISTARE.
export const PERCORSO_FATTURE_PASSIVE_Z = `Z:\\${[...PERCORSO_DATI, "FATTURE PASSIVE"].join("\\")}`;

// Una riga «da completare» (gialla): mancano dati per salvarla, oppure le regole non la classificano o servono dati in più
// (gli stessi casi in cui «Carica Fatture» chiede qualcosa) e la persona non l'ha ancora toccata
export function rigaDaCompletare(r) {
  if (r.giaCaricata || r.scartata) return false;
  if (validaRiga(r) || r.ambigua) return true;
  return !r.toccata && (r.stato === "MASCHERA" || r.editArea === "TRASPORTO ANIMALI" || r.editArea === "Ammortamenti" || r.editArea === "ACQUISTO ANIMALI");
}

// Versione 388 (Dottore, 16/11): accanto a ogni riga si dice in parole da dove viene la classificazione proposta (non «FCF»/«FCV»)
export function daDoveViene(r) {
  const gasolio = r.stato === "FCV" && /gasolio/i.test(r.descrizione || "") && r.editCentro === "Gasolio e lubrificanti";
  const riempita = !!(r.editArea || r.area);
  const base = r.stato === "FCF" ? "regola fissa del fornitore (tutte le sue righe vanno qui)"
    : gasolio ? "regola generale del gasolio (vale per tutti i fornitori)"
    : r.stato === "FCV" ? "regola del fornitore per una parola della descrizione"
    : riempita ? `proposta parziale da completare${r.nota ? `: ${r.nota}` : ""}`
    : `nessuna regola: la classificazione la sceglie Lei${r.nota ? ` (${r.nota})` : ""}`;
  return r.toccata ? `${base} · controllata o cambiata da Lei` : base;
}
const MODALITA = { MP01: "contanti", MP02: "assegno", MP05: "bonifico", MP08: "carta di pagamento", MP12: "RIBA", MP19: "SEPA addebito diretto", MP20: "SEPA addebito diretto CORE", MP21: "SEPA addebito diretto B2B", MP23: "PagoPA" };
// Versione 388 (Dottore, 16/11): nella fattura aperta i dati letti dall'XML e il pulsante «📄 Vedi la fattura» (il PDF dello scarico)
export function DatiFattura({ x }) {
  const d = x.xml || {}; const rate = d.rate || [];
  const apri = () => { if (!x.pdf?.bytes) return; const url = URL.createObjectURL(new Blob([x.pdf.bytes], { type: "application/pdf" })); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60000); };
  return <div style={{ margin: "4px 0 10px", padding: "8px 10px", background: "#F4F8FC", border: "1px solid #D5E2F0", borderRadius: 8, fontSize: 12.5, lineHeight: 1.6 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <b>Dati della fattura elettronica (XML)</b>
      {x.pdf?.bytes ? <button onClick={apri} style={{ background: "#1F5F8B", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", fontWeight: 700, cursor: "pointer" }}>📄 Vedi la fattura</button>
        : <span style={{ color: "#B3261E" }}>Il PDF di questa fattura non è nei file scelti</span>}
    </div>
    <div>Fornitore: <b>{d.fornitore || x.report.fornitore}</b> · partita IVA {d.piva || x.report.piva || "—"} · documento {d.tipoDocumento || x.report.tipo || "—"} n. {d.numero || x.report.numero} del {dataIt(d.data || x.report.data)}</div>
    <div>Imponibile <b>{formattaEuro(Number(d.imponibile) || 0)}</b> · IVA <b>{formattaEuro(Number(d.iva) || 0)}</b> · totale <b>{formattaEuro(Number(d.totale ?? x.report.totale) || 0)}</b>{Number(d.ritenuta) > 0 ? <> · ritenuta d'acconto <b>{formattaEuro(Number(d.ritenuta))}</b> (si archivia in PROFESSIONISTI)</> : " · nessuna ritenuta d'acconto"}</div>
    <div>Scadenze: {rate.length ? rate.map((q, i) => <span key={i}>{i ? " · " : ""}{formattaEuro(Number(q.importo) || 0)} {q.scadenza ? `il ${dataIt(q.scadenza)}` : q.giorni ? `a ${q.giorni} giorni` : "senza data"}{q.modalita ? ` (${MODALITA[q.modalita] || q.modalita})` : ""}</span>) : "nessuna scadenza nell'XML"}</div>
  </div>;
}

export default function LetturaPassiveAruba() {
  const [lettura, setLettura] = useState(null);         // { file, scarico, collegato }
  const [programma, setProgramma] = useState(null);     // leggiProgramma() + riferimenti della classificazione
  const [rif, setRif] = useState(null);                 // { fornitori, regoleFisse, regoleVariabili, pianoConti, regoleArmonizzazione, scartate }
  const [totaliAruba] = useState({}); // versione 388: nessun numero di Aruba da scrivere (resta vuoto)
  const [scelte, setScelte] = useState({});
  const [righe, setRighe] = useState({});               // { chiaveFattura: [righe] }
  const [aperte, setAperte] = useState(() => new Set());
  // versione 385: ogni fattura nuova va vista e confermata dal Dottore prima di «Registra», anche se le regole l'hanno classificata tutta
  const [confermate, setConfermate] = useState(() => new Set());
  // versione 385: le righe che si registrano devono fare l'imponibile della fattura; se no, il Dottore deve dire di aver visto la differenza
  const [differenzeViste, setDifferenzeViste] = useState(() => new Set());
  const [passo, setPasso] = useState("");
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState(null);             // esito di «Registra»
  const [esitoChiusura, setEsitoChiusura] = useState(null);
  const [esitoArchivio, setEsitoArchivio] = useState(null);
  const [domanda, setDomanda] = useState(null);         // { testo, risolvi }: domanda dentro la pagina (non le finestre del browser)
  const occupato = useRef(false);
  const inputFile = useRef(null);
  const conFinestraCartelle = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

  async function unoAllaVolta(lavoro) {
    if (occupato.current) return;
    occupato.current = true;
    try { await lavoro(); } finally { occupato.current = false; setPasso(""); }
  }
  const chiedi = testo => new Promise(risolvi => setDomanda({ testo, risolvi: v => { setDomanda(null); risolvi(v); } }));

  // ── 1. Lettura dei file scelti: non scrive niente ──
  const scegliFile = e => {
    const scelti = Array.from(e.target.files || []);
    if (inputFile.current) inputFile.current.value = "";
    if (!scelti.length) return;
    unoAllaVolta(async () => {
      setErrore(""); setLettura(null); setProgramma(null); setRif(null); setScelte({}); setRighe({}); setAperte(new Set()); setConfermate(new Set()); setDifferenzeViste(new Set()); setEsito(null); setEsitoChiusura(null); setEsitoArchivio(null);
      try {
        setPasso("Leggo i file scelti…");
        const file = []; const nonLetti = [];
        for (const f of scelti) {
          if (f.name === FILE_RICONOSCIMENTO_FATTURE || f.name.startsWith("~$")) continue;
          try { const b = new Uint8Array(await f.arrayBuffer()); if (!b.length) throw new Error("il file è vuoto"); file.push({ nome: f.name, bytes: b, md5: md5(b), byte: b.length }); }
          catch (er) { nonLetti.push(`${f.name}: ${er.message}`); }
        }
        if (nonLetti.length) { setErrore(`Questi file non si riescono a leggere: ${nonLetti.join(" · ")}. Se sono nel cloud, aprire la cartella in Esplora file, aspettare che il cloud li scarichi e sceglierli di nuovo.`); return; }
        if (!file.length) { setErrore("Non è stato scelto nessun file da leggere."); return; }
        setPasso("Riconosco il contenuto dei file…");
        const scarico = await leggiScaricoAruba(XLSX, file);
        const collegato = collega(scarico);
        setPasso("Leggo il programma…");
        const [prog, r] = await Promise.all([leggiProgramma(), leggiRiferimenti()]);
        setPasso("Controllo le righe già nel programma…");
        const righeLette = await marcaGiaCaricate(preparaRighe(statoFatture(collegato, prog, {}), prog, r));
        setProgramma(prog); setRif(r); setRighe(righeLette);
        setLettura({ file: file.map(f => ({ nome: f.nome, md5: f.md5, byte: f.byte, contenuto: scarico.file.find(x => x.nome === f.nome)?.contenuto, parti: scarico.file.find(x => x.nome === f.nome)?.parti || [], voci: scarico.file.find(x => x.nome === f.nome)?.voci })), scarico, collegato, bytesFile: new Map(file.map(f => [f.nome, f])) });
      } catch (er) { setErrore(`Lettura non riuscita: ${er.message}`); }
    });
  };

  async function leggiRiferimenti() {
    const [f, rf, rv, pc, ra, sc] = await Promise.all([
      fetchAllPages((da, a) => supabase.from("ci_fornitori").select("*").order("id").range(da, a)),
      fetchAllPages((da, a) => supabase.from("ci_regole_fornitore_fissa").select("*").order("id").range(da, a)),
      fetchAllPages((da, a) => supabase.from("ci_regole_fornitore_variabile").select("*").order("id").range(da, a)),
      fetchAllPages((da, a) => supabase.from("ci_piano_dei_conti").select("*").order("area").order("centro_costo").order("id").range(da, a)),
      fetchAllPages((da, a) => supabase.from("ci_regole_armonizzazione_unita").select("fornitore_id, descrizione_prodotto").order("id").range(da, a)),
      fetchAllPages((da, a) => supabase.from("ci_righe_scartate").select("fornitore_id, descrizione").order("id").range(da, a)),
    ]);
    for (const x of [f, rf, rv, pc, sc]) if (x.error) throw new Error(x.error.message);
    return { fornitori: f.data || [], regoleFisse: rf.data || [], regoleVariabili: rv.data || [], pianoConti: pc.data || [], regoleArmonizzazione: ra.data || [],
      scartate: new Set((sc.data || []).map(s => `${s.fornitore_id}|${s.descrizione.trim().toLowerCase()}`)) };
  }

  // Le righe di ogni fattura nuova, classificate come in «Carica Fatture» (incorporata in «Documenti arrivati»)
  function documentoPerRighe(x) { const { byteXml, ...doc } = x.xml; return { ...doc, identificativoSdi: x.report.idSdi, nomeFileSdi: x.report.nomeSdi }; } // eslint-disable-line no-unused-vars
  function preparaRighe(stato, prog, r) {
    const out = {};
    for (const x of stato.filter(s => s.esito === "nuova" && s.xml && s.colore !== "rosso")) {
      const doc = documentoPerRighe(x);
      const perChiave = new Map([[chiaveDocumento(doc.piva || doc.fornitore, doc.numero, formattaData(doc.data)), doc]]);
      const contesto = { fornitori: r.fornitori, regoleFisse: r.regoleFisse, regoleVariabili: r.regoleVariabili };
      const prefisso = `r-${x.chiave}`;
      const lista = righeGrezzeDelDocumento(doc).map((g, i) => rigaDaGrezza(g, i, contesto, perChiave, prefisso));
      // righe già scartate in passato per questo fornitore (come «Carica Fatture»)
      lista.forEach(rr => { if (rr.fornitore_obj && r.scartate.has(`${rr.fornitore_obj.id}|${rr.descrizione.trim().toLowerCase()}`)) { rr.scartata = true; rr.giaScartataInPrecedenza = true; } });
      // riga a 0 € in un documento con righe con importo: non si registra (versione 355)
      if (lista.some(rr => Math.abs(Number(rr.imponibile) || 0) >= 0.005)) lista.forEach(rr => { if (!rr.scartata && Math.abs(Number(rr.imponibile) || 0) < 0.005) { rr.scartata = true; rr.rigaAZero = true; } });
      // fattura registrata in parte (pagina chiusa a metà): le righe già salvate non si rifanno (stesso controllo di statoFatture)
      if (x.inParte) {
        const p = pulisciPiva(x.report.piva); const k = `${p}|${x.report.data}|${numeroRidotto(x.report.numero)}`;
        const fattura = x.trovata && !x.trovata.acquisto ? x.trovata : null;
        const salvate = { descrizioni: fattura ? (prog.articoli[fattura.id] || []) : [],
          importiAcquisti: prog.acquisti.filter(a => !a.conArticolo && `${pulisciPiva(a.piva)}|${a.data}|${numeroRidotto(a.numero)}` === k).map(a => a.importo),
          scartate: prog.scartate[fattura?.fornitoreId ?? x.trovata?.fornitoreId] || new Set() };
        const esitoR = righeMancanti(righeDelDocumento(x.xml), salvate);
        const mancano = new Set(esitoR); const ambigue = new Set(esitoR.ambigue || []);
        lista.forEach((rr, i) => { rr.giaCaricata = !mancano.has(i) && !ambigue.has(i); rr.ambigua = ambigue.has(i); });
      }
      out[x.chiave] = lista;
    }
    return out;
  }

  // Come «Carica Fatture» 382 (elaboraRigheGrezze, righe 349–392): una fattura dello stesso fornitore (quello della classificazione),
  // stesso numero e stessa data, già nel programma (o un acquisto di animali) → le righe sono «già caricate», riga per riga.
  // Serve quando il riconoscimento per partita IVA non la trova (fornitore senza partita IVA o con una diversa): niente righe doppie.
  async function marcaGiaCaricate(mappa) {
    const tutte = Object.values(mappa).flat();
    const fornitoreIds = [...new Set(tutte.map(r => r.fornitore_obj?.id).filter(Boolean))];
    if (!fornitoreIds.length) return mappa;
    const [{ data: fe, error: e1 }, { data: ae, error: e2 }] = await Promise.all([
      leggiInBlocchi(fornitoreIds, (bl, da, a) => supabase.from("ci_fatture").select("fornitore_id, numero, data").in("fornitore_id", bl).order("id").range(da, a)),
      leggiInBlocchi(fornitoreIds, (bl, da, a) => supabase.from("ci_report_acquisto_animali").select("fornitore_id, numero_fattura, data_fattura").in("fornitore_id", bl).order("id").range(da, a)),
    ]);
    if (e1 || e2) throw new Error(`Controllo delle fatture già caricate non riuscito: ${(e1 || e2).message}`);
    const esistenti = new Set((fe || []).map(f => `${f.fornitore_id}|${f.numero}|${f.data}`));
    (ae || []).forEach(a => esistenti.add(`${a.fornitore_id}|${a.numero_fattura}|${a.data_fattura}`));
    for (const lista of Object.values(mappa)) {
      const gia = lista.filter(r => r.fornitore_obj && !r.giaCaricata && esistenti.has(`${r.fornitore_obj.id}|${r.numero}|${r.data}`));
      if (!gia.length || lista.some(r => r.giaCaricata || r.ambigua)) continue; // già controllata riga per riga (registrata in parte)
      const g = gia[0];
      const { data: fat, error: eF } = await supabase.from("ci_fatture").select("id").eq("fornitore_id", g.fornitore_obj.id).eq("numero", g.numero).eq("data", g.data).eq("tipo", "PASSIVA").maybeSingle();
      const { data: art, error: eA } = fat ? await supabase.from("ci_articoli_fattura").select("descrizione").eq("fattura_id", fat.id) : { data: [], error: null };
      const { data: acq, error: eQ } = await supabase.from("ci_report_acquisto_animali").select("importo, articolo_fattura_id").eq("fornitore_id", g.fornitore_obj.id).eq("numero_fattura", g.numero).eq("data_fattura", g.data);
      const { data: scart, error: eR } = await supabase.from("ci_righe_scartate").select("descrizione").eq("fornitore_id", g.fornitore_obj.id);
      if (eF || eA || eQ || eR) throw new Error(`Controllo delle righe già salvate di ${g.numero}: ${(eF || eA || eQ || eR).message}`);
      const esitoR = righeMancanti(gia, { descrizioni: (art || []).map(x => x.descrizione), importiAcquisti: (acq || []).filter(x => x.articolo_fattura_id == null).map(x => x.importo),
        scartate: new Set((scart || []).map(x => normDescr(x.descrizione))) });
      const mancano = new Set(esitoR); const ambigue = new Set(esitoR.ambigue || []);
      gia.forEach((r, i) => { r.giaCaricata = !mancano.has(i) && !ambigue.has(i); r.ambigua = ambigue.has(i); });
    }
    return mappa;
  }

  const riconosciute = useMemo(() => (lettura && programma ? statoFatture(lettura.collegato, programma, scelte) : null), [lettura, programma, scelte]);
  const conti = useMemo(() => (lettura ? contiPerAnno(lettura.collegato, totaliAruba) : []), [lettura, totaliAruba]);
  // versione 388 (Dottore, 16/11): si scarica da Aruba qualunque selezione, senza numero da scrivere: i conti tornano se Report = XML = PDF
  const contiOk = conti.length > 0 && conti.every(c => c.torna);
  const cosaManca = lettura ? cosaMancaNelloScarico(lettura.file, conti) : [];
  const lista = riconosciute || [];
  const nuove = lista.filter(x => x.esito === "nuova" && x.colore !== "rosso" && x.xml);
  const arancioniAperte = lista.filter(x => x.colore === "arancione" && x.esito === "arancione");
  const rosse = lista.filter(x => x.colore === "rosso");
  const quanti = { grigio: 0, verde: 0, arancione: 0, rosso: 0 }; lista.forEach(x => { quanti[x.colore]++; });
  const fileNonSpiegati = lettura ? [
    ...lettura.scarico.scartati,
    ...lettura.file.filter(f => !["XML", "PDF", "REPORT"].some(t => contiene(f, t))).map(f => `${f.nome}: contenuto ${f.contenuto}`),
    ...lettura.collegato.xmlSenzaReport.map(d => `XML senza riga nel Report: ${d.fileXml}`),
    ...lettura.collegato.pdfSenzaReport.map(p => `PDF senza riga nel Report: ${p.nome}`),
  ] : [];

  // una «È un'altra» decisa dopo la lettura fa nascere le righe di quella fattura
  const righeDi = x => righe[x.chiave] || [];
  const chiaviSenzaRighe = nuove.filter(x => !righe[x.chiave]).map(x => x.chiave).join("|");
  useEffect(() => {
    if (!chiaviSenzaRighe || !programma || !rif) return;
    const mancano = nuove.filter(x => !righe[x.chiave]);
    marcaGiaCaricate(preparaRighe(mancano, programma, rif)).then(piu => setRighe(r => ({ ...piu, ...r }))).catch(er => setErrore(er.message));
  }, [chiaviSenzaRighe, programma, rif]); // eslint-disable-line react-hooks/exhaustive-deps

  // una fattura con righe gialle si apre da sola e resta aperta mentre la si completa (si chiude solo a mano)
  // versione 385: si aprono da sole tutte le fatture nuove con righe da registrare, non solo quelle con righe gialle
  const quadratura = x => {
    const somma = Math.round(righeDi(x).filter(r => !r.scartata).reduce((t, r) => t + (Number(r.imponibile) || 0), 0) * 100) / 100;
    const imp = Number(x.xml?.imponibile ?? x.report?.imponibile ?? 0);
    const diff = Math.round((somma - imp) * 100) / 100;
    return { somma, imp, diff, nonTorna: Math.abs(diff) > (Number(x.scartoRighe) || 0) + 0.01 };
  };
  const daConfermareX = x => righeDi(x).some(r => !r.giaCaricata && !r.scartata) && !confermate.has(x.chiave);
  const daAprire = nuove.filter(x => daConfermareX(x) && !aperte.has(x.chiave) && !aperte.has(`chiusa:${x.chiave}`)).map(x => x.chiave);
  useEffect(() => { if (daAprire.length) setAperte(s => new Set([...s, ...daAprire])); }, [daAprire.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const tutteLeRighe = nuove.flatMap(righeDi);
  // una fattura nuova di un fornitore che il programma non conosce: si avvisa (potrebbe essere già nel programma con un'altra scheda)
  const fornitoreNuovo = x => x.esito === "nuova" && !!programma && righeDi(x).length > 0 && righeDi(x).every(r => !r.fornitore_obj)
    && !programma.fornitori.some(fo => pulisciPiva(fo.partita_iva) && pulisciPiva(fo.partita_iva) === pulisciPiva(x.xml?.piva || x.report.piva));
  const daCompletare = tutteLeRighe.filter(rigaDaCompletare);
  const nonValide = tutteLeRighe.filter(rigaDaCompletare); // tutte le gialle: si completano, oppure si conferma «Va bene così»
  const daRegistrare = tutteLeRighe.filter(r => !r.giaCaricata && !r.scartata);
  const giaRegistrato = !!esito;
  const righePronte = nuove.every(x => !!righe[x.chiave]);
  const daConfermare = righePronte ? nuove.filter(daConfermareX) : [];
  const puoRegistrare = !!lettura && righePronte && contiOk && !arancioniAperte.length && !nonValide.length && !daConfermare.length && !giaRegistrato && !passo;

  function aggiornaRiga(chiave, id, campi, daRegistra = false) {
    if (!daRegistra) setConfermate(s => { if (!s.has(chiave)) return s; const n = new Set(s); n.delete(chiave); return n; }); // una riga cambiata: la fattura si riconferma
    if (!daRegistra) setDifferenzeViste(s => { if (!s.has(chiave)) return s; const n = new Set(s); n.delete(chiave); return n; });
    setRighe(prev => ({ ...prev, [chiave]: (prev[chiave] || []).map(r => (r.id === id ? { ...r, ...campi } : r)) }));
  }
  const aree = rif ? [...new Set(rif.pianoConti.map(p => p.area))] : [];
  const centriPerArea = area => (rif ? rif.pianoConti.filter(p => p.area === area).map(p => p.centro_costo) : []);

  const adesso = (() => {
    if (!lettura) return "Premi «Scegli i file» e scegli i tre file scaricati da Aruba (XML, PDF, Report Excel): li trovi in FATTURE PASSIVE DA SMISTARE, oppure nella cartella dove li ha messi il browser.";
    if (cosaManca.length && cosaManca.some(m => /^Manca/.test(m))) return cosaManca.find(m => /^Manca/.test(m));
    if (!contiOk) return cosaManca[0] || "I conti non tornano: nel Report, negli XML e nei PDF non ci sono le stesse fatture. Si rifà lo scarico da Aruba (Report, XML e PDF delle stesse fatture) e si rileggono i file.";
    if (arancioniAperte.length) return `Decidi le ${arancioniAperte.length} fatture «da guardare» con i pulsanti «È la stessa» / «È un'altra».`;
    if (!esito) {
      if (nonValide.length) return `Completa le ${nonValide.length} righe gialle (Area, Centro di Costo, Destinazione, Tipo di Costo, e i dati in più dove servono), poi premi «Registra».`;
      if (daConfermare.length) return `Controlla le righe di ogni fattura nuova (area, centro di costo, destinazione, animali) e premi «✔ Approvo la classificazione»: ne mancano ${daConfermare.length}.`;
      return nuove.length ? `Controlla le righe e premi «Registra» (${nuove.length} fatture nuove, ${daRegistrare.length} righe).` : "Non ci sono fatture nuove da registrare. Premi «Registra» per scrivere gli Identificativi SdI e i debiti mancanti, se ce ne sono.";
    }
    if (esito.errori.length) return "Ci sono stati errori (riquadro rosso): premi di nuovo «Scegli i file», scegli gli stessi file e premi «Registra»: ciò che è già fatto non si rifà.";
    if (esitoChiusura && !esitoChiusura.righe.every(c => c.torna)) return "Il confronto con il Report di Aruba NON torna: le fatture mancanti sono nel riquadro «Confronto». Rileggi i file: compariranno da registrare o da completare.";
    if (!esitoArchivio) return "Registrato. Se questo computer raggiunge la cartella FATTURE PASSIVE del cloud, premi «Archivia nel cloud»; altrimenti lo farà chi la raggiunge.";
    if (esitoArchivio.fermo?.length || esitoArchivio.errori?.length) return "L'archivio nel cloud non è completo: il motivo è nel riquadro «Archivia nel cloud».";
    return "Fatto. Ora ricalcola il Report Costi dell'anno e poi il Report Riproduttori.";
  })();

  // ── 2. Registra: debiti, Identificativi SdI, righe, PDF; poi il confronto con il Report ──
  async function trovaOCreaFornitoreDebito(x, prog) {
    // come «Prima di tutto» di «Carica le fatture da Aruba» (DocumentiArrivati.jsx): per partita IVA, poi scheda nuova
    const p = pulisciPiva(x.xml?.piva || x.report.piva);
    if (!p) throw new Error(`${x.report.fornitore} ${x.report.numero}: partita IVA mancante`);
    const giaQui = prog.fornitori.find(f => pulisciPiva(f.partita_iva) === p);
    if (giaQui) return giaQui.id;
    const { data: perPiva, error } = await supabase.from("ci_fornitori").select("id, nome, partita_iva").in("partita_iva", [p, `IT${p}`]).order("id").limit(1);
    if (error) throw new Error(error.message);
    if (perPiva?.length) return perPiva[0].id;
    const { data: nuovo, error: eN } = await supabase.from("ci_fornitori").insert([{ nome: x.xml?.fornitore || x.report.fornitore, partita_iva: x.xml?.piva || `IT${p}`, gruppo_classificazione: "FRO" }]).select().single();
    if (eN) throw new Error(`fornitore nuovo: ${eN.message}`);
    prog.fornitori.push(nuovo);
    return nuovo.id;
  }

  const registra = () => unoAllaVolta(async () => {
    if (!puoRegistrare) return;
    setErrore(""); setEsitoChiusura(null); setEsitoArchivio(null);
    const e = { fatture: 0, righe: 0, scartateOra: 0, debiti: 0, sdi: 0, sdiNonScritti: [], acquisti: 0, pdf: 0, pdfGia: 0, pdfNo: [], giaDaAltri: [], giaNelProgramma: [], errori: [], annullate: [], finito: false };
    try {
      // subito prima di scrivere si rilegge il programma: una fattura registrata nel frattempo (un'altra persona, l'altra pagina) non si tocca
      setPasso("Rileggo il programma prima di scrivere…");
      const prog = await leggiProgramma();
      const ora = new Map(statoFatture(lettura.collegato, prog, scelte).map(x => [x.chiave, x]));
      const fotografia = lista.map(x => {
        const adessoX = ora.get(x.chiave);
        if (x.esito === "nuova" && adessoX && adessoX.esito !== "nuova") { e.giaDaAltri.push(`${x.report.fornitore} ${x.report.numero} del ${dataIt(x.report.data)}`); return null; }
        // nuova adesso ma non alla lettura (per esempio cancellata nel frattempo): non ha righe preparate, non si tocca; si rilegge
        if (adessoX && adessoX.esito === "nuova" && adessoX.colore !== "rosso" && adessoX.xml && !righe[x.chiave]) { e.errori.push(`${x.report.fornitore} ${x.report.numero}: è cambiata nel programma dopo la lettura; non l'ho toccata: rileggere i file`); return null; }
        return adessoX || x;
      }).filter(Boolean);
      // controllo dei doppioni PRIMA di segnare «in lavorazione» e PRIMA del debito (ricontrollo indipendente, punto 2, N2, N4):
      // se il documento è già nel programma con le sue righe (per esempio caricato da PDF o Excel con un'altra scheda del fornitore)
      // non si tocca: né elenco «in lavorazione», né debito, né righe
      const esclusi = new Map();
      const daFare = new Map();
      for (const x of fotografia) {
        const sue = (x.esito === "nuova" && x.colore !== "rosso" && x.xml && righe[x.chiave]) || [];
        if (!sue.length) continue;
        const r0 = sue[0];
        const pivaDoc = pulisciPiva(x.xml?.piva || x.report.piva);
        const fids = [...new Set([...sue.map(rr => rr.fornitore_obj?.id), ...prog.fornitori.filter(fo => pivaDoc && pulisciPiva(fo.partita_iva) === pivaDoc).map(fo => fo.id)].filter(Boolean))];
        daFare.set(x.chiave, { sue, r0, fids });
        // tutte le righe già nel programma (gli scarti già ricordati e le righe a 0 € non contano): si salta
        if (sue.some(rr => rr.giaCaricata) && sue.every(rr => rr.giaCaricata || rr.giaScartataInPrecedenza || rr.rigaAZero)) {
          esclusi.set(x.chiave, "gia"); e.giaNelProgramma.push(`${x.report.fornitore} ${x.report.numero} del ${dataIt(x.report.data)}`); continue;
        }
        if (sue.some(rr => !rr.giaCaricata && !rr.salvata && !rr.scartata) && fids.length) {
          setPasso(`Controllo dei doppioni: ${x.report.fornitore} ${x.report.numero}`);
          const { data: fs, error: eFs } = await supabase.from("ci_fatture").select("id").in("fornitore_id", fids).eq("numero", r0.numero).eq("data", r0.data);
          if (eFs) throw new Error(`controllo dei doppioni: ${eFs.message}`);
          let presenti = 0;
          if ((fs || []).length) {
            const { count, error: eC } = await supabase.from("ci_articoli_fattura").select("id", { count: "exact", head: true }).in("fattura_id", fs.map(f => f.id));
            if (eC) throw new Error(`controllo dei doppioni: ${eC.message}`);
            presenti += count || 0;
          }
          const { count: nAcq, error: eQ } = await supabase.from("ci_report_acquisto_animali").select("id", { count: "exact", head: true }).in("fornitore_id", fids).eq("numero_fattura", r0.numero).eq("data_fattura", r0.data).is("articolo_fattura_id", null);
          if (eQ) throw new Error(`controllo dei doppioni: ${eQ.message}`);
          presenti += nAcq || 0;
          const attese = sue.filter(rr => rr.giaCaricata || rr.salvata).length;
          if (presenti > attese) {
            esclusi.set(x.chiave, "doppione");
            e.errori.push(`${x.report.fornitore} ${x.report.numero}: nel programma ci sono già ${presenti} righe di questo documento e ne riconosco ${attese}: non registro niente (né debito né righe) per non metterle due volte. Si guarda la fattura in «Fatture passive» (forse è stata caricata da PDF o Excel con un'altra scheda del fornitore, o il fornitore non ha la partita IVA)`);
          }
        }
      }
      // prima si segnano le fatture «in lavorazione», poi si creano i debiti: un'interruzione non le fa sembrare registrate (come «Prima di tutto»)
      await scriviInLavorazione(fotografia.filter(x => x.daDebito && !esclusi.has(x.chiave)).map(x => x.report.idSdi));
      for (const x of fotografia) {
        try {
          if (esclusi.has(x.chiave)) continue;
          const { sue = [], r0, fids = [] } = daFare.get(x.chiave) || {};
          if (x.daDebito) {
            setPasso(`Debito: ${x.report.fornitore} ${x.report.numero}`);
            const fornitoreId = await trovaOCreaFornitoreDebito(x, prog);
            const r = await assicuraScadenze({ lato: "fornitore", fileXml: x.xml.fileXml, fornitoreId, numero: x.xml.numero, data: x.xml.data,
              tipoDocumento: x.xml.tipoDocumento, totale: x.xml.totale, ritenuta: x.xml.ritenuta, rate: x.xml.rate });
            e.debiti += r.create || 0;
          } else if (x.esito === "grigio-scrivi-sdi" && x.colore !== "rosso" && x.trovata?.id && !x.trovata.acquisto && (x.xml?.corpi || 1) > 1) {
            e.sdiNonScritti.push(`${x.report.fornitore} ${x.report.numero}: il file contiene più fatture con un solo Identificativo SdI; non lo scrivo`);
          } else if (x.esito === "grigio-scrivi-sdi" && x.colore !== "rosso" && x.trovata?.id && !x.trovata.acquisto) {
            setPasso(`Identificativo SdI: ${x.report.fornitore} ${x.report.numero}`);
            const { data, error } = await supabase.from("ci_fatture").update({ identificativo_sdi: x.report.idSdi, nome_file_xml: x.report.nomeSdi, tipo_documento: x.xml?.tipoDocumento || x.report.tipo || null })
              .eq("id", x.trovata.id).eq("tipo", "PASSIVA").is("identificativo_sdi", null).select("id");
            if (error) throw new Error(error.message);
            e.sdi += (data || []).length;
            if (!(data || []).length) e.sdiNonScritti.push(`${x.report.fornitore} ${x.report.numero}: nel programma ha già un altro Identificativo SdI`);
          } else if (x.acquistoSenzaDebito && x.xml) {
            setPasso(`Debito dell'acquisto di animali: ${x.report.fornitore} ${x.report.numero}`);
            const r = await assicuraScadenze({ lato: "fornitore", fileXml: x.xml.fileXml, fornitoreId: x.trovata.fornitoreId, numero: x.xml.numero, data: x.xml.data,
              tipoDocumento: x.xml.tipoDocumento, totale: x.xml.totale, ritenuta: x.xml.ritenuta, rate: x.xml.rate });
            e.acquisti += r.create || 0;
          }
          // le righe della fattura nuova, una dopo l'altra, con lo stesso codice di «Carica Fatture»; al primo errore la fattura si ferma
          if (x.esito === "nuova" && x.colore !== "rosso" && x.xml && righe[x.chiave]) {
            let tutteSalvate = true;
            for (const r of sue) {
              if (r.giaCaricata || r.salvata) continue;
              if (r.scartata) {
                if (r.giaScartataInPrecedenza || r.rigaAZero || r.scartoScritto) continue;
                // scartata adesso dalla persona: si ricorda per il futuro, come «🗑️ Scarta e ricorda»
                setPasso(`Riga scartata: ${x.report.fornitore} ${x.report.numero} – ${r.descrizione}`);
                const fid = await trovaOCreaFornitoreRiga(r);
                if (fid) {
                  const { error } = await supabase.from("ci_righe_scartate").upsert([{ fornitore_id: fid, descrizione: r.descrizione.trim() }], { onConflict: "fornitore_id,descrizione" });
                  if (error) throw new Error(`riga scartata non ricordata: ${error.message}`);
                }
                aggiornaRiga(x.chiave, r.id, { scartoScritto: true }, true); e.scartateOra++;
                continue;
              }
              setPasso(`Righe: ${x.report.fornitore} ${x.report.numero} – ${r.descrizione}`);
              const fatto = await salvaRigaFatturaPassiva(r, {
                confermaCespiteDoppio: (_possibili, testo) => chiedi(testo),
                avviso: testo => e.errori.push(`${x.report.fornitore} ${x.report.numero}: ${testo.replace(/^⚠️\s*/, "")}`),
              });
              if (fatto.annullata) { tutteSalvate = false; e.annullate.push(`${x.report.fornitore} ${x.report.numero}: «${r.descrizione}» non registrata (possibile cespite già registrato)`); break; }
              aggiornaRiga(x.chiave, r.id, { salvata: true, idsSalvati: fatto.idsSalvati, regolaCreata: fatto.regolaCreata }, true);
              r.salvata = true; r.idsSalvati = fatto.idsSalvati; e.righe++;
            }
            if (tutteSalvate) e.fatture++;
            // il PDF anche dentro il programma (pulsante «📄 PDF» di Fatture passive e Ricerca), solo se la fattura non ne ha già uno: mai sostituire
            if (tutteSalvate && x.pdf) {
              // la fattura in cui sono state scritte le righe (stessa scheda del fornitore, stesso numero e data delle righe)
              const idDalleRighe = sue.map(rr => rr.idsSalvati?.fatturaId).find(Boolean);
              const { data: fl, error: eF } = idDalleRighe
                ? await supabase.from("ci_fatture").select("id, data").eq("id", idDalleRighe)
                : await supabase.from("ci_fatture").select("id, data").in("fornitore_id", fids.length ? fids : [-1]).eq("numero", r0.numero).eq("data", r0.data).eq("tipo", "PASSIVA");
              if (eF) throw new Error(`PDF nel programma: ${eF.message}`);
              const f = (fl || []).length === 1 ? fl[0] : null;
              const conFattura = sue.some(rr => !rr.scartata && rr.editArea !== "ACQUISTO ANIMALI");
              if (!f && conFattura) e.pdfNo.push(`${x.report.fornitore} ${x.report.numero}: ${(fl || []).length > 1 ? "più fatture con questo numero e data" : "fattura non trovata"}; il PDF si aggiunge da «Fatture passive»`);
              if (f) {
                const { data: gia, error: eP } = await supabase.from("ci_pdf_fatture").select("id").eq("fattura_id", f.id).limit(1);
                if (eP) throw new Error(`PDF nel programma: ${eP.message}`);
                if ((gia || []).length) e.pdfGia++;
                else { setPasso(`PDF nel programma: ${x.report.fornitore} ${x.report.numero}`); await caricaPdf({ id: f.id, data: f.data }, new File([x.pdf.bytes], `${x.pdf.nome || `${x.report.numero}.pdf`}`, { type: "application/pdf" })); e.pdf++; }
              }
            }
          }
        } catch (er) { e.errori.push(`${x.report.fornitore} ${x.report.numero}: ${er.message}`); }
      }
      e.finito = true;
    } catch (er) { e.errori.push(er.message); }
    setEsito(e);
    await confronta();
  });

  // ── 3. Confronto con il Report di Aruba (la funzione «chiusura» di sempre) ──
  async function confronta() {
    try {
      setPasso("Confronto con il Report di Aruba…");
      const prog = await leggiProgramma(); setProgramma(prog);
      const r = statoFatture(lettura.collegato, prog, scelte);
      const anni = new Set(r.map(x => x.anno));
      const conSdi = prog.fatture.filter(f => f.sdi && anni.has(Number(String(f.data).slice(0, 4))));
      setEsitoChiusura({ righe: chiusura(r, conSdi), quando: oraRoma() });
    } catch (er) { setErrore(`Confronto non riuscito: ${er.message}`); }
  }

  // ── 4. Archivia nel cloud (strada A): PDF e XML in FATTURE PASSIVE\anno\FORNITORE\PDF e \XML, gli scarichi in SCARICHI ARUBA\anno ──
  async function controllaCartella(h) {
    // gli stessi controlli di «Carica le fatture da Aruba»: nome, cartelle degli anni, file di riconoscimento e suo codice, PROGRAMMA vuota
    if (h.name !== "FATTURE PASSIVE") return `È stata scelta la cartella «${h.name}»: si sceglie la cartella «FATTURE PASSIVE» dentro «00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE» (quella che contiene FORNITORI, SCARICHI ARUBA e FATTURE PASSIVE DA SMISTARE).`;
    if (!(await haGliAnni(h))) return "Nella cartella scelta non c'è la cartella «FATTURE PASSIVE DA SMISTARE»: non è la cartella FATTURE PASSIVE di Podere Verde.";
    const { data: par, error } = await supabase.from("ci_parametri").select("valore").eq("chiave", PARAMETRO_CODICE).maybeSingle();
    if (error) return `Lettura del codice della cartella: ${error.message}`;
    if (!par?.valore) return "Nel programma non c'è il codice della cartella delle fatture: va avvisato il Dott. Bizzarri.";
    let testo = null;
    try { testo = leggiTesto(await leggiFile(h, `FATTURE PASSIVE DA SMISTARE\\${FILE_RICONOSCIMENTO_FATTURE}`)); } catch { testo = null; }
    if (testo == null) return `In «FATTURE PASSIVE\\FATTURE PASSIVE DA SMISTARE» non c'è il file «${FILE_RICONOSCIMENTO_FATTURE}»: questa non è la cartella in uso.`;
    const r = leggiRiconoscimentoFatture(testo);
    if (r.dismessa) return "Il file di riconoscimento dice «CARTELLA DISMESSA»: questa non è la cartella in uso.";
    if (!r.ok) return "Il file di riconoscimento non dice «Podere Verde, 15117871002, FATTURE PASSIVE».";
    if (r.codice !== par.valore) return `Il codice del file (${r.codice}) è diverso da quello del programma (${par.valore}): non è la cartella giusta.`;
    let rimasti = null; try { rimasti = await fileDentroCartella(await cartella(h, "PROGRAMMA")); } catch { rimasti = null; }
    if (rimasti && rimasti.length) return `In «FATTURE PASSIVE\\PROGRAMMA» ci sono ancora ${rimasti.length} file: vanno spostati in «FATTURE PASSIVE DA SMISTARE» prima di archiviare.`;
    return null;
  }

  const archivia = () => unoAllaVolta(async () => {
    let radice;
    try { radice = await window.showDirectoryPicker({ id: "fatture-passive-podere-verde", mode: "readwrite" }); }
    catch (er) { if (er?.name !== "AbortError") setErrore(`La finestra per scegliere la cartella non si è aperta: ${er.message}`); return; }
    setErrore("");
    const problema = await (async () => { try { return await controllaCartella(radice); } catch (er) { return `La cartella scelta non si legge: ${er.message}`; } })();
    if (problema) { setEsitoArchivio({ cartellaNo: problema, scritti: [], gia: [], nonRegistrate: [], errori: [], scarichi: [], fermo: [] }); return; }
    const ea = { scritti: [], gia: [], nonRegistrate: [], errori: [], scarichi: [], fermo: [], pdfProgramma: 0 };
    try {
      setPasso("Controllo che le fatture siano registrate per intero…");
      const prog = await leggiProgramma(); setProgramma(prog);
      const adessoTutte = statoFatture(lettura.collegato, prog, scelte);
      const ora = new Map(adessoTutte.map(x => [x.chiave, x]));
      // le nuove di questa lettura e quelle registrate e non ancora archiviate (elenco «in lavorazione»), come «Carica le fatture da Aruba»
      const daArchiviare = adessoTutte.filter(x => x.colore !== "rosso" && (x.esito === "nuova" || (x.xml && prog.inLavorazione?.has(String(x.report.idSdi)))));
      for (const x of daArchiviare) {
        const adessoX = ora.get(x.chiave);
        // versione 388: le integrazioni TD16–TD19 non vanno in FORNITORI: si archiviano con «Archivia le integrazioni in FATTURE ESTERE»
        if (!adessoX || adessoX.esito === "nuova" || adessoX.esito === "arancione") { ea.nonRegistrate.push(`${x.report.fornitore} ${x.report.numero} del ${dataIt(x.report.data)}${adessoX?.inParte ? ` (${adessoX.motivo})` : ""}`); continue; }
        // versione 388: le integrazioni TD16–TD19 (registrate) non vanno in FORNITORI: «Archivia le integrazioni in FATTURE ESTERE»
        if (eIntegrazione(x)) { ea.integrazioni = (ea.integrazioni || 0) + 1; continue; }
        const pivaDoc = pulisciPiva(x.xml?.piva || x.report.piva);
        const fornProg = pivaDoc ? prog.fornitori.filter(fo => pulisciPiva(fo.partita_iva) === pivaDoc).sort((p1, p2) => p1.id - p2.id)[0] : null;
        // il limite di lunghezza si calcola sul percorso di rete (il più lungo), non su «Z:\…» (che vale solo per un computer)
        const n = nomeArchivio(x, PERCORSO_FATTURE_PASSIVE_Z, fornProg?.nome || "");
        try {
          setPasso(`Archivio: ${n.nome}`);
          if (x.pdf) { const r = await scriviVerificato(radice, `${n.cartellaPdf}${n.nome}.pdf`, x.pdf.bytes); (r.esito === "Già presente uguale" ? ea.gia : ea.scritti).push(r.percorso); }
          if (x.xml) { const est = /\.p7m$/i.test(x.xml.nomeOriginaleXml || "") ? ".xml.p7m" : ".xml"; const r = await scriviVerificato(radice, `${n.cartellaXml}${n.nome}${est}`, x.xml.byteXml); (r.esito === "Già presente uguale" ? ea.gia : ea.scritti).push(r.percorso); }
          // come «Archivia» 382: il PDF anche nel programma, se la fattura non ne ha già uno (per esempio «Registra» interrotto prima del PDF)
          const fattura = adessoX.trovata && !adessoX.trovata.acquisto ? adessoX.trovata : null;
          if (x.pdf && fattura) {
            const { data: gia, error: eP } = await supabase.from("ci_pdf_fatture").select("id").eq("fattura_id", fattura.id).limit(1);
            if (eP) throw new Error(`PDF nel programma: ${eP.message}`);
            if (!(gia || []).length) { await caricaPdf({ id: fattura.id, data: fattura.data }, new File([x.pdf.bytes], `${n.nome}.pdf`, { type: "application/pdf" })); ea.pdfProgramma++; }
          }
        } catch (er) { ea.errori.push(er.message); }
      }
      const rosseOra = adessoTutte.filter(x => x.colore === "rosso");
      const arancioniOra = adessoTutte.filter(x => x.colore === "arancione" && x.esito === "arancione");
      if (ea.nonRegistrate.length) ea.fermo.push("ci sono fatture non registrate per intero");
      if (rosseOra.length) ea.fermo.push(`ci sono ${rosseOra.length} fatture rosse da sistemare`);
      if (arancioniOra.length) ea.fermo.push(`ci sono ${arancioniOra.length} fatture da guardare`);
      if (fileNonSpiegati.length) ea.fermo.push(`ci sono file o voci che lo scarico non spiega (${fileNonSpiegati.length})`);
      if (ea.errori.length) ea.fermo.push("ci sono stati errori");
      if (!ea.fermo.length) {
        const anniScarico = [...new Set(adessoTutte.map(x => x.anno).filter(Boolean))];
        const anno = anniScarico.length === 1 ? anniScarico[0] : "PIU ANNI";
        for (const f of lettura.file) {
          try {
            setPasso(`Conservo lo scarico «${f.nome}»…`);
            const byte = lettura.bytesFile.get(f.nome).bytes;
            const r = await scriviVerificato(radice, `SCARICHI ARUBA\\${anno}\\${f.nome}`, byte);
            const rilettura = md5(await leggiFile(radice, r.percorso));
            if (rilettura !== f.md5) throw new Error(`la copia di «${f.nome}» nell'archivio non è identica: l'originale resta in FATTURE PASSIVE DA SMISTARE`);
            // l'originale si toglie solo se è proprio in FATTURE PASSIVE DA SMISTARE e identico (byte per byte) a quello letto
            let c;
            try { c = await cancellaOriginale(radice, `FATTURE PASSIVE DA SMISTARE\\${f.nome}`, f.md5); }
            catch (er) { c = `non tolto (${er.message}): se il file era in un'altra cartella (per esempio Download) resta lì`; }
            ea.scarichi.push(`${f.nome}: copiato in ${r.percorso}; originale ${c === "Cancellato" ? "tolto da FATTURE PASSIVE DA SMISTARE" : c === "Non c'era più" ? "non è in FATTURE PASSIVE DA SMISTARE (scelto da un'altra cartella: resta lì)" : c}`);
          } catch (er) { ea.errori.push(er.message); }
        }
        if (!ea.errori.length) { try { await scriviInLavorazione([], adessoTutte.map(x => x.report.idSdi)); } catch (er) { ea.errori.push(er.message); } }
      }
    } catch (er) { ea.errori.push(er.message); }
    setEsitoArchivio(ea);
  });

  // ── 6 bis. Versione 388: le integrazioni TD16–TD19 in FATTURE ESTERE\<anno>, accanto alla fattura estera ──
  const integrazioni = lista.filter(x => eIntegrazione(x) && x.xml && x.colore !== "rosso");
  const [esitoEstere, setEsitoEstere] = useState(null);
  const archiviaEstere = () => unoAllaVolta(async () => {
    let radice;
    try { radice = await window.showDirectoryPicker({ id: "fatture-estere-podere-verde", mode: "readwrite" }); }
    catch (er) { if (er?.name !== "AbortError") setErrore(`La finestra per scegliere la cartella non si è aperta: ${er.message}`); return; }
    if (radice.name !== "FATTURE ESTERE") { setEsitoEstere({ cartellaNo: `È stata scelta la cartella «${radice.name}»: si sceglie la cartella «FATTURE ESTERE» dentro «00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE».`, scritti: [], gia: [], nonRegistrate: [], errori: [] }); return; }
    const ee = { scritti: [], gia: [], nonRegistrate: [], errori: [] };
    try {
      const prog = await leggiProgramma(); setProgramma(prog);
      const ora = new Map(statoFatture(lettura.collegato, prog, scelte).map(x => [x.chiave, x]));
      for (const x of integrazioni) {
        const adessoX = ora.get(x.chiave);
        if (!adessoX || adessoX.esito === "nuova" || adessoX.esito === "arancione") { ee.nonRegistrate.push(`${x.report.fornitore} ${x.report.numero} del ${dataIt(x.report.data)}`); continue; }
        const pivaDoc = pulisciPiva(x.xml?.piva || x.report.piva);
        const fornProg = pivaDoc ? prog.fornitori.filter(fo => pulisciPiva(fo.partita_iva) === pivaDoc).sort((p1, p2) => p1.id - p2.id)[0] : null;
        const n = nomeArchivioEstero(x, fornProg?.nome || "");
        try {
          setPasso(`FATTURE ESTERE: ${n.nome}`);
          if (x.pdf) { const r = await scriviVerificato(radice, `${n.cartella}${n.nome}.pdf`, x.pdf.bytes); (r.esito === "Già presente uguale" ? ee.gia : ee.scritti).push(r.percorso); }
          const est = /\.p7m$/i.test(x.xml.nomeOriginaleXml || "") ? ".xml.p7m" : ".xml";
          const r = await scriviVerificato(radice, `${n.cartella}${n.nome}${est}`, x.xml.byteXml); (r.esito === "Già presente uguale" ? ee.gia : ee.scritti).push(r.percorso);
        } catch (er) { ee.errori.push(er.message); }
      }
    } catch (er) { ee.errori.push(er.message); }
    setEsitoEstere(ee);
  });

  // ── Disegno ──
  const lavora = !!passo;
  const bottone = (attivo, colore = C.primary) => ({ background: attivo ? colore : C.muted, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: attivo ? "pointer" : "not-allowed", marginRight: 8 });
  const riquadro = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
  return (
    <div style={{ padding: 20, maxWidth: 1250, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 23, margin: "0 0 4px" }}>Leggi le fatture passive di Aruba</h1>
      <p style={{ color: C.muted, marginTop: 0, fontSize: 13 }}>
        Si scelgono i tre file scaricati da Aruba (XML, PDF, Report Excel). Il programma mostra che cosa ha già e che cosa è nuovo, con le righe già classificate dalle regole di sempre,
        <b> senza scrivere niente</b>. Si completano solo le righe gialle e si preme <b>«Registra»</b>.
      </p>
      <RiquadroDoveSonoIFile cartellaFinale={["FATTURE PASSIVE", "FATTURE PASSIVE DA SMISTARE"]} cosaMetterci="i tre file scaricati da Aruba (XML, PDF, Report Excel)" />
      <div style={{ ...riquadro, background: "#EAF2FB", border: `2px solid ${C.primary}`, fontSize: 15 }}><b>👉 Adesso:</b> {adesso}</div>
      {errore && <div style={{ ...riquadro, background: COLORI.rosso }}>⚠️ {errore}</div>}
      {passo && <div style={{ ...riquadro, background: "#EAF2FB" }}>⏳ {passo}</div>}

      {domanda && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, maxWidth: 640, whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5 }}>
          {domanda.testo.replace(/\n\nOK = [\s\S]*$/, "")}
          <div style={{ marginTop: 14 }}>
            <button style={bottone(true)} onClick={() => domanda.risolvi(true)}>Registra comunque come nuovo cespite</button>
            <button style={bottone(true, C.red)} onClick={() => domanda.risolvi(false)}>Fermati: non registrare questa riga</button>
          </div>
        </div>
      </div>}

      <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>1. Scegli i file</div>
        <label style={{ ...bottone(!lavora && !giaRegistrato), display: "inline-block" }}>
          📂 Scegli i file
          <input ref={inputFile} type="file" accept=".zip,.xml,.p7m,.xls,.xlsx" multiple onChange={scegliFile} disabled={lavora} style={{ display: "none" }} />
        </label>
        <span style={{ fontSize: 12, color: C.muted }}>Si scelgono insieme i tre file .zip di Aruba (tenendo premuto Ctrl). Funziona da qualunque computer e con qualunque browser.</span>
        {lettura && <>
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            {[["REPORT", "Report di Aruba"], ["XML", "XML (le fatture)"], ["PDF", "PDF (le copie da leggere)"]].map(([t, nome]) => {
              const f = lettura.file.filter(x => contiene(x, t)); const campo = { REPORT: "report", XML: "xml", PDF: "pdf" }[t]; const n = conti.reduce((a, c) => a + (c[campo] || 0), 0);
              return <div key={t} style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 700, fontSize: 14, background: f.length ? COLORI.verde : COLORI.rosso }}>{f.length ? "✅" : "❌"} {nome}: {f.length ? `${n} fatture` : "manca"}</div>;
            })}
          </div>
          <div style={{ marginTop: 12, fontWeight: 800 }}>I conti, per anno</div>
          <table style={{ fontSize: 13, borderCollapse: "collapse", marginTop: 6 }}>
            <thead><tr><th style={{ padding: "4px 10px" }}>Anno</th><th>Fatture nel Report</th><th>Fatture negli XML</th><th>Fatture nei PDF</th><th></th></tr></thead>
            <tbody>{conti.map(c => <tr key={c.anno} style={{ background: c.torna ? COLORI.verde : COLORI.rosso }}>
              <td style={{ padding: "4px 10px", fontWeight: 700 }}>{c.anno}</td><td style={{ textAlign: "center" }}>{c.report}</td><td style={{ textAlign: "center" }}>{c.xml}</td><td style={{ textAlign: "center" }}>{c.pdf}</td>
              <td style={{ fontSize: 12, padding: "0 8px" }}>{c.torna ? "✅ torna: Report, XML e PDF hanno le stesse fatture" : "⛔ non torna: nel Report, negli XML e nei PDF non ci sono le stesse fatture"}</td></tr>)}</tbody>
          </table>
          {cosaManca.length > 0 && <div style={{ marginTop: 8, padding: 10, background: COLORI.rosso, fontSize: 13, lineHeight: 1.5 }}><b>Che cosa manca e come si rimedia:</b><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{cosaManca.map((m, i) => <li key={i}>{m.replace(/Il file \.zip va messo in FATTURE PASSIVE DA SMISTARE\./g, "Poi si sceglie anche quel file.")}</li>)}</ul></div>}
          {lettura.collegato.copieDoppie > 0 && <div style={{ marginTop: 8, padding: 8, background: COLORI.arancione, fontSize: 12 }}>Ci sono {lettura.collegato.copieDoppie} copie doppie dello stesso documento: si usa una copia sola.</div>}
          {fileNonSpiegati.length > 0 && <div style={{ marginTop: 8, padding: 8, background: COLORI.rosso, fontSize: 12 }}>
            <b>{fileNonSpiegati.length} file o voci che lo scarico non spiega</b>: si registra lo stesso, ma l'archivio nel cloud non toglie gli scarichi da FATTURE PASSIVE DA SMISTARE finché ci sono.
            <details><summary style={{ cursor: "pointer" }}>Vedi l'elenco</summary>{fileNonSpiegati.join(" · ")}</details></div>}
        </>}
      </div>

      {riconosciute && <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>2. Che cosa ho trovato (non ho scritto niente)</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 13, flexWrap: "wrap" }}>
          {[["grigio", "già nel programma"], ["verde", "nuove a posto"], ["arancione", "da guardare"], ["rosso", "da sistemare: non si registrano"]].map(([k, t]) =>
            <div key={k} style={{ background: COLORI[k], padding: "6px 12px", borderRadius: 8, fontWeight: 700 }}>{quanti[k]} {t}</div>)}
        </div>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead><tr style={{ textAlign: "left" }}><th>Fornitore</th><th>Numero</th><th>Data</th><th style={{ textAlign: "right" }}>Totale</th><th>Esito</th><th>Perché</th><th></th></tr></thead>
          <tbody>{lista.filter(x => x.colore !== "grigio" || x.esito === "grigio-scrivi-sdi" || x.acquistoSenzaDebito).map(x => {
            const rr = righeDi(x); const gialle = rr.filter(rigaDaCompletare).length; const salvate = rr.filter(r => r.salvata).length;
            return <tr key={x.chiave} style={{ background: COLORI[x.colore], borderBottom: "1px solid #ddd" }}>
              <td>{x.report.fornitore}</td><td>{x.report.numero}</td><td>{dataIt(x.report.data)}</td><td style={{ textAlign: "right" }}>{formattaEuro(Number(x.report.totale) || 0)}</td>
              <td>{x.colore === "rosso" ? "da sistemare: non si registra" : x.esito === "grigio-scrivi-sdi" ? "già nel programma, senza SdI: lo scrivo" : x.acquistoSenzaDebito ? "acquisto di animali SENZA DEBITO: lo creo" : x.esito === "nuova" ? (salvate ? `registrate ${salvate} righe su ${rr.length}` : `nuova: ${rr.length} righe${gialle ? `, ${gialle} da completare` : ""}`) : x.esito === "arancione" ? "da guardare" : x.esito}</td>
              <td>{[x.motivo, ...x.avvisi, fornitoreNuovo(x) ? "⚠️ fornitore NON trovato nel programma (né per partita IVA né per nome): con «Registra» nasce una scheda nuova. Prima controllare che non ci sia già con un altro nome o senza partita IVA" : "", x.scartoRighe > 0 ? `le righe sommano ${formattaEuro(x.sommaRighe)}, l'imponibile è ${formattaEuro(x.xml?.imponibile || 0)} (arrotondamento del fornitore)` : ""].filter(Boolean).join(" · ")}</td>
              <td>{x.esito === "arancione" && !giaRegistrato && !lavora && <span style={{ whiteSpace: "nowrap" }}>
                <button style={{ ...bottone(true), padding: "3px 8px", fontSize: 11 }} onClick={() => setScelte(s => ({ ...s, [x.chiave]: "stessa" }))}>È la stessa</button>
                <button style={{ ...bottone(true, C.green || C.primary), padding: "3px 8px", fontSize: 11 }} onClick={() => setScelte(s => ({ ...s, [x.chiave]: "altra" }))}>È un'altra</button></span>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>}

      {riconosciute && nuove.length > 0 && <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>3. Le righe delle fatture nuove ({nuove.length} fatture, {daRegistrare.length} righe da registrare, {daCompletare.length} da completare)</div>
        <div style={{ fontSize: 12.5, marginBottom: 10 }}>Si aprono da sole tutte le fatture nuove. Le righe sono già classificate dalle regole di sempre: si controllano area, centro di costo, destinazione e animali, si cambia quello che non va e si preme <b>«✔ Approvo la classificazione»</b>. Le righe <b style={{ background: COLORI.giallo }}>gialle</b> le regole non le sanno classificare, oppure servono dati in più (trasporto animali, acquisto animali, ammortamenti): vanno completate. «Registra» si accende solo quando la classificazione di tutte le fatture nuove è approvata.</div>
        {nuove.map(x => {
          const rr = righeDi(x); const gialle = rr.filter(rigaDaCompletare);
          const aperta = aperte.has(x.chiave);
          return <div key={x.chiave} data-fattura={x.report.idSdi} style={{ border: `1.5px solid ${gialle.length ? "#E0B800" : C.border}`, borderRadius: 10, marginBottom: 8, background: gialle.length ? "#FFFBEA" : "#fff" }}>
            <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
              onClick={() => { if (aperta) setAperte(s => { const n = new Set(s); n.delete(x.chiave); n.add(`chiusa:${x.chiave}`); return n; }); else setAperte(s => { const n = new Set(s); n.add(x.chiave); n.delete(`chiusa:${x.chiave}`); return n; }); }}>
              <div><b>{x.report.fornitore}</b> · n. {x.report.numero} del {dataIt(x.report.data)} · {formattaEuro(Number(x.report.totale) || 0)} · {rr.length} righe{gialle.length ? <b style={{ color: "#8B6F00" }}> · {gialle.length} da completare</b> : " · tutte classificate"}{confermate.has(x.chiave) ? <b style={{ color: "#1B5E20" }}> · ✅ classificazione approvata</b> : daConfermareX(x) ? <b style={{ color: "#B3261E" }}> · classificazione proposta dal programma · da approvare</b> : null}</div>
              <span style={{ fontSize: 12, color: C.muted }}>{aperta ? "▲ chiudi" : "▼ apri"}</span>
            </div>
            {aperta && <div style={{ padding: "0 12px 10px" }}>
              <DatiFattura x={x} />
              {rr.map(r => (
              <div key={r.id} data-riga={r.id} style={{ marginBottom: 6, background: rigaDaCompletare(r) ? COLORI.giallo : "transparent", borderRadius: 8 }}>
                {!r.giaCaricata && !r.scartata && <div style={{ fontSize: 11.5, color: "#4A4A4A", padding: "4px 10px 0" }}>Proposta: <b>{daDoveViene(r)}</b></div>}
                <RigaFattura riga={r} aree={aree} centriPerArea={centriPerArea} regoleArmonizzazione={rif?.regoleArmonizzazione || []} senzaSalva
                  onChange={campi => !giaRegistrato && !lavora && aggiornaRiga(x.chiave, r.id, { ...campi, toccata: true })}
                  onSalva={() => {}}
                  onAnnulla={() => alert("Questa riga è già registrata. Per annullarla si usa «Carica Fatture» o la scheda della fattura.")}
                  onScarta={() => !giaRegistrato && !lavora && aggiornaRiga(x.chiave, r.id, { scartata: true })} />
                {rigaDaCompletare(r) && !r.ambigua && !validaRiga(r) && !giaRegistrato && <div style={{ padding: "0 10px 6px" }}><button disabled={lavora} style={{ ...bottone(!lavora, C.green || C.primary), padding: "3px 10px", fontSize: 11 }} onClick={() => aggiornaRiga(x.chiave, r.id, { toccata: true })}>✔ Va bene così</button> <span style={{ fontSize: 11, color: C.muted }}>La riga è completa: confermo la classificazione proposta.</span></div>}
                {r.ambigua && !giaRegistrato && <div style={{ padding: "4px 10px 6px", fontSize: 12 }}>⚠️ Questa riga potrebbe essere già registrata: un acquisto di animali già salvato ha lo stesso importo di più righe. Guardare il «Report Acquisto Animali» di questa fattura, poi:{" "}
                  <button disabled={lavora} style={{ ...bottone(!lavora), padding: "3px 10px", fontSize: 11 }} onClick={() => aggiornaRiga(x.chiave, r.id, { ambigua: false, toccata: true })}>Registrala</button>
                  <button disabled={lavora} style={{ ...bottone(!lavora, C.muted), padding: "3px 10px", fontSize: 11 }} onClick={() => aggiornaRiga(x.chiave, r.id, { ambigua: false, giaCaricata: true })}>È già registrata</button></div>}
                {!r.giaCaricata && !r.scartata && validaRiga(r) && <div style={{ fontSize: 12, color: C.red, padding: "0 10px 6px" }}>Manca: {validaRiga(r)}</div>}
                {r.scartata && !r.giaScartataInPrecedenza && !r.rigaAZero && !r.salvata && !giaRegistrato && !lavora && <div style={{ padding: "0 10px 6px" }}><button style={{ ...bottone(true, C.muted), padding: "3px 10px", fontSize: 11 }} onClick={() => aggiornaRiga(x.chiave, r.id, { scartata: false })}>↩️ Non scartarla</button> <span style={{ fontSize: 11, color: C.muted }}>Lo scarto si ricorda per il futuro solo con «Registra».</span></div>}
              </div>))}
              {daConfermareX(x) && !giaRegistrato && <div style={{ marginTop: 6 }}>
                {(() => { const q = quadratura(x); if (!q.nonTorna) return null; return <div style={{ marginBottom: 6, padding: 8, background: COLORI.rosso, borderRadius: 6, fontSize: 12.5 }}>
                  ⛔ Le righe che si registrano sommano <b>{formattaEuro(q.somma)}</b>, l'imponibile della fattura è <b>{formattaEuro(q.imp)}</b>: differenza <b>{formattaEuro(q.diff)}</b>. Controllare quale riga manca o è stata scartata.
                  <label style={{ display: "block", marginTop: 4 }}><input type="checkbox" checked={differenzeViste.has(x.chiave)} disabled={lavora} onChange={ev => setDifferenzeViste(s => { const n = new Set(s); if (ev.target.checked) n.add(x.chiave); else n.delete(x.chiave); return n; })} /> Ho controllato: la differenza è giusta</label>
                </div>; })()}
                <button disabled={lavora || gialle.length > 0 || (quadratura(x).nonTorna && !differenzeViste.has(x.chiave))} style={{ ...bottone(!lavora && !gialle.length && !(quadratura(x).nonTorna && !differenzeViste.has(x.chiave)), C.green || C.primary), padding: "5px 14px", fontSize: 13 }}
                  onClick={() => { setConfermate(s => new Set([...s, x.chiave])); setAperte(s => { const n = new Set(s); n.delete(x.chiave); n.add(`chiusa:${x.chiave}`); return n; }); }}>✔ Approvo la classificazione</button>
                {gialle.length > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: C.red }}>Prima si completano le {gialle.length} righe gialle.</span>}
              </div>}
            </div>}
          </div>;
        })}
      </div>}

      {riconosciute && <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>4. Registra</div>
        <div style={{ fontSize: 12.5, marginBottom: 8 }}>Per ogni fattura nuova il programma crea il debito verso il fornitore, registra le righe (come «Carica Fatture») e mette il PDF nel programma. Scrive anche gli Identificativi SdI e i debiti che mancano alle fatture già presenti. Poi confronta con il Report di Aruba.</div>
        <button style={bottone(puoRegistrare)} disabled={!puoRegistrare} onClick={registra}>💾 Registra</button>
        {!contiOk && lettura && <span style={{ fontSize: 12, color: C.red }}>I conti non tornano (Report, XML e PDF non hanno le stesse fatture): non si registra.</span>}
        {arancioniAperte.length > 0 && <span style={{ fontSize: 12, color: C.red }}>Decidi prima le {arancioniAperte.length} fatture da guardare.</span>}
        {nonValide.length > 0 && <span style={{ fontSize: 12, color: C.red }}>Completa prima le {nonValide.length} righe gialle.</span>}
        {daConfermare.length > 0 && <span style={{ fontSize: 12, color: C.red }}>Approva prima la classificazione delle {daConfermare.length} fatture nuove (pulsante «✔ Approvo la classificazione» in ogni fattura).</span>}
        {!righePronte && <span style={{ fontSize: 12, color: C.red }}>Preparo le righe delle fatture nuove… (se resta così, rileggere i file)</span>}
        {rosse.length > 0 && <div style={{ fontSize: 12, marginTop: 6, color: C.red }}>{rosse.length} fatture rosse non si registrano finché non sono sistemate (il motivo è nella tabella del punto 2).</div>}
        {esito && <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: esito.errori.length || esito.annullate.length ? COLORI.rosso : COLORI.verde, fontSize: 13, lineHeight: 1.5 }}>
          <b>{esito.errori.length || esito.annullate.length ? "Registrato in parte" : "✅ Registrato"}</b>: fatture nuove registrate per intero {esito.fatture} · righe {esito.righe} · debiti creati {esito.debiti} · Identificativi SdI scritti {esito.sdi} · debiti di acquisti di animali {esito.acquisti} · PDF messi nel programma {esito.pdf}{esito.pdfGia ? ` (già c'erano: ${esito.pdfGia})` : ""}{esito.scartateOra ? ` · righe scartate ricordate ${esito.scartateOra}` : ""}
          {esito.giaDaAltri.length > 0 && <div>Registrate nel frattempo da un'altra persona o dall'altra pagina (non toccate): {esito.giaDaAltri.join(" · ")}</div>}
          {esito.giaNelProgramma.length > 0 && <div>Già nel programma con tutte le righe (riconosciute dal fornitore, numero e data): non toccate, nessun debito creato: {esito.giaNelProgramma.join(" · ")}</div>}
          {esito.sdiNonScritti.length > 0 && <div>Identificativo SdI NON scritto: {esito.sdiNonScritti.join(" · ")}</div>}
          {esito.annullate.length > 0 && <div>Non registrate: {esito.annullate.join(" · ")}</div>}
          {esito.pdfNo.length > 0 && <div>PDF NON messo nel programma: {esito.pdfNo.join(" · ")}</div>}
          {esito.errori.length > 0 && <div>Errori: {esito.errori.join(" · ")}. Si rimedia scegliendo di nuovo gli stessi file e premendo «Registra»: ciò che è già fatto non si rifà.</div>}
        </div>}
      </div>}

      {esitoChiusura && <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>5. Confronto con il Report di Aruba</div>
        {esitoChiusura.righe.map(c => <div key={c.anno} style={{ marginTop: 8, padding: 10, borderRadius: 8, background: c.torna ? COLORI.verde : COLORI.rosso, fontSize: 13 }}>
          <b>{c.anno}</b>: fatture in Aruba {c.aruba} = nel programma {c.presenti} + mancanti {c.mancanti.length}. Nel programma con un Identificativo SdI che Aruba non ha: {c.soloNelProgramma.length}.
          {c.torna ? " ✅ Torna." : <div>⛔ Non torna. {c.mancanti.length > 0 && <>Mancanti: {c.mancanti.map(m => `${m.report.fornitore} ${m.report.numero} del ${dataIt(m.report.data)}`).join(" · ")}. </>}
            {c.soloNelProgramma.length > 0 && <>Solo nel programma: {c.soloNelProgramma.map(p => `${p.numero} del ${dataIt(p.data)}`).join(" · ")}.</>}</div>}
        </div>)}
        <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Confronto fatto il {esitoChiusura.quando}.</div>
      </div>}

      {esito && <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>6. Archivia nel cloud (facoltativo)</div>
        <div style={{ fontSize: 12.5, marginBottom: 8 }}>Solo da un computer che raggiunge la cartella FATTURE PASSIVE del cloud, con Chrome o Edge. Si sceglie la cartella <b>FATTURE PASSIVE</b>: il programma mette PDF e XML di ogni fattura in <b>{"FATTURE PASSIVE\\FORNITORI\\NOME FORNITORE\\ANNO aaaa"}</b> (con il nome del fornitore scritto nel programma), oppure in <b>{"FATTURE PASSIVE\\PROFESSIONISTI\\…"}</b> se la fattura ha la ritenuta d'acconto, conserva i tre file in <b>{"SCARICHI ARUBA\\anno"}</b> e li toglie da FATTURE PASSIVE DA SMISTARE solo se le copie sono identiche. Se questo computer non raggiunge il cloud, è tutto registrato lo stesso: l'archivio lo fa chi raggiunge la cartella (rileggendo gli stessi file).</div>
        {conFinestraCartelle
          ? <button style={bottone(!lavora)} disabled={lavora} onClick={archivia}>🗄️ Archivia nel cloud</button>
          : <div style={{ fontSize: 12, padding: 8, background: COLORI.arancione, borderRadius: 8 }}>Con questo browser l'archivio nel cloud non si può fare (serve Chrome o Edge). È tutto registrato: l'archivio lo fa chi usa Chrome o Edge e raggiunge la cartella.</div>}
        {esitoArchivio && <div style={{ marginTop: 8, padding: 8, background: esitoArchivio.cartellaNo || esitoArchivio.fermo.length || esitoArchivio.errori.length ? COLORI.rosso : COLORI.verde, fontSize: 12 }}>
          {esitoArchivio.cartellaNo ? <>⛔ {esitoArchivio.cartellaNo} Non ho scritto niente.</> : <>
            File scritti nel cloud: {esitoArchivio.scritti.length} · già presenti uguali: {esitoArchivio.gia.length}{esitoArchivio.pdfProgramma ? ` · PDF messi nel programma: ${esitoArchivio.pdfProgramma}` : ""}
            {esitoArchivio.scritti.length > 0 && <div>Scritti in FATTURE PASSIVE: {esitoArchivio.scritti.join(" · ")}</div>}
            {esitoArchivio.nonRegistrate.length > 0 && <div>Non ancora registrate: {esitoArchivio.nonRegistrate.join(" · ")}</div>}
            {esitoArchivio.integrazioni > 0 && <div>Integrazioni TD16–TD19 ({esitoArchivio.integrazioni}): non vanno qui, si archiviano con il pulsante qui sotto in FATTURE ESTERE.</div>}
            {esitoArchivio.fermo.length > 0 && <div><b>Gli scarichi restano in FATTURE PASSIVE DA SMISTARE:</b> {esitoArchivio.fermo.join("; ")}.</div>}
            {esitoArchivio.scarichi.length > 0 && <div>{esitoArchivio.scarichi.join(" · ")}</div>}
            {esitoArchivio.errori.length > 0 && <div>Errori: {esitoArchivio.errori.join(" · ")}</div>}</>}
        </div>}
        {integrazioni.length > 0 && <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${C.border}` }}>
          <div style={{ fontSize: 12.5, marginBottom: 6 }}><b>Integrazioni IVA per acquisti dall'estero ({integrazioni.length}: {integrazioni.map(x => `${x.report.fornitore} ${x.report.numero}`).join(", ")})</b>: vanno in <b>{"FATTURE ESTERE\\anno"}</b>, accanto alla fattura estera, con il nome «…_INTEGRAZIONE TD18». Si sceglie la cartella <b>FATTURE ESTERE</b>.</div>
          {conFinestraCartelle && <button style={bottone(!lavora)} disabled={lavora} onClick={archiviaEstere}>🌍 Archivia le integrazioni in FATTURE ESTERE</button>}
          {esitoEstere && <div style={{ marginTop: 8, padding: 8, background: esitoEstere.cartellaNo || esitoEstere.errori.length || esitoEstere.nonRegistrate.length ? COLORI.rosso : COLORI.verde, fontSize: 12 }}>
            {esitoEstere.cartellaNo ? <>⛔ {esitoEstere.cartellaNo} Non ho scritto niente.</> : <>
              File scritti in FATTURE ESTERE: {esitoEstere.scritti.length} · già presenti uguali: {esitoEstere.gia.length}
              {esitoEstere.scritti.length > 0 && <div>{esitoEstere.scritti.join(" · ")}</div>}
              {esitoEstere.nonRegistrate.length > 0 && <div>Non ancora registrate (prima «Registra»): {esitoEstere.nonRegistrate.join(" · ")}</div>}
              {esitoEstere.errori.length > 0 && <div>Errori: {esitoEstere.errori.join(" · ")}</div>}</>}
          </div>}
        </div>}
      </div>}
    </div>
  );
}
