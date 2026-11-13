// Versione 377 (13/11/2026, ordine del Dott. Bizzarri: «un caricamento veloce come quello esistente per le fatture passive e l'F24»):
// scheda «Fatture di vendita» di «Documenti arrivati». I tre file scaricati da Aruba in «Fatture inviate» (Scarica XML, Scarica PDF,
// Scarica Report Excel) si mettono in FATTURE ATTIVE\PROGRAMMA\DA SMISTARE; il programma li legge, controlla che i conti tornino
// (Report = XML = PDF = numero di «Seleziona tutti (N)»), le confronta e le registra con la pagina di sempre «Leggi le Fatture di Aruba»
// (incorporata), poi archivia XML e PDF in FATTURE ATTIVE\anno\CLIENTE\XML e \PDF e conserva gli scarichi in FATTURE ATTIVE\SCARICHI ARUBA\anno.
// Un originale esce da DA SMISTARE solo se la sua copia, riletta dal disco, è identica.
import { useState, useMemo, useRef, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { md5 } from "./md5";
import { cartella, leggiFile, elenco, scriviVerificato, cancellaOriginale } from "./archivioF24";
import { pulisciNome, cartellaFornitore, PIVA_PODERE } from "./arubaCarico";
import { leggiFileAruba, caricaArchivio, chiaveNumero } from "./calcoloAruba";
import { caricaPdf } from "./pdfFatture";
import LetturaAruba from "./LetturaAruba";

export const FILE_RICONOSCIMENTO_ATTIVE = "RICONOSCIMENTO CARTELLA FATTURE ATTIVE - NON TOCCARE.txt";
const PARAMETRO_CODICE = "codice_cartella_fatture_attive";
const CHIAVE_CARTELLA = "fatture-attive";
const NOME_CARTELLA = "FATTURE ATTIVE";
const senzaIT = p => String(p || "").toUpperCase().replace(/^IT/, "").replace(/\s/g, "");
const PERCORSO_BASE = `Z:\\SOCIETA\\SOCIETA' AGRICOLA PODERE VERDE A R.L\\00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE\\FATTURE ATTIVE`;
const COLORI = { verde: "#E3F2E1", arancione: "#FFF1DC", rosso: "#FBE1DE", grigio: "#F1F1F1" };
const leggiTesto = b => (b[0] === 0xff && b[1] === 0xfe ? new TextDecoder("utf-16le").decode(b.subarray(2)) : new TextDecoder("utf-8").decode(b).replace(/^\uFEFF/, ""));
const oraRoma = () => new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date()).replace(", ", " ore ");
const dataIt = d => { const s = String(d || "").slice(0, 10); const [a, m, g] = s.split("-"); return g ? `${g}/${m}/${a}` : (s || "—"); };

export function testoRiconoscimentoAttive(codice, quando) {
  return `SOCIETA' AGRICOLA PODERE VERDE A R.L.\r\nCODICE FISCALE: ${PIVA_PODERE}\r\nCARTELLA: ${NOME_CARTELLA}\r\nCODICE DELLA CARTELLA: ${codice}\r\nCREATO IL: ${quando} DAL PROGRAMMA CONTABILITA' INDUSTRIALE\r\n`;
}
export function leggiRiconoscimentoAttive(t) {
  const s = String(t || "");
  if (/CARTELLA DISMESSA/i.test(s)) return { ok: false, dismessa: true };
  const codice = (s.match(/CODICE DELLA CARTELLA:\s*(PV-FA-[A-Z0-9]{8})/) || [])[1] || null;
  const ok = /SOCIETA' AGRICOLA PODERE VERDE A R\.L\./.test(s) && s.includes(`CODICE FISCALE: ${PIVA_PODERE}`) && /CARTELLA:\s*FATTURE ATTIVE\b/.test(s) && !!codice;
  return { ok, codice };
}
function nuovoCodice() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = new Uint8Array(8); crypto.getRandomValues(b);
  return "PV-FA-" + [...b].map(x => a[x % a.length]).join("");
}

