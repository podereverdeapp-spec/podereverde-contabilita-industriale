// Versione 382 (Tenente Fatture, 13/11/2026): «Contanti per persona» (B3 della procedura approvata; decisione del 12/11:
// una sola cassa aziendale con i contanti in carico a ogni persona e il rendiconto per persona).
// Per ogni persona: prelievi + contanti ricevuti − spese in contanti − contanti consegnati = contanti che deve avere.
// Prelievi, consegne e conferme si fanno dall'app.
// Versione 383 (Tenente, 16/11/2026): colonna «Rimborsi pagati» (rimborsi delle spese pagati in contanti da chi ha la cassa in carico) e
// «Correzioni» per chi gestisce i conti, con il motivo: prelievo della persona sbagliata, prelievo da togliere, spesa in contanti già
// controllata da rifare o da annullare. Le correzioni le fa il database (ci_prelievo_correggi_persona, ci_prelievo_togli, ci_spesa_contanti_correggi).
// Versione 391 (Tenente, 20/11/2026): le spese in contanti entrano in cassa al salvataggio (decisione del 20/11 ore 09:24); con «Contanti + resto
// pagato da me» dalla cassa esce solo la parte presa dai contanti in carico, il resto si rimborsa alla persona (10:50 e 11:00). Le righe di cassa
// sbagliate non si cancellano: si stornano, con il motivo (15:45). Una spesa dentro un rimborso non si corregge qui: prima si annulla il rimborso.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
// fetchAllPages restituisce { data, error }: qui un errore ferma la lettura con il suo messaggio
const tutte = async fn => { const r = await fetchAllPages(fn); if (r.error) throw new Error(r.error.message); return r.data; };
import { dataIt, euro } from "./analisiDocumentoBanca";
import { dallaCassa, quotaDaMe } from "./fileSpesa";

const nomeP = p => String(p?.nome || "").trim() + (p?.cognome ? " " + p.cognome : "");

