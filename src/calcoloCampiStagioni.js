import { supabase } from "./supabase";
import { fetchAllPages, round2 } from "./parsingUtils";

// Sezione Coltivazioni → Campi e Stagioni
// Legge SOLTANTO i dati di coltivazione dell'app Podere Verde (viste e tabelle dell'app),
// con le stesse regole dei report dell'app: nessuna scrittura, nessun calcolo del programma cambia.
//  - v_ci_schede_campo ............ una riga per coltura (schede campo)
//  - v_coltivazione_report_prodotti  una riga per prodotto raccolto (rese, costi, mercato)
//  - v_ci_coltivazioni_campagne .... totali per campagna
//  - coltivazione_riparti + coltivazione_voci_costo: le voci di costo di ogni coltura
//  - colture_campo + campi + coltivazione_programma: il piano delle campagne future
//  - v_coltivazione_report_correnti / coltivazione_report_archivio: i report consegnati dall'app

export const PESO_BALLA_KG = 340; // balloni e rotoballe (come nell'app)

const num = v => (v === null || v === undefined || v === "" ? null : Number(v));

// Numeri dentro i testi dell'app ("Fieno di erba medica 41.000 balloni"): nel database il punto
// è la virgola decimale. Li riscrivo nel formato italiano: "41 balloni", "133,33 quintali".
export function numeriInItaliano(testo) {
  if (!testo) return testo;
  return String(testo).replace(/\d+\.\d+/g, m => Number(m).toLocaleString("it-IT", { maximumFractionDigits: 2 }));
}

export function unitaPerEttaro(unita) {
  if (unita === "balloni") return "balloni per ettaro";
  if (unita === "rotoballe") return "rotoballe per ettaro";
  if (unita === "quintali") return "quintali per ettaro";
  return unita ? `${unita} per ettaro` : "";
}
export function perUnita(unita) {
  if (unita === "balloni") return "per ballone";
  if (unita === "rotoballe") return "per rotoballa";
  if (unita === "quintali") return "al quintale";
  return unita ? `per ${unita}` : "";
}

export function ordinaCampagne(lista, discendente = true) {
  const o = [...new Set(lista)].filter(Boolean).sort();
  return discendente ? o.reverse() : o;
}

// Tutte le campagne dalla prima all'ultima, comprese quelle non caricate (es. 2022/2023)
export function campagneContinue(caricate) {
  const o = ordinaCampagne(caricate, false);
  if (!o.length) return [];
  const a0 = Number(o[0].slice(0, 4)), a1 = Number(o[o.length - 1].slice(0, 4));
  const out = [];
  for (let a = a0; a <= a1; a++) out.push(`${a}/${a + 1}`);
  return out;
}

