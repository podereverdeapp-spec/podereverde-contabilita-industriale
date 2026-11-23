// Versione 393 (Tenente, 23/11/2026): nome «Carica dal cloud estratti conto e distinte» e brevi istruzioni in cima (decisioni del Dott. Bizzarri delle 13:43–13:44).
// Versione 386 (Tenente, 16/11/2026) — «Leggi i documenti della banca»: caricamento veloce di estratti conto, liste della carta e
// distinte, come «Leggi le fatture passive di Aruba» (384). Prende il posto di «Carica documenti della banca» nel menu (decisione
// del Dott. Bizzarri delle 15:04); la pagina vecchia resta nel codice.
// Regole R1–R10 approvate dal Dott. Bizzarri il 16/11/2026 alle 15:26 (claude/progetto_386_banche_caricamento_veloce.md, sezione 13):
//  R1 una cartella sola: BANCHE\ESTRATTI CONTO E DISTINTE DA SMISTARE (la vecchia la rinomina il programma);
//  R2 solo documenti digitali scaricati dalla banca; R3 la scansione solo se il digitale non si trova: arancione, «da scansione»,
//     ogni dato confermato da una persona, sostituita dal digitale quando arriva; R4 la distinta non conferma niente;
//  R5 colori; R6 doppioni; R7 intoppi delle distinte; R8 unione bonifico–pagamento proposta solo se unica, confermata solo da chi
//     gestisce i conti; R9 archivio nel cloud con copia riletta; R10 tutti caricano.
// Passi: «Scegli i file» (nessuna scrittura) → controlli → «Registra» (programma) → «Archivia nel cloud» (facoltativo).
import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { md5 } from "./md5";
import { fetchAllPages } from "./parsingUtils";
import { leggiDocumento, contoDelDocumento, analizza, dataIt, euro, TIPO_DOCUMENTO_PER_CONTO, piuGiorni } from "./analisiDocumentoBanca";
import { pagineDalPdf } from "./lettoreBanca";
import { cartella, controllaCartella, permesso, scriviVerificato, togliDaSmistare, leggiByte, esiste, posizioneInArchivio,
  DA_SMISTARE, VECCHIA_DA_SMISTARE, sistemaDaSmistare, browserAdatto } from "./cartellaBanche";
import { salvaNelProgramma } from "./estrattiProgramma";
import { ARCHIVIO_DISTINTE } from "./distintePagamento";
import { pdfSenzaTesto, immaginiDalPdf, immagineDaFile, leggiConOcr } from "./ocrBanca";
import { leggiDistinta, sembraDistinta, leggiRigheScansione, tipoProposto, cartaNelTesto, ibanNelTesto, ibanValido, posizioneDistinta, proponiPagamento, chiaveBonifici } from "./scansioniBanca";
import RiquadroDoveSonoIFile from "./RiquadroDoveSonoIFile";

const COLORE = { verde: C.green, giallo: C.yellow, rosso: C.red, arancione: "#D9822B", fatto: C.blue, attesa: C.muted };
const NOME_STATO = { verde: "Pronto", giallo: "Già caricato", rosso: "Da sistemare", arancione: "Da scansione", fatto: "Registrato", attesa: "Da completare" };
const ICONA = { verde: "🟢", giallo: "🟡", rosso: "🔴", arancione: "🟠", fatto: "🔵", attesa: "⚪" };
const estensione = n => (String(n).match(/\.[^.]+$/) || [".pdf"])[0].toLowerCase();
const tipoMime = n => /\.pdf$/i.test(n) ? "application/pdf" : /\.png$/i.test(n) ? "image/png" : /\.jpe?g$/i.test(n) ? "image/jpeg" : "application/octet-stream";
const centesimi = v => Math.round(Number(v) * 100);
const numero = s => { const t = String(s ?? "").trim().replace(/\s/g, ""); if (!t) return null; const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return Number.isFinite(n) ? n : null; };
const vuoto = s => !String(s ?? "").trim();

const nuovoBonifico = (x = {}) => ({ beneficiario: "", causale: "", iban: "", importo: "", esito: "", cro: "", data_esecuzione: "", sicuri: {}, ...x, conferme: {} });

// Righe del testo di un PDF digitale (per le distinte): voci della stessa altezza in una riga, da sinistra a destra
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

