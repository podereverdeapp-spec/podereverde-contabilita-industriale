// Versione 236 — Calcoli del Break Even (decisioni del Dott. Bizzarri del 07/10/2026, ore 19:44–20:29).
// Un solo modulo per le pagine «Break Even sulla carcassa», «Break Even sul capo vivo» e
// «Riepilogo Costi (Break Even)». Sola lettura: nessuna scrittura nel database.
//
// Regole decise:
// - costi dell'anno divisi in fissi e variabili, per specie, con la stessa ripartizione del Report
//   Costi; ESCLUSE le spese di macello e lavorazione (area «Lavorazioni prodotti allevamento» e il
//   lavoro per la lavorazione delle carni): non sono costi di allevamento, le paga la società che riceve;
// - cespiti di Cavalli, Pollame, Orto o senza imputazione: fuori dai costi degli animali;
// - costo variabile di un capo = acquisto (se comprato) oppure parte variabile della nascita
//   (il costo rimasto dei genitori resta intero, del mantenimento delle madri solo la parte variabile)
//   + parte variabile del mantenimento per i giorni di vita reali;
// - campione del «capo tipo» con i capi anomali esclusi (resa fuori dai limiti, un solo peso,
//   scritta al posto del codice) ma elencati;
// - capi da macellare e capi da tenere in stalla; valore degli animali in stalla.
import { supabase } from "./supabase";
import { fetchAllPages, round2 } from "./parsingUtils";
import { applicaRipartizioneLavoro } from "./ripartizioneLavoro";
import { allocaCostiPerSpecie } from "./calcoloAllocazioneSpecie";
import { normalizzaAnimali, idGenitori, conteggioUnitaPerLotto, costoAcquistoUnitario, eNatoDellaMandria, eUscito } from "./costoAnimale";
import { dataIngressoPresenza } from "./motoreUba";
import { entraNeiCosti } from "./documentiCompetenza";

export const SPECIE = ["bovino", "suino", "ovino"];
export const ETICHETTE = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };
export const AREA_LAVORAZIONI = "Lavorazioni prodotti allevamento";
const CENTRO_LAVORO_CARNI = "Lavoro per la lavorazione delle carni";
// Limiti di resa (peso della carcassa ÷ peso vivo) decisi il 07/10/2026 ore 20:10
export const LIMITI_RESA = { bovino: { min: 50, max: 66 }, suino: { min: 65, max: 85 }, ovino: null };
// Età da cui una femmina conta come «adulta» (madre possibile)
export const ETA_ADULTA_MESI = { bovino: 24, suino: 10, ovino: 12 };
export const DESCRIZIONE_CAMPIONE = {
  bovino: "bovini macellati tra 12 e 24 mesi di età, di tutti gli anni, maschi e femmine insieme",
  suino: "suini macellati con peso vivo oltre 130 kg, di tutti gli anni, animali con matricola e suinetti dei lotti insieme",
  ovino: "ovini macellati, di tutti gli anni",
};

const MESE = 30.44;
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const annoDi = d => (d ? parseInt(String(d).slice(0, 4)) : null);
const giorno = d => (d ? String(d).slice(0, 10) : null);
const giorniTra = (da, a) => (new Date(giorno(a)) - new Date(giorno(da))) / 86400000; // date senza ora: nessuno scarto di fuso
const media = l => (l.length ? l.reduce((s, x) => s + x, 0) / l.length : null);
const somma = l => l.reduce((s, x) => s + x, 0);

// Destinazione del costo di un cespite, secondo la sua imputazione
export function destinazioneCespite(specie) {
  const s = specie || [];
  const tre = SPECIE.filter(sp => s.includes(ETICHETTE[sp]));
  if (tre.length === 1) return ETICHETTE[tre[0]];
  if (tre.length === 2) return { "bovino,ovino": "Bovini e Ovini", "bovino,suino": "Bovini e Suini", "ovino,suino": "Suini e Ovini" }[[...tre].sort().join(",")];
  if (tre.length === 3 || s.includes("Generale")) return "Generali";
  return null; // Cavalli, Pollame, Orto, Nessuno: fuori dai costi degli animali
}

