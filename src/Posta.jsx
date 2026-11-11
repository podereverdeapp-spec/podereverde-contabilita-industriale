import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { caricaComunicazioni, caricaAnagrafiche, intestatarioDi, quando, apriAllegato, puoSpedireMail, caricaBloccati, sbloccaMittente,
  bloccaMittente, togliDalRegistro, contaRicevuteDa, anagraficheDi } from "./anagrafiche";

// Versione 364 — sezione «Posta» (ordine del Dott. Bizzarri dell'11/11/2026, ore 13:09–13:19).
// Le mail della casella podereverdeapp@gmail.com, ricevute e inviate, comprese quelle di indirizzi sconosciuti
// (le porta il postino ogni 5 minuti, funzione «comunicazioni-ricevi» versione 3), e le mail partite dal programma.
// - «È spam»: blocca l'indirizzo o tutto il dominio; da quel momento le sue mail non entrano più e quelle già entrate escono dall'elenco.
// - Chi ha aperto ogni mail e quando (tabella ci_comunicazioni_aperture, funzione ci_segna_aperta).
// - Il numero rosso nel menu conta le mail ricevute che nessuno ha ancora aperto (funzione ci_posta_da_aprire).
// La vedono le persone con il permesso «Può spedire mail dal programma».

const SCHEDE = [["arrivo", "📥 In arrivo"], ["inviate", "📤 Inviate"], ["bloccati", "⛔ Spam: mittenti bloccati"]];
const dominioDi = m => String(m || "").split("@")[1] || "";
// Domini di posta usati da tutti: bloccarli intero bloccherebbe anche clienti, fornitori e utenti del programma (ricontrollo del 11/11/2026)
const DOMINI_PUBBLICI = /^(gmail\.com|googlemail\.com|libero\.it|virgilio\.it|alice\.it|tim\.it|tin\.it|tiscali\.it|fastwebnet\.it|email\.it|inwind\.it|iol\.it|yahoo\.[a-z.]+|ymail\.com|hotmail\.[a-z.]+|outlook\.[a-z.]+|live\.[a-z.]+|msn\.com|icloud\.com|me\.com|mac\.com|aol\.com|proton\.me|protonmail\.com|gmx\.[a-z.]+|pec\.it|legalmail\.it|pec\.aruba\.it|arubapec\.it|aruba\.it|postecert\.it|poste\.it)$/i;
const td = { padding: "5px 8px", fontSize: 12.5, verticalAlign: "top", borderTop: `1px solid ${C.border}` };

// Usata dal menu: mail ricevute che nessuno ha ancora aperto
export async function contaPostaDaAprire() {
  const { data, error } = await supabase.rpc("ci_posta_da_aprire");
  return error ? 0 : Number(data) || 0;
}

