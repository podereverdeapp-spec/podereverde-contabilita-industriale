// ─── LETTORE DEI DOCUMENTI DELLA BANCA (versione 353) ───────────────────────
// Legge, senza scrivere niente:
//   1) l'estratto conto UFFICIALE BPER in PDF (trimestrale, «Mod. 05.13.0011»);
//   2) la lista movimenti della carta prepagata BPER esportata in Excel.
// Restituisce i dati nel formato di ci_carica_documento (versione 352) più
// l'elenco dei controlli fatti. Un solo controllo fallito = documento rifiutato.
// Gli importi si contano in centesimi interi, mai con i decimali.

const dataMese = (g, me, a) => `${a}-${String(MESI[me.toLowerCase()]).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
const MESI = { gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7,
  agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12 };

// «1.234,56» → 123456 ; «-1.234,56» o «1.234,56-» → -123456 ; altrimenti null
export function centesimi(testo) {
  const t = String(testo ?? "").replace(/[€¤\s]/g, "");
  const m = t.match(/^([-+]?)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})(-?)$/);
  if (!m) return null;
  const v = Number(m[2].replace(/\./g, "")) * 100 + Number(m[3]);
  return (m[1] === "-" || m[4] === "-") ? -v : v;
}
export const euro = (c) => {
  const s = Math.abs(c), i = Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (c < 0 ? "-" : "") + i + "," + String(s % 100).padStart(2, "0");
};
// «31/12/25» o «31/12/2025» → «2025-12-31» (controlla che il giorno esista)
export function dataIso(testo) {
  const m = String(testo).trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(a, Number(m[2]) - 1, Number(m[1])));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[1])) return null;
  return d.toISOString().slice(0, 10);
}
const giornoDopo = (iso) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const it = (iso) => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "—";

// ─── 1. Testo del PDF con le posizioni (pdf.js, passato da chi chiama) ──────
export async function pagineDalPdf(dati, pdfjs) {
  const doc = await pdfjs.getDocument({ data: dati }).promise;
  const pagine = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n);
    const tc = await pg.getTextContent();
    pagine.push({ numero: n, voci: tc.items.filter(v => v.str && v.str.trim())
      .map(v => {
        const t = v.transform, ruotata = Math.abs(t[1]) > Math.abs(t[0]);
        // testo ruotato di 90°: la posizione lungo la riga è t[5], la riga è t[4] (dall'alto in basso)
        return ruotata ? { s: v.str, x: t[5], y: -t[4], w: v.width } : { s: v.str, x: t[4], y: t[5], w: v.width };
      }) });
  }
  return pagine;
}

// raggruppa le voci di una pagina in righe (stessa altezza ± 2 punti), dall'alto in basso
function righeDellaPagina(voci) {
  const ordinate = [...voci].sort((a, b) => b.y - a.y || a.x - b.x);
  const righe = [];
  for (const v of ordinate) {
    const r = righe.find(r => Math.abs(r.y - v.y) <= 2);
    if (r) r.voci.push(v); else righe.push({ y: v.y, voci: [v] });
  }
  for (const r of righe) { r.voci.sort((a, b) => a.x - b.x); r.testo = r.voci.map(v => v.s).join(" ").replace(/\s+/g, " ").trim(); }
  return righe;
}

// numero del bonifico e controparte dalla descrizione (aiuti per l'abbinamento, non controlli)
// Bonifico ricevuto: «BONIFICO o/c: <ORDINANTE> ABI-CAB: … a favore di <PODERE VERDE> …» → la controparte è l'ordinante.
// Bonifico fatto: «DISPOSIZIONE a favore di <BENEFICIARIO> EUR …» → la controparte è il beneficiario.
export function dettagliDescrizione(descr) {
  const num = descr.match(/Num\. ?Bonifico\s+(\S+)/i) || descr.match(/Bonifico num\.\s*(\S+)/i) || descr.match(/Num\. Bon\.Sepa\s*(\d{10,})/i);
  const oc = descr.match(/o\/c:\s*(.+?)(?=\s+ABI-CAB:|\s+PAGAM\.|\s+a favore di|\s+Num\.|\s+\d{6,}|\s+Spese:|$)/);
  const fav = descr.match(/a favore di (.+?) EUR\b/);
  return {
    numero_bonifico: num ? num[1].replace(/-RIF\.?$/, "") : null,
    controparte: oc ? oc[1].trim() : (fav ? fav[1].trim() : null),
  };
}

// Numeri di carta nelle descrizioni della banca: si tengono solo le ultime 4 cifre (regola: niente numeri di carta)
export function mascheraCarte(descr) {
  return String(descr).replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000\t]/g, " ").replace(/ {2,}/g, " ").trim()
    .replace(/(Carta nr:\s*)\d{4,}?(\d{4})\b/gi, "$1****$2")
    .replace(/\b\d{4,6}\*{4,}(\d{4})\b/g, "****$1");
}

// ─── 2. Estratto conto ufficiale BPER ───────────────────────────────────────
export function leggiEstrattoBper(pagine) {
  const esito = { tipo: "estratto conto", origine: "letto da PDF", banca: "BPER", numeroConto: null, iban: null,
    estrattoAl: null, riepilogo: {}, saldoIniziale: null, saldoFinale: null, periodo_dal: null, periodo_al: null,
    righe: [], controlli: [], errori: [], pagine_pdf: pagine.length };
  const errore = (t) => esito.errori.push(t);
  let col = null;            // posizioni delle colonne lette dall'intestazione «DATA VALUTA USCITE ENTRATE DESCRIZIONE»
  let inElenco = false, finito = false, corrente = null;
  const bordiUscite = [], bordiEntrate = [];

  const importoDellaRiga = (r, pag) => {
    const imp = r.voci.filter(v => v.x > col.valuta + 30 && v.x < col.descrizione - 2 && centesimi(v.s) !== null);
    if (imp.length !== 1) { errore(`Pagina ${pag}: riga «${r.testo.slice(0, 60)}» con ${imp.length} importi invece di 1`); return null; }
    const v = imp[0], bordo = v.x + v.w;
    const uscita = bordo < col.entrate;          // le uscite finiscono prima che cominci la colonna ENTRATE
    (uscita ? bordiUscite : bordiEntrate).push(bordo);
    return { c: centesimi(v.s), uscita };
  };

  for (const p of pagine) {
    const righe = righeDellaPagina(p.voci);
    for (const r of righe) {
      const t = r.testo;
      // intestazione e riepilogo (prima pagina)
      let m;
      if (!esito.estrattoAl && (m = t.match(/^ESTRATTO AL (\d{2}\/\d{2}\/\d{4})$/))) esito.estrattoAl = dataIso(m[1]);
      if (!esito.numeroConto && (m = t.match(/^NUMERO (\d{6,})$/))) esito.numeroConto = m[1].replace(/^0+/, "");
      if (!esito.iban && (m = t.match(/^IBAN\s+(IT[\s\dA-Z]{20,})$/))) esito.iban = m[1].replace(/\s/g, "");
      if ((m = t.match(/^Saldo iniziale al (\d{2}\/\d{2}\/\d{4}) (-?[\d.]+,\d{2}-?)/))) esito.riepilogo.iniziale = { data: dataIso(m[1]), c: centesimi(m[2]) };
      if ((m = t.match(/^Saldo finale al (\d{2}\/\d{2}\/\d{4}) (-?[\d.]+,\d{2}-?)/))) esito.riepilogo.finale = { data: dataIso(m[1]), c: centesimi(m[2]) };
      if ((m = t.match(/^Totale Entrate (-?[\d.]+,\d{2})/))) esito.riepilogo.entrate = centesimi(m[1]);
      if ((m = t.match(/^Totale Uscite (-?[\d.]+,\d{2})/))) esito.riepilogo.uscite = centesimi(m[1]);
      if (finito) continue;
      // intestazione delle colonne
      const nomi = r.voci.map(v => v.s.trim());
      if (nomi.includes("DATA") && nomi.includes("VALUTA") && nomi.includes("USCITE") && nomi.includes("ENTRATE")) {
        const x = (n) => r.voci.find(v => v.s.trim() === n).x;
        const nuova = { data: x("DATA"), valuta: x("VALUTA"), uscite: x("USCITE"), entrate: x("ENTRATE"), descrizione: x("DESCRIZIONE") };
        if (col && Object.keys(col).some(k => Math.abs(col[k] - nuova[k]) > 3)) errore(`Pagina ${p.numero}: le colonne sono in posizioni diverse dalla pagina prima`);
        col = col || nuova; inElenco = true; continue;   // la riga in corso può continuare in cima alla pagina dopo
      }
      if (!inElenco) continue;
      // piè di pagina e intestazione della pagina dopo: chiudono la riga in corso
      if (/^Mod\. 05\.13|Pag\. \d+ di \d+|^segue ESTRATTO|^DEL CONTO CORRENTE|^NUMERO \d|^PRESSO |^Di seguito l'elenco/.test(t)) continue;   // salta piè e intestazione; la descrizione può continuare dopo
      const primo = r.voci[0];
      const dataContabile = primo.x < col.valuta - 10 ? dataIso(primo.s) : null;
      if (dataContabile) {
        const descr = r.voci.filter(v => v.x >= col.descrizione - 2).map(v => v.s).join(" ").replace(/\s+/g, " ").trim();
        const imp = importoDellaRiga(r, p.numero);
        if (/^SALDO INIZIALE$/.test(descr)) { if (imp) esito.saldoIniziale = { data: dataContabile, c: imp.uscita ? -Math.abs(imp.c) : imp.c }; corrente = null; continue; }
        if (/^SALDO FINALE$/.test(descr)) { if (imp) esito.saldoFinale = { data: dataContabile, c: imp.uscita ? -Math.abs(imp.c) : imp.c }; corrente = null; finito = true; continue; }
        const valutaVoce = r.voci.find(v => v.x >= col.valuta - 10 && v.x < col.uscite - 5);
        const dataValuta = valutaVoce ? dataIso(valutaVoce.s) : null;
        if (!dataValuta) errore(`Pagina ${p.numero}: riga del ${it(dataContabile)} senza data valuta leggibile`);
        if (!imp) continue;
        corrente = { pagina_pdf: p.numero, data_contabile: dataContabile, data_valuta: dataValuta,
          verso: imp.uscita ? "uscita" : "entrata", c: imp.c, descrizione: descr };
        esito.righe.push(corrente);
        continue;
      }
      // seguito della descrizione
      if (corrente && primo.x >= col.descrizione - 5) { corrente.descrizione = (corrente.descrizione + " " + t).replace(/\s+/g, " ").trim(); continue; }
      if (corrente || t) errore(`Pagina ${p.numero}: riga non riconosciuta «${t.slice(0, 70)}»`);
    }
  }

  // ─── controlli ───
  const C = (nome, ok, dettaglio) => { esito.controlli.push({ nome, ok, dettaglio }); if (!ok) errore(nome + ": " + dettaglio); };
  const R = esito.riepilogo;
  C("Intestazione letta", !!(esito.numeroConto && esito.iban && esito.estrattoAl), `conto ${esito.numeroConto || "?"}, IBAN ${esito.iban ? "letto" : "?"}, estratto al ${it(esito.estrattoAl)}`);
  C("Riepilogo letto (pagina 1)", R.iniziale && R.finale && R.entrate != null && R.uscite != null, "saldo iniziale, entrate, uscite, saldo finale");
  C("Elenco movimenti letto", !!(esito.saldoIniziale && esito.saldoFinale), `righe SALDO INIZIALE e SALDO FINALE ${esito.saldoIniziale && esito.saldoFinale ? "trovate" : "mancanti"}`);
  if (R.iniziale && R.finale && esito.saldoIniziale && esito.saldoFinale) {
    const E = esito.righe.filter(r => r.verso === "entrata").reduce((s, r) => s + r.c, 0);
    const U = esito.righe.filter(r => r.verso === "uscita").reduce((s, r) => s + r.c, 0);
    C("Saldo iniziale uguale nel riepilogo e nell'elenco", R.iniziale.c === esito.saldoIniziale.c && R.iniziale.data === esito.saldoIniziale.data,
      `riepilogo ${euro(R.iniziale.c)} al ${it(R.iniziale.data)}, elenco ${euro(esito.saldoIniziale.c)} al ${it(esito.saldoIniziale.data)}`);
    C("Saldo finale uguale nel riepilogo e nell'elenco", R.finale.c === esito.saldoFinale.c && R.finale.data === esito.saldoFinale.data,
      `riepilogo ${euro(R.finale.c)} al ${it(R.finale.data)}, elenco ${euro(esito.saldoFinale.c)} al ${it(esito.saldoFinale.data)}`);
    C("Somma delle entrate uguale al «Totale Entrate» stampato", E === R.entrate, `righe ${euro(E)}, stampato ${euro(R.entrate)}`);
    C("Somma delle uscite uguale al «Totale Uscite» stampato", U === R.uscite, `righe ${euro(U)}, stampato ${euro(R.uscite)}`);
    C("Saldo iniziale + entrate − uscite = saldo finale", R.iniziale.c + E - U === R.finale.c,
      `${euro(R.iniziale.c)} + ${euro(E)} − ${euro(U)} = ${euro(R.iniziale.c + E - U)} (stampato ${euro(R.finale.c)})`);
    esito.periodo_dal = giornoDopo(R.iniziale.data); esito.periodo_al = R.finale.data;
    C("Estratto al = data del saldo finale", esito.estrattoAl === R.finale.data, `${it(esito.estrattoAl)} / ${it(R.finale.data)}`);
    const fuori = esito.righe.filter(r => r.data_contabile < esito.periodo_dal || r.data_contabile > esito.periodo_al);
    C("Tutte le righe dentro il periodo", fuori.length === 0, fuori.length ? `${fuori.length} righe fuori, la prima del ${it(fuori[0].data_contabile)}` : `dal ${it(esito.periodo_dal)} al ${it(esito.periodo_al)}`);
    esito.saldo_iniziale = R.iniziale.c / 100; esito.saldo_finale = R.finale.c / 100;
    esito.totali = { entrate: E, uscite: U };
  }
  const allineate = (b) => b.length === 0 || Math.max(...b) - Math.min(...b) <= 3;
  C("Importi incolonnati (uscite e entrate ciascuna in una sola colonna)", allineate(bordiUscite) && allineate(bordiEntrate),
    `uscite ${bordiUscite.length}, entrate ${bordiEntrate.length}`);
  C("Righe lette", esito.righe.length > 0, `${esito.righe.length} movimenti`);
  // righe nel formato di ci_carica_documento
  esito.righeCarico = esito.righe.map(r => ({ data_contabile: r.data_contabile, data_valuta: r.data_valuta, verso: r.verso,
    importo: Math.abs(r.c) / 100, descrizione: mascheraCarte(r.descrizione), pagina_pdf: r.pagina_pdf, ...dettagliDescrizione(r.descrizione) }));
  esito.valido = esito.errori.length === 0;
  return esito;
}

// ─── 3. Lista movimenti della carta prepagata BPER (Excel) ──────────────────
// righe: matrice di celle (XLSX.utils.sheet_to_json(foglio, {header: 1, raw: false}))
export function leggiExcelCartaBper(righe) {
  const esito = { tipo: "lista movimenti della carta", origine: "file della banca", banca: "BPER", carta: null, titolare: null,
    dal: null, al: null, movimentiDichiarati: null, righe: [], escluse: [], controlli: [], errori: [] };
  const cella = (r, i) => String(r?.[i] ?? "").trim();
  // con raw: true le celle di testo restano testo e gli importi sono numeri (mai «2,400» letto come 2,40)
  let m;
  for (const r of righe) {
    const etichetta = cella(r, 1), valore = cella(r, 2);
    if (etichetta === "Pan Carta") esito.carta = (valore.match(/(\d{4})\s*$/) || [])[1] || null;
    else if (etichetta === "Titolare") esito.titolare = valore;
    else if ((m = etichetta.match(/^Numero Movimenti Carta:\s*(\d+)/))) esito.movimentiDichiarati = Number(m[1]);
    else if ((m = etichetta.match(/^Intervallo di tempo: dal (\d{1,2}) (\w+) (\d{4})(?: fino al (\d{1,2}) (\w+) (\d{4}))?/i))) {
      esito.dal = dataMese(m[1], m[2], m[3]);
      if (m[4]) esito.al = dataMese(m[4], m[5], m[6]); else esito.alManca = true;   // «dal … » senza fine: vale fino al giorno dell'estrazione
    } else if ((m = etichetta.match(/^[A-Za-zÀ-ú ]+,\s*(\d{1,2}) (\w+) (\d{4})$/)) && MESI[m[2].toLowerCase()]) esito.estrattoIl = dataMese(m[1], m[2], m[3]); else if ((m = etichetta.match(/^(\d{1,2}) (\w+) (\d{4})$/)) && MESI[m[2].toLowerCase()]) {
      const data = `${m[3]}-${String(MESI[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      const importo = typeof r[3] === "number" ? r[3] : (importoCarta(String(r[3] ?? "")) ?? NaN) / 100;
      const stato = cella(r, 5);
      const riga = { data_contabile: data, verso: importo < 0 ? "uscita" : "entrata", c: Math.round(Math.abs(importo) * 100),
        descrizione: valore, stato };
      if (!Number.isFinite(importo) || importo === 0) esito.errori.push(`Riga del ${it(data)} senza importo leggibile`);
      else if (stato === "Contabilizzato") esito.righe.push(riga); else esito.escluse.push(riga);
    }
  }
  if (esito.alManca && esito.estrattoIl) esito.al = esito.estrattoIl;
  // Il giorno dell'estrazione e i giorni con movimenti «da contabilizzare» non sono chiusi: la lista copre
  // solo fino al giorno prima del primo dei due. Le righe dopo quel giorno non si caricano (arriveranno con la lista dopo).
  const giornoPrima = (iso) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
  const limiti = [esito.al];
  if (esito.estrattoIl) limiti.push(giornoPrima(esito.estrattoIl));
  if (esito.escluse.length) limiti.push(giornoPrima(esito.escluse.map(r => r.data_contabile).sort()[0]));
  const chiuso = limiti.filter(Boolean).sort()[0];
  if (chiuso && chiuso !== esito.al) {
    esito.alDichiarato = esito.al; esito.al = chiuso;
    for (const r of esito.righe.filter(r => r.data_contabile > chiuso)) { r.stato = "dopo l'ultimo giorno chiuso"; esito.escluse.push(r); }
    esito.righe = esito.righe.filter(r => r.data_contabile <= chiuso);
  }
  const C = (nome, ok, dettaglio) => { esito.controlli.push({ nome, ok, dettaglio }); if (!ok) esito.errori.push(nome + ": " + dettaglio); };
  C("Intestazione letta", !!(esito.carta && esito.titolare && esito.dal && esito.al), `carta …${esito.carta || "?"}, ${esito.titolare || "?"}, dal ${it(esito.dal)} al ${it(esito.al)}`);
  C("Numero di movimenti uguale a quello dichiarato dalla banca", esito.righe.length + esito.escluse.length === esito.movimentiDichiarati,
    `letti ${esito.righe.length + esito.escluse.length}, dichiarati ${esito.movimentiDichiarati}; non caricati ${esito.escluse.length} (da contabilizzare o dopo l'ultimo giorno chiuso, ${it(esito.al)})`);
  const fuori = esito.righe.filter(r => r.data_contabile < esito.dal || r.data_contabile > esito.al);
  C("Tutte le righe dentro il periodo", fuori.length === 0, fuori.length ? `${fuori.length} fuori` : "sì");
  // la lista non ha saldi: saldo iniziale e finale li calcola il programma dalla partenza della carta (decisione del Dottore, 10/11/2026 ore 13:45)
  esito.valido = esito.errori.length === 0;
  esito.righeCarico = esito.righe.map(r => ({ data_contabile: r.data_contabile, verso: r.verso, importo: r.c / 100, descrizione: mascheraCarte(r.descrizione) }));
  return esito;
}

