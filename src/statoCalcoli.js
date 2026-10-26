// Versione 236 — «Il calcolo resta salvato, è il programma che avvisa quando occorre ricalcolare».
// Per ogni anno si guarda quando è stato salvato l'ultimo calcolo del Report Costi (tabella
// ci_tasso_uba_annuale, campo created_at) e si contano, nel registro delle modifiche, i cambiamenti
// fatti DOPO su ciò che entra nei costi di quell'anno. Nessuna scrittura nel database.
import { supabase } from "./supabase";
import { fetchAllPages, leggiInBlocchi } from "./parsingUtils";

// Il registro delle modifiche esiste dal 07/10/2026 alle 14:37 (ora italiana): per i calcoli salvati
// prima non si può sapere che cosa è cambiato dopo.
export const INIZIO_REGISTRO = "2026-10-07T12:37:00Z";

// Tabelle che entrano nei costi e nome da mostrare
const TABELLE = {
  ci_fatture: "fatture", ci_articoli_fattura: "righe di fattura", ci_costi_diretti: "costi diretti",
  ci_cespiti: "cespiti", ci_cespiti_ammortamento: "quote di ammortamento", ci_parametri: "parametri",
  ci_ripartizione_lavoro: "ripartizione del lavoro", animali: "animali", lotti_suini: "lotti suini",
  suini_lotto: "suinetti dei lotti", prezzi_riforma: "prezzi di riforma", pesi_standard_specie: "pesi standard",
};
// Campi scritti dal programma stesso nelle schede animali (costo di nascita): non sono variazioni
const CAMPI_SCRITTI_DAL_PROGRAMMA = ["costo_iniziale", "tipo_costo_iniziale"];

const ms = t => new Date(t).getTime(); // confronto tra date fatto sui numeri, non sul testo
const annoDi = d => (d ? parseInt(String(d).slice(0, 4)) : null);

