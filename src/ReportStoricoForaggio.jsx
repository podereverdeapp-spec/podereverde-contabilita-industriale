import { useState, Fragment } from "react";
import { C } from "./style";
import { calcolaDatiForaggioAnno } from "./calcoloQuantitaMangimi";
import { formattaEuro, formattaNumero } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import GraficoAndamento from "./GraficoAndamento";

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

// Stesso pattern di ReportStorico.jsx (Report Costi): unisce i dati di 4 anni per prodotto,
// restituendo per ognuno i 4 valori annuali + la media. Prodotti assenti in un anno valgono 0.
function unisciPerProdotto(datiPerAnno, specie) {
  const tuttiProdotti = [...new Set(datiPerAnno.flatMap(d => d.perProdotto.map(p => p.descrizione)))];
  return tuttiProdotti.map(descrizione => {
    const valoriPerAnno = datiPerAnno.map(d => {
      const p = d.perProdotto.find(x => x.descrizione === descrizione);
      if (!p) return { quantita: 0, costo: 0, euroUba: 0, kgUba: 0 };
      return {
        quantita: p.perKg.perSpecie[specie].costoAllocato,
        costo: p.perCosto.perSpecie[specie].costoAllocato,
        euroUba: p.perCosto.perSpecie[specie].incidenza,
        kgUba: p.perKg.perSpecie[specie].incidenza,
      };
    });
    const media = {};
    ["quantita", "costo", "euroUba", "kgUba"].forEach(campo => {
      media[campo] = round2(valoriPerAnno.reduce((s, v) => s + (v[campo] || 0), 0) / valoriPerAnno.length);
    });
    return { descrizione, valoriPerAnno, media };
  }).sort((a, b) => a.descrizione.localeCompare(b.descrizione));
}

