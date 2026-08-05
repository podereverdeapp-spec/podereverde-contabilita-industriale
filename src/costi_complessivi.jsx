import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";

const C = {
  bg:"#F5F0E8", card:"#FFFFFF", primary:"#5C3D1E", accent:"#A0522D",
  green:"#4A7C59", red:"#C0392B", yellow:"#D4A017", blue:"#2C6E9B",
  text:"#2D1B0E", muted:"#8B7355", border:"#D4C4A8",
  bovini:"#8B6914", suini:"#B5547A", ovini:"#4A7C59",
};
const specieIcon  = s=>({bovino:"🐄",suino:"🐷",ovino:"🐑"}[s]||"🐾");
const today=()=>new Date().toISOString().split("T")[0];

const inputStyle={width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,
  borderRadius:10,padding:"10px 12px",fontSize:15,background:"#FAFAF8",color:C.text,outline:"none"};
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
const Btn=({label,icon,onClick,variant="primary",small=false,disabled=false})=>{
  const bg={primary:C.primary,danger:C.red,success:C.green,ghost:"transparent"}[variant]||C.primary;
  const fg=variant==="ghost"?C.text:"#FFF";
  return(
    <button onClick={onClick} disabled={disabled}
      style={{display:"flex",alignItems:"center",gap:6,background:bg,color:fg,border:"none",
        borderRadius:10,padding:small?"6px 12px":"10px 18px",
        fontSize:small?13:15,fontWeight:600,cursor:disabled?"default":"pointer",opacity:disabled?0.5:1}}>
      {icon&&<span>{icon}</span>}{label}
    </button>
  );
};
const Field=({label,value,onChange,type="text",options,required})=>(
  <div style={{marginBottom:12}}>
    <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:4}}>
      {label}{required&&<span style={{color:C.red}}> *</span>}
    </div>
    {options
      ?<select value={value??""} onChange={e=>onChange(e.target.value)} style={inputStyle}>
          <option value="">— seleziona —</option>
          {options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
        </select>
      :<input type={type} value={value??""} onChange={e=>onChange(e.target.value)} style={inputStyle}/>
    }
  </div>
);
const Spinner=()=>(
  <div style={{textAlign:"center",padding:60,color:C.muted}}>
    <div style={{fontSize:36,marginBottom:12}}>⏳</div><div>Caricamento...</div>
  </div>
);

const VOCI_COLOR={
  alimentazione:C.bovini, sanitario:C.blue, manodopera:C.primary,
  energia:C.yellow, affitti:C.accent, ammortamenti:C.muted, altro:C.muted,
};