export default function LetturaDocumentiBanca() {
  const [base, setBase] = useState(null);         // { conti, stati, gestore, utente }
  const [files, setFiles] = useState([]);
  const [lavoro, setLavoro] = useState("");
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState(null);       // esito di «Registra»
  const [cloud, setCloud] = useState(null);       // esito di «Archivia nel cloud»
  const [aperto, setAperto] = useState(null);
  const [daFare, setDaFare] = useState(null);     // distinte da unire, scansioni da sostituire
  const occupato = useRef(false);
  const inputFile = useRef(null);

  async function caricaBase() {
    const [c, s, g, u] = await Promise.all([
      supabase.from("ci_conti").select("id, nome, tipo, iban, ultime_quattro_cifre, cartella_su_z, stato, banca_o_emittente, nome_nei_movimenti").order("id"),
      supabase.from("ci_v_stato_conti").select("*"), supabase.rpc("ci_puo_gestire_conti"), supabase.auth.getUser()]);
    const e = c.error || s.error || g.error; if (e) throw new Error(e.message);
    const b = { conti: (c.data || []).filter(x => TIPO_DOCUMENTO_PER_CONTO[x.tipo]), stati: s.data || [], gestore: g.data === true, utente: u?.data?.user?.id || null };
    setBase(b); return b;
  }
  async function caricaDaFare() {
    const conf = await fetchAllPages((a, b) => supabase.from("ci_scansioni_confermate").select("documento_id").order("id").range(a, b));
    if (conf.error) throw new Error(conf.error.message);
    const confermate = new Set((conf.data || []).map(x => x.documento_id));
    const [dis, righe, unioni, scans] = await Promise.all([
      fetchAllPages((a, b) => supabase.from("ci_distinte_pagamento").select("id, data, conto_id, totale, nome_file, percorso, da_scansione, modello, sostituita_da, impronta, documento_id").not("impronta", "is", null).order("data", { ascending: false }).range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_righe_distinta").select("id, distinta_id, progressivo, beneficiario, iban_beneficiario, importo, causale, data_esecuzione, esito, motivo_esito").not("distinta_id", "is", null).order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_distinta_unioni").select("*").is("separata_il", null).order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_documenti_fonte").select("id, conto_id, tipo, periodo_dal, periodo_al, origine, caricato_il").eq("origine", "letto da scansione").is("annullato_il", null).order("id").range(a, b)),
    ]);
    for (const x of [dis, righe, unioni, scans]) if (x.error) throw new Error(x.error.message);
    const vive = (dis.data || []).filter(d => !d.sostituita_da);
    const unite = new Map((unioni.data || []).map(u => [u.riga_distinta_id, u]));
    const pagIds = [...new Set((unioni.data || []).map(u => u.pagamento_id))];
    const daUnire = (righe.data || []).filter(r => vive.some(d => d.id === r.distinta_id) && !unite.has(r.id) && r.esito !== "rifiutato");
    // pagamenti candidati: stesso importo, in uscita, non stornati
    const importi = [...new Set(daUnire.map(r => Number(r.importo).toFixed(2)))].map(Number);
    let pagamenti = [];
    if (importi.length) {
      const p = await supabase.from("ci_pagamenti_fatture").select("id, conto_id, data, data_disposizione, verso, importo, controparte, causale, numero_bonifico, codice_attesa, confermato_il, distinta_id, stornato_il, natura, iban_beneficiario")
        .in("importo", importi).eq("verso", "uscita").is("stornato_il", null);
      if (p.error) throw new Error(p.error.message);
      pagamenti = (p.data || []).filter(x => x.natura !== "STORNO");
    }
    const giaUniti = new Set(pagIds);
    const proposte = daUnire.map(r => {
      const d = vive.find(x => x.id === r.distinta_id);
      const cro = (String(r.motivo_esito || "").match(/CRO\s+(\d{12,20})/) || [])[1] || "";
      return { riga: r, distinta: d, ...proponiPagamento({ ...r, data_esecuzione: r.data_esecuzione || d.data, cro }, pagamenti.filter(p => p.conto_id === d.conto_id), giaUniti) };
    });
    let pagUniti = [];
    if (pagIds.length) { const p = await supabase.from("ci_pagamenti_fatture").select("id, data, importo, controparte, causale, codice_attesa").in("id", pagIds); if (!p.error) pagUniti = p.data || []; }
    // scansioni ancora da sostituire con il digitale
    const distScan = vive.filter(d => d.da_scansione);
    const estScan = (scans.data || []).filter(d => d.tipo !== "distinta" && !confermate.has(d.id));
    const rifiutati = (righe.data || []).filter(r => vive.some(d => d.id === r.distinta_id) && r.esito === "rifiutato").map(r => ({ riga: r, distinta: vive.find(d => d.id === r.distinta_id) }));
    setDaFare({ proposte, rifiutati, unioni: (unioni.data || []).map(u => ({ ...u, riga: (righe.data || []).find(r => r.id === u.riga_distinta_id), pagamento: pagUniti.find(p => p.id === u.pagamento_id) })), distScan, estScan, pagamenti });
  }
  useEffect(() => { (async () => { try { await caricaBase(); await caricaDaFare(); } catch (x) { setErrore("Lettura non riuscita: " + x.message); } })(); }, []);

  const aggiorna = (id, cambi) => setFiles(fs => fs.map(f => f.id === id ? { ...f, ...(typeof cambi === "function" ? cambi(f) : cambi) } : f));

  // ── 1. Scegli i file: lettura, nessuna scrittura ─────────────────────────────────────────────────
  async function scelti(e) {
    const lista = [...(e.target.files || [])]; e.target.value = "";
    if (!lista.length || occupato.current) return;
    occupato.current = true; setErrore(""); setEsito(null); setCloud(null); setAperto(null);
    try {
      const b = await caricaBase();
      const letti = [];
      for (let i = 0; i < lista.length; i++) {
        const f = lista[i];
        setLavoro(`Lettura ${i + 1} di ${lista.length}: ${f.name}`);
        const byte = new Uint8Array(await f.arrayBuffer());
        const impronta = md5(byte);
        const r = { id: `${impronta}-${i}`, nome: f.name, byte, impronta, dimensione: byte.length, estensione: estensione(f.name) };
        const gemello = letti.find(x => x.impronta === impronta);
        if (gemello) { letti.push({ ...r, genere: "doppione", stato: "rosso", motivo: `è una copia identica di «${gemello.nome}»: si legge una volta sola` }); continue; }
        letti.push(await classifica(r, b));
      }
      // estratti in ordine per conto e data, poi i controlli (un file conta su quelli sopra dello stesso conto)
      const estratti = letti.filter(x => x.genere === "estratto" && !x.stato);
      estratti.sort((x, y) => (x.conto?.id ?? 1e9) - (y.conto?.id ?? 1e9) || String(x.lettura.dal).localeCompare(String(y.lettura.dal)));
      const copertoFinoA = {};
      for (const r of estratti) {
        setLavoro(`Controllo: ${r.nome}`);
        await controllaEstratto(r, b, copertoFinoA);
      }
      setFiles(fs => [...fs.filter(x => x.stato === "fatto"), ...letti]);
    } catch (x) { setErrore("Lettura non riuscita: " + x.message); }
    occupato.current = false; setLavoro("");
  }

  async function classifica(r, b) {
    const n = r.nome.toLowerCase();
    if (/\.(jpe?g|png)$/.test(n)) return scansione(r, "foto");
    if (n.endsWith(".pdf")) {
      if (await pdfSenzaTesto(r.byte)) return scansione(r, "PDF senza testo");
      const pdfjs = await import("pdfjs-dist"); const w = await import("pdfjs-dist/build/pdf.worker.min.mjs?url"); pdfjs.GlobalWorkerOptions.workerSrc = w.default;
      const pagine = await pagineDalPdf(r.byte.slice(), pdfjs);   // copia: pdf.js consuma i byte che riceve
      const testo = testoDalPdf(pagine);
      if (sembraDistinta(testo)) return await distinta(r, b, testo, false, pagine.length);
    }
    if (/\.(pdf|xlsx?)$/.test(n)) {
      const l = await leggiDocumento(r.nome, r.byte);
      if (l.errore) return { ...r, genere: "estratto", lettura: l, stato: "rosso", motivo: l.errore, forseScansione: n.endsWith(".pdf") };
      const conto = contoDelDocumento(l, b.conti);
      if (!conto) return { ...r, genere: "estratto", lettura: l, stato: "rosso", motivo: l.esito.tipo === "estratto conto" ? `l'IBAN ${l.esito.iban || "(non letto)"} non è di un conto di Podere Verde nel programma` : `la carta …${l.esito.carta || "?"} non è una carta di Podere Verde nel programma` };
      return { ...r, genere: "estratto", lettura: l, conto };
    }
    return { ...r, genere: "altro", stato: "rosso", motivo: "il file deve essere un PDF, un Excel (.xls, .xlsx) o una foto (.jpg, .png)" };
  }
  async function scansione(r, come) {
    const gia = await supabase.from("ci_documenti_fonte").select("id, tipo, caricato_il").is("annullato_il", null).or(`pdf_impronta.eq.${r.impronta},file_digitale_impronta.eq.${r.impronta}`);
    if (gia.error) throw new Error(gia.error.message);
    if (gia.data?.length) return { ...r, genere: "scansione", stato: "giallo", motivo: `già caricato: documento n. ${gia.data[0].id} (${gia.data[0].tipo}) del ${dataIt(gia.data[0].caricato_il)}` };
    return { ...r, genere: "scansione", come, stato: "arancione", motivo: "È una scansione: cercare il documento digitale nella banca. Se non si trova, si può procedere con questa." };
  }
  async function distinta(r, b, testo, daScansione, pagine) {
    const gia = await supabase.from("ci_distinte_pagamento").select("id, data, caricata_il").eq("impronta", r.impronta);
    if (gia.error) throw new Error(gia.error.message);
    if (gia.data?.length) return { ...r, genere: "distinta", stato: "giallo", motivo: `distinta già caricata (n. ${gia.data[0].id} del ${dataIt(gia.data[0].data)})` };
    const d = leggiDistinta(testo) || { modello: "", data: null, totale: null, riferimento: "", righe: [], avvisi: ["modello di distinta non riconosciuto: i dati si scrivono guardando il documento"] };
    const iban = ibanNelTesto(testo);
    // il conto ordinante: IBAN uguale, oppure (lettura ottica) le 22 cifre di ABI, CAB e conto dentro la riga «IBAN ordinante»; lo conferma la persona
    const rigaIban = (String(testo).match(/IBAN\s+ordinante[^\n]*/i) || [""])[0].replace(/\D/g, "");
    const conto = b.conti.find(c => c.tipo === "banca" && c.iban && c.iban === iban)
      || b.conti.find(c => c.tipo === "banca" && c.iban && rigaIban.includes(String(c.iban).slice(5).replace(/\D/g, "")))
      || (() => { const abi = (String(testo).match(/Banca\s*:\s*(\d{5})/i) || [])[1]; const c = abi ? b.conti.filter(x => x.tipo === "banca" && x.stato !== "chiuso" && String(x.iban || "").slice(5, 10) === abi) : [];
           return c.length === 1 ? c[0] : null; })()   // un solo conto aperto di quella banca (ABI): proposto, lo conferma la persona
      || null;
    const form = {
      conto_id: conto?.id || "", data: d.data || "", modello: d.modello || "", riferimento: d.riferimento || "",
      totale: d.totale != null && d.modello === "Distinta SEPA Credit Transfer" ? d.totale.toFixed(2).replace(".", ",") : "",   // il totale STAMPATO: per lo Storico lo scrive la persona
      righe: (d.righe.length ? d.righe : [{ beneficiario: "", causale: "", iban: "", importo: null, esito: "", cro: "", data_esecuzione: d.data, sicuri: {} }])
        .map(x => nuovoBonifico({ beneficiario: x.beneficiario || "", causale: x.causale || "", iban: x.iban || "", importo: x.importo != null ? x.importo.toFixed(2).replace(".", ",") : "",
          esito: x.esito || "", cro: x.cro || "", data_esecuzione: x.data_esecuzione || d.data || "", sicuri: x.sicuri || {} })),
      conferme: {}, avvisi: [...(d.avvisi || [])],
    };
    if (!conto && rigaIban) form.avvisi.push("conto ordinante non riconosciuto: scegliere il conto");
    else if (!conto) form.avvisi.push(iban ? `l'IBAN ordinante ${iban} non è di un conto in banca nel programma: scegliere il conto` : "conto ordinante non letto: scegliere il conto");
    // R3: una distinta digitale prende il posto di quella da scansione (stesso conto, totale, data ± 3 giorni): si mostra prima di registrare
    let sostituisce = null;
    if (!daScansione && conto && d.totale != null) {
      const s = await supabase.from("ci_distinte_pagamento").select("id, data, totale").eq("conto_id", conto.id).eq("da_scansione", true).is("sostituita_da", null).eq("totale", Number(d.totale));
      if (s.error) throw new Error(s.error.message);
      sostituisce = (s.data || []).find(x => d.data && Math.abs((new Date(x.data) - new Date(d.data)) / 86400000) <= 3) || null;
    }
    return { ...r, genere: "distinta", daScansione, scansioneConTesto: false, sostituisce, pagine: pagine || 1, testo, form, stato: "attesa",
      motivo: daScansione ? "Distinta da scansione: confermare ogni dato guardando il documento" : "Distinta digitale: il lettore non è ancora provato sui file veri di Smart CBI, quindi ogni dato si conferma guardando il documento" };
  }

  async function controllaEstratto(r, b, copertoFinoA = {}, opz = {}) {
    const stato = b.stati.find(s => s.conto_id === r.conto.id);
    const copertoDaPrima = !!copertoFinoA[r.conto.id] && copertoFinoA[r.conto.id] >= piuGiorni(r.lettura.dal, -1);
    // R3: un documento digitale che copre una scansione la sostituisce (solo chi gestisce i conti)
    const scan = await supabase.from("ci_documenti_fonte").select("id, periodo_dal, periodo_al").eq("conto_id", r.conto.id).eq("tipo", r.lettura.esito.tipo)
      .eq("origine", "letto da scansione").is("annullato_il", null).lte("periodo_dal", r.lettura.al).gte("periodo_al", r.lettura.dal);
    if (scan.error) throw new Error(scan.error.message);
    const sostituisce = r.lettura.esito.origine !== "letto da scansione" ? (scan.data || [])[0] || null : null;
    const gc = await supabase.from("ci_scansioni_confermate").select("documento_id, confermata_il").eq("impronta", r.impronta);
    if (gc.error) throw new Error(gc.error.message);
    if (gc.data?.length) { r.stato = "giallo"; r.analisi = null; r.motivo = `già nel programma: conferma la scansione n. ${gc.data[0].documento_id} dal ${dataIt(gc.data[0].confermata_il)}`; r.confermaGia = gc.data[0]; return r; }
    const a = await analizza(r.lettura, r.conto, stato, { copertoDaPrima, escludiDocumento: sostituisce?.id });
    r.analisi = a; r.sostituisce = null;
    if (a.documentoGia) { r.stato = "giallo"; r.motivo = `già caricato: documento n. ${a.documentoGia.id} del ${dataIt(a.documentoGia.caricato_il)}`; return r; }
    if (sostituisce) {
      const rs = await fetchAllPages((x, y) => supabase.from("ci_righe_fonte").select("data_contabile, verso, importo").eq("documento_id", sostituisce.id).order("id").range(x, y));
      if (rs.error) throw new Error(rs.error.message);
      const k = x => `${x.data_contabile}|${x.verso}|${Number(x.importo).toFixed(2)}`;
      const vecchie = (rs.data || []).map(k).sort(), nuove = r.lettura.esito.righeCarico.filter(x => x.data_contabile >= sostituisce.periodo_dal && x.data_contabile <= sostituisce.periodo_al).map(k).sort();
      const uguali = JSON.stringify(vecchie) === JSON.stringify(nuove);
      const copre = r.lettura.dal <= sostituisce.periodo_dal && r.lettura.al >= sostituisce.periodo_al;
      if (!copre || !uguali) { r.stato = "rosso"; r.motivo = `copre la scansione n. ${sostituisce.id} (dal ${dataIt(sostituisce.periodo_dal)} al ${dataIt(sostituisce.periodo_al)}) ma ${!copre ? "non copre tutto il suo periodo" : `le righe non tornano (giorno, entrata o uscita, importo): ${diffRighe(vecchie, nuove)}`}: avvisare chi gestisce i conti`; return r; }
      if (!b.gestore) { r.stato = "rosso"; r.motivo = `sostituisce la scansione n. ${sostituisce.id}: la sostituzione la fa chi gestisce i conti (Dott. Bizzarri, Teresa Demaria, Colabucci)`; return r; }
      r.sostituisce = sostituisce;
    }
    if (a.ok) { r.stato = "verde"; r.motivo = `${a.righeNuove} righe nuove${a.giaPresenti ? `, ${a.giaPresenti} già presenti` : ""}${r.sostituisce ? ` — prende il posto della scansione n. ${r.sostituisce.id} (righe uguali; se le righe della scansione sono già collegate, la scansione resta e questo file la conferma: solo se il periodo è lo stesso)` : ""}`; copertoFinoA[r.conto.id] = r.lettura.al > (copertoFinoA[r.conto.id] || "") ? r.lettura.al : copertoFinoA[r.conto.id]; }
    else { r.stato = opz.scansione ? "attesa" : "rosso"; r.motivo = [...a.controlli.filter(c => !c.ok).map(c => `${c.nome}: ${c.dettaglio}`), ...(r.lettura.esito.errori || [])][0] || "un controllo non è passato"; }
    return r;
  }
  const diffRighe = (a, b) => { const sa = new Set(a), sb = new Set(b); const solo1 = a.filter(x => !sb.has(x)), solo2 = b.filter(x => !sa.has(x));
    return [solo1.length ? `nella scansione e non nel digitale: ${solo1.slice(0, 3).join("; ")}` : "", solo2.length ? `nel digitale e non nella scansione: ${solo2.slice(0, 3).join("; ")}` : ""].filter(Boolean).join(" — ") || "numero di righe diverso"; };

  // ── 2. Scansione: «Procedi con la scansione» → lettura ottica → modulo da confermare ─────────────────
  async function procediScansione(f) {
    if (occupato.current) return;
    occupato.current = true; setErrore("");
    try {
      const img = /\.pdf$/i.test(f.nome) ? await immaginiDalPdf(f.byte) : await immagineDaFile(f.byte, tipoMime(f.nome));
      const pagine = await leggiConOcr(img.pagine, t => setLavoro(`${f.nome}: ${t}`));
      const testo = pagine.map(p => p.testo).join("\n");
      const tipo = tipoProposto(testo);
      const b = base;
      if (tipo === "distinta") {
        const d = await distinta(f, b, testo, true, img.numeroPagine);
        aggiorna(f.id, { ...d, pagineOcr: pagine, come: f.come });
      } else {
        const righe = leggiRigheScansione(pagine).map((x, i) => ({ k: i, includi: !x.daContabilizzare, data: x.data_contabile, descrizione: x.descrizione, verso: x.verso,
          importo: x.importo != null ? x.importo.toFixed(2).replace(".", ",") : "", pagina: x.pagina_pdf, sicuro: x.sicuro, confermata: false, note: x.note }));   // R3: le conferma la persona
        const carta = cartaNelTesto(testo), iban = ibanNelTesto(testo);
        const conto = b.conti.find(c => (tipo === "lista movimenti della carta" && c.ultime_quattro_cifre && c.ultime_quattro_cifre === carta) || (tipo === "estratto conto" && c.iban && c.iban === iban)) || null;
        aggiorna(f.id, { genere: "scansione-righe", pagineOcr: pagine, numeroPagine: img.numeroPagine, stato: "attesa",
          motivo: "Righe lette con la lettura ottica: confrontarle con l'immagine, correggerle e confermarle",
          form: { tipo: tipo || (conto ? TIPO_DOCUMENTO_PER_CONTO[conto.tipo] : ""), conto_id: conto?.id || "", righe, saldo_iniziale: "", saldo_finale: "", dal: "", al: "", controllato: false } });
      }
      setAperto(f.id);
    } catch (x) { setErrore(`Lettura ottica di «${f.nome}» non riuscita: ${x.message}`); }
    occupato.current = false; setLavoro("");
  }

  // Modulo delle righe da scansione: controlli come per un documento digitale
  async function controllaScansioneRighe(f) {
    if (occupato.current) return;
    occupato.current = true; setErrore("");
    try {
      const b = await caricaBase();
      const m = f.form; const conto = b.conti.find(c => c.id === Number(m.conto_id));
      const prob = [];
      if (!conto) prob.push("scegliere il conto");
      if (conto && TIPO_DOCUMENTO_PER_CONTO[conto.tipo] !== m.tipo) prob.push(`un documento «${m.tipo || "?"}» non va sul conto ${conto.nome}`);
      const righe = m.righe.filter(x => x.includi);
      righe.forEach((x, i) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(x.data || "")) prob.push(`riga ${i + 1}: data mancante`);
        const n = numero(x.importo); if (n == null || n <= 0) prob.push(`riga ${i + 1}: importo mancante`);
        if (vuoto(x.descrizione)) prob.push(`riga ${i + 1}: descrizione mancante`);
        if (!x.confermata) prob.push(`riga ${i + 1}: da confermare guardando l'immagine`);
      });
      if (!m.controllato) prob.push("spuntare «Ho confrontato ogni riga con l'immagine»");
      const dal = m.dal || righe.map(x => x.data).sort()[0], al = m.al || righe.map(x => x.data).sort().slice(-1)[0];
      if (!dal || !al) prob.push("scrivere il periodo del documento (dal … al …)");
      let si = numero(m.saldo_iniziale), sf = numero(m.saldo_finale);
      if (m.tipo === "estratto conto" && (si == null || sf == null)) prob.push("scrivere il saldo iniziale e il saldo finale stampati nel documento");
      if (prob.length) { aggiorna(f.id, { stato: "attesa", motivo: prob.slice(0, 4).join("; ") + (prob.length > 4 ? ` (e altri ${prob.length - 4})` : "") }); return; }
      if (m.tipo === "estratto conto") {
        const somma = righe.reduce((t, x) => t + (x.verso === "entrata" ? 1 : -1) * centesimi(numero(x.importo)), 0);
        if (centesimi(si) + somma !== centesimi(sf)) { aggiorna(f.id, { stato: "attesa", motivo: `saldo iniziale ${euro(si)} + movimenti ${euro(somma / 100)} = ${euro(centesimi(si) / 100 + somma / 100)}, ma il saldo finale scritto è ${euro(sf)}: una riga è sbagliata o manca` }); return; }
      }
      const lettura = { impronta: f.impronta, estensione: f.estensione, dal, al, formato: "scansione", nomeFormato: "Scansione letta con la lettura ottica",
        esito: { tipo: m.tipo, contoScelto: true, origine: "letto da scansione", pagine_pdf: f.numeroPagine || 1, saldo_iniziale: si, saldo_finale: sf, valido: true, errori: [],
          righeCarico: righe.map(x => ({ data_contabile: x.data, data_valuta: null, verso: x.verso, importo: numero(x.importo), descrizione: String(x.descrizione).replace(/\s+/g, " ").trim(),
            numero_bonifico: null, importo_in_valuta: null, cambio: null, controparte: null, controparte_iban: null, pagina_pdf: x.pagina || 1 })) } };
      const r = { ...f, lettura, conto, genere: "scansione-righe" };
      await controllaEstratto(r, b, {}, { scansione: true });
      aggiorna(f.id, { lettura, conto, analisi: r.analisi, stato: r.stato === "verde" ? "verde" : "attesa", motivo: r.motivo });
    } catch (x) { setErrore("Controllo non riuscito: " + x.message); }
    finally { occupato.current = false; }
  }

  // Modulo della distinta: tutti i campi confermati, totale = somma
  function controllaDistinta(f) {
    const m = f.form, prob = [];
    if (!m.conto_id) prob.push("scegliere il conto");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.data || "")) prob.push("data della distinta");
    if (!m.conferme.data || !m.conferme.conto_id) prob.push("confermare conto e data");
    if (numero(m.totale) == null) prob.push("scrivere il totale stampato nella distinta"); else if (!m.conferme.totale) prob.push("confermare il totale stampato");
    if (!m.righe.length) prob.push("almeno un bonifico");
    if (f.sostituisce && !base?.gestore) prob.push(`prende il posto della distinta da scansione n. ${f.sostituisce.id}: la sostituzione la fa chi gestisce i conti`);
    m.righe.forEach((x, i) => {
      const campi = ["beneficiario", "importo", "data_esecuzione", "causale", ...(!vuoto(x.iban) ? ["iban"] : []), ...(x.esito ? ["esito"] : []), ...(!vuoto(x.cro) ? ["cro"] : [])];
      for (const c of campi) if (!x.conferme[c]) prob.push(`bonifico ${i + 1}: confermare ${({ data_esecuzione: "la data di esecuzione", iban: "l'IBAN", esito: "l'esito", cro: "il CRO" })[c] || c}`);
      if (vuoto(x.beneficiario)) prob.push(`bonifico ${i + 1}: beneficiario`);
      const n = numero(x.importo); if (n == null || n <= 0) prob.push(`bonifico ${i + 1}: importo`);
      if (vuoto(x.causale)) prob.push(`bonifico ${i + 1}: causale (se è scritta a mano, scriverla)`);
      if (!vuoto(x.iban) && !ibanValido(x.iban)) prob.push(`bonifico ${i + 1}: IBAN non valido (R7)`);
    });
    const somma = m.righe.reduce((t, x) => t + centesimi(numero(x.importo) || 0), 0);
    if (numero(m.totale) != null && centesimi(numero(m.totale)) !== somma) prob.push(`il totale stampato ${euro(numero(m.totale))} è diverso dalla somma dei bonifici ${euro(somma / 100)} (R7)`);
    return { prob, somma };
  }
  const distintaPronta = f => f.genere === "distinta" && f.form && controllaDistinta(f).prob.length === 0;
  const registrabile = f => (f.genere === "estratto" && ["verde", "giallo"].includes(f.stato)) || (f.genere === "scansione-righe" && f.stato === "verde")
    || (f.genere === "distinta" && !["fatto", "giallo"].includes(f.stato) && distintaPronta(f)) || (f.stato === "giallo" && (f.genere === "distinta" || f.genere === "scansione"));
  // un file già nel programma (distinta o scansione): i dati per il nome nell'archivio si prendono dal programma
  async function infoArchivio(f, b) {
    const d = await supabase.from("ci_distinte_pagamento").select("id, data, conto_id, totale, da_scansione").eq("impronta", f.impronta);
    if (d.error) throw new Error(d.error.message);
    if (d.data?.length) {
      const x = d.data[0]; const r = await supabase.from("ci_righe_distinta").select("beneficiario").eq("distinta_id", x.id);
      if (r.error) throw new Error(r.error.message);
      return { tipo: "distinta", conto: b.conti.find(c => c.id === x.conto_id), data: x.data, righe: r.data || [], totale: Number(x.totale), daScansione: x.da_scansione };
    }
    const k = await supabase.from("ci_documenti_fonte").select("id, conto_id, tipo, periodo_dal, periodo_al, origine").is("annullato_il", null).or(`pdf_impronta.eq.${f.impronta},file_digitale_impronta.eq.${f.impronta}`);
    if (k.error) throw new Error(k.error.message);
    const x = (k.data || [])[0]; if (!x) throw new Error("non trovato nel programma");
    return { tipo: "documento", conto: b.conti.find(c => c.id === x.conto_id), docTipo: x.tipo, formato: "", dal: x.periodo_dal, al: x.periodo_al, estensione: f.estensione, daScansione: x.origine === "letto da scansione" };
  }

  // ── 3. Registra ────────────────────────────────────────────────────────────────────────────────
  async function registra() {
    if (occupato.current) return;
    const daFareOra = files.filter(registrabile);
    if (!daFareOra.length) return;
    occupato.current = true; setErrore(""); setEsito(null);
    const fatti = { estratti: 0, righe: 0, distinte: 0, bonifici: 0, gia: 0, fermato: null, nonNelProgramma: [] };
    try {
      let b = await caricaBase();
      for (const f of daFareOra) {
        setLavoro(`Registro «${f.nome}»…`);
        try {
          if (f.stato === "giallo" && (f.genere === "distinta" || f.genere === "scansione")) {   // già nel programma: si prepara solo l'archivio nel cloud
            aggiorna(f.id, { stato: "fatto", archivioInfo: await infoArchivio(f, b), motivo: `${f.motivo}; niente da registrare` }); fatti.gia++; continue;
          }
          if (f.genere === "estratto" && f.stato === "giallo" && f.confermaGia) {
            try { await salvaNelProgramma(f.impronta, f.byte, f.nome); } catch (x) { fatti.nonNelProgramma.push(`${f.nome}: ${x.message}`); }
            aggiorna(f.id, { stato: "fatto", archivioInfo: { tipo: "documento", conto: f.conto, docTipo: f.lettura.esito.tipo, formato: f.lettura.formato, dal: f.lettura.dal, al: f.lettura.al, estensione: f.lettura.estensione || f.estensione, daScansione: false },
              motivo: `${f.motivo}; il file è nel programma` }); fatti.gia++; continue;
          }
          if (f.genere === "estratto" && f.stato === "giallo") {
            try { await salvaNelProgramma(f.impronta, f.byte, f.nome); } catch (x) { fatti.nonNelProgramma.push(`${f.nome}: ${x.message}`); }
            aggiorna(f.id, { stato: "fatto", archivioInfo: { tipo: "documento", conto: f.conto, docTipo: f.lettura.esito.tipo, formato: f.lettura.formato, dal: f.lettura.dal, al: f.lettura.al, estensione: f.lettura.estensione || f.estensione, daScansione: false },
              motivo: `${f.motivo}; il file è nel programma` }); fatti.gia++; continue;
          }
          if (f.genere === "estratto" || f.genere === "scansione-righe") {
            b = await caricaBase();
            const r = { ...f }; await controllaEstratto(r, b, {}, { scansione: f.genere === "scansione-righe" });
            if (r.stato !== "verde") throw new Error(r.motivo);
            const p = { ...r.analisi.payload };
            const chiamata = r.sostituisce ? supabase.rpc("ci_documento_sostituisci_scansione", { p_scansione: r.sostituisce.id, p })
              : supabase.rpc("ci_carica_documento", { p });
            const { data: esitoDb, error } = await chiamata;
            if (error) throw new Error("il database non l'ha accettato: " + error.message);
            const confermata = r.sostituisce && esitoDb?.modo === "confermata";
            const idDoc = r.sostituisce ? esitoDb?.documento : esitoDb;
            let nota = "salvato nel programma";
            try { await salvaNelProgramma(f.impronta, f.byte, f.nome); } catch (x) { nota = `NON salvato nel programma (${x.message})`; fatti.nonNelProgramma.push(f.nome); }
            aggiorna(f.id, { stato: "fatto", idDocumento: idDoc, archivioInfo: { tipo: "documento", conto: r.conto, docTipo: r.lettura.esito.tipo, formato: r.lettura.formato, dal: r.lettura.dal, al: r.lettura.al, estensione: r.lettura.estensione || f.estensione, daScansione: f.genere === "scansione-righe" }, motivo: confermata ? `le righe della scansione n. ${idDoc} sono già collegate: la scansione resta e questo file la conferma (righe uguali); ${nota}`
              : `documento n. ${idDoc}: ${r.analisi.righeNuove} righe nuove${r.sostituisce ? `; la scansione n. ${r.sostituisce.id} è sostituita` : ""}; ${nota}` });
            fatti.estratti++; fatti.righe += confermata ? 0 : r.analisi.righeNuove; continue;
          }
          if (f.genere === "distinta") {
            const m = f.form; const conto = b.conti.find(c => c.id === Number(m.conto_id));
            const { somma } = controllaDistinta(f);
            const righe = m.righe.map(x => ({ beneficiario: x.beneficiario.trim(), iban: vuoto(x.iban) ? null : x.iban, importo: numero(x.importo), causale: x.causale.trim(),
              data_esecuzione: x.data_esecuzione || m.data, esito: x.esito || null, motivo_esito: x.cro ? `CRO ${x.cro}` : null }));
            const daScansione = !!f.daScansione || !!f.scansioneConTesto;
            // R3: la distinta da scansione con lo stesso conto, lo stesso totale stampato e la data vicina (± 3 giorni) si cerca adesso, con i dati confermati
            const cand = await supabase.from("ci_distinte_pagamento").select("id, data, totale").eq("conto_id", conto.id).eq("da_scansione", true).is("sostituita_da", null).eq("totale", numero(m.totale));
            if (cand.error) throw new Error(cand.error.message);
            // e anche gli stessi bonifici (beneficiario e importo), come nel database: una distinta diversa con lo stesso totale entra da sola
            const vicine = (cand.data || []).filter(x => Math.abs((new Date(x.data) - new Date(m.data)) / 86400000) <= 3);
            let trovata = null;
            if (vicine.length) {
              const rv = await supabase.from("ci_righe_distinta").select("distinta_id, beneficiario, importo").in("distinta_id", vicine.map(x => x.id));
              if (rv.error) throw new Error(rv.error.message);
              const mia = chiaveBonifici(righe);
              trovata = vicine.sort((a, b2) => a.id - b2.id).find(x => chiaveBonifici((rv.data || []).filter(g => g.distinta_id === x.id)) === mia) || null;
            }
            if (trovata && daScansione) throw new Error(`c'è già la distinta da scansione n. ${trovata.id} con lo stesso conto, totale e data: questa è la stessa, non si carica una seconda volta`);
            if (trovata && !base?.gestore) throw new Error(`prende il posto della distinta da scansione n. ${trovata.id}: la sostituzione la fa chi gestisce i conti`);
            const sostituisce = trovata;
            const percorso = `${m.data.slice(0, 4)}/${m.data}_${f.impronta}${f.estensione}`;
            const up = await supabase.storage.from(ARCHIVIO_DISTINTE).upload(percorso, new Blob([f.byte], { type: tipoMime(f.nome) }), { upsert: false, contentType: tipoMime(f.nome) });
            if (up.error && !/exist|duplicate|409/i.test(`${up.error.message} ${up.error.statusCode || ""}`)) throw new Error("il file non si salva nel programma: " + up.error.message);
            const { data: idDis, error } = await supabase.rpc("ci_distinta_carica", { p: { conto_id: conto.id, data: m.data, totale: numero(m.totale).toFixed(2), impronta: f.impronta, pagine: f.pagine || f.numeroPagine || 1,
              nome_file: f.nome, byte: f.dimensione, percorso, modello: m.modello || null, descrizione: m.riferimento || null, da_scansione: daScansione, sostituisce: sostituisce?.id || null, righe } });
            if (error) throw new Error("il database non l'ha accettata: " + error.message);
            aggiorna(f.id, { stato: "fatto", idDistinta: idDis, conto, archivioInfo: { tipo: "distinta", conto, data: m.data, righe: m.righe, totale: somma / 100, daScansione },
              motivo: `distinta n. ${idDis}: ${righe.length} bonifici, ${euro(somma / 100)}${daScansione ? " — da scansione" : ""}${sostituisce ? ` — sostituisce la distinta da scansione n. ${sostituisce.id}` : ""}` });
            fatti.distinte++; fatti.bonifici += righe.length; continue;
          }
        } catch (x) {
          aggiorna(f.id, { stato: "rosso", motivo: "fermato qui: " + x.message });
          fatti.fermato = `«${f.nome}»: ${x.message}`;
          break;
        }
      }
      await caricaDaFare();
    } catch (x) { setErrore("Registrazione interrotta: " + x.message); }
    setEsito(fatti); occupato.current = false; setLavoro("");
  }

  // ── 4. Unione bonifico ↔ pagamento (R8: solo chi gestisce i conti) ─────────────────────────────────
  const [scelte, setScelte] = useState({});
  async function unisci(rigaId, pagamentoId, motivo) {
    if (occupato.current) return; occupato.current = true; setErrore("");
    const { error } = await supabase.rpc("ci_distinta_unisci", { p_riga: rigaId, p_pagamento: Number(pagamentoId), p_motivo: motivo || null });
    if (error) setErrore("Unione non riuscita: " + error.message);
    try { await caricaDaFare(); } catch (x) { setErrore(x.message); }
    occupato.current = false;
  }
  async function separa(unioneId, motivo) {
    if (occupato.current) return; occupato.current = true; setErrore("");
    const { error } = await supabase.rpc("ci_distinta_separa", { p_unione: unioneId, p_motivo: motivo });
    if (error) setErrore("Separazione non riuscita: " + error.message);
    try { await caricaDaFare(); } catch (x) { setErrore(x.message); }
    occupato.current = false;
  }
  async function apriDistintaFile(d) {
    const { data, error } = await supabase.storage.from(ARCHIVIO_DISTINTE).createSignedUrl(d.percorso, 300);
    if (error) { setErrore("La distinta non si apre: " + error.message); return; }
    window.open(data.signedUrl, "_blank");
  }

  // ── 5. Archivia nel cloud (R9, facoltativo) ───────────────────────────────────────────────────────
  async function archivia() {
    if (occupato.current) return;
    const registrati = files.filter(f => f.stato === "fatto" && f.archivioInfo);
    if (!registrati.length) return;
    let radice;
    try { radice = await window.showDirectoryPicker({ id: "banche-podere-verde", mode: "readwrite" }); }
    catch (x) { if (x?.name !== "AbortError") setErrore("Scelta della cartella non riuscita: " + x.message); return; }
    occupato.current = true; setErrore(""); setCloud(null);
    const ea = { scritti: [], tolti: [], errori: [], avvisi: [], cartella: null };
    try {
      if (!(await permesso(radice, true))) throw new Error("senza il permesso di modificare i file il programma non può archiviare: rifare e premere «Modifica file»");
      const k = await supabase.from("ci_banche_cartella").select("codice");
      if (k.error) throw new Error(k.error.message);
      const c = await controllaCartella(radice, k.data?.[0]?.codice || null);
      if (!c.ok) throw new Error(c.problema);
      setLavoro("Sistemo la cartella «da smistare»…");
      ea.cartella = await sistemaDaSmistare(radice);
      const arch = await fetchAllPages((a, b) => supabase.from("ci_banche_archivio").select("impronta, percorso").order("impronta").range(a, b));
      if (arch.error) throw new Error(arch.error.message);
      const giaArch = new Map((arch.data || []).map(r => [r.impronta, r.percorso]));
      const b = await caricaBase();
      for (const f of registrati) {
        setLavoro(`Archivio «${f.nome}»…`);
        try {
          const a = f.archivioInfo;
          const conto = b.conti.find(x => x.id === a.conto.id) || a.conto;
          let percorso = giaArch.get(f.impronta);
          if (!percorso) {
            const dest = a.tipo === "distinta"
              ? posizioneDistinta(conto, { data: a.data, righe: a.righe, totale: a.totale, daScansione: a.daScansione, estensione: f.estensione })
              : posizioneInArchivio(conto, { tipo: a.docTipo, formato: a.formato, dal: a.dal, al: a.al, estensione: a.estensione }).replace(/(\.[^.]+)$/, a.daScansione ? " - da scansione$1" : "$1");
            const w = await scriviVerificato(radice, dest, f.byte);
            const ins = await supabase.from("ci_banche_archivio").insert({ impronta: f.impronta, percorso: w.percorso, dimensione: f.byte.length });
            if (ins.error && !/duplicate|unique/i.test(ins.error.message)) throw new Error("registrazione della copia: " + ins.error.message);
            percorso = w.percorso; ea.scritti.push(percorso);
          } else {
            let uguale = false; try { uguale = md5(await leggiByte(radice, percorso)) === f.impronta; } catch { uguale = false; }
            if (!uguale) throw new Error(`nell'archivio la copia registrata (${percorso}) non c'è o è diversa: avvisare chi gestisce i conti`);
          }
          // R9: si toglie da «da smistare» solo un file con lo stesso nome e la stessa impronta
          for (const dove of [DA_SMISTARE, VECCHIA_DA_SMISTARE]) {
            let dir = null; try { dir = await cartella(radice, dove); } catch { dir = null; }
            if (dir && await esiste(dir, f.nome)) {
              const qui = md5(await leggiByte(radice, `${dove}\\${f.nome}`));
              if (qui !== f.impronta) { ea.avvisi.push(`in «${dove}» c'è un altro file con il nome «${f.nome}» ma diverso: resta lì, da guardare`); continue; }
              const t = await togliDaSmistare(radice, f.nome, f.impronta, dove); if (t === "Tolto") ea.tolti.push(`${dove}\\${f.nome}`);   // un errore ferma il giro (R9)
            }
          }
        } catch (x) { ea.errori.push(`${f.nome}: ${x.message}`); break; }
      }
    } catch (x) { ea.errori.push(x.message); }
    setCloud(ea); occupato.current = false; setLavoro("");
  }

  // ── Disegno ────────────────────────────────────────────────────────────────────────────────────
  const conti = base?.conti || [];
  const daRegistrare = files.filter(registrabile);
  const registrati = files.filter(f => f.stato === "fatto");
  const conteggio = s => files.filter(f => f.stato === s).length;
  const riga = { borderTop: `1px solid ${C.border}`, padding: "6px 0", fontSize: 12.5 };
  const piccolo = { ...input, height: 28, fontSize: 12 };
  const spunta = (ok, onChange, testo = "confermato") => <label style={{ fontSize: 11.5, color: ok ? C.green : C.red, whiteSpace: "nowrap" }}><input type="checkbox" checked={!!ok} onChange={e => onChange(e.target.checked)} /> {testo}</label>;

  return (
    <div style={{ maxWidth: 1250 }}>
      <h2 style={{ color: C.primary, margin: "0 0 4px" }}>Carica dal cloud estratti conto e distinte</h2>
      {/* versione 393 (Dott. Bizzarri 23/11/2026 ore 13:43–13:44): brevi istruzioni all'inizio della pagina, testo approvato */}
      <div style={{ ...scheda, background: "#EEF5EE", border: `2px solid ${C.green}`, fontSize: 13.5, lineHeight: 1.55 }}>
        <b>In breve.</b> Qui si caricano gli estratti conto della banca, le liste dei movimenti della carta prepagata e le distinte dei bonifici, così come si scaricano dalla banca (PDF o Excel).
        <ol style={{ margin: "4px 0 0", paddingLeft: 22 }}>
          <li>Salvare i file nella cartella del cloud <b>BANCHE → {DA_SMISTARE}</b>.</li>
          <li>Premere <b>«Scegli i file»</b>, selezionarli tutti insieme e premere «Apri»: il programma li legge, senza scrivere niente.</li>
          <li>Guardare il colore di ogni file: 🟢 si registra, 🟡 è già caricato, 🔴 va sistemato (il motivo è scritto accanto).</li>
          <li>Premere <b>«Registra»</b>; per le distinte, <b>«Unisci»</b> ogni bonifico al suo pagamento; infine <b>«Archivia nel cloud»</b>.</li>
        </ol>
      </div>

      <div style={{ ...scheda, background: "#FFF4E5", border: `2px solid #D9822B`, fontSize: 13.5 }}>
        <b>⚠️ Solo documenti digitali.</b> Si salvano e si usano solo i documenti <b>scaricati dalla banca</b> (in Smart CBI: salvare il documento in PDF, non stamparlo e non scansionarlo).
        Una scansione o una foto si usa solo se il documento digitale non si trova: resta segnata <b>«da scansione»</b>, ogni dato lo conferma una persona e quando arriva il digitale ne prende il posto.
      </div>

      <RiquadroDoveSonoIFile cartellaFinale={["BANCHE", DA_SMISTARE]} cosaMetterci="gli estratti conto, le liste movimenti delle carte e le distinte scaricati dalla banca, così come sono" />

      <details style={{ ...scheda, fontSize: 13, lineHeight: 1.55 }}>
        <summary style={{ fontWeight: 800, color: C.primary, cursor: "pointer", fontSize: 14.5 }}>Come si fa, passo per passo</summary>
        <div style={{ fontWeight: 700, marginTop: 8 }}>Passo 1 – Scegli i file</div>
        <div>Premere <b>«Scegli i file»</b>, andare nella cartella <code>BANCHE\{DA_SMISTARE}</code> (o in «Download» se il computer non raggiunge il cloud), selezionare i file (Ctrl per sceglierne più di uno) e premere «Apri». Il programma legge senza scrivere niente.</div>
        <div style={{ fontWeight: 700, marginTop: 8 }}>Passo 2 – Che cosa c'è nei file</div>
        <div>🟢 <b>Pronto</b>: si registra. 🟡 <b>Già caricato</b>: non entra niente, il file va solo nell'archivio. 🔴 <b>Da sistemare</b>: non si registra; il motivo è scritto accanto. 🟠 <b>Da scansione</b>: cercare il documento digitale nella banca; se non si trova, «Procedi con la scansione». ⚪ <b>Da completare</b>: dati da confermare.</div>
        <div>Per una <b>scansione</b> o una <b>distinta</b> si apre il modulo: ogni dato si confronta con il documento e si spunta «confermato». Una causale scritta a mano la scrive la persona.</div>
        <div style={{ fontWeight: 700, marginTop: 8 }}>Passo 3 – Registra</div>
        <div>Premere <b>«Registra»</b>: i movimenti e i bonifici entrano nel programma e il file si salva nel programma. La distinta <b>non conferma nessun pagamento</b>: il pagamento resta «in attesa della banca» fino all'estratto conto.</div>
        <div style={{ fontWeight: 700, marginTop: 8 }}>Passo 4 – Unisci i bonifici ai pagamenti (chi gestisce i conti)</div>
        <div>Il programma propone il pagamento di ogni bonifico solo se ce n'è uno solo con lo stesso importo, la data vicina e lo stesso beneficiario (o il CRO). Si conferma con «Unisci»; si toglie con «Separa» scrivendo il motivo.</div>
        <div style={{ fontWeight: 700, marginTop: 8 }}>Passo 5 – Archivia nel cloud (facoltativo)</div>
        <div>Da un computer che raggiunge il cloud: <b>«Archivia nel cloud»</b>, scegliere la cartella <b>BANCHE</b> (un clic, senza entrarci). Il programma mette ogni file nella cartella del suo conto e del suo anno con il nome giusto, rilegge la copia e solo allora lo toglie da «da smistare».</div>
        <div style={{ fontWeight: 700, marginTop: 8 }}>Se qualcosa non va</div>
        <ul style={{ margin: "2px 0 0", paddingLeft: 22 }}>
          <li><b>File rosso:</b> leggere il motivo. Il file resta dov'è.</li>
          <li><b>Si ferma a metà:</b> i file sopra sono registrati; quello fermato e i seguenti no. Mandare lo schermo con la scritta rossa a chi gestisce i conti (Dott. Bizzarri, Teresa Demaria, Colabucci).</li>
          <li><b>Distinta con IBAN diverso dalla scheda del fornitore o importo diverso dalla fattura:</b> non unire; telefonare per conferma e avvisare chi gestisce i conti.</li>
        </ul>
      </details>

      {errore && <div style={{ ...scheda, borderColor: C.red, color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>}
      {lavoro && <div style={{ ...scheda, borderColor: C.blue, color: C.blue }}>⏳ {lavoro}</div>}

      <div style={scheda}>
        <div style={{ fontWeight: 800, color: C.primary, marginBottom: 8 }}>1. Scegli i file</div>
        <input ref={inputFile} type="file" multiple accept=".pdf,.xls,.xlsx,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={scelti} />
        <button style={btn(true)} disabled={!!lavoro || !base} onClick={() => inputFile.current?.click()}>📂 Scegli i file</button>
        {files.length > 0 && <span style={{ marginLeft: 12, fontSize: 12.5 }}>
          {files.length} file: {["verde", "giallo", "arancione", "attesa", "rosso", "fatto"].filter(s => conteggio(s)).map(s => `${ICONA[s]} ${conteggio(s)} ${NOME_STATO[s].toLowerCase()}`).join(" · ")}
        </span>}
      </div>

      {files.length > 0 && <div style={scheda}>
        <div style={{ fontWeight: 800, color: C.primary, marginBottom: 8 }}>2. Che cosa c'è nei file</div>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Esito", "File", "Che cos'è", "Conto", "Periodo o data", "Motivo / dettaglio", ""].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>{files.map(f => {
            const contoNome = f.conto?.nome || conti.find(c => c.id === Number(f.form?.conto_id))?.nome || "—";
            const cosa = f.genere === "distinta" ? `Distinta${f.daScansione ? " (da scansione)" : ""}${f.form?.modello ? ` – ${f.form.modello}` : ""}` : f.genere === "scansione-righe" ? `${f.form?.tipo || "Documento"} (da scansione)` : f.genere === "scansione" ? `Scansione (${f.come || "immagine"})` : f.lettura?.nomeFormato || "—";
            const periodo = f.genere === "distinta" ? dataIt(f.form?.data) : f.lettura?.dal ? `${dataIt(f.lettura.dal)} – ${dataIt(f.lettura.al)}` : "—";
            return <tr key={f.id} style={{ borderBottom: `1px solid ${C.border}`, background: `${COLORE[f.stato]}14`, verticalAlign: "top" }}>
              <td style={{ padding: "5px 8px", fontWeight: 800, color: COLORE[f.stato], whiteSpace: "nowrap" }}>{ICONA[f.stato]} {NOME_STATO[f.stato]}</td>
              <td style={{ padding: "5px 8px" }}>{f.nome}</td>
              <td style={{ padding: "5px 8px" }}>{cosa}</td>
              <td style={{ padding: "5px 8px" }}>{contoNome}</td>
              <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{periodo}</td>
              <td style={{ padding: "5px 8px" }}>{f.motivo}</td>
              <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                {f.stato === "arancione" && f.genere === "scansione" && <button style={btn(true, "#D9822B")} disabled={!!lavoro} onClick={() => procediScansione(f)}>Procedi con la scansione</button>}
                {f.stato === "rosso" && f.forseScansione && /non riconosciuto/.test(f.motivo || "") && <button style={btn(false, "#D9822B")} disabled={!!lavoro} title="Per un PDF stampato e poi scansionato che contiene già un testo" onClick={() => { aggiorna(f.id, { genere: "scansione", come: "PDF scansionato con testo", stato: "arancione" }); procediScansione({ ...f, come: "PDF scansionato con testo" }); }}>È una scansione: lettura ottica</button>}
                {(f.form || f.lettura?.esito) && f.stato !== "fatto" && <button style={btn(false)} onClick={() => setAperto(aperto === f.id ? null : f.id)}>{aperto === f.id ? "Chiudi" : f.form ? "Apri il modulo" : "Vedi"}</button>}
              </td>
            </tr>;
          })}</tbody>
        </table>
        {files.filter(f => f.id === aperto).map(f => <div key={f.id} style={{ marginTop: 12 }}>
          {f.genere === "distinta" && <ModuloDistinta f={f} conti={conti} aggiorna={aggiorna} controlla={controllaDistinta} spunta={spunta} piccolo={piccolo} gestore={!!base?.gestore}
            nonDistinta={f.pagineOcr?.length ? () => { const pagine = f.pagineOcr; const righe = leggiRigheScansione(pagine).map((x, i) => ({ k: i, includi: !x.daContabilizzare, data: x.data_contabile, descrizione: x.descrizione, verso: x.verso,
              importo: x.importo != null ? x.importo.toFixed(2).replace(".", ",") : "", pagina: x.pagina_pdf, sicuro: x.sicuro, confermata: false, note: x.note }));
              aggiorna(f.id, { genere: "scansione-righe", numeroPagine: f.pagine || pagine.length, stato: "attesa", motivo: "Righe lette con la lettura ottica: confrontarle con l'immagine, correggerle e confermarle",
                form: { tipo: "", conto_id: "", righe, saldo_iniziale: "", saldo_finale: "", dal: "", al: "", controllato: false } }); } : null} />}
          {f.genere === "scansione-righe" && <ModuloRighe f={f} conti={conti} aggiorna={aggiorna} controlla={() => controllaScansioneRighe(f)} spunta={spunta} piccolo={piccolo} occupato={!!lavoro} />}
          {f.genere === "estratto" && f.lettura?.esito && <div style={{ maxHeight: 320, overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}><tbody>{f.lettura.esito.righeCarico.map((x, i) => <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: 4 }}>{dataIt(x.data_contabile)}</td><td style={{ padding: 4, color: x.verso === "entrata" ? C.green : C.red, textAlign: "right" }}>{x.verso === "entrata" ? "+" : "−"}{euro(x.importo)}</td><td style={{ padding: 4 }}>{x.descrizione}</td></tr>)}</tbody></table></div>}
          {f.analisi?.controlli && <div style={{ marginTop: 6 }}>{f.analisi.controlli.map((c, i) => <div key={i} style={{ fontSize: 12, color: c.ok ? C.green : C.red }}>{c.ok ? "✔" : "✘"} {c.nome} — {c.dettaglio}</div>)}</div>}
        </div>)}
      </div>}

      {files.length > 0 && <div style={scheda}>
        <div style={{ fontWeight: 800, color: C.primary, marginBottom: 8 }}>3. Registra</div>
        <button style={btn(daRegistrare.length > 0 && !lavoro, C.green)} disabled={!daRegistrare.length || !!lavoro} onClick={registra}>✅ Registra ({daRegistrare.length})</button>
        <span style={{ marginLeft: 10, fontSize: 12.5, color: C.muted }}>Si registrano solo i file 🟢 pronti, i 🟡 già caricati (solo il file) e le distinte con tutti i dati confermati. La distinta non conferma nessun pagamento.</span>
        {esito && <div style={{ marginTop: 8, fontSize: 13, color: esito.fermato ? C.red : C.green, fontWeight: 700 }}>
          {esito.fermato ? `Fermato su ${esito.fermato}. I file sopra sono registrati.` : "Fatto."} Documenti caricati {esito.estratti} ({esito.righe} righe nuove), distinte {esito.distinte} ({esito.bonifici} bonifici), già caricati {esito.gia}.
          {esito.nonNelProgramma.length > 0 && <div style={{ color: C.red }}>Non salvati nel programma: {esito.nonNelProgramma.join("; ")}</div>}
          {esito.estratti > 0 && <div style={{ color: C.text, fontWeight: 400 }}>Le righe nuove si confermano in «Banche, carte e cassa → Conferma dei movimenti».</div>}
        </div>}
      </div>}

      {registrati.length > 0 && <div style={scheda}>
        <div style={{ fontWeight: 800, color: C.primary, marginBottom: 8 }}>4. Archivia nel cloud (facoltativo)</div>
        {browserAdatto() ? <button style={btn(!lavoro)} disabled={!!lavoro} onClick={archivia}>🗄️ Archivia nel cloud</button>
          : <span style={{ fontSize: 12.5, color: C.muted }}>Questo browser non può scrivere nelle cartelle: l'archivio lo fa chi usa Chrome o Edge su un computer che raggiunge il cloud.</span>}
        <span style={{ marginLeft: 10, fontSize: 12.5, color: C.muted }}>Si sceglie la cartella BANCHE. I file registrati qui sopra vanno nella cartella del loro conto e del loro anno.</span>
        {cloud && <div style={{ marginTop: 8, fontSize: 12.5 }}>
          {cloud.cartella && <div>Cartella «da smistare»: {cloud.cartella.esito === "rinominata" ? `rinominata in «${DA_SMISTARE}»` : cloud.cartella.esito.startsWith("spostati") ? `${cloud.cartella.spostati.length} file spostati dalla vecchia «${VECCHIA_DA_SMISTARE}» in «${DA_SMISTARE}»${cloud.cartella.rimasti.length ? "; nella vecchia restano dei file o delle cartelle" : "; la vecchia è stata tolta"}` : "a posto"}{cloud.cartella.rimasti?.length ? ` — rimasti: ${cloud.cartella.rimasti.join(", ")}` : ""}</div>}
          <div style={{ color: C.green }}>Copiati: {cloud.scritti.length}{cloud.scritti.length ? ` (${cloud.scritti.join("; ")})` : ""}. Tolti da «da smistare»: {cloud.tolti.length}.</div>
          {cloud.avvisi?.length > 0 && <div style={{ color: "#D9822B", fontWeight: 700 }}>Da guardare: {cloud.avvisi.join("; ")}</div>}
          {cloud.errori.length > 0 && <div style={{ color: C.red, fontWeight: 700 }}>Non riuscito: {cloud.errori.join("; ")}</div>}
        </div>}
      </div>}

      {daFare && <div style={scheda}>
        <div style={{ fontWeight: 800, color: C.primary, marginBottom: 8 }}>5. Da fare</div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Bonifici delle distinte da unire al pagamento ({daFare.proposte.length})</div>
        {daFare.proposte.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted }}>Nessuno.</div> : daFare.proposte.map(p => {
          const s = scelte[p.riga.id] || { pagamento: p.proposto?.id || "", motivo: "" };
          return <div key={p.riga.id} style={riga}>
            <b>{p.riga.beneficiario}</b> — {euro(p.riga.importo)} — esecuzione {dataIt(p.riga.data_esecuzione || p.distinta.data)} — {p.riga.causale || "senza causale"}
            {p.distinta.da_scansione && <span style={{ color: "#D9822B", fontWeight: 700 }}> — da scansione</span>}
            <button style={{ ...btn(false), height: 24, marginLeft: 8, fontSize: 11 }} onClick={() => apriDistintaFile(p.distinta)}>📄 distinta</button>
            <div style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {p.candidati.length === 0 ? <span style={{ color: C.muted }}>Nessun pagamento con lo stesso importo, data vicina e stesso beneficiario: si unisce quando il pagamento è nel programma.</span> : <>
                <select style={piccolo} value={s.pagamento} disabled={!base?.gestore} onChange={e => setScelte(x => ({ ...x, [p.riga.id]: { ...s, pagamento: e.target.value } }))}>
                  <option value="">— pagamento —</option>
                  {p.candidati.map(c => <option key={c.pagamento.id} value={c.pagamento.id}>{c.pagamento.codice_attesa || `n. ${c.pagamento.id}`} del {dataIt(c.pagamento.data)} — {c.pagamento.controparte || "?"} — {euro(c.pagamento.importo)}{c.cro ? " — CRO uguale" : ""}{p.proposto?.id === c.pagamento.id ? " (proposto)" : ""}</option>)}
                </select>
                {!p.proposto && <span style={{ color: C.yellow, fontWeight: 700 }}>{p.candidati.some(c => c.punti > 0) ? "più pagamenti possibili: scegliere" : "nessun pagamento con lo stesso nome o CRO: scegliere guardando i documenti"}</span>}
                {(() => { const pg = p.candidati.find(c => String(c.pagamento.id) === String(s.pagamento))?.pagamento; const ibanDiverso = pg && p.riga.iban_beneficiario && pg.iban_beneficiario && String(pg.iban_beneficiario).replace(/\s/g, "").toUpperCase() !== p.riga.iban_beneficiario;
                  return <>{ibanDiverso && <span style={{ color: C.red, fontWeight: 700 }}>IBAN del bonifico diverso da quello del pagamento ({pg.iban_beneficiario}): telefonare per conferma e scrivere il motivo</span>}
                  {base?.gestore ? <><input style={{ ...piccolo, width: 240 }} placeholder={ibanDiverso ? "motivo (obbligatorio)" : "nota (facoltativa)"} value={s.motivo} onChange={e => setScelte(x => ({ ...x, [p.riga.id]: { ...s, motivo: e.target.value } }))} />
                    <button style={btn(!!s.pagamento, C.green)} disabled={!s.pagamento || !!lavoro || (ibanDiverso && !s.motivo.trim())} onClick={() => unisci(p.riga.id, s.pagamento, s.motivo)}>Unisci</button></> : null}</>; })()}
                {base?.gestore ? null
                  : <span style={{ color: C.muted }}>L'unione la conferma chi gestisce i conti.</span>}
              </>}
            </div>
          </div>;
        })}
        {daFare.rifiutati.length > 0 && <>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 10, color: C.red }}>Bonifici rifiutati dalla banca ({daFare.rifiutati.length})</div>
          {daFare.rifiutati.map(x => <div key={x.riga.id} style={{ ...riga, color: C.red }}>{x.riga.beneficiario} — {euro(x.riga.importo)} — distinta del {dataIt(x.distinta.data)}: il pagamento non è partito. In «Gestione incassi e pagamenti» si annulla la disposizione con il motivo e, se serve, si dispone di nuovo (torna «da pagare»).</div>)}
        </>}
        {daFare.unioni.length > 0 && <>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 10 }}>Bonifici uniti ({daFare.unioni.length})</div>
          {daFare.unioni.map(u => <div key={u.id} style={riga}>
            {u.riga?.beneficiario} — {euro(u.riga?.importo)} → pagamento {u.pagamento?.codice_attesa || `n. ${u.pagamento_id}`} del {dataIt(u.pagamento?.data)} ({u.pagamento?.controparte || ""})
            {base?.gestore && <button style={{ ...btn(false, C.red), height: 24, marginLeft: 8, fontSize: 11 }} disabled={!!lavoro} onClick={() => setScelte(x => ({ ...x, [`apri${u.id}`]: true }))}>Separa…</button>}
            {scelte[`apri${u.id}`] && <span style={{ marginLeft: 8 }}><input style={{ ...piccolo, width: 220 }} placeholder="motivo (obbligatorio)" value={scelte[`s${u.id}`] || ""} onChange={e => setScelte(x => ({ ...x, [`s${u.id}`]: e.target.value }))} />
              <button style={{ ...btn(true, C.red), height: 28, marginLeft: 6 }} disabled={!(scelte[`s${u.id}`] || "").trim() || !!lavoro} onClick={() => separa(u.id, scelte[`s${u.id}`])}>Separa</button></span>}
          </div>)}
        </>}
        <div style={{ fontWeight: 700, fontSize: 13, marginTop: 10 }}>Documenti da scansione: cercare il digitale ({daFare.distScan.length + daFare.estScan.length})</div>
        {daFare.distScan.length + daFare.estScan.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted }}>Nessuno.</div> : <>
          {daFare.distScan.map(d => <div key={`d${d.id}`} style={riga}>Distinta n. {d.id} del {dataIt(d.data)} — {conti.find(c => c.id === d.conto_id)?.nome || ""} — {euro(d.totale)} — {d.modello || ""}: scaricare da Smart CBI il PDF digitale e leggerlo qui (prende il posto della scansione).</div>)}
          {daFare.estScan.map(d => <div key={`e${d.id}`} style={riga}>{d.tipo} n. {d.id} dal {dataIt(d.periodo_dal)} al {dataIt(d.periodo_al)} — {conti.find(c => c.id === d.conto_id)?.nome || ""}: scaricare il documento digitale e leggerlo qui (lo sostituisce chi gestisce i conti).</div>)}
        </>}
      </div>}
    </div>
  );
}

