// Versione 408 (Tenente, 26/11/2026) — «Rapporti finanziari con i soci – Entrate/uscite».
// Decisioni del Dott. Bizzarri del 26/11/2026 ore 10:46–13:55 (claude/tenente_decisioni_26_11_1046_rapporti_sociali.md; giro approvato alle 13:55:
// claude/tenente_giro_soci_26_11.md) e delle 16:55–17:28 (claude/tenente_408_soci_veri_26_11.md): riepilogo dei finanziamenti dei soci con le date
// di entrata; documenti originali nella cartella del cloud «FINANZIAMENTO SOCI_…», copia verificata nel programma (decisione «C» delle 17:24).
// La vedono e la usano solo i gestori dei conti (lo bloccano anche le funzioni del database). Le regole sui soldi sono nel database (ci_soci_*).
// I pagamenti e i versamenti si fanno da «Incassi e pagamenti» → «Soci e partecipate»; le righe della banca da «Conferma dei movimenti».
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
import { euro } from "./analisiDocumentoBanca";
import { dataIt, oggiRoma, ibanPulito, ibanValido } from "./regoleIncassiPagamenti";
import { NOME_CARTELLA, browserAdatto, cartellaSociRicordata, scegliCartellaSoci, leggiCartellaSoci, fileNelProgramma, archiviaNelProgramma, archiviaECarica, apriDocumentoSocio } from "./sociArchivio";
import { permesso } from "./cartellaBanche";

