import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { caricaPiano, ordinaCampagne } from "./calcoloCampiStagioni";

// Coltivazioni → Campi e Stagioni → Piano della Campagna
// Sola lettura: il programma di semina e concimazione registrato nell'app Podere Verde.
// È un piano: non è un costo e non entra mai nei totali della sezione.
const stileSelect = { height: 36, padding: "0 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, background: "#fff" };
const stileEtichetta = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: C.muted, fontWeight: 700 };
const th = { padding: "8px 8px", fontSize: 11, textAlign: "right", whiteSpace: "nowrap" };
const td = { padding: "7px 8px", textAlign: "right", whiteSpace: "nowrap", borderTop: `1px solid ${C.border}` };
const q = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: d }));
const unitaPlurale = (u, n) => (u === "chilogrammo" ? "chilogrammi" : u === "confezione" ? (n === 1 ? "confezione" : "confezioni") : u || "");

export default function ColtPianoCampagna() {
  const [piano, setPiano] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [campagna, setCampagna] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const d = await caricaPiano();
        setPiano(d);
        setCampagna(ordinaCampagne(d.map(x => x.campagna))[0] || "");
      } catch (err) { setErrore(err.message); }
      setLoading(false);
    })();
  }, []);

  const righe = useMemo(() => piano.filter(x => x.campagna === campagna), [piano, campagna]);
  // Da acquistare: somma per prodotto
  const acquisti = useMemo(() => {
    const m = {};
    righe.forEach(r => r.prodotti.forEach(p => {
      const k = `${p.tipo}|${p.prodotto}|${p.unita}`;
      const a = m[k] || (m[k] = { tipo: p.tipo, prodotto: p.prodotto, unita: p.unita, quantita: 0, costo: 0, prezzo: p.prezzo });
      a.quantita += p.quantita || 0; a.costo += p.costo || 0;
    }));
    return Object.values(m).sort((a, b) => a.tipo.localeCompare(b.tipo) || b.costo - a.costo);
  }, [righe]);
  const totale = acquisti.reduce((s, a) => s + a.costo, 0);

  function esporta() {
    esportaExcel(`Piano_${campagna.replace("/", "_")}`, [
      { nome: `PIANO ${campagna.replace("/", "-")}`, righe: righe.flatMap(r => (r.prodotti.length ? r.prodotti : [null]).map(p => ({
        "Numero del campo": r.numero, "Campo": r.campo, "Coltura": r.coltura, "Ettari": numeroExcel(r.ettari),
        "Campagna di semina": r.campagnaSemina || "", "Tipo": p?.tipo || "", "Prodotto": p?.prodotto || "",
        "Dose per ettaro": p?.dose ?? null, "Unità di misura": p?.unita || "", "Quantità prevista": numeroExcel(p?.quantita),
        "Prezzo unitario in euro": p?.prezzo ?? null, "Costo previsto in euro": numeroExcel(p?.costo), "Nota del prodotto": p?.nota || "",
        "Nota della coltura": r.nota || "",
      }))) },
      { nome: "DA ACQUISTARE", righe: acquisti.map(a => ({
        "Tipo": a.tipo, "Prodotto": a.prodotto, "Quantità prevista": numeroExcel(a.quantita), "Unità di misura": a.unita,
        "Prezzo unitario in euro": a.prezzo, "Costo previsto in euro": numeroExcel(a.costo) })) },
    ]);
  }

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Lettura del piano...</div>;
  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;
  if (!piano.length) return <div style={{ padding: 20, color: C.muted }}>Nell'app non c'è ancora nessun programma di semina e concimazione.</div>;

  return (
    <div style={{ padding: 20, maxWidth: 1500, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Piano della Campagna</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
        Il programma di semina e concimazione approvato nell'app Podere Verde: per ogni campo la coltura prevista, i semi e i concimi con la dose per ettaro, la quantità e il costo previsti.
        È un piano: <b>non è un costo</b> e non entra mai nei totali. I costi veri si vedono a consuntivo nelle Schede Campi.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
        <label style={stileEtichetta}>Campagna
          <select value={campagna} onChange={e => setCampagna(e.target.value)} style={stileSelect}>
            {ordinaCampagne(piano.map(x => x.campagna)).map(cp => <option key={cp}>{cp}</option>)}
          </select>
        </label>
        <div style={{ fontSize: 13 }}>{righe.length} colture · spesa prevista per semi e concimi <b>{formattaEuro(totale)}</b></div>
        <button onClick={esporta} style={{ marginLeft: "auto", height: 38, padding: "0 16px", border: "none", borderRadius: 8, background: C.primary, color: "#fff", fontSize: 13, fontWeight: 700 }}>Esporta Excel</button>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>
            <th style={{ ...th, textAlign: "left" }}>Campo</th><th style={{ ...th, textAlign: "left" }}>Coltura</th><th style={th}>Ettari</th>
            <th style={{ ...th, textAlign: "left" }}>Prodotto</th><th style={th}>Dose per ettaro</th><th style={th}>Quantità prevista</th>
            <th style={th}>Prezzo unitario</th><th style={th}>Costo previsto</th>
          </tr></thead>
          <tbody>{righe.map(r => {
            const ps = r.prodotti.length ? r.prodotti : [null];
            return ps.map((p, i) => (
              <tr key={r.id + "-" + i} style={{ background: i === 0 ? undefined : "#FCFBF8" }}>
                {i === 0 && <>
                  <td rowSpan={ps.length} style={{ ...td, textAlign: "left", verticalAlign: "top", whiteSpace: "normal" }}><b>{r.numero}</b> — {r.campo}</td>
                  <td rowSpan={ps.length} style={{ ...td, textAlign: "left", verticalAlign: "top", whiteSpace: "normal" }}>
                    {r.coltura}{r.ordine > 1 && <span style={{ color: C.muted }}> (seconda coltura)</span>}
                    {r.campagnaSemina && r.campagnaSemina !== r.campagna && <div style={{ fontSize: 10.5, color: C.muted }}>seminata nel {r.campagnaSemina}</div>}
                  </td>
                  <td rowSpan={ps.length} style={{ ...td, verticalAlign: "top" }}>{q(r.ettari)}</td>
                </>}
                {p ? <>
                  <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: p.tipo === "Seme" ? C.green : C.accent }}>{p.tipo.toUpperCase()}</span> {p.prodotto}
                    {p.nota && <div style={{ fontSize: 10.5, color: C.muted }}>{p.nota}</div>}
                  </td>
                  <td style={td}>{q(p.dose)} {unitaPlurale(p.unita, p.dose)}</td>
                  <td style={td}>{q(p.quantita)} {unitaPlurale(p.unita, p.quantita)}</td>
                  <td style={td}>{p.prezzo != null ? formattaEuro(p.prezzo) : "—"}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{p.costo != null ? formattaEuro(p.costo) : "—"}</td>
                </> : <td colSpan={5} style={{ ...td, textAlign: "left", color: C.muted }}>nessun seme o concime previsto</td>}
              </tr>));
          })}</tbody>
        </table>
      </div>

      <h2 style={{ color: C.primary, fontSize: 17, margin: "22px 0 8px" }}>Da acquistare</h2>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto", maxWidth: 900 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>
            <th style={{ ...th, textAlign: "left" }}>Tipo</th><th style={{ ...th, textAlign: "left" }}>Prodotto</th>
            <th style={th}>Quantità prevista</th><th style={th}>Prezzo unitario</th><th style={th}>Costo previsto</th>
          </tr></thead>
          <tbody>
            {acquisti.map(a => (
              <tr key={a.tipo + a.prodotto + a.unita}>
                <td style={{ ...td, textAlign: "left" }}>{a.tipo}</td><td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}>{a.prodotto}</td>
                <td style={td}>{q(a.quantita)} {unitaPlurale(a.unita, a.quantita)}</td>
                <td style={td}>{a.prezzo != null ? formattaEuro(a.prezzo) : "—"}</td>
                <td style={{ ...td, fontWeight: 700 }}>{formattaEuro(a.costo)}</td>
              </tr>))}
            <tr style={{ borderTop: `2px solid ${C.primary}`, background: "#E7EFE8" }}>
              <td colSpan={4} style={{ ...td, textAlign: "left", fontWeight: 800, color: C.primary }}>TOTALE PREVISTO</td>
              <td style={{ ...td, fontWeight: 800, color: C.primary }}>{formattaEuro(totale)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>Ettari: quelli della coltura, o quelli del campo se la coltura non li indica. Quantità prevista = dose per ettaro × ettari.</p>
    </div>
  );
}
