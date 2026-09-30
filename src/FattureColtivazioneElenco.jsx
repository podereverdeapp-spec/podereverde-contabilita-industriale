import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { formattaEuro, formattaNumero, round2 } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import {
  caricaRegistroFattureColtivazione, raggruppaPerFattura, campagneDisponibili, anniDisponibili,
  ordinaCentri, formattaDataItaliana, SOCIETA,
} from "./calcoloFattureColtivazione";

// Coltivazioni → Fatture Coltivazione → Elenco Fatture
// Sola lettura: legge il registro v_fatture_coltivazione (Podere Verde e Muratella S.r.l.).
const COLORE_MURATELLA = "#B03A2E"; // lo stesso della sezione Muratella
const SFONDO_MURATELLA = "#FBEDEB";

function Etichetta({ societa }) {
  const muratella = societa !== "Podere Verde";
  return (
    <span style={{
      display: "inline-block", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
      background: muratella ? SFONDO_MURATELLA : "#E7EFE8", color: muratella ? COLORE_MURATELLA : C.primary,
    }}>{muratella ? "MURATELLA S.r.l." : "PODERE VERDE"}</span>
  );
}

const stileSelect = { height: 36, padding: "0 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, background: "#fff" };
const stileEtichetta = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: C.muted, fontWeight: 700 };

