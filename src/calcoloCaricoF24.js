// Versione 333 (30/10/2026): regole della pagina «Carica F24» — lettura del file di carico, controlli,
// confronto con il database e allarmi delle scadenze. Le stesse regole del «Prompt per carico F24 nel programma» (versione 5).
// Qui non si scrive niente: la scrittura la fa la pagina, delega per delega, con la funzione ci_f24_salva_delega del database.

// ── Valori fissi ───────────────────────────────────────────────────────────────────────────────────
export const COLONNE_F24 = ["Codice delega", "Nome file PDF", "Nome del file ricevuto", "Delega nel file ricevuto", "Oggetto", "Data di scadenza",
  "Totale a debito", "Totale a credito", "Saldo", "Tipo di pagamento", "Stato", "Data del pagamento", "Codice banca e sportello", "Banca di addebito",
  "Protocollo telematico", "Nome file quietanza", "Nome file contabile della banca", "Numero dell'operazione della banca", "Note"];
export const COLONNE_RIGHE = ["Codice delega", "Nome file PDF", "Sezione", "Codice tributo o causale", "Descrizione del codice", "Codice ente o sede",
  "Matricola o riferimento", "Rateazione o mese di riferimento", "Anno di riferimento", "Periodo dal", "Periodo al", "Importo a debito",
  "Importo a credito", "Trattamento", "Codice nuovo confermato da"];
export const COLONNE_VERIFICA = ["Codice delega", "Nome file PDF", "Somma dei debiti delle righe", "Totale dei debiti stampato", "Somma dei crediti delle righe",
  "Totale dei crediti stampato", "Saldo calcolato", "Saldo finale stampato", "Corrisponde?", "Codice sconosciuto", "Avvisi"];

const CAMPI_F24 = {
  "Codice delega": "codice_delega", "Nome file PDF": "nome_file_pdf", "Nome del file ricevuto": "nome_file_ricevuto",
  "Delega nel file ricevuto": "delega_nel_file_ricevuto", "Oggetto": "oggetto", "Data di scadenza": "data_scadenza", "Totale a debito": "totale_debito",
  "Totale a credito": "totale_credito", "Saldo": "saldo", "Tipo di pagamento": "tipo_pagamento", "Stato": "stato", "Data del pagamento": "data_pagamento",
  "Codice banca e sportello": "codice_banca_sportello", "Banca di addebito": "banca_addebito", "Protocollo telematico": "protocollo_telematico",
  "Nome file quietanza": "nome_file_quietanza", "Nome file contabile della banca": "nome_file_contabile",
  "Numero dell'operazione della banca": "numero_operazione_banca", "Note": "note",
};
const CAMPI_RIGHE = {
  "Sezione": "sezione", "Codice tributo o causale": "codice_tributo", "Descrizione del codice": "descrizione_codice", "Codice ente o sede": "codice_ente_sede",
  "Matricola o riferimento": "matricola_riferimento", "Rateazione o mese di riferimento": "rateazione_mese", "Anno di riferimento": "anno_riferimento",
  "Periodo dal": "periodo_dal", "Periodo al": "periodo_al", "Importo a debito": "importo_debito", "Importo a credito": "importo_credito",
  "Trattamento": "trattamento", "Codice nuovo confermato da": "codice_confermato_da",
};
const DATE = new Set(["data_scadenza", "data_pagamento"]);
const IMPORTI = new Set(["totale_debito", "totale_credito", "saldo", "importo_debito", "importo_credito"]);

export const SEZIONI = ["Erario", "INPS", "Regioni", "IMU e altri tributi locali", "INAIL", "Altri enti previdenziali"];
export const TRATTAMENTI = ["Costo generale ripartito sugli animali", "Imposte e tasse: costo non ripartito sugli animali", "Sanzioni e interessi",
  "Solo pagamento", "Credito: né costo né ricavo", "Non è un costo (IVA)", "Da decidere"];
const STATI_FILE = ["Da pagare", "Pagato", "Sostituito"];
// valori che nel file vogliono dire «vuoto» (come la funzione ci_f24_pulisci del database)
const VUOTI = new Set(["", "NON PRESENTE", "NON ANCORA PAGATO", "NON INDICATO", "DA VERIFICARE"]);
export const LIMITE_PDF = 10 * 1024 * 1024; // 10 MB, come l'archivio «f24»

