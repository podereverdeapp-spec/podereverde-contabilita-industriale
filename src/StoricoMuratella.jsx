import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

export default function StoricoMuratella({ coloreMuratella }) {
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);
  const [anni, setAnni] = useState([]);
  const [righe, setRighe] = useState([]); // [{ area, centro, perAnno: { 2019: 100, 2020: 200, ... }, totale }]
  const [totaliPerAnno, setTotaliPerAnno] = useState({});
  const [totaleGenerale, setTotaleGenerale] = useState(0);

  useEffect(() => { carica(); }, []);

  async function carica() {
    setCaricando(true);
    setErrore(null);
    try {
      const { data: fatture, error: eF } = await supabase.from("muratella_fatture").select("id,data");
      if (eF) throw new Error(eF.message);
      const mappaAnnoFattura = new Map((fatture || []).map(f => [f.id, new Date(f.data).getFullYear()]));

      const idFatture = (fatture || []).map(f => f.id);
      let articoli = [];
      if (idFatture.length > 0) {
        const { data, error: eA } = await supabase.from("muratella_articoli_fattura")
          .select("area,centro_costo,totale_riga,fattura_id").in("fattura_id", idFatture);
        if (eA) throw new Error(eA.message);
        articoli = data || [];
      }

      const anniVisti = new Set();
      const perCentro = new Map(); // chiave "area||centro" -> { area, centro, perAnno: {}, totale }
      articoli.forEach(a => {
        const anno = mappaAnnoFattura.get(a.fattura_id);
        if (!anno) return;
        anniVisti.add(anno);
        const area = a.area || "(senza area)";
        const centro = a.centro_costo || "(senza centro di costo)";
        const chiave = `${area}||${centro}`;
        if (!perCentro.has(chiave)) perCentro.set(chiave, { area, centro, perAnno: {}, totale: 0 });
        const riga = perCentro.get(chiave);
        riga.perAnno[anno] = (riga.perAnno[anno] || 0) + (a.totale_riga || 0);
        riga.totale += a.totale_riga || 0;
      });

      const anniOrdinati = [...anniVisti].sort();
      const righeOrdinate = [...perCentro.values()].sort((a, b) => a.area.localeCompare(b.area) || b.totale - a.totale);
      const totaliAnno = {};
      anniOrdinati.forEach(anno => {
        totaliAnno[anno] = righeOrdinate.reduce((s, r) => s + (r.perAnno[anno] || 0), 0);
      });

      setAnni(anniOrdinati);
      setRighe(righeOrdinate);
      setTotaliPerAnno(totaliAnno);
      setTotaleGenerale(righeOrdinate.reduce((s, r) => s + r.totale, 0));
    } catch (err) {
      setErrore(err.message);
    }
    setCaricando(false);
  }

  function scarica() {
    const righeExcel = righe.map(r => {
      const riga = { "Area": r.area, "Centro di Costo": r.centro };
      anni.forEach(anno => { riga[String(anno)] = numeroExcel(r.perAnno[anno] || 0); });
      riga["Totale"] = numeroExcel(r.totale);
      return riga;
    });
    const rigaTotale = { "Area": "", "Centro di Costo": "TOTALE" };
    anni.forEach(anno => { rigaTotale[String(anno)] = numeroExcel(totaliPerAnno[anno] || 0); });
    rigaTotale["Totale"] = numeroExcel(totaleGenerale);
    righeExcel.push(rigaTotale);
    esportaExcel("MURATELLA_storico_per_centro_costo", [{ nome: "Muratella - Storico", righe: righeExcel }]);
  }

  return (
    <div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Costo complessivo di ogni centro di costo, anno per anno — su tutti gli anni caricati, per vedere l'andamento nel tempo.
      </p>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}
      {caricando ? <p style={{ color: C.muted }}>Caricamento...</p> : righe.length === 0 ? (
        <p style={{ color: C.muted }}>Nessun costo Muratella registrato.</p>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", minWidth: 600 + anni.length * 90 }}>
            <thead>
              <tr style={{ background: coloreMuratella, color: "#fff" }}>
                <th style={th}>Area</th>
                <th style={th}>Centro di Costo</th>
                {anni.map(anno => <th key={anno} style={{ ...th, textAlign: "right" }}>{anno}</th>)}
                <th style={{ ...th, textAlign: "right" }}>Totale</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td}>{r.area}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{r.centro}</td>
                  {anni.map(anno => (
                    <td key={anno} style={{ ...td, textAlign: "right", color: r.perAnno[anno] ? C.text : C.muted }}>
                      {r.perAnno[anno] ? formattaEuro(r.perAnno[anno]) : "—"}
                    </td>
                  ))}
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(r.totale)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: `2px solid ${coloreMuratella}`, fontWeight: 700, background: C.bg }}>
                <td style={td}></td>
                <td style={td}>Totale</td>
                {anni.map(anno => (
                  <td key={anno} style={{ ...td, textAlign: "right" }}>{formattaEuro(totaliPerAnno[anno] || 0)}</td>
                ))}
                <td style={{ ...td, textAlign: "right" }}>{formattaEuro(totaleGenerale)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {righe.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button onClick={scarica}
            style={{ background: coloreMuratella, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            📥 Scarica Excel (MURATELLA)
          </button>
        </div>
      )}
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11 };
const td = { padding: "8px 10px" };
