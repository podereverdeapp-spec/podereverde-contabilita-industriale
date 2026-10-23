import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx-js-style";
import { esportaExcel } from "./esportaExcel";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro, round2, formattaData, fetchAllPages, leggiInBlocchi } from "./parsingUtils";
import { dataIt } from "./FatturePassive";
import { CATEGORIE_AMMORTAMENTO, IMPUTAZIONI_CESPITE, creaCespiteDaRiga, anniValidi, percentualeDaAnni } from "./cespitiDaFatture";

// Versione 242: la data letta da Excel si converte con formattaData (giorno italiano), non con toISOString che la portava al giorno prima.
const oggiLocale = () => formattaData(new Date());

const AREE_ORDINARIE = [
  "Allevamento", "Coltivazione", "Lavoro", "Energia Elettrica", "Acqua", "Consulenze",
  "Assicurazioni", "Lavorazioni prodotti allevamento", "Spese Promozionali",
  "Canoni ed Abbonamenti", "Varie", "Oneri Finanziari", "Orto", "Animali non d'allevamento", "Ammortamenti",
];
const DESTINAZIONI = ["Bovini", "Suini", "Ovini", "Bovini e Ovini", "Bovini e Suini", "Suini e Ovini", "Generali", "Pollame", "Cavalli"];
// Versione 261: categorie, imputazioni e creazione del cespite nel modulo comune cespitiDaFatture.js