// ── Conversioni ─────────────────────────────────────────────────────────────────────────────────────
export const vuoto = v => v == null || (typeof v === "string" && VUOTI.has(v.trim().toUpperCase()));
export const testo = v => (vuoto(v) ? null : String(v).trim());
export const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const euro = n => (n == null || isNaN(n) ? "—" : Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const dataIt = d => (d ? d.split("-").reverse().join("/") : "—");

// data di Excel → «AAAA-MM-GG», senza fusi orari: dal numero di serie di Excel o dal testo gg/mm/aaaa
export function leggiData(v) {
  if (vuoto(v)) return { valore: null };
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return { valore: d.toISOString().slice(0, 10) }; // conto fatto tutto in UTC: nessun giorno perso
  }
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [g, me, a] = [+m[1], +m[2], +m[3]];
    const d = new Date(Date.UTC(a, me - 1, g));
    if (d.getUTCFullYear() === a && d.getUTCMonth() === me - 1 && d.getUTCDate() === g) return { valore: `${a}-${String(me).padStart(2, "0")}-${String(g).padStart(2, "0")}` };
  }
  return { errore: `«${v}» non è una data` };
}

// testo di una cella: se nella cella c'è un numero si prende il numero com'è, salvo gli zeri iniziali visibili («02»);
// un numero lungo (per esempio un protocollo di 17 cifre) scritto come numero ha già perso delle cifre: è un errore
function leggiTesto(g, s) {
  if (typeof g === "number") {
    if (Number.isInteger(g) && Math.abs(g) >= 1e15) return { errore: `«${s ?? g}» è scritto come numero e ha perso delle cifre: va scritto come testo` };
    const w = s == null ? "" : String(s).trim();
    // si tiene il testo visibile quando ha zeri iniziali («02») o è una data («02/2026», «28/02/2026»)
    return { valore: testo(/^0\d+$/.test(w) || /^\d{1,4}[/-]\d{1,4}([/-]\d{1,4})?$/.test(w) ? w : String(g)) };
  }
  return { valore: testo(s ?? g) };
}

// importo: deve essere un numero (le colonne di importo non sono mai testo)
function leggiImporto(v) {
  if (v == null || v === "") return { valore: 0 };
  if (typeof v === "number" && Number.isFinite(v)) return { valore: r2(v) };
  return { errore: `«${v}» è scritto come testo, non come numero` };
}

