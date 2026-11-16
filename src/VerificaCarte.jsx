// Versione 383 (Tenente, 16/11/2026): «Carte prepagate: verifica» (bozza delle istruzioni approvata dal Dott. Bizzarri il 12/11/2026 alle 10:48).
// Per la carta e l'estratto scelti: 1. consuntivo (saldo iniziale + entrate − uscite = saldo stampato), 2. ricariche in coppia con la banca,
// 3. ogni riga dell'estratto con la sua spesa salvata dall'app (unita / da unire / senza documento, «Chiedi la spesa»), le spese dell'app che
// non sono sull'estratto, 4. esito: «Registra in prima nota» solo se l'estratto fa scopa. L'esito e la registrazione li decide il database
// (ci_carta_esito, ci_carta_registra): la pagina mostra e propone.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
import { dataIt, euro } from "./analisiDocumentoBanca";
const tutte = async fn => { const r = await fetchAllPages(fn); if (r.error) throw new Error(r.error.message); return r.data; };
const nomeP = p => String(p?.nome || "").trim() + (p?.cognome ? " " + p.cognome : "");
const cent = x => Math.round(Number(x) * 100);
const giorni = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

// spese dell'app che possono essere quella riga: stesso importo al centesimo, pagamento da 15 giorni prima a 5 giorni dopo la riga
export function proposte(riga, spese) {
  return spese.filter(s => !s.riga_fonte_id && s.stato !== "Annullata" && cent(s.importo) === cent(riga.importo)
    && giorni(s.data_pagamento, riga.data_contabile) >= -5 && giorni(s.data_pagamento, riga.data_contabile) <= 15)
    .sort((a, b) => Math.abs(giorni(a.data_pagamento, riga.data_contabile)) - Math.abs(giorni(b.data_pagamento, riga.data_contabile)));
}

