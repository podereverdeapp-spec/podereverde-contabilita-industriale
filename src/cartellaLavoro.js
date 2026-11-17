// Versione 387 (Tenente, 17/11/2026) — la cartella LAVORO del cloud: nomi delle cartelle e dei file, cambio di nome delle cartelle
// «da caricare» in «da smistare» (decisioni del Dott. Bizzarri del 17/11/2026, 11:07–11:21; progetto claude/progetto_387_lavoro_caricamento_veloce.md).
// Si scrive con lo stesso metodo della 386 (cartellaBanche.js): copia provvisoria, rilettura con l'impronta, nome vero, mai sovrascrivere.
import { cartella, esiste, fileDiCartella, scriviVerificato } from "./cartellaBanche";

export const BUSTE_DA_SMISTARE = "1. BUSTE PAGA E RIEPILOGHI DA SMISTARE";
export const PAGAMENTI_DA_SMISTARE = "2. PAGAMENTI STIPENDI DA SMISTARE";
export const VECCHIE = { [BUSTE_DA_SMISTARE]: "1.BUSTE PAGA DA CARICARE", [PAGAMENTI_DA_SMISTARE]: "2. PAGAMENTI STIPENDI DA CARICARE" };
export const BUSTE_CARICATE = "3.BUSTE PAGA CARICATE";
export const PAGAMENTI_CARICATI = "4 PAGAMENTI STIPENDI CARICATI";
export const RIEPILOGHI = "11. RIEPILOGO PAGHE E CONTRIBUTI";
const MESI = ["", "GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE"];
const mm = m => String(m).padStart(2, "0");

// La cartella scelta deve essere LAVORO: si riconosce dalle sue cartelle 3, 4 e 11 (nella cartella LAVORO non c'è un file di riconoscimento)
export async function controllaCartellaLavoro(radice) {
  const nome = String(radice?.name || "").trim().toUpperCase();
  if (nome !== "LAVORO") {
    if (/BUSTE PAGA|PAGAMENTI STIPENDI|RIEPILOGO PAGHE|^ANNO \d{4}$/.test(nome))
      return { ok: false, problema: `Hai scelto «${radice.name}», che sta dentro LAVORO. Premi di nuovo il pulsante e scegli la cartella sopra, LAVORO: un clic su LAVORO, senza entrarci, poi «Seleziona cartella».` };
    return { ok: false, problema: `La cartella scelta si chiama «${radice.name}»: si sceglie la cartella LAVORO (Z: → SOCIETA → SOCIETA' AGRICOLA PODERE VERDE A R.L → 00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE → LAVORO).` };
  }
  const mancano = [];
  for (const c of [BUSTE_CARICATE, PAGAMENTI_CARICATI, RIEPILOGHI]) if (!(await esiste(radice, c))) mancano.push(c);
  if (mancano.length) return { ok: false, problema: `Nella cartella LAVORO scelta mancano le cartelle ${mancano.map(c => `«${c}»`).join(", ")}: non è la cartella LAVORO di Podere Verde. Il programma non scrive niente.` };
  return { ok: true };
}

// Dove va ogni file (percorsi dentro LAVORO)
export const posizioneBuste = ({ anno, mese, aggiuntiva }) =>
  `${BUSTE_CARICATE}\\ANNO ${anno}\\${aggiuntiva ? `${aggiuntiva.toUpperCase()}.pdf` : `${mm(mese)}.${anno}_BUSTE PAGA.pdf`}`;
