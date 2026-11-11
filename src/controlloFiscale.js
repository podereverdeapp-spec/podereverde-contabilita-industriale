// Versione 363 (11/11/2026): «Controlla FISCALE» — guarda la cartella del cloud FISCALE\QUIETANZE F24, in SOLA LETTURA,
// e scrive nel programma quali PDF non sono ancora caricati. Non sposta, non copia, non rinomina e non cancella niente nel cloud.
// L'impronta (MD5) si calcola solo per i file che servono (non «Storico») e solo se il file è cambiato dall'ultimo controllo.
import { supabase } from "./supabase";
import { md5 } from "./md5";
import { fetchAllPages } from "./parsingUtils";
import { esitoFile, giaNelProgramma, dataDelFile, eDaControllare, DATA_PARTENZA } from "./calcoloAvvisiF24";

export const NOME_CARTELLA = "QUIETANZE F24";
export const ID_FINESTRA = "fiscale-quietanze-f24";

// la cartella scelta deve essere QUIETANZE F24 (o FISCALE, che la contiene); altrimenti ci si ferma
export async function cartellaQuietanze(h) {
  const n = String(h?.name || "").trim().toUpperCase();
  if (n === NOME_CARTELLA) return { h };
  if (n === "FISCALE") { try { return { h: await h.getDirectoryHandle(NOME_CARTELLA) }; } catch { /* non c'è */ } }
  return { problema: `È stata scelta la cartella «${h?.name}». Bisogna scegliere «${NOME_CARTELLA}», dentro SOCIETA' AGRICOLA PODERE VERDE A R.L → FISCALE.` };
}

async function elencoFile(dir, percorso = "", profondita = 10, out = []) {
  for await (const [nome, h] of dir.entries()) {
    if (nome.startsWith("~$") || /^(desktop\.ini|thumbs\.db)$/i.test(nome)) continue;
    const p = percorso ? `${percorso}\\${nome}` : nome;
    if (h.kind === "directory") { if (profondita > 0) await elencoFile(h, p, profondita - 1, out); }
    else if (eDaControllare(nome)) out.push({ percorso: p, handle: h });
  }
  return out;
}

