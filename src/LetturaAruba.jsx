import { useEffect, useState } from "react";
import { C } from "./style";
import { formattaEuro } from "./parsingUtils";
import { input, btn, scheda, titolo, th, td, testata, chip, dataIt } from "./stileAruba";
import { quandoItaliano } from "./calcoloEmissioneFatture";
import {
  leggiFileAruba, caricaArchivio, caricaSpecieMatricole, confronta, emesseNonInAruba, ultimoNumeroPerAnno,
  registraLettura, caricaUltimaLettura, nomeTipo, DESTINAZIONI, statoProblema,
} from "./calcoloAruba";

// Versione 300 — Controllo Fatturazione Attiva e Numero Progressivo → Leggi le Fatture di Aruba.
// Si sceglie il file .zip preparato da Claude (file XML delle fatture emesse in Aruba + elenco degli stati):
// il programma confronta ogni fattura con quelle del programma e della contabilità, mostra le differenze e,
// alla conferma, registra le nuove, collega quelle emesse dal programma e aggiorna stato e numero progressivo.

const ESITI = {
  nuova: { testo: "Nuove: da registrare", colore: C.blue },
  programma: { testo: "Emesse dal programma: da collegare", colore: C.green },
  presente: { testo: "Già in contabilità: si aggiorna lo stato", colore: C.primary },
  annullata: { testo: "Annullate nel programma ma presenti in Aruba", colore: C.red },
  doppia: { testo: "Doppie nel file", colore: C.red },
  scartata: { testo: "Scartate dal Sistema di Interscambio: non valide, non si registrano", colore: C.muted },
};

