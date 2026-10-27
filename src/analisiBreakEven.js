// Versione 314 — Analisi Break Even (decisioni del Dott. Bizzarri del 27/10/2026, revisione dei 12 punti).
// UN SOLO modulo di calcolo per le pagine della sottocartella «Analisi Break Even»: Fotografia dei dati,
// Break Even, Strutture necessarie, Nati o comprati, Anomalie e interventi, Fotografie e controllo.
// Sola lettura: nessuna scrittura nel database (le fotografie si salvano dalla pagina 8, tabella propria).
//
// Regole decise (27/10/2026):
// - Break Even = logica del costo variabile (direct costing): capi di pareggio = costi fissi ÷ (ricavo − costo variabile) per capo;
// - due pareggi, sulla carcassa e sul capo vivo, legati dalla resa: prezzo al vivo = prezzo della carcassa × resa;
// - periodo: anno solare completo (dato certo, es. 2025) oppure ANNO MOBILE = ultimi 12 mesi a fine trimestre (lavoro in corso);
// - prezzo di partenza = prezzo applicato nelle fatture di vendita (bovini 9,00, suini 6,00, ovini 10,00 €/kg di carcassa), sempre modificabile;
// - ripartizione dei costi tra le specie come nel Report Costi (UBA-giorni; costi propri della specie separati da quelli comuni);
// - costo variabile del nato costruito dai coefficienti tecnici della mandria:
//   costo per nato = costo variabile annuo della mandria per madre (mantenimento variabile dei riproduttori + quota di rimonta)
//                    ÷ [(365 ÷ interparto) × nati vivi per parto × (1 − mortalità fino alla vendita)];
// - madre = femmina che ha partorito; non conta più come madre se non partorisce da più di due interparti
//   dell'azienda (bovini 27 mesi, suini 12, ovini 19 — regola approvata il 27/10/2026 ore 12:24);
// - nati per madre solo sui VIVI; i nati morti e i morti dopo la nascita si evidenziano a parte (pagina Anomalie);
// - dati incerti: scenario BASE prudente «senza» e scenario «con», affiancati, con nota esplicativa:
//   · suinetti dei lotti ancora «attivi» con più di 24 mesi (16 capi al 27/10/2026): senza = fuori dagli UBA e dai presenti;
//   · capi macellati senza peso della carcassa (36 suini del 2025): senza = non contati tra i capi prodotti;
//     con = contati con il peso medio del capo tipo;
// - ovini: gli agnelli escono con il solo codice dell'allevamento e non sono nell'app: capi e chili dalle fatture
//   (le fatture di gennaio contano per l'anno prima: vendite di settembre–dicembre fatturate a gennaio);
// - le spese di macello e lavorazione non sono costi di allevamento (escluse, come nel Report Costi).
import { supabase } from "./supabase";
import { fetchAllPages, round2 } from "./parsingUtils";
import { preparaBase, campione, SPECIE, ETICHETTE, destinazioneCespite, AREA_LAVORAZIONI } from "./calcoloBreakEven";
import { allocaCostiPerSpecie } from "./calcoloAllocazioneSpecie";
import { applicaRipartizioneLavoro } from "./ripartizioneLavoro";
import { entraNeiCosti, TIPO_DA_RICEVERE, TIPO_DA_EMETTERE } from "./documentiCompetenza";
import { giornoSoloData, calcolaUBAMedioExp, categoriaContabileExp, dataIngressoPresenza, UBA_FASCE_EXP } from "./motoreUba";
import { applicaNatiConLaMadre, segnaRiproduttoriEffettivi, idGenitori } from "./costoAnimale";

export { SPECIE, ETICHETTE };
const CENTRO_LAVORO_CARNI = "Lavoro per la lavorazione delle carni";
const GIORNO = 86400000;
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const giorno = d => (d ? String(d).slice(0, 10) : null);
const ms = d => giornoSoloData(d);
const isoDa = t => new Date(t).toISOString().slice(0, 10);
const somma = l => l.reduce((s, x) => s + x, 0);
const mediana = l => { if (!l.length) return null; const v = [...l].sort((a, b) => a - b); const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const media = l => (l.length ? somma(l) / l.length : null);

// Soglie approvate il 27/10/2026
export const SOGLIA_MADRE_MESI = { bovino: 27, suino: 12, ovino: 19 };       // oltre: madre improduttiva
export const SOGLIA_SCOTTONA_MESI = 36;                                     // bovina mai partorita oltre 36 mesi = scottona
export const ETA_SUINO_LOTTO_ANOMALO_MESI = 24;                              // suinetto di lotto ancora attivo oltre 24 mesi
const MESE = 30.44;

// ── Periodi ─────────────────────────────────────────────────────────────────────────────────────
// Anni solari completi (dato certo) e anni mobili (ultimi 12 mesi) chiusi a fine trimestre.
export function elencoPeriodi(oggi = new Date()) {
  const anno = oggi.getFullYear();
  const periodi = [];
  for (let a = anno - 1; a >= 2023; a--) periodi.push({ id: `anno-${a}`, tipo: "anno", da: `${a}-01-01`, a: `${a}-12-31`, etichetta: `Anno ${a} (completo)`, breve: `${a}` });
  // fine trimestre più recente già chiusa
  const fineTrimestri = [];
  for (let a = anno; a >= anno - 1; a--) for (const [m, g] of [[12, 31], [9, 30], [6, 30], [3, 31]]) {
    const f = new Date(Date.UTC(a, m - 1, g));
    if (f.getTime() < Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()) && !(m === 12)) fineTrimestri.push(f);
  }
  fineTrimestri.sort((x, y) => y - x);
  for (const f of fineTrimestri.slice(0, 3)) {
    const fine = isoDa(f.getTime());
    const inizio = isoDa(Date.UTC(f.getUTCFullYear() - 1, f.getUTCMonth(), f.getUTCDate()) + GIORNO);
    const dataIt = fine.split("-").reverse().join("/");
    periodi.unshift({ id: `mobile-${fine}`, tipo: "mobile", da: inizio, a: fine, etichetta: `Anno mobile al ${dataIt} (lavoro in corso)`, breve: `al ${dataIt}` });
  }
  // ordine: prima l'ultimo anno completo, poi gli anni mobili, poi gli anni precedenti
  const anni = periodi.filter(p => p.tipo === "anno"), mobili = periodi.filter(p => p.tipo === "mobile").sort((x, y) => (x.a < y.a ? 1 : -1));
  return [anni[0], ...mobili, ...anni.slice(1)].filter(Boolean);
}
const giorniPeriodo = P => Math.round((ms(P.a) - ms(P.da)) / GIORNO) + 1;
const dentro = (d, P) => !!d && d >= P.da && d <= P.a;