// ── Lettura del file di carico ──────────────────────────────────────────────────────────────────────
// XLSX: la libreria xlsx-js-style; buffer: il contenuto del file. Restituisce deleghe, anomalie del file e intestazioni.
export function leggiFileCarico(XLSX, buffer, anno) {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const anomalie = [];
  if (wb.Workbook?.WBProps?.date1904) return { deleghe: [], anomalie: ["Il file usa il calendario di Excel per Mac «dal 1904»: le date verrebbero sbagliate di 4 anni. Va salvato di nuovo con le date normali."] };
  const fogli = {};
  for (const [nome, colonne] of [["F24", COLONNE_F24], ["Righe tributo", COLONNE_RIGHE], ["Verifica", COLONNE_VERIFICA]]) {
    const ws = wb.Sheets[nome];
    if (!ws) { anomalie.push(`Manca il foglio «${nome}».`); continue; }
    const grezze = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    const scritte = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null, blankrows: true });
    const intest = (grezze[0] || []).map(x => (x == null ? "" : String(x).trim()));
    const sbagliate = colonne.filter((c, i) => intest[i] !== c);
    if (sbagliate.length || intest.filter(Boolean).length !== colonne.length) {
      anomalie.push(`Foglio «${nome}»: le colonne non sono quelle previste, nell'ordine e con i nomi esatti (attese: ${colonne.join(" | ")}).`);
      continue;
    }
    fogli[nome] = grezze.slice(1).map((r, i) => ({ riga: i + 2, grezzo: r, scritto: scritte[i + 1] || [] }))
      .filter(x => x.grezzo.some(c => c != null && String(c).trim() !== ""));
  }
  if (anomalie.length) return { deleghe: [], anomalie };

  // foglio «F24»
  const deleghe = [];
  for (const { riga, grezzo, scritto } of fogli["F24"]) {
    const d = { riga, errori: [], segnalazioni: [], righe: [] };
    COLONNE_F24.forEach((col, i) => {
      const campo = CAMPI_F24[col];
      if (DATE.has(campo)) { const x = leggiData(grezzo[i]); if (x.errore) d.errori.push(`${col}: ${x.errore}.`); d[campo] = x.valore ?? null; }
      else if (IMPORTI.has(campo)) { const x = leggiImporto(grezzo[i]); if (x.errore) d.errori.push(`${col}: ${x.errore}.`); d[campo] = x.valore ?? 0; }
      else { const x = leggiTesto(grezzo[i], scritto[i]); if (x.errore) d.errori.push(`${col}: ${x.errore}.`); d[campo] = x.valore ?? null; }
    });
    deleghe.push(d);
  }
  const perCodice = new Map();
  for (const d of deleghe) { if (d.codice_delega && !perCodice.has(d.codice_delega)) perCodice.set(d.codice_delega, d); }

  // foglio «Righe tributo»
  for (const { riga, grezzo, scritto } of fogli["Righe tributo"]) {
    const codice = testo(grezzo[0]);
    const d = perCodice.get(codice);
    if (!d) { anomalie.push(`Righe tributo, riga ${riga}: il Codice delega «${codice ?? ""}» non è nel foglio «F24».`); continue; }
    const r = { riga, errori: [] };
    if (testo(scritto[1] ?? grezzo[1]) !== d.nome_file_pdf) d.errori.push(`Righe tributo, riga ${riga}: il Nome file PDF è diverso da quello del foglio «F24».`);
    COLONNE_RIGHE.slice(2).forEach((col, k) => {
      const i = k + 2, campo = CAMPI_RIGHE[col];
      if (IMPORTI.has(campo)) { const x = leggiImporto(grezzo[i]); if (x.errore) d.errori.push(`Righe tributo, riga ${riga}, ${col}: ${x.errore}.`); r[campo] = x.valore ?? 0; }
      else { const x = leggiTesto(grezzo[i], scritto[i]); if (x.errore) d.errori.push(`Righe tributo, riga ${riga}, ${col}: ${x.errore}.`); r[campo] = x.valore ?? null; }
    });
    if (r.codice_tributo) r.codice_tributo = r.codice_tributo.toUpperCase().replace(/\s+/g, "");
    d.righe.push(r);
  }

  // foglio «Verifica»
  const verificate = new Set();
  for (const { riga, grezzo, scritto } of fogli["Verifica"]) {
    const codice = testo(grezzo[0]);
    const d = perCodice.get(codice);
    if (!d) { anomalie.push(`Verifica, riga ${riga}: il Codice delega «${codice ?? ""}» non è nel foglio «F24».`); continue; }
    verificate.add(codice);
    d.corrisponde = testo(scritto[8] ?? grezzo[8]);
    d.codice_sconosciuto = testo(scritto[9] ?? grezzo[9]);
    d.avvisi_file = testo(scritto[10] ?? grezzo[10]);
    d.avvisi = d.avvisi_file; // nel database la colonna «avvisi» è quella del foglio «Verifica»
  }

  // controlli delega per delega: un errore ferma solo quella delega
  const visti = { codice: new Map(), nome: new Map(), protocollo: new Map() };
  for (const d of deleghe) {
    const spostato = /^Spostato in \d{4}$/.test(d.stato || "");
    d.spostato = spostato;
    if (!/^D-\d{8}-\d{4}-\d{3}$/.test(d.codice_delega || "")) d.errori.push(`Codice delega «${d.codice_delega ?? ""}» scritto in modo sbagliato (forma D-AAAAMMGG-hhmm-NNN).`);
    if (spostato) continue; // non si carica: è nel file dell'anno indicato
    for (const [chiave, valore] of [["codice", d.codice_delega], ["nome", d.nome_file_pdf], ["protocollo", d.protocollo_telematico]]) {
      if (!valore) continue;
      if (visti[chiave].has(valore)) { d.errori.push(`${chiave === "codice" ? "Codice delega" : chiave === "nome" ? "Nome file PDF" : "Protocollo telematico"} «${valore}» ripetuto (riga ${visti[chiave].get(valore)}).`); }
      else visti[chiave].set(valore, d.riga);
    }
    if (!d.nome_file_pdf || !/^F24_\d{4}-\d{2}-\d{2}_.+\.pdf$/.test(d.nome_file_pdf)) d.errori.push(`Nome file PDF «${d.nome_file_pdf ?? ""}» scritto in modo sbagliato (forma F24_AAAA-MM-GG_Oggetto.pdf).`);
    if (!d.oggetto) d.errori.push("Manca l'Oggetto.");
    if (!d.data_scadenza) d.errori.push("Manca la Data di scadenza.");
    else if (anno && d.data_scadenza.slice(0, 4) !== String(anno)) d.errori.push(`La Data di scadenza (${dataIt(d.data_scadenza)}) non è dell'anno del file (${anno}): ogni anno di scadenza ha il suo file di carico.`);
    if (!STATI_FILE.includes(d.stato)) d.errori.push(`Stato «${d.stato ?? ""}» non ammesso (Da pagare, Pagato, Sostituito, Spostato in AAAA).`);
    if (d.totale_debito < 0 || d.totale_credito < 0 || d.saldo < 0) d.errori.push("Importi negativi.");
    if (r2(d.totale_debito - d.totale_credito) !== r2(d.saldo)) d.errori.push(`Il Saldo (${euro(d.saldo)}) non è uguale al Totale a debito meno il Totale a credito (${euro(d.totale_debito - d.totale_credito)}).`);
    if (d.stato === "Pagato") {
      if (!d.data_pagamento) d.errori.push("«Pagato» senza la Data del pagamento.");
      if (!d.nome_file_quietanza && !d.nome_file_contabile) d.errori.push("«Pagato» senza quietanza e senza contabile della banca.");
    } else if (d.data_pagamento) d.errori.push(`Data del pagamento scritta su un F24 «${d.stato}».`);
    if (d.stato === "Sostituito" && !d.note) d.errori.push("«Sostituito» senza le Note che dicono da cosa è sostituito.");
    if (!d.righe.length) d.errori.push("Nessuna riga nel foglio «Righe tributo».");
    let deb = 0, cred = 0;
    for (const r of d.righe) {
      deb += r.importo_debito; cred += r.importo_credito;
      if (!SEZIONI.includes(r.sezione)) d.errori.push(`Righe tributo, riga ${r.riga}: Sezione «${r.sezione ?? ""}» non ammessa (${SEZIONI.join(", ")}).`);
      if (!r.codice_tributo) d.errori.push(`Righe tributo, riga ${r.riga}: manca il Codice tributo.`);
      if (!TRATTAMENTI.some(t => (r.trattamento || "").startsWith(t))) d.errori.push(`Righe tributo, riga ${r.riga}: Trattamento «${r.trattamento ?? ""}» non comincia con uno dei sette ammessi.`);
      if (r.importo_debito < 0 || r.importo_credito < 0) d.errori.push(`Righe tributo, riga ${r.riga}: importo negativo.`);
    }
    if (d.righe.length && (r2(deb) !== r2(d.totale_debito) || r2(cred) !== r2(d.totale_credito)))
      d.errori.push(`La somma delle righe (debiti ${euro(deb)}, crediti ${euro(cred)}) non è uguale ai totali (${euro(d.totale_debito)}, ${euro(d.totale_credito)}).`);
    if (!verificate.has(d.codice_delega)) d.errori.push("Manca la riga nel foglio «Verifica».");
    else if (!["SI", "DA CONFERMARE"].includes(d.corrisponde)) d.errori.push(`Verifica: «Corrisponde?» è «${d.corrisponde ?? ""}» (ammessi SI e DA CONFERMARE).`);
    else if (d.corrisponde === "DA CONFERMARE") d.segnalazioni.push("Letta da scansione: dati da confermare.");
    if (/PDF dell'F24 non ricevuto|PDF non archiviato/i.test(d.note || "")) d.senzaPdf = true;
  }
  return { deleghe, anomalie };
}

