import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, round2, formattaEuro, fetchAllPages } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { calcolaResiduoIniziale, calcolaRealizzoCarcassa } from "./motoreRiproduttori";
import { caricaRigheVendita, venditaDiAnimale, eTrasferito } from "./venditeDaFatture";
import { idGenitori, segnaRiproduttoriEffettivi, normalizzaAnimali, eNatoDellaMandria } from "./costoAnimale";
import { caricaIdGenitori } from "./genitori";

// Prezzo di riforma al kg di carcassa, per specie (modificabile in Parametri; 7 € di partenza)
export const PARAMETRI_PREZZO_RIFORMA = { bovino: "prezzo_riforma_kg_carcassa_bovini", suino: "prezzo_riforma_kg_carcassa_suini", ovino: "prezzo_riforma_kg_carcassa_ovini" };
const NOMI_SPECIE = { bovino: "bovini", suino: "suini", ovino: "ovini" };
export const PREZZO_RIFORMA_PREDEFINITO = { bovino: 7, suino: 5, ovino: 3 };
async function assicuraPrezziRiforma() {
  const { data } = await supabase.from("ci_parametri").select("chiave").in("chiave", Object.values(PARAMETRI_PREZZO_RIFORMA));
  const presenti = new Set((data || []).map(r => r.chiave));
  const mancanti = Object.entries(PARAMETRI_PREZZO_RIFORMA).filter(([, k]) => !presenti.has(k)).map(([sp, k]) => ({
    chiave: k, valore: String(PREZZO_RIFORMA_PREDEFINITO[sp]), descrizione: `Prezzo di riforma dei ${NOMI_SPECIE[sp]} (€ al kg di carcassa) per il valore di realizzo stimato dei riproduttori`, updated_at: new Date().toISOString(),
  }));
  if (mancanti.length) await supabase.from("ci_parametri").insert(mancanti);
}
export function eccedenzaRealizzo(r) {
  return round2(Math.max(0, (Number(r.valore_realizzo_stimato) || 0) - (Number(r.costo_acquisto) || 0) - (Number(r.costi_crescita_preriproduttiva) || 0)));
}
import SchedaRiproduttore from "./SchedaRiproduttore";

// ── Costo rimasto all'uscita di un riproduttore ────────────────────────────────────────────
// Quando un riproduttore esce (venduto, macellato, morto) la parte del suo costo non ancora
// passata ai figli NON si perde:
//  1) va ai figli dell'ULTIMO anno in cui ha avuto figli, se sono ancora in vita il giorno
//     dell'uscita del genitore (in parti uguali);
//  2) se nessuno di quelli è in vita, ai figli ancora in vita degli anni precedenti (sempre
//     il gruppo dell'anno più recente che ha almeno un figlio vivo);
//  3) se non ha figli in vita, si spalma su tutti gli animali della stessa specie presenti in
//     azienda il giorno dell'uscita, in proporzione agli UBA-giorni dell'anno (come i decessi),
//     esclusi gli altri riproduttori (se non c'è altro, anche loro).
// L'importo va nella colonna «quota_residuo_riproduttori» del costo annuale di chi lo riceve
// (anno dell'uscita) ed entra nel suo totale dell'anno. Rifacendo l'elaborazione le quote si
// azzerano e si ricalcolano: il risultato è sempre lo stesso.
const NOMI_SPECIE_PLURALE = { bovino: "bovini", suino: "suini", ovino: "ovini" };
const giorno = d => (d ? String(d).slice(0, 10) : null);
// Gestazione massima per specie (giorni): un maschio morto o uscito può avere figli che
// nascono dopo, purché entro questo tempo (concepiti mentre era in azienda). Normale.
const GESTAZIONE_MASSIMA_GIORNI = { bovino: 300, suino: 120, ovino: 155 };
const piuGiorni = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
function vivoAl(dataNascita, dataUscitaAnimale, stato, data) {
  if (!dataNascita || giorno(dataNascita) > data) return false;
  if (dataUscitaAnimale) return giorno(dataUscitaAnimale) > data;
  return stato === "attivo";
}
// Ricavo VERO dall'uscita del riproduttore (per il conguaglio con la stima):
// - morto: 0 (non si ricava nulla);
// - macellato con peso della carcassa: peso carcassa × prezzo scritto nella scheda del
//   riproduttore, o in mancanza prezzo di riforma della specie (Parametri);
// - venduto o trasferito con una fattura attiva che contiene la sua matricola: l'incasso della
//   fattura (deciso dal Dott. Bizzarri il 05/10/2026);
// - venduto vivo, o trasferito senza fattura (scambio), con peso: peso vivo × prezzo al kg vivo
//   (tabella prezzi di riforma);
// - dati mancanti: null → nessun conguaglio, si tiene la stima (e lo si segnala).
export function realizzoRealeUscita({ rip, prezzoSchedaCarcassa, prezzoRiformaCarcassa, prezziRiforma, righeVendita }) {
  const motivo = `${rip.stato || ""} ${rip.motivo_uscita || ""}`.toLowerCase();
  if (motivo.includes("decedut") || motivo.includes("mort")) return { valore: 0, fonte: "morto: nessun ricavo" };
  if (motivo.includes("vend") || motivo.includes("trasferit") || motivo.includes("scambi")) {
    const v = venditaDiAnimale(rip.bdn, righeVendita);
    if (v) return { valore: v.incasso, fonte: `venduto: ${v.testo}` };
    // Senza fattura: prezzo di vendita scritto nella nota della scheda dell'app
    // (es. «Venduto vivo il 07/05/2021 a 3.000,00 €»), finché l'app non ha un campo apposito
    const n = String(rip.note || "").match(/vendut[oa][^.]*?\ba\s+([\d.]+(?:,\d{1,2})?)\s*€/i);
    if (n) {
      const valore = round2(parseFloat(n[1].replace(/\./g, "").replace(",", ".")));
      if (valore > 0) return { valore, fonte: `venduto: ${formattaEuro(valore)} scritto nella nota della scheda dell'app (nessuna fattura di vendita nel database)` };
    }
  }
  if (motivo.includes("macell") && Number(rip.peso_carcassa) > 0) {
    const prezzo = Number(prezzoSchedaCarcassa) > 0 ? Number(prezzoSchedaCarcassa) : prezzoRiformaCarcassa;
    return { valore: round2(Number(rip.peso_carcassa) * prezzo), fonte: `${rip.peso_carcassa} kg di carcassa × ${formattaEuro(prezzo)} (${Number(prezzoSchedaCarcassa) > 0 ? "prezzo della scheda" : "prezzo di riforma della specie"})` };
  }
  if (Number(rip.peso_vivo_uscita) > 0) {
    const razza = rip.razza_calcolata || rip.razza;
    const p = (prezziRiforma || []).find(x => x.specie === rip.specie && x.razza === razza) || (prezziRiforma || []).find(x => x.specie === rip.specie);
    const scambio = eTrasferito(rip.stato) ? "trasferito senza fattura di vendita, considerato uno scambio: " : "";
    if (Number(p?.prezzo_kg_vivo) > 0) return { valore: round2(Number(rip.peso_vivo_uscita) * Number(p.prezzo_kg_vivo)), fonte: `${scambio}${rip.peso_vivo_uscita} kg vivi × ${formattaEuro(p.prezzo_kg_vivo)}` };
  }
  return { valore: null, fonte: "dati reali mancanti (peso o prezzo): si tiene la stima, nessun conguaglio" };
}