// ── Caricamento dei dati (una volta sola) ───────────────────────────────────────────────────────
async function tutte(tabella, colonne, ordine = "id", facoltativa = false) {
  const { data, error } = await fetchAllPages((da, a) => supabase.from(tabella).select(colonne).order(ordine).range(da, a));
  if (error) { if (facoltativa) return null; throw new Error(`${tabella}: ${error.message}`); }
  return data || [];
}

export async function caricaAnalisi() {
  const [fatture, articoli, costiDiretti, quote, cespiti, costiAnimali, mandria, animali, lotti, unita, eventi, vendite, ripartizioni, fotografie, raccolte, colture] = await Promise.all([
    tutte("ci_fatture", "id, data, tipo, numero, regolarizzazione_di", "id", true).then(f => f || tutte("ci_fatture", "id, data, tipo, numero")),
    tutte("ci_articoli_fattura", "id, fattura_id, totale_riga, tipo_costo, area, destinazione, centro_costo, descrizione, quantita, prezzo_unitario, unita_misura"),
    tutte("ci_costi_diretti", "id, data, importo, tipo_costo, area, destinazione, centro_costo"),
    tutte("ci_cespiti_ammortamento", "id, cespite_id, anno, quota"),
    tutte("ci_cespiti", "id, specie"),
    tutte("ci_costo_animale_annuale", "id, anno, animale_id, lotto_id, unita_nr, specie, categoria_contabile, uba_giorni, costo_mantenimento, costo_nascita_ereditato, quota_residuo_riproduttori"),
    tutte("ci_costo_nascita_mandria", "id, specie, anno, mantenimento_riproduttori, quota_residuo_riproduttori", "id", true),
    tutte("animali", "id, bdn, nome, specie, sesso, nascita, stato, data_uscita, motivo_uscita, causa_morte, data_ingresso, provenienza, razza, riproduttore, madre_id, padre_id, prezzo_acquisto, peso_carcassa, peso_vivo_uscita, note"),
    tutte("lotti_suini", "*"),
    tutte("suini_lotto", "*"),
    tutte("eventi_riproduttivi", "id, animale_id, tipo_evento, data_evento, nati_vivi, nati_morti", "id", true),
    tutte("ci_dati_vendita_ingrasso", "id, animale_id, lotto_id, unita_nr, prezzo_vendita_kg_reale", "id", true),
    tutte("ci_ripartizione_lavoro", "*", "anno", true),
    tutte("ci_fotografie_break_even", "id, creata_il, periodo_da, periodo_a, periodo_etichetta, scenario, etichetta, nota, dati", "id", true),
    tutte("raccolte", "id, coltura_campo_id, prodotto, unita, quantita", "id", true),
    tutte("colture_campo", "id, campo_id, campagna, coltura", "id", true),
  ]);
  const g = { fatture, articoli, costiDiretti, quote, cespiti, costiAnimali, mandria, animali, lotti, unita, eventi, vendite, ripartizioni };
  const base = preparaBase(g);
  return { ...base, g, fotografie, raccolte: raccolte || [], colture: colture || [], eventiLeggibili: eventi !== null, fotografieDisponibili: fotografie !== null, caricatoIl: new Date() };
}

// ── Costi di un periodo ─────────────────────────────────────────────────────────────────────────
// Data di competenza di una riga: per i documenti di competenza (fatture da ricevere e da emettere,
// datate 31/12) la data della fattura originale scritta nella descrizione («… del 24/04/2025 …»).
const reDel = /\bdel\s+(\d{1,2})[/.](\d{1,2})[/.](\d{4})/i;
function dataCompetenza(riga, fattura) {
  if (fattura && (fattura.tipo === TIPO_DA_RICEVERE || fattura.tipo === TIPO_DA_EMETTERE)) {
    const m = String(riga.descrizione || "").match(reDel);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return giorno(fattura?.data);
}
function giorniDiAnnoNelPeriodo(anno, P) {
  const da = Math.max(ms(`${anno}-01-01`), ms(P.da)), a = Math.min(ms(`${anno}-12-31`), ms(P.a));
  return a >= da ? Math.round((a - da) / GIORNO) + 1 : 0;
}
const giorniAnno = a => (a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0) ? 366 : 365);

export function righeCostoPeriodo(A, P) {
  const fattureCosti = new Map((A.g.fatture || []).filter(entraNeiCosti).map(f => [f.id, f]));
  const grezze = [];
  for (const a of A.g.articoli || []) {
    const f = fattureCosti.get(a.fattura_id); if (!f) continue;
    const d = dataCompetenza(a, f); if (!dentro(d, P)) continue;
    grezze.push({ data: d, totale_riga: num(a.totale_riga), tipo_costo: a.tipo_costo, area: (a.area || "").trim(), destinazione: (a.destinazione || "").trim(), centro_costo: a.centro_costo || "" });
  }
  for (const c of A.g.costiDiretti || []) {
    const d = giorno(c.data); if (!dentro(d, P)) continue;
    grezze.push({ data: d, totale_riga: num(c.importo), tipo_costo: c.tipo_costo, area: (c.area || "").trim(), destinazione: (c.destinazione || "").trim(), centro_costo: c.centro_costo || "" });
  }
  // il lavoro si ripartisce tra le attività con le percentuali di ciascun anno
  const ripartizioni = new Map((A.g.ripartizioni || []).map(r => [r.anno, r]));
  const anni = [...new Set(grezze.map(r => parseInt(r.data.slice(0, 4))))];
  let righe = [];
  for (const anno of anni) righe = righe.concat(applicaRipartizioneLavoro(grezze.filter(r => parseInt(r.data.slice(0, 4)) === anno), ripartizioni.get(anno) || null));
  righe = righe.filter(r => r.tipo_costo === "Fisso" || r.tipo_costo === "Variabile");
  // ammortamenti: quota dell'anno per i giorni dell'anno che cadono nel periodo
  const specieCespite = new Map((A.g.cespiti || []).map(c => [c.id, c.specie || []]));
  for (const q of A.g.quote || []) {
    const gg = giorniDiAnnoNelPeriodo(q.anno, P); if (!gg) continue;
    const dest = destinazioneCespite(specieCespite.get(q.cespite_id)); if (dest === null) continue;
    righe.push({ data: null, totale_riga: num(q.quota) * gg / giorniAnno(q.anno), tipo_costo: "Fisso", area: "Ammortamenti", destinazione: dest, centro_costo: "", ammortamento: true });
  }
  return righe;
}
const eLavorazione = r => r.area === AREA_LAVORAZIONI || r.centro_costo === CENTRO_LAVORO_CARNI;

