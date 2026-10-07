// Accesso al programma con le stesse email e password dell'app Podere Verde (versione 232).
// Dopo il primo accesso il programma resta collegato su quel computer finché non si preme «Esci»:
// la sessione è conservata nel browser e rinnovata da sola.
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C, FONT } from "./style";

const campo = { width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 15, background: "#FAFAF8", color: C.text, outline: "none", marginBottom: 12, fontFamily: FONT };

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

export default function AccessoProgramma() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [attesa, setAttesa] = useState(false);
  const [errore, setErrore] = useState("");

  async function entra(e) {
    e.preventDefault();
    if (!email || !password) { setErrore("Inserire email e password."); return; }
    setAttesa(true); setErrore("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setErrore("Email o password non corrette. Sono le stesse dell'app Podere Verde.");
    setAttesa(false);
  }

  return (
    <div style={{ fontFamily: FONT, background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onSubmit={entra} style={{ background: C.card, borderRadius: 20, padding: 32, width: "100%", maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.10)", border: `1px solid ${C.border}` }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.primary }}>Contabilità Industriale</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Podere Verde</div>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
          Entrare con la <b>stessa email e password dell'app Podere Verde</b>. Su questo computer il programma resterà collegato finché non si preme «Esci».
        </div>
        <input type="email" autoComplete="username" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={campo} />
        <input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={campo} />
        {errore && <div style={{ background: "#FDECEA", color: C.red, borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>{errore}</div>}
        <button type="submit" disabled={attesa}
          style={{ width: "100%", background: C.primary, color: "#fff", border: "none", borderRadius: 10, padding: 14, fontSize: 15, fontWeight: 700, cursor: attesa ? "wait" : "pointer" }}>
          {attesa ? "Accesso in corso…" : "Entra"}
        </button>
      </form>
    </div>
  );
}
