import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const C = {
  bg:"#F5F0E8", card:"#FFFFFF", primary:"#5C3D1E", accent:"#A0522D",
  green:"#4A7C59", red:"#C0392B", yellow:"#D4A017", blue:"#2C6E9B",
  text:"#2D1B0E", muted:"#8B7355", border:"#D4C4A8",
  bovini:"#8B6914", suini:"#B5547A", ovini:"#4A7C59",
};
const specieColor = s=>({bovino:C.bovini,suino:C.suini,ovino:C.ovini}[s]||C.muted);
const specieLabel = s=>({bovino:"Bovino",suino:"Suino",ovino:"Ovino"}[s]||s);
const specieIcon  = s=>({bovino:"🐄",suino:"🐷",ovino:"🐑"}[s]||"🐾");
const today = ()=>new Date().toISOString().split("T")[0];

// ─── DATI PER SPECIE ──────────────────────────────────────────────────────────
const RAZZE = {
  bovino:["Chianina","Marchigiana","Maremmana","Limousine","Charolais","Frisona","Pezzata Rossa","Meticcia","Altra"],
  suino: ["Large White","Landrace","Duroc","Cinta Senese","Mora Romagnola","Nero Casertano","Nero Apucalabro","Meticcia","Altra"],
  ovino: ["Sarda","Comisana","Massese","Appenninica","Merinizzata italiana","Sopravvissana","Suffolk","Meticcia","Altra"],
};
const CATEGORIE = {
  bovino:["Vitello","Vitellone","Vacca","Toro","Manza","Manzo","Scottona"],
  suino: ["Lattonzolo","Magroncino","Magroncello","Scrofa","Verro","Castrato","Suino pesante"],
  ovino: ["Agnello","Agnellone","Pecora","Ariete","Castrato"],
};
const SESSO_OPT = s => s==="suino"
  ? [{value:"M",label:"♂ Maschio intero"},{value:"F",label:"♀ Femmina"},{value:"C",label:"✂ Castrato"}]
  : [{value:"M",label:"♂ Maschio"},{value:"F",label:"♀ Femmina"}];
const STATI = ["attivo","venduto","macellato","deceduto","trasferito"];

// Calcolo razza figlio
// Mappa razza suino → lettera codice lotto
const RAZZA_LETTERA = {
  "Nero Apucalabro":"A","Cinta Senese":"C","Duroc":"D",
  "Mora Romagnola":"G","Large White":"L","Meticcia":"M","Meticcio":"M",
  "Nero Casertano":"N","Landrace":"R","Altra":"0",
};
function getRazzaLettera(razza) {
  if(!razza) return "0";
  // cerca corrispondenza case-insensitive
  const r=razza.trim();
  const match=Object.keys(RAZZA_LETTERA).find(k=>k.toLowerCase()===r.toLowerCase());
  return match?RAZZA_LETTERA[match]:"0";
}
function generaCodLotto(dataParto, razzaMadre, razzaPadre, bdnMadre) {
  if(!dataParto) return "";
  const d=new Date(dataParto);
  const aa=String(d.getFullYear()).slice(-2);
  const mm=String(d.getMonth()+1).padStart(2,"0");
  const lM=getRazzaLettera(razzaMadre);
  const lP=getRazzaLettera(razzaPadre);
  const ultime2=bdnMadre?String(bdnMadre).replace(/\D/g,"").slice(-2):"00";
  return `${aa}${mm}${lM}${lP}${ultime2}`;
}

const calcolaRazza = (padre_id, madre_id, animali) => {
  if (!padre_id || !madre_id) return null;
  const p = animali.find(a=>a.id===parseInt(padre_id));
  const m = animali.find(a=>a.id===parseInt(madre_id));
  if (!p||!m) return null;
  const rp = p.razza_calcolata||p.razza;
  const rm = m.razza_calcolata||m.razza;
  if (!rp||!rm) return null;
  return rp.toUpperCase()===rm.toUpperCase() ? rp : "METICCIA";
};