// ── UBA-giorni di un periodo (stesso motore del Report Costi, su un periodo qualunque) ──────────
function presenzaNelPeriodo(nascita, dataUscita, P, dataIngresso, oggiMs) {
  const dn = ms(nascita); if (dn === null) return null;
  const inizioP = ms(P.da), fineP = ms(P.a);
  const di = ms(dataIngresso);
  const dataInizio = di !== null && di > dn ? di : dn;
  const dataFine = dataUscita ? ms(dataUscita) : Math.min(oggiMs, fineP);
  if (dataFine === null || dataFine < inizioP || dataInizio > fineP || dataFine < dataInizio) return null;
  const inizio = Math.max(dataInizio, inizioP), fine = Math.min(dataFine, fineP);
  return { inizio, fine, giorni: Math.round((fine - inizio) / GIORNO) + 1, etaAllInizio: Math.round((inizio - dn) / GIORNO) };
}
export function animaliNormalizzati(A) {
  if (A._animaliUba) return A._animaliUba;
  const base = applicaNatiConLaMadre(A.g.animali || []);
  A._animaliUba = segnaRiproduttoriEffettivi(base, idGenitori(base, A.g.lotti || []));
  return A._animaliUba;
}
// Suinetti dei lotti ancora attivi oltre 24 mesi: dato da verificare (scenario «senza»)
export function suiniLottoAnomali(A, oggi = new Date()) {
  const lotti = new Map((A.g.lotti || []).map(l => [l.id, l]));
  const limite = ms(isoDa(Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()))) - ETA_SUINO_LOTTO_ANOMALO_MESI * MESE * GIORNO;
  return (A.g.unita || []).filter(u => u.stato === "attivo" && !u.data_uscita).map(u => ({ u, l: lotti.get(u.lotto_id) }))
    .filter(x => x.l && x.l.data_parto && ms(x.l.data_parto) < limite)
    .map(({ u, l }) => ({ chiave: `u:${l.id}|${u.nr}`, codice: u.codice_completo || `${l.codice_lotto || l.codice}${String(u.nr).padStart(2, "0")}`, lotto: l.codice_lotto || l.codice, nr: u.nr, nascita: giorno(l.data_parto), sesso: u.sesso }));
}
export function ubaPeriodo(A, P, escludi = new Set()) {
  const chiave = `${P.da}|${P.a}|${[...escludi].sort().join(",")}`;
  A._uba = A._uba || new Map();
  if (A._uba.has(chiave)) return A._uba.get(chiave);
  const oggiMs = ms(isoDa(Date.now()));
  const righe = [];
  for (const a of animaliNormalizzati(A)) {
    if (!a.specie || !UBA_FASCE_EXP[a.specie]) continue;
    const nascita = a.nascita || a.data_ingresso; if (!nascita) continue;
    const per = presenzaNelPeriodo(nascita, a.data_uscita, P, dataIngressoPresenza(a), oggiMs); if (!per) continue;
    const uba = calcolaUBAMedioExp(a.specie, per.giorni, per.etaAllInizio); if (!uba) continue;
    righe.push({ chiave: `a:${a.id}`, animale_id: a.id, specie: a.specie, uba_giorni: Math.round(uba * per.giorni * 1000) / 1000, giorni: per.giorni, categoria_contabile: categoriaContabileExp(a), sesso: a.sesso });
  }
  const lotti = new Map((A.g.lotti || []).map(l => [l.id, l]));
  for (const u of A.g.unita || []) {
    if (u.stato === "registrato_individuale") continue;
    const l = lotti.get(u.lotto_id); if (!l || !l.data_parto) continue;
    const k = `u:${l.id}|${u.nr}`; if (escludi.has(k)) continue;
    const finto = { stato: u.stato === "attivo" ? "attivo" : (u.stato || "uscito"), motivo_uscita: u.motivo_uscita, riproduttore: false };
    const per = presenzaNelPeriodo(l.data_parto, u.data_uscita, P, null, oggiMs); if (!per) continue;
    const uba = calcolaUBAMedioExp("suino", per.giorni, per.etaAllInizio); if (!uba) continue;
    righe.push({ chiave: k, lotto_id: l.id, unita_nr: u.nr, specie: "suino", uba_giorni: Math.round(uba * per.giorni * 1000) / 1000, giorni: per.giorni, categoria_contabile: categoriaContabileExp(finto) });
  }
  A._uba.set(chiave, righe);
  return righe;
}

// ── Scenario ───────────────────────────────────────────────────────────────────────────────────
// «base» = prudente, senza i dati da verificare; «con» = con i dati da verificare
export function esclusiScenario(A, scenario) {
  return scenario === "con" ? new Set() : new Set(suiniLottoAnomali(A).map(x => x.chiave));
}

