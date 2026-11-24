// Versione 393 (Tenente, 23/11/2026): il Registro delle spese è la versione 394 (rinumerato dal Dott. Bizzarri il 23/11 alle 14:02).
// Versione 397 (Tenente, 24/11/2026): il Registro delle spese è uscito con la 397; l'unione dell'addebito della carta di credito non c'è ancora (nessuna carta di credito della società).
// Versione 383 (Tenente, 16/11/2026): «Abilitati alle spese» – chi usa «Spese pagate» nell'app, chi può avere contanti dell'azienda in carico,
// quali strumenti di pagamento si possono scegliere nell'app («Pagato con»). Solo chi gestisce i conti cambia; ogni cambio resta nel registro con il motivo.
// A chi ha ancora contanti dell'azienda in carico non si tolgono i contanti: prima li consegna o li restituisce (controllo del database).
// Versione 392 (Tenente, 20/11/2026): carte della società registrate dall'app da chi le riceve (decisioni del Dottore delle 21:52, 22:04, 22:23).
// Qui l'amministrazione le completa (conto, limite, giorno di addebito: nasce la posizione in «Banche, carte e cassa»), aggiunge gli altri abilitati,
// le spegne o ne annulla la registrazione; sposta sulla carta giusta le spese rimaste a una registrazione annullata. Tutti i controlli sono nel database.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { euro } from "./analisiDocumentoBanca";
const nomeP = p => String(p?.nome || "").trim() + (p?.cognome ? " " + p.cognome : "");
const CARTE = ["Carta di debito", "Carta prepagata", "Carta di credito"];
const data = t => t ? new Date(t).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "";

