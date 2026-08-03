import { supabase } from "./supabase";
import { calcolaReportUba, calcolaRigaAggregata } from "./motoreUba";
import { numerizzaCampi, round2, fetchAllPages } from "./parsingUtils";

export const AREE_ORDINARIE = [
  "Allevamento", "Coltivazione", "Lavoro", "Energia Elettrica", "Acqua", "Consulenze",
  "Assicurazioni", "Lavorazioni prodotti allevamento", "Spese Promozionali",
  "Canoni ed Abbonamenti", "Varie", "Oneri Finanziari",
];
export const MAPPA_SPECIE = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };

function classificaDestinazione(dest) {
  if (dest === "Bovini e Ovini") return "bovinoOvino";
  if (dest === "Bovini e Suini") return "bovinoSuino";
  if (dest === "Suini e Ovini") return "suinoOvino";
  const m = Object.entries(MAPPA_SPECIE).find(([, v]) => v === dest);
  return m ? m[0] : "generale";
}

// Dati grezzi comuni a entrambi i report (animali/UBA, fatture dell'anno, cespiti/quote) —
// una sola interrogazione condivisa, per non ripeterla due volte se servono entrambi i report
export async function caricaDatiGrezziAnno(anno) {
  const [{ data: animali, error: eA }, { data: lotti, error: eL }, { data: suiniLotto, error: eS }] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("animali").select("id,bdn,nome,specie,sesso,nascita,stato,data_uscita,motivo_uscita,data_ingresso,razza,riproduttore").range(da, a)),
    fetchAllPages((da, a) => supabase.from("lotti_suini").select("*").range(da, a)),
    fetchAllPages((da, a) => supabase.from("suini_lotto").select("*").range(da, a)),
  ]);
  if (eA || eL || eS) throw new Error((eA || eL || eS).message);

  const righeUba = calcolaReportUba(animali || [], lotti || [], suiniLotto || [], anno);
  const ubaGiorniProduttiviAziendali = righeUba.filter(r => r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);
  const ubaGiorniProduttiviPerSpecie = {
    bovino: righeUba.filter(r => r.specie === "bovino" && r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0),
    suino: righeUba.filter(r => r.specie === "suino" && r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0),
    ovino: righeUba.filter(r => r.specie === "ovino" && r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0),
  };

  const { data: fattureAnno, error: eF } = await supabase
    .from("ci_fatture").select("id, data").eq("tipo", "PASSIVA")
    .gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`);
  if (eF) throw new Error(eF.message);
  const idFattureAnno = (fattureAnno || []).map(f => f.id);

  let articoliAnno = [];
  if (idFattureAnno.length > 0) {
    const { data: articoli, error: eArt } = await fetchAllPages((da, a) => supabase
      .from("ci_articoli_fattura").select("totale_riga, tipo_costo, destinazione, area, centro_costo")
      .in("fattura_id", idFattureAnno).in("tipo_costo", ["Fisso", "Variabile"]).range(da, a));
    if (eArt) throw new Error(eArt.message);
    articoliAnno = numerizzaCampi(articoli || [], ["totale_riga"]);
  }

  // Costi Diretti (es. costo del lavoro) — inseriti a mano, senza passare da una fattura,
  // ma vanno sommati insieme alle righe da fattura per non sparire dai report dei costi.
  const { data: costiDiretti, error: eCD } = await fetchAllPages((da, a) => supabase
    .from("ci_costi_diretti").select("importo, tipo_costo, destinazione, area, centro_costo")
    .gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`).range(da, a));
  if (eCD) throw new Error(eCD.message);
  articoliAnno = articoliAnno.concat(numerizzaCampi(costiDiretti || [], ["importo"]).map(c => ({ ...c, totale_riga: c.importo })));

  const { data: cespiti, error: eC } = await supabase.from("ci_cespiti").select("id, specie, categoria");
  if (eC) throw new Error(eC.message);
  const mappaCespiteSpecie = new Map((cespiti || []).map(c => [c.id, c.specie || []]));
  const mappaCespiteCategoria = new Map((cespiti || []).map(c => [c.id, c.categoria || "Senza categoria"]));
  const idCespiti = (cespiti || []).map(c => c.id);
  let quoteAnno = [];
  if (idCespiti.length > 0) {
    const { data: quote, error: eQ } = await supabase
      .from("ci_cespiti_ammortamento").select("quota, cespite_id").eq("anno", anno).in("cespite_id", idCespiti);
    if (eQ) throw new Error(eQ.message);
    quoteAnno = numerizzaCampi(quote || [], ["quota"]);
  }

  return { ubaGiorniProduttiviAziendali, ubaGiorniProduttiviPerSpecie, articoliAnno, quoteAnno, mappaCespiteSpecie, mappaCespiteCategoria };
}