export default function ContantiPersone() {
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState("");
  const [annullo, setAnnullo] = useState(null); const [motivo, setMotivo] = useState(""); const [esito, setEsito] = useState("");
  const [corr, setCorr] = useState(null);      // { tipo, id } della riga aperta nelle correzioni
  const [mod, setMod] = useState({});          // persona, motivo
  const [occupato, setOccupato] = useState(false);
  // chi gestisce i conti può annullare una consegna registrata per errore
  async function annullaConsegna(c) {
    const r = await supabase.rpc("ci_contanti_annulla", { p_id: c.id, p_motivo: motivo || null });
    setEsito(r.error ? "Consegna non annullata: " + r.error.message : "Consegna annullata."); setAnnullo(null); setMotivo(""); await carica();
  }
  async function correggi(nome, args, ok) {
    if (occupato) return; setOccupato(true); setEsito("");
    const r = await supabase.rpc(nome, args); setOccupato(false);
    setEsito(r.error ? "Correzione non fatta: " + r.error.message : ok);
    if (!r.error) { setCorr(null); setMod({}); await carica(); }
  }
  async function carica() {
    setErrore("");
    try {
      const [saldi, profili, cont, gestore, spese, abil] = await Promise.all([
        supabase.rpc("ci_contanti_saldi"), supabase.from("profili").select("id, nome, cognome"),
        tutte((a, b) => supabase.from("ci_contanti").select("*").order("id", { ascending: false }).range(a, b)),
        supabase.rpc("ci_puo_gestire_conti"),
        tutte((a, b) => supabase.from("ci_spese").select("id, numero, salvata_da, data_pagamento, importo, quota_da_me, rimborso_id, fornitore_testo, tipo_documento, stato").eq("pagato_con", "Contanti").eq("stato", "Controllata").order("id", { ascending: false }).range(a, b)),
        supabase.from("ci_spese_abilitati").select("profilo_id, attivo, puo_avere_contanti")]);
      if (saldi.error) throw new Error(saldi.error.message);
      if (profili.error) throw new Error(profili.error.message);
      if (gestore.error) throw new Error(gestore.error.message);
      if (abil.error) throw new Error(abil.error.message);
      setD({ saldi: saldi.data || [], nomi: Object.fromEntries((profili.data || []).map(p => [p.id, nomeP(p)])), cont, gestore: gestore.data === true, spese,
        conContanti: (abil.data || []).filter(a => a.attivo && a.puo_avere_contanti).map(a => a.profilo_id) });
    } catch (e) { setErrore("Lettura non riuscita: " + e.message); }
  }
  useEffect(() => { carica(); }, []);
  if (!d) return <div><h2 style={{ color: C.primary }}>Contanti per persona</h2>{errore ? <div style={{ color: C.red }}>{errore}</div> : <div style={{ color: C.muted }}>Leggo…</div>}</div>;
  const daConfermare = d.cont.filter(c => c.tipo === "Consegna" && !c.confermata_il && !c.annullata_il);
  const td = { padding: "5px 8px", textAlign: "right" };
  const prelievi = d.cont.filter(c => c.tipo === "Prelievo").slice(0, 20);
  const apri = (tipo, id) => { setCorr(corr?.tipo === tipo && corr?.id === id ? null : { tipo, id }); setMod({}); setEsito(""); };
  return (
    <div style={{ maxWidth: 1000 }}>
      <h2 style={{ margin: "0 0 4px", color: C.primary }}>Contanti per persona</h2>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Quanti contanti dell'azienda deve avere ciascuno. Prelievi, consegne e conferme si registrano dall'app; le spese in contanti entrano in cassa al salvataggio. Con «Contanti + resto pagato da me» qui conta solo la parte presa dalla cassa.</div>
      <button style={{ ...btn(false), marginBottom: 10 }} onClick={carica}>Aggiorna</button>
      {esito && <div style={{ ...scheda, fontWeight: 700, color: esito.startsWith("Correzione non fatta") || esito.startsWith("Consegna non") ? C.red : C.green }}>{esito}</div>}
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", background: "#fff", marginBottom: 14 }}>
        <thead><tr style={{ color: C.muted }}><th style={{ padding: 6, textAlign: "left" }}>Persona</th><th style={td}>Prelievi</th><th style={td}>Ricevuti</th><th style={td}>Spese in contanti (dalla cassa)</th><th style={td}>Consegnati</th><th style={td}>Rimborsi pagati</th><th style={td}>Deve avere</th><th style={td}>Consegne da confermare</th></tr></thead>
        <tbody>{d.saldi.map(s => (
          <tr key={s.persona} style={{ borderTop: `1px solid ${C.border}` }}><td style={{ padding: "5px 8px", fontWeight: 700 }}>{d.nomi[s.persona] || "—"}</td>
            <td style={td}>{euro(s.prelievi)}</td><td style={td}>{euro(s.ricevuti)}</td><td style={td}>{euro(s.spese)}</td><td style={td}>{euro(s.consegnati)}</td><td style={td}>{euro(s.rimborsi_pagati || 0)}</td>
            <td style={{ ...td, fontWeight: 800, color: Number(s.saldo) < 0 ? C.red : C.text }}>{euro(s.saldo)}</td>
            <td style={{ ...td, color: C.accent }}>{Number(s.da_confermare_in_uscita) || Number(s.da_confermare_in_entrata) ? `${euro(s.da_confermare_in_uscita)} da dare, ${euro(s.da_confermare_in_entrata)} da ricevere` : ""}</td></tr>))}</tbody>
      </table>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>Dall'app 149 una spesa in contanti non supera i contanti in carico: il resto lo mette la persona con «Contanti + resto pagato da me» e le si rimborsa in «Rimborsi delle spese». «Deve avere» negativo vuol dire che nel programma mancano contanti ricevuti dalla persona (per esempio un prelievo o una consegna non registrati) oppure, per le spese di prima, che ha anticipato soldi suoi: va chiarito con lei. «Rimborsi pagati»: rimborsi delle spese dati in contanti da questa persona («Rimborsi delle spese»).</div>
      <div style={scheda}><b>Consegne da confermare ({daConfermare.length})</b>
        {daConfermare.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted }}>Nessuna.</div> : daConfermare.map(c => <div key={c.id} style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
          <span>{dataIt(c.data)} — {d.nomi[c.persona]} a {d.nomi[c.a_persona]}: {euro(c.importo)} (la conferma chi riceve, dall'app)</span>
          {annullo === c.id ? <><input style={{ ...input, width: 240 }} placeholder="motivo dell'annullamento" value={motivo} onChange={e => setMotivo(e.target.value)} />
            <button style={btn(true, C.red)} onClick={() => annullaConsegna(c)}>Annulla la consegna</button><button style={btn(false)} onClick={() => setAnnullo(null)}>Lascia stare</button></>
            : <button style={{ ...btn(false, C.red), height: 26 }} onClick={() => { setAnnullo(c.id); setMotivo(""); setEsito(""); }}>Annulla…</button>}</div>)}</div>
      <div style={scheda}><b>Ultimi prelievi</b>
        {prelievi.map(c => <div key={c.id} style={{ fontSize: 12.5, color: c.annullata_il ? C.muted : C.text, marginTop: 3 }}>
          <span>{dataIt(c.data)} — {d.nomi[c.persona]}: {euro(c.importo)}{c.annullata_il ? ` (tolto: ${c.annullata_motivo || ""})` : ""}</span>
          {d.gestore && !c.annullata_il && <button style={{ ...btn(corr?.tipo === "p" && corr?.id === c.id), height: 24, marginLeft: 8 }} onClick={() => apri("p", c.id)}>Correggi…</button>}
          {corr?.tipo === "p" && corr?.id === c.id && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "6px 0 6px 12px" }}>
            <input style={{ ...input, flex: "1 1 220px" }} placeholder="motivo (obbligatorio)" value={mod.motivo || ""} onChange={e => setMod(x => ({ ...x, motivo: e.target.value }))} />
            <select style={input} value={mod.persona || ""} onChange={e => setMod(x => ({ ...x, persona: e.target.value }))}>
              <option value="">— l'ha fatto un'altra persona —</option>{d.conContanti.filter(p => p !== c.persona).map(p => <option key={p} value={p}>{d.nomi[p]}</option>)}</select>
            <button style={btn(true)} disabled={occupato || !mod.persona} onClick={() => correggi("ci_prelievo_correggi_persona", { p_id: c.id, p_persona: mod.persona, p_motivo: mod.motivo || null }, `Prelievo del ${dataIt(c.data)} passato a ${d.nomi[mod.persona]}.`)}>Cambia la persona</button>
            <button style={btn(false, C.red)} disabled={occupato} onClick={() => correggi("ci_prelievo_togli", { p_id: c.id, p_motivo: mod.motivo || null }, `Prelievo del ${dataIt(c.data)} tolto (la sua riga di cassa, se c'era, è stornata): la persona lo registra di nuovo dall'app, se serve.`)}>Togli il prelievo</button>
          </div>}
        </div>)}
        {prelievi.length === 0 && <div style={{ fontSize: 12.5, color: C.muted }}>Nessuno.</div>}
        {d.gestore && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Un prelievo già unito all'estratto BPER è in prima nota: non si toglie più, si corregge con lo storno. Togliendo un prelievo non ancora unito, la sua riga di cassa si storna (resta visibile, con il motivo).</div>}</div>
      {d.gestore && <div style={scheda}><b>Correzioni: spese in contanti già controllate ({d.spese.length})</b>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>«Rifai il controllo»: la riga di cassa della spesa si storna e la spesa torna «Da controllare» (per correggere importo o fattura). «Annulla la spesa»: la riga di cassa si storna e la spesa si annulla (per esempio: non era in contanti). Lo storno resta in cassa con il motivo. Una spesa già dentro un rimborso non si corregge qui: prima si annulla il rimborso in «Rimborsi delle spese».</div>
        {d.spese.slice(0, 30).map(s => <div key={s.id} style={{ fontSize: 12.5, marginTop: 3 }}>
          <span>n. {s.numero} del {dataIt(s.data_pagamento)} — {d.nomi[s.salvata_da]} — {s.fornitore_testo || s.tipo_documento} — {euro(s.importo)}{quotaDaMe(s) > 0 ? ` (${euro(dallaCassa(s))} dalla cassa, ${euro(quotaDaMe(s))} messi da sé)` : ""}</span>
          {s.rimborso_id ? <span style={{ marginLeft: 8, color: C.muted }}>dentro il rimborso n. {s.rimborso_id}: prima si annulla il rimborso</span>
            : <button style={{ ...btn(corr?.tipo === "s" && corr?.id === s.id), height: 24, marginLeft: 8 }} onClick={() => apri("s", s.id)}>Correggi…</button>}
          {corr?.tipo === "s" && corr?.id === s.id && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "6px 0 6px 12px" }}>
            <input style={{ ...input, flex: "1 1 260px" }} placeholder="motivo (obbligatorio)" value={mod.motivo || ""} onChange={e => setMod(x => ({ ...x, motivo: e.target.value }))} />
            <button style={btn(true)} disabled={occupato} onClick={() => correggi("ci_spesa_contanti_correggi", { p_spesa: s.id, p_rifai: true, p_motivo: mod.motivo || null }, `Spesa n. ${s.numero}: riga di cassa stornata, di nuovo «Da controllare» in «Spese pagate: controllo».`)}>Rifai il controllo</button>
            <button style={btn(false, C.red)} disabled={occupato} onClick={() => correggi("ci_spesa_contanti_correggi", { p_spesa: s.id, p_rifai: false, p_motivo: mod.motivo || null }, `Spesa n. ${s.numero}: riga di cassa stornata e spesa annullata.`)}>Annulla la spesa</button>
          </div>}
        </div>)}
        {d.spese.length === 0 && <div style={{ fontSize: 12.5, color: C.muted }}>Nessuna.</div>}</div>}
    </div>
  );
}
