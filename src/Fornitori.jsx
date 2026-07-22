import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { C } from "./style";

export default function Fornitori() {
  const [fornitori, setFornitori] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroGruppo, setFiltroGruppo] = useState("tutti");
  const [cerca, setCerca] = useState("");

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    const { data, error } = await supabase
      .from("ci_fornitori")
      .select("*")
      .order("nome");
    if (error) {
      alert(`⚠️ Errore nel caricamento fornitori:\n\n${error.message}`);
    } else {
      setFornitori(data || []);
    }
    setLoading(false);
  }

  const filtrati = useMemo(() => {
    return fornitori.filter(f => {
      if (filtroGruppo !== "tutti" && f.gruppo_classificazione !== filtroGruppo) return false;
      if (cerca.trim() && !f.nome.toLowerCase().includes(cerca.trim().toLowerCase())) return false;
      return true;
    });
  }, [fornitori, filtroGruppo, cerca]);

  const conteggi = useMemo(() => {
    const c = { FCV: 0, FCF: 0, FRO: 0, senza: 0 };
    fornitori.forEach(f => {
      if (f.gruppo_classificazione) c[f.gruppo_classificazione]++;
      else c.senza++;
    });
    return c;
  }, [fornitori]);

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Fornitori</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        {fornitori.length} fornitori — {conteggi.FCV} classificazione automatica per parola chiave (FCV),{" "}
        {conteggi.FCF} classificazione fissa (FCF), {conteggi.FRO} sempre manuale (FRO)
        {conteggi.senza > 0 && `, ${conteggi.senza} senza gruppo assegnato`}
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          placeholder="Cerca per nome..."
          value={cerca}
          onChange={e => setCerca(e.target.value)}
          style={{
            flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8,
            border: `1.5px solid ${C.border}`, fontSize: 14,
          }}
        />
        <select
          value={filtroGruppo}
          onChange={e => setFiltroGruppo(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14 }}
        >
          <option value="tutti">Tutti i gruppi</option>
          <option value="FCV">FCV — parola chiave</option>
          <option value="FCF">FCF — fissa</option>
          <option value="FRO">FRO — sempre manuale</option>
        </select>
      </div>

      {loading ? (
        <p style={{ color: C.muted }}>Caricamento...</p>
      ) : (
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <table>
            <thead>
              <tr style={{ background: C.primary, color: "#fff" }}>
                <th style={th}>Nome</th>
                <th style={th}>P.IVA</th>
                <th style={th}>Gruppo</th>
                <th style={th}>Fatture storiche</th>
              </tr>
            </thead>
            <tbody>
              {filtrati.map((f, i) => (
                <tr key={f.id} style={{ background: i % 2 ? "#FAF8F4" : "#fff" }}>
                  <td style={td}>{f.nome}</td>
                  <td style={{ ...td, color: f.partita_iva ? C.text : C.red, fontStyle: f.partita_iva ? "normal" : "italic" }}>
                    {f.partita_iva || "mancante — abbinamento per nome"}
                  </td>
                  <td style={td}>
                    <Badge gruppo={f.gruppo_classificazione} />
                  </td>
                  <td style={td}>{f.n_fatture_storiche || 0}</td>
                </tr>
              ))}
              {filtrati.length === 0 && (
                <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: C.muted, padding: 30 }}>
                  Nessun fornitore trovato
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Badge({ gruppo }) {
  const colori = { FCV: C.green, FCF: C.blue, FRO: C.accent };
  if (!gruppo) return <span style={{ color: C.muted, fontSize: 12 }}>—</span>;
  return (
    <span style={{
      background: (colori[gruppo] || C.muted) + "22", color: colori[gruppo] || C.muted,
      padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700,
    }}>
      {gruppo}
    </span>
  );
}

const th = { padding: "10px 14px", textAlign: "left", fontSize: 13, fontWeight: 700 };
const td = { padding: "10px 14px", fontSize: 14, borderTop: `1px solid ${C.border}` };
