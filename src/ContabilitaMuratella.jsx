import { useState, useEffect, Fragment } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import CaricoMassivoMuratella from "./CaricoMassivoMuratella";

const COLORE_MURATELLA = "#B03A2E"; // rosso mattone, deliberatamente diverso dal verde di Podere Verde

export default function ContabilitaMuratella() {
  const [tab, setTab] = useState("riepilogo");
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);
  const [righeArea, setRigheArea] = useState([]);
  const [espansi, setEspansi] = useState(new Set());
  const [totale, setTotale] = useState(0);

  useEffect(() => { if (tab === "riepilogo") carica(); }, [anno, tab]);

  async function carica() {
    setCaricando(true);
    setErrore(null);
    try {
      const { data: fattureAnno, error: eF } = await supabase.from("muratella_fatture").select("id,numero,data,fornitore_nome")
        .gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`);
      if (eF) throw new Error(eF.message);
      const mappaFatture = new Map((fattureAnno || []).map(f => [f.id, f]));
      const idFatture = (fattureAnno || []).map(f => f.id);
      let articoli = [];
      if (idFatture.length > 0) {
        const { data, error: eA } = await supabase.from("muratella_articoli_fattura")
          .select("descrizione,area,centro_costo,tipo_costo,totale_riga,fattura_id").in("fattura_id", idFatture);
        if (eA) throw new Error(eA.message);
        articoli = data || [];
      }

      const perArea = new Map();
      articoli.forEach(a => {
        const area = a.area || "(senza area)";
        if (!perArea.has(area)) perArea.set(area, { area, totale: 0, perCentro: new Map() });
        const rigaArea = perArea.get(area);
        rigaArea.totale += a.totale_riga || 0;
        const centro = a.centro_costo || "(senza centro di costo)";
        if (!rigaArea.perCentro.has(centro)) rigaArea.perCentro.set(centro, { totale: 0, voci: [] });
        const rigaCentro = rigaArea.perCentro.get(centro);
        rigaCentro.totale += a.totale_riga || 0;
        const fattura = mappaFatture.get(a.fattura_id);
        rigaCentro.voci.push({
          descrizione: a.descrizione, importo: a.totale_riga || 0,
          fatturaNumero: fattura?.numero, fatturaData: fattura?.data, fornitore: fattura?.fornitore_nome,
        });
      });

      const righe = [...perArea.values()].sort((a, b) => b.totale - a.totale);
      setRigheArea(righe);
      setTotale(righe.reduce((s, r) => s + r.totale, 0));
    } catch (err) {
      setErrore(err.message);
    }
    setCaricando(false);
  }

  function toggleEspanso(area) {
    setEspansi(prev => { const n = new Set(prev); n.has(area) ? n.delete(area) : n.add(area); return n; });
  }

  function scarica() {
    const righe = [];
    righeArea.forEach(r => {
      righe.push({ "Area": r.area, "Centro di Costo": "— TOTALE AREA —", "Descrizione": "", "Fornitore": "", "Fattura": "", "Importo (€)": numeroExcel(r.totale) });
      [...r.perCentro.entries()].forEach(([centro, datiCentro]) => {
        righe.push({ "Area": r.area, "Centro di Costo": centro, "Descrizione": "— totale centro —", "Fornitore": "", "Fattura": "", "Importo (€)": numeroExcel(datiCentro.totale) });
        datiCentro.voci.forEach(v => {
          righe.push({
            "Area": r.area, "Centro di Costo": centro, "Descrizione": v.descrizione || "",
            "Fornitore": v.fornitore || "", "Fattura": v.fatturaNumero ? `${v.fatturaNumero} del ${v.fatturaData || ""}` : "",
            "Importo (€)": numeroExcel(v.importo),
          });
        });
      });
    });
    esportaExcel(`MURATELLA_riepilogo_costi_${anno}`, [{ nome: "Muratella - Riepilogo Costi", righe }]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ background: COLORE_MURATELLA, color: "#fff", borderRadius: 12, padding: "14px 20px", marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>🏛️ SOCIETÀ AGRICOLA MURATELLA S.R.L.</div>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
          Contabilità separata — costi sostenuti dalla Muratella, non da Podere Verde. Nessun dato qui è condiviso con il resto del sistema.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab("riepilogo")}
          style={{ background: tab === "riepilogo" ? COLORE_MURATELLA : C.card, color: tab === "riepilogo" ? "#fff" : C.text,
            border: `1.5px solid ${COLORE_MURATELLA}`, borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          📊 Riepilogo Costi
        </button>
        <button onClick={() => setTab("carico")}
          style={{ background: tab === "carico" ? COLORE_MURATELLA : C.card, color: tab === "carico" ? "#fff" : C.text,
            border: `1.5px solid ${COLORE_MURATELLA}`, borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          📥 Carico Massivo
        </button>
      </div>

      {tab === "carico" && <CaricoMassivoMuratella coloreMuratella={COLORE_MURATELLA} />}

      {tab === "riepilogo" && (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 700 }}>Anno:
              <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value) || new Date().getFullYear())}
                style={{ marginLeft: 8, width: 90, padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
            </label>
          </div>

          {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}
          {caricando ? <p style={{ color: C.muted }}>Caricamento...</p> : (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", background: COLORE_MURATELLA, color: "#fff", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700 }}>MURATELLA — Costi {anno}</span>
                <span style={{ fontWeight: 700 }}>{formattaEuro(totale)}</span>
              </div>
              {righeArea.length === 0 ? (
                <p style={{ padding: 16, color: C.muted }}>Nessun costo Muratella registrato per il {anno}.</p>
              ) : (
                <>
                  <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                    <thead style={{ background: C.bg }}>
                      <tr><th style={th}></th><th style={th}>Area</th><th style={{ ...th, textAlign: "right" }}>Importo</th></tr>
                    </thead>
                    <tbody>
                      {righeArea.map(r => {
                        const aperta = espansi.has(r.area);
                        return (
                          <Fragment key={r.area}>
                            <tr onClick={() => toggleEspanso(r.area)} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}>
                              <td style={{ ...td, width: 24 }}>{aperta ? "▼" : "▶"}</td>
                              <td style={{ ...td, fontWeight: 700 }}>{r.area}</td>
                              <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.totale)}</td>
                            </tr>
                            {aperta && [...r.perCentro.entries()].map(([centro, datiCentro]) => {
                              const chiaveCentro = `${r.area}||${centro}`;
                              const centroAperto = espansi.has(chiaveCentro);
                              return (
                                <Fragment key={centro}>
                                  <tr onClick={() => toggleEspanso(chiaveCentro)} style={{ background: C.bg, fontSize: 12, cursor: "pointer" }}>
                                    <td style={{ ...td, paddingLeft: 12 }}>{centroAperto ? "▼" : "▶"}</td>
                                    <td style={{ ...td, paddingLeft: 12, color: C.muted }}>{centro}</td>
                                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(datiCentro.totale)}</td>
                                  </tr>
                                  {centroAperto && datiCentro.voci.map((v, i) => (
                                    <tr key={i} style={{ fontSize: 11, borderTop: i === 0 ? `1px dashed ${C.border}` : "none" }}>
                                      <td style={td}></td>
                                      <td style={{ ...td, paddingLeft: 36, color: C.text }}>
                                        {v.descrizione || "(senza descrizione)"}
                                        <div style={{ color: C.muted, fontSize: 10, marginTop: 1 }}>
                                          {v.fornitore || "—"} · fatt. {v.fatturaNumero || "—"} del {v.fatturaData || "—"}
                                        </div>
                                      </td>
                                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(v.importo)}</td>
                                    </tr>
                                  ))}
                                </Fragment>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                      <tr style={{ borderTop: `2px solid ${COLORE_MURATELLA}`, fontWeight: 700, background: C.bg }}>
                        <td style={td}></td><td style={td}>Totale</td>
                        <td style={{ ...td, textAlign: "right" }}>{formattaEuro(totale)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ padding: 14 }}>
                    <button onClick={scarica}
                      style={{ background: COLORE_MURATELLA, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      📥 Scarica Excel (MURATELLA)
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11 };
const td = { padding: "8px 10px" };