async function distribuisciResiduiUscita({ usciti, tuttiAnimali, tutteUnita, mappaLottiPerId }) {
  // 1. Azzero le quote date in un'elaborazione precedente
  const { data: conQuota, error: eQ } = await fetchAllPages((da, a) => supabase.from("ci_costo_animale_annuale")
    .select("id, costo_mantenimento, costo_nascita_ereditato").gt("quota_residuo_riproduttori", 0).range(da, a));
  if (eQ) throw new Error(`Errore leggendo le quote dei riproduttori usciti: ${eQ.message}`);
  for (const r of conQuota || []) {
    const { error } = await supabase.from("ci_costo_animale_annuale").update({
      quota_residuo_riproduttori: 0,
      costo_totale_anno: round2((parseFloat(r.costo_mantenimento) || 0) + (parseFloat(r.costo_nascita_ereditato) || 0)),
    }).eq("id", r.id);
    if (error) throw new Error(error.message);
  }
  await supabase.from("ci_residuo_riproduttore").update({ residuo_all_uscita: null, residuo_uscita_anno: null, residuo_uscita_destinazione: null, conguaglio_uscita: null, realizzo_reale_fonte: null })
    .not("residuo_uscita_anno", "is", null);

  const animaliPerId = new Map(tuttiAnimali.map(a => [a.id, a]));
  const unitaPerChiave = new Map(tutteUnita.map(u => [`${u.lotto_id}|${u.nr}`, u]));
  const righeAnno = new Map(); // "specie|anno" → righe di costo
  async function righeDi(specie, anno) {
    const k = `${specie}|${anno}`;
    if (!righeAnno.has(k)) {
      const { data, error } = await fetchAllPages((da, a) => supabase.from("ci_costo_animale_annuale")
        .select("id, animale_id, lotto_id, unita_nr, uba_giorni").eq("specie", specie).eq("anno", anno).range(da, a));
      if (error) throw new Error(error.message);
      righeAnno.set(k, data || []);
    }
    return righeAnno.get(k);
  }

  const quote = new Map(); // id riga di costo → euro ricevuti
  const aggiungi = (id, euro) => quote.set(id, round2((quote.get(id) || 0) + euro));
  let distribuiti = 0, nonDistribuiti = 0, totale = 0;

  for (const u of usciti) {
    const residuoPrima = round2(Math.max(0, u.residuo || 0));
    // Conguaglio: stima − ricavo vero. Ricavato meno del previsto → ai figli passa di più;
    // ricavato di più → passa di meno, mai sotto zero.
    const differenza = u.realizzoReale.valore == null ? 0 : round2(u.realizzoStimato - u.realizzoReale.valore);
    const residuo = round2(Math.max(0, residuoPrima + differenza));
    const conguaglio = round2(residuo - residuoPrima);
    const data = giorno(u.dataUscita);
    let destinazione;
    let annoRicevimento = u.annoUscita;
    if (residuo <= 0) {
      destinazione = "Nessun costo rimasto";
    } else {
      const righe = await righeDi(u.rip.specie, u.annoUscita);
      const rigaAnimale = new Map(righe.filter(r => r.animale_id).map(r => [r.animale_id, r]));
      const rigaUnita = new Map(righe.filter(r => r.lotto_id).map(r => [`${r.lotto_id}|${r.unita_nr}`, r]));

      // Figli in vita il giorno dell'uscita, con il costo dell'anno già calcolato
      const figliVivi = [
        ...u.figli.filter(f => vivoAl(f.nascita, f.data_uscita, f.stato, data) && rigaAnimale.has(f.id))
          .map(f => ({ anno: new Date(f.nascita).getFullYear(), riga: rigaAnimale.get(f.id) })),
        ...u.unitaFiglie.filter(x => x.stato !== "registrato_individuale" && vivoAl(x.nascita, x.data_uscita, x.stato, data) && rigaUnita.has(`${x.lotto_id}|${x.nr}`))
          .map(x => ({ anno: new Date(x.nascita).getFullYear(), riga: rigaUnita.get(`${x.lotto_id}|${x.nr}`) })),
      ];
      // Figli nati DOPO l'uscita (morte, vendita, scambio) entro la gestazione: concepiti quando
      // il padre era in azienda, sono i suoi ultimi figli e ricevono il costo rimasto, nella riga
      // dell'anno in cui sono nati.
      const limitePostumi = piuGiorni(data, GESTAZIONE_MASSIMA_GIORNI[u.rip.specie] || 0);
      const nascitaPostuma = n => !!n && giorno(n) > data && giorno(n) <= limitePostumi;
      const figliPostumi = [];
      for (const f of u.figli.filter(f => nascitaPostuma(f.nascita))) {
        const r = (await righeDi(u.rip.specie, new Date(f.nascita).getFullYear())).find(x => x.animale_id === f.id);
        if (r) figliPostumi.push({ anno: new Date(f.nascita).getFullYear(), riga: r });
      }
      for (const x of u.unitaFiglie.filter(x => x.stato !== "registrato_individuale" && nascitaPostuma(x.nascita))) {
        const r = (await righeDi(u.rip.specie, new Date(x.nascita).getFullYear())).find(y => y.lotto_id === x.lotto_id && y.unita_nr === x.nr);
        if (r) figliPostumi.push({ anno: new Date(x.nascita).getFullYear(), riga: r });
      }
      let riceventi = [];
      if (figliPostumi.length) {
        const annoGruppo = Math.max(...figliPostumi.map(f => f.anno));
        const gruppo = figliPostumi.filter(f => f.anno === annoGruppo);
        riceventi = gruppo.map(f => ({ riga: f.riga, peso: 1 }));
        annoRicevimento = annoGruppo;
        destinazione = `Figli nati nel ${annoGruppo} dopo la sua uscita, concepiti prima (${gruppo.length} ${gruppo.length === 1 ? "capo" : "capi"}, in parti uguali)`;
      } else if (figliVivi.length) {
        const annoGruppo = Math.max(...figliVivi.map(f => f.anno));
        const gruppo = figliVivi.filter(f => f.anno === annoGruppo);
        riceventi = gruppo.map(f => ({ riga: f.riga, peso: 1 }));
        destinazione = `Figli nati nel ${annoGruppo} ancora in vita all'uscita (${gruppo.length} ${gruppo.length === 1 ? "capo" : "capi"}, in parti uguali)`;
      } else {
        const presente = (r, ancheRiproduttori) => {
          if (r.animale_id) {
            if (r.animale_id === u.rip.id) return false;
            const a = animaliPerId.get(r.animale_id);
            return !!a && (ancheRiproduttori || !a.riproduttore) && vivoAl(a.nascita, a.data_uscita, a.stato, data);
          }
          const un = unitaPerChiave.get(`${r.lotto_id}|${r.unita_nr}`);
          const lotto = mappaLottiPerId.get(r.lotto_id);
          return !!un && !!lotto && un.stato !== "registrato_individuale" && vivoAl(lotto.data_parto, un.data_uscita, un.stato, data);
        };
        let candidati = righe.filter(r => (parseFloat(r.uba_giorni) || 0) > 0 && presente(r, false));
        if (!candidati.length) candidati = righe.filter(r => (parseFloat(r.uba_giorni) || 0) > 0 && presente(r, true));
        riceventi = candidati.map(r => ({ riga: r, peso: parseFloat(r.uba_giorni) }));
        destinazione = riceventi.length
          ? `Nessun figlio in vita: spalmato su tutti i ${NOMI_SPECIE_PLURALE[u.rip.specie] || u.rip.specie} presenti in azienda all'uscita (${riceventi.length} capi, in proporzione agli UBA-giorni del ${u.annoUscita})`
          : `NON DISTRIBUITO: nessun animale con costo calcolato per il ${u.annoUscita} (fare prima Report Costi del ${u.annoUscita})`;
      }
      if (riceventi.length) {
        const pesoTotale = riceventi.reduce((s, r) => s + r.peso, 0);
        let assegnato = 0;
        riceventi.forEach((r, i) => {
          const euro = i === riceventi.length - 1 ? round2(residuo - assegnato) : round2(residuo * r.peso / pesoTotale);
          assegnato = round2(assegnato + euro);
          aggiungi(r.riga.id, euro);
        });
        distribuiti++; totale = round2(totale + residuo);
      } else nonDistribuiti++;
    }
    const { error: eR } = await supabase.from("ci_residuo_riproduttore").update({
      residuo_all_uscita: residuoPrima, conguaglio_uscita: conguaglio, residuo_uscita_anno: annoRicevimento, residuo_uscita_destinazione: destinazione,
      valore_realizzo_reale: u.realizzoReale.valore, realizzo_reale_fonte: u.realizzoReale.fonte, anno_uscita: u.annoUscita, conguaglio_applicato: u.realizzoReale.valore != null,
      ...(destinazione.startsWith("NON DISTRIBUITO") ? {} : { residuo_rimanente: 0 }), updated_at: new Date().toISOString(),
    }).eq("id", u.residuoId);
    if (eR) throw new Error(`Errore registrando il costo rimasto di ${u.rip.bdn}: ${eR.message}`);
  }

  // 2. Scrivo le quote nelle righe di costo di chi le riceve
  const ids = [...quote.keys()];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: righe, error } = await supabase.from("ci_costo_animale_annuale")
      .select("id, costo_mantenimento, costo_nascita_ereditato").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const r of righe || []) {
      const q = quote.get(r.id);
      const { error: eU } = await supabase.from("ci_costo_animale_annuale").update({
        quota_residuo_riproduttori: q,
        costo_totale_anno: round2((parseFloat(r.costo_mantenimento) || 0) + (parseFloat(r.costo_nascita_ereditato) || 0) + q),
      }).eq("id", r.id);
      if (eU) throw new Error(eU.message);
    }
  }
  if (!usciti.length) return "";
  return `\n\nRiproduttori usciti: ${usciti.length}. Costo rimasto all'uscita distribuito per ${distribuiti} di loro (${formattaEuro(totale)} in tutto)` +
    (nonDistribuiti ? `; ⚠️ ${nonDistribuiti} NON distribuiti (manca il Report Costi dell'anno di uscita).` : ".");
}