export default function Posta() {
  const [puo, setPuo] = useState(null);
  const [righe, setRighe] = useState([]);
  const [anagrafiche, setAnagrafiche] = useState({ clienti: [], fornitori: [] });
  const [aperture, setAperture] = useState(new Map());
  const [bloccati, setBloccati] = useState([]);
  const [vista, setVista] = useState("arrivo");
  const [cerca, setCerca] = useState("");
  const [aperta, setAperta] = useState(null);
  const [errore, setErrore] = useState("");
  const [caricamento, setCaricamento] = useState(true);

  const carica = useCallback(async () => {
    try {
      const [r, cl, fo, bl] = await Promise.all([caricaComunicazioni(), caricaAnagrafiche("cliente"), caricaAnagrafiche("fornitore"), caricaBloccati()]);
      const mail = r.filter(c => c.origine === "registro" && c.tipo !== "Telefonata");
      setRighe(mail); setAnagrafiche({ clienti: cl, fornitori: fo }); setBloccati(bl);
      const ids = mail.map(c => c.id);
      const { data, error } = ids.length ? await supabase.rpc("ci_aperture_mail", { p_comunicazioni: ids }) : { data: [] };
      if (error) throw new Error(`Aperture: ${error.message}`);
      const m = new Map(); for (const a of data || []) { if (!m.has(a.comunicazione_id)) m.set(a.comunicazione_id, []); m.get(a.comunicazione_id).push(a); }
      setAperture(m); setErrore("");
      window.dispatchEvent(new Event("posta-cambiata")); // il numero rosso del menu si aggiorna subito
    } catch (e) { setErrore(e.message); }
    setCaricamento(false);
  }, []);
  useEffect(() => { puoSpedireMail().then(setPuo); carica(); const t = setInterval(carica, 60 * 1000); return () => clearInterval(t); }, [carica]);

  const intest = c => intestatarioDi(c, anagrafiche.clienti, anagrafiche.fornitori);
  const elenco = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return righe.filter(c => !c.tolta_il && (vista === "arrivo" ? c.direzione === "ricevuta" : c.direzione === "inviata"))
      .filter(c => !q || [c.oggetto, c.testo, c.indirizzo, c.mittente, ...intest(c).map(x => x.nome)].some(v => String(v || "").toLowerCase().includes(q)));
  }, [righe, vista, cerca, anagrafiche]); // eslint-disable-line react-hooks/exhaustive-deps
  const daAprire = righe.filter(c => c.direzione === "ricevuta" && !c.tolta_il && c.sezione === "Casella podereverdeapp" && !aperture.has(c.id)).length;

  async function apri(c) {
    setAperta(c);
    const { error } = await supabase.rpc("ci_segna_aperta", { p_comunicazione: c.id });
    if (error) setErrore(`Apertura non registrata: ${error.message}`); else carica();
  }

  if (puo === false) return <div style={{ maxWidth: 900 }}><h2 style={{ color: C.primary }}>Posta</h2>
    <div style={{ ...scheda, borderLeft: `4px solid ${C.red}` }}>La Posta la vedono solo le persone con il permesso «Può spedire mail dal programma» (cartella «Accessi»).</div></div>;

  return (
    <div style={{ maxWidth: 1200 }}>
      <h2 style={{ color: C.primary, margin: "0 0 4px" }}>Posta</h2>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>Le mail della casella podereverdeapp@gmail.com e quelle partite dal programma. Arrivano da sole ogni 5 minuti; la pagina si aggiorna ogni minuto.</div>
      {errore && <div style={{ ...scheda, borderLeft: `4px solid ${C.red}`, color: C.red, fontWeight: 700 }}>{errore}</div>}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {SCHEDE.map(([k, t]) => <button key={k} onClick={() => setVista(k)} style={btn(vista === k)}>{t}{k === "arrivo" && daAprire > 0 ? ` (${daAprire} da aprire)` : ""}{k === "bloccati" ? ` (${bloccati.length})` : ""}</button>)}
        {vista !== "bloccati" && <input style={{ ...input, flex: 1, minWidth: 220 }} placeholder="Cerca: mittente, oggetto, testo, cliente o fornitore…" value={cerca} onChange={e => setCerca(e.target.value)} />}
      </div>

      {caricamento ? <div>Lettura in corso…</div> : vista === "bloccati" ? <Bloccati bloccati={bloccati} onCambiato={carica} /> : (
        <div style={{ ...scheda, padding: 0, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Data e ora", vista === "arrivo" ? "Da" : "A", "Cliente o fornitore", "Oggetto", "Allegati", "Aperta da"].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 12.5 }}>{h}</th>)}</tr></thead>
            <tbody>
              {elenco.map(c => { const ap = aperture.get(c.id) || []; const l = intest(c); const nuova = vista === "arrivo" && !ap.length && c.sezione === "Casella podereverdeapp";
                return <tr key={c.id} onClick={() => apri(c)} style={{ cursor: "pointer", background: nuova ? "#FFF8E6" : undefined }}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{quando(c.data_ora)}</td>
                  <td style={td}>{c.indirizzo || "—"}</td>
                  <td style={td}>{l.length ? l.map(x => `${x.tipo === "cliente" ? "🤝" : "🏢"} ${x.nome}`).join(" · ") : <span style={{ color: C.muted }}>indirizzo sconosciuto</span>}</td>
                  <td style={{ ...td, fontWeight: nuova ? 800 : 400 }}>{nuova ? "● " : ""}{c.oggetto || "(senza oggetto)"}</td>
                  <td style={td}>{(c.allegati || []).length ? `📎 ${(c.allegati || []).length}` : ""}</td>
                  <td style={{ ...td, color: nuova ? C.red : C.text }}>{ap.length ? ap.map(a => a.chi).join(", ") : "nessuno"}</td>
                </tr>; })}
              {!elenco.length && <tr><td colSpan={6} style={{ ...td, color: C.muted }}>{cerca ? "Nessuna mail trovata." : vista === "arrivo" ? "Nessuna mail ricevuta." : "Nessuna mail inviata."}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {aperta && <Mail c={righe.find(x => x.id === aperta.id) || aperta} aperture={aperture.get(aperta.id) || []} intest={intest(aperta)}
        onChiudi={() => setAperta(null)} onCambiato={() => { setAperta(null); carica(); }} />}
    </div>
  );
}

function Mail({ c, aperture, intest, onChiudi, onCambiato }) {
  const [modo, setModo] = useState(null); // "spam" | "togli"
  const scarica = async a => { try { await apriAllegato(a); } catch (e) { alert(`⚠️ ${e.message}`); } };
  return (
    <Finestra onChiudi={onChiudi}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, color: C.primary, fontSize: 16 }}>{c.oggetto || "(senza oggetto)"}</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>{c.direzione === "ricevuta" ? "Da" : "A"}: <b>{c.indirizzo}</b>{intest.length ? ` — ${intest.map(x => x.nome).join(", ")}` : " — indirizzo sconosciuto"}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{quando(c.data_ora)} · {c.sezione}{c.firma ? ` · firma «${c.firma}»` : ""}</div>
        </div>
        <button onClick={onChiudi} style={btn(false)}>Chiudi</button>
      </div>
      <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.5, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, margin: "10px 0", maxHeight: "50vh", overflow: "auto", background: "#FAFAF7" }}>{c.testo || "(nessun testo)"}</div>
      {(c.allegati || []).length > 0 && <div style={{ fontSize: 13, marginBottom: 8 }}>Allegati: {(c.allegati || []).map((a, i) => <button key={i} onClick={() => scarica(a)} style={{ ...btn(false), marginRight: 6 }}>📎 {a.nome}</button>)}</div>}
      <div style={{ fontSize: 12.5, marginBottom: 10 }}><b>Aperta da:</b> {aperture.length ? aperture.map(a => `${a.chi} (prima volta ${quando(a.prima_apertura)}${a.aperture > 1 ? `, ultima ${quando(a.ultima_apertura)}, ${a.aperture} volte` : ""})`).join("; ") : "nessuno"}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {c.direzione === "ricevuta" && String(c.indirizzo || "").includes("@") && <button onClick={() => setModo(modo === "spam" ? null : "spam")} style={btn(modo === "spam", C.red)}>⛔ È spam</button>}
        <button onClick={() => setModo(modo === "togli" ? null : "togli")} style={btn(modo === "togli", C.red)}>🗑 Togli dall'elenco</button>
      </div>
      {modo === "spam" && <Spam c={c} onFatto={onCambiato} />}
      {modo === "togli" && <Togli c={c} onFatto={onCambiato} />}
    </Finestra>
  );
}

