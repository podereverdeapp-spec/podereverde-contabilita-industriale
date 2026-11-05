// Versione 348: logica della pagina «Verifica Fatture Mancanti», separata dalla pagina perché si possa provare da sola.
// Difetti della versione precedente (segnalati dal Dott. Bizzarri il 05/11/2026 con il file del carico 2026):
//  1) si leggeva sempre il primo foglio del file: nel file del carico è il foglio con UNA RIGA PER VOCE di fattura,
//     quindi una fattura «non trovata» compariva tante volte quante sono le sue voci (207 fatture, 448 righe);
//  2) la fattura si cercava con numero + nome del fornitore scritto identico all'anagrafica: «BUTCHER SERVICE SRL
//     UNIPERSONALE» nel file e «BUTCHER SERVICE SRL» nel programma davano «mancante» una fattura presente.
// Ora: si sceglie il foglio, le righe si raggruppano in fatture, la fattura si riconosce dal numero e dalla data
// (e dalla partita IVA quando c'è); il nome del fornitore serve solo come controllo, scritto in forma ridotta.

// ---------------------------------------------------------------- forme ridotte

// numero della fattura con le sole lettere e cifre, senza zeri iniziali: «000615/QC9» → «615qc9», «37.» → «37»
export const numeroNorm = n => String(n ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^0+(?=.)/, "");

