import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro } from "./parsingUtils";

function nuovaRigaVuota() {
  return { id: `r-${Date.now()}-${Math.random()}`, descrizione: "", quantita: "", unita_misura: "", prezzo_unitario: "", aliquota_iva: "22", destinazione: "" };
}

export default function NuovaFatturaAttiva({ onSalvata }) {
  const [clienti, setClienti] = useState([]);
  const [clienteId, setClienteId] = useState("");
  const [numero, setNumero] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [righe, setRighe] = useState([nuovaRigaVuota()]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase.from("ci_clienti").select("*").order("nome").then(({ data, error }) => {
      if (error) alert(`⚠️ Errore nel caricamento clienti:\n\n${error.message}`);
      else setClienti(data || []);
    });
  }, []);

  function aggiornaRiga(id, campi) {
    setRighe(prev => prev.map(r => (r.id === id ? { ...r, ...campi } : r)));
  }
  function aggiungiRiga() {
    setRighe(prev => [...prev, nuovaRigaVuota()]);
  }
  function rimuoviRiga(id) {
    setRighe(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  }

  function imponibileRiga(r) {
    const q = parseFloat(r.quantita) || 0;
    const p = parseFloat(r.prezzo_unitario) || 0;
    return Math.round(q * p * 100) / 100;
  }
  const imponibileTotale = righe.reduce((s, r) => s + imponibileRiga(r), 0);
  const ivaTotale = righe.reduce((s, r) => s + imponibileRiga(r) * (parseFloat(r.aliquota_iva) || 0) / 100, 0);

  async function salva() {
    if (!clienteId) { alert("Seleziona un cliente."); return; }
    if (!numero.trim()) { alert("Il numero fattura è obbligatorio."); return; }
    if (righe.some(r => !r.descrizione.trim())) { alert("Ogni riga deve avere una descrizione."); return; }

    setSalvando(true);
    try {
      const netto = Math.round(imponibileTotale * 100) / 100;
      const iva = Math.round(ivaTotale * 100) / 100;
      const { data: fattura, error: eFatt } = await supabase.from("ci_fatture").insert([{
        numero: numero.trim(), data, tipo: "ATTIVA", cliente_id: parseInt(clienteId),
        totale_netto: netto, totale_iva: iva, totale_lordo: Math.round((netto + iva) * 100) / 100,
      }]).select().single();
      if (eFatt) throw new Error(eFatt.message);

      for (const r of righe) {
        const rigaImponibile = imponibileRiga(r);
        const { error } = await supabase.from("ci_articoli_fattura").insert([{
          fattura_id: fattura.id, descrizione: r.descrizione, quantita: parseFloat(r.quantita) || 0,
          unita_misura: r.unita_misura || null, prezzo_unitario: parseFloat(r.prezzo_unitario) || 0,
          totale_riga: rigaImponibile, aliquota_iva: parseFloat(r.aliquota_iva) || 0,
          totale_iva: Math.round(rigaImponibile * (parseFloat(r.aliquota_iva) || 0) / 100 * 100) / 100,
          destinazione: r.destinazione || null,
        }]);
        if (error) throw new Error(error.message);
      }

      alert("✓ Fattura di vendita salvata.");
      setClienteId(""); setNumero(""); setData(new Date().toISOString().slice(0, 10)); setRighe([nuovaRigaVuota()]);
      onSalvata?.();
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio:\n\n${err.message}`);
    }
    setSalvando(false);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 16 }}>Nuova Fattura di Vendita</h1>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div>
            <label style={lbl}>Cliente</label>
            <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={input}>
              <option value="">— seleziona —</option>
              {clienti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Numero fattura</label>
            <input value={numero} onChange={e => setNumero(e.target.value)} style={input} />
          </div>
          <div>
            <label style={lbl}>Data</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)} style={input} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {righe.map((r, i) => (
          <div key={r.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>Articolo {i + 1}</span>
              {righe.length > 1 && (
                <button onClick={() => rimuoviRiga(r.id)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>🗑️ Rimuovi</button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
              <div style={{ gridColumn: "span 2" }}>
                <label style={lbl}>Descrizione</label>
                <input value={r.descrizione} onChange={e => aggiornaRiga(r.id, { descrizione: e.target.value })} style={input} />
              </div>
              <div>
                <label style={lbl}>Quantità</label>
                <input type="number" value={r.quantita} onChange={e => aggiornaRiga(r.id, { quantita: e.target.value })} style={input} />
              </div>
              <div>
                <label style={lbl}>U.M. <span style={{ fontWeight: 400, color: C.muted }}>(testo libero)</span></label>
                <input list="unita-misura-suggerite" value={r.unita_misura} onChange={e => aggiornaRiga(r.id, { unita_misura: e.target.value })} style={input} placeholder="Es. Kilogrammi, Millilitri, Sacchi..." />
                <datalist id="unita-misura-suggerite">
                  {["Unità", "Tons", "Quintali", "Kilogrammi", "Litri", "Millilitri", "Centilitri", "Balloni", "Rotoballe", "Rotoli", "Sacchi", "Confezioni"].map(u => <option key={u} value={u} />)}
                </datalist>
              </div>
              <div>
                <label style={lbl}>Prezzo unitario</label>
                <input type="number" value={r.prezzo_unitario} onChange={e => aggiornaRiga(r.id, { prezzo_unitario: e.target.value })} style={input} />
              </div>
              <div>
                <label style={lbl}>Aliquota IVA</label>
                <select value={r.aliquota_iva} onChange={e => aggiornaRiga(r.id, { aliquota_iva: e.target.value })} style={input}>
                  {["0", "4", "5", "10", "22"].map(a => <option key={a} value={a}>{a}%</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Destinazione (specie, opz.)</label>
                <select value={r.destinazione} onChange={e => aggiornaRiga(r.id, { destinazione: e.target.value })} style={input}>
                  <option value="">—</option>
                  {["Bovini", "Suini", "Ovini", "Generali", "Pollame", "Cavalli"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, marginTop: 6, color: C.primary }}>
              Imponibile riga: {formattaEuro(imponibileRiga(r))}
            </div>
          </div>
        ))}
      </div>

      <button onClick={aggiungiRiga} style={{ background: "none", border: `1.5px dashed ${C.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: C.muted, cursor: "pointer", marginBottom: 20 }}>
        + Aggiungi articolo
      </button>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
          <span>Imponibile totale</span><span style={{ fontWeight: 700 }}>{formattaEuro(imponibileTotale)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4, color: C.muted }}>
          <span>IVA</span><span>{formattaEuro(ivaTotale)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 800, color: C.green, borderTop: `1.5px solid ${C.primary}`, paddingTop: 6, marginTop: 6 }}>
          <span>Totale fattura</span><span>{formattaEuro(imponibileTotale + ivaTotale)}</span>
        </div>
      </div>

      <button onClick={salva} disabled={salvando}
        style={{ background: C.green, color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
        {salvando ? "Salvataggio..." : "💾 Salva fattura"}
      </button>
    </div>
  );
}

const lbl = { fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 };
const input = { width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 };
