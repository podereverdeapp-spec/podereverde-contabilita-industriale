import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
import { euro } from "./analisiDocumentoBanca";
import { causaleAnticipo } from "./calcoloAnticipi";
import { caricaDatiPrezzi, analisiPrezzi, it as itPrezzo, data as dataPrezzo } from "./calcoloVariazionePrezzi";
import { aumentiPerFattura, testoAumenti, NOME_GRAVITA } from "./calcoloAumentiFattura";
import {
  SEZIONI, GRUPPI_SEZIONE, vociDellaSezione, MODALITA_USCITA, MODALITA_ENTRATA, modalitaAmmessa, MODALITA_DA_XML, NOME_MP,
  ibanPulito, ibanValido, ibanBello, abiDiIban, pulisciCausale, causaleValida, componiCausale, statoAttesa, oggiRoma, dataIt, giorniLavorativi,
} from "./regoleIncassiPagamenti";

// Versione 357 — «Gestione incassi e pagamenti»: il motore che scrive la prima nota.
// L'operatore sceglie che cosa pagare o incassare, come (modalità) e con che cosa (conto o carta), controlla IBAN e causale e preme
// «Conferma e manda in pagamento»: nasce un movimento IN ATTESA DELLA BANCA con il codice di attesa (P-0001, I-0001, G-0001), le fatture
// risultano «in pagamento» e non si possono pagare due volte. Il numero di prima nota (2026/000001) lo dà la conferma della banca
// («Banche, carte e cassa» → «Conferma dei movimenti»), con la data dell'addebito o dell'accredito. Un pagamento mai partito si annulla
// con il motivo. Decisioni del Dott. Bizzarri: progetto della prima nota, sezioni 2, 3, 4.1, 5, 5.2, 5.3, 6, 10, 10.2; studio, sezioni 11–16.
// Tutte le regole sono controllate di nuovo dal database (ci_disponi_movimento, ci_disponi_giroconto, ci_annulla_disposizione).
// Versione 370: scheda «Anticipo su fattura da ricevere» (pagamento su proforma, preventivo o offerta, senza fatture da spuntare).

// Versione 370: «Anticipo su fattura da ricevere» subito dopo «Pagamento fatture» (pagamento su proforma, preventivo o offerta)
const TAB = [...SEZIONI.map(s => ({ id: s.id, nome: s.nome })), { id: "attesa", nome: "In attesa della banca" }, { id: "anomalie", nome: "Anomalie" }]
  .flatMap(t => t.id === "pagamento_fatture" ? [t, { id: "anticipo", nome: "Anticipo o caparra su fattura da ricevere" }] : [t]);
const ANTICIPO = "Acconto su fattura da ricevere";
const CAPARRA = "Caparra confirmatoria su preventivo";   // versione 374 (decisione del Dott. Bizzarri del 12/11/2026 ore 17:57)
const copia = t => { try { navigator.clipboard.writeText(String(t)); } catch { /* il browser non permette: si copia a mano */ } };
const importoIt = n => Number(n).toFixed(2).replace(".", ",");
const leggiImporto = t => { const s = String(t || "").trim().replace(/\s|€/g, ""); if (!s) return null; const x = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^\d+(\.\d{1,2})?$/.test(x)) return null; const n = Number(x); return n > 0 ? Math.round(n * 100) / 100 : null; };

function Riquadro({ colore, titolo, valore, nota, onClick }) {
  return <div onClick={onClick} style={{ flex: "1 1 210px", border: `2px solid ${colore}`, background: `${colore}12`, borderRadius: 12, padding: "10px 14px", cursor: onClick ? "pointer" : "default" }}>
    <div style={{ fontSize: 12.5, fontWeight: 800, color: colore }}>{titolo}</div>
    <div style={{ fontSize: 26, fontWeight: 800, color: colore }}>{valore}</div>
    <div style={{ fontSize: 12, color: C.text }}>{nota}</div>
  </div>;
}
const Copia = ({ etichetta, valore }) => valore ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 14, marginBottom: 4 }}>
  <span style={{ fontSize: 12, color: C.muted }}>{etichetta}:</span> <b style={{ fontSize: 13 }}>{valore}</b>
  <button style={{ ...btn(false), height: 24, fontSize: 11, padding: "0 8px" }} onClick={() => copia(etichetta === "IBAN" ? ibanPulito(valore) : valore)}>Copia</button></span> : null;