const TAB = [["finanziamenti", "Finanziamenti dei soci"], ["soci", "Soci e quote"], ["movimenti", "Entrate e uscite"], ["documenti", "Documenti da caricare"], ["ritenute", "Ritenute da versare"], ["partecipate", "Società partecipate"]];
const L = { fontSize: 12, fontWeight: 700, display: "flex", flexDirection: "column", gap: 3 };
const sel = (rosso) => ({ ...input, width: "100%", borderColor: rosso ? C.red : C.border });
const th = { padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" };
const td = { padding: "5px 8px", verticalAlign: "top" };
const MEZZI = [["bonifico", "Bonifico"], ["assegno", "Assegno"], ["contanti", "Contanti"], ["altro", "Altro"]];
const TIPI = { finanziamento: "Finanziamento", rimborso: "Rimborso", rinuncia: "Rinuncia" };
const DA_CARICARE = "Documento da caricare";
const haDoc = (d) => !!d && d !== DA_CARICARE;
const leggiImporto = (t) => { const s = String(t || "").trim().replace(/\s/g, ""); if (!s) return 0; const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };

export default function RapportiSoci({ vaiA } = {}) {
  const [gestore, setGestore] = useState(null);
  const [tab, setTab] = useState("finanziamenti");
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState("");
  const [giro, setGiro] = useState(0);
  const [radice, setRadice] = useState(null);
  const ricarica = (msg) => { if (msg) setEsito(msg); setGiro(g => g + 1); };

  useEffect(() => { supabase.rpc("ci_puo_gestire_conti").then(g => setGestore(g.data === true)); }, []);
  useEffect(() => { (async () => { const h = await cartellaSociRicordata(); if (h && await permesso(h, false)) setRadice(h); })().catch(() => {}); }, []);
  useEffect(() => { if (!gestore) return; (async () => {
    setErrore("");
    const [fi, el, li, co, fo, cl, ar, sc] = await Promise.all([
      supabase.rpc("ci_soci_finanziamenti"), supabase.rpc("ci_soci_elenco"), supabase.rpc("ci_soci_lista"),
      supabase.from("ci_conti").select("id, nome, tipo, stato, nome_nei_movimenti").order("id"),
      fetchAllPages((a, b) => supabase.from("ci_fornitori").select("id, nome").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_clienti").select("id, nome").order("id").range(a, b)),
      supabase.from("ci_soci_archivio").select("file, percorso, nome_originale"),
      fetchAllPages((a, b) => supabase.from("ci_v_scadenzario").select("scadenza_id, lato, fattura_id, fornitore_id, numero_documento, data_documento, importo, residuo").eq("lato", "fornitore").gt("residuo", 0.005).order("scadenza_id").range(a, b)),
    ]);
    for (const x of [fi, el, li, co, fo, cl, ar, sc]) if (x.error) throw new Error(x.error.message);
    setD({ fin: fi.data || [], soci: el.data || [], lista: li.data || {}, conti: co.data || [], fornitori: fo.data || [], clienti: cl.data || [], archivio: ar.data || [], scadenze: sc.data || [] });
  })().catch(e => setErrore("Lettura non riuscita: " + e.message)); }, [gestore, giro]);

  async function scegli() { setErrore(""); try { setRadice(await scegliCartellaSoci()); } catch (e) { if (e?.name !== "AbortError") setErrore(e.message); } }

  if (gestore === null) return <div>Verifica dei permessi…</div>;
  if (!gestore) return <div style={{ ...scheda, color: C.red, fontWeight: 700 }}>La cartella dei rapporti con i soci la vedono solo i gestori dei conti.</div>;
  if (errore && !d) return <div style={{ color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>;
  if (!d) return <div>Lettura in corso…</div>;
  const percorsoDi = Object.fromEntries(d.archivio.map(a => [a.file, a.percorso]));
  const docDaCaricare = contaDocumenti(d);
  const ritRosse = (d.lista.ritenute || []).filter(r => ["scaduta", "in scadenza"].includes(r.stato)).length;
  const comune = { d, radice, percorsoDi, ricarica, setErrore };
  return (
    <div style={{ maxWidth: 1300 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.primary }}>🤝 Rapporti finanziari con i soci – Entrate/uscite</div>
      <div style={{ fontSize: 13, color: C.muted, margin: "4px 0 10px", maxWidth: 1050 }}>
        Finanziamenti, versamenti, rinunce, utili e rimborsi dei soci, e i rapporti con le società partecipate. Le regole sui soldi le controlla il database:
        il rimborso non supera il da restituire, la ritenuta la calcola il programma, niente contanti in uscita. I pagamenti e i versamenti in contanti si fanno da
        «Incassi e pagamenti» → «Soci e partecipate»; i bonifici arrivati o partiti si registrano da «Conferma dei movimenti» con «Registra nel modulo soci».
      </div>
      <div style={{ ...scheda, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
        <span>Cartella dei documenti nel cloud: {radice ? <b style={{ color: C.green }}>✔ {NOME_CARTELLA}</b> : <b style={{ color: C.yellow }}>non scelta su questo computer</b>}</span>
        {browserAdatto() ? <button style={btn(false)} onClick={scegli}>{radice ? "Scegli di nuovo" : "Scegli la cartella"}</button> : <span style={{ color: C.red }}>Per la cartella del cloud serve Chrome o Edge sul computer.</span>}
        <span style={{ color: C.muted }}>Si sceglie «{NOME_CARTELLA}» dentro «00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE». I documenti si aprono anche senza: il programma ne ha la copia.</span>
        <span style={{ flex: 1 }} />
        {vaiA && <button style={btn(true)} onClick={() => { try { sessionStorage.setItem("incassiPagamentiTab", "soci"); } catch { /* niente */ } vaiA("incassi-pagamenti"); }}>Pagamenti e versamenti dei soci →</button>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 12px" }}>
        {TAB.map(([id, nome]) => { const n = id === "documenti" ? docDaCaricare : id === "ritenute" ? ritRosse : id === "movimenti" ? (d.lista.da_legare || []).length : 0;
          return <button key={id} style={btn(tab === id, n ? C.red : C.primary)} onClick={() => { setTab(id); setEsito(""); setErrore(""); }}>{nome}{n ? ` (${n})` : ""}</button>; })}
      </div>
      {esito && <div style={{ ...scheda, borderLeft: `4px solid ${C.green}`, fontWeight: 700 }}>✔ {esito}</div>}
      {errore && <div style={{ ...scheda, borderLeft: `4px solid ${C.red}`, color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>}
      {tab === "finanziamenti" && <Finanziamenti key={giro} {...comune} />}
      {tab === "soci" && <SociEQuote key={giro} {...comune} />}
      {tab === "movimenti" && <EntrateUscite key={giro} {...comune} />}
      {tab === "documenti" && <DocumentiDaCaricare key={giro} {...comune} />}
      {tab === "ritenute" && <Ritenute key={giro} {...comune} />}
      {tab === "partecipate" && <Partecipate key={giro} {...comune} />}
    </div>
  );
}

function contaDocumenti(d) {
  return (d.lista.movimenti || []).filter(m => !m.stornato && !haDoc(m.documento)).length
    + (d.lista.eventi || []).filter(e => !e.annullato_il && (!haDoc(e.documento) || (e.tipo === "rinuncia" && !haDoc(e.documento_2)))).length
    + (d.lista.storico || []).filter(s => !s.annullato_il && !haDoc(s.documento)).length;
}

// ── Documento: «Apri» se c'è, altrimenti «Allega» (dalla cartella del cloud già archiviata o «Archivia e carica» un file nuovo) ──
function Documento({ file, percorso, radice, dove, id, campo = "documento", socio, data, ricarica, setErrore, d }) {
  const [aperto, setAperto] = useState(false);
  if (haDoc(file)) return <span style={{ whiteSpace: "nowrap" }}>
    <button style={{ ...btn(false), height: 26 }} onClick={() => apriDocumentoSocio({ file, percorso, radice }).catch(e => setErrore("Documento non aperto: " + e.message))}>📄 Apri</button>
    {percorso && <div style={{ fontSize: 10.5, color: C.muted, maxWidth: 260, whiteSpace: "normal" }}>{percorso}</div>}</span>;
  if (!dove) return <span style={{ color: C.red }}>manca</span>;
  return <span>{!aperto ? <button style={{ ...btn(false, C.red), height: 26 }} onClick={() => setAperto(true)}>Allega</button>
    : <Allega radice={radice} socio={socio} data={data} d={d} chiudi={() => setAperto(false)} setErrore={setErrore}
        fatto={async (f) => { const r = await supabase.rpc("ci_soci_documento", { p_dove: dove, p_id: id, p_campo: campo, p_file: f, p_motivo: null }); if (r.error) throw new Error(r.error.message); ricarica("Documento allegato."); }} />}</span>;
}

// scelta del documento: un file già nell'archivio (dalla cartella del cloud) oppure un file nuovo da scrivere nella cartella e nel programma
function Allega({ radice, socio, data, d, fatto, chiudi, setErrore }) {
  const [file, setFile] = useState(""); const [nuovo, setNuovo] = useState(null); const [lavoro, setLavoro] = useState(false);
  const archiviati = [...d.archivio].sort((a, b) => a.percorso.localeCompare(b.percorso));
  async function vai() {
    setLavoro(true); setErrore("");
    try {
      let f = file;
      if (nuovo) { if (!radice) throw new Error("per un documento nuovo scegliere prima la cartella del cloud"); f = (await archiviaECarica(radice, nuovo, socio || "ALTRI", data || oggiRoma())).file; }
      if (!f) throw new Error("scegliere il documento");
      await fatto(f); chiudi();
    } catch (e) { setErrore("Documento non allegato: " + e.message); }
    setLavoro(false);
  }
  return <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, background: "#FFFBEA", minWidth: 320, fontSize: 12 }}>
    <label style={L}>Documento già nella cartella del cloud (archiviato)
      <select style={sel(false)} value={file} onChange={e => { setFile(e.target.value); setNuovo(null); }}><option value="">— nessuno —</option>
        {archiviati.map(a => <option key={a.file} value={a.file}>{a.percorso}</option>)}</select></label>
    <label style={{ ...L, marginTop: 6 }}>oppure un file nuovo (PDF, JPG, PNG): va nella cartella del cloud {socio ? `«${socio}» – anno ${String(data || oggiRoma()).slice(0, 4)}` : ""} e nel programma
      <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => { setNuovo(e.target.files?.[0] || null); setFile(""); }} /></label>
    {nuovo && !radice && <div style={{ color: C.red, fontWeight: 700 }}>Prima scegliere la cartella del cloud (in alto).</div>}
    <div style={{ display: "flex", gap: 6, marginTop: 6 }}><button style={btn(true)} disabled={lavoro || (!file && !nuovo)} onClick={vai}>{lavoro ? "Salvo…" : nuovo ? "Archivia e carica" : "Allega"}</button><button style={btn(false)} onClick={chiudi}>Lascia stare</button></div>
  </div>;
}

// ── Finanziamenti dei soci: riepilogo con le date di entrata, dettaglio per socio, storico prima del 2026 ──
function Finanziamenti({ d, radice, percorsoDi, ricarica, setErrore }) {
  const [aperto, setAperto] = useState(null);
  const tot = d.fin.reduce((t, s) => ({ v: t.v + Number(s.versato), r: t.r + Number(s.rimborsato), n: t.n + Number(s.rinunciato), x: t.x + Number(s.da_restituire) }), { v: 0, r: 0, n: 0, x: 0 });
  const s = d.fin.find(x => x.socio_id === aperto);
  return <>
    <div style={scheda}>
      <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>Finanziamenti dei soci – riepilogo</div>
      {!d.fin.length && <div style={{ color: C.muted }}>Nessun socio nell'elenco: aggiungerli in «Soci e quote».</div>}
      {d.fin.length > 0 && <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
        <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Socio", "Quota", "Versato", "Rimborsato", "Rinunciato", "Da restituire", "Primo versamento", "Ultimo versamento", "In banca da registrare", "Storico prima del 2026", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{d.fin.map(x => <tr key={x.socio_id} style={{ borderBottom: `1px solid ${C.border}`, background: aperto === x.socio_id ? `${C.primary}10` : "#fff", cursor: "pointer" }} onClick={() => setAperto(aperto === x.socio_id ? null : x.socio_id)}>
          <td style={{ ...td, fontWeight: 700 }}>{x.socio}</td><td style={td}>{x.quota_percentuale ? `${String(x.quota_percentuale).replace(".", ",")}%` : "—"}</td>
          <td style={{ ...td, textAlign: "right" }}>{euro(x.versato)}</td><td style={{ ...td, textAlign: "right" }}>{euro(x.rimborsato)}</td><td style={{ ...td, textAlign: "right" }}>{euro(x.rinunciato)}</td>
          <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{euro(x.da_restituire)}</td><td style={td}>{x.primo ? dataIt(x.primo) : "—"}</td><td style={td}>{x.ultimo ? dataIt(x.ultimo) : "—"}</td>
          <td style={{ ...td, color: x.in_banca_da_registrare.length ? C.red : C.muted, fontWeight: 700 }}>{x.in_banca_da_registrare.length || "—"}</td>
          <td style={{ ...td, color: x.storico_caricato ? C.green : C.yellow, fontWeight: 700 }}>{x.storico_caricato ? "completo" : "da completare"}</td>
          <td style={td}><button style={{ ...btn(aperto === x.socio_id), height: 26 }}>{aperto === x.socio_id ? "Chiudi" : "Dettaglio"}</button></td></tr>)}
          <tr style={{ fontWeight: 800, borderTop: `2px solid ${C.primary}` }}><td style={td}>Totale</td><td /><td style={{ ...td, textAlign: "right" }}>{euro(tot.v)}</td><td style={{ ...td, textAlign: "right" }}>{euro(tot.r)}</td><td style={{ ...td, textAlign: "right" }}>{euro(tot.n)}</td><td style={{ ...td, textAlign: "right" }}>{euro(tot.x)}</td><td colSpan={5} /></tr>
        </tbody></table></div>}
      <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Il «da restituire» è: finanziamenti − rimborsi − rinunce. Prima del 2026 viene dallo storico scritto qui; dal 2026 dai movimenti del programma. «In banca da registrare»: righe degli estratti con «finanziamento soci» e il nome del socio, non ancora registrate.</div>
    </div>
    {s && <DettaglioSocio key={s.socio_id} s={s} d={d} radice={radice} percorsoDi={percorsoDi} ricarica={ricarica} setErrore={setErrore} />}
    <ControlloCartella d={d} radice={radice} ricarica={ricarica} setErrore={setErrore} />
  </>;
}

function DettaglioSocio({ s, d, radice, percorsoDi, ricarica, setErrore }) {
  const [riga, setRiga] = useState(null);   // riga della banca scelta per lo storico
  const [annulla, setAnnulla] = useState(null);
  const conTot = s.righe.length;
  return <div style={{ ...scheda, border: `2px solid ${C.primary}` }}>
    <div style={{ fontWeight: 800, color: C.primary, fontSize: 15 }}>{s.socio} — da restituire {euro(s.da_restituire)}</div>
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, margin: "6px 0 10px" }}>
      {s.per_anno.map(a => <div key={a.anno} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 10px" }}><b>{a.anno}</b>: versato {euro(a.versato || 0)}{Number(a.rimborsato) ? `, rimborsato ${euro(a.rimborsato)}` : ""}{Number(a.rinunciato) ? `, rinunciato ${euro(a.rinunciato)}` : ""} ({a.quante})</div>)}
    </div>
    <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
      <thead><tr style={{ background: `${C.primary}20` }}>{["Data di entrata", "Che cosa", "Importo", "Mezzo", "Conto", "Causale o nota", "Documento", "Da dove", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
      <tbody>{s.righe.map(r => <tr key={r.origine + r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
        <td style={td}>{dataIt(r.data)}</td><td style={td}>{TIPI[r.tipo]}{r.fruttifero ? ` fruttifero ${r.tasso ? String(r.tasso).replace(".", ",") + "%" : ""}` : ""}</td>
        <td style={{ ...td, textAlign: "right", color: r.tipo === "finanziamento" ? C.green : C.red }}>{euro(r.importo)}</td>
        <td style={td}>{r.mezzo || "—"}</td><td style={td}>{r.conto || "—"}</td><td style={{ ...td, maxWidth: 320 }}>{r.causale || ""}</td>
        <td style={td}><Documento file={r.documento} percorso={r.percorso || percorsoDi[r.documento]} radice={radice} dove={r.origine === "programma" ? "movimento" : r.origine === "evento" ? "evento" : "storico"} id={r.id} socio={s.socio} data={r.data} d={d} ricarica={ricarica} setErrore={setErrore} /></td>
        <td style={td}>{r.origine === "storico" ? (r.riga_fonte_id ? "storico, collegato all'estratto" : "storico") : r.origine === "programma" ? (r.confermato ? "programma, confermato" : "programma, in attesa della banca") : "rinuncia (nessun movimento di denaro)"}</td>
        <td style={td}>{r.origine === "storico" && <button style={{ ...btn(false, C.red), height: 26 }} onClick={() => setAnnulla({ id: r.id, motivo: "" })}>Annulla</button>}</td></tr>)}
        {!conTot && <tr><td colSpan={9} style={{ ...td, color: C.muted }}>Nessun finanziamento scritto per questo socio.</td></tr>}</tbody></table></div>
    {annulla && <div style={{ display: "flex", gap: 6, marginTop: 6 }}><input style={{ ...input, flex: 1 }} placeholder="motivo dell'annullamento (obbligatorio)" value={annulla.motivo} onChange={e => setAnnulla({ ...annulla, motivo: e.target.value })} />
      <button style={btn(true, C.red)} disabled={!annulla.motivo.trim()} onClick={async () => { const r = await supabase.rpc("ci_soci_annulla", { p_dove: "storico", p_id: annulla.id, p_motivo: annulla.motivo.trim() }); if (r.error) return setErrore("Non annullata: " + r.error.message); setAnnulla(null); ricarica("Riga dello storico annullata."); }}>Conferma l'annullamento</button>
      <button style={btn(false)} onClick={() => setAnnulla(null)}>Lascia stare</button></div>}
    {s.in_banca_da_registrare.length > 0 && <div style={{ marginTop: 10, borderLeft: `4px solid ${C.red}`, padding: "4px 10px" }}>
      <div style={{ fontWeight: 800, color: C.red, fontSize: 13 }}>Negli estratti conto, non ancora registrati ({s.in_banca_da_registrare.length})</div>
      {s.in_banca_da_registrare.map(b => <div key={b.riga_fonte_id} style={{ fontSize: 12.5, margin: "3px 0" }}>
        {dataIt(b.data)} — {b.verso} {euro(b.importo)} — {b.conto} — <span style={{ color: C.muted }}>{String(b.descrizione).slice(0, 110)}</span>{" "}
        {b.data < "2026-01-01" && b.scritta_a_mano_id ? <button style={{ ...btn(false, C.green), height: 24 }} onClick={async () => {
            const r = await supabase.rpc("ci_soci_storico_collega_riga", { p_storico: b.scritta_a_mano_id, p_riga: b.riga_fonte_id });
            if (r.error) return setErrore("Non collegata: " + r.error.message); ricarica("Riga dello storico scritta a mano collegata alla riga dell'estratto."); }}>Collega alla riga scritta a mano</button>
          : b.data < "2026-01-01" ? <button style={{ ...btn(false), height: 24 }} onClick={() => setRiga(b)}>Scrivi nello storico</button>
          : <i>dal 2026: «Banche, carte e cassa» → «Conferma dei movimenti» → «Registra nel modulo soci»</i>}</div>)}
    </div>}
    <StoricoNuovo key={riga?.riga_fonte_id || "x"} s={s} d={d} riga={riga} radice={radice} ricarica={ricarica} setErrore={setErrore} />
    {!s.storico_caricato && <div style={{ marginTop: 10, fontSize: 12.5 }}>Quando tutti i finanziamenti, i rimborsi e le rinunce prima del 2026 sono scritti e il totale torna con la scheda contabile del commercialista:{" "}
      <button style={btn(true, C.green)} onClick={async () => { if (!window.confirm(`Lo storico di ${s.socio} è completo? Da questo momento si possono disporre i rimborsi del finanziamento.`)) return;
        const r = await supabase.rpc("ci_soci_storico_completo", { p_socio: s.socio_id }); if (r.error) return setErrore(r.error.message); ricarica("Storico segnato completo."); }}>Lo storico è completo</button></div>}
  </div>;
}

function StoricoNuovo({ s, d, riga, radice, ricarica, setErrore }) {
  const [v, setV] = useState(() => ({ tipo: riga ? (riga.verso === "entrata" ? "finanziamento" : "rimborso") : "finanziamento", data: riga?.data || "", importo: riga ? String(riga.importo).replace(".", ",") : "",
    mezzo: riga ? "bonifico" : "", conto_id: riga ? String(d.conti.find(c => c.nome_nei_movimenti === riga.conto)?.id || "") : "", fruttifero: false, tasso: "", nota: "", riga_fonte_id: riga?.riga_fonte_id || "", file: "",
    destinazione: "", anno_perdita: "" }));
  const [nuovo, setNuovo] = useState(null); const [lavoro, setLavoro] = useState(false);
  const c = (k, x) => setV(o => ({ ...o, [k]: x }));
  const imp = leggiImporto(v.importo); const rin = v.tipo === "rinuncia";
  const conti = d.conti.filter(k => v.mezzo === "contanti" ? k.tipo === "cassa" : ["bonifico", "assegno"].includes(v.mezzo) ? k.tipo === "banca" : true);
  const problemi = [];
  if (!v.data) problemi.push("la data"); else if (v.data >= "2026-01-01") problemi.push("lo storico è per gli anni prima del 2026");
  if (!imp) problemi.push("l'importo");
  if (!rin && !v.mezzo) problemi.push("il mezzo (bonifico, assegno…)");
  if (!rin && !v.conto_id && !v.riga_fonte_id) problemi.push("il conto");
  if (v.tipo === "finanziamento" && v.fruttifero && !(Number(String(v.tasso).replace(",", ".")) > 0)) problemi.push("il tasso");
  if (rin && !v.destinazione) problemi.push("dove va la rinuncia (riserva o copertura della perdita)");
  if (rin && v.destinazione === "copertura_perdita" && !/^\d{4}$/.test(v.anno_perdita)) problemi.push("l'anno della perdita");
  async function salva() {
    setLavoro(true); setErrore("");
    try {
      let documento = v.file;
      if (nuovo) { if (!radice) throw new Error("per un documento nuovo scegliere prima la cartella del cloud"); documento = (await archiviaECarica(radice, nuovo, s.socio, v.data)).file; }
      const p = { socio_id: s.socio_id, tipo: v.tipo, data: v.data, importo: imp, mezzo: rin ? "" : v.mezzo, conto_id: rin ? "" : v.conto_id, riga_fonte_id: rin ? "" : v.riga_fonte_id,
        fruttifero: v.tipo === "finanziamento" && v.fruttifero, tasso: v.fruttifero ? String(v.tasso).replace(",", ".") : "", nota: v.nota, documento,
        destinazione: rin ? v.destinazione : "", anno_perdita: rin && v.destinazione === "copertura_perdita" ? v.anno_perdita : "" };
      const r = await supabase.rpc("ci_soci_storico_aggiungi", { p });
      if (r.error) throw new Error(r.error.message);
      ricarica(`Scritto nello storico di ${s.socio}: ${TIPI[v.tipo].toLowerCase()} del ${dataIt(v.data)}, ${euro(imp)}.`);
    } catch (e) { setErrore("Lo storico non l'ha accettato, non è stato scritto niente: " + e.message); }
    setLavoro(false);
  }
  return <div style={{ marginTop: 12, borderTop: `1px dashed ${C.border}`, paddingTop: 10 }}>
    <div style={{ fontWeight: 800, color: C.primary, fontSize: 13, marginBottom: 6 }}>Scrivi una riga dello storico (prima del 2026){riga ? ` — dalla riga della banca del ${dataIt(riga.data)}` : ""}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
      <label style={L}>Che cosa<select style={sel(false)} value={v.tipo} disabled={!!riga} onChange={e => c("tipo", e.target.value)}>{Object.entries(TIPI).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
      <label style={L}>Data di entrata (o di uscita)<input type="date" style={sel(!v.data || v.data >= "2026-01-01")} value={v.data} max="2025-12-31" onChange={e => c("data", e.target.value)} />{riga && <span style={{ fontWeight: 400, color: C.muted }}>la banca: {dataIt(riga.data)} (al massimo 10 giorni di differenza)</span>}</label>
      <label style={L}>Importo (€)<input style={sel(!imp)} value={v.importo} disabled={!!riga} onChange={e => c("importo", e.target.value)} placeholder="150.000,00" /></label>
      {!rin && <label style={L}>Mezzo<select style={sel(!v.mezzo)} value={v.mezzo} onChange={e => { c("mezzo", e.target.value); if (!riga) c("conto_id", ""); }}><option value="">— scegliere —</option>{MEZZI.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>}
      {!rin && <label style={L}>Conto<select style={sel(!v.conto_id && !v.riga_fonte_id)} value={v.conto_id} disabled={!!riga} onChange={e => c("conto_id", e.target.value)}><option value="">— scegliere —</option>{conti.map(k => <option key={k.id} value={k.id}>{k.nome_nei_movimenti || k.nome}{k.stato === "chiuso" ? " (chiuso)" : ""}</option>)}</select></label>}
      {rin && <label style={L}>Dove va la rinuncia<select style={sel(!v.destinazione)} value={v.destinazione} onChange={e => c("destinazione", e.target.value)}><option value="">— scegliere —</option><option value="riserva">Riserva in conto capitale</option><option value="copertura_perdita">Copertura della perdita di un esercizio</option></select></label>}
      {rin && v.destinazione === "copertura_perdita" && <label style={L}>Anno della perdita<input style={sel(!/^\d{4}$/.test(v.anno_perdita))} value={v.anno_perdita} onChange={e => c("anno_perdita", e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="2023" /></label>}
      {v.tipo === "finanziamento" && <label style={{ ...L, flexDirection: "row", alignItems: "center" }}><input type="checkbox" checked={v.fruttifero} onChange={e => c("fruttifero", e.target.checked)} /> fruttifero (con interessi)</label>}
      {v.tipo === "finanziamento" && v.fruttifero && <label style={L}>Tasso annuo (%)<input style={sel(!(Number(String(v.tasso).replace(",", ".")) > 0))} value={v.tasso} onChange={e => c("tasso", e.target.value)} /></label>}
      <label style={{ ...L, gridColumn: "1 / -1" }}>Nota (facoltativa)<input style={sel(false)} value={v.nota} onChange={e => c("nota", e.target.value)} placeholder="es. assegno n. …; più 2.671 € in contanti non contati" /></label>
      <label style={L}>Documento già nella cartella del cloud<select style={sel(false)} value={v.file} onChange={e => { c("file", e.target.value); setNuovo(null); }}><option value="">— nessuno (si allega dopo) —</option>
        {[...d.archivio].sort((a, b) => a.percorso.localeCompare(b.percorso)).map(a => <option key={a.file} value={a.file}>{a.percorso}</option>)}</select></label>
      <label style={L}>oppure un file nuovo («Archivia e carica»)<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => { setNuovo(e.target.files?.[0] || null); c("file", ""); }} /></label>
    </div>
    {problemi.length > 0 && <div style={{ color: C.red, fontSize: 12.5, marginTop: 6 }}>Manca: {problemi.join("; ")}.</div>}
    <button style={{ ...btn(true), marginTop: 8 }} disabled={lavoro || problemi.length > 0} onClick={salva}>{lavoro ? "Scrivo…" : "Scrivi nello storico"}</button>
  </div>;
}

// controllo della cartella del cloud: quali file non sono ancora nel programma, e «Archivia nel programma» (copia verificata)
function ControlloCartella({ d, radice, ricarica, setErrore }) {
  const [file, setFile] = useState(null); const [lavoro, setLavoro] = useState(""); const [nel, setNel] = useState(null);
  const registrati = useMemo(() => new Set(d.archivio.map(a => a.file)), [d]);
  async function leggi() {
    setErrore(""); setLavoro("Lettura della cartella…");
    try { const [f, n] = await Promise.all([leggiCartellaSoci(radice, k => setLavoro(`Lettura della cartella… ${k} file`)), fileNelProgramma()]); setFile(f); setNel(n); }
    catch (e) { setErrore("Cartella non letta: " + e.message); }
    setLavoro("");
  }
  async function archivia(lista) {
    setErrore(""); let fatti = 0;
    for (const f of lista) {
      setLavoro(`Archivio ${fatti + 1} di ${lista.length}: ${f.nome}`);
      try { await archiviaNelProgramma(f.byte, f.nome, f.percorso); fatti++; }
      catch (e) { setErrore(`Fermato a «${f.percorso}»: ${e.message}. Archiviati ${fatti}.`); setLavoro(""); return; }
    }
    setLavoro(""); ricarica(`Archiviati nel programma ${fatti} documenti della cartella del cloud.`);
  }
  if (!radice) return <div style={{ ...scheda, fontSize: 12.5, color: C.muted }}>Per controllare quali documenti della cartella «{NOME_CARTELLA}» non sono ancora nel programma, scegliere la cartella in alto.</div>;
  const mancanti = (file || []).filter(f => !registrati.has(f.file));
  return <div style={scheda}>
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <b style={{ color: C.primary }}>Documenti nella cartella del cloud</b>
      <button style={btn(false)} disabled={!!lavoro} onClick={leggi}>{file ? "Rileggi la cartella" : "Controlla la cartella"}</button>
      {lavoro && <span style={{ color: C.blue, fontWeight: 700 }}>{lavoro}</span>}
    </div>
    {file && <div style={{ fontSize: 12.5, marginTop: 6 }}>Nella cartella: <b>{file.length}</b> documenti; nel programma: <b>{file.length - mancanti.length}</b>; da archiviare: <b style={{ color: mancanti.length ? C.red : C.green }}>{mancanti.length}</b>.
      {mancanti.length > 0 && <> <button style={{ ...btn(true), height: 28, marginLeft: 8 }} disabled={!!lavoro} onClick={() => archivia(mancanti)}>Archivia nel programma i {mancanti.length} documenti</button>
        <div style={{ color: C.muted }}>Il programma salva una copia identica (stessa impronta) e si ricorda dove sta l'originale. Nella cartella del cloud non cambia niente. Poi ogni documento si collega alla sua riga con «Allega».</div>
        <div style={{ maxHeight: 180, overflowY: "auto", marginTop: 4 }}>{mancanti.map(f => <div key={f.percorso}>{f.percorso}{nel?.has(f.file) ? " (copia già nel programma, manca la posizione)" : ""}</div>)}</div></>}</div>}
  </div>;
}

// ── Soci e quote ──
const SOCIO_VUOTO = { id: "", nome: "", codice_fiscale: "", partita_iva: "", tipo: "", quota_percentuale: "", iban: "", quota_in_impresa: false, quota_impresa_piva: "", quota_impresa_documento: "", documento_visura: "", cliente_id: "", fornitore_id: "", attivo: true, note: "" };
function SociEQuote({ d, radice, percorsoDi, ricarica, setErrore }) {
  const [modulo, setModulo] = useState(null); const [evento, setEvento] = useState(null);
  return <>
    <div style={scheda}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}><b style={{ color: C.primary }}>Elenco dei soci</b><button style={btn(true)} onClick={() => setModulo({ ...SOCIO_VUOTO })}>Nuovo socio</button></div>
      <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
        <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Socio", "Codice fiscale", "Tipo", "Quota", "IBAN", "Da restituire", "Riserva", "Utili da pagare", "Da rimborsare al socio", "Il socio deve alla società", "Visura", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{d.soci.map(s => { const x = s.situazione || {}; return <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: s.attivo ? 1 : 0.5 }}>
          <td style={{ ...td, fontWeight: 700 }}>{s.nome}</td><td style={td}>{s.codice_fiscale}</td><td style={td}>{s.tipo === "societa" ? "società" : "persona fisica"}{s.quota_in_impresa ? " (quota nell'impresa)" : ""}</td>
          <td style={td}>{s.quota_percentuale ? `${String(s.quota_percentuale).replace(".", ",")}%` : "—"}</td><td style={td}>{s.iban || <span style={{ color: C.yellow }}>manca</span>}</td>
          <td style={{ ...td, textAlign: "right" }}>{euro(x.da_restituire)}</td><td style={{ ...td, textAlign: "right" }}>{euro(x.riserva)}</td>
          <td style={{ ...td, textAlign: "right" }}>{euro(Number(x.utili_deliberati || 0) - Number(x.utili_pagati || 0))}</td><td style={{ ...td, textAlign: "right" }}>{euro(x.da_rimborsare)}</td>
          <td style={{ ...td, textAlign: "right" }}>{euro(Number(x.prestito_da_restituire || 0) + Number(x.ritenuta_anticipata || 0))}</td>
          <td style={td}><Documento file={s.documento_visura} percorso={percorsoDi[s.documento_visura]} radice={radice} dove="socio" id={s.id} campo="documento_visura" socio={s.nome} d={d} ricarica={ricarica} setErrore={setErrore} /></td>
          <td style={{ ...td, whiteSpace: "nowrap" }}><button style={{ ...btn(false), height: 26 }} onClick={() => setModulo({ ...SOCIO_VUOTO, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v === null ? "" : v])) })}>Modifica</button>{" "}
            <select style={{ ...input, height: 26 }} value="" onChange={e => e.target.value && setEvento({ socio: s, tipo: e.target.value })}><option value="">Registra…</option>
              <option value="rinuncia">Rinuncia al finanziamento</option><option value="uso_riserva">Usa la riserva per coprire una perdita</option><option value="quota_utile">Quota di utile da distribuire</option><option value="fattura_pagata_dal_socio">Fattura pagata dal socio</option></select></td></tr>; })}
          {!d.soci.length && <tr><td colSpan={12} style={{ ...td, color: C.muted }}>Nessun socio. Si inseriscono dalla visura camerale, con il codice fiscale.</td></tr>}</tbody></table></div>
    </div>
    {modulo && <ModuloSocio key={modulo.id || "nuovo"} v0={modulo} d={d} chiudi={() => setModulo(null)} ricarica={ricarica} setErrore={setErrore} />}
    {evento && <ModuloEvento key={evento.socio.id + evento.tipo} {...evento} d={d} radice={radice} chiudi={() => setEvento(null)} ricarica={ricarica} setErrore={setErrore} />}
  </>;
}

function ModuloSocio({ v0, d, chiudi, ricarica, setErrore }) {
  const [v, setV] = useState(v0); const [lavoro, setLavoro] = useState(false);
  const c = (k, x) => setV(o => ({ ...o, [k]: x }));
  const cf = String(v.codice_fiscale || "").toUpperCase().replace(/\s/g, "");
  const tipoDaCf = cf.length === 16 ? "persona_fisica" : /^\d{11}$/.test(cf) ? "societa" : "";
  const ib = ibanPulito(v.iban);
  const problemi = [];
  if (!String(v.nome).trim()) problemi.push("il nome o la ragione sociale");
  if (!tipoDaCf) problemi.push("il codice fiscale (16 caratteri la persona fisica, 11 cifre la società)");
  if (!v.tipo) problemi.push("persona fisica o società"); else if (tipoDaCf && v.tipo !== tipoDaCf) problemi.push("il tipo non corrisponde al codice fiscale");
  if (ib && !ibanValido(ib)) problemi.push("IBAN non valido");
  if (v.quota_in_impresa && (!/^\d{11}$/.test(String(v.quota_impresa_piva)) || !v.quota_impresa_documento)) problemi.push("quota nell'impresa: partita IVA della ditta e dichiarazione firmata");
  async function salva() {
    setLavoro(true); setErrore("");
    const r = await supabase.rpc("ci_soci_salva", { p: { ...v, codice_fiscale: cf, iban: ib } });
    setLavoro(false);
    if (r.error) return setErrore("Socio non salvato: " + r.error.message);
    ricarica(`Socio «${v.nome}» salvato.`);
  }
  return <div style={{ ...scheda, border: `2px solid ${C.primary}` }}>
    <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>{v.id ? `Modifica: ${v0.nome}` : "Nuovo socio"} — dati della visura camerale</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
      <label style={L}>Nome o ragione sociale<input style={sel(!String(v.nome).trim())} value={v.nome} onChange={e => c("nome", e.target.value)} /></label>
      <label style={L}>Codice fiscale<input style={sel(!tipoDaCf)} value={v.codice_fiscale} onChange={e => c("codice_fiscale", e.target.value)} /></label>
      <label style={L}>Persona fisica o società<select style={sel(!v.tipo || (tipoDaCf && v.tipo !== tipoDaCf))} value={v.tipo} onChange={e => c("tipo", e.target.value)}><option value="">— scegliere —</option><option value="persona_fisica">Persona fisica</option><option value="societa">Società</option></select></label>
      {v.tipo === "societa" && <label style={L}>Partita IVA<input style={sel(false)} value={v.partita_iva} onChange={e => c("partita_iva", e.target.value)} /></label>}
      <label style={L}>Quota (%)<input style={sel(false)} value={v.quota_percentuale} onChange={e => c("quota_percentuale", e.target.value.replace(",", "."))} /></label>
      <label style={L}>IBAN del socio<input style={sel(ib && !ibanValido(ib))} value={v.iban} onChange={e => c("iban", e.target.value)} placeholder="si trova sugli estratti conto o lo dà il socio" /></label>
      <label style={L}>È anche cliente<select style={sel(false)} value={v.cliente_id} onChange={e => c("cliente_id", e.target.value)}><option value="">— no —</option>{[...d.clienti].sort((a, b) => String(a.nome).localeCompare(String(b.nome))).map(k => <option key={k.id} value={k.id}>{k.nome}</option>)}</select></label>
      <label style={L}>È anche fornitore (serve per gli interessi a una società)<select style={sel(false)} value={v.fornitore_id} onChange={e => c("fornitore_id", e.target.value)}><option value="">— no —</option>{[...d.fornitori].sort((a, b) => String(a.nome).localeCompare(String(b.nome))).map(k => <option key={k.id} value={k.id}>{k.nome}</option>)}</select></label>
      {v.tipo === "persona_fisica" && <label style={{ ...L, flexDirection: "row", alignItems: "center", gridColumn: "1 / -1" }}><input type="checkbox" checked={!!v.quota_in_impresa} onChange={e => c("quota_in_impresa", e.target.checked)} /> la quota è fra i beni della sua impresa (gli utili si pagano senza ritenuta)</label>}
      {v.quota_in_impresa && <label style={L}>Partita IVA della ditta<input style={sel(!/^\d{11}$/.test(String(v.quota_impresa_piva)))} value={v.quota_impresa_piva} onChange={e => c("quota_impresa_piva", e.target.value)} /></label>}
      {v.quota_in_impresa && <label style={L}>Dichiarazione firmata (documento già archiviato)<select style={sel(!v.quota_impresa_documento)} value={v.quota_impresa_documento} onChange={e => c("quota_impresa_documento", e.target.value)}><option value="">— scegliere —</option>{d.archivio.map(a => <option key={a.file} value={a.file}>{a.percorso}</option>)}</select></label>}
      {v.id && <label style={{ ...L, flexDirection: "row", alignItems: "center" }}><input type="checkbox" checked={!!v.attivo} onChange={e => c("attivo", e.target.checked)} /> socio attivo</label>}
      <label style={{ ...L, gridColumn: "1 / -1" }}>Note<input style={sel(false)} value={v.note} onChange={e => c("note", e.target.value)} /></label>
    </div>
    {problemi.length > 0 && <div style={{ color: C.red, fontSize: 12.5, marginTop: 6 }}>Manca: {problemi.join("; ")}.</div>}
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}><button style={btn(true)} disabled={lavoro || problemi.length > 0} onClick={salva}>{lavoro ? "Salvo…" : "Salva il socio"}</button><button style={btn(false)} onClick={chiudi}>Chiudi</button></div>
  </div>;
}

const NOMI_EVENTO = { rinuncia: "Rinuncia al finanziamento", uso_riserva: "Uso della riserva per coprire una perdita", quota_utile: "Quota di utile da distribuire", fattura_pagata_dal_socio: "Fattura pagata dal socio per la società" };
function ModuloEvento({ socio, tipo, d, radice, chiudi, ricarica, setErrore }) {
  const [v, setV] = useState({ data: oggiRoma(), importo: "", destinazione: "", anno_perdita: "", data_delibera: "", scadenza_id: "", nota: "", documento: "", documento_2: "" });
  const [lavoro, setLavoro] = useState(false); const [f1, setF1] = useState(null); const [f2, setF2] = useState(null);
  const c = (k, x) => setV(o => ({ ...o, [k]: x }));
  const x = socio.situazione || {};
  const imp = leggiImporto(v.importo);
  const sc = d.scadenze.find(s => s.scadenza_id === Number(v.scadenza_id));
  const problemi = [];
  if (!v.data) problemi.push("la data");
  if (tipo !== "fattura_pagata_dal_socio" && !imp) problemi.push("l'importo");
  if (tipo === "rinuncia") { if (!v.destinazione) problemi.push("la destinazione"); if (v.destinazione === "copertura_perdita" && !v.anno_perdita) problemi.push("l'anno della perdita"); if (!v.documento && !f1) problemi.push("la lettera firmata della rinuncia"); }
  if (tipo === "uso_riserva" && !v.anno_perdita) problemi.push("l'anno della perdita");
  if (tipo === "quota_utile" && !v.data_delibera) problemi.push("la data della delibera");
  if (tipo === "fattura_pagata_dal_socio" && !sc) problemi.push("la fattura");
  async function salva() {
    setLavoro(true); setErrore("");
    try {
      let doc = v.documento, doc2 = v.documento_2;
      if (f1) { if (!radice) throw new Error("scegliere prima la cartella del cloud"); doc = (await archiviaECarica(radice, f1, socio.nome, v.data)).file; }
      if (f2) { if (!radice) throw new Error("scegliere prima la cartella del cloud"); doc2 = (await archiviaECarica(radice, f2, socio.nome, v.data)).file; }
      const p = { socio_id: socio.id, tipo, data: v.data, importo: tipo === "fattura_pagata_dal_socio" ? sc.importo : imp, destinazione: v.destinazione, anno_perdita: v.anno_perdita,
        data_delibera: v.data_delibera, scadenza_id: v.scadenza_id, documento: doc, documento_2: doc2, nota: v.nota };
      const r = await supabase.rpc("ci_soci_evento", { p });
      if (r.error) throw new Error(r.error.message);
      ricarica(`${NOMI_EVENTO[tipo]} di ${socio.nome} registrata.${tipo === "rinuncia" && !doc2 ? " Manca la dichiarazione del valore fiscale del credito: senza, l'importo può diventare un ricavo tassato della società." : ""}`);
    } catch (e) { setErrore("Non registrato: " + e.message); }
    setLavoro(false);
  }
  const docSel = (k, f, setF, etichetta, obbl) => <label style={L}>{etichetta}
    <select style={sel(obbl && !v[k] && !f)} value={v[k]} onChange={e => { c(k, e.target.value); setF(null); }}><option value="">— documento già archiviato —</option>{d.archivio.map(a => <option key={a.file} value={a.file}>{a.percorso}</option>)}</select>
    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => { setF(e.target.files?.[0] || null); c(k, ""); }} /></label>;
  return <div style={{ ...scheda, border: `2px solid ${C.primary}` }}>
    <div style={{ fontWeight: 800, color: C.primary, marginBottom: 4 }}>{NOMI_EVENTO[tipo]} — {socio.nome}</div>
    <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>{tipo === "rinuncia" ? `Da restituire oggi: ${euro(x.da_restituire)}. Nessun movimento di denaro: non entra in prima nota.`
      : tipo === "uso_riserva" ? `Riserva del socio: ${euro(x.riserva)}.` : tipo === "quota_utile" ? "È il tetto degli utili che si potranno pagare a questo socio (meno quanto già pagato). Il verbale si può allegare dopo."
      : "La fattura intestata a Podere Verde che il socio ha pagato di tasca sua: la fattura esce da quelle da pagare e nasce il «da rimborsare al socio»."}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
      <label style={L}>Data<input type="date" style={sel(!v.data)} value={v.data} onChange={e => c("data", e.target.value)} /></label>
      {tipo !== "fattura_pagata_dal_socio" && <label style={L}>Importo (€)<input style={sel(!imp)} value={v.importo} onChange={e => c("importo", e.target.value)} /></label>}
      {tipo === "rinuncia" && <label style={L}>Destinazione<select style={sel(!v.destinazione)} value={v.destinazione} onChange={e => c("destinazione", e.target.value)}><option value="">— scegliere —</option><option value="riserva">Riserva in conto capitale</option><option value="copertura_perdita">Copertura della perdita di un esercizio</option></select></label>}
      {(tipo === "uso_riserva" || v.destinazione === "copertura_perdita") && <label style={L}>Anno della perdita<input style={sel(!v.anno_perdita)} value={v.anno_perdita} onChange={e => c("anno_perdita", e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="2025" /></label>}
      {tipo === "quota_utile" && <label style={L}>Data della delibera<input type="date" style={sel(!v.data_delibera)} value={v.data_delibera} onChange={e => c("data_delibera", e.target.value)} /></label>}
      {tipo === "fattura_pagata_dal_socio" && <label style={{ ...L, gridColumn: "1 / -1" }}>Fattura d'acquisto ancora da pagare<select style={sel(!sc)} value={v.scadenza_id} onChange={e => c("scadenza_id", e.target.value)}><option value="">— scegliere —</option>
        {d.scadenze.map(s => <option key={s.scadenza_id} value={s.scadenza_id}>{d.fornitori.find(f => f.id === s.fornitore_id)?.nome || "fornitore"} — n. {s.numero_documento} del {dataIt(s.data_documento)} — {euro(s.residuo)}</option>)}</select></label>}
      {docSel("documento", f1, setF1, tipo === "rinuncia" ? (v.destinazione === "copertura_perdita" ? "Lettera firmata del socio: rinuncia per coprire la perdita (obbligatoria)" : "Lettera firmata della rinuncia (obbligatoria)") : tipo === "quota_utile" ? "Verbale dell'assemblea (se c'è)" : tipo === "uso_riserva" ? "Verbale dell'assemblea che copre la perdita" : "Ricevuta del pagamento fatto dal socio", tipo === "rinuncia", )}
      {tipo === "rinuncia" && docSel("documento_2", f2, setF2, "Dichiarazione sostitutiva del valore fiscale del credito", false)}
      <label style={{ ...L, gridColumn: "1 / -1" }}>Nota<input style={sel(false)} value={v.nota} onChange={e => c("nota", e.target.value)} /></label>
    </div>
    {problemi.length > 0 && <div style={{ color: C.red, fontSize: 12.5, marginTop: 6 }}>Manca: {problemi.join("; ")}.</div>}
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}><button style={btn(true)} disabled={lavoro || problemi.length > 0} onClick={salva}>{lavoro ? "Registro…" : "Registra"}</button><button style={btn(false)} onClick={chiudi}>Chiudi</button></div>
  </div>;
}

// ── Entrate e uscite (movimenti dei soci), movimenti da legare, eventi senza denaro ──
function EntrateUscite({ d, radice, percorsoDi, ricarica, setErrore }) {
  const [socio, setSocio] = useState(""); const [verso, setVerso] = useState("");
  const mov = (d.lista.movimenti || []).filter(m => m.socio_id && (!socio || String(m.socio_id) === socio) && (!verso || m.verso === verso));
  const eventi = (d.lista.eventi || []).filter(e => !socio || String(e.socio_id) === socio);
  return <>
    {(d.lista.da_legare || []).length > 0 && <DaLegare d={d} ricarica={ricarica} setErrore={setErrore} />}
    <div style={scheda}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}><b style={{ color: C.primary }}>Entrate e uscite dei soci</b>
        <select style={input} value={socio} onChange={e => setSocio(e.target.value)}><option value="">tutti i soci</option>{d.soci.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
        <select style={input} value={verso} onChange={e => setVerso(e.target.value)}><option value="">entrate e uscite</option><option value="entrata">entrate</option><option value="uscita">uscite</option></select></div>
      <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
        <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Data", "Prima nota", "Socio", "Operazione", "Lordo", "Ritenuta", "Netto", "Conto e modo", "Causale", "Documento"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{mov.map(m => <tr key={m.id} style={{ borderBottom: `1px solid ${C.border}`, textDecoration: m.stornato ? "line-through" : "none", color: m.stornato ? C.muted : C.text }}>
          <td style={td}>{dataIt(m.data)}</td><td style={td}>{m.numero || m.codice_attesa || "—"}{!m.confermato && !m.stornato ? <div style={{ color: C.blue, fontSize: 11 }}>in attesa della banca</div> : null}{m.stornato ? <div style={{ fontSize: 11 }}>stornato</div> : null}</td>
          <td style={td}>{m.socio}</td><td style={td}>{m.operazione}</td>
          <td style={{ ...td, textAlign: "right", color: m.verso === "entrata" ? C.green : C.red }}>{euro(m.lordo)}</td><td style={{ ...td, textAlign: "right" }}>{Number(m.ritenuta) ? `${euro(m.ritenuta)} (${m.codice_tributo})${m.arrivato_lordo ? " anticipata" : ""}` : "—"}</td>
          <td style={{ ...td, textAlign: "right" }}>{euro(m.netto)}</td><td style={td}>{m.conto}{m.modalita ? ` — ${m.modalita}` : ""}</td><td style={{ ...td, maxWidth: 300 }}>{m.causale}</td>
          <td style={td}><Documento file={m.documento} percorso={percorsoDi[m.documento]} radice={radice} dove={m.stornato ? null : "movimento"} id={m.id} socio={m.socio} data={m.data} d={d} ricarica={ricarica} setErrore={setErrore} /></td></tr>)}
          {!mov.length && <tr><td colSpan={10} style={{ ...td, color: C.muted }}>Nessun movimento.</td></tr>}</tbody></table></div>
    </div>
    <div style={scheda}>
      <b style={{ color: C.primary }}>Senza movimento di denaro (rinunce, uso della riserva, quote di utile, fatture pagate dal socio)</b>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, marginTop: 6 }}><tbody>{eventi.map(e => <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}`, textDecoration: e.annullato_il ? "line-through" : "none" }}>
        <td style={td}>{dataIt(e.data)}</td><td style={td}>{e.socio}</td><td style={td}>{NOMI_EVENTO[e.tipo]}{e.destinazione ? ` — ${e.destinazione === "riserva" ? "a riserva" : `copertura perdita ${e.anno_perdita}`}` : ""}</td><td style={{ ...td, textAlign: "right" }}>{euro(e.importo)}</td>
        <td style={td}><Documento file={e.documento} percorso={percorsoDi[e.documento]} radice={radice} dove={e.annullato_il ? null : "evento"} id={e.id} socio={e.socio} data={e.data} d={d} ricarica={ricarica} setErrore={setErrore} /></td>
        <td style={td}>{e.tipo === "rinuncia" && <Documento file={e.documento_2} percorso={percorsoDi[e.documento_2]} radice={radice} dove={e.annullato_il ? null : "evento"} campo="documento_2" id={e.id} socio={e.socio} data={e.data} d={d} ricarica={ricarica} setErrore={setErrore} />}</td>
        <td style={td}>{!e.annullato_il && <AnnullaEvento id={e.id} ricarica={ricarica} setErrore={setErrore} />}</td></tr>)}
        {!eventi.length && <tr><td style={{ ...td, color: C.muted }}>Nessuno.</td></tr>}</tbody></table>
    </div>
  </>;
}
function AnnullaEvento({ id, ricarica, setErrore }) {
  const [m, setM] = useState(null);
  if (m === null) return <button style={{ ...btn(false, C.red), height: 26 }} onClick={() => setM("")}>Annulla</button>;
  return <span style={{ display: "flex", gap: 4 }}><input style={{ ...input, height: 26 }} placeholder="motivo" value={m} onChange={e => setM(e.target.value)} />
    <button style={{ ...btn(true, C.red), height: 26 }} disabled={!m.trim()} onClick={async () => { const r = await supabase.rpc("ci_soci_annulla", { p_dove: "evento", p_id: id, p_motivo: m.trim() }); if (r.error) return setErrore("Non annullato: " + r.error.message); ricarica("Annullato."); }}>Conferma</button></span>;
}
function DaLegare({ d, ricarica, setErrore }) {
  const [v, setV] = useState({});
  return <div style={{ ...scheda, borderLeft: `4px solid ${C.red}` }}>
    <div style={{ fontWeight: 800, color: C.red }}>Movimenti del gruppo «Soci» non legati a un socio ({d.lista.da_legare.length})</div>
    <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>Registrati prima di questa versione: finché non sono legati, non contano nel «da restituire» di nessuno.</div>
    {d.lista.da_legare.map(m => { const x = v[m.movimento_id] || { socio: "", motivo: "", tasso: "" }; const set = (k, y) => setV(o => ({ ...o, [m.movimento_id]: { ...x, [k]: y } }));
      const frutt = m.voce === "Finanziamento soci fruttifero";
      return <div key={m.movimento_id} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 12.5, margin: "4px 0" }}>
        <span>{dataIt(m.data)} — {m.verso} {euro(m.importo)} — {m.voce} — {m.controparte}</span>
        <select style={input} value={x.socio} onChange={e => set("socio", e.target.value)}><option value="">— socio —</option>{d.soci.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
        {frutt && <input style={{ ...input, width: 80 }} placeholder="tasso %" value={x.tasso} onChange={e => set("tasso", e.target.value)} />}
        <input style={{ ...input, width: 260 }} placeholder="motivo (es. bonifico del socio, causale FINANZIAMENTO SOCI)" value={x.motivo} onChange={e => set("motivo", e.target.value)} />
        <button style={btn(true)} disabled={!x.socio || !x.motivo.trim() || (frutt && !(Number(String(x.tasso).replace(",", ".")) > 0))} onClick={async () => {
          const r = await supabase.rpc("ci_soci_collega", { p_movimento: m.movimento_id, p_socio: Number(x.socio), p_motivo: x.motivo.trim(), p_tasso: frutt ? Number(String(x.tasso).replace(",", ".")) : null });
          if (r.error) return setErrore("Non legato: " + r.error.message); ricarica("Movimento legato al socio."); }}>Lega al socio</button></div>; })}
  </div>;
}

// ── Documenti da caricare ──
function DocumentiDaCaricare({ d, radice, percorsoDi, ricarica, setErrore }) {
  const nomeSocio = id => d.soci.find(s => s.id === id)?.nome || "";
  const righe = [
    ...(d.lista.storico || []).filter(s => !s.annullato_il && !haDoc(s.documento)).map(s => ({ k: "s" + s.id, data: s.data, chi: nomeSocio(s.socio_id), cosa: `Storico: ${TIPI[s.tipo].toLowerCase()} ${euro(s.importo)}`, dove: "storico", id: s.id, campo: "documento" })),
    ...(d.lista.movimenti || []).filter(m => !m.stornato && !haDoc(m.documento)).map(m => ({ k: "m" + m.id, data: m.data, chi: m.socio || m.partecipata, cosa: `${m.operazione} ${euro(m.lordo)}`, dove: "movimento", id: m.id, campo: "documento" })),
    ...(d.lista.eventi || []).filter(e => !e.annullato_il && !haDoc(e.documento)).map(e => ({ k: "e" + e.id, data: e.data, chi: e.socio, cosa: `${NOMI_EVENTO[e.tipo]} ${euro(e.importo)}`, dove: "evento", id: e.id, campo: "documento" })),
    ...(d.lista.eventi || []).filter(e => !e.annullato_il && e.tipo === "rinuncia" && !haDoc(e.documento_2)).map(e => ({ k: "e2" + e.id, data: e.data, chi: e.socio, cosa: `Rinuncia ${euro(e.importo)}: dichiarazione del valore fiscale del credito`, dove: "evento", id: e.id, campo: "documento_2" })),
  ].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  return <div style={scheda}>
    <b style={{ color: C.primary }}>Documenti da caricare ({righe.length})</b>
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, marginTop: 6 }}><tbody>{righe.map(r => <tr key={r.k} style={{ borderBottom: `1px solid ${C.border}` }}>
      <td style={td}>{dataIt(r.data)}</td><td style={td}>{r.chi}</td><td style={td}>{r.cosa}</td>
      <td style={td}><Documento file={null} radice={radice} dove={r.dove} id={r.id} campo={r.campo} socio={r.chi} data={r.data} d={d} ricarica={ricarica} setErrore={setErrore} /></td></tr>)}
      {!righe.length && <tr><td style={{ ...td, color: C.green }}>Nessun documento da caricare.</td></tr>}</tbody></table>
  </div>;
}

// ── Ritenute da versare (utili 1035 per trimestre, interessi 1030 per mese) ──
function Ritenute({ d, ricarica, setErrore }) {
  const [abb, setAbb] = useState(null); const [f24, setF24] = useState([]);
  useEffect(() => { if (!abb) return; supabase.from("ci_f24_righe").select("f24_id, importo_debito, anno_riferimento, rateazione_mese").eq("codice_tributo", abb.codice_tributo)
    .then(r => setF24(r.data || [])); }, [abb]);
  const rit = d.lista.ritenute || [];
  return <div style={scheda}>
    <b style={{ color: C.primary }}>Ritenute dei soci da versare con l'F24</b>
    <div style={{ fontSize: 12.5, color: C.muted, margin: "4px 0 6px" }}>Utili: codice 1035, per trimestre, entro il 16 del mese dopo il trimestre. Interessi: codice 1030, per mese, entro il 16 del mese dopo. Versata quando un F24 pagato ha quel codice, quel periodo e la stessa somma; se l'F24 contiene anche altre ritenute con lo stesso codice si abbina a mano.</div>
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
      <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Codice", "Periodo", "Scadenza", "Da versare", "Versato", "Stato", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
      <tbody>{rit.map(r => { const rosso = ["scaduta", "in scadenza", "versata in più, da recuperare"].includes(r.stato); return <tr key={r.codice_tributo + r.periodo} style={{ borderBottom: `1px solid ${C.border}`, color: rosso ? C.red : r.stato === "versata" ? C.green : C.text }}>
        <td style={td}>{r.codice_tributo}</td><td style={td}>{r.periodo}</td><td style={td}>{dataIt(r.scadenza)}</td><td style={{ ...td, textAlign: "right" }}>{euro(r.importo)}</td><td style={{ ...td, textAlign: "right" }}>{euro(r.versato)}</td><td style={{ ...td, fontWeight: 700 }}>{r.stato}</td>
        <td style={td}>{r.stato !== "versata" && <button style={{ ...btn(false), height: 26 }} onClick={() => setAbb({ ...r, f24_id: "", importo: String(r.importo - r.versato).replace(".", ","), motivo: "" })}>Abbina F24</button>}</td></tr>; })}
        {!rit.length && <tr><td colSpan={7} style={{ ...td, color: C.muted }}>Nessuna ritenuta dei soci.</td></tr>}</tbody></table>
    {abb && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8, fontSize: 12.5 }}>
      <span>Codice {abb.codice_tributo}, periodo {abb.periodo}:</span>
      <select style={input} value={abb.f24_id} onChange={e => setAbb({ ...abb, f24_id: e.target.value })}><option value="">— F24 con il codice {abb.codice_tributo} —</option>{[...new Set(f24.map(x => x.f24_id))].map(id => <option key={id} value={id}>F24 n. {id} — {f24.filter(x => x.f24_id === id).map(x => `${x.rateazione_mese || ""}/${x.anno_riferimento || ""} ${euro(x.importo_debito)}`).join(", ")}</option>)}</select>
      <input style={{ ...input, width: 110 }} value={abb.importo} onChange={e => setAbb({ ...abb, importo: e.target.value })} placeholder="dei soci €" />
      <input style={{ ...input, width: 260 }} value={abb.motivo} onChange={e => setAbb({ ...abb, motivo: e.target.value })} placeholder="motivo (obbligatorio)" />
      <button style={btn(true)} disabled={!abb.f24_id || !leggiImporto(abb.importo) || !abb.motivo.trim()} onClick={async () => {
        const r = await supabase.rpc("ci_soci_abbina_f24", { p_codice: abb.codice_tributo, p_periodo: abb.periodo, p_f24: Number(abb.f24_id), p_importo: leggiImporto(abb.importo), p_motivo: abb.motivo.trim() });
        if (r.error) return setErrore("Non abbinato: " + r.error.message); setAbb(null); ricarica("F24 abbinato."); }}>Abbina</button><button style={btn(false)} onClick={() => setAbb(null)}>Lascia stare</button></div>}
  </div>;
}

// ── Società partecipate ──
function Partecipate({ d, radice, percorsoDi, ricarica, setErrore }) {
  const mov = (d.lista.movimenti || []).filter(m => m.partecipata && !m.stornato);
  const perNome = {};
  for (const m of mov) { const p = perNome[m.partecipata] || (perNome[m.partecipata] = { versato: 0, prestato: 0, ricevuto: 0 });
    if (m.operazione === "Versamento di capitale a società partecipata") p.versato += Number(m.lordo); else if (m.operazione === "Finanziamento a società partecipata") p.prestato += Number(m.lordo); else p.ricevuto += Number(m.lordo); }
  return <div style={scheda}>
    <b style={{ color: C.primary }}>Società partecipate da Podere Verde</b>
    <div style={{ fontSize: 12.5, color: C.muted, margin: "4px 0 6px" }}>Le uscite (versamento di capitale, finanziamento) si dispongono da «Incassi e pagamenti» → «Soci e partecipate»; le entrate (dividendi, restituzioni, liquidazione) e i bonifici già partiti si registrano da «Conferma dei movimenti» con «Registra nel modulo soci».</div>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>{Object.entries(perNome).map(([n, p]) => <div key={n} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 12.5 }}>
      <b>{n}</b><div>capitale versato {euro(p.versato)} — finanziamenti dati {euro(p.prestato)} — ricevuto {euro(p.ricevuto)}</div></div>)}
      {!mov.length && <span style={{ color: C.muted, fontSize: 12.5 }}>Nessun movimento con le partecipate registrato nel modulo.</span>}</div>
    {mov.length > 0 && <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}><tbody>{mov.map(m => <tr key={m.id} style={{ borderBottom: `1px solid ${C.border}` }}>
      <td style={td}>{dataIt(m.data)}</td><td style={td}>{m.numero || m.codice_attesa}</td><td style={td}>{m.partecipata}</td><td style={td}>{m.operazione}</td><td style={{ ...td, textAlign: "right", color: m.verso === "entrata" ? C.green : C.red }}>{euro(m.lordo)}</td>
      <td style={td}><Documento file={m.documento} percorso={percorsoDi[m.documento]} radice={radice} dove="movimento" id={m.id} socio={m.partecipata} data={m.data} d={d} ricarica={ricarica} setErrore={setErrore} /></td></tr>)}</tbody></table>}
  </div>;
}

// numero rosso della voce del menu: documenti da caricare, ritenute scadute o in scadenza, movimenti da legare (calcolato dal database)
export async function contaAvvisiSoci() {
  const { data, error } = await supabase.rpc("ci_soci_avvisi");
  return error ? 0 : Number(data || 0);
}
