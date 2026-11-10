// Versione 355 (10/11/2026, procedura unica di carico — claude/procedura_unica_carico.md, ordine del Dott. Bizzarri):
// pagina «Documenti arrivati: controlla, carica e archivia», con due schede.
// - Fatture passive: i tre file scaricati da Aruba (XML, PDF, Report) si mettono in FATTURE PASSIVE\PROGRAMMA\DA SMISTARE;
//   il programma li legge e li collega con il nome del file SdI, riconosce ciò che ha già (Identificativo SdI, nome del file,
//   partita IVA + data + numero), crea SUBITO il debito delle fatture nuove (regola: il debito non salta mai), fa classificare
//   e registrare le righe con la pagina di sempre (CaricaFatture, incorporata), archivia PDF e XML nel cloud e chiude solo
//   se il confronto con il Report di Aruba torna.
// - F24: la pagina «F24 arrivati» di oggi, senza cambiamenti (fase 4 del progetto).
import { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";
import { fetchAllPages, leggiInBlocchi, formattaEuro } from "./parsingUtils";
import { C } from "./style";
import { md5 } from "./md5";
import { cartella, leggiFile, elenco, scriviVerificato, cancellaOriginale } from "./archivioF24";
import { assicuraScadenze } from "./documentoFattura";
import { leggiScaricoAruba, collega, contiPerAnno, riconosci, chiusura, nomeArchivio, pulisciPiva, numeroRidotto, PIVA_PODERE, righeMancanti, righeDelDocumento, normDescr } from "./arubaCarico";
import CaricaFatture from "./CaricaFatture";
import F24Arrivati from "./F24Arrivati";
import PagamentiF24 from "./PagamentiF24"; // Versione 355
import { caricaPdf } from "./pdfFatture";

export const FILE_RICONOSCIMENTO_FATTURE = "RICONOSCIMENTO CARTELLA FATTURE PASSIVE - NON TOCCARE.txt";
const PARAMETRO_CODICE = "codice_cartella_fatture_passive";
const leggiTesto = b => (b[0] === 0xff && b[1] === 0xfe ? new TextDecoder("utf-16le").decode(b.subarray(2)) : new TextDecoder("utf-8").decode(b).replace(/^\uFEFF/, ""));
const oraRoma = () => new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date()).replace(", ", " ore ");
const dataIt = d => { const s = String(d || "").slice(0, 10); const [a, m, g] = s.split("-"); return g ? `${g}/${m}/${a}` : (s || "—"); };
function testoRiconoscimentoFatture(codice, quando) {
  return `SOCIETA' AGRICOLA PODERE VERDE A R.L.\r\nCODICE FISCALE: ${PIVA_PODERE}\r\nCARTELLA: FATTURE PASSIVE\r\nCODICE DELLA CARTELLA: ${codice}\r\nCREATO IL: ${quando} DAL PROGRAMMA CONTABILITA' INDUSTRIALE\r\n`;
}
function leggiRiconoscimentoFatture(t) {
  const s = String(t || "");
  if (/CARTELLA DISMESSA/i.test(s)) return { ok: false, dismessa: true };
  const codice = (s.match(/CODICE DELLA CARTELLA:\s*(PV-FP-[A-Z0-9]{8})/) || [])[1] || null;
  const ok = /SOCIETA' AGRICOLA PODERE VERDE A R\.L\./.test(s) && s.includes(`CODICE FISCALE: ${PIVA_PODERE}`) && /CARTELLA:\s*FATTURE PASSIVE\b/.test(s) && !!codice;
  return { ok, codice };
}
function nuovoCodice() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = new Uint8Array(8); crypto.getRandomValues(b);
  return "PV-FP-" + [...b].map(x => a[x % a.length]).join("");
}
const COLORI = { verde: "#E3F2E1", arancione: "#FFF1DC", rosso: "#FBE1DE", grigio: "#F1F1F1" };

