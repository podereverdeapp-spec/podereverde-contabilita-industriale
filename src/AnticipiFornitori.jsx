import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
import { euro } from "./analisiDocumentoBanca";
import { md5File } from "./md5";
import { PdfDelDocumento } from "./pdfFatture";
import { oggiRoma } from "./regoleIncassiPagamenti";
import { fattureCandidate, statoAnticipo, righeSospette, movimentiDaSegnare, DA_GUARDARE, dataIt, nomeTipo, E_CAPARRA } from "./calcoloAnticipi";
import { useStatiFatture, EtichettaStatoFattura } from "./statoFatture"; // versione 375

// Versione 370 — «Gestione incassi e pagamenti» → «Anticipi in attesa di fattura».
// Decisioni del Dott. Bizzarri del 12/11/2026: un anticipo (pagamento su proforma, preventivo o offerta) resta aperto finché arriva la
// fattura; quando arriva, il programma la mette ACCANTO all'anticipo; chi gestisce i conti (Teresa Demaria; al suo posto il Dott. Bizzarri
// o Colabucci) la controlla e chiude. Se la fattura non arriva, l'anticipo diventa rosso (fattura in ritardo, poi segnalazione all'Agenzia).
// L'anticipo nasce da solo quando un movimento in uscita ha la voce «Acconto su fattura da ricevere» (database, versione 370).
// Tutte le scritture passano dalle funzioni del database (ci_anticipo_dati, ci_aggancia_anticipo, ci_chiudi_anticipo, ci_riapri_anticipo,
// ci_sgancia_fattura_anticipo, ci_scarta_fattura_anticipo, ci_segna_anticipo), che ricontrollano tutto.

export const ARCHIVIO_ANTICIPI = "anticipi";
const ARANCIONE = "#D9730D";
const COLORI = { verde: C.green, grigio: C.muted, blu: C.blue, azzurro: C.blue, giallo: C.yellow, rosso: C.red, arancione: ARANCIONE };
const TIPI_DOCUMENTO = [["proforma", "Proforma"], ["preventivo", "Preventivo"], ["offerta", "Offerta"], ["ordine", "Ordine"], ["contratto", "Contratto"], ["altro", "Altro"]];
const importoIt = n => Number(n).toFixed(2).replace(".", ",");
const leggiImporto = t => { const s = String(t || "").trim().replace(/\s|€/g, ""); if (!s) return null; const x = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^\d+(\.\d{1,2})?$/.test(x)) return null; const n = Number(x); return n > 0 ? Math.round(n * 100) / 100 : null; };

// Legge tutto ciò che serve alla scheda (anche per il numero rosso del menu)
async function leggiAnticipi() {
  const [an, sc, fo, ab, cl, re] = await Promise.all([
    fetchAllPages((a, b) => supabase.from("ci_v_anticipi").select("*").order("anticipo_id").range(a, b)),
    fetchAllPages((a, b) => supabase.from("ci_anticipi_scarti").select("*").order("id").range(a, b)),
    fetchAllPages((a, b) => supabase.from("ci_fornitori").select("id, nome, partita_iva").order("id").range(a, b)),
    fetchAllPages((a, b) => supabase.from("ci_v_scadenzario").select("scadenza_id, lato, fattura_id, fornitore_id, cliente_id, numero_documento, data_documento, tipo_documento, importo, residuo, in_attesa_della_banca, data_scadenza")
      .gt("residuo", 0.005).gt("importo", 0).order("scadenza_id").range(a, b)),
    fetchAllPages((a, b) => supabase.from("ci_clienti").select("id, nome, partita_iva").order("id").range(a, b)), // versione 402: acconti dei clienti
    fetchAllPages((a, b) => supabase.from("ci_anticipi_restituzioni").select("anticipo_id, importo").order("id").range(a, b)), // versione 402: restituzioni a rate
  ]);
  for (const x of [an, sc, fo, ab, cl, re]) if (x.error) throw new Error(x.error.message);
  return { anticipi: an.data || [], scarti: sc.data || [], fornitori: fo.data || [], aperte: ab.data || [], clienti: cl.data || [], rate: re.data || [] };
}

// Numero rosso del menu: anticipi aperti che chiedono un'azione (fattura da controllare, da chiudere, in ritardo, segnalazione)
export async function contaAnticipiDaGuardare() {
  // solo per chi gestisce i conti (gli altri non possono fare niente: niente striscia né numero)
  const g = await supabase.rpc("ci_puo_gestire_conti");
  if (g.data !== true) return 0;
  const d = await leggiAnticipi();
  const oggi = oggiRoma();
  return d.anticipi.filter(a => a.stato === "aperto" && DA_GUARDARE.has(statoAnticipo(a, fattureCandidate(a, d.aperte, d.fornitori, d.scarti, [], d.clienti), oggi).codice)).length;
}

