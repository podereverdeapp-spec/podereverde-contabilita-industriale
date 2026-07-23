import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { C } from "./style";

export default function Clienti() {
  const [clienti, setClienti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cerca, setCerca] = useState("");
  const [nuovo, setNuovo] = useState(null); // {nome, partita_iva, ...} in creazione
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    const { data, error } = await supabase.from("ci_clienti").select("*").order("nome");
    if (error) alert(`⚠️ Errore nel caricamento clienti:\n\n${error.message}`);
    else setClienti(data || []);
    setLoading(false);
  }

  async function salvaNuovo() {
    if (!nuovo.nome?.trim()) { alert("Il nome è obbligatorio."); return; }
    setSalvando(true);
    const { error } = await supabase.from("ci_clienti").insert([{
      nome: nuovo.nome.trim(), partita_iva: nuovo.partita_iva || null,
      citta: nuovo.citta || null, telefono: nuovo.telefono || null, email: nuovo.email || null,
    }]);
    setSalvando(false);
    if (error) { alert(`⚠️ Errore nel salvataggio:\n\n${error.message}`); return; }
    setNuovo(null);
    carica();
  }

  const filtrati = useMemo(() => {
    if (!cerca.trim()) return clienti;
    const q = cerca.trim().toLowerCase();
    return clienti.filter(c => `${c.nome} ${c.partita_iva || ""}`.toLowerCase().includes(q));
  }, [clienti, cerca]);

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, margin: 0 }}>Clienti</h1>
        {!nuovo && (
          <button onClick={() => setNuovo({ nome: "", partita_iva: "", citta: "", telefono: "", email: "" })}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            + Nuovo Cliente
          </button>
        )}
      </div>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 20 }}>{clienti.length} clienti</p>

      {nuovo && (
        <div style={{ background: C.card, border: `1.5px solid ${C.primary}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
            <Campo label="Nome *" value={nuovo.nome} onChange={v => setNuovo({ ...nuovo, nome: v })} />
            <Campo label="P.IVA" value={nuovo.partita_iva} onChange={v => setNuovo({ ...nuovo, partita_iva: v })} />
            <Campo label="Città" value={nuovo.citta} onChange={v => setNuovo({ ...nuovo, citta: v })} />
            <Campo label="Telefono" value={nuovo.telefono} onChange={v => setNuovo({ ...nuovo, telefono: v })} />
            <Campo label="Email" value={nuovo.email} onChange={v => setNuovo({ ...nuovo, email: v })} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={salvaNuovo} disabled={salvando}
              style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {salvando ? "Salvataggio..." : "Salva"}
            </button>
            <button onClick={() => setNuovo(null)}
              style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: C.muted, cursor: "pointer" }}>
              Annulla
            </button>
          </div>
        </div>
      )}

      <input
        placeholder="Cerca per nome o P.IVA..."
        value={cerca}
        onChange={e => setCerca(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, marginBottom: 16 }}
      />

      {loading ? (
        <p style={{ color: C.muted }}>Caricamento...</p>
      ) : (
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <table style={{ width: "100%" }}>
            <thead>
              <tr style={{ background: C.primary, color: "#fff" }}>
                <th style={th}>Nome</th>
                <th style={th}>P.IVA</th>
                <th style={th}>Città</th>
                <th style={th}>Contatti</th>
              </tr>
            </thead>
            <tbody>
              {filtrati.map((c, i) => (
                <tr key={c.id} style={{ background: i % 2 ? "#FAF8F4" : "#fff" }}>
                  <td style={td}>{c.nome}</td>
                  <td style={td}>{c.partita_iva || "—"}</td>
                  <td style={td}>{c.citta || "—"}</td>
                  <td style={td}>{[c.telefono, c.email].filter(Boolean).join(" · ") || "—"}</td>
                </tr>
              ))}
              {filtrati.length === 0 && (
                <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: C.muted, padding: 30 }}>Nessun cliente trovato</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Campo({ label, value, onChange }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>{label}</label>
      <input value={value || ""} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
    </div>
  );
}

const th = { padding: "10px 14px", textAlign: "left", fontSize: 13, fontWeight: 700 };
const td = { padding: "10px 14px", fontSize: 14, borderTop: `1px solid ${C.border}` };
