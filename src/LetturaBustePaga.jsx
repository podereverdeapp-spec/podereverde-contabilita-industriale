// Versione 387 (Tenente, 17/11/2026) — «Leggi le buste paga e i pagamenti»: caricamento veloce di buste paga, riepilogo paghe e
// contributi e bonifici degli stipendi. Prende il posto del «Prompt per carico cedolini» e del carico dall'Excel (decisione A del
// Dott. Bizzarri, 17/11/2026 12:01). Regole L1–L12 del progetto approvato (claude/progetto_387_lavoro_caricamento_veloce.md).
// Passi: «Scegli i file» (nessuna scrittura) → controlli → «Registra» (database e archivio del programma) → «Archivia nel cloud» (facoltativo).
// Solo per chi vede i dati del lavoro: il database rifà i controlli e rifiuta tutti gli altri (ci_lavoro_carica_mese, ci_lavoro_pagamento_carica).
import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { md5 } from "./md5";
import { fetchAllPages } from "./parsingUtils";
import { pagineBuste, tipoDocumento, leggiBuste, leggiRiepilogo } from "./lettoreBustePaga";
import { componiMesi, datiDelMese, nomeMese, percorsoBusta, percorsoRiepilogo, percorsoFileMese, percorsoPagamento } from "./caricoLavoro";
import { abbinaPagamento } from "./abbinaPagamenti";
import { pagineDalPdf } from "./lettoreBanca";
import { pdfSenzaTesto, immaginiDalPdf, immagineDaFile, leggiConOcr } from "./ocrBanca";
import { leggiDistinta } from "./scansioniBanca";
import { cartella, esiste, leggiByte, permesso, scriviVerificato, togliDaSmistare } from "./cartellaBanche";
import { BUSTE_DA_SMISTARE, PAGAMENTI_DA_SMISTARE, VECCHIE, controllaCartellaLavoro, sistemaCartelleDaSmistare, posizioneBuste, posizioneRiepilogo, posizionePagamento } from "./cartellaLavoro";
import RiquadroDoveSonoIFile from "./RiquadroDoveSonoIFile";

