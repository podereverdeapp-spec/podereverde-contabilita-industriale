// Versione 353 — lettura di un file della banca e controlli contro quanto è già nel programma.
// Usato da «Carica documenti della banca». Non scrive niente: la scrittura la fa solo ci_carica_documento.
import * as XLSX from "xlsx";
import { supabase } from "./supabase";
import { formattaEuro, fetchAllPages } from "./parsingUtils";
import { md5 } from "./md5";
import { pagineDalPdf, leggiEstrattoBper, leggiListaCbi, leggiPdfCartaBper, leggiExcelCartaBper } from "./lettoreBanca";

export const dataIt = d => { const s = String(d || "").slice(0, 10); const [a, m, g] = s.split("-"); return g ? `${g}/${m}/${a}` : "—"; };
export const euro = n => (n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : formattaEuro(Number(n)));
export const piuGiorni = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const TIPO_DOCUMENTO_PER_CONTO = { "banca": "estratto conto", "conto elettronico": "estratto conto", "carta prepagata": "lista movimenti della carta", "carta di credito": "lista movimenti della carta" };
// stessa chiave del database (ci_carica_documento): btrim toglie solo lo spazio; \s di PostgreSQL = spazio, tab, a capo; lower sulle lettere ASCII
const btrim = t => String(t ?? "").replace(/^ +| +$/g, "");
const minuscoleAscii = t => t.replace(/[A-Z]/g, c => c.toLowerCase());
export const chiaveRiga = r => [r.verso, Number(r.importo).toFixed(2), minuscoleAscii(btrim(r.descrizione).replace(/[ \t\n\r\f\v]+/g, " ")),
  btrim(r.numero_bonifico), r.data_valuta || "", r.importo_in_valuta != null ? Number(r.importo_in_valuta).toFixed(4) : "", r.cambio != null ? String(Number(r.cambio)) : ""].join("|");
const segno = r => (r.verso === "entrata" ? 1 : -1) * Math.round(Number(r.importo) * 100);

// Legge un file (byte) e riconosce dal CONTENUTO che documento è. { impronta, formato, esito } oppure { impronta, errore }
export async function leggiDocumento(nomeFile, byte) {
  const impronta = md5(byte);
  const nome = String(nomeFile).toLowerCase();
  try {
    if (nome.endsWith(".pdf")) {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const pagine = await pagineDalPdf(new Uint8Array(byte), pdfjs);
      const testo = pagine.slice(0, 2).flatMap(p => p.voci.map(v => v.s)).join(" ");
      let r;
      if (/Lista movimenti CBI/.test(testo)) r = { formato: "lista CBI", nomeFormato: "Lista movimenti CBI della banca (PDF)", esito: leggiListaCbi(pagine) };
      else if (/Relative alla carta/.test(testo)) r = { formato: "lista carta PDF", nomeFormato: "Lista movimenti della carta (PDF)", esito: leggiPdfCartaBper(pagine) };
      else if (/ESTRATTO AL/.test(testo)) r = { formato: "estratto ufficiale", nomeFormato: "Estratto conto ufficiale BPER (PDF)", esito: leggiEstrattoBper(pagine) };
      else if (pagine.every(p => p.voci.length === 0)) return { impronta, errore: "è una scansione (un'immagine): non contiene testo da leggere. Serve il PDF scaricato dalla banca." };
      else return { impronta, errore: "PDF non riconosciuto: non è un estratto conto ufficiale BPER, una lista movimenti CBI o una lista movimenti della carta." };
      return verificaPeriodo({ impronta, estensione: ".pdf", ...r });
    }
    if (nome.endsWith(".xls") || nome.endsWith(".xlsx")) {
      const wb = XLSX.read(byte, { type: "array" });
      const righe = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
      if (righe.some(r => (r || []).some(c => String(c).trim() === "Pan Carta")))
        return verificaPeriodo({ impronta, estensione: nome.endsWith(".xlsx") ? ".xlsx" : ".xls", formato: "lista carta Excel", nomeFormato: "Lista movimenti della carta (Excel della banca)", esito: leggiExcelCartaBper(righe) });
      return { impronta, errore: "Excel non riconosciuto. Il programma legge l'Excel della carta prepagata BPER; l'Excel dei movimenti del conto corrente non è ancora letto." };
    }
    return { impronta, errore: "il file deve essere un PDF o un Excel (.xls, .xlsx)." };
  } catch (e) { return { impronta, errore: "lettura non riuscita: " + e.message }; }
}
function verificaPeriodo(l) {
  const e = l.esito, dal = e.periodo_dal || e.dal, al = e.periodo_al || e.al;
  if (!dal || !al || al < dal) return { ...l, errore: `il file non indica un periodo valido (dal ${dataIt(dal)} al ${dataIt(al)}).` };
  return { ...l, dal, al };
}