// esegue il controllo; avanzamento(testo) per mostrare a che punto è. Ritorna il riepilogo.
export async function controllaFiscale(dir, chi, avanzamento = () => {}) {
  avanzamento("Leggo l'elenco dei file…");
  const file = await elencoFile(dir);
  avanzamento(`Trovati ${file.length} PDF. Leggo che cosa c'è già nel programma…`);
  const q = (tab, sel) => fetchAllPages((a, b) => supabase.from(tab).select(sel).order("id").range(a, b));
  const [f, d, a] = await Promise.all([
    q("ci_f24", "id, codice_delega, oggetto, md5_pdf, md5_quietanza, md5_contabile, nome_file_ricevuto, nome_file_quietanza, nome_file_contabile"),
    q("ci_f24_documenti", "id, md5, md5_file_ricevuto, nome_file_ricevuto"),
    q("ci_f24_file_archivio", "id, md5"),
  ]);
  const vecchie = await fetchAllPages((x, y) => supabase.from("ci_f24_fiscale_file").select("percorso, dimensione, modificato_il, md5, esito, motivo").order("percorso").range(x, y));
  for (const r of [f, d, a, vecchie]) if (r.error) throw new Error(r.error.message);
  const gia = giaNelProgramma({ f24: f.data || [], documenti: d.data || [], fileArchivio: a.data || [] });
  const prima = new Map((vecchie.data || []).map(r => [r.percorso.toUpperCase(), r]));
  const { data: c, error: e1 } = await supabase.from("ci_f24_fiscale_controlli").insert({ eseguito_da: chi, file_trovati: file.length, da_caricare: 0, storico: 0, note: "in corso" }).select("id").single();
  if (e1) throw new Error(e1.message);
  const righe = []; let letti = 0, daCaricare = 0, storico = 0, illeggibili = 0;
  try {
  for (const x of file) {
    const v = prima.get(x.percorso.toUpperCase());
    let o;
    try { o = await x.handle.getFile(); }
    catch (e) {
      // un file che non si legge (per esempio non scaricato dal cloud) non ferma il controllo; l'esito segue le stesse regole
      // («Non da caricare» già deciso resta, i file vecchi restano «Storico»), altrimenti resta «Da caricare» con il motivo
      illeggibili++;
      const es = esitoFile({ percorso: x.percorso, md5: v?.md5 || null, illeggibile: !v?.md5, motivoIlleggibile: `il file non si legge (${String(e?.message || e).slice(0, 80)}): forse non è scaricato dal cloud` }, gia, v);
      righe.push({ percorso: x.percorso, dimensione: v ? Number(v.dimensione) || 0 : 0, modificato_il: v?.modificato_il || null, md5: v?.md5 || null, esito: es.esito, motivo: es.motivo, controllo_id: c.id, visto_da: chi });
      continue;
    }
    const quando = Number(o.lastModified), modificato = Number.isFinite(quando) && quando > 0 ? new Date(quando).toISOString() : null;
    const data = dataDelFile(x.percorso);
    const primaDellaPartenza = data && data < DATA_PARTENZA && !/RAVV/i.test(x.percorso);
    let impronta = v && Number(v.dimensione) === o.size && modificato && v.modificato_il && new Date(v.modificato_il).getTime() === quando ? v.md5 : null;
    if (!impronta && !primaDellaPartenza) {
      try { impronta = md5(new Uint8Array(await o.arrayBuffer())); }
      catch (e) { illeggibili++; const es = esitoFile({ percorso: x.percorso, md5: null, illeggibile: true, motivoIlleggibile: `il file non si legge (${String(e?.message || e).slice(0, 80)}): forse non è scaricato dal cloud` }, gia, v);
        righe.push({ percorso: x.percorso, dimensione: o.size, modificato_il: null, md5: null, esito: es.esito, motivo: es.motivo, controllo_id: c.id, visto_da: chi }); continue; }
      letti++; if (letti % 10 === 0) avanzamento(`Controllo i file: ${letti} letti…`); }
    const es = esitoFile({ percorso: x.percorso, md5: impronta, dimensione: o.size }, gia, v);
    righe.push({ percorso: x.percorso, dimensione: o.size, modificato_il: modificato, md5: impronta, esito: es.esito, motivo: es.motivo, controllo_id: c.id, visto_da: chi });
  }
  avanzamento("Scrivo l'esito nel programma…");
  for (let i = 0; i < righe.length; i += 200) {
    // «visto il» lo mette il database (ora del server) al momento della scrittura: niente orologi dei computer
    const { error } = await supabase.from("ci_f24_fiscale_file").upsert(righe.slice(i, i + 200), { onConflict: "percorso" });
    if (error) throw new Error(error.message);
  }
  daCaricare = righe.filter(r => r.esito === "Da caricare").length; storico = righe.filter(r => r.esito === "Storico").length;
  const { error: e2 } = await supabase.from("ci_f24_fiscale_controlli").update({ da_caricare: daCaricare, storico, note: `finito: ${letti} file letti per l'impronta${illeggibili ? `, ${illeggibili} non leggibili` : ""}` }).eq("id", c.id);
  if (e2) throw new Error(e2.message);
  } catch (x) {
    // controllo interrotto: si segna; l'avviso usa l'ultimo controllo finito e le righe viste da quel momento in poi
    await supabase.from("ci_f24_fiscale_controlli").update({ note: `interrotto: ${String(x?.message || x).slice(0, 200)}` }).eq("id", c.id);
    window.dispatchEvent(new Event("avvisi-f24-cambiati"));
    throw x;
  }
  window.dispatchEvent(new Event("avvisi-f24-cambiati"));
  return { trovati: file.length, daCaricare, storico, letti, illeggibili, controllo: c.id };
}

// «Non è da caricare» (una lettera, un doppione già controllato…): resta finché il file non cambia
export async function segnaNonDaCaricare(percorso, motivo, chi) {
  const { data, error } = await supabase.from("ci_f24_fiscale_file").update({ esito: "Non da caricare", motivo: `${motivo} (segnato da ${chi})` }).eq("percorso", percorso).select("percorso");
  if (error) throw new Error(error.message);
  if (!(data || []).length) throw new Error("file non trovato nell'ultimo controllo");
  window.dispatchEvent(new Event("avvisi-f24-cambiati"));
}
