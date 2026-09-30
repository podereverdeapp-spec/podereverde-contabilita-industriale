import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { formattaEuro, round2 } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { caricaSchedeCampi, caricaRegistroLavori, ordinaCampagne, unitaPerEttaro, perUnita } from "./calcoloCampiStagioni";
import ColtDettaglioLavori, { righeRegistro } from "./ColtDettaglioLavori";
import { formattaDataItaliana } from "./calcoloFattureColtivazione";

// Coltivazioni → Campi e Stagioni → Schede Campi
// Sola lettura: le schede campo dell'app Podere Verde, una riga per coltura, con le voci di costo.
const stileSelect = { height: 36, padding: "0 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, background: "#fff" };
const stileEtichetta = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: C.muted, fontWeight: 700 };
const th = { padding: "8px 8px", fontSize: 11, textAlign: "right", whiteSpace: "nowrap" };
const td = { padding: "7px 8px", textAlign: "right", whiteSpace: "nowrap", borderTop: `1px solid ${C.border}` };
const q = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: d }));
const eu = v => (v ? formattaEuro(v) : "—");

function Badge({ testo, colore }) {
  return <span style={{ display: "inline-block", marginLeft: 6, padding: "1px 7px", borderRadius: 6, fontSize: 10.5, fontWeight: 700, background: colore + "22", color: colore }}>{testo}</span>;
}

