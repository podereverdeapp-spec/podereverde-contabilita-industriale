import { supabase } from "./supabase";
import { md5 } from "./md5";
import { leggiByte } from "./cartellaBanche";

// Versione 365 (11/11/2026, proposta del Dott. Bizzarri delle 13:41): gli estratti conto si salvano anche DENTRO il programma,
// nell'archivio privato «banche». Il nome di ogni file è la sua impronta MD5: si riconosce sempre e non si può sostituire.
// La cartella BANCHE del cloud resta come copia: se un file non è ancora nel programma, si apre da lì come prima.
// Funzione comune per tutte le pagine che aprono un estratto (anche la «Consulta F24» del Coglione): apriEstratto.

export const ARCHIVIO_PROGRAMMA = "banche";

export const tipoDaNome = (nome) => {
  const n = String(nome || "").toLowerCase();
  return n.endsWith(".pdf") ? "application/pdf" : n.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : n.endsWith(".xls") ? "application/vnd.ms-excel" : n.endsWith(".csv") ? "text/csv" : "application/octet-stream";
};

// Le impronte dei file già salvati nel programma (insieme di stringhe). Chi non può leggere l'archivio riceve un insieme vuoto.
export async function impronteNelProgramma() {
  const tutte = new Set();
  for (let da = 0; da < 20000; da += 1000) {
    const { data, error } = await supabase.storage.from(ARCHIVIO_PROGRAMMA).list("", { limit: 1000, offset: da, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error("elenco dell'archivio del programma non letto: " + error.message);
    for (const f of data || []) if (/^[0-9a-f]{32}$/.test(f.name)) tutte.add(f.name);
    if (!data || data.length < 1000) break;
  }
  return tutte;
}

// Salva un file nel programma. Prima di salvare ricontrolla che i byte abbiano l'impronta data.
// Esito: { salvato: true } | { gia: true } (c'era già, verificato) ; altrimenti lancia un errore con la spiegazione.
export async function salvaNelProgramma(impronta, byte, nome) {
  if (md5(byte) !== impronta) throw new Error("il file non corrisponde all'impronta registrata");
  const tipo = tipoDaNome(nome);
  const { error } = await supabase.storage.from(ARCHIVIO_PROGRAMMA).upload(impronta, new Blob([byte], { type: tipo }), { upsert: false, contentType: tipo });
  if (!error) {
    const ril = await leggiDalProgramma(impronta);                     // rilettura: la copia deve essere identica
    if (!ril) throw new Error("salvato, ma la rilettura non riesce");
    return { salvato: true };
  }
  if (/exist|duplicate|409/i.test(String(error.message || "") + " " + String(error.statusCode || "") + " " + String(error.status || ""))) {
    const ril = await leggiDalProgramma(impronta);
    if (ril) return { gia: true };
  }
  throw new Error("non salvato nel programma: " + (/row-level security|policy|Unauthorized|403/i.test(error.message || "") ? "permesso negato (serve l'accesso a «Banche, carte e cassa» e un documento caricato con questo file)" : error.message));
}

// Legge un file dal programma. null se non c'è o non si legge; errore se c'è ma l'impronta non torna (file rovinato).
export async function leggiDalProgramma(impronta) {
  if (!/^[0-9a-f]{32}$/.test(String(impronta || ""))) return null;
  const { data, error } = await supabase.storage.from(ARCHIVIO_PROGRAMMA).download(impronta);
  // non c'è (o non si può leggere): si torna null e la pagina prova la copia nel cloud, come prima della 365
  if (error || !data) return null;
  const byte = new Uint8Array(await data.arrayBuffer());
  if (md5(byte) !== impronta) throw new Error("la copia nel programma non è identica all'originale (impronta diversa): avvisare chi gestisce i conti");
  return byte;
}

// Apre un estratto: prima dall'archivio del programma, poi (se manca) dalla cartella BANCHE del cloud.
//   impronta: impronta del file; percorso: percorso nella cartella BANCHE (da ci_banche_archivio), può mancare;
//   radice: cartella BANCHE già scelta (può mancare).
// Esito: { byte, tipo, nome, fonte: "programma" | "cloud" }  oppure  { serveCartella: true } se il file è solo nel cloud e la cartella non è scelta.
export async function apriEstratto({ impronta, percorso, radice, nome }) {
  const nomeFile = (percorso ? String(percorso).split("\\").pop() : "") || nome || `estratto ${String(impronta || "").slice(0, 8)}.pdf`;
  const daProgramma = await leggiDalProgramma(impronta);
  if (daProgramma) return { byte: daProgramma, tipo: tipoDaNome(nomeFile), nome: nomeFile, fonte: "programma" };
  if (!percorso) throw new Error("il documento non è né nell'archivio del programma né nell'archivio di BANCHE");
  if (!radice) return { serveCartella: true };
  const byte = await leggiByte(radice, percorso);
  // anche la copia del cloud si ricontrolla: un file sostituito nella cartella BANCHE non si mostra come se fosse quello caricato
  if (md5(byte) !== impronta) throw new Error(`nella cartella BANCHE il file ${nomeFile} non è più quello caricato (impronta diversa): avvisare chi gestisce i conti`);
  return { byte, tipo: tipoDaNome(nomeFile), nome: nomeFile, fonte: "cloud" };
}