export default function GestioneIncassiPagamenti() {
  const [base, setBase] = useState(null);
  const [errore, setErrore] = useState("");
  const [tab, setTab] = useState("pagamento_fatture");
  const [esito, setEsito] = useState(null);
  const [giro, setGiro] = useState(0);
  const oggi = oggiRoma();

  useEffect(() => { (async () => {
    setErrore("");
    const [co, ca, st, cau, fo, cl, sc, scA, mv, ri, doc, pr] = await Promise.all([
      supabase.from("ci_conti").select("id, nome, tipo, stato, banca_o_emittente, iban, ultime_quattro_cifre, nome_nei_movimenti").order("id"),
      supabase.from("ci_carte_di_debito").select("id, conto_id, tipo, ultime_quattro_cifre, titolare, attiva").order("id"),
      supabase.from("ci_v_stato_conti").select("*"),
      supabase.from("ci_causali_contabili").select("gruppo, voce, ordine").order("ordine"),
      fetchAllPages((a, b) => supabase.from("ci_fornitori").select("id, nome, partita_iva").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_clienti").select("id, nome, partita_iva").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_v_scadenzario").select("*").gt("residuo", 0.005).gt("importo", 0).order("scadenza_id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_v_scadenzario").select("*").gt("in_attesa_della_banca", 0).order("scadenza_id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_pagamenti_fatture").select("id, conto_id, conto, data, verso, importo, controparte, causale, fornitore_id, cliente_id, esercizio, progressivo, confermato_il, natura, modalita, causale_gruppo, causale_voce, codice_attesa, data_disposizione, iban_beneficiario, iban_diverso_motivo, documento_riferimento, sopra_soglia, disposto_da, disposto_il, riga_fonte_id, stornato_il, movimento_collegato_id")
        .gte("data", "2026-01-01").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_righe_fonte").select("id, conto_id, documento_id, data_contabile").gte("data_contabile", "2026-01-01").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_documenti_fonte").select("id, annullato_il").order("id").range(a, b)),
      supabase.rpc("ci_puo_gestire_conti"),
    ]);
    for (const x of [co, ca, st, cau, fo, cl, sc, scA, mv, ri, doc]) if (x.error) { setErrore("Lettura non riuscita: " + x.error.message); return; }
    const stati = st.data || [];
    // saldo di ogni conto all'ultimo giorno controllato dell'estratto (ci_saldo_al), per il saldo disponibile
    const saldi = {};
    await Promise.all((co.data || []).filter(c => c.stato === "aperto").map(async c => {
      const s = stati.find(x => x.conto_id === c.id); if (!s?.controllo_ok_alla_data) return;
      const r = await supabase.rpc("ci_saldo_al", { p_conto: c.id, p_giorno: s.controllo_ok_alla_data });
      if (r.error) throw new Error("saldo del conto " + c.nome + ": " + r.error.message);
      if (r.data !== null) saldi[c.id] = { saldo: Number(r.data), al: s.controllo_ok_alla_data };
    }));
    const movimenti = mv.data || [];
    const attesa = movimenti.filter(m => m.codice_attesa && !m.confermato_il);
    let abbinamenti = [];
    if (attesa.length) {
      const a = await supabase.from("ci_abbinamenti_pagamenti").select("id, pagamento_id, scadenza_id, importo").in("pagamento_id", attesa.map(m => m.id));
      if (a.error) throw new Error("fatture delle disposizioni: " + a.error.message);
      abbinamenti = a.data || [];
    }
    const ids = [...new Set(attesa.map(m => m.disposto_da).filter(Boolean))];
    let nomi = {};
    if (ids.length) { const p = await supabase.from("profili").select("id, nome, cognome").in("id", ids); nomi = Object.fromEntries((p.data || []).map(x => [x.id, `${x.nome || ""} ${x.cognome || ""}`.trim()])); }
    const vivi = new Set((doc.data || []).filter(d => !d.annullato_il).map(d => d.id));
    const collegate = new Set(movimenti.filter(m => m.confermato_il && m.riga_fonte_id).map(m => m.riga_fonte_id));
    const daConfermare = (ri.data || []).filter(r => vivi.has(r.documento_id) && !collegate.has(r.id));
    const tutteSc = [...(sc.data || []), ...(scA.data || []).filter(x => !(sc.data || []).some(y => y.scadenza_id === x.scadenza_id))].filter(x => x.scadenza_id);
    setBase({ conti: co.data || [], carte: (ca.data || []).filter(k => k.attiva), stati, causali: cau.data || [], fornitori: fo.data || [], clienti: cl.data || [],
      scadenze: tutteSc, movimenti, attesa, abbinamenti, nomi, daConfermare, saldi, gestore: pr.data === true });
  })().catch(e => setErrore("Lettura non riuscita: " + e.message)); }, [giro]);

  const anomalie = useMemo(() => {
    if (!base) return [];
    const out = [];
    for (const m of base.attesa) {
      const st = base.stati.find(s => s.conto_id === m.conto_id);
      const a = statoAttesa(m, st?.controllo_ok_alla_data, oggi);
      if (a.rosso) out.push({ tipo: "In attesa oltre i termini", m, testo: `${m.codice_attesa} — ${a.causa}` });
      if (m.sopra_soglia) out.push({ tipo: "Sopra soglia 5.000 €", m, testo: `${m.codice_attesa} di ${euro(m.importo)} disposto da ${base.nomi[m.disposto_da] || "—"} il ${dataIt(m.disposto_il)}: da vedere dal Dott. Bizzarri o da Teresa Demaria` });
      if (m.iban_diverso_motivo) out.push({ tipo: "IBAN diverso dalla fattura", m, testo: `${m.codice_attesa}: IBAN ${ibanBello(m.iban_beneficiario)} — motivo scritto: ${m.iban_diverso_motivo}` });
    }
    for (const c of base.conti.filter(c => c.stato === "aperto" && c.tipo !== "cassa")) {
      const st = base.stati.find(s => s.conto_id === c.id);
      if (st?.controllo_ok_alla_data && giorniLavorativi(st.controllo_ok_alla_data, oggi) > 5)
        out.push({ tipo: "Movimenti della banca non caricati", testo: `${c.nome}: documenti caricati solo fino al ${dataIt(st.controllo_ok_alla_data)}. Scaricare dalla banca i movimenti successivi e caricarli in «Banche, carte e cassa» → «Carica documenti della banca»: senza di loro i pagamenti disposti non si possono confermare.` });
    }
    return out;
  }, [base]);

  if (errore && !base) return <div style={{ color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>;
  if (!base) return <div>Lettura in corso…</div>;
  const confermati = base.movimenti.filter(m => m.progressivo && m.natura !== "STORNO" && !m.stornato_il);
  const uscAtt = base.attesa.filter(m => m.verso === "uscita").reduce((t, m) => t + Number(m.importo), 0);
  const entAtt = base.attesa.filter(m => m.verso === "entrata").reduce((t, m) => t + Number(m.importo), 0);
  const fatto = (r) => { setEsito(r); setGiro(g => g + 1); window.scrollTo?.(0, 0); };
  return (
    <div style={{ maxWidth: 1300 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.primary }}>💶 Gestione incassi e pagamenti</div>
      <div style={{ fontSize: 13, color: C.muted, margin: "4px 0 12px", maxWidth: 1050 }}>
        Qui si dispongono i pagamenti e si registrano gli incassi attesi. Ogni disposizione nasce <b>in attesa della banca</b> con un codice (P-0001):
        entra nel saldo disponibile ma non ancora in prima nota. Quando l'estratto della banca è caricato, in «Conferma dei movimenti» la disposizione
        prende il <b>numero di prima nota</b> e la data della banca. Un pagamento che non è partito si annulla, con il motivo.
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <Riquadro colore={C.green} titolo="Chiuso e confermato" valore={confermati.length} nota="movimenti del 2026 confermati dalla banca, con il numero di prima nota" />
        <Riquadro colore={C.yellow} titolo="Da confermare dall'operatore" valore={base.daConfermare.length} nota="righe della banca del 2026 senza movimento confermato: «Banche, carte e cassa» → «Conferma dei movimenti»" />
        <Riquadro colore={C.blue} titolo="In attesa della banca" valore={base.attesa.length} nota={`uscite ${euro(uscAtt)} — entrate ${euro(entAtt)}`} onClick={() => setTab("attesa")} />
        <Riquadro colore={C.red} titolo="Anomalie" valore={anomalie.length} nota="ciò che non torna: clic per vederle" onClick={() => setTab("anomalie")} />
      </div>
      <Disponibili base={base} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0" }}>
        {TAB.map(t => <button key={t.id} style={btn(tab === t.id, t.id === "anomalie" && anomalie.length ? C.red : C.primary)} onClick={() => { setTab(t.id); setEsito(null); }}>
          {t.nome}{t.id === "attesa" ? ` (${base.attesa.length})` : t.id === "anomalie" ? ` (${anomalie.length})` : ""}</button>)}
      </div>
      {esito && <Esito esito={esito} chiudi={() => setEsito(null)} />}
      {errore && <div style={{ ...scheda, color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>}
      {(tab === "pagamento_fatture" || tab === "incasso_fatture") && <SezioneFatture key={tab + giro} sezione={tab} base={base} fatto={fatto} oggi={oggi} />}
      {tab === "anticipo" && <SezioneAnticipo key={giro} base={base} fatto={fatto} oggi={oggi} />}
      {(tab === "altri_pagamenti" || tab === "altri_incassi") && <SezioneAltri key={tab + giro} sezione={tab} base={base} fatto={fatto} oggi={oggi} />}
      {tab === "giroconti" && <SezioneGiroconti key={giro} base={base} fatto={fatto} oggi={oggi} />}
      {tab === "attesa" && <InAttesa base={base} oggi={oggi} fatto={fatto} />}
      {tab === "anomalie" && <div style={scheda}>
        <div style={{ fontWeight: 800, color: C.red, marginBottom: 6 }}>Anomalie ({anomalie.length})</div>
        {!anomalie.length && <div style={{ color: C.green }}>Nessuna anomalia.</div>}
        {anomalie.map((a, i) => <div key={i} style={{ borderLeft: `4px solid ${C.red}`, padding: "4px 10px", marginBottom: 6, fontSize: 13 }}><b>{a.tipo}</b>: {a.testo}</div>)}
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Un'anomalia si chiude risolvendo la causa: confermando il movimento con l'estratto della banca, oppure annullando la disposizione con il motivo.</div>
      </div>}
    </div>
  );
}

function Disponibili({ base }) {
  const aperti = base.conti.filter(c => c.stato === "aperto" && c.tipo !== "cassa");
  return <div style={{ ...scheda, fontSize: 12.5, display: "flex", gap: 18, flexWrap: "wrap" }}>
    <b style={{ color: C.primary }}>Saldo disponibile</b>
    {aperti.map(c => { const s = base.saldi[c.id]; const att = base.attesa.filter(m => m.conto_id === c.id && m.verso === "uscita").reduce((t, m) => t + Number(m.importo), 0);
      return <span key={c.id}>{c.nome}: {s ? <>estratto al {dataIt(s.al)} {euro(s.saldo)} − disposti {euro(att)} = <b style={{ color: s.saldo - att < 0 ? C.red : C.green }}>{euro(s.saldo - att)}</b></> : "saldo non calcolabile (manca la partenza o l'estratto)"}</span>; })}
  </div>;
}

function Esito({ esito, chiudi }) {
  return <div style={{ ...scheda, border: `2px solid ${C.green}` }}>
    <div style={{ fontWeight: 800, color: C.green, fontSize: 15 }}>✔ {esito.titolo}</div>
    <div style={{ fontSize: 13, margin: "6px 0" }}>{esito.testo}</div>
    {esito.copie && <div style={{ display: "flex", flexWrap: "wrap" }}>{esito.copie.map(([e, v]) => <Copia key={e} etichetta={e} valore={v} />)}</div>}
    <button style={{ ...btn(false), marginTop: 6 }} onClick={chiudi}>Chiudi</button>
  </div>;
}

// «come si paga» e «con che cosa», con il saldo disponibile accanto a ogni conto
function ComeEConCheCosa({ base, verso, v, cambia, importo }) {
  const modalita = verso === "uscita" ? MODALITA_USCITA : MODALITA_ENTRATA;
  const conPartenza = id => base.stati.some(s => s.conto_id === id && s.partenza_alla_data);
  const adatti = base.conti.filter(c => c.stato === "aperto" && v.modalita && modalitaAmmessa(c.tipo, v.modalita, verso));
  const carte = base.carte.filter(k => k.conto_id === Number(v.conto_id));
  const disp = id => { const s = base.saldi[id]; if (!s) return null; return s.saldo - base.attesa.filter(m => m.conto_id === id && m.verso === "uscita").reduce((t, m) => t + Number(m.importo), 0); };
  const scelto = base.conti.find(c => c.id === Number(v.conto_id));
  return <>
    <label style={L}>1. Come si {verso === "uscita" ? "paga" : "incassa"}
      <select style={sel(!v.modalita)} value={v.modalita} onChange={e => { cambia("modalita", e.target.value); cambia("conto_id", ""); cambia("carta_di_debito_id", ""); }}>
        <option value="">— scegliere —</option>{modalita.map(m => <option key={m}>{m}</option>)}</select></label>
    {v.modalita === "Altro" && <label style={L}>Quale modalità (obbligatorio)<input style={sel(!String(v.modalita_altro || "").trim())} value={v.modalita_altro || ""} onChange={e => cambia("modalita_altro", e.target.value)} /></label>}
    <label style={L}>2. Con che cosa
      <select style={sel(!v.conto_id)} value={v.conto_id} disabled={!v.modalita} onChange={e => { cambia("conto_id", e.target.value); cambia("carta_di_debito_id", ""); }}>
        <option value="">{v.modalita ? "— scegliere —" : "prima scegliere come si paga"}</option>
        {adatti.map(c => { const d = disp(c.id); const blocco = c.tipo === "cassa" && !conPartenza(c.id);
          return <option key={c.id} value={c.id} disabled={blocco}>{c.nome}{blocco ? " — bloccata: manca il saldo di partenza" : d !== null ? ` — disponibile ${euro(d)}` : ""}</option>; })}
      </select>
      {v.modalita && !adatti.length && <span style={{ color: C.red, fontWeight: 400 }}>Nessun conto o carta registrato per «{v.modalita}»: aprirlo in «Banche, carte e cassa» → «Conti: stato e controlli».</span>}
      {scelto && verso === "uscita" && importo && disp(scelto.id) !== null && disp(scelto.id) < importo && <span style={{ color: C.red, fontWeight: 700 }}>Il disponibile non copre l'importo.</span>}
    </label>
    {v.modalita === "Carta di debito" && v.conto_id && <label style={L}>Quale carta di debito o bancomat
      <select style={sel(!v.carta_di_debito_id)} value={v.carta_di_debito_id || ""} onChange={e => cambia("carta_di_debito_id", e.target.value)}>
        <option value="">— scegliere —</option>{carte.map(k => <option key={k.id} value={k.id}>{k.tipo} …{k.ultime_quattro_cifre} — {k.titolare}</option>)}</select>
      {!carte.length && <span style={{ color: C.red, fontWeight: 400 }}>Nessuna carta di debito registrata su questo conto: aggiungerla nella scheda del conto.</span>}</label>}
  </>;
}
const L = { fontSize: 12, fontWeight: 700, display: "flex", flexDirection: "column", gap: 3 };
const sel = (rosso) => ({ ...input, width: "100%", borderColor: rosso ? C.red : C.border });

// IBAN con tendina (della fattura, altri conosciuti, scrivi un altro) e «Confermi IBAN» (decisioni del 03/11/2026 ore 12:08–12:59)
function SceltaIban({ ibanFattura, conosciuti, v, cambia }) {
  const opzioni = [...new Set([...ibanFattura, ...conosciuti].map(ibanPulito).filter(Boolean))];
  const altro = v.iban_scelta === "altro";
  const ib = ibanPulito(altro ? v.iban_scritto : v.iban_scelta);
  const diverso = ib && ibanFattura.length && !ibanFattura.map(ibanPulito).includes(ib);
  return <div style={{ gridColumn: "1 / -1", border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
    <label style={L}>IBAN del beneficiario
      <select style={sel(!ib)} value={v.iban_scelta || ""} onChange={e => { cambia("iban_scelta", e.target.value); cambia("iban_confermato", false); }}>
        <option value="">— scegliere —</option>
        {opzioni.map(i => <option key={i} value={i}>{ibanBello(i)}{ibanFattura.map(ibanPulito).includes(i) ? " — scritto nella fattura" : " — usato in altre fatture"}{abiDiIban(i) ? ` (ABI ${abiDiIban(i)})` : ""}</option>)}
        <option value="altro">Scrivi un altro IBAN</option></select></label>
    {altro && <input style={{ ...sel(ib && !ibanValido(ib)), marginTop: 6 }} placeholder="IT00 X000 0000 0000 0000 0000 000" value={v.iban_scritto || ""} onChange={e => { cambia("iban_scritto", e.target.value); cambia("iban_confermato", false); }} />}
    {ib && !ibanValido(ib) && <div style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>IBAN non valido: forma o cifre di controllo sbagliate.</div>}
    {diverso && <div style={{ marginTop: 6, color: C.red, fontSize: 12.5 }}><b>IBAN diverso da quello scritto nella fattura.</b> Prima di pagare telefonare al fornitore a un numero già conosciuto (non a quello scritto nella mail) e farsi confermare l'IBAN. Scrivere il motivo:
      <input style={{ ...sel(!String(v.iban_diverso_motivo || "").trim()), marginTop: 4 }} placeholder="es.: confermato per telefono da … il …" value={v.iban_diverso_motivo || ""} onChange={e => cambia("iban_diverso_motivo", e.target.value)} /></div>}
    {ib && ibanValido(ib) && <div style={{ marginTop: 6 }}><button style={btn(!!v.iban_confermato, C.green)} onClick={() => cambia("iban_confermato", true)}>{v.iban_confermato ? `✔ IBAN confermato: ${ibanBello(ib)}` : "Confermi IBAN"}</button>
      {!v.iban_confermato && <span style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>Rileggere l'IBAN sulla fattura prima di confermare.</span>}</div>}
  </div>;
}
export const ibanDelModulo = v => ibanPulito(v.iban_scelta === "altro" ? v.iban_scritto : v.iban_scelta);

function Contatore({ testo }) {
  const n = testo.length;
  return <span style={{ fontSize: 12, fontWeight: 700, color: n > 140 ? C.red : n > 120 ? C.yellow : C.green }}>{n}/140 caratteri</span>;
}

// ---------------- Pagamento fatture / Incasso fatture ----------------
function SezioneFatture({ sezione, base, fatto, oggi }) {
  const pag = sezione === "pagamento_fatture"; const lato = pag ? "fornitore" : "cliente"; const verso = pag ? "uscita" : "entrata";
  const anag = pag ? base.fornitori : base.clienti;
  const [cerca, setCerca] = useState(""); const [sogg, setSogg] = useState(null); const [tutte, setTutte] = useState([]);
  const [spunte, setSpunte] = useState({}); // scadenza_id → importo (testo)
  const [v, setV] = useState({ modalita: "", conto_id: "", data_disposizione: oggi, causale_voce: "", aggiunta: "", iban_scelta: "", iban_scritto: "", iban_confermato: false, iban_diverso_motivo: "", note: "", soglia_vista: false });
  const [lavoro, setLavoro] = useState(false); const [errore, setErrore] = useState(""); const [erroreStorico, setErroreStorico] = useState("");
  const cambia = (k, x) => setV(o => ({ ...o, [k]: x }));
  const aperte = base.scadenze.filter(s => s.lato === lato);
  // versione 374: «Prezzo aumentato» (stessi numeri del «Controllo Prezzi di Acquisto»); sui rossi «Visto» obbligatorio prima di pagare
  const [aumenti, setAumenti] = useState(null); const [erroreAumenti, setErroreAumenti] = useState("");
  const [visti, setVisti] = useState(new Map()); const [giroVisti, setGiroVisti] = useState(0); const [apertoAumento, setApertoAumento] = useState(null);
  const [notaVisto, setNotaVisto] = useState(""); const [dottore, setDottore] = useState(false);
  useEffect(() => { if (!pag) return; (async () => {
    try { setAumenti(aumentiPerFattura(analisiPrezzi(await caricaDatiPrezzi()))); }
    catch (e) { setAumenti(null); setErroreAumenti("Controllo dei prezzi non letto: i prezzi aumentati non si vedono (" + e.message + ")"); }
    const u = await supabase.auth.getUser(); const id = u.data?.user?.id;
    if (id) { const p = await supabase.from("profili").select("ruolo").eq("id", id).maybeSingle(); setDottore(p.data?.ruolo === "admin"); }
  })(); }, [pag]);
  useEffect(() => { if (!pag) return; (async () => {
    const r = await supabase.from("ci_prezzo_visti").select("*").order("visto_il", { ascending: false });
    if (r.error) setErroreAumenti(e => e || "Visti sui prezzi aumentati non letti: va lanciato il file 2_contabilita_strutture_v374_prezzo_aumentato.sql (" + r.error.message + ")");
    else {
      const ids = [...new Set((r.data || []).map(x => x.visto_da).filter(Boolean))];
      const pr = ids.length ? await supabase.from("profili").select("id, nome, cognome").in("id", ids) : { data: [] };
      const nomi = Object.fromEntries((pr.data || []).map(x => [x.id, `${x.nome || ""} ${x.cognome || ""}`.trim()]));
      setVisti(new Map((r.data || []).map(x => [x.fattura_id, { ...x, nome: nomi[x.visto_da] || "—" }])));
    }
  })(); }, [pag, giroVisti]);
  async function segnaVisto(s, f) {
    setLavoro(true); setErrore("");
    const r = await supabase.rpc("ci_prezzo_visto", { p_fattura: s.fattura_id, p_gravita: f.gravita, p_dettaglio: `Fattura ${s.numero_documento} del ${dataIt(s.data_documento)}: ${testoAumenti(f)}`, p_nota: notaVisto });
    setLavoro(false);
    if (r.error) return setErrore("«Visto» non registrato: " + r.error.message);
    setNotaVisto(""); setGiroVisti(g => g + 1);
  }
  async function segnaLetto(id) {
    const r = await supabase.rpc("ci_prezzo_visto_letto", { p_id: id });
    if (r.error) return setErrore("Non segnato letto: " + r.error.message);
    setGiroVisti(g => g + 1);
  }
  const soggetti = useMemo(() => {
    const per = new Map();
    for (const s of aperte) { const id = pag ? s.fornitore_id : s.cliente_id; if (!id) continue; const x = per.get(id) || { id, n: 0, resto: 0, scadute: 0, attesa: 0 };
      if (Number(s.residuo) > 0.005) { x.n++; x.resto += Number(s.residuo); if (s.data_scadenza < oggi) x.scadute += Number(s.residuo); } if (Number(s.in_attesa_della_banca) > 0) x.attesa++; per.set(id, x); }
    const q = cerca.trim().toLowerCase().replace(/[.\s]/g, "");
    return [...per.values()].map(x => ({ ...x, a: anag.find(a => a.id === x.id) })).filter(x => x.a)
      .filter(x => !q || String(x.a.nome || "").toLowerCase().replace(/[.\s]/g, "").includes(q) || String(x.a.partita_iva || "").includes(q)
        || aperte.some(s => (pag ? s.fornitore_id : s.cliente_id) === x.id && (String(s.numero_documento).toLowerCase().replace(/[.\s]/g, "").includes(q) || importoIt(s.residuo).replace(",", "") === q.replace(",", ""))))
      .sort((a, b) => b.scadute - a.scadute || String(a.a.nome || "").localeCompare(String(b.a.nome || "")));
  }, [cerca, base]);
  useEffect(() => { if (!sogg) return; (async () => {
    const r = await fetchAllPages((a, b) => supabase.from("ci_v_scadenzario").select("*").eq(pag ? "fornitore_id" : "cliente_id", sogg).order("data_documento").range(a, b));
    if (r.error) { setErroreStorico("Storico delle fatture non letto: il controllo «IBAN cambiato» non è stato fatto. Riprovare prima di pagare. (" + r.error.message + ")"); setTutte([]); return; }
    setErroreStorico(""); setTutte(r.data || []);
  })(); }, [sogg]);
  const sue = aperte.filter(s => (pag ? s.fornitore_id : s.cliente_id) === sogg).sort((a, b) => (a.data_scadenza || "9").localeCompare(b.data_scadenza || "9") || String(a.data_documento || "").localeCompare(String(b.data_documento || "")));
  const scelte = sue.filter(s => spunte[s.scadenza_id] !== undefined);
  const quote = scelte.map(s => ({ s, imp: leggiImporto(spunte[s.scadenza_id]) }));
  const totale = Math.round(quote.reduce((t, q) => t + (q.imp || 0), 0) * 100) / 100;
  const acconti = quote.filter(q => q.imp && q.imp < Number(q.s.residuo) - 0.005);
  const ritenuta = scelte.some(s => Number(s.ritenuta) > 0);
  const vocePropria = acconti.length && !quote.some(q => q.imp && Math.abs(q.imp - Number(q.s.residuo)) < 0.005) ? "Acconto su fattura" : ritenuta ? "Saldo con ritenuta d'acconto" : acconti.length ? "Acconto su fattura" : "Saldo fattura";
  const voce = v.causale_voce || vocePropria;
  const comp = componiCausale(quote.filter(q => q.imp).map(q => ({ numero: q.s.numero_documento, data: q.s.data_documento, tipo: q.s.tipo_documento, importo: q.imp, resto: Number(q.s.residuo), ritenuta: q.s.ritenuta })), !pag);
  const causale = pulisciCausale([comp.testo, v.aggiunta].filter(Boolean).join(" "));
  const bonifico = ["Bonifico", "Bonifico istantaneo"].includes(v.modalita);
  const ibanFattura = [...new Set(scelte.map(s => s.iban).filter(Boolean))];
  const conosciuti = [...new Set(tutte.map(s => s.iban).filter(Boolean))];
  // IBAN cambiato rispetto alla fattura precedente (progetto, 5.3 punto 1)
  const conIban = tutte.filter(s => s.iban).sort((a, b) => String(a.data_documento || "").localeCompare(String(b.data_documento || "")));
  const cambi = conIban.filter((s, i) => i > 0 && ibanPulito(s.iban) !== ibanPulito(conIban[i - 1].iban));
  const ib = ibanDelModulo(v);
  const problemi = [];
  if (!scelte.length) problemi.push(`spuntare almeno una fattura`);
  if (quote.some(q => !q.imp)) problemi.push("scrivere l'importo di ogni fattura spuntata");
  if (quote.some(q => q.imp && q.imp > Number(q.s.residuo) + 0.005)) problemi.push("un importo supera il resto della fattura");
  if (acconti.length > 1) problemi.push("al massimo una fattura in acconto per movimento");
  if (!v.modalita) problemi.push("scegliere come si " + (pag ? "paga" : "incassa"));
  if (v.modalita === "Altro" && !String(v.modalita_altro || "").trim()) problemi.push("scrivere quale modalità");
  if (!v.conto_id) problemi.push("scegliere con che cosa");
  if (v.modalita === "Carta di debito" && !v.carta_di_debito_id) problemi.push("scegliere la carta di debito");
  if (v.modalita === "Contanti" && totale >= 5000) problemi.push("contanti da 5.000 € in su: vietato (art. 49 D.Lgs. 231/2007)");
  if (!v.data_disposizione) problemi.push("scrivere la data di disposizione");
  if (bonifico && comp.troppo) problemi.push("la causale non sta in 140 caratteri: fare più bonifici");
  if (bonifico && !causaleValida(causale)) problemi.push("causale del bonifico non valida");
  if (pag && bonifico) {
    if (!ib) problemi.push("scegliere l'IBAN"); else if (!ibanValido(ib)) problemi.push("IBAN non valido"); else if (!v.iban_confermato) problemi.push("premere «Confermi IBAN»");
    if (ib && ibanFattura.length && !ibanFattura.map(ibanPulito).includes(ib) && !String(v.iban_diverso_motivo || "").trim()) problemi.push("IBAN diverso dalla fattura: scrivere il motivo");
  }
  if (totale > 5000 && !v.soglia_vista) problemi.push("spuntare «Ho visto: sopra 5.000 €»");
  if (erroreStorico && pag) problemi.push("storico delle fatture non letto: riprovare");
  if (pag && aumenti === null && scelte.length) problemi.push(erroreAumenti ? "controllo dei prezzi aumentati non letto: ricaricare la pagina (senza il controllo non si paga)" : "attendere il controllo dei prezzi aumentati");
  if (pag && aumenti) for (const s of scelte) { const f = s.fattura_id && aumenti.get(s.fattura_id);
    if (f && f.gravita === "alta" && !visti.has(s.fattura_id)) problemi.push(`prezzo aumentato con gravità alta nella fattura ${s.numero_documento}: premere «Visto»`); }
  async function invia() {
    if (problemi.length || lavoro) return;
    setLavoro(true); setErrore("");
    const p = { sezione, conto_id: Number(v.conto_id), modalita: v.modalita, modalita_altro: v.modalita_altro || "", carta_di_debito_id: v.carta_di_debito_id || "",
      data_disposizione: v.data_disposizione, importo: totale, causale_gruppo: "Fatture", causale_voce: voce, fornitore_id: pag ? sogg : "", cliente_id: pag ? "" : sogg,
      causale: bonifico || causale ? causale : "", iban: pag && bonifico ? ib : "", iban_confermato: !!v.iban_confermato, iban_diverso_motivo: v.iban_diverso_motivo || "", note: v.note || "",
      scadenze: quote.map(q => ({ scadenza_id: q.s.scadenza_id, importo: q.imp })) };
    const { data, error } = await supabase.rpc("ci_disponi_movimento", { p });
    setLavoro(false);
    if (error) return setErrore("Il database non l'ha accettato, non è stato registrato niente: " + error.message);
    const nome = anag.find(a => a.id === sogg)?.nome;
    fatto({ titolo: `${data.codice_attesa}: ${pag ? "pagamento mandato in pagamento" : "incasso atteso registrato"} — in attesa della banca`,
      testo: pag ? `Adesso, oggi stesso, disporre ${v.modalita === "Bonifico istantaneo" ? "il bonifico istantaneo" : v.modalita.toLowerCase()} in banca con questi dati (pulsanti «Copia»). Quando la banca lo addebita e l'estratto è caricato, confermarlo in «Conferma dei movimenti»: prenderà il numero di prima nota. Se non parte, annullarlo in «In attesa della banca».`
        : `Quando la banca lo accredita e l'estratto è caricato, confermarlo in «Conferma dei movimenti».`,
      copie: [["Beneficiario", pag ? nome : ""], ["IBAN", pag && bonifico ? ibanBello(ib) : ""], ["Importo", importoIt(totale)], ["Causale", causale], ["Data di esecuzione", dataIt(v.data_disposizione)]].filter(x => x[1]) });
  }
  const daLeggere = pag && dottore ? [...visti.values()].filter(x => !x.letto_dal_dottore_il && x.gravita === "alta") : [];
  return <div>
    {daLeggere.length > 0 && <div style={{ ...scheda, border: `2px solid ${C.red}`, background: `${C.red}0D` }}>
      <div style={{ fontWeight: 800, color: C.red }}>⚠️ Prezzi aumentati (gravità alta) visti prima del pagamento: {daLeggere.length}</div>
      {daLeggere.map(x => <div key={x.id} style={{ fontSize: 12.5, borderTop: `1px solid ${C.border}`, padding: "4px 0", display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>{x.dettaglio}<div style={{ color: C.muted }}>Visto da {x.nome} il {dataIt(String(x.visto_il).slice(0, 10))}{x.nota ? ` — nota: ${x.nota}` : ""}</div></div>
        <button style={{ ...btn(false), height: 26 }} onClick={() => segnaLetto(x.id)}>Letto</button></div>)}
    </div>}
    {!sogg && <div style={scheda}>
      <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>{pag ? "Quale fornitore si paga?" : "Quale cliente paga?"}</div>
      <input style={{ ...input, width: "100%", maxWidth: 520 }} placeholder="Cerca: nome anche parziale, partita IVA, numero della fattura o importo" value={cerca} onChange={e => setCerca(e.target.value)} />
      {!pag && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>Gli incassi con bonifico di solito non si registrano qui: arrivano con l'estratto e si confermano in «Conferma dei movimenti», dove il programma propone la fattura. Qui si registra un incasso atteso (assegno ricevuto da versare, contanti, bonifico annunciato).</div>}
      <table style={{ width: "100%", marginTop: 8, fontSize: 12.5, background: "#fff" }}><thead><tr style={{ background: C.primary, color: "#fff" }}>
        {[pag ? "Fornitore" : "Cliente", "Partita IVA", "Fatture aperte", "Resto", "Di cui scaduto", "In pagamento", ""].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left" }}>{h}</th>)}</tr></thead>
        <tbody>{soggetti.slice(0, 60).map(x => <tr key={x.id} style={{ borderBottom: `1px solid ${C.border}` }}>
          <td style={{ padding: "5px 8px", fontWeight: 700 }}>{x.a.nome}</td><td style={{ padding: "5px 8px" }}>{x.a.partita_iva || "—"}</td>
          <td style={{ padding: "5px 8px" }}>{x.n}</td><td style={{ padding: "5px 8px", textAlign: "right" }}>{euro(x.resto)}</td>
          <td style={{ padding: "5px 8px", textAlign: "right", color: x.scadute ? C.red : C.muted }}>{x.scadute ? euro(x.scadute) : "—"}</td>
          <td style={{ padding: "5px 8px", color: C.blue }}>{x.attesa ? `${x.attesa} fatture` : ""}</td>
          <td style={{ padding: "5px 8px" }}><button style={btn(true)} onClick={() => { setSogg(x.id); setSpunte({}); }}>Scegli</button></td></tr>)}</tbody></table>
      {soggetti.length > 60 && <div style={{ fontSize: 12, color: C.muted }}>Mostrati i primi 60: restringere la ricerca.</div>}
      {!soggetti.length && <div style={{ color: C.muted, marginTop: 6 }}>Nessuna fattura aperta trovata. Per un pagamento senza fattura nel programma usare «{pag ? "Altri pagamenti" : "Altri incassi"}» {pag ? "(per un pagamento su proforma, preventivo o offerta: «Anticipo su fattura da ricevere»)" : ""}.</div>}
    </div>}
    {sogg && <div style={scheda}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 800, color: C.primary, fontSize: 16 }}>{anag.find(a => a.id === sogg)?.nome} <span style={{ fontSize: 12.5, color: C.muted }}>{anag.find(a => a.id === sogg)?.partita_iva}</span></div>
        <button style={btn(false)} onClick={() => { setSogg(null); setSpunte({}); }}>← Cambia {lato}</button>
      </div>
      {erroreStorico && <div style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>⚠️ {erroreStorico}</div>}
      {pag && erroreAumenti && <div style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>⚠️ {erroreAumenti}</div>}
      {cambi.length > 0 && pag && <div style={{ color: C.red, fontSize: 12.5, fontWeight: 700, margin: "6px 0" }}>Attenzione: l'IBAN di questo fornitore è cambiato nelle fatture ({cambi.map(s => `dalla fattura ${s.numero_documento} del ${dataIt(s.data_documento)}: ${ibanBello(s.iban)}`).join("; ")}). Prima di pagare con il nuovo IBAN serve la conferma per telefono.</div>}
      <div style={{ fontSize: 12.5, color: C.muted, margin: "6px 0" }}>Fatture da {pag ? "pagare" : "incassare"} in ordine di scadenza (scadute in rosso). Spuntare quelle che si {pag ? "pagano" : "incassano"} con lo stesso movimento; l'importo si può ridurre per un acconto (una sola fattura in acconto).</div>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", fontSize: 12.5, background: "#fff" }}><thead><tr style={{ background: C.primary, color: "#fff" }}>
        {["", "Numero", "Data", "Scadenza", "Totale", pag ? "Già pagato" : "Già incassato", "Resto", pag ? "Da pagare ora" : "Da incassare ora", "Modalità nella fattura", "IBAN nella fattura", "Stato"].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
        <tbody>{sue.map(s => { const inPag = Number(s.in_attesa_della_banca) > 0 && Number(s.residuo) <= 0.005; const scad = s.data_scadenza && s.data_scadenza < oggi && !inPag; const sp = spunte[s.scadenza_id] !== undefined;
          return [<tr key={s.scadenza_id} style={{ borderBottom: `1px solid ${C.border}`, background: inPag ? "#EEF3F8" : sp ? "#F2F7EE" : "#fff", color: inPag ? C.muted : C.text }}>
            <td style={{ padding: "5px 8px" }}>{inPag ? "—" : <input type="checkbox" checked={sp} onChange={e => setSpunte(o => { const n = { ...o }; if (e.target.checked) n[s.scadenza_id] = importoIt(s.residuo); else delete n[s.scadenza_id]; return n; })} />}</td>
            <td style={{ padding: "5px 8px", fontWeight: 700 }}>{s.numero_documento}</td><td style={{ padding: "5px 8px" }}>{dataIt(s.data_documento)}</td>
            <td style={{ padding: "5px 8px", color: scad ? C.red : C.text, fontWeight: scad ? 700 : 400 }}>{dataIt(s.data_scadenza)}{scad ? ` (${Math.round((Date.parse(oggi) - Date.parse(s.data_scadenza)) / 86400000)} giorni)` : ""}</td>
            <td style={{ padding: "5px 8px", textAlign: "right" }}>{euro(s.importo)}</td><td style={{ padding: "5px 8px", textAlign: "right" }}>{euro(s.pagato)}</td>
            <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>{euro(s.residuo)}</td>
            <td style={{ padding: "5px 8px" }}>{sp ? <input style={{ ...input, width: 110, borderColor: !leggiImporto(spunte[s.scadenza_id]) || leggiImporto(spunte[s.scadenza_id]) > Number(s.residuo) + 0.005 ? C.red : C.border }} value={spunte[s.scadenza_id]} onChange={e => setSpunte(o => ({ ...o, [s.scadenza_id]: e.target.value }))} /> : ""}</td>
            <td style={{ padding: "5px 8px" }}>{NOME_MP[s.modalita_pagamento] || s.modalita_pagamento || "—"}</td>
            <td style={{ padding: "5px 8px", fontSize: 11.5 }}>{s.iban ? ibanBello(s.iban) : "—"}</td>
            <td style={{ padding: "5px 8px", color: inPag ? C.blue : scad ? C.red : C.text }}>{s.stato}
              {pag && aumenti && s.fattura_id && aumenti.get(s.fattura_id) && (() => { const f = aumenti.get(s.fattura_id); const col = f.gravita === "alta" ? C.red : f.gravita === "media" ? "#D9730D" : C.green; const vi = visti.get(s.fattura_id);
                return <div><button onClick={() => setApertoAumento(apertoAumento === s.scadenza_id ? null : s.scadenza_id)} style={{ border: `1px solid ${col}`, background: `${col}18`, color: col, fontWeight: 800, borderRadius: 6, padding: "1px 6px", cursor: "pointer", fontSize: 11.5, whiteSpace: "nowrap" }}>
                  ▲ Prezzo aumentato · {NOME_GRAVITA[f.gravita]}</button>{vi ? <div style={{ fontSize: 11, color: C.green }}>✔ Visto</div> : f.gravita === "alta" ? <div style={{ fontSize: 11, color: C.red, fontWeight: 700 }}>«Visto» obbligatorio</div> : null}</div>; })()}</td></tr>,
            pag && aumenti && apertoAumento === s.scadenza_id && aumenti.get(s.fattura_id) && <tr key={"au" + s.scadenza_id}><td colSpan={11} style={{ padding: 8, background: "#FFF8F0", borderBottom: `1px solid ${C.border}` }}>
              <DettaglioAumento f={aumenti.get(s.fattura_id)} vi={visti.get(s.fattura_id)} nomi={base.nomi} nota={notaVisto} setNota={setNotaVisto} lavoro={lavoro} visto={() => segnaVisto(s, aumenti.get(s.fattura_id))} />
            </td></tr>]; })}</tbody></table></div>
      {!sue.length && <div style={{ color: C.muted }}>Nessuna fattura aperta.</div>}
    </div>}
    {sogg && scelte.length > 0 && <div style={{ ...scheda, border: `2px solid ${C.primary}` }}>
      <div style={{ fontWeight: 800, color: C.primary, fontSize: 15, marginBottom: 8 }}>{pag ? "Il pagamento" : "L'incasso"}: {scelte.length === 1 ? "1 fattura" : `${scelte.length} fatture`}, totale {euro(totale)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        <ComeEConCheCosa base={base} verso={verso} v={v} cambia={cambia} importo={totale} />
        <label style={L}>3. Data di disposizione<input type="date" style={sel(!v.data_disposizione)} value={v.data_disposizione} onChange={e => cambia("data_disposizione", e.target.value)} />
          {v.data_disposizione && v.data_disposizione !== oggi && <span style={{ color: C.yellow, fontWeight: 700 }}>Non è oggi: disporre in banca lo stesso giorno in cui si registra qui.</span>}</label>
        <label style={L}>4. Causale contabile (gruppo Fatture)<select style={sel(false)} value={voce} onChange={e => cambia("causale_voce", e.target.value)}>
          {vociDellaSezione(base.causali, sezione, "Fatture").map(c => <option key={c.voce}>{c.voce}</option>)}</select>
          <span style={{ fontWeight: 400, color: C.muted }}>proposta del programma: {vocePropria}</span></label>
        {pag && bonifico && <SceltaIban ibanFattura={ibanFattura} conosciuti={conosciuti} v={v} cambia={cambia} />}
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>5. {bonifico ? "Causale del bonifico (composta dal programma, non si modifica; si può solo aggiungere)" : "Descrizione"} <Contatore testo={causale} /></div>
          <div style={{ fontFamily: "monospace", fontSize: 13, background: "#F4F4F0", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", margin: "4px 0", wordBreak: "break-all" }}>{causale || "—"}</div>
          {comp.livello > 0 && !comp.troppo && <div style={{ fontSize: 12, color: C.muted }}>Per stare nei 140 caratteri il programma ha usato le forme brevi{comp.livello > 1 ? " e l'anno a due cifre" : ""}.</div>}
          <input style={{ ...input, width: "100%" }} placeholder="Aggiunta facoltativa (per esempio il numero d'ordine)" value={v.aggiunta} onChange={e => cambia("aggiunta", e.target.value)} />
        </div>
        <label style={{ ...L, gridColumn: "1 / -1" }}>Nota interna (facoltativa, non va in banca)<input style={sel(false)} value={v.note} onChange={e => cambia("note", e.target.value)} /></label>
      </div>
      {totale > 5000 && <label style={{ display: "block", marginTop: 8, color: C.red, fontWeight: 700, fontSize: 13 }}><input type="checkbox" checked={v.soglia_vista} onChange={e => cambia("soglia_vista", e.target.checked)} /> Ho visto: sopra 5.000 €. Il movimento sarà segnalato tra le anomalie al Dott. Bizzarri e a Teresa Demaria.</label>}
      {problemi.length > 0 && <div style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>Per confermare: {problemi.join("; ")}.</div>}
      {errore && <div style={{ color: C.red, fontWeight: 700, marginTop: 8 }}>⚠️ {errore}</div>}
      <div style={{ marginTop: 10 }}><button style={btn(true)} disabled={!!problemi.length || lavoro} onClick={invia}>{lavoro ? "Registro…" : pag ? "Conferma e manda in pagamento" : "Conferma e registra l'incasso atteso"}</button></div>
    </div>}
  </div>;
}

// ---------------- Versione 374: dettaglio del prezzo aumentato di una fattura, con «Visto» ----------------
function DettaglioAumento({ f, vi, nomi, nota, setNota, lavoro, visto }) {
  return <div style={{ fontSize: 12.5 }}>
    <b>Prezzi aumentati in questa fattura</b> <span style={{ color: C.muted }}>(stessi numeri del «Controllo Prezzi di Acquisto»: prezzo contro la fattura precedente dello stesso fornitore; «in un anno» = aumento × quantità comprate negli ultimi 12 mesi)</span>
    <table style={{ borderCollapse: "collapse", marginTop: 4, background: "#fff" }}><thead><tr style={{ background: "#F4F4F0" }}>
      {["Prodotto", "Prima", "Adesso", "Aumento", "In un anno", "Gravità"].map(h => <th key={h} style={{ padding: "3px 8px", textAlign: "left" }}>{h}</th>)}</tr></thead>
      <tbody>{f.righe.map((r, i) => <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
        <td style={{ padding: "3px 8px", fontWeight: 700 }}>{r.famiglia}</td>
        <td style={{ padding: "3px 8px" }}>{itPrezzo(r.prima, r.decimali)} {r.unita}<div style={{ color: C.muted, fontSize: 11 }}>fattura {r.numeroPrima} del {dataPrezzo(r.dataPrima)}{r.cambioFornitore ? ` (${r.fornitorePrima})` : ""}</div></td>
        <td style={{ padding: "3px 8px" }}>{itPrezzo(r.ora, r.decimali)} {r.unita}</td>
        <td style={{ padding: "3px 8px", color: C.red, fontWeight: 700 }}>+{itPrezzo(r.variazione, 1)}%</td>
        <td style={{ padding: "3px 8px", fontWeight: 700 }}>{itPrezzo(r.impatto, 0)} €</td>
        <td style={{ padding: "3px 8px", color: r.gravita === "alta" ? C.red : r.gravita === "media" ? "#D9730D" : C.green, fontWeight: 700 }}>{NOME_GRAVITA[r.gravita]}</td></tr>)}</tbody></table>
    <div style={{ color: C.muted, marginTop: 4 }}>Il grafico di ogni prodotto è in «Controllo Prezzi di Acquisto» → «Attenzione Variazione Prezzi». Se l'aumento non era concordato, prima di pagare chiedere al fornitore.</div>
    {vi ? <div style={{ color: C.green, fontWeight: 700, marginTop: 4 }}>✔ Visto da {vi.nome} il {dataIt(String(vi.visto_il).slice(0, 10))}{vi.nota ? ` — nota: ${vi.nota}` : ""}</div>
      : <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        <input style={{ ...input, flex: 1, minWidth: 220 }} placeholder="Nota (facoltativa): per esempio «aumento concordato al telefono»" value={nota} onChange={e => setNota(e.target.value)} />
        <button style={btn(true, f.gravita === "alta" ? C.red : undefined)} disabled={lavoro} onClick={visto}>Visto{f.gravita === "alta" ? " (avvisa il Dott. Bizzarri)" : ""}</button></div>}
  </div>;
}

// ---------------- Versione 370: Anticipo su fattura da ricevere ----------------
// Pagamento prima della fattura (proforma, preventivo, offerta): nessuna fattura da spuntare, il documento è obbligatorio.
// Nasce in attesa della banca come gli altri pagamenti; il database crea l'anticipo, che resta in «Anticipi in attesa di fattura»
// finché la fattura del fornitore arriva e chi gestisce i conti la aggancia e chiude.
const TIPI_DOC = [["proforma", "Proforma"], ["preventivo", "Preventivo"], ["offerta", "Offerta"], ["ordine", "Ordine"], ["contratto", "Contratto"], ["altro", "Altro"]];
function SezioneAnticipo({ base, fatto, oggi }) {
  const [cerca, setCerca] = useState(""); const [sogg, setSogg] = useState(null); const [tutte, setTutte] = useState([]); const [erroreStorico, setErroreStorico] = useState("");
  const [v, setV] = useState({ voce: ANTICIPO, consegna_prevista: "", importo: "", tipo: "proforma", numero: "", data_documento: "", modalita: "", conto_id: "", data_disposizione: oggi, aggiunta: "",
    iban_scelta: "", iban_scritto: "", iban_confermato: false, iban_diverso_motivo: "", note: "", soglia_vista: false });
  const [lavoro, setLavoro] = useState(false); const [errore, setErrore] = useState("");
  const cambia = (k, x) => setV(o => ({ ...o, [k]: x }));
  const trovati = useMemo(() => {
    const q = cerca.trim().toLowerCase().replace(/[.\s]/g, "");
    if (q.length < 2) return [];
    return base.fornitori.filter(a => String(a.nome || "").toLowerCase().replace(/[.\s]/g, "").includes(q) || String(a.partita_iva || "").includes(q))
      .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""))).slice(0, 30);
  }, [cerca, base]);
  useEffect(() => { if (!sogg) return; (async () => {
    const r = await fetchAllPages((a, b) => supabase.from("ci_v_scadenzario").select("scadenza_id, iban, data_documento, numero_documento").eq("fornitore_id", sogg).order("data_documento").range(a, b));
    if (r.error) { setErroreStorico("Storico delle fatture non letto: gli IBAN già usati non si vedono. (" + r.error.message + ")"); setTutte([]); return; }
    setErroreStorico(""); setTutte(r.data || []);
  })(); }, [sogg]);
  const imp = leggiImporto(v.importo);
  const bonifico = ["Bonifico", "Bonifico istantaneo"].includes(v.modalita);
  const nomeTipo = TIPI_DOC.find(t => t[0] === v.tipo)?.[1] || "Documento";
  const documento = v.numero.trim() && v.data_documento ? `${nomeTipo} n. ${v.numero.trim()} del ${dataIt(v.data_documento)}` : "";
  const caparra = v.voce === CAPARRA;
  const causale = pulisciCausale([caparra ? causaleAnticipo(v.tipo, v.numero, v.data_documento).replace(/^ACCONTO SU/, "CAPARRA CONFIRMATORIA SU") : causaleAnticipo(v.tipo, v.numero, v.data_documento), v.aggiunta].filter(Boolean).join(" "));
  const conosciuti = [...new Set(tutte.map(s => s.iban).filter(Boolean))];
  const ib = ibanDelModulo(v);
  const problemi = [];
  if (!sogg) problemi.push("scegliere il fornitore");
  if (!imp) problemi.push("scrivere l'importo dell'anticipo");
  if (!v.numero.trim() || !v.data_documento) problemi.push("scrivere numero e data della proforma, del preventivo o dell'offerta");
  if (caparra && !v.consegna_prevista) problemi.push("scrivere la data di consegna prevista (caparra)");
  if (caparra && v.consegna_prevista && v.data_disposizione && v.consegna_prevista < v.data_disposizione) problemi.push("la consegna prevista è prima del pagamento");
  if (!v.modalita) problemi.push("scegliere come si paga");
  if (v.modalita === "Altro" && !String(v.modalita_altro || "").trim()) problemi.push("scrivere quale modalità");
  if (!v.conto_id) problemi.push("scegliere con che cosa");
  if (v.modalita === "Carta di debito" && !v.carta_di_debito_id) problemi.push("scegliere la carta di debito");
  if (v.modalita === "Contanti" && imp >= 5000) problemi.push("contanti da 5.000 € in su: vietato (art. 49 D.Lgs. 231/2007)");
  if (!v.data_disposizione) problemi.push("scrivere la data di disposizione");
  if (bonifico && !causaleValida(causale)) problemi.push("causale del bonifico non valida (al massimo 140 caratteri, senza lettere accentate)");
  if (bonifico) { if (!ib) problemi.push("scegliere o scrivere l'IBAN"); else if (!ibanValido(ib)) problemi.push("IBAN non valido"); else if (!v.iban_confermato) problemi.push("premere «Confermi IBAN»"); }
  if (imp > 5000 && !v.soglia_vista) problemi.push("spuntare «Ho visto: sopra 5.000 €»");
  async function invia() {
    if (problemi.length || lavoro) return;
    setLavoro(true); setErrore("");
    const p = { sezione: "pagamento_fatture", conto_id: Number(v.conto_id), modalita: v.modalita, modalita_altro: v.modalita_altro || "", carta_di_debito_id: v.carta_di_debito_id || "",
      data_disposizione: v.data_disposizione, importo: imp, causale_gruppo: "Fatture", causale_voce: caparra ? CAPARRA : ANTICIPO, fornitore_id: sogg, cliente_id: "",
      causale: bonifico || causale ? causale : "", iban: bonifico ? ib : "", iban_confermato: !!v.iban_confermato, iban_diverso_motivo: "", note: v.note || "", documento_riferimento: documento };
    const { data, error } = await supabase.rpc("ci_disponi_movimento", { p });
    setLavoro(false);
    if (error) return setErrore("Il database non l'ha accettato, non è stato registrato niente: " + error.message);
    const nome = base.fornitori.find(a => a.id === sogg)?.nome;
    // versione 374: la caparra ha la data di consegna prevista (dalla quale partono gli avvisi di consegna)
    let notaConsegna = "";
    if (caparra) {
      const an = await supabase.from("ci_anticipi").select("id").eq("pagamento_id", data.movimento_id).maybeSingle();
      const r = an.data ? await supabase.rpc("ci_caparra_consegna", { p_anticipo: an.data.id, p_data: v.consegna_prevista, p_motivo: "" }) : { error: an.error || { message: "caparra non trovata" } };
      notaConsegna = r.error ? ` ATTENZIONE: la data di consegna prevista non è stata salvata (${r.error.message}): scriverla nella scheda della caparra.` : ` Consegna prevista: ${dataIt(v.consegna_prevista)}.`;
    }
    if (caparra) return fatto({ titolo: `${data.codice_attesa}: caparra confirmatoria a ${nome} mandata in pagamento — in attesa della banca`,
      testo: `Adesso, oggi stesso, disporre ${v.modalita === "Bonifico istantaneo" ? "il bonifico istantaneo" : v.modalita.toLowerCase()} in banca con questi dati (pulsanti «Copia»). La caparra è in «Anticipi e caparre in attesa di fattura»: alla consegna la fattura del fornitore si aggancia lì; se l'affare salta si sceglie l'esito (restituita, trattenuta, restituita il doppio).${notaConsegna}`,
      copie: [["Beneficiario", nome], ["IBAN", bonifico ? ibanBello(ib) : ""], ["Importo", importoIt(imp)], ["Causale", causale], ["Data di esecuzione", dataIt(v.data_disposizione)]].filter(x => x[1]) });
    fatto({ titolo: `${data.codice_attesa}: anticipo a ${nome} mandato in pagamento — in attesa della banca`,
      testo: `Adesso, oggi stesso, disporre ${v.modalita === "Bonifico istantaneo" ? "il bonifico istantaneo" : v.modalita.toLowerCase()} in banca con questi dati (pulsanti «Copia»). L'anticipo è già in «Anticipi in attesa di fattura»: quando arriva la fattura del fornitore si aggancia lì. Se il pagamento non parte, annullarlo in «In attesa della banca».`,
      copie: [["Beneficiario", nome], ["IBAN", bonifico ? ibanBello(ib) : ""], ["Importo", importoIt(imp)], ["Causale", causale], ["Data di esecuzione", dataIt(v.data_disposizione)]].filter(x => x[1]) });
  }
  return <div>
    <div style={scheda}>
      <div style={{ fontWeight: 800, color: C.primary, marginBottom: 4 }}>Anticipo su fattura da ricevere o caparra confirmatoria</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {[[ANTICIPO, "Acconto su fattura da ricevere", "Pagamento di una parte del prezzo: la fattura è dovuta subito (entro 12 giorni); se non arriva, avviso e segnalazione TD29."],
          [CAPARRA, "Caparra confirmatoria su preventivo", "Garanzia dell'affare (art. 1385 c.c.), fuori campo IVA (da confermare con lo Studio): nessuna fattura al pagamento; alla consegna entra nella fattura."]].map(([k, n, d]) =>
          <button key={k} title={d} onClick={() => cambia("voce", k)} style={{ ...btn(v.voce === k), height: "auto", padding: "6px 10px", textAlign: "left", maxWidth: 420 }}><b>{v.voce === k ? "● " : "○ "}{n}</b><br /><span style={{ fontSize: 11.5, fontWeight: 400 }}>{d}</span></button>)}
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8, maxWidth: 1000 }}>Per pagare prima della fattura: su una proforma, un preventivo o un'offerta. Non si spuntano fatture. Il pagamento resta in «Anticipi in attesa di fattura» finché arriva la fattura del fornitore; dal pagamento il fornitore ha 12 giorni per emetterla.</div>
      {!sogg ? <>
        <input style={{ ...input, width: "100%", maxWidth: 520 }} placeholder="Cerca il fornitore: nome anche parziale o partita IVA" value={cerca} onChange={e => setCerca(e.target.value)} />
        <div style={{ marginTop: 6 }}>{trovati.map(a => <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "3px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12.5 }}>
          <b style={{ flex: 1 }}>{a.nome}</b><span style={{ color: C.muted }}>{a.partita_iva || "—"}</span><button style={{ ...btn(true), height: 28 }} onClick={() => setSogg(a.id)}>Scegli</button></div>)}</div>
        {cerca.trim().length >= 2 && !trovati.length && <div style={{ color: C.muted, fontSize: 12.5, marginTop: 6 }}>Nessun fornitore con questo nome. Un fornitore nuovo si aggiunge prima in anagrafica; oppure si paga in banca e si registra poi in «Conferma dei movimenti» con la voce «Acconto su fattura da ricevere».</div>}
      </> : <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 800, color: C.primary, fontSize: 16 }}>{base.fornitori.find(a => a.id === sogg)?.nome} <span style={{ fontSize: 12.5, color: C.muted }}>{base.fornitori.find(a => a.id === sogg)?.partita_iva}</span></div>
        <button style={btn(false)} onClick={() => setSogg(null)}>← Cambia fornitore</button></div>}
      {erroreStorico && <div style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>⚠️ {erroreStorico}</div>}
    </div>
    {sogg && <div style={{ ...scheda, border: `2px solid ${C.primary}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        <label style={L}>Importo dell'anticipo<input style={sel(!imp)} value={v.importo} onChange={e => cambia("importo", e.target.value)} placeholder="es. 3.660,00" /></label>
        <label style={L}>Documento<select style={sel(false)} value={v.tipo} onChange={e => cambia("tipo", e.target.value)}>{TIPI_DOC.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label style={L}>Numero del documento<input style={sel(!v.numero.trim())} value={v.numero} onChange={e => cambia("numero", e.target.value)} /></label>
        <label style={L}>Data del documento<input type="date" style={sel(!v.data_documento)} value={v.data_documento} onChange={e => cambia("data_documento", e.target.value)} /></label>
        {caparra && <label style={L}>Data di consegna prevista (caparra)<input type="date" style={sel(!v.consegna_prevista)} value={v.consegna_prevista} onChange={e => cambia("consegna_prevista", e.target.value)} /></label>}
        <ComeEConCheCosa base={base} verso="uscita" v={v} cambia={cambia} importo={imp} />
        <label style={L}>Data di disposizione<input type="date" style={sel(!v.data_disposizione)} value={v.data_disposizione} onChange={e => cambia("data_disposizione", e.target.value)} />
          {v.data_disposizione && v.data_disposizione !== oggi && <span style={{ color: C.yellow, fontWeight: 700 }}>Non è oggi: disporre in banca lo stesso giorno in cui si registra qui.</span>}</label>
        {bonifico && <SceltaIban ibanFattura={[]} conosciuti={conosciuti} v={v} cambia={cambia} />}
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{bonifico ? "Causale del bonifico (composta dal programma; si può solo aggiungere)" : "Descrizione"} <Contatore testo={causale} /></div>
          <div style={{ fontFamily: "monospace", fontSize: 13, background: "#F4F4F0", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", margin: "4px 0", wordBreak: "break-all" }}>{causale || "—"}</div>
          <input style={{ ...input, width: "100%" }} placeholder="Aggiunta facoltativa (per esempio il numero d'ordine)" value={v.aggiunta} onChange={e => cambia("aggiunta", e.target.value)} />
        </div>
        <label style={{ ...L, gridColumn: "1 / -1" }}>Nota interna (facoltativa, non va in banca)<input style={sel(false)} value={v.note} onChange={e => cambia("note", e.target.value)} /></label>
      </div>
      {imp > 5000 && <label style={{ display: "block", marginTop: 8, color: C.red, fontWeight: 700, fontSize: 13 }}><input type="checkbox" checked={v.soglia_vista} onChange={e => cambia("soglia_vista", e.target.checked)} /> Ho visto: sopra 5.000 €. Il movimento sarà segnalato tra le anomalie al Dott. Bizzarri e a Teresa Demaria.</label>}
      {problemi.length > 0 && <div style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>Per confermare: {problemi.join("; ")}.</div>}
      {errore && <div style={{ color: C.red, fontWeight: 700, marginTop: 8 }}>⚠️ {errore}</div>}
      <div style={{ marginTop: 10 }}><button style={btn(true)} disabled={!!problemi.length || lavoro} onClick={invia}>{lavoro ? "Registro…" : caparra ? "Conferma e manda in pagamento la caparra" : "Conferma e manda in pagamento l'anticipo"}</button></div>
    </div>}
  </div>;
}

// ---------------- Altri pagamenti / Altri incassi ----------------
function SezioneAltri({ sezione, base, fatto, oggi }) {
  const pag = sezione === "altri_pagamenti"; const verso = pag ? "uscita" : "entrata";
  const [v, setV] = useState({ modalita: "", conto_id: "", data_disposizione: oggi, causale_gruppo: "", causale_voce: "", causale_altro: "", soggetto: "", controparte: "", importo: "",
    causale: "", documento_riferimento: "", iban_scelta: "altro", iban_scritto: "", iban_confermato: false, note: "", soglia_vista: false });
  const [lavoro, setLavoro] = useState(false); const [errore, setErrore] = useState("");
  const cambia = (k, x) => setV(o => ({ ...o, [k]: x }));
  const gruppi = GRUPPI_SEZIONE[sezione];
  const voci = v.causale_gruppo ? vociDellaSezione(base.causali, sezione, v.causale_gruppo) : [];
  const imp = leggiImporto(v.importo);
  const bonifico = ["Bonifico", "Bonifico istantaneo"].includes(v.modalita);
  const causale = pulisciCausale(v.causale);
  const ib = ibanPulito(v.iban_scritto);
  const [tipoS, idS] = String(v.soggetto).split(":");
  const nomeS = tipoS === "f" ? base.fornitori.find(a => a.id === Number(idS))?.nome : tipoS === "c" ? base.clienti.find(a => a.id === Number(idS))?.nome : "";
  const problemi = [];
  if (!v.causale_gruppo || !v.causale_voce) problemi.push("scegliere gruppo e voce");
  if (v.causale_voce === "Altro" && !v.causale_altro.trim()) problemi.push("scrivere che cosa (voce «Altro»)");
  if (!v.soggetto || (v.soggetto === "altro" && !v.controparte.trim())) problemi.push("scegliere o scrivere il soggetto");
  if (!imp) problemi.push("scrivere l'importo");
  if (!v.modalita) problemi.push("scegliere come si " + (pag ? "paga" : "incassa"));
  if (v.modalita === "Altro" && !String(v.modalita_altro || "").trim()) problemi.push("scrivere quale modalità");
  if (!v.conto_id) problemi.push("scegliere con che cosa");
  if (v.modalita === "Carta di debito" && !v.carta_di_debito_id) problemi.push("scegliere la carta di debito");
  if (v.modalita === "Contanti" && imp >= 5000) problemi.push("contanti da 5.000 € in su: vietato (art. 49 D.Lgs. 231/2007)");
  if (!pag && !v.documento_riferimento.trim()) problemi.push("scrivere il documento (obbligatorio per gli altri incassi)");
  if (bonifico && !causaleValida(causale)) problemi.push("scrivere la causale del bonifico (al massimo 140 caratteri)");
  if (pag && bonifico) { if (!ib) problemi.push("scrivere l'IBAN"); else if (!ibanValido(ib)) problemi.push("IBAN non valido"); else if (!v.iban_confermato) problemi.push("premere «Confermi IBAN»"); }
  if (imp > 5000 && !v.soglia_vista) problemi.push("spuntare «Ho visto: sopra 5.000 €»");
  async function invia() {
    if (problemi.length || lavoro) return; setLavoro(true); setErrore("");
    const p = { sezione, conto_id: Number(v.conto_id), modalita: v.modalita, modalita_altro: v.modalita_altro || "", carta_di_debito_id: v.carta_di_debito_id || "", data_disposizione: v.data_disposizione,
      importo: imp, causale_gruppo: v.causale_gruppo, causale_voce: v.causale_voce, causale_altro: v.causale_altro, fornitore_id: tipoS === "f" ? Number(idS) : "", cliente_id: tipoS === "c" ? Number(idS) : "",
      controparte: v.soggetto === "altro" ? v.controparte.trim() : nomeS, causale: causale, iban: pag && bonifico ? ib : "", iban_confermato: !!v.iban_confermato, documento_riferimento: v.documento_riferimento, note: v.note };
    const { data, error } = await supabase.rpc("ci_disponi_movimento", { p });
    setLavoro(false);
    if (error) return setErrore("Il database non l'ha accettato, non è stato registrato niente: " + error.message);
    fatto({ titolo: `${data.codice_attesa}: ${pag ? "pagamento mandato in pagamento" : "incasso atteso registrato"} — in attesa della banca`,
      testo: pag ? "Adesso, oggi stesso, disporre il pagamento in banca con questi dati. Alla conferma della banca prenderà il numero di prima nota." : "Alla conferma della banca prenderà il numero di prima nota.",
      copie: [["Beneficiario", pag ? (v.soggetto === "altro" ? v.controparte : nomeS) : ""], ["IBAN", pag && bonifico ? ibanBello(ib) : ""], ["Importo", importoIt(imp)], ["Causale", causale], ["Data di esecuzione", dataIt(v.data_disposizione)]].filter(x => x[1]) });
  }
  return <div style={{ ...scheda, border: `2px solid ${C.primary}` }}>
    <div style={{ fontWeight: 800, color: C.primary, fontSize: 15, marginBottom: 4 }}>{pag ? "Altri pagamenti" : "Altri incassi"}</div>
    <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>{pag ? "Pagamenti senza fattura nel programma: stipendi, compensi, tasse ed enti, assicurazioni, quote, affitti, investimenti, soci, rimborsi, finanziamenti. Gli F24 hanno la loro sezione."
      : "Incassi senza fattura nel programma: soci, contributi, rimborsi, finanziamenti, vendita di beni strumentali. Il documento è obbligatorio (delibera, decreto, contratto, lettera)."}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
      <label style={L}>Per che cosa: gruppo<select style={sel(!v.causale_gruppo)} value={v.causale_gruppo} onChange={e => { cambia("causale_gruppo", e.target.value); cambia("causale_voce", ""); }}>
        <option value="">— scegliere —</option>{gruppi.map(g => <option key={g}>{g}</option>)}</select></label>
      <label style={L}>Voce<select style={sel(!v.causale_voce)} value={v.causale_voce} disabled={!v.causale_gruppo} onChange={e => cambia("causale_voce", e.target.value)}>
        <option value="">— scegliere —</option>{voci.map(c => <option key={c.voce}>{c.voce}</option>)}</select></label>
      {v.causale_voce === "Altro" && <label style={L}>Che cosa (obbligatorio)<input style={sel(!v.causale_altro.trim())} value={v.causale_altro} onChange={e => cambia("causale_altro", e.target.value)} /></label>}
      <label style={L}>Soggetto (dall'anagrafica)<select style={sel(!v.soggetto)} value={v.soggetto} onChange={e => cambia("soggetto", e.target.value)}>
        <option value="">— scegliere —</option><option value="altro">Non è in anagrafica (dipendente, ente, socio…): scriverlo</option>
        <optgroup label="Fornitori">{[...base.fornitori].sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""))).map(a => <option key={"f" + a.id} value={`f:${a.id}`}>{a.nome}</option>)}</optgroup>
        <optgroup label="Clienti">{[...base.clienti].sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""))).map(a => <option key={"c" + a.id} value={`c:${a.id}`}>{a.nome}</option>)}</optgroup></select></label>
      {v.soggetto === "altro" && <label style={L}>Nome del soggetto<input style={sel(!v.controparte.trim())} value={v.controparte} onChange={e => cambia("controparte", e.target.value)} placeholder="es. ROSSI MARIO" /></label>}
      <label style={L}>Importo (€)<input style={sel(!imp)} value={v.importo} onChange={e => cambia("importo", e.target.value)} placeholder="1.975,00" /></label>
      <ComeEConCheCosa base={base} verso={verso} v={v} cambia={cambia} importo={imp} />
      <label style={L}>Data di disposizione<input type="date" style={sel(!v.data_disposizione)} value={v.data_disposizione} onChange={e => cambia("data_disposizione", e.target.value)} />
        {v.data_disposizione !== oggi && <span style={{ color: C.yellow, fontWeight: 700 }}>Non è oggi.</span>}</label>
      {!pag && <label style={L}>Documento (obbligatorio)<input style={sel(!v.documento_riferimento.trim())} value={v.documento_riferimento} onChange={e => cambia("documento_riferimento", e.target.value)} placeholder="es. verbale dell'assemblea del 10/06/2026" /></label>}
      {pag && bonifico && <div style={{ ...L, gridColumn: "1 / -1" }}>IBAN del beneficiario
        <input style={sel(!ib || !ibanValido(ib))} value={v.iban_scritto} onChange={e => { cambia("iban_scritto", e.target.value); cambia("iban_confermato", false); }} placeholder="IT00 X000 0000 0000 0000 0000 000" />
        {ib && !ibanValido(ib) && <span style={{ color: C.red }}>IBAN non valido: forma o cifre di controllo sbagliate.</span>}
        {ib && ibanValido(ib) && <div><button style={btn(!!v.iban_confermato, C.green)} onClick={() => cambia("iban_confermato", true)}>{v.iban_confermato ? `✔ IBAN confermato: ${ibanBello(ib)}` : "Confermi IBAN"}</button></div>}</div>}
      <div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: 12, fontWeight: 700 }}>{bonifico ? "Causale del bonifico" : "Descrizione"} <Contatore testo={causale} /></div>
        <input style={{ ...sel(bonifico && !causaleValida(causale)), marginTop: 4 }} value={v.causale} onChange={e => cambia("causale", e.target.value)} placeholder={pag ? "es. STIPENDIO OTTOBRE 2026" : "es. FINANZIAMENTO SOCI"} />
        {v.causale && causale !== v.causale.trim() && <div style={{ fontSize: 12, color: C.muted }}>In banca andrà così: <b>{causale}</b></div>}</div>
      <label style={{ ...L, gridColumn: "1 / -1" }}>Nota interna (facoltativa)<input style={sel(false)} value={v.note} onChange={e => cambia("note", e.target.value)} /></label>
    </div>
    {imp > 5000 && <label style={{ display: "block", marginTop: 8, color: C.red, fontWeight: 700, fontSize: 13 }}><input type="checkbox" checked={v.soglia_vista} onChange={e => cambia("soglia_vista", e.target.checked)} /> Ho visto: sopra 5.000 €. Sarà segnalato al Dott. Bizzarri e a Teresa Demaria.</label>}
    {problemi.length > 0 && <div style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>Per confermare: {problemi.join("; ")}.</div>}
    {errore && <div style={{ color: C.red, fontWeight: 700, marginTop: 8 }}>⚠️ {errore}</div>}
    <div style={{ marginTop: 10 }}><button style={btn(true)} disabled={!!problemi.length || lavoro} onClick={invia}>{lavoro ? "Registro…" : pag ? "Conferma e manda in pagamento" : "Conferma e registra l'incasso atteso"}</button></div>
  </div>;
}

// ---------------- Giroconti ----------------
const MODALITA_GIRO = { "Prelievo di contanti": "Carta di debito", "Versamento in banca": "Contanti", "Ricarica carta prepagata": "Carta prepagata", "Addebito della carta di credito": "Addebito diretto SEPA", "Giroconto tra conti di banca": "Bonifico" };
function SezioneGiroconti({ base, fatto, oggi }) {
  const [v, setV] = useState({ voce: "", da: "", a: "", importo: "", data: oggi, note: "" });
  const [lavoro, setLavoro] = useState(false); const [errore, setErrore] = useState("");
  const cambia = (k, x) => setV(o => ({ ...o, [k]: x }));
  const aperti = base.conti.filter(c => c.stato === "aperto");
  const imp = leggiImporto(v.importo);
  const da = aperti.find(c => c.id === Number(v.da)), a = aperti.find(c => c.id === Number(v.a));
  const conPartenza = id => base.stati.some(s => s.conto_id === id && s.partenza_alla_data);
  const problemi = [];
  if (!v.voce) problemi.push("scegliere il tipo di giroconto");
  if (!da || !a) problemi.push("scegliere i due conti"); else if (da.id === a.id) problemi.push("i due conti devono essere diversi");
  if (v.voce === "Prelievo di contanti" && da && a && !(da.tipo === "banca" && a.tipo === "cassa")) problemi.push("il prelievo va dalla banca alla cassa");
  if (v.voce === "Versamento in banca" && da && a && !(da.tipo === "cassa" && a.tipo === "banca")) problemi.push("il versamento va dalla cassa alla banca");
  if (v.voce === "Ricarica carta prepagata" && a && a.tipo !== "carta prepagata") problemi.push("la ricarica va verso una carta prepagata");
  if (v.voce === "Addebito della carta di credito" && a && a.tipo !== "carta di credito") problemi.push("l'addebito va verso la carta di credito");
  if (v.voce === "Giroconto tra conti di banca" && da && a && !(da.tipo === "banca" && a.tipo === "banca")) problemi.push("il giroconto tra banche va da una banca a un'altra");
  if ([da, a].some(c => c?.tipo === "cassa" && !conPartenza(c.id))) problemi.push("la cassa non ha ancora il saldo di partenza");
  if (!imp) problemi.push("scrivere l'importo");
  return <div style={{ ...scheda, border: `2px solid ${C.primary}` }}>
    <div style={{ fontWeight: 800, color: C.primary, fontSize: 15 }}>Giroconto</div>
    <div style={{ fontSize: 12.5, color: C.muted, margin: "4px 0 10px" }}>Soldi che passano da un conto di Podere Verde a un altro: prelievo, versamento, ricarica della carta, addebito della carta di credito, giroconto tra banche. Nascono due movimenti in attesa, uno per conto (G-0001-U uscita, G-0001-E entrata); ognuno si conferma con il suo estratto. Mai costo né ricavo.</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
      <label style={L}>Tipo<select style={sel(!v.voce)} value={v.voce} onChange={e => cambia("voce", e.target.value)}><option value="">— scegliere —</option>{vociDellaSezione(base.causali, "giroconti", "Giroconti").map(c => <option key={c.voce}>{c.voce}</option>)}</select></label>
      <label style={L}>Da (esce)<select style={sel(!v.da)} value={v.da} onChange={e => cambia("da", e.target.value)}><option value="">— scegliere —</option>{aperti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <label style={L}>A (entra)<select style={sel(!v.a)} value={v.a} onChange={e => cambia("a", e.target.value)}><option value="">— scegliere —</option>{aperti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <label style={L}>Importo (€)<input style={sel(!imp)} value={v.importo} onChange={e => cambia("importo", e.target.value)} /></label>
      <label style={L}>Data di disposizione<input type="date" style={sel(!v.data)} value={v.data} onChange={e => cambia("data", e.target.value)} /></label>
      <label style={L}>Nota interna (facoltativa)<input style={sel(false)} value={v.note} onChange={e => cambia("note", e.target.value)} /></label>
    </div>
    {problemi.length > 0 && <div style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>Per confermare: {problemi.join("; ")}.</div>}
    {errore && <div style={{ color: C.red, fontWeight: 700, marginTop: 8 }}>⚠️ {errore}</div>}
    <div style={{ marginTop: 10 }}><button style={btn(true)} disabled={!!problemi.length || lavoro} onClick={async () => {
      setLavoro(true); setErrore("");
      const { data, error } = await supabase.rpc("ci_disponi_giroconto", { p: { conto_da: da.id, conto_a: a.id, importo: imp, data_disposizione: v.data, causale_voce: v.voce, modalita: MODALITA_GIRO[v.voce] || "Altro", note: v.note } });
      setLavoro(false); if (error) return setErrore("Il database non l'ha accettato: " + error.message);
      fatto({ titolo: `${data.codice_attesa}: giroconto registrato — in attesa della banca`, testo: `${v.voce} di ${euro(imp)} da ${da.nome} a ${a.nome}. Ognuno dei due lati si conferma con il suo estratto in «Conferma dei movimenti».` });
    }}>{lavoro ? "Registro…" : "Conferma il giroconto"}</button></div>
  </div>;
}

// ---------------- In attesa della banca ----------------
function InAttesa({ base, oggi, fatto }) {
  const [annulla, setAnnulla] = useState(null); const [motivo, setMotivo] = useState(""); const [errore, setErrore] = useState(""); const [lavoro, setLavoro] = useState(false);
  const elenco = [...base.attesa].sort((a, b) => (a.data_disposizione || a.data).localeCompare(b.data_disposizione || b.data) || a.id - b.id);
  const fatture = id => base.abbinamenti.filter(x => x.pagamento_id === id).map(x => { const s = base.scadenze.find(y => y.scadenza_id === x.scadenza_id); return s ? `${s.numero_documento} del ${dataIt(s.data_documento)} (${euro(x.importo)})` : `scadenza ${x.scadenza_id}`; });
  return <div style={scheda}>
    <div style={{ fontWeight: 800, color: C.blue, marginBottom: 4 }}>In attesa della banca ({elenco.length})</div>
    <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>Disposizioni non ancora trovate nell'estratto della banca. Si confermano in «Banche, carte e cassa» → «Conferma dei movimenti» dopo aver caricato l'estratto. Avviso in rosso: stipendi, compensi e tributi dopo 3 giorni lavorativi; gli altri dopo 10; subito se la banca è già caricata 2 giorni lavorativi oltre la data e il movimento non c'è.</div>
    {!elenco.length && <div style={{ color: C.green }}>Nessun movimento in attesa.</div>}
    {elenco.length > 0 && <div style={{ overflowX: "auto" }}><table style={{ width: "100%", fontSize: 12.5, background: "#fff" }}><thead><tr style={{ background: C.blue, color: "#fff" }}>
      {["Codice", "Disposto il", "Conto", "Uscita", "Entrata", "Soggetto", "Causale contabile", "Modalità", "Causale / fatture", "Avviso", ""].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
      <tbody>{elenco.map(m => { const st = base.stati.find(s => s.conto_id === m.conto_id); const a = statoAttesa(m, st?.controllo_ok_alla_data, oggi);
        return [<tr key={m.id} style={{ borderBottom: `1px solid ${C.border}`, background: a.rosso ? `${C.red}10` : "#fff" }}>
          <td style={{ padding: "5px 8px", fontWeight: 800 }}>{m.codice_attesa}{m.sopra_soglia ? <div style={{ color: C.red, fontSize: 11 }}>sopra soglia 5.000 €</div> : null}</td>
          <td style={{ padding: "5px 8px" }}>{dataIt(m.data_disposizione)}<div style={{ fontSize: 11, color: C.muted }}>{base.nomi[m.disposto_da] || ""}</div></td>
          <td style={{ padding: "5px 8px" }}>{m.conto}</td>
          <td style={{ padding: "5px 8px", textAlign: "right", color: C.red }}>{m.verso === "uscita" ? euro(m.importo) : ""}</td>
          <td style={{ padding: "5px 8px", textAlign: "right", color: C.green }}>{m.verso === "entrata" ? euro(m.importo) : ""}</td>
          <td style={{ padding: "5px 8px" }}>{m.controparte}</td><td style={{ padding: "5px 8px" }}>{m.causale_voce}</td><td style={{ padding: "5px 8px" }}>{m.modalita}</td>
          <td style={{ padding: "5px 8px", maxWidth: 300 }}>{m.causale}{fatture(m.id).length ? <div style={{ fontSize: 11.5, color: C.muted }}>fatture: {fatture(m.id).join("; ")}</div> : null}{m.documento_riferimento ? <div style={{ fontSize: 11.5, color: C.muted }}>documento: {m.documento_riferimento}</div> : null}</td>
          <td style={{ padding: "5px 8px", color: a.rosso ? C.red : C.blue, maxWidth: 260 }}>{a.causa}</td>
          <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}><button style={btn(false, C.red)} onClick={() => { setAnnulla(m); setMotivo(""); setErrore(""); }}>Annulla</button></td></tr>,
          annulla?.id === m.id && <tr key={"a" + m.id}><td colSpan={11} style={{ padding: 10, borderBottom: `2px solid ${C.red}` }}>
            Annullare <b>{m.codice_attesa}</b> di {euro(m.importo)}? Si fa solo se in banca non è partito (controllare in banca). Il movimento e i suoi abbinamenti alle fatture escono; resta scritto chi l'ha annullato, quando e perché.{m.codice_attesa.startsWith("G-") ? " Si annullano insieme i due lati del giroconto." : ""}
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}><input style={{ ...input, flex: 1 }} placeholder="motivo (obbligatorio): es. bonifico non autorizzato in banca" value={motivo} onChange={e => setMotivo(e.target.value)} />
              <button style={btn(true, C.red)} disabled={!motivo.trim() || lavoro} onClick={async () => {
                setLavoro(true); const r = await supabase.rpc("ci_annulla_disposizione", { p_movimento: m.id, p_motivo: motivo.trim() }); setLavoro(false);
                if (r.error) return setErrore("Non annullato: " + r.error.message);
                fatto({ titolo: `${m.codice_attesa} annullato`, testo: `Motivo: ${motivo.trim()}. Le fatture tornano da ${m.verso === "uscita" ? "pagare" : "incassare"}.` });
              }}>Conferma l'annullamento</button><button style={btn(false)} onClick={() => setAnnulla(null)}>Lascia stare</button></div>
            {errore && <div style={{ color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>}</td></tr>]; })}</tbody></table></div>}
  </div>;
}