// ── Impronta delle righe: la stessa della funzione ci_f24_impronta_righe del database ───────────────
export function improntaRighe(righe) {
  const s = v => (vuoto(v) ? "" : String(v).trim());
  return (righe || []).map(r => [r.sezione, r.codice_tributo, r.codice_ente_sede, r.matricola_riferimento, r.rateazione_mese, r.anno_riferimento,
    r.periodo_dal, r.periodo_al].map(s).concat([Number(r.importo_debito || 0).toFixed(2), Number(r.importo_credito || 0).toFixed(2)]).join("|"))
    .sort().join("#");
}
// codici e periodi, senza importi: per riconoscere lo stesso versamento
const codiciPeriodi = righe => (righe || []).map(r => [r.sezione, r.codice_tributo, r.rateazione_mese, r.anno_riferimento, r.periodo_dal, r.periodo_al].map(x => x ?? "").join("|")).sort().join("#");

export const CAMPI_CONFRONTO = ["nome_file_pdf", "nome_file_ricevuto", "delega_nel_file_ricevuto", "oggetto", "data_scadenza", "totale_debito", "totale_credito",
  "saldo", "tipo_pagamento", "stato", "data_pagamento", "codice_banca_sportello", "banca_addebito", "protocollo_telematico", "nome_file_quietanza",
  "nome_file_contabile", "numero_operazione_banca", "note", "corrisponde", "avvisi"];