export default function ReportRiproduttori() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [elaborando, setElaborando] = useState(false);
  const [avanzamento, setAvanzamento] = useState(null);
  // Mentre l'elaborazione è in corso (alcuni minuti) chiudere o ricaricare la pagina la
  // interrompe a metà, lasciando alcuni riproduttori aggiornati e altri no: il browser chiede conferma.
  useEffect(() => {
    if (!elaborando) return;
    const avvisa = e => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", avvisa);
    return () => window.removeEventListener("beforeunload", avvisa);
  }, [elaborando]);
  const [riproduttori, setRiproduttori] = useState(null);
  const [mandria, setMandria] = useState(null);
  const [parametri, setParametri] = useState(null);
  const [provenienzeEspanse, setProvenienzeEspanse] = useState(new Set());
  const [specieEspanse, setSpecieEspanse] = useState(new Set());
  const [animaleSelezionato, setAnimaleSelezionato] = useState(null);

  function toggleProvenienza(p) {
    setProvenienzeEspanse(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; });
  }
  function toggleSpecie(chiave) {
    setSpecieEspanse(prev => { const n = new Set(prev); n.has(chiave) ? n.delete(chiave) : n.add(chiave); return n; });
  }

  useEffect(() => { caricaElenco(); caricaMandria(); caricaParametri().then(setParametri); }, []);

  async function caricaMandria() {
    const { data } = await supabase.from("ci_costo_nascita_mandria").select("*").order("specie").order("anno");
    setMandria(numerizzaCampi(data || [], ["mantenimento_riproduttori", "quota_residuo_riproduttori", "costo_mandria", "riporto_anno_precedente", "costo_nascita_per_nato", "costo_per_nato_da_madri", "costo_per_nato_da_padri", "rinviato_anno_dopo"]));
  }

  async function caricaElenco() {
    const { data } = await supabase.from("ci_residuo_riproduttore").select("*, animali(bdn, nome, specie, stato, provenienza, riproduttore)").order("updated_at", { ascending: false });
    // Si mostrano solo gli animali marcati «riproduttore» nell'app: un vecchio record di un capo
    // a cui il segno è stato tolto non viene più ricalcolato e avrebbe valori vecchi o vuoti.
    const genitori = await caricaIdGenitori();
    setRiproduttori(numerizzaCampi((data || []).filter(r => r.animali?.riproduttore || genitori.has(r.animale_id)).map(r => ({ ...r, riproduttoreDaiParti: !r.animali?.riproduttore })),  ["costo_acquisto", "costi_crescita_preriproduttiva", "valore_realizzo_stimato", "valore_realizzo_reale", "residuo_totale", "residuo_rimanente", "conto_sospeso", "residuo_all_uscita", "conguaglio_uscita"]));
  }

  async function caricaParametri() {
    const { data } = await supabase.from("ci_parametri").select("chiave, valore");
    const mappa = {};
    (data || []).forEach(p => { mappa[p.chiave] = parseFloat(p.valore); });
    return mappa;
  }

  async function elabora() {
    setElaborando(true);
    try {
      await assicuraPrezziRiforma();
      const parametriMap = await caricaParametri();
      setParametri(parametriMap);

      const { data: tuttiAnimali, error: eA } = await fetchAllPages((da, a) => supabase
        .from("animali").select("id,bdn,nome,specie,razza,razza_calcolata,riproduttore,costo_iniziale,prezzo_acquisto,padre_id,madre_id,nascita,data_ingresso,note,stato,data_uscita,peso_vivo_uscita,peso_carcassa,provenienza,sesso,motivo_uscita,tipo_costo_iniziale").range(da, a));
      if (eA) throw new Error(eA.message);

      const { data: tuttiLotti, error: eL } = await fetchAllPages((da, a) => supabase
        .from("lotti_suini").select("id,padre_id,madre_id,data_parto,codice_lotto,codice,tipo_provenienza,prezzo_acquisto").range(da, a));
      if (eL) throw new Error(eL.message);
      const { data: tutteUnita, error: eU } = await fetchAllPages((da, a) => supabase
        .from("suini_lotto").select("id,lotto_id,nr,stato,data_uscita,bdn,codice_completo").range(da, a));
      if (eU) throw new Error(eU.message);
      const mappaLottiPerId = new Map((tuttiLotti || []).map(l => [l.id, l]));

      const { data: prezziRiforma } = await supabase.from("prezzi_riforma").select("*");
      const righeVendita = await caricaRigheVendita();
      const etaMinimaAnni = parametriMap.eta_minima_calcolo_peso_storico || 3;
      const realeDi = (rip, rec) => realizzoRealeUscita({
        rip, prezzoSchedaCarcassa: rec.prezzo_vendita_kg_carcassa_reale, prezziRiforma, righeVendita,
        prezzoRiformaCarcassa: parametriMap[PARAMETRI_PREZZO_RIFORMA[rip.specie]] || PREZZO_RIFORMA_PREDEFINITO[rip.specie],
      });

      // ── Calcolo della linea vacca-vitello (scrofaia, gregge) SULLA MANDRIA ─────────────────
      // Deciso dal Dott. Bizzarri il 03/10/2026. Per ogni specie e ogni anno:
      //   costo della mandria = mantenimento dei riproduttori in carriera (dal primo figlio in poi)
      //                       + quota annua del loro residuo (partenza + crescita − realizzo,
      //                         ammortizzato sugli anni di carriera che restano, minimo 1);
      //   costo di nascita di ogni nato dell'anno = costo della mandria ÷ nati dell'anno.
      // Tutti i nati della stessa specie nello stesso anno hanno lo stesso costo di nascita; le
      // femmine vuote pesano sui nati (è il costo vero della fertilità). La parte delle femmine
      // va nella colonna «da madre», quella dei maschi in «da padre». Se in un anno non nasce
      // nessuno, il costo passa all'anno dopo. La crescita prima del primo figlio è investimento:
      // non pesa sull'anno, entra nel residuo e si ammortizza.
      const nomeAnimale = a => a.bdn || a.nome || `animale ${a.id}`;
      const annoDi = d => (d ? Number(String(d).slice(0, 4)) : null);
      // Chi ha un parto registrato è riproduttore anche senza il segno nell'app (05/10/2026)
      const base = normalizzaAnimali(tuttiAnimali || [], tuttiLotti, tutteUnita);
      const tutti = segnaRiproduttoriEffettivi(base, idGenitori(base, tuttiLotti));
      // Riproduttore = segnato nell'app OPPURE con almeno un parto registrato (madre o padre)
      const riproduttoriAttivi = tutti.filter(a => a.riproduttore)
        .sort((x, y) => (x.nascita || "9999").localeCompare(y.nascita || "9999") || x.id - y.id);
      if (riproduttoriAttivi.length === 0) {
        alert("Nessun animale marcato come riproduttore in anagrafica.");
        setElaborando(false);
        return;
      }

      setAvanzamento("Lettura dei costi annuali");
      const { data: righeCosto, error: eC } = await fetchAllPages((da, a) => supabase.from("ci_costo_animale_annuale")
        .select("id,anno,animale_id,lotto_id,unita_nr,specie,costo_mantenimento,costo_nascita_ereditato,costo_nascita_da_madre,costo_nascita_da_padre,quota_scaricata_su_figli,quota_residuo_riproduttori")
        .order("id").range(da, a));
      if (eC) throw new Error(eC.message);
      const righe = numerizzaCampi(righeCosto || [], ["costo_mantenimento", "costo_nascita_ereditato", "costo_nascita_da_madre", "costo_nascita_da_padre", "quota_scaricata_su_figli", "quota_residuo_riproduttori"]);
      const rigaAnimale = new Map(righe.filter(r => r.animale_id).map(r => [`${r.animale_id}|${r.anno}`, r]));
      const rigaUnita = new Map(righe.filter(r => r.lotto_id).map(r => [`${r.lotto_id}|${r.unita_nr}|${r.anno}`, r]));
      const { data: residuiEsistenti, error: eR } = await supabase.from("ci_residuo_riproduttore").select("*");
      if (eR) throw new Error(eR.message);
      const residuoPerAnimale = new Map(numerizzaCampi(residuiEsistenti || [], ["costo_acquisto", "costi_crescita_preriproduttiva", "valore_realizzo_stimato", "residuo_totale", "residuo_rimanente"]).map(r => [r.animale_id, r]));

      // Nati di ogni specie e anno (nati in azienda con matricola + suinetti dei lotti non acquistati
      // non ancora passati a matricola), solo se hanno la riga di costo dell'anno di nascita
      const natiPerChiave = new Map(); // "specie|anno" → righe di costo dei nati
      const aggiungiNato = (specie, anno, riga) => {
        const k = `${specie}|${anno}`;
        if (!natiPerChiave.has(k)) natiPerChiave.set(k, []);
        natiPerChiave.get(k).push(riga);
      };
      let natiSenzaRiga = 0;
      tutti.filter(a => eNatoDellaMandria(a) && a.nascita && annoDi(a.nascita) <= anno).forEach(a => {
        const riga = rigaAnimale.get(`${a.id}|${annoDi(a.nascita)}`);
        if (riga) aggiungiNato(a.specie, annoDi(a.nascita), riga); else natiSenzaRiga++;
      });
      (tutteUnita || []).forEach(u => {
        const lotto = mappaLottiPerId.get(u.lotto_id);
        if (!lotto || lotto.tipo_provenienza === "acquistato" || u.stato === "registrato_individuale" || !lotto.data_parto) return;
        const y = annoDi(lotto.data_parto);
        if (y > anno) return;
        const riga = rigaUnita.get(`${u.lotto_id}|${u.nr}|${y}`);
        if (riga) aggiungiNato("suino", y, riga); else natiSenzaRiga++;
      });

      // Dati fissi di ogni riproduttore
      const info = riproduttoriAttivi.map(rip => {
        const figli = tutti.filter(a => (a.padre_id === rip.id || a.madre_id === rip.id) && eNatoDellaMandria(a));
        const unitaFiglie = (tutteUnita || []).filter(u => {
          const lotto = mappaLottiPerId.get(u.lotto_id);
          return lotto && u.stato !== "registrato_individuale" && lotto.tipo_provenienza !== "acquistato" && (lotto.padre_id === rip.id || lotto.madre_id === rip.id);
        }).map(u => ({ ...u, nascita: mappaLottiPerId.get(u.lotto_id)?.data_parto, tipo: "lotto" }));
        const anniFigli = [...figli.map(f => annoDi(f.nascita)), ...unitaFiglie.map(u => annoDi(u.nascita))].filter(Boolean);
        const dataUscita = rip.stato !== "attivo" && rip.data_uscita ? rip.data_uscita : null;
        const annoUscita = dataUscita ? annoDi(dataUscita) : null;
        const annoFine = annoUscita ? Math.min(anno, annoUscita) : anno;
        const haFigli = anniFigli.some(y => y <= annoFine);
        const primo = haFigli ? Math.min(...anniFigli) : null;
        const limiteCrescita = haFigli ? primo : annoFine + 1;
        const crescita = round2(righe.filter(r => r.animale_id === rip.id && r.anno < limiteCrescita).reduce((s, r) => s + r.costo_mantenimento, 0));
        const realizzo = calcolaRealizzoCarcassa({
          specie: rip.specie, razza: rip.razza_calcolata || rip.razza, sesso: rip.sesso, animaliUsciti: tutti, etaMinimaAnni,
          prezzoKgCarcassa: parametriMap[PARAMETRI_PREZZO_RIFORMA[rip.specie]] || PREZZO_RIFORMA_PREDEFINITO[rip.specie],
        }).valore;
        const chiaveVita = `vita_produttiva_attesa_${rip.specie === "bovino" ? "bovini" : rip.specie === "suino" ? "suini" : "ovini"}`;
        const vitaStandard = parametriMap[chiaveVita] || 5;
        const rec = residuoPerAnimale.get(rip.id) || null;
        const vitaAttuale = rec ? Number(rec.vita_produttiva_attesa_anni) : NaN;
        const personalizzata = !!rec?.vita_produttiva_personalizzata && Number.isFinite(vitaAttuale) && vitaAttuale >= 1;
        const conteggioFigli = {};
        anniFigli.forEach(y => { conteggioFigli[y] = (conteggioFigli[y] || 0) + 1; });
        return { rip, rec, figli, unitaFiglie, dataUscita, annoUscita, annoFine, uscito: annoUscita !== null && annoUscita <= anno,
          haFigli, primo, crescita, realizzo, vita: personalizzata ? vitaAttuale : vitaStandard, personalizzata,
          conteggioFigli, partenza: 0, residuoTotale: 0, residuo: 0, contributi: [] };
      });
      // Costo di partenza: acquisto, oppure costo di nascita calcolato qui (anno di nascita)
      const costoNascitaCalcolato = new Map(); // id riga → { madre, padre }
      const partenzaDi = i => {
        if (!eNatoDellaMandria(i.rip)) return round2(parseFloat(i.rip.prezzo_acquisto) || 0);
        const riga = i.rip.nascita ? rigaAnimale.get(`${i.rip.id}|${annoDi(i.rip.nascita)}`) : null;
        if (!riga) return 0;
        const c = costoNascitaCalcolato.get(riga.id);
        return c ? round2(c.madre + c.padre) : 0;
      };

      // Anno per anno, specie per specie
      const specieTutte = ["bovino", "suino", "ovino"];
      const primoAnno = Math.min(...righe.map(r => r.anno), anno);
      const mandria = []; // righe del riepilogo per specie e anno
      const riporto = Object.fromEntries(specieTutte.map(s => [s, { madri: 0, padri: 0 }]));
      for (let y = primoAnno; y <= anno; y++) {
        setAvanzamento(`Costo della mandria ${y}`);
        for (const s of specieTutte) {
          let costoMadri = 0, costoPadri = 0, mantenimento = 0, quotaResiduo = 0, inCarriera = 0, senzaFigli = 0;
          for (const i of info) {
            if (i.rip.specie !== s || !i.haFigli || y < i.primo || y > i.annoFine) continue;
            if (y === i.primo) {
              i.partenza = partenzaDi(i);
              i.residuoTotale = calcolaResiduoIniziale({ costoAcquisto: i.partenza, costiCrescitaPreRiproduttiva: i.crescita, valoreRealizzoStimato: i.realizzo });
              i.residuo = i.residuoTotale;
            }
            const anniRestanti = i.vita - (y - i.primo);
            const quota = Math.min(round2(i.residuo / Math.max(anniRestanti, 1)), i.residuo);
            const mant = round2(rigaAnimale.get(`${i.rip.id}|${y}`)?.costo_mantenimento || 0);
            const contributo = round2(mant + quota);
            i.residuo = round2(Math.max(0, i.residuo - quota));
            if (i.rip.sesso === "M") costoPadri = round2(costoPadri + contributo); else costoMadri = round2(costoMadri + contributo);
            mantenimento = round2(mantenimento + mant); quotaResiduo = round2(quotaResiduo + quota);
            inCarriera++; if (!i.conteggioFigli[y]) senzaFigli++;
            i.contributi.push({ anno: y, mant, quota, contributo, anniRestanti, figliPropri: i.conteggioFigli[y] || 0 });
          }
          const nati = natiPerChiave.get(`${s}|${y}`) || [];
          const daMadri = round2(costoMadri + riporto[s].madri), daPadri = round2(costoPadri + riporto[s].padri);
          let perMadre = 0, perPadre = 0, riportato = 0;
          if (nati.length > 0) {
            perMadre = round2(daMadri / nati.length); perPadre = round2(daPadri / nati.length);
            riporto[s] = { madri: 0, padri: 0 };
          } else {
            riporto[s] = { madri: daMadri, padri: daPadri }; riportato = round2(daMadri + daPadri);
          }
          nati.forEach(r => costoNascitaCalcolato.set(r.id, { madre: perMadre, padre: perPadre }));
          if (inCarriera > 0 || nati.length > 0) {
            mandria.push({ specie: s, anno: y, riproduttori_in_carriera: inCarriera, riproduttori_senza_figli: senzaFigli,
              mantenimento_riproduttori: mantenimento, quota_residuo_riproduttori: quotaResiduo,
              costo_mandria: round2(mantenimento + quotaResiduo), riporto_anno_precedente: round2(daMadri + daPadri - mantenimento - quotaResiduo),
              nati: nati.length, costo_nascita_per_nato: round2(perMadre + perPadre), costo_per_nato_da_madri: perMadre, costo_per_nato_da_padri: perPadre,
              rinviato_anno_dopo: riportato });
          }
        }
      }
      // Riproduttori senza figli (ancora in crescita): residuo intero, nessun contributo
      info.filter(i => !i.haFigli).forEach(i => {
        i.partenza = partenzaDi(i);
        i.residuoTotale = calcolaResiduoIniziale({ costoAcquisto: i.partenza, costiCrescitaPreRiproduttiva: i.crescita, valoreRealizzoStimato: i.realizzo });
        i.residuo = i.residuoTotale;
      });

      // ── Scrittura ─────────────────────────────────────────────────────────────────────────
      // 1) Costo di nascita dei nati (solo dove cambia), e nell'app per i capi con matricola
      let figliAggiornati = 0, n = 0;
      const natiTutti = [...natiPerChiave.values()].flat();
      for (const r of natiTutti) {
        if (++n % 50 === 0) setAvanzamento(`Costo di nascita dei nati: ${n} di ${natiTutti.length}`);
        const c = costoNascitaCalcolato.get(r.id) || { madre: 0, padre: 0 };
        const nascita = round2(c.madre + c.padre);
        if (round2(r.costo_nascita_da_madre) !== c.madre || round2(r.costo_nascita_da_padre) !== c.padre || round2(r.costo_nascita_ereditato) !== nascita) {
          const { error } = await supabase.from("ci_costo_animale_annuale").update({
            costo_nascita_da_madre: c.madre, costo_nascita_da_padre: c.padre, costo_nascita_ereditato: nascita,
            costo_totale_anno: round2(r.costo_mantenimento + nascita + (r.quota_residuo_riproduttori || 0)),
          }).eq("id", r.id);
          if (error) throw new Error(error.message);
        }
        if (r.animale_id) {
          // Costo di nascita anche nella scheda dell'app (campo «costo iniziale», tipo «nascita»):
          // autorizzato dal Dott. Bizzarri il 03/10/2026, solo per i nati in azienda.
          const a = tutti.find(x => x.id === r.animale_id);
          if (a && (round2(parseFloat(a.costo_iniziale) || 0) !== nascita || a.tipo_costo_iniziale !== "nascita")) {
            const { error: eApp } = await supabase.from("animali").update({ costo_iniziale: nascita, tipo_costo_iniziale: "nascita" })
              .eq("id", a.id).eq("provenienza", "Nato in azienda");
            if (eApp) throw new Error(`Errore scrivendo il costo di nascita di ${nomeAnimale(a)} nell'app: ${eApp.message}`);
          }
        }
        figliAggiornati++;
      }

      // 2) Riproduttori: residuo, scarichi per anno, quota messa nella mandria sulla propria riga
      const usciti = [];
      let elaborati = 0;
      const perAnno = Object.fromEntries(mandria.map(m => [`${m.specie}|${m.anno}`, m]));
      for (const i of info) {
        elaborati++;
        setAvanzamento(`Riproduttore ${elaborati} di ${info.length} (${nomeAnimale(i.rip)})`);
        const valori = {
          specie: i.rip.specie, costo_acquisto: i.partenza, costi_crescita_preriproduttiva: i.crescita, valore_realizzo_stimato: i.realizzo,
          residuo_totale: i.residuoTotale, residuo_rimanente: i.residuo, vita_produttiva_attesa_anni: i.vita, vita_produttiva_personalizzata: i.personalizzata,
          anno_inizio_riproduzione: i.primo, conto_sospeso: 0, mantenimento_sospeso: 0, updated_at: new Date().toISOString(),
        };
        let residuoId = i.rec?.id;
        if (residuoId) {
          const { error } = await supabase.from("ci_residuo_riproduttore").update(valori).eq("id", residuoId);
          if (error) throw new Error(`Errore aggiornando ${nomeAnimale(i.rip)}: ${error.message}`);
        } else {
          const { data: nuovo, error } = await supabase.from("ci_residuo_riproduttore").insert([{ animale_id: i.rip.id, ...valori }]).select().single();
          if (error) throw new Error(`Errore creando il residuo di ${nomeAnimale(i.rip)}: ${error.message}`);
          residuoId = nuovo.id;
        }
        const { error: eDel } = await supabase.from("ci_scarico_riproduttore_annuale").delete().eq("residuo_riproduttore_id", residuoId);
        if (eDel) throw new Error(eDel.message);
        if (i.contributi.length) {
          const { error: eIns } = await supabase.from("ci_scarico_riproduttore_annuale").insert(i.contributi.map(c => ({
            residuo_riproduttore_id: residuoId, anno: c.anno, quota_annuale_dovuta: c.contributo, conto_sospeso_utilizzato: 0,
            totale_scaricato_anno: c.contributo, n_figli_anno: c.figliPropri,
            quota_per_figlio: perAnno[`${i.rip.specie}|${c.anno}`]?.costo_nascita_per_nato || 0,
          })));
          if (eIns) throw new Error(eIns.message);
        }
        const contributoAnno = Object.fromEntries(i.contributi.map(c => [c.anno, c.contributo]));
        for (const r of righe.filter(r => r.animale_id === i.rip.id)) {
          const v = contributoAnno[r.anno] || 0;
          if (round2(r.quota_scaricata_su_figli) !== v) await supabase.from("ci_costo_animale_annuale").update({ quota_scaricata_su_figli: v }).eq("id", r.id);
        }
        if (i.uscito) usciti.push({ rip: i.rip, residuoId, residuo: i.residuo, annoUscita: i.annoUscita, dataUscita: i.dataUscita,
          figli: i.haFigli ? i.figli : [], unitaFiglie: i.haFigli ? i.unitaFiglie : [],
          realizzoStimato: round2(Math.min(i.realizzo, i.partenza + i.crescita)), realizzoReale: realeDi(i.rip, i.rec || {}) });
      }

      // 3) Riepilogo della mandria per anno
      {
        const { error: eDel } = await supabase.from("ci_costo_nascita_mandria").delete().gte("anno", 0);
        if (eDel) throw new Error(eDel.message);
        if (mandria.length) {
          const { error: eIns } = await supabase.from("ci_costo_nascita_mandria").insert(mandria);
          if (eIns) throw new Error(eIns.message);
        }
      }

      setAvanzamento("Costo rimasto dei riproduttori usciti");
      const esitoUscite = await distribuisciResiduiUscita({ usciti, tuttiAnimali: tutti, tutteUnita: tutteUnita || [], mappaLottiPerId });

      alert(`✓ Calcolo fatto fino al ${anno}: ${elaborati} riproduttori, costo di nascita assegnato a ${figliAggiornati} nati.` +
        (natiSenzaRiga ? `\n⚠️ ${natiSenzaRiga} nati non hanno ancora il costo dell'anno di nascita (rifare prima il Report Costi di quell'anno): non hanno ricevuto il costo di nascita.` : "") +
        esitoUscite);
      await caricaMandria();
      caricaElenco();
    } catch (err) {
      alert(`⚠️ Errore nell'elaborazione:\n\n${err.message}`);
    }
    setElaborando(false);
    setAvanzamento(null);
  }

  function esporta() {
    const righeExcel = riproduttori.map(r => ({
      "BDN/Nome": r.animali?.bdn || r.animali?.nome, "Specie": r.specie, "Stato": r.animali?.stato,
      "Costo acquisto": numeroExcel(r.costo_acquisto), "Costi crescita pre-riproduttiva": numeroExcel(r.costi_crescita_preriproduttiva),
      "Valore realizzo stimato": numeroExcel(r.valore_realizzo_stimato), "Eccedenza di realizzo non usata": numeroExcel(eccedenzaRealizzo(r)), "Residuo totale": numeroExcel(r.residuo_totale),
      "Residuo rimanente": numeroExcel(r.residuo_rimanente),
      "Vita produttiva attesa (anni)": r.vita_produttiva_attesa_anni,
      "Vita produttiva: standard o personalizzata": r.vita_produttiva_personalizzata ? `Personalizzata (standard ${vitaStandardDi(parametri, r.specie) ?? "—"})` : "Standard",
      "Anno inizio riproduzione": r.anno_inizio_riproduzione,
      "Costo rimasto all'uscita (prima del conguaglio)": numeroExcel(r.residuo_all_uscita), "Anno di uscita": r.residuo_uscita_anno,
      "Dove è andato il costo rimasto": r.residuo_uscita_destinazione || "",
      "Valore di realizzo reale": numeroExcel(r.valore_realizzo_reale), "Come è calcolato il realizzo reale": r.realizzo_reale_fonte || "",
      "Conguaglio (stima meno reale)": numeroExcel(r.conguaglio_uscita), "Totale passato all'uscita": r.residuo_uscita_anno != null ? numeroExcel(round2((r.residuo_all_uscita || 0) + (r.conguaglio_uscita || 0))) : "",
    }));
    const righeMandria = (mandria || []).map(m => ({
      "Specie": ETICHETTE_SPECIE[m.specie] || m.specie, "Anno": m.anno, "Riproduttori in carriera": m.riproduttori_in_carriera,
      "Di cui senza figli nell'anno": m.riproduttori_senza_figli, "Mantenimento dei riproduttori": numeroExcel(m.mantenimento_riproduttori),
      "Quota annua del costo iniziale dei riproduttori": numeroExcel(m.quota_residuo_riproduttori), "Rinviato dall'anno prima": numeroExcel(m.riporto_anno_precedente),
      "Nati nell'anno": m.nati, "Costo di nascita di ogni nato": numeroExcel(m.costo_nascita_per_nato),
      "Di cui dalle madri": numeroExcel(m.costo_per_nato_da_madri), "Di cui dai padri": numeroExcel(m.costo_per_nato_da_padri),
      "Rinviato all'anno dopo (nessun nato)": numeroExcel(m.rinviato_anno_dopo),
    }));
    esportaExcel("ReportRiproduttori", [{ nome: "Costo di nascita per anno", righe: righeMandria }, { nome: "Riproduttori", righe: righeExcel }]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Report Riproduttori</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Ogni anno il costo della mandria (mantenimento dei riproduttori in carriera + quota annua del loro costo iniziale: partenza + crescita − realizzo, diviso sugli anni di carriera) si divide tra tutti i nati dell'anno della stessa specie. Quando il riproduttore esce, il costo rimasto va ai suoi figli ancora in vita o, se non ce ne sono, a tutti gli animali della specie presenti in azienda (colonna «Costo rimasto all'uscita»). Spiegazione completa con esempi in Istruzioni → Animali.
      </p>

      <div style={{ background: "#FFF9E6", border: `1.5px solid ${C.accent}`, borderRadius: 10, padding: 12, marginBottom: 20, fontSize: 12, color: C.text }}>
        ⚠️ Esegui prima "Report Costi" per gli anni da elaborare (e salvali) — questo passaggio aggiorna il costo di nascita dei figli che hanno già una riga di costo. Valore di realizzo stimato = peso medio della carcassa dei capi adulti usciti (stessa specie, razza e sesso, con almeno {parametri?.eta_minima_calcolo_peso_storico || 3} anni) × prezzo di riforma al kg di carcassa della specie (Parametri; di partenza 7 € bovini, 5 € suini, 3 € ovini). Se supera costo di partenza + crescita, l'eccedenza non riduce il costo dei figli ed è evidenziata in giallo nella colonna «Eccedenza di realizzo non usata».
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Fino all'anno (incluso)</label>
            <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
              style={{ padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, width: 100 }} />
          </div>
          <button onClick={elabora} disabled={elaborando}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {elaborando ? "Elaborazione..." : "🐄 Calcola e scarica sui figli"}
          </button>
          {elaborando && avanzamento && (
            <div style={{ fontSize: 12, color: C.accent, fontWeight: 700 }}>
              ⏳ {avanzamento} — non chiudere né cambiare pagina fino al messaggio finale
            </div>
          )}
        </div>
      </div>

      {mandria && mandria.length > 0 && <TabellaMandria mandria={mandria} />}

      {riproduttori && riproduttori.length > 0 && (
        <button onClick={esporta}
          style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 16, display: "block" }}>
          📥 Esporta Excel
        </button>
      )}

      {riproduttori && riproduttori.length > 0 && (
        <TabellaRiproduttoriRaggruppata riproduttori={riproduttori}
          provenienzeEspanse={provenienzeEspanse} toggleProvenienza={toggleProvenienza}
          specieEspanse={specieEspanse} toggleSpecie={toggleSpecie}
          parametri={parametri} onSelezionaAnimale={id => setAnimaleSelezionato(id)} />
      )}
      {riproduttori && riproduttori.length === 0 && (
        <p style={{ color: C.muted }}>Nessun riproduttore ancora elaborato — usa "Calcola e scarica sui figli".</p>
      )}
      {animaleSelezionato && (
        <SchedaRiproduttore animaleId={animaleSelezionato} onClose={() => setAnimaleSelezionato(null)} onSalvato={caricaElenco} />
      )}
    </div>
  );
}

