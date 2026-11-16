import { oggiRoma } from "./dateRoma";
import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx-js-style";
import JSZip from "jszip";
import { supabase } from "./supabase";
import { C } from "./style";
import { classificaRiga } from "./motoreClassificazione";
import { CATEGORIE_AMMORTAMENTO, IMPUTAZIONI_CESPITE, creaCespiteDaRiga, anniDaRiga, percentualeDaAnni } from "./cespitiDaFatture";
import { applicaDocumento, assicuraScadenze, chiaveDocumento } from "./documentoFattura"; // versione 350
import { righeMancanti, normDescr } from "./arubaCarico"; // versione 355
import { leggiFattureRicevute } from "./letturaXmlRicevute"; // versione 350
import { rigaDaGrezza, validaRiga } from "./righeFatturePassive"; // versione 384
import { trovaOCreaFornitore as trovaOCreaFornitoreComune, ricalcolaTotaliFattura, salvaRigaFatturaPassiva } from "./salvataggioFatturePassive"; // versione 384
import { round2, numeroRobusto, calcolaImponibile, leggiAliquotaIva, formattaData, formattaEuro, formattaNumero, fetchAllPages, leggiInBlocchi } from "./parsingUtils";

// Versione 261: categorie, anni e creazione del cespite nel modulo comune cespitiDaFatture.js

const SPECIE_ACQUISTO = ["Bovini", "Suini", "Ovini", "Piu' specie acquistate insieme"];
const RAZZE_PER_SPECIE = {
  "Bovini": ["Chianina", "Marchigiana", "Maremmana", "Limousine", "Charolais", "Frisona", "Pezzata Rossa", "Meticcia", "Altra"],
  "Suini": ["Large White", "Landrace", "Duroc", "Cinta senese", "Mora romagnola", "Nero casertano", "Nero apucalabro", "Meticcia", "Altra"],
  "Ovini": ["Sopravvissana", "Suffolk", "Meticcia", "Altra"],
  "Piu' specie acquistate insieme": ["Da definire in podereverdeapp.it"],
};

