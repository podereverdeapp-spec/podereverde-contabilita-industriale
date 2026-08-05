import { useState } from "react";
import { supabase } from "./supabase";

const C = {
  bg:"#F5F0E8", card:"#FFFFFF", primary:"#5C3D1E", accent:"#A0522D",
  green:"#4A7C59", red:"#C0392B", text:"#2D1B0E", muted:"#8B7355", border:"#D4C4A8",
};

const inputStyle = {width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,borderRadius:10,padding:"12px 14px",fontSize:15,background:"#FAFAF8",color:C.text,outline:"none",marginBottom:12};

export default function Auth() {
  const [mode, setMode]       = useState("login"); // login | register
  const [nome, setNome]       = useState("");
  const [email, setEmail]     = useState("");
  const [password, setPass]   = useState("");
  const [loading, setLoading] = useState(false);
  const [errore, setErrore]   = useState("");
  const [messaggio, setMessaggio] = useState("");

  const login = async () => {
    if (!email || !password) { setErrore("Inserisci email e password"); return; }
    setLoading(true); setErrore("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErrore("Credenziali non valide. Riprova.");
    setLoading(false);
  };

  const registra = async () => {
    if (!nome || !email || !password) { setErrore("Compila tutti i campi"); return; }
    if (password.length < 6) { setErrore("Password minimo 6 caratteri"); return; }
    setLoading(true); setErrore("");
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { nome } }
    });
    if (error) setErrore(error.message);
    else setMessaggio("Registrazione completata! Controlla la tua email per confermare l'account.");
    setLoading(false);
  };

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:C.card,borderRadius:24,padding:32,width:"100%",maxWidth:400,boxShadow:"0 8px 32px rgba(0,0,0,0.12)"}}>

        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:28}}>
          <img src="/logo192.png" alt="logo" style={{height:80, marginBottom:8}} />
          <div style={{fontSize:22,fontWeight:800,color:C.primary}}>App Allevamento</div>
          <div style={{fontSize:13,color:C.muted,marginTop:4}}>Gestione zootecnica integrata</div>
        </div>

        {/* Tab login/registra */}
        <div style={{display:"flex",background:C.bg,borderRadius:12,padding:4,marginBottom:24}}>
          {["login","register"].map(m=>(
            <button key={m} onClick={()=>{setMode(m);setErrore("");setMessaggio("");}}
              style={{flex:1,padding:"10px 0",background:mode===m?C.primary:"transparent",color:mode===m?"#FFF":C.muted,border:"none",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer"}}>
              {m==="login"?"Accedi":"Registrati"}
            </button>
          ))}
        </div>

        {messaggio ? (
          <div style={{background:C.green+"15",border:`1.5px solid ${C.green}`,borderRadius:12,padding:16,textAlign:"center",color:C.green,fontWeight:600}}>
            ✅ {messaggio}
          </div>
        ) : (
          <>
            {mode==="register" && (
              <input placeholder="Nome e cognome" value={nome} onChange={e=>setNome(e.target.value)} style={inputStyle}/>
            )}
            <input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} style={inputStyle}/>
            <input placeholder="Password" type="password" value={password} onChange={e=>setPass(e.target.value)} style={inputStyle}
              onKeyDown={e=>e.key==="Enter"&&(mode==="login"?login():registra())}/>

            {errore && (
              <div style={{background:C.red+"15",border:`1.5px solid ${C.red}33`,borderRadius:10,padding:"10px 14px",color:C.red,fontSize:13,marginBottom:12}}>
                ⚠ {errore}
              </div>
            )}

            <button onClick={mode==="login"?login:registra} disabled={loading}
              style={{width:"100%",background:loading?C.muted:C.primary,color:"#FFF",border:"none",borderRadius:12,padding:"14px 0",fontSize:16,fontWeight:700,cursor:loading?"not-allowed":"pointer",boxShadow:"0 4px 12px rgba(92,61,30,0.3)"}}>
              {loading?"...":(mode==="login"?"Accedi":"Crea account")}
            </button>

            {mode==="login" && (
              <div style={{textAlign:"center",marginTop:16,fontSize:13,color:C.muted}}>
                Non hai un account?{" "}
                <span onClick={()=>setMode("register")} style={{color:C.primary,fontWeight:700,cursor:"pointer"}}>Registrati</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
