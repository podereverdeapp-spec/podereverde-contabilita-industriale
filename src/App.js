/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
// v105 — Vercel compila con CI=true, che trasforma gli avvisi ESLint in ERRORI
// e faceva fallire il deploy. Gli avvisi sono vecchi e innocui (variabili
// dichiarate e mai usate, dipendenze di useEffect volutamente omesse per non
// cambiare il comportamento). Qui vengono ZITTITI, non corretti: nessuna riga
// di logica e' stata toccata. Una pulizia vera si puo' fare con calma, un file
// alla volta, verificando ogni rimozione.
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import Auth from "./Auth";
import AllevamentoApp      from "./allevamento_app";
import Pedigree            from "./pedigree";
import LottiSuini          from "./lotti_suini";
import SelezioneGenetica   from "./selezione_genetica";
import CostiAllevamento    from "./costi_allevamento";
// import CostoOrigine     from "./costo_origine";       // v107 — tab Origine nascosta
import RegistroUscite      from "./registro_uscite";
import Modelli4            from "./modelli4";           // v121 — archivio modelli 4
// import CostiGenerali    from "./costi_generali";   // v104 — tab Struttura nascosta, vedi TABS
// import CostiComplessivi from "./costi_complessivi";  // v107 — tab Costi nascosta
import Coltivazione, { Gasolio } from "./coltivazione";
import Guida               from "./Guida";
import RazioniBovini       from "./razioni_bovini";     // v139 — calcolo razioni bovini, condiviso con la Contabilità Industriale
import ExportManager       from "./ExportManager";
import UBAReport            from "./UBAReport";
import Destinatari          from "./destinatari";
import SpesePagate          from "./spese_pagate";
import { AvvisoConsegne }  from "./consegne";           // v151 — pagina unica per il ruolo «consegne»
import { AvvisoModelli4 }  from "./modelli4_finestra";  // v151 — pagina unica per il ruolo «consegne»   // v148 — spese pagate (solo abilitati, tabella ci_spese_abilitati)
import { exportCompleto }  from "./exportExcel";
import { t, impostaLingua, linguaSalvata, SceltaLingua, Bandiera } from "./i18n";   // v119 — lingue
import "./App.css";

const C = { primary:"#5C3D1E", border:"#D4C4A8", muted:"#8B7355", bg:"#F5F0E8", red:"#C0392B" };

// v104 — versione visibile nel menu utente. Serve a capire in un secondo se il
// deploy Vercel e' arrivato davvero o se il browser sta servendo una copia
// vecchia dalla cache: basta aprire il menu e leggere il numero.
const VERSIONE = "v151";

const TABS = [
  { id:"gestione",    label:"Gestione",   icon:"🐄" },
  { id:"pedigree",    label:"Pedigree",   icon:"🧬" },
  { id:"lotti",       label:"Lotti",      icon:"🐷" },
  { id:"razioni",     label:"Razioni",    icon:"🥣" },   // v139 — calcolo razioni bovini
  { id:"coltivazione",label:"Coltivazione",icon:"🌾" },
  { id:"gasolio",     label:"Gasolio",    icon:"⛽" },   // v112 — registro rifornimenti
  { id:"selezione",   label:"Selezione",  icon:"🏆" },
  // v107 — tab "Costi" (costi_complessivi.jsx) e "Origine" (costo_origine.jsx)
  // tolte dalla barra su richiesta di Filippo. Moduli e dati NON toccati:
  // per rimetterle bastano queste due righe, i due import e le due righe di render.
  // { id:"complessivi", label:"Costi",      icon:"📊" },
  // { id:"origine",     label:"Origine",    icon:"🧾" },
  { id:"uscite",      label:"Uscite",     icon:"📤" },
  { id:"modelli4",    label:"Modelli 4",  icon:"📄" },   // v121 — documenti di accompagnamento
  // v104 — tab "Struttura" (macchinari e costi generali) tolta dalla barra su
  // richiesta di Filippo, per fare spazio a Coltivazione. Il modulo
  // costi_generali.jsx e i dati NON sono stati toccati: per rimetterla basta
  // riaggiungere questa riga, l'import e la riga di render piu' sotto.
  // { id:"generali",    label:"Struttura",  icon:"🏭" },
  { id:"uba",         label:"UBA",        icon:"🐾" },
  { id:"export",      label:"Esporta",    icon:"📥" },
  { id:"email",       label:"Email",      icon:"📮" },
  { id:"guida",       label:"Guida",      icon:"📖" },
];
// v148 — scheda «Spese» in basso: compare solo a chi è abilitato nel programma di contabilità
const TAB_SPESE = { id:"spese", label:"Spese", icon:"🧾" };

