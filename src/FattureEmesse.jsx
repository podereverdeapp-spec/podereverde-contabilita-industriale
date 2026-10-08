import { useState, useEffect, Fragment } from "react";
import { C } from "./style";
import { formattaNumero, formattaEuro } from "./parsingUtils";
import { esportaExcel } from "./esportaExcel";
import { caricaFattureEmesse, annullaFattura } from "./calcoloEmissioneFatture";
import { scaricaFile, scaricaZip } from "./xmlFatturaPA";

// Emissione Fatture → Fatture Emesse (una pagina per «Animali Allevamento» e una per «Altre Fatturazioni»)
// Le fatture emesse dal programma: si riscarica il file XML per Aruba (anche più fatture in un .zip)
// e, se serve, si annulla la registrazione (i capi tornano da fatturare). Nessuna cancellazione.

function dataItaliana(iso) {
  if (!iso) return "—";
  const [a, m, g] = String(iso).slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}
const btn = (pieno, colore = C.primary) => ({ height: 32, padding: "0 12px", borderRadius: 8, border: `1.5px solid ${colore}`, background: pieno ? colore : "#fff", color: pieno ? "#fff" : colore, fontSize: 12, fontWeight: 700 });

export default function FattureEmesse({ tipo = "animali_allevamento" }) {
  const altre = tipo !== "animali_allevamento";
  const [fatture, setFatture] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [anno, setAnno] = useState("tutti");
  const [mostraAnnullate, setMostraAnnullate] = useState(false);
  const [selezionate, setSelezionate] = useState(() => new Set());
  const [aperte, setAperte] = useState(() => new Set());
  const [annullaId, setAnnullaId] = useState(null);
  const [motivo, setMotivo] = useState("");

  async function carica() {
    setLoading(true); setErrore(null);
    try { setFatture(await caricaFattureEmesse()); } catch (err) { setErrore(err.message); }
    setLoading(false);
  }
  useEffect(() => { carica(); }, []);

  const anni = [...new Set(fatture.filter(f => f.tipo === tipo).map(f => String(f.anno)))].sort().reverse();
  const visibili = fatture.filter(f => f.tipo === tipo && (anno === "tutti" || String(f.anno) === anno) && (mostraAnnullate || f.stato === "emessa"));
  const totale = visibili.filter(f => f.stato === "emessa").reduce((s, f) => s + Number(f.totale), 0);

  function alterna(setter, id) { setter(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  async function conferma(f) {
    if (!motivo.trim()) return;
    try { await annullaFattura(f.id, motivo.trim()); setAnnullaId(null); setMotivo(""); await carica(); }
    catch (err) { setErrore(err.message); }
  }

  function esporta() {
    const righeExcel = altre
      ? visibili.flatMap(f => (f.ci_fatture_emesse_righe || []).sort((a, b) => a.numero_linea - b.numero_linea).map(r => ({
        "Numero fattura": f.numero, "Riga": r.numero_linea, "Descrizione": r.descrizione, "Quantità": Number(r.quantita_kg), "Unità di misura": r.unita_misura || "",
        "Prezzo unitario": Number(r.prezzo_kg), "Aliquota IVA %": Number(r.aliquota_iva), "Natura": r.natura_iva || "", "Importo": Number(r.importo) })))
      : null;
    esportaExcel(altre ? "Fatture_emesse_altre_fatturazioni" : "Fatture_emesse_animali", [
      { nome: "Fatture", righe: visibili.map(f => ({ "Numero": f.numero, "Data": dataItaliana(f.data), "Cliente": f.cliente_denominazione, "Partita IVA": f.cliente_partita_iva,
        "Imponibile": Number(f.imponibile), "IVA": Number(f.imposta), "Totale": Number(f.totale), ...(altre ? { "Bollo": Number(f.bollo || 0), "Nota interna": f.note || "" } : {}), "Stato": f.stato, "Motivo dell'annullamento": f.motivo_annullamento || "", "Nome del file XML": f.nome_file_xml })) },
      { nome: "Righe", righe: righeExcel || visibili.flatMap(f => (f.ci_fatture_emesse_righe || []).sort((a, b) => a.numero_linea - b.numero_linea).map(r => ({
        "Numero fattura": f.numero, "Riga": r.numero_linea, "Descrizione": r.descrizione, "Matricola": r.matricola, "Lotto": r.lotto || "", "Modello 4": r.modello4_numero,
        "Pezzo": r.pezzo || (r.uscita_consegna_pezzo_id ? "" : "capo intero"), "Numero di partita": r.numero_partita, "Data di uscita": dataItaliana(r.data_uscita), "Chili": Number(r.quantita_kg), "Prezzo al kg": Number(r.prezzo_kg), "Importo": Number(r.importo),
        "Identificativo del capo nell'app": r.uscita_consegna_id, "Identificativo del pezzo nell'app": r.uscita_consegna_pezzo_id }))) },
    ]);
  }

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Lettura delle fatture emesse...</div>;
  const scelte = visibili.filter(f => selezionate.has(f.id) && f.xml);

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Fatture Emesse — {altre ? "Altre Fatturazioni" : "Animali Allevamento"}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => scaricaZip(`Fatture_per_Aruba_${new Date().toISOString().slice(0, 10)}.zip`, scelte)} disabled={!scelte.length} style={btn(true, scelte.length ? C.green : "#B8B3A7")}>
            Scarica per Aruba le selezionate ({scelte.length}) .zip
          </button>
          <button onClick={esporta} disabled={!visibili.length} style={btn(false)}>📥 Esporta Excel</button>
        </div>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
        {altre ? "Le fatture libere emesse dal programma (rifatturazioni, vendite diverse dai capi al macello, servizi)." : "Le fatture emesse dal programma con i capi fatturati."} «XML per Aruba» riscarica il file da caricare in Aruba Fatturazione Elettronica («Carica fattura»).
        «Annulla registrazione» serve solo se la fattura non è stata inviata con Aruba o è stata stornata{altre ? "." : ": i capi e i pezzi tornano tra quelli da fatturare."}
      </p>
      {errore && <div style={{ color: C.red, marginBottom: 12, fontWeight: 700 }}>⚠️ {errore}</div>}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12, fontSize: 13 }}>
        <select value={anno} onChange={e => setAnno(e.target.value)} style={{ height: 34, borderRadius: 8, border: `1.5px solid ${C.border}`, padding: "0 10px" }}>
          <option value="tutti">Tutti gli anni</option>{anni.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={mostraAnnullate} onChange={e => setMostraAnnullate(e.target.checked)} /> Mostra anche le annullate</label>
        <span style={{ padding: "5px 12px", borderRadius: 6, background: C.primary, color: "#fff", fontWeight: 700 }}>{(n => `${n} ${n === 1 ? "fattura" : "fatture"}`)(visibili.filter(f => f.stato === "emessa").length)} · {formattaEuro(totale)}</span>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr style={{ background: C.primary, color: "#fff", textAlign: "left" }}>
            <th style={th}></th><th style={th}>Numero</th><th style={th}>Data</th><th style={th}>Cliente</th><th style={{ ...th, textAlign: "right" }}>{altre ? "Righe" : "Righe (pezzi o capi)"}</th>
            <th style={{ ...th, textAlign: "right" }}>Imponibile</th><th style={{ ...th, textAlign: "right" }}>IVA</th><th style={{ ...th, textAlign: "right" }}>Totale</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {visibili.map((f, i) => {
              const annullata = f.stato === "annullata";
              const righe = (f.ci_fatture_emesse_righe || []).sort((a, b) => a.numero_linea - b.numero_linea);
              return (
                <Fragment key={f.id}>
                  <tr style={{ borderTop: `1px solid ${C.border}`, background: i % 2 ? C.bg : "#fff", opacity: annullata ? 0.6 : 1 }}>
                    <td style={td}>{!annullata && <input type="checkbox" checked={selezionate.has(f.id)} onChange={() => alterna(setSelezionate, f.id)} />}</td>
                    <td style={{ ...td, fontWeight: 800, cursor: "pointer" }} onClick={() => alterna(setAperte, f.id)}>{aperte.has(f.id) ? "▾" : "▸"} {f.numero}
                      {annullata && <div style={{ fontSize: 11, color: C.red }}>ANNULLATA: {f.motivo_annullamento}</div>}</td>
                    <td style={td}>{dataItaliana(f.data)}</td><td style={td}>{f.cliente_denominazione}</td>
                    <td style={{ ...td, textAlign: "right" }}>{righe.length}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(f.imponibile)}</td><td style={{ ...td, textAlign: "right" }}>{formattaEuro(f.imposta)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{formattaEuro(f.totale)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {f.xml && <button onClick={() => scaricaFile(f.nome_file_xml, f.xml)} style={btn(true)}>XML per Aruba</button>}
                      {!annullata && <button onClick={() => { setAnnullaId(annullaId === f.id ? null : f.id); setMotivo(""); }} style={{ ...btn(false, C.red), marginLeft: 6 }}>Annulla registrazione</button>}
                    </td>
                  </tr>
                  {annullaId === f.id && (
                    <tr><td colSpan={9} style={{ ...td, background: "#FBE1DE" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <b style={{ color: C.red }}>Annullare la registrazione di {f.numero}?</b>
                        <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (obbligatorio): es. non inviata ad Aruba, stornata con nota di credito…" style={{ height: 32, flex: "1 1 380px", borderRadius: 7, border: `1.5px solid ${C.border}`, padding: "0 9px" }} />
                        <button onClick={() => conferma(f)} disabled={!motivo.trim()} style={btn(true, C.red)}>Conferma annullamento</button>
                      </div>
                      <div style={{ fontSize: 11.5, color: C.text, marginTop: 4 }}>Se la fattura è già stata inviata allo SdI con Aruba, per stornarla serve una nota di credito: annullare qui solo la registrazione non basta.</div>
                    </td></tr>
                  )}
                  {aperte.has(f.id) && (
                    <tr><td colSpan={9} style={{ padding: "6px 14px 12px 40px" }}>
                      <table style={{ fontSize: 12, background: C.bg }}>
                        <thead><tr style={{ color: C.muted, textAlign: "left" }}><th style={th2}>Riga</th><th style={th2}>Descrizione</th>
                          <th style={{ ...th2, textAlign: "right" }}>{altre ? "Quantità" : "Kg"}</th>{altre && <th style={th2}>Unità di misura</th>}
                          <th style={{ ...th2, textAlign: "right" }}>{altre ? "Prezzo unitario" : "€/kg"}</th>{altre && <th style={{ ...th2, textAlign: "right" }}>IVA %</th>}
                          <th style={{ ...th2, textAlign: "right" }}>Importo</th></tr></thead>
                        <tbody>{righe.map(r => (
                          <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                            <td style={td2}>{r.numero_linea}</td><td style={td2}>{r.descrizione}</td>
                            <td style={{ ...td2, textAlign: "right" }}>{formattaNumero(r.quantita_kg, 2)}</td>{altre && <td style={td2}>{r.unita_misura || "—"}</td>}
                            <td style={{ ...td2, textAlign: "right" }}>{formattaNumero(r.prezzo_kg, 2)}</td>
                            {altre && <td style={{ ...td2, textAlign: "right" }}>{Number(r.aliquota_iva)}{r.natura_iva ? ` (${r.natura_iva})` : ""}</td>}
                            <td style={{ ...td2, textAlign: "right" }}>{formattaNumero(r.importo, 2)}</td>
                          </tr>))}</tbody>
                      </table>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
            {visibili.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: C.muted, padding: 20 }}>Nessuna fattura emessa dal programma.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: "8px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" };
const td = { padding: "7px 10px", verticalAlign: "top" };
const th2 = { padding: "4px 8px", fontSize: 11, fontWeight: 700 };
const td2 = { padding: "4px 8px", verticalAlign: "top" };