function Spam({ c, onFatto }) {
  const mail = String(c.indirizzo || "").trim().toLowerCase();
  const [genere, setGenere] = useState("indirizzo");
  const [motivo, setMotivo] = useState("Spam");
  const [quante, setQuante] = useState(null);
  const [legati, setLegati] = useState([]);
  const [lavoro, setLavoro] = useState(false);
  const [avviso, setAvviso] = useState("");
  const valore = genere === "dominio" ? dominioDi(mail) : mail;
  useEffect(() => {
    let vivo = true; setQuante(null); setLegati([]);
    contaRicevuteDa({ valore, genere }).then(n => { if (vivo) setQuante(n); }).catch(() => { if (vivo) setQuante(0); });
    anagraficheDi({ valore, genere }).then(l => { if (vivo) setLegati(l); }).catch(() => {});
    return () => { vivo = false; };
  }, [valore, genere]);
  async function conferma() {
    if (!motivo.trim()) { setAvviso("Scrivere il motivo."); return; }
    setLavoro(true);
    try { await bloccaMittente({ valore, genere, motivo, togliGia: true }); onFatto(); }
    catch (e) { setAvviso(e.message); setLavoro(false); }
  }
  return (
    <div style={{ marginTop: 10, padding: 10, border: `1px solid ${C.red}`, borderRadius: 8, fontSize: 13 }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}><input type="radio" checked={genere === "indirizzo"} onChange={() => setGenere("indirizzo")} /> Solo l'indirizzo <b>{mail}</b></label>
      {DOMINI_PUBBLICI.test(dominioDi(mail))
        ? <div style={{ color: C.muted, marginBottom: 6 }}>Il dominio @{dominioDi(mail)} è di posta pubblica, usato da tutti: non si può bloccare intero, solo l'indirizzo.</div>
        : <label style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}><input type="radio" checked={genere === "dominio"} onChange={() => setGenere("dominio")} /> Tutto il dominio <b>@{dominioDi(mail)}</b> (ogni indirizzo dopo la @)</label>}
      {legati.length > 0 && <div style={{ background: "#FDECEA", color: C.red, fontWeight: 700, borderRadius: 6, padding: "6px 8px", marginBottom: 6 }}>⚠️ Appartiene a {legati.join(", ")}: bloccandolo non entreranno più neppure le sue mail buone.</div>}
      <div>Da ora le mail di {genere === "dominio" ? `tutto il dominio @${dominioDi(mail)}` : mail} non entrano più nel programma. Escono dall'elenco anche le {quante === null ? "…" : quante} già arrivate (restano nella casella Gmail). Si sblocca dalla scheda «Spam: mittenti bloccati».</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        Motivo: <input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={200} style={{ ...input, flex: 1 }} />
        <button disabled={lavoro} onClick={conferma} style={btn(true, C.red)}>{lavoro ? "In corso…" : "Sì, è spam"}</button>
      </div>
      {avviso && <div style={{ color: C.red, fontWeight: 700, marginTop: 6 }}>{avviso}</div>}
    </div>
  );
}