// ── Lettura dei dati (una volta sola) ───────────────────────────────────────────────────────
async function tutte(tabella, colonne, ordine = "id", facoltativa = false) {
  const { data, error } = await fetchAllPages((da, a) => supabase.from(tabella).select(colonne).order(ordine).range(da, a));
  if (error) { if (facoltativa) return null; throw new Error(`${tabella}: ${error.message}`); }
  return data || [];
}

export async function caricaDatiBase() {
  const [fatture, articoli, costiDiretti, quote, cespiti, costiAnimali, mandria, animali, lotti, unita, eventi, vendite, ripartizioni] = await Promise.all([
    tutte("ci_fatture", "id, data, tipo, regolarizzazione_di", "id", true).then(f => f || tutte("ci_fatture", "id, data, tipo")),
    tutte("ci_articoli_fattura", "id, fattura_id, totale_riga, tipo_costo, area, destinazione, centro_costo"),
    tutte("ci_costi_diretti", "id, data, importo, tipo_costo, area, destinazione, centro_costo"),
    tutte("ci_cespiti_ammortamento", "id, cespite_id, anno, quota"),
    tutte("ci_cespiti", "id, specie"),
    tutte("ci_costo_animale_annuale", "id, anno, animale_id, lotto_id, unita_nr, specie, categoria_contabile, uba_giorni, costo_mantenimento, costo_nascita_ereditato, quota_residuo_riproduttori"),
    tutte("ci_costo_nascita_mandria", "id, specie, anno, mantenimento_riproduttori, quota_residuo_riproduttori", "id", true),
    tutte("animali", "id, bdn, nome, specie, sesso, nascita, stato, data_uscita, data_ingresso, provenienza, riproduttore, madre_id, padre_id, prezzo_acquisto, peso_carcassa, peso_vivo_uscita, note"),
    tutte("lotti_suini", "id, codice, codice_lotto, specie, data_parto, madre_id, padre_id, tipo_provenienza, prezzo_acquisto"),
    tutte("suini_lotto", "id, lotto_id, nr, bdn, codice_completo, sesso, stato, data_uscita, peso_vivo_uscita, peso_carcassa"),
    tutte("eventi_riproduttivi", "id, animale_id, tipo_evento, data_evento, nati_vivi", "id", true),
    tutte("ci_dati_vendita_ingrasso", "id, animale_id, lotto_id, unita_nr, prezzo_vendita_kg_reale", "id", true),
    tutte("ci_ripartizione_lavoro", "*", "anno", true),
  ]);
  return preparaBase({ fatture, articoli, costiDiretti, quote, cespiti, costiAnimali, mandria, animali, lotti, unita, eventi, vendite, ripartizioni });
}

