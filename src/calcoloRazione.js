// Calcolo della razione per capo: apporti, fabbisogni, percentuali di copertura e costi.
// Stesso calcolo nel programma di Contabilità Industriale e nell'app Podere Verde (versione 244).
// Dati: tabelle ci_alimenti_nutrizione, ci_fabbisogni_classi, vista ci_v_prezzi_alimenti_anno.

export const GRUPPI_RIGHE = [
  { gruppo: "Foraggio", etichetta: "Foraggio 1" },
  { gruppo: "Foraggio", etichetta: "Foraggio 2" },
  { gruppo: "Energetico", etichetta: "Energetico 1" },
  { gruppo: "Energetico", etichetta: "Energetico 2" },
  { gruppo: "Proteico", etichetta: "Proteico 1" },
  { gruppo: "Proteico", etichetta: "Proteico 2" },
  { gruppo: "Mangime composto", etichetta: "Mangime composto" },
  { gruppo: "Integratore minerale", etichetta: "Integratore minerale" },
];

// voce, campo dell'alimento (per kg tal quale), se è «principale» (energia e proteine: si segnala l'eccesso)
const NUTRIENTI = [
  { chiave: "pdi", nome: "Proteina digeribile (PDI)", unita: "g", campo: "pdi_g", principale: true, decimali: 0 },
  { chiave: "pg", nome: "Proteina grezza", unita: "g", campo: "proteina_grezza_g", principale: true, decimali: 0 },
  { chiave: "ca", nome: "Calcio", unita: "g", campo: "calcio_g", decimali: 1 },
  { chiave: "p", nome: "Fosforo", unita: "g", campo: "fosforo_g", decimali: 1 },
  { chiave: "mg", nome: "Magnesio", unita: "g", campo: "magnesio_g", decimali: 1 },
  { chiave: "na", nome: "Sodio", unita: "g", campo: "sodio_g", decimali: 1 },
  { chiave: "cu", nome: "Rame", unita: "mg", campo: "rame_mg", decimali: 0 },
  { chiave: "zn", nome: "Zinco", unita: "mg", campo: "zinco_mg", decimali: 0 },
  { chiave: "mn", nome: "Manganese", unita: "mg", campo: "manganese_mg", decimali: 0 },
  { chiave: "se", nome: "Selenio", unita: "mg", campo: "selenio_mg", decimali: 2 },
  { chiave: "i", nome: "Iodio", unita: "mg", campo: "iodio_mg", decimali: 2 },
  { chiave: "co", nome: "Cobalto", unita: "mg", campo: "cobalto_mg", decimali: 2 },
  { chiave: "vita", nome: "Vitamina A", unita: "unità", campo: "vitamina_a_ui", decimali: 0 },
];

// tipo di alimentazione: «naturale» = foraggi e farine semplici (niente mangimi composti);
// «mangimi» = foraggi, farina d'orzo e mangimi composti (niente altre farine); «libera» = tutti gli alimenti.
export const TIPI_ALIMENTAZIONE = [
  { valore: "libera", etichetta: "Libera (tutti gli alimenti)" },
  { valore: "naturale", etichetta: "Alimentazione naturale (foraggi e farine)" },
  { valore: "mangimi", etichetta: "Alimentazione con mangimi (foraggi, orzo e mangimi)" },
];
export function alimentoAmmesso(tipo, alimento) {
  if (!alimento) return false;
  if (tipo === "naturale") return alimento.gruppo !== "Mangime composto";
  if (tipo === "mangimi") return alimento.gruppo !== "Proteico" && (alimento.gruppo !== "Energetico" || /orzo/i.test(alimento.nome));
  return true;
}

// percentuale da mostrare: senza decimali, ma con i decimali che servono perché il numero
// non contraddica l'esito (99,9% e non 100% se manca; 110,3% e non 110% se eccessivo)
export function testoPercentuale(v) {
  if (!v || v.pct === null || v.pct === undefined) return "—";
  const fmt = (x, d) => x.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%";
  if (v.stato === "coperto") return fmt(Math.floor(v.pct), 0);          // coperto: sempre almeno 100%
  for (let d = 0; d <= 4; d++) {
    const f = 10 ** d;
    if (v.stato === "manca") { const x = Math.floor(v.pct * f) / f; if (x < 100) return fmt(x, d); }
    else if (v.stato === "eccessivo") { const x = Math.ceil(v.pct * f) / f; if (x > v.soglia) return fmt(x, d); }
    else return fmt(Math.round(v.pct), 0);
  }
  return fmt(v.pct, 4);
}

// quantità che manca: con i decimali della voce, ma mai «0» se manca qualcosa
export function decimaliMancante(v) {
  let d = v.decimali || 0;
  while (d < 4 && v.mancaQuanto > 0 && Math.round(v.mancaQuanto * 10 ** d) === 0) d++;
  return d;
}

const n = v => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

// kg tal quale di una riga: il Codibloc si scrive in grammi
export function kgTalQuale(riga, alimento) {
  const q = n(riga?.quantita);
  if (!alimento || q === null || q <= 0) return 0;
  return alimento.unita_dose === "grammi" ? q / 1000 : q;
}

/**
 * @param {object} classe  riga di ci_fabbisogni_classi
 * @param {Array}  righe   [{gruppo, alimento (nome), quantita}] — quantità per capo al giorno (kg; grammi per l'integratore)
 * @param {object} alimentiPerNome  { nome: riga di ci_alimenti_nutrizione }
 * @param {object} prezziPerNome    { nome: { prezzo_euro_t, fonte_prezzo } } dell'anno in corso
 * @param {number} numeroCapi
 */
