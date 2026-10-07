// Registro Controlli (versione 232): le anomalie trovate nei registri dell'app e della Contabilità,
// con lo stato, la decisione del Dott. Bizzarri, la persona da interrogare e la correzione diretta.
// Ogni correzione scrive UN SOLO campo di UN SOLO record, e solo se il valore è ancora quello
// mostrato (se nel frattempo qualcuno l'ha cambiato, la correzione non viene fatta).
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { fetchAllPages } from "./parsingUtils";
import { eseguiControlli, personePerRecord, STATI_ANOMALIA, dataIt } from "./controlliRegistri";

const COLORE_AREA = { "Fatture": C.primaryLight, "Lotti suini": C.suini, "Parti": "#7A5C8E", "Animali": C.bovini, "Cespiti": C.blue, "Costi": C.accent, "Fatture acquisto": C.green };
const bottone = (colore, pieno = true) => ({ background: pieno ? colore : "transparent", color: pieno ? "#fff" : colore, border: `1.5px solid ${colore}`, borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" });
const campo = { padding: "7px 9px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 };
const quandoIt = t => t ? new Date(t).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// Quali anomalie si possono correggere direttamente da qui, e su quale campo
const CORREZIONI = {
  L1: { tabella: "lotti_suini", campo: "madre_id", etichetta: "Madre del lotto", tipo: "madre" },
  L3: { tabella: "lotti_suini", campo: "padre_id", etichetta: "Padre del lotto", tipo: "padre" },
  L4: { tabella: "lotti_suini", campo: "madre_id", etichetta: "Madre del lotto", tipo: "madre" },
  A1: { tabella: "animali", campo: "prezzo_acquisto", etichetta: "Prezzo d'acquisto (€)", tipo: "numero" },
  A2: { tabella: "animali", campo: "numero_fattura", etichetta: "Numero della fattura d'acquisto", tipo: "testo" },
  A3: { tabella: "animali", campo: "data_uscita", etichetta: "Data di uscita", tipo: "data" },
  A4: { tabella: "animali", campo: "data_uscita", etichetta: "Data di uscita", tipo: "data" },
  C1: { tabella: "ci_cespiti", campo: "specie", etichetta: "Imputazione del cespite", tipo: "specie" },
  R1: { tabella: "ci_articoli_fattura", campo: "tipo_costo", etichetta: "Tipo di Costo della riga", tipo: "scelta", scelte: ["Fisso", "Variabile", "Ammortizzabile"] },
  R2: { tabella: "ci_fornitori", campo: "partita_iva", etichetta: "Partita IVA del fornitore", tipo: "testo" },
};
const DOVE_SI_CORREGGE = {
  L2: "Si decide quale dei due lotti è giusto; la correzione del lotto si fa nell'app (o con istruzione diretta del Topo).",
  P1: "Il lotto mancante si crea nell'app.", P2: "L'evento di parto mancante si registra nell'app.",
  P3: "Si decide quale dei due parti è giusto; la correzione si fa nell'app.",
  C2: "Le righe le pulisce il ricalcolo dei costi.", C3: "Si riempie con l'elaborazione della pagina «Report Riproduttori».",
  F1: "Pagina «Abbinamenti Fatture Acquisto».", F2: "Pagina «Abbinamenti Fatture Acquisto», sezione «Già collegate».",
};
const SPECIE_CESPITE = { "Generale": ["Generale"], "Bovini": ["Bovini"], "Suini": ["Suini"], "Ovini": ["Ovini"], "Cavalli": ["Cavalli"], "Pollame": ["Pollame"], "Orto": ["Orto"] };

function Correzione({ anomalia, onFatta }) {
  const reg = CORREZIONI[anomalia.codice];
  const [record, setRecord] = useState(null);
  const [scelte, setScelte] = useState([]);
  const [valore, setValore] = useState("");
  const [stato, setStato] = useState(""); // per A3/A4 si può cambiare anche lo stato
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from(reg.tabella).select("*").eq("id", Number(anomalia.riga_id)).single();
      if (error) { setErrore(error.message); return; }
      setRecord(data);
      const attuale = data[reg.campo];
      setValore(reg.tipo === "specie" ? (attuale?.[0] || "") : (attuale ?? ""));
      if (anomalia.codice === "A4" || anomalia.codice === "A3") setStato(data.stato || "");
      if (reg.tipo === "padre" || reg.tipo === "madre") {
        const sesso = reg.tipo === "padre" ? "M" : "F";
        const { data: cand } = await fetchAllPages((da, a) => supabase.from("animali")
          .select("id,bdn,nome,sesso,specie,riproduttore,data_ingresso,nascita,data_uscita").eq("specie", "suino").eq("sesso", sesso).order("bdn").range(da, a));
        const giorno = data.data_parto;
        setScelte((cand || []).map(c => {
          const entrata = c.data_ingresso || c.nascita;
          const presente = !giorno || ((!entrata || entrata <= giorno) && (!c.data_uscita || c.data_uscita >= giorno));
          return { id: c.id, testo: `${c.bdn || c.nome || c.id}${c.nome && c.bdn ? ` (${c.nome})` : ""}${presente ? "" : " — NON presente quel giorno"}`, presente, riproduttore: c.riproduttore };
        }).sort((a, b) => (b.presente - a.presente) || (b.riproduttore - a.riproduttore)));
      }
    })();
  }, [anomalia.id]);

  if (errore) return <div style={{ color: C.red, fontSize: 13 }}>{errore}</div>;
  if (!record) return <div style={{ fontSize: 13, color: C.muted }}>Lettura del dato…</div>;
  const attuale = record[reg.campo];
  const nomeScelta = id => (scelte.find(x => x.id === Number(id))?.testo || `capo ${id}`).replace(" — NON presente quel giorno", "");
  const attualeTesto = reg.tipo === "specie" ? (attuale?.length ? attuale.join(", ") : "vuoto")
    : (attuale === null || attuale === "" ? "vuoto" : (reg.tipo === "padre" || reg.tipo === "madre") ? nomeScelta(attuale) : String(attuale));

  async function salva() {
    let nuovo = valore === "" ? null : (reg.tipo === "testo" ? String(valore).trim() : valore);
    if ((reg.tipo === "scelta" || reg.tipo === "testo") && !nuovo) { setErrore("Inserire il nuovo valore."); return; }
    if (reg.campo === "partita_iva") nuovo = nuovo.toUpperCase().replace(/\s+/g, "");
    if (reg.tipo === "numero") { nuovo = parseFloat(String(valore).replace(",", ".")); if (!(nuovo > 0)) { setErrore("Inserire un importo maggiore di zero."); return; } }
    if (reg.tipo === "padre" || reg.tipo === "madre") nuovo = nuovo ? Number(nuovo) : null;
    if (reg.tipo === "specie") nuovo = SPECIE_CESPITE[valore] || [];
    const cambiaStato = (anomalia.codice === "A3" || anomalia.codice === "A4") && stato !== (record.stato || "");
    const descrNuovo = reg.tipo === "specie" ? (nuovo.join(", ") || "vuoto") : (reg.tipo === "padre" || reg.tipo === "madre") ? (nuovo ? nomeScelta(nuovo) : "vuoto") : (nuovo ?? "vuoto");
    if (!window.confirm(`Confermi la correzione?\n\n${anomalia.titolo}\n\n${reg.etichetta}: da «${attualeTesto}» a «${descrNuovo}»${cambiaStato ? `\nStato: da «${record.stato}» a «${stato}»` : ""}\n\nViene scritto solo questo campo di questo record.`)) return;
    setSalvando(true); setErrore("");
    const modifica = { [reg.campo]: nuovo };
    if (cambiaStato) modifica.stato = stato;
    let q = supabase.from(reg.tabella).update(modifica).eq("id", record.id);
    // Scrive solo se il valore è ancora quello letto (nessuno l'ha cambiato nel frattempo)
    if (reg.tipo === "specie") q = attuale === null ? q.is("specie", null) : q.eq("specie", `{${(attuale || []).join(",")}}`);
    else q = attuale === null ? q.is(reg.campo, null) : q.eq(reg.campo, attuale);
    const { data: scritti, error } = await q.select("id");
    if (error) { setErrore(error.message); setSalvando(false); return; }
    if (!scritti || scritti.length !== 1) { setErrore("Il dato è stato cambiato da qualcun altro nel frattempo (oppure manca il permesso): correzione NON fatta. Ricaricare la pagina."); setSalvando(false); return; }
    await supabase.from("ci_anomalie").update({ stato: "decisa", decisione: `Corretto dal Registro Controlli: ${reg.etichetta.toLowerCase()} da «${attualeTesto}» a «${descrNuovo}»${cambiaStato ? `; stato da «${record.stato}» a «${stato}»` : ""}.`, decisa_at: new Date().toISOString() }).eq("id", anomalia.id);
    setSalvando(false);
    onFatta();
  }

  return (
    <div style={{ background: "#F4F8F5", border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginTop: 10 }}>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>{reg.etichetta} — valore attuale: <b style={{ color: C.text }}>{attualeTesto}</b></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {(reg.tipo === "padre" || reg.tipo === "madre") && (
          <select value={valore} onChange={e => setValore(e.target.value)} style={{ ...campo, minWidth: 320 }}>
            <option value="">— scegliere —</option>
            {scelte.map(s => <option key={s.id} value={s.id}>{s.testo}</option>)}
          </select>
        )}
        {reg.tipo === "numero" && <input type="number" step="0.01" value={valore} onChange={e => setValore(e.target.value)} style={{ ...campo, width: 160 }} />}
        {reg.tipo === "scelta" && (
          <select value={valore || ""} onChange={e => setValore(e.target.value)} style={campo}>
            <option value="">— scegliere —</option>
            {reg.scelte.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        )}
        {reg.tipo === "testo" && <input value={valore} onChange={e => setValore(e.target.value)} style={{ ...campo, width: 220 }} />}
        {reg.tipo === "data" && <input type="date" value={valore || ""} onChange={e => setValore(e.target.value)} style={campo} />}
        {(anomalia.codice === "A3" || anomalia.codice === "A4") && (
          <select value={stato} onChange={e => setStato(e.target.value)} style={campo}>
            {["attivo", "macellato", "venduto", "deceduto", "uscito", "trasferito", "storico"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {reg.tipo === "specie" && (
          <select value={valore} onChange={e => setValore(e.target.value)} style={campo}>
            <option value="">Nessuna (resta escluso dai costi)</option>
            {Object.keys(SPECIE_CESPITE).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <button onClick={salva} disabled={salvando} style={bottone(C.primary)}>{salvando ? "Salvataggio…" : "Salva la correzione"}</button>
      </div>
    </div>
  );
}

function SchedaAnomalia({ a, persona, onCambiata }) {
  const [apri, setApri] = useState(null); // "decidi" | "lascia" | "correggi"
  const [testo, setTesto] = useState(a.decisione || "");
  const tabelleConPersona = ["animali", "lotti_suini", "eventi_riproduttivi", "ci_cespiti", "ci_articoli_fattura", "ci_fornitori"];

  async function aggiorna(campi) {
    const { error } = await supabase.from("ci_anomalie").update(campi).eq("id", a.id);
    if (error) { alert(`⚠️ ${error.message}`); return; }
    setApri(null); onCambiata();
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `5px solid ${COLORE_AREA[a.area] || C.muted}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: COLORE_AREA[a.area] || C.muted, borderRadius: 6, padding: "2px 7px" }}>{a.area}</span>
        <span style={{ fontWeight: 800, fontSize: 14 }}>{a.titolo}</span>
      </div>
      {a.descrizione && <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>{a.descrizione}</div>}
      <div style={{ fontSize: 12, color: C.muted, marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span>Trovata il {quandoIt(a.prima_rilevata_at)}</span>
        {tabelleConPersona.includes(a.tabella) && a.riga_id && (
          <span>👤 {persona
            ? <>Ultima modifica: <b style={{ color: C.text }}>{persona.utente_nome || persona.provenienza}</b> ({persona.azione}, {quandoIt(persona.quando)})</>
            : <>Autore non registrato (dato inserito prima del registro delle modifiche, 07/10/2026)</>}</span>
        )}
        {a.stato === "risolta" && <span>Risolta il {quandoIt(a.risolta_at)}</span>}
      </div>
      {a.decisione && <div style={{ fontSize: 13, marginTop: 6, background: "#FFF8E6", borderRadius: 6, padding: "6px 9px" }}><b>Decisione</b> ({quandoIt(a.decisa_at)}): {a.decisione}</div>}
      {DOVE_SI_CORREGGE[a.codice] && a.stato !== "risolta" && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Dove si corregge: {DOVE_SI_CORREGGE[a.codice]}</div>}
      {a.stato !== "risolta" && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {CORREZIONI[a.codice] && <button onClick={() => setApri(apri === "correggi" ? null : "correggi")} style={bottone(C.primary)}>✏️ Correggi</button>}
          {a.stato === "aperta" && <button onClick={() => setApri(apri === "decidi" ? null : "decidi")} style={bottone(C.blue, false)}>📝 Scrivi la decisione</button>}
          {a.stato === "aperta" && <button onClick={() => setApri(apri === "lascia" ? null : "lascia")} style={bottone(C.muted, false)}>Lascia com'è</button>}
          {a.stato !== "aperta" && <button onClick={() => aggiorna({ stato: "aperta", decisa_at: null })} style={bottone(C.red, false)}>Riapri</button>}
        </div>
      )}
      {apri === "correggi" && <Correzione anomalia={a} onFatta={() => { setApri(null); onCambiata(true); }} />}
      {(apri === "decidi" || apri === "lascia") && (
        <div style={{ marginTop: 10 }}>
          <textarea value={testo} onChange={e => setTesto(e.target.value)} rows={2} placeholder={apri === "decidi" ? "La decisione (es. «il padre è MACULATO01, lo corregge il Topo»)" : "Perché resta com'è"} style={{ ...campo, width: "100%", boxSizing: "border-box" }} />
          <button onClick={() => { if (!testo.trim()) { alert("Scrivere la decisione o il motivo."); return; } aggiorna({ stato: apri === "decidi" ? "decisa" : "ignorata", decisione: testo.trim(), decisa_at: new Date().toISOString() }); }}
            style={{ ...bottone(C.primary), marginTop: 6 }}>Salva</button>
        </div>
      )}
    </div>
  );
}

export default function RegistroControlli({ onCambiaAperte }) {
  const [anomalie, setAnomalie] = useState([]);
  const [diario, setDiario] = useState([]);
  const [persone, setPersone] = useState(new Map());
  const [vista, setVista] = useState("aperta");
  const [area, setArea] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState("");

  async function carica() {
    const [{ data, error }, { data: d }, mappa] = await Promise.all([
      fetchAllPages((da, a) => supabase.from("ci_anomalie").select("*").order("area").order("id").range(da, a)),
      supabase.from("ci_controlli_eseguiti").select("*").order("eseguito_at", { ascending: false }).limit(50),
      personePerRecord(),
    ]);
    if (error) { setErrore(`${error.message} — il database è stato aggiornato con le strutture della versione 232?`); return; }
    setAnomalie(data || []); setDiario(d || []); setPersone(mappa);
    onCambiaAperte?.((data || []).filter(x => x.stato === "aperta").length);
  }
  useEffect(() => { carica(); }, []);

  async function controllaAdesso(origine = "pulsante «Esegui i controlli»") {
    setLavoro(true); setErrore("");
    try {
      const esito = await eseguiControlli(origine);
      await carica();
      if (origine.startsWith("pulsante")) alert(`Controlli eseguiti.\n\nAnomalie trovate: ${esito.trovate}\nNuove: ${esito.nuove}\nRisolte: ${esito.risolte}\nDa decidere: ${esito.aperte}${esito.nonEseguibili.length ? `\n\nNon eseguiti: ${esito.nonEseguibili.join("; ")}` : ""}`);
    } catch (e) { setErrore(e.message); }
    setLavoro(false);
  }

  const conteggi = Object.fromEntries(Object.keys(STATI_ANOMALIA).map(s => [s, anomalie.filter(a => a.stato === s).length]));
  const aree = [...new Set(anomalie.map(a => a.area))].sort();
  const elenco = anomalie.filter(a => a.stato === vista && (!area || a.area === area));

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, color: C.primary }}>🛡️ Registro Controlli</h2>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Le anomalie trovate nei registri dell'app e della Contabilità. Una decisione presa non viene riproposta.</div>
        </div>
        <button onClick={() => controllaAdesso()} disabled={lavoro} style={bottone(C.primary)}>{lavoro ? "Controlli in corso…" : "🔄 Esegui i controlli adesso"}</button>
      </div>
      {errore && <div style={{ background: "#FDECEA", color: C.red, borderRadius: 8, padding: 12, marginTop: 12, fontSize: 13 }}>⚠️ {errore}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
        {Object.entries(STATI_ANOMALIA).map(([s, etichetta]) => (
          <button key={s} onClick={() => setVista(s)} style={{ ...bottone(s === "aperta" ? C.red : C.primary, vista === s), padding: "8px 14px" }}>{etichetta} ({conteggi[s] || 0})</button>
        ))}
        <button onClick={() => setVista("diario")} style={{ ...bottone(C.accent, vista === "diario"), padding: "8px 14px" }}>Diario dei controlli</button>
      </div>
      {vista !== "diario" && aree.length > 1 && (
        <div style={{ marginTop: 10, fontSize: 13 }}>Area:{" "}
          <select value={area} onChange={e => setArea(e.target.value)} style={campo}><option value="">Tutte</option>{aree.map(x => <option key={x}>{x}</option>)}</select>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        {vista === "diario" ? (
          <table style={{ fontSize: 13, background: C.card }}>
            <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Quando", "Origine", "Controlli eseguiti", "Non eseguiti", "Anomalie trovate", "Nuove", "Risolte", "Da decidere"].map(h => <th key={h} style={{ padding: 8, textAlign: "left", background: C.primary, color: "#fff" }}>{h}</th>)}</tr></thead>
            <tbody>{diario.map(d => (
              <tr key={d.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: 8 }}>{quandoIt(d.eseguito_at)}</td><td style={{ padding: 8 }}>{d.origine}</td><td style={{ padding: 8 }}>{d.controlli_eseguiti}</td>
                <td style={{ padding: 8, color: d.controlli_non_eseguibili ? C.red : C.muted }}>{d.controlli_non_eseguibili || "—"}</td>
                <td style={{ padding: 8 }}>{d.anomalie_trovate}</td><td style={{ padding: 8 }}>{d.nuove}</td><td style={{ padding: 8 }}>{d.risolte}</td><td style={{ padding: 8, fontWeight: 800 }}>{d.aperte}</td>
              </tr>))}
              {diario.length === 0 && <tr><td colSpan={8} style={{ padding: 12, color: C.muted }}>Nessun controllo ancora eseguito.</td></tr>}
            </tbody>
          </table>
        ) : elenco.length === 0 ? (
          <div style={{ color: C.muted, padding: 20, textAlign: "center" }}>Nessuna anomalia in questo elenco.</div>
        ) : elenco.map(a => <SchedaAnomalia key={a.id} a={a} persona={persone.get(`${a.tabella}|${String(a.riga_id).split("-").pop()}`)} onCambiata={rifai => rifai ? controllaAdesso("dopo una correzione") : carica()} />)}
      </div>
    </div>
  );
}
