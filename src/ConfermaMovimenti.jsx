import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
import { dataIt, euro } from "./analisiDocumentoBanca";
import { MODALITA, propostaPerMovimento, propostaPerRiga, abbina, nomeDellaRiga, soggettoPerNome, fatturePerRiga } from "./propostePrimaNota";

// Versione 354 — «Banche, carte e cassa» → «Conferma dei movimenti».
// Ogni riga della banca deve avere il suo movimento di prima nota. Il programma propone (movimento già nel programma con stesso conto,
// verso, importo e data; oppure gruppo, voce, modalità e soggetto riconosciuti dalla descrizione); l'operatore conferma o cambia.
// Alla conferma il database dà il numero di prima nota (2026/000001), senza buchi; prima del 2026 collega senza numero.
// Versione 357: i movimenti disposti da «Gestione incassi e pagamenti» (codice P-0001) si trovano anche se la banca li addebita
// qualche giorno dopo; per le righe senza movimento il programma riconosce il soggetto dall'anagrafica e propone le fatture aperte
// da chiudere: l'abbinamento nasce solo quando l'operatore conferma.
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const STATI = {
  confermata: { nome: "Confermata", colore: C.green },
  univoca: { nome: "Da confermare: movimento trovato", colore: C.yellow },
  "da scegliere": { nome: "Da confermare: più movimenti uguali", colore: C.yellow },
  completa: { nome: "Da confermare: proposta completa", colore: C.yellow },
  parziale: { nome: "Da completare", colore: C.red },
  "da classificare": { nome: "Da classificare", colore: C.red },
};

