import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
import PagamentiF24 from "./PagamentiF24";
import { dataIt, euro } from "./analisiDocumentoBanca";
import { oggiRoma } from "./dateRoma";
import { md5 } from "./md5";
import { browserAdatto, controllaCartella, leggiByte } from "./cartellaBanche";
import { cartella as cartellaF24, esiste, leggiFile, leggiRiconoscimento, nomeNonAccettato, FILE_RICONOSCIMENTO } from "./archivioF24";
import { consulta, totaliPerAnno, corrisponde, lunghezze, nomeAllegatoEstratto, COSA_ESTRATTO, LIMITE_FINALE, LIMITE_PROVVISORIO } from "./calcoloConsultaF24";

// Versione 362 (11/11/2026, ordini del Dott. Bizzarri delle 12:52 e delle 13:07) — «Consulta F24».
// Elenco di tutti gli F24 del programma: stato, come sono stati pagati (banca o compensazione con i crediti), data del pagamento;
// si aprono l'F24, la quietanza e la pagina dell'estratto conto con l'addebito. Due sole scritture, sempre con conferma:
//  1) «Allega la pagina dell'estratto»: solo per un F24 con il pagamento già confermato (riga della banca collegata nella pagina «Chiusura»),
//     copia la pagina dell'estratto nella cartella dell'F24 dell'ARCHIVIO (nome provvisorio corto, rilettura, impronta) e la registra;
//  2) «Segna "Sostituito"»: per un F24 «Da pagare» sostituito da altre deleghe (per esempio un ravvedimento), con il motivo.
// Confermare «Pagato» e collegare la riga della banca NON si fa qui: si fa nella pagina «Chiusura» della versione 355 (una porta sola).

const COLORI = { verde: "#E3F2E1", arancione: "#FFF1DC", rosso: "#FBE1DE", grigio: "#F6F6F4" };
const pausa = ms => new Promise(r => setTimeout(r, ms));
// il file di riconoscimento può essere in UTF-16 (scritto da PowerShell): si legge come nella pagina «F24 arrivati»
const leggiTesto = b => (b[0] === 0xff && b[1] === 0xfe ? new TextDecoder("utf-16le").decode(b.subarray(2)) : new TextDecoder("utf-8").decode(b).replace(/^\uFEFF/, ""));

