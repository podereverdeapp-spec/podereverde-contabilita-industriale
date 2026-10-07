// Registro delle Modifiche (versione 232): chi ha inserito, cambiato o cancellato cosa,
// nell'app e nella Contabilità, dal 07/10/2026. Sola lettura.
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { esportaExcel } from "./esportaExcel";

const campo = { padding: "7px 9px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 };
const quandoIt = t => new Date(t).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const valori = o => o ? Object.entries(o).map(([k, v]) => `${k}: ${v === null ? "vuoto" : typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ") : "";

export default function RegistroModifiche() {
  const [righe, setRighe] = useState([]);
  const [filtri, setFiltri] = useState({ tabella: "", persona: "", riga: "", dal: "" });
  const [errore, setErrore] = useState("");
  const [caricando, setCaricando] = useState(false);

  async function carica() {
    setCaricando(true); setErrore("");
    let q = supabase.from("registro_modifiche_contabilita").select("*").order("quando", { ascending: false }).limit(1000);
    if (filtri.tabella) q = q.eq("tabella", filtri.tabella);
    if (filtri.riga) q = q.eq("riga_id", filtri.riga.trim());
    if (filtri.dal) q = q.gte("quando", `${filtri.dal}T00:00:00`);
    const { data, error } = await q;
    if (error) setErrore(error.message); else setRighe(data || []);
    setCaricando(false);
  }
  useEffect(() => { carica(); }, [filtri.tabella, filtri.dal]);

  const persona = r => r.utente_nome || r.provenienza;
  const persone = [...new Set(righe.map(persona))].sort();
  const tabelle = [...new Set(righe.map(r => r.tabella))].sort();
  const elenco = righe.filter(r => !filtri.persona || persona(r) === filtri.persona);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
      <h2 style={{ margin: 0, color: C.primary }}>🕓 Registro delle Modifiche</h2>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Ogni inserimento, modifica e cancellazione nelle tabelle sorvegliate dell'app e della Contabilità, dal 07/10/2026. Le ultime 1.000 righe secondo i filtri.</div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
        <select value={filtri.tabella} onChange={e => setFiltri({ ...filtri, tabella: e.target.value })} style={campo}><option value="">Tutte le tabelle</option>{tabelle.map(t => <option key={t}>{t}</option>)}</select>
        <select value={filtri.persona} onChange={e => setFiltri({ ...filtri, persona: e.target.value })} style={campo}><option value="">Tutte le persone</option>{persone.map(p => <option key={p}>{p}</option>)}</select>
        <input placeholder="Numero del record" value={filtri.riga} onChange={e => setFiltri({ ...filtri, riga: e.target.value })} onKeyDown={e => e.key === "Enter" && carica()} style={{ ...campo, width: 150 }} />
        Dal <input type="date" value={filtri.dal} onChange={e => setFiltri({ ...filtri, dal: e.target.value })} style={campo} />
        <button onClick={carica} style={{ ...campo, background: C.primary, color: "#fff", fontWeight: 700, cursor: "pointer" }}>{caricando ? "…" : "Cerca"}</button>
        <button onClick={() => esportaExcel("Registro_modifiche", [{ nome: "Modifiche", righe: elenco.map(r => ({ "Quando": quandoIt(r.quando), "Persona": r.utente_nome || "", "Provenienza": r.provenienza, "Tabella": r.tabella, "Record": r.riga_id, "Azione": r.azione, "Prima": valori(r.prima), "Dopo": valori(r.dopo) })) }])}
          style={{ ...campo, cursor: "pointer" }}>Esporta Excel</button>
      </div>
      {errore && <div style={{ color: C.red, marginTop: 10 }}>⚠️ {errore}</div>}
      <table style={{ fontSize: 12.5, background: C.card, marginTop: 14 }}>
        <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Quando", "Persona", "Tabella", "Record", "Azione", "Prima", "Dopo"].map(h => <th key={h} style={{ padding: 7, textAlign: "left", background: C.primary, color: "#fff" }}>{h}</th>)}</tr></thead>
        <tbody>{elenco.map((r, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, verticalAlign: "top", background: r.azione === "ERRORE DEL REGISTRO" ? "#FDECEA" : undefined }}>
            <td style={{ padding: 7, whiteSpace: "nowrap" }}>{quandoIt(r.quando)}</td>
            <td style={{ padding: 7 }}>{r.utente_nome || <span style={{ color: C.muted }}>{r.provenienza}</span>}</td>
            <td style={{ padding: 7 }}>{r.tabella}</td><td style={{ padding: 7 }}>{r.riga_id}</td><td style={{ padding: 7 }}>{r.azione}</td>
            <td style={{ padding: 7, maxWidth: 300, wordBreak: "break-word" }}>{valori(r.prima)}</td>
            <td style={{ padding: 7, maxWidth: 300, wordBreak: "break-word" }}>{valori(r.dopo)}</td>
          </tr>))}
          {elenco.length === 0 && <tr><td colSpan={7} style={{ padding: 12, color: C.muted }}>Nessuna modifica con questi filtri.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