// ── Preparazione: tutto ciò che non dipende dall'anno scelto ─────────────────────────────────
export function preparaBase(g) {
  const avvisiDati = [];
  if (g.eventi === null) avvisiDati.push("Gli eventi di parto non sono leggibili: i nati per madre non si possono calcolare (accedere con nome e password).");
  if (!g.mandria || g.mandria.length === 0) avvisiDati.push("Il riepilogo della mandria del Report Riproduttori è vuoto: il costo di nascita non si può dividere tra costo rimasto dei genitori e mantenimento delle madri, quindi se ne considera variabile solo la quota dei costi variabili. Rifare l'elaborazione del Report Riproduttori.");

  // Versione 237: acquisti + fatture da ricevere/da emettere; acquisti collegati a un documento di competenza esclusi
  const annoFattura = new Map((g.fatture || []).filter(entraNeiCosti).map(f => [f.id, annoDi(f.data)]));
  const specieCespite = new Map((g.cespiti || []).map(c => [c.id, c.specie || []]));
  const ripartizioni = new Map((g.ripartizioni || []).map(r => [r.anno, r]));
  const mandria = new Map((g.mandria || []).map(m => [`${m.specie}|${m.anno}`, m]));

  // Righe di costo di un anno (fatture passive + costi diretti, lavoro ripartito tra le attività)
  const righeCostoAnno = anno => {
    const righe = (g.articoli || []).filter(a => annoFattura.get(a.fattura_id) === anno).map(a => ({
      totale_riga: num(a.totale_riga), tipo_costo: a.tipo_costo, area: (a.area || "").trim(), destinazione: (a.destinazione || "").trim(), centro_costo: a.centro_costo || "" }))
      .concat((g.costiDiretti || []).filter(c => annoDi(c.data) === anno).map(c => ({
        totale_riga: num(c.importo), tipo_costo: c.tipo_costo, area: (c.area || "").trim(), destinazione: (c.destinazione || "").trim(), centro_costo: c.centro_costo || "" })));
    return applicaRipartizioneLavoro(righe, ripartizioni.get(anno) || null)
      .filter(r => r.tipo_costo === "Fisso" || r.tipo_costo === "Variabile")
      .concat((g.quote || []).filter(q => q.anno === anno).map(q => ({
        totale_riga: num(q.quota), tipo_costo: "Fisso", area: "Ammortamenti", destinazione: destinazioneCespite(specieCespite.get(q.cespite_id)), centro_costo: "" }))
        .filter(q => q.destinazione !== null));
  };
  const ubaAnno = anno => (g.costiAnimali || []).filter(r => r.anno === anno).map(r => ({ specie: r.specie, uba_giorni: num(r.uba_giorni), categoria_contabile: r.categoria_contabile }));

  // Costi di un anno per specie: fissi, variabili, per area. regola «BE» = senza macello e lavorazioni;
  // regola «RC» = come il Report Costi (serve a dividere il costo di nascita, calcolato con quella regola)
  const cacheCosti = new Map();
  const costiAnno = (anno, regola = "BE") => {
    const chiave = `${anno}|${regola}`;
    if (cacheCosti.has(chiave)) return cacheCosti.get(chiave);
    const tutte = righeCostoAnno(anno);
    const eLavorazione = r => r.area === AREA_LAVORAZIONI || r.centro_costo === CENTRO_LAVORO_CARNI;
    // Dalle 22:00 del 07/10/2026 anche il Report Costi esclude macello e lavorazioni: le due regole coincidono
    const usate = tutte.filter(r => !eLavorazione(r));
    const uba = ubaAnno(anno);
    const fissi = allocaCostiPerSpecie(usate.filter(r => r.tipo_costo === "Fisso"), uba);
    const variabili = allocaCostiPerSpecie(usate.filter(r => r.tipo_costo === "Variabile"), uba);
    const aree = [...new Set(usate.map(r => r.area || "Senza area"))].sort((a, b) => (a === "Ammortamenti") - (b === "Ammortamenti") || a.localeCompare(b));
    const perArea = aree.map(area => {
      const ra = usate.filter(r => (r.area || "Senza area") === area);
      const f = allocaCostiPerSpecie(ra.filter(r => r.tipo_costo === "Fisso"), uba);
      const v = allocaCostiPerSpecie(ra.filter(r => r.tipo_costo === "Variabile"), uba);
      return { area, perSpecie: Object.fromEntries(SPECIE.map(s => [s, { fissi: f[s].totale, variabili: v[s].totale }])) };
    });
    const perSpecie = Object.fromEntries(SPECIE.map(s => {
      const ubaProd = fissi[s].ubaGiorniProduttivi;
      return [s, { fissi: fissi[s].totale, variabili: variabili[s].totale, ubaProduttivi: ubaProd,
        tassoVariabile: ubaProd > 0 ? variabili[s].totale / ubaProd : 0,
        quotaVariabile: (fissi[s].totale + variabili[s].totale) > 0 ? variabili[s].totale / (fissi[s].totale + variabili[s].totale) : 0 }];
    }));
    const escluse = tutte.filter(eLavorazione);
    const r = { anno, haCalcolo: uba.length > 0, perSpecie, perArea, lavorazioniEscluse: round2(somma(escluse.map(x => x.totale_riga))) };
    cacheCosti.set(chiave, r);
    return r;
  };

  // Soggetti: animali con matricola e suinetti dei lotti (quelli passati a matricola si contano una volta sola)
  const genitori = idGenitori(g.animali, g.lotti);
  const animali = normalizzaAnimali(g.animali || [], g.lotti || [], g.unita || []);
  const lottoPerId = new Map((g.lotti || []).map(l => [l.id, l]));
  const nUnita = conteggioUnitaPerLotto(g.unita || []);
  const prezzoVendita = new Map();
  (g.vendite || []).forEach(v => {
    const p = num(v.prezzo_vendita_kg_reale); if (!(p > 0)) return;
    if (v.animale_id) prezzoVendita.set(`a:${v.animale_id}`, p); else if (v.lotto_id) prezzoVendita.set(`u:${v.lotto_id}|${v.unita_nr}`, p);
  });
  const soggetti = [];
  for (const a of animali) {
    if (!SPECIE.includes(a.specie)) continue;
    const nato = eNatoDellaMandria(a);
    soggetti.push({ chiave: `a:${a.id}`, tipo: "animale", id: a.id, specie: a.specie, codice: a.bdn || a.nome || `scheda ${a.id}`, sesso: a.sesso,
      nascita: giorno(a.nascita), inizio: giorno(dataIngressoPresenza(a) || a.nascita), uscita: giorno(a.data_uscita), stato: a.stato,
      riproduttore: !!a.riproduttore || genitori.has(a.id), natoInAzienda: nato, acquistato: !nato && a.provenienza === "Acquistato",
      costoAcquisto: costoAcquistoUnitario({ animale: a }), pesoCarcassa: num(a.peso_carcassa), pesoVivo: num(a.peso_vivo_uscita),
      codiceNonValido: /\s/.test(String(a.bdn || "").trim()) });
  }
  for (const u of g.unita || []) {
    if (u.stato === "registrato_individuale") continue;
    const l = lottoPerId.get(u.lotto_id); if (!l) continue;
    const specie = l.specie && SPECIE.includes(l.specie) ? l.specie : "suino";
    const comprato = l.tipo_provenienza === "acquistato";
    soggetti.push({ chiave: `u:${u.lotto_id}|${u.nr}`, tipo: "unita", id: u.id, specie,
      codice: u.codice_completo || `${l.codice_lotto || l.codice || ""}${String(u.nr).padStart(2, "0")}`, sesso: u.sesso,
      nascita: giorno(l.data_parto), inizio: giorno(l.data_parto), uscita: giorno(u.data_uscita), stato: u.stato,
      riproduttore: false, natoInAzienda: !comprato, acquistato: comprato,
      costoAcquisto: costoAcquistoUnitario({ unita: u, lotto: l, numeroUnitaLotto: nUnita.get(l.id) }),
      pesoCarcassa: num(u.peso_carcassa), pesoVivo: num(u.peso_vivo_uscita), codiceNonValido: false });
  }
  // Costi salvati per soggetto, anno per anno
  const righeSoggetto = new Map();
  (g.costiAnimali || []).forEach(r => {
    const k = r.animale_id ? `a:${r.animale_id}` : r.lotto_id ? `u:${r.lotto_id}|${r.unita_nr}` : null;
    if (!k) return;
    if (!righeSoggetto.has(k)) righeSoggetto.set(k, []);
    righeSoggetto.get(k).push(r);
  });
  const anniCalcolati = [...new Set((g.costiAnimali || []).map(r => r.anno))].sort();

  // Parte variabile del costo di nascita (decisione delle 20:01)
  const nascitaVariabile = (specie, righe) => {
    let intera = 0, variabile = 0, senzaDivisione = false;
    for (const r of righe) {
      const n = num(r.costo_nascita_ereditato); if (!(n > 0)) continue;
      intera += n;
      const q = costiAnno(r.anno, "RC").perSpecie[specie]?.quotaVariabile || 0;
      const m = mandria.get(`${specie}|${r.anno}`);
      const tot = m ? num(m.mantenimento_riproduttori) + num(m.quota_residuo_riproduttori) : 0;
      if (tot > 0) { const quotaRimasto = num(m.quota_residuo_riproduttori) / tot; variabile += n * (quotaRimasto + (1 - quotaRimasto) * q); }
      else { variabile += n * q; senzaDivisione = true; }
    }
    return { intera: round2(intera), variabile: round2(variabile), senzaDivisione };
  };

  const presenteIl = (s, data) => !!s.inizio && s.inizio <= data && (s.uscita ? s.uscita > data : !eUscito(s.stato));

  return { g, avvisiDati, costiAnno, soggetti, righeSoggetto, anniCalcolati, nascitaVariabile, prezzoVendita, presenteIl,
    eventi: g.eventi || [], primoAnno: anniCalcolati[0] || null, ultimoAnno: anniCalcolati[anniCalcolati.length - 1] || null };
}

