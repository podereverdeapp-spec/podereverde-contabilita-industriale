// Registro delle Modifiche (versione 232): chi ha inserito, cambiato o cancellato cosa,
// nell'app e nella Contabilità, dal 07/10/2026. Sola lettura.
// Versione 281 (decisione del Dott. Bizzarri del 23/10/2026): lettura a pagine. Prima la pagina mostrava solo
// le ultime 1.000 righe (il registro ne ha già più di 3.700): ora tutti i filtri li applica il database, il
// numero è quello di TUTTE le righe trovate e si scorrono 50, 100 o 200 righe per volta con «◀ precedenti /
// successive ▶» sopra e sotto la tabella. L'export Excel scarica tutte le righe trovate, 1.000 alla volta.
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { esportaExcel } from "./esportaExcel";
import { fetchAllPages } from "./parsingUtils";
import { GRUPPI } from "./FatturePassive";

const campo = { padding: "7px 9px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 };
const quandoIt = t => new Date(t).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const valori = o => o ? Object.entries(o).map(([k, v]) => `${k}: ${v === null ? "vuoto" : typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ") : "";
const virgolette = v => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export default function RegistroModifiche() {
  const [righe, setRighe] = useState([]);
  const [numero, setNumero] = useState(0);
  const [filtri, setFiltri] = useState({ tabella: "", persona: "", riga: "", dal: "" });
  const [rigaApplicata, setRigaApplicata] = useState("");
  const [scelte, setScelte] = useState({ tabelle: [], persone: [] });
  const [gruppo, setGruppo] = useState(50);
  const [inizio, setInizio] = useState(0);
  const [errore, setErrore] = useState("");
  const [caricando, setCaricando] = useState(false);
  const [esportando, setEsportando] = useState("");
  const ultimaRichiesta = useRef(0);

  // Elenco delle tabelle e delle persone presenti in TUTTO il registro (per i menu)
  useEffect(() => {
    supabase.rpc("ci_registro_scelte").then(({ data, error }) => {
      if (error) setErrore(`${error.message}\n\nIl database non ha ancora la funzione della versione 281: lanciare il file contabilita_strutture_v281.sql.`);
      else setScelte({ tabelle: data?.tabelle || [], persone: data?.persone || [] });
    });
  }, []);

  // La stessa interrogazione per la pagina e per l'export: tutti i filtri li applica il database
  function interrogazione(conConteggio) {
    let q = supabase.from("registro_modifiche_contabilita").select("*", conConteggio ? { count: "exact" } : undefined);
    if (filtri.tabella) q = q.eq("tabella", filtri.tabella);
    if (filtri.persona) q = q.or(`utente_nome.eq.${virgolette(filtri.persona)},and(utente_nome.is.null,provenienza.eq.${virgolette(filtri.persona)})`);
    if (rigaApplicata) q = q.eq("riga_id", rigaApplicata);
    if (filtri.dal) q = q.gte("quando", `${filtri.dal}T00:00:00`);
    // ordine stabile: a parità di momento, per tabella, record e azione
    return q.order("quando", { ascending: false }).order("tabella").order("riga_id").order("azione");
  }

  async function carica() {
    const n = ++ultimaRichiesta.current;
    setCaricando(true); setErrore("");
    const { data, error, count } = await interrogazione(true).range(inizio, inizio + gruppo - 1);
    if (n !== ultimaRichiesta.current) return;
    if (error) setErrore(error.message); else { setRighe(data || []); setNumero(count || 0); }
    setCaricando(false);
  }
  useEffect(() => { setInizio(0); }, [filtri.tabella, filtri.persona, filtri.dal, rigaApplicata, gruppo]);
  useEffect(() => { carica(); }, [filtri.tabella, filtri.persona, filtri.dal, rigaApplicata, gruppo, inizio]);

  async function esporta() {
    setEsportando("…");
    const { data, error } = await fetchAllPages((da, a) => { setEsportando(`letto ${da.toLocaleString("it-IT")} di ${numero.toLocaleString("it-IT")}`); return interrogazione(false).range(da, a); });
    if (error) { alert(`⚠️ Errore nell'esportazione:\n\n${error.message}`); setEsportando(""); return; }
    esportaExcel("Registro_modifiche", [{ nome: "Modifiche", righe: (data || []).map(r => ({ "Quando": quandoIt(r.quando), "Persona": r.utente_nome || "", "Provenienza": r.provenienza, "Tabella": r.tabella, "Record": r.riga_id, "Azione": r.azione, "Prima": valori(r.prima), "Dopo": valori(r.dopo) })) }]);
    setEsportando("");
  }

  const ultima = Math.min(inizio + gruppo, numero);
  const stile = dis => ({ ...campo, background: dis ? "#ddd" : C.primary, color: dis ? "#888" : "#fff", fontWeight: 700, cursor: dis ? "default" : "pointer" });
  const navigazione = numero > 0 && (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "10px 0", fontSize: 13 }}>
      <button onClick={() => setInizio(Math.max(0, inizio - gruppo))} disabled={inizio === 0 || caricando} style={stile(inizio === 0)}>◀ precedenti</button>
      <span style={{ color: C.muted }}>righe {(inizio + 1).toLocaleString("it-IT")}–{ultima.toLocaleString("it-IT")} di {numero.toLocaleString("it-IT")}</span>
      <button onClick={() => setInizio(inizio + gruppo)} disabled={ultima >= numero || caricando} style={stile(ultima >= numero)}>successive ▶</button>
      <label style={{ color: C.muted }}>per volta:{" "}
        <select value={gruppo} onChange={e => setGruppo(parseInt(e.target.value))} style={campo}>{GRUPPI.map(g => <option key={g} value={g}>{g}</option>)}</select>
      </label>
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
      <h2 style={{ margin: 0, color: C.primary }}>🕓 Registro delle Modifiche</h2>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Ogni inserimento, modifica e cancellazione nelle tabelle sorvegliate dell'app e della Contabilità, dal 07/10/2026. I filtri li applica il database su tutto il registro; si vedono 50, 100 o 200 righe per volta.</div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
        <select value={filtri.tabella} onChange={e => setFiltri({ ...filtri, tabella: e.target.value })} style={campo}><option value="">Tutte le tabelle</option>{scelte.tabelle.map(t => <option key={t}>{t}</option>)}</select>
        <select value={filtri.persona} onChange={e => setFiltri({ ...filtri, persona: e.target.value })} style={campo}><option value="">Tutte le persone</option>{scelte.persone.map(p => <option key={p}>{p}</option>)}</select>
        <input placeholder="Numero del record" value={filtri.riga} onChange={e => setFiltri({ ...filtri, riga: e.target.value })} onKeyDown={e => e.key === "Enter" && setRigaApplicata(filtri.riga.trim())} style={{ ...campo, width: 150 }} />
        Dal <input type="date" value={filtri.dal} onChange={e => setFiltri({ ...filtri, dal: e.target.value })} style={campo} />
        <button onClick={() => { if (filtri.riga.trim() !== rigaApplicata) setRigaApplicata(filtri.riga.trim()); else carica(); }} style={{ ...campo, background: C.primary, color: "#fff", fontWeight: 700, cursor: "pointer" }}>{caricando ? "…" : "Cerca"}</button>
        <button onClick={esporta} disabled={!numero || !!esportando} style={{ ...campo, cursor: "pointer" }}>{esportando ? `Esportazione… ${esportando}` : "Esporta Excel"}</button>
      </div>
      {errore && <div style={{ color: C.red, marginTop: 10, whiteSpace: "pre-wrap" }}>⚠️ {errore}</div>}
      {navigazione}
      <table style={{ fontSize: 12.5, background: C.card, marginTop: 4 }}>
        <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Quando", "Persona", "Tabella", "Record", "Azione", "Prima", "Dopo"].map(h => <th key={h} style={{ padding: 7, textAlign: "left", background: C.primary, color: "#fff" }}>{h}</th>)}</tr></thead>
        <tbody>{righe.map((r, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, verticalAlign: "top", background: r.azione === "ERRORE DEL REGISTRO" ? "#FDECEA" : undefined }}>
            <td style={{ padding: 7, whiteSpace: "nowrap" }}>{quandoIt(r.quando)}</td>
            <td style={{ padding: 7 }}>{r.utente_nome || <span style={{ color: C.muted }}>{r.provenienza}</span>}</td>
            <td style={{ padding: 7 }}>{r.tabella}</td><td style={{ padding: 7 }}>{r.riga_id}</td><td style={{ padding: 7 }}>{r.azione}</td>
            <td style={{ padding: 7, maxWidth: 300, wordBreak: "break-word" }}>{valori(r.prima)}</td>
            <td style={{ padding: 7, maxWidth: 300, wordBreak: "break-word" }}>{valori(r.dopo)}</td>
          </tr>))}
          {!caricando && righe.length === 0 && <tr><td colSpan={7} style={{ padding: 12, color: C.muted }}>Nessuna modifica con questi filtri.</td></tr>}
        </tbody>
      </table>
      {!caricando && navigazione}
    </div>
  );
}