// ── Costi per specie nel periodo ─────────────────────────────────────────────────────────────────
export function costiPeriodo(A, P, scenario = "base") {
  const chiave = `${P.id}|${scenario}`;
  A._costi = A._costi || new Map();
  if (A._costi.has(chiave)) return A._costi.get(chiave);
  const tutte = righeCostoPeriodo(A, P);
  const usate = tutte.filter(r => !eLavorazione(r));
  const uba = ubaPeriodo(A, P, esclusiScenario(A, scenario));
  const fissi = allocaCostiPerSpecie(usate.filter(r => r.tipo_costo === "Fisso"), uba);
  const variabili = allocaCostiPerSpecie(usate.filter(r => r.tipo_costo === "Variabile"), uba);
  const ammortamenti = allocaCostiPerSpecie(usate.filter(r => r.ammortamento), uba);
  const aree = [...new Set(usate.map(r => r.area || "Senza area"))].sort((a, b) => (a === "Ammortamenti") - (b === "Ammortamenti") || a.localeCompare(b));
  const perArea = aree.map(area => {
    const ra = usate.filter(r => (r.area || "Senza area") === area);
    const f = allocaCostiPerSpecie(ra.filter(r => r.tipo_costo === "Fisso"), uba), v = allocaCostiPerSpecie(ra.filter(r => r.tipo_costo === "Variabile"), uba);
    return { area, perSpecie: Object.fromEntries(SPECIE.map(s => [s, { fissi: f[s].totale, variabili: v[s].totale }])) };
  });
  const perSpecie = Object.fromEntries(SPECIE.map(s => {
    const ubaProd = fissi[s].ubaGiorniProduttivi;
    const propri = round2(somma(usate.filter(r => r.tipo_costo === "Fisso" && r.destinazione === ETICHETTE[s]).map(r => r.totale_riga)));
    const ubaRiproduttori = somma(uba.filter(r => r.specie === s && r.categoria_contabile === "RIPRODUTTORE").map(r => r.uba_giorni));
    return [s, {
      fissi: fissi[s].totale, variabili: variabili[s].totale, ammortamenti: ammortamenti[s].totale,
      fissiPropri: propri, fissiComuni: round2(fissi[s].totale - propri),
      ubaProduttivi: ubaProd, ubaRiproduttori, ubaMedie: ubaProd / giorniPeriodo(P),
      tassoVariabile: ubaProd > 0 ? variabili[s].totale / ubaProd : 0,
    }];
  }));
  const escluse = tutte.filter(eLavorazione);
  const fuori = { // costi che non sono di bovini, suini e ovini (Cavalli, Pollame, Orto, animali non d'allevamento)
    totale: round2(somma(usate.map(r => r.totale_riga)) - somma(SPECIE.map(s => perSpecie[s].fissi + perSpecie[s].variabili))),
  };
  const r = { P, scenario, perSpecie, perArea, lavorazioniEscluse: round2(somma(escluse.map(x => x.totale_riga))), fuori,
    totaleRighe: round2(somma(usate.map(x => x.totale_riga))), ubaTotali: somma(uba.filter(x => x.categoria_contabile !== "IMPRODUTTIVO_USCITO").map(x => x.uba_giorni)) };
  A._costi.set(chiave, r);
  return r;
}

// ── Coefficienti tecnici della mandria nel periodo ──────────────────────────────────────────────
function partiPerMadre(A) {
  if (A._parti) return A._parti;
  const perId = new Map(animaliNormalizzati(A).map(a => [a.id, a]));
  const m = new Map();
  for (const e of A.g.eventi || []) {
    if (!/^part/i.test(e.tipo_evento || "")) continue;
    const a = perId.get(e.animale_id); if (!a) continue;
    if (!m.has(a.id)) m.set(a.id, []);
    m.get(a.id).push({ data: giorno(e.data_evento), vivi: num(e.nati_vivi), morti: num(e.nati_morti) });
  }
  for (const l of m.values()) l.sort((x, y) => (x.data < y.data ? -1 : 1));
  A._parti = m;
  return m;
}
// Durata della gravidanza (giorni): la femmina gravida del primo parto è già una madre e costa come tale
export const GESTAZIONE_GIORNI = { bovino: 285, suino: 115, ovino: 150 };
// giorni in cui la femmina è «madre» dentro un intervallo [da, a] (ms): dall'inizio della prima gravidanza,
// poi da ogni parto fino al parto successivo, ma non oltre la soglia della madre improduttiva
function giorniDaMadre(parti, specie, da, a) {
  if (!parti?.length || a < da) return 0;
  const soglia = SOGLIA_MADRE_MESI[specie] * MESE * GIORNO;
  const intervalli = parti.map((p, i) => {
    const inizio = ms(p.data), fineSoglia = inizio + soglia, prossimo = parti[i + 1] ? ms(parti[i + 1].data) : Infinity;
    return [inizio, Math.min(fineSoglia, prossimo)];
  });
  intervalli.unshift([ms(parti[0].data) - GESTAZIONE_GIORNI[specie] * GIORNO, ms(parti[0].data)]);
  let tot = 0;
  for (const [x, y] of intervalli) { const i = Math.max(x, da), f = Math.min(y, a + GIORNO); if (f > i) tot += (f - i) / GIORNO; }
  return tot;
}
function presenzaAnimale(a, P) {
  const nascita = a.nascita || a.data_ingresso; if (!nascita) return null;
  return presenzaNelPeriodo(nascita, a.data_uscita, P, dataIngressoPresenza(a), ms(isoDa(Date.now())));
}
// Agnelli venduti: dalle fatture (destinazione Ovini). Le fatture di gennaio valgono per l'anno prima.
export function agnelliFatturati(A, P) {
  const fatture = new Map((A.g.fatture || []).filter(f => f.tipo === "ATTIVA").map(f => [f.id, f]));
  let capi = 0, kg = 0, euro = 0; const righe = [];
  for (const a of A.g.articoli || []) {
    const f = fatture.get(a.fattura_id); if (!f || (a.destinazione || "").trim() !== "Ovini") continue;
    const d = giorno(f.data); if (!d) continue;
    const dataRif = d.slice(5, 7) === "01" ? `${parseInt(d.slice(0, 4)) - 1}-12-31` : d;
    if (!dentro(dataRif, P)) continue;
    const m = String(a.descrizione || "").match(/N\.\s*(\d+)\s*(CAPI|OVINI|CAPRINI)/i) || String(a.descrizione || "").match(/N\.\s*(\d+)/i);
    const n = num(a.quantita) < 0 ? -(m ? parseInt(m[1]) : 1) : (m ? parseInt(m[1]) : 1);
    capi += n; kg += num(a.quantita); euro += num(a.totale_riga);
    righe.push({ fattura: f.numero, data: d, capi: n, kg: num(a.quantita), euro: num(a.totale_riga) });
  }
  return { capi, kg, euro, righe };
}

