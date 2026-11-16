// Versione 383 (Tenente, 16/11/2026): «Chiusura del mese delle spese» (B6 approvata dal Dott. Bizzarri il 13/11/2026 alle 13:05; conta dei contanti B3).
// Entro il 5 del mese dopo: estratti delle carte caricati, spese controllate, contanti contati per persona, rimborsi approvati.
// Il programma elenca ciò che impedisce la chiusura (ci_spese_mese_impedimenti); con l'elenco vuoto chi gestisce i conti preme «Chiudi il mese
// delle spese». Dopo, le spese, i prelievi e le consegne di quel mese non cambiano più: si corregge solo con lo storno in prima nota.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { dataIt, euro } from "./analisiDocumentoBanca";
import { leggiImporto } from "./SpesePagateControllo";
const nomeP = p => String(p?.nome || "").trim() + (p?.cognome ? " " + p.cognome : "");
const oggiRoma = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const meseIt = m => { const [a, b] = String(m).split("-"); return ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"][Number(b) - 1] + " " + a; };
const PARTENZA = "2026-11-01";   // «Spese pagate» parte da novembre 2026
// mesi finiti dalla partenza a quello scorso, il più recente in alto
export function mesiChiudibili(oggi) {
  const out = []; let [a, m] = oggi.split("-").map(Number);
  for (;;) { m -= 1; if (m === 0) { m = 12; a -= 1; } const x = `${a}-${String(m).padStart(2, "0")}-01`; if (x < PARTENZA) break; out.push(x); }
  return out;
}

export default function ChiusuraMeseSpese() {
  const [mese, setMese] = useState(mesiChiudibili(oggiRoma())[0] || null);
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState(null);
  const [occupato, setOccupato] = useState(false);
  const [conta, setConta] = useState({});   // per persona: contati, nota
  const [nota, setNota] = useState("");

  async function carica() {
    setErrore(""); setD(null);
    try {
      const [gestore, mesi, profili, abil] = await Promise.all([supabase.rpc("ci_puo_gestire_conti"), supabase.from("ci_spese_mesi").select("*").order("mese", { ascending: false }),
        supabase.from("profili").select("id, nome, cognome"), supabase.from("ci_spese_abilitati").select("profilo_id, puo_avere_contanti")]);
      for (const x of [gestore, mesi, profili, abil]) if (x.error) throw new Error(x.error.message);
      let imp = [], conte = [];
      if (gestore.data === true && mese) {
        const [i, c] = await Promise.all([supabase.rpc("ci_spese_mese_impedimenti", { p_mese: mese }),
          supabase.from("ci_contanti_conte").select("*").eq("mese", mese).is("sostituita_il", null)]);
        if (i.error) throw new Error(i.error.message); if (c.error) throw new Error(c.error.message);
        imp = i.data || []; conte = c.data || [];
      }
      setD({ gestore: gestore.data === true, chiusi: mesi.data || [], nomi: Object.fromEntries((profili.data || []).map(p => [p.id, nomeP(p)])),
        persone: (abil.data || []).filter(a => a.puo_avere_contanti).map(a => a.profilo_id), imp, conte });
    } catch (e) { setErrore("Lettura non riuscita: " + e.message); }
  }
  useEffect(() => { carica(); }, [mese]);

  async function chiama(nome, args, ok) {
    if (occupato) return; setOccupato(true); setEsito(null);
    const r = await supabase.rpc(nome, args); setOccupato(false);
    if (r.error) return setEsito({ ok: false, testo: r.error.message });
    setEsito({ ok: true, testo: typeof ok === "function" ? ok(r.data) : ok }); setConta({}); setNota(""); await carica();
  }

  const mesi = mesiChiudibili(oggiRoma());
  if (!d) return <div style={{ maxWidth: 1000 }}><h2 style={{ color: C.primary }}>Chiusura del mese delle spese</h2>{errore ? <div style={{ color: C.red }}>{errore}</div> : <div style={{ color: C.muted }}>Leggo…</div>}</div>;
  if (!d.gestore) return <div style={{ maxWidth: 1000 }}><h2 style={{ color: C.primary }}>Chiusura del mese delle spese</h2><div style={{ ...scheda, borderColor: C.yellow }}>Il mese lo chiude chi gestisce i conti (Teresa Demaria; al suo posto il Dott. Bizzarri o Colabucci).</div></div>;
  const chiuso = d.chiusi.find(x => x.mese === mese);
  const precedenteAperto = mese && mese > PARTENZA && !d.chiusi.some(x => x.mese === mesiChiudibili(mese.slice(0, 8) + "15")[0]);

  return (
    <div style={{ maxWidth: 1000 }}>
      <h2 style={{ margin: "0 0 4px", color: C.primary }}>Chiusura del mese delle spese</h2>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Entro il 5 del mese dopo. Il programma elenca ciò che impedisce la chiusura; quando l'elenco è vuoto si chiude. Dopo, le spese, i prelievi e le consegne del mese non cambiano più.</div>
      {errore && <div style={{ ...scheda, borderColor: C.red, color: C.red }}>{errore}</div>}
      {esito && <div style={{ ...scheda, borderColor: esito.ok ? C.green : C.red, color: esito.ok ? C.green : C.red, fontWeight: 700 }}>{esito.testo}</div>}
      <div style={{ ...scheda, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b>Mese</b>
        {mesi.length === 0 ? <span style={{ color: C.muted }}>Il primo mese da chiudere è novembre 2026: si chiude dal 1° dicembre.</span>
          : <select style={input} value={mese || ""} onChange={e => setMese(e.target.value)}>{mesi.map(m => <option key={m} value={m}>{meseIt(m)}{d.chiusi.some(x => x.mese === m) ? " (chiuso)" : ""}</option>)}</select>}
        <button style={btn(false)} onClick={carica}>Aggiorna</button>
      </div>
      {!mese ? null : chiuso ? <div style={{ ...scheda, borderColor: C.green, color: C.green, fontWeight: 700 }}>✓ {meseIt(mese)} è chiuso: da {d.nomi[chiuso.chiuso_da] || "—"} il {new Date(chiuso.chiuso_il).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}{chiuso.nota ? ` — ${chiuso.nota}` : ""}.</div> : <>
        <div style={scheda}>
          <b>1. Contanti contati a fine mese</b>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Quanto aveva in mano ciascuno l'ultimo giorno del mese. Il programma lo confronta con il suo conto (prelievi e contanti ricevuti meno spese, consegne e rimborsi pagati). Se è diverso si scrive la spiegazione: il mese si chiude solo quando la differenza è chiarita.</div>
          {d.persone.map(p => { const k = d.conte.find(x => x.persona === p); const c = conta[p] || {}; const imp = /^\s*0([,.]0{1,2})?\s*$/.test(String(c.contati || "")) ? 0 : leggiImporto(c.contati); return (
            <div key={p} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, borderTop: `1px solid ${C.border}`, padding: "5px 0" }}>
              <b style={{ minWidth: 170 }}>{d.nomi[p]}</b>
              {k ? <span style={{ color: Number(k.differenza) === 0 ? C.green : C.red }}>contati {euro(k.contati)}, programma {euro(k.saldo_programma)}{Number(k.differenza) !== 0 ? ` — differenza ${euro(k.differenza)}${k.nota ? ` (${k.nota})` : ""}` : " ✓"}</span> : <span style={{ color: C.muted }}>non contati</span>}
              <input style={{ ...input, width: 100 }} placeholder="contati" value={c.contati || ""} onChange={e => setConta(x => ({ ...x, [p]: { ...c, contati: e.target.value } }))} />
              <input style={{ ...input, flex: "1 1 200px" }} placeholder="spiegazione (solo se diverso dal programma)" value={c.nota || ""} onChange={e => setConta(x => ({ ...x, [p]: { ...c, nota: e.target.value } }))} />
              <button style={btn(true)} disabled={occupato || imp === null}
                onClick={() => chiama("ci_contanti_conta", { p_persona: p, p_mese: mese, p_contati: imp, p_nota: c.nota || null }, x => `Conta di ${d.nomi[p]} registrata: programma ${euro(x?.saldo_programma)}, differenza ${euro(x?.differenza)}.`)}>{k ? "Conta di nuovo" : "Registra la conta"}</button>
            </div>); })}
        </div>
        <div style={{ ...scheda, borderColor: d.imp.length ? C.red : C.green }}>
          <b>2. Che cosa impedisce la chiusura di {meseIt(mese)}</b>
          {d.imp.length === 0 ? <div style={{ color: C.green, fontWeight: 700, marginTop: 6 }}>✓ Niente: il mese si può chiudere.</div>
            : d.imp.map((x, i) => <div key={i} style={{ fontSize: 12.5, color: C.red, marginTop: 3 }}>✗ <b>{x.tipo}</b>: {x.descrizione}{Number(x.quanti) > 1 || (Number(x.quanti) === 1 && !x.tipo.startsWith("Contanti")) ? ` — ${x.quanti}` : ""}{Number(x.importo) ? `, ${euro(x.importo)}` : ""}</div>)}
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Dove si sistemano: spese → «Spese pagate: controllo»; carta 8006 → «Carte prepagate: verifica»; carta 1894 e prelievi → «Conferma dei movimenti»; estratti → «Carica documenti della banca»; consegne → chi riceve conferma dall'app; rimborsi → «Rimborsi delle spese».</div>
        </div>
        <div style={scheda}>
          <b>3. Chiudi il mese</b>
          {precedenteAperto && <div style={{ fontSize: 12.5, color: C.red }}>Prima si chiude il mese precedente.</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            <input style={{ ...input, flex: "1 1 300px" }} placeholder="nota (facoltativa)" value={nota} onChange={e => setNota(e.target.value)} />
            <button style={{ ...btn(true, C.green), opacity: occupato || d.imp.length > 0 || precedenteAperto ? 0.45 : 1 }} disabled={occupato || d.imp.length > 0 || precedenteAperto}
              onClick={() => chiama("ci_spese_mese_chiudi", { p_mese: mese, p_nota: nota || null }, `${meseIt(mese)} chiuso.`)}>Chiudi il mese delle spese</button>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Dopo la chiusura le spese, i prelievi e le consegne del mese non si correggono più dal programma né dall'app: un errore si corregge con lo storno in prima nota. Resta possibile pagare il rimborso di spese già approvate.</div>
        </div>
      </>}
      {d.chiusi.length > 0 && <div style={scheda}><b>Mesi chiusi</b>{d.chiusi.map(x => <div key={x.mese} style={{ fontSize: 12.5 }}>{meseIt(x.mese)} — {d.nomi[x.chiuso_da] || "—"}, {dataIt(x.chiuso_il.slice(0, 10))}{x.nota ? ` — ${x.nota}` : ""}</div>)}</div>}
    </div>
  );
}
