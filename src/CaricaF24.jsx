import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";
import { C } from "./style";
import { oggiRoma } from "./dateRoma";
import { md5, md5File } from "./md5";
import {
  leggiFileCarico, confrontaConDatabase, ordineDiCarico, leggiCartella, trovaPdf, allarmiScadenze, completaFestivi,
  euro, dataIt, LIMITE_PDF,
} from "./calcoloCaricoF24";

// Versione 333 (30/10/2026, ordine del Dott. Bizzarri): pagina «Carica F24», nella cartella «Carico nel programma».
// Porta nel database gli F24 del file di carico preparato dal «Prompt per smistamento F24» e i loro PDF nell'archivio «f24».
// Ogni delega entra con tutte le sue righe in un'unica operazione (funzione ci_f24_salva_delega): o entra tutta o non entra niente.
// Prima i dati, poi i PDF: se un PDF non si carica, la delega resta registrata e il PDF è segnalato.

const CAMPI_DB = ["codice_delega", "nome_file_pdf", "nome_file_ricevuto", "delega_nel_file_ricevuto", "oggetto", "data_scadenza", "totale_debito",
  "totale_credito", "saldo", "tipo_pagamento", "stato", "data_pagamento", "codice_banca_sportello", "banca_addebito", "protocollo_telematico",
  "nome_file_quietanza", "nome_file_contabile", "numero_operazione_banca", "note", "corrisponde", "avvisi"];
const CAMPI_RIGA = ["sezione", "codice_tributo", "descrizione_codice", "codice_ente_sede", "matricola_riferimento", "rateazione_mese", "anno_riferimento",
  "periodo_dal", "periodo_al", "importo_debito", "importo_credito", "trattamento", "codice_confermato_da"];
// i tre PDF di una delega: nome nel file di carico → nome nell'archivio «f24» (cartella = Codice delega) e colonna dell'impronta
const PDF = [
  { tipo: "F24", nome: "nome_file_pdf", archivio: "F24.pdf", impronta: "md5_pdf" },
  { tipo: "Quietanza", nome: "nome_file_quietanza", archivio: "quietanza.pdf", impronta: "md5_quietanza" },
  { tipo: "Contabile della banca", nome: "nome_file_contabile", archivio: "contabile.pdf", impronta: "md5_contabile" },
];

const sx = {
  pagina: { padding: 20, maxWidth: 1150, margin: "0 auto", color: C.text },
  riquadro: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 18 },
  titolo: { color: C.primary, fontSize: 17, fontWeight: 700, margin: "0 0 8px" },
  rosso: { background: "#FDECEA", border: "1px solid #C0392B", color: "#7B1F17", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13 },
  arancio: { background: "#FFF1DC", border: "1px solid #D4880F", color: "#7A4A00", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13 },
  verde: { background: "#E8F3EA", border: `1px solid ${C.green}`, color: "#1F4D2B", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13 },
  tabella: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { textAlign: "left", padding: "6px 8px", borderBottom: `2px solid ${C.border}`, color: C.muted, fontWeight: 700, whiteSpace: "nowrap" },
  td: { padding: "6px 8px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" },
  bottone: attivo => ({ background: attivo ? C.primary : "#B8B3A7", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 14, cursor: attivo ? "pointer" : "default" }),
  scelta: { display: "inline-block", background: C.primary, color: "#fff", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" },
};

// testo di un file .txt: UTF-16 se comincia con il segno FF FE o FE FF (lo scrive così PowerShell), altrimenti UTF-8
function leggiTestoFile(b) {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  return new TextDecoder("utf-8").decode(b).replace(/^\uFEFF/, "");
}

const coloreEsito = e => (!e ? C.muted : e === "BLOCCO" || e === "Errore nel file" || e.startsWith("Rifiutata") ? C.red : e === "Uguale" ? C.muted : e.startsWith("Spostato") ? C.muted : C.green);

