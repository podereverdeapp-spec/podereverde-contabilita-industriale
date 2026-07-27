import { supabase } from "./supabase";
import { fetchAllPages, round2 } from "./parsingUtils";
import { caricaDatiGrezziAnno } from "./calcoloReportCosti";
import { calcolaRigaAggregata } from "./motoreUba";

export const CENTRO_COSTO_MANGIMI = "Mangimi";
const MAPPA_DESTINAZIONE_SPECIE = { "Bovini": "bovino", "Suini": "suino", "Ovini": "ovino", "Generali": "generale", "Bovini e Ovini": "bovinoOvino" };

// Calcola tutti i dati del Report Quantità per un CENTRO DI COSTO e un anno — usato
// sia dalla vista ad anno singolo sia, chiamata 4 volte, dalla vista Storico. Generico:
// funziona per qualunque centro di costo con quantità tracciate (Mangimi, Foraggio, ecc.),
// non solo Mangimi — le funzioni sotto sono wrapper per compatibilità con il codice esistente.
export async function calcolaDatiQuantitaAnno(anno, centroCosto) {
  const inizioAnno = `${anno}-01-01`, fineAnno = `${anno}-12-31`;
  const { data: fatture, error: eF } = await fetchAllPages((da, a) => supabase
    .from("ci_fatture").select("id, fornitore_id").eq("tipo", "PASSIVA").gte("data", inizioAnno).lte("data", fineAnno).range(da, a));
  if (eF) throw new Error(eF.message);
  const idFatture = (fatture || []).map(f => f.id);
  const mappaFattureFornitore = new Map((fatture || []).map(f => [f.id, f.fornitore_id]));

  let righeArticolo = [];
  if (idFatture.length > 0) {
    const { data, error } = await fetchAllPages((da, a) => supabase
      .from("ci_articoli_fattura").select("fattura_id, descrizione, quantita, totale_riga, destinazione, centro_costo")
      .in("fattura_id", idFatture).eq("centro_costo", centroCosto).range(da, a));
    if (error) throw new Error(error.message);
    righeArticolo = data || [];
  }

  const { data: fornitori } = await supabase.from("ci_fornitori").select("id, nome");
  const mappaFornitori = new Map((fornitori || []).map(f => [f.id, f.nome]));

  const { data: regole } = await supabase.from("ci_regole_armonizzazione_unita").select("*").eq("centro_costo", centroCosto);
  const mappaRegole = new Map((regole || []).map(r => [`${r.fornitore_id}|${r.descrizione_prodotto.trim().toLowerCase()}`, r]));

  const gruppi = new Map();
  const senzaRegola = new Map();

  righeArticolo.forEach(r => {
    const fornitoreId = mappaFattureFornitore.get(r.fattura_id);
    if (!fornitoreId) return;
    const chiaveRegola = `${fornitoreId}|${r.descrizione.trim().toLowerCase()}`;
    const regola = mappaRegole.get(chiaveRegola);

    if (!regola || !regola.fattore_kg) {
      const chiaveSR = chiaveRegola;
      if (!senzaRegola.has(chiaveSR)) senzaRegola.set(chiaveSR, { fornitore: mappaFornitori.get(fornitoreId) || "—", descrizione: r.descrizione, count: 0 });
      senzaRegola.get(chiaveSR).count++;
      return;
    }

    const quantitaKg = (r.quantita || 0) * regola.fattore_kg;
    const chiave = `${fornitoreId}|${r.descrizione.trim().toLowerCase()}|${r.destinazione || "—"}`;
    if (!gruppi.has(chiave)) {
      gruppi.set(chiave, {
        fornitore: mappaFornitori.get(fornitoreId) || "—", descrizione: r.descrizione,
        destinazione: r.destinazione || "—", costoAnno: 0, quantitaKg: 0,
      });
    }
    const g = gruppi.get(chiave);
    g.costoAnno = round2(g.costoAnno + (r.totale_riga || 0));
    g.quantitaKg = round2(g.quantitaKg + quantitaKg);
  });

  const righe = [...gruppi.values()].map(g => ({ ...g, quantitaTons: round2(g.quantitaKg / 1000) }));
  righe.sort((a, b) => a.fornitore.localeCompare(b.fornitore) || a.descrizione.localeCompare(b.descrizione));

  // Per prodotto (sommato su tutti i fornitori): €/UBA-gg e kg/UBA-gg per specie,
  // con ripartizione dei Generali e di Bovini e Ovini — stessa funzione condivisa di
  // Report Costi, che gestisce già entrambi i pool correttamente.
  const { ubaGiorniProduttiviAziendali, ubaGiorniProduttiviPerSpecie } = await caricaDatiGrezziAnno(anno);

  const prodotti = new Map();
  righeArticolo.forEach(r => {
    const fornitoreId = mappaFattureFornitore.get(r.fattura_id);
    if (!fornitoreId) return;
    const chiaveRegola = `${fornitoreId}|${r.descrizione.trim().toLowerCase()}`;
    const regola = mappaRegole.get(chiaveRegola);
    if (!regola || !regola.fattore_kg) return;
    const specieChiave = MAPPA_DESTINAZIONE_SPECIE[r.destinazione];
    if (!specieChiave) return;

    const chiaveProd = r.descrizione.trim().toLowerCase();
    if (!prodotti.has(chiaveProd)) {
      prodotti.set(chiaveProd, {
        descrizione: r.descrizione,
        costiDiretti: { bovino: 0, suino: 0, ovino: 0, generale: 0, bovinoOvino: 0 },
        kgDiretti: { bovino: 0, suino: 0, ovino: 0, generale: 0, bovinoOvino: 0 },
      });
    }
    const p = prodotti.get(chiaveProd);
    const quantitaKg = (r.quantita || 0) * regola.fattore_kg;
    p.costiDiretti[specieChiave] = round2(p.costiDiretti[specieChiave] + (r.totale_riga || 0));
    p.kgDiretti[specieChiave] = round2(p.kgDiretti[specieChiave] + quantitaKg);
  });

  const perProdotto = [...prodotti.values()].map(p => {
    const perCosto = calcolaRigaAggregata(p.costiDiretti, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali);
    const perKg = calcolaRigaAggregata(p.kgDiretti, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali);
    return { descrizione: p.descrizione, perCosto, perKg };
  });
  perProdotto.sort((a, b) => a.descrizione.localeCompare(b.descrizione));

  return { righe, perProdotto, nonArmonizzate: [...senzaRegola.values()] };
}

// Wrapper per compatibilità con il codice Mangimi esistente (ReportQuantitaMangimi.jsx,
// ReportStoricoMangimi.jsx, calcoloPerformanceEta.js) — nessuna modifica richiesta lì.
export async function calcolaDatiMangimiAnno(anno) {
  return calcolaDatiQuantitaAnno(anno, CENTRO_COSTO_MANGIMI);
}

export const CENTRO_COSTO_FORAGGIO = "Foraggio";
export async function calcolaDatiForaggioAnno(anno) {
  return calcolaDatiQuantitaAnno(anno, CENTRO_COSTO_FORAGGIO);
}
