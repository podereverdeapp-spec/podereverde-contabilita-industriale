import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro, round2 } from "./parsingUtils";

const AREE_ORDINARIE = [
  "Allevamento", "Coltivazione", "Lavoro", "Energia Elettrica", "Acqua", "Consulenze",
  "Assicurazioni", "Lavorazioni prodotti allevamento", "Spese Promozionali",
  "Canoni ed Abbonamenti", "Varie", "Oneri Finanziari", "Orto", "Animali non d'allevamento", "Ammortamenti",
];
const DESTINAZIONI = ["Bovini", "Suini", "Ovini", "Bovini e Ovini", "Generali", "Pollame", "Cavalli"];
const CATEGORIE_AMMORTAMENTO = [
  "3 - Attrezzatura specifica", "3 - Costruzioni leggere",
  "5 - Macchinari, apparecchi e attrezzature varie", "5 b - Macchinari, apparecchi e attrezzature varie extra allevamento",
  "6 - Spese atti notarili", "7 - Animali non oggetto di allevamento",
  "15 - Autovetture, motoveicoli e simili", "30 – Avviamento",
  "31 - Spese di costituzione e trasformazione", "34 - Altri oneri pluriennali",
];
const MAPPA_SPECIE_CESPITE = { "Bovini": ["Bovini"], "Suini": ["Suini"], "Ovini": ["Ovini"], "Generali": ["Generale"], "Nessuno": [], "Cavalli": ["Cavalli"], "Pollame": ["Pollame"], "Orto": ["Orto"] };