// la cartella si sceglie una volta: il browser ricorda il permesso (stesso archivio delle fatture passive, chiave diversa)
const DB_CARTELLE = "podere-verde-cartelle";
function apriDbCartelle() {
  return new Promise((ok, ko) => { const r = indexedDB.open(DB_CARTELLE, 1); r.onupgradeneeded = () => r.result.createObjectStore("cartelle"); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
}
async function ricordaCartella(h) {
  try { const db = await apriDbCartelle(); await new Promise((ok, ko) => { const t = db.transaction("cartelle", "readwrite"); t.objectStore("cartelle").put(h, CHIAVE_CARTELLA); t.oncomplete = ok; t.onerror = () => ko(t.error); }); } catch { /* si sceglie a mano */ }
}
async function cartellaRicordata() {
  try { const db = await apriDbCartelle(); return await new Promise(ok => { const q = db.transaction("cartelle").objectStore("cartelle").get(CHIAVE_CARTELLA); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch { return null; }
}

// ── I conti dello scarico, per anno: Report = XML = PDF = numero di Aruba ──────────────────────────────
// Revisione 377, punto 9: il numero di «Seleziona tutti (N)» è uno per scarico e si confronta con tutte le righe del Report
// (il filtro dell'anno di Aruba può non coincidere con l'anno della data del documento)
export function contiVendite(l, totaleAruba = null) {
  const anni = {};
  const voce = a => (anni[a] = anni[a] || { anno: a, report: 0, xml: 0, pdf: 0 });
  (l.elenco || []).forEach(r => { voce(String(r.data).slice(0, 4)).report++; });
  l.fatture.forEach(f => { const v = voce(String(f.anno)); v.xml++; if (f.pdf) v.pdf++; });
  l.autofatture.forEach(a => { const v = voce(String(a.data).slice(0, 4)); v.xml++; if (a.pdf) v.pdf++; });
  const righe = Object.values(anni).sort((a, b) => b.anno.localeCompare(a.anno)).map(c => ({ ...c, torna: c.report === c.xml && c.xml === c.pdf }));
  const report = (l.elenco || []).length;
  return { anni: righe, report, aruba: totaleAruba, torna: righe.length > 0 && righe.every(c => c.torna) && totaleAruba !== null && totaleAruba === report };
}
// Revisione 377, punti 1 e 13: stesso numero in più XML (vale solo se ognuno ha la sua riga del Report per nome del file e al
// più uno non è scartato) e file XML con più fatture dentro (lotto): non si caricano da questa pagina
export function doppioniVendite(l) {
  const out = [];
  const gruppi = {};
  l.fatture.forEach(f => { (gruppi[chiaveNumero(f.numero, f.anno)] = gruppi[chiaveNumero(f.numero, f.anno)] || []).push(f); });
  for (const g of Object.values(gruppi)) {
    if (g.length < 2) continue;
    const valide = g.filter(f => !/scart/i.test(String(f.stato || "")));
    if (!g.every(f => f.collegataPerFile) || valide.length > 1) out.push(`${g[0].numero} del ${dataIt(g[0].data)} compare in ${g.length} XML (${g.map(f => f.nomeFile).join(", ")}) e il Report non dice quale vale (una sola valida, le altre «scartate», ognuna con il suo nome del file): non si registra niente; dirlo a Claude`);
  }
  const perFile = {}; l.fatture.forEach(f => { perFile[f.nomeFile] = (perFile[f.nomeFile] || 0) + 1; });
  for (const [n, k] of Object.entries(perFile)) if (k > 1) out.push(`il file ${n} contiene ${k} fatture insieme (lotto): questa pagina non lo carica; si carica con «Leggi le Fatture di Aruba»`);
  return out;
}
export function cosaMancaVendite(l, conti) {
  const out = [];
  const IN_ARUBA = "in Aruba: «Fatture inviate», l'anno giusto, casella in alto, poi «Seleziona tutti (N)», poi la tendina «Azioni»";
  if (!l.reportLetti.length) out.push(`Manca il Report. Si scarica ${IN_ARUBA} → «Scarica Report Excel». Il file va messo in DA SMISTARE.`);
  if (!l.numeroXml) out.push(`Manca lo scarico degli XML. Si scarica ${IN_ARUBA} → «Scarica XML». Il file .zip va messo in DA SMISTARE.`);
  if (!l.pdf.length) out.push(`Manca lo scarico dei PDF. Si scarica ${IN_ARUBA} → «Scarica PDF». Il file .zip va messo in DA SMISTARE.`);
  if (out.length) return out;
  for (const c of conti.anni) {
    if (c.xml !== c.report) out.push(`${c.anno}: il Report ha ${c.report} fatture, gli XML ${c.xml}. Si riscaricano tutti e tre insieme con «Seleziona tutti», si tolgono i vecchi da DA SMISTARE e si rilegge.`);
    if (c.pdf !== c.xml) out.push(`${c.anno}: gli XML sono ${c.xml}, i PDF collegati ${c.pdf}. Si riscaricano tutti e tre insieme, si tolgono i vecchi da DA SMISTARE e si rilegge.`);
  }
  if (conti.aruba !== null && conti.aruba !== conti.report) out.push(`Aruba dice ${conti.aruba} fatture, il Report ne ha ${conti.report}. Controllare il numero scritto; se è giusto, lo scarico è stato fatto senza «Seleziona tutti»: si rifà.`);
  return out;
}

// ── Dove va ogni file nell'archivio ─────────────────────────────────────────────────────────────────────
// FATTURE ATTIVE\anno\CLIENTE\XML\CLIENTE_data_numero.xml e …\PDF\…pdf; le autofatture in FATTURE ATTIVE\anno\AUTOFATTURE.
// La cartella del cliente prende il nome scritto nel programma per quella partita IVA (il primo per numero), come per i fornitori;
// il nome del file prende il nome scritto nella fattura (revisione 377, punto 10)
export function nomeArchivioVendita(doc, autofattura = false, nomeClienteProgramma = "") {
  const anno = String(doc.data || "").slice(0, 4) || "SENZA ANNO";
  const nomeCliente = autofattura ? "AUTOFATTURE" : (doc.cliente?.nome || "CLIENTE");
  const cartellaCliente = autofattura ? "AUTOFATTURE" : cartellaFornitore(pulisciNome(nomeClienteProgramma) ? nomeClienteProgramma : nomeCliente);
  const scartata = /scart/i.test(String(doc.stato || ""));
  const coda = `_${doc.data || "SENZA DATA"}_${pulisciNome(String(doc.numero || "").replace(/\//g, "-")) || "SENZA NUMERO"}${scartata ? "_SCARTATA SDI" : ""}`;
  const prima = autofattura ? "AUTOFATTURA" : pulisciNome(nomeCliente).toUpperCase();
  const cartellaXml = `${anno}\\${cartellaCliente}\\XML\\`;
  const cartellaPdf = `${anno}\\${cartellaCliente}\\PDF\\`;
  // stesso limite di 250 caratteri delle fatture passive (versione 359), con la stessa riserva
  const spazio = 250 - PERCORSO_BASE.length - 1 - cartellaXml.length - coda.length - (8 + 26 + 3 + 7);
  const testa = spazio >= 10 ? prima.slice(0, spazio).trim() : prima.slice(0, 10);
  return { cartellaXml, cartellaPdf, nome: `${testa}${coda}` };
}

export default function VenditeArrivate({ accesso, onNavigate }) {
  const admin = !!accesso?.admin;
  const [radice, setRadice] = useState(null);
  const [ricon, setRicon] = useState(null);
  const [ricordata, setRicordata] = useState(null);
  const [lettura, setLettura] = useState(null);         // { l (leggiFileAruba), file: [{ nome, bytes, md5 }], quando }
  const [totaleAruba, setTotaleAruba] = useState(null);  // il numero di «Seleziona tutti (N)»
  const [registrata, setRegistrata] = useState(null);   // { esito, documenti, quando: la lettura registrata }
  const [registrando, setRegistrando] = useState(false); // la pagina di confronto sta scrivendo: niente rilettura (revisione 377, punto 2)
  const [esitoArchivio, setEsitoArchivio] = useState(null);
  const [esitoChiusura, setEsitoChiusura] = useState(null);
  const [passo, setPasso] = useState("");
  const [errore, setErrore] = useState("");
  const occupato = useRef(false);
  const conFinestra = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
  async function unoAllaVolta(lavoro) {
    if (occupato.current) return;
    occupato.current = true;
    try { await lavoro(); } finally { occupato.current = false; setPasso(""); }
  }

  // ── 1. La cartella ──
  useEffect(() => { (async () => {
    const h = await cartellaRicordata(); if (!h) return; setRicordata(h);
    try { if ((await h.queryPermission({ mode: "readwrite" })) === "granted") await verificaCartella(h); } catch { /* si usa il pulsante */ }
  })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function scegliCartella() {
    if (registrando || occupato.current) return;
    let h;
    try { h = await window.showDirectoryPicker({ id: "fatture-attive-podere-verde", mode: "readwrite" }); }
    catch (e) { if (e?.name !== "AbortError") setErrore(`La finestra per scegliere la cartella non si è aperta: ${e.message}`); return; }
    await verificaCartella(h);
  }
  async function usaCartellaRicordata() {
    if (registrando || occupato.current) return;
    if (!ricordata) return;
    try { if ((await ricordata.requestPermission({ mode: "readwrite" })) !== "granted") { setErrore("Il browser non ha dato il permesso sulla cartella: premi «Scegli un'altra volta la cartella» e scegli FATTURE ATTIVE."); return; } }
    catch (e) { setErrore(`La cartella di sempre non si apre (${e.message}): premi «Scegli un'altra volta la cartella» e scegli FATTURE ATTIVE.`); return; }
    await verificaCartella(ricordata);
  }
  function azzera() { setLettura(null); setRegistrata(null); setEsitoArchivio(null); setEsitoChiusura(null); setTotaleAruba(null); }
  async function verificaCartella(h) {
    setErrore(""); azzera();
    if (h.name === "DA SMISTARE" || h.name === "PROGRAMMA") { setRicon({ ok: false, problema: `È stata scelta la cartella «${h.name}», che sta DENTRO quella giusta: si sale a «00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE», si clicca UNA volta «FATTURE ATTIVE» e si preme «Selezione cartella».` }); return; }
    if (h.name !== NOME_CARTELLA) { setRicon({ ok: false, problema: `È stata scelta la cartella «${h.name}»: si sceglie solo la cartella «FATTURE ATTIVE» dentro «00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE». Mi fermo.` }); return; }
    const { data: par, error } = await supabase.from("ci_parametri").select("valore").eq("chiave", PARAMETRO_CODICE).maybeSingle();
    if (error) { setErrore(`Lettura del codice della cartella: ${error.message}`); return; }
    let testo = null;
    try { testo = leggiTesto(await leggiFile(h, `PROGRAMMA\\${FILE_RICONOSCIMENTO_ATTIVE}`)); } catch { testo = null; }
    if (testo == null) {
      setRadice(par?.valore ? null : h);
      setRicon({ ok: false, manca: !par?.valore, problema: par?.valore
        ? `In «FATTURE ATTIVE\\PROGRAMMA» non c'è il file «${FILE_RICONOSCIMENTO_ATTIVE}», ma il programma ha già il codice di una cartella: questa non è la cartella in uso. Mi fermo.`
        : `In «FATTURE ATTIVE\\PROGRAMMA» non c'è il file «${FILE_RICONOSCIMENTO_ATTIVE}»: la cartella non è ancora preparata. Mi fermo.` });
      return;
    }
    const r = leggiRiconoscimentoAttive(testo);
    if (r.dismessa) { setRicon({ ok: false, problema: "Il file di riconoscimento dice «CARTELLA DISMESSA»: questa non è la cartella in uso. Mi fermo." }); return; }
    if (!r.ok) { setRicon({ ok: false, problema: "Il file di riconoscimento non dice «Podere Verde, 15117871002, FATTURE ATTIVE»: mi fermo." }); return; }
    if (!par?.valore) { setRadice(h); setRicon({ ok: false, manca: true, codiceFile: r.codice, problema: "Nel programma non c'è ancora il codice della cartella delle fatture di vendita: lo scrive il Dott. Bizzarri con «Prepara la cartella»." }); return; }
    if (r.codice !== par.valore) { setRicon({ ok: false, problema: `Il codice del file (${r.codice}) è diverso da quello del programma (${par.valore}): non è la cartella giusta. Mi fermo.` }); return; }
    setRadice(h); setRicon({ ok: true, codice: r.codice });
    ricordaCartella(h); setRicordata(h);
  }
  async function preparaCartella() {
    if (!admin || !radice) return;
    if (!window.confirm("Preparare la cartella FATTURE ATTIVE di Podere Verde? Si crea PROGRAMMA\\DA SMISTARE e si scrivono il file di riconoscimento e il suo codice nel programma.")) return;
    setErrore("");
    try {
      const { data: par, error: eP } = await supabase.from("ci_parametri").select("valore").eq("chiave", PARAMETRO_CODICE).maybeSingle();
      if (eP) throw new Error(eP.message);
      if (par?.valore) throw new Error("il programma ha già il codice di una cartella delle fatture di vendita: non si prepara una seconda cartella");
      const codice = ricon?.codiceFile || nuovoCodice();
      await cartella(radice, "PROGRAMMA\\DA SMISTARE", true);
      if (!ricon?.codiceFile) await scriviVerificato(radice, `PROGRAMMA\\${FILE_RICONOSCIMENTO_ATTIVE}`, new TextEncoder().encode(testoRiconoscimentoAttive(codice, oraRoma())));
      const { error } = await supabase.from("ci_parametri").insert({ chiave: PARAMETRO_CODICE, valore: codice, descrizione: "Codice del file di riconoscimento della cartella FATTURE ATTIVE (versione 377)" });
      if (error) throw new Error(`codice nel programma: ${error.message}`);
      setRadice(null); setRicon(null);
      alert("Cartella preparata. Ora premi di nuovo «Scegli la cartella».");
    } catch (e) { setErrore(`Preparazione non riuscita: ${e.message}`); }
  }

  // ── 2. Lettura di DA SMISTARE ──
  const leggiCartella = () => unoAllaVolta(async () => {
    if (registrando) return;
    setErrore(""); azzera();
    try {
      setPasso("Leggo i file di DA SMISTARE…");
      const dir = await cartella(radice, "PROGRAMMA\\DA SMISTARE");
      const voci = (await elenco(dir)).filter(x => x.tipo === "file" && !x.nome.startsWith("~$") && !/^(PROVVISORIO|PROVV) /.test(x.nome));
      const file = []; const nonLetti = [];
      for (const v of voci) {
        try { const b = new Uint8Array(await (await v.handle.getFile()).arrayBuffer()); if (!b.length) throw new Error("il file è vuoto"); file.push({ nome: v.nome, bytes: b, md5: md5(b) }); }
        catch (e) { nonLetti.push(`${v.nome}: ${e.message}`); }
      }
      if (nonLetti.length) { setErrore(`Questi file di DA SMISTARE non si riescono a leggere: ${nonLetti.join(" · ")}. Aprire la cartella in Esplora file, aspettare che il cloud li scarichi e premere di nuovo «Leggi la cartella».`); return; }
      if (!file.length) { setErrore("In DA SMISTARE non ci sono file."); return; }
      setPasso("Riconosco il contenuto dei file…");
      const l = await leggiFileAruba(file.map(f => new File([f.bytes], f.nome)));
      setLettura({ l, file, quando: Date.now() });
    } catch (e) { setErrore(`Lettura non riuscita: ${e.message}`); }
  });

  const conti = useMemo(() => (lettura ? contiVendite(lettura.l, totaleAruba) : { anni: [], report: 0, aruba: null, torna: false }), [lettura, totaleAruba]);
  // la registrazione vale solo per la lettura a cui si riferisce (revisione 377, punto 2)
  const reg = registrata && lettura && registrata.quando === lettura.quando ? registrata : null;
  const stati = lettura ? Object.entries((lettura.l.elenco || []).reduce((a, r) => { const k = r.stato || "(vuoto)"; a[k] = (a[k] || 0) + 1; return a; }, {})) : [];
  const cosaManca = lettura ? cosaMancaVendite(lettura.l, conti) : [];
  // file o voci che lo scarico non spiega: finché ci sono non si registra e niente esce da DA SMISTARE
  const nonSpiegati = lettura ? [
    ...lettura.l.scartati.map(s => `${s.file}: ${s.motivo}`),
    ...lettura.l.pdfSenzaFattura.map(p => `PDF senza fattura: ${p.nome}`),
    ...lettura.l.mancantiNeiFile.map(r => `nel Report ma senza XML: ${r.numero} del ${dataIt(r.data)}`),
    ...lettura.l.fatture.filter(f => !f.inElenco).map(f => `XML senza riga nel Report: ${f.numero} del ${dataIt(f.data)}`),
    ...doppioniVendite(lettura.l),
  ] : [];
  const contiOk = conti.torna && !cosaManca.length;
  const puoRegistrare = contiOk && !nonSpiegati.length;

  // ── 4. Archivio di XML e PDF, poi gli scarichi interi in SCARICHI ARUBA\anno ──
  const archivia = () => unoAllaVolta(async () => {
    setErrore(""); setEsitoChiusura(null);
    const esito = { scritti: [], gia: [], pdfProgramma: 0, pdfGiaNelProgramma: 0, pdfNonCollegati: [], scarichi: [], errori: [], fermo: [] };
    try {
      if (!reg || reg.esito.errori.length) throw new Error("la registrazione di questa lettura non è riuscita per intero: prima si rifà la lettura");
      const l = lettura.l;
      const { attive, clienti } = await caricaArchivio();
      const documenti = [...l.fatture.map(f => ({ f, auto: false })), ...l.autofatture.map(a => ({ f: a, auto: true }))];
      for (const { f, auto } of documenti) {
        const pivaDoc = auto ? "" : senzaIT(f.cliente?.partitaIva);
        const clienteProg = pivaDoc ? (clienti || []).filter(c => senzaIT(c.partita_iva) === pivaDoc).sort((a, b) => a.id - b.id)[0] : null;
        const n = nomeArchivioVendita(f, auto, clienteProg?.nome || "");
        try {
          setPasso(`Archivio: ${n.nome}`);
          const nomeXml = auto ? f.file : f.nomeFile;
          const est = /\.p7m$/i.test(nomeXml || "") ? ".xml.p7m" : ".xml";
          const rx = await scriviVerificato(radice, `${n.cartellaXml}${n.nome}${est}`, f.byteXml);
          (rx.esito === "Già presente uguale" ? esito.gia : esito.scritti).push(rx.percorso);
          if (f.pdf) {
            const rp = await scriviVerificato(radice, `${n.cartellaPdf}${n.nome}.pdf`, f.pdf.bytes);
            (rp.esito === "Già presente uguale" ? esito.gia : esito.scritti).push(rp.percorso);
          }
          // il PDF anche nel programma, per le fatture di vendita registrate (mai sostituire un PDF che c'è già)
          if (!auto && f.pdf && !/scart/i.test(String(f.stato || ""))) {
            // stessa data, stesso numero e stesso totale (revisione 377, punto 5)
            const trovate = (attive || []).filter(x => x.data === f.data && chiaveNumero(x.numero, 0) === chiaveNumero(f.numero, 0) && Math.abs(Number(x.totale_lordo) - Number(f.totale)) < 0.015);
            if (trovate.length !== 1) { esito.pdfNonCollegati.push(`${f.numero} del ${dataIt(f.data)} (${trovate.length ? "più fatture con lo stesso numero" : "non trovata nel programma con lo stesso totale"})`); continue; }
            const { data: gia, error: eP } = await supabase.from("ci_pdf_fatture").select("id").eq("fattura_id", trovate[0].id).limit(1);
            if (eP) throw new Error(`PDF nel programma: ${eP.message}`);
            if ((gia || []).length) esito.pdfGiaNelProgramma++;
            else { await caricaPdf({ id: trovate[0].id, data: trovate[0].data }, new File([f.pdf.bytes], `${n.nome}.pdf`, { type: "application/pdf" })); esito.pdfProgramma++; }
          }
        } catch (e) { esito.errori.push(`${f.numero}: ${e.message}`); }
      }
      if (esito.errori.length) esito.fermo.push("ci sono stati errori nell'archivio");
      // revisione 377, punti 7 e 8: gli scarichi interi si COPIANO tutti (copia riletta e identica); gli originali escono
      // da DA SMISTARE solo dopo la chiusura che torna, e solo se tutte le copie sono a posto
      if (!esito.fermo.length) {
        const anni = [...new Set(conti.anni.map(c => c.anno))];
        const anno = anni.length === 1 ? anni[0] : "PIU ANNI";
        for (const f of lettura.file) {
          try {
            setPasso(`Copio lo scarico «${f.nome}» in SCARICHI ARUBA…`);
            const r = await scriviVerificato(radice, `SCARICHI ARUBA\\${anno}\\${f.nome}`, f.bytes);
            const rilettura = md5(await leggiFile(radice, r.percorso));
            if (rilettura !== f.md5) throw new Error(`la copia di «${f.nome}» nell'archivio non è identica`);
            esito.scarichi.push({ nome: f.nome, md5: f.md5, percorso: r.percorso });
          } catch (e) { esito.errori.push(e.message); }
        }
      }
      esito.quando = lettura.quando;
    } catch (e) { esito.errori.push(e.message); }
    setEsitoArchivio(esito);
  });

  // ── 5. Chiusura: ogni fattura del Report (non scartata, non autofattura) è nel programma ──
  const chiudi = () => unoAllaVolta(async () => {
    setErrore("");
    try {
      setPasso("Confronto con il Report di Aruba…");
      const arch = await caricaArchivio();
      // nel programma: le registrazioni in contabilità e le fatture emesse dal programma ancora valide (revisione, secondo giro, punto 3)
      const nelProgramma = new Set([...arch.attive.map(x => chiaveNumero(x.numero, String(x.data).slice(0, 4))), ...arch.emesse.filter(x => x.stato === "emessa").map(x => chiaveNumero(x.numero, x.anno))]);
      const auto = new Set(lettura.l.autofatture.map(a => chiaveNumero(a.numero, String(a.data).slice(0, 4))));
      const righe = (lettura.l.elenco || []).filter(r => !/scart/i.test(String(r.stato || "")) && !auto.has(chiaveNumero(r.numero, String(r.data).slice(0, 4))));
      const perAnno = {}; const viste = new Set();
      for (const r of righe) {
        const a = String(r.data).slice(0, 4); const c = (perAnno[a] = perAnno[a] || { anno: a, report: 0, presenti: 0, mancanti: [] });
        const k = chiaveNumero(r.numero, a);
        c.report++;
        // una fattura valida si conta una volta sola: due righe valide con lo stesso numero non «tornano» (revisione 377, punto 1)
        if (viste.has(k)) c.mancanti.push(`${r.numero} del ${dataIt(r.data)} (due volte valida nel Report)`);
        else if (nelProgramma.has(k)) c.presenti++; else c.mancanti.push(`${r.numero} del ${dataIt(r.data)}`);
        viste.add(k);
      }
      const esitoC = { righe: Object.values(perAnno).map(c => ({ ...c, torna: !c.mancanti.length })), quando: oraRoma(), tolti: [], errori: [] };
      // la chiusura torna e le copie degli scarichi sono a posto: gli originali escono da DA SMISTARE (solo se ancora identici)
      const archivioOk = esitoArchivio && esitoArchivio.quando === lettura.quando && !esitoArchivio.errori.length && !esitoArchivio.fermo.length && esitoArchivio.scarichi.length === lettura.file.length;
      if (esitoC.righe.every(c => c.torna) && archivioOk) {
        for (const f of esitoArchivio.scarichi) {
          try {
            setPasso(`Tolgo «${f.nome}» da DA SMISTARE…`);
            if (md5(await leggiFile(radice, f.percorso)) !== f.md5) throw new Error(`la copia di «${f.nome}» in SCARICHI ARUBA non è più identica: l'originale resta`);
            const c = await cancellaOriginale(radice, `PROGRAMMA\\DA SMISTARE\\${f.nome}`, f.md5);
            esitoC.tolti.push(`${f.nome}: ${c === "Cancellato" ? "tolto da DA SMISTARE (la copia è in " + f.percorso + ")" : c}`);
          } catch (e) { esitoC.errori.push(e.message); }
        }
      }
      setEsitoChiusura(esitoC);
    } catch (e) { setErrore(`Chiusura non riuscita: ${e.message}`); }
  });

  const adesso = (() => {
    if (!ricon?.ok) {
      if (ricon?.manca && admin) return "Prima volta in assoluto: premi «Prepara la cartella (solo la prima volta)» e conferma; poi scegli di nuovo la cartella.";
      if (ricon && !ricon.ok) return "Il motivo è nel riquadro rosso: scegli la cartella FATTURE ATTIVE.";
      return ricordata ? "Premi «Usa la cartella di sempre»." : "Premi «Scegli la cartella FATTURE ATTIVE»: nella finestra sali a «00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE», clicca UNA volta «FATTURE ATTIVE» e premi «Selezione cartella».";
    }
    if (!lettura) return "Metti in DA SMISTARE i tre file scaricati da Aruba in «Fatture inviate» (Report, XML, PDF), poi premi «Leggi la cartella».";
    if (cosaManca.some(m => /^Manca/.test(m))) return cosaManca.find(m => /^Manca/.test(m));
    if (conti.aruba === null) return "Nella casella gialla scrivi quante fatture dice Aruba: è il numero di «Seleziona tutti (N)» dello scarico.";
    if (!contiOk) return cosaManca[0] || "I conti non tornano: si rifà lo scarico da Aruba con «Seleziona tutti» e si rilegge.";
    if (nonSpiegati.length) return "Ci sono file o voci che lo scarico non spiega (riquadro rosso): si sistemano prima di registrare.";
    if (!reg) return lettura.l.fatture.length ? "Controlla il confronto qui sotto e premi «Registra la lettura»." : "Nello scarico ci sono solo autofatture: premi «Niente da registrare: vai all'archivio».";
    if (reg.esito.errori.length) return "La registrazione ha avuto errori: premi «Leggi la cartella» e rifai; ciò che è già registrato non si rifà.";
    if (!esitoArchivio) return "Premi «Archivia XML e PDF e copia gli scarichi».";
    if (esitoArchivio.errori.length || esitoArchivio.fermo.length) return "L'archiviazione ha avuto errori (riquadro «4. Archivia»): sistemali e premi di nuovo «Leggi la cartella».";
    if (!esitoChiusura) return "Premi «Confronta con il Report di Aruba».";
    if (!esitoChiusura.righe.every(c => c.torna)) return "La chiusura NON torna: le fatture mancanti sono nel riquadro «5. Chiusura». Gli scarichi restano in DA SMISTARE.";
    if (esitoChiusura.errori.length) return "La chiusura torna, ma alcuni scarichi non sono usciti da DA SMISTARE (motivo nel riquadro «5. Chiusura»).";
    return "Fatto: la chiusura torna e gli scarichi sono usciti da DA SMISTARE (le copie sono in SCARICHI ARUBA).";
  })();

  const lavora = !!passo;
  const bottone = (attivo, colore = C.primary) => ({ background: attivo ? colore : C.muted, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: attivo ? "pointer" : "not-allowed", marginRight: 8 });
  const riquadro = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 23, margin: "0 0 4px" }}>Carica le fatture di vendita da Aruba</h1>
      <p style={{ color: C.muted, marginTop: 0, fontSize: 13 }}>
        In Aruba, <b>Fatture inviate</b>: anno, «Seleziona tutti (N)», poi dalla tendina «Azioni» <b>Scarica XML</b>, <b>Scarica PDF</b> e <b>Scarica Report Excel</b>.
        I tre file si mettono in <b>FATTURE ATTIVE\PROGRAMMA\DA SMISTARE</b>. Il programma li legge, controlla i conti, confronta le fatture con quelle del programma,
        le registra quando si preme «Registra la lettura», archivia XML e PDF nella cartella di ogni cliente e conserva gli scarichi.
      </p>
      <div style={{ ...riquadro, background: "#EAF2FB", border: `2px solid ${C.primary}`, fontSize: 15 }}><b>👉 Adesso:</b> {adesso}</div>
      {!conFinestra && <div style={{ ...riquadro, background: COLORI.rosso }}>Questa pagina funziona solo con Chrome o Edge (serve la finestra per scegliere le cartelle).</div>}
      {errore && <div style={{ ...riquadro, background: COLORI.rosso }}>⚠️ {errore}</div>}
      {passo && <div style={{ ...riquadro, background: "#EAF2FB" }}>⏳ {passo}</div>}

      <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>1. La cartella</div>
        {ricordata && !ricon?.ok && <button style={bottone(conFinestra && !lavora && !registrando)} disabled={!conFinestra || lavora || registrando} onClick={usaCartellaRicordata}>Usa la cartella di sempre</button>}
        <button style={bottone(conFinestra && !lavora && !registrando, ricordata && !ricon?.ok ? C.muted : C.primary)} disabled={!conFinestra || lavora || registrando} onClick={scegliCartella}>{ricordata ? "Scegli un'altra volta la cartella" : "Scegli la cartella FATTURE ATTIVE"}</button>
        <span style={{ fontSize: 12, color: C.muted }}>Disco del cloud → SOCIETA → SOCIETA' AGRICOLA PODERE VERDE A R.L → 00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE → FATTURE ATTIVE</span>
        {ricon && <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: ricon.ok ? COLORI.verde : COLORI.rosso, fontSize: 13 }}>
          {ricon.ok ? `✅ Cartella delle fatture di vendita di Podere Verde, in uso (codice ${ricon.codice}).` : `⛔ ${ricon.problema}`}
          {!ricon.ok && ricon.manca && admin && <div style={{ marginTop: 8 }}><button style={bottone(true, C.red)} onClick={preparaCartella}>Prepara la cartella (solo la prima volta)</button></div>}
        </div>}
      </div>

      {ricon?.ok && <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>2. Leggi la cartella DA SMISTARE</div>
        <button style={bottone(!lavora && !registrando)} disabled={lavora || registrando} onClick={leggiCartella}>Leggi la cartella</button>
        {lettura && <>
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 700, fontSize: 14, background: lettura.l.reportLetti.length ? COLORI.verde : COLORI.rosso }}>{lettura.l.reportLetti.length ? "✅" : "❌"} Report di Aruba: {lettura.l.reportLetti.length ? `${(lettura.l.elenco || []).length} righe` : "manca"}</div>
            <div style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 700, fontSize: 14, background: lettura.l.numeroXml ? COLORI.verde : COLORI.rosso }}>{lettura.l.numeroXml ? "✅" : "❌"} XML: {lettura.l.numeroXml ? `${lettura.l.fatture.length + lettura.l.autofatture.length} documenti` : "manca"}</div>
            <div style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 700, fontSize: 14, background: lettura.l.pdf.length ? COLORI.verde : COLORI.rosso }}>{lettura.l.pdf.length ? "✅" : "❌"} PDF: {lettura.l.pdf.length ? `${lettura.l.pdf.length} file` : "manca"}</div>
          </div>
          <details style={{ marginTop: 8, fontSize: 12 }}><summary style={{ cursor: "pointer", color: C.muted }}>File letti ({lettura.file.length})</summary>
            {lettura.file.map(f => <div key={f.nome}>{f.nome} — <span style={{ fontFamily: "monospace" }}>{f.md5.slice(0, 10)}…</span></div>)}</details>
          <div style={{ marginTop: 12, fontWeight: 800 }}>I conti, per anno della fattura</div>
          <table style={{ fontSize: 13, borderCollapse: "collapse", marginTop: 6 }}>
            <thead><tr><th style={{ padding: "4px 10px" }}>Anno</th><th>Righe del Report</th><th>Documenti XML</th><th>PDF collegati</th><th></th></tr></thead>
            <tbody>{conti.anni.map(c => <tr key={c.anno} style={{ background: c.torna ? COLORI.verde : COLORI.rosso }}>
              <td style={{ padding: "4px 10px", fontWeight: 700 }}>{c.anno}</td><td style={{ textAlign: "center" }}>{c.report}</td><td style={{ textAlign: "center" }}>{c.xml}</td><td style={{ textAlign: "center" }}>{c.pdf}</td>
              <td style={{ fontSize: 12, padding: "0 8px" }}>{c.torna ? "✅ Report = XML = PDF" : "⛔ non tornano"}</td></tr>)}</tbody>
          </table>
          <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: conti.torna ? COLORI.verde : conti.aruba === null ? "#FFF6C2" : COLORI.rosso, fontSize: 13 }}>
            Quante fatture dice Aruba per questo scarico? (il numero di «Seleziona tutti (N)»):{" "}
            <input type="number" disabled={!!reg || registrando} style={{ width: 90, background: "#FFF6C2", fontWeight: 700 }} value={totaleAruba ?? ""} onChange={e => setTotaleAruba(e.target.value === "" ? null : Number(e.target.value))} placeholder="es. 25" />
            {" "}{conti.aruba === null ? "← scrivi qui il numero di Aruba" : conti.aruba === conti.report ? `✅ uguale alle ${conti.report} righe del Report` : `⛔ il Report ha ${conti.report} righe`}
          </div>
          {stati.length > 0 && <div style={{ marginTop: 6, fontSize: 12, color: C.muted }}>Stati scritti nel Report: {stati.map(([k, n]) => `«${k}» ${n}`).join(" · ")}. Quelli che contengono «scart» valgono come scartate dal Sistema di Interscambio.</div>}
          {cosaManca.length > 0 && <div style={{ marginTop: 8, padding: 10, background: COLORI.rosso, fontSize: 13, lineHeight: 1.5 }}><b>Che cosa manca e come si rimedia:</b><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{cosaManca.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
          {nonSpiegati.length > 0 && <div style={{ marginTop: 8, padding: 8, background: COLORI.rosso, fontSize: 12 }}>
            <b>{nonSpiegati.length} file o voci che lo scarico non spiega</b>: finché ci sono non si registra e niente esce da DA SMISTARE.
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{nonSpiegati.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
        </>}
      </div>}

      {lettura && puoRegistrare && <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>3. Confronta e registra</div>
        {reg
          ? <div style={{ padding: 8, borderRadius: 8, background: reg.esito.errori.length ? COLORI.rosso : COLORI.verde, fontSize: 13 }}>
              {reg.esito.errori.length ? "⛔ Registrazione con errori: " + reg.esito.errori.join(" · ") : `✅ Registrata: ${reg.esito.registrate.length} nuove, ${reg.esito.collegate.length} del programma collegate, ${reg.esito.aggiornate.length} già in contabilità aggiornate.`}
              {onNavigate && <button onClick={() => onNavigate("controllo-attiva")} style={{ ...bottone(true), marginLeft: 10, padding: "4px 10px", fontSize: 12 }}>Vai ai controlli</button>}
            </div>
          : !lettura.l.fatture.length
            ? <div style={{ fontSize: 13 }}>Nello scarico ci sono solo autofatture ({lettura.l.autofatture.map(a => a.numero).join(", ")}): Podere Verde è il cliente, non si registrano come vendite.{" "}
                <button style={{ ...bottone(!lavora), padding: "4px 10px", fontSize: 12 }} disabled={lavora} onClick={() => setRegistrata({ esito: { registrate: [], collegate: [], aggiornate: [], clientiCompletati: [], errori: [] }, documenti: [], quando: lettura.quando })}>Niente da registrare: vai all'archivio</button></div>
          : <LetturaAruba key={lettura.quando} letturaIniziale={lettura.l} incorporata onLavoro={setRegistrando} onRegistrata={(esito, documenti) => setRegistrata({ esito, documenti, quando: lettura.quando })} />}
      </div>}

      {reg && !reg.esito.errori.length && <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>4. Archivia</div>
        <div style={{ fontSize: 12.5, marginBottom: 8 }}>Ogni fattura va nella cartella del suo cliente: <b>{"FATTURE ATTIVE\\anno\\NOME CLIENTE\\XML"}</b> e <b>{"…\\PDF"}</b>; le autofatture in <b>{"FATTURE ATTIVE\\anno\\AUTOFATTURE"}</b>. Gli scarichi interi si copiano in <b>{"FATTURE ATTIVE\\SCARICHI ARUBA\\anno"}</b>; escono da DA SMISTARE solo dopo la chiusura che torna (passo 5), e solo se la copia è identica.</div>
        <button style={bottone(!lavora)} disabled={lavora} onClick={archivia}>Archivia XML e PDF e copia gli scarichi</button>
        {esitoArchivio && <div style={{ marginTop: 8, padding: 8, background: esitoArchivio.fermo.length || esitoArchivio.errori.length ? COLORI.rosso : COLORI.verde, fontSize: 12 }}>
          File scritti nel cloud: {esitoArchivio.scritti.length} · già presenti uguali: {esitoArchivio.gia.length} · PDF messi nel programma: {esitoArchivio.pdfProgramma}{esitoArchivio.pdfGiaNelProgramma ? ` (già c'erano: ${esitoArchivio.pdfGiaNelProgramma})` : ""}
          {esitoArchivio.pdfNonCollegati.length > 0 && <div>PDF non messi nel programma: {esitoArchivio.pdfNonCollegati.join(" · ")}</div>}
          {esitoArchivio.fermo.length > 0 && <div><b>Gli scarichi non si copiano:</b> {esitoArchivio.fermo.join("; ")}.</div>}
          {esitoArchivio.scarichi.length > 0 && <div>Scarichi copiati (identici): {esitoArchivio.scarichi.map(x => x.percorso).join(" · ")}</div>}
          {esitoArchivio.errori.length > 0 && <div>Errori: {esitoArchivio.errori.join(" · ")}</div>}</div>}
      </div>}

      {reg && <div style={riquadro}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>5. Chiusura: confronto con il Report di Aruba</div>
        <button style={bottone(!lavora)} disabled={lavora} onClick={chiudi}>Confronta con il Report di Aruba</button>
        {esitoChiusura && esitoChiusura.righe.map(c => <div key={c.anno} style={{ marginTop: 8, padding: 10, borderRadius: 8, background: c.torna ? COLORI.verde : COLORI.rosso, fontSize: 13 }}>
          <b>{c.anno}</b>: fatture valide nel Report {c.report} = nel programma {c.presenti} + mancanti {c.mancanti.length}. {c.torna ? "✅ Torna." : `⛔ Non torna. Mancanti: ${c.mancanti.join(" · ")}.`}
        </div>)}
        {esitoChiusura && esitoChiusura.tolti.length > 0 && <div style={{ marginTop: 8, padding: 8, background: COLORI.verde, fontSize: 12 }}>{esitoChiusura.tolti.join(" · ")}</div>}
        {esitoChiusura && esitoChiusura.errori.length > 0 && <div style={{ marginTop: 8, padding: 8, background: COLORI.rosso, fontSize: 12 }}>Restano in DA SMISTARE: {esitoChiusura.errori.join(" · ")}</div>}
        {esitoChiusura && esitoChiusura.righe.every(c => c.torna) && !esitoChiusura.tolti.length && !esitoChiusura.errori.length && <div style={{ marginTop: 8, fontSize: 12 }}>Gli scarichi restano in DA SMISTARE finché non sono copiati con «Archivia» (passo 4).</div>}
        {esitoChiusura && <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Confronto fatto il {esitoChiusura.quando}. Le scartate dal Sistema di Interscambio e le autofatture non si contano.</div>}
      </div>}
    </div>
  );
}
