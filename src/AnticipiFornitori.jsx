import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
import { euro } from "./analisiDocumentoBanca";
import { md5File } from "./md5";
import { PdfDelDocumento } from "./pdfFatture";
import { oggiRoma } from "./regoleIncassiPagamenti";
import { fattureCandidate, statoAnticipo, righeSospette, movimentiDaSegnare, DA_GUARDARE, dataIt } from "./calcoloAnticipi";

// Versione 370 — «Gestione incassi e pagamenti» → «Anticipi in attesa di fattura».
// Decisioni del Dott. Bizzarri del 12/11/2026: un anticipo (pagamento su proforma, preventivo o offerta) resta aperto finché arriva la
// fattura; quando arriva, il programma la mette ACCANTO all'anticipo; chi gestisce i conti (Teresa Demaria; al suo posto il Dott. Bizzarri
// o Colabucci) la controlla e chiude. Se la fattura non arriva, l'anticipo diventa rosso (fattura in ritardo, poi segnalazione all'Agenzia).
// L'anticipo nasce da solo quando un movimento in uscita ha la voce «Acconto su fattura da ricevere» (database, versione 370).
// Tutte le scritture passano dalle funzioni del database (ci_anticipo_dati, ci_aggancia_anticipo, ci_chiudi_anticipo, ci_riapri_anticipo,
// ci_sgancia_fattura_anticipo, ci_scarta_fattura_anticipo, ci_segna_anticipo), che ricontrollano tutto.

export const ARCHIVIO_ANTICIPI = "anticipi";
const COLORI = { verde: C.green, grigio: C.muted, blu: C.blue, azzurro: C.blue, giallo: C.yellow, rosso: C.red };
const TIPI_DOCUMENTO = [["proforma", "Proforma"], ["preventivo", "Preventivo"], ["offerta", "Offerta"], ["ordine", "Ordine"], ["contratto", "Contratto"], ["altro", "Altro"]];
const importoIt = n => Number(n).toFixed(2).replace(".", ",");
const leggiImporto = t => { const s = String(t || "").trim().replace(/\s|€/g, ""); if (!s) return null; const x = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^\d+(\.\d{1,2})?$/.test(x)) return null; const n = Number(x); return n > 0 ? Math.round(n * 100) / 100 : null; };

// Legge tutto ciò che serve alla scheda (anche per il numero rosso del menu)
async function leggiAnticipi() {
  const [an, sc, fo, ab] = await Promise.all([
    fetchAllPages((a, b) => supabase.from("ci_v_anticipi").select("*").order("anticipo_id").range(a, b)),
    fetchAllPages((a, b) => supabase.from("ci_anticipi_scarti").select("*").order("id").range(a, b)),
    fetchAllPages((a, b) => supabase.from("ci_fornitori").select("id, nome, partita_iva").order("id").range(a, b)),
    fetchAllPages((a, b) => supabase.from("ci_v_scadenzario").select("scadenza_id, lato, fattura_id, fornitore_id, numero_documento, data_documento, tipo_documento, importo, residuo, in_attesa_della_banca, data_scadenza")
      .eq("lato", "fornitore").gt("residuo", 0.005).gt("importo", 0).order("scadenza_id").range(a, b)),
  ]);
  for (const x of [an, sc, fo, ab]) if (x.error) throw new Error(x.error.message);
  return { anticipi: an.data || [], scarti: sc.data || [], fornitori: fo.data || [], aperte: ab.data || [] };
}

// Numero rosso del menu: anticipi aperti che chiedono un'azione (fattura da controllare, da chiudere, in ritardo, segnalazione)
export async function contaAnticipiDaGuardare() {
  // solo per chi gestisce i conti (gli altri non possono fare niente: niente striscia né numero)
  const g = await supabase.rpc("ci_puo_gestire_conti");
  if (g.data !== true) return 0;
  const d = await leggiAnticipi();
  const oggi = oggiRoma();
  return d.anticipi.filter(a => a.stato === "aperto" && DA_GUARDARE.has(statoAnticipo(a, fattureCandidate(a, d.aperte, d.fornitori, d.scarti), oggi).codice)).length;
}

