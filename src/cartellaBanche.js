// Versione 353 — la cartella BANCHE di Podere Verde sul cloud, scelta con la finestra delle cartelle di Chrome o Edge.
// Regola: il programma lavora SOLO dentro la cartella BANCHE scelta, e solo dopo aver letto il file di riconoscimento
// con il codice uguale a quello scritto nel programma (tabella ci_banche_cartella). La lettera del disco non conta:
// ogni operatore sceglie la cartella dove la vede lui. Metodo di scrittura ripreso da «F24 arrivati» (archivioF24.js):
// nome provvisorio, rilettura, impronta, nome vero; mai sovrascrivere.
import { md5 } from "./md5";

export const FILE_RICONOSCIMENTO = "RICONOSCIMENTO CARTELLA BANCHE - NON TOCCARE.txt";
export const DA_SMISTARE = "ESTRATTI CONTO DA SMISTARE";
export const SCARTATI = "SCARTATI";   // non usata dal programma per spostare: i file rossi restano in DA SMISTARE
const PARTITA_IVA = "15117871002";

export const browserAdatto = () => typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

const parti = percorso => String(percorso).split("\\").filter(Boolean);
export async function cartella(radice, percorso, crea = false) {
  let h = radice;
  for (const p of parti(percorso)) {
    if (p === "." || p === "..") throw new Error(`Percorso vietato: ${percorso}`);
    h = await h.getDirectoryHandle(p, { create: crea });
  }
  return h;
}
export async function esiste(dir, nome) {
  const cerca = nome.toUpperCase();
  for await (const [n] of dir.entries()) if (n.toUpperCase() === cerca) return n;
  return null;
}
export async function leggiByte(radice, percorso) {
  const p = parti(percorso); const nome = p.pop();
  const dir = await cartella(radice, p.join("\\"));
  const vero = await esiste(dir, nome);
  if (!vero) throw new Error(`file non trovato: ${percorso}`);
  return new Uint8Array(await (await (await dir.getFileHandle(vero)).getFile()).arrayBuffer());
}
export async function fileDiCartella(dir) {
  const out = [];
  for await (const [n, h] of dir.entries()) if (h.kind === "file") out.push({ nome: n, handle: h });
  return out.sort((a, b) => a.nome.localeCompare(b.nome));
}

// ── Riconoscimento ────────────────────────────────────────────────────────────────────────────────
export function testoRiconoscimento(codice, quando) {
  return `SOCIETA' AGRICOLA PODERE VERDE A R.L.\r\nPARTITA IVA: ${PARTITA_IVA}\r\nCARTELLA: BANCHE\r\nCODICE DELLA CARTELLA: ${codice}\r\nCREATO IL: ${quando} DAL PROGRAMMA CONTABILITA' INDUSTRIALE\r\nQUESTO FILE SERVE AL PROGRAMMA PER RICONOSCERE LA CARTELLA: NON CANCELLARLO E NON MODIFICARLO.\r\n`;
}
export function leggiRiconoscimento(testo) {
  const t = String(testo || "");
  const codice = (t.match(/CODICE DELLA CARTELLA:\s*(PV-BANCHE-[A-Z0-9]{8})/) || [])[1] || null;
  const ok = t.includes("SOCIETA' AGRICOLA PODERE VERDE A R.L.") && t.includes(`PARTITA IVA: ${PARTITA_IVA}`) && /CARTELLA:\s*BANCHE\b/.test(t) && !!codice;
  return { ok, codice };
}
export function nuovoCodice() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = new Uint8Array(8); crypto.getRandomValues(b);
  return "PV-BANCHE-" + [...b].map(x => a[x % a.length]).join("");
}
// controlla la cartella scelta: { ok, codiceFile, manca, problema }
export async function controllaCartella(radice, codiceProgramma) {
  let testo = null;
  try { testo = new TextDecoder().decode(await leggiByte(radice, FILE_RICONOSCIMENTO)); } catch { testo = null; }
  if (testo === null) return { ok: false, manca: true, problema: `Nella cartella scelta («${radice.name}») non c'è il file «${FILE_RICONOSCIMENTO}». Questa non è la cartella BANCHE di Podere Verde, oppure non è ancora stata preparata.` };
  const r = leggiRiconoscimento(testo);
  if (!r.ok) return { ok: false, problema: "Il file di riconoscimento non dice «Podere Verde, 15117871002, BANCHE»: questa non è la cartella BANCHE di Podere Verde." };
  if (!codiceProgramma) return { ok: false, manca: true, codiceFile: r.codice, problema: "Nel programma non c'è ancora il codice della cartella BANCHE: la prepara chi gestisce i conti." };
  if (r.codice !== codiceProgramma) return { ok: false, problema: `Il codice del file di riconoscimento (${r.codice}) è diverso da quello del programma (${codiceProgramma}): questa non è la cartella BANCHE giusta.` };
  return { ok: true, codiceFile: r.codice };
}

