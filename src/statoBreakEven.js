// Versione 314 — stato condiviso delle pagine dell'Analisi Break Even.
// Le pagine 3–8 leggono gli stessi dati, lo stesso periodo, lo stesso scenario e le stesse leve:
// il prezzo si cambia una volta sola e cambiano tutte le pagine. Resta finché il programma è aperto.
import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";
import { caricaAnalisi, elencoPeriodi, calcolaSpecie, pareggioAzienda, SPECIE } from "./analisiBreakEven";

let stato = {
  A: null, errore: "", caricamento: false,
  periodoId: null, scenario: "base", fascia: "12-24",
  valori: { bovino: {}, suino: {}, ovino: {} },   // leve scritte a mano (testi)
  strutture: {},                                    // parametri delle strutture scritti a mano
};
const ascoltatori = new Set();
const avvisa = () => ascoltatori.forEach(f => f());
function cambia(nuovo) { stato = { ...stato, ...nuovo }; avvisa(); }

export function useStatoBreakEven() {
  return useSyncExternalStore(f => { ascoltatori.add(f); return () => ascoltatori.delete(f); }, () => stato);
}

export async function caricaSeServe(forza = false) {
  if ((stato.A || stato.caricamento) && !forza) return;
  cambia({ caricamento: true, errore: "" });
  try {
    const A = await caricaAnalisi();
    const periodi = elencoPeriodi();
    cambia({ A, caricamento: false, periodoId: stato.periodoId || periodi[0].id });
  } catch (e) { cambia({ caricamento: false, errore: e.message || String(e) }); }
}

export const impostaPeriodo = id => cambia({ periodoId: id });
export const impostaScenario = s => cambia({ scenario: s });
export const impostaFascia = f => cambia({ fascia: f });
export const impostaLeva = (specie, campo, v) => cambia({ valori: { ...stato.valori, [specie]: { ...stato.valori[specie], [campo]: v } } });
export const ripristinaLeve = (specie, campi) => {
  const n = { ...stato.valori[specie] };
  (campi || Object.keys(n)).forEach(c => delete n[c]);
  cambia({ valori: { ...stato.valori, [specie]: n } });
};
export const impostaStruttura = (campo, v) => cambia({ strutture: { ...stato.strutture, [campo]: v } });
export const ripristinaStrutture = () => cambia({ strutture: {} });

// Calcolo completo per lo stato attuale (con memoria: si rifà solo se cambia qualcosa)
let memoria = { chiave: null, valore: null };
export function calcoloCorrente(s = stato, scenario = s.scenario) {
  if (!s.A || !s.periodoId) return null;
  const periodi = elencoPeriodi();
  const P = periodi.find(p => p.id === s.periodoId) || periodi[0];
  const chiave = JSON.stringify([s.A.caricatoIl, P.id, scenario, s.fascia, s.valori]);
  if (memoria.chiave === chiave) return memoria.valore;
  const perSpecie = Object.fromEntries(SPECIE.map(sp => [sp, calcolaSpecie(s.A, P, sp, scenario, s.fascia, s.valori[sp])]));
  const azienda = pareggioAzienda(SPECIE.map(sp => perSpecie[sp].R));
  const valore = { P, periodi, scenario, perSpecie, azienda };
  if (scenario === s.scenario) memoria = { chiave, valore };
  return valore;
}

// Fotografie salvate (pagina 8): si rileggono dopo ogni salvataggio
export async function ricaricaFotografie() {
  const { data, error } = await fetchAllPages((da, a) => supabase.from("ci_fotografie_break_even").select("id, creata_il, periodo_da, periodo_a, periodo_etichetta, scenario, etichetta, nota, dati").order("id").range(da, a));
  if (error) throw new Error(error.message);
  if (stato.A) cambia({ A: { ...stato.A, fotografie: data || [], fotografieDisponibili: true } });
  return data || [];
}