export default function ColtSchedeCampi() {
  const [schede, setSchede] = useState([]);
  const [registro, setRegistro] = useState({});
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [campagna, setCampagna] = useState("");
  const [cerca, setCerca] = useState("");
  const [aperte, setAperte] = useState(() => new Set());

  useEffect(() => {
    (async () => {
      try {
        const [dati, reg] = await Promise.all([caricaSchedeCampi(), caricaRegistroLavori()]);
        setSchede(dati);
        setRegistro(Object.fromEntries(reg.map(c => [c.id, c])));
        // si parte dall'ultima campagna con costi (quella in corso non ha ancora costi)
        const conCosti = ordinaCampagne(dati.filter(s => s.totale > 0).map(s => s.campagna));
        setCampagna(conCosti[0] || ordinaCampagne(dati.map(s => s.campagna))[0] || "");
      } catch (err) { setErrore(err.message); }
      setLoading(false);
    })();
  }, []);

  const campagne = useMemo(() => ordinaCampagne(schede.map(s => s.campagna)), [schede]);
  const inCorso = cp => !schede.some(s => s.campagna === cp && s.totale > 0);

  const righe = useMemo(() => {
    const t = cerca.trim().toLowerCase();
    return schede.filter(s => s.campagna === campagna && (!t ||
      `${s.numero} ${s.campo} ${s.coltura} ${s.prodotto || ""}`.toLowerCase().includes(t)));
  }, [schede, campagna, cerca]);

  const tot = useMemo(() => {
    const t = { seme: 0, concime: 0, fitosanitari: 0, lavorazioniEuro: 0, altro: 0, totale: 0 };
    righe.forEach(r => Object.keys(t).forEach(k => { t[k] = round2(t[k] + (r[k] || 0)); }));
    return t;
  }, [righe]);

  const apri = id => setAperte(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function esporta() {
    const principali = righe.map(r => ({
      "Numero del campo": r.numero, "Campo": r.campo, "Coltura": r.coltura,
      "Ettari della coltura": numeroExcel(r.ettari), "Ettari del campo": numeroExcel(r.ettariCampo),
      "Poliennale": r.poliennale ? "sì" : "no", "Pascolato": r.pascolato ? "sì" : "no",
      "Semine": r.semine || "", "Concimi": r.concimi || "", "Lavorazioni": r.lavorazioni || "", "Raccolte": r.raccolte || "",
      "Seme in euro": numeroExcel(r.seme), "Concimi in euro": numeroExcel(r.concime), "Fitosanitari in euro": numeroExcel(r.fitosanitari),
      "Lavorazioni in euro": numeroExcel(r.lavorazioniEuro), "Altro in euro": numeroExcel(r.altro),
      "Totale della coltura in euro": numeroExcel(r.totale), "Euro per ettaro": numeroExcel(r.perEttaro),
      "Prodotto principale": r.prodotto || "", "Quantità": numeroExcel(r.quantita), "Unità di misura": r.unita || "",
      "Costo per unità in euro": numeroExcel(r.costoUnitario), "Resa per ettaro": numeroExcel(r.resa),
      "Unità della resa": unitaPerEttaro(r.unita), "Nota": r.nota || "",
    }));
    const voci = righe.flatMap(r => r.voci.map(v => ({
      "Numero del campo": r.numero, "Campo": r.campo, "Coltura": r.coltura,
      "Tipo di voce": v.tipo || "", "Descrizione": v.descrizione || "", "Fornitore": v.fornitore || "",
      "Documento": v.documento || "", "Data del documento": v.data ? formattaDataItaliana(v.data) : "",
      "Quantità attribuita": numeroExcel(v.quantita), "Unità di misura": v.unita || "",
      "Prezzo unitario in euro": v.prezzo != null ? Math.round(v.prezzo * 10000) / 10000 : null,
      "Importo attribuito in euro": numeroExcel(v.importo),
    })));
    esportaExcel(`Schede_Campo_${campagna.replace("/", "_")}`, [
      { nome: `Schede ${campagna.replace("/", "-")}`, righe: principali },
      { nome: "Voci di costo", righe: voci },
      ...righeRegistro(righe.map(r => registro[r.id]).filter(Boolean)),
    ]);
  }

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Lettura delle schede campo...</div>;
  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;

  return (
    <div style={{ padding: 20, maxWidth: 1500, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Schede Campi</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
        Le schede campo registrate nell'app Podere Verde: per ogni campo e coltura i lavori fatti, i costi e il raccolto. Cliccare su una riga per vedere le lavorazioni eseguite, le semine, le raccolte e le voci di costo.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
        <label style={stileEtichetta}>Campagna
          <select value={campagna} onChange={e => { setCampagna(e.target.value); setAperte(new Set()); }} style={stileSelect}>
            {campagne.map(cp => <option key={cp} value={cp}>{cp}{inCorso(cp) ? " (in corso)" : ""}</option>)}
          </select>
        </label>
        <label style={stileEtichetta}>Cerca
          <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="campo, coltura, prodotto" style={{ ...stileSelect, width: 220 }} />
        </label>
        <button onClick={esporta} style={{ marginLeft: "auto", height: 38, padding: "0 16px", border: "none", borderRadius: 8, background: C.primary, color: "#fff", fontSize: 13, fontWeight: 700 }}>Esporta Excel</button>
      </div>

      {inCorso(campagna) && (
        <div style={{ background: C.yellow + "1A", borderLeft: `4px solid ${C.yellow}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 14 }}>
          Campagna {campagna} in corso: le colture sono registrate, i costi e le raccolte arriveranno con i lavori.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
        {[["Colture", String(righe.length)], ["Costo totale", formattaEuro(tot.totale)], ["Seme", formattaEuro(tot.seme)],
          ["Concimi e fitosanitari", formattaEuro(tot.concime + tot.fitosanitari)], ["Lavorazioni e altro", formattaEuro(tot.lavorazioniEuro + tot.altro)]].map(([l, v]) => (
          <div key={l} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px" }}>
            <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700 }}>{l}</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: C.primary }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: C.primary, color: "#fff" }}>
              <th style={{ ...th, textAlign: "left" }}>Campo</th>
              <th style={{ ...th, textAlign: "left" }}>Coltura</th>
              <th style={th}>Ettari della coltura</th>
              <th style={th}>Seme</th><th style={th}>Concimi e fitosanitari</th><th style={th}>Lavorazioni e altro</th>
              <th style={th}>Totale</th><th style={th}>Euro per ettaro</th>
              <th style={{ ...th, textAlign: "left" }}>Raccolto</th>
              <th style={th}>Costo per unità</th><th style={th}>Resa per ettaro</th>
            </tr>
          </thead>
          <tbody>
            {righe.map(r => {
              const open = aperte.has(r.id);
              return [
                <tr key={r.id} onClick={() => apri(r.id)} style={{ cursor: "pointer", background: open ? "#EEF3EF" : undefined }}>
                  <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}>
                    <span style={{ color: C.muted, marginRight: 4 }}>{open ? "▾" : "▸"}</span><b>{r.numero}</b> — {r.campo}
                  </td>
                  <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}>
                    {r.coltura}{r.ordine > 1 && <Badge testo="seconda coltura" colore={C.accent} />}
                    {r.poliennale && <Badge testo="poliennale" colore={C.blue} />}
                    {r.pascolato && !inCorso(campagna) && <Badge testo="pascolato" colore={C.green} />}
                  </td>
                  <td style={td}>{q(r.ettari)}{r.ettariCampo != null && r.ettari != null && Math.abs(r.ettariCampo - r.ettari) > 0.001 &&
                    <div style={{ fontSize: 10.5, color: C.muted }}>campo {q(r.ettariCampo)}</div>}</td>
                  <td style={td}>{eu(r.seme)}</td>
                  <td style={td}>{eu(r.concime + r.fitosanitari)}</td>
                  <td style={td}>{eu(r.lavorazioniEuro + r.altro)}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{eu(r.totale)}</td>
                  <td style={td}>{r.perEttaro ? formattaEuro(r.perEttaro) : "—"}</td>
                  <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}>
                    {r.prodotto ? <>{r.prodotto}: <b>{q(r.quantita)} {r.unita}</b></> : <span style={{ color: C.muted }}>{r.pascolato ? "pascolato, nessuna raccolta" : "nessuna raccolta registrata"}</span>}
                  </td>
                  <td style={td}>{r.costoUnitario ? <>{formattaEuro(r.costoUnitario)}<div style={{ fontSize: 10.5, color: C.muted }}>{perUnita(r.unita)}</div></> : "—"}</td>
                  <td style={td}>{r.resa ? <>{q(r.resa)}<div style={{ fontSize: 10.5, color: C.muted }}>{unitaPerEttaro(r.unita)}</div></> : "—"}</td>
                </tr>,
                open && (
                  <tr key={r.id + "-d"}>
                    <td colSpan={11} style={{ padding: "10px 14px 14px 30px", background: "#FAFAF7", borderTop: `1px solid ${C.border}` }}>
                      <ColtDettaglioLavori c={registro[r.id]} />
                      {r.nota && <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}><b>Nota:</b> {r.nota}</div>}
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: C.accent, margin: "10px 0 4px", textTransform: "uppercase", letterSpacing: 0.3 }}>Voci di costo</div>
                      {r.voci.length > 0 ? (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "#fff", border: `1px solid ${C.border}` }}>
                          <thead><tr style={{ background: "#EEF3EF", color: C.primary }}>
                            {["Tipo di voce", "Descrizione", "Fornitore", "Documento", "Data"].map(h => <th key={h} style={{ ...th, textAlign: "left" }}>{h}</th>)}
                            {["Quantità attribuita", "Prezzo unitario", "Importo attribuito"].map(h => <th key={h} style={th}>{h}</th>)}
                          </tr></thead>
                          <tbody>{r.voci.map((v, i) => (
                            <tr key={i}>
                              <td style={{ ...td, textAlign: "left" }}>{v.tipo}</td>
                              <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}>{v.descrizione}</td>
                              <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}>{v.fornitore || "—"}</td>
                              <td style={{ ...td, textAlign: "left" }}>{v.documento || "—"}</td>
                              <td style={{ ...td, textAlign: "left" }}>{v.data ? formattaDataItaliana(v.data) : "—"}</td>
                              <td style={td}>{q(v.quantita)} {v.unita || ""}</td>
                              <td style={td}>{v.prezzo != null ? formattaEuro(v.prezzo, v.prezzo < 10 ? 4 : 2) : "—"}</td>
                              <td style={{ ...td, fontWeight: 700 }}>{formattaEuro(v.importo)}</td>
                            </tr>))}
                            <tr><td colSpan={7} style={{ ...td, textAlign: "left", fontWeight: 700 }}>Totale delle voci</td>
                              <td style={{ ...td, fontWeight: 800 }}>{formattaEuro(r.voci.reduce((s, v) => s + v.importo, 0))}</td></tr>
                          </tbody>
                        </table>
                      ) : <div style={{ fontSize: 12, color: C.muted }}>Nessuna voce di costo attribuita.</div>}
                    </td>
                  </tr>
                ),
              ];
            })}
            <tr style={{ borderTop: `2px solid ${C.primary}`, background: "#E7EFE8" }}>
              <td colSpan={3} style={{ ...td, textAlign: "left", fontWeight: 800, color: C.primary }}>TOTALE CAMPAGNA {campagna}</td>
              <td style={{ ...td, fontWeight: 800 }}>{formattaEuro(tot.seme)}</td>
              <td style={{ ...td, fontWeight: 800 }}>{formattaEuro(tot.concime + tot.fitosanitari)}</td>
              <td style={{ ...td, fontWeight: 800 }}>{formattaEuro(tot.lavorazioniEuro + tot.altro)}</td>
              <td style={{ ...td, fontWeight: 800, color: C.primary }}>{formattaEuro(tot.totale)}</td>
              <td colSpan={4} style={td}></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
        Quando un campo è diviso tra due colture, gli ettari sono quelli della coltura (sotto, in piccolo, quelli del campo). La resa è nell'unità del raccolto (balloni, rotoballe o quintali) per ettaro.
        «Lavorazione aziendale» = lavoro fatto con i mezzi dell'azienda, valutato a tariffa, senza fattura.
      </p>
    </div>
  );
}