export const posizioneRiepilogo = ({ anno, mese }) => `${RIEPILOGHI}\\ANNO ${anno}\\${mm(mese)}.${anno}_RIEPILOGO PAGHE E CONTRIBUTI.pdf`;
// pagamento: cartella del mese della busta pagata; tredicesima e quattordicesima in «MM.AAAA+TREDICESIMA» (come «07.2025+QUATTORDICESIMA»)
export function posizionePagamento({ anno, mese, tipo, cognome_nome, motivo, estensione = ".pdf" }) {
  const agg = tipo === "tredicesima" || tipo === "quattordicesima";
  const dir = `${PAGAMENTI_CARICATI}\\ANNO ${anno}\\${mm(mese)}.${anno}${agg ? "+" + tipo.toUpperCase() : ""}`;
  const davanti = /^acconto/i.test(motivo || "") ? "ACCONTO " : /^più bonifici/i.test(motivo || "") ? "DIFFERENZA SU " : /^anticipo/i.test(motivo || "") ? "ANTICIPO " : "";
  const cosa = agg ? `${tipo.toUpperCase()} ${anno}` : `STIPENDIO ${MESI[mese]} ${anno}`;
  const nome = String(cognome_nome).replace(/[\x00-\x1f"~*/:<>?\\|]/g, " ").replace(/\s+/g, " ").trim();
  return `${dir}\\PAG. PODERE - ${nome} ${davanti}${cosa}${String(estensione).toLowerCase()}`;
}

// Prima apertura: «1.BUSTE PAGA DA CARICARE» → «1. BUSTE PAGA E RIEPILOGHI DA SMISTARE», «2. PAGAMENTI STIPENDI DA CARICARE» →
// «2. PAGAMENTI STIPENDI DA SMISTARE». Si rinomina se il browser lo permette, altrimenti si spostano i file uno per uno con copia
// verificata; la vecchia si toglie solo vuota. Un file con lo stesso nome ma diverso nella nuova non si tocca: resta nella vecchia.
async function sotto(radice, nome) { const v = await esiste(radice, nome); if (!v) return null; try { return await radice.getDirectoryHandle(v); } catch { return null; } }
export async function sistemaCartelleDaSmistare(radice) {
  const esiti = [];
  for (const [nuovoNome, vecchioNome] of Object.entries(VECCHIE)) {
    const vecchia = await sotto(radice, vecchioNome), nuova = await sotto(radice, nuovoNome);
    if (!vecchia) { if (!nuova) await cartella(radice, nuovoNome, true); esiti.push({ cartella: nuovoNome, esito: nuova ? "già a posto" : "creata", rimasti: [] }); continue; }
    if (!nuova && typeof vecchia.move === "function") {
      try { await vecchia.move(nuovoNome); if (await sotto(radice, nuovoNome)) { esiti.push({ cartella: nuovoNome, esito: `rinominata (prima «${vecchioNome}»)`, rimasti: [] }); continue; } } catch { /* si spostano i file */ }
    }
    const rimasti = [], spostati = [];
    for (const f of await fileDiCartella(vecchia)) {
      try {
        const byte = new Uint8Array(await (await f.handle.getFile()).arrayBuffer());
        const w = await scriviVerificato(radice, `${nuovoNome}\\${f.nome}`, byte);
        if (w.esito === "Scritto" && !w.percorso.endsWith(`\\${f.nome}`)) {
          try { await (await cartella(radice, nuovoNome)).removeEntry(w.percorso.split("\\").pop()); } catch { /* resta: si vede */ }
          rimasti.push(`${f.nome} (nella cartella nuova c'è un file diverso con lo stesso nome)`); continue;
        }
        await vecchia.removeEntry(f.nome); spostati.push(f.nome);
      } catch (e) { rimasti.push(`${f.nome} (${e.message})`); }
    }
    let vuota = true; for await (const _ of vecchia.entries()) { vuota = false; break; }
    if (vuota) { try { await radice.removeEntry(vecchia.name); } catch { /* resta vuota: non fa danno */ } }
    else for await (const [n, h] of vecchia.entries()) if (h.kind !== "file" && !rimasti.some(r => r.startsWith(n))) rimasti.push(`${n} (cartella)`);
    esiti.push({ cartella: nuovoNome, esito: `file spostati da «${vecchioNome}»: ${spostati.length}`, rimasti });
  }
  return esiti;
}
