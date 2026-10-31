// Versione 339 (31/10/2026): scrittura nella cartella F24 del cloud con la finestra delle cartelle di Chrome (File System Access).
// Regola zero: si lavora SOLO dentro la cartella «F24» scelta, e solo dopo aver controllato il file di riconoscimento.
// Ogni file si scrive con un nome provvisorio, si rilegge, si controlla l'impronta e solo allora prende il nome vero.
import { PDFDocument } from "pdf-lib";
import { md5 } from "./md5";
import { pagineDa, CODICE_FISCALE } from "./calcoloF24Arrivati";

export const FILE_RICONOSCIMENTO = "RICONOSCIMENTO CARTELLA F24 - NON TOCCARE.txt";

const parti = percorso => String(percorso).split("\\").filter(Boolean);

// cartella dentro la radice (crea le cartelle che mancano solo se richiesto); mai «..»
export async function cartella(radice, percorso, crea = false) {
  let h = radice;
  for (const p of parti(percorso)) {
    if (p === "." || p === "..") throw new Error(`Percorso vietato: ${percorso}`);
    h = await h.getDirectoryHandle(p, { create: crea });
  }
  return h;
}
export async function leggiFile(radice, percorso) {
  const p = parti(percorso); const nome = p.pop();
  const dir = await cartella(radice, p.join("\\"));
  const f = await (await dir.getFileHandle(nome)).getFile();
  return new Uint8Array(await f.arrayBuffer());
}
export async function esiste(dir, nome) {
  const cerca = nome.toUpperCase();
  for await (const [n] of dir.entries()) if (n.toUpperCase() === cerca) return n;
  return null;
}
export async function elenco(dir) {
  const out = [];
  for await (const [n, h] of dir.entries()) out.push({ nome: n, tipo: h.kind, handle: h });
  return out;
}

// ── File di riconoscimento ──────────────────────────────────────────────────────────────────────────
export function leggiRiconoscimento(testo) {
  const t = String(testo || "");
  const codice = (t.match(/CODICE DELLA CARTELLA:\s*(PV-F24-[A-Z0-9]{8})/) || [])[1] || null;
  const ok = /SOCIETA' AGRICOLA PODERE VERDE A R\.L\./.test(t) && t.includes(`CODICE FISCALE: ${CODICE_FISCALE}`) && /CARTELLA:\s*F24\b/.test(t) && !!codice;
  return { ok, codice };
}
export function testoRiconoscimento(codice, quando) {
  return `SOCIETA' AGRICOLA PODERE VERDE A R.L.\r\nCODICE FISCALE: ${CODICE_FISCALE}\r\nCARTELLA: F24\r\nCODICE DELLA CARTELLA: ${codice}\r\nCREATO IL: ${quando} DAL PROGRAMMA CONTABILITA' INDUSTRIALE\r\n`;
}
export function nuovoCodiceCartella() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = new Uint8Array(8); crypto.getRandomValues(b);
  return "PV-F24-" + [...b].map(x => a[x % a.length]).join("");
}