// ── Modulo della distinta: ogni dato con la sua spunta «confermato»; cambiare un dato toglie la sua spunta (R3) ──────────────
function ModuloDistinta({ f, conti, aggiorna, controlla, spunta, piccolo, gestore, nonDistinta }) {
  const m = f.form;
  const setM = cambi => aggiorna(f.id, x => ({ form: { ...x.form, ...cambi } }));
  const cambiaM = (campo, valore) => aggiorna(f.id, x => ({ form: { ...x.form, [campo]: valore, conferme: { ...x.form.conferme, [campo]: false } } }));
  const cambiaR = (i, campo, valore) => aggiorna(f.id, x => ({ form: { ...x.form, righe: x.form.righe.map((r, k) => k === i ? { ...r, [campo]: valore, conferme: { ...r.conferme, [campo]: false } } : r) } }));
  const setConf = (chiave, v) => setM({ conferme: { ...m.conferme, [chiave]: v } });
  const setConfR = (i, chiave, v) => aggiorna(f.id, x => ({ form: { ...x.form, righe: x.form.righe.map((r, k) => k === i ? { ...r, conferme: { ...r.conferme, [chiave]: v } } : r) } }));
  const togli = i => aggiorna(f.id, x => ({ form: { ...x.form, righe: x.form.righe.filter((_, k) => k !== i) } }));
  const aggiungi = () => aggiorna(f.id, x => ({ form: { ...x.form, righe: [...x.form.righe, nuovoBonifico({ data_esecuzione: x.form.data || "" })] } }));
  const { prob, somma } = controlla(f);
  const incerto = (r, c) => r.sicuri && r.sicuri[c] === false ? { borderColor: C.yellow, background: "#FFF8E1" } : {};
  return <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
    <div style={{ flex: "1 1 520px", minWidth: 0 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{f.daScansione ? "Distinta da scansione" : "Distinta digitale"}: confrontare ogni dato con il documento e spuntare «confermato». Se si cambia un dato, la spunta si toglie.</div>
      {m.avvisi?.map((a, i) => <div key={i} style={{ fontSize: 12, color: "#D9822B" }}>⚠️ {a}</div>)}
      {f.sostituisce && !f.scansioneConTesto && <div style={{ fontSize: 12.5, fontWeight: 700, color: gestore ? C.blue : C.red }}>Probabilmente prenderà il posto della distinta da scansione n. {f.sostituisce.id} del {dataIt(f.sostituisce.data)} ({euro(f.sostituisce.totale)}): le unioni ai pagamenti passano a questa. {gestore ? "" : "La sostituzione la fa chi gestisce i conti."}</div>}
      {!f.daScansione && <label style={{ fontSize: 12, display: "block", margin: "4px 0" }}><input type="checkbox" checked={!!f.scansioneConTesto} onChange={e => aggiorna(f.id, { scansioneConTesto: e.target.checked })} /> È una distinta stampata e poi scansionata (resta «da scansione»)</label>}
      {nonDistinta && <button style={{ ...btn(false), height: 26, fontSize: 11.5, marginBottom: 4 }} onClick={nonDistinta}>Non è una distinta: leggi le righe come estratto o lista</button>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "6px 0" }}>
        <select style={piccolo} value={m.conto_id} onChange={e => cambiaM("conto_id", e.target.value ? Number(e.target.value) : "")}><option value="">— conto ordinante —</option>{conti.filter(c => c.tipo === "banca").map(c => <option key={c.id} value={c.id}>{c.nome} (…{String(c.iban || "").slice(-4)})</option>)}</select>
        {spunta(m.conferme.conto_id, v => setConf("conto_id", v))}
        <span style={{ fontSize: 12 }}>Data</span><input type="date" style={piccolo} value={m.data} onChange={e => cambiaM("data", e.target.value)} />
        {spunta(m.conferme.data, v => setConf("data", v))}
        <span style={{ fontSize: 12 }}>Totale stampato €</span><input style={{ ...piccolo, width: 110 }} placeholder="dal documento" value={m.totale} onChange={e => cambiaM("totale", e.target.value)} />
        {spunta(m.conferme.totale, v => setConf("totale", v))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        <input style={{ ...piccolo, width: 220 }} placeholder="modello" value={m.modello} onChange={e => setM({ modello: e.target.value })} />
        <input style={{ ...piccolo, width: 220 }} placeholder="riferimento (MsgId, CRO)" value={m.riferimento} onChange={e => setM({ riferimento: e.target.value })} />
      </div>
      {m.righe.map((r, i) => <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, marginBottom: 6, fontSize: 12 }}>
        <b>Bonifico {i + 1}</b> <button style={{ ...btn(false, C.red), height: 22, fontSize: 11, marginLeft: 8 }} onClick={() => togli(i)}>Togli questo bonifico</button>
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 90px", gap: 6, alignItems: "center", marginTop: 4 }}>
          <span>Beneficiario</span><input style={{ ...piccolo, ...incerto(r, "beneficiario") }} value={r.beneficiario} onChange={e => cambiaR(i, "beneficiario", e.target.value)} />{spunta(r.conferme.beneficiario, v => setConfR(i, "beneficiario", v))}
          <span>Importo €</span><input style={{ ...piccolo, ...incerto(r, "importo") }} value={r.importo} onChange={e => cambiaR(i, "importo", e.target.value)} />{spunta(r.conferme.importo, v => setConfR(i, "importo", v))}
          <span>Esecuzione</span><input type="date" style={{ ...piccolo, ...incerto(r, "data_esecuzione") }} value={r.data_esecuzione} onChange={e => cambiaR(i, "data_esecuzione", e.target.value)} />{spunta(r.conferme.data_esecuzione, v => setConfR(i, "data_esecuzione", v))}
          <span>Causale</span><input style={{ ...piccolo, ...incerto(r, "causale") }} placeholder="se è scritta a mano, scriverla qui" value={r.causale} onChange={e => cambiaR(i, "causale", e.target.value)} />{spunta(r.conferme.causale, v => setConfR(i, "causale", v))}
          <span>IBAN</span><input style={{ ...piccolo, ...(r.iban && !ibanValido(r.iban) ? { borderColor: C.red } : {}) }} placeholder="se stampato" value={r.iban} onChange={e => cambiaR(i, "iban", e.target.value.toUpperCase().replace(/\s/g, ""))} />
            {r.iban ? spunta(r.conferme.iban, v => setConfR(i, "iban", v), ibanValido(r.iban) ? "confermato" : "non valido") : <span style={{ fontSize: 11, color: C.muted }}>non stampato</span>}
          <span>Esito della banca</span><select style={piccolo} value={r.esito} onChange={e => cambiaR(i, "esito", e.target.value)}><option value="">non stampato</option><option value="accettato">accettato / inviato</option><option value="eseguito">eseguito / consegnato</option><option value="rifiutato">rifiutato</option></select>
            {r.esito ? spunta(r.conferme.esito, v => setConfR(i, "esito", v)) : <span />}
          <span>CRO</span><input style={piccolo} placeholder="se stampato" value={r.cro} onChange={e => cambiaR(i, "cro", e.target.value.replace(/\D/g, ""))} />
            {r.cro ? spunta(r.conferme.cro, v => setConfR(i, "cro", v)) : <span />}
        </div>
      </div>)}
      <button style={{ ...btn(false), height: 26, fontSize: 11.5, marginBottom: 6 }} onClick={aggiungi}>➕ Aggiungi un bonifico</button>
      {f.testo && <details style={{ fontSize: 11.5, marginBottom: 6 }}><summary style={{ cursor: "pointer", color: C.muted }}>Testo letto {f.daScansione ? "dalla lettura ottica" : "dal PDF"}</summary><pre className="testo-letto" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{f.testo}</pre></details>}
      <div style={{ fontSize: 12.5, fontWeight: 700, color: prob.length ? C.red : C.green }}>{prob.length ? `Per registrare: ${prob.slice(0, 5).join("; ")}${prob.length > 5 ? ` (e altri ${prob.length - 5})` : ""}` : `Pronta: ${m.righe.length} bonifici, totale ${euro(somma / 100)}. Si registra con «Registra».`}</div>
    </div>
    {f.pagineOcr?.length > 0 && <div style={{ flex: "1 1 420px", maxHeight: 620, overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>{f.pagineOcr.map(p => <img key={p.numero} src={p.immagine} alt={`pagina ${p.numero}`} style={{ width: "100%", display: "block" }} />)}</div>}
  </div>;
}

// ── Modulo delle righe di un estratto o di una lista della carta da scansione ─────────────────────────
function ModuloRighe({ f, conti, aggiorna, controlla, spunta, piccolo, occupato }) {
  const m = f.form;
  const setM = cambi => aggiorna(f.id, x => ({ form: { ...x.form, ...("controllato" in cambi ? {} : { controllato: false }), ...cambi }, stato: "attesa" }));
  const setR = (k, cambi) => aggiorna(f.id, x => ({ form: { ...x.form, controllato: false, righe: x.form.righe.map(r => r.k === k ? { ...r, ...cambi } : r) }, stato: "attesa" }));
  const aggiungi = () => setM({ righe: [...m.righe, { k: Date.now(), includi: true, data: "", descrizione: "", verso: "uscita", importo: "", pagina: 1, sicuro: false, confermata: false, note: ["aggiunta a mano"] }], controllato: false });
  const incluse = m.righe.filter(r => r.includi);
  const totale = incluse.reduce((t, r) => t + (r.verso === "entrata" ? 1 : -1) * Math.round((Number(String(r.importo).replace(/\./g, "").replace(",", ".")) || 0) * 100), 0);
  return <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
    <div style={{ flex: "1 1 640px", minWidth: 0 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Righe lette con la lettura ottica: confrontarle con l'immagine. Le righe gialle sono incerte.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6, fontSize: 12 }}>
        <select style={piccolo} value={m.tipo} onChange={e => setM({ tipo: e.target.value })}><option value="">— che documento è —</option><option value="estratto conto">Estratto conto</option><option value="lista movimenti della carta">Lista movimenti della carta</option></select>
        <select style={piccolo} value={m.conto_id} onChange={e => setM({ conto_id: e.target.value ? Number(e.target.value) : "" })}><option value="">— conto —</option>{conti.filter(c => !m.tipo || TIPO_DOCUMENTO_PER_CONTO[c.tipo] === m.tipo).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
        dal <input type="date" style={piccolo} value={m.dal} onChange={e => setM({ dal: e.target.value })} /> al <input type="date" style={piccolo} value={m.al} onChange={e => setM({ al: e.target.value })} />
        {m.tipo === "estratto conto" && <>saldo iniziale <input style={{ ...piccolo, width: 110 }} value={m.saldo_iniziale} onChange={e => setM({ saldo_iniziale: e.target.value })} /> saldo finale <input style={{ ...piccolo, width: 110 }} value={m.saldo_finale} onChange={e => setM({ saldo_finale: e.target.value })} /></>}
      </div>
      <div style={{ maxHeight: 460, overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead><tr style={{ background: "#F1EFE8" }}>{["Usa", "Data", "Descrizione", "Entrata/uscita", "Importo €", "Pag.", "Confermata"].map(h => <th key={h} style={{ padding: 4, textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>{m.righe.map(r => <tr key={r.k} style={{ background: !r.includi ? "#eee" : r.sicuro ? "transparent" : "#FFF8E1", borderBottom: `1px solid ${C.border}` }} title={r.note?.join("; ") || ""}>
            <td style={{ padding: 3 }}><input type="checkbox" checked={r.includi} onChange={e => setR(r.k, { includi: e.target.checked })} /></td>
            <td style={{ padding: 3 }}><input type="date" style={{ ...piccolo, width: 130 }} value={r.data || ""} onChange={e => setR(r.k, { data: e.target.value, confermata: false })} /></td>
            <td style={{ padding: 3 }}><input style={{ ...piccolo, width: "100%" }} value={r.descrizione} onChange={e => setR(r.k, { descrizione: e.target.value, confermata: false })} /></td>
            <td style={{ padding: 3 }}><select style={piccolo} value={r.verso} onChange={e => setR(r.k, { verso: e.target.value, confermata: false })}><option value="uscita">uscita</option><option value="entrata">entrata</option></select></td>
            <td style={{ padding: 3 }}><input style={{ ...piccolo, width: 90, textAlign: "right" }} value={r.importo} onChange={e => setR(r.k, { importo: e.target.value, confermata: false })} /></td>
            <td style={{ padding: 3 }}><input style={{ ...piccolo, width: 44 }} value={r.pagina} onChange={e => setR(r.k, { pagina: Number(e.target.value) || 1, confermata: false })} /></td>
            <td style={{ padding: 3 }}>{r.includi && spunta(r.confermata, v => setR(r.k, { confermata: v }), "sì")}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6, fontSize: 12.5 }}>
        <button style={btn(false)} onClick={aggiungi}>➕ Aggiungi una riga</button>
        <span>{incluse.length} righe usate, movimenti {totale >= 0 ? "+" : "−"}{euro(Math.abs(totale) / 100)}</span>
        <label style={{ fontWeight: 700 }}><input type="checkbox" checked={!!m.controllato} onChange={e => setM({ controllato: e.target.checked })} /> Ho confrontato ogni riga con l'immagine</label>
        <button style={btn(true)} disabled={occupato} onClick={controlla}>Controlla</button>
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: f.stato === "verde" ? C.green : C.red, marginTop: 4 }}>{f.motivo}</div>
    </div>
    {f.pagineOcr?.length > 0 && <div style={{ flex: "1 1 380px", maxHeight: 640, overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>{f.pagineOcr.map(p => <img key={p.numero} src={p.immagine} alt={`pagina ${p.numero}`} style={{ width: "100%", display: "block" }} />)}</div>}
  </div>;
}
