import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { formattaNumero, formattaEuro } from "./parsingUtils";
import { caricaCedente, salvaCedente, datiMancantiCliente, componiNumero, caricaNumeroProposto } from "./calcoloEmissioneFatture";
import {
  ALIQUOTE, UNITA_MISURA, NATURE, SOGLIA_BOLLO, IMPORTO_BOLLO, rigaVuota, calcolaFatturaLibera, problemiFattura,
  caricaClienti, caricaFatturePrecedenti, emettiFatturaLibera,
} from "./calcoloAltreFatture";
import { generaXmlFattura, nomeFileXml, scaricaFile } from "./xmlFatturaPA";
import { ClienteForm, PannelloCedente } from "./PreparaFatture";

// Emissione Fatture → Altre Fatturazioni → Nuova Fattura
// Fattura scritta riga per riga (rifatturazione di costi, vendita di un equino, servizi…), con
// aliquota IVA per riga. Alla conferma si registra nel programma e si scarica il file XML per Aruba.

const oggiIso = () => new Date().toISOString().slice(0, 10);
function dataItaliana(iso) {
  if (!iso) return "—";
  const [a, m, g] = String(iso).slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}
const input = { height: 34, padding: "0 9px", borderRadius: 7, border: `1.5px solid ${C.border}`, fontSize: 13, background: "#fff", color: C.text, boxSizing: "border-box" };
const btn = (pieno, colore = C.primary) => ({ height: 34, padding: "0 14px", borderRadius: 8, border: `1.5px solid ${colore}`, background: pieno ? colore : "#fff", color: pieno ? "#fff" : colore, fontSize: 12.5, fontWeight: 700, cursor: "pointer" });
const scheda = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14 };
const titolo = { fontWeight: 800, color: C.primary, marginBottom: 8 };