export default function ConfermaMovimenti() {
  const [base, setBase] = useState(null);
  const [contoId, setContoId] = useState(1);
  const [anno, setAnno] = useState(2026);
  const [mese, setMese] = useState(0);
  const [dati, setDati] = useState(null);
  const [scelte, setScelte] = useState({});     // riga_id → { movimento_id?, causale_gruppo, causale_voce, causale_altro, modalita, modalita_altro, controparte, movimento_collegato_id }
  const [filtro, setFiltro] = useState("da fare");
  const [aperta, setAperta] = useState(null);
  const [lavoro, setLavoro] = useState("");
  const [esito, setEsito] = useState(null);
  const [errore, setErrore] = useState("");
  const [gestore, setGestore] = useState(false);
  const [correzione, setCorrezione] = useState(null);   // { movimento, tipo: "storno" | "scollega", motivo }
  const lettura = useRef(0);

  useEffect(() => { (async () => {
    supabase.rpc("ci_puo_gestire_conti").then(g => setGestore(g.data === true));
    const [c, k, s, fo, cl, sc] = await Promise.all([
      supabase.from("ci_conti").select("id, nome, tipo, banca_o_emittente, stato").order("id"),
      supabase.from("ci_causali_contabili").select("gruppo, voce, ordine").order("ordine"),
      supabase.from("ci_v_stato_conti").select("*"),
      fetchAllPages((a, b) => supabase.from("ci_fornitori").select("id, nome").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_clienti").select("id, nome").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_v_scadenzario").select("scadenza_id, lato, fornitore_id, cliente_id, numero_documento, data_documento, importo, residuo, in_attesa_della_banca")
        .gt("residuo", 0.005).gt("importo", 0).order("scadenza_id").range(a, b)),
    ]);
    const e = c.error || k.error || s.error || fo.error || cl.error || sc.error; if (e) { setErrore("Lettura non riuscita: " + e.message); return; }
    setBase({ conti: (c.data || []).filter(x => x.tipo !== "cassa" && (s.data || []).some(y => y.conto_id === x.id && y.partenza_alla_data)), causali: k.data || [], stati: s.data || [],
      fornitori: fo.data || [], clienti: cl.data || [], aperte: (sc.data || []).filter(x => x.scadenza_id) });
  })(); }, []);

  async function leggi(tieniEsito = false) {
    const mia = ++lettura.current;
    setErrore(""); setDati(null); if (!tieniEsito) setEsito(null); setAperta(null); setCorrezione(null);
    const dal = mese ? `${anno}-${String(mese).padStart(2, "0")}-01` : `${anno}-01-01`;
    const al = mese ? new Date(Date.UTC(anno, mese, 0)).toISOString().slice(0, 10) : `${anno}-12-31`;
    const [r, d, m] = await Promise.all([
      fetchAllPages((a, b) => supabase.from("ci_righe_fonte").select("id, documento_id, conto_id, data_contabile, data_valuta, verso, importo, descrizione, numero_bonifico, controparte, pagina_pdf")
        .eq("conto_id", contoId).gte("data_contabile", dal).lte("data_contabile", al).order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_documenti_fonte").select("id, annullato_il").eq("conto_id", contoId).order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_pagamenti_fatture").select("id, conto_id, data, verso, importo, genere, controparte, causale, numero_bonifico, istantaneo, riga_fonte_id, confermato_il, esercizio, progressivo, causale_gruppo, causale_voce, causale_altro, modalita, modalita_altro, natura, stornato_il, riga_stornata_id, codice_attesa, data_disposizione, fornitore_id, cliente_id")
        .eq("conto_id", contoId).order("id").range(a, b)),
    ]);
    if (mia !== lettura.current) return;   // nel frattempo è stato scelto un altro conto o periodo
    for (const x of [r, d, m]) if (x.error) { setErrore("Lettura non riuscita: " + x.error.message); return; }
    const vivi = new Set((d.data || []).filter(x => !x.annullato_il).map(x => x.id));
    const righe = (r.data || []).filter(x => vivi.has(x.documento_id)).sort((a, b) => a.data_contabile.localeCompare(b.data_contabile) || a.id - b.id);
    const movimenti = m.data || [];
    const conto = base.conti.find(c => c.id === contoId);
    const perRiga = new Map(movimenti.filter(x => x.riga_fonte_id && x.confermato_il).map(x => [x.riga_fonte_id, x]));
    // collegati senza conferma (prima della versione 354): si propongono con quel movimento
    const giaCollegati = new Map(movimenti.filter(x => x.riga_fonte_id && !x.confermato_il).map(x => [x.riga_fonte_id, x]));
    const abb = abbina(righe.filter(x => !perRiga.has(x.id) && !giaCollegati.has(x.id)), movimenti.filter(x => !x.riga_fonte_id));
    for (const [rid, mv] of giaCollegati) abb.set(rid, { tipo: "univoca", candidati: [mv] });
    const nuoveScelte = {};
    const elenco = righe.map(x => {
      const conf = perRiga.get(x.id);
      if (conf) return { riga: x, stato: "confermata", movimento: conf };
      const a = abb.get(x.id);
      if (a.tipo === "univoca") { nuoveScelte[x.id] = { movimento_id: a.candidati[0].id, ...propostaPerMovimento(a.candidati[0]) }; return { riga: x, stato: "univoca", candidati: a.candidati }; }
      if (a.tipo === "da scegliere") { nuoveScelte[x.id] = { movimento_id: "", ...propostaPerMovimento(a.candidati[0]) }; return { riga: x, stato: "da scegliere", candidati: a.candidati }; }
      const p = propostaPerRiga(x, conto, movimenti); const sc = { ...p, movimento_id: undefined, fornitore_id: "", cliente_id: "", scadenze: [] };
      // soggetto dall'anagrafica e fatture aperte (solo proposta)
      if (x.data_contabile >= "2026-01-01" && (p.causale_gruppo === "Fatture" || /^(DISPOSIZIONE|BONIFICO)/i.test(x.descrizione || ""))) {
        const lato = x.verso === "uscita" ? "fornitore" : "cliente";
        const sog = soggettoPerNome(nomeDellaRiga(x), lato === "fornitore" ? base.fornitori : base.clienti);
        if (sog) {
          sc[lato === "fornitore" ? "fornitore_id" : "cliente_id"] = sog.id; sc.controparte = sog.nome;
          const f = fatturePerRiga(x, base.aperte, sog.id);
          if (f.scelte.length) { sc.scadenze = f.scelte; if (!sc.causale_gruppo) sc.causale_gruppo = "Fatture"; if (sc.causale_gruppo === "Fatture" && !sc.causale_voce) sc.causale_voce = "Saldo fattura"; }
          sc.perche = `${p.perche ? p.perche + ". " : ""}Soggetto riconosciuto: ${sog.nome}; ${f.perche}.`;
        }
      }
      nuoveScelte[x.id] = sc;
      return { riga: x, stato: sc.causale_gruppo && sc.causale_voce && sc.modalita && sc.controparte ? "completa" : sc.causale_gruppo || sc.modalita ? "parziale" : "da classificare", perche: sc.perche };
    });
    // movimenti del periodo senza riga: in attesa della banca o anomalia (la banca copre già quel giorno)
    const st = base.stati.find(s => s.conto_id === contoId);
    const proposti = new Set([...abb.values()].flatMap(a => (a.candidati || []).map(c => c.id)));
    const senzaRiga = movimenti.filter(x => !x.riga_fonte_id && !x.stornato_il && x.natura !== "STORNO" && !proposti.has(x.id) && x.data >= dal && x.data <= al)
      .map(x => ({ ...x, coperto: st?.controllo_ok_alla_data && x.data <= st.controllo_ok_alla_data }));
    setScelte(nuoveScelte); setDati({ elenco, senzaRiga, conto, dal, al });
  }
  useEffect(() => { if (base) leggi(false).catch(x => setErrore("Lettura non riuscita: " + x.message)); }, [base, contoId, anno, mese]);

  const pronta = (e) => {
    const s = scelte[e.riga.id]; if (!s || e.stato === "confermata") return false;
    if (s.movimento_id !== undefined && !s.movimento_id) return false;
    if (e.riga.data_contabile < "2026-01-01") return s.movimento_id !== undefined;
    if (!s.causale_gruppo || !s.causale_voce || !s.modalita) return false;
    if (s.causale_voce === "Altro" && !String(s.causale_altro || "").trim()) return false;
    if (s.modalita === "Altro" && !String(s.modalita_altro || "").trim()) return false;
    if (s.movimento_id === undefined && !String(s.controparte || "").trim()) return false;
    if (s.movimento_id === undefined && (s.scadenze || []).length) {
      const somma = sommaFatture(s.scadenze); if (somma > Number(e.riga.importo) + 0.005) return false;
    }
    return true;
  };
  const sommaFatture = (ids) => (ids || []).reduce((t, id) => t + Number(base?.aperte.find(a => a.scadenza_id === id)?.residuo || 0), 0);
  const visibili = useMemo(() => (dati?.elenco || []).filter(e => filtro === "tutte" ? true : filtro === "confermate" ? e.stato === "confermata" : e.stato !== "confermata"), [dati, filtro]);
  const conteggi = useMemo(() => (dati?.elenco || []).reduce((t, e) => ((t[e.stato] = (t[e.stato] || 0) + 1), t), {}), [dati]);

  async function conferma(lista) {
    if (lavoro) return;
    const daMandare = lista.filter(pronta).map(e => {
      const s = scelte[e.riga.id];
      if (e.riga.data_contabile < "2026-01-01") return { riga_id: e.riga.id, movimento_id: Number(s.movimento_id) };
      const comuni = { riga_id: e.riga.id, causale_gruppo: s.causale_gruppo, causale_voce: s.causale_voce, causale_altro: s.causale_altro || "", modalita: s.modalita, modalita_altro: s.modalita_altro || "" };
      return s.movimento_id !== undefined ? { ...comuni, movimento_id: Number(s.movimento_id) }
        : { ...comuni, controparte: s.controparte, movimento_collegato_id: s.movimento_collegato_id || "", fornitore_id: s.fornitore_id || "", cliente_id: s.cliente_id || "",
            scadenze: (s.scadenze || []).map(id => ({ scadenza_id: id, importo: Number(base.aperte.find(a => a.scadenza_id === id)?.residuo || 0) })) };
    });
    if (!daMandare.length) { setErrore("Nessuna riga pronta: completare gruppo, voce, modalità e soggetto."); return; }
    const scelti = daMandare.filter(x => x.movimento_id).map(x => x.movimento_id);
    if (new Set(scelti).size !== scelti.length) { setErrore("Lo stesso movimento è stato scelto per due righe della banca: correggere."); return; }
    setLavoro(`Conferma di ${daMandare.length} righe…`); setErrore("");
    const { data, error } = await supabase.rpc("ci_conferma_movimenti", { p: daMandare });
    setLavoro("");
    if (error) { setErrore("Il database ha rifiutato la conferma, nessuna riga è stata confermata: " + error.message); return; }
    const numeri = (data || []).map(x => x.numero).filter(Boolean);
    setEsito(`Confermate ${daMandare.length} righe${numeri.length ? `; numeri di prima nota dal ${numeri[0]} al ${numeri[numeri.length - 1]}` : ""}.`);
    await leggi(true);
  }

  if (errore && !base) return <div style={{ color: C.red }}>{errore}</div>;
  if (!base) return <div>Lettura in corso…</div>;
  const gruppi = [...new Set(base.causali.map(c => c.gruppo))];
  // le righe con fatture da chiudere si confermano una per una (il programma ha proposto soggetto e fatture: le guarda l'operatore)
  const pronte = (dati?.elenco || []).filter(e => e.stato !== "confermata" && pronta(e) && !((scelte[e.riga.id] || {}).scadenze || []).length);
  return (
    <div style={{ maxWidth: 1250 }}>
      <h2 style={{ color: C.primary, margin: "0 0 4px" }}>Conferma dei movimenti della banca</h2>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 10 }}>Ogni riga dell'estratto conto deve avere il suo movimento di prima nota. Il programma propone, l'operatore controlla e conferma. Alla conferma il movimento prende il numero di prima nota (dal 2026) e non si cancella più: un errore si corregge con lo storno.</div>
      <div style={{ ...scheda, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label>Conto <select style={input} value={contoId} onChange={e => setContoId(Number(e.target.value))}>{base.conti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
        <label>Anno <select style={input} value={anno} onChange={e => setAnno(Number(e.target.value))}>{[2023, 2024, 2025, 2026, 2027].map(a => <option key={a}>{a}</option>)}</select></label>
        <label>Mese <select style={input} value={mese} onChange={e => setMese(Number(e.target.value))}><option value={0}>tutto l'anno</option>{MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
        <label>Mostra <select style={input} value={filtro} onChange={e => setFiltro(e.target.value)}><option value="da fare">da confermare</option><option value="confermate">confermate</option><option value="tutte">tutte</option></select></label>
      </div>
      {anno < 2026 && <div style={{ ...scheda, borderLeft: `4px solid ${C.yellow}`, fontSize: 13 }}>La prima nota del programma parte dal 01/01/2026: prima del 2026 si collegano alla banca i movimenti già nel programma, senza numero; le righe senza movimento restano solo nell'estratto.</div>}
      {dati && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0" }}>
        {Object.entries(STATI).map(([k, v]) => <div key={k} style={{ border: `1px solid ${v.colore}`, background: `${v.colore}14`, borderRadius: 8, padding: "5px 10px", fontSize: 12.5 }}><b style={{ color: v.colore }}>{conteggi[k] || 0}</b> {v.nome}</div>)}
        <div style={{ border: `1px solid ${C.blue}`, background: `${C.blue}14`, borderRadius: 8, padding: "5px 10px", fontSize: 12.5 }}><b style={{ color: C.blue }}>{dati.senzaRiga.filter(x => !x.coperto).length}</b> in attesa della banca</div>
        <div style={{ border: `1px solid ${C.red}`, background: `${C.red}14`, borderRadius: 8, padding: "5px 10px", fontSize: 12.5 }}><b style={{ color: C.red }}>{dati.senzaRiga.filter(x => x.coperto).length}</b> anomalie: movimento senza riga in un giorno già caricato</div>
      </div>}
      {esito && <div style={{ ...scheda, borderLeft: `4px solid ${C.green}` }}><b>{esito}</b></div>}
      {errore && <div style={{ ...scheda, borderLeft: `4px solid ${C.red}`, color: C.red }}><b>{errore}</b></div>}
      {dati && pronte.length > 0 && filtro !== "confermate" && <div style={{ ...scheda, display: "flex", gap: 10, alignItems: "center" }}>
        {mese ? <><div style={{ flex: 1, fontSize: 13 }}>Righe pronte di {MESI[mese - 1]} (elencate qui sotto con ✔): <b>{pronte.length}</b>. Controllarle e confermarle insieme, in ordine di data: se una non va, non si conferma nessuna. Un errore dopo la conferma si corregge con lo storno.</div>
          <button style={btn(true)} disabled={!!lavoro} onClick={() => conferma(pronte)}>Conferma le {pronte.length} righe pronte di {MESI[mese - 1]}</button></>
          : <div style={{ fontSize: 13 }}>Righe pronte nell'anno: <b>{pronte.length}</b>. Per confermarle insieme scegliere un mese alla volta e controllarle; oppure confermarle una per una con «Controlla».</div>}
      </div>}
      {lavoro && <div style={{ color: C.blue, fontWeight: 700 }}>{lavoro}</div>}
      {correzione && <div style={{ ...scheda, borderLeft: `4px solid ${C.red}`, fontSize: 13 }}>
        {correzione.tipo === "storno"
          ? <>Stornare il movimento <b>{correzione.movimento.esercizio}/{String(correzione.movimento.progressivo).padStart(6, "0")}</b> ({euro(correzione.movimento.importo)}, {correzione.movimento.controparte || ""})? Nasce uno storno con il numero successivo, stessa data e verso opposto; il movimento resta segnato «stornato» e la riga della banca torna da confermare. Se il movimento era abbinato a una fattura, togliere anche l'abbinamento.</>
          : <>Scollegare il movimento n. {correzione.movimento.id} dalla riga della banca? (senza numero di prima nota: non serve lo storno)</>}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}><input style={{ ...input, flex: 1 }} placeholder="motivo (obbligatorio)" value={correzione.motivo} onChange={x => setCorrezione({ ...correzione, motivo: x.target.value })} />
          <button style={btn(true, C.red)} disabled={!correzione.motivo.trim() || !!lavoro} onClick={async () => {
            if (lavoro) return; setLavoro("Correzione in corso…");
            const r = correzione.tipo === "storno" ? await supabase.rpc("ci_storna_movimento", { p_movimento: correzione.movimento.id, p_motivo: correzione.motivo.trim() })
              : await supabase.rpc("ci_scollega_movimento", { p_movimento: correzione.movimento.id, p_motivo: correzione.motivo.trim() });
            setLavoro("");
            if (r.error) { setErrore("Non fatto: " + r.error.message); return; }
            setEsito(correzione.tipo === "storno" ? `Storno registrato con il numero ${r.data?.numero}. La riga della banca è di nuovo da confermare.` : "Movimento scollegato.");
            await leggi(true).catch(x => setErrore("Lettura non riuscita: " + x.message));
          }}>{correzione.tipo === "storno" ? "Conferma lo storno" : "Conferma lo scollegamento"}</button><button style={btn(false)} onClick={() => setCorrezione(null)}>Lascia stare</button></div></div>}

      {dati && <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, background: "#fff" }}>
        <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Stato", "Data", "Valuta", "Uscita", "Entrata", "Descrizione della banca", "Proposta / movimento", ""].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left" }}>{h}</th>)}</tr></thead>
        <tbody>{visibili.map(e => { const s = scelte[e.riga.id] || {}; const v = STATI[e.stato]; const ok = e.stato !== "confermata" && pronta(e); return [
          <tr key={e.riga.id} style={{ borderBottom: `1px solid ${C.border}`, background: `${v.colore}10` }}>
            <td style={{ padding: "5px 8px", color: v.colore, fontWeight: 800, whiteSpace: "nowrap" }}>{v.nome}{e.stato !== "confermata" && ok ? " ✔" : ""}</td>
            <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{dataIt(e.riga.data_contabile)}</td>
            <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{e.riga.data_valuta ? dataIt(e.riga.data_valuta) : ""}</td>
            <td style={{ padding: "5px 8px", textAlign: "right", color: C.red }}>{e.riga.verso === "uscita" ? euro(e.riga.importo) : ""}</td>
            <td style={{ padding: "5px 8px", textAlign: "right", color: C.green }}>{e.riga.verso === "entrata" ? euro(e.riga.importo) : ""}</td>
            <td style={{ padding: "5px 8px", maxWidth: 380 }}>{e.riga.descrizione}</td>
            <td style={{ padding: "5px 8px" }}>{e.stato === "confermata"
              ? <>{e.movimento.esercizio ? <b>{e.movimento.esercizio}/{String(e.movimento.progressivo).padStart(6, "0")}</b> : "senza numero (prima del 2026)"} — {e.movimento.causale_voce || "—"} — {e.movimento.controparte || ""}</>
              : <>{s.movimento_id !== undefined ? (s.movimento_id ? `movimento del programma n. ${s.movimento_id}` : "scegliere il movimento") : "nuovo movimento dalla riga"}
                  {" — "}{s.causale_voce || <i>voce da scegliere</i>} — {s.modalita || <i>modalità da scegliere</i>} — {s.movimento_id !== undefined ? ((e.candidati || []).find(c => String(c.id) === String(s.movimento_id))?.controparte || "") : (s.controparte || <i>soggetto da scrivere</i>)}
                  {e.perche ? <div style={{ color: C.muted, fontSize: 11.5 }}>{e.perche}</div> : null}</>}</td>
            <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{e.stato !== "confermata" ? <button style={btn(false)} onClick={() => setAperta(aperta === e.riga.id ? null : e.riga.id)}>{aperta === e.riga.id ? "Chiudi" : "Controlla"}</button>
              : gestore && <button style={btn(false, C.red)} onClick={() => setCorrezione({ movimento: e.movimento, tipo: e.movimento.progressivo ? "storno" : "scollega", motivo: "" })}>{e.movimento.progressivo ? "Storna" : "Scollega"}</button>}</td>
          </tr>,
          aperta === e.riga.id && <tr key={"d" + e.riga.id}><td colSpan={8} style={{ padding: 10, background: "#fff", borderBottom: `2px solid ${C.primary}` }}>
            <Modulo e={e} s={s} gruppi={gruppi} causali={base.causali} anno={e.riga.data_contabile.slice(0, 4)} base={base} sommaFatture={sommaFatture}
              cambia={(campo, val) => setScelte(x => {
                if (campo === "movimento_id") { const mv = (e.candidati || []).find(c => String(c.id) === String(val)); return { ...x, [e.riga.id]: mv ? { movimento_id: val, ...propostaPerMovimento(mv) } : { ...x[e.riga.id], movimento_id: "" } }; }
                return { ...x, [e.riga.id]: { ...x[e.riga.id], [campo]: val, ...(campo === "causale_gruppo" ? { causale_voce: "" } : {}) } };
              })} />
            <div style={{ marginTop: 8 }}><button style={btn(true)} disabled={!ok || !!lavoro} onClick={() => conferma([e])}>Conferma questa riga</button>
              {!ok && <span style={{ marginLeft: 8, color: C.red, fontSize: 12.5 }}>Completare i campi in rosso.</span>}</div>
          </td></tr>,
        ]; })}</tbody>
      </table></div>}

      {dati && dati.senzaRiga.length > 0 && <div style={{ ...scheda, marginTop: 12 }}>
        <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>Movimenti del programma senza riga della banca nel periodo</div>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}><tbody>{dati.senzaRiga.map(x => <tr key={x.id} style={{ borderBottom: `1px solid ${C.border}`, color: x.coperto ? C.red : C.blue }}>
          <td style={{ padding: "4px 8px" }}>{x.coperto ? "Anomalia: la banca ha già i movimenti di quel giorno e questo non c'è (data, importo o conto da controllare)" : "In attesa della banca"}</td>
          <td style={{ padding: "4px 8px" }}>{x.codice_attesa ? <b>{x.codice_attesa}</b> : `n. ${x.id}`}</td><td style={{ padding: "4px 8px" }}>{x.codice_attesa ? `disposto il ${dataIt(x.data_disposizione)}` : dataIt(x.data)}</td><td style={{ padding: "4px 8px" }}>{x.verso}</td>
          <td style={{ padding: "4px 8px", textAlign: "right" }}>{euro(x.importo)}</td><td style={{ padding: "4px 8px" }}>{x.controparte}</td><td style={{ padding: "4px 8px" }}>{x.causale}</td></tr>)}</tbody></table>
      </div>}
    </div>
  );
}

