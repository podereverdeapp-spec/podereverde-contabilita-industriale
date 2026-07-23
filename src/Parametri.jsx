import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";

export default function Parametri() {
  const [parametri, setParametri] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modifiche, setModifiche] = useState({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    const { data, error } = await supabase.from("ci_parametri").select("*").order("chiave");
    if (error) alert(`⚠️ Errore nel caricamento parametri:\n\n${error.message}`);
    else setParametri(data || []);
    setLoading(false);
  }

  function aggiorna(chiave, valore) {
    setModifiche(prev => ({ ...prev, [chiave]: valore }));
  }

  async function salvaTutto() {
    const daSalvare = Object.entries(modifiche);
    if (daSalvare.length === 0) return;
    setSalvando(true);
    try {
      for (const [chiave, valore] of daSalvare) {
        const { error } = await supabase.from("ci_parametri").update({ valore, updated_at: new Date().toISOString() }).eq("chiave", chiave);
        if (error) throw new Error(`Errore su "${chiave}": ${error.message}`);
      }
      setModifiche({});
      alert("✓ Parametri salvati.");
      carica();
    } catch (err) {
      alert(`⚠️ ${err.message}`);
    }
    setSalvando(false);
  }

  const gruppi = {
    "Consolidamento riproduttrici/riproduttori": parametri.filter(p => p.chiave.startsWith("soglia_")),
    "Vita produttiva attesa (si affina da sola nel tempo)": parametri.filter(p => p.chiave.includes("vita_produttiva")),
    "Altro": parametri.filter(p => !p.chiave.startsWith("soglia_") && !p.chiave.includes("vita_produttiva")),
  };

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Parametri</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Soglie e regole di business configurabili — usate nel calcolo dei costi per animale e nella ripartizione sui figli.
      </p>

      {loading ? <p style={{ color: C.muted }}>Caricamento...</p> : (
        <>
          {Object.entries(gruppi).map(([titolo, righe]) => righe.length > 0 && (
            <div key={titolo} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 12 }}>{titolo.toUpperCase()}</div>
              {righe.map(p => (
                <div key={p.chiave} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: `1px solid ${C.border}` }}>
                  <div style={{ flex: 1, marginRight: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.descrizione}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{p.chiave}</div>
                  </div>
                  <input
                    type="number"
                    value={modifiche[p.chiave] !== undefined ? modifiche[p.chiave] : p.valore}
                    onChange={e => aggiorna(p.chiave, e.target.value)}
                    style={{ width: 80, padding: "6px 10px", borderRadius: 6, border: `1.5px solid ${modifiche[p.chiave] !== undefined ? C.primary : C.border}`, fontSize: 14, textAlign: "center" }}
                  />
                </div>
              ))}
            </div>
          ))}

          {Object.keys(modifiche).length > 0 && (
            <button onClick={salvaTutto} disabled={salvando}
              style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              {salvando ? "Salvataggio..." : `Salva ${Object.keys(modifiche).length} modifiche`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