// ─── UI BASE ──────────────────────────────────────────────────────────────────
const Card=({children,style={}})=>(
  <div style={{background:C.card,borderRadius:16,padding:16,marginBottom:12,
    boxShadow:"0 2px 8px rgba(0,0,0,0.08)",border:`1px solid ${C.border}`,...style}}>
    {children}
  </div>
);
const Badge=({label,color})=>(
  <span style={{background:color+"22",color,border:`1px solid ${color}44`,
    borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>{label}</span>
);
const RigaCosto=({label,valore})=>(
  <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0"}}>
    <span style={{color:C.muted}}>{label}</span>
    <span style={{fontWeight:700}}>{(valore||0).toFixed(2)}€</span>
  </div>
);
const Btn=({label,icon,onClick,variant="primary",small=false,disabled=false})=>{
  const bg={primary:C.primary,danger:C.red,success:C.green,ghost:"transparent",outline:"transparent"}[variant]||C.primary;
  const fg=variant==="ghost"||variant==="outline"?C.text:"#FFF";
  const border=variant==="outline"?`1.5px solid ${C.primary}`:"none";
  return(
    <button onClick={onClick} disabled={disabled}
      style={{display:"flex",alignItems:"center",gap:6,background:bg,color:fg,
        border,borderRadius:10,padding:small?"6px 12px":"10px 18px",
        fontSize:small?13:15,fontWeight:600,cursor:disabled?"default":"pointer",
        boxShadow:["primary","success","danger"].includes(variant)?"0 2px 6px rgba(0,0,0,0.15)":"none",
        opacity:disabled?0.5:1}}>
      {icon&&<span>{icon}</span>}{label}
    </button>
  );
};
const inputStyle={width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,
  borderRadius:10,padding:"10px 12px",fontSize:15,background:"#FAFAF8",color:C.text,outline:"none"};
const Field=({label,value,onChange,type="text",options,required,placeholder})=>(
  <div style={{marginBottom:12}}>
    <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:4}}>
      {label}{required&&<span style={{color:C.red}}> *</span>}
    </div>
    {options
      ?<select value={value??""} onChange={e=>onChange(e.target.value)} style={inputStyle}>
          <option value="">— seleziona —</option>
          {options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
        </select>
      :<input type={type} value={value??""} placeholder={placeholder||""}
          onChange={e=>onChange(e.target.value)} style={inputStyle}/>
    }
  </div>
);
const Sezione=({label})=>(
  <div style={{fontSize:11,fontWeight:800,color:C.primary,letterSpacing:1.2,
    textTransform:"uppercase",padding:"10px 0 6px",borderBottom:`1.5px solid ${C.border}`,
    marginBottom:12,marginTop:8}}>{label}</div>
);
const Spinner=()=>(
  <div style={{textAlign:"center",padding:40,color:C.muted}}>
    <div style={{fontSize:32,marginBottom:8}}>⏳</div>
    <div>Caricamento...</div>
  </div>
);

// ─── HOOKS SUPABASE ───────────────────────────────────────────────────────────
function useAnimali() {
  const [animali,setAnimali]=useState([]);
  const [loading,setLoading]=useState(true);
  const carica=async()=>{
    setLoading(true);
    const{data,error}=await supabase.from("animali").select("*").order("created_at",{ascending:false});
    if(!error)setAnimali(data||[]);
    setLoading(false);
  };
  useEffect(()=>{carica();},[]);
  const aggiungi=async(a)=>{
    const{data,error}=await supabase.from("animali").insert([a]).select().single();
    if(!error&&data)setAnimali(prev=>[data,...prev]);
    return{data,error};
  };
  const aggiorna=async(id,m)=>{
    const{data,error}=await supabase.from("animali").update(m).eq("id",id).select().single();
    if(!error&&data)setAnimali(prev=>prev.map(a=>a.id===id?data:a));
    return{data,error};
  };
  const elimina=async(id)=>{
    const{error}=await supabase.from("animali").delete().eq("id",id);
    if(!error)setAnimali(prev=>prev.filter(a=>a.id!==id));
    return{error};
  };
  return{animali,loading,carica,aggiungi,aggiorna,elimina};
}

function useEventiSanitari() {
  const [eventi,setEventi]=useState([]);
  const [loading,setLoading]=useState(true);
  const carica=async()=>{
    setLoading(true);
    const{data,error}=await supabase.from("eventi_sanitari").select("*").order("data",{ascending:false});
    if(!error)setEventi(data||[]);
    setLoading(false);
  };
  useEffect(()=>{carica();},[]);
  const aggiungi=async(e)=>{
    const{data,error}=await supabase.from("eventi_sanitari").insert([e]).select().single();
    if(!error&&data)setEventi(prev=>[data,...prev]);
    return{data,error};
  };
  const elimina=async(id)=>{
    const{error}=await supabase.from("eventi_sanitari").delete().eq("id",id);
    if(!error)setEventi(prev=>prev.filter(e=>e.id!==id));
    return{error};
  };
  return{eventi,loading,aggiungi,elimina};
}

function useAlimentazione() {
  const [voci,setVoci]=useState([]);
  const [loading,setLoading]=useState(true);
  const carica=async()=>{
    setLoading(true);
    const{data,error}=await supabase.from("alimentazione").select("*").order("data",{ascending:false});
    if(!error)setVoci(data||[]);
    setLoading(false);
  };
  useEffect(()=>{carica();},[]);
  const aggiungi=async(v)=>{
    const{data,error}=await supabase.from("alimentazione").insert([v]).select().single();
    if(!error&&data)setVoci(prev=>[data,...prev]);
    return{data,error};
  };
  return{voci,loading,aggiungi};
}

function useEventiRiproduttivi() {
  const [eventi,setEventi]=useState([]);
  const [loading,setLoading]=useState(true);
  const carica=async()=>{
    setLoading(true);
    const{data,error}=await supabase.from("eventi_riproduttivi").select("*").order("data_evento",{ascending:false});
    if(!error)setEventi(data||[]);
    setLoading(false);
  };
  useEffect(()=>{carica();},[]);
  const aggiungi=async(e)=>{
    const{data,error}=await supabase.from("eventi_riproduttivi").insert([e]).select().single();
    if(!error&&data)setEventi(prev=>[data,...prev]);
    return{data,error};
  };
  const aggiorna=async(id,m)=>{
    const{data,error}=await supabase.from("eventi_riproduttivi").update(m).eq("id",id).select().single();
    if(!error&&data)setEventi(prev=>prev.map(e=>e.id===id?data:e));
    return{data,error};
  };
  const elimina=async(id)=>{
    const{error}=await supabase.from("eventi_riproduttivi").delete().eq("id",id);
    if(!error)setEventi(prev=>prev.filter(e=>e.id!==id));
    return{error};
  };
  return{eventi,loading,carica,aggiungi,aggiorna,elimina};
}

function useCostiAnimale() {
  const [costi,setCosti]=useState([]);
  const carica=async()=>{
    const{data}=await supabase.from("costi_animale").select("animale_id,voce,importo");
    setCosti(data||[]);
  };
  useEffect(()=>{carica();},[]);
  const totalePerAnimale=(id)=>costi.filter(c=>c.animale_id===id).reduce((s,c)=>s+(c.importo||0),0);
  return{totalePerAnimale};
}

function useMagazzino() {
  const [scorte,setScorte]=useState([]);
  const [loading,setLoading]=useState(true);
  const carica=async()=>{
    setLoading(true);
    const{data,error}=await supabase.from("magazzino").select("*").order("nome");
    if(!error)setScorte(data||[]);
    setLoading(false);
  };
  useEffect(()=>{carica();},[]);
  const aggiungi=async(s)=>{
    const{data,error}=await supabase.from("magazzino").insert([s]).select().single();
    if(!error&&data)setScorte(prev=>[...prev,data]);
    return{data,error};
  };
  const aggiorna=async(id,m)=>{
    const{data,error}=await supabase.from("magazzino").update(m).eq("id",id).select().single();
    if(!error&&data)setScorte(prev=>prev.map(s=>s.id===id?data:s));
    return{data,error};
  };
  return{scorte,loading,aggiungi,aggiorna};
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({animali,eventi_sanitari,magazzino,onNav,suiniLotto}){
  const [configDrive,setConfigDrive]=useState(null);
  useEffect(()=>{
    supabase.from("configurazione").select("chiave,valore")
      .in("chiave",["ultimo_upload_manuale_mese"])
      .then(({data})=>{
        const v = data?.find(c=>c.chiave==="ultimo_upload_manuale_mese")?.valore || "";
        setConfigDrive(v);
      });
  },[]);
  const attivi=animali.filter(a=>a.stato==="attivo");
  const bovini=attivi.filter(a=>a.specie==="bovino").length;
  const suini =attivi.filter(a=>a.specie==="suino").length;
  const ovini =attivi.filter(a=>a.specie==="ovino").length;
  const suiniLottoAttivi=(suiniLotto||[]).filter(u=>u.vivo!==false&&u.stato==="attivo").length;
  const allerte=magazzino.filter(m=>m.quantita<=m.minimo);
  const ultimiSan=eventi_sanitari.slice(0,3);
  // Scadenze richiami
  const oggi=new Date(today());
  const in30gg=new Date(oggi); in30gg.setDate(oggi.getDate()+30);
  const richiamiScaduti=eventi_sanitari.filter(e=>e.scadenza&&new Date(e.scadenza)<oggi);
  const richiamiImminenti=eventi_sanitari.filter(e=>e.scadenza&&new Date(e.scadenza)>=oggi&&new Date(e.scadenza)<=in30gg);
  return(
    <div style={{padding:"16px 16px 80px"}}>
      <div style={{fontSize:22,fontWeight:800,marginBottom:4}}>Buongiorno 👋</div>
      <div style={{fontSize:14,color:C.muted,marginBottom:20}}>{new Date().toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"})}</div>
      {/* Alert scadenze richiami */}
      {(richiamiScaduti.length>0||richiamiImminenti.length>0)&&(
        <Card style={{background:richiamiScaduti.length>0?C.red+"12":C.yellow+"14",
          border:`1.5px solid ${richiamiScaduti.length>0?C.red+"44":C.yellow+"55"}`,
          cursor:"pointer"}} onClick={()=>onNav&&onNav("sanitario")}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:richiamiScaduti.length>0?C.red:C.yellow,marginBottom:4}}>
                {richiamiScaduti.length>0?"⚠️ Richiami sanitari SCADUTI":"⏰ Richiami sanitari in scadenza"}
              </div>
              <div style={{fontSize:12,color:C.text}}>
                {richiamiScaduti.length>0&&<><b>{richiamiScaduti.length}</b> scaduti · </>}
                <b>{richiamiImminenti.length}</b> in scadenza (30 gg)
              </div>
            </div>
            <div style={{fontSize:18,color:C.muted}}>›</div>
          </div>
        </Card>
      )}
      {/* Alert promemoria upload Drive mensile */}
      {(()=>{
        if (configDrive===null) return null; // ancora in caricamento
        const oggiD = new Date();
        const meseCorrente = `${oggiD.getFullYear()}-${String(oggiD.getMonth()+1).padStart(2,"0")}`;
        const giornoDelMese = oggiD.getDate();
        const daConfermare = configDrive !== meseCorrente;
        const inFinestra = giornoDelMese <= 10;
        if (!daConfermare || !inFinestra) return null;
        return (
          <Card style={{background:C.yellow+"14",border:`1.5px solid ${C.yellow}55`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:C.yellow,marginBottom:4}}>
                  📁 Promemoria: carica i report su Drive
                </div>
                <div style={{fontSize:12,color:C.text}}>
                  Report di {meseCorrente} ancora da caricare · vai al tab 📮 Email (menu in alto)
                </div>
              </div>
            </div>
          </Card>
        );
      })()}
      <Card style={{background:`linear-gradient(135deg,${C.primary},${C.accent})`}}>
        <div style={{color:"rgba(255,255,255,0.8)",fontSize:13,marginBottom:8}}>CAPI ATTIVI</div>
        <div style={{fontSize:36,fontWeight:800,color:"#FFF",marginBottom:12}}>{attivi.length}</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {[[bovini,"🐄",C.bovini,"Bovini"],[suini,"🐷",C.suini,"Suini"],[ovini,"🐑",C.ovini,"Ovini"]].map(([n,ic,col,lbl],i)=>(
            <div key={i} style={{background:"rgba(255,255,255,0.15)",borderRadius:12,padding:"8px 14px",textAlign:"center"}}>
              <div style={{fontSize:18}}>{ic}</div>
              <div style={{fontSize:18,fontWeight:800,color:"#FFF"}}>{n}</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.7)",fontWeight:600}}>{lbl}</div>
            </div>
          ))}
          {suiniLottoAttivi>0&&(
            <div onClick={()=>onNav("lotti")}
              style={{background:"rgba(255,255,255,0.25)",borderRadius:12,padding:"8px 14px",
                textAlign:"center",cursor:"pointer",border:"1.5px solid rgba(255,255,255,0.4)"}}>
              <div style={{fontSize:18}}>🏷️</div>
              <div style={{fontSize:18,fontWeight:800,color:"#FFF"}}>{suiniLottoAttivi}</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.9)",fontWeight:700}}>LOTTI</div>
            </div>
          )}
        </div>
      </Card>
      {allerte.length>0&&(
        <Card style={{borderLeft:`4px solid ${C.red}`}}>
          <div style={{fontSize:13,fontWeight:700,color:C.red,marginBottom:8}}>⚠️ Scorte in esaurimento</div>
          {allerte.map(m=>(
            <div key={m.id} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0"}}>
              <span>{m.nome}</span><span style={{color:C.red,fontWeight:700}}>{m.quantita} {m.unita}</span>
            </div>
          ))}
        </Card>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        {[
          {id:"anagrafica",icon:"🏷️",label:"Animali",sub:`${attivi.length} attivi`,col:C.primary},
          {id:"sanitario",icon:"💉",label:"Sanitario",sub:`${eventi_sanitari.length} eventi`,col:C.blue},
          {id:"alimentazione",icon:"🌾",label:"Dieta",sub:"Mangimi",col:C.bovini},
          {id:"magazzino",icon:"📦",label:"Magazzino",sub:`${allerte.length} allerte`,col:allerte.length?C.red:C.green},
        ].map(t=>(
          <button key={t.id} onClick={()=>onNav(t.id)}
            style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:14,
              textAlign:"left",cursor:"pointer",boxShadow:"0 2px 6px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:24,marginBottom:6}}>{t.icon}</div>
            <div style={{fontWeight:700,fontSize:15,color:C.text}}>{t.label}</div>
            <div style={{fontSize:12,color:t.col,fontWeight:600}}>{t.sub}</div>
          </button>
        ))}
      </div>
      {ultimiSan.length>0&&(
        <Card>
          <div style={{fontSize:13,fontWeight:700,color:C.muted,marginBottom:8}}>ULTIMI EVENTI SANITARI</div>
          {ultimiSan.map(e=>{
            const a=animali.find(x=>x.id===e.animale_id);
            return(
              <div key={e.id} style={{display:"flex",justifyContent:"space-between",
                padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                <div>
                  <span style={{fontSize:13,fontWeight:600}}>{e.tipo}</span>
                  {a&&<span style={{fontSize:12,color:C.muted}}> · {a.nome||a.bdn}</span>}
                </div>
                <span style={{fontSize:12,color:C.muted}}>{e.data}</span>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

// ─── ANAGRAFICA ───────────────────────────────────────────────────────────────
function Anagrafica({animali,loading,aggiungi,aggiorna,elimina,ricaricaAnimali,eventiRiproduttivi,aggiungiEvento,aggiornaEvento,eliminaEvento,ricaricaEventi,sanitari,totalePerAnimale}){
  const [filtro,setFiltro]=useState("tutti");
  const [filtroStato,setFiltroStato]=useState("attivi"); // attivi | usciti | tutti
  const [cerca,setCerca]=useState("");
  const [vistaRiproduttori,setVistaRiproduttori]=useState(false);
  const [form,setForm]=useState(null);         // null=lista, obj=form edit/new
  const [dettaglio,setDettaglio]=useState(null); // mostra scheda completa
  const [saving,setSaving]=useState(false);
  const [errore,setErrore]=useState("");
  const [tabDettaglio,setTabDettaglio]=useState("info");
  const [costiAnimale,setCostiAnimale]=useState(null); // storico costo da Contabilità Industriale
  const [caricandoCosti,setCaricandoCosti]=useState(false);
  const [residuoRiproduttore,setResiduoRiproduttore]=useState(null); // ci_residuo_riproduttore, se è (stato) un riproduttore
  const [scarichiRiproduttore,setScarichiRiproduttore]=useState(null); // ci_scarico_riproduttore_annuale — per figli avuti e totale scaricato
  const [residuiTuttiRiproduttori,setResiduiTuttiRiproduttori]=useState(new Map()); // animale_id -> residuo_rimanente, per la lista

  // Caricato una volta sola (non per-animale): serve per mostrare il costo NETTO nella
  // lista senza dover fare una query per ogni riga — sola lettura, stessa tabella condivisa
  // con la Contabilità Industriale.
  useEffect(()=>{
    supabase.from("ci_residuo_riproduttore").select("animale_id,residuo_rimanente")
      .then(({data,error})=>{
        if(error){ console.error("Errore caricamento residui riproduttori:",error.message); return; }
        setResiduiTuttiRiproduttori(new Map((data||[]).map(r=>[r.animale_id,r.residuo_rimanente])));
      });
  },[]);
  const [pesateAnimale,setPesateAnimale]=useState(null);
  const [caricandoPesate,setCaricandoPesate]=useState(false);
  const [nuovaPesata,setNuovaPesata]=useState({data:today(),peso:"",tipo:"vita",note:""});
  const [salvandoPesata,setSalvandoPesata]=useState(false);
  const [formParto,setFormParto]=useState(null);
  const [savingParto,setSavingParto]=useState(false);

  // Carica lo storico costo (calcolato dalla Contabilità Industriale, tabella condivisa
  // sullo stesso Supabase) quando si apre la scheda di un animale — sola lettura, questa
  // app non scrive mai in ci_costo_animale_annuale, solo la Contabilità Industriale lo fa.
  useEffect(()=>{
    if(!dettaglio){ setCostiAnimale(null); return; }
    setCaricandoCosti(true);
    supabase.from("ci_costo_animale_annuale").select("*").eq("animale_id",dettaglio.id).order("anno")
      .then(({data,error})=>{
        if(error){ console.error("Errore caricamento costi:",error.message); setCostiAnimale([]); }
        else setCostiAnimale(data||[]);
        setCaricandoCosti(false);
      });
  },[dettaglio?.id]);

  // Residuo riproduttore + scarichi annuali (stessa tabella condivisa, sola lettura qui) —
  // solo se l'animale è marcato riproduttore, per mostrare il costo NETTO (dopo lo scarico
  // sui figli), il totale scaricato, e il numero di figli avuti.
  useEffect(()=>{
    if(!dettaglio||!dettaglio.riproduttore){ setResiduoRiproduttore(null); setScarichiRiproduttore(null); return; }
    supabase.from("ci_residuo_riproduttore").select("*").eq("animale_id",dettaglio.id).maybeSingle()
      .then(({data,error})=>{
        if(error){ console.error("Errore caricamento residuo riproduttore:",error.message); setResiduoRiproduttore(null); return; }
        setResiduoRiproduttore(data||null);
        if(data){
          supabase.from("ci_scarico_riproduttore_annuale").select("*").eq("residuo_riproduttore_id",data.id).order("anno")
            .then(({data:sc,error:e2})=>{
              if(e2){ console.error("Errore caricamento scarichi:",e2.message); setScarichiRiproduttore([]); }
              else setScarichiRiproduttore(sc||[]);
            });
        } else setScarichiRiproduttore([]);
      });
  },[dettaglio?.id,dettaglio?.riproduttore]);

  // Storico pesate — QUESTA tabella la scrive anche podereverdeapp.it (a differenza dei
  // costi): ogni volta che si pesa un animale, si aggiunge una riga invece di sovrascrivere
  // un unico valore. Letta anche dalla Contabilità Industriale per le analisi di crescita.
  useEffect(()=>{
    if(!dettaglio){ setPesateAnimale(null); return; }
    setCaricandoPesate(true);
    supabase.from("pesate_storico").select("*").eq("animale_id",dettaglio.id).order("data_rilevazione")
      .then(({data,error})=>{
        if(error){ console.error("Errore caricamento pesate:",error.message); setPesateAnimale([]); }
        else setPesateAnimale(data||[]);
        setCaricandoPesate(false);
      });
  },[dettaglio?.id]);

  async function salvaPesata(){
    if(!nuovaPesata.peso||!nuovaPesata.data){ alert("Inserisci almeno data e peso."); return; }
    setSalvandoPesata(true);
    const {error}=await supabase.from("pesate_storico").insert([{
      animale_id:dettaglio.id, data_rilevazione:nuovaPesata.data,
      peso_kg:parseFloat(nuovaPesata.peso), tipo_rilevazione:nuovaPesata.tipo,
      stimato:false, note:nuovaPesata.note||null,
    }]);
    setSalvandoPesata(false);
    if(error){ alert(`⚠️ Errore nel salvataggio della pesata:\n\n${error.message}`); return; }
    setNuovaPesata({data:today(),peso:"",tipo:"vita",note:""});
    const {data}=await supabase.from("pesate_storico").select("*").eq("animale_id",dettaglio.id).order("data_rilevazione");
    setPesateAnimale(data||[]);
  }

  async function eliminaPesata(id){
    if(!window.confirm("Eliminare questa pesata? Non si può annullare.")) return;
    const {error}=await supabase.from("pesate_storico").delete().eq("id",id);
    if(error){ alert(`⚠️ Errore nell'eliminazione:\n\n${error.message}`); return; }
    setPesateAnimale(prev=>prev.filter(p=>p.id!==id));
  }

  const empty={
    bdn:"",nome:"",specie:"bovino",razza:"",categoria:"",sesso:"F",
    nascita:"",peso_nascita:"",peso_attuale:"",peso_ingresso:"",
    provenienza:"Nato in azienda",data_ingresso:today(),
    prezzo_acquisto:"",origine:"",padre_id:"",madre_id:"",
    padre_ext:"",madre_ext:"",data_registrazione_bdn:"",
    transponder:"",passaporto:"",codice_asl:"",
    lotto_box:"",destinazione:"",
    stato:"attivo",data_uscita:"",
    motivo_uscita:"",peso_vivo_uscita:"",peso_carcassa:"",
    note_sanitarie:"",note:"",vivo:true,riproduttore:false,
  };

  const lista=animali.filter(a=>{
    // Filtro specie
    if(filtro!=="tutti"&&a.specie!==filtro) return false;
    // Filtro stato
    if(filtroStato==="attivi"&&a.stato!=="attivo") return false;
    if(filtroStato==="usciti"&&a.stato==="attivo") return false;
    // Ricerca testo: BDN completo, ultime 4 cifre, nome
    if(cerca.trim()){
      const q=cerca.trim().toLowerCase();
      const bdn=(a.bdn||"").toLowerCase();
      const nome=(a.nome||"").toLowerCase();
      if(!bdn.includes(q)&&!nome.includes(q)&&!bdn.endsWith(q)) return false;
    }
    return true;
  });

  // Calcolo razza automatico quando cambiano padre/madre
  const f=form||{};
  const razzaCalcolata=calcolaRazza(f.padre_id,f.madre_id,animali);

  // Crea o trova animale esterno per genealogia
  const risolviGenitoreEsterno=async(bdn_ext,sesso_ger,specie)=>{
    if(!bdn_ext||!bdn_ext.trim()) return null;
    const bdn=bdn_ext.trim();
    // Cerca se esiste già (compatibile con tutte le versioni Supabase)
    const{data:lista}=await supabase.from("animali").select("id").eq("bdn",bdn).limit(1);
    if(lista&&lista.length>0) return lista[0].id;
    // Crea scheda minima
    const{data:nuovi}=await supabase.from("animali").insert([{
      bdn, specie, sesso:sesso_ger,
      provenienza:"Esterno", stato:"storico", vivo:false,
      note:"Genitore esterno — scheda creata automaticamente",
    }]).select("id");
    return nuovi&&nuovi.length>0?nuovi[0].id:null;
  };

  const salva=async()=>{
    if(!form.bdn&&!form.nome){setErrore("Inserisci almeno BDN o nome");return;}
    setSaving(true);setErrore("");
    // Risolvi genitori esterni
    let padre_id=form.padre_id?parseInt(form.padre_id):null;
    let madre_id=form.madre_id?parseInt(form.madre_id):null;
    if(!padre_id&&form.padre_ext)
      padre_id=await risolviGenitoreEsterno(form.padre_ext,"M",form.specie);
    if(!madre_id&&form.madre_ext)
      madre_id=await risolviGenitoreEsterno(form.madre_ext,"F",form.specie);
    const rc=calcolaRazza(padre_id,madre_id,animali);
    const payload={
      bdn:form.bdn||null, nome:form.nome||null,
      specie:form.specie, razza:form.razza||null,
      razza_calcolata:rc||null,
      categoria:form.categoria||null,
      sesso:form.sesso,
      nascita:form.nascita||null,
      data_registrazione_bdn:form.data_registrazione_bdn||null,
      peso_nascita:form.peso_nascita?parseFloat(form.peso_nascita):null,
      peso_ingresso:form.peso_ingresso?parseFloat(form.peso_ingresso):null,
      peso_attuale:form.peso_attuale?parseFloat(form.peso_attuale):null,
      provenienza:form.provenienza||null,
      data_ingresso:form.data_ingresso||null,
      prezzo_acquisto:form.prezzo_acquisto?parseFloat(form.prezzo_acquisto):null,
      origine:form.origine||null,
      fornitore:form.fornitore||null,
      data_fattura:form.data_fattura||null,
      numero_fattura:form.numero_fattura||null,
      padre_id:padre_id,
      madre_id:madre_id,
      transponder:form.transponder||null,
      passaporto:form.passaporto||null,
      codice_asl:form.codice_asl||null,
      lotto_box:form.lotto_box||null,
      destinazione:form.destinazione||null,
      stato:form.stato,
      data_uscita:form.data_uscita||null,
      motivo_uscita:form.motivo_uscita||null,
      peso_vivo_uscita:form.peso_vivo_uscita?parseFloat(form.peso_vivo_uscita):null,
      peso_carcassa:form.peso_carcassa?parseFloat(form.peso_carcassa):null,
      resa_percent:(form.peso_carcassa&&form.peso_vivo_uscita)
        ?Math.round(parseFloat(form.peso_carcassa)/parseFloat(form.peso_vivo_uscita)*1000)/10
        :null,
      note_sanitarie:form.note_sanitarie||null,
      note:form.note||null,
      vivo:form.stato==="attivo",
      riproduttore:form.riproduttore||false,
    };
    let err;
    if(form.id){
      const r=await aggiorna(form.id,payload);
      err=r.error;
      // Aggiorna dettaglio con i dati freschi salvati
      if(!err&&r.data) setDettaglio(r.data);
    }
    else{const r=await aggiungi(payload);err=r.error;}
    setSaving(false);
    if(err){setErrore("Errore nel salvataggio: "+err.message);return;}
    setForm(null);
  };

  const cancella=async(id)=>{
    if(!window.confirm("Eliminare questo animale?"))return;
    const {error} = await elimina(id);
    if(error){
      alert(`⚠️ Impossibile eliminare l'animale:\n\n${error.message}\n\nProbabile causa: è ancora collegato a un lotto (come madre/padre) o a un evento riproduttivo/sanitario/costo. Rimuovi prima quei riferimenti, oppure usa "Modifica" per correggere i dati invece di eliminare.`);
      return;
    }
    setDettaglio(null);
  };

  // ── Parto rapido ────────────────────────────────────────────────────────────
  const salvaParto=async()=>{
    if(!formParto.data_evento){setSavingParto(false);return;}
    setSavingParto(true);
    const totali=parseInt(formParto.nati_totali)||0;
    const morti=parseInt(formParto.nati_morti)||0;
    const vivi=Math.max(0,totali-morti);
    // Risolvi padre esterno se serve (con razza specificata)
    let padreIdRisolto = formParto.padre_id?parseInt(formParto.padre_id):null;
    let padreObjRisolto = padreIdRisolto?animali.find(a=>a.id===padreIdRisolto):null;
    if(!padreIdRisolto&&formParto.padre_ext&&formParto.padre_ext.trim()){
      const bdn = formParto.padre_ext.trim();
      // Cerca se esiste già (recupero anche razza per calcolo genealogia)
      const{data:lista}=await supabase.from("animali")
        .select("id,bdn,specie,sesso,razza,razza_calcolata").eq("bdn",bdn).limit(1);
      if(lista&&lista.length>0){
        padreObjRisolto = lista[0];
        padreIdRisolto = lista[0].id;
        // Se ora specifico una razza e prima era mancante, l'aggiorno
        if(formParto.padre_ext_razza&&!padreObjRisolto.razza){
          await supabase.from("animali").update({
            razza:formParto.padre_ext_razza,
            razza_calcolata:formParto.padre_ext_razza,
          }).eq("id",padreIdRisolto);
          padreObjRisolto.razza = formParto.padre_ext_razza;
          padreObjRisolto.razza_calcolata = formParto.padre_ext_razza;
        }
      } else {
        // Crea scheda minima con razza se specificata
        const{data:nuovi}=await supabase.from("animali").insert([{
          bdn, specie:dettaglio.specie, sesso:"M",
          razza: formParto.padre_ext_razza||null,
          razza_calcolata: formParto.padre_ext_razza||null,
          provenienza:"Esterno", stato:"storico", vivo:false,
          riproduttore: true,
          note:"Padre esterno — scheda creata automaticamente al parto",
        }]).select("*");
        if(nuovi&&nuovi.length>0){
          padreObjRisolto = nuovi[0];
          padreIdRisolto = nuovi[0].id;
        }
      }
      // Ricarico animali per aggiornare la lista globale (pedigree futuro)
      if(padreIdRisolto) await ricaricaAnimali();
    }
    const payload={
      animale_id:dettaglio.id,
      tipo_evento:"parto",
      data_evento:formParto.data_evento,
      tipo_parto:formParto.tipo_parto||null,
      nati_vivi:vivi,
      nati_morti:morti,
      nati_mummificati:parseInt(formParto.nati_mummificati)||0,
      padre_id:padreIdRisolto,
      data_accoppiamento:formParto.data_accoppiamento||null,
      note:formParto.note||null,
    };

    // ── MODALITÀ MODIFICA: aggiorna evento + propaga padre_id ai figli ──────
    if(formParto.id){
      const{error}=await aggiornaEvento(formParto.id,payload);
      if(error){setSavingParto(false);return;}

      // Propago il padre_id sui figli di questo parto SE è stato specificato un padre
      if(padreIdRisolto){
        // Cerco i figli di questa madre nati alla data del parto
        // Includo anche figli senza padre_id (potenziali candidati)
        const{data:figli}=await supabase.from("animali")
          .select("id,bdn,nome,razza,razza_calcolata,padre_id,nascita")
          .eq("madre_id",dettaglio.id)
          .eq("nascita",formParto.data_evento);

        if(figli&&figli.length>0){
          // Lista animali "arricchita" con il padre appena risolto (per calcolaRazza)
          const animaliPlus = padreObjRisolto&&!animali.find(a=>a.id===padreObjRisolto.id)
            ? [...animali, padreObjRisolto] : animali;
          const nuovaRazza = calcolaRazza(padreIdRisolto, dettaglio.id, animaliPlus);

          // Aggiorno tutti i figli in blocco: padre_id sempre, razza solo se calcolata
          for(const f of figli){
            const updateData = {padre_id:padreIdRisolto};
            if(nuovaRazza){
              updateData.razza_calcolata = nuovaRazza;
              updateData.razza = nuovaRazza;
            }
            await supabase.from("animali").update(updateData).eq("id",f.id);
          }
        }
      }
      await ricaricaAnimali();
      setSavingParto(false);
      setFormParto(null);
      ricaricaEventi();
      return;
    }

    // ── MODALITÀ NUOVO: crea evento + schede figli / lotto ──────────────────
    const{data:evData,error}=await aggiungiEvento(payload);
    if(error){setSavingParto(false);return;}

    if(!formParto.storico){
      const nati=formParto.nati||[];
      // Uso lista animali aumentata con il padre appena risolto (per calcolo razza figli)
      const animaliPlus = padreObjRisolto&&!animali.find(a=>a.id===padreObjRisolto.id)
        ? [...animali, padreObjRisolto]
        : animali;
      const rc=calcolaRazza(padreIdRisolto,dettaglio.id,animaliPlus);
      const padre=padreObjRisolto||(padreIdRisolto?animali.find(a=>a.id===padreIdRisolto):null);

      // Per ogni nato: se ha BDN → crea animale individuale
      //               se non ha BDN → va nel lotto (solo suini)
      const unitaLotto=[];
      let nrLotto=1;

      for(const nato of nati){
        if(nato.bdn_nato&&nato.bdn_nato.trim()){
          // Ha BDN → registro animali individuale
          await aggiungi({
            bdn:nato.bdn_nato.trim(),
            specie:dettaglio.specie,
            nome:nato.nome||null,
            razza:rc||dettaglio.razza||null,
            razza_calcolata:rc||null,
            sesso:nato.sesso||null,
            nascita:formParto.data_evento,
            peso_nascita:nato.peso_nascita?parseFloat(nato.peso_nascita):null,
            madre_id:dettaglio.id,
            padre_id:padreIdRisolto,
            provenienza:"Nato in azienda",
            data_ingresso:formParto.data_evento,
            stato:"attivo",vivo:true,
            riproduttore:nato.sesso==="M"?true:false,
            note:`Nato da parto del ${formParto.data_evento}`,
          });
        } else if(dettaglio.specie==="suino"){
          // Nessun BDN + suino → va nel lotto
          unitaLotto.push({
            nr:nrLotto++,
            sesso:nato.sesso||null,
            peso_nascita:nato.peso_nascita?parseFloat(nato.peso_nascita):null,
          });
        }
      }

      // Crea lotto se ci sono unità senza BDN (solo suini)
      if(dettaglio.specie==="suino"&&unitaLotto.length>0){
        const codLotto=generaCodLotto(
          formParto.data_evento,
          dettaglio.razza_calcolata||dettaglio.razza,
          padre?.razza_calcolata||padre?.razza,
          dettaglio.bdn
        );
        const{data:nuovoLotto}=await supabase.from("lotti_suini").insert([{
          codice:codLotto,
          codice_lotto:codLotto,
          anno:new Date(formParto.data_evento).getFullYear(),
          data_parto:formParto.data_evento,
          madre_id:dettaglio.id,
          padre_id:padreIdRisolto,
          razza_madre:dettaglio.razza_calcolata||dettaglio.razza||null,
          razza_padre:padre?.razza_calcolata||padre?.razza||null,
          nati_totali:totali,
          nati_vivi:vivi,
          nati_morti:morti,
          tipo_provenienza:"nato",
          specie:"suino",
          note:formParto.note||null,
        }]).select("id").single();

        if(nuovoLotto){
          const righeUnita=unitaLotto.map(u=>({
            lotto_id:nuovoLotto.id,
            nr:u.nr,
            codice_completo:`${codLotto}${String(u.nr).padStart(2,"0")}`,
            sesso:u.sesso||null,
            peso_nascita:u.peso_nascita||null,
            vivo:true,
            stato:"attivo",
            destinazione:"ingrasso",
          }));
          const{error:errUnita}=await supabase.from("suini_lotto").insert(righeUnita);
          if(errUnita){
            setSavingParto(false);
            alert(`⚠️ Il lotto ${codLotto} è stato creato, ma il salvataggio delle singole unità è fallito:\n\n${errUnita.message}\n\nIl lotto risulterà con "0 vivi attuali" finché non correggi questo problema (segnalalo, o elimina il lotto e riprova).`);
            return;
          }
        }
      }
    }
    // Segna automaticamente la madre come riproduttrice
    if(dettaglio.id&&!dettaglio.riproduttore){
      await aggiorna(dettaglio.id,{riproduttore:true});
      setDettaglio(prev=>({...prev,riproduttore:true}));
    }
    setSavingParto(false);
    setFormParto(null);
    await ricaricaAnimali();
    ricaricaEventi();
  };

  const eliminaParto=async(eventoId)=>{
    if(!window.confirm("Eliminare questo evento parto? I dati statistici verranno persi. Le schede dei nati già create NON vengono cancellate.")) return;
    await eliminaEvento(eventoId);
    ricaricaEventi();
  };

  // ── Vista FORM ──────────────────────────────────────────────────────────────
  if(form){
    const specie=form.specie||"bovino";
    const madri=animali.filter(a=>a.specie===specie&&a.sesso==="F"&&a.id!==form.id);
    const padriRiprod=animali.filter(a=>a.specie===specie&&a.sesso==="M"&&a.riproduttore&&a.id!==form.id);
    const padriTutti=animali.filter(a=>a.specie===specie&&a.sesso==="M"&&a.id!==form.id);
    const padri=padriRiprod.length>0?padriRiprod:padriTutti;
    return(
      <div style={{padding:"16px 16px 100px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <button onClick={()=>setForm(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
          <span style={{fontSize:18,fontWeight:800}}>{form.id?"Modifica":"Nuovo"} {specieLabel(specie)}</span>
        </div>
        {errore&&<div style={{background:C.red+"15",color:C.red,borderRadius:10,padding:"10px 14px",marginBottom:12}}>{errore}</div>}

        <Sezione label="Specie"/>
        <Field label="Specie" value={form.specie} onChange={v=>setForm(f=>({...f,specie:v,razza:"",categoria:""}))}
          options={["bovino","suino","ovino"]} required/>

        <Sezione label="Identificazione"/>
        <Field label={specie==="bovino"?"BDN / Matricola":specie==="suino"?"Tatuaggio / Codice aziendale":"Marchio auricolare (BDN)"}
          value={form.bdn} onChange={v=>setForm(f=>({...f,bdn:v}))} placeholder="Es. IT034BN001"/>
        <Field label="Nome / Soprannome" value={form.nome} onChange={v=>setForm(f=>({...f,nome:v}))}/>
        {specie==="bovino"&&<Field label="N. Passaporto" value={form.passaporto} onChange={v=>setForm(f=>({...f,passaporto:v}))}/>}
        <Field label={specie==="ovino"?"Transponder / Bolo ruminale":"Transponder / RFID"}
          value={form.transponder} onChange={v=>setForm(f=>({...f,transponder:v}))}/>

        <Sezione label="Anagrafica"/>
        <Field label="Sesso" value={form.sesso} onChange={v=>setForm(f=>({...f,sesso:v}))} options={SESSO_OPT(specie)} required/>
        <Field label="Data di nascita" value={form.nascita} onChange={v=>setForm(f=>({...f,nascita:v}))} type="date"/>
        <Field label="Data registrazione BDN" value={form.data_registrazione_bdn}
          onChange={v=>setForm(f=>({...f,data_registrazione_bdn:v}))} type="date"
          placeholder="Data attribuzione della matricola"/>
        <Field label="Razza" value={form.razza} onChange={v=>setForm(f=>({...f,razza:v}))}
          options={RAZZE[specie]||[]} required/>
        <Field label="Categoria" value={form.categoria} onChange={v=>setForm(f=>({...f,categoria:v}))}
          options={CATEGORIE[specie]||[]}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Field label="Peso nascita (kg)" value={form.peso_nascita} onChange={v=>setForm(f=>({...f,peso_nascita:v}))} type="number"/>
          <Field label="Peso attuale (kg)" value={form.peso_attuale} onChange={v=>setForm(f=>({...f,peso_attuale:v}))} type="number"/>
        </div>
        <Field label="Peso all'ingresso (kg)" value={form.peso_ingresso} onChange={v=>setForm(f=>({...f,peso_ingresso:v}))} type="number"
          placeholder="Utile soprattutto se acquistato e il peso di nascita non è noto"/>

        <Sezione label="Provenienza"/>
        <Field label="Provenienza" value={form.provenienza} onChange={v=>setForm(f=>({...f,provenienza:v}))}
          options={["Nato in azienda","Acquistato","Trasferito"]}/>
        <Field label="Data ingresso in azienda" value={form.data_ingresso} onChange={v=>setForm(f=>({...f,data_ingresso:v}))} type="date"/>
        {form.provenienza!=="Nato in azienda"&&<>
          <Field label="Azienda / Allevamento di origine" value={form.origine} onChange={v=>setForm(f=>({...f,origine:v}))}/>
          <Field label="Fornitore" value={form.fornitore} onChange={v=>setForm(f=>({...f,fornitore:v}))}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Field label="Data fattura" value={form.data_fattura}
              onChange={v=>setForm(f=>({...f,data_fattura:v}))} type="date"/>
            <Field label="Numero fattura" value={form.numero_fattura}
              onChange={v=>setForm(f=>({...f,numero_fattura:v}))} placeholder="Es. FT-2026-0042"/>
          </div>
          <Field label="Prezzo di acquisto (€)" value={form.prezzo_acquisto}
            onChange={v=>setForm(f=>({...f,prezzo_acquisto:v}))} type="number"
            placeholder="Es. 1500"/>
        </>}
        {specie==="bovino"&&
          <Field label="Codice ASL / Veterinario" value={form.codice_asl} onChange={v=>setForm(f=>({...f,codice_asl:v}))}/>}

        <Sezione label="Genealogia"/>
        {razzaCalcolata&&(
          <div style={{background:C.green+"15",border:`1px solid ${C.green}44`,borderRadius:10,
            padding:"8px 12px",marginBottom:12,fontSize:13}}>
            🧬 Razza calcolata: <strong style={{color:C.green}}>{razzaCalcolata}</strong>
            {razzaCalcolata==="METICCIA"&&<span style={{color:C.muted}}> (razze diverse)</span>}
          </div>
        )}
        {/* MADRE */}
        <Field label="Madre (in azienda)" value={form.madre_id}
          onChange={v=>setForm(f=>({...f,madre_id:v,madre_ext:""}))}
          options={madri.map(a=>({value:a.id,label:`${a.nome||a.bdn} (${a.razza||"—"})`}))}/>
        {!form.madre_id&&(
          <div style={{marginTop:-8,marginBottom:12}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>
              oppure — Matricola madre esterna (non in azienda):
            </div>
            <input type="text" value={form.madre_ext}
              onChange={e=>setForm(f=>({...f,madre_ext:e.target.value,madre_id:""}))}
              placeholder="Es. IT058000123456 — verrà creata scheda automaticamente"
              style={{width:"100%",boxSizing:"border-box",border:`1.5px solid ${form.madre_ext?C.blue:C.border}`,
                borderRadius:10,padding:"8px 12px",fontSize:13,background:"#F0F8FF",
                color:C.text,outline:"none"}}/>
            {form.madre_ext&&(
              <div style={{fontSize:11,color:C.blue,marginTop:3}}>
                🧬 Al salvataggio verrà creata automaticamente una scheda per questa madre — comparirà nel Pedigree
              </div>
            )}
          </div>
        )}
        {/* PADRE */}
        <Field label={`Padre (in azienda)${padriRiprod.length>0?" — riproduttori registrati":padriTutti.length>0?" — nessun riproduttore, mostro tutti i maschi":""}`} value={form.padre_id}
          onChange={v=>setForm(f=>({...f,padre_id:v,padre_ext:""}))}
          options={padri.map(a=>({value:a.id,label:`${a.nome||a.bdn} (${a.razza||"—"})${a.riproduttore?" ♂":""}`}))}/>
        {!form.padre_id&&(
          <div style={{marginTop:-8,marginBottom:12}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>
              oppure — Matricola padre esterno (non in azienda):
            </div>
            <input type="text" value={form.padre_ext}
              onChange={e=>setForm(f=>({...f,padre_ext:e.target.value,padre_id:""}))}
              placeholder="Es. 334966 o IT034SU123 — verrà creata scheda automaticamente"
              style={{width:"100%",boxSizing:"border-box",border:`1.5px solid ${form.padre_ext?C.blue:C.border}`,
                borderRadius:10,padding:"8px 12px",fontSize:13,background:"#F0F8FF",
                color:C.text,outline:"none"}}/>
            {form.padre_ext&&(
              <div style={{fontSize:11,color:C.blue,marginTop:3}}>
                🧬 Al salvataggio verrà creata automaticamente una scheda per questo padre — comparirà nel Pedigree
              </div>
            )}
          </div>
        )}

        <Sezione label="Gestione"/>
        <Field label={specie==="ovino"?"Gregge / Gruppo":specie==="suino"?"Lotto suini (ID)":"Lotto / Box / Recinto"}
          value={form.lotto_box} onChange={v=>setForm(f=>({...f,lotto_box:v}))}/>
        <Field label="Destinazione prevista" value={form.destinazione} onChange={v=>setForm(f=>({...f,destinazione:v}))}
          options={specie==="ovino"
            ?["Riproduzione","Ingrasso","Macello","Vendita","Carne","Latte","Lana","Non definita"]
            :["Riproduzione","Ingrasso","Vendita","Macello","Autoconsumo","Non definita"]}/>
        <Field label="Stato" value={form.stato} onChange={v=>setForm(f=>({...f,stato:v}))} options={STATI} required/>
        {/* Toggle riproduttore/riproduttrice per maschi e femmine */}
        {(form.sesso==="M"||form.sesso==="F")&&(
          <div onClick={()=>setForm(f=>({...f,riproduttore:!f.riproduttore}))}
            style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",
              background:form.riproduttore?(form.sesso==="M"?C.blue:C.suini)+"15":C.bg,
              border:`1.5px solid ${form.riproduttore?(form.sesso==="M"?C.blue:C.suini):C.border}`,
              borderRadius:12,padding:"10px 14px",marginBottom:12}}>
            <div style={{width:40,height:22,borderRadius:11,flexShrink:0,
              background:form.riproduttore?(form.sesso==="M"?C.blue:C.suini):C.border,
              position:"relative",transition:"background 0.2s"}}>
              <div style={{width:18,height:18,borderRadius:9,background:"#FFF",
                position:"absolute",top:2,
                left:form.riproduttore?20:2,transition:"left 0.2s"}}/>
            </div>
            <div>
              <div style={{fontWeight:700,fontSize:14,
                color:form.riproduttore?(form.sesso==="M"?C.blue:C.suini):C.muted}}>
                {form.sesso==="M"?"♂ Riproduttore":"♀ Riproduttrice"}
              </div>
              <div style={{fontSize:11,color:C.muted}}>
                {form.riproduttore
                  ?"Incluso nel registro riproduttori"
                  :"Non incluso nel registro riproduttori"}
              </div>
            </div>
          </div>
        )}

        {form.stato!=="attivo"&&(<>
          <Sezione label="Dati Uscita"/>
          <Field label="Data uscita" value={form.data_uscita}
            onChange={v=>setForm(f=>({...f,data_uscita:v}))} type="date"/>
          {/* Giorni permanenza calcolati */}
          {form.data_uscita&&form.data_ingresso&&(()=>{
            const gg=Math.round((new Date(form.data_uscita)-new Date(form.data_ingresso))/86400000);
            return gg>0&&(
              <div style={{background:C.blue+"12",border:`1px solid ${C.blue}33`,
                borderRadius:10,padding:"8px 12px",marginBottom:12,fontSize:13}}>
                📅 Permanenza: <strong style={{color:C.blue}}>{gg} giorni</strong>
                {gg>=365&&<span style={{color:C.muted}}> ({(gg/365).toFixed(1)} anni)</span>}
              </div>
            );
          })()}
          <Field label="Motivo uscita" value={form.motivo_uscita}
            onChange={v=>setForm(f=>({...f,motivo_uscita:v}))}
            options={["Macellato","Morto (cause naturali)","Morto (malattia)","Venduto vivo","Furto","Scappato","Trasferito","Altro"]}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Field label="Peso vivo uscita (kg)" value={form.peso_vivo_uscita}
              onChange={v=>setForm(f=>({...f,peso_vivo_uscita:v}))} type="number"/>
            {(form.motivo_uscita==="Macellato")&&
              <Field label="Peso carcassa (kg)" value={form.peso_carcassa}
                onChange={v=>setForm(f=>({...f,peso_carcassa:v}))} type="number"/>}
          </div>
          {/* Resa calcolata automaticamente */}
          {form.motivo_uscita==="Macellato"&&form.peso_carcassa&&form.peso_vivo_uscita&&(()=>{
            const resa=Math.round(parseFloat(form.peso_carcassa)/parseFloat(form.peso_vivo_uscita)*1000)/10;
            return(
              <div style={{background:C.green+"12",border:`1px solid ${C.green}33`,
                borderRadius:10,padding:"8px 12px",marginBottom:12,fontSize:13}}>
                ⚖️ Resa: <strong style={{color:C.green}}>{resa}%</strong>
                <span style={{color:C.muted,fontSize:12}}> (carcassa/peso vivo)</span>
              </div>
            );
          })()}
        </>)}

        <Sezione label="Sanità e Note"/>
        <Field label="Note sanitarie" value={form.note_sanitarie} onChange={v=>setForm(f=>({...f,note_sanitarie:v}))}/>
        <Field label="Note generali" value={form.note} onChange={v=>setForm(f=>({...f,note:v}))}/>

        <div style={{display:"flex",gap:10,marginTop:16}}>
          <Btn label={saving?"Salvataggio...":"Salva"} icon="✓" onClick={salva} variant="success" disabled={saving}/>
          <Btn label="Annulla" onClick={()=>setForm(null)} variant="ghost"/>
        </div>
      </div>
    );
  }

  // ── Vista DETTAGLIO animale ──────────────────────────────────────────────────
  if(dettaglio){
    const a=dettaglio;
    const padre=a.padre_id?animali.find(x=>x.id===a.padre_id):null;
    const madre=a.madre_id?animali.find(x=>x.id===a.madre_id):null;
    const figli=animali.filter(x=>x.padre_id===a.id||x.madre_id===a.id);
    const mieEventi=eventiRiproduttivi.filter(e=>e.animale_id===a.id).sort((x,y)=>y.data_evento>x.data_evento?1:-1);
    const partiMadre=eventiRiproduttivi.filter(e=>e.animale_id===a.id&&e.tipo_evento==="parto");
    // Eventi sanitari dell'animale
    const mieiSanitari = (sanitari||[]).filter(e=>e.animale_id===a.id);

    // ── TIMELINE UNIFICATA (parti + sanitari + nascita + uscita) ───────────
    const timeline = [];
    // Nascita/Ingresso
    if(a.nascita) timeline.push({
      _cat:"vita", _data:a.nascita, _icona:"🌱",
      _colore:C.green, _tipo:"Nascita",
      _titolo: `Nascita${a.data_registrazione_bdn?" (BDN: "+a.data_registrazione_bdn+")":""}`,
      _dettaglio: a.peso_nascita ? `Peso alla nascita: ${a.peso_nascita} kg` : "",
    });
    if(a.data_ingresso&&a.data_ingresso!==a.nascita) timeline.push({
      _cat:"vita", _data:a.data_ingresso, _icona:"📥",
      _colore:C.blue, _tipo:"Ingresso in azienda",
      _titolo:"Ingresso in azienda",
      _dettaglio: a.origine ? `Origine: ${a.origine}` : "",
    });
    if(a.data_qualifica_riproduttore) timeline.push({
      _cat:"vita", _data:a.data_qualifica_riproduttore, _icona:"♂♀",
      _colore:C.accent, _tipo:"Qualifica riproduttore",
      _titolo: a.sesso==="M"?"Diventato Riproduttore":"Diventata Riproduttrice",
      _dettaglio:"",
    });
    // Parti (per femmine)
    partiMadre.forEach(p => timeline.push({
      _cat:"riproduzione", _data:p.data_evento, _icona:"🐣",
      _colore: p.nati_vivi>1?"#D9628F":C.accent, _tipo:"Parto",
      _titolo: `Parto${p.tipo_parto?" ("+p.tipo_parto+")":""}`,
      _dettaglio: `${p.nati_vivi||0} nati vivi${p.nati_morti>0?" · "+p.nati_morti+" morti":""}${p.nati_mummificati>0?" · "+p.nati_mummificati+" mummificati":""}`,
      _originale: p,
    }));
    // Eventi sanitari
    mieiSanitari.forEach(s => timeline.push({
      _cat:"sanitario", _data:s.data, _icona:"💉",
      _colore: s.tipo==="malattia"||s.tipo==="intervento chirurgico"?C.red
        : s.tipo==="vaccino"||s.tipo==="richiamo vaccinale"?C.green
        : s.tipo==="antiparassitario"?"#8B7FBA"
        : C.blue,
      _tipo: (s.tipo||"altro").toUpperCase(),
      _titolo: s.descrizione,
      _dettaglio: [
        s.prodotto?`💊 ${s.prodotto}`:null,
        s.veterinario?`👨‍⚕️ ${s.veterinario}`:null,
        s.costo?`💰 €${s.costo}`:null,
        s.scadenza?`⏰ Richiamo: ${s.scadenza}`:null,
      ].filter(Boolean).join(" · "),
      _originale: s,
    }));
    // Uscita
    if(a.stato!=="attivo"&&a.data_uscita) timeline.push({
      _cat:"vita", _data:a.data_uscita, _icona:"📤",
      _colore: a.motivo_uscita?.toLowerCase().includes("morte")||
               a.motivo_uscita?.toLowerCase().includes("predaz")||
               a.motivo_uscita?.toLowerCase().includes("smarr")?C.red:C.muted,
      _tipo:"Uscita",
      _titolo: a.motivo_uscita||"Uscita dall'azienda",
      _dettaglio: [
        a.peso_vivo_uscita?`⚖️ Peso vivo ${a.peso_vivo_uscita} kg`:null,
        a.peso_carcassa?`🥩 Carcassa ${a.peso_carcassa} kg`:null,
        a.resa_percent?`resa ${a.resa_percent}%`:null,
      ].filter(Boolean).join(" · "),
    });
    // Ordino per data DECRESCENTE (più recente in alto)
    timeline.sort((x,y) => (y._data||"").localeCompare(x._data||""));
    // Statistiche timeline
    const nSanitari = mieiSanitari.length;
    const costoSanitario = mieiSanitari.reduce((s,e)=>s+(parseFloat(e.costo)||0),0);
    const scadenzePendenti = mieiSanitari.filter(e=>e.scadenza&&new Date(e.scadenza)>=new Date(today())).length;

    return(
      <div style={{padding:"0 0 100px"}}>
        {/* Header */}
        <div style={{background:specieColor(a.specie),padding:"16px 16px 20px"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
            <button onClick={()=>setDettaglio(null)} style={{background:"rgba(255,255,255,0.2)",border:"none",
              borderRadius:10,padding:"6px 10px",color:"#FFF",cursor:"pointer",fontSize:18}}>←</button>
            <span style={{fontSize:18,fontWeight:800,color:"#FFF",flex:1}}>{a.nome||a.bdn||"Animale"}</span>
            <button onClick={()=>setForm({...a})} style={{background:"rgba(255,255,255,0.2)",border:"none",
              borderRadius:10,padding:"6px 10px",color:"#FFF",cursor:"pointer"}}>✏️</button>
            <button onClick={()=>cancella(a.id)} style={{background:"rgba(255,255,255,0.2)",border:"none",
              borderRadius:10,padding:"6px 10px",color:"#FFF",cursor:"pointer"}}>🗑️</button>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <Badge label={specieLabel(a.specie)+" "+specieIcon(a.specie)} color="#FFFFFF"/>
            <Badge label={a.sesso==="M"?"♂ Maschio":a.sesso==="F"?"♀ Femmina":"✂ Castrato"} color="#FFFFFF"/>
            {a.categoria&&<Badge label={a.categoria} color="#FFFFFF"/>}
            {a.stato!=="attivo"&&<Badge label={a.stato.toUpperCase()} color="#FFFFFF"/>}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{display:"flex",background:C.card,borderBottom:`1px solid ${C.border}`}}>
          {[["info","📋 Info"],["genealogia","🧬 Genealogia"],["eventi","📅 Eventi"],["costi","💰 Costi"],["pesate","⚖️ Pesate"]].map(([id,label])=>(
            <button key={id} onClick={()=>setTabDettaglio(id)}
              style={{flex:1,padding:"12px 4px",background:"none",border:"none",cursor:"pointer",
                fontSize:12,fontWeight:tabDettaglio===id?700:500,
                color:tabDettaglio===id?C.primary:C.muted,
                borderBottom:tabDettaglio===id?`2px solid ${C.primary}`:"2px solid transparent"}}>
              {label}
            </button>
          ))}
        </div>

        <div style={{padding:"16px"}}>
          {/* TAB INFO */}
          {tabDettaglio==="info"&&(
            <>
              {a.provenienza==="Acquistato"&&!a.prezzo_acquisto&&(
                <div style={{background:C.red,color:"#FFF",borderRadius:10,padding:"10px 14px",
                  marginBottom:12,fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:8}}>
                  ⚠️ Inserire costo di acquisto (con gli estremi della fattura)
                </div>
              )}
              <Card>
                <Sezione label="Identificazione"/>
                {a.bdn&&<Row label={a.specie==="bovino"?"BDN":"Tatuaggio/Marchio"} val={a.bdn}/>}
                {a.passaporto&&<Row label="N. Passaporto" val={a.passaporto}/>}
                {a.transponder&&<Row label="Transponder" val={a.transponder}/>}
                <Row label="Specie" val={specieIcon(a.specie)+" "+specieLabel(a.specie)}/>
                <Row label="Razza" val={(a.razza_calcolata||a.razza||"—")+(a.razza_calcolata==="METICCIA"?" 🧬":"")}/>
                <Row label="Sesso" val={a.sesso==="M"?"♂ Maschio":a.sesso==="F"?"♀ Femmina":"✂ Castrato"}/>
                {a.categoria&&<Row label="Categoria" val={a.categoria}/>}
                {a.riproduttore&&(
                  <div style={{display:"flex",justifyContent:"space-between",
                    padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:14}}>
                    <span style={{color:C.muted,fontSize:13}}>Qualifica</span>
                    <span style={{fontWeight:700,
                      color:a.sesso==="M"?C.blue:C.suini,fontSize:13}}>
                      {a.sesso==="M"?"♂ Riproduttore":"♀ Riproduttrice"}
                    </span>
                  </div>
                )}
                {a.data_registrazione_bdn&&(
                  <div style={{display:"flex",justifyContent:"space-between",
                    padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:14}}>
                    <span style={{color:C.muted,fontSize:13}}>Data registrazione BDN</span>
                    <span style={{fontWeight:600}}>{a.data_registrazione_bdn}</span>
                  </div>
                )}
              </Card>
              {a.sesso==="F"&&partiMadre.length>0&&(()=>{
                const mieiVivi=partiMadre.reduce((s,p)=>s+(p.nati_vivi||0),0);
                const mieiMorti=partiMadre.reduce((s,p)=>s+(p.nati_morti||0),0);
                const mieiTot=mieiVivi+mieiMorti;
                const miaPct=mieiTot>0?Math.round(mieiVivi/mieiTot*1000)/10:null;

                const partiAllevamento=eventiRiproduttivi.filter(e=>{
                  if(e.tipo_evento!=="parto") return false;
                  const an=animali.find(x=>x.id===e.animale_id);
                  return an&&an.specie===a.specie;
                });
                const allevVivi=partiAllevamento.reduce((s,p)=>s+(p.nati_vivi||0),0);
                const allevMorti=partiAllevamento.reduce((s,p)=>s+(p.nati_morti||0),0);
                const allevTot=allevVivi+allevMorti;
                const allevPct=allevTot>0?Math.round(allevVivi/allevTot*1000)/10:null;

                const coloreMia = miaPct==null||allevPct==null ? "#000"
                  : miaPct>allevPct ? C.blue
                  : miaPct<allevPct ? C.red
                  : "#000";

                return(
                  <Card>
                    <Sezione label="% Nati vivi sul totale nati"/>
                    <div style={{display:"flex",justifyContent:"space-between",
                      padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:14}}>
                      <span style={{color:C.muted,fontSize:13}}>Media allevamento ({specieLabel(a.specie)})</span>
                      <span style={{fontWeight:700,color:"#000",fontSize:14}}>
                        {allevPct!=null?allevPct+"%":"—"}
                      </span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:14}}>
                      <span style={{color:C.muted,fontSize:13}}>Questa scrofa</span>
                      <span style={{fontWeight:700,color:coloreMia,fontSize:14}}>
                        {miaPct!=null?miaPct+"%":"—"}
                      </span>
                    </div>
                  </Card>
                );
              })()}
              <Card>
                <Sezione label="Dati fisici e nascita"/>
                {a.nascita&&<Row label="Data di nascita" val={a.nascita}/>}
                {a.peso_nascita&&<Row label="Peso nascita" val={a.peso_nascita+" kg"}/>}
                {a.peso_ingresso&&<Row label="Peso all'ingresso" val={a.peso_ingresso+" kg"}/>}
                {a.peso_attuale&&<Row label="Peso attuale" val={a.peso_attuale+" kg"}/>}
                {a.provenienza&&<Row label="Provenienza" val={a.provenienza}/>}
                {a.data_ingresso&&<Row label="Data ingresso" val={a.data_ingresso}/>}
                {a.prezzo_acquisto&&<Row label="Prezzo acquisto" val={`€ ${a.prezzo_acquisto.toFixed(2)}`}/>}
                {a.origine&&<Row label="Azienda origine" val={a.origine}/>}
              </Card>
              <Card>
                <Sezione label="Gestione"/>
                {a.lotto_box&&<Row label="Lotto / Box" val={a.lotto_box}/>}
                {a.destinazione&&<Row label="Destinazione" val={a.destinazione}/>}
                <Row label="Stato" val={a.stato.toUpperCase()}/>
                {a.stato!=="attivo"&&(()=>{
                  const gg=(a.data_uscita&&a.data_ingresso)
                    ?Math.round((new Date(a.data_uscita)-new Date(a.data_ingresso))/86400000)
                    :null;
                  return(<>
                    {a.data_uscita&&<Row label="Data uscita" val={a.data_uscita}/>}
                    {gg>0&&<Row label="Permanenza" val={`${gg} giorni${gg>=365?" ("+( gg/365).toFixed(1)+" anni)":""}`}/>}
                    {a.motivo_uscita&&<Row label="Motivo uscita" val={a.motivo_uscita}/>}
                    {a.peso_vivo_uscita&&<Row label="Peso vivo uscita" val={a.peso_vivo_uscita+" kg"}/>}
                    {a.peso_carcassa&&<Row label="Peso carcassa" val={a.peso_carcassa+" kg"}/>}
                    {a.resa_percent&&(
                      <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",
                        fontSize:14,borderBottom:`1px solid ${C.border}`}}>
                        <span style={{color:C.muted,fontSize:13}}>Resa macellazione</span>
                        <span style={{fontWeight:700,color:C.green}}>{a.resa_percent}%</span>
                      </div>
                    )}
                    {gg>0&&a.peso_vivo_uscita&&(
                      <Row label="IPG peso vivo"
                        val={(Math.round(a.peso_vivo_uscita/gg*1000)/1000)+" kg/giorno"}/>
                    )}
                    {gg>0&&a.peso_carcassa&&(
                      <Row label="IPG carcassa"
                        val={(Math.round(a.peso_carcassa/gg*1000)/1000)+" kg/giorno"}/>
                    )}
                  </>);
                })()}
              </Card>
              {/* Vaccinazioni */}
              {(()=>{
                const vacc=(sanitari||[]).filter(s=>s.animale_id===a.id&&s.tipo==="vaccino")
                  .sort((x,y)=>y.data>x.data?1:-1);
                if(vacc.length===0)return null;
                return(
                  <Card>
                    <Sezione label={`💉 Vaccinazioni (${vacc.length})`}/>
                    {vacc.map(v=>(
                      <div key={v.id} style={{display:"flex",justifyContent:"space-between",
                        alignItems:"flex-start",padding:"7px 0",
                        borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                        <div>
                          <div style={{fontWeight:600}}>{v.descrizione||v.prodotto||"Vaccino"}</div>
                          {v.prodotto&&v.descrizione&&<div style={{fontSize:11,color:C.muted}}>💊 {v.prodotto}</div>}
                          {v.veterinario&&<div style={{fontSize:11,color:C.muted}}>👨‍⚕️ {v.veterinario}</div>}
                          {v.scadenza&&<div style={{fontSize:11,color:C.yellow}}>⏰ richiamo: {v.scadenza}</div>}
                        </div>
                        <div style={{fontSize:12,color:C.muted,textAlign:"right",flexShrink:0}}>
                          <div>{v.data}</div>
                          {v.costo>0&&<div style={{color:C.accent}}>€{v.costo}</div>}
                        </div>
                      </div>
                    ))}
                  </Card>
                );
              })()}
              {(a.note_sanitarie||a.note)&&(
                <Card>
                  <Sezione label="Note"/>
                  {a.note_sanitarie&&<><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Sanitarie</div><div style={{fontSize:14,marginBottom:8}}>{a.note_sanitarie}</div></>}
                  {a.note&&<><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Generali</div><div style={{fontSize:14}}>{a.note}</div></>}
                </Card>
              )}
            </>
          )}

          {/* TAB GENEALOGIA */}
          {tabDettaglio==="genealogia"&&(
            <>
              {(padre||madre)?(
                <>
                  {padre&&(
                    <Card>
                      <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:8}}>PADRE</div>
                      <AntenatatoMini a={padre} onClick={()=>setDettaglio(padre)}/>
                    </Card>
                  )}
                  {madre&&(
                    <Card>
                      <div style={{fontSize:11,fontWeight:700,color:"#B5547A",marginBottom:8}}>
                        MADRE · {partiMadre.length>0?`${partiMadre.length} parti registrati`:"nessun parto"}
                      </div>
                      <AntenatatoMini a={madre} onClick={()=>setDettaglio(madre)}/>
                    </Card>
                  )}
                  {figli.length>0&&(
                    <Card>
                      <div style={{fontSize:11,fontWeight:700,color:C.green,marginBottom:8}}>DISCENDENTI ({figli.length})</div>
                      {figli.map(f=><AntenatatoMini key={f.id} a={f} onClick={()=>setDettaglio(f)}/>)}
                    </Card>
                  )}
                </>
              ):(
                <div style={{textAlign:"center",padding:32,color:C.muted}}>
                  <div style={{fontSize:40,marginBottom:8}}>🧬</div>
                  <div>Nessun dato genealogico</div>
                  <div style={{marginTop:8,fontSize:13}}>Modifica la scheda per aggiungere padre e madre</div>
                </div>
              )}
            </>
          )}

          {/* TAB EVENTI */}
          {tabDettaglio==="eventi"&&(
            <>
              {/* Solo per femmine: pulsante parto */}
              {(a.sesso==="F")&&(
                formParto?(
                  <Card>
                    <div style={{fontWeight:700,marginBottom:4}}>
                      {formParto.id?"✏️ Modifica parto":"🐣 Registra parto"}
                    </div>
                    {/* Toggle parto storico - solo in creazione */}
                    {!formParto.id&&(
                      <div onClick={()=>setFormParto(f=>({...f,storico:!f.storico}))}
                        style={{display:"flex",alignItems:"center",gap:8,
                          background:formParto.storico?C.yellow+"20":C.bg,
                          borderRadius:10,padding:"8px 12px",marginBottom:12,cursor:"pointer",
                          border:`1px solid ${formParto.storico?C.yellow:C.border}`}}>
                        <div style={{width:36,height:20,borderRadius:10,
                          background:formParto.storico?C.yellow:C.border,
                          position:"relative",transition:"background 0.2s"}}>
                          <div style={{width:16,height:16,borderRadius:8,background:"#FFF",
                            position:"absolute",top:2,
                            left:formParto.storico?18:2,transition:"left 0.2s"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:formParto.storico?C.yellow:C.muted}}>
                            Parto storico
                          </div>
                          <div style={{fontSize:11,color:C.muted}}>
                            {formParto.storico?"Solo per selezione genetica — non crea schede figli":"Attiva per parti già avvenuti con figli non in azienda"}
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Sezione lotto — solo per suini, calcolato automaticamente */}
                    {a.specie==="suino"&&(()=>{
                      const padre=formParto.padre_id
                        ?animali.find(x=>x.id===parseInt(formParto.padre_id)):null;
                      const codLotto=generaCodLotto(
                        formParto.data_evento,
                        a.razza_calcolata||a.razza,
                        padre?.razza_calcolata||padre?.razza,
                        a.bdn
                      );
                      return codLotto?(
                        <div style={{background:"#E8F5E9",border:"1.5px solid #4A7C59",
                          borderRadius:12,padding:"10px 14px",marginBottom:12}}>
                          <div style={{fontSize:11,fontWeight:700,color:"#4A7C59",marginBottom:4}}>
                            🏷️ CODICE LOTTO GENERATO AUTOMATICAMENTE
                          </div>
                          <div style={{fontSize:28,fontWeight:900,color:"#2E5D3B",
                            letterSpacing:2,fontFamily:"monospace"}}>
                            {codLotto}
                          </div>
                          <div style={{fontSize:11,color:"#8B7355",marginTop:4}}>
                            {String(new Date(formParto.data_evento||new Date()).getFullYear()).slice(-2)}
                            {String(new Date(formParto.data_evento||new Date()).getMonth()+1).padStart(2,"0")}
                            {" "}(anno+mese) ·{" "}
                            {getRazzaLettera(a.razza_calcolata||a.razza)} (madre) ·{" "}
                            {getRazzaLettera(padre?.razza_calcolata||padre?.razza||"")} (padre) ·{" "}
                            {(a.bdn||"").replace(/\D/g,"").slice(-2)} (ultime 2 cifre matricola madre)
                          </div>
                        </div>
                      ):null;
                    })()}
                    {/* Sezione accoppiamento — solo per suini */}
                    {a.specie==="suino"&&(
                      <div style={{background:C.suini+"10",border:`1px solid ${C.suini}33`,
                        borderRadius:12,padding:"12px 14px",marginBottom:12}}>
                        <div style={{fontSize:12,fontWeight:700,color:C.suini,marginBottom:10}}>
                          🐷 Accoppiamento (facoltativo)
                        </div>
                        <Field label="Data accoppiamento"
                          value={formParto.data_accoppiamento}
                          onChange={v=>{
                            // Calcola data prevista parto: +3 mesi +3 settimane +3 giorni
                            let prevista="";
                            if(v){
                              const d=new Date(v);
                              d.setMonth(d.getMonth()+3);
                              d.setDate(d.getDate()+24); // 3 settimane + 3 giorni
                              prevista=d.toISOString().split("T")[0];
                            }
                            setFormParto(f=>({...f,data_accoppiamento:v,_data_prevista:prevista}));
                          }}
                          type="date"/>
                        {formParto.data_accoppiamento&&formParto._data_prevista&&(
                          <div style={{background:C.suini+"15",borderRadius:8,
                            padding:"8px 12px",fontSize:13}}>
                            <div style={{color:C.suini,fontWeight:600}}>
                              📅 Data prevista parto:
                              <strong style={{fontSize:16,marginLeft:8}}>{formParto._data_prevista}</strong>
                            </div>
                            <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                              3 mesi + 3 settimane + 3 giorni dopo l'accoppiamento
                            </div>
                            {formParto.data_evento&&formParto.data_evento!==formParto._data_prevista&&(
                              <div style={{fontSize:11,color:C.yellow,marginTop:4}}>
                                ⚠️ Data effettiva: {formParto.data_evento}
                                {(()=>{
                                  const diff=Math.round((new Date(formParto.data_evento)-new Date(formParto._data_prevista))/86400000);
                                  return diff!==0?` (${diff>0?"+":""}${diff} giorni rispetto alla previsione)`:null;
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <Field label="Data parto" value={formParto.data_evento}
                      onChange={v=>setFormParto(f=>({...f,data_evento:v}))} type="date" required/>
                    <Field label="Tipo parto" value={formParto.tipo_parto}
                      onChange={v=>setFormParto(f=>({...f,tipo_parto:v}))}
                      options={a.specie==="bovino"?["Naturale","Assistito","Cesareo"]:["Naturale","Assistito"]}/>
                    {/* Nati totali + morti → vivi calcolati */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      <Field label="N° nati totali" value={formParto.nati_totali}
                        onChange={v=>{
                          const tot=parseInt(v)||0;
                          const mort=parseInt(formParto.nati_morti)||0;
                          const vivi=Math.max(0,tot-mort);
                          setFormParto(f=>({...f,nati_totali:v,
                            nati:(!f.storico&&!f.id)?Array.from({length:vivi},(_,i)=>f.nati?.[i]||{bdn_nato:"",sesso:"",peso_nascita:""}):f.nati
                          }));
                        }} type="number"/>
                      <Field label="N° nati morti" value={formParto.nati_morti}
                        onChange={v=>{
                          const mort=parseInt(v)||0;
                          const tot=parseInt(formParto.nati_totali)||0;
                          const vivi=Math.max(0,tot-mort);
                          setFormParto(f=>({...f,nati_morti:v,
                            nati:(!f.storico&&!f.id)?Array.from({length:vivi},(_,i)=>f.nati?.[i]||{bdn_nato:"",sesso:"",peso_nascita:""}):f.nati
                          }));
                        }} type="number"/>
                    </div>
                    {/* Badge nati vivi calcolati */}
                    {(formParto.nati_totali||formParto.nati_morti)&&(()=>{
                      const vivi=Math.max(0,(parseInt(formParto.nati_totali)||0)-(parseInt(formParto.nati_morti)||0));
                      return(
                        <div style={{background:C.green+"15",border:`1px solid ${C.green}33`,
                          borderRadius:10,padding:"8px 12px",marginBottom:12,
                          display:"flex",gap:16,fontSize:13}}>
                          <span>🟢 Vivi: <strong style={{color:C.green}}>{vivi}</strong></span>
                          <span>🔴 Morti: <strong style={{color:C.red}}>{parseInt(formParto.nati_morti)||0}</strong></span>
                          <span>📊 Totali: <strong>{parseInt(formParto.nati_totali)||0}</strong></span>
                        </div>
                      );
                    })()}
                    {(()=>{
                      const riprod=animali.filter(x=>x.specie===a.specie&&x.sesso==="M"&&x.riproduttore);
                      const tutti=animali.filter(x=>x.specie===a.specie&&x.sesso==="M");
                      const opzioni=(riprod.length>0?riprod:tutti).map(x=>({value:x.id,label:`${x.nome||x.bdn}${x.riproduttore?" ♂":""}`}));
                      return(
                        <div>
                          <Field label={`Padre${riprod.length>0?" (riproduttori registrati)":"  (nessun riproduttore — mostro tutti i maschi)"}`}
                            value={formParto.padre_id}
                            onChange={v=>setFormParto(f=>({...f,padre_id:v}))}
                            options={opzioni}/>
                          {riprod.length>0&&(
                            <div style={{fontSize:11,color:C.muted,marginTop:-8,marginBottom:8}}>
                              Solo ♂ registrati come riproduttori · {riprod.length} disponibili
                            </div>
                          )}
                          {/* Padre esterno (non in azienda) */}
                          {!formParto.padre_id&&(
                            <div style={{marginTop:6,marginBottom:12}}>
                              <div style={{fontSize:11,color:C.muted,marginBottom:4}}>
                                oppure — Matricola padre esterno (non in azienda):
                              </div>
                              <input type="text" value={formParto.padre_ext||""}
                                onChange={e=>setFormParto(f=>({...f,padre_ext:e.target.value,padre_id:""}))}
                                placeholder="Es. IT058000123456"
                                style={{width:"100%",boxSizing:"border-box",
                                  border:`1.5px solid ${formParto.padre_ext?C.blue:C.border}`,
                                  borderRadius:10,padding:"8px 12px",fontSize:13,
                                  background:"#F0F8FF",color:C.text,outline:"none",marginBottom:8}}/>
                              {formParto.padre_ext&&(
                                <>
                                  <div style={{fontSize:11,color:C.muted,marginBottom:4,marginTop:8}}>
                                    Razza del padre esterno (per calcolo razza figli):
                                  </div>
                                  <select value={formParto.padre_ext_razza||""}
                                    onChange={e=>setFormParto(f=>({...f,padre_ext_razza:e.target.value}))}
                                    style={{width:"100%",boxSizing:"border-box",
                                      border:`1.5px solid ${formParto.padre_ext_razza?C.blue:C.border}`,
                                      borderRadius:10,padding:"8px 12px",fontSize:13,
                                      background:"#F0F8FF",color:C.text,outline:"none"}}>
                                    <option value="">— seleziona razza —</option>
                                    {(a.specie==="bovino"?
                                      ["Marchigiana","Chianina","Maremmana","Podolica","Romagnola","Piemontese","Limousine","Meticcia","Altra"]
                                     :a.specie==="ovino"?
                                      ["Sopravvissana","Suffolk","Sarda","Comisana","Massese","Merinizzata","Meticcia","Altra"]
                                     :["Cinta Senese","Nero Apucalabro","Nero Casertano","Mora Romagnola","Duroc","Large White","Landrace","Meticcia","Altra"]
                                    ).map(r=><option key={r} value={r}>{r}</option>)}
                                  </select>
                                  <div style={{fontSize:11,color:C.blue,marginTop:6}}>
                                    🧬 Verrà creata la scheda del padre esterno {formParto.padre_ext_razza?`(${formParto.padre_ext_razza})`:""} e collegata al parto
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {/* Campi per ogni nato vivo (solo creazione, non storico) */}
                    {!formParto.id&&!formParto.storico&&(formParto.nati||[]).map((n,i)=>{
                      const codLottoPreview=(()=>{
                        const padre=formParto.padre_id?animali.find(x=>x.id===parseInt(formParto.padre_id)):null;
                        return generaCodLotto(formParto.data_evento,a.razza_calcolata||a.razza,padre?.razza_calcolata||padre?.razza,a.bdn);
                      })();
                      const nrLotto=String(i+1-(formParto.nati||[]).slice(0,i+1).filter(x=>x.bdn_nato&&x.bdn_nato.trim()).length).padStart(2,"0");
                      return(
                      <div key={i} style={{background:C.bg,borderRadius:10,padding:10,marginBottom:8,
                        border:`1.5px solid ${n.bdn_nato?C.green:C.suini}44`}}>
                        <div style={{fontSize:12,fontWeight:700,marginBottom:8,
                          color:n.bdn_nato?C.green:C.suini}}>
                          {a.specie==="suino"
                            ?(n.bdn_nato
                              ?`🏷️ Nato ${i+1} → Registro animali (BDN: ${n.bdn_nato})`
                              :`🐷 Nato ${i+1} → Lotto ${codLottoPreview||"?"}${!n.bdn_nato?nrLotto:""}`)
                            :(formParto.nati||[]).length>1
                              ?`👥 Gemello ${i+1} di ${formParto.nati.length} — inserisci matricola`
                              :`🐾 Nato vivo — inserisci matricola`}
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          <Field label="Sesso" value={n.sesso}
                            onChange={v=>setFormParto(f=>({...f,nati:f.nati.map((x,j)=>j===i?{...x,sesso:v}:x)}))}
                            options={a.specie==="suino"?["M","F","Castrato"]:SESSO_OPT(a.specie)}/>
                          <Field label="Peso nascita (kg)" value={n.peso_nascita}
                            onChange={v=>setFormParto(f=>({...f,nati:f.nati.map((x,j)=>j===i?{...x,peso_nascita:v}:x)}))}
                            type="number"/>
                        </div>
                        {a.specie==="suino"
                          ?<div>
                              <div style={{fontSize:11,color:C.muted,marginBottom:3}}>
                                BDN/ID individuale (solo se riproduttore o razza pregiata — altrimenti lascia vuoto → entra nel lotto)
                              </div>
                              <input type="text" value={n.bdn_nato||""}
                                onChange={e=>setFormParto(f=>({...f,nati:f.nati.map((x,j)=>j===i?{...x,bdn_nato:e.target.value}:x)}))}
                                placeholder="Vuoto = va nel lotto automaticamente"
                                style={{width:"100%",boxSizing:"border-box",
                                  border:`1.5px solid ${n.bdn_nato?C.green:C.border}`,
                                  borderRadius:8,padding:"7px 10px",fontSize:13,
                                  background:"#FAFAF8",outline:"none"}}/>
                            </div>
                          :<div>
                              <div style={{fontSize:11,color:C.muted,marginBottom:3}}>
                                BDN / Matricola *
                              </div>
                              <input type="text" value={n.bdn_nato||""}
                                onChange={e=>setFormParto(f=>({...f,nati:f.nati.map((x,j)=>j===i?{...x,bdn_nato:e.target.value}:x)}))}
                                placeholder="Es. IT058000123456"
                                style={{width:"100%",boxSizing:"border-box",
                                  border:`1.5px solid ${n.bdn_nato?C.green:C.border}`,
                                  borderRadius:8,padding:"7px 10px",fontSize:13,
                                  background:"#FAFAF8",outline:"none"}}/>
                            </div>
                        }
                      </div>
                      );
                    })}
                    {formParto.id&&(
                      <div style={{background:C.blue+"12",border:`1px solid ${C.blue}33`,borderRadius:10,
                        padding:"8px 12px",marginBottom:12,fontSize:12,color:C.muted}}>
                        ℹ️ La modifica aggiorna i dati statistici del parto. Se aggiungi il padre, verrà propagato anche alle schede dei figli già registrati (con ricalcolo della razza).
                      </div>
                    )}
                    <Field label="Note" value={formParto.note} onChange={v=>setFormParto(f=>({...f,note:v}))}/>
                    <div style={{display:"flex",gap:8,marginTop:8}}>
                      <Btn label={savingParto?"Salvataggio...":formParto.id?"Salva modifiche":"Registra parto"} icon="✓" onClick={salvaParto}
                        variant="success" disabled={savingParto}/>
                      <Btn label="Annulla" onClick={()=>setFormParto(null)} variant="ghost"/>
                    </div>
                  </Card>
                ):(
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <Btn label="🐣 Nuovo parto" onClick={()=>setFormParto({
                      data_evento:today(),tipo_parto:"Naturale",
                      nati_totali:"",nati_morti:"0",nati_mummificati:"0",
                      padre_id:"",nati:[],note:"",storico:false,
                      data_accoppiamento:""})}
                      variant="success" small/>
                    <Btn label="📅 Parto storico" onClick={()=>setFormParto({
                      data_evento:"",tipo_parto:"Naturale",
                      nati_totali:"",nati_morti:"0",nati_mummificati:"0",
                      padre_id:"",nati:[],note:"",storico:true,
                      data_accoppiamento:""})}
                      variant="outline" small/>
                  </div>
                )
              )}
              <div style={{height:12}}/>

              {/* Statistiche timeline */}
              {timeline.length>0&&(
                <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
                  <div style={{background:C.card,borderRadius:10,padding:"6px 10px",
                    fontSize:11,border:`1px solid ${C.border}`}}>
                    📅 <b>{timeline.length}</b> eventi totali
                  </div>
                  <div style={{background:C.green+"12",borderRadius:10,padding:"6px 10px",
                    fontSize:11,border:`1px solid ${C.green}33`,color:C.green}}>
                    💉 <b>{nSanitari}</b> sanitari
                  </div>
                  {partiMadre.length>0&&(
                    <div style={{background:C.accent+"12",borderRadius:10,padding:"6px 10px",
                      fontSize:11,border:`1px solid ${C.accent}33`,color:C.accent}}>
                      🐣 <b>{partiMadre.length}</b> parti
                    </div>
                  )}
                  {costoSanitario>0&&(
                    <div style={{background:C.yellow+"14",borderRadius:10,padding:"6px 10px",
                      fontSize:11,border:`1px solid ${C.yellow}44`,color:C.yellow}}>
                      💰 <b>€{costoSanitario.toFixed(2)}</b> spese san.
                    </div>
                  )}
                  {scadenzePendenti>0&&(
                    <div style={{background:C.red+"12",borderRadius:10,padding:"6px 10px",
                      fontSize:11,border:`1px solid ${C.red}33`,color:C.red}}>
                      ⏰ <b>{scadenzePendenti}</b> richiami futuri
                    </div>
                  )}
                </div>
              )}

              {/* TIMELINE UNIFICATA */}
              {timeline.length===0?(
                <div style={{textAlign:"center",padding:32,color:C.muted}}>
                  <div style={{fontSize:36,marginBottom:8}}>📅</div>
                  <div>Nessun evento registrato</div>
                </div>
              ):(
                <div style={{position:"relative",paddingLeft:26}}>
                  {/* Linea verticale continua */}
                  <div style={{position:"absolute",left:11,top:8,bottom:8,width:2,
                    background:`linear-gradient(to bottom,${C.border},${C.border} 90%,transparent)`}}/>
                  {timeline.map((ev,idx)=>{
                    // Anno diverso dall'evento precedente = separatore anno
                    const anno = (ev._data||"").substring(0,4);
                    const annoPrec = idx>0 ? (timeline[idx-1]._data||"").substring(0,4) : null;
                    const mostraAnno = anno && anno !== annoPrec;
                    return (
                      <div key={idx}>
                        {mostraAnno&&(
                          <div style={{position:"relative",margin:"14px 0 8px -26px",
                            paddingLeft:26}}>
                            <div style={{display:"inline-block",
                              background:C.primary,color:"#FFF",
                              borderRadius:12,padding:"3px 12px",
                              fontSize:11,fontWeight:800,letterSpacing:1}}>
                              {anno}
                            </div>
                          </div>
                        )}
                        <div style={{position:"relative",marginBottom:10}}>
                          {/* Puntino evento sulla timeline */}
                          <div style={{position:"absolute",left:-21,top:14,
                            width:18,height:18,borderRadius:9,
                            background:"#FFF",border:`3px solid ${ev._colore}`,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:9,zIndex:2}}>
                            {ev._icona}
                          </div>
                          {/* Card evento */}
                          <div style={{background:C.card,borderRadius:12,padding:"10px 12px",
                            border:`1px solid ${C.border}`,borderLeft:`4px solid ${ev._colore}`,
                            boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
                            <div style={{display:"flex",justifyContent:"space-between",
                              alignItems:"flex-start",gap:8}}>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
                                  <span style={{fontSize:10,fontWeight:800,color:ev._colore,
                                    background:ev._colore+"15",padding:"2px 7px",borderRadius:8,
                                    letterSpacing:0.5}}>
                                    {ev._tipo}
                                  </span>
                                  <span style={{fontSize:11,color:C.muted}}>{ev._data}</span>
                                </div>
                                <div style={{fontWeight:600,fontSize:14,color:C.text,marginBottom:2}}>
                                  {ev._titolo}
                                </div>
                                {ev._dettaglio&&(
                                  <div style={{fontSize:12,color:C.muted}}>
                                    {ev._dettaglio}
                                  </div>
                                )}
                                {ev._originale?.note&&(
                                  <div style={{fontSize:11,color:C.muted,marginTop:4,fontStyle:"italic"}}>
                                    "{ev._originale.note}"
                                  </div>
                                )}
                              </div>
                              {/* Azioni solo su parti */}
                              {ev._cat==="riproduzione"&&ev._originale&&(
                                <div style={{display:"flex",gap:4,flexShrink:0}}>
                                  <button onClick={()=>setFormParto({
                                      id:ev._originale.id,
                                      data_evento:ev._originale.data_evento||"",
                                      tipo_parto:ev._originale.tipo_parto||"Naturale",
                                      nati_totali:String((ev._originale.nati_vivi||0)+(ev._originale.nati_morti||0)),
                                      nati_morti:String(ev._originale.nati_morti||0),
                                      nati_mummificati:String(ev._originale.nati_mummificati||0),
                                      padre_id:ev._originale.padre_id||"",
                                      note:ev._originale.note||"",
                                      data_accoppiamento:ev._originale.data_accoppiamento||"",
                                      nati:[],storico:false,
                                    })}
                                    style={{background:C.blue+"20",border:"none",borderRadius:8,
                                      padding:"4px 8px",cursor:"pointer",fontSize:12}}>✏️</button>
                                  <button onClick={()=>eliminaParto(ev._originale.id)}
                                    style={{background:C.red+"20",border:"none",borderRadius:8,
                                      padding:"4px 8px",cursor:"pointer",fontSize:12}}>🗑️</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* TAB COSTI — dati calcolati dalla Contabilità Industriale, sola lettura */}
          {tabDettaglio==="costi"&&(
            <div>
              <div style={{fontSize:12,color:C.muted,marginBottom:12}}>
                Calcolato dalla Contabilità Industriale (podereverde-contabilita-industriale) — questa app lo mostra soltanto, non lo modifica qui.
              </div>
              {caricandoCosti?(
                <div style={{textAlign:"center",padding:20,color:C.muted}}>Caricamento...</div>
              ):!costiAnimale||costiAnimale.length===0?(
                <Card>
                  <div style={{padding:12,color:C.muted,fontSize:13}}>
                    Nessun costo ancora calcolato per questo animale — va calcolato dalla Contabilità Industriale (Report Costi), poi salvato per l'anno di interesse.
                  </div>
                </Card>
              ):(
                <>
                  <Card>
                    <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                      <thead>
                        <tr style={{color:C.muted,textAlign:"left"}}>
                          <th style={{padding:"6px 4px"}}>Anno</th>
                          <th style={{padding:"6px 4px",textAlign:"right"}}>UBA-gg</th>
                          <th style={{padding:"6px 4px"}}>Categoria</th>
                          <th style={{padding:"6px 4px",textAlign:"right"}}>Mantenimento</th>
                          <th style={{padding:"6px 4px",textAlign:"right"}}>Nascita ered.</th>
                          <th style={{padding:"6px 4px",textAlign:"right"}}>Scaricato figli</th>
                          <th style={{padding:"6px 4px",textAlign:"right"}}>Totale anno</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costiAnimale.map(r=>(
                          <tr key={r.id} style={{borderTop:`1px solid ${C.border}`}}>
                            <td style={{padding:"6px 4px"}}>{r.anno}</td>
                            <td style={{padding:"6px 4px",textAlign:"right"}}>{(r.uba_giorni||0).toFixed(1)}</td>
                            <td style={{padding:"6px 4px"}}>{r.categoria_contabile}</td>
                            <td style={{padding:"6px 4px",textAlign:"right"}}>{(r.costo_mantenimento||0).toFixed(2)}€</td>
                            <td style={{padding:"6px 4px",textAlign:"right"}}>{(r.costo_nascita_ereditato||0).toFixed(2)}€</td>
                            <td style={{padding:"6px 4px",textAlign:"right"}}>{(r.quota_scaricata_su_figli||0).toFixed(2)}€</td>
                            <td style={{padding:"6px 4px",textAlign:"right",fontWeight:700}}>{(r.costo_totale_anno||0).toFixed(2)}€</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                  <div style={{background:C.primary+"15",borderRadius:10,padding:"12px 16px",marginTop:10,
                    display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontWeight:700,color:C.primary}}>Totale cumulato (tutti gli anni, al lordo)</span>
                    <span style={{fontWeight:800,fontSize:16,color:C.primary}}>
                      {costiAnimale.reduce((s,r)=>s+(r.costo_totale_anno||0),0).toFixed(2)}€
                    </span>
                  </div>

                  {dettaglio.riproduttore&&(
                    <Card style={{marginTop:10}}>
                      <Sezione label="Riproduttore — costo netto e figli"/>
                      {!residuoRiproduttore?(
                        <div style={{padding:12,color:C.muted,fontSize:13}}>
                          Non ancora elaborato dalla Contabilità Industriale (Report Riproduttori → "Elabora").
                        </div>
                      ):(
                        <div style={{fontSize:13}}>
                          <RigaCosto label="Totale scaricato sui figli (tutti gli anni)"
                            valore={(scarichiRiproduttore||[]).reduce((s,r)=>s+(r.totale_scaricato_anno||0),0)}/>
                          <RigaCosto label="Residuo ancora da scaricare" valore={residuoRiproduttore.residuo_rimanente||0}/>
                          <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",
                            borderTop:`2px solid ${C.primary}`,marginTop:4,fontWeight:800}}>
                            <span>Costo NETTO (già scaricato sui figli)</span>
                            <span>{((costiAnimale.reduce((s,r)=>s+(r.costo_totale_anno||0),0))-(scarichiRiproduttore||[]).reduce((s,r)=>s+(r.totale_scaricato_anno||0),0)).toFixed(2)}€</span>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",marginTop:6}}>
                            <span style={{color:C.muted}}>Numero di figli avuti</span>
                            <span style={{fontWeight:700}}>{(scarichiRiproduttore||[]).reduce((s,r)=>s+(r.n_figli_anno||0),0)}</span>
                          </div>
                        </div>
                      )}
                    </Card>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB PESATE — storico pesate nel tempo, scritto direttamente da qui */}
          {tabDettaglio==="pesate"&&(
            <div>
              <div style={{fontSize:12,color:C.muted,marginBottom:12}}>
                Ogni pesata si aggiunge come nuova riga — non sovrascrive le precedenti. Usata anche dalla Contabilità Industriale per stimare la crescita per fascia d'età.
              </div>

              <Card>
                <Sezione label="Registra nuova pesata"/>
                <Field label="Data" value={nuovaPesata.data} onChange={v=>setNuovaPesata(p=>({...p,data:v}))} type="date"/>
                <Field label="Peso (kg)" value={nuovaPesata.peso} onChange={v=>setNuovaPesata(p=>({...p,peso:v}))} type="number"/>
                <Field label="Tipo rilevazione" value={nuovaPesata.tipo} onChange={v=>setNuovaPesata(p=>({...p,tipo:v}))}
                  options={["nascita","ingresso","vita","uscita_vivo","uscita_carcassa"]}/>
                <Field label="Note (facoltativo)" value={nuovaPesata.note} onChange={v=>setNuovaPesata(p=>({...p,note:v}))}/>
                <button onClick={salvaPesata} disabled={salvandoPesata}
                  style={{marginTop:8,background:C.primary,color:"#fff",border:"none",borderRadius:8,padding:"10px 16px",fontWeight:700,cursor:"pointer",width:"100%"}}>
                  {salvandoPesata?"Salvataggio...":"+ Registra pesata"}
                </button>
              </Card>

              {caricandoPesate?(
                <div style={{textAlign:"center",padding:20,color:C.muted}}>Caricamento...</div>
              ):!pesateAnimale||pesateAnimale.length===0?(
                <Card><div style={{padding:12,color:C.muted,fontSize:13}}>Nessuna pesata ancora registrata per questo animale.</div></Card>
              ):(
                <Card>
                  {pesateAnimale.map(p=>(
                    <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                      padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                      <div>
                        <strong>{p.peso_kg} kg</strong>
                        <div style={{fontSize:11,color:C.muted}}>{p.data_rilevazione} · {p.tipo_rilevazione}{p.stimato&&" (stimato)"}{p.note&&` · ${p.note}`}</div>
                      </div>
                      <button onClick={()=>eliminaPesata(p.id)}
                        style={{background:"none",border:`1px solid ${C.red}`,color:C.red,borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer"}}>
                        🗑️
                      </button>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Vista LISTA ──────────────────────────────────────────────────────────────
  return(
    <div style={{padding:"16px 16px 80px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div>
          <span style={{fontSize:20,fontWeight:800}}>Anagrafica</span>
          <button onClick={()=>setVistaRiproduttori(v=>!v)}
            style={{marginLeft:10,background:vistaRiproduttori?C.blue:C.card,
              color:vistaRiproduttori?"#FFF":C.blue,
              border:`1.5px solid ${C.blue}`,borderRadius:20,
              padding:"4px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
            ♂ Riproduttori
          </button>
        </div>
        <Btn label="Aggiungi" icon="+" onClick={()=>setForm({...empty})} small/>
      </div>

      {/* ── VISTA RIPRODUTTORI ──────────────────────────────────────── */}
      {vistaRiproduttori&&(()=>{
        const riprod=animali.filter(a=>a.riproduttore&&a.stato==="attivo");
        const maschiRiprod=riprod.filter(a=>a.sesso==="M").length;
        const femmineRiprod=riprod.filter(a=>a.sesso==="F").length;
        const perSpecie=["bovino","suino","ovino"].map(sp=>({
          specie:sp,
          lista:riprod.filter(a=>a.specie===sp),
        })).filter(g=>g.lista.length>0);
        return(
          <div style={{marginBottom:16}}>
            <div style={{background:C.blue+"12",border:`1px solid ${C.blue}33`,
              borderRadius:12,padding:"10px 14px",marginBottom:12,fontSize:13}}>
              <strong>{riprod.length}</strong> riproduttori attivi
              {maschiRiprod>0&&<span> · ♂ {maschiRiprod} maschi</span>}
              {femmineRiprod>0&&<span> · ♀ {femmineRiprod} femmine</span>}
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>
                Per aggiungere: apri la scheda dell'animale → ✏️ Modifica → attiva il toggle
              </div>
            </div>
            {perSpecie.length===0?(
              <div style={{textAlign:"center",padding:32,color:C.muted}}>
                <div style={{fontSize:40,marginBottom:8}}>♂</div>
                <div>Nessun riproduttore registrato</div>
                <div style={{fontSize:13,marginTop:8}}>
                  Apri la scheda di un maschio → ✏️ Modifica → attiva "♂ Riproduttore"
                </div>
              </div>
            ):perSpecie.map(({specie,lista})=>(
              <div key={specie} style={{marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:800,color:C.muted,
                  textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>
                  {specieIcon(specie)} {specieLabel(specie)} · {lista.length} maschi
                </div>
                {lista.map(a=>{
                  const nFigli=animali.filter(x=>x.padre_id===a.id).length;
                  const eta=a.nascita?Math.floor((new Date()-new Date(a.nascita))/365.25/86400000):null;
                  return(
                    <div key={a.id}
                      style={{background:C.card,borderRadius:14,padding:12,marginBottom:8,
                        border:`1.5px solid ${C.blue}44`,borderLeft:`4px solid ${C.blue}`,
                        cursor:"pointer"}}
                      onClick={()=>setDettaglio(a)}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <div style={{fontWeight:800,fontSize:15}}>{a.nome||a.bdn}</div>
                          <div style={{fontSize:12,color:C.muted}}>
                            {a.bdn} · {a.razza_calcolata||a.razza||"—"}
                          </div>
                          <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                            <Badge label={a.razza_calcolata||a.razza||"—"} color={specieColor(a.specie)}/>
                            <Badge label={a.sesso==="M"?"♂ M":"♀ F"}
                              color={a.sesso==="M"?C.blue:C.suini}/>
                            {eta&&<Badge label={`${eta} anni`} color={C.muted}/>}
                            {nFigli>0&&<Badge label={`${nFigli} figli reg.`} color={C.green}/>}
                          </div>
                        </div>
                        <div style={{textAlign:"right",fontSize:12,color:C.muted}}>
                          {a.nascita&&<div>🎂 {a.nascita}</div>}
                          <div style={{marginTop:4}}>
                            <span style={{
                              background:(a.sesso==="M"?C.blue:C.suini)+"20",
                              color:a.sesso==="M"?C.blue:C.suini,
                              borderRadius:8,padding:"3px 8px",fontSize:11,fontWeight:700}}>
                              {a.sesso==="M"?"♂ Riproduttore":"♀ Riproduttrice"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })()}
      {/* Barra di ricerca */}
      <div style={{position:"relative",marginBottom:12}}>
        <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",
          fontSize:18,color:C.muted,pointerEvents:"none"}}>🔍</span>
        <input
          type="text"
          value={cerca}
          onChange={e=>setCerca(e.target.value)}
          placeholder="Cerca per BDN, ultime 4 cifre o nome..."
          style={{...{width:"100%",boxSizing:"border-box",border:`2px solid ${cerca?C.primary:C.border}`,
            borderRadius:12,padding:"11px 40px 11px 42px",fontSize:15,
            background:C.card,color:C.text,outline:"none",
            boxShadow:cerca?`0 0 0 3px ${C.primary}22`:"none",
            transition:"border-color 0.2s, box-shadow 0.2s"}}}
        />
        {cerca&&(
          <button onClick={()=>setCerca("")}
            style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
              background:"none",border:"none",cursor:"pointer",fontSize:18,color:C.muted,
              padding:4}}>✕</button>
        )}
      </div>
      {/* Contatore risultati */}
      {cerca&&(
        <div style={{fontSize:13,color:lista.length>0?C.green:C.red,
          fontWeight:600,marginBottom:8,padding:"4px 8px",
          background:lista.length>0?C.green+"12":C.red+"12",
          borderRadius:8,display:"inline-block"}}>
          {lista.length>0?`✓ ${lista.length} animale/i trovato/i`:"Nessun animale trovato"}
        </div>
      )}
      <div style={{display:"flex",gap:8,marginBottom:8,overflowX:"auto",paddingBottom:4}}>
        {["tutti","bovino","suino","ovino"].map(f=>(
          <button key={f} onClick={()=>setFiltro(f)}
            style={{background:filtro===f?C.primary:C.card,
              color:filtro===f?"#FFF":C.muted,
              border:`1.5px solid ${filtro===f?C.primary:C.border}`,
              borderRadius:20,padding:"5px 14px",fontSize:13,fontWeight:600,
              cursor:"pointer",whiteSpace:"nowrap"}}>
            {f==="tutti"?"Tutti":specieIcon(f)+" "+specieLabel(f)}
          </button>
        ))}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:12,overflowX:"auto",paddingBottom:4}}>
        {[
          {v:"attivi",l:"✅ Attivi",col:C.green},
          {v:"usciti",l:"📤 Usciti",col:C.red},
          {v:"tutti",l:"Tutti",col:C.primary},
        ].map(x=>(
          <button key={x.v} onClick={()=>setFiltroStato(x.v)}
            style={{background:filtroStato===x.v?x.col:C.card,
              color:filtroStato===x.v?"#FFF":C.muted,
              border:`1.5px solid ${filtroStato===x.v?x.col:C.border}`,
              borderRadius:20,padding:"5px 14px",fontSize:12,fontWeight:600,
              cursor:"pointer",whiteSpace:"nowrap"}}>
            {x.l}
          </button>
        ))}
      </div>
      {loading?<Spinner/>:lista.length===0?(
        <div style={{textAlign:"center",padding:40,color:C.muted}}>
          <div style={{fontSize:48,marginBottom:8}}>🐄</div>
          <div>Nessun animale registrato.</div>
          <div style={{marginTop:8}}>Tocca "Aggiungi" per iniziare!</div>
        </div>
      ):lista.map(a=>(
        <Card key={a.id} style={{borderLeft:`4px solid ${specieColor(a.specie)}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div style={{display:"flex",gap:10,alignItems:"center",flex:1}}>
              <div style={{background:specieColor(a.specie)+"20",borderRadius:12,padding:10,fontSize:26,flexShrink:0}}>
                {specieIcon(a.specie)}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:800,fontSize:16}}>{a.nome||a.bdn||"—"}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:2}}>
                  {a.nome&&a.bdn?a.bdn+" · ":""}{a.razza_calcolata||a.razza||"—"}
                </div>
                <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                  <Badge label={specieLabel(a.specie)} color={specieColor(a.specie)}/>
                  {a.categoria&&<Badge label={a.categoria} color={C.muted}/>}
                  <Badge label={a.sesso==="M"?"♂ M":"♀ F"} color={a.sesso==="M"?C.blue:"#B5547A"}/>
                  {a.stato!=="attivo"&&<Badge label={a.stato.toUpperCase()} color={C.red}/>}
                  {a.riproduttore&&<Badge
                    label={a.sesso==="M"?"♂ Riproduttore":"♀ Riproduttrice"}
                    color={a.sesso==="M"?C.blue:C.suini}/>}
                  {a.provenienza==="Acquistato"&&!a.prezzo_acquisto&&
                    <Badge label="⚠️ Manca costo acquisto" color={C.red}/>}
                </div>
              </div>
            </div>
            <div style={{fontSize:12,color:C.muted,textAlign:"right",flexShrink:0}}>
              {a.nascita&&<div>🎂 {a.nascita}</div>}
              {a.data_ingresso&&<div>📥 {a.data_ingresso}</div>}
              {a.peso_attuale&&<div>⚖️ {a.peso_attuale}kg</div>}
            </div>
          </div>
          {(a.origine||a.prezzo_acquisto||a.madre_id||totalePerAnimale(a.id)>0||(a.riproduttore&&residuiTuttiRiproduttori.has(a.id)))&&(
            <div style={{display:"flex",gap:12,fontSize:12,color:C.muted,
              padding:"6px 0",borderTop:`1px solid ${C.border}`,marginBottom:8,flexWrap:"wrap"}}>
              {a.origine&&<span>🏠 {a.origine}</span>}
              {a.prezzo_acquisto&&<span>💰 Acquisto: €{a.prezzo_acquisto}</span>}
              {(!a.prezzo_acquisto&&totalePerAnimale(a.id)>0)&&
                <span>🌱 Costo nascita: €{totalePerAnimale(a.id).toFixed(0)}</span>}
              {a.riproduttore&&residuiTuttiRiproduttori.has(a.id)&&
                <span style={{fontWeight:700}}>🧮 Costo netto (riproduttore, dopo scarico sui figli): €{residuiTuttiRiproduttori.get(a.id).toFixed(0)}</span>}
              {a.data_registrazione_bdn&&
                <span>🏷️ BDN: {a.data_registrazione_bdn}</span>}
              {a.madre_id&&<span>🧬 pedigree ✓</span>}
            </div>
          )}
          <button onClick={()=>setDettaglio(a)}
            style={{width:"100%",background:specieColor(a.specie),color:"#FFF",
              border:"none",borderRadius:10,padding:"9px 0",fontSize:14,
              fontWeight:700,cursor:"pointer",display:"flex",
              alignItems:"center",justifyContent:"center",gap:8}}>
            <span>📋</span> Apri scheda completa
          </button>
        </Card>
      ))}
    </div>
  );
}

// Helper riga info
function Row({label,val}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",
      borderBottom:`1px solid ${C.border}`,fontSize:14}}>
      <span style={{color:C.muted,fontSize:13}}>{label}</span>
      <span style={{fontWeight:600,textAlign:"right",maxWidth:"60%"}}>{val||"—"}</span>
    </div>
  );
}
function AntenatatoMini({a,onClick}){
  return(
    <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:10,width:"100%",
      background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:"8px 12px",
      cursor:"pointer",textAlign:"left",marginBottom:6}}>
      <span style={{fontSize:20}}>{specieIcon(a.specie)}</span>
      <div>
        <div style={{fontWeight:700,fontSize:14}}>{a.nome||a.bdn||"—"}</div>
        <div style={{fontSize:12,color:C.muted}}>{a.razza_calcolata||a.razza||"—"} · {a.nascita||"—"}</div>
      </div>
      <span style={{marginLeft:"auto",color:C.muted}}>›</span>
    </button>
  );
}

// ─── SANITARIO ────────────────────────────────────────────────────────────────
function Sanitario({animali,eventi,loading,aggiungi,elimina}){
  const [form,setForm]=useState(null);
  const [saving,setSaving]=useState(false);
  const [cerca,setCerca]=useState("");
  const [modGruppo,setModGruppo]=useState(false);
  const [selezionati,setSelezionati]=useState([]);
  const [cercaGruppo,setCercaGruppo]=useState("");
  const [filtroSpecieGruppo,setFiltroSpecieGruppo]=useState("tutti"); // tutti|bovino|suino|ovino
  const [filtroSpecieSingolo,setFiltroSpecieSingolo]=useState("tutti");
  const [formGruppo,setFormGruppo]=useState(null);
  const [savingGruppo,setSavingGruppo]=useState(false);
  // Modalità lotto suini
  const [modLotto,setModLotto]=useState(false);
  const [lotti,setLotti]=useState([]);
  const [suiniLotto,setSuiniLotto]=useState([]);
  const [lottoSel,setLottoSel]=useState(null);
  const [unitaSel,setUnitaSel]=useState([]);
  const [cercaLotto,setCercaLotto]=useState("");
  const [cercaUnita,setCercaUnita]=useState("");
  const [savingLotto,setSavingLotto]=useState(false);
  const salva=async()=>{
    if(!form.animale_id||!form.descrizione)return;
    setSaving(true);
    await aggiungi({animale_id:parseInt(form.animale_id),tipo:form.tipo,
      descrizione:form.descrizione,data:form.data,veterinario:form.veterinario||null,
      prodotto:form.prodotto||null,scadenza:form.scadenza||null,
      costo:form.costo?parseFloat(form.costo):null});
    setSaving(false);setForm(null);
  };
  if(form)return(
    <div style={{padding:"16px 16px 80px"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={()=>setForm(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
        <span style={{fontSize:18,fontWeight:800}}>Nuovo evento sanitario</span>
      </div>
      {/* Filtri specie per singolo */}
      <div style={{fontSize:12,color:C.muted,marginBottom:4,marginTop:6,fontWeight:600}}>Filtra per specie:</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
        {[
          {v:"tutti",l:"🐾 Tutti",c:C.primary},
          {v:"bovino",l:"🐄 Bovini",c:"#8B6914"},
          {v:"suino",l:"🐷 Suini",c:"#B5547A"},
          {v:"ovino",l:"🐑 Ovini",c:"#4A7C59"},
        ].map(x=>(
          <button key={x.v} onClick={()=>setFiltroSpecieSingolo(x.v)}
            style={{background:filtroSpecieSingolo===x.v?x.c:C.card,
              color:filtroSpecieSingolo===x.v?"#FFF":C.muted,
              border:`1.5px solid ${filtroSpecieSingolo===x.v?x.c:C.border}`,
              borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
            {x.l}
          </button>
        ))}
      </div>
      <Field label="Animale" value={form.animale_id} onChange={v=>setForm(f=>({...f,animale_id:v}))}
        options={animali.filter(a=>a.stato==="attivo"&&(filtroSpecieSingolo==="tutti"||a.specie===filtroSpecieSingolo))
          .map(a=>({value:a.id,label:`${a.nome||a.bdn} (${specieLabel(a.specie)})`}))} required/>
      <Field label="Tipo" value={form.tipo} onChange={v=>setForm(f=>({...f,tipo:v}))}
        options={["vaccino","richiamo vaccinale","farmaco","antiparassitario","visita","intervento chirurgico","diagnostica","gravidanza","malattia","cura","altro"]}/>
      <Field label="Descrizione" value={form.descrizione} onChange={v=>setForm(f=>({...f,descrizione:v}))} required/>
      <Field label="Data" value={form.data} onChange={v=>setForm(f=>({...f,data:v}))} type="date"/>
      <Field label="Veterinario" value={form.veterinario} onChange={v=>setForm(f=>({...f,veterinario:v}))}/>
      <Field label="Prodotto / Farmaco" value={form.prodotto} onChange={v=>setForm(f=>({...f,prodotto:v}))}/>
      <Field label="Data scadenza richiamo" value={form.scadenza} onChange={v=>setForm(f=>({...f,scadenza:v}))} type="date"/>
      <Field label="Costo (€)" value={form.costo} onChange={v=>setForm(f=>({...f,costo:v}))} type="number"/>
      <div style={{display:"flex",gap:10,marginTop:8}}>
        <Btn label={saving?"...":"Salva"} icon="✓" onClick={salva} variant="success"/>
        <Btn label="Annulla" onClick={()=>setForm(null)} variant="ghost"/>
      </div>
    </div>
  );
  const tipoColor={
    vaccino:C.green,
    "richiamo vaccinale":"#7FA96B",
    farmaco:C.blue,
    antiparassitario:"#8B7FBA",
    visita:C.yellow,
    "intervento chirurgico":C.red,
    diagnostica:"#3B9EAA",
    gravidanza:"#D9628F",
    malattia:"#B8395C",
    cura:"#F5A623",
    altro:C.muted
  };

  // Carica lotti quando si apre la modal lotto
  const caricaLotti=async()=>{
    const[{data:lot},{data:sui}]=await Promise.all([
      supabase.from("lotti_suini").select("*").order("data_parto",{ascending:false}),
      supabase.from("suini_lotto").select("*").order("lotto_id").order("nr"),
    ]);
    setLotti(lot||[]);
    setSuiniLotto(sui||[]);
  };

  const salvaTrattamentoLotto=async()=>{
    if(!formGruppo?.descrizione||unitaSel.length===0) return;
    setSavingLotto(true);
    const costoPerCapo=formGruppo.costo?parseFloat(formGruppo.costo)/unitaSel.length:null;
    for(const uid of unitaSel){
      await supabase.from("eventi_sanitari").insert([{
        suini_lotto_id:uid,
        animale_id:null,
        tipo:formGruppo.tipo||"vaccino",
        descrizione:formGruppo.descrizione,
        data:formGruppo.data,
        veterinario:formGruppo.veterinario||null,
        prodotto:formGruppo.prodotto||null,
        scadenza:formGruppo.scadenza||null,
        costo:costoPerCapo,
      }]);
    }
    setSavingLotto(false);
    setModLotto(false);
    setLottoSel(null);
    setUnitaSel([]);
    setFormGruppo(null);
  };

  const salvaVaccinazioneGruppo=async()=>{
    if(!formGruppo.descrizione||selezionati.length===0) return;
    setSavingGruppo(true);
    for(const id of selezionati){
      await aggiungi({
        animale_id:id,
        tipo:formGruppo.tipo||"vaccino",
        descrizione:formGruppo.descrizione,
        data:formGruppo.data,
        veterinario:formGruppo.veterinario||null,
        prodotto:formGruppo.prodotto||null,
        scadenza:formGruppo.scadenza||null,
        costo:formGruppo.costo?parseFloat(formGruppo.costo)/selezionati.length:null,
      });
    }
    setSavingGruppo(false);
    setModGruppo(false);
    setSelezionati([]);
    setFormGruppo(null);
  };

  const toggleSelezionato=(id)=>{
    setSelezionati(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  };

  const animaliGruppo=animali.filter(a=>{
    if(a.stato!=="attivo") return false;
    if(filtroSpecieGruppo!=="tutti"&&a.specie!==filtroSpecieGruppo) return false;
    if(!cercaGruppo.trim()) return true;
    const q=cercaGruppo.trim().toLowerCase();
    return (a.bdn||"").toLowerCase().includes(q)||
           (a.nome||"").toLowerCase().includes(q)||
           (a.bdn||"").toLowerCase().endsWith(q);
  });

  const eventiFiltrati=eventi.filter(e=>{
    if(!cerca.trim()) return true;
    const q=cerca.trim().toLowerCase();
    const a=animali.find(x=>x.id===e.animale_id);
    const bdn=(a?.bdn||"").toLowerCase();
    const nome=(a?.nome||"").toLowerCase();
    const desc=(e.descrizione||"").toLowerCase();
    const prod=(e.prodotto||"").toLowerCase();
    const tipo=(e.tipo||"").toLowerCase();
    return bdn.includes(q)||nome.includes(q)||bdn.endsWith(q)||
           desc.includes(q)||prod.includes(q)||tipo.includes(q);
  });

  return(
    <div style={{padding:"16px 16px 80px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{fontSize:20,fontWeight:800}}>Registro Sanitario</span>
        <div style={{display:"flex",gap:8}}>
          <Btn label="🌾 Tutti" onClick={()=>{
              setModGruppo(true);
              setFiltroSpecieGruppo("tutti");
              setSelezionati(animali.filter(a=>a.stato==="attivo").map(a=>a.id));
              setFormGruppo({tipo:"vaccino",descrizione:"",data:today(),
                veterinario:"",prodotto:"",scadenza:"",costo:""});}}
            variant="outline" small/>
          <Btn label="💉 Gruppo" onClick={()=>{setModGruppo(true);setSelezionati([]);setFormGruppo({
            tipo:"vaccino",descrizione:"",data:today(),
            veterinario:"",prodotto:"",scadenza:"",costo:""});}}
            variant="outline" small/>
          <Btn label="🐷 Lotto suini" onClick={()=>{
            setModLotto(true);
            setUnitaSel([]);
            setLottoSel(null);
            setFormGruppo({tipo:"vaccino",descrizione:"",data:today(),
              veterinario:"",prodotto:"",scadenza:"",costo:""});
            caricaLotti();}}
            variant="outline" small/>
          <Btn label="+ Singolo" icon="+" onClick={()=>setForm({animale_id:"",tipo:"vaccino",
            descrizione:"",data:today(),veterinario:"",prodotto:"",scadenza:"",costo:""})} small/>
        </div>
      </div>

      {/* ─── BOX SCADENZE RICHIAMI ─────────────────────────────────────────── */}
      {(()=>{
        const oggi = new Date(today());
        const eventiConScadenza = eventi.filter(e => e.scadenza && new Date(e.scadenza) >= oggi);
        // Ordino per scadenza crescente
        eventiConScadenza.sort((a,b) => new Date(a.scadenza) - new Date(b.scadenza));
        // Prossimi 30 giorni
        const in30gg = new Date(oggi); in30gg.setDate(oggi.getDate()+30);
        const imminenti = eventiConScadenza.filter(e => new Date(e.scadenza) <= in30gg);
        // Scaduti
        const scaduti = eventi.filter(e => e.scadenza && new Date(e.scadenza) < oggi)
          .sort((a,b) => new Date(b.scadenza) - new Date(a.scadenza)).slice(0,5);

        if (imminenti.length === 0 && scaduti.length === 0) return null;

        return (
          <div style={{marginBottom:14}}>
            {scaduti.length>0&&(
              <Card style={{background:C.red+"12",border:`1.5px solid ${C.red}44`}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{fontSize:20}}>⚠️</span>
                  <span style={{fontWeight:700,color:C.red,fontSize:14}}>
                    Richiami SCADUTI ({scaduti.length})
                  </span>
                </div>
                {scaduti.map(e=>{
                  const a = animali.find(x=>x.id===e.animale_id);
                  const gg = Math.round((oggi - new Date(e.scadenza))/86400000);
                  return (
                    <div key={e.id} style={{fontSize:12,padding:"6px 0",
                      borderTop:`1px solid ${C.red}22`,
                      display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <b>{e.descrizione}</b>
                        <div style={{fontSize:11,color:C.muted}}>
                          {a?(a.nome||a.bdn):"Lotto"} · <span style={{color:C.red,fontWeight:700}}>scaduto da {gg} giorni</span>
                        </div>
                      </div>
                      <button onClick={()=>{
                        // Precompila form con dati dell'evento originale
                        setForm({
                          animale_id: e.animale_id||"",
                          tipo: e.tipo==="vaccino"?"richiamo vaccinale":e.tipo,
                          descrizione: `Richiamo: ${e.descrizione}`,
                          data: today(),
                          veterinario: e.veterinario||"",
                          prodotto: e.prodotto||"",
                          scadenza: "",
                          costo: e.costo||"",
                          _evento_originale_id: e.id,
                        });
                        setFiltroSpecieSingolo("tutti");
                      }}
                        style={{background:C.red,color:"#FFF",border:"none",
                          borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:600,
                          cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                        ✓ Registra
                      </button>
                    </div>
                  );
                })}
              </Card>
            )}
            {imminenti.length>0&&(
              <Card style={{background:C.yellow+"14",border:`1.5px solid ${C.yellow}55`}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{fontSize:20}}>⏰</span>
                  <span style={{fontWeight:700,color:C.yellow,fontSize:14}}>
                    Richiami in scadenza nei prossimi 30 giorni ({imminenti.length})
                  </span>
                </div>
                {imminenti.slice(0,6).map(e=>{
                  const a = animali.find(x=>x.id===e.animale_id);
                  const gg = Math.round((new Date(e.scadenza) - oggi)/86400000);
                  const urgColor = gg<=7 ? C.red : gg<=15 ? C.yellow : C.muted;
                  return (
                    <div key={e.id} style={{fontSize:12,padding:"6px 0",
                      borderTop:`1px solid ${C.yellow}33`,
                      display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <b>{e.descrizione}</b>
                        <div style={{fontSize:11,color:C.muted}}>
                          {a?(a.nome||a.bdn):"Lotto"} · <span style={{color:urgColor,fontWeight:700}}>
                            tra {gg} {gg===1?"giorno":"giorni"} ({e.scadenza})
                          </span>
                        </div>
                      </div>
                      <button onClick={()=>{
                        setForm({
                          animale_id: e.animale_id||"",
                          tipo: e.tipo==="vaccino"?"richiamo vaccinale":e.tipo,
                          descrizione: `Richiamo: ${e.descrizione}`,
                          data: today(),
                          veterinario: e.veterinario||"",
                          prodotto: e.prodotto||"",
                          scadenza: "",
                          costo: e.costo||"",
                          _evento_originale_id: e.id,
                        });
                        setFiltroSpecieSingolo("tutti");
                      }}
                        style={{background:urgColor,color:"#FFF",border:"none",
                          borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:600,
                          cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                        ✓ Registra
                      </button>
                    </div>
                  );
                })}
                {imminenti.length>6&&(
                  <div style={{fontSize:11,color:C.muted,marginTop:6,fontStyle:"italic"}}>
                    ... e altri {imminenti.length-6} richiami
                  </div>
                )}
              </Card>
            )}
          </div>
        );
      })()}

      {/* MODAL TRATTAMENTO SU LOTTO SUINI */}
      {modLotto&&formGruppo&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,
          background:"rgba(0,0,0,0.6)",zIndex:200,overflowY:"auto"}}>
          <div style={{background:C.bg,borderRadius:"20px 20px 0 0",
            position:"absolute",bottom:0,left:0,right:0,maxHeight:"95vh",
            overflowY:"auto",padding:"20px 16px 40px"}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:16}}>
              <span style={{fontSize:18,fontWeight:800}}>🐷 Trattamento su lotto</span>
              <button onClick={()=>{setModLotto(false);setLottoSel(null);setUnitaSel([]);}}
                style={{background:C.border,border:"none",borderRadius:20,
                  padding:"6px 12px",cursor:"pointer",fontSize:13}}>✕ Chiudi</button>
            </div>

            {/* STEP 1: Scegli lotto */}
            {!lottoSel?(
              <div style={{background:C.card,borderRadius:14,padding:14,marginBottom:12,
                border:`1px solid ${C.border}`}}>
                <div style={{fontSize:13,fontWeight:700,color:C.primary,marginBottom:8}}>
                  STEP 1 — Seleziona il lotto
                </div>
                <div style={{position:"relative",marginBottom:10}}>
                  <input type="text" value={cercaLotto} onChange={e=>setCercaLotto(e.target.value)}
                    placeholder="Cerca per codice lotto (es. 2304CC19)..."
                    style={{...{width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,
                      borderRadius:10,padding:"8px 10px",fontSize:14,background:"#FAFAF8",outline:"none"}}}/>
                </div>
                {lotti.filter(l=>{
                  if(!cercaLotto.trim()) return true;
                  return (l.codice_lotto||l.codice||"").toLowerCase().includes(cercaLotto.toLowerCase());
                }).map(l=>{
                  const us=suiniLotto.filter(s=>s.lotto_id===l.id&&s.vivo!==false&&s.stato==="attivo");
                  return(
                    <div key={l.id} onClick={()=>{setLottoSel(l);setUnitaSel(us.map(u=>u.id));}}
                      style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                        padding:"10px 12px",borderRadius:10,marginBottom:6,cursor:"pointer",
                        background:C.bg,border:`1.5px solid ${C.border}`}}>
                      <div>
                        <div style={{fontWeight:800,fontSize:15,fontFamily:"monospace",
                          color:C.primary,letterSpacing:1}}>{l.codice_lotto||l.codice}</div>
                        <div style={{fontSize:12,color:C.muted}}>Parto {l.data_parto}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontWeight:700,color:C.green}}>{us.length} vivi</div>
                        <div style={{fontSize:11,color:C.muted}}>tocca per selezionare</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ):(
              <>
                {/* Lotto selezionato: scelta unità */}
                <div style={{background:C.card,borderRadius:14,padding:14,marginBottom:12,
                  border:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:C.primary}}>
                        STEP 1 — Lotto selezionato
                      </div>
                      <div style={{fontWeight:900,fontSize:18,fontFamily:"monospace",
                        color:C.suini,letterSpacing:1}}>{lottoSel.codice_lotto||lottoSel.codice}</div>
                    </div>
                    <button onClick={()=>{setLottoSel(null);setUnitaSel([]);}}
                      style={{background:C.border,border:"none",borderRadius:8,
                        padding:"5px 10px",cursor:"pointer",fontSize:12}}>Cambia</button>
                  </div>
                  <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:8}}>
                    Seleziona le unità da trattare ({unitaSel.length} selezionate)
                  </div>
                  <div style={{position:"relative",marginBottom:8}}>
                    <input type="text" value={cercaUnita} onChange={e=>setCercaUnita(e.target.value)}
                      placeholder="Filtra per tatuaggio..." style={{...{width:"100%",
                        boxSizing:"border-box",border:`1.5px solid ${C.border}`,borderRadius:10,
                        padding:"7px 10px",fontSize:13,background:"#FAFAF8",outline:"none"}}}/>
                  </div>
                  <button onClick={()=>{
                    const tutti=suiniLotto.filter(s=>s.lotto_id===lottoSel.id&&s.vivo!==false&&s.stato==="attivo");
                    setUnitaSel(unitaSel.length===tutti.length?[]:tutti.map(u=>u.id));
                  }} style={{background:C.primary+"15",border:`1px solid ${C.primary}33`,
                    borderRadius:8,padding:"4px 12px",fontSize:12,fontWeight:600,
                    color:C.primary,cursor:"pointer",marginBottom:10}}>
                    {unitaSel.length===suiniLotto.filter(s=>s.lotto_id===lottoSel.id&&s.vivo!==false&&s.stato==="attivo").length
                      ?"☐ Deseleziona tutte":"☑ Seleziona tutte le vive"}
                  </button>
                  <div style={{maxHeight:200,overflowY:"auto"}}>
                    {suiniLotto.filter(s=>{
                      if(s.lotto_id!==lottoSel.id) return false;
                      if(s.vivo===false||s.stato!=="attivo") return false;
                      const cod=(s.codice_completo||`${lottoSel.codice_lotto}${String(s.nr).padStart(2,"0")}`).toLowerCase();
                      return !cercaUnita.trim()||cod.includes(cercaUnita.toLowerCase());
                    }).map(u=>{
                      const sel=unitaSel.includes(u.id);
                      const cod=u.codice_completo||`${lottoSel.codice_lotto}${String(u.nr).padStart(2,"0")}`;
                      return(
                        <div key={u.id} onClick={()=>setUnitaSel(prev=>prev.includes(u.id)?prev.filter(x=>x!==u.id):[...prev,u.id])}
                          style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",
                            borderRadius:10,marginBottom:4,cursor:"pointer",
                            background:sel?"#E3F2FD":C.card,
                            border:`1.5px solid ${sel?C.blue:C.border}`}}>
                          <div style={{width:20,height:20,borderRadius:5,flexShrink:0,
                            background:sel?C.blue:"transparent",
                            border:`2px solid ${sel?C.blue:C.border}`,
                            display:"flex",alignItems:"center",justifyContent:"center"}}>
                            {sel&&<span style={{color:"#FFF",fontSize:13,fontWeight:800}}>✓</span>}
                          </div>
                          <div>
                            <div style={{fontWeight:700,fontSize:13,fontFamily:"monospace"}}>{cod}</div>
                            {u.sesso&&<span style={{fontSize:11,color:C.muted}}>{u.sesso==="M"?"♂":"♀"}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* STEP 2: Dati trattamento */}
                <div style={{background:C.card,borderRadius:14,padding:14,
                  border:`1px solid ${C.border}`,marginBottom:12}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.primary,marginBottom:12}}>
                    STEP 2 — Dati del trattamento
                  </div>
                  {[
                    ["Tipo",formGruppo.tipo,v=>setFormGruppo(f=>({...f,tipo:v})),
                      ["vaccino","richiamo vaccinale","farmaco","antiparassitario","visita","intervento chirurgico","diagnostica","gravidanza","malattia","cura","altro"]],
                    ["Descrizione *",formGruppo.descrizione,v=>setFormGruppo(f=>({...f,descrizione:v})),null],
                    ["Data",formGruppo.data,v=>setFormGruppo(f=>({...f,data:v})),"date"],
                    ["Prodotto",formGruppo.prodotto,v=>setFormGruppo(f=>({...f,prodotto:v})),null],
                    ["Veterinario",formGruppo.veterinario,v=>setFormGruppo(f=>({...f,veterinario:v})),null],
                    ["Costo totale (€)",formGruppo.costo,v=>setFormGruppo(f=>({...f,costo:v})),"number"],
                  ].map(([label,val,onChange,opts])=>(
                    <div key={label} style={{marginBottom:10}}>
                      <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:3}}>{label}</div>
                      {Array.isArray(opts)
                        ?<select value={val||""} onChange={e=>onChange(e.target.value)}
                            style={{width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,
                              borderRadius:10,padding:"9px 12px",fontSize:14,background:"#FAFAF8",outline:"none"}}>
                            {opts.map(o=><option key={o} value={o}>{o}</option>)}
                          </select>
                        :<input type={opts||"text"} value={val||""} onChange={e=>onChange(e.target.value)}
                            style={{width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,
                              borderRadius:10,padding:"9px 12px",fontSize:14,background:"#FAFAF8",outline:"none"}}/>
                      }
                    </div>
                  ))}
                  {formGruppo.costo&&unitaSel.length>0&&(
                    <div style={{background:C.blue+"12",borderRadius:8,padding:"6px 10px",fontSize:12,color:C.blue}}>
                      €{(parseFloat(formGruppo.costo)/unitaSel.length).toFixed(2)} per unità · {unitaSel.length} selezionate
                    </div>
                  )}
                </div>

                <button onClick={salvaTrattamentoLotto}
                  disabled={savingLotto||unitaSel.length===0||!formGruppo.descrizione}
                  style={{width:"100%",background:unitaSel.length>0&&formGruppo.descrizione?C.suini:"#CCC",
                    color:"#FFF",border:"none",borderRadius:12,padding:"14px",
                    fontSize:16,fontWeight:700,cursor:"pointer"}}>
                  {savingLotto
                    ?`Salvataggio... (${unitaSel.length} unità)`
                    :unitaSel.length===0?"Seleziona almeno un'unità"
                    :`✓ Registra trattamento su ${unitaSel.length} unità`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL VACCINAZIONE DI GRUPPO */}
      {modGruppo&&formGruppo&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,
          background:"rgba(0,0,0,0.6)",zIndex:200,overflowY:"auto"}}>
          <div style={{background:C.bg,borderRadius:"20px 20px 0 0",
            position:"absolute",bottom:0,left:0,right:0,maxHeight:"95vh",
            overflowY:"auto",padding:"20px 16px 40px"}}>
            {/* Header */}
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:16}}>
              <span style={{fontSize:18,fontWeight:800}}>💉 Evento di gruppo</span>
              <button onClick={()=>{setModGruppo(false);setSelezionati([]);}}
                style={{background:C.border,border:"none",borderRadius:20,
                  padding:"6px 12px",cursor:"pointer",fontSize:13}}>✕ Chiudi</button>
            </div>

            {/* STEP 1: Seleziona animali */}
            <div style={{background:C.card,borderRadius:14,padding:14,marginBottom:12,
              border:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,fontWeight:700,color:C.primary,marginBottom:8}}>
                STEP 1 — Seleziona gli animali ({selezionati.length} selezionati)
              </div>
              {/* Filtro specie */}
              <div style={{fontSize:11,color:C.muted,marginBottom:4,fontWeight:600}}>Filtra per specie:</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                {[
                  {v:"tutti",l:"🐾 Tutti",c:C.primary},
                  {v:"bovino",l:"🐄 Bovini",c:"#8B6914"},
                  {v:"suino",l:"🐷 Suini",c:"#B5547A"},
                  {v:"ovino",l:"🐑 Ovini",c:"#4A7C59"},
                ].map(x=>{
                  const n=x.v==="tutti"?animali.filter(a=>a.stato==="attivo").length
                    :animali.filter(a=>a.stato==="attivo"&&a.specie===x.v).length;
                  return (
                    <button key={x.v} onClick={()=>{
                        setFiltroSpecieGruppo(x.v);
                        setSelezionati([]); // reset selezione quando cambio specie
                      }}
                      style={{background:filtroSpecieGruppo===x.v?x.c:C.card,
                        color:filtroSpecieGruppo===x.v?"#FFF":C.muted,
                        border:`1.5px solid ${filtroSpecieGruppo===x.v?x.c:C.border}`,
                        borderRadius:20,padding:"4px 11px",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                      {x.l} ({n})
                    </button>
                  );
                })}
              </div>
              {/* Cerca */}
              <div style={{position:"relative",marginBottom:10}}>
                <span style={{position:"absolute",left:10,top:"50%",
                  transform:"translateY(-50%)",fontSize:16,color:C.muted}}>🔍</span>
                <input type="text" value={cercaGruppo}
                  onChange={e=>setCercaGruppo(e.target.value)}
                  placeholder="Filtra per BDN o nome..."
                  style={{width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,
                    borderRadius:10,padding:"8px 10px 8px 34px",fontSize:14,
                    background:"#FAFAF8",outline:"none"}}/>
              </div>
              {/* Seleziona tutti */}
              <button onClick={()=>{
                  if(selezionati.length===animaliGruppo.length)
                    setSelezionati([]);
                  else
                    setSelezionati(animaliGruppo.map(a=>a.id));
                }}
                style={{background:C.primary+"15",border:`1px solid ${C.primary}33`,
                  borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:600,
                  color:C.primary,cursor:"pointer",marginBottom:10}}>
                {selezionati.length===animaliGruppo.length?"☐ Deseleziona tutti":"☑ Seleziona tutti"}
              </button>
              {/* Lista animali */}
              <div style={{maxHeight:220,overflowY:"auto"}}>
                {animaliGruppo.map(a=>{
                  const sel=selezionati.includes(a.id);
                  return(
                    <div key={a.id} onClick={()=>toggleSelezionato(a.id)}
                      style={{display:"flex",alignItems:"center",gap:10,
                        padding:"8px 10px",borderRadius:10,marginBottom:4,cursor:"pointer",
                        background:sel?C.green+"20":C.card,
                        border:`1.5px solid ${sel?C.green:C.border}`}}>
                      <div style={{width:22,height:22,borderRadius:6,
                        background:sel?C.green:"transparent",
                        border:`2px solid ${sel?C.green:C.border}`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        flexShrink:0}}>
                        {sel&&<span style={{color:"#FFF",fontSize:14,fontWeight:800}}>✓</span>}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:14}}>
                          {a.nome||a.bdn}
                        </div>
                        <div style={{fontSize:11,color:C.muted}}>
                          {a.bdn} · {a.razza_calcolata||a.razza||"—"} · {specieIcon(a.specie)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* STEP 2: Dati evento */}
            <div style={{background:C.card,borderRadius:14,padding:14,
              border:`1px solid ${C.border}`,marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:C.primary,marginBottom:12}}>
                STEP 2 — Dati dell'evento (vale per tutti gli animali selezionati)
              </div>
              <Field label="Tipo evento" value={formGruppo.tipo}
                onChange={v=>setFormGruppo(f=>({...f,tipo:v}))}
                options={["vaccino","richiamo vaccinale","farmaco","antiparassitario","visita","intervento chirurgico","diagnostica","gravidanza","malattia","cura","altro"]}/>
              <Field label="Descrizione *" value={formGruppo.descrizione}
                onChange={v=>setFormGruppo(f=>({...f,descrizione:v}))}
                placeholder="Es. Vaccino IBR, Antiparassitario..." required/>
              <Field label="Data" value={formGruppo.data}
                onChange={v=>setFormGruppo(f=>({...f,data:v}))} type="date"/>
              <Field label="Prodotto / Farmaco" value={formGruppo.prodotto}
                onChange={v=>setFormGruppo(f=>({...f,prodotto:v}))}
                placeholder="Es. Bovilis IBR"/>
              <Field label="Veterinario" value={formGruppo.veterinario}
                onChange={v=>setFormGruppo(f=>({...f,veterinario:v}))}/>
              <Field label="Data scadenza richiamo" value={formGruppo.scadenza}
                onChange={v=>setFormGruppo(f=>({...f,scadenza:v}))} type="date"/>
              <Field label="Costo totale (€) — suddiviso automaticamente"
                value={formGruppo.costo}
                onChange={v=>setFormGruppo(f=>({...f,costo:v}))} type="number"
                placeholder="Verrà diviso per il numero di animali"/>
              {formGruppo.costo&&selezionati.length>0&&(
                <div style={{background:C.blue+"12",borderRadius:8,padding:"6px 10px",
                  fontSize:12,color:C.blue,marginBottom:8}}>
                  €{(parseFloat(formGruppo.costo)/selezionati.length).toFixed(2)} per animale
                  · {selezionati.length} animali
                </div>
              )}
            </div>

            {/* Pulsante conferma */}
            <button onClick={salvaVaccinazioneGruppo}
              disabled={savingGruppo||selezionati.length===0||!formGruppo.descrizione}
              style={{width:"100%",background:selezionati.length>0&&formGruppo.descrizione
                ?C.green:"#CCC",
                color:"#FFF",border:"none",borderRadius:12,padding:"14px",
                fontSize:16,fontWeight:700,cursor:selezionati.length>0?"pointer":"default"}}>
              {savingGruppo
                ?`Salvataggio... (${selezionati.length} animali)`
                :selezionati.length===0
                  ?"Seleziona almeno un animale"
                  :`✓ Registra evento su ${selezionati.length} animali`}
            </button>
          </div>
        </div>
      )}
      {/* Barra ricerca */}
      <div style={{position:"relative",marginBottom:12}}>
        <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",
          fontSize:18,color:C.muted,pointerEvents:"none"}}>🔍</span>
        <input type="text" value={cerca} onChange={e=>setCerca(e.target.value)}
          placeholder="Cerca per BDN, ultime 4 cifre, nome o tipo evento..."
          style={{width:"100%",boxSizing:"border-box",
            border:`2px solid ${cerca?C.primary:C.border}`,borderRadius:12,
            padding:"11px 40px 11px 42px",fontSize:15,background:C.card,
            color:C.text,outline:"none",
            boxShadow:cerca?`0 0 0 3px ${C.primary}22`:"none"}}/>
        {cerca&&(
          <button onClick={()=>setCerca("")}
            style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
              background:"none",border:"none",cursor:"pointer",fontSize:18,color:C.muted}}>✕</button>
        )}
      </div>
      {cerca&&(
        <div style={{fontSize:13,color:eventiFiltrati.length>0?C.green:C.red,
          fontWeight:600,marginBottom:8,padding:"4px 8px",
          background:eventiFiltrati.length>0?C.green+"12":C.red+"12",
          borderRadius:8,display:"inline-block"}}>
          {eventiFiltrati.length>0?`✓ ${eventiFiltrati.length} evento/i trovato/i`:"Nessun evento trovato"}
        </div>
      )}
      {loading?<Spinner/>:eventiFiltrati.length===0&&!cerca?(
        <div style={{textAlign:"center",padding:40,color:C.muted}}>Nessun evento registrato.</div>
      ):eventiFiltrati.length===0?(
        <div style={{textAlign:"center",padding:32,color:C.muted}}>
          <div style={{fontSize:32,marginBottom:8}}>🔍</div>
          <div>Nessun risultato per "{cerca}"</div>
        </div>
      ):eventiFiltrati.map(e=>{
        const a=e.animale_id?animali.find(x=>x.id===e.animale_id):null;
        const col=tipoColor[e.tipo]||C.muted;
        // Per eventi su lotto suini, componiamo un label dalla nota
        const isLotto=!e.animale_id&&e.suini_lotto_id;
        return(
          <Card key={e.id}>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <div>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                  <Badge label={e.tipo?.toUpperCase()} color={col}/>
                  {a&&<span style={{fontSize:13,color:specieColor(a.specie),fontWeight:600}}>{a.nome||a.bdn}</span>}
                {isLotto&&<span style={{fontSize:13,color:C.suini,fontWeight:600}}>🐷 Lotto (ID unità: {e.suini_lotto_id})</span>}
                </div>
                <div style={{fontWeight:600,fontSize:15}}>{e.descrizione}</div>
                {e.prodotto&&<div style={{fontSize:13,color:C.muted}}>💊 {e.prodotto}</div>}
                {e.veterinario&&<div style={{fontSize:13,color:C.muted}}>👨‍⚕️ {e.veterinario}</div>}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:13,color:C.muted}}>{e.data}</div>
                {e.costo>0&&<div style={{fontWeight:700,color:C.accent}}>€{e.costo}</div>}
                {e.scadenza&&<div style={{fontSize:12,background:C.yellow+"22",color:C.yellow,
                  borderRadius:8,padding:"2px 8px",marginTop:4}}>⏰ {e.scadenza}</div>}
                <button onClick={async()=>{
                    if(!window.confirm("Eliminare questo evento sanitario?"))return;
                    const {error} = await elimina(e.id);
                    if(error) alert(`⚠️ Errore nell'eliminazione:\n\n${error.message}`);
                  }}
                  style={{background:"none",border:"none",cursor:"pointer",fontSize:16,
                    marginTop:6,opacity:0.6}}>
                  🗑️
                </button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── ALIMENTAZIONE ────────────────────────────────────────────────────────────
function Alimentazione({voci,loading,aggiungi,animali}){
  const [form,setForm]=useState(null);
  const [saving,setSaving]=useState(false);
  const [modGruppo,setModGruppo]=useState(false);
  const [selezionati,setSelezionati]=useState([]);
  const [cercaGruppo,setCercaGruppo]=useState("");
  const [filtroSpecieGruppo,setFiltroSpecieGruppo]=useState("tutti"); // tutti|bovino|suino|ovino
  const [filtroSpecieSingolo,setFiltroSpecieSingolo]=useState("tutti");
  const [formGruppo,setFormGruppo]=useState(null);
  const [savingGruppo,setSavingGruppo]=useState(false);
  // Modalità lotto suini
  const [modLotto,setModLotto]=useState(false);
  const [lotti,setLotti]=useState([]);
  const [suiniLotto,setSuiniLotto]=useState([]);
  const [lottoSel,setLottoSel]=useState(null);
  const [unitaSel,setUnitaSel]=useState([]);
  const [cercaLotto,setCercaLotto]=useState("");
  const [cercaUnita,setCercaUnita]=useState("");
  const [savingLotto,setSavingLotto]=useState(false);

  const salvaRazioneGruppo=async()=>{
    if(!formGruppo.tipo||!formGruppo.quantita||selezionati.length===0) return;
    setSavingGruppo(true);
    const qtaPerCapo=parseFloat(formGruppo.quantita);
    const costoPerCapo=formGruppo.costo?parseFloat(formGruppo.costo)/selezionati.length:null;
    for(const id of selezionati){
      await aggiungi({
        specie:null,
        tipo:formGruppo.tipo,
        quantita:qtaPerCapo,
        unita:formGruppo.unita||"kg",
        costo:costoPerCapo,
        data:formGruppo.data,
        note:formGruppo.note?`Razione di gruppo - ${formGruppo.note}`:"Razione di gruppo",
        animale_id:id,
      });
    }
    setSavingGruppo(false);
    setModGruppo(false);
    setSelezionati([]);
    setFormGruppo(null);
  };

  const toggleSel=(id)=>setSelezionati(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const animaliGruppo=(animali||[]).filter(a=>{
    if(a.stato!=="attivo") return false;
    if(!cercaGruppo.trim()) return true;
    const q=cercaGruppo.trim().toLowerCase();
    return (a.bdn||"").toLowerCase().includes(q)||(a.nome||"").toLowerCase().includes(q)||(a.bdn||"").endsWith(q);
  });
  const salva=async()=>{
    if(!form.tipo||!form.quantita)return;
    setSaving(true);
    await aggiungi({specie:form.specie||null,tipo:form.tipo,quantita:parseFloat(form.quantita),
      unita:form.unita,costo:form.costo?parseFloat(form.costo):null,data:form.data,note:form.note||null});
    setSaving(false);setForm(null);
  };
  if(form)return(
    <div style={{padding:"16px 16px 80px"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={()=>setForm(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
        <span style={{fontSize:18,fontWeight:800}}>Nuova somministrazione</span>
      </div>
      <Field label="Data" value={form.data} onChange={v=>setForm(f=>({...f,data:v}))} type="date"/>
      <Field label="Specie" value={form.specie} onChange={v=>setForm(f=>({...f,specie:v}))}
        options={[{value:"",label:"Tutte"},"bovino","suino","ovino"]}/>
      <Field label="Tipo mangime / foraggio" value={form.tipo} onChange={v=>setForm(f=>({...f,tipo:v}))} required/>
      <Field label="Quantità" value={form.quantita} onChange={v=>setForm(f=>({...f,quantita:v}))} type="number" required/>
      <Field label="Unità" value={form.unita} onChange={v=>setForm(f=>({...f,unita:v}))} options={["kg","litri","balle","sacchi"]}/>
      <Field label="Costo (€)" value={form.costo} onChange={v=>setForm(f=>({...f,costo:v}))} type="number"/>
      <Field label="Note" value={form.note} onChange={v=>setForm(f=>({...f,note:v}))}/>
      <div style={{display:"flex",gap:10,marginTop:8}}>
        <Btn label={saving?"...":"Salva"} icon="✓" onClick={salva} variant="success"/>
        <Btn label="Annulla" onClick={()=>setForm(null)} variant="ghost"/>
      </div>
    </div>
  );
  const costoTotale=voci.reduce((s,e)=>s+(e.costo||0),0);
  return(
    <div style={{padding:"16px 16px 80px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <span style={{fontSize:20,fontWeight:800}}>Alimentazione</span>
        <Btn label="Aggiungi" icon="+" onClick={()=>setForm({data:today(),specie:"",tipo:"",quantita:"",unita:"kg",costo:"",note:""})} small/>
      </div>
      <Card style={{background:`linear-gradient(135deg,${C.primary}15,${C.accent}10)`}}>
        <div style={{fontSize:13,color:C.muted}}>Costo totale registrato</div>
        <div style={{fontSize:28,fontWeight:800,color:C.primary}}>€{costoTotale.toFixed(2)}</div>
      </Card>
      {loading?<Spinner/>:voci.map(e=>(
        <Card key={e.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:600,fontSize:15}}>{e.specie?specieIcon(e.specie):"🐾"} {e.tipo}</div>
              <div style={{fontSize:13,color:C.muted}}>{e.data}{e.specie?" · "+e.specie:""}</div>
              {e.note&&<div style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>{e.note}</div>}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontWeight:700,fontSize:16}}>{e.quantita} {e.unita}</div>
              {e.costo>0&&<div style={{color:C.accent,fontWeight:600}}>€{e.costo}</div>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── MAGAZZINO ────────────────────────────────────────────────────────────────
function Magazzino({scorte,loading,aggiungi,aggiorna}){
  const [form,setForm]=useState(null);
  const [saving,setSaving]=useState(false);
  const salva=async()=>{
    if(!form.nome)return;
    setSaving(true);
    const payload={nome:form.nome,categoria:form.categoria,quantita:parseFloat(form.quantita)||0,
      unita:form.unita,minimo:parseFloat(form.minimo)||0,costo:parseFloat(form.costo)||0,
      fornitore:form.fornitore||null};
    if(form.id)await aggiorna(form.id,payload);
    else await aggiungi(payload);
    setSaving(false);setForm(null);
  };
  const aggiornaQta=async(scorta,delta)=>{
    await aggiorna(scorta.id,{quantita:Math.max(0,scorta.quantita+delta)});
  };
  if(form)return(
    <div style={{padding:"16px 16px 80px"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={()=>setForm(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
        <span style={{fontSize:18,fontWeight:800}}>{form.id?"Modifica":"Nuova"} scorta</span>
      </div>
      <Field label="Nome prodotto" value={form.nome} onChange={v=>setForm(f=>({...f,nome:v}))} required/>
      <Field label="Categoria" value={form.categoria} onChange={v=>setForm(f=>({...f,categoria:v}))}
        options={["mangime","farmaco","igiene","attrezzatura","altro"]}/>
      <Field label="Quantità attuale" value={form.quantita} onChange={v=>setForm(f=>({...f,quantita:v}))} type="number"/>
      <Field label="Unità" value={form.unita} onChange={v=>setForm(f=>({...f,unita:v}))} options={["kg","litri","sacchi","balle","flaconi","pezzi"]}/>
      <Field label="Scorta minima" value={form.minimo} onChange={v=>setForm(f=>({...f,minimo:v}))} type="number"/>
      <Field label="Costo unitario (€)" value={form.costo} onChange={v=>setForm(f=>({...f,costo:v}))} type="number"/>
      <Field label="Fornitore" value={form.fornitore} onChange={v=>setForm(f=>({...f,fornitore:v}))}/>
      <div style={{display:"flex",gap:10,marginTop:8}}>
        <Btn label={saving?"...":"Salva"} icon="✓" onClick={salva} variant="success"/>
        <Btn label="Annulla" onClick={()=>setForm(null)} variant="ghost"/>
      </div>
    </div>
  );
  return(
    <div style={{padding:"16px 16px 80px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <span style={{fontSize:20,fontWeight:800}}>Magazzino</span>
        <Btn label="Aggiungi" icon="+" onClick={()=>setForm({nome:"",categoria:"mangime",quantita:"",unita:"kg",minimo:"",costo:"",fornitore:""})} small/>
      </div>
      {loading?<Spinner/>:scorte.map(m=>{
        const alert=m.quantita<=m.minimo;
        return(
          <Card key={m.id} style={{borderLeft:alert?`4px solid ${C.red}`:`4px solid ${C.green}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>{m.nome}</div>
                <Badge label={m.categoria} color={alert?C.red:C.green}/>
                {alert&&<Badge label="⚠ SCORTA BASSA" color={C.red}/>}
                {m.fornitore&&<div style={{fontSize:12,color:C.muted,marginTop:4}}>📦 {m.fornitore}</div>}
              </div>
              <button onClick={()=>setForm({...m})} style={{background:C.blue+"20",border:"none",borderRadius:8,padding:"6px 8px",cursor:"pointer"}}>✏️</button>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <button onClick={()=>aggiornaQta(m,-1)} style={{background:C.red+"20",border:"none",borderRadius:8,
                width:34,height:34,fontSize:20,cursor:"pointer",color:C.red,fontWeight:700}}>−</button>
              <div style={{textAlign:"center",flex:1}}>
                <div style={{fontSize:22,fontWeight:800,color:alert?C.red:C.text}}>{m.quantita}</div>
                <div style={{fontSize:12,color:C.muted}}>{m.unita} · min {m.minimo}</div>
              </div>
              <button onClick={()=>aggiornaQta(m,1)} style={{background:C.green+"20",border:"none",borderRadius:8,
                width:34,height:34,fontSize:20,cursor:"pointer",color:C.green,fontWeight:700}}>+</button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── REPORT ──────────────────────────────────────────────────────────────────
function Report({animali,eventi_sanitari,voci_alimentazione,eventiRiproduttivi}){
  const attivi=animali.filter(a=>a.stato==="attivo");
  const costoSan=eventi_sanitari.reduce((s,e)=>s+(e.costo||0),0);
  const costoAli=voci_alimentazione.reduce((s,e)=>s+(e.costo||0),0);

  // Classifica scrofe (stessa formula del report Excel KPI Selezione Genetica:
  // prolificità = nati vivi medi per parto = nati totali medi/parto × % nati vivi)
  const scrofe = animali
    .filter(a=>a.sesso==="F"&&a.specie==="suino")
    .map(a=>{
      const mieiParti=(eventiRiproduttivi||[])
        .filter(e=>e.animale_id===a.id&&e.tipo_evento==="parto");
      if(mieiParti.length===0) return null;
      const totVivi=mieiParti.reduce((s,p)=>s+(p.nati_vivi||0),0);
      const totMorti=mieiParti.reduce((s,p)=>s+(p.nati_morti||0),0);
      const totNati=totVivi+totMorti;
      return{
        id:a.id, bdn:a.bdn, nome:a.nome,
        n_parti:mieiParti.length,
        nati_medi_parto: Math.round(totNati/mieiParti.length*10)/10,
        pct_vivi: totNati>0?Math.round(totVivi/totNati*1000)/10:0,
        prolificita: Math.round(totVivi/mieiParti.length*10)/10,
      };
    }).filter(Boolean).sort((a,b)=>b.prolificita-a.prolificita);

  return(
    <div style={{padding:"16px 16px 80px"}}>
      <span style={{fontSize:20,fontWeight:800,display:"block",marginBottom:16}}>Report</span>
      <Card>
        <div style={{fontSize:14,fontWeight:700,color:C.muted,marginBottom:12}}>CONSISTENZA</div>
        {["bovino","suino","ovino"].map(s=>{
          const n=attivi.filter(a=>a.specie===s).length;
          return(
            <div key={s} style={{display:"flex",justifyContent:"space-between",
              padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
              <span>{specieIcon(s)} {specieLabel(s)}</span>
              <span style={{fontWeight:700,color:specieColor(s)}}>{n} capi</span>
            </div>
          );
        })}
        <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",fontWeight:700}}>
          <span>Totale attivi</span>
          <span style={{color:C.primary}}>{attivi.length} capi</span>
        </div>
      </Card>
      {scrofe.length>0&&(
        <Card>
          <div style={{fontSize:14,fontWeight:700,color:C.muted,marginBottom:12}}>
            🏆 CLASSIFICA SCROFE (per prolificità)
          </div>
          {scrofe.map((s,i)=>(
            <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,
              padding:"8px 0",borderBottom:i<scrofe.length-1?`1px solid ${C.border}`:"none"}}>
              <span style={{fontWeight:800,color:i===0?C.yellow:C.muted,minWidth:22}}>
                {i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}
              </span>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14}}>{s.nome||s.bdn}</div>
                <div style={{fontSize:11,color:C.muted}}>
                  {s.n_parti} part{s.n_parti===1?"o":"i"} · {s.nati_medi_parto} nati/parto · {s.pct_vivi}% vivi
                </div>
              </div>
              <div style={{fontWeight:800,fontSize:16,color:C.suini}}>{s.prolificita}</div>
            </div>
          ))}
        </Card>
      )}
      <Card>
        <div style={{fontSize:14,fontWeight:700,color:C.muted,marginBottom:12}}>COSTI REGISTRATI</div>
        <div style={{display:"flex",gap:10}}>
          {[[C.red,"Sanitari",costoSan],[C.bovini,"Alimentari",costoAli],[C.primary,"Totale",costoSan+costoAli]].map(([col,label,val])=>(
            <div key={label} style={{flex:1,background:col+"15",borderRadius:12,padding:12,textAlign:"center"}}>
              <div style={{fontSize:12,color:col,fontWeight:600}}>{label}</div>
              <div style={{fontSize:22,fontWeight:800,color:col}}>€{val.toFixed(0)}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function AllevamentoApp(){
  const [tab,setTab]=useState("dashboard");
  const{animali,loading:loadA,carica:ricaricaAnimali,aggiungi:addA,aggiorna:updA,elimina:delA}=useAnimali();
  const[suiniLotto,setSuiniLotto]=useState([]);
  useEffect(()=>{
    supabase.from("suini_lotto").select("vivo,stato").then(({data})=>setSuiniLotto(data||[]));
  },[]);
  const{eventi:sanitari,loading:loadS,aggiungi:addS,elimina:delS}=useEventiSanitari();
  const{totalePerAnimale}=useCostiAnimale();
  const{voci:alimentazione,loading:loadAl,aggiungi:addAl}=useAlimentazione();
  const{eventi:riproduttivi,loading:loadR,carica:ricaricaEventiRip,aggiungi:addEvRip,aggiorna:updEvRip,elimina:delEvRip}=useEventiRiproduttivi();
  const{scorte:magazzino,loading:loadM,aggiungi:addM,aggiorna:updM}=useMagazzino();

  // Calcolo scadenze richiami per badge notifica
  const oggiTS = today();
  const oggiDate = new Date(oggiTS);
  const in30ggDate = new Date(oggiDate); in30ggDate.setDate(oggiDate.getDate()+30);
  const nScadenze = sanitari.filter(e =>
    e.scadenza && (new Date(e.scadenza) < oggiDate || new Date(e.scadenza) <= in30ggDate)
  ).length;
  const nScaduti = sanitari.filter(e =>
    e.scadenza && new Date(e.scadenza) < oggiDate
  ).length;

  const TABS=[
    {id:"dashboard",   label:"Home",   icon:"🏠"},
    {id:"anagrafica",  label:"Animali",icon:"🏷️"},
    {id:"sanitario",   label:"Salute", icon:"💉", badge:nScadenze, badgeUrgente:nScaduti>0},
    {id:"alimentazione",label:"Dieta", icon:"🌾"},
    {id:"magazzino",   label:"Magazz.",icon:"📦"},
    {id:"report",      label:"Report", icon:"📊"},
  ];

  return(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,minHeight:"100vh",maxWidth:480,margin:"0 auto"}}>
      <div style={{paddingBottom:70}}>
        {tab==="dashboard"    &&<Dashboard animali={animali} eventi_sanitari={sanitari} magazzino={magazzino} onNav={setTab} suiniLotto={suiniLotto}/>}
        {tab==="anagrafica"   &&<Anagrafica
          animali={animali}
          ricaricaAnimali={ricaricaAnimali} loading={loadA}
          aggiungi={addA} aggiorna={updA} elimina={delA}
          eventiRiproduttivi={riproduttivi}
          aggiungiEvento={addEvRip}
          aggiornaEvento={updEvRip}
          eliminaEvento={delEvRip}
          ricaricaEventi={ricaricaEventiRip}
          sanitari={sanitari}
          totalePerAnimale={totalePerAnimale}
        />}
        {tab==="sanitario"    &&<Sanitario animali={animali} eventi={sanitari} loading={loadS} aggiungi={addS} elimina={delS}/>}
        {tab==="alimentazione"&&<Alimentazione voci={alimentazione} loading={loadAl} aggiungi={addAl} animali={animali}/>}
        {tab==="magazzino"    &&<Magazzino scorte={magazzino} loading={loadM} aggiungi={addM} aggiorna={updM}/>}
        {tab==="report"       &&<Report animali={animali} eventi_sanitari={sanitari} voci_alimentazione={alimentazione} eventiRiproduttivi={riproduttivi}/>}
      </div>
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",
        maxWidth:480,background:"#FFF",borderTop:`1.5px solid ${C.border}`,
        display:"flex",justifyContent:"space-around",padding:"8px 0 10px",
        zIndex:100,boxShadow:"0 -4px 20px rgba(0,0,0,0.1)"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,
              background:"none",border:"none",cursor:"pointer",padding:"4px 6px",minWidth:50}}>
            <div style={{background:tab===t.id?C.primary+"18":"transparent",borderRadius:10,padding:"6px 8px",position:"relative"}}>
              <span style={{fontSize:18}}>{t.icon}</span>
              {t.badge>0&&(
                <span style={{position:"absolute",top:-2,right:-4,
                  background:t.badgeUrgente?C.red:C.yellow,color:"#FFF",
                  fontSize:9,fontWeight:800,borderRadius:10,
                  minWidth:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",
                  padding:"0 4px",border:"2px solid #FFF"}}>
                  {t.badge}
                </span>
              )}
            </div>
            <span style={{fontSize:10,fontWeight:tab===t.id?700:500,
              color:tab===t.id?C.primary:C.muted}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
