import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { RicomposizioneFattura } from "./FatturePassive";
import { numerizzaCampi, formattaEuro } from "./parsingUtils";

export default function FattureAttive() {
  const [fatture, setFatture] = useState([]);
  const [righePerFattura, setRighePerFattura] = useState({});
  const [loading, setLoading] = useState(true);
  const [espansa, setEspansa] = useState(null);
  const [cerca, setCerca] = useState("");
  const [filtroAnno, setFiltroAnno] = useState("tutti");

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    const { data, error } = await supabase
      .from("ci_fatture")
      .select("*, ci_clienti(nome, partita_iva)")
      .eq("tipo", "ATTIVA")
      .order("data", { ascending: false });
    if (error) alert(`⚠️ Errore nel caricamento delle fatture:\n\n${error.message}`);
    else setFatture(numerizzaCampi(data || [], ["totale_netto", "totale_iva", "totale_lordo"]));
    setLoading(false);
  }

  async function espandi(fatturaId) {
    if (espansa === fatturaId) { setEspansa(null); return; }
    setEspansa(fatturaId);
    if (!righePerFattura[fatturaId]) {
      const { data, error } = await supabase.from("ci_articoli_fattura").select("*").eq("fattura_id", fatturaId).order("id");
      if (error) { alert(`⚠️ Errore nel caricamento delle righe:\n\n${error.message}`); return; }
      setRighePerFattura(prev => ({ ...prev, [fatturaId]: numerizzaCampi(data || [], ["quantita", "prezzo_unitario", "totale_riga", "aliquota_iva", "totale_iva"]) }));
    }
  }

  const anniDisponibili = useMemo(() => [...new Set(fatture.map(f => new Date(f.data).getFullYear()))].sort((a, b) => b - a), [fatture]);

  const filtrate = useMemo(() => {
    return fatture.filter(f => {
      if (filtroAnno !== "tutti" && new Date(f.data).getFullYear() !== parseInt(filtroAnno)) return false;
      if (cerca.trim()) {
        const q = cerca.trim().toLowerCase();
        const testo = `${f.ci_clienti?.nome || ""} ${f.numero} ${f.ci_clienti?.partita_iva || ""}`.toLowerCase();
        if (!testo.includes(q)) return false;
      }
      return true;
    });
  }, [fatture, filtroAnno, cerca]);

  const totale = filtrate.reduce((s, f) => s + (f.totale_lordo || 0), 0);

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Fatture Attive</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>{filtrate.length} fatture — totale {formattaEuro(totale)}</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder="Cerca per cliente, numero o P.IVA..."
          value={cerca}
          onChange={e => setCerca(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14 }}
        />
        <select value={filtroAnno} onChange={e => setFiltroAnno(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14 }}>
          <option value="tutti">Tutti gli anni</option>
          {anniDisponibili.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {loading ? (
        <p style={{ color: C.muted }}>Caricamento...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtrate.map(f => (
            <div key={f.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <div onClick={() => espandi(f.id)} style={{ display: "flex", justifyContent: "space-between", padding: 14, cursor: "pointer", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <strong>{f.ci_clienti?.nome || "—"}</strong>
                  <div style={{ fontSize: 12, color: C.muted }}>
                    Fatt. {f.numero} del {f.data} {f.ci_clienti?.partita_iva && `· P.IVA ${f.ci_clienti.partita_iva}`}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: C.green }}>{formattaEuro(f.totale_lordo)}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{espansa === f.id ? "▲ nascondi righe" : "▼ vedi righe"}</div>
                </div>
              </div>
              {espansa === f.id && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: 14 }}>
                  {!righePerFattura[f.id] ? (
                    <p style={{ color: C.muted, fontSize: 13 }}>Caricamento righe...</p>
                  ) : righePerFattura[f.id].length === 0 ? (
                    <p style={{ color: C.muted, fontSize: 13 }}>Nessuna riga trovata.</p>
                  ) : (
                    <RicomposizioneFattura fattura={f} righe={righePerFattura[f.id]} />
                  )}
                </div>
              )}
            </div>
          ))}
          {filtrate.length === 0 && <p style={{ color: C.muted }}>Nessuna fattura trovata.</p>}
        </div>
      )}
    </div>
  );
}
