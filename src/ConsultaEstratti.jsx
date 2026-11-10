import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
import { dataIt, euro } from "./analisiDocumentoBanca";
import { browserAdatto, controllaCartella, leggiByte } from "./cartellaBanche";

// Versione 353 — «Banche, carte e cassa» → «Estratti e movimenti: consulta» (decisioni del 09/11/2026 ore 21:35–21:37, 10-bis.10).
// Per ogni conto: saldo, periodi mancanti, quadratura, costi della banca nel periodo; documenti caricati (apri il PDF alla pagina,
// annulla per chi gestisce i conti); una sola ricerca su tutti i movimenti della banca, con il collegamento alla prima nota.
const COSTI = /^(COMMISSIONI|COMM\.|CANONE|IMPOSTA DI BOLLO|SPESE|COMPETENZE|INTERESSI|ADDEBITO BOLLO)/i;

export default function ConsultaEstratti() {
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState("");
  const [cerca, setCerca] = useState("");
  const [anno, setAnno] = useState(String(new Date().getFullYear()));
  const [radice, setRadice] = useState(null);
  const [annulla, setAnnulla] = useState(null);   // { id, motivo }
  const [messaggio, setMessaggio] = useState("");
  const [vista, setVista] = useState(null);
  const [daTogliere, setDaTogliere] = useState(null);       // { url, nome, pagina } — il PDF mostrato dentro la pagina

  async function carica() {
    const [c, s, m, g, k] = await Promise.all([
      supabase.from("ci_conti").select("id, nome, tipo, stato").order("id"),
      supabase.from("ci_v_stato_conti").select("*"),
      supabase.from("ci_v_periodi_mancanti").select("*"),
      supabase.rpc("ci_puo_gestire_conti"),
      supabase.from("ci_banche_cartella").select("codice"),
    ]);
    const e = c.error || s.error || m.error || k.error; if (e) throw new Error(e.message);
    const [docs, righe, arch, mov] = await Promise.all([
      fetchAllPages((a, b) => supabase.from("ci_documenti_fonte").select("id, conto_id, tipo, origine, periodo_dal, periodo_al, saldo_iniziale, saldo_finale, numero_righe, righe_gia_presenti, pdf_impronta, file_digitale_impronta, pdf_percorso, file_digitale_percorso, caricato_il, annullato_il, motivo_annullamento").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_righe_fonte").select("id, documento_id, conto_id, data_contabile, data_valuta, verso, importo, descrizione, numero_bonifico, controparte, pagina_pdf").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_banche_archivio").select("impronta, percorso").order("impronta").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_pagamenti_fatture").select("id, riga_fonte_id, data, importo").order("id").range(a, b)),
    ]);
    for (const x of [docs, righe, arch, mov]) if (x.error) throw new Error(x.error.message);
    const saldi = {};
    for (const st of s.data || []) if (st.controllo_ok_alla_data && (c.data || []).some(x => x.id === st.conto_id && x.tipo !== "cassa")) {
      const r = await supabase.rpc("ci_saldo_al", { p_conto: st.conto_id, p_giorno: st.controllo_ok_alla_data }); saldi[st.conto_id] = r.data;
    }
    const collegati = new Map((mov.data || []).filter(x => x.riga_fonte_id).map(x => [x.riga_fonte_id, x]));
    setD({ conti: (c.data || []).filter(x => x.tipo !== "cassa" || (s.data || []).some(y => y.conto_id === x.id && y.partenza_alla_data)), stati: s.data || [], mancanti: m.data || [], gestore: g.data === true,
      codice: k.data?.[0]?.codice || null, documenti: docs.data || [], righe: righe.data || [], archivio: new Map((arch.data || []).map(a => [a.impronta, a.percorso])), collegati, saldi });
  }
  useEffect(() => { carica().catch(x => setErrore("Lettura non riuscita: " + x.message)); }, []);

  const docVivi = useMemo(() => new Map((d?.documenti || []).filter(x => !x.annullato_il).map(x => [x.id, x])), [d]);
  const trovate = useMemo(() => {
    if (!d || cerca.trim().length < 2) return [];
    const t = cerca.trim().toLowerCase();
    const num = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : /^\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, "")) : Number(t);
    const data = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return d.righe.filter(r => docVivi.has(r.documento_id) && (
      (data && r.data_contabile === `${data[3]}-${data[2]}-${data[1]}`) ||
      (!Number.isNaN(num) && /^[\d.,]+$/.test(t) && Math.abs(Number(r.importo) - num) < 0.005) ||
      [r.descrizione, r.controparte, r.numero_bonifico].some(v => String(v || "").toLowerCase().includes(t))
    )).sort((a, b) => b.data_contabile.localeCompare(a.data_contabile)).slice(0, 300);
  }, [d, cerca, docVivi]);

  async function prendiCartella() {
    let h = radice;
    if (!h) {
      if (!browserAdatto()) { setMessaggio("Per aprire i file dell'archivio serve Chrome o Edge sul computer."); return null; }
      try { h = await window.showDirectoryPicker({ id: "banche-podere-verde", mode: "read" }); }
      catch (x) { if (x?.name !== "AbortError") setMessaggio("Scelta della cartella non riuscita: " + x.message); return null; }
    }

    const k = await controllaCartella(h, d.codice); if (!k.ok) { setMessaggio(k.problema); return null; }
    setRadice(h); return h;
  }
  async function apri(doc, pagina) {
    setMessaggio("");
    const imp = doc.pdf_impronta || doc.file_digitale_impronta; const percorso = d.archivio.get(imp);
    if (!percorso) { setMessaggio(`Il documento n. ${doc.id} non è ancora nell'archivio di BANCHE: metterne una copia in «ESTRATTI CONTO DA SMISTARE» e fare «Leggi» e «Archivia e carica» (risulterà già caricato e verrà archiviato).`); return; }
    const h = await prendiCartella(); if (!h) return;
    try {
      const byte = await leggiByte(h, percorso);
      const tipo = percorso.toLowerCase().endsWith(".pdf") ? "application/pdf" : percorso.toLowerCase().endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.ms-excel";
      if (vista?.url) URL.revokeObjectURL(vista.url);
      const url = URL.createObjectURL(new Blob([byte], { type: tipo }));
      setVista({ url, nome: percorso.split("\\").pop(), pagina: pagina || 1, pdf: tipo === "application/pdf" });
    } catch (x) {
      setMessaggio("Apertura non riuscita: " + x.message + (d.gestore ? " — Se il file è stato spostato o rinominato nel cloud: «Togli la registrazione» qui sotto, poi rimettere il file in «ESTRATTI CONTO DA SMISTARE» e fare «Leggi» e «Archivia e carica»." : " — Avvisare chi gestisce i conti."));
      if (d.gestore) setDaTogliere({ impronta: imp, percorso });
    }
  }
  async function togliRegistrazione() {
    const { error } = await supabase.from("ci_banche_archivio").delete().eq("impronta", daTogliere.impronta);
    if (error) { setMessaggio("Non tolta: " + error.message); return; }
    setDaTogliere(null); setMessaggio(`Registrazione tolta: ${daTogliere.percorso}. Ora rimettere il file in «ESTRATTI CONTO DA SMISTARE».`); await carica();
  }
  async function confermaAnnulla() {
    if (!annulla?.motivo?.trim()) { setMessaggio("Scrivere il motivo dell'annullamento."); return; }
    const { error } = await supabase.rpc("ci_annulla_documento", { p_documento: annulla.id, p_motivo: annulla.motivo.trim() });
    if (error) { setMessaggio("Annullamento rifiutato: " + error.message); return; }
    setAnnulla(null); setMessaggio(`Documento n. ${annulla.id} annullato.`); await carica();
  }

  if (errore) return <div style={{ color: C.red }}>{errore}</div>;
  if (!d) return <div>Lettura in corso…</div>;
  return (
    <div style={{ maxWidth: 1200 }}>
      <h2 style={{ color: C.primary, margin: "0 0 4px" }}>Estratti e movimenti della banca</h2>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>Saldi, documenti caricati e ricerca di un movimento su tutti i conti.{!browserAdatto() && " Per aprire i PDF serve Chrome o Edge."}</div>
      {messaggio && <div style={{ ...scheda, borderLeft: `4px solid ${C.yellow}` }}>{messaggio}
        {daTogliere && <div style={{ marginTop: 8 }}><button style={btn(true, C.red)} onClick={togliRegistrazione}>Togli la registrazione della copia</button></div>}</div>}
      {vista && <div style={scheda}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}><b style={{ flex: 1 }}>{vista.nome}{vista.pdf ? ` — pagina ${vista.pagina}` : ""}</b>
          <a href={vista.url} download={vista.nome} style={{ fontSize: 13 }}>Scarica una copia</a>
          <button style={btn(false)} onClick={() => { URL.revokeObjectURL(vista.url); setVista(null); }}>Chiudi</button></div>
        {vista.pdf ? <iframe key={vista.url + vista.pagina} title="documento della banca" src={`${vista.url}#page=${vista.pagina}`} style={{ width: "100%", height: "75vh", border: `1px solid ${C.border}` }} />
          : <div style={{ fontSize: 13 }}>È un file Excel: usare «Scarica una copia» per aprirlo.</div>}
      </div>}

      <div style={scheda}>
        <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>Cerca un movimento</div>
        <input style={{ ...input, width: "100%" }} placeholder="nome (es. PROGEO), importo (es. 2.181,50), data (es. 03/10/2025), numero di bonifico…" value={cerca} onChange={e => setCerca(e.target.value)} />
        {cerca.trim().length >= 2 && <div style={{ fontSize: 12.5, margin: "6px 0" }}>Trovati: <b>{trovate.length}</b>{trovate.length === 300 ? " (i primi 300)" : ""}</div>}
        {trovate.length > 0 && <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Data", "Conto", "Uscita", "Entrata", "Descrizione", "Prima nota", ""].map(h => <th key={h} style={{ padding: "5px 8px", textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>{trovate.map(r => { const doc = docVivi.get(r.documento_id); const m = d.collegati.get(r.id); return <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>{dataIt(r.data_contabile)}</td>
            <td style={{ padding: "4px 8px" }}>{d.conti.find(c => c.id === r.conto_id)?.nome}</td>
            <td style={{ padding: "4px 8px", textAlign: "right", color: C.red }}>{r.verso === "uscita" ? euro(r.importo) : ""}</td>
            <td style={{ padding: "4px 8px", textAlign: "right", color: C.green }}>{r.verso === "entrata" ? euro(r.importo) : ""}</td>
            <td style={{ padding: "4px 8px" }}>{r.descrizione}</td>
            <td style={{ padding: "4px 8px", color: m ? C.green : C.muted }}>{m ? `collegata al movimento n. ${m.id}` : "non ancora collegata"}</td>
            <td style={{ padding: "4px 8px" }}>{doc && <button style={btn(false)} onClick={() => apri(doc, r.pagina_pdf)}>{r.pagina_pdf ? `Apri pagina ${r.pagina_pdf}` : "Apri il file"}</button>}</td>
          </tr>; })}</tbody>
        </table>}
      </div>

      <div style={{ fontSize: 13, margin: "4px 0 8px" }}>Costi della banca nell'anno <select style={input} value={anno} onChange={e => setAnno(e.target.value)}>{[2023, 2024, 2025, 2026, 2027].map(a => <option key={a}>{a}</option>)}</select> <span style={{ color: C.muted }}>(commissioni, canoni, bolli, spese e interessi, riconosciuti dalla descrizione della banca)</span></div>
      {d.conti.map(c => {
        const st = d.stati.find(s => s.conto_id === c.id); const buchi = d.mancanti.filter(m => m.conto_id === c.id);
        const docs = d.documenti.filter(x => x.conto_id === c.id).sort((a, b) => b.periodo_dal.localeCompare(a.periodo_dal));
        const costi = d.righe.filter(r => r.conto_id === c.id && docVivi.has(r.documento_id) && r.verso === "uscita" && r.data_contabile.startsWith(anno) && COSTI.test(r.descrizione)).reduce((s, r) => s + Number(r.importo), 0);
        return <div key={c.id} style={scheda}>
          <div style={{ fontWeight: 800, color: C.primary, fontSize: 15 }}>{c.tipo === "banca" ? "🏦" : c.tipo === "cassa" ? "💶" : "💳"} {c.nome}{c.stato === "chiuso" ? " (chiuso)" : ""}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "8px 0" }}>
            {[["Saldo", c.tipo === "cassa" ? "dai conteggi della cassa (non ancora nel programma)" : st?.controllo_ok_alla_data ? `${euro(d.saldi[c.id])} al ${dataIt(st.controllo_ok_alla_data)}` : "—"],
              ["Periodi mancanti", buchi.length ? buchi.map(b => `${dataIt(b.dal)}–${dataIt(b.al)}`).join("; ") : (st?.partenza_alla_data ? "nessuno" : "manca la partenza")],
              ["Quadratura con la prima nota", st?.quadratura_ok_alla_data && st.quadratura_ok_alla_data > st.partenza_alla_data ? `ok al ${dataIt(st.quadratura_ok_alla_data)}` : "non ancora fatta"],
              [`Costi della banca ${anno}`, euro(costi)]].map(([k, v]) =>
              <div key={k} style={{ flex: "1 1 200px", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px" }}><div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700 }}>{k}</div><div style={{ fontWeight: 800, color: k === "Periodi mancanti" && buchi.length ? C.red : C.text }}>{v}</div></div>)}
          </div>
          {docs.length > 0 && <details><summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Documenti caricati ({docs.filter(x => !x.annullato_il).length})</summary>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, marginTop: 6 }}>
              <thead><tr style={{ background: C.primary, color: "#fff" }}>{["N.", "Periodo", "Saldo iniziale", "Saldo finale", "Righe", "Caricato il", "Archivio", ""].map(h => <th key={h} style={{ padding: "5px 8px", textAlign: "left" }}>{h}</th>)}</tr></thead>
              <tbody>{docs.map(x => <tr key={x.id} style={{ borderBottom: `1px solid ${C.border}`, textDecoration: x.annullato_il ? "line-through" : "none", color: x.annullato_il ? C.muted : C.text }}>
                <td style={{ padding: "4px 8px" }}>{x.id}</td>
                <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>{dataIt(x.periodo_dal)} – {dataIt(x.periodo_al)}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{euro(x.saldo_iniziale)}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{euro(x.saldo_finale)}</td>
                <td style={{ padding: "4px 8px" }}>{x.numero_righe}{x.righe_gia_presenti ? ` + ${x.righe_gia_presenti} già presenti` : ""}</td>
                <td style={{ padding: "4px 8px" }}>{dataIt(x.caricato_il)}{x.annullato_il ? ` — annullato: ${x.motivo_annullamento}` : ""}</td>
                <td style={{ padding: "4px 8px" }}>{d.archivio.has(x.pdf_impronta || x.file_digitale_impronta) ? "sì" : "non ancora"}</td>
                <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>
                  {!x.annullato_il && <button style={btn(false)} onClick={() => apri(x, 1)}>Apri</button>}{" "}
                  {!x.annullato_il && d.gestore && <button style={btn(false, C.red)} onClick={() => setAnnulla({ id: x.id, motivo: "" })}>Annulla</button>}
                </td>
              </tr>)}</tbody>
            </table>
            {annulla && docs.some(x => x.id === annulla.id) && <div style={{ marginTop: 8, fontSize: 13 }}>Annullare il documento n. {annulla.id}? Il periodo tornerà mancante. Si annulla dal più recente; non si annulla se ha righe collegate alla prima nota.
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}><input style={{ ...input, flex: 1 }} placeholder="motivo (obbligatorio)" value={annulla.motivo} onChange={e => setAnnulla({ ...annulla, motivo: e.target.value })} />
                <button style={btn(true, C.red)} onClick={confermaAnnulla}>Annulla il documento</button><button style={btn(false)} onClick={() => setAnnulla(null)}>Lascia stare</button></div></div>}
          </details>}
        </div>;
      })}
    </div>
  );
}
