import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi } from "./parsingUtils";

export default function ReportAcquistoAnimali() {
  const [righe, setRighe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStato, setFiltroStato] = useState("DA_ELABORARE");

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    const { data, error } = await supabase
      .from("ci_report_acquisto_animali")
      .select("*, ci_fornitori(nome)")
      .order("data_fattura", { ascending: false });
    if (error) {
      alert(`⚠️ Errore nel caricamento:\n\n${error.message}`);
    } else {
      setRighe(numerizzaCampi(data || [], ["importo", "quantita", "prezzo_unitario"]));
    }
    setLoading(false);
  }

  async function segnaInserito(id) {
    const { error } = await supabase
      .from("ci_report_acquisto_animali")
      .update({ stato: "INSERITO_PODEREVERDE", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      alert(`⚠️ Errore nell'aggiornamento:\n\n${error.message}`);
      return;
    }
    carica();
  }

  async function annullaInserito(id) {
    const { error } = await supabase
      .from("ci_report_acquisto_animali")
      .update({ stato: "DA_ELABORARE", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      alert(`⚠️ Errore nell'aggiornamento:\n\n${error.message}`);
      return;
    }
    carica();
  }

  const filtrate = righe.filter(r => filtroStato === "tutti" || r.stato === filtroStato);
  const daElaborare = righe.filter(r => r.stato === "DA_ELABORARE");
  const totaleDaElaborare = daElaborare.reduce((s, r) => s + (r.importo || 0), 0);

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Report Acquisto Animali</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Righe fattura classificate come acquisto animali (o come trasporto in ingresso allevamento) — da tradurre
        manualmente in un animale o lotto su podereverdeapp.it.
      </p>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ background: C.red + "15", borderRadius: 10, padding: "10px 16px" }}>
          <div style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>Da elaborare</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.red }}>
            {daElaborare.length} righe — {totaleDaElaborare.toFixed(2)}€
          </div>
        </div>
      </div>

      <select value={filtroStato} onChange={e => setFiltroStato(e.target.value)}
        style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, marginBottom: 16 }}>
        <option value="DA_ELABORARE">Da elaborare</option>
        <option value="INSERITO_PODEREVERDE">Già inserite</option>
        <option value="tutti">Tutte</option>
      </select>

      {loading ? (
        <p style={{ color: C.muted }}>Caricamento...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtrate.map(r => (
            <div key={r.id} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14,
              borderLeft: `4px solid ${r.stato === "DA_ELABORARE" ? C.red : C.green}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <strong>{r.ci_fornitori?.nome || "—"}</strong>
                  {" · "}{r.fonte === "TRASPORTO_INGRESSO" ? "Trasporto ingresso" : "Acquisto diretto"}
                  <div style={{ fontSize: 12, color: C.muted }}>
                    Fatt. {r.numero_fattura || "—"} del {r.data_fattura}
                    {r.specie && ` · ${r.specie}`}{r.razza && ` (${r.razza})`}
                    {r.destinazione_acquisto && ` · ${r.destinazione_acquisto}`}
                    {r.bdn && ` · BDN ${r.bdn}`}{r.nr_lotto && ` · Lotto ${r.nr_lotto}`}
                  </div>
                  {(r.quantita || r.prezzo_unitario) && (
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {r.quantita && `${r.quantita} ${r.unita_misura || ""}`}
                      {r.quantita && r.prezzo_unitario && " · "}
                      {r.prezzo_unitario && `${r.prezzo_unitario.toFixed(2)}€/${r.unita_misura || "unità"}`}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.primary }}>{r.importo?.toFixed(2)}€</div>
                  {r.stato === "DA_ELABORARE" ? (
                    <button onClick={() => segnaInserito(r.id)} style={btn(C.green)}>
                      ✓ Segna inserito
                    </button>
                  ) : (
                    <button onClick={() => annullaInserito(r.id)} style={btn(C.muted)}>
                      ↩️ Riporta a "da elaborare"
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filtrate.length === 0 && <p style={{ color: C.muted }}>Nessuna riga in questo stato.</p>}
        </div>
      )}
    </div>
  );
}

function btn(color) {
  return {
    marginTop: 6, background: color + "20", color, border: "none", borderRadius: 8,
    padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
  };
}
