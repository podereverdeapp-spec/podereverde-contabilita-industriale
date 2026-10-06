import { supabase } from "./supabase";
import { round2, fetchAllPages } from "./parsingUtils";

// Vendite di animali trovate nelle fatture attive (deciso dal Dott. Bizzarri il 05/10/2026).
// Un animale TRASFERITO non è un animale morto: o è stato SCAMBIATO o è stato VENDUTO, e la
// vendita si registra con una fattura. Il programma cerca la matricola dell'animale nelle righe
// delle fatture attive (quelle caricate in «Carica Fatture Attive» e quelle emesse dal programma).
// - Trovata: è una vendita; l'incasso è l'importo della riga (se la riga contiene più capi,
//   diviso in parti uguali tra i capi elencati).
// - Non trovata: si considera uno scambio, valutato peso vivo × prezzo di riforma; il programma
//   lo evidenzia in arancione, perché può anche essere una fattura mancante.

const MATRICOLA = /\b(IT\s?\d{6,})\b/gi;
const pulisci = s => String(s || "").toUpperCase().replace(/\s+/g, "");

function matricoleNelTesto(testo) {
  const trovate = new Set();
  for (const m of String(testo || "").matchAll(MATRICOLA)) trovate.add(pulisci(m[1]));
  return [...trovate];
}

// Righe di vendita: [{ matricole: [...], importo, numero, data, cliente, descrizione, fonte }]
export async function caricaRigheVendita() {
  const righe = [];
  const { data: fatture, error: eF } = await fetchAllPages((da, a) => supabase.from("ci_fatture")
    .select("id, numero, data, ci_clienti(nome)").eq("tipo", "ATTIVA").order("id").range(da, a));
  if (eF) throw new Error(`Errore leggendo le fatture attive: ${eF.message}`);
  const perId = new Map((fatture || []).map(f => [f.id, f]));
  if (perId.size) {
    const { data: articoli, error: eA } = await fetchAllPages((da, a) => supabase.from("ci_articoli_fattura")
      .select("fattura_id, descrizione, matricole, totale_riga").in("fattura_id", [...perId.keys()]).order("id").range(da, a));
    if (eA) throw new Error(`Errore leggendo le righe delle fatture attive: ${eA.message}`);
    for (const r of articoli || []) {
      const f = perId.get(r.fattura_id);
      const matricole = matricoleNelTesto(`${r.descrizione || ""} ${Array.isArray(r.matricole) ? r.matricole.join(" ") : (r.matricole || "")}`);
      if (!matricole.length) continue;
      righe.push({ matricole, importo: parseFloat(r.totale_riga) || 0, numero: f.numero, data: f.data, cliente: f.ci_clienti?.nome || "", descrizione: r.descrizione, fonte: "fattura attiva caricata" });
    }
  }
  const { data: emesse, error: eE } = await fetchAllPages((da, a) => supabase.from("ci_fatture_emesse_righe")
    .select("matricola, descrizione, importo, ci_fatture_emesse(numero, anno, data, cliente_denominazione, stato)").order("id").range(da, a));
  if (!eE) {
    for (const r of emesse || []) {
      const f = r.ci_fatture_emesse;
      if (!f || f.stato === "annullata") continue;
      const matricole = matricoleNelTesto(`${r.matricola || ""} ${r.descrizione || ""}`);
      if (!matricole.length) continue;
      righe.push({ matricole, importo: parseFloat(r.importo) || 0, numero: `${f.numero}/${f.anno}`, data: f.data, cliente: f.cliente_denominazione || "", descrizione: r.descrizione, fonte: "fattura emessa dal programma" });
    }
  }
  return righe;
}

// La vendita di un animale (per matricola), o null se nessuna fattura la contiene
export function venditaDiAnimale(matricola, righeVendita) {
  const m = pulisci(matricola);
  if (!m || !righeVendita?.length) return null;
  const trovate = righeVendita.filter(r => r.matricole.includes(m));
  if (!trovate.length) return null;
  const incasso = round2(trovate.reduce((s, r) => s + r.importo / r.matricole.length, 0));
  const r = trovate[0];
  const condivisa = r.matricole.length > 1 ? ` (riga con ${r.matricole.length} capi: importo diviso in parti uguali)` : "";
  return { incasso, numero: r.numero, data: r.data, cliente: r.cliente, descrizione: r.descrizione, testo: `fattura ${r.numero} del ${String(r.data || "").slice(0, 10).split("-").reverse().join("/")}${r.cliente ? ` a ${r.cliente}` : ""}${condivisa}` };
}

export const eTrasferito = stato => String(stato || "").toLowerCase().startsWith("trasferit");

// Descrizione dell'uscita per trasferimento, da mostrare evidenziata nelle schede e negli elenchi
export function uscitaTrasferimento(animale, righeVendita) {
  if (!eTrasferito(animale?.stato)) return null;
  const v = venditaDiAnimale(animale.bdn, righeVendita);
  if (v) return { tipo: "vendita", incasso: v.incasso, testo: `Trasferito e venduto: ${v.testo}, incasso ${v.incasso.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`, vendita: v };
  return { tipo: "scambio", incasso: null, testo: "Trasferito senza fattura di vendita: considerato uno scambio (valore = peso vivo × prezzo di riforma). Se è stato venduto, manca la fattura." };
}