function Modulo({ e, s, gruppi, causali, anno, cambia, base, sommaFatture }) {
  const rosso = (vuoto) => ({ ...input, width: "100%", maxWidth: "100%", boxSizing: "border-box", borderColor: vuoto ? C.red : C.border });
  const voci = causali.filter(c => c.gruppo === s.causale_gruppo);
  const daNumerare = anno >= "2026";
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 8, fontSize: 12.5 }}>
    {s.movimento_id !== undefined && <label>Movimento del programma<br />
      <select style={rosso(!s.movimento_id)} value={s.movimento_id} onChange={x => cambia("movimento_id", x.target.value)}>
        <option value="">— scegliere —</option>
        {(e.candidati || []).map(c => <option key={c.id} value={c.id}>n. {c.id} — {dataIt(c.data)} — {c.controparte} — {String(c.causale || "").slice(0, 50)}</option>)}
      </select></label>}
    {daNumerare && <label>Gruppo della causale<br /><select style={rosso(!s.causale_gruppo)} value={s.causale_gruppo || ""} onChange={x => cambia("causale_gruppo", x.target.value)}>
      <option value="">— scegliere —</option>{gruppi.map(g => <option key={g}>{g}</option>)}</select></label>}
    {daNumerare && <label>Voce<br /><select style={rosso(!s.causale_voce)} value={s.causale_voce || ""} onChange={x => cambia("causale_voce", x.target.value)}>
      <option value="">— scegliere —</option>{voci.map(v => <option key={v.voce}>{v.voce}</option>)}</select></label>}
    {daNumerare && s.causale_voce === "Altro" && <label>Che cosa (obbligatorio)<br /><input style={rosso(!String(s.causale_altro || "").trim())} value={s.causale_altro || ""} onChange={x => cambia("causale_altro", x.target.value)} /></label>}
    {daNumerare && <label>Modalità di pagamento o incasso<br /><select style={rosso(!s.modalita)} value={s.modalita || ""} onChange={x => cambia("modalita", x.target.value)}>
      <option value="">— scegliere —</option>{MODALITA.map(m => <option key={m}>{m}</option>)}</select></label>}
    {daNumerare && s.modalita === "Altro" && <label>Quale modalità (obbligatorio)<br /><input style={rosso(!String(s.modalita_altro || "").trim())} value={s.modalita_altro || ""} onChange={x => cambia("modalita_altro", x.target.value)} /></label>}
    {s.movimento_id === undefined && daNumerare && <Soggetto e={e} s={s} base={base} cambia={cambia} rosso={rosso} />}
    {s.movimento_id === undefined && <label>Soggetto (come sarà scritto in prima nota)<br /><input style={rosso(!String(s.controparte || "").trim())} value={s.controparte || ""} onChange={x => cambia("controparte", x.target.value)} /></label>}
    {s.movimento_id === undefined && daNumerare && (s.fornitore_id || s.cliente_id) ? <FattureDaChiudere e={e} s={s} base={base} cambia={cambia} sommaFatture={sommaFatture} /> : null}
    {e.riga.pagina_pdf ? <div style={{ color: C.muted }}>Pagina del PDF dell'estratto: {e.riga.pagina_pdf} (si apre da «Estratti e movimenti: consulta»)</div> : null}
  </div>;
}

