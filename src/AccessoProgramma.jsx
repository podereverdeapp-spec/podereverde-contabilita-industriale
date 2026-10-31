// Accesso al programma con le stesse email e password dell'app Podere Verde (versione 232).
// Dopo il primo accesso il programma resta collegato su quel computer finché non si preme «Esci»:
// la sessione è conservata nel browser e rinnovata da sola.
// Versione 337 (ordine del Dott. Bizzarri del 31/10/2026): chi non ha ancora un nome utente può «Chiedere l'accesso»;
// chi è entrato ma non è ancora «Attivo» nella cartella «Accessi» vede solo la schermata d'attesa.
import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import { C, FONT } from "./style";

const campo = { width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 15, background: "#FAFAF8", color: C.text, outline: "none", marginBottom: 12, fontFamily: FONT };
const scheda = { background: C.card, borderRadius: 20, padding: 32, width: "100%", maxWidth: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.10)", border: `1px solid ${C.border}` };
const bottone = (attesa) => ({ width: "100%", background: C.primary, color: "#fff", border: "none", borderRadius: 10, padding: 14, fontSize: 15, fontWeight: 700, cursor: attesa ? "wait" : "pointer" });
const link = { background: "transparent", border: "none", color: C.primary, fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontSize: 13.5, padding: 0, fontFamily: FONT };

export function useSessione() {
  const [sessione, setSessione] = useState(undefined); // undefined = in verifica
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessione(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => setSessione(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);
  return sessione;
}

export async function esci() {
  if (!window.confirm("Uscire dal programma? Al prossimo accesso servirà di nuovo email e password.")) return;
  await supabase.auth.signOut();
}

// Versione 337: che cosa può fare chi è entrato.
// stato: "verifica" | "attivo" | "attesa" | "bloccato" | "errore"
// Se la tabella degli accessi non c'è ancora (SQL della versione 337 non lanciato) il programma resta aperto come prima.
export function useAccesso(utente) {
  const [accesso, setAccesso] = useState({ stato: "verifica" });
  const carica = useCallback(async () => {
    if (!utente?.id) return;
    const [{ data: admin }, { data: riga, error }] = await Promise.all([
      supabase.rpc("ci_e_admin"),
      supabase.from("ci_accessi_programma").select("*").eq("profilo_id", utente.id).maybeSingle(),
    ]);
    if (error) {
      if (error.code === "42P01" || /does not exist|non esiste/i.test(error.message || "")) {
        setAccesso({ stato: "attivo", admin: !!admin, gestore: false, tutto: true, parti: [], lavoro: true, senzaTabella: true });
      } else setAccesso({ stato: "errore", messaggio: error.message });
      return;
    }
    if (admin) { setAccesso({ stato: "attivo", admin: true, gestore: true, tutto: true, parti: [], lavoro: true }); return; }
    let r = riga;
    if (!r) {
      // Prima volta nel programma: nasce la richiesta «In attesa», che il Dott. Bizzarri o un gestore vedono nella cartella «Accessi»
      const { data: nuova, error: eI } = await supabase.from("ci_accessi_programma")
        .insert([{ profilo_id: utente.id, stato: "In attesa", note: "Richiesta nata entrando nel programma" }]).select().maybeSingle();
      if (eI && !/duplicate|unique/i.test(eI.message || "")) { setAccesso({ stato: "errore", messaggio: eI.message }); return; }
      r = nuova || { stato: "In attesa" };
    }
    if (r.stato === "Bloccato") { setAccesso({ stato: "bloccato" }); return; }
    if (r.stato !== "Attivo") { setAccesso({ stato: "attesa", richiestoIl: r.richiesto_il }); return; }
    const { data: lavoro } = await supabase.rpc("ci_puo_vedere_dati_lavoro");
    setAccesso({ stato: "attivo", admin: false, gestore: !!r.gestore_accessi, tutto: !!r.tutto_il_programma, parti: r.parti || [], lavoro: !!lavoro });
  }, [utente?.id]);
  useEffect(() => { carica(); }, [carica]);
  return [accesso, carica];
}

// Schermata per chi è entrato ma non può ancora usare il programma
export function SchermataAttesa({ utente, accesso, onRicontrolla }) {
  const [verifica, setVerifica] = useState(false);
  const bloccato = accesso.stato === "bloccato";
  const errore = accesso.stato === "errore";
  async function ricontrolla() { setVerifica(true); await onRicontrolla(); setVerifica(false); }
  return (
    <div style={{ fontFamily: FONT, background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={scheda}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 40 }}>{bloccato ? "⛔" : errore ? "⚠️" : "⏳"}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: bloccato || errore ? C.red : C.primary, marginTop: 6 }}>
            {bloccato ? "Accesso bloccato" : errore ? "Non riesco a controllare l'accesso" : "Richiesta di accesso arrivata"}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>👤 {utente?.email}</div>
        </div>
        <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6, marginBottom: 18 }}>
          {bloccato && <>Il Suo accesso al programma è stato <b>bloccato</b>. Se pensa che sia un errore, chieda al Dott. Filippo Bizzarri.</>}
          {errore && <>C'è stato un problema nel controllo: <i>{accesso.messaggio}</i>. Riprovi tra poco; se si ripete, avvisi il Dott. Filippo Bizzarri.</>}
          {!bloccato && !errore && <>
            La Sua richiesta è stata registrata. <b>Adesso deve aspettare</b>: il Dott. Filippo Bizzarri (o chi gestisce gli accessi)
            deve dirle di sì e scegliere quali parti del programma può usare.<br /><br />
            Quando Le avranno dato l'accesso, prema <b>«Controlla di nuovo»</b> e il programma si aprirà.
          </>}
        </div>
        {!bloccato && (
          <button onClick={ricontrolla} disabled={verifica} style={{ ...bottone(verifica), marginBottom: 10 }}>
            {verifica ? "Controllo in corso…" : "Controlla di nuovo"}
          </button>
        )}
        <button onClick={esci} style={{ ...bottone(false), background: "transparent", color: C.muted, border: `1.5px solid ${C.border}` }}>Esci</button>
      </div>
    </div>
  );
}