function calcolaZonaRossa(articoliAnno, quoteNessunoTotale, ubaGiorniProduttiviAziendali) {
  const costiOrto = articoliAnno.filter(r => (r.area || "").trim() === "Orto").reduce((s, r) => s + (r.totale_riga || 0), 0);
  const costiAnimaliNonAllevamento = articoliAnno.filter(r => (r.area || "").trim() === "Animali non d'allevamento").reduce((s, r) => s + (r.totale_riga || 0), 0);
  return [
    { label: "Orto", valore: costiOrto },
    { label: "Animali non d'allevamento", valore: costiAnimaliNonAllevamento },
    { label: "Ammortamenti (Imputazione: Nessuno)", valore: round2(quoteNessunoTotale) },
  ].filter(r => r.valore > 0).map(r => ({
    ...r, tasso: ubaGiorniProduttiviAziendali > 0 ? Math.round(r.valore / ubaGiorniProduttiviAziendali * 1000000) / 1000000 : 0,
  }));
}

// Report per Area (un anno) — stessa logica usata da ReportPerArea.jsx
export async function calcolaDatiPerArea(anno) {
  const { ubaGiorniProduttiviAziendali, ubaGiorniProduttiviPerSpecie, articoliAnno, quoteAnno, mappaCespiteSpecie } = await caricaDatiGrezziAnno(anno);

  const righe = AREE_ORDINARIE.map(area => {
    const costiDiretti = { bovino: 0, suino: 0, ovino: 0, generale: 0, bovinoOvino: 0, bovinoSuino: 0, suinoOvino: 0 };
    articoliAnno.filter(r => (r.area || "").trim() === area).forEach(r => {
      costiDiretti[classificaDestinazione((r.destinazione || "").trim())] += (r.totale_riga || 0);
    });
    return { area, ...calcolaRigaAggregata(costiDiretti, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali) };
  }).filter(r => r.imponibileComplessivo > 0);

  const costiDirettiAmmortamenti = { bovino: 0, suino: 0, ovino: 0, generale: 0 };
  let quoteNessunoTotale = 0;
  quoteAnno.forEach(r => {
    const specieCespite = mappaCespiteSpecie.get(r.cespite_id) || [];
    const specieMatch = Object.entries(MAPPA_SPECIE).find(([, v]) => specieCespite.includes(v));
    if (specieMatch) { costiDirettiAmmortamenti[specieMatch[0]] += (r.quota || 0); return; }
    if (specieCespite.includes("Generale")) { costiDirettiAmmortamenti.generale += (r.quota || 0); return; }
    // Nessuno, Cavalli, Pollame, Orto (o qualunque altra imputazione non di allevamento):
    // MAI ripartiti su nessuna specie, né direttamente né via Generali — restano esclusi
    quoteNessunoTotale += (r.quota || 0);
  });
  const totaleAmmortamentiConSpecie = costiDirettiAmmortamenti.bovino + costiDirettiAmmortamenti.suino + costiDirettiAmmortamenti.ovino + costiDirettiAmmortamenti.generale;
  if (totaleAmmortamentiConSpecie > 0) {
    righe.push({ area: "Ammortamenti", ...calcolaRigaAggregata(costiDirettiAmmortamenti, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali) });
  }

  const rigaRossa = calcolaZonaRossa(articoliAnno, quoteNessunoTotale, ubaGiorniProduttiviAziendali);
  return { righe, rigaRossa, ubaGiorniProduttiviAziendali, ubaGiorniProduttiviPerSpecie };
}

