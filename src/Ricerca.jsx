import { useState, useEffect, useMemo, useRef } from "react";
import { etichettaTipo } from "./documentiCompetenza";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, formattaEuro, round2, fetchAllPages } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { FUNZIONE_RICERCA, messaggioErroreRicerca, NavigazionePagine, leggiTutteLeTrovate, leggiCapiAcquisto, CapiAcquisto, EtichettaAcquistoAnimali, numeroFattura, leggiRigheFattura, NotaTrasportoAiCapi, NotaCompetenza, PAGINA_COMPETENZA, RicomposizioneFattura } from "./FatturePassive";

// Versione 281 (decisione del Dott. Bizzarri del 23/10/2026): la ricerca la fa il database (funzione
// ci_ricerca_documenti) su TUTTE le fatture e le loro righe, compresi gli acquisti di animali registrati solo
// nel Report Acquisto Animali. La pagina non scarica più tutte le fatture: mostra 50, 100 o 200 fatture per
// volta con «◀ precedenti / successive ▶» sopra e sotto l'elenco; numero e totali sono calcolati su tutte le
// fatture trovate. Con un filtro di classificazione (area, centro di costo, destinazione, tipo di costo) una
// fattura è trovata se ha almeno UNA riga con tutte le classificazioni scelte, e si mostra anche il totale
// delle sole righe scelte.

const AREE_ORDINARIE = [
  "Allevamento", "Coltivazione", "Lavoro", "Energia Elettrica", "Acqua", "Consulenze",
  "Assicurazioni", "Lavorazioni prodotti allevamento", "Spese Promozionali",
  "Canoni ed Abbonamenti", "Varie", "Oneri Finanziari", "Orto", "Animali non d'allevamento", "Ammortamenti",
];
const DESTINAZIONI = ["Bovini", "Suini", "Ovini", "Bovini e Ovini", "Bovini e Suini", "Suini e Ovini", "Generali", "Pollame", "Cavalli"];
const UNITA_OPZIONI = ["", "Unità", "Tons", "Quintali", "Kilogrammi", "Litri", "Balloni", "Rotoballe", "Rotoli", "Balle", "Rotoloni"];

