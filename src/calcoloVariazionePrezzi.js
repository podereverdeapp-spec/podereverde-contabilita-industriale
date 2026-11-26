// Versione 240 — «Attenzione Variazione Prezzi» (richiesto dal Dott. Bizzarri il 9 ottobre 2026).
// Per ogni famiglia di prodotto (tabella ci_famiglie_prodotto) confronta il prezzo da una fattura d'acquisto
// all'altra, con un'unità metrica unica (€ al kg o al litro, mostrato a tonnellata, quintale, kg, litro),
// calcola quanto vale la variazione in un anno, la ordina per gravità e suggerisce cosa fare.
// Si ricalcola a ogni apertura con le fatture caricate. Sola lettura: nessuna scrittura nel database.
import { oggiRoma } from "./dateRoma";
import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";
import { RIFERIMENTI } from "./riferimentiEsterni";

export const UNITA = {
  tonnellata: { fattore: 1000, etichetta: "€ a tonnellata", breve: "t", base: "kg", decimali: 2 },
  quintale: { fattore: 100, etichetta: "€ a quintale", breve: "q", base: "kg", decimali: 2 },
  kg: { fattore: 1, etichetta: "€ al kg", breve: "kg", base: "kg", decimali: 4 },
  litro: { fattore: 1, etichetta: "€ al litro", breve: "litro", base: "litri", decimali: 3 },
  pezzo: { fattore: 1, etichetta: "€ al pezzo", breve: "pezzo", base: "pezzi", decimali: 2 },
  importo: { fattore: 1, etichetta: "€ a fattura", breve: "fattura", base: "fatture", decimali: 2 },
  mese: { fattore: 1, etichetta: "€ al mese", breve: "mese", base: "mesi", decimali: 2 },   // versione 409: servizi a canone
};
// unità scritte in fattura → kg (o litri) per unità, quando manca una regola di conversione
const UNITA_FATTURA = { tons: 1000, tonnellate: 1000, t: 1000, kilogrammi: 1, kg: 1, quintali: 100, q: 100, litri: 1, lt: 1, l: 1 };
export const SOGLIE = { anomaliaSopra: 2.5, anomaliaSotto: 0.4, gravitaAltaEuro: 1000, gravitaMediaEuro: 200, gravitaAltaPercento: 10, gravitaAltaSpesa: 5000, fornitorePiuCaro: 0.03, sopraMercato: 0.15, segnalaNuoveEuro: 300,
  // versione 407 (decisione del Dott. Bizzarri del 26/11/2026 ore 12:01): un prodotto entra nei rincari e nei ribassi solo con spesa in un anno da 1.000 €,
  // oppure con un aumento da 200 € l'anno, oppure con una fattura da 1.000 €
  ingressoSpesa: 1000, ingressoAumento: 200, ingressoFattura: 1000 };
// versione 407 (decisione delle 13:02): nelle famiglie miste ogni nome ha la sua media (Crusca e farinaccio, Fieno, Mais)
export const FAMIGLIE_MISTE = [7, 33, 6];
// centri di costo dei prodotti che si comprano a prezzo: le descrizioni nuove di questi centri vengono segnalate
export const CENTRI_PRODOTTO = ["Mangimi", "Foraggio", "Integratori alimentari", "Gasolio e lubrificanti", "Coltivazione Sementi", "Coltivazione Concimi e Fitosanitari", "Coltivazione Reti e Film", "Medicinali Veterinari", "Assicurazioni R.C.T.O. - E rischi", "Assicurazioni R.C.A."];

export const normalizza = d => String(d || "").replace(/\s+/g, " ").trim().toLowerCase();

// ════ Versione 409 (decisioni del Dott. Bizzarri del 26/11/2026, 10:23–12:20; giro approvato alle 14:12) ════
// Soglie nei Parametri (12:01): chiave del parametro → voce di SOGLIE. Se il parametro manca o non è un numero > 0 vale il valore scritto qui.
const SOGLIE_BASE = { ...SOGLIE };
export const PARAMETRI_SOGLIE = { prezzi_soglia_spesa: "ingressoSpesa", prezzi_soglia_aumento: "ingressoAumento", prezzi_soglia_fattura: "ingressoFattura",
  prezzi_gravita_alta_euro: "gravitaAltaEuro", prezzi_gravita_media_euro: "gravitaMediaEuro" };
