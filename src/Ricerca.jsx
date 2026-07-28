import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { C } from "./style";import { numerizzaCampi, formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

const AREE_ORDINARIE = [
  "Allevamento", "Coltivazione", "Lavoro", "Energia Elettrica", "Acqua", "Consulenze",
  "Assicurazioni", "Lavorazioni prodotti allevamento", "Spese Promozionali",
  "Canoni ed Abbonamenti", "Varie", "Oneri Finanziari", "Orto", "Animali non d'allevamento", "Ammortamenti",
];
const DESTINAZIONI = ["Bovini", "Suini", "Ovini", "Bovini e Ovini", "Generali", "Pollame", "Cavalli"];

export default function Ricerca() {
  const [fatture, setFatture] = useState([]);
  const [articoli, setArticoli] = useState([]);
  const [loading, setLoading] = useState(true);
  const [espansa, setEspansa] = useState(null);
  const [righePerFattura, setRighePerFattura] = useState({});
  const [pianoDeiConti, setPianoDeiConti] = useState([]);
  const [modificaRigaId, setModificaRigaId] = useState(null);
  const [formModificaRiga, setFormModificaRiga] = useState({});
  const [salvandoRiga, setSalvandoRiga] = useState(null);

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

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    const { data: f, error: eF } = await supabase.from("ci_fatture").select("*, ci_fornitori(nome), ci_clienti(nome)").order("data", { ascending: false });
    if (eF) { alert(`⚠️ Errore nel caricamento fatture:\n\n${eF.message}`); setLoading(false); return; }
    const { data: a, error: eA } = await supabase.from("ci_articoli_fattura").select("fattura_id, descrizione, area, centro_costo, destinazione, tipo_costo, totale_riga");
    if (eA) { alert(`⚠️ Errore nel caricamento articoli:\n\n${eA.message}`); setLoading(false); return; }
    const { data: pdc } = await supabase.from("ci_piano_dei_conti").select("*").order("area").order("centro_costo");
    setPianoDeiConti(pdc || []);

    setFatture(numerizzaCampi(f || [], ["totale_netto", "totale_iva", "totale_lordo"]));
    setArticoli(numerizzaCampi(a || [], ["totale_riga"]));
    setLoading(false);
  }

  function centriPerArea(areaScelta) {
    return pianoDeiConti.filter(p => p.area === areaScelta).map(p => p.centro_costo);
  }

  function iniziaModificaRiga(r) {
    setModificaRigaId(r.id);
    setFormModificaRiga({ area: r.area || "", centro_costo: r.centro_costo || "", destinazione: r.destinazione || "", tipo_costo: r.tipo_costo || "" });
  }

  async function salvaModificaRiga(rigaId, fatturaId) {
    setSalvandoRiga(rigaId);
    try {
      const { error } = await supabase.from("ci_articoli_fattura").update({
        area: formModificaRiga.area || null, centro_costo: formModificaRiga.centro_costo || null,
        destinazione: formModificaRiga.destinazione || null, tipo_costo: formModificaRiga.tipo_costo || null,
      }).eq("id", rigaId);
      if (error) throw new Error(error.message);
      setModificaRigaId(null);
      setFormModificaRiga({});
      // Ricarico solo le righe di questa fattura, e l'elenco leggero usato per i filtri
      const { data } = await supabase.from("ci_articoli_fattura").select("*").eq("fattura_id", fatturaId).order("id");
      setRighePerFattura(prev => ({ ...prev, [fatturaId]: numerizzaCampi(data || [], ["quantita", "prezzo_unitario", "totale_riga", "aliquota_iva", "totale_iva"]) }));
      const { data: a } = await supabase.from("ci_articoli_fattura").select("fattura_id, descrizione, area, destinazione, totale_riga");
      setArticoli(numerizzaCampi(a || [], ["totale_riga"]));
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio:\n\n${err.message}`);
    }
    setSalvandoRiga(null);
  }

  const articoliPerFattura = useMemo(() => {
    const mappa = new Map();
    articoli.forEach(a => {
      if (!mappa.has(a.fattura_id)) mappa.set(a.fattura_id, []);
      mappa.get(a.fattura_id).push(a);
    });
    return mappa;
  }, [articoli]);

  const risultati = useMemo(() => {
    const q = testo.trim().toLowerCase();
    return fatture.filter(f => {
      if (tipo !== "tutte" && f.tipo !== tipo) return false;
      if (anno && new Date(f.data).getFullYear() !== parseInt(anno)) return false;
      if (dataDa && f.data < dataDa) return false;
      if (dataA && f.data > dataA) return false;
      if (importoMin && f.totale_lordo < parseFloat(importoMin)) return false;
      if (importoMax && f.totale_lordo > parseFloat(importoMax)) return false;

      const righeFattura = articoliPerFattura.get(f.id) || [];
      if (area && !righeFattura.some(r => r.area === area)) return false;
      if (centroCosto && !righeFattura.some(r => r.centro_costo === centroCosto)) return false;
      if (destinazione && !righeFattura.some(r => r.destinazione === destinazione)) return false;
      if (tipoCosto && !righeFattura.some(r => r.tipo_costo === tipoCosto)) return false;

      if (q) {
        const controparte = (f.ci_fornitori?.nome || f.ci_clienti?.nome || "").toLowerCase();
        const testoFattura = `${f.numero} ${controparte} ${f.note || ""}`.toLowerCase();
        const matchFattura = testoFattura.includes(q);
        const matchArticolo = righeFattura.some(r => (r.descrizione || "").toLowerCase().includes(q));
        if (!matchFattura && !matchArticolo) return false;
      }
      return true;
    });
  }, [fatture, articoliPerFattura, testo, tipo, area, centroCosto, destinazione, tipoCosto, anno, dataDa, dataA, importoMin, importoMax]);

  async function espandi(fatturaId) {
    if (espansa === fatturaId) { setEspansa(null); return; }
    setEspansa(fatturaId);
    if (!righePerFattura[fatturaId]) {
      const { data, error } = await supabase.from("ci_articoli_fattura").select("*").eq("fattura_id", fatturaId).order("id");
      if (error) { alert(`⚠️ Errore nel caricamento delle righe:\n\n${error.message}`); return; }
      setRighePerFattura(prev => ({ ...prev, [fatturaId]: numerizzaCampi(data || [], ["quantita", "prezzo_unitario", "totale_riga", "aliquota_iva", "totale_iva"]) }));
    }
  }

  function esporta() {
    const righeExcel = risultati.map(f => ({
      "Tipo": f.tipo === "ATTIVA" ? "Vendita" : "Acquisto", "Controparte": f.ci_fornitori?.nome || f.ci_clienti?.nome,
      "Numero": f.numero, "Data": f.data, "Totale netto": numeroExcel(f.totale_netto),
      "Totale IVA": numeroExcel(f.totale_iva), "Totale lordo": numeroExcel(f.totale_lordo), "Note": f.note,
    }));
    esportaExcel("Ricerca", [{ nome: "Risultati", righe: righeExcel }]);
  }

  const totaleRisultati = risultati.reduce((s, f) => s + (f.totale_lordo || 0), 0);
  const totaleRigheCentroCosto = useMemo(() => {
    if (!centroCosto) return null;
    const idFattureRisultati = new Set(risultati.map(f => f.id));
    return articoli
      .filter(a => a.centro_costo === centroCosto && idFattureRisultati.has(a.fattura_id))
      .reduce((s, a) => s + (a.totale_riga || 0), 0);
  }, [centroCosto, articoli, risultati]);
  const anniDisponibili = useMemo(() => [...new Set(fatture.map(f => new Date(f.data).getFullYear()))].sort((a, b) => b - a), [fatture]);
  const centriCostoDisponibili = useMemo(() => [...new Set(articoli.map(a => a.centro_costo).filter(Boolean))].sort(), [articoli]);

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Ricerca</h1>
        <button onClick={esporta}
          style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          📥 Esporta Excel
        </button>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Ricerca trasversale su numero, controparte, descrizione articoli e note — con filtri per tipo, area, specie, periodo e importo.
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <input placeholder="Cerca per numero, fornitore/cliente, descrizione articolo o note..." value={testo} onChange={e => setTesto(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, marginBottom: 12 }} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <Campo label="Tipo">
            <select value={tipo} onChange={e => setTipo(e.target.value)} style={selectStyle}>
              <option value="tutte">Tutte</option><option value="PASSIVA">Solo acquisti</option><option value="ATTIVA">Solo vendite</option>
            </select>
          </Campo>
          <Campo label="Area">
            <select value={area} onChange={e => setArea(e.target.value)} style={selectStyle}>
              <option value="">Tutte</option>
              {AREE_ORDINARIE.map(a => <option key={a} value={a}>{a}</option>)}
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

      <p style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>{risultati.length} fatture trovate — totale {formattaEuro(totaleRisultati)}
        {totaleRigheCentroCosto != null && (
          <strong style={{ color: C.primary }}> · Solo "{centroCosto}": {formattaEuro(totaleRigheCentroCosto)}</strong>
        )}
      </p>

      {loading ? (
        <p style={{ color: C.muted }}>Caricamento...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {risultati.slice(0, 200).map(f => (
            <div key={f.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <div onClick={() => espandi(f.id)} style={{ display: "flex", justifyContent: "space-between", padding: 14, cursor: "pointer", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: f.tipo === "ATTIVA" ? C.green : C.blue, marginRight: 8 }}>
                    {f.tipo === "ATTIVA" ? "VENDITA" : "ACQUISTO"}
                  </span>
                  <strong>{f.ci_fornitori?.nome || f.ci_clienti?.nome || "—"}</strong>
                  <div style={{ fontSize: 12, color: C.muted }}>Fatt. {f.numero} del {f.data}{f.note && ` · ${f.note}`}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: C.primary }}>{formattaEuro(f.totale_lordo)}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{espansa === f.id ? "▲ nascondi" : "▼ dettaglio"}</div>
                </div>
              </div>
              {espansa === f.id && righePerFattura[f.id] && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: 14 }}>
                  {righePerFattura[f.id].map(r => (
                    <div key={r.id} style={{ padding: "10px 0", borderTop: `1px solid ${C.border}` }}>
                      {modificaRigaId === r.id ? (
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{r.descrizione}</div>
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
                      ) : (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 13 }}>{r.descrizione}</div>
                            <div style={{ fontSize: 11, color: C.muted }}>
                              {r.area || "—"} · {r.centro_costo || "—"} · {r.destinazione || "—"} · {r.tipo_costo || "—"}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ fontWeight: 700 }}>{formattaEuro(r.totale_riga)}</div>
                            <button onClick={() => iniziaModificaRiga(r)}
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13 }} title="Modifica classificazione">✏️</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {risultati.length > 200 && <p style={{ color: C.muted, fontSize: 12, textAlign: "center" }}>... e altre {risultati.length - 200} fatture — affina la ricerca per vederle</p>}
          {risultati.length === 0 && <p style={{ color: C.muted }}>Nessun risultato.</p>}
        </div>
      )}
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
