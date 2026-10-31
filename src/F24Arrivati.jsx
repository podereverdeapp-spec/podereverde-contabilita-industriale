// Versione 339 (31/10/2026, ordine del Dott. Bizzarri): pagina «F24 arrivati: controlla e archivia».
// 1) Claude legge DA SMISTARE con il «Prompt di lettura F24» e scrive un Excel in LETTURE; 2) qui si carica la lettura e si controlla
// (tre scatole: F24, Quietanze, Comunicazioni e altro); 3) «Archivia» scrive nell'ARCHIVIO del cloud e nel programma, poi svuota DA SMISTARE.
// Regola numero uno: un F24 da pagare entra nel programma (lista dei pagamenti) appena si apre la lettura, prima di ogni scelta.
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";
import { C, FONT } from "./style";
import { oggiRoma } from "./dateRoma";
import { md5 } from "./md5";
import { completaFestivi, allarmiScadenze, TRATTAMENTI } from "./calcoloCaricoF24";
import { leggiLettura, classifica, pianoArchivio, PREFISSO_ARCHIVIO, LIMITE_PERCORSO } from "./calcoloF24Arrivati";
import { cartella, leggiFile, elenco, leggiRiconoscimento, testoRiconoscimento, nuovoCodiceCartella, FILE_RICONOSCIMENTO,
  preparaPdf, scriviVerificato, mettiInSuperati, cancellaOriginale, percorsoInDaSmistare } from "./archivioF24";
import { PROMPT_LETTURA_F24 } from "./promptLetturaF24";

const COL = {
  verde: { sfondo: "#E8F3EA", bordo: "#4A7C59", testo: "#2F5D3A", nome: "Pronto" },
  rosso: { sfondo: "#FDECEA", bordo: "#C0392B", testo: "#8B1E14", nome: "Da sistemare" },
  arancione: { sfondo: "#FFF1DC", bordo: "#D4880F", testo: "#7A4A00", nome: "Da controllare" },
  grigio: { sfondo: "#F0EFEB", bordo: "#9A958A", testo: "#5E5A50", nome: "Non si archivia" },
};
const euro = n => { const [i, d] = Number(n || 0).toFixed(2).split("."); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + d + " €"; };
const dataIt = d => (d ? d.split("-").reverse().join("/") : "—");
const scatola = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 18, overflow: "hidden" };
const testataScatola = { padding: "12px 16px", fontWeight: 800, fontSize: 15.5, borderBottom: `1px solid ${C.border}`, background: "#EEF4EF", display: "flex", gap: 10, alignItems: "center" };
const bottone = (attivo = true, colore = C.primary) => ({ background: attivo ? colore : "#BDB8AC", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: attivo ? "pointer" : "default", fontFamily: FONT });
const campo = { border: `1.5px solid ${C.border}`, borderRadius: 7, padding: "6px 9px", fontSize: 13, fontFamily: FONT, boxSizing: "border-box" };
const mono = { fontFamily: "Consolas, monospace", fontSize: 12, marginTop: 3, wordBreak: "break-all" };
const leggiTesto = b => (b[0] === 0xff && b[1] === 0xfe ? new TextDecoder("utf-16le").decode(b.subarray(2)) : new TextDecoder("utf-8").decode(b).replace(/^﻿/, ""));
const oraRoma = () => new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date()).replace(", ", " ore ");