export function tecnici(A, P, specie, scenario = "base") {
  const chiave = `${P.id}|${specie}|${scenario}`;
  A._tec = A._tec || new Map();
  if (A._tec.has(chiave)) return A._tec.get(chiave);
  const parti = partiPerMadre(A);
  const daP = ms(P.da), aP = ms(P.a), gP = giorniPeriodo(P);
  const animali = animaliNormalizzati(A).filter(a => a.specie === specie);
  let madreGiorni = 0, toriGiorni = 0;
  const intervalli = [];
  let partiP = 0, viviP = 0, mortiP = 0;
  for (const a of animali) {
    const pres = presenzaAnimale(a, P);
    const pa = parti.get(a.id) || [];
    if (String(a.sesso || "").toUpperCase().startsWith("F")) {
      if (pres) madreGiorni += giorniDaMadre(pa, specie, pres.inizio, pres.fine);
      pa.forEach((p, i) => {
        if (!dentro(p.data, P)) return;
        partiP++; viviP += p.vivi; mortiP += p.morti;
        if (i > 0) intervalli.push((ms(p.data) - ms(pa[i - 1].data)) / GIORNO);
      });
    } else if (String(a.sesso || "").toUpperCase().startsWith("M") && a.riproduttore && pres) {
      toriGiorni += pres.giorni;
    }
  }
  const madriMedie = madreGiorni / gP;
  // morti dopo la nascita (giovani nati in azienda, non riproduttori) usciti nel periodo
  const morto = s => /mort|decedut/i.test(s.stato || "");
  const mortiDopo = A.soggetti.filter(s => s.specie === specie && !s.riproduttore && s.natoInAzienda && morto(s) && dentro(s.uscita, P)).length;
  let mortalita = viviP > 0 ? Math.min(mortiDopo / viviP, 0.99) : 0;
  let natiViviStima = viviP, notaOvini = null, agnelli = null;
  if (specie === "ovino") {
    agnelli = agnelliFatturati(A, P);
    if (agnelli.capi > viviP) { natiViviStima = agnelli.capi; mortalita = 0; notaOvini = `nati presi dalle fatture: ${agnelli.capi} agnelli venduti contro ${viviP} nati registrati nell'app (parti delle pecore non registrati tutti)`; }
  }
  const madriAnno = madreGiorni / 365;
  let partiPerMadreAnno = madriAnno > 0 ? partiP / madriAnno : null;
  let interparto = partiPerMadreAnno ? 365 / partiPerMadreAnno : null;
  let natiPerParto = partiP > 0 ? viviP / partiP : null;
  if (specie === "ovino" && notaOvini) {
    // parti incompleti: interparto misurato tra parti registrati, nati per parto ricavati dagli agnelli venduti
    const im = mediana(intervalli.filter(x => x > 120));
    interparto = im || interparto;
    const partiStimati = interparto && madriAnno > 0 ? madriAnno * 365 / interparto : null;
    natiPerParto = partiStimati ? natiViviStima / partiStimati : null;
    partiPerMadreAnno = interparto ? 365 / interparto : null;
  }
  const natiVendibiliPerMadre = partiPerMadreAnno && natiPerParto !== null ? partiPerMadreAnno * natiPerParto * (1 - mortalita) : null;
  // costo variabile della mandria: mantenimento variabile dei riproduttori + quota di rimonta (pro rata)
  const costi = costiPeriodo(A, P, scenario).perSpecie[specie];
  const mantenimentoMandria = costi.ubaRiproduttori * costi.tassoVariabile;
  let rimonta = 0;
  for (const m of A.g.mandria || []) {
    if (m.specie !== specie) continue;
    const gg = giorniDiAnnoNelPeriodo(m.anno, P); if (!gg) continue;
    rimonta += num(m.quota_residuo_riproduttori) * gg / giorniAnno(m.anno);
  }
  const costoMandria = mantenimentoMandria + rimonta;
  const r = {
    specie, madriMedie, madriAnno, toriMedi: toriGiorni / gP, toriPerMadre: madriMedie > 0 ? (toriGiorni / gP) / madriMedie : null,
    partiP, viviP, mortiP, natiViviStima, mortiDopo, mortalita, natiMortiPerc: viviP + mortiP > 0 ? mortiP / (viviP + mortiP) : null,
    interpartoImplicito: interparto, interpartoMisuratoMedia: media(intervalli), interpartoMisuratoMediana: mediana(intervalli), intervalliMisurati: intervalli.length,
    partiPerMadreAnno, natiPerParto, natiVendibiliPerMadre, notaOvini, agnelli,
    mantenimentoMandria, rimonta, costoMandria, costoMandriaPerMadre: madriAnno > 0 ? costoMandria / madriAnno : null,
    costoPerNato: natiVendibiliPerMadre > 0 && madriAnno > 0 ? (costoMandria / madriAnno) / natiVendibiliPerMadre : null,
  };
  A._tec.set(chiave, r);
  return r;
}