// ── Campione del «capo tipo» (indipendente dall'anno: tutti gli anni) ───────────────────────
// Fasce di età dei bovini macellati: il campione deciso è «12–24 mesi»; le altre fasce si possono
// scegliere nella pagina per confronto (vitelli sotto i 12 mesi, capi oltre i 24 mesi, tutti).
export const FASCE_BOVINI = [
  { id: "12-24", etichetta: "tra 12 e 24 mesi", da: 12, a: 24 },
  { id: "meno12", etichetta: "sotto i 12 mesi (vitelli)", da: 0, a: 12 },
  { id: "oltre24", etichetta: "oltre i 24 mesi", da: 24, a: Infinity },
  { id: "tutti", etichetta: "di tutte le età", da: 0, a: Infinity },
];
export function contaFasceBovini(base) {
  const mac = base.soggetti.filter(s => s.specie === "bovino" && s.stato === "macellato" && !s.riproduttore && s.uscita && s.nascita);
  return Object.fromEntries(FASCE_BOVINI.map(f => [f.id, mac.filter(s => entroFascia(s, f)).length]));
}
function entroFascia(s, f) {
  const m = giorniTra(s.nascita, s.uscita) / MESE;
  if (f.id === "12-24") return m >= 12 && m <= 24;
  if (f.id === "meno12") return m < 12;
  if (f.id === "oltre24") return m > 24;
  return true;
}
export function campione(base, specie, fascia = "12-24") {
  const lim = LIMITI_RESA[specie];
  const f = FASCE_BOVINI.find(x => x.id === fascia) || FASCE_BOVINI[0];
  const candidati = base.soggetti.filter(s => s.specie === specie && s.stato === "macellato" && !s.riproduttore && s.uscita && s.nascita).filter(s => {
    if (specie === "bovino") return entroFascia(s, f);
    if (specie === "suino") return s.pesoVivo > 130;
    return true;
  });
  const validi = [], esclusi = [], senzaPeso = [];
  for (const s of candidati) {
    const resa = s.pesoCarcassa > 0 && s.pesoVivo > 0 ? s.pesoCarcassa / s.pesoVivo * 100 : null;
    const riga = { ...s, resa };
    if (resa === null) { senzaPeso.push({ ...riga, motivo: s.pesoCarcassa > 0 ? "manca il peso vivo" : s.pesoVivo > 0 ? "manca il peso della carcassa" : "mancano i due pesi" }); continue; }
    if (s.codiceNonValido) { esclusi.push({ ...riga, motivo: "scritta al posto del codice" }); continue; }
    if (lim && resa < lim.min) { esclusi.push({ ...riga, motivo: `resa sotto il ${lim.min}%` }); continue; }
    if (lim && resa > lim.max) { esclusi.push({ ...riga, motivo: `resa sopra il ${lim.max}%` }); continue; }
    validi.push(riga);
  }
  const sCarc = somma(validi.map(s => s.pesoCarcassa)), sVivo = somma(validi.map(s => s.pesoVivo));
  // Costi dei capi del campione
  const conCosti = validi.filter(s => base.righeSoggetto.has(s.chiave));
  const dettaglio = conCosti.map(s => {
    const righe = base.righeSoggetto.get(s.chiave);
    const nascita = s.natoInAzienda ? base.nascitaVariabile(specie, righe) : { intera: 0, variabile: 0, senzaDivisione: false };
    return { s, ubaVita: somma(righe.map(r => num(r.uba_giorni))), acquisto: s.acquistato ? s.costoAcquisto : 0, nascita };
  });
  const acquistati = dettaglio.filter(d => d.s.acquistato), nati = dettaglio.filter(d => d.s.natoInAzienda);
  const conPrezzo = validi.filter(s => base.prezzoVendita.has(s.chiave));
  const kgConPrezzo = somma(conPrezzo.map(s => s.pesoCarcassa));
  return {
    specie, descrizione: specie === "bovino" ? `bovini macellati ${f.etichetta}, di tutti gli anni, maschi e femmine insieme` : DESCRIZIONE_CAMPIONE[specie], limiti: lim, fascia: f.id,
    numero: validi.length, esclusi, senzaPeso, senzaCosti: validi.length - conCosti.length, numeroConCosti: conCosti.length,
    pesoCarcassa: validi.length ? sCarc / validi.length : null,
    pesoVivo: validi.length ? sVivo / validi.length : null,
    resa: sVivo > 0 ? sCarc / sVivo * 100 : null,
    permanenzaMesi: media(validi.map(s => giorniTra(s.inizio || s.nascita, s.uscita) / MESE)),
    etaMesi: media(validi.map(s => giorniTra(s.nascita, s.uscita) / MESE)),
    ubaVita: media(dettaglio.map(d => d.ubaVita)),
    // costo di partenza variabile medio per capo (acquisto, oppure parte variabile della nascita)
    partenza: media(dettaglio.map(d => d.acquisto + d.nascita.variabile)),
    quotaNati: dettaglio.length ? nati.length / dettaglio.length : null,
    acquistoMedio: media(acquistati.map(d => d.acquisto)), numeroAcquistati: acquistati.length,
    nascitaMediaIntera: media(nati.map(d => d.nascita.intera)), nascitaMediaVariabile: media(nati.map(d => d.nascita.variabile)), numeroNati: nati.length,
    nascitaSenzaDivisione: nati.some(d => d.nascita.senzaDivisione),
    prezzoRealeCarcassa: kgConPrezzo > 0 ? somma(conPrezzo.map(s => base.prezzoVendita.get(s.chiave) * s.pesoCarcassa)) / kgConPrezzo : null,
    numeroConPrezzo: conPrezzo.length,
  };
}

