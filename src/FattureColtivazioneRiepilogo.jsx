import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { formattaEuro, round2 } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { caricaRegistroFattureColtivazione, ordinaCentri, SOCIETA } from "./calcoloFattureColtivazione";

// Coltivazioni → Fatture Coltivazione → Riepilogo per Anno e Centro di Costo
// Sola lettura: legge il registro v_fatture_coltivazione. Per ogni centro di costo il totale
// e, sotto, la parte di Podere Verde e quella di Muratella S.r.l., sempre distinte.
const COLORE_MURATELLA = "#B03A2E";

export default function FattureColtivazioneRiepilogo() {
  const [righe, setRighe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [colonne, setColonne] = useState("anno"); // "anno" | "campagna"
  const [societa, setSocieta] = useState("Tutte");

  useEffect(() => {
    (async () => {
      try { setRighe(await caricaRegistroFattureColtivazione()); }
      catch (err) { setErrore(err.message); }
      setLoading(false);
    })();
  }, []);

  const chiavePeriodo = r => (colonne === "anno" ? String(r.anno) : r.campagna_da_data);

  const { periodi, centri, valori } = useMemo(() => {
    const righeSel = righe.filter(r => societa === "Tutte" || r.societa === societa);
    const periodi = [...new Set(righeSel.map(chiavePeriodo))].sort();
    const centri = ordinaCentri([...new Set(righeSel.map(r => r.centro_costo))]);
    const valori = new Map(); // `${centro}|${societa}|${periodo}` -> importo
    for (const r of righeSel) {
      const k = `${r.centro_costo}|${r.societa}|${chiavePeriodo(r)}`;
      valori.set(k, round2((valori.get(k) || 0) + r.imponibile));
    }
    return { periodi, centri, valori };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [righe, colonne, societa]);

  const v = (centro, soc, periodo) => {
    const lista = soc ? [soc] : SOCIETA;
    const cc = centro ? [centro] : centri;
    return round2(lista.reduce((s, so) => s + cc.reduce((s2, c) => s2 + (valori.get(`${c}|${so}|${periodo}`) || 0), 0), 0));
  };
  const totaleRiga = (centro, soc) => round2(periodi.reduce((s, p) => s + v(centro, soc, p), 0));
  const societaMostrate = societa === "Tutte" ? SOCIETA : [societa];

  function esporta() {
    const righeExcel = [];
    for (const c of centri) {
      righeExcel.push({ "Centro di costo": c, "Società": "Totale", ...Object.fromEntries(periodi.map(p => [p, numeroExcel(v(c, null, p))])), "Totale": numeroExcel(totaleRiga(c, null)) });
      for (const s of societaMostrate) {
        if (totaleRiga(c, s) === 0) continue;
        righeExcel.push({ "Centro di costo": c, "Società": s, ...Object.fromEntries(periodi.map(p => [p, numeroExcel(v(c, s, p))])), "Totale": numeroExcel(totaleRiga(c, s)) });
      }
    }
    for (const s of societaMostrate) {
      righeExcel.push({ "Centro di costo": `TOTALE ${s.toUpperCase()}`, "Società": s, ...Object.fromEntries(periodi.map(p => [p, numeroExcel(v(null, s, p))])), "Totale": numeroExcel(totaleRiga(null, s)) });
    }
    righeExcel.push({ "Centro di costo": "TOTALE GENERALE", "Società": "Totale", ...Object.fromEntries(periodi.map(p => [p, numeroExcel(v(null, null, p))])), "Totale": numeroExcel(totaleRiga(null, null)) });
    esportaExcel(`Fatture_Coltivazione_Riepilogo_per_${colonne === "anno" ? "anno" : "campagna"}`, [
      { nome: colonne === "anno" ? "Per anno solare" : "Per campagna agraria", righe: righeExcel, coloriRiga: r => r["Società"] === "Muratella S.r.l." },
    ]);
  }

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Lettura delle fatture di coltivazione...</div>;
  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;

  const cella = (val, extra = {}) => (
    <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap", color: val ? undefined : "#B5AFA3", ...extra }}>{val ? formattaEuro(val) : "—"}</td>
  );

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Fatture Coltivazione — Riepilogo per Anno e Centro di Costo</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
        Imponibile delle righe con Area Coltivazione. Per ogni centro di costo: il totale e, sotto, la parte di Podere Verde e la parte di Muratella S.r.l.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: C.muted, fontWeight: 700 }}>Colonne per
          <div style={{ display: "flex", border: `1.5px solid ${C.primary}`, borderRadius: 8, overflow: "hidden", height: 36 }}>
            {[["anno", "Anno solare"], ["campagna", "Campagna agraria"]].map(([k, l]) => (
              <button key={k} onClick={() => setColonne(k)}
                style={{ border: "none", padding: "0 12px", fontSize: 12.5, fontWeight: 700, background: colonne === k ? C.primary : "#fff", color: colonne === k ? "#fff" : C.primary }}>{l}</button>
            ))}
          </div>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: C.muted, fontWeight: 700 }}>Società
          <select value={societa} onChange={e => setSocieta(e.target.value)} style={{ height: 36, padding: "0 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
            <option>Tutte</option>{SOCIETA.map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        <button onClick={esporta}
          style={{ marginLeft: "auto", height: 38, padding: "0 16px", border: "none", borderRadius: 8, background: C.primary, color: "#fff", fontSize: 13, fontWeight: 700 }}>
          Esporta Excel
        </button>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: C.primary, color: "#fff" }}>
              <th style={{ padding: "9px 10px", textAlign: "left", fontSize: 11.5 }}>Centro di costo</th>
              {periodi.map(p => <th key={p} style={{ padding: "9px 10px", textAlign: "right", fontSize: 11.5, whiteSpace: "nowrap" }}>{p}</th>)}
              <th style={{ padding: "9px 10px", textAlign: "right", fontSize: 11.5 }}>Totale</th>
            </tr>
          </thead>
          <tbody>
            {centri.map(c => {
              const anomalo = !c.startsWith("Coltivazione") && c !== "Gasolio e lubrificanti" && c !== "Manutenzione e Riparazione Macchine Agricole";
              return [
                <tr key={c} style={{ background: anomalo ? "#FBEDEB" : "#EEF3EF", borderTop: `2px solid ${C.border}` }}>
                  <td style={{ padding: "8px 10px", fontWeight: 800, color: anomalo ? C.red : C.primary }}>{c}</td>
                  {periodi.map(p => cella(v(c, null, p), { fontWeight: 800 }))}
                  {cella(totaleRiga(c, null), { fontWeight: 800 })}
                </tr>,
                ...societaMostrate.filter(s => totaleRiga(c, s) !== 0).map(s => (
                  <tr key={c + s} style={{ background: s === "Podere Verde" ? "#fff" : "#FFF8F6", borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "7px 10px 7px 26px", color: s === "Podere Verde" ? C.text : COLORE_MURATELLA }}>{s}</td>
                    {periodi.map(p => cella(v(c, s, p), { color: s === "Podere Verde" ? undefined : COLORE_MURATELLA }))}
                    {cella(totaleRiga(c, s), { color: s === "Podere Verde" ? undefined : COLORE_MURATELLA })}
                  </tr>
                )),
              ];
            })}
            {societaMostrate.map(s => (
              <tr key={"tot" + s} style={{ borderTop: `2px solid ${s === "Podere Verde" ? C.primary : COLORE_MURATELLA}`, background: s === "Podere Verde" ? "#fff" : "#FFF8F6" }}>
                <td style={{ padding: "9px 10px", fontWeight: 800, color: s === "Podere Verde" ? C.primary : COLORE_MURATELLA }}>TOTALE {s.toUpperCase()}</td>
                {periodi.map(p => cella(v(null, s, p), { fontWeight: 800, color: s === "Podere Verde" ? C.primary : COLORE_MURATELLA }))}
                {cella(totaleRiga(null, s), { fontWeight: 800, color: s === "Podere Verde" ? C.primary : COLORE_MURATELLA })}
              </tr>
            ))}
            {societa === "Tutte" && (
              <tr style={{ borderTop: `2px solid ${C.primary}`, background: "#E7EFE8" }}>
                <td style={{ padding: "9px 10px", fontWeight: 800, color: C.primary }}>TOTALE GENERALE</td>
                {periodi.map(p => cella(v(null, null, p), { fontWeight: 800, color: C.primary }))}
                {cella(totaleRiga(null, null), { fontWeight: 800, color: C.primary })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>
        Le righe in rosso sono centri di costo insoliti per l'area Coltivazione (o mancanti): si mostrano così come sono nel programma, senza correggerli.
      </p>
    </div>
  );
}