export function calcolaRazione(classe, righe, alimentiPerNome, prezziPerNome, numeroCapi = 1) {
  const capi = Math.max(1, parseInt(numeroCapi, 10) || 1);
  let ss = 0, ufl = 0, ufv = 0;
  const tot = {}; const mancanti = {}; const contributi = { energia: [] };
  NUTRIENTI.forEach(x => { tot[x.chiave] = 0; mancanti[x.chiave] = []; contributi[x.chiave] = []; });
  const energiaUFL = classe?.unita_energia === "UFL";
  let costoCapo = 0; const prezziMancanti = []; const prezziListino = [];

  const righeCalcolate = righe.map(r => {
    const a = r.alimento ? alimentiPerNome[r.alimento] : null;
    const kg = kgTalQuale(r, a);
    if (!a || kg <= 0) return { ...r, kg: 0, costoCapo: null, kgTutti: null, statoPrezzo: null };
    ss += kg * (n(a.sostanza_secca_pct) || 0) / 100;
    ufl += kg * (n(a.ufl) || 0);
    ufv += kg * (n(a.ufv) || 0);
    const e = n(energiaUFL ? a.ufl : a.ufv);
    contributi.energia.push({ alimento: a.nome, valore: e === null ? null : kg * e });
    NUTRIENTI.forEach(x => {
      const v = n(a[x.campo]);
      if (v === null) mancanti[x.chiave].push(a.nome); else tot[x.chiave] += kg * v;
      contributi[x.chiave].push({ alimento: a.nome, valore: v === null ? null : kg * v });
    });
    const p = prezziPerNome[a.nome];
    const prezzo = p ? n(p.prezzo_euro_t) : null;
    let costo = null;
    if (prezzo === null) prezziMancanti.push(a.nome);
    else {
      costo = kg * prezzo / 1000; costoCapo += costo;
      if (p.fonte_prezzo === "listino") prezziListino.push(a.nome);
    }
    return { ...r, kg, costoCapo: costo, kgTutti: kg * capi, costoTutti: costo === null ? null : costo * capi, prezzoEuroT: prezzo, fonte: p?.fonte_prezzo || "mancante" };
  });

  // fabbisogni
  const c = classe || {};
  const perSS = v => (n(v) === null ? null : n(v) * ss);
  const fabb = {
    energia: n(c.energia),
    pdi: n(c.pdi_g),
    pg: n(c.proteina_grezza_g) !== null ? n(c.proteina_grezza_g) : (n(c.proteina_grezza_pct_ss) === null ? null : n(c.proteina_grezza_pct_ss) * 10 * ss),
    ca: n(c.calcio_g) !== null ? n(c.calcio_g) : perSS(c.calcio_g_kg_ss),
    p: n(c.fosforo_g) !== null ? n(c.fosforo_g) : perSS(c.fosforo_g_kg_ss),
    mg: perSS(c.magnesio_g_kg_ss), na: perSS(c.sodio_g_kg_ss),
    cu: perSS(c.rame_mg_kg_ss), zn: perSS(c.zinco_mg_kg_ss), mn: perSS(c.manganese_mg_kg_ss),
    se: perSS(c.selenio_mg_kg_ss), i: perSS(c.iodio_mg_kg_ss), co: perSS(c.cobalto_mg_kg_ss),
    vita: perSS(c.vitamina_a_ui_kg_ss),
  };
  const soglia = n(c.soglia_eccesso_pct) || 110;

  const voce = (chiave, nome, unita, fabbisogno, apporto, principale, decimali, incompleta) => {
    const pct = fabbisogno && fabbisogno > 0 ? (apporto / fabbisogno) * 100 : null;
    // esito sul valore esatto (versione 244): 99,9% è «manca», 110,3% è «eccessivo»
    let stato = "—";
    if (pct !== null) {
      if (pct < 100) stato = "manca";
      else if (principale && pct > soglia) stato = "eccessivo";
      else stato = "coperto";
    }
    return { chiave, nome, unita, fabbisogno, apporto, pct, stato, soglia, principale, decimali, incompleta, contributi: contributi[chiave] || [], mancaQuanto: fabbisogno !== null && apporto < fabbisogno ? fabbisogno - apporto : 0 };
  };

  const energiaApporto = c.unita_energia === "UFL" ? ufl : ufv;
  const voci = [voce("energia", `Energia (${c.unita_energia || "UF"})`, c.unita_energia || "", fabb.energia, energiaApporto, true, 2, [])];
  NUTRIENTI.forEach(x => voci.push(voce(x.chiave, x.nome, x.unita, fabb[x.chiave], tot[x.chiave], !!x.principale, x.decimali, mancanti[x.chiave])));

  // controllo della quantità di concentrato sulla sostanza secca (foraggi esclusi)
  let ssConcentrato = 0;
  righeCalcolate.forEach(r => {
    const a = r.alimento ? alimentiPerNome[r.alimento] : null;
    if (a && a.gruppo !== "Foraggio" && a.gruppo !== "Integratore minerale") ssConcentrato += r.kg * (n(a.sostanza_secca_pct) || 0) / 100;
  });

  return {
    righe: righeCalcolate,
    voci,
    sostanzaSeccaKg: ss,
    quotaConcentratoPct: ss > 0 ? ssConcentrato / ss * 100 : 0,
    costi: {
      capoGiorno: costoCapo,
      tuttiGiorno: costoCapo * capi,
      tuttiMese: costoCapo * capi * 30,
      tuttiAnno: costoCapo * capi * 365,
      capoAnno: costoCapo * 365,
      perKgCrescita: n(c.crescita_kg_giorno) ? costoCapo / n(c.crescita_kg_giorno) : null,
      completo: prezziMancanti.length === 0,
    },
    prezziMancanti, prezziListino,
    numeroCapi: capi,
  };
}