// ── Dati dell'allevamento in un anno (madri, nati, tori, capi presenti, capi macellati) ─────────
function etaMesiAl(s, data) { return s.nascita ? giorniTra(s.nascita, data) / MESE : null; }
export function datiMandriaAnno(base, specie, anno) {
  const metaAnno = `${anno}-07-01`;
  const sogg = base.soggetti.filter(s => s.specie === specie && s.tipo === "animale");
  const presentiMeta = sogg.filter(s => base.presenteIl(s, metaAnno));
  const femmine = presentiMeta.filter(s => String(s.sesso).toUpperCase().startsWith("F") && (etaMesiAl(s, metaAnno) ?? 0) >= ETA_ADULTA_MESI[specie]);
  const maschi = presentiMeta.filter(s => String(s.sesso).toUpperCase().startsWith("M") && s.riproduttore);
  const idSpecie = new Set(sogg.map(s => s.id));
  const nati = somma(base.eventi.filter(e => /^part/i.test(e.tipo_evento || "") && annoDi(e.data_evento) === anno && idSpecie.has(e.animale_id)).map(e => num(e.nati_vivi)));
  return { anno, femmineAdulte: femmine.length, maschiRiproduttori: maschi.length, natiVivi: nati,
    natiPerMadre: femmine.length ? nati / femmine.length : null, toriPerMadre: femmine.length ? maschi.length / femmine.length : null };
}