function Etichetta({ colore, children }) {
  return <span style={{ background: COL[colore].bordo, color: "#fff", borderRadius: 10, padding: "2px 9px", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}>{children || COL[colore].nome}</span>;
}
function Riga({ colore, aperta, onApri, testata, children }) {
  const k = COL[colore];
  return (
    <div style={{ borderLeft: `6px solid ${k.bordo}`, background: aperta ? k.sfondo : "#fff", borderBottom: `1px solid ${C.border}` }}>
      <div onClick={onApri} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer", flexWrap: "wrap" }}>
        {testata}<span style={{ marginLeft: "auto", color: C.muted, fontSize: 12 }}>{aperta ? "▾ chiudi" : "▸ apri"}</span>
      </div>
      {aperta && <div style={{ padding: "4px 18px 16px 18px", fontSize: 13.5 }}>{children}</div>}
    </div>
  );
}

// ── Il controllo di un codice nuovo, in tre passi ──────────────────────────────────────────────────
function CodiceNuovo({ r, valore, onCambia, pagamenti, bloccato }) {
  const v = valore || { passo: 1, ricopiato: "", risposta: "", cartella: "", nuovaCartella: "", trattamento: "" };
  const set = p => onCambia({ ...v, ...p });
  const aCredito = !(r.debito > 0);
  const domanda = `Lavoro per la Società Agricola Podere Verde a r.l. (codice fiscale 15117871002).
In un modello F24, nella sezione «${r.sezione}», c'è il codice tributo «${r.codice}» con un importo ${aCredito ? "a credito" : "a debito"} di ${euro(aCredito ? r.credito : r.debito)}.
Cerca il suo significato SOLO sui siti ufficiali (Agenzia delle Entrate, INPS, INAIL) e rispondimi in 4 righe:
1) che cos'è il codice ${r.codice}, in parole semplici;
2) il collegamento alla pagina ufficiale dove l'hai trovato;
3) se per l'azienda è un costo, un'imposta, una sanzione o interessi, un credito, oppure un pagamento già compreso in un altro costo (per esempio nei cedolini);
4) se il codice NON esiste in nessuna tabella ufficiale, scrivi solo: CODICE INESISTENTE.`;
  const inesistente = /INESISTENTE/i.test(v.risposta);
  const pronto = v.risposta && v.trattamento && !inesistente && (aCredito || (v.cartella && (v.cartella !== "NUOVA" || /^[A-Z0-9 ()'-]+\\[A-Z0-9 ()'-]+$/.test(v.nuovaCartella || ""))));
  if (v.confermato) return (
    <div style={{ color: COL.verde.testo, fontWeight: 700, marginTop: 8 }}>
      ✅ Codice {r.codice} confermato: {aCredito ? "a credito, non decide la cartella" : `cartella ${v.cartella}`}; {v.trattamento}. Entra nella rubrica dei codici quando si archivia.
      {!bloccato && <button style={{ ...bottone(true, C.muted), marginLeft: 8 }} onClick={() => set({ confermato: false, passo: 2 })}>Cambia</button>}
    </div>
  );
  return (
    <div style={{ background: "#fff", border: `1.5px solid ${COL.rosso.bordo}`, borderRadius: 10, padding: 12, marginTop: 10 }}>
      <div style={{ fontWeight: 800, color: COL.rosso.testo, marginBottom: 8 }}>🔎 Codice nuovo «{r.codice}» (sezione {r.sezione}): il programma non lo conosce</div>
      {v.passo === 1 && <>
        <div style={{ marginBottom: 6 }}><b>Passo 1.</b> Apri il PDF e riscrivi qui il codice esattamente come è stampato. Serve a capire se Claude l'ha letto bene.</div>
        <input value={v.ricopiato} onChange={e => set({ ricopiato: e.target.value.toUpperCase().trim() })} placeholder="Codice letto sul PDF" style={{ ...campo, width: 160, marginRight: 8 }} />
        <button style={bottone(!!v.ricopiato)} disabled={!v.ricopiato} onClick={() => set({ passo: v.ricopiato === r.codice ? 2 : 9 })}>Controlla</button>
      </>}
      {v.passo === 9 && <div style={{ color: COL.rosso.testo, fontWeight: 700 }}>
        Il codice che hai scritto («{v.ricopiato}») è diverso da quello letto da Claude («{r.codice}»): Claude ha letto male.
        Rilancia il prompt di lettura chiedendo a Claude di ricontrollare questo F24, poi ricarica la lettura nuova.
        <button style={{ ...bottone(), marginLeft: 8 }} onClick={() => set({ passo: 1, ricopiato: "" })}>Riprova</button>
      </div>}
      {v.passo === 2 && <>
        <div style={{ marginBottom: 6 }}><b>Passo 2.</b> Il codice è giusto ma è nuovo. Copia questa domanda, incollala nel tuo Claude e incolla qui sotto la risposta.</div>
        <pre style={{ whiteSpace: "pre-wrap", background: "#F7F5F0", border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, fontSize: 12.5, fontFamily: FONT, margin: "0 0 8px" }}>{domanda}</pre>
        <button style={bottone()} onClick={() => navigator.clipboard?.writeText(domanda)}>📋 Copia la domanda</button>
        <textarea value={v.risposta} onChange={e => set({ risposta: e.target.value })} placeholder="Incolla qui la risposta di Claude" rows={4} style={{ ...campo, width: "100%", marginTop: 8, display: "block" }} />
        {inesistente && <div style={{ color: COL.rosso.testo, fontWeight: 700, marginTop: 6 }}>⛔ Codice inesistente: l'F24 verrebbe scartato al pagamento. Chiedere SUBITO allo studio di correggerlo.</div>}
        <div style={{ marginTop: 10 }}><b>Passo 3.</b> {aCredito ? "Scegli come entra nei conti (un codice a credito non decide la cartella):" : "Scegli dove si archivia e come entra nei costi:"}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          {!aCredito && <select value={v.cartella} onChange={e => set({ cartella: e.target.value })} style={{ ...campo, minWidth: 330 }}>
            <option value="">— cartella dell'archivio —</option>
            {pagamenti.map(p => <option key={p} value={p}>{p}</option>)}
            <option value="NUOVA">➕ Una cartella nuova…</option>
          </select>}
          {v.cartella === "NUOVA" && !aCredito && <input value={v.nuovaCartella} onChange={e => set({ nuovaCartella: e.target.value.toUpperCase() })} placeholder="GRUPPO\NOME, es. TRIBUTI LOCALI\TASI" style={{ ...campo, minWidth: 280 }} />}
          <select value={v.trattamento} onChange={e => set({ trattamento: e.target.value })} style={{ ...campo, minWidth: 300 }}>
            <option value="">— come entra nei conti —</option>{TRATTAMENTI.map(t => <option key={t}>{t}</option>)}
          </select>
          <button style={bottone(!!pronto)} disabled={!pronto} onClick={() => set({ confermato: true, cartella: aCredito ? null : v.cartella === "NUOVA" ? v.nuovaCartella : v.cartella, nuova: v.cartella === "NUOVA" })}>Conferma il codice</button>
        </div>
      </>}
    </div>
  );
}

export default function F24Arrivati({ utente, accesso }) {
  const admin = !!accesso?.admin;
  const [db, setDb] = useState(null);
  const [errore, setErrore] = useState("");
  const [radice, setRadice] = useState(null);          // la cartella F24 scelta
  const [riconoscimento, setRiconoscimento] = useState(null); // { ok, codice, problema }
  const [letture, setLetture] = useState([]);          // file di LETTURE
  const [sceltaLettura, setSceltaLettura] = useState("");
  const [letta, setLetta] = useState(null);            // { nome, md5, ...leggiLettura }
  const [lavoro, setLavoro] = useState(null);
  const [scelte, setScelte] = useState({ deleghe: {}, codici: {}, comunicazioni: {} });
  const [subito, setSubito] = useState(null);          // esito del salvataggio immediato degli F24 da pagare
  const [aperte, setAperte] = useState(() => new Set());
  const [archiviazione, setArchiviazione] = useState(null);
  const [nomeOperatore, setNomeOperatore] = useState("");
  const salvataggio = useRef(null);
  const oggi = oggiRoma();
  const conFinestra = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

  const caricaDb = useCallback(async () => {
    const q = t => fetchAllPages((da, a) => supabase.from(t).select("*").order("id").range(da, a));
    const [f24, righe, codici, cartelle, documenti, fileArchivio, cod, fest] = await Promise.all([
      q("ci_f24"), q("ci_f24_righe"), q("ci_codici_tributo"), q("ci_f24_cartelle"), q("ci_f24_documenti"), q("ci_f24_file_archivio"),
      supabase.from("ci_f24_codice_cartella").select("*").maybeSingle(),
      fetchAllPages((da, a) => supabase.from("ci_festivi").select("data").order("data").range(da, a)),
    ]);
    const err = [f24, righe, codici, cartelle, documenti, fileArchivio, cod, fest].find(x => x.error);
    if (err) { setErrore(`Lettura del database non riuscita: ${err.error.message}`); return null; }
    const nuovo = { f24: f24.data, righe: righe.data, codici: codici.data, cartelle: cartelle.data, documenti: documenti.data, fileArchivio: fileArchivio.data,
      codiceCartella: cod.data?.codice || null, festivi: new Set(fest.data.map(x => x.data)) };
    setDb(nuovo); return nuovo;
  }, []);
  useEffect(() => {
    caricaDb();
    supabase.from("profili").select("nome, cognome").eq("id", utente?.id).maybeSingle()
      .then(({ data }) => setNomeOperatore([data?.nome, data?.cognome].filter(Boolean).join(" ") || utente?.email || ""));
  }, [caricaDb, utente?.id, utente?.email]);

  // ── Passo 2: la cartella F24 e il file di riconoscimento ──
  async function scegliCartella() {
    setErrore(""); setLetta(null); setLavoro(null); setSubito(null); setArchiviazione(null);
    let h;
    try { h = await window.showDirectoryPicker({ id: "f24-podere-verde", mode: "readwrite" }); }
    catch (e) { if (e?.name !== "AbortError") setErrore(`La finestra per scegliere la cartella non si è aperta: ${e.message}`); return; }
    // REGOLA ZERO: solo la cartella «F24» di Podere Verde
    if (h.name !== "F24") { setRiconoscimento({ ok: false, problema: `È stata scelta la cartella «${h.name}»: si può scegliere solo la cartella «F24» di Podere Verde. Mi fermo.` }); return; }
    const base = await caricaDb(); if (!base) return;
    let testo = null;
    try { testo = leggiTesto(await leggiFile(h, `PROGRAMMA\\${FILE_RICONOSCIMENTO}`)); } catch { testo = null; }
    if (testo == null) {
      setRadice(h);
      setRiconoscimento({ ok: false, manca: true, problema: `In «F24\\PROGRAMMA» non c'è il file «${FILE_RICONOSCIMENTO}». Questa non è la cartella F24 di Podere Verde, oppure non è ancora stata preparata: mi fermo.` });
      return;
    }
    const r = leggiRiconoscimento(testo);
    if (!r.ok) { setRiconoscimento({ ok: false, problema: "Il file di riconoscimento non dice «Podere Verde, 15117871002, F24»: questa non è la cartella F24 di Podere Verde. Mi fermo." }); return; }
    if (!base.codiceCartella) { setRadice(h); setRiconoscimento({ ok: false, manca: true, codiceFile: r.codice, problema: "Nel programma non c'è ancora il codice della cartella F24: lo scrive il Dott. Bizzarri con «Prepara la cartella F24»." }); return; }
    if (r.codice !== base.codiceCartella) { setRiconoscimento({ ok: false, problema: `Il codice del file di riconoscimento (${r.codice}) è diverso da quello del programma (${base.codiceCartella}): questa non è la cartella giusta. Mi fermo.` }); return; }
    setRadice(h); setRiconoscimento({ ok: true, codice: r.codice });
    try {
      const dir = await cartella(h, "PROGRAMMA\\LETTURE");
      const fl = (await elenco(dir)).filter(x => x.tipo === "file" && /\.xlsx$/i.test(x.nome) && !x.nome.startsWith("~$")).sort((a, b) => b.nome.localeCompare(a.nome));
      setLetture(fl); setSceltaLettura(fl[0]?.nome || "");
    } catch (e) { setErrore(`La cartella «PROGRAMMA\\LETTURE» non si apre: ${e.message}`); }
  }

  // il Dott. Bizzarri prepara la cartella F24 la prima volta: codice nel programma e file di riconoscimento
  // Versione 340: si può ripetere senza danni (se il codice è già nel programma si usa quello; il file si scrive solo se manca)
  const [preparazione, setPreparazione] = useState(false);
  async function preparaCartella() {
    if (!admin || !radice || preparazione) return;
    if (!window.confirm("Preparare la cartella F24 di Podere Verde? Si scrive il file di riconoscimento in F24\\PROGRAMMA e il suo codice nel programma.")) return;
    setPreparazione(true); setErrore("");
    try {
      const base = await caricaDb(); if (!base) return;
      let codice = base.codiceCartella;
      if (codice && riconoscimento?.codiceFile && riconoscimento.codiceFile !== codice)
        throw new Error(`il file di riconoscimento dice ${riconoscimento.codiceFile}, il programma ${codice}: avvisare il Capitano Contabilità`);
      if (!codice) {
        codice = riconoscimento?.codiceFile || nuovoCodiceCartella();
        const { error } = await supabase.from("ci_f24_codice_cartella").insert({ id: 1, codice });
        if (error) throw new Error(`codice nel programma: ${error.message}`);
      }
      if (!riconoscimento?.codiceFile) await scriviVerificato(radice, `PROGRAMMA\\${FILE_RICONOSCIMENTO}`, new TextEncoder().encode(testoRiconoscimento(codice, oraRoma())));
      await caricaDb(); setRiconoscimento(null); setRadice(null);
      alert("Cartella preparata. Ora premi di nuovo «Scegli la cartella F24».");
    } catch (e) { setErrore(`Preparazione non riuscita: ${e.message}`); }
    finally { setPreparazione(false); }
  }

  // ── Apertura della lettura, lavoro in corso, F24 da pagare subito nel programma ──
  async function apriLettura() {
    setErrore(""); setSubito(null); setArchiviazione(null);
    try {
      const f = letture.find(x => x.nome === sceltaLettura); if (!f) return;
      const byte = new Uint8Array(await (await f.handle.getFile()).arrayBuffer());
      const imp = md5(byte);
      const lt = leggiLettura(XLSX, byte);
      if (lt.anomalie?.length && !lt.deleghe) { setLetta({ nome: f.nome, md5: imp, ...lt }); return; }
      if (lt.lettura?.codice_cartella !== riconoscimento.codice) { setErrore(`La lettura «${f.nome}» dice il codice cartella «${lt.lettura?.codice_cartella ?? ""}», diverso da questa cartella: non si usa.`); return; }
      const base = await caricaDb(); if (!base) return;
      // il lavoro di questa lettura: nuovo, mio da riprendere, di un altro o già chiuso
      const { data: lav, error: eL } = await supabase.from("ci_f24_lavori").select("*").eq("md5_lettura", imp).neq("stato", "Annullato").maybeSingle();
      if (eL) throw new Error(eL.message);
      let l = lav;
      if (l?.stato === "Chiuso") { setLetta({ nome: f.nome, md5: imp, ...lt }); setLavoro(l); return; }
      if (l && l.proprietario !== utente.id) { setLetta({ nome: f.nome, md5: imp, ...lt }); setLavoro(l); return; }
      if (!l) {
        const { data: nuovo, error: eN } = await supabase.from("ci_f24_lavori").insert({ file_lettura: f.nome, md5_lettura: imp, codice_cartella: riconoscimento.codice, proprietario: utente.id, proprietario_nome: nomeOperatore }).select().single();
        if (eN) throw new Error(/una_volta|duplicate/i.test(eN.message) ? "Questa lettura l'ha appena aperta qualcun altro." : eN.message);
        l = nuovo;
      }
      setLavoro(l); setScelte({ deleghe: {}, codici: {}, comunicazioni: {}, ...(l.scelte || {}) });
      setLetta({ nome: f.nome, md5: imp, ...lt });
      await salvaSubito(lt, base, l);
    } catch (e) { setErrore(`Lettura non aperta: ${e.message}`); }
  }

  // payload per ci_f24_salva_delega
  function payload(d, extra = {}) {
    const p = {
      codice_delega: d.codice_delega, origine: "lettura", nome_file_pdf: null, nome_file_ricevuto: d.nome_file_ricevuto, delega_nel_file_ricevuto: d.delega_nel_file_ricevuto,
      oggetto: d.oggetto, data_scadenza: d.nome_file_pdf ? d.data_scadenza : (d.data_pagamento || d.data_scadenza), totale_debito: d.totale_debito, totale_credito: d.totale_credito,
      saldo: d.saldo, tipo_pagamento: d.tipo_pagamento, stato: d.stato, data_pagamento: d.stato === "Pagato" ? d.data_pagamento : null,
      codice_banca_sportello: d.codice_banca_sportello, banca_addebito: d.banca_addebito, protocollo_telematico: d.protocollo_telematico,
      nome_file_quietanza: d.nome_file_quietanza ? `QUIETANZA ${d.data_pagamento}.pdf` : null, nome_file_contabile: d.nome_file_contabile ? `CONTABILE BANCA ${d.data_pagamento}.pdf` : null,
      numero_operazione_banca: d.numero_operazione_banca, note: d.note, corrisponde: d.verifica?.corrisponde, avvisi: d.verifica?.avvisi,
    };
    if (d.nome_file_pdf) p.nome_file_pdf = `F24 ${d.data_scadenza}.pdf`;
    const righe = d.righe.map(r => ({ sezione: r.sezione, codice_tributo: r.codice_tributo, descrizione_codice: r.descrizione_codice, codice_ente_sede: r.codice_ente_sede,
      matricola_riferimento: r.matricola_riferimento, rateazione_mese: r.rateazione_mese, anno_riferimento: r.anno_riferimento, periodo_dal: r.periodo_dal,
      periodo_al: r.periodo_al, importo_debito: r.importo_debito, importo_credito: r.importo_credito, trattamento: r.trattamento, codice_confermato_da: r.codice_confermato_da }));
    return { p: { ...p, ...extra }, righe };
  }

  // REGOLA NUMERO UNO: appena aperta la lettura, gli F24 sicuri entrano nel programma (da pagare o pagati) — prima di ogni scelta
  async function salvaSubito(lt, base, l) {
    const cl = classifica(lt, base, l.scelte || {}, l.id);
    const esiti = [];
    for (const d of cl.deleghe) {
      if (d.errori.length) { esiti.push({ d, esito: "NON nel programma: errori nella lettura", grave: d.stato === "Da pagare" }); continue; }
      if (d.decisione && !(d.decisione.tipo === "versione" && d.s.versione === "in più")) { esiti.push({ d, esito: d.decisione.tipo === "versione" ? "NON ancora nel programma: prima decidi se è una versione corretta o un F24 in più" : "NON ancora nel programma: scegli quale F24 paga", grave: true }); continue; }
      if (d.esistente && !(d.soloPagamento || d.stato === "Pagato") ) { esiti.push({ d, esito: d.suo ? "Già nel programma (aperta prima)" : "Già nel programma" }); continue; }
      const esistente = d.esistente;
      if (esistente && esistente.stato === "Pagato") { esiti.push({ d, esito: "Già pagato nel programma" }); continue; }
      const { p, righe } = payload(d, esistente ? { codice_delega: esistente.codice_delega, nome_file_pdf: esistente.nome_file_pdf, oggetto: esistente.oggetto, data_scadenza: esistente.data_scadenza, origine: esistente.origine, note: [esistente.note, d.note].filter(Boolean).join(" | ") || null } : {});
      const { data, error } = await supabase.rpc("ci_f24_salva_delega", { p_delega: p, p_righe: righe });
      if (error) { esiti.push({ d, esito: `NON nel programma: ${error.message}`, grave: true }); continue; }
      if (!esistente) await supabase.from("ci_f24").update({ lavoro_id: l.id }).eq("codice_delega", p.codice_delega);
      esiti.push({ d, esito: esistente ? `Aggiornato nel programma: ${p.stato} (${data})` : `Entrato nel programma: ${p.stato}` });
    }
    setSubito(esiti);
    await caricaDb();
  }

  // «È un F24 in più»: entra subito nel programma come da pagare (regola numero uno)
  async function decidiInPiu(d) {
    const nuove = { ...scelte, deleghe: { ...scelte.deleghe, [d.codice_delega]: { ...(scelte.deleghe[d.codice_delega] || {}), versione: "in più", sostituisce: null } } };
    setScelte(nuove);
    await supabase.from("ci_f24_lavori").update({ scelte: nuove }).eq("id", lavoro.id);
    const base = await caricaDb(); if (base) await salvaSubito(letta, base, { ...lavoro, scelte: nuove });
  }

  // ogni scelta si salva subito nel lavoro in corso
  function cambiaScelte(fn) {
    setScelte(prev => {
      const n = fn(prev);
      clearTimeout(salvataggio.current);
      salvataggio.current = setTimeout(() => {
        if (lavoro?.id && lavoro.stato === "Aperto") supabase.from("ci_f24_lavori").update({ scelte: n }).eq("id", lavoro.id).then(({ error }) => { if (error) setErrore(`Scelte non salvate: ${error.message}`); });
      }, 500);
      return n;
    });
  }
  const setDelega = (codice, p) => cambiaScelte(s => ({ ...s, deleghe: { ...s.deleghe, [codice]: { ...(s.deleghe[codice] || {}), ...p } } }));
  const setCodice = (codice, v) => cambiaScelte(s => ({ ...s, codici: { ...s.codici, [codice]: v } }));
  const setComunicazione = (k, p) => cambiaScelte(s => ({ ...s, comunicazioni: { ...s.comunicazioni, [k]: { ...(s.comunicazioni[k] || {}), ...p } } }));
  const apri = id => setAperte(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const cl = useMemo(() => (letta?.deleghe && db && lavoro ? classifica(letta, db, scelte, lavoro.id) : null), [letta, db, scelte, lavoro]);
  const piano = useMemo(() => (cl ? pianoArchivio(cl, oggi, letta.documenti) : []), [cl, oggi, letta]);
  const pagamenti = (db?.cartelle || []).filter(c => c.tipo === "Pagamenti" && c.attiva).map(c => c.percorso);
  const cartelleComunicazioni = (db?.cartelle || []).filter(c => c.tipo !== "Originali ricevuti" && c.attiva).map(c => c.percorso);
  const cal = db ? completaFestivi(db.festivi, [+oggi.slice(0, 4), +oggi.slice(0, 4) + 1]) : null;
  const allarmi = db ? allarmiScadenze(db.f24, oggi, cal.festivi) : null;
  const daSistemare = cl ? [...cl.deleghe, ...cl.comunicazioni].filter(x => x.colore === "rosso") : [];
  const bloccato = !!archiviazione || lavoro?.stato !== "Aperto";
  const lavoroAltrui = lavoro && lavoro.proprietario !== utente.id && lavoro.stato !== "Chiuso";
  const fermoDaOre = lavoro ? (Date.now() - new Date(lavoro.aggiornato_il).getTime()) / 3600000 : 0;

  async function chiudiLavoroAltrui() {
    if (!admin || !window.confirm(`Chiudere il lavoro di ${lavoro.proprietario_nome || "un altro"} su questa lettura? Le sue scelte non si perdono: restano nel registro.`)) return;
    const { error } = await supabase.from("ci_f24_lavori").update({ stato: "Annullato", note: `Chiuso dal Dott. Bizzarri: fermo da ${fermoDaOre.toFixed(1)} ore` }).eq("id", lavoro.id);
    if (error) setErrore(error.message); else { setLavoro(null); setLetta(null); }
  }

  // ── Passo 3: Archivia ──
  async function archivia(riprendi = false) {
    if (!cl || daSistemare.length) return;
    if (!riprendi && !window.confirm(`Archiviare? Si scrivono ${piano.length} file nell'ARCHIVIO, si salvano i dati e i PDF nel programma e poi si cancellano da DA SMISTARE gli originali archiviati.`)) return;
    const passi = [...(lavoro.passi || [])];
    const segna = async (testo, ok = true) => {
      passi.push({ quando: new Date().toISOString(), testo, ok });
      setArchiviazione(a => ({ ...a, passi: [...passi] }));
      await supabase.from("ci_f24_lavori").update({ passi }).eq("id", lavoro.id);
    };
    setArchiviazione({ passi, inCorso: true });
    try {
      if (lavoro.stato === "Aperto") {
        const { error } = await supabase.from("ci_f24_lavori").update({ stato: "Archiviazione in corso", scelte }).eq("id", lavoro.id);
        if (error) throw new Error(/una_archiviazione/i.test(error.message) ? "Un'altra persona sta archiviando in questo momento: riprova tra poco." : error.message);
        setLavoro(l => ({ ...l, stato: "Archiviazione in corso" }));
      }
      const programma = await cartella(radice, "PROGRAMMA");
      const archivio = await cartella(radice, "ARCHIVIO");
      // 1) i codici nuovi nella rubrica (e le cartelle nuove nell'elenco)
      for (const [codice, v] of Object.entries(scelte.codici || {})) {
        if (!v.confermato || db.codici.some(c => c.codice === codice)) continue;
        const r = cl.deleghe.flatMap(d => d.nuovi).find(x => x.codice === codice); if (!r) continue;
        if (v.nuova && v.cartella && !db.cartelle.some(c => c.percorso === v.cartella)) {
          const [gruppo] = v.cartella.split("\\"); const nome = v.cartella.split("\\").pop();
          const com = db.cartelle.find(c => c.tipo === "Comunicazioni" && c.gruppo === gruppo)?.percorso;
          if (!com) throw new Error(`Cartella nuova «${v.cartella}»: il gruppo «${gruppo}» non ha una cartella COMUNICAZIONI. La crea il Dott. Bizzarri.`);
          const { error } = await supabase.from("ci_f24_cartelle").insert({ percorso: v.cartella, tipo: "Pagamenti", gruppo, nome, cartella_comunicazioni: com, ordine: 999 });
          if (error) throw new Error(`Cartella nuova «${v.cartella}» non registrata: ${error.message}`);
        }
        const fonte = (v.risposta.match(/https?:\/\/\S+/) || [])[0] || null;
        const { error } = await supabase.from("ci_codici_tributo").insert({ sezione: r.sezione, codice, descrizione: v.risposta.split(/\n/)[0].slice(0, 300),
          debito_o_credito: r.debito > 0 ? "Debito" : "Credito", trattamento: v.trattamento, cartella_nuova: v.cartella || null, fonte,
          confermato_da: nomeOperatore, confermato_il: oggi });
        if (error) throw new Error(`Codice ${codice} non registrato: ${error.message}`);
        await segna(`Codice nuovo ${codice} nella rubrica (${v.trattamento})`);
      }
      let base = await caricaDb();
      // 2) i PDF da preparare (parti di file, immagini → PDF), una volta per ogni sorgente e pagine
      const pronti = new Map();
      const docDi = nome => letta.documenti.find(x => x.nome === nome);
      async function pdf(sorgente, pagine) {
        const k = `${sorgente}|${pagine || ""}`; if (pronti.has(k)) return pronti.get(k);
        const doc = docDi(sorgente);
        const byte = await leggiFile(programma, `DA SMISTARE\\${percorsoInDaSmistare(doc)}`);
        if (doc?.md5 && md5(byte) !== doc.md5) throw new Error(`«${sorgente}» è cambiato dopo la lettura di Claude: va riletto`);
        const out = await preparaPdf(byte, sorgente, pagine);
        const v = { byte: out, md5: md5(out), md5Ricevuto: md5(byte) }; pronti.set(k, v); return v;
      }
      // 3) le deleghe nel programma con la loro cartella, i PDF nell'archivio del programma
      const idDi = new Map();
      for (const d of cl.deleghe) {
        if (d.colore === "rosso" || d.nienteDiNuovo) continue;
        const f24 = !d.soloPagamento ? await pdf(d.nome_file_ricevuto, d.pagine) : null;
        const qui = d.nome_file_quietanza && d.nuovaQuietanza ? await pdf(d.nome_file_quietanza, d.pagine_quietanza) : null;
        const con = d.nome_file_contabile && d.nuovaContabile ? await pdf(d.nome_file_contabile, d.pagine_contabile) : null;
        const impronte = { ...(f24 ? { md5_pdf: f24.md5 } : {}), ...(qui ? { md5_quietanza: qui.md5 } : {}), ...(con ? { md5_contabile: con.md5 } : {}) };
        const e = d.esistente && !d.suo ? d.esistente : null;
        let codice = e?.codice_delega || d.codice_delega;
        if (d.sostituisce && d.sostituisce.stato !== "Sostituito") {
          const vecchia = d.sostituisce;
          const righeV = base.righe.filter(r => r.f24_id === vecchia.id);
          const pv = { ...vecchia, stato: "Sostituito", nome_file_pdf: `SUPERATI\\F24 ${vecchia.data_scadenza} superato il ${oggi}.pdf`,
            note: [vecchia.note, `Sostituito da versione corretta il ${dataIt(oggi)} (${d.codice_delega})`].filter(Boolean).join(" | ") };
          const n = payload(d, impronte);
          const { error } = await supabase.rpc("ci_f24_salva_versione_corretta", { p_vecchia: pv, p_righe_vecchia: righeV, p_nuova: n.p, p_righe_nuova: n.righe });
          if (error) throw new Error(`Versione corretta ${d.codice_delega}: ${error.message}`);
          await segna(`${vecchia.codice_delega} «Sostituito»; ${d.codice_delega} nel programma al suo posto`);
        } else {
          const { p, righe } = payload(d, { ...impronte, ...(e ? { codice_delega: e.codice_delega, nome_file_pdf: e.nome_file_pdf, oggetto: e.oggetto, data_scadenza: e.data_scadenza, origine: e.origine, note: e.note } : {}) });
          if (e?.stato === "Pagato") { p.stato = "Pagato"; ["data_pagamento", "codice_banca_sportello", "banca_addebito", "protocollo_telematico", "nome_file_quietanza", "nome_file_contabile", "numero_operazione_banca"].forEach(k => { p[k] = e[k] ?? p[k]; }); }
          const { error } = await supabase.rpc("ci_f24_salva_delega", { p_delega: p, p_righe: righe });
          if (error) throw new Error(`F24 ${codice}: ${error.message}`);
        }
        // cartella e lavoro si scrivono solo se mancano (su un F24 «Pagato» un campo già scritto non si cambia)
        const attuale = (await supabase.from("ci_f24").select("id, cartella_pagamento, lavoro_id").eq("codice_delega", codice).single()).data;
        const agg = {}; if (!attuale?.cartella_pagamento) agg.cartella_pagamento = d.nome; if (!attuale?.lavoro_id) agg.lavoro_id = lavoro.id;
        const { data: riga, error: eU } = Object.keys(agg).length
          ? await supabase.from("ci_f24").update(agg).eq("codice_delega", codice).select("id").single()
          : { data: attuale, error: attuale ? null : { message: "non trovato" } };
        if (eU) throw new Error(`F24 ${codice}, cartella del pagamento: ${eU.message}`);
        idDi.set(d.codice_delega, riga.id);
        for (const [nomeArch, v] of [["F24.pdf", f24], ["quietanza.pdf", qui], ["contabile.pdf", con]]) {
          if (!v) continue;
          const { error } = await supabase.storage.from("f24").upload(`${codice}/${nomeArch}`, new Blob([v.byte], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" });
          if (error) throw new Error(`PDF ${nomeArch} di ${codice} non caricato nel programma: ${error.message}`);
        }
        // quietanze e contabili anche nell'elenco dei documenti (una volta sola, per impronta)
        for (const [tipo, v, sorg, pag] of [["Quietanza", qui, d.nome_file_quietanza, d.pagine_quietanza], ["Contabile della banca", con, d.nome_file_contabile, d.pagine_contabile]]) {
          if (!v || base.documenti.some(x => x.md5 === v.md5)) continue;
          const { error } = await supabase.from("ci_f24_documenti").insert({ tipo, f24_id: riga.id, nome_file_ricevuto: sorg, md5: v.md5, md5_file_ricevuto: v.md5Ricevuto,
            dimensione: v.byte.length, pagine: pag, data_documento: d.data_pagamento, protocollo: d.protocollo_telematico || d.numero_operazione_banca,
            percorso_nel_programma: `${codice}/${tipo === "Quietanza" ? "quietanza" : "contabile"}.pdf`, lavoro_id: lavoro.id });
          if (error) throw new Error(`${tipo} di ${codice} non registrata: ${error.message}`);
        }
        await segna(`F24 ${codice} nel programma con la cartella «${e?.cartella_pagamento || d.nome}»`);
      }
      base = await caricaDb();
      // 4) comunicazioni e originali nell'elenco dei documenti e nell'archivio del programma
      const docId = new Map();
      for (const c of cl.comunicazioni) {
        if (c.colore === "rosso" || c.giaNelProgramma) continue;
        const v = await pdf(c.nome, null);
        let id = base.documenti.find(x => x.md5 === v.md5)?.id;
        if (!id) {
          const { error: eS } = await supabase.storage.from("f24").upload(`documenti/${v.md5}.pdf`, new Blob([v.byte], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" });
          if (eS) throw new Error(`«${c.nome}» non caricato nel programma: ${eS.message}`);
          const { data, error } = await supabase.from("ci_f24_documenti").insert({ tipo: "Comunicazione o altro documento", f24_id: idDi.get(c.collegato) || base.f24.find(f => f.codice_delega === c.collegato)?.id || null,
            nome_file_ricevuto: c.nome, md5: v.md5, md5_file_ricevuto: v.md5Ricevuto, dimensione: v.byte.length, digitale_o_scansione: c.doc?.digitale || null,
            chi_la_manda: c.chi, data_documento: c.data, che_cosa_e: c.cosa, di_che_cosa_parla: c.parla, chiede_pagamento: c.chiede_pagamento,
            importo_chiesto: c.chiede_pagamento ? c.importo : null, scadenza: c.scadenza, protocollo: c.protocollo, percorso_nel_programma: `documenti/${v.md5}.pdf`, lavoro_id: lavoro.id }).select("id").single();
          if (error) throw new Error(`«${c.nome}» non registrato: ${error.message}`);
          id = data.id;
        }
        docId.set(c.k, id);
        await segna(`«${c.nome}» nel programma`);
      }
      for (const p of piano.filter(x => x.cosa === "Originale ricevuto")) {
        const byte = await leggiFile(programma, `DA SMISTARE\\${percorsoInDaSmistare(docDi(p.sorgente))}`);
        const imp = md5(byte);
        let id = base.documenti.find(x => x.md5 === imp)?.id;
        if (!id) {
          const { data, error } = await supabase.from("ci_f24_documenti").insert({ tipo: "Originale ricevuto", nome_file_ricevuto: p.sorgente, md5: imp, md5_file_ricevuto: imp, dimensione: byte.length, lavoro_id: lavoro.id }).select("id").single();
          if (error) throw new Error(`Originale «${p.sorgente}» non registrato: ${error.message}`);
          id = data.id;
        }
        pronti.set(`${p.sorgente}|Originale ricevuto`, { byte, md5: imp, md5Ricevuto: imp });
        docId.set(`orig|${p.sorgente}`, id);
      }
      base = await caricaDb();
      // 5) i file nell'ARCHIVIO del cloud, uno per uno, con il controllo dell'impronta
      const usati = new Map(); // sorgente → tutti i suoi file scritti bene?
      for (const p of piano) {
        const v = p.cosa === "Originale ricevuto" ? pronti.get(`${p.sorgente}|Originale ricevuto`) : await pdf(p.sorgente, p.pagine);
        const d = p.delega ? cl.deleghe.find(x => x.codice_delega === p.delega) : null;
        // versione corretta: il file vecchio della stessa cartella va in SUPERATI
        if (d?.sostituisce && p.cosa === "F24") {
          const sup = await mettiInSuperati(archivio, p.destinazione, oggi);
          if (sup) {
            const vecchio = base.fileArchivio.find(x => x.percorso.toUpperCase() === p.destinazione.toUpperCase());
            if (vecchio) await supabase.from("ci_f24_file_archivio").update({ percorso: sup.destinazione, superato: true }).eq("id", vecchio.id);
            await segna(`Versione vecchia in SUPERATI: ${sup.destinazione}`);
          }
        }
        const r = await scriviVerificato(archivio, p.destinazione, v.byte);
        const f24Id = d ? idDi.get(d.codice_delega) : null;
        const documentoId = p.comunicazione ? docId.get(p.comunicazione) : p.cosa === "Originale ricevuto" ? docId.get(`orig|${p.sorgente}`)
          : p.cosa !== "F24" ? base.documenti.find(x => x.md5 === v.md5)?.id || null : null;
        if (!base.fileArchivio.some(x => x.percorso.toUpperCase() === r.percorso.toUpperCase())) {
          const { error } = await supabase.from("ci_f24_file_archivio").insert({ percorso: r.percorso, cartella: p.categoria, cosa: p.cosa, f24_id: f24Id || null,
            documento_id: documentoId, md5: r.md5, dimensione: r.dimensione, lavoro_id: lavoro.id });
          if (error) throw new Error(`File scritto ma non annotato nel programma (${r.percorso}): ${error.message}`);
        }
        usati.set(p.sorgente, true);
        await segna(`${r.esito}: ARCHIVIO\\${r.percorso}`);
      }
      // 6) solo alla fine: via da DA SMISTARE gli originali archiviati e verificati (e i doppioni già archiviati identici)
      const daCancellare = new Map();
      for (const s of usati.keys()) daCancellare.set(s, docDi(s));
      for (const d of cl.deleghe.filter(x => x.nienteDiNuovo)) {
        const doc = docDi(d.nome_file_ricevuto);
        if (doc?.md5 && (base.fileArchivio.some(x => x.md5 === doc.md5) || base.documenti.some(x => x.md5_file_ricevuto === doc.md5))) daCancellare.set(doc.nome, doc);
      }
      for (const c of cl.comunicazioni.filter(x => x.giaNelProgramma)) daCancellare.set(c.nome, c.doc);
      for (const x of letta.documenti.filter(x => x.estratto_da && daCancellare.has(x.estratto_da))) daCancellare.set(x.nome, x);
      for (const [nome, doc] of daCancellare) {
        const esito = await cancellaOriginale(programma, `DA SMISTARE\\${percorsoInDaSmistare(doc)}`, doc?.md5);
        await segna(`${esito} da DA SMISTARE: ${nome}`);
      }
      const restano = letta.documenti.filter(x => !daCancellare.has(x.nome)).map(x => x.nome);
      const esito = `${piano.length} file nell'ARCHIVIO; ${idDi.size} F24 e ${docId.size} documenti nel programma; ${daCancellare.size} originali tolti da DA SMISTARE${restano.length ? `; restano in DA SMISTARE: ${restano.join(", ")}` : ""}.`;
      await segna(`Lavoro chiuso: ${esito}`);
      const { error: eC } = await supabase.from("ci_f24_lavori").update({ stato: "Chiuso", esito }).eq("id", lavoro.id);
      if (eC) throw new Error(`Lavoro non chiuso: ${eC.message}`);
      setLavoro(l => ({ ...l, stato: "Chiuso", esito }));
      setArchiviazione(a => ({ ...a, inCorso: false, fine: esito }));
      await caricaDb();
    } catch (e) {
      await segna(`FERMO: ${e.message}`, false).catch(() => {});
      setArchiviazione(a => ({ ...a, inCorso: false, errore: e.message }));
    }
  }

  // ── Disegno ──
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: 20, fontFamily: FONT, color: C.text }}>
      <h2 style={{ margin: "0 0 4px", color: C.primary }}>🧾 F24 arrivati: controlla e archivia</h2>
      <div style={{ color: C.muted, fontSize: 13.5, marginBottom: 16 }}>Tre passi: 1) Claude legge i documenti di DA SMISTARE; 2) qui si carica la sua lettura e si controlla; 3) «Archivia» copia tutto nell'ARCHIVIO e nel programma.</div>
      {errore && <div style={{ ...scatola, padding: 12, background: COL.rosso.sfondo, color: COL.rosso.testo, fontWeight: 700 }}>⚠️ {errore}</div>}

      {allarmi && (allarmi.scaduti.length > 0 || allarmi.inScadenza.length > 0) && (
        <div style={{ ...scatola, border: "2px solid #C0392B", padding: "12px 16px", fontSize: 13.5, lineHeight: 1.7 }}>
          {allarmi.scaduti.map(x => <div key={x.id} style={{ color: COL.rosso.testo, fontWeight: 700 }}>⛔ F24 SCADUTO E NON PAGATO: {x.oggetto}, scadenza {dataIt(x.data_scadenza)}, {euro(x.saldo)} ({x.codice_delega})</div>)}
          {allarmi.inScadenza.map(x => <div key={x.id} style={{ color: COL.arancione.testo, fontWeight: 700 }}>⏰ In scadenza: {x.oggetto}, {dataIt(x.data_scadenza)}, {euro(x.saldo)} ({x.codice_delega})</div>)}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <div style={{ ...scatola, marginBottom: 0, padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>1. Fai leggere i documenti a Claude</div>
          <div style={{ fontSize: 13.5, marginBottom: 10 }}>Metti i PDF in <b>F24\PROGRAMMA\DA SMISTARE</b>, copia il prompt, incollalo nel tuo Claude e aspetta che scriva la lettura in <b>LETTURE</b>.</div>
          <button style={bottone()} onClick={() => navigator.clipboard?.writeText(PROMPT_LETTURA_F24).then(() => alert("Prompt di lettura copiato: incollalo nel tuo Claude."))}>📋 Copia il prompt di lettura (versione 2)</button>
        </div>
        <div style={{ ...scatola, marginBottom: 0, padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>2. Carica la lettura</div>
          <div style={{ fontSize: 13.5, marginBottom: 10 }}>Scegli la cartella <b>F24</b> di Podere Verde nel cloud: il programma controlla il file di riconoscimento e mostra le letture di LETTURE.</div>
          {conFinestra ? <button style={bottone()} onClick={scegliCartella}>📂 Scegli la cartella F24</button>
            : <div style={{ color: C.red, fontWeight: 700 }}>Questa pagina funziona solo con Chrome o Edge sul computer.</div>}
        </div>
      </div>

      {riconoscimento && !riconoscimento.ok && (
        <div style={{ ...scatola, padding: 14, background: COL.rosso.sfondo, color: COL.rosso.testo, fontWeight: 700 }}>
          ⛔ {riconoscimento.problema}
          {riconoscimento.manca && admin && <div style={{ marginTop: 10 }}><button disabled={preparazione} style={bottone(!preparazione, C.red)} onClick={preparaCartella}>{preparazione ? "Preparazione in corso…" : "Prepara la cartella F24 (solo la prima volta)"}</button></div>}
        </div>
      )}

      {riconoscimento?.ok && (
        <div style={{ ...scatola, padding: "12px 16px", fontSize: 13.5, lineHeight: 1.8 }}>
          <div>✅ <b>Cartella giusta:</b> il file di riconoscimento dice Podere Verde, 15117871002, codice {riconoscimento.codice}, uguale a quello del programma.</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            <b>Lettura:</b>
            {letture.length ? <select value={sceltaLettura} onChange={e => setSceltaLettura(e.target.value)} style={{ ...campo, minWidth: 420 }}>{letture.map(x => <option key={x.nome}>{x.nome}</option>)}</select>
              : <span style={{ color: C.red }}>in «PROGRAMMA\LETTURE» non c'è nessuna lettura: fai prima il passo 1.</span>}
            {letture.length > 0 && <button style={bottone()} onClick={apriLettura}>Apri la lettura</button>}
          </div>
        </div>
      )}

      {letta?.anomalie?.length > 0 && (
        <div style={{ ...scatola, padding: 14, background: COL.rosso.sfondo, color: COL.rosso.testo }}>
          <b>La lettura «{letta.nome}» ha problemi:</b>{letta.anomalie.map((a, i) => <div key={i}>• {a}</div>)}
          {!letta.deleghe && <div style={{ marginTop: 6 }}>Rilancia il prompt di lettura e ricarica.</div>}
        </div>
      )}

      {lavoro?.stato === "Chiuso" && !archiviazione && (
        <div style={{ ...scatola, padding: 14, background: COL.grigio.sfondo }}>⚪ Questa lettura è già stata archiviata da {lavoro.proprietario_nome} il {new Date(lavoro.chiuso_il || lavoro.aggiornato_il).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}: {lavoro.esito}</div>
      )}
      {lavoroAltrui && (
        <div style={{ ...scatola, padding: 14, background: COL.rosso.sfondo, color: COL.rosso.testo, fontWeight: 700 }}>
          ⛔ Questa lettura la sta lavorando {lavoro.proprietario_nome || "un'altra persona"} (ultima scelta {fermoDaOre.toFixed(1)} ore fa). La riprende lei o la chiude il Dott. Bizzarri.
          {admin && fermoDaOre >= 2 && <div style={{ marginTop: 8 }}><button style={bottone(true, C.red)} onClick={chiudiLavoroAltrui}>Chiudi il suo lavoro</button></div>}
          {admin && fermoDaOre < 2 && <div style={{ marginTop: 8, fontWeight: 400 }}>Il Dott. Bizzarri lo può chiudere quando è fermo da 2 ore.</div>}
        </div>
      )}

      {cl && !lavoroAltrui && (lavoro?.stato !== "Chiuso" || archiviazione) && <>
        <div style={{ ...scatola, padding: "12px 16px", fontSize: 13.5, lineHeight: 1.7 }}>
          <div>✅ <b>Lettura:</b> {letta.nome} — {letta.lettura.file_trovati} file trovati da Claude ({letta.lettura.operatore}).</div>
          <div>💾 <b>Lavoro in corso</b> di {lavoro.proprietario_nome}: ogni scelta si salva da sola e si riprende da qualunque computer.</div>
          {subito && <div style={{ marginTop: 6 }}><b>Subito nel programma (regola numero uno):</b>{subito.map((x, i) => <div key={i} style={{ color: x.grave ? COL.rosso.testo : C.text, fontWeight: x.grave ? 700 : 400 }}>{x.grave ? "⛔" : "✅"} {x.d.oggetto} ({dataIt(x.d.data_scadenza)}, {euro(x.d.saldo)}): {x.esito}</div>)}</div>}
        </div>

        {lavoro.stato !== "Chiuso" && <>
        {(daSistemare.length > 0 || cl.comunicazioni.some(c => c.chiede_pagamento) || cl.scartati.length > 0) && (
          <div style={{ ...scatola, border: "2px solid #C0392B", padding: "12px 16px", fontSize: 13.5, lineHeight: 1.7 }}>
            <div style={{ fontWeight: 800, color: COL.rosso.testo, marginBottom: 4 }}>⚠️ Prima di tutto</div>
            {cl.comunicazioni.filter(c => c.chiede_pagamento).map(c => <div key={c.k} style={{ color: COL.rosso.testo, fontWeight: 700 }}>💶 {c.chi} chiede {euro(c.importo)}{c.scadenza ? ` entro il ${dataIt(c.scadenza)}` : ""} ({c.nome}).</div>)}
            {daSistemare.map(x => <div key={x.codice_delega || x.k} style={{ color: COL.rosso.testo }}>🔴 {x.k ? x.nome : x.nome_file_ricevuto || x.nome_file_quietanza || x.nome_file_contabile} ({x.k ? `${x.cosa} ${x.chi}` : x.oggetto}): {x.problemi.join("; ")}.</div>)}
            {cl.scartati.map(s => <div key={s.nome} style={{ color: COL.grigio.testo }}>⚪ {s.nome}: {s.esito || s.tipo}{s.note ? ` (${s.note})` : ""}. Resta in DA SMISTARE: lo toglie il Dott. Bizzarri.</div>)}
          </div>
        )}

        {/* Scatola 1: F24 (con le quietanze e contabili abbinate) */}
        <div style={scatola}>
          <div style={testataScatola}>📄 F24 e pagamenti <span style={{ color: C.muted, fontWeight: 600, fontSize: 13 }}>({cl.deleghe.length})</span></div>
          {cl.deleghe.map(d => (
            <Riga key={d.codice_delega} colore={d.colore} aperta={aperte.has(d.codice_delega)} onApri={() => apri(d.codice_delega)} testata={<>
              <Etichetta colore={d.colore}>{d.nienteDiNuovo ? "Già nel programma e in archivio" : d.soloPagamento ? (d.esistente && !d.suo ? "Paga un F24 del programma" : "Quietanza senza F24") : COL[d.colore].nome}</Etichetta>
              <b>{d.oggetto}</b>
              <span style={{ color: C.muted }}>{d.soloPagamento ? `pagato il ${dataIt(d.data_pagamento)}` : `scade il ${dataIt(d.data_scadenza)}`}</span>
              <b>{euro(d.saldo)}</b>
              <span style={{ fontSize: 12, color: d.stato === "Da pagare" ? C.red : C.green, fontWeight: 700 }}>{d.stato}</span>
              {d.scansione && <span style={{ fontSize: 12, color: COL.arancione.testo, fontWeight: 700 }}>SCANSIONE</span>}
              <span style={{ fontSize: 12, color: C.muted }}>{d.nome_file_ricevuto || d.nome_file_quietanza || d.nome_file_contabile}</span>
            </>}>
              <table style={{ fontSize: 12.5, marginBottom: 10, width: "auto", borderCollapse: "collapse" }}>
                <thead><tr style={{ color: C.muted, textAlign: "left" }}>{["Sezione", "Codice", "Che cos'è", "A debito", "A credito", "Cartella"].map(h => <th key={h} style={{ padding: "3px 10px" }}>{h}</th>)}</tr></thead>
                <tbody>{d.righe.map((r, i) => {
                  const c = db.codici.find(x => x.codice === r.codice_tributo); const n = scelte.codici?.[r.codice_tributo];
                  return <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "3px 10px" }}>{r.sezione}</td><td style={{ padding: "3px 10px", fontWeight: 700 }}>{r.codice_tributo}</td>
                    <td style={{ padding: "3px 10px", color: c ? C.text : C.red }}>{c ? c.descrizione : n?.confermato ? "Codice nuovo confermato" : "CODICE NUOVO"}</td>
                    <td style={{ padding: "3px 10px", textAlign: "right" }}>{r.importo_debito ? euro(r.importo_debito) : ""}</td>
                    <td style={{ padding: "3px 10px", textAlign: "right" }}>{r.importo_credito ? euro(r.importo_credito) : ""}</td>
                    <td style={{ padding: "3px 10px", fontSize: 12, color: C.muted }}>{!(r.importo_debito > 0) ? "(credito: non decide)" : c?.cartella_nuova || n?.cartella || (c ? "(non decide)" : "da decidere")}</td>
                  </tr>;
                })}</tbody>
              </table>
              {d.errori.length > 0 && <div style={{ color: COL.rosso.testo, fontWeight: 700 }}>Errori nella lettura (rilancia il prompt): {d.errori.join(" ")}</div>}
              {d.nuovi.map(r => <CodiceNuovo key={r.codice} r={r} valore={scelte.codici?.[r.codice]} onCambia={v => setCodice(r.codice, v)} pagamenti={pagamenti} bloccato={bloccato} />)}
              {d.decisione?.tipo === "versione" && (
                <div style={{ background: "#fff", border: `1.5px solid ${COL.rosso.bordo}`, borderRadius: 10, padding: 12, marginTop: 10 }}>
                  <b>Nel programma c'è già un F24 con la stessa scadenza e le stesse cartelle, ma con righe diverse.</b> È una versione corretta che lo sostituisce, o un F24 in più da pagare?
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                    {d.decisione.candidati.map(f => <button key={f.codice_delega} disabled={bloccato} style={bottone(f.stato !== "Pagato", d.s.sostituisce === f.codice_delega ? C.green : C.primary)} onClick={() => f.stato !== "Pagato" && setDelega(d.codice_delega, { versione: "corretta", sostituisce: f.codice_delega })}>Sostituisce {f.codice_delega} ({f.stato}, {euro(f.saldo)})</button>)}
                    <button disabled={bloccato} style={bottone(true, d.s.versione === "in più" ? C.green : C.accent)} onClick={() => decidiInPiu(d)}>È un F24 in più</button>
                  </div>
                  <div style={{ color: C.muted, fontSize: 12.5, marginTop: 6 }}>Un F24 già «Pagato» non può essere sostituito: se le righe sono diverse, chiedi allo studio.</div>
                </div>
              )}
              {d.decisione?.tipo === "scegli" && (
                <div style={{ marginTop: 10 }}><b>Più F24 del programma hanno le stesse righe: quale paga?</b>{" "}
                  <select disabled={bloccato} value={d.s.abbinaA || ""} onChange={e => setDelega(d.codice_delega, { abbinaA: e.target.value })} style={{ ...campo, minWidth: 320 }}>
                    <option value="">— scegli —</option>{d.decisione.candidati.map(f => <option key={f.codice_delega} value={f.codice_delega}>{f.codice_delega}: {f.oggetto}, {dataIt(f.data_scadenza)}, {f.stato}</option>)}
                  </select></div>
              )}
              {d.scansione && (
                <label style={{ display: "flex", gap: 8, alignItems: "center", background: "#fff", border: `1.5px solid ${COL.arancione.bordo}`, borderRadius: 10, padding: 10, marginTop: 10, cursor: "pointer" }}>
                  <input type="checkbox" disabled={bloccato} checked={!!d.s.scansioneConfermata} onChange={() => setDelega(d.codice_delega, { scansioneConfermata: !d.s.scansioneConfermata })} />
                  <span><b>È una scansione.</b> Ho aperto il PDF e ho controllato: scadenza <b>{dataIt(d.data_scadenza)}</b>, saldo <b>{euro(d.saldo)}</b>, codici e importi sono giusti. (Il PDF digitale si chiede allo studio.)</span>
                </label>
              )}
              {d.soloPagamento && (d.esistente && !d.suo ? (
                <div style={{ marginTop: 8 }}>Paga l'F24 <b>{d.esistente.codice_delega}</b> del programma ({d.esistente.oggetto}, scadenza {dataIt(d.esistente.data_scadenza)}): stesse righe e stesso saldo. È già segnato «Pagato».</div>
              ) : <>
                <div style={{ color: COL.arancione.testo, marginTop: 8 }}>Nessun F24 con queste righe, né in questa lettura né nel programma: il pagamento è nel programma come «Pagato» e <b>l'F24 si chiede allo studio</b>.</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
                  <select disabled={bloccato} value={d.s.categoria || ""} onChange={e => setDelega(d.codice_delega, { categoria: e.target.value })} style={{ ...campo, minWidth: 330 }}>
                    <option value="">— cartella dell'archivio —</option>{pagamenti.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, cursor: "pointer" }}>
                  <input type="checkbox" disabled={bloccato} checked={!!d.s.confermato} onChange={() => setDelega(d.codice_delega, { confermato: !d.s.confermato })} /> Ho controllato: è di Podere Verde e l'F24 manca davvero.
                </label>
              </>)}
              {!d.nienteDiNuovo && !(d.esistente && !d.suo && d.esistente.cartella_pagamento) && !d.sostituisce && <>
                <div style={{ marginTop: 12, fontWeight: 800 }}>Nome della cartella del pagamento <span style={{ fontWeight: 600, color: C.muted, fontSize: 12.5 }}>(uguale in tutte le copie, massimo 60 caratteri)</span></div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                  <input disabled={bloccato} list={`nomi-${d.codice_delega}`} value={d.nome} onChange={e => setDelega(d.codice_delega, { nome: e.target.value.toUpperCase() })} style={{ ...campo, width: 480 }} />
                  <datalist id={`nomi-${d.codice_delega}`}><option value={d.proposto} /><option value={`${d.proposto.slice(0, 57)}_2`} /></datalist>
                  <span style={{ fontSize: 12, color: d.nome.length > 60 ? C.red : C.muted }}>{d.nome.length}/60</span>
                  {d.nome !== d.proposto && !bloccato && <button style={bottone(true, C.muted)} onClick={() => setDelega(d.codice_delega, { nome: null })}>Rimetti la proposta</button>}
                </div>
              </>}
              {!d.nienteDiNuovo && <>
                <div style={{ marginTop: 10, fontWeight: 800 }}>Dove va nell'ARCHIVIO:</div>
                {piano.filter(p => p.delega === d.codice_delega).map(p => <div key={p.destinazione} style={mono}>📁 ARCHIVIO\{p.destinazione} <span style={{ color: p.lunghezza > LIMITE_PERCORSO ? C.red : C.muted, fontFamily: FONT }}>({p.lunghezza}/{LIMITE_PERCORSO})</span></div>)}
                {d.colore === "rosso" && <div style={{ color: C.muted }}>(si vede quando la riga non è più rossa)</div>}
              </>}
              {d.nienteDiNuovo && <div style={{ color: COL.grigio.testo, marginTop: 8 }}>È già nel programma ({d.esistente.codice_delega}) e già nell'archivio: non si archivia di nuovo. Se il file è identico a quello archiviato, alla fine si toglie da DA SMISTARE; altrimenti resta e lo vede il Dott. Bizzarri.</div>}
              {d.problemi.length > 0 && <div style={{ color: COL.rosso.testo, fontWeight: 700, marginTop: 8 }}>Da sistemare: {d.problemi.join("; ")}.</div>}
            </Riga>
          ))}
        </div>

        {/* Scatola 3: Comunicazioni e altro */}
        <div style={scatola}>
          <div style={testataScatola}>✉️ Comunicazioni e altro <span style={{ color: C.muted, fontWeight: 600, fontSize: 13 }}>({cl.comunicazioni.length + cl.scartati.length})</span></div>
          {cl.comunicazioni.map(c => (
            <Riga key={c.k} colore={c.colore} aperta={aperte.has(c.k)} onApri={() => apri(c.k)} testata={<>
              <Etichetta colore={c.colore}>{c.giaNelProgramma ? "Già nel programma" : c.chiede_pagamento ? "Chiede un pagamento" : COL[c.colore].nome}</Etichetta>
              <b>{c.cosa} {c.chi}</b><span style={{ color: C.muted }}>del {dataIt(c.data)}</span><span style={{ fontSize: 12.5 }}>{c.parla}</span>
            </>}>
              {c.chiede_pagamento && <div style={{ color: COL.rosso.testo, fontWeight: 700, marginBottom: 6 }}>💶 Chiede {euro(c.importo)}{c.scadenza ? ` entro il ${dataIt(c.scadenza)}` : ""}. Quando arriva l'F24 che lo paga, lo si collega qui.</div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span>Cartella:</span>
                <select disabled={bloccato} value={c.cartella || ""} onChange={e => setComunicazione(c.k, { cartella: e.target.value })} style={{ ...campo, minWidth: 320 }}>
                  <option value="">— scegli —</option>{cartelleComunicazioni.map(p => <option key={p}>{p}</option>)}
                </select>
                <span>Riguarda l'F24:</span>
                <select disabled={bloccato} value={c.collegato || ""} onChange={e => setComunicazione(c.k, { collegato: e.target.value })} style={{ ...campo, minWidth: 260 }}>
                  <option value="">— nessuno —</option>{cl.deleghe.filter(d => !d.soloPagamento).map(d => <option key={d.codice_delega} value={d.codice_delega}>{d.oggetto} ({dataIt(d.data_scadenza)})</option>)}
                </select>
              </div>
              <div style={{ marginTop: 8, fontWeight: 800 }}>Dove va nell'ARCHIVIO:</div>
              {piano.filter(p => p.comunicazione === c.k).map(p => <div key={p.destinazione} style={mono}>📁 ARCHIVIO\{p.destinazione}</div>)}
            </Riga>
          ))}
          {cl.scartati.map(s => (
            <Riga key={s.nome} colore="grigio" aperta={aperte.has(s.nome)} onApri={() => apri(s.nome)} testata={<><Etichetta colore="grigio" /><b>{s.nome}</b><span style={{ fontSize: 12.5 }}>{s.esito || s.tipo}</span></>}>
              Non si archivia e non si cancella: resta in DA SMISTARE e lo toglie il Dott. Bizzarri. {s.note}
            </Riga>
          ))}
        </div>

        </>}
        {/* Archivia */}
        <div style={{ ...scatola, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 15.5, marginBottom: 8 }}>3. Archivia</div>
          {lavoro.stato !== "Chiuso" && <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
            Il programma scriverà <b>{piano.length} file</b> nell'ARCHIVIO ({PREFISSO_ARCHIVIO}…), ognuno con un nome provvisorio: lo rilegge, controlla l'impronta e solo allora gli dà il nome vero.
            Poi salva tutto nel programma e, alla fine, toglie da DA SMISTARE gli originali archiviati e verificati.
          </div>}
          {daSistemare.length > 0 && lavoro.stato !== "Chiuso" && <div style={{ color: COL.rosso.testo, fontWeight: 700, marginTop: 10 }}>«Archivia» si accende quando non ci sono più righe rosse ({daSistemare.length} da sistemare).</div>}
          {lavoro.stato === "Aperto" && !archiviazione && <button style={{ ...bottone(!daSistemare.length), marginTop: 12, padding: "11px 22px", fontSize: 14.5 }} disabled={!!daSistemare.length} onClick={() => archivia(false)}>📦 Archivia</button>}
          {lavoro.stato === "Archiviazione in corso" && !archiviazione?.inCorso && <button style={{ ...bottone(true, C.accent), marginTop: 12 }} onClick={() => archivia(true)}>▶️ Riprendi l'archiviazione interrotta</button>}
          {archiviazione && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12.5, fontFamily: "Consolas, monospace", maxHeight: 280, overflowY: "auto", background: "#FAFAF8", border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
                {(archiviazione.passi || []).map((p, i) => <div key={i} style={{ color: p.ok ? C.green : C.red }}>{p.ok ? "✅" : "⛔"} {p.testo}</div>)}
                {archiviazione.inCorso && <div style={{ color: C.muted }}>⏳ in corso…</div>}
              </div>
              {archiviazione.errore && <div style={{ marginTop: 10, background: COL.rosso.sfondo, border: `1.5px solid ${COL.rosso.bordo}`, borderRadius: 10, padding: 12, fontWeight: 700, color: COL.rosso.testo }}>
                ⛔ Archiviazione ferma: {archiviazione.errore}. Niente è andato perso: quello che è stato fatto è annotato; risolto il problema, premi «Riprendi l'archiviazione interrotta». Gli originali in DA SMISTARE non sono stati toccati.
              </div>}
              {archiviazione.fine && <div style={{ marginTop: 10, background: COL.verde.sfondo, border: `1.5px solid ${COL.verde.bordo}`, borderRadius: 10, padding: 12, fontWeight: 700, color: COL.verde.testo }}>✅ Lavoro chiuso: {archiviazione.fine}</div>}
            </div>
          )}
        </div>
      </>}
    </div>
  );
}
