import { supabase } from "./supabase";
import { pianoQuote } from "./Cespiti";

// Versione 261 (decisione del Dott. Bizzarri del 21/10/2026 ore 09:45): un cespite nato da una riga di
// fattura si crea in UN SOLO modo, da qualunque pagina arrivi (Carica Fatture Passive massivamente,
// Inserimento Manuale Fattura, Verifica Righe Mancanti).
// - Si stabiliscono gli ANNI di ammortamento; la percentuale la calcola il programma (100 ÷ anni).
//   È contabilità industriale, non fiscale: gli anni sono quelli di vita reale del bene in azienda.
// - Si scrivono: il dettaglio dell'ammortamento della riga, il cespite e le sue quote dall'anno
//   della fattura fino all'anno in corso (prima nascevano senza quote e restavano fuori dai costi
//   finché qualcuno non premeva «Genera Quote»). Gli anni successivi li genera «Genera Quote».

export const CATEGORIE_AMMORTAMENTO = [
  "3 - Attrezzatura specifica",
  "3 - Costruzioni leggere",
  "5 - Macchinari, apparecchi e attrezzature varie",
  "5 b - Macchinari, apparecchi e attrezzature varie extra allevamento",
  "6 - Spese atti notarili",
  "7 - Animali non oggetto di allevamento",
  "15 - Autovetture, motoveicoli e simili",
  "30 – Avviamento",
  "31 - Spese di costituzione e trasformazione",
  "34 - Altri oneri pluriennali",
];

export const IMPUTAZIONI_CESPITE = ["Bovini", "Suini", "Ovini", "Generali", "Cavalli", "Pollame", "Orto", "Nessuno"];

// Imputazione scelta nella riga → specie salvate nel cespite (come già nel carico massivo)
export const MAPPA_SPECIE_CESPITE = {
  Bovini: ["Bovini"], Suini: ["Suini"], Ovini: ["Ovini"], Generali: ["Generale"],
  Cavalli: ["Cavalli"], Pollame: ["Pollame"], Orto: ["Orto"], Nessuno: [],
};

// Anni validi: numero intero da 1 a 100
export function anniValidi(anni) {
  const n = Number(anni);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}

// Percentuale annua da mostrare accanto agli anni (solo informazione)
export function percentualeDaAnni(anni) {
  const n = anniValidi(anni);
  return n ? Math.round(10000 / n) / 100 : null;
}

// Riga dei bozzi salvati prima della versione 261 (avevano la percentuale): anni = 100 ÷ percentuale
export function anniDaRiga(riga) {
  if (anniValidi(riga.anniAmmortamento)) return anniValidi(riga.anniAmmortamento);
  const pct = parseFloat(riga.pctAmmortamento);
  return pct > 0 ? Math.round(100 / pct) : null;
}

const annoDi = data => parseInt(String(data || "").slice(0, 4)) || new Date().getFullYear();

// Crea dettaglio, cespite e quote fino all'anno in corso. Restituisce gli id creati (per «Annulla»).
// Se qualcosa va storto dopo il cespite, lo cancella (le quote se ne vanno con lui) e rilancia l'errore.
export async function creaCespiteDaRiga({ articoloId, descrizione, fornitoreId, fatturaId, data, importo, categoria, imputazione, anni, annoAcquisto }) {
  const n = anniValidi(anni);
  if (!n) throw new Error("Anni di ammortamento non validi: scrivere un numero intero da 1 a 100.");
  const costo = Math.round((parseFloat(importo) || 0) * 100) / 100;

  const { error: eAmm } = await supabase.from("ci_articolo_dettaglio_ammortamento").insert([{
    articolo_id: articoloId, categoria_ammortamento: categoria || null, imputazione: imputazione || null,
    anno_acquisto: parseInt(annoAcquisto) || annoDi(data),
    pct_ammortamento: Math.round(1000000 / n) / 1000000, importo_acquisto: costo,
  }]);
  if (eAmm) throw new Error(`Errore nel dettaglio dell'ammortamento: ${eAmm.message}`);

  const { data: cespite, error: eCesp } = await supabase.from("ci_cespiti").insert([{
    descrizione, categoria: categoria || null, fornitore_id: fornitoreId || null, fattura_id: fatturaId || null,
    data_acquisto: data, costo_acquisto: costo, anni_ammortamento: n, coefficiente_percentuale: null,
    specie: MAPPA_SPECIE_CESPITE[imputazione] ?? [],
  }]).select().single();
  if (eCesp) throw new Error(`Riga salvata ma errore nella creazione del cespite: ${eCesp.message}`);

  const annoCorrente = new Date().getFullYear();
  const quote = pianoQuote(costo, n, annoDi(data)).filter(r => r.anno <= annoCorrente);
  if (quote.length) {
    const { error: eQ } = await supabase.from("ci_cespiti_ammortamento")
      .upsert(quote.map(r => ({ cespite_id: cespite.id, anno: r.anno, quota: r.quota, fondo_ammortamento_fine: r.fondo })), { onConflict: "cespite_id,anno" });
    if (eQ) {
      await supabase.from("ci_cespiti").delete().eq("id", cespite.id);
      throw new Error(`Errore nelle quote del cespite (cespite non creato): ${eQ.message}`);
    }
  }
  return { cespiteId: cespite.id, quoteScritte: quote.length };
}
