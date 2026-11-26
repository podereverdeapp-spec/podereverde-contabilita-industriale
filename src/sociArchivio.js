// Versione 408 (Tenente, 26/11/2026) — documenti dei rapporti con i soci.
// Decisione del Dott. Bizzarri delle 17:24 («C»): gli originali restano nella cartella del cloud
// «FINANZIAMENTO SOCI_SOCIETA' AGRICOLA PODERE VERDE A R.L» (dentro «00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE»), ordinati per socio e anno
// («CERCHIO CHIUSO\ANNO 2020\…»); il programma ne tiene una copia identica (stessa impronta MD5) nell'archivio privato «soci»
// e la apre con un clic. Stesso metodo degli estratti conto della versione 365 (estrattiProgramma.js): nome del file = impronta,
// rilettura dopo il salvataggio, mai sovrascrivere. Nella cartella del cloud si scrive con scriviVerificato (cartellaBanche.js).
import { supabase } from "./supabase";
import { md5 } from "./md5";
import { leggiByte, scriviVerificato, esiste, browserAdatto, permesso } from "./cartellaBanche";

export const ARCHIVIO_SOCI = "soci";
export const NOME_CARTELLA = "FINANZIAMENTO SOCI_SOCIETA' AGRICOLA PODERE VERDE A R.L";
export { browserAdatto };

const ESTENSIONI = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
export const estensione = (nome) => { const e = String(nome || "").toLowerCase().split(".").pop(); return e === "jpeg" ? "jpg" : ESTENSIONI[e] ? e : null; };
export const tipoFile = (nome) => ESTENSIONI[String(nome || "").toLowerCase().split(".").pop()] || "application/octet-stream";

// cartella del socio nel cloud: il nome senza la forma della società (S.r.l., S.c.a r.l., unipersonale…) e senza caratteri vietati.
// Se nella cartella c'è già una cartella con le stesse parole del socio (es. «CERCHIO CHIUSO»), si usa quella (archiviaECarica).
const FORME = new Set(["S", "R", "L", "A", "C", "SRL", "SPA", "SNC", "SAS", "SS", "SOC", "SOCIETA", "SOCIETÀ", "ARL", "SCARL", "SCRL", "COOP", "UNIPERSONALE", "SEMPLIFICATA"]);
const parole = t => String(t || "").toUpperCase().replace(/[^A-ZÀ-Ý0-9]+/g, " ").split(" ").filter(w => w && !FORME.has(w));
export function cartellaDelSocio(nome) { return parole(nome).join(" ") || "ALTRI"; }
export const percorsoNelCloud = (socio, data, nomeFile) => `${cartellaDelSocio(socio)}\\ANNO ${String(data).slice(0, 4)}\\${nomeFile}`;
export async function cartellaEsistente(radice, socio) {
  const p = parole(socio); if (!p.length) return null;
  for await (const [n, h] of radice.entries()) {
    if (h.kind !== "directory") continue;
    const q = parole(n);
    if (q.length === p.length && q.every(w => p.includes(w))) return n;   // stesse parole (revisione: non una parte del nome)
  }
  return null;
}

// la cartella scelta deve essere proprio quella dei finanziamenti dei soci (il nome si controlla, così non si scrive altrove)
export function controllaCartellaSoci(h) {
  if (!h) return "Cartella non scelta.";
  if (String(h.name || "").trim().toUpperCase() !== NOME_CARTELLA.toUpperCase())
    return `Hai scelto «${h.name}». Va scelta la cartella «${NOME_CARTELLA}», che sta in «00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE»: un clic su di lei, senza entrarci, poi «Seleziona cartella».`;
  return null;
}

