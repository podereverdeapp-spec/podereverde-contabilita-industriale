import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";
import { C } from "./style";
import { classificaRiga } from "./motoreClassificazione";
import { round2, numeroRobusto, calcolaImponibile, leggiAliquotaIva, formattaData } from "./parsingUtils";

const CATEGORIE_AMMORTAMENTO = [
  "3 - Attrezzatura specifica",
  "3 - Costruzioni leggere",
  "5 - Macchinari, apparecchi e attrezzature varie",
  "5 b - Macchinari, apparecchi e attrezzature varie extra allevamento",
  "6 - Spese atti notarili",
  "7 - Animali non oggetto di allevamento",
  "15 - Autovetture, motoveicoli e simili",
  "30 – Avviamento",
  "31 - Spese di costituzione e trasformazione",
  "34 - Altri oneri pluriennali",
];

const SPECIE_ACQUISTO = ["Bovini", "Suini", "Ovini", "Piu' specie acquistate insieme"];
const RAZZE_PER_SPECIE = {
  "Bovini": ["Chianina", "Marchigiana", "Maremmana", "Limousine", "Charolais", "Frisona", "Pezzata Rossa", "Meticcia", "Altra"],
  "Suini": ["Large White", "Landrace", "Duroc", "Cinta senese", "Mora romagnola", "Nero casertano", "Nero apucalabro", "Meticcia", "Altra"],
  "Ovini": ["Sopravvissana", "Suffolk", "Meticcia", "Altra"],
  "Piu' specie acquistate insieme": ["Da definire in podereverdeapp.it"],
};

