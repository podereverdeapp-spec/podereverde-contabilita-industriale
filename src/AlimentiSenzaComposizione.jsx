// Versione 320 (28/10/2026, ordine del Dott. Bizzarri): Alimentaria → «Alimenti senza composizione».
// Gli alimenti acquistati (dalle fatture) che non hanno la composizione, o l'hanno incompleta o stimata.
// Senza composizione l'alimento non entra nel calcolo delle razioni né nel confronto tra razioni e acquisti.
// L'avviso ⚠️ resta finché lo stato non diventa «Ricevuta».
import { useState, useEffect } from "react";
import { C } from "./style";
import { formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { caricaAlimentiSenzaComposizione, aggiornaStatoComposizione, aggiornaNotaComposizione, STATI_COMPOSIZIONE } from "./calcoloAlimentiSenzaComposizione";

const dataIt = d => (d ? d.split("-").reverse().join("/") : "—");
const COLORE_STATO = { "Da chiedere": C.red, "Richiesta inviata": C.yellow, "Ricevuta": C.green };
const SEZIONI = [
  { chiave: "Mancante", titolo: "1. Composizione mancante: va chiesta al fornitore" },
  { chiave: "Incompleta o stimata", titolo: "2. Composizione incompleta o stimata" },
];
const th = { padding: "7px 8px", textAlign: "left", background: C.primary, color: "#fff", fontWeight: 700, verticalAlign: "bottom" };
const td = { padding: "7px 8px", verticalAlign: "top", borderBottom: `1px solid ${C.border}` };

export default function AlimentiSenzaComposizione({ onAggiorna }) {
  const [righe, setRighe] = useState(null);
  const [errore, setErrore] = useState(null);
  const [mostraRicevute, setMostraRicevute] = useState(false);
  const [salvataggio, setSalvataggio] = useState(null);

  async function carica() {
    try { setRighe(await caricaAlimentiSenzaComposizione()); setErrore(null); }
    catch (e) { setErrore(e.message); setRighe([]); }
  }
  useEffect(() => { carica(); }, []);

  async function cambiaStato(r, stato) {
    setSalvataggio(r.id);
    try { await aggiornaStatoComposizione(r.id, stato); await carica(); if (onAggiorna) onAggiorna(); }
    catch (e) { setErrore(e.message); }
    setSalvataggio(null);
  }
  async function salvaNota(r, nota) {
    if ((nota || "") === (r.nota || "")) return;
    try { await aggiornaNotaComposizione(r.id, nota.trim()); await carica(); }
    catch (e) { setErrore(e.message); }
  }

  function esporta() {
    esportaExcel("Alimenti_senza_composizione", [{
      nome: "Alimenti senza composizione",
      righe: (righe || []).map(r => ({
        "Numero": r.ordine, "Sezione": r.sezione, "Alimento": r.alimento, "Fornitore": r.fornitore, "Contatto del fornitore": r.contatto,
        "Specie in fattura": r.specie, "Righe di fattura": r.righe_fattura, "Primo acquisto": dataIt(r.primo_acquisto), "Ultimo acquisto": dataIt(r.ultimo_acquisto),
        "Euro": numeroExcel(r.euro), "Già nell'anagrafe": r.in_anagrafe ? "Sì" : "No", "Composizione": r.composizione, "Cosa chiedere o dove trovarla": r.cosa_chiedere,
        "Stato": r.stato, "Data della richiesta": dataIt(r.data_richiesta), "Data di ricezione": dataIt(r.data_ricezione), "Nota": r.nota || "",
      })),
    }]);
  }

  if (righe === null) return <div style={{ padding: 24, color: C.muted }}>Caricamento…</div>;

  const tabellaMancante = errore && /ci_alimenti_senza_composizione/.test(errore) && righe.length === 0;
  const aperte = righe.filter(r => r.stato !== "Ricevuta");
  const euroAperte = aperte.reduce((s, r) => s + Number(r.euro || 0), 0);
  const perStato = STATI_COMPOSIZIONE.map(s => ({ stato: s, n: righe.filter(r => r.stato === s).length }));

  return (
    <div style={{ padding: 24, maxWidth: 1500 }}>
      <h2 style={{ margin: "0 0 6px", color: C.primary }}>⚠️ Alimenti senza composizione</h2>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, maxWidth: 980 }}>
        Gli alimenti comprati con le fatture che non hanno la composizione (o l'hanno incompleta o stimata). Finché manca la composizione
        l'alimento non può entrare nel calcolo delle razioni né nel confronto tra razioni e acquisti. Per ognuno: a chi chiederla e che cosa chiedere.
        Quando la richiesta parte si mette lo stato «Richiesta inviata»; quando la composizione arriva, «Ricevuta»: l'alimento esce dall'avviso
        e la composizione va inserita nell'anagrafe degli alimenti.
      </div>

      {tabellaMancante && (
        <div style={{ background: "#FFF4D6", border: `2px solid ${C.yellow}`, color: "#6B5200", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          ⚠️ Il database non ha ancora la tabella della versione 320: lanciare il file <b>contabilita_strutture_v320.sql</b>.
        </div>
      )}
      {errore && !tabellaMancante && <div style={{ color: C.red, marginBottom: 12, fontSize: 13 }}>Errore: {errore}</div>}

      {!tabellaMancante && (
        <>
          {aperte.length > 0 ? (
            <div style={{ background: "#FBE1DE", border: `2px solid ${C.red}`, color: "#8B1E14", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13.5, fontWeight: 700 }}>
              ⚠️ {aperte.length === 1 ? "1 alimento acquistato è" : `${aperte.length} alimenti acquistati sono`} senza composizione completa,
              per {formattaEuro(euroAperte)} di acquisti.
            </div>
          ) : (
            <div style={{ background: "#E6F2E8", border: `2px solid ${C.green}`, color: "#1E5631", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13.5, fontWeight: 700 }}>
              ✓ Tutte le composizioni sono state ricevute.
            </div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14, fontSize: 13 }}>
            {perStato.map(s => (
              <span key={s.stato} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${COLORE_STATO[s.stato]}`, borderRadius: 6, padding: "5px 10px" }}>
                {s.stato}: <b>{s.n}</b>
              </span>
            ))}
            <label style={{ marginLeft: 8, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={mostraRicevute} onChange={e => setMostraRicevute(e.target.checked)} /> Mostra anche quelle ricevute
            </label>
            <button onClick={esporta} style={{ marginLeft: "auto", background: C.primary, color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontWeight: 700 }}>Esporta in Excel</button>
          </div>

          {SEZIONI.map(sez => {
            const tutte = righe.filter(r => r.sezione === sez.chiave);
            const visibili = tutte.filter(r => mostraRicevute || r.stato !== "Ricevuta");
            const totale = visibili.reduce((s, r) => s + Number(r.euro || 0), 0);
            return (
              <div key={sez.chiave} style={{ marginBottom: 26 }}>
                <h3 style={{ color: C.primary, margin: "0 0 8px", fontSize: 15 }}>{sez.titolo}</h3>
                <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  <table style={{ fontSize: 12.5, background: C.card, minWidth: 1350 }}>
                    <thead><tr>
                      {["Numero", "Alimento", "Stato della richiesta", "Euro", "Specie in fattura", "Periodo degli acquisti", "Righe di fattura", "Fornitore", "Contatto del fornitore", "Già nell'anagrafe", "Composizione", "Cosa chiedere o dove trovarla", "Nota"].map(h => <th key={h} style={th}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {visibili.map(r => (
                        <tr key={r.id} style={{ opacity: r.stato === "Ricevuta" ? 0.55 : 1 }}>
                          <td style={td}>{r.stato !== "Ricevuta" ? "⚠️ " : "✓ "}{r.ordine}</td>
                          <td style={{ ...td, fontWeight: 700, minWidth: 220 }}>{r.alimento}</td>
                          <td style={{ ...td, minWidth: 150 }}>
                            <select value={r.stato} disabled={salvataggio === r.id} onChange={e => cambiaStato(r, e.target.value)}
                              style={{ border: `2px solid ${COLORE_STATO[r.stato]}`, borderRadius: 6, padding: "3px 6px", fontSize: 12.5, fontWeight: 700 }}>
                              {STATI_COMPOSIZIONE.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {r.data_richiesta && <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>Richiesta: {dataIt(r.data_richiesta)}</div>}
                            {r.data_ricezione && <div style={{ color: C.muted, fontSize: 11 }}>Ricevuta: {dataIt(r.data_ricezione)}</div>}
                          </td>
                          <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{formattaEuro(Number(r.euro || 0))}</td>
                          <td style={td}>{r.specie}</td>
                          <td style={{ ...td, whiteSpace: "nowrap" }}>{dataIt(r.primo_acquisto)}{r.ultimo_acquisto && r.ultimo_acquisto !== r.primo_acquisto ? ` – ${dataIt(r.ultimo_acquisto)}` : ""}</td>
                          <td style={{ ...td, textAlign: "right" }}>{r.righe_fattura}</td>
                          <td style={{ ...td, minWidth: 150 }}>{r.fornitore}</td>
                          <td style={{ ...td, minWidth: 150, wordBreak: "break-word" }}>{r.contatto}</td>
                          <td style={td}>{r.in_anagrafe ? "Sì" : "No"}</td>
                          <td style={{ ...td, minWidth: 160, color: r.composizione === "Mancante" ? C.red : "#8A6100" }}>{r.composizione}</td>
                          <td style={{ ...td, minWidth: 230 }}>{r.cosa_chiedere}</td>
                          <td style={{ ...td, minWidth: 170 }}>
                            <input defaultValue={r.nota || ""} placeholder="Scrivi una nota" onBlur={e => salvaNota(r, e.target.value)}
                              style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 6px", fontSize: 12 }} />
                          </td>
                        </tr>
                      ))}
                      {visibili.length === 0 && <tr><td colSpan={13} style={{ ...td, color: C.muted }}>Nessun alimento da mostrare.</td></tr>}
                      {visibili.length > 0 && (
                        <tr style={{ background: "#EEF5EC", fontWeight: 800 }}>
                          <td style={td}></td><td style={td}>Totale ({visibili.length})</td><td style={td}></td>
                          <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{formattaEuro(totale)}</td><td style={td} colSpan={2}></td>
                          <td style={{ ...td, textAlign: "right" }}>{visibili.reduce((s, r) => s + (r.righe_fattura || 0), 0)}</td><td style={td} colSpan={6}></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          <div style={{ color: C.muted, fontSize: 12, maxWidth: 980 }}>
            Gli importi sono imponibili, senza IVA, calcolati sulle fatture al 28/10/2026. Non sono in lista le materie prime semplici
            (farina di girasole proteica, avena, farinaccio di frumento duro, paglia): la loro composizione si prende dalle tabelle.
          </div>
        </>
      )}
    </div>
  );
}