const NOMI_CAMPI = {
  nome_file_pdf: "Nome file PDF", nome_file_ricevuto: "Nome del file ricevuto", delega_nel_file_ricevuto: "Delega nel file ricevuto", oggetto: "Oggetto",
  data_scadenza: "Data di scadenza", totale_debito: "Totale a debito", totale_credito: "Totale a credito", saldo: "Saldo", tipo_pagamento: "Tipo di pagamento",
  stato: "Stato", data_pagamento: "Data del pagamento", codice_banca_sportello: "Codice banca e sportello", banca_addebito: "Banca di addebito",
  protocollo_telematico: "Protocollo telematico", nome_file_quietanza: "Nome file quietanza", nome_file_contabile: "Nome file contabile della banca",
  numero_operazione_banca: "Numero dell'operazione della banca", note: "Note", corrisponde: "Corrisponde?", avvisi: "Avvisi",
};
const norm = (campo, v) => (IMPORTI.has(campo) ? r2(v || 0) : vuoto(v) ? null : String(v).trim());
const mostra = v => (v == null ? "vuoto" : `«${v}»`);

// ── Confronto con il database ───────────────────────────────────────────────────────────────────────
// db: righe di ci_f24; dbRighe: righe di ci_f24_righe. Ogni delega del file riceve «esito» e, se non si può caricare, «blocco».
const nonEntra = d => d.spostato || d.esito === "BLOCCO" || d.esito === "Errore nel file";
// nomi dei file che sostituiscono, scritti nelle Note: «F24_2026-05-08_Contributi mensili dipendenti.pdf, _2, _3, _4» vale per quattro nomi
export function nomiNelleNote(note) {
  const nomi = [];
  const re = /(F24_\d{4}-\d{2}-\d{2}_[^,;()«»"]*?\.pdf)((?:\s*(?:,|\be\b)\s*_\d+\b)*)/g;
  let m;
  while ((m = re.exec(note || ""))) {
    nomi.push(m[1]);
    for (const n of (m[2] || "").match(/_\d+/g) || []) nomi.push(m[1].replace(/\.pdf$/, `${n}.pdf`));
  }
  return [...new Set(nomi)];
}

export function confrontaConDatabase(deleghe, db, dbRighe, anno) {
  const righePer = new Map();
  for (const r of dbRighe) { if (!righePer.has(r.f24_id)) righePer.set(r.f24_id, []); righePer.get(r.f24_id).push(r); }
  const perCodice = new Map(db.map(x => [x.codice_delega, x]));
  const codiciFile = new Set(deleghe.map(d => d.codice_delega));
  const blocca = (d, motivo) => { d.esito = "BLOCCO"; d.blocco = motivo; };

  // 1. deleghe già nel programma
  for (const d of deleghe) {
    if (d.spostato) { d.esito = d.stato; continue; }
    if (d.errori.length) { d.esito = "Errore nel file"; d.blocco = d.errori.join(" "); continue; }
    const x = perCodice.get(d.codice_delega);
    d.dbRiga = x || null;
    if (!x) continue;
    const xr = righePer.get(x.id) || [];
    const diversi = CAMPI_CONFRONTO.filter(c => norm(c, d[c]) !== norm(c, x[c]));
    const righeUguali = improntaRighe(d.righe) === improntaRighe(xr);
    d.diversi = diversi;
    if (!diversi.length && righeUguali) { d.esito = "Uguale"; continue; }
    const importi = !righeUguali || ["totale_debito", "totale_credito", "saldo"].some(c => diversi.includes(c));
    const dettaglio = c => `${NOMI_CAMPI[c]}: nel programma ${mostra(norm(c, x[c]))}, nel file ${mostra(norm(c, d[c]))}`;
    const db_ = x.stato, f = d.stato;
    const attesa = db_ === "Pagato" && !x.md5_pdf;
    const versioneCorretta = db_ === "Da pagare" && f === "Sostituito" && /_superato_/.test(d.nome_file_pdf || "");
    if (diversi.includes("nome_file_pdf") && !versioneCorretta && !attesa) {
      blocca(d, `Nome cambiato: nel programma «${x.nome_file_pdf}», nel file «${d.nome_file_pdf}». Il nome si cambia solo con il testo SQL preparato dal prompt di carico.`);
      continue;
    }
    if (db_ === "Da pagare") {
      if (f === "Da pagare") d.esito = "Aggiornata: correzione di un F24 da pagare";
      else if (f === "Pagato") importi ? blocca(d, "Pagato nel file con importi o righe diversi da quelli da pagare nel programma.") : (d.esito = "Quietanza o contabile arrivata");
      else if (f === "Sostituito") {
        if (importi) blocca(d, "«Sostituito» nel file con importi o righe diversi da quelli nel programma.");
        else d.esito = versioneCorretta ? "Versione corretta: la vecchia diventa «Sostituito»" : "Sostituita";
      }
    } else if (db_ === "Disposto") {
      const chiave = importi || ["nome_file_pdf", "oggetto", "data_scadenza"].some(c => diversi.includes(c));
      if (f === "Da pagare") chiave ? blocca(d, "«Disposto» nel programma: nome, oggetto, scadenza, importi o righe diversi nel file.") : (d.esito = "Disposto nel programma: resta «Disposto»");
      else if (f === "Pagato") chiave ? blocca(d, "«Disposto» nel programma e «Pagato» nel file con dati diversi.") : (d.esito = "Quietanza o contabile arrivata");
      else blocca(d, "«Disposto» nel programma e «Sostituito» nel file: serve la conferma del Dott. Bizzarri che l'ordine in banca è stato revocato.");
    } else if (db_ === "Pagato" || db_ === "Sostituito") {
      if (f !== db_) blocca(d, `«${db_}» nel programma e «${f}» nel file.`);
      else if (importi) blocca(d, `Importi o righe diversi su un F24 «${db_}».`);
      else {
        const vietati = diversi.filter(c => !(norm(c, x[c]) == null
          || c === "avvisi"
          || (c === "note" && (d.note || "").startsWith(x.note || ""))
          || (attesa && (c === "nome_file_pdf" || c === "data_scadenza"))));
        if (vietati.length) blocca(d, `F24 «${db_}»: ${vietati.map(dettaglio).join("; ")}.${vietati.includes("note") ? " Le Note si possono solo allungare." : ""}`);
        else d.esito = attesa && diversi.some(c => c === "nome_file_pdf" || c === "data_scadenza") ? "F24 arrivato dopo la quietanza" : "Completamento di un pagato";
      }
    } else blocca(d, `Stato «${db_}» nel programma non previsto.`);
  }

  // 2. deleghe nuove: i nomi liberati sono solo quelli delle versioni corrette che entrano davvero
  const nomeLiberatoDa = new Map(deleghe.filter(d => d.dbRiga && !nonEntra(d) && d.dbRiga.nome_file_pdf !== d.nome_file_pdf).map(d => [d.dbRiga.nome_file_pdf, d]));
  for (const d of deleghe) if (!d.spostato && !d.errori.length && !d.dbRiga) classificaNuova(d, db, righePer, nomeLiberatoDa, codiciFile);

  // 3. un «Sostituito» entra solo se entrano anche le deleghe che lo sostituiscono; altrimenti resta com'è e l'allarme rimane
  const perNome = new Map(deleghe.filter(d => !d.spostato).map(d => [d.nome_file_pdf, d]));
  const dbPerNome = new Map(db.map(x => [x.nome_file_pdf, x]));
  let cambiato = true;
  while (cambiato) {
    cambiato = false;
    for (const d of deleghe) {
      if (nonEntra(d) || d.stato !== "Sostituito" || d.dbRiga?.stato === "Sostituito") continue;
      let nomi, mancano;
      if (/_superato_/.test(d.nome_file_pdf || "")) {
        // versione corretta: la delega nuova ha il nome che era della vecchia (quello nel programma, oppure il nome senza «_superato_…»)
        nomi = [d.dbRiga ? d.dbRiga.nome_file_pdf : d.nome_file_pdf.replace(/_superato_[^/]*?\.pdf$/, ".pdf")];
        const nuova = perNome.get(nomi[0]);
        mancano = !nuova || nuova === d || nonEntra(nuova) ? nomi : [];
        d.sostitute = nuova && !nonEntra(nuova) ? [nuova.codice_delega] : [];
      } else {
        nomi = nomiNelleNote(d.note).filter(n => n !== d.nome_file_pdf);
        mancano = nomi.filter(n => { const f = perNome.get(n); if (f) return nonEntra(f); const x = dbPerNome.get(n); return !x || x.stato === "Sostituito"; });
        d.sostitute = nomi.map(n => perNome.get(n)).filter(f => f && !nonEntra(f)).map(f => f.codice_delega);
      }
      if (!nomi.length) { blocca(d, "«Sostituito» senza i nomi dei file che lo sostituiscono nelle Note: resta com'è nel programma."); cambiato = true; }
      else if (mancano.length) { blocca(d, `«Sostituito», ma non entrano le deleghe che lo sostituiscono (${mancano.join(", ")}): resta com'è nel programma.`); cambiato = true; }
    }
    // una delega nuova che prende il nome di una versione corretta bloccata non può entrare
    for (const d of deleghe) {
      if (nonEntra(d) || d.dbRiga) continue;
      const vecchia = dbPerNome.get(d.nome_file_pdf);
      if (vecchia && !(nomeLiberatoDa.get(d.nome_file_pdf) && !nonEntra(nomeLiberatoDa.get(d.nome_file_pdf)))) {
        blocca(d, `Il Nome file PDF è ancora usato nel programma dalla delega ${vecchia.codice_delega}, che in questo carico non cambia nome.`); cambiato = true;
      }
    }
  }

  // 4. possibile pagamento contato due volte: due «Pagato» con stessi codici, periodi e saldo, uno da contabile senza protocollo e uno da quietanza
  const daCaricare = deleghe.filter(d => !nonEntra(d));
  const pagati = [
    ...db.filter(x => x.stato === "Pagato" && !codiciFile.has(x.codice_delega)).map(x => ({ codice: x.codice_delega, chiave: `${codiciPeriodi(righePer.get(x.id))}@${r2(x.saldo)}`, contabile: !!x.nome_file_contabile && !x.protocollo_telematico, quietanza: !!x.protocollo_telematico })),
    ...daCaricare.filter(d => d.stato === "Pagato").map(d => ({ d, codice: d.codice_delega, chiave: `${codiciPeriodi(d.righe)}@${r2(d.saldo)}`, contabile: !!d.nome_file_contabile && !d.protocollo_telematico, quietanza: !!d.protocollo_telematico })),
  ];
  const gruppi = new Map();
  for (const p of pagati) { if (!gruppi.has(p.chiave)) gruppi.set(p.chiave, []); gruppi.get(p.chiave).push(p); }
  for (const g of gruppi.values()) {
    if (g.length > 1 && g.some(p => p.contabile) && g.some(p => p.quietanza)) {
      for (const p of g) if (p.d && p.d.esito !== "BLOCCO") blocca(p.d, `Possibile pagamento contato due volte: stessi codici, periodi e saldo di ${g.filter(q => q !== p).map(q => q.codice).join(", ")}.`);
    }
  }

  // nel programma ma non nel file (dello stesso anno di scadenza)
  const soloNelProgramma = db.filter(x => !codiciFile.has(x.codice_delega) && (x.data_scadenza || "").slice(0, 4) === String(anno))
    .map(x => ({ ...x, normale: x.origine === "manuale" }));
  return { soloNelProgramma };
}

function classificaNuova(d, db, righePer, nomeLiberatoDa, codiciFile) {
  const blocca = motivo => { d.esito = "BLOCCO"; d.blocco = motivo; };
  if (d.protocollo_telematico) {
    const p = db.find(x => x.protocollo_telematico === d.protocollo_telematico);
    if (p) return blocca(`Il protocollo telematico ${d.protocollo_telematico} è già nel programma, nella delega ${p.codice_delega}.`);
  }
  const n = db.find(x => x.nome_file_pdf === d.nome_file_pdf);
  if (n && !nomeLiberatoDa.has(d.nome_file_pdf)) return blocca(`Il Nome file PDF è già usato nel programma dalla delega ${n.codice_delega}.`);
  // possibile doppione di una delega inserita a mano (o con un altro Codice delega); non si confronta con gli F24 già sostituiti
  const cp = codiciPeriodi(d.righe);
  const simile = db.find(x => !codiciFile.has(x.codice_delega) && x.stato !== "Sostituito" && !nomeLiberatoDa.has(x.nome_file_pdf)
    && ((x.data_scadenza === d.data_scadenza && r2(x.saldo) === r2(d.saldo)) || codiciPeriodi(righePer.get(x.id)) === cp));
  if (simile) return blocca(`Possibile doppione della delega ${simile.codice_delega}${simile.origine === "manuale" ? " (inserita a mano)" : ""}: stessa scadenza e stesso saldo, oppure stessi codici e periodi. Dirlo subito a chi esegue i pagamenti.`);
  d.esito = "Nuova";
}

// ordine di carico: prima le versioni corrette (il nome vecchio si libera), poi le altre già nel programma, poi le nuove,
// per ultime le «Sostituite» da altre deleghe, che entrano solo se le loro sostitute sono entrate
export function ordineDiCarico(deleghe) {
  const ok = deleghe.filter(d => !nonEntra(d));
  const peso = d => (d.stato === "Sostituito" && d.dbRiga?.stato !== "Sostituito" ? (/_superato_/.test(d.nome_file_pdf || "") ? 0 : 3) : d.dbRiga ? 1 : 2);
  return [...ok].sort((a, b) => peso(a) - peso(b) || a.riga - b.riga);
}

// ── Cartella F24 scelta nel browser ─────────────────────────────────────────────────────────────────
// file: elenco dei file della cartella (input con webkitdirectory). REGOLA ZERO: si accetta solo la cartella «F24»
// che contiene «Carichi» con lo stesso file di carico del passo 1 («Da smistare» può essere vuota e il browser non la vede);
// i PDF si prendono solo dalle cartelle degli oggetti, mai da «Da smistare»,
// «Originali ricevuti» o «Carichi».
export function leggiCartella(file) {
  const mappa = new Map();
  const radici = new Set();
  for (const f of file) {
    const parti = (f.webkitRelativePath || f.name).split("/");
    radici.add(parti[0]);
    mappa.set(parti.slice(1).join("/"), f);
  }
  const errori = [];
  const radice = [...radici][0];
  if (radici.size !== 1 || radice !== "F24") errori.push(`È stata scelta la cartella «${[...radici].join(", ")}»: si può scegliere solo la cartella «F24» di Podere Verde nel cloud.`);
  const chiavi = [...mappa.keys()];
  if (!chiavi.some(k => k.startsWith("Carichi/"))) errori.push("Nella cartella scelta non c'è la sottocartella «Carichi».");
  return { mappa, errori, radice };
}
const VIETATE = ["Da smistare/", "Originali ricevuti/", "Carichi/"];
// percorso atteso di un PDF: «<Oggetto>/Anno AAAA/<nome>», e per i superati «<Oggetto>/Anno AAAA/Superati/<nome>»
export function trovaPdf(mappa, d, nome) {
  if (!nome) return { mancante: false };
  const anno = (d.data_scadenza || "").slice(0, 4);
  const percorsi = [`${d.oggetto}/Anno ${anno}/${nome}`, `${d.oggetto}/Anno ${anno}/Superati/${nome}`];
  for (const p of percorsi) {
    if (VIETATE.some(v => p.startsWith(v))) continue;
    if (mappa.has(p)) return { file: mappa.get(p), percorso: p };
  }
  return { mancante: true, percorso: percorsi[0] };
}

// ── Scadenze: oggi, giorni lavorativi, allarmi ───────────────────────────────────────────────────────
const piuUnGiorno = s => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) + 86400000).toISOString().slice(0, 10);
const lavorativo = (s, festivi) => { const g = new Date(`${s}T00:00:00Z`).getUTCDay(); return g !== 0 && g !== 6 && !festivi.has(s); };
// festivi di un anno, calcolati (come scritto nei prompt): servono se nel database manca quell'anno
export function festiviCalcolati(anno) {
  const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
  const pasquetta = new Date(Date.UTC(anno, mese - 1, giorno) + 86400000).toISOString().slice(0, 10);
  const fissi = ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26"].concat(anno >= 2026 ? ["10-04"] : []);
  return [...fissi.map(x => `${anno}-${x}`), pasquetta];
}
// i festivi del database, completati con quelli calcolati per gli anni che mancano
export function completaFestivi(festivi, anni) {
  const tutti = new Set(festivi), mancanti = [];
  for (const a of anni) if (![...festivi].some(x => x.startsWith(`${a}-`))) { mancanti.push(a); festiviCalcolati(a).forEach(x => tutti.add(x)); }
  return { festivi: tutti, mancanti };
}
// il giorno lavorativo numero n dopo «da»
export function giornoLavorativoDopo(da, n, festivi) {
  let s = da, k = 0;
  while (k < n) { s = piuUnGiorno(s); if (lavorativo(s, festivi)) k++; }
  return s;
}
// F24 «Da pagare» scaduti e in scadenza (da oggi al quinto giorno lavorativo dopo oggi); «Disposto» senza esito dopo 3 giorni lavorativi
export function allarmiScadenze(db, oggi, festivi) {
  const limite = giornoLavorativoDopo(oggi, 5, festivi);
  const daPagare = db.filter(x => x.stato === "Da pagare");
  const scaduti = daPagare.filter(x => x.data_scadenza < oggi).sort((a, b) => a.data_scadenza.localeCompare(b.data_scadenza));
  const inScadenza = daPagare.filter(x => x.data_scadenza >= oggi && x.data_scadenza <= limite).sort((a, b) => a.data_scadenza.localeCompare(b.data_scadenza));
  const disposti = db.filter(x => x.stato === "Disposto" && !x.nome_file_quietanza && !x.nome_file_contabile)
    .filter(x => giornoLavorativoDopo([x.data_disposizione, x.data_scadenza].filter(Boolean).sort().pop(), 3, festivi) <= oggi);
  return { scaduti, inScadenza, disposti, limite };
}
