import { useEffect, useState } from "react";
import { C } from "./style";
import { formattaEuro } from "./parsingUtils";
import { btn, scheda, titolo, th, td, testata, chip, dataIt } from "./stileAruba";
import { quandoItaliano, contaUsciteDaFatturare } from "./calcoloEmissioneFatture";
import { caricaControlli } from "./calcoloAruba";

// Versione 300 — Controllo Fatturazione Attiva e Numero Progressivo → Controlli e Allarmi.
// Tre controlli (decisione del Dott. Bizzarri del 26/10/2026: per ora solo capi usciti e fatture del programma):
// 1. capi usciti pronti da fatturare e non ancora fatturati;
// 2. fatture emesse dal programma che nell'ultima lettura di Aruba non c'erano;
// 3. fatture con stato di Aruba «scartata» o «non consegnata», e differenze tra programma e Aruba.

export default function ControlloFatturazioneAttiva({ onNavigate }) {
  const [dati, setDati] = useState(null);
  const [capi, setCapi] = useState(null);
  const [errore, setErrore] = useState(null);

  async function carica() {
    setErrore(null);
    try {
      const [c, u] = await Promise.all([caricaControlli(), contaUsciteDaFatturare().catch(() => 0)]);
      setDati(c); setCapi(u);
    } catch (e) { setErrore(e.message); }
  }
  useEffect(() => { carica(); }, []);

  if (errore) return <div style={{ padding: 20, color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>;
  if (!dati) return <div style={{ padding: 20, color: C.muted }}>Controllo in corso…</div>;

  const nCapi = capi || 0;
  const tutto = nCapi + dati.nonInAruba.length + dati.problemi.length + dati.differenze.length;

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ color: C.primary, fontSize: 24, margin: 0 }}>Controlli e Allarmi della Fatturazione Attiva</h1>
        <button onClick={carica} style={btn(false)}>↻ Aggiorna</button>
      </div>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
        Controlla che ogni capo uscito sia fatturato e che ogni fattura emessa dal programma sia arrivata in Aruba e sia stata consegnata.
        Il controllo sulle fatture vale fino all'ultima lettura di Aruba: dopo aver caricato in Aruba nuove fatture va rifatta la lettura
        («Prompt per Claude: Fatture Emesse in Aruba», poi «Leggi le Fatture di Aruba»).
      </p>
      <div style={{ ...scheda, borderLeft: `6px solid ${tutto ? C.red : C.green}` }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: tutto ? C.red : C.green }}>{tutto ? `🔔 ${tutto} ${tutto === 1 ? "cosa da fare" : "cose da fare"}` : "✅ Nessun allarme"}</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
          {dati.lettura ? <>Ultima lettura di Aruba: <b>{quandoItaliano(dati.lettura.letta_il)}</b> ({dati.lettura.fatture_lette} fatture, anni {dati.lettura.anni}).</> : <b style={{ color: C.red }}>Aruba non è ancora mai stato letto: il controllo delle fatture non è possibile.</b>}
        </div>
      </div>

      <div style={scheda}>
        <div style={titolo}>1. Capi usciti da fatturare <span style={chip(nCapi ? C.red : C.green)}>{nCapi}</span></div>
        {nCapi ? (
          <div style={{ fontSize: 13 }}>
            Ci sono capi usciti per la macellazione, pronti o da completare, non ancora in una fattura emessa.
            {onNavigate && <button onClick={() => onNavigate("fatt-animali-da-fatturare")} style={{ ...btn(false), marginLeft: 10 }}>Vai alle uscite da fatturare →</button>}
          </div>
        ) : <div style={{ fontSize: 13, color: C.green }}>Nessun capo uscito da fatturare.</div>}
      </div>

      <div style={scheda}>
        <div style={titolo}>2. Fatture emesse dal programma non trovate in Aruba <span style={chip(dati.nonInAruba.length ? C.red : C.green)}>{dati.nonInAruba.length}</span></div>
        {dati.nonInAruba.length ? (
          <table>
            <thead><tr style={testata}><th style={th}>Numero</th><th style={th}>Data</th><th style={th}>Cliente</th><th style={{ ...th, textAlign: "right" }}>Totale</th><th style={th}>Mandata all'amministrazione</th><th style={th}>Che cosa fare</th></tr></thead>
            <tbody>{dati.nonInAruba.map(f => {
              const dopo = dati.lettura && String(f.data) > String(dati.lettura.letta_il).slice(0, 10);
              return (
                <tr key={f.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ ...td, fontWeight: 700 }}>{f.numero}</td><td style={td}>{dataIt(f.data)}</td><td style={td}>{f.cliente_denominazione}</td>
                  <td style={{ ...td, textAlign: "right" }}>{formattaEuro(f.totale)}</td>
                  <td style={{ ...td, color: f.inviata_amministrazione_il ? C.text : C.red, fontWeight: f.inviata_amministrazione_il ? 400 : 700 }}>{f.inviata_amministrazione_il ? `✉️ ${quandoItaliano(f.inviata_amministrazione_il)}` : "non ancora"}</td>
                  <td style={td}>{!f.inviata_amministrazione_il ? "Mandarla all'amministrazione con «✉️ Invia» in «Fatture Emesse»." : !dati.lettura ? "Fare la prima lettura di Aruba." : dopo ? "Emessa dopo l'ultima lettura: rifare la lettura di Aruba." : "Chiedere all'amministrazione se è stata caricata in Aruba."}</td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : <div style={{ fontSize: 13, color: C.green }}>Tutte le fatture emesse dal programma sono in Aruba.</div>}
      </div>

      <div style={scheda}>
        <div style={titolo}>3. Fatture scartate o con differenze <span style={chip(dati.problemi.length + dati.differenze.length ? C.red : C.green)}>{dati.problemi.length + dati.differenze.length}</span></div>
        {dati.problemi.map((f, i) => <div key={"p" + i} style={{ fontSize: 13, marginBottom: 4 }}>🔴 <b>{f.numero}</b> del {dataIt(f.data)} — {f.cliente}, {formattaEuro(f.totale)}: in Aruba lo stato è «{f.stato}». Correggere e rifare la fattura (o nota di credito).</div>)}
        {dati.differenze.map(f => <div key={"d" + f.id} style={{ fontSize: 13, marginBottom: 4 }}>🟠 <b>{f.numero}</b> del {dataIt(f.data)} — {f.cliente_denominazione}: {f.differenza_aruba}.</div>)}
        {!dati.problemi.length && !dati.differenze.length && <div style={{ fontSize: 13, color: C.green }}>Nessuna fattura scartata e nessuna differenza tra programma e Aruba.</div>}
      </div>
    </div>
  );
}