// Anni completi da usare come riferimento: gli ultimi tre fino all'anno scelto (escluso l'anno in corso)
export function anniDiRiferimento(anno) {
  const corrente = new Date().getFullYear();
  const ultimo = Math.min(anno, corrente - 1);
  return [ultimo - 2, ultimo - 1, ultimo];
}

export function capiAnno(base, specie, anno) {
  const fine = `${anno}-12-31`;
  const sogg = base.soggetti.filter(s => s.specie === specie);
  const macellati = sogg.filter(s => s.stato === "macellato" && annoDi(s.uscita) === anno);
  const ingrasso = macellati.filter(s => !s.riproduttore);
  const presenti = sogg.filter(s => base.presenteIl(s, fine));
  const femmineAdulte = presenti.filter(s => s.tipo === "animale" && String(s.sesso).toUpperCase().startsWith("F") && (etaMesiAl(s, fine) ?? 0) >= ETA_ADULTA_MESI[specie]).length;
  const maschiRiproduttori = presenti.filter(s => s.tipo === "animale" && String(s.sesso).toUpperCase().startsWith("M") && s.riproduttore).length;
  const kg = (l, campo) => somma(l.map(s => s[campo]).filter(p => p > 0));
  return {
    macellati: macellati.length, ingrasso: ingrasso.length, riforme: macellati.length - ingrasso.length,
    macellatiConCarcassa: macellati.filter(s => s.pesoCarcassa > 0).length, kgCarcassa: kg(macellati, "pesoCarcassa"),
    kgVivo: kg(macellati, "pesoVivo"), macellatiConVivo: macellati.filter(s => s.pesoVivo > 0).length,
    ingrassoKgCarcassa: kg(ingrasso, "pesoCarcassa"), ingrassoConCarcassa: ingrasso.filter(s => s.pesoCarcassa > 0).length,
    presenti: presenti.length, femmineAdulte, maschiRiproduttori, altri: presenti.length - femmineAdulte - maschiRiproduttori,
    usciti: sogg.filter(s => s.uscita && annoDi(s.uscita) === anno && s.stato !== "macellato").length,
  };
}

