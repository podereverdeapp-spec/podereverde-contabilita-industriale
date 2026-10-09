// Versione 239 — Report di Analisi (richiesti dal Dott. Bizzarri l'8 e il 9 ottobre 2026).
// Il report non dà solo numeri: dice cosa va e cosa non va, indaga le cause nei dati, distingue le cause
// dimostrate da quelle probabili e dalle ipotesi, suggerisce cosa fare e quanto vale. Si ricalcola a ogni
// apertura con i dati del momento. Sola lettura: nessuna scrittura nel database.
//
// Regole di calcolo (le stesse delle bozze approvate):
// - euro per UBA: costi dell'anno attribuiti alla specie (stessa ripartizione del Report Costi, senza macello e
//   lavorazioni) divisi per le UBA medie (giorni di UBA produttivi ÷ giorni dell'anno);
// - euro per kg di carcassa: vita intera dei capi all'ingrasso macellati e pesati; ogni anno di mantenimento si
//   scompone con le percentuali per area di quell'anno; la nascita allo stesso modo, con la parte del residuo dei
//   riproduttori nella voce «Quota dei riproduttori»; l'acquisto del capo a parte; le riforme sono escluse
//   (il loro mantenimento è già passato ai figli);
// - scomposizione dei mangimi: numero di animali, chili per animale, prezzo pagato, orzo rientrato (la somma è esatta);
// - segnali nuovi: aree che peggiorano più del 10% rispetto all'anno prima (soglia proposta).
import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";
import { caricaDatiBase, AREA_LAVORAZIONI } from "./calcoloBreakEven";
import { allocaCostiPerSpecie } from "./calcoloAllocazioneSpecie";
import { RIFERIMENTI } from "./riferimentiEsterni";

