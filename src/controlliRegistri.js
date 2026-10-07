// Controlli dei registri dell'app Podere Verde e della Contabilità Industriale (versione 232).
// Legge i dati, trova le anomalie, le scrive nel quaderno «ci_anomalie» e annota il controllo
// nel diario «ci_controlli_eseguiti». Non modifica MAI i dati controllati: le correzioni si
// fanno solo dalla pagina «Registro Controlli», una alla volta, con conferma.
import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";

export const STATI_ANOMALIA = {
  aperta: "Da decidere",
  decisa: "Decisa",
  ignorata: "Lasciata com'è",
  risolta: "Risolta (il dato è stato corretto)",
};

// Mesi minimi tra due parti della stessa madre (gli stessi del blocco nel database)
function mesiMinimi(specie) {
  const s = (specie || "").toLowerCase();
  if (s.startsWith("bovin")) return 9;
  if (s.startsWith("ovin")) return 5;
  return 4;
}
function aggiungiMesi(dataTesto, mesi) {
  const d = new Date(`${dataTesto}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + mesi);
  return d.toISOString().slice(0, 10);
}
// true se le due date sono più vicine di «mesi» mesi (stesso criterio del blocco nel database)
function troppoVicine(d1, d2, mesi) {
  return d2 > aggiungiMesi(d1, -mesi) && d2 < aggiungiMesi(d1, mesi);
}
function giorniTra(d1, d2) {
  return Math.round(Math.abs(new Date(d1) - new Date(d2)) / 86400000);
}
export function dataIt(d) {
  if (!d) return "—";
  const [a, m, g] = String(d).slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}
const STATI_USCITI = ["deceduto", "macellato", "venduto", "uscito", "trasferito"];

async function leggi(nome, colonne, filtro) {
  const { data, error } = await fetchAllPages((da, a) => {
    let q = supabase.from(nome).select(colonne);
    if (filtro) q = filtro(q);
    return q.order("id").range(da, a);
  });
  if (error) throw new Error(`Lettura di ${nome}: ${error.message}`);
  return data || [];
}

// ── I controlli ──────────────────────────────────────────────────────────────────────────
// Ogni anomalia: { codice, area, tabella, riga_id, titolo, descrizione }
export async function trovaAnomalie() {
  const [animali, lotti, eventi, unita, cespiti, report, costiUnita, mandria] = await Promise.all([
    leggi("animali", "id,bdn,nome,specie,sesso,provenienza,stato,nascita,data_ingresso,data_uscita,prezzo_acquisto,numero_fattura,riproduttore"),
    leggi("lotti_suini", "id,codice,codice_lotto,madre_id,padre_id,data_parto,nati_vivi,nati_morti,tipo_provenienza,prezzo_acquisto,numero_fattura,specie"),
    leggi("eventi_riproduttivi", "id,animale_id,tipo_evento,data_evento,padre_id,nati_vivi,nati_morti"),
    leggi("suini_lotto", "id,lotto_id,nr"),
    leggi("ci_cespiti", "id,descrizione,costo_acquisto,specie,attivo"),
    leggi("ci_report_acquisto_animali", "id,fonte,animale_id,lotto_id,stato,importo"),
    leggi("ci_costo_animale_annuale", "id,lotto_id,unita_nr,anno", q => q.not("lotto_id", "is", null)),
    leggi("ci_costo_nascita_mandria", "id,anno"),
  ]);
  const perId = new Map(animali.map(a => [a.id, a]));
  const nomeA = id => { const a = perId.get(id); return a ? (a.bdn || a.nome || `capo ${a.id}`) : `capo ${id}`; };
  const codL = l => l.codice_lotto || l.codice || `lotto ${l.id}`;
  const trovate = [];
  const nonEseguibili = [];
  const add = (codice, area, tabella, riga_id, titolo, descrizione) =>
    trovate.push({ codice, area, tabella, riga_id: String(riga_id ?? ""), titolo, descrizione });

  const lottiNati = lotti.filter(l => l.tipo_provenienza === "nato");
  const parti = eventi.filter(e => (e.tipo_evento || "").toLowerCase().startsWith("parto") && e.animale_id && e.data_evento);

  // L1 – madre non presente alla data del parto
  for (const l of lottiNati) {
    const m = perId.get(l.madre_id);
    if (!m || !l.data_parto) continue;
    const entrata = m.data_ingresso || m.nascita;
    if ((entrata && entrata > l.data_parto) || (m.data_uscita && m.data_uscita < l.data_parto))
      add("L1", "Lotti suini", "lotti_suini", l.id, `Lotto ${codL(l)}: la madre ${nomeA(l.madre_id)} non era in azienda il giorno del parto`,
        `Parto ${dataIt(l.data_parto)}; madre in azienda dal ${dataIt(entrata)}${m.data_uscita ? ` al ${dataIt(m.data_uscita)}` : ""}.`);
  }
  // L2 – due lotti nati della stessa madre troppo vicini
  const lottiPerMadre = new Map();
  lottiNati.filter(l => l.madre_id && l.data_parto).forEach(l => {
    if (!lottiPerMadre.has(l.madre_id)) lottiPerMadre.set(l.madre_id, []);
    lottiPerMadre.get(l.madre_id).push(l);
  });
  for (const [madre, ls] of lottiPerMadre) {
    const mesi = mesiMinimi(perId.get(madre)?.specie);
    ls.sort((a, b) => a.data_parto.localeCompare(b.data_parto));
    for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++)
      if (troppoVicine(ls[i].data_parto, ls[j].data_parto, mesi))
        add("L2", "Lotti suini", "lotti_suini", `${ls[i].id}-${ls[j].id}`, `${nomeA(madre)}: due lotti a meno di ${mesi} mesi`,
          `Lotto ${codL(ls[i])} del ${dataIt(ls[i].data_parto)} e lotto ${codL(ls[j])} del ${dataIt(ls[j].data_parto)} (${giorniTra(ls[i].data_parto, ls[j].data_parto)} giorni).`);
  }
  // L3 / L4 – lotto nato senza padre o senza madre
  for (const l of lottiNati) {
    if (!l.padre_id) add("L3", "Lotti suini", "lotti_suini", l.id, `Lotto ${codL(l)}: padre non indicato`,
      `Madre ${l.madre_id ? nomeA(l.madre_id) : "—"}, parto ${dataIt(l.data_parto)}. Non cambia i costi: serve per la genealogia.`);
    if (!l.madre_id) add("L4", "Lotti suini", "lotti_suini", l.id, `Lotto ${codL(l)}: madre non indicata`, `Parto ${dataIt(l.data_parto)}.`);
  }
  // A1 / A2 – capi acquistati senza prezzo o senza fattura
  for (const a of animali.filter(a => a.provenienza === "Acquistato")) {
    if (!(parseFloat(a.prezzo_acquisto) > 0)) add("A1", "Animali", "animali", a.id, `${nomeA(a.id)}: acquistato ma senza prezzo d'acquisto`,
      `${a.specie || ""}, ingresso ${dataIt(a.data_ingresso)}, stato ${a.stato || "—"}. Senza prezzo il capo parte da costo zero.`);
    if (!(a.numero_fattura || "").trim()) add("A2", "Animali", "animali", a.id, `${nomeA(a.id)}: acquistato ma senza numero di fattura`,
      `${a.specie || ""}, ingresso ${dataIt(a.data_ingresso)}. Si può collegare dalla pagina «Abbinamenti Fatture Acquisto».`);
  }
  // A3 / A4 – date e stato di uscita incoerenti
  for (const a of animali) {
    const inizio = a.data_ingresso || a.nascita;
    if (a.data_uscita && ((inizio && a.data_uscita < inizio) || (a.nascita && a.data_uscita < a.nascita)))
      add("A3", "Animali", "animali", a.id, `${nomeA(a.id)}: uscita prima della nascita o dell'ingresso`,
        `Nascita ${dataIt(a.nascita)}, ingresso ${dataIt(a.data_ingresso)}, uscita ${dataIt(a.data_uscita)}.`);
    if (STATI_USCITI.includes(a.stato) && !a.data_uscita)
      add("A4", "Animali", "animali", a.id, `${nomeA(a.id)}: stato «${a.stato}» ma senza data di uscita`, "Senza data di uscita il capo resta a carico per sempre nei costi.");
    if (a.stato === "attivo" && a.data_uscita)
      add("A4", "Animali", "animali", a.id, `${nomeA(a.id)}: stato «attivo» ma con data di uscita ${dataIt(a.data_uscita)}`, "Va corretto lo stato o la data.");
  }
  // P – parti (servono i permessi di lettura: senza utente collegato gli eventi risultano vuoti)
  if (parti.length === 0 && lottiNati.length > 0) {
    nonEseguibili.push("Parti: nessun evento di parto leggibile (accesso senza utente collegato)");
  } else {
    // P1 – parto di scrofa senza lotto
    for (const e of parti) {
      const m = perId.get(e.animale_id);
      if (!m || !(m.specie || "").toLowerCase().startsWith("suin")) continue;
      const ok = lottiNati.some(l => l.madre_id === e.animale_id && l.data_parto && giorniTra(l.data_parto, e.data_evento) <= 3);
      if (!ok) add("P1", "Parti", "eventi_riproduttivi", e.id, `${nomeA(e.animale_id)}: parto del ${dataIt(e.data_evento)} senza lotto`,
        `Evento ${e.id}: ${e.nati_vivi ?? "?"} vivi, ${e.nati_morti ?? "?"} morti, padre ${e.padre_id ? nomeA(e.padre_id) : "non indicato"}. Senza lotto i suinetti non hanno costi.`);
    }
    // P2 – lotto nato senza evento di parto
    for (const l of lottiNati) {
      if (!l.madre_id || !l.data_parto) continue;
      const ok = parti.some(e => e.animale_id === l.madre_id && giorniTra(e.data_evento, l.data_parto) <= 3);
      if (!ok) add("P2", "Parti", "lotti_suini", l.id, `Lotto ${codL(l)}: manca l'evento di parto della madre ${nomeA(l.madre_id)}`,
        `Parto del ${dataIt(l.data_parto)}, ${l.nati_vivi ?? "?"} vivi e ${l.nati_morti ?? "?"} morti. Non cambia i costi.`);
    }
    // P3 – due parti della stessa madre troppo vicini
    const partiPerMadre = new Map();
    parti.forEach(e => { if (!partiPerMadre.has(e.animale_id)) partiPerMadre.set(e.animale_id, []); partiPerMadre.get(e.animale_id).push(e); });
    for (const [madre, es] of partiPerMadre) {
      const mesi = mesiMinimi(perId.get(madre)?.specie);
      es.sort((a, b) => a.data_evento.localeCompare(b.data_evento));
      for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++)
        if (troppoVicine(es[i].data_evento, es[j].data_evento, mesi))
          add("P3", "Parti", "eventi_riproduttivi", `${es[i].id}-${es[j].id}`, `${nomeA(madre)}: due parti a meno di ${mesi} mesi`,
            `Evento ${es[i].id} del ${dataIt(es[i].data_evento)} ed evento ${es[j].id} del ${dataIt(es[j].data_evento)} (${giorniTra(es[i].data_evento, es[j].data_evento)} giorni).`);
    }
  }
  // C1 – cespiti attivi senza specie (esclusi dai costi)
  for (const c of cespiti.filter(c => c.attivo !== false && (!c.specie || c.specie.length === 0)))
    add("C1", "Cespiti", "ci_cespiti", c.id, `Cespite «${c.descrizione}» senza imputazione`,
      `Costo ${Number(c.costo_acquisto || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })} €. Senza imputazione resta fuori dai costi degli animali.`);
  // C2 – righe di costo di suinetti che non esistono più
  const unitaEsistenti = new Set(unita.map(u => `${u.lotto_id}|${u.nr}`));
  const orfanePerLotto = new Map();
  costiUnita.filter(c => c.unita_nr != null && !unitaEsistenti.has(`${c.lotto_id}|${c.unita_nr}`))
    .forEach(c => orfanePerLotto.set(c.lotto_id, (orfanePerLotto.get(c.lotto_id) || 0) + 1));
  const lottoPerId = new Map(lotti.map(l => [l.id, l]));
  for (const [lottoId, n] of orfanePerLotto)
    add("C2", "Costi", "lotti_suini", lottoId, `Lotto ${lottoPerId.get(lottoId) ? codL(lottoPerId.get(lottoId)) : lottoId}: ${n} righe di costo di suinetti che non esistono più`,
      "Le pulisce il ricalcolo dei costi.");
  // C3 – riepilogo della mandria vuoto
  if (mandria.length === 0 && costiUnita.length > 0)
    add("C3", "Costi", "ci_costo_nascita_mandria", "", "Il riepilogo del costo della mandria è vuoto",
      "Si riempie con l'elaborazione della pagina «Report Riproduttori».");
  // F1 / F2 – Report Acquisto animali
  const nonAbbinate = report.filter(r => !r.animale_id && !r.lotto_id && r.fonte !== "TRASPORTO_INGRESSO" && !["RIFIUTATA", "NON_ABBINABILE"].includes(r.stato));
  if (nonAbbinate.length)
    add("F1", "Fatture acquisto", "ci_report_acquisto_animali", "", `${nonAbbinate.length} righe di fatture d'acquisto non abbinate a un capo o a un lotto`,
      `Importo ${nonAbbinate.reduce((s, r) => s + (parseFloat(r.importo) || 0), 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })} €. Si abbinano dalla pagina «Abbinamenti Fatture Acquisto».`);
  const daConfermare = report.filter(r => (r.animale_id || r.lotto_id) && r.stato !== "ABBINATO");
  if (daConfermare.length)
    add("F2", "Fatture acquisto", "ci_report_acquisto_animali", "", `${daConfermare.length} righe già collegate a un capo ma mai confermate`,
      "Si confermano dalla pagina «Abbinamenti Fatture Acquisto», sezione «Già collegate».");

  return { trovate, nonEseguibili, controlliEseguiti: 16 - nonEseguibili.length * 3 };
}

