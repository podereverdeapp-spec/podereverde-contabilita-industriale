import { oggiRoma } from "./dateRoma";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, formattaEuro, round2, fetchAllPages } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

const DESTINAZIONI = ["Bovini", "Suini", "Ovini", "Bovini e Ovini", "Bovini e Suini", "Suini e Ovini", "Generali", "Pollame", "Cavalli"];
const TIPI_COSTO = ["Fisso", "Variabile"];

// Versione 268 (decisione del Dott. Bizzarri del 21/10/2026 ore 12:40–12:47): i costi diretti sono quelli
// che non arrivano nel cassetto fiscale di Aruba. Si scrivono imponibile, cassa previdenziale e aliquota IVA;
// il costo per la contabilità industriale è imponibile + cassa, più l'IVA solo se non detraibile.
// La cassa è soggetta a IVA: IVA = (imponibile + cassa) × aliquota.
function calcolaImporti(f) {
  const imponibile = round2(parseFloat(f.imponibile) || 0);
  const cassa = round2(imponibile * (parseFloat(f.cassa_percentuale) || 0) / 100);
  const iva = round2((imponibile + cassa) * (parseFloat(f.aliquota_iva) || 0) / 100);
  const totale = round2(imponibile + cassa + iva);
  const costo = round2(imponibile + cassa + (f.iva_non_detraibile ? iva : 0));
  return { imponibile, cassa, iva, totale, costo };
}

