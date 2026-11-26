// Versione 406 (Tenente, 25/11/2026): scheda «Stipendi e compensi» (SezioneStipendi, regole nel database: ci_paga_stipendio); in «Altri pagamenti»
// stipendi, acconti, compensi, TFR e prestiti del personale non si scelgono più (VOCI_PERSONALE_STIPENDI).
// Versione 401 (Soldato, 24/11/2026): «Pagamento fatture» e «Professionisti con ritenuta» (fatture con ritenuta a parte); nota di credito scelta
// con la fattura e mail al fornitore obbligatoria (ci_paga_fatture_401: prima la prova nel database, poi la mail con il testo scritto dal database,
// poi il pagamento); Word del pagamento; «Carica la distinta» → «pagato»; contanti definitivi subito in tutte le sezioni e nei giroconti, con chi
// ha i contanti in mano (ci_disponi_401, ci_disponi_giroconto_401). Dopo il primo ricontrollo: claude/soldato_401_ricontrollo_primo_giro.md.
// Versione 396 (Tenente, 24/11/2026): pulsante «F24» (si sceglie l'F24 da pagare, come e da quale conto; regole nel database: ci_f24_disponi).
// Versione 393 (Tenente, 23/11/2026): rimandi con i nomi nuovi delle pagine di «Banche, carte e cassa».
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
import { useStatiFatture, EtichettaStatoFattura, CONTESTATA, ATTESA_NC } from "./statoFatture"; // versione 375
import { md5, md5File } from "./md5"; // versione 396; md5File versione 403
import { mandaMailFornitore } from "./statoFatture"; // versione 401
import { PulsanteDistinta, leggiDistinte } from "./distintePagamento"; // versione 401
import { scaricaWordPagamento } from "./wordPagamento"; // versione 401

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
  .flatMap(t => t.id === "pagamento_fatture" ? [t, { id: "professionisti", nome: "Professionisti con ritenuta" }, { id: "anticipo", nome: "Anticipo o caparra su fattura da ricevere" }] : t.id === "altri_pagamenti" ? [t, { id: "stipendi", nome: "Stipendi e compensi" }, { id: "f24", nome: "F24" }] : [t]);   // versione 396: «F24»; versione 406: «Stipendi e compensi»
const ANTICIPO = "Acconto su fattura da ricevere";
const CAPARRA = "Caparra confirmatoria su preventivo";   // versione 374 (decisione del Dott. Bizzarri del 12/11/2026 ore 17:57)
const PENITENZIALE = "Caparra penitenziale su preventivo";   // versione 402 (art. 1386 c.c.)
const BENE = "Acconto su bene strumentale";   // versione 403: dal modulo dell'anticipo, con il documento (gruppo «Investimenti»)
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