export default function NuovaFatturaLibera({ onNavigate }) {
  const [cedente, setCedente] = useState(null);
  const [clienti, setClienti] = useState([]);
  const [precedenti, setPrecedenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [mostraCedente, setMostraCedente] = useState(false);

  const [clienteId, setClienteId] = useState("");
  const [cercaCliente, setCercaCliente] = useState("");
  const [nuovoCliente, setNuovoCliente] = useState(false);
  const [modificaCliente, setModificaCliente] = useState(false);
  const [dataFattura, setDataFattura] = useState(oggiIso());
  const [numeroN, setNumeroN] = useState("");
  const [note, setNote] = useState("");
  const [righe, setRighe] = useState([rigaVuota()]);
  const [bolloScelto, setBolloScelto] = useState(null); // null = come suggerito
  const [sceltaPrecedente, setSceltaPrecedente] = useState("");
  const [conferma, setConferma] = useState(false);
  const [lavoro, setLavoro] = useState(false);
  const [emessa, setEmessa] = useState(null);

  async function carica() {
    setLoading(true); setErrore(null);
    try {
      const [ced, cl, prec, numero] = await Promise.all([caricaCedente(), caricaClienti(), caricaFatturePrecedenti(), caricaNumeroProposto()]);
      setCedente(ced); setClienti(cl); setPrecedenti(prec);
      setNumeroN(numero ? String(numero) : "");
    } catch (err) { setErrore(err.message); }
    setLoading(false);
  }
  useEffect(() => { carica(); }, []);

  const cliente = clienti.find(c => String(c.id) === String(clienteId)) || null;
  const anno = Number(String(dataFattura).slice(0, 4)) || new Date().getFullYear();
  const prefisso = cedente?.prefissoNumero || "FPR";
  const numeroCompleto = numeroN ? componiNumero(prefisso, numeroN, anno) : "";
  const calcolo = useMemo(() => calcolaFatturaLibera(righe, bolloScelto), [righe, bolloScelto]);
  const bolloAttivo = calcolo.bollo > 0;

  const blocchi = [];
  if (!cliente) blocchi.push("scegliere il cliente");
  else { const m = datiMancantiCliente(cliente); if (m.length) blocchi.push(`dati del cliente mancanti: ${m.join(", ")}`); }
  if (cedente && !cedente.salvato) blocchi.push("dati di Podere Verde da controllare e salvare");
  blocchi.push(...problemiFattura({ calcolo, numero: numeroN, data: dataFattura }));

  const clientiFiltrati = clienti.filter(c => !cercaCliente.trim() || `${c.nome} ${c.partita_iva || ""}`.toUpperCase().includes(cercaCliente.trim().toUpperCase()));

  function cambiaRiga(i, campo, valore) {
    setRighe(prev => prev.map((r, j) => {
      if (j !== i) return r;
      const n = { ...r, [campo]: valore };
      if (campo === "aliquota" && valore !== "0") n.natura = "";
      return n;
    }));
    setConferma(false);
  }
  function togliRiga(i) { setRighe(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : [rigaVuota()]); setConferma(false); }
  function duplicaRiga(i) { setRighe(prev => [...prev.slice(0, i + 1), { ...prev[i] }, ...prev.slice(i + 1)]); setConferma(false); }

  function riprendi() {
    const f = precedenti.find(p => p.chiave === sceltaPrecedente);
    if (!f) return;
    setRighe(f.righe.length ? f.righe.map(r => ({ ...r })) : [rigaVuota()]);
    if (f.cliente_id && clienti.some(c => c.id === f.cliente_id)) setClienteId(String(f.cliente_id));
    setBolloScelto(null); setConferma(false);
  }

  async function emetti() {
    setLavoro(true); setErrore(null);
    try {
      const f = await emettiFatturaLibera({
        numero: numeroCompleto, anno, data: dataFattura, cliente, calcolo, note,
        creaXml: id => {
          const nomeFile = nomeFileXml(cedente, id);
          const xml = generaXmlFattura({ cedente, cliente, numero: numeroCompleto, data: dataFattura, calcolo, aliquota: null, progressivoInvio: nomeFile.split("_")[1].replace(".xml", "") });
          return { xml, nomeFile };
        },
      });
      scaricaFile(f.nome_file_xml, f.xml);
      setEmessa(f); setConferma(false);
    } catch (err) { setErrore(err.message); setConferma(false); }
    setLavoro(false);
  }

  function nuovaFattura() {
    setEmessa(null); setRighe([rigaVuota()]); setNote(""); setBolloScelto(null); setSceltaPrecedente(""); setClienteId("");
    carica();
  }

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Preparazione della pagina...</div>;

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Nuova Fattura — Altre Fatturazioni</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
        Fatture diverse da quelle degli animali consegnati al macello: rifatturazione di costi, vendita di un equino, servizi, ecc.
        Le righe si scrivono a mano, ognuna con la sua aliquota IVA. La numerazione è la stessa delle fatture degli animali.
        Alla conferma la fattura si registra nel programma e si scarica il file XML da caricare in Aruba Fatturazione Elettronica («Carica fattura»).
      </p>
      {errore && <div style={{ color: C.red, marginBottom: 12, fontWeight: 700 }}>⚠️ {errore}</div>}

      {cedente && (
        <PannelloCedente cedente={cedente} aperto={mostraCedente} setAperto={setMostraCedente}
          onSalva={async c => { await salvaCedente(c); setCedente({ ...c, salvato: true }); }} />
      )}

      {emessa ? (
        <div style={{ ...scheda, borderLeft: `6px solid ${C.green}` }}>
          <div style={{ fontWeight: 800, color: C.green, fontSize: 16 }}>✅ Fattura {emessa.numero} del {dataItaliana(emessa.data)} registrata — {formattaEuro(emessa.totale)}</div>
          <div style={{ fontSize: 13, margin: "6px 0 10px" }}>
            Il file <b>{emessa.nome_file_xml}</b> è stato scaricato. Lo carichi in Aruba con «Carica fattura» e controlli l'anteprima prima di «Invia».
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => scaricaFile(emessa.nome_file_xml, emessa.xml)} style={btn(true)}>Scarica di nuovo l'XML</button>
            <button onClick={nuovaFattura} style={btn(false)}>Prepara un'altra fattura</button>
            {onNavigate && <button onClick={() => onNavigate("altre-emesse")} style={btn(false)}>Vai alle fatture emesse</button>}
          </div>
        </div>
      ) : (
        <>
          {/* Cliente */}
          <div style={scheda}>
            <div style={titolo}>1. Cliente</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input value={cercaCliente} onChange={e => setCercaCliente(e.target.value)} placeholder="Cerca per nome o partita IVA" style={{ ...input, width: 240 }} />
              <select value={clienteId} onChange={e => { setClienteId(e.target.value); setNuovoCliente(false); setModificaCliente(false); setConferma(false); }} style={{ ...input, minWidth: 380 }}>
                <option value="">— scegliere il cliente —</option>
                {clientiFiltrati.map(c => <option key={c.id} value={c.id}>{c.nome}{c.partita_iva ? ` — P. IVA ${c.partita_iva}` : ""}</option>)}
              </select>
              <button onClick={() => { setNuovoCliente(!nuovoCliente); setModificaCliente(false); }} style={btn(false)}>{nuovoCliente ? "Chiudi" : "+ Nuovo cliente"}</button>
              {cliente && <button onClick={() => setModificaCliente(!modificaCliente)} style={btn(false)}>{modificaCliente ? "Chiudi" : "Modifica dati del cliente"}</button>}
            </div>
            {cliente && !modificaCliente && (
              <div style={{ fontSize: 12.5, marginTop: 8, color: C.text }}>
                {[cliente.indirizzo, cliente.cap, cliente.citta, cliente.provincia].filter(Boolean).join(" ") || "indirizzo non indicato"}
                {" · "}Codice destinatario: {cliente.codice_destinatario || "—"}{cliente.pec ? ` · PEC: ${cliente.pec}` : ""}
                {datiMancantiCliente(cliente).length > 0 && <span style={{ color: C.red, fontWeight: 700 }}> · mancano: {datiMancantiCliente(cliente).join(", ")}</span>}
              </div>
            )}
            {(nuovoCliente || (cliente && modificaCliente)) && (
              <div style={{ marginTop: 8 }}>
                <ClienteForm key={nuovoCliente ? "nuovo" : cliente.id} iniziale={nuovoCliente ? {} : cliente}
                  onSalvato={async salvato => {
                    const cl = await caricaClienti(); setClienti(cl); setClienteId(String(salvato.id));
                    setNuovoCliente(false); setModificaCliente(false);
                  }} />
              </div>
            )}
          </div>

          {/* Dati del documento */}
          <div style={scheda}>
            <div style={titolo}>2. Numero e data</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={lab}>Data della fattura<input type="date" value={dataFattura} onChange={e => { setDataFattura(e.target.value); setConferma(false); }} style={input} /></label>
              <label style={lab}>Numero
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 700 }}>{prefisso}</span>
                  <input value={numeroN} onChange={e => { setNumeroN(e.target.value.replace(/\D/g, "")); setConferma(false); }} style={{ ...input, width: 70 }} />
                  <span style={{ fontWeight: 700 }}>/{String(anno).slice(-2)}</span>
                </div>
              </label>
              <label style={{ ...lab, flex: "1 1 300px" }}>Nota interna (non va in fattura)<input value={note} onChange={e => setNote(e.target.value)} style={{ ...input, width: "100%" }} /></label>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
              Il numero proposto segue l'ultimo «{prefisso} n/{String(anno).slice(-2)}» emesso dal programma o registrato in contabilità. Lo controlli con l'ultimo numero usato in Aruba.
            </div>
          </div>

          {/* Righe */}
          <div style={scheda}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={titolo}>3. Righe della fattura</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <select value={sceltaPrecedente} onChange={e => setSceltaPrecedente(e.target.value)} style={{ ...input, maxWidth: 460 }}>
                  <option value="">Riprendi le righe da una fattura precedente…</option>
                  {precedenti.map(p => <option key={p.chiave} value={p.chiave}>{p.etichetta}</option>)}
                </select>
                <button onClick={riprendi} disabled={!sceltaPrecedente} style={btn(false)}>Riprendi</button>
              </div>
            </div>
            <div style={{ overflow: "auto" }}>
              <table style={{ fontSize: 12.5, width: "100%" }}>
                <thead><tr style={{ background: C.primary, color: "#fff", textAlign: "left" }}>
                  <th style={th}>Riga</th><th style={th}>Descrizione</th><th style={th}>Quantità</th><th style={th}>Unità di misura</th><th style={th}>Prezzo unitario €</th>
                  <th style={th}>IVA %</th><th style={th}>Natura (solo con IVA 0)</th><th style={{ ...th, textAlign: "right" }}>Importo €</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {righe.map((r, i) => {
                    const c = calcolo.righe[i];
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={td}>{i + 1}</td>
                        <td style={td}><textarea value={r.descrizione} onChange={e => cambiaRiga(i, "descrizione", e.target.value)} rows={2} style={{ ...input, height: "auto", width: 360, padding: 6, fontFamily: "inherit" }} /></td>
                        <td style={td}><input value={r.quantita} onChange={e => cambiaRiga(i, "quantita", e.target.value)} style={{ ...input, width: 80, textAlign: "right" }} /></td>
                        <td style={td}>
                          <select value={r.unitaMisura} onChange={e => cambiaRiga(i, "unitaMisura", e.target.value)} style={{ ...input, width: 110 }}>
                            {UNITA_MISURA.map(u => <option key={u} value={u}>{u || "nessuna"}</option>)}
                          </select>
                        </td>
                        <td style={td}><input value={r.prezzo} onChange={e => cambiaRiga(i, "prezzo", e.target.value)} style={{ ...input, width: 100, textAlign: "right" }} /></td>
                        <td style={td}>
                          <select value={r.aliquota} onChange={e => cambiaRiga(i, "aliquota", e.target.value)} style={{ ...input, width: 70 }}>
                            {ALIQUOTE.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </td>
                        <td style={td}>
                          {r.aliquota === "0" ? (
                            <select value={r.natura} onChange={e => cambiaRiga(i, "natura", e.target.value)} style={{ ...input, width: 260, borderColor: r.natura ? C.border : C.red }}>
                              <option value="">— scegliere —</option>
                              {NATURE.map(n => <option key={n.codice} value={n.codice}>{n.testo}</option>)}
                            </select>
                          ) : <span style={{ color: C.muted }}>—</span>}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{c?.importo != null ? formattaNumero(c.importo, 2) : "—"}</td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          <button onClick={() => duplicaRiga(i)} title="Duplica la riga" style={{ ...btn(false), height: 28, padding: "0 8px" }}>⧉</button>
                          <button onClick={() => togliRiga(i)} title="Togli la riga" style={{ ...btn(false, C.red), height: 28, padding: "0 8px", marginLeft: 4 }}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button onClick={() => { setRighe(prev => [...prev, rigaVuota()]); setConferma(false); }} style={{ ...btn(false), marginTop: 8 }}>+ Aggiungi riga</button>
          </div>

          {/* Riepilogo */}
          <div style={scheda}>
            <div style={titolo}>4. Riepilogo</div>
            <table style={{ fontSize: 13 }}>
              <thead><tr style={{ color: C.muted, textAlign: "left" }}><th style={th2}>Aliquota IVA</th><th style={th2}>Natura</th><th style={{ ...th2, textAlign: "right" }}>Imponibile</th><th style={{ ...th2, textAlign: "right" }}>Imposta</th></tr></thead>
              <tbody>
                {calcolo.riepilogo.map(g => (
                  <tr key={`${g.aliquota}|${g.natura}`} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td2}>{g.aliquota}%</td><td style={td2}>{g.natura || "—"}</td>
                    <td style={{ ...td2, textAlign: "right" }}>{formattaEuro(g.imponibile)}</td><td style={{ ...td2, textAlign: "right" }}>{formattaEuro(g.imposta)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: `2px solid ${C.primary}`, fontWeight: 800 }}>
                  <td style={td2} colSpan={2}>Totale fattura</td><td style={{ ...td2, textAlign: "right" }}>{formattaEuro(calcolo.imponibile)}</td><td style={{ ...td2, textAlign: "right" }}>{formattaEuro(calcolo.imposta)}</td>
                </tr>
                <tr><td style={{ ...td2, fontWeight: 800, fontSize: 15, color: C.primary }} colSpan={4}>Da pagare: {formattaEuro(calcolo.totale)}</td></tr>
              </tbody>
            </table>
            <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, fontSize: 12.5 }}>
              <input type="checkbox" checked={bolloAttivo} onChange={e => { setBolloScelto(e.target.checked); setConferma(false); }} />
              Imposta di bollo virtuale di {formattaEuro(IMPORTO_BOLLO)} indicata in fattura
              {calcolo.bolloSuggerito && <span style={{ color: C.yellow, fontWeight: 700 }}> — suggerita: importi senza IVA oltre {formattaEuro(SOGLIA_BOLLO)}</span>}
            </label>
          </div>

          {/* Emissione */}
          <div style={{ ...scheda, borderLeft: `6px solid ${blocchi.length ? C.yellow : C.green}` }}>
            {blocchi.length > 0 ? (
              <div style={{ fontSize: 13 }}>
                <b style={{ color: C.red }}>Prima di emettere:</b>
                <ul style={{ margin: "4px 0 0 18px" }}>{blocchi.map((b, i) => <li key={i}>{b}</li>)}</ul>
              </div>
            ) : !conferma ? (
              <button onClick={() => setConferma(true)} style={btn(true, C.green)}>Emetti la fattura {numeroCompleto} e scarica l'XML per Aruba</button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b>Confermi l'emissione della fattura {numeroCompleto} del {dataItaliana(dataFattura)} a {cliente.nome} per {formattaEuro(calcolo.totale)}?</b>
                <button onClick={emetti} disabled={lavoro} style={btn(true, C.green)}>{lavoro ? "Registrazione..." : "Sì, emetti"}</button>
                <button onClick={() => setConferma(false)} disabled={lavoro} style={btn(false)}>No, torna a modificare</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const lab = { display: "flex", flexDirection: "column", fontSize: 11.5, color: C.muted, gap: 3 };
const th = { padding: "7px 8px", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" };
const td = { padding: "6px 8px", verticalAlign: "top" };
const th2 = { padding: "4px 10px", fontSize: 11.5, fontWeight: 700 };
const td2 = { padding: "5px 10px" };