// ── Produzione del periodo (capi e chili) ───────────────────────────────────────────────────────
export function produzione(A, P, specie, scenario = "base", pesoMedioCarcassa = null) {
  const escl = esclusiScenario(A, scenario);
  const prodotto = s => /macell|vendut|trasferit|scambi/i.test(s.stato || "");
  const sogg = A.soggetti.filter(s => s.specie === specie && !s.riproduttore);
  const usciti = sogg.filter(s => prodotto(s) && dentro(s.uscita, P));
  const conPeso = usciti.filter(s => s.pesoCarcassa > 0 || !/macell/i.test(s.stato || ""));
  const senzaPeso = usciti.filter(s => !(s.pesoCarcassa > 0) && /macell/i.test(s.stato || ""));
  const kgReali = somma(usciti.map(s => s.pesoCarcassa).filter(x => x > 0));
  const presenti = d => sogg.filter(s => !escl.has(s.chiave) && A.presenteIl(s, d));
  const prima = isoDa(ms(P.da) - GIORNO);
  // Un capo in stalla vale come capo finito solo in proporzione all'età raggiunta: età ÷ età media d'uscita
  // dei capi venduti o macellati (fino alla fine del periodo). Un suinetto di un mese non è un suino finito.
  const eta = sogg.filter(s => prodotto(s) && s.nascita && s.uscita && s.uscita <= P.a && s.uscita > s.nascita).map(s => (ms(s.uscita) - ms(s.nascita)) / GIORNO).sort((x, y) => x - y);
  const etaUscita = eta.length ? eta[Math.floor(eta.length / 2)] : null;
  const equivalenti = (lista, d) => somma(lista.map(s => (etaUscita && s.nascita ? Math.min(Math.max((ms(d) - ms(s.nascita)) / GIORNO, 0) / etaUscita, 1) : 1)));
  const pI = presenti(prima), pF = presenti(P.a);
  const inizio = pI.length, fine = pF.length;
  const inizioEq = round2(equivalenti(pI, prima)), fineEq = round2(equivalenti(pF, P.a));
  let capiUsciti = scenario === "con" ? usciti.length : conPeso.length;
  let kg = kgReali + (scenario === "con" && pesoMedioCarcassa ? senzaPeso.length * pesoMedioCarcassa : 0);
  let fonte = "app";
  let ovini = null;
  if (specie === "ovino") {
    ovini = agnelliFatturati(A, P);
    if (ovini.capi > capiUsciti) { capiUsciti = ovini.capi; kg = ovini.kg; fonte = "fatture"; }
  }
  const riforme = A.soggetti.filter(s => s.specie === specie && s.riproduttore && prodotto(s) && dentro(s.uscita, P)).length;
  return {
    capiUsciti, kg, senzaPeso: senzaPeso.map(s => ({ codice: s.codice, uscita: s.uscita })), presentiInizio: inizio, presentiFine: fine,
    presentiInizioEquivalenti: inizioEq, presentiFineEquivalenti: fineEq, etaUscitaGiorni: etaUscita,
    variazioneStalla: round2(fineEq - inizioEq), capiProdotti: Math.round(capiUsciti + (fineEq - inizioEq)), riforme, fonte, ovini,
  };
}

// ── Prezzo di vendita applicato (fatture di vendita) ────────────────────────────────────────────
export function prezzoApplicato(A, P, specie) {
  const fatture = new Map((A.g.fatture || []).filter(f => f.tipo === "ATTIVA").map(f => [f.id, f]));
  const righe = (A.g.articoli || []).filter(a => fatture.has(a.fattura_id) && (a.destinazione || "").trim() === ETICHETTE[specie]
    && num(a.prezzo_unitario) > 0 && num(a.prezzo_unitario) < 50 && num(a.quantita) > 0);
  const nel = righe.filter(a => dentro(giorno(fatture.get(a.fattura_id).data), P));
  const usa = nel.length ? nel : righe.filter(a => giorno(fatture.get(a.fattura_id).data) <= P.a);
  const kg = somma(usa.map(a => num(a.quantita)));
  if (!(kg > 0)) return { prezzo: null, righe: 0, nelPeriodo: false };
  const prezzi = [...new Set(usa.map(a => num(a.prezzo_unitario)))].sort((x, y) => x - y);
  return { prezzo: round2(somma(usa.map(a => num(a.prezzo_unitario) * num(a.quantita))) / kg), righe: usa.length, nelPeriodo: nel.length > 0, prezzi };
}

// ── Valori di partenza delle leve per una specie ────────────────────────────────────────────────
export function partenza(A, P, specie, scenario = "base", fascia = "12-24") {
  const camp = campione(A, specie, fascia);
  const tec = tecnici(A, P, specie, scenario);
  const prezzo = prezzoApplicato(A, P, specie);
  let pesoCarcassa = camp.pesoCarcassa, quotaNati = camp.quotaNati !== null ? camp.quotaNati * 100 : null, fontePeso = "campione";
  if (specie === "ovino" && !(camp.numero > 0)) {
    // agnelli senza scheda: peso medio della carcassa dalle fatture del periodo (o di tutte le fatture)
    const ag = tec.agnelli?.capi > 0 ? tec.agnelli : agnelliFatturati(A, { da: "2000-01-01", a: P.a });
    pesoCarcassa = ag.capi > 0 ? ag.kg / ag.capi : null; quotaNati = 100; fontePeso = "fatture";
  }
  return {
    camp, tec, prezzoInfo: prezzo, fontePeso,
    leve: {
      prezzo: prezzo.prezzo, pesoCarcassa, resa: camp.resa, permanenza: camp.permanenzaMesi,
      quotaNati, acquisto: camp.acquistoMedio,
      interparto: tec.interpartoImplicito, natiPerParto: tec.natiPerParto, mortalita: tec.mortalita * 100,
      variazioneVariabili: 0, variazioneFissi: 0,
    },
  };
}