export default function GestioneIncassiPagamenti({ vaiA } = {}) {
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
      fetchAllPages((a, b) => supabase.from("ci_pagamenti_fatture").select("id, conto_id, conto, data, verso, importo, controparte, causale, fornitore_id, cliente_id, esercizio, progressivo, confermato_il, natura, modalita, causale_gruppo, causale_voce, codice_attesa, data_disposizione, iban_beneficiario, iban_diverso_motivo, documento_riferimento, sopra_soglia, disposto_da, disposto_il, riga_fonte_id, stornato_il, movimento_collegato_id, distinta_id")
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
    let distinte = {}; // versione 401: distinte dei pagamenti in attesa («pagato»)
    try { distinte = await leggiDistinte(attesa.map(m => m.distinta_id), []); } catch (e) { throw new Error("distinte dei pagamenti: " + e.message); }
    const tutteSc = [...(sc.data || []), ...(scA.data || []).filter(x => !(sc.data || []).some(y => y.scadenza_id === x.scadenza_id))].filter(x => x.scadenza_id);
    setBase({ conti: co.data || [], carte: (ca.data || []).filter(k => k.attiva), stati, causali: cau.data || [], fornitori: fo.data || [], clienti: cl.data || [],
      scadenze: tutteSc, movimenti, attesa, abbinamenti, nomi, daConfermare, saldi, distinte, gestore: pr.data === true });
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
        out.push({ tipo: "Movimenti della banca non caricati", testo: `${c.nome}: documenti caricati solo fino al ${dataIt(st.controllo_ok_alla_data)}. Scaricare dalla banca i movimenti successivi e caricarli in «Banche, carte e cassa» → «Carica dal cloud estratti conto e distinte»: senza di loro i pagamenti disposti non si possono confermare.` });
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
      {esito && <Esito esito={esito} chiudi={() => setEsito(null)} ricarica={() => setGiro(g => g + 1)} />}
      {errore && <div style={{ ...scheda, color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>}
      {(tab === "pagamento_fatture" || tab === "incasso_fatture") && <SezioneFatture key={tab + giro} sezione={tab} base={base} fatto={fatto} oggi={oggi} />}
      {tab === "professionisti" && <SezioneFatture key={tab + giro} sezione="pagamento_fatture" professionisti base={base} fatto={fatto} oggi={oggi} />}
      {tab === "anticipo" && <SezioneAnticipo key={giro} base={base} fatto={fatto} oggi={oggi} />}
      {(tab === "altri_pagamenti" || tab === "altri_incassi") && <SezioneAltri key={tab + giro} sezione={tab} base={base} fatto={fatto} oggi={oggi} />}
      {tab === "stipendi" && <SezioneStipendi key={giro} base={base} fatto={fatto} oggi={oggi} />}
      {tab === "giroconti" && <SezioneGiroconti key={giro} base={base} fatto={fatto} oggi={oggi} />}
      {tab === "f24" && <SezioneF24 key={giro} base={base} fatto={fatto} oggi={oggi} vaiA={vaiA} />}
      {tab === "attesa" && <InAttesa base={base} oggi={oggi} fatto={fatto} ricarica={() => setGiro(g => g + 1)} />}
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

function Esito({ esito, chiudi, ricarica }) {
  // versione 401: Word del pagamento e «Carica la distinta» subito dopo la conferma
  const [distinte, setDistinte] = useState({}); const [mov, setMov] = useState(esito.movimento || null); const [erroreWord, setErroreWord] = useState("");
  async function dopoDistinta() {
    const r = await supabase.from("ci_pagamenti_fatture").select("id, data, conto, distinta_id").eq("id", mov.id).maybeSingle();
    if (r.data) { setMov(r.data); try { setDistinte(await leggiDistinte([r.data.distinta_id], [])); } catch { /* si vede alla prossima lettura */ } }
    ricarica && ricarica();
  }
  return <div style={{ ...scheda, border: `2px solid ${C.green}` }}>
    <div style={{ fontWeight: 800, color: C.green, fontSize: 15 }}>✔ {esito.titolo}</div>
    <div style={{ fontSize: 13, margin: "6px 0" }}>{esito.testo}</div>
    {esito.copie && <div style={{ display: "flex", flexWrap: "wrap" }}>{esito.copie.map(([e, v]) => <Copia key={e} etichetta={e} valore={v} />)}</div>}
    {(esito.word || mov) && <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
      {esito.word && <button style={btn(true)} onClick={() => scaricaWordPagamento(esito.word).catch(e => setErroreWord("Word non creato: " + e.message))}>📄 Scarica il Word del pagamento</button>}
      {mov && <span style={{ fontSize: 12.5 }}>Fatto il bonifico, <b>carica la distinta</b>: <PulsanteDistinta movimento={mov} distinte={distinte} onCambiato={dopoDistinta} /></span>}
      {mov?.distinta_id && <b style={{ color: C.green }}>✔ Pagato (distinta caricata): in prima nota resta provvisorio finché arriva l'estratto conto</b>}
    </div>}
    {erroreWord && <div style={{ color: C.red, fontWeight: 700 }}>⚠️ {erroreWord}</div>}
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
      {v.modalita && !adatti.length && <span style={{ color: C.red, fontWeight: 400 }}>Nessun conto o carta registrato per «{v.modalita}»: aprirlo in «Banche, carte e cassa» → «Gestione e controllo banca, carte e cassa».</span>}
      {scelto && verso === "uscita" && importo && disp(scelto.id) !== null && disp(scelto.id) < importo && <span style={{ color: C.red, fontWeight: 700 }}>Il disponibile non copre l'importo.</span>}
    </label>
    {v.modalita === "Carta di debito" && v.conto_id && <label style={L}>Quale carta di debito o bancomat
      <select style={sel(!v.carta_di_debito_id)} value={v.carta_di_debito_id || ""} onChange={e => cambia("carta_di_debito_id", e.target.value)}>
        <option value="">— scegliere —</option>{carte.map(k => <option key={k.id} value={k.id}>{k.tipo} …{k.ultime_quattro_cifre} — {k.titolare}</option>)}</select>
      {!carte.length && <span style={{ color: C.red, fontWeight: 400 }}>Nessuna carta di debito registrata su questo conto: aggiungerla nella scheda del conto.</span>}</label>}
  </>;
}
// versione 401: contanti — chi li ha in mano (persone abilitate ai contanti, con i contanti in carico). Il database rifiuta
// i contanti senza la persona, con la data nel futuro o prima della partenza della cassa, e i pagamenti oltre i contanti in carico.
function SceltaContanti({ verso, v, cambia, importo }) {
  const [persone, setPersone] = useState(null); const [err, setErr] = useState("");
  useEffect(() => { supabase.rpc("ci_contanti_persone_401").then(({ data, error }) => { if (error) setErr(error.message); else setPersone(data || []); }); }, []);
  const p = (persone || []).find(x => x.profilo_id === v.contanti_persona);
  return <div style={{ gridColumn: "1 / -1", border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, background: "#FFFBEA" }}>
    <label style={L}>Chi ha i contanti in mano ({verso === "uscita" ? "chi paga" : "chi incassa"})
      <select style={sel(!v.contanti_persona)} value={v.contanti_persona || ""} onChange={e => cambia("contanti_persona", e.target.value)}>
        <option value="">— scegliere —</option>{(persone || []).map(x => <option key={x.profilo_id} value={x.profilo_id}>{x.nome}{x.in_carico === null ? "" : ` — contanti in carico ${euro(x.in_carico)}`}</option>)}</select></label>
    {err && <div style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>Elenco delle persone non letto: {err}</div>}
    {persone && !persone.length && <div style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>Non hai contanti dell'azienda in carico: in contanti registra chi li ha in mano, o chi gestisce i conti.</div>}
    {p && p.in_carico !== null && verso === "uscita" && importo > 0 && Number(p.in_carico) < importo && <div style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>{p.nome} ha in carico solo {euro(p.in_carico)}: i contanti non bastano.</div>}
    <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>In contanti il movimento è definitivo subito e prende il numero di prima nota. La data è il giorno in cui i soldi sono passati di mano (non nel futuro). I contanti {verso === "uscita" ? "escono dai" : "entrano nei"} contanti in carico della persona scelta. Sulla stessa fattura, in contanti, in tutto meno di 5.000 € (anche a rate).</div>
  </div>;
}
const problemiContanti = (v, oggi) => v.modalita !== "Contanti" ? [] : [...(!v.contanti_persona ? ["scegliere chi ha i contanti in mano"] : []), ...(v.data_disposizione && v.data_disposizione > oggi ? ["in contanti la data non può essere nel futuro"] : [])];
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
function SezioneFatture({ sezione, base, fatto, oggi, professionisti = false }) {
  const pag = sezione === "pagamento_fatture"; const lato = pag ? "fornitore" : "cliente"; const verso = pag ? "uscita" : "entrata";
  const anag = pag ? base.fornitori : base.clienti;
  const [cerca, setCerca] = useState(""); const [sogg, setSogg] = useState(null); const [tutte, setTutte] = useState([]);
  const [spunte, setSpunte] = useState({}); // scadenza_id → importo (testo)
  const [v, setV] = useState({ modalita: "", conto_id: "", data_disposizione: oggi, causale_voce: "", aggiunta: "", iban_scelta: "", iban_scritto: "", iban_confermato: false, iban_diverso_motivo: "", note: "", soglia_vista: false, contanti_persona: "" });
  const [lavoro, setLavoro] = useState(false); const [errore, setErrore] = useState(""); const [erroreStorico, setErroreStorico] = useState("");
  // versione 401: mail della nota di credito già partita per questo pagamento (si riusa se si riprova con lo stesso testo)
  const [mailFatta, setMailFatta] = useState(null); const [anteprima, setAnteprima] = useState({ chiave: "", testo: "", oggetto: "", errore: "" });
  const cambia = (k, x) => setV(o => ({ ...o, [k]: x }));
  // versione 401: le fatture con ritenuta d'acconto (professionisti) hanno il loro pulsante; qui solo le altre (decisione del 24/11 ore 20:00)
  const conRitenuta = s => Number(s.ritenuta) > 0;
  const aperte = base.scadenze.filter(s => s.lato === lato && (!pag || (professionisti ? conRitenuta(s) : !conRitenuta(s))));
  // versione 401: note di credito del fornitore non ancora usate, da scegliere insieme alla fattura (decisione del 23/11 ore 18:25)
  const [nc, setNc] = useState({}); // scadenza_id della nota → { importo (testo), fattura (scadenza_id) }
  const [puoForzare, setPuoForzare] = useState(false); const [forza, setForza] = useState(false); const [motivoForza, setMotivoForza] = useState("");
  const azzeraNote = () => { setNc({}); setForza(false); setMotivoForza(""); setAnteprima({ chiave: "", testo: "", oggetto: "", errore: "" }); };
  useEffect(() => { if (pag) supabase.rpc("ci_puo_forzare_pagamento_senza_mail").then(({ data }) => setPuoForzare(data === true)); }, [pag]);
  // versione 374: «Prezzo aumentato» (stessi numeri del «Controllo Prezzi di Acquisto»); versione 407: niente blocco, doppia conferma da 200 € l'anno
  const [aumenti, setAumenti] = useState(null); const [erroreAumenti, setErroreAumenti] = useState("");
  const [visti, setVisti] = useState(new Map()); const [giroVisti, setGiroVisti] = useState(0); const [apertoAumento, setApertoAumento] = useState(null);
  const [notaVisto, setNotaVisto] = useState(""); const [dottore, setDottore] = useState(false);
  const [erroreVisti, setErroreVisti] = useState("");   // versione 407: separato dall'errore del calcolo, così l'attesa del controllo non salta
  // versione 407 (decisioni del Dott. Bizzarri del 26/11/2026 ore 12:53 e 12:56): l'aumento si segnala e non blocca;
  // per le fatture con aumento da 200 € l'anno (gravità media o alta) doppia conferma prima di mandare il pagamento
  const [chiediConferma, setChiediConferma] = useState(false); const [notaConferma, setNotaConferma] = useState("");
  useEffect(() => { if (!pag) return; (async () => {
    try { setAumenti(aumentiPerFattura(analisiPrezzi(await caricaDatiPrezzi()))); }
    catch (e) { setAumenti(null); setErroreAumenti("Controllo dei prezzi non letto: i prezzi aumentati non si vedono (" + e.message + ")"); }
    const u = await supabase.auth.getUser(); const id = u.data?.user?.id;
    if (id) { const p = await supabase.from("profili").select("ruolo").eq("id", id).maybeSingle(); setDottore(p.data?.ruolo === "admin"); }
  })(); }, [pag]);
  useEffect(() => { if (!pag) return; (async () => {
    const r = await supabase.from("ci_prezzo_visti").select("*").order("visto_il", { ascending: false });
    if (r.error) setErroreVisti("Conferme già date sui prezzi aumentati non lette: va lanciato il file 2_contabilita_strutture_v374_prezzo_aumentato.sql (" + r.error.message + ")");
    else {
      setErroreVisti("");
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
  // Versione 375: fatture contestate (pagamento bloccato) e in attesa di nota di credito (mail al fornitore prima di pagare)
  const [statiFatture] = useStatiFatture(pag ? sue.map(s => s.fattura_id) : []);
  const scelte = sue.filter(s => spunte[s.scadenza_id] !== undefined);
  // versione 403: acconti o caparre aperti dello stesso fornitore (scelta obbligatoria prima di pagare: è di questa fattura / non c'entra)
  //   e acconti già agganciati alla fattura (causale «DEDOTTO ACCONTO DEL …»)
  const [aperti, setAperti] = useState({}); const [giroAperti, setGiroAperti] = useState(0); const [motiviNc, setMotiviNc] = useState({}); const [erroreAperti, setErroreAperti] = useState("");
  const chiaviScelte = pag ? scelte.map(s => s.scadenza_id).join(",") : "";
  const [leggoAperti, setLeggoAperti] = useState(false);
  useEffect(() => { setAperti({}); if (!chiaviScelte) { setLeggoAperti(false); return; } let vivo = true; setLeggoAperti(true); (async () => {
    const r = {}; let err = "";
    for (const id of chiaviScelte.split(",").map(Number)) { const x = await supabase.rpc("ci_anticipi_aperti_per_fattura", { p_scadenza: id }); if (x.error) err = x.error.message; else r[id] = x.data || []; }
    if (vivo) { setAperti(r); setErroreAperti(err); setLeggoAperti(false); }
  })(); return () => { vivo = false; }; }, [chiaviScelte, giroAperti]);
  const [dedotti, setDedotti] = useState({}); const [erroreDedotti, setErroreDedotti] = useState(""); // scadenza_id → [date degli acconti agganciati]
  useEffect(() => { setDedotti({}); setErroreDedotti(""); if (!pag || !sogg) return; (async () => {
    const a = await supabase.from("ci_v_anticipi").select("pagamento_id, data_pagamento").eq("fornitore_id", sogg).neq("stato", "annullato");
    if (a.error) return setErroreDedotti(a.error.message);
    const ids = (a.data || []).map(x => x.pagamento_id); if (!ids.length) return;
    const b = await supabase.from("ci_abbinamenti_pagamenti").select("pagamento_id, scadenza_id").in("pagamento_id", ids);
    if (b.error) return setErroreDedotti(b.error.message);
    const r = {}; for (const x of b.data || []) { const d = (a.data || []).find(y => y.pagamento_id === x.pagamento_id)?.data_pagamento; if (d) (r[x.scadenza_id] = r[x.scadenza_id] || []).push(d); }
    setDedotti(r);
  })(); }, [sogg, giroAperti]);
  async function nonCentra(s, a) {
    const motivo = String(motiviNc[`${s.scadenza_id}-${a.anticipo_id}`] || "").trim(); if (!motivo) return;
    const r = await supabase.rpc("ci_acconto_non_centra", { p_anticipo: a.anticipo_id, p_scadenza: s.scadenza_id, p_motivo: motivo });
    if (r.error) setErroreAperti(r.error.message); else setGiroAperti(g => g + 1);
  }
  const noteLibere = pag ? tutte.filter(s => Number(s.importo) < 0 && Number(s.residuo) < -0.005) : [];
  const noteScelte = noteLibere.filter(n => nc[n.scadenza_id]).map(n => ({ n, imp: leggiImporto(nc[n.scadenza_id].importo), fattura: Number(nc[n.scadenza_id].fattura) || null }));
  const dedotto = id => Math.round(noteScelte.filter(x => x.fattura === id).reduce((t, x) => t + (x.imp || 0), 0) * 100) / 100;
  const quote = scelte.map(s => ({ s, imp: leggiImporto(spunte[s.scadenza_id]) }));
  // versione 401: quanto si paga davvero per ogni fattura = importo scelto − note di credito dedotte da quella fattura
  const daPagare = q => Math.round(((q.imp || 0) - dedotto(q.s.scadenza_id)) * 100) / 100;
  const totale = Math.round(quote.reduce((t, q) => t + daPagare(q), 0) * 100) / 100;
  const acconti = quote.filter(q => q.imp && q.imp < Number(q.s.residuo) - 0.005);
  const ritenuta = scelte.some(s => Number(s.ritenuta) > 0);
  const vocePropria = acconti.length && !quote.some(q => q.imp && Math.abs(q.imp - Number(q.s.residuo)) < 0.005) ? "Acconto su fattura" : ritenuta ? "Saldo con ritenuta d'acconto" : acconti.length ? "Acconto su fattura" : noteScelte.length ? "Saldo al netto di nota di credito" : "Saldo fattura";
  const voce = v.causale_voce || vocePropria;
  const comp = componiCausale(quote.filter(q => q.imp).map(q => ({ numero: q.s.numero_documento, data: q.s.data_documento, tipo: q.s.tipo_documento, importo: q.imp, resto: Number(q.s.residuo), ritenuta: q.s.ritenuta })), !pag);
  const meno = noteScelte.filter(x => x.imp).map(x => `MENO NC N. ${x.n.numero_documento} DEL ${dataIt(x.n.data_documento)}`).join(" ");
  // versione 403: «SALDO FATTURA N. … DEDOTTO ACCONTO DEL …» quando alla fattura è già agganciato un acconto
  const dedottoAcconto = pag ? [...new Set(scelte.flatMap(s => dedotti[s.scadenza_id] || []))].sort().map(d => `DEDOTTO ACCONTO DEL ${dataIt(d)}`).join(" ") : "";
  const causale = pulisciCausale([comp.testo, dedottoAcconto, meno, v.aggiunta].filter(Boolean).join(" "));
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
  for (const x of noteScelte) {
    if (!x.imp) problemi.push(`scrivere l'importo della nota di credito ${x.n.numero_documento}`);
    else if (x.imp > -Number(x.n.residuo) + 0.005) problemi.push(`la nota di credito ${x.n.numero_documento} ha solo ${euro(-Number(x.n.residuo))} da usare`);
    if (!x.fattura || !scelte.some(s => s.scadenza_id === x.fattura)) problemi.push(`scegliere la fattura da cui si toglie la nota di credito ${x.n.numero_documento} (tra quelle spuntate)`);
  }
  if (quote.some(q => q.imp && daPagare(q) < -0.005)) problemi.push("una nota di credito supera l'importo della sua fattura");
  // versione 401 (secondo ricontrollo): una nota che chiude per intero una delle fatture spuntate non si paga qui
  for (const q of quote) if (q.imp && noteScelte.some(x => x.fattura === q.s.scadenza_id) && daPagare(q) <= 0.005 && totale > 0.005)
    problemi.push(`la nota di credito chiude per intero la fattura ${q.s.numero_documento}: quella si chiude nello «Scadenzario clienti e fornitori»; qui togliere la spunta e pagare le altre`);
  if (noteScelte.length && scelte.length && !(totale > 0.005)) problemi.push("la nota di credito copre tutta la fattura: non c'è niente da pagare (la compensazione si registra nello «Scadenzario clienti e fornitori»)");
  if (noteScelte.length && forza && !motivoForza.trim()) problemi.push("scrivere il motivo per cui non si manda la mail al fornitore");
  for (const s of scelte) { const st = statiFatture[s.fattura_id];
    if (st?.stato === CONTESTATA) problemi.push(`la fattura ${s.numero_documento} è CONTESTATA (${st.motivo}): il pagamento è bloccato finché non viene liberata`);
    // versione 401: si confronta l'importo che si paga davvero (al netto delle note di credito scelte), come fa il database
    const q0 = quote.find(q => q.s === s); const imp = q0 ? daPagare(q0) : 0;
    const mail = Number(st?.ancora_pagabile || 0);
    if (st?.stato === ATTESA_NC && !(mail > 0.005)) problemi.push(`la fattura ${s.numero_documento} è IN ATTESA DI NOTA DI CREDITO: prima di pagare va mandata la mail al fornitore con l'importo («💶 Prepara un pagamento» nel dettaglio della fattura, in Fatture passive o Ricerca Fatture)`);
    // versione 375 (Dottore 22:12 «metti»): l'importo pagato deve essere quello scritto nella mail, né più né meno
    else if (st?.stato === ATTESA_NC && imp && Math.abs(imp - mail) > 0.005) problemi.push(`la fattura ${s.numero_documento} è IN ATTESA DI NOTA DI CREDITO e la mail al fornitore dice ${euro(mail)}, qui si pagano ${euro(imp)}: scrivere ${euro(mail)}, oppure mandare prima la mail di rettifica con ${euro(imp)} («💶 Prepara un pagamento» nel dettaglio della fattura: la mail nuova sostituisce la precedente)`); }
  // versione 403: la parte della fattura coperta da acconti o caparre aperti non si paga (il database la ferma): si paga la differenza,
  // oppure si sceglie prima «è di questa fattura» (aggancio di chi gestisce i conti) o «non c'entra» con il motivo
  if (pag && leggoAperti && scelte.length) problemi.push("attendere la lettura degli acconti aperti del fornitore");
  if (pag) for (const q of quote) { const ap = aperti[q.s.scadenza_id] || []; if (!ap.length || !q.imp) continue;
    const massimo = Math.round((Number(q.s.residuo) - ap.reduce((t, a) => t + Number(a.residuo), 0)) * 100) / 100;
    if (daPagare(q) > massimo + 0.005) problemi.push(`fattura ${q.s.numero_documento}: il fornitore ha ${euro(ap.reduce((t, a) => t + Number(a.residuo), 0))} già dati in acconto o caparra; adesso si possono pagare al massimo ${euro(Math.max(massimo, 0))}, oppure scegliere qui sotto se l'acconto è di questa fattura o non c'entra`); }
  if (pag && erroreAperti) problemi.push("acconti aperti del fornitore non letti: ricaricare la pagina");
  if (pag && erroreDedotti && scelte.length) problemi.push("acconti già agganciati non letti (la causale «DEDOTTO ACCONTO» non si può comporre): ricaricare la pagina");
  if (!v.modalita) problemi.push("scegliere come si " + (pag ? "paga" : "incassa"));
  if (v.modalita === "Altro" && !String(v.modalita_altro || "").trim()) problemi.push("scrivere quale modalità");
  if (!v.conto_id) problemi.push("scegliere con che cosa");
  if (v.modalita === "Carta di debito" && !v.carta_di_debito_id) problemi.push("scegliere la carta di debito");
  if (v.modalita === "Contanti" && totale >= 5000) problemi.push("contanti da 5.000 € in su: vietato (art. 49 D.Lgs. 231/2007)");
  problemi.push(...problemiContanti(v, oggi));
  if (!v.data_disposizione) problemi.push("scrivere la data di disposizione");
  if (bonifico && (comp.troppo || causale.length > 140)) problemi.push("la causale non sta in 140 caratteri: fare più bonifici");
  if (bonifico && !causaleValida(causale)) problemi.push("causale del bonifico non valida");
  if (pag && bonifico) {
    if (!ib) problemi.push("scegliere l'IBAN"); else if (!ibanValido(ib)) problemi.push("IBAN non valido"); else if (!v.iban_confermato) problemi.push("premere «Confermi IBAN»");
    if (ib && ibanFattura.length && !ibanFattura.map(ibanPulito).includes(ib) && !String(v.iban_diverso_motivo || "").trim()) problemi.push("IBAN diverso dalla fattura: scrivere il motivo");
  }
  if (totale > 5000 && !v.soglia_vista) problemi.push("spuntare «Ho visto: sopra 5.000 €»");
  if (erroreStorico && pag) problemi.push("storico delle fatture non letto: riprovare");
  // versione 407: se il controllo dei prezzi non si legge si avvisa e si paga lo stesso (prima: «senza il controllo non si paga»)
  if (pag && aumenti === null && !erroreAumenti && scelte.length) problemi.push("attendere il controllo dei prezzi aumentati");
  // versione 407: fatture scelte con aumento da 200 € l'anno non ancora confermate → doppia conferma al pagamento (non è un blocco)
  const daConfermare = pag && aumenti ? scelte.filter(s => { const f = s.fattura_id && aumenti.get(s.fattura_id); return f && f.conferma !== "bassa" && !visti.has(s.fattura_id); }) : [];   // versione 407, scelta B delle 13:56: solo se costa più della precedente
  // il pagamento come lo riceve il database (versione 401: sezione propria per i professionisti, chi ha i contanti, note di credito)
  const costruisci = () => {
    const p = { sezione: pag && professionisti ? "pagamento_professionisti" : sezione, conto_id: Number(v.conto_id), modalita: v.modalita, modalita_altro: v.modalita_altro || "", carta_di_debito_id: v.carta_di_debito_id || "",
      data_disposizione: v.data_disposizione, importo: totale, causale_gruppo: "Fatture", causale_voce: voce, fornitore_id: pag ? sogg : "", cliente_id: pag ? "" : sogg,
      causale: bonifico || causale ? causale : "", iban: pag && bonifico ? ib : "", iban_confermato: !!v.iban_confermato, iban_diverso_motivo: v.iban_diverso_motivo || "", note: v.note || "",
      scadenze: quote.filter(q => daPagare(q) > 0.005).map(q => ({ scadenza_id: q.s.scadenza_id, importo: daPagare(q) })) };
    if (v.modalita === "Contanti") p.contanti_persona = v.contanti_persona;
    if (pag) p.note_credito = noteScelte.map(x => ({ nota_scadenza_id: x.n.scadenza_id, fattura_scadenza_id: x.fattura, importo: x.imp }));
    if (pag && noteScelte.length && forza) p.forzatura_motivo = motivoForza.trim();
    return p;
  };
  // anteprima della mail: il testo lo scrive il database con una prova che non registra niente (si vede prima di premere «Conferma»)
  const chiaveAnteprima = pag && noteScelte.length && !forza && !problemi.length ? JSON.stringify(costruisci()) : "";
  useEffect(() => { if (!chiaveAnteprima) return; let vivo = true; const t = setTimeout(async () => {
    const r = await supabase.rpc("ci_paga_fatture_401", { p: { ...JSON.parse(chiaveAnteprima), prova: true } });
    if (vivo) setAnteprima(r.error ? { chiave: chiaveAnteprima, testo: "", oggetto: "", errore: r.error.message } : { chiave: chiaveAnteprima, testo: r.data.testo_mail || "", oggetto: r.data.oggetto_mail || "", errore: "" });
  }, 400); return () => { vivo = false; clearTimeout(t); }; }, [chiaveAnteprima]);
  async function invia(confermato = false) {
    if (problemi.length || lavoro) return;
    // versione 407: prima la doppia conferma degli aumenti di prezzo
    if (!confermato && daConfermare.length) { setChiediConferma(true); return; }
    setLavoro(true); setErrore("");
    const p = costruisci();
    const nome = anag.find(a => a.id === sogg)?.nome;
    let data, error;
    if (pag) {
      // versione 401: con una nota di credito, prima la PROVA nel database (se il pagamento sarebbe rifiutato la mail non parte),
      // poi la mail al fornitore con il testo scritto dal database, poi il pagamento legato a quella mail
      if (noteScelte.length && !forza) {
        const pr = await supabase.rpc("ci_paga_fatture_401", { p: { ...p, prova: true } });
        if (pr.error) { setLavoro(false); return setErrore("Il database non accetterebbe questo pagamento: la mail al fornitore NON è partita con questa prova. " + pr.error.message + " — Se poco fa la pagina ha dato un errore di rete, verificare in «In attesa della banca» se il pagamento è già registrato."); }
        const testo = pr.data.testo_mail;
        if (mailFatta && mailFatta.testo === testo && mailFatta.fornitore === sogg) p.comunicazione_id = mailFatta.id; // stessa mail già partita: non se ne manda un'altra
        else {
          // mail con lo stesso testo già partita nelle ultime 2 ore e non ancora usata (pagina ricaricata, rete caduta): si riusa
          const gia = await supabase.rpc("ci_mail_pagamento_nc_riusabile_401", { p_fornitore: sogg, p_testo: testo });
          if (gia.data) { p.comunicazione_id = gia.data; setMailFatta({ testo, id: gia.data, fornitore: sogg }); }
        }
        if (!p.comunicazione_id) {
          try {
            p.comunicazione_id = await mandaMailFornitore({ fornitoreId: sogg, fatturaId: pr.data.documento_id || null, documentoTipo: "Pagamento con nota di credito",
              oggetto: pr.data.oggetto_mail, testo, sezione: "Gestione incassi e pagamenti" });
            setMailFatta({ testo, id: p.comunicazione_id, fornitore: sogg });
          } catch (e) { setLavoro(false); return setErrore(e.message + ". Il pagamento NON è stato registrato."); }
        }
      }
      ({ data, error } = await supabase.rpc("ci_paga_fatture_401", { p }));
    } else ({ data, error } = await supabase.rpc("ci_disponi_401", { p }));
    setLavoro(false);
    if (error) {
      // risposta non arrivata (rete): il database può aver registrato lo stesso; non si dice «niente registrato»
      const rete = !error.code && /fetch|network|Failed|rete|timeout/i.test(String(error.message || ""));
      return setErrore((rete ? "La risposta del database non è arrivata: VERIFICARE in «In attesa della banca» (o nello Scadenzario per i contanti) se il pagamento è registrato prima di riprovare. " + error.message
        : "Il database non l'ha accettato, non è stato registrato niente: " + error.message)
        + (p.comunicazione_id ? " — ATTENZIONE: la mail al fornitore è già partita (Registro delle comunicazioni). Riprovando entro 2 ore con gli stessi importi e la stessa data si usa la stessa mail, senza mandarne un'altra." : ""));
    }
    setMailFatta(null);
    const contanti = data.definitivo === true;
    const conto = base.conti.find(c => c.id === Number(v.conto_id));
    fatto({ titolo: contanti ? `${data.codice_attesa}: ${pag ? "pagamento" : "incasso"} in contanti registrato — definitivo, prima nota n. ${data.numero || "—"}` : `${data.codice_attesa}: ${pag ? "pagamento mandato in pagamento" : "incasso atteso registrato"} — in attesa della banca`,
      testo: contanti ? (pag ? "Il pagamento in contanti è registrato in cassa e la fattura risulta pagata. Conservare la ricevuta del fornitore." : "L'incasso in contanti è registrato in cassa e la fattura risulta incassata. Consegnare la ricevuta al cliente.")
        : pag ? `Adesso, oggi stesso, disporre ${v.modalita === "Bonifico istantaneo" ? "il bonifico istantaneo" : v.modalita.toLowerCase()} in banca con questi dati (Word o pulsanti «Copia»). Poi caricare la distinta qui sotto: il pagamento risulta «pagato». Quando l'estratto è caricato, confermarlo in «Conferma dei movimenti»: prenderà il numero di prima nota. Se non parte, annullarlo in «In attesa della banca».`
        : `Quando la banca lo accredita e l'estratto è caricato, confermarlo in «Conferma dei movimenti».`,
      copie: [["Beneficiario", pag ? nome : ""], ["IBAN", pag && bonifico ? ibanBello(ib) : ""], ["Importo", importoIt(totale)], ["Causale", causale], ["Data di esecuzione", dataIt(v.data_disposizione)]].filter(x => x[1]),
      word: pag && !contanti ? { codice: data.codice_attesa, beneficiario: nome, iban: bonifico ? ibanBello(ib) : "", importo: "€ " + importoIt(totale), causale, data: dataIt(v.data_disposizione),
        conto: conto?.nome || "", modalita: v.modalita, fatture: quote.filter(q => q.imp).map(q => `${q.s.numero_documento} del ${dataIt(q.s.data_documento)}: € ${importoIt(daPagare(q))}`),
        note_credito: noteScelte.map(x => `${x.n.numero_documento} del ${dataIt(x.n.data_documento)}: € ${importoIt(x.imp)}`) } : null,
      movimento: pag && !contanti && bonifico ? { id: data.movimento_id, data: v.data_disposizione, conto: conto?.nome_nei_movimenti || conto?.nome || "", distinta_id: null } : null });
  }
  // versione 407: «Sì, pago lo stesso» registra la conferma di ogni fattura (chi e quando, con il dettaglio) e poi manda il pagamento
  async function confermaEPaga() {
    if (lavoro || problemi.length) return;   // versione 407: si conferma solo se il pagamento si può mandare
    setLavoro(true); setErrore("");
    for (const s of daConfermare) {
      const f = aumenti.get(s.fattura_id);
      const r = await supabase.rpc("ci_prezzo_visto", { p_fattura: s.fattura_id, p_gravita: f.conferma, p_dettaglio: `Fattura ${s.numero_documento} del ${dataIt(s.data_documento)}: ${testoAumenti(f)}`, p_nota: notaConferma });
      if (r.error) { setLavoro(false); setGiroVisti(g => g + 1); return setErrore("Conferma dell'aumento non registrata, il pagamento NON è partito: " + r.error.message); }
    }
    setLavoro(false); setChiediConferma(false); setNotaConferma(""); setGiroVisti(g => g + 1);
    await invia(true);
  }
  const daLeggere = pag && dottore ? [...visti.values()].filter(x => !x.letto_dal_dottore_il && (x.gravita === "alta" || x.gravita === "media")) : [];
  return <div>
    {daLeggere.length > 0 && <div style={{ ...scheda, border: `2px solid ${C.red}`, background: `${C.red}0D` }}>
      <div style={{ fontWeight: 800, color: C.red }}>⚠️ Prezzi aumentati confermati al pagamento (da 200 € l'anno): {daLeggere.length}</div>
      {daLeggere.map(x => <div key={x.id} style={{ fontSize: 12.5, borderTop: `1px solid ${C.border}`, padding: "4px 0", display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>{x.dettaglio}<div style={{ color: C.muted }}>Visto da {x.nome} il {dataIt(String(x.visto_il).slice(0, 10))}{x.nota ? ` — nota: ${x.nota}` : ""}</div></div>
        <button style={{ ...btn(false), height: 26 }} onClick={() => segnaLetto(x.id)}>Letto</button></div>)}
    </div>}
    {pag && <div style={{ ...scheda, background: "#F2F7EE", border: `1px solid ${C.green}` }}>
      <div style={{ fontWeight: 800, color: C.primary, marginBottom: 4 }}>{professionisti ? "Come si paga un professionista (fattura con ritenuta d'acconto)" : "Come si paga una fattura"}</div>
      <ol style={{ margin: "0 0 0 18px", padding: 0, fontSize: 13, lineHeight: 1.5 }}>
        <li>Salva il pagamento e scarica il Word: ci sono IBAN, causale e importo.</li>
        <li>Compila il bonifico nell'home banking copiando i dati dal Word.</li>
        <li>Quando la banca ha eseguito il bonifico, scarica la distinta e salvala, senza cambiarle nome, in BANCHE\ESTRATTI CONTO E DISTINTE DA SMISTARE.</li>
        <li>Torna qui e premi «Carica la distinta»: il pagamento diventa «pagato».</li>
      </ol>
      {professionisti && <div style={{ fontSize: 12.5, marginTop: 4 }}>Si paga solo il <b>netto</b> scritto nella fattura: la ritenuta d'acconto la versa la società con l'F24 (codice 1040) entro il 16 del mese dopo il pagamento; la vedi in «Ritenute d'acconto».</div>}
      {!professionisti && <div style={{ fontSize: 12.5, marginTop: 4, color: C.muted }}>Le fatture con ritenuta d'acconto (professionisti) si pagano dal pulsante «Professionisti con ritenuta».</div>}
    </div>}
    {!sogg && <div style={scheda}>
      <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>{pag ? (professionisti ? "Quale professionista si paga?" : "Quale fornitore si paga?") : "Quale cliente paga?"}</div>
      <input style={{ ...input, width: "100%", maxWidth: 520 }} placeholder="Cerca: nome anche parziale, partita IVA, numero della fattura o importo" value={cerca} onChange={e => setCerca(e.target.value)} />
      {!pag && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>Gli incassi con bonifico di solito non si registrano qui: arrivano con l'estratto e si confermano in «Conferma dei movimenti», dove il programma propone la fattura. Qui si registra un incasso atteso (assegno ricevuto da versare, contanti, bonifico annunciato).</div>}
      <table style={{ width: "100%", marginTop: 8, fontSize: 12.5, background: "#fff" }}><thead><tr style={{ background: C.primary, color: "#fff" }}>
        {[pag ? "Fornitore" : "Cliente", "Partita IVA", "Fatture aperte", "Resto", "Di cui scaduto", "In pagamento", ""].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left" }}>{h}</th>)}</tr></thead>
        <tbody>{soggetti.slice(0, 60).map(x => <tr key={x.id} style={{ borderBottom: `1px solid ${C.border}` }}>
          <td style={{ padding: "5px 8px", fontWeight: 700 }}>{x.a.nome}</td><td style={{ padding: "5px 8px" }}>{x.a.partita_iva || "—"}</td>
          <td style={{ padding: "5px 8px" }}>{x.n}</td><td style={{ padding: "5px 8px", textAlign: "right" }}>{euro(x.resto)}</td>
          <td style={{ padding: "5px 8px", textAlign: "right", color: x.scadute ? C.red : C.muted }}>{x.scadute ? euro(x.scadute) : "—"}</td>
          <td style={{ padding: "5px 8px", color: C.blue }}>{x.attesa ? `${x.attesa} fatture` : ""}</td>
          <td style={{ padding: "5px 8px" }}><button style={btn(true)} onClick={() => { setSogg(x.id); setSpunte({}); azzeraNote(); }}>Scegli</button></td></tr>)}</tbody></table>
      {soggetti.length > 60 && <div style={{ fontSize: 12, color: C.muted }}>Mostrati i primi 60: restringere la ricerca.</div>}
      {!soggetti.length && <div style={{ color: C.muted, marginTop: 6 }}>Nessuna fattura aperta trovata. Per un pagamento senza fattura nel programma usare «{pag ? "Altri pagamenti" : "Altri incassi"}» {pag ? "(per un pagamento su proforma, preventivo o offerta: «Anticipo su fattura da ricevere»)" : ""}.</div>}
    </div>}
    {sogg && <div style={scheda}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 800, color: C.primary, fontSize: 16 }}>{anag.find(a => a.id === sogg)?.nome} <span style={{ fontSize: 12.5, color: C.muted }}>{anag.find(a => a.id === sogg)?.partita_iva}</span></div>
        <button style={btn(false)} onClick={() => { setSogg(null); setSpunte({}); azzeraNote(); }}>← Cambia {lato}</button>
      </div>
      {erroreStorico && <div style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>⚠️ {erroreStorico}</div>}
      {pag && erroreAumenti && <div style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>⚠️ {erroreAumenti}</div>}
      {pag && erroreVisti && <div style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>⚠️ {erroreVisti}</div>}
      {cambi.length > 0 && pag && <div style={{ color: C.red, fontSize: 12.5, fontWeight: 700, margin: "6px 0" }}>Attenzione: l'IBAN di questo fornitore è cambiato nelle fatture ({cambi.map(s => `dalla fattura ${s.numero_documento} del ${dataIt(s.data_documento)}: ${ibanBello(s.iban)}`).join("; ")}). Prima di pagare con il nuovo IBAN serve la conferma per telefono.</div>}
      <div style={{ fontSize: 12.5, color: C.muted, margin: "6px 0" }}>Fatture da {pag ? "pagare" : "incassare"} in ordine di scadenza (scadute in rosso). Spuntare quelle che si {pag ? "pagano" : "incassano"} con lo stesso movimento; l'importo si può ridurre per un acconto (una sola fattura in acconto).</div>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", fontSize: 12.5, background: "#fff" }}><thead><tr style={{ background: C.primary, color: "#fff" }}>
        {["", "Numero", "Data", "Scadenza", "Totale", pag ? "Già pagato" : "Già incassato", "Resto", pag ? "Da pagare ora" : "Da incassare ora", "Modalità nella fattura", "IBAN nella fattura", "Stato"].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
        <tbody>{sue.map(s => { const inPag = Number(s.in_attesa_della_banca) > 0 && Number(s.residuo) <= 0.005; const scad = s.data_scadenza && s.data_scadenza < oggi && !inPag; const sp = spunte[s.scadenza_id] !== undefined;
          return [<tr key={s.scadenza_id} style={{ borderBottom: `1px solid ${C.border}`, background: inPag ? "#EEF3F8" : sp ? "#F2F7EE" : "#fff", color: inPag ? C.muted : C.text }}>
            <td style={{ padding: "5px 8px" }}>{inPag ? "—" : <input type="checkbox" checked={sp} onChange={e => setSpunte(o => { const n = { ...o }; if (e.target.checked) n[s.scadenza_id] = importoIt(s.residuo); else delete n[s.scadenza_id]; return n; })} />}</td>
            <td style={{ padding: "5px 8px", fontWeight: 700 }}>{pag && statiFatture[s.fattura_id] && <div><EtichettaStatoFattura stato={statiFatture[s.fattura_id]} piccola /></div>}{s.numero_documento}{pag && statiFatture[s.fattura_id] && <div style={{ fontSize: 10.5, color: C.red }}>{statiFatture[s.fattura_id].motivo}</div>}</td><td style={{ padding: "5px 8px" }}>{dataIt(s.data_documento)}</td>
            <td style={{ padding: "5px 8px", color: scad ? C.red : C.text, fontWeight: scad ? 700 : 400 }}>{dataIt(s.data_scadenza)}{scad ? ` (${Math.round((Date.parse(oggi) - Date.parse(s.data_scadenza)) / 86400000)} giorni)` : ""}</td>
            <td style={{ padding: "5px 8px", textAlign: "right" }}>{euro(s.importo)}</td><td style={{ padding: "5px 8px", textAlign: "right" }}>{euro(s.pagato)}</td>
            <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>{euro(s.residuo)}</td>
            <td style={{ padding: "5px 8px" }}>{sp ? <input style={{ ...input, width: 110, borderColor: !leggiImporto(spunte[s.scadenza_id]) || leggiImporto(spunte[s.scadenza_id]) > Number(s.residuo) + 0.005 ? C.red : C.border }} value={spunte[s.scadenza_id]} onChange={e => setSpunte(o => ({ ...o, [s.scadenza_id]: e.target.value }))} /> : ""}</td>
            <td style={{ padding: "5px 8px" }}>{NOME_MP[s.modalita_pagamento] || s.modalita_pagamento || "—"}</td>
            <td style={{ padding: "5px 8px", fontSize: 11.5 }}>{s.iban ? ibanBello(s.iban) : "—"}</td>
            <td style={{ padding: "5px 8px", color: inPag ? C.blue : scad ? C.red : C.text }}>{s.stato}
              {pag && aumenti && s.fattura_id && aumenti.get(s.fattura_id) && (() => { const f = aumenti.get(s.fattura_id); const col = f.gravita === "alta" ? C.red : f.gravita === "media" ? "#D9730D" : C.green; const vi = visti.get(s.fattura_id);
                return <div><button onClick={() => setApertoAumento(apertoAumento === s.scadenza_id ? null : s.scadenza_id)} style={{ border: `1px solid ${col}`, background: `${col}18`, color: col, fontWeight: 800, borderRadius: 6, padding: "1px 6px", cursor: "pointer", fontSize: 11.5, whiteSpace: "nowrap" }}>
                  ▲ Prezzo aumentato · {NOME_GRAVITA[f.gravita]}</button>{vi ? <div style={{ fontSize: 11, color: C.green }}>✔ Confermato</div> : f.conferma !== "bassa" ? <div style={{ fontSize: 11, color: col, fontWeight: 700 }}>doppia conferma al pagamento</div> : f.gravita !== "bassa" ? <div style={{ fontSize: 11, color: col }}>sopra la media dell'anno, prezzo non cambiato dalla fattura precedente: solo avviso</div> : null}</div>; })()}</td></tr>,
            pag && aumenti && apertoAumento === s.scadenza_id && aumenti.get(s.fattura_id) && <tr key={"au" + s.scadenza_id}><td colSpan={11} style={{ padding: 8, background: "#FFF8F0", borderBottom: `1px solid ${C.border}` }}>
              <DettaglioAumento f={aumenti.get(s.fattura_id)} vi={visti.get(s.fattura_id)} nomi={base.nomi} nota={notaVisto} setNota={setNotaVisto} lavoro={lavoro} visto={() => segnaVisto(s, aumenti.get(s.fattura_id))} />
            </td></tr>]; })}</tbody></table></div>
      {!sue.length && <div style={{ color: C.muted }}>Nessuna fattura aperta.</div>}
      {noteLibere.length > 0 && <div style={{ marginTop: 10, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
        <div style={{ fontWeight: 800, color: C.primary, fontSize: 13 }}>Note di credito di questo fornitore ancora da usare</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 4 }}>Spuntarla per pagare la fattura al netto della nota di credito: si sceglie da quale fattura si toglie. Prima di registrare il pagamento parte la mail al fornitore.</div>
        <table style={{ fontSize: 12.5, background: "#fff" }}><thead><tr style={{ background: "#F4F4F0" }}>{["", "Nota di credito", "Data", "Da usare", "Importo da togliere", "Dalla fattura"].map(h => <th key={h} style={{ padding: "4px 8px", textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>{noteLibere.map(n => { const x = nc[n.scadenza_id];
            return <tr key={n.scadenza_id} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: "4px 8px" }}><input type="checkbox" checked={!!x} onChange={e => setNc(o => { const m = { ...o }; if (e.target.checked) m[n.scadenza_id] = { importo: importoIt(-Number(n.residuo)), fattura: scelte[0]?.scadenza_id || "" }; else delete m[n.scadenza_id]; return m; })} /></td>
              <td style={{ padding: "4px 8px", fontWeight: 700 }}>{n.numero_documento}</td><td style={{ padding: "4px 8px" }}>{dataIt(n.data_documento)}</td>
              <td style={{ padding: "4px 8px", textAlign: "right" }}>{euro(-Number(n.residuo))}</td>
              <td style={{ padding: "4px 8px" }}>{x ? <input style={{ ...input, width: 100 }} value={x.importo} onChange={e => setNc(o => ({ ...o, [n.scadenza_id]: { ...o[n.scadenza_id], importo: e.target.value } }))} /> : ""}</td>
              <td style={{ padding: "4px 8px" }}>{x ? <select style={{ ...input }} value={x.fattura} onChange={e => setNc(o => ({ ...o, [n.scadenza_id]: { ...o[n.scadenza_id], fattura: e.target.value } }))}>
                <option value="">— scegliere tra le fatture spuntate —</option>{scelte.map(f => <option key={f.scadenza_id} value={f.scadenza_id}>{f.numero_documento} del {dataIt(f.data_documento)}</option>)}</select> : ""}</td></tr>; })}</tbody></table>
      </div>}
    </div>}
    {sogg && scelte.length > 0 && <div style={{ ...scheda, border: `2px solid ${C.primary}` }}>
      <div style={{ fontWeight: 800, color: C.primary, fontSize: 15, marginBottom: 8 }}>{pag ? "Il pagamento" : "L'incasso"}: {scelte.length === 1 ? "1 fattura" : `${scelte.length} fatture`}, totale {euro(totale)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        <ComeEConCheCosa base={base} verso={verso} v={v} cambia={cambia} importo={totale} />
        {v.modalita === "Contanti" && <SceltaContanti verso={verso} v={v} cambia={cambia} importo={totale} />}
        <label style={L}>3. {v.modalita === "Contanti" ? "Data in cui si paga in contanti (non nel futuro)" : "Data di addebito in banca (proposta: la scadenza)"}<input type="date" style={sel(!v.data_disposizione || (v.modalita === "Contanti" && v.data_disposizione > oggi))} value={v.data_disposizione} onChange={e => cambia("data_disposizione", e.target.value)} />
          {v.data_disposizione && v.data_disposizione !== oggi && v.modalita !== "Contanti" && <span style={{ color: C.yellow, fontWeight: 700 }}>Non è oggi: disporre in banca lo stesso giorno in cui si registra qui.</span>}</label>
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
      {pag && noteScelte.length > 0 && <div style={{ marginTop: 10, border: `2px solid ${C.blue}`, borderRadius: 8, padding: 10 }}>
        <div style={{ fontWeight: 800, color: C.blue }}>Mail al fornitore (parte da podereverdeapp@gmail.com quando premi «Conferma»; resta nel Registro delle comunicazioni)</div>
        {forza ? <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>Mail non mandata: si registra con il motivo.</div>
          : !chiaveAnteprima ? <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>Il testo compare quando il pagamento è completo (sotto: «Per confermare»).</div>
          : anteprima.chiave !== chiaveAnteprima ? <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>Preparo il testo…</div>
          : anteprima.errore ? <div style={{ fontSize: 12.5, color: C.red, fontWeight: 700, marginTop: 4 }}>Il database non accetterebbe questo pagamento: {anteprima.errore}</div>
          : <><div style={{ fontSize: 12.5, color: C.muted }}>Oggetto: {anteprima.oggetto}</div>
            <div style={{ fontSize: 13, whiteSpace: "pre-wrap", background: "#F4F4F0", borderRadius: 6, padding: 8, marginTop: 4 }}>{anteprima.testo}</div></>}
        <div style={{ fontSize: 12.5, marginTop: 4 }}>Il testo lo scrive il programma (fatture, importi, acconto o saldo, note di credito). Premendo «Conferma» il programma controlla prima che il pagamento sia accettato, poi manda la mail, poi registra il pagamento. Senza la mail il pagamento non si registra.</div>
        {puoForzare && <label style={{ display: "block", marginTop: 6, fontSize: 12.5 }}><input type="checkbox" checked={forza} onChange={e => setForza(e.target.checked)} /> Non mando la mail (autorizzazione «Può forzare il pagamento senza mail»): scrivo il motivo
          {forza && <input style={{ ...input, width: "100%", marginTop: 4, borderColor: motivoForza.trim() ? C.border : C.red }} placeholder="motivo (obbligatorio)" value={motivoForza} onChange={e => setMotivoForza(e.target.value)} />}</label>}
      </div>}
      {pag && scelte.some(s => (aperti[s.scadenza_id] || []).length) && <div style={{ marginTop: 10, padding: 10, border: `2px solid ${C.red}`, borderRadius: 8 }}>
        <div style={{ fontWeight: 800, color: C.red }}>Il fornitore ha soldi già dati in acconto o caparra, non ancora scalati</div>
        {scelte.filter(s => (aperti[s.scadenza_id] || []).length).map(s => (aperti[s.scadenza_id] || []).map(a => { const k = `${s.scadenza_id}-${a.anticipo_id}`; return <div key={k} style={{ borderTop: `1px solid ${C.border}`, padding: "6px 0", fontSize: 13 }}>
          Fattura <b>{s.numero_documento}</b>: {a.tipo === "acconto" ? "acconto" : a.tipo === "caparra" ? "caparra confirmatoria" : "caparra penitenziale"} di <b>{euro(a.importo)}</b> pagato il {dataIt(a.data)}{a.documento ? ` (${a.documento})` : ""}{a.da_app ? " — registrato dall'app" : ""}; da scalare {euro(a.residuo)}.
          <div style={{ marginTop: 4 }}><b>È di questa fattura?</b> Adesso si paga solo la differenza; l'acconto lo aggancia chi gestisce i conti in «Anticipi in attesa di fattura»{a.confermato ? "" : " (dopo che la banca ha confermato il suo pagamento)"} e la causale dei pagamenti dopo dirà «DEDOTTO ACCONTO».</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}><b>Non c'entra?</b>
            <input style={{ ...input, minWidth: 320 }} placeholder="Perché non c'entra (resta scritto)" value={motiviNc[k] || ""} onChange={e => setMotiviNc(o => ({ ...o, [k]: e.target.value }))} />
            <button style={btn(false)} disabled={!String(motiviNc[k] || "").trim()} onClick={() => nonCentra(s, a)}>Non c'entra con questa fattura</button></div>
        </div>; }))}
        {erroreAperti && <div style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>⚠️ {erroreAperti}</div>}
      </div>}
      {problemi.length > 0 && <div style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>Per confermare: {problemi.join("; ")}.</div>}
      {pag && erroreAumenti && scelte.length > 0 && <div style={{ color: "#D9730D", fontWeight: 700, fontSize: 12.5, marginTop: 6 }}>⚠️ Il controllo dei prezzi non si è letto: gli eventuali aumenti di queste fatture non si vedono. Si può pagare lo stesso; ricaricando la pagina si riprova il controllo.</div>}
      {/* versione 407: doppia conferma degli aumenti di prezzo, dentro la pagina */}
      {chiediConferma && daConfermare.length > 0 && <div style={{ ...scheda, border: `2px solid ${C.red}`, background: "#FFF8F0", marginTop: 10 }}>
        <div style={{ fontWeight: 800, color: C.red, marginBottom: 4 }}>⚠️ Prezzo aumentato: confermi il pagamento?</div>
        {daConfermare.map(s => { const f = aumenti.get(s.fattura_id); return <div key={s.scadenza_id} style={{ fontSize: 12.5, borderTop: `1px solid ${C.border}`, padding: "4px 0" }}>
          <b>Fattura {s.numero_documento} del {dataIt(s.data_documento)}</b> · {NOME_GRAVITA[f.gravita]}<div>{testoAumenti(f)}</div></div>; })}
        <div style={{ fontSize: 12, color: C.muted, margin: "4px 0" }}>Se l'aumento non era concordato o il prezzo sembra sbagliato, «Torna indietro» e chiedere al fornitore. La conferma resta registrata con il nome e l'ora, e il Dott. Bizzarri la vede.</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input style={{ ...input, flex: 1, minWidth: 220 }} placeholder="Nota (facoltativa): per esempio «prezzo concordato» o «errore in fattura, chiesta nota di credito»" value={notaConferma} onChange={e => setNotaConferma(e.target.value)} />
          <button style={btn(true, C.red)} disabled={lavoro || !!problemi.length} onClick={confermaEPaga}>Sì, pago lo stesso</button>
          <button style={btn(false)} disabled={lavoro} onClick={() => setChiediConferma(false)}>Torna indietro</button></div>
      </div>}
      {errore && <div style={{ color: C.red, fontWeight: 700, marginTop: 8 }}>⚠️ {errore}</div>}
      <div style={{ marginTop: 10 }}><button style={btn(true)} disabled={!!problemi.length || lavoro} onClick={() => invia()}>{lavoro ? "Registro…" : pag ? "Conferma e manda in pagamento" : "Conferma e registra l'incasso atteso"}</button></div>
    </div>}
  </div>;
}

// ---------------- Versione 374: dettaglio del prezzo aumentato di una fattura, con «Visto» ----------------
function DettaglioAumento({ f, vi, nomi, nota, setNota, lavoro, visto }) {
  return <div style={{ fontSize: 12.5 }}>
    <b>Prezzi aumentati in questa fattura</b> <span style={{ color: C.muted }}>(versione 407: il prezzo della fattura si confronta con la media pesata dei 12 mesi prima della data di questa fattura e con la fattura precedente dello stesso fornitore; «in un anno» = il più grande dei due aumenti per la quantità di un anno. Se la fattura costa più della precedente per almeno 200 € l'anno serve la doppia conferma al pagamento; l'aumento sulla sola media è un avviso. Il «Controllo Prezzi di Acquisto» guarda invece gli ultimi 12 mesi da oggi, quindi i numeri possono essere diversi)</span>
    <table style={{ borderCollapse: "collapse", marginTop: 4, background: "#fff" }}><thead><tr style={{ background: "#F4F4F0" }}>
      {["Prodotto", "Media dei 12 mesi prima di questa fattura", "Fattura precedente", "Adesso", "In un anno", "Gravità"].map(h => <th key={h} style={{ padding: "3px 8px", textAlign: "left" }}>{h}</th>)}</tr></thead>
      <tbody>{f.righe.map((r, i) => <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
        <td style={{ padding: "3px 8px", fontWeight: 700 }}>{r.famiglia}</td>
        <td style={{ padding: "3px 8px" }}>{r.media !== null ? <>{itPrezzo(r.media, r.decimali)} {r.unita} <b style={{ color: r.variazioneMedia > 0 ? C.red : C.green }}>{r.variazioneMedia > 0 ? "+" : ""}{itPrezzo(r.variazioneMedia, 1)}%</b><div style={{ color: C.muted, fontSize: 11 }}>{r.fattureMedia} fatture{r.altriFornitoriMedia.length ? `, anche di ${r.altriFornitoriMedia.join(", ")}` : ""}</div></> : "—"}</td>
        <td style={{ padding: "3px 8px" }}>{r.prima !== null ? <>{itPrezzo(r.prima, r.decimali)} {r.unita} <b style={{ color: r.variazione > 0 ? C.red : C.green }}>{r.variazione > 0 ? "+" : ""}{itPrezzo(r.variazione, 1)}%</b><div style={{ color: C.muted, fontSize: 11 }}>fattura {r.numeroPrima} del {dataPrezzo(r.dataPrima)}{r.cambioFornitore ? ` (${r.fornitorePrima})` : ""}</div></> : "—"}</td>
        <td style={{ padding: "3px 8px" }}>{itPrezzo(r.ora, r.decimali)} {r.unita}</td>
        <td style={{ padding: "3px 8px", fontWeight: 700 }}>{itPrezzo(r.impatto, 0)} €</td>
        <td style={{ padding: "3px 8px", color: r.gravita === "alta" ? C.red : r.gravita === "media" ? "#D9730D" : C.green, fontWeight: 700 }}>{NOME_GRAVITA[r.gravita]}</td></tr>)}</tbody></table>
    <div style={{ color: C.muted, marginTop: 4 }}>Il grafico di ogni prodotto è in «Controllo Prezzi di Acquisto» → «Attenzione Variazione Prezzi». Se l'aumento non era concordato, prima di pagare chiedere al fornitore.</div>
    {vi ? <div style={{ color: C.green, fontWeight: 700, marginTop: 4 }}>✔ Visto da {vi.nome} il {dataIt(String(vi.visto_il).slice(0, 10))}{vi.nota ? ` — nota: ${vi.nota}` : ""}</div>
      : <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        <input style={{ ...input, flex: 1, minWidth: 220 }} placeholder="Nota (facoltativa): per esempio «aumento concordato al telefono»" value={nota} onChange={e => setNota(e.target.value)} />
        <button style={btn(true, f.gravita === "alta" ? C.red : undefined)} disabled={lavoro} onClick={visto}>Visto{f.gravita !== "bassa" ? " (vale come conferma, avvisa il Dott. Bizzarri)" : ""}</button></div>}
  </div>;
}

// ---------------- Versione 370: Anticipo su fattura da ricevere ----------------
// Pagamento prima della fattura (proforma, preventivo, offerta): nessuna fattura da spuntare, il documento è obbligatorio.
// Nasce in attesa della banca come gli altri pagamenti; il database crea l'anticipo, che resta in «Anticipi in attesa di fattura»
// finché la fattura del fornitore arriva e chi gestisce i conti la aggancia e chiude.
// Versione 403: fornitore nuovo dal modulo (ragione sociale, partita IVA o codice fiscale, contatti; IBAN nel pagamento);
// PDF del documento obbligatorio; totale del documento e «già pagato» sullo stesso documento; assegno da 1.000 € solo non trasferibile;
// contanti sullo stesso documento sotto 5.000 € in tutto; doppione con l'app o con l'ufficio solo con il motivo.
// Tutte le regole sono nel database (ci_disponi_anticipo): la pagina le mostra prima.
const TIPI_DOC = [["proforma", "Proforma"], ["preventivo", "Preventivo"], ["offerta", "Offerta"], ["ordine", "Ordine"], ["contratto", "Contratto"], ["altro", "Altro"]];
const FORN_VUOTO = { nome: "", partita_iva: "", codice_fiscale: "", nazione: "IT", email: "", pec: "", telefono: "", indirizzo: "", citta: "", provincia: "", cap: "", codice_destinatario: "" };
function FornitoreNuovo({ chiudi, creato }) {
  const [f, setF] = useState({ ...FORN_VUOTO }); const [lavoro, setLavoro] = useState(false); const [errore, setErrore] = useState("");
  const c = (k, x) => setF(o => ({ ...o, [k]: x }));
  const mancano = [];
  if (f.nome.trim().length < 2) mancano.push("ragione sociale esatta, come sul documento");
  if (!f.partita_iva.trim() && !f.codice_fiscale.trim()) mancano.push("partita IVA oppure codice fiscale");
  if (!f.email.trim() && !f.pec.trim() && !f.telefono.trim()) mancano.push("almeno un contatto: mail, PEC o telefono");
  if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) mancano.push("mail non valida");
  if (f.pec.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.pec.trim())) mancano.push("PEC non valida");
  async function salva() {
    if (mancano.length || lavoro) return;
    setLavoro(true); setErrore("");
    const { data, error } = await supabase.rpc("ci_fornitore_nuovo", { p: f });
    setLavoro(false);
    if (error) return setErrore("Il database non l'ha accettato, non è stato registrato niente: " + error.message);
    creato({ id: data.id, nome: data.nome, partita_iva: f.partita_iva, esisteva: data.esisteva });
  }
  const campo = (k, n, rosso) => <label style={L}>{n}<input style={sel(rosso)} value={f[k]} onChange={e => c(k, e.target.value)} /></label>;
  return <div style={{ ...scheda, border: `2px solid ${C.primary}` }}>
    <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>Fornitore nuovo</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
      {campo("nome", "Ragione sociale (esatta, come sul preventivo)", f.nome.trim().length < 2)}
      {campo("partita_iva", "Partita IVA", !f.partita_iva.trim() && !f.codice_fiscale.trim())}
      {campo("codice_fiscale", "Codice fiscale (se non ha partita IVA)", false)}
      <label style={L}>Nazione<input style={sel(false)} value={f.nazione} maxLength={2} onChange={e => c("nazione", e.target.value.toUpperCase())} /></label>
      {campo("email", "Mail", false)}{campo("pec", "PEC", false)}{campo("telefono", "Telefono", false)}
      {campo("indirizzo", "Indirizzo", false)}{campo("citta", "Città", false)}{campo("provincia", "Provincia", false)}{campo("cap", "CAP", false)}
      {campo("codice_destinatario", "Codice destinatario (fattura elettronica)", false)}
    </div>
    <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>L'IBAN per il bonifico si scrive nel pagamento, qui sotto. Se la partita IVA è già nell'anagrafica, il programma usa il fornitore che c'è (niente doppioni).</div>
    {mancano.length > 0 && <div style={{ color: C.red, fontSize: 12.5, marginTop: 6 }}>Per salvare: {mancano.join("; ")}.</div>}
    {errore && <div style={{ color: C.red, fontWeight: 700, marginTop: 6 }}>⚠️ {errore}</div>}
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <button style={btn(true)} disabled={!!mancano.length || lavoro} onClick={salva}>{lavoro ? "Salvo…" : "Salva il fornitore e continua"}</button>
      <button style={btn(false)} onClick={chiudi}>Annulla</button></div>
  </div>;
}
function SezioneAnticipo({ base, fatto, oggi }) {
  const [cerca, setCerca] = useState(""); const [sogg, setSogg] = useState(null); const [tutte, setTutte] = useState([]); const [erroreStorico, setErroreStorico] = useState("");
  const [nuovi, setNuovi] = useState([]); const [apriNuovo, setApriNuovo] = useState(false); const [avvisoNuovo, setAvvisoNuovo] = useState("");
  const fornitori = useMemo(() => [...base.fornitori, ...nuovi.filter(n => !base.fornitori.some(a => a.id === n.id))], [base, nuovi]);
  const [v, setV] = useState({ voce: ANTICIPO, consegna_prevista: "", importo: "", tipo: "preventivo", numero: "", data_documento: "", totale: "", modalita: "", conto_id: "", data_disposizione: oggi, aggiunta: "",
    iban_scelta: "", iban_scritto: "", iban_confermato: false, iban_diverso_motivo: "", note: "", soglia_vista: false, contanti_persona: "", non_trasferibile: false, doppione: "" });
  const [pdf, setPdf] = useState(null); // { percorso, nome }
  const [affare, setAffare] = useState(null); const [chiedeDoppione, setChiedeDoppione] = useState("");
  const [lavoro, setLavoro] = useState(false); const [errore, setErrore] = useState("");
  const cambia = (k, x) => setV(o => ({ ...o, [k]: x }));
  const trovati = useMemo(() => {
    const q = cerca.trim().toLowerCase().replace(/[.\s]/g, "");
    if (q.length < 2) return [];
    return fornitori.filter(a => String(a.nome || "").toLowerCase().replace(/[.\s]/g, "").includes(q) || String(a.partita_iva || "").includes(q))
      .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""))).slice(0, 30);
  }, [cerca, fornitori]);
  useEffect(() => { if (!sogg) return; (async () => {
    const r = await fetchAllPages((a, b) => supabase.from("ci_v_scadenzario").select("scadenza_id, iban, data_documento, numero_documento").eq("fornitore_id", sogg).order("data_documento").range(a, b));
    if (r.error) { setErroreStorico("Storico delle fatture non letto: gli IBAN già usati non si vedono. (" + r.error.message + ")"); setTutte([]); return; }
    setErroreStorico(""); setTutte(r.data || []);
  })(); }, [sogg]);
  // già pagato sullo stesso documento (stesso fornitore, stesso numero: «PREV 7» = «Prev. n. 07»)
  useEffect(() => { setAffare(null); if (!sogg || !v.numero.trim()) return; let vivo = true; const t = setTimeout(async () => {
    const r = await supabase.rpc("ci_affare_pagato", { p_fornitore: sogg, p_doc_tipo: v.tipo || null, p_numero: v.numero.trim(), p_data: v.data_documento || null });
    if (vivo) setAffare(r.error ? { errore: r.error.message } : (r.data || [])[0] || null);
  }, 400); return () => { vivo = false; clearTimeout(t); }; }, [sogg, v.numero, v.tipo, v.data_documento]);
  async function caricaPdf(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return setErrore(`«${file.name}» non è un PDF.`);
    if (file.size > 10 * 1024 * 1024) return setErrore("Il PDF supera 10 MB.");
    setErrore(""); setLavoro(true);
    try {
      const percorso = `nuovi/${await md5File(file)}.pdf`;
      const up = await supabase.storage.from("anticipi").upload(percorso, file, { upsert: false, contentType: "application/pdf" });
      if (up.error && !/exist|duplicate|409/i.test(up.error.message || "")) throw new Error(up.error.message);
      setPdf({ percorso, nome: file.name });
    } catch (e) { setErrore("PDF non caricato: " + e.message); }
    setLavoro(false);
  }
  const imp = leggiImporto(v.importo); const tot = leggiImporto(v.totale);
  const bonifico = ["Bonifico", "Bonifico istantaneo"].includes(v.modalita);
  const assegno = ["Assegno bancario", "Assegno circolare"].includes(v.modalita);
  const nomeTipo = TIPI_DOC.find(t => t[0] === v.tipo)?.[1] || "Documento";
  const penitenziale = v.voce === PENITENZIALE; // versione 402
  const caparra = v.voce === CAPARRA || penitenziale;
  const nomeCaparra = penitenziale ? "caparra penitenziale" : "caparra confirmatoria";
  const causale = pulisciCausale([caparra ? causaleAnticipo(v.tipo, v.numero, v.data_documento).replace(/^ACCONTO SU/, penitenziale ? "CAPARRA PENITENZIALE SU" : "CAPARRA CONFIRMATORIA SU") : causaleAnticipo(v.tipo, v.numero, v.data_documento), v.aggiunta].filter(Boolean).join(" "));
  const conosciuti = [...new Set(tutte.map(s => s.iban).filter(Boolean))];
  const ib = ibanDelModulo(v);
  const gia = affare && !affare.errore ? Number(affare.pagato || 0) : 0;
  const giaContanti = affare && !affare.errore ? Number(affare.contanti || 0) : 0;
  const totaleAffare = Math.max(tot || 0, affare && !affare.errore ? Number(affare.totale || 0) : 0);
  const problemi = [];
  if (!sogg) problemi.push("scegliere il fornitore");
  if (!imp) problemi.push("scrivere l'importo");
  if (!v.numero.trim() || !v.data_documento) problemi.push("scrivere numero e data del documento del fornitore");
  if (v.data_documento && v.data_documento > oggi) problemi.push("la data del documento è nel futuro");
  if (!tot) problemi.push("scrivere il totale del documento (quanto costa tutto l'affare)");
  if (tot && imp && imp > tot + 0.005) problemi.push("l'importo supera il totale del documento");
  if (imp && totaleAffare && gia + imp > totaleAffare + 0.005) problemi.push(`sul documento sono già stati pagati ${euro(gia)}: con questo si supera il totale (${euro(totaleAffare)})`);
  if (!pdf) problemi.push("allegare il PDF del documento del fornitore");
  if (caparra && !v.consegna_prevista) problemi.push("scrivere la data di consegna prevista (caparra)");
  if (caparra && v.consegna_prevista && v.data_disposizione && v.consegna_prevista < v.data_disposizione) problemi.push("la consegna prevista è prima del pagamento");
  if (!v.modalita) problemi.push("scegliere come si paga");
  if (v.modalita === "Altro" && !String(v.modalita_altro || "").trim()) problemi.push("scrivere quale modalità");
  if (!v.conto_id) problemi.push("scegliere con che cosa");
  if (v.modalita === "Carta di debito" && !v.carta_di_debito_id) problemi.push("scegliere la carta di debito");
  if (v.modalita === "Contanti" && imp && giaContanti + imp >= 5000) problemi.push(`in contanti sullo stesso documento si arriverebbe a ${euro(giaContanti + imp)}: dai 5.000 € in su è vietato, anche a rate (art. 49 D.Lgs. 231/2007)`);
  if (assegno && imp >= 1000 && !v.non_trasferibile) problemi.push("assegno da 1.000 € in su: spuntare «Non trasferibile» (art. 49 D.Lgs. 231/2007)");
  problemi.push(...problemiContanti(v, oggi));
  if (!v.data_disposizione) problemi.push("scrivere la data di disposizione");
  if (bonifico && !causaleValida(causale)) problemi.push("causale del bonifico non valida (al massimo 140 caratteri, senza lettere accentate)");
  if (bonifico) { if (!ib) problemi.push("scegliere o scrivere l'IBAN"); else if (!ibanValido(ib)) problemi.push("IBAN non valido"); else if (!v.iban_confermato) problemi.push("premere «Confermi IBAN»"); }
  if (imp > 5000 && !v.soglia_vista) problemi.push("spuntare «Ho visto: sopra 5.000 €»");
  if (chiedeDoppione && !v.doppione.trim()) problemi.push("scrivere perché non è un doppione");
  async function invia() {
    if (problemi.length || lavoro) return;
    setLavoro(true); setErrore("");
    const p = { sezione: "pagamento_fatture", conto_id: Number(v.conto_id), modalita: v.modalita, modalita_altro: v.modalita_altro || "", carta_di_debito_id: v.carta_di_debito_id || "",
      data_disposizione: v.data_disposizione, importo: imp, causale_voce: caparra || v.voce === BENE ? v.voce : ANTICIPO, fornitore_id: sogg, cliente_id: "",
      causale: bonifico || causale ? causale : "", iban: bonifico ? ib : "", iban_confermato: !!v.iban_confermato, iban_diverso_motivo: "", note: v.note || "",
      documento_tipo: v.tipo, documento_numero: v.numero.trim(), documento_data: v.data_documento, documento_totale: tot, documento_pdf: pdf.percorso,
      consegna_prevista: caparra ? v.consegna_prevista : "", non_trasferibile: !!v.non_trasferibile,
      ...(v.doppione.trim() ? { conferma_doppione: v.doppione.trim() } : {}),
      ...(v.modalita === "Contanti" ? { contanti_persona: v.contanti_persona } : {}) };
    const { data, error } = await supabase.rpc("ci_disponi_anticipo", { p });
    setLavoro(false);
    if (error) {
      if (/DOPPIONE/.test(error.message || "")) { setChiedeDoppione(error.message); return setErrore(""); }
      const rete = !error.code && /fetch|network|Failed|rete|timeout/i.test(String(error.message || ""));
      return setErrore(rete ? "La risposta del database non è arrivata: VERIFICARE in «In attesa della banca» se il pagamento è registrato prima di riprovare. " + error.message
        : "Il database non l'ha accettato, non è stato registrato niente: " + error.message);
    }
    const nome = fornitori.find(a => a.id === sogg)?.nome;
    const cosa = caparra ? nomeCaparra : "acconto";
    const notaConsegna = caparra ? ` Consegna prevista: ${dataIt(v.consegna_prevista)}.` : "";
    const resta = totaleAffare ? ` Sul documento: totale ${euro(totaleAffare)}, pagato con questo ${euro(gia + imp)}, resta ${euro(Math.max(totaleAffare - gia - imp, 0))}.` : "";
    if (data.definitivo === true) return fatto({ titolo: `${data.codice_attesa}: ${cosa} a ${nome} pagato in contanti — definitivo, prima nota n. ${data.numero || "—"}`,
      testo: `Registrato in cassa. È in «Anticipi in attesa di fattura». Conservare la ricevuta del fornitore.${notaConsegna}${resta}`,
      copie: [["Beneficiario", nome], ["Importo", importoIt(imp)], ["Descrizione", causale], ["Data", dataIt(v.data_disposizione)]].filter(x => x[1]) });
    fatto({ titolo: `${data.codice_attesa}: ${cosa} a ${nome} mandato in pagamento — in attesa della banca`,
      testo: `Adesso, oggi stesso, disporre ${v.modalita === "Bonifico istantaneo" ? "il bonifico istantaneo" : v.modalita.toLowerCase()}${assegno && v.non_trasferibile ? " NON TRASFERIBILE" : ""} in banca con questi dati (pulsanti «Copia»). È già in «Anticipi in attesa di fattura»: ${caparra ? "alla consegna la fattura del fornitore si aggancia lì; se l'affare salta si sceglie l'esito (restituita, trattenuta, restituita il doppio)." : "quando arriva la fattura del fornitore si aggancia lì."} Se il pagamento non parte, annullarlo in «In attesa della banca».${notaConsegna}${resta}`,
      copie: [["Beneficiario", nome], ["IBAN", bonifico ? ibanBello(ib) : ""], ["Importo", importoIt(imp)], ["Causale", causale], ["Data di esecuzione", dataIt(v.data_disposizione)]].filter(x => x[1]) });
  }
  const fSc = fornitori.find(a => a.id === sogg);
  return <div>
    <div style={scheda}>
      <div style={{ fontWeight: 800, color: C.primary, marginBottom: 4 }}>Anticipo su fattura da ricevere o caparra</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {[[ANTICIPO, "Acconto su fattura da ricevere", "Pagamento di una parte del prezzo: la fattura è dovuta subito (entro 12 giorni); se non arriva, avviso e segnalazione TD29."],
          [CAPARRA, "Caparra confirmatoria su preventivo", "Garanzia dell'affare (art. 1385 c.c.), fuori campo IVA (da confermare con lo Studio): nessuna fattura al pagamento; alla consegna entra nella fattura."],
          [PENITENZIALE, "Caparra penitenziale su preventivo", "Prezzo per potersi tirare indietro (art. 1386 c.c.): chi recede perde la caparra (o la restituisce il doppio); nessuna fattura al pagamento; alla consegna entra nella fattura."],
          [BENE, "Acconto su bene strumentale", "Acconto per un macchinario, un mezzo o un impianto (cespite): come l'acconto su fattura, nel gruppo «Investimenti»."]].map(([k, n, d]) =>
          <button key={k} title={d} onClick={() => cambia("voce", k)} style={{ ...btn(v.voce === k), height: "auto", padding: "6px 10px", textAlign: "left", maxWidth: 420 }}><b>{v.voce === k ? "● " : "○ "}{n}</b><br /><span style={{ fontSize: 11.5, fontWeight: 400 }}>{d}</span></button>)}
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8, maxWidth: 1000 }}>Per pagare prima della fattura, sul documento del fornitore (preventivo, ordine, proforma, offerta, contratto): il PDF del documento è obbligatorio. Non si spuntano fatture. Il pagamento resta in «Anticipi in attesa di fattura» finché arriva la fattura del fornitore.</div>
      {!sogg ? <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={{ ...input, width: "100%", maxWidth: 520 }} placeholder="Cerca il fornitore: nome anche parziale o partita IVA" value={cerca} onChange={e => setCerca(e.target.value)} />
          <button style={btn(false)} onClick={() => { setApriNuovo(true); setAvvisoNuovo(""); }}>+ Fornitore nuovo</button></div>
        <div style={{ marginTop: 6 }}>{trovati.map(a => <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "3px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12.5 }}>
          <b style={{ flex: 1 }}>{a.nome}</b><span style={{ color: C.muted }}>{a.partita_iva || "—"}</span><button style={{ ...btn(true), height: 28 }} onClick={() => setSogg(a.id)}>Scegli</button></div>)}</div>
        {cerca.trim().length >= 2 && !trovati.length && !apriNuovo && <div style={{ color: C.muted, fontSize: 12.5, marginTop: 6 }}>Nessun fornitore con questo nome: premere «+ Fornitore nuovo».</div>}
        {apriNuovo && <FornitoreNuovo chiudi={() => setApriNuovo(false)} creato={f => { setNuovi(o => [...o, f]); setSogg(f.id); setApriNuovo(false);
          setAvvisoNuovo(f.esisteva ? `La partita IVA era già nell'anagrafica: uso il fornitore che c'è, «${f.nome}». I contatti scritti nel modulo NON sono stati salvati: se sono cambiati, aggiornarli nell'anagrafica dei fornitori.` : `Fornitore «${f.nome}» aggiunto all'anagrafica.`); }} />}
      </> : <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 800, color: C.primary, fontSize: 16 }}>{fSc?.nome} <span style={{ fontSize: 12.5, color: C.muted }}>{fSc?.partita_iva}</span></div>
        <button style={btn(false)} onClick={() => { setSogg(null); setChiedeDoppione(""); }}>← Cambia fornitore</button></div>}
      {avvisoNuovo && sogg && <div style={{ color: C.primary, fontWeight: 700, fontSize: 12.5, marginTop: 4 }}>{avvisoNuovo}</div>}
      {erroreStorico && <div style={{ color: C.red, fontWeight: 700, fontSize: 12.5 }}>⚠️ {erroreStorico}</div>}
    </div>
    {sogg && <div style={{ ...scheda, border: `2px solid ${C.primary}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        <label style={L}>Documento del fornitore<select style={sel(false)} value={v.tipo} onChange={e => cambia("tipo", e.target.value)}>{TIPI_DOC.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label style={L}>Numero del documento<input style={sel(!v.numero.trim())} value={v.numero} onChange={e => { cambia("numero", e.target.value); setChiedeDoppione(""); }} /></label>
        <label style={L}>Data del documento<input type="date" style={sel(!v.data_documento)} value={v.data_documento} onChange={e => cambia("data_documento", e.target.value)} /></label>
        <label style={L}>Totale del documento (tutto l'affare)<input style={sel(!tot)} value={v.totale} onChange={e => cambia("totale", e.target.value)} placeholder="es. 12.200,00" /></label>
        <div style={{ ...L, gridColumn: "1 / -1" }}>PDF del documento (obbligatorio)
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontWeight: 400 }}>
            <input type="file" accept="application/pdf,.pdf" onChange={e => caricaPdf(e.target.files?.[0])} />
            {pdf ? <span style={{ color: C.primary, fontWeight: 700 }}>✓ {pdf.nome}</span> : <span style={{ color: C.red }}>non allegato</span>}</div></div>
        {v.numero.trim() && <div style={{ gridColumn: "1 / -1", fontSize: 13, background: "#F4F4F0", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px" }}>
          {affare?.errore ? <span style={{ color: C.red }}>Già pagato sul documento non letto: {affare.errore}</span>
            : <>Sul documento {nomeTipo.toLowerCase()} n. {v.numero.trim()}: totale <b>{totaleAffare ? euro(totaleAffare) : "—"}</b> · già pagato <b>{euro(gia)}</b>{giaContanti ? ` (di cui in contanti ${euro(giaContanti)})` : ""}
              {imp ? <> · adesso <b>{euro(imp)}</b> · resta da pagare <b>{totaleAffare ? euro(Math.max(totaleAffare - gia - imp, 0)) : "—"}</b></> : null}</>}</div>}
        <label style={L}>Importo da pagare adesso<input style={sel(!imp)} value={v.importo} onChange={e => cambia("importo", e.target.value)} placeholder="es. 3.660,00" /></label>
        {caparra && <label style={L}>Data di consegna prevista (caparra)<input type="date" style={sel(!v.consegna_prevista)} value={v.consegna_prevista} onChange={e => cambia("consegna_prevista", e.target.value)} /></label>}
        <ComeEConCheCosa base={base} verso="uscita" v={v} cambia={cambia} importo={imp} />
        {v.modalita === "Contanti" && <SceltaContanti verso="uscita" v={v} cambia={cambia} importo={imp} />}
        {assegno && <label style={{ ...L, flexDirection: "row", alignItems: "center", gap: 6, color: imp >= 1000 && !v.non_trasferibile ? C.red : undefined }}>
          <input type="checkbox" checked={v.non_trasferibile} onChange={e => cambia("non_trasferibile", e.target.checked)} /> Assegno NON TRASFERIBILE (obbligatorio da 1.000 € in su)</label>}
        <label style={L}>{v.modalita === "Contanti" ? "Data in cui si paga in contanti (non nel futuro)" : "Data di disposizione"}<input type="date" style={sel(!v.data_disposizione)} value={v.data_disposizione} onChange={e => cambia("data_disposizione", e.target.value)} />
          {v.data_disposizione && v.data_disposizione !== oggi && v.modalita !== "Contanti" && <span style={{ color: C.yellow, fontWeight: 700 }}>Non è oggi: disporre in banca lo stesso giorno in cui si registra qui.</span>}</label>
        {bonifico && <SceltaIban ibanFattura={[]} conosciuti={conosciuti} v={v} cambia={cambia} />}
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{bonifico ? "Causale del bonifico (composta dal programma; si può solo aggiungere)" : "Descrizione"} <Contatore testo={causale} /></div>
          <div style={{ fontFamily: "monospace", fontSize: 13, background: "#F4F4F0", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", margin: "4px 0", wordBreak: "break-all" }}>{causale || "—"}</div>
          <input style={{ ...input, width: "100%" }} placeholder="Aggiunta facoltativa (per esempio il numero d'ordine)" value={v.aggiunta} onChange={e => cambia("aggiunta", e.target.value)} />
        </div>
        <label style={{ ...L, gridColumn: "1 / -1" }}>Nota interna (facoltativa, non va in banca)<input style={sel(false)} value={v.note} onChange={e => cambia("note", e.target.value)} /></label>
      </div>
      {chiedeDoppione && <div style={{ marginTop: 8, padding: 8, border: `2px solid ${C.red}`, borderRadius: 8 }}>
        <div style={{ color: C.red, fontWeight: 700, fontSize: 13 }}>{chiedeDoppione}</div>
        <label style={{ ...L, marginTop: 4 }}>Se è davvero un altro pagamento (per esempio la seconda rata), scrivere perché<input style={sel(!v.doppione.trim())} value={v.doppione} onChange={e => cambia("doppione", e.target.value)} /></label></div>}
      {imp > 5000 && <label style={{ display: "block", marginTop: 8, color: C.red, fontWeight: 700, fontSize: 13 }}><input type="checkbox" checked={v.soglia_vista} onChange={e => cambia("soglia_vista", e.target.checked)} /> Ho visto: sopra 5.000 €. Il movimento sarà segnalato tra le anomalie al Dott. Bizzarri e a Teresa Demaria.</label>}
      {problemi.length > 0 && <div style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>Per confermare: {problemi.join("; ")}.</div>}
      {errore && <div style={{ color: C.red, fontWeight: 700, marginTop: 8 }}>⚠️ {errore}</div>}
      <div style={{ marginTop: 10 }}><button style={btn(true)} disabled={!!problemi.length || lavoro} onClick={invia}>{lavoro ? "Registro…" : caparra ? "Conferma e manda in pagamento la caparra" : "Conferma e manda in pagamento l'acconto"}</button></div>
    </div>}
  </div>;
}

// ---------------- Altri pagamenti / Altri incassi ----------------
function SezioneAltri({ sezione, base, fatto, oggi }) {
  const pag = sezione === "altri_pagamenti"; const verso = pag ? "uscita" : "entrata";
  const [v, setV] = useState({ modalita: "", conto_id: "", data_disposizione: oggi, causale_gruppo: "", causale_voce: "", causale_altro: "", soggetto: "", controparte: "", importo: "",
    causale: "", documento_riferimento: "", iban_scelta: "altro", iban_scritto: "", iban_confermato: false, note: "", soglia_vista: false, contanti_persona: "" });
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
  problemi.push(...problemiContanti(v, oggi));
  if (!pag && !v.documento_riferimento.trim()) problemi.push("scrivere il documento (obbligatorio per gli altri incassi)");
  if (bonifico && !causaleValida(causale)) problemi.push("scrivere la causale del bonifico (al massimo 140 caratteri)");
  if (pag && bonifico) { if (!ib) problemi.push("scrivere l'IBAN"); else if (!ibanValido(ib)) problemi.push("IBAN non valido"); else if (!v.iban_confermato) problemi.push("premere «Confermi IBAN»"); }
  if (imp > 5000 && !v.soglia_vista) problemi.push("spuntare «Ho visto: sopra 5.000 €»");
  async function invia() {
    if (problemi.length || lavoro) return; setLavoro(true); setErrore("");
    const p = { sezione, conto_id: Number(v.conto_id), modalita: v.modalita, modalita_altro: v.modalita_altro || "", carta_di_debito_id: v.carta_di_debito_id || "", data_disposizione: v.data_disposizione,
      importo: imp, causale_gruppo: v.causale_gruppo, causale_voce: v.causale_voce, causale_altro: v.causale_altro, fornitore_id: tipoS === "f" ? Number(idS) : "", cliente_id: tipoS === "c" ? Number(idS) : "",
      controparte: v.soggetto === "altro" ? v.controparte.trim() : nomeS, causale: causale, iban: pag && bonifico ? ib : "", iban_confermato: !!v.iban_confermato, documento_riferimento: v.documento_riferimento, note: v.note,
      ...(v.modalita === "Contanti" ? { contanti_persona: v.contanti_persona } : {}) };
    const { data, error } = await supabase.rpc("ci_disponi_401", { p });
    setLavoro(false);
    if (error) return setErrore("Il database non l'ha accettato, non è stato registrato niente: " + error.message);
    if (data.definitivo === true) return fatto({ titolo: `${data.codice_attesa}: ${pag ? "pagamento" : "incasso"} in contanti registrato — definitivo, prima nota n. ${data.numero || "—"}`,
      testo: pag ? "Registrato in cassa. Conservare la ricevuta." : "Registrato in cassa. Consegnare la ricevuta.",
      copie: [["Soggetto", v.soggetto === "altro" ? v.controparte : nomeS], ["Importo", importoIt(imp)], ["Descrizione", causale], ["Data", dataIt(v.data_disposizione)]].filter(x => x[1]) });
    fatto({ titolo: `${data.codice_attesa}: ${pag ? "pagamento mandato in pagamento" : "incasso atteso registrato"} — in attesa della banca`,
      testo: pag ? "Adesso, oggi stesso, disporre il pagamento in banca con questi dati. Alla conferma della banca prenderà il numero di prima nota." : "Alla conferma della banca prenderà il numero di prima nota.",
      copie: [["Beneficiario", pag ? (v.soggetto === "altro" ? v.controparte : nomeS) : ""], ["IBAN", pag && bonifico ? ibanBello(ib) : ""], ["Importo", importoIt(imp)], ["Causale", causale], ["Data di esecuzione", dataIt(v.data_disposizione)]].filter(x => x[1]) });
  }
  return <div style={{ ...scheda, border: `2px solid ${C.primary}` }}>
    <div style={{ fontWeight: 800, color: C.primary, fontSize: 15, marginBottom: 4 }}>{pag ? "Altri pagamenti" : "Altri incassi"}</div>
    <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>{pag ? "Pagamenti senza fattura nel programma: tasse ed enti, fondi ed enti bilaterali del personale, assicurazioni, quote, affitti, investimenti, soci, rimborsi, finanziamenti. Stipendi, compensi, acconti, TFR e prestiti al personale si pagano con il pulsante «Stipendi e compensi»; gli F24 con il pulsante «F24»."
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
      {v.modalita === "Contanti" && <SceltaContanti verso={verso} v={v} cambia={cambia} importo={imp} />}
      <label style={L}>{v.modalita === "Contanti" ? "Data in cui passano i contanti (non nel futuro)" : "Data di disposizione"}<input type="date" style={sel(!v.data_disposizione)} value={v.data_disposizione} onChange={e => cambia("data_disposizione", e.target.value)} />
        {v.data_disposizione !== oggi && v.modalita !== "Contanti" && <span style={{ color: C.yellow, fontWeight: 700 }}>Non è oggi.</span>}</label>
      {!pag && <label style={L}>Documento (obbligatorio)<input style={sel(!v.documento_riferimento.trim())} value={v.documento_riferimento} onChange={e => cambia("documento_riferimento", e.target.value)} placeholder="es. verbale dell'assemblea del 10/06/2026" /></label>}
      {pag && bonifico && <div style={{ ...L, gridColumn: "1 / -1" }}>IBAN del beneficiario
        <input style={sel(!ib || !ibanValido(ib))} value={v.iban_scritto} onChange={e => { cambia("iban_scritto", e.target.value); cambia("iban_confermato", false); }} placeholder="IT00 X000 0000 0000 0000 0000 000" />
        {ib && !ibanValido(ib) && <span style={{ color: C.red }}>IBAN non valido: forma o cifre di controllo sbagliate.</span>}
        {ib && ibanValido(ib) && <div><button style={btn(!!v.iban_confermato, C.green)} onClick={() => cambia("iban_confermato", true)}>{v.iban_confermato ? `✔ IBAN confermato: ${ibanBello(ib)}` : "Confermi IBAN"}</button></div>}</div>}
      <div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: 12, fontWeight: 700 }}>{bonifico ? "Causale del bonifico" : "Descrizione"} <Contatore testo={causale} /></div>
        <input style={{ ...sel(bonifico && !causaleValida(causale)), marginTop: 4 }} value={v.causale} onChange={e => cambia("causale", e.target.value)} placeholder={pag ? "es. QUOTA ASSOCIATIVA 2026" : "es. FINANZIAMENTO SOCI"} />
        {v.causale && causale !== v.causale.trim() && <div style={{ fontSize: 12, color: C.muted }}>In banca andrà così: <b>{causale}</b></div>}</div>
      <label style={{ ...L, gridColumn: "1 / -1" }}>Nota interna (facoltativa)<input style={sel(false)} value={v.note} onChange={e => cambia("note", e.target.value)} /></label>
    </div>
    {imp > 5000 && <label style={{ display: "block", marginTop: 8, color: C.red, fontWeight: 700, fontSize: 13 }}><input type="checkbox" checked={v.soglia_vista} onChange={e => cambia("soglia_vista", e.target.checked)} /> Ho visto: sopra 5.000 €. Sarà segnalato al Dott. Bizzarri e a Teresa Demaria.</label>}
    {problemi.length > 0 && <div style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>Per confermare: {problemi.join("; ")}.</div>}
    {errore && <div style={{ color: C.red, fontWeight: 700, marginTop: 8 }}>⚠️ {errore}</div>}
    <div style={{ marginTop: 10 }}><button style={btn(true)} disabled={!!problemi.length || lavoro} onClick={invia}>{lavoro ? "Registro…" : pag ? "Conferma e manda in pagamento" : "Conferma e registra l'incasso atteso"}</button></div>
  </div>;
}

// ---------------- Stipendi e compensi (versione 406) ----------------
// Decisioni del Dott. Bizzarri del 25/11/2026 ore 17:19–17:44 (claude/tenente_decisioni_25_11_1734_stipendi.md): come per le fatture si sceglie
// la persona e la busta paga (la voce la dà la busta); senza cedolino si sceglie dal menu, con «Altro» e la casella obbligatoria; solo bonifico
// o assegno non trasferibile (legge 205/2017, comma 910), consegnato al lavoratore o a un delegato con nome e parentela; causale composta dal
// programma; Word per il modulo della banca e, per l'assegno, ricevuta di consegna; «Carica la distinta» → pagato. Regole nel database: ci_paga_stipendio.
const MESI_CAUSALE = ["", "GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE"];
const meseIt = m => MESI_CAUSALE[m].charAt(0) + MESI_CAUSALE[m].slice(1).toLowerCase();
// TFR e anticipi sul TFR: passano dal cedolino (tassazione separata del consulente) → si pagano con la busta. Prestazioni occasionali di chi
// non è dipendente: «Professionisti con ritenuta». Rimborsi delle spese: «Rimborsi delle spese» (versione 383). Ricontrollo del 25/11 ore 18:2x.
const TIPI_SENZA_CEDOLINO = ["Acconto sullo stipendio (busta non ancora arrivata)", "Prestito al dipendente", "Altro"];
const PARENTELE = ["Coniuge", "Convivente", "Familiare in linea retta (almeno 16 anni)", "Familiare in linea collaterale (almeno 16 anni)"];
const MODALITA_STIPENDI = ["Bonifico", "Bonifico istantaneo", "Assegno bancario", "Assegno circolare"];
const collabDi = b => ["COLLABORATORE", "AMMINISTRATORE"].includes(String(b.qualifica || "").toUpperCase());
const cosaBusta = b => b.tipo === "tredicesima" ? "Tredicesima" : b.tipo === "quattordicesima" ? "Quattordicesima" : (collabDi(b) ? "Compenso" : "Stipendio") + (Number(b.tfr) > 0 ? " + TFR" : "");
const nomeCausaleBusta = b => b.tipo === "tredicesima" ? `TREDICESIMA ${b.anno}` : b.tipo === "quattordicesima" ? `QUATTORDICESIMA ${b.anno}`
  : `${collabDi(b) ? "COMPENSO" : "STIPENDIO"} ${MESI_CAUSALE[b.mese]} ${b.anno}${Number(b.tfr) > 0 ? " + TFR" : ""}`;
// già pagato (dal database, ci_busta_pagato): pagamenti disposti da qui + il maggiore fra ricevute caricate e bonifici già in prima nota + acconti senza cedolino del mese
const pagatoBusta = b => Number(b.pagato);
const corto = b => b.tipo === "mensile" ? `${MESI_CAUSALE[b.mese].slice(0, 3)} ${b.anno}` : `${b.tipo.toUpperCase()} ${b.anno}`;
const restoBusta = b => Math.max(Math.round((Number(b.netto) - pagatoBusta(b)) * 100) / 100, 0);

function SezioneStipendi({ base, fatto, oggi }) {
  const [dati, setDati] = useState(null); const [erroreDati, setErroreDati] = useState("");
  const [cerca, setCerca] = useState(""); const [sogg, setSogg] = useState(null); const [strada, setStrada] = useState("busta");
  const [spunte, setSpunte] = useState({}); // id della busta → importo (testo)
  const vuotoSenza = () => ({ tipologia: "", descrizione: "", importo: "", rif: oggi.slice(0, 7) });
  const [senza, setSenza] = useState(vuotoSenza);
  const vuotoV = () => ({ modalita: "", conto_id: "", data_disposizione: oggi, aggiunta: "", iban_scritto: "", iban_confermato: false, iban_motivo: "", assegno_numero: "", consegnato_a: "lavoratore", delegato_nome: "", delegato_parentela: "", note: "", soglia_vista: false });
  const [v, setV] = useState(vuotoV);
  const [lavoro, setLavoro] = useState(false); const [errore, setErrore] = useState("");
  const cambia = (k, x) => setV(o => ({ ...o, [k]: x }));
  useEffect(() => { supabase.rpc("ci_stipendi_situazione").then(({ data, error }) => { if (error) setErroreDati(error.message); else setDati(data); }); }, []);
  const persona = dati?.persone.find(p => p.id === sogg);
  const busteDi = id => (dati?.buste || []).filter(b => b.dipendente_id === id);
  const elenco = useMemo(() => {
    if (!dati) return [];
    const q = cerca.trim().toLowerCase().replace(/\s/g, "");
    return dati.persone.map(p => { const ap = busteDi(p.id).filter(b => restoBusta(b) > 0.005); const att = busteDi(p.id).filter(b => Number(b.in_attesa) > 0.005);
      return { ...p, aperte: ap.length, resto: ap.reduce((t, b) => t + restoBusta(b), 0), attesa: att.length, buste: busteDi(p.id).length }; })
      .filter(p => p.buste > 0 || !p.cessazione)
      .filter(p => !q || String(p.nome || "").toLowerCase().replace(/\s/g, "").includes(q) || String(p.codice_fiscale || "").toLowerCase().includes(q))
      .sort((a, b) => b.resto - a.resto || String(a.nome).localeCompare(String(b.nome)));
  }, [dati, cerca]);
  function scegli(p) {
    // ogni persona riparte da zero: niente spunte, numeri di assegno, delegati o aggiunte rimasti dalla persona di prima
    setSogg(p.id); setSpunte({}); setStrada("busta"); setSenza(vuotoSenza()); setErrore("");
    setV({ ...vuotoV(), iban_scritto: p.iban || p.iban_ultimo || "" });
  }
  const scelte = persona ? busteDi(persona.id).filter(b => spunte[b.id] !== undefined) : [];
  const totale = strada === "busta" ? scelte.reduce((t, b) => t + (leggiImporto(spunte[b.id]) || 0), 0) : (leggiImporto(senza.importo) || 0);
  const bonifico = ["Bonifico", "Bonifico istantaneo"].includes(v.modalita); const assegno = v.modalita.startsWith("Assegno");
  const ib = ibanPulito(v.iban_scritto);
  // causale composta dal programma: si può solo aggiungere in coda (decisione del 25/11 ore 17:38)
  let base_causale = "";
  if (strada === "busta" && scelte.length) { base_causale = scelte.map(b => { const imp = leggiImporto(spunte[b.id]) || 0; const r = restoBusta(b); const nome = nomeCausaleBusta(b);
    return imp < r - 0.005 ? "ACCONTO " + nome : pagatoBusta(b) > 0.005 ? `SALDO ${nome} DEDOTTO ACCONTO` : nome; }).join(" + ");
    // più buste in un bonifico: se la causale supera i 140 caratteri si usa la forma corta («STIPENDI SET 2026 OTT 2026»)
    if (base_causale.length + (v.aggiunta ? v.aggiunta.length + 1 : 0) > 140) base_causale = `${scelte.some(collabDi) ? "COMPENSI" : "STIPENDI"} ${scelte.map(corto).join(" ")}`; }
  const [annoRif, meseRif] = (senza.rif || "").split("-").map(Number);
  const bustaDelMese = persona && senza.tipologia.startsWith("Acconto") ? busteDi(persona.id).find(b => b.tipo === "mensile" && b.anno === annoRif && b.mese === meseRif) : null;
  if (strada === "senza" && senza.tipologia) { const t = senza.tipologia;
    base_causale = t.startsWith("Acconto") ? `ACCONTO STIPENDIO ${MESI_CAUSALE[meseRif] || ""} ${annoRif || ""}` : t.startsWith("Prestito") ? "PRESTITO AL DIPENDENTE" : senza.descrizione; }
  const causale = pulisciCausale([base_causale, v.aggiunta].filter(Boolean).join(" "));
  const adatti = base.conti.filter(c => c.stato === "aperto" && v.modalita && modalitaAmmessa(c.tipo, v.modalita, "uscita"));
  const problemi = [];
  if (strada === "busta") {
    if (!scelte.length) problemi.push("spuntare almeno una busta paga");
    scelte.forEach(b => { const imp = leggiImporto(spunte[b.id]); if (!imp) problemi.push(`importo della busta di ${meseIt(b.mese)} ${b.anno}`); else if (imp > restoBusta(b) + 0.005) problemi.push(`${meseIt(b.mese)} ${b.anno}: si pagano ${euro(imp)} ma restano ${euro(restoBusta(b))}`); });
  } else {
    if (!senza.tipologia) problemi.push("scegliere la tipologia dal menu");
    if (senza.tipologia === "Altro" && !senza.descrizione.trim()) problemi.push("scrivere in che cosa consiste «Altro»");
    if (senza.tipologia.startsWith("Acconto") && (!annoRif || !meseRif || annoRif < 2026)) problemi.push("scegliere il mese dello stipendio (dal 2026)");
    if (bustaDelMese) problemi.push(`la busta di ${meseIt(meseRif)} ${annoRif} è già caricata: l'acconto si paga da «Con busta paga», riducendo l'importo`);
    if (!leggiImporto(senza.importo)) problemi.push("scrivere l'importo");
  }
  if (!v.modalita) problemi.push("scegliere come si paga");
  if (!v.conto_id) problemi.push("scegliere da quale conto");
  if (!v.data_disposizione) problemi.push("scrivere la data");
  const ibanNoto = persona ? ibanPulito(persona.iban || persona.iban_ultimo || "") : "";
  const ibanCambiato = bonifico && !!ibanNoto && !!ib && ib !== ibanNoto;
  if (ibanCambiato && v.iban_motivo.trim().length < 5) problemi.push("IBAN diverso da quello conosciuto: scrivere il motivo del cambio");
  if (bonifico) { if (!ib) problemi.push("scrivere l'IBAN della persona"); else if (!ibanValido(ib)) problemi.push("IBAN non valido"); else if (!v.iban_confermato) problemi.push("premere «Confermi IBAN»");
    if (!causaleValida(causale)) problemi.push("causale del bonifico non valida (al massimo 140 caratteri)"); }
  if (assegno) { if (!v.assegno_numero.trim()) problemi.push("scrivere il numero dell'assegno");
    if (v.consegnato_a === "delegato" && (!v.delegato_nome.trim() || !v.delegato_parentela)) problemi.push("assegno a un delegato: nome e parentela"); }
  if (totale > 5000 && !v.soglia_vista) problemi.push("spuntare «Ho visto: sopra 5.000 €»");
  async function invia() {
    if (problemi.length || lavoro) return; setLavoro(true); setErrore("");
    const p = { dipendente_id: persona.id, strada, importo: Math.round(totale * 100) / 100, modalita: v.modalita, conto_id: Number(v.conto_id), data_disposizione: v.data_disposizione,
      causale, note: v.note, iban: bonifico ? ib : "", iban_confermato: bonifico && !!v.iban_confermato, iban_diverso_motivo: ibanCambiato ? v.iban_motivo.trim() : "",
      ...(strada === "busta" ? { buste: scelte.map(b => ({ costo_lavoro_id: b.id, importo: leggiImporto(spunte[b.id]) })) }
        : { tipologia: senza.tipologia, descrizione: senza.descrizione.trim(), ...(senza.tipologia.startsWith("Acconto") ? { anno_rif: annoRif, mese_rif: meseRif } : {}) }),
      ...(assegno ? { assegno_numero: v.assegno_numero.trim(), consegnato_a: v.consegnato_a, delegato_nome: v.delegato_nome.trim(), delegato_parentela: v.delegato_parentela } : {}) };
    const { data, error } = await supabase.rpc("ci_paga_stipendio", { p });
    setLavoro(false);
    if (error) return setErrore("Il database non l'ha accettato, non è stato registrato niente: " + error.message);
    const conto = base.conti.find(c => c.id === Number(v.conto_id));
    const ricevente = v.consegnato_a === "delegato" ? `${v.delegato_nome.trim()} (${v.delegato_parentela.toLowerCase()} di ${persona.nome})` : persona.nome;
    fatto({ titolo: `${data.codice_attesa}: ${data.voce.toLowerCase()} di ${persona.nome} mandato in pagamento — in attesa della banca`,
      testo: bonifico ? "Adesso, oggi stesso, fare il bonifico in banca copiando i dati dal Word o con i pulsanti «Copia». Poi caricare la distinta: il pagamento diventa «pagato»; alla conferma dell'estratto prende il numero di prima nota."
        : "Stampare il Word, compilare l'assegno non trasferibile con questi dati e far firmare la ricevuta di consegna. Diventa definitivo quando l'assegno compare addebitato nell'estratto conto.",
      copie: [["Beneficiario", persona.nome], ["IBAN", bonifico ? ibanBello(ib) : ""], ["Numero assegno", assegno ? v.assegno_numero.trim() : ""], ["Importo", importoIt(totale)], ["Causale", causale], ["Data di esecuzione", dataIt(v.data_disposizione)]].filter(x => x[1]),
      word: { codice: data.codice_attesa, beneficiario: persona.nome, iban: bonifico ? ibanBello(ib) : "", importo: "€ " + importoIt(totale), causale, data: dataIt(v.data_disposizione),
        conto: conto?.nome || "", modalita: v.modalita + (assegno ? " non trasferibile" : ""),
        buste: strada === "busta" ? scelte.map(b => `${cosaBusta(b)} ${meseIt(b.mese)} ${b.anno}: ${euro(leggiImporto(spunte[b.id]))}`) : [],
        assegno: assegno ? { tipo: v.modalita === "Assegno circolare" ? "circolare" : "bancario", numero: v.assegno_numero.trim(), ricevente } : null },
      movimento: bonifico ? { id: data.movimento_id, data: v.data_disposizione, conto: conto?.nome_nei_movimenti || conto?.nome || "", distinta_id: null } : null });
  }
  if (erroreDati) return <div style={{ ...scheda, color: C.red, fontWeight: 700 }}>⚠️ Buste paga non lette: {erroreDati}</div>;
  if (!dati) return <div style={scheda}>Lettura delle buste paga…</div>;
  return <>
    {!persona && <div style={scheda}>
      <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>Chi si paga?</div>
      <input style={{ ...input, width: "100%", maxWidth: 520 }} placeholder="Cerca: nome anche parziale o codice fiscale" value={cerca} onChange={e => setCerca(e.target.value)} />
      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>Stipendi, salari, tredicesime, quattordicesime, compensi con cedolino e TFR: si sceglie la busta paga (caricata in «Leggi le buste paga e i pagamenti»). I pagamenti senza cedolino si scelgono dal menu dopo aver scelto la persona. I rimborsi delle spese si pagano da «Rimborsi delle spese». Niente contanti (legge 205/2017). Buste dal 2026: la prima nota parte dal 01/01/2026.</div>
      <table style={{ width: "100%", marginTop: 8, fontSize: 12.5, background: "#fff" }}><thead><tr style={{ background: C.primary, color: "#fff" }}>
        {["Persona", "Qualifica", "Buste aperte", "Resto da pagare", "In pagamento", ""].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left" }}>{h}</th>)}</tr></thead>
        <tbody>{elenco.map(p => <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
          <td style={{ padding: "5px 8px", fontWeight: 700 }}>{p.nome}{p.cessazione ? <span style={{ fontWeight: 400, color: C.muted }}> (cessato il {dataIt(p.cessazione)})</span> : ""}</td>
          <td style={{ padding: "5px 8px" }}>{p.qualifica || "—"}</td><td style={{ padding: "5px 8px" }}>{p.aperte}</td>
          <td style={{ padding: "5px 8px", textAlign: "right" }}>{euro(p.resto)}</td><td style={{ padding: "5px 8px", color: C.blue }}>{p.attesa ? `${p.attesa} buste` : ""}</td>
          <td style={{ padding: "5px 8px" }}><button style={btn(true)} onClick={() => scegli(p)}>Scegli</button></td></tr>)}</tbody></table>
      {!elenco.length && <div style={{ color: C.muted, marginTop: 6 }}>Nessuna persona trovata.</div>}
    </div>}
    {persona && <div style={scheda}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 800, color: C.primary, fontSize: 16 }}>{persona.nome} <span style={{ fontSize: 12.5, color: C.muted }}>{persona.qualifica} · {persona.codice_fiscale}</span></div>
        <button style={btn(false)} onClick={() => { setSogg(null); setSpunte({}); setSenza(vuotoSenza()); setV(vuotoV()); setErrore(""); }}>← Cambia persona</button></div>
      <div style={{ display: "flex", gap: 6, margin: "8px 0" }}>
        <button style={btn(strada === "busta")} onClick={() => setStrada("busta")}>Con busta paga (cedolino)</button>
        <button style={btn(strada === "senza")} onClick={() => setStrada("senza")}>Senza cedolino</button></div>
      {strada === "busta" && <>
        <div style={{ fontSize: 12.5, color: C.muted, margin: "6px 0" }}>Spuntare le buste che si pagano con lo stesso bonifico; l'importo si può ridurre per un acconto. La voce del pagamento la dà la busta. «Già pagato» comprende i pagamenti già disposti da qui, le ricevute caricate o i bonifici già in prima nota con il nome e il mese nella causale, e gli acconti dati senza cedolino per quel mese.</div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", fontSize: 12.5, background: "#fff" }}><thead><tr style={{ background: C.primary, color: "#fff" }}>
          {["", "Mese", "Che cosa è", "Netto in busta", "Di cui TFR", "Già pagato", "In pagamento", "Resto", "Da pagare ora"].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
          <tbody>{busteDi(persona.id).map(b => { const r = restoBusta(b); const chiusa = r <= 0.005; const sp = spunte[b.id] !== undefined; const imp = leggiImporto(spunte[b.id]);
            return <tr key={b.id} style={{ borderBottom: `1px solid ${C.border}`, background: chiusa ? "#F4F4F0" : sp ? "#F2F7EE" : "#fff", color: chiusa ? C.muted : C.text }}>
              <td style={{ padding: "5px 8px" }}>{chiusa ? "✔" : <input type="checkbox" checked={sp} onChange={e => setSpunte(o => { const n = { ...o }; if (e.target.checked) n[b.id] = importoIt(r); else delete n[b.id]; return n; })} />}</td>
              <td style={{ padding: "5px 8px", fontWeight: 700 }}>{meseIt(b.mese)} {b.anno}</td><td style={{ padding: "5px 8px" }}>{cosaBusta(b)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>{euro(b.netto)}</td><td style={{ padding: "5px 8px", textAlign: "right" }}>{Number(b.tfr) > 0 ? euro(b.tfr) : "—"}</td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>{euro(pagatoBusta(b))}</td><td style={{ padding: "5px 8px", color: C.blue }}>{Number(b.in_attesa) > 0.005 ? euro(b.in_attesa) : ""}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>{chiusa ? "pagata" : euro(r)}</td>
              <td style={{ padding: "5px 8px" }}>{sp ? <input style={{ ...input, width: 110, borderColor: !imp || imp > r + 0.005 ? C.red : C.border }} value={spunte[b.id]} onChange={e => setSpunte(o => ({ ...o, [b.id]: e.target.value }))} /> : ""}</td></tr>; })}</tbody></table></div>
        {!busteDi(persona.id).length && <div style={{ color: C.muted }}>Nessuna busta paga del 2026 caricata per questa persona: caricarla in «Leggi le buste paga e i pagamenti», oppure usare «Senza cedolino».</div>}
      </>}
      {strada === "senza" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginTop: 6 }}>
        <label style={L}>Tipologia del pagamento<select style={sel(!senza.tipologia)} value={senza.tipologia} onChange={e => setSenza(o => ({ ...o, tipologia: e.target.value }))}>
          <option value="">— scegliere —</option>{TIPI_SENZA_CEDOLINO.map(t => <option key={t}>{t}</option>)}</select>
          <span style={{ fontWeight: 400, color: C.muted }}>I rimborsi delle spese non sono qui: si pagano da «Rimborsi delle spese».</span></label>
        <label style={L}>Importo (€)<input style={sel(!leggiImporto(senza.importo))} value={senza.importo} onChange={e => setSenza(o => ({ ...o, importo: e.target.value }))} placeholder="500,00" /></label>
        {senza.tipologia === "Altro" && <label style={{ ...L, gridColumn: "1 / -1" }}>In che cosa consiste «Altro» (obbligatorio: diventa la causale)<input style={sel(!senza.descrizione.trim())} value={senza.descrizione} onChange={e => setSenza(o => ({ ...o, descrizione: e.target.value }))} /></label>}
        {senza.tipologia.startsWith("Acconto") && <label style={L}>Stipendio del mese<input type="month" style={sel(!annoRif || !meseRif || !!bustaDelMese)} value={senza.rif} onChange={e => setSenza(o => ({ ...o, rif: e.target.value }))} /></label>}
        {senza.tipologia.startsWith("Acconto") && <div style={{ gridColumn: "1 / -1", fontSize: 12.5, color: C.muted }}>Quando arriverà la busta di quel mese, il programma conterà questo acconto come già pagato: resterà da pagare il netto meno l'acconto. Avvisare il consulente del lavoro dell'acconto dato.
          {(dati.acconti || []).filter(a => a.dipendente_id === persona.id).length > 0 && <div style={{ marginTop: 4 }}>Acconti già dati senza cedolino: {(dati.acconti || []).filter(a => a.dipendente_id === persona.id).map(a => `${meseIt(a.mese)} ${a.anno} ${euro(a.importo)} (${a.codice || ""})`).join("; ")}.</div>}</div>}
        <div style={{ gridColumn: "1 / -1", fontSize: 12.5, color: C.muted }}>TFR e anticipi sul TFR passano dalla busta paga (il consulente applica la tassazione separata): si pagano da «Con busta paga». Le prestazioni occasionali di chi non è dipendente si pagano da «Professionisti con ritenuta».</div>
      </div>}
    </div>}
    {persona && (scelte.length > 0 || strada === "senza") && <div style={{ ...scheda, border: `2px solid ${C.primary}` }}>
      <div style={{ fontWeight: 800, color: C.primary, fontSize: 15, marginBottom: 8 }}>Il pagamento: {persona.nome}, totale {euro(totale)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        <label style={L}>1. Come si paga<select style={sel(!v.modalita)} value={v.modalita} onChange={e => { cambia("modalita", e.target.value); cambia("conto_id", ""); }}>
          <option value="">— scegliere —</option>{MODALITA_STIPENDI.map(m => <option key={m}>{m}</option>)}</select>
          <span style={{ fontWeight: 400, color: C.muted }}>Contanti non ammessi per stipendi e compensi (legge 205/2017, commi 910–913). L'assegno va emesso non trasferibile.</span></label>
        <label style={L}>2. Da quale conto<select style={sel(!v.conto_id)} value={v.conto_id} disabled={!v.modalita} onChange={e => cambia("conto_id", e.target.value)}>
          <option value="">{v.modalita ? "— scegliere —" : "prima scegliere come si paga"}</option>{adatti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
        <label style={L}>3. {assegno ? "Data di consegna dell'assegno" : "Data di addebito in banca"}<input type="date" style={sel(!v.data_disposizione)} value={v.data_disposizione} onChange={e => cambia("data_disposizione", e.target.value)} />
          {v.data_disposizione !== oggi && bonifico && <span style={{ color: C.yellow, fontWeight: 700 }}>Non è oggi: disporre in banca lo stesso giorno in cui si registra qui.</span>}</label>
        {bonifico && <div style={{ ...L, gridColumn: "1 / -1" }}>4. IBAN della persona
          <input style={sel(!ib || !ibanValido(ib))} value={v.iban_scritto} onChange={e => { cambia("iban_scritto", e.target.value); cambia("iban_confermato", false); }} placeholder="IT00 X000 0000 0000 0000 0000 000" />
          <span style={{ fontWeight: 400, color: C.muted }}>{persona.iban ? "IBAN della scheda della persona." : persona.iban_ultimo ? "Preso dall'ultimo bonifico fatto a questa persona: confermarlo; resterà nella sua scheda." : "Nessun IBAN: scriverlo e confermarlo per telefono con la persona; resterà nella sua scheda."}</span>
          {ib && !ibanValido(ib) && <span style={{ color: C.red }}>IBAN non valido: forma o cifre di controllo sbagliate.</span>}
          {ibanCambiato && <label style={{ ...L, color: C.red }}>IBAN diverso da quello conosciuto ({ibanBello(ibanNoto)}): motivo del cambio (obbligatorio; resta nello storico della persona)
            <input style={{ ...sel(v.iban_motivo.trim().length < 5), maxWidth: 520 }} value={v.iban_motivo} onChange={e => cambia("iban_motivo", e.target.value)} placeholder="es. nuovo conto comunicato per iscritto il 20/11/2026" /></label>}
          {ib && ibanValido(ib) && <div><button style={btn(!!v.iban_confermato, C.green)} onClick={() => cambia("iban_confermato", true)}>{v.iban_confermato ? `✔ IBAN confermato: ${ibanBello(ib)}` : "Confermi IBAN"}</button></div>}</div>}
        {assegno && <>
          <label style={L}>4. Numero dell'assegno<input style={sel(!v.assegno_numero.trim())} value={v.assegno_numero} onChange={e => cambia("assegno_numero", e.target.value)} /></label>
          <label style={L}>5. Consegnato a<select style={sel(false)} value={v.consegnato_a} onChange={e => cambia("consegnato_a", e.target.value)}>
            <option value="lavoratore">Al lavoratore</option><option value="delegato">A un delegato (lavoratore impedito)</option></select></label>
          {v.consegnato_a === "delegato" && <>
            <label style={L}>Nome del delegato<input style={sel(!v.delegato_nome.trim())} value={v.delegato_nome} onChange={e => cambia("delegato_nome", e.target.value)} /></label>
            <label style={L}>Parentela<select style={sel(!v.delegato_parentela)} value={v.delegato_parentela} onChange={e => cambia("delegato_parentela", e.target.value)}>
              <option value="">— scegliere —</option>{PARENTELE.map(x => <option key={x}>{x}</option>)}</select></label></>}
        </>}
        <div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: 12, fontWeight: 700 }}>{bonifico ? "Causale del bonifico (composta dal programma, non si modifica; si può solo aggiungere)" : "Descrizione"} <Contatore testo={causale} /></div>
          <div style={{ fontFamily: "monospace", fontSize: 13, background: "#F4F4F0", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", margin: "4px 0", wordBreak: "break-all" }}>{causale || "—"}</div>
          <label style={L}>Aggiunta in coda (facoltativa)<input style={{ ...sel(false), maxWidth: 520 }} value={v.aggiunta} onChange={e => cambia("aggiunta", e.target.value)} /></label></div>
        <label style={{ ...L, gridColumn: "1 / -1" }}>Nota interna (facoltativa)<input style={sel(false)} value={v.note} onChange={e => cambia("note", e.target.value)} /></label>
      </div>
      {totale > 5000 && <label style={{ display: "block", marginTop: 8, color: C.red, fontWeight: 700, fontSize: 13 }}><input type="checkbox" checked={v.soglia_vista} onChange={e => cambia("soglia_vista", e.target.checked)} /> Ho visto: sopra 5.000 €. Sarà segnalato al Dott. Bizzarri e a Teresa Demaria.</label>}
      {problemi.length > 0 && <div style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>Per confermare: {problemi.join("; ")}.</div>}
      {errore && <div style={{ color: C.red, fontWeight: 700, marginTop: 8 }}>⚠️ {errore}</div>}
      <div style={{ marginTop: 10 }}><button style={btn(true)} disabled={!!problemi.length || lavoro} onClick={invia}>{lavoro ? "Registro…" : "Conferma e manda in pagamento"}</button></div>
    </div>}
  </>;
}

// ---------------- F24 (versione 396) ----------------
// Ordini del Dott. Bizzarri del 24/11/2026: 08:55 (pulsante «F24» come per fatture e stipendi), 09:04 (tutti i modi di pagamento),
// 09:58 (si sceglie l'F24 da pagare, con il protocollo interno). Le regole le controlla il database (ci_f24_disponi):
// saldo zero o compensazioni → solo i servizi dell'Agenzia delle Entrate; saldo zero → nessun movimento in banca;
// si paga solo da un conto di banca. La quietanza si carica da «F24 e quietanze arrivati»: lì l'F24 passa a «Pagato».
const MODI_F24 = [
  { id: "Agenzia tramite intermediario (Entratel)", agenzia: true, nota: "lo presenta lo Studio con Entratel; l'addebito arriva sul conto della società" },
  { id: "Agenzia direttamente (F24 web)", agenzia: true, nota: "lo presenta la società con i servizi online dell'Agenzia (Fisconline)" },
  { id: "Home banking della banca", agenzia: false, nota: "solo senza compensazioni e con saldo maggiore di zero" },
  { id: "Poste o altro intermediario convenzionato", agenzia: false, nota: "solo senza compensazioni e con saldo maggiore di zero" },
];
function SezioneF24({ base, fatto, oggi, vaiA }) {
  const [elenco, setElenco] = useState(null);
  const [scelto, setScelto] = useState(null);
  const [v, setV] = useState({ modo: "", conto_id: "", data_disposizione: oggi, soglia_vista: false });
  const [lavoro, setLavoro] = useState(false); const [errore, setErrore] = useState(""); const [avviso, setAvviso] = useState("");
  const [vista, setVista] = useState(null);
  const [annulla, setAnnulla] = useState({ id: null, motivo: "" });
  const cambia = (k, x) => setV(o => ({ ...o, [k]: x }));
  useEffect(() => { (async () => {
    const { data, error } = await supabase.rpc("ci_f24_per_pagamento");
    if (error) { setErrore("Lettura degli F24 non riuscita: " + error.message); setElenco([]); return; }
    setElenco(data || []);
  })(); }, []);
  useEffect(() => () => { if (vista?.url) URL.revokeObjectURL(vista.url); }, [vista]);
  if (!elenco) return <div style={scheda}>Lettura degli F24…</div>;
  const daPagare = elenco.filter(f => f.stato === "Da pagare");
  const disposti = elenco.filter(f => f.stato === "Disposto");
  const f = daPagare.find(x => x.id === scelto) || null;
  const saldo = f ? Number(f.saldo) : 0;
  const soloAgenzia = f && (saldo === 0 || Number(f.totale_credito) > 0);
  const modo = MODI_F24.find(m => m.id === v.modo);
  const banche = base.conti.filter(c => c.stato === "aperto" && c.tipo === "banca");
  const disp = id => { const s = base.saldi[id]; if (!s) return null; return s.saldo - base.attesa.filter(m => m.conto_id === id && m.verso === "uscita").reduce((t, m) => t + Number(m.importo), 0); };
  const problemi = [];
  if (!f) problemi.push("scegliere l'F24 da pagare");
  if (f && !v.modo) problemi.push("scegliere come si paga");
  if (f && modo && soloAgenzia && !modo.agenzia) problemi.push(saldo === 0 ? "un F24 a saldo zero si presenta solo con i servizi dell'Agenzia delle Entrate" : "un F24 con compensazioni si presenta solo con i servizi dell'Agenzia delle Entrate");
  if (f && saldo > 0 && !v.conto_id) problemi.push("scegliere il conto di banca");
  if (!v.data_disposizione) problemi.push("scrivere la data di disposizione");
  if (saldo > 5000 && !v.soglia_vista) problemi.push("spuntare «Ho visto: sopra 5.000 €»");
  async function apriPdf(x) {
    setAvviso("");
    if (!x.md5_pdf) { setAvviso(`Il PDF di ${x.protocollo_interno} non è salvato nel programma: aprirlo da «4. Carica F24» → «Consulta F24».`); return; }
    const { data, error } = await supabase.storage.from("f24").download(`${x.codice_delega}/F24.pdf`);
    if (error) { setAvviso(`Il PDF di ${x.protocollo_interno} non si apre da qui (${error.message}): aprirlo da «4. Carica F24» → «Consulta F24».`); return; }
    const byte = new Uint8Array(await data.arrayBuffer());
    if (md5(byte) !== x.md5_pdf) { setAvviso(`Il PDF di ${x.protocollo_interno} salvato nel programma non è quello registrato (impronta diversa): non lo apro. Avvisare il Dott. Bizzarri.`); return; }
    if (vista?.url) URL.revokeObjectURL(vista.url);
    setVista({ url: URL.createObjectURL(new Blob([byte], { type: "application/pdf" })), nome: `${x.protocollo_interno} – ${x.codice_delega}` });
  }
  async function invia() {
    if (problemi.length || lavoro) return; setLavoro(true); setErrore("");
    const p = { f24_id: f.id, modo_pagamento: v.modo, data_disposizione: v.data_disposizione, conto_id: saldo > 0 ? Number(v.conto_id) : "" };
    const { data, error } = await supabase.rpc("ci_f24_disponi", { p });
    setLavoro(false);
    if (error) return setErrore("Il database non l'ha accettato, non è stato registrato niente: " + error.message);
    const conto = banche.find(c => c.id === Number(v.conto_id));
    fatto({ titolo: `${data.protocollo_interno}: F24 mandato in pagamento — «Disposto»${data.codice_attesa ? `, movimento ${data.codice_attesa} in attesa della banca` : ""}`,
      testo: saldo > 0
        ? `Adesso presentare l'F24 (${v.modo}). L'addebito su ${conto?.nome || "la banca"} prenderà il numero di prima nota alla conferma dell'estratto. Quando arriva la quietanza, caricarla da «4. Carica F24» → «F24 e quietanze arrivati»: l'F24 passa a «Pagato».`
        : `F24 a saldo zero: nessun movimento in banca e niente in prima nota. Adesso presentarlo (${v.modo}); quando arriva la quietanza, caricarla da «4. Carica F24» → «F24 e quietanze arrivati»: l'F24 passa a «Pagato».`,
      copie: [["Protocollo interno", data.protocollo_interno], ["Codice delega", data.codice_delega], ["Saldo", importoIt(saldo)], ["Data", dataIt(v.data_disposizione)]] });
  }
  async function annullaSaldoZero(x) {
    if (!annulla.motivo.trim() || lavoro) return; setLavoro(true); setErrore("");
    const { error } = await supabase.rpc("ci_f24_annulla_disposizione", { p_f24: x.id, p_motivo: annulla.motivo.trim() });
    setLavoro(false);
    if (error) return setErrore("Il database non l'ha accettato, non è cambiato niente: " + error.message);
    fatto({ titolo: `${x.protocollo_interno}: disposizione annullata — torna «Da pagare»`, testo: `Motivo: ${annulla.motivo.trim()}.` });
  }
  const riga = { padding: "5px 8px", borderBottom: `1px solid ${C.border}` };
  return <div style={{ ...scheda, border: `2px solid ${C.primary}` }}>
    <div style={{ fontWeight: 800, color: C.primary, fontSize: 15, marginBottom: 4 }}>F24</div>
    <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>Si sceglie l'F24 da pagare (con il suo protocollo interno), come si paga e da quale conto, poi «Conferma e manda in pagamento».
      Un F24 con saldo maggiore di zero fa nascere il movimento della banca in attesa; un F24 a saldo zero non tocca la banca. La quietanza si carica da «4. Carica F24» → «F24 e quietanze arrivati»: l'F24 passa a «Pagato».</div>
    {errore && <div style={{ color: C.red, fontWeight: 700, marginBottom: 8 }}>⚠️ {errore}</div>}
    {avviso && <div style={{ color: C.yellow, fontWeight: 700, marginBottom: 8 }}>{avviso} {vaiA && <button style={btn(false)} onClick={() => vaiA("consulta-f24")}>Vai a «Consulta F24»</button>}</div>}
    <div style={{ fontWeight: 700, margin: "6px 0" }}>F24 da pagare ({daPagare.length})</div>
    {!daPagare.length ? <div style={{ color: C.green }}>Nessun F24 da pagare. Gli F24 entrano nel programma da «4. Carica F24» → «F24 e quietanze arrivati».</div> :
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
      <thead><tr style={{ textAlign: "left" }}>{["", "Protocollo e delega", "Che cosa", "Scadenza", "Debito", "Crediti in compensazione", "Saldo da pagare", "PDF"].map(h => <th key={h} style={riga}>{h}</th>)}</tr></thead>
      <tbody>{daPagare.map(x => { const scaduto = x.data_scadenza < oggi;
        return <tr key={x.id} style={{ background: x.id === scelto ? `${C.primary}18` : "transparent" }}>
          <td style={riga}><input type="radio" checked={x.id === scelto} onChange={() => { setScelto(x.id); setV(o => ({ ...o, modo: "", conto_id: "", soglia_vista: false, data_disposizione: x.data_scadenza > oggi ? x.data_scadenza : oggi })); }} /></td>
          <td style={riga}><b>{x.protocollo_interno}</b><div style={{ fontSize: 11, color: C.muted }}>{x.codice_delega}</div></td>
          <td style={riga}>{x.oggetto}</td>
          <td style={{ ...riga, color: scaduto ? C.red : undefined, fontWeight: scaduto ? 700 : 400 }}>{dataIt(x.data_scadenza)}{scaduto ? " (scaduto)" : ""}</td>
          <td style={riga}>{euro(Number(x.totale_debito))}</td><td style={riga}>{Number(x.totale_credito) > 0 ? euro(Number(x.totale_credito)) : "—"}</td>
          <td style={{ ...riga, fontWeight: 700 }}>{euro(Number(x.saldo))}{Number(x.saldo) === 0 ? " (saldo zero)" : ""}</td>
          <td style={riga}><button style={btn(false)} onClick={() => apriPdf(x)}>Apri il PDF</button></td></tr>; })}</tbody>
    </table>}
    {f && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginTop: 12 }}>
      <label style={L}>1. Come si paga {f.protocollo_interno}
        <select style={sel(!v.modo || (modo && soloAgenzia && !modo.agenzia))} value={v.modo} onChange={e => cambia("modo", e.target.value)}>
          <option value="">— scegliere —</option>
          {MODI_F24.map(m => <option key={m.id} value={m.id} disabled={soloAgenzia && !m.agenzia}>{m.id}{soloAgenzia && !m.agenzia ? " — non ammesso per questo F24" : ""}</option>)}</select>
        {modo && <span style={{ fontWeight: 400, color: C.muted }}>{modo.nota}</span>}
        {soloAgenzia && <span style={{ fontWeight: 400, color: C.muted }}>{saldo === 0 ? "Saldo zero" : "Compensazioni con crediti"}: si presenta solo con i servizi dell'Agenzia delle Entrate.</span>}</label>
      {saldo > 0 ? <label style={L}>2. Da quale conto di banca
        <select style={sel(!v.conto_id)} value={v.conto_id} onChange={e => cambia("conto_id", e.target.value)}>
          <option value="">— scegliere —</option>
          {banche.map(c => { const d = disp(c.id); return <option key={c.id} value={c.id}>{c.nome}{d !== null ? ` — disponibile ${euro(d)}` : ""}</option>; })}</select>
        {v.conto_id && disp(Number(v.conto_id)) !== null && disp(Number(v.conto_id)) < saldo && <span style={{ color: C.red, fontWeight: 700 }}>Il disponibile non copre il saldo dell'F24.</span>}</label>
        : <div style={{ ...L, fontWeight: 400 }}>2. Conto: nessuno. A saldo zero non si paga niente in banca e non nasce nessun movimento.</div>}
      <label style={L}>3. Data di disposizione<input type="date" style={sel(!v.data_disposizione)} value={v.data_disposizione} onChange={e => cambia("data_disposizione", e.target.value)} />
        <span style={{ fontWeight: 400, color: C.muted }}>Il giorno in cui la banca addebita l'F24 (di solito la scadenza): la conferma dell'estratto cerca l'addebito da 2 giorni prima a 15 giorni dopo questa data.</span>
        {v.data_disposizione && f.data_scadenza && v.data_disposizione > f.data_scadenza && <span style={{ color: C.red, fontWeight: 700 }}>Dopo la scadenza del {dataIt(f.data_scadenza)}.</span>}</label>
    </div>}
    {f && saldo > 5000 && <label style={{ display: "block", marginTop: 8, color: C.red, fontWeight: 700, fontSize: 13 }}><input type="checkbox" checked={v.soglia_vista} onChange={e => cambia("soglia_vista", e.target.checked)} /> Ho visto: sopra 5.000 €. Sarà segnalato al Dott. Bizzarri e a Teresa Demaria.</label>}
    {f && problemi.length > 0 && <div style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>Per confermare: {problemi.join("; ")}.</div>}
    {f && <div style={{ marginTop: 10 }}><button style={btn(true)} disabled={!!problemi.length || lavoro} onClick={invia}>{lavoro ? "Registro…" : "Conferma e manda in pagamento"}</button></div>}
    <div style={{ fontWeight: 700, margin: "16px 0 6px" }}>F24 disposti: in attesa della quietanza ({disposti.length})</div>
    {!disposti.length ? <div style={{ color: C.muted, fontSize: 12.5 }}>Nessuno.</div> :
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
      <thead><tr style={{ textAlign: "left" }}>{["Protocollo e delega", "Che cosa", "Saldo", "Come", "Disposto il", "Movimento della banca", ""].map(h => <th key={h} style={riga}>{h}</th>)}</tr></thead>
      <tbody>{disposti.map(x => <tr key={x.id}>
        <td style={riga}><b>{x.protocollo_interno}</b><div style={{ fontSize: 11, color: C.muted }}>{x.codice_delega}</div></td><td style={riga}>{x.oggetto}</td>
        <td style={riga}>{euro(Number(x.saldo))}</td><td style={riga}>{x.modo_pagamento}</td><td style={riga}>{dataIt(x.data_disposizione)}</td>
        <td style={riga}>{x.codice_attesa ? `${x.codice_attesa} su ${x.conto}` : "nessuno (saldo zero)"}</td>
        <td style={riga}><span style={{ color: C.yellow, fontWeight: 700 }}>In attesa della quietanza</span>{vaiA && <div><button style={btn(false)} onClick={() => vaiA("f24-arrivati")}>Carica la quietanza</button></div>}
          {!x.codice_attesa && (annulla.id === x.id
            ? <div style={{ marginTop: 4 }}><input style={sel(!annulla.motivo.trim())} placeholder="Motivo dell'annullamento" value={annulla.motivo} onChange={e => setAnnulla({ id: x.id, motivo: e.target.value })} />
                <button style={btn(true, C.red)} disabled={!annulla.motivo.trim() || lavoro} onClick={() => annullaSaldoZero(x)}>Annulla la disposizione</button>
                <button style={btn(false)} onClick={() => setAnnulla({ id: null, motivo: "" })}>Lascia stare</button></div>
            : <div><button style={btn(false)} onClick={() => setAnnulla({ id: x.id, motivo: "" })}>Disposto per errore?</button></div>)}</td></tr>)}</tbody>
    </table>}
    <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Un F24 disposto per errore torna «Da pagare» annullando il suo movimento in «In attesa della banca», con il motivo; a saldo zero (nessun movimento) con «Disposto per errore?» qui sopra. Un F24 già «Pagato» non si annulla.</div>
    {vista && <div style={{ marginTop: 12 }}><div style={{ fontWeight: 700 }}>{vista.nome} <button style={btn(false)} onClick={() => setVista(null)}>Chiudi</button></div>
      <iframe title={vista.nome} src={vista.url} style={{ width: "100%", height: 700, border: `1px solid ${C.border}` }} /></div>}
  </div>;
}

// ---------------- Giroconti ----------------
const MODALITA_GIRO = { "Prelievo di contanti": "Carta di debito", "Versamento in banca": "Contanti", "Ricarica carta prepagata": "Carta prepagata", "Addebito della carta di credito": "Addebito diretto SEPA", "Giroconto tra conti di banca": "Bonifico" };
function SezioneGiroconti({ base, fatto, oggi }) {
  const [v, setV] = useState({ voce: "", da: "", a: "", importo: "", data: oggi, note: "", contanti_persona: "" });
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
  // versione 401: il lato della cassa è definitivo subito e passa dai contanti in carico di una persona
  const conCassa = [da, a].some(c => c?.tipo === "cassa");
  if (conCassa && !v.contanti_persona) problemi.push("scegliere chi ha i contanti in mano");
  if (conCassa && v.data && v.data > oggi) problemi.push("con la cassa la data non può essere nel futuro");
  if (v.voce === "Versamento in banca" && da && a && !(da.tipo === "cassa" && a.tipo === "banca")) problemi.push("il versamento va dalla cassa alla banca");
  if (v.voce === "Ricarica carta prepagata" && a && a.tipo !== "carta prepagata") problemi.push("la ricarica va verso una carta prepagata");
  if (v.voce === "Addebito della carta di credito" && a && a.tipo !== "carta di credito") problemi.push("l'addebito va verso la carta di credito");
  if (v.voce === "Giroconto tra conti di banca" && da && a && !(da.tipo === "banca" && a.tipo === "banca")) problemi.push("il giroconto tra banche va da una banca a un'altra");
  if ([da, a].some(c => c?.tipo === "cassa" && !conPartenza(c.id))) problemi.push("la cassa non ha ancora il saldo di partenza");
  if (!imp) problemi.push("scrivere l'importo");
  return <div style={{ ...scheda, border: `2px solid ${C.primary}` }}>
    <div style={{ fontWeight: 800, color: C.primary, fontSize: 15 }}>Giroconto</div>
    <div style={{ fontSize: 12.5, color: C.muted, margin: "4px 0 10px" }}>Soldi che passano da un conto di Podere Verde a un altro: prelievo, versamento, ricarica della carta, addebito della carta di credito, giroconto tra banche. Nascono due movimenti, uno per conto (G-0001-U uscita, G-0001-E entrata); ognuno si conferma con il suo estratto. Il lato della cassa (prelievo o versamento) è definitivo subito e passa dai contanti in carico della persona scelta. Mai costo né ricavo.</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
      <label style={L}>Tipo<select style={sel(!v.voce)} value={v.voce} onChange={e => cambia("voce", e.target.value)}><option value="">— scegliere —</option>{vociDellaSezione(base.causali, "giroconti", "Giroconti").map(c => <option key={c.voce}>{c.voce}</option>)}</select></label>
      <label style={L}>Da (esce)<select style={sel(!v.da)} value={v.da} onChange={e => cambia("da", e.target.value)}><option value="">— scegliere —</option>{aperti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <label style={L}>A (entra)<select style={sel(!v.a)} value={v.a} onChange={e => cambia("a", e.target.value)}><option value="">— scegliere —</option>{aperti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <label style={L}>Importo (€)<input style={sel(!imp)} value={v.importo} onChange={e => cambia("importo", e.target.value)} /></label>
      <label style={L}>Data di disposizione<input type="date" style={sel(!v.data)} value={v.data} onChange={e => cambia("data", e.target.value)} /></label>
      <label style={L}>Nota interna (facoltativa)<input style={sel(false)} value={v.note} onChange={e => cambia("note", e.target.value)} /></label>
      {conCassa && <SceltaContanti verso={da?.tipo === "cassa" ? "uscita" : "entrata"} v={v} cambia={cambia} importo={imp} />}
    </div>
    {problemi.length > 0 && <div style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>Per confermare: {problemi.join("; ")}.</div>}
    {errore && <div style={{ color: C.red, fontWeight: 700, marginTop: 8 }}>⚠️ {errore}</div>}
    <div style={{ marginTop: 10 }}><button style={btn(true)} disabled={!!problemi.length || lavoro} onClick={async () => {
      setLavoro(true); setErrore("");
      const { data, error } = await supabase.rpc("ci_disponi_giroconto_401", { p: { conto_da: da.id, conto_a: a.id, importo: imp, data_disposizione: v.data, causale_voce: v.voce, modalita: MODALITA_GIRO[v.voce] || "Altro", note: v.note, ...(conCassa ? { contanti_persona: v.contanti_persona } : {}) } });
      setLavoro(false); if (error) return setErrore("Il database non l'ha accettato: " + error.message);
      fatto({ titolo: `${data.codice_attesa}: giroconto registrato — ${data.lato_cassa_definitivo ? "lato della cassa definitivo, lato della banca in attesa" : "in attesa della banca"}`, testo: `${v.voce} di ${euro(imp)} da ${da.nome} a ${a.nome}. ${data.lato_cassa_definitivo ? "Il lato della cassa è già in prima nota con il numero; il lato della banca si conferma con il suo estratto in «Conferma dei movimenti»." : "Ognuno dei due lati si conferma con il suo estratto in «Conferma dei movimenti»."}` });
    }}>{lavoro ? "Registro…" : "Conferma il giroconto"}</button></div>
  </div>;
}

// ---------------- In attesa della banca ----------------
function InAttesa({ base, oggi, fatto, ricarica }) {
  const [annulla, setAnnulla] = useState(null); const [motivo, setMotivo] = useState(""); const [errore, setErrore] = useState(""); const [lavoro, setLavoro] = useState(false);
  const elenco = [...base.attesa].sort((a, b) => (a.data_disposizione || a.data).localeCompare(b.data_disposizione || b.data) || a.id - b.id);
  const fatture = id => base.abbinamenti.filter(x => x.pagamento_id === id).map(x => { const s = base.scadenze.find(y => y.scadenza_id === x.scadenza_id); return s ? `${s.numero_documento} del ${dataIt(s.data_documento)} (${euro(x.importo)})` : `scadenza ${x.scadenza_id}`; });
  return <div style={scheda}>
    <div style={{ fontWeight: 800, color: C.blue, marginBottom: 4 }}>In attesa della banca ({elenco.length})</div>
    <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>Disposizioni non ancora trovate nell'estratto della banca. Si confermano in «Banche, carte e cassa» → «Conferma dei movimenti» dopo aver caricato l'estratto. Avviso in rosso: stipendi, compensi e tributi dopo 3 giorni lavorativi; gli altri dopo 10; subito se la banca è già caricata 2 giorni lavorativi oltre la data e il movimento non c'è.</div>
    {!elenco.length && <div style={{ color: C.green }}>Nessun movimento in attesa.</div>}
    {elenco.length > 0 && <div style={{ overflowX: "auto" }}><table style={{ width: "100%", fontSize: 12.5, background: "#fff" }}><thead><tr style={{ background: C.blue, color: "#fff" }}>
      {["Codice", "Disposto il", "Conto", "Uscita", "Entrata", "Soggetto", "Causale contabile", "Modalità", "Causale / fatture", "Avviso", "Distinta (versione 401)", ""].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
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
          <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{m.verso === "uscita" && ["Bonifico", "Bonifico istantaneo"].includes(m.modalita) && !/^S-/.test(m.codice_attesa || "") ? <>
            {m.distinta_id ? <div style={{ color: C.green, fontWeight: 700, fontSize: 11.5 }}>✔ pagato: distinta caricata</div> : <div style={{ color: C.yellow, fontWeight: 700, fontSize: 11.5 }}>manca la distinta</div>}
            <PulsanteDistinta movimento={m} distinte={base.distinte || {}} onCambiato={ricarica} />
            <button style={{ ...btn(false), height: 24, fontSize: 11, padding: "0 8px", marginLeft: 4 }} onClick={() => scaricaWordPagamento({ codice: m.codice_attesa, beneficiario: m.controparte, iban: m.iban_beneficiario ? ibanBello(m.iban_beneficiario) : "",
              importo: "€ " + importoIt(m.importo), causale: m.causale, data: dataIt(m.data_disposizione), conto: m.conto, modalita: m.modalita, fatture: fatture(m.id) })}>📄 Word</button></> : ""}</td>
          <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{/^S-/.test(m.codice_attesa || "") ? <span style={{ fontSize: 11.5, color: C.muted }}>dall'app: le spese si annullano in «Spese pagate: controllo»; i prelievi si correggono con la versione 383</span> /* versione 382 */ : <button style={btn(false, C.red)} onClick={() => { setAnnulla(m); setMotivo(""); setErrore(""); }}>Annulla</button>}</td></tr>,
          annulla?.id === m.id && <tr key={"a" + m.id}><td colSpan={12} style={{ padding: 10, borderBottom: `2px solid ${C.red}` }}>
            Annullare <b>{m.codice_attesa}</b> di {euro(m.importo)}? Si fa solo se in banca non è partito (controllare in banca). Il movimento e i suoi abbinamenti alle fatture escono (la nota di credito dedotta in questo pagamento torna da usare); resta scritto chi l'ha annullato, quando e perché.{m.codice_attesa.startsWith("G-") ? " Si annullano insieme i due lati del giroconto. Se un lato è della cassa, quello è già definitivo (in prima nota con il numero): prima chi gestisce i conti lo storna in «Conferma dei movimenti», poi qui si annulla il lato della banca." : ""}
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}><input style={{ ...input, flex: 1 }} placeholder="motivo (obbligatorio): es. bonifico non autorizzato in banca" value={motivo} onChange={e => setMotivo(e.target.value)} />
              <button style={btn(true, C.red)} disabled={!motivo.trim() || lavoro} onClick={async () => {
                setLavoro(true); const r = await supabase.rpc("ci_annulla_disposizione", { p_movimento: m.id, p_motivo: motivo.trim() }); setLavoro(false);
                if (r.error) return setErrore("Non annullato: " + r.error.message);
                fatto({ titolo: `${m.codice_attesa} annullato`, testo: `Motivo: ${motivo.trim()}. Le fatture tornano da ${m.verso === "uscita" ? "pagare" : "incassare"}.` });
              }}>Conferma l'annullamento</button><button style={btn(false)} onClick={() => setAnnulla(null)}>Lascia stare</button></div>
            {errore && <div style={{ color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>}</td></tr>]; })}</tbody></table></div>}
  </div>;
}