export const SOGLIA_SEGNALE = 0.10;
export const NOMI = {
  suino: { plurale: "suini", Gli: "I suini", dei: "dei suini", ai: "ai suini", capi: "suini all'ingrasso", Plurale: "Suini" },
  bovino: { plurale: "bovini", Gli: "I bovini", dei: "dei bovini", ai: "ai bovini", capi: "bovini all'ingrasso", Plurale: "Bovini" },
  ovino: { plurale: "ovini", Gli: "Gli ovini", dei: "degli ovini", ai: "agli ovini", capi: "ovini", Plurale: "Ovini" },
};
export const AREE = ["Lavoro", "Alimentazione comprata", "Coltivazione (alimenti prodotti in azienda)", "Ammortamenti", "Consulenze", "Assicurazioni", "Altre spese di allevamento", "Varie e canoni"];
export const AREE_KG = AREE.concat(["Quota dei riproduttori", "Acquisto del capo"]);
export const GRUPPI = ["Lavoro", "Alimentazione comprata", "Coltivazione (alimenti prodotti in azienda)", "Ammortamenti", "Altre spese"];
export const gruppoDi = a => (GRUPPI.includes(a) ? a : "Altre spese");
const ALIM = new Set(["Mangimi", "Foraggio", "Integratori alimentari"]);
const CENTRO_LAVORO_CARNI = "Lavoro per la lavorazione delle carni";
const MESE = 30.44;
const CLASSI_ETA = {
  suino: [[0, 6, "fino a 6 mesi"], [6, 9, "da 6 a 9 mesi"], [9, 12, "da 9 a 12 mesi"], [12, 18, "da 12 a 18 mesi"], [18, 999, "oltre 18 mesi"]],
  bovino: [[0, 18, "fino a 18 mesi"], [18, 24, "da 18 a 24 mesi"], [24, 30, "da 24 a 30 mesi"], [30, 999, "oltre 30 mesi"]],
  ovino: [[0, 6, "fino a 6 mesi"], [6, 12, "da 6 a 12 mesi"], [12, 999, "oltre 12 mesi"]],
};
const SOGLIA_ETA = { suino: 12, bovino: 24, ovino: 12 };
const NOMI_MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const somma = l => l.reduce((s, x) => s + x, 0);
const giorniAnno = y => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);
const annoDi = d => (d ? parseInt(String(d).slice(0, 4)) : null);
const mesiTra = (a, b) => (new Date(String(b).slice(0, 10)) - new Date(String(a).slice(0, 10))) / 86400000 / MESE;
// numeri all'italiana, con il punto delle migliaia sempre presente (1.761,59 e non 1761,59)
export const it = (n, d = 2) => {
  if (!(typeof n === "number" && Number.isFinite(n))) return "—";
  const [i, f] = Math.abs(n).toFixed(d).split(".");
  const negativo = n < 0 && Number(Math.abs(n).toFixed(d)) !== 0;
  return (negativo ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (f ? "," + f : "");
};
const pct = (a, b) => (a ? (b / a - 1) * 100 : null);
const segno = v => (v > 0 ? "+" : v < 0 ? "−" : "");

export function areaAnalisi(area, centro) {
  if (area === "Allevamento" && ALIM.has(centro)) return "Alimentazione comprata";
  if (area === "Coltivazione") return "Coltivazione (alimenti prodotti in azienda)";
  if (["Lavoro", "Ammortamenti", "Consulenze", "Assicurazioni"].includes(area)) return area;
  if (area === "Allevamento") return "Altre spese di allevamento";
  return "Varie e canoni";
}

// ── Lettura dei dati (una volta sola) ────────────────────────────────────────────────────────
async function tutte(tabella, colonne, ordine = "id") {
  const { data, error } = await fetchAllPages((da, a) => supabase.from(tabella).select(colonne).order(ordine).range(da, a));
  if (error) throw new Error(`${tabella}: ${error.message}`);
  return data || [];
}

export async function caricaDatiReport() {
  const base = await caricaDatiBase();
  const [articoli, fatture, fornitori, regole, cespiti, pesate, mandriaIntera] = await Promise.all([
    tutte("ci_articoli_fattura", "id, fattura_id, descrizione, quantita, totale_riga, area, centro_costo, destinazione"),
    tutte("ci_fatture", "id, data, tipo, numero, fornitore_id, regolarizzazione_di"),
    tutte("ci_fornitori", "id, nome"),
    tutte("ci_regole_armonizzazione_unita", "id, fornitore_id, centro_costo, descrizione_prodotto, fattore_kg"),
    tutte("ci_cespiti", "id, descrizione, specie"),
    supabase.from("pesate_storico").select("id").limit(1).then(r => (r.data || []).length, () => null),
    tutte("ci_costo_nascita_mandria", "id, specie, anno, nati, costo_mandria, costo_nascita_per_nato, riproduttori_in_carriera, riproduttori_senza_figli, mantenimento_riproduttori, quota_residuo_riproduttori"),
  ]);
  // il riepilogo della mandria letto per intero (nati, costo per nato): il Break Even ne legge solo due colonne
  base.mandria = new Map(mandriaIntera.map(m => [`${m.specie}|${m.anno}`, m]));
  const fat = new Map(fatture.map(f => [f.id, f]));
  const forn = new Map(fornitori.map(f => [f.id, f.nome]));
  const reg = new Map(regole.map(r => [`${r.fornitore_id}|${(r.centro_costo || "").trim()}|${String(r.descrizione_prodotto || "").trim().toLowerCase()}`, num(r.fattore_kg)]));
  const acquisti = [], vendite = [];
  for (const a of articoli) {
    const f = fat.get(a.fattura_id); if (!f) continue;
    const riga = { ...a, data: f.data, anno: annoDi(f.data), tipo: f.tipo, numero: f.numero, fornitore: forn.get(f.fornitore_id) || "", totale: num(a.totale_riga), quantita: num(a.quantita) };
    if (f.tipo === "ATTIVA") { vendite.push(riga); continue; }
    if ((a.area || "").trim() !== "Allevamento" || !ALIM.has((a.centro_costo || "").trim())) continue;
    if (f.tipo === "PASSIVA" && f.regolarizzazione_di) continue;
    riga.fattoreKg = reg.get(`${f.fornitore_id}|${(a.centro_costo || "").trim()}|${String(a.descrizione || "").trim().toLowerCase()}`) || 0;
    riga.servizio = /TRASPORT|SCONTO/i.test(a.descrizione || "");
    riga.kg = riga.servizio ? 0 : riga.quantita * riga.fattoreKg;
    acquisti.push(riga);
  }
  return { base, acquisti, vendite, cespiti: new Map(cespiti.map(c => [c.id, c])), pesate };
}

// ── Costi dell'anno per area e per voce di conto ───────────────────────────────────────────────
function costiSpecieAnno(base, specie, anno, cache) {
  const k = `${specie}|${anno}`; if (cache.has(k)) return cache.get(k);
  const righe = base.righeCostoAnno(anno).filter(r => !(r.area === AREA_LAVORAZIONI || r.centro_costo === CENTRO_LAVORO_CARNI));
  const uba = base.ubaAnno(anno);
  if (!uba.length) { cache.set(k, null); return null; }
  const gruppi = new Map();
  for (const r of righe) { const g = `${r.area}|${r.centro_costo}`; if (!gruppi.has(g)) gruppi.set(g, []); gruppi.get(g).push(r); }
  const aree = {}, voci = {}; let tot = 0;
  for (const [g, rr] of gruppi) {
    const [area, centro] = g.split("|");
    const v = allocaCostiPerSpecie(rr, uba)[specie].totale; if (Math.abs(v) < 0.005) continue;
    const a = areaAnalisi(area, centro);
    aree[a] = (aree[a] || 0) + v; voci[a] = voci[a] || {}; voci[a][centro || area] = (voci[a][centro || area] || 0) + v; tot += v;
  }
  const c = base.costiAnno(anno, "BE");
  const ubaGiorni = c.perSpecie[specie].ubaProduttivi;
  const ubaTutte = Object.values(c.perSpecie).reduce((s, x) => s + x.ubaProduttivi, 0);
  const r = { anno, totale: tot, aree, voci, ubaGiorni, ubaMedie: ubaGiorni / giorniAnno(anno), quotaUba: ubaTutte > 0 ? ubaGiorni / ubaTutte : 0,
    ubaPer: Object.fromEntries(Object.entries(c.perSpecie).map(([s, x]) => [s, x.ubaProduttivi])), controllo: c.perSpecie[specie].fissi + c.perSpecie[specie].variabili };
  cache.set(k, r); return r;
}
const perUba = (c, a) => (c && c.ubaMedie > 0 ? (c.aree[a] || 0) / c.ubaMedie : null);
const totUba = c => (c && c.ubaMedie > 0 ? c.totale / c.ubaMedie : null);

function quotaDestinazione(dest, specie, ubaPer) {
  const gruppi = { Bovini: ["bovino"], Suini: ["suino"], Ovini: ["ovino"], Generali: ["bovino", "suino", "ovino"], "Bovini e Ovini": ["bovino", "ovino"], "Bovini e Suini": ["bovino", "suino"], "Suini e Ovini": ["suino", "ovino"] }[(dest || "").trim()] || [];
  const den = somma(gruppi.map(s => ubaPer[s] || 0));
  return gruppi.includes(specie) && den > 0 ? (ubaPer[specie] || 0) / den : 0;
}

// ── Il costo di ogni capo macellato, scomposto per area ────────────────────────────────────────
function capiMacellati(dati, specie, anno, cache) {
  const { base } = dati;
  const quote = y => { const c = costiSpecieAnno(base, specie, y, cache); return c && c.totale ? Object.fromEntries(Object.entries(c.aree).map(([a, v]) => [a, v / c.totale])) : {}; };
  const capi = base.soggetti.filter(s => s.specie === specie && s.stato === "macellato" && s.uscita && annoDi(s.uscita) === anno);
  return capi.map(s => {
    const righe = base.righeSoggetto.get(s.chiave) || [];
    const comp = {}, nascita = {}; let totale = 0;
    const add = (o, a, v) => { o[a] = (o[a] || 0) + v; };
    for (const r of righe) {
      const q = quote(r.anno), mant = num(r.costo_mantenimento), nasc = num(r.costo_nascita_ereditato), res = num(r.quota_residuo_riproduttori);
      for (const [a, sh] of Object.entries(q)) add(comp, a, mant * sh);
      if (nasc) {
        const m = base.mandria.get(`${specie}|${r.anno}`);
        const tm = m ? num(m.mantenimento_riproduttori) + num(m.quota_residuo_riproduttori) : 0;
        const qr = tm > 0 ? num(m.quota_residuo_riproduttori) / tm : 0;
        add(comp, "Quota dei riproduttori", nasc * qr); add(nascita, "Quota dei riproduttori", nasc * qr);
        for (const [a, sh] of Object.entries(q)) { add(comp, a, nasc * (1 - qr) * sh); add(nascita, a, nasc * (1 - qr) * sh); }
      }
      if (res) add(comp, "Quota dei riproduttori", res);
      totale += mant + nasc + res;
    }
    if (s.acquistato && s.costoAcquisto) { add(comp, "Acquisto del capo", s.costoAcquisto); totale += s.costoAcquisto; }
    return { ...s, costo: totale, comp, compNascita: nascita, haCosti: righe.length > 0, eta: s.nascita ? mesiTra(s.nascita, s.uscita) : null };
  });
}

function riepilogoKg(capi) {
  const ing = capi.filter(c => !c.riproduttore);
  const pes = ing.filter(c => c.pesoCarcassa > 0 && c.haCosti), non = ing.filter(c => !(c.pesoCarcassa > 0));
  const kg = somma(pes.map(c => c.pesoCarcassa)), cp = somma(pes.map(c => c.costo)), cn = somma(non.map(c => c.costo));
  const aree = {}, nascita = {};
  for (const c of pes) { for (const [a, v] of Object.entries(c.comp)) aree[a] = (aree[a] || 0) + v; for (const [a, v] of Object.entries(c.compNascita)) nascita[a] = (nascita[a] || 0) + v; }
  const kgStimati = pes.length ? kg + non.length * kg / pes.length : 0;
  const conVivo = pes.filter(c => c.pesoVivo > 0);
  return { capi: ing.length, pesati: pes.length, nonPesati: non.length, kg, costoPesati: cp, costoNonPesati: cn, aree, nascita, riforme: capi.filter(c => c.riproduttore).length,
    perKg: kg > 0 ? cp / kg : null, perKgStima: kgStimati > 0 ? (cp + cn) / kgStimati : null, kgStimati, pesoMedio: pes.length ? kg / pes.length : null,
    costoCapoPesati: pes.length ? cp / pes.length : null, costoCapoNonPesati: non.length ? cn / non.length : null,
    etaPesati: media(pes.map(c => c.eta)), etaNonPesati: media(non.map(c => c.eta)),
    resa: somma(conVivo.map(c => c.pesoVivo)) > 0 ? somma(conVivo.map(c => c.pesoCarcassa)) / somma(conVivo.map(c => c.pesoVivo)) * 100 : null };
}
function media(l) { const v = l.filter(x => typeof x === "number" && Number.isFinite(x)); return v.length ? somma(v) / v.length : null; }

function classiEta(capi, specie) {
  const ing = capi.filter(c => !c.riproduttore && c.natoInAzienda && c.eta !== null);
  return CLASSI_ETA[specie].map(([da, a, nome]) => {
    const g = ing.filter(c => c.eta >= da && c.eta < a), p = g.filter(c => c.pesoCarcassa > 0 && c.haCosti);
    const kg = somma(p.map(c => c.pesoCarcassa));
    return { classe: nome, da, a, capi: g.length, pesati: p.length, kgMedio: p.length ? kg / p.length : null, costoMedio: g.length ? somma(g.map(c => c.costo)) / g.length : null,
      perKg: kg > 0 ? somma(p.map(c => c.costo)) / kg : null, nascitaMedia: g.length ? somma(g.map(c => somma(Object.values(c.compNascita)))) / g.length : null };
  }).filter(c => c.capi > 0);
}

// ── Prezzo di vendita dalle fatture attive ─────────────────────────────────────────────────────
function prezzoVendita(dati, specie, anno) {
  const dest = NOMI[specie].Plurale;
  const righe = dati.vendite.filter(v => (v.destinazione || "").trim() === dest && v.quantita > 0);
  const anni = [...new Set(righe.map(r => r.anno))].sort();
  const usato = anni.includes(anno) ? anno : anni.filter(a => a <= anno).pop() ?? anni.pop();
  const rr = righe.filter(r => r.anno === usato);
  const kg = somma(rr.map(r => r.quantita)), eur = somma(rr.map(r => r.totale));
  return kg > 0 ? { prezzo: eur / kg, kg, euro: eur, anno: usato, righe: rr.length, numeri: [...new Set(rr.map(r => r.numero))] } : null;
}

// ── Mangimi: chili e scomposizione numero / quantità / prezzo ───────────────────────────────────
function mangimiAnno(dati, specie, c) {
  let eur = 0, kg = 0, credito = 0;
  for (const r of dati.acquisti) {
    if (r.anno !== c.anno || (r.centro_costo || "").trim() !== "Mangimi") continue;
    const sh = quotaDestinazione(r.destinazione, specie, c.ubaPer);
    if (!sh) continue;
    if (r.tipo === "DA_EMETTERE") { credito += r.totale * sh; continue; }
    eur += r.totale * sh; kg += r.kg * sh;
  }
  return { euro: eur + credito, pagato: eur, credito, kg, ubaMedie: c.ubaMedie, kgPerUba: c.ubaMedie ? kg / c.ubaMedie : 0, prezzoPagato: kg ? eur / kg : 0 };
}
function scomposizione(a, b) {
  const numero = (b.ubaMedie - a.ubaMedie) * a.kgPerUba * a.prezzoPagato;
  const quantita = b.ubaMedie * (b.kgPerUba - a.kgPerUba) * a.prezzoPagato;
  const prezzo = b.ubaMedie * b.kgPerUba * (b.prezzoPagato - a.prezzoPagato);
  const orzo = b.credito - a.credito;
  return { numero, quantita, prezzo, orzo, totale: numero + quantita + prezzo + orzo, differenza: b.euro - a.euro };
}

// madri elencate una volta sola, con «due volte», «tre volte» se ripetono
const VOLTE = { 2: "due volte", 3: "tre volte", 4: "quattro volte" };
function elencoMadri(codici) {
  const conta = new Map(); codici.forEach(c => conta.set(c, (conta.get(c) || 0) + 1));
  const l = [...conta.entries()].map(([c, n]) => (n > 1 ? `${c} (${VOLTE[n] || `${n} volte`})` : c));
  l.n = codici.length; return l;
}

// ── Riproduzione: parti e nati per anno ─────────────────────────────────────────────────────────
function riproduzione(dati, specie, anno) {
  const { base } = dati;
  const idSpecie = new Set(base.soggetti.filter(s => s.specie === specie && s.tipo === "animale").map(s => s.id));
  const cod = new Map(base.soggetti.filter(s => s.tipo === "animale").map(s => [s.id, s.codice]));
  const parti = base.eventi.filter(e => /^part/i.test(e.tipo_evento || "") && idSpecie.has(e.animale_id));
  const perAnno = y => { const p = parti.filter(e => annoDi(e.data_evento) === y); return { anno: y, parti: p.length, nati: somma(p.map(e => num(e.nati_vivi))), aZero: elencoMadri(p.filter(e => !(num(e.nati_vivi) > 0)).map(e => cod.get(e.animale_id) || `scheda ${e.animale_id}`)) }; };
  const mandria = y => base.mandria.get(`${specie}|${y}`) || null;
  // femmine adulte presenti a metà anno (età adulta come nel Break Even; per i bovini 30 mesi o già partorite)
  const adulte = y => {
    const metà = `${y}-07-01`;
    const partorite = new Set(parti.filter(e => String(e.data_evento) < metà).map(e => e.animale_id));
    const etaAdulta = { suino: 10, bovino: 30, ovino: 12 }[specie];
    return base.soggetti.filter(s => s.specie === specie && s.tipo === "animale" && String(s.sesso || "").toUpperCase().startsWith("F") && base.presenteIl(s, metà)
      && ((s.nascita && mesiTra(s.nascita, metà) >= etaAdulta) || partorite.has(s.id)) && (specie !== "bovino" || s.riproduttore || partorite.has(s.id)));
  };
  // interparto (giorni) dei parti dell'anno
  const perMadre = new Map(); parti.forEach(e => { if (!perMadre.has(e.animale_id)) perMadre.set(e.animale_id, []); perMadre.get(e.animale_id).push(String(e.data_evento).slice(0, 10)); });
  const interparto = y => { const v = []; for (const l of perMadre.values()) { l.sort(); for (let i = 1; i < l.length; i++) if (annoDi(l[i]) === y) v.push((new Date(l[i]) - new Date(l[i - 1])) / 86400000); } return v.length ? { media: somma(v) / v.length, n: v.length } : null; };
  const senzaParto = y => adulte(y).filter(s => !parti.some(e => e.animale_id === s.id && annoDi(e.data_evento) === y)).map(s => s.codice);
  const nascitePerMese = y => { const m = Array(12).fill(0); parti.filter(e => annoDi(e.data_evento) === y).forEach(e => { m[parseInt(String(e.data_evento).slice(5, 7)) - 1] += num(e.nati_vivi); }); return m; };
  return { perAnno, mandria, adulte, interparto, senzaParto, nascitePerMese, anni: [anno - 2, anno - 1, anno, anno + 1].map(perAnno) };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Report di una specie
// ════════════════════════════════════════════════════════════════════════════════════════════════
export function analisiSpecie(dati, specie, anno) {
  const { base } = dati;
  const N = NOMI[specie];
  const cache = new Map();
  const C = y => costiSpecieAnno(base, specie, y, cache);
  const c0 = C(anno), c1 = C(anno - 1), c2 = C(anno - 2);
  if (!c0) return { vuoto: true, motivo: `Per il ${anno} non ci sono costi salvati: ricalcolare il Report Costi.` };
  const anniStoria = [anno - 4, anno - 3, anno - 2, anno - 1, anno].filter(y => C(y) && C(y).totale > 0);
  const capi0 = capiMacellati(dati, specie, anno, cache), capi1 = capiMacellati(dati, specie, anno - 1, cache);
  const k0 = riepilogoKg(capi0), k1 = riepilogoKg(capi1);
  const eta = classiEta(capi0, specie);
  const prezzo = prezzoVendita(dati, specie, anno);
  const P = prezzo ? prezzo.prezzo : null;
  const rip = riproduzione(dati, specie, anno);
  const mg0 = mangimiAnno(dati, specie, c0), mg1 = c1 ? mangimiAnno(dati, specie, c1) : null;
  const q4 = mg1 && mg1.kg > 0 && mg0.kg > 0 ? { a: mg1, b: mg0, effetti: scomposizione(mg1, mg0) } : null;
  const buoni = [], critiche = [], segnali = [], affidabilita = [];
  const u0 = totUba(c0), u1 = totUba(c1);
  const pAlim0 = (c0.aree["Alimentazione comprata"] || 0) + (c0.aree["Coltivazione (alimenti prodotti in azienda)"] || 0);

  // ── Cose che vanno bene ──
  if (c1 && u0 < u1) buoni.push({ t: "Il costo per UBA scende", serie: anniStoria.map(y => [String(y), `${it(totUba(C(y)))} €`]),
    testo: `Nel ${anno} un'UBA ${N.dei} è costata ${it(u0)} €, il ${it(-pct(u1, u0), 1)}% in meno del ${anno - 1}. Le UBA medie sono passate da ${it(c1.ubaMedie)} a ${it(c0.ubaMedie)}.` });
  if (c1 && perUba(c0, "Lavoro") < perUba(c1, "Lavoro")) buoni.push({ t: "Il lavoro si divide su più animali", serie: anniStoria.map(y => [String(y), `${it(perUba(C(y), "Lavoro"))} €`]),
    testo: `Il lavoro per UBA ${N.dei} è sceso da ${it(perUba(c1, "Lavoro"))} € a ${it(perUba(c0, "Lavoro"))} €.` });
  if (k1.capi && k0.capi > k1.capi) buoni.push({ t: `Più ${N.plurale} macellati`, serie: [[String(anno - 1), `${k1.capi} capi`], [String(anno), `${k0.capi} capi`]],
    testo: `${N.capi.charAt(0).toUpperCase() + N.capi.slice(1)} macellati: ${k1.capi} nel ${anno - 1}, ${k0.capi} nel ${anno}.` });
  const migliore = eta.filter(e => e.perKg !== null && e.pesati >= 3).sort((a, b) => a.perKg - b.perKg)[0];
  if (migliore && P && migliore.perKg < P) buoni.push({ t: "Quando i tempi sono giusti, si guadagna", serie: [[migliore.classe, `${it(migliore.perKg)} € al kg`], ["prezzo", `${it(P)} € al kg`]],
    testo: `I ${migliore.capi} ${N.plurale} nati in azienda e macellati ${migliore.classe} nel ${anno} sono costati ${it(migliore.perKg)} € per kg di carcassa: ${it(P - migliore.perKg)} € sotto il prezzo di vendita.` });
  if (specie === "bovino" && P) { const r = RIFERIMENTI.femmineDaMacello, resa = (k0.resa || 60) / 100; const lo = r.prezzoVivoMin / resa, hi = r.prezzoVivoMax / resa;
    if (P > lo) buoni.push({ t: "Il prezzo di vendita è buono", serie: [["Podere Verde", `${it(P)} € al kg`], ["mercato", `circa ${it(lo, 1)}–${it(hi, 1)} €`]],
      testo: `La carcassa è fatturata a ${it(P)} € al kg. Sul ${r.fonte} le ${r.descrizione} valgono ${it(r.prezzoVivoMin)}–${it(r.prezzoVivoMax)} € al kg vivo: con la nostra resa del ${it(resa * 100, 1)}% sono circa ${it(lo, 1)}–${it(hi, 1)} € al kg di carcassa.` }); }
  const r0 = rip.perAnno(anno), r1 = rip.perAnno(anno - 1), rNext = rip.perAnno(anno + 1);
  if (r1.nati && r0.nati > r1.nati) buoni.push({ t: "Più nati", serie: [[String(anno - 1), `${r1.nati} nati vivi`], [String(anno), `${r0.nati} nati vivi`]], testo: `I parti sono passati da ${r1.parti} a ${r0.parti}, i nati vivi da ${r1.nati} a ${r0.nati}.` });
  if (rNext.parti >= 3 && r0.parti && rNext.nati / rNext.parti > (r0.nati / r0.parti) * 1.15) buoni.push({ t: `Nel ${anno + 1} le nidiate sono più grandi`, serie: [[String(anno), `${it(r0.nati / r0.parti)} nati per parto`], [`${anno + 1} in corso`, `${it(rNext.nati / rNext.parti)} nati per parto`]],
    testo: `Nel ${anno + 1} fino a oggi sono registrati ${rNext.parti} parti con ${rNext.nati} nati vivi. Il dato è parziale, ma la direzione è buona.` });
  if (k1.resa && k0.resa && k0.resa > k1.resa + 0.5) buoni.push({ t: "Resa al macello migliorata", serie: [[String(anno - 1), `${it(k1.resa, 1)}%`], [String(anno), `${it(k0.resa, 1)}%`]], testo: `Il peso della carcassa sul peso vivo dei capi pesati è salito al ${it(k0.resa, 1)}%.` });
  if (k0.capi && k0.pesati / k0.capi > (k1.capi ? k1.pesati / k1.capi : 0) + 0.05) buoni.push({ t: "I dati migliorano", serie: [[String(anno - 1), `${k1.pesati} su ${k1.capi}`], [String(anno), `${k0.pesati} su ${k0.capi}`]], testo: `Capi all'ingrasso macellati con il peso della carcassa: ${k1.pesati} su ${k1.capi} nel ${anno - 1}, ${k0.pesati} su ${k0.capi} nel ${anno}.` });

  // ── Criticità ──
  // 1) Margine per chilo
  if (P && k0.perKg !== null) {
    const stima = k0.perKgStima, perdita = stima > P;
    const liv = stima >= P * 0.9 ? "alta" : null;
    if (liv) critiche.push({ peso: (stima - P) * (k0.kgStimati || 0) + 1e6 * (stima > P * 2 ? 1 : 0), liv, stato: stima > P * 2 ? "strutturale" : "da misurare",
      t: stima > P * 2 ? `Ogni chilo di carne costa ${it(stima / P, 1)} volte il prezzo` : "Margine per chilo quasi nullo",
      serie: [[String(anno - 1), k1.perKg ? `${it(k1.perKg)} €` : "non calcolabile"], [String(anno), `${it(k0.perKg)} € pesati · ${it(stima)} € stima`], ["prezzo", `${it(P)} €`]], etichetta: `costo per kg di carcassa ${N.dei} all'ingrasso`,
      dato: `Nel ${anno} un capo all'ingrasso pesato è costato in media ${it(k0.costoCapoPesati)} € per ${it(k0.pesoMedio, 1)} kg di carcassa: ${it(k0.perKg)} € al kg. Con il peso medio anche per ${k0.nonPesati === 1 ? "l'unico capo non pesato" : `i ${k0.nonPesati} non pesati`}: ${it(stima)} € al kg. Prezzo di vendita: ${it(P)} € al kg (fatture del ${prezzo.anno}).`,
      costo: perdita ? `Si perdono ${it(stima - P)} € per kg: circa ${it((stima - P) * k0.kgStimati, 0)} € sul ${anno} (stima).` : `Restano ${it(P - stima)} € per kg: circa ${it((P - stima) * k0.kgStimati, 0)} € sul ${anno} (stima).`,
      indagine: [
        `Di cosa è fatto un chilo: ${Object.entries(k0.aree).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a, v]) => `${a.toLowerCase()} ${it(v / k0.kg)} €`).join(", ")}.`,
        ...(k0.nonPesati ? [`${k0.nonPesati === 1 ? "L'unico capo senza peso è costato" : `I ${k0.nonPesati} capi senza peso costano in media`} ${it(k0.costoCapoNonPesati)} € a capo, i pesati ${it(k0.costoCapoPesati)} €; età media alla macellazione ${it(k0.etaNonPesati, 1)} mesi contro ${it(k0.etaPesati, 1)}.`] : []),
        `Il costo di nascita pesa ${it(somma(Object.values(k0.nascita)) / k0.kg)} € per kg di carcassa.`,
        "Il prezzo è quello fatturato alla società del gruppo che riceve le carcasse: il valore vero della carne si realizza più avanti.",
      ],
      cause: [["dimostrata", `Le prime voci del chilo sono ${Object.entries(k0.aree).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([a]) => a.toLowerCase()).join(" e ")}.`],
        ...(k0.nonPesati && k0.costoCapoNonPesati > k0.costoCapoPesati * 1.3 ? [["dimostrata", "I capi senza peso sono i più costosi: il costo per kg dei soli pesati è più basso del vero."]] : [])],
      fare: ["Inserire nell'app il peso della carcassa di ogni capo macellato.", "Agire sulle prime voci del chilo e sull'età di macellazione.", "Calcolare il valore della carne alla vendita finale nel gruppo."],
      vale: `Ogni 0,10 € per kg vale circa ${it(0.1 * k0.kgStimati, 0)} € l'anno con i chili del ${anno}.` });
  }
  // 2) Età alla macellazione
  const soglia = SOGLIA_ETA[specie];
  const nati0 = capi0.filter(c => !c.riproduttore && c.natoInAzienda && c.eta !== null), nati1 = capi1.filter(c => !c.riproduttore && c.natoInAzienda && c.eta !== null);
  const vecchi0 = nati0.filter(c => c.eta >= soglia), vecchi1 = nati1.filter(c => c.eta >= soglia);
  const etaPiuCara = eta.filter(e => e.da >= soglia && e.perKg !== null).sort((a, b) => b.perKg - a.perKg)[0];
  // solo se l'età con il chilo più economico è sotto la soglia: allora uscire tardi costa davvero di più
  if (nati0.length >= 5 && vecchi0.length / nati0.length >= 0.2 && etaPiuCara && P && migliore && migliore.da < soglia && etaPiuCara.perKg > migliore.perKg) {
    const gruppo = c => (c.tipo === "unita" ? String(c.codice).slice(0, -2) : `nati a ${NOMI_MESI[parseInt(String(c.nascita).slice(5, 7)) - 1]} ${String(c.nascita).slice(0, 4)}`);
    const conta = {}; vecchi0.forEach(c => { const g = gruppo(c); conta[g] = (conta[g] || 0) + 1; });
    const top = Object.entries(conta).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const mesiNascita = {}; vecchi0.forEach(c => { const m = String(c.nascita).slice(0, 7); mesiNascita[m] = (mesiNascita[m] || 0) + 1; });
    const topMesi = Object.entries(mesiNascita).sort((a, b) => b[1] - a[1]).slice(0, 2);
    const concentrati = somma(topMesi.map(x => x[1]));
    const annoNascita = topMesi.length ? parseInt(topMesi[0][0]) : anno - 1;
    const nm = rip.nascitePerMese(annoNascita);
    const usciteMese = Array(12).fill(0); capi0.filter(c => !c.riproduttore).forEach(c => { usciteMese[parseInt(String(c.uscita).slice(5, 7)) - 1]++; });
    const usciteOk = usciteMese.filter(x => x > 0);
    critiche.push({ peso: vecchi0.length * ((etaPiuCara.costoMedio || 0) - (migliore ? migliore.costoMedio : 0)), liv: "alta", stato: vecchi1.length / Math.max(1, nati1.length) < vecchi0.length / nati0.length ? "peggiora" : "stabile",
      t: `${N.Plurale} macellati troppo tardi`,
      serie: [[String(anno - 1), `${it(nati1.length ? vecchi1.length / nati1.length * 100 : 0, 1)}% (${vecchi1.length} su ${nati1.length})`], [String(anno), `${it(vecchi0.length / nati0.length * 100, 1)}% (${vecchi0.length} su ${nati0.length})`]],
      etichetta: `nati in azienda macellati dopo i ${soglia} mesi`, grafico: "eta",
      dato: `Nel ${anno} sono usciti dopo i ${soglia} mesi di età ${vecchi0.length} ${N.plurale} nati in azienda su ${nati0.length}; nel ${anno - 1} erano ${vecchi1.length} su ${nati1.length}.`,
      costo: `Il costo di un chilo di carcassa per età: ${eta.filter(e => e.perKg !== null).map(e => `${it(e.perKg)} € ${e.classe}`).join(", ")}. Prezzo di vendita ${it(P)} €.`,
      indagine: [`Da dove vengono: ${top.map(([g, n]) => `${g} (${n})`).join(", ")}.`,
        ...(topMesi.length ? [`${concentrati} dei ${vecchi0.length} sono nati in due soli mesi: ${topMesi.map(([m, n]) => `${NOMI_MESI[parseInt(m.slice(5, 7)) - 1]} ${m.slice(0, 4)} (${n})`).join(" e ")}.`] : []),
        ...(somma(nm) ? [`Nati vivi del ${annoNascita} mese per mese: ${nm.map((n, i) => n ? `${NOMI_MESI[i]} ${n}` : null).filter(Boolean).join(", ")}.`] : []),
        ...(usciteOk.length ? [`Nel ${anno} si sono macellati da ${Math.min(...usciteOk)} a ${Math.max(...usciteOk)} capi al mese.`] : [])],
      cause: [...(concentrati >= vecchi0.length * 0.5 ? [["dimostrata", "I capi usciti tardi vengono soprattutto da picchi di nascite concentrati in pochi mesi."], ["probabile", "Nei mesi di picco nascono più capi di quanti se ne possano macellare quando sono pronti: i capi in più restano in stalla e mangiano per mesi."]] : [["probabile", "Uscite rinviate per ragioni di vendita o di spazio."]]),
        ["ipotesi", "Accrescimento lento: mancano le pesate nell'app per dimostrarlo."]],
      fare: ["Distribuire le coperture durante l'anno, così che le nascite seguano il ritmo delle macellazioni.", "Nei mesi di picco concordare con il cliente ritiri più grandi.", `Pesare la carcassa di tutti i capi oltre i ${soglia} mesi.`],
      vale: `Un capo uscito ${migliore ? migliore.classe : "giovane"} è costato in media ${it(migliore ? migliore.costoMedio : null)} €; ${etaPiuCara.classe} ${it(etaPiuCara.costoMedio)} €.` });
  }
  // 3) Capi leggeri (bovini)
  if (specie === "bovino") {
    const leggeri = eta.find(e => e.da === 0 && e.kgMedio !== null);
    const pesanti = eta.filter(e => e.kgMedio !== null && e.da >= 24).sort((a, b) => b.kgMedio - a.kgMedio)[0];
    if (leggeri && pesanti && leggeri.capi >= 3 && leggeri.kgMedio < pesanti.kgMedio * 0.6) critiche.push({ peso: leggeri.capi * 1000, liv: "alta", stato: "da correggere", t: "Capi macellati troppo leggeri",
      serie: eta.filter(e => e.kgMedio !== null).map(e => [e.classe, `${it(e.kgMedio, 1)} kg · ${it(e.perKg)} €/kg`]), etichetta: "carcassa media e costo per kg, nati in azienda", grafico: "eta",
      dato: `Nel ${anno} ${leggeri.capi} dei ${nati0.length} bovini nati in azienda e macellati avevano ${leggeri.classe} e una carcassa media di ${it(leggeri.kgMedio, 1)} kg: il loro chilo è costato ${it(leggeri.perKg)} €.`,
      costo: `Il costo di nascita (${it(leggeri.nascitaMedia, 0)} € a capo) su ${it(leggeri.kgMedio, 1)} kg pesa ${it(leggeri.nascitaMedia / leggeri.kgMedio)} € al kg; su ${it(pesanti.kgMedio, 1)} kg ${it(pesanti.nascitaMedia / pesanti.kgMedio)} €.`,
      indagine: [`Peso medio della carcassa: ${it(k1.pesoMedio, 1)} kg nel ${anno - 1}, ${it(k0.pesoMedio, 1)} kg nel ${anno}.`, `Il ${RIFERIMENTI.vitelloneIGP.fonte} prevede la macellazione tra ${RIFERIMENTI.vitelloneIGP.etaMinMesi} e ${RIFERIMENTI.vitelloneIGP.etaMaxMesi} mesi, con resa ${RIFERIMENTI.vitelloneIGP.resaMin}–${RIFERIMENTI.vitelloneIGP.resaMax}%.`],
      cause: [["dimostrata", "Uscire con carcasse leggere spalma il costo di nascita su pochi chili."], ["ipotesi", "Uscite anticipate per vendita o spazio; accrescimento lento al pascolo (mancano le pesate)."]],
      fare: ["Programmare le uscite a peso, non a data: 300–350 kg di carcassa entro i 24 mesi.", "Finissaggio negli ultimi mesi.", "Pesate a date fisse."],
      vale: `Portare un capo da ${it(leggeri.kgMedio, 0)} a ${it(pesanti.kgMedio, 0)} kg di carcassa abbassa il solo costo di nascita di circa ${it(leggeri.nascitaMedia / leggeri.kgMedio - pesanti.nascitaMedia / pesanti.kgMedio, 0)} € per kg.` });
  }
  // 4) Riproduzione
  const m0 = rip.mandria(anno), m1 = rip.mandria(anno - 1);
  if (specie === "suino" && r0.parti >= 5 && r1.parti >= 5) {
    const npp0 = r0.nati / r0.parti, npp1 = r1.nati / r1.parti;
    const f0 = rip.adulte(anno).length, f1 = rip.adulte(anno - 1).length;
    if (npp0 < npp1 * 0.9) critiche.push({ peso: (npp1 - npp0) * r0.parti * (m0 ? num(m0.costo_nascita_per_nato) : 0), liv: "alta", stato: "peggiora", t: "Nidiate più piccole",
      serie: [r1, r0, rNext].filter(r => r.parti).map(r => [r.anno === anno + 1 ? `${r.anno} in corso` : String(r.anno), it(r.nati / r.parti)]), etichetta: "nati vivi per parto",
      dato: `Nel ${anno} i parti sono stati ${r0.parti} (${r1.parti} nel ${anno - 1}) ma i nati vivi ${r0.nati} (${r1.nati}): ${it(npp0)} per parto contro ${it(npp1)}.${f0 ? ` Nati per femmina presente al 1° luglio con più di 10 mesi o già partorita: ${it(r1.nati / Math.max(1, f1))} nel ${anno - 1} (${f1} femmine), ${it(r0.nati / f0)} nel ${anno} (${f0}).` : ""}`,
      costo: m0 && m1 ? `Il costo di nascita per nato è passato da ${it(num(m1.costo_nascita_per_nato))} € a ${it(num(m0.costo_nascita_per_nato))} €.` : "Il costo delle madri si divide su meno figli.",
      indagine: [`Parti con zero nati vivi: ${r1.aZero.n} su ${r1.parti} nel ${anno - 1}, ${r0.aZero.n} su ${r0.parti} nel ${anno}${r0.aZero.length ? ` (${r0.aZero.join(", ")})` : ""}.`,
        ...(m0 ? [`Riproduttori in carriera senza figli nell'anno: ${num(m0.riproduttori_senza_figli)}.`] : [])],
      cause: [["dimostrata", "Il calo viene dalle nidiate più piccole e dai parti a zero, non da meno parti."], ["ipotesi", "Alimentazione delle scrofe in gestazione e allattamento povera di proteina (orzo prevalente)."], ["ipotesi", "Scrofe che ripetono parti a zero; nati morti o parti non registrati."]],
      fare: ["Controllare con Sborchia i parti a zero e quelli non registrati.", "Valutare la riforma delle scrofe con parti ripetuti a zero.", "Razione delle scrofe con più proteina in fine gestazione e allattamento."],
      vale: m0 ? `Con ${it(npp1)} nati per parto come nel ${anno - 1}, i ${r0.parti} parti avrebbero dato ${it((npp1 - npp0) * r0.parti, 0)} suinetti in più e il costo di nascita sarebbe stato circa ${it(num(m0.costo_mandria) / (npp1 * r0.parti), 0)} € invece di ${it(num(m0.costo_nascita_per_nato))} €.` : "" });
  }
  if (specie === "bovino" && m0 && num(m0.nati) > 0) {
    const adulte0 = rip.adulte(anno), ip = rip.interparto(anno), sp = rip.senzaParto(anno);
    const rif = RIFERIMENTI.vitelloRistallo, inc = rif.incrociNazionali, lim = rif.limousineNazionali;
    const minR = inc.pesoMin * inc.prezzoMin, maxR = lim.pesoMax * lim.prezzoMax, cn = num(m0.costo_nascita_per_nato);
    if (cn > maxR) critiche.push({ peso: (cn - maxR) * num(m0.nati), liv: "alta", stato: m1 && cn < num(m1.costo_nascita_per_nato) ? "migliora, ma resta alto" : "peggiora", t: "Un vitello nato in azienda costa più di uno comprato già svezzato",
      serie: [anno - 3, anno - 2, anno - 1, anno].map(y => rip.mandria(y)).filter(Boolean).map(m => [String(m.anno), `${it(num(m.costo_nascita_per_nato))} €`]), etichetta: "costo di nascita di un vitello (Report Riproduttori)",
      dato: `Nel ${anno} il mantenimento delle vacche e dei tori (${it(num(m0.costo_mandria))} €) diviso per ${num(m0.nati)} vitelli nati vivi dà ${it(cn)} € a vitello alla nascita.`,
      costo: `Sul ${rif.fonte} un vitello da ristallo incrocio nazionale di ${inc.pesoMin}–${inc.pesoMax} kg vale ${it(inc.prezzoMin)}–${it(inc.prezzoMax)} € al kg vivo, cioè circa ${it(minR, 0)}–${it(inc.pesoMax * inc.prezzoMax, 0)} €; un Limousine nazionale di ${lim.pesoMin}–${lim.pesoMax} kg circa ${it(lim.pesoMin * lim.prezzoMin, 0)}–${it(maxR, 0)} €.`,
      indagine: [`Vacche adulte (oltre 30 mesi o già partorite): ${adulte0.length}. Parti nell'anno: ${r0.parti}. Senza parto: ${sp.length}${sp.length ? ` (${sp.slice(0, 10).join(", ")})` : ""}.`,
        ...(ip ? [`Interparto medio dei parti del ${anno}: ${it(ip.media, 0)} giorni su ${ip.n} vacche (obiettivo ${RIFERIMENTI.interpartoObiettivoGiorni.valore}).`] : []),
        ...(adulte0.length ? [`Costo della mandria per vacca adulta: circa ${it(num(m0.costo_mandria) / adulte0.length, 0)} € l'anno.`] : [])],
      cause: [...(adulte0.length && num(m0.costo_mandria) / adulte0.length > maxR ? [["dimostrata", `Anche con un vitello per vacca all'anno ogni vitello costerebbe circa ${it(num(m0.costo_mandria) / adulte0.length, 0)} €: è alto il costo di tenere una vacca.`]] : []),
        ["dimostrata", "Interparti lunghi e vacche senza parto alzano ancora il costo per vitello."], ["ipotesi", "Monta senza stagione definita: parti sparsi e vacche vuote non individuate."]],
      fare: ["Diagnosi di gravidanza dopo la monta; riformare le vacche vuote per due stagioni.", "Stagione di monta definita.", "Confrontare ogni anno il costo del vitello prodotto con il prezzo del vitello da ristallo e decidere quanti produrne e quanti comprarne."],
      vale: adulte0.length ? `Con ${adulte0.length} vacche e un vitello ciascuna il costo per vitello sarebbe sceso da ${it(cn)} € a circa ${it(num(m0.costo_mandria) / adulte0.length, 0)} €.` : "" });
  }
  if (specie === "ovino") {
    const f0 = rip.adulte(anno).length, f1 = rip.adulte(anno - 1).length, rif = RIFERIMENTI.sopravissana;
    if (f0 && r0.parti / f0 < rif.fertilita * 0.8) critiche.push({ peso: 5e5, liv: "alta", stato: f1 && r1.parti / f1 > r0.parti / f0 ? "peggiora" : "basso", t: "Poche nascite per pecora",
      serie: rip.anni.filter(r => r.parti).map(r => [r.anno > anno ? `${r.anno} in corso` : String(r.anno), `${r.parti} parti · ${r.nati} nati`]), etichetta: "parti e agnelli nati vivi registrati",
      dato: `Con ${f0} femmine presenti al 1° luglio con più di 12 mesi o già partorite (${f1} nel ${anno - 1}), i parti sono stati ${it(f1 ? r1.parti / f1 : null)} per femmina nel ${anno - 1} e ${it(r0.parti / f0)} nel ${anno}; agnelli nati per parto ${it(r1.parti ? r1.nati / r1.parti : null)} e ${it(r0.parti ? r0.nati / r0.parti : null)}.`,
      costo: "Il costo del gregge si divide su pochi agnelli.",
      indagine: [`La ${rif.fonte} indica prolificità ${it(rif.prolificita * 100, 0)}% e fertilità ${it(rif.fertilita * 100, 0)}%.`],
      cause: [["ipotesi", "Parti non registrati nell'app."], ["ipotesi", "Pecore con alimentazione povera di proteina."], ["ipotesi", "Pecore improduttive non riformate."]],
      fare: ["Verificare con Sborchia i parti mancanti.", "Riformare le pecore vuote.", "Integrazione proteica mirata in fine gestazione."],
      vale: `Con 1 parto per pecora e ${it(rif.prolificita, 1)} agnelli per parto, ${f0} pecore darebbero circa ${it(f0 * rif.prolificita, 0)} agnelli.` });
  }
  // 5) Dati mancanti: vendite fatturate ma nessun capo macellato nell'app
  if (prezzo && prezzo.anno === anno && k0.capi === 0) critiche.push({ peso: 9e6, liv: "alta", stato: "manca il dato", t: `${N.Gli} venduti non sono registrati nell'app`,
    serie: [[String(anno - 1), `${k1.capi} macellati nell'app`], [String(anno), `0 nell'app · ${it(prezzo.kg, 2)} kg fatturati`]], etichetta: "capi macellati registrati nell'app",
    dato: `Le fatture del ${anno} contano ${it(prezzo.kg, 2)} kg di carcassa venduti per ${it(prezzo.euro)} €; nell'app nessun capo risulta macellato nel ${anno}.`,
    costo: "Senza i capi il programma non può calcolare il costo per capo né il costo per kg.",
    indagine: m0 ? [`Il Report Riproduttori del ${anno} conta ${num(m0.nati)} nati, con ${r0.parti} parti registrati.`] : [], cause: [["dimostrata", "I capi nati non vengono creati nell'app né chiusi con l'uscita al macello."]],
    fare: ["Registrare ogni capo alla nascita e la sua uscita con il peso della carcassa."], vale: "È la condizione per sapere se la specie guadagna o perde." });
  if (prezzo && prezzo.anno === anno && k0.capi === 0 && c0.totale > 0) critiche.push({ peso: 8e6, liv: "alta", stato: "stima", t: `Ogni chilo venduto costa circa ${it(c0.totale / prezzo.euro, 1)} volte quello che rende`,
    serie: [["costi", `${it(c0.totale)} €`], ["vendite", `${it(prezzo.euro)} €`]], etichetta: "stima sull'anno",
    dato: `Nel ${anno} ${N.Gli.toLowerCase()} sono costati ${it(c0.totale)} € e le vendite fatturate sono ${it(prezzo.euro)} €: ${it(c0.totale / prezzo.kg)} € per kg di carcassa venduto contro ${it(P)} €.`,
    costo: `Circa ${it(c0.totale - prezzo.euro, 0)} € di differenza nell'anno.`, indagine: ["È una stima sull'anno: non tiene conto dei capi tenuti in azienda né della crescita del gregge."],
    cause: [["probabile", "Poche nascite e costi alti per un gregge piccolo."]], fare: ["Registrare i dati per avere il costo vero per capo."], vale: "" });
  // 6) Lavoro prima voce
  const ordine = Object.entries(c0.aree).sort((a, b) => b[1] - a[1]);
  if (ordine[0] && ordine[0][0] === "Lavoro") critiche.push({ peso: c0.aree.Lavoro * 0.5, liv: "alta", stato: c1 && perUba(c0, "Lavoro") < perUba(c1, "Lavoro") ? "migliora" : "stabile", t: "Il lavoro è la prima voce di costo",
    serie: anniStoria.map(y => [String(y), `${it((C(y).aree.Lavoro || 0) / C(y).totale * 100, 1)}%`]), etichetta: `peso del lavoro sul costo ${N.dei}`,
    dato: `Nel ${anno} il lavoro attribuito ${N.ai} è ${it(c0.aree.Lavoro)} €, il ${it(c0.aree.Lavoro / c0.totale * 100, 1)}% del costo: ${it(perUba(c0, "Lavoro"))} € per UBA${k0.kg ? ` e ${it((k0.aree.Lavoro || 0) / k0.kg)} € per kg di carcassa` : ""}. L'alimentazione (comprata più coltivazione) è il ${it(pAlim0 / c0.totale * 100, 1)}%.`,
    costo: "È una spesa fissa: cresce a gradini con le assunzioni e si diluisce quando crescono gli animali.",
    indagine: [`Il programma divide il lavoro per UBA: ${N.ai} va il ${it(c0.quotaUba * 100, 2)}% perché sono il ${it(c0.quotaUba * 100, 2)}% delle UBA dell'azienda.`, "La ripartizione per specie con le ore reali non esiste ancora."],
    cause: [["dimostrata", "La regola di ripartizione per UBA decide quanto lavoro va a ogni specie."], ["ipotesi", "Le ore reali per specie possono essere diverse: al pascolo servono meno ore per UBA."]],
    fare: ["Stimare con Sborchia le ore settimanali per specie.", "Crescere nel numero di capi con lo stesso personale."], vale: "Non cambia il costo dell'azienda, ma cambia quale specie rende e quale no." });
  // 7) Alimentazione comprata per UBA in forte aumento
  if (c1 && perUba(c1, "Alimentazione comprata") > 0 && perUba(c0, "Alimentazione comprata") > perUba(c1, "Alimentazione comprata") * 1.25) {
    const d = (perUba(c0, "Alimentazione comprata") - perUba(c1, "Alimentazione comprata")) * c0.ubaMedie;
    critiche.push({ peso: d, liv: "alta", stato: "peggiora", t: "Alimentazione comprata in forte aumento", serie: anniStoria.map(y => [String(y), `${it(perUba(C(y), "Alimentazione comprata"))} €`]), etichetta: "alimentazione comprata per UBA",
      dato: `L'alimentazione comprata per UBA ${N.dei} è passata da ${it(perUba(c1, "Alimentazione comprata"))} € a ${it(perUba(c0, "Alimentazione comprata"))} € (${segno(1)}${it(pct(perUba(c1, "Alimentazione comprata"), perUba(c0, "Alimentazione comprata")), 1)}%).`,
      costo: `${it(d)} € in più nell'anno.`, indagine: q4 ? [`Chili di mangime per UBA: ${it(q4.a.kgPerUba, 1)} nel ${anno - 1}, ${it(q4.b.kgPerUba, 1)} nel ${anno}.`] : [],
      cause: [["ipotesi", "Pascolo scarso, sostituito da mangime e fieno comprati."], ["ipotesi", "Mangime dato a tutto il gruppo invece che ai capi che ne hanno bisogno."]],
      fare: ["Razioni per gruppo.", "Registrare nell'app i chili di mangime dati a ogni gruppo."], vale: `${it(d)} € l'anno.` });
  }
  // 8) Stesso mangime da fornitori diversi a prezzi diversi
  const perProdotto = {};
  dati.acquisti.filter(r => r.anno === anno && r.tipo === "PASSIVA" && r.kg > 0 && (r.centro_costo || "").trim() === "Mangimi" && quotaDestinazione(r.destinazione, specie, c0.ubaPer) > 0)
    .forEach(r => { const k = String(r.descrizione).trim().toUpperCase(); perProdotto[k] = perProdotto[k] || {}; const f = perProdotto[k][r.fornitore] = perProdotto[k][r.fornitore] || { eur: 0, kg: 0 }; f.eur += r.totale; f.kg += r.kg; });
  for (const [prod, fs] of Object.entries(perProdotto)) {
    const l = Object.entries(fs).map(([f, v]) => ({ f, kg: v.kg, p: v.eur / v.kg })); if (l.length < 2) continue;
    l.sort((a, b) => a.p - b.p); const caro = l[l.length - 1], eco = l[0];
    if (caro.p > eco.p * 1.05) { const extra = (caro.p - eco.p) * caro.kg; if (extra < 100) continue;
      critiche.push({ peso: extra, liv: "media", stato: "da verificare", t: "Stesso mangime, prezzi diversi", serie: l.map(x => [x.f, `${it(x.p, 4)} €/kg`]), etichetta: `prezzo al kg di «${prod}» nel ${anno}`,
        dato: `«${prod}» nel ${anno} è costato ${it(caro.p, 4)} € al kg da ${caro.f} (${it(caro.kg, 0)} kg) e ${it(eco.p, 4)} € al kg da ${eco.f} (${it(eco.kg, 0)} kg).`,
        costo: `${it(extra)} € in più per averlo comprato al prezzo più alto.`, indagine: ["Il confronto è sulla stessa descrizione del prodotto in fattura."], cause: [["probabile", "Prezzi non confrontati tra i fornitori prima dell'ordine."]],
        fare: ["Chiedere il prezzo a tutti i fornitori prima di ogni ordine.", "Verificare sui cartellini che i prodotti siano uguali."], vale: `${it(extra)} € nel ${anno}.` }); }
  }
  // 9) Farina d'orzo comprata contro granella
  const farina = dati.acquisti.filter(r => r.anno === anno && r.tipo === "PASSIVA" && /ORZO/i.test(r.descrizione || "") && /FARINA/i.test(r.descrizione || ""));
  const trasporto = dati.acquisti.filter(r => r.anno === anno && r.tipo === "PASSIVA" && /TRASPORT/i.test(r.descrizione || "") && farina.some(f => f.fornitore === r.fornitore));
  const granellaAnno = y => dati.acquisti.filter(r => r.anno === y && r.tipo === "PASSIVA" && r.kg > 0 && /ORZO/i.test(r.descrizione || "") && /(GRANELLA|NATURALE)/i.test(r.descrizione || ""));
  const granella = granellaAnno(anno).length ? granellaAnno(anno) : granellaAnno(anno - 1);
  const kgF = somma(farina.map(r => r.kg)), eurF = somma(farina.map(r => r.totale)) + somma(trasporto.map(r => r.totale)), kgG = somma(granella.map(r => r.kg)), eurG = somma(granella.map(r => r.totale));
  if (specie === "suino" && kgF > 0 && kgG > 0 && eurF / kgF > eurG / kgG * 1.2) {
    const extra = (eurF / kgF - eurG / kgG) * kgF;
    critiche.push({ peso: extra * c0.quotaUba, liv: "media", stato: trasporto.length ? "con trasporto" : "da verificare", t: "Farina d'orzo comprata invece della granella",
      serie: [["farina con trasporto", `${it(eurF / kgF, 4)} €/kg`], ["granella", `${it(eurG / kgG, 4)} €/kg`]], etichetta: `prezzo al kg nel ${anno}`,
      dato: `Nel ${anno} sono stati comprati ${it(kgF, 0)} kg di farina d'orzo a ${it(eurF / kgF, 4)} € al kg compreso il trasporto (${it(somma(trasporto.map(r => r.totale)))} €); la granella d'orzo è costata ${it(eurG / kgG, 4)} € al kg${granella[0].anno !== anno ? ` (prezzo del ${granella[0].anno})` : ""}.`,
      costo: `Fino a ${it(extra, 0)} € l'anno per tutto l'allevamento, prima del costo di macinatura.`, indagine: ["L'orzo raccolto da Podere va alla Cooperativa Ceri tramite Muratella e torna come farina (giro dell'orzo).", "Il costo della macinatura in azienda non è noto."],
      cause: [["dimostrata", "Si pagano macinatura e trasporto su un prodotto in gran parte nostro."]], fare: ["Preventivo per un mulino o per la macinatura conto terzi.", "Ordini più grandi senza trasporto."], vale: `Fino a ${it(extra, 0)} € l'anno, meno la macinatura.` });
  }
  // 10) Fieno comprato (bovini e ovini)
  if (specie !== "suino") {
    const fieno = y => { const rr = dati.acquisti.filter(r => r.anno === y && r.tipo === "PASSIVA" && (r.centro_costo || "").trim() === "Foraggio"); return { kg: somma(rr.map(r => r.kg)), eur: somma(rr.map(r => r.totale)), forn: [...new Set(rr.map(r => r.fornitore))] }; };
    const f0 = fieno(anno), f1 = fieno(anno - 1);
    if (specie === "bovino" && f0.kg > 50000) critiche.push({ peso: f0.eur, liv: "media", stato: "da verificare", t: "Fieno comprato nonostante i campi",
      serie: [anno - 2, anno - 1, anno, anno + 1].map(y => { const f = fieno(y); return [y > anno ? `${y} in corso` : String(y), f.kg ? `${it(f.kg, 0)} kg` : "nessun acquisto"]; }), etichetta: "fieno comprato per bovini e ovini",
      dato: `Nel ${anno} sono stati comprati ${it(f0.kg, 0)} kg di fieno (${it(f0.eur)} €, a ${it(f0.eur / f0.kg * 100)} € al quintale) da ${f0.forn.join(", ")}.${f1.kg ? "" : ` Nel ${anno - 1} nessun acquisto.`}`,
      costo: `Si aggiunge al costo della coltivazione dei campi, che ${N.ai} vale ${it(perUba(c0, "Coltivazione (alimenti prodotti in azienda)"))} € per UBA.`,
      indagine: ["Il fieno prodotto nei campi di Podere si vede nel Report di Analisi delle Coltivazioni."], cause: [["ipotesi", "Raccolto insufficiente o carico di animali cresciuto più dei foraggi prodotti."]],
      fare: ["Bilancio foraggero: fieno prodotto più comprato contro il fabbisogno.", "Confrontare il costo del fieno prodotto con quello comprato."], vale: `${it(f0.eur)} € nel ${anno}.` });
  }
  // 11) Nessuna misura dell'accrescimento
  if (!dati.pesate) critiche.push({ peso: 1, liv: "media", stato: "manca la misura", t: "Nessuna misura dell'accrescimento",
    serie: q4 ? [[String(anno - 1), `${it(q4.a.kgPerUba, 1)} kg`], [String(anno), `${it(q4.b.kgPerUba, 1)} kg`]] : [], etichetta: "chili di mangime comprato per UBA",
    dato: "Nell'app le pesate e i chili di alimento per gruppo sono vuoti: non si sa se gli animali crescono di più o di meno.", costo: "Senza questa misura non si può dire se una razione costa meno a parità di accrescimento.",
    indagine: ["Il mangime «Generali» è diviso tra le specie per UBA, non per consumo vero."], cause: [["dimostrata", "Mancano i dati di peso e di consumo per gruppo."]],
    fare: ["Pesate a date fisse di un campione per gruppo.", "Registrare i chili di mangime dati a ogni gruppo."], vale: `È la base per ridurre l'alimentazione, che ${N.ai} vale il ${it(pAlim0 / c0.totale * 100, 1)}% del costo.` });
  critiche.sort((a, b) => (a.liv === b.liv ? b.peso - a.peso : a.liv === "alta" ? -1 : 1));
  // l'eventuale grafico per età va sulla prima criticità che lo chiede
  let grafico = false; critiche.forEach(c => { if (c.grafico && !grafico) grafico = true; else delete c.grafico; });

  // ── Segnali nuovi: aree per UBA peggiorate più del 10% ──
  if (c1) for (const a of AREE) {
    const v0 = perUba(c0, a), v1 = perUba(c1, a);
    if (!(v1 > 0) || !(v0 > v1 * (1 + SOGLIA_SEGNALE)) || (v0 - v1) * c0.ubaMedie < 200) continue;
    const vv0 = c0.voci[a] || {}, vv1 = c1.voci[a] || {};
    const cause = Object.keys({ ...vv0, ...vv1 }).map(k => [k, (vv0[k] || 0) / c0.ubaMedie - (vv1[k] || 0) / c1.ubaMedie, vv1[k] || 0, vv0[k] || 0]).sort((x, y) => y[1] - x[1]).slice(0, 3).filter(x => x[1] > 0);
    let testo = `Da ${it(v1)} € a ${it(v0)} € per UBA. Le voci che crescono di più: ${cause.map(([k, , p, n]) => `${k} da ${it(p)} € a ${it(n)} €`).join("; ")}.`;
    if (a === "Ammortamenti") {
      const nuovi = (base.g.quote || []).filter(q => q.anno === anno && num(q.quota) > 0 && !(base.g.quote || []).some(p => p.cespite_id === q.cespite_id && p.anno === anno - 1 && num(p.quota) > 0))
        .map(q => ({ q: num(q.quota), c: dati.cespiti.get(q.cespite_id) })).filter(x => x.c && (x.c.specie || []).some(s => s === N.Plurale || s === "Generale")).sort((x, y) => y.q - x.q).slice(0, 4);
      if (nuovi.length) testo += ` Nuovi cespiti in ammortamento: ${nuovi.map(x => `${String(x.c.descrizione).slice(0, 60).toLowerCase()} (${it(x.q)} € l'anno)`).join("; ")}.`;
    }
    segnali.push({ t: `${a} per UBA ${segno(1)}${it(pct(v1, v0), 1)}%`, testo });
  }

  // ── Affidabilità ──
  if (k0.capi) affidabilita.push(k0.nonPesati > k0.capi * 0.2 ? ["b-rosso", "● da sistemare", `Peso della carcassa mancante per ${k0.nonPesati} capi all'ingrasso su ${k0.capi} nel ${anno}: il costo per kg dei soli pesati può essere più basso del vero.`] : ["b-verde", "● dato quasi completo", `Peso della carcassa presente per ${k0.pesati} capi all'ingrasso su ${k0.capi} nel ${anno}.`]);
  affidabilita.push(["b-arancio", "▲ da verificare", "Il lavoro, la coltivazione e i mangimi intestati a «Generali» si dividono tra le specie per UBA, non per consumo o ore reali."]);
  [anno - 4, anno - 3, anno - 2, anno - 1, anno].forEach(y => { const m = rip.mandria(y); const cn = m ? num(m.costo_nascita_per_nato) : 0; const altri = [anno - 4, anno - 3, anno - 2, anno - 1, anno].map(rip.mandria).filter(Boolean).map(x => num(x.costo_nascita_per_nato)).filter(x => x > 0).sort((a, b) => a - b);
    const med = altri.length ? altri[Math.floor(altri.length / 2)] : 0; if (cn > 0 && med > 0 && cn > med * 3) affidabilita.push(["b-rosso", "● da sistemare", `Costo di nascita del ${y}: ${it(cn)} € per nato con soli ${num(m.nati)} nati registrati. Va controllato se mancano parti di quell'anno.`]); });
  if (k0.riforme) affidabilita.push(["b-verde", "● già considerato", `Le ${k0.riforme} riforme macellate nel ${anno} sono fuori dal costo per kg: il loro mantenimento è già passato ai figli.`]);

  // ── Giudizio ──
  const alte = critiche.filter(c => c.liv === "alta").map(c => c.t.toLowerCase());
  const giudizio = `Nel ${anno} un'UBA ${N.dei} è costata ${it(u0)} €${c1 ? ` (${u0 < u1 ? "−" : "+"}${it(Math.abs(u0 - u1))} € sul ${anno - 1})` : ""}. ` +
    (P && k0.perKg !== null ? `Un chilo di carcassa costa ${it(k0.perKg)} € sui capi pesati${k0.nonPesati ? ` e circa ${it(k0.perKgStima)} € stimato su tutti` : ""}, contro un prezzo di vendita di ${it(P)} €. ` : P ? `Il costo per kg non si può calcolare per capo: mancano i capi macellati nell'app. ` : "") +
    (alte.length ? `Le criticità principali: ${alte.slice(0, 3).join("; ")}. ` : "Non risultano criticità gravi. ") +
    (migliore && P && migliore.perKg < P ? `Dove i tempi sono giusti (${migliore.classe}) il chilo costa ${it(migliore.perKg)} €: è lì che si deve tornare.` : "");

  return { specie, anno, nomi: N, c0, c1, anniStoria: anniStoria.map(y => C(y)), k0, k1, eta, prezzo, q4, buoni, critiche, segnali, affidabilita, giudizio };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Report delle coltivazioni
// ════════════════════════════════════════════════════════════════════════════════════════════════
export async function caricaDatiColtivazioni() {
  const [righe, prezzi] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("v_coltivazione_report_prodotti").select("*").order("campagna").range(da, a)),
    fetchAllPages((da, a) => supabase.from("coltivazione_prezzi_mercato").select("campagna, prodotto, prezzo_q, fonte").order("campagna").range(da, a)),
  ]);
  if (righe.error) throw new Error(righe.error.message);
  return { righe: (righe.data || []).map(r => ({ ...r, q: num(r.quantita_q), costo: num(r.costo_attribuito), prezzo: num(r.prezzo_q), ha: num(r.ettari), resa: num(r.resa_q_ha) })), prezzi: prezzi.data || [] };
}

export function campagneConRaccolto(d) { return [...new Set(d.righe.filter(r => r.q > 0).map(r => r.campagna))].sort(); }

export function analisiColtivazioni(d, campagna) {
  const tutte = campagneConRaccolto(d);
  const prec = tutte.filter(c => c < campagna).pop() || null;
  const R = d.righe.filter(r => r.campagna === campagna), Rp = prec ? d.righe.filter(r => r.campagna === prec) : [];
  const fonte = p => (d.prezzi.find(x => x.campagna === campagna && x.prodotto === p) || {}).fonte || "";
  const perProdotto = (rr) => { const m = {}; rr.filter(r => r.prodotto && r.q > 0).forEach(r => { const x = m[r.prodotto] = m[r.prodotto] || { prodotto: r.prodotto, costo: 0, q: 0, ha: 0, prezzo: r.prezzo }; x.costo += r.costo; x.q += r.q; x.ha += r.ha; }); Object.values(m).forEach(x => { x.costoQ = x.costo / x.q; x.resa = x.ha ? x.q / x.ha : null; }); return m; };
  const P0 = perProdotto(R), P1 = perProdotto(Rp);
  const storia = p => tutte.map(c => { const x = perProdotto(d.righe.filter(r => r.campagna === c))[p]; return x ? [c.slice(2, 4) + "/" + c.slice(7, 9), `${it(x.costoQ)} € · mercato ${it(x.prezzo)} €`] : null; }).filter(Boolean);
  const buoni = [], critiche = [], segnali = [], aff = [];
  const totCosto = somma(R.map(r => r.costo)), totValore = somma(R.filter(r => r.prodotto).map(r => r.q * r.prezzo)), pascoli = somma(R.filter(r => r.pascolato).map(r => r.costo));
  // coltura (stesso campo e coltura) → costi per ettaro
  const colture = c => { const m = new Map(); d.righe.filter(r => r.campagna === c && !r.pascolato).forEach(r => { if (!m.has(r.coltura_campo_id)) m.set(r.coltura_campo_id, r); }); return [...m.values()]; };
  // campi con lo stesso prodotto al doppio del mercato in più campagne
  const gruppiCampo = {};
  d.righe.filter(r => r.prodotto && r.q > 0 && r.prezzo > 0 && !/PAGLIA/i.test(r.prodotto)).forEach(r => { const k = `${r.campo_numero}|${r.prodotto}`; (gruppiCampo[k] = gruppiCampo[k] || []).push(r); });
  const cronici = Object.values(gruppiCampo).filter(l => l.filter(r => r.costo / r.q > r.prezzo * 1.6).length >= 2 && l.some(r => r.campagna === campagna && r.costo / r.q > r.prezzo * 1.6));
  const prodottiCronici = new Set(cronici.map(l => l[0].prodotto));
  for (const x of Object.values(P0).sort((a, b) => b.costo - a.costo)) {
    if (!(x.prezzo > 0)) continue;
    const rapporto = x.costoQ / x.prezzo, campi = R.filter(r => r.prodotto === x.prodotto && r.q > 0);
    if (rapporto < 0.85 && x.costo > 300) buoni.push({ t: `${x.prodotto}: conviene produrlo`, serie: storia(x.prodotto).slice(-3), testo: `Nel ${campagna} è costato ${it(x.costoQ)} € al quintale contro ${it(x.prezzo)} € di mercato${fonte(x.prodotto) ? ` (${fonte(x.prodotto)})` : ""}, con ${it(x.resa, 1)} quintali per ettaro.` });
    const x1 = P1[x.prodotto];
    const sottoprodotto = /PAGLIA/i.test(x.prodotto);
    // se il prodotto è già nella criticità dei campi cronici non si ripete
    if (rapporto > 1.2 && x.costo > 2000 && !sottoprodotto && !prodottiCronici.has(x.prodotto)) {
      const extra = x.costo - x.q * x.prezzo, crollo = x1 && x1.resa && x.resa < x1.resa * 0.7;
      const ctx = (RIFERIMENTI.contestoCampagne[campagna] || []).filter(n => n.prodotto === x.prodotto);
      const col0 = colture(campagna).filter(r => campi.some(c => c.coltura_campo_id === r.coltura_campo_id)), col1 = prec ? colture(prec).filter(r => Rp.some(c => c.prodotto === x.prodotto && c.coltura_campo_id === r.coltura_campo_id)) : [];
      const perHa = (l, k) => { const ha = somma(l.map(r => r.ha)); return ha ? somma(l.map(r => num(r[k]))) / ha : null; };
      critiche.push({ peso: extra, liv: "alta", stato: crollo ? `raccolto crollato nel ${campagna}` : "costa più del mercato", t: crollo ? `${x.prodotto}: raccolto crollato` : `${x.prodotto} prodotto a più del prezzo di mercato`,
        serie: storia(x.prodotto), etichetta: "costo al quintale e prezzo di mercato",
        dato: `Nel ${campagna} ${campi.length} campi (${it(x.ha)} ettari) hanno dato ${it(x.q, 1)} quintali: ${it(x.resa, 1)} quintali per ettaro${x1 ? ` contro ${it(x1.resa, 1)} della campagna prima` : ""}. Il quintale è costato ${it(x.costoQ)} €, il mercato è ${it(x.prezzo)} €.`,
        costo: `Comprarlo al prezzo di mercato sarebbe costato ${it(x.q * x.prezzo)} €: ${it(extra)} € in più.`,
        indagine: [`Rese dei campi: ${campi.map(c => `${c.campo} ${it(c.resa, 1)}`).join(", ")} quintali per ettaro.`,
          ...(col0.length && col1.length ? [`Costo per ettaro della coltura: ${it(perHa(col0, "costo_totale"))} € contro ${it(perHa(col1, "costo_totale"))} €; concime ${it(perHa(col0, "costo_concime"))} € contro ${it(perHa(col1, "costo_concime"))} €; seme ${it(perHa(col0, "costo_seme"))} € contro ${it(perHa(col1, "costo_seme"))} €.`] : []),
          ...ctx.map(n => `${n.testo} (${n.fonte}).`)],
        cause: [...(crollo ? [[ctx.length ? "probabile" : "ipotesi", ctx.length ? "Annata sfavorevole, comune a tutta Italia." : "Annata sfavorevole (siccità, maltempo)."]] : [["dimostrata", "Resa troppo bassa rispetto al costo per ettaro."]]),
          ...(crollo && ctx.length && x1 && 1 - x.resa / x1.resa > ctx[0].calo + 0.1 ? [["ipotesi", `Il nostro calo (${it((1 - x.resa / x1.resa) * 100, 0)}%) è più forte della media italiana: possibili cause nostre (date di semina, terreni, concimazione).`]] : [])],
        fare: ["Confrontare con Sborchia date di semina e di concimazione con la campagna prima.", "Confrontare ogni anno il costo prodotto con quello comprato e decidere quanti ettari dedicarci."],
        vale: `${it(extra)} € nel ${campagna} rispetto al mercato.` });
    }
  }
  if (cronici.length) {
    const prod = cronici[0][0].prodotto, l = cronici.filter(c => c[0].prodotto === prod), ult = l.map(c => c.find(r => r.campagna === campagna)).filter(Boolean);
    const qq = somma(ult.map(r => r.q)), cc = somma(ult.map(r => r.costo)), pp = ult[0].prezzo, ha = somma(ult.map(r => r.ha));
    const altri = d.righe.filter(r => r.prodotto === prod && r.q > 0 && !l.some(c => c[0].campo_numero === r.campo_numero) && r.costo / r.q < r.prezzo * 1.1);
    critiche.push({ peso: cc - qq * pp, liv: "alta", stato: "ogni anno uguale", t: `${prod} al doppio del prezzo di mercato negli stessi campi`,
      serie: tutte.filter(c => l.some(x => x.some(r => r.campagna === c))).map(c => { const v = l.map(x => x.find(r => r.campagna === c)).filter(Boolean); return [c.slice(2, 4) + "/" + c.slice(7, 9), `${it(Math.min(...v.map(r => r.costo / r.q)))}–${it(Math.max(...v.map(r => r.costo / r.q)))} €`]; }), etichetta: `costo al quintale nei campi ${l.map(c => c[0].campo_numero).join(", ")}`,
      dato: `I campi ${ult.map(r => r.campo).join(", ")} (${it(ha, 1)} ettari) danno ${prod.toLowerCase()} a ${it(Math.min(...ult.map(r => r.costo / r.q)))}–${it(Math.max(...ult.map(r => r.costo / r.q)))} € al quintale, con ${it(Math.min(...ult.map(r => r.resa)), 1)}–${it(Math.max(...ult.map(r => r.resa)), 1)} quintali per ettaro. Mercato: ${it(pp)} €.`,
      costo: `Nel ${campagna} ${it(qq, 0)} quintali per ${it(cc)} €: al prezzo di mercato sarebbero costati ${it(qq * pp)} €, cioè ${it(cc - qq * pp)} € in più.`,
      indagine: [...(altri.length ? [`Altri campi con lo stesso prodotto rendono da ${it(Math.min(...altri.map(r => r.resa)), 1)} a ${it(Math.max(...altri.map(r => r.resa)), 1)} quintali per ettaro a ${it(Math.min(...altri.map(r => r.costo / r.q)))}–${it(Math.max(...altri.map(r => r.costo / r.q)))} € al quintale.`] : []),
        ...(ult.every(r => !(num(r.costo_concime) > 0)) ? ["In questi campi non risulta nessuna concimazione."] : [])],
      cause: [["dimostrata", "Resa bassa e costante negli stessi campi."], ["ipotesi", "Terreni poveri o non concimati; esposizione; distanza dal centro aziendale."]],
      fare: ["Analisi del terreno.", "Provare su una parte una concimazione o un'altra coltura e confrontare.", "Valutare se conviene pascolarli."], vale: `${it(cc - qq * pp)} € nel ${campagna} rispetto al mercato.` });
  }
  if (pascoli > 0) critiche.push({ peso: pascoli, liv: "media", stato: "manca la misura", t: "I pascoli costano ma non si sa quanto rendono",
    serie: tutte.map(c => [c.slice(2, 4) + "/" + c.slice(7, 9), `${it(somma(d.righe.filter(r => r.campagna === c && r.pascolato).map(r => r.costo)))} €`]), etichetta: "costo dei campi pascolati",
    dato: `Nel ${campagna} i campi pascolati sono costati ${it(pascoli)} € ma non hanno raccolta: non si sa quanto foraggio danno agli animali.`, costo: "Senza una misura non si può dire se convengono più del fieno comprato.",
    indagine: [], cause: [["dimostrata", "Manca il dato di quanti animali pascolano e per quanti giorni."]], fare: ["Registrare nell'app i giorni di pascolo per gruppo e per campo."], vale: "Dà il valore vero dei pascoli." });
  critiche.sort((a, b) => (a.liv === b.liv ? b.peso - a.peso : a.liv === "alta" ? -1 : 1));
  // segnali: costi per ettaro delle colture cresciuti più del 10%
  if (prec) { const per = (c, k) => { const l = colture(c); const ha = somma(l.map(r => r.ha)); return ha ? somma(l.map(r => num(r[k]))) / ha : 0; };
    [["costo_concime", "Concime"], ["costo_seme", "Seme"], ["costo_lavorazioni", "Lavorazioni"], ["costo_fitosanitario", "Fitosanitari"]].forEach(([k, n]) => { const a = per(prec, k), b = per(campagna, k); if (a > 0 && b > a * 1.1) segnali.push({ t: `${n} per ettaro +${it(pct(a, b), 1)}%`, testo: `Da ${it(a)} € a ${it(b)} € per ettaro coltivato dalla ${prec} alla ${campagna}.` }); }); }
  aff.push(["b-arancio", "▲ da verificare", "Sono i costi della sezione Coltivazioni dell'app: non ancora confrontati con l'area Coltivazione del programma, che finisce nel costo degli animali."]);
  const mancanti = []; for (let y = parseInt(tutte[0]); y < parseInt(campagna); y++) { const c = `${y}/${y + 1}`; if (!tutte.includes(c)) mancanti.push(c); }
  if (mancanti.length) aff.push(["b-rosso", "● da sistemare", `Campagne non caricate: ${mancanti.join(", ")}.`]);
  const provv = d.prezzi.filter(x => x.campagna === campagna && /PROVVISORIO/i.test(x.fonte || "")).map(x => x.prodotto);
  if (provv.length) aff.push(["b-arancio", "▲ da verificare", `Prezzi di mercato provvisori: ${provv.join(", ")}.`]);
  const alte = critiche.filter(c => c.liv === "alta");
  const giudizio = `Nel ${campagna} le coltivazioni sono costate ${it(totCosto)} € contro un valore di mercato dei raccolti di ${it(totValore)} €. ` +
    (buoni.length ? `Convengono: ${buoni.map(b => b.t.split(":")[0].toLowerCase()).join(", ")}. ` : "") + (alte.length ? `Non convengono: ${alte.map(c => c.t.toLowerCase()).join("; ")}.` : "");
  const tabella = Object.values(P0).sort((a, b) => b.costoQ / (b.prezzo || 1) - a.costoQ / (a.prezzo || 1));
  const campi = R.filter(r => r.prodotto && r.q > 0).map(r => ({ campo: `${r.campo_numero} ${r.campo}`, coltura: r.coltura, prodotto: r.prodotto, ha: r.ha, resa: r.resa, costoQ: r.costo / r.q, prezzo: r.prezzo })).sort((a, b) => (b.prezzo ? b.costoQ / b.prezzo : 0) - (a.prezzo ? a.costoQ / a.prezzo : 0));
  const campagneTab = tutte.map(c => { const rr = d.righe.filter(r => r.campagna === c); return { campagna: c, costo: somma(rr.map(r => r.costo)), valore: somma(rr.filter(r => r.prodotto).map(r => r.q * r.prezzo)), pascoli: somma(rr.filter(r => r.pascolato).map(r => r.costo)) }; });
  return { campagna, prec, totCosto, totValore, pascoli, buoni, critiche, segnali, affidabilita: aff, giudizio, tabella, campi, campagneTab };
}
