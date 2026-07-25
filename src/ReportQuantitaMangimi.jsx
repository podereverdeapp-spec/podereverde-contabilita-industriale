import { useState, useEffect } from "react";
import { C } from "./style";
import { formattaEuro, formattaNumero } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { calcolaDatiMangimiAnno } from "./calcoloQuantitaMangimi";

export default function ReportQuantitaMangimi() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [righe, setRighe] = useState(null);
  const [perProdotto, setPerProdotto] = useState(null);
  const [nonArmonizzate, setNonArmonizzate] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { calcola(); }, []);

  async function calcola() {
    setLoading(true);
    setRighe(null);
    try {
      const dati = await calcolaDatiMangimiAnno(anno);
      setRighe(dati.righe);
      setPerProdotto(dati.perProdotto);
      setNonArmonizzate(dati.nonArmonizzate);
    } catch (err) {
      alert(`⚠️ Errore nel calcolo:\n\n${err.message}`);
    }
    setLoading(false);
  }

  function esporta() {
    const righeExcel = righe.map(r => ({
      "Fornitore": r.fornitore, "Prodotto": r.descrizione, "Destinazione": r.destinazione,
      "Costo anno": numeroExcel(r.costoAnno), "Quantità (Tonnellate)": numeroExcel(r.quantitaTons), "Quantità (Kilogrammi)": numeroExcel(r.quantitaKg),
    }));
    const righeProdottoExcel = (perProdotto || []).map(p => ({
      "Prodotto": p.descrizione,
      "Bovini €/UBA-gg": numeroExcel(p.perCosto.perSpecie.bovino.incidenza), "Bovini kg/UBA-gg": numeroExcel(p.perKg.perSpecie.bovino.incidenza),
      "Suini €/UBA-gg": numeroExcel(p.perCosto.perSpecie.suino.incidenza), "Suini kg/UBA-gg": numeroExcel(p.perKg.perSpecie.suino.incidenza),
      "Ovini €/UBA-gg": numeroExcel(p.perCosto.perSpecie.ovino.incidenza), "Ovini kg/UBA-gg": numeroExcel(p.perKg.perSpecie.ovino.incidenza),
    }));
    if (perProdotto && perProdotto.length > 0) {
      righeProdottoExcel.push({
        "Prodotto": "TOTALE (somma di tutti i mangimi)",
        "Bovini €/UBA-gg": numeroExcel(perProdotto.reduce((s, p) => s + p.perCosto.perSpecie.bovino.incidenza, 0)),
        "Bovini kg/UBA-gg": numeroExcel(perProdotto.reduce((s, p) => s + p.perKg.perSpecie.bovino.incidenza, 0)),
        "Suini €/UBA-gg": numeroExcel(perProdotto.reduce((s, p) => s + p.perCosto.perSpecie.suino.incidenza, 0)),
        "Suini kg/UBA-gg": numeroExcel(perProdotto.reduce((s, p) => s + p.perKg.perSpecie.suino.incidenza, 0)),
        "Ovini €/UBA-gg": numeroExcel(perProdotto.reduce((s, p) => s + p.perCosto.perSpecie.ovino.incidenza, 0)),
        "Ovini kg/UBA-gg": numeroExcel(perProdotto.reduce((s, p) => s + p.perKg.perSpecie.ovino.incidenza, 0)),
      });
    }
    esportaExcel(`ReportMangimi_${anno}`, [
      { nome: "Report Mangimi", righe: righeExcel },
      { nome: "Per Prodotto - UBA", righe: righeProdottoExcel },
    ]);
  }

  const totaleCosto = righe ? righe.reduce((s, r) => s + r.costoAnno, 0) : 0;
  const totaleKg = righe ? righe.reduce((s, r) => s + r.quantitaKg, 0) : 0;

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Report Quantità — Mangimi</h1>
        {righe && righe.length > 0 && (
          <button onClick={esporta}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            📥 Esporta Excel
          </button>
        )}
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Per fornitore e prodotto: costo dell'anno, quantità in tonnellate e kilogrammi, destinazione (specie). Solo i prodotti già armonizzati (vedi "Da Armonizzare") entrano nel calcolo.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <label style={{ fontSize: 13, color: C.muted }}>Anno:</label>
        <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
          style={{ width: 100, padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
        <button onClick={calcola} disabled={loading}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "Calcolo..." : "Calcola"}
        </button>
      </div>

      {nonArmonizzate.length > 0 && (
        <div style={{ background: "#FFF7E6", border: `1.5px solid ${C.yellow}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: "#8B6F00", marginBottom: 6 }}>
            ⚖️ {nonArmonizzate.length} prodotti esclusi dal totale perché senza unità di misura confermata
          </div>
          <div style={{ fontSize: 12, color: C.text }}>
            {nonArmonizzate.map((n, i) => (
              <div key={i}>{n.fornitore} — {n.descrizione} ({n.count} righe)</div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#8B6F00", marginTop: 8 }}>
            Vai in "Da Armonizzare" per confermare l'unità di misura di questi prodotti, poi ricalcola questo report.
          </div>
        </div>
      )}

      {loading ? <p style={{ color: C.muted }}>Calcolo in corso...</p> : righe && (
        <>
          <p style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>
            {righe.length} combinazioni fornitore/prodotto/destinazione — totale {formattaEuro(totaleCosto)}, {formattaNumero(totaleKg, 0)} kg ({formattaNumero(totaleKg / 1000, 2)} t)
          </p>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", fontSize: 13 }}>
              <thead style={{ background: C.primary, color: "#fff" }}>
                <tr>
                  <th style={th}>Fornitore</th><th style={th}>Prodotto</th><th style={th}>Destinazione</th>
                  <th style={{ ...th, textAlign: "right" }}>Costo anno</th>
                  <th style={{ ...th, textAlign: "right" }}>Tonnellate</th>
                  <th style={{ ...th, textAlign: "right" }}>Kilogrammi</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td}>{r.fornitore}</td>
                    <td style={td}>{r.descrizione}</td>
                    <td style={td}>{r.destinazione}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.costoAnno)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaNumero(r.quantitaTons, 3)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaNumero(r.quantitaKg, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {righe.length === 0 && <p style={{ padding: 16, color: C.muted }}>Nessun dato armonizzato per questo anno.</p>}
          </div>

          {perProdotto && perProdotto.length > 0 && (
            <>
              <h2 style={{ color: C.primary, fontSize: 18, marginTop: 28, marginBottom: 4 }}>Per prodotto — €/UBA-giorno e kg/UBA-giorno</h2>
              <p style={{ color: C.muted, fontSize: 12, marginTop: 0, marginBottom: 12 }}>
                Ogni prodotto sommato su tutti i fornitori. I costi/quantità con destinazione "Generali" sono ripartiti su Bovini/Suini/Ovini in proporzione ai loro UBA-giorni (stessa regola già usata in Report Costi) — non restano un blocco unico. "Suini" include anche i suinetti ancora nei lotti.
              </p>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                <table style={{ width: "100%", fontSize: 12 }}>
                  <thead style={{ background: C.primary, color: "#fff" }}>
                    <tr>
                      <th style={th} rowSpan={2}>Prodotto</th>
                      <th style={{ ...th, textAlign: "center" }} colSpan={2}>Bovini</th>
                      <th style={{ ...th, textAlign: "center" }} colSpan={2}>Suini</th>
                      <th style={{ ...th, textAlign: "center" }} colSpan={2}>Ovini</th>
                    </tr>
                    <tr>
                      <th style={{ ...th, textAlign: "right" }}>€/UBA-gg</th><th style={{ ...th, textAlign: "right" }}>kg/UBA-gg</th>
                      <th style={{ ...th, textAlign: "right" }}>€/UBA-gg</th><th style={{ ...th, textAlign: "right" }}>kg/UBA-gg</th>
                      <th style={{ ...th, textAlign: "right" }}>€/UBA-gg</th><th style={{ ...th, textAlign: "right" }}>kg/UBA-gg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perProdotto.map((p, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={td}>{p.descrizione}</td>
                        <td style={{ ...td, textAlign: "right" }}>{formattaNumero(p.perCosto.perSpecie.bovino.incidenza, 4)}</td>
                        <td style={{ ...td, textAlign: "right" }}>{formattaNumero(p.perKg.perSpecie.bovino.incidenza, 4)}</td>
                        <td style={{ ...td, textAlign: "right" }}>{formattaNumero(p.perCosto.perSpecie.suino.incidenza, 4)}</td>
                        <td style={{ ...td, textAlign: "right" }}>{formattaNumero(p.perKg.perSpecie.suino.incidenza, 4)}</td>
                        <td style={{ ...td, textAlign: "right" }}>{formattaNumero(p.perCosto.perSpecie.ovino.incidenza, 4)}</td>
                        <td style={{ ...td, textAlign: "right" }}>{formattaNumero(p.perKg.perSpecie.ovino.incidenza, 4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ background: C.primary + "15", borderRadius: 10, padding: "10px 16px", marginTop: 8, display: "flex", fontSize: 12 }}>
                <div style={{ flex: 1.7, fontWeight: 700, color: C.primary }}>TOTALE (somma di tutti i mangimi)</div>
                <div style={{ flex: 1, textAlign: "right", fontWeight: 700 }}>{formattaNumero(perProdotto.reduce((s, p) => s + p.perCosto.perSpecie.bovino.incidenza, 0), 4)}</div>
                <div style={{ flex: 1, textAlign: "right", fontWeight: 700 }}>{formattaNumero(perProdotto.reduce((s, p) => s + p.perKg.perSpecie.bovino.incidenza, 0), 4)}</div>
                <div style={{ flex: 1, textAlign: "right", fontWeight: 700 }}>{formattaNumero(perProdotto.reduce((s, p) => s + p.perCosto.perSpecie.suino.incidenza, 0), 4)}</div>
                <div style={{ flex: 1, textAlign: "right", fontWeight: 700 }}>{formattaNumero(perProdotto.reduce((s, p) => s + p.perKg.perSpecie.suino.incidenza, 0), 4)}</div>
                <div style={{ flex: 1, textAlign: "right", fontWeight: 700 }}>{formattaNumero(perProdotto.reduce((s, p) => s + p.perCosto.perSpecie.ovino.incidenza, 0), 4)}</div>
                <div style={{ flex: 1, textAlign: "right", fontWeight: 700 }}>{formattaNumero(perProdotto.reduce((s, p) => s + p.perKg.perSpecie.ovino.incidenza, 0), 4)}</div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700 };
const td = { padding: "7px 10px", fontSize: 12 };