// ── Dati del programma che servono al riconoscimento ─────────────────────────────────────────────────
const PARAMETRO_LAVORO = "fatture_passive_in_lavorazione"; // Identificativi SdI delle fatture con il debito creato e non ancora archiviate
async function leggiInLavorazione() {
  const { data, error } = await supabase.from("ci_parametri").select("valore").eq("chiave", PARAMETRO_LAVORO).maybeSingle();
  if (error) throw new Error(`Lettura delle fatture in lavorazione: ${error.message}`);
  try { return { esiste: !!data, sdi: new Set(JSON.parse(data?.valore || "[]").map(String)) }; } catch { throw new Error(`il parametro «${PARAMETRO_LAVORO}» non è leggibile: lo si guarda prima di andare avanti`); }
}
async function scriviInLavorazione(aggiungi = [], togli = []) {
  const ora = await leggiInLavorazione();
  aggiungi.forEach(x => ora.sdi.add(String(x))); togli.forEach(x => ora.sdi.delete(String(x)));
  const valore = JSON.stringify([...ora.sdi].sort());
  const r = ora.esiste
    ? await supabase.from("ci_parametri").update({ valore }).eq("chiave", PARAMETRO_LAVORO).select("chiave")
    : await supabase.from("ci_parametri").insert({ chiave: PARAMETRO_LAVORO, valore, descrizione: "Fatture passive (Identificativo SdI) con il debito creato da «Documenti arrivati» e non ancora archiviate (versione 355)" }).select("chiave");
  if (r.error) throw new Error(`Fatture in lavorazione non aggiornate: ${r.error.message}`);
  if (!(r.data || []).length) throw new Error("Fatture in lavorazione non aggiornate: nessuna riga scritta");
}
async function leggiProgramma() {
  const [f, fo, s, a, dr, lav] = await Promise.all([
    fetchAllPages((da, b) => supabase.from("ci_fatture").select("id, numero, data, fornitore_id, identificativo_sdi, nome_file_xml, totale_lordo, tipo").eq("tipo", "PASSIVA").order("id").range(da, b)),
    fetchAllPages((da, b) => supabase.from("ci_fornitori").select("id, nome, partita_iva").order("id").range(da, b)),
    fetchAllPages((da, b) => supabase.from("ci_scadenze").select("id, file_xml, fattura_id, fornitore_id, numero_documento, data_documento").eq("lato", "fornitore").order("id").range(da, b)),
    fetchAllPages((da, b) => supabase.from("ci_report_acquisto_animali").select("id, fornitore_id, numero_fattura, data_fattura, importo, articolo_fattura_id").order("id").range(da, b)),
    fetchAllPages((da, b) => supabase.from("ci_fatture").select("id, data, fornitore_id").eq("tipo", "DA_RICEVERE").order("id").range(da, b)),
    leggiInLavorazione(),
  ]);
  for (const r of [f, fo, s, a, dr]) if (r.error) throw new Error(r.error.message);
  const piva = new Map((fo.data || []).map(x => [x.id, x.partita_iva]));
  const scad = s.data || [];
  const scadPerDoc = new Set(scad.map(x => `${pulisciPiva(piva.get(x.fornitore_id))}|${x.data_documento}|${numeroRidotto(x.numero_documento)}`));
  const fatture = (f.data || []).map(x => ({ id: x.id, numero: x.numero, data: x.data, piva: piva.get(x.fornitore_id), sdi: x.identificativo_sdi, nomeFile: x.nome_file_xml, totale: x.totale_lordo, fornitoreId: x.fornitore_id }));
  const acquisti = (a.data || []).map(x => ({ id: x.id, numero: x.numero_fattura, data: x.data_fattura, piva: piva.get(x.fornitore_id), fornitoreId: x.fornitore_id, importo: x.importo, conArticolo: x.articolo_fattura_id != null }));
  // righe salvate delle fatture «in lavorazione», per sapere se sono registrate per intero
  const fattLav = fatture.filter(x => x.sdi && lav.sdi.has(String(x.sdi)));
  const articoli = {}; const scartate = {};
  if (fattLav.length) {
    const { data: art, error: eA } = await leggiInBlocchi(fattLav.map(x => x.id), (bl, da, b) => supabase.from("ci_articoli_fattura").select("fattura_id, descrizione").in("fattura_id", bl).order("id").range(da, b));
    if (eA) throw new Error(eA.message);
    (art || []).forEach(r => { (articoli[r.fattura_id] = articoli[r.fattura_id] || []).push(r.descrizione); });
  }
  // le righe scartate di tutti i fornitori (anche di chi ha solo acquisti di animali, che non ha la fattura nel programma)
  if (lav.sdi.size) {
    const { data: sc, error: eS } = await fetchAllPages((da, b) => supabase.from("ci_righe_scartate").select("fornitore_id, descrizione").order("id").range(da, b));
    if (eS) throw new Error(eS.message);
    (sc || []).forEach(r => { (scartate[r.fornitore_id] = scartate[r.fornitore_id] || new Set()).add(normDescr(r.descrizione)); });
  }
  return {
    fornitori: fo.data || [], fatture, acquisti,
    scadenzeXml: scad.filter(x => x.file_xml).map(x => ({ fileXml: x.file_xml, fatturaId: x.fattura_id })),
    fattureDaRicevere: (dr.data || []).map(x => ({ piva: piva.get(x.fornitore_id), anno: Number(String(x.data).slice(0, 4)) })),
    haDebito: k => scadPerDoc.has(k), inLavorazione: lav.sdi, articoli, scartate,
  };
}

// ── Che cosa manca nello scarico, detto con le parole di Aruba (versione 356) ──────────────────────────
const IN_ARUBA = "in Aruba: «Fatture ricevute», l'anno giusto, casella in alto, poi «Seleziona tutti (N)», poi la tendina «Azioni»";
export function cosaMancaNelloScarico(file, conti) {
  const ha = t => file.some(f => f.contenuto === t);
  const out = [];
  if (!ha("REPORT")) out.push(`Manca il Report. Si scarica ${IN_ARUBA} → «Scarica Report Excel» → «APPLICA». Il file .zip va messo in DA SMISTARE.`);
  if (!ha("XML")) out.push(`Manca lo scarico degli XML. Si scarica ${IN_ARUBA} → «Scarica XML» → «APPLICA». Il file .zip va messo in DA SMISTARE.`);
  if (!ha("PDF")) out.push(`Manca lo scarico dei PDF. Si scarica ${IN_ARUBA} → «Scarica PDF» → «APPLICA». Il file .zip va messo in DA SMISTARE.`);
  if (out.length) return out;
  for (const c of conti) {
    if (c.xml !== c.report) out.push(`${c.anno}: il Report ha ${c.report} fatture, lo scarico degli XML ne ha ${c.xml}. Uno dei due è stato scaricato in un altro momento o senza «Seleziona tutti»: si riscaricano tutti e tre insieme, si tolgono i vecchi da DA SMISTARE e si rilegge.`);
    if (c.pdf !== c.report) out.push(`${c.anno}: il Report ha ${c.report} fatture, lo scarico dei PDF ne ha ${c.pdf}. Si riscaricano tutti e tre insieme, si tolgono i vecchi da DA SMISTARE e si rilegge.`);
    if (c.aruba !== null && c.aruba !== undefined && c.aruba !== c.report) out.push(`${c.anno}: Aruba dice ${c.aruba} fatture, il Report ne ha ${c.report}. Controllare il numero scritto; se è giusto, lo scarico è stato fatto senza «Seleziona tutti»: si rifà.`);
  }
  return out;
}

