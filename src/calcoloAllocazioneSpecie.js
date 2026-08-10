import { round2 } from "./parsingUtils";

// Stessa logica di allocazione per specie già usata in ReportCosti.jsx (Area/Destinazione →
// UBA-giorni), mai duplicata a caso — estratta qui in una funzione condivisa e parametrica,
// così può girare due volte sugli stessi dati (una per i costi Fissi, una per i Variabili)
// senza mai mescolarli, per la Break Even.
export const MAPPA_SPECIE = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };
export const SPECIE_SENZA_UBA = ["Pollame", "Cavalli"];
export const AREA_ORTO = "Orto";
export const AREA_ANIMALI_NON_ALLEVAMENTO = "Animali non d'allevamento";

// righeCosto: array di { totale_riga (o quota), destinazione, area } — già filtrate per il
// tipo di costo che si vuole allocare (Fisso o Variabile), e già filtrate per anno.
// righeUba: le stesse righe UBA-giorno per animale già usate da ReportCosti.jsx.
export function allocaCostiPerSpecie(righeCosto, righeUba) {
  let costiGenerali = 0, costiBovinoOvino = 0, costiBovinoSuino = 0, costiSuinoOvino = 0;
  const costiDirettiPerSpecie = { bovino: 0, suino: 0, ovino: 0 };
  const costiAltreSpecie = { Pollame: 0, Cavalli: 0, Orto: 0, "Animali non d'allevamento (non specificato)": 0 };

  righeCosto.forEach(r => {
    const dest = (r.destinazione || "").trim();
    const area = (r.area || "").trim();
    const valore = r.totale_riga ?? r.quota ?? 0;
    if (area === AREA_ORTO) { costiAltreSpecie.Orto += valore; return; }
    if (SPECIE_SENZA_UBA.includes(dest)) { costiAltreSpecie[dest] += valore; return; }
    if (area === AREA_ANIMALI_NON_ALLEVAMENTO) { costiAltreSpecie["Animali non d'allevamento (non specificato)"] += valore; return; }
    if (dest === "Bovini e Ovini") { costiBovinoOvino += valore; return; }
    if (dest === "Bovini e Suini") { costiBovinoSuino += valore; return; }
    if (dest === "Suini e Ovini") { costiSuinoOvino += valore; return; }
    const specieMatch = Object.entries(MAPPA_SPECIE).find(([, v]) => v === dest);
    if (specieMatch) costiDirettiPerSpecie[specieMatch[0]] += valore;
    else costiGenerali += valore;
  });

  const ubaGiorniProduttiviAzienda = righeUba.filter(r => r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);
  const tassoGenerali = ubaGiorniProduttiviAzienda > 0 ? costiGenerali / ubaGiorniProduttiviAzienda : 0;

  const ubaGiorniProduttiviBovino = righeUba.filter(r => r.specie === "bovino" && r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);
  const ubaGiorniProduttiviSuino = righeUba.filter(r => r.specie === "suino" && r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);
  const ubaGiorniProduttiviOvino = righeUba.filter(r => r.specie === "ovino" && r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);
  const tassoBovinoOvino = (ubaGiorniProduttiviBovino + ubaGiorniProduttiviOvino) > 0 ? costiBovinoOvino / (ubaGiorniProduttiviBovino + ubaGiorniProduttiviOvino) : 0;
  const tassoBovinoSuino = (ubaGiorniProduttiviBovino + ubaGiorniProduttiviSuino) > 0 ? costiBovinoSuino / (ubaGiorniProduttiviBovino + ubaGiorniProduttiviSuino) : 0;
  const tassoSuinoOvino = (ubaGiorniProduttiviSuino + ubaGiorniProduttiviOvino) > 0 ? costiSuinoOvino / (ubaGiorniProduttiviSuino + ubaGiorniProduttiviOvino) : 0;

  const perSpecie = {};
  ["bovino", "suino", "ovino"].forEach(sp => {
    const righeSp = righeUba.filter(r => r.specie === sp);
    const ubaGiorniSpProduttivi = righeSp.filter(r => r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);
    const quotaGeneraliSpecie = round2(tassoGenerali * ubaGiorniSpProduttivi);
    const quotaBovinoOvinoSpecie = sp !== "suino" ? round2(tassoBovinoOvino * ubaGiorniSpProduttivi) : 0;
    const quotaBovinoSuinoSpecie = sp !== "ovino" ? round2(tassoBovinoSuino * ubaGiorniSpProduttivi) : 0;
    const quotaSuinoOvinoSpecie = sp !== "bovino" ? round2(tassoSuinoOvino * ubaGiorniSpProduttivi) : 0;
    const totale = round2((costiDirettiPerSpecie[sp] || 0) + quotaGeneraliSpecie + quotaBovinoOvinoSpecie + quotaBovinoSuinoSpecie + quotaSuinoOvinoSpecie);
    perSpecie[sp] = { totale, ubaGiorniProduttivi: round2(ubaGiorniSpProduttivi), perUbaGiorno: ubaGiorniSpProduttivi > 0 ? totale / ubaGiorniSpProduttivi : 0 };
  });

  return perSpecie;
}
