// Versione 325 (29/10/2026, decisioni del Dott. Bizzarri del 28–29/10/2026): Alimentaria → Razioni attive e Controllo costi.
// Confronto, per specie, alimento e anno, tra:
//   TEORICO = razione in uso di ogni classe × capi presenti nella classe, giorno per giorno (capi contati dal registro);
//   REALE   = acquistato con le fatture (regole di prezzo dell'anagrafe degli alimenti, note di credito comprese)
//             + prodotto in azienda e dato agli animali (fieno e medica; l'orzo conferito a Muratella e ricomprato
//             come farina NON si conta: decisione del 28/10/2026 ore 21:27).
// Destinazione delle fatture: la specie scritta va a quella specie; «Generali» e le coppie di specie si dividono in base
// agli UBA-giorni produttivi dell'anno, con la stessa funzione del Report Costi (calcolaRigaAggregata).
import { oggiRoma } from "./dateRoma";
import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";
import { caricaDatiGrezziAnno } from "./calcoloReportCosti";
import { calcolaRigaAggregata } from "./motoreUba";
import { calcolaConsumoTeoricoSuini } from "./calcoloConsumiRazioniSuini";

const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const GIORNO = 86400000;
const giorno = s => (s ? Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) : null);
const iso = t => new Date(t).toISOString().slice(0, 10);
function mesiTra(nascita, t) {
  const a = new Date(nascita), b = new Date(t);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
}
const aggiungiMesi = (t, m) => { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + m); return d.getTime(); };

export const PARAMETRI_INIZIALI = { giorniFinissaggio: 45, mesiLattazioneBovini: 5, giorniLattazioneOvini: 60, giorniSottoMadreOvini: 60 };

// Prodotti delle razioni dei suini (pagina «Composizione Razioni») → alimenti dell'anagrafe
export const PRODOTTI_SUINI_ALIMENTI = {
  "Orzo Farina": "Farina d'orzo",
  "SL 1 Life Pellet Sfuso": "Progeo SL 1 Life",
  "Suini Sprint 60 Pel.Rinfusa": "Veronesi Suini Sprint 60",
  "Suistar 20 Pel.Rinfusa": "Veronesi Suistar 20",
};

