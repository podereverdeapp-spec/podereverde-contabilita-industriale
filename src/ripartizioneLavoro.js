import { supabase } from "./supabase";
import { round2 } from "./parsingUtils";

// ── Ripartizione del costo del lavoro tra le attività (deciso dal Dott. Bizzarri il 03/10/2026)
// Il lavoro (area «Lavoro»: dipendenti e simili) finisce comunque sugli animali, ma seguendo la
// strada dell'attività per cui è stato svolto:
// - ALLEVAMENTO: come prima, su tutte le specie in proporzione agli UBA-giorni;
// - COLTIVAZIONE: come i costi delle coltivazioni di quell'anno (stesse destinazioni, nella
//   stessa proporzione: il foraggio va a bovini e ovini, non ai suini);
// - LAVORAZIONE DELLE CARNI: come i costi dell'area «Lavorazioni prodotti allevamento»
//   di quell'anno (stesse destinazioni, stessa proporzione);
// - ORTO E ALTRE ATTIVITÀ NON ZOOTECNICHE: escluso dal costo degli animali (va con l'Orto).
// Percentuali per anno nella tabella ci_ripartizione_lavoro (Parametri). Anno senza percentuali
// = 100% allevamento, cioè il calcolo di prima.

export const ATTIVITA_LAVORO = [
  { campo: "allevamento", etichetta: "Allevamento" },
  { campo: "coltivazione", etichetta: "Coltivazioni (foraggi e cereali per gli animali)" },
  { campo: "lavorazione_carni", etichetta: "Lavorazione delle carni" },
  { campo: "orto_altro", etichetta: "Orto e altre attività non zootecniche" },
];
const AREA_LAVORO = "Lavoro";

export async function caricaRipartizioneLavoro(anno) {
  const { data, error } = await supabase.from("ci_ripartizione_lavoro").select("*").eq("anno", anno).maybeSingle();
  if (error) return null; // tabella non ancora creata: si resta al calcolo di prima
  return data || null;
}

// Proporzioni delle destinazioni dei costi di un'area nell'anno (es. Coltivazione)
function proporzioniDestinazioni(righe, area) {
  const somme = new Map();
  righe.filter(r => (r.area || "").trim() === area).forEach(r => {
    const d = (r.destinazione || "").trim() || "Generali";
    somme.set(d, (somme.get(d) || 0) + (parseFloat(r.totale_riga) || 0));
  });
  const totale = [...somme.values()].reduce((s, v) => s + v, 0);
  if (totale <= 0) return [{ destinazione: "Generali", peso: 1 }];
  return [...somme.entries()].filter(([, v]) => v > 0).map(([destinazione, v]) => ({ destinazione, peso: v / totale }));
}

// righe = righe di costo dell'anno (fatture + costi diretti) con totale_riga, area, destinazione
export function applicaRipartizioneLavoro(righe, ripartizione) {
  if (!ripartizione) return righe;
  const p = Object.fromEntries(ATTIVITA_LAVORO.map(a => [a.campo, (parseFloat(ripartizione[a.campo]) || 0) / 100]));
  if (p.allevamento === 1) return righe;
  const lavoro = righe.filter(r => (r.area || "").trim() === AREA_LAVORO);
  if (!lavoro.length) return righe;
  const altre = righe.filter(r => (r.area || "").trim() !== AREA_LAVORO);
  const propColtivazione = proporzioniDestinazioni(altre, "Coltivazione");
  const propLavorazione = proporzioniDestinazioni(altre, "Lavorazioni prodotti allevamento");
  const risultato = [...altre];
  for (const r of lavoro) {
    const importo = parseFloat(r.totale_riga) || 0;
    if (p.allevamento) risultato.push({ ...r, totale_riga: round2(importo * p.allevamento), centro_costo: `${r.centro_costo || "Lavoro"} — allevamento` });
    if (p.coltivazione) propColtivazione.forEach(x => risultato.push({ ...r, destinazione: x.destinazione, totale_riga: round2(importo * p.coltivazione * x.peso), centro_costo: "Lavoro per le coltivazioni" }));
    if (p.lavorazione_carni) propLavorazione.forEach(x => risultato.push({ ...r, destinazione: x.destinazione, totale_riga: round2(importo * p.lavorazione_carni * x.peso), centro_costo: "Lavoro per la lavorazione delle carni" }));
    if (p.orto_altro) risultato.push({ ...r, area: "Orto", destinazione: "", totale_riga: round2(importo * p.orto_altro), centro_costo: "Lavoro per orto e altre attività" });
  }
  return risultato;
}