// partita IVA senza spazi e punti e senza il prefisso del paese («IT01234567890» → «01234567890»)
// (anche ripetuto, come «ESESB62394358» → «B62394358»); un codice fiscale di 16 caratteri resta com'è
const PREFISSO_PAESE = /^(IT|ES|FR|DE|AT|BE|NL|LU|PT|IE|DK|SE|FI|PL|CZ|SK|SI|HR|HU|RO|BG|GR|EL|CY|MT|LV|LT|EE|GB|CH|SM)/;
export function pivaNorm(p) {
  let s = String(p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (let i = 0; i < 3; i++) {
    const m = s.match(PREFISSO_PAESE);
    const resto = m ? s.slice(2) : "";
    if (!m || !/^[0-9A-Z]{8,12}$/.test(resto) || (resto.match(/\d/g) || []).length < 7) break;
    s = resto;
  }
  return s;
}

// parole che non distinguono un fornitore: forme societarie, articoli, lettere sciolte (da «S.R.L.» → «s r l»)
const PAROLE_VUOTE = new Set(["srl", "srls", "spa", "sas", "snc", "ss", "sarl", "sapa", "scarl", "scrl", "scpa", "unipersonale",
  "semplificata", "semplice", "soc", "societa", "coop", "cooperativa", "arl", "rl", "di", "del", "della", "dei", "e", "ed", "c", "co",
  "ditta", "fratelli", "flli", "azienda", "az", "agricola", "agr", "agraria", "impresa", "f", "lli", "sede", "secondaria", "stabile", "organizzazione", "in", "liquidazione", "the", "and"]);

// nome del fornitore ridotto alle parole che contano: «FARMAVET ROMA S.R.L.» e «FARMAVET ROMA SRL» → ["farmavet","roma"]
export function paroleNome(nome) {
  return String(nome ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\./g, "") // «S.R.L.» → «srl», «A.I.A.» → «aia», «F.LLI» → «flli»
    .replace(/[^a-z0-9]+/g, " ").trim().split(" ")
    .filter(p => p && !PAROLE_VUOTE.has(p));
}

// due nomi indicano lo stesso fornitore se le parole dell'uno stanno tutte nell'altro, o se ne hanno in comune la maggior parte
export function nomiSimili(a, b) {
  const A = new Set(paroleNome(a)), B = new Set(paroleNome(b));
  if (A.size === 0 || B.size === 0) return false;
  const comuni = [...A].filter(p => B.has(p)).length;
  if (comuni === A.size || comuni === B.size) return true;
  return comuni / new Set([...A, ...B]).size >= 0.5;
}

// ---------------------------------------------------------------- date

const aaaa = n => (n < 100 ? 2000 + n : n);
function isoValida(a, m, g) {
  if (!(a >= 1990 && a <= 2100 && m >= 1 && m <= 12 && g >= 1 && g <= 31)) return null;
  const d = new Date(Date.UTC(a, m - 1, g));
  if (d.getUTCMonth() !== m - 1) return null; // 31/02 e simili
  return `${a}-${String(m).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
}

// Data in forma aaaa-mm-gg da qualunque scrittura di un file: data di Excel, numero seriale di Excel,
// «15/04/2026», «15-04-2026», «15.04.2026», «15/4/26», «2026-04-15», «2026-04-15T00:00:00».
// Restituisce null se non è una data.
export function dataIso(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // Excel dà le date a mezzanotte ora italiana; un orario dopo le 23:30 è lo scarto della libreria (giorno dopo)
    const scarto = v.getHours() === 23 && v.getMinutes() >= 30;
    const d = scarto ? new Date(v.getFullYear(), v.getMonth(), v.getDate() + 1) : v;
    return isoValida(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null; // numero seriale di Excel: 20000 = 1954, 80000 = 2119
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return isoValida(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return isoValida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s.*)?$/);
  if (m) return isoValida(aaaa(+m[3]), +m[2], +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(s)) return dataIso(parseFloat(s));
  return null;
}

// ---------------------------------------------------------------- importi

// «1.234,56», «1234,56», «1,234.56», «1234.56», «€ 1.234,56», «-23.193,05», numeri veri → numero; altrimenti null
export function importo(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[€\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const virgole = (s.match(/,/g) || []).length, punti = (s.match(/\./g) || []).length;
  if (virgole && punti) {
    // il separatore che viene per ultimo è quello dei decimali
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (virgole) {
    s = virgole === 1 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (punti > 1 || /^-?\d{1,3}\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, ""); // «1.234» o «1.234.567»: punti delle migliaia
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
const r2 = n => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- colonne e fogli

const testo = h => String(h ?? "").trim().toLowerCase();
function primaColonna(intestazioni, prove) {
  for (const prova of prove) {
    const c = intestazioni.find(h => prova(testo(h)));
    if (c !== undefined) return c;
  }
  return "";
}

// Colonne del foglio riconosciute dal nome. Ogni scelta si può cambiare a mano nella pagina.
export function indovinaColonne(intestazioni) {
  const numero = primaColonna(intestazioni, [
    h => h === "numero" || h === "numero fattura" || h === "n. fattura" || h === "nr. fattura" || h === "numero documento",
    h => /numero/.test(h) && /(fattura|documento|doc)/.test(h),
    h => /^n(r|um)?\.?\s*(fatt|doc)/.test(h),
    h => /numero/.test(h) && !/(righe|riga|colli|pezzi|capi|ddt)/.test(h),
  ]);
  const data = primaColonna(intestazioni, [
    h => h === "data" || h === "data fattura" || h === "data documento" || h === "data emissione",
    h => /^data/.test(h) && /(fattura|documento|emissione)/.test(h),
    h => /^data/.test(h) && !/(scadenza|ricezione|consegna|pagamento|invio|registrazione|caricamento|ddt)/.test(h),
  ]);
  const piva = primaColonna(intestazioni, [
    h => /p\.?\s*iva|partita\s*iva|piva/.test(h) && !/aliquota/.test(h),
    h => /(id|identificativo) fiscale|codice fiscale/.test(h),
  ]);
  const fornitore = primaColonna(intestazioni, [
    h => h === "fornitore" || h === "cliente" || h === "controparte",
    h => /(fornitore|cedente|cessionario|cliente|denominazione|ragione sociale|emittente|controparte)/.test(h) && !/(p\.?\s*iva|partita|codice|id)/.test(h),
  ]);
  const totale = primaColonna(intestazioni, [
    h => /totale/.test(h) && /(pdf|documento|fattura)/.test(h) && !/calcolat/.test(h),
    h => h === "totale" || h === "importo totale" || h === "totale (euro)" || h === "totale euro",
    h => /totale/.test(h) && !/(calcolat|imponibile|iva|righe|riga)/.test(h),
  ]);
  const imponibile = primaColonna(intestazioni, [
    h => /imponibile/.test(h) && /pdf/.test(h),
    h => h === "imponibile" || h === "imponibile (euro)",
    h => /imponibile/.test(h) && !/calcolat/.test(h),
  ]);
  const tipoDocumento = primaColonna(intestazioni, [h => /tipo/.test(h) && /(documento|doc)/.test(h), h => h === "tipo"]);
  const descrizione = primaColonna(intestazioni, [h => /descrizione/.test(h)]);
  return { numero, data, piva, fornitore, totale, imponibile, tipoDocumento, descrizione };
}

// Righe vere di un foglio: tolte quelle vuote e quelle senza nessun valore nelle colonne indicate
export function righeUtili(righe) {
  return righe.filter(r => Object.values(r).some(v => v !== "" && v !== null && v !== undefined));
}

// Fatture distinte di un foglio secondo le colonne indicate (chiave: fornitore o partita IVA, numero, data)
function chiaveFattura(r, col) {
  const n = numeroNorm(r[col.numero]);
  const d = col.data ? (dataIso(r[col.data]) || String(r[col.data] ?? "")) : "";
  const chi = (col.piva && pivaNorm(r[col.piva])) || paroleNome(col.fornitore ? r[col.fornitore] : "").join(" ");
  return `${chi}|${n}|${d}`;
}

// Descrizione di un foglio: righe, fatture distinte, se ha una riga per fattura o una riga per voce
export function descriviFoglio(nome, righe) {
  const utili = righeUtili(righe);
  const intestazioni = utili.length ? Object.keys(utili[0]) : [];
  const col = indovinaColonne(intestazioni);
  const fatture = col.numero ? new Set(utili.filter(r => numeroNorm(r[col.numero])).map(r => chiaveFattura(r, col))).size : 0;
  return { nome, righe: utili.length, fatture, intestazioni, colonne: col, unaRigaPerFattura: fatture > 0 && fatture === utili.filter(r => numeroNorm(r[col.numero])).length };
}

// Foglio proposto: quello con il numero della fattura e una riga per fattura (es. «Verifica Fatture»);
// altrimenti quello con il numero della fattura e più fatture (le righe si raggruppano); altrimenti il primo.
export function scegliFoglio(fogli) {
  const conNumero = fogli.map((f, i) => ({ ...f, i })).filter(f => f.colonne.numero && f.fatture > 0);
  if (!conNumero.length) return 0;
  const unaPerFattura = conNumero.filter(f => f.unaRigaPerFattura && f.colonne.data);
  const pool = unaPerFattura.length ? unaPerFattura : conNumero;
  // a parità, il foglio con più fatture
  return pool.sort((a, b) => b.fatture - a.fatture || a.i - b.i)[0].i;
}

// ---------------------------------------------------------------- fatture del file

// Raggruppa le righe del foglio in fatture. Restituisce { fatture, scartate, doppioni, righeLette }.
// numeroRiga: numero della riga nel foglio Excel (l'intestazione è la riga 1)
export function fattureDalFoglio(righe, col) {
  const fatture = new Map();
  const scartate = [];
  const ignorate = [];
  const ordine = [];
  righe.forEach((r, i) => {
    const numeroRiga = i + 2;
    const vuota = !Object.values(r).some(v => v !== "" && v !== null && v !== undefined);
    if (vuota) return;
    const numero = String(r[col.numero] ?? "").trim();
    const n = numeroNorm(numero);
    const dataTesto = col.data ? r[col.data] : null;
    const data = col.data ? dataIso(dataTesto) : null;
    const fornitore = col.fornitore ? String(r[col.fornitore] ?? "").trim() : "";
    const piva = col.piva ? pivaNorm(r[col.piva]) : "";
    // riga senza un numero di fattura (nessuna cifra) e senza una data valida: nota o riga dei totali, si salta
    if (!/\d/.test(n) && !data) { ignorate.push({ numeroRiga, testo: [fornitore, numero, String(dataTesto ?? "")].filter(Boolean).join(" · ").slice(0, 120) }); return; }
    if (!n) { scartate.push({ numeroRiga, fornitore, numero, data: data || String(dataTesto ?? ""), motivo: "senza numero della fattura" }); return; }
    if (!/\d/.test(n)) { scartate.push({ numeroRiga, fornitore, numero, data: data || String(dataTesto ?? ""), motivo: "il numero della fattura non ha cifre" }); return; }
    if (col.data && !data) { scartate.push({ numeroRiga, fornitore, numero, data: String(dataTesto ?? ""), motivo: "data non leggibile" }); return; }
    const k = `${piva || paroleNome(fornitore).join(" ")}|${n}|${data || ""}`;
    let f = fatture.get(k);
    if (!f) {
      f = { chiave: k, fornitore, piva, numero, num: n, data, anno: data ? data.slice(0, 4) : null, righeFoglio: [], totali: [], imponibili: [], tipi: new Set() };
      fatture.set(k, f); ordine.push(k);
    }
    f.righeFoglio.push(numeroRiga);
    if (col.totale) { const t = importo(r[col.totale]); if (t !== null) f.totali.push(t); }
    if (col.imponibile) { const t = importo(r[col.imponibile]); if (t !== null) f.imponibili.push(t); }
    if (col.tipoDocumento && r[col.tipoDocumento]) f.tipi.add(String(r[col.tipoDocumento]).trim());
    if (!f.fornitore && fornitore) f.fornitore = fornitore;
    if (!f.piva && piva) f.piva = piva;
  });
  const lista = ordine.map(k => fatture.get(k));
  // foglio con una riga per voce: ha la descrizione delle voci, oppure righe della stessa fattura con importi diversi
  // (le voci di una fattura hanno importi diversi; una fattura scritta due volte ha le righe uguali)
  const importiDiversi = vals => vals.length > 1 && new Set(vals).size > 1;
  const righePerVoce = !!col.descrizione || lista.some(f => importiDiversi(f.totali) || importiDiversi(f.imponibili));
  // Una colonna con «documento», «fattura» o «pdf» nel nome porta il totale della fattura intera (ripetuto su ogni
  // voce): se ne prende un valore. Le altre colonne di importo, in un foglio con una riga per voce, si sommano.
  const diFattura = h => /(documento|fattura|pdf)/i.test(String(h || ""));
  const valore = (vals, intestazione) => {
    if (!vals.length) return null;
    if (!righePerVoce || diFattura(intestazione)) return vals[0];
    return r2(vals.reduce((s, v) => s + v, 0));
  };
  lista.forEach(f => {
    f.totaliDiversiSulleRighe = diFattura(col.totale) && f.totali.some(v => v !== f.totali[0]);
    f.totale = valore(f.totali, col.totale);
    f.imponibile = valore(f.imponibili, col.imponibile);
    f.notaDiCredito = [...f.tipi].some(t => /nota\s*di\s*credito|td04|credito/i.test(t)) || (f.totale !== null && f.totale < 0) || (f.imponibile !== null && f.imponibile < 0);
    f.tipoDocumento = [...f.tipi].join(", ");
    f.righe = f.righeFoglio.length;
    f.doppione = !righePerVoce && f.righeFoglio.length > 1;
    delete f.totali; delete f.imponibili; delete f.tipi;
  });
  return { fatture: lista, scartate, ignorate, righeLette: righe.length, righePerVoce };
}

// Completa le fatture del foglio scelto con i dati che mancano (partita IVA, totale, imponibile) presi dagli altri
// fogli dello stesso file: per esempio il file del carico ha la partita IVA solo nel foglio «Fatture» e i totali
// del PDF solo nel foglio «Verifica Fatture». La fattura si riconosce da numero, data e nome ridotto del fornitore.
export function completaDaAltriFogli(fatture, altriFogli) {
  const completate = new Set();
  for (const { righe, colonne } of altriFogli) {
    if (!colonne.numero) continue;
    const { fatture: altre } = fattureDalFoglio(righe, colonne);
    const perChiave = new Map(), perNumeroData = new Map();
    altre.forEach(a => {
      perChiave.set(`${a.num}|${a.data}|${paroleNome(a.fornitore).join(" ")}`, a);
      const k = `${a.num}|${a.data}`;
      perNumeroData.set(k, perNumeroData.has(k) ? null : a); // null = più fatture con lo stesso numero e data
    });
    fatture.forEach(f => {
      const a = perChiave.get(`${f.num}|${f.data}|${paroleNome(f.fornitore).join(" ")}`) || perNumeroData.get(`${f.num}|${f.data}`);
      if (!a) return;
      let cambiata = false;
      if (!f.piva && a.piva) { f.piva = a.piva; cambiata = true; }
      if ((f.totale === null || f.totale === undefined) && a.totale !== null && a.totale !== undefined) { f.totale = a.totale; cambiata = true; }
      if ((f.imponibile === null || f.imponibile === undefined) && a.imponibile !== null && a.imponibile !== undefined) { f.imponibile = a.imponibile; cambiata = true; }
      if (!f.tipoDocumento && a.tipoDocumento) { f.tipoDocumento = a.tipoDocumento; f.notaDiCredito = f.notaDiCredito || a.notaDiCredito; }
      if (cambiata) completate.add(f.chiave);
    });
  }
  return completate.size;
}

// ---------------------------------------------------------------- confronto

const giorniTra = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);
const vicino = (a, b, tolleranza = 0.05) => a !== null && b !== null && a !== undefined && b !== undefined && Math.abs(Math.abs(a) - Math.abs(b)) <= tolleranza;

// Importo della fattura nel programma confrontabile con quello del file. Gli acquisti di animali (Report)
// hanno solo l'imponibile: si confrontano solo con l'imponibile del file.
// Restituisce null se il file non ha importi; altrimenti { controlli: [...], uguale, spiegazione }.
function confrontoImporti(f, d) {
  const num = v => (v === null || v === undefined || v === "" ? null : Number(v));
  const lordo = num(d.totale_lordo), netto = num(d.totale_netto);
  const controlli = [];
  if (f.totale !== null && f.totale !== undefined && lordo !== null && !d.acquisto_animali) {
    controlli.push({ cosa: "totale", file: f.totale, programma: lordo, uguale: vicino(f.totale, lordo) });
  }
  if (f.imponibile !== null && f.imponibile !== undefined && netto !== null) {
    controlli.push({ cosa: "imponibile", file: f.imponibile, programma: netto, uguale: vicino(f.imponibile, netto) });
  }
  if (!controlli.length) return null;
  const uguale = controlli.every(c => c.uguale);
  let spiegazione = "";
  if (!uguale) {
    const tot = controlli.find(c => c.cosa === "totale");
    if (d.acquisto_animali) spiegazione = "acquisto di animali: nel Report l'importo dei capi può comprendere il trasporto o essere diviso diversamente";
    else if (tot && !tot.uguale && f.imponibile !== null && vicino(lordo, f.imponibile)) spiegazione = "nel programma il totale della fattura è uguale all'imponibile: manca l'IVA";
    else if (tot && !tot.uguale && lordo === 0) spiegazione = "nel programma il totale della fattura è zero";
    else if (controlli.every(c => c.uguale || Math.abs(Math.abs(c.file) - Math.abs(c.programma)) <= 1)) spiegazione = "differenza di arrotondamento (meno di un euro)";
  }
  return { controlli, uguale, spiegazione };
}

// Confronta le fatture del file con i documenti del programma.
// documenti: righe di ci_v_ricerca_documenti (chiave, tipo, numero, data, controparte, partita_iva, totale_netto,
// totale_lordo, acquisto_animali); tipi: ["PASSIVA"] o ["ATTIVA"]; anni: anni da controllare (stringhe) o null = tutti.
export function confronta(fattureFile, documenti, { tipi = ["PASSIVA"], anni = null, soloFornitoriDelFile = false } = {}) {
  const tipiDeboli = tipi.includes("ATTIVA") ? ["DA_EMETTERE"] : ["DA_RICEVERE"];
  const docs = documenti.filter(d => tipi.includes(d.tipo) || tipiDeboli.includes(d.tipo)).map(d => ({
    ...d, _num: numeroNorm(d.numero), _nums: String(d.numero ?? "").split(/\s+e\s+/i).map(numeroNorm).filter(Boolean),
    _piva: pivaNorm(d.partita_iva), _debole: tipiDeboli.includes(d.tipo),
  }));
  const perNumero = new Map();
  docs.forEach(d => new Set([d._num, ...d._nums]).forEach(n => { if (!n) return; if (!perNumero.has(n)) perNumero.set(n, []); perNumero.get(n).push(d); }));

  // una fattura senza data (file senza colonna della data) si controlla sempre, sugli anni scelti
  const nelPeriodo = f => !anni || !f.anno || anni.includes(f.anno);
  const daControllare = fattureFile.filter(nelPeriodo);
  const fuoriPeriodo = fattureFile.filter(f => !nelPeriodo(f));
  const usati = new Set();
  const presenti = [], mancanti = [], daGuardare = [];

  const stessoFornitore = (f, d) => {
    if (f.piva && d._piva) return f.piva === d._piva;
    if (!f.piva && !paroleNome(f.fornitore).length) return true; // il file non dice chi è il fornitore: vale numero e data
    return nomiSimili(f.fornitore, d.controparte);
  };
  const nota = (f, d) => {
    const note = [];
    if (f.piva && d._piva && f.piva !== d._piva) note.push("partita IVA diversa");
    if (f.fornitore && d.controparte && !nomiSimili(f.fornitore, d.controparte)) note.push("nome del fornitore molto diverso");
    else if (f.fornitore && d.controparte && paroleNome(f.fornitore).join(" ") !== paroleNome(d.controparte).join(" ")) note.push("nome scritto in modo diverso");
    return note;
  };

  // Primo giro: le fatture che si trovano con numero, data e fornitore. Si fa per tutte prima di cercare le altre,
  // così una fattura «quasi uguale» non prende il posto della fattura giusta di un'altra riga del file.
  const restano = [];
  const inPeriodoDoc = d => !anni || anni.includes(String(d.data || "").slice(0, 4));
  for (const f of daControllare) {
    const stessaData = (perNumero.get(f.num) || []).filter(d => !usati.has(d.chiave) && !d._debole && (f.data ? d.data === f.data : inPeriodoDoc(d)));
    let trovato = stessaData.filter(d => stessoFornitore(f, d));
    if (trovato.length > 1 && f.piva) trovato = trovato.filter(d => d._piva === f.piva);
    if (trovato.length >= 1) {
      const d = trovato[0];
      usati.add(d.chiave);
      presenti.push({ f, d, note: nota(f, d), importi: confrontoImporti(f, d), ambiguo: trovato.length > 1 });
    } else restano.push(f);
  }
  const guarda = (f, d, motivo) => { usati.add(d.chiave); daGuardare.push({ f, d, motivo, importi: confrontoImporti(f, d) }); };

  // Secondo giro: le fatture non trovate. Si cercano i casi «quasi uguali», che decide il Dottore.
  for (const f of restano) {
    const candidati = (perNumero.get(f.num) || []).filter(d => !usati.has(d.chiave));
    const forti = candidati.filter(d => !d._debole);
    const stessaData = forti.filter(d => (f.data ? d.data === f.data : inPeriodoDoc(d)));

    // 2. stesso numero e stessa data, ma il fornitore non torna
    if (stessaData.length >= 1) {
      const d = stessaData[0];
      const parolaComune = paroleNome(f.fornitore).some(p => paroleNome(d.controparte).includes(p));
      const pivaDiversa = d._piva && f.piva && d._piva !== f.piva;
      guarda(f, d, parolaComune
        ? `stesso numero e stessa data; nel programma il fornitore è scritto «${d.controparte}»${pivaDiversa ? " con partita IVA diversa" : ""}: controllare che sia lo stesso`
        : `stesso numero e stessa data, ma nel programma il fornitore è un altro («${d.controparte || "senza nome"}»${pivaDiversa ? ", partita IVA diversa" : ""})`);
      continue;
    }
    // 3. stesso numero e stesso fornitore, data diversa entro 31 giorni (data scritta male o registrata in un altro giorno)
    const dataVicina = forti.filter(d => stessoFornitore(f, d) && f.data && d.data && giorniTra(f.data, d.data) <= 31)
      .sort((a, b) => giorniTra(f.data, a.data) - giorniTra(f.data, b.data));
    if (dataVicina.length) {
      const d = dataVicina[0];
      guarda(f, d, `stesso numero e stesso fornitore, ma nel programma la data è ${d.data} (${giorniTra(f.data, d.data)} giorni di differenza)`);
      continue;
    }
    // 4. registrata come «fattura da ricevere» (segnaposto), non ancora come fattura
    const deboli = candidati.filter(d => d._debole && stessoFornitore(f, d));
    if (deboli.length) { guarda(f, deboli[0], "nel programma c'è solo come fattura da ricevere"); continue; }
    if (!f.data) {
      const altrove = (perNumero.get(f.num) || []).filter(d => !d._debole && stessoFornitore(f, d));
      mancanti.push({ f, nota: altrove.length ? `stesso numero dello stesso fornitore nel programma con data ${altrove.map(d => d.data).join(", ")}` : "" });
      continue;
    }
    // stesso fornitore e stessa data: documenti del programma ancora liberi
    const delGiorno = docs.filter(d => !d._debole && !usati.has(d.chiave) && d.data === f.data && stessoFornitore(f, d));
    // 5. numero scritto in modo diverso (uno contiene l'altro, es. «801-FAT» e «801 -FATT», «FPR 37/26» e «37»)
    const numeroSimile = delGiorno.filter(d => d._num && (d._num.includes(f.num) || f.num.includes(d._num)));
    if (numeroSimile.length) { guarda(f, numeroSimile[0], `stesso fornitore e stessa data, numero scritto in modo diverso nel programma («${numeroSimile[0].numero}»)`); continue; }
    // 6. stesso importo, numero diverso
    const stessoImporto = delGiorno.filter(d => confrontoImporti(f, d)?.uguale);
    if (stessoImporto.length === 1) { guarda(f, stessoImporto[0], `stesso fornitore, stessa data e stesso importo, ma numero diverso nel programma («${stessoImporto[0].numero}»)`); continue; }
    // 7. un solo documento di quel fornitore in quel giorno, con un altro numero
    if (delGiorno.length === 1) { guarda(f, delGiorno[0], `stesso fornitore e stessa data, ma numero diverso nel programma («${delGiorno[0].numero ?? "senza numero"}»)`); continue; }
    // 8. non c'è
    const altrove = (perNumero.get(f.num) || []).filter(d => !d._debole && stessoFornitore(f, d));
    mancanti.push({ f, nota: altrove.length ? `nel programma c'è lo stesso numero dello stesso fornitore con data ${altrove.map(d => d.data).join(", ")}: probabilmente un'altra fattura` : "" });
  }

  // documenti del programma nel periodo che il file non contiene
  const anniFile = new Set(daControllare.map(f => f.anno).filter(Boolean));
  const anniPeriodo = anni || [...anniFile];
  const chiaviFornitoriFile = new Set(daControllare.map(f => f.piva).filter(Boolean));
  const nomiFile = daControllare.map(f => f.fornitore).filter(Boolean);
  const nelProgrammaNonNelFile = docs.filter(d => !d._debole && !usati.has(d.chiave) && tipi.includes(d.tipo) && d.data && anniPeriodo.includes(String(d.data).slice(0, 4)))
    .filter(d => !soloFornitoriDelFile || (d._piva && chiaviFornitoriFile.has(d._piva)) || nomiFile.some(n => nomiSimili(n, d.controparte)))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.controparte).localeCompare(String(b.controparte)));

  const importiDiversi = presenti.filter(p => p.importi && !p.importi.uguale);
  const nomiDiversi = presenti.filter(p => p.note.length);
  const doppioniFile = daControllare.filter(f => f.doppione);
  return { presenti, mancanti, daGuardare, nelProgrammaNonNelFile, importiDiversi, nomiDiversi, doppioniFile, fuoriPeriodo, controllate: daControllare.length };
}
