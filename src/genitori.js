import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";
import { idGenitori } from "./costoAnimale";

// Insieme degli animali che risultano madre o padre nell'app (capi con matricola e lotti di suinetti)
export async function caricaIdGenitori() {
  const [rA, rL] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("animali").select("madre_id,padre_id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("lotti_suini").select("madre_id,padre_id,tipo_provenienza").range(da, a)),
  ]);
  if (rA.error) throw new Error(`Errore leggendo i genitori: ${rA.error.message}`);
  if (rL.error) throw new Error(`Errore leggendo i lotti: ${rL.error.message}`);
  return idGenitori(rA.data, rL.data);
}