const MAPPA_DEST = { "Bovini": "bovino", "Suini": "suino", "Ovini": "ovino", "Generali": "generale", "Bovini e Ovini": "bovinoOvino", "Bovini e Suini": "bovinoSuino", "Suini e Ovini": "suinoOvino" };
const TONNELLATE = { kg: 0.001, quintale: 0.1, tonnellata: 1, rotoballa: 0.34, "sacco da 25 kg": 0.025, "secchio da 22 kg": 0.022, "busta da 700 g": 0.0007, "confezione da 5 kg": 0.005, "blocco da 20 kg": 0.02 };
const likeRegex = p => new RegExp("^" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", "is");
const piva = s => (s || "").replace(/\s/g, "").toUpperCase();

// ── REALE: acquisti dell'anno per alimento, divisi per specie ─────────────────────────────────────
export async function caricaAcquistiAlimenti(anno) {
  const [{ data: regole, error: eR }, { data: alimenti, error: eA }, { data: fatture, error: eF }, { data: fornitori, error: eFo }] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("ci_alimenti_regole_prezzo").select("*").order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("ci_alimenti_nutrizione").select("id,nome,tipologia_prezzo,specie,gruppo,unita_dose,prodotto_coltivazione,attivo").order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("ci_fatture").select("id,data,numero,fornitore_id,regolarizzazione_di").eq("tipo", "PASSIVA").gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`).order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("ci_fornitori").select("id,nome,partita_iva").order("id").range(da, a)),
  ]);
  for (const e of [eR, eA, eF, eFo]) if (e) throw new Error(e.message);
  const fornitore = new Map(fornitori.map(f => [f.id, f]));
  const fattureValide = fatture.filter(f => !f.regolarizzazione_di);
  const fatturaPerId = new Map(fattureValide.map(f => [f.id, f]));
  const ids = fattureValide.map(f => f.id);
  let articoli = [];
  for (let i = 0; i < ids.length; i += 200) {
    const blocco = ids.slice(i, i + 200);
    const { data, error } = await fetchAllPages((da, a) => supabase.from("ci_articoli_fattura").select("id,fattura_id,descrizione,quantita,totale_riga,destinazione,area,centro_costo").in("fattura_id", blocco).order("id").range(da, a));
    if (error) throw new Error(error.message);
    articoli = articoli.concat(data || []);
  }
  const regoleC = regole.map(r => ({ ...r, re: likeRegex(r.descrizione_like), reNo: r.descrizione_non_like ? likeRegex(r.descrizione_non_like) : null, piva: piva(r.partita_iva) }));
  const alimentoDiTipologia = new Map();
  alimenti.forEach(a => { if (a.tipologia_prezzo && !alimentoDiTipologia.has(a.tipologia_prezzo)) alimentoDiTipologia.set(a.tipologia_prezzo, a); });

  const perAlimento = new Map(); // nome → { kgDiretti, euroDiretti, righe[] }
  const righeSenzaAlimento = [];
  articoli.forEach(r => {
    const f = fatturaPerId.get(r.fattura_id); if (!f) return;
    const fo = fornitore.get(f.fornitore_id); if (!fo) return;
    const pv = piva(fo.partita_iva);
    const regola = regoleC.find(x => x.piva === pv && x.re.test(r.descrizione || "") && !(x.reNo && x.reNo.test(r.descrizione || "")));
    if (!regola) return;
    const al = alimentoDiTipologia.get(regola.tipologia);
    if (!al) { righeSenzaAlimento.push({ ...r, tipologia: regola.tipologia }); return; }
    const kg = regola.componente === "merce" ? (Number(r.quantita) || 0) * (TONNELLATE[regola.unita_prezzo] || 0) * 1000 : 0;
    const euro = Number(r.totale_riga) || 0;
    const dest = (r.destinazione || "").trim();
    if (!perAlimento.has(al.nome)) perAlimento.set(al.nome, { alimento: al, kgDiretti: {}, euroDiretti: {}, kgPollame: 0, euroPollame: 0, righe: [] });
    const p = perAlimento.get(al.nome);
    p.righe.push({ data: f.data, numero: f.numero, fornitore: fo.nome, descrizione: r.descrizione, kg, euro, destinazione: dest, componente: regola.componente });
    if (dest === "Pollame") { p.kgPollame += kg; p.euroPollame += euro; return; }
    const ch = MAPPA_DEST[dest] || "generale";
    p.kgDiretti[ch] = (p.kgDiretti[ch] || 0) + kg;
    p.euroDiretti[ch] = (p.euroDiretti[ch] || 0) + euro;
  });

  const { ubaGiorniProduttiviAziendali, ubaGiorniProduttiviPerSpecie } = await caricaDatiGrezziAnno(anno);
  const risultato = [];
  perAlimento.forEach(p => {
    const kg = calcolaRigaAggregata(p.kgDiretti, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali).perSpecie;
    const eu = calcolaRigaAggregata(p.euroDiretti, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali).perSpecie;
    risultato.push({
      alimento: p.alimento.nome, gruppo: p.alimento.gruppo,
      perSpecie: Object.fromEntries(["bovino", "suino", "ovino"].map(sp => [sp, { kg: r2(kg[sp].costoAllocato), euro: r2(eu[sp].costoAllocato) }])),
      pollame: { kg: r2(p.kgPollame), euro: r2(p.euroPollame) },
      righe: p.righe.sort((a, b) => a.data.localeCompare(b.data)),
    });
  });

  // produzione aziendale data agli animali (non l'orzo conferito e ricomprato)
  const { data: prod, error: eP } = await supabase.from("ci_v_prezzi_riferimento").select("alimento,prodotto_coltivazione,produzione_t,produzione_euro_t,campagna").eq("anno", anno);
  if (eP) throw new Error(eP.message);
  const produzione = [];
  (prod || []).filter(x => Number(x.produzione_t) > 0 && !/orzo/i.test(x.prodotto_coltivazione || "")).forEach(x => {
    const kgDir = { bovinoOvino: Number(x.produzione_t) * 1000 };
    const euDir = { bovinoOvino: Number(x.produzione_t) * Number(x.produzione_euro_t || 0) };
    const kg = calcolaRigaAggregata(kgDir, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali).perSpecie;
    const eu = calcolaRigaAggregata(euDir, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali).perSpecie;
    produzione.push({ alimento: x.alimento, prodotto: x.prodotto_coltivazione, campagna: x.campagna, tonnellate: Number(x.produzione_t),
      perSpecie: Object.fromEntries(["bovino", "suino", "ovino"].map(sp => [sp, { kg: r2(kg[sp].costoAllocato), euro: r2(eu[sp].costoAllocato) }])) });
  });
  return { acquisti: risultato, produzione, righeSenzaAlimento, ubaGiorniProduttiviPerSpecie };
}

// ── Razioni salvate (in uso e storico) ───────────────────────────────────────────────────────────
export async function caricaRazioniSpecie(specie) {
  const [{ data: classi, error: eC }, { data: razioni, error: eR }] = await Promise.all([
    supabase.from("ci_fabbisogni_classi").select("classe,specie,ordine").eq("specie", specie).order("ordine"),
    supabase.from("ci_razioni_salvate").select("*").order("updated_at", { ascending: false }),
  ]);
  if (eC) throw new Error(eC.message);
  if (eR) throw new Error(eR.message);
  const nomiClassi = new Set((classi || []).map(c => c.classe));
  const delleClassi = (razioni || []).filter(r => nomiClassi.has(r.classe));
  const colonneUso = (razioni || []).length === 0 || "in_uso_dal" in (razioni[0] || {});
  return {
    classi: classi || [],
    inUso: delleClassi.filter(r => r.in_uso_dal && !r.in_uso_al),
    storico: delleClassi.filter(r => r.in_uso_dal && r.in_uso_al).sort((a, b) => b.in_uso_dal.localeCompare(a.in_uso_dal)),
    prove: delleClassi.filter(r => !r.in_uso_dal),
    tutteInUsoOStorico: delleClassi.filter(r => r.in_uso_dal),
    colonneUso,
  };
}

// ── TEORICO bovini e ovini: classe di ogni capo, giorno per giorno ───────────────────────────────
function trovaClasse(classi, ...parole) {
  const c = classi.find(x => parole.every(p => x.classe.toLowerCase().includes(p.toLowerCase())));
  return c ? c.classe : null;
}

export async function calcolaTeoricoRuminanti(specie, anno, parametri = PARAMETRI_INIZIALI) {
  const p = { ...PARAMETRI_INIZIALI, ...parametri };
  const inizio = Date.UTC(anno, 0, 1), fine = Math.min(Date.UTC(anno, 11, 31), giorno(oggiRoma()));
  const raz = await caricaRazioniSpecie(specie);
  const [{ data: animali, error: eA }, { data: alimenti, error: eAl }] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("animali").select("id,bdn,specie,sesso,razza,nascita,data_ingresso,data_uscita,motivo_uscita,stato,vivo,riproduttore,data_qualifica_riproduttore").eq("specie", specie).order("id").range(da, a)),
    supabase.from("ci_alimenti_nutrizione").select("nome,unita_dose"),
  ]);
  if (eA) throw new Error(eA.message);
  if (eAl) throw new Error(eAl.message);
  const unita = new Map((alimenti || []).map(a => [a.nome, a.unita_dose]));
  const ids = animali.map(a => a.id);
  let eventi = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await fetchAllPages((da, a) => supabase.from("eventi_riproduttivi").select("animale_id,tipo_evento,data_evento,nati_vivi").eq("tipo_evento", "parto").in("animale_id", ids.slice(i, i + 200)).order("id").range(da, a));
    if (error) throw new Error(error.message);
    eventi = eventi.concat(data || []);
  }
  const parti = new Map();
  eventi.forEach(e => { if (!parti.has(e.animale_id)) parti.set(e.animale_id, []); parti.get(e.animale_id).push(giorno(e.data_evento)); });
  parti.forEach(l => l.sort((a, b) => a - b));

  const C = raz.classi;
  const K = specie === "bovino" ? {
    vitello: "Vitello sotto la madre (latte della madre)",
    box1: trovaClasse(C, "box 1"), box2: trovaClasse(C, "box 2"), box3: trovaClasse(C, "box 3"), box4: trovaClasse(C, "box 4"), box5: trovaClasse(C, "box 5"),
    paddockF: trovaClasse(C, "paddock femmine"), finM: trovaClasse(C, "finissaggio maschi"), finF: trovaClasse(C, "finissaggio femmine"),
    lattazione: trovaClasse(C, "vacca in lattazione"), asciutta: trovaClasse(C, "vacca asciutta"), nono: trovaClasse(C, "vacca al 9"),
    manza: trovaClasse(C, "manza"), toroA: trovaClasse(C, "toro adulto"), toroG: trovaClasse(C, "toro giovane"),
  } : {
    sottoMadre: "Agnello sotto la madre (latte della madre)",
    agnello: trovaClasse(C, "agnello"), ariete: trovaClasse(C, "ariete"),
    vuotaS: trovaClasse(C, "vuota", "sopravissana"), vuotaF: trovaClasse(C, "vuota", "suffolk"),
    gestS: trovaClasse(C, "primi 3 mesi", "sopravissana"), gestF: trovaClasse(C, "primi 3 mesi", "suffolk"),
    fineS: trovaClasse(C, "fine gestazione", "sopravissana"), fineF: trovaClasse(C, "fine gestazione", "suffolk"),
    lattS: "Pecora in lattazione, 60 giorni dopo il parto, sopravissana (classe da creare)", lattF: "Pecora in lattazione, 60 giorni dopo il parto, suffolk (classe da creare)",
  };
  const senzaRazioneProprio = new Set([K.vitello, K.sottoMadre].filter(Boolean));

  function classeBovino(a, t) {
    const eta = mesiTra(a.nascita, t);
    const rip = a.riproduttore === true && (a.data_qualifica_riproduttore ? t >= giorno(a.data_qualifica_riproduttore) : eta >= 15);
    const uscitaMacello = a.data_uscita && /macell/i.test(a.motivo_uscita || "") ? giorno(a.data_uscita) : null;
    if (eta < 5) return K.vitello;
    if (!rip && uscitaMacello && uscitaMacello - t <= p.giorniFinissaggio * GIORNO) return a.sesso === "M" ? K.finM : K.finF;
    if (rip && a.sesso === "F") {
      const L = parti.get(a.id) || [];
      if (!L.some(x => x <= t)) return K.manza;
      if (L.some(x => x > t && x - t <= 30 * GIORNO)) return K.nono;
      if (L.some(x => x <= t && t < aggiungiMesi(x, p.mesiLattazioneBovini))) return K.lattazione;
      return K.asciutta;
    }
    if (rip && a.sesso === "M") return eta < 24 ? K.toroG : K.toroA;
    if (eta < 8) return K.box1;
    if (eta < 10) return K.box2;
    if (a.sesso === "F") return eta < 16 ? K.box3 : K.paddockF;
    return eta < 16 ? K.box4 : K.box5;
  }
  function classeOvino(a, t) {
    const gg = (t - giorno(a.nascita)) / GIORNO;
    const suff = /suffolk/i.test(a.razza || "");
    if (a.sesso === "M") return a.riproduttore === true ? K.ariete : (gg < p.giorniSottoMadreOvini ? K.sottoMadre : K.agnello);
    const eta = mesiTra(a.nascita, t);
    const pecora = a.riproduttore === true || eta >= 12;
    if (!pecora) return gg < p.giorniSottoMadreOvini ? K.sottoMadre : K.agnello;
    const L = parti.get(a.id) || [];
    if (L.some(x => x > t && x - t <= 42 * GIORNO)) return suff ? K.fineF : K.fineS;
    if (L.some(x => x > t && x - t <= 150 * GIORNO)) return suff ? K.gestF : K.gestS;
    if (L.some(x => x <= t && t < x + p.giorniLattazioneOvini * GIORNO)) return suff ? K.lattF : K.lattS;
    return suff ? K.vuotaF : K.vuotaS;
  }

  const razioneDel = (classe, t) => raz.tutteInUsoOStorico.find(r => r.classe === classe && giorno(r.in_uso_dal) <= t && (!r.in_uso_al || t <= giorno(r.in_uso_al)));
  const perClasse = new Map();
  const kg = {};
  const anomalie = [];
  const aggiungi = (classe, t, n = 1) => {
    const nome = classe || "Classe non trovata nelle tabelle dei fabbisogni";
    if (!perClasse.has(nome)) perClasse.set(nome, { classe: nome, giorniCapo: 0, giorniSenzaRazione: 0, razioni: new Set(), latte: senzaRazioneProprio.has(nome) });
    const c = perClasse.get(nome);
    c.giorniCapo += n;
    if (senzaRazioneProprio.has(nome)) return;
    const r = classe ? razioneDel(classe, t) : null;
    if (!r) { c.giorniSenzaRazione += n; return; }
    c.razioni.add(r.nome);
    (r.alimenti || []).forEach(x => {
      if (!x.alimento || !(Number(x.quantita) > 0)) return;
      const q = Number(x.quantita) * n * ((x.unita || unita.get(x.alimento)) === "grammi" ? 0.001 : 1);
      kg[x.alimento] = (kg[x.alimento] || 0) + q;
    });
  };

  animali.forEach(a => {
    if (!a.nascita) { anomalie.push(`${a.bdn}: senza data di nascita, non contato`); return; }
    if (a.vivo === false && !a.data_uscita) { anomalie.push(`${a.bdn}: non vivo ma senza data di uscita, non contato`); return; }
    const da = Math.max(inizio, giorno(a.data_ingresso) || giorno(a.nascita), giorno(a.nascita));
    const a_ = Math.min(fine, a.data_uscita ? giorno(a.data_uscita) - GIORNO : fine);
    for (let t = da; t <= a_; t += GIORNO) aggiungi(specie === "bovino" ? classeBovino(a, t) : classeOvino(a, t), t);
  });

  // ovini: agnelloni non registrati, dalla lista «Ovini da verificare con Sborchia» (parti verificati)
  let agnelloniDaVerifiche = 0;
  if (specie === "ovino") {
    const { data: ver } = await supabase.from("ci_verifiche_animali").select("agnelloni,inizio_ingrasso,fine_ingrasso").eq("specie", "ovino").eq("sezione", "Parti");
    (ver || []).forEach(v => {
      if (!(v.agnelloni > 0) || !v.inizio_ingrasso || !v.fine_ingrasso) return;
      const da = Math.max(inizio, giorno(v.inizio_ingrasso)), a_ = Math.min(fine, giorno(v.fine_ingrasso));
      for (let t = da; t <= a_; t += GIORNO) { aggiungi(K.agnello, t, v.agnelloni); agnelloniDaVerifiche += v.agnelloni; }
    });
  }

  const giorniAnno = (fine - inizio) / GIORNO + 1;
  const classi = [...perClasse.values()].map(c => ({ ...c, razioni: [...c.razioni], capiMedi: r2(c.giorniCapo / giorniAnno) }))
    .sort((a, b) => (C.findIndex(x => x.classe === a.classe) + 1 || 999) - (C.findIndex(x => x.classe === b.classe) + 1 || 999));
  return { kgPerAlimento: Object.fromEntries(Object.entries(kg).map(([k, v]) => [k, r2(v)])), classi, anomalie, giorniAnno, fineCalcolo: iso(fine), agnelloniDaVerifiche, razioni: raz };
}

// ── Confronto per specie ─────────────────────────────────────────────────────────────────────────
export async function confrontoSpecie(specie, anno, parametri, acquistiGiaCaricati = null) {
  const acquisti = acquistiGiaCaricati || await caricaAcquistiAlimenti(anno);
  let teorico, classi = [], anomalie = [], nota = null;
  if (specie === "suino") {
    const t = await calcolaConsumoTeoricoSuini(anno);
    teorico = {};
    Object.entries(t.kgPerProdotto || {}).forEach(([prod, v]) => { const al = PRODOTTI_SUINI_ALIMENTI[prod] || prod; teorico[al] = r2((teorico[al] || 0) + v); });
    nota = t.nCategorieUsate ? null : `Per il ${anno} non ci sono razioni dei suini nella «Composizione Razioni».`;
  } else {
    const t = await calcolaTeoricoRuminanti(specie, anno, parametri);
    teorico = t.kgPerAlimento; classi = t.classi; anomalie = t.anomalie;
  }
  const nomi = new Set(Object.keys(teorico));
  acquisti.acquisti.forEach(a => { if (a.perSpecie[specie].kg !== 0 || a.perSpecie[specie].euro !== 0) nomi.add(a.alimento); });
  acquisti.produzione.forEach(x => { if (x.perSpecie[specie].kg) nomi.add(x.alimento); });
  const righe = [...nomi].map(nome => {
    const acq = acquisti.acquisti.find(a => a.alimento === nome);
    const prd = acquisti.produzione.find(x => x.alimento === nome);
    const kgAcq = acq ? acq.perSpecie[specie].kg : 0, euroAcq = acq ? acq.perSpecie[specie].euro : 0;
    const kgPrd = prd ? prd.perSpecie[specie].kg : 0, euroPrd = prd ? prd.perSpecie[specie].euro : 0;
    const kgTeo = teorico[nome] || 0, kgReale = r2(kgAcq + kgPrd);
    const prezzo = kgReale > 0 ? (euroAcq + euroPrd) / kgReale : null;
    return {
      alimento: nome, kgTeorico: kgTeo, kgAcquistato: kgAcq, kgProdotto: kgPrd, kgReale,
      differenzaKg: r2(kgReale - kgTeo), differenzaPct: kgTeo > 0 ? r2((kgReale - kgTeo) / kgTeo * 100) : null,
      euroAcquisti: euroAcq, euroProduzione: euroPrd, prezzoKg: prezzo,
      euroTeorico: prezzo != null ? r2(kgTeo * prezzo) : null,
      differenzaEuro: prezzo != null ? r2((kgReale - kgTeo) * prezzo) : null,
    };
  }).sort((a, b) => (b.euroAcquisti + b.euroProduzione) - (a.euroAcquisti + a.euroProduzione) || b.kgTeorico - a.kgTeorico);
  const tot = righe.reduce((s, r) => ({ kgTeorico: s.kgTeorico + r.kgTeorico, kgReale: s.kgReale + r.kgReale, euroAcquisti: s.euroAcquisti + r.euroAcquisti, euroProduzione: s.euroProduzione + r.euroProduzione, euroTeorico: s.euroTeorico + (r.euroTeorico || 0), differenzaEuro: s.differenzaEuro + (r.differenzaEuro || 0) }),
    { kgTeorico: 0, kgReale: 0, euroAcquisti: 0, euroProduzione: 0, euroTeorico: 0, differenzaEuro: 0 });
  Object.keys(tot).forEach(k => { tot[k] = r2(tot[k]); });
  return { specie, anno, righe, classi, anomalie, totali: tot, nota };
}
