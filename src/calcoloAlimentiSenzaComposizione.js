// Versione 320 (28/10/2026, ordine del Dott. Bizzarri): alimenti acquistati senza composizione.
// La lista sta nella tabella ci_alimenti_senza_composizione (file contabilita_strutture_v320.sql).
// L'avviso ⚠️ sulla cartella Alimentaria conta gli alimenti il cui stato non è ancora «Ricevuta».
import { supabase } from "./supabase";

export const STATI_COMPOSIZIONE = ["Da chiedere", "Richiesta inviata", "Ricevuta"];

export async function caricaAlimentiSenzaComposizione() {
  const { data, error } = await supabase.from("ci_alimenti_senza_composizione").select("*").order("ordine");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function contaAlimentiSenzaComposizione() {
  try {
    const { count, error } = await supabase.from("ci_alimenti_senza_composizione")
      .select("id", { count: "exact", head: true }).neq("stato", "Ricevuta");
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

export async function aggiornaStatoComposizione(id, stato) {
  const oggi = new Date().toISOString().slice(0, 10);
  const campi = { stato, updated_at: new Date().toISOString() };
  if (stato === "Richiesta inviata") campi.data_richiesta = oggi;
  if (stato === "Ricevuta") campi.data_ricezione = oggi;
  if (stato === "Da chiedere") { campi.data_richiesta = null; campi.data_ricezione = null; }
  const { error } = await supabase.from("ci_alimenti_senza_composizione").update(campi).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function aggiornaNotaComposizione(id, nota) {
  const { error } = await supabase.from("ci_alimenti_senza_composizione")
    .update({ nota: nota || null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}
