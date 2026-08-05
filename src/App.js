import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import Auth from "./Auth";
import AllevamentoApp      from "./allevamento_app";
import Pedigree            from "./pedigree";
import LottiSuini          from "./lotti_suini";
import SelezioneGenetica   from "./selezione_genetica";
import CostiAllevamento    from "./costi_allevamento";
import CostoOrigine        from "./costo_origine";
import RegistroUscite      from "./registro_uscite";
import CostiGenerali       from "./costi_generali";
import CostiComplessivi    from "./costi_complessivi";
import Guida               from "./Guida";
import ExportManager       from "./ExportManager";
import UBAReport            from "./UBAReport";
import Destinatari          from "./destinatari";
import { exportCompleto }  from "./exportExcel";
import "./App.css";

const C = { primary:"#5C3D1E", border:"#D4C4A8", muted:"#8B7355", bg:"#F5F0E8", red:"#C0392B" };

const TABS = [
  { id:"gestione",    label:"Gestione",   icon:"🐄" },
  { id:"pedigree",    label:"Pedigree",   icon:"🧬" },
  { id:"lotti",       label:"Lotti",      icon:"🐷" },
  { id:"selezione",   label:"Selezione",  icon:"🏆" },
  { id:"complessivi", label:"Costi",      icon:"📊" },
  { id:"origine",     label:"Origine",    icon:"🧾" },
  { id:"uscite",      label:"Uscite",     icon:"📤" },
  { id:"generali",    label:"Struttura",  icon:"🏭" },
  { id:"uba",         label:"UBA",        icon:"🐾" },
  { id:"export",      label:"Esporta",    icon:"📥" },
  { id:"email",       label:"Email",      icon:"📮" },
  { id:"guida",       label:"Guida",      icon:"📖" },
];

export default function App() {
  const [sessione,   setSessione]   = useState(null);
  const [profilo,    setProfilo]    = useState(null);
  const [tab,        setTab]        = useState("gestione");
  const [menuAperto, setMenuAperto] = useState(false);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessione(session);
      if (session) caricaProfilo(session.user.id);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessione(session);
      if (session) caricaProfilo(session.user.id);
      else setProfilo(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const caricaProfilo = async (userId) => {
    const { data } = await supabase.from('profili').select('*').eq('id', userId).single();
    setProfilo(data);
  };

  const logout = async () => { await supabase.auth.signOut(); setMenuAperto(false); };

  const esportaTutto = async () => {
    const [animali, sanitari, costi, lotti, suini, uscite, macchinari, costiGen] = await Promise.all([
      supabase.from('animali').select('*'),
      supabase.from('eventi_sanitari').select('*'),
      supabase.from('costi_animale').select('*'),
      supabase.from('lotti_suini').select('*'),
      supabase.from('suini_lotto').select('*'),
      supabase.from('uscite').select('*'),
      supabase.from('macchinari').select('*'),
      supabase.from('costi_generali').select('*'),
    ]);
    exportCompleto(animali.data||[], sanitari.data||[], costi.data||[], lotti.data||[], suini.data||[], uscite.data||[], macchinari.data||[], costiGen.data||[]);
    setMenuAperto(false);
  };

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <img src="/logo192.png" alt="logo" style={{height:80,marginBottom:12}}/>
        <div style={{color:C.muted,marginTop:8}}>Caricamento...</div>
      </div>
    </div>
  );

  if (!sessione) return <Auth />;

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,minHeight:"100vh",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:C.primary,padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:200}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <img src="/logo192.png" alt="logo" style={{height:28,borderRadius:6}}/>
          <span style={{fontSize:15,fontWeight:700,color:"#FFF"}}>Allevamento</span>
        </div>
        <button onClick={()=>setMenuAperto(!menuAperto)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:10,padding:"6px 12px",color:"#FFF",fontSize:13,fontWeight:600,cursor:"pointer"}}>
          👤 {profilo?.nome || sessione.user.email.split('@')[0]}
          {profilo?.ruolo==="admin" && <span style={{background:"gold",color:C.primary,borderRadius:6,padding:"1px 6px",fontSize:10,fontWeight:800,marginLeft:6}}>ADMIN</span>}
        </button>
      </div>

      {menuAperto && (
        <div style={{position:"fixed",top:52,right:"calc(50% - 240px + 8px)",background:"#FFF",borderRadius:14,boxShadow:"0 8px 32px rgba(0,0,0,0.18)",border:`1px solid ${C.border}`,zIndex:300,minWidth:200,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,fontSize:13,color:C.muted}}>
            <div style={{fontWeight:700,color:C.primary}}>{profilo?.nome}</div>
            <div>{sessione.user.email}</div>
            <div style={{fontSize:11,marginTop:2}}>Ruolo: <b>{profilo?.ruolo}</b></div>
          </div>
          <button onClick={esportaTutto} style={{width:"100%",padding:"12px 16px",background:"none",border:"none",textAlign:"left",fontSize:14,cursor:"pointer",borderBottom:`1px solid ${C.border}`}}>
            📊 Esporta tutto in Excel
          </button>
          <button onClick={()=>{setTab("guida");setMenuAperto(false);}} style={{width:"100%",padding:"12px 16px",background:"none",border:"none",textAlign:"left",fontSize:14,cursor:"pointer",borderBottom:`1px solid ${C.border}`}}>
            📖 Guida per allevatori
          </button>
          <button onClick={logout} style={{width:"100%",padding:"12px 16px",background:"none",border:"none",textAlign:"left",fontSize:14,color:C.red,cursor:"pointer",fontWeight:600}}>
            🚪 Esci
          </button>
        </div>
      )}
      {menuAperto && <div onClick={()=>setMenuAperto(false)} style={{position:"fixed",inset:0,zIndex:250}}/>}

      <div style={{paddingBottom:70}}>
        {tab==="gestione"    && <AllevamentoApp    supabase={supabase}/>}
        {tab==="pedigree"    && <Pedigree          supabase={supabase}/>}
        {tab==="lotti"       && <LottiSuini        supabase={supabase}/>}
        {tab==="selezione"   && <SelezioneGenetica supabase={supabase}/>}
        {tab==="complessivi" && <CostiComplessivi  supabase={supabase}/>}
        {tab==="origine"     && <CostoOrigine      supabase={supabase}/>}
        {tab==="uscite"      && <RegistroUscite    supabase={supabase}/>}
        {tab==="generali"    && <CostiGenerali     supabase={supabase}/>}
        {tab==="uba"       && <UBAReport/>}
        {tab==="export"     && <ExportManager/>}
        {tab==="email"       && <Destinatari/>}
        {tab==="guida"       && <Guida/>}
      </div>

      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"#FFF",borderTop:`1.5px solid ${C.border}`,display:"flex",overflowX:"auto",padding:"6px 4px 8px",zIndex:100,boxShadow:"0 -4px 20px rgba(0,0,0,0.1)"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,background:"none",border:"none",cursor:"pointer",padding:"3px 8px",minWidth:46,flexShrink:0}}>
            <div style={{background:tab===t.id?C.primary+"18":"transparent",borderRadius:8,padding:"4px 5px"}}>
              <span style={{fontSize:15}}>{t.icon}</span>
            </div>
            <span style={{fontSize:9,fontWeight:tab===t.id?700:500,color:tab===t.id?C.primary:C.muted,whiteSpace:"nowrap"}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
