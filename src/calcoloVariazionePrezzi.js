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
    tutte("ci_fatture", "id, data, tipo, numero, fornitore_id"),
    tutte("ci_fornitori", "id, nome"),
    tutte("ci_regole_armonizzazione_unita", "id, fornitore_id, centro_costo, descrizione_prodotto, fattore_kg"),
    tutte("coltivazione_prezzi_mercato", "campagna, prodotto, prezzo_q, fonte", "campagna").catch(() => []),
    tutte("ci_parametri", "chiave, valore", "chiave").catch(() => []),
    tutte("ci_famiglie_prodotto_regole", "id, fornitore_id, inizia_con, famiglia_id").catch(() => []),   // versione 376
  ]);
  return { famiglie, descrizioni, articoli, fatture, fornitori, regole, mercato, regolePrefisso, parametri: Object.fromEntries(parametri.map(p => [p.chiave, p.valore])) };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
export function analisiPrezzi(d, oggi = oggiRoma()) {
  const fam = new Map(d.famiglie.map(f => [f.id, f]));
  const mappa = new Map(d.descrizioni.map(x => [x.descrizione_norm, x]));
  const fat = new Map(d.fatture.map(f => [f.id, f]));
  const forn = new Map(d.fornitori.map(f => [f.id, f.nome]));
  const reg = new Map(d.regole.map(r => [`${r.fornitore_id}|${(r.centro_costo || "").trim()}|${String(r.descrizione_prodotto || "").trim().toLowerCase()}`, num(r.fattore_kg)]));
  const da12 = new Date(new Date(oggi) - 365 * GIORNO).toISOString().slice(0, 10);
  const da24 = new Date(new Date(oggi) - 730 * GIORNO).toISOString().slice(0, 10);
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
  const stornate = righeStornate(d.articoli, fat);   // versione 407
  const gruppi = new Map();   // versione 407: chiave del gruppo → famiglia (per le famiglie miste, una per nome)
  for (const a of d.articoli) {
    const f = fat.get(a.fattura_id); if (!f || f.tipo !== "PASSIVA") continue;
    const tot = num(a.totale_riga); if (!(tot > 0)) continue;
    if (stornate.has(a.id)) continue;   // versione 407: riga stornata da una «storno della fattura n. …»
    const dt = String(f.data).slice(0, 10);
    if (dt >= da12 && (a.area || "").trim() !== "Ammortamenti") spesaTotale12 += tot;
    const n = normalizza(a.descrizione); if (!n) continue;
    let m = mappa.get(n);
    if (!m) { const r = famigliaDaRegola(d.regolePrefisso, n, f.fornitore_id); if (r) m = { descrizione_norm: n, famiglia_id: r.famiglia_id, regola: r.id }; }
    if (!m) {
      if ((CENTRI_PRODOTTO.includes((a.centro_costo || "").trim()) || seguiti.has(f.fornitore_id)) && dt >= da24 && (a.area || "").trim() !== "Ammortamenti") {
        const x = nuove.get(n) || { descrizione: n, centro: (a.centro_costo || "").trim(), spesa: 0, righe: 0, ultima: dt, fornitori: new Set() };
        x.spesa += tot; x.righe++; if (dt > x.ultima) x.ultima = dt; x.fornitori.add(forn.get(f.fornitore_id) || ""); nuove.set(n, x);
      }
      continue;
    }
    if (!m.famiglia_id || !fam.has(m.famiglia_id)) continue; // esclusa dal confronto
    const F = fam.get(m.famiglia_id), U = UNITA[F.unita] || UNITA.kg;
    let base;
    if (F.unita === "importo") base = 1;
    else if (F.unita === "pezzo") base = num(a.quantita);
    else {
      const r = reg.get(`${f.fornitore_id}|${(a.centro_costo || "").trim()}|${String(a.descrizione || "").trim().toLowerCase()}`);
      const u = UNITA_FATTURA[String(a.unita_misura || "").trim().toLowerCase()];
      const fattore = r > 0 ? r : u > 0 ? u : 0;
      base = num(a.quantita) * fattore;
    }
    if (!(base > 0)) {
      if (dt >= da24) senzaConversione.push({ famiglia: F.nome, data: dt, numero: f.numero, fornitore: forn.get(f.fornitore_id) || "", descrizione: a.descrizione, quantita: num(a.quantita), unita: a.unita_misura || "", totale: tot });
      continue;
    }
    // versione 407: nelle famiglie miste un gruppo per ogni nome; le spese di trasporto (a fattura) un gruppo per ogni fornitore,
    // perché il trasporto di un fornitore non si confronta con quello di un altro (ricontrollo del 26/11: Progeo 30 €, Faza 200 €)
    const trasporto = F.unita === "importo" && /^\s*spese di trasporto/i.test(F.nome);
    const chiave = FAMIGLIE_MISTE.includes(F.id) ? `${F.id}|${n}` : trasporto ? `${F.id}|f${f.fornitore_id}` : `${F.id}`;
    if (!gruppi.has(chiave)) gruppi.set(chiave, FAMIGLIE_MISTE.includes(F.id) ? { ...F, nome: `${F.nome} – ${String(a.descrizione || "").trim()}`, mista: true }
      : trasporto ? { ...F, nome: `${F.nome} – ${forn.get(f.fornitore_id) || "fornitore sconosciuto"}` } : F);
    if (!perFamiglia.has(chiave)) perFamiglia.set(chiave, new Map());
    const g = perFamiglia.get(chiave);
    const k = `${f.id}`;
    const x = g.get(k) || { fatturaId: f.id, data: dt, numero: f.numero, fornitore: forn.get(f.fornitore_id) || "fornitore sconosciuto", base: 0, totale: 0, quantita: 0, unitaFattura: new Set(), descrizioni: new Set() };
    x.base += base; x.totale += tot; x.quantita += num(a.quantita); if (a.unita_misura) x.unitaFattura.add(a.unita_misura); x.descrizioni.add(a.descrizione);
    g.set(k, x);
    void U;
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
      const med = vicini.length >= 3 ? mediana(vicini) : null;
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

// Versione 407 (caso vero: Mariotti 12/FE del 08/09/2025 stornata dalla 18/FE e rifatta con la 19/FE): una riga negativa
// «storno della fattura n. X - descrizione» toglie dal confronto la riga con la stessa descrizione e lo stesso importo
// della fattura X dello stesso fornitore (la riga negativa è già esclusa). Se non trova la riga, non toglie niente.
export function righeStornate(articoli, fat) {
  const via = new Set();
  const perFattura = new Map();
  for (const a of articoli) { if (!perFattura.has(a.fattura_id)) perFattura.set(a.fattura_id, []); perFattura.get(a.fattura_id).push(a); }
  for (const a of articoli) {
    const f = fat.get(a.fattura_id); if (!f || f.tipo !== "PASSIVA" || !(num(a.totale_riga) < 0)) continue;
    const m = /^\s*storno\s+(?:della\s+)?fattura\s+n\.?\s*([^\s-]+)\s*-\s*(.+)$/i.exec(String(a.descrizione || ""));
    if (!m) continue;
    const numero = m[1].trim().toLowerCase(), descr = normalizza(m[2]);
    for (const g of fat.values()) {
      if (g.tipo !== "PASSIVA" || g.fornitore_id !== f.fornitore_id || String(g.numero || "").trim().toLowerCase() !== numero) continue;
      const r = (perFattura.get(g.id) || []).find(b => !via.has(b.id) && normalizza(b.descrizione) === descr && Math.abs(num(b.totale_riga) + num(a.totale_riga)) < 0.005);
      if (r) { via.add(r.id); break; }
    }
  }
  return via;
}

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
export async function contaDescrizioniDaAssegnare() {
  const r = analisiPrezzi(await caricaDatiPrezzi());
  return r.nuoveTutte || 0;
}