export function applicaSoglie(parametri) {
  Object.assign(SOGLIE, SOGLIE_BASE);
  for (const [chiave, voce] of Object.entries(PARAMETRI_SOGLIE)) { const v = parseFloat(String((parametri || {})[chiave] ?? "").replace(",", ".")); if (Number.isFinite(v) && v > 0) SOGLIE[voce] = v; }
  return { ...SOGLIE };
}
// Pulizia del nome prima del confronto (10:23, 10:34, 11:09, 12:07). Le regole stanno qui; nella tabella ci_prezzi_regole_pulizia
// (pagina Parametri) c'è, per numero, se la regola è accesa. Ambito: «tutti», «merce» (centri dei prodotti), «gasolio», «servizi» (fuori dai centri dei prodotti).
export const REGOLE_PULIZIA = [
  { ordine: 1, nome: "Lotto e scadenza da «dato:», «Tipo dato:», «Riferimento testo:» in poi", ambito: "tutti", re: /\s*,?\s*(?:(?:tipo\s+)?dato|riferimento\s+testo)\s*:.*$/i },
  { ordine: 2, nome: "Accisa del gasolio («Importo accisa …» in poi)", ambito: "tutti", re: /\s*importo\s+accisa\b.*$/i },
  { ordine: 3, nome: "Luogo di scarico o di consegna («- scarico: via …» in poi)", ambito: "merce", re: /\s*[-–—]?\s*(?:(?:luogo|punto)\s+di\s+)?(?:scarico|consegna)\s*:.*$/i },
  { ordine: 4, nome: "Riferimento «— fatt. … (pagata da Muratella)»", ambito: "tutti", re: /\s*[—–-]+\s*fatt\..*\(pagata da muratella\)\s*$/i },
  { ordine: 5, nome: "Etichette del gestionale: «[…]», «( PROPRIETARIO )», «( AswArtFor )» e «( Codice … fornitore )» (restano le parole in mezzo)", ambito: "tutti",
    re: /\[[^\]]*\]|\(\s*codice\s+(?:art\.?\s+)?(.*?)\s*fornitore\s*\)|\(\s*(?:proprietario|aswartfor)\s*\)/gi, con: " $1 " },
  { ordine: 6, nome: "Da «Scadenza» in poi", ambito: "tutti", re: /\s*\bscadenza\b.*$/i },
  { ordine: 7, nome: "«lotto» con la sigla (solo nei centri di costo della merce)", ambito: "merce", re: /\s*\blotto\s+[a-z0-9/.-]+/gi },
  { ordine: 8, nome: "Gasolio: da «das» in poi", ambito: "gasolio", re: /\s*\bd\.?a\.?s\.?\b.*$/i },
  { ordine: 9, nome: "Servizi a canone: periodo, rata, «dal mese di … al mese di …», giorno e mese, anno (le misure restano)", ambito: "servizi",
    re: /\b(?:periodo|dal\s+mese\s+di|al\s+mese\s+di|e\s+rata\s+\d+|rata\s+\d+(?:\s+di\s+\d+)?|(?:\d{1,2}\s*)?(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)|(?:19|20)\d\d|(?:primo|secondo|terzo|quarto)\s+(?:semestre|trimestre|bimestre)|da(?=\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre))|a(?=\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)))\b/gi },
];
export function regoleAccese(righeDb) {
  if (!righeDb || !righeDb.length) return REGOLE_PULIZIA;
  const accese = new Map(righeDb.map(r => [Number(r.ordine), r.attiva !== false]));
  return REGOLE_PULIZIA.filter(r => accese.get(r.ordine) !== false);
}
// ambitoDi: null = descrizione senza centro (tabella delle famiglie): valgono le regole «tutti», «merce» e «gasolio»
export function pulisciNome(testo, centro, regole = REGOLE_PULIZIA) {
  const c = centro == null ? null : String(centro).trim();
  const merce = c == null || CENTRI_PRODOTTO.includes(c);
  let t = String(testo || "");
  for (const r of regole) {
    if (r.ambito === "merce" && !merce) continue;
    if (r.ambito === "gasolio" && !(c == null || c === "Gasolio e lubrificanti")) continue;
    if (r.ambito === "servizi" && merce) continue;
    t = t.replace(r.re, r.con || " ");
  }
  return normalizza(t.replace(/\s*[-–—,;:/]+\s*(?=$)/, "").replace(/(?:\s+[-–—]+)+\s+/g, " ").replace(/^[-–—\s]+/, "").replace(/\b(kg|lt|ml|gr|l)(\d)/gi, "$1 $2").replace(/(\d)(kg|lt|ml|gr)\b/gi, "$1 $2"));
}
// Righe «da ricevere» di Muratella con il riferimento alla fattura vera (10:55, 11:06): solo per l'analisi dei prezzi
const INIZIO_409 = "2026-11-26";
export const RIF_MURATELLA = /[—–-]+\s*fatt\.\s*(\S+)\s+del\s+(\d{2})\/(\d{2})\/(\d{4})\s+di\s+(.+?)\s*\(pagata da muratella\)\s*$/i;
export const nomeFornitoreSemplice = n => String(n || "").toLowerCase().replace(/\b(?:s\.?\s?r\.?\s?l\.?|s\.?\s?p\.?\s?a\.?|s\.?\s?a\.?\s?s\.?|s\.?\s?n\.?\s?c\.?|s\.?\s?c\.?\s?a\.?|unipersonale|semplificata|societa'?|società)\b/g, " ").replace(/[^a-z0-9]+/g, "");
// Sacchi e sfuso (25/11 18:27, 26/11 10:34): dal nome
export function confezione(testo) {
  const t = String(testo || "").toLowerCase();
  if (/\bsfus[oa]\b|\brinfus[ao]\b/.test(t)) return "sfuso";   // A.I.A. scrive «pel.rinfusa», «sbr.rinfusa»
  if (/\bsacc(?:o|hi)\b|\bkg\s?\.?\s?(?:20|25|30|40|50)\b(?![,.]\d)|\b(?:20|25|30|40|50)\s?kg\b/.test(t)) return "sacchi";
  return "";
}
// versione 409: per riconoscere la stessa prestazione a canone, ogni parola si accorcia a 6 lettere («prestazioni» = «prestazione»)
export const radice = p => String(p || "").split(" ").filter(Boolean).map(w => (/\d/.test(w) ? w : w.slice(0, 6))).join(" ");   // le misure restano intere
// versione 409: quanti mesi copre la fattura di un canone, letto dal testo (prima della pulizia): «da gennaio a giugno» = 6,
// «dal mese di gennaio al mese di febbraio» = 2, «15 ottobre - 15 novembre» = 1, «semestre» = 6, «trimestre» = 3, «anno» = 12. Se non si legge: null.
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export function mesiDelCanone(testo) {
  const t = String(testo || "").toLowerCase();
  const nomi = [...t.matchAll(new RegExp(`\\b(${MESI.join("|")})\\b`, "g"))].map(m => MESI.indexOf(m[1]));
  if (nomi.length >= 2) { const conGiorno = /\b\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b/.test(t);
    const n = ((nomi[1] - nomi[0] + 12) % 12) + (conGiorno ? 0 : 1); if (n >= 1 && n <= 12) return n; }
  if (/\bsemestr/.test(t)) return 6; if (/\btrimestr/.test(t)) return 3; if (/\bbimestr/.test(t)) return 2;
  if (/\brata\s+\d+\s+di\s+12\b/.test(t) || /\bmensil[ei]\b/.test(t) && !/\b1[34]/.test(t)) return 1;
  if (nomi.length === 1) return 1;
  return null;
}
// il nome pulito come si legge (maiuscole come in fattura), per i titoli delle schede
function pulisciTesto(testo, centro, regole) {
  const c = String(centro || "").trim(), merce = CENTRI_PRODOTTO.includes(c);
  let t = String(testo || "");
  for (const r of regole) {
    if (r.ambito === "merce" && !merce) continue;
    if (r.ambito === "gasolio" && c !== "Gasolio e lubrificanti") continue;
    if (r.ambito === "servizi" && merce) continue;
    t = t.replace(r.re, r.con || " ");
  }
  return t.replace(/(?:\s+[-–—]+)+\s+/g, " ").replace(/^[-–—\s]+|[-–—,;:/\s]+$/g, "").replace(/\s+/g, " ").trim();
}
// somma le righe della stessa fattura (versione 409: dopo la divisione per confezione)
function unisci(ng, x) {
  const y = ng.get(x.fatturaId);
  if (!y) { ng.set(x.fatturaId, { ...x, unitaFattura: new Set(x.unitaFattura), descrizioni: new Set(x.descrizioni) }); return; }
  y.base += x.base; y.totale += x.totale; y.quantita += x.quantita; x.unitaFattura.forEach(u => y.unitaFattura.add(u)); x.descrizioni.forEach(u => y.descrizioni.add(u));
}

// Versione 376 (ordine del Dott. Bizzarri del 13/11/2026 ore 09:11): regole «stesso fornitore e la descrizione comincia con».
// Servono per le descrizioni che cambiano da una fattura all'altra (accisa del gasolio, codici, date): una regola scritta
// una volta riconosce anche le descrizioni future. Vale solo se la descrizione non è già assegnata (o esclusa) una per una;
// se più regole valgono, vince quella con il testo più lungo.
export function famigliaDaRegola(regole, n, fornitoreId) {
  let migliore = null;
  for (const r of regole || []) {
    if (r.fornitore_id !== fornitoreId || !r.inizia_con || !n.startsWith(r.inizia_con)) continue;
    if (!migliore || r.inizia_con.length > migliore.inizia_con.length) migliore = r;
  }
  return migliore;
}
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const somma = l => l.reduce((s, x) => s + x, 0);
const GIORNO = 86400000;
const giorni = (a, b) => (new Date(String(b).slice(0, 10)) - new Date(String(a).slice(0, 10))) / GIORNO;
export const it = (n, d = 2) => {
  if (!(typeof n === "number" && Number.isFinite(n))) return "—";
  const [i, f] = Math.abs(n).toFixed(d).split(".");
  const negativo = n < 0 && Number(Math.abs(n).toFixed(d)) !== 0;
  return (negativo ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (f ? "," + f : "");
};
export const data = d => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}` : "—");
const mediana = l => { const v = [...l].sort((a, b) => a - b); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

async function tutte(tabella, colonne, ordine = "id") {
  const { data: righe, error } = await fetchAllPages((da, a) => supabase.from(tabella).select(colonne).order(ordine).range(da, a));
  if (error) throw new Error(`${tabella}: ${error.message}`);
  return righe || [];
}

export async function caricaDatiPrezzi() {
  let famiglie, descrizioni;
  try {
    [famiglie, descrizioni] = await Promise.all([
      tutte("ci_famiglie_prodotto", "id, nome, unita, prodotto_mercato, caratteristiche, note"),
      tutte("ci_famiglie_prodotto_descrizioni", "id, descrizione_norm, famiglia_id"),
    ]);
  } catch (e) {
    throw new Error(`Le tabelle delle famiglie di prodotto non si leggono (${e.message}). Va lanciato una volta il file contabilita_strutture_v240.sql nell'SQL Editor di Supabase.`);
  }
  const [articoli, fatture, fornitori, regole, mercato, parametri, regolePrefisso] = await Promise.all([
    tutte("ci_articoli_fattura", "id, fattura_id, descrizione, quantita, unita_misura, totale_riga, area, centro_costo"),
    tutte("ci_fatture", "id, data, tipo, numero, fornitore_id, regolarizzazione_di").catch(() => tutte("ci_fatture", "id, data, tipo, numero, fornitore_id")),
    tutte("ci_fornitori", "id, nome"),
    tutte("ci_regole_armonizzazione_unita", "id, fornitore_id, centro_costo, descrizione_prodotto, fattore_kg"),
    tutte("coltivazione_prezzi_mercato", "campagna, prodotto, prezzo_q, fonte", "campagna").catch(() => []),
    tutte("ci_parametri", "chiave, valore", "chiave").catch(() => []),
    tutte("ci_famiglie_prodotto_regole", "id, fornitore_id, inizia_con, famiglia_id").catch(() => []),   // versione 376
  ]);
  // versione 409: decisioni di «Da sistemare» e regole di pulizia accese (se le tabelle mancano: nessuna decisione, regole tutte accese)
  const [decisioni, regolePulizia] = await Promise.all([
    tutte("ci_prezzi_decisioni", "id, tipo, chiave, decisione, famiglia_id, fornitore_id, unita, nota, descrizioni_create, deciso_da, deciso_il, letto_dal_dottore_il, annullata_il").catch(() => null),
    tutte("ci_prezzi_regole_pulizia", "id, ordine, nome, attiva", "ordine").catch(() => null),
  ]);
  return { famiglie, descrizioni, articoli, fatture, fornitori, regole, mercato, regolePrefisso, parametri: Object.fromEntries(parametri.map(p => [p.chiave, p.valore])),
    decisioni: decisioni || [], regolePulizia: regolePulizia || [], manca409: decisioni === null };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
export function analisiPrezzi(d, oggi = oggiRoma()) {
  const soglie = applicaSoglie(d.parametri);   // versione 409
  const regoleP = regoleAccese(d.regolePulizia);
  const pul = (testo, centro) => pulisciNome(testo, centro, regoleP);
  const fam = new Map(d.famiglie.map(f => [f.id, f]));
  const mappa = new Map(d.descrizioni.map(x => [x.descrizione_norm, x]));
  // versione 409: le descrizioni delle famiglie si riconoscono anche dal nome pulito (se due descrizioni pulite uguali sono in famiglie diverse vince la prima)
  const mappaPulita = new Map();
  for (const x of d.descrizioni) { const p = pul(x.descrizione_norm, null); if (p && !mappaPulita.has(p)) mappaPulita.set(p, x); }
  for (const x of d.descrizioni) if (!mappaPulita.has(x.descrizione_norm)) mappaPulita.set(x.descrizione_norm, x);   // un nome già pulito salvato da una decisione
  const decisioni = (d.decisioni || []).filter(x => !x.annullata_il);
  const dec = new Map(decisioni.map(x => [`${x.tipo}|${x.chiave}`, x]));
  const fornPerNome = new Map(); for (const x of d.fornitori) { const k = nomeFornitoreSemplice(x.nome); if (k && !fornPerNome.has(k)) fornPerNome.set(k, x.id); }
  const daSistemare = [], muratellaIgnoti = new Map(), serviziCand = new Map(), prezziNomi = [];
  const righeRifViste = new Set(), vaBene = new Set(), senzaConf = new Map(), conSacchi = new Set(), conflitti = new Set();
  const fornNome = new Map(d.fornitori.map(f => [f.id, f.nome]));
  const daRicevereIds = new Set(d.fatture.filter(f => f.tipo === "DA_RICEVERE" && /^muratella\b/i.test(fornNome.get(f.fornitore_id) || "")).map(f => f.id));
  const passivePerNumero = new Set(d.fatture.filter(f => f.tipo === "PASSIVA").map(f => `${f.fornitore_id}|${String(f.numero || "").trim().toLowerCase()}`));
  const fat = new Map(d.fatture.map(f => [f.id, f]));
  const forn = new Map(d.fornitori.map(f => [f.id, f.nome]));
  const reg = new Map(d.regole.map(r => [`${r.fornitore_id}|${(r.centro_costo || "").trim()}|${String(r.descrizione_prodotto || "").trim().toLowerCase()}`, num(r.fattore_kg)]));
  const da12 = new Date(new Date(oggi) - 365 * GIORNO).toISOString().slice(0, 10);
  const da24 = new Date(new Date(oggi) - 730 * GIORNO).toISOString().slice(0, 10);
  const da36 = new Date(new Date(oggi) - 1096 * GIORNO).toISOString().slice(0, 10);   // versione 409: i canoni annuali si riconoscono su 3 anni
  // Versione 405 (decisioni del Dott. Bizzarri del 25/11/2026 ore 17:01–17:10): anno solare precedente intero.
  // Un prodotto la cui ultima fattura è più vecchia dell'anno solare precedente non si considera.
  const annoPrec = Number(String(oggi).slice(0, 4)) - 1;
  const daAnnoPrec = `${annoPrec}-01-01`, aAnnoPrec = `${annoPrec}-12-31`;

  // spesa totale delle fatture d'acquisto negli ultimi 12 mesi (senza i cespiti), per l'incidenza
  let spesaTotale12 = 0;
  const nuove = new Map(), senzaConversione = [];
  const perFamiglia = new Map(); // famiglia → Map(fattura → riga aggregata)
  // versione 376: fornitori di cui si seguono già dei prodotti: le loro descrizioni nuove si segnalano anche fuori dai CENTRI_PRODOTTO
  const seguiti = fornitoriSeguiti(d.articoli, d.descrizioni, d.famiglie, d.regolePrefisso, fat);
  const { via: stornate, dataOriginale } = righeStornateDate(d.articoli, fat);   // versione 407; 409: la riga rifatta prende la data della fattura stornata
  const gruppi = new Map();   // versione 407: chiave del gruppo → famiglia (per le famiglie miste, una per nome)
  for (const a of d.articoli) {
    const f0 = fat.get(a.fattura_id); if (!f0) continue;
    const tot = num(a.totale_riga); if (!(tot > 0)) continue;
    if (stornate.has(a.id)) continue;   // versione 407: riga stornata da una «storno della fattura n. …»
    // versione 409: righe «da ricevere» di Muratella con il riferimento alla fattura vera: data, numero e fornitore del riferimento
    let f = f0, descrSenzaRif = String(a.descrizione || "");
    // una fattura passiva collegata (regolarizzazione) a un documento «da ricevere» non si conta: le sue righe ci sono già nel documento
    if (f0.tipo === "PASSIVA" && f0.regolarizzazione_di && daRicevereIds.has(f0.regolarizzazione_di)) continue;
    const rifM = /^muratella\b/i.test(forn.get(f0.fornitore_id) || "") && (f0.tipo === "DA_RICEVERE" || f0.tipo === "PASSIVA") ? RIF_MURATELLA.exec(String(a.descrizione || "")) : null;
    if (f0.tipo === "DA_RICEVERE" && /^muratella\b/i.test(forn.get(f0.fornitore_id) || "") && !rifM) {
      // caso brutto 13: riferimento scritto male → resta al 31/12, fuori dal confronto, e si segnala
      if (!dec.has(`unita|rif|${a.id}`) && String(f0.data).slice(0, 10) >= da24) daSistemare.push({ tipo: "unita", chiave: `rif|${a.id}`, titolo: `Riga pagata da Muratella con il riferimento non leggibile: ${String(a.descrizione || "").slice(0, 80)}`, fornitori: "Muratella", spesa: tot,
        motivo: "Il riferimento alla fattura vera non si legge («— fatt. N del gg/mm/aaaa di FORNITORE (pagata da Muratella)»): la riga resta al 31/12 e fuori dal confronto dei prezzi. Correggere la descrizione nel documento «da ricevere».", prima: String(f0.data).slice(0, 10), vecchio: false });
      continue;
    }
    if (rifM) {
      const r = rifM; descrSenzaRif = String(a.descrizione || "").replace(RIF_MURATELLA, "").trim();
      const nomeRif = r[5].trim(), k = nomeFornitoreSemplice(nomeRif);
      let fid = fornPerNome.get(k);
      const dm = dec.get(`muratella|${k}`);
      if (dm && dm.fornitore_id) fid = dm.fornitore_id;
      else if (dm && dm.decisione === "nome_proprio") { fid = `x:${k}`; if (!forn.has(fid)) forn.set(fid, nomeRif); }   // fornitore che non è nell'anagrafica di Podere
      if (!fid) { const x = muratellaIgnoti.get(k) || { chiave: k, nome: nomeRif, righe: 0, spesa: 0, prima: `${r[4]}-${r[3]}-${r[2]}`, esempi: [], merce: false };
        x.righe++; x.spesa += tot; if (x.esempi.length < 3) x.esempi.push(a.descrizione); if (CENTRI_PRODOTTO.includes((a.centro_costo || "").trim())) x.merce = true;
        const dataRif = `${r[4]}-${r[3]}-${r[2]}`; if (dataRif < x.prima) x.prima = dataRif; muratellaIgnoti.set(k, x); continue; }
      // la stessa fattura vera è già fra le fatture d'acquisto di Podere: non si conta due volte
      if (passivePerNumero.has(`${fid}|${r[1].trim().toLowerCase()}`)) continue;
      // la stessa riga riaddebitata due volte (documento «da ricevere» e fattura di Muratella): si conta una volta
      const kr = `${fid}|${r[1].trim().toLowerCase()}|${normalizza(descrSenzaRif)}|${tot.toFixed(2)}`; if (righeRifViste.has(kr)) continue; righeRifViste.add(kr);
      f = { id: `m${f0.id}|${r[1]}|${fid}`, tipo: "PASSIVA", data: `${r[4]}-${r[3]}-${r[2]}`, numero: `${r[1]} (pagata da Muratella)`, fornitore_id: fid, muratella: true };
    } else if (f0.tipo !== "PASSIVA") continue;
    // versione 409: la regola di conversione si cerca con il fornitore vero e la descrizione senza il riferimento di Muratella,
    // e se non c'è con Muratella e la descrizione intera (come è scritta oggi nelle regole, es. Polimix fatt. 6767)
    const regDi = c => reg.get(`${f.fornitore_id}|${c}|${descrSenzaRif.trim().toLowerCase()}`) || (f.muratella ? reg.get(`${f0.fornitore_id}|${c}|${String(a.descrizione || "").trim().toLowerCase()}`) : undefined);
    const dt = dataOriginale.get(a.id) || String(f.data).slice(0, 10);
    const centro = (a.centro_costo || "").trim(), merce = CENTRI_PRODOTTO.includes(centro);
    if (dt >= da12 && (a.area || "").trim() !== "Ammortamenti") spesaTotale12 += tot;
    const n = normalizza(a.descrizione); if (!n) continue;
    const p = pul(a.descrizione, centro) || n;
    let m = mappa.get(n) || mappaPulita.get(p);
    if (!m) { const r = famigliaDaRegola(d.regolePrefisso, n, f.fornitore_id) || famigliaDaRegola(d.regolePrefisso, p, f.fornitore_id); if (r) m = { descrizione_norm: n, famiglia_id: r.famiglia_id, regola: r.id }; }
    let F = null;
    if (!m) {
      const dn = dec.get(`nome|${p}`) || dec.get(`nome|${n}`);   // caso brutto 14: la decisione salvata vince anche se le regole di pulizia cambiano
      const dn2 = p !== n ? dec.get(`nome|${n}`) : null;
      if (dn && dn2 && dn !== dn2 && (dn.decisione !== dn2.decisione || dn.unita !== dn2.unita) && !dec.has(`unita|conflitto|${p}`) && !conflitti.has(p)) {
        conflitti.add(p); daSistemare.push({ tipo: "unita", chiave: `conflitto|${p}`, titolo: `Due decisioni diverse ora valgono per lo stesso nome: ${p}`, spesa: tot, prima: dt, vecchio: false,
          motivo: `Con le regole di pulizia di adesso «${n}» diventa «${p}». Per «${p}» vale «${dn.decisione}», per «${n}» era stato deciso «${dn2.decisione}»: vale la prima. Se è sbagliato, il Dott. Bizzarri annulla una delle due nell'elenco delle decisioni.` });
      }
      if (dn && dn.decisione === "escluso") continue;
      if (dn && dn.decisione === "va_bene" && UNITA[dn.unita]) {
        // versione 409: «Va bene così, si confronta con sé stesso»: il nome pulito è un prodotto a sé
        F = { id: `n:${p}`, nome: String(a.descrizione || "").trim().length > 0 ? pulisciTesto(a.descrizione, centro, regoleP) : p, unita: dn.unita, nomeProprio: true };
        vaBene.add(p);
      } else if (!merce && !seguiti.has(f.fornitore_id)) {
        // versione 409: servizi fuori dai centri della merce: entrano solo se confermati «a canone» (12:07)
        const kc = `${f.fornitore_id}|${radice(p)}`, dc = dec.get(`canone|${kc}`);
        if (dc && dc.decisione === "si") F = { id: `c:${kc}`, nome: `${pulisciTesto(a.descrizione, centro, regoleP)} – ${forn.get(f.fornitore_id) || ""}`, unita: "mese", canone: true };
        else {
          if (!dc && dt >= da36 && (a.area || "").trim() !== "Ammortamenti" && !f.muratella) {
            const x = serviziCand.get(kc) || { chiave: kc, nome: pulisciTesto(a.descrizione, centro, regoleP), fornitore: forn.get(f.fornitore_id) || "", centro, fatture: new Map(), merce: false };
            x.fatture.set(f.id, { data: dt, numero: f.numero, totale: (x.fatture.get(f.id)?.totale || 0) + tot }); serviziCand.set(kc, x);
          }
          continue;
        }
      } else {
        if (dt >= da24 && (a.area || "").trim() !== "Ammortamenti") {
          const x = nuove.get(p) || { descrizione: p, testo: pulisciTesto(a.descrizione, centro, regoleP) || String(a.descrizione || "").trim(), esempio: String(a.descrizione || "").trim(), centro, spesa: 0, righe: 0, ultima: dt, prima: dt, fornitori: new Set(), fornitoriId: new Set(), fatture: [] };
          x.spesa += tot; x.righe++; if (dt > x.ultima) x.ultima = dt; if (dt < x.prima) x.prima = dt; x.fornitori.add(forn.get(f.fornitore_id) || ""); x.fornitoriId.add(f.fornitore_id); nuove.set(p, x);
          const u0 = UNITA_FATTURA[String(a.unita_misura || "").trim().toLowerCase()], r0 = regDi(centro), fat0 = r0 > 0 ? r0 : u0 > 0 ? u0 : 0;
          x.fatture.push({ data: dt, numero: f.numero, fornitore: forn.get(f.fornitore_id) || "", quantita: num(a.quantita), unita: a.unita_misura || "", totale: tot, prezzoBase: fat0 > 0 && num(a.quantita) > 0 ? tot / (num(a.quantita) * fat0) : null });
        }
        // per «possibile stesso prodotto»: prezzo al kg o al litro della riga
        const u = UNITA_FATTURA[String(a.unita_misura || "").trim().toLowerCase()];
        const r = regDi(centro);
        const fattore = r > 0 ? r : u > 0 ? u : 0;
        if (dt >= da24 && fattore > 0 && num(a.quantita) > 0) prezziNomi.push({ p, famiglia: null, fid: f.fornitore_id, centro, fattura: f.id, data: dt, prezzo: tot / (num(a.quantita) * fattore) });
        continue;
      }
    }
    if (!F) {
      if (!m.famiglia_id || !fam.has(m.famiglia_id)) continue; // esclusa dal confronto
      F = fam.get(m.famiglia_id);
    }
    const U = UNITA[F.unita] || UNITA.kg;
    // versione 409: riga pagata da Muratella senza quantità vera (quantità 1 e nessuna unità): il prezzo a unità non si calcola
    if (f.muratella && F.unita !== "importo" && !String(a.unita_misura || "").trim() && num(a.quantita) <= 1) {
      if (dt >= da24) senzaConversione.push({ famiglia: F.nome, data: dt, numero: f.numero, fornitore: forn.get(f.fornitore_id) || "", descrizione: a.descrizione, quantita: num(a.quantita), unita: "(riaddebito di Muratella senza quantità)", totale: tot });
      continue;
    }
    let base;
    if (F.unita === "mese") base = mesiDelCanone(a.descrizione) || -1;   // -1 = mesi da ricavare dalla fattura precedente (qui sotto, dopo il raggruppamento)
    else if (F.unita === "importo") base = 1;
    else if (F.unita === "pezzo") base = num(a.quantita);
    else {
      const r = regDi((a.centro_costo || "").trim());
      const u = UNITA_FATTURA[String(a.unita_misura || "").trim().toLowerCase()];
      const fattore = r > 0 ? r : u > 0 ? u : 0;
      base = num(a.quantita) * fattore;
    }
    if (!(base > 0) && base !== -1) {
      if (dt >= da24) senzaConversione.push({ famiglia: F.nome, data: dt, numero: f.numero, fornitore: forn.get(f.fornitore_id) || "", descrizione: a.descrizione, quantita: num(a.quantita), unita: a.unita_misura || "", totale: tot });
      continue;
    }
    // versione 407: nelle famiglie miste un gruppo per ogni nome; le spese di trasporto (a fattura) un gruppo per ogni fornitore,
    // perché il trasporto di un fornitore non si confronta con quello di un altro (ricontrollo del 26/11: Progeo 30 €, Faza 200 €)
    const trasporto = F.unita === "importo" && /^\s*spese di trasporto/i.test(F.nome);
    const chiave = FAMIGLIE_MISTE.includes(F.id) ? `${F.id}|${p}` : trasporto ? `${F.id}|f${f.fornitore_id}` : `${F.id}`;
    if (!gruppi.has(chiave)) gruppi.set(chiave, FAMIGLIE_MISTE.includes(F.id) ? { ...F, nome: `${F.nome} – ${pulisciTesto(a.descrizione, centro, regoleP)}`, mista: true }
      : trasporto ? { ...F, nome: `${F.nome} – ${forn.get(f.fornitore_id) || "fornitore sconosciuto"}` } : F);
    if (!perFamiglia.has(chiave)) perFamiglia.set(chiave, new Map());
    const g = perFamiglia.get(chiave);
    if (merce && dt >= da24 && F.unita !== "importo" && F.unita !== "pezzo") prezziNomi.push({ p, famiglia: typeof F.id === "number" ? F.id : null, fid: f.fornitore_id, centro, fattura: f.id, data: dt, prezzo: tot / base });
    // versione 409: sacchi e sfuso dal nome; se la persona ha indicato la confezione di un nome (caso brutto 7), vale quella
    const dconf = dec.get(`confezione|${chiave}|${p}`);
    const conf = dconf ? dconf.decisione : confezione(a.descrizione);
    if (conf === "sacchi" && dt >= da24) conSacchi.add(chiave);
    if (!conf && dt >= da24) { if (!senzaConf.has(chiave)) senzaConf.set(chiave, new Map()); const sc = senzaConf.get(chiave); const y = sc.get(p) || { p, testo: pulisciTesto(a.descrizione, centro, regoleP), spesa: 0, prima: dt }; y.spesa += tot; if (dt < y.prima) y.prima = dt; sc.set(p, y); }
    const k = `${f.id}|${conf}`;
    const x = g.get(k) || { fatturaId: f.id, data: dt, numero: f.numero, fornitore: forn.get(f.fornitore_id) || "fornitore sconosciuto", base: 0, totale: 0, quantita: 0, unitaFattura: new Set(), descrizioni: new Set(), conf, muratella: !!f.muratella };
    if (base === -1) { x.mesiDaRicavare = true; base = 0; } else if (F.unita === "mese") { x.base = Math.max(x.base, base); base = 0; }
    x.base += base; x.totale += tot; x.quantita += num(a.quantita); if (a.unita_misura) x.unitaFattura.add(a.unita_misura); x.descrizioni.add(a.descrizione);
    g.set(k, x);
    void U;
  }

  // versione 409: una famiglia comprata sia in sacchi sia sfusa si divide in due schede («… – sacchi», «… – sfuso»);
  // le fatture senza indicazione restano con lo sfuso. Altrimenti le righe della stessa fattura si sommano come prima.
  for (const [chiave, g] of [...perFamiglia]) {
    // versione 409: canoni, i mesi che il testo non dice si ricavano dai giorni dalla fattura precedente (30,4 giorni = un mese)
    if (gruppi.get(chiave).unita === "mese") {
      const l = [...g.values()].sort((a, b) => (a.data < b.data ? -1 : 1)), noti = l.filter(x => x.base > 0).map(x => x.base);
      l.forEach((x, i) => { if (x.base > 0) return; const gg = i > 0 ? giorni(l[i - 1].data, x.data) : null; x.base = gg ? Math.max(1, Math.round(gg / 30.4)) : (mediana(noti) || 1); });
    }
    const conf = new Set([...g.values()].map(x => x.conf));
    const F = gruppi.get(chiave);
    if (conf.has("sacchi") && conf.has("sfuso")) {
      perFamiglia.delete(chiave);
      for (const tipo of ["sacchi", "sfuso"]) {
        const nk = `${chiave}|${tipo}`, ng = new Map();
        for (const x of g.values()) if ((x.conf === "sacchi") === (tipo === "sacchi")) unisci(ng, x);
        if (ng.size) { perFamiglia.set(nk, ng); gruppi.set(nk, { ...F, nome: `${F.nome} – ${tipo}`, confezione: tipo, chiaveFamiglia: chiave }); }
      }
    } else {
      const ng = new Map(); for (const x of g.values()) unisci(ng, x); perFamiglia.set(chiave, ng);
    }
  }
  const anomale = [], schede = [];
  for (const [chiave, g] of perFamiglia) {
    const F = gruppi.get(chiave), U = UNITA[F.unita] || UNITA.kg;
    const tutteF = [...g.values()].map(x => ({ ...x, prezzoBase: x.totale / x.base, prezzo: x.totale / x.base * U.fattore, unitaFattura: [...x.unitaFattura].join(", "), descrizioni: [...x.descrizioni] }))
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.fatturaId - b.fatturaId));
    // righe anomale: prezzo lontano dalla mediana delle altre fatture della famiglia (stesso periodo, ± 1 anno)
    const valide = [];
    for (const x of tutteF) {
      if (F.unita === "importo") { valide.push(x); continue; }
      let vicini = tutteF.filter(y => y !== x && Math.abs(giorni(x.data, y.data)) <= 365).map(y => y.prezzoBase);
      if (vicini.length < 3) vicini = tutteF.filter(y => y !== x).map(y => y.prezzoBase);
      // versione 409: le righe pagate da Muratella (quantità a volte scritte male nel riaddebito) si controllano già con 2 fatture di confronto
      const med = vicini.length >= (x.muratella ? 2 : 3) ? mediana(vicini) : null;
      const rapporto = med ? x.prezzoBase / med : 1;
      if (rapporto > SOGLIE.anomaliaSopra || rapporto < SOGLIE.anomaliaSotto) {
        if (x.data >= da24) anomale.push({ famiglia: F.nome, ...x, mediana: med * U.fattore, rapporto, unita: U.etichetta,
          motivo: `prezzo ${it(x.prezzo, U.decimali)} ${U.etichetta}, ${it(rapporto, 1)} volte la mediana delle altre fatture (${it(med * U.fattore, U.decimali)}): probabilmente la quantità o l'unità della riga è sbagliata` });
        continue;
      }
      valide.push(x);
    }
    if (!valide.length) continue;
    const ultimo = valide[valide.length - 1];
    const stessoForn = valide.filter(x => x.fornitore === ultimo.fornitore && x !== ultimo);
    const precedente = stessoForn.length ? stessoForn[stessoForn.length - 1] : valide.length > 1 ? valide[valide.length - 2] : null;
    const cambioFornitore = !!precedente && precedente.fornitore !== ultimo.fornitore;
    const ult12 = valide.filter(x => x.data >= da12);
    const base12 = somma(ult12.map(x => x.base)), spesa12 = somma(ult12.map(x => x.totale));
    let deltaBase = precedente ? ultimo.prezzoBase - precedente.prezzoBase : 0;
    let variazione = precedente && precedente.prezzoBase > 0 ? (ultimo.prezzoBase / precedente.prezzoBase - 1) * 100 : null;
    // sotto lo 0,05% è solo arrotondamento dei centesimi in fattura: prezzo invariato
    if (variazione !== null && Math.abs(variazione) < 0.05) { variazione = 0; deltaBase = 0; }
    // Versione 405: spesa dell'anno solare precedente intero, accanto a quella degli ultimi 12 mesi
    const annoPrecF = valide.filter(x => x.data >= daAnnoPrec && x.data <= aAnnoPrec);
    const spesaAnnoPrec = somma(annoPrecF.map(x => x.totale));
    // Versione 405: se l'ultima fattura è fuori dagli ultimi 12 mesi, il rincaro è quello dell'anno passato: resta finché
    // non arriva la fattura nuova, con la scritta «incremento dell'anno passato» (o «ribasso»).
    // «comprato più volte»: almeno due fatture negli ultimi 12 mesi, oppure almeno due nell'anno solare precedente
    // (ricontrollo del 25/11: Mangime pollame, Sprint 60). Quantità: quella degli ultimi 12 mesi; se lì c'è una sola
    // fattura (o nessuna), quella dell'anno solare precedente.
    const piuVolte = ult12.length >= 2 || annoPrecF.length >= 2;
    const baseAnnoPrec = somma(annoPrecF.map(x => x.base));
    const quantitaAnno = ult12.length >= 2 ? (F.unita === "importo" ? ult12.length : base12)
      : annoPrecF.length >= 2 ? (F.unita === "importo" ? annoPrecF.length : baseAnnoPrec)
      : (F.unita === "importo" ? 1 : ultimo.base);
    const annoPassato = !!precedente && ultimo.data < da12;
    const attivo = ultimo.data >= daAnnoPrec;
    // «aumento recente»: l'ultima fattura contro la precedente (la regola di prima, versione 405)
    const impattoRecente = precedente && attivo ? deltaBase * quantitaAnno : 0;
    // Versione 407 (decisioni del Dott. Bizzarri del 26/11/2026 ore 12:33 e 12:49): prezzo medio pesato sulle quantità degli
    // ultimi 12 mesi contro quello dei 12 mesi prima. Decide euro in un anno, gravità e ordine; accanto resta l'ultima fattura
    // contro la precedente. Se sull'anno non c'è aumento ma sull'ultima fattura sì, il prodotto entra come «aumento recente»
    // con gli euro calcolati come prima. Senza acquisti in uno dei due periodi resta la regola della versione 405.
    const prima12 = valide.filter(x => x.data >= da24 && x.data < da12);
    const media = l => { const b = somma(l.map(x => x.base)); return b > 0 ? somma(l.map(x => x.totale)) / b : null; };
    const media12 = ult12.length && prima12.length ? media(ult12) : null, mediaPrima = ult12.length && prima12.length ? media(prima12) : null;
    let variazioneMedia = media12 !== null && mediaPrima > 0 ? (media12 / mediaPrima - 1) * 100 : null;
    let deltaMedia = media12 !== null ? media12 - mediaPrima : 0;
    if (variazioneMedia !== null && Math.abs(variazioneMedia) < 0.05) { variazioneMedia = 0; deltaMedia = 0; }
    const quantita12 = F.unita === "importo" ? ult12.length : base12;
    const impattoMedia = media12 !== null && attivo ? deltaMedia * quantita12 : 0;
    // versione 407 (giro approvato, caso brutto 2): acquisti negli ultimi 12 mesi ma nessuno nei 12 mesi prima → «prodotto nuovo», senza rincaro
    const prodottoNuovo = ult12.length > 0 && prima12.length === 0;
    const conMedia = media12 !== null;
    // versione 407 (secondo ricontrollo): anche un prodotto nuovo con un aumento fra le sue fatture degli ultimi 12 mesi è un «aumento recente»,
    // così la pagina e il pagamento dicono la stessa cosa (caso vero: NDP 3.1, fattura V2-260050227 a 400 €/t contro 390)
    const aumentoRecente = (conMedia && !(impattoMedia > 0) && impattoRecente > 0) || (prodottoNuovo && impattoRecente > 0);
    const impatto = !conMedia ? impattoRecente : aumentoRecente ? impattoRecente : impattoMedia;
    const variazioneUsata = !conMedia || aumentoRecente ? variazione : variazioneMedia;
    // i due confronti dicono cose opposte (es. fieno: +14,4% sull'anno, −10,7% all'ultima fattura)
    const discordanti = conMedia && variazione !== null && ((variazioneMedia > 0 && variazione < 0) || (variazioneMedia < 0 && variazione > 0));
    // Versione 407 (decisione delle 12:01): soglie di ingresso
    const fatturaGrande = valide.some(x => x.data >= daAnnoPrec && x.totale >= SOGLIE.ingressoFattura);
    const sottoSoglia = Math.max(spesa12, spesaAnnoPrec) < SOGLIE.ingressoSpesa && Math.abs(impatto) < SOGLIE.ingressoAumento && !fatturaGrande;
    // tendenza: ultime tre fatture dello stesso fornitore in salita
    const serieForn = valide.filter(x => x.fornitore === ultimo.fornitore).slice(-3);
    const inSalita = serieForn.length === 3 && serieForn[0].prezzoBase < serieForn[1].prezzoBase && serieForn[1].prezzoBase < serieForn[2].prezzoBase;
    // fornitori degli ultimi 12 mesi (o 24 se nei 12 ce n'è uno solo)
    const finestra = new Set(ult12.map(x => x.fornitore)).size > 1 ? ult12 : valide.filter(x => x.data >= da24);
    const fornitori = [...new Set(finestra.map(x => x.fornitore))].map(nome => {
      const l = finestra.filter(x => x.fornitore === nome);
      return { nome, prezzo: somma(l.map(x => x.totale)) / somma(l.map(x => x.base)) * U.fattore, fatture: l.length, ultima: l[l.length - 1].data, ultimoPrezzo: l[l.length - 1].prezzo,
        descrizioni: [...new Set(l.flatMap(x => x.descrizioni))] };
    }).sort((a, b) => a.prezzo - b.prezzo);
    const piuEconomico = fornitori[0];
    const risparmioFornitore = piuEconomico && piuEconomico.nome !== ultimo.fornitore && F.unita !== "importo" && piuEconomico.prezzo < ultimo.prezzo * (1 - SOGLIE.fornitorePiuCaro)
      ? (ultimo.prezzo - piuEconomico.prezzo) / U.fattore * base12 : 0;
    // prezzo di mercato di confronto
    const mercato = prezzoMercato(d, F, U);
    const sopraMercato = mercato && mercato.prezzoMax > 0 ? ultimo.prezzo / mercato.prezzoMax - 1 : null;
    const risparmioMercato = mercato && sopraMercato > SOGLIE.sopraMercato && F.unita !== "importo" ? (ultimo.prezzo - mercato.prezzoMax) / U.fattore * base12 : 0;
    // trasporto fatturato a parte dallo stesso fornitore negli ultimi 12 mesi
    const trasporto = trasportoFornitore(perFamiglia, gruppi, ultimo.fornitore, da12);
    const incidenza = spesaTotale12 > 0 ? spesa12 / spesaTotale12 * 100 : 0;
    const gravita = impatto >= SOGLIE.gravitaAltaEuro || (impatto > 0 && variazioneUsata >= SOGLIE.gravitaAltaPercento && spesa12 >= SOGLIE.gravitaAltaSpesa) ? "alta"
      : impatto >= SOGLIE.gravitaMediaEuro ? "media" : impatto > 0 ? "bassa" : null;
    // versione 407 (giro approvato, caso brutto 7): fornitori diversi nei due periodi → l'aumento può venire dal cambio di fornitore
    const mediaForn = (l, nome) => { const m = media(l.filter(x => x.fornitore === nome)); return m !== null ? m * U.fattore : null; };
    const fornPrima = [...new Set(prima12.map(x => x.fornitore))], forn12 = [...new Set(ult12.map(x => x.fornitore))];
    const cambioFornitoriPeriodo = conMedia && (fornPrima.some(x => !forn12.includes(x)) || forn12.some(x => !fornPrima.includes(x)));
    const medieFornitori = conMedia ? [...new Set([...fornPrima, ...forn12])].map(nome => ({ nome, prima: mediaForn(prima12, nome), ora: mediaForn(ult12, nome) })) : [];
    // versione 407 (passo 3 del giro): per i prodotti venduti a pezzi con un peso fisso (es. rotoballa da 340 kg) anche il prezzo a pezzo
    const righePeriodi = [...prima12, ...ult12];
    const kgPezzo = righePeriodi.length && righePeriodi.every(x => x.quantita > 0) ? righePeriodi[0].base / righePeriodi[0].quantita : null;
    const aPezzi = kgPezzo && ![1, 100, 1000].includes(Math.round(kgPezzo * 1000) / 1000) && righePeriodi.every(x => Math.abs(x.base / x.quantita - kgPezzo) < 1e-6);
    const mediaPezzo = l => { const q = somma(l.map(x => x.quantita)); return q > 0 ? somma(l.map(x => x.totale)) / q : null; };
    const s = { famiglia: F, unita: U, fatture: valide, ultimo, precedente, cambioFornitore, variazione, delta: deltaBase * U.fattore, impatto, base12, spesa12, n12: ult12.length,
      incidenza, inSalita, fornitori, piuEconomico, risparmioFornitore, mercato, sopraMercato, risparmioMercato, trasporto, gravita, attivo,
      piuVolte, annoPassato, spesaAnnoPrec, annoPrec, finoAl: Number(String(ultimo.data).slice(0, 4)) + 2,
      // versione 407
      chiave, conMedia, media12: media12 !== null ? media12 * U.fattore : null, mediaPrima: mediaPrima !== null ? mediaPrima * U.fattore : null,
      variazioneMedia, quantita12, n12Prima: prima12.length, basePrima: somma(prima12.map(x => x.base)), spesaPrima: somma(prima12.map(x => x.totale)),
      impattoMedia, impattoRecente, aumentoRecente, discordanti, variazioneUsata, sottoSoglia, da24, prodottoNuovo, cambioFornitoriPeriodo, medieFornitori,
      pezzo: aPezzi ? { kg: kgPezzo, prima: mediaPezzo(prima12), ora: mediaPezzo(ult12), quantita12: somma(ult12.map(x => x.quantita)), quantitaPrima: somma(prima12.map(x => x.quantita)) } : null };
    const farina = /farina/i.test(F.nome) && mercato && /granella/i.test(mercato.nome);
    s.voci = [
      ...(risparmioFornitore > 0 ? [{ euro: risparmioFornitore, testo: `prezzo di ${piuEconomico.nome}` }] : []),
      ...(risparmioMercato > 0 ? [{ euro: risparmioMercato, testo: farina ? "differenza con il prezzo della granella: è il costo di macinatura e consegna" : mercato.consiglio ? `${mercato.nome} (da verificare)` : `prezzo di mercato (${mercato.nome})` }] : []),
    ];
    s.consigli = consigli(s, d);
    s.testoRicerca = testoRicerca(s, d);
    schede.push(s);
  }
  // versione 409: sacchi e sfuso, la differenza fra le due medie degli ultimi 12 mesi (o fra le ultime fatture)
  for (const s of schede) {
    if (!s.famiglia.confezione) continue;
    const altra = schede.find(x => x !== s && x.famiglia.chiaveFamiglia === s.famiglia.chiaveFamiglia && x.famiglia.confezione && x.famiglia.confezione !== s.famiglia.confezione);
    if (!altra) continue;
    const pa = s.media12 ?? s.ultimo.prezzo, pb = altra.media12 ?? altra.ultimo.prezzo;
    s.altraConfezione = { tipo: altra.famiglia.confezione, prezzo: pb, differenza: pa - pb, percento: pb > 0 ? (pa / pb - 1) * 100 : null, suMedia: s.media12 != null && altra.media12 != null };
  }

  // ════ versione 409: «Da sistemare» ════
  // «da più di 30 giorni» in «Da sistemare»: le cose che c'erano già prima della versione 409 contano dal giorno della versione (26/11/2026)
  const giorni30r = new Date(new Date(oggi) - 30 * GIORNO).toISOString().slice(0, 10), giorni30 = INIZIO_409 >= giorni30r ? "0000-00-00" : giorni30r;
  // 1) nomi nuovi che pesano (dalla soglia delle descrizioni nuove)
  for (const x of nuove.values()) {
    if (x.spesa < soglie.segnalaNuoveEuro || dec.has(`nome|${x.descrizione}`)) continue;
    daSistemare.push({ tipo: "nome", chiave: x.descrizione, titolo: x.testo, esempio: x.esempio, centro: x.centro, fornitori: [...x.fornitori].join(", "), fornitoriId: [...x.fornitoriId], spesa: x.spesa, righe: x.righe, prima: x.prima, ultima: x.ultima, vecchio: x.prima < giorni30,
      fatture: x.fatture.slice().sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 8), prezzoBase: (x.fatture.filter(y => y.prezzoBase).sort((a, b) => (a.data < b.data ? 1 : -1))[0] || {}).prezzoBase || null });
  }
  // 2) fornitori del riferimento di Muratella non riconosciuti
  // (solo i fornitori con righe di merce: per i ricambi e i lavori la decisione non cambierebbe niente)
  for (const x of muratellaIgnoti.values()) if (x.merce) daSistemare.push({ tipo: "muratella", chiave: x.chiave, titolo: x.nome, spesa: x.spesa, righe: x.righe, prima: x.prima, esempi: x.esempi, vecchio: x.prima < giorni30 });
  // 3) servizi che sembrano a canone: stesso nome pulito e stesso fornitore, almeno 3 fatture in 24 mesi, cadenza e importo regolari
  for (const x of serviziCand.values()) {
    // (l'importo non conta: un canone che aumenta deve restare proposto; vale la cadenza, da mensile ad annuale)
    const l = [...x.fatture.values()].sort((a, b) => (a.data < b.data ? -1 : 1));
    if (somma(l.map(y => y.totale)) < soglie.segnalaNuoveEuro) continue;
    const gap = l.slice(1).map((y, i) => giorni(l[i].data, y.data)), mg = mediana(gap), mi = mediana(l.map(y => y.totale));
    if (l.length < 2 || (l.length === 2 && !(mg >= 300 && mg <= 430)) || !(mg >= 20 && mg <= 430)) continue;
    const okGap = gap.filter(g => Math.abs(g - mg) <= mg * 0.45).length / gap.length;
    if (okGap < 0.6) continue;   // (2 intervalli su 3 bastano: un canone semestrale che diventa annuale resta un canone)
    daSistemare.push({ tipo: "canone", chiave: x.chiave, titolo: x.nome, fornitori: x.fornitore, centro: x.centro, spesa: somma(l.map(y => y.totale)), righe: l.length, prima: l[0].data, ultima: l[l.length - 1].data,
      cadenza: Math.round(mg), importo: mi, fatture: l.slice(-6).reverse(), vecchio: l[0].data < giorni30 });
  }
  // 4) possibile stesso prodotto (10:39): stesso fornitore e centro, prezzi entro il 2% a non più di 60 giorni, mai nella stessa fattura;
  //    almeno uno dei due nomi senza famiglia, e i due non nella stessa famiglia
  const perNome = new Map();
  for (const y of prezziNomi) { const k = `${y.fid}|${y.centro}|${y.p}`; if (!perNome.has(k)) perNome.set(k, { p: y.p, fid: y.fid, centro: y.centro, famiglia: y.famiglia, righe: [] }); perNome.get(k).righe.push(y); }
  const nomiL = [...perNome.values()];
  for (let i = 0; i < nomiL.length; i++) for (let j = i + 1; j < nomiL.length; j++) {
    const A = nomiL[i], B = nomiL[j];
    if (A.fid !== B.fid || A.centro !== B.centro || A.p === B.p) continue;
    if (A.famiglia != null && B.famiglia != null) continue;
    // almeno uno dei due senza famiglia: nome nuovo oppure deciso «Va bene così» (caso brutto 2: i nomi simili si ripropongono)
    if (!nuove.has(A.p) && !nuove.has(B.p) && !vaBene.has(A.p) && !vaBene.has(B.p)) continue;
    const fa = new Set(A.righe.map(y => y.fattura)); if (B.righe.some(y => fa.has(y.fattura))) continue;
    const vicino = A.righe.some(y => B.righe.some(z => Math.abs(giorni(y.data, z.data)) <= 60 && Math.abs(y.prezzo / z.prezzo - 1) <= 0.02));
    if (!vicino) continue;
    const chiave = [A.p, B.p].sort().join(" || ");
    if (dec.has(`stesso|${chiave}`)) continue;
    const ultimo = l => l.righe.slice().sort((a, b) => (a.data < b.data ? 1 : -1))[0];
    daSistemare.push({ tipo: "stesso", chiave, titolo: `${A.p}  ↔  ${B.p}`, nomi: [A.p, B.p], famiglie: [A.famiglia, B.famiglia], fornitori: forn.get(A.fid) || "", centro: A.centro,
      prezzi: [ultimo(A), ultimo(B)].map(y => ({ data: y.data, prezzo: y.prezzo })), spesa: 0, vecchio: false });
  }
  // 4b) caso brutto 7: in una famiglia comprata sia in sacchi sia sfusa, un nome che non dice la confezione → domanda
  for (const [chiave, sc] of senzaConf) {
    const F = gruppi.get(`${chiave}|sfuso`) || gruppi.get(`${chiave}|sacchi`) || (conSacchi.has(chiave) ? gruppi.get(chiave) : null); if (!F) continue;
    for (const y of sc.values()) { const k = `${chiave}|${y.p}`; if (dec.has(`confezione|${k}`)) continue;
      daSistemare.push({ tipo: "confezione", chiave: k, titolo: `${F.nome.replace(/ – (sacchi|sfuso)$/, "")}: ${y.testo}`, spesa: y.spesa, prima: y.prima, vecchio: y.prima < giorni30,
        motivo: gruppi.has(`${chiave}|sfuso`) ? "La famiglia si compra sia in sacchi sia sfusa, ma questo nome non lo dice: oggi conta con lo sfuso." : "La famiglia ha righe in sacchi negli ultimi 24 mesi e questo nome non dice la confezione: oggi si confronta insieme ai sacchi." }); }
  }
  // 5) unità da controllare (righe fuori misura degli ultimi 24 mesi)
  for (const a of anomale) {
    const chiave = `${a.fatturaId}|${a.famiglia}`; if (dec.has(`unita|${chiave}`)) continue;
    daSistemare.push({ tipo: "unita", chiave, titolo: `${a.famiglia}: fattura ${a.numero} del ${data(a.data)}`, fornitori: a.fornitore, spesa: a.totale, motivo: a.motivo, prima: a.data, vecchio: a.data < giorni30 });
  }
  daSistemare.sort((a, b) => (b.spesa || 0) - (a.spesa || 0));
  const attive = schede.filter(s => s.attivo);
  // versione 407: rincari e ribassi solo sopra le soglie di ingresso
  const rincari = attive.filter(s => s.impatto > 0 && !s.sottoSoglia).sort((a, b) => b.impatto - a.impatto);
  const opportunita = attive.filter(s => Math.max(s.risparmioFornitore, s.risparmioMercato) > 50).sort((a, b) => Math.max(b.risparmioFornitore, b.risparmioMercato) - Math.max(a.risparmioFornitore, a.risparmioMercato));
  const ribassi = attive.filter(s => s.impatto < 0 && !s.sottoSoglia).sort((a, b) => a.impatto - b.impatto);
  const sottoSoglia = attive.filter(s => s.impatto !== 0 && s.sottoSoglia).sort((a, b) => b.impatto - a.impatto);
  const prodottiNuovi = attive.filter(s => s.prodottoNuovo && !(s.impatto > 0) && !(s.impatto < 0)).sort((a, b) => b.spesa12 - a.spesa12);   // versione 407
  const altre = attive.filter(s => !(s.impatto > 0) && !(s.impatto < 0) && !s.prodottoNuovo).sort((a, b) => b.spesa12 - a.spesa12 || (a.ultimo.data < b.ultimo.data ? 1 : -1));
  const nuoveL = [...nuove.values()].map(x => ({ ...x, fornitori: [...x.fornitori].join(", ") })).sort((a, b) => b.spesa - a.spesa);
  return {
    oggi, da12, da24, sottoSoglia, prodottiNuovi, annoPrec,
    ultimaFatturaCaricata: d.fatture.filter(f => f.tipo === "PASSIVA" && f.fornitore_id).reduce((m, f) => (String(f.data) > m ? String(f.data).slice(0, 10) : m), ""), spesaTotale12, schede, nonPiuComprati: schede.filter(s => !s.attivo).sort((a, b) => (a.ultimo.data < b.ultimo.data ? 1 : -1)), rincari, opportunita, ribassi, altre, anomale: anomale.sort((a, b) => (a.data < b.data ? 1 : -1)),
    senzaConversione: senzaConversione.sort((a, b) => (a.data < b.data ? 1 : -1)),
    nuove: nuoveL.filter(x => x.spesa >= SOGLIE.segnalaNuoveEuro), nuoveSottoSoglia: nuoveL.filter(x => x.spesa < SOGLIE.segnalaNuoveEuro).length,
    nuoveTutte: nuoveL.length,   // versione 376: numero rosso nel menu «Controllo Prezzi di Acquisto»
    totaleRincari: somma(rincari.map(s => s.impatto)), totaleRibassi: somma(ribassi.map(s => s.impatto)),
    totaleOpportunita: somma(opportunita.map(s => Math.max(s.risparmioFornitore, s.risparmioMercato))),
    famiglieSenzaFatture: d.famiglie.filter(f => ![...gruppi.values()].some(g => g.id === f.id)).map(f => f.nome),
    // versione 409
    soglie, daSistemare, decisioni, manca409: !!d.manca409, regoleAccese: regoleP.map(r => r.ordine),
  };
}