const ETICHETTE_SPECIE = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };

// Costo di nascita per anno, calcolato sulla mandria: è il dato di gestione principale
function TabellaMandria({ mandria }) {
  const [specie, setSpecie] = useState("bovino");
  const righe = mandria.filter(m => m.specie === specie);
  const presenti = ["bovino", "suino", "ovino"].filter(s => mandria.some(m => m.specie === s));
  const destra = { ...td, textAlign: "right" };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 4 }}>COSTO DI NASCITA PER ANNO (CALCOLATO SULLA MANDRIA)</div>
      <p style={{ fontSize: 12, color: C.muted, marginTop: 0 }}>
        Costo della mandria = mantenimento dei riproduttori in carriera + quota annua del loro costo iniziale. Diviso per i nati dell'anno: ogni nato della stessa specie e dello stesso anno ha lo stesso costo di nascita.
      </p>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {presenti.map(s => (
          <button key={s} onClick={() => setSpecie(s)}
            style={{ padding: "5px 14px", borderRadius: 6, border: `1.5px solid ${C.primary}`, background: specie === s ? C.primary : "#fff", color: specie === s ? "#fff" : C.primary, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            {ETICHETTE_SPECIE[s]}
          </button>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead style={{ background: C.primaryLight, color: "#fff" }}>
            <tr>
              <th style={th}>Anno</th><th style={th}>Riproduttori in carriera</th><th style={th}>Di cui senza figli nell'anno</th>
              <th style={th}>Mantenimento dei riproduttori</th><th style={th}>Quota annua del costo iniziale</th><th style={th}>Rinviato dall'anno prima</th>
              <th style={th}>Nati nell'anno</th><th style={th}>Costo di nascita di ogni nato</th><th style={th}>Di cui dalle madri</th><th style={th}>Di cui dai padri</th>
            </tr>
          </thead>
          <tbody>
            {righe.map(m => (
              <tr key={m.anno} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...td, fontWeight: 700 }}>{m.anno}</td>
                <td style={destra}>{m.riproduttori_in_carriera}</td>
                <td style={{ ...destra, color: m.riproduttori_senza_figli ? C.accent : C.muted, fontWeight: m.riproduttori_senza_figli ? 700 : 400 }}>{m.riproduttori_senza_figli}</td>
                <td style={destra}>{formattaEuro(m.mantenimento_riproduttori)}</td>
                <td style={destra}>{formattaEuro(m.quota_residuo_riproduttori)}</td>
                <td style={destra}>{m.riporto_anno_precedente ? formattaEuro(m.riporto_anno_precedente) : "—"}</td>
                <td style={destra}>{m.nati}{m.rinviato_anno_dopo ? <div style={{ fontSize: 10, color: C.accent }}>nessun nato: {formattaEuro(m.rinviato_anno_dopo)} rinviati all'anno dopo</div> : null}</td>
                <td style={{ ...destra, fontWeight: 700, fontSize: 13 }}>{m.nati ? formattaEuro(m.costo_nascita_per_nato) : "—"}</td>
                <td style={destra}>{m.nati ? formattaEuro(m.costo_per_nato_da_madri) : "—"}</td>
                <td style={destra}>{m.nati ? formattaEuro(m.costo_per_nato_da_padri) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function vitaStandardDi(parametri, specie) {
  const v = parametri?.[`vita_produttiva_attesa_${NOMI_SPECIE[specie] || specie}`];
  return Number.isFinite(v) ? v : null;
}

function TabellaRiproduttoriRaggruppata({ riproduttori, parametri, provenienzeEspanse, toggleProvenienza, specieEspanse, toggleSpecie, onSelezionaAnimale }) {
  const gruppiProvenienza = [
    { chiave: "Acquistato", label: "Acquistati" },
    { chiave: "Nato in azienda", label: "Nati in azienda" },
  ];

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      {gruppiProvenienza.map(gp => {
        const righeProvenienza = riproduttori.filter(r => (r.animali?.provenienza || "Acquistato") === gp.chiave);
        if (righeProvenienza.length === 0) return null;
        const provenienzaAperta = provenienzeEspanse.has(gp.chiave);
        return (
          <div key={gp.chiave}>
            <div onClick={() => toggleProvenienza(gp.chiave)}
              style={{ padding: "12px 16px", background: C.primary, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
              <span>{provenienzaAperta ? "▼" : "▶"} {gp.label}</span>
              <span style={{ fontWeight: 400, fontSize: 12 }}>{righeProvenienza.length} riproduttori</span>
            </div>
            {provenienzaAperta && ["bovino", "suino", "ovino"].map(specie => {
              const righeSpecie = righeProvenienza.filter(r => r.specie === specie);
              if (righeSpecie.length === 0) return null;
              const chiaveSpecie = `${gp.chiave}|${specie}`;
              const specieAperta = specieEspanse.has(chiaveSpecie);
              return (
                <div key={specie}>
                  <div onClick={() => toggleSpecie(chiaveSpecie)}
                    style={{ padding: "9px 16px 9px 32px", background: C.bg, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.border}` }}>
                    <span>{specieAperta ? "▼" : "▶"} {ETICHETTE_SPECIE[specie]}</span>
                    <span style={{ fontWeight: 400, fontSize: 12, color: C.muted }}>{righeSpecie.length}</span>
                  </div>
                  {specieAperta && (
                    <table style={{ width: "100%", fontSize: 13 }}>
                      <thead style={{ background: C.primaryLight, color: "#fff" }}>
                        <tr>
                          <th style={th}>Riproduttore</th>
                          <th style={th}>Residuo totale</th><th style={th}>Residuo rimanente</th>
                          <th style={th}>Vita attesa (anni)</th><th style={th}>Valore realizzo stimato</th><th style={th}>Eccedenza di realizzo non usata</th><th style={th}>Costo rimasto all'uscita</th><th style={th}>Stato</th>
                        </tr>
                      </thead>
                      <tbody>
                        {righeSpecie.map(r => (
                          <tr key={r.id} onClick={() => onSelezionaAnimale(r.animale_id)} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}>
                            <td style={td}>{r.animali?.bdn || r.animali?.nome || "—"}
                              {r.riproduttoreDaiParti && <div style={{ fontSize: 10, fontWeight: 700, color: "#8A6D00", background: "#FFF3CD", borderRadius: 4, padding: "1px 4px", marginTop: 2 }}>dai parti registrati: nell'app manca il segno «riproduttore»</div>}
                            </td>
                            <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.residuo_totale)}</td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(r.residuo_rimanente)}</td>
                            <td style={{ ...td, textAlign: "right" }}>
                              {r.vita_produttiva_attesa_anni}
                              <div style={{ fontSize: 10, color: r.vita_produttiva_personalizzata ? C.accent : C.muted, fontWeight: r.vita_produttiva_personalizzata ? 700 : 400 }}>
                                {r.vita_produttiva_personalizzata ? `personalizzata (standard ${vitaStandardDi(parametri, r.specie) ?? "—"})` : "standard"}
                              </div>
                            </td>
                            <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.valore_realizzo_stimato)}</td>
                            <td style={{ ...td, textAlign: "right", ...(eccedenzaRealizzo(r) > 0 ? { background: "#FFF3CD", color: C.accent, fontWeight: 700 } : { color: C.muted }) }}
                              title="Parte del valore di realizzo stimato che supera costo di partenza + crescita: non riduce il costo passato ai figli (si lascia perdere, come deciso)">
                              {eccedenzaRealizzo(r) > 0 ? `⚠️ ${formattaEuro(eccedenzaRealizzo(r))}` : "—"}</td>
                            <td style={{ ...td, textAlign: "right", ...(r.residuo_uscita_anno != null ? { background: "#FDE2D3", color: "#A0440E", fontWeight: 700 } : { color: C.muted }) }}
                              title={r.residuo_uscita_destinazione || "Riproduttore non uscito (o uscito dopo l'anno elaborato)"}>
                              {r.residuo_uscita_anno != null ? `🔶 ${formattaEuro(round2((r.residuo_all_uscita || 0) + (r.conguaglio_uscita || 0)))}` : "—"}
                              {r.residuo_uscita_anno != null && (
                                <div style={{ fontSize: 11, fontWeight: 400, textAlign: "left", minWidth: 200 }}>
                                  → {r.residuo_uscita_destinazione}
                                  <div style={{ fontSize: 10, color: C.muted }}>dettaglio nella scheda</div>
                                </div>
                              )}
                            </td>
                            <td style={td}>
                              {r.animali?.stato && r.animali.stato !== "attivo"
                                ? (r.residuo_uscita_anno != null ? <span style={{ color: C.green, fontWeight: 700 }}>Uscito nel {r.residuo_uscita_anno} — costo rimasto passato</span> : <span style={{ color: C.accent, fontWeight: 700 }}>Uscito — da elaborare</span>)
                                : <span style={{ color: C.muted }}>Attivo</span>}
                              {eTrasferito(r.animali?.stato) && <BadgeTrasferito fonte={r.realizzo_reale_fonte} />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Uscita per trasferimento evidenziata: venduto con fattura, oppure scambio (o fattura mancante)
function BadgeTrasferito({ fonte }) {
  const venduto = String(fonte || "").startsWith("venduto");
  return (
    <div title={fonte || ""} style={{ marginTop: 4, padding: "3px 6px", borderRadius: 6, fontSize: 11, fontWeight: 700,
      background: venduto ? "#E3F1E4" : "#FDE2D3", color: venduto ? C.green : "#A0440E" }}>
      {venduto ? "Trasferito e venduto: incasso dalla fattura" : "Trasferito senza fattura di vendita: scambio o fattura mancante"}
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700 };
const td = { padding: "6px 10px", fontSize: 12 };
