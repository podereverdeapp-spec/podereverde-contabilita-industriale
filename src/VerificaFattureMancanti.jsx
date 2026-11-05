import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro, fetchAllPages } from "./parsingUtils";
import { esportaExcel } from "./esportaExcel";
import { descriviFoglio, scegliFoglio, fattureDalFoglio, completaDaAltriFogli, confronta, indovinaColonne } from "./verificaFattureLogica";

// Versione 348 (05/11/2026): pagina riscritta. Prima leggeva sempre il primo foglio del file (nel file del carico
// è quello con una riga per voce, e ogni fattura «non trovata» compariva tante volte quante le sue voci) e cercava
// la fattura con il nome del fornitore scritto identico all'anagrafica («BUTCHER SERVICE SRL UNIPERSONALE» ≠
// «BUTCHER SERVICE SRL»): 11 fatture presenti risultavano 28 righe mancanti. Ora si sceglie il foglio, le righe si
// raggruppano in fatture, la fattura si riconosce da numero e data (e partita IVA quando c'è), il nome serve solo
// come controllo. La logica è in verificaFattureLogica.js.

const dataIt = d => { const s = String(d || "").slice(0, 10); const [a, m, g] = s.split("-"); return g ? `${g}/${m}/${a}` : (s || "—"); };
const euro = v => (v === null || v === undefined || v === "" ? "—" : formattaEuro(Number(v)));

// Legge il file come cartella di Excel. Il CSV si legge come testo, con il separatore indovinato e senza
// trasformare le date (una data «05/11/2026» non deve diventare l'11 maggio).
async function leggiCartella(file) {
  const nome = file.name.toLowerCase();
  if (nome.endsWith(".csv") || nome.endsWith(".txt")) {
    let testo = await file.text();
    if (testo.charCodeAt(0) === 0xfeff) testo = testo.slice(1);
    const prima = testo.split(/\r?\n/)[0] || "";
    const conta = c => prima.split(c).length - 1;
    const FS = [";", "\t", ","].sort((a, b) => conta(b) - conta(a))[0];
    return XLSX.read(testo, { type: "string", FS, raw: true });
  }
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: "array", cellDates: true });
}

const CAMPI = [
  { k: "numero", label: "Numero della fattura (obbligatorio)" },
  { k: "data", label: "Data della fattura" },
  { k: "fornitore", label: "Fornitore o cliente" },
  { k: "piva", label: "Partita IVA" },
  { k: "totale", label: "Totale della fattura" },
  { k: "imponibile", label: "Imponibile" },
];