// ─── 4. Lista movimenti CBI di BPER («Smart CBI – Lista movimenti CBI per rapporto», PDF del 2023) ───
export function leggiListaCbi(pagine) {
  const esito = { tipo: "estratto conto", origine: "letto da PDF", banca: "BPER", formato: "lista CBI", numeroConto: null, iban: null,
    righe: [], controlli: [], errori: [], pagine_pdf: pagine.length, info: {} };
  const errore = (t) => esito.errori.push(t);
  let col = null, corrente = null, finito = false;
  const bordiDare = [], bordiAvere = [];
  for (const p of pagine) {
    for (const r of righeDellaPagina(p.voci)) {
      const t = r.testo; let m;
      if ((m = t.match(/^Conto: (IT\w{25}) EUR (\d{6,})/))) { esito.iban = m[1]; esito.numeroConto = m[2].replace(/^0+/, ""); continue; }
      if ((m = t.match(/^Saldo iniziale al: (\d{2}\/\d{2}\/\d{2}) ([+-]?[\d.]+,\d{2})/))) { esito.info.iniziale = { data: dataIso(m[1]), c: centesimi(m[2]) }; continue; }
      if ((m = t.match(/^Saldo Finale al: (\d{2}\/\d{2}\/\d{2}) ([+-]?[\d.]+,\d{2})/))) { esito.info.finale = { data: dataIso(m[1]), c: centesimi(m[2]) }; continue; }
      if ((m = t.match(/^Filtro applicato: D\.contabile >= (\d{2}\/\d{2}\/\d{2}), D\.contabile <= (\d{2}\/\d{2}\/\d{2})/))) { esito.info.dal = dataIso(m[1]); esito.info.al = dataIso(m[2]); continue; }
      const nomi = r.voci.map(v => v.s.trim());
      if (nomi.includes("D. cont.") && nomi.includes("Dare") && nomi.includes("Avere")) {
        const v = (n) => r.voci.find(x => x.s.trim() === n);
        const nuova = { data: v("D. cont.").x, valuta: v("D. val.").x, descrizione: v("Descrizione movimento").x, causale: v("Caus.").x,
          fineDare: v("Dare").x + v("Dare").w, fineAvere: v("Avere").x + v("Avere").w };
        col = col || nuova; continue;
      }
      if (!col) continue;
      if (/Totali dare e avere:/.test(t)) {
        const imp = r.voci.filter(v => v.x > col.causale + 20 && centesimi(v.s) !== null);
        esito.info.totaleDare = 0; esito.info.totaleAvere = 0;
        for (const v of imp) { if (v.x + v.w <= (col.fineDare + col.fineAvere) / 2) esito.info.totaleDare = centesimi(v.s); else esito.info.totaleAvere = centesimi(v.s); }
        finito = true; corrente = null; continue;
      }
      if (finito || /^Il saldo iniziale e il saldo finale|^dati nel periodo|^Pag\. ?\d|^\d{8} - |^Smart CBI|Lista movimenti CBI|^Società:|^Banca:/.test(t)) continue;
      const primo = r.voci[0];
      const dataContabile = primo.x < col.valuta - 10 ? dataIso(primo.s) : null;
      if (dataContabile) {
        const valuta = r.voci.find(v => v.x >= col.valuta - 10 && v.x < col.descrizione - 5);
        const descr = r.voci.filter(v => v.x >= col.descrizione - 2 && v.x < col.causale - 5).map(v => v.s).join(" ").replace(/\s+/g, " ").trim();
        const imp = r.voci.filter(v => v.x > col.causale + 20 && centesimi(v.s) !== null);
        if (imp.length !== 1) { errore(`Pagina ${p.numero}: riga del ${it(dataContabile)} con ${imp.length} importi`); corrente = null; continue; }
        const bordo = imp[0].x + imp[0].w, dare = bordo <= (col.fineDare + col.fineAvere) / 2;
        (dare ? bordiDare : bordiAvere).push(bordo);
        corrente = { pagina_pdf: p.numero, data_contabile: dataContabile, data_valuta: valuta ? dataIso(valuta.s) : null,
          verso: dare ? "uscita" : "entrata", c: Math.abs(centesimi(imp[0].s)), descrizione: descr };
        if (!corrente.data_valuta) errore(`Pagina ${p.numero}: riga del ${it(dataContabile)} senza data valuta`);
        esito.righe.push(corrente); continue;
      }
      if (corrente && primo.x >= col.descrizione - 5 && primo.x < col.causale - 5) { corrente.descrizione = (corrente.descrizione + " " + t).replace(/\s+/g, " ").trim(); continue; }
      errore(`Pagina ${p.numero}: riga non riconosciuta «${t.slice(0, 70)}»`);
    }
  }
  const C = (nome, ok, dettaglio) => { esito.controlli.push({ nome, ok, dettaglio }); if (!ok) errore(nome + ": " + dettaglio); };
  const I = esito.info;
  C("Intestazione letta", !!(esito.iban && esito.numeroConto && I.dal && I.al), `conto ${esito.numeroConto || "?"}, filtro dal ${it(I.dal)} al ${it(I.al)}`);
  C("Saldi e totali letti", !!(I.iniziale && I.finale && I.totaleDare != null), "saldo iniziale, saldo finale, totali dare e avere");
  if (I.iniziale && I.finale && I.totaleDare != null) {
    const D = esito.righe.filter(r => r.verso === "uscita").reduce((s, r) => s + r.c, 0);
    const A = esito.righe.filter(r => r.verso === "entrata").reduce((s, r) => s + r.c, 0);
    C("Somma dare uguale al totale stampato", D === I.totaleDare, `righe ${euro(D)}, stampato ${euro(I.totaleDare)}`);
    C("Somma avere uguale al totale stampato", A === I.totaleAvere, `righe ${euro(A)}, stampato ${euro(I.totaleAvere)}`);
    C("Saldo iniziale − dare + avere = saldo finale", I.iniziale.c - D + A === I.finale.c, `${euro(I.iniziale.c)} − ${euro(D)} + ${euro(A)} = ${euro(I.iniziale.c - D + A)} (stampato ${euro(I.finale.c)})`);
    C("Date dei saldi uguali al filtro", I.iniziale.data === I.dal && I.finale.data === I.al, `saldo iniziale al ${it(I.iniziale.data)}, finale al ${it(I.finale.data)}, filtro ${it(I.dal)}–${it(I.al)}`);
    // il «saldo iniziale al» è il saldo all'inizio del primo giorno, cioè alla fine del giorno prima
    const prima = new Date(I.dal + "T00:00:00Z"); prima.setUTCDate(prima.getUTCDate() - 1);
    esito.saldoInizialeAlla = prima.toISOString().slice(0, 10);
    esito.periodo_dal = I.dal; esito.periodo_al = I.al;
    esito.saldo_iniziale = I.iniziale.c / 100; esito.saldo_finale = I.finale.c / 100;
    esito.totali = { entrate: A, uscite: D };
    const fuori = esito.righe.filter(r => r.data_contabile < I.dal || r.data_contabile > I.al);
    C("Tutte le righe dentro il periodo", fuori.length === 0, fuori.length ? `${fuori.length} fuori` : `dal ${it(I.dal)} al ${it(I.al)}`);
  }
  const allineate = (b) => b.length === 0 || Math.max(...b) - Math.min(...b) <= 3;
  C("Importi incolonnati", allineate(bordiDare) && allineate(bordiAvere), `dare ${bordiDare.length}, avere ${bordiAvere.length}`);
  esito.righeCarico = esito.righe.map(r => ({ data_contabile: r.data_contabile, data_valuta: r.data_valuta, verso: r.verso,
    importo: r.c / 100, descrizione: mascheraCarte(r.descrizione), pagina_pdf: r.pagina_pdf, ...dettagliDescrizione(r.descrizione) }));
  esito.valido = esito.errori.length === 0;
  return esito;
}

