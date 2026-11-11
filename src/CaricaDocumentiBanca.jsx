import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
import { md5 } from "./md5";
import { leggiDocumento, contoDelDocumento, analizza, dataIt, euro, TIPO_DOCUMENTO_PER_CONTO } from "./analisiDocumentoBanca";
import { browserAdatto, cartella, fileDiCartella, controllaCartella, nuovoCodice, testoRiconoscimento, FILE_RICONOSCIMENTO, DA_SMISTARE,
  permesso, scriviVerificato, togliDaSmistare, leggiByte, esiste, posizioneInArchivio } from "./cartellaBanche";
import { oggiRoma } from "./dateRoma";

// Versione 353 — «Banche, carte e cassa» → «Carica documenti della banca».
// Procedura (Dott. Bizzarri, 10/11/2026 ore 14:59–15:57; regole 10-bis.6 e 10-bis.7 del 09/11):
//  1. la cartella BANCHE del cloud si sceglie a ogni apertura della pagina (la finestra riparte da lì) e si riconosce dal file di riconoscimento (non dalla lettera del disco);
//  2. la pagina dice per ogni conto che cosa manca e che cosa scaricare;
//  3. l'operatore salva i file scaricati in BANCHE\ESTRATTI CONTO DA SMISTARE, senza aprirli;
//  4. «Leggi i file da smistare»: il programma riconosce dal contenuto documento, CONTO e periodo e fa tutti i controlli (verde, giallo, rosso);
//  5. «Archivia e carica»: per ogni verde, in ordine di data, copia nell'archivio del conto con il nome del programma, rilegge la copia
//     (impronta), carica nel database con ci_carica_documento, registra la copia e toglie l'originale da DA SMISTARE. Al primo intoppo si ferma.
//     I gialli (già caricati) si archiviano se manca la copia e si tolgono da DA SMISTARE. I rossi restano dove sono.

const COLORE = { verde: C.green, giallo: C.yellow, rosso: C.red, fatto: C.blue };
const NOME_STATO = { verde: "Pronto", giallo: "Già caricato", rosso: "Da sistemare", fatto: "Archiviato e caricato" };

function Riga({ colore, children }) {
  return <div style={{ borderLeft: `4px solid ${colore}`, background: `${colore}14`, padding: "6px 10px", borderRadius: 6, margin: "5px 0", fontSize: 13 }}>{children}</div>;
}
function Controllo({ ok, nome, dettaglio }) {
  return <Riga colore={ok ? C.green : C.red}><b style={{ color: ok ? C.green : C.red }}>{ok ? "✔" : "✘"} {nome}</b>{dettaglio ? <> — {dettaglio}</> : null}</Riga>;
}
const Passo = ({ n, titolo, children }) => (
  <div style={scheda}><div style={{ fontWeight: 800, color: C.primary, marginBottom: 8, fontSize: 15 }}>Passo {n} — {titolo}</div>{children}</div>
);

