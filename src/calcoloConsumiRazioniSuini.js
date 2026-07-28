import { supabase } from "./supabase";
import { fetchAllPages, round2 } from "./parsingUtils";
import { periodoNellAnnoExp } from "./motoreUba";
import { calcolaDatiQuantitaAnno, CENTRO_COSTO_MANGIMI } from "./calcoloQuantitaMangimi";

// Assegna i giorni di presenza di un suino/unità-lotto NON riproduttivo alle categorie
// di razione per fascia d'età (Magroncello x3 fasi, Magrone, Da Ingrasso) — analitico,
// nessun bisogno di ciclo giorno-per-giorno dato che dipende solo dall'età.
function giorniPerCategoriaEta(nascita, giornoInizioPresenza, giornoFinePresenza, categorieEta) {
  const risultato = new Map(); // categoria.id -> giorni
  for (const cat of categorieEta) {
    const etaMinCat = cat.giorni_eta_da ?? 0;
    const etaMaxCat = cat.giorni_eta_a ?? Infinity;
    // Intervallo di età [etaMinCat, etaMaxCat] corrisponde a date [nascita+etaMin, nascita+etaMax]
    const dataInizioCat = new Date(nascita); dataInizioCat.setDate(dataInizioCat.getDate() + etaMinCat);
    const dataFineCat = Number.isFinite(etaMaxCat) ? (() => { const d = new Date(nascita); d.setDate(d.getDate() + etaMaxCat); return d; })() : null;

    const inizio = dataInizioCat > giornoInizioPresenza ? dataInizioCat : giornoInizioPresenza;
    const fine = dataFineCat && dataFineCat < giornoFinePresenza ? dataFineCat : giornoFinePresenza;
    if (inizio > fine) continue;
    const giorni = Math.round((fine - inizio) / 86400000) + 1;
    if (giorni > 0) risultato.set(cat.id, (risultato.get(cat.id) || 0) + giorni);
  }
  return risultato;
}

// Per le Riproduttrici: unione delle finestre [-7,+45] attorno a ciascun parto
// registrato, ritagliate dentro la presenza nell'anno — il resto dei giorni è
// "Riproduttrice" normale.
function giorniRiproduttrice(giornoInizioPresenza, giornoFinePresenza, dateParti) {
  const finestre = dateParti.map(dp => {
    const inizio = new Date(dp); inizio.setDate(inizio.getDate() - 7);
    const fine = new Date(dp); fine.setDate(fine.getDate() + 45);
    const i = inizio > giornoInizioPresenza ? inizio : giornoInizioPresenza;
    const f = fine < giornoFinePresenza ? fine : giornoFinePresenza;
    return i <= f ? { inizio: i, fine: f } : null;
  }).filter(Boolean).sort((a, b) => a.inizio - b.inizio);

  // Unisce finestre sovrapposte (es. due parti ravvicinati)
  const unite = [];
  for (const fw of finestre) {
    const ultima = unite[unite.length - 1];
    if (ultima && fw.inizio <= new Date(ultima.fine.getTime() + 86400000)) {
      if (fw.fine > ultima.fine) ultima.fine = fw.fine;
    } else {
      unite.push({ ...fw });
    }
  }
  const giorniGravidanza = unite.reduce((s, fw) => s + Math.round((fw.fine - fw.inizio) / 86400000) + 1, 0);
  const giorniTotali = Math.round((giornoFinePresenza - giornoInizioPresenza) / 86400000) + 1;
  return { giorniGravidanza, giorniNormale: Math.max(0, giorniTotali - giorniGravidanza) };
}