function normalizzaTesto(t) { return String(t || "").trim().toLowerCase(); }
// Versione 290: numero della fattura senza zeri iniziali, spazi, barre, trattini e maiuscole (come in Verifica Fatture Mancanti)
function normalizzaNumero(n) { return String(n || "").trim().toLowerCase().replace(/^0+/, "").replace(/[\/\-\s]/g, ""); }
// partita IVA senza spazi e senza il prefisso «IT»
function normalizzaPiva(p) { return String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^IT(?=\d{11}$)/, ""); }
function importoVicino(a, b, tolleranzaPct = 0.02, tolleranzaAssoluta = 0.05) {
  const x = parseFloat(a), y = parseFloat(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const diff = Math.abs(x - y);
  if (diff <= tolleranzaAssoluta) return true; // differenze piccole in assoluto, sempre ok (arrotondamenti)
  return diff / Math.max(Math.abs(x), Math.abs(y)) <= tolleranzaPct;
}

export default function VerificaRigheMancanti() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [righeExcel, setRigheExcel] = useState([]);
  const [colonne, setColonne] = useState([]);
  const [mappaFornitore, setMappaFornitore] = useState("");
  const [mappaDescrizione, setMappaDescrizione] = useState("");
  const [mappaImporto, setMappaImporto] = useState("");
  const [mappaData, setMappaData] = useState("");
  const [mappaPiva, setMappaPiva] = useState("");
  const [mappaNumero, setMappaNumero] = useState("");
  const [mappaQuantita, setMappaQuantita] = useState("");
  const [mappaUnitaMisura, setMappaUnitaMisura] = useState("");
  const [mappaPrezzoUnitario, setMappaPrezzoUnitario] = useState("");
  const [mappaAliquotaIva, setMappaAliquotaIva] = useState("");
  const [risultato, setRisultato] = useState(null);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState(null);
  const [registrandoIndice, setRegistrandoIndice] = useState(null);
  const [formRegistra, setFormRegistra] = useState({});
  const [salvandoRegistra, setSalvandoRegistra] = useState(false);
  const [pianoDeiConti, setPianoDeiConti] = useState([]);
  const [fattureEscluse, setFattureEscluse] = useState([]);
  const [fornitoriTutti, setFornitoriTutti] = useState([]);
  const [mostraEscluse, setMostraEscluse] = useState(false);
  const [salvandoEsclusione, setSalvandoEsclusione] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    // Versione 280: letta a pagine (il database consegna al massimo 1.000 righe per richiesta)
    fetchAllPages((da, a) => supabase.from("ci_piano_dei_conti").select("*").order("area").order("centro_costo").order("id").range(da, a)).then(({ data }) => setPianoDeiConti(data || []));
    fetchAllPages((da, a) => supabase.from("ci_fatture_escluse_verifica").select("*").order("id").range(da, a)).then(({ data }) => setFattureEscluse(data || []));
    fetchAllPages((da, a) => supabase.from("ci_fornitori").select("id, nome").order("id").range(da, a)).then(({ data }) => setFornitoriTutti(data || []));
  }, []);

  function centriPerArea(areaScelta) {
    return pianoDeiConti.filter(p => p.area === areaScelta).map(p => p.centro_costo);
  }

  async function rimuoviEsclusione(id) {
    try {
      const fattura = fattureEscluse.find(f => f.id === id);
      const { error } = await supabase.from("ci_fatture_escluse_verifica").delete().eq("id", id);
      if (error) throw new Error(error.message);
      setFattureEscluse(prev => prev.filter(f => f.id !== id));
      if (fattura && risultato) {
        setRisultato(prev => ({
          ...prev,
          mancanti: prev.mancanti.map(m => (m._fornitoreId === fattura.fornitore_id && mappaNumero && normalizzaTesto(m[mappaNumero]) === normalizzaTesto(fattura.numero)) ? { ...m, _nonDaRegistrare: false } : m),
        }));
      }
    } catch (err) {
      alert(`⚠️ Errore nella rimozione:\n\n${err.message}`);
    }
  }

  async function escludiFattura(r) {
    if (!mappaNumero) { alert("Per escludere una fattura serve prima mappare la colonna Numero."); return; }
    const numero = r[mappaNumero];
    if (!numero) { alert("Questa riga non ha un numero fattura valido."); return; }
    setSalvandoEsclusione(r);
    try {
      const { error } = await supabase.from("ci_fatture_escluse_verifica").insert([{
        fornitore_id: r._fornitoreId || null, numero: String(numero), data: mappaData ? String(r[mappaData]).slice(0, 10) : null,
      }]);
      if (error) throw new Error(error.message);
      const { data } = await fetchAllPages((da, a) => supabase.from("ci_fatture_escluse_verifica").select("*").order("id").range(da, a));
      setFattureEscluse(data || []);
      // Marco (invece di rimuovere) TUTTE le righe con lo stesso fornitore+numero, non solo questa
      setRisultato(prev => ({
        ...prev,
        mancanti: prev.mancanti.map(m => (m._fornitoreId === r._fornitoreId && normalizzaTesto(m[mappaNumero]) === normalizzaTesto(numero)) ? { ...m, _nonDaRegistrare: true } : m),
      }));
    } catch (err) {
      alert(`⚠️ Errore nell'esclusione:\n\n${err.message}`);
    }
    setSalvandoEsclusione(null);
  }

  function iniziaRegistrazione(indice, r) {
    setRegistrandoIndice(indice);
    setFormRegistra({
      tipoDestinazione: "fattura", numero: "", data: mappaData ? formattaData(r[mappaData]).slice(0, 10) : oggiLocale(),
      area: "", centro_costo: "", destinazione: "", tipo_costo: "",
      categoria_ammortamento: "", anni_ammortamento: "", imputazione: "Generali",
    });
  }

  async function registraRigaMancante(r) {
    if (!r._fornitoreId) { alert("Fornitore non riconosciuto — registralo prima in anagrafica."); return; }
    if (!formRegistra.numero.trim()) { alert("Indica il numero fattura."); return; }
    // Versione 235: una riga normale senza Area e Tipo di Costo resterebbe fuori dai costi
    if (formRegistra.tipoDestinazione !== "cespite" && (!formRegistra.area || !formRegistra.tipo_costo)) { alert("Indicare Area e Tipo di Costo: senza, la riga resta fuori dai calcoli dei costi."); return; }
    if (formRegistra.tipoDestinazione === "cespite" && (!formRegistra.categoria_ammortamento || !formRegistra.imputazione || !anniValidi(formRegistra.anni_ammortamento))) {
      alert("Per un cespite servono Categoria, Imputazione e Anni di ammortamento (numero intero da 1 a 100)."); return;
    }
    setSalvandoRegistra(true);
    try {
      const importo = round2(parseFloat(r[mappaImporto]));
      const descrizione = mappaDescrizione ? r[mappaDescrizione] : `Riga da ${r[mappaFornitore]}`;

      const { data: fatturaEsistente } = await supabase.from("ci_fatture")
        .select("id").eq("fornitore_id", r._fornitoreId).eq("numero", formRegistra.numero.trim()).eq("data", formRegistra.data).maybeSingle();
      let fatturaId = fatturaEsistente?.id;
      if (!fatturaId) {
        const { data: nuovaFattura, error } = await supabase.from("ci_fatture").insert([{
          numero: formRegistra.numero.trim(), data: formRegistra.data, tipo: "PASSIVA", fornitore_id: r._fornitoreId,
          totale_netto: 0, totale_iva: 0, totale_lordo: 0,
        }]).select().single();
        if (error) throw new Error(error.message);
        fatturaId = nuovaFattura.id;
      }

      const aliquota = mappaAliquotaIva && !isNaN(parseFloat(r[mappaAliquotaIva])) ? parseFloat(r[mappaAliquotaIva]) : 0;
      if (formRegistra.tipoDestinazione === "cespite") {
        // Versione 235: come in «Carica Fatture Passive massivamente» — riga di fattura (Ammortamenti,
        // Ammortizzabile) + dettaglio dell'ammortamento + cespite. Prima si creava solo il cespite e la
        // fattura restava senza righe (e finiva in Controllo Anomalie).
        const { data: art, error: eArt } = await supabase.from("ci_articoli_fattura").insert([{
          fattura_id: fatturaId, descrizione, quantita: 1, prezzo_unitario: importo, totale_riga: importo,
          aliquota_iva: aliquota, totale_iva: round2(importo * aliquota / 100),
          area: "Ammortamenti", centro_costo: null, destinazione: null, tipo_costo: "Ammortizzabile", stato_classificazione: "MANUALE",
        }]).select().single();
        if (eArt) throw new Error(eArt.message);
        // Versione 261: dettaglio, cespite e quote fino all'anno in corso con la funzione comune
        try {
          await creaCespiteDaRiga({
            articoloId: art.id, descrizione, fornitoreId: r._fornitoreId, fatturaId, data: formRegistra.data,
            importo, categoria: formRegistra.categoria_ammortamento, imputazione: formRegistra.imputazione,
            anni: formRegistra.anni_ammortamento,
          });
        } catch (eC) {
          await supabase.from("ci_articoli_fattura").delete().eq("id", art.id);
          throw eC;
        }
      } else {
        const { error } = await supabase.from("ci_articoli_fattura").insert([{
          fattura_id: fatturaId, descrizione, quantita: 1, prezzo_unitario: importo, totale_riga: importo, aliquota_iva: aliquota, totale_iva: round2(importo * aliquota / 100),
          area: formRegistra.area || null, centro_costo: formRegistra.centro_costo || null,
          destinazione: formRegistra.destinazione || null, tipo_costo: formRegistra.tipo_costo || null, stato_classificazione: "MANUALE",
        }]);
        if (error) throw new Error(error.message);
      }

      const { data: righeArt } = await supabase.from("ci_articoli_fattura").select("totale_riga, totale_iva").eq("fattura_id", fatturaId);
      const netto = (righeArt || []).reduce((s, x) => s + (parseFloat(x.totale_riga) || 0), 0);
      const iva = (righeArt || []).reduce((s, x) => s + (parseFloat(x.totale_iva) || 0), 0);
      const { error: eTot } = await supabase.from("ci_fatture").update({ totale_netto: round2(netto), totale_iva: round2(iva), totale_lordo: round2(netto + iva) }).eq("id", fatturaId);
      if (eTot) throw new Error(`Riga registrata, ma i totali della fattura non sono stati aggiornati: ${eTot.message}`);

      setRisultato(prev => ({ ...prev, mancanti: prev.mancanti.filter(m => m !== r) }));
      setRegistrandoIndice(null);
    } catch (err) {
      alert(`⚠️ Errore nella registrazione:\n\n${err.message}`);
    }
    setSalvandoRegistra(false);
  }

  function esportaPerCaricaFatture() {
    const righeEsportate = risultato.mancanti.filter(r => !r._nonDaRegistrare).map(r => ({
      Fornitore: r[mappaFornitore] || "",
      "P.IVA": mappaPiva ? (r[mappaPiva] || "") : "",
      Numero: mappaNumero ? (r[mappaNumero] || "") : "",
      Data: mappaData ? (r[mappaData] instanceof Date ? formattaData(r[mappaData]) : r[mappaData]) : "",
      Descrizione: mappaDescrizione ? (r[mappaDescrizione] || "") : "",
      "Quantità": mappaQuantita ? (parseFloat(r[mappaQuantita]) || 1) : 1,
      "U.M.": mappaUnitaMisura ? (r[mappaUnitaMisura] || "") : "",
      "Prezzo unitario": mappaPrezzoUnitario ? (parseFloat(r[mappaPrezzoUnitario]) || "") : "",
      Imponibile: round2(parseFloat(r[mappaImporto]) || 0),
      "Aliquota IVA": mappaAliquotaIva ? (parseFloat(r[mappaAliquotaIva]) || 0) : 0,
    }));
    esportaExcel("righe_mancanti_da_ricaricare", [{ nome: "Righe mancanti", righe: righeEsportate }]);
  }

  function gestisciFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary", cellDates: true });
        const foglio = wb.Sheets[wb.SheetNames[0]];
        const dati = XLSX.utils.sheet_to_json(foglio, { defval: "" });
        if (dati.length === 0) { setErrore("Il file sembra vuoto."); return; }
        setColonne(Object.keys(dati[0]));
        setRigheExcel(dati);
        setRisultato(null);
        setErrore(null);
        const trovaColonna = parole => Object.keys(dati[0]).find(c => parole.some(p => c.toLowerCase().includes(p)));
        setMappaFornitore(trovaColonna(["fornitore", "cedente"]) || "");
        setMappaDescrizione(trovaColonna(["descrizione"]) || "");
        setMappaImporto(trovaColonna(["imponibile", "importo"]) || "");
        setMappaData(trovaColonna(["data"]) || "");
        setMappaPiva(trovaColonna(["p.iva", "piva", "partita iva"]) || "");
        setMappaNumero(trovaColonna(["numero"]) || "");
        setMappaQuantita(trovaColonna(["quantit"]) || "");
        setMappaUnitaMisura(trovaColonna(["u.m.", "unit"]) || "");
        setMappaPrezzoUnitario(trovaColonna(["prezzo"]) || "");
        // Versione 290: prima si cercava «aliquota» o «iva» e veniva scelta la colonna «P.IVA»; ora prima «aliquota»,
        // poi una colonna con «iva» che non sia la partita IVA
        setMappaAliquotaIva(trovaColonna(["aliquota"]) || Object.keys(dati[0]).find(c => /iva/i.test(c) && !/p\.?\s*iva|partita/i.test(c)) || "");
      } catch (err) {
        setErrore(`Impossibile leggere il file: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
  }

  async function confrontaRighe() {
    if (!mappaFornitore || !mappaImporto) { alert("Indica almeno le colonne Fornitore e Importo."); return; }
    setCaricando(true);
    setErrore(null);
    try {
      const righeAnno = righeExcel.filter(r => {
        if (!mappaData) return true;
        const d = String(formattaData(r[mappaData]) || r[mappaData]);
        return d.startsWith(String(anno));
      });
      // Versione 290: le righe da 0 € (solo descrizione: DDT, IBAN, diciture) nel programma non si salvano: non si confrontano
      const righeDaControllare = righeAnno.filter(r => Math.abs(parseFloat(r[mappaImporto]) || 0) >= 0.005);

      const { data: fornitori } = await fetchAllPages((da, a) => supabase.from("ci_fornitori").select("id, nome, partita_iva").order("id").range(da, a));
      const mappaFornitori = new Map((fornitori || []).map(f => [normalizzaTesto(f.nome), f.id]));
      // Versione 290: il fornitore si riconosce anche dalla partita IVA, se la colonna è indicata
      const mappaPartiteIva = new Map((fornitori || []).filter(f => normalizzaPiva(f.partita_iva)).map(f => [normalizzaPiva(f.partita_iva), f.id]));
      const fornitoreDi = r => (mappaPiva && mappaPartiteIva.get(normalizzaPiva(r[mappaPiva]))) || mappaFornitori.get(normalizzaTesto(r[mappaFornitore])) || null;

      // Per ogni fornitore riconosciuto, TUTTO ciò che è registrato per lui nell'anno: righe delle fatture,
      // cespiti, acquisti di animali e trasporti d'ingresso (Report Acquisto Animali)
      const idFornitori = [...new Set(righeDaControllare.map(fornitoreDi).filter(Boolean))];
      const datiPerFornitore = new Map();
      for (const fornitoreId of idFornitori) {
        const [{ data: fatture }, { data: cespiti }, { data: report }] = await Promise.all([
          fetchAllPages((da, a) => supabase.from("ci_fatture").select("id, numero").eq("fornitore_id", fornitoreId).eq("tipo", "PASSIVA")
            .gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`).order("id").range(da, a)),
          fetchAllPages((da, a) => supabase.from("ci_cespiti").select("descrizione, costo_acquisto").eq("fornitore_id", fornitoreId)
            .gte("data_acquisto", `${anno}-01-01`).lte("data_acquisto", `${anno}-12-31`).order("id").range(da, a)),
          fetchAllPages((da, a) => supabase.from("ci_report_acquisto_animali").select("specie, razza, importo, fonte, numero_fattura, articolo_fattura_id").eq("fornitore_id", fornitoreId)
            .gte("data_fattura", `${anno}-01-01`).lte("data_fattura", `${anno}-12-31`).order("id").range(da, a)),
        ]);

        const idFatture = (fatture || []).map(f => f.id);
        let articoli = [];
        if (idFatture.length > 0) {
          const { data } = await leggiInBlocchi(idFatture, (blocco, da, a) => supabase.from("ci_articoli_fattura").select("id, fattura_id, descrizione, totale_riga").in("fattura_id", blocco).order("id").range(da, a));
          articoli = data || [];
        }
        // totale di ogni fattura nel programma: le sue righe più la parte «ingresso in allevamento» dei trasporti
        const fatturaDellaRiga = new Map(articoli.map(a => [a.id, a.fattura_id]));
        const totalePerFattura = new Map();
        articoli.forEach(a => totalePerFattura.set(a.fattura_id, (totalePerFattura.get(a.fattura_id) || 0) + (parseFloat(a.totale_riga) || 0)));
        (report || []).filter(x => x.fonte === "TRASPORTO_INGRESSO" && fatturaDellaRiga.has(x.articolo_fattura_id)).forEach(x => {
          const fid = fatturaDellaRiga.get(x.articolo_fattura_id);
          totalePerFattura.set(fid, (totalePerFattura.get(fid) || 0) + (parseFloat(x.importo) || 0));
        });
        datiPerFornitore.set(fornitoreId, {
          pool: [
            ...articoli.map(a => ({ descrizione: a.descrizione, importo: a.totale_riga })),
            ...(cespiti || []).map(c => ({ descrizione: c.descrizione, importo: c.costo_acquisto })),
            ...(report || []).map(a => ({ descrizione: `${a.specie || ""} ${a.razza || ""}`.trim() || "Acquisto animali", importo: a.importo })),
          ],
          // numeri delle fatture d'acquisto di animali registrate nel Report
          numeriAnimali: new Set((report || []).filter(x => x.fonte !== "TRASPORTO_INGRESSO" && x.numero_fattura).map(x => normalizzaNumero(x.numero_fattura))),
          // numero della fattura → totale nel programma
          totaliPerNumero: new Map((fatture || []).map(f => [normalizzaNumero(f.numero), totalePerFattura.get(f.id) || 0])),
        });
      }

      // totale di ogni fattura del file (fornitore + numero), per i confronti sul totale
      const totaleFileFattura = new Map();
      if (mappaNumero) righeDaControllare.forEach(r => {
        const k = `${fornitoreDi(r)}|${normalizzaNumero(r[mappaNumero])}`;
        totaleFileFattura.set(k, (totaleFileFattura.get(k) || 0) + (parseFloat(r[mappaImporto]) || 0));
      });

      const escluse = new Set(fattureEscluse.map(f => `${f.fornitore_id}|${normalizzaTesto(f.numero)}`));

      const mancanti = [];
      const fornitoriNonTrovati = new Set();
      righeDaControllare.forEach(r => {
        const fornitoreId = fornitoreDi(r);
        if (!fornitoreId) { fornitoriNonTrovati.add(r[mappaFornitore]); mancanti.push({ ...r, _motivo: "Fornitore non trovato in anagrafica", _fornitoreId: null }); return; }
        const dati = datiPerFornitore.get(fornitoreId);
        const importoRiga = r[mappaImporto];
        if (dati.pool.some(p => importoVicino(p.importo, importoRiga))) return; // già registrata
        if (mappaNumero) {
          const numero = normalizzaNumero(r[mappaNumero]);
          // acquisto di animali: basta che la fattura sia nel Report (i prezzi dei capi possono comprendere i trasporti)
          if (numero && dati.numeriAnimali.has(numero)) return;
          // fattura registrata con le righe divise in modo diverso (es. trasporto: macello + ingresso): si confronta il totale
          if (numero && dati.totaliPerNumero.has(numero) && importoVicino(dati.totaliPerNumero.get(numero), totaleFileFattura.get(`${fornitoreId}|${numero}`))) return;
        }
        const nonDaRegistrare = mappaNumero && escluse.has(`${fornitoreId}|${normalizzaTesto(r[mappaNumero])}`);
        mancanti.push({ ...r, _motivo: "Nessun importo corrispondente trovato", _fornitoreId: fornitoreId, _nonDaRegistrare: !!nonDaRegistrare });
      });

      setRisultato({ totaleControllate: righeDaControllare.length, righeAZero: righeAnno.length - righeDaControllare.length, mancanti, fornitoriNonTrovati: [...fornitoriNonTrovati] });
    } catch (err) {
      setErrore(err.message);
    }
    setCaricando(false);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Verifica Righe Mancanti</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Carica un file Excel con una riga per ogni voce/articolo (es. quello prodotto dal prompt di estrazione PDF) e confrontalo con TUTTO quello che risulta caricato per quel fornitore — fatture normali, Cespiti (Ammortamenti) e Acquisto Animali insieme — per trovare righe che potrebbero non essere state salvate da nessuna parte.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, color: C.muted }}>Anno:</label>
        <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
          style={{ width: 100, padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
        <button onClick={() => inputRef.current.click()}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          📎 Scegli file Excel
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={gestisciFile} style={{ display: "none" }} />
        {righeExcel.length > 0 && <span style={{ fontSize: 12, color: C.muted }}>{righeExcel.length} righe lette dal file</span>}
        <button onClick={() => setMostraEscluse(v => !v)}
          style={{ marginLeft: "auto", background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", color: C.muted }}>
          {mostraEscluse ? "▲" : "▼"} Fatture escluse ({fattureEscluse.length})
        </button>
      </div>

      {mostraEscluse && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          {fattureEscluse.length === 0 ? (
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Nessuna fattura esclusa al momento.</p>
          ) : (
            fattureEscluse.map(f => (
              <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <span>{fornitoriTutti.find(x => x.id === f.fornitore_id)?.nome || "Fornitore sconosciuto"} — n. {f.numero}{f.data ? ` — ${dataIt(f.data)}` : ""}</span>
                <button onClick={() => rimuoviEsclusione(f.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.red }}>
                  ✕ Rimuovi esclusione
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}

      {colonne.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Indica quali colonne del file corrispondono a:</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <CampoMappa label="Fornitore (obbligatorio)" value={mappaFornitore} colonne={colonne} onChange={setMappaFornitore} />
            <CampoMappa label="Importo (obbligatorio)" value={mappaImporto} colonne={colonne} onChange={setMappaImporto} />
            <CampoMappa label="Descrizione (informativa)" value={mappaDescrizione} colonne={colonne} onChange={setMappaDescrizione} />
            <CampoMappa label="Data (per filtrare l'anno)" value={mappaData} colonne={colonne} onChange={setMappaData} />
            <CampoMappa label="P.IVA (consigliata: riconosce il fornitore anche con il nome scritto diversamente)" value={mappaPiva} colonne={colonne} onChange={setMappaPiva} />
            <CampoMappa label="Numero fattura (consigliato: serve per acquisti di animali e trasporti)" value={mappaNumero} colonne={colonne} onChange={setMappaNumero} />
          </div>
          <button onClick={confrontaRighe} disabled={caricando}
            style={{ marginTop: 12, background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {caricando ? "Confronto..." : "🔍 Confronta con il database"}
          </button>

          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginTop: 16, marginBottom: 6 }}>
            Colonne aggiuntive, usate solo per esportare le righe mancanti verso Carica Fatture (opzionali — rilevate da sole se presenti):
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
            <CampoMappa label="Quantità" value={mappaQuantita} colonne={colonne} onChange={setMappaQuantita} />
            <CampoMappa label="U.M." value={mappaUnitaMisura} colonne={colonne} onChange={setMappaUnitaMisura} />
            <CampoMappa label="Prezzo unitario" value={mappaPrezzoUnitario} colonne={colonne} onChange={setMappaPrezzoUnitario} />
            <CampoMappa label="Aliquota IVA" value={mappaAliquotaIva} colonne={colonne} onChange={setMappaAliquotaIva} />
          </div>
        </div>
      )}

      {risultato && (
        <div>
          <p style={{ fontSize: 13, color: C.muted }}>{risultato.totaleControllate} righe controllate{risultato.righeAZero > 0 ? ` · ${risultato.righeAZero} righe da 0 € non confrontate (solo descrizione: nel programma non si salvano)` : ""}</p>
          {risultato.fornitoriNonTrovati.length > 0 && (
            <div style={{ background: "#FFF2DC", border: `1px solid ${C.yellow}`, borderRadius: 8, padding: "10px 16px", fontSize: 13, marginBottom: 10 }}>
              ⚠️ Fornitori del file non trovati in anagrafica (controlla il nome esatto): {risultato.fornitoriNonTrovati.join(", ")}
            </div>
          )}
          {risultato.mancanti.length === 0 ? (
            <div style={{ background: "#E8F3EA", border: `1px solid ${C.green}`, borderRadius: 8, padding: "10px 16px", fontSize: 13 }}>
              ✓ Tutte le righe del file risultano registrate da qualche parte (fatture, Cespiti, o Acquisto Animali).
            </div>
          ) : (
            <>
              <div style={{ background: "#FFF2DC", border: `1px solid ${C.yellow}`, borderRadius: 8, padding: "10px 16px", fontSize: 13, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <span>⚠️ {risultato.mancanti.filter(m => !m._nonDaRegistrare).length} righe del file NON risultano registrate
                  {risultato.mancanti.some(m => m._nonDaRegistrare) && ` (altre ${risultato.mancanti.filter(m => m._nonDaRegistrare).length} marcate come "non da registrare")`}.</span>
                <button onClick={esportaPerCaricaFatture}
                  style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  📥 Scarica Excel per Carica Fatture
                </button>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                {risultato.mancanti.map((r, i) => (
                  <div key={i} style={{ padding: 12, borderTop: i > 0 ? `1px solid ${C.border}` : undefined }}>
                    {registrandoIndice === i ? (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                          Registra: {r[mappaFornitore]} — {mappaDescrizione ? r[mappaDescrizione] : "(senza descrizione)"} — {formattaEuro(parseFloat(r[mappaImporto]) || 0)}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 8 }}>
                          <CampoSelectLocale label="Tipo destinazione" value={formRegistra.tipoDestinazione} options={["fattura", "cespite"]}
                            etichette={{ fattura: "Riga fattura normale", cespite: "Cespite (Ammortamento)" }}
                            onChange={v => setFormRegistra(prev => ({ ...prev, tipoDestinazione: v }))} />
                          <CampoTestoLocale label="Numero fattura" value={formRegistra.numero} onChange={v => setFormRegistra(prev => ({ ...prev, numero: v }))} />
                          <CampoTestoLocale label="Data" tipo="date" value={formRegistra.data} onChange={v => setFormRegistra(prev => ({ ...prev, data: v }))} />
                        </div>
                        {formRegistra.tipoDestinazione === "fattura" ? (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                            <CampoSelectLocale label="Area" value={formRegistra.area} options={["", ...AREE_ORDINARIE]}
                              onChange={v => setFormRegistra(prev => ({ ...prev, area: v, centro_costo: "" }))} />
                            <CampoSelectLocale label="Centro di Costo" value={formRegistra.centro_costo} options={["", ...centriPerArea(formRegistra.area)]}
                              onChange={v => setFormRegistra(prev => ({ ...prev, centro_costo: v }))} />
                            <CampoSelectLocale label="Destinazione" value={formRegistra.destinazione} options={["", ...DESTINAZIONI]}
                              onChange={v => setFormRegistra(prev => ({ ...prev, destinazione: v }))} />
                            <CampoSelectLocale label="Tipo di Costo" value={formRegistra.tipo_costo} options={["", "Fisso", "Variabile"]}
                              onChange={v => setFormRegistra(prev => ({ ...prev, tipo_costo: v }))} />
                          </div>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                            <CampoSelectLocale label="Categoria Ammortamento" value={formRegistra.categoria_ammortamento} options={["", ...CATEGORIE_AMMORTAMENTO]}
                              onChange={v => setFormRegistra(prev => ({ ...prev, categoria_ammortamento: v }))} />
                            <CampoTestoLocale label="Anni di ammortamento" tipo="number" value={formRegistra.anni_ammortamento}
                              onChange={v => setFormRegistra(prev => ({ ...prev, anni_ammortamento: v }))} />
                            <CampoSelectLocale label="Imputazione" value={formRegistra.imputazione} options={IMPUTAZIONI_CESPITE}
                              onChange={v => setFormRegistra(prev => ({ ...prev, imputazione: v }))} />
                            {anniValidi(formRegistra.anni_ammortamento) && (
                              <div style={{ gridColumn: "1 / -1", fontSize: 12, color: C.muted }}>→ quota annua: {percentualeDaAnni(formRegistra.anni_ammortamento).toLocaleString("it-IT")}% del prezzo per {anniValidi(formRegistra.anni_ammortamento)} anni (contabilità industriale, non fiscale).</div>
                            )}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button onClick={() => registraRigaMancante(r)} disabled={salvandoRegistra}
                            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            {salvandoRegistra ? "Salvataggio..." : "✓ Registra"}
                          </button>
                          <button onClick={() => setRegistrandoIndice(null)}
                            style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>
                            Annulla
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, opacity: r._nonDaRegistrare ? 0.6 : 1 }}>
                        <div>
                          <div style={{ fontSize: 13 }}>{r[mappaFornitore]} — {mappaDescrizione ? r[mappaDescrizione] : "—"}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>{r._nonDaRegistrare ? "🏷️ Non da registrare" : r._motivo}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ fontWeight: 700 }}>{formattaEuro(parseFloat(r[mappaImporto]) || 0)}</div>
                          {r._nonDaRegistrare ? (
                            <button onClick={() => {
                              const match = fattureEscluse.find(f => f.fornitore_id === r._fornitoreId && normalizzaTesto(f.numero) === normalizzaTesto(r[mappaNumero]));
                              if (match) rimuoviEsclusione(match.id);
                            }}
                              style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>
                              ↩ Riconsidera
                            </button>
                          ) : (
                            <>
                              {mappaNumero && (
                                <button onClick={() => escludiFattura(r)} disabled={salvandoEsclusione === r}
                                  style={{ background: C.muted + "20", color: C.muted, border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                                  title="Segna questa fattura come non da registrare — resta visibile nell'elenco">
                                  {salvandoEsclusione === r ? "..." : "🏷️ Non da registrare"}
                                </button>
                              )}
                              {r._fornitoreId && (
                                <button onClick={() => iniziaRegistrazione(i, r)}
                                  style={{ background: C.blue + "20", color: C.blue, border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                  ➕ Registra
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <p style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>
        Il confronto principale è per importo (tolleranza ~2%, dato che l'imponibile può essere arrotondato diversamente tra l'estrazione e la registrazione) — la descrizione è mostrata a titolo informativo, non è richiesta per il match, dato che classificando una riga la descrizione può cambiare leggermente. Le righe da 0 € non si confrontano. Il fornitore si riconosce dalla partita IVA (se la colonna è indicata) o dal nome scritto come in anagrafica. Con la colonna Numero fattura: una riga di un acquisto di animali risulta registrata se la sua fattura è nel Report Acquisto Animali (il prezzo dei capi può comprendere il trasporto); una riga di una fattura registrata con le righe divise in modo diverso (per esempio un trasporto diviso tra macello e ingresso in allevamento) risulta registrata se il totale della fattura nel file e nel programma coincide.
      </p>
    </div>
  );
}

function CampoMappa({ label, value, colonne, onChange }) {
  return (
    <label style={{ fontSize: 11, color: C.muted }}>
      {label}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12, marginTop: 2 }}>
        <option value="">— nessuna —</option>
        {colonne.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}

function CampoSelectLocale({ label, value, options, etichette, onChange }) {
  return (
    <label style={{ fontSize: 11, color: C.muted }}>
      {label}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "5px 7px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12, marginTop: 2 }}>
        {options.map(o => <option key={o} value={o}>{etichette?.[o] || o || "—"}</option>)}
      </select>
    </label>
  );
}

function CampoTestoLocale({ label, value, onChange, tipo = "text" }) {
  return (
    <label style={{ fontSize: 11, color: C.muted }}>
      {label}
      <input type={tipo} value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "5px 7px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12, marginTop: 2 }} />
    </label>
  );
}
