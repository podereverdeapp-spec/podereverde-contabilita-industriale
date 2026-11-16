// Versione 384 (decisione «B» del Dott. Bizzarri del 16/11/2026 ore 11:19): in «Leggi le Fatture di Aruba» un tasto facoltativo
// «Archivia nel cloud», come per le fatture passive. Dopo «Registra la lettura», da un computer che raggiunge la cartella FATTURE ATTIVE
// (Chrome o Edge): XML e PDF in FATTURE ATTIVE\anno\CLIENTE\XML e \PDF (autofatture in AUTOFATTURE), il PDF anche nel programma,
// controllo che ogni fattura valida del Report sia nel programma, copia dei file scelti in SCARICHI ARUBA\anno (riletta e identica),
// e solo allora i file escono da FATTURE ATTIVE DA SMISTARE (se sono lì e identici byte per byte).
// Regole, nomi e controlli sono quelli della scheda «Fatture di vendita» (VenditeArrivate.jsx, versioni 377–381), riusati: niente di nuovo
// sul database, nessuna procedura «Prepara la cartella» (la cartella è già preparata: codice in ci_parametri).
import { useRef, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { md5 } from "./md5";
import { cartella, leggiFile, scriviVerificato, cancellaOriginale } from "./archivioF24";
import { caricaArchivio, chiaveNumero } from "./calcoloAruba";
import { caricaPdf } from "./pdfFatture";
import { FILE_RICONOSCIMENTO_ATTIVE, leggiRiconoscimentoAttive, nomeArchivioVendita, contiVendite, doppioniVendite } from "./VenditeArrivate";

const PARAMETRO_CODICE = "codice_cartella_fatture_attive";
const senzaIT = p => String(p || "").toUpperCase().replace(/^IT/, "").replace(/\s/g, "");
const leggiTesto = b => (b[0] === 0xff && b[1] === 0xfe ? new TextDecoder("utf-16le").decode(b.subarray(2)) : new TextDecoder("utf-8").decode(b).replace(/^﻿/, ""));
const dataIt = d => { const s = String(d || "").slice(0, 10); const [a, m, g] = s.split("-"); return g ? `${g}/${m}/${a}` : (s || "—"); };
const COLORI = { verde: "#E3F2E1", arancione: "#FFF1DC", rosso: "#FBE1DE" };
async function fileDentroCartella(dir, base = "") {
  const out = [];
  for await (const [n, h] of dir.entries()) { if (/^(desktop\.ini|Thumbs\.db)$/i.test(n) || n.startsWith("~$")) continue; if (h.kind === "file") out.push(base ? `${base}\\${n}` : n); else out.push(...await fileDentroCartella(h, base ? `${base}\\${n}` : n)); }
  return out;
}
async function haGliAnni(h) { const nomi = new Set(); for await (const [n, x] of h.entries()) if (x.kind === "directory") nomi.add(n); return nomi.has("2019") && nomi.has("2026"); }

// gli stessi controlli di VenditeArrivate.verificaCartella (senza la preparazione): null = cartella giusta
export async function controllaCartellaAttive(h) {
  if (h.name !== "FATTURE ATTIVE") return `È stata scelta la cartella «${h.name}»: si sceglie la cartella «FATTURE ATTIVE» dentro «00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE» (quella che contiene le cartelle 2019 … 2026 e FATTURE ATTIVE DA SMISTARE).`;
  if (!(await haGliAnni(h))) return "Nella cartella scelta non ci sono le cartelle degli anni 2019 … 2026: non è la cartella FATTURE ATTIVE di Podere Verde.";
  const { data: par, error } = await supabase.from("ci_parametri").select("valore").eq("chiave", PARAMETRO_CODICE).maybeSingle();
  if (error) return `Lettura del codice della cartella: ${error.message}`;
  if (!par?.valore) return "Nel programma non c'è il codice della cartella delle fatture di vendita: va avvisato il Dott. Bizzarri.";
  let testo = null;
  try { testo = leggiTesto(await leggiFile(h, `FATTURE ATTIVE DA SMISTARE\\${FILE_RICONOSCIMENTO_ATTIVE}`)); } catch { testo = null; }
  if (testo == null) return `In «FATTURE ATTIVE\\FATTURE ATTIVE DA SMISTARE» non c'è il file «${FILE_RICONOSCIMENTO_ATTIVE}»: questa non è la cartella in uso.`;
  const r = leggiRiconoscimentoAttive(testo);
  if (r.dismessa) return "Il file di riconoscimento dice «CARTELLA DISMESSA»: questa non è la cartella in uso.";
  if (!r.ok) return "Il file di riconoscimento non dice «Podere Verde, 15117871002, FATTURE ATTIVE».";
  if (r.codice !== par.valore) return `Il codice del file (${r.codice}) è diverso da quello del programma (${par.valore}): non è la cartella giusta.`;
  let rimasti = null; try { rimasti = await fileDentroCartella(await cartella(h, "PROGRAMMA")); } catch { rimasti = null; }
  if (rimasti && rimasti.length) return `In «FATTURE ATTIVE\\PROGRAMMA» ci sono ancora ${rimasti.length} file: vanno spostati in «FATTURE ATTIVE DA SMISTARE» prima di archiviare.`;
  return null;
}

// l: la lettura di leggiFileAruba (fatture, autofatture, elenco del Report); file: i file scelti [{ nome, bytes, md5 }]
export default function ArchivioVenditeCloud({ l, file, onLavoro = null }) {
  const [passo, setPasso] = useState("");
  const [esito, setEsito] = useState(null);
  const occupato = useRef(false);
  const conFinestra = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

  const archivia = async () => {
    if (occupato.current) return;
    occupato.current = true;
    if (onLavoro) onLavoro(true);
    const e = { scritti: [], gia: [], pdfProgramma: 0, pdfGia: 0, pdfNonCollegati: [], mancanti: [], scarichi: [], tolti: [], errori: [], fermo: [], cartellaNo: null };
    let annullato = false;
    try {
      let radice;
      try { radice = await window.showDirectoryPicker({ id: "fatture-attive-podere-verde", mode: "readwrite" }); }
      catch (er) { if (er?.name !== "AbortError") e.errori.push(`La finestra per scegliere la cartella non si è aperta: ${er.message}`); else { annullato = true; return; } }
      if (radice) {
        const problema = await (async () => { try { return await controllaCartellaAttive(radice); } catch (er) { return `La cartella scelta non si legge: ${er.message}`; } })();
        if (problema) { e.cartellaNo = problema; return; }
        setPasso("Leggo il programma…");
        const { attive, emesse, clienti } = await caricaArchivio();
        // 1. XML e PDF nell'archivio del cloud, e il PDF nel programma (come «Archivia» della scheda «Fatture di vendita»)
        const documenti = [...l.fatture.map(f => ({ f, auto: false })), ...l.autofatture.map(a => ({ f: a, auto: true }))];
        for (const { f, auto } of documenti) {
          const pivaDoc = auto ? "" : senzaIT(f.cliente?.partitaIva);
          const clienteProg = pivaDoc ? (clienti || []).filter(c => senzaIT(c.partita_iva) === pivaDoc).sort((a, b) => a.id - b.id)[0] : null;
          const n = nomeArchivioVendita(f, auto, clienteProg?.nome || "");
          try {
            setPasso(`Archivio: ${n.nome}`);
            const nomeXml = auto ? f.file : f.nomeFile;
            const est = /\.p7m$/i.test(nomeXml || "") ? ".xml.p7m" : ".xml";
            const rx = await scriviVerificato(radice, `${n.cartellaXml}${n.nome}${est}`, f.byteXml);
            (rx.esito === "Già presente uguale" ? e.gia : e.scritti).push(rx.percorso);
            if (f.pdf) {
              const rp = await scriviVerificato(radice, `${n.cartellaPdf}${n.nome}.pdf`, f.pdf.bytes);
              (rp.esito === "Già presente uguale" ? e.gia : e.scritti).push(rp.percorso);
            }
            if (!auto && f.pdf && !/scart/i.test(String(f.stato || ""))) {
              const trovate = (attive || []).filter(x => x.data === f.data && chiaveNumero(x.numero, 0) === chiaveNumero(f.numero, 0) && Math.abs(Number(x.totale_lordo) - Number(f.totale)) < 0.015);
              if (trovate.length !== 1) { e.pdfNonCollegati.push(`${f.numero} del ${dataIt(f.data)} (${trovate.length ? "più fatture con lo stesso numero" : "non trovata nel programma con lo stesso totale"})`); continue; }
              const { data: gia, error: eP } = await supabase.from("ci_pdf_fatture").select("id").eq("fattura_id", trovate[0].id).limit(1);
              if (eP) throw new Error(`PDF nel programma: ${eP.message}`);
              if ((gia || []).length) e.pdfGia++;
              else { await caricaPdf({ id: trovate[0].id, data: trovate[0].data }, new File([f.pdf.bytes], `${n.nome}.pdf`, { type: "application/pdf" })); e.pdfProgramma++; }
            }
          } catch (er) { e.errori.push(`${f.numero}: ${er.message}`); }
        }
        // 2. ogni fattura valida del Report è nel programma? (come «Chiusura» della scheda «Fatture di vendita»)
        const nelProgramma = new Set([...attive.map(x => chiaveNumero(x.numero, String(x.data).slice(0, 4))), ...emesse.filter(x => x.stato === "emessa").map(x => chiaveNumero(x.numero, x.anno))]);
        const auto = new Set(l.autofatture.map(a => chiaveNumero(a.numero, String(a.data).slice(0, 4))));
        const viste = new Set();
        for (const r of (l.elenco || []).filter(r => !/scart/i.test(String(r.stato || "")) && !auto.has(chiaveNumero(r.numero, String(r.data).slice(0, 4))))) {
          const k = chiaveNumero(r.numero, String(r.data).slice(0, 4));
          if (viste.has(k)) e.mancanti.push(`${r.numero} del ${dataIt(r.data)} (due volte valida nel Report)`);
          else if (!nelProgramma.has(k)) e.mancanti.push(`${r.numero} del ${dataIt(r.data)}`);
          viste.add(k);
        }
        if (!(l.elenco || []).length) e.fermo.push("fra i file scelti non c'è il Report di Aruba: non posso controllare che tutto sia nel programma");
        // come la scheda «Fatture di vendita» (VenditeArrivate, righe 246–255 e contiVendite): file o voci che lo scarico non spiega,
        // e conti Report = XML = PDF per anno; finché non tornano, niente esce da FATTURE ATTIVE DA SMISTARE (ricontrollo, A1 e A2)
        const nonSpiegati = [
          ...(l.scartati || []).map(x => `${x.file}: ${x.motivo}`),
          ...(l.pdfSenzaFattura || []).map(x => `PDF senza fattura: ${x.nome}`),
          ...(l.mancantiNeiFile || []).map(x => `nel Report ma senza XML: ${x.numero} del ${dataIt(x.data)}`),
          ...l.fatture.filter(f => !f.inElenco).map(f => `XML senza riga nel Report: ${f.numero} del ${dataIt(f.data)}`),
          ...doppioniVendite(l),
        ];
        if (nonSpiegati.length) { e.nonSpiegati = nonSpiegati; e.fermo.push(`ci sono ${nonSpiegati.length} file o voci che lo scarico non spiega`); }
        const contiAnni = contiVendite(l).anni.filter(c => !c.torna);
        if (contiAnni.length) e.fermo.push(contiAnni.map(c => `${c.anno}: Report ${c.report}, XML ${c.xml}, PDF ${c.pdf}`).join("; ") + " (non tornano)");
        if (e.mancanti.length) e.fermo.push(`${e.mancanti.length} fatture del Report non sono nel programma`);
        if (e.errori.length) e.fermo.push("ci sono stati errori nell'archivio");
        // 3. i file scelti in SCARICHI ARUBA\anno (copia riletta e identica), poi fuori da FATTURE ATTIVE DA SMISTARE
        if (!e.fermo.length) {
          const anni = [...new Set([...l.fatture, ...l.autofatture].map(f => String(f.data || "").slice(0, 4)).filter(Boolean))];
          const anno = anni.length === 1 ? anni[0] : "PIU ANNI";
          // solo gli scarichi: mai il file di riconoscimento della cartella, i file temporanei di Office o i provvisori del programma
          for (const f of file.filter(x => x.nome !== FILE_RICONOSCIMENTO_ATTIVE && !x.nome.startsWith("~$") && !/^(PROVVISORIO|PROVV) /.test(x.nome))) {
            try {
              setPasso(`Conservo «${f.nome}» in SCARICHI ARUBA…`);
              const r = await scriviVerificato(radice, `SCARICHI ARUBA\\${anno}\\${f.nome}`, f.bytes);
              if (md5(await leggiFile(radice, r.percorso)) !== f.md5) throw new Error(`la copia di «${f.nome}» nell'archivio non è identica: l'originale resta`);
              e.scarichi.push(r.percorso);
              let c;
              try { c = await cancellaOriginale(radice, `FATTURE ATTIVE DA SMISTARE\\${f.nome}`, f.md5); }
              catch (er) { c = `non tolto (${er.message})`; }
              e.tolti.push(`${f.nome}: ${c === "Cancellato" ? "tolto da FATTURE ATTIVE DA SMISTARE" : c === "Non c'era più" ? "non è in FATTURE ATTIVE DA SMISTARE (scelto da un'altra cartella: resta lì)" : c}`);
            } catch (er) { e.errori.push(er.message); }
          }
        }
      }
    } catch (er) { e.errori.push(er.message); }
    finally { occupato.current = false; setPasso(""); if (onLavoro) onLavoro(false); if (!annullato) setEsito(e); }
  };

  const bottone = attivo => ({ background: attivo ? C.primary : C.muted, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: attivo ? "pointer" : "not-allowed" });
  const male = esito && (esito.cartellaNo || esito.errori.length || esito.fermo.length);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginTop: 14 }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>Archivia nel cloud (facoltativo)</div>
      <div style={{ fontSize: 12.5, marginBottom: 8 }}>
        Solo da un computer che raggiunge la cartella FATTURE ATTIVE del cloud, con Chrome o Edge. Si sceglie la cartella <b>FATTURE ATTIVE</b>: il programma mette ogni XML e PDF in <b>{"FATTURE ATTIVE\\anno\\NOME CLIENTE\\XML"}</b> e <b>{"…\\PDF"}</b> (le autofatture in <b>{"anno\\AUTOFATTURE"}</b>), mette il PDF anche nel programma, controlla che ogni fattura del Report sia nel programma, conserva i file scelti in <b>{"SCARICHI ARUBA\\anno"}</b> e li toglie da FATTURE ATTIVE DA SMISTARE solo se le copie sono identiche. Se questo computer non raggiunge il cloud, la lettura è registrata lo stesso: l'archivio lo fa chi raggiunge la cartella, rileggendo gli stessi file.
      </div>
      {conFinestra
        ? <button style={bottone(!passo)} disabled={!!passo} onClick={archivia}>🗄️ Archivia nel cloud</button>
        : <div style={{ fontSize: 12, padding: 8, background: COLORI.arancione, borderRadius: 8 }}>Con questo browser l'archivio nel cloud non si può fare (serve Chrome o Edge).</div>}
      {passo && <div style={{ marginTop: 8, fontSize: 12 }}>⏳ {passo}</div>}
      {esito && <div style={{ marginTop: 8, padding: 8, borderRadius: 8, fontSize: 12, background: male ? COLORI.rosso : COLORI.verde }}>
        {esito.cartellaNo ? <>⛔ {esito.cartellaNo} Non ho scritto niente.</> : <>
          File scritti nel cloud: {esito.scritti.length} · già presenti uguali: {esito.gia.length} · PDF messi nel programma: {esito.pdfProgramma}{esito.pdfGia ? ` (già c'erano: ${esito.pdfGia})` : ""}
          {esito.pdfNonCollegati.length > 0 && <div>PDF non messi nel programma: {esito.pdfNonCollegati.join(" · ")}</div>}
          {esito.mancanti.length > 0 && <div>Fatture del Report non nel programma: {esito.mancanti.join(" · ")}</div>}
          {esito.nonSpiegati?.length > 0 && <div>Che cosa lo scarico non spiega: {esito.nonSpiegati.join(" · ")}</div>}
          {esito.fermo.length > 0 && <div><b>I file restano in FATTURE ATTIVE DA SMISTARE:</b> {esito.fermo.join("; ")}.</div>}
          {esito.tolti.length > 0 && <div>{esito.tolti.join(" · ")}</div>}
          {esito.errori.length > 0 && <div>Errori: {esito.errori.join(" · ")}</div>}</>}
      </div>}
    </div>
  );
}