// ── Ricordare la cartella su questo computer (IndexedDB del browser) ──────────────────────────────
const DB = "podereverde-banche", STORE = "cartelle", CHIAVE = "BANCHE";
function apriDb() {
  return new Promise((ok, ko) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
}
export async function ricordaCartella(h) {
  try { const db = await apriDb(); await new Promise((ok, ko) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(h, CHIAVE); t.oncomplete = ok; t.onerror = () => ko(t.error); }); } catch { /* non indispensabile */ }
}
export async function cartellaRicordata() {
  try { const db = await apriDb(); return await new Promise((ok) => { const r = db.transaction(STORE).objectStore(STORE).get(CHIAVE); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); } catch { return null; }
}
// permesso di lettura e scrittura: senza «chiedi» non apre finestre (all'apertura della pagina)
export async function permesso(h, chiedi) {
  if (!h?.queryPermission) return true;
  let s = await h.queryPermission({ mode: "readwrite" });
  if (s === "prompt" && chiedi) s = await h.requestPermission({ mode: "readwrite" });
  return s === "granted";
}

// ── Scrittura sicura ──────────────────────────────────────────────────────────────────────────────
export function nomeNonAccettato(n) {
  if (!n) return "è vuoto";
  if (/[\x00-\x1f"~*/:<>?\\|]/.test(n)) return "contiene un carattere non accettato (\" ~ * / : < > ? \\ |)";
  if (/[ .]$/.test(n) || /^[ .]/.test(n)) return "comincia o finisce con uno spazio o un punto";
  return null;
}
const pausa = ms => new Promise(r => setTimeout(r, ms));
async function rileggiFinoA(dirH, nome, impronta, tentativi = 6) {
  for (let k = 0; k < tentativi; k++) {
    const b = new Uint8Array(await (await (await dirH.getFileHandle(nome)).getFile()).arrayBuffer());
    if (md5(b) === impronta) return true;
    await pausa(700);
  }
  return false;
}
// { esito: "Scritto" | "Già presente uguale", percorso, md5 }. Stesso nome con contenuto diverso: «_2», «_3» (mai sovrascrivere).
export async function scriviVerificato(radice, percorso, byte) {
  const p = parti(percorso); const nomeChiesto = p.pop();
  let passo = "controllo dei nomi";
  try {
    for (const n of [...p, nomeChiesto]) { const no = nomeNonAccettato(n); if (no) throw new Error(`il nome «${n}» ${no}`); }
    passo = "apertura della cartella";
    const dir = await cartella(radice, p.join("\\"), true);
    const impronta = md5(byte);
    passo = "controllo dei nomi già presenti";
    let nome = nomeChiesto;
    for (let n = 2; ; n++) {
      const gia = await esiste(dir, nome);
      if (!gia) break;
      const vecchio = md5(new Uint8Array(await (await (await dir.getFileHandle(gia)).getFile()).arrayBuffer()));
      if (vecchio === impronta) return { esito: "Già presente uguale", md5: impronta, percorso: `${p.join("\\")}\\${gia}` };
      nome = nomeChiesto.replace(/(\.[^.]+)$/, `_${n}$1`);
    }
    passo = "scrittura del file provvisorio";
    let provvisorio, fh;
    for (let tentativo = 1; ; tentativo++) {
      provvisorio = `PROVVISORIO ${Date.now()} ${nome}`;
      try { fh = await dir.getFileHandle(provvisorio, { create: true }); const w = await fh.createWritable(); await w.write(byte); await w.close(); break; }
      catch (e) {
        try { await dir.removeEntry(provvisorio); } catch { /* resta: si vede */ }
        if (tentativo >= 3 || !["InvalidStateError", "NotReadableError", "NoModificationAllowedError", "AbortError"].includes(e?.name)) throw e;
        await pausa(1500);
      }
    }
    passo = "rilettura e controllo dell'impronta";
    if (!(await rileggiFinoA(dir, provvisorio, impronta))) { try { await dir.removeEntry(provvisorio); } catch { /* resta */ } throw new Error("la copia scritta non è uguale all'originale (impronta diversa)"); }
    passo = "cambio del nome provvisorio nel nome vero";
    // subito prima di rinominare si ricontrolla il nome: un altro operatore può averlo occupato nel frattempo (mai sovrascrivere)
    for (let k = 2; ; k++) {
      const gia = await esiste(dir, nome);
      if (!gia) break;
      const vecchio = md5(new Uint8Array(await (await (await dir.getFileHandle(gia)).getFile()).arrayBuffer()));
      if (vecchio === impronta) { try { await dir.removeEntry(provvisorio); } catch { /* resta */ } return { esito: "Già presente uguale", md5: impronta, percorso: `${p.join("\\")}\\${gia}` }; }
      nome = nomeChiesto.replace(/(\.[^.]+)$/, `_${k}$1`);
    }
    let rinominato = false;
    if (typeof fh.move === "function") { try { await fh.move(nome); rinominato = true; } catch { rinominato = false; } }
    if (!rinominato) {
      if (await esiste(dir, nome)) throw new Error(`il nome «${nome}» è stato occupato da un altro file mentre scrivevo: rifare «Archivia e carica»`);
      const fv = await dir.getFileHandle(nome, { create: true }); const w2 = await fv.createWritable(); await w2.write(byte); await w2.close(); await dir.removeEntry(provvisorio);
    }
    passo = "controllo finale dell'impronta";
    if (!(await rileggiFinoA(dir, nome, impronta))) throw new Error("dopo il cambio di nome l'impronta non torna");
    return { esito: "Scritto", md5: impronta, percorso: `${p.join("\\")}\\${nome}` };
  } catch (e) {
    throw new Error(`«${nomeChiesto}», ${passo}: ${e?.name && e.name !== "Error" ? e.name + " — " : ""}${e?.message || e}`);
  }
}
// toglie un file da DA SMISTARE solo se è ancora quello letto (stessa impronta)
export async function togliDaSmistare(radice, nome, impronta) {
  const dir = await cartella(radice, DA_SMISTARE);
  const gia = await esiste(dir, nome); if (!gia) return "Non c'era più";
  const b = new Uint8Array(await (await (await dir.getFileHandle(gia)).getFile()).arrayBuffer());
  if (md5(b) !== impronta) throw new Error(`«${nome}» è cambiato dopo la lettura: non si toglie`);
  await dir.removeEntry(gia);
  return "Tolto";
}

// ── Dove va un documento nell'archivio e con che nome ─────────────────────────────────────────────
// BPER: BPER BANCA - ABI 05387 CAB 03206\ESTRATTI CONTO BPER BANCA\2026 ESTRATTI CONTO BPER BANCA\BPER 2923 - estratto conto dal 2026-07-01 al 2026-09-30.pdf
// Carta: CARTA PREPAGATA BPER 8006\LISTE MOVIMENTI CARTA 8006\2026 LISTE MOVIMENTI CARTA 8006\Carta 8006 - lista movimenti dal 2026-01-01 al 2026-08-02.xls
export function posizioneInArchivio(conto, { tipo, formato, dal, al, estensione }) {
  const base = String(conto.cartella_su_z || conto.nome).replace(/^BANCHE\\/i, "").toUpperCase();
  const anno = String(al).slice(0, 4);
  const ext = String(estensione || "").toLowerCase().replace(/^\.?/, ".");
  if (tipo === "lista movimenti della carta") {
    const cifre = conto.ultime_quattro_cifre;
    const t = `LISTE MOVIMENTI CARTA ${cifre}`;
    return `${base}\\${t}\\${anno} ${t}\\Carta ${cifre} - lista movimenti dal ${dal} al ${al}${ext}`;
  }
  const banca = base.split(/ - | \(/)[0].trim();                   // «BPER BANCA», «CARIGE»
  const sigla = `${banca.split(" ")[0]} ${String(conto.iban || "").slice(-4)}`;   // «BPER 2923»
  const t = `ESTRATTI CONTO ${banca}`;
  const cosa = formato === "lista CBI" ? "lista movimenti" : "estratto conto";
  return `${base}\\${t}\\${anno} ${t}\\${sigla} - ${cosa} dal ${dal} al ${al}${ext}`;
}