// ── Scrittura nel quaderno e nel diario ─────────────────────────────────────────────────
let controlloInCorso = null; // un solo controllo alla volta in questa finestra
export function eseguiControlli(origine = "apertura del programma") {
  if (!controlloInCorso) controlloInCorso = eseguiControlliDavvero(origine).finally(() => { controlloInCorso = null; });
  return controlloInCorso;
}
async function eseguiControlliDavvero(origine) {
  const { trovate, nonEseguibili, controlliEseguiti } = await trovaAnomalie();
  const { data: esistenti, error } = await fetchAllPages((da, a) => supabase.from("ci_anomalie").select("*").order("id").range(da, a));
  if (error) throw new Error(`Lettura del quaderno delle anomalie: ${error.message}. Il database è stato aggiornato con le strutture della versione 232?`);
  const chiave = x => `${x.codice}|${x.tabella}|${x.riga_id}`;
  const perChiave = new Map((esistenti || []).map(x => [chiave(x), x]));
  const adesso = new Date().toISOString();
  const trovateChiavi = new Set();
  let nuove = 0, risolte = 0;
  const daInserire = [];
  for (const t of trovate) {
    const k = chiave(t);
    if (trovateChiavi.has(k)) continue; // la stessa anomalia trovata due volte (es. due motivi A4): basta una riga
    trovateChiavi.add(k);
    const x = perChiave.get(k);
    if (!x) { daInserire.push({ ...t, stato: "aperta", prima_rilevata_at: adesso, ultima_rilevata_at: adesso }); nuove++; continue; }
    const agg = { titolo: t.titolo, descrizione: t.descrizione, area: t.area, ultima_rilevata_at: adesso };
    if (x.stato === "risolta") { agg.stato = "aperta"; agg.risolta_at = null; nuove++; } // è ricomparsa
    if (x.titolo !== t.titolo || x.descrizione !== t.descrizione || agg.stato) {
      const { error: eU } = await supabase.from("ci_anomalie").update(agg).eq("id", x.id);
      if (eU) throw new Error(eU.message);
    }
  }
  for (let i = 0; i < daInserire.length; i += 200) {
    // ignoreDuplicates: se due controlli partono insieme (due finestre aperte) non nascono doppioni
    const { error: eI } = await supabase.from("ci_anomalie").upsert(daInserire.slice(i, i + 200), { onConflict: "codice,tabella,riga_id", ignoreDuplicates: true });
    if (eI) throw new Error(eI.message);
  }
  // Non più trovate → risolte (solo se il controllo che le trova è stato eseguito davvero)
  const codiciNonEseguiti = nonEseguibili.some(n => n.startsWith("Parti")) ? ["P1", "P2", "P3"] : [];
  for (const x of esistenti || []) {
    if (x.stato === "risolta" || trovateChiavi.has(chiave(x)) || codiciNonEseguiti.includes(x.codice)) continue;
    const { error: eR } = await supabase.from("ci_anomalie").update({ stato: "risolta", risolta_at: adesso }).eq("id", x.id).neq("stato", "risolta");
    if (eR) throw new Error(eR.message);
    risolte++;
  }
  const { count } = await supabase.from("ci_anomalie").select("id", { count: "exact", head: true }).eq("stato", "aperta");
  await supabase.from("ci_controlli_eseguiti").insert([{
    origine, controlli_eseguiti: controlliEseguiti, controlli_non_eseguibili: nonEseguibili.join("; ") || null,
    anomalie_trovate: trovateChiavi.size, nuove, risolte, aperte: count || 0,
  }]);
  return { trovate: trovateChiavi.size, nuove, risolte, aperte: count || 0, nonEseguibili };
}

