import { useState, useEffect, useMemo, Fragment } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, formattaEuro, formattaNumero } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

// Normalizzazione nome prodotto: minuscolo, spazi multipli ridotti a uno, tolti gli spazi
// ai bordi — così "MANGIME BOVINI" e "Mangime  Bovini" finiscono nello stesso gruppo.
function normalizzaNomeProdotto(descrizione) {
  return (descrizione || "").trim().toLowerCase().replace(/\s+/g, " ");
}

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

export default function ArticoliPrezzi() {
  const [righe, setRighe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cerca, setCerca] = useState("");
  const [filtroControparte, setFiltroControparte] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("tutte"); // "tutte" | "PASSIVA" | "ATTIVA"
  const [espanso, setEspanso] = useState(null);
  const [grafico, setGrafico] = useState(null); // chiave prodotto per cui mostrare il grafico

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    const { data: fatture, error: eF } = await supabase.from("ci_fatture").select("id, numero, data, tipo, fornitore_id, cliente_id");
    if (eF) { alert(`⚠️ Errore nel caricamento fatture:\n\n${eF.message}`); setLoading(false); return; }
    const mappaFatture = new Map((fatture || []).map(f => [f.id, f]));
    const idFatture = (fatture || []).map(f => f.id);

    const { data: fornitori } = await supabase.from("ci_fornitori").select("id, nome");
    const { data: clienti } = await supabase.from("ci_clienti").select("id, nome");
    const mappaFornitori = new Map((fornitori || []).map(f => [f.id, f.nome]));
    const mappaClienti = new Map((clienti || []).map(c => [c.id, c.nome]));

    let articoli = [];
    if (idFatture.length > 0) {
      const { data, error } = await supabase
        .from("ci_articoli_fattura").select("descrizione, quantita, unita_misura, prezzo_unitario, totale_riga, fattura_id")
        .in("fattura_id", idFatture).gt("prezzo_unitario", 0);
      if (error) { alert(`⚠️ Errore nel caricamento articoli:\n\n${error.message}`); setLoading(false); return; }
      articoli = numerizzaCampi(data || [], ["quantita", "prezzo_unitario", "totale_riga"]);
    }

    const arricchiti = articoli.map(a => {
      const f = mappaFatture.get(a.fattura_id);
      if (!f) return null;
      const controparte = f.tipo === "ATTIVA" ? mappaClienti.get(f.cliente_id) : mappaFornitori.get(f.fornitore_id);
      return { ...a, numero: f.numero, data: f.data, tipo: f.tipo, controparte };
    }).filter(a => a && a.data);

    setRighe(arricchiti);
    setLoading(false);
  }

  const righeFiltrateTipo = useMemo(() => {
    return righe.filter(r => filtroTipo === "tutte" || r.tipo === filtroTipo);
  }, [righe, filtroTipo]);

  const gruppi = useMemo(() => {
    const mappa = new Map();
    righeFiltrateTipo.forEach(r => {
      const chiave = normalizzaNomeProdotto(r.descrizione);
      if (!mappa.has(chiave)) mappa.set(chiave, []);
      mappa.get(chiave).push(r);
    });
    return [...mappa.values()].map(righeGruppo => {
      const ordinate = righeGruppo.slice().sort((a, b) => new Date(b.data) - new Date(a.data));
      const prezzi = ordinate.map(r => r.prezzo_unitario);
      const prezzoMedio = round2(prezzi.reduce((s, p) => s + p, 0) / prezzi.length);
      const prezziPrecedenti = ordinate.slice(1).map(r => r.prezzo_unitario);
      const prezzoMassimoPrecedente = prezziPrecedenti.length > 0 ? Math.max(...prezziPrecedenti) : null;
      const prezzoRecente = ordinate[0].prezzo_unitario;
      const scostamentoPct = prezzoMedio > 0 ? round2((prezzoRecente - prezzoMedio) / prezzoMedio * 100) : 0;
      return {
        descrizione: ordinate[0].descrizione, unitaMisura: ordinate[0].unita_misura,
        controparti: [...new Set(ordinate.map(r => r.controparte).filter(Boolean))],
        nAcquisti: ordinate.length, prezzoMinimo: Math.min(...prezzi), prezzoMassimo: Math.max(...prezzi), prezzoMedio,
        prezzoRecente, scostamentoPct, dataRecente: ordinate[0].data, storico: ordinate,
        prezzoRecenteERecord: prezzoMassimoPrecedente !== null && prezzoRecente >= prezzoMassimoPrecedente,
      };
    }).sort((a, b) => new Date(b.dataRecente) - new Date(a.dataRecente));
  }, [righeFiltrateTipo]);

  const filtrati = useMemo(() => {
    let ris = gruppi;
    if (cerca.trim()) {
      const q = cerca.trim().toLowerCase();
      ris = ris.filter(g => g.descrizione.toLowerCase().includes(q));
    }
    if (filtroControparte.trim()) {
      const q = filtroControparte.trim().toLowerCase();
      ris = ris.filter(g => g.controparti.some(c => c.toLowerCase().includes(q)));
    }
    return ris;
  }, [gruppi, cerca, filtroControparte]);

  function esporta() {
    const righeExcel = filtrati.map(g => ({
      "Descrizione": g.descrizione, "U.M.": g.unitaMisura, "Controparti": g.controparti.join(", "), "N° Acquisti": g.nAcquisti,
      "Prezzo minimo": numeroExcel(g.prezzoMinimo), "Prezzo medio": numeroExcel(g.prezzoMedio), "Prezzo massimo": numeroExcel(g.prezzoMassimo),
      "Prezzo più recente": numeroExcel(g.prezzoRecente), "Scostamento % dalla media": numeroExcel(g.scostamentoPct), "Data più recente": g.dataRecente,
      "Nuovo massimo storico": g.prezzoRecenteERecord ? "Sì" : "No",
    }));
    const righeStorico = filtrati.flatMap(g => g.storico.map(s => ({
      "Descrizione": g.descrizione, "Tipo": s.tipo, "Controparte": s.controparte, "Data": s.data, "Fattura n.": s.numero,
      "Quantità": numeroExcel(s.quantita), "U.M.": s.unita_misura, "Prezzo unitario": numeroExcel(s.prezzo_unitario), "Imponibile": numeroExcel(s.totale_riga),
    })));
    esportaExcel("ArticoliPrezzi", [
      { nome: "Riepilogo", righe: righeExcel },
      { nome: "Storico completo", righe: righeStorico },
    ]);
  }

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Caricamento...</div>;

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Articoli & Prezzi</h1>
        <button onClick={esporta}
          style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          📥 Esporta Excel
        </button>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Storico prezzi per prodotto (acquisti e vendite), confrontabile tra fornitori/clienti diversi. Clicca sullo scostamento % per vedere il grafico dell'andamento nel tempo.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input placeholder="Cerca per descrizione articolo..." value={cerca} onChange={e => setCerca(e.target.value)}
          style={{ flex: 2, minWidth: 200, boxSizing: "border-box", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14 }} />
        <input placeholder="Filtra per fornitore/cliente..." value={filtroControparte} onChange={e => setFiltroControparte(e.target.value)}
          style={{ flex: 1, minWidth: 160, boxSizing: "border-box", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14 }} />
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14 }}>
          <option value="tutte">Acquisti e vendite</option>
          <option value="PASSIVA">Solo acquisti</option>
          <option value="ATTIVA">Solo vendite</option>
        </select>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: 13 }}>
          <thead style={{ background: C.primary, color: "#fff" }}>
            <tr>
              <th style={th}>Descrizione</th><th style={th}>Controparti</th><th style={th}>U.M.</th>
              <th style={{ ...th, textAlign: "right" }}>N° Acq.</th>
              <th style={{ ...th, textAlign: "right" }}>Prezzo min</th>
              <th style={{ ...th, textAlign: "right" }}>Prezzo medio</th>
              <th style={{ ...th, textAlign: "right" }}>Prezzo max</th>
              <th style={{ ...th, textAlign: "right" }}>Prezzo recente</th>
              <th style={{ ...th, textAlign: "right" }}>Scost. % media</th>
              <th style={th}>Data recente</th>
            </tr>
          </thead>
          <tbody>
            {filtrati.slice(0, 300).map((g, i) => {
              const chiave = g.descrizione + i;
              return (
                <Fragment key={chiave}>
                  <tr onClick={() => setEspanso(espanso === chiave ? null : chiave)}
                    style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer", background: espanso === chiave ? C.primary + "10" : "transparent" }}>
                    <td style={td}>{g.descrizione}</td>
                    <td style={{ ...td, fontSize: 11, color: C.muted }}>{g.controparti.slice(0, 2).join(", ")}{g.controparti.length > 2 && ` +${g.controparti.length - 2}`}</td>
                    <td style={td}>{g.unitaMisura || "—"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{g.nAcquisti}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(g.prezzoMinimo, 4)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(g.prezzoMedio, 4)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(g.prezzoMassimo, 4)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: g.prezzoRecenteERecord ? C.red : C.text }}>
                      {formattaEuro(g.prezzoRecente, 4)}{g.prezzoRecenteERecord && " ⚠️"}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: g.scostamentoPct > 0 ? C.red : g.scostamentoPct < 0 ? C.green : C.muted, cursor: "pointer", textDecoration: "underline" }}
                      onClick={e => { e.stopPropagation(); setGrafico(grafico === chiave ? null : chiave); }}>
                      {g.scostamentoPct > 0 ? "▲" : g.scostamentoPct < 0 ? "▼" : ""} {formattaNumero(g.scostamentoPct, 1)}%
                    </td>
                    <td style={td}>{g.dataRecente}</td>
                  </tr>

                  {grafico === chiave && (
                    <tr>
                      <td colSpan={10} style={{ padding: 0, background: "#FAFAF8" }}>
                        <GraficoPrezzo storico={g.storico} prezzoMedio={g.prezzoMedio} />
                      </td>
                    </tr>
                  )}

                  {espanso === chiave && (
                    <tr>
                      <td colSpan={10} style={{ padding: 0, background: "#FAFAF8" }}>
                        <table style={{ width: "100%", fontSize: 12 }}>
                          <thead>
                            <tr style={{ color: C.muted, textAlign: "left" }}>
                              <th style={{ padding: "6px 20px" }}>Data</th><th style={{ padding: "6px 8px" }}>Tipo</th>
                              <th style={{ padding: "6px 8px" }}>Controparte</th><th style={{ padding: "6px 8px" }}>Fattura n.</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>Quantità</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>Prezzo unitario</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>Imponibile</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.storico.map((s, j) => (
                              <tr key={j} style={{ borderTop: `1px solid ${C.border}` }}>
                                <td style={{ padding: "6px 20px" }}>{s.data}</td>
                                <td style={{ padding: "6px 8px" }}>{s.tipo === "ATTIVA" ? "Vendita" : "Acquisto"}</td>
                                <td style={{ padding: "6px 8px" }}>{s.controparte || "—"}</td>
                                <td style={{ padding: "6px 8px" }}>{s.numero}</td>
                                <td style={{ padding: "6px 8px", textAlign: "right" }}>{formattaNumero(s.quantita, 2)} {s.unita_misura || ""}</td>
                                <td style={{ padding: "6px 8px", textAlign: "right" }}>{formattaEuro(s.prezzo_unitario, 4)}</td>
                                <td style={{ padding: "6px 8px", textAlign: "right" }}>{formattaEuro(s.totale_riga)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {filtrati.length > 300 && <div style={{ padding: 10, textAlign: "center", color: C.muted, fontSize: 12 }}>... e altri {filtrati.length - 300} articoli — affina la ricerca per vederli</div>}
        {filtrati.length === 0 && <p style={{ padding: 16, color: C.muted }}>Nessun articolo trovato.</p>}
      </div>
    </div>
  );
}

// Grafico lineare semplice in SVG puro (nessuna libreria esterna) per l'andamento del prezzo nel tempo
function GraficoPrezzo({ storico, prezzoMedio }) {
  const punti = storico.slice().sort((a, b) => new Date(a.data) - new Date(b.data));
  if (punti.length < 2) return <div style={{ padding: 16, color: C.muted, fontSize: 12 }}>Servono almeno 2 acquisti per tracciare un andamento.</div>;

  const W = 700, H = 200, PAD = 40;
  const prezzi = punti.map(p => p.prezzo_unitario);
  const min = Math.min(...prezzi, prezzoMedio), max = Math.max(...prezzi, prezzoMedio);
  const range = max - min || 1;
  const x = i => PAD + (i / (punti.length - 1)) * (W - 2 * PAD);
  const y = v => H - PAD - ((v - min) / range) * (H - 2 * PAD);

  const linea = punti.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.prezzo_unitario)}`).join(" ");
  const yMedia = y(prezzoMedio);

  return (
    <div style={{ padding: 16 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 700, height: "auto" }}>
        <line x1={PAD} y1={yMedia} x2={W - PAD} y2={yMedia} stroke={C.muted} strokeDasharray="4 4" strokeWidth="1" />
        <text x={W - PAD} y={yMedia - 6} fontSize="11" fill={C.muted} textAnchor="end">media {formattaEuro(prezzoMedio, 4)}</text>
        <path d={linea} fill="none" stroke={C.primary} strokeWidth="2" />
        {punti.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.prezzo_unitario)} r="4" fill={C.primary} />
        ))}
        {punti.map((p, i) => (
          <text key={"l" + i} x={x(i)} y={H - PAD + 18} fontSize="10" fill={C.muted} textAnchor="middle">
            {p.data.slice(5)}
          </text>
        ))}
      </svg>
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700 };
const td = { padding: "7px 10px", fontSize: 12 };