export default function Ricerca() {
  const [risposta, setRisposta] = useState(null);
  const [errore, setErrore] = useState("");
  const [gruppo, setGruppo] = useState(50);
  const [inizio, setInizio] = useState(0);
  const [esportando, setEsportando] = useState("");
  const [testoApplicato, setTestoApplicato] = useState("");
  const [loading, setLoading] = useState(true);
  const ultimaRichiesta = useRef(0); // conta solo la risposta dell'ultima ricerca partita
  const [espansa, setEspansa] = useState(null);
  const [righePerFattura, setRighePerFattura] = useState({});
  const [pianoDeiConti, setPianoDeiConti] = useState([]);
  const [modificaRigaId, setModificaRigaId] = useState(null);
  const [formModificaRiga, setFormModificaRiga] = useState({});
  const [salvandoRiga, setSalvandoRiga] = useState(null);
  const [modificaFatturaId, setModificaFatturaId] = useState(null);
  const [formModificaFattura, setFormModificaFattura] = useState({});
  const [fornitori, setFornitori] = useState([]);

  const [testo, setTesto] = useState("");
  const [tipo, setTipo] = useState("tutte");
  const [area, setArea] = useState("");
  const [centroCosto, setCentroCosto] = useState("");
  const [destinazione, setDestinazione] = useState("");
  const [tipoCosto, setTipoCosto] = useState("");
  const [anno, setAnno] = useState("");
  const [dataDa, setDataDa] = useState("");
  const [dataA, setDataA] = useState("");
  const [importoMin, setImportoMin] = useState("");
  const [importoMax, setImportoMax] = useState("");

  useEffect(() => { caricaAnagrafiche(); }, []);
  // il testo si applica mezzo secondo dopo l'ultima lettera scritta
  useEffect(() => { const t = setTimeout(() => setTestoApplicato(testo.trim()), 500); return () => clearTimeout(t); }, [testo]);
  // cambiando un filtro o la grandezza del gruppo si riparte dalla prima fattura
  const filtri = [testoApplicato, tipo, area, centroCosto, destinazione, tipoCosto, anno, dataDa, dataA, importoMin, importoMax];
  useEffect(() => { setInizio(0); }, [...filtri, gruppo]);
  useEffect(() => { cerca(); }, [...filtri, gruppo, inizio]);

  // Piano dei conti (per i menu) e fornitori (per la modifica delle fatture), letti a pagine
  async function caricaAnagrafiche() {
    const { data: pdc } = await fetchAllPages((da, aa) => supabase.from("ci_piano_dei_conti").select("*").order("area").order("centro_costo").order("id").range(da, aa));
    setPianoDeiConti(pdc || []);
    const { data: forn } = await fetchAllPages((da, aa) => supabase.from("ci_fornitori").select("id, nome, partita_iva, codice_fiscale").order("nome").order("id").range(da, aa));
    setFornitori(forn || []);
  }

  const numeroOppureNull = v => (v === "" || isNaN(parseFloat(v)) ? null : parseFloat(v));
  const parametri = (offset, limite) => ({
    p_tipo: tipo === "tutte" ? null : tipo, p_testo: testoApplicato || null, p_cerca_righe: true,
    p_area: area || null, p_centro_costo: centroCosto || null, p_destinazione: destinazione || null, p_tipo_costo: tipoCosto || null,
    p_anno: anno ? parseInt(anno) : null, p_data_da: dataDa || null, p_data_a: dataA || null,
    p_importo_min: numeroOppureNull(importoMin), p_importo_max: numeroOppureNull(importoMax),
    p_offset: offset, p_limite: limite,
  });

  async function cerca() {
    const n = ++ultimaRichiesta.current;
    setLoading(true); setErrore("");
    const { data, error } = await supabase.rpc(FUNZIONE_RICERCA, parametri(inizio, gruppo));
    if (n !== ultimaRichiesta.current) return; // nel frattempo è partita una ricerca più recente
    if (error) { setErrore(messaggioErroreRicerca(error)); setRisposta(null); }
    else setRisposta({ ...data, fatture: numerizzaCampi(data?.fatture || [], ["totale_netto", "totale_iva", "totale_lordo"]) });
    setLoading(false);
  }

  function centriPerArea(areaScelta) {
    return pianoDeiConti.filter(p => p.area === areaScelta).map(p => p.centro_costo);
  }

  async function salvaFattura(fatturaId) {
    // Versione 235: riepilogo e conferma prima di scrivere; la P.IVA e il codice fiscale di un
    // fornitore non vengono mai cancellati lasciando vuoto il campo (si cancellano solo se confermato).
    const fo = fornitori.find(x => String(x.id) === String(formModificaFattura.fornitore_id));
    const f0 = risultati.find(x => x.id === fatturaId);
    const pivaVuota = fo && fo.partita_iva && !(formModificaFattura.partita_iva || "").trim();
    const cfVuoto = fo && fo.codice_fiscale && !(formModificaFattura.codice_fiscale || "").trim();
    let cancellaPiva = false, cancellaCf = false;
    if (pivaVuota) cancellaPiva = window.confirm(`Il campo P.IVA è vuoto, ma il fornitore «${fo.nome}» ha la partita IVA ${fo.partita_iva}.\n\nOK = CANCELLA la partita IVA dal fornitore (vale per tutte le sue fatture)\nAnnulla = lasciala com'è`);
    if (cfVuoto) cancellaCf = window.confirm(`Il campo Codice fiscale è vuoto, ma il fornitore «${fo.nome}» ha il codice fiscale ${fo.codice_fiscale}.\n\nOK = CANCELLA il codice fiscale\nAnnulla = lascialo com'è`);
    const nuovaPiva = (formModificaFattura.partita_iva || "").trim() || (cancellaPiva ? null : fo?.partita_iva ?? null);
    const nuovoCf = (formModificaFattura.codice_fiscale || "").trim() || (cancellaCf ? null : fo?.codice_fiscale ?? null);
    const righe = [`Numero: ${f0?.numero ?? ""} → ${formModificaFattura.numero}`, `Data: ${f0?.data ?? ""} → ${formModificaFattura.data}`];
    if (fo) righe.push(`Fornitore: ${fo.nome}${formModificaFattura.nome_fornitore && formModificaFattura.nome_fornitore !== fo.nome ? ` → nome cambiato in «${formModificaFattura.nome_fornitore}» (per tutte le sue fatture)` : ""}`,
      `P.IVA del fornitore: ${fo.partita_iva || "vuota"} → ${nuovaPiva || "vuota"}`, `Codice fiscale del fornitore: ${fo.codice_fiscale || "vuoto"} → ${nuovoCf || "vuoto"}`);
    if (!window.confirm(`Confermi la modifica della fattura?\n\n${righe.join("\n")}`)) return;
    try {
      const { error } = await supabase.from("ci_fatture").update({
        numero: formModificaFattura.numero, data: formModificaFattura.data, fornitore_id: formModificaFattura.fornitore_id || null,
      }).eq("id", fatturaId);
      if (error) throw new Error(error.message);

      if (formModificaFattura.fornitore_id) {
        const { error: eForn } = await supabase.from("ci_fornitori").update({
          nome: formModificaFattura.nome_fornitore || undefined,
          partita_iva: nuovaPiva, codice_fiscale: nuovoCf,
        }).eq("id", formModificaFattura.fornitore_id);
        if (eForn) throw new Error(eForn.message);
      }

      setFornitori(prev => prev.map(fo => fo.id === formModificaFattura.fornitore_id
        ? { ...fo, nome: formModificaFattura.nome_fornitore || fo.nome, partita_iva: nuovaPiva, codice_fiscale: nuovoCf }
        : fo));
      setModificaFatturaId(null);
      cerca(); // l'elenco si rilegge dal database con i dati nuovi
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio:\n\n${err.message}`);
    }
  }

  function iniziaModificaRiga(r) {
    setModificaRigaId(r.id);
    setFormModificaRiga({
      area: r.area || "", centro_costo: r.centro_costo || "", destinazione: r.destinazione || "", tipo_costo: r.tipo_costo || "",
      descrizione: r.descrizione || "", quantita: r.quantita ?? "", prezzo_unitario: r.prezzo_unitario ?? "", totale_riga: r.totale_riga ?? "", aliquota_iva: r.aliquota_iva ?? "", unita_misura: r.unita_misura || "",
    });
  }

  async function salvaModificaRiga(rigaId, fatturaId) {
    // Versione 235: riepilogo dei campi cambiati e conferma prima di scrivere
    const r0 = (righePerFattura["F" + fatturaId] || []).find(x => x.id === rigaId) || {};
    const etichette = { descrizione: "Descrizione", quantita: "Quantità", unita_misura: "U.M.", prezzo_unitario: "Prezzo unitario", totale_riga: "Importo", aliquota_iva: "Aliquota IVA %", area: "Area", centro_costo: "Centro di Costo", destinazione: "Destinazione", tipo_costo: "Tipo di Costo" };
    const cambi = Object.entries(etichette).filter(([k]) => String(r0[k] ?? "") !== String(formModificaRiga[k] ?? "") && !(Number(r0[k]) === Number(formModificaRiga[k]) && String(formModificaRiga[k]) !== ""))
      .map(([k, t]) => `${t}: «${r0[k] ?? ""}» → «${formModificaRiga[k] ?? ""}»`);
    if (cambi.length === 0) { setModificaRigaId(null); return; }
    // quantità e prezzo unitario non possono essere vuoti nel database
    if (formModificaRiga.quantita === "" || isNaN(parseFloat(formModificaRiga.quantita))) { alert("Indicare la Quantità."); return; }
    if (formModificaRiga.prezzo_unitario === "" || isNaN(parseFloat(formModificaRiga.prezzo_unitario))) { alert("Indicare il Prezzo unitario."); return; }
    if (risultati.find(x => x.id === fatturaId)?.tipo === "PASSIVA" && !formModificaRiga.tipo_costo) { alert("Indicare il Tipo di Costo: senza, la riga resta fuori dai calcoli dei costi."); return; }
    if (!window.confirm(`Confermi la modifica della riga?\n\n${cambi.join("\n")}\n\nI totali della fattura verranno ricalcolati.`)) return;
    setSalvandoRiga(rigaId);
    try {
      const { error } = await supabase.from("ci_articoli_fattura").update({
        area: formModificaRiga.area || null, centro_costo: formModificaRiga.centro_costo || null,
        destinazione: formModificaRiga.destinazione || null, tipo_costo: formModificaRiga.tipo_costo || null,
        descrizione: formModificaRiga.descrizione, quantita: parseFloat(formModificaRiga.quantita),
        prezzo_unitario: parseFloat(formModificaRiga.prezzo_unitario),
        unita_misura: formModificaRiga.unita_misura || null,
        totale_riga: round2(parseFloat(formModificaRiga.totale_riga) || 0),
        aliquota_iva: formModificaRiga.aliquota_iva !== "" && !isNaN(parseFloat(formModificaRiga.aliquota_iva)) ? parseFloat(formModificaRiga.aliquota_iva) : null,
        totale_iva: round2((parseFloat(formModificaRiga.totale_riga) || 0) * (parseFloat(formModificaRiga.aliquota_iva) || 0) / 100),
      }).eq("id", rigaId);
      if (error) throw new Error(error.message);
      setModificaRigaId(null);
      setFormModificaRiga({});
      // Ricarico le righe di questa fattura (con il trasporto attribuito ai capi, versione 283)
      const data = await leggiRigheFattura(fatturaId);
      setRighePerFattura(prev => ({ ...prev, ["F" + fatturaId]: data }));
      // Ricalcolo i totali della fattura, dato che l'importo della riga può essere cambiato
      const righeFattura = (data || []);
      const netto = righeFattura.reduce((s, x) => s + (parseFloat(x.totale_riga) || 0), 0);
      const iva = righeFattura.reduce((s, x) => s + (parseFloat(x.totale_iva) || 0), 0);
      const { error: eTot } = await supabase.from("ci_fatture").update({ totale_netto: round2(netto), totale_iva: round2(iva), totale_lordo: round2(netto + iva) }).eq("id", fatturaId);
      if (eTot) throw new Error(`Riga salvata, ma i totali della fattura non sono stati aggiornati: ${eTot.message}`);
      cerca(); // numero, totali ed elenco si rileggono dal database
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio:\n\n${err.message}`);
    }
    setSalvandoRiga(null);
  }


  const risultati = risposta?.fatture || [];
  const numeroTrovate = Number(risposta?.numero || 0);
  const numeroAnimali = Number(risposta?.numero_acquisti_animali || 0);

  async function espandi(f) {
    if (espansa === f.chiave) { setEspansa(null); return; }
    setEspansa(f.chiave);
    if (righePerFattura[f.chiave]) return;
    try {
      if (f.acquisto_animali) {
        const capi = await leggiCapiAcquisto(f);
        setRighePerFattura(prev => ({ ...prev, [f.chiave]: capi }));
      } else {
        const righe = await leggiRigheFattura(f.id);
        setRighePerFattura(prev => ({ ...prev, [f.chiave]: righe }));
      }
    } catch (err) {
      alert(`⚠️ Errore nel caricamento delle righe:\n\n${err.message}`);
    }
  }

  // Export: TUTTE le fatture trovate, lette 1.000 alla volta
  async function esporta() {
    try {
      const tutte = await leggiTutteLeTrovate(parametri(0, 1000), numeroTrovate, setEsportando);
      const righeExcel = tutte.map(f => ({
        "Tipo": f.acquisto_animali ? "ACQUISTO ANIMALI" : etichettaTipo(f.tipo), "Controparte": f.controparte,
        "Numero": f.numero, "Data": f.data, "Totale netto": numeroExcel(f.totale_netto),
        "Totale IVA": f.acquisto_animali ? "non registrata" : numeroExcel(f.totale_iva), "Totale lordo": numeroExcel(f.totale_lordo), "Note": f.note,
      }));
      esportaExcel("Ricerca", [{ nome: "Risultati", righe: righeExcel }]);
    } catch (err) {
      alert(`⚠️ Errore nell'esportazione:\n\n${err.message}`);
    }
    setEsportando("");
  }

  // Menu dei filtri: aree e centri di costo dal Piano dei Conti (comprese «ACQUISTO ANIMALI» e «TRASPORTO ANIMALI»)
  const areeDisponibili = useMemo(() => {
    const dalPiano = [...new Set(pianoDeiConti.map(p => p.area).filter(Boolean))];
    return [...AREE_ORDINARIE.filter(a => dalPiano.includes(a)), ...dalPiano.filter(a => !AREE_ORDINARIE.includes(a)).sort()];
  }, [pianoDeiConti]);
  const centriCostoDisponibili = useMemo(() => [...new Set(pianoDeiConti.filter(p => !area || p.area === area).map(p => p.centro_costo).filter(Boolean))].sort(), [pianoDeiConti, area]);
  const anniDisponibili = risposta?.anni || [];
  const navigazione = <NavigazionePagine numero={numeroTrovate} inizio={inizio} gruppo={gruppo} setInizio={setInizio} setGruppo={setGruppo} loading={loading} />;

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Ricerca</h1>
        <button onClick={esporta} disabled={!numeroTrovate || !!esportando}
          style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {esportando ? `📥 Esportazione… ${esportando}` : "📥 Esporta Excel"}
        </button>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Ricerca trasversale su numero, controparte, descrizione articoli e note (per gli acquisti di animali anche matricola, lotto e razza) — con filtri per tipo, area, specie, periodo e importo.
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <input placeholder="Cerca per numero, fornitore/cliente, descrizione articolo o note..." value={testo} onChange={e => setTesto(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, marginBottom: 12 }} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <Campo label="Tipo">
            <select value={tipo} onChange={e => setTipo(e.target.value)} style={selectStyle}>
              <option value="tutte">Tutte</option><option value="PASSIVA">Solo acquisti</option><option value="ATTIVA">Solo vendite</option>
              <option value="DA_RICEVERE">Da ricevere (documenti di competenza)</option><option value="DA_EMETTERE">Da emettere (documenti di competenza)</option>
            </select>
          </Campo>
          <Campo label="Area">
            <select value={area} onChange={e => { setArea(e.target.value); setCentroCosto(""); }} style={selectStyle}>
              <option value="">Tutte</option>
              {areeDisponibili.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Campo>
          <Campo label="Centro di Costo">
            <select value={centroCosto} onChange={e => setCentroCosto(e.target.value)} style={selectStyle}>
              <option value="">Tutti</option>
              {centriCostoDisponibili.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo label="Specie/Destinazione">
            <select value={destinazione} onChange={e => setDestinazione(e.target.value)} style={selectStyle}>
              <option value="">Tutte</option>
              {DESTINAZIONI.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Campo>
          <Campo label="Tipo di Costo">
            <select value={tipoCosto} onChange={e => setTipoCosto(e.target.value)} style={selectStyle}>
              <option value="">Tutti</option>
              <option value="Fisso">Fisso</option><option value="Variabile">Variabile</option><option value="Ammortizzabile">Ammortizzabile</option>
            </select>
          </Campo>
          <Campo label="Anno">
            <select value={anno} onChange={e => setAnno(e.target.value)} style={selectStyle}>
              <option value="">Tutti</option>
              {anniDisponibili.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Campo>
          <Campo label="Data da"><input type="date" value={dataDa} onChange={e => setDataDa(e.target.value)} style={selectStyle} /></Campo>
          <Campo label="Data a"><input type="date" value={dataA} onChange={e => setDataA(e.target.value)} style={selectStyle} /></Campo>
          <Campo label="Importo minimo (€)"><input type="number" value={importoMin} onChange={e => setImportoMin(e.target.value)} style={selectStyle} /></Campo>
          <Campo label="Importo massimo (€)"><input type="number" value={importoMax} onChange={e => setImportoMax(e.target.value)} style={selectStyle} /></Campo>
        </div>
      </div>

      {errore && <div style={{ color: C.red, whiteSpace: "pre-wrap", margin: "12px 0", fontWeight: 700 }}>⚠️ {errore}</div>}
      {risposta && (
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>
          {numeroTrovate.toLocaleString("it-IT")} fatture trovate — totale delle fatture trovate {formattaEuro(Number(risposta.totale_lordo || 0))} (calcolato su tutte, anche quelle non mostrate)
          {risposta.totale_righe_scelte != null && (
            <><br /><strong style={{ color: C.primary }}>di cui righe con {[area && `area «${area}»`, centroCosto && `centro di costo «${centroCosto}»`, destinazione && `destinazione «${destinazione}»`, tipoCosto && `tipo di costo «${tipoCosto}»`].filter(Boolean).join(", ")}: {formattaEuro(Number(risposta.totale_righe_scelte || 0))}</strong></>
          )}
          {numeroAnimali > 0 && <><br />di cui {numeroAnimali.toLocaleString("it-IT")} acquisti di animali: {formattaEuro(Number(risposta.totale_acquisti_animali || 0))} (solo l'importo dei capi: l'IVA non è registrata)</>}
          {Number(risposta.numero_competenza || 0) > 0 && <><br />🗂️ di cui {Number(risposta.numero_competenza).toLocaleString("it-IT")} documenti di competenza (da ricevere o da emettere): {formattaEuro(Number(risposta.totale_competenza || 0))} — leggere il rinvio alla pagina {PAGINA_COMPETENZA}</>}
          {Number(risposta.numero_trasporti_ai_capi || 0) > 0 && <><br />🚚 trasporti attribuiti ai capi: {formattaEuro(Number(risposta.totale_trasporti_ai_capi || 0))} in {Number(risposta.numero_trasporti_ai_capi).toLocaleString("it-IT")} fatture (non compresi nel totale delle fatture: le loro righe valgono 0 e l'importo è nel Report Acquisto Animali{risposta.totale_righe_scelte != null ? "; è invece compreso nel «di cui righe»" : ""})</>}
        </p>
      )}
      {navigazione}

      {loading ? (
        <p style={{ color: C.muted }}>Caricamento...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {risultati.map(f => (
            <div key={f.chiave} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <div onClick={() => espandi(f)} style={{ display: "flex", justifyContent: "space-between", padding: 14, cursor: "pointer", flexWrap: "wrap", gap: 8 }}>
                <div>
                  {f.acquisto_animali ? <EtichettaAcquistoAnimali /> : (
                    <span style={{ fontSize: 11, fontWeight: 700, color: f.tipo === "ATTIVA" ? C.green : C.blue, marginRight: 8 }}>
                      {etichettaTipo(f.tipo)}
                    </span>
                  )}
                  {modificaFatturaId === f.id ? (
                    <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 4 }}>
                      <select value={formModificaFattura.fornitore_id || ""} onChange={e => {
                        // Versione 235: gli id dei fornitori sono numeri, il valore del menu è testo
                        const fo = fornitori.find(x => String(x.id) === e.target.value);
                        setFormModificaFattura(prev => ({ ...prev, fornitore_id: fo ? fo.id : "", nome_fornitore: fo?.nome || "", partita_iva: fo?.partita_iva || "", codice_fiscale: fo?.codice_fiscale || "" }));
                      }}
                        style={{ padding: "3px 6px", borderRadius: 5, border: `1.5px solid ${C.border}`, fontSize: 12 }}>
                        <option value="">— fornitore —</option>
                        {fornitori.map(fo => <option key={fo.id} value={fo.id}>{fo.nome}</option>)}
                      </select>
                      <input value={formModificaFattura.nome_fornitore || ""} onChange={e => setFormModificaFattura(prev => ({ ...prev, nome_fornitore: e.target.value }))}
                        placeholder="Nome fornitore" style={{ width: 160, padding: "3px 6px", borderRadius: 5, border: `1.5px solid ${C.border}`, fontSize: 12 }} />
                      <input value={formModificaFattura.partita_iva || ""} onChange={e => setFormModificaFattura(prev => ({ ...prev, partita_iva: e.target.value }))}
                        placeholder="P.IVA" style={{ width: 110, padding: "3px 6px", borderRadius: 5, border: `1.5px solid ${C.border}`, fontSize: 12 }} />
                      <input value={formModificaFattura.codice_fiscale || ""} onChange={e => setFormModificaFattura(prev => ({ ...prev, codice_fiscale: e.target.value }))}
                        placeholder="Cod. Fiscale" style={{ width: 130, padding: "3px 6px", borderRadius: 5, border: `1.5px solid ${C.border}`, fontSize: 12 }} />
                      <input value={formModificaFattura.numero || ""} onChange={e => setFormModificaFattura(prev => ({ ...prev, numero: e.target.value }))}
                        placeholder="Numero" style={{ width: 90, padding: "3px 6px", borderRadius: 5, border: `1.5px solid ${C.border}`, fontSize: 12 }} />
                      <input type="date" value={formModificaFattura.data || ""} onChange={e => setFormModificaFattura(prev => ({ ...prev, data: e.target.value }))}
                        style={{ padding: "3px 6px", borderRadius: 5, border: `1.5px solid ${C.border}`, fontSize: 12 }} />
                      <button onClick={() => salvaFattura(f.id)}
                        style={{ background: C.green, color: "#fff", border: "none", borderRadius: 5, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>✓</button>
                      <button onClick={() => setModificaFatturaId(null)}
                        style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <strong>{f.controparte || "—"}</strong>
                      <div style={{ fontSize: 12, color: C.muted }}>
                        Fatt. {numeroFattura(f)} del {f.data}{f.note && ` · ${f.note}`}
                        {" "}{!f.acquisto_animali && <span onClick={e => {
                          e.stopPropagation(); setModificaFatturaId(f.id);
                          const fo = fornitori.find(x => x.id === f.fornitore_id);
                          setFormModificaFattura({ numero: f.numero, data: f.data, fornitore_id: f.fornitore_id, nome_fornitore: fo?.nome || "", partita_iva: fo?.partita_iva || "", codice_fiscale: fo?.codice_fiscale || "" });
                        }}
                          style={{ cursor: "pointer" }} title="Modifica fornitore/numero/data">✏️</span>}
                      </div>
                      {Number(f.trasporto_ai_capi) > 0 && <NotaTrasportoAiCapi importo={Number(f.trasporto_ai_capi)} />}
                      <NotaCompetenza f={f} />
                    </>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: C.primary }}>{formattaEuro(f.totale_lordo)}</div>
                  {f.acquisto_animali && <div style={{ fontSize: 11, color: C.muted }}>IVA non registrata</div>}
                  <div style={{ fontSize: 11, color: C.muted }}>{espansa === f.chiave ? "▲ nascondi" : "▼ dettaglio"}</div>
                </div>
              </div>
              {espansa === f.chiave && f.acquisto_animali && righePerFattura[f.chiave] && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: 14 }}>
                  <CapiAcquisto capi={righePerFattura[f.chiave]} />
                </div>
              )}
              {espansa === f.chiave && !f.acquisto_animali && righePerFattura[f.chiave] && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: 14 }}>
                  {/* Versione 285: la fattura ricomposta, uguale a Fatture Passive e Attive, con la classificazione e la matita */}
                  <RicomposizioneFattura fattura={{ ...f, ci_fornitori: { nome: f.controparte, partita_iva: f.partita_iva } }} righe={righePerFattura[f.chiave]}
                    azioneRiga={r => (
                      <button onClick={() => iniziaModificaRiga(r)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13 }} title="Modifica la riga e la sua classificazione">✏️</button>
                    )}
                    sostituisciRiga={r => (modificaRigaId === r.id ? (
                        <div>
                          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <CampoTesto label="Descrizione" value={formModificaRiga.descrizione} onChange={v => setFormModificaRiga(prev => ({ ...prev, descrizione: v }))} />
                            <CampoTesto label="Quantità" tipo="number" value={formModificaRiga.quantita} onChange={v => setFormModificaRiga(prev => ({ ...prev, quantita: v }))} />
                            <CampoSelect label="U.M." value={formModificaRiga.unita_misura} options={UNITA_OPZIONI} onChange={v => setFormModificaRiga(prev => ({ ...prev, unita_misura: v }))} />
                            <CampoTesto label="Prezzo unitario" tipo="number" value={formModificaRiga.prezzo_unitario} onChange={v => setFormModificaRiga(prev => ({ ...prev, prezzo_unitario: v }))} />
                            <CampoTesto label="Importo" tipo="number" value={formModificaRiga.totale_riga} onChange={v => setFormModificaRiga(prev => ({ ...prev, totale_riga: v }))} />
                            <CampoTesto label="Aliquota IVA %" tipo="number" value={formModificaRiga.aliquota_iva} onChange={v => setFormModificaRiga(prev => ({ ...prev, aliquota_iva: v }))} />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                            <CampoSelect label="Area" value={formModificaRiga.area} options={AREE_ORDINARIE}
                              onChange={v => setFormModificaRiga(prev => ({ ...prev, area: v, centro_costo: "" }))} />
                            <CampoSelect label="Centro di Costo" value={formModificaRiga.centro_costo} options={centriPerArea(formModificaRiga.area)}
                              onChange={v => setFormModificaRiga(prev => ({ ...prev, centro_costo: v }))} />
                            <CampoSelect label="Destinazione" value={formModificaRiga.destinazione} options={DESTINAZIONI}
                              onChange={v => setFormModificaRiga(prev => ({ ...prev, destinazione: v }))} />
                            <CampoSelect label="Tipo di Costo" value={formModificaRiga.tipo_costo} options={["Fisso", "Variabile", "Ammortizzabile"]}
                              onChange={v => setFormModificaRiga(prev => ({ ...prev, tipo_costo: v }))} />
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <button onClick={() => salvaModificaRiga(r.id, f.id)} disabled={salvandoRiga === r.id}
                              style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              {salvandoRiga === r.id ? "Salvataggio..." : "✓ Salva"}
                            </button>
                            <button onClick={() => setModificaRigaId(null)}
                              style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>
                              Annulla
                            </button>
                          </div>
                        </div>
                    ) : null)} />
                </div>
              )}
            </div>
          ))}
          {!errore && risultati.length === 0 && <p style={{ color: C.muted }}>Nessun risultato.</p>}
        </div>
      )}
      {!loading && navigazione}
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  );
}

function CampoTesto({ label, value, onChange, tipo = "text" }) {
  return (
    <label style={{ fontSize: 11, color: C.muted }}>
      {label}
      <input type={tipo} step="0.01" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, marginTop: 2 }} />
    </label>
  );
}

function CampoSelect({ label, value, options, onChange }) {
  return (
    <label style={{ fontSize: 11, color: C.muted }}>
      {label}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "5px 7px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12, marginTop: 2 }}>
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

const selectStyle = { width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 };
