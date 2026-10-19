// Razioni Bovini (versione 244): caricamento dei dati comuni alle tre pagine
// (Razioni di riferimento, Report fabbisogni, Costruisci razione) e righe della razione.
// Versione 245: i prezzi vengono dalla scheda prezzi (vista ci_v_prezzi_riferimento): sicuro, preventivo, da verificare.
import { supabase } from "./supabase";
import { gruppiRighe } from "./calcoloRazione";

export const ANNO_CORRENTE = new Date().getFullYear();

export const righeVuote = (specie = "bovino") => gruppiRighe(specie).map(g => ({ gruppo: g.gruppo, etichetta: g.etichetta, alimento: "", quantita: "" }));

// alimenti jsonb [{posizione, gruppo, alimento, quantita, unita}] → righe della razione (8 bovini, 11 suini)
export function righeDaAlimenti(alimenti, specie = "bovino") {
  const base = righeVuote(specie);
  (alimenti || []).forEach((x, k) => {
    const pos = Number.isInteger(x.posizione) ? x.posizione : k;
    if (base[pos]) base[pos] = { ...base[pos], alimento: x.alimento || "", quantita: x.quantita ?? "" };
  });
  return base;
}

export async function caricaDatiRazioni({ salvate = false } = {}) {
  const richieste = [
    supabase.from("ci_alimenti_nutrizione").select("*").eq("attivo", true).order("ordine"),
    supabase.from("ci_fabbisogni_classi").select("*").order("ordine"),
    supabase.from("ci_ambienti_allevamento").select("*").eq("attivo", true).order("ordine"),
    supabase.from("ci_v_prezzi_riferimento").select("*").eq("anno", ANNO_CORRENTE),
    supabase.from("ci_razioni_bovini_riferimento").select("*").order("ordine"),
  ];
  if (salvate) richieste.push(supabase.from("ci_razioni_salvate").select("*").order("updated_at", { ascending: false }));
  const r = await Promise.all(richieste);
  for (const x of r) if (x.error) throw new Error(x.error.message + " — il database ha le strutture della versione 245? (file contabilita_strutture_v245.sql)");
  const prezzi = {}; (r[3].data || []).forEach(p => { prezzi[p.alimento] = p; });
  return {
    alimenti: r[0].data || [], classi: r[1].data || [], ambienti: r[2].data || [], prezzi,
    riferimento: r[4].data || [], salvate: salvate ? r[5].data || [] : [],
  };
}