export default function CaricaDocumentiBanca() {
  const [base, setBase] = useState(null);           // { conti, stati, mancanti, codice, archivio: Map(impronta → percorso), gestore }
  const [radice, setRadice] = useState(null);
  const [cartellaOk, setCartellaOk] = useState(null); // { ok, problema, manca, codiceFile }
  const [files, setFiles] = useState(null);
  const [aperto, setAperto] = useState(null);
  const [lavoro, setLavoro] = useState("");
  const [errore, setErrore] = useState("");
  const [esitoFinale, setEsitoFinale] = useState(null);
  const occupato = useRef(false);

  async function caricaBase() {
    const [c, s, m, k, g] = await Promise.all([
      supabase.from("ci_conti").select("id, nome, tipo, iban, ultime_quattro_cifre, cartella_su_z, stato, banca_o_emittente").order("id"),
      supabase.from("ci_v_stato_conti").select("*"),
      supabase.from("ci_v_periodi_mancanti").select("*"),
      supabase.from("ci_banche_cartella").select("codice"),
      supabase.rpc("ci_puo_gestire_conti"),
    ]);
    const e = c.error || s.error || m.error || k.error;
    if (e) throw new Error(e.message);
    const a = await fetchAllPages((x, y) => supabase.from("ci_banche_archivio").select("impronta, percorso").order("impronta").range(x, y));
    if (a.error) throw new Error(a.error.message);
    const b = { conti: (c.data || []).filter(x => TIPO_DOCUMENTO_PER_CONTO[x.tipo]), stati: s.data || [], mancanti: m.data || [],
      codice: k.data?.[0]?.codice || null, archivio: new Map((a.data || []).map(r => [r.impronta, r.percorso])), gestore: g.data === true };
    setBase(b); return b;
  }
  useEffect(() => { (async () => {
    try {
      await caricaBase();
    } catch (x) { setErrore("Lettura non riuscita: " + x.message); }
  })(); }, []);

  async function scegliCartella() {
    setErrore(""); setFiles(null); setEsitoFinale(null);
    let h;
    try { h = await window.showDirectoryPicker({ id: "banche-podere-verde", mode: "readwrite" }); }
    catch (x) { if (x?.name !== "AbortError") setErrore("Scelta della cartella non riuscita: " + x.message); return; }
    if (!(await permesso(h, true))) { setErrore("Senza il permesso di modificare i file il programma non può archiviare: rifare e premere «Modifica file»."); return; }
    setRadice(h);
    setCartellaOk(await controllaCartella(h, base?.codice));
  }

  // la prima volta: file di riconoscimento, codice nel programma e cartelle (solo chi gestisce i conti)
  async function preparaCartella() {
    if (!radice || occupato.current) return;
    occupato.current = true; setLavoro("Preparazione della cartella BANCHE…"); setErrore("");
    try {
      const codice = cartellaOk?.codiceFile || base.codice || nuovoCodice();
      if (!base.codice) { const { error } = await supabase.from("ci_banche_cartella").insert({ id: 1, codice }); if (error) throw new Error(error.message); }
      if (!(await esiste(radice, FILE_RICONOSCIMENTO))) await scriviVerificato(radice, FILE_RICONOSCIMENTO, new TextEncoder().encode(testoRiconoscimento(codice, `${oggiRoma()}`)));
      await cartella(radice, DA_SMISTARE, true);
      const anno = oggiRoma().slice(0, 4);
      for (const conto of base.conti.filter(c => c.stato !== "chiuso")) {
        const tipo = TIPO_DOCUMENTO_PER_CONTO[conto.tipo];
        const p = posizioneInArchivio(conto, { tipo, formato: "", dal: `${anno}-01-01`, al: `${anno}-12-31`, estensione: ".pdf" });
        await cartella(radice, p.split("\\").slice(0, -1).join("\\"), true);
      }
      const b = await caricaBase();
      setCartellaOk(await controllaCartella(radice, b.codice));
    } catch (x) { setErrore("Preparazione non riuscita: " + x.message); }
    occupato.current = false; setLavoro("");
  }

  // ── Lettura di tutti i file in DA SMISTARE ──
  async function leggiTutti() {
    if (!radice || occupato.current) return;
    occupato.current = true; setErrore(""); setEsitoFinale(null); setAperto(null);
    try {
      const b = await caricaBase();
      const dir = await cartella(radice, DA_SMISTARE, true);
      const elenco = await fileDiCartella(dir);
      const letti = [];
      for (let i = 0; i < elenco.length; i++) {
        const f = elenco[i];
        setLavoro(`Lettura ${i + 1} di ${elenco.length}: ${f.nome}`);
        const byte = new Uint8Array(await (await f.handle.getFile()).arrayBuffer());
        const l = await leggiDocumento(f.nome, byte);
        const r = { nome: f.nome, lettura: l, impronta: l.impronta, dimensione: byte.length };
        const gemello = letti.find(x => x.impronta === l.impronta);
        if (gemello) { letti.push({ ...r, lettura: { ...l, esito: null }, stato: "rosso", motivo: `è una copia identica di «${gemello.nome}»: toglierla dalla cartella` }); continue; }
        if (l.errore) { letti.push({ ...r, stato: "rosso", motivo: l.errore }); continue; }
        const conto = contoDelDocumento(l, b.conti);
        if (!conto) { letti.push({ ...r, stato: "rosso", motivo: l.esito.tipo === "estratto conto" ? `l'IBAN ${l.esito.iban || "(non letto)"} non è di un conto di Podere Verde nel programma` : `la carta …${l.esito.carta || "?"} non è una carta di Podere Verde nel programma` }); continue; }
        letti.push({ ...r, conto });
      }
      // in ordine per conto e per data, poi i controlli (un file può contare su quelli sopra dello stesso conto)
      letti.sort((x, y) => (x.conto?.id ?? 1e9) - (y.conto?.id ?? 1e9) || String(x.lettura.dal || "").localeCompare(String(y.lettura.dal || "")) || x.nome.localeCompare(y.nome));
      const copertoFinoA = {};   // conto → ultimo giorno coperto dai verdi sopra
      for (let i = 0; i < letti.length; i++) {
        const r = letti[i]; if (r.stato) continue;
        setLavoro(`Controllo ${i + 1} di ${letti.length}: ${r.nome}`);
        const stato = b.stati.find(s => s.conto_id === r.conto.id);
        const copertoDaPrima = !!copertoFinoA[r.conto.id] && copertoFinoA[r.conto.id] >= dataPrima(r.lettura.dal);
        const a = await analizza(r.lettura, r.conto, stato, { copertoDaPrima });
        r.analisi = a;
        if (a.documentoGia) { r.stato = "giallo"; r.motivo = `già caricato: documento n. ${a.documentoGia.id} del ${dataIt(a.documentoGia.caricato_il)}`; continue; }
        if (a.ok) { r.stato = "verde"; copertoFinoA[r.conto.id] = r.lettura.al > (copertoFinoA[r.conto.id] || "") ? r.lettura.al : copertoFinoA[r.conto.id]; }
        else { r.stato = "rosso"; r.motivo = [...a.controlli.filter(c => !c.ok).map(c => `${c.nome}: ${c.dettaglio}`), ...r.lettura.esito.errori.filter(x => !a.controlli.some(c => x.startsWith(c.nome)))][0] || "un controllo non è passato"; }
      }
      setFiles(letti);
    } catch (x) { setErrore("Lettura non riuscita: " + x.message); }
    occupato.current = false; setLavoro("");
  }
  const dataPrima = d => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };

  // ── Archivia e carica ──
  async function archiviaECarica() {
    if (!files || occupato.current) return;
    occupato.current = true; setErrore("");
    const lista = files.map(f => ({ ...f })); const fatti = { caricati: 0, archiviatiGia: 0, righe: 0, fermato: false };
    const aggiorna = () => setFiles(lista.map(f => ({ ...f })));
    try {
      let b = await caricaBase();
      for (let i = 0; i < lista.length; i++) {
        const r = lista[i];
        if (r.stato !== "verde" && r.stato !== "giallo") continue;
        setLavoro(`${i + 1} di ${lista.length}: ${r.nome}`);
        try {
          // il file deve essere ancora quello letto
          const byte = await leggiByte(radice, `${DA_SMISTARE}\\${r.nome}`);
          if (md5(byte) !== r.impronta) throw new Error("il file è cambiato dopo la lettura: rileggere");
          if (r.stato === "giallo") {
            const doc = r.analisi.documentoGia;
            const ancora = await supabase.from("ci_documenti_fonte").select("id, annullato_il").eq("id", doc.id);
            if (ancora.error) throw new Error(ancora.error.message);
            if (!ancora.data?.[0] || ancora.data[0].annullato_il) throw new Error(`il documento n. ${doc.id} è stato eliminato dopo la lettura: rileggere`);
            let percorso = b.archivio.get(r.impronta);
            if (percorso) {
              let uguale = false; try { uguale = md5(await leggiByte(radice, percorso)) === r.impronta; } catch { uguale = false; }
              if (!uguale) throw new Error(`nell'archivio la copia registrata (${percorso}) non c'è o è diversa: avvisare chi gestisce i conti`);
            } else {
              const dest = posizioneInArchivio(r.conto, { tipo: doc.tipo, formato: r.lettura.formato, dal: doc.periodo_dal, al: doc.periodo_al, estensione: r.lettura.estensione });
              const w = await scriviVerificato(radice, dest, byte);
              const { error } = await supabase.from("ci_banche_archivio").insert({ impronta: r.impronta, percorso: w.percorso, dimensione: byte.length });
              if (error) throw new Error("registrazione della copia: " + error.message);
              percorso = w.percorso; b.archivio.set(r.impronta, percorso);
            }
            await togliDaSmistare(radice, r.nome, r.impronta);
            r.stato = "fatto"; r.motivo = `già caricato; copia nell'archivio: ${percorso}`; fatti.archiviatiGia++; aggiorna();
            continue;
          }
          // verde: controlli rifatti adesso, con lo stato vero del database
          b = await caricaBase();
          const stato = b.stati.find(s => s.conto_id === r.conto.id);
          const a = await analizza(r.lettura, r.conto, stato, {});
          if (!a.ok) { r.analisi = a; throw new Error(a.controlli.filter(c => !c.ok).map(c => `${c.nome}: ${c.dettaglio}`)[0] || "un controllo non è passato"); }
          const dest = posizioneInArchivio(r.conto, { tipo: r.lettura.esito.tipo, formato: r.lettura.formato, dal: r.lettura.dal, al: r.lettura.al, estensione: r.lettura.estensione });
          const w = await scriviVerificato(radice, dest, byte);
          const p = { ...a.payload };
          if (p.origine === "letto da PDF") p.pdf_percorso = w.percorso; else p.file_digitale_percorso = w.percorso;
          const { data: idDoc, error } = await supabase.rpc("ci_carica_documento", { p });
          if (error) throw new Error("il database ha rifiutato il documento: " + error.message + " (la copia resta nell'archivio, il file resta in DA SMISTARE)");
          if (!b.archivio.has(r.impronta)) {
            const { error: e2 } = await supabase.from("ci_banche_archivio").insert({ impronta: r.impronta, percorso: w.percorso, dimensione: byte.length });
            if (e2) throw new Error(`documento n. ${idDoc} caricato, ma la registrazione della copia non è riuscita: ${e2.message}`);
            b.archivio.set(r.impronta, w.percorso);
          }
          await togliDaSmistare(radice, r.nome, r.impronta);
          r.stato = "fatto"; r.motivo = `documento n. ${idDoc}: ${a.righeNuove} righe nuove${a.giaPresenti ? `, ${a.giaPresenti} già presenti e confermate` : ""}; copia: ${w.percorso}`;
          fatti.caricati++; fatti.righe += a.righeNuove; aggiorna();
        } catch (x) {
          r.stato = "rosso"; r.motivo = "fermato qui: " + x.message; fatti.fermato = true; aggiorna();
          setErrore(`Mi sono fermato su «${r.nome}»: ${x.message}. I file prima sono a posto; questo e quelli dopo restano in ${DA_SMISTARE}.`);
          break;
        }
      }
      await caricaBase();
      setEsitoFinale(fatti);
    } catch (x) { setErrore("Lavoro interrotto: " + x.message); }
    occupato.current = false; setLavoro("");
  }

  if (!browserAdatto()) return <div style={{ maxWidth: 900 }}><h2 style={{ color: C.primary }}>Carica documenti della banca</h2>
    <Riga colore={C.red}><b>Questa pagina funziona solo con Google Chrome o Microsoft Edge sul computer.</b> Aprire il programma con uno di questi due browser.</Riga></div>;

  const conti = base?.conti || [];
  const pronti = (files || []).filter(f => f.stato === "verde" || f.stato === "giallo").length;
  return (
    <div style={{ maxWidth: 1150 }}>
      <h2 style={{ color: C.primary, margin: "0 0 4px" }}>Carica documenti della banca</h2>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 14 }}>Estratti conto e liste movimenti delle carte, in PDF o in Excel, presi dalla cartella BANCHE del cloud.</div>

      {/* versione 361: istruzioni riscritte, testo approvato dal Dott. Bizzarri l'11/11/2026 alle 10:48 (bozza 4) */}
      <details open style={{ ...scheda, fontSize: 13.5, lineHeight: 1.55 }}>
        <summary style={{ fontWeight: 800, color: C.primary, cursor: "pointer", fontSize: 15 }}>Come si caricano gli estratti conto</summary>
        <div style={{ marginTop: 6 }}>Questa pagina prende i documenti della banca che si trovano nella cartella ESTRATTI CONTO DA SMISTARE del cloud «Company». Li mette nell'archivio del conto giusto e ne carica i movimenti nel programma.</div>
        <div style={{ fontWeight: 700, marginTop: 8 }}>Passo 1 – La cartella BANCHE</div>
        <ol style={{ margin: "2px 0 4px", paddingLeft: 22 }}>
          <li>Premere <b>«Scegli la cartella BANCHE»</b>.</li>
          <li>Nella finestra che si apre, a sinistra in <b>Questo PC</b>, aprire il cloud <b>Company</b>. La lettera del disco accanto al nome cambia da un computer all'altro.</li>
          <li>Entrare, una cartella dopo l'altra, in <code>SOCIETA</code> → <code>SOCIETA' AGRICOLA PODERE VERDE A R.L</code> → <code>00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE</code>.</li>
          <li>Cliccare <b>una sola volta</b> su <code>BANCHE</code>, senza aprirla.</li>
          <li>Premere <b>«Seleziona cartella»</b>. Se il browser lo chiede, premere <b>«Modifica file»</b>.</li>
        </ol>
        <div><b>Risultato:</b> compare la riga verde «Cartella BANCHE di Podere Verde riconosciuta».</div>
        <div>Si sceglie BANCHE, non ESTRATTI CONTO DA SMISTARE: quella il programma la trova da solo.</div>
        <div style={{ fontWeight: 700, marginTop: 8 }}>Passo 2 – Che cosa manca</div>
        <div>Per ogni conto il programma scrive fino a che giorno è caricato e quali periodi mancano. Qui non si preme niente: serve a sapere quali documenti scaricare dalla banca.</div>
        <div style={{ fontWeight: 700, marginTop: 8 }}>Passo 3 – Leggere, archiviare e caricare</div>
        <ol style={{ margin: "2px 0 4px", paddingLeft: 22 }}>
          <li>Premere <b>«Leggi i file da smistare»</b>. Accanto a ogni file compare l'esito:
            <div>🟢 <b>Pronto</b>: il file sarà caricato.</div>
            <div>🟡 <b>Già caricato</b>: i movimenti ci sono già, il file viene solo messo nell'archivio.</div>
            <div>🔴 <b>Da sistemare</b>: il file non viene toccato e resta in ESTRATTI CONTO DA SMISTARE. Il motivo è scritto accanto.</div></li>
          <li>Premere <b>«Archivia e carica»</b>. Il programma lavora un file alla volta: lo sposta nell'archivio del conto, gli dà il nome giusto e ne carica i movimenti.</li>
        </ol>
        <div><b>Risultato:</b> i file diventano 🔵 «Archiviato e caricato» ed escono da ESTRATTI CONTO DA SMISTARE.</div>
        <div style={{ fontWeight: 700, marginTop: 8 }}>Se qualcosa non va</div>
        <ul style={{ margin: "2px 0 0", paddingLeft: 22 }}>
          <li><b>Riga rossa al Passo 1, «Hai scelto … che sta dentro BANCHE»:</b> è stata scelta la cartella sbagliata. Premere di nuovo il pulsante e scegliere BANCHE.</li>
          <li><b>File rosso al Passo 3:</b> leggere il motivo. Di solito è una scansione, o un documento che il programma non conosce. Il file resta dov'è. Mandare lo schermo a chi gestisce i conti (Dott. Bizzarri, Teresa Demaria, Colabucci).</li>
          <li><b>Il programma si ferma a metà:</b> i file precedenti sono già a posto. Quello fermato e i seguenti restano in ESTRATTI CONTO DA SMISTARE. Mandare lo schermo con la scritta rossa a chi gestisce i conti.</li>
        </ul>
      </details>

      <Passo n={1} titolo="La cartella BANCHE">
        {!radice && <div style={{ fontSize: 13, marginBottom: 8 }}>Scegliere la cartella <b>BANCHE</b> di Podere Verde sul cloud: <code>SOCIETA\SOCIETA' AGRICOLA PODERE VERDE A R.L\00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE\BANCHE</code>.</div>}
        <button style={btn(!radice || !cartellaOk?.ok)} disabled={!!lavoro} onClick={scegliCartella}>{radice ? "Scegli un'altra cartella" : "Scegli la cartella BANCHE"}</button>
        {cartellaOk?.ok && <Riga colore={C.green}><b>✅ Cartella BANCHE di Podere Verde riconosciuta</b> — codice {cartellaOk.codiceFile}</Riga>}
        {cartellaOk && !cartellaOk.ok && <Riga colore={C.red}><b>⛔ {cartellaOk.problema}</b>
          {cartellaOk.manca && base?.gestore && <div style={{ marginTop: 8 }}><button style={btn(true, C.red)} disabled={!!lavoro} onClick={preparaCartella}>Prepara questa cartella come cartella BANCHE (solo la prima volta)</button></div>}
          {cartellaOk.manca && !base?.gestore && <div style={{ marginTop: 6 }}>La cartella la prepara la prima volta chi gestisce i conti (Dott. Bizzarri, Teresa Demaria, Colabucci).</div>}
        </Riga>}
      </Passo>

      {cartellaOk?.ok && <Passo n={2} titolo="Che cosa manca e che cosa scaricare">
        {conti.map(c => {
          const st = base.stati.find(s => s.conto_id === c.id); const buchi = base.mancanti.filter(m => m.conto_id === c.id);
          return <div key={c.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", margin: "6px 0", fontSize: 13 }}>
            <b>{c.tipo === "banca" ? "🏦" : "💳"} {c.nome}</b>{c.stato === "chiuso" ? " (chiuso)" : ""}
            {!st?.partenza_alla_data ? <div style={{ color: C.muted }}>Senza partenza: prima la partenza (pagina «Conti: stato e controlli»).</div> : <>
              <div>Caricato senza buchi fino al <b>{dataIt(st.controllo_ok_alla_data)}</b>.</div>
              {buchi.map((m, i) => <div key={i} style={{ color: C.red, fontWeight: 700 }}>Manca: dal {dataIt(m.dal)} al {dataIt(m.al)} ({m.giorni} giorni)</div>)}
              {buchi.length > 0 && <div style={{ color: C.muted }}>Da scaricare dalla banca: {c.tipo === "banca" ? "l'estratto conto ufficiale in PDF che copre questi giorni" : "la lista movimenti della carta in Excel che copre questi giorni"}, e salvarlo così com'è in <b>BANCHE\{DA_SMISTARE}</b>.</div>}
            </>}
          </div>;
        })}
      </Passo>}

      {cartellaOk?.ok && <Passo n={3} titolo={`Leggi i file in «${DA_SMISTARE}»`}>
        <button style={btn(true)} disabled={!!lavoro} onClick={leggiTutti}>Leggi i file da smistare</button>
        {files && files.length === 0 && <Riga colore={C.muted}>La cartella «{DA_SMISTARE}» è vuota: salvarci i file scaricati dalla banca e premere di nuovo.</Riga>}
        {files && files.length > 0 && <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
            <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Esito", "File", "Conto", "Periodo", "Movimenti", "Motivo / dettaglio", ""].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left" }}>{h}</th>)}</tr></thead>
            <tbody>{files.map((f, i) => <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: `${COLORE[f.stato]}14` }}>
              <td style={{ padding: "5px 8px", fontWeight: 800, color: COLORE[f.stato], whiteSpace: "nowrap" }}>{f.stato === "verde" ? "🟢" : f.stato === "giallo" ? "🟡" : f.stato === "fatto" ? "🔵" : "🔴"} {NOME_STATO[f.stato]}</td>
              <td style={{ padding: "5px 8px" }}>{f.nome}<div style={{ color: C.muted, fontSize: 11 }}>{f.lettura?.nomeFormato || ""}</div></td>
              <td style={{ padding: "5px 8px" }}>{f.conto?.nome || "—"}</td>
              <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{f.lettura?.dal ? `${dataIt(f.lettura.dal)} – ${dataIt(f.lettura.al)}` : "—"}</td>
              <td style={{ padding: "5px 8px" }}>{f.lettura?.esito ? f.lettura.esito.righeCarico.length : "—"}</td>
              <td style={{ padding: "5px 8px" }}>{f.motivo || (f.stato === "verde" ? `${f.analisi.righeNuove} righe nuove${f.analisi.giaPresenti ? `, ${f.analisi.giaPresenti} già presenti` : ""}` : "")}</td>
              <td style={{ padding: "5px 8px" }}>{f.lettura?.esito && <button style={btn(false)} onClick={() => setAperto(aperto === i ? null : i)}>{aperto === i ? "Chiudi" : "Vedi"}</button>}</td>
            </tr>)}</tbody>
          </table>
          {aperto !== null && files[aperto]?.lettura?.esito && <Dettaglio f={files[aperto]} />}
          <div style={{ marginTop: 12, fontSize: 13 }}>{pronti > 0 ? <>Pronti: <b>{pronti}</b>. Il programma li archivia e li carica uno alla volta, in quest'ordine; se uno si blocca, si ferma lì.</> : "Nessun file pronto."}</div>
          <button style={{ ...btn(true), marginTop: 8 }} disabled={!!lavoro || pronti === 0} onClick={archiviaECarica}>Archivia e carica</button>
        </div>}
        {lavoro && <div style={{ marginTop: 8, color: C.blue, fontWeight: 700 }}>{lavoro}</div>}
        {esitoFinale && <Riga colore={esitoFinale.fermato ? C.yellow : C.blue}><b>{esitoFinale.fermato ? "Fatto prima di fermarsi:" : "Fatto:"}</b> {esitoFinale.caricati} documenti caricati ({esitoFinale.righe} righe nuove), {esitoFinale.archiviatiGia} già caricati messi nell'archivio. Lo stato dei conti al passo 2 è aggiornato.{esitoFinale.fermato ? " Il file fermato e quelli dopo non sono stati toccati: sistemare il motivo scritto sopra e ripremere «Leggi»." : ""}</Riga>}
      </Passo>}
      {errore && <Riga colore={C.red}><b>{errore}</b></Riga>}
    </div>
  );
}