// Versione 355 (procedura unica di carico): la pagina può stare dentro «Documenti arrivati» (incorporata), con i documenti
// già letti dallo scarico di Aruba. Incorporata: niente bozza (non tocca quella del carico normale) e, se si annulla una riga,
// il debito creato da «Prima di tutto» resta (il pagamento non deve mai saltare).
export default function CaricaFatture({ documentiIniziali = null, incorporata = false } = {}) {
  const [fornitori, setFornitori] = useState([]);
  const [regoleFisse, setRegoleFisse] = useState([]);
  const [regoleVariabili, setRegoleVariabili] = useState([]);
  const [pianoConti, setPianoConti] = useState([]);
  const [regoleArmonizzazione, setRegoleArmonizzazione] = useState([]);
  const [righe, setRighe] = useState([]); // righe caricate + classificate
  const [loadingDati, setLoadingDati] = useState(true);
  const [modalita, setModalita] = useState("excel"); // "excel" | "pdf"
  const [leggendoPdf, setLeggendoPdf] = useState(false);
  const [progressoPdf, setProgressoPdf] = useState({ fatti: 0, totale: 0, erroriFile: [] });
  const [pdfDaRinominare, setPdfDaRinominare] = useState([]); // [{ file, nomeSuggerito }] — pronti per lo ZIP
  const [bozzaTrovata, setBozzaTrovata] = useState(null);
  const fileInputRef = useRef(null);
  const cartellaInputRef = useRef(null);
  const xmlInputRef = useRef(null); // versione 350
  const salvataggioBozzaTimeout = useRef(null);

  useEffect(() => { caricaDatiRiferimento(); }, []);
  const documentiGiaPassati = useRef(false);
  useEffect(() => {
    if (loadingDati || !documentiIniziali || documentiGiaPassati.current) return;
    documentiGiaPassati.current = true;
    const perChiave = new Map(); const dati = [];
    for (const d of documentiIniziali) {
      perChiave.set(chiaveDocumento(d.piva || d.fornitore, d.numero, formattaData(d.data)), d);
      (d.righe.length ? d.righe : [{ descrizione: "(documento senza righe)", quantita: 1, prezzo_unitario: d.imponibile, imponibile: d.imponibile, aliquota_iva: 0 }]).forEach(r => dati.push({
        "Fornitore": d.fornitore, "P.IVA": d.piva, "Numero": d.numero, "Data": d.data, "Descrizione": r.descrizione,
        "Quantità": r.quantita, "U.M.": r.unita_misura, "Prezzo unitario": r.prezzo_unitario, "Imponibile": r.imponibile, "Aliquota IVA": r.aliquota_iva,
      }));
    }
    if (dati.length > 0) elaboraRigheGrezze(dati, [], perChiave);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingDati, documentiIniziali]);

  // Salvataggio automatico della bozza (con debounce) ogni volta che le righe cambiano
  useEffect(() => {
    if (righe.length === 0 || incorporata) return;
    if (salvataggioBozzaTimeout.current) clearTimeout(salvataggioBozzaTimeout.current);
    salvataggioBozzaTimeout.current = setTimeout(async () => {
      await supabase.from("ci_bozze_import").delete().neq("id", 0);
      await supabase.from("ci_bozze_import").insert([{ contenuto: righe }]);
    }, 1500);
    return () => clearTimeout(salvataggioBozzaTimeout.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [righe]);

  async function caricaDatiRiferimento() {
    setLoadingDati(true);
    const [{ data: f, error: eF }, { data: rf, error: eRF }, { data: rv, error: eRV }, { data: pc, error: ePC }, { data: ra, error: eRA }] =
      await Promise.all([
        // Versione 280: letta a pagine (il database consegna al massimo 1.000 righe per richiesta)
        fetchAllPages((da, a) => supabase.from("ci_fornitori").select("*").order("id").range(da, a)),
        fetchAllPages((da, a) => supabase.from("ci_regole_fornitore_fissa").select("*").order("id").range(da, a)),
        fetchAllPages((da, a) => supabase.from("ci_regole_fornitore_variabile").select("*").order("id").range(da, a)),
        fetchAllPages((da, a) => supabase.from("ci_piano_dei_conti").select("*").order("area").order("centro_costo").order("id").range(da, a)),
        fetchAllPages((da, a) => supabase.from("ci_regole_armonizzazione_unita").select("fornitore_id, descrizione_prodotto").order("id").range(da, a)),
      ]);
    const errore = eF || eRF || eRV || ePC;
    if (errore) {
      alert(`⚠️ Errore nel caricamento dei dati di riferimento:\n\n${errore.message}`);
    } else {
      setFornitori(f || []);
      setRegoleFisse(rf || []);
      setRegoleVariabili(rv || []);
      setPianoConti(pc || []);
      setRegoleArmonizzazione(ra || []);
    }
    if (eRA) console.error("Regole armonizzazione non caricate:", eRA.message);
    setLoadingDati(false);
    if (incorporata) return;

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

  // Nome file suggerito per il PDF rinominato: Fornitore_Data_Numero.pdf — sanifica i
  // caratteri non ammessi nei nomi file (/ \ : * ? " < > |) e usa il nome originale
  // come riserva se mancano dati essenziali.
  function costruisciNomeFilePdf(fornitore, data, numero, nomeOriginale) {
    const pulisci = s => String(s || "").trim().replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, "_");
    const f = pulisci(fornitore), d = pulisci(data), n = pulisci(numero);
    if (!f && !d && !n) return nomeOriginale;
    return `${f || "Fornitore"}_${d || "data"}_${n || "numero"}.pdf`;
  }

  async function scaricaPdfRinominati() {
    const zip = new JSZip();
    const nomiUsati = new Set();
    for (const { file, nomeSuggerito } of pdfDaRinominare) {
      let nomeFinale = nomeSuggerito;
      let contatore = 2;
      while (nomiUsati.has(nomeFinale)) { // evita di sovrascrivere se due fatture danno lo stesso nome
        nomeFinale = nomeSuggerito.replace(/\.pdf$/i, `_${contatore}.pdf`);
        contatore++;
      }
      nomiUsati.add(nomeFinale);
      zip.file(nomeFinale, file);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Fatture_rinominate_${oggiRoma()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
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
    setPdfDaRinominare([]);
    const datiCombinati = [];
    const erroriFile = [];
    const fattureNonQuadrano = [];
    const nuoviPdfRinominati = [];
    const documentiPdf = new Map(); // versione 350

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
          const nomeSuggerito = costruisciNomeFilePdf(est.fornitore, est.data, est.numero, file.name);
          nuoviPdfRinominati.push({ file, nomeSuggerito });
          // Versione 350: totali del documento letti sul PDF
          if (est.verifica_totali && [est.verifica_totali.imponibile_pdf, est.verifica_totali.iva_pdf, est.verifica_totali.totale_pdf].every(x => x !== null && x !== undefined && String(x).trim() !== "" && Number.isFinite(Number(x)))) {
            documentiPdf.set(chiaveDocumento(est.piva || est.fornitore, est.numero, formattaData(est.data)), {
              imponibile: Number(est.verifica_totali.imponibile_pdf), iva: Number(est.verifica_totali.iva_pdf), totale: Number(est.verifica_totali.totale_pdf), rate: [] });
          }
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
    setPdfDaRinominare(nuoviPdfRinominati);
    if (fattureNonQuadrano.length > 0) {
      alert(`⚠️ ${fattureNonQuadrano.length} fatture hanno una somma delle righe che NON coincide con i totali scritti sul PDF — controllale con attenzione prima di salvarle, potrebbe mancare una riga o essere stata letta male:\n\n${fattureNonQuadrano.join("\n")}`);
    }
    if (erroriFile.length > 0) {
      alert(`⚠️ ${erroriFile.length} file su ${pdfFile.length} non sono stati letti correttamente:\n\n${erroriFile.join("\n")}`);
    }
    if (datiCombinati.length > 0) await elaboraRigheGrezze(datiCombinati, [], documentiPdf);
  }

  // Versione 350: fatture elettroniche (XML, .p7m o .zip di Aruba). Totali e scadenze dal documento.
  async function gestisciXml(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      const { documenti, scartati } = await leggiFattureRicevute(files);
      const perChiave = new Map(); const dati = [];
      for (const d of documenti) {
        perChiave.set(chiaveDocumento(d.piva || d.fornitore, d.numero, formattaData(d.data)), d);
        (d.righe.length ? d.righe : [{ descrizione: "(documento senza righe)", quantita: 1, prezzo_unitario: d.imponibile, imponibile: d.imponibile, aliquota_iva: 0 }]).forEach(r => dati.push({
          "Fornitore": d.fornitore, "P.IVA": d.piva, "Numero": d.numero, "Data": d.data, "Descrizione": r.descrizione,
          "Quantità": r.quantita, "U.M.": r.unita_misura, "Prezzo unitario": r.prezzo_unitario, "Imponibile": r.imponibile, "Aliquota IVA": r.aliquota_iva,
        }));
      }
      if (scartati.length) alert(`⚠️ ${scartati.length} file non letti:\n\n${scartati.join("\n")}`);
      alert(`Lette ${documenti.length} fatture elettroniche con ${dati.length} righe. Totali e scadenze verranno presi dal documento.`);
      if (dati.length > 0) await elaboraRigheGrezze(dati, [], perChiave);
    } catch (err) {
      alert(`⚠️ Errore nella lettura delle fatture elettroniche:\n\n${err.message}`);
    }
    if (xmlInputRef.current) xmlInputRef.current.value = "";
  }

  async function elaboraRigheGrezze(dati, verifica = [], documentiPerChiave = null) {
    // Versione 384: la riga nasce con rigaDaGrezza (righeFatturePassive.js), lo stesso codice di prima spostato in un modulo comune
    const risultati = dati.map((r, i) => rigaDaGrezza(r, i, { fornitori, regoleFisse, regoleVariabili }, documentiPerChiave));

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
          // Versione 350: totali del documento (riepilogo IVA del PDF) e, se ci sono, i dati di pagamento
          documento: {
            imponibile: numeroRobusto(v["Imponibile da PDF"]), iva: numeroRobusto(v["IVA da PDF"]), totale: numeroRobusto(v["Totale da PDF"]),
            rate: (v["Data scadenza"] || v["Scadenza"]) ? [{ importo: numeroRobusto(v["Importo da pagare"] || v["Totale da PDF"]),
              scadenza: formattaData(v["Data scadenza"] || v["Scadenza"]), modalita: String(v["Modalità di pagamento"] || "").trim() || null,
              iban: String(v["IBAN"] || "").replace(/\s+/g, "") || null }] : [],
          },
        });
      });
      risultati.forEach(r => {
        const chiave = `${r.fornitore.trim().toLowerCase()}|${r.numero}|${r.data}`;
        const match = mappaVerifica.get(chiave);
        if (match && !r.documento) r.documento = match.documento; // versione 350
        if (match && !match.corrisponde) {
          r.nonQuadra = true;
          r.dettaglioQuadratura = match;
        }
      });
    }

    const fornitoreIds = [...new Set(risultati.map(r => r.fornitore_obj?.id).filter(Boolean))];
    if (fornitoreIds.length > 0) {
      const [{ data: fattureEsistenti, error }, { data: acquistiEsistenti, error: eAcq }] = await Promise.all([
        // Versione 280: controllo dei doppioni su TUTTE le fatture dei fornitori, lette a pagine
        leggiInBlocchi(fornitoreIds, (blocco, da, a) => supabase.from("ci_fatture").select("fornitore_id, numero, data").in("fornitore_id", blocco).order("id").range(da, a)),
        leggiInBlocchi(fornitoreIds, (blocco, da, a) => supabase.from("ci_report_acquisto_animali").select("fornitore_id, numero_fattura, data_fattura").in("fornitore_id", blocco).order("id").range(da, a)),
      ]);
      if (error || eAcq) {
        alert(`⚠️ Non sono riuscito a controllare i duplicati (procedo comunque, ma verifica a mano):\n\n${(error || eAcq).message}`);
      } else {
        const chiaviEsistenti = new Set((fattureEsistenti || []).map(f => `${f.fornitore_id}|${f.numero}|${f.data}`));
        // Acquisto Animali salva su una tabella diversa (mai una riga in ci_fatture),
        // quindi il controllo "già caricata" va esteso anche a questa — altrimenti
        // ricaricando lo stesso PDF non viene mai riconosciuto come già salvato
        (acquistiEsistenti || []).forEach(a => chiaviEsistenti.add(`${a.fornitore_id}|${a.numero_fattura}|${a.data_fattura}`));
        risultati.forEach(r => {
          if (r.fornitore_obj) {
            r.giaCaricata = chiaviEsistenti.has(`${r.fornitore_obj.id}|${r.numero}|${r.data}`);
          }
        });
        // Versione 355: dentro «Documenti arrivati» una fattura può essere registrata in parte (pagina chiusa a metà):
        // «già caricata» vale riga per riga, confrontando con le righe e gli acquisti di animali già salvati
        if (incorporata) {
          const gruppi = new Map();
          risultati.filter(r => r.giaCaricata && r.fornitore_obj).forEach(r => {
            const k = `${r.fornitore_obj.id}|${r.numero}|${r.data}`;
            if (!gruppi.has(k)) gruppi.set(k, { fid: r.fornitore_obj.id, numero: r.numero, data: r.data, righe: [] });
            gruppi.get(k).righe.push(r);
          });
          for (const g of gruppi.values()) {
            const { data: fat, error: eF } = await supabase.from("ci_fatture").select("id").eq("fornitore_id", g.fid).eq("numero", g.numero).eq("data", g.data).eq("tipo", "PASSIVA").maybeSingle();
            const { data: art, error: eA } = fat ? await supabase.from("ci_articoli_fattura").select("descrizione").eq("fattura_id", fat.id) : { data: [], error: null };
            const { data: acq, error: eQ } = await supabase.from("ci_report_acquisto_animali").select("importo, articolo_fattura_id").eq("fornitore_id", g.fid).eq("numero_fattura", g.numero).eq("data_fattura", g.data);
            const { data: scart, error: eR } = await supabase.from("ci_righe_scartate").select("descrizione").eq("fornitore_id", g.fid);
            if (eF || eA || eQ || eR) { alert(`⚠️ Non sono riuscito a controllare le righe già salvate di ${g.numero}: le lascio bloccate.\n\n${(eF || eA || eQ || eR).message}`); continue; }
            const esitoRighe = righeMancanti(g.righe, { descrizioni: (art || []).map(x => x.descrizione), importiAcquisti: (acq || []).filter(x => x.articolo_fattura_id == null).map(x => x.importo),
              scartate: new Set((scart || []).map(x => normDescr(x.descrizione))) });
            const mancano = new Set(esitoRighe); const ambigue = new Set(esitoRighe.ambigue);
            // righe ambigue: un acquisto di animali salvato ha lo stesso importo di più righe; non si sa quale: si lasciano tutte aperte con l'avviso
            g.righe.forEach((r, i) => { r.giaCaricata = !mancano.has(i) && !ambigue.has(i); r.ambigua = ambigue.has(i); });
          }
        }
      }

      const { data: scartatePrecedenti } = await leggiInBlocchi(fornitoreIds, (blocco, da, a) => supabase
        .from("ci_righe_scartate").select("fornitore_id, descrizione").in("fornitore_id", blocco).order("id").range(da, a));
      const chiaviScartate = new Set((scartatePrecedenti || []).map(s => `${s.fornitore_id}|${s.descrizione.trim().toLowerCase()}`));
      risultati.forEach(r => {
        if (r.fornitore_obj && chiaviScartate.has(`${r.fornitore_obj.id}|${r.descrizione.trim().toLowerCase()}`)) {
          r.scartata = true;
          r.giaScartataInPrecedenza = true;
        }
      });
    }

    // Versione 355 (pagina «Documenti arrivati»): una riga a 0 € non ha importo e non si registra (come nel carico di sempre da Aruba)
    // (solo se il documento ha almeno una riga con importo: un documento di sole righe a 0 € si registra come sempre, se no la fattura non nascerebbe)
    if (incorporata) {
      const conImporto = new Set(risultati.filter(r => Math.abs(Number(r.imponibile) || 0) >= 0.005).map(r => `${r.piva}|${r.numero}|${r.data}`));
      risultati.forEach(r => { if (!r.giaCaricata && !r.scartata && Math.abs(Number(r.imponibile) || 0) < 0.005 && conImporto.has(`${r.piva}|${r.numero}|${r.data}`)) { r.scartata = true; r.rigaAZero = true; } });
    }

    setRighe(prev => [...prev, ...risultati]);
  }


  function aggiornaRiga(id, campi) {
    setRighe(prev => prev.map(r => (r.id === id ? { ...r, ...campi } : r)));
  }

  // Versione 384: validaRiga è in righeFatturePassive.js (stesso codice, spostato)

  // Versione 384: trovaOCreaFornitore, trovaOCreaFattura, ricalcolaTotaliFattura e le scritture di salvaRiga
  // sono spostate, senza cambiarle, in salvataggioFatturePassive.js (le usa anche «Leggi le fatture passive di Aruba»).
  // Qui restano i controlli, le finestre e l'aggiornamento della pagina, come prima.
  function trovaOCreaFornitore(riga) {
    return trovaOCreaFornitoreComune(riga, { nuovoFornitore: nuovo => setFornitori(prev => [...prev, nuovo]) });
  }

  async function salvaRiga(riga) {
    if (riga.giaCaricata) { alert("Questa fattura risulta già caricata in precedenza."); return; }
    if (riga.scartata) { alert("Questa riga è stata scartata — non verrà salvata."); return; }
    const errore = validaRiga(riga);
    if (errore) { alert(`⚠️ ${errore}`); return; }

    aggiornaRiga(riga.id, { salvataggioInCorso: true });
    try {
      const esito = await salvaRigaFatturaPassiva(riga, {
        nuovoFornitore: nuovo => setFornitori(prev => [...prev, nuovo]),
        confermaCespiteDoppio: async (_possibili, testo) => window.confirm(testo),
        avviso: testo => alert(testo),
      });
      if (esito.annullata) { aggiornaRiga(riga.id, { salvataggioInCorso: false }); return; }
      const { idsSalvati, regolaCreata, regola, fornitoreId } = esito;
      if (regolaCreata?.tipo === "fissa") setRegoleFisse(prev => [...prev.filter(r => r.fornitore_id !== fornitoreId), regola]);
      else if (regolaCreata?.tipo === "parolaChiave") setRegoleVariabili(prev => [...prev, regola]);

      aggiornaRiga(riga.id, { salvata: true, salvataggioInCorso: false, idsSalvati, regolaCreata });
    } catch (err) {
      aggiornaRiga(riga.id, { salvataggioInCorso: false });
      alert(`⚠️ Errore nel salvataggio della riga "${riga.descrizione}":\n\n${err.message}`);
    }
  }

  async function scartaRiga(riga) {
    if (!window.confirm(`Scartare questa riga ("${riga.descrizione}") e ricordarla per il futuro? Le prossime fatture di ${riga.fornitore} con questa stessa descrizione verranno scartate automaticamente.`))
      return;
    let fornitoreId = riga.fornitore_obj?.id;
    try {
      fornitoreId = await trovaOCreaFornitore(riga);
      if (fornitoreId) {
        const { error } = await supabase.from("ci_righe_scartate")
          .upsert([{ fornitore_id: fornitoreId, descrizione: riga.descrizione.trim() }], { onConflict: "fornitore_id,descrizione" });
        if (error) throw new Error(error.message);
      }
      aggiornaRiga(riga.id, { scartata: true });
    } catch (err) {
      alert(`⚠️ Errore nello scarto della riga:\n\n${err.message}`);
    }
  }

  async function annullaSalvataggioRiga(riga) {
    if (!window.confirm("Annullare il salvataggio di questa riga? Verrà rimossa dal database e potrai modificarla di nuovo."))
      return;
    const ids = riga.idsSalvati || {};
    try {
      if (ids.dettaglioAmmortamentoId) await supabase.from("ci_articolo_dettaglio_ammortamento").delete().eq("id", ids.dettaglioAmmortamentoId);
      if (ids.cespiteId) await supabase.from("ci_cespiti").delete().eq("id", ids.cespiteId);
      if (ids.reportAcquistoId) await supabase.from("ci_report_acquisto_animali").delete().eq("id", ids.reportAcquistoId);
      // Versione 350: le scadenze nate dall'XML con questo salvataggio se ne vanno, se non hanno pagamenti
      for (const idScad of ids.scadenzeCreate || []) {
        const { data: abb } = await supabase.from("ci_abbinamenti_pagamenti").select("id").eq("scadenza_id", idScad).limit(1);
        if ((abb || []).length === 0) await supabase.from("ci_scadenze").delete().eq("id", idScad).is("fattura_id", null);
      }
      if (ids.articoloFatturaId) await supabase.from("ci_articoli_fattura").delete().eq("id", ids.articoloFatturaId);
      if (riga.regolaCreata?.tipo === "fissa") await supabase.from("ci_regole_fornitore_fissa").delete().eq("id", riga.regolaCreata.id);
      if (riga.regolaCreata?.tipo === "parolaChiave") await supabase.from("ci_regole_fornitore_variabile").delete().eq("id", riga.regolaCreata.id);
      if (ids.fatturaId) {
        // Versione 350: se la fattura resta senza righe, le sue scadenze senza pagamenti se ne vanno con lei
        const { data: rimaste } = await supabase.from("ci_articoli_fattura").select("id").eq("fattura_id", ids.fatturaId).limit(1);
        if ((rimaste || []).length === 0 && incorporata) {
          // Versione 355: il debito è nato con «Prima di tutto» e resta con la fattura (vuota) finché la riga non si salva di nuovo
        } else if ((rimaste || []).length === 0) {
          const { data: scad } = await supabase.from("ci_scadenze").select("id, ci_abbinamenti_pagamenti(id)").eq("fattura_id", ids.fatturaId);
          const conPagamenti = (scad || []).filter(sc => (sc.ci_abbinamenti_pagamenti || []).length > 0);
          for (const sc of (scad || []).filter(x => !conPagamenti.includes(x))) await supabase.from("ci_scadenze").delete().eq("id", sc.id);
          if (conPagamenti.length) alert(`⚠️ La fattura è rimasta senza righe ma ha ${conPagamenti.length} scadenze con pagamenti abbinati: restano nello scadenzario. Togliere prima l'abbinamento dei pagamenti.`);
        } else {
          await ricalcolaTotaliFattura(ids.fatturaId);
        }
      }
      aggiornaRiga(riga.id, { salvata: false, idsSalvati: null, regolaCreata: null });
    } catch (err) {
      alert(`⚠️ Errore nell'annullamento:\n\n${err.message}`);
    }
  }

  async function salvaTutteLeRimanenti() {
    // le righe «ambigue» (un acquisto di animali già salvato con lo stesso importo) si salvano solo una per una, dopo il controllo
    const ambigue = righe.filter(r => r.ambigua && !r.salvata && !r.scartata);
    const daSalvare = righe.filter(r => !r.giaCaricata && !r.salvata && !r.scartata && !r.ambigua);
    if (ambigue.length) alert(`${ambigue.length} righe con l'avviso giallo non si salvano con «Salva tutte»: controllare il Report Acquisto Animali e salvarle una per una (o scartarle).`);
    if (daSalvare.length === 0) { if (!ambigue.length) alert("Non ci sono righe da salvare."); return; }
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
    scartate: righe.filter(r => r.scartata).length,
    salvate: righe.filter(r => r.salvata).length,
  };

  if (loadingDati) return <div style={{ padding: 20, color: C.muted }}>Caricamento dati di riferimento...</div>;

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>{incorporata ? "Classifica e registra le fatture nuove" : "Carica Fatture"}</h1>
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

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20, display: incorporata ? "none" : undefined }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button onClick={() => setModalita("excel")} style={toggleBtn(modalita === "excel")}>📊 File Excel</button>
          <button onClick={() => setModalita("pdf")} style={toggleBtn(modalita === "pdf")}>📁 Cartella PDF</button>
          <button onClick={() => setModalita("xml")} style={toggleBtn(modalita === "xml")}>🧾 Fatture elettroniche (XML)</button>
        </div>

        {modalita === "xml" ? (
          <>
            <label style={{ fontSize: 13, fontWeight: 700, color: C.muted, display: "block", marginBottom: 8 }}>
              Scegli i file XML delle fatture ricevute (anche .p7m) oppure lo .zip scaricato da Aruba: totali e scadenze si prendono dal documento
            </label>
            <input ref={xmlInputRef} type="file" accept=".xml,.p7m,.zip" multiple onChange={gestisciXml} />
          </>
        ) : modalita === "excel" ? (
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
            {!leggendoPdf && pdfDaRinominare.length > 0 && (
              <button onClick={scaricaPdfRinominati}
                style={{ marginTop: 10, background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                📦 Scarica {pdfDaRinominare.length} PDF rinominati (ZIP) — Fornitore_Data_Numero.pdf
              </button>
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
            {stats.scartate > 0 && <StatBox label="Scartate" value={stats.scartate} color={C.muted} />}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {righe.map(r => (
              <RigaFattura
                key={r.id} riga={r}
                aree={areeDisponibili()} centriPerArea={centriPerArea}
                regoleArmonizzazione={regoleArmonizzazione}
                onChange={campi => aggiornaRiga(r.id, campi)}
                onSalva={() => salvaRiga(r)}
                onScarta={() => scartaRiga(r)}
                onAnnulla={() => annullaSalvataggioRiga(r)}
              />
            ))}
          </div>

          {stats.salvate < righe.filter(r => !r.giaCaricata && !r.scartata).length && (
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

// Versione 384: esportata per «Leggi le fatture passive di Aruba»; con senzaSalva il tasto «Salva questa riga» non c'è (si registra tutto insieme)
export function RigaFattura({ riga, aree, centriPerArea, regoleArmonizzazione, onChange, onSalva, onAnnulla, onScarta, senzaSalva = false }) {
  const r = riga;
  const bordoColore = r.giaCaricata ? C.accent : r.scartata ? C.muted : r.salvata ? C.green : r.nonQuadra ? "#B8860B" : r.stato === "MASCHERA" ? C.red : r.stato === "FCF" ? C.blue : C.green;
  const isTrasportoAnimali = r.editArea === "TRASPORTO ANIMALI";
  const isAcquistoAnimali = r.editArea === "ACQUISTO ANIMALI";
  const isAmmortamento = r.editArea === "Ammortamenti";
  const eraMaschera = r.stato === "MASCHERA"; // solo per queste ha senso proporre di creare una regola

  const CENTRI_CON_QUANTITA = ["Foraggio", "Mangimi", "Integratori alimentari", "Coltivazione Sementi", "Coltivazione Concimi e Fitosanitari", "Gasolio e lubrificanti"];
  const centroCostoAttuale = r.editCentro || null;
  const daArmonizzare = centroCostoAttuale && CENTRI_CON_QUANTITA.includes(centroCostoAttuale) && r.fornitore_obj?.id &&
    !(regoleArmonizzazione || []).some(g => g.fornitore_id === r.fornitore_obj.id && g.descrizione_prodotto.trim().toLowerCase() === r.descrizione.trim().toLowerCase());

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${bordoColore}`, borderRadius: 10, padding: 14, opacity: (r.giaCaricata || r.scartata) ? 0.55 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 2 }}>{r.fornitore}</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{r.descrizione}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: bordoColore, marginTop: 2 }}>Imponibile: {formattaEuro(r.imponibile)}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Fatt. {r.numero} del {r.data}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {r.quantita} {r.unita_misura} × {formattaEuro(r.prezzo_unitario)}/{r.unita_misura}
            {r.aliquota_iva != null && ` · IVA ${r.aliquota_iva}%`}
          </div>
        </div>
        <span style={{ background: bordoColore + "22", color: bordoColore, padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, height: "fit-content" }}>
          {r.giaCaricata ? "GIÀ CARICATA" : r.scartata ? "🗑️ SCARTATA" : r.salvata ? "✓ SALVATA" : r.nonQuadra ? "⚠️ NON QUADRA" : r.stato === "MASCHERA" ? "⚖️ Da classificare a mano" : r.stato}
        </span>
      </div>

      {r.stato === "MASCHERA" && !r.salvata && !r.scartata && !r.giaCaricata && (
        <div style={{ fontSize: 12, color: C.red, marginTop: 4, marginBottom: 4 }}>
          Nessuna regola automatica trovata per questo fornitore/prodotto — scegli qui sotto Area, Centro di Costo, Destinazione e Tipo di Costo, {senzaSalva ? "poi, quando tutte le righe sono complete, premi «Registra» in fondo alla pagina." : "poi salva la riga."}
        </div>
      )}

      {daArmonizzare && !r.salvata && !r.scartata && !r.giaCaricata && (
        <div style={{ fontSize: 12, color: "#8B6F00", background: "#FFF7E6", borderRadius: 6, padding: "6px 10px", marginTop: 4, marginBottom: 4 }}>
          ⚖️ Prodotto senza unità di misura confermata per i report di quantità — salva comunque la riga, poi vai in "Da Armonizzare" nel menu per definirla (una volta sola, vale per tutte le fatture future di questo fornitore/prodotto).
        </div>
      )}

      {r.scartata && (
        <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>
          {r.rigaAZero ? "Riga a 0 €: non ha importo e non si registra."
            : r.giaScartataInPrecedenza
            ? "Scartata automaticamente: avevi già deciso di ignorare questa descrizione per questo fornitore."
            : "Scartata — non verrà salvata. Le prossime fatture di questo fornitore con questa stessa descrizione verranno scartate automaticamente."}
        </div>
      )}

      {r.ambigua && !r.salvata && !r.scartata && (
        <div style={{ fontSize: 12, color: "#B8860B", background: "#B8860B15", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontWeight: 600 }}>
          ⚠️ Nel Report Acquisto Animali c'è già un acquisto di {formattaEuro(Math.abs(Number(r.imponibile) || 0))} per questa fattura, e la fattura ha più righe con questo importo:
          il programma non sa quale è già stata salvata. Prima di salvare, controllare nel Report Acquisto Animali per non salvarla due volte.
        </div>
      )}

      {r.nonQuadra && !r.giaCaricata && !r.scartata && (
        <div style={{ fontSize: 12, color: "#B8860B", background: "#B8860B15", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontWeight: 600 }}>
          ⚠️ La somma delle righe di questa fattura ({typeof r.dettaglioQuadratura?.totaleCalcolato === "number" ? formattaNumero(r.dettaglioQuadratura.totaleCalcolato) : r.dettaglioQuadratura?.totaleCalcolato}€)
          non coincide con il totale indicato sul PDF originale ({typeof r.dettaglioQuadratura?.totalePdf === "number" ? formattaNumero(r.dettaglioQuadratura.totalePdf) : r.dettaglioQuadratura?.totalePdf}€) — verificala con attenzione prima di salvare, potrebbe mancare una riga.
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

      {!r.giaCaricata && !r.salvata && !r.scartata && (
        <>
          {r.nota && <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", marginBottom: 8 }}>{r.nota}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
            <Select label="Area" value={r.editArea} options={aree}
              onChange={v => onChange({ editArea: v, editCentro: "", editTipo: v === "Ammortamenti" ? "Ammortizzabile" : "" })} />
            {!isTrasportoAnimali && !isAcquistoAnimali && (
              <Select label="Centro di Costo" value={r.editCentro} options={centriPerArea(r.editArea)} onChange={v => onChange({ editCentro: v })} />
            )}
            {!isAcquistoAnimali && (
              <Select label="Destinazione" value={r.editDestinazione} options={["Bovini", "Suini", "Ovini", "Bovini e Ovini", "Bovini e Suini", "Suini e Ovini", "Generali", "Pollame", "Cavalli"]} onChange={v => onChange({ editDestinazione: v })} />
            )}
            {/* Versione 235: il Tipo di Costo si chiede anche per il Trasporto Animali (parte verso il macello),
                altrimenti la riga restava senza tipo e fuori dai calcoli dei costi */}
            {!isAcquistoAnimali && (
              <Select label={isTrasportoAnimali ? "Tipo di Costo (parte verso il macello)" : "Tipo di Costo"} value={r.editTipo}
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
                <Select label="Imputazione" value={r.imputazioneAmmortamento} options={IMPUTAZIONI_CESPITE} onChange={v => onChange({ imputazioneAmmortamento: v })} />
                <Testo label="Anno acquisto" tipo="number" value={r.annoAcquistoAmmortamento} onChange={v => onChange({ annoAcquistoAmmortamento: v })} />
                <Testo label="Anni di ammortamento" tipo="number" value={r.anniAmmortamento ?? (anniDaRiga(r) || "")} onChange={v => onChange({ anniAmmortamento: v })} />
              </div>
              {anniDaRiga(r) && (
                <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>→ quota annua: {percentualeDaAnni(anniDaRiga(r)).toLocaleString("it-IT")}% del prezzo per {anniDaRiga(r)} anni. Anni di vita reale del bene in azienda (contabilità industriale, non fiscale).</div>
              )}
            </div>
          )}

          {isTrasportoAnimali && (
            <div style={{ marginTop: 10, padding: 10, background: "#FFF3E0", borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: C.accent, fontWeight: 700, marginBottom: 8 }}>
                ⚠️ Trasporto Animali richiede sempre la ripartizione manuale — dividi l'imponibile ({formattaEuro(r.imponibile)}) tra le due destinazioni:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Testo label="Trasporto verso il macello (€)" tipo="number" value={r.importoMacello} onChange={v => onChange({ importoMacello: v })} />
                <Testo label="Ingresso in allevamento (€)" tipo="number" value={r.importoIngresso} onChange={v => onChange({ importoIngresso: v })} />
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                Somma inserita: {formattaEuro((parseFloat(r.importoMacello) || 0) + (parseFloat(r.importoIngresso) || 0))} — deve essere uguale a {formattaEuro(r.imponibile)}
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

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {!senzaSalva && <button onClick={onSalva} disabled={r.salvataggioInCorso}
              style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {r.salvataggioInCorso ? "Salvataggio..." : "💾 Salva questa riga"}
            </button>}
            <button onClick={onScarta}
              style={{ background: "none", border: `1.5px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              🗑️ Scarta e ricorda
            </button>
          </div>
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