// ── Lo stato di ogni fattura dello scarico (lo usano l'elenco, l'archiviazione e la chiusura) ──────────
const ANOMALIA_GRAVE = /cliente non è|manca l'XML|numero diverso|data diversa|totale diverso/;
export function statoFatture(collegato, prog, scelte = {}) {
  return riconosci(collegato, prog).map(x => {
    const p = pulisciPiva(x.report.piva); const k = `${p}|${x.report.data}|${numeroRidotto(x.report.numero)}`;
    const anomaliaGrave = x.anomalie.some(a => ANOMALIA_GRAVE.test(a));
    const clienteNonPodere = x.anomalie.some(a => /cliente non è/.test(a));
    const scelta = scelte[x.chiave];
    let esito = x.esito, colore = x.colore, motivo = x.motivo, inParte = false;
    if (x.esito === "arancione" && scelta === "stessa") { esito = x.trovata?.acquisto ? "grigio" : "grigio-scrivi-sdi"; colore = anomaliaGrave ? "rosso" : "grigio"; }
    if (x.esito === "arancione" && scelta === "altra") { esito = "nuova"; colore = anomaliaGrave ? "rosso" : x.avvisi.length ? "arancione" : "verde"; }
    // fattura con il debito creato da questa pagina e non ancora archiviata: è registrata solo se lo sono tutte le sue righe
    if (esito.startsWith("grigio") && x.xml && prog.inLavorazione?.has(String(x.report.idSdi))) {
      const fattura = x.trovata && !x.trovata.acquisto ? x.trovata : null;
      const salvate = { descrizioni: fattura ? (prog.articoli[fattura.id] || []) : [],
        importiAcquisti: prog.acquisti.filter(a => !a.conArticolo && `${pulisciPiva(a.piva)}|${a.data}|${numeroRidotto(a.numero)}` === k).map(a => a.importo),
        scartate: prog.scartate[fattura?.fornitoreId ?? x.trovata?.fornitoreId] || new Set() };
      const righe = righeDelDocumento(x.xml); const mancano = righeMancanti(righe, salvate);
      if (mancano.length) { esito = "nuova"; inParte = true; colore = anomaliaGrave ? "rosso" : "verde"; motivo = `registrata in parte: mancano ${mancano.length} righe su ${righe.length}`; }
    }
    const integrazione = /^TD1[6-9]$/.test(String(x.xml?.tipoDocumento || x.report.tipo || ""));
    if (esito === "nuova" && integrazione) { colore = "rosso"; motivo = "integrazione (TD16–TD19): non è un debito verso il fornitore e non si carica con questa versione; resta in DA SMISTARE"; }
    const acquistoSenzaDebito = esito === "grigio" && x.trovata?.acquisto && !x.trovata.debitoSoltanto && !x.trovata.fileXml && !prog.haDebito(k) && !anomaliaGrave;
    // il debito nasce alla lettura per ogni fattura nuova di Podere Verde, anche rossa (regola 2), tranne integrazioni e fatture già in parte registrate
    const daDebito = esito === "nuova" && !!x.xml && !inParte && !integrazione && !clienteNonPodere;
    return { ...x, esito, colore, motivo, inParte, integrazione, acquistoSenzaDebito, daDebito, anomaliaGrave };
  });
}

export default function DocumentiArrivati({ utente, accesso, vediF24 = true }) {
  const [scheda, setScheda] = useState("fatture");
  const stileScheda = attiva => ({ padding: "8px 18px", borderRadius: "10px 10px 0 0", border: `1.5px solid ${C.border}`, borderBottom: attiva ? "none" : `1.5px solid ${C.border}`,
    background: attiva ? C.card : "#F4F4F4", fontWeight: 800, fontSize: 14, cursor: "pointer", color: attiva ? C.primary : C.muted });
  return (
    <div>
      <div style={{ display: "flex", gap: 6, padding: "16px 20px 0" }}>
        <button style={stileScheda(scheda === "fatture")} onClick={() => setScheda("fatture")}>🧾 Fatture passive</button>
        {vediF24 && <button style={stileScheda(scheda === "f24")} onClick={() => setScheda("f24")}>🏛️ F24</button>}
      </div>
      {/* le due schede restano montate: cambiare scheda non fa perdere il lavoro in corso */}
      <div style={{ display: scheda === "fatture" ? "block" : "none" }}><SchedaFatture utente={utente} accesso={accesso} /></div>
      {vediF24 && scheda === "f24" && <><F24Arrivati utente={utente} accesso={accesso} /><PagamentiF24 utente={utente} /></>}
    </div>
  );
}