export default function AbilitatiSpese() {
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState(null);
  const [occupato, setOccupato] = useState(false);
  const [mod, setMod] = useState({});
  const [nuovo, setNuovo] = useState({ profilo: "", contanti: true });
  const [vediAnnullate, setVediAnnullate] = useState(false);

  async function carica() {
    setErrore("");
    try {
      const [gestore, profili, abil, strum, saldi, reg, conti, abilCarte, speseSenzaBanca, prelSenzaBanca] = await Promise.all([supabase.rpc("ci_puo_gestire_conti"), supabase.from("profili").select("id, nome, cognome"),
        supabase.from("ci_spese_abilitati").select("*"), supabase.from("ci_spese_strumenti").select("*").order("ordine"), supabase.rpc("ci_contanti_saldi"),
        supabase.from("ci_spese_registro").select("*").or("cosa.eq.abilitato,cosa.like.strumento*").order("id", { ascending: false }).limit(30),
        supabase.from("ci_conti").select("id, nome, tipo, stato").order("id"), supabase.from("ci_spese_strumenti_abilitati").select("*"),
        supabase.from("ci_spese").select("pagato_con, strumento_registrato_il").is("movimento_id", null).neq("stato", "Annullata"),
        supabase.from("ci_contanti").select("strumento, strumento_registrato_il").eq("tipo", "Prelievo").is("movimento_id", null).is("annullata_il", null)]);
      for (const x of [gestore, profili, abil, strum, reg, conti, abilCarte, speseSenzaBanca, prelSenzaBanca]) if (x.error) throw new Error(x.error.message);
      if (saldi.error) throw new Error("contanti per persona non letti: " + saldi.error.message);
      setD({ gestore: gestore.data === true, profili: (profili.data || []).map(p => ({ id: p.id, nome: nomeP(p) })).sort((a, b) => a.nome.localeCompare(b.nome)),
        abil: abil.data || [], strum: strum.data || [], saldi: Object.fromEntries((saldi.data || []).map(s => [s.persona, Number(s.saldo)])), reg: reg.data || [],
        conti: conti.data || [], abilCarte: abilCarte.data || [], speseSenzaBanca: speseSenzaBanca.data || [], prelSenzaBanca: prelSenzaBanca.data || [] });
    } catch (e) { setErrore("Lettura non riuscita: " + e.message); }
  }
  useEffect(() => { carica(); }, []);

  async function chiama(nome, args, ok) {
    if (occupato) return; setOccupato(true); setEsito(null);
    const r = await supabase.rpc(nome, args); setOccupato(false);
    if (r.error) return setEsito({ ok: false, testo: r.error.message });
    setEsito({ ok: true, testo: typeof ok === "function" ? ok(r.data) : ok }); setMod({}); await carica();
  }

  if (!d) return <div style={{ maxWidth: 900 }}><h2 style={{ color: C.primary }}>Abilitati alle spese</h2>{errore ? <div style={{ color: C.red }}>{errore}</div> : <div style={{ color: C.muted }}>Leggo…</div>}</div>;
  if (!d.gestore) return <div style={{ maxWidth: 900 }}><h2 style={{ color: C.primary }}>Abilitati alle spese</h2><div style={{ ...scheda, borderColor: C.yellow }}>Questa pagina la usa chi gestisce i conti.</div></div>;
  const nome = id => d.profili.find(p => p.id === id)?.nome || "—";
  const nonAbilitati = d.profili.filter(p => !d.abil.some(a => a.profilo_id === p.id));
  const abil = [...d.abil].sort((a, b) => nome(a.profilo_id).localeCompare(nome(b.profilo_id)));
  const banche = d.conti.filter(c => c.tipo === "banca" && c.stato === "aperto");
  const conto = id => d.conti.find(c => c.id === id)?.nome || "—";
  const eCarta = s => CARTE.includes(s.tipo);
  const daCompletare = s => eCarta(s) && !s.annullata_il && s.conto_id == null;
  const vive = d.strum.filter(s => !s.annullata_il), annullate = d.strum.filter(s => s.annullata_il);
  const nDaCompletare = vive.filter(daCompletare).length;
  // spese e prelievi senza banca rimasti a una registrazione annullata (o a quella prima di una nuova registrazione delle stesse cifre)
  const stessaOra = (a, b) => (a == null && b == null) || (a != null && b != null && new Date(a).getTime() === new Date(b).getTime());
  const orfani = s => !eCarta(s) ? { spese: 0, prelievi: 0 } : {
    spese: d.speseSenzaBanca.filter(x => x.pagato_con === s.nome && (s.annullata_il || !stessaOra(x.strumento_registrato_il, s.registrata_il))).length,
    prelievi: d.prelSenzaBanca.filter(x => x.strumento === s.nome && (s.annullata_il || !stessaOra(x.strumento_registrato_il, s.registrata_il))).length };
  const carteAttive = vive.filter(s => eCarta(s) && s.attivo);

  // funzione (non componente) per non perdere il cursore nei campi a ogni tasto
  function riga(s) {
    const k = "s:" + s.nome; const m = mod[k] || { motivo: "", conto: "", limite: "", giorno: "", esercente: "", persona: "", motivoAnn: "", togli: {} };
    const set = (c, v) => setMod(x => ({ ...x, [k]: { ...m, [c]: v } }));
    const abilitati = d.abilCarte.filter(a => a.strumento === s.nome).map(a => a.profilo_id).sort((a, b) => nome(a).localeCompare(nome(b)));
    const candidati = d.abil.filter(a => a.attivo && !abilitati.includes(a.profilo_id)).map(a => a.profilo_id).sort((a, b) => nome(a).localeCompare(nome(b)));
    const registrata = eCarta(s) && s.registrata_da;
    const stato = s.annullata_il ? ["annullata", C.muted] : daCompletare(s) ? ["da completare", C.red] : s.attivo ? ["attivo", C.green] : ["spento", C.muted];
    const credito = s.tipo === "Carta di credito", debito = s.tipo === "Carta di debito";
    const limiteNum = m.limite === "" ? null : Number(String(m.limite).replace(",", "."));
    const o = orfani(s);
    return (
      <div key={s.nome} style={{ borderTop: `1px solid ${C.border}`, padding: "7px 0", fontSize: 12.5, color: s.annullata_il ? C.muted : C.text }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ minWidth: 200 }}>{s.nome}{s.esercente ? <span style={{ fontWeight: 400, color: C.muted }}> · {s.esercente}</span> : null}</b>
          <b style={{ color: stato[1], minWidth: 90 }}>{stato[0]}</b>
          {!s.annullata_il && <>
            <input style={{ ...input, flex: "1 1 180px" }} placeholder="motivo" value={m.motivo} onChange={e => set("motivo", e.target.value)} />
            <button style={btn(false, s.attivo ? C.red : C.green)} disabled={occupato} onClick={() => chiama("ci_spese_strumento_cambia", { p_nome: s.nome, p_attivo: !s.attivo, p_motivo: m.motivo || null }, `${s.nome}: ${s.attivo ? "spento" : "acceso"}.`)}>{s.attivo ? "Spegni" : "Accendi"}</button>
          </>}
        </div>
        {registrata && <div style={{ color: C.muted, marginTop: 3 }}>
          Registrata dall'app da {nome(s.registrata_da)} il {data(s.registrata_il)}
          {s.conto_id != null && <> · posizione in «Banche, carte e cassa»: <b>{conto(s.conto_id)}</b> (completata da {nome(s.completata_da)} il {data(s.completata_il)})</>}
          {s.annullata_il && <> · annullata il {data(s.annullata_il)} da {nome(s.annullata_da)}: {s.annullata_motivo}</>}
        </div>}
        {!registrata && eCarta(s) && s.conto_id != null && <div style={{ color: C.muted, marginTop: 3 }}>Posizione in «Banche, carte e cassa»: {conto(s.conto_id)} · la usano tutti gli abilitati alle spese</div>}
        {registrata && !s.annullata_il && s.tipo === "Carta prepagata" && s.conto_id != null && <div style={{ color: C.muted, marginTop: 3 }}>Il saldo di partenza della carta si inserisce in «Banche, carte e cassa» (partenza del conto): finché manca, nell'app compare «Limite: da inserire dall'amministrazione».</div>}
        {registrata && !s.annullata_il && s.tipo === "Carta di credito" && <div style={{ color: C.muted, marginTop: 3 }}>Carta di credito: le spese restano «da addebitare» fino all'addebito mensile in banca. L'unione dell'addebito con le spese si costruisce quando la società avrà la prima carta di credito, sul suo primo estratto vero (versione 397: il Registro delle spese le mostra «Da addebitare»).</div>}

        {(o.spese + o.prelievi) > 0 && <div style={{ background: "#FFFBEA", border: `1px solid ${C.yellow}`, borderRadius: 8, padding: "8px 10px", marginTop: 6 }}>
          <div style={{ marginBottom: 6 }}><b>{o.spese} {o.spese === 1 ? "spesa" : "spese"} e {o.prelievi} {o.prelievi === 1 ? "prelievo" : "prelievi"} senza banca</b> rimasti a una registrazione annullata di questa carta. Se la carta vera era un'altra (cifre o tipo sbagliati), si spostano sulla carta giusta: entrano in attesa della banca di quella carta. Altrimenti si annulla la spesa in «Spese pagate: controllo».</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select style={input} value={m.verso || ""} onChange={e => set("verso", e.target.value)}><option value="">— carta giusta —</option>{carteAttive.map(c => <option key={c.nome} value={c.nome}>{c.nome}{c.esercente ? ` · ${c.esercente}` : ""}</option>)}</select>
            <input style={{ ...input, flex: "1 1 200px" }} placeholder="motivo dello spostamento" value={m.motivoSposta || ""} onChange={e => set("motivoSposta", e.target.value)} />
            <button style={btn(true)} disabled={occupato || !m.verso || !(m.motivoSposta || "").trim()} onClick={() => chiama("ci_spese_strumento_sposta", { p_da: s.nome, p_a: m.verso, p_motivo: m.motivoSposta },
              r => `Spostati su ${m.verso}: ${r?.spese ?? 0} spese e ${r?.prelievi ?? 0} prelievi.`)}>Sposta</button>
          </div>
        </div>}

        {daCompletare(s) && <div style={{ background: "#FFF5F5", border: `1px solid ${C.red}`, borderRadius: 8, padding: "8px 10px", marginTop: 6 }}>
          <div style={{ marginBottom: 6 }}><b>Da completare.</b> Finché non si completa, le spese e i prelievi con questa carta sono salvati ma non entrano in prima nota, e nell'app la persona vede «Limite: da inserire dall'amministrazione».
            Con «Completa» nasce la posizione in «Banche, carte e cassa» (o si collega quella che c'è già con le stesse 4 cifre) e le spese già fatte entrano in attesa della banca{credito ? " (con la carta di credito no: restano «da addebitare» fino all'addebito mensile)" : ""}.</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label>{debito ? "Conto in banca della carta" : credito ? "Conto in banca su cui si addebita" : "Conto da cui si ricarica (facoltativo)"}{" "}
              <select style={input} value={m.conto} onChange={e => set("conto", e.target.value)}><option value="">—</option>{banche.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
            {!s.tipo.includes("prepagata") && <label>Limite mensile € <input style={{ ...input, width: 100 }} inputMode="decimal" value={m.limite} onChange={e => set("limite", e.target.value)} placeholder="facoltativo" /></label>}
            {credito && <label>Giorno di addebito <input style={{ ...input, width: 60 }} inputMode="numeric" value={m.giorno} onChange={e => set("giorno", e.target.value.replace(/\D/g, ""))} /></label>}
            <label>Esercente <input style={{ ...input, width: 150 }} value={m.esercente} placeholder={s.esercente} onChange={e => set("esercente", e.target.value)} /></label>
            <button style={btn(true, C.green)} disabled={occupato || ((debito || credito) && !m.conto) || (credito && !m.giorno) || (limiteNum !== null && !(limiteNum > 0))}
              onClick={() => chiama("ci_spese_strumento_completa", { p_nome: s.nome, p_conto_addebito: m.conto ? Number(m.conto) : null, p_limite: limiteNum, p_giorno_addebito: m.giorno ? Number(m.giorno) : null, p_esercente: m.esercente || null },
                r => `${s.nome}: completata. Spese entrate in attesa della banca: ${r?.spese ?? 0}; prelievi: ${r?.prelievi ?? 0}.`)}>Completa</button>
          </div>
        </div>}

        {registrata && !s.annullata_il && <div style={{ marginTop: 6 }}>
          <div>Abilitati a questa carta: {abilitati.length === 0 ? <span style={{ color: C.red }}>nessuno</span> : null}</div>
          {abilitati.map(p => { const mt = (m.togli || {})[p] || ""; return (
            <div key={p} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "2px 0 2px 12px" }}>
              <span style={{ minWidth: 170 }}>{nome(p)}{p === s.registrata_da ? <span style={{ color: C.muted }}> (l'ha registrata)</span> : null}</span>
              <input style={{ ...input, flex: "1 1 160px" }} placeholder="motivo per togliere" value={mt} onChange={e => set("togli", { ...(m.togli || {}), [p]: e.target.value })} />
              <button style={btn(false, C.red)} disabled={occupato} onClick={() => chiama("ci_spese_strumento_abilita", { p_nome: s.nome, p_profilo: p, p_abilitato: false, p_motivo: mt || null }, `${nome(p)} tolto da ${s.nome}.`)}>Togli</button>
            </div>); })}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "4px 0 0 12px" }}>
            <select style={input} value={m.persona} onChange={e => set("persona", e.target.value)}><option value="">— aggiungi una persona abilitata alle spese —</option>{candidati.map(p => <option key={p} value={p}>{nome(p)}</option>)}</select>
            <button style={btn(true)} disabled={occupato || !m.persona} onClick={() => chiama("ci_spese_strumento_abilita", { p_nome: s.nome, p_profilo: m.persona, p_abilitato: true, p_motivo: null }, `${nome(m.persona)} abilitato a ${s.nome}.`)}>Abilita</button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            <input style={{ ...input, flex: "1 1 220px" }} placeholder="motivo dell'annullamento (es. carta personale registrata per sbaglio, cifre sbagliate)" value={m.motivoAnn} onChange={e => set("motivoAnn", e.target.value)} />
            <button style={btn(false, C.red)} disabled={occupato || !m.motivoAnn.trim()} onClick={() => chiama("ci_spese_strumento_annulla", { p_nome: s.nome, p_motivo: m.motivoAnn }, `${s.nome}: registrazione annullata. Le spese già salvate restano.`)}>Annulla la registrazione</button>
          </div>
        </div>}
      </div>);
  }

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

      <div style={{ ...scheda, borderColor: nDaCompletare ? C.red : C.border }}>
        <b>2. Strumenti in «Pagato con»</b>{nDaCompletare > 0 && <b style={{ color: C.red }}> · {nDaCompletare} {nDaCompletare === 1 ? "carta da completare" : "carte da completare"}</b>}
        {annullate.some(s => orfani(s).spese + orfani(s).prelievi > 0) && <b style={{ color: C.yellow }}> · spese da spostare in registrazioni annullate</b>}
        <div style={{ fontSize: 12, color: C.muted, margin: "4px 0" }}>Le carte della società le registra nell'app chi le riceve (tipo, esercente, ultime 4 cifre): la carta compare qui subito, con la sua cartella nell'archivio, e chi l'ha registrata la può usare. L'amministrazione la completa, aggiunge gli altri abilitati, la spegne o ne annulla la registrazione. Le carte personali non si registrano.</div>
        {vive.map(s => riga(s))}
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Uno strumento spento o annullato non compare più nell'app e una spesa con quello strumento non si salva. Le spese già salvate restano.</div>
        {annullate.length > 0 && <div style={{ marginTop: 8 }}>
          <button style={btn(false)} onClick={() => setVediAnnullate(v => !v)}>{vediAnnullate ? "Nascondi" : "Mostra"} le registrazioni annullate ({annullate.length})</button>
          {annullate.map(s => (vediAnnullate || orfani(s).spese + orfani(s).prelievi > 0) ? riga(s) : null)}
        </div>}
      </div>

      <div style={scheda}><b>Registro dei cambi (ultimi 30)</b>
        {d.reg.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted }}>Nessuno.</div> : d.reg.map(r => <div key={r.id} style={{ fontSize: 12.5 }}>{new Date(r.fatta_il).toLocaleString("it-IT", { timeZone: "Europe/Rome" })} — {nome(r.fatta_da)} — {r.cosa}: {r.riferimento} — da «{r.prima || "—"}» a «{r.dopo || "—"}»{r.motivo ? ` — ${r.motivo}` : ""}</div>)}</div>
    </div>
  );
}