const BUCKET = "buste-paga";
const COLORE = { verde: C.green, giallo: C.yellow, rosso: C.red, attesa: "#D9822B", fatto: C.blue };
const ICONA = { verde: "🟢", giallo: "🟡", rosso: "🔴", attesa: "🟠", fatto: "🔵" };
const NOME_STATO = { verde: "Pronto", giallo: "Già nel programma", rosso: "Da sistemare", attesa: "Da guardare", fatto: "Registrato" };
const euro = n => (n == null || isNaN(n) ? "—" : Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dataIt = d => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}` : "");
const estensione = n => (String(n).match(/\.[^.]+$/) || [".pdf"])[0].toLowerCase();
const tipoMime = n => /\.pdf$/i.test(n) ? "application/pdf" : /\.png$/i.test(n) ? "image/png" : /\.jpe?g$/i.test(n) ? "image/jpeg" : "application/octet-stream";
// «1.738» è milleisettecentotrentotto (punto delle migliaia), «1738,00» e «1.738,00» anche; «17.5» resta 17,5
const numero = s => {
  const t = String(s ?? "").trim().replace(/[\s€]/g, ""); if (!t) return null;
  let v;
  if (t.includes(",") && t.includes(".")) v = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");   // 1.738,50 oppure 1,738.50
  else if (t.includes(",")) v = t.replace(",", ".");
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) v = t.replace(/\./g, "");                                                          // 1.738 = milleisettecentotrentotto
  else v = t;
  const n = Number(v); return Number.isFinite(n) ? n : null;
};
const MOTIVI = ["acconto", "più bonifici", "anticipo", "altro"];
const MESI = ["", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const etichettaBusta = b => `${b.cognome_nome} – ${b.tipo === "mensile" ? `stipendio di ${MESI[b.mese]} ${b.anno}` : `${b.tipo} ${b.anno} (con ${MESI[b.mese]})`} – netto ${euro(b.netto_busta)}${b.gia_pagato ? `, già pagati ${euro(b.gia_pagato)}` : ""}`;

async function pdfjs() {
  const p = await import("pdfjs-dist"); const w = await import("pdfjs-dist/build/pdf.worker.min.mjs?url"); p.GlobalWorkerOptions.workerSrc = w.default; return p;
}
// testo di un PDF digitale (distinte di Smart CBI): voci della stessa altezza in una riga, da sinistra a destra (come nella 386)
function testoDalPdf(pagine) {
  return pagine.map(p => {
    const righe = [];
    for (const v of [...p.voci].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const r = righe.find(r => Math.abs(r.y - v.y) <= 2.5);
      if (r) r.voci.push(v); else righe.push({ y: v.y, voci: [v] });
    }
    return righe.map(r => r.voci.sort((a, b) => a.x - b.x).map(v => v.s).join(" ")).join("\n");
  }).join("\n");
}
// la lettura ottica nel browser legge a volte «Smart CB/» o «Smart CB|» al posto di «Smart CBI» (bonifici istantanei di settembre 2026):
// senza questa correzione il documento non è riconosciuto come distinta di Smart CBI
export const normalizzaOcr = s => String(s || "").replace(/Smart\s*CB[\/|lI1!\]]/g, "Smart CBI").replace(/Bon[il1|]sta/g, "Bonista");
// una pagina del PDF del mese come PDF a sé (il PDF di ogni persona, come nella versione 271)
async function paginaComePdf(byte, numeroPagina) {
  const sorgente = await PDFDocument.load(byte);
  const nuovo = await PDFDocument.create();
  const [p] = await nuovo.copyPages(sorgente, [numeroPagina - 1]);
  nuovo.addPage(p);
  return new Uint8Array(await nuovo.save());
}
// archivio del programma: mai sovrascrivere. Stesso percorso già occupato: se è lo stesso file si usa, altrimenti un nome con l'impronta.
async function salvaInArchivio(percorso, byte, tipo = "application/pdf") {
  const impronta = md5(byte);
  for (const p of [percorso, percorso.replace(/(\.[^.]+)$/, `_${impronta.slice(0, 8)}$1`)]) {
    const { error } = await supabase.storage.from(BUCKET).upload(p, new Blob([byte], { type: tipo }), { upsert: false, contentType: tipo });
    if (!error) return p;
    if (!/exist|duplicate|409/i.test(`${error.message} ${error.statusCode || ""}`)) throw new Error(`archivio del programma (${p}): ${error.message}`);
    const { data, error: e2 } = await supabase.storage.from(BUCKET).download(p);
    if (e2) throw new Error(`archivio del programma (${p}): ${e2.message}`);
    if (md5(new Uint8Array(await data.arrayBuffer())) === impronta) return p;
  }
  throw new Error(`archivio del programma: «${percorso}» è occupato da file diversi`);
}

export default function LetturaBustePaga() {
  const [base, setBase] = useState(null);
  const [lettura, setLettura] = useState(null);       // { file, mesi } dalle buste e dai riepiloghi
  const [scelte, setScelte] = useState({});           // per mese: { escludi: {cf: true}, sostituisci, motivo, guardato }
  const [pagamenti, setPagamenti] = useState([]);     // bonifici letti
  const [buste, setBuste] = useState([]);             // buste nel programma, per i pagamenti
  const [lavoro, setLavoro] = useState("");
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState([]);             // righe dell'esito di «Registra»
  const [cloud, setCloud] = useState(null);
  const occupato = useRef(false);

  async function caricaBase() {
    const [v, d, e, f, m, k] = await Promise.all([
      supabase.rpc("ci_puo_vedere_dati_lavoro"),
      fetchAllPages((a, b) => supabase.from("ci_dipendenti").select("id, cognome_nome, codice_fiscale").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_dipendenti_esclusioni").select("dipendente_id, dal, al").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_lavoro_file").select("impronta, tipo, anno, mese, nome_file, pdf_percorso").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_costo_lavoro_mensile").select("anno, mese").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_contributi_da_versare").select("anno, mese").order("id").range(a, b)),
    ]);
    for (const x of [d, e, f, m, k]) if (x.error) throw new Error(x.error.message);
    const b = {
      puo: v.data === true,
      dipendenti: new Map((d.data || []).map(x => [x.codice_fiscale, x])),
      esclusioni: e.data || [],
      file: new Map((f.data || []).map(x => [x.impronta, x])),
      mesi: new Set([...(m.data || []), ...(k.data || [])].map(x => `${x.anno}-${String(x.mese).padStart(2, "0")}`)),
    };
    setBase(b); return b;
  }
  async function caricaBuste() {
    const da = new Date().getFullYear() - 2;
    const [c, p, d] = await Promise.all([
      fetchAllPages((a, b) => supabase.from("ci_costo_lavoro_mensile").select("id, dipendente_id, anno, mese, tipo, netto_busta").gte("anno", da).order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_stipendi_pagamenti").select("id, costo_lavoro_id, importo, impronta").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_dipendenti").select("id, cognome_nome").order("id").range(a, b)),
    ]);
    for (const x of [c, p, d]) if (x.error) throw new Error(x.error.message);
    const nomi = new Map((d.data || []).map(x => [x.id, x.cognome_nome]));
    const pagato = {}; (p.data || []).forEach(x => { if (x.costo_lavoro_id) pagato[x.costo_lavoro_id] = Math.round(((pagato[x.costo_lavoro_id] || 0) + Number(x.importo)) * 100) / 100; });
    const bb = (c.data || []).map(x => ({ ...x, netto_busta: Number(x.netto_busta), cognome_nome: nomi.get(x.dipendente_id) || "?", gia_pagato: pagato[x.id] || 0 }))
      .sort((a, b) => b.anno - a.anno || b.mese - a.mese || a.cognome_nome.localeCompare(b.cognome_nome));
    setBuste(bb); return { buste: bb, pagamenti: p.data || [] };
  }
  useEffect(() => { (async () => { try { await caricaBase(); } catch (x) { setErrore("Lettura non riuscita: " + x.message + ". Questa pagina la usa solo chi vede i dati del lavoro."); } })(); }, []);

  // ── 1. Buste paga e riepiloghi: lettura, nessuna scrittura ────────────────────────────────────────────
  async function sceltiBuste(e) {
    const lista = [...(e.target.files || [])]; e.target.value = "";
    if (!lista.length) return;
    if (occupato.current) { setErrore("C'è già una lettura in corso: attendere che finisca (scritta «⏳» in alto), poi scegliere di nuovo i file. Questa scelta non è stata presa."); return; }
    occupato.current = true; setErrore(""); setEsito([]); setCloud(null);
    try {
      const b = await caricaBase();
      const pj = await pdfjs();
      const letti = [];
      for (let i = 0; i < lista.length; i++) {
        const f = lista[i]; setLavoro(`Lettura ${i + 1} di ${lista.length}: ${f.name}`);
        const byte = new Uint8Array(await f.arrayBuffer()); const impronta = md5(byte);
        const r = { id: `${impronta}-${i}`, nome: f.name, byte, impronta };
        const gemello = letti.find(x => x.impronta === impronta);
        if (gemello) { letti.push({ ...r, tipo: "doppione", gemello: gemello.nome }); continue; }
        if (!/\.pdf$/i.test(f.name)) { letti.push({ ...r, tipo: null }); continue; }
        let pagine;
        try { pagine = await pagineBuste(byte.slice(), pj); } catch (x) { letti.push({ ...r, tipo: null, errore: x.message }); continue; }
        const tipo = tipoDocumento(pagine);
        letti.push({ ...r, tipo, buste: tipo === "busta" ? leggiBuste(pagine) : null, riep: tipo === "riepilogo" ? leggiRiepilogo(pagine) : null });
      }
      // i file già scelti e non ancora registrati si rileggono insieme ai nuovi (un mese può arrivare in due scelte)
      const prima = (lettura?.file || []).filter(x => !x.registrato && !letti.some(y => y.impronta === x.impronta)).map(x => ({ id: x.id, nome: x.nome, byte: x.byte, impronta: x.impronta, tipo: x.tipo, buste: x.buste, riep: x.riep, gemello: x.gemello }));
      const fatti = (lettura?.file || []).filter(x => x.registrato);
      const r = componiMesi([...prima, ...letti], b);
      setLettura({ file: [...fatti, ...r.file], mesi: r.mesi });
      // proposta dell'esclusione dal costo degli animali: come l'anno prima (es. l'amministratore)
      const s = {};
      for (const g of r.mesi) s[g.chiave] = { escludi: Object.fromEntries(g.persone.filter(p => !p.esclusaAnno && p.esclusaAnnoPrima).map(p => [p.cf, true])), sostituisci: false, motivo: "", guardato: false };
      setScelte(s);
    } catch (x) { setErrore("Lettura non riuscita: " + x.message); }
    occupato.current = false; setLavoro("");
  }

  const statoMese = g => {
    if (g.registrato) return "fatto";
    if (g.stato === "giallo") return !(scelte[g.chiave]?.sostituisci && String(scelte[g.chiave]?.motivo || "").trim()) ? "giallo" : g.daGuardare.length && !scelte[g.chiave]?.guardato ? "attesa" : "verde";
    if (g.stato === "attesa") return scelte[g.chiave]?.guardato ? "verde" : "attesa";
    return g.stato;
  };

  async function registraMesi() {
    if (occupato.current || !lettura) return;
    const pronti = lettura.mesi.filter(g => statoMese(g) === "verde");
    if (!pronti.length) return;
    occupato.current = true; setErrore(""); const righe = [];
    try {
      for (const g of pronti) {
        const nome = nomeMese(g.mese, g.anno); const sc = scelte[g.chiave] || {};
        setLavoro(`${nome}: archivio dei PDF…`);
        const busta = new Map(), mese = new Map();
        for (const f of g.fileBuste) mese.set(f.impronta, await salvaInArchivio(percorsoFileMese(g, f), f.byte));
        for (const b of g.buste) busta.set(b, await salvaInArchivio(percorsoBusta(b), await paginaComePdf(b.file.byte, b.pagina)));
        const riepilogo = await salvaInArchivio(percorsoRiepilogo(g), g.fileRiep.byte);
        setLavoro(`${nome}: registrazione…`);
        const escludi = g.persone.filter(p => !p.esclusaAnno && sc.escludi?.[p.cf]).map(p => p.cf);
        const dati = datiDelMese(g, { escludi, sostituisci: g.stato === "giallo" && !!sc.sostituisci, motivo: sc.motivo, percorsi: { busta, mese, riepilogo } });
        const { data, error } = await supabase.rpc("ci_lavoro_carica_mese", { p: dati });
        if (error) throw new Error(`${nome}: ${error.message}`);
        righe.push(`${nome}: ${data.buste} buste registrate; costi diretti del mese ${euro(data.costi_diretti)} (solo le persone nel costo degli animali)${data.altri_mesi_riscritti?.length ? `; per l'esclusione nuova riscritti anche i costi diretti di ${data.altri_mesi_riscritti.map(m => MESI[m]).join(", ")} ${g.anno}` : ""}`);
        g.registrato = true;
        for (const f of [...g.fileBuste, g.fileRiep]) { f.registrato = true; f.stato = "fatto"; }
        setLettura(l => ({ ...l }));
      }
    } catch (x) { setErrore(x.message + ". I mesi sopra sono registrati; quello fermato e i seguenti no."); }
    setEsito(righe); await caricaBase().catch(() => {}); occupato.current = false; setLavoro("");
  }

  // ── 2. Pagamenti degli stipendi ────────────────────────────────────────────────────────────────────
  async function sceltiPagamenti(e) {
    const lista = [...(e.target.files || [])]; e.target.value = "";
    if (!lista.length) return;
    if (occupato.current) { setErrore("C'è già una lettura in corso: attendere che finisca (scritta «⏳» in alto), poi scegliere di nuovo i file. Questa scelta non è stata presa."); return; }
    occupato.current = true; setErrore(""); setCloud(null);
    try {
      const b = await caricaBase();
      const { buste: bb } = await caricaBuste();
      const { data: giaPag, error: eg } = await fetchAllPages((a, z) => supabase.from("ci_stipendi_pagamenti").select("impronta, costo_lavoro_id, importo, data_esecuzione, motivo_importo").order("id").range(a, z));
      if (eg) throw new Error(eg.message);
      const letti = [];
      const pj = await pdfjs();
      for (let i = 0; i < lista.length; i++) {
        const f = lista[i]; setLavoro(`Lettura ${i + 1} di ${lista.length}: ${f.name}`);
        const byte = new Uint8Array(await f.arrayBuffer()); const impronta = md5(byte);
        const r = { id: `${impronta}-${i}`, nome: f.name, byte, impronta, estensione: estensione(f.name), conferme: {} };
        if (letti.some(x => x.impronta === impronta) || pagamenti.some(x => x.impronta === impronta && x.stato !== "rosso")) { if (!letti.some(x => x.impronta === impronta)) continue; letti.push({ ...r, stato: "rosso", motivo: "copia identica di un file già scelto: si legge una volta sola" }); continue; }
        const gia = (giaPag || []).find(x => x.impronta === impronta);
        if (gia) { letti.push({ ...r, stato: "giallo", motivo: `già nel programma: bonifico di ${euro(gia.importo)} del ${dataIt(gia.data_esecuzione)}`, giaCaricato: gia, busta: gia.costo_lavoro_id }); continue; }
        if (b.file.get(impronta)) { letti.push({ ...r, stato: "rosso", motivo: `è un file di buste o di riepilogo già caricato (${b.file.get(impronta).nome_file})` }); continue; }
        if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) { letti.push({ ...r, stato: "rosso", motivo: "il file deve essere un PDF o una foto (.jpg, .png)" }); continue; }
        let testo, daScansione = true;
        try {
          if (/\.pdf$/i.test(f.name) && !(await pdfSenzaTesto(byte))) { testo = testoDalPdf(await pagineDalPdf(byte.slice(), pj)); daScansione = false; }
          else {
            const img = /\.pdf$/i.test(f.name) ? await immaginiDalPdf(byte) : await immagineDaFile(byte, tipoMime(f.name));
            testo = (await leggiConOcr(img.pagine, t => setLavoro(`Bonifico ${i + 1} di ${lista.length} (${f.name}): ${t} La lettura ottica richiede qualche secondo per bonifico: attendere la fine.`))).map(p => p.testo).join("\n");
          }
        } catch (x) { letti.push({ ...r, stato: "rosso", motivo: `lettura non riuscita: ${x.message}` }); continue; }
        const d = leggiDistinta(normalizzaOcr(testo));
        const righe = d?.righe || [];
        if (righe.length > 1) { letti.push({ ...r, stato: "rosso", motivo: `nel documento ci sono ${righe.length} bonifici: qui si carica un bonifico per file (lo stipendio di una persona)` }); continue; }
        const x = righe[0] || {};
        const proposta = righe.length ? abbinaPagamento({ beneficiario: x.beneficiario, causale: x.causale, importo: x.importo, data_esecuzione: x.data_esecuzione || d?.data }, bb) : { busta: null, spiegazione: "La lettura non ha trovato il bonifico: scrivere i dati guardando il documento." };
        letti.push({ ...r, stato: "attesa", daScansione, modello: d?.modello || "", lettoBene: !!righe.length, testoLetto: testo,
          form: { beneficiario: x.beneficiario || "", importo: x.importo != null ? String(x.importo).replace(".", ",") : "", data_esecuzione: x.data_esecuzione || d?.data || "",
            cro: x.cro || "", esito: x.esito || "", iban: x.sicuri?.iban ? (x.iban || "") : "", busta: proposta.busta || "", motivo: proposta.motivo_proposto || "", motivoTesto: "" },
          proposta });
      }
      setPagamenti(p => [...p.filter(x => x.stato !== "rosso"), ...letti]);   // i bonifici già scelti restano, con le loro conferme
    } catch (x) { setErrore("Lettura non riuscita: " + x.message); }
    occupato.current = false; setLavoro("");
  }
  const cambia = (id, campo, valore) => setPagamenti(ps => ps.map(p => p.id !== id ? p : { ...p, form: { ...p.form, [campo]: valore }, conferme: ["beneficiario", "importo", "data_esecuzione", "busta"].includes(campo) ? { ...p.conferme, [campo]: false } : p.conferme }));
  const conferma = (id, campo, v) => setPagamenti(ps => ps.map(p => p.id !== id ? p : { ...p, conferme: { ...p.conferme, [campo]: v } }));
  function controllaPagamento(p, bb = buste) {
    if (p.stato !== "attesa") return { pronto: false };
    const f = p.form, imp = numero(f.importo), b = bb.find(x => String(x.id) === String(f.busta));
    const problemi = [];
    if (!String(f.beneficiario).trim()) problemi.push("manca il beneficiario");
    if (!(imp > 0)) problemi.push("importo non valido");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data_esecuzione)) problemi.push("data non valida");
    if (f.esito === "rifiutato") problemi.push("il bonifico è stato rifiutato dalla banca: non paga la busta");
    if (!b) problemi.push("scegliere la busta che il bonifico paga");
    const resta = b ? Math.round((b.netto_busta - b.gia_pagato) * 100) / 100 : null;
    const diverso = b && imp > 0 && Math.abs(imp - resta) > 0.005;
    let motivo = null;
    if (diverso) {
      if (!f.motivo) problemi.push(`importo diverso dal netto ancora da pagare (${euro(resta)}): scegliere il motivo`);
      else if (f.motivo === "altro" && String(f.motivoTesto).trim().length < 3) problemi.push("scrivere la spiegazione del motivo «altro»");
      else if (imp > resta && !["anticipo", "altro"].includes(f.motivo)) problemi.push(`il bonifico supera il netto ancora da pagare (${euro(resta)}): motivo «anticipo» o «altro»`);
      motivo = f.motivo === "altro" ? `altro: ${String(f.motivoTesto).trim()}` : f.motivo;
    }
    const mancanoConferme = ["beneficiario", "importo", "data_esecuzione", "busta"].filter(k => !p.conferme[k]);
    return { pronto: !problemi.length && !mancanoConferme.length, problemi, mancanoConferme, busta: b, resta, diverso, motivo, importo: imp };
  }
  async function registraPagamenti() {
    if (occupato.current) return;
    const pronti = pagamenti.filter(p => controllaPagamento(p).pronto);
    if (!pronti.length) return;
    occupato.current = true; setErrore(""); const righe = [];
    try {
      let bb = (await caricaBuste()).buste;   // netti ancora da pagare letti adesso dal database, e riletti dopo ogni bonifico
      for (const p of pronti) {
        const c = controllaPagamento(p, bb); const b = c.busta;
        if (!c.pronto) throw new Error(`${p.nome}: ${[...(c.problemi || []), ...(c.mancanoConferme?.length ? ["da confermare di nuovo dopo il bonifico precedente"] : [])].join("; ")}`);
        setLavoro(`Pagamento ${b.cognome_nome}…`);
        const percorso = await salvaInArchivio(percorsoPagamento(b, p.estensione), p.byte, tipoMime(p.nome));
        const f = p.form;
        const { error } = await supabase.rpc("ci_lavoro_pagamento_carica", { p: {
          impronta: p.impronta, costo_lavoro_id: b.id, beneficiario: f.beneficiario.trim(), iban: f.iban.trim() || null, importo: c.importo, data_esecuzione: f.data_esecuzione,
          cro: f.cro.trim() || null, esito: f.esito || null, modello: p.modello || null, motivo_importo: c.motivo, da_scansione: p.daScansione, nome_file: p.nome, pdf_percorso: percorso } });
        if (error) throw new Error(`${p.nome}: ${error.message}`);
        righe.push(`${b.cognome_nome}: bonifico di ${euro(c.importo)} del ${dataIt(f.data_esecuzione)} unito a «${etichettaBusta(b)}»${c.motivo ? ` (motivo: ${c.motivo})` : ""}`);
        setPagamenti(ps => ps.map(x => x.id === p.id ? { ...x, stato: "fatto", registrato: true, bustaPagata: b, motivoFinale: c.motivo, motivo: "registrato" } : x));
        bb = (await caricaBuste()).buste;
      }
    } catch (x) { setErrore(x.message + ". I bonifici sopra sono registrati; quello fermato e i seguenti no."); }
    setEsito(righe); occupato.current = false; setLavoro("");
  }
  function apriDocumento(p) { const u = URL.createObjectURL(new Blob([p.byte], { type: tipoMime(p.nome) })); window.open(u, "_blank"); setTimeout(() => URL.revokeObjectURL(u), 60000); }

  // ── 3. Archivia nel cloud (facoltativo) ────────────────────────────────────────────────────────────
  async function daArchiviare() {
    const out = [];
    for (const f of lettura?.file || []) {
      if (!(f.stato === "fatto" || f.stato === "giallo" || f.giaCaricato)) continue;
      if (f.tipo === "riepilogo") out.push({ f, dove: BUSTE_DA_SMISTARE, dest: posizioneRiepilogo(f.riep) });
      else if (f.tipo === "busta") { const b0 = f.buste[0]; out.push({ f, dove: BUSTE_DA_SMISTARE, dest: posizioneBuste({ anno: b0.anno, mese: b0.mese, aggiuntiva: b0.tipo === "mensile" ? null : b0.tipo }) }); }
    }
    const pag = pagamenti.filter(p => p.stato === "fatto" || p.stato === "giallo");
    if (pag.length) {
      const ids = [...new Set(pag.map(p => p.stato === "fatto" ? p.bustaPagata.id : p.giaCaricato.costo_lavoro_id).filter(Boolean))];
      const { data, error } = ids.length ? await supabase.from("ci_costo_lavoro_mensile").select("id, dipendente_id, anno, mese, tipo").in("id", ids) : { data: [] };
      if (error) throw new Error(error.message);
      const { data: dd } = await fetchAllPages((a, z) => supabase.from("ci_dipendenti").select("id, cognome_nome").order("id").range(a, z));
      const nomi = new Map((dd || []).map(x => [x.id, x.cognome_nome]));
      for (const p of pag) {
        const b = (data || []).find(x => x.id === (p.stato === "fatto" ? p.bustaPagata.id : p.giaCaricato.costo_lavoro_id));
        if (!b) continue;
        const motivo = p.stato === "fatto" ? p.motivoFinale : p.giaCaricato.motivo_importo;
        out.push({ f: p, dove: PAGAMENTI_DA_SMISTARE, dest: posizionePagamento({ ...b, cognome_nome: nomi.get(b.dipendente_id) || "?", motivo, estensione: p.estensione }) });
      }
    }
    return out;
  }
  async function archivia() {
    if (occupato.current) return;
    let radice;
    try { radice = await window.showDirectoryPicker({ id: "lavoro-podere-verde", mode: "readwrite" }); }
    catch (x) { if (x?.name !== "AbortError") setErrore("Scelta della cartella non riuscita: " + x.message); return; }
    occupato.current = true; setErrore(""); setCloud(null);
    const ea = { scritti: [], tolti: [], errori: [], avvisi: [], cartelle: [] };
    try {
      if (!(await permesso(radice, true))) throw new Error("senza il permesso di modificare i file il programma non può archiviare: rifare e premere «Modifica file»");
      const c = await controllaCartellaLavoro(radice); if (!c.ok) throw new Error(c.problema);
      setLavoro("Sistemo le cartelle «da smistare»…");
      ea.cartelle = await sistemaCartelleDaSmistare(radice);
      for (const { f, dove, dest } of await daArchiviare()) {
        setLavoro(`Archivio «${f.nome}»…`);
        try {
          const w = await scriviVerificato(radice, dest, f.byte);
          ea.scritti.push(`${w.percorso}${w.esito === "Già presente uguale" ? " (c'era già, uguale)" : ""}`);
          // si toglie da «da smistare» solo un file con lo stesso nome e la stessa impronta
          for (const d of [dove, VECCHIE[dove]]) {
            let dir = null; try { dir = await cartella(radice, d); } catch { dir = null; }
            if (dir && await esiste(dir, f.nome)) {
              const qui = md5(await leggiByte(radice, `${d}\\${f.nome}`));
              if (qui !== f.impronta) { ea.avvisi.push(`in «${d}» c'è un altro file con il nome «${f.nome}» ma diverso: resta lì, da guardare`); continue; }
              if (await togliDaSmistare(radice, f.nome, f.impronta, d) === "Tolto") ea.tolti.push(`${d}\\${f.nome}`);
            }
          }
        } catch (x) { ea.errori.push(`${f.nome}: ${x.message}`); break; }
      }
    } catch (x) { ea.errori.push(x.message); }
    setCloud(ea); occupato.current = false; setLavoro("");
  }

  // ── Disegno ───────────────────────────────────────────────────────────────────────────────────────
  const piccolo = { ...input, height: 28, fontSize: 12 };
  const spunta = (ok, onChange, testo = "confermato") => <label style={{ fontSize: 11.5, color: ok ? C.green : C.red, whiteSpace: "nowrap" }}><input type="checkbox" checked={!!ok} onChange={e => onChange(e.target.checked)} /> {testo}</label>;
  const pronti = lettura ? lettura.mesi.filter(g => statoMese(g) === "verde").length : 0;
  const pagPronti = pagamenti.filter(p => controllaPagamento(p).pronto).length;
  const archiviabili = (lettura?.file || []).some(f => f.stato === "fatto" || f.stato === "giallo" || f.giaCaricato) || pagamenti.some(p => p.stato === "fatto" || p.stato === "giallo");
  const scegli = (k, campo, v) => setScelte(s => ({ ...s, [k]: { ...s[k], [campo]: v } }));

  if (base && !base.puo) return <div style={{ ...scheda, maxWidth: 800 }}>Questa pagina la usa solo chi vede i dati del lavoro (amministratore e persone autorizzate).</div>;

  return (
    <div style={{ maxWidth: 1250 }}>
      <h2 style={{ color: C.primary, margin: "0 0 4px" }}>Leggi le buste paga e i pagamenti</h2>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 10 }}>Buste paga e riepilogo paghe e contributi del consulente del lavoro (PDF TeamSystem) e bonifici degli stipendi. Si scelgono i file, il programma li legge e li controlla <b>senza scrivere niente</b>; poi «Registra» e, se il computer raggiunge il cloud, «Archivia nel cloud». I dati delle persone li vede solo chi vede i dati del lavoro; nei Costi Diretti entra solo il totale del mese, senza nomi.</div>

      <RiquadroDoveSonoIFile cartellaFinale={["LAVORO", BUSTE_DA_SMISTARE]} cosaMetterci="i PDF delle buste paga del mese (anche tredicesima e quattordicesima) e del riepilogo paghe e contributi, così come li manda il consulente; i bonifici degli stipendi vanno in «2. PAGAMENTI STIPENDI DA SMISTARE»" />

      <details style={{ ...scheda, fontSize: 13, lineHeight: 1.55 }}>
        <summary style={{ fontWeight: 800, color: C.primary, cursor: "pointer", fontSize: 14.5 }}>Come si fa, passo per passo</summary>
        <div style={{ fontWeight: 700, marginTop: 8 }}>Passo 1 – Buste paga e riepilogo</div>
        <div>«Scegli le buste e i riepiloghi»: il PDF delle buste del mese, il riepilogo paghe e contributi dello stesso mese e, nel mese in cui sono pagate, la tredicesima o la quattordicesima. Il programma mette insieme ogni mese e fa i 5 controlli al centesimo: lordi, netti, contributi, voci di ogni busta, costo. Un mese entra tutto o niente.</div>
        <div>🟢 <b>Pronto</b>. 🟠 <b>Da guardare</b>: una voce con ore o giorni che il programma non conta; guardarla nella busta e spuntare «guardato». 🟡 <b>Già nel programma</b>: si ricarica solo con «Sostituisci il mese» e il motivo (il mese vecchio resta nello storico). 🔴 <b>Da sistemare</b>: il motivo è scritto accanto; non entra niente.</div>
        <div>Persone: chi non lavora per gli animali si toglie dal costo degli animali (per tutto l'anno). Il programma propone la scelta dell'anno prima.</div>
        <div style={{ fontWeight: 700, marginTop: 8 }}>Passo 2 – Pagamenti degli stipendi</div>
        <div>«Scegli i bonifici»: i bonifici scaricati da Smart CBI. Le scansioni si leggono con la lettura ottica (qualche minuto). Il programma propone la persona e la busta pagata; ogni dato si confronta con il documento («📄 Apri») e si spunta «confermato». Se l'importo è diverso dal netto ancora da pagare serve il motivo (acconto, più bonifici, anticipo, altro). Un bonifico rifiutato non paga la busta.</div>
        <div style={{ fontWeight: 700, marginTop: 8 }}>Passo 3 – Archivia nel cloud (facoltativo)</div>
        <div>Da un computer che raggiunge il cloud: «Archivia nel cloud» e scegliere la cartella <b>LAVORO</b> (un clic, senza entrarci). Il programma mette le buste in «3.BUSTE PAGA CARICATE», i riepiloghi in «11. RIEPILOGO PAGHE E CONTRIBUTI» e i bonifici in «4 PAGAMENTI STIPENDI CARICATI» con il nome della persona, rilegge ogni copia e solo allora toglie il file da «da smistare». Non sovrascrive mai.</div>
      </details>

      {errore && <div style={{ ...scheda, border: `2px solid ${C.red}`, color: C.red, fontSize: 13 }}>{errore}</div>}
      {lavoro && <div style={{ ...scheda, fontSize: 13 }}>⏳ {lavoro}</div>}

      {/* ── Passo 1 ── */}
      <div style={scheda}>
        <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>1. Buste paga e riepilogo paghe e contributi</div>
        <label style={btn(true)}>
          <span style={{ lineHeight: "34px" }}>📂 Scegli le buste e i riepiloghi</span>
          <input type="file" accept=".pdf" multiple style={{ display: "none" }} disabled={!!lavoro} onChange={sceltiBuste} />
        </label>
        {lettura && lettura.file.filter(f => !f.mese || f.stato === "giallo" || f.stato === "rosso").filter(f => f.stato !== "nelMese" && f.stato !== "fatto").map(f => (
          <div key={f.id} style={{ fontSize: 12.5, marginTop: 6, color: COLORE[f.stato] }}>{ICONA[f.stato]} {f.nome}: {f.motivo}</div>
        ))}
        {lettura && lettura.mesi.map(g => {
          const st = statoMese(g); const sc = scelte[g.chiave] || {};
          return (
            <div key={g.chiave} style={{ border: `1.5px solid ${COLORE[st]}`, borderRadius: 10, padding: "8px 12px", marginTop: 10 }}>
              <div style={{ fontWeight: 800 }}>{ICONA[st]} {nomeMese(g.mese, g.anno)} — {NOME_STATO[st]}{g.registrato ? "" : g.giaNelProgramma ? " (mese già nel programma)" : ""}</div>
              <div style={{ fontSize: 12, color: C.muted }}>File: {[...g.fileBuste.map(f => f.nome), ...g.riepiloghi.map(f => f.nome)].join(", ")}</div>
              {g.motivi.map((m, i) => <div key={i} style={{ fontSize: 12.5, color: C.red }}>• {m}</div>)}
              {g.daGuardare.map((m, i) => <div key={i} style={{ fontSize: 12.5, color: COLORE.attesa }}>• {m}</div>)}
              {g.daGuardare.length > 0 && !g.registrato && spunta(sc.guardato, v => scegli(g.chiave, "guardato", v), "guardato nella busta")}
              {g.controlli.length > 0 && <div style={{ fontSize: 12, marginTop: 4 }}>Controlli: {g.controlli.filter(c => c.n !== 4).map(c => <span key={c.n} style={{ color: c.ok ? C.green : C.red, marginRight: 10 }}>{c.ok ? "✓" : "✗"} {c.n}</span>)}<span style={{ color: g.controlli.filter(c => c.n === 4).every(c => c.ok) ? C.green : C.red }}>{g.controlli.filter(c => c.n === 4).every(c => c.ok) ? "✓" : "✗"} 4 (voci di ogni busta)</span></div>}
              {g.buste.length > 0 && g.riep && !g.motivi.length && (
                <table style={{ marginTop: 6, borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr>{["Persona", "Busta", "Lordo", "Netto", "Costo", "Nel costo degli animali"].map(t => <th key={t} style={{ textAlign: "left", padding: "3px 8px", background: "#E3EDE0" }}>{t}</th>)}</tr></thead>
                  <tbody>{g.buste.map((b, i) => {
                    const p = g.persone.find(x => x.cf === b.codice_fiscale);
                    return (
                      <tr key={i}>
                        <td style={{ padding: "3px 8px" }}>{b.cognome_nome}{p?.nuova ? <span style={{ color: C.accent }}> (nuova)</span> : ""}</td><td style={{ padding: "3px 8px" }}>{b.tipo}</td>
                        <td style={{ padding: "3px 8px", textAlign: "right" }}>{euro(b.totale_lordo)}</td><td style={{ padding: "3px 8px", textAlign: "right" }}>{euro(b.netto_busta)}</td><td style={{ padding: "3px 8px", textAlign: "right", fontWeight: 700 }}>{euro(b.costo_totale)}</td>
                        <td style={{ padding: "3px 8px" }}>{g.buste.findIndex(x => x.codice_fiscale === b.codice_fiscale) !== i ? "" : p?.esclusaAnno ? `escluso per il ${g.anno}` : g.registrato ? (sc.escludi?.[b.codice_fiscale] ? "escluso" : "sì") :
                          <label><input type="checkbox" checked={!sc.escludi?.[b.codice_fiscale]} onChange={e => scegli(g.chiave, "escludi", { ...sc.escludi, [b.codice_fiscale]: !e.target.checked })} /> {sc.escludi?.[b.codice_fiscale] ? `escluso per il ${g.anno}` : "sì"}</label>}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
              {!g.registrato && g.persone.some(p => !p.esclusaAnno && sc.escludi?.[p.cf]) && <div style={{ fontSize: 12, color: C.accent, marginTop: 4 }}>L'esclusione vale per tutto il {g.anno}: registrando, si riscrivono anche i costi diretti dei mesi del {g.anno} già nel programma. Per cambiarla dopo: «Consulta Costi del Lavoro» → «Riepilogo per persona».</div>}
              {g.stato === "giallo" && !g.registrato && (
                <div style={{ marginTop: 6, fontSize: 12.5 }}>
                  <label><input type="checkbox" checked={!!sc.sostituisci} onChange={e => scegli(g.chiave, "sostituisci", e.target.checked)} /> Sostituisci il mese</label>
                  {sc.sostituisci && <input style={{ ...piccolo, width: 420, marginLeft: 8 }} placeholder="motivo (obbligatorio): es. buste corrette dal consulente" value={sc.motivo} onChange={e => scegli(g.chiave, "motivo", e.target.value)} />}
                </div>
              )}
            </div>
          );
        })}
        {lettura && lettura.mesi.length > 0 && (
          <button style={{ ...btn(true), marginTop: 12 }} disabled={!pronti || !!lavoro} onClick={registraMesi}>✅ Registra {pronti} {pronti === 1 ? "mese" : "mesi"} pronti</button>
        )}
      </div>

      {/* ── Passo 2 ── */}
      <div style={scheda}>
        <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>2. Pagamenti degli stipendi</div>
        <label style={btn(true)}>
          <span style={{ lineHeight: "34px" }}>📂 Scegli i bonifici</span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple style={{ display: "none" }} disabled={!!lavoro} onChange={sceltiPagamenti} />
        </label>
        {pagamenti.map(p => {
          const c = controllaPagamento(p); const st = p.stato === "attesa" && c.pronto ? "verde" : p.stato;
          return (
            <div key={p.id} style={{ border: `1.5px solid ${COLORE[st]}`, borderRadius: 10, padding: "8px 12px", marginTop: 10, fontSize: 12.5 }}>
              <div style={{ fontWeight: 800 }}>{ICONA[st]} {p.nome} — {NOME_STATO[st]} <button style={{ ...btn(false), height: 24, marginLeft: 8 }} onClick={() => apriDocumento(p)}>📄 Apri</button></div>
              {p.stato !== "attesa" && <div style={{ color: COLORE[st] }}>{p.motivo}</div>}
              {p.stato === "attesa" && (
                <>
                  <div style={{ color: C.muted }}>{p.daScansione ? "Letto con la lettura ottica: confrontare ogni dato con il documento." : "PDF digitale: confrontare i dati con il documento."} {p.proposta?.spiegazione}</div>
                  <details style={{ marginTop: 2 }}><summary style={{ cursor: "pointer", color: C.muted, fontSize: 11.5 }}>testo letto dal documento</summary><pre className="testo-letto" style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "#FAFAF7", padding: 6, maxHeight: 220, overflow: "auto" }}>{p.testoLetto}</pre></details>
                  <div style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", gap: "4px 10px", alignItems: "center", marginTop: 6, maxWidth: 900 }}>
                    <span>Beneficiario</span><input style={piccolo} value={p.form.beneficiario} onChange={e => cambia(p.id, "beneficiario", e.target.value)} />{spunta(p.conferme.beneficiario, v => conferma(p.id, "beneficiario", v))}
                    <span>Importo (€)</span><input style={{ ...piccolo, width: 140 }} value={p.form.importo} onChange={e => cambia(p.id, "importo", e.target.value)} />{spunta(p.conferme.importo, v => conferma(p.id, "importo", v))}
                    <span>Data del bonifico</span><input type="date" style={{ ...piccolo, width: 160 }} value={p.form.data_esecuzione} onChange={e => cambia(p.id, "data_esecuzione", e.target.value)} />{spunta(p.conferme.data_esecuzione, v => conferma(p.id, "data_esecuzione", v))}
                    <span>Busta pagata</span>
                    <select style={piccolo} value={p.form.busta} onChange={e => cambia(p.id, "busta", e.target.value)}>
                      <option value="">— scegliere —</option>
                      {buste.map(b => <option key={b.id} value={b.id}>{etichettaBusta(b)}</option>)}
                    </select>{spunta(p.conferme.busta, v => conferma(p.id, "busta", v))}
                    <span>Esito</span>
                    <select style={{ ...piccolo, width: 160 }} value={p.form.esito} onChange={e => cambia(p.id, "esito", e.target.value)}><option value="">non scritto</option><option value="accettato">accettato</option><option value="eseguito">eseguito</option><option value="rifiutato">rifiutato</option></select><span />
                    <span>CRO</span><input style={{ ...piccolo, width: 220 }} value={p.form.cro} onChange={e => cambia(p.id, "cro", e.target.value)} /><span />
                    <span>IBAN</span><input style={{ ...piccolo, width: 300 }} value={p.form.iban} onChange={e => cambia(p.id, "iban", e.target.value)} placeholder="se si legge" /><span />
                    {c.diverso && <>
                      <span style={{ color: C.red }}>Motivo</span>
                      <span><select style={{ ...piccolo, width: 160 }} value={p.form.motivo} onChange={e => cambia(p.id, "motivo", e.target.value)}><option value="">— scegliere —</option>{MOTIVI.map(m => <option key={m} value={m}>{m}</option>)}</select>
                        {p.form.motivo === "altro" && <input style={{ ...piccolo, width: 360, marginLeft: 6 }} placeholder="spiegazione" value={p.form.motivoTesto} onChange={e => cambia(p.id, "motivoTesto", e.target.value)} />}</span><span />
                    </>}
                  </div>
                  {c.busta && <div style={{ marginTop: 4 }}>Netto della busta {euro(c.busta.netto_busta)}, già pagati {euro(c.busta.gia_pagato)}, ancora da pagare <b>{euro(c.resta)}</b>.</div>}
                  {c.problemi?.map((m, i) => <div key={i} style={{ color: C.red }}>• {m}</div>)}
                  {c.mancanoConferme?.length > 0 && !c.problemi?.length && <div style={{ color: COLORE.attesa }}>• da confermare: {c.mancanoConferme.map(k => ({ beneficiario: "beneficiario", importo: "importo", data_esecuzione: "data", busta: "busta" })[k]).join(", ")}
                    {" "}<button style={{ ...btn(true), height: 26, marginLeft: 6 }} onClick={() => ["beneficiario", "importo", "data_esecuzione", "busta"].forEach(k => conferma(p.id, k, true))}>✓ Ho confrontato con il documento: confermo i 4 dati</button></div>}
                </>
              )}
            </div>
          );
        })}
        {pagamenti.length > 0 && <button style={{ ...btn(true), marginTop: 12 }} disabled={!pagPronti || !!lavoro} onClick={registraPagamenti}>✅ Registra {pagPronti} {pagPronti === 1 ? "bonifico pronto" : "bonifici pronti"}</button>}
        {(() => { const att = pagamenti.filter(p => p.stato === "attesa" && !controllaPagamento(p).pronto); return att.length > 0 && !lavoro ? <div style={{ fontSize: 12.5, color: COLORE.attesa, marginTop: 6 }}>{att.length} {att.length === 1 ? "bonifico non è ancora pronto" : "bonifici non sono ancora pronti"}: in ciascun riquadro arancione è scritto che cosa manca (di solito la conferma dei dati con il pulsante «✓ Ho confrontato…»).</div> : null; })()}
      </div>

      {esito.length > 0 && <div style={{ ...scheda, border: `2px solid ${C.green}`, fontSize: 13 }}><b>Registrato</b>{esito.map((r, i) => <div key={i}>• {r}</div>)}</div>}

      {/* ── Passo 3 ── */}
      <div style={scheda}>
        <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>3. Archivia nel cloud (facoltativo)</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>Solo i file registrati o già nel programma. Si sceglie la cartella LAVORO. Serve Chrome o Edge.</div>
        <button style={btn(true)} disabled={!archiviabili || !!lavoro || typeof window === "undefined" || typeof window.showDirectoryPicker !== "function"} onClick={archivia}>☁️ Archivia nel cloud</button>
        {cloud && (
          <div style={{ fontSize: 12.5, marginTop: 8 }}>
            {cloud.cartelle.map((c, i) => <div key={"c" + i}>📁 {c.cartella}: {c.esito}{c.rimasti?.length ? ` — restano: ${c.rimasti.join("; ")}` : ""}</div>)}
            {cloud.scritti.map((s, i) => <div key={"s" + i} style={{ color: C.green }}>✓ {s}</div>)}
            {cloud.tolti.map((s, i) => <div key={"t" + i}>↪ tolto da {s}</div>)}
            {cloud.avvisi.map((s, i) => <div key={"a" + i} style={{ color: COLORE.attesa }}>⚠ {s}</div>)}
            {cloud.errori.map((s, i) => <div key={"e" + i} style={{ color: C.red }}>✗ {s} — l'archivio si è fermato qui: i file seguenti restano dove sono.</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