function Dettaglio({ f }) {
  const e = f.lettura.esito; const [tutte, setTutte] = useState(false);
  const righe = tutte ? e.righeCarico : e.righeCarico.slice(0, 40);
  return <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, marginTop: 10, background: "#fff" }}>
    <div style={{ fontWeight: 800, marginBottom: 6 }}>{f.nome}</div>
    <div style={{ fontSize: 12.5, marginBottom: 6 }}>Impronta {f.impronta}{f.analisi ? <> — saldo iniziale {euro(f.analisi.payload.saldo_iniziale)}, saldo finale {euro(f.analisi.payload.saldo_finale)}{e.tipo === "lista movimenti della carta" ? " (calcolati dal programma: la lista non ha saldi)" : ""}</> : null}</div>
    {e.escluse?.length > 0 && <Riga colore={C.yellow}>Non caricati ora: {e.escluse.length} movimenti (da contabilizzare o ultimo giorno non chiuso): arriveranno con la lista dopo.</Riga>}
    <div style={{ fontWeight: 700, fontSize: 12.5 }}>Controlli sul file</div>
    {e.controlli.map((c, i) => <Controllo key={i} {...c} />)}
    {f.analisi && <><div style={{ fontWeight: 700, fontSize: 12.5, marginTop: 6 }}>Controlli con quanto è già nel programma</div>{f.analisi.controlli.map((c, i) => <Controllo key={i} {...c} />)}</>}
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, marginTop: 8 }}>
      <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Data", "Valuta", "Uscita", "Entrata", "Descrizione", "Pagina"].map(h => <th key={h} style={{ padding: "5px 8px", textAlign: "left" }}>{h}</th>)}</tr></thead>
      <tbody>{righe.map((r, i) => <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
        <td style={{ padding: "3px 8px", whiteSpace: "nowrap" }}>{dataIt(r.data_contabile)}</td>
        <td style={{ padding: "3px 8px", whiteSpace: "nowrap" }}>{r.data_valuta ? dataIt(r.data_valuta) : ""}</td>
        <td style={{ padding: "3px 8px", textAlign: "right", color: C.red }}>{r.verso === "uscita" ? euro(r.importo) : ""}</td>
        <td style={{ padding: "3px 8px", textAlign: "right", color: C.green }}>{r.verso === "entrata" ? euro(r.importo) : ""}</td>
        <td style={{ padding: "3px 8px" }}>{r.descrizione}</td>
        <td style={{ padding: "3px 8px" }}>{r.pagina_pdf || ""}</td>
      </tr>)}</tbody>
    </table>
    {e.righeCarico.length > 40 && <button style={{ ...btn(false), marginTop: 6 }} onClick={() => setTutte(!tutte)}>{tutte ? "Mostra solo le prime 40" : `Mostra tutti i ${e.righeCarico.length} movimenti`}</button>}
  </div>;
}