export default function ReportStoricoForaggio({ specieFiltro, titolo }) {
  const [annoBase, setAnnoBase] = useState(new Date().getFullYear());
  const [calcolando, setCalcolando] = useState(false);
  const [righe, setRighe] = useState(null);
  const [totaliPerAnno, setTotaliPerAnno] = useState(null);

  const anni = [annoBase, annoBase - 1, annoBase - 2, annoBase - 3];

  async function calcola() {
    setCalcolando(true);
    setRighe(null);
    try {
      const datiPerAnno = await Promise.all(anni.map(a => calcolaDatiForaggioAnno(a).catch(() => ({ perProdotto: [] }))));
      const righeUnite = unisciPerProdotto(datiPerAnno, specieFiltro);
      setRighe(righeUnite);
      setTotaliPerAnno(anni.map((a, i) => ({
        anno: a,
        euroUba: round2(righeUnite.reduce((s, r) => s + r.valoriPerAnno[i].euroUba, 0)),
        kgUba: round2(righeUnite.reduce((s, r) => s + r.valoriPerAnno[i].kgUba, 0)),
      })));
    } catch (err) {
      alert(`⚠️ Errore nel calcolo storico:\n\n${err.message}`);
    }
    setCalcolando(false);
  }

  function esporta() {
    const righeExcel = righe.map(r => {
      const riga = { "Prodotto": r.descrizione };
      anni.forEach((a, i) => {
        riga[`Quantità kg ${a}`] = numeroExcel(r.valoriPerAnno[i].quantita);
        riga[`Costo ${a}`] = numeroExcel(r.valoriPerAnno[i].costo);
        riga[`€/UBA-gg ${a}`] = numeroExcel(r.valoriPerAnno[i].euroUba);
        riga[`kg/UBA-gg ${a}`] = numeroExcel(r.valoriPerAnno[i].kgUba);
      });
      riga["Quantità kg Media"] = numeroExcel(r.media.quantita);
      riga["Costo Media"] = numeroExcel(r.media.costo);
      riga["€/UBA-gg Media"] = numeroExcel(r.media.euroUba);
      riga["kg/UBA-gg Media"] = numeroExcel(r.media.kgUba);
      return riga;
    });
    const rigaTotale = { "Prodotto": "TOTALE €/UBA-gg e kg/UBA-gg" };
    anni.forEach(a => {
      rigaTotale[`€/UBA-gg ${a}`] = numeroExcel(righe.reduce((s, r) => s + r.valoriPerAnno[anni.indexOf(a)].euroUba, 0));
      rigaTotale[`kg/UBA-gg ${a}`] = numeroExcel(righe.reduce((s, r) => s + r.valoriPerAnno[anni.indexOf(a)].kgUba, 0));
    });
    rigaTotale["€/UBA-gg Media"] = numeroExcel(righe.reduce((s, r) => s + r.media.euroUba, 0));
    rigaTotale["kg/UBA-gg Media"] = numeroExcel(righe.reduce((s, r) => s + r.media.kgUba, 0));
    righeExcel.push(rigaTotale);
    esportaExcel(`StoricoForaggio_${titolo}_${annoBase}`, [{ nome: `Storico ${titolo}`, righe: righeExcel }]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Storico Foraggio — {titolo}</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Confronto tra l'anno scelto e i 3 precedenti, con la media dei 4, per ogni prodotto — quantità, costo, €/UBA-giorno e kg/UBA-giorno per {titolo}.
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, padding: 16, borderRadius: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Anno più recente del confronto</label>
            <input type="number" value={annoBase} onChange={e => setAnnoBase(parseInt(e.target.value))}
              style={{ padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, width: 100 }} />
          </div>
          <button onClick={calcola} disabled={calcolando}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {calcolando ? "Calcolo (4 anni)..." : "📊 Calcola confronto"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Confronta {anni.slice().reverse().join(", ")} — gli anni non ancora caricati mostreranno semplicemente 0.</div>
      </div>

      {totaliPerAnno && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ flex: 1, minWidth: 300, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 4 }}>€/UBA-gg totale — andamento</div>
            <GraficoAndamento punti={totaliPerAnno.map(t => ({ anno: t.anno, valore: t.euroUba }))} decimaliValore={3} />
          </div>
          <div style={{ flex: 1, minWidth: 300, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 4 }}>kg/UBA-gg totale — andamento</div>
            <GraficoAndamento punti={totaliPerAnno.map(t => ({ anno: t.anno, valore: t.kgUba }))} decimaliValore={3} />
          </div>
        </div>
      )}

      {righe && (
        <>
          <button onClick={esporta}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 16 }}>
            📥 Esporta Excel
          </button>
          {righe.length === 0 ? <p style={{ color: C.muted }}>Nessun dato.</p> : (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead style={{ background: C.primary, color: "#fff" }}>
                  <tr>
                    <th style={th} rowSpan={2}>Prodotto</th>
                    {anni.map((a, i) => <th key={a} style={{ ...th, borderLeft: i === 0 ? undefined : "1px solid #ffffff55" }} colSpan={4}>{a}</th>)}
                    <th style={{ ...th, borderLeft: "1px solid #ffffff55" }} colSpan={4}>Media 4 anni</th>
                  </tr>
                  <tr>
                    {anni.map(a => <Fragment key={a}>
                      <th style={th}>Quantità kg</th><th style={th}>Costo</th><th style={th}>€/UBA-gg</th><th style={th}>kg/UBA-gg</th>
                    </Fragment>)}
                    <th style={th}>Quantità kg</th><th style={th}>Costo</th><th style={th}>€/UBA-gg</th><th style={th}>kg/UBA-gg</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map(r => (
                    <tr key={r.descrizione} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ ...td, fontWeight: 700 }}>{r.descrizione}</td>
                      {r.valoriPerAnno.map((v, i) => (
                        <Fragment key={i}>
                          <td style={{ ...td, textAlign: "right" }}>{formattaNumero(v.quantita, 0)}</td>
                          <td style={{ ...td, textAlign: "right" }}>{formattaEuro(v.costo)}</td>
                          <td style={{ ...td, textAlign: "right" }}>{formattaNumero(v.euroUba, 4)}</td>
                          <td style={{ ...td, textAlign: "right" }}>{formattaNumero(v.kgUba, 4)}</td>
                        </Fragment>
                      ))}
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaNumero(r.media.quantita, 0)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(r.media.costo)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaNumero(r.media.euroUba, 4)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaNumero(r.media.kgUba, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ background: C.primary + "15", padding: "10px 8px", display: "flex", fontSize: 11, borderTop: `2px solid ${C.primary}` }}>
                <div style={{ flex: 1.3, fontWeight: 700, color: C.primary, paddingLeft: 8 }}>TOTALE €/UBA-gg e kg/UBA-gg</div>
                {anni.map((a, i) => (
                  <Fragment key={a}>
                    <div style={{ flex: 1, textAlign: "right" }}>—</div>
                    <div style={{ flex: 1, textAlign: "right" }}>—</div>
                    <div style={{ flex: 1, textAlign: "right", fontWeight: 700 }}>{formattaNumero(righe.reduce((s, r) => s + r.valoriPerAnno[i].euroUba, 0), 4)}</div>
                    <div style={{ flex: 1, textAlign: "right", fontWeight: 700 }}>{formattaNumero(righe.reduce((s, r) => s + r.valoriPerAnno[i].kgUba, 0), 4)}</div>
                  </Fragment>
                ))}
                <div style={{ flex: 1, textAlign: "right" }}>—</div>
                <div style={{ flex: 1, textAlign: "right" }}>—</div>
                <div style={{ flex: 1, textAlign: "right", fontWeight: 700 }}>{formattaNumero(righe.reduce((s, r) => s + r.media.euroUba, 0), 4)}</div>
                <div style={{ flex: 1, textAlign: "right", fontWeight: 700 }}>{formattaNumero(righe.reduce((s, r) => s + r.media.kgUba, 0), 4)}</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const th = { padding: "6px 8px", textAlign: "center", fontSize: 10, fontWeight: 700 };
const td = { padding: "5px 8px", fontSize: 11 };
