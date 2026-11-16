// Versione 383 (Tenente, 16/11/2026): «Rimborsi delle spese» (B5 della procedura, decisione del Dott. Bizzarri del 13/11/2026 ore 12:59–13:00).
// Chi ha pagato con soldi suoi («Pagato da me») o con la «Carta di credito personale» viene rimborsato una volta al mese.
// Approva chi gestisce i conti (Demaria, il Dott. Bizzarri o Colabucci). Si paga con bonifico (movimento in attesa della banca: il bonifico si fa
// in banca e si conferma in «Conferma dei movimenti») o in contanti (li dà chi ha i contanti dell'azienda in carico; l'uscita entra subito in cassa).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
import { dataIt, euro } from "./analisiDocumentoBanca";
const tutte = async fn => { const r = await fetchAllPages(fn); if (r.error) throw new Error(r.error.message); return r.data; };
const nomeP = p => String(p?.nome || "").trim() + (p?.cognome ? " " + p.cognome : "");
const PERSONALI = ["Pagato da me", "Carta di credito personale"];
const oggiRoma = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const meseIt = m => { const [a, b] = String(m).split("-"); return ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"][Number(b) - 1] + " " + a; };
// ultimo mese finito: il rimborso si approva a mese finito
export const mesePrecedente = oggi => { const [a, m] = oggi.split("-").map(Number); const d = new Date(Date.UTC(a, m - 2, 1)); return d.toISOString().slice(0, 10); };
const fineMese = m => { const [a, b] = m.split("-").map(Number); return new Date(Date.UTC(a, b, 0)).toISOString().slice(0, 10); };

export default function RimborsiSpese() {
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState(null);
  const [occupato, setOccupato] = useState(false);
  const [mese, setMese] = useState(mesePrecedente(oggiRoma()));
  const [mod, setMod] = useState({});   // per rimborso: data, chi paga, motivo

  async function carica() {
    setErrore("");
    try {
      const [spese, rimborsi, profili, gestore, saldi, abil] = await Promise.all([
        tutte((a, b) => supabase.from("ci_spese").select("id, numero, salvata_da, pagato_con, tipo_documento, data_pagamento, importo, fornitore_testo, stato, rimborso_id").in("pagato_con", PERSONALI).order("id").range(a, b)),
        tutte((a, b) => supabase.from("ci_spese_rimborsi").select("*").order("id", { ascending: false }).range(a, b)),
        supabase.from("profili").select("id, nome, cognome"), supabase.rpc("ci_puo_gestire_conti"), supabase.rpc("ci_contanti_saldi"),
        supabase.from("ci_spese_abilitati").select("profilo_id, attivo, puo_avere_contanti")]);
      for (const x of [profili, gestore]) if (x.error) throw new Error(x.error.message);
      if (gestore.data === true && (saldi.error || abil.error)) throw new Error("contanti per persona non letti: " + (saldi.error || abil.error).message);
      const attivi = new Set((abil.data || []).filter(a => a.attivo && a.puo_avere_contanti).map(a => a.profilo_id));
      // rimborsi «Disposto» rimasti senza movimento dopo uno storno: uscite BPER confermate con lo stesso importo, da collegare
      const orfani = rimborsi.filter(r => r.stato === "Disposto" && !r.movimento_id);
      let candidati = [];
      if (orfani.length && gestore.data === true) {
        const usati = new Set(rimborsi.filter(r => r.movimento_id).map(r => r.movimento_id));
        candidati = (await tutte((a, b) => supabase.from("ci_pagamenti_fatture").select("id, data, importo, controparte, esercizio, progressivo, stornato_il, natura, confermato_il, causale_gruppo, causale_voce")
          .eq("conto_id", 1).eq("verso", "uscita").in("importo", orfani.map(r => r.totale)).order("id").range(a, b)))
          .filter(m => m.confermato_il && !m.stornato_il && m.natura !== "STORNO" && !usati.has(m.id) && m.causale_gruppo === "Personale" && m.causale_voce === "Rimborso spese");
      }
      setD({ candidati, spese, rimborsi, nomi: Object.fromEntries((profili.data || []).map(p => [p.id, nomeP(p)])), gestore: gestore.data === true, saldi: (saldi.data || []).filter(s => attivi.has(s.persona)) });
    } catch (e) { setErrore("Lettura non riuscita: " + e.message); }
  }
  useEffect(() => { carica(); }, []);

  const perPersona = useMemo(() => {
    if (!d) return [];
    const fine = fineMese(mese); const m = new Map();
    for (const s of d.spese) {
      if (s.stato === "Annullata" || s.rimborso_id || s.data_pagamento > fine) continue;
      const x = m.get(s.salvata_da) || m.set(s.salvata_da, { persona: s.salvata_da, pronte: [], inControllo: [] }).get(s.salvata_da);
      (s.stato === "Controllata" ? x.pronte : x.inControllo).push(s);
    }
    return [...m.values()].sort((a, b) => (d.nomi[a.persona] || "").localeCompare(d.nomi[b.persona] || ""));
  }, [d, mese]);

  async function chiama(nome, args, ok) {
    if (occupato) return; setOccupato(true); setEsito(null);
    const r = await supabase.rpc(nome, args); setOccupato(false);
    if (r.error) return setEsito({ ok: false, testo: r.error.message });
    setEsito({ ok: true, testo: ok }); setMod({}); await carica();
  }

  if (!d) return <div style={{ maxWidth: 1100 }}><h2 style={{ color: C.primary }}>Rimborsi delle spese</h2>{errore ? <div style={{ color: C.red }}>{errore}</div> : <div style={{ color: C.muted }}>Leggo…</div>}</div>;
  const mesi = []; { let m = mesePrecedente(oggiRoma()); for (let i = 0; i < 12; i++) { mesi.push(m); m = mesePrecedente(m.slice(0, 8) + "15"); } }
  const aperti = d.rimborsi.filter(r => r.stato === "Approvato" || r.stato === "Disposto");
  const chiusi = d.rimborsi.filter(r => r.stato === "Pagato" || r.stato === "Annullato").slice(0, 30);
  const conContanti = d.saldi.filter(s => Number(s.saldo) > 0);
  const speseDi = id => d.spese.filter(s => s.rimborso_id === id);

  return (
    <div style={{ maxWidth: 1100 }}>
      <h2 style={{ margin: "0 0 4px", color: C.primary }}>Rimborsi delle spese</h2>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Una volta al mese, per ogni persona, le spese pagate con soldi suoi o con la carta di credito personale, già controllate. Approva chi gestisce i conti; si paga con bonifico o in contanti.</div>
      {!d.gestore && <div style={{ ...scheda, borderColor: C.yellow }}>Vedi solo i tuoi rimborsi: li approva e li paga chi gestisce i conti.</div>}
      {errore && <div style={{ ...scheda, borderColor: C.red, color: C.red }}>{errore}</div>}
      {esito && <div style={{ ...scheda, borderColor: esito.ok ? C.green : C.red, color: esito.ok ? C.green : C.red, fontWeight: 700 }}>{esito.testo}</div>}

      <div style={scheda}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><b>1. Da rimborsare fino alla fine di</b>
          <select style={input} value={mese} onChange={e => setMese(e.target.value)}>{mesi.map(m => <option key={m} value={m}>{meseIt(m)}</option>)}</select>
          <button style={btn(false)} onClick={carica}>Aggiorna</button></div>
        {perPersona.length === 0 && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>Nessuna spesa da rimborsare.</div>}
        {perPersona.map(p => { const tot = p.pronte.reduce((t, s) => t + Number(s.importo), 0);
          const gia = d.rimborsi.find(r => r.persona === p.persona && r.mese === mese && r.stato !== "Annullato"); return (
          <div key={p.persona} style={{ borderTop: `1px solid ${C.border}`, padding: "6px 0", fontSize: 12.5 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <b style={{ minWidth: 180 }}>{d.nomi[p.persona] || "—"}</b>
              <span>{p.pronte.length} spese controllate: <b>{euro(tot)}</b></span>
              {p.inControllo.length > 0 && <span style={{ color: C.accent }}>{p.inControllo.length} ancora da controllare ({euro(p.inControllo.reduce((t, s) => t + Number(s.importo), 0))}): restano per il prossimo rimborso</span>}
              {gia && p.pronte.length > 0 && <span style={{ marginLeft: "auto", color: C.accent }}>il rimborso di {meseIt(mese)} c'è già (n. {gia.id}): queste spese vanno nel rimborso del mese dopo, a mese finito</span>}
              {d.gestore && !gia && p.pronte.length > 0 && <button style={{ ...btn(true, C.green), marginLeft: "auto" }} disabled={occupato}
                onClick={() => chiama("ci_rimborso_approva", { p_persona: p.persona, p_mese: mese }, `Rimborso di ${meseIt(mese)} a ${d.nomi[p.persona]} approvato: ${euro(tot)}.`)}>Approva il rimborso di {meseIt(mese)}</button>}
            </div>
            {p.pronte.map(s => <div key={s.id} style={{ color: C.muted, paddingLeft: 12 }}>n. {s.numero} del {dataIt(s.data_pagamento)} — {s.pagato_con} — {s.fornitore_testo || s.tipo_documento} — {euro(s.importo)}</div>)}
          </div>); })}
      </div>

      <div style={scheda}>
        <b>2. Rimborsi approvati da pagare ({aperti.length})</b>
        {aperti.length === 0 && <div style={{ fontSize: 12.5, color: C.muted }}>Nessuno.</div>}
        {aperti.map(r => { const m = mod[r.id] || {}; const set = (k, v) => setMod(x => ({ ...x, [r.id]: { ...m, [k]: v } })); return (
          <div key={r.id} style={{ borderTop: `1px solid ${C.border}`, padding: "6px 0", fontSize: 12.5 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <b>n. {r.id}</b><b style={{ minWidth: 160 }}>{d.nomi[r.persona]}</b><span>{meseIt(r.mese)}</span><b>{euro(r.totale)}</b>
              <span>approvato da {d.nomi[r.approvato_da] || "—"} il {dataIt(r.approvato_il.slice(0, 10))}</span>
              <b style={{ color: r.stato === "Disposto" ? C.blue : C.accent }}>{r.stato === "Disposto" ? (r.movimento_id ? `bonifico disposto il ${dataIt(r.data_pagamento)}: in attesa della banca` : "registrazione del bonifico stornata: collegare l'uscita giusta della banca") : "da pagare"}</b>
            </div>
            <div style={{ color: C.muted, paddingLeft: 12 }}>{speseDi(r.id).map(s => `n. ${s.numero} ${euro(s.importo)}`).join(" · ")}</div>
            {d.gestore && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
              {r.stato === "Approvato" && <>
                <input type="date" style={input} value={m.data || oggiRoma()} onChange={e => set("data", e.target.value)} />
                <button style={btn(true)} disabled={occupato} onClick={() => chiama("ci_rimborso_paga_bonifico", { p_id: r.id, p_data: m.data || oggiRoma() }, `Bonifico di ${euro(r.totale)} a ${d.nomi[r.persona]} disposto: fare il bonifico in banca; si conferma in «Conferma dei movimenti».`)}>Paga con bonifico</button>
                <select style={input} value={m.da || ""} onChange={e => set("da", e.target.value)}>
                  <option value="">— chi dà i contanti —</option>{conContanti.map(s => <option key={s.persona} value={s.persona}>{d.nomi[s.persona]} (ha {euro(s.saldo)})</option>)}</select>
                <button style={btn(true, C.green)} disabled={occupato || !m.da} onClick={() => chiama("ci_rimborso_paga_contanti", { p_id: r.id, p_da: m.da, p_data: m.data || oggiRoma() }, `Rimborso di ${euro(r.totale)} a ${d.nomi[r.persona]} pagato in contanti: uscita registrata in cassa.`)}>Paga in contanti</button></>}
              {r.stato === "Disposto" && !r.movimento_id && <>
                <select style={input} value={m.mov || ""} onChange={e => set("mov", e.target.value)}>
                  <option value="">— uscita BPER da {euro(r.totale)} —</option>
                  {d.candidati.filter(x => Math.round(x.importo * 100) === Math.round(r.totale * 100) && (!r.data_pagamento || Date.parse(x.data) >= Date.parse(r.data_pagamento) - 5 * 864e5)).map(x => <option key={x.id} value={x.id}>{x.esercizio}/{String(x.progressivo || "").padStart(6, "0")} del {dataIt(x.data)} — {x.controparte || ""} — {x.causale_gruppo} – {x.causale_voce}</option>)}</select>
                <button style={btn(true, C.green)} disabled={occupato || !m.mov || !m.motivo} onClick={() => chiama("ci_rimborso_collega", { p_id: r.id, p_movimento: Number(m.mov), p_motivo: m.motivo }, "Rimborso collegato all'uscita della banca: «Pagato».")}>Collega (con il motivo)</button>
                <span style={{ fontSize: 12, color: C.red }}>Annullare solo se il bonifico non è stato fatto: altrimenti si paga due volte.</span></>}
              <input style={{ ...input, flex: "1 1 200px" }} placeholder="motivo (per annullare o collegare)" value={m.motivo || ""} onChange={e => set("motivo", e.target.value)} />
              <button style={btn(false, C.red)} disabled={occupato} onClick={() => chiama("ci_rimborso_annulla", { p_id: r.id, p_motivo: m.motivo || null }, "Rimborso annullato: le spese tornano da rimborsare.")}>Annulla</button>
            </div>}
          </div>); })}
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Bonifico: il programma mette il movimento in prima nota «in attesa della banca» (conto BPER, «Personale – Rimborso spese»); il bonifico si fa in banca. Quando arriva l'estratto e si conferma in «Conferma dei movimenti», il rimborso diventa «Pagato» e le spese «Rimborsata». Contanti: l'uscita entra subito in cassa e scala dai contanti di chi li dà.</div>
      </div>

      <div style={scheda}>
        <b>3. Rimborsi pagati e annullati (ultimi 30)</b>
        {chiusi.length === 0 && <div style={{ fontSize: 12.5, color: C.muted }}>Nessuno.</div>}
        {chiusi.map(r => <div key={r.id} style={{ fontSize: 12.5, color: r.stato === "Annullato" ? C.muted : C.text }}>
          n. {r.id} — {d.nomi[r.persona]} — {meseIt(r.mese)} — {euro(r.totale)} — {r.stato === "Pagato" ? `pagato ${r.pagato_con === "Contanti" ? `in contanti da ${d.nomi[r.pagato_da]}` : "con bonifico"} il ${dataIt(r.data_pagamento)}` : `annullato: ${r.annullato_motivo}`}</div>)}
      </div>
    </div>
  );
}