function prezzoMercato(d, F, U) {
  const nome = (F.prodotto_mercato || "").trim(); if (!nome) return null;
  const esterno = RIFERIMENTI.mercatiEsterni && RIFERIMENTI.mercatiEsterni[nome];
  if (esterno) return { nome, fonte: esterno.fonte, data: esterno.data, prezzoMin: esterno.prezzoMin * U.fattore, prezzoMax: esterno.prezzoMax * U.fattore, dettaglio: esterno.dettaglio, consiglio: esterno.consiglio, storia: [] };
  const righe = (d.mercato || []).filter(r => r.prodotto === nome && num(r.prezzo_q) > 0).sort((a, b) => (a.campagna < b.campagna ? -1 : 1));
  if (!righe.length) return null;
  const ultima = righe[righe.length - 1];
  // prezzo al quintale → al kg → unità della famiglia; il listino di una campagna si colloca a luglio del secondo anno
  const storia = righe.map(r => ({ campagna: r.campagna, data: `${String(r.campagna).slice(5, 9)}-07-15`, prezzo: num(r.prezzo_q) / 100 * U.fattore, fonte: r.fonte }));
  const p = num(ultima.prezzo_q) / 100 * U.fattore;
  return { nome, fonte: ultima.fonte, campagna: ultima.campagna, prezzoMin: p, prezzoMax: p, storia, provvisorio: /PROVVISORIO/i.test(ultima.fonte || "") };
}

