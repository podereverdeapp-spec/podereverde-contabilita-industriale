// Versione 237 (decisione del Dott. Bizzarri, 08/10/2026 ore 09:56–10:26): «fatture da ricevere» e
// «fatture da emettere» (documenti di competenza).
//
// Perché esistono: dal 2021 Muratella paga costi dei campi di Podere (gasolio, manutenzione macchine,
// concimi, diserbanti, seme, contoterzi, reti) e dal 2025 vende alla Cooperativa Ceri l'orzo raccolto
// da Podere, che Podere poi ricompra come farina. Per rispettare i principi contabili (competenza,
// inerenza, non compensazione) Podere riceverà da Muratella le fatture dei costi e le emetterà la
// fattura dell'orzo. Finché le fatture vere non ci sono, il programma tiene i documenti di competenza:
//   DA_RICEVERE  → costi di Podere nell'anno della fattura originale (si sommano ai costi)
//   DA_EMETTERE  → orzo di Podere conferito: riga in meno nei Mangimi (la farina rientra comprata)
// Quando arriva la fattura vera, la si collega al documento di competenza (colonna regolarizzazione_di
// sulla fattura vera): la fattura vera di acquisto collegata NON si conta nei costi, perché il suo costo
// è già contato nell'anno giusto dal documento di competenza (nessun doppio conteggio, anni corretti).

export const TIPO_DA_RICEVERE = "DA_RICEVERE";
export const TIPO_DA_EMETTERE = "DA_EMETTERE";
export const TIPI_NEI_COSTI = ["PASSIVA", TIPO_DA_RICEVERE, TIPO_DA_EMETTERE];

// Etichetta leggibile del tipo di documento (per elenchi e ricerche)
export function etichettaTipo(tipo) {
  if (tipo === "ATTIVA") return "VENDITA";
  if (tipo === "PASSIVA") return "ACQUISTO";
  if (tipo === TIPO_DA_RICEVERE) return "DA RICEVERE";
  if (tipo === TIPO_DA_EMETTERE) return "DA EMETTERE";
  return tipo || "";
}

// Un documento entra nei costi se è un acquisto non collegato a un documento di competenza,
// oppure se è esso stesso un documento di competenza
export function entraNeiCosti(f) {
  if (!f) return false;
  if (f.tipo === TIPO_DA_RICEVERE || f.tipo === TIPO_DA_EMETTERE) return true;
  return f.tipo === "PASSIVA" && !f.regolarizzazione_di;
}

// Legge i documenti di un periodo che entrano nei costi. Se la colonna regolarizzazione_di non
// esiste ancora (file SQL della versione 237 non lanciato) legge come prima, solo le passive.
export async function leggiFattureNeiCosti(supabase, fetchAllPages, dataDa, dataA) {
  const conColonna = await fetchAllPages((da, a) => supabase
    .from("ci_fatture").select("id, data, tipo, regolarizzazione_di").in("tipo", TIPI_NEI_COSTI)
    .gte("data", dataDa).lte("data", dataA).order("id").range(da, a));
  if (!conColonna.error) return { data: (conColonna.data || []).filter(entraNeiCosti), error: null };
  const vecchio = await fetchAllPages((da, a) => supabase
    .from("ci_fatture").select("id, data, tipo").eq("tipo", "PASSIVA")
    .gte("data", dataDa).lte("data", dataA).order("id").range(da, a));
  return { data: vecchio.data || [], error: vecchio.error, senzaColonna: true };
}