// ── PDF: una parte di un file (alcune pagine) o un'immagine trasformata in PDF ─────────────────────────
export async function preparaPdf(byte, nomeSorgente, pagine) {
  const est = (nomeSorgente.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
  if (est === "jpg" || est === "jpeg" || est === "png") {
    const doc = await PDFDocument.create();
    const img = est === "png" ? await doc.embedPng(byte) : await doc.embedJpg(byte);
    const pag = doc.addPage([img.width, img.height]); pag.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    return new Uint8Array(await doc.save());
  }
  if (est !== "pdf") throw new Error(`«${nomeSorgente}»: formato «${est}» non trasformabile in PDF dal programma: chiedere il PDF`);
  if (!pagine) return byte;
  const orig = await PDFDocument.load(byte, { ignoreEncryption: false });
  const scelte = pagineDa(pagine, orig.getPageCount());
  if (scelte?.errore) throw new Error(`«${nomeSorgente}»: ${scelte.errore}`);
  if (!scelte) return byte;
  const doc = await PDFDocument.create();
  for (const p of await doc.copyPages(orig, scelte)) doc.addPage(p);
  return new Uint8Array(await doc.save());
}

// Versione 341: i caratteri che Chrome non accetta nei nomi di file e cartelle sul disco (oltre a quelli vietati da Windows c'è «~»)
export function nomeNonAccettato(n) {
  if (!n) return "è vuoto";
  if (/[\x00-\x1f"~*/:<>?\\|]/.test(n)) return "contiene un carattere non accettato (\" ~ * / : < > ? \\ |)";
  if (/[ .]$/.test(n) || /^[ .]/.test(n)) return "comincia o finisce con uno spazio o un punto";
  return null;
}
// ── Scrittura sicura di un file: nome provvisorio, rilettura, impronta, nome vero ─────────────────────
// Ritorna { esito: "Scritto" | "Già presente uguale", md5, dimensione }. Un file con lo stesso nome ma diverso: errore (mai sovrascrivere).
// rilegge un file: sul disco di rete la lettura subito dopo la scrittura può dare il contenuto vecchio, quindi si riprova
const pausa = ms => new Promise(r => setTimeout(r, ms));
async function rileggiFinoA(dirH, nome, impronta, tentativi = 6) {
  let ultimo = null;
  for (let k = 0; k < tentativi; k++) {
    const b = new Uint8Array(await (await (await dirH.getFileHandle(nome)).getFile()).arrayBuffer());
    ultimo = md5(b);
    if (ultimo === impronta) return true;
    await pausa(700);
  }
  return false;
}
export async function scriviVerificato(radice, percorso, byte) {
  const p = parti(percorso); const nomeChiesto = p.pop();
  let passo = "apertura della cartella";
  try {
    passo = "controllo dei nomi";
    for (const n of [...p, nomeChiesto]) { const no = nomeNonAccettato(n); if (no) throw new Error(`il nome «${n}» ${no}`); }
    const dir = await cartella(radice, p.join("\\"), true);
    const impronta = md5(byte);
    // stesso nome già presente: se è lo stesso file non si riscrive; se è diverso si usa «_2», «_3» (mai sovrascrivere)
    passo = "controllo dei nomi già presenti";
    let nome = nomeChiesto;
    for (let n = 2; ; n++) {
      const gia = await esiste(dir, nome);
      if (!gia) break;
      const vecchio = md5(new Uint8Array(await (await (await dir.getFileHandle(gia)).getFile()).arrayBuffer()));
      if (vecchio === impronta) return { esito: "Già presente uguale", md5: impronta, dimensione: byte.length, percorso: `${p.join("\\")}\\${gia}` };
      nome = nomeChiesto.replace(/(\.[^.]+)$/, `_${n}$1`);
    }
    const provvisorio = `PROVVISORIO ${Date.now()} ${nome}`; // versione 341: senza «~», che Chrome non accetta nei nomi
    passo = "scrittura del file provvisorio";
    const fh = await dir.getFileHandle(provvisorio, { create: true });
    const w = await fh.createWritable(); await w.write(byte); await w.close();
    passo = "rilettura e controllo dell'impronta";
    if (!(await rileggiFinoA(dir, provvisorio, impronta))) {
      try { await dir.removeEntry(provvisorio); } catch { /* resta il provvisorio: lo si vede */ }
      throw new Error("la copia scritta non è uguale all'originale (impronta diversa)");
    }
    passo = "cambio del nome provvisorio nel nome vero";
    let rinominato = false;
    if (typeof fh.move === "function") { try { await fh.move(nome); rinominato = true; } catch { rinominato = false; } }
    if (!rinominato) { // senza «move» (o se non riesce): si scrive il nome vero e si toglie il provvisorio
      const fv = await dir.getFileHandle(nome, { create: true }); const w2 = await fv.createWritable(); await w2.write(byte); await w2.close();
      await dir.removeEntry(provvisorio);
    }
    passo = "controllo finale dell'impronta";
    if (!(await rileggiFinoA(dir, nome, impronta))) throw new Error("dopo il cambio di nome l'impronta non torna");
    return { esito: nome === nomeChiesto ? "Scritto" : `Scritto come «${nome}» (il nome era già usato)`, md5: impronta, dimensione: byte.length, percorso: `${p.join("\\")}\\${nome}` };
  } catch (e) {
    throw new Error(`«${nomeChiesto}», ${passo}: ${e?.name && e.name !== "Error" ? e.name + " — " : ""}${e?.message || e}`);
  }
}

// sposta un file dentro la stessa cartella del pagamento in «SUPERATI» (versione corretta): copia verificata, poi toglie il vecchio
export async function mettiInSuperati(radice, percorso, oggi) {
  const p = parti(percorso); const nome = p.pop();
  const dir = await cartella(radice, p.join("\\"));
  const gia = await esiste(dir, nome); if (!gia) return null;
  const byte = new Uint8Array(await (await (await dir.getFileHandle(gia)).getFile()).arrayBuffer());
  const nuovoNome = nome.replace(/(\.[^.]+)$/, ` superato il ${oggi}$1`);
  const dest = `${p.join("\\")}\\SUPERATI\\${nuovoNome}`;
  const r = await scriviVerificato(radice, dest, byte);
  await dir.removeEntry(gia);
  return { ...r, destinazione: dest };
}

// cancella un originale da DA SMISTARE, solo se la sua impronta è ancora quella letta (nessuno lo ha cambiato)
export async function cancellaOriginale(radiceProgramma, percorsoRelativo, md5Atteso) {
  const p = parti(percorsoRelativo); const nome = p.pop();
  const dir = await cartella(radiceProgramma, p.join("\\"));
  const gia = await esiste(dir, nome); if (!gia) return "Non c'era più";
  const byte = new Uint8Array(await (await (await dir.getFileHandle(gia)).getFile()).arrayBuffer());
  if (md5Atteso && md5(byte) !== md5Atteso) throw new Error(`«${nome}» è cambiato dopo la lettura: non si cancella`);
  await dir.removeEntry(gia);
  return "Cancellato";
}

// Versione 342: cerca un file per nome (senza distinguere maiuscole) dentro una cartella e nelle sue sottocartelle
export async function cercaFile(dir, nome, base = "", profondita = 8) {
  const out = []; const cerca = nome.toUpperCase();
  for await (const [n, h] of dir.entries()) {
    if (h.kind === "file" && n.toUpperCase() === cerca) out.push({ percorso: base ? `${base}\\${n}` : n, handle: h });
    else if (h.kind === "directory" && profondita > 0) out.push(...await cercaFile(h, nome, base ? `${base}\\${n}` : n, profondita - 1));
  }
  return out;
}

// percorso dentro DA SMISTARE di un file del foglio «Documenti» (la colonna «Percorso» può essere completa)
export function percorsoInDaSmistare(doc) {
  const p = String(doc?.percorso || doc?.nome || "");
  const i = p.toUpperCase().lastIndexOf("DA SMISTARE\\");
  return i >= 0 ? p.slice(i + "DA SMISTARE\\".length) : doc?.nome;
}
