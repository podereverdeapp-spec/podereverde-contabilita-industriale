// Versione 400 (Tenente, 24/11/2026; decisione del Dott. Bizzarri delle 18:41): rinomina di UN file dell'archivio F24 con il protocollo interno.
// Ordine dei passi (niente si sovrascrive, niente si perde):
//  1) nel cloud c'è proprio il file registrato nel programma (stessa impronta)? altrimenti si salta;
//  2) se c'è già un file con il nome nuovo: va bene solo se è identico; altrimenti si salta;
//  3) si scrive la copia con il nome nuovo (nome provvisorio, rilettura, impronta: scriviVerificato);
//  4) si aggiorna il programma, solo se il percorso registrato è ancora quello vecchio;
//  5) si RILEGGE la riga del programma: decide lei. Se punta al nome nuovo (aggiornata da noi, da un'altra persona o con la risposta persa
//     per la rete) la copia nuova resta; se punta ancora al vecchio si toglie la copia appena scritta; se non si riesce a rileggerla non si tocca niente;
//  6) solo quando la riga punta al nome nuovo si toglie il nome vecchio, dopo averlo riletto (se nel frattempo è cambiato, resta).
// Ricontrollo indipendente del 24/11 (versione 400, primo giro): con due persone insieme o con la risposta persa la copia nuova veniva tolta
// mentre il programma puntava a lei. Per questo decide la riga riletta e non la risposta dell'aggiornamento.
import { md5 } from "./md5";
import { esiste, nomeNonAccettato, scriviVerificato, cartella } from "./archivioF24";

const legge = async (dir, nome) => new Uint8Array(await (await (await dir.getFileHandle(nome)).getFile()).arrayBuffer());

// archivio: la cartella ARCHIVIO; x: una voce di pianoRinomina().daFare;
// db.aggiorna(id, vecchio, nuovo) → Promise<{ ok, motivo }>; db.rileggi(id) → Promise<{ percorso } | null> (null se non si riesce a leggere)
// ritorna { esito: "rinominato" | "rinominato, vecchio rimasto" | "saltato" | "da ricontrollare", motivo }
export async function rinominaFile(archivio, x, db) {
  const pezzi = x.vecchio.split("\\"); const nomeVecchio = pezzi.pop(); const nomeNuovo = x.nuovo.split("\\").pop();
  if (x.nuovo.split("\\").slice(0, -1).join("\\") !== pezzi.join("\\")) return { esito: "saltato", motivo: "il nome nuovo è in un'altra cartella: non si sposta niente" };
  const no = nomeNonAccettato(nomeNuovo); if (no) return { esito: "saltato", motivo: `il nome «${nomeNuovo}» ${no}` };
  let dir;
  try { dir = await cartella(archivio, pezzi.join("\\"), false); }   // la cartella c'è già: non se ne creano
  catch { return { esito: "saltato", motivo: "nel cloud la cartella non c'è (spostata o rinominata a mano)" }; }
  const vero = await esiste(dir, nomeVecchio);
  if (!vero) return { esito: "saltato", motivo: "nel cloud il file non c'è (spostato, rinominato a mano o già rinominato da un'altra persona)" };
  const byte = await legge(dir, vero);
  if (md5(byte) !== x.md5) return { esito: "saltato", motivo: "nel cloud il file è diverso da quello registrato nel programma (impronta diversa): resta com'è, da guardare" };
  const gia = await esiste(dir, nomeNuovo);
  if (gia && md5(await legge(dir, gia)) !== x.md5) return { esito: "saltato", motivo: `nella cartella c'è già un altro file che si chiama «${gia}»` };
  let scritto = false;
  if (!gia) {
    const r = await scriviVerificato(dir, nomeNuovo, byte);
    const nomeScritto = r.percorso.split("\\").pop();
    if (nomeScritto.toUpperCase() !== nomeNuovo.toUpperCase()) {   // un altro file ha preso il nome proprio adesso
      if (r.esito.startsWith("Scritto")) { try { await dir.removeEntry(nomeScritto); } catch { /* resta: si vede */ } }
      return { esito: "saltato", motivo: "il nome nuovo è stato preso da un altro file proprio adesso" };
    }
    scritto = r.esito === "Scritto";
  }
  const a = await db.aggiorna(x.id, x.vecchio, x.nuovo);
  let riga = null; try { riga = await db.rileggi(x.id); } catch { riga = null; }
  if (!riga) return { esito: "da ricontrollare", motivo: `non si è riusciti a rileggere il programma dopo l'aggiornamento${a.ok ? "" : ` (${a.motivo})`}: non si è tolto niente: nella cartella possono esserci il nome vecchio e il nome nuovo. Avvisare il Dott. Bizzarri` };
  if (riga.percorso !== x.nuovo) {
    if (riga.percorso === x.vecchio && scritto) { try { await dir.removeEntry(nomeNuovo); } catch { /* resta: si vede */ } }
    return { esito: "saltato", motivo: riga.percorso === x.vecchio
      ? `il programma non ha accettato la modifica (${a.ok ? "senza errore" : a.motivo}; può mancare il permesso della pagina F24): il nome vecchio resta`
      : `nel frattempo il programma punta a un altro file («${riga.percorso.split("\\").pop()}»): non si tocca niente` };
  }
  // la riga punta al nome nuovo: prima si controlla che il file nuovo ci sia davvero (un'altra persona potrebbe averlo tolto)
  let nuovoBuono = false;
  try { const n = await esiste(dir, nomeNuovo); nuovoBuono = !!n && md5(await legge(dir, n)) === x.md5; } catch { nuovoBuono = false; }
  if (!nuovoBuono) return { esito: "da ricontrollare", motivo: `il programma punta al nome nuovo ma nel cloud il file nuovo non c'è o è diverso; il nome vecchio «${vero}» non si è tolto: avvisare il Dott. Bizzarri` };
  // solo adesso via il nome vecchio, se è ancora lo stesso file
  try {
    const v = await esiste(dir, vero);
    if (!v) return { esito: "rinominato" };   // tolto da un'altra persona che rinominava insieme
    if (md5(await legge(dir, v)) === x.md5) { await dir.removeEntry(v); return { esito: "rinominato" }; }
    return { esito: "rinominato, vecchio rimasto", motivo: `il file con il nome vecchio «${v}» è stato cambiato da qualcuno durante la rinomina: non si è tolto. Avvisare il Dott. Bizzarri` };
  } catch { /* sotto */ }
  return { esito: "rinominato, vecchio rimasto", motivo: `nella cartella è rimasta una copia con il nome vecchio «${vero}»: avvisare il Dott. Bizzarri` };
}