// Versione 409: storni più robusti e data della fattura rifatta. Si riconoscono anche «storno fattura n. X», «storno fatt. X», «storno ft X»,
// con «-», «:» o niente fra numero e descrizione; la descrizione si confronta senza punteggiatura. Se nella fattura dello storno (o in un'altra
// dello stesso fornitore con la stessa data) c'è una riga positiva con la stessa descrizione e lo stesso importo, è l'acquisto rifatto:
// prende la data della fattura stornata (caso vero: Granella d'orzo, 12/FE del 08/09/2025 rifatta con la 19/FE del 30/12/2025).
const senzaPunti = t => normalizza(String(t || "").replace(/[^\p{L}\p{N}]+/gu, " "));
export function righeStornateDate(articoli, fat) {
  const via = new Set(), dataOriginale = new Map();
  const perFattura = new Map();
  for (const a of articoli) { if (!perFattura.has(a.fattura_id)) perFattura.set(a.fattura_id, []); perFattura.get(a.fattura_id).push(a); }
  for (const a of articoli) {
    const f = fat.get(a.fattura_id); if (!f || f.tipo !== "PASSIVA" || !(num(a.totale_riga) < 0)) continue;
    const m = /^\s*storno\s+(?:della\s+|alla\s+)?(?:fattura|fatt\.?|ft\.?)\s*(?:n\.?|nr\.?|num\.?)?\s*([^\s:-]+)\s*[-:]?\s*(.+)$/i.exec(String(a.descrizione || ""));
    if (!m) continue;
    const numero = m[1].trim().toLowerCase(), descr = senzaPunti(m[2]);
    for (const g of fat.values()) {
      if (g.tipo !== "PASSIVA" || g.fornitore_id !== f.fornitore_id || String(g.numero || "").trim().toLowerCase() !== numero) continue;
      const r = (perFattura.get(g.id) || []).find(b => !via.has(b.id) && senzaPunti(b.descrizione) === descr && Math.abs(num(b.totale_riga) + num(a.totale_riga)) < 0.005);
      if (!r) continue;
      via.add(r.id);
      // l'acquisto rifatto: stessa descrizione e stesso importo, stesso fornitore, stessa data dello storno
      for (const h of fat.values()) {
        if (h.tipo !== "PASSIVA" || h.fornitore_id !== f.fornitore_id || String(h.data).slice(0, 10) !== String(f.data).slice(0, 10)) continue;
        const nuova = (perFattura.get(h.id) || []).find(b => num(b.totale_riga) > 0 && !dataOriginale.has(b.id) && senzaPunti(b.descrizione) === descr && Math.abs(num(b.totale_riga) - num(r.totale_riga)) < 0.005);
        if (nuova) { dataOriginale.set(nuova.id, String(g.data).slice(0, 10)); break; }
      }
      break;
    }
  }
  return { via, dataOriginale };
}
export const righeStornate = (articoli, fat) => righeStornateDate(articoli, fat).via;

