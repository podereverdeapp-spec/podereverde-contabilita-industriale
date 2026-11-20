// Versione 391 (Tenente, 20/11/2026): i file di una spesa salvata dall'app (archivio «cassa»).
// Dall'app 149 una spesa può avere fino a quattro file: il documento d'acquisto (manca solo con «Altro»), la ricevuta di pagamento
// (POS o conferma del venditore online), la foto del bene e la foto dell'insegna (quando lo scontrino non si legge).
import { supabase } from "./supabase";

export const ETICHETTE_FILE = { pdf_percorso: "Documento", pagamento_percorso: "Ricevuta di pagamento", foto_percorso: "Foto del bene", insegna_percorso: "Foto dell'insegna" };

// i file presenti, nell'ordine: documento, ricevuta di pagamento, foto del bene, foto dell'insegna
export const fileDellaSpesa = s => Object.keys(ETICHETTE_FILE).filter(k => s && s[k]).map(k => ({ campo: k, etichetta: ETICHETTE_FILE[k], percorso: s[k] }));

// il primo file da aprire quando la pagina ha un solo tasto «documento»
export const primoFileDellaSpesa = s => fileDellaSpesa(s)[0] || null;

// apre un file dell'archivio «cassa»; restituisce null se va bene, altrimenti il messaggio d'errore
export async function apriFileSpesa(percorso) {
  if (!percorso) return "la spesa non ha file (spesa «Altro» senza documento)";
  const { data, error } = await supabase.storage.from("cassa").createSignedUrl(percorso, 120);
  if (error || !data?.signedUrl) return error?.message || "nessun indirizzo";
  window.open(data.signedUrl, "_blank", "noopener");
  return null;
}

// «Contanti + resto pagato da me»: la parte presa dalla cassa e quella messa dalla persona
export const quotaDaMe = s => Number(s?.quota_da_me || 0);
export const dallaCassa = s => Number(s?.importo || 0) - quotaDaMe(s);

// strumenti pagati con soldi della persona, da rimborsare («Carta di credito personale» è il nome di prima di «La mia carta»)
export const STRUMENTI_PERSONALI = ["Pagato da me", "La mia carta", "Carta di credito personale"];
// quanto si rimborsa di una spesa: tutto con gli strumenti personali, la parte messa dalla persona con «Contanti + resto»
export const daRimborsare = s => (s.pagato_con === "Contanti" ? quotaDaMe(s) : STRUMENTI_PERSONALI.includes(s.pagato_con) ? Number(s.importo) : 0);
export const nomeStrumento = p => (p === "Carta di credito personale" ? "La mia carta" : p);
