// Versione 383 (Tenente, 16/11/2026): «Abilitati alle spese» – chi usa «Spese pagate» nell'app, chi può avere contanti dell'azienda in carico,
// quali strumenti di pagamento si possono scegliere nell'app («Pagato con»). Solo chi gestisce i conti cambia; ogni cambio resta nel registro con il motivo.
// A chi ha ancora contanti dell'azienda in carico non si tolgono i contanti: prima li consegna o li restituisce (controllo del database).
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { euro } from "./analisiDocumentoBanca";
const nomeP = p => String(p?.nome || "").trim() + (p?.cognome ? " " + p.cognome : "");

export default function AbilitatiSpese() {
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState(null);
  const [occupato, setOccupato] = useState(false);
  const [mod, setMod] = useState({});
  const [nuovo, setNuovo] = useState({ profilo: "", contanti: true });

  async function carica() {
    setErrore("");
    try {
      const [gestore, profili, abil, strum, saldi, reg] = await Promise.all([supabase.rpc("ci_puo_gestire_conti"), supabase.from("profili").select("id, nome, cognome"),
        supabase.from("ci_spese_abilitati").select("*"), supabase.from("ci_spese_strumenti").select("*").order("ordine"), supabase.rpc("ci_contanti_saldi"),
        supabase.from("ci_spese_registro").select("*").in("cosa", ["abilitato", "strumento"]).order("id", { ascending: false }).limit(30)]);
      for (const x of [gestore, profili, abil, strum, reg]) if (x.error) throw new Error(x.error.message);
      if (saldi.error) throw new Error("contanti per persona non letti: " + saldi.error.message);
      setD({ gestore: gestore.data === true, profili: (profili.data || []).map(p => ({ id: p.id, nome: nomeP(p) })).sort((a, b) => a.nome.localeCompare(b.nome)),
        abil: abil.data || [], strum: strum.data || [], saldi: Object.fromEntries((saldi.data || []).map(s => [s.persona, Number(s.saldo)])), reg: reg.data || [] });
    } catch (e) { setErrore("Lettura non riuscita: " + e.message); }
  }
  useEffect(() => { carica(); }, []);

  async function chiama(nome, args, ok) {
    if (occupato) return; setOccupato(true); setEsito(null);
    const r = await supabase.rpc(nome, args); setOccupato(false);
    if (r.error) return setEsito({ ok: false, testo: r.error.message });
    setEsito({ ok: true, testo: ok }); setMod({}); await carica();
  }

  if (!d) return <div style={{ maxWidth: 900 }}><h2 style={{ color: C.primary }}>Abilitati alle spese</h2>{errore ? <div style={{ color: C.red }}>{errore}</div> : <div style={{ color: C.muted }}>Leggo…</div>}</div>;
  if (!d.gestore) return <div style={{ maxWidth: 900 }}><h2 style={{ color: C.primary }}>Abilitati alle spese</h2><div style={{ ...scheda, borderColor: C.yellow }}>Questa pagina la usa chi gestisce i conti.</div></div>;
  const nome = id => d.profili.find(p => p.id === id)?.nome || "—";
  const nonAbilitati = d.profili.filter(p => !d.abil.some(a => a.profilo_id === p.id));
  const abil = [...d.abil].sort((a, b) => nome(a.profilo_id).localeCompare(nome(b.profilo_id)));

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ margin: "0 0 4px", color: C.primary }}>Abilitati alle spese</h2>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Chi usa «Spese pagate» nell'app, chi può avere contanti dell'azienda in carico e quali strumenti si scelgono in «Pagato con». Ogni cambio resta scritto con il motivo.</div>
      {errore && <div style={{ ...scheda, borderColor: C.red, color: C.red }}>{errore}</div>}
      {esito && <div style={{ ...scheda, borderColor: esito.ok ? C.green : C.red, color: esito.ok ? C.green : C.red, fontWeight: 700 }}>{esito.testo}</div>}

      <div style={scheda}>
        <b>1. Persone ({abil.filter(a => a.attivo).length} attive)</b>
        {abil.map(a => { const m = mod[a.profilo_id] || { attivo: a.attivo, contanti: a.puo_avere_contanti, motivo: "" }; const set = (k, v) => setMod(x => ({ ...x, [a.profilo_id]: { ...m, [k]: v } }));
          const cambiato = m.attivo !== a.attivo || m.contanti !== a.puo_avere_contanti; return (
          <div key={a.profilo_id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, borderTop: `1px solid ${C.border}`, padding: "5px 0", color: a.attivo ? C.text : C.muted }}>
            <b style={{ minWidth: 180 }}>{nome(a.profilo_id)}</b>
            <label><input type="checkbox" checked={m.attivo} onChange={e => set("attivo", e.target.checked)} /> usa «Spese pagate»</label>
            <label><input type="checkbox" checked={m.contanti} onChange={e => set("contanti", e.target.checked)} /> può avere contanti</label>
            {a.puo_avere_contanti && <span style={{ color: C.muted }}>in carico {euro(d.saldi[a.profilo_id] || 0)}</span>}
            {cambiato && <><input style={{ ...input, flex: "1 1 180px" }} placeholder="motivo" value={m.motivo} onChange={e => set("motivo", e.target.value)} />
              <button style={btn(true)} disabled={occupato} onClick={() => chiama("ci_spese_abilitato_salva", { p_profilo: a.profilo_id, p_attivo: m.attivo, p_contanti: m.contanti, p_motivo: m.motivo || null }, `${nome(a.profilo_id)}: salvato.`)}>Salva</button></>}
          </div>); })}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <span style={{ fontSize: 12.5 }}>Aggiungi:</span>
          <select style={input} value={nuovo.profilo} onChange={e => setNuovo(x => ({ ...x, profilo: e.target.value }))}>
            <option value="">— persona iscritta all'app —</option>{nonAbilitati.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
          <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={nuovo.contanti} onChange={e => setNuovo(x => ({ ...x, contanti: e.target.checked }))} /> può avere contanti</label>
          <button style={btn(true, C.green)} disabled={occupato || !nuovo.profilo} onClick={() => chiama("ci_spese_abilitato_salva", { p_profilo: nuovo.profilo, p_attivo: true, p_contanti: nuovo.contanti, p_motivo: null }, `${nome(nuovo.profilo)} abilitato.`)}>Abilita</button>
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Chi non ha l'app non può avere contanti in carico. A chi ha ancora contanti dell'azienda non si tolgono: prima li consegna o li restituisce.</div>
      </div>

      <div style={scheda}>
        <b>2. Strumenti in «Pagato con»</b>
        {d.strum.map(s => { const m = mod["s:" + s.nome] || { motivo: "" }; return (
          <div key={s.nome} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, borderTop: `1px solid ${C.border}`, padding: "5px 0" }}>
            <b style={{ minWidth: 200 }}>{s.nome}</b><b style={{ color: s.attivo ? C.green : C.muted, minWidth: 70 }}>{s.attivo ? "attivo" : "spento"}</b>
            <input style={{ ...input, flex: "1 1 200px" }} placeholder="motivo" value={m.motivo} onChange={e => setMod(x => ({ ...x, ["s:" + s.nome]: { motivo: e.target.value } }))} />
            <button style={btn(false, s.attivo ? C.red : C.green)} disabled={occupato} onClick={() => chiama("ci_spese_strumento_cambia", { p_nome: s.nome, p_attivo: !s.attivo, p_motivo: m.motivo || null }, `${s.nome}: ${s.attivo ? "spento" : "acceso"}.`)}>{s.attivo ? "Spegni" : "Accendi"}</button>
          </div>); })}
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Uno strumento spento non compare più nell'app e una spesa con quello strumento non si salva. Le spese già salvate restano.</div>
      </div>

      <div style={scheda}><b>Registro dei cambi (ultimi 30)</b>
        {d.reg.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted }}>Nessuno.</div> : d.reg.map(r => <div key={r.id} style={{ fontSize: 12.5 }}>{new Date(r.fatta_il).toLocaleString("it-IT", { timeZone: "Europe/Rome" })} — {nome(r.fatta_da)} — {r.cosa}: {r.riferimento} — da «{r.prima || "—"}» a «{r.dopo || "—"}»{r.motivo ? ` — ${r.motivo}` : ""}</div>)}</div>
    </div>
  );
}
