import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
import { dataIt, euro } from "./analisiDocumentoBanca";
import { browserAdatto, controllaCartella, leggiByte } from "./cartellaBanche";
import { apriEstratto, impronteNelProgramma, salvaNelProgramma } from "./estrattiProgramma";
import { md5 } from "./md5";

// Versione 353 — «Banche, carte e cassa» → «Estratti e movimenti: consulta» (decisioni del 09/11/2026 ore 21:35–21:37, 10-bis.10).
// Per ogni conto: saldo, periodi mancanti, quadratura, costi della banca nel periodo; documenti caricati (apri il PDF alla pagina,
// elimina per chi gestisce i conti; versione 361: «Annulla» → «Elimina» con conferma); una sola ricerca su tutti i movimenti della banca, con il collegamento alla prima nota.
// Versione 365: «Apri» prende il file dall'archivio DENTRO il programma, subito e senza scegliere la cartella; solo se lì non c'è
// lo prende dalla cartella BANCHE del cloud, come prima. Chi gestisce i conti ha «Copia nel programma» per gli estratti che sono solo nel cloud.
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
  const [daTogliere, setDaTogliere] = useState(null);       // { impronta, percorso } — copia registrata ma non trovata
  const [inAttesa, setInAttesa] = useState(null);           // versione 361: { doc, pagina } — documento da aprire dopo la scelta della cartella BANCHE
  const [copia, setCopia] = useState(null);                 // versione 365: { lavoro, fatto } — copia nel programma degli estratti che sono solo nel cloud
  const copiaInCorso = useRef(false);                       // versione 365: niente doppio clic su «Copia nel programma»
  const [avvisoCopia, setAvvisoCopia] = useState("");       // versione 365: la copia nel programma è rovinata, si mostra quella del cloud

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
    // versione 365: quali file sono già dentro il programma (se l'elenco non si legge, si apre dal cloud come prima)
    let nelProgramma = new Set(), notaProgramma = "";
    try { nelProgramma = await impronteNelProgramma(); } catch (x) { notaProgramma = x.message; }
    const saldi = {};
    for (const st of s.data || []) if (st.controllo_ok_alla_data && (c.data || []).some(x => x.id === st.conto_id && x.tipo !== "cassa")) {
      const r = await supabase.rpc("ci_saldo_al", { p_conto: st.conto_id, p_giorno: st.controllo_ok_alla_data }); saldi[st.conto_id] = r.data;
    }
    const collegati = new Map((mov.data || []).filter(x => x.riga_fonte_id).map(x => [x.riga_fonte_id, x]));
    setD({ conti: (c.data || []).filter(x => x.tipo !== "cassa" || (s.data || []).some(y => y.conto_id === x.id && y.partenza_alla_data)), stati: s.data || [], mancanti: m.data || [], gestore: g.data === true,
      codice: k.data?.[0]?.codice || null, documenti: docs.data || [], righe: righe.data || [], archivio: new Map((arch.data || []).map(a => [a.impronta, a.percorso])), collegati, saldi, nelProgramma, notaProgramma });
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
    // versione 365: se il file è dentro il programma si apre subito, senza la cartella BANCHE
    setAvvisoCopia("");
    if (d.nelProgramma.has(imp)) {
      // il nome (e quindi il tipo, PDF o Excel) viene dal percorso dell'archivio o da quello registrato nel documento
      const nome = String((doc.pdf_impronta ? doc.pdf_percorso : doc.file_digitale_percorso) || "").split("\\").pop() || `documento n. ${doc.id}.pdf`;
      try { const e = await apriEstratto({ impronta: imp, percorso, nome }); if (e.byte) { vedi(e.byte, e.nome, e.tipo, pagina); return; } }
      catch (x) {
        if (!percorso) { setMessaggio("Apertura dal programma non riuscita: " + x.message); return; }
        setAvvisoCopia(x.message + " Si mostra la copia della cartella BANCHE del cloud.");   // si prosegue con il cloud, come prima della 365
      }
    }
    if (!percorso) { setMessaggio(`Il documento n. ${doc.id} non è ancora nell'archivio di BANCHE: metterne una copia in «ESTRATTI CONTO DA SMISTARE» e fare «Leggi» e «Archivia e carica» (risulterà già caricato e verrà archiviato).`); return; }
    // versione 361: la prima volta la finestra di Windows si apre solo dopo la spiegazione, con il pulsante «Scegli la cartella BANCHE»
    if (!radice) { setInAttesa({ doc, pagina }); return; }
    const h = await prendiCartella(); if (!h) return;          // ricontrolla la cartella a ogni apertura, come nella 360
    await mostra(doc, pagina, percorso, imp, h);
  }
  async function scegliEApri() {
    const att = inAttesa; setInAttesa(null);
    const h = await prendiCartella(); if (!h || !att) return;
    const imp = att.doc.pdf_impronta || att.doc.file_digitale_impronta;
    await mostra(att.doc, att.pagina, d.archivio.get(imp), imp, h);
  }
  function vedi(byte, nome, tipo, pagina) {
    if (vista?.url) URL.revokeObjectURL(vista.url);
    const url = URL.createObjectURL(new Blob([byte], { type: tipo }));
    setVista({ url, nome, pagina: pagina || 1, pdf: tipo === "application/pdf" });
  }
  async function mostra(doc, pagina, percorso, imp, h) {
    try {
      const byte = await leggiByte(h, percorso);
      if (md5(byte) !== imp) throw new Error("nella cartella BANCHE il file non è più quello caricato (impronta diversa)");   // versione 365
      const tipo = percorso.toLowerCase().endsWith(".pdf") ? "application/pdf" : percorso.toLowerCase().endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.ms-excel";
      vedi(byte, percorso.split("\\").pop(), tipo, pagina);
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
  // versione 365: copia DENTRO il programma degli estratti che sono solo nella cartella BANCHE del cloud (chi gestisce i conti).
  // Ogni file si rilegge dal cloud e si controlla l'impronta prima di salvarlo; i file di documenti eliminati non si copiano.
  const daCopiare = useMemo(() => {
    if (!d) return [];
    const vivi = new Set(d.documenti.filter(x => !x.annullato_il).flatMap(x => [x.pdf_impronta, x.file_digitale_impronta]).filter(Boolean));
    return [...d.archivio.entries()].filter(([imp]) => vivi.has(imp) && !d.nelProgramma.has(imp)).map(([impronta, percorso]) => ({ impronta, percorso }));
  }, [d]);
  async function copiaNelProgramma() {
    if (copiaInCorso.current) return;
    copiaInCorso.current = true;
    try { await copiaTutti(); } finally { copiaInCorso.current = false; }
  }
  async function copiaTutti() {
    const h = await prendiCartella(); if (!h) return;
    const fatto = { copiati: 0, gia: 0, errori: [] };
    for (let i = 0; i < daCopiare.length; i++) {
      const f = daCopiare[i]; setCopia({ lavoro: `${i + 1} di ${daCopiare.length}: ${f.percorso.split("\\").pop()}` });
      try {
        const byte = await leggiByte(h, f.percorso);
        const e = await salvaNelProgramma(f.impronta, byte, f.percorso);
        if (e.gia) fatto.gia++; else fatto.copiati++;
      } catch (x) { fatto.errori.push(`${f.percorso.split("\\").pop()}: ${x.message}`); }
    }
    setCopia({ fatto }); await carica().catch(x => setMessaggio("Copia fatta, ma la pagina non si è aggiornata: " + x.message + ". Ricaricare la pagina."));
  }
  // versione 361: «Annulla» diventa «Elimina», con la finestra di conferma. La funzione del database resta ci_annulla_documento:
  // il documento resta nell'elenco barrato, con il motivo; i suoi movimenti escono dal programma e il periodo torna mancante.
  async function confermaElimina() {
    if (!annulla?.motivo?.trim()) { setAnnulla({ ...annulla, avviso: "Scrivere il motivo: è obbligatorio." }); return; }
    if (annulla.inCorso) return;                               // niente doppio clic mentre il database risponde
    setAnnulla({ ...annulla, inCorso: true, avviso: "" });
    const { error } = await supabase.rpc("ci_annulla_documento", { p_documento: annulla.id, p_motivo: annulla.motivo.trim() });
    if (error) { setAnnulla({ ...annulla, inCorso: false, avviso: "Il programma non lo elimina: " + parole(error.message) }); return; }
    const n = annulla.id; setAnnulla(null); setMessaggio(`Documento n. ${n} eliminato. Il periodo che copriva risulta di nuovo mancante.`); await carica();
  }

  if (errore) return <div style={{ color: C.red }}>{errore}</div>;
  if (!d) return <div>Lettura in corso…</div>;
  return (
    <div style={{ maxWidth: 1200 }}>
      <h2 style={{ color: C.primary, margin: "0 0 4px" }}>Estratti e movimenti della banca</h2>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>Saldi, documenti caricati e ricerca di un movimento su tutti i conti.{!browserAdatto() && " Per aprire i PDF serve Chrome o Edge."}</div>
      {/* versione 361: documento, messaggi, scelta della cartella e conferme si aprono in una finestra sopra la pagina, davanti a chi ha premuto */}
      {vista && <Finestra larga onChiudi={() => { URL.revokeObjectURL(vista.url); setVista(null); setAvvisoCopia(""); }}>
        {avvisoCopia && <div style={{ fontSize: 13, color: C.red, fontWeight: 700, borderLeft: `4px solid ${C.red}`, paddingLeft: 8, marginBottom: 6 }}>Attenzione: {avvisoCopia} Avvisare chi gestisce i conti.</div>}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}><b style={{ flex: 1 }}>{vista.nome}{vista.pdf ? ` — pagina ${vista.pagina}` : ""}</b>
          <a href={vista.url} download={vista.nome} style={{ fontSize: 13 }}>Scarica una copia</a>
          <button style={btn(false)} onClick={() => { URL.revokeObjectURL(vista.url); setVista(null); setAvvisoCopia(""); }}>Chiudi</button></div>
        {vista.pdf ? <iframe key={vista.url + vista.pagina} title="documento della banca" src={`${vista.url}#page=${vista.pagina}`} style={{ width: "100%", height: "calc(92vh - 70px)", border: `1px solid ${C.border}` }} />
          : <div style={{ fontSize: 13 }}>È un file Excel: usare «Scarica una copia» per aprirlo.</div>}
      </Finestra>}
      {inAttesa && <Finestra onChiudi={() => setInAttesa(null)}>
        <div style={{ fontWeight: 800, color: C.primary, fontSize: 15, marginBottom: 8 }}>Per aprire il documento serve la cartella BANCHE</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>Il programma prende il documento dall'archivio nel cloud. La cartella si sceglie una volta: finché la pagina resta aperta, gli altri documenti si aprono subito.
          <ol style={{ margin: "6px 0", paddingLeft: 22 }}>
            <li>Premere <b>«Scegli la cartella BANCHE»</b> qui sotto.</li>
            <li>Nella finestra che si apre, a sinistra in <b>Questo PC</b>, aprire il cloud <b>Company</b>.</li>
            <li>Entrare, una cartella dopo l'altra, in <code>SOCIETA</code> → <code>SOCIETA' AGRICOLA PODERE VERDE A R.L</code> → <code>00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE</code>.</li>
            <li>Cliccare <b>una sola volta</b> su <code>BANCHE</code>, senza aprirla, e premere <b>«Seleziona cartella»</b>. Se il browser chiede il permesso, confermare.</li>
          </ol></div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button style={btn(true)} onClick={scegliEApri}>Scegli la cartella BANCHE</button><button style={btn(false)} onClick={() => setInAttesa(null)}>Lascia stare</button></div>
      </Finestra>}
      {annulla && <Finestra onChiudi={() => setAnnulla(null)}>
        <div style={{ fontWeight: 800, color: C.red, fontSize: 15, marginBottom: 8 }}>Eliminare il documento n. {annulla.id}?</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          {annulla.doc && <div><b>{annulla.conto}</b>: dal {dataIt(annulla.doc.periodo_dal)} al {dataIt(annulla.doc.periodo_al)}, {annulla.doc.numero_righe} movimenti.</div>}
          <div style={{ marginTop: 6 }}>Se si elimina:</div>
          <ul style={{ margin: "4px 0", paddingLeft: 22 }}>
            <li>i suoi movimenti escono dal programma e quel periodo risulta di nuovo <b>mancante</b>;</li>
            <li>il documento resta nell'elenco, barrato, con il motivo;</li>
            <li>il file nell'archivio non viene toccato, e lo stesso documento si può caricare di nuovo.</li>
          </ul>
          <div>Non si può eliminare un documento se dopo ne è stato caricato un altro sullo stesso periodo, o se i suoi movimenti sono già usati nella prima nota: il programma lo dice.</div></div>
        <input style={{ ...input, width: "100%", marginTop: 8 }} placeholder="motivo (obbligatorio)" value={annulla.motivo} onChange={e => setAnnulla({ ...annulla, motivo: e.target.value, avviso: "" })} />
        {annulla.avviso && <div style={{ color: C.red, fontWeight: 700, fontSize: 13, marginTop: 6 }}>{annulla.avviso}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button style={btn(true, C.red)} disabled={!!annulla.inCorso} onClick={confermaElimina}>{annulla.inCorso ? "Eliminazione in corso…" : "Sì, elimina il documento"}</button><button style={btn(false)} onClick={() => setAnnulla(null)}>No, lascia stare</button></div>
      </Finestra>}
      {messaggio && <Finestra onChiudi={() => { setMessaggio(""); setDaTogliere(null); }}>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, borderLeft: `4px solid ${C.yellow}`, paddingLeft: 10 }}>{messaggio}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {daTogliere && <button style={btn(true, C.red)} onClick={togliRegistrazione}>Togli la registrazione della copia</button>}
          <button style={btn(false)} onClick={() => { setMessaggio(""); setDaTogliere(null); }}>Chiudi</button></div>
      </Finestra>}

      {copia && <Finestra onChiudi={() => { if (!copia.lavoro) setCopia(null); }}>
        <div style={{ fontWeight: 800, color: C.primary, fontSize: 15, marginBottom: 8 }}>Copia degli estratti dentro il programma</div>
        {copia.lavoro ? <div style={{ fontSize: 13.5 }}>Copia in corso: {copia.lavoro}. Non chiudere la pagina.</div>
          : <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>Copiati: <b>{copia.fatto.copiati}</b>; erano già dentro: <b>{copia.fatto.gia}</b>; non copiati: <b style={{ color: copia.fatto.errori.length ? C.red : C.text }}>{copia.fatto.errori.length}</b>.
            {copia.fatto.errori.length > 0 && <ul style={{ margin: "4px 0", paddingLeft: 22 }}>{copia.fatto.errori.map(x => <li key={x}>{x}</li>)}</ul>}
            <div>La cartella BANCHE del cloud non è stata toccata.</div>
            <button style={{ ...btn(false), marginTop: 8 }} onClick={() => setCopia(null)}>Chiudi</button></div>}
      </Finestra>}

      {d.gestore && (daCopiare.length > 0 || d.notaProgramma) && <div style={{ ...scheda, borderLeft: `4px solid ${C.yellow}` }}>
        {d.notaProgramma ? <div style={{ fontSize: 13, color: C.red }}>Archivio dentro il programma: {d.notaProgramma}</div>
          : <><div style={{ fontSize: 13.5 }}><b>{daCopiare.length}</b> {daCopiare.length === 1 ? "estratto è" : "estratti sono"} solo nella cartella BANCHE del cloud. Copiandoli dentro il programma, «Apri» li mostra subito, senza scegliere la cartella. Il cloud non viene toccato.</div>
            <button style={{ ...btn(true), marginTop: 8 }} disabled={!!copia?.lavoro} onClick={copiaNelProgramma}>Copia nel programma ({daCopiare.length})</button></>}
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
                <td style={{ padding: "4px 8px" }}>{dataIt(x.caricato_il)}{x.annullato_il ? ` — eliminato il ${dataIt(String(x.annullato_il).slice(0, 10))}: ${x.motivo_annullamento}` : ""}</td>
                <td style={{ padding: "4px 8px" }}>{d.nelProgramma.has(x.pdf_impronta || x.file_digitale_impronta) ? "nel programma" : d.archivio.has(x.pdf_impronta || x.file_digitale_impronta) ? "solo nel cloud" : "non ancora"}</td>
                <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>
                  {!x.annullato_il && <button style={btn(false)} onClick={() => apri(x, 1)}>Apri</button>}{" "}
                  {!x.annullato_il && d.gestore && <button style={btn(false, C.red)} onClick={() => setAnnulla({ id: x.id, motivo: "", doc: x, conto: c.nome })}>Elimina</button>}
                </td>
              </tr>)}</tbody>
            </table>
            {/* versione 361: la conferma dell'eliminazione è nella finestra sopra la pagina */}
          </details>}
        </div>;
      })}
    </div>
  );
}

// versione 361: i messaggi del database dicono «annullare»: nella pagina il pulsante si chiama «Elimina»
function parole(t) { return String(t || "").replace(/Annullano/g, "Eliminano").replace(/annullare/g, "eliminare").replace(/annullato/g, "eliminato").replace(/annullamento/g, "eliminazione").replace(/si annulla/g, "si elimina"); }

// versione 361: finestra sopra la pagina (sfondo scuro; si chiude con «Chiudi», con il tasto Esc o cliccando fuori)
function Finestra({ children, onChiudi, larga }) {
  useEffect(() => { const k = e => { if (e.key === "Escape") onChiudi(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onChiudi]);
  return <div role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) onChiudi(); }}
    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <div style={{ background: "#fff", borderRadius: 10, padding: 14, width: larga ? "min(1200px, 96vw)" : "min(640px, 96vw)", maxHeight: "94vh", overflow: "auto", boxShadow: "0 8px 30px rgba(0,0,0,0.3)" }}>{children}</div>
  </div>;
}
