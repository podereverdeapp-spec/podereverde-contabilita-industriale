// Versione 349 (05/11/2026) — anomalie che NON nascono dai controlli dei registri del programma.
// Le scrive il database (regola di fine mese dei modelli 4, controllo delle cartelle su Z:).
// Il programma non le deve mai segnare «risolte» da solo: alle 14:52 del 05/11/2026 l'ha fatto con le 39
// anomalie dei modelli 4. Da allora le protegge anche il database (SQL v349, blocco 8).
import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";

export const CODICI_ESTERNI = ["M4", "CARTELLE", "CARTELLE-NON-ESEGUITO"];
export const eEsterna = (x) => CODICI_ESTERNI.includes(x?.codice);

// Data dalla quale la mancata consegna ha un responsabile (prima consegna scritta nella finestra delle consegne)
export const AVVIO_CONSEGNE = "2026-10-14";

// "uscita del GG/MM/AAAA" nella descrizione → "AAAA-MM-GG" (null se manca)
export function dataUscitaDa(descrizione) {
  const m = /uscita del (\d{2})\/(\d{2})\/(\d{4})/.exec(descrizione || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Anomalie dei registri del programma ancora aperte (senza quelle esterne)
export async function contaAnomalieRegistriAperte() {
  const { data, error } = await fetchAllPages((da, a) =>
    supabase.from("ci_anomalie").select("id, codice").eq("stato", "aperta").order("id").range(da, a));
  if (error) return null;
  return (data || []).filter(x => !eEsterna(x)).length;
}

// Modelli 4 aperti, per colore
export async function contaModelli4Aperti() {
  const { data, error } = await fetchAllPages((da, a) =>
    supabase.from("ci_anomalie").select("id, colore").eq("codice", "M4").eq("stato", "aperta").order("id").range(da, a));
  if (error) return { rosso: 0, arancione: 0, azzurro: 0, totale: 0, errore: error.message };
  const n = { rosso: 0, arancione: 0, azzurro: 0, totale: 0 };
  for (const x of data || []) { if (n[x.colore] !== undefined) n[x.colore]++; n.totale++; }
  return n;
}