// ---------------------------------------------------------------------------
// SCHEDE CAMPI
// ---------------------------------------------------------------------------
export async function caricaSchedeCampi() {
  const [s, p, r] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("v_ci_schede_campo").select("*")
      .order("campagna").order("campo_numero").order("ordine").range(da, a)),
    fetchAllPages((da, a) => supabase.from("v_coltivazione_report_prodotti")
      .select("coltura_campo_id,ettari,pascolato").range(da, a)),
    fetchAllPages((da, a) => supabase.from("coltivazione_riparti")
      .select("id,coltura_campo_id,quantita,importo,base_riparto,coltivazione_voci_costo(tipo,fornitore,documento,data_documento,descrizione,unita,prezzo_unitario)")
      .order("id").range(da, a)),
  ]);
  const errore = s.error || p.error || r.error;
  if (errore) throw new Error(errore.message);

  // ettari della coltura (quando il campo è diviso tra due colture) e stato pascolato
  const perColtura = {};
  (p.data || []).forEach(x => { perColtura[x.coltura_campo_id] = { ettari: num(x.ettari), pascolato: x.pascolato }; });

  const voci = {};
  (r.data || []).forEach(x => {
    const v = x.coltivazione_voci_costo || {};
    const q = num(x.quantita), imp = num(x.importo) || 0;
    (voci[x.coltura_campo_id] ||= []).push({
      tipo: v.tipo, descrizione: v.descrizione, fornitore: v.fornitore, documento: v.documento,
      data: v.data_documento, unita: v.unita, quantita: q,
      prezzo: q ? imp / q : num(v.prezzo_unitario), importo: imp,
    });
  });

  return (s.data || []).map(x => {
    const pc = perColtura[x.coltura_campo_id] || {};
    const ettariColtura = pc.ettari ?? num(x.ettari);
    return {
      id: x.coltura_campo_id, campagna: x.campagna, numero: x.campo_numero, campo: x.campo,
      ettariCampo: num(x.ettari), ettari: ettariColtura, ordine: x.ordine, coltura: x.coltura,
      poliennale: x.poliennale, nota: x.note, pascolato: pc.pascolato,
      semine: numeriInItaliano(x.semine), concimi: numeriInItaliano(x.concimi),
      lavorazioni: numeriInItaliano(x.lavorazioni), raccolte: numeriInItaliano(x.raccolte),
      seme: num(x.costo_seme) || 0, concime: num(x.costo_concime) || 0, fitosanitari: num(x.costo_fitosanitario) || 0,
      lavorazioniEuro: num(x.costo_lavorazioni) || 0, altro: num(x.costo_altro) || 0,
      totale: num(x.costo_totale) || 0, perEttaro: num(x.costo_per_ettaro),
      prodotto: x.prodotto_principale, quantita: num(x.quantita), unita: x.unita,
      costoUnitario: num(x.costo_unitario), resa: num(x.resa_per_ettaro),
      voci: (voci[x.coltura_campo_id] || []).sort((a, b) => b.importo - a.importo),
    };
  });
}

// ---------------------------------------------------------------------------
// RESE E COSTI PER STAGIONE
// ---------------------------------------------------------------------------
export async function caricaReseStagioni() {
  const [p, c, pm, b] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("v_coltivazione_report_prodotti").select("*")
      .order("campagna").order("campo_numero").order("ordine").range(da, a)),
    supabase.from("v_ci_coltivazioni_campagne").select("*").order("campagna"),
    supabase.from("coltivazione_prezzi_mercato").select("*").order("campagna").order("prodotto"),
    supabase.from("coltivazione_benchmark_rese").select("*").order("campagna").order("coltura"),
  ]);
  const errore = p.error || c.error || pm.error || b.error;
  if (errore) throw new Error(errore.message);

  const prodotti = (p.data || []).map(x => {
    const quantita = num(x.quantita), quintali = num(x.quantita_q), costo = num(x.costo_attribuito);
    const prezzoQ = num(x.prezzo_q), prezzoUnita = num(x.prezzo_unita);
    return {
      campagna: x.campagna, id: x.coltura_campo_id, numero: x.campo_numero, campo: x.campo, ettari: num(x.ettari),
      ordine: x.ordine, coltura: x.coltura, pascolato: x.pascolato,
      seme: num(x.costo_seme) || 0, concime: num(x.costo_concime) || 0, fitosanitari: num(x.costo_fitosanitario) || 0,
      lavorazioni: num(x.costo_lavorazioni) || 0, altro: num(x.costo_altro) || 0,
      costoColtura: num(x.costo_totale) || 0, costoPerEttaro: num(x.costo_per_ettaro),
      prodotto: x.prodotto, unita: x.unita, quantita, quintali,
      prezzoQ, prezzoUnita, valore: num(x.valore_mercato), quota: num(x.quota),
      costo, costoUnitario: num(x.costo_unitario),
      costoQuintale: costo != null && quintali ? costo / quintali : null,
      resaQ: num(x.resa_q_ha), resaRiferimento: num(x.benchmark_resa_q_ha),
    };
  });

  // Riepilogo delle campagne: costi dalla vista delle campagne, valore di mercato dai prodotti
  const valore = {};
  prodotti.forEach(x => { if (x.prodotto && x.valore) valore[x.campagna] = (valore[x.campagna] || 0) + x.valore; });
  const campagne = (c.data || []).map(x => {
    const costo = num(x.costo_totale) || 0, v = valore[x.campagna] ?? null;
    return {
      campagna: x.campagna, colture: x.n_colture, ettari: num(x.ettari),
      semi: num(x.semi) || 0, concimi: num(x.concimi) || 0, fitosanitari: num(x.fitosanitari) || 0,
      lavorazioni: num(x.lavorazioni) || 0, altro: num(x.altro) || 0,
      costo, perEttaro: num(x.costo_per_ettaro),
      valore: v, saldo: v != null && costo > 0 ? round2(v - costo) : null,
      inCorso: costo === 0,
    };
  });

  return { prodotti, campagne, prezzi: pm.data || [], rese: b.data || [] };
}

