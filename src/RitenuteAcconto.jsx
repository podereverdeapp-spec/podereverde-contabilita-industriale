// Versione 390 (ordini del Dott. Bizzarri del 17/11/2026 ore 14:56 e 17:53; progetto claude/progetto_ritenute_acconto.md):
// Gestione incassi e pagamenti → «Ritenute d'acconto». Elenco delle ritenute delle fatture passive, se sono pagate e versate
// con l'F24 (codice tributo 1040), e avviso in cima al programma per quelle da versare o scadute. Solo lettura.
// Versione 390b (18/11/2026, ordine del Dott. Bizzarri delle 13:05): un pagamento disposto e non ancora addebitato dalla banca
// (codice d'attesa senza conferma) non conta come pagato; chi non può leggere gli F24 non riceve avvisi falsi.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { fetchAllPages, formattaEuro } from "./parsingUtils";
import { calcolaRitenute, daSegnalare } from "./calcoloRitenute";

const oggiRoma = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
const dataIt = d => { const [a, m, g] = String(d || "").slice(0, 10).split("-"); return g ? `${g}/${m}/${a}` : (d || "—"); };
const meseIt = m => { const [a, mm] = String(m || "").split("-"); return mm ? `${mm}/${a}` : m; };
const COLORI = { "versata": "#E3F2E1", "da versare": "#FFF1DC", "F24 da pagare": "#FFF1DC", "scaduta": "#FBE1DE", "F24 diverso": "#FBE1DE", "da pagare": "#F1F1F1", "pagamento disposto": "#E3EEFB", "pagamento da confermare": "#E3EEFB", "dato da correggere": "#FBE1DE", "pagata in parte": "#F1F1F1", "non controllabile": "#F1F1F1", "F24 non visibili": "#F1F1F1" };
const SPIEGA = {
  "versata": "versata con l'F24",
  "da versare": "fattura pagata: la ritenuta va versata con l'F24 (codice 1040)",
  "F24 da pagare": "l'F24 con la ritenuta c'è ma non è ancora pagato",
  "scaduta": "fattura pagata, il termine per versare la ritenuta è passato e l'F24 non c'è",
  "F24 diverso": "l'F24 del mese c'è ma con un importo diverso dalle ritenute di quel mese",
  "da pagare": "fattura non pagata: la ritenuta non è ancora dovuta",
  "pagamento disposto": "pagamento disposto, in attesa dell'addebito della banca: la ritenuta si conta dal mese dell'addebito confermato",
  "pagata in parte": "fattura pagata in parte: si verserà anche il resto quando sarà pagata",
  "non controllabile": "pagata prima che gli F24 fossero nel programma: non si può controllare",
  "pagamento da confermare": "l'F24 comprende già la ritenuta di un pagamento disposto e non ancora confermato: confermare il pagamento con l'estratto della banca («Conferma dei movimenti»)",
  "dato da correggere": "un F24 senza anno o un pagamento senza data: va corretto il dato, il programma non può calcolare il termine",
  "F24 non visibili": "Lei non ha il permesso di vedere gli F24: il versamento non si può controllare da qui",
};

