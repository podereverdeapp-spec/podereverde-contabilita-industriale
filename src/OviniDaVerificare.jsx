// Versione 323 (28/10/2026, ordine del Dott. Bizzarri): Animali → «Ovini da verificare con Sborchia».
// I punti del registro degli ovini da chiarire con il direttore dell'azienda: che cosa non torna, i parti
// (che fine hanno fatto gli agnelli: abbacchi, agnelloni, rimonta), le pecore vive e le domande generali.
// Servono al confronto tra razioni e acquisti degli ovini. L'avviso ⚠️ resta finché un punto è «Da verificare».
import { useState, useEffect } from "react";
import { C } from "./style";
import { esportaExcel } from "./esportaExcel";
import { caricaVerificheAnimali, aggiornaVerificaAnimale, STATI_VERIFICA, SEZIONI_VERIFICA } from "./calcoloVerificheAnimali";

const dataIt = d => (d ? d.split("-").reverse().join("/") : "");
const th = { padding: "7px 8px", textAlign: "left", background: C.primary, color: "#fff", fontWeight: 700, verticalAlign: "bottom" };
const td = { padding: "6px 8px", verticalAlign: "top", borderBottom: `1px solid ${C.border}` };
const campo = { width: "100%", border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 6px", fontSize: 12 };
const TITOLI = {
  "Che cosa non torna": "1. Che cosa non torna nel registro",
  "Parti": "2. I parti registrati: che fine hanno fatto gli agnelli",
  "Pecore vive": "3. Le pecore vive nel registro: parti mancanti o altre correzioni",
  "Domande": "4. Domande generali",
};

export default function OviniDaVerificare({ onAggiorna }) {
  const [righe, setRighe] = useState(null);
  const [errore, setErrore] = useState(null);
  const [mostraVerificati, setMostraVerificati] = useState(true);
  const [salvataggio, setSalvataggio] = useState(null);

  async function carica() {
    try { setRighe(await caricaVerificheAnimali("ovino")); setErrore(null); }
    catch (e) { setErrore(e.message); setRighe([]); }
  }
  useEffect(() => { carica(); }, []);

  async function salva(r, campi) {
    const cambiato = Object.keys(campi).some(k => (campi[k] ?? null) !== (r[k] ?? null));
    if (!cambiato) return;
    setSalvataggio(r.id);
    try { await aggiornaVerificaAnimale(r.id, campi); await carica(); if (campi.stato && onAggiorna) onAggiorna(); }
    catch (e) { setErrore(e.message); }
    setSalvataggio(null);
  }
  const numero = v => (v === "" || v == null ? null : Math.max(0, parseInt(v, 10) || 0));

  function esporta() {
    esportaExcel("Ovini_da_verificare_con_Sborchia", SEZIONI_VERIFICA.map(s => ({
      nome: s,
      righe: (righe || []).filter(r => r.sezione === s).map(r => ({
        "Numero": r.ordine, "Capo": r.capo || "", "Che cosa": r.descrizione,
        ...(s === "Parti" ? { "Abbacchi": r.abbacchi, "Agnelloni": r.agnelloni, "Inizio ingrasso": dataIt(r.inizio_ingrasso), "Fine ingrasso": dataIt(r.fine_ingrasso), "Rimonta (marca)": r.rimonta || "" } : {}),
        "Risposta di Sborchia": r.risposta || "", "Stato": r.stato, "Verificato il": dataIt(r.verificato_il),
      })),
    })));
  }

  if (righe === null) return <div style={{ padding: 24, color: C.muted }}>Caricamento…</div>;
  const tabellaMancante = errore && /ci_verifiche_animali/.test(errore) && righe.length === 0;
  const aperti = righe.filter(r => r.stato === "Da verificare");

  return (
    <div style={{ padding: 24, maxWidth: 1450 }}>
      <h2 style={{ margin: "0 0 6px", color: C.primary }}>⚠️ Ovini da verificare con Sborchia</h2>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, maxWidth: 980 }}>
        I punti del registro degli ovini da chiarire con il direttore dell'azienda (registrazioni in ritardo, date che non tornano)
        e, parto per parto, che fine hanno fatto gli agnelli: quanti abbacchi, quanti agnelloni all'ingrasso (da quando a quando) e quali agnelle
        sono rimaste per la rimonta. Servono al confronto tra le razioni e gli acquisti degli ovini. Quando un punto è chiarito si mette
        «Verificato» ed esce dall'avviso; le correzioni del registro si fanno poi nell'app.
      </div>

      {tabellaMancante && (
        <div style={{ background: "#FFF4D6", border: `2px solid ${C.yellow}`, color: "#6B5200", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          ⚠️ Il database non ha ancora la tabella della versione 323: lanciare il file <b>contabilita_strutture_v323.sql</b>.
        </div>
      )}
      {errore && !tabellaMancante && <div style={{ color: C.red, marginBottom: 12, fontSize: 13 }}>Errore: {errore}</div>}

      {!tabellaMancante && (
        <>
          {aperti.length > 0 ? (
            <div style={{ background: "#FBE1DE", border: `2px solid ${C.red}`, color: "#8B1E14", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13.5, fontWeight: 700 }}>
              ⚠️ {aperti.length === 1 ? "1 punto da verificare" : `${aperti.length} punti da verificare`} con Sborchia.
            </div>
          ) : (
            <div style={{ background: "#E6F2E8", border: `2px solid ${C.green}`, color: "#1E5631", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13.5, fontWeight: 700 }}>
              ✓ Tutti i punti sono stati verificati.
            </div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14, fontSize: 13 }}>
            {SEZIONI_VERIFICA.map(s => {
              const tutti = righe.filter(r => r.sezione === s); const ap = tutti.filter(r => r.stato === "Da verificare").length;
              return <span key={s} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${ap ? C.red : C.green}`, borderRadius: 6, padding: "5px 10px" }}>{s}: <b>{ap}</b> da verificare su {tutti.length}</span>;
            })}
            <label style={{ marginLeft: 8, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={mostraVerificati} onChange={e => setMostraVerificati(e.target.checked)} /> Mostra anche i punti verificati
            </label>
            <button onClick={esporta} style={{ marginLeft: "auto", background: C.primary, color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontWeight: 700 }}>Esporta in Excel</button>
          </div>

          {SEZIONI_VERIFICA.map(sez => {
            const visibili = righe.filter(r => r.sezione === sez && (mostraVerificati || r.stato === "Da verificare"));
            const parti = sez === "Parti";
            const intest = ["Numero", ...(sez === "Domande" ? [] : ["Capo"]), sez === "Domande" ? "Domanda" : "Che cosa",
              ...(parti ? ["Abbacchi", "Agnelloni", "Inizio ingrasso", "Fine ingrasso", "Rimonta (marca dell'agnella)"] : []),
              "Risposta di Sborchia", "Stato"];
            return (
              <div key={sez} style={{ marginBottom: 26 }}>
                <h3 style={{ color: C.primary, margin: "0 0 8px", fontSize: 15 }}>{TITOLI[sez]}</h3>
                <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  <table style={{ fontSize: 12.5, background: C.card, minWidth: parti ? 1300 : 900 }}>
                    <thead><tr>{intest.map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {visibili.map(r => (
                        <tr key={r.id} style={{ opacity: r.stato === "Verificato" ? 0.6 : 1 }}>
                          <td style={td}>{r.stato === "Da verificare" ? "⚠️ " : "✓ "}{r.ordine}</td>
                          {sez !== "Domande" && <td style={{ ...td, fontWeight: 700, width: 160, maxWidth: 190, wordBreak: "break-word" }}>{r.capo}</td>}
                          <td style={{ ...td, minWidth: 260 }}>{r.descrizione}</td>
                          {parti && <>
                            <td style={{ ...td, width: 70 }}><input type="number" min="0" defaultValue={r.abbacchi ?? ""} onBlur={e => salva(r, { abbacchi: numero(e.target.value) })} style={campo} /></td>
                            <td style={{ ...td, width: 70 }}><input type="number" min="0" defaultValue={r.agnelloni ?? ""} onBlur={e => salva(r, { agnelloni: numero(e.target.value) })} style={campo} /></td>
                            <td style={{ ...td, width: 130 }}><input type="date" defaultValue={r.inizio_ingrasso || ""} onBlur={e => salva(r, { inizio_ingrasso: e.target.value || null })} style={campo} /></td>
                            <td style={{ ...td, width: 130 }}><input type="date" defaultValue={r.fine_ingrasso || ""} onBlur={e => salva(r, { fine_ingrasso: e.target.value || null })} style={campo} /></td>
                            <td style={{ ...td, width: 150 }}><input defaultValue={r.rimonta || ""} placeholder="IT058…" onBlur={e => salva(r, { rimonta: e.target.value.trim() || null })} style={campo} /></td>
                          </>}
                          <td style={{ ...td, minWidth: 200 }}><input defaultValue={r.risposta || ""} placeholder="Scrivi la risposta" onBlur={e => salva(r, { risposta: e.target.value.trim() || null })} style={campo} /></td>
                          <td style={{ ...td, minWidth: 130 }}>
                            <select value={r.stato} disabled={salvataggio === r.id} onChange={e => salva(r, { stato: e.target.value })}
                              style={{ border: `2px solid ${r.stato === "Verificato" ? C.green : C.red}`, borderRadius: 6, padding: "3px 6px", fontSize: 12.5, fontWeight: 700 }}>
                              {STATI_VERIFICA.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {r.verificato_il && <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>il {dataIt(r.verificato_il)}</div>}
                          </td>
                        </tr>
                      ))}
                      {visibili.length === 0 && <tr><td colSpan={intest.length} style={{ ...td, color: C.muted }}>Nessun punto da mostrare.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