// Report per Area e Centro di Costo (un anno) — stessa logica usata da ReportPerAreaCentro.jsx
export async function calcolaDatiPerAreaCentro(anno) {
  const { ubaGiorniProduttiviAziendali, ubaGiorniProduttiviPerSpecie, articoliAnno, quoteAnno, mappaCespiteSpecie, mappaCespiteCategoria } = await caricaDatiGrezziAnno(anno);

  function calcolaPerGruppo(righeFiltrate) {
    const costiDiretti = { bovino: 0, suino: 0, ovino: 0, generale: 0, bovinoOvino: 0, bovinoSuino: 0, suinoOvino: 0 };
    righeFiltrate.forEach(r => { costiDiretti[classificaDestinazione((r.destinazione || "").trim())] += (r.totale_riga || 0); });
    return calcolaRigaAggregata(costiDiretti, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali);
  }

  const gruppi = AREE_ORDINARIE.map(area => {
    const righeArea = articoliAnno.filter(r => (r.area || "").trim() === area);
    if (righeArea.length === 0) return null;
    const rigaArea = { area, ...calcolaPerGruppo(righeArea) };
    const centri = [...new Set(righeArea.map(r => (r.centro_costo || "Senza centro di costo").trim() || "Senza centro di costo"))];
    const sottoRighe = centri.map(centro => {
      const righeCentro = righeArea.filter(r => ((r.centro_costo || "Senza centro di costo").trim() || "Senza centro di costo") === centro);
      return { etichetta: centro, ...calcolaPerGruppo(righeCentro) };
    }).filter(r => r.imponibileComplessivo > 0);
    return { area, riga: rigaArea, sottoRighe };
  }).filter(Boolean);

  const righeAmmortamentoConSpecie = [];
  let quoteNessunoTotale = 0;
  quoteAnno.forEach(r => {
    const specieCespite = mappaCespiteSpecie.get(r.cespite_id) || [];
    const haSpecieAllevamento = Object.values(MAPPA_SPECIE).some(v => specieCespite.includes(v));
    const haGenerale = specieCespite.includes("Generale");
    if (!haSpecieAllevamento && !haGenerale) { quoteNessunoTotale += (r.quota || 0); return; }
    righeAmmortamentoConSpecie.push({ ...r, specieCespite, categoria: mappaCespiteCategoria.get(r.cespite_id) });
  });

  if (righeAmmortamentoConSpecie.length > 0) {
    function calcolaPerGruppoAmmortamento(righeFiltrate) {
      const costiDiretti = { bovino: 0, suino: 0, ovino: 0, generale: 0, bovinoOvino: 0, bovinoSuino: 0, suinoOvino: 0 };
      righeFiltrate.forEach(r => {
        const specieMatch = Object.entries(MAPPA_SPECIE).find(([, v]) => r.specieCespite.includes(v));
        costiDiretti[specieMatch ? specieMatch[0] : "generale"] += (r.quota || 0);
      });
      return calcolaRigaAggregata(costiDiretti, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali);
    }
    const rigaAmmortamenti = { area: "Ammortamenti", ...calcolaPerGruppoAmmortamento(righeAmmortamentoConSpecie) };
    const categorie = [...new Set(righeAmmortamentoConSpecie.map(r => r.categoria))];
    const sottoRigheAmmortamenti = categorie.map(cat => {
      const righeCat = righeAmmortamentoConSpecie.filter(r => r.categoria === cat);
      return { etichetta: cat, ...calcolaPerGruppoAmmortamento(righeCat) };
    }).filter(r => r.imponibileComplessivo > 0);
    gruppi.push({ area: "Ammortamenti", riga: rigaAmmortamenti, sottoRighe: sottoRigheAmmortamenti });
  }

  const rigaRossa = calcolaZonaRossa(articoliAnno, quoteNessunoTotale, ubaGiorniProduttiviAziendali);
  return { gruppi, rigaRossa, ubaGiorniProduttiviAziendali, ubaGiorniProduttiviPerSpecie };
}
