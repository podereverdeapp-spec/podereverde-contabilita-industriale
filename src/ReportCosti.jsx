import { useState, useEffect, Fragment } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { calcolaReportUba } from "./motoreUba";
import { numerizzaCampi, round2, formattaEuro, formattaNumero, fetchAllPages, leggiInBlocchi } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { caricaRipartizioneLavoro, applicaRipartizioneLavoro } from "./ripartizioneLavoro";
import { confermaRicalcoloConAnomalie } from "./controlliRegistri";
import { chiaveQuotaCespite, eLavorazioneCarni, riepilogoCompetenza, calcolaDatiPerAreaCentro } from "./calcoloReportCosti";
import { caricaDatiBase } from "./calcoloBreakEven";
import { calcolaStalla, prezziDaFatture } from "./calcoloStalla";
import { PARAMETRI_PREZZO_RIFORMA, PREZZO_RIFORMA_PREDEFINITO } from "./ReportRiproduttori";
import { leggiFattureNeiCosti } from "./documentiCompetenza";

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
  // Versione 279: il calcolo mostrato è già salvato? (il pulsante Salva sta accanto a Calcola)
  const [salvato, setSalvato] = useState(false);
  // Versione 236: se si cambia l'anno, il calcolo fatto per l'anno precedente sparisce dallo schermo,
  // così non si può salvare il calcolo di un anno sopra un altro anno.
  useEffect(() => { setRisultato(null); setDettaglio(null); setStalla(null); }, [anno]);
  // Versione 308 (decisioni del Dott. Bizzarri del 26/10/2026, ore 18:54–19:14): una sola pagina per l'anno.
  // Il calcolo e il salvataggio non cambiano; si aggiungono la composizione per Area e Centro di Costo (stesso calcolo
  // della vecchia pagina «Per Area e Centro di Costo») e gli animali in stalla con il loro costo e il loro valore stimato.
  const [dettaglio, setDettaglio] = useState(null);
  const [stalla, setStalla] = useState(null);
  const [prezzi, setPrezzi] = useState({});
  const [erroreExtra, setErroreExtra] = useState("");
  const [espansi, setEspansi] = useState({});
  const [inUba, setInUba] = useState(false);
  const [mostraCalcolo, setMostraCalcolo] = useState(false);

  async function calcola() {
    setCalcolando(true);
    setRisultato(null);
    setSalvato(false);
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
      // Versione 237: acquisti + fatture da ricevere / da emettere (documenti di competenza);
      // gli acquisti collegati a un documento di competenza non si contano due volte
      const { data: fattureAnno, error: eF } = await leggiFattureNeiCosti(supabase, fetchAllPages, `${anno}-01-01`, `${anno}-12-31`);
      if (eF) throw new Error(eF.message);
      const idFattureAnno = (fattureAnno || []).map(f => f.id);
      const tipoFattura = new Map((fattureAnno || []).map(f => [f.id, f.tipo]));

      let articoliAnno = [];
      if (idFattureAnno.length > 0) {
        const { data: articoli, error: eArt } = await leggiInBlocchi(idFattureAnno, (blocco, da, a) => supabase
          .from("ci_articoli_fattura").select("fattura_id, totale_riga, tipo_costo, destinazione, area, centro_costo")
          .in("fattura_id", blocco).in("tipo_costo", ["Fisso", "Variabile"]).order("id").range(da, a));
        if (eArt) throw new Error(eArt.message);
        articoliAnno = numerizzaCampi(articoli || [], ["totale_riga"]);
      }
      const competenza = riepilogoCompetenza(articoliAnno, tipoFattura);

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

      setRisultato({ anno, costiOrdinari, costoAmmortamenti, costiTotali, valoreRiformaTotale, tasso, perSpecie, costoPerAnimale, righeUba, costiAltreSpecie, competenza });
      // Versione 308: composizione per Area e Centro di Costo, animali in stalla e prezzi proposti (un errore qui non ferma il calcolo)
      setErroreExtra("");
      try {
        const [dati, base, daFatture, { data: par }] = await Promise.all([
          calcolaDatiPerAreaCentro(anno), caricaDatiBase(), prezziDaFatture(anno),
          supabase.from("ci_parametri").select("chiave, valore").in("chiave", Object.values(PARAMETRI_PREZZO_RIFORMA)),
        ]);
        setDettaglio(dati);
        setStalla({ ...(await calcolaStalla(base, anno)), daFatture });
        const riforma = Object.fromEntries((par || []).map(r => [r.chiave, r.valore]));
        setPrezzi(p => {
          const n = { ...p };
          for (const sp of ["bovino", "suino", "ovino"]) {
            if (n[`m_${sp}`] === undefined) n[`m_${sp}`] = daFatture[sp] ? String(daFatture[sp].prezzo).replace(".", ",") : "";
            if (n[`r_${sp}`] === undefined) n[`r_${sp}`] = String(riforma[PARAMETRI_PREZZO_RIFORMA[sp]] ?? PREZZO_RIFORMA_PREDEFINITO[sp]).replace(".", ",");
          }
          return n;
        });
      } catch (e) { setErroreExtra(e.message); }
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
      "di cui fatture da ricevere (Muratella)": numeroExcel(risultato.competenza?.daRicevere || 0),
      "di cui fatture da emettere (orzo, in meno)": numeroExcel(risultato.competenza?.daEmettere || 0),
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
      setSalvato(true);
      alert(`✓ Costo salvato per l'anno ${anno}: ${salvate} animali/unità.\n\nRicordarsi di rifare l'elaborazione del «Report Riproduttori».`);
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio:\n\n${err.message}`);
    }
    setSalvando(false);
  }

  // ── Versione 308: presentazione in una sola pagina, in parole semplici ──────────────────────
  const NOMI = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };
  const SPECIE_ORDINE = ["bovino", "suino", "ovino"];
  const giorniAnno = a => ((a % 4 === 0 && a % 100 !== 0) || a % 400 === 0 ? 366 : 365);
  // giorni dell'anno trascorsi (per l'anno in corso fino a oggi): servono a dire quante UBA in media c'erano
  const giorniPeriodo = a => {
    const oggi = new Date();
    if (a < oggi.getFullYear()) return giorniAnno(a);
    return Math.max(1, Math.round((Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()) - Date.UTC(a, 0, 1)) / 86400000) + 1);
  };
  const num = v => { const n = parseFloat(String(v ?? "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const th = { padding: "6px 8px", textAlign: "right", color: C.muted, fontSize: 12, fontWeight: 700 };
  const td = { padding: "6px 8px", textAlign: "right", fontSize: 13 };
  const scheda = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 };
  const titolo = { fontSize: 15, fontWeight: 800, color: C.primary, marginBottom: 4 };
  const spiega = { fontSize: 12.5, color: C.muted, marginTop: 0, marginBottom: 10, lineHeight: 1.5 };

  // Sezione 2: le righe per Area con i centesimi quadrati sul risultato della sezione 1 (solo presentazione:
  // le due tabelle arrotondano in punti diversi e potevano differire di un centesimo)
  const righeAree = (() => {
    if (!risultato || !dettaglio) return null;
    const gruppi = dettaglio.gruppi.map(g => ({ ...g, valori: Object.fromEntries(SPECIE_ORDINE.map(sp => [sp, g.riga.perSpecie[sp].costoAllocato])) }));
    for (const sp of SPECIE_ORDINE) {
      const atteso = risultato.perSpecie.find(r => r.specie === sp)?.costoAllocatoTotale || 0;
      const somma = round2(gruppi.reduce((t, g) => t + g.valori[sp], 0));
      const diff = round2(atteso - somma);
      if (diff !== 0 && Math.abs(diff) <= 0.05 && gruppi.length) {
        const g = gruppi.reduce((m, x) => (x.valori[sp] > m.valori[sp] ? x : m), gruppi[0]);
        g.valori[sp] = round2(g.valori[sp] + diff);
      }
    }
    return gruppi.map(g => ({ ...g, totale: round2(SPECIE_ORDINE.reduce((t, sp) => t + g.valori[sp], 0)) })).filter(g => g.totale !== 0);
  })();
  const ubaSpecie = sp => risultato?.perSpecie.find(r => r.specie === sp)?.ubaGiorniSpProduttivi || 0;
  const ubaTotale = () => SPECIE_ORDINE.reduce((t, sp) => t + ubaSpecie(sp), 0);
  // un importo, in euro o in euro per UBA all'anno
  const mostra = (valore, uba) => (inUba ? (uba > 0 ? formattaEuro(valore / uba * 365, 2) : "—") : formattaEuro(valore));

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ ...scheda, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={calcola} disabled={calcolando}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {calcolando ? "Calcolo..." : `📊 Calcola il ${anno}`}
        </button>
        {/* Versione 279 (decisione del Dott. Bizzarri del 23/10/2026): Salva accanto a Calcola */}
        <button onClick={salvaRisultato} disabled={!risultato || salvando || salvato}
          style={{ background: !risultato ? "#bbb" : salvato ? C.green : "#B86E00", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: risultato && !salvato ? "pointer" : "default" }}>
          {salvando ? "Salvataggio..." : salvato ? `✓ Salvato l'anno ${risultato?.anno}` : risultato ? `💾 Salva il calcolo del ${risultato.anno}` : "💾 Salva (prima calcolare)"}
        </button>
        {risultato && !salvato && <span style={{ fontSize: 12, fontWeight: 700, color: "#B86E00" }}>Calcolo non ancora salvato: senza salvare non entra nei costi dei capi</span>}
        {risultato && <button onClick={esporta} style={{ marginLeft: "auto", background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>📥 Esporta Excel</button>}
      </div>

      {!risultato && !calcolando && <p style={spiega}>Scegliere l'anno e premere «Calcola»: il programma divide tutti i costi dell'anno tra bovini, suini e ovini e mostra quanto costa ogni specie, di cosa è fatto il costo, che cosa resta fuori e quanto valgono gli animali in stalla.</p>}

      {risultato && (
        <>
          {/* 1. Il risultato */}
          <div style={scheda}>
            <div style={titolo}>1. Quanto è costato l'allevamento nel {risultato.anno}</div>
            <p style={spiega}>
              Il costo di ogni specie e quanto costa in un anno mantenere un'UBA (un capo adulto di riferimento: una vacca vale 1, gli altri capi in proporzione alla taglia).
              Gli euro per UBA all'anno sono gli euro per UBA al giorno moltiplicati per 365, uguali in tutti gli anni per poterli confrontare. Le «UBA in media» sono gli animali presenti nell'anno, contati in UBA{risultato.anno >= new Date().getFullYear() ? `, fino a oggi (${giorniPeriodo(risultato.anno)} giorni)` : ""}.
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={{ ...th, textAlign: "left" }}>Specie</th><th style={th}>Costo dell'anno</th><th style={th}>Quota del costo totale</th>
                <th style={th}>UBA in media</th><th style={th}>Euro per UBA all'anno</th><th style={th}>Euro per UBA al giorno</th>
              </tr></thead>
              <tbody>
                {risultato.perSpecie.map(r => (
                  <tr key={r.specie} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{NOMI[r.specie]}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{formattaEuro(r.costoAllocatoTotale)}</td>
                    <td style={td}>{formattaNumero(r.costoAllocatoTotale / risultato.perSpecie.reduce((t, x) => t + x.costoAllocatoTotale, 0) * 100, 1)}%</td>
                    <td style={td}>{formattaNumero(r.ubaGiorniSpProduttivi / giorniPeriodo(risultato.anno), 1)}</td>
                    <td style={{ ...td, fontWeight: 800, color: C.primary }}>{formattaEuro(r.incidenzaUbaGiorno * 365, 2)}</td>
                    <td style={td}>{formattaEuro(r.incidenzaUbaGiorno, 4)}</td>
                  </tr>
                ))}
                {(() => { const tot = risultato.perSpecie.reduce((t, x) => t + x.costoAllocatoTotale, 0); const uba = ubaTotale(); return (
                  <tr style={{ borderTop: `2px solid ${C.border}`, background: C.bg }}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>Tutto l'allevamento</td>
                    <td style={{ ...td, fontWeight: 800 }}>{formattaEuro(tot)}</td><td style={td}>100,0%</td>
                    <td style={td}>{formattaNumero(uba / giorniPeriodo(risultato.anno), 1)}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{uba > 0 ? formattaEuro(tot / uba * 365, 2) : "—"}</td>
                    <td style={td}>{uba > 0 ? formattaEuro(tot / uba, 4) : "—"}</td>
                  </tr>); })()}
              </tbody>
            </table>
          </div>

          {/* 2. Di cosa è fatto */}
          <div style={scheda}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
              <div style={titolo}>2. Di cosa è fatto il costo</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[[false, "In euro"], [true, "In euro per UBA all'anno"]].map(([v, l]) => (
                  <button key={l} onClick={() => setInUba(v)} style={{ fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 6, cursor: "pointer", border: `1.5px solid ${C.primary}`, background: inUba === v ? C.primary : "#fff", color: inUba === v ? "#fff" : C.primary }}>{l}</button>
                ))}
              </div>
            </div>
            <p style={spiega}>Una riga per ogni Area di spesa del Piano dei Conti. Cliccando un'Area si vedono i suoi Centri di Costo (per gli ammortamenti: le categorie dei cespiti).</p>
            {!righeAree ? <p style={spiega}>{erroreExtra ? `⚠️ ${erroreExtra}` : "Caricamento della composizione…"}</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: "left" }}>Area / Centro di Costo</th>
                  {SPECIE_ORDINE.map(sp => <th key={sp} style={th}>{NOMI[sp]}</th>)}
                  <th style={th}>Tutto l'allevamento</th><th style={th}>Quota</th>
                </tr></thead>
                <tbody>
                  {(() => { const totAll = righeAree.reduce((t, g) => t + g.totale, 0); return righeAree.map(g => (
                    <Fragment key={g.area}>
                      <tr onClick={() => setEspansi(e => ({ ...e, [g.area]: !e[g.area] }))} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}>
                        <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{espansi[g.area] ? "▼" : "▶"} {g.area}</td>
                        {SPECIE_ORDINE.map(sp => <td key={sp} style={td}>{mostra(g.valori[sp], ubaSpecie(sp))}</td>)}
                        <td style={{ ...td, fontWeight: 700 }}>{mostra(g.totale, ubaTotale())}</td>
                        <td style={td}>{formattaNumero(g.totale / totAll * 100, 1)}%</td>
                      </tr>
                      {espansi[g.area] && g.sottoRighe.map(sr => (
                        <tr key={sr.etichetta} style={{ borderTop: `1px solid ${C.border}`, background: "#FAFAF8" }}>
                          <td style={{ ...td, textAlign: "left", paddingLeft: 26, color: C.muted }}>{sr.etichetta}</td>
                          {SPECIE_ORDINE.map(sp => <td key={sp} style={{ ...td, color: C.muted }}>{mostra(sr.perSpecie[sp].costoAllocato, ubaSpecie(sp))}</td>)}
                          <td style={{ ...td, color: C.muted }}>{mostra(SPECIE_ORDINE.reduce((t, sp) => t + sr.perSpecie[sp].costoAllocato, 0), ubaTotale())}</td>
                          <td style={{ ...td, color: C.muted }}>{formattaNumero(SPECIE_ORDINE.reduce((t, sp) => t + sr.perSpecie[sp].costoAllocato, 0) / totAll * 100, 1)}%</td>
                        </tr>
                      ))}
                    </Fragment>
                  )).concat(
                    <tr key="totale" style={{ borderTop: `2px solid ${C.border}`, background: C.bg }}>
                      <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>Totale</td>
                      {SPECIE_ORDINE.map(sp => <td key={sp} style={{ ...td, fontWeight: 800 }}>{mostra(righeAree.reduce((t, g) => t + g.valori[sp], 0), ubaSpecie(sp))}</td>)}
                      <td style={{ ...td, fontWeight: 800 }}>{mostra(totAll, ubaTotale())}</td><td style={td}>100,0%</td>
                    </tr>); })()}
                </tbody>
              </table>
            )}
          </div>

          {/* 3. Cosa resta fuori */}
          {dettaglio && dettaglio.rigaRossa.length > 0 && (
            <div style={{ ...scheda, background: "#FDECEC", borderColor: C.red }}>
              <div style={{ ...titolo, color: C.red }}>3. Cosa resta fuori dal costo degli animali</div>
              <p style={{ ...spiega, color: C.text }}>Spese dell'azienda che non riguardano bovini, suini e ovini: si registrano, ma non si dividono su nessuna specie (decisioni del 07/10/2026).</p>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {dettaglio.rigaRossa.map(r => (
                    <tr key={r.label} style={{ borderTop: `1px solid ${C.red}33` }}>
                      <td style={{ ...td, textAlign: "left", color: C.red, fontWeight: 700 }}>{r.label}</td>
                      <td style={{ ...td, color: C.red, fontWeight: 700 }}>{formattaEuro(r.valore)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: `2px solid ${C.red}` }}>
                    <td style={{ ...td, textAlign: "left", color: C.red, fontWeight: 800 }}>Totale</td>
                    <td style={{ ...td, color: C.red, fontWeight: 800 }}>{formattaEuro(dettaglio.rigaRossa.reduce((t, r) => t + r.valore, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* 4. Muratella */}
          {risultato.competenza && (risultato.competenza.righeDaRicevere > 0 || risultato.competenza.righeDaEmettere > 0) && (
            <div style={{ ...scheda, background: "#FFF7E6", borderColor: "#E8A33D", fontSize: 13 }}>
              <div style={titolo}>4. Rapporti con Muratella compresi nel costo del {risultato.anno}</div>
              {risultato.competenza.righeDaRicevere > 0 && <Riga label={`Fatture da ricevere da Muratella (${risultato.competenza.righeDaRicevere} righe): costi dei campi di Podere pagati da Muratella`} valore={formattaEuro(risultato.competenza.daRicevere)} />}
              {risultato.competenza.righeDaEmettere > 0 && <Riga label="Fattura da emettere a Muratella: orzo di Podere conferito, in meno nei Mangimi (rientra come farina comprata dalla Cooperativa Ceri)" valore={formattaEuro(risultato.competenza.daEmettere)} />}
              <div style={{ color: C.muted, marginTop: 6 }}>
                Decisione del 08/10/2026: i costi dei campi di Podere stanno in Podere, anno per anno, anche se li ha pagati Muratella; l'orzo venduto e ricomprato non si conta due volte.
                Elenco riga per riga: cartella «Emissione Fatture di Vendita» → «Fatture da Ricevere e da Emettere».
              </div>
            </div>
          )}

          {/* 5. Animali in stalla */}
          <div style={scheda}>
            <div style={titolo}>5. Animali in stalla {stalla ? `al ${stalla.data.split("-").reverse().join("/")}` : ""}: quanto sono costati e quanto valgono</div>
            <p style={spiega}>
              Il costo che gli animali ancora presenti hanno accumulato (acquisto o nascita, più il mantenimento di ogni anno salvato nel Report Costi) e quanto
              varrebbero venduti come carcassa. <b>Il peso della carcassa è una stima</b>: nel database non ci sono ancora pesate, quindi si ricava dall'età,
              con i pesi reali dei capi macellati. Il prezzo al kg è proposto dalle fatture di vendita e si può cambiare a mano.
              I riproduttori sono a parte: il loro mantenimento va ai figli come costo di nascita, quindi per loro si mostra solo il costo d'ingresso.
            </p>
            {!stalla ? <p style={spiega}>{erroreExtra ? `⚠️ ${erroreExtra}` : "Caricamento degli animali in stalla…"}</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: "left" }}>Specie</th><th style={th}>Capi</th><th style={th}>Costo negli anni precedenti</th><th style={th}>Costo dell'anno</th>
                  <th style={th}>Costo accumulato</th><th style={th}>Carcassa stimata</th><th style={th}>Prezzo al kg di carcassa</th><th style={th}>Valore stimato</th><th style={th}>Valore meno costo</th>
                </tr></thead>
                <tbody>
                  {SPECIE_ORDINE.flatMap(sp => {
                    const d = stalla.perSpecie[sp]; if (!d) return [];
                    const pm = num(prezzi[`m_${sp}`]), pr = num(prezzi[`r_${sp}`]);
                    const vI = pm !== null && d.ingrasso.kg > 0 ? round2(d.ingrasso.kg * pm) : null;
                    const vR = pr !== null && d.riproduttori.kg > 0 ? round2(d.riproduttori.kg * pr) : null;
                    const casella = k => <input value={prezzi[k] ?? ""} onChange={e => setPrezzi(p => ({ ...p, [k]: e.target.value }))} inputMode="decimal"
                      style={{ width: 70, textAlign: "right", padding: "3px 6px", border: `1.5px solid ${C.blue}`, borderRadius: 5, fontSize: 13 }} />;
                    const diff = (v, c) => (v === null ? "—" : <span style={{ color: v - c < 0 ? C.red : C.green, fontWeight: 700 }}>{formattaEuro(round2(v - c))}</span>);
                    return [
                      <tr key={sp + "i"} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{NOMI[sp]} da macello</td>
                        <td style={td}>{d.ingrasso.capi}</td>
                        <td style={td}>{formattaEuro(d.ingrasso.costoPrecedenti)}</td>
                        <td style={td}>{formattaEuro(d.ingrasso.costoAnno)}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{formattaEuro(d.ingrasso.costoTotale)}</td>
                        <td style={td}>{d.ingrasso.kg > 0 ? `${formattaNumero(d.ingrasso.kg, 0)} kg` : "dato mancante"}</td>
                        <td style={td}>{casella(`m_${sp}`)} €</td>
                        <td style={{ ...td, fontWeight: 700 }}>{vI === null ? "—" : formattaEuro(vI)}</td>
                        <td style={td}>{diff(vI, d.ingrasso.costoTotale)}</td>
                      </tr>,
                      <tr key={sp + "r"} style={{ background: "#F7F4FB" }}>
                        <td style={{ ...td, textAlign: "left", color: "#5B3F8C" }}>{NOMI[sp]} riproduttori</td>
                        <td style={td}>{d.riproduttori.capi}</td>
                        <td style={{ ...td, color: C.muted }} colSpan={2}>mantenimento passato ai figli</td>
                        <td style={td}>{formattaEuro(d.riproduttori.costoIngresso)} <span style={{ fontSize: 11, color: C.muted }}>d'ingresso</span></td>
                        <td style={td}>{d.riproduttori.kg > 0 ? `${formattaNumero(d.riproduttori.kg, 0)} kg` : "dato mancante"}</td>
                        <td style={td}>{casella(`r_${sp}`)} €</td>
                        <td style={td}>{vR === null ? "—" : formattaEuro(vR)}</td>
                        <td style={td}>{diff(vR, d.riproduttori.costoIngresso)}</td>
                      </tr>,
                    ];
                  })}
                </tbody>
              </table>
            )}
            {stalla && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 1.6 }}>
                <b>Come è stimato il peso.</b>{" "}
                {SPECIE_ORDINE.map(sp => { const m = stalla.perSpecie[sp]?.modello; if (!m) return null; return (
                  <span key={sp}>{NOMI[sp]}: {m.capiMacellati ? `${m.capiMacellati} capi macellati, età media ${formattaNumero(m.etaMedia, 1)} mesi, carcassa media ${formattaNumero(m.carcassaMedia, 1)} kg` : "nessun capo macellato con età e peso della carcassa, peso non stimabile"}{m.riproduttoriMacellati ? `; riproduttori macellati ${m.riproduttoriMacellati}, carcassa media ${formattaNumero(m.carcassaRiproduttori, 1)} kg` : ""}. </span>); })}
                Un capo più giovane dell'età media vale in proporzione alla sua età (dalla carcassa alla nascita a quella media); uno più vecchio vale la carcassa media.
                {" "}<b>Prezzi proposti.</b> Da macello: media delle fatture di vendita {SPECIE_ORDINE.map(sp => stalla.daFatture[sp] ? `${NOMI[sp].toLowerCase()} ${formattaEuro(stalla.daFatture[sp].prezzo)} (${stalla.daFatture[sp].anno})` : null).filter(Boolean).join(", ")}; riproduttori: prezzo di riforma al kg di carcassa scritto in Parametri.
                Le caselle con il bordo blu si possono cambiare per fare prove: non si salva niente.
              </div>
            )}
          </div>

          {/* 6. Come si calcola */}
          <div style={scheda}>
            <div onClick={() => setMostraCalcolo(v => !v)} style={{ ...titolo, cursor: "pointer", marginBottom: 0 }}>{mostraCalcolo ? "▼" : "▶"} 6. Come si calcola (per chi vuole approfondire)</div>
            {mostraCalcolo && (
              <div style={{ fontSize: 13, marginTop: 10 }}>
                <p style={spiega}>
                  Ogni spesa ha una Destinazione (Piano dei Conti). Le spese intestate a una specie restano a quella specie; quelle «Generali» si dividono tra le tre specie
                  in proporzione ai giorni di presenza pesati per la taglia (UBA-giorno); quelle intestate a due specie (per esempio «Bovini e Ovini») solo tra quelle due.
                  I giorni degli animali da macello morti non entrano nel divisore: il loro costo lo pagano i capi rimasti. Il ricavo dei riproduttori venduti o riformati
                  non entra qui: lo considera il Report Riproduttori.
                </p>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={{ ...th, textAlign: "left" }}>Specie</th><th style={th}>Spese intestate alla specie</th><th style={th}>Quota delle spese generali</th>
                    {QUOTE_COPPIE.filter(q => risultato.perSpecie.some(r => r[q.campo])).map(q => <th key={q.campo} style={th}>{q.etichetta}</th>)}
                    <th style={th}>Costo dell'anno</th><th style={th}>Giorni di presenza pesati</th>
                  </tr></thead>
                  <tbody>
                    {risultato.perSpecie.map(r => (
                      <tr key={r.specie} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ ...td, textAlign: "left" }}>{NOMI[r.specie]}</td>
                        <td style={td}>{formattaEuro(r.costoDirettoSpecie)}</td><td style={td}>{formattaEuro(r.quotaGeneraliSpecie)}</td>
                        {QUOTE_COPPIE.filter(q => risultato.perSpecie.some(x => x[q.campo])).map(q => <td key={q.campo} style={td}>{formattaEuro(r[q.campo])}</td>)}
                        <td style={{ ...td, fontWeight: 700 }}>{formattaEuro(r.costoAllocatoTotale)}</td><td style={td}>{formattaNumero(r.ubaGiorniSpProduttivi, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 10 }}>
                  <Riga label="Spese dell'anno (fatture e costi senza fattura), comprese quelle che restano fuori" valore={formattaEuro(risultato.costiOrdinari)} />
                  <Riga label="Quote di ammortamento dei cespiti intestati all'allevamento" valore={formattaEuro(risultato.costoAmmortamenti)} />
                  <Riga label="Giorni di presenza pesati degli animali da macello morti (fuori dal divisore)" valore={formattaNumero(risultato.tasso.ubaGiorniImproduttivi, 1)} />
                  <Riga label="Costo che questi animali passano ai capi rimasti" valore={formattaEuro(risultato.tasso.perditaSpalmata)} />
                </div>
                <p style={{ ...spiega, marginTop: 8 }}>La tabella «Di cosa è fatto il costo» e quella del risultato arrotondano i centesimi in punti diversi: l'eventuale centesimo di differenza è attribuito all'Area più grande di ogni specie, così i totali coincidono.</p>
              </div>
            )}
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