export default function App() {
  const [sessione,   setSessione]   = useState(null);
  const [profilo,    setProfilo]    = useState(null);
  // v151 — finché il profilo non è letto non si mostra niente: chi ha il ruolo «consegne» non deve vedere le altre pagine neanche per un attimo
  const [profiloPronto, setProfiloPronto] = useState(false);
  const [tab,        setTab]        = useState("gestione");
  const [menuAperto, setMenuAperto] = useState(false);
  // v144 — rinvio alla Guida da altre pagine: window.dispatchEvent(new CustomEvent("apri-guida",{detail:{sezione:"…"}}))
  const [guidaSezione, setGuidaSezione] = useState(null);
  useEffect(() => {
    const apri = (e) => { setGuidaSezione({ id: e.detail?.sezione || null, n: Date.now() }); setTab("guida"); };
    window.addEventListener("apri-guida", apri);
    return () => window.removeEventListener("apri-guida", apri);
  }, []);
  const [loading,    setLoading]    = useState(true);
  // v148 — abilitazione alle «Spese pagate» (riga propria in ci_spese_abilitati) e spese «Da chiarire»
  const [abilSpese,  setAbilSpese]  = useState(null);
  const [chiarire,   setChiarire]   = useState(0);
  const caricaSpese = async (userId) => {
    const { data } = await supabase.from('ci_spese_abilitati').select('*').eq('profilo_id', userId).maybeSingle();
    const ab = data && data.attivo ? data : null;
    setAbilSpese(ab);
    if (ab) {
      const { count } = await supabase.from('ci_spese').select('id', { count:'exact', head:true }).eq('salvata_da', userId).eq('stato', 'Da chiarire');
      setChiarire(count || 0);
    } else setChiarire(0);
  };
  // v119 — lingua: si carica il dizionario prima di mostrare qualsiasi testo
  const [lingua,     setLingua]     = useState(null);
  useEffect(() => { impostaLingua(linguaSalvata()).then(setLingua); }, []);
  const scegliLingua = async (l, salvaNelProfilo=true) => {
    const nuova = await impostaLingua(l);
    setLingua(nuova);
    if (salvaNelProfilo && sessione) await supabase.from('profili').update({ lingua: nuova }).eq('id', sessione.user.id);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessione(session);
      if (session) { caricaProfilo(session.user.id); caricaSpese(session.user.id); }
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessione(session);
      if (session) { caricaProfilo(session.user.id); caricaSpese(session.user.id); }
      else { setProfilo(null); setProfiloPronto(false); setAbilSpese(null); setChiarire(0); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const caricaProfilo = async (userId) => {
    const { data } = await supabase.from('profili').select('*').eq('id', userId).single();
    setProfilo(data);
    // v119 — se l'utente ha scelto una lingua nel profilo, vale quella
    if (data?.lingua) setLingua(await impostaLingua(data.lingua));
    setProfiloPronto(true);   // v151
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

  if (loading || !lingua) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <img src="/logo192.png" alt="logo" style={{height:80,marginBottom:12}}/>
        <div style={{color:C.muted,marginTop:8}}>{t("Caricamento...")}</div>
      </div>
    </div>
  );

  if (!sessione) return <Auth lingua={lingua} onLingua={l=>scegliLingua(l,false)}/>;

  // v151 — si aspetta il profilo prima di mostrare qualsiasi pagina
  if (!profiloPronto) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <img src="/logo192.png" alt="logo" style={{height:80,marginBottom:12}}/>
        <div style={{color:C.muted,marginTop:8}}>{t("Caricamento...")}</div>
      </div>
    </div>
  );
  // v151 — profilo non letto: non si apre niente (si riprova o si esce)
  if (!profilo) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,fontFamily:"'Segoe UI',system-ui,sans-serif",padding:16}}>
      <div style={{textAlign:"center",maxWidth:360}}>
        <div style={{color:C.red,fontWeight:700,marginBottom:12}}>{t("Il profilo utente non è stato letto. Riprovare.")}</div>
        <button onClick={()=>{ setProfiloPronto(false); caricaProfilo(sessione.user.id); }} style={{padding:"10px 16px",borderRadius:10,border:`1px solid ${C.border}`,background:"#FFF",fontSize:14,cursor:"pointer",marginRight:8}}>{t("Riprova")}</button>
        <button onClick={logout} style={{padding:"10px 16px",borderRadius:10,border:"none",background:C.red,color:"#FFF",fontSize:14,cursor:"pointer"}}>{t("Esci")}</button>
      </div>
    </div>
  );
  // v151 — ruolo «consegne» (ordine del Dott. Bizzarri 24/11/2026): una sola pagina con
  // animali da far uscire dai modelli 4 e capi macellati da completare (peso carcassa, cliente, partite).
  // Niente altre schede, niente esportazione, niente guida, niente spese.
  if (profilo.ruolo === "consegne") return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,minHeight:"100vh",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:C.primary,padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:200}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <img src="/logo192.png" alt="logo" style={{height:28,borderRadius:6}}/>
          <span style={{fontSize:15,fontWeight:700,color:"#FFF"}}>{t("Consegne")}</span>
        </div>
        <button onClick={()=>setMenuAperto(!menuAperto)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:10,padding:"6px 12px",color:"#FFF",fontSize:13,fontWeight:600,cursor:"pointer"}}>
          <span style={{display:"inline-flex",verticalAlign:"middle",marginRight:6}}><Bandiera id={lingua} h={12}/></span>
          👤 {profilo.nome || sessione.user.email.split('@')[0]}
        </button>
      </div>
      {menuAperto && (
        <div style={{position:"fixed",top:52,right:"calc(50% - 240px + 8px)",background:"#FFF",borderRadius:14,boxShadow:"0 8px 32px rgba(0,0,0,0.18)",border:`1px solid ${C.border}`,zIndex:300,minWidth:200,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,fontSize:13,color:C.muted}}>
            <div style={{fontWeight:700,color:C.primary}}>{profilo.nome}</div>
            <div>{sessione.user.email}</div>
            <div style={{fontSize:11,marginTop:2}}>{t("Ruolo")}: <b>{profilo.ruolo}</b></div>
            <div style={{fontSize:11,marginTop:2}}>{t("Versione")}: <b>{VERSIONE}</b></div>
          </div>
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6,textAlign:"center"}}>🌐 {t("Lingua")} · Language · ਭਾਸ਼ਾ</div>
            <SceltaLingua lingua={lingua} compatta onScegli={l=>{scegliLingua(l);setMenuAperto(false);}}/>
          </div>
          <button onClick={logout} style={{width:"100%",padding:"12px 16px",background:"none",border:"none",textAlign:"left",fontSize:14,color:C.red,cursor:"pointer",fontWeight:600}}>
            🚪 {t("Esci")}
          </button>
        </div>
      )}
      {menuAperto && <div onClick={()=>setMenuAperto(false)} style={{position:"fixed",inset:0,zIndex:250}}/>}
      <div key={lingua} style={{padding:"16px 16px 40px"}}>
        <div style={{fontSize:13,color:C.muted,marginBottom:14}}>{t("Qui si registrano gli animali usciti con i modelli 4 e, per i capi macellati, peso della carcassa, cliente e partite. Se qui sotto non compare niente, non ci sono capi da completare.")}</div>
        <AvvisoModelli4/>
        <AvvisoConsegne/>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,minHeight:"100vh",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:C.primary,padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:200}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <img src="/logo192.png" alt="logo" style={{height:28,borderRadius:6}}/>
          <span style={{fontSize:15,fontWeight:700,color:"#FFF"}}>{t("Allevamento")}</span>
        </div>
        <button onClick={()=>setMenuAperto(!menuAperto)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:10,padding:"6px 12px",color:"#FFF",fontSize:13,fontWeight:600,cursor:"pointer"}}>
          <span style={{display:"inline-flex",verticalAlign:"middle",marginRight:6}}><Bandiera id={lingua} h={12}/></span>
          👤 {profilo?.nome || sessione.user.email.split('@')[0]}
          {profilo?.ruolo==="admin" && <span style={{background:"gold",color:C.primary,borderRadius:6,padding:"1px 6px",fontSize:10,fontWeight:800,marginLeft:6}}>ADMIN</span>}
        </button>
      </div>

      {menuAperto && (
        <div style={{position:"fixed",top:52,right:"calc(50% - 240px + 8px)",background:"#FFF",borderRadius:14,boxShadow:"0 8px 32px rgba(0,0,0,0.18)",border:`1px solid ${C.border}`,zIndex:300,minWidth:200,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,fontSize:13,color:C.muted}}>
            <div style={{fontWeight:700,color:C.primary}}>{profilo?.nome}</div>
            <div>{sessione.user.email}</div>
            <div style={{fontSize:11,marginTop:2}}>{t("Ruolo")}: <b>{profilo?.ruolo}</b></div>
            <div style={{fontSize:11,marginTop:2}}>{t("Versione")}: <b>{VERSIONE}</b></div>
          </div>
          {/* v119 — scelta della lingua, salvata nel profilo dell'utente */}
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6,textAlign:"center"}}>🌐 {t("Lingua")} · Language · ਭਾਸ਼ਾ</div>
            <SceltaLingua lingua={lingua} compatta onScegli={l=>{scegliLingua(l);setMenuAperto(false);}}/>
          </div>
          <button onClick={esportaTutto} style={{width:"100%",padding:"12px 16px",background:"none",border:"none",textAlign:"left",fontSize:14,cursor:"pointer",borderBottom:`1px solid ${C.border}`}}>
            📊 {t("Esporta tutto in Excel")}
          </button>
          <button onClick={()=>{setGuidaSezione(null);setTab("guida");setMenuAperto(false);}} style={{width:"100%",padding:"12px 16px",background:"none",border:"none",textAlign:"left",fontSize:14,cursor:"pointer",borderBottom:`1px solid ${C.border}`}}>
            📖 {t("Guida per allevatori")}
          </button>
          {/* v146 — pagina di prova «scanner scontrini» (solo amministratore, 11/11/2026) */}
          {profilo?.ruolo==="admin" && (
            <a href="/prova-scanner.html" target="_blank" rel="noopener noreferrer" onClick={()=>setMenuAperto(false)} style={{display:"block",padding:"12px 16px",textAlign:"left",fontSize:14,color:"inherit",textDecoration:"none",borderBottom:`1px solid ${C.border}`}}>
              🧾 Prova scanner scontrini
            </a>
          )}
          <button onClick={logout} style={{width:"100%",padding:"12px 16px",background:"none",border:"none",textAlign:"left",fontSize:14,color:C.red,cursor:"pointer",fontWeight:600}}>
            🚪 {t("Esci")}
          </button>
        </div>
      )}
      {menuAperto && <div onClick={()=>setMenuAperto(false)} style={{position:"fixed",inset:0,zIndex:250}}/>}

      <div key={lingua} style={{paddingBottom:70}}>
        {tab==="gestione"    && <AllevamentoApp    supabase={supabase}/>}
        {tab==="pedigree"    && <Pedigree          supabase={supabase}/>}
        {tab==="lotti"       && <LottiSuini        supabase={supabase}/>}
        {tab==="razioni"     && <RazioniBovini/>}
        {tab==="coltivazione"&& <Coltivazione/>}
        {tab==="gasolio"     && <Gasolio/>}
        {tab==="selezione"   && <SelezioneGenetica supabase={supabase}/>}
        {/* v107 — {tab==="complessivi" && <CostiComplessivi supabase={supabase}/>} */}
        {/* v107 — {tab==="origine" && <CostoOrigine supabase={supabase}/>} */}
        {tab==="uscite"      && <RegistroUscite    supabase={supabase}/>}
        {tab==="modelli4"    && <Modelli4/>}
        {/* v104 — {tab==="generali" && <CostiGenerali supabase={supabase}/>} */}
        {tab==="uba"       && <UBAReport/>}
        {tab==="export"     && <ExportManager/>}
        {tab==="email"       && <Destinatari/>}
        {tab==="spese" && abilSpese && <SpesePagate abilitazione={abilSpese} utente={sessione.user.id} onCambio={()=>caricaSpese(sessione.user.id)}/>}
        {tab==="guida"       && <Guida key={guidaSezione?.n || 0} ruolo={profilo?.ruolo} sezioneIniziale={guidaSezione?.id}/>}
      </div>

      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"#FFF",borderTop:`1.5px solid ${C.border}`,display:"flex",overflowX:"auto",padding:"6px 4px 8px",zIndex:100,boxShadow:"0 -4px 20px rgba(0,0,0,0.1)"}}>
        {(abilSpese ? [...TABS.slice(0,-1), TAB_SPESE, TABS[TABS.length-1]] : TABS).map(tb=>(
          <button key={tb.id} onClick={()=>{ setGuidaSezione(null); setTab(tb.id); }} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,background:"none",border:"none",cursor:"pointer",padding:"3px 8px",minWidth:46,flexShrink:0}}>
            <div style={{position:"relative",background:tab===tb.id?C.primary+"18":"transparent",borderRadius:8,padding:"4px 5px"}}>
              <span style={{fontSize:15}}>{tb.icon}</span>
              {tb.id==="spese" && chiarire>0 && <span style={{position:"absolute",top:-4,right:-6,background:C.red,color:"#FFF",borderRadius:9,padding:"0 5px",fontSize:10,fontWeight:800}}>{chiarire}</span>}
            </div>
            <span style={{fontSize:9,fontWeight:tab===tb.id?700:500,color:tab===tb.id?C.primary:C.muted,whiteSpace:"nowrap"}}>{t(tb.label)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
