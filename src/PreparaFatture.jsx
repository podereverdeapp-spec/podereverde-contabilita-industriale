import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { formattaNumero, formattaEuro } from "./parsingUtils";
import {
  caricaPreparazione, caricaCedente, salvaCedente, assegnaCliente, salvaCliente, datiMancantiCliente,
  calcolaFattura, emettiFattura, componiNumero,
} from "./calcoloEmissioneFatture";
import { generaXmlFattura, nomeFileXml, scaricaFile, scaricaZip } from "./xmlFatturaPA";

// Emissione Fatture → Fatturazione Animali Allevamento → Prepara Fatture
// Una fattura per cliente con i capi «pronto da fatturare». Prezzo al kg per prodotto: proposto
// per i clienti abituali (ultimo prezzo) ma sempre da confermare; da inserire per i nuovi.
// Alla conferma la fattura si registra nel programma e si scarica il file XML per Aruba.

const oggiIso = () => new Date().toISOString().slice(0, 10);
function dataItaliana(iso) {
  if (!iso) return "—";
  const [a, m, g] = String(iso).slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}
const SPECIE = { bovino: "Bovino", suino: "Suino", ovino: "Ovino" };
const input = { height: 34, padding: "0 9px", borderRadius: 7, border: `1.5px solid ${C.border}`, fontSize: 13, background: "#fff" };
const btn = (pieno, colore = C.primary) => ({ height: 34, padding: "0 14px", borderRadius: 8, border: `1.5px solid ${colore}`, background: pieno ? colore : "#fff", color: pieno ? "#fff" : colore, fontSize: 12.5, fontWeight: 700 });

