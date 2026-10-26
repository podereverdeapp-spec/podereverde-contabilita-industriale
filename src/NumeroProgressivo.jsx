import { useEffect, useState } from "react";
import { C } from "./style";
import { btn, scheda, th, td, testata, chip, dataIt } from "./stileAruba";
import { quandoItaliano, caricaNumeroProposto, caricaCedente, componiNumero } from "./calcoloEmissioneFatture";
import { caricaNumeri, PREFISSO_PRINCIPALE } from "./calcoloAruba";

// Versione 300 — Controllo Fatturazione Attiva e Numero Progressivo → Numero Progressivo.
// Per ogni anno: ultimo numero usato (contabilità, fatture lette da Aruba, fatture del programma), numeri mancanti e doppi,
// ultimo numero trovato in Aruba all'ultima lettura e numero che il programma propone per la prossima fattura.

export default function NumeroProgressivo() {
  const [dati, setDati] = useState(null);
  const [proposto, setProposto] = useState(null);
  const [errore, setErrore] = useState(null);
  const [aperto, setAperto] = useState(null);
  const annoCorrente = new Date().getFullYear();

  async function carica() {
    setErrore(null);
    try {
      const [d, n, ced] = await Promise.all([caricaNumeri(), caricaNumeroProposto(), caricaCedente()]);
      setDati(d); setProposto(n ? componiNumero(ced?.prefissoNumero || PREFISSO_PRINCIPALE, n, annoCorrente) : null);
    } catch (e) { setErrore(e.message); }
  }
  useEffect(() => { carica(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (errore) return <div style={{ padding: 20, color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>;
  if (!dati) return <div style={{ padding: 20, color: C.muted }}>Lettura dei numeri…</div>;
  const corrente = dati.anni.find(a => a.anno === annoCorrente && a.prefisso === PREFISSO_PRINCIPALE);
  const arubaVecchio = corrente?.arubaAnno && corrente.arubaAnno.n < corrente.ultimo.n;

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ color: C.primary, fontSize: 24, margin: 0 }}>Numero Progressivo delle Fatture di Vendita</h1>
        <button onClick={carica} style={btn(false)}>↻ Aggiorna</button>
      </div>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
        La numerazione «{PREFISSO_PRINCIPALE} n/aa» è una sola per tutte le fatture di vendita di Podere Verde, emesse dal programma o in Aruba, e ricomincia da 1 ogni anno.
        Il programma propone da solo il numero successivo al più alto dell'anno, tra le fatture registrate in contabilità (anche quelle lette da Aruba) e quelle emesse dal programma.
      </p>
      <div style={{ ...scheda, borderLeft: `6px solid ${C.green}` }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.primary }}>Prossimo numero proposto: <span style={{ fontSize: 20 }}>{proposto || "—"}</span></div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
          {corrente ? <>Ultimo numero del {annoCorrente}: <b>{corrente.ultimo.numero}</b> del {dataIt(corrente.ultimo.data)} ({corrente.ultimo.fonte}). </> : `Nessuna fattura nel ${annoCorrente}. `}
          {dati.lettura ? <>Ultima lettura di Aruba: {quandoItaliano(dati.lettura.letta_il)}{corrente?.arubaAnno ? `, ultimo numero trovato in Aruba ${corrente.arubaAnno.numero}` : ""}.</> : <b style={{ color: C.red }}>Aruba non è ancora mai stato letto: il numero proposto si basa solo sulle fatture del programma e della contabilità.</b>}
        </div>
        {arubaVecchio && <div style={{ fontSize: 12.5, color: "#8B5A00", fontWeight: 700, marginTop: 4 }}>Dopo l'ultima lettura di Aruba sono state emesse altre fatture: prima di usare un numero a mano conviene rifare la lettura.</div>}
      </div>

      <div style={{ ...scheda, padding: 0, overflow: "auto" }}>
        <table>
          <thead><tr style={testata}><th style={th}>Anno</th><th style={th}>Sequenza</th><th style={{ ...th, textAlign: "right" }}>Documenti</th><th style={th}>Ultimo numero</th><th style={th}>Ultimo in Aruba</th><th style={th}>Numeri mancanti</th><th style={th}>Numeri doppi</th><th style={th}></th></tr></thead>
          <tbody>{dati.anni.map(a => {
            const k = `${a.anno}|${a.prefisso}`;
            return [
              <tr key={k} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...td, fontWeight: 700 }}>{a.anno}</td><td style={td}>{a.prefisso}</td><td style={{ ...td, textAlign: "right" }}>{a.quante}</td>
                <td style={{ ...td, fontWeight: 700 }}>{a.ultimo.numero} <span style={{ fontWeight: 400, color: C.muted }}>del {dataIt(a.ultimo.data)}</span></td>
                <td style={td}>{a.arubaAnno ? a.arubaAnno.numero : "—"}</td>
                <td style={{ ...td, color: a.mancanti.length ? C.red : C.green, fontWeight: 700 }}>{a.mancanti.length ? a.mancanti.join(", ") : "nessuno"}</td>
                <td style={{ ...td, color: a.doppi.length ? C.red : C.green, fontWeight: 700 }}>{a.doppi.length ? a.doppi.join(", ") : "nessuno"}</td>
                <td style={td}><button onClick={() => setAperto(aperto === k ? null : k)} style={{ ...btn(false), height: 26, padding: "0 8px", fontSize: 11.5 }}>{aperto === k ? "▾ Chiudi" : "▸ Vedi"}</button></td>
              </tr>,
              aperto === k && (
                <tr key={k + "e"}><td colSpan={8} style={{ padding: "0 10px 10px 30px", background: "#FAF9F5" }}>
                  {a.elenco.map((e, i) => <span key={i} style={chip(e.fonte.includes("non ancora") ? C.red : C.primary, false)}>{e.numero} · {dataIt(e.data)} · {e.tipo} · {e.fonte}</span>)}
                </td></tr>
              ),
            ];
          })}</tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: C.muted }}>
        Un numero mancante può essere una fattura emessa in Aruba e non ancora letta, oppure un numero saltato: va controllato in Aruba prima di emettere altre fatture.
        Un numero doppio va corretto subito: due fatture dello stesso anno non possono avere lo stesso numero.
      </p>
    </div>
  );
}