export default function VerificaFattureMancanti() {
  const [tipo, setTipo] = useState("PASSIVA");
  const [cartella, setCartella] = useState(null); // { nomeFile, fogli: [{ nome, righe, descrizione }] }
  const [indiceFoglio, setIndiceFoglio] = useState(0);
  const [colonne, setColonne] = useState({});
  const [anno, setAnno] = useState("tutti");
  const [soloFornitoriDelFile, setSoloFornitoriDelFile] = useState(false);
  const [risultato, setRisultato] = useState(null);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState(null);
  const [aperte, setAperte] = useState({ mancanti: true, daGuardare: true, importi: true });
  const inputRef = useRef(null);

  const foglio = cartella?.fogli[indiceFoglio];
  const lettura = useMemo(() => (foglio && colonne.numero ? fattureDalFoglio(foglio.righe, colonne) : null), [foglio, colonne]);
  const anniDelFile = useMemo(() => (lettura ? [...new Set(lettura.fatture.map(f => f.anno).filter(Boolean))].sort() : []), [lettura]);

  async function gestisciFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setRisultato(null); setErrore(null); setCartella(null);
    try {
      const wb = await leggiCartella(file);
      const fogli = wb.SheetNames.map(nome => {
        const righe = XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: "" });
        return { nome, righe, descrizione: descriviFoglio(nome, righe) };
      });
      if (!fogli.some(f => f.descrizione.righe > 0)) { setErrore(`Il file «${file.name}» è vuoto, oppure non è un file Excel o CSV leggibile.`); return; }
      const i = scegliFoglio(fogli.map(f => f.descrizione));
      setCartella({ nomeFile: file.name, fogli });
      scegli(fogli, i);
    } catch (err) {
      setErrore(`Impossibile leggere il file «${file.name}»: ${err.message}`);
    }
  }

  function scegli(fogli, i) {
    setIndiceFoglio(i);
    const col = fogli[i].descrizione.colonne;
    setColonne(col);
    setRisultato(null);
    const lett = col.numero ? fattureDalFoglio(fogli[i].righe, col) : null;
    const anni = lett ? [...new Set(lett.fatture.map(f => f.anno).filter(Boolean))] : [];
    setAnno(anni.length === 1 ? anni[0] : "tutti");
  }

  async function confrontaFatture() {
    if (!colonne.numero) { setErrore("Indicare quale colonna contiene il numero della fattura."); return; }
    setCaricando(true); setErrore(null);
    try {
      const lett = fattureDalFoglio(foglio.righe, colonne);
      const altri = cartella.fogli.filter((_, j) => j !== indiceFoglio).map(g => ({ righe: g.righe, colonne: indovinaColonne(g.descrizione.intestazioni) }));
      const completate = completaDaAltriFogli(lett.fatture, altri);
      const tipi = tipo === "ATTIVA" ? ["ATTIVA", "DA_EMETTERE"] : ["PASSIVA", "DA_RICEVERE"];
      const { data: documenti, error } = await fetchAllPages((da, a) => supabase.from("ci_v_ricerca_documenti")
        .select("chiave, tipo, numero, data, controparte, partita_iva, totale_netto, totale_lordo, acquisto_animali")
        .in("tipo", tipi).order("chiave").range(da, a));
      if (error) throw new Error(error.message);
      const anni = anno === "tutti" ? (anniDelFile.length ? anniDelFile : null) : [anno];
      const r = confronta(lett.fatture, documenti || [], { tipi: [tipo], anni, soloFornitoriDelFile });
      setRisultato({ ...r, lettura: lett, completate, documentiLetti: (documenti || []).length, anni, foglio: foglio.nome, file: cartella.nomeFile });
      setAperte({ mancanti: true, daGuardare: true, importi: true });
    } catch (err) {
      setErrore(`Confronto non riuscito: ${err.message}`);
    }
    setCaricando(false);
  }

  function esporta() {
    const r = risultato;
    const daFile = f => ({ "Fornitore o cliente nel file": f.fornitore, "Partita IVA nel file": f.piva, "Numero nel file": f.numero, "Data nel file": dataIt(f.data),
      "Totale nel file": f.totale ?? "", "Imponibile nel file": f.imponibile ?? "", "Righe del foglio": f.righeFoglio.join(", ") });
    const daProgramma = d => d ? ({ "Nel programma": d.controparte || "", "Numero nel programma": d.numero ?? "", "Data nel programma": dataIt(d.data),
      "Totale nel programma": d.totale_lordo === null ? "" : Number(d.totale_lordo), "Imponibile nel programma": d.totale_netto === null ? "" : Number(d.totale_netto),
      "Acquisto di animali (Report)": d.acquisto_animali ? "sì" : "" }) : {};
    const descriviImporti = i => i ? i.controlli.filter(c => !c.uguale).map(c => `${c.cosa}: file ${formattaEuro(c.file)}, programma ${formattaEuro(c.programma)}`).join("; ") : "";
    // un foglio vuoto non si può scrivere: al suo posto una riga «Nessuna»
    const pieno = righe => (righe.length ? righe : [{ Nota: "Nessuna" }]);
    const fogli = [
      { nome: "Riepilogo", righe: [
        { Voce: "File", Valore: r.file }, { Voce: "Foglio", Valore: r.foglio }, { Voce: "Tipo", Valore: tipo === "ATTIVA" ? "Fatture di vendita" : "Fatture d'acquisto" },
        { Voce: "Anni controllati", Valore: (r.anni || ["tutti"]).join(", ") }, { Voce: "Righe del foglio lette", Valore: r.lettura.righeLette },
        { Voce: "Fatture nel file", Valore: r.lettura.fatture.length }, { Voce: "Fatture controllate", Valore: r.controllate },
        { Voce: "Presenti nel programma", Valore: r.presenti.length }, { Voce: "Mancanti", Valore: r.mancanti.length }, { Voce: "Da guardare", Valore: r.daGuardare.length },
        { Voce: "Presenti con importo diverso", Valore: r.importiDiversi.length }, { Voce: "Presenti con il nome scritto in modo diverso", Valore: r.nomiDiversi.length },
        { Voce: "Nel programma ma non nel file", Valore: r.nelProgrammaNonNelFile.length }, { Voce: "Righe scartate", Valore: r.lettura.scartate.length },
        { Voce: "Fatture scritte due volte nel file", Valore: r.doppioniFile.length }] },
      { nome: "Mancanti", righe: r.mancanti.map(m => ({ ...daFile(m.f), Nota: m.nota })) },
      { nome: "Da guardare", righe: r.daGuardare.map(g => ({ ...daFile(g.f), ...daProgramma(g.d), Motivo: g.motivo, Importi: descriviImporti(g.importi) })) },
      { nome: "Importi diversi", righe: r.importiDiversi.map(p => ({ ...daFile(p.f), ...daProgramma(p.d), Differenze: descriviImporti(p.importi), Spiegazione: p.importi.spiegazione })) },
      { nome: "Nomi diversi", righe: r.nomiDiversi.map(p => ({ ...daFile(p.f), ...daProgramma(p.d), Nota: p.note.join(", ") })) },
      { nome: "Nel programma non nel file", righe: r.nelProgrammaNonNelFile.map(d => daProgramma(d)) },
      { nome: "Righe scartate", righe: r.lettura.scartate.map(s => ({ "Riga del foglio": s.numeroRiga, Fornitore: s.fornitore, Numero: s.numero, Data: s.data, Motivo: s.motivo })) },
      { nome: "Presenti", righe: r.presenti.map(p => ({ ...daFile(p.f), ...daProgramma(p.d) })) },
    ];
    esportaExcel(`verifica_fatture_${(r.anni || ["tutti"]).join("-")}`, fogli.map(f => ({ ...f, righe: pieno(f.righe) })));
  }

  const stileSelect = { width: "100%", padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12, marginTop: 2 };
  const r = risultato;
  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Verifica Fatture Mancanti</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13 }}>
        Carichi un elenco di fatture (Excel o CSV: il file del carico, l'esportazione di Fatture e Corrispettivi, quella di Aruba o del commercialista)
        e il programma risponde: quali fatture del file <b>non ci sono</b>, quali sono <b>da guardare</b> perché quasi uguali, quali hanno
        <b> importi diversi</b>, e quali fatture del programma <b>non sono nel file</b>. Il confronto legge soltanto: non cambia nulla nel programma.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <select value={tipo} onChange={e => { setTipo(e.target.value); setRisultato(null); }} style={{ ...stileSelect, width: 220, marginTop: 0, fontSize: 13 }}>
          <option value="PASSIVA">Fatture d'acquisto (fornitori)</option>
          <option value="ATTIVA">Fatture di vendita (clienti)</option>
        </select>
        <button onClick={() => inputRef.current.click()}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          📎 Scegli il file (Excel o CSV)
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm,.csv,.txt" onChange={gestisciFile} style={{ display: "none" }} />
        {cartella && <span style={{ fontSize: 12, color: C.muted }}>{cartella.nomeFile}</span>}
      </div>

      {errore && <div style={{ background: "#FBE1DE", border: `1px solid ${C.red}`, borderRadius: 8, padding: "10px 16px", fontSize: 13, marginBottom: 12 }}>⚠️ {errore}</div>}

      {cartella && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Foglio da confrontare</div>
          <select value={indiceFoglio} onChange={e => scegli(cartella.fogli, +e.target.value)} style={{ ...stileSelect, maxWidth: 640 }}>
            {cartella.fogli.map((f, i) => (
              <option key={i} value={i}>
                {f.nome} — {f.descrizione.righe} righe{f.descrizione.colonne.numero ? `, ${f.descrizione.fatture} fatture (${f.descrizione.unaRigaPerFattura ? "una riga per fattura" : "una riga per voce"})` : ", senza numero di fattura"}
              </option>
            ))}
          </select>
          {lettura && (
            <div style={{ fontSize: 13, marginTop: 8 }}>
              Nel foglio: <b>{lettura.fatture.length} fatture</b> in {lettura.righeLette} righe{lettura.righePerVoce ? " (una riga per ogni voce: le righe della stessa fattura sono state raggruppate)" : ""}
              {lettura.ignorate.length > 0 && <span style={{ color: C.muted }}> · {lettura.ignorate.length} righe di note o totali saltate</span>}
              {lettura.scartate.length > 0 && <span style={{ color: C.red }}> · {lettura.scartate.length} righe scartate (vedi sotto)</span>}
            </div>
          )}

          <div style={{ fontSize: 13, fontWeight: 700, margin: "14px 0 6px" }}>Colonne del foglio (proposte dal programma, si possono cambiare)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            {CAMPI.map(c => (
              <label key={c.k} style={{ fontSize: 11, color: C.muted }}>
                {c.k === "fornitore" && tipo === "ATTIVA" ? "Cliente" : c.label}
                <select value={colonne[c.k] || ""} onChange={e => { setColonne({ ...colonne, [c.k]: e.target.value }); setRisultato(null); }} style={stileSelect}>
                  <option value="">— nessuna —</option>
                  {foglio.descrizione.intestazioni.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>

          <div style={{ display: "flex", gap: 16, alignItems: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
            <label style={{ fontSize: 11, color: C.muted }}>
              Anni da controllare
              <select value={anno} onChange={e => { setAnno(e.target.value); setRisultato(null); }} style={{ ...stileSelect, width: 200 }}>
                <option value="tutti">Tutti gli anni del file{anniDelFile.length ? ` (${anniDelFile.join(", ")})` : ""}</option>
                {anniDelFile.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={soloFornitoriDelFile} onChange={e => { setSoloFornitoriDelFile(e.target.checked); setRisultato(null); }} />
              nell'elenco «nel programma ma non nel file» solo i {tipo === "ATTIVA" ? "clienti" : "fornitori"} presenti nel file
            </label>
            <button onClick={confrontaFatture} disabled={caricando || !colonne.numero}
              style={{ background: colonne.numero ? C.green : C.muted, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: colonne.numero ? "pointer" : "not-allowed" }}>
              {caricando ? "Confronto in corso..." : "🔍 Confronta con il programma"}
            </button>
          </div>
          {!colonne.numero && <p style={{ color: C.red, fontSize: 12, marginBottom: 0 }}>In questo foglio non c'è una colonna con il numero della fattura: sceglierla a mano o scegliere un altro foglio.</p>}
        </div>
      )}

      {r && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
            <Riquadro titolo="Fatture controllate" valore={r.controllate} nota={`foglio «${r.foglio}», anni ${(r.anni || ["tutti"]).join(", ")}`} />
            <Riquadro titolo="Presenti nel programma" valore={r.presenti.length} colore={C.green} />
            <Riquadro titolo="Mancanti" valore={r.mancanti.length} colore={r.mancanti.length ? C.red : C.green} />
            <Riquadro titolo="Da guardare" valore={r.daGuardare.length} colore={r.daGuardare.length ? C.yellow : C.green} />
            <Riquadro titolo="Presenti con importo diverso" valore={r.importiDiversi.length} colore={r.importiDiversi.length ? C.yellow : C.green} />
            <Riquadro titolo="Nel programma, non nel file" valore={r.nelProgrammaNonNelFile.length} colore={C.blue} />
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
            {r.lettura.fatture.length} fatture nel file ({r.lettura.righeLette} righe){r.fuoriPeriodo.length ? `, ${r.fuoriPeriodo.length} di altri anni non controllate` : ""}
            {r.completate ? ` · ${r.completate} fatture completate con dati presi dagli altri fogli del file (partita IVA o importi)` : ""}
            {r.doppioniFile.length ? ` · ${r.doppioniFile.length} fatture scritte due volte nel file` : ""}
            {` · confrontate con ${r.documentiLetti} documenti del programma`}
            <button onClick={esporta} style={{ marginLeft: 12, background: "transparent", color: C.primary, border: `1.5px solid ${C.primary}`, borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              ⬇️ Scarica tutto in Excel
            </button>
          </div>
          {r.mancanti.length === 0 && r.daGuardare.length === 0 && (
            <div style={{ background: "#E8F3EA", border: `1px solid ${C.green}`, borderRadius: 8, padding: "10px 16px", fontSize: 13, marginBottom: 12 }}>
              ✓ Tutte le {r.controllate} fatture del file sono nel programma.
            </div>
          )}

          <Sezione id="mancanti" titolo="Mancanti: non ci sono nel programma" n={r.mancanti.length} colore={C.red} aperte={aperte} setAperte={setAperte}
            spiegazione="Nessun documento con questo numero e questa data. Sono da caricare.">
            <Tabella intestazioni={["Fornitore o cliente", "Partita IVA", "Numero", "Data", "Totale", "Imponibile", "Righe del foglio", "Nota"]}
              righe={r.mancanti.map(m => [m.f.fornitore, m.f.piva, m.f.numero, dataIt(m.f.data), euro(m.f.totale), euro(m.f.imponibile), m.f.righeFoglio.join(", "), m.nota])} />
          </Sezione>

          <Sezione id="daGuardare" titolo="Da guardare: quasi uguali" n={r.daGuardare.length} colore={C.yellow} aperte={aperte} setAperte={setAperte}
            spiegazione="Nel programma c'è un documento molto simile (data, numero o fornitore scritti in modo diverso). Decide Lei se è la stessa fattura.">
            <Tabella intestazioni={["Nel file", "Numero", "Data", "Totale", "Nel programma", "Numero", "Data", "Totale", "Motivo"]}
              righe={r.daGuardare.map(g => [g.f.fornitore, g.f.numero, dataIt(g.f.data), euro(g.f.totale ?? g.f.imponibile), g.d.controparte, g.d.numero, dataIt(g.d.data), euro(g.d.totale_lordo), g.motivo])} />
          </Sezione>

          <Sezione id="importi" titolo="Presenti, ma con importo diverso" n={r.importiDiversi.length} colore={C.yellow} aperte={aperte} setAperte={setAperte}
            spiegazione="La fattura c'è, ma il totale o l'imponibile del programma non è uguale a quello del file (tolleranza 5 centesimi).">
            <Tabella intestazioni={["Fornitore o cliente", "Numero", "Data", "Differenze", "Spiegazione"]}
              righe={r.importiDiversi.map(p => [p.d.controparte, p.f.numero, dataIt(p.f.data),
                p.importi.controlli.filter(c => !c.uguale).map(c => `${c.cosa}: file ${euro(c.file)}, programma ${euro(c.programma)}`).join(" · "), p.importi.spiegazione])} />
          </Sezione>

          <Sezione id="nomi" titolo="Presenti, con il nome scritto in modo diverso" n={r.nomiDiversi.length} colore={C.blue} aperte={aperte} setAperte={setAperte}
            spiegazione="La fattura c'è; il nome nel file è scritto diversamente da quello dell'anagrafica. Solo informazione.">
            <Tabella intestazioni={["Nel file", "Nel programma", "Numero", "Data", "Nota"]}
              righe={r.nomiDiversi.map(p => [p.f.fornitore, p.d.controparte, p.f.numero, dataIt(p.f.data), p.note.join(", ")])} />
          </Sezione>

          <Sezione id="programma" titolo="Nel programma, ma non nel file" n={r.nelProgrammaNonNelFile.length} colore={C.blue} aperte={aperte} setAperte={setAperte}
            spiegazione={`Documenti del programma degli anni controllati che il file non contiene: possono essere doppioni, registrazioni senza fattura elettronica (polizze, acquisti di animali dal Report) o fatture mancanti nel file.${soloFornitoriDelFile ? " Solo i fornitori presenti nel file." : ""}`}>
            <Tabella intestazioni={["Fornitore o cliente", "Numero", "Data", "Totale", "Imponibile", "Origine"]}
              righe={r.nelProgrammaNonNelFile.map(d => [d.controparte, d.numero ?? "senza numero", dataIt(d.data), euro(d.totale_lordo), euro(d.totale_netto), d.acquisto_animali ? "Report acquisto animali" : "Fatture"])} />
          </Sezione>

          {(r.lettura.scartate.length > 0 || r.doppioniFile.length > 0) && (
            <Sezione id="scartate" titolo="Righe del file scartate o ripetute" n={r.lettura.scartate.length + r.doppioniFile.length} colore={C.red} aperte={aperte} setAperte={setAperte}
              spiegazione="Righe senza numero o con una data che non si legge (non controllate), e fatture scritte due volte nel file.">
              <Tabella intestazioni={["Riga del foglio", "Fornitore o cliente", "Numero", "Data", "Motivo"]}
                righe={[...r.lettura.scartate.map(s => [s.numeroRiga, s.fornitore, s.numero, s.data, s.motivo]),
                  ...r.doppioniFile.map(f => [f.righeFoglio.join(", "), f.fornitore, f.numero, dataIt(f.data), "fattura scritta più volte nel file"])]} />
            </Sezione>
          )}
        </div>
      )}
      <p style={{ fontSize: 11, color: C.muted, marginTop: 16 }}>
        Come si riconosce una fattura: stesso numero (senza badare a zeri iniziali, spazi, barre, trattini, punti e maiuscole), stessa data e stesso
        fornitore. Il fornitore si riconosce dalla partita IVA quando c'è nel file e nell'anagrafica; altrimenti dal nome, senza badare a SRL, S.R.L.,
        UNIPERSONALE, punteggiatura e maiuscole. Comprende gli acquisti di animali del Report Acquisto Animali. Il confronto legge soltanto.
      </p>
    </div>
  );
}

function Riquadro({ titolo, valore, colore = C.text, nota }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: C.muted }}>{titolo}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: colore }}>{valore}</div>
      {nota && <div style={{ fontSize: 10, color: C.muted }}>{nota}</div>}
    </div>
  );
}

function Sezione({ id, titolo, n, colore, spiegazione, aperte, setAperte, children }) {
  const aperta = !!aperte[id];
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${n ? colore : C.border}`, borderRadius: 10, marginBottom: 10 }}>
      <button onClick={() => setAperte({ ...aperte, [id]: !aperta })}
        style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "10px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer", color: C.text }}>
        {aperta ? "▾" : "▸"} {titolo} <span style={{ color: n ? colore : C.muted }}>({n})</span>
      </button>
      {aperta && (
        <div style={{ padding: "0 14px 12px" }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{spiegazione}</div>
          {n === 0 ? <div style={{ fontSize: 12, color: C.muted }}>Nessuna.</div> : children}
        </div>
      )}
    </div>
  );
}

function Tabella({ intestazioni, righe }) {
  return (
    <div style={{ overflow: "auto", maxHeight: 520, border: `1px solid ${C.border}`, borderRadius: 8 }}>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead style={{ background: C.primary, color: "#fff", position: "sticky", top: 0 }}>
          <tr>{intestazioni.map((h, i) => <th key={i} style={{ padding: "6px 8px", textAlign: "left", fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {righe.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 ? "#FBFAF7" : "#fff" }}>
              {r.map((v, j) => <td key={j} style={{ padding: "5px 8px", verticalAlign: "top" }}>{v === null || v === undefined || v === "" ? "—" : String(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