export default function AnticipiFornitori({ vaiA }) {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState("");
  const [giro, setGiro] = useState(0);
  const [filtro, setFiltro] = useState("aperti");
  const [aperto, setAperto] = useState(null);
  const oggi = oggiRoma();

  useEffect(() => { (async () => {
    setErrore("");
    const base = await leggiAnticipi();
    const pagamenti = base.anticipi.map(a => a.pagamento_id);
    // fatture già agganciate agli anticipi (abbinamenti dei movimenti) e le loro scadenze, anche se ormai pagate del tutto
    let agganci = [];
    if (pagamenti.length) {
      const r = await fetchAllPages((a, b) => supabase.from("ci_abbinamenti_pagamenti").select("id, pagamento_id, scadenza_id, importo, modo, motivo").in("pagamento_id", pagamenti).order("id").range(a, b));
      if (r.error) throw new Error(r.error.message);
      agganci = r.data || [];
    }
    let scadAgganciate = [];
    const idsSc = [...new Set(agganci.map(x => x.scadenza_id))];
    if (idsSc.length) {
      const r = await supabase.from("ci_v_scadenzario").select("scadenza_id, fattura_id, fornitore_id, numero_documento, data_documento, importo, residuo").in("scadenza_id", idsSc);
      if (r.error) throw new Error(r.error.message);
      scadAgganciate = r.data || [];
    }
    // righe della banca e movimenti che sembrano anticipi (per i due elenchi in fondo)
    const [ri, doc, mv, abTutti, pr] = await Promise.all([
      fetchAllPages((a, b) => supabase.from("ci_righe_fonte").select("id, documento_id, conto_id, data_contabile, verso, importo, descrizione").eq("verso", "uscita").gte("data_contabile", "2026-01-01").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_documenti_fonte").select("id, annullato_il").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_pagamenti_fatture").select("id, data, verso, importo, controparte, causale, causale_gruppo, causale_voce, confermato_il, stornato_il, natura, riga_fonte_id, esercizio, progressivo, fornitore_id")
        .gte("data", "2026-01-01").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_abbinamenti_pagamenti").select("pagamento_id").order("id").range(a, b)),
      supabase.rpc("ci_puo_gestire_conti"),
    ]);
    for (const x of [ri, doc, mv, abTutti]) if (x.error) throw new Error(x.error.message);
    const vivi = new Set((doc.data || []).filter(d => !d.annullato_il).map(d => d.id));
    const confermate = new Set((mv.data || []).filter(m => m.confermato_il && m.riga_fonte_id).map(m => m.riga_fonte_id));
    const conAbb = new Set((abTutti.data || []).map(x => x.pagamento_id));
    setDati({ ...base, agganci, scadAgganciate, sospette: righeSospette(ri.data || [], confermate, vivi), daSegnare: movimentiDaSegnare(mv.data || [], conAbb), gestore: pr.data === true });
  })().catch(e => setErrore("Lettura non riuscita: " + e.message)); }, [giro]);

  const righe = useMemo(() => {
    if (!dati) return [];
    return dati.anticipi.map(a => {
      const agg = dati.agganci.filter(x => x.pagamento_id === a.pagamento_id).map(x => ({ ...x, s: dati.scadAgganciate.find(s => s.scadenza_id === x.scadenza_id) }));
      const cand = fattureCandidate(a, dati.aperte, dati.fornitori, dati.scarti, agg);
      return { a, agg, cand, st: statoAnticipo(a, cand, oggi) };
    }).sort((x, y) => (x.a.stato === "aperto" ? 0 : 1) - (y.a.stato === "aperto" ? 0 : 1) || String(x.a.data_pagamento).localeCompare(String(y.a.data_pagamento)));
  }, [dati]);

  if (errore && !dati) return <div style={{ color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>;
  if (!dati) return <div>Lettura in corso…</div>;
  const conta = codice => righe.filter(r => r.st.codice === codice).length;
  const visibili = righe.filter(r => filtro === "tutti" ? true : filtro === "chiusi" ? r.a.stato !== "aperto" : r.a.stato === "aperto");
  const fatto = (t) => { setEsito(t); setAperto(null); setGiro(g => g + 1); };
  const totaleAperto = righe.filter(r => r.a.stato === "aperto").reduce((t, r) => t + Number(r.a.residuo), 0);

  return <div style={{ maxWidth: 1300 }}>
    <div style={{ fontSize: 22, fontWeight: 800, color: C.primary }}>⏳ Anticipi in attesa di fattura</div>
    <div style={{ fontSize: 13, color: C.muted, margin: "4px 0 12px", maxWidth: 1050 }}>
      Un anticipo è un pagamento fatto prima della fattura: su una proforma, un preventivo o un'offerta. Resta qui finché arriva la fattura del fornitore.
      Quando la fattura entra nel programma, compare <b>accanto</b> all'anticipo: chi gestisce i conti (Teresa Demaria; al suo posto il Dott. Bizzarri o Colabucci)
      la controlla e <b>chiude</b>. Dal pagamento il fornitore ha 12 giorni per la fattura (per un servizio può arrivare entro il 15 del mese dopo); se non arriva l'anticipo diventa rosso e, avvicinandosi ai 90 giorni
      successivi, va fatta la segnalazione all'Agenzia delle Entrate (termini da confermare con lo Studio).
      L'anticipo nasce da solo quando un pagamento ha la voce «Acconto su fattura da ricevere» (in «Conferma dei movimenti» o in «Incassi e pagamenti»).
    </div>
    {!dati.gestore && <div style={{ ...scheda, borderLeft: `4px solid ${C.yellow}`, fontSize: 13 }}>Si può solo guardare: controllare e chiudere gli anticipi spetta a chi gestisce i conti.</div>}
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      {[["Fattura arrivata: da controllare", conta("da controllare") + conta("da chiudere"), C.blue], ["In attesa della fattura", conta("in attesa"), C.yellow],
        ["Fattura in ritardo", conta("in ritardo"), C.red], ["Segnalazione all'Agenzia", conta("segnalazione"), C.red], ["Chiusi", conta("chiuso"), C.green]].map(([t, n, col]) =>
        <div key={t} style={{ flex: "1 1 180px", border: `2px solid ${col}`, background: `${col}12`, borderRadius: 12, padding: "8px 12px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: col }}>{t}</div><div style={{ fontSize: 24, fontWeight: 800, color: col }}>{n}</div></div>)}
      <div style={{ flex: "1 1 180px", border: `2px solid ${C.primary}`, borderRadius: 12, padding: "8px 12px" }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.primary }}>Anticipato e ancora senza fattura</div><div style={{ fontSize: 24, fontWeight: 800, color: C.primary }}>{euro(totaleAperto)}</div></div>
    </div>
    {esito && <div style={{ ...scheda, border: `2px solid ${C.green}`, fontWeight: 700, color: C.green }}>✔ {esito} <button style={{ ...btn(false), marginLeft: 8, height: 26 }} onClick={() => setEsito("")}>Chiudi</button></div>}
    {errore && <div style={{ ...scheda, color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>}
    <div style={{ ...scheda, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <label>Mostra <select style={input} value={filtro} onChange={e => setFiltro(e.target.value)}><option value="aperti">aperti</option><option value="chiusi">chiusi e annullati</option><option value="tutti">tutti</option></select></label>
      <span style={{ fontSize: 12.5, color: C.muted }}>{visibili.length} anticipi</span>
    </div>
    <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, background: "#fff" }}>
      <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Stato", "Pagato il", "Fornitore", "Anticipo", "Documento", "Fatture accanto", "Senza fattura", ""].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
      <tbody>{visibili.map(({ a, agg, cand, st }) => { const col = COLORI[st.colore]; return [
        <tr key={a.anticipo_id} style={{ borderBottom: `1px solid ${C.border}`, background: `${col}10` }}>
          <td style={{ padding: "5px 8px", color: col, fontWeight: 800 }}>{st.nome}<div style={{ fontWeight: 400, color: C.text, fontSize: 11.5, maxWidth: 260 }}>{st.testo}</div></td>
          <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{dataIt(a.data_pagamento)}{a.progressivo ? <div style={{ color: C.muted, fontSize: 11 }}>{a.esercizio}/{String(a.progressivo).padStart(6, "0")}</div> : a.codice_attesa ? <div style={{ color: C.blue, fontSize: 11 }}>{a.codice_attesa}</div> : null}</td>
          <td style={{ padding: "5px 8px", fontWeight: 700 }}>{a.fornitore || <span style={{ color: C.red }}>da scegliere ({a.controparte || "—"})</span>}{a.partita_iva ? <div style={{ fontWeight: 400, color: C.muted, fontSize: 11 }}>P. IVA {a.partita_iva}</div> : null}</td>
          <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>{euro(a.importo)}</td>
          <td style={{ padding: "5px 8px" }}>{a.documento_tipo || a.documento_numero ? `${TIPI_DOCUMENTO.find(t => t[0] === a.documento_tipo)?.[1] || "Documento"} ${a.documento_numero || ""}${a.documento_data ? " del " + dataIt(a.documento_data) : ""}` : <span style={{ color: C.muted }}>—</span>}{a.documento_pdf ? " 📄" : ""}</td>
          <td style={{ padding: "5px 8px" }}>{agg.map(x => <div key={x.id}>✔ n. {x.s?.numero_documento || "?"} del {dataIt(x.s?.data_documento)} — {euro(x.importo)}</div>)}
            {cand.length > 0 && a.stato === "aperto" && <div style={{ color: C.blue, fontWeight: 700 }}>{cand.length === 1 ? `1 fattura arrivata (n. ${cand[0].numero_documento} del ${dataIt(cand[0].data_documento)}, ${euro(cand[0].residuo)})` : `${cand.length} fatture arrivate`}</div>}
            {!agg.length && !cand.length && <span style={{ color: C.muted }}>nessuna</span>}</td>
          <td style={{ padding: "5px 8px", textAlign: "right", color: Math.abs(Number(a.residuo)) < 0.005 ? C.green : C.red, fontWeight: 700 }}>{euro(a.residuo)}</td>
          <td style={{ padding: "5px 8px" }}><button style={btn(aperto === a.anticipo_id)} onClick={() => setAperto(aperto === a.anticipo_id ? null : a.anticipo_id)}>{aperto === a.anticipo_id ? "Chiudi" : a.stato === "aperto" && dati.gestore ? "Controlla" : "Vedi"}</button></td>
        </tr>,
        aperto === a.anticipo_id && <tr key={"d" + a.anticipo_id}><td colSpan={8} style={{ padding: 10, background: "#fff", borderBottom: `2px solid ${C.primary}` }}>
          <Dettaglio a={a} agg={agg} cand={cand} dati={dati} fatto={fatto} />
        </td></tr>,
      ]; })}</tbody>
    </table></div>
    {!visibili.length && <div style={{ ...scheda, color: C.muted }}>Nessun anticipo {filtro === "aperti" ? "aperto" : ""}.</div>}

    <div style={{ ...scheda, marginTop: 14 }}>
      <div style={{ fontWeight: 800, color: C.primary, marginBottom: 4 }}>Righe della banca che sembrano anticipi e non sono ancora registrate ({dati.sospette.length})</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>Pagamenti del 2026 con «acconto», «anticipo», «proforma», «preventivo» o «offerta» nella causale, senza movimento confermato.
        Si registrano in «Banche, carte e cassa» → «Conferma dei movimenti»: se la fattura non c'è ancora, con la voce «Acconto su fattura da ricevere».
        {vaiA && <button style={{ ...btn(false), marginLeft: 8, height: 26 }} onClick={() => vaiA("banche-conferma")}>Vai a «Conferma dei movimenti» →</button>}</div>
      {dati.sospette.length > 0 && <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}><tbody>{dati.sospette.map(r => <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
        <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>{dataIt(r.data_contabile)}</td><td style={{ padding: "4px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{euro(r.importo)}</td><td style={{ padding: "4px 8px" }}>{r.descrizione}</td></tr>)}</tbody></table>}
    </div>
    <div style={scheda}>
      <div style={{ fontWeight: 800, color: C.primary, marginBottom: 4 }}>Pagamenti già in prima nota che sembrano anticipi ({dati.daSegnare.length})</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>Movimenti del gruppo «Fatture», senza fatture abbinate, con le parole dell'anticipo nella causale. Se sono pagamenti fatti prima della fattura, «Segna come anticipo».</div>
      {dati.daSegnare.map(m => <Segna key={m.id} m={m} gestore={dati.gestore} fatto={fatto} />)}
    </div>
  </div>;
}

function Segna({ m, gestore, fatto }) {
  const [motivo, setMotivo] = useState(""); const [lavoro, setLavoro] = useState(false); const [errore, setErrore] = useState("");
  return <div style={{ borderBottom: `1px solid ${C.border}`, padding: "5px 0", fontSize: 12.5, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <b>{m.esercizio ? `${m.esercizio}/${String(m.progressivo).padStart(6, "0")}` : `n. ${m.id}`}</b> {dataIt(m.data)} — {euro(m.importo)} — {m.controparte} — {m.causale_voce} — <span style={{ color: C.muted }}>{String(m.causale || "").slice(0, 110)}</span>
    {gestore && <><input style={{ ...input, height: 28, flex: "1 1 200px" }} placeholder="perché è un anticipo (facoltativo)" value={motivo} onChange={e => setMotivo(e.target.value)} />
      <button style={{ ...btn(true), height: 28 }} disabled={lavoro} onClick={async () => {
        if (lavoro) return; setLavoro(true); setErrore("");
        const r = await supabase.rpc("ci_segna_anticipo", { p_movimento: m.id, p_motivo: motivo });
        setLavoro(false); if (r.error) return setErrore(r.error.message);
        fatto(`Il pagamento del ${dataIt(m.data)} di ${euro(m.importo)} è ora un anticipo in attesa di fattura.`);
      }}>Segna come anticipo</button></>}
    {errore && <span style={{ color: C.red, fontWeight: 700 }}>⚠️ {errore}</span>}
  </div>;
}

function Dettaglio({ a, agg, cand, dati, fatto }) {
  const puo = dati.gestore && a.stato === "aperto";
  const [v, setV] = useState({ fornitore_id: a.fornitore_id || "", partita_iva: a.partita_iva || "", documento_tipo: a.documento_tipo || "", documento_numero: a.documento_numero || "",
    documento_data: a.documento_data || "", note: a.note || "" });
  const [quote, setQuote] = useState({}); // scadenza_id → importo (testo)
  const [motivo, setMotivo] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState("");
  const fileRef = useRef(null);
  const cambia = (k, x) => setV(o => ({ ...o, [k]: x }));
  const resto = Number(a.residuo);
  const scelte = cand.filter(s => quote[s.scadenza_id] !== undefined).map(s => ({ s, imp: leggiImporto(quote[s.scadenza_id]) }));
  const somma = Math.round(scelte.reduce((t, q) => t + (q.imp || 0), 0) * 100) / 100;
  const dopo = Math.round((resto - somma) * 100) / 100;
  const problemi = [];
  if (scelte.length && !a.fornitore_id) problemi.push("scegliere e salvare prima il fornitore dell'anticipo");
  if (scelte.some(q => !q.imp)) problemi.push("scrivere l'importo di ogni fattura spuntata");
  if (scelte.some(q => q.imp && q.imp > Number(q.s.residuo) + 0.005)) problemi.push("un importo supera il resto della fattura");
  if (somma > resto + 0.005) problemi.push(`le fatture spuntate (${euro(somma)}) superano quanto resta dell'anticipo (${euro(resto)})`);
  if (scelte.filter(q => q.imp && q.imp < Number(q.s.residuo) - 0.005).length > 1) problemi.push("al massimo una fattura pagata solo in parte");
  const chiama = async (fn, argomenti, testo) => {
    if (lavoro) return false; setLavoro(true); setErrore("");
    const r = await supabase.rpc(fn, argomenti);
    setLavoro(false);
    if (r.error) { setErrore("Il database non l'ha accettato, non è cambiato niente: " + r.error.message); return false; }
    fatto(testo); return true;
  };
  async function apriPdfAnticipo() {
    const { data, error } = await supabase.storage.from(ARCHIVIO_ANTICIPI).createSignedUrl(a.documento_pdf, 300);
    if (error) { setErrore("Il PDF non si apre: " + error.message); return; }
    window.open(data.signedUrl, "_blank");
  }
  async function caricaPdfAnticipo(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { setErrore(`«${file.name}» non è un PDF.`); return; }
    if (file.size > 10 * 1024 * 1024) { setErrore("Il PDF supera 10 MB."); return; }
    setLavoro(true); setErrore("");
    try {
      const impronta = await md5File(file);
      const percorso = `${a.anticipo_id}/${impronta}.pdf`;
      const up = await supabase.storage.from(ARCHIVIO_ANTICIPI).upload(percorso, file, { upsert: false, contentType: "application/pdf" });
      if (up.error && !/exist|duplicate|409/i.test(up.error.message || "")) throw new Error(up.error.message);
      const r = await supabase.rpc("ci_anticipo_dati", { p: { anticipo_id: a.anticipo_id, ...v, fornitore_id: v.fornitore_id || "", documento_pdf: percorso } });
      if (r.error) throw new Error(r.error.message);
      setLavoro(false); fatto(`PDF del documento allegato all'anticipo di ${a.fornitore || a.controparte}.`);
    } catch (e) { setLavoro(false); setErrore("PDF non allegato: " + e.message); }
  }
  const fornitoriOrdinati = useMemo(() => [...dati.fornitori].sort((x, y) => String(x.nome || "").localeCompare(String(y.nome || ""))), [dati.fornitori]);

  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 14, fontSize: 12.5 }}>
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
      <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>L'anticipo</div>
      <div>Pagato il <b>{dataIt(a.data_pagamento)}</b> {a.progressivo ? `(prima nota ${a.esercizio}/${String(a.progressivo).padStart(6, "0")})` : a.codice_attesa ? `(disposizione ${a.codice_attesa}, in attesa della banca)` : ""} — <b>{euro(a.importo)}</b> con {a.modalita || "—"}</div>
      <div style={{ color: C.muted, margin: "3px 0" }}>Causale: {a.causale || "—"}</div>
      <div>Fattura attesa entro il <b>{dataIt(a.fattura_attesa_entro)}</b>; segnalazione all'Agenzia entro il <b>{dataIt(a.segnalazione_entro)}</b> (da confermare con lo Studio).</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
        <label style={{ gridColumn: "1 / -1" }}>Fornitore<br /><select style={{ ...input, width: "100%", borderColor: !v.fornitore_id ? C.red : C.border }} disabled={!puo || agg.length > 0} value={v.fornitore_id} onChange={e => cambia("fornitore_id", e.target.value ? Number(e.target.value) : "")}>
          <option value="">— scegliere (se non c'è ancora, scrivere la partita IVA: lo riconosce quando arriva la fattura) —</option>{fornitoriOrdinati.map(f => <option key={f.id} value={f.id}>{f.nome}{f.partita_iva ? ` — ${f.partita_iva}` : ""}</option>)}</select></label>
        <label>Partita IVA del fornitore (dalla proforma)<br /><input style={{ ...input, width: "100%" }} disabled={!puo} value={v.partita_iva} onChange={e => cambia("partita_iva", e.target.value)} /></label>
        <label>Documento<br /><select style={{ ...input, width: "100%" }} disabled={!puo} value={v.documento_tipo} onChange={e => cambia("documento_tipo", e.target.value)}><option value="">—</option>{TIPI_DOCUMENTO.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label>Numero<br /><input style={{ ...input, width: "100%" }} disabled={!puo} value={v.documento_numero} onChange={e => cambia("documento_numero", e.target.value)} /></label>
        <label>Data<br /><input type="date" style={{ ...input, width: "100%" }} disabled={!puo} value={v.documento_data || ""} onChange={e => cambia("documento_data", e.target.value)} /></label>
        <label style={{ gridColumn: "1 / -1" }}>Nota<br /><input style={{ ...input, width: "100%" }} disabled={!puo} value={v.note} onChange={e => cambia("note", e.target.value)} /></label>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {a.documento_pdf ? <button style={btn(false)} onClick={apriPdfAnticipo}>📄 Apri il documento</button> : <span style={{ color: C.muted, alignSelf: "center" }}>Nessun PDF del documento.</span>}
        {puo && <><button style={btn(false)} disabled={lavoro} onClick={() => fileRef.current?.click()}>📎 {a.documento_pdf ? "Sostituisci il PDF" : "Allega il PDF"}</button>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; caricaPdfAnticipo(f); }} />
          <button style={btn(true)} disabled={lavoro} onClick={() => chiama("ci_anticipo_dati", { p: { anticipo_id: a.anticipo_id, ...v, fornitore_id: v.fornitore_id || "" } }, "Dati dell'anticipo salvati.")}>Salva i dati</button></>}
      </div>
    </div>

    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
      <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>Le fatture accanto</div>
      {agg.length > 0 && <div style={{ marginBottom: 8 }}><b>Agganciate</b>{agg.map(x => <Agganciata key={x.id} x={x} a={a} puo={puo} chiama={chiama} />)}</div>}
      {a.stato === "aperto" && <>
        <b>Arrivate dal fornitore e non ancora agganciate</b>
        {!cand.length && <div style={{ color: C.muted }}>{a.fornitore_id || a.partita_iva ? "Nessuna fattura aperta del fornitore." : "Scegliere il fornitore o scrivere la partita IVA."}</div>}
        {cand.map(s => <Candidata key={s.scadenza_id} s={s} a={a} puo={puo} quota={quote[s.scadenza_id]} resto={resto}
          setQuota={q => setQuote(o => { const n = { ...o }; if (q === undefined) delete n[s.scadenza_id]; else n[s.scadenza_id] = q; return n; })} chiama={chiama} />)}
        {scelte.length > 0 && <div style={{ marginTop: 6, fontWeight: 700, color: problemi.length ? C.red : Math.abs(dopo) < 0.005 ? C.green : C.yellow }}>
          Spuntate {euro(somma)} su {euro(resto)} ancora senza fattura → {Math.abs(dopo) < 0.005 ? "l'anticipo è coperto del tutto" : `resteranno ${euro(dopo)} senza fattura`}</div>}
      </>}
      {a.stato !== "aperto" && <div style={{ color: C.muted, marginTop: 6 }}>{a.stato === "chiuso" ? `Chiuso il ${dataIt(String(a.chiuso_il || "").slice(0, 10))}` : "Annullato"}{a.motivo_chiusura ? `: ${a.motivo_chiusura}` : ""}</div>}
      {problemi.length > 0 && scelte.length > 0 && <div style={{ color: C.red, marginTop: 4 }}>Per agganciare: {problemi.join("; ")}.</div>}
      {dati.gestore && <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
        <input style={{ ...input, width: "100%", marginBottom: 6 }} placeholder={a.stato === "aperto" ? "Motivo (obbligatorio per chiudere senza fattura o con una differenza)" : "Motivo della riapertura (obbligatorio)"} value={motivo} onChange={e => setMotivo(e.target.value)} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {puo && <>
            {scelte.length > 0 && <button style={btn(false)} disabled={lavoro || problemi.length > 0} onClick={() => chiama("ci_aggancia_anticipo", { p_anticipo: a.anticipo_id, p_fatture: scelte.map(q => ({ scadenza_id: q.s.scadenza_id, importo: q.imp })), p_chiudi: false, p_motivo: motivo },
              `Fatture agganciate all'anticipo di ${a.fornitore}: l'anticipo resta aperto${Math.abs(dopo) < 0.005 ? "" : ` per ${euro(dopo)}`}.`)}>Aggancia (resta aperto)</button>}
            {(scelte.length > 0 || agg.length > 0) && <button style={btn(true, C.green)} disabled={lavoro || problemi.length > 0 || (Math.abs(dopo) > 0.005 && !motivo.trim())}
              onClick={() => chiama("ci_aggancia_anticipo", { p_anticipo: a.anticipo_id, p_fatture: scelte.map(q => ({ scadenza_id: q.s.scadenza_id, importo: q.imp })), p_chiudi: true, p_motivo: motivo },
                `Anticipo di ${a.fornitore} controllato e chiuso.`)}>{scelte.length ? "Aggancia e chiudi" : "Chiudi con le fatture agganciate"}</button>}
            <button style={btn(false, C.red)} disabled={lavoro || !motivo.trim()} onClick={() => chiama("ci_chiudi_anticipo", { p_anticipo: a.anticipo_id, p_motivo: motivo }, "Anticipo chiuso senza fattura, con il motivo.")}>Chiudi senza fattura</button>
          </>}
          {a.stato === "chiuso" && <button style={btn(false)} disabled={lavoro || !motivo.trim()} onClick={() => chiama("ci_riapri_anticipo", { p_anticipo: a.anticipo_id, p_motivo: motivo }, "Anticipo riaperto.")}>Riapri</button>}
        </div>
        {a.stato === "aperto" && Math.abs(dopo) > 0.005 && (scelte.length > 0 || agg.length > 0) && <div style={{ color: C.muted, fontSize: 11.5, marginTop: 4 }}>Per chiudere con {euro(dopo)} ancora senza fattura serve il motivo (per esempio: il fornitore farà un'altra fattura; restituito).</div>}
      </div>}
      {errore && <div style={{ color: C.red, fontWeight: 700, marginTop: 6 }}>⚠️ {errore}</div>}
    </div>
  </div>;
}

function Candidata({ s, a, puo, quota, setQuota, resto, chiama }) {
  const [scarta, setScarta] = useState(false); const [perche, setPerche] = useState("");
  const sp = quota !== undefined;
  const suggerita = Math.min(Number(s.residuo), Math.max(resto, 0));
  return <div style={{ borderBottom: `1px dashed ${C.border}`, padding: "5px 0" }}>
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        {puo && <input type="checkbox" checked={sp} onChange={e => setQuota(e.target.checked ? importoIt(suggerita) : undefined)} />}
        <span><b>n. {s.numero_documento}</b> del {dataIt(s.data_documento)} — {s.tipo_documento || ""} — totale {euro(s.importo)}, da pagare {euro(s.residuo)}</span></label>
      {s.data_documento < a.data_pagamento && <span style={{ color: C.yellow, fontWeight: 700 }}>datata prima del pagamento</span>}
      {s.fattura_id ? <PdfDelDocumento doc={{ id: s.fattura_id, data: s.data_documento }} /> : null}
      {sp && <input aria-label={`Importo da agganciare della fattura ${s.numero_documento}`} style={{ ...input, width: 110, height: 28 }} value={quota} onChange={e => setQuota(e.target.value)} />}
      {puo && s.fattura_id && <button style={{ ...btn(false, C.red), height: 26 }} onClick={() => setScarta(!scarta)}>Non è questa</button>}
    </div>
    {scarta && <div style={{ display: "flex", gap: 6, marginTop: 4 }}><input style={{ ...input, flex: 1, height: 28 }} placeholder="perché non è la fattura di questo anticipo (obbligatorio)" value={perche} onChange={e => setPerche(e.target.value)} />
      <button style={{ ...btn(true, C.red), height: 28 }} disabled={!perche.trim()} onClick={() => chiama("ci_scarta_fattura_anticipo", { p_anticipo: a.anticipo_id, p_fattura: s.fattura_id, p_motivo: perche }, `La fattura n. ${s.numero_documento} non sarà più proposta per questo anticipo.`)}>Conferma</button></div>}
  </div>;
}

function Agganciata({ x, a, puo, chiama }) {
  const [sgancia, setSgancia] = useState(false); const [perche, setPerche] = useState("");
  return <div style={{ padding: "3px 0" }}>✔ n. {x.s?.numero_documento || "?"} del {dataIt(x.s?.data_documento)} — agganciati {euro(x.importo)}{x.s ? ` (fattura ${euro(x.s.importo)}, ancora da pagare ${euro(x.s.residuo)})` : ""}
    {x.s?.fattura_id ? <> <PdfDelDocumento doc={{ id: x.s.fattura_id, data: x.s.data_documento }} /></> : null}
    {puo && <button style={{ ...btn(false, C.red), height: 24, marginLeft: 6, fontSize: 11 }} onClick={() => setSgancia(!sgancia)}>Sgancia</button>}
    {sgancia && <div style={{ display: "flex", gap: 6, marginTop: 4 }}><input style={{ ...input, flex: 1, height: 28 }} placeholder="motivo (obbligatorio)" value={perche} onChange={e => setPerche(e.target.value)} />
      <button style={{ ...btn(true, C.red), height: 28 }} disabled={!perche.trim()} onClick={() => chiama("ci_sgancia_fattura_anticipo", { p_anticipo: a.anticipo_id, p_scadenza: x.scadenza_id, p_motivo: perche }, `Fattura n. ${x.s?.numero_documento} sganciata: torna da pagare per ${euro(x.importo)}.`)}>Conferma</button></div>}
  </div>;
}