export default function AccessoProgramma() {
  const [modo, setModo] = useState("entra"); // "entra" | "chiedi" | "inviata"
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [attesa, setAttesa] = useState(false);
  const [errore, setErrore] = useState("");

  function cambia(m) { setModo(m); setErrore(""); setPassword(""); setPassword2(""); }

  async function entra(e) {
    e.preventDefault();
    if (!email || !password) { setErrore("Inserire email e password."); return; }
    setAttesa(true); setErrore("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setErrore("Email o password non corrette. Sono le stesse dell'app Podere Verde.");
    setAttesa(false);
  }

  async function chiedi(e) {
    e.preventDefault();
    if (!nome.trim() || !cognome.trim()) { setErrore("Scrivere nome e cognome."); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErrore("L'email non sembra giusta: controlli che ci sia la @ e il punto."); return; }
    if (password.length < 8) { setErrore("La password deve avere almeno 8 caratteri."); return; }
    if (password !== password2) { setErrore("Le due password non sono uguali: le riscriva."); return; }
    setAttesa(true); setErrore("");
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { nome: `${nome.trim()} ${cognome.trim()}` } },
    });
    setAttesa(false);
    if (error) {
      setErrore(/registered|already/i.test(error.message || "")
        ? "Questa email ha già un nome utente (per esempio dell'app Podere Verde). Torni indietro e prema «Entra» con la sua password."
        : `La richiesta non è partita: ${error.message}`);
      return;
    }
    // Se l'email deve essere confermata non c'è ancora la sessione: lo si dice chiaramente
    if (!data.session) setModo("inviata");
    // altrimenti la sessione è già aperta: si passa da soli alla schermata d'attesa
  }

  return (
    <div style={{ fontFamily: FONT, background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onSubmit={modo === "chiedi" ? chiedi : entra} style={scheda}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.primary }}>Contabilità Industriale</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Podere Verde</div>
        </div>

        {modo === "entra" && <>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
            Entrare con la <b>stessa email e password dell'app Podere Verde</b>. Su questo computer il programma resterà collegato finché non si preme «Esci».
          </div>
          <input type="email" autoComplete="username" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={campo} />
          <input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={campo} />
          {errore && <div style={{ background: "#FDECEA", color: C.red, borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>{errore}</div>}
          <button type="submit" disabled={attesa} style={bottone(attesa)}>{attesa ? "Accesso in corso…" : "Entra"}</button>
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}`, fontSize: 13.5, color: C.muted, textAlign: "center", lineHeight: 1.6 }}>
            Non ha ancora email e password per il programma?<br />
            <button type="button" onClick={() => cambia("chiedi")} style={link}>Chieda l'accesso</button>
          </div>
        </>}

        {modo === "chiedi" && <>
          <div style={{ fontSize: 13.5, color: C.text, marginBottom: 16, lineHeight: 1.55 }}>
            Scriva i suoi dati e scelga una password. <b>Il programma non si apre subito</b>: la richiesta arriva al Dott. Filippo Bizzarri,
            che deve dire di sì. Fino ad allora vedrà solo una pagina d'attesa.
          </div>
          <input autoComplete="given-name" placeholder="Nome" value={nome} onChange={e => setNome(e.target.value)} style={campo} />
          <input autoComplete="family-name" placeholder="Cognome" value={cognome} onChange={e => setCognome(e.target.value)} style={campo} />
          <input type="email" autoComplete="email" placeholder="Email (quella di lavoro)" value={email} onChange={e => setEmail(e.target.value)} style={campo} />
          <input type="password" autoComplete="new-password" placeholder="Password (almeno 8 caratteri)" value={password} onChange={e => setPassword(e.target.value)} style={campo} />
          <input type="password" autoComplete="new-password" placeholder="Riscriva la stessa password" value={password2} onChange={e => setPassword2(e.target.value)} style={campo} />
          {errore && <div style={{ background: "#FDECEA", color: C.red, borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>{errore}</div>}
          <button type="submit" disabled={attesa} style={bottone(attesa)}>{attesa ? "Invio in corso…" : "Invia la richiesta di accesso"}</button>
          <div style={{ marginTop: 14, textAlign: "center" }}>
            <button type="button" onClick={() => cambia("entra")} style={link}>← Torna a «Entra»</button>
          </div>
        </>}

        {modo === "inviata" && <>
          <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6, marginBottom: 18 }}>
            ✅ Richiesta inviata.<br /><br />
            Le è arrivata un'email all'indirizzo <b>{email.trim()}</b>: la apra e prema il collegamento per confermare l'indirizzo.
            Poi torni qui, prema «Entra» con email e password, e aspetti il sì del Dott. Filippo Bizzarri.
          </div>
          <button type="button" onClick={() => cambia("entra")} style={bottone(false)}>Torna a «Entra»</button>
        </>}
      </form>
    </div>
  );
}