export default function ConsultaF24({ utente }) {
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState("");
  const [anno, setAnno] = useState("tutti");
  const [stato, setStato] = useState("tutti");
  const [cerca, setCerca] = useState("");
  const [aperto, setAperto] = useState(null);           // id dell'F24 con il dettaglio aperto
  const [vista, setVista] = useState(null);             // { url, nome, pagina }
  const [messaggio, setMessaggio] = useState("");
  const [chiediCartella, setChiediCartella] = useState(null);   // { quale: "BANCHE" | "F24", poi: funzione }
  const [sostituisci, setSostituisci] = useState(null); // { f, scelti: Set, motivo, avviso, inCorso }
  const [allega, setAllega] = useState(null);           // { elenco: [F24], righe: [testo], inCorso, finito }
  const banche = useRef(null);
  const f24root = useRef(null);
  const occupato = useRef(false);

  async function carica() {
    const q = (tab, sel, ord = "id") => fetchAllPages((a, b) => supabase.from(tab).select(sel).order(ord).range(a, b));
    const [f, r, fa, rb, docs, arch, ct, lav, cb, cf] = await Promise.all([
      q("ci_f24", "id, codice_delega, oggetto, data_scadenza, anno, totale_debito, totale_credito, saldo, tipo_pagamento, stato, data_pagamento, banca_addebito, protocollo_telematico, nome_file_ricevuto, nome_file_quietanza, md5_pdf, md5_quietanza, riga_fonte_id, lavoro_id, note, cartella_pagamento"),
      q("ci_f24_righe", "id, f24_id, numero_riga, sezione, codice_tributo, descrizione_codice, codice_ente_sede, rateazione_mese, anno_riferimento, importo_debito, importo_credito, trattamento"),
      q("ci_f24_file_archivio", "id, percorso, cartella, cosa, superato, f24_id, md5, dimensione"),
      q("ci_righe_fonte", "id, documento_id, conto_id, data_contabile, verso, importo, descrizione, pagina_pdf"),
      q("ci_documenti_fonte", "id, conto_id, periodo_dal, periodo_al, pdf_impronta, file_digitale_impronta, annullato_il"),
      fetchAllPages((a, b) => supabase.from("ci_banche_archivio").select("impronta, percorso").order("impronta").range(a, b)),
      supabase.from("ci_conti").select("id, nome"),
      supabase.from("ci_f24_lavori").select("id, stato, file_lettura"),
      supabase.from("ci_banche_cartella").select("codice"),
      supabase.from("ci_f24_codice_cartella").select("codice"),
    ]);
    for (const x of [f, r, fa, rb, docs, arch, ct, lav, cb, cf]) if (x.error) throw new Error(x.error.message);
    const conti = Object.fromEntries((ct.data || []).map(x => [x.id, x.nome]));
    const calcolo = consulta({ f24: f.data || [], righeTributo: r.data || [], fileArchivio: fa.data || [], righeBanca: rb.data || [], documenti: docs.data || [],
      bancheArchivio: new Map((arch.data || []).map(a => [a.impronta, a.percorso])), conti, lavori: lav.data || [], oggi: oggiRoma() });
    setD({ ...calcolo, conti, codiceBanche: cb.data?.[0]?.codice || null, codiceF24: cf.data?.[0]?.codice || null, fileArchivio: fa.data || [] });
  }
  useEffect(() => { carica().catch(x => setErrore("Lettura non riuscita: " + x.message)); }, []);

  const anni = useMemo(() => [...new Set((d?.elenco || []).map(f => f.anno))].sort().reverse(), [d]);
  const visibili = useMemo(() => (d?.elenco || [])
    .filter(f => anno === "tutti" || f.anno === anno)
    .filter(f => stato === "tutti" || f.stato === stato)
    .filter(f => corrisponde(f, cerca))
    .sort((a, b) => String(b.data_scadenza || "").localeCompare(String(a.data_scadenza || "")) || b.id - a.id), [d, anno, stato, cerca]);
  const totali = useMemo(() => (d ? totaliPerAnno(d.elenco) : []), [d]);

  // ── Cartelle del cloud (si scelgono una volta finché la pagina resta aperta) ─────────────────────────────
  async function prendiBanche() {
    if (banche.current) { const k = await controllaCartella(banche.current, d.codiceBanche); if (k.ok) return banche.current; }
    let h; try { h = await window.showDirectoryPicker({ id: "banche-podere-verde", mode: "read" }); }
    catch (x) { if (x?.name !== "AbortError") setMessaggio("Scelta della cartella non riuscita: " + x.message); return null; }
    const k = await controllaCartella(h, d.codiceBanche); if (!k.ok) { setMessaggio(k.problema); return null; }
    banche.current = h; return h;
  }
  async function controllaF24(h) {
    let testo = null;
    try { testo = leggiTesto(await leggiFile(h, `PROGRAMMA\\${FILE_RICONOSCIMENTO}`)); } catch { testo = null; }
    if (testo === null) return `Nella cartella scelta («${h.name}») non c'è «PROGRAMMA\\${FILE_RICONOSCIMENTO}»: questa non è la cartella F24 di Podere Verde. Bisogna scegliere proprio F24.`;
    const r = leggiRiconoscimento(testo);
    if (!r.ok) return "Il file di riconoscimento non dice «Podere Verde, 15117871002, F24»: questa non è la cartella F24 di Podere Verde.";
    if (!d.codiceF24 || r.codice !== d.codiceF24) return `Il codice del file di riconoscimento (${r.codice}) non è quello del programma (${d.codiceF24 || "manca"}): questa non è la cartella F24 giusta.`;
    return null;
  }
  async function prendiF24(scrivere) {
    let h = f24root.current;
    if (!h) {
      try { h = await window.showDirectoryPicker({ id: "f24-podere-verde", mode: scrivere ? "readwrite" : "read" }); }
      catch (x) { if (x?.name !== "AbortError") setMessaggio("Scelta della cartella non riuscita: " + x.message); return null; }
    } else if (scrivere) {
      // la cartella era stata scelta per leggere: il permesso di modificare si chiede SUBITO, finché vale il clic (Chrome lo vuole così)
      let p = "denied";
      try { p = await h.requestPermission({ mode: "readwrite" }); } catch { p = "denied"; }
      if (p !== "granted") { setMessaggio("Il browser non ha dato il permesso di modificare i file della cartella F24: premere di nuovo «2. Scegli la cartella F24» e, quando Chrome lo chiede, rispondere «Modifica i file»."); return null; }
    }
    const no = await controllaF24(h); if (no) { f24root.current = null; setMessaggio(no); return null; }
    if (scrivere && (await h.queryPermission({ mode: "readwrite" })) !== "granted") {
      setMessaggio("Senza il permesso di modificare i file della cartella F24 la pagina dell'estratto non si può allegare."); return null; }
    f24root.current = h; return h;
  }
  // la prima volta si spiega quale cartella scegliere, poi si apre la finestra di Windows
  function conCartella(quale, poi) {
    if (!browserAdatto()) { setMessaggio("Per aprire o scrivere i file dell'archivio serve Chrome o Edge sul computer."); return; }
    if ((quale === "BANCHE" && banche.current) || (quale !== "BANCHE" && f24root.current)) { poi(); return; }
    setChiediCartella({ quale, poi });
  }

  function mostra(byte, nome, pagina = 1) {
    if (vista?.url) URL.revokeObjectURL(vista.url);
    setVista({ url: URL.createObjectURL(new Blob([byte], { type: "application/pdf" })), nome, pagina });
  }
  async function daProgramma(percorso) {
    const { data, error } = await supabase.storage.from("f24").download(percorso);
    if (error) throw new Error(error.message);
    return new Uint8Array(await data.arrayBuffer());
  }
  async function apriDocumento(f, cosa) {
    setMessaggio("");
    const nelProgramma = cosa === "F24" ? (f.md5_pdf ? `${f.codice_delega}/F24.pdf` : null) : cosa === "Quietanza" ? (f.md5_quietanza ? `${f.codice_delega}/quietanza.pdf` : null) : null;
    if (nelProgramma) {
      let byte = null; try { byte = await daProgramma(nelProgramma); } catch { byte = null; /* si prova dall'archivio */ }
      if (byte) {
        const atteso = cosa === "F24" ? f.md5_pdf : f.md5_quietanza;
        if (atteso && md5(byte) !== atteso) { setMessaggio(`Il PDF ${cosa === "F24" ? "dell'F24" : "della quietanza"} ${f.codice_delega} salvato nel programma non è quello registrato (impronta diversa): non lo apro. Avvisare il Dott. Bizzarri.`); return; }
        return mostra(byte, `${cosa === "F24" ? "F24" : "Quietanza"} ${f.codice_delega}.pdf`);
      }
    }
    const file = (cosa === "F24" ? f.fileF24 : cosa === "Quietanza" ? f.quietanze : f.allegati)[0];
    if (!file) { setMessaggio(`${cosa === "F24" ? "Il PDF dell'F24" : cosa === "Quietanza" ? "La quietanza" : "La pagina dell'estratto"} non è né nel programma né nell'archivio.${f.avvisi.length ? " " + f.avvisi[0] + "." : ""}`); return; }
    conCartella("F24", async () => {
      const h = await prendiF24(false); if (!h) return;
      try { mostra(await leggiFile(await cartellaF24(h, "ARCHIVIO"), file.percorso), file.percorso.split("\\").pop()); }
      catch (x) { setMessaggio(`Apertura non riuscita: ARCHIVIO\\${file.percorso} — ${x.message}`); }
    });
  }
  function apriEstratto(e) {
    setMessaggio("");
    if (!e?.percorso) { setMessaggio("L'estratto conto di questo addebito non è nell'archivio BANCHE: si mette con la pagina «Carica documenti della banca»."); return; }
    conCartella("BANCHE", async () => {
      const h = await prendiBanche(); if (!h) return;
      try { mostra(await leggiByte(h, e.percorso), e.percorso.split("\\").pop(), e.pagina); }
      catch (x) { setMessaggio(`Apertura non riuscita: BANCHE\\${e.percorso} — ${x.message}`); }
    });
  }

  // ── Allegare la pagina dell'estratto nella cartella dell'F24 ──────────────────────────────────────────────
  async function scriviCorto(dir, nomeChiesto, byte, controllaNome) {
    const impronta = md5(byte);
    let nome = nomeChiesto;
    for (let n = 2; ; n++) {
      const gia = await esiste(dir, nome);
      if (!gia) break;
      const vecchio = md5(new Uint8Array(await (await (await dir.getFileHandle(gia)).getFile()).arrayBuffer()));
      if (vecchio === impronta) return { esito: "già presente uguale", nome: gia, md5: impronta };
      nome = nomeChiesto.replace(/(\.[^.]+)$/, `_${n}$1`);
    }
    // nome provvisorio corto (19 caratteri): con «PROVVISORIO <ora> <nome>» il percorso superava i 260 caratteri di Windows
    const no = controllaNome ? controllaNome(nome) : null; if (no) throw new Error(no);
    const provvisorio = `PROVV ${String(Date.now() % 1000000).padStart(6, "0")}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}.pdf`;
    let fh;
    try { fh = await dir.getFileHandle(provvisorio, { create: true }); const w = await fh.createWritable(); await w.write(byte); await w.close(); }
    catch (x) { try { await dir.removeEntry(provvisorio); } catch { /* non c'era */ } throw x; }
    const rileggi = async (n) => { for (let k = 0; k < 6; k++) { if (md5(new Uint8Array(await (await (await dir.getFileHandle(n)).getFile()).arrayBuffer())) === impronta) return true; await pausa(700); } return false; };
    if (!(await rileggi(provvisorio))) { try { await dir.removeEntry(provvisorio); } catch { /* resta: si vede */ } throw new Error("la copia scritta non è uguale (impronta diversa)"); }
    let fatto = false;
    if (typeof fh.move === "function") { try { await fh.move(nome); fatto = true; } catch { fatto = false; } }
    if (!fatto) { const fv = await dir.getFileHandle(nome, { create: true }); const w2 = await fv.createWritable(); await w2.write(byte); await w2.close(); await dir.removeEntry(provvisorio); }
    if (!(await rileggi(nome))) throw new Error("dopo il cambio di nome l'impronta non torna");
    return { esito: "scritto", nome, md5: impronta };
  }
  function preparaAllega(elenco) {
    const pronti = elenco.filter(f => f.daAllegare.length);
    if (!pronti.length) { setMessaggio("Non c'è nessuna pagina da allegare: si allega solo a un F24 con il pagamento confermato nella pagina «Chiusura» e con il PDF nell'archivio."); return; }
    setAllega({ elenco: pronti, righe: [], inCorso: false, finito: false, banche: !!banche.current, f24: false });
  }
  async function eseguiAllega() {
    if (occupato.current || !allega) return;
    occupato.current = true;
    const righe = []; const scrivi = t => { righe.push(t); setAllega(a => ({ ...a, righe: [...righe] })); };
    setAllega(a => ({ ...a, inCorso: true }));
    try {
      // le due cartelle sono già state scelte con i pulsanti 1 e 2 (la finestra di Windows e il permesso di modificare vogliono ciascuno il proprio clic)
      const hf = await prendiF24(true); if (!hf) throw new Error("cartella F24 non scelta o senza il permesso di modificare");
      const hb = await prendiBanche(); if (!hb) throw new Error("cartella BANCHE non scelta");
      const archivio = await cartellaF24(hf, "ARCHIVIO");
      const pagine = new Map();
      for (const f of allega.elenco) {
        const e = f.estratto; const nome = nomeAllegatoEstratto(f.rigaCollegata);
        scrivi(`F24 ${f.codice_delega} — ${f.oggetto} (${dataIt(f.data_scadenza)}, ${euro(f.saldo)}): estratto ${e.conto}, pagina ${e.pagina}`);
        try {
          const chiave = `${e.percorso}|${e.pagina}`;
          if (!pagine.has(chiave)) {
            const tutto = await leggiByte(hb, e.percorso);
            const atteso = e.documento?.pdf_impronta || e.documento?.file_digitale_impronta;
            if (atteso && md5(tutto) !== atteso) throw new Error("l'estratto nell'archivio BANCHE non è quello caricato nel programma (impronta diversa): mi fermo");
            const orig = await PDFDocument.load(tutto);
            if (e.pagina < 1 || e.pagina > orig.getPageCount()) throw new Error(`l'estratto ha ${orig.getPageCount()} pagine, non c'è la pagina ${e.pagina}`);
            const nuovo = await PDFDocument.create({ updateMetadata: false });   // senza la data di creazione: stessa pagina, stessa impronta
            const [p] = await nuovo.copyPages(orig, [e.pagina - 1]); nuovo.addPage(p);
            pagine.set(chiave, new Uint8Array(await nuovo.save({ useObjectStreams: false })));
          }
          const byte = pagine.get(chiave);
          for (const c of f.daAllegare) {
            const controllaNome = n => { const l = lunghezze(c.cartella, n); return l.finale > LIMITE_FINALE || l.provvisorio > LIMITE_PROVVISORIO ? `non scritto: il percorso sarebbe di ${l.finale} caratteri, oltre ${LIMITE_FINALE} — ARCHIVIO\\${c.cartella}\\${n}` : null; };
            if (controllaNome(nome)) { scrivi(`   ⛔ ${controllaNome(nome)}`); continue; }
            for (const n of [...c.cartella.split("\\"), nome]) { const no = nomeNonAccettato(n); if (no) throw new Error(`il nome «${n}» ${no}`); }
            const dir = await cartellaF24(archivio, c.cartella, false);   // la cartella dell'F24 c'è già: non se ne creano
            const r = await scriviCorto(dir, nome, byte, controllaNome);
            const percorso = `${c.cartella}\\${r.nome}`;
            const gia = d.fileArchivio.some(x => String(x.percorso).toUpperCase() === percorso.toUpperCase());
            if (!gia) {
              const { error } = await supabase.from("ci_f24_file_archivio").insert({ percorso, cartella: c.categoria, cosa: COSA_ESTRATTO, f24_id: f.id, md5: r.md5, dimensione: byte.length });
              if (error) throw new Error(`file scritto ma non registrato nel programma (ARCHIVIO\\${percorso}): ${error.message}`);
            }
            scrivi(`   ✅ ${r.esito === "scritto" ? "scritto" : "c'era già, uguale"}: ARCHIVIO\\${percorso} (${Math.round(byte.length / 1024)} KB)`);
          }
        } catch (x) { scrivi(`   ⛔ ${x.message}`); }
      }
    } catch (x) { scrivi(`⛔ Lavoro fermato: ${x.message}`); }
    finally { occupato.current = false; setAllega(a => ({ ...a, inCorso: false, finito: true })); await carica().catch(() => {}); }
  }

  // ── «Sostituito» ────────────────────────────────────────────────────────────────────────────────────────
  const possibiliSostituti = f => (d?.elenco || []).filter(g => g.id !== f.id && g.stato === "Pagato" && g.data_pagamento && f.data_scadenza && g.data_pagamento >= f.data_scadenza)
    .sort((a, b) => a.data_pagamento.localeCompare(b.data_pagamento)).slice(0, 40);
  async function confermaSostituito() {
    const s = sostituisci; if (!s || s.inCorso) return;
    if (!s.scelti.size) { setSostituisci({ ...s, avviso: "Scegliere almeno una delega che lo sostituisce." }); return; }
    if (!s.motivo.trim()) { setSostituisci({ ...s, avviso: "Scrivere il motivo: è obbligatorio." }); return; }
    setSostituisci({ ...s, inCorso: true, avviso: "" });
    const sostituti = (d.elenco || []).filter(g => s.scelti.has(g.id));
    const { data: ora, error: e1 } = await supabase.from("ci_f24").select("note, stato").eq("id", s.f.id).maybeSingle();
    if (e1 || !ora) { setSostituisci({ ...s, inCorso: false, avviso: "Lettura non riuscita: " + (e1?.message || "F24 non trovato") }); return; }
    if (ora.stato !== "Da pagare") { setSostituisci({ ...s, inCorso: false, avviso: `Nel frattempo è diventato «${ora.stato}»: non si cambia.` }); return; }
    const testo = `«Sostituito» da ${sostituti.map(g => `${g.codice_delega} (${g.oggetto}, pagato il ${dataIt(g.data_pagamento)})`).join("; ")}. Motivo: ${s.motivo.trim()}. Segnato il ${dataIt(oggiRoma())} da ${utente?.email || "utente"}`;
    const { data, error } = await supabase.from("ci_f24").update({ stato: "Sostituito", note: ora.note ? `${ora.note}\n${testo}` : testo }).eq("id", s.f.id).eq("stato", "Da pagare").select("id");
    if (error || !(data || []).length) { setSostituisci({ ...s, inCorso: false, avviso: "Non cambiato: " + (error?.message || "nel frattempo è cambiato") }); return; }
    setSostituisci(null); setMessaggio(`F24 ${s.f.codice_delega} segnato «Sostituito»: non compare più fra quelli da pagare.`); await carica();
  }

  function scaricaExcel() {
    const righe = visibili.map(f => ({ "Codice delega": f.codice_delega, "Scadenza": dataIt(f.data_scadenza), "Che cosa si paga": f.oggetto, "Totale a debito": Number(f.totale_debito),
      "Totale a credito": Number(f.totale_credito), "Saldo": Number(f.saldo), "Stato": f.stato, "Come è stato pagato": f.come, "Data del pagamento": f.dataPagamento ? dataIt(f.dataPagamento) : "",
      "Pagamento da confermare": f.daConfermare ? "SÌ" : "", "Riga della banca": (f.rigaCollegata || f.rigaProposta) ? `${dataIt((f.rigaCollegata || f.rigaProposta).data_contabile)} ${(f.rigaCollegata || f.rigaProposta).descrizione}` : "",
      "Pagina dell'estratto": f.estratto ? `${f.estratto.percorso || "non nell'archivio"} pagina ${f.estratto.pagina}` : "", "Quietanza": f.md5_quietanza || f.quietanze.length ? "SÌ" : "NO",
      "Protocollo telematico": f.protocollo_telematico || "", "Avvisi": f.avvisi.join(" | ") }));
    const ws = XLSX.utils.json_to_sheet(righe); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "F24");
    XLSX.writeFile(wb, `Consulta F24 ${oggiRoma()}.xlsx`);
  }

  if (errore) return <div style={{ color: C.red }}>{errore}</div>;
  if (!d) return <div>Lettura in corso…</div>;
  const nonPagati = d.elenco.filter(f => f.colore === "rosso");
  const daConfermare = d.elenco.filter(f => f.daConfermare);
  const senzaQuietanza = d.elenco.filter(f => f.stato === "Pagato" && f.avvisi.some(a => /quietanza non è/.test(a)));
  const lettureAperte = [...new Set(d.elenco.filter(f => f.avvisi.some(a => /non è ancora archiviata/.test(a))).map(f => f.avvisi.find(a => /non è ancora archiviata/.test(a))))];
  const pronteDaAllegare = d.elenco.filter(f => f.daAllegare.length);
  const cella = { padding: "5px 8px", verticalAlign: "top", fontSize: 12.5, borderBottom: `1px solid ${C.border}` };
  return (
    <div style={{ maxWidth: 1300, minWidth: 0 }}>
      <h2 style={{ color: C.primary, margin: "0 0 4px" }}>Consulta F24</h2>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>Tutti gli F24 del programma: come sono stati pagati, quando, e le prove (F24, quietanza, pagina dell'estratto conto). Il «Pagato» con la riga della banca si conferma nel riquadro «Chiusura», in fondo a questa pagina (è lo stesso della pagina «Carica le fatture da Aruba», scheda F24).</div>

      {vista && <Finestra larga onChiudi={() => { URL.revokeObjectURL(vista.url); setVista(null); }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}><b style={{ flex: 1 }}>{vista.nome} — pagina {vista.pagina}</b>
          <a href={vista.url} download={vista.nome} style={{ fontSize: 13 }}>Scarica una copia</a>
          <button style={btn(false)} onClick={() => { URL.revokeObjectURL(vista.url); setVista(null); }}>Chiudi</button></div>
        <iframe key={vista.url + vista.pagina} title="documento" src={`${vista.url}#page=${vista.pagina}`} style={{ width: "100%", height: "calc(92vh - 70px)", border: `1px solid ${C.border}` }} />
      </Finestra>}
      {allega && <Finestra larga onChiudi={() => { if (!allega.inCorso) setAllega(null); }}>
        <div style={{ fontWeight: 800, color: C.primary, fontSize: 15, marginBottom: 8 }}>Allegare la pagina dell'estratto conto a {allega.elenco.length} F24</div>
        {!allega.inCorso && !allega.finito && <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          Per ogni F24 il programma prende dall'archivio BANCHE l'estratto conto con l'addebito, ne stacca la pagina, la scrive nella cartella dell'F24 dell'ARCHIVIO con il nome «ESTRATTO CONTO &lt;data dell'addebito&gt;.pdf», la rilegge e controlla l'impronta. Non sovrascrive niente e non tocca l'estratto.
          Servono le due cartelle, una alla volta, con i pulsanti 1 e 2 qui sotto: nella finestra di Windows aprire il cloud <b>Company</b> → <code>SOCIETA</code> → <code>SOCIETA' AGRICOLA PODERE VERDE A R.L</code> → <code>00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE</code>, cliccare una volta sulla cartella (BANCHE, poi F24) e premere «Seleziona cartella». Per la cartella F24 Chrome chiede il permesso di modificare i file: rispondere di sì.
          <ul style={{ margin: "6px 0", paddingLeft: 22 }}>{allega.elenco.map(f => <li key={f.id}>{dataIt(f.data_scadenza)} — {f.oggetto} — {euro(f.saldo)}: pagina {f.estratto.pagina} dell'estratto, in {f.daAllegare.length} cartell{f.daAllegare.length === 1 ? "a" : "e"}</li>)}</ul></div>}
        {allega.righe.length > 0 && <div style={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap", background: "#FAFAF7", border: `1px solid ${C.border}`, padding: 8, maxHeight: "50vh", overflow: "auto" }}>{allega.righe.join("\n")}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {!allega.finito && !allega.inCorso && <button style={btn(!allega.banche)} disabled={allega.banche} onClick={async () => { if (!browserAdatto()) { setMessaggio("Serve Chrome o Edge sul computer."); return; } if (await prendiBanche()) setAllega(a => ({ ...a, banche: true })); }}>{allega.banche ? "✓ Cartella BANCHE scelta" : "1. Scegli la cartella BANCHE"}</button>}
          {!allega.finito && !allega.inCorso && <button style={btn(allega.banche && !allega.f24)} disabled={!allega.banche || allega.f24} onClick={async () => { if (await prendiF24(true)) setAllega(a => ({ ...a, f24: true })); }}>{allega.f24 ? "✓ Cartella F24 scelta, con il permesso di modificare" : "2. Scegli la cartella F24"}</button>}
          {!allega.finito && <button style={btn(allega.banche && allega.f24)} disabled={allega.inCorso || !allega.banche || !allega.f24} onClick={eseguiAllega}>{allega.inCorso ? "Lavoro in corso…" : "3. Sì, allega"}</button>}
          <button style={btn(false)} disabled={allega.inCorso} onClick={() => setAllega(null)}>{allega.finito ? "Chiudi" : "No, lascia stare"}</button></div>
      </Finestra>}
      {sostituisci && <Finestra onChiudi={() => { if (!sostituisci.inCorso) setSostituisci(null); }}>
        <div style={{ fontWeight: 800, color: C.red, fontSize: 15, marginBottom: 8 }}>Segnare «Sostituito» l'F24 {sostituisci.f.codice_delega}?</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.55 }}><b>{sostituisci.f.oggetto}</b>, scadenza {dataIt(sostituisci.f.data_scadenza)}, saldo {euro(sostituisci.f.saldo)}.
          <div style={{ marginTop: 6 }}>Un F24 «Sostituito» non si paga più: esce da quelli da pagare e resta nell'elenco con il motivo. Non si può tornare indietro da questa pagina. Si usa quando al suo posto sono state pagate altre deleghe, per esempio un ravvedimento.</div>
          <div style={{ marginTop: 6, fontWeight: 700 }}>Da quali deleghe è stato sostituito?</div>
          <div style={{ maxHeight: 220, overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 6, padding: 6 }}>
            {possibiliSostituti(sostituisci.f).map(g => <label key={g.id} style={{ display: "block", fontSize: 12.5 }}><input type="checkbox" checked={sostituisci.scelti.has(g.id)} onChange={e => { const s = new Set(sostituisci.scelti); if (e.target.checked) s.add(g.id); else s.delete(g.id); setSostituisci({ ...sostituisci, scelti: s, avviso: "" }); }} /> {dataIt(g.data_pagamento)} — {g.oggetto} — saldo {euro(g.saldo)} ({g.come})</label>)}
          </div></div>
        <input style={{ ...input, width: "100%", marginTop: 8 }} placeholder="motivo (obbligatorio), per esempio: rifatto con il ravvedimento dell'08/05/2026" value={sostituisci.motivo} onChange={e => setSostituisci({ ...sostituisci, motivo: e.target.value, avviso: "" })} />
        {sostituisci.avviso && <div style={{ color: C.red, fontWeight: 700, fontSize: 13, marginTop: 6 }}>{sostituisci.avviso}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button style={btn(true, C.red)} disabled={!!sostituisci.inCorso} onClick={confermaSostituito}>{sostituisci.inCorso ? "In corso…" : "Sì, segna «Sostituito»"}</button><button style={btn(false)} disabled={!!sostituisci.inCorso} onClick={() => setSostituisci(null)}>No, lascia stare</button></div>
      </Finestra>}

      {chiediCartella && <Finestra onChiudi={() => setChiediCartella(null)}>
        <div style={{ fontWeight: 800, color: C.primary, fontSize: 15, marginBottom: 8 }}>Serve la cartella {chiediCartella.quale}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>Il programma prende il documento dall'archivio nel cloud. La cartella si sceglie una volta: finché la pagina resta aperta, gli altri documenti si aprono subito.
          <ol style={{ margin: "6px 0", paddingLeft: 22 }}>
            <li>Premere <b>«Scegli la cartella {chiediCartella.quale}»</b> qui sotto.</li>
            <li>Nella finestra che si apre, a sinistra in <b>Questo PC</b>, aprire il cloud <b>Company</b>.</li>
            <li>Entrare, una cartella dopo l'altra, in <code>SOCIETA</code> → <code>SOCIETA' AGRICOLA PODERE VERDE A R.L</code> → <code>00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE</code>.</li>
            <li>Cliccare <b>una sola volta</b> su <code>{chiediCartella.quale}</code>, senza aprirla, e premere <b>«Seleziona cartella»</b>. Se il browser chiede il permesso, confermare.</li>
          </ol></div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button style={btn(true)} onClick={() => { const c = chiediCartella; setChiediCartella(null); c.poi(); }}>Scegli la cartella {chiediCartella.quale}</button><button style={btn(false)} onClick={() => setChiediCartella(null)}>Lascia stare</button></div>
      </Finestra>}
      {messaggio && <Finestra onChiudi={() => setMessaggio("")}>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, borderLeft: `4px solid ${C.yellow}`, paddingLeft: 10 }}>{messaggio}</div>
        <div style={{ marginTop: 10 }}><button style={btn(false)} onClick={() => setMessaggio("")}>Chiudi</button></div>
      </Finestra>}

      {(nonPagati.length > 0 || daConfermare.length > 0 || d.senzaF24.length > 0 || senzaQuietanza.length > 0 || lettureAperte.length > 0 || pronteDaAllegare.length > 0) &&
      <div style={{ ...scheda, borderLeft: `5px solid ${nonPagati.length ? C.red : C.yellow}` }}>
        <div style={{ fontWeight: 800, color: nonPagati.length ? C.red : C.primary, marginBottom: 6 }}>Prima di tutto</div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
          {nonPagati.length > 0 && <li style={{ color: C.red }}><b>{nonPagati.length} F24 scadut{nonPagati.length === 1 ? "o" : "i"} e non pagat{nonPagati.length === 1 ? "o" : "i"}</b> (in banca non c'è l'addebito): {nonPagati.map(f => `${dataIt(f.data_scadenza)} ${euro(f.saldo)}`).join("; ")}. Se è stato sostituito da altre deleghe (per esempio un ravvedimento), aprirlo e premere «Segna "Sostituito"».</li>}
          {daConfermare.length > 0 && <li><b>{daConfermare.length} F24 pagati secondo l'estratto conto, da confermare</b>: {daConfermare.filter(f => f.stato !== "Pagato").length} ancora «Da pagare» e {daConfermare.filter(f => f.stato === "Pagato").length} «Pagato» senza la riga della banca collegata. Si confermano nel riquadro «Chiusura» in fondo a questa pagina: un clic per riga, poi «Aggiorna l'elenco».</li>}
          {d.senzaF24.length > 0 && <li><b>{d.senzaF24.length} pagamenti di F24 in banca senza l'F24 nel programma</b> (dal {dataIt(d.daQuando)}): {d.senzaF24.map(r => `${dataIt(r.data_contabile)} ${euro(r.importo)}`).join("; ")}. Gli F24 vanno caricati con «F24 arrivati».</li>}
          {lettureAperte.map(a => <li key={a}>Per {d.elenco.filter(f => f.avvisi.includes(a)).length} F24 {a}: si finisce con «F24 arrivati: controlla e archivia».</li>)}
          {senzaQuietanza.length > 0 && <li>{senzaQuietanza.length} F24 pagati con i crediti senza la quietanza nel programma o nell'archivio.</li>}
          {pronteDaAllegare.length > 0 && <li>{pronteDaAllegare.length} F24 con il pagamento confermato hanno la pagina dell'estratto da allegare. <button style={{ ...btn(false), height: 26 }} onClick={() => preparaAllega(pronteDaAllegare)}>Allega a tutti</button></li>}
        </ul>
      </div>}

      <div style={{ ...scheda, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select style={input} value={anno} onChange={e => setAnno(e.target.value)}><option value="tutti">Tutti gli anni</option>{anni.map(a => <option key={a} value={a}>{a}</option>)}</select>
        <select style={input} value={stato} onChange={e => setStato(e.target.value)}>{["tutti", "Da pagare", "Disposto", "Pagato", "Sostituito"].map(s => <option key={s} value={s}>{s === "tutti" ? "Tutti gli stati" : s}</option>)}</select>
        <input style={{ ...input, flex: "1 1 260px" }} placeholder="cerca: che cosa si paga, codice tributo (per esempio 1001), importo (per esempio 1.150,00), data (per esempio 16/04/2026)" value={cerca} onChange={e => setCerca(e.target.value)} />
        <span style={{ fontSize: 12.5 }}>Trovati: <b>{visibili.length}</b> su {d.elenco.length}</span>
        <button style={btn(false)} onClick={scaricaExcel}>Scarica in Excel</button>
      </div>

      <div style={{ ...scheda, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>{["", "Scadenza", "Che cosa si paga", "Saldo", "Stato", "Come è stato pagato", "Data del pagamento", "Documenti"].map(h => <th key={h} style={{ padding: "6px 8px", fontSize: 11.5, textAlign: h === "Saldo" ? "right" : "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
          <tbody>{visibili.map(f => <Riga key={f.id} f={f} aperto={aperto === f.id} cella={cella} onApri={() => setAperto(aperto === f.id ? null : f.id)}
            onDocumento={cosa => apriDocumento(f, cosa)} onEstratto={() => apriEstratto(f.estratto)} onAllega={() => preparaAllega([f])}
            onSostituisci={() => setSostituisci({ f, scelti: new Set(), motivo: "", avviso: "", inCorso: false })} />)}</tbody>
        </table>
        {!visibili.length && <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>Nessun F24 con questi filtri.</div>}
      </div>

      {d.senzaF24.length > 0 && <div style={{ ...scheda, overflowX: "auto" }}>
        <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>Pagamenti di F24 in banca senza l'F24 nel programma (dal {dataIt(d.daQuando)})</div>
        <table style={{ borderCollapse: "collapse", width: "100%" }}><tbody>{d.senzaF24.map(r => <tr key={r.id}>
          <td style={cella}>{dataIt(r.data_contabile)}</td><td style={{ ...cella, textAlign: "right" }}>{euro(r.importo)}</td><td style={cella}>{r.estratto?.conto}</td><td style={cella}>{r.descrizione}</td>
          <td style={cella}><button style={{ ...btn(false), height: 28 }} onClick={() => apriEstratto(r.estratto)}>Estratto, pagina {r.pagina_pdf || 1}</button></td></tr>)}</tbody></table>
      </div>}

      <div style={{ ...scheda, overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, color: C.primary, flex: 1 }}>Conferma dei pagamenti</div>
          <button style={btn(false)} onClick={() => carica().catch(x => setMessaggio("Lettura non riuscita: " + x.message))}>Aggiorna l'elenco</button></div>
        <div style={{ fontSize: 12.5, color: C.muted, margin: "4px 0" }}>È il riquadro della pagina «Carica le fatture da Aruba», scheda F24: qui il «Pagato» si conferma con un clic per riga. Dopo le conferme premere «Aggiorna l'elenco».</div>
        <PagamentiF24 utente={utente} />
      </div>

      <div style={{ ...scheda, overflowX: "auto" }}>
        <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>Totali per anno della scadenza (senza gli F24 «Sostituito»)</div>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Anno", "F24", "Totale a debito", "Totale a credito", "Saldo", "Pagato (saldo)", "Pagati con i crediti", "Ancora da pagare (saldo)"].map(h => <th key={h} style={{ padding: "6px 8px", fontSize: 11.5, textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>{totali.map(t => <tr key={t.anno}>
            <td style={cella}><b>{t.anno}</b></td><td style={cella}>{t.numero}</td><td style={{ ...cella, textAlign: "right" }}>{euro(t.debito)}</td><td style={{ ...cella, textAlign: "right" }}>{euro(t.credito)}</td>
            <td style={{ ...cella, textAlign: "right" }}>{euro(t.saldo)}</td><td style={{ ...cella, textAlign: "right" }}>{euro(t.pagatoSaldo)}</td><td style={cella}>{t.pagatoCompensazione}</td>
            <td style={{ ...cella, textAlign: "right", color: t.daPagare ? C.red : C.text }}>{euro(t.daPagare)}</td></tr>)}</tbody>
        </table>
        {totali.map(t => <details key={t.anno} style={{ marginTop: 6 }}><summary style={{ cursor: "pointer", fontSize: 13 }}>{t.anno}: per tipo di spesa (dal trattamento di ogni codice)</summary>
          <table style={{ borderCollapse: "collapse", marginTop: 4 }}><tbody>{Object.entries(t.perTrattamento).sort((a, b) => b[1].debito - a[1].debito).map(([k, v]) => <tr key={k}>
            <td style={cella}>{k}</td><td style={{ ...cella, textAlign: "right" }}>a debito {euro(v.debito)}</td><td style={{ ...cella, textAlign: "right" }}>a credito {euro(v.credito)}</td></tr>)}</tbody></table>
        </details>)}
      </div>
    </div>
  );
}

function Riga({ f, aperto, cella, onApri, onDocumento, onEstratto, onAllega, onSostituisci }) {
  const piccolo = { ...btn(false), height: 26, padding: "0 8px", fontSize: 11.5, marginRight: 4, marginBottom: 3 };
  const haF24 = !!(f.md5_pdf || f.fileF24.length), haQuietanza = !!(f.md5_quietanza || f.quietanze.length);
  return <>
    <tr style={{ background: COLORI[f.colore] }}>
      <td style={{ ...cella, cursor: "pointer", width: 18 }} onClick={onApri}>{aperto ? "▾" : "▸"}</td>
      <td style={{ ...cella, whiteSpace: "nowrap" }}>{dataIt(f.data_scadenza)}</td>
      <td style={cella}>{f.oggetto}<div style={{ fontSize: 11, color: C.muted }}>{f.codice_delega}</div></td>
      <td style={{ ...cella, textAlign: "right", whiteSpace: "nowrap" }}>{euro(f.saldo)}</td>
      <td style={{ ...cella, fontWeight: 700 }}>{f.stato}</td>
      <td style={cella}>{f.come}</td>
      <td style={{ ...cella, whiteSpace: "nowrap" }}>{f.dataPagamento ? dataIt(f.dataPagamento) : "—"}{f.daConfermare ? <div style={{ fontSize: 11, color: C.accent }}>da confermare</div> : null}</td>
      <td style={cella}>
        {haF24 && <button style={piccolo} onClick={() => onDocumento("F24")}>F24</button>}
        {haQuietanza && <button style={piccolo} onClick={() => onDocumento("Quietanza")}>Quietanza</button>}
        {f.estratto && <button style={piccolo} onClick={onEstratto}>Estratto, pagina {f.estratto.pagina}</button>}
        {f.allegati.length > 0 && <button style={piccolo} onClick={() => onDocumento(COSA_ESTRATTO)}>Pagina allegata</button>}
      </td>
    </tr>
    {aperto && <tr><td colSpan={8} style={{ ...cella, background: "#FCFCFA" }}>
      {f.avvisi.length > 0 && <div style={{ color: C.red, fontSize: 12.5, marginBottom: 6 }}>{f.avvisi.map(a => <div key={a}>⚠️ {a}</div>)}</div>}
      <div style={{ fontSize: 12.5, marginBottom: 6 }}>
        Totale a debito {euro(f.totale_debito)} · a credito {euro(f.totale_credito)} · saldo {euro(f.saldo)}{f.tipo_pagamento ? ` · ${f.tipo_pagamento}` : ""}
        {f.protocollo_telematico ? ` · protocollo telematico ${f.protocollo_telematico}` : ""}{f.banca_addebito ? ` · ${f.banca_addebito}` : ""}
      </div>
      {(f.rigaCollegata || f.rigaProposta) && <div style={{ fontSize: 12.5, marginBottom: 6 }}>Riga della banca{f.rigaCollegata ? " (collegata)" : " (trovata, da confermare nel riquadro «Chiusura» in fondo alla pagina)"}: {dataIt((f.rigaCollegata || f.rigaProposta).data_contabile)} · {euro((f.rigaCollegata || f.rigaProposta).importo)} · «{(f.rigaCollegata || f.rigaProposta).descrizione}»</div>}
      <table style={{ borderCollapse: "collapse", marginBottom: 6 }}>
        <thead><tr>{["Sezione", "Codice", "Descrizione", "Ente o sede", "Mese", "Anno", "A debito", "A credito", "Trattamento"].map(h => <th key={h} style={{ fontSize: 11, textAlign: "left", padding: "3px 6px", color: C.muted }}>{h}</th>)}</tr></thead>
        <tbody>{f.righe.map(r => <tr key={r.id}>{[r.sezione, r.codice_tributo, r.descrizione_codice, r.codice_ente_sede, r.rateazione_mese, r.anno_riferimento].map((v, i) => <td key={i} style={{ fontSize: 12, padding: "3px 6px" }}>{v || ""}</td>)}
          <td style={{ fontSize: 12, padding: "3px 6px", textAlign: "right" }}>{Number(r.importo_debito) ? euro(r.importo_debito) : ""}</td><td style={{ fontSize: 12, padding: "3px 6px", textAlign: "right" }}>{Number(r.importo_credito) ? euro(r.importo_credito) : ""}</td>
          <td style={{ fontSize: 12, padding: "3px 6px" }}>{r.trattamento}</td></tr>)}</tbody>
      </table>
      {(f.fileF24.length > 0 || f.quietanze.length > 0 || f.allegati.length > 0) && <div style={{ fontSize: 11.5, color: C.muted, fontFamily: "monospace" }}>{[...f.fileF24, ...f.quietanze, ...f.allegati].map(x => <div key={x.percorso}>ARCHIVIO\{x.percorso}</div>)}</div>}
      {f.note && <div style={{ fontSize: 12, whiteSpace: "pre-wrap", marginTop: 6 }}>Note: {f.note}</div>}
      <div style={{ marginTop: 8 }}>
        {f.daAllegare.length > 0 && <button style={btn(true)} onClick={onAllega}>Allega la pagina dell'estratto</button>}{" "}
        {f.stato === "Da pagare" && <button style={btn(false, C.red)} onClick={onSostituisci}>Segna «Sostituito»</button>}
      </div>
    </td></tr>}
  </>;
}

// finestra sopra la pagina (come nella versione 361): si chiude con «Chiudi», con il tasto Esc o cliccando fuori
function Finestra({ children, onChiudi, larga }) {
  const io = useRef(null);
  useEffect(() => { const k = e => { if (e.key !== "Escape") return; const tutte = document.querySelectorAll("[role=dialog]"); if (tutte[tutte.length - 1] === io.current) onChiudi(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onChiudi]);
  return <div ref={io} role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) onChiudi(); }}
    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <div style={{ background: "#fff", borderRadius: 10, padding: 14, width: larga ? "min(1200px, 96vw)" : "min(680px, 96vw)", maxHeight: "94vh", overflow: "auto", boxShadow: "0 8px 30px rgba(0,0,0,0.3)" }}>{children}</div>
  </div>;
}
