// Versione 355 (10/11/2026, procedura unica di carico, claude/procedura_unica_carico.md):
// lettura dei tre file scaricati da Aruba (XML, PDF, Report Excel), collegamento fra le tre fonti,
// riconoscimento contro il programma e chiusura contro il Report. Qui non si scrive niente:
// scrivono la pagina «Documenti arrivati» e i moduli che già esistono (documentoFattura.js, CaricaFatture.jsx).
import JSZip from "jszip";
import { leggiDocumentiDaByte } from "./letturaXmlRicevute";

export const PIVA_PODERE = "15117871002";

export const pulisciPiva = p => String(p || "").replace(/\s+/g, "").toUpperCase().replace(/^IT(?=\d)/, "");
// numero ridotto a lettere e cifre, minuscole, senza zeri iniziali («000140/QC9» = «140qc9»)
export const numeroRidotto = n => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^0+(?=.)/, "");
const c2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Nome del file SdI, la chiave che collega Report, XML e PDF: senza cartella, senza «.p7m»,
// senza il suffisso «-XXXXXXXX» che Aruba aggiunge in qualche «FileName» (es. «…_0bkOQ-1DEC1CBF.xml»)
export function nomeFileSdi(n) {
  let s = String(n || "").split(/[\\/]/).pop().trim();
  s = s.replace(/#\d+$/, "").replace(/\.p7m$/i, "");
  s = s.replace(/_([A-Za-z0-9]{1,5})-[0-9A-F]{8}\.xml$/i, "_$1.xml");
  return s;
}
// Nome del PDF di Aruba: «IT00897381000_00I3D.xml.p7m - 1695_B.pdf» → file SdI e numero scritto nel nome
export function letturaNomePdf(nome) {
  const base = String(nome).split(/[\\/]/).pop();
  const m = base.match(/^(.+?\.xml(?:\.p7m)?)\s+-\s+(.*)\.pdf$/i);
  if (!m) return null;
  return { nomeSdi: nomeFileSdi(m[1]), numeroNelNome: m[2] };
}

// ── Report Excel di Aruba ─────────────────────────────────────────────────────────────────────────────
const COLONNE_REPORT = { numero: "Numero", nomeFile: "Nome file", idSdi: "ID SdI", dataRicezione: "Data ricezione", dataDocumento: "Data documento",
  tipo: "Tipo documento", fornitore: "Fornitore", piva: "P.IVA", codiceFiscale: "Codice Fiscale", imponibile: "Totale imponibile", iva: "Totale IVA",
  totale: "Totale documento", netto: "Netto a pagare" };
function dataDaCella(XLSX, v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null; }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}
const numeroCella = v => { if (typeof v === "number") return v; const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
export function leggiReportAruba(XLSX, bytes) {
  const wb = XLSX.read(bytes, { type: "array", cellDates: false });
  const nomeFoglio = wb.SheetNames.find(n => /FattureRicevute/i.test(n)) || wb.SheetNames[0];
  const righe = XLSX.utils.sheet_to_json(wb.Sheets[nomeFoglio], { defval: "", raw: true });
  if (!righe.length) return { righe: [], errore: "Report vuoto" };
  const mancano = Object.values(COLONNE_REPORT).filter(c => !(c in righe[0]));
  if (mancano.length) return { righe: [], errore: `nel Report mancano le colonne: ${mancano.join(", ")}` };
  return {
    errore: null,
    righe: righe.map((r, i) => ({
      rigaReport: i + 2,
      numero: String(r[COLONNE_REPORT.numero]).trim(),
      nomeSdi: nomeFileSdi(r[COLONNE_REPORT.nomeFile]),
      nomeFileReport: String(r[COLONNE_REPORT.nomeFile]).trim(),
      idSdi: String(r[COLONNE_REPORT.idSdi]).trim(),
      dataRicezione: dataDaCella(XLSX, r[COLONNE_REPORT.dataRicezione]),
      data: dataDaCella(XLSX, r[COLONNE_REPORT.dataDocumento]),
      tipo: (String(r[COLONNE_REPORT.tipo]).match(/TD\d{2}/) || [""])[0],
      fornitore: String(r[COLONNE_REPORT.fornitore]).trim(),
      piva: pulisciPiva(r[COLONNE_REPORT.piva]),
      codiceFiscale: String(r[COLONNE_REPORT.codiceFiscale]).trim(),
      imponibile: numeroCella(r[COLONNE_REPORT.imponibile]), iva: numeroCella(r[COLONNE_REPORT.iva]),
      totale: numeroCella(r[COLONNE_REPORT.totale]), netto: numeroCella(r[COLONNE_REPORT.netto]),
    })),
  };
}

// ── Riconoscimento dei file scaricati (dal contenuto, non dal nome) ──────────────────────────────────
// file: [{ nome, bytes }]. Restituisce { report, xml, pdf, scartati, file }
export async function leggiScaricoAruba(XLSX, file) {
  const out = { report: [], documenti: [], pdf: [], scartati: [], file: [] };
  for (const f of file) {
    const basso = f.nome.toLowerCase();
    const info = { nome: f.nome, byte: f.bytes.length, contenuto: "ALTRO", voci: 0 };
    out.file.push(info);
    try {
      if (basso.endsWith(".xls") || basso.endsWith(".xlsx")) {
        const r = leggiReportAruba(XLSX, f.bytes);
        if (r.errore) { out.scartati.push(`${f.nome}: ${r.errore}`); continue; }
        info.contenuto = "REPORT"; info.voci = r.righe.length; r.righe.forEach(x => out.report.push({ ...x, file: f.nome }));
        continue;
      }
      if (basso.endsWith(".xml") || basso.endsWith(".p7m")) {
        const r = leggiDocumentiDaByte(f.nome, f.bytes);
        if (r.scartato) { out.scartati.push(r.scartato); continue; }
        info.contenuto = "XML"; info.voci = r.documenti.length;
        r.documenti.forEach(d => out.documenti.push({ ...d, nomeSdi: nomeFileSdi(d.fileXml), byteXml: f.bytes, nomeOriginaleXml: f.nome, file: f.nome }));
        continue;
      }
      if (!basso.endsWith(".zip")) { out.scartati.push(`${f.nome}: non è uno scarico di Aruba (né .zip, né .xml, né .xls)`); continue; }
      const zip = await JSZip.loadAsync(f.bytes);
      const voci = Object.values(zip.files).filter(v => !v.dir);
      let nXml = 0, nPdf = 0, nRep = 0;
      for (const v of voci) {
        const nv = v.name.toLowerCase(); const b = await v.async("uint8array");
        if (nv.endsWith(".xls") || nv.endsWith(".xlsx")) {
          const r = leggiReportAruba(XLSX, b);
          if (r.errore) { out.scartati.push(`${f.nome} → ${v.name}: ${r.errore}`); continue; }
          nRep++; r.righe.forEach(x => out.report.push({ ...x, file: `${f.nome} → ${v.name}` }));
        } else if (nv.endsWith(".pdf")) {
          const l = letturaNomePdf(v.name);
          if (!l) { out.scartati.push(`${f.nome} → ${v.name}: PDF senza il nome del file SdI`); continue; }
          nPdf++; out.pdf.push({ ...l, nome: v.name.split("/").pop(), bytes: b, file: f.nome });
        } else if (nv.endsWith(".xml") || nv.endsWith(".p7m")) {
          const r = leggiDocumentiDaByte(v.name, b);
          if (r.scartato) { out.scartati.push(`${f.nome} → ${r.scartato}`); continue; }
          nXml++; r.documenti.forEach(d => out.documenti.push({ ...d, nomeSdi: nomeFileSdi(d.fileXml), byteXml: b, nomeOriginaleXml: v.name.split("/").pop(), file: f.nome }));
        } else out.scartati.push(`${f.nome} → ${v.name}: file non previsto`);
      }
      info.contenuto = nRep ? "REPORT" : nPdf && !nXml ? "PDF" : nXml && !nPdf ? "XML" : (nXml || nPdf) ? "MISTO" : "ALTRO";
      info.voci = nRep ? out.report.filter(x => x.file.startsWith(f.nome)).length : nXml + nPdf;
    } catch (e) {
      out.scartati.push(`${f.nome}: non leggibile (${e.message})`);
    }
  }
  return out;
}

// ── Collegamento Report ↔ XML ↔ PDF, per nome del file SdI ──────────────────────────────────────────
// Restituisce le fatture (una per riga del Report, più gli XML senza riga) con le loro anomalie di lettura.
export function collega(scarico) {
  const xmlPerNome = new Map();
  scarico.documenti.forEach(d => { const k = d.nomeSdi; if (!xmlPerNome.has(k)) xmlPerNome.set(k, []); xmlPerNome.get(k).push(d); });
  const pdfPerNome = new Map();
  scarico.pdf.forEach(p => { if (!pdfPerNome.has(p.nomeSdi)) pdfPerNome.set(p.nomeSdi, []); pdfPerNome.get(p.nomeSdi).push(p); });
  const usatiXml = new Set(); const usatiPdf = new Set();
  // la stessa riga del Report può comparire due volte se lo stesso anno è stato scaricato due volte: si tiene una volta
  const viste = new Set(); const report = [];
  scarico.report.forEach(r => { const k = `${r.idSdi}|${numeroRidotto(r.numero)}`; if (!viste.has(k)) { viste.add(k); report.push(r); } });
  const fatture = report.map(r => {
    const candidati = xmlPerNome.get(r.nomeSdi) || [];
    const xml = candidati.length <= 1 ? candidati[0] : (candidati.find(d => numeroRidotto(d.numero) === numeroRidotto(r.numero)) || null);
    const pdfC = pdfPerNome.get(r.nomeSdi) || [];
    const pdf = pdfC.length <= 1 ? pdfC[0] : (pdfC.find(p => numeroRidotto(p.numeroNelNome) === numeroRidotto(r.numero)) || pdfC[0]);
    if (xml) usatiXml.add(xml); if (pdf) usatiPdf.add(pdf);
    const anomalie = [];
    if (!xml) anomalie.push("manca l'XML nello scarico");
    if (!pdf) anomalie.push("manca il PDF nello scarico");
    if (xml) {
      const piva = pulisciPiva(xml.pivaCliente), cf = String(xml.cfCliente || "").trim();
      if (piva !== PIVA_PODERE && cf !== PIVA_PODERE) anomalie.push(`il cliente non è Podere Verde (partita IVA «${xml.pivaCliente || "—"}», codice fiscale «${xml.cfCliente || "—"}»)`);
      if (numeroRidotto(xml.numero) !== numeroRidotto(r.numero)) anomalie.push(`numero diverso fra Report («${r.numero}») e XML («${xml.numero}»)`);
      if (xml.data !== r.data) anomalie.push(`data diversa fra Report (${r.data}) e XML (${xml.data})`);
      if (r.totale !== null && Math.abs(Math.abs(xml.totale) - Math.abs(r.totale)) > 0.01) anomalie.push(`totale diverso fra Report (${r.totale}) e XML (${xml.totale})`);
    }
    if (pdf && numeroRidotto(pdf.numeroNelNome) !== numeroRidotto(r.numero.replace(/\//g, "_"))) anomalie.push(`il nome del PDF porta il numero «${pdf.numeroNelNome}»`);
    const sommaRighe = xml ? c2(xml.righe.reduce((s, x) => s + (Number(x.imponibile) || 0), 0)) : null;
    const scarto = xml ? c2(Math.abs(sommaRighe - xml.imponibile)) : 0;
    return { chiave: `SDI:${r.idSdi || `senza-${r.nomeSdi}-${numeroRidotto(r.numero)}`}${xml && xml.corpi > 1 ? `#${xml.posizione}` : ""}`, report: r, xml: xml || null, pdf: pdf || null,
      anno: Number(String(r.data || "").slice(0, 4)) || null, sommaRighe, scartoRighe: scarto, anomalie };
  });
  // lo stesso file messo due volte (stesso nome SdI e stesso numero di un documento già collegato) è una copia, non un documento in più
  const kx = d => `${d.nomeSdi}|${numeroRidotto(d.numero)}`; const kp = p => `${p.nomeSdi}|${numeroRidotto(p.numeroNelNome)}`;
  const giaX = new Set([...usatiXml].map(kx)); const giaP = new Set([...usatiPdf].map(kp));
  const restoX = scarico.documenti.filter(d => !usatiXml.has(d)); const restoP = scarico.pdf.filter(p => !usatiPdf.has(p));
  const xmlSenzaReport = restoX.filter(d => !giaX.has(kx(d))); const pdfSenzaReport = restoP.filter(p => !giaP.has(kp(p)));
  return { fatture, xmlSenzaReport, pdfSenzaReport, copieDoppie: (restoX.length - xmlSenzaReport.length) + (restoP.length - pdfSenzaReport.length) };
}

// ── I conti in cima alla pagina, per anno ─────────────────────────────────────────────────────────────
export function contiPerAnno(collegato, totaliAruba = {}) {
  const anni = {};
  collegato.fatture.forEach(f => {
    const a = f.anno || "senza anno"; anni[a] = anni[a] || { anno: a, report: 0, xml: 0, pdf: 0, aruba: totaliAruba[a] ?? null };
    anni[a].report++; if (f.xml) anni[a].xml++; if (f.pdf) anni[a].pdf++;
  });
  return Object.values(anni).map(x => ({ ...x, torna: x.report === x.xml && x.xml === x.pdf && (x.aruba === null || x.aruba === x.report) }));
}

// ── Riconoscimento contro il programma ────────────────────────────────────────────────────────────────
// programma = { fatture: [{ id, numero, data, piva, sdi, nomeFile, totale }], scadenzeXml: [{ fileXml, fatturaId }],
//               acquisti: [{ numero, data, piva }], fattureDaRicevere: [{ piva, anno }] }
// Esito per fattura: «grigio» (già nel programma), «grigio-scrivi-sdi» (già nel programma senza SdI),
// «arancione» (da guardare: somiglia a un documento esistente), «nuova».
export function riconosci(collegato, programma) {
  const perSdi = new Map(), perNome = new Map(), perPdn = new Map(), perPn = new Map(), perPdt = new Map();
  for (const f of programma.fatture) {
    const p = pulisciPiva(f.piva);
    if (f.sdi) perSdi.set(String(f.sdi), f);
    if (f.nomeFile) perNome.set(nomeFileSdi(f.nomeFile), f);
    perPdn.set(`${p}|${f.data}|${numeroRidotto(f.numero)}`, f);
    const kn = `${p}|${numeroRidotto(f.numero)}`; if (!perPn.has(kn)) perPn.set(kn, []); perPn.get(kn).push(f);
    const kd = `${p}|${f.data}|${c2(Math.abs(Number(f.totale) || 0))}`; if (!perPdt.has(kd)) perPdt.set(kd, []); perPdt.get(kd).push(f);
  }
  const scadXml = new Map(programma.scadenzeXml.map(s => [nomeFileSdi(s.fileXml), s]));
  const acqPdn = new Map(); const acqPn = new Map();
  for (const a of programma.acquisti) {
    const p = pulisciPiva(a.piva);
    acqPdn.set(`${p}|${a.data}|${numeroRidotto(a.numero)}`, a);
    const kn = `${p}|${numeroRidotto(a.numero)}`; if (!acqPn.has(kn)) acqPn.set(kn, []); acqPn.get(kn).push(a);
  }
  const muratella = new Set((programma.fattureDaRicevere || []).map(d => `${pulisciPiva(d.piva)}|${d.anno}`));
  const giorni = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
  return collegato.fatture.map(f => {
    const r = f.report; const p = pulisciPiva(r.piva); const nr = numeroRidotto(r.numero);
    let esito = "nuova", trovata = null, motivo = "";
    // un file SdI con più fatture: lo stesso SdI e lo stesso nome valgono solo con lo stesso numero
    const piuCorpi = (f.xml?.corpi || 1) > 1;
    const okNum = x => !piuCorpi || numeroRidotto(x?.numero) === nr;
    // versione 355: una scadenza nata dall'XML da sola NON prova che il documento sia registrato (può essere il debito creato da
    // «Prima di tutto» per una fattura non ancora classificata): conta solo con l'acquisto di animali con la stessa partita IVA, data e numero
    if (perSdi.has(r.idSdi) && okNum(perSdi.get(r.idSdi))) { esito = "grigio"; trovata = perSdi.get(r.idSdi); motivo = "stesso Identificativo SdI"; }
    else if (perNome.has(r.nomeSdi) && okNum(perNome.get(r.nomeSdi))) { esito = "grigio-scrivi-sdi"; trovata = perNome.get(r.nomeSdi); motivo = "stesso nome del file SdI"; }
    else if (perPdn.has(`${p}|${r.data}|${nr}`)) { esito = "grigio-scrivi-sdi"; trovata = perPdn.get(`${p}|${r.data}|${nr}`); motivo = "stessa partita IVA, data e numero (senza SdI nel programma)"; }
    else if (acqPdn.has(`${p}|${r.data}|${nr}`)) { esito = "grigio"; trovata = { acquisto: true, ...acqPdn.get(`${p}|${r.data}|${nr}`), ...(scadXml.get(r.nomeSdi) || {}) }; motivo = scadXml.has(r.nomeSdi) ? "acquisto di animali, con la scadenza dell'XML" : "acquisto di animali: stessa partita IVA, data e numero"; }
    else if (scadXml.has(r.nomeSdi)) { esito = "arancione"; trovata = { acquisto: true, debitoSoltanto: true, ...scadXml.get(r.nomeSdi) }; motivo = "c'è il debito nato da questo XML, ma non trovo né la fattura né l'acquisto di animali con questo numero e data: se è registrato con un numero o una data diversi «È la stessa», altrimenti «È un'altra» e si registra"; }
    else {
      const stessoNumero = [...(perPn.get(`${p}|${nr}`) || []), ...(acqPn.get(`${p}|${nr}`) || []).map(a => ({ ...a, acquisto: true }))].filter(x => giorni(x.data, r.data) <= 31);
      const stessoTotale = (perPdt.get(`${p}|${r.data}|${c2(Math.abs(Number(r.totale) || 0))}`) || []);
      if (stessoNumero.length) { esito = "arancione"; trovata = stessoNumero[0]; motivo = `stesso fornitore e stesso numero, data diversa (${stessoNumero[0].data})`; }
      else if (stessoTotale.length) { esito = "arancione"; trovata = stessoTotale[0]; motivo = `stesso fornitore, data e totale, numero scritto diverso («${stessoTotale[0].numero}»)`; }
    }
    const avvisi = [...f.anomalie];
    if (esito === "nuova" && muratella.has(`${p}|${f.anno}`)) avvisi.push("fornitore con un documento «DA RICEVERE» dello stesso anno: decidere quanta parte sostituisce");
    const rosso = f.anomalie.some(a => /cliente non è Podere Verde|manca l'XML|numero diverso fra Report|data diversa fra Report|totale diverso fra Report/.test(a));
    // già nel programma per Identificativo SdI: grigio comunque; trovata in altro modo (si scriverà l'SdI) ma con Report e XML diversi: rossa
    const colore = esito === "grigio" && !(trovata && !trovata.acquisto && !perSdi.has(r.idSdi) && rosso) ? "grigio" : rosso ? "rosso" : esito === "grigio-scrivi-sdi" ? "grigio" : (esito === "arancione" || avvisi.length) ? "arancione" : "verde";
    return { ...f, esito, colore, trovata, motivo, avvisi };
  });
}

// ── Chiusura contro il Report (dopo la registrazione) ─────────────────────────────────────────────────
// fattureAnno: le fatture passive del programma con Identificativo SdI negli anni del Report
export function chiusura(riconosciute, fattureProgrammaConSdi) {
  const perAnno = {};
  const sdiReport = new Set(riconosciute.map(f => f.report.idSdi));
  for (const f of riconosciute) {
    const a = f.anno; perAnno[a] = perAnno[a] || { anno: a, aruba: 0, presenti: 0, mancanti: [], soloNelProgramma: [] };
    perAnno[a].aruba++;
    if (f.esito.startsWith("grigio")) perAnno[a].presenti++; else perAnno[a].mancanti.push(f);
  }
  for (const p of fattureProgrammaConSdi) {
    const a = Number(String(p.data).slice(0, 4));
    if (perAnno[a] && !sdiReport.has(String(p.sdi))) perAnno[a].soloNelProgramma.push(p);
  }
  return Object.values(perAnno).map(x => ({ ...x, torna: x.mancanti.length === 0 && x.soloNelProgramma.length === 0 }));
}

// ── Nome nell'archivio del cloud ──────────────────────────────────────────────────────────────────────
// Versione 359 (ordine del Dott. Bizzarri dell'11/11/2026, struttura «A»):
//   FATTURE PASSIVE\<anno>\<NOME FORNITORE>\PDF\<nome>.pdf   e   FATTURE PASSIVE\<anno>\<NOME FORNITORE>\XML\<nome>.xml (o .xml.p7m)
// Il nome della cartella del fornitore è il nome scritto nel programma per quella partita IVA (sempre lo stesso per lo stesso
// fornitore); se il fornitore non è nel programma, il nome della fattura elettronica. Il nome del file resta come prima
// (FORNITORE_data_numero), così un file copiato fuori dalla sua cartella si riconosce ancora.
const VIETATI = /[\\/:*?"<>|~\u0000-\u001f]/g;
// riservati anche con un'estensione («CON.SRL»)
const RISERVATI_WINDOWS = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
// revisione 359: né all'inizio né alla fine uno spazio o un punto (Chrome li rifiuta: nomeNonAccettato in archivioF24.js)
export function pulisciNome(s) { return String(s || "").replace(VIETATI, "-").replace(/\s+/g, " ").trim().replace(/^[ .]+/, "").replace(/[ .]+$/, ""); }
// 45 caratteri (revisione 359, punto 1): con il percorso vero di FATTURE PASSIVE (106 caratteri) e un numero di fattura lungo
// quanto il massimo della fattura elettronica (20), il percorso più lungo resta sotto 250 e al nome del file restano almeno 12 caratteri.
// Il limite è fisso, così lo stesso fornitore ha sempre la stessa cartella, qualunque sia il numero della fattura.
export const LUNGHEZZA_CARTELLA_FORNITORE = 45;
// la cartella del fornitore: maiuscolo, senza caratteri vietati da Windows, al massimo 45 caratteri, mai vuota né un nome riservato
export function cartellaFornitore(nome) {
  const pieno = pulisciNome(nome).toUpperCase();
  let c = pieno.slice(0, LUNGHEZZA_CARTELLA_FORNITORE);
  // un nome troppo lungo si taglia alla fine di una parola, se non si perde troppo («…DI EUGENIO SB» → «…DI EUGENIO»)
  if (pieno.length > LUNGHEZZA_CARTELLA_FORNITORE && pieno[LUNGHEZZA_CARTELLA_FORNITORE] !== " ") { const sp = c.lastIndexOf(" "); if (sp >= 25) c = c.slice(0, sp); }
  c = c.trim().replace(/[ ,.\-]+$/, "");
  if (!c) c = "FORNITORE SENZA NOME";
  if (RISERVATI_WINDOWS.test(c)) c = `_${c}`;
  return c;
}
// percorsoBase: il percorso vero della cartella FATTURE PASSIVE (per il limite di Windows, 250 caratteri)
// nomeFornitoreProgramma: il nome del fornitore nel programma, trovato per partita IVA (vuoto se non c'è)
export function nomeArchivio(f, percorsoBase = "", nomeFornitoreProgramma = "") {
  const r = f.report; const anno = String(r.data || "").slice(0, 4) || "SENZA ANNO";
  const nomeDoc = f.xml?.fornitore || r.fornitore || "FORNITORE";
  // un nome del programma fatto di soli spazi o segni non vale: si usa il nome della fattura (revisione 359, punto 3)
  const forn = cartellaFornitore(pulisciNome(nomeFornitoreProgramma) ? nomeFornitoreProgramma : nomeDoc);
  const fornitoreFile = pulisciNome(nomeDoc).toUpperCase();
  const coda = `_${r.data || "SENZA DATA"}_${pulisciNome(r.numero) || "SENZA NUMERO"}`;
  const cartellaPdf = `${anno}\\${forn}\\PDF\\`;
  const cartellaXml = `${anno}\\${forn}\\XML\\`;
  // limite 250 sul percorso più lungo che si scrive davvero (revisione 359, punto 1): cartella XML, estensione «.xml.p7m» (8),
  // il nome provvisorio «PROVVISORIO <13 cifre> » di scriviVerificato (26), un «_99» se il nome c'è già (3), il file di appoggio
  // «.crswap» che Chrome crea durante la scrittura (7)
  const RISERVA = 8 + 26 + 3 + 7;
  const spazio = 250 - percorsoBase.length - 1 - cartellaXml.length - coda.length - RISERVA;
  const fn = spazio >= 10 ? fornitoreFile.slice(0, spazio).trim() : fornitoreFile.slice(0, 10);
  return { cartellaPdf, cartellaXml, cartellaFornitore: forn, nome: `${fn}${coda}`, accorciato: fn.length < fornitoreFile.length };
}

// ── Righe di un documento non ancora registrate nel programma (versione 355) ───────────────────────────
// salvate = { descrizioni: righe di ci_articoli_fattura, importiAcquisti: righe di ci_report_acquisto_animali, scartate: Set di descrizioni scartate }
// Ogni riga salvata «consuma» una sola riga del documento. Restituisce gli indici delle righe che mancano.
const normDescr = d => String(d || "").trim().replace(/\s+/g, " ").toLowerCase();
export function righeDelDocumento(doc) {
  return (doc?.righe || []).length ? doc.righe : [{ descrizione: "(documento senza righe)", imponibile: doc?.imponibile }];
}
// Versione 355, dopo la revisione indipendente:
//  - una riga a 0 € non si registra (non ha importo: asterischi, «RIF DDT…», «Vi rimettiamo…»), quindi non manca mai (N1);
//  - prima si consumano le descrizioni salvate e le righe scartate, poi gli acquisti di animali per importo, solo sulle righe
//    rimaste. Gli acquisti «TRASPORTO_INGRESSO» hanno già la loro riga in ci_articoli_fattura: il chiamante non li passa;
//  - se due righe rimaste con descrizioni diverse hanno lo stesso importo e gli acquisti ne coprono solo una parte, non si sa quale
//    riga è stata salvata: il numero delle mancanti è giusto, ma tutte quelle righe si segnano «ambigue» (N2).
const aZero = r => Math.abs(Number(r.imponibile) || 0) < 0.005 && r.descrizione !== "(documento senza righe)";
export function righeMancanti(righe, salvate = {}) {
  const d = new Map(); (salvate.descrizioni || []).forEach(x => { const k = normDescr(x); d.set(k, (d.get(k) || 0) + 1); });
  const imp = (salvate.importiAcquisti || []).map(v => Math.round(Math.abs(Number(v) || 0) * 100));
  const scartate = salvate.scartate || new Set();
  const restano = [];
  righe.forEach((r, i) => {
    if (aZero(r)) return;
    const k = normDescr(r.descrizione);
    if ((d.get(k) || 0) > 0) { d.set(k, d.get(k) - 1); return; }
    if (scartate.has(k)) return;
    restano.push(i);
  });
  const perImporto = new Map();
  restano.forEach(i => { const c = Math.round(Math.abs(Number(righe[i].imponibile) || 0) * 100); if (!perImporto.has(c)) perImporto.set(c, []); perImporto.get(c).push(i); });
  const mancano = [], ambigue = [];
  for (const [c, idx] of perImporto) {
    let coperte = 0;
    for (let j = imp.indexOf(c); j >= 0 && coperte < idx.length; j = imp.indexOf(c)) { imp.splice(j, 1); coperte++; }
    if (coperte === 0) { mancano.push(...idx); continue; }
    if (coperte >= idx.length) continue;
    const descrizioni = new Set(idx.map(i => normDescr(righe[i].descrizione)));
    mancano.push(...idx.slice(coperte));
    if (descrizioni.size > 1) ambigue.push(...idx);
  }
  mancano.sort((a, b) => a - b);
  return Object.assign(mancano, { ambigue });
}
export { normDescr };