// Il conto lo riconosce il programma: dall'IBAN stampato (estratti) o dalle ultime 4 cifre (carte)
export function contoDelDocumento(l, conti) {
  const e = l.esito;
  if (e.tipo === "estratto conto") return conti.find(c => c.iban && e.iban && c.iban === e.iban) || null;
  return conti.find(c => TIPO_DOCUMENTO_PER_CONTO[c.tipo] === e.tipo && c.ultime_quattro_cifre && c.ultime_quattro_cifre === e.carta) || null;
}

// Controlli contro quanto è già nel programma. opz.copertoDaPrima: i giorni prima del documento saranno coperti da file
// caricati prima nella stessa lettura (si ricontrolla tutto al momento del caricamento).
export async function analizza(l, conto, stato, opz = {}) {
  const e = l.esito, ctr = [], C2 = (ok, nome, dettaglio, rinviabile = false) => ctr.push({ ok, nome, dettaglio, rinviabile });
  const dal = l.dal, al = l.al;
  C2(TIPO_DOCUMENTO_PER_CONTO[conto.tipo] === e.tipo, "Documento adatto al conto", `${e.tipo} su ${conto.nome}`);
  if (e.tipo === "estratto conto") C2(!!(conto.iban && e.iban && conto.iban === e.iban), "IBAN del documento uguale a quello del conto", `documento ${e.iban || "non letto"}, conto ${conto.iban || "senza IBAN"}`);
  else C2(!!e.carta && e.carta === conto.ultime_quattro_cifre, "Carta del documento uguale a quella del conto", `documento …${e.carta || "?"}, conto …${conto.ultime_quattro_cifre || "?"}`);
  const docs = await fetchAllPages((a, b) => supabase.from("ci_documenti_fonte")
    .select("id, tipo, periodo_dal, periodo_al, saldo_iniziale, pdf_impronta, file_digitale_impronta, caricato_il, annullato_il").eq("conto_id", conto.id).order("id").range(a, b));
  if (docs.error) throw new Error(docs.error.message);
  const vivi = (docs.data || []).filter(d => !d.annullato_il);
  const stesso = vivi.find(d => d.pdf_impronta === l.impronta || d.file_digitale_impronta === l.impronta);
  C2(!stesso, "File non ancora caricato", stesso ? `è già il documento n. ${stesso.id}, caricato il ${dataIt(stesso.caricato_il)}` : "impronta nuova");
  const partenza = stato?.partenza_alla_data;
  C2(!!partenza && dal > partenza, "Il documento comincia dopo la partenza del conto", partenza ? `partenza al ${dataIt(partenza)}, documento dal ${dataIt(dal)}` : "il conto non ha la partenza: scriverla prima (pagina «Conti: stato e controlli»)");
  const coperti = new Set();
  for (const d of vivi.filter(d => d.tipo === e.tipo)) for (let g = d.periodo_dal > dal ? d.periodo_dal : dal; g <= d.periodo_al && g <= al; g = piuGiorni(g, 1)) coperti.add(g);
  let esistenti = [];
  if (coperti.size) {
    const r = await fetchAllPages((a, b) => supabase.from("ci_righe_fonte").select("data_contabile, data_valuta, verso, importo, descrizione, numero_bonifico, importo_in_valuta, cambio, documento_id")
      .eq("conto_id", conto.id).gte("data_contabile", dal).lte("data_contabile", al).order("id").range(a, b));
    if (r.error) throw new Error(r.error.message);
    const vivoId = new Set(vivi.map(d => d.id));
    esistenti = (r.data || []).filter(x => vivoId.has(x.documento_id));
  }
  const perGiorno = lista => lista.reduce((m, r) => ((m[r.data_contabile] ||= []).push(chiaveRiga(r)), m), {});
  const nuoveG = perGiorno(e.righeCarico), vecchieG = perGiorno(esistenti);
  const diversi = [...coperti].sort().filter(g => JSON.stringify((nuoveG[g] || []).slice().sort()) !== JSON.stringify((vecchieG[g] || []).slice().sort()));
  C2(diversi.length === 0, "Giorni già caricati: righe identiche", coperti.size === 0 ? "nessun giorno del periodo era già caricato"
    : diversi.length === 0 ? `${coperti.size} giorni già caricati, righe uguali: non si scrivono una seconda volta`
    : `righe diverse il ${diversi.slice(0, 5).map(dataIt).join(", ")}${diversi.length > 5 ? ` e altri ${diversi.length - 5} giorni` : ""}: il file non corrisponde a quanto già caricato`);
  const righeNuove = e.righeCarico.filter(r => !coperti.has(r.data_contabile)).length;
  let saldoIniziale = e.saldo_iniziale, saldoFinale = e.saldo_finale;
  const prima = piuGiorni(dal, -1);
  let saldoCalcolato = null, copertoPrima = false;
  if (partenza && dal > partenza) {
    const [cop, sal] = await Promise.all([supabase.rpc("ci_coperto_fino_al", { p_conto: conto.id, p_giorno: prima }), supabase.rpc("ci_saldo_al", { p_conto: conto.id, p_giorno: prima })]);
    if (cop.error || sal.error) throw new Error((cop.error || sal.error).message);
    copertoPrima = cop.data === true; saldoCalcolato = sal.data === null ? null : Number(sal.data);
  }
  const righeUnione = g => coperti.has(g) ? esistenti.filter(r => r.data_contabile === g) : e.righeCarico.filter(r => r.data_contabile === g);
  if (e.tipo === "lista movimenti della carta") {
    if (copertoPrima) {
      let somma = 0; for (let g = dal; g <= al; g = piuGiorni(g, 1)) somma += righeUnione(g).reduce((t, r) => t + segno(r), 0);
      saldoIniziale = Math.round(saldoCalcolato * 100) / 100; saldoFinale = Math.round(saldoCalcolato * 100 + somma) / 100;
      C2(true, "Nessun giorno scoperto prima del documento", `saldo calcolato al ${dataIt(prima)}: ${euro(saldoCalcolato)}`);
    } else if (opz.copertoDaPrima) C2(true, "Nessun giorno scoperto prima del documento", "i giorni prima arrivano con il file sopra: i saldi si calcolano al caricamento");
    else C2(false, "Nessun giorno scoperto prima del documento", !partenza || dal <= partenza ? "senza una partenza prima del documento il saldo non si può calcolare"
      : `mancano giorni prima del ${dataIt(dal)}: caricare prima la lista che li copre (la lista non ha saldi stampati)`);
  } else if (copertoPrima) {
    C2(Math.round(saldoCalcolato * 100) === Math.round(saldoIniziale * 100), "Saldo iniziale uguale al saldo calcolato fino al giorno prima",
      `documento ${euro(saldoIniziale)}, calcolato al ${dataIt(prima)} ${euro(saldoCalcolato)}`);
  } else if (opz.copertoDaPrima) C2(true, "Continuità con i documenti prima", "i giorni prima arrivano con il file sopra: il collegamento si controlla al caricamento");
  else C2(true, "Continuità con i documenti prima", `i giorni prima del ${dataIt(dal)} non sono tutti caricati: il collegamento si controllerà quando arriveranno`);
  // documenti già caricati che cominciano dentro il periodo o il giorno dopo: devono collegarsi
  if (saldoIniziale != null && !Number.isNaN(Number(saldoIniziale))) {
    const giornoDopo = piuGiorni(al, 1), sbagliati = [];
    const seguenti = vivi.filter(d => d.tipo === e.tipo && d.periodo_dal > dal && d.periodo_dal <= giornoDopo);
    for (const d of seguenti) {
      let c = Math.round(Number(saldoIniziale) * 100);
      for (let g = dal; g < d.periodo_dal; g = piuGiorni(g, 1)) c += righeUnione(g).reduce((t, r) => t + segno(r), 0);
      if (c !== Math.round(Number(d.saldo_iniziale) * 100)) sbagliati.push(`documento n. ${d.id} dal ${dataIt(d.periodo_dal)}: parte da ${euro(d.saldo_iniziale)}, con questo file il saldo al giorno prima sarebbe ${euro(c / 100)}`);
    }
    if (seguenti.length) C2(sbagliati.length === 0, "Collegamento con i documenti già caricati dopo", sbagliati.length ? sbagliati.join("; ") : `${seguenti.length} documenti dopo: i saldi si collegano`);
  }
  const payload = { conto_id: conto.id, tipo: e.tipo, origine: e.origine, periodo_dal: dal, periodo_al: al, saldo_iniziale: saldoIniziale, saldo_finale: saldoFinale, righe: e.righeCarico };
  if (e.origine === "letto da PDF") Object.assign(payload, { pdf_impronta: l.impronta, pagine_pdf: e.pagine_pdf });
  else Object.assign(payload, { file_digitale_impronta: l.impronta });
  return { controlli: ctr, payload, righeNuove, giaPresenti: e.righeCarico.length - righeNuove, ok: ctr.every(c => c.ok) && e.valido, documentoGia: stesso || null };
}
