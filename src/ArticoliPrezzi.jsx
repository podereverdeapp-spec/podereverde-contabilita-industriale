import { useState, useEffect, useMemo, Fragment } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, formattaEuro, formattaNumero } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

export default function ArticoliPrezzi() {
  const [righe, setRighe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cerca, setCerca] = useState("");
  const [espanso, setEspanso] = useState(null);

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    const { data: fatture, error: eF } = await supabase.from("ci_fatture").select("id, numero, data, fornitore_id, tipo").eq("tipo", "PASSIVA");
    if (eF) { alert(`⚠️ Errore nel caricamento fatture:\n\n${eF.message}`); setLoading(false); return; }
    const idFatture = (fatture || []).map(f => f.id);
    const mappaFatture = new Map((fatture || []).map(f => [f.id, f]));

    const { data: fornitori, error: eFo } = await supabase.from("ci_fornitori").select("id, nome");
    if (eFo) { alert(`⚠️ Errore nel caricamento fornitori:\n\n${eFo.message}`); setLoading(false); return; }
    const mappaFornitori = new Map((fornitori || []).map(f => [f.id, f.nome]));

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
      return { ...a, numero: f?.numero, data: f?.data, fornitore_id: f?.fornitore_id, fornitore: mappaFornitori.get(f?.fornitore_id) };
    }).filter(a => a.data);

    setRighe(arricchiti);
    setLoading(false);
  }

  const gruppi = useMemo(() => {
    const mappa = new Map();
    righe.forEach(r => {
      const chiave = `${(r.fornitore || "").trim().toLowerCase()}||${r.descrizione.trim().toLowerCase()}`;
      if (!mappa.has(chiave)) mappa.set(chiave, []);
      mappa.get(chiave).push(r);
    });
    return [...mappa.values()].map(righeGruppo => {
      const ordinate = righeGruppo.slice().sort((a, b) => new Date(b.data) - new Date(a.data));
      const prezzi = ordinate.map(r => r.prezzo_unitario);
      const prezziPrecedenti = ordinate.slice(1).map(r => r.prezzo_unitario); // tutti tranne il più recente
      const prezzoMassimoPrecedente = prezziPrecedenti.length > 0 ? Math.max(...prezziPrecedenti) : null;
      const prezzoRecente = ordinate[0].prezzo_unitario;
      return {
        fornitore: ordinate[0].fornitore, descrizione: ordinate[0].descrizione, unitaMisura: ordinate[0].unita_misura,
        nAcquisti: ordinate.length, prezzoMinimo: Math.min(...prezzi), prezzoMassimo: Math.max(...prezzi),
        prezzoRecente, dataRecente: ordinate[0].data, storico: ordinate,
        // Vero se il prezzo più recente uguaglia o supera il massimo di tutti gli acquisti precedenti
        prezzoRecenteERecord: prezzoMassimoPrecedente !== null && prezzoRecente >= prezzoMassimoPrecedente,
      };
    }).sort((a, b) => new Date(b.dataRecente) - new Date(a.dataRecente));
  }, [righe]);

  const filtrati = useMemo(() => {
    if (!cerca.trim()) return gruppi;
    const q = cerca.trim().toLowerCase();
    return gruppi.filter(g => `${g.fornitore} ${g.descrizione}`.toLowerCase().includes(q));
  }, [gruppi, cerca]);

  function esporta() {
    const righeExcel = filtrati.map(g => ({
      "Fornitore": g.fornitore, "Descrizione": g.descrizione, "U.M.": g.unitaMisura, "N° Acquisti": g.nAcquisti,
      "Prezzo minimo": numeroExcel(g.prezzoMinimo), "Prezzo massimo": numeroExcel(g.prezzoMassimo),
      "Prezzo più recente": numeroExcel(g.prezzoRecente), "Data più recente": g.dataRecente,
      "Nuovo massimo storico": g.prezzoRecenteERecord ? "Sì" : "No",
    }));
    const righeStorico = filtrati.flatMap(g => g.storico.map(s => ({
      "Fornitore": g.fornitore, "Descrizione": g.descrizione, "Data": s.data, "Fattura n.": s.numero,
      "Quantità": numeroExcel(s.quantita), "U.M.": s.unita_misura, "Prezzo unitario": numeroExcel(s.prezzo_unitario), "Imponibile": numeroExcel(s.totale_riga),
    })));
    esportaExcel("ArticoliPrezzi", [
      { nome: "Riepilogo", righe: righeExcel },
      { nome: "Storico completo", righe: righeStorico },
    ]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Articoli & Prezzi</h1>
        <button onClick={esporta}
          style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          📥 Esporta Excel
        </button>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Storico prezzi per articolo e fornitore, dalle fatture caricate. Clicca su una riga per vedere l'andamento nel tempo, con link a ogni fattura di origine.
      </p>

      <input placeholder="Cerca per fornitore o descrizione articolo..." value={cerca} onChange={e => setCerca(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, marginBottom: 16 }} />

      {loading ? (
        <p style={{ color: C.muted }}>Caricamento...</p>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", fontSize: 13 }}>
            <thead style={{ background: C.primary, color: "#fff" }}>
              <tr>
                <th style={th}>Fornitore</th><th style={th}>Descrizione</th><th style={th}>U.M.</th>
                <th style={{ ...th, textAlign: "right" }}>N° Acquisti</th>
                <th style={{ ...th, textAlign: "right" }}>Prezzo min</th>
                <th style={{ ...th, textAlign: "right" }}>Prezzo max</th>
                <th style={{ ...th, textAlign: "right" }}>Prezzo recente</th>
                <th style={th}>Data recente</th>
              </tr>
            </thead>
            <tbody>
              {filtrati.slice(0, 300).map((g, i) => {
                const chiave = `${g.fornitore}||${g.descrizione}`;
                const variazione = g.prezzoRecente > g.prezzoMinimo ? "up" : g.prezzoRecente < g.prezzoMassimo ? "down" : null;
                return (
                  <Fragment key={chiave}>
                    <tr key={chiave} onClick={() => setEspanso(espanso === chiave ? null : chiave)}
                      style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer", background: espanso === chiave ? C.primary + "10" : "transparent" }}>
                      <td style={td}>{g.fornitore || "—"}</td>
                      <td style={td}>{g.descrizione}</td>
                      <td style={td}>{g.unitaMisura || "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{g.nAcquisti}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(g.prezzoMinimo, 4)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(g.prezzoMassimo, 4)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, color: g.prezzoRecenteERecord ? C.red : C.text }}>
                        {formattaEuro(g.prezzoRecente, 4)}{g.prezzoRecenteERecord && " ⚠️"}
                      </td>
                      <td style={td}>{g.dataRecente}</td>
                    </tr>
                    {espanso === chiave && (
                      <tr key={chiave + "-dettaglio"}>
                        <td colSpan={8} style={{ padding: 0, background: "#FAFAF8" }}>
                          <table style={{ width: "100%", fontSize: 12 }}>
                            <thead>
                              <tr style={{ color: C.muted, textAlign: "left" }}>
                                <th style={{ padding: "6px 20px" }}>Data</th><th style={{ padding: "6px 8px" }}>Fattura n.</th>
                                <th style={{ padding: "6px 8px", textAlign: "right" }}>Quantità</th>
                                <th style={{ padding: "6px 8px", textAlign: "right" }}>Prezzo unitario</th>
                                <th style={{ padding: "6px 8px", textAlign: "right" }}>Imponibile</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.storico.map((s, j) => (
                                <tr key={j} style={{ borderTop: `1px solid ${C.border}` }}>
                                  <td style={{ padding: "6px 20px" }}>{s.data}</td>
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
      )}
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700 };
const td = { padding: "7px 10px", fontSize: 12 };