export async function contaAnomalieAperte() {
  const { count, error } = await supabase.from("ci_anomalie").select("id", { count: "exact", head: true }).eq("stato", "aperta");
  if (error) return null;
  return count || 0;
}

// Da chiamare prima di un ricalcolo dei costi: avvisa se ci sono anomalie aperte.
export async function confermaRicalcoloConAnomalie() {
  const n = await contaAnomalieAperte();
  if (!n) return true;
  return window.confirm(`⚠️ Ci sono ${n} anomalie ancora da decidere nel «Registro Controlli».\n\nAlcune possono cambiare i costi (capi senza prezzo, date di uscita, suinetti mancanti).\n\nVuoi ricalcolare lo stesso?`);
}

// Chi ha toccato per ultimo un record (dal registro delle modifiche)
export async function personePerRecord() {
  const { data, error } = await fetchAllPages((da, a) => supabase.from("registro_modifiche_contabilita")
    .select("quando,utente_nome,provenienza,tabella,riga_id,azione").order("quando", { ascending: false }).range(da, a));
  if (error) return new Map();
  const mappa = new Map();
  for (const r of data || []) {
    const k = `${r.tabella}|${r.riga_id}`;
    if (!mappa.has(k)) mappa.set(k, r); // la prima è la più recente
  }
  return mappa;
}