export default function VerificaCarte() {
  const [base, setBase] = useState(null);
  const [cartaId, setCartaId] = useState(null);
  const [docId, setDocId] = useState(null);
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState(null);
  const [occupato, setOccupato] = useState(false);
  const [aperta, setAperta] = useState(null);      // riga aperta
  const [scelta, setScelta] = useState({});        // spesa scelta, persona e testo della richiesta, motivo

  useEffect(() => { (async () => {
    try {
      const [conti, docs, gestore, profili, abil] = await Promise.all([
        supabase.from("ci_conti").select("id, nome, tipo, ultime_quattro_cifre, stato").eq("tipo", "carta prepagata").order("id"),
        tutte((a, b) => supabase.from("ci_documenti_fonte").select("id, conto_id, tipo, periodo_dal, periodo_al, saldo_iniziale, saldo_finale, annullato_il").order("id").range(a, b)),
        supabase.rpc("ci_puo_gestire_conti"), supabase.from("profili").select("id, nome, cognome"), supabase.from("ci_spese_abilitati").select("profilo_id, attivo")]);
      for (const x of [conti, gestore, profili, abil]) if (x.error) throw new Error(x.error.message);
      const carte = (conti.data || []).filter(c => c.stato === "aperto");
      const vivi = docs.filter(x => !x.annullato_il);
      setBase({ carte, docs: vivi, gestore: gestore.data === true, nomi: Object.fromEntries((profili.data || []).map(p => [p.id, nomeP(p)])),
        abilitati: (abil.data || []).filter(a => a.attivo).map(a => a.profilo_id) });
      if (carte.length) setCartaId(carte[0].id);
    } catch (e) { setErrore("Lettura non riuscita: " + e.message); }
  })(); }, []);

  const docsCarta = useMemo(() => base ? base.docs.filter(x => x.conto_id === cartaId).sort((a, b) => b.periodo_al.localeCompare(a.periodo_al) || b.id - a.id) : [], [base, cartaId]);
  useEffect(() => { setDocId(docsCarta[0]?.id || null); }, [docsCarta]);

  async function leggi() {
    const doc = docsCarta.find(x => x.id === docId); const carta = base?.carte.find(c => c.id === cartaId);
    if (!doc || !carta) { setD(null); return; }
    setErrore(""); setD(null); setAperta(null);
    try {
      const vivi = new Set(base.docs.map(x => x.id));
      const righe = (await tutte((a, b) => supabase.from("ci_righe_fonte").select("id, documento_id, conto_id, data_contabile, verso, importo, descrizione")
        .eq("conto_id", cartaId).gte("data_contabile", doc.periodo_dal).lte("data_contabile", doc.periodo_al).order("id").range(a, b)))
        .filter(r => vivi.has(r.documento_id)).sort((a, b) => a.data_contabile.localeCompare(b.data_contabile) || a.id - b.id);
      const ids = righe.map(r => r.id);
      const [mov, spese, rich, esitoDb] = await Promise.all([
        ids.length ? tutte((a, b) => supabase.from("ci_pagamenti_fatture").select("id, riga_fonte_id, confermato_il, esercizio, progressivo, causale_voce").in("riga_fonte_id", ids).order("id").range(a, b)) : [],
        tutte((a, b) => supabase.from("ci_spese").select("id, numero, salvata_da, tipo_documento, data_documento, data_pagamento, importo, fornitore_testo, stato, riga_fonte_id, movimento_id, pdf_percorso")
          .eq("pagato_con", `Carta prepagata ${carta.ultime_quattro_cifre}`).order("id").range(a, b)),
        base.gestore ? tutte((a, b) => supabase.from("ci_spese_richieste").select("*").is("chiusa_il", null).order("id").range(a, b)) : [],
        base.gestore ? supabase.rpc("ci_carta_esito", { p_documento: doc.id }) : { data: [] }]);
      if (esitoDb.error) throw new Error(esitoDb.error.message);
      const perRiga = new Map(mov.filter(m => m.confermato_il).map(m => [m.riga_fonte_id, m]));
      setD({ doc, carta, righe, perRiga, spese, richieste: rich, esito: esitoDb.data || [] });
    } catch (e) { setErrore("Lettura non riuscita: " + e.message); }
  }
  useEffect(() => { if (base && docId) leggi(); }, [base, docId]);

  async function chiama(nome, args, ok) {
    if (occupato) return; setOccupato(true); setEsito(null);
    const r = await supabase.rpc(nome, args);
    setOccupato(false);
    if (r.error) return setEsito({ ok: false, testo: r.error.message });
    setEsito({ ok: true, testo: typeof ok === "function" ? ok(r.data) : ok }); setScelta({}); await leggi();
  }
  async function apriPdf(s) {
    const { data, error } = await supabase.storage.from("cassa").createSignedUrl(s.pdf_percorso, 120);
    if (error || !data?.signedUrl) return setEsito({ ok: false, testo: `Documento della spesa ${s.numero} non leggibile: ${error?.message || "nessun indirizzo"}` });
    window.open(data.signedUrl, "_blank", "noopener");
  }

  if (!base) return <div style={{ maxWidth: 1100 }}><h2 style={{ color: C.primary }}>Carte prepagate: verifica</h2>{errore ? <div style={{ color: C.red }}>{errore}</div> : <div style={{ color: C.muted }}>Leggo…</div>}</div>;
  if (!base.gestore) return <div style={{ maxWidth: 1100 }}><h2 style={{ color: C.primary }}>Carte prepagate: verifica</h2><div style={{ ...scheda, borderColor: C.yellow }}>La verifica delle carte la fa chi gestisce i conti (Teresa Demaria; al suo posto il Dott. Bizzarri o Colabucci).</div></div>;

  const oggi = new Date().toISOString().slice(0, 10);
  const calcolato = d ? Number(d.doc.saldo_iniziale) + d.righe.reduce((t, r) => t + (r.verso === "entrata" ? 1 : -1) * Number(r.importo), 0) : 0;
  const torna = d && cent(calcolato) === cent(d.doc.saldo_finale);
  const motiviRiga = d ? new Map(d.esito.filter(e => e.riga_id).map(e => [e.riga_id, e.motivo])) : new Map();
  const uscite = d ? d.righe.filter(r => r.verso === "uscita") : [];
  const entrate = d ? d.righe.filter(r => r.verso === "entrata") : [];
  const speseFuori = d ? d.spese.filter(s => !s.riga_fonte_id && s.stato !== "Annullata" && s.data_pagamento >= d.doc.periodo_dal && s.data_pagamento <= d.doc.periodo_al) : [];
  const dopo = d ? d.spese.filter(s => !s.riga_fonte_id && s.stato !== "Annullata" && s.data_pagamento > d.doc.periodo_al).length : 0;
  const faScopa = d && d.esito.length === 0;
  const daRegistrare = d ? d.righe.filter(r => !d.perRiga.has(r.id)).length : 0;
  const statoRiga = r => {
    if (d.perRiga.has(r.id)) return { t: "in prima nota", c: C.green };
    const s = d.spese.find(x => x.riga_fonte_id === r.id && x.stato !== "Annullata");
    if (s) return { t: "unita", c: C.green, s };
    if (proposte(r, d.spese).length) return { t: "da unire", c: C.accent };
    return { t: "senza documento", c: C.red };
  };
  const ultimo = docsCarta[0]?.periodo_al;

  return (
    <div style={{ maxWidth: 1100 }}>
      <h2 style={{ margin: "0 0 4px", color: C.primary }}>Carte prepagate: verifica</h2>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Si confronta l'estratto della carta con le ricariche della banca e con le spese salvate dall'app. Solo quando l'estratto «fa scopa» si registra in prima nota.</div>
      {errore && <div style={{ ...scheda, borderColor: C.red, color: C.red }}>{errore}</div>}
      {esito && <div style={{ ...scheda, borderColor: esito.ok ? C.green : C.red, color: esito.ok ? C.green : C.red, fontWeight: 700 }}>{esito.testo}</div>}

      <div style={{ ...scheda, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <b>Carta</b>
        <select style={input} value={cartaId || ""} onChange={e => setCartaId(Number(e.target.value))}>{base.carte.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
        <b>Estratto</b>
        <select style={{ ...input, minWidth: 280 }} value={docId || ""} onChange={e => setDocId(Number(e.target.value))}>
          {docsCarta.map(x => <option key={x.id} value={x.id}>dal {dataIt(x.periodo_dal)} al {dataIt(x.periodo_al)} (documento n. {x.id})</option>)}</select>
        <span style={{ fontSize: 12.5, color: ultimo && giorni(ultimo, oggi) > 35 ? C.red : C.muted }}>Estratto caricato fino al {ultimo ? dataIt(ultimo) : "—"}{ultimo && giorni(ultimo, oggi) > 35 ? ` — manca dal ${dataIt(new Date(Date.parse(ultimo + "T12:00:00Z") + 864e5).toISOString().slice(0, 10))}` : ""}</span>
        <button style={btn(false)} onClick={leggi}>Aggiorna</button>
      </div>

      {!d ? <div style={{ color: C.muted }}>{docId ? "Leggo l'estratto…" : "Nessun estratto caricato per questa carta."}</div> : <>
        <div style={{ ...scheda, borderColor: torna ? C.green : C.red }}>
          <b>1. Consuntivo dell'estratto</b>
          <div style={{ fontSize: 13, marginTop: 6, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
            <div>Saldo iniziale<br /><b>{euro(d.doc.saldo_iniziale)}</b></div>
            <div>Entrate (ricariche e rimborsi)<br /><b>+ {euro(entrate.reduce((t, r) => t + Number(r.importo), 0))}</b></div>
            <div>Uscite (spese)<br /><b>− {euro(uscite.reduce((t, r) => t + Number(r.importo), 0))}</b></div>
            <div>Saldo calcolato / stampato<br /><b style={{ color: torna ? C.green : C.red }}>{euro(calcolato)} / {euro(d.doc.saldo_finale)}</b></div>
          </div>
          <div style={{ fontSize: 12.5, marginTop: 6, fontWeight: 700, color: torna ? C.green : C.red }}>{torna ? "✓ Il saldo torna" : `✗ Il saldo non torna: differenza ${euro(calcolato - Number(d.doc.saldo_finale))}. Controllare che il file sia intero e il periodo giusto.`}</div>
        </div>

        <div style={scheda}>
          <b>2. Ricariche ({entrate.length})</b>
          {entrate.length === 0 && <div style={{ fontSize: 12.5, color: C.muted }}>Nessuna ricarica nel periodo.</div>}
          {entrate.map(r => { const m = motiviRiga.get(r.id); const ok = d.perRiga.has(r.id) || !m; return (
            <div key={r.id} style={{ fontSize: 12.5, marginTop: 4, color: ok ? C.text : C.red }}>
              {dataIt(r.data_contabile)} — {euro(r.importo)} — {r.descrizione} — <b style={{ color: ok ? C.green : C.red }}>{d.perRiga.has(r.id) ? "in prima nota" : ok ? "in coppia con la banca" : m}</b></div>); })}
        </div>

        <div style={scheda}>
          <b>3. Spese ({uscite.length})</b>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Verde: ha il documento. Giallo: il programma propone una spesa dell'app con lo stesso importo e data vicina: aprire il documento e unire. Rosso: nessuno ha salvato la spesa.</div>
          {uscite.map(r => { const st = statoRiga(r); const ric = d.richieste.find(q => q.riga_fonte_id === r.id); const prop = proposte(r, d.spese); return (
            <div key={r.id} style={{ borderTop: `1px solid ${C.border}`, padding: "5px 0" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline", fontSize: 12.5 }}>
                <span>{dataIt(r.data_contabile)}</span><span style={{ flex: "1 1 260px" }}>{r.descrizione}</span><b>{euro(r.importo)}</b>
                <b style={{ color: st.c, minWidth: 120 }}>{st.t}</b>
                {st.s && <span>spesa n. {st.s.numero} di {base.nomi[st.s.salvata_da] || "—"} ({st.s.stato})</span>}
                {st.s && <button style={{ ...btn(false), height: 26 }} onClick={() => apriPdf(st.s)}>PDF</button>}
                {ric && <span style={{ color: C.accent }}>chiesta a {base.nomi[ric.a_persona]} il {dataIt(ric.chiesta_il.slice(0, 10))}</span>}
                {!d.perRiga.has(r.id) && <button style={{ ...btn(aperta === r.id), height: 26 }} onClick={() => { setAperta(aperta === r.id ? null : r.id); setScelta({ spesa: prop[0]?.id || "", persona: "", testo: `Spesa con la carta ${d.carta.ultime_quattro_cifre} del ${dataIt(r.data_contabile)}, ${euro(r.importo)} (${r.descrizione}): salvala con l'app, anche dalla galleria del telefono.` }); }}>{aperta === r.id ? "Chiudi" : "Apri"}</button>}
              </div>
              {st.s && motiviRiga.get(r.id) && <div style={{ fontSize: 12, color: C.accent }}>{motiviRiga.get(r.id)}</div>}
              {aperta === r.id && (
                <div style={{ marginTop: 6, padding: 10, background: "#FAF8F3", borderRadius: 8, display: "grid", gap: 8 }}>
                  {st.s ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input style={{ ...input, flex: "1 1 280px" }} placeholder="motivo per separare la spesa dalla riga" value={scelta.motivo || ""} onChange={e => setScelta(x => ({ ...x, motivo: e.target.value }))} />
                      <button style={btn(false, C.red)} disabled={occupato} onClick={() => chiama("ci_spesa_separa_riga", { p_spesa: st.s.id, p_motivo: scelta.motivo || null }, `Spesa n. ${st.s.numero} separata dalla riga.`)}>Non è questa: separa</button></div>
                    : <>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 12.5 }}>Spesa dell'app:</span>
                        <select style={{ ...input, minWidth: 320 }} value={scelta.spesa || ""} onChange={e => setScelta(x => ({ ...x, spesa: e.target.value }))}>
                          <option value="">— scegliere —</option>
                          {(prop.length ? prop : d.spese.filter(s => !s.riga_fonte_id && s.stato !== "Annullata")).map(s => <option key={s.id} value={s.id}>n. {s.numero} del {dataIt(s.data_pagamento)} — {euro(s.importo)} — {s.fornitore_testo || s.tipo_documento} — {base.nomi[s.salvata_da] || ""}{prop.includes(s) ? " (proposta)" : ""}</option>)}</select>
                        {scelta.spesa && <button style={btn(false)} onClick={() => apriPdf(d.spese.find(s => String(s.id) === String(scelta.spesa)))}>Apri il documento</button>}
                        <button style={btn(true, C.green)} disabled={occupato || !scelta.spesa} onClick={() => chiama("ci_spesa_unisci_riga", { p_spesa: Number(scelta.spesa), p_riga: r.id }, "Spesa unita alla riga.")}>Unisci</button>
                      </div>
                      <div style={{ fontSize: 12, color: C.muted }}>Prima di unire si guarda il documento: negozio, data e totale devono essere quelli della riga. Se non si capisce di che spesa si tratta, «Da chiarire» si scrive in «Spese pagate: controllo».</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 12.5 }}>Chiedi la spesa a</span>
                        <select style={input} value={scelta.persona || ""} onChange={e => setScelta(x => ({ ...x, persona: e.target.value }))}>
                          <option value="">— persona —</option>{base.abilitati.map(p => <option key={p} value={p}>{base.nomi[p] || p}</option>)}</select>
                        <input style={{ ...input, flex: "1 1 320px" }} value={scelta.testo || ""} onChange={e => setScelta(x => ({ ...x, testo: e.target.value }))} />
                        <button style={btn(true, C.accent)} disabled={occupato || !scelta.persona} onClick={() => chiama("ci_spese_chiedi", { p_riga: r.id, p_persona: scelta.persona, p_testo: scelta.testo }, "Richiesta registrata. Finché l'app non la mostra, avvisare anche la persona.")}>Chiedi la spesa</button>
                      </div></>}
                </div>)}
            </div>); })}
          <div style={{ marginTop: 10 }}><b style={{ fontSize: 13 }}>Spese salvate dall'app che non sono sull'estratto ({speseFuori.length})</b>
            {speseFuori.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted }}>Nessuna.</div> : speseFuori.map(s => <div key={s.id} style={{ fontSize: 12.5, color: C.red }}>n. {s.numero} del {dataIt(s.data_pagamento)} — {euro(s.importo)} — {s.fornitore_testo || s.tipo_documento} — {base.nomi[s.salvata_da]}: non pagata con la carta nel periodo? «Da chiarire» in «Spese pagate: controllo».</div>)}
            {dopo > 0 && <div style={{ fontSize: 12, color: C.muted }}>{dopo} spese pagate dopo il {dataIt(d.doc.periodo_al)}: aspettano l'estratto successivo.</div>}
          </div>
        </div>

        <div style={{ ...scheda, borderColor: faScopa ? C.green : C.red }}>
          <b>4. Esito dell'estratto</b>
          {faScopa ? <div style={{ color: C.green, fontWeight: 800, margin: "6px 0" }}>✓ Fa scopa: il saldo torna, le ricariche sono in coppia, ogni riga ha il suo documento.</div>
            : <div style={{ fontSize: 12.5, margin: "6px 0" }}>{d.esito.map((e, i) => <div key={i} style={{ color: C.red }}>✗ {e.riga_id ? `${dataIt(d.righe.find(r => r.id === e.riga_id)?.data_contabile)} ${euro(d.righe.find(r => r.id === e.riga_id)?.importo)}: ` : ""}{e.motivo}</div>)}</div>}
          <button style={{ ...btn(true, C.green), opacity: occupato || !faScopa || daRegistrare === 0 ? 0.45 : 1 }} disabled={occupato || !faScopa || daRegistrare === 0}
            onClick={() => chiama("ci_carta_registra", { p_documento: d.doc.id }, x => `Registrato in prima nota: ${x?.spese || 0} spese e ${x?.ricariche || 0} ricariche.`)}>Registra in prima nota{daRegistrare ? ` (${daRegistrare} righe)` : ""}</button>
          {faScopa && daRegistrare === 0 && <span style={{ marginLeft: 8, fontSize: 12.5, color: C.green }}>Tutto l'estratto è già in prima nota.</span>}
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Le spese unite si confermano alla data dell'addebito e prendono il numero di prima nota; le ricariche entrano come giroconto dalla banca (la riga BPER va registrata prima in «Conferma dei movimenti»). Commissioni e bollo della carta, che non hanno scontrino, si registrano in «Conferma dei movimenti».</div>
        </div>
      </>}
    </div>
  );
}