export async function calcolaConsumoTeoricoSuini(anno) {
  const { data: categorie, error: eC } = await supabase.from("ci_razioni_categorie").select("*").eq("specie", "suino").eq("anno", anno);
  if (eC) throw new Error(eC.message);
  if (!categorie || categorie.length === 0) return { kgPerProdotto: {}, nCategorieUsate: 0 };

  const idCategorie = categorie.map(c => c.id);
  const { data: prodotti, error: eP } = await supabase.from("ci_razioni_prodotti").select("*").in("categoria_id", idCategorie);
  if (eP) throw new Error(eP.message);
  const prodottiPerCategoria = new Map();
  (prodotti || []).forEach(p => {
    if (!prodottiPerCategoria.has(p.categoria_id)) prodottiPerCategoria.set(p.categoria_id, []);
    prodottiPerCategoria.get(p.categoria_id).push(p);
  });

  const catRiproduttore = categorie.find(c => c.richiede_riproduttore && c.richiede_sesso === "M");
  const catRiproduttrice = categorie.find(c => c.richiede_riproduttore && c.richiede_sesso === "F" && !c.richiede_gravidanza_allattamento);
  const catGravidanza = categorie.find(c => c.richiede_gravidanza_allattamento);
  const categorieEta = categorie.filter(c => !c.richiede_riproduttore);

  const [{ data: animali, error: eA }, { data: lotti, error: eL }, { data: suiniLotto, error: eS }, { data: eventi, error: eEv }] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("animali").select("id,specie,sesso,riproduttore,nascita,data_ingresso,data_uscita,stato").eq("specie", "suino").range(da, a)),
    fetchAllPages((da, a) => supabase.from("lotti_suini").select("id,data_parto").eq("specie", "suino").range(da, a)),
    fetchAllPages((da, a) => supabase.from("suini_lotto").select("lotto_id,stato,data_uscita").range(da, a)),
    fetchAllPages((da, a) => supabase.from("eventi_riproduttivi").select("animale_id,tipo_evento,data_evento").eq("tipo_evento", "parto").range(da, a)),
  ]);
  if (eA) throw new Error(eA.message);
  if (eL) throw new Error(eL.message);
  if (eS) throw new Error(eS.message);
  if (eEv) throw new Error(eEv.message);

  const inizioAnno = new Date(anno, 0, 1);
  const fineAnno = new Date(anno, 11, 31, 23, 59, 59);
  const oggi = new Date();
  const partiPerAnimale = new Map();
  (eventi || []).forEach(e => {
    if (!partiPerAnimale.has(e.animale_id)) partiPerAnimale.set(e.animale_id, []);
    partiPerAnimale.get(e.animale_id).push(new Date(e.data_evento));
  });

  const giorniPerCategoriaId = new Map(); // categoria.id -> giorni totali (tutti gli animali/unità sommati)

  function accumula(categoriaId, giorni) {
    if (!categoriaId || giorni <= 0) return;
    giorniPerCategoriaId.set(categoriaId, (giorniPerCategoriaId.get(categoriaId) || 0) + giorni);
  }

  // --- Animali tracciati singolarmente ---
  for (const a of animali || []) {
    const nascita = a.nascita || a.data_ingresso;
    if (!nascita) continue;
    const periodo = periodoNellAnnoExp(nascita, a.data_uscita, a.stato, anno);
    if (!periodo) continue;
    const giornoInizio = new Date(periodo.inizio), giornoFine = new Date(periodo.fine);

    if (a.riproduttore) {
      if (a.sesso === "M") {
        accumula(catRiproduttore?.id, Math.round((giornoFine - giornoInizio) / 86400000) + 1);
      } else if (a.sesso === "F") {
        const parti = partiPerAnimale.get(a.id) || [];
        const { giorniGravidanza, giorniNormale } = giorniRiproduttrice(giornoInizio, giornoFine, parti);
        accumula(catGravidanza?.id, giorniGravidanza);
        accumula(catRiproduttrice?.id, giorniNormale);
      }
    } else {
      const mappa = giorniPerCategoriaEta(new Date(nascita), giornoInizio, giornoFine, categorieEta);
      mappa.forEach((giorni, catId) => accumula(catId, giorni));
    }
  }

  // --- Suinetti nei lotti (esclusi quelli "promossi" a individuali, per non contarli due volte) ---
  for (const l of lotti || []) {
    if (!l.data_parto) continue;
    for (const u of (suiniLotto || []).filter(x => x.lotto_id === l.id)) {
      if (u.stato === "registrato_individuale") continue;
      const periodo = periodoNellAnnoExp(l.data_parto, u.data_uscita, u.stato === "attivo" ? "attivo" : (u.stato || "uscito"), anno);
      if (!periodo) continue;
      const giornoInizio = new Date(periodo.inizio), giornoFine = new Date(periodo.fine);
      const mappa = giorniPerCategoriaEta(new Date(l.data_parto), giornoInizio, giornoFine, categorieEta);
      mappa.forEach((giorni, catId) => accumula(catId, giorni));
    }
  }

  // --- Da giorni-per-categoria a kg-per-prodotto ---
  const kgPerProdotto = {};
  let nCategorieUsate = 0;
  giorniPerCategoriaId.forEach((giorni, catId) => {
    nCategorieUsate++;
    const prods = prodottiPerCategoria.get(catId) || [];
    prods.forEach(p => {
      kgPerProdotto[p.prodotto] = round2((kgPerProdotto[p.prodotto] || 0) + p.kg_giorno * giorni);
    });
  });

  return { kgPerProdotto, nCategorieUsate, giorniPerCategoriaId: Object.fromEntries(giorniPerCategoriaId) };
}

// Confronta il consumo teorico (dalle razioni) con quello reale (Report Quantità
// Mangimi, destinazione Suini) — match per parola chiave, non per nome esatto
// (fornitori diversi chiamano lo stesso prodotto in modo diverso).
const PAROLE_CHIAVE_PRODOTTO = {
  "Orzo Farina": ["orzo", "grancereale"],
  "Suistar 20 Pel.Rinfusa": ["suistar"],
  "Suini Sprint 60 Pel.Rinfusa": ["sprint"],
  "SL 1 Life Pellet Sfuso": ["sl 1", "sl1"],
};

export async function confrontaConsumoSuini(anno) {
  const [teorico, datiReali] = await Promise.all([
    calcolaConsumoTeoricoSuini(anno),
    calcolaDatiQuantitaAnno(anno, CENTRO_COSTO_MANGIMI),
  ]);

  const righe = Object.entries(PAROLE_CHIAVE_PRODOTTO).map(([prodottoRazione, paroleChiave]) => {
    const kgTeorico = teorico.kgPerProdotto[prodottoRazione] || 0;

    const prodottiRealiMatch = datiReali.perProdotto.filter(p =>
      paroleChiave.some(parola => p.descrizione.toLowerCase().includes(parola))
    );
    const kgReale = round2(prodottiRealiMatch.reduce((s, p) => s + (p.perKg.perSpecie.suino?.costoAllocato || 0), 0));
    const costoReale = round2(prodottiRealiMatch.reduce((s, p) => s + (p.perCosto.perSpecie.suino?.costoAllocato || 0), 0));
    const prezzoMedioReale = kgReale > 0 ? costoReale / kgReale : null;
    const valoreTeorico = prezzoMedioReale != null ? round2(kgTeorico * prezzoMedioReale) : null;

    return {
      prodotto: prodottoRazione, kgTeorico, kgReale,
      valoreTeorico, valoreReale: costoReale,
      scartoKg: round2(kgTeorico - kgReale),
      scartoValore: valoreTeorico != null ? round2(valoreTeorico - costoReale) : null,
      prodottiRealiCorrispondenti: prodottiRealiMatch.map(p => p.descrizione),
    };
  });

  return { righe, nCategorieUsate: teorico.nCategorieUsate };
}