export async function statoCalcoli() {
  const { data: tassi, error } = await fetchAllPages((da, a) => supabase.from("ci_tasso_uba_annuale").select("id, anno, created_at").order("id").range(da, a));
  if (error) throw new Error(error.message);
  const salvati = new Map();
  (tassi || []).forEach(t => { if (!salvati.has(t.anno) || ms(t.created_at) > ms(salvati.get(t.anno))) salvati.set(t.anno, t.created_at); });
  const { data: mandria } = await fetchAllPages((da, a) => supabase.from("ci_costo_nascita_mandria").select("id, anno, created_at").order("id").range(da, a));
  const riproduttoriAt = (mandria || []).reduce((m, x) => (!m || ms(x.created_at) > ms(m) ? x.created_at : m), null);

  const anni = [...salvati.keys()].sort();
  const piuVecchio = anni.length ? [...salvati.values()].sort((a, b) => ms(a) - ms(b))[0] : null;
  let modifiche = [];
  if (piuVecchio) {
    const da = ms(piuVecchio) > ms(INIZIO_REGISTRO) ? new Date(piuVecchio).toISOString() : INIZIO_REGISTRO;
    const { data: reg } = await fetchAllPages((a, b) => supabase.from("registro_modifiche_contabilita")
      .select("quando,tabella,riga_id,azione,prima,dopo").in("tabella", Object.keys(TABELLE)).gt("quando", da).order("quando").range(a, b));
    modifiche = (reg || []).filter(m => !(m.tabella === "animali" && m.azione === "modifica"
      && Object.keys(m.dopo || {}).every(k => CAMPI_SCRITTI_DAL_PROGRAMMA.includes(k))));
  }

  // Anno a cui si riferisce ogni modifica (null = può riguardare tutti gli anni)
  const idFatture = new Set(), idRighe = new Set(), idCosti = new Set(), idQuote = new Set(), idAnimali = new Set();
  modifiche.forEach(m => {
    if (m.tabella === "animali") idAnimali.add(Number(m.riga_id));
    if (m.tabella === "ci_fatture") idFatture.add(Number(m.riga_id));
    if (m.tabella === "ci_articoli_fattura") idRighe.add(Number(m.riga_id));
    if (m.tabella === "ci_costi_diretti") idCosti.add(Number(m.riga_id));
    if (m.tabella === "ci_cespiti_ammortamento") idQuote.add(Number(m.riga_id));
  });
  const leggiMappa = async (tabella, colonne, ids) => {
    if (!ids.size) return new Map();
    // a blocchi di 200: dopo un ricalcolo gli elenchi possono essere di migliaia di righe (versione 236)
    const { data } = await leggiInBlocchi([...ids], (blocco, da, a) => supabase.from(tabella).select(colonne).in("id", blocco).order("id").range(da, a));
    return new Map((data || []).map(x => [x.id, x]));
  };
  const righe = await leggiMappa("ci_articoli_fattura", "id, fattura_id", idRighe);
  righe.forEach(r => idFatture.add(r.fattura_id));
  modifiche.forEach(m => { const fid = (m.dopo || m.prima || {}).fattura_id; if (m.tabella === "ci_articoli_fattura" && fid) idFatture.add(Number(fid)); });
  const fatture = await leggiMappa("ci_fatture", "id, data, tipo", idFatture);
  const costi = await leggiMappa("ci_costi_diretti", "id, data", idCosti);
  const quote = await leggiMappa("ci_cespiti_ammortamento", "id, anno", idQuote);
  const schede = await leggiMappa("animali", "id, nascita, data_ingresso, data_uscita", idAnimali);

  // Versione 308 (Report Costi rivisto con il Dott. Bizzarri il 26/10/2026): non tutto ciò che cambia entra nei costi.
  // - Le fatture di VENDITA non entrano nel Report Costi: contano solo per il Report Riproduttori (ricavo dei capi venduti).
  // - I parametri non entrano nel Report Costi: i prezzi di riforma contano solo per il Report Riproduttori; gli altri
  //   (indirizzi mail, ecc.) per nessuno dei due.
  // - Un animale cambia i costi solo degli anni in cui era presente (dalla nascita o dall'ingresso all'uscita).
  const tipoFattura = m => {
    const v = { ...(m.prima || {}), ...(m.dopo || {}) };
    if (m.tabella === "ci_fatture") return v.tipo || fatture.get(Number(m.riga_id))?.tipo || null;
    if (m.tabella === "ci_articoli_fattura") return fatture.get(Number(v.fattura_id || righe.get(Number(m.riga_id))?.fattura_id))?.tipo || null;
    return null;
  };
  const eVendita = m => tipoFattura(m) === "ATTIVA";
  const eParametroRiforma = m => /^prezzo_riforma/.test(String(m.riga_id || ""));
  const anniAnimale = m => {
    const v = { ...(schede.get(Number(m.riga_id)) || {}), ...(m.prima || {}), ...(m.dopo || {}) };
    const da = annoDi(v.data_ingresso || v.nascita), a = annoDi(v.data_uscita) || new Date().getFullYear(); // presenza: dall'ingresso (o dalla nascita) all'uscita
    if (!da) return null;
    const l = []; for (let x = da; x <= a; x++) l.push(x); return l;
  };

  function annoModifica(m) {
    const v = { ...(m.prima || {}), ...(m.dopo || {}) };
    const id = Number(m.riga_id);
    if (m.tabella === "ci_fatture") return annoDi(v.data || fatture.get(id)?.data);
    if (m.tabella === "ci_articoli_fattura") return annoDi(fatture.get(Number(v.fattura_id || righe.get(id)?.fattura_id))?.data);
    if (m.tabella === "ci_costi_diretti") return annoDi(v.data || costi.get(id)?.data);
    if (m.tabella === "ci_cespiti_ammortamento") return v.anno ?? quote.get(id)?.anno ?? null;
    if (m.tabella === "ci_ripartizione_lavoro") return v.anno ?? null;
    if (m.tabella === "animali") return anniAnimale(m);
    return null; // lotti, cespiti: possono cambiare i costi di più anni
  }

  const risultato = anni.map(anno => {
    const salvatoAt = salvati.get(anno);
    if (ms(salvatoAt) < ms(INIZIO_REGISTRO)) return { anno, salvatoAt, stato: "sconosciuto", dettaglio: [] };
    const conta = {};
    modifiche.filter(m => ms(m.quando) > ms(salvatoAt)).forEach(m => {
      if (eVendita(m) || m.tabella === "ci_parametri") return; // non entrano nel Report Costi (versione 308)
      const a = annoModifica(m);
      if (a === null || a === anno || (Array.isArray(a) && a.includes(anno))) conta[m.tabella] = (conta[m.tabella] || 0) + 1;
    });
    const dettaglio = Object.entries(conta).map(([t, n]) => `${n} ${TABELLE[t]}`);
    return { anno, salvatoAt, stato: dettaglio.length ? "da_rifare" : "aggiornato", dettaglio };
  });

  // Report Riproduttori: va rifatto se un anno è stato salvato dopo l'ultima elaborazione (o se non c'è)
  const ultimoSalvataggio = anni.length ? [...salvati.values()].sort((a, b) => ms(a) - ms(b)).slice(-1)[0] : null;
  // Versione 308: va rifatto anche se dopo l'ultima elaborazione sono cambiate fatture di vendita o prezzi di riforma
  const dopoRiproduttori = riproduttoriAt ? modifiche.filter(m => ms(m.quando) > ms(riproduttoriAt)) : [];
  const vendite = dopoRiproduttori.filter(eVendita).length, prezziRiforma = dopoRiproduttori.filter(eParametroRiforma).length;
  const motivi = [];
  if (!!ultimoSalvataggio && (!riproduttoriAt || ms(riproduttoriAt) < ms(ultimoSalvataggio))) motivi.push("costi degli anni salvati dopo");
  if (vendite) motivi.push(`${vendite} cambiamenti nelle fatture di vendita`);
  if (prezziRiforma) motivi.push(`${prezziRiforma} prezzi di riforma cambiati`);
  const riproduttori = { elaboratoAt: riproduttoriAt, daRifare: motivi.length > 0, motivi };
  return { anni: risultato, riproduttori };
}

// Testo breve per l'avviso in cima al programma (null se è tutto aggiornato)
export function testoAvvisoCalcoli(stato) {
  if (!stato) return null;
  const daRifare = stato.anni.filter(a => a.stato === "da_rifare").map(a => a.anno);
  const sconosciuti = stato.anni.filter(a => a.stato === "sconosciuto").map(a => a.anno);
  const parti = [];
  const anni = l => (l.length === 1 ? `dell'anno ${l[0]}` : `degli anni ${l.join(", ")}`);
  if (daRifare.length) parti.push(`dopo l'ultimo calcolo sono cambiati dati che entrano nei costi ${anni(daRifare)}`);
  if (sconosciuti.length) parti.push(`i calcoli ${anni(sconosciuti)} sono precedenti al registro delle modifiche`);
  if (stato.riproduttori.daRifare) parti.push("l'elaborazione del Report Riproduttori non è aggiornata");
  return parti.length ? `Occorre ricalcolare i costi: ${parti.join("; ")}.` : null;
}