// ─── 5. Lista movimenti della carta prepagata in PDF («Lista movimenti – Relative alla carta …») ───
// Le liste non hanno né periodo né saldi: il periodo coperto va dal primo giorno con movimenti al giorno prima
// dell'ultimo (l'ultimo giorno può essere incompleto) e prima del primo movimento «da contabilizzare».
export function importoCarta(testo) {
  const t = String(testo).replace(/[€\s]/g, "");
  let m = t.match(/^([-+]?)(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})$/);            // 1.234,56
  if (m) return (m[1] === "-" ? -1 : 1) * (Number(m[2].replace(/\./g, "")) * 100 + Number(m[3]));
  m = t.match(/^([-+]?)(\d+)\.(\d{2})$/);                                       // 1234.56
  if (m) return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 100 + Number(m[3]));
  return null;
}
export function leggiPdfCartaBper(pagine) {
  const esito = { tipo: "lista movimenti della carta", origine: "letto da PDF", banca: "BPER", carta: null,
    righe: [], escluse: [], controlli: [], errori: [], pagine_pdf: pagine.length };
  let corrente = null, attesa = null;
  for (const p of pagine) {
    for (const r of righeDellaPagina(p.voci)) {
      const t = r.testo; let m;
      if ((m = t.match(/Relative alla carta .*?(\d{4})$/))) { esito.carta = esito.carta || m[1]; if (esito.carta !== m[1]) esito.errori.push(`Pagina ${p.numero}: carta diversa (${m[1]})`); continue; }
      if (t === "Lista movimenti") continue;
      if ((m = t.match(/^(\d{4})(\d{2})(\d{2})$/))) {
        if (attesa) esito.errori.push(`Pagina ${p.numero}: movimento del ${it(attesa.data_contabile)} senza importo`);
        attesa = { pagina_pdf: p.numero, data_contabile: dataIso(`${m[3]}/${m[2]}/${m[1]}`), descrizione: null, stato: "Contabilizzato" };
        if (!attesa.data_contabile) esito.errori.push(`Pagina ${p.numero}: data impossibile ${t}`);
        continue;
      }
      if (attesa && attesa.descrizione === null) { attesa.descrizione = t; continue; }
      if (attesa && importoCarta(t) !== null) {
        const c = importoCarta(t);
        corrente = { ...attesa, verso: c < 0 ? "uscita" : "entrata", c: Math.abs(c) };
        esito.righe.push(corrente); attesa = null; continue;
      }
      if (t === "Da contabilizzare" && corrente) { corrente.stato = "Da contabilizzare"; continue; }
      esito.errori.push(`Pagina ${p.numero}: riga non riconosciuta «${t.slice(0, 60)}»`);
    }
  }
  if (attesa) esito.errori.push(`Movimento del ${it(attesa.data_contabile)} senza importo`);
  const giornoPrima = (iso) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
  const date = esito.righe.map(r => r.data_contabile).sort();
  const sospese = esito.righe.filter(r => r.stato !== "Contabilizzato").map(r => r.data_contabile).sort();
  esito.dal = date[0] || null;
  esito.al = date.length ? [giornoPrima(date[date.length - 1]), ...(sospese.length ? [giornoPrima(sospese[0])] : [])].sort()[0] : null;
  for (const r of esito.righe.filter(r => r.stato !== "Contabilizzato" || r.data_contabile > esito.al)) esito.escluse.push(r);
  esito.righe = esito.righe.filter(r => r.stato === "Contabilizzato" && r.data_contabile <= esito.al);
  const C = (nome, ok, dettaglio) => { esito.controlli.push({ nome, ok, dettaglio }); if (!ok) esito.errori.push(nome + ": " + dettaglio); };
  C("Carta letta", !!esito.carta, `carta …${esito.carta || "?"}`);
  C("Righe lette", esito.righe.length > 0, `${esito.righe.length} movimenti dal ${it(esito.dal)} al ${it(esito.al)}; non caricati ${esito.escluse.length} (ultimo giorno o da contabilizzare)`);
  esito.valido = esito.errori.length === 0;
  esito.righeCarico = esito.righe.map(r => ({ data_contabile: r.data_contabile, verso: r.verso, importo: r.c / 100, descrizione: mascheraCarte(r.descrizione), pagina_pdf: r.pagina_pdf }));
  return esito;
}
