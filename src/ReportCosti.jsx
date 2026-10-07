import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { calcolaReportUba } from "./motoreUba";
import { numerizzaCampi, round2, formattaEuro, formattaNumero, fetchAllPages, leggiInBlocchi } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { caricaRipartizioneLavoro, applicaRipartizioneLavoro } from "./ripartizioneLavoro";
import { confermaRicalcoloConAnomalie } from "./controlliRegistri";
import { chiaveQuotaCespite, eLavorazioneCarni } from "./calcoloReportCosti";

// Mappa tra il nome specie usato nel motore UBA (minuscolo) e quello usato come
// Destinazione sulle fatture / Imputazione sui cespiti (maiuscolo, italiano)
const MAPPA_SPECIE = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };
// Specie senza fasce UBA: i loro costi diretti restano un dato a sé, MAI dentro i Generali
// (che si ripartiscono solo su Bovini/Suini/Ovini in base agli UBA-giorni)
const SPECIE_SENZA_UBA = ["Pollame", "Cavalli"];
// Versione 236 (anomalia 11, approvata il 07/10/2026 ore 21:38): colonne delle spese intestate a due specie,
// prima incluse nel totale ma non mostrate (le colonne non tornavano)
const QUOTE_COPPIE = [
  { campo: "quotaBovinoOvinoSpecie", etichetta: "Quota Bovini e Ovini" },
  { campo: "quotaBovinoSuinoSpecie", etichetta: "Quota Bovini e Suini" },
  { campo: "quotaSuinoOvinoSpecie", etichetta: "Quota Suini e Ovini" },
];
// Orto è un'AREA (non una Destinazione, che riguarda solo le specie animali) — va riconosciuto
// e separato in base al campo area, non destinazione
const AREA_ORTO = "Orto";
// Animali non d'allevamento: si riconosce SIA per Area SIA per Destinazione (qualunque delle
// due basta), per non perderne nessuno — se solo l'Area corrisponde ma la Destinazione non
// specifica quale animale, finisce in un bucket "non specificato" a parte
const AREA_ANIMALI_NON_ALLEVAMENTO = "Animali non d'allevamento";