export async function leggiRitenute() {
  const { data: sc, error: e1 } = await supabase.from("ci_scadenze").select("id, fattura_id, fornitore_id, numero_documento, data_documento, totale_documento, ritenuta, importo, ci_fornitori(nome)").eq("lato", "fornitore").gt("ritenuta", 0).order("id");
  if (e1) throw new Error(`Lettura delle ritenute: ${e1.message}`);
  const scadenze = (sc || []).map(s => ({ ...s, fornitore_nome: s.ci_fornitori?.nome || "" }));
  const ids = scadenze.map(s => s.id);
  let abbinamenti = [];
  if (ids.length) {
    const { data: ab, error: e2 } = await supabase.from("ci_abbinamenti_pagamenti").select("scadenza_id, importo, ci_pagamenti_fatture(data, stornato_il, natura, codice_attesa, confermato_il, data_disposizione)").in("scadenza_id", ids);
    if (e2) throw new Error(`Lettura dei pagamenti: ${e2.message}`);
    // un pagamento stornato non conta; uno disposto e non ancora confermato con l'estratto della banca resta «in attesa» (versione 390b)
    abbinamenti = (ab || []).filter(a => a.ci_pagamenti_fatture && !a.ci_pagamenti_fatture.stornato_il && a.ci_pagamenti_fatture.natura !== "STORNO")
      .map(a => { const p = a.ci_pagamenti_fatture; const inAttesa = !!p.codice_attesa && !p.confermato_il;
        return { scadenza_id: a.scadenza_id, importo: a.importo, data: inAttesa ? (p.data_disposizione || p.data) : p.data, inAttesa, codice: p.codice_attesa || null }; });
  }
  // versione 390b: gli F24 li legge solo chi ha la parte «Dati F24»; senza, le righe arrivano vuote senza errore
  const { data: vede, error: e0 } = await supabase.rpc("ci_ha_parte", { p_parte: "sub-dati-f24" });
  if (e0) throw new Error(`Controllo del permesso sugli F24: ${e0.message}`);
  if (vede !== true) return calcolaRitenute({ scadenze, abbinamenti, righe1040: [], primaScadenzaF24: null, oggi: oggiRoma(), f24Visibili: false });
  const { data: rr, error: e3 } = await fetchAllPages((da, a) => supabase.from("ci_f24_righe").select("f24_id, anno_riferimento, rateazione_mese, importo_debito, ci_f24(stato, data_pagamento)").eq("codice_tributo", "1040").order("id").range(da, a));
  if (e3) throw new Error(`Lettura degli F24: ${e3.message}`);
  const righe1040 = (rr || []).filter(r => r.ci_f24 && r.ci_f24.stato !== "Sostituito").map(r => ({ ...r, stato: r.ci_f24.stato, data_pagamento: r.ci_f24.data_pagamento }));
  const { data: pr, error: e4 } = await supabase.from("ci_f24").select("data_scadenza").neq("stato", "Sostituito").order("data_scadenza").limit(1);
  if (e4) throw new Error(`Lettura degli F24: ${e4.message}`);
  return calcolaRitenute({ scadenze, abbinamenti, righe1040, primaScadenzaF24: pr?.[0]?.data_scadenza || null, oggi: oggiRoma() });
}
// per la striscia in cima al programma
export async function contaRitenuteDaVersare() { const r = await leggiRitenute(); return daSegnalare(r.mesi, oggiRoma()); }

