// Versione 355 (10/11/2026, procedura unica di carico, capitolo F24): la chiusura degli F24 con la prova esterna,
// cioè le righe della banca già caricate nel programma (ci_righe_fonte, sola lettura). Come la chiusura delle fatture
// con il Report di Aruba. Il programma propone, la persona conferma: senza conferma non cambia niente.
// Scrive solo in ci_f24: il collegamento alla riga della banca (riga_fonte_id, una riga per un solo F24: indice unico
// nel database) e, per un F24 «Da pagare», lo stato «Pagato» con la data della riga.
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";
import { fetchAllPages, formattaEuro } from "./parsingUtils";
import { C } from "./style";
import { oggiRoma } from "./dateRoma";
import { abbinaPagamenti, chiusuraF24, GIORNI_PRIMA, GIORNI_DOPO, GIORNI_RITARDO, GIORNI_PAGAMENTO } from "./calcoloPagamentiF24";

const COLORI = { verde: "#E3F2E1", arancione: "#FFF1DC", rosso: "#FBE1DE", grigio: "#F1F1F1" };
const dataIt = d => { const s = String(d || "").slice(0, 10); const [a, m, g] = s.split("-"); return g ? `${g}/${m}/${a}` : "—"; };

export default function PagamentiF24({ utente }) {
  const [stati, setStati] = useState(null);
  const [conti, setConti] = useState({});
  const [copertura, setCopertura] = useState(null);   // { fino: il conto meno aggiornato, perConto: [{ nome, fino }] }
  const [errore, setErrore] = useState("");
  const [lavoro, setLavoro] = useState("");
  const [scelte, setScelte] = useState({});           // { id F24: id riga scelta } per gli arancioni «scegliere»
  const [esiti, setEsiti] = useState([]);
  const occupato = useRef(false);

  const carica = useCallback(async () => {
    setErrore("");
    const [f, r, c, d] = await Promise.all([
      fetchAllPages((da, a) => supabase.from("ci_f24").select("id, codice_delega, oggetto, data_scadenza, saldo, stato, data_pagamento, riga_fonte_id, banca_addebito, nome_file_quietanza, nome_file_contabile, note").order("data_scadenza").order("id").range(da, a)),
      fetchAllPages((da, a) => supabase.from("ci_righe_fonte").select("id, documento_id, conto_id, data_contabile, importo, descrizione, verso").order("data_contabile").order("id").range(da, a)),
      supabase.from("ci_conti").select("id, nome"),
      fetchAllPages((da, a) => supabase.from("ci_documenti_fonte").select("id, annullato_il").order("id").range(da, a)),
    ]);
    const e = f.error || r.error || c.error || d.error;
    if (e) { setErrore(`Lettura non riuscita: ${e.message}`); setStati(null); return; }
    const nomi = Object.fromEntries((c.data || []).map(x => [x.id, x.nome]));
    // Le righe degli estratti annullati non provano un F24. Una riga già collegata che poi è stata annullata: se l'estratto è stato
    // ricaricato e c'è la stessa riga (conto, data, importo, descrizione), la prova regge e la riga gemella non si offre a un altro F24;
    // altrimenti l'F24 torna «da guardare». La riga collegata anche a un movimento della prima nota resta valida: il movimento di denaro
    // e la prova del pagamento sono due cose diverse (decisione D13 aperta; revisione delle 18:25, B1).
    const annullati = new Set((d.data || []).filter(x => x.annullato_il).map(x => String(x.id)));
    const chiave = x => `${x.conto_id}|${x.data_contabile}|${Math.round(Number(x.importo) * 100)}|${String(x.descrizione || "").trim()}`;
    const collegate = new Set((f.data || []).filter(x => x.riga_fonte_id != null).map(x => String(x.riga_fonte_id)));
    const valide = [], daGuardare = {}, gemelleUsate = new Set();
    for (const x of r.data || []) if (!annullati.has(String(x.documento_id))) valide.push(x);
    const perChiave = new Map(); valide.forEach(x => { const k = chiave(x); if (!perChiave.has(k)) perChiave.set(k, []); perChiave.get(k).push(x); });
    for (const x of r.data || []) {
      if (!annullati.has(String(x.documento_id)) || !collegate.has(String(x.id))) continue;
      const gemella = (perChiave.get(chiave(x)) || []).find(g => !gemelleUsate.has(String(g.id)) && !collegate.has(String(g.id)));
      if (gemella) gemelleUsate.add(String(gemella.id));
      else daGuardare[String(x.id)] = "è di un estratto annullato e nell'estratto ricaricato non c'è la stessa riga";
    }
    // fin dove è caricato ogni conto; «in banca non c'è» solo sotto la data del conto meno aggiornato
    const perConto = {};
    valide.forEach(x => { if (!perConto[x.conto_id] || x.data_contabile > perConto[x.conto_id]) perConto[x.conto_id] = x.data_contabile; });
    const date = Object.values(perConto);
    const fino = date.length ? date.reduce((m, x) => (x < m ? x : m)) : null;
    setCopertura({ fino, perConto: Object.entries(perConto).map(([id, x]) => ({ nome: nomi[id] || `conto ${id}`, fino: x })) });
    setConti(nomi);
    setStati(abbinaPagamenti({ f24: f.data || [], righe: valide.filter(x => x.verso === "uscita" && !gemelleUsate.has(String(x.id))), coperturaFino: fino, oggi: oggiRoma(), righeDaGuardare: daGuardare }));
  }, []);
  useEffect(() => { carica(); }, [carica]);

  async function unoAllaVolta(fn) {
    if (occupato.current) return;
    occupato.current = true;
    try { await fn(); } finally { occupato.current = false; setLavoro(""); await carica(); }
  }
  const firma = () => `${dataIt(oggiRoma())} da ${utente?.email || "utente"}`;
  const nota = (vecchia, testo) => (vecchia ? `${vecchia}\n${testo}` : testo);
  // le note si rileggono subito prima di scrivere: un'aggiunta fatta nel frattempo da un altro non si perde
  async function noteAdesso(f) {
    const { data, error } = await supabase.from("ci_f24").select("note").eq("id", f.id).maybeSingle();
    if (error) throw new Error(`${f.codice_delega}: ${error.message}`);
    return data?.note ?? null;
  }

  // F24 già «Pagato»: si scrive solo il collegamento alla riga della banca (lo stato non cambia)
  async function collega(f, riga) {
    const note = await noteAdesso(f);
    const q = supabase.from("ci_f24")
      .update({ riga_fonte_id: riga.id, note: nota(note, `Pagamento provato dalla riga della banca n. ${riga.id} del ${dataIt(riga.data_contabile)} (${conti[riga.conto_id] || "conto " + riga.conto_id}), collegata il ${firma()}`) })
      .eq("id", f.id).eq("stato", "Pagato").is("riga_fonte_id", null);
    const { data, error } = await q.select("id");
    if (error) throw new Error(`${f.codice_delega}: ${error.message}`);
    if (!(data || []).length) throw new Error(`${f.codice_delega}: non collegato (nel frattempo è cambiato)`);
  }
  // F24 «Da pagare»: diventa «Pagato» con la data della riga della banca
  async function confermaPagato(f, riga) {
    const note = await noteAdesso(f);
    const valori = { stato: "Pagato", data_pagamento: riga.data_contabile, riga_fonte_id: riga.id,
      note: nota(note, `«Pagato» confermato con la riga della banca n. ${riga.id} del ${dataIt(riga.data_contabile)} (${conti[riga.conto_id] || "conto " + riga.conto_id}), il ${firma()}`) };
    if (!f.banca_addebito) valori.banca_addebito = conti[riga.conto_id] || null;
    const q = supabase.from("ci_f24").update(valori)
      .eq("id", f.id).in("stato", ["Da pagare", "Disposto"]).is("riga_fonte_id", null);
    const { data, error } = await q.select("id");
    if (error) throw new Error(`${f.codice_delega}: ${error.message}`);
    if (!(data || []).length) throw new Error(`${f.codice_delega}: non aggiornato (nel frattempo è cambiato)`);
  }

  const daCollegare = (stati || []).filter(x => x.esito === "da-collegare");
  const collegaTutti = () => unoAllaVolta(async () => {
    if (!window.confirm(`Collegare ${daCollegare.length} F24 già «Pagato» alla loro riga della banca? Lo stato non cambia; si scrive solo il collegamento.`)) return;
    const out = [];
    for (const f of daCollegare) { setLavoro(`Collego ${f.codice_delega}…`); try { await collega(f, f.proposta); out.push(`${f.codice_delega}: collegato`); } catch (e) { out.push(`⚠️ ${e.message}`); } }
    setEsiti(out);
  });
  const conferma = (f, riga) => unoAllaVolta(async () => {
    if (!riga) return;
    if (!window.confirm(`F24 ${f.codice_delega} (${f.oggetto || ""}), saldo ${formattaEuro(Number(f.saldo))}, scadenza ${dataIt(f.data_scadenza)}.\n\nRiga della banca: ${dataIt(riga.data_contabile)}, ${formattaEuro(Number(riga.importo))}, «${riga.descrizione}».\n\nConfermare che questo F24 è pagato con questa riga?`)) return;
    try {
      if (f.stato === "Pagato") await collega(f, riga); else await confermaPagato(f, riga);
      setEsiti([`${f.codice_delega}: ${f.stato === "Pagato" ? "collegato" : "«Pagato» confermato"}`]);
    } catch (e) { setEsiti([`⚠️ ${e.message}`]); }
  });

  const riquadro = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, margin: "14px auto", maxWidth: 1250 };
  const bottone = attivo => ({ background: attivo ? C.primary : C.muted, color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: attivo ? "pointer" : "not-allowed" });
  const lavora = !!lavoro;
  const daMostrare = (stati || []).filter(x => !(x.esito === "provato" || x.esito === "da-scadere" || (x.esito === "saldo-zero" && x.nome_file_quietanza)));
  const chiusura = stati ? chiusuraF24(stati) : [];
  return (
    <div style={{ padding: "0 20px 20px" }}>
      <div style={riquadro}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Chiusura: i pagamenti degli F24 provati dalla banca</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
          Per ogni F24 il programma cerca nelle righe della banca già caricate un'uscita con «F24» nella descrizione e lo stesso importo del saldo:
          per un F24 «Pagato» con la data del pagamento (± {GIORNI_PAGAMENTO} giorni); per un F24 da pagare da {GIORNI_PRIMA} giorni prima a {GIORNI_DOPO} giorni dopo la scadenza
          (fino a {GIORNI_RITARDO} giorni dopo solo con scelta a mano). Una riga della banca prova un solo F24.
          Righe della banca caricate: {(copertura?.perConto || []).map(x => `${x.nome} fino al ${dataIt(x.fino)}`).join("; ") || "nessuna"}.
          «In banca non c'è il pagamento» si dice solo per un F24 scaduto prima del {dataIt(copertura?.fino)} (il conto meno aggiornato fra quelli con righe caricate).
        </div>
        {errore && <div style={{ padding: 8, background: COLORI.rosso, fontSize: 13 }}>⚠️ {errore}</div>}
        {lavoro && <div style={{ padding: 8, background: "#EAF2FB", fontSize: 13 }}>⏳ {lavoro}</div>}
        {!stati ? <div style={{ fontSize: 13, color: C.muted }}>Lettura…</div> : <>
          <table style={{ fontSize: 13, borderCollapse: "collapse", marginBottom: 10 }}>
            <thead><tr style={{ textAlign: "left" }}><th style={{ padding: "4px 8px" }}>Anno della scadenza</th><th>F24</th><th>Pagati e provati dalla banca</th><th>A saldo zero</th><th>Pagati da collegare</th><th>Da confermare «Pagato»</th><th>Da guardare</th><th>Scaduti e non pagati</th><th>In attesa dell'estratto</th><th>Da scadere</th></tr></thead>
            <tbody>{chiusura.map(c => { const delAnno = stati.filter(x => (x.anno || "senza scadenza") === c.anno);
              // verde solo se ogni F24 dell'anno è provato, a saldo zero con la ricevuta, o non ancora scaduto (quarta revisione, G1)
              const chiuso = x => x.esito === "provato" || x.esito === "da-scadere" || (x.esito === "saldo-zero" && x.colore === "grigio");
              const sfondo = delAnno.some(x => x.colore === "rosso") ? COLORI.rosso : delAnno.every(chiuso) ? COLORI.verde : COLORI.arancione;
              return <tr key={c.anno} style={{ background: sfondo }}>
              <td style={{ padding: "4px 8px", fontWeight: 700 }}>{c.anno}</td><td>{c.totale}</td><td>{c.provati}</td><td>{c.saldoZero}</td><td>{c.daCollegare}</td><td>{c.proposte}</td><td>{c.daGuardare}</td><td>{c.scadutiNonPagati}</td><td>{c.inAttesa}</td><td>{c.daScadere}</td></tr>; })}</tbody>
          </table>
          {daCollegare.length > 0 && <div style={{ marginBottom: 10 }}>
            <button style={bottone(!lavora)} disabled={lavora} onClick={collegaTutti}>Collega i {daCollegare.length} F24 già «Pagato» alla loro riga della banca</button>
            <span style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>Lo stato non cambia: si scrive solo quale riga della banca prova il pagamento.</span>
          </div>}
          {daMostrare.length === 0 ? <div style={{ fontSize: 13 }}>✅ Nessun F24 da guardare.</div> :
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead><tr style={{ textAlign: "left" }}><th>Delega</th><th>Oggetto</th><th>Scadenza</th><th style={{ textAlign: "right" }}>Saldo</th><th>Stato</th><th>Che cosa ho trovato</th><th></th></tr></thead>
            <tbody>{daMostrare.map(f => {
              const scelta = f.proposta || (f.candidati || []).find(r => String(r.id) === String(scelte[f.id]));
              return <tr key={f.id} style={{ background: COLORI[f.colore], borderBottom: "1px solid #ddd" }}>
                <td>{f.codice_delega}</td><td>{f.oggetto}</td><td>{dataIt(f.data_scadenza)}</td><td style={{ textAlign: "right" }}>{formattaEuro(Number(f.saldo))}</td><td>{f.stato}</td>
                <td>{f.motivo}{f.proposta && <div style={{ color: C.muted }}>Riga della banca: {dataIt(f.proposta.data_contabile)} · {conti[f.proposta.conto_id]} · «{f.proposta.descrizione}»</div>}
                  {(f.esito === "scegliere" || f.esito === "ritardo" || (f.esito === "senza-scadenza" && f.candidati.length > 0)) && <div><select value={scelte[f.id] || ""} onChange={e => setScelte(s => ({ ...s, [f.id]: e.target.value }))}>
                    <option value="">— scegli la riga della banca —</option>
                    {f.candidati.map(r => <option key={r.id} value={r.id}>{dataIt(r.data_contabile)} · {conti[r.conto_id]} · {formattaEuro(Number(r.importo))} · {r.descrizione}</option>)}
                  </select></div>}
                </td>
                <td>{(f.esito === "proposta" || f.esito === "scegliere" || f.esito === "ritardo" || f.esito === "da-collegare" || (f.esito === "senza-scadenza" && f.candidati.length > 0)) &&
                  <button style={bottone(!!scelta && !lavora)} disabled={!scelta || lavora} onClick={() => conferma(f, scelta)}>{f.stato === "Pagato" ? "Collega" : "Conferma: pagato"}</button>}</td>
              </tr>; })}</tbody>
          </table>}
          {esiti.length > 0 && <div style={{ marginTop: 8, padding: 8, background: esiti.some(x => x.startsWith("⚠️")) ? COLORI.rosso : COLORI.verde, fontSize: 12 }}>{esiti.join(" · ")}</div>}
        </>}
      </div>
    </div>
  );
}