export default function ReportCosti({ anno }) {
  const [calcolando, setCalcolando] = useState(false);
  const [risultato, setRisultato] = useState(null);
  const [salvando, setSalvando] = useState(false);
  // Versione 236: se si cambia l'anno, il calcolo fatto per l'anno precedente sparisce dallo schermo,
  // così non si può salvare il calcolo di un anno sopra un altro anno.
  useEffect(() => { setRisultato(null); }, [anno]);

  async function calcola() {
    setCalcolando(true);
    setRisultato(null);
    try {
      const [{ data: animali, error: eA }, { data: lotti, error: eL }, { data: suiniLotto, error: eS }] = await Promise.all([
        fetchAllPages((da, a) => supabase.from("animali").select("id,bdn,nome,specie,sesso,nascita,stato,data_uscita,motivo_uscita,data_ingresso,provenienza,razza,riproduttore,madre_id,padre_id").range(da, a)),
        fetchAllPages((da, a) => supabase.from("lotti_suini").select("*").range(da, a)),
        fetchAllPages((da, a) => supabase.from("suini_lotto").select("*").range(da, a)),
      ]);
      if (eA || eL || eS) throw new Error((eA || eL || eS).message);

      const righeUba = calcolaReportUba(animali || [], lotti || [], suiniLotto || [], anno);
      if (righeUba.length === 0) {
        alert(`Nessun animale presente nell'anno ${anno}. Verifica prima con "Report UBA".`);
        setCalcolando(false);
        return;
      }

      // Costi ordinari dell'anno (Fisso + Variabile), CON la destinazione (per separare diretti/generali)
      const { data: fattureAnno, error: eF } = await fetchAllPages((da, a) => supabase
        .from("ci_fatture").select("id, data").eq("tipo", "PASSIVA")
        .gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`).order("id").range(da, a));
      if (eF) throw new Error(eF.message);
      const idFattureAnno = (fattureAnno || []).map(f => f.id);

      let articoliAnno = [];
      if (idFattureAnno.length > 0) {
        const { data: articoli, error: eArt } = await leggiInBlocchi(idFattureAnno, (blocco, da, a) => supabase
          .from("ci_articoli_fattura").select("totale_riga, tipo_costo, destinazione, area, centro_costo")
          .in("fattura_id", blocco).in("tipo_costo", ["Fisso", "Variabile"]).order("id").range(da, a));
        if (eArt) throw new Error(eArt.message);
        articoliAnno = numerizzaCampi(articoli || [], ["totale_riga"]);
      }

      // Costi Diretti (es. costo del lavoro) — inseriti a mano, senza passare da una fattura,
      // ma vanno sommati insieme alle righe da fattura per non sparire dal report.
      const { data: costiDiretti, error: eCD } = await fetchAllPages((da, a) => supabase
        .from("ci_costi_diretti").select("importo, tipo_costo, destinazione, area, centro_costo")
        .gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`).range(da, a));
      if (eCD) throw new Error(eCD.message);
      articoliAnno = articoliAnno.concat(numerizzaCampi(costiDiretti || [], ["importo"]).map(c => ({ ...c, totale_riga: c.importo })));
      // Costo del lavoro diviso tra le attività secondo le percentuali dell'anno (Parametri)
      articoliAnno = applicaRipartizioneLavoro(articoliAnno, await caricaRipartizioneLavoro(anno));
      const costiOrdinari = articoliAnno.reduce((s, r) => s + (r.totale_riga || 0), 0);

      // Quote di ammortamento dell'anno, CON la specie di imputazione del cespite
      const { data: cespiti, error: eC } = await fetchAllPages((da, a) => supabase.from("ci_cespiti").select("id, specie").order("id").range(da, a));
      if (eC) throw new Error(eC.message);
      const mappaCespiteSpecie = new Map((cespiti || []).map(c => [c.id, c.specie || []]));
      const idCespitiValidi = (cespiti || []).filter(c => c.specie && c.specie.length > 0).map(c => c.id);

      let quoteAnno = [];
      if (idCespitiValidi.length > 0) {
        const validi = new Set(idCespitiValidi);
        const { data: quote, error: eQ } = await fetchAllPages((da, a) => supabase
          .from("ci_cespiti_ammortamento").select("quota, cespite_id").eq("anno", anno).order("id").range(da, a));
        if (eQ) throw new Error(eQ.message);
        quoteAnno = numerizzaCampi((quote || []).filter(q => validi.has(q.cespite_id)), ["quota"]);
      }
      const costoAmmortamenti = quoteAnno.reduce((s, r) => s + (r.quota || 0), 0);

      const costiTotali = round2(costiOrdinari + costoAmmortamenti);
      // NOTA: valore di riforma reale non ancora tracciato per gli animali ordinari (solo per
      // i riproduttori, in Report Riproduttori). Per ora V(t)=0 qui — semplificazione dichiarata.
      const valoreRiformaTotale = 0;

      // --- Separazione costi DIRETTI per specie vs GENERALI ---
      const ubaGiorniTotaliAzienda = righeUba.reduce((s, r) => s + r.uba_giorni, 0);
      const ubaGiorniProduttiviAzienda = righeUba.filter(r => r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);

      let costiGenerali = 0;
      let costiBovinoOvino = 0;
      let costiBovinoSuino = 0;
      let costiSuinoOvino = 0;
      const costiDirettiPerSpecie = { bovino: 0, suino: 0, ovino: 0 };
      const costiAltreSpecie = { "Macello e lavorazione delle carni": 0, Pollame: 0, Cavalli: 0, Orto: 0, "Animali non d'allevamento (non specificato)": 0, "Cespiti con imputazione da correggere": 0 };

      articoliAnno.forEach(r => {
        const dest = (r.destinazione || "").trim();
        const area = (r.area || "").trim();
        // Versione 236 (decisione del 07/10/2026 ore 22:00): macello e lavorazione delle carni fuori dal costo degli animali
        if (eLavorazioneCarni(r)) { costiAltreSpecie["Macello e lavorazione delle carni"] += (r.totale_riga || 0); return; }
        if (area === AREA_ORTO) { costiAltreSpecie.Orto += (r.totale_riga || 0); return; }
        if (SPECIE_SENZA_UBA.includes(dest)) { costiAltreSpecie[dest] += (r.totale_riga || 0); return; }
        if (area === AREA_ANIMALI_NON_ALLEVAMENTO) { costiAltreSpecie["Animali non d'allevamento (non specificato)"] += (r.totale_riga || 0); return; }
        if (dest === "Bovini e Ovini") { costiBovinoOvino += (r.totale_riga || 0); return; }
        if (dest === "Bovini e Suini") { costiBovinoSuino += (r.totale_riga || 0); return; }
        if (dest === "Suini e Ovini") { costiSuinoOvino += (r.totale_riga || 0); return; }
        const specieMatch = Object.entries(MAPPA_SPECIE).find(([, v]) => v === dest);
        if (specieMatch) costiDirettiPerSpecie[specieMatch[0]] += (r.totale_riga || 0);
        else costiGenerali += (r.totale_riga || 0); // Generali, vuoto, o non riconosciuto -> generale
      });
      // Versione 236 (decisioni del 07/10/2026 ore 21:01 e 21:04): stessa regola di tutte le viste
      // (chiaveQuotaCespite). L'Orto non entra mai nel costo degli animali; un'imputazione non
      // riconosciuta va a parte «da correggere» (prima finiva nei generali); un cespite di due specie si
      // divide tra le due (prima andava tutto alla prima specie dell'elenco).
      quoteAnno.forEach(r => {
        const k = chiaveQuotaCespite(mappaCespiteSpecie.get(r.cespite_id));
        const q = r.quota || 0;
        if (k === "bovino" || k === "suino" || k === "ovino") costiDirettiPerSpecie[k] += q;
        else if (k === "bovinoOvino") costiBovinoOvino += q;
        else if (k === "bovinoSuino") costiBovinoSuino += q;
        else if (k === "suinoOvino") costiSuinoOvino += q;
        else if (k === "generale") costiGenerali += q;
        else if (k === "Cavalli" || k === "Pollame" || k === "Orto") costiAltreSpecie[k] += q;
        else if (k === "daCorreggere") costiAltreSpecie["Cespiti con imputazione da correggere"] += q;
      });

      // Tasso dei costi Generali: formula aggressiva a livello aziendale (esclude tutti gli
      // improduttivi dal divisore), poi ripartito a ogni specie in proporzione ai suoi UBA-giorni
      const ubaGiorniImproduttiviAzienda = righeUba.filter(r => r.categoria_contabile === "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);
      const tassoGenerali = ubaGiorniProduttiviAzienda > 0 ? (costiGenerali - valoreRiformaTotale) / ubaGiorniProduttiviAzienda : 0;

      // "Bovini e Ovini" — pool misto (es. Foraggio: i suini non se ne cibano mai) —
      // si ripartisce SOLO tra bovino e ovino, in proporzione ai loro UBA-giorni produttivi;
      // il denominatore esclude del tutto i suini.
      const ubaGiorniProduttiviBovino = righeUba.filter(r => r.specie === "bovino" && r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);
      const ubaGiorniProduttiviSuino = righeUba.filter(r => r.specie === "suino" && r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);
      const ubaGiorniProduttiviOvino = righeUba.filter(r => r.specie === "ovino" && r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);
      const ubaGiorniProduttiviBovinoOvino = ubaGiorniProduttiviBovino + ubaGiorniProduttiviOvino;
      const tassoBovinoOvino = ubaGiorniProduttiviBovinoOvino > 0 ? costiBovinoOvino / ubaGiorniProduttiviBovinoOvino : 0;
      const ubaGiorniProduttiviBovinoSuino = ubaGiorniProduttiviBovino + ubaGiorniProduttiviSuino;
      const tassoBovinoSuino = ubaGiorniProduttiviBovinoSuino > 0 ? costiBovinoSuino / ubaGiorniProduttiviBovinoSuino : 0;
      const ubaGiorniProduttiviSuinoOvino = ubaGiorniProduttiviSuino + ubaGiorniProduttiviOvino;
      const tassoSuinoOvino = ubaGiorniProduttiviSuinoOvino > 0 ? costiSuinoOvino / ubaGiorniProduttiviSuinoOvino : 0;

      const perSpecie = ["bovino", "suino", "ovino"].map(sp => {
        const righeSp = righeUba.filter(r => r.specie === sp);
        if (righeSp.length === 0) return null;
        const ubaGiorniSp = righeSp.reduce((s, r) => s + r.uba_giorni, 0);
        const ubaGiorniSpProduttivi = righeSp.filter(r => r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);

        // Costi diretti di questa specie: formula aggressiva DENTRO la specie stessa
        // (i suoi improduttivi si spalmano sui suoi produttivi, non su altre specie)
        const costoDirettoSpecie = costiDirettiPerSpecie[sp] || 0;
        const tassoDirettoSpecie = ubaGiorniSpProduttivi > 0 ? costoDirettoSpecie / ubaGiorniSpProduttivi : 0;

        const quotaGeneraliSpecie = round2(tassoGenerali * ubaGiorniSpProduttivi);
        const quotaBovinoOvinoSpecie = sp !== "suino" ? round2(tassoBovinoOvino * ubaGiorniSpProduttivi) : 0;
        const quotaBovinoSuinoSpecie = sp !== "ovino" ? round2(tassoBovinoSuino * ubaGiorniSpProduttivi) : 0;
        const quotaSuinoOvinoSpecie = sp !== "bovino" ? round2(tassoSuinoOvino * ubaGiorniSpProduttivi) : 0;
        const costoAllocatoTotale = round2(costoDirettoSpecie + quotaGeneraliSpecie + quotaBovinoOvinoSpecie + quotaBovinoSuinoSpecie + quotaSuinoOvinoSpecie);
        const incidenzaUbaGiorno = ubaGiorniSpProduttivi > 0 ? costoAllocatoTotale / ubaGiorniSpProduttivi : 0;

        return {
          specie: sp,
          percentualeSulTotale: ubaGiorniTotaliAzienda > 0 ? (ubaGiorniSp / ubaGiorniTotaliAzienda * 100) : 0,
          costoDirettoSpecie: round2(costoDirettoSpecie),
          quotaGeneraliSpecie, quotaBovinoOvinoSpecie, quotaBovinoSuinoSpecie, quotaSuinoOvinoSpecie,
          costoAllocatoTotale,
          ubaGiorniSpProduttivi: round2(ubaGiorniSpProduttivi),
          incidenzaUbaGiorno: Math.round(incidenzaUbaGiorno * 1000000) / 1000000,
        };
      }).filter(Boolean);

      // Tasso aziendale complessivo (per il riepilogo in alto — resta utile come vista d'insieme)
      const tassoSemplice = ubaGiorniTotaliAzienda > 0 ? (costiTotali - valoreRiformaTotale) / ubaGiorniTotaliAzienda : 0;
      const tassoRettificatoAziendale = ubaGiorniProduttiviAzienda > 0 ? (costiTotali - valoreRiformaTotale) / ubaGiorniProduttiviAzienda : 0;
      const perditaSpalmata = round2((tassoRettificatoAziendale - tassoSemplice) * ubaGiorniProduttiviAzienda);
      const tasso = {
        tassoSemplice: Math.round(tassoSemplice * 1000000) / 1000000,
        tassoRettificato: Math.round(tassoRettificatoAziendale * 1000000) / 1000000,
        perditaSpalmata,
        ubaGiorniProduttivi: round2(ubaGiorniProduttiviAzienda),
        ubaGiorniImproduttivi: round2(ubaGiorniImproduttiviAzienda),
      };

      // Costo per ogni animale/unità: usa il tasso SPECIFICO della sua specie (incidenzaUbaGiorno),
      // coerente con l'allocazione per specie qui sopra — non più il tasso aziendale unico.
      const mappaIncidenzaPerSpecie = new Map(perSpecie.map(p => [p.specie, p.incidenzaUbaGiorno]));
      const costoPerAnimale = righeUba.map(r => {
        const tassoSpecie = mappaIncidenzaPerSpecie.get(r.specie) ?? tasso.tassoRettificato;
        // Animale uscito senza ricavo (morto): il suo costo dell'anno è già dentro il tasso dei
        // capi rimasti (che si dividono i costi solo tra i produttivi), quindi qui vale 0 —
        // altrimenti sarebbe contato due volte (corretto il 03/10/2026 su richiesta del Dott. Bizzarri).
        if (r.categoria_contabile === "IMPRODUTTIVO_USCITO") return { ...r, costo_mantenimento: 0 };
        return { ...r, costo_mantenimento: round2(r.uba_giorni * tassoSpecie) };
      });

      setRisultato({ anno, costiOrdinari, costoAmmortamenti, costiTotali, valoreRiformaTotale, tasso, perSpecie, costoPerAnimale, righeUba, costiAltreSpecie });
    } catch (err) {
      alert(`⚠️ Errore nel calcolo:\n\n${err.message}`);
    }
    setCalcolando(false);
  }

  function esporta() {
    const rigaRiepilogo = [{
      "Anno": anno,
      "Costi ordinari": numeroExcel(risultato.costiOrdinari),
      "Quote ammortamento": numeroExcel(risultato.costoAmmortamenti),
      "Costi totali": numeroExcel(risultato.costiTotali),
      "UBA-giorni produttivi": numeroExcel(risultato.tasso.ubaGiorniProduttivi),
      "UBA-giorni improduttivi": numeroExcel(risultato.tasso.ubaGiorniImproduttivi),
      "Tasso semplice €/UBA-gg": numeroExcel(risultato.tasso.tassoSemplice),
      "Perdita spalmata": numeroExcel(risultato.tasso.perditaSpalmata),
      "Tasso rettificato €/UBA-gg": numeroExcel(risultato.tasso.tassoRettificato),
    }];
    const righePerSpecie = risultato.perSpecie.map(r => ({
      "Specie": r.specie, "% sul totale UBA-giorni": numeroExcel(r.percentualeSulTotale),
      "Costi diretti": numeroExcel(r.costoDirettoSpecie), "Quota Generali": numeroExcel(r.quotaGeneraliSpecie),
      "Quota Bovini e Ovini": numeroExcel(r.quotaBovinoOvinoSpecie), "Quota Bovini e Suini": numeroExcel(r.quotaBovinoSuinoSpecie), "Quota Suini e Ovini": numeroExcel(r.quotaSuinoOvinoSpecie),
      "Costo allocato": numeroExcel(r.costoAllocatoTotale), "€/UBA-gg": numeroExcel(r.incidenzaUbaGiorno),
    }));
    const righeAltreSpecie = Object.entries(risultato.costiAltreSpecie)
      .filter(([, v]) => v > 0)
      .map(([nome, v]) => ({ "Voce": nome, "Costo diretto": numeroExcel(v), "€/UBA-gg (su animali allevamento)": numeroExcel(risultato.tasso.ubaGiorniProduttivi > 0 ? v / risultato.tasso.ubaGiorniProduttivi : 0) }));

    esportaExcel(`ReportCosti_Aggregato_${anno}`, [
      { nome: "Riepilogo", righe: rigaRiepilogo },
      { nome: "Per Specie", righe: righePerSpecie },
      { nome: "Altre Specie e Orto", righe: righeAltreSpecie },
    ]);
  }

  async function salvaRisultato() {
    if (!risultato) return;
    const anno = risultato.anno; // l'anno per cui è stato fatto il calcolo, non quello scritto nel campo
    if (!(await confermaRicalcoloConAnomalie())) return;
    if (!window.confirm(`Salvare il costo calcolato per ${risultato.costoPerAnimale.length} animali/unità per l'anno ${anno}?\n\nSostituirà i dati già salvati per questo anno.\n\nDopo il salvataggio va rifatta l'elaborazione del «Report Riproduttori»: fino ad allora il costo di nascita dei nati e le quote dei riproduttori di quest'anno restano a zero.`)) return;
    setSalvando(true);
    try {
      // Versione 236: tutto il salvataggio avviene nel database in UN'UNICA operazione (funzione
      // ci_salva_costi_anno): o si salva tutto, o non cambia niente. Prima la cancellazione dei dati
      // vecchi non era controllata e un errore a metà lasciava l'anno vuoto o salvato in parte.
      const tasso = {
        costi_totali: risultato.costiTotali, valore_riforma_totale: risultato.valoreRiformaTotale,
        uba_giorni_produttivi: risultato.tasso.ubaGiorniProduttivi, uba_giorni_improduttivi: risultato.tasso.ubaGiorniImproduttivi,
        tasso_base: risultato.tasso.tassoSemplice, perdita: risultato.tasso.perditaSpalmata, tasso_rettificato: risultato.tasso.tassoRettificato,
      };
      const righe = risultato.costoPerAnimale.map(r => ({
        animale_id: r.animale_id || null, lotto_id: r.lotto_id || null, unita_nr: r.unita_nr || null,
        specie: r.specie, categoria_contabile: r.categoria_contabile, uba_giorni: r.uba_giorni,
        costo_mantenimento: r.costo_mantenimento, costo_totale_anno: r.costo_mantenimento,
      }));
      const { data: salvate, error } = await supabase.rpc("ci_salva_costi_anno", { p_anno: anno, p_tasso: tasso, p_righe: righe });
      if (error) throw new Error(`${error.message}${/function|funzione|ci_salva_costi_anno/i.test(error.message) ? "\n\nIl database non ha ancora la funzione della versione 236: lanciare il file contabilita_strutture_v236.sql." : ""}\n\nNiente è stato cambiato: i dati salvati prima sono ancora quelli.`);
      if (salvate !== righe.length) throw new Error(`Salvate ${salvate} righe invece di ${righe.length}: controllare.`);
      alert(`✓ Costo salvato per l'anno ${anno}: ${salvate} animali/unità.\n\nRicordarsi di rifare l'elaborazione del «Report Riproduttori».`);
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio:\n\n${err.message}`);
    }
    setSalvando(false);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Tasso €/UBA-giorno (formula aggressiva: i costi degli animali improduttivi si ridistribuiscono sui produttivi/riproduttori) e allocazione per specie/animale.
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <button onClick={calcola} disabled={calcolando}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {calcolando ? "Calcolo..." : "📊 Calcola"}
        </button>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
          ⚠️ Semplificazione attuale: il valore di riforma (V(t)) è impostato a 0 — il meccanismo di stima del valore di realizzo dei riproduttori non è ancora costruito (sezione 15 del documento di riferimento).
        </div>
      </div>

      {risultato && (
        <>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 10 }}>RIEPILOGO AZIENDALE — ANNO {risultato.anno}</div>
            <Riga label="Costi ordinari (Fisso + Variabile)" valore={`${formattaEuro(risultato.costiOrdinari)}`} />
            <Riga label="Quote di ammortamento" valore={`${formattaEuro(risultato.costoAmmortamenti)}`} />
            <Riga label="Costi totali (C(t))" valore={`${formattaEuro(risultato.costiTotali)}`} bold />
            <Riga label="UBA-giorni produttivi/riproduttori" valore={formattaNumero(risultato.tasso.ubaGiorniProduttivi, 1)} />
            <Riga label="UBA-giorni improduttivi (esclusi dal divisore)" valore={formattaNumero(risultato.tasso.ubaGiorniImproduttivi, 1)} color={C.red} />
            <Riga label="Tasso semplice (se si dividesse su tutti)" valore={`${formattaEuro(risultato.tasso.tassoSemplice, 4)}/UBA-gg`} color={C.muted} />
            <Riga label="Perdita spalmata sui produttivi" valore={`${formattaEuro(risultato.tasso.perditaSpalmata)}`} color={C.red} />
            <Riga label="Tasso RETTIFICATO (quello usato)" valore={`${formattaEuro(risultato.tasso.tassoRettificato, 4)}/UBA-gg`} bold color={C.primary} />
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 10 }}>ALLOCAZIONE PER SPECIE</div>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 0, marginBottom: 10 }}>
              I costi diretti (Destinazione/Imputazione = quella specie) restano dentro la specie; i costi Generali si ripartiscono in proporzione agli UBA-giorni produttivi; i costi intestati a due specie (es. «Bovini e Ovini») si ripartiscono solo tra quelle due, con lo stesso criterio. Costi diretti + quote = totale allocato.
            </p>
            <table style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left" }}>
                  <th style={{ padding: "4px 8px" }}>Specie</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>% sul totale UBA-giorni</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>Costi diretti</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>Quota Generali</th>
                  {QUOTE_COPPIE.filter(q => risultato.perSpecie.some(r => r[q.campo])).map(q => <th key={q.campo} style={{ padding: "4px 8px", textAlign: "right" }}>{q.etichetta}</th>)}
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>Totale allocato</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>Incidenza €/UBA-gg</th>
                </tr>
              </thead>
              <tbody>
                {risultato.perSpecie.map(r => (
                  <tr key={r.specie} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "6px 8px", textTransform: "capitalize" }}>{r.specie}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{formattaNumero(r.percentualeSulTotale, 1)}%</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{formattaEuro(r.costoDirettoSpecie)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{formattaEuro(r.quotaGeneraliSpecie)}</td>
                    {QUOTE_COPPIE.filter(q => risultato.perSpecie.some(x => x[q.campo])).map(q => <td key={q.campo} style={{ padding: "6px 8px", textAlign: "right" }}>{formattaEuro(r[q.campo])}</td>)}
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{formattaEuro(r.costoAllocatoTotale)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: C.primary }}>{formattaEuro(r.incidenzaUbaGiorno, 4)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: `2px solid ${C.border}`, fontWeight: 700, background: C.bg }}>
                  <td style={{ padding: "6px 8px" }}>Totale</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{formattaNumero(risultato.perSpecie.reduce((s, r) => s + r.percentualeSulTotale, 0), 1)}%</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{formattaEuro(risultato.perSpecie.reduce((s, r) => s + r.costoDirettoSpecie, 0))}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{formattaEuro(risultato.perSpecie.reduce((s, r) => s + r.quotaGeneraliSpecie, 0))}</td>
                  {QUOTE_COPPIE.filter(q => risultato.perSpecie.some(r => r[q.campo])).map(q => <td key={q.campo} style={{ padding: "6px 8px", textAlign: "right" }}>{formattaEuro(risultato.perSpecie.reduce((t, r) => t + (r[q.campo] || 0), 0))}</td>)}
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{formattaEuro(risultato.perSpecie.reduce((s, r) => s + r.costoAllocatoTotale, 0))}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: C.muted, fontWeight: 400, fontSize: 11 }}>— (denominatori diversi per specie)</td>
                </tr>
              </tbody>
            </table>
          </div>

          {(risultato.costiAltreSpecie["Macello e lavorazione delle carni"] > 0 || risultato.costiAltreSpecie.Pollame > 0 || risultato.costiAltreSpecie.Cavalli > 0 || risultato.costiAltreSpecie.Orto > 0 || risultato.costiAltreSpecie["Animali non d'allevamento (non specificato)"] > 0 || risultato.costiAltreSpecie["Cespiti con imputazione da correggere"] > 0) && (
            <div style={{ background: "#FDECEC", border: `1.5px solid ${C.red}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 8 }}>⚠️ ESCLUSI DAL COSTO DEGLI ANIMALI: MACELLO E LAVORAZIONE DELLE CARNI, ORTO, CAVALLI, POLLAME, ANIMALI NON D'ALLEVAMENTO</div>
              <table style={{ width: "100%", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: C.muted, textAlign: "left" }}>
                    <th style={{ padding: "4px 8px" }}></th>
                    <th style={{ padding: "4px 8px", textAlign: "right" }}>Costo diretto</th>
                    <th style={{ padding: "4px 8px", textAlign: "right" }}>Incidenza su UBA-giorni allevamento</th>
                  </tr>
                </thead>
                <tbody>
                  {["Macello e lavorazione delle carni", "Pollame", "Cavalli", "Orto", "Animali non d'allevamento (non specificato)", "Cespiti con imputazione da correggere"].map(chiave => risultato.costiAltreSpecie[chiave] > 0 && (
                    <tr key={chiave} style={{ borderTop: `1px solid ${C.red}55` }}>
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: C.red }}>{chiave}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: C.red }}>{formattaEuro(risultato.costiAltreSpecie[chiave])}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: C.red }}>
                        {risultato.tasso.ubaGiorniProduttivi > 0 ? formattaEuro(risultato.costiAltreSpecie[chiave] / risultato.tasso.ubaGiorniProduttivi, 4) : "—"}/UBA-gg
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: `2px solid ${C.red}`, fontWeight: 700, background: "#FDECEC" }}>
                    <td style={{ padding: "6px 8px", color: C.red }}>Totale</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: C.red }}>
                      {formattaEuro(["Macello e lavorazione delle carni", "Pollame", "Cavalli", "Orto", "Animali non d'allevamento (non specificato)", "Cespiti con imputazione da correggere"].reduce((s, k) => s + (risultato.costiAltreSpecie[k] || 0), 0))}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: C.red }}>
                      {risultato.tasso.ubaGiorniProduttivi > 0
                        ? formattaEuro(["Macello e lavorazione delle carni", "Pollame", "Cavalli", "Orto", "Animali non d'allevamento (non specificato)", "Cespiti con imputazione da correggere"].reduce((s, k) => s + (risultato.costiAltreSpecie[k] || 0), 0) / risultato.tasso.ubaGiorniProduttivi, 4)
                        : "—"}/UBA-gg
                    </td>
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: C.text, marginTop: 8 }}>
                Esclusi dai costi Generali — non si spalmano su nessuna specie d'allevamento. L'incidenza è calcolata sul totale degli UBA-giorni produttivi di Bovini+Suini+Ovini, come dato di confronto (non un costo effettivamente allocato).
                {risultato.costiAltreSpecie["Cespiti con imputazione da correggere"] > 0 && " La riga «Cespiti con imputazione da correggere» raccoglie le quote di cespiti con un'imputazione che il programma non riconosce: correggerla nella pagina Cespiti."}
                {risultato.costiAltreSpecie["Animali non d'allevamento (non specificato)"] > 0 && " La riga \"non specificato\" ha Area=\"Animali non d'allevamento\" ma nessuna Destinazione precisa (Pollame o Cavalli) — se vuoi, torna su Carica Fatture e precisala."}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={salvaRisultato} disabled={salvando}
              style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              {salvando ? "Salvataggio..." : `💾 Salva questo calcolo per l'anno ${risultato.anno}`}
            </button>
            <button onClick={esporta}
              style={{ background: C.green, color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              📥 Esporta Excel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Riga({ label, valore, bold, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 13, color: color || C.text }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: color || C.text }}>{valore}</span>
    </div>
  );
}