export default function CostiAllevamento() {
  const [costi,setCosti]=useState([]);
  const [costiAnimale,setCostiAnimale]=useState([]);
  const [animali,setAnimali]=useState([]);
  const [alim,setAlim]=useState([]);
  const [sanitari,setSanitari]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState(null);
  const [saving,setSaving]=useState(false);
  const [filtroSpecie,setFiltroSpecie]=useState("tutti");

  const carica=async()=>{
    setLoading(true);
    const[{data:c},{data:ca},{data:a},{data:al},{data:s}]=await Promise.all([
      supabase.from("costi_generali").select("*").order("data_inizio",{ascending:false}),
      supabase.from("costi_animale").select("*"),
      supabase.from("animali").select("id,specie,stato,nome,bdn"),
      supabase.from("alimentazione").select("*"),
      supabase.from("eventi_sanitari").select("*"),
    ]);
    setCosti(c||[]);
    setCostiAnimale(ca||[]);
    setAnimali(a||[]);
    setAlim(al||[]);
    setSanitari(s||[]);
    setLoading(false);
  };
  useEffect(()=>{carica();},[]);

  const salva=async()=>{
    if(!form.voce||!form.importo)return;
    setSaving(true);
    const payload={
      voce:form.voce, importo:parseFloat(form.importo),
      data_inizio:form.data_inizio||null, data_fine:form.data_fine||null,
      descrizione:form.descrizione||null, fornitore:form.fornitore||null,
      specie:form.specie||null, quantita:form.quantita?parseFloat(form.quantita):null,
      unita:form.unita||null,
    };
    if(form.id){await supabase.from("costi_generali").update(payload).eq("id",form.id);}
    else{await supabase.from("costi_generali").insert([payload]);}
    setSaving(false);setForm(null);carica();
  };

  // Aggregazioni
  const totGenerali = costi.reduce((s,c)=>s+(c.importo||0),0);
  const totAnimale  = costiAnimale.reduce((s,c)=>s+(c.importo||0),0);
  const totAlim     = alim.reduce((s,c)=>s+(c.costo||0),0);
  const totSan      = sanitari.reduce((s,c)=>s+(c.costo||0),0);
  const totale      = totGenerali+totAnimale+totAlim+totSan;

  const attivi=animali.filter(a=>a.stato==="attivo");
  const costoPerCapo = attivi.length>0 ? Math.round(totale/attivi.length) : 0;

  // Per specie
  const perSpecie = useMemo(()=>{
    return ["bovino","suino","ovino"].map(sp=>{
      const n=attivi.filter(a=>a.specie===sp).length;
      if(n===0)return null;
      const cA=costiAnimale.filter(c=>{
        const anim=animali.find(a=>a.id===c.animale_id);
        return anim?.specie===sp;
      }).reduce((s,c)=>s+(c.importo||0),0);
      const cAl=alim.filter(c=>c.specie===sp).reduce((s,c)=>s+(c.costo||0),0);
      const cS=sanitari.filter(c=>{
        const anim=animali.find(a=>a.id===c.animale_id);
        return anim?.specie===sp;
      }).reduce((s,c)=>s+(c.costo||0),0);
      const cG=costi.filter(c=>c.specie===sp||!c.specie)
        .reduce((s,c)=>s+((!c.specie?c.importo/(attivi.length||1)*n:c.importo)||0),0);
      const tot=cA+cAl+cS+cG;
      return{specie:sp,n,tot,perCapo:n>0?Math.round(tot/n):0};
    }).filter(Boolean);
  },[costi,costiAnimale,animali,alim,sanitari,attivi]);

  const costiFiltered = costi.filter(c=>filtroSpecie==="tutti"||(c.specie===filtroSpecie||!c.specie));

  if(form) return(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,minHeight:"100vh",maxWidth:480,margin:"0 auto"}}>
      <div style={{padding:"16px 16px 80px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <button onClick={()=>setForm(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
          <span style={{fontSize:18,fontWeight:800}}>{form.id?"Modifica":"Nuovo"} costo</span>
        </div>
        <Field label="Voce di costo" value={form.voce} onChange={v=>setForm(f=>({...f,voce:v}))}
          options={["alimentazione","sanitario","manodopera","energia","affitti","ammortamenti","altro"]} required/>
        <Field label="Importo (€)" value={form.importo} onChange={v=>setForm(f=>({...f,importo:v}))} type="number" required/>
        <Field label="Specie (lascia vuoto per tutti)" value={form.specie} onChange={v=>setForm(f=>({...f,specie:v}))}
          options={[{value:"",label:"Tutte le specie"},"bovino","suino","ovino"]}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Field label="Data inizio" value={form.data_inizio} onChange={v=>setForm(f=>({...f,data_inizio:v}))} type="date"/>
          <Field label="Data fine" value={form.data_fine} onChange={v=>setForm(f=>({...f,data_fine:v}))} type="date"/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Field label="Quantità" value={form.quantita} onChange={v=>setForm(f=>({...f,quantita:v}))} type="number"/>
          <Field label="Unità" value={form.unita} onChange={v=>setForm(f=>({...f,unita:v}))}
            options={["€","kg","litri","ore","kWh","ha"]}/>
        </div>
        <Field label="Descrizione" value={form.descrizione} onChange={v=>setForm(f=>({...f,descrizione:v}))}/>
        <Field label="Fornitore" value={form.fornitore} onChange={v=>setForm(f=>({...f,fornitore:v}))}/>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn label={saving?"...":"Salva"} icon="✓" onClick={salva} variant="success" disabled={saving}/>
          <Btn label="Annulla" onClick={()=>setForm(null)} variant="ghost"/>
        </div>
      </div>
    </div>
  );

  return(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,minHeight:"100vh",maxWidth:480,margin:"0 auto",paddingBottom:80}}>
      <div style={{background:`linear-gradient(135deg,${C.primary},${C.accent})`,
        borderRadius:"0 0 28px 28px",padding:"24px 20px 20px",marginBottom:16}}>
        <div style={{fontSize:22,fontWeight:800,color:"#FFF"}}>📊 Costi Complessivi</div>
        <div style={{fontSize:14,color:"rgba(255,255,255,0.75)",marginTop:4}}>
          Aggregati da tutte le sezioni
        </div>
      </div>

      <div style={{padding:"0 16px"}}>
        {loading?<Spinner/>:(
          <>
            {/* Totale */}
            <Card style={{background:`linear-gradient(135deg,${C.primary}15,${C.card})`}}>
              <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:4}}>COSTO TOTALE RILEVATO</div>
              <div style={{fontSize:36,fontWeight:900,color:C.primary}}>€ {totale.toFixed(0)}</div>
              {attivi.length>0&&(
                <div style={{fontSize:14,color:C.green,marginTop:4,fontWeight:600}}>
                  € {costoPerCapo} / capo attivo
                </div>
              )}
            </Card>

            {/* Breakdown sorgenti */}
            <Card>
              <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:10}}>PER FONTE</div>
              {[
                {label:"Costi generali",val:totGenerali,col:C.primary},
                {label:"Costi per animale",val:totAnimale,col:C.bovini},
                {label:"Alimentazione",val:totAlim,col:C.green},
                {label:"Sanitario",val:totSan,col:C.blue},
              ].map(r=>(
                <div key={r.label} style={{display:"flex",justifyContent:"space-between",
                  padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:14,color:C.muted}}>{r.label}</span>
                  <span style={{fontWeight:700,color:r.col}}>€ {r.val.toFixed(0)}</span>
                </div>
              ))}
            </Card>

            {/* Per specie */}
            {perSpecie.length>0&&(
              <Card>
                <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:10}}>PER SPECIE</div>
                {perSpecie.map(s=>(
                  <div key={s.specie} style={{display:"flex",justifyContent:"space-between",
                    alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                    <div>
                      <span style={{fontSize:14,fontWeight:600}}>
                        {specieIcon(s.specie)} {s.specie} ({s.n} capi)
                      </span>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontWeight:700,color:C.primary}}>€ {s.tot.toFixed(0)}</div>
                      <div style={{fontSize:11,color:C.muted}}>€{s.perCapo}/capo</div>
                    </div>
                  </div>
                ))}
              </Card>
            )}

            {/* Costi generali registrati */}
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",margin:"16px 0 8px"}}>
              <span style={{fontSize:14,fontWeight:700,color:C.muted}}>COSTI GENERALI</span>
              <Btn label="+ Aggiungi" onClick={()=>setForm({voce:"manodopera",importo:"",
                data_inizio:today(),data_fine:"",specie:"",descrizione:"",fornitore:"",quantita:"",unita:"€"})}
                variant="primary" small/>
            </div>

            <div style={{display:"flex",gap:8,marginBottom:12,overflowX:"auto",paddingBottom:4}}>
              {["tutti","bovino","suino","ovino"].map(s=>(
                <button key={s} onClick={()=>setFiltroSpecie(s)}
                  style={{background:filtroSpecie===s?C.primary:C.card,
                    color:filtroSpecie===s?"#FFF":C.muted,
                    border:`1.5px solid ${filtroSpecie===s?C.primary:C.border}`,
                    borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
                  {s==="tutti"?"Tutti":specieIcon(s)+" "+s.charAt(0).toUpperCase()+s.slice(1)}
                </button>
              ))}
            </div>

            {costiFiltered.length===0?(
              <div style={{textAlign:"center",padding:32,color:C.muted}}>
                <div style={{fontSize:36,marginBottom:8}}>📊</div>
                <div>Nessun costo generale registrato</div>
              </div>
            ):costiFiltered.map(c=>(
              <Card key={c.id} style={{cursor:"pointer"}}
                onClick={()=>setForm({...c})}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <Badge label={c.voce} color={VOCI_COLOR[c.voce]||C.muted}/>
                    {c.specie&&<Badge label={specieIcon(c.specie)+" "+c.specie} color={C.muted}/>}
                    {c.descrizione&&<div style={{fontSize:13,marginTop:6}}>{c.descrizione}</div>}
                    {c.fornitore&&<div style={{fontSize:12,color:C.muted}}>📦 {c.fornitore}</div>}
                    <div style={{fontSize:12,color:C.muted,marginTop:4}}>
                      {c.data_inizio}{c.data_fine&&" → "+c.data_fine}
                    </div>
                  </div>
                  <div style={{fontWeight:800,fontSize:17,color:C.primary,minWidth:70,textAlign:"right"}}>
                    € {(c.importo||0).toFixed(0)}
                  </div>
                </div>
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