// ── Il calcolo del pareggio ─────────────────────────────────────────────────────────────────────
// L = leve (valori numerici), C = costi della specie nel periodo, T = tecnici, K = capo tipo (campione), Q = produzione
export function calcolaPareggio({ L, C, T, K, Q }) {
  const vv = 1 + num(L.variazioneVariabili) / 100, vf = 1 + num(L.variazioneFissi) / 100;
  const peso = num(L.pesoCarcassa), resa = num(L.resa), prezzo = num(L.prezzo);
  const pesoVivo = resa > 0 ? peso / (resa / 100) : null;
  const prezzoVivo = resa > 0 ? prezzo * resa / 100 : null;
  const perm = num(L.permanenza) > 0 ? num(L.permanenza) : (K.permanenzaMesi || 0);
  const fattoreDurata = K.permanenzaMesi > 0 && perm > 0 ? perm / K.permanenzaMesi : 1;
  const interparto = num(L.interparto), natiPerParto = num(L.natiPerParto), mort = Math.min(Math.max(num(L.mortalita), 0), 99) / 100;
  const natiVendibiliPerMadre = interparto > 0 ? (365 / interparto) * natiPerParto * (1 - mort) : null;
  const costoMandriaPerMadre = T.costoMandriaPerMadre !== null ? T.costoMandriaPerMadre * vv : null;
  const costoPerNato = natiVendibiliPerMadre > 0 && costoMandriaPerMadre !== null ? costoMandriaPerMadre / natiVendibiliPerMadre : null;
  const q = Math.min(Math.max(num(L.quotaNati), 0), 100) / 100;
  const acquisto = num(L.acquisto);
  const partenzaCapo = (q > 0 ? q * (costoPerNato ?? 0) : 0) + (1 - q) * acquisto;
  // agnelli senza campione: giorni di presenza pesati ricavati dai mesi scritti (coefficiente dell'agnello 0,027)
  const ubaVita = K.ubaVita || (K.specie === "ovino" && perm > 0 ? perm * MESE * UBA_FASCE_EXP.ovino[0].coeff : 0);
  const mantenimento = ubaVita * (K.ubaVita ? fattoreDurata : 1) * C.tassoVariabile * vv;
  const costoVariabile = partenzaCapo + mantenimento;
  const ricavo = prezzo * peso;
  const margine = ricavo - costoVariabile;
  const fissi = C.fissi * vf, fissiCassa = Math.max(C.fissi * vf - C.ammortamenti, 0);
  const ok = margine > 0;
  const capiEsatti = ok ? fissi / margine : null;
  const capi = ok ? Math.ceil(capiEsatti - 1e-9) : null;
  const capiCassa = ok ? Math.ceil(fissiCassa / margine - 1e-9) : null;
  const prod = Q?.capiProdotti ?? null;
  const risultato = prod !== null ? prod * margine - fissi : null;
  const sicurezza = prod > 0 && capiEsatti !== null && capiEsatti <= prod ? (prod - capiEsatti) / prod * 100 : null;
  const copertura = prod > 0 && capiEsatti !== null && capiEsatti > prod ? prod / capiEsatti * 100 : null; // la produzione copre solo questa parte del pareggio
  const contribuzioneTotale = prod !== null ? prod * margine : null;
  const leva = risultato > 0 ? contribuzioneTotale / risultato : null;
  const stalla = capi === null ? null : {
    ingrasso: Math.ceil(capi * perm / 12 - 1e-9),
    madri: q > 0 ? (natiVendibiliPerMadre > 0 ? Math.ceil(capi * q / natiVendibiliPerMadre - 1e-9) : null) : 0,
  };
  if (stalla) stalla.tori = stalla.madri === null ? null : Math.ceil(stalla.madri * (T.toriPerMadre || 0) - 1e-9);
  if (stalla) stalla.totale = stalla.madri === null || stalla.tori === null ? null : stalla.ingrasso + stalla.madri + stalla.tori;
  return {
    peso, pesoVivo, prezzo, prezzoVivo, resa, perm, natiVendibiliPerMadre, costoMandriaPerMadre, costoPerNato, q, acquisto,
    partenzaCapo, mantenimento, costoVariabile, ricavo, margine, fissi, fissiCassa, capiEsatti, capi, capiCassa,
    kgCarcassa: capi !== null ? capi * peso : null, kgVivo: capi !== null && pesoVivo ? capi * pesoVivo : null, fatturato: capi !== null ? capi * ricavo : null,
    prod, risultato, sicurezza, copertura, leva, contribuzioneTotale, stalla, ubaVita,
    // a quale prezzo si va in pari con la produzione del periodo (sola informazione)
    prezzoPareggioProduzione: prod > 0 && peso > 0 ? (fissi / prod + costoVariabile) / peso : null,
  };
}

// Pareggio dell'azienda intera con il mix dei capi prodotti nel periodo
export function pareggioAzienda(risultati) {
  const r = risultati.filter(x => x && x.prod !== null && x.prod > 0);
  const fissi = somma(risultati.filter(Boolean).map(x => x.fissi));
  const ricavi = somma(r.map(x => x.prod * x.ricavo)), variabili = somma(r.map(x => x.prod * x.costoVariabile));
  const rapporto = ricavi > 0 ? variabili / ricavi : null;
  const fatturatoPareggio = rapporto !== null && rapporto < 1 ? fissi / (1 - rapporto) : null;
  return {
    fissi, ricavi, variabili, margine: ricavi - variabili, risultato: ricavi - variabili - fissi, fatturatoPareggio,
    sicurezza: fatturatoPareggio !== null && ricavi > 0 ? (ricavi - fatturatoPareggio) / ricavi * 100 : null,
    leva: ricavi - variabili - fissi > 0 ? (ricavi - variabili) / (ricavi - variabili - fissi) : null,
  };
}