export default function RitenuteAcconto() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState("");
  const [anno, setAnno] = useState("tutti");
  useEffect(() => { leggiRitenute().then(setDati).catch(er => setErrore(er.message)); }, []);
  const riquadro = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
  const th = { textAlign: "left", padding: "6px 8px", borderBottom: `2px solid ${C.border}`, fontSize: 12 };
  const td = { padding: "6px 8px", borderBottom: "1px solid #e5e5e5", fontSize: 12.5, verticalAlign: "top" };
  const anni = dati ? [...new Set(dati.righe.map(r => String(r.data).slice(0, 4)))].sort().reverse() : [];
  const righe = dati ? dati.righe.filter(r => anno === "tutti" || String(r.data).startsWith(anno)) : [];
  const mesi = dati ? dati.mesi.filter(m => anno === "tutti" || m.mese.startsWith(anno)) : [];
  const segnalate = dati ? daSegnalare(dati.mesi, oggiRoma()) : [];
  return (
    <div style={{ padding: 20, maxWidth: 1250, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 23, margin: "0 0 4px" }}>Ritenute d'acconto</h1>
      <p style={{ color: C.muted, marginTop: 0, fontSize: 13 }}>
        Le fatture dei professionisti con la ritenuta d'acconto. La ritenuta è dovuta quando la fattura è pagata e si versa con l'F24 (codice tributo <b>1040</b>) <b>entro il 16 del mese dopo il pagamento</b> (ad agosto il 20; se cade di sabato, domenica o festa, il primo giorno lavorativo dopo).
        Il programma la dà per versata quando trova nell'F24 la riga 1040 con il mese e l'anno del pagamento e lo stesso importo. La pagina non scrive niente.
      </p>
      {errore && <div style={{ ...riquadro, background: "#FBE1DE" }}>⚠️ {errore}</div>}
      {!dati && !errore && <div style={riquadro}>⏳ Leggo le ritenute, i pagamenti e gli F24…</div>}
      {dati && <>
        {segnalate.length > 0 && <div style={{ ...riquadro, background: "#FBE1DE", border: "2px solid #B3261E" }}>
          <b>Da fare:</b> {segnalate.map(m => `mese ${meseIt(m.mese)}: ${m.stato === "F24 diverso" ? `F24 di ${formattaEuro(m.f24.importo)} contro ritenute di ${formattaEuro(m.dovuto)}` : `${formattaEuro(m.dovuto)} da versare entro il ${dataIt(m.termine)}${m.stato === "scaduta" ? " (SCADUTO)" : ""}`}`).join(" · ")}
        </div>}
        <div style={{ marginBottom: 10, fontSize: 13 }}>Anno della fattura:{" "}
          <select value={anno} onChange={e => setAnno(e.target.value)}><option value="tutti">tutti</option>{anni.map(a => <option key={a} value={a}>{a}</option>)}</select>
          {dati.f24Visibili === false && <span style={{ marginLeft: 12, color: "#B3261E", fontSize: 12, fontWeight: 700 }}>Lei non ha il permesso di vedere gli F24 («Dati F24»): la pagina mostra ritenute e pagamenti, ma non può dire se le ritenute sono state versate.</span>}
          {dati.primoMeseControllabile && <span style={{ marginLeft: 12, color: C.muted, fontSize: 12 }}>Gli F24 sono nel programma per i pagamenti dal mese {meseIt(dati.primoMeseControllabile)}.</span>}
        </div>
        <div style={riquadro}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Fatture con la ritenuta ({righe.length})</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Fornitore</th><th style={th}>Fattura</th><th style={th}>Data</th><th style={{ ...th, textAlign: "right" }}>Totale</th><th style={{ ...th, textAlign: "right" }}>Ritenuta</th><th style={th}>Pagata il</th><th style={th}>Da versare entro</th><th style={th}>Stato</th></tr></thead>
            <tbody>{righe.map(r => <tr key={r.chiave} style={{ background: COLORI[r.stato] }}>
              <td style={td}>{r.fornitore}</td><td style={td}>{r.numero}</td><td style={td}>{dataIt(r.data)}</td>
              <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.totale)}</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(r.ritenuta)}</td>
              <td style={td}>{r.pagamenti.length ? r.pagamenti.map(p => `${dataIt(p.data)} (${formattaEuro(Number(p.importo) || 0)})`).join(", ") : "—"}{r.disposti.length > 0 && <div style={{ fontSize: 11.5, color: "#1F4E8C" }}>{r.disposti.map(p => `${p.codice || "pagamento"} disposto il ${dataIt(p.data)} (${formattaEuro(Number(p.importo) || 0)}), in attesa della banca`).join(", ")}</div>}</td>
              <td style={td}>{r.termine ? dataIt(r.termine) : "—"}</td>
              <td style={td}><b>{r.stato}</b><div style={{ fontSize: 11.5, color: "#555" }}>{SPIEGA[r.stato]}</div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div style={riquadro}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Per mese del pagamento: ritenute da versare e F24 (codice 1040)</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Mese del pagamento</th><th style={{ ...th, textAlign: "right" }}>Ritenute da versare</th><th style={th}>Entro il</th><th style={{ ...th, textAlign: "right" }}>F24 codice 1040</th><th style={th}>F24 pagato il</th><th style={{ ...th, textAlign: "right" }}>Differenza</th><th style={th}>Stato</th></tr></thead>
            <tbody>{mesi.map(m => <tr key={m.mese} style={{ background: COLORI[m.stato] }}>
              <td style={td}>{meseIt(m.mese)}</td><td style={{ ...td, textAlign: "right" }}>{formattaEuro(m.dovuto)}</td><td style={td}>{dataIt(m.termine)}</td>
              <td style={{ ...td, textAlign: "right" }}>{m.f24 ? formattaEuro(m.f24.importo) : "—"}</td><td style={td}>{m.f24?.date?.length ? m.f24.date.map(dataIt).join(", ") : "—"}</td>
              <td style={{ ...td, textAlign: "right" }}>{m.differenza == null ? "—" : formattaEuro(m.differenza)}</td><td style={td}><b>{m.stato}</b>{(m.stato === "pagamento da confermare" || m.stato === "dato da correggere") && <div style={{ fontSize: 11.5, color: "#555" }}>{SPIEGA[m.stato]}</div>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
    </div>
  );
}