export default function CostiDiretti() {
  const [costi, setCosti] = useState([]);
  const [pianoConti, setPianoConti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(vuoto());
  const [salvando, setSalvando] = useState(false);
  const [eliminando, setEliminando] = useState(null);
  const [filtroAnno, setFiltroAnno] = useState("");
  // Versione 268: correzione di un costo già registrato (id del costo in modifica, null = nuovo costo)
  const [inModifica, setInModifica] = useState(null);

  function vuoto() {
    return { data: oggiRoma(), area: "Lavoro", centro_costo: "", destinazione: "", tipo_costo: "Fisso", imponibile: "", cassa_percentuale: "", aliquota_iva: "22", iva_non_detraibile: false, descrizione: "", dipendente: "" };
  }

  useEffect(() => { carica(); caricaPiano(); }, []);

  async function carica() {
    setLoading(true);
    const { data, error } = await fetchAllPages((da, a) => supabase.from("ci_costi_diretti").select("*").order("data", { ascending: false }).order("id").range(da, a));
    if (error) { alert(`⚠️ Errore nel caricamento:\n\n${error.message}`); setLoading(false); return; }
    setCosti(numerizzaCampi(data || [], ["importo", "imponibile", "cassa_importo", "iva", "totale_documento"]));
    setLoading(false);
  }
  async function caricaPiano() {
    const { data } = await supabase.from("ci_piano_dei_conti").select("*").order("area").order("centro_costo");
    setPianoConti(data || []);
  }

  const aree = [...new Set(pianoConti.map(p => p.area))];
  const centriPerArea = area => pianoConti.filter(p => p.area === area).map(p => p.centro_costo);

  async function salva() {
    if (!form.area || !form.tipo_costo || form.imponibile === "" || !form.data) {
      alert("Compila almeno Data, Area, Tipo di Costo e Imponibile.");
      return;
    }
    const imp = calcolaImporti(form);
    setSalvando(true);
    try {
      const campi = {
        data: form.data, area: form.area, centro_costo: form.centro_costo || null,
        destinazione: form.destinazione || null, tipo_costo: form.tipo_costo,
        importo: imp.costo, imponibile: imp.imponibile,
        cassa_percentuale: form.cassa_percentuale === "" ? null : parseFloat(form.cassa_percentuale), cassa_importo: imp.cassa,
        aliquota_iva: form.aliquota_iva === "" ? null : parseFloat(form.aliquota_iva), iva: imp.iva,
        iva_non_detraibile: !!form.iva_non_detraibile, totale_documento: imp.totale,
        descrizione: form.descrizione || null,
        dipendente: form.dipendente || null,
      };
      const { error } = inModifica
        ? await supabase.from("ci_costi_diretti").update(campi).eq("id", inModifica)
        : await supabase.from("ci_costi_diretti").insert([campi]);
      if (error) throw new Error(error.message);
      setForm(vuoto()); setInModifica(null);
      carica();
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio:\n\n${err.message}`);
    }
    setSalvando(false);
  }

  // Carica nel modulo un costo registrato per correggerlo. Le righe registrate prima della versione 268
  // non hanno imponibile: si propone l'importo come imponibile, senza cassa e senza IVA (il costo non cambia).
  function modifica(c) {
    setInModifica(c.id);
    setForm({
      data: c.data, area: c.area, centro_costo: c.centro_costo || "", destinazione: c.destinazione || "", tipo_costo: c.tipo_costo,
      imponibile: String(c.imponibile ?? c.importo ?? ""), cassa_percentuale: c.cassa_percentuale != null ? String(c.cassa_percentuale) : "",
      aliquota_iva: c.aliquota_iva != null ? String(c.aliquota_iva) : "", iva_non_detraibile: !!c.iva_non_detraibile,
      descrizione: c.descrizione || "", dipendente: c.dipendente || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function annullaModifica() { setInModifica(null); setForm(vuoto()); }

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
      "Tipo di Costo": c.tipo_costo, "Imponibile": numeroExcel(c.imponibile), "Cassa previdenziale %": numeroExcel(c.cassa_percentuale), "Cassa previdenziale": numeroExcel(c.cassa_importo),
      "Aliquota IVA %": numeroExcel(c.aliquota_iva), "IVA": numeroExcel(c.iva), "IVA non detraibile": c.iva_non_detraibile ? "Sì" : "No", "Totale documento": numeroExcel(c.totale_documento),
      "Costo per la contabilità industriale": numeroExcel(c.importo), "Dipendente": c.dipendente, "Descrizione": c.descrizione,
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
        Per i costi che non arrivano nel cassetto fiscale di Aruba. Il costo per la contabilità industriale è imponibile + cassa previdenziale; l'IVA entra nel costo solo se è segnata come non detraibile. Stessa classificazione Area / Centro di Costo / Destinazione / Tipo di Costo delle fatture.
      </p>

      <div style={{ background: C.card, border: `${inModifica ? 2 : 1}px solid ${inModifica ? C.accent : C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        {inModifica && (
          <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 10 }}>✏️ Correzione di un costo già registrato: cambiare i campi e premere «💾 Salva la correzione».</div>
        )}
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
          <Campo label="Imponibile (€)">
            <input type="number" step="0.01" value={form.imponibile} onChange={e => setForm(f => ({ ...f, imponibile: e.target.value }))} style={inputStyle} />
          </Campo>
          <Campo label="Cassa previdenziale %">
            <input type="number" step="0.01" placeholder="se c'è, es. 4" value={form.cassa_percentuale} onChange={e => setForm(f => ({ ...f, cassa_percentuale: e.target.value }))} style={inputStyle} />
          </Campo>
          <Campo label="Aliquota IVA %">
            <input type="number" step="0.01" value={form.aliquota_iva} onChange={e => setForm(f => ({ ...f, aliquota_iva: e.target.value }))} style={inputStyle} />
          </Campo>
          <Campo label="IVA non detraibile">
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, paddingTop: 6 }}>
              <input type="checkbox" checked={!!form.iva_non_detraibile} onChange={e => setForm(f => ({ ...f, iva_non_detraibile: e.target.checked }))} />
              l'IVA entra nel costo
            </label>
          </Campo>
          <Campo label="Dipendente (facoltativo)">
            <input type="text" placeholder="Lascia vuoto per un totale aggregato" value={form.dipendente} onChange={e => setForm(f => ({ ...f, dipendente: e.target.value }))} style={inputStyle} />
          </Campo>
          <Campo label="Descrizione">
            <input type="text" value={form.descrizione} onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))} style={inputStyle} />
          </Campo>
        </div>
        {(() => { const i = calcolaImporti(form); return (
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, background: C.bg, borderRadius: 8, padding: "8px 12px" }}>
            <span>Imponibile <b>{formattaEuro(i.imponibile)}</b></span>
            <span>Cassa <b>{formattaEuro(i.cassa)}</b></span>
            <span>IVA <b>{formattaEuro(i.iva)}</b></span>
            <span>Totale documento <b>{formattaEuro(i.totale)}</b></span>
            <span style={{ color: C.primary }}>Costo per la contabilità industriale <b style={{ fontSize: 15 }}>{formattaEuro(i.costo)}</b>{form.iva_non_detraibile ? " (IVA compresa)" : " (senza IVA)"}</span>
          </div>); })()}
        <button onClick={salva} disabled={salvando}
          style={{ marginTop: 12, background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          {salvando ? "Salvataggio..." : inModifica ? "💾 Salva la correzione" : "+ Registra costo"}
        </button>
        {inModifica && (
          <button onClick={annullaModifica} disabled={salvando}
            style={{ marginTop: 12, marginLeft: 8, background: "#fff", color: C.muted, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Annulla
          </button>
        )}
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
                {c.imponibile != null && (
                  <div style={{ fontSize: 12, color: C.muted }}>
                    Imponibile {formattaEuro(c.imponibile)}{c.cassa_importo ? ` · cassa ${formattaEuro(c.cassa_importo)}` : ""} · IVA {formattaEuro(c.iva || 0)}{c.iva_non_detraibile ? " non detraibile" : ""} · totale documento {formattaEuro(c.totale_documento || 0)}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 16, color: C.primary }}>{formattaEuro(c.importo)}</span>
                <button onClick={() => modifica(c)} disabled={salvando}
                  style={{ background: "none", border: `1.5px solid ${C.primary}`, color: C.primary, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  ✏️ Correggi
                </button>
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