function normalizzaTesto(t) { return String(t || "").trim().toLowerCase(); }
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
  const [risultato, setRisultato] = useState(null);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState(null);
  const [registrandoIndice, setRegistrandoIndice] = useState(null);
  const [formRegistra, setFormRegistra] = useState({});
  const [salvandoRegistra, setSalvandoRegistra] = useState(false);
  const [pianoDeiConti, setPianoDeiConti] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => { supabase.from("ci_piano_dei_conti").select("*").order("area").order("centro_costo").then(({ data }) => setPianoDeiConti(data || [])); }, []);

  function centriPerArea(areaScelta) {
    return pianoDeiConti.filter(p => p.area === areaScelta).map(p => p.centro_costo);
  }

  function iniziaRegistrazione(indice, r) {
    setRegistrandoIndice(indice);
    setFormRegistra({
      tipoDestinazione: "fattura", numero: "", data: mappaData ? String(r[mappaData]).slice(0, 10) : new Date().toISOString().slice(0, 10),
      area: "", centro_costo: "", destinazione: "", tipo_costo: "",
      categoria_ammortamento: "", anni_ammortamento: "5", imputazione: "Generali",
    });
  }

  async function registraRigaMancante(r) {
    if (!r._fornitoreId) { alert("Fornitore non riconosciuto — registralo prima in anagrafica."); return; }
    if (!formRegistra.numero.trim()) { alert("Indica il numero fattura."); return; }
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

      if (formRegistra.tipoDestinazione === "cespite") {
        const { error } = await supabase.from("ci_cespiti").insert([{
          descrizione, categoria: formRegistra.categoria_ammortamento || null, fornitore_id: r._fornitoreId, fattura_id: fatturaId,
          data_acquisto: formRegistra.data, costo_acquisto: importo,
          anni_ammortamento: parseInt(formRegistra.anni_ammortamento) || 5, specie: MAPPA_SPECIE_CESPITE[formRegistra.imputazione] || [],
        }]);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("ci_articoli_fattura").insert([{
          fattura_id: fatturaId, descrizione, quantita: 1, totale_riga: importo, aliquota_iva: 0, totale_iva: 0,
          area: formRegistra.area || null, centro_costo: formRegistra.centro_costo || null,
          destinazione: formRegistra.destinazione || null, tipo_costo: formRegistra.tipo_costo || null,
        }]);
        if (error) throw new Error(error.message);
      }

      const { data: righeArt } = await supabase.from("ci_articoli_fattura").select("totale_riga, totale_iva").eq("fattura_id", fatturaId);
      const netto = (righeArt || []).reduce((s, x) => s + (parseFloat(x.totale_riga) || 0), 0);
      const iva = (righeArt || []).reduce((s, x) => s + (parseFloat(x.totale_iva) || 0), 0);
      await supabase.from("ci_fatture").update({ totale_netto: round2(netto), totale_iva: round2(iva), totale_lordo: round2(netto + iva) }).eq("id", fatturaId);

      setRisultato(prev => ({ ...prev, mancanti: prev.mancanti.filter(m => m !== r) }));
      setRegistrandoIndice(null);
    } catch (err) {
      alert(`⚠️ Errore nella registrazione:\n\n${err.message}`);
    }
    setSalvandoRegistra(false);
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
        const d = String(r[mappaData] instanceof Date ? r[mappaData].toISOString() : r[mappaData]);
        return d.startsWith(String(anno));
      });

      const { data: fornitori } = await supabase.from("ci_fornitori").select("id, nome");
      const mappaFornitori = new Map((fornitori || []).map(f => [normalizzaTesto(f.nome), f.id]));

      // Per ogni fornitore distinto nelle righe da controllare, carica TUTTI i costi
      // registrati per lui nell'anno, nelle 3 tabelle possibili — poi confronta
      const fornitoriDaControllare = [...new Set(righeAnno.map(r => normalizzaTesto(r[mappaFornitore])))];
      const poolPerFornitore = new Map(); // nomeNormalizzato -> [{descrizione, importo}]

      for (const nomeFornitore of fornitoriDaControllare) {
        const fornitoreId = mappaFornitori.get(nomeFornitore);
        if (!fornitoreId) { poolPerFornitore.set(nomeFornitore, null); continue; } // fornitore non trovato in anagrafica

        const [{ data: fatture }, { data: cespiti }, { data: acquistiAnimali }] = await Promise.all([
          supabase.from("ci_fatture").select("id").eq("fornitore_id", fornitoreId).eq("tipo", "PASSIVA")
            .gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`),
          supabase.from("ci_cespiti").select("descrizione, costo_acquisto").eq("fornitore_id", fornitoreId)
            .gte("data_acquisto", `${anno}-01-01`).lte("data_acquisto", `${anno}-12-31`),
          supabase.from("ci_report_acquisto_animali").select("specie, razza, importo").eq("fornitore_id", fornitoreId)
            .gte("data_fattura", `${anno}-01-01`).lte("data_fattura", `${anno}-12-31`),
        ]);

        const idFatture = (fatture || []).map(f => f.id);
        let articoli = [];
        if (idFatture.length > 0) {
          const { data } = await supabase.from("ci_articoli_fattura").select("descrizione, totale_riga").in("fattura_id", idFatture);
          articoli = data || [];
        }

        const pool = [
          ...articoli.map(a => ({ descrizione: a.descrizione, importo: a.totale_riga })),
          ...(cespiti || []).map(c => ({ descrizione: c.descrizione, importo: c.costo_acquisto })),
          ...(acquistiAnimali || []).map(a => ({ descrizione: `${a.specie || ""} ${a.razza || ""}`.trim() || "Acquisto animali", importo: a.importo })),
        ];
        poolPerFornitore.set(nomeFornitore, pool);
      }

      const mancanti = [];
      const fornitoriNonTrovati = new Set();
      righeAnno.forEach(r => {
        const nomeFornitore = normalizzaTesto(r[mappaFornitore]);
        const fornitoreId = mappaFornitori.get(nomeFornitore);
        const pool = poolPerFornitore.get(nomeFornitore);
        if (pool === null) { fornitoriNonTrovati.add(r[mappaFornitore]); mancanti.push({ ...r, _motivo: "Fornitore non trovato in anagrafica", _fornitoreId: null }); return; }
        const importoRiga = r[mappaImporto];
        const trovata = (pool || []).some(p => importoVicino(p.importo, importoRiga));
        if (!trovata) mancanti.push({ ...r, _motivo: "Nessun importo corrispondente trovato", _fornitoreId: fornitoreId });
      });

      setRisultato({ totaleControllate: righeAnno.length, mancanti, fornitoriNonTrovati: [...fornitoriNonTrovati] });
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
      </div>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}

      {colonne.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Indica quali colonne del file corrispondono a:</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <CampoMappa label="Fornitore (obbligatorio)" value={mappaFornitore} colonne={colonne} onChange={setMappaFornitore} />
            <CampoMappa label="Importo (obbligatorio)" value={mappaImporto} colonne={colonne} onChange={setMappaImporto} />
            <CampoMappa label="Descrizione (informativa)" value={mappaDescrizione} colonne={colonne} onChange={setMappaDescrizione} />
            <CampoMappa label="Data (per filtrare l'anno)" value={mappaData} colonne={colonne} onChange={setMappaData} />
          </div>
          <button onClick={confrontaRighe} disabled={caricando}
            style={{ marginTop: 12, background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {caricando ? "Confronto..." : "🔍 Confronta con il database"}
          </button>
        </div>
      )}

      {risultato && (
        <div>
          <p style={{ fontSize: 13, color: C.muted }}>{risultato.totaleControllate} righe controllate</p>
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
              <div style={{ background: "#FFF2DC", border: `1px solid ${C.yellow}`, borderRadius: 8, padding: "10px 16px", fontSize: 13, marginBottom: 10 }}>
                ⚠️ {risultato.mancanti.length} righe del file NON risultano registrate.
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
                            <CampoTestoLocale label="Anni Ammortamento" tipo="number" value={formRegistra.anni_ammortamento}
                              onChange={v => setFormRegistra(prev => ({ ...prev, anni_ammortamento: v }))} />
                            <CampoSelectLocale label="Imputazione" value={formRegistra.imputazione} options={Object.keys(MAPPA_SPECIE_CESPITE)}
                              onChange={v => setFormRegistra(prev => ({ ...prev, imputazione: v }))} />
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
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 13 }}>{r[mappaFornitore]} — {mappaDescrizione ? r[mappaDescrizione] : "—"}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>{r._motivo}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ fontWeight: 700 }}>{formattaEuro(parseFloat(r[mappaImporto]) || 0)}</div>
                          {r._fornitoreId && (
                            <button onClick={() => iniziaRegistrazione(i, r)}
                              style={{ background: C.blue + "20", color: C.blue, border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              ➕ Registra
                            </button>
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
        Il confronto principale è per importo (tolleranza ~2%, dato che l'imponibile può essere arrotondato diversamente tra l'estrazione e la registrazione) — la descrizione è mostrata a titolo informativo, non è richiesta per il match, dato che classificando una riga la descrizione può cambiare leggermente.
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