function Togli({ c, onFatto }) {
  const [motivo, setMotivo] = useState("");
  const [avviso, setAvviso] = useState("");
  const [lavoro, setLavoro] = useState(false);
  async function conferma() {
    if (!motivo.trim()) { setAvviso("Scrivere il motivo."); return; }
    setLavoro(true);
    try { await togliDalRegistro(c.id, motivo.trim()); onFatto(); } catch (e) { setAvviso(e.message); setLavoro(false); }
  }
  return (
    <div style={{ marginTop: 10, padding: 10, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }}>
      Solo questa mail esce dall'elenco: il mittente non viene bloccato. Resta conservata e si rimette dal «Registro delle Comunicazioni» («Mostra anche le tolte»).
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        Motivo: <input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={200} placeholder="Per esempio: doppione" style={{ ...input, flex: 1 }} />
        <button disabled={lavoro} onClick={conferma} style={btn(true, C.red)}>{lavoro ? "In corso…" : "Sì, togli dall'elenco"}</button>
      </div>
      {avviso && <div style={{ color: C.red, fontWeight: 700, marginTop: 6 }}>{avviso}</div>}
    </div>
  );
}

function Bloccati({ bloccati, onCambiato }) {
  const [avviso, setAvviso] = useState("");
  const [chi, setChi] = useState(null);
  async function sblocca(b) { try { await sbloccaMittente(b.id); setChi(null); onCambiato(); } catch (e) { setAvviso(e.message); } }
  if (!bloccati.length) return <div style={{ ...scheda, color: C.muted }}>Nessun mittente bloccato. Si blocca aprendo una mail ricevuta e premendo «⛔ È spam».</div>;
  return (
    <div style={{ ...scheda, padding: 0 }}>
      {avviso && <div style={{ color: C.red, fontWeight: 700, padding: 8 }}>{avviso}</div>}
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Bloccato", "Motivo", "Dal", ""].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 12.5 }}>{h}</th>)}</tr></thead>
        <tbody>{bloccati.map(b => <tr key={b.id}>
          <td style={td}>{b.genere === "dominio" ? `tutto il dominio @${b.valore}` : b.valore}</td>
          <td style={td}>{b.motivo}</td>
          <td style={{ ...td, whiteSpace: "nowrap" }}>{quando(b.bloccato_il)}</td>
          <td style={td}>{chi === b.id
            ? <span>Le sue mail nuove torneranno a entrare. <button onClick={() => sblocca(b)} style={btn(true)}>Sì, sblocca</button> <button onClick={() => setChi(null)} style={btn(false)}>No</button></span>
            : <button onClick={() => setChi(b.id)} style={btn(false)}>Sblocca</button>}</td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}

// Finestra sopra la pagina (come nella versione 361): si chiude con «Chiudi», con il tasto Esc o cliccando fuori
function Finestra({ children, onChiudi }) {
  useEffect(() => { const k = e => { if (e.key === "Escape") onChiudi(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onChiudi]);
  return <div role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) onChiudi(); }}
    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <div style={{ background: "#fff", borderRadius: 10, padding: 14, width: "min(900px, 96vw)", maxHeight: "94vh", overflow: "auto", boxShadow: "0 8px 30px rgba(0,0,0,0.3)" }}>{children}</div>
  </div>;
}
