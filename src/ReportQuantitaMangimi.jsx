import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro, formattaNumero, fetchAllPages, round2 } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

const CENTRO_COSTO = "Mangimi";

export default function ReportQuantitaMangimi() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [righe, setRighe] = useState(null);
  const [nonArmonizzate, setNonArmonizzate] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { calcola(); }, []);

  async function calcola() {
    setLoading(true);
    setRighe(null);
    try {
      const inizioAnno = `${anno}-01-01`, fineAnno = `${anno}-12-31`;
      const { data: fatture, error: eF } = await fetchAllPages((da, a) => supabase
        .from("ci_fatture").select("id, fornitore_id").eq("tipo", "PASSIVA").gte("data", inizioAnno).lte("data", fineAnno).range(da, a));
      if (eF) throw new Error(eF.message);
      const idFatture = (fatture || []).map(f => f.id);
      const mappaFattureFornitore = new Map((fatture || []).map(f => [f.id, f.fornitore_id]));

      let righeArticolo = [];
      if (idFatture.length > 0) {
        const { data, error } = await fetchAllPages((da, a) => supabase
          .from("ci_articoli_fattura").select("fattura_id, descrizione, quantita, totale_riga, destinazione, centro_costo")
          .in("fattura_id", idFatture).eq("centro_costo", CENTRO_COSTO).range(da, a));
        if (error) throw new Error(error.message);
        righeArticolo = data || [];
      }

      const { data: fornitori } = await supabase.from("ci_fornitori").select("id, nome");
      const mappaFornitori = new Map((fornitori || []).map(f => [f.id, f.nome]));

      const { data: regole } = await supabase.from("ci_regole_armonizzazione_unita").select("*").eq("centro_costo", CENTRO_COSTO);
      const mappaRegole = new Map((regole || []).map(r => [`${r.fornitore_id}|${r.descrizione_prodotto.trim().toLowerCase()}`, r]));

      const gruppi = new Map();
      const senzaRegola = new Map();

      righeArticolo.forEach(r => {
        const fornitoreId = mappaFattureFornitore.get(r.fattura_id);
        if (!fornitoreId) return;
        const chiaveRegola = `${fornitoreId}|${r.descrizione.trim().toLowerCase()}`;
        const regola = mappaRegole.get(chiaveRegola);

        if (!regola || !regola.fattore_kg) {
          const chiaveSR = chiaveRegola;
          if (!senzaRegola.has(chiaveSR)) senzaRegola.set(chiaveSR, { fornitore: mappaFornitori.get(fornitoreId) || "—", descrizione: r.descrizione, count: 0 });
          senzaRegola.get(chiaveSR).count++;
          return;
        }

        const quantitaKg = (r.quantita || 0) * regola.fattore_kg;
        const chiave = `${fornitoreId}|${r.descrizione.trim().toLowerCase()}|${r.destinazione || "—"}`;
        if (!gruppi.has(chiave)) {
          gruppi.set(chiave, {
            fornitore: mappaFornitori.get(fornitoreId) || "—", descrizione: r.descrizione,
            destinazione: r.destinazione || "—", costoAnno: 0, quantitaKg: 0,
          });
        }
        const g = gruppi.get(chiave);
        g.costoAnno = round2(g.costoAnno + (r.totale_riga || 0));
        g.quantitaKg = round2(g.quantitaKg + quantitaKg);
      });

      const risultato = [...gruppi.values()].map(g => ({ ...g, quantitaTons: round2(g.quantitaKg / 1000) }));
      risultato.sort((a, b) => a.fornitore.localeCompare(b.fornitore) || a.descrizione.localeCompare(b.descrizione));
      setRighe(risultato);
      setNonArmonizzate([...senzaRegola.values()]);
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
    esportaExcel(`ReportMangimi_${anno}`, [{ nome: "Report Mangimi", righe: righeExcel }]);
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
        </>
      )}
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700 };
const td = { padding: "7px 10px", fontSize: 12 };
