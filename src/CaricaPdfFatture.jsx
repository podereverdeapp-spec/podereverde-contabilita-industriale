import { useRef, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { fetchAllPages } from "./parsingUtils";
import { dataIt } from "./FatturePassive";
import { caricaPdf, chiaveDoc } from "./pdfFatture";
import { abbinaFile, preparaDocumenti, pivaNorm } from "./abbinaPdf";

// Versione 292 (decisione del Dott. Bizzarri del 24/10/2026 ore 11:07): si sceglie una cartella del computer
// (quella dell'anno, o tutta la cartella delle fatture) e il programma abbina ogni PDF alla sua fattura dal nome
// del file, poi carica i PDF nell'archivio «fatture». Le fatture che hanno già il PDF non si toccano.

const LIMITE_BYTE = 10 * 1024 * 1024; // il limite dell'archivio: 10 MB a file
const fiducia = r => !r.nota ? 3 : r.nota.startsWith("data") ? 2 : 1; // nome completo > data vicina > solo numero

export default function CaricaPdfFatture() {
  const input = useRef(null);
  const [stato, setStato] = useState("");
  const [esito, setEsito] = useState(null);
  const [errore, setErrore] = useState("");
  const [carico, setCarico] = useState(null); // { fatti, totale, errori: [] }
  const [aperto, setAperto] = useState("");

  async function cartellaScelta(e) {
    const tutti = [...(e.target.files || [])]; e.target.value = "";
    const pdf = tutti.filter(f => /\.pdf$/i.test(f.name));
    if (!pdf.length) { setErrore("Nella cartella scelta non ci sono PDF."); return; }
    setErrore(""); setEsito(null); setCarico(null);
    setStato(`Letti ${pdf.length.toLocaleString("it-IT")} PDF. Leggo le fatture del programma…`);
    try {
      const [{ data: docs, error: eD }, { data: forn, error: eF }, { data: gia, error: eG }] = await Promise.all([
        fetchAllPages((da, a) => supabase.from("ci_v_ricerca_documenti").select("chiave, id, tipo, numero, data, fornitore_id, controparte, acquisto_animali").order("chiave").range(da, a)),
        fetchAllPages((da, a) => supabase.from("ci_fornitori").select("id, partita_iva").order("id").range(da, a)),
        fetchAllPages((da, a) => supabase.from("ci_pdf_fatture").select("fattura_id, chiave_acquisto").order("id").range(da, a)),
      ]);
      if (eD || eF || eG) throw new Error((eD || eF || eG).message);
      const documenti = preparaDocumenti(docs || []);
      const piva = {};
      (forn || []).forEach(f => { const k = pivaNorm(f.partita_iva); if (k) (piva[k] = piva[k] || []).push(f.id); });
      const conPdf = new Set((gia || []).map(g => g.fattura_id ? `F${g.fattura_id}` : g.chiave_acquisto));

      const migliore = new Map(); // chiave del documento → { doc, file, nota, livello }
      const nonAbbinati = [], troppoGrandi = [];
      let copie = 0;
      for (const file of pdf) {
        const percorso = file.webkitRelativePath || file.name;
        const r = abbinaFile(file.name, documenti, piva, percorso);
        if (!r.doc) { nonAbbinati.push({ percorso, motivo: r.motivo }); continue; }
        if (file.size > LIMITE_BYTE) { troppoGrandi.push(percorso); continue; }
        const k = chiaveDoc(r.doc), livello = fiducia(r), prima = migliore.get(k);
        if (!prima) migliore.set(k, { doc: r.doc, file, percorso, nota: r.nota, livello });
        else { copie++; if (livello > prima.livello) migliore.set(k, { doc: r.doc, file, percorso, nota: r.nota, livello }); }
      }
      const abbinati = [...migliore.entries()];
      const daCaricare = abbinati.filter(([k]) => !conPdf.has(k)).map(([, v]) => v)
        .sort((a, b) => String(a.doc.data).localeCompare(String(b.doc.data)));
      const giaPresenti = abbinati.filter(([k]) => conPdf.has(k)).length;
      setEsito({ totale: pdf.length, documenti: documenti.length, daCaricare, giaPresenti, copie, nonAbbinati, troppoGrandi });
      setStato("");
    } catch (err) { setErrore(err.message); setStato(""); }
  }

  async function caricaTutti() {
    const lista = esito.daCaricare;
    const stato = { fatti: 0, totale: lista.length, errori: [] };
    setCarico({ ...stato });
    let prossimo = 0;
    async function lavoratore() {
      while (prossimo < lista.length) {
        const x = lista[prossimo++];
        try { await caricaPdf(x.doc, x.file); }
        catch (err) { stato.errori.push(`${x.percorso}: ${err.message}`); }
        stato.fatti++; setCarico({ ...stato, errori: [...stato.errori] });
      }
    }
    await Promise.all([lavoratore(), lavoratore(), lavoratore(), lavoratore()]); // 4 file alla volta
    setCarico({ ...stato, finito: true, errori: [...stato.errori] });
  }

  const Gruppo = ({ id, titolo, n, colore, children }) => (
    <div style={{ border: `1px solid ${C.border}`, borderLeft: `5px solid ${colore}`, borderRadius: 10, background: C.card, marginBottom: 10 }}>
      <div onClick={() => setAperto(aperto === id ? "" : id)} style={{ padding: "10px 14px", cursor: n ? "pointer" : "default", display: "flex", justifyContent: "space-between" }}>
        <strong>{titolo} ({n.toLocaleString("it-IT")})</strong>
        {n > 0 && <span style={{ fontSize: 12, color: C.muted }}>{aperto === id ? "▲ chiudi" : "▼ vedi l'elenco"}</span>}
      </div>
      {aperto === id && n > 0 && <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 14px", maxHeight: 420, overflow: "auto", fontSize: 12.5 }}>{children}</div>}
    </div>
  );
  const soloNumero = esito ? esito.daCaricare.filter(x => x.livello === 1) : [];

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Carica PDF delle Fatture</h1>
      <p style={{ color: C.muted, marginTop: 0 }}>
        Si sceglie la cartella delle fatture (quella di un anno, o quella con tutti gli anni). Il programma riconosce ogni PDF
        dal nome del file e lo abbina alla sua fattura; poi lo carica nel programma. Da quel momento la fattura si apre con
        il pulsante «📄 PDF» in Fatture Passive, Fatture Attive, Ricerca e nelle pagine di controllo. Le fatture che hanno già
        il PDF non si toccano: si può ripetere quante volte si vuole.
      </p>
      <button onClick={() => input.current.click()} disabled={!!stato || (carico && !carico.finito)}
        style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
        📁 Scegli la cartella dei PDF
      </button>
      <input ref={input} type="file" webkitdirectory="" directory="" multiple style={{ display: "none" }} onChange={cartellaScelta} />
      {stato && <p style={{ color: C.muted }}>{stato}</p>}
      {errore && <p style={{ color: C.red, fontWeight: 700 }}>⚠️ {errore}</p>}

      {esito && (
        <div style={{ marginTop: 18 }}>
          <p style={{ fontSize: 13, color: C.muted }}>
            PDF nella cartella: {esito.totale.toLocaleString("it-IT")} · fatture nel programma: {esito.documenti.toLocaleString("it-IT")} ·
            già con il PDF nel programma: {esito.giaPresenti.toLocaleString("it-IT")} · copie dello stesso PDF lasciate da parte: {esito.copie.toLocaleString("it-IT")}
          </p>
          <Gruppo id="da" titolo="PDF da caricare" n={esito.daCaricare.length} colore={C.green}>
            {esito.daCaricare.map((x, i) => <div key={i}>{dataIt(x.doc.data)} · {x.doc.controparte} · n. {x.doc.numero} ← <span style={{ color: C.muted }}>{x.percorso}</span>{x.nota ? <em style={{ color: C.accent }}> ({x.nota})</em> : null}</div>)}
          </Gruppo>
          <Gruppo id="solo" titolo="Di questi, abbinati con il solo numero della fattura: controllarli dopo il carico" n={soloNumero.length} colore={C.yellow}>
            {soloNumero.map((x, i) => <div key={i}>{dataIt(x.doc.data)} · {x.doc.controparte} · n. {x.doc.numero} ← <span style={{ color: C.muted }}>{x.percorso}</span></div>)}
          </Gruppo>
          <Gruppo id="non" titolo="PDF non abbinati a nessuna fattura" n={esito.nonAbbinati.length} colore={C.red}>
            {esito.nonAbbinati.map((x, i) => <div key={i}>{x.percorso} — <em>{x.motivo}</em></div>)}
          </Gruppo>
          {esito.troppoGrandi.length > 0 && (
            <Gruppo id="grandi" titolo="PDF più grandi di 10 MB, non caricabili" n={esito.troppoGrandi.length} colore={C.red}>
              {esito.troppoGrandi.map((x, i) => <div key={i}>{x}</div>)}
            </Gruppo>
          )}
          {esito.daCaricare.length > 0 && !carico && (
            <button onClick={caricaTutti} style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 6 }}>
              ⬆️ Carica i {esito.daCaricare.length.toLocaleString("it-IT")} PDF
            </button>
          )}
          {carico && (
            <div style={{ marginTop: 10, fontSize: 14 }}>
              <strong>{carico.finito ? "✓ Carico finito" : "Carico in corso…"}</strong> caricati {(carico.fatti - carico.errori.length).toLocaleString("it-IT")} di {carico.totale.toLocaleString("it-IT")}
              {carico.errori.length > 0 && <div style={{ color: C.red, marginTop: 6 }}>{carico.errori.length} PDF non caricati:{carico.errori.map((e, i) => <div key={i} style={{ fontSize: 12 }}>{e}</div>)}</div>}
            </div>
          )}
          <p style={{ fontSize: 12, color: C.muted, marginTop: 14 }}>
            Come riconosce i PDF: dal nome dato da Claude («FORNITORE_aaaa-mm-gg_numero.pdf»: fornitore, data e numero) oppure dal
            nome originale di Aruba («partita IVA_codice.xml - numero.pdf»). Una cartella con «attiv» nel nome contiene fatture di
            vendita, le altre fatture d'acquisto. I PDF non abbinati, e le fatture rimaste senza PDF, si sistemano a mano con
            «📎 aggiungi PDF» accanto alla fattura in Fatture Passive o Fatture Attive.
          </p>
        </div>
      )}
    </div>
  );
}
