import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaNumero } from "./parsingUtils";
import { riquadro, campo, etichetta, bottone } from "./RazioneViste";

// data di oggi secondo l'ora italiana (toISOString darebbe la data in UTC: dopo mezzanotte il giorno prima)
const oggiLocale = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const piuGiorni = (data, giorni) => { const d = new Date(data + "T12:00:00"); d.setDate(d.getDate() + giorni); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// Alimentaria → Controlla prezzi e chiedi preventivi (versione 245).
// Decisioni del Dott. Bizzarri del 19/10/2026:
//  • nero  = prezzo sicuro: fatture dell'anno (con il fornitore) e/o autoproduzione; si aggiorna con il carico delle fatture;
//  • blu   = preventivo ricevuto: sostituisce Borsa Merci e ricerca online; scaduto → torna da verificare;
//  • arancione = da verificare (Borsa Merci, ricerca online, listino): scrivere prezzo e fonte e chiedere un preventivo;
//  • fatture di piccole quantità (sotto la quantità minima) non fanno da riferimento;
//  • orzo: due prezzi (fatture e produzione) → il Dottore sceglie media, fatture o produzione;
//  • fieni: media ponderata tra costo di produzione (campagna che si chiude nell'anno) e acquisti.
// Dati: vista ci_v_prezzi_riferimento; tabelle ci_prezzi_indicativi, ci_richieste_preventivo,
// ci_preventivi_alimenti, ci_prezzi_scelte, ci_prezzi_parametri.

export const ANNO = new Date().getFullYear();
export const COLORE_LIVELLO = { sicuro: C.text, preventivo: C.blue, "da verificare": "#D35400", mancante: C.red };
const TESTO_LIVELLO = { sicuro: "Sicuro", preventivo: "Preventivo", "da verificare": "Da verificare", mancante: "Mancante" };
const euroT = v => (v === null || v === undefined ? "—" : formattaNumero(Number(v), 2));
const t = v => (v === null || v === undefined ? "—" : formattaNumero(Number(v), 2) + " t");
const data = d => (d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT") : "—");
const CHIAVE_PRESCELTI = "alimentaria_preventivo_alimenti";

function leggiPrescelti() { try { return JSON.parse(sessionStorage.getItem(CHIAVE_PRESCELTI) || "[]"); } catch { return []; } }
function scriviPrescelti(v) { try { sessionStorage.setItem(CHIAVE_PRESCELTI, JSON.stringify(v)); } catch { /* niente */ } }

async function utente() { const { data: u } = await supabase.auth.getUser(); return u?.user?.email || null; }

export function testoFonte(r) {
  if (!r) return "";
  switch (r.fonte_prezzo) {
    case "fatture": return `Fatture ${r.anno}` + (r.fornitori ? ` · ${r.fornitori}` : "");
    case "produzione": return `Autoproduzione · campagna ${r.campagna}`;
    case "media produzione e acquisti": return `Media ponderata autoproduzione (campagna ${r.campagna}) e fatture ${r.anno}` + (r.fornitori ? ` · ${r.fornitori}` : "");
    case "preventivo": return `Preventivo ${r.preventivo_fornitore} del ${data(r.data_preventivo)}` + (r.preventivo_scadenza ? `, valido fino al ${data(r.preventivo_scadenza)}` : "");
    case "indicativo": return `${r.indicativo_fonte} · ${data(r.indicativo_data)}`;
    case "listino": return "Listino del programma (fonte non registrata)";
    default: return "Nessun prezzo";
  }
}

// ───────────────────────────── 1. Controlla prezzi ─────────────────────────────
export function ControllaPrezzi({ onNavigate }) {
  const [righe, setRighe] = useState(null);
  const [par, setPar] = useState(null);
  const [errore, setErrore] = useState(null);
  const [msg, setMsg] = useState(null);
  const [nuovo, setNuovo] = useState({ alimento: "", prezzo: "", fonte: "", data: oggiLocale(), collegamento: "", nota: "" });

  async function carica() {
    const [v, p] = await Promise.all([
      supabase.from("ci_v_prezzi_riferimento").select("*").eq("anno", ANNO),
      supabase.from("ci_prezzi_parametri").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (v.error || p.error) { setErrore((v.error || p.error).message + " — il database ha le strutture della versione 245? (file contabilita_strutture_v245.sql)"); return; }
    setRighe(v.data || []); setPar(p.data);
  }
  useEffect(() => { carica(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const conteggi = useMemo(() => {
    const c = { sicuro: 0, preventivo: 0, "da verificare": 0, mancante: 0 };
    (righe || []).forEach(r => { c[r.livello] = (c[r.livello] || 0) + 1; });
    return c;
  }, [righe]);

  async function scegli(alimento, scelta) {
    const { error } = await supabase.from("ci_prezzi_scelte").upsert({ alimento, anno: ANNO, scelta, scelto_da: await utente(), updated_at: new Date().toISOString() });
    if (error) { setMsg({ tipo: "errore", testo: error.message }); return; }
    setMsg({ tipo: "ok", testo: `${alimento}: scelto il prezzo «${scelta === "media" ? "media ponderata" : scelta}». Le razioni lo usano da subito.` });
    carica();
  }

  async function salvaIndicativo() {
    const prezzo = Number(String(nuovo.prezzo).replace(",", "."));
    if (!nuovo.alimento || !(prezzo >= 0) || nuovo.prezzo === "" || !nuovo.fonte.trim() || !nuovo.data) { setMsg({ tipo: "errore", testo: "Scriva alimento, prezzo, fonte e data." }); return; }
    const { error } = await supabase.from("ci_prezzi_indicativi").insert([{ alimento: nuovo.alimento, prezzo_euro_t: prezzo, fonte: nuovo.fonte.trim(), data_rilevazione: nuovo.data, collegamento: nuovo.collegamento || null, nota: nuovo.nota || null, inserito_da: await utente() }]);
    if (error) { setMsg({ tipo: "errore", testo: error.message }); return; }
    setMsg({ tipo: "ok", testo: `Prezzo indicativo di ${nuovo.alimento} registrato. Resta arancione: chiedere un preventivo.` });
    setNuovo(n => ({ ...n, alimento: "", prezzo: "", fonte: "", collegamento: "", nota: "" }));
    carica();
  }

  function chiediPreventivo(nomi) { scriviPrescelti(nomi); onNavigate && onNavigate("chiedi-preventivi"); }

  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;
  if (!righe) return <div style={{ padding: 20, color: C.muted }}>Caricamento…</div>;
  const daVerificare = righe.filter(r => r.livello === "da verificare" || r.livello === "mancante");
  const cella = { padding: "7px 8px", verticalAlign: "top", borderBottom: `1px solid ${C.border}` };
  const piccolo = { fontSize: 11.5, color: C.muted };

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>💶 Controlla prezzi</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13 }}>
        Il prezzo di riferimento di ogni alimento per il {ANNO}: è quello che usano le razioni di bovini, suini e ovini. <b style={{ color: C.text }}>Nero</b> = sicuro (fatture dell'anno o autoproduzione), <b style={{ color: C.blue }}>blu</b> = preventivo, <b style={{ color: "#D35400" }}>arancione</b> = da verificare (Borsa Merci, ricerca online o listino: chiedere un preventivo), <b style={{ color: C.red }}>rosso</b> = manca.
      </p>

      {/* anomalie */}
      <div style={{ ...riquadro, background: "#FDF6EC", borderColor: "#E0B97A" }}>
        <div style={{ fontWeight: 800, color: "#8A5A00", marginBottom: 6 }}>Anomalie</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
          {daVerificare.length === 0 && <li>Nessuna: tutti i prezzi sono sicuri o da preventivo.</li>}
          {daVerificare.map(r => <li key={r.alimento}><b>{r.alimento}</b>: {r.livello === "mancante" ? "prezzo mancante" : "prezzo da verificare"} — chiedere un preventivo.{r.indicativo_vecchio ? " Il prezzo indicativo è più vecchio di " + (par?.giorni_validita_prezzo_indicativo || 90) + " giorni: aggiornarlo." : ""}</li>)}
          {righe.filter(r => r.due_prezzi_da_scegliere && !r.scelta).map(r => <li key={"s" + r.alimento} style={{ color: C.red }}><b>{r.alimento}</b>: due prezzi (fatture {euroT(r.fatture_euro_t)} € e produzione {euroT(r.produzione_euro_t)} € per tonnellata). Finché non sceglie si usa la media ponderata ({euroT(r.media_ponderata_euro_t)} €): scelga qui sotto.</li>)}
          {righe.filter(r => r.fatture_euro_t != null && !r.fatture_valide && r.fatture_t != null && r.regola_prezzo === "fatture").map(r => <li key={"f" + r.alimento}><b>{r.alimento}</b>: le fatture del {ANNO} sono solo {t(r.fatture_t)} ({euroT(r.fatture_euro_t)} € per tonnellata), sotto la quantità minima di {t(r.quantita_minima_t)}: non fanno da riferimento.</li>)}
          {righe.filter(r => r.produzione_unita && /ballon|rotoball/.test(r.produzione_unita)).map(r => <li key={"b" + r.alimento}><b>{r.alimento}</b>: il costo di produzione per tonnellata usa il peso di riferimento di {formattaNumero(Number(r.peso_ballone_kg), 0)} kg per ballone (parametri Coltivazioni, campagna {r.campagna}). <b>Pesare i balloni</b> e aggiornare il peso.</li>)}
        </ul>
        <div style={{ ...piccolo, marginTop: 6 }}>Sicuri {conteggi.sicuro} · preventivo {conteggi.preventivo} · da verificare {conteggi["da verificare"]} · mancanti {conteggi.mancante}</div>
        {daVerificare.length > 0 && <button onClick={() => chiediPreventivo(daVerificare.map(r => r.alimento))} style={{ ...bottone("#D35400"), marginTop: 8 }}>Chiedi un preventivo per tutti gli alimenti da verificare</button>}
      </div>
      {msg && <div style={{ ...riquadro, padding: 10, fontSize: 13, color: msg.tipo === "errore" ? C.red : C.green }}>{msg.testo}</div>}

      {/* scheda prezzi */}
      <div style={{ ...riquadro, padding: 0, overflowX: "auto" }}>
        <table style={{ fontSize: 12.5, borderCollapse: "collapse", width: "100%" }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>
            {["Alimento", "Prezzo di riferimento € per tonnellata", "Da dove viene", `Fatture ${ANNO}`, "Autoproduzione", "Preventivo", "Borsa Merci o ricerca online", ""].map(h => <th key={h} style={{ padding: 7, fontSize: 11.5, textAlign: "left" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {righe.map(r => {
              const col = COLORE_LIVELLO[r.livello];
              return (
                <tr key={r.alimento}>
                  <td style={{ ...cella, fontWeight: 700 }}>{r.alimento}<div style={piccolo}>{r.gruppo}</div></td>
                  <td style={{ ...cella, color: col, fontWeight: 800, fontSize: 14, whiteSpace: "nowrap" }}>{euroT(r.prezzo_euro_t)}<div style={{ fontSize: 11, fontWeight: 700 }}>{TESTO_LIVELLO[r.livello]}</div></td>
                  <td style={{ ...cella, color: col, maxWidth: 260 }}>{testoFonte(r)}
                    {r.due_prezzi_da_scegliere && (
                      <div style={{ marginTop: 6, color: C.text }}>
                        <div style={{ ...piccolo, color: r.scelta ? C.muted : C.red, fontWeight: 700 }}>{r.scelta ? `Scelta: ${r.scelta === "media" ? "media ponderata" : r.scelta}` : "Da scegliere:"}</div>
                        {[["media", `Media ${euroT(r.media_ponderata_euro_t)}`], ["fatture", `Fatture ${euroT(r.fatture_euro_t)}`], ["produzione", `Produzione ${euroT(r.produzione_euro_t)}`]].map(([k, l]) => (
                          <button key={k} onClick={() => scegli(r.alimento, k)} style={{ margin: "2px 4px 0 0", fontSize: 11.5, padding: "3px 7px", borderRadius: 6, border: `1px solid ${C.border}`, background: r.scelta === k ? C.primary : "#fff", color: r.scelta === k ? "#fff" : C.text, cursor: "pointer" }}>{l}</button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={cella}>{r.fatture_euro_t != null ? <>{euroT(r.fatture_euro_t)} €<div style={piccolo}>{t(r.fatture_t)} · {r.righe_fattura} righe{r.ultima_fattura ? ` · ultima ${data(r.ultima_fattura)}` : ""}{r.ultimo_fornitore ? ` · ${r.ultimo_fornitore}` : ""}</div>{!r.fatture_valide && <div style={{ ...piccolo, color: "#D35400" }}>sotto {t(r.quantita_minima_t)}: non fa da riferimento</div>}</> : "—"}</td>
                  <td style={cella}>{r.produzione_euro_t != null ? <>{euroT(r.produzione_euro_t)} €<div style={piccolo}>{t(r.produzione_t)} · campagna {r.campagna}{r.peso_ballone_kg && /ballon|rotoball/.test(r.produzione_unita || "") ? ` · ballone ${formattaNumero(Number(r.peso_ballone_kg), 0)} kg (da pesare)` : ""}</div></> : <span style={piccolo}>{r.prodotto_coltivazione ? "nessuna raccolta nella campagna " + (ANNO - 1) + "/" + ANNO : "—"}</span>}</td>
                  <td style={cella}>{r.preventivo_euro_t != null ? <>{euroT(r.preventivo_euro_t)} €<div style={piccolo}>{r.preventivo_fornitore} · {data(r.data_preventivo)}{r.preventivo_scadenza ? ` · fino al ${data(r.preventivo_scadenza)}` : ""}</div></> : "—"}</td>
                  <td style={cella}>{r.indicativo_euro_t != null ? <>{euroT(r.indicativo_euro_t)} €<div style={piccolo}>{r.indicativo_fonte} · {data(r.indicativo_data)}{r.indicativo_collegamento && <> · <a href={r.indicativo_collegamento} target="_blank" rel="noreferrer">apri</a></>}</div>{r.indicativo_vecchio && <div style={{ ...piccolo, color: C.red }}>più vecchio di {par?.giorni_validita_prezzo_indicativo || 90} giorni</div>}</> : r.listino_euro_t != null ? <>{euroT(r.listino_euro_t)} €<div style={piccolo}>listino del programma</div></> : "—"}</td>
                  <td style={cella}>{(r.livello === "da verificare" || r.livello === "mancante" || (r.livello === "sicuro" && !r.fatture_valide && r.regola_prezzo === "fatture")) && <button onClick={() => chiediPreventivo([r.alimento])} style={{ ...bottone("#D35400"), padding: "5px 9px", fontSize: 11.5 }}>Chiedi preventivo</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* nuovo prezzo indicativo */}
      <div style={riquadro}>
        <div style={{ fontWeight: 700, color: C.primary, marginBottom: 8 }}>Inserisci un prezzo da Borsa Merci o da ricerca online</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div><label style={etichetta}>Alimento</label>
            <select value={nuovo.alimento} onChange={e => setNuovo({ ...nuovo, alimento: e.target.value })} style={campo}><option value="">—</option>{righe.map(r => <option key={r.alimento}>{r.alimento}</option>)}</select></div>
          <div><label style={etichetta}>Prezzo € per tonnellata</label><input type="number" min={0} step={0.01} value={nuovo.prezzo} onChange={e => setNuovo({ ...nuovo, prezzo: e.target.value })} style={campo} /></div>
          <div><label style={etichetta}>Data della rilevazione</label><input type="date" value={nuovo.data} onChange={e => setNuovo({ ...nuovo, data: e.target.value })} style={campo} /></div>
          <div style={{ gridColumn: "span 2" }}><label style={etichetta}>Fonte (es. «Borsa Merci di Bologna, listino n. 40, presa a Bologna»)</label><input value={nuovo.fonte} onChange={e => setNuovo({ ...nuovo, fonte: e.target.value })} style={campo} /></div>
          <div><label style={etichetta}>Collegamento (facoltativo)</label><input value={nuovo.collegamento} onChange={e => setNuovo({ ...nuovo, collegamento: e.target.value })} style={campo} /></div>
          <div style={{ gridColumn: "span 2" }}><label style={etichetta}>Nota</label><input value={nuovo.nota} onChange={e => setNuovo({ ...nuovo, nota: e.target.value })} style={campo} /></div>
        </div>
        <button onClick={salvaIndicativo} style={{ ...bottone(C.primary), marginTop: 10 }}>Registra prezzo indicativo</button>
        <div style={{ ...piccolo, marginTop: 6 }}>Un prezzo indicativo resta arancione. Lo sostituisce un preventivo (pagina «Preventivi ricevuti») e, quando l'alimento si compra, la fattura dell'anno.</div>
      </div>
    </div>
  );
}

// ───────────────────────────── 2. Chiedi preventivi ─────────────────────────────
export function ChiediPreventivi() {
  const [righe, setRighe] = useState([]);
  const [richieste, setRichieste] = useState([]);
  const [par, setPar] = useState(null);
  const [errore, setErrore] = useState(null);
  const [msg, setMsg] = useState(null);
  const [scelti, setScelti] = useState({});
  const [fornitore, setFornitore] = useState("");
  const [contatto, setContatto] = useState("");
  const [luogo, setLuogo] = useState("");

  async function carica() {
    const [v, q, p] = await Promise.all([
      supabase.from("ci_v_prezzi_riferimento").select("alimento, livello, gruppo").eq("anno", ANNO),
      supabase.from("ci_richieste_preventivo").select("*").order("created_at", { ascending: false }),
      supabase.from("ci_prezzi_parametri").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (v.error || q.error || p.error) { setErrore((v.error || q.error || p.error).message + " — il database ha le strutture della versione 245?"); return; }
    setRighe(v.data || []); setRichieste(q.data || []); setPar(p.data);
    setLuogo(l => l || p.data?.luogo_consegna || "");
  }
  useEffect(() => {
    carica();
    const pre = leggiPrescelti();
    if (pre.length) { setScelti(Object.fromEntries(pre.map(a => [a, { quantita: "", confezione: "sfuso" }]))); scriviPrescelti([]); }
  }, []);

  const elenco = Object.entries(scelti);
  const testo = useMemo(() => {
    const voci = elenco.map(([a, x]) => `- ${a}${x.quantita ? `: ${x.quantita} tonnellate` : ""}, ${x.confezione}`).join("\n");
    return `Oggetto: richiesta di preventivo – Podere Verde Società Agricola\n\nBuongiorno${fornitore ? " " + fornitore : ""},\n\nvi chiediamo un preventivo per la fornitura dei seguenti prodotti:\n${voci || "- (scegliere gli alimenti)"}\n\nConsegna: ${luogo || "—"}.\nVi preghiamo di indicare: prezzo in euro per tonnellata IVA esclusa, reso in azienda (oppure franco vostro magazzino, con il costo del trasporto a parte), quantità minima, tempi di consegna, validità dell'offerta e, per i mangimi, il cartellino con i componenti analitici.\n\nCordiali saluti,\nDott. Filippo Bizzarri\nPodere Verde Società Agricola`;
  }, [elenco, fornitore, luogo]);

  async function salva() {
    if (!fornitore.trim() || elenco.length === 0) { setMsg({ tipo: "errore", testo: "Scriva il fornitore e scelga almeno un alimento." }); return; }
    const { error } = await supabase.from("ci_richieste_preventivo").insert([{ fornitore: fornitore.trim(), contatto: contatto || null, alimenti: elenco.map(([a, x]) => ({ alimento: a, quantita_t: x.quantita === "" ? null : Number(x.quantita), confezione: x.confezione })), luogo_consegna: luogo || null, testo, inserito_da: await utente() }]);
    if (error) { setMsg({ tipo: "errore", testo: error.message }); return; }
    setMsg({ tipo: "ok", testo: `Richiesta a ${fornitore} registrata (stato «preparata»). Copi il testo e lo invii; poi segni «inviata».` });
    carica();
  }
  async function copia() { try { await navigator.clipboard.writeText(testo); setMsg({ tipo: "ok", testo: "Testo copiato." }); } catch { setMsg({ tipo: "errore", testo: "Copia non riuscita: selezioni il testo a mano." }); } }
  async function cambiaStato(id, stato) {
    const { error } = await supabase.from("ci_richieste_preventivo").update({ stato }).eq("id", id);
    if (error) setMsg({ tipo: "errore", testo: error.message }); else carica();
  }

  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;
  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>✉️ Chiedi preventivi</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13 }}>Scelga gli alimenti (quelli arancioni sono già spuntati se arriva da «Controlla prezzi»), le quantità e il fornitore: il programma prepara il testo della richiesta, da copiare e inviare. La richiesta resta registrata.</p>
      {msg && <div style={{ ...riquadro, padding: 10, fontSize: 13, color: msg.tipo === "errore" ? C.red : C.green }}>{msg.testo}</div>}
      <div style={riquadro}>
        <div style={{ fontWeight: 700, color: C.primary, marginBottom: 8 }}>Alimenti</div>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>{["", "Alimento", "Prezzo oggi", "Quantità in tonnellate", "Confezione"].map(h => <th key={h} style={{ padding: 6, textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>{righe.map(r => {
            const s = scelti[r.alimento];
            return (
              <tr key={r.alimento} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: 6 }}><input type="checkbox" checked={!!s} onChange={e => setScelti(x => { const y = { ...x }; if (e.target.checked) y[r.alimento] = { quantita: "", confezione: "sfuso" }; else delete y[r.alimento]; return y; })} /></td>
                <td style={{ padding: 6 }}>{r.alimento}</td>
                <td style={{ padding: 6, color: COLORE_LIVELLO[r.livello], fontWeight: 700 }}>{TESTO_LIVELLO[r.livello]}</td>
                <td style={{ padding: 6 }}>{s && <input type="number" min={0} step={0.1} value={s.quantita} onChange={e => setScelti(x => ({ ...x, [r.alimento]: { ...x[r.alimento], quantita: e.target.value } }))} style={{ ...campo, width: 110 }} />}</td>
                <td style={{ padding: 6 }}>{s && <select value={s.confezione} onChange={e => setScelti(x => ({ ...x, [r.alimento]: { ...x[r.alimento], confezione: e.target.value } }))} style={{ ...campo, width: 120 }}>{["sfuso", "sacchi", "balloni", "altro"].map(o => <option key={o}>{o}</option>)}</select>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div style={{ ...riquadro, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <div><label style={etichetta}>Fornitore</label><input value={fornitore} onChange={e => setFornitore(e.target.value)} placeholder="es. Cooperativa Ceri" style={campo} /></div>
        <div><label style={etichetta}>Contatto (e-mail o telefono)</label><input value={contatto} onChange={e => setContatto(e.target.value)} style={campo} /></div>
        <div style={{ gridColumn: "span 2" }}><label style={etichetta}>Luogo di consegna</label><input value={luogo} onChange={e => setLuogo(e.target.value)} style={campo} /></div>
      </div>
      <div style={riquadro}>
        <div style={{ fontWeight: 700, color: C.primary, marginBottom: 8 }}>Testo della richiesta</div>
        <textarea readOnly value={testo} rows={16} style={{ ...campo, fontFamily: "inherit", background: "#FAFAF7" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button onClick={copia} style={bottone(C.muted)}>Copia il testo</button>
          <button onClick={salva} style={bottone(C.primary)}>Registra la richiesta</button>
        </div>
      </div>
      <div style={riquadro}>
        <div style={{ fontWeight: 700, color: C.primary, marginBottom: 8 }}>Richieste registrate</div>
        {richieste.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Nessuna richiesta.</div>}
        {richieste.length > 0 && <table style={{ fontSize: 12.5 }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Data", "Fornitore", "Alimenti", "Stato"].map(h => <th key={h} style={{ padding: 6, textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>{richieste.map(q => (
            <tr key={q.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: 6 }}>{data(q.data_richiesta)}</td>
              <td style={{ padding: 6 }}>{q.fornitore}{q.contatto ? <div style={{ fontSize: 11.5, color: C.muted }}>{q.contatto}</div> : null}</td>
              <td style={{ padding: 6 }}>{(q.alimenti || []).map(a => a.alimento + (a.quantita_t ? ` (${formattaNumero(a.quantita_t, 1)} t, ${a.confezione})` : ` (${a.confezione})`)).join("; ")}</td>
              <td style={{ padding: 6 }}><select value={q.stato} onChange={e => cambiaStato(q.id, e.target.value)} style={{ ...campo, width: 150 }}>{["preparata", "inviata", "risposta ricevuta", "annullata"].map(o => <option key={o}>{o}</option>)}</select></td>
            </tr>))}</tbody>
        </table>}
      </div>
      {par && <div style={{ fontSize: 11.5, color: C.muted }}>Luogo di consegna predefinito: {par.luogo_consegna}.</div>}
    </div>
  );
}

// ───────────────────────────── 3. Preventivi ricevuti ─────────────────────────────
export function PreventiviRicevuti() {
  const [alimenti, setAlimenti] = useState([]);
  const [preventivi, setPreventivi] = useState([]);
  const [richieste, setRichieste] = useState([]);
  const [rif, setRif] = useState({});
  const [errore, setErrore] = useState(null);
  const [msg, setMsg] = useState(null);
  const [par, setPar] = useState(null);
  const vuoto = { alimento: "", fornitore: "", data_preventivo: oggiLocale(), scadenza: "", prezzo: "", consegna: "in azienda", confezione: "sfuso", quantita_minima_t: "", richiesta_id: "", nota: "" };
  const [n, setN] = useState(vuoto);

  async function carica() {
    const [v, p, q, pa] = await Promise.all([
      supabase.from("ci_v_prezzi_riferimento").select("*").eq("anno", ANNO),
      supabase.from("ci_preventivi_alimenti").select("*").order("data_preventivo", { ascending: false }),
      supabase.from("ci_richieste_preventivo").select("id, fornitore, data_richiesta").order("created_at", { ascending: false }),
      supabase.from("ci_prezzi_parametri").select("*").eq("id", 1).maybeSingle(),
    ]);
    setPar(pa.data || null);
    if (v.error || p.error || q.error) { setErrore((v.error || p.error || q.error).message + " — il database ha le strutture della versione 245?"); return; }
    setAlimenti((v.data || []).map(r => r.alimento)); setRif(Object.fromEntries((v.data || []).map(r => [r.alimento, r])));
    setPreventivi(p.data || []); setRichieste(q.data || []);
  }
  useEffect(() => { carica(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function salva() {
    const prezzo = Number(String(n.prezzo).replace(",", "."));
    if (!n.alimento || !n.fornitore.trim() || n.prezzo === "" || !(prezzo >= 0) || !n.data_preventivo) { setMsg({ tipo: "errore", testo: "Scriva alimento, fornitore, data e prezzo." }); return; }
    const { error } = await supabase.from("ci_preventivi_alimenti").insert([{ alimento: n.alimento, fornitore: n.fornitore.trim(), data_preventivo: n.data_preventivo, scadenza: n.scadenza || null, prezzo_euro_t: prezzo, consegna: n.consegna, confezione: n.confezione, quantita_minima_t: n.quantita_minima_t === "" ? null : Number(n.quantita_minima_t), richiesta_id: n.richiesta_id ? Number(n.richiesta_id) : null, nota: n.nota || null, inserito_da: await utente() }]);
    if (error) { setMsg({ tipo: "errore", testo: error.message }); return; }
    if (n.richiesta_id) await supabase.from("ci_richieste_preventivo").update({ stato: "risposta ricevuta" }).eq("id", Number(n.richiesta_id));
    const r = rif[n.alimento];
    setMsg({ tipo: "ok", testo: r?.livello === "sicuro" ? `Preventivo registrato. ${n.alimento} ha già un prezzo sicuro (fatture o produzione): il preventivo resta per confronto.` : `Preventivo registrato: da ora è il prezzo di riferimento di ${n.alimento} (blu) e lo usano le razioni.` });
    setN(vuoto); carica();
  }
  async function elimina(id) {
    if (!window.confirm("Eliminare questo preventivo?")) return;
    const { error } = await supabase.from("ci_preventivi_alimenti").delete().eq("id", id);
    if (error) setMsg({ tipo: "errore", testo: error.message }); else carica();
  }

  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;
  const oggi = oggiLocale();
  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>📥 Preventivi ricevuti</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13 }}>Il preventivo valido più recente sostituisce il prezzo di Borsa Merci o della ricerca online e diventa il prezzo di riferimento (blu). Quando l'alimento si compra nell'anno, lo sostituisce la fattura. Scaduto il preventivo (passata la data di scadenza o, se non ha scadenza, dopo i giorni di validità: 90), il prezzo torna arancione: resta il prezzo del preventivo se è più recente del prezzo di Borsa o online.</p>
      {msg && <div style={{ ...riquadro, padding: 10, fontSize: 13, color: msg.tipo === "errore" ? C.red : C.green }}>{msg.testo}</div>}
      <div style={riquadro}>
        <div style={{ fontWeight: 700, color: C.primary, marginBottom: 8 }}>Inserisci un preventivo</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          <div><label style={etichetta}>Alimento</label><select value={n.alimento} onChange={e => setN({ ...n, alimento: e.target.value })} style={campo}><option value="">—</option>{alimenti.map(a => <option key={a}>{a}</option>)}</select></div>
          <div><label style={etichetta}>Fornitore</label><input value={n.fornitore} onChange={e => setN({ ...n, fornitore: e.target.value })} style={campo} /></div>
          <div><label style={etichetta}>Prezzo € per tonnellata (IVA esclusa)</label><input type="number" min={0} step={0.01} value={n.prezzo} onChange={e => setN({ ...n, prezzo: e.target.value })} style={campo} /></div>
          <div><label style={etichetta}>Data del preventivo</label><input type="date" value={n.data_preventivo} onChange={e => setN({ ...n, data_preventivo: e.target.value })} style={campo} /></div>
          <div><label style={etichetta}>Valido fino al</label><input type="date" value={n.scadenza} onChange={e => setN({ ...n, scadenza: e.target.value })} style={campo} /></div>
          <div><label style={etichetta}>Consegna</label><select value={n.consegna} onChange={e => setN({ ...n, consegna: e.target.value })} style={campo}><option>in azienda</option><option>da ritirare</option></select></div>
          <div><label style={etichetta}>Confezione</label><select value={n.confezione} onChange={e => setN({ ...n, confezione: e.target.value })} style={campo}>{["sfuso", "sacchi", "balloni", "altro"].map(o => <option key={o}>{o}</option>)}</select></div>
          <div><label style={etichetta}>Quantità minima in tonnellate</label><input type="number" min={0} step={0.1} value={n.quantita_minima_t} onChange={e => setN({ ...n, quantita_minima_t: e.target.value })} style={campo} /></div>
          <div><label style={etichetta}>Risponde alla richiesta</label><select value={n.richiesta_id} onChange={e => setN({ ...n, richiesta_id: e.target.value })} style={campo}><option value="">—</option>{richieste.map(q => <option key={q.id} value={q.id}>{q.fornitore} · {data(q.data_richiesta)}</option>)}</select></div>
          <div style={{ gridColumn: "span 2" }}><label style={etichetta}>Nota</label><input value={n.nota} onChange={e => setN({ ...n, nota: e.target.value })} style={campo} /></div>
        </div>
        {n.consegna === "da ritirare" && <div style={{ fontSize: 12, color: "#D35400", marginTop: 6 }}>Merce da ritirare: aggiunga al prezzo il costo del trasporto fino in azienda, oppure lo scriva nella nota.</div>}
        <button onClick={salva} style={{ ...bottone(C.primary), marginTop: 10 }}>Registra preventivo</button>
      </div>
      <div style={{ ...riquadro, padding: 0, overflowX: "auto" }}>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Alimento", "Fornitore", "€ per tonnellata", "Data", "Valido fino al", "Consegna e confezione", "Quantità minima", "Stato", ""].map(h => <th key={h} style={{ padding: 6, textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>
            {preventivi.length === 0 && <tr><td colSpan={9} style={{ padding: 10, color: C.muted }}>Nessun preventivo.</td></tr>}
            {preventivi.map(p => {
              const scaduto = (p.scadenza || piuGiorni(p.data_preventivo, par?.giorni_validita_prezzo_indicativo || 90)) < oggi;
              const r = rif[p.alimento];
              const inUso = r && r.livello === "preventivo" && r.preventivo_fornitore === p.fornitore && r.data_preventivo === p.data_preventivo && Number(r.preventivo_euro_t) === Number(p.prezzo_euro_t);
              return (
                <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}`, color: scaduto ? C.muted : C.text }}>
                  <td style={{ padding: 6 }}>{p.alimento}</td><td style={{ padding: 6 }}>{p.fornitore}</td>
                  <td style={{ padding: 6, fontWeight: 700, color: inUso ? C.blue : undefined }}>{euroT(p.prezzo_euro_t)}</td>
                  <td style={{ padding: 6 }}>{data(p.data_preventivo)}</td><td style={{ padding: 6 }}>{data(p.scadenza)}</td>
                  <td style={{ padding: 6 }}>{p.consegna} · {p.confezione}</td>
                  <td style={{ padding: 6 }}>{p.quantita_minima_t != null ? t(p.quantita_minima_t) : "—"}</td>
                  <td style={{ padding: 6, fontWeight: 700, color: scaduto ? C.red : inUso ? C.blue : C.muted }}>{scaduto ? "scaduto" : inUso ? "prezzo di riferimento" : r?.livello === "sicuro" ? "per confronto (c'è la fattura)" : "per confronto"}</td>
                  <td style={{ padding: 6 }}><button onClick={() => elimina(p.id)} style={{ border: "none", background: "transparent", color: C.red, cursor: "pointer" }}>Elimina</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