export default function AnticipiFornitori({ vaiA }) {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState("");
  const [giro, setGiro] = useState(0);
  const [filtro, setFiltro] = useState("aperti");
  const [verso, setVerso] = useState("uscita"); // versione 402: dati ai fornitori / ricevuti dai clienti
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
      const r = await supabase.from("ci_v_scadenzario").select("scadenza_id, fattura_id, fornitore_id, cliente_id, numero_documento, data_documento, importo, residuo").in("scadenza_id", idsSc);
      if (r.error) throw new Error(r.error.message);
      scadAgganciate = r.data || [];
    }
    // righe della banca e movimenti che sembrano anticipi (per i due elenchi in fondo)
    const [ri, doc, mv, abTutti, pr] = await Promise.all([
      fetchAllPages((a, b) => supabase.from("ci_righe_fonte").select("id, documento_id, conto_id, data_contabile, verso, importo, descrizione").eq("verso", "uscita").gte("data_contabile", "2026-01-01").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_documenti_fonte").select("id, annullato_il").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_pagamenti_fatture").select("id, data, verso, importo, controparte, causale, causale_gruppo, causale_voce, confermato_il, stornato_il, natura, riga_fonte_id, esercizio, progressivo, fornitore_id, cliente_id")
        .gte("data", "2026-01-01").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_abbinamenti_pagamenti").select("pagamento_id").order("id").range(a, b)),
      supabase.rpc("ci_puo_gestire_conti"),
    ]);
    const perdita = await supabase.rpc("ci_puo_segnare_perdita_anticipo"); // versione 402
    for (const x of [ri, doc, mv, abTutti]) if (x.error) throw new Error(x.error.message);
    const vivi = new Set((doc.data || []).filter(d => !d.annullato_il).map(d => d.id));
    const confermate = new Set((mv.data || []).filter(m => m.confermato_il && m.riga_fonte_id).map(m => m.riga_fonte_id));
    const conAbb = new Set((abTutti.data || []).map(x => x.pagamento_id));
    setDati({ ...base, agganci, scadAgganciate, sospette: righeSospette(ri.data || [], confermate, vivi), daSegnare: movimentiDaSegnare(mv.data || [], conAbb), gestore: pr.data === true, puoPerdita: perdita.data === true });
  })().catch(e => setErrore("Lettura non riuscita: " + e.message)); }, [giro]);

  const righe = useMemo(() => {
    if (!dati) return [];
    return dati.anticipi.map(a => {
      const agg = dati.agganci.filter(x => x.pagamento_id === a.pagamento_id).map(x => ({ ...x, s: dati.scadAgganciate.find(s => s.scadenza_id === x.scadenza_id) }));
      const cand = fattureCandidate(a, dati.aperte, dati.fornitori, dati.scarti, agg, dati.clienti);
      return { a, agg, cand, st: statoAnticipo(a, cand, oggi) };
    }).sort((x, y) => (x.a.stato === "aperto" ? 0 : 1) - (y.a.stato === "aperto" ? 0 : 1) || String(x.a.data_pagamento).localeCompare(String(y.a.data_pagamento)));
  }, [dati]);

  if (errore && !dati) return <div style={{ color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>;
  if (!dati) return <div>Lettura in corso…</div>;
  const delVerso = righe.filter(r => (r.a.verso || "uscita") === verso);
  const conta = codice => delVerso.filter(r => r.st.codice === codice).length;
  const visibili = delVerso.filter(r => filtro === "tutti" ? true : filtro === "chiusi" ? r.a.stato !== "aperto" : r.a.stato === "aperto");
  const fatto = (t) => { setEsito(t); setAperto(null); setGiro(g => g + 1); };
  const totaleAperto = delVerso.filter(r => r.a.stato === "aperto").reduce((t, r) => t + Number(r.a.residuo), 0);

  return <div style={{ maxWidth: 1300 }}>
    <div style={{ fontSize: 22, fontWeight: 800, color: C.primary }}>⏳ Anticipi e caparre in attesa di fattura</div>
    <div style={{ fontSize: 13, color: C.muted, margin: "4px 0 12px", maxWidth: 1050 }}>
      Un anticipo è un pagamento fatto prima della fattura: su una proforma, un preventivo o un'offerta. Resta qui finché arriva la fattura del fornitore.
      Quando la fattura entra nel programma, compare <b>accanto</b> all'anticipo: chi gestisce i conti (Teresa Demaria; al suo posto il Dott. Bizzarri o Colabucci)
      la controlla e <b>chiude</b>. Dal pagamento il fornitore ha 12 giorni per la fattura (per un servizio può arrivare entro il 15 del mese dopo); se non arriva l'anticipo diventa rosso e, avvicinandosi ai 90 giorni
      successivi, va fatta la segnalazione all'Agenzia delle Entrate (termini da confermare con lo Studio).
      L'anticipo nasce da solo quando un pagamento ha la voce «Acconto su fattura da ricevere» (in «Conferma dei movimenti» o in «Incassi e pagamenti»).
      <div style={{ marginTop: 6 }}><b>Caparra confirmatoria su preventivo</b> (versione 374): nasce allo stesso modo con la sua voce. È una garanzia dell'affare (art. 1385 c.c.), fuori campo IVA e senza fattura al pagamento (da confermare con lo Studio):
      niente «fattura in ritardo» né segnalazione TD29. Si scrive la <b>data di consegna prevista</b>: fino a quella data è gialla, dopo arancione «Consegna in ritardo: chiedere al fornitore».
      Alla consegna la fattura si aggancia qui e la caparra risulta <b>imputata alla fattura</b>; se l'affare salta si sceglie l'esito: <b>restituita</b>, <b>trattenuta</b> (perdita) o <b>restituita il doppio</b>.</div>
      <div style={{ marginTop: 6 }}><b>Versione 402.</b> Anche la <b>caparra penitenziale</b> (art. 1386 c.c.: il prezzo per potersi tirare indietro) e gli <b>acconti e le caparre ricevuti dai clienti</b> (scheda «Ricevuti dai clienti»: la fattura d'acconto la emette Podere Verde entro 12 giorni dall'incasso).
      Un acconto che torna indietro si chiude con l'esito <b>restituito</b> (anche in parte, con il movimento della banca). Chiudere senza fattura vuol dire <b>perdere</b> i soldi: lo può fare solo chi ha l'autorizzazione «Può segnare la perdita di un acconto».
      Se la fattura del fornitore è a zero (saldo già al netto dell'acconto), l'anticipo si chiude con <b>«Chiudi con la fattura a zero»</b>, solo con l'autorizzazione. Una restituzione può arrivare <b>a rate</b>: ogni movimento si registra come rata finché il conto torna. L'acconto <b>ricevuto da un cliente</b> si chiude solo agganciando la fattura emessa da Podere Verde: non si perde e non si chiude senza fattura.</div>
    </div>
    {!dati.gestore && <div style={{ ...scheda, borderLeft: `4px solid ${C.yellow}`, fontSize: 13 }}>Si può solo guardare: controllare e chiudere gli anticipi spetta a chi gestisce i conti.</div>}
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      {[["Fattura arrivata: da controllare", conta("da controllare") + conta("da chiudere"), C.blue], ["In attesa della fattura", conta("in attesa"), C.yellow],
        ["Fattura in ritardo", conta("in ritardo"), C.red], ["Segnalazione all'Agenzia", conta("segnalazione"), C.red], ["Caparre: consegna in ritardo o da scrivere", conta("consegna in ritardo") + conta("senza consegna"), ARANCIONE], ["Chiusi", conta("chiuso"), C.green]].map(([t, n, col]) =>
        <div key={t} style={{ flex: "1 1 180px", border: `2px solid ${col}`, background: `${col}12`, borderRadius: 12, padding: "8px 12px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: col }}>{t}</div><div style={{ fontSize: 24, fontWeight: 800, color: col }}>{n}</div></div>)}
      <div style={{ flex: "1 1 180px", border: `2px solid ${C.primary}`, borderRadius: 12, padding: "8px 12px" }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.primary }}>Anticipato e ancora senza fattura</div><div style={{ fontSize: 24, fontWeight: 800, color: C.primary }}>{euro(totaleAperto)}</div></div>
    </div>
    {esito && <div style={{ ...scheda, border: `2px solid ${C.green}`, fontWeight: 700, color: C.green }}>✔ {esito} <button style={{ ...btn(false), marginLeft: 8, height: 26 }} onClick={() => setEsito("")}>Chiudi</button></div>}
    {errore && <div style={{ ...scheda, color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>}
    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
      {[["uscita", "Dati ai fornitori"], ["entrata", "Ricevuti dai clienti"]].map(([k, n]) => <button key={k} style={btn(verso === k)} onClick={() => { setVerso(k); setAperto(null); }}>{n} ({righe.filter(r => (r.a.verso || "uscita") === k && r.a.stato === "aperto").length} aperti)</button>)}
    </div>
    <div style={{ ...scheda, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <label>Mostra <select style={input} value={filtro} onChange={e => setFiltro(e.target.value)}><option value="aperti">aperti</option><option value="chiusi">chiusi e annullati</option><option value="tutti">tutti</option></select></label>
      <span style={{ fontSize: 12.5, color: C.muted }}>{visibili.length} anticipi</span>
    </div>
    <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, background: "#fff" }}>
      <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Stato", verso === "entrata" ? "Incassato il" : "Pagato il", verso === "entrata" ? "Cliente" : "Fornitore", "Anticipo", "Documento", "Fatture accanto", "Senza fattura", ""].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
      <tbody>{visibili.map(({ a, agg, cand, st }) => { const col = COLORI[st.colore]; return [
        <tr key={a.anticipo_id} style={{ borderBottom: `1px solid ${C.border}`, background: `${col}10` }}>
          <td style={{ padding: "5px 8px", color: col, fontWeight: 800 }}>{st.nome}<div style={{ fontWeight: 400, color: C.text, fontSize: 11.5, maxWidth: 260 }}>{st.testo}</div></td>
          <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{dataIt(a.data_pagamento)}{a.progressivo ? <div style={{ color: C.muted, fontSize: 11 }}>{a.esercizio}/{String(a.progressivo).padStart(6, "0")}</div> : a.codice_attesa ? <div style={{ color: C.blue, fontSize: 11 }}>{a.codice_attesa}</div> : null}</td>
          <td style={{ padding: "5px 8px", fontWeight: 700 }}>{a.fornitore || <span style={{ color: C.red }}>da scegliere ({a.controparte || "—"})</span>}{a.partita_iva ? <div style={{ fontWeight: 400, color: C.muted, fontSize: 11 }}>P. IVA {a.partita_iva}</div> : null}</td>
          <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>{euro(a.importo)}<div style={{ fontWeight: 700, fontSize: 11, color: E_CAPARRA(a.tipo) ? ARANCIONE : C.muted, whiteSpace: "nowrap" }}>{a.tipo === "caparra" ? "Caparra confirmatoria" : a.tipo === "caparra_penitenziale" ? "Caparra penitenziale" : "Acconto"}</div></td>
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
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>Pagamenti e incassi del gruppo «Fatture» (e pagamenti «Investimenti»), senza fatture abbinate, con le parole dell'anticipo nella causale. Se sono soldi passati prima della fattura, «Segna come anticipo».</div>
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
        fatto(`${m.verso === "entrata" ? "L'incasso" : "Il pagamento"} del ${dataIt(m.data)} di ${euro(m.importo)} è ora un anticipo in attesa di fattura.`);
      }}>Segna come anticipo</button></>}
    {errore && <span style={{ color: C.red, fontWeight: 700 }}>⚠️ {errore}</span>}
  </div>;
}

function Dettaglio({ a, agg, cand, dati, fatto }) {
  const puo = dati.gestore && a.stato === "aperto";
  const entrata = a.verso === "entrata"; // versione 402
  const conRate = (dati.rate || []).some(r => r.anticipo_id === a.anticipo_id); // versione 402: con restituzioni registrate si chiude solo con l'esito
  const [v, setV] = useState({ fornitore_id: a.fornitore_id || "", cliente_id: a.cliente_id || "", partita_iva: a.partita_iva || "", documento_tipo: a.documento_tipo || "", documento_numero: a.documento_numero || "",
    documento_data: a.documento_data || "", documento_totale: a.documento_totale ? importoIt(a.documento_totale) : "", note: a.note || "" });
  const datiDaSalvare = () => ({ anticipo_id: a.anticipo_id, ...v, fornitore_id: v.fornitore_id || "", cliente_id: v.cliente_id || "", documento_totale: v.documento_totale ? String(leggiImporto(v.documento_totale) ?? "") : "" });
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
  if (scelte.length && !(entrata ? a.cliente_id : a.fornitore_id)) problemi.push(entrata ? "scegliere e salvare prima il cliente" : "scegliere e salvare prima il fornitore dell'anticipo");
  if (v.documento_totale && !leggiImporto(v.documento_totale)) problemi.push("totale del documento non valido");
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
      const r = await supabase.rpc("ci_anticipo_dati", { p: { ...datiDaSalvare(), documento_pdf: percorso } });
      if (r.error) throw new Error(r.error.message);
      setLavoro(false); fatto(`PDF del documento allegato all'anticipo di ${a.fornitore || a.controparte}.`);
    } catch (e) { setLavoro(false); setErrore("PDF non allegato: " + e.message); }
  }
  const fornitoriOrdinati = useMemo(() => [...(entrata ? dati.clienti : dati.fornitori)].sort((x, y) => String(x.nome || "").localeCompare(String(y.nome || ""))), [dati.fornitori, dati.clienti, entrata]);
  const chiaveSoggetto = entrata ? "cliente_id" : "fornitore_id";

  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 14, fontSize: 12.5 }}>
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
      <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>{nomeTipo(a)}</div>
      <div>Pagato il <b>{dataIt(a.data_pagamento)}</b> {a.progressivo ? `(prima nota ${a.esercizio}/${String(a.progressivo).padStart(6, "0")})` : a.codice_attesa ? `(disposizione ${a.codice_attesa}, in attesa della banca)` : ""} — <b>{euro(a.importo)}</b> con {a.modalita || "—"}</div>
      <div style={{ color: C.muted, margin: "3px 0" }}>Causale: {a.causale || "—"}</div>
      {E_CAPARRA(a.tipo) ? <Consegna a={a} puo={puo} chiama={chiama} lavoro={lavoro} />
        : entrata ? <div>Podere Verde emette la fattura d'acconto entro il <b>{dataIt(a.fattura_attesa_entro)}</b> (12 giorni dall'incasso).</div>
        : <div>Fattura attesa entro il <b>{dataIt(a.fattura_attesa_entro)}</b>; segnalazione all'Agenzia entro il <b>{dataIt(a.segnalazione_entro)}</b> (90 giorni dal termine della fattura, D.Lgs. 87/2024).</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
        <label style={{ gridColumn: "1 / -1" }}>{entrata ? "Cliente" : "Fornitore"}<br /><select style={{ ...input, width: "100%", borderColor: !v[chiaveSoggetto] ? C.red : C.border }} disabled={!puo || agg.length > 0} value={v[chiaveSoggetto]} onChange={e => cambia(chiaveSoggetto, e.target.value ? Number(e.target.value) : "")}>
          <option value="">— scegliere (se non c'è ancora, scrivere la partita IVA: lo riconosce quando arriva la fattura) —</option>{fornitoriOrdinati.map(f => <option key={f.id} value={f.id}>{f.nome}{f.partita_iva ? ` — ${f.partita_iva}` : ""}</option>)}</select></label>
        <label>Partita IVA {entrata ? "del cliente" : "del fornitore (dalla proforma)"}<br /><input style={{ ...input, width: "100%" }} disabled={!puo} value={v.partita_iva} onChange={e => cambia("partita_iva", e.target.value)} /></label>
        <label>Documento<br /><select style={{ ...input, width: "100%" }} disabled={!puo} value={v.documento_tipo} onChange={e => cambia("documento_tipo", e.target.value)}><option value="">—</option>{TIPI_DOCUMENTO.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label>Numero<br /><input style={{ ...input, width: "100%" }} disabled={!puo} value={v.documento_numero} onChange={e => cambia("documento_numero", e.target.value)} /></label>
        <label>Data<br /><input type="date" style={{ ...input, width: "100%" }} disabled={!puo} value={v.documento_data || ""} onChange={e => cambia("documento_data", e.target.value)} /></label>
        <label>Totale del documento (€)<br /><input style={{ ...input, width: "100%", borderColor: v.documento_totale && !leggiImporto(v.documento_totale) ? C.red : C.border }} disabled={!puo} value={v.documento_totale} onChange={e => cambia("documento_totale", e.target.value)} placeholder="dal preventivo: gli acconti non lo possono superare" /></label>
        <label style={{ gridColumn: "1 / -1" }}>Nota<br /><input style={{ ...input, width: "100%" }} disabled={!puo} value={v.note} onChange={e => cambia("note", e.target.value)} /></label>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {a.documento_pdf ? <button style={btn(false)} onClick={apriPdfAnticipo}>📄 Apri il documento</button> : <span style={{ color: C.muted, alignSelf: "center" }}>Nessun PDF del documento.</span>}
        {puo && <><button style={btn(false)} disabled={lavoro} onClick={() => fileRef.current?.click()}>📎 {a.documento_pdf ? "Sostituisci il PDF" : "Allega il PDF"}</button>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; caricaPdfAnticipo(f); }} />
          <button style={btn(true)} disabled={lavoro || (v.documento_totale && !leggiImporto(v.documento_totale))} onClick={() => chiama("ci_anticipo_dati", { p: datiDaSalvare() }, "Dati dell'anticipo salvati.")}>Salva i dati</button></>}
      </div>
    </div>

    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
      <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>Le fatture accanto</div>
      {agg.length > 0 && <div style={{ marginBottom: 8 }}><b>Agganciate</b>{agg.map(x => <Agganciata key={x.id} x={x} a={a} puo={puo} chiama={chiama} />)}</div>}
      {a.stato === "aperto" && conRate && <div style={{ color: ARANCIONE, fontWeight: 700 }}>Ci sono restituzioni registrate: l'anticipo si chiude con l'esito della restituzione, non con una fattura. Se una restituzione è sbagliata si storna il suo movimento.</div>}
      {a.stato === "aperto" && !conRate && <>
        <b>{entrata ? "Emesse al cliente" : "Arrivate dal fornitore"} e non ancora agganciate</b>
        {!cand.length && <div style={{ color: C.muted }}>{(entrata ? a.cliente_id : a.fornitore_id) || a.partita_iva ? `Nessuna fattura aperta del ${entrata ? "cliente" : "fornitore"}.` : `Scegliere il ${entrata ? "cliente" : "fornitore"} o scrivere la partita IVA.`}</div>}
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
          {puo && !conRate && <>
            {scelte.length > 0 && <button style={btn(false)} disabled={lavoro || problemi.length > 0} onClick={() => chiama("ci_aggancia_anticipo", { p_anticipo: a.anticipo_id, p_fatture: scelte.map(q => ({ scadenza_id: q.s.scadenza_id, importo: q.imp })), p_chiudi: false, p_motivo: motivo },
              `Fatture agganciate all'anticipo di ${a.fornitore || a.controparte}: l'anticipo resta aperto${Math.abs(dopo) < 0.005 ? "" : ` per ${euro(dopo)}`}.`)}>Aggancia (resta aperto)</button>}
            {(scelte.length > 0 || agg.length > 0) && !(Math.abs(dopo) > 0.005 && (entrata || !dati.puoPerdita)) && <button style={btn(true, C.green)} disabled={lavoro || problemi.length > 0 || (Math.abs(dopo) > 0.005 && !motivo.trim())}
              onClick={() => chiama("ci_aggancia_anticipo", { p_anticipo: a.anticipo_id, p_fatture: scelte.map(q => ({ scadenza_id: q.s.scadenza_id, importo: q.imp })), p_chiudi: true, p_motivo: motivo },
                `Anticipo di ${a.fornitore || a.controparte} controllato e chiuso.`)}>{scelte.length ? "Aggancia e chiudi" : "Chiudi con le fatture agganciate"}</button>}
            {!E_CAPARRA(a.tipo) && !entrata && dati.puoPerdita && <button style={btn(false, C.red)} disabled={lavoro || !motivo.trim()} onClick={() => chiama("ci_chiudi_anticipo", { p_anticipo: a.anticipo_id, p_motivo: motivo }, "Anticipo chiuso senza fattura: segnato come perdita, con il motivo.")}>Chiudi senza fattura (perdita)</button>}
          </>}
          {a.stato === "chiuso" && <button style={btn(false)} disabled={lavoro || !motivo.trim()} onClick={() => chiama("ci_riapri_anticipo", { p_anticipo: a.anticipo_id, p_motivo: motivo }, "Anticipo riaperto.")}>Riapri</button>}
        </div>
        {a.stato === "aperto" && Math.abs(dopo) > 0.005 && (scelte.length > 0 || agg.length > 0) && <div style={{ color: C.muted, fontSize: 11.5, marginTop: 4 }}>Chiudere con {euro(dopo)} ancora senza fattura vuol dire perderli: serve il motivo e l'autorizzazione «Può segnare la perdita di un acconto». Se {entrata ? "si restituisce al cliente" : "il fornitore restituisce"}, usare «Se l'affare salta».{entrata ? " Per l'acconto del cliente la differenza resta aperta finché non si emette la fattura." : ""}</div>}
      </div>}
      {a.stato === "aperto" && !agg.length && !(a.codice_attesa && !a.confermato_il) && <EsitoCaparra a={a} puo={puo} chiama={chiama} lavoro={lavoro} puoPerdita={dati.puoPerdita} />}
      {a.stato === "aperto" && puo && a.verso !== "entrata" && dati.puoPerdita && !conRate && <ChiudiConFattura a={a} chiama={chiama} lavoro={lavoro} />}
      {errore && <div style={{ color: C.red, fontWeight: 700, marginTop: 6 }}>⚠️ {errore}</div>}
    </div>
  </div>;
}

// Versione 374 — caparra: data di consegna prevista (cambiarla chiede il motivo)
function Consegna({ a, puo, chiama, lavoro }) {
  const [d, setD] = useState(a.consegna_prevista || "");
  const [m, setM] = useState("");
  const cambia = a.consegna_prevista && d && d !== a.consegna_prevista;
  return <div style={{ border: `1px solid ${ARANCIONE}`, borderRadius: 8, padding: 6, margin: "4px 0" }}>
    <div>{a.tipo === "caparra_penitenziale" ? "Caparra penitenziale (art. 1386 c.c.)" : "Caparra confirmatoria"}{a.verso === "entrata" ? " ricevuta dal cliente" : ""}: niente fattura al pagamento e niente segnalazione TD29 (da confermare con lo Studio). Consegna prevista: <b>{a.consegna_prevista ? dataIt(a.consegna_prevista) : "non scritta"}</b>.</div>
    {puo && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
      <input type="date" style={{ ...input, borderColor: !d ? C.red : C.border }} value={d} onChange={e => setD(e.target.value)} />
      {cambia && <input style={{ ...input, flex: 1, minWidth: 200 }} placeholder="Motivo del cambio della data (obbligatorio)" value={m} onChange={e => setM(e.target.value)} />}
      <button style={btn(true)} disabled={lavoro || !d || d === a.consegna_prevista || (cambia && !m.trim())}
        onClick={() => chiama("ci_caparra_consegna", { p_anticipo: a.anticipo_id, p_data: d, p_motivo: m }, `Consegna prevista della caparra di ${a.fornitore || a.controparte}: ${dataIt(d)}.`)}>Salva la consegna prevista</button>
    </div>}
  </div>;
}

// Versione 374 — caparra: se l'affare salta (art. 1385 c.c.), decisione del Dott. Bizzarri del 12/11/2026 ore 18:05
function EsitoCaparra({ a, puo, chiama, lavoro, puoPerdita }) {
  const caparra = E_CAPARRA(a.tipo); const entrata = a.verso === "entrata"; // versione 402: anche acconti, caparra penitenziale, clienti
  const [esito, setEsito] = useState("");
  const [mov, setMov] = useState("");
  const [motivo, setMotivo] = useState("");
  const [incassi, setIncassi] = useState(null);
  const [rate, setRate] = useState([]); // versione 402 (ricontrollo 25/11): restituzioni a rate già registrate
  const dovuto = esito === "restituita_doppio" ? Math.round(Number(a.importo) * 200) / 100 : Number(a.importo);
  const restituzione = ["restituita", "restituita_doppio", "restituito"].includes(esito);
  const giaRese = rate.reduce((t, x) => t + Number(x.importo), 0);
  useEffect(() => { if (!puo) return; (async () => {
    const r = await supabase.from("ci_anticipi_restituzioni").select("id, movimento_id, importo, motivo, deciso_il").eq("anticipo_id", a.anticipo_id).order("id");
    setRate(r.error ? [] : r.data || []);
  })(); }, [puo, a.anticipo_id]);
  useEffect(() => { if (!puo || !restituzione) return; setMov(""); (async () => {
    // solo movimenti confermati dello stesso soggetto, non abbinati a fatture e non già usati per una restituzione (come vuole il database)
    let q = supabase.from("ci_pagamenti_fatture").select("id, data, importo, controparte, causale, esercizio, progressivo, fornitore_id, cliente_id")
      .eq("verso", entrata ? "uscita" : "entrata").is("stornato_il", null).not("confermato_il", "is", null).gte("data", a.data_pagamento).lte("importo", Math.max(dovuto - giaRese, 0) + 0.005).order("data");
    q = entrata ? q.eq("cliente_id", a.cliente_id || -1) : q.eq("fornitore_id", a.fornitore_id || -1);
    const r = await q;
    const l = r.data || [];
    const ids = l.map(x => x.id);
    const [ab, us, ua] = ids.length ? await Promise.all([
      supabase.from("ci_abbinamenti_pagamenti").select("pagamento_id").in("pagamento_id", ids),
      supabase.from("ci_anticipi_restituzioni").select("movimento_id").in("movimento_id", ids),
      supabase.from("ci_anticipi").select("esito_movimento_id").in("esito_movimento_id", ids),
    ]) : [{ data: [] }, { data: [] }, { data: [] }];
    const occupati = new Set([...(ab.data || []).map(x => x.pagamento_id), ...(us.data || []).map(x => x.movimento_id), ...(ua.data || []).map(x => x.esito_movimento_id)]);
    setIncassi(r.error ? [] : l.filter(x => !occupati.has(x.id)));
  })(); }, [esito, puo, a.data_pagamento, a.fornitore_id, a.cliente_id, dovuto, giaRese, restituzione, entrata]);
  const doppio = euro(Math.round(Number(a.importo) * 200) / 100);
  const scelte = caparra
    ? [["restituita", entrata ? "Restituita al cliente" : "Restituita dal fornitore", "affare sciolto d'accordo: serve il movimento della banca (anche a rate)"],
       ["trattenuta", entrata ? "Trattenuta da Podere Verde" : "Trattenuta dal fornitore", entrata ? "il cliente si è tirato indietro: resta a Podere Verde" : "inadempiente Podere Verde: la caparra diventa perdita"],
       ["restituita_doppio", "Restituita il doppio", entrata ? `inadempiente Podere Verde: deve ${doppio} (solo con l'autorizzazione)` : `inadempiente il fornitore: deve ${doppio}`]]
    : [["restituito", entrata ? "Restituito al cliente" : "Restituito dal fornitore", "affare saltato: serve il movimento della banca (anche a rate)"]];
  if (caparra && !entrata && !puoPerdita) scelte.splice(1, 1); // «trattenuta dal fornitore» è una perdita: solo con l'autorizzazione
  if (caparra && entrata && !puoPerdita) scelte.splice(scelte.findIndex(x => x[0] === "restituita_doppio"), 1); // il doppio al cliente è una perdita
  if (puoPerdita && !entrata && !rate.length) scelte.push(["perso", caparra ? "Persa (perdita)" : "Perso (perdita)", "i soldi non tornano: solo con l'autorizzazione"]);
  if (!puo) return null;
  const scelto = (incassi || []).find(x => String(x.id) === String(mov));
  const totale = giaRese + (scelto ? Number(scelto.importo) : 0);
  const inParte = restituzione && totale < dovuto - 0.005;
  const nome = `${caparra ? "Caparra" : "Acconto"} di ${a.fornitore || a.controparte}`;
  return <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
    <b>Se l'affare salta</b> <span style={{ color: C.muted }}>(si sceglie l'esito)</span>
    {rate.length > 0 && <div style={{ margin: "4px 0", color: C.primary }}>Restituzioni già registrate: <b>{euro(giaRese)}</b> ({rate.map(x => `${euro(x.importo)} del ${dataIt(String(x.deciso_il).slice(0, 10))}`).join("; ")}).</div>}
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
      {scelte.map(([k, n, d]) =>
        <button key={k} title={d} style={{ ...btn(esito === k), height: "auto", padding: "4px 8px", textAlign: "left" }} onClick={() => setEsito(esito === k ? "" : k)}>{n}<br /><span style={{ fontSize: 11, fontWeight: 400 }}>{d}</span></button>)}
    </div>
    {esito && <>
      {restituzione && <label>Movimento della banca o della cassa{giaRese > 0 ? " (rata successiva)" : ""} fino a {euro(Math.max(dovuto - giaRese, 0))} (dal {dataIt(a.data_pagamento)})<br />
        <select style={{ ...input, width: "100%", borderColor: !mov && !giaRese ? C.red : C.border }} value={mov} onChange={e => setMov(e.target.value)}>
          <option value="">{incassi === null ? "lettura…" : incassi.length ? "— scegliere il movimento —" : `nessun movimento di ${entrata ? "questo cliente" : "questo fornitore"}: prima confermarlo in «Conferma dei movimenti»`}</option>
          {(incassi || []).map(x => <option key={x.id} value={x.id}>{dataIt(x.data)} — {euro(x.importo)} — {x.controparte || ""} {x.causale ? "— " + x.causale : ""}</option>)}</select></label>}
      {esito === "restituita_doppio" && !mov && !giaRese && <div style={{ color: ARANCIONE, fontWeight: 700 }}>{entrata ? "Podere Verde deve" : "Il fornitore deve"} {euro(dovuto)}: la caparra resta aperta finché il movimento non c'è.</div>}
      <input style={{ ...input, width: "100%", margin: "6px 0" }} placeholder="Motivo (obbligatorio)" value={motivo} onChange={e => setMotivo(e.target.value)} />
      {inParte && (scelto || giaRese > 0) && <div style={{ color: ARANCIONE, fontWeight: 700 }}>Restituiti {euro(totale)} su {euro(dovuto)}: se il resto arriverà, registrare questo movimento come rata; chiudere adesso {entrata ? "lascia a Podere Verde la differenza senza fattura" : "vuol dire perdere la differenza"}{puoPerdita ? " (lo può fare chi ha l'autorizzazione)" : ": serve l'autorizzazione «Può segnare la perdita di un acconto»"}.</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {restituzione && scelto && inParte && <button style={btn(false)} disabled={lavoro}
          onClick={() => chiama("ci_restituzione_rata", { p_anticipo: a.anticipo_id, p_movimento: Number(mov), p_motivo: motivo }, `${nome}: rata di ${euro(scelto.importo)} registrata, resta aperto.`)}>Registra come rata (resta aperto)</button>}
        {!(inParte && !puoPerdita) && <button style={btn(true, ["trattenuta", "perso"].includes(esito) && !entrata ? C.red : C.green)} disabled={lavoro || !motivo.trim() || (restituzione && !mov && !giaRese)}
          onClick={() => chiama("ci_esito_anticipo", { p_anticipo: a.anticipo_id, p_esito: esito, p_movimento: restituzione && mov ? Number(mov) : null, p_motivo: motivo }, `${nome} chiuso: ${{ restituita: "restituita", trattenuta: entrata ? "trattenuta da Podere Verde" : "trattenuta (perdita)", restituita_doppio: "restituita il doppio", restituito: "restituito", perso: "perdita" }[esito]}.`)}>Chiudi con questo esito</button>}
      </div>
      <div style={{ color: C.muted, fontSize: 11.5, marginTop: 4 }}>Trattamento contabile e fiscale della perdita e del doppio incassato: da confermare con lo Studio Cacurri.</div>
    </>}
  </div>;
}

function Candidata({ s, a, puo, quota, setQuota, resto, chiama }) {
  const [statiFattura] = useStatiFatture([s.fattura_id]); // versione 375: contestata / in attesa di nota di credito
  const [scarta, setScarta] = useState(false); const [perche, setPerche] = useState("");
  const sp = quota !== undefined;
  const suggerita = Math.min(Number(s.residuo), Math.max(resto, 0));
  return <div style={{ borderBottom: `1px dashed ${C.border}`, padding: "5px 0" }}>
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        {puo && <input type="checkbox" checked={sp} onChange={e => setQuota(e.target.checked ? importoIt(suggerita) : undefined)} />}
        <span><EtichettaStatoFattura stato={statiFattura[s.fattura_id]} piccola /><b>n. {s.numero_documento}</b> del {dataIt(s.data_documento)} — {s.tipo_documento || ""} — totale {euro(s.importo)}, da pagare {euro(s.residuo)}</span></label>
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

// Versione 402 — chiusura con una fattura che non si può agganciare: la fattura d'acconto già pagata da «Pagamento fatture» (TD02, TD03)
// oppure il saldo a zero (caso vero: Asterisco 119/A e 120/A d'acconto, saldi 142/A e 143/A a 0,00 € nel 2022). Il database ricontrolla tutto.
function ChiudiConFattura({ a, chiama, lavoro }) {
  const [apri, setApri] = useState(false); const [elenco, setElenco] = useState(null); const [scelta, setScelta] = useState(""); const [motivo, setMotivo] = useState("");
  const entrata = a.verso === "entrata"; const soggetto = entrata ? a.cliente_id : a.fornitore_id;
  useEffect(() => { if (!apri || !soggetto) return; (async () => {
    const r = await supabase.from("ci_fatture").select("id, numero, data, tipo_documento, totale_lordo").eq(entrata ? "cliente_id" : "fornitore_id", soggetto)
      .eq("totale_lordo", 0).order("data", { ascending: false }).limit(50);
    setElenco(r.error ? [] : (r.data || []));
  })(); }, [apri, soggetto, entrata]);
  if (!soggetto) return null;
  return <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
    <button style={btn(apri)} onClick={() => setApri(!apri)}>Chiudi con la fattura a zero (saldo già al netto dell'acconto)</button>
    {apri && <div style={{ marginTop: 6 }}>
      <select style={{ ...input, width: "100%" }} value={scelta} onChange={e => setScelta(e.target.value)}>
        <option value="">{elenco === null ? "lettura…" : elenco.length ? "— scegliere la fattura —" : "nessuna fattura a zero di questo fornitore"}</option>
        {(elenco || []).map(f => <option key={f.id} value={f.id}>n. {f.numero} del {dataIt(f.data)} — {f.tipo_documento || ""} — {euro(f.totale_lordo)}</option>)}</select>
      <input style={{ ...input, width: "100%", margin: "6px 0" }} placeholder="Motivo (obbligatorio)" value={motivo} onChange={e => setMotivo(e.target.value)} />
      <button style={btn(true, C.green)} disabled={lavoro || !scelta || !motivo.trim()} onClick={() => chiama("ci_chiudi_anticipo_con_fattura", { p_anticipo: a.anticipo_id, p_fattura: Number(scelta), p_motivo: motivo }, "Anticipo chiuso con la fattura scelta.")}>Chiudi con questa fattura</button>
      <div style={{ color: C.muted, fontSize: 11.5, marginTop: 4 }}>Solo una fattura a zero dello stesso fornitore, e solo con l'autorizzazione «Può segnare la perdita di un acconto»; le altre fatture si agganciano in «Le fatture accanto». Una fattura d'acconto pagata con un altro movimento vuol dire soldi usciti due volte: il programma lo segnala.</div>
    </div>}
  </div>;
}