// ── Anomalie (pagina 7) ─────────────────────────────────────────────────────────────────────────
export function anomalie(A, P, scenario = "base") {
  const parti = partiPerMadre(A);
  const oggi = ms(isoDa(Date.now()));
  const fineP = Math.min(ms(P.a), oggi);
  const out = { madriImproduttive: [], scottoneSegnateMadri: [], partoriteNonSegnate: [], partiPrimaDellaNascita: [], suiniLotto: suiniLottoAnomali(A), senzaPeso: {}, mortalita: {}, causeMorte: {} };
  const grezzi = new Map((A.g.animali || []).map(a => [a.id, a]));
  for (const a of animaliNormalizzati(A)) {
    if (!SPECIE.includes(a.specie) || !String(a.sesso || "").toUpperCase().startsWith("F")) continue;
    const pa = parti.get(a.id) || [];
    const nascita = ms(a.nascita);
    // parti registrati prima della nascita (errore di una delle due date)
    pa.filter(p => nascita !== null && ms(p.data) < nascita).forEach(p => out.partiPrimaDellaNascita.push({ specie: a.specie, codice: a.bdn || a.nome || `scheda ${a.id}`, nascita: giorno(a.nascita), parto: p.data }));
    // solo le femmine in azienda alla fine del periodo (le madri «storiche» o esterne non ci sono)
    const pres = presenzaAnimale(a, P);
    if (!pres || (a.data_uscita && ms(a.data_uscita) <= fineP) || a.stato === "storico") continue;
    const ultimo = pa.filter(p => ms(p.data) <= fineP).at(-1);
    const prossimo = pa.find(p => ms(p.data) > fineP);
    const gravida = prossimo && (ms(prossimo.data) - fineP) / GIORNO <= GESTAZIONE_GIORNI[a.specie];
    if (ultimo) {
      const mesi = (fineP - ms(ultimo.data)) / GIORNO / MESE;
      if (mesi > SOGLIA_MADRE_MESI[a.specie] && !gravida) out.madriImproduttive.push({ specie: a.specie, id: a.id, codice: a.bdn || a.nome || `scheda ${a.id}`, ultimoParto: ultimo.data, mesi });
      if (!grezzi.get(a.id)?.riproduttore) out.partoriteNonSegnate.push({ specie: a.specie, id: a.id, codice: a.bdn || a.nome || `scheda ${a.id}`, ultimoParto: ultimo.data, parti: pa.length, stato: a.stato, uscita: giorno(a.data_uscita) });
    } else if (a.specie === "bovino" && grezzi.get(a.id)?.riproduttore && !pa.length && nascita !== null && (fineP - nascita) / GIORNO / MESE > SOGLIA_SCOTTONA_MESI) {
      out.scottoneSegnateMadri.push({ specie: a.specie, id: a.id, codice: a.bdn || a.nome || `scheda ${a.id}`, nascita: giorno(a.nascita), mesi: (fineP - nascita) / GIORNO / MESE });
    }
  }
  for (const s of SPECIE) {
    const t = tecnici(A, P, s, scenario);
    out.mortalita[s] = { vivi: t.viviP, nonViviAlParto: t.mortiP, mortiDopo: t.mortiDopo, percAlParto: t.natiMortiPerc, percDopo: t.viviP > 0 ? t.mortiDopo / t.viviP : null };
    const pr = produzione(A, P, s, "con");
    out.senzaPeso[s] = pr.senzaPeso;
    // cause di morte registrate nel periodo (capi con scheda e suinetti dei lotti)
    const cause = new Map();
    const conta = c => cause.set(c, (cause.get(c) || 0) + 1);
    for (const a of A.g.animali || []) if (a.specie === s && /decedut|mort/i.test(a.stato || "") && dentro(giorno(a.data_uscita), P)) conta((a.causa_morte || "").trim() || "causa non indicata");
    if (s === "suino") for (const u of A.g.unita || []) if (/mort|decedut/i.test(u.stato || "") && dentro(giorno(u.data_uscita), P)) conta((u.causa_morte || "").trim() || "causa non indicata");
    out.causeMorte[s] = [...cause.entries()].map(([causa, n]) => ({ causa, n })).sort((x, y) => y.n - x.n);
  }
  return out;
}

// ── Fotografia (pagina 8): i numeri da conservare ──────────────────────────────────────────────
export function datiFotografia({ P, scenario, perSpecie, azienda }) {
  const r2 = x => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
  return {
    versione: 314, periodo: { id: P.id, da: P.da, a: P.a, etichetta: P.etichetta }, scenario,
    specie: Object.fromEntries(Object.entries(perSpecie).filter(([, v]) => v).map(([s, v]) => [s, {
      leve: Object.fromEntries(Object.entries(v.L).map(([k, x]) => [k, r2(num(x))])),
      tecnici: { madri: r2(v.T.madriMedie), interparto: r2(v.R.natiVendibiliPerMadre ? num(v.L.interparto) : null), natiPerParto: r2(num(v.L.natiPerParto)), mortalita: r2(num(v.L.mortalita)), natiVendibiliPerMadre: r2(v.R.natiVendibiliPerMadre), natiMortiAlParto: r2(v.T.natiMortiPerc !== null ? v.T.natiMortiPerc * 100 : null) },
      economici: { fissi: r2(v.R.fissi), costoVariabile: r2(v.R.costoVariabile), costoPerNato: r2(v.R.costoPerNato), ricavo: r2(v.R.ricavo), margine: r2(v.R.margine), capiPareggio: v.R.capi, kgCarcassaPareggio: r2(v.R.kgCarcassa), capiProdotti: v.R.prod, sicurezza: r2(v.R.sicurezza), risultato: r2(v.R.risultato), leva: r2(v.R.leva), capiCassa: v.R.capiCassa },
    }])),
    azienda: azienda ? { fissi: r2(azienda.fissi), ricavi: r2(azienda.ricavi), fatturatoPareggio: r2(azienda.fatturatoPareggio), sicurezza: r2(azienda.sicurezza), risultato: r2(azienda.risultato) } : null,
  };
}

// ── Tutto il calcolo di una specie (le pagine usano solo questa funzione) ───────────────────────
// valori = valori scritti a mano nelle leve (testi); quelli vuoti tornano al valore di partenza
export const leggiNumero = v => { const n = parseFloat(String(v ?? "").replace(/\./g, (m, i, t) => (t.includes(",") ? "" : m)).replace(",", ".")); return Number.isFinite(n) ? n : null; };
export function calcolaSpecie(A, P, specie, scenario = "base", fascia = "12-24", valori = {}) {
  const p = partenza(A, P, specie, scenario, fascia);
  const L = { ...p.leve };
  for (const [k, v] of Object.entries(valori || {})) { const n = leggiNumero(v); if (n !== null) L[k] = n; }
  const C = costiPeriodo(A, P, scenario).perSpecie[specie];
  const T = p.tec, K = p.camp;
  const Q = produzione(A, P, specie, scenario, L.pesoCarcassa);
  const R = calcolaPareggio({ L, C, T, K, Q });
  return { specie, p, L, C, T, K, Q, R, modificati: Object.keys(valori || {}).filter(k => leggiNumero(valori[k]) !== null) };
}

// Costo variabile di un anno di una madre (o di un riproduttore) che non produce: UBA-giorni dell'anno × costo variabile per UBA al giorno
export function costoAnnuoCapo(A, P, scenario, specie, animaleId) {
  const riga = ubaPeriodo(A, P, esclusiScenario(A, scenario)).find(r => r.animale_id === animaleId);
  const C = costiPeriodo(A, P, scenario).perSpecie[specie];
  return riga ? riga.uba_giorni * C.tassoVariabile * 365 / giorniPeriodo(P) : null;
}
export { giorniPeriodo };