export default function PreparaFatture({ onNavigate }) {
  const [dati, setDati] = useState(null);
  const [cedente, setCedente] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [dataDa, setDataDa] = useState("");
  const [dataA, setDataA] = useState("");
  const [dataFattura, setDataFattura] = useState(oggiIso());
  const [emesse, setEmesse] = useState([]);
  const [mostraCedente, setMostraCedente] = useState(false);

  async function carica() {
    setLoading(true); setErrore(null);
    try {
      const [d, ced] = await Promise.all([caricaPreparazione(dataDa || null, dataA || null), caricaCedente()]);
      setDati(d); setCedente(ced);
      if (!ced.salvato) setMostraCedente(true);
    } catch (err) { setErrore(err.message); }
    setLoading(false);
  }
  useEffect(() => { carica(); }, [dataDa, dataA]);

  if (loading && !dati) return <div style={{ padding: 20, color: C.muted }}>Preparazione delle fatture...</div>;

  const nCapi = dati ? dati.fatture.reduce((s, f) => s + f.capi.length, 0) + dati.daAssegnare.length + dati.esclusi.length : 0;

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Prepara Fatture — Animali Allevamento</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={carica} style={btn(false)}>↻ Aggiorna</button>
          <button onClick={() => onNavigate?.("fatt-animali-emesse")} style={btn(false)}>Fatture Emesse →</button>
        </div>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
        I capi usciti «pronto da fatturare» divisi per cliente: una fattura per ogni cliente, una riga per capo (matricola o lotto, modello 4, numero di partita, chili di carcassa).
        Confermata la fattura, si scarica il file XML da caricare in Aruba Fatturazione Elettronica con «Carica fattura».
      </p>
      {errore && <div style={{ color: C.red, marginBottom: 12, fontWeight: 700 }}>⚠️ {errore}</div>}

      {/* Periodo e data fattura */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14, fontSize: 13 }}>
        <span>Capi usciti dal</span><input type="date" value={dataDa} onChange={e => setDataDa(e.target.value)} style={input} />
        <span>al</span><input type="date" value={dataA} onChange={e => setDataA(e.target.value)} style={input} />
        {(dataDa || dataA) && <button onClick={() => { setDataDa(""); setDataA(""); }} style={btn(false, C.muted)}>Tutti i periodi</button>}
        <span style={{ marginLeft: 16 }}>Data delle fatture</span><input type="date" value={dataFattura} onChange={e => setDataFattura(e.target.value)} style={input} />
        <span style={{ padding: "5px 12px", borderRadius: 6, background: C.primary, color: "#fff", fontWeight: 700 }}>
          {nCapi} {nCapi === 1 ? "capo" : "capi"} · {dati?.fatture.length || 0} {dati?.fatture.length === 1 ? "fattura" : "fatture"} · {dati?.daAssegnare.length || 0} con cliente da assegnare
        </span>
      </div>

      {/* Dati di Podere Verde */}
      {cedente && (
        <PannelloCedente cedente={cedente} aperto={mostraCedente} setAperto={setMostraCedente}
          onSalva={async c => { await salvaCedente(c); setCedente({ ...c, salvato: true }); }} />
      )}

      {emesse.length > 0 && (
        <div style={{ background: "#E2F0D9", border: `1.5px solid ${C.green}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, color: C.green, marginBottom: 6 }}>✅ Fatture emesse ora ({emesse.length}) — file XML scaricati</div>
          {emesse.map(f => <div key={f.id} style={{ fontSize: 13 }}>{f.numero} del {dataItaliana(f.data)} · {f.cliente_denominazione} · {formattaEuro(f.totale)} · <code>{f.nome_file_xml}</code></div>)}
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {emesse.length > 1 && <button onClick={() => scaricaZip(`Fatture_per_Aruba_${oggiIso()}.zip`, emesse)} style={btn(true, C.green)}>Scarica tutte per Aruba (.zip)</button>}
            <span style={{ fontSize: 12.5, color: C.text, alignSelf: "center" }}>In Aruba: «Carica fattura» → «Seleziona documenti» (o trascinare i file) → controllare → inviare.</span>
          </div>
        </div>
      )}

      {dati && dati.fatture.length === 0 && dati.daAssegnare.length === 0 && dati.esclusi.length === 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `6px solid ${C.green}`, borderRadius: 12, padding: 16, fontSize: 14 }}>
          ✅ Nessun capo da fatturare{dataDa || dataA ? " nel periodo scelto" : ""}.
        </div>
      )}

      {dati && cedente && dati.fatture.map((f, i) => (
        <SchedaFattura key={f.cliente.id} fattura={f} cedente={cedente} dataFattura={dataFattura}
          numeroIniziale={dati.numeroProposto ? dati.numeroProposto + i : ""}
          onClienteSalvato={carica}
          onEmessa={async testata => { setEmesse(prev => [...prev, testata]); await carica(); }} />
      ))}

      {dati && dati.daAssegnare.length > 0 && (
        <ClientiDaAssegnare capi={dati.daAssegnare} clienti={dati.clienti} onFatto={carica} />
      )}

      {dati && dati.esclusi.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `6px solid ${C.red}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, color: C.red }}>Capi non fatturabili per dati mancanti — {dati.esclusi.length}</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>Restano fuori dalle fatture finché l'operatore non completa i dati nell'app Podere Verde.</div>
          <table style={{ fontSize: 12.5 }}>
            <thead><tr style={{ color: C.muted, textAlign: "left" }}><th style={th}>Capo</th><th style={th}>Uscita</th><th style={th}>Cliente</th><th style={th}>Manca</th></tr></thead>
            <tbody>{dati.esclusi.map(c => (
              <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={td}><b>{c.matricola}</b> · {SPECIE[c.specie] || c.specie}</td><td style={td}>{dataItaliana(c.data_uscita)}</td>
                <td style={td}>{c.cliente?.nome}</td><td style={{ ...td, color: C.red, fontWeight: 700 }}>{c.mancanti.join(", ")}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Una fattura (un cliente) ───────────────────────────────────────────────────
function SchedaFattura({ fattura, cedente, dataFattura, numeroIniziale, onEmessa, onClienteSalvato }) {
  const { cliente, capi, prodotti } = fattura;
  const anno = Number((dataFattura || oggiIso()).slice(0, 4));
  const [numero, setNumero] = useState(numeroIniziale ? String(numeroIniziale) : "");
  const [prezzi, setPrezzi] = useState(() => Object.fromEntries(prodotti.map(p => [p.prodotto, p.prezzoProposto != null ? String(p.prezzoProposto).replace(".", ",") : ""])));
  const [confermati, setConfermati] = useState(() => Object.fromEntries(prodotti.map(p => [p.prodotto, false])));
  const [descrizioni, setDescrizioni] = useState(() => Object.fromEntries(prodotti.map(p => [p.prodotto, p.descrizione])));
  const [modificaCliente, setModificaCliente] = useState(false);
  // Prodotti aggiunti dopo l'apertura (es. un capo appena assegnato a questo cliente):
  // si aggiunge il loro prezzo proposto, sempre da confermare
  useEffect(() => {
    setPrezzi(v => { const n = { ...v }; prodotti.forEach(p => { if (!(p.prodotto in n)) n[p.prodotto] = p.prezzoProposto != null ? String(p.prezzoProposto).replace(".", ",") : ""; }); return n; });
    setConfermati(v => { const n = { ...v }; prodotti.forEach(p => { if (!(p.prodotto in n)) n[p.prodotto] = false; }); return n; });
    setDescrizioni(v => { const n = { ...v }; prodotti.forEach(p => { if (!(p.prodotto in n)) n[p.prodotto] = p.descrizione; }); return n; });
  }, [prodotti.map(p => p.prodotto).join("|")]);
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState(null);

  const aliquota = Number(String(cedente.aliquotaIva || "10").replace(",", "."));
  const prezziNumerici = Object.fromEntries(Object.entries(prezzi).map(([k, v]) => [k, parseFloat(String(v).replace(",", "."))]));
  const calcolo = useMemo(() => calcolaFattura(capi, prezziNumerici, descrizioni, aliquota), [capi, prezzi, descrizioni, aliquota]);
  const mancantiCliente = datiMancantiCliente(cliente);
  const daConfermare = prodotti.filter(p => !confermati[p.prodotto] && prezziNumerici[p.prodotto] > 0).length;
  const daInserire = prodotti.filter(p => !(prezziNumerici[p.prodotto] > 0)).length;
  const numeroCompleto = numero ? componiNumero(cedente.prefissoNumero || "FPR", numero.trim(), anno) : "";

  const blocchi = [];
  if (!numero.trim()) blocchi.push("manca il numero della fattura");
  if (daInserire) blocchi.push(`${daInserire === 1 ? "manca 1 prezzo" : `mancano ${daInserire} prezzi`}`);
  if (daConfermare) blocchi.push(`${daConfermare === 1 ? "1 prezzo da confermare" : `${daConfermare} prezzi da confermare`}`);
  if (mancantiCliente.length) blocchi.push("dati del cliente da completare");
  if (!cedente.salvato) blocchi.push("dati di Podere Verde da controllare e salvare");

  async function emetti() {
    if (blocchi.length) return;
    if (!window.confirm(`Emettere la fattura ${numeroCompleto} del ${dataItaliana(dataFattura)} a ${cliente.nome} per ${formattaEuro(calcolo.totale)}?\n\nLa fattura sarà registrata nel programma e verrà scaricato il file XML da caricare in Aruba.`)) return;
    setLavoro(true); setErrore(null);
    try {
      const testata = await emettiFattura({
        numero: numeroCompleto, anno, data: dataFattura, cliente, calcolo, aliquota,
        prezzi: Object.fromEntries(prodotti.map(p => [p.prodotto, prezziNumerici[p.prodotto]])),
        creaXml: id => {
          const nomeFile = nomeFileXml(cedente, id);
          const xml = generaXmlFattura({ cedente, cliente, numero: numeroCompleto, data: dataFattura, calcolo, aliquota, progressivoInvio: nomeFile.split("_")[1].replace(".xml", "") });
          return { xml, nomeFile };
        },
      });
      scaricaFile(testata.nome_file_xml, testata.xml);
      await onEmessa(testata);
    } catch (err) { setErrore(err.message); }
    setLavoro(false);
  }

  const pronta = blocchi.length === 0;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `6px solid ${pronta ? C.green : C.yellow}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.primary }}>{cliente.nome}</div>
          <div style={{ fontSize: 12.5, color: C.muted }}>
            P.IVA {cliente.partita_iva || "—"} · {cliente.codice_destinatario ? `codice destinatario ${cliente.codice_destinatario}` : cliente.pec ? `PEC ${cliente.pec}` : "senza codice destinatario né PEC"} · {capi.length} capi · carcassa {formattaNumero(fattura.kgCarcassa, 2)} kg
            {" · "}<a onClick={() => setModificaCliente(v => !v)} style={{ color: C.primary, cursor: "pointer", textDecoration: "underline" }}>{modificaCliente ? "chiudi dati cliente" : "dati cliente"}</a>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 700 }}>Numero</span>
          <span>{cedente.prefissoNumero || "FPR"}</span>
          <input value={numero} onChange={e => setNumero(e.target.value.replace(/[^0-9]/g, ""))} placeholder="n." style={{ ...input, width: 64, textAlign: "right", borderColor: numero ? C.border : C.red }} />
          <span>/{String(anno).slice(-2)}</span>
        </div>
      </div>
      {!numeroIniziale && !numero && (
        <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>Inserire il numero: deve essere il successivo all'ultima fattura emessa in Aruba quest'anno (es. dopo la FPR 8/26 viene la 9).</div>
      )}

      {(mancantiCliente.length > 0 || modificaCliente) && (
        <div style={{ marginTop: 10 }}>
          {mancantiCliente.length > 0 && <div style={{ fontSize: 12.5, color: C.red, fontWeight: 700, marginBottom: 6 }}>Per la fattura elettronica mancano: {mancantiCliente.join(", ")}.</div>}
          <ClienteForm iniziale={cliente} onSalvato={async () => { setModificaCliente(false); await onClienteSalvato(); }} />
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 12.5, marginTop: 8 }}>
          <thead><tr style={{ color: C.muted, textAlign: "left" }}>
            <th style={th}>Capo</th><th style={th}>Uscita</th><th style={th}>Modello 4</th><th style={th}>Partita</th>
            <th style={{ ...th, textAlign: "right" }}>Carcassa kg</th><th style={{ ...th, textAlign: "right" }}>€/kg</th><th style={{ ...th, textAlign: "right" }}>Importo</th>
          </tr></thead>
          <tbody>{calcolo.righe.map(r => (
            <tr key={r.capo.id} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={td}><b>{r.capo.matricola}</b> · {r.capo.prodotto.toLowerCase()}{r.capo.lotto ? ` (lotto ${r.capo.lotto})` : ""}
                {r.capo.origineCliente === "assegnato" && <span style={{ fontSize: 11, color: C.accent }}> · cliente assegnato</span>}</td>
              <td style={td}>{dataItaliana(r.capo.data_uscita)}</td><td style={td}>{r.capo.modello4_numero}</td><td style={td}>{r.capo.numero_partita}</td>
              <td style={{ ...td, textAlign: "right" }}>{formattaNumero(r.quantita, 2)}</td>
              <td style={{ ...td, textAlign: "right" }}>{Number.isFinite(r.prezzo) ? formattaNumero(r.prezzo, 2) : "—"}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{r.importo != null ? formattaNumero(r.importo, 2) : "—"}</td>
            </tr>))}</tbody>
        </table>
      </div>

      {/* Prezzi per prodotto */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        {prodotti.map(p => {
          const valore = prezzi[p.prodotto] ?? "";
          const valido = prezziNumerici[p.prodotto] > 0;
          return (
            <div key={p.prodotto} style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", minWidth: 290, background: C.bg }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <b>{p.prodotto}</b><span>— €/kg</span>
                <input value={valore} onChange={e => { setPrezzi(v => ({ ...v, [p.prodotto]: e.target.value })); setConfermati(v => ({ ...v, [p.prodotto]: false })); }}
                  placeholder="da inserire" style={{ ...input, width: 90, textAlign: "right", fontWeight: 800, borderColor: valido ? C.primary : C.red }} />
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
                {p.prezzoProposto != null ? `proposto: ${formattaNumero(p.prezzoProposto, 2)} € (${p.fonte})` : "nessun prezzo precedente per questo cliente: inserirlo"}
              </div>
              <div style={{ fontSize: 11.5, marginTop: 4 }}>
                Descrizione in fattura: <input value={descrizioni[p.prodotto] ?? p.descrizione} onChange={e => setDescrizioni(v => ({ ...v, [p.prodotto]: e.target.value.toUpperCase() }))} style={{ ...input, height: 26, width: 180, fontSize: 11.5 }} />
              </div>
              {valido && (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6, padding: "3px 9px", borderRadius: 6, fontWeight: 800, fontSize: 12, cursor: "pointer",
                  background: confermati[p.prodotto] ? "#E2F0D9" : "#FFF2DC", color: confermati[p.prodotto] ? C.green : "#8a6500", border: `1.5px solid ${confermati[p.prodotto] ? C.green : C.yellow}` }}>
                  <input type="checkbox" checked={!!confermati[p.prodotto]} onChange={e => setConfermati(v => ({ ...v, [p.prodotto]: e.target.checked }))} />
                  {confermati[p.prodotto] ? "Prezzo confermato" : "Confermi prezzo?"}
                </label>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
        <div style={{ fontSize: 13.5 }}>
          Imponibile <b>{formattaEuro(calcolo.imponibile)}</b> · IVA {formattaNumero(aliquota, 0)}% <b>{formattaEuro(calcolo.imposta)}</b> · Totale <b>{formattaEuro(calcolo.totale)}</b>
        </div>
        <button onClick={emetti} disabled={!pronta || lavoro} style={{ ...btn(true, pronta ? C.primary : "#B8B3A7"), cursor: pronta ? "pointer" : "not-allowed" }}>
          {lavoro ? "Emissione..." : pronta ? `Conferma ed emetti ${numeroCompleto} · scarica XML per Aruba` : `Conferma fattura (${blocchi.join("; ")})`}
        </button>
      </div>
      {errore && <div style={{ color: C.red, marginTop: 8, fontWeight: 700 }}>⚠️ {errore}</div>}
    </div>
  );
}

// ── Capi senza cliente ─────────────────────────────────────────────────────────
function ClientiDaAssegnare({ capi, clienti, onFatto }) {
  const [scelte, setScelte] = useState({});
  const [ricorda, setRicorda] = useState({});
  const [nuovoPer, setNuovoPer] = useState(null);
  const [errore, setErrore] = useState(null);

  async function assegna(c, clienteId) {
    setErrore(null);
    try { await assegnaCliente(c.id, clienteId, null, ricorda[c.id] !== false && c.cliente_nome ? c.cliente_nome : null); await onFatto(); }
    catch (err) { setErrore(err.message); }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `6px solid ${C.yellow}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
      <div style={{ fontWeight: 800, color: "#8a6500", fontSize: 15 }}>⚠️ Cliente da assegnare — {capi.length} {capi.length === 1 ? "capo" : "capi"}</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>L'operatore non ha indicato il cliente, oppure ha scritto un nome che non è in anagrafica. Assegnato il cliente, il capo entra nella sua fattura.</div>
      {errore && <div style={{ color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>}
      <table style={{ fontSize: 12.5 }}>
        <thead><tr style={{ color: C.muted, textAlign: "left" }}>
          <th style={th}>Capo</th><th style={th}>Uscita</th><th style={th}>Macello</th><th style={{ ...th, textAlign: "right" }}>Carcassa kg</th><th style={th}>Scritto dall'operatore</th><th style={th}>Assegna cliente</th>
        </tr></thead>
        <tbody>{capi.map(c => (
          <tr key={c.id} style={{ borderTop: `1px solid ${C.border}`, verticalAlign: "top" }}>
            <td style={td}><b>{c.matricola}</b> · {c.prodotto.toLowerCase()}{c.mancanti.length > 0 && <div style={{ fontSize: 11, color: C.red }}>manca anche: {c.mancanti.join(", ")}</div>}</td>
            <td style={td}>{dataItaliana(c.data_uscita)}</td><td style={td}>{c.destinatario || "—"}</td>
            <td style={{ ...td, textAlign: "right" }}>{c.peso_carcassa != null ? formattaNumero(c.peso_carcassa, 2) : "—"}</td>
            <td style={td}>{c.cliente_nome || <span style={{ color: C.muted }}>nessun nome</span>}</td>
            <td style={td}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <select value={scelte[c.id] || ""} onChange={e => setScelte(v => ({ ...v, [c.id]: e.target.value }))} style={{ ...input, maxWidth: 260 }}>
                  <option value="">Scegli dall'anagrafica…</option>
                  {clienti.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}{cl.partita_iva ? ` · ${cl.partita_iva}` : ""}</option>)}
                </select>
                <button disabled={!scelte[c.id]} onClick={() => assegna(c, Number(scelte[c.id]))} style={btn(true)}>Assegna</button>
                <button onClick={() => setNuovoPer(nuovoPer === c.id ? null : c.id)} style={btn(false)}>+ nuovo cliente</button>
              </div>
              {c.suggerito && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>suggerimento: per questo macello l'ultimo cliente è stato <a style={{ color: C.primary, cursor: "pointer", textDecoration: "underline" }} onClick={() => setScelte(v => ({ ...v, [c.id]: String(c.suggerito.id) }))}>{c.suggerito.nome}</a></div>}
              {c.cliente_nome && (
                <label style={{ display: "flex", gap: 6, fontSize: 11.5, marginTop: 4 }}>
                  <input type="checkbox" checked={ricorda[c.id] !== false} onChange={e => setRicorda(v => ({ ...v, [c.id]: e.target.checked }))} />
                  ricorda che «{c.cliente_nome}» è questo cliente
                </label>
              )}
              {nuovoPer === c.id && (
                <div style={{ marginTop: 8 }}>
                  <ClienteForm iniziale={{ nome: c.cliente_nome || "" }} onSalvato={async nuovo => { setNuovoPer(null); await assegna(c, nuovo.id); }} />
                </div>
              )}
            </td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

// ── Anagrafica cliente per la fattura elettronica ──────────────────────────────
export function ClienteForm({ iniziale, onSalvato }) {
  const [c, setC] = useState({ nazione: "IT", ...iniziale });
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState(null);
  const campo = (k, etichetta, larghezza = 160, ph = "") => (
    <label style={{ display: "flex", flexDirection: "column", fontSize: 11.5, color: C.muted, gap: 2 }}>
      {etichetta}
      <input value={c[k] || ""} placeholder={ph} onChange={e => setC(v => ({ ...v, [k]: e.target.value }))} style={{ ...input, width: larghezza, color: C.text }} />
    </label>
  );
  async function salva() {
    if (!(c.nome || "").trim()) { setErrore("Inserire la ragione sociale."); return; }
    setLavoro(true); setErrore(null);
    try { const salvato = await salvaCliente(c); await onSalvato(salvato); } catch (err) { setErrore(err.message); }
    setLavoro(false);
  }
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {campo("nome", "Ragione sociale", 280)}
        {campo("partita_iva", "Partita IVA", 140)}
        {campo("codice_fiscale", "Codice fiscale", 150)}
        {campo("indirizzo", "Indirizzo e numero civico", 230)}
        {campo("cap", "CAP", 70)}
        {campo("citta", "Comune", 140)}
        {campo("provincia", "Provincia", 70, "RM")}
        {campo("nazione", "Nazione", 60)}
        {campo("codice_destinatario", "Codice destinatario (7 caratteri)", 170, "0000000")}
        {campo("pec", "PEC (se senza codice destinatario)", 230)}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button onClick={salva} disabled={lavoro} style={btn(true)}>{lavoro ? "Salvataggio..." : c.id ? "Salva dati cliente" : "Crea cliente"}</button>
        {errore && <span style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>⚠️ {errore}</span>}
      </div>
    </div>
  );
}

// ── Dati di Podere Verde in fattura ────────────────────────────────────────────
export function PannelloCedente({ cedente, aperto, setAperto, onSalva }) {
  const [c, setC] = useState(cedente);
  const [stato, setStato] = useState(null);
  const campi = [
    ["denominazione", "Denominazione", 280], ["partitaIva", "Partita IVA", 120], ["codiceFiscale", "Codice fiscale", 120], ["regimeFiscale", "Regime fiscale", 70],
    ["indirizzo", "Indirizzo", 170], ["numeroCivico", "Numero civico", 70], ["cap", "CAP", 70], ["comune", "Comune", 110], ["provincia", "Provincia", 60],
    ["reaUfficio", "Ufficio REA", 60], ["reaNumero", "Numero REA", 90], ["capitaleSociale", "Capitale sociale", 90], ["socioUnico", "Socio unico (SU) o più soci (SM)", 60],
    ["email", "Email nei contatti", 210], ["istitutoFinanziario", "Banca", 140], ["iban", "IBAN", 250],
    ["condizioniPagamento", "Condizioni di pagamento", 70], ["modalitaPagamento", "Modalità di pagamento", 70], ["aliquotaIva", "Aliquota IVA %", 60], ["prefissoNumero", "Prefisso del numero", 60],
  ];
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `6px solid ${cedente.salvato ? C.primary : C.yellow}`, borderRadius: 12, padding: "10px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setAperto(!aperto)}>
        <div style={{ fontWeight: 800, color: C.primary }}>Dati di Podere Verde in fattura {cedente.salvato ? "" : "— da controllare e salvare la prima volta"}</div>
        <span style={{ color: C.muted }}>{aperto ? "▾" : "▸"}</span>
      </div>
      {aperto && (
        <>
          <div style={{ fontSize: 12, color: C.muted, margin: "6px 0" }}>
            Valori ripresi dalla fattura FPR 8/26 emessa con Aruba. L'email nei contatti è vuota: se la si scrive, compare nella fattura.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {campi.map(([k, et, w]) => (
              <label key={k} style={{ display: "flex", flexDirection: "column", fontSize: 11.5, color: C.muted, gap: 2 }}>
                {et}<input value={c[k] || ""} onChange={e => setC(v => ({ ...v, [k]: e.target.value }))} style={{ ...input, width: w, color: C.text }} />
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <button onClick={async () => { setStato("…"); try { await onSalva(c); setStato("Salvato"); } catch (err) { setStato(`Errore: ${err.message}`); } }} style={btn(true)}>Salva dati di Podere Verde</button>
            {stato && <span style={{ fontSize: 12.5, fontWeight: 700, color: stato.startsWith("Errore") ? C.red : C.green }}>{stato}</span>}
          </div>
        </>
      )}
    </div>
  );
}

const th = { padding: "5px 8px", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" };
const td = { padding: "5px 8px", verticalAlign: "top" };