function SchedaFatture({ accesso }) {
  const admin = !!accesso?.admin;
  const [radice, setRadice] = useState(null);           // cartella FATTURE PASSIVE scelta
  const [ricon, setRicon] = useState(null);             // { ok, problema, manca, codiceFile }
  const [lettura, setLettura] = useState(null);         // { file, scarico, collegato, carta, bytesFile }
  const [totaliAruba, setTotaliAruba] = useState({});   // { anno: N scritto dalla persona }
  const [programma, setProgramma] = useState(null);
  const [scelte, setScelte] = useState({});             // { chiave: "stessa" | "altra" } per le arancioni
  const [passo, setPasso] = useState("");               // messaggio di lavoro in corso
  const [errore, setErrore] = useState("");
  const [esitoDebiti, setEsitoDebiti] = useState(null);
  const [congelate, setCongelate] = useState(null);     // l'elenco com'era al momento di «Prima di tutto»
  const [inCarico, setInCarico] = useState(null);       // documenti passati alla classificazione
  const [esitoArchivio, setEsitoArchivio] = useState(null);
  const [esitoChiusura, setEsitoChiusura] = useState(null);
  const occupato = useRef(false);                       // un solo lavoro alla volta (niente doppio clic)
  const conFinestra = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
  async function unoAllaVolta(lavoro) {
    if (occupato.current) return;
    occupato.current = true;
    try { await lavoro(); } finally { occupato.current = false; setPasso(""); }
  }

  // ── 1. La cartella e il suo file di riconoscimento ──
  async function scegliCartella() {
    setErrore(""); setLettura(null); setProgramma(null); setEsitoDebiti(null); setCongelate(null); setInCarico(null); setEsitoArchivio(null); setEsitoChiusura(null);
    let h;
    try { h = await window.showDirectoryPicker({ id: "fatture-passive-podere-verde", mode: "readwrite" }); }
    catch (e) { if (e?.name !== "AbortError") setErrore(`La finestra per scegliere la cartella non si è aperta: ${e.message}`); return; }
    if (h.name !== "FATTURE PASSIVE") { setRicon({ ok: false, problema: `È stata scelta la cartella «${h.name}»: si sceglie solo la cartella «FATTURE PASSIVE» dentro «00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE». Mi fermo.` }); return; }
    const { data: par, error } = await supabase.from("ci_parametri").select("valore").eq("chiave", PARAMETRO_CODICE).maybeSingle();
    if (error) { setErrore(`Lettura del codice della cartella: ${error.message}`); return; }
    let testo = null;
    try { testo = leggiTesto(await leggiFile(h, `PROGRAMMA\\${FILE_RICONOSCIMENTO_FATTURE}`)); } catch { testo = null; }
    if (testo == null) {
      // si prepara solo la prima volta in assoluto (nessun codice nel programma); se il codice c'è, una cartella senza file non è quella in uso
      setRadice(par?.valore ? null : h);
      setRicon({ ok: false, manca: !par?.valore, problema: par?.valore
        ? `In «FATTURE PASSIVE\\PROGRAMMA» non c'è il file «${FILE_RICONOSCIMENTO_FATTURE}», ma il programma ha già il codice di una cartella: questa non è la cartella in uso. Mi fermo.`
        : `In «FATTURE PASSIVE\\PROGRAMMA» non c'è il file «${FILE_RICONOSCIMENTO_FATTURE}»: la cartella non è ancora preparata. Mi fermo.` });
      return;
    }
    const r = leggiRiconoscimentoFatture(testo);
    if (r.dismessa) { setRicon({ ok: false, problema: "Il file di riconoscimento dice «CARTELLA DISMESSA»: questa non è la cartella in uso. Mi fermo." }); return; }
    if (!r.ok) { setRicon({ ok: false, problema: "Il file di riconoscimento non dice «Podere Verde, 15117871002, FATTURE PASSIVE»: mi fermo." }); return; }
    if (!par?.valore) { setRadice(h); setRicon({ ok: false, manca: true, codiceFile: r.codice, problema: "Nel programma non c'è ancora il codice della cartella delle fatture: lo scrive il Dott. Bizzarri con «Prepara la cartella»." }); return; }
    if (r.codice !== par.valore) { setRicon({ ok: false, problema: `Il codice del file (${r.codice}) è diverso da quello del programma (${par.valore}): non è la cartella giusta. Mi fermo.` }); return; }
    setRadice(h); setRicon({ ok: true, codice: r.codice });
  }
  async function preparaCartella() {
    if (!admin || !radice) return;
    if (!window.confirm("Preparare la cartella FATTURE PASSIVE di Podere Verde? Si creano PROGRAMMA\\DA SMISTARE e PROGRAMMA\\DA SMISTARE\\CARTA, e si scrivono il file di riconoscimento e il suo codice nel programma.")) return;
    setErrore("");
    try {
      const { data: par, error: eP } = await supabase.from("ci_parametri").select("valore").eq("chiave", PARAMETRO_CODICE).maybeSingle();
      if (eP) throw new Error(eP.message);
      if (par?.valore) throw new Error("il programma ha già il codice di una cartella delle fatture: non si prepara una seconda cartella");
      const codice = ricon?.codiceFile || nuovoCodice();
      // prima il file, poi il codice nel programma: se il codice non si scrive, il file c'è e «Prepara» lo riprende (revisione, N4)
      await cartella(radice, "PROGRAMMA\\DA SMISTARE\\CARTA", true);
      if (!ricon?.codiceFile) await scriviVerificato(radice, `PROGRAMMA\\${FILE_RICONOSCIMENTO_FATTURE}`, new TextEncoder().encode(testoRiconoscimentoFatture(codice, oraRoma())));
      const { error } = await supabase.from("ci_parametri").insert({ chiave: PARAMETRO_CODICE, valore: codice, descrizione: "Codice del file di riconoscimento della cartella FATTURE PASSIVE (versione 355)" });
      if (error) throw new Error(`codice nel programma: ${error.message}`);
      setRadice(null); setRicon(null);
      alert("Cartella preparata. Ora premi di nuovo «Scegli la cartella».");
    } catch (e) { setErrore(`Preparazione non riuscita: ${e.message}`); }
  }

  // ── 2. Lettura di DA SMISTARE ──
  const leggiCartella = () => unoAllaVolta(async () => {
    // con la classificazione aperta, rileggere chiude la pagina di classificazione: le righe non salvate si perdono (revisione, N9)
    if (inCarico && !window.confirm("La classificazione è aperta: rileggendo la cartella si chiude, e le righe non ancora salvate vanno perse (quelle salvate restano). Rileggere?")) return;
    setErrore(""); setLettura(null); setEsitoDebiti(null); setCongelate(null); setInCarico(null); setEsitoArchivio(null); setEsitoChiusura(null); setScelte({});
    try {
      setPasso("Leggo i file di DA SMISTARE…");
      const dir = await cartella(radice, "PROGRAMMA\\DA SMISTARE");
      const voci = (await elenco(dir)).filter(x => x.tipo === "file" && !x.nome.startsWith("~$") && !/^PROVVISORIO /.test(x.nome));
      const carta = await (async () => { try { return (await elenco(await cartella(radice, "PROGRAMMA\\DA SMISTARE\\CARTA"))).filter(x => x.tipo === "file").length; } catch { return 0; } })();
      const file = [];
      for (const v of voci) { const b = new Uint8Array(await (await v.handle.getFile()).arrayBuffer()); file.push({ nome: v.nome, bytes: b, md5: md5(b), byte: b.length }); }
      if (!file.length) { setErrore("In DA SMISTARE non ci sono file."); return; }
      setPasso("Riconosco il contenuto dei file…");
      const scarico = await leggiScaricoAruba(XLSX, file);
      const collegato = collega(scarico);
      setPasso("Leggo il programma…");
      const prog = await leggiProgramma();
      setProgramma(prog);
      setLettura({ file: file.map(f => ({ nome: f.nome, md5: f.md5, byte: f.byte, contenuto: scarico.file.find(x => x.nome === f.nome)?.contenuto, voci: scarico.file.find(x => x.nome === f.nome)?.voci })), scarico, collegato, carta, bytesFile: new Map(file.map(f => [f.nome, f])) });
    } catch (e) { setErrore(`Lettura non riuscita: ${e.message}`); }
  });

  const riconosciute = useMemo(() => (lettura && programma ? statoFatture(lettura.collegato, programma, scelte) : null), [lettura, programma, scelte]);
  const conti = useMemo(() => (lettura ? contiPerAnno(lettura.collegato, totaliAruba) : []), [lettura, totaliAruba]);
  const contiOk = conti.length > 0 && conti.every(c => c.torna && c.aruba !== null);
  // Versione 356 (ordine del Dott. Bizzarri del 10/11/2026 ore 19:51): la pagina dice in chiaro che cosa manca e dove si prende in Aruba
  const cosaManca = lettura ? cosaMancaNelloScarico(lettura.file, conti) : [];
  const lista = congelate || riconosciute || [];
  const nuove = lista.filter(x => x.esito === "nuova" && x.colore !== "rosso");
  const arancioniAperte = lista.filter(x => x.colore === "arancione" && x.esito === "arancione");
  const rosse = lista.filter(x => x.colore === "rosso");
  const quanti = { grigio: 0, verde: 0, arancione: 0, rosso: 0 }; lista.forEach(x => { quanti[x.colore]++; });
  // file che lo scarico non spiega: finché ci sono, niente esce da DA SMISTARE
  const fileNonSpiegati = lettura ? [
    ...lettura.scarico.scartati,
    ...lettura.file.filter(f => !["XML", "PDF", "REPORT"].includes(f.contenuto)).map(f => `${f.nome}: contenuto ${f.contenuto}`),
    ...lettura.collegato.xmlSenzaReport.map(d => `XML senza riga nel Report: ${d.fileXml}`),
    ...lettura.collegato.pdfSenzaReport.map(p => `PDF senza riga nel Report: ${p.nome}`),
  ] : [];

  // ── 3. Prima di tutto: debiti delle nuove, Identificativi SdI, acquisti senza debito ──
  async function trovaOCreaFornitore(x) {
    const p = pulisciPiva(x.xml?.piva || x.report.piva);
    if (!p) throw new Error(`${x.report.fornitore} ${x.report.numero}: partita IVA mancante`);
    const giaQui = programma.fornitori.find(f => pulisciPiva(f.partita_iva) === p);
    if (giaQui) return giaQui.id;
    const { data: perPiva, error } = await supabase.from("ci_fornitori").select("id, nome, partita_iva").in("partita_iva", [p, `IT${p}`]).order("id").limit(1);
    if (error) throw new Error(error.message);
    if (perPiva?.length) return perPiva[0].id;
    const { data: nuovo, error: eN } = await supabase.from("ci_fornitori").insert([{ nome: x.xml?.fornitore || x.report.fornitore, partita_iva: x.xml?.piva || `IT${p}`, gruppo_classificazione: "FRO" }]).select().single();
    if (eN) throw new Error(`fornitore nuovo: ${eN.message}`);
    programma.fornitori.push(nuovo);
    return nuovo.id;
  }
  const primaDiTutto = () => unoAllaVolta(async () => {
    if (!contiOk) { setErrore("I conti in cima non tornano (o manca il numero di Aruba): prima si sistemano."); return; }
    if (esitoDebiti) return;
    setErrore(""); const esito = { debiti: 0, sdi: 0, sdiNonScritti: [], acquisti: 0, errori: [] };
    const fotografia = riconosciute; setCongelate(fotografia);
    // prima si segnano le fatture «in lavorazione», poi si creano i debiti: un'interruzione non le fa sembrare registrate
    try { await scriviInLavorazione(fotografia.filter(x => x.daDebito).map(x => x.report.idSdi)); }
    catch (e) { esito.errori.push(e.message); setEsitoDebiti(esito); return; }
    for (const x of fotografia) {
      try {
        if (x.daDebito) {
          setPasso(`Debito: ${x.report.fornitore} ${x.report.numero}`);
          const fornitoreId = await trovaOCreaFornitore(x);
          const r = await assicuraScadenze({ lato: "fornitore", fileXml: x.xml.fileXml, fornitoreId, numero: x.xml.numero, data: x.xml.data,
            tipoDocumento: x.xml.tipoDocumento, totale: x.xml.totale, ritenuta: x.xml.ritenuta, rate: x.xml.rate });
          esito.debiti += r.create || 0;
        } else if (x.esito === "grigio-scrivi-sdi" && x.colore !== "rosso" && x.trovata?.id && !x.trovata.acquisto && (x.xml?.corpi || 1) > 1) {
          esito.sdiNonScritti.push(`${x.report.fornitore} ${x.report.numero}: il file contiene più fatture con un solo Identificativo SdI; non lo scrivo`);
        } else if (x.esito === "grigio-scrivi-sdi" && x.colore !== "rosso" && x.trovata?.id && !x.trovata.acquisto) {
          setPasso(`Identificativo SdI: ${x.report.fornitore} ${x.report.numero}`);
          const { data, error } = await supabase.from("ci_fatture").update({ identificativo_sdi: x.report.idSdi, nome_file_xml: x.report.nomeSdi, tipo_documento: x.xml?.tipoDocumento || x.report.tipo || null })
            .eq("id", x.trovata.id).eq("tipo", "PASSIVA").is("identificativo_sdi", null).select("id");
          if (error) throw new Error(error.message);
          esito.sdi += (data || []).length;
          if (!(data || []).length) esito.sdiNonScritti.push(`${x.report.fornitore} ${x.report.numero}: nel programma ha già un altro Identificativo SdI`);
        } else if (x.acquistoSenzaDebito && x.xml) {
          setPasso(`Debito dell'acquisto di animali: ${x.report.fornitore} ${x.report.numero}`);
          const r = await assicuraScadenze({ lato: "fornitore", fileXml: x.xml.fileXml, fornitoreId: x.trovata.fornitoreId, numero: x.xml.numero, data: x.xml.data,
            tipoDocumento: x.xml.tipoDocumento, totale: x.xml.totale, ritenuta: x.xml.ritenuta, rate: x.xml.rate });
          esito.acquisti += r.create || 0;
        }
      } catch (e) { esito.errori.push(`${x.report.fornitore} ${x.report.numero}: ${e.message}`); }
    }
    setEsitoDebiti(esito);
  });

  // ── 4. Classificazione e registrazione delle nuove: la pagina di sempre, con i documenti già letti ──
  function classifica() {
    if (inCarico) return; // aperta una volta sola: riaprirla farebbe perdere le righe non salvate
    const docs = nuove.filter(x => x.xml).map(x => { const { byteXml, ...doc } = x.xml; return { ...doc, identificativoSdi: x.report.idSdi, nomeFileSdi: x.report.nomeSdi }; }); // senza i byte del file
    if (!docs.length) { alert("Non ci sono fatture nuove da classificare."); return; }
    setInCarico({ docs, quando: Date.now() });
  }

  // ── 5. Archivia: PDF e XML delle nuove in FATTURE PASSIVE\anno; gli scarichi interi in FATTURE PASSIVE\SCARICHI ARUBA\anno; poi DA SMISTARE ──
  const archivia = () => unoAllaVolta(async () => {
    setErrore(""); const esito = { scritti: [], gia: [], nonRegistrate: [], errori: [], scarichi: [], pdfProgramma: 0, pdfGiaNelProgramma: 0, fermo: [] };
    try {
      setPasso("Controllo che le nuove siano registrate per intero…");
      const prog = await leggiProgramma(); setProgramma(prog);
      const ora = new Map(statoFatture(lettura.collegato, prog, scelte).map(x => [x.chiave, x]));
      // le nuove, e anche quelle create da questa pagina e non ancora archiviate (elenco «in lavorazione»): se la pagina è stata
      // ricaricata dopo aver salvato tutte le righe, alla lettura risultano già nel programma ma i loro file non sono ancora nell'archivio
      const daArchiviare = lista.filter(x => x.colore !== "rosso" && (x.esito === "nuova" || (x.xml && prog.inLavorazione?.has(String(x.report.idSdi)))));
      const percorsoBase = `Z:\\SOCIETA\\SOCIETA' AGRICOLA PODERE VERDE A R.L\\00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE\\FATTURE PASSIVE`;
      for (const x of daArchiviare) {
        const adesso = ora.get(x.chiave);
        if (!adesso || adesso.esito === "nuova" || adesso.esito === "arancione") { esito.nonRegistrate.push(`${x.report.fornitore} ${x.report.numero} del ${dataIt(x.report.data)}${adesso?.inParte ? ` (${adesso.motivo})` : ""}`); continue; }
        const n = nomeArchivio(x, percorsoBase);
        try {
          setPasso(`Archivio: ${n.nome}`);
          if (x.pdf) { const r = await scriviVerificato(radice, `${n.cartella}${n.nome}.pdf`, x.pdf.bytes); (r.esito === "Già presente uguale" ? esito.gia : esito.scritti).push(r.percorso); }
          // il file come è arrivato: un firmato resta .xml.p7m
          if (x.xml) { const est = /\.p7m$/i.test(x.xml.nomeOriginaleXml || "") ? ".xml.p7m" : ".xml"; const r = await scriviVerificato(radice, `${n.cartella}${n.nome}${est}`, x.xml.byteXml); (r.esito === "Già presente uguale" ? esito.gia : esito.scritti).push(r.percorso); }
          // il PDF anche nel programma (pulsante «📄 PDF» di Fatture passive e Ricerca), solo se la fattura non ne ha già uno: mai sostituire
          const fattura = adesso.trovata && !adesso.trovata.acquisto ? adesso.trovata : null;
          if (x.pdf && fattura) {
            const { data: gia, error: eP } = await supabase.from("ci_pdf_fatture").select("id").eq("fattura_id", fattura.id).limit(1);
            if (eP) throw new Error(`PDF nel programma: ${eP.message}`);
            if ((gia || []).length) esito.pdfGiaNelProgramma++;
            else { await caricaPdf({ id: fattura.id, data: fattura.data }, new File([x.pdf.bytes], `${n.nome}.pdf`, { type: "application/pdf" })); esito.pdfProgramma++; }
          }
        } catch (e) { esito.errori.push(e.message); }
      }
      // gli scarichi interi (come sono arrivati) vanno in SCARICHI ARUBA\anno, poi escono da DA SMISTARE, solo se:
      // tutte le nuove sono registrate per intero, nessuna rossa o arancione aperta, nessun file non spiegato, nessun errore
      if (esito.nonRegistrate.length) esito.fermo.push("ci sono fatture non registrate per intero");
      if (rosse.length) esito.fermo.push(`ci sono ${rosse.length} fatture rosse da sistemare`);
      if (arancioniAperte.length) esito.fermo.push(`ci sono ${arancioniAperte.length} fatture da guardare`);
      if (fileNonSpiegati.length) esito.fermo.push(`ci sono file o voci che lo scarico non spiega (${fileNonSpiegati.length})`);
      if (esito.errori.length) esito.fermo.push("ci sono stati errori");
      if (!esito.fermo.length) {
        const anniScarico = [...new Set(lista.map(x => x.anno).filter(Boolean))];
        const anno = anniScarico.length === 1 ? anniScarico[0] : "PIU ANNI";
        for (const f of lettura.file) {
          try {
            setPasso(`Conservo lo scarico «${f.nome}»…`);
            const byte = lettura.bytesFile.get(f.nome).bytes;
            const r = await scriviVerificato(radice, `SCARICHI ARUBA\\${anno}\\${f.nome}`, byte);
            // rilettura dal disco della copia (regola: un originale esce solo se la copia è identica)
            const rilettura = md5(await leggiFile(radice, r.percorso));
            if (rilettura !== f.md5) throw new Error(`la copia di «${f.nome}» nell'archivio non è identica: l'originale resta in DA SMISTARE`);
            const c = await cancellaOriginale(radice, `PROGRAMMA\\DA SMISTARE\\${f.nome}`, f.md5);
            esito.scarichi.push(`${f.nome}: copiato in ${r.percorso}; originale ${c === "Cancellato" ? "tolto da DA SMISTARE" : c}`);
          } catch (e) { esito.errori.push(e.message); }
        }
        // le fatture archiviate escono dall'elenco «in lavorazione»
        if (!esito.errori.length) { try { await scriviInLavorazione([], lista.map(x => x.report.idSdi)); } catch (e) { esito.errori.push(e.message); } }
      }
    } catch (e) { esito.errori.push(e.message); }
    setEsitoArchivio(esito);
  });

  // ── 6. Chiusura contro il Report di Aruba ──
  const chiudi = () => unoAllaVolta(async () => {
    setErrore("");
    try {
      setPasso("Confronto con il Report di Aruba…");
      const prog = await leggiProgramma(); setProgramma(prog);
      // presenti solo le fatture registrate per intero; le scelte della persona sulle «da guardare» valgono anche qui
      const r = statoFatture(lettura.collegato, prog, scelte);
      const anni = new Set(r.map(x => x.anno));
      const conSdi = prog.fatture.filter(f => f.sdi && anni.has(Number(String(f.data).slice(0, 4))));
      setEsitoChiusura({ righe: chiusura(r, conSdi), quando: oraRoma() });
    } catch (e) { setErrore(`Chiusura non riuscita: ${e.message}`); }
  });

  // ── Disegno ──
  const lavora = !!passo;
  const bottone = (attivo, colore = C.primary) => ({ background: attivo ? colore : C.muted, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: attivo ? "pointer" : "not-allowed", marginRight: 8 });
  const riquadro = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
  return (
    <div style={{ padding: 20, maxWidth: 1250, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 23, margin: "0 0 4px" }}>Documenti arrivati: controlla, carica e archivia — Fatture passive</h1>
      <p style={{ color: C.muted, marginTop: 0, fontSize: 13 }}>
        I tre file scaricati da Aruba (XML, PDF, Report Excel) si mettono in <b>FATTURE PASSIVE\PROGRAMMA\DA SMISTARE</b>. Il programma li legge, riconosce ciò che ha già,
        crea subito il debito delle fatture nuove, le fa classificare, archivia PDF e XML nel cloud e chiude solo se il confronto con il Report di Aruba torna.
        <br /><b style={{ color: C.primary }}>📖 Come si fa, passo per passo (anche lo scarico da Aruba): voce «Istruzioni Documenti arrivati», subito sopra questa nel menu.</b>
      </p>
      {!conFinestra && <div style={{ ...riquadro, background: COLORI.rosso }}>Questa pagina funziona solo con Chrome o Edge (serve la finestra per scegliere le cartelle).</div>}
      {errore && <div style={{ ...riquadro, background: COLORI.rosso }}>⚠️ {errore}</div>}
      {passo && <div style={{ ...riquadro, background: "#EAF2FB" }}>⏳ {passo}</div>}

      <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>1. La cartella</div>
        <button style={bottone(conFinestra)} disabled={!conFinestra} onClick={scegliCartella}>Scegli la cartella FATTURE PASSIVE</button>
        <span style={{ fontSize: 12, color: C.muted }}>Disco del cloud → SOCIETA → SOCIETA' AGRICOLA PODERE VERDE A R.L → 00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE → FATTURE PASSIVE</span>
        {ricon && <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: ricon.ok ? COLORI.verde : COLORI.rosso, fontSize: 13 }}>
          {ricon.ok ? `✅ Cartella delle fatture di Podere Verde, in uso (codice ${ricon.codice}).` : `⛔ ${ricon.problema}`}
          {!ricon.ok && ricon.manca && admin && <div style={{ marginTop: 8 }}><button style={bottone(true, C.red)} onClick={preparaCartella}>Prepara la cartella (solo la prima volta)</button></div>}
        </div>}
      </div>

      {ricon?.ok && <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>2. Leggi la cartella DA SMISTARE</div>
        <button style={bottone(!lavora)} disabled={lavora} onClick={leggiCartella}>Leggi la cartella</button>
        {lettura && <>
          <table style={{ width: "100%", fontSize: 12, marginTop: 10, borderCollapse: "collapse" }}>
            <thead><tr style={{ textAlign: "left" }}><th>File</th><th>Contenuto</th><th>Voci</th><th>Impronta</th></tr></thead>
            <tbody>{lettura.file.map(f => <tr key={f.nome} style={{ background: f.contenuto === "ALTRO" ? COLORI.rosso : "transparent" }}><td>{f.nome}</td><td>{f.contenuto}</td><td>{f.voci}</td><td style={{ fontFamily: "monospace" }}>{f.md5.slice(0, 10)}…</td></tr>)}</tbody>
          </table>
          {lettura.scarico.scartati.length > 0 && <div style={{ marginTop: 8, padding: 8, background: COLORI.rosso, fontSize: 12 }}>File o voci scartati: {lettura.scarico.scartati.join(" · ")}</div>}
          {lettura.carta > 0 && <div style={{ marginTop: 8, padding: 8, background: COLORI.arancione, fontSize: 12 }}>In DA SMISTARE\CARTA ci sono {lettura.carta} file: le fatture di carta si caricano con il prompt del carico massivo (questa versione legge solo gli scarichi di Aruba).</div>}
          <div style={{ marginTop: 12, fontWeight: 800 }}>I conti, per anno</div>
          <table style={{ fontSize: 13, borderCollapse: "collapse", marginTop: 6 }}>
            <thead><tr><th style={{ padding: "4px 10px" }}>Anno</th><th>Righe del Report</th><th>XML</th><th>PDF</th><th>Righe totali di Aruba (da scrivere)</th><th></th></tr></thead>
            <tbody>{conti.map(c => <tr key={c.anno} style={{ background: c.torna && c.aruba !== null ? COLORI.verde : COLORI.rosso }}>
              <td style={{ padding: "4px 10px", fontWeight: 700 }}>{c.anno}</td><td style={{ textAlign: "center" }}>{c.report}</td><td style={{ textAlign: "center" }}>{c.xml}</td><td style={{ textAlign: "center" }}>{c.pdf}</td>
              <td><input type="number" style={{ width: 90 }} value={totaliAruba[c.anno] ?? ""} onChange={e => setTotaliAruba(t => ({ ...t, [c.anno]: e.target.value === "" ? undefined : Number(e.target.value) }))} placeholder="es. 209" /></td>
              <td style={{ fontSize: 12, padding: "0 8px" }}>{c.aruba === null || c.aruba === undefined ? "scrivi il numero «righe totali» di Aruba" : c.torna ? "✅ torna" : "⛔ non torna: scarico incompleto o «Seleziona tutti» non premuto"}</td></tr>)}</tbody>
          </table>
          {cosaManca.length > 0 && <div style={{ marginTop: 8, padding: 10, background: COLORI.rosso, fontSize: 13, lineHeight: 1.5 }}><b>Che cosa manca e come si rimedia:</b><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{cosaManca.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
          {lettura.collegato.copieDoppie > 0 && <div style={{ marginTop: 8, padding: 8, background: COLORI.arancione, fontSize: 12 }}>Ci sono {lettura.collegato.copieDoppie} copie doppie dello stesso documento (lo stesso scarico messo due volte): si usa una copia sola; vanno comunque in SCARICHI ARUBA.</div>}
          {fileNonSpiegati.length > 0 && <div style={{ marginTop: 8, padding: 8, background: COLORI.rosso, fontSize: 12 }}>Finché ci sono questi, niente esce da DA SMISTARE: {fileNonSpiegati.join(" · ")}</div>}
        </>}
      </div>}

      {riconosciute && <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>3. Che cosa ho trovato</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 13 }}>
          {[["grigio", "già nel programma"], ["verde", "nuove a posto"], ["arancione", "da guardare"], ["rosso", "da sistemare"]].map(([k, t]) =>
            <div key={k} style={{ background: COLORI[k], padding: "6px 12px", borderRadius: 8, fontWeight: 700 }}>{quanti[k]} {t}</div>)}
        </div>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead><tr style={{ textAlign: "left" }}><th>Fornitore</th><th>Numero</th><th>Data</th><th style={{ textAlign: "right" }}>Totale</th><th>Esito</th><th>Perché</th><th></th></tr></thead>
          <tbody>{lista.filter(x => x.colore !== "grigio" || x.esito === "grigio-scrivi-sdi" || x.acquistoSenzaDebito).map(x =>
            <tr key={x.chiave} style={{ background: COLORI[x.colore], borderBottom: "1px solid #ddd" }}>
              <td>{x.report.fornitore}</td><td>{x.report.numero}</td><td>{dataIt(x.report.data)}</td><td style={{ textAlign: "right" }}>{formattaEuro(Number(x.report.totale) || 0)}</td>
              <td>{x.esito === "grigio-scrivi-sdi" ? "già nel programma, senza SdI: lo scrivo" : x.acquistoSenzaDebito ? "acquisto di animali SENZA DEBITO: lo creo" : x.esito === "nuova" ? "nuova" : x.esito === "arancione" ? "da guardare" : x.esito}</td>
              <td>{[x.motivo, ...x.avvisi, x.scartoRighe > 0 ? `le righe sommano ${formattaEuro(x.sommaRighe)}, l'imponibile è ${formattaEuro(x.xml?.imponibile || 0)} (arrotondamento del fornitore)` : ""].filter(Boolean).join(" · ")}</td>
              <td>{x.esito === "arancione" && !congelate && <span style={{ whiteSpace: "nowrap" }}>
                <button style={{ ...bottone(true), padding: "3px 8px", fontSize: 11 }} onClick={() => setScelte(s => ({ ...s, [x.chiave]: "stessa" }))}>È la stessa</button>
                <button style={{ ...bottone(true, C.green || C.primary), padding: "3px 8px", fontSize: 11 }} onClick={() => setScelte(s => ({ ...s, [x.chiave]: "altra" }))}>È un'altra</button></span>}</td>
            </tr>)}</tbody>
        </table>
        <div style={{ marginTop: 12 }}>
          <button style={bottone(contiOk && !arancioniAperte.length && !esitoDebiti && !lavora)} disabled={!contiOk || arancioniAperte.length > 0 || !!esitoDebiti || lavora} onClick={primaDiTutto}>Prima di tutto: crea i debiti e scrivi gli Identificativi SdI</button>
          {!contiOk && <span style={{ fontSize: 12, color: C.red }}>I conti non tornano: non si va avanti.</span>}
          {arancioniAperte.length > 0 && <span style={{ fontSize: 12, color: C.red }}>Decidi prima le {arancioniAperte.length} fatture da guardare.</span>}
        </div>
        {esitoDebiti && <div style={{ marginTop: 8, padding: 8, background: esitoDebiti.errori.length ? COLORI.rosso : COLORI.verde, fontSize: 12 }}>
          Debiti creati: {esitoDebiti.debiti} · Identificativi SdI scritti: {esitoDebiti.sdi} · Debiti di acquisti di animali creati: {esitoDebiti.acquisti}
          {esitoDebiti.sdiNonScritti.length > 0 && <div>Identificativo SdI NON scritto: {esitoDebiti.sdiNonScritti.join(" · ")}</div>}
          {esitoDebiti.errori.length > 0 && <div>Errori: {esitoDebiti.errori.join(" · ")} — premi di nuovo «Leggi la cartella» e poi «Prima di tutto»: ciò che è già fatto non si rifà.</div>}</div>}
      </div>}

      {esitoDebiti && !esitoDebiti.errori.length && nuove.length > 0 && <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>4. Classifica e registra le fatture nuove ({nuove.length})</div>
        {rosse.length > 0 && <div style={{ padding: 8, background: COLORI.rosso, fontSize: 12, marginBottom: 8 }}>Ci sono {rosse.length} fatture rosse: non entrano nel carico finché non sono sistemate.</div>}
        {!inCarico && <button style={bottone(nuove.length > 0)} disabled={!nuove.length} onClick={classifica}>Apri la classificazione delle {nuove.length} fatture nuove</button>}
        {inCarico && <div style={{ marginTop: 12, border: `2px solid ${C.primary}`, borderRadius: 12 }}><CaricaFatture key={inCarico.quando} documentiIniziali={inCarico.docs} incorporata /></div>}
      </div>}

      {esitoDebiti && !esitoDebiti.errori.length && (inCarico || nuove.length === 0) && <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>5. Archivia (quando tutte le righe sono salvate)</div>
        <button style={bottone(!lavora)} disabled={lavora} onClick={archivia}>Archivia PDF e XML e conserva gli scarichi</button>
        {esitoArchivio && <div style={{ marginTop: 8, padding: 8, background: esitoArchivio.fermo.length ? COLORI.rosso : COLORI.verde, fontSize: 12 }}>
          File scritti nel cloud: {esitoArchivio.scritti.length} · già presenti uguali: {esitoArchivio.gia.length} · PDF messi nel programma: {esitoArchivio.pdfProgramma}{esitoArchivio.pdfGiaNelProgramma ? ` (già c'erano: ${esitoArchivio.pdfGiaNelProgramma})` : ""}
          {esitoArchivio.nonRegistrate.length > 0 && <div>Non ancora registrate (salva prima le loro righe): {esitoArchivio.nonRegistrate.join(" · ")}</div>}
          {esitoArchivio.fermo.length > 0 && <div><b>Gli scarichi restano in DA SMISTARE:</b> {esitoArchivio.fermo.join("; ")}.</div>}
          {esitoArchivio.scarichi.length > 0 && <div>{esitoArchivio.scarichi.join(" · ")}</div>}
          {esitoArchivio.errori.length > 0 && <div>Errori: {esitoArchivio.errori.join(" · ")}</div>}</div>}
      </div>}

      {lettura && <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>6. Chiusura: confronto con il Report di Aruba</div>
        <button style={bottone(!lavora)} disabled={lavora} onClick={chiudi}>Confronta con il Report di Aruba</button>
        {esitoChiusura && esitoChiusura.righe.map(c => <div key={c.anno} style={{ marginTop: 8, padding: 10, borderRadius: 8, background: c.torna ? COLORI.verde : COLORI.rosso, fontSize: 13 }}>
          <b>{c.anno}</b>: fatture in Aruba {c.aruba} = nel programma {c.presenti} + mancanti {c.mancanti.length}. Nel programma con un Identificativo SdI che Aruba non ha: {c.soloNelProgramma.length}.
          {c.torna ? " ✅ Torna. Ricorda: ricalcola il Report Costi di questo anno e poi il Report Riproduttori."
            : <div>⛔ Non torna. {c.mancanti.length > 0 && <>Mancanti: {c.mancanti.map(m => `${m.report.fornitore} ${m.report.numero} del ${dataIt(m.report.data)}`).join(" · ")}. </>}
              {c.soloNelProgramma.length > 0 && <>Solo nel programma: {c.soloNelProgramma.map(p => `${p.numero} del ${dataIt(p.data)}`).join(" · ")}.</>}</div>}
        </div>)}
        {esitoChiusura && <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Confronto fatto il {esitoChiusura.quando}.</div>}
      </div>}
    </div>
  );
}