// Versione 407 (caso vero: Mariotti 12/FE del 08/09/2025 stornata dalla 18/FE e rifatta con la 19/FE): una riga negativa
// «storno della fattura n. X - descrizione» toglie dal confronto la riga con la stessa descrizione e lo stesso importo
// della fattura X dello stesso fornitore (la riga negativa è già esclusa). Se non trova la riga, non toglie niente.
// (versione 409: sostituita da righeStornateDate qui sopra)

function trasportoFornitore(perFamiglia, gruppi, fornitore, da12) {
  for (const [id, g] of perFamiglia) {   // versione 407: le chiavi sono quelle dei gruppi
    if (gruppi.get(id).unita !== "importo" || !/^\s*spese di trasporto/i.test(gruppi.get(id).nome)) continue;   // versione 407: stesso test della riga dei gruppi (la polizza Iveco «trasporto animali» non è un trasporto)
    const l = [...g.values()].filter(x => x.fornitore === fornitore && x.data >= da12);
    if (l.length) return { consegne: l.length, totale: somma(l.map(x => x.totale)), medio: somma(l.map(x => x.totale)) / l.length };
  }
  return null;
}

function consigli(s, d) {
  const { famiglia: F, unita: U, ultimo, precedente } = s;
  const out = [];
  const p = (t, testo) => out.push({ tipo: t, testo });
  if (precedente && s.variazione !== null && Math.abs(s.variazione) >= 0.05) {
    p(s.variazione > 0 ? "problema" : "buono", `${s.cambioFornitore ? `Cambio di fornitore: da ${precedente.fornitore} a ${ultimo.fornitore}. ` : ""}Ultima fattura ${ultimo.numero} del ${data(ultimo.data)}: ${it(ultimo.prezzo, U.decimali)} ${U.etichetta}; la precedente (${precedente.numero} del ${data(precedente.data)}) ${it(precedente.prezzo, U.decimali)}: ${s.variazione > 0 ? "+" : ""}${it(s.variazione, 1)}%.` +
      (!s.piuVolte ? ` Si compra una volta l'anno: la variazione vale ${s.impatto > 0 ? "+" : ""}${it(s.impatto, 0)} € l'anno, su una fattura.`
        : s.n12 >= 2 ? (F.unita === "importo" ? "" : ` Con le quantità degli ultimi 12 mesi vale ${s.impatto > 0 ? "+" : ""}${it(s.impatto, 0)} € l'anno.`)
        : ` Negli ultimi 12 mesi ci sono meno di due fatture: si usano le quantità del ${s.annoPrec}, ${s.impatto > 0 ? "+" : ""}${it(s.impatto, 0)} € l'anno.`) +
      (s.annoPassato ? ` È ${s.impatto >= 0 ? "l'incremento" : "il ribasso"} dell'anno passato: resta finché non arriva la fattura nuova; dal 1° gennaio ${s.finoAl} il prodotto non si considera più.` : ""));
  }
  if (s.inSalita) p("problema", `Le ultime tre fatture di ${ultimo.fornitore} sono in salita: ${s.fatture.filter(x => x.fornitore === ultimo.fornitore).slice(-3).map(x => it(x.prezzo, U.decimali)).join(" → ")} ${U.etichetta}. Chiedere un prezzo bloccato per 6–12 mesi in cambio della quantità annua.`);
  if (s.risparmioFornitore > 0) {
    const stesso = s.piuEconomico.descrizioni.every(x => ultimo.descrizioni.map(normalizza).includes(normalizza(x)));
    p("consiglio", `${s.piuEconomico.nome} ha fatturato ${stesso ? "lo stesso prodotto" : `un prodotto della stessa famiglia («${s.piuEconomico.descrizioni.slice(0, 2).join("», «")}»)`} a ${it(s.piuEconomico.prezzo, U.decimali)} ${U.etichetta} (media di ${s.piuEconomico.fatture} fatture, l'ultima del ${data(s.piuEconomico.ultima)}), contro ${it(ultimo.prezzo, U.decimali)} di ${ultimo.fornitore}: con le quantità degli ultimi 12 mesi sono ${it(s.risparmioFornitore, 0)} € l'anno. ${stesso ? `Chiedere a ${ultimo.fornitore} di allinearsi al prezzo.` : "Prima verificare sui cartellini che i due prodotti siano equivalenti per gli animali."}`);
  }
  if (s.fornitori.length === 1 && s.spesa12 >= 3000) p("consiglio", `Un solo fornitore (${ultimo.fornitore}) per ${it(s.spesa12, 0)} € negli ultimi 12 mesi: chiedere ogni anno almeno due preventivi a fornitori diversi, anche solo per avere un termine di paragone.`);
  if (s.mercato) {
    const m = s.mercato;
    if (m.consiglio) p("consiglio", `${m.consiglio} Prezzo di riferimento: ${it(m.prezzoMin, U.decimali)}–${it(m.prezzoMax, U.decimali)} ${U.etichetta} (${m.fonte}); pagato ${it(ultimo.prezzo, U.decimali)} il ${data(ultimo.data)}.${s.risparmioMercato > 0 ? ` Sulla quantità degli ultimi 12 mesi la differenza è circa ${it(s.risparmioMercato, 0)} € l'anno.` : ""}`);
    else if (s.sopraMercato !== null) {
      const farina = /farina/i.test(F.nome) && /granella/i.test(m.nome);
      if (s.sopraMercato > SOGLIE.sopraMercato) p(farina ? "consiglio" : "problema", `Prezzo pagato ${it(ultimo.prezzo, U.decimali)} ${U.etichetta} contro un mercato di ${it(m.prezzoMax, U.decimali)} per «${m.nome}» (${m.fonte}${m.provvisorio ? ", prezzo provvisorio" : ""}): ${it(s.sopraMercato * 100, 1)}% in più.` +
        (farina ? " La differenza è il costo della macinatura e della consegna: confrontare con un preventivo per macinare in azienda o conto terzi." : ` Sulla quantità degli ultimi 12 mesi sono circa ${it(s.risparmioMercato, 0)} € l'anno.`));
      else p("buono", `Prezzo pagato ${it(ultimo.prezzo, U.decimali)} ${U.etichetta}, in linea o sotto il mercato di ${it(m.prezzoMax, U.decimali)} per «${m.nome}» (${m.fonte}).`);
    }
  }
  if (s.trasporto && F.unita !== "importo") p("consiglio", `${ultimo.fornitore} ha fatturato il trasporto a parte ${s.trasporto.consegne} volte negli ultimi 12 mesi (${it(s.trasporto.totale)} €, ${it(s.trasporto.medio)} € a consegna): chiedere il prezzo franco azienda, oppure ordini più grandi e meno frequenti.`);
  if (/^Polizza/i.test(F.nome) && s.variazione > 0) p("consiglio", "Chiedere al broker almeno due preventivi alternativi con le stesse garanzie e massimali, almeno 60 giorni prima della scadenza.");
  p("consiglio", "Per cercare fornitori alternativi copiare il testo di ricerca qui sotto in un'intelligenza artificiale che cerca in internet.");
  void d;
  return out;
}

export function testoRicerca(s, d) {
  const { famiglia: F, unita: U, ultimo } = s;
  const zona = (d.parametri && d.parametri.ricerca_zona_consegna) || "[ZONA DI CONSEGNA]";
  const raggio = (d.parametri && d.parametri.ricerca_raggio_km) || "100";
  const base = U.base === "litri" ? "litri" : U.base === "kg" ? "kg" : U.base;
  const qAnno = F.unita === "importo" ? `${s.n12} fatture` : `${it(s.base12, 0)} ${base}${U.base === "kg" && s.base12 >= 1000 ? ` (${it(s.base12 / 1000, 1)} tonnellate)` : ""}`;
  const qConsegna = s.n12 && F.unita !== "importo" ? `${it(s.base12 / s.n12, 0)} ${base}` : "—";
  const trasporto = s.trasporto ? `escluso, fatturato a parte: ${it(s.trasporto.medio)} € a consegna` : "non indicato a parte in fattura";
  const prezzoBase = F.unita === "importo" || F.unita === "pezzo" || U.fattore === 1 ? "" : ` (pari a ${it(ultimo.prezzoBase, 4)} € al ${U.base === "litri" ? "litro" : "kg"})`;
  const descr = [...new Set(s.fatture.slice(-5).flatMap(x => x.descrizioni))].slice(0, 3).join("; ");
  return `Sei un esperto di acquisti per aziende zootecniche. Devo trovare fornitori alternativi e prezzi
aggiornati per un prodotto che compro regolarmente. Cerca in internet in modo accurato e
rispondi in italiano.

PRODOTTO: ${F.nome}
Come è scritto in fattura: ${descr}
Caratteristiche: ${F.caratteristiche || "[CARATTERISTICHE TECNICHE: per i mangimi proteina, grassi, fibra, ceneri, forma (pellet, farina, sfuso, sacchi); per il fieno tipo di erba, taglio, balla e peso]"}
Quantità comprata negli ultimi 12 mesi: ${qAnno} (${s.n12} consegne, in media ${qConsegna} a consegna)
Prezzo attuale: ${it(ultimo.prezzo, U.decimali)} ${U.etichetta}${prezzoBase}, fattura del ${data(ultimo.data)}; trasporto ${trasporto}
Fornitore attuale: ${ultimo.fornitore}
Consegna: azienda agricola zootecnica (bovini, suini, ovini) a ${zona}; cerco fornitori entro ${raggio} km

COSA TI CHIEDO
1. Prezzi di mercato: cerca le quotazioni più recenti del prodotto o del suo componente
   principale (Borsa Merci e Camere di Commercio di Roma, Bologna, Milano, Modena; ISMEA; AGER).
   Per ogni quotazione scrivi fonte, data, prezzo e unità.
2. Fornitori alternativi: trova mangimifici, consorzi agrari, cooperative, grossisti e aziende
   agricole che vendono il prodotto o un equivalente e consegnano nella zona indicata. Per ognuno:
   nome, sede, distanza indicativa, sito ufficiale, telefono o email presi dal sito ufficiale,
   e se pubblicano listini.
3. Prodotti equivalenti: indica prodotti con caratteristiche uguali o migliori, spiegando le
   differenze di composizione che contano per l'alimentazione degli animali.
4. Tabella di confronto, tutta con la stessa unità di misura (${U.etichetta}): fornitore, prodotto,
   prezzo, trasporto, ordine minimo, pagamento, fonte e data del prezzo.
5. Risparmio: quanto risparmierei in un anno con la quantità indicata, per ogni alternativa
   con un prezzo verificato.
6. Leve di trattativa: acquisti più grandi, contratti annuali, acquisto insieme ad altre
   aziende della zona, ritiro diretto, periodo migliore dell'anno per comprare.
7. Domande da fare ai fornitori quando li chiamo (cartellino, certificazioni, tempi di
   consegna, prezzo bloccato, sconti per quantità).

REGOLE
- Non inventare nomi, prezzi o contatti. Se un dato non lo trovi, scrivi «non trovato».
- Separa i prezzi verificati (con fonte e data) dalle stime.
- Segnala i prezzi vecchi di oltre 6 mesi.
- Alla fine scrivi in tre righe la tua raccomandazione: conviene cambiare, trattare con
  l'attuale fornitore o restare?`;
}

// Versione 376: fornitori di cui si seguono i prezzi: quelli con una regola, o con almeno una riga di fattura d'acquisto
// assegnata a un prodotto vero (non a famiglie «a importo» come le spese di trasporto o le polizze, che non rendono
// «seguito» un fornitore). Usata dal calcolo e dalla pagina «Famiglie di Prodotto» (stesso conto del numero rosso).
export function fornitoriSeguiti(articoli, descrizioni, famiglie, regolePrefisso, fat) {
  const unita = new Map((famiglie || []).map(f => [f.id, f.unita]));
  const mappa = new Map((descrizioni || []).map(x => [x.descrizione_norm, x]));
  const s = new Set();
  for (const r of regolePrefisso || []) s.add(r.fornitore_id);
  for (const a of articoli || []) {
    const m = mappa.get(normalizza(a.descrizione)); if (!m || !m.famiglia_id || unita.get(m.famiglia_id) === "importo") continue;
    const f = fat.get(a.fattura_id); if (f && f.tipo === "PASSIVA" && f.fornitore_id != null) s.add(f.fornitore_id);
  }
  return s;
}

// Versione 376: regola che vale per una descrizione arrivata da più fornitori: tutti devono avere una regola
// (altrimenti le righe del fornitore senza regola restano «nuove» nel calcolo); vince la più lunga
export function regolaPerTutti(regole, n, fornitoriId) {
  let migliore = null;
  for (const id of fornitoriId || []) {
    const r = famigliaDaRegola(regole, n, id); if (!r) return null;
    if (!migliore || r.inizia_con.length > migliore.inizia_con.length) migliore = r;
  }
  return migliore;
}

// Versione 376: quante descrizioni nuove (ultimi 24 mesi) aspettano di essere assegnate a un prodotto o escluse
// versione 409: decisioni di «Da sistemare» non ancora lette dal Dott. Bizzarri (per il suo numero rosso)
export async function contaDecisioniDaLeggere() {
  const r = await supabase.from("ci_prezzi_decisioni").select("id", { count: "exact", head: true }).is("letto_dal_dottore_il", null).is("annullata_il", null);
  return r.error ? 0 : r.count || 0;
}
export async function contaDescrizioniDaAssegnare() {
  const r = analisiPrezzi(await caricaDatiPrezzi());
  return r.daSistemare.length;   // versione 409: il numero di «Da sistemare» (lo stesso in tutto il programma)
}