export default function LetturaAruba({ onNavigate }) {
  const [ultima, setUltima] = useState(null);
  const [lettura, setLettura] = useState(null);
  const [risultati, setRisultati] = useState(null);
  const [archivio, setArchivio] = useState(null);
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState(null);
  const [esito, setEsito] = useState(null);
  const [aperte, setAperte] = useState(() => new Set());

  useEffect(() => { caricaUltimaLettura().then(setUltima); }, []);

  async function scegli(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setLavoro(true); setErrore(null); setEsito(null); setRisultati(null);
    try {
      const [l, arch, specie] = await Promise.all([leggiFileAruba(files), caricaArchivio(), caricaSpecieMatricole()]);
      setLettura(l); setArchivio(arch);
      setRisultati(confronta(l.fatture, arch, specie));
    } catch (err) { setErrore(err.message); }
    setLavoro(false);
  }

  function cambiaDestinazione(chiave, i, valore) {
    setRisultati(prev => prev.map(f => f.chiave !== chiave ? f : { ...f, righe: f.righe.map((r, j) => j !== i ? r : { ...r, destinazione: valore, motivo: "scelta a mano" }) }));
  }

  async function registra() {
    const nuove = risultati.filter(f => f.esito === "nuova");
    const senza = nuove.filter(f => f.righe.some(r => !r.destinazione)).length;
    if (senza) { window.alert(`${senza} fatture nuove hanno righe senza destinazione: sceglierla prima di registrare.`); return; }
    const q = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;
    const msg = `Registrare la lettura di Aruba?\n\n• ${q(nuove.length, "fattura nuova da registrare", "fatture nuove da registrare")} in contabilità\n• ${q(risultati.filter(f => f.esito === "programma" || f.esito === "annullata").length, "fattura del programma da collegare", "fatture del programma da collegare")}\n• ${q(risultati.filter(f => f.esito === "presente").length, "fattura già in contabilità da aggiornare", "fatture già in contabilità da aggiornare")}\n\nI dati mancanti dei clienti si completano con quelli delle fatture.`;
    if (!window.confirm(msg)) return;
    setLavoro(true); setErrore(null);
    try {
      const daRegistrare = risultati.filter(f => f.esito !== "doppia" && f.esito !== "scartata");
      const e = await registraLettura({ risultati: daRegistrare, archivio, nomeFile: lettura.nomeFile, ultimi: ultimoNumeroPerAnno(daRegistrare) });
      setEsito(e); setRisultati(null); setLettura(null);
      setUltima(await caricaUltimaLettura());
    } catch (err) { setErrore(err.message); }
    setLavoro(false);
  }

  const gruppi = risultati ? Object.keys(ESITI).map(k => ({ k, ...ESITI[k], fatture: risultati.filter(f => f.esito === k) })).filter(g => g.fatture.length) : [];
  const conDifferenze = risultati ? risultati.filter(f => f.differenze.length) : [];
  const conProblemi = risultati ? risultati.filter(f => statoProblema(f.stato) && f.esito !== "scartata") : [];
  const nonTrovate = risultati && archivio ? emesseNonInAruba(lettura.fatture, archivio) : [];
  const ultimi = risultati ? ultimoNumeroPerAnno(risultati) : {};
  const righeSenza = risultati ? risultati.filter(f => f.esito === "nuova").reduce((s, f) => s + f.righe.filter(r => !r.destinazione).length, 0) : 0;
  const apri = k => setAperte(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Leggi le Fatture di Aruba</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
        Si sceglie il file .zip preparato da Claude con il prompt «Prompt per Claude: Fatture Emesse in Aruba» (file XML delle fatture emesse
        e «Elenco_Fatture_Emesse_Aruba.csv» con gli stati). Il programma confronta ogni fattura con quelle emesse dal programma e con quelle registrate
        in contabilità e mostra cosa farà. Niente si scrive finché non si preme «Registra la lettura».
      </p>

      <div style={{ ...scheda, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ ...btn(true), display: "inline-flex", alignItems: "center", opacity: lavoro ? 0.6 : 1 }}>
          📥 Scegli il file .zip di Aruba
          <input type="file" accept=".zip,.xml,.csv,.p7m" multiple onChange={scegli} disabled={lavoro} style={{ display: "none" }} />
        </label>
        <span style={{ fontSize: 12.5, color: C.muted }}>
          {ultima ? <>Ultima lettura: <b>{quandoItaliano(ultima.letta_il)}</b> — {ultima.fatture_lette} fatture ({ultima.anni}), {ultima.registrate} registrate, {ultima.del_programma} del programma collegate.</> : "Nessuna lettura di Aruba registrata finora."}
        </span>
        {lavoro && <span style={{ fontWeight: 700, color: C.primary }}>Lettura in corso…</span>}
      </div>
      {errore && <div style={{ color: C.red, fontWeight: 700, marginBottom: 12 }}>⚠️ {errore}</div>}

      {esito && (
        <div style={{ ...scheda, borderLeft: `6px solid ${esito.errori.length ? C.yellow : C.green}` }}>
          <div style={{ fontWeight: 800, color: C.green, fontSize: 15 }}>✅ Lettura registrata</div>
          <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
            Fatture nuove registrate: <b>{esito.registrate.length}</b>{esito.registrate.length ? ` (${esito.registrate.join(", ")})` : ""}<br />
            Fatture del programma collegate: <b>{esito.collegate.length}</b>{esito.collegate.length ? ` (${esito.collegate.join(", ")})` : ""}<br />
            Fatture già in contabilità aggiornate: <b>{esito.aggiornate.length}</b><br />
            {esito.clientiCompletati.length > 0 && <>Dati dei clienti completati: {esito.clientiCompletati.join("; ")}<br /></>}
          </div>
          {esito.errori.map((e, i) => <div key={i} style={{ color: C.red, fontWeight: 700, fontSize: 13 }}>⚠️ {e}</div>)}
          {onNavigate && <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button onClick={() => onNavigate("controllo-attiva")} style={btn(false)}>Vai ai controlli</button>
            <button onClick={() => onNavigate("numero-progressivo")} style={btn(false)}>Vai al numero progressivo</button>
          </div>}
        </div>
      )}

      {risultati && (
        <>
          <div style={scheda}>
            <div style={titolo}>1. Che cosa c'è nel file</div>
            <div>
              <span style={chip(C.primary)}>{risultati.length === 1 ? "1 documento letto" : `${risultati.length} documenti letti`}</span>
              {gruppi.map(g => <span key={g.k} style={chip(g.colore, false)}>{g.fatture.length} — {g.testo}</span>)}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted }}>
              File letto: {lettura.nomeFile}. {lettura.elenco ? `Elenco degli stati: ${lettura.elenco.length} righe.` : "Nel file manca l'elenco degli stati (Elenco_Fatture_Emesse_Aruba.csv): lo stato di Aruba non si aggiorna."}
            </div>
            {lettura.autofatture.length > 0 && <div style={{ fontSize: 12.5, color: C.muted }}>{lettura.autofatture.length === 1 ? "1 autofattura" : `${lettura.autofatture.length} autofatture`} ({lettura.autofatture.map(a => a.numero).join(", ")}): Podere Verde è il cliente, non sono vendite e non si registrano.</div>}
            {lettura.scartati.map((s, i) => <div key={i} style={{ color: C.red, fontSize: 12.5, fontWeight: 700 }}>⚠️ File {s.file} non letto: {s.motivo}.</div>)}
            {lettura.mancantiNeiFile.map((r, i) => <div key={i} style={{ color: C.red, fontSize: 12.5, fontWeight: 700 }}>⚠️ {r.numero} del {dataIt(r.data)} è nell'elenco ma il suo file XML manca.</div>)}
          </div>

          <div style={scheda}>
            <div style={titolo}>2. Ultimo numero in Aruba per anno</div>
            <table style={{ width: "auto" }}>
              <thead><tr style={testata}><th style={th}>Anno</th><th style={th}>Ultimo numero</th><th style={th}>Data</th><th style={th}>Prossimo numero</th></tr></thead>
              <tbody>{Object.keys(ultimi).sort((a, b) => b - a).map(a => (
                <tr key={a} style={{ borderTop: `1px solid ${C.border}` }}><td style={td}>{a}</td><td style={{ ...td, fontWeight: 700 }}>{ultimi[a].numero}</td><td style={td}>{dataIt(ultimi[a].data)}</td><td style={td}>{ultimi[a].n + 1}</td></tr>
              ))}</tbody>
            </table>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Dopo la registrazione il programma propone da solo il numero successivo nelle fatture nuove («Prepara Fatture» e «Nuova Fattura»).</div>
          </div>

          {(conDifferenze.length > 0 || conProblemi.length > 0 || nonTrovate.length > 0) && (
            <div style={{ ...scheda, borderLeft: `6px solid ${C.red}` }}>
              <div style={{ ...titolo, color: C.red }}>3. Da guardare</div>
              {conProblemi.map(f => <div key={"s" + f.chiave} style={{ fontSize: 13, marginBottom: 4 }}>🔴 <b>{f.numero}</b> del {dataIt(f.data)} — {f.cliente.nome}: in Aruba lo stato è «{f.stato}».</div>)}
              {conDifferenze.map(f => <div key={"d" + f.chiave} style={{ fontSize: 13, marginBottom: 4 }}>🟠 <b>{f.numero}</b> del {dataIt(f.data)} — {f.cliente.nome}: {f.differenze.join("; ")}.</div>)}
              {nonTrovate.map(f => <div key={"n" + f.id} style={{ fontSize: 13, marginBottom: 4 }}>🔴 <b>{f.numero}</b> del {dataIt(f.data)} — {f.cliente_denominazione}, {formattaEuro(f.totale)}: emessa dal programma, in Aruba non c'è.{f.inviata_amministrazione_il ? ` Mandata all'amministrazione il ${quandoItaliano(f.inviata_amministrazione_il)}.` : " Non ancora mandata all'amministrazione."}</div>)}
            </div>
          )}

          {gruppi.map(g => (
            <div key={g.k} style={scheda}>
              <div style={{ ...titolo, color: g.colore }}>{g.testo} ({g.fatture.length})</div>
              {g.k === "nuova" && <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>Ogni riga ha la destinazione proposta (dalla matricola nell'anagrafe o da una parola della descrizione). Le righe in giallo vanno scelte a mano. La destinazione decide in quale specie entra il ricavo.</div>}
              <table>
                <thead><tr style={testata}><th style={th}>Numero</th><th style={th}>Data</th><th style={th}>Tipo</th><th style={th}>Cliente</th><th style={{ ...th, textAlign: "right" }}>Imponibile</th><th style={{ ...th, textAlign: "right" }}>IVA</th><th style={{ ...th, textAlign: "right" }}>Totale</th><th style={th}>Stato in Aruba</th><th style={th}>Righe</th></tr></thead>
                <tbody>
                  {g.fatture.map(f => (
                    <FatturaRiga key={f.chiave} f={f} aperta={(g.k === "nuova" && f.righe.some(r => !r.destinazione)) || aperte.has(f.chiave)} onApri={() => apri(f.chiave)} modificabile={g.k === "nuova"} onDestinazione={(i, v) => cambiaDestinazione(f.chiave, i, v)} />
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <div style={{ ...scheda, borderLeft: `6px solid ${righeSenza ? C.yellow : C.green}` }}>
            {righeSenza > 0 && <div style={{ color: C.red, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Prima di registrare: {righeSenza} righe delle fatture nuove senza destinazione.</div>}
            <button onClick={registra} disabled={lavoro || righeSenza > 0} style={{ ...btn(true, C.green), opacity: lavoro || righeSenza > 0 ? 0.5 : 1 }}>
              {lavoro ? "Registrazione…" : "Registra la lettura"}
            </button>
            <span style={{ fontSize: 12.5, color: C.muted, marginLeft: 10 }}>Le fatture scartate e quelle doppie nel file non si registrano.</span>
          </div>
        </>
      )}
    </div>
  );
}

function FatturaRiga({ f, aperta, onApri, modificabile, onDestinazione }) {
  return (
    <>
      <tr style={{ borderTop: `1px solid ${C.border}`, background: f.differenze.length ? "#FFF6E5" : undefined }}>
        <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>{f.numero}</td>
        <td style={td}>{dataIt(f.data)}</td>
        <td style={td}>{nomeTipo(f.tipoDocumento)}</td>
        <td style={td}>{f.cliente.nome}</td>
        <td style={{ ...td, textAlign: "right" }}>{formattaEuro(f.imponibile)}</td>
        <td style={{ ...td, textAlign: "right" }}>{formattaEuro(f.imposta)}</td>
        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(f.totale)}</td>
        <td style={{ ...td, color: statoProblema(f.stato) ? C.red : C.text, fontWeight: statoProblema(f.stato) ? 700 : 400 }}>{f.stato || "—"}</td>
        <td style={td}><button onClick={onApri} style={{ ...btn(false), height: 26, padding: "0 8px", fontSize: 11.5 }}>{aperta ? "▾" : "▸"} {f.righe.length}</button></td>
      </tr>
      {aperta && (
        <tr><td colSpan={9} style={{ padding: "0 8px 10px 28px" }}>
          <table style={{ fontSize: 12 }}>
            <thead><tr style={{ color: C.muted }}><th style={th}>Riga</th><th style={th}>Descrizione</th><th style={{ ...th, textAlign: "right" }}>Quantità</th><th style={th}>Unità</th><th style={{ ...th, textAlign: "right" }}>Prezzo</th><th style={{ ...th, textAlign: "right" }}>Importo</th><th style={th}>IVA %</th><th style={th}>Destinazione</th></tr></thead>
            <tbody>{f.righe.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${C.border}`, background: modificabile && !r.destinazione ? "#FFF4D6" : undefined }}>
                <td style={td}>{r.numeroLinea}</td><td style={td}>{r.descrizione}</td>
                <td style={{ ...td, textAlign: "right" }}>{r.quantita}</td><td style={td}>{r.unitaMisura}</td>
                <td style={{ ...td, textAlign: "right" }}>{r.prezzoUnitario}</td><td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.totale)}</td>
                <td style={td}>{r.aliquota}{r.natura ? ` ${r.natura}` : ""}</td>
                <td style={td}>{modificabile ? (
                  <>
                    <select value={r.destinazione} onChange={e => onDestinazione(i, e.target.value)} style={{ ...input, height: 28, borderColor: r.destinazione ? C.border : C.red }}>
                      <option value="">— scegliere —</option>
                      {DESTINAZIONI.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <span style={{ fontSize: 11, color: C.muted, marginLeft: 6 }}>{r.motivo}</span>
                  </>
                ) : r.destinazione}</td>
              </tr>
            ))}</tbody>
          </table>
          {f.differenze.length > 0 && <div style={{ color: "#8B5A00", fontSize: 12, marginTop: 4 }}>Differenze: {f.differenze.join("; ")}.</div>}
        </td></tr>
      )}
    </>
  );
}
