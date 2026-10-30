import { oggiRoma } from "./dateRoma";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { C } from "./style";
import { formattaEuro, round2 } from "./parsingUtils";
import { btn, scheda, th, td, testata, dataIt } from "./stileAruba";
import { caricaVenditePerAnno, TIPI_VENDITA } from "./calcoloAruba";

// Versione 303 — Controllo Fatturazione Attiva e Numero Progressivo → Vendite per Anno e per Tipo.
// Anno per anno, l'imponibile delle fatture di vendita diviso in quattro colonne (decisione del Dott. Bizzarri del 26/10/2026):
// vendita animali, vendita prodotti, lavorazioni con mezzi pesanti, altro. Cliccando un importo si vedono le righe che lo formano.

export default function VenditePerAnno() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [scelta, setScelta] = useState(null); // { anno, tipo }

  useEffect(() => { caricaVenditePerAnno().then(setDati).catch(e => setErrore(e.message)); }, []);
  if (errore) return <div style={{ padding: 20, color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>;
  if (!dati) return <div style={{ padding: 20, color: C.muted }}>Lettura delle fatture…</div>;

  const totali = TIPI_VENDITA.reduce((o, t) => ({ ...o, [t.chiave]: round2(dati.anni.reduce((s, a) => s + a[t.chiave], 0)) }), {});
  const totaleGenerale = round2(dati.anni.reduce((s, a) => s + a.totale, 0));
  const righeScelte = scelta ? dati.righe.filter(r => (scelta.anno === "tutti" || r.anno === scelta.anno) && (scelta.tipo === "tutti" || r.tipo === scelta.tipo)).sort((a, b) => String(a.data).localeCompare(String(b.data))) : [];
  const nomeTipo = k => (TIPI_VENDITA.find(t => t.chiave === k) || {}).nome || "Totale";
  const cella = (anno, tipo, valore, forte) => (
    <td style={{ ...td, textAlign: "right", fontWeight: forte ? 800 : 400, cursor: "pointer", textDecoration: "underline dotted", background: scelta && scelta.anno === anno && scelta.tipo === tipo ? "#E8F0E4" : undefined }}
      onClick={() => setScelta(scelta && scelta.anno === anno && scelta.tipo === tipo ? null : { anno, tipo })}>{formattaEuro(valore)}</td>
  );

  function esporta() {
    const riepilogo = dati.anni.map(a => ({ Anno: a.anno, ...Object.fromEntries(TIPI_VENDITA.map(t => [t.nome, a[t.chiave]])), Totale: a.totale, "Numero di fatture": a.fatture }));
    const righe = dati.righe.map(r => ({ Anno: r.anno, Numero: r.numero, Data: r.data, Cliente: r.cliente, Descrizione: r.descrizione, Importo: r.importo, Destinazione: r.destinazione || "", Tipo: nomeTipo(r.tipo) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(riepilogo), "Vendite per anno");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(righe), "Righe");
    XLSX.writeFile(wb, `Vendite_per_anno_e_tipo_${oggiRoma()}.xlsx`);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1250, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ color: C.primary, fontSize: 24, margin: 0 }}>Vendite per Anno e per Tipo</h1>
        <button onClick={esporta} style={btn(false)}>📥 Esporta Excel</button>
      </div>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
        L'imponibile di tutte le fatture di vendita (registrate in contabilità ed emesse dal programma), anno per anno, diviso in quattro tipi.
        Le note di credito sono in negativo. Cliccando un importo si vedono, sotto, le righe che lo formano.
      </p>
      <div style={{ ...scheda, padding: 0, overflow: "auto" }}>
        <table>
          <thead><tr style={testata}>
            <th style={th}>Anno</th>
            {TIPI_VENDITA.map(t => <th key={t.chiave} style={{ ...th, textAlign: "right" }}>{t.nome}</th>)}
            <th style={{ ...th, textAlign: "right" }}>Totale</th><th style={{ ...th, textAlign: "right" }}>Fatture</th>
          </tr></thead>
          <tbody>
            {dati.anni.map(a => (
              <tr key={a.anno} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...td, fontWeight: 700 }}>{a.anno}</td>
                {TIPI_VENDITA.map(t => <Cella key={t.chiave} f={cella} anno={a.anno} tipo={t.chiave} valore={a[t.chiave]} />)}
                {cella(a.anno, "tutti", a.totale, true)}
                <td style={{ ...td, textAlign: "right" }}>{a.fatture}</td>
              </tr>
            ))}
            <tr style={{ borderTop: `2px solid ${C.primary}`, background: "#F3F1EA" }}>
              <td style={{ ...td, fontWeight: 800 }}>Tutti gli anni</td>
              {TIPI_VENDITA.map(t => <Cella key={t.chiave} f={cella} anno="tutti" tipo={t.chiave} valore={totali[t.chiave]} forte />)}
              {cella("tutti", "tutti", totaleGenerale, true)}
              <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{dati.anni.reduce((s, a) => s + a.fatture, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {dati.anni.some(a => Math.abs(a.totale - a.imponibileFatture) > 0.005) && (
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          {dati.anni.filter(a => Math.abs(a.totale - a.imponibileFatture) > 0.005).map(a => `Nel ${a.anno} la somma delle righe differisce di ${formattaEuro(round2(a.totale - a.imponibileFatture))} dall'imponibile delle fatture (arrotondamenti nelle righe della fattura).`).join(" ")}
        </div>
      )}
      {scelta && (
        <div style={scheda}>
          <div style={{ fontWeight: 800, color: C.primary, marginBottom: 8 }}>
            {nomeTipo(scelta.tipo)} — {scelta.anno === "tutti" ? "tutti gli anni" : scelta.anno}: {righeScelte.length} righe, {formattaEuro(round2(righeScelte.reduce((s, r) => s + (r.importo || 0), 0)))}
            <button onClick={() => setScelta(null)} style={{ ...btn(false), height: 26, padding: "0 8px", fontSize: 11.5, marginLeft: 10 }}>Chiudi</button>
          </div>
          <table style={{ fontSize: 12 }}>
            <thead><tr style={{ color: C.muted }}><th style={th}>Numero</th><th style={th}>Data</th><th style={th}>Cliente</th><th style={th}>Descrizione</th><th style={th}>Destinazione</th>{scelta.tipo === "tutti" && <th style={th}>Tipo</th>}<th style={{ ...th, textAlign: "right" }}>Importo</th></tr></thead>
            <tbody>{righeScelte.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 700 }}>{r.numero}</td><td style={td}>{dataIt(r.data)}</td><td style={td}>{r.cliente}</td>
                <td style={td}>{r.descrizione}</td><td style={td}>{r.destinazione || "—"}</td>{scelta.tipo === "tutti" && <td style={td}>{nomeTipo(r.tipo)}</td>}
                <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.importo)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
        Come si assegna il tipo: <b>vendita animali</b> se la riga ha come destinazione una specie (Bovini, Suini, Ovini, Cavalli, Pollame) o parla di capi, carcasse, mezzene, quarti;
        <b> vendita prodotti</b> per salumi, carne a pezzi, pacchi e birre; <b>lavorazioni con mezzi pesanti</b> per noli a caldo (bob cat, miniescavatore, trituratore), scavi e drenaggi;
        <b> altro</b> per tutto il resto (potature, recinzioni, disserbo, manutenzioni, servizi di mantenimento degli animali di altri, fieno, rifatturazioni).
      </p>
    </div>
  );
}

function Cella({ f, anno, tipo, valore, forte }) { return f(anno, tipo, valore, forte); }