// Valore degli animali in stalla (non riproduttori) alla fine di un anno: quanto sono costati fin lì
export function valoreStalla(base, specie, anno) {
  const fine = `${anno}-12-31`;
  let valore = 0, capi = 0;
  for (const s of base.soggetti) {
    if (s.specie !== specie || s.riproduttore || !base.presenteIl(s, fine)) continue;
    capi++;
    const righe = (base.righeSoggetto.get(s.chiave) || []).filter(r => r.anno <= anno);
    valore += (s.acquistato ? s.costoAcquisto : 0) + somma(righe.map(r => num(r.costo_mantenimento) + num(r.costo_nascita_ereditato) + num(r.quota_residuo_riproduttori)));
  }
  return { capi, valore: round2(valore) };
}

// ── Il calcolo del pareggio, con le leve scritte dall'utente ────────────────────────────────
// p: { prezzo, peso, permanenza, natiPerMadre, toriPerMadre, quotaNati, variazioneVariabili, variazioneFissi }
// rif: { fissi, tassoVariabile, ubaVita, permanenzaCampione, partenza, capiReali }
export function pareggio(p, rif) {
  const peso = num(p.peso), prezzo = num(p.prezzo);
  const perm = num(p.permanenza) > 0 ? num(p.permanenza) : rif.permanenzaCampione;
  const fattoreDurata = rif.permanenzaCampione > 0 && perm > 0 ? perm / rif.permanenzaCampione : 1;
  const fissi = rif.fissi * (1 + num(p.variazioneFissi) / 100);
  const mantenimentoVariabile = (rif.ubaVita || 0) * fattoreDurata * rif.tassoVariabile * (1 + num(p.variazioneVariabili) / 100);
  const costoVariabile = (rif.partenza || 0) + mantenimentoVariabile;
  const ricavo = prezzo * peso;
  const margine = ricavo - costoVariabile;
  const capi = margine > 0 && fissi >= 0 ? Math.ceil(fissi / margine - 1e-9) : null;
  const quotaNati = Math.min(Math.max(num(p.quotaNati), 0), 100) / 100;
  const npm = num(p.natiPerMadre), tpm = num(p.toriPerMadre);
  const stalla = capi === null ? null : (() => {
    const ingrasso = Math.ceil(capi * perm / 12 - 1e-9);
    const madri = npm > 0 ? Math.ceil(capi * quotaNati / npm - 1e-9) : (quotaNati > 0 ? null : 0);
    const tori = madri === null ? null : Math.ceil(madri * tpm - 1e-9);
    return { ingrasso, madri, tori, totale: madri === null ? null : ingrasso + madri + tori };
  })();
  const reali = rif.capiReali || 0;
  return {
    peso, prezzo, permanenza: perm, fissi, costoVariabile, mantenimentoVariabile, partenza: rif.partenza || 0, ricavo, margine, capi, stalla,
    risultatoReale: reali > 0 ? reali * margine - fissi : null,
    prezzoMinimo: reali > 0 && peso > 0 ? (fissi / reali + costoVariabile) / peso : null,
    margineSicurezza: reali > 0 && capi !== null ? (reali - capi) / reali * 100 : null,
  };
}