export default function FattureColtivazioneElenco() {
  const [righe, setRighe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [periodo, setPeriodo] = useState("campagna"); // "campagna" | "anno"
  const [campagna, setCampagna] = useState("");
  const [anno, setAnno] = useState("");
  const [societa, setSocieta] = useState("Tutte");
  const [centro, setCentro] = useState("Tutti");
  const [fornitore, setFornitore] = useState("Tutti");
  const [cerca, setCerca] = useState("");
  const [aperte, setAperte] = useState(() => new Set());

  useEffect(() => {
    (async () => {
      try {
        const dati = await caricaRegistroFattureColtivazione();
        setRighe(dati);
        const c = campagneDisponibili(dati); const a = anniDisponibili(dati);
        // Si parte dall'ultima campagna conclusa o in corso, non da quella appena iniziata se è vuota
        setCampagna(c[0] || ""); setAnno(a[0] ? String(a[0]) : "");
      } catch (err) { setErrore(err.message); }
      setLoading(false);
    })();
  }, []);

  const righePeriodo = useMemo(() => righe.filter(r =>
    periodo === "campagna" ? r.campagna_da_data === campagna : String(r.anno) === anno
  ), [righe, periodo, campagna, anno]);

  const centriDisponibili = useMemo(() => ordinaCentri([...new Set(righePeriodo.map(r => r.centro_costo))]), [righePeriodo]);
  const fornitoriDisponibili = useMemo(() => [...new Set(righePeriodo.map(r => r.fornitore || "—"))].sort((a, b) => a.localeCompare(b)), [righePeriodo]);

  const righeFiltrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return righePeriodo.filter(r =>
      (societa === "Tutte" || r.societa === societa) &&
      (centro === "Tutti" || r.centro_costo === centro) &&
      (fornitore === "Tutti" || (r.fornitore || "—") === fornitore) &&
      (!q || `${r.descrizione || ""} ${r.fornitore || ""} ${r.numero || ""}`.toLowerCase().includes(q))
    );
  }, [righePeriodo, societa, centro, fornitore, cerca]);

  const fatture = useMemo(() => raggruppaPerFattura(righeFiltrate), [righeFiltrate]);

  const totali = useMemo(() => {
    const perCentro = new Map();
    const perSocieta = { "Podere Verde": { importo: 0, fatture: new Set() }, "Muratella S.r.l.": { importo: 0, fatture: new Set() } };
    for (const r of righeFiltrate) {
      if (!perCentro.has(r.centro_costo)) perCentro.set(r.centro_costo, { "Podere Verde": 0, "Muratella S.r.l.": 0 });
      perCentro.get(r.centro_costo)[r.societa] = round2(perCentro.get(r.centro_costo)[r.societa] + r.imponibile);
      perSocieta[r.societa].importo = round2(perSocieta[r.societa].importo + r.imponibile);
      perSocieta[r.societa].fatture.add(r.fattura_id);
    }
    return { perCentro, perSocieta };
  }, [righeFiltrate]);

  function apriChiudi(chiave) {
    setAperte(prev => { const n = new Set(prev); if (n.has(chiave)) n.delete(chiave); else n.add(chiave); return n; });
  }

  const etichettaPeriodo = periodo === "campagna" ? `campagna ${campagna}` : `anno ${anno}`;

  function esporta() {
    const righeExcel = righeFiltrate.map(r => ({
      "Società": r.societa, "Data": formattaDataItaliana(r.data), "Numero": r.numero,
      "Tipo di documento": r.tipo_documento, "Fornitore": r.fornitore || "", "Partita IVA": r.partita_iva || "",
      "Descrizione": r.descrizione || "", "Quantità": r.quantita != null ? numeroExcel(r.quantita) : null,
      "Unità di misura": r.unita_misura || "", "Prezzo unitario": r.prezzo_unitario != null ? numeroExcel(r.prezzo_unitario) : null,
      "Imponibile": numeroExcel(r.imponibile), "Aliquota IVA": r.aliquota_iva != null ? Number(r.aliquota_iva) : null,
      "IVA": r.iva != null ? numeroExcel(r.iva) : null, "Centro di costo": r.centro_costo, "Destinazione": r.destinazione || "",
      "Campagna": r.campagna_da_data, "Anno": r.anno,
      "Voce diretta della coltivazione": r.voce_diretta_coltivazione ? "Sì" : "No",
      "Già nei costi di coltivazione di Podere Verde": r.nei_costi_coltivazione_podere_verde ? "Sì" : "No",
    }));
    const riepilogo = [...totali.perCentro.entries()].map(([cc, v]) => ({
      "Centro di costo": cc, "Podere Verde": numeroExcel(v["Podere Verde"]), "Muratella S.r.l.": numeroExcel(v["Muratella S.r.l."]),
      "Totale": numeroExcel(round2(v["Podere Verde"] + v["Muratella S.r.l."])),
    }));
    esportaExcel(`Fatture_Coltivazione_${etichettaPeriodo.replace(/[ /]/g, "_")}`, [
      { nome: "Righe di fattura", righe: righeExcel, coloriRiga: r => r["Società"] !== "Podere Verde" },
      { nome: "Totali per centro di costo", righe: riepilogo },
    ]);
  }

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Lettura delle fatture di coltivazione...</div>;
  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;

  const totaleGenerale = round2(totali.perSocieta["Podere Verde"].importo + totali.perSocieta["Muratella S.r.l."].importo);

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Fatture Coltivazione — Elenco Fatture</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
        Letto in automatico dal programma: tutte le righe di fattura con Area Coltivazione, delle fatture passive di Podere Verde e delle fatture
        di Muratella S.r.l. Sola lettura: si aggiorna da solo quando nel programma si carica o si riclassifica una fattura.
      </p>

      {/* Filtri */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
        <div style={stileEtichetta}>Periodo
          <div style={{ display: "flex", border: `1.5px solid ${C.primary}`, borderRadius: 8, overflow: "hidden", height: 36 }}>
            {[["campagna", "Campagna agraria"], ["anno", "Anno solare"]].map(([v, l]) => (
              <button key={v} onClick={() => setPeriodo(v)}
                style={{ border: "none", padding: "0 12px", fontSize: 12.5, fontWeight: 700, background: periodo === v ? C.primary : "#fff", color: periodo === v ? "#fff" : C.primary }}>{l}</button>
            ))}
          </div>
        </div>
        {periodo === "campagna" ? (
          <label style={stileEtichetta}>Campagna (1 settembre – 31 agosto)
            <select value={campagna} onChange={e => setCampagna(e.target.value)} style={stileSelect}>
              {campagneDisponibili(righe).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        ) : (
          <label style={stileEtichetta}>Anno
            <select value={anno} onChange={e => setAnno(e.target.value)} style={stileSelect}>
              {anniDisponibili(righe).map(a => <option key={a} value={String(a)}>{a}</option>)}
            </select>
          </label>
        )}
        <label style={stileEtichetta}>Società
          <select value={societa} onChange={e => setSocieta(e.target.value)} style={stileSelect}>
            <option>Tutte</option>{SOCIETA.map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label style={stileEtichetta}>Centro di costo
          <select value={centro} onChange={e => setCentro(e.target.value)} style={stileSelect}>
            <option>Tutti</option>{centriDisponibili.map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label style={stileEtichetta}>Fornitore
          <select value={fornitore} onChange={e => setFornitore(e.target.value)} style={{ ...stileSelect, maxWidth: 220 }}>
            <option>Tutti</option>{fornitoriDisponibili.map(f => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label style={stileEtichetta}>Cerca
          <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="es. gasolio, rete, orzo"
            style={{ ...stileSelect, width: 180 }} />
        </label>
        <button onClick={esporta} disabled={righeFiltrate.length === 0}
          style={{ marginLeft: "auto", height: 38, padding: "0 16px", border: "none", borderRadius: 8, background: C.primary, color: "#fff", fontSize: 13, fontWeight: 700 }}>
          Esporta Excel
        </button>
      </div>

      {/* Totali */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10, marginBottom: 14 }}>
        <div style={{ background: C.primary, color: "#fff", borderRadius: 10, padding: "12px 14px", gridColumn: "span 2" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.9 }}>Totale {etichettaPeriodo} — {fatture.length} fatture</div>
          <div style={{ fontSize: 24, fontWeight: 800, margin: "4px 0" }}>{formattaEuro(totaleGenerale)}</div>
          <div style={{ fontSize: 12, display: "flex", gap: 18, flexWrap: "wrap" }}>
            <span>Podere Verde {formattaEuro(totali.perSocieta["Podere Verde"].importo)} ({totali.perSocieta["Podere Verde"].fatture.size} fatture)</span>
            <span>Muratella S.r.l. {formattaEuro(totali.perSocieta["Muratella S.r.l."].importo)} ({totali.perSocieta["Muratella S.r.l."].fatture.size} fatture)</span>
          </div>
        </div>
        {ordinaCentri([...totali.perCentro.keys()]).map(cc => {
          const v = totali.perCentro.get(cc);
          return (
            <div key={cc} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>{cc.replace(/^Coltivazione /, "")}</div>
              <div style={{ fontSize: 17, fontWeight: 800, margin: "3px 0" }}>{formattaEuro(round2(v["Podere Verde"] + v["Muratella S.r.l."]))}</div>
              <div style={{ fontSize: 11, color: C.muted }}>Podere Verde {formattaEuro(v["Podere Verde"])}</div>
              <div style={{ fontSize: 11, color: COLORE_MURATELLA }}>Muratella {formattaEuro(v["Muratella S.r.l."])}</div>
            </div>
          );
        })}
      </div>

      {/* Elenco */}
      {fatture.length === 0 ? (
        <p style={{ color: C.muted, fontSize: 13 }}>Nessuna fattura di coltivazione per questi filtri.</p>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: C.primary, color: "#fff" }}>
                {["", "Società", "Data", "Numero", "Fornitore", "Centro di costo", "Righe di coltivazione", "Imponibile coltivazione", "Totale fattura"].map((h, i) => (
                  <th key={i} style={{ padding: "9px 10px", textAlign: i >= 7 ? "right" : "left", fontSize: 11.5, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fatture.map((f, i) => {
                const aperta = aperte.has(f.chiave);
                const muratella = f.societa !== "Podere Verde";
                const mista = f.righe_totali > f.righe.length;
                return [
                  <tr key={f.chiave} onClick={() => apriChiudi(f.chiave)}
                    style={{ cursor: "pointer", borderTop: `1px solid ${C.border}`, background: muratella ? "#FFF8F6" : (i % 2 ? "#FBFAF6" : "#fff") }}>
                    <td style={{ padding: "8px 10px", color: C.muted }}>{aperta ? "▾" : "▸"}</td>
                    <td style={{ padding: "8px 10px" }}><Etichetta societa={f.societa} /></td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{formattaDataItaliana(f.data)}</td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      {f.numero}{f.tipo_documento === "Nota di credito" && <span style={{ color: C.red, fontWeight: 700 }}> · nota di credito</span>}
                    </td>
                    <td style={{ padding: "8px 10px" }}>{f.fornitore || "—"}{f.partita_iva && <div style={{ fontSize: 10.5, color: C.muted }}>Partita IVA {f.partita_iva}</div>}</td>
                    <td style={{ padding: "8px 10px", color: C.muted, fontSize: 12 }}>{ordinaCentri([...f.centri]).map(c => c.replace(/^Coltivazione /, "")).join(", ")}</td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      {f.righe.length} di {f.righe_totali}{mista && <span style={{ color: C.accent, fontWeight: 700 }}> · mista</span>}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{formattaEuro(f.imponibile)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: C.muted, whiteSpace: "nowrap" }}>{f.totale_documento != null ? formattaEuro(f.totale_documento) : "—"}</td>
                  </tr>,
                  aperta && (
                    <tr key={f.chiave + "-dettaglio"} style={{ background: muratella ? "#FFF8F6" : "#fff" }}>
                      <td></td>
                      <td colSpan={8} style={{ padding: "4px 10px 14px" }}>
                        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", background: "#fff" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ color: C.muted, borderBottom: `1.5px solid ${C.border}` }}>
                                {["Descrizione", "Quantità", "Unità di misura", "Prezzo unitario", "Imponibile", "Aliquota IVA", "Centro di costo", "Destinazione"].map((h, j) => (
                                  <th key={j} style={{ padding: "5px 6px", textAlign: [1, 3, 4, 5].includes(j) ? "right" : "left", fontSize: 11 }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {f.righe.map(r => (
                                <tr key={r.riga_id} style={{ borderBottom: `1px solid ${C.border}` }}>
                                  <td style={{ padding: "5px 6px" }}>{r.descrizione}</td>
                                  <td style={{ padding: "5px 6px", textAlign: "right" }}>{r.quantita != null ? formattaNumero(r.quantita) : "—"}</td>
                                  <td style={{ padding: "5px 6px" }}>{r.unita_misura || "—"}</td>
                                  <td style={{ padding: "5px 6px", textAlign: "right" }}>{r.prezzo_unitario != null ? formattaEuro(r.prezzo_unitario) : "—"}</td>
                                  <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700 }}>{formattaEuro(r.imponibile)}</td>
                                  <td style={{ padding: "5px 6px", textAlign: "right" }}>{r.aliquota_iva != null ? `${Number(r.aliquota_iva)}%` : "—"}</td>
                                  <td style={{ padding: "5px 6px" }}>{r.centro_costo}</td>
                                  <td style={{ padding: "5px 6px" }}>{r.destinazione || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {mista && <div style={{ fontSize: 11.5, color: C.accent, marginTop: 6 }}>Fattura mista: {f.righe.length} righe su {f.righe_totali} riguardano la coltivazione; le altre sono di altre aree e qui non si mostrano.</div>}
                          {muratella && <div style={{ fontSize: 11.5, color: COLORE_MURATELLA, marginTop: 6 }}>Fattura intestata a Muratella S.r.l. (contabilità Muratella).{f.nei_costi_coltivazione_podere_verde ? " Risulta già tra i costi di coltivazione di Podere Verde (Prati Fioriti)." : ""}</div>}
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
              <tr style={{ background: "#E7EFE8", borderTop: `2px solid ${C.primary}` }}>
                <td></td>
                <td colSpan={6} style={{ padding: "9px 10px", fontWeight: 800, color: C.primary }}>TOTALE — {fatture.length} fatture</td>
                <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 800, color: C.primary, whiteSpace: "nowrap" }}>{formattaEuro(totaleGenerale)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