// ---------------------------------------------------------------------------
// PIANO DELLE CAMPAGNE (programma di semina e concimazione)
// ---------------------------------------------------------------------------
export async function caricaPiano() {
  const [cc, pr] = await Promise.all([
    supabase.from("colture_campo")
      .select("id,campagna,ordine,coltura,coltura_altro,poliennale,campagna_semina,note,porzione,ettari,campi(numero,nome,ettari)"),
    supabase.from("coltivazione_programma").select("*").order("ordine"),
  ]);
  const errore = cc.error || pr.error;
  if (errore) throw new Error(errore.message);
  const prog = {};
  (pr.data || []).forEach(x => { (prog[x.coltura_campo_id] ||= []).push(x); });
  const campagneConPiano = new Set((cc.data || []).filter(x => prog[x.id]).map(x => x.campagna));

  return (cc.data || []).filter(x => campagneConPiano.has(x.campagna)).map(x => {
    const ettari = num(x.ettari) ?? num(x.campi?.ettari);
    const prodotti = (prog[x.id] || []).map(p => {
      const dose = num(p.dose_ha), prezzo = num(p.prezzo_unitario);
      const quantita = dose != null && ettari != null ? dose * ettari : null;
      return { tipo: p.tipo, prodotto: p.prodotto, dose, unita: p.unita, prezzo, quantita,
        costo: quantita != null && prezzo != null ? quantita * prezzo : null, nota: p.nota };
    });
    return {
      id: x.id, campagna: x.campagna, numero: x.campi?.numero, campo: x.campi?.nome + (x.porzione ? ` — ${x.porzione}` : ""),
      ettari, ordine: x.ordine, coltura: x.coltura === "Altro" && x.coltura_altro ? x.coltura_altro : x.coltura,
      campagnaSemina: x.campagna_semina, nota: x.note, prodotti,
      costoPrevisto: prodotti.reduce((s, p) => s + (p.costo || 0), 0),
    };
  }).sort((a, b) => a.campagna.localeCompare(b.campagna) || a.numero - b.numero || a.ordine - b.ordine);
}

// ---------------------------------------------------------------------------
// ARCHIVIO DEI REPORT CONSEGNATI DALL'APP
// ---------------------------------------------------------------------------
export async function caricaArchivioReport() {
  const { data, error } = await supabase.from("coltivazione_report_archivio")
    .select("id,nome_file,titolo,descrizione,campagne,versione,stato,sostituito_da,fonti,note,data_report,created_at")
    .order("data_report", { ascending: false }).order("nome_file").order("versione", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function caricaFogliReport(id) {
  const { data, error } = await supabase.from("coltivazione_report_archivio").select("fogli").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data?.fogli || {};
}

// Le righe dei fogli possono contenere elenchi (es. «Voci di costo», «Prodotti previsti»):
// per l'Excel li scrivo in un foglio a parte, collegati alla riga dal suo identificativo.
export function fogliPerExcel(fogli) {
  const out = [];
  Object.entries(fogli || {}).forEach(([nome, righe]) => {
    const principali = [], dettagli = {};
    (righe || []).forEach(r => {
      const riga = {};
      Object.entries(r).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          const chiave = r["Identificativo della coltura"] ?? r["Campo"] ?? "";
          (dettagli[k] ||= []).push(...v.map(el => ({ "Riferimento": chiave, "Campo": r["Campo"] ?? "", ...el })));
          riga[k] = `${v.length} righe, nel foglio «${k}»`;
        } else riga[k] = v;
      });
      principali.push(riga);
    });
    out.push({ nome, righe: principali });
    Object.entries(dettagli).forEach(([k, righe]) => out.push({ nome: `${k} ${nome}`.slice(0, 31), righe }));
  });
  return out;
}
