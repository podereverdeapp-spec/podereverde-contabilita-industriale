import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { caricaRegistroLavori, ordinaCampagne } from "./calcoloCampiStagioni";
import { formattaDataItaliana } from "./calcoloFattureColtivazione";
import { righeRegistro } from "./ColtDettaglioLavori";

// Coltivazioni → Campi e Stagioni → Registro dei Lavori
// Sola lettura: tutti i lavori registrati nell'app Podere Verde per la campagna scelta
// (lavorazioni eseguite, semine, concimazioni, raccolte) con i totali della campagna.
const stileSelect = { height: 36, padding: "0 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, background: "#fff" };
const stileEtichetta = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: C.muted, fontWeight: 700 };
const th = { padding: "7px 8px", fontSize: 11, textAlign: "left", whiteSpace: "nowrap" };
const td = { padding: "6px 8px", textAlign: "left", borderTop: `1px solid ${C.border}`, verticalAlign: "top" };
const tdn = { ...td, textAlign: "right", whiteSpace: "nowrap" };
const q = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: d }));
const TIPI_EVENTO = { lavoro: { l: "Lavorazione", c: C.blue }, semina: { l: "Semina", c: C.green }, raccolta: { l: "Raccolta", c: C.accent } };

function Riquadro({ titolo, intest, destra, righe, vuoto }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: C.primary, marginBottom: 6 }}>{titolo}</div>
      {righe.length === 0 ? <div style={{ fontSize: 12, color: C.muted }}>{vuoto}</div> : (
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ background: "#EEF3EF", color: C.primary }}>{intest.map((h, i) => <th key={h} style={{ ...th, textAlign: destra.includes(i) ? "right" : "left" }}>{h}</th>)}</tr></thead>
            <tbody>{righe.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} style={destra.includes(j) ? tdn : { ...td, fontWeight: j === 0 ? 700 : 400 }}>{v}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ColtRegistroLavori() {
  const [colture, setColture] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [campagna, setCampagna] = useState("");
  const [campo, setCampo] = useState("Tutti");
  const [tipo, setTipo] = useState("Tutti");

  useEffect(() => {
    (async () => {
      try {
        const d = await caricaRegistroLavori();
        setColture(d);
        // si parte dalla campagna più recente con almeno un lavoro registrato
        const conLavori = ordinaCampagne(d.filter(c => c.lavori.length || c.semine.length || c.raccolte.length).map(c => c.campagna));
        setCampagna(conLavori[0] || "");
      } catch (err) { setErrore(err.message); }
      setLoading(false);
    })();
  }, []);

  const campagne = useMemo(() => ordinaCampagne(colture.map(c => c.campagna)), [colture]);
  const delleCampagna = useMemo(() => colture.filter(c => c.campagna === campagna), [colture, campagna]);
  const campiDisponibili = useMemo(() => [...new Map(delleCampagna.map(c => [c.numero, c.campo.split(" — ")[0]])).entries()].sort((a, b) => a[0] - b[0]), [delleCampagna]);
  const scelte = useMemo(() => delleCampagna.filter(c => campo === "Tutti" || String(c.numero) === campo), [delleCampagna, campo]);

  // elenco unico degli eventi, dal più recente
  const eventi = useMemo(() => {
    const out = [];
    scelte.forEach(c => {
      c.lavori.forEach(l => out.push({ tipo: "lavoro", c, data: l.data, id: "l" + l.id, nome: l.tipo,
        dettaglio: [l.ettari != null ? `${q(l.ettari)} ettari` : null, l.giornate != null ? `${q(l.giornate)} ${l.giornate === 1 ? "giornata" : "giornate"}` : null, l.contoTerzi ? "conto terzi" : null,
          ...l.concimi.map(k => `${k.nome} ${q(k.quintali)} quintali`), ...l.diserbi.map(d => `${d.nome} ${q(d.quantita)} ${d.unita || ""}`)].filter(Boolean).join(" · ") }));
      c.semine.forEach(s => out.push({ tipo: "semina", c, data: s.data, id: "s" + s.id, nome: s.seme,
        dettaglio: [`${q(s.quantita)} ${s.unita || ""}`, s.dose != null ? `${q(s.dose)} ${s.unita || ""} per ettaro` : null, s.provenienza].filter(Boolean).join(" · ") }));
      c.raccolte.forEach(r => out.push({ tipo: "raccolta", c, data: r.data, id: "r" + r.id, nome: r.prodotto,
        dettaglio: [`${q(r.quantita)} ${r.unita || ""}`, r.quintali != null && r.unita !== "quintali" ? `${q(r.quintali, 1)} quintali` : null, r.resa != null ? `${q(r.resa, 1)} quintali per ettaro` : null].filter(Boolean).join(" · ") }));
    });
    return out.filter(e => tipo === "Tutti" || (tipo.startsWith("·") ? e.tipo === "lavoro" && e.nome === tipo.slice(2) : TIPI_EVENTO[e.tipo].l === tipo))
      .sort((a, b) => (b.data || "").localeCompare(a.data || "") || (a.c.numero ?? 0) - (b.c.numero ?? 0));
  }, [scelte, tipo]);

  // totali della campagna (con i filtri di campo)
  const tot = useMemo(() => {
    const lav = {}, sem = {}, conc = {}, rac = {};
    scelte.forEach(c => {
      c.lavori.forEach(l => {
        const a = (lav[l.tipo] ||= { n: 0, ettari: 0, giornate: 0, terzi: 0 });
        a.n++; a.ettari += l.ettariEffettivi || 0; a.giornate += l.giornate || 0; if (l.contoTerzi) a.terzi++;
        l.concimi.forEach(k => { const b = (conc[k.nome] ||= { quintali: 0, campi: new Set() }); b.quintali += k.quintali || 0; b.campi.add(c.numero); });
      });
      c.semine.forEach(s => { const k = `${s.seme}|${s.unita}`; const a = (sem[k] ||= { seme: s.seme, unita: s.unita, q: 0, ettari: 0 }); a.q += s.quantita || 0; a.ettari += c.ettari || 0; });
      const prodottiColtura = new Set();
      c.raccolte.forEach(r => {
        const k = `${r.prodotto}|${r.unita}`; const a = (rac[k] ||= { prodotto: r.prodotto, unita: r.unita, q: 0, quintali: 0, ettari: 0 });
        a.q += r.quantita || 0; a.quintali += r.quintali || 0;
        if (!prodottiColtura.has(k)) { a.ettari += c.ettari || 0; prodottiColtura.add(k); }
      });
    });
    return {
      lav: Object.entries(lav).sort((a, b) => b[1].n - a[1].n),
      sem: Object.values(sem).sort((a, b) => a.seme.localeCompare(b.seme)),
      conc: Object.entries(conc).sort((a, b) => b[1].quintali - a[1].quintali),
      rac: Object.values(rac).sort((a, b) => a.prodotto.localeCompare(b.prodotto)),
    };
  }, [scelte]);

  const tipiLavoro = useMemo(() => [...new Set(delleCampagna.flatMap(c => c.lavori.map(l => l.tipo)))].sort(), [delleCampagna]);

  function esporta() {
    esportaExcel(`Registro_dei_Lavori_${campagna.replace("/", "_")}`, [
      { nome: "Totali lavorazioni", righe: tot.lav.map(([t, a]) => ({ "Lavorazione": t, "Passaggi": a.n, "Ettari lavorati": numeroExcel(a.ettari), "Giornate di lavoro": numeroExcel(a.giornate), "Passaggi in conto terzi": a.terzi })) },
      { nome: "Totali semine", righe: tot.sem.map(a => ({ "Seme": a.seme, "Quantità seminata": numeroExcel(a.q), "Unità di misura": a.unita || "" })) },
      { nome: "Totali concimi", righe: tot.conc.map(([n, a]) => ({ "Concime": n, "Quintali distribuiti": numeroExcel(a.quintali), "Numero di campi": a.campi.size })) },
      { nome: "Totali raccolto", righe: tot.rac.map(a => ({ "Prodotto": a.prodotto, "Quantità raccolta": numeroExcel(a.q), "Unità di misura": a.unita || "", "Quintali": numeroExcel(a.quintali), "Ettari": numeroExcel(a.ettari), "Resa in quintali per ettaro": a.ettari && a.quintali ? numeroExcel(a.quintali / a.ettari) : null })) },
      ...righeRegistro(scelte),
    ]);
  }

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Lettura del registro dei lavori...</div>;
  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;

  const senzaDate = eventi.filter(e => !e.data).length;

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Registro dei Lavori</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
        Tutto quello che è stato registrato nell'app Podere Verde per la campagna scelta: lavorazioni eseguite, semine, concimazioni e raccolte, con i totali. Si aggiorna da solo a ogni lavoro registrato nell'app.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
        <label style={stileEtichetta}>Campagna
          <select value={campagna} onChange={e => { setCampagna(e.target.value); setCampo("Tutti"); setTipo("Tutti"); }} style={stileSelect}>
            {campagne.map(cp => <option key={cp}>{cp}</option>)}
          </select>
        </label>
        <label style={stileEtichetta}>Campo
          <select value={campo} onChange={e => setCampo(e.target.value)} style={stileSelect}>
            <option>Tutti</option>{campiDisponibili.map(([n, nome]) => <option key={n} value={String(n)}>{n} — {nome}</option>)}
          </select>
        </label>
        <label style={stileEtichetta}>Tipo di lavoro
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={stileSelect}>
            <option>Tutti</option><option>Lavorazione</option><option>Semina</option><option>Raccolta</option>
            <optgroup label="Una sola lavorazione">{tipiLavoro.map(t => <option key={t} value={"· " + t}>{t}</option>)}</optgroup>
          </select>
        </label>
        <button onClick={esporta} style={{ marginLeft: "auto", height: 38, padding: "0 16px", border: "none", borderRadius: 8, background: C.primary, color: "#fff", fontSize: 13, fontWeight: 700 }}>Esporta Excel</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Riquadro titolo="Lavorazioni" vuoto="Nessuna lavorazione registrata." intest={["Lavorazione", "Passaggi", "Ettari lavorati", "Giornate di lavoro", "In conto terzi"]} destra={[1, 2, 3, 4]}
          righe={tot.lav.map(([t, a]) => [t, a.n, q(a.ettari), a.giornate ? q(a.giornate) : "—", a.terzi || "—"])} />
        <Riquadro titolo="Raccolto" vuoto="Nessuna raccolta registrata." intest={["Prodotto", "Quantità raccolta", "Quintali", "Ettari", "Resa in quintali per ettaro"]} destra={[1, 2, 3, 4]}
          righe={tot.rac.map(a => [a.prodotto, `${q(a.q)} ${a.unita || ""}`, q(a.quintali, 1), q(a.ettari), a.ettari && a.quintali ? q(a.quintali / a.ettari, 1) : "—"])} />
        <Riquadro titolo="Semine" vuoto="Nessuna semina registrata." intest={["Seme", "Quantità seminata"]} destra={[1]}
          righe={tot.sem.map(a => [a.seme, `${q(a.q)} ${a.unita || ""}`])} />
        <Riquadro titolo="Concimi distribuiti" vuoto="Nessuna concimazione registrata." intest={["Concime", "Quintali", "Campi"]} destra={[1, 2]}
          righe={tot.conc.map(([n, a]) => [n, q(a.quintali), a.campi.size])} />
      </div>

      <h2 style={{ color: C.primary, fontSize: 17, margin: "0 0 4px" }}>Tutti i lavori registrati ({eventi.length})</h2>
      {senzaDate > 0 && <p style={{ color: C.muted, fontSize: 12.5, margin: "0 0 8px" }}>{senzaDate} lavori senza data (caricati dalle schede storiche): sono in fondo all'elenco.</p>}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>
            {["Data", "Campo", "Coltura", "Tipo", "Che cosa", "Dettaglio"].map(h => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>{eventi.map(e => (
            <tr key={e.id}>
              <td style={{ ...td, whiteSpace: "nowrap" }}>{e.data ? formattaDataItaliana(e.data) : <span style={{ color: C.muted }}>senza data</span>}</td>
              <td style={td}><b>{e.c.numero}</b> — {e.c.campo}</td>
              <td style={td}>{e.c.coltura}</td>
              <td style={td}><span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: TIPI_EVENTO[e.tipo].c + "22", color: TIPI_EVENTO[e.tipo].c }}>{TIPI_EVENTO[e.tipo].l}</span></td>
              <td style={{ ...td, fontWeight: 700 }}>{e.nome}</td>
              <td style={{ ...td, color: C.text }}>{e.dettaglio || "—"}</td>
            </tr>))}
            {eventi.length === 0 && <tr><td colSpan={6} style={{ ...td, color: C.muted }}>Nessun lavoro registrato con questi filtri.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