// Versione 357: soggetto dall'anagrafica (fornitori per le uscite, clienti per le entrate)
function Soggetto({ e, s, base, cambia, rosso }) {
  const lato = e.riga.verso === "uscita" ? "fornitore" : "cliente";
  const elenco = lato === "fornitore" ? base.fornitori : base.clienti;
  const val = lato === "fornitore" ? s.fornitore_id : s.cliente_id;
  return <label>{lato === "fornitore" ? "Fornitore dall'anagrafica" : "Cliente dall'anagrafica"} (se c'è)<br />
    <select style={rosso(false)} value={val || ""} onChange={x => {
      const id = x.target.value ? Number(x.target.value) : ""; const a = elenco.find(y => y.id === id);
      cambia(lato === "fornitore" ? "fornitore_id" : "cliente_id", id); cambia("scadenze", []); if (a) cambia("controparte", a.nome);
    }}><option value="">— nessuno (dipendente, ente, banca…) —</option>{[...elenco].sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""))).map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></label>;
}
// Versione 357: fatture aperte del soggetto da chiudere con questo movimento (l'abbinamento nasce alla conferma)
function FattureDaChiudere({ e, s, base, cambia, sommaFatture }) {
  const lato = e.riga.verso === "uscita" ? "fornitore" : "cliente"; const id = lato === "fornitore" ? s.fornitore_id : s.cliente_id;
  const sue = base.aperte.filter(a => a.lato === lato && (lato === "fornitore" ? a.fornitore_id : a.cliente_id) === id && !(Number(a.in_attesa_della_banca) > 0))
    .sort((a, b) => String(a.data_documento || "").localeCompare(String(b.data_documento || "")));
  const scelte = s.scadenze || []; const somma = sommaFatture(scelte); const imp = Number(e.riga.importo);
  return <div style={{ gridColumn: "1 / -1", border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
    <b>Fatture da chiudere con questo movimento</b> <span style={{ color: C.muted }}>(spuntare; la quota è il resto della fattura)</span>
    {!sue.length && <div style={{ color: C.muted }}>Nessuna fattura aperta di questo soggetto.</div>}
    {sue.map(a => { const dopo = a.data_documento > e.riga.data_contabile; return <label key={a.scadenza_id} style={{ display: "block", color: dopo ? C.muted : C.text }}>
      <input type="checkbox" checked={scelte.includes(a.scadenza_id)} onChange={x => cambia("scadenze", x.target.checked ? [...scelte, a.scadenza_id] : scelte.filter(y => y !== a.scadenza_id))} />
      {" "}n. {a.numero_documento} del {dataIt(a.data_documento)} — resto {euro(a.residuo)}{dopo ? " — emessa dopo il movimento della banca" : ""}</label>; })}
    {scelte.length > 0 && <div style={{ marginTop: 4, fontWeight: 700, color: somma > imp + 0.005 ? C.red : Math.abs(somma - imp) < 0.005 ? C.green : C.yellow }}>
      Fatture spuntate {euro(somma)} su un movimento di {euro(imp)}{somma > imp + 0.005 ? " — troppo: togliere una fattura" : Math.abs(somma - imp) < 0.005 ? " — torna" : ` — restano ${euro(imp - somma)} non abbinati`}</div>}
  </div>;
}