// ricordata sul computer (come la cartella BANCHE), con una chiave sua
const DB = "podereverde-soci", STORE = "cartelle", CHIAVE = "FINANZIAMENTO SOCI";
function apriDb() { return new Promise((ok, ko) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }); }
export async function ricordaCartellaSoci(h) { try { const db = await apriDb(); await new Promise((ok, ko) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(h, CHIAVE); t.oncomplete = ok; t.onerror = () => ko(t.error); }); } catch { /* non indispensabile */ } }
export async function cartellaSociRicordata() { try { const db = await apriDb(); return await new Promise((ok) => { const r = db.transaction(STORE).objectStore(STORE).get(CHIAVE); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); } catch { return null; } }
export async function scegliCartellaSoci() {
  if (!browserAdatto()) throw new Error("Questo browser non sa aprire le cartelle del computer: usare Chrome o Edge sul computer.");
  const h = await window.showDirectoryPicker({ mode: "readwrite" });
  const no = controllaCartellaSoci(h); if (no) throw new Error(no);
  if (!(await permesso(h, true))) throw new Error("Permesso di lettura e scrittura sulla cartella non dato.");
  await ricordaCartellaSoci(h);
  return h;
}

// tutti i file della cartella, a qualunque profondità (socio\ANNO aaaa\file, ma anche socio\file o socio\ANNO aaaa\sottocartella\file):
// { percorso, nome, socio, anno, byte, impronta, file }. Il socio è la prima cartella; l'anno è quello di «ANNO aaaa» nel percorso.
export async function leggiCartellaSoci(radice, avanzamento) {
  const out = [];
  async function giro(dir, strada) {
    for await (const [n, h] of dir.entries()) {
      if (h.kind === "directory") { await giro(h, [...strada, n]); continue; }
      if (h.kind !== "file" || !strada.length || !estensione(n)) continue;
      const byte = new Uint8Array(await (await h.getFile()).arrayBuffer()); const imp = md5(byte);
      const anno = (strada.join(" ").match(/ANNO\s+(\d{4})/i) || [])[1] || (n.match(/(19|20)\d{2}/) || [""])[0];
      out.push({ percorso: [...strada, n].join("\\"), nome: n, socio: strada[0], anno, byte, impronta: imp, file: `${imp}.${estensione(n)}` });
      avanzamento && avanzamento(out.length);
    }
  }
  await giro(radice, []);
  return out.sort((a, b) => a.percorso.localeCompare(b.percorso));
}

// file già nel programma (insieme dei nomi «impronta.estensione»)
export async function fileNelProgramma() {
  const tutti = new Set();
  for (let da = 0; da < 20000; da += 1000) {
    const { data, error } = await supabase.storage.from(ARCHIVIO_SOCI).list("", { limit: 1000, offset: da, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error("elenco dell'archivio dei soci non letto: " + error.message);
    for (const f of data || []) tutti.add(f.name);
    if (!data || data.length < 1000) break;
  }
  return tutti;
}

// salva la copia nel programma e registra dov'è l'originale nel cloud. Esito: { file, percorso, gia }
export async function archiviaNelProgramma(byte, nomeOriginale, percorso) {
  const est = estensione(nomeOriginale);
  if (!est) throw new Error(`«${nomeOriginale}»: si archiviano solo PDF, JPG e PNG`);
  const file = `${md5(byte)}.${est}`;
  const tipo = tipoFile(nomeOriginale);
  const { error } = await supabase.storage.from(ARCHIVIO_SOCI).upload(file, new Blob([byte], { type: tipo }), { upsert: false, contentType: tipo });
  if (error && !/exist|duplicate|409/i.test(`${error.message || ""} ${error.statusCode || ""} ${error.status || ""}`)) throw new Error("copia nel programma non salvata: " + error.message);
  const ril = await leggiDalProgramma(file);
  if (!ril) throw new Error("copia nel programma salvata, ma la rilettura non riesce");
  const { data, error: e2 } = await supabase.rpc("ci_soci_archivia", { p_file: file, p_percorso: percorso, p_nome: nomeOriginale });
  if (e2) throw new Error("posizione nel cloud non registrata: " + e2.message);
  return { file, percorso: data?.percorso || percorso, gia: !!data?.gia };
}

// «Archivia e carica» di un documento nuovo: prima nella cartella del cloud (copia verificata), poi nel programma
export async function archiviaECarica(radice, fileScelto, socio, data) {
  const byte = new Uint8Array(await fileScelto.arrayBuffer());
  const esistente = await cartellaEsistente(radice, socio);   // revisione: la cartella del socio che c'è già (es. «CERCHIO CHIUSO»)
  const percorso = `${esistente || cartellaDelSocio(socio)}\\ANNO ${String(data).slice(0, 4)}\\${fileScelto.name}`;
  const w = await scriviVerificato(radice, percorso, byte);
  return { ...(await archiviaNelProgramma(byte, fileScelto.name, w.percorso)), esitoCloud: w.esito };
}

export async function leggiDalProgramma(file) {
  if (!/^[0-9a-f]{32}\.(pdf|jpg|png)$/.test(String(file || ""))) return null;
  const { data, error } = await supabase.storage.from(ARCHIVIO_SOCI).download(file);
  if (error || !data) return null;
  const byte = new Uint8Array(await data.arrayBuffer());
  if (md5(byte) !== file.slice(0, 32)) throw new Error("la copia nel programma non è identica all'originale (impronta diversa): avvisare chi gestisce i conti");
  return byte;
}

// apre il documento: dal programma; se manca, dalla cartella del cloud (se scelta), controllando l'impronta
export async function apriDocumentoSocio({ file, percorso, radice }) {
  let byte = await leggiDalProgramma(file);
  if (!byte) {
    if (!percorso) throw new Error("il documento non è nell'archivio del programma");
    if (!radice) throw new Error("il documento è solo nella cartella del cloud: scegliere la cartella «" + NOME_CARTELLA + "»");
    byte = await leggiByte(radice, percorso);
    if (md5(byte) !== String(file).slice(0, 32)) throw new Error("nella cartella del cloud il file non è più quello archiviato (impronta diversa)");
  }
  const url = URL.createObjectURL(new Blob([byte], { type: tipoFile(file) }));
  const w = window.open(url, "_blank");
  if (!w) { const a = document.createElement("a"); a.href = url; a.download = (percorso || file).split("\\").pop(); a.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

export { esiste };