function ListaScadenze({ titolo, righe, stile }) {
  if (!righe.length) return null;
  return (
    <div style={stile}>
      <b>{titolo}</b>
      <table style={{ ...sx.tabella, marginTop: 6 }}>
        <thead><tr><th style={sx.th}>Scadenza</th><th style={sx.th}>Oggetto</th><th style={sx.th}>Saldo</th><th style={sx.th}>Stato</th><th style={sx.th}>Codice delega</th></tr></thead>
        <tbody>{righe.map(x => (
          <tr key={x.codice_delega}><td style={sx.td}>{dataIt(x.data_scadenza)}</td><td style={sx.td}>{x.oggetto}</td><td style={sx.td}>{euro(x.saldo)} €</td><td style={sx.td}>{x.stato}</td><td style={sx.td}>{x.codice_delega}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function CaricaF24() {
  const [db, setDb] = useState(null);           // { f24, righe, codici, festivi }
  const [erroreDb, setErroreDb] = useState("");
  const [operatore, setOperatore] = useState("");
  const [file, setFile] = useState(null);       // { nome, anno, md5, deleghe, anomalie, soloNelProgramma }
  const [erroreFile, setErroreFile] = useState("");
  const [cartella, setCartella] = useState(null); // { errori, pdf: Map codice → elenco PDF }
  const [lettura, setLettura] = useState("");
  const [carico, setCarico] = useState(null);   // { inCorso, fatte, totale, risultati, esito, id, errore }
  const giro = useRef(0); // ogni nuova scelta del file annulla le letture ancora in corso di quella vecchia

  async function leggiDatabase() {
    setErroreDb("");
    const [a, b, c, d] = await Promise.all([
      fetchAllPages((da, x) => supabase.from("ci_f24").select("*").order("id").range(da, x)),
      fetchAllPages((da, x) => supabase.from("ci_f24_righe").select("*").order("id").range(da, x)),
      fetchAllPages((da, x) => supabase.from("ci_codici_tributo").select("sezione, codice, descrizione, trattamento").order("id").range(da, x)),
      fetchAllPages((da, x) => supabase.from("ci_festivi").select("data").order("data").range(da, x)),
    ]);
    const err = [a, b, c, d].find(x => x.error);
    if (err) { setErroreDb(`Lettura del database non riuscita: ${err.error.message}`); return null; }
    const nuovo = { f24: a.data, righe: b.data, codici: c.data, festivi: new Set(d.data.map(x => x.data)) };
    setDb(nuovo);
    return nuovo;
  }
  useEffect(() => { leggiDatabase(); }, []);

  const oggi = oggiRoma();
  // festivi: quelli del database; se manca l'anno di oggi o il successivo, quelli calcolati, con l'avviso
  const cal = db ? completaFestivi(db.festivi, [+oggi.slice(0, 4), +oggi.slice(0, 4) + 1]) : null;
  const allarmi = db ? allarmiScadenze(db.f24, oggi, cal.festivi) : null;
  const festiviMancanti = cal?.mancanti.length ? cal.mancanti.join(" e ") : "";

  // ── Passo 1: il file di carico ──
  async function sceltoFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    const mio = ++giro.current;
    setErroreFile(""); setFile(null); setCartella(null); setCarico(null); setLettura("");
    if (!f) return;
    const m = f.name.match(/^F24_carico_(\d{4})\.xlsx$/);
    if (!m) { setErroreFile(`Il file «${f.name}» non è un file di carico: il nome deve essere «F24_carico_AAAA.xlsx», preso dalla cartella «F24\\Carichi».`); return; }
    try {
      const base = await leggiDatabase(); // sempre i dati di adesso: qualcuno può aver caricato o pagato nel frattempo
      if (!base) return;
      const buffer = new Uint8Array(await f.arrayBuffer());
      const anno = +m[1];
      const { deleghe, anomalie } = leggiFileCarico(XLSX, buffer, anno);
      const { soloNelProgramma } = confrontaConDatabase(deleghe, base.f24, base.righe, anno);
      const noti = new Set(base.codici.map(x => x.codice));
      const trattDb = new Map(base.codici.map(x => [x.codice, x.trattamento]));
      const codiciNuovi = new Map(), trattamentiDiversi = new Map();
      for (const d of deleghe.filter(x => !x.spostato)) for (const r of d.righe) {
        if (!r.codice_tributo) continue;
        if (!noti.has(r.codice_tributo)) codiciNuovi.set(r.codice_tributo, { ...r, codice_delega: d.codice_delega, anomalia: r.codice_confermato_da === "CODICE CONOSCIUTO" });
        else if (r.trattamento && trattDb.get(r.codice_tributo) && !r.trattamento.startsWith(trattDb.get(r.codice_tributo))) trattamentiDiversi.set(r.codice_tributo, { file: r.trattamento, db: trattDb.get(r.codice_tributo) });
      }
      if (mio !== giro.current) return;
      setFile({ nome: f.name, anno, md5: md5(buffer), deleghe, anomalie, soloNelProgramma, codiciNuovi: [...codiciNuovi.values()], trattamentiDiversi: [...trattamentiDiversi.entries()] });
    } catch (err) {
      setErroreFile(`Il file non si legge: ${err.message}`);
    }
  }

  // ── Passo 2: la cartella F24 ──
  async function sceltaCartella(e) {
    const elenco = [...(e.target.files || [])];
    e.target.value = "";
    if (!elenco.length || !file || carico) return; // dopo un carico si ricomincia dal passo 1, per avere gli esiti aggiornati
    const mio = ++giro.current, perFile = file;
    setCartella(null);
    setLettura("Lettura della cartella in corso…");
    try {
      const { mappa, errori } = leggiCartella(elenco);
      if (!errori.length) {
        const copia = mappa.get(`Carichi/${perFile.nome}`);
        if (!copia) errori.push(`Nella cartella «F24\\Carichi» non c'è il file «${perFile.nome}».`);
        else if (await md5File(copia) !== perFile.md5) errori.push(`Il file «${perFile.nome}» scelto al passo 1 non è identico a quello nella cartella «F24\\Carichi»: va scelto proprio quel file.`);
        const segnale = mappa.get("Carichi/Smistamento in corso.txt");
        const testoSegnale = segnale ? leggiTestoFile(new Uint8Array(await segnale.arrayBuffer())).trim() : "";
        if (!testoSegnale.toUpperCase().startsWith("CARICO IN CORSO"))
          errori.push(`Il file «F24\\Carichi\\Smistamento in corso.txt» dice «${testoSegnale.split(/\r?\n/)[0] || "niente"}» invece di «CARICO IN CORSO»: il carico si fa solo con il «Prompt per carico F24 nel programma», che scrive «CARICO IN CORSO» prima di farlo eseguire. Se c'è scritto «IN CORSO», uno smistamento è in corso: non caricare.`);
      }
      const pdf = new Map();
      if (!errori.length) {
        for (const d of ordineDiCarico(perFile.deleghe)) {
          const lista = [];
          for (const p of PDF) {
            const nome = d[p.nome];
            if (!nome) continue;
            const t = trovaPdf(mappa, d, nome);
            const giaNelProgramma = d.dbRiga?.[p.impronta] || null;
            const voce = { ...p, nomeFile: nome, percorso: t.percorso };
            if (t.mancante) {
              voce.stato = p.tipo === "F24" && d.senzaPdf ? "Non ricevuto (lo dicono le Note): entra senza PDF" : "NON TROVATO nella cartella";
              voce.problema = !(p.tipo === "F24" && d.senzaPdf);
            } else {
              voce.file = t.file; voce.byte = t.file.size;
              voce.md5 = await md5File(t.file);
              if (t.file.size > LIMITE_PDF) { voce.stato = `Più grande di 10 MB (${(t.file.size / 1048576).toFixed(1)} MB): non entra nell'archivio, resta nel cloud`; voce.problema = true; voce.oltre = true; voce.file = null; }
              else if (giaNelProgramma && giaNelProgramma === voce.md5) { voce.stato = "Già nell'archivio, identico"; voce.file = null; voce.uguale = true; }
              else if (giaNelProgramma) { voce.stato = "DIVERSO da quello già nell'archivio: non si sostituisce, va verificato"; voce.problema = true; voce.file = null; }
              else voce.stato = "Trovato: si carica";
            }
            lista.push(voce);
          }
          pdf.set(d.codice_delega, lista);
        }
      }
      if (mio !== giro.current) return; // nel frattempo è stato scelto un altro file: questa lettura non vale più
      setCartella({ errori, pdf, file: elenco.length, perFile });
    } catch (err) {
      if (mio !== giro.current) return;
      setCartella({ errori: [`Lettura della cartella non riuscita: ${err.message}`], pdf: new Map(), file: elenco.length, perFile });
    }
    setLettura("");
  }

  // ── Passo 3: il carico ──
  const daCaricare = file ? ordineDiCarico(file.deleghe) : [];
  const nonEntrano = file ? file.deleghe.filter(d => !d.spostato && (d.esito === "BLOCCO" || d.esito === "Errore nel file")) : [];
  const daPagareFuori = nonEntrano.filter(d => d.stato === "Da pagare" || d.dbRiga?.stato === "Da pagare");
  const totaleDeleghe = file ? file.deleghe.filter(d => !d.spostato).length : 0;
  const pronto = !!(db && file && !file.anomalie.length && cartella && cartella.perFile === file && !cartella.errori.length && !lettura
    && operatore.trim().length >= 5 && daCaricare.length && !carico);

  function payload(d, conCarico, caricoId, impronte) {
    const p = {};
    for (const c of CAMPI_DB) p[c] = d[c] ?? null;
    if (!d.dbRiga) p.origine = "file";
    if (conCarico) p.carico_id = caricoId;
    Object.assign(p, impronte || {});
    const righe = d.righe.map(r => Object.fromEntries(CAMPI_RIGA.map(c => [c, r[c] ?? null])));
    return { p, righe };
  }

  async function carica() {
    if (!pronto) return;
    if (!window.confirm(`Caricare ${daCaricare.length} deleghe di ${totaleDeleghe} del file ${file.nome}?${nonEntrano.length ? `\n\n${nonEntrano.length} deleghe NON entrano (blocchi o errori nel file).` : ""}`)) return;
    const blocchi = nonEntrano.map(d => `${d.codice_delega}: ${d.blocco}`).join("\n") || null;
    setCarico({ inCorso: true, fatte: 0, totale: daCaricare.length, risultati: [] });
    const { data: reg, error: eReg } = await supabase.from("ci_f24_carichi").insert({
      operatore: operatore.trim(), nome_file: file.nome, anno: file.anno, md5_file: file.md5, numero_deleghe: totaleDeleghe,
      esito: "BLOCCATO", blocchi, note: "Carico iniziato: se l'esito resta BLOCCATO con questa nota, il carico si è interrotto.",
    }).select("id").single();
    if (eReg) { setCarico({ inCorso: false, errore: `Registro dei carichi non scritto, carico non eseguito: ${eReg.message}`, risultati: [] }); return; }
    const risultati = [];
    const entrateOk = new Set(), fatte = new Set();
    // i PDF di una delega già salvata: caricamento nell'archivio, poi le impronte con una seconda chiamata
    async function pdfDi(d, ris) {
      const impronte = {};
      for (const v of cartella.pdf.get(d.codice_delega) || []) {
        if (!v.file) { ris.pdf.push({ tipo: v.tipo, esito: v.stato, problema: v.problema, grave: v.problema && !v.oltre }); continue; }
        const { error: eUp } = await supabase.storage.from("f24").upload(`${d.codice_delega}/${v.archivio}`, v.file, { upsert: true, contentType: "application/pdf" });
        if (eUp) ris.pdf.push({ tipo: v.tipo, esito: `Caricamento non riuscito: ${eUp.message}`, problema: true, grave: true });
        else { impronte[v.impronta] = v.md5; ris.impronte[v.impronta] = { tipo: v.tipo, md5: v.md5 }; ris.pdf.push({ tipo: v.tipo, esito: "Caricato nell'archivio" }); }
      }
      if (Object.keys(impronte).length) {
        const { p: p2, righe: r2_ } = payload(d, d.esito !== "Uguale", reg.id, impronte);
        const { data: e2, error: err2 } = await supabase.rpc("ci_f24_salva_delega", { p_delega: p2, p_righe: r2_ });
        if (err2) ris.pdf.push({ tipo: "Impronte", esito: `PDF caricati ma impronta non registrata: ${err2.message}`, problema: true, grave: true });
        else if (ris.esitoDb === "Uguale" && e2 !== "Uguale") ris.esitoDb = "Aggiornata (PDF)";
      }
    }
    const nuovo = c => ({ d: file.deleghe.find(x => x.codice_delega === c), esitoDb: null, errore: null, pdf: [], impronte: {} });
    for (const d of daCaricare) {
      if (fatte.has(d.codice_delega)) continue; // già salvata insieme alla sua versione corretta
      const ris = { d, esitoDb: null, errore: null, pdf: [], impronte: {} };
      const coppia = /_superato_/.test(d.nome_file_pdf || "") && d.stato === "Sostituito" && d.dbRiga?.stato !== "Sostituito" && d.sostitute?.length === 1 ? nuovo(d.sostitute[0]) : null;
      try {
        // un «Sostituito» entra solo se le deleghe che lo sostituiscono sono entrate
        const mancanti = (d.stato === "Sostituito" && !coppia ? d.sostitute || [] : []).filter(c => !entrateOk.has(c));
        if (mancanti.length) throw new Error(`non caricata perché non sono entrate le deleghe che la sostituiscono (${mancanti.join(", ")}): resta com'è nel programma`);
        const { p, righe } = payload(d, d.esito !== "Uguale", reg.id);
        if (coppia) {
          // versione corretta: la vecchia e la nuova in un'unica operazione, o entrano tutte e due o nessuna (l'allarme non si perde mai)
          const n = payload(coppia.d, coppia.d.esito !== "Uguale", reg.id);
          fatte.add(coppia.d.codice_delega);
          const { data: e, error: err } = await supabase.rpc("ci_f24_salva_versione_corretta", { p_vecchia: p, p_righe_vecchia: righe, p_nuova: n.p, p_righe_nuova: n.righe });
          if (err) { coppia.errore = `insieme alla sua versione corretta: ${err.message}`; throw new Error(err.message); }
          [ris.esitoDb, coppia.esitoDb] = String(e).split("|");
          entrateOk.add(d.codice_delega); entrateOk.add(coppia.d.codice_delega);
        } else {
          const { data: e1, error: err1 } = await supabase.rpc("ci_f24_salva_delega", { p_delega: p, p_righe: righe });
          if (err1) throw new Error(err1.message);
          ris.esitoDb = e1;
          entrateOk.add(d.codice_delega);
        }
        // poi i PDF, nella cartella dell'archivio con il nome del Codice delega
        await pdfDi(d, ris);
        if (coppia) await pdfDi(coppia.d, coppia);
      } catch (err) {
        ris.errore = err.message;
      }
      risultati.push(ris);
      if (coppia) risultati.push(coppia);
      setCarico({ inCorso: true, fatte: risultati.length, totale: daCaricare.length, risultati: [...risultati] });
    }
    const conta = {};
    for (const x of risultati) { const k = x.esitoDb || "Rifiutata dal database"; conta[k] = (conta[k] || 0) + 1; }
    for (const d of nonEntrano) { const k = d.esito === "BLOCCO" ? "Bloccata" : "Errore nel file"; conta[k] = (conta[k] || 0) + 1; }
    const spostate = file.deleghe.filter(d => d.spostato).length;
    if (spostate) conta["Spostata in un altro anno"] = spostate;
    // controllo finale: le impronte dei PDF caricati devono essere nel database (per un «Disposto» il database non le cambia)
    const dopo = await leggiDatabase();
    let controlloFinale = !!dopo;
    if (dopo) for (const x of risultati) {
      const riga = dopo.f24.find(y => y.codice_delega === x.d.codice_delega);
      for (const [col, v] of Object.entries(x.impronte)) {
        if (riga?.[col] !== v.md5) x.pdf.push({ tipo: v.tipo, esito: "PDF nell'archivio, ma la sua impronta non è nel database: da verificare", problema: true, grave: true });
      }
      if (x.esitoDb && !riga) x.pdf.push({ tipo: "Delega", esito: "Non trovata nel database dopo il carico", problema: true, grave: true });
    }
    // esito: RIUSCITO solo se tutte le deleghe sono entrate e nessun PDF ha un problema (un PDF oltre 10 MB è solo segnalato)
    const entrate = risultati.filter(x => x.esitoDb).length;
    const pdfGravi = risultati.some(x => x.pdf.some(v => v.grave));
    const esito = entrate === totaleDeleghe && !pdfGravi && controlloFinale ? "RIUSCITO" : entrate > 0 ? "PARZIALE" : "BLOCCATO";
    const rifiutate = risultati.filter(x => x.errore).map(x => `${x.d.codice_delega}: rifiutata dal database: ${x.errore}`);
    const problemiPdf = risultati.flatMap(x => x.pdf.filter(v => v.problema).map(v => `${x.d.codice_delega} ${v.tipo}: ${v.esito}`));
    const { error: eFine } = await supabase.from("ci_f24_carichi").update({
      esito, deleghe_per_esito: conta, blocchi: [blocchi, ...rifiutate].filter(Boolean).join("\n") || null,
      note: [problemiPdf.length ? `PDF da verificare:\n${problemiPdf.join("\n")}` : "", controlloFinale ? "" : "Controllo finale non eseguito: rilettura del database non riuscita."].filter(Boolean).join("\n") || null,
    }).eq("id", reg.id);
    setCarico({ inCorso: false, fatte: risultati.length, totale: daCaricare.length, risultati, esito, id: reg.id, conta,
      errore: eFine ? `Esito non scritto nel registro dei carichi (resta «BLOCCATO»): ${eFine.message}` : null });
  }

  // ── Pagina ──
  // dopo il carico: gli F24 da pagare rimasti fuori (bloccati, con errori, rifiutati dal database o non caricati)
  const fuoriDopo = carico?.esito ? [
    ...daPagareFuori,
    ...carico.risultati.filter(x => x.errore && (x.d.stato === "Da pagare" || x.d.dbRiga?.stato === "Da pagare" || /_superato_/.test(x.d.nome_file_pdf || ""))).map(x => x.d),
  ] : [];
  const perEsito = {};
  if (file) for (const d of file.deleghe) perEsito[d.esito] = (perEsito[d.esito] || 0) + 1;

  return (
    <div style={sx.pagina}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Carica F24</h1>
      <div style={{ ...sx.rosso, fontWeight: 700, fontSize: 14 }}>
        ⛔ REGOLA ZERO: si sceglie soltanto la cartella F24 di Podere Verde nel cloud della società
        (Z:\SOCIETA\SOCIETA' AGRICOLA PODERE VERDE A R.L\F24) e il suo file di carico. Nessun'altra cartella: la pagina rifiuta qualunque altra scelta.
        I documenti si salvano soltanto nelle cartelle previste.
      </div>
      <p style={{ color: C.muted, marginTop: 0 }}>
        Questa pagina si usa insieme al «Prompt per carico F24 nel programma»: Claude controlla il file di carico e dice quando premere i pulsanti.
        Passo 1: «Scegli il file», il file «F24\Carichi\F24_carico_AAAA.xlsx». Passo 2: «Scegli la cartella», la cartella «F24». Passo 3: «Carica».
        Un F24 entra con tutte le sue righe oppure non entra; prima entrano i dati, poi i PDF.
      </p>

      {erroreDb && <div style={sx.rosso}>{erroreDb}</div>}
      {festiviMancanti && <div style={sx.arancio}>Nel database mancano i giorni festivi del {festiviMancanti}: per le scadenze si usano quelli calcolati (feste nazionali, lunedì dell'Angelo, 4 ottobre). Va avvisato il Dott. Bizzarri.</div>}
      {allarmi && (
        <>
          <ListaScadenze titolo={`🔴 F24 da pagare SCADUTI (oggi è il ${dataIt(oggi)})`} righe={allarmi.scaduti} stile={sx.rosso} />
          <ListaScadenze titolo={`🔴 F24 da pagare IN SCADENZA entro il ${dataIt(allarmi.limite)} (5 giorni lavorativi)`} righe={allarmi.inScadenza} stile={sx.rosso} />
          <ListaScadenze titolo="🟠 F24 «Disposti» da più di 3 giorni lavorativi senza quietanza né contabile: l'addebito può essere stato rifiutato, verificare con la banca" righe={allarmi.disposti} stile={sx.arancio} />
        </>
      )}

      <div style={sx.riquadro}>
        <div style={sx.titolo}>Chi carica</div>
        <input value={operatore} onChange={e => setOperatore(e.target.value)} placeholder="Nome e cognome" disabled={carico?.inCorso}
          style={{ padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, width: 320, fontSize: 14 }} />
      </div>

      <div style={sx.riquadro}>
        <div style={sx.titolo}>Passo 1 — Il file di carico</div>
        <label style={carico?.inCorso ? { ...sx.scelta, background: "#B8B3A7", cursor: "default" } : sx.scelta}>Scegli il file<input type="file" accept=".xlsx" onChange={sceltoFile} disabled={carico?.inCorso} style={{ display: "none" }} /></label>
        {carico?.esito && <span style={{ marginLeft: 10, fontSize: 13, color: C.muted }}>Per un altro carico si ricomincia da qui: gli esiti si ricalcolano con i dati di adesso.</span>}
        {erroreFile && <div style={{ ...sx.rosso, marginTop: 12 }}>{erroreFile}</div>}
        {file && (
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <div><b>{file.nome}</b> — impronta MD5 {file.md5} — {totaleDeleghe} deleghe da caricare{file.deleghe.length > totaleDeleghe ? ` (più ${file.deleghe.length - totaleDeleghe} «Spostato in…», che non si caricano)` : ""}</div>
            <div style={{ color: C.muted, marginTop: 4 }}>Controllare con Claude che nome, numero di deleghe e impronta siano quelli che ha controllato lui.</div>
            {file.anomalie.length > 0 && <div style={{ ...sx.rosso, marginTop: 10 }}><b>Il file non si può caricare:</b><ul style={{ margin: "6px 0 0 18px", padding: 0 }}>{file.anomalie.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
            {daPagareFuori.length > 0 && (
              <div style={{ ...sx.rosso, marginTop: 10 }}>
                <b>🔴 F24 DA PAGARE CHE NON ENTRANO NEL PROGRAMMA: vanno pagati lo stesso, entro la scadenza.</b>
                <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>{daPagareFuori.map(d => <li key={d.codice_delega}>Scadenza {dataIt(d.data_scadenza)} — saldo {euro(d.saldo)} € — {d.nome_file_pdf}</li>)}</ul>
              </div>
            )}
            <div style={{ marginTop: 10 }}>Esiti: {Object.entries(perEsito).map(([k, n]) => `${k} ${n}`).join(" · ")}</div>
            <table style={{ ...sx.tabella, marginTop: 10 }}>
              <thead><tr><th style={sx.th}>Codice delega</th><th style={sx.th}>Nome file PDF</th><th style={sx.th}>Scadenza</th><th style={sx.th}>Saldo</th><th style={sx.th}>Stato nel file</th><th style={sx.th}>Nel programma</th><th style={sx.th}>Esito</th></tr></thead>
              <tbody>{file.deleghe.map(d => (
                <tr key={d.riga}>
                  <td style={sx.td}>{d.codice_delega}</td><td style={sx.td}>{d.nome_file_pdf}</td><td style={sx.td}>{dataIt(d.data_scadenza)}</td>
                  <td style={{ ...sx.td, textAlign: "right" }}>{euro(d.saldo)}</td><td style={sx.td}>{d.stato}</td><td style={sx.td}>{d.dbRiga?.stato || "—"}</td>
                  <td style={{ ...sx.td, color: coloreEsito(d.esito), fontWeight: 600 }}>{d.esito}{d.blocco && <div style={{ fontWeight: 400 }}>{d.blocco}</div>}{d.segnalazioni?.length > 0 && <div style={{ fontWeight: 400, color: "#7A4A00" }}>{d.segnalazioni.join(" ")}</div>}</td>
                </tr>
              ))}</tbody>
            </table>
            {file.codiciNuovi.length > 0 && (
              <div style={{ ...sx.arancio, marginTop: 12 }}>
                <b>Codici tributo che non sono nel programma.</b> Le deleghe entrano lo stesso; Claude prepara il testo SQL per inserirli, da far lanciare al Dott. Bizzarri.
                <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>{file.codiciNuovi.map(r => <li key={r.codice_tributo} style={r.anomalia ? { color: C.red, fontWeight: 600 } : undefined}>{r.codice_tributo} ({r.sezione}) — {r.descrizione_codice || "senza descrizione"} — {r.trattamento} — confermato da: {r.codice_confermato_da || "nessuno"}{r.anomalia ? " — ANOMALIA: il file dice «CODICE CONOSCIUTO» ma nel programma non c'è" : ""}</li>)}</ul>
              </div>
            )}
            {file.trattamentiDiversi.length > 0 && (
              <div style={{ ...sx.arancio, marginTop: 12 }}>
                <b>Trattamento diverso da quello del programma: vale quello del programma.</b>
                <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>{file.trattamentiDiversi.map(([k, v]) => <li key={k}>{k}: nel file «{v.file}», nel programma «{v.db}»</li>)}</ul>
              </div>
            )}
            {file.soloNelProgramma.length > 0 && (
              <div style={{ ...sx.arancio, marginTop: 12 }}>
                <b>F24 del {file.anno} che sono nel programma ma non nel file.</b> Il programma non li cancella mai.
                <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>{file.soloNelProgramma.map(x => <li key={x.codice_delega}>{x.codice_delega} — {x.nome_file_pdf} — {x.stato} — {x.normale ? "inserito a mano: normale" : "ANOMALIA: non è stato inserito a mano"}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={sx.riquadro}>
        <div style={sx.titolo}>Passo 2 — La cartella F24</div>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 0 }}>
          Si sceglie la cartella «F24» (Z:\SOCIETA\SOCIETA' AGRICOLA PODERE VERDE A R.L\F24), non una cartella al suo interno.
          Il browser chiede «Caricare N file su questo sito?»: si risponde «Carica». I file non partono tutti: il programma li legge sul computer e manda
          nell'archivio soltanto i PDF scritti nel file di carico, presi dalle cartelle degli oggetti (mai da «Da smistare» o da «Originali ricevuti»).
        </p>
        <label style={file && !carico && !lettura ? sx.scelta : { ...sx.scelta, background: "#B8B3A7", cursor: "default" }}>
          Scegli la cartella
          <input type="file" webkitdirectory="" directory="" multiple onChange={sceltaCartella} disabled={!file || !!carico || !!lettura} style={{ display: "none" }} />
        </label>
        {!file && <span style={{ marginLeft: 10, fontSize: 13, color: C.muted }}>Prima il passo 1.</span>}
        {lettura && <div style={{ marginTop: 10, fontSize: 13 }}>{lettura}</div>}
        {cartella && cartella.errori.length > 0 && <div style={{ ...sx.rosso, marginTop: 12 }}><b>Cartella non accettata:</b><ul style={{ margin: "6px 0 0 18px", padding: 0 }}>{cartella.errori.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
        {cartella && !cartella.errori.length && (
          <div style={{ marginTop: 12 }}>
            <div style={sx.verde}>Cartella F24 accettata ({cartella.file} file letti sul computer). Il file di carico nella cartella «Carichi» è identico a quello del passo 1.</div>
            <table style={sx.tabella}>
              <thead><tr><th style={sx.th}>Codice delega</th><th style={sx.th}>PDF</th><th style={sx.th}>Nome</th><th style={sx.th}>Stato</th></tr></thead>
              <tbody>{daCaricare.flatMap(d => (cartella.pdf.get(d.codice_delega) || []).map(v => (
                <tr key={d.codice_delega + v.tipo}>
                  <td style={sx.td}>{d.codice_delega}</td><td style={sx.td}>{v.tipo}</td><td style={sx.td}>{v.nomeFile}</td>
                  <td style={{ ...sx.td, color: v.problema ? C.red : v.uguale ? C.muted : C.green, fontWeight: 600 }}>{v.stato}{v.problema && v.percorso && <div style={{ fontWeight: 400 }}>Cercato in F24\{v.percorso.replace(/\//g, "\\")}</div>}</td>
                </tr>
              )))}</tbody>
            </table>
          </div>
        )}
      </div>

      <div style={sx.riquadro}>
        <div style={sx.titolo}>Passo 3 — Il carico</div>
        {!operatore.trim() && <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Scrivere prima nome e cognome di chi carica.</div>}
        <button onClick={carica} disabled={!pronto} style={sx.bottone(pronto)}>Carica</button>
        {file && <span style={{ marginLeft: 12, fontSize: 13 }}>{daCaricare.length} deleghe entrano; {nonEntrano.length} restano fuori.</span>}
        {carico?.inCorso && <div style={{ ...sx.arancio, marginTop: 12 }}>Carico in corso: {carico.fatte} di {carico.totale}. Non chiudere la pagina.</div>}
        {carico?.errore && <div style={{ ...sx.rosso, marginTop: 12 }}>{carico.errore}</div>}
        {carico?.esito && (
          <div style={{ marginTop: 12 }}>
            <div style={carico.esito === "RIUSCITO" ? sx.verde : sx.rosso}>
              <b>Esito del carico: {carico.esito}</b> — {Object.entries(carico.conta).map(([k, n]) => `${k} ${n}`).join(" · ")}.
              {fuoriDopo.length > 0 && (
                <div style={{ ...sx.rosso, marginTop: 8, marginBottom: 0 }}>
                  <b>🔴 F24 DA PAGARE CHE NON SONO ENTRATI NEL PROGRAMMA: vanno pagati lo stesso, entro la scadenza.</b>
                  <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>{fuoriDopo.map(d => <li key={d.codice_delega}>Scadenza {dataIt(d.dbRiga?.data_scadenza || d.data_scadenza)} — saldo {euro(d.saldo)} € — {d.dbRiga?.nome_file_pdf || d.nome_file_pdf}{d.dbRiga ? " (nel programma resta «Da pagare»)" : ""}</li>)}</ul>
                </div>
              )}
              {carico.esito !== "RIUSCITO" && <div style={{ marginTop: 4 }}>Il carico non è completo: non cancellare nessun file da «Da smistare». Dire a Claude «fatto» e seguire le sue indicazioni.</div>}
              {carico.esito === "RIUSCITO" && <div style={{ marginTop: 4 }}>Dire a Claude «fatto»: controlla che tutto sia entrato e dice quali file togliere da «Da smistare».</div>}
            </div>
            <table style={sx.tabella}>
              <thead><tr><th style={sx.th}>Codice delega</th><th style={sx.th}>Nome file PDF</th><th style={sx.th}>Esito nel database</th><th style={sx.th}>PDF</th></tr></thead>
              <tbody>{carico.risultati.map(x => (
                <tr key={x.d.codice_delega}>
                  <td style={sx.td}>{x.d.codice_delega}</td><td style={sx.td}>{x.d.nome_file_pdf}</td>
                  <td style={{ ...sx.td, color: x.errore ? C.red : C.green, fontWeight: 600 }}>{x.esitoDb || `Rifiutata: ${x.errore}`}</td>
                  <td style={sx.td}>{x.pdf.map((v, i) => <div key={i} style={{ color: v.problema ? C.red : C.text }}>{v.tipo}: {v.esito}</div>)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
