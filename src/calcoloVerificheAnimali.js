// Versione 323 (28/10/2026, ordine del Dott. Bizzarri): punti del registro degli animali da verificare con Sborchia.
// Tabella ci_verifiche_animali (file contabilita_strutture_v323.sql). L'avviso ⚠️ sulla cartella Animali
// conta i punti con stato «Da verificare».
import { oggiRoma } from "./dateRoma";
import { supabase } from "./supabase";

export const STATI_VERIFICA = ["Da verificare", "Verificato"];
export const SEZIONI_VERIFICA = ["Che cosa non torna", "Parti", "Pecore vive", "Domande"];

export async function caricaVerificheAnimali(specie) {
  const { data, error } = await supabase.from("ci_verifiche_animali").select("*").eq("specie", specie).order("sezione").order("ordine");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function contaVerificheAnimali() {
  try {
    const { count, error } = await supabase.from("ci_verifiche_animali")
      .select("id", { count: "exact", head: true }).eq("stato", "Da verificare");
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

export async function aggiornaVerificaAnimale(id, campi) {
  const dati = { ...campi, updated_at: new Date().toISOString() };
  if (campi.stato === "Verificato") dati.verificato_il = oggiRoma();
  if (campi.stato === "Da verificare") dati.verificato_il = null;
  const { error } = await supabase.from("ci_verifiche_animali").update(dati).eq("id", id);
  if (error) throw new Error(error.message);
}
