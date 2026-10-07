import { supabase } from "./supabase";
import { calcolaReportUba, calcolaRigaAggregata } from "./motoreUba";
import { numerizzaCampi, round2, fetchAllPages, leggiInBlocchi } from "./parsingUtils";
import { caricaRipartizioneLavoro, applicaRipartizioneLavoro } from "./ripartizioneLavoro";

export const AREE_ORDINARIE = [
  "Allevamento", "Coltivazione", "Lavoro", "Energia Elettrica", "Acqua", "Consulenze",
  "Assicurazioni", "Spese Promozionali",
  "Canoni ed Abbonamenti", "Varie", "Oneri Finanziari",
];
export const MAPPA_SPECIE = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };

export function classificaDestinazione(dest) {
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
    fetchAllPages((da, a) => supabase.from("animali").select("id,bdn,nome,specie,sesso,nascita,stato,data_uscita,motivo_uscita,data_ingresso,provenienza,razza,riproduttore,madre_id,padre_id").range(da, a)),
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

  const { data: fattureAnno, error: eF } = await fetchAllPages((da, a) => supabase
    .from("ci_fatture").select("id, data").eq("tipo", "PASSIVA")
    .gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`).order("id").range(da, a));
  if (eF) throw new Error(eF.message);
  const idFattureAnno = (fattureAnno || []).map(f => f.id);

  let articoliAnno = [];
  if (idFattureAnno.length > 0) {
    const { data: articoli, error: eArt } = await leggiInBlocchi(idFattureAnno, (blocco, da, a) => supabase
      .from("ci_articoli_fattura").select("totale_riga, tipo_costo, destinazione, area, centro_costo")
      .in("fattura_id", blocco).in("tipo_costo", ["Fisso", "Variabile"]).order("id").range(da, a));
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
  articoliAnno = applicaRipartizioneLavoro(articoliAnno, await caricaRipartizioneLavoro(anno));

  const { data: cespiti, error: eC } = await fetchAllPages((da, a) => supabase.from("ci_cespiti").select("id, specie, categoria").order("id").range(da, a));
  if (eC) throw new Error(eC.message);
  const mappaCespiteSpecie = new Map((cespiti || []).map(c => [c.id, c.specie || []]));
  const mappaCespiteCategoria = new Map((cespiti || []).map(c => [c.id, c.categoria || "Senza categoria"]));
  const idCespiti = (cespiti || []).map(c => c.id);
  let quoteAnno = [];
  if (idCespiti.length > 0) {
    // tutte le quote dell'anno, a pagine; si tengono quelle dei cespiti letti (senza mettere l'elenco nella richiesta)
    const idSet = new Set(idCespiti);
    const { data: quote, error: eQ } = await fetchAllPages((da, a) => supabase
      .from("ci_cespiti_ammortamento").select("quota, cespite_id").eq("anno", anno).order("id").range(da, a));
    if (eQ) throw new Error(eQ.message);
    quoteAnno = numerizzaCampi((quote || []).filter(q => idSet.has(q.cespite_id)), ["quota"]);
  }

  return { ubaGiorniProduttiviAziendali, ubaGiorniProduttiviPerSpecie, articoliAnno, quoteAnno, mappaCespiteSpecie, mappaCespiteCategoria };
}

// Versione 236 (decisione del Dott. Bizzarri del 07/10/2026 ore 20:58): i costi di Cavalli, Pollame e
// Orto non entrano MAI nel costo di bovini, suini e ovini e stanno sempre a parte (zona rossa), in tutte
// le viste — come già nell'Aggregato. Prima «Per Area» e «Per Area e Centro» trattavano le righe intestate
// a Cavalli o Pollame come costi generali e le dividevano tra le tre specie.
const SPECIE_FUORI_ALLEVAMENTO = ["Cavalli", "Pollame"];
const areaDi = r => (r.area || "").trim();
const eCavalliPollameBase = r => SPECIE_FUORI_ALLEVAMENTO.includes((r.destinazione || "").trim()) && areaDi(r) !== "Orto" && areaDi(r) !== "Animali non d'allevamento";
// Versione 236 (decisione del Dott. Bizzarri del 07/10/2026 ore 22:00): le spese di macello e di lavorazione
// delle carni (area «Lavorazioni prodotti allevamento» e la parte di lavoro per la lavorazione delle carni)
// non sono costi di allevamento: le paga la società del gruppo che riceve le carcasse. Stanno a parte.
export const AREA_LAVORAZIONI = "Lavorazioni prodotti allevamento";
export const CENTRO_LAVORO_CARNI = "Lavoro per la lavorazione delle carni";
export const eLavorazioneCarni = r => areaDi(r) === AREA_LAVORAZIONI || (r.centro_costo || "") === CENTRO_LAVORO_CARNI;
const eCavalliPollame = r => !eLavorazioneCarni(r) && eCavalliPollameBase(r);
const eEscluso = r => eLavorazioneCarni(r) || eCavalliPollame(r);

const IMPUTAZIONI_NOTE = ["Bovini", "Suini", "Ovini", "Generale", "Cavalli", "Pollame", "Orto", "Nessuno"];
const eImputazioneSconosciuta = specie => (specie || []).some(x => !IMPUTAZIONI_NOTE.includes(x));

// Dove va la quota di ammortamento di un cespite, secondo la sua imputazione — UNA regola per tutte
// le viste del Report Costi (versione 236, decisioni del Dott. Bizzarri del 07/10/2026 ore 21:01 e 21:04):
// una specie → a quella specie; due specie → divisa tra le due in proporzione ai giorni di presenza
// pesati (prima andava tutta alla prima specie dell'elenco); tre specie o «Generale» → costi generali;
// Cavalli, Pollame, Orto, nessuna imputazione → fuori dal costo degli animali; imputazione sconosciuta → da correggere.
export function chiaveQuotaCespite(specie) {
  const s = specie || [];
  const tre = ["bovino", "suino", "ovino"].filter(k => s.includes(MAPPA_SPECIE[k]));
  if (tre.length === 1) return tre[0];
  if (tre.length === 2) return { "bovino,ovino": "bovinoOvino", "bovino,suino": "bovinoSuino", "ovino,suino": "suinoOvino" }[[...tre].sort().join(",")];
  if (tre.length === 3 || s.includes("Generale")) return "generale";
  if (s.includes("Cavalli")) return "Cavalli";
  if (s.includes("Pollame")) return "Pollame";
  if (s.includes("Orto")) return "Orto";
  if (eImputazioneSconosciuta(s)) return "daCorreggere";
  return "nessuno";
}
const CHIAVI_ALLEVAMENTO = ["bovino", "suino", "ovino", "bovinoOvino", "bovinoSuino", "suinoOvino", "generale"];

function calcolaZonaRossa(articoliAnno, quoteNessunoTotale, ubaGiorniProduttiviAziendali, quoteDaCorreggere = 0) {
  const costiOrto = articoliAnno.filter(r => areaDi(r) === "Orto").reduce((s, r) => s + (r.totale_riga || 0), 0);
  const costiAnimaliNonAllevamento = articoliAnno.filter(r => areaDi(r) === "Animali non d'allevamento").reduce((s, r) => s + (r.totale_riga || 0), 0);
  const costiDi = specie => articoliAnno.filter(r => eCavalliPollame(r) && (r.destinazione || "").trim() === specie).reduce((s, r) => s + (r.totale_riga || 0), 0);
  const costiCarni = articoliAnno.filter(eLavorazioneCarni).reduce((s, r) => s + (r.totale_riga || 0), 0);
  return [
    { label: "Macello e lavorazione delle carni", valore: costiCarni },
    { label: "Orto", valore: costiOrto },
    { label: "Cavalli", valore: costiDi("Cavalli") },
    { label: "Pollame", valore: costiDi("Pollame") },
    { label: "Animali non d'allevamento", valore: costiAnimaliNonAllevamento },
    { label: "Ammortamenti senza imputazione o intestati a Orto, Cavalli, Pollame", valore: round2(quoteNessunoTotale) },
    { label: "Ammortamenti con imputazione da correggere", valore: round2(quoteDaCorreggere) },
  ].filter(r => r.valore > 0).map(r => ({
    ...r, tasso: ubaGiorniProduttiviAziendali > 0 ? Math.round(r.valore / ubaGiorniProduttiviAziendali * 1000000) / 1000000 : 0,
  }));
}

// Report per Area (un anno) — stessa logica usata da ReportPerArea.jsx
export async function calcolaDatiPerArea(anno) {
  const { ubaGiorniProduttiviAziendali, ubaGiorniProduttiviPerSpecie, articoliAnno, quoteAnno, mappaCespiteSpecie } = await caricaDatiGrezziAnno(anno);

  const righe = AREE_ORDINARIE.map(area => {
    const costiDiretti = { bovino: 0, suino: 0, ovino: 0, generale: 0, bovinoOvino: 0, bovinoSuino: 0, suinoOvino: 0 };
    articoliAnno.filter(r => areaDi(r) === area && !eEscluso(r)).forEach(r => {
      costiDiretti[classificaDestinazione((r.destinazione || "").trim())] += (r.totale_riga || 0);
    });
    return { area, ...calcolaRigaAggregata(costiDiretti, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali) };
  }).filter(r => r.imponibileComplessivo > 0);

  const costiDirettiAmmortamenti = { bovino: 0, suino: 0, ovino: 0, generale: 0, bovinoOvino: 0, bovinoSuino: 0, suinoOvino: 0 };
  let quoteNessunoTotale = 0, quoteDaCorreggere = 0;
  quoteAnno.forEach(r => {
    const k = chiaveQuotaCespite(mappaCespiteSpecie.get(r.cespite_id));
    if (CHIAVI_ALLEVAMENTO.includes(k)) costiDirettiAmmortamenti[k] += (r.quota || 0);
    else if (k === "daCorreggere") quoteDaCorreggere += (r.quota || 0);
    else quoteNessunoTotale += (r.quota || 0); // Nessuno, Cavalli, Pollame, Orto: MAI sugli animali
  });
  const totaleAmmortamentiConSpecie = Object.values(costiDirettiAmmortamenti).reduce((t, v) => t + v, 0);
  if (totaleAmmortamentiConSpecie > 0) {
    righe.push({ area: "Ammortamenti", ...calcolaRigaAggregata(costiDirettiAmmortamenti, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali) });
  }

  const rigaRossa = calcolaZonaRossa(articoliAnno, quoteNessunoTotale, ubaGiorniProduttiviAziendali, quoteDaCorreggere);
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
    const righeArea = articoliAnno.filter(r => areaDi(r) === area && !eEscluso(r));
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
  let quoteNessunoTotale = 0, quoteDaCorreggere = 0;
  quoteAnno.forEach(r => {
    const k = chiaveQuotaCespite(mappaCespiteSpecie.get(r.cespite_id));
    if (k === "daCorreggere") { quoteDaCorreggere += (r.quota || 0); return; }
    if (!CHIAVI_ALLEVAMENTO.includes(k)) { quoteNessunoTotale += (r.quota || 0); return; }
    righeAmmortamentoConSpecie.push({ ...r, chiave: k, categoria: mappaCespiteCategoria.get(r.cespite_id) });
  });

  if (righeAmmortamentoConSpecie.length > 0) {
    function calcolaPerGruppoAmmortamento(righeFiltrate) {
      const costiDiretti = { bovino: 0, suino: 0, ovino: 0, generale: 0, bovinoOvino: 0, bovinoSuino: 0, suinoOvino: 0 };
      righeFiltrate.forEach(r => { costiDiretti[r.chiave] += (r.quota || 0); });
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

  const rigaRossa = calcolaZonaRossa(articoliAnno, quoteNessunoTotale, ubaGiorniProduttiviAziendali, quoteDaCorreggere);
  return { gruppi, rigaRossa, ubaGiorniProduttiviAziendali, ubaGiorniProduttiviPerSpecie };
}
