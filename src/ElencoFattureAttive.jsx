import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { C } from "./style";
import { formattaEuro, round2 } from "./parsingUtils";
import { input, btn, scheda, th, td, testata, chip, dataIt } from "./stileAruba";
import { caricaElencoAttive } from "./calcoloAruba";

// Versione 300 — Controllo Fatturazione Attiva e Numero Progressivo → Elenco Fatture Attive.
// Tutte le fatture di vendita di tutti gli anni: quelle registrate in contabilità (lette da Aruba o caricate prima)
// e quelle emesse dal programma. La ricerca guarda dentro numero, cliente e righe: una matricola, «mezzena», «orzo», «equino».

const norm = s => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function ElencoFattureAttive() {
  const [elenco, setElenco] = useState(null);
  const [errore, setErrore] = useState(null);
  const [cerca, setCerca] = useState("");
  const [anno, setAnno] = useState("");
  const [cliente, setCliente] = useState("");
  const [destinazione, setDestinazione] = useState("");
  const [aperte, setAperte] = useState(() => new Set());

  useEffect(() => { caricaElencoAttive().then(setElenco).catch(e => setErrore(e.message)); }, []);

  const anni = useMemo(() => [...new Set((elenco || []).map(f => f.anno))].sort((a, b) => b - a), [elenco]);
  const clienti = useMemo(() => [...new Set((elenco || []).map(f => f.cliente))].sort(), [elenco]);
  const parole = norm(cerca).split(/\s+/).filter(Boolean);

  const filtrate = useMemo(() => (elenco || []).map(f => {
    if (anno && f.anno !== Number(anno)) return null;
    if (cliente && f.cliente !== cliente) return null;
    // righe che contengono tutte le parole cercate (o la fattura intera se le parole sono nel numero o nel cliente)
    const testoTesta = norm(`${f.numero} ${f.cliente} ${f.partitaIva}`);
    let righe = f.righe;
    if (destinazione) righe = righe.filter(r => r.destinazione === destinazione);
    if (parole.length) {
      const inTesta = parole.every(p => testoTesta.includes(p));
      if (!inTesta) righe = righe.filter(r => parole.every(p => norm(`${r.descrizione} ${testoTesta}`).includes(p)));
    }
    if ((parole.length || destinazione) && !righe.length) return null;
    const parziale = righe.length !== f.righe.length;
    return { ...f, righeTrovate: righe, parziale, importoTrovato: round2(righe.reduce((s, r) => s + (r.importo || 0), 0)) };
  }).filter(Boolean), [elenco, anno, cliente, destinazione, cerca]); // eslint-disable-line react-hooks/exhaustive-deps

  const cercaRighe = parole.length > 0 || destinazione;
  const totale = round2(filtrate.reduce((s, f) => s + (cercaRighe ? f.importoTrovato : f.imponibile), 0));
  const apri = k => setAperte(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  function esporta() {
    const fatture = filtrate.map(f => ({ Numero: f.numero, Data: f.data, Anno: f.anno, Tipo: f.tipo, Cliente: f.cliente, "Partita IVA": f.partitaIva, Imponibile: f.imponibile, IVA: f.imposta, Totale: f.totale, Provenienza: f.provenienza, "Stato in Aruba": f.stato }));
    const righe = filtrate.flatMap(f => f.righeTrovate.map(r => ({ Numero: f.numero, Data: f.data, Cliente: f.cliente, Descrizione: r.descrizione, Quantità: r.quantita, "Unità di misura": r.unita || "", "Prezzo unitario": r.prezzo, Importo: r.importo, "Aliquota IVA": r.aliquota, Destinazione: r.destinazione || "" })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fatture), "Fatture");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(righe), "Righe");
    XLSX.writeFile(wb, `Fatture_Attive_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (errore) return <div style={{ padding: 20, color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>;
  if (!elenco) return <div style={{ padding: 20, color: C.muted }}>Lettura delle fatture…</div>;

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ color: C.primary, fontSize: 24, margin: 0 }}>Elenco Fatture Attive</h1>
        <button onClick={esporta} style={btn(false)}>📥 Esporta Excel</button>
      </div>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
        Tutte le fatture di vendita di tutti gli anni: quelle registrate in contabilità (lette da Aruba o caricate prima) e quelle emesse dal programma.
        Nella ricerca si può scrivere una matricola, un lotto, il nome di un bene («mezzena», «scottona», «orzo», «equino») o un cliente: compaiono le fatture e, sotto, solo le righe trovate.
      </p>
      <div style={{ ...scheda, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca: matricola, bene, cliente, numero…" style={{ ...input, width: 330 }} />
        <select value={anno} onChange={e => setAnno(e.target.value)} style={input}><option value="">Tutti gli anni</option>{anni.map(a => <option key={a} value={a}>{a}</option>)}</select>
        <select value={cliente} onChange={e => setCliente(e.target.value)} style={{ ...input, maxWidth: 320 }}><option value="">Tutti i clienti</option>{clienti.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <select value={destinazione} onChange={e => setDestinazione(e.target.value)} style={input}><option value="">Tutte le destinazioni</option>{["Bovini", "Suini", "Ovini", "Generali", "Pollame", "Cavalli"].map(d => <option key={d} value={d}>{d}</option>)}</select>
        {(cerca || anno || cliente || destinazione) && <button onClick={() => { setCerca(""); setAnno(""); setCliente(""); setDestinazione(""); }} style={btn(false)}>Togli i filtri</button>}
      </div>
      <div style={{ marginBottom: 8 }}>
        <span style={chip(C.primary)}>{filtrate.length === 1 ? "1 fattura" : `${filtrate.length} fatture`}</span>
        <span style={chip(C.green)}>{cercaRighe ? "Importo delle righe trovate" : "Imponibile"}: {formattaEuro(totale)}</span>
      </div>
      <div style={{ ...scheda, padding: 0, overflow: "auto" }}>
        <table>
          <thead><tr style={testata}><th style={th}>Numero</th><th style={th}>Data</th><th style={th}>Tipo</th><th style={th}>Cliente</th><th style={{ ...th, textAlign: "right" }}>Imponibile</th><th style={{ ...th, textAlign: "right" }}>IVA</th><th style={{ ...th, textAlign: "right" }}>Totale</th><th style={th}>Provenienza</th><th style={th}>Stato in Aruba</th></tr></thead>
          <tbody>
            {filtrate.map(f => {
              const aperta = aperte.has(f.chiave) || (cercaRighe && f.parziale);
              return [
                <tr key={f.chiave} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }} onClick={() => apri(f.chiave)}>
                  <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>{aperta ? "▾" : "▸"} {f.numero}</td>
                  <td style={td}>{dataIt(f.data)}</td><td style={td}>{f.tipo}</td><td style={td}>{f.cliente}</td>
                  <td style={{ ...td, textAlign: "right" }}>{formattaEuro(f.imponibile)}</td><td style={{ ...td, textAlign: "right" }}>{formattaEuro(f.imposta)}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(f.totale)}</td>
                  <td style={td}>{f.provenienza}</td>
                  <td style={{ ...td, color: /non ancora|scart|non consegn/i.test(f.stato) ? C.red : C.text }}>{f.stato || "—"}</td>
                </tr>,
                aperta && (
                  <tr key={f.chiave + "r"}><td colSpan={9} style={{ padding: "0 10px 10px 30px", background: "#FAF9F5" }}>
                    <table style={{ fontSize: 12 }}>
                      <thead><tr style={{ color: C.muted }}><th style={th}>Descrizione</th><th style={{ ...th, textAlign: "right" }}>Quantità</th><th style={th}>Unità</th><th style={{ ...th, textAlign: "right" }}>Prezzo</th><th style={{ ...th, textAlign: "right" }}>Importo</th><th style={th}>IVA %</th><th style={th}>Destinazione</th></tr></thead>
                      <tbody>{(cercaRighe ? f.righeTrovate : f.righe).map((r, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                          <td style={td}>{r.descrizione}</td><td style={{ ...td, textAlign: "right" }}>{r.quantita}</td><td style={td}>{r.unita || ""}</td>
                          <td style={{ ...td, textAlign: "right" }}>{r.prezzo}</td><td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.importo)}</td>
                          <td style={td}>{r.aliquota}</td><td style={td}>{r.destinazione || "—"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                    {cercaRighe && f.parziale && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>Righe trovate: {f.righeTrovate.length} su {f.righe.length}.</div>}
                  </td></tr>
                ),
              ];
            })}
            {!filtrate.length && <tr><td colSpan={9} style={{ ...td, color: C.muted, padding: 16 }}>Nessuna fattura trovata.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
