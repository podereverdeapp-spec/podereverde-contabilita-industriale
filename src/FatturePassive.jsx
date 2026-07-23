import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { C } from "./style";

export default function FatturePassive() {
  const [fatture, setFatture] = useState([]);
  const [righePerFattura, setRighePerFattura] = useState({});
  const [loading, setLoading] = useState(true);
  const [espansa, setEspansa] = useState(null);
  const [cerca, setCerca] = useState("");
  const [filtroAnno, setFiltroAnno] = useState("tutti");
  const [filtroData, setFiltroData] = useState("");

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    const { data, error } = await supabase
      .from("ci_fatture")
      .select("*, ci_fornitori(nome, partita_iva)")
      .eq("tipo", "PASSIVA")
      .order("data", { ascending: false });
    if (error) {
      alert(`⚠️ Errore nel caricamento delle fatture:\n\n${error.message}`);
    } else {
      setFatture(data || []);
    }
    setLoading(false);
  }

  async function espandi(fatturaId) {
    if (espansa === fatturaId) {
      setEspansa(null);
      return;
    }
    setEspansa(fatturaId);
    if (!righePerFattura[fatturaId]) {
      const { data, error } = await supabase
        .from("ci_articoli_fattura")
        .select("*")
        .eq("fattura_id", fatturaId)
        .order("id");
      if (error) {
        alert(`⚠️ Errore nel caricamento delle righe:\n\n${error.message}`);
        return;
      }
      setRighePerFattura(prev => ({ ...prev, [fatturaId]: data || [] }));
    }
  }

  const anniDisponibili = useMemo(() => {
    return [...new Set(fatture.map(f => new Date(f.data).getFullYear()))].sort((a, b) => b - a);
  }, [fatture]);

  const filtrate = useMemo(() => {
    return fatture.filter(f => {
      if (filtroAnno !== "tutti" && new Date(f.data).getFullYear() !== parseInt(filtroAnno)) return false;
      if (filtroData && f.data !== filtroData) return false;
      if (cerca.trim()) {
        const q = cerca.trim().toLowerCase();
        const testo = `${f.ci_fornitori?.nome || ""} ${f.numero} ${f.ci_fornitori?.partita_iva || ""}`.toLowerCase();
        if (!testo.includes(q)) return false;
      }
      return true;
    });
  }, [fatture, filtroAnno, filtroData, cerca]);

  const totale = filtrate.reduce((s, f) => s + (f.totale_lordo || 0), 0);

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Fatture Passive</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        {filtrate.length} fatture — totale {totale.toFixed(2)}€
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder="Cerca per fornitore, numero o P.IVA..."
          value={cerca}
          onChange={e => setCerca(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14 }}
        />
        <input
          type="date"
          value={filtroData}
          onChange={e => setFiltroData(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14 }}
        />
        {filtroData && (
          <button onClick={() => setFiltroData("")} style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 10px", cursor: "pointer", color: C.muted }}>✕</button>
        )}
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
              <div
                onClick={() => espandi(f.id)}
                style={{ display: "flex", justifyContent: "space-between", padding: 14, cursor: "pointer", flexWrap: "wrap", gap: 8 }}
              >
                <div>
                  <strong>{f.ci_fornitori?.nome || "—"}</strong>
                  <div style={{ fontSize: 12, color: C.muted }}>
                    Fatt. {f.numero} del {f.data} {f.ci_fornitori?.partita_iva && `· P.IVA ${f.ci_fornitori.partita_iva}`}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: C.primary }}>{f.totale_lordo?.toFixed(2)}€</div>
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

function RicomposizioneFattura({ fattura, righe }) {
  const f = fattura;
  const mostraUM = righe.some(r => r.unita_misura);
  const mostraQuantita = righe.some(r => r.quantita != null);
  const mostraPrezzoUnit = righe.some(r => r.prezzo_unitario != null);

  const imponibileTotale = righe.reduce((s, r) => s + (r.totale_riga || 0), 0);
  const ivaTotale = righe.reduce((s, r) => s + (r.totale_iva || 0), 0);
  const totaleComplessivo = imponibileTotale + ivaTotale;

  // Raggruppo l'IVA per aliquota, per il riepilogo (una fattura può avere aliquote diverse su righe diverse)
  const ivaPerAliquota = {};
  righe.forEach(r => {
    const aliq = r.aliquota_iva != null ? r.aliquota_iva : 0;
    if (!ivaPerAliquota[aliq]) ivaPerAliquota[aliq] = { imponibile: 0, iva: 0 };
    ivaPerAliquota[aliq].imponibile += r.totale_riga || 0;
    ivaPerAliquota[aliq].iva += r.totale_iva || 0;
  });

  return (
    <div style={{ background: "#FAF8F4", borderRadius: 10, padding: 16 }}>
      {/* Intestazione */}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: `2px solid ${C.primary}` }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{f.ci_fornitori?.nome || "—"}</div>
          {f.ci_fornitori?.partita_iva && <div style={{ fontSize: 12, color: C.muted }}>P.IVA {f.ci_fornitori.partita_iva}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Fattura n. {f.numero}</div>
          <div style={{ fontSize: 12, color: C.muted }}>del {f.data}</div>
        </div>
      </div>

      {/* Righe */}
      <table style={{ width: "100%", fontSize: 13, marginBottom: 12 }}>
        <thead>
          <tr style={{ color: C.muted, textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
            <th style={{ padding: "4px 8px" }}>Descrizione</th>
            {mostraUM && <th style={{ padding: "4px 8px", textAlign: "center" }}>U.M.</th>}
            {mostraQuantita && <th style={{ padding: "4px 8px", textAlign: "right" }}>Quantità</th>}
            {mostraPrezzoUnit && <th style={{ padding: "4px 8px", textAlign: "right" }}>Prezzo unitario</th>}
            <th style={{ padding: "4px 8px", textAlign: "right" }}>Imponibile</th>
          </tr>
        </thead>
        <tbody>
          {righe.map(r => (
            <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "6px 8px" }}>{r.descrizione}</td>
              {mostraUM && <td style={{ padding: "6px 8px", textAlign: "center" }}>{r.unita_misura || "—"}</td>}
              {mostraQuantita && <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.quantita != null ? r.quantita : "—"}</td>}
              {mostraPrezzoUnit && <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.prezzo_unitario != null ? `${r.prezzo_unitario.toFixed(2)}€` : "—"}</td>}
              <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{r.totale_riga?.toFixed(2)}€</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totali */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ minWidth: 260 }}>
          <RigaTotale label="Imponibile totale" valore={imponibileTotale} />
          {Object.entries(ivaPerAliquota).map(([aliq, v]) => (
            <RigaTotale key={aliq} label={`IVA ${aliq}%`} valore={v.iva} muted />
          ))}
          <div style={{ borderTop: `1.5px solid ${C.primary}`, marginTop: 6, paddingTop: 6 }}>
            <RigaTotale label="Totale fattura" valore={totaleComplessivo} bold />
          </div>
        </div>
      </div>
    </div>
  );
}

function RigaTotale({ label, valore, bold, muted }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px", fontSize: bold ? 15 : 13 }}>
      <span style={{ color: muted ? C.muted : C.text, fontWeight: bold ? 800 : 600 }}>{label}</span>
      <span style={{ color: bold ? C.primary : muted ? C.muted : C.text, fontWeight: bold ? 800 : 600 }}>{valore.toFixed(2)}€</span>
    </div>
  );
}