export default function CaricaFatture() {
  const [fornitori, setFornitori] = useState([]);
  const [regoleFisse, setRegoleFisse] = useState([]);
  const [regoleVariabili, setRegoleVariabili] = useState([]);
  const [pianoConti, setPianoConti] = useState([]);
  const [righe, setRighe] = useState([]); // righe caricate + classificate
  const [loadingDati, setLoadingDati] = useState(true);
  const [modalita, setModalita] = useState("excel"); // "excel" | "pdf"
  const [leggendoPdf, setLeggendoPdf] = useState(false);
  const [progressoPdf, setProgressoPdf] = useState({ fatti: 0, totale: 0, erroriFile: [] });
  const [bozzaTrovata, setBozzaTrovata] = useState(null);
  const fileInputRef = useRef(null);
  const cartellaInputRef = useRef(null);
  const salvataggioBozzaTimeout = useRef(null);

  useEffect(() => { caricaDatiRiferimento(); }, []);

  // Salvataggio automatico della bozza (con debounce) ogni volta che le righe cambiano
  useEffect(() => {
    if (righe.length === 0) return;
    if (salvataggioBozzaTimeout.current) clearTimeout(salvataggioBozzaTimeout.current);
    salvataggioBozzaTimeout.current = setTimeout(async () => {
      await supabase.from("ci_bozze_import").delete().neq("id", 0);
      await supabase.from("ci_bozze_import").insert([{ contenuto: righe }]);
    }, 1500);
    return () => clearTimeout(salvataggioBozzaTimeout.current);
  }, [righe]);

  async function caricaDatiRiferimento() {
    setLoadingDati(true);
    const [{ data: f, error: eF }, { data: rf, error: eRF }, { data: rv, error: eRV }, { data: pc, error: ePC }] =
      await Promise.all([
        supabase.from("ci_fornitori").select("*"),
        supabase.from("ci_regole_fornitore_fissa").select("*"),
        supabase.from("ci_regole_fornitore_variabile").select("*"),
        supabase.from("ci_piano_dei_conti").select("*").order("area").order("centro_costo"),
      ]);
    const errore = eF || eRF || eRV || ePC;
    if (errore) {
      alert(`⚠️ Errore nel caricamento dei dati di riferimento:\n\n${errore.message}`);
    } else {
      setFornitori(f || []);
      setRegoleFisse(rf || []);
      setRegoleVariabili(rv || []);
      setPianoConti(pc || []);
    }
    setLoadingDati(false);

    const { data: bozza } = await supabase
      .from("ci_bozze_import")
      .select("id, contenuto, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (bozza) setBozzaTrovata(bozza);
  }

  function riprendiBozza() {
    setRighe(bozzaTrovata.contenuto);
    setBozzaTrovata(null);
  }

  async function scartaBozza() {
    await supabase.from("ci_bozze_import").delete().neq("id", 0);
    setBozzaTrovata(null);
  }

  function areeDisponibili() {
    return [...new Set(pianoConti.map(p => p.area))];
  }
  function centriPerArea(area) {
    return pianoConti.filter(p => p.area === area).map(p => p.centro_costo);
  }

  function gestisciFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: "binary", cellDates: true });
      const foglioFatture = wb.Sheets[wb.SheetNames.find(n => n.trim().toLowerCase() === "fatture") || wb.SheetNames[0]];
      const dati = XLSX.utils.sheet_to_json(foglioFatture, { defval: "" });

      const nomeFoglioVerifica = wb.SheetNames.find(n => n.trim().toLowerCase() === "verifica fatture");
      const verifica = nomeFoglioVerifica
        ? XLSX.utils.sheet_to_json(wb.Sheets[nomeFoglioVerifica], { defval: "" })
        : [];

      await elaboraRigheGrezze(dati, verifica);
    };
    reader.readAsBinaryString(file);
  }

  async function leggiPdfComeBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = () => reject(new Error(`Impossibile leggere il file ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function gestisciCartellaPdf(e) {
    const tuttiFile = Array.from(e.target.files || []);
    const pdfFile = tuttiFile.filter(f => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfFile.length === 0) {
      alert("Nessun file PDF trovato in questa cartella.");
      return;
    }
    if (!window.confirm(`Trovati ${pdfFile.length} file PDF. Verranno letti uno per uno tramite Claude (ogni lettura ha un piccolo costo). Procedere?`)) return;

    setLeggendoPdf(true);
    setProgressoPdf({ fatti: 0, totale: pdfFile.length, erroriFile: [] });
    const datiCombinati = [];
    const erroriFile = [];
    const fattureNonQuadrano = [];

    for (const file of pdfFile) {
      try {
        const base64 = await leggiPdfComeBase64(file);
        const risposta = await fetch("/api/leggi-fattura-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdfBase64: base64, filename: file.name }),
        });
        const risultato = await risposta.json();
        if (!risposta.ok || risultato.error) {
          erroriFile.push(`${file.name}: ${risultato.error || "errore sconosciuto"}`);
        } else {
          const est = risultato.estratto;
          (est.righe || []).forEach(riga => {
            datiCombinati.push({
              "Fornitore": est.fornitore || "", "P.IVA": est.piva || "",
              "Numero": est.numero || "", "Data": est.data || "",
              "Descrizione": riga.descrizione || "", "Quantità": riga.quantita ?? 1,
              "U.M.": riga.unita_misura || "", "Prezzo unitario": riga.prezzo_unitario ?? 0,
              "Imponibile": riga.imponibile ?? 0,
              "Aliquota IVA": riga.aliquota_iva ?? "",
            });
          });
          if (est.verifica_totali && est.verifica_totali.corrisponde === false) {
            fattureNonQuadrano.push(`${file.name} (${est.fornitore || "?"}, fatt. ${est.numero || "?"})`);
          }
        }
      } catch (err) {
        erroriFile.push(`${file.name}: ${err.message}`);
      }
      setProgressoPdf(p => ({ ...p, fatti: p.fatti + 1 }));
    }

    setLeggendoPdf(false);
    setProgressoPdf(p => ({ ...p, erroriFile }));
    if (fattureNonQuadrano.length > 0) {
      alert(`⚠️ ${fattureNonQuadrano.length} fatture hanno una somma delle righe che NON coincide con i totali scritti sul PDF — controllale con attenzione prima di salvarle, potrebbe mancare una riga o essere stata letta male:\n\n${fattureNonQuadrano.join("\n")}`);
    }
    if (erroriFile.length > 0) {
      alert(`⚠️ ${erroriFile.length} file su ${pdfFile.length} non sono stati letti correttamente:\n\n${erroriFile.join("\n")}`);
    }
    if (datiCombinati.length > 0) await elaboraRigheGrezze(datiCombinati);
  }

  async function elaboraRigheGrezze(dati, verifica = []) {
    const risultati = dati.map((r, i) => {
      const grezza = {
        id: `riga-${Date.now()}-${i}`,
        fornitore: String(r["Fornitore"] || r["fornitore"] || "").trim(),
        piva: String(r["P.IVA"] || r["Partita IVA"] || r["piva"] || "").trim(),
        numero: String(r["Numero"] || r["Numero Fattura"] || "").trim(),
        data: formattaData(r["Data"] || r["Data Fattura"]),
        descrizione: String(r["Descrizione"] || "").trim(),
        quantita: numeroRobusto(r["Quantità"] || r["Quantita"] || 1),
        unita_misura: String(r["U.M."] || r["Unità Misura"] || "").trim(),
        prezzo_unitario: numeroRobusto(r["Prezzo unitario"] || r["Prezzo Unitario"] || 0),
        aliquota_iva: leggiAliquotaIva(r),
        imponibile: calcolaImponibile(r),
      };
      const { fornitore: fornitoreObj, ...classificazioneResto } = classificaRiga(grezza, { fornitori, regoleFisse, regoleVariabili });
      return {
        ...grezza,
        ...classificazioneResto,
        fornitore_obj: fornitoreObj,
        editArea: classificazioneResto.area || "",
        editCentro: classificazioneResto.centro_costo || "",
        editDestinazione: classificazioneResto.destinazione || "",
        editTipo: classificazioneResto.tipo_costo || "",
        specieAcquisto: "", razzaAcquisto: "", destAcquisto: "", bdnAcquisto: "", lottoAcquisto: "",
        importoMacello: "", importoIngresso: "",
        categoriaAmmortamento: "", imputazioneAmmortamento: "",
        annoAcquistoAmmortamento: new Date(grezza.data || Date.now()).getFullYear() || "",
        pctAmmortamento: "",
        memorizzaRegola: "nessuna", parolaChiaveRegola: "",
        giaCaricata: false,
        nonQuadra: false, dettaglioQuadratura: null,
        salvata: false, salvataggioInCorso: false, idsSalvati: null, regolaCreata: null,
      };
    });

    // Incrocio con il foglio "Verifica Fatture" (se presente): segnalo le fatture per cui
    // la somma delle righe non coincide con i totali dichiarati sul PDF originale.
    if (verifica.length > 0) {
      const mappaVerifica = new Map();
      verifica.forEach(v => {
        const fornitore = String(v["Fornitore"] || "").trim().toLowerCase();
        const numero = String(v["Numero"] || "").trim();
        const dataVerifica = formattaData(v["Data"]);
        const corrisponde = String(v["Corrisponde?"] || "").trim().toUpperCase();
        mappaVerifica.set(`${fornitore}|${numero}|${dataVerifica}`, {
          corrisponde: corrisponde === "SI",
          totaleCalcolato: v["Totale calcolato"],
          totalePdf: v["Totale da PDF"],
        });
      });
      risultati.forEach(r => {
        const chiave = `${r.fornitore.trim().toLowerCase()}|${r.numero}|${r.data}`;
        const match = mappaVerifica.get(chiave);
        if (match && !match.corrisponde) {
          r.nonQuadra = true;
          r.dettaglioQuadratura = match;
        }
      });
    }

    const fornitoreIds = [...new Set(risultati.map(r => r.fornitore_obj?.id).filter(Boolean))];
    if (fornitoreIds.length > 0) {
      const { data: fattureEsistenti, error } = await supabase
        .from("ci_fatture").select("fornitore_id, numero, data").in("fornitore_id", fornitoreIds);
      if (error) {
        alert(`⚠️ Non sono riuscito a controllare i duplicati (procedo comunque, ma verifica a mano):\n\n${error.message}`);
      } else {
        const chiaviEsistenti = new Set((fattureEsistenti || []).map(f => `${f.fornitore_id}|${f.numero}|${f.data}`));
        risultati.forEach(r => {
          if (r.fornitore_obj) {
            r.giaCaricata = chiaviEsistenti.has(`${r.fornitore_obj.id}|${r.numero}|${r.data}`);
          }
        });
      }
    }

    setRighe(prev => [...prev, ...risultati]);
  }


  function aggiornaRiga(id, campi) {
    setRighe(prev => prev.map(r => (r.id === id ? { ...r, ...campi } : r)));
  }

  function validaRiga(r) {
    if (r.editArea === "TRASPORTO ANIMALI") {
      const somma = (parseFloat(r.importoMacello) || 0) + (parseFloat(r.importoIngresso) || 0);
      if (Math.abs(somma - r.imponibile) > 0.01) {
        return `La somma di "Trasporto macello" + "Ingresso allevamento" (${somma.toFixed(2)}€) non torna con l'imponibile della riga (${r.imponibile.toFixed(2)}€).`;
      }
    }
    if (r.editArea === "Ammortamenti") {
      if (!r.categoriaAmmortamento || !r.imputazioneAmmortamento || !r.pctAmmortamento) {
        return `Per un Ammortamento servono Categoria, Imputazione e % Ammortamento.`;
      }
    }
    if (!r.editArea) return `Manca l'Area.`;
    if (r.memorizzaRegola === "parolaChiave" && !r.parolaChiaveRegola.trim()) {
      return `Hai scelto di memorizzare una regola per parola chiave, ma non hai scritto la parola chiave.`;
    }
    return null;
  }

  async function trovaOCreaFattura(fornitoreId, numero, data) {
    const { data: esistente } = await supabase
      .from("ci_fatture").select("id").eq("fornitore_id", fornitoreId).eq("numero", numero).eq("data", data).maybeSingle();
    if (esistente) return esistente.id;
    const { data: nuova, error } = await supabase.from("ci_fatture").insert([{
      numero, data, tipo: "PASSIVA", fornitore_id: fornitoreId, totale_netto: 0, totale_iva: 0, totale_lordo: 0,
    }]).select().single();
    if (error) throw new Error(`Errore creando fattura ${numero}: ${error.message}`);
    return nuova.id;
  }

  async function ricalcolaTotaliFattura(fatturaId) {
    const { data: righeArt } = await supabase.from("ci_articoli_fattura").select("totale_riga, totale_iva").eq("fattura_id", fatturaId);
    const netto = (righeArt || []).reduce((s, r) => s + (r.totale_riga || 0), 0);
    const iva = (righeArt || []).reduce((s, r) => s + (r.totale_iva || 0), 0);
    await supabase.from("ci_fatture").update({ totale_netto: round2(netto), totale_iva: round2(iva), totale_lordo: round2(netto + iva) }).eq("id", fatturaId);
  }

  async function salvaRiga(riga) {
    if (riga.giaCaricata) { alert("Questa fattura risulta già caricata in precedenza."); return; }
    const errore = validaRiga(riga);
    if (errore) { alert(`⚠️ ${errore}`); return; }

    aggiornaRiga(riga.id, { salvataggioInCorso: true });
    try {
      let fornitoreId = riga.fornitore_obj?.id;
      if (!fornitoreId && riga.fornitore) {
        const { data: nuovo, error } = await supabase.from("ci_fornitori")
          .insert([{ nome: riga.fornitore, partita_iva: riga.piva || null, gruppo_classificazione: "FRO" }])
          .select().single();
        if (error) throw new Error(`Errore creando fornitore: ${error.message}`);
        fornitoreId = nuovo.id;
      }

      const idsSalvati = {};

      if (riga.editArea === "ACQUISTO ANIMALI") {
        const { data, error } = await supabase.from("ci_report_acquisto_animali").insert([{
          fonte: "ACQUISTO_DIRETTO", fornitore_id: fornitoreId, data_fattura: riga.data, numero_fattura: riga.numero,
          importo: riga.imponibile, quantita: riga.quantita, unita_misura: riga.unita_misura, prezzo_unitario: riga.prezzo_unitario,
          specie: riga.specieAcquisto || null, razza: riga.razzaAcquisto || null,
          destinazione_acquisto: riga.destAcquisto || null, bdn: riga.bdnAcquisto || null, nr_lotto: riga.lottoAcquisto || null,
        }]).select().single();
        if (error) throw new Error(error.message);
        idsSalvati.reportAcquistoId = data.id;
      } else if (riga.editArea === "TRASPORTO ANIMALI") {
        const fatturaId = await trovaOCreaFattura(fornitoreId, riga.numero, riga.data);
        const importoMacello = parseFloat(riga.importoMacello) || 0;
        const { data: art, error: eArt } = await supabase.from("ci_articoli_fattura").insert([{
          fattura_id: fatturaId, descrizione: riga.descrizione, quantita: riga.quantita, unita_misura: riga.unita_misura,
          prezzo_unitario: riga.prezzo_unitario, totale_riga: importoMacello,
          aliquota_iva: riga.aliquota_iva, totale_iva: riga.aliquota_iva ? round2(importoMacello * riga.aliquota_iva / 100) : 0,
          area: "TRASPORTO ANIMALI", centro_costo: "Lavorazione prodotti allevamento per Rivendita",
          destinazione: riga.editDestinazione || null, tipo_costo: riga.editTipo || null, stato_classificazione: "MANUALE",
        }]).select().single();
        if (eArt) throw new Error(eArt.message);
        idsSalvati.articoloFatturaId = art.id; idsSalvati.fatturaId = fatturaId;
        const { data: acq, error: eAcq } = await supabase.from("ci_report_acquisto_animali").insert([{
          articolo_fattura_id: art.id, fonte: "TRASPORTO_INGRESSO", fornitore_id: fornitoreId,
          data_fattura: riga.data, numero_fattura: riga.numero, importo: parseFloat(riga.importoIngresso) || 0,
          quantita: riga.quantita, unita_misura: riga.unita_misura, prezzo_unitario: riga.prezzo_unitario,
          specie: riga.specieAcquisto || null, destinazione_acquisto: riga.destAcquisto || null,
          bdn: riga.bdnAcquisto || null, nr_lotto: riga.lottoAcquisto || null,
        }]).select().single();
        if (eAcq) throw new Error(eAcq.message);
        idsSalvati.reportAcquistoId = acq.id;
        await ricalcolaTotaliFattura(fatturaId);
      } else {
        const fatturaId = await trovaOCreaFattura(fornitoreId, riga.numero, riga.data);
        const { data: art, error } = await supabase.from("ci_articoli_fattura").insert([{
          fattura_id: fatturaId, descrizione: riga.descrizione, quantita: riga.quantita, unita_misura: riga.unita_misura,
          prezzo_unitario: riga.prezzo_unitario, totale_riga: riga.imponibile,
          aliquota_iva: riga.aliquota_iva, totale_iva: riga.aliquota_iva ? round2(riga.imponibile * riga.aliquota_iva / 100) : 0,
          area: riga.editArea, centro_costo: riga.editCentro || null, destinazione: riga.editDestinazione || null,
          tipo_costo: riga.editTipo, stato_classificazione: riga.stato,
        }]).select().single();
        if (error) throw new Error(error.message);
        idsSalvati.articoloFatturaId = art.id; idsSalvati.fatturaId = fatturaId;

        if (riga.editArea === "Ammortamenti") {
          const { data: amm, error: eAmm } = await supabase.from("ci_articolo_dettaglio_ammortamento").insert([{
            articolo_id: art.id, categoria_ammortamento: riga.categoriaAmmortamento || null,
            imputazione: riga.imputazioneAmmortamento || null,
            anno_acquisto: riga.annoAcquistoAmmortamento ? parseInt(riga.annoAcquistoAmmortamento) : null,
            pct_ammortamento: riga.pctAmmortamento ? parseFloat(riga.pctAmmortamento) / 100 : null,
            importo_acquisto: riga.imponibile,
          }]).select().single();
          if (eAmm) throw new Error(eAmm.message);
          idsSalvati.dettaglioAmmortamentoId = amm.id;
        }
        await ricalcolaTotaliFattura(fatturaId);
      }

      let regolaCreata = null;
      if (riga.memorizzaRegola === "fissa" && fornitoreId) {
        const { data: rf, error } = await supabase.from("ci_regole_fornitore_fissa").upsert([{
          fornitore_id: fornitoreId, area: riga.editArea, centro_costo: riga.editCentro || null,
          destinazione: riga.editDestinazione || null, tipo_costo: riga.editTipo,
        }], { onConflict: "fornitore_id" }).select().single();
        if (error) alert(`⚠️ Riga salvata, ma non sono riuscito a creare la regola fissa:\n\n${error.message}`);
        else { regolaCreata = { tipo: "fissa", id: rf.id }; setRegoleFisse(prev => [...prev.filter(r => r.fornitore_id !== fornitoreId), rf]); }
      } else if (riga.memorizzaRegola === "parolaChiave" && fornitoreId) {
        const { data: rv, error } = await supabase.from("ci_regole_fornitore_variabile").insert([{
          fornitore_id: fornitoreId, parola_chiave: riga.parolaChiaveRegola.trim(), area: riga.editArea,
          centro_costo: riga.editCentro || null, destinazione: riga.editDestinazione || null, tipo_costo: riga.editTipo,
        }]).select().single();
        if (error) alert(`⚠️ Riga salvata, ma non sono riuscito a creare la regola per parola chiave:\n\n${error.message}`);
        else { regolaCreata = { tipo: "parolaChiave", id: rv.id }; setRegoleVariabili(prev => [...prev, rv]); }
      }

      aggiornaRiga(riga.id, { salvata: true, salvataggioInCorso: false, idsSalvati, regolaCreata });
    } catch (err) {
      aggiornaRiga(riga.id, { salvataggioInCorso: false });
      alert(`⚠️ Errore nel salvataggio della riga "${riga.descrizione}":\n\n${err.message}`);
    }
  }

  async function annullaSalvataggioRiga(riga) {
    if (!window.confirm("Annullare il salvataggio di questa riga? Verrà rimossa dal database e potrai modificarla di nuovo."))
      return;
    const ids = riga.idsSalvati || {};
    try {
      if (ids.dettaglioAmmortamentoId) await supabase.from("ci_articolo_dettaglio_ammortamento").delete().eq("id", ids.dettaglioAmmortamentoId);
      if (ids.reportAcquistoId) await supabase.from("ci_report_acquisto_animali").delete().eq("id", ids.reportAcquistoId);
      if (ids.articoloFatturaId) await supabase.from("ci_articoli_fattura").delete().eq("id", ids.articoloFatturaId);
      if (riga.regolaCreata?.tipo === "fissa") await supabase.from("ci_regole_fornitore_fissa").delete().eq("id", riga.regolaCreata.id);
      if (riga.regolaCreata?.tipo === "parolaChiave") await supabase.from("ci_regole_fornitore_variabile").delete().eq("id", riga.regolaCreata.id);
      if (ids.fatturaId) await ricalcolaTotaliFattura(ids.fatturaId);
      aggiornaRiga(riga.id, { salvata: false, idsSalvati: null, regolaCreata: null });
    } catch (err) {
      alert(`⚠️ Errore nell'annullamento:\n\n${err.message}`);
    }
  }

  async function salvaTutteLeRimanenti() {
    const daSalvare = righe.filter(r => !r.giaCaricata && !r.salvata);
    if (daSalvare.length === 0) { alert("Non ci sono righe da salvare."); return; }
    for (const r of daSalvare) {
      // eslint-disable-next-line no-await-in-loop
      await salvaRiga(r);
    }
  }

  const stats = {
    totale: righe.length,
    fcv: righe.filter(r => r.stato === "FCV" && !r.giaCaricata).length,
    fcf: righe.filter(r => r.stato === "FCF" && !r.giaCaricata).length,
    maschera: righe.filter(r => r.stato === "MASCHERA" && !r.giaCaricata).length,
    giaCaricate: righe.filter(r => r.giaCaricata).length,
    nonQuadrano: righe.filter(r => r.nonQuadra && !r.giaCaricata).length,
    salvate: righe.filter(r => r.salvata).length,
  };

  if (loadingDati) return <div style={{ padding: 20, color: C.muted }}>Caricamento dati di riferimento...</div>;

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Carica Fatture</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Carica un file, classifica e salva riga per riga — non serve aspettare la fine.
      </p>

      {bozzaTrovata && righe.length === 0 && (
        <div style={{ background: C.yellow + "18", border: `1.5px solid ${C.yellow}`, borderRadius: 10, padding: 14, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13 }}>
            Hai un'importazione non salvata ({bozzaTrovata.contenuto.length} righe) dell'ultima sessione — vuoi riprenderla?
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={riprendiBozza} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Riprendi</button>
            <button onClick={scartaBozza} style={{ background: "transparent", color: C.muted, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Scarta</button>
          </div>
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button onClick={() => setModalita("excel")} style={toggleBtn(modalita === "excel")}>📊 File Excel</button>
          <button onClick={() => setModalita("pdf")} style={toggleBtn(modalita === "pdf")}>📁 Cartella PDF</button>
        </div>

        {modalita === "excel" ? (
          <>
            <label style={{ fontSize: 13, fontWeight: 700, color: C.muted, display: "block", marginBottom: 8 }}>
              File Excel (colonne: Fornitore, P.IVA, Numero, Data, Descrizione, Quantità, U.M., Prezzo unitario, Imponibile, Aliquota IVA)
            </label>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={gestisciFile} />
          </>
        ) : (
          <>
            <label style={{ fontSize: 13, fontWeight: 700, color: C.muted, display: "block", marginBottom: 8 }}>
              Seleziona la cartella con i PDF delle fatture — vengono letti automaticamente uno per uno tramite Claude
            </label>
            <input ref={cartellaInputRef} type="file" webkitdirectory="" directory="" multiple onChange={gestisciCartellaPdf} disabled={leggendoPdf} />
            <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
              Nota: ogni PDF letto tramite Claude ha un piccolo costo a consumo (sul tuo account API Anthropic).
            </div>
            {leggendoPdf && (
              <div style={{ marginTop: 12, background: C.bg, borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>Lettura in corso: {progressoPdf.fatti} / {progressoPdf.totale}</div>
                <div style={{ height: 6, background: C.border, borderRadius: 4, marginTop: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: C.primary, borderRadius: 4, width: `${progressoPdf.totale > 0 ? (progressoPdf.fatti / progressoPdf.totale) * 100 : 0}%`, transition: "width 0.3s" }} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {righe.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <StatBox label="Totale righe" value={stats.totale} color={C.primary} />
            <StatBox label="Salvate" value={stats.salvate} color={C.green} />
            <StatBox label="Da classificare" value={stats.maschera} color={stats.maschera > 0 ? C.red : C.green} />
            {stats.giaCaricate > 0 && <StatBox label="Già caricate (saltate)" value={stats.giaCaricate} color={C.accent} />}
            {stats.nonQuadrano > 0 && <StatBox label="Non quadrano (da verificare)" value={stats.nonQuadrano} color="#B8860B" />}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {righe.map(r => (
              <RigaFattura
                key={r.id} riga={r}
                aree={areeDisponibili()} centriPerArea={centriPerArea}
                onChange={campi => aggiornaRiga(r.id, campi)}
                onSalva={() => salvaRiga(r)}
                onAnnulla={() => annullaSalvataggioRiga(r)}
              />
            ))}
          </div>

          {stats.salvate < righe.filter(r => !r.giaCaricata).length && (
            <button onClick={salvaTutteLeRimanenti} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              Salva tutte le rimanenti
            </button>
          )}
        </>
      )}
    </div>
  );
}

function toggleBtn(attivo) {
  return {
    background: attivo ? C.primary : "transparent", color: attivo ? "#fff" : C.muted,
    border: `1.5px solid ${attivo ? C.primary : C.border}`, borderRadius: 8,
    padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
  };
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: color + "15", borderRadius: 10, padding: "10px 16px", minWidth: 120 }}>
      <div style={{ fontSize: 12, color, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function RigaFattura({ riga, aree, centriPerArea, onChange, onSalva, onAnnulla }) {
  const r = riga;
  const bordoColore = r.giaCaricata ? C.accent : r.salvata ? C.green : r.nonQuadra ? "#B8860B" : r.stato === "MASCHERA" ? C.red : r.stato === "FCF" ? C.blue : C.green;
  const isTrasportoAnimali = r.editArea === "TRASPORTO ANIMALI";
  const isAcquistoAnimali = r.editArea === "ACQUISTO ANIMALI";
  const isAmmortamento = r.editArea === "Ammortamenti";
  const eraMaschera = r.stato === "MASCHERA"; // solo per queste ha senso proporre di creare una regola

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${bordoColore}`, borderRadius: 10, padding: 14, opacity: r.giaCaricata ? 0.6 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div>
          <strong>{r.fornitore}</strong> — {r.descrizione}
          <div style={{ fontSize: 12, color: C.muted }}>Fatt. {r.numero} del {r.data} · Imponibile {r.imponibile?.toFixed(2)}€</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {r.quantita} {r.unita_misura} × {r.prezzo_unitario?.toFixed(2)}€/{r.unita_misura}
            {r.aliquota_iva != null && ` · IVA ${r.aliquota_iva}%`}
          </div>
        </div>
        <span style={{ background: bordoColore + "22", color: bordoColore, padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, height: "fit-content" }}>
          {r.giaCaricata ? "GIÀ CARICATA" : r.salvata ? "✓ SALVATA" : r.nonQuadra ? "⚠️ NON QUADRA" : r.stato}
        </span>
      </div>

      {r.nonQuadra && !r.giaCaricata && (
        <div style={{ fontSize: 12, color: "#B8860B", background: "#B8860B15", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontWeight: 600 }}>
          ⚠️ La somma delle righe di questa fattura ({typeof r.dettaglioQuadratura?.totaleCalcolato === "number" ? r.dettaglioQuadratura.totaleCalcolato.toFixed(2) : r.dettaglioQuadratura?.totaleCalcolato}€)
          non coincide con il totale indicato sul PDF originale ({typeof r.dettaglioQuadratura?.totalePdf === "number" ? r.dettaglioQuadratura.totalePdf.toFixed(2) : r.dettaglioQuadratura?.totalePdf}€) — verificala con attenzione prima di salvare, potrebbe mancare una riga.
        </div>
      )}

      {r.giaCaricata && (
        <div style={{ fontSize: 12, color: C.accent, fontStyle: "italic" }}>
          Questa fattura è già presente — non verrà salvata di nuovo.
        </div>
      )}

      {!r.giaCaricata && r.salvata && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.green + "10", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 12, color: C.muted }}>
            {r.editArea} {r.editCentro && `· ${r.editCentro}`} {r.editDestinazione && `· ${r.editDestinazione}`}
            {r.regolaCreata && <span style={{ color: C.green, fontWeight: 700 }}> · regola {r.regolaCreata.tipo === "fissa" ? "FCF" : "FCV"} creata</span>}
          </div>
          <button onClick={onAnnulla} style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: C.muted, cursor: "pointer" }}>
            ↩️ Annulla e ricarica
          </button>
        </div>
      )}

      {!r.giaCaricata && !r.salvata && (
        <>
          {r.nota && <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", marginBottom: 8 }}>{r.nota}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
            <Select label="Area" value={r.editArea} options={aree}
              onChange={v => onChange({ editArea: v, editCentro: "", editTipo: v === "Ammortamenti" ? "Ammortizzabile" : "" })} />
            {!isTrasportoAnimali && !isAcquistoAnimali && (
              <Select label="Centro di Costo" value={r.editCentro} options={centriPerArea(r.editArea)} onChange={v => onChange({ editCentro: v })} />
            )}
            {!isAcquistoAnimali && (
              <Select label="Destinazione" value={r.editDestinazione} options={["Bovini", "Suini", "Ovini", "Generali", "Pollame", "Cavalli"]} onChange={v => onChange({ editDestinazione: v })} />
            )}
            {!isTrasportoAnimali && !isAcquistoAnimali && (
              <Select label="Tipo di Costo" value={r.editTipo}
                options={r.editArea === "Ammortamenti" ? ["Ammortizzabile"] : ["Fisso", "Variabile"]}
                disabled={r.editArea === "Ammortamenti"} onChange={v => onChange({ editTipo: v })} />
            )}
            <Select label="Aliquota IVA" value={r.aliquota_iva != null ? String(r.aliquota_iva) : ""} options={["0", "4", "5", "10", "22"]}
              onChange={v => onChange({ aliquota_iva: v === "" ? null : parseFloat(v) })} />
          </div>

          {isAcquistoAnimali && (
            <div style={{ marginTop: 10, padding: 10, background: C.bg, borderRadius: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
              <Select label="Specie" value={r.specieAcquisto} options={SPECIE_ACQUISTO}
                onChange={v => onChange({ specieAcquisto: v, razzaAcquisto: "" })} />
              <Select label="Razza" value={r.razzaAcquisto} options={RAZZE_PER_SPECIE[r.specieAcquisto] || []}
                onChange={v => onChange({ razzaAcquisto: v })} />
              <Select label="Destinazione acquisto" value={r.destAcquisto} options={["Riproduzione", "Ingrasso", "Mista", "Lotti"]} onChange={v => onChange({ destAcquisto: v })} />
              <Testo label="BDN (se noto)" value={r.bdnAcquisto} onChange={v => onChange({ bdnAcquisto: v })} />
              <Testo label="Nr. Lotto (se noto)" value={r.lottoAcquisto} onChange={v => onChange({ lottoAcquisto: v })} />
            </div>
          )}

          {isAmmortamento && (
            <div style={{ marginTop: 10, padding: 10, background: "#EFEAE0", borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: C.accent, fontWeight: 700, marginBottom: 8 }}>
                📐 Questo costo diventerà un Cespite — completa i dati per il piano di ammortamento:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                <Select label="Categoria Ammortamento" value={r.categoriaAmmortamento} options={CATEGORIE_AMMORTAMENTO} onChange={v => onChange({ categoriaAmmortamento: v })} />
                <Select label="Imputazione" value={r.imputazioneAmmortamento} options={["Bovini", "Ovini", "Generali", "Nessuno"]} onChange={v => onChange({ imputazioneAmmortamento: v })} />
                <Testo label="Anno acquisto" tipo="number" value={r.annoAcquistoAmmortamento} onChange={v => onChange({ annoAcquistoAmmortamento: v })} />
                <Testo label="% Ammortamento annuo" tipo="number" value={r.pctAmmortamento} onChange={v => onChange({ pctAmmortamento: v })} />
              </div>
              {r.pctAmmortamento > 0 && (
                <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>→ durata stimata: {Math.round(100 / parseFloat(r.pctAmmortamento))} anni</div>
              )}
            </div>
          )}

          {isTrasportoAnimali && (
            <div style={{ marginTop: 10, padding: 10, background: "#FFF3E0", borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: C.accent, fontWeight: 700, marginBottom: 8 }}>
                ⚠️ Trasporto Animali richiede sempre la ripartizione manuale — dividi l'imponibile ({r.imponibile?.toFixed(2)}€) tra le due destinazioni:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Testo label="Trasporto verso il macello (€)" tipo="number" value={r.importoMacello} onChange={v => onChange({ importoMacello: v })} />
                <Testo label="Ingresso in allevamento (€)" tipo="number" value={r.importoIngresso} onChange={v => onChange({ importoIngresso: v })} />
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                Somma inserita: {((parseFloat(r.importoMacello) || 0) + (parseFloat(r.importoIngresso) || 0)).toFixed(2)}€ — deve essere uguale a {r.imponibile?.toFixed(2)}€
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginTop: 8 }}>
                <Select label="Specie (per la parte ingresso)" value={r.specieAcquisto} options={SPECIE_ACQUISTO} onChange={v => onChange({ specieAcquisto: v })} />
                <Testo label="BDN/Lotto (se noto)" value={r.bdnAcquisto} onChange={v => onChange({ bdnAcquisto: v })} />
              </div>
            </div>
          )}

          {eraMaschera && !isAcquistoAnimali && (
            <div style={{ marginTop: 10, padding: 10, background: C.blue + "10", borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: C.blue, fontWeight: 700, marginBottom: 6 }}>
                💡 Vuoi che le prossime fatture di questo fornitore si classifichino da sole?
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="radio" checked={r.memorizzaRegola === "nessuna"} onChange={() => onChange({ memorizzaRegola: "nessuna" })} />
                  Solo questa volta
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="radio" checked={r.memorizzaRegola === "fissa"} onChange={() => onChange({ memorizzaRegola: "fissa" })} />
                  Sempre per questo fornitore (regola fissa)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="radio" checked={r.memorizzaRegola === "parolaChiave"} onChange={() => onChange({ memorizzaRegola: "parolaChiave" })} />
                  Solo quando la descrizione contiene una parola chiave
                </label>
              </div>
              {r.memorizzaRegola === "parolaChiave" && (
                <div style={{ marginTop: 8, maxWidth: 300 }}>
                  <Testo label="Parola chiave da riconoscere" value={r.parolaChiaveRegola} onChange={v => onChange({ parolaChiaveRegola: v })} />
                </div>
              )}
            </div>
          )}

          <button onClick={onSalva} disabled={r.salvataggioInCorso}
            style={{ marginTop: 12, background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {r.salvataggioInCorso ? "Salvataggio..." : "💾 Salva questa riga"}
          </button>
        </>
      )}
    </div>
  );
}

function Select({ label, value, options, onChange, disabled }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>{label}</label>
      <select value={value || ""} disabled={disabled} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
        <option value="">— seleziona —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
function Testo({ label, value, onChange, tipo = "text" }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>{label}</label>
      <input type={tipo} value={value || ""} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
    </div>
  );
}
