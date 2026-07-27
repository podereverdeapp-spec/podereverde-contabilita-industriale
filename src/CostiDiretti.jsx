import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, formattaEuro, round2 } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

const DESTINAZIONI = ["Bovini", "Suini", "Ovini", "Bovini e Ovini", "Generali", "Pollame", "Cavalli"];
const TIPI_COSTO = ["Fisso", "Variabile"];

export default function CostiDiretti() {
  const [costi, setCosti] = useState([]);
  const [pianoConti, setPianoConti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(vuoto());
  const [salvando, setSalvando] = useState(false);
  const [eliminando, setEliminando] = useState(null);
  const [filtroAnno, setFiltroAnno] = useState("");

  function vuoto() {
    return { data: new Date().toISOString().slice(0, 10), area: "Lavoro", centro_costo: "", destinazione: "", tipo_costo: "Fisso", importo: "", descrizione: "", dipendente: "" };
  }

  useEffect(() => { carica(); caricaPiano(); }, []);

  async function carica() {
    setLoading(true);
    const { data, error } = await supabase.from("ci_costi_diretti").select("*").order("data", { ascending: false });
    if (error) { alert(`⚠️ Errore nel caricamento:\n\n${error.message}`); setLoading(false); return; }
    setCosti(numerizzaCampi(data || [], ["importo"]));
    setLoading(false);
  }
  async function caricaPiano() {
    const { data } = await supabase.from("ci_piano_dei_conti").select("*").order("area").order("centro_costo");
    setPianoConti(data || []);
  }

  const aree = [...new Set(pianoConti.map(p => p.area))];
  const centriPerArea = area => pianoConti.filter(p => p.area === area).map(p => p.centro_costo);

  async function salva() {
    if (!form.area || !form.tipo_costo || !form.importo || !form.data) {
      alert("Compila almeno Data, Area, Tipo di Costo e Importo.");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.from("ci_costi_diretti").insert([{
        data: form.data, area: form.area, centro_costo: form.centro_costo || null,
        destinazione: form.destinazione || null, tipo_costo: form.tipo_costo,
        importo: round2(parseFloat(form.importo)), descrizione: form.descrizione || null,
        dipendente: form.dipendente || null,
      }]);
      if (error) throw new Error(error.message);
      setForm(vuoto());
      carica();
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio:\n\n${err.message}`);
    }
    setSalvando(false);
  }

  async function elimina(c) {
    if (!window.confirm(`Eliminare questo costo diretto (${c.descrizione || c.area}, ${formattaEuro(c.importo)})? Non si può annullare.`)) return;
    setEliminando(c.id);
    try {
      const { error } = await supabase.from("ci_costi_diretti").delete().eq("id", c.id);
      if (error) throw new Error(error.message);
      carica();
    } catch (err) {
      alert(`⚠️ Errore nell'eliminazione:\n\n${err.message}`);
    }
    setEliminando(null);
  }

  const anniDisponibili = [...new Set(costi.map(c => new Date(c.data).getFullYear()))].sort((a, b) => b - a);
  const filtrati = filtroAnno ? costi.filter(c => new Date(c.data).getFullYear() === parseInt(filtroAnno)) : costi;
  const totaleFiltrato = filtrati.reduce((s, c) => s + (c.importo || 0), 0);

  function esporta() {
    const righe = filtrati.map(c => ({
      "Data": c.data, "Area": c.area, "Centro di Costo": c.centro_costo, "Destinazione": c.destinazione,
      "Tipo di Costo": c.tipo_costo, "Importo": numeroExcel(c.importo), "Dipendente": c.dipendente, "Descrizione": c.descrizione,
    }));
    esportaExcel("CostiDiretti", [{ nome: "Costi Diretti", righe }]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Costi Diretti</h1>
        <button onClick={esporta}
          style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          📥 Esporta Excel
        </button>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Per i costi che non passano da una fattura fornitore — costo del lavoro (buste paga, per dipendente o come totale aggregato) e altri costi simili. Stessa classificazione Area/Centro di Costo/Destinazione/Tipo di Costo usata ovunque nell'app.
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <Campo label="Data">
            <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} style={inputStyle} />
          </Campo>
          <Campo label="Area">
            <select value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value, centro_costo: "" }))} style={inputStyle}>
              {aree.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Campo>
          <Campo label="Centro di Costo">
            <select value={form.centro_costo} onChange={e => setForm(f => ({ ...f, centro_costo: e.target.value }))} style={inputStyle}>
              <option value="">—</option>
              {centriPerArea(form.area).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo label="Destinazione">
            <select value={form.destinazione} onChange={e => setForm(f => ({ ...f, destinazione: e.target.value }))} style={inputStyle}>
              <option value="">—</option>
              {DESTINAZIONI.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Campo>
          <Campo label="Tipo di Costo">
            <select value={form.tipo_costo} onChange={e => setForm(f => ({ ...f, tipo_costo: e.target.value }))} style={inputStyle}>
              {TIPI_COSTO.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo label="Importo (€)">
            <input type="number" value={form.importo} onChange={e => setForm(f => ({ ...f, importo: e.target.value }))} style={inputStyle} />
          </Campo>
          <Campo label="Dipendente (facoltativo)">
            <input type="text" placeholder="Lascia vuoto per un totale aggregato" value={form.dipendente} onChange={e => setForm(f => ({ ...f, dipendente: e.target.value }))} style={inputStyle} />
          </Campo>
          <Campo label="Descrizione">
            <input type="text" value={form.descrizione} onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))} style={inputStyle} />
          </Campo>
        </div>
        <button onClick={salva} disabled={salvando}
          style={{ marginTop: 12, background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          {salvando ? "Salvataggio..." : "+ Registra costo"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: C.muted }}>Filtra per anno:</label>
        <select value={filtroAnno} onChange={e => setFiltroAnno(e.target.value)} style={{ ...inputStyle, width: 120 }}>
          <option value="">Tutti</option>
          {anniDisponibili.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span style={{ fontSize: 13, color: C.muted }}>{filtrati.length} costi — totale {formattaEuro(totaleFiltrato)}</span>
      </div>

      {loading ? <p style={{ color: C.muted }}>Caricamento...</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtrati.map(c => (
            <div key={c.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong>{c.area}</strong>{c.centro_costo && ` · ${c.centro_costo}`}{c.destinazione && ` · ${c.destinazione}`}
                <div style={{ fontSize: 12, color: C.muted }}>
                  {c.data} · {c.tipo_costo}{c.dipendente && ` · ${c.dipendente}`}{c.descrizione && ` · ${c.descrizione}`}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 16, color: C.primary }}>{formattaEuro(c.importo)}</span>
                <button onClick={() => elimina(c)} disabled={eliminando === c.id}
                  style={{ background: "none", border: `1.5px solid ${C.red}`, color: C.red, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {eliminando === c.id ? "..." : "🗑️"}
                </button>
              </div>
            </div>
          ))}
          {filtrati.length === 0 && <p style={{ color: C.muted }}>Nessun costo diretto registrato.</p>}
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

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 };
