import { useState } from "react";
import { C } from "./style";
import { btn, input, scheda, th, td, testata } from "./stileAruba";
import { etichettaCampo } from "./anagrafiche";
import { leggiFileAnagrafiche, preparaProposte, proposta, scriviProposte } from "./calcoloAnagraficheAruba";

// Versione 304 (decisione del Dott. Bizzarri del 26/10/2026, ore 16:11) — completa le anagrafiche di clienti e fornitori
// con i dati delle fatture di Aruba (emesse e ricevute) e della rubrica di Aruba. Si scrivono SOLO i campi vuoti,
// dopo la conferma; i valori diversi da quelli del programma si mostrano e basta.

const etichetta = c => (c === "partita_iva" ? "Partita IVA" : etichettaCampo(c).replace(/ \(.*\)$/, ""));

export default function CompletaAnagraficheAruba() {
  const [files, setFiles] = useState([]);
  const [stato, setStato] = useState("");
  const [lettura, setLettura] = useState(null);
  const [prop, setProp] = useState(null);
  const [scelte, setScelte] = useState({}); // non trovati: chiave -> id scheda da abbinare
  const [esito, setEsito] = useState(null);
  const [lavoro, setLavoro] = useState(false);

  async function leggi() {
    if (!files.length) { alert("Scegliere i file .zip delle fatture di Aruba (e, se c'è, il file Rubrica_Aruba.csv)."); return; }
    setLavoro(true); setEsito(null); setProp(null); setStato("Lettura dei file…");
    try {
      const l = await leggiFileAnagrafiche(files, n => setStato(`Lettura dei file… ${n} fatture`));
      setLettura(l); setStato("Confronto con le schede del programma…");
      setProp(await preparaProposte(l.soggetti)); setStato("");
    } catch (e) { setStato(""); alert(`⚠️ ${e.message}`); }
    setLavoro(false);
  }

  const cambia = (tipo, i, j) => setProp(p => ({ ...p, [tipo]: p[tipo].map((x, a) => (a !== i ? x : { ...x, campi: x.campi.map((c, b) => (b !== j ? c : { ...c, scelto: !c.scelto })) })) }));

  // Abbinamenti dei non trovati a una scheda senza Partita IVA
  const abbinati = () => (prop?.nonTrovati || []).filter(n => scelte[n.chiave]).map(n => {
    const s = prop.schedeSenzaPiva[n.tipo].find(r => String(r.id) === String(scelte[n.chiave]));
    return s ? { tipo: n.tipo, scheda: s, aruba: n.aruba, ...proposta(s, n.aruba, true) } : null;
  }).filter(Boolean);

  async function scrivi() {
    const lista = [...prop.cliente, ...prop.fornitore, ...abbinati()];
    const nCampi = lista.reduce((s, p) => s + p.campi.filter(c => c.scelto).length, 0);
    const nSchede = lista.filter(p => p.campi.some(c => c.scelto)).length;
    if (!nCampi) { alert("Nessun campo scelto."); return; }
    if (!window.confirm(`Scrivere ${nCampi} campi vuoti in ${nSchede} schede?\n\nSi scrivono solo campi oggi vuoti; i campi già scritti non si cambiano. Ogni modifica resta nel Registro delle Modifiche.`)) return;
    setLavoro(true); setStato("Scrittura…");
    try { const e = await scriviProposte(lista, (n, t) => setStato(`Scrittura… scheda ${n} di ${t}`)); setEsito(e); setStato(""); setProp(await preparaProposte(lettura.soggetti)); setScelte({}); }
    catch (e) { setStato(""); alert(`⚠️ ${e.message}`); }
    setLavoro(false);
  }

  const tabella = (tipo, titolo) => {
    const l = prop[tipo];
    const daScrivere = l.filter(p => p.campi.length);
    return (
      <div style={scheda}>
        <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>{titolo}: {daScrivere.length} schede con campi vuoti da completare ({daScrivere.reduce((s, p) => s + p.campi.length, 0)} campi) su {prop.totaleSchede[tipo]}</div>
        {!daScrivere.length ? <div style={{ fontSize: 13, color: C.muted }}>Nessun campo vuoto da completare.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr style={testata}><th style={th}>Scheda</th><th style={th}>Partita IVA</th><th style={th}>Campi vuoti che Aruba completa (togliere la spunta per non scriverli)</th><th style={{ ...th, textAlign: "right" }}>Fatture lette</th></tr></thead>
              <tbody>{l.map((p, i) => p.campi.length ? (
                <tr key={p.scheda.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ ...td, fontWeight: 700 }}>{p.scheda.nome}</td>
                  <td style={td}>{p.scheda.partita_iva || p.scheda.codice_fiscale}</td>
                  <td style={td}>{p.campi.map((c, j) => (
                    <label key={c.campo} style={{ display: "inline-flex", gap: 4, alignItems: "center", marginRight: 12, whiteSpace: "nowrap" }}>
                      <input type="checkbox" checked={c.scelto} onChange={() => cambia(tipo, i, j)} /><span style={{ color: C.muted }}>{etichetta(c.campo)}:</span> {c.valore}
                    </label>
                  ))}{p.aruba.ricezioneDaCliente && <div style={{ fontSize: 11, color: C.muted }}>Codice Univoco o PEC presi dalle fatture emesse a questa Partita IVA (è anche cliente).</div>}</td>
                  <td style={{ ...td, textAlign: "right" }}>{p.aruba.fatture || "rubrica"}</td>
                </tr>) : null)}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const diversi = prop ? [...prop.cliente, ...prop.fornitore].filter(p => p.diversi.length) : [];
  return (
    <div style={{ padding: 20, maxWidth: 1250, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Completa le Anagrafiche da Aruba</h1>
      <p style={{ color: C.muted, marginTop: 0, fontSize: 13, lineHeight: 1.5 }}>
        Si scelgono i file preparati da Claude: «Fatture_Emesse_Aruba_….zip» (cartella FATTURE EMESSE ARUBA), «Fatture_Ricevute_Aruba_….zip» e «Rubrica_Aruba.csv»
        (cartella FATTURE RICEVUTE ARUBA). Il programma legge clienti e fornitori di ogni fattura, li riconosce per Partita IVA o Codice Fiscale e propone di
        completare <b>solo i campi vuoti</b>: Codice Fiscale, indirizzo, CAP, città, provincia, nazione, telefoni, email, Codice Univoco e PEC. Un campo già scritto
        non si cambia mai. Il Codice Univoco e la PEC di un fornitore si trovano solo se il fornitore è anche cliente o è nella rubrica di Aruba.
      </p>
      <div style={{ ...scheda, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" multiple accept=".zip,.xml,.p7m,.csv" onChange={e => setFiles([...e.target.files])} style={input} />
        <span style={{ fontSize: 12, color: C.muted }}>{files.length ? files.map(f => f.name).join(", ") : "nessun file scelto (si possono scegliere più file insieme)"}</span>
        <button onClick={leggi} disabled={lavoro} style={{ ...btn(true), marginLeft: "auto" }}>📂 Leggi i file</button>
      </div>
      {stato && <p style={{ color: C.primary, fontWeight: 700 }}>{stato}</p>}
      {esito && <div style={{ ...scheda, borderColor: C.green, color: C.green, fontWeight: 700 }}>✓ Scritti {esito.campi} campi in {esito.schede} schede.{esito.errori.length ? <div style={{ color: C.red }}>Errori: {esito.errori.join(" · ")}</div> : null}</div>}
      {lettura && prop && (
        <>
          <div style={{ ...scheda, fontSize: 13 }}>Letti: {lettura.fatture} fatture{lettura.rubrica ? `, ${lettura.rubrica} schede della rubrica` : ""}{lettura.scartati ? `, ${lettura.scartati} file non letti (non sono fatture di Podere)` : ""}.</div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={scrivi} disabled={lavoro} style={btn(true, C.green)}>✓ Scrivi i campi vuoti scelti</button>
          </div>
          {tabella("cliente", "Clienti")}
          {tabella("fornitore", "Fornitori")}
          {prop.nonTrovati.length > 0 && (
            <div style={{ ...scheda, borderColor: "#E8A33D" }}>
              <div style={{ fontWeight: 800, color: "#9A6B00", marginBottom: 6 }}>Non trovati nel programma per Partita IVA o Codice Fiscale: {prop.nonTrovati.length}</div>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 0 }}>Se è la stessa persona o società di una scheda senza Partita IVA, sceglierla: si completano anche la Partita IVA e gli altri campi vuoti. Altrimenti lasciare «nessuna».</p>
              <table>
                <thead><tr style={testata}><th style={th}>In Aruba</th><th style={th}>Partita IVA o Codice Fiscale</th><th style={th}>Città</th><th style={th}>Abbinare a</th></tr></thead>
                <tbody>{prop.nonTrovati.map(n => (
                  <tr key={n.tipo + n.chiave} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td}>{n.tipo === "cliente" ? "🤝" : "🏢"} {n.aruba.nome}</td>
                    <td style={td}>{n.aruba.partita_iva || n.aruba.codice_fiscale}</td>
                    <td style={td}>{n.aruba.citta}</td>
                    <td style={td}><select value={scelte[n.chiave] || ""} onChange={e => setScelte(s => ({ ...s, [n.chiave]: e.target.value }))} style={input}>
                      <option value="">nessuna</option>
                      {prop.schedeSenzaPiva[n.tipo].map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                    </select></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {diversi.length > 0 && (
            <div style={scheda}>
              <div style={{ fontWeight: 800, color: C.muted, marginBottom: 6 }}>Valori diversi da quelli del programma: {diversi.length} schede (non si cambiano; si correggono a mano dalla scheda se serve)</div>
              <table>
                <thead><tr style={testata}><th style={th}>Scheda</th><th style={th}>Campo</th><th style={th}>Nel programma</th><th style={th}>In Aruba</th></tr></thead>
                <tbody>{diversi.flatMap(p => p.diversi.map(d => (
                  <tr key={p.tipo + p.scheda.id + d.campo} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td}>{p.tipo === "cliente" ? "🤝" : "🏢"} {p.scheda.nome}</td><td style={td}>{etichetta(d.campo)}</td><td style={td}>{d.programma}</td><td style={td}>{d.aruba}</td>
                  </tr>)))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
