import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const C = {
  bg:"#F5F0E8", card:"#FFFFFF", primary:"#5C3D1E", accent:"#A0522D",
  green:"#4A7C59", red:"#C0392B", yellow:"#D4A017", blue:"#2C6E9B",
  text:"#2D1B0E", muted:"#8B7355", border:"#D4C4A8",
};
const today=()=>new Date().toISOString().split("T")[0];
const annoCorrente=new Date().getFullYear();

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
        fontSize:small?13:15,fontWeight:600,cursor:"pointer",opacity:disabled?0.5:1}}>
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

export default function CostiGenerali() {
  const [macchinari,setMacchinari]=useState([]);
  const [costiGen,setCostiGen]=useState([]);
  const [loading,setLoading]=useState(true);
  const [subTab,setSubTab]=useState("macchinari");
  const [form,setForm]=useState(null);
  const [saving,setSaving]=useState(false);

  const carica=async()=>{
    setLoading(true);
    const[{data:m},{data:c}]=await Promise.all([
      supabase.from("macchinari").select("*").order("nome"),
      supabase.from("costi_generali").select("*").order("data_inizio",{ascending:false}),
    ]);
    setMacchinari(m||[]);
    setCostiGen(c||[]);
    setLoading(false);
  };
  useEffect(()=>{carica();},[]);

  // Ammortamento annuo e quota residua
  const calcAmm=(m)=>{
    if(!m.costo_storico||!m.anni_ammortamento||!m.anno_acquisto)return null;
    const quotaAnnua=m.costo_storico/m.anni_ammortamento;
    const anniTrascorsi=annoCorrente-m.anno_acquisto;
    const ammTot=Math.min(m.costo_storico,quotaAnnua*anniTrascorsi);
    const residuo=Math.max(0,m.costo_storico-ammTot);
    const pctAmm=Math.min(100,Math.round(ammTot/m.costo_storico*100));
    return{quotaAnnua,ammTot,residuo,pctAmm,anniTrascorsi};
  };

  const totValoreStorico=macchinari.reduce((s,m)=>s+(m.costo_storico||0),0);
  const totResiduoContr=macchinari.reduce((s,m)=>{
    const a=calcAmm(m);return s+(a?a.residuo:m.costo_storico||0);
  },0);
  const totAmmAnnuo=macchinari.reduce((s,m)=>{
    const a=calcAmm(m);return s+(a?a.quotaAnnua:0);
  },0);

  const salvaForm=async()=>{
    if(!form.nome&&!form.voce)return;
    setSaving(true);
    if(subTab==="macchinari"){
      const p={nome:form.nome,categoria:form.categoria||null,
        costo_storico:parseFloat(form.costo_storico)||0,
        anno_acquisto:parseInt(form.anno_acquisto)||annoCorrente,
        anni_ammortamento:parseInt(form.anni_ammortamento)||10,note:form.note||null};
      if(form.id)await supabase.from("macchinari").update(p).eq("id",form.id);
      else await supabase.from("macchinari").insert([p]);
    } else {
      const p={voce:form.voce,importo:parseFloat(form.importo)||0,
        data_inizio:form.data_inizio||null,data_fine:form.data_fine||null,
        descrizione:form.descrizione||null,quantita:form.quantita?parseFloat(form.quantita):null,
        unita:form.unita||null};
      if(form.id)await supabase.from("costi_generali").update(p).eq("id",form.id);
      else await supabase.from("costi_generali").insert([p]);
    }
    setSaving(false);setForm(null);carica();
  };

  if(form) return(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,minHeight:"100vh",maxWidth:480,margin:"0 auto"}}>
      <div style={{padding:"16px 16px 80px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <button onClick={()=>setForm(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
          <span style={{fontSize:18,fontWeight:800}}>
            {form.id?"Modifica":"Nuovo"} {subTab==="macchinari"?"macchinario":"costo"}
          </span>
        </div>
        {subTab==="macchinari"?(
          <>
            <Field label="Nome macchinario" value={form.nome} onChange={v=>setForm(f=>({...f,nome:v}))} required/>
            <Field label="Categoria" value={form.categoria} onChange={v=>setForm(f=>({...f,categoria:v}))}
              options={["trattore","alimentazione","mungitura","energia","trasporto","irrigazione","altro"]}/>
            <Field label="Costo storico (€)" value={form.costo_storico}
              onChange={v=>setForm(f=>({...f,costo_storico:v}))} type="number" required/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Field label="Anno acquisto" value={form.anno_acquisto}
                onChange={v=>setForm(f=>({...f,anno_acquisto:v}))} type="number"/>
              <Field label="Anni ammortamento" value={form.anni_ammortamento}
                onChange={v=>setForm(f=>({...f,anni_ammortamento:v}))} type="number"/>
            </div>
            <Field label="Note" value={form.note} onChange={v=>setForm(f=>({...f,note:v}))}/>
          </>
        ):(
          <>
            <Field label="Voce" value={form.voce} onChange={v=>setForm(f=>({...f,voce:v}))}
              options={["manodopera","gasolio","energia","acqua","affitti","assicurazioni","consulenze","altro"]} required/>
            <Field label="Importo (€)" value={form.importo}
              onChange={v=>setForm(f=>({...f,importo:v}))} type="number" required/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Field label="Da" value={form.data_inizio}
                onChange={v=>setForm(f=>({...f,data_inizio:v}))} type="date"/>
              <Field label="A" value={form.data_fine}
                onChange={v=>setForm(f=>({...f,data_fine:v}))} type="date"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Field label="Quantità" value={form.quantita}
                onChange={v=>setForm(f=>({...f,quantita:v}))} type="number"/>
              <Field label="Unità" value={form.unita} onChange={v=>setForm(f=>({...f,unita:v}))}
                options={["ore","litri","kWh","m³","ha","€"]}/>
            </div>
            <Field label="Descrizione" value={form.descrizione}
              onChange={v=>setForm(f=>({...f,descrizione:v}))}/>
          </>
        )}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn label={saving?"...":"Salva"} icon="✓" onClick={salvaForm} variant="success" disabled={saving}/>
          <Btn label="Annulla" onClick={()=>setForm(null)} variant="ghost"/>
        </div>
      </div>
    </div>
  );

  return(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,
      minHeight:"100vh",maxWidth:480,margin:"0 auto",paddingBottom:80}}>
      <div style={{background:`linear-gradient(135deg,${C.primary},${C.accent})`,
        borderRadius:"0 0 28px 28px",padding:"24px 20px 20px"}}>
        <div style={{fontSize:22,fontWeight:800,color:"#FFF"}}>🏭 Struttura Aziendale</div>
        <div style={{fontSize:14,color:"rgba(255,255,255,0.75)",marginTop:4}}>
          Macchinari, ammortamenti e costi fissi
        </div>
      </div>

      <div style={{display:"flex",background:C.card,borderBottom:`1.5px solid ${C.border}`}}>
        {[["macchinari","⚙️ Macchinari"],["costi","📋 Costi fissi"]].map(([id,label])=>(
          <button key={id} onClick={()=>setSubTab(id)}
            style={{flex:1,padding:"12px 4px",background:"none",border:"none",cursor:"pointer",
              fontSize:12,fontWeight:subTab===id?700:500,
              color:subTab===id?C.primary:C.muted,
              borderBottom:subTab===id?`2px solid ${C.primary}`:"2px solid transparent"}}>
            {label}
          </button>
        ))}
      </div>

      <div style={{padding:"16px"}}>
        {loading?<Spinner/>:(
          <>
            {subTab==="macchinari"&&(
              <>
                {macchinari.length>0&&(
                  <Card style={{background:`linear-gradient(135deg,${C.primary}15,${C.card})`}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:10}}>PARCO MACCHINE</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                      {[
                        {label:"Valore storico",val:"€"+Math.round(totValoreStorico/1000)+"k",col:C.primary},
                        {label:"Residuo contab.",val:"€"+Math.round(totResiduoContr/1000)+"k",col:C.blue},
                        {label:"Amm. annuo",val:"€"+Math.round(totAmmAnnuo),col:C.yellow},
                      ].map(s=>(
                        <div key={s.label} style={{textAlign:"center",background:s.col+"12",borderRadius:10,padding:"8px 4px"}}>
                          <div style={{fontSize:14,fontWeight:800,color:s.col}}>{s.val}</div>
                          <div style={{fontSize:10,color:C.muted}}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",marginBottom:12}}>
                  <span style={{fontSize:13,fontWeight:700,color:C.muted}}>
                    {macchinari.length} macchinari registrati
                  </span>
                  <Btn label="+ Aggiungi" onClick={()=>setForm({nome:"",categoria:"trattore",
                    costo_storico:"",anno_acquisto:annoCorrente,anni_ammortamento:10,note:""})}
                    variant="primary" small/>
                </div>
                {macchinari.length===0?(
                  <div style={{textAlign:"center",padding:40,color:C.muted}}>
                    <div style={{fontSize:40,marginBottom:8}}>⚙️</div>
                    <div>Nessun macchinario registrato</div>
                  </div>
                ):macchinari.map(m=>{
                  const a=calcAmm(m);
                  return(
                    <Card key={m.id} style={{cursor:"pointer"}} onClick={()=>setForm({...m})}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:15}}>⚙️ {m.nome}</div>
                          <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                            {m.categoria&&<Badge label={m.categoria} color={C.muted}/>}
                            <Badge label={`${m.anno_acquisto}`} color={C.blue}/>
                            {a&&a.pctAmm>=100&&<Badge label="✓ Ammortizzato" color={C.green}/>}
                          </div>
                          {a&&(
                            <div style={{marginTop:8}}>
                              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                                <span style={{color:C.muted}}>Ammortamento</span>
                                <span style={{fontWeight:600}}>{a.pctAmm}%</span>
                              </div>
                              <div style={{background:C.border,borderRadius:6,height:6,overflow:"hidden"}}>
                                <div style={{background:a.pctAmm>=100?C.green:C.primary,
                                  width:`${a.pctAmm}%`,height:"100%",borderRadius:6,transition:"width 0.3s"}}/>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between",
                                fontSize:11,color:C.muted,marginTop:4}}>
                                <span>Quota annua: €{Math.round(a.quotaAnnua)}</span>
                                <span>Residuo: €{Math.round(a.residuo)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        <div style={{textAlign:"right",marginLeft:12}}>
                          <div style={{fontWeight:800,fontSize:16,color:C.primary}}>
                            €{Math.round(m.costo_storico||0).toLocaleString()}
                          </div>
                          <div style={{fontSize:11,color:C.muted}}>valore storico</div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </>
            )}
            {subTab==="costi"&&(
              <>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.muted}}>
                    Totale: <span style={{color:C.primary,fontSize:15}}>
                      €{costiGen.reduce((s,c)=>s+(c.importo||0),0).toFixed(0)}
                    </span>
                  </div>
                  <Btn label="+ Aggiungi" onClick={()=>setForm({voce:"manodopera",importo:"",
                    data_inizio:today(),data_fine:"",descrizione:"",quantita:"",unita:"ore"})}
                    variant="primary" small/>
                </div>
                {costiGen.length===0?(
                  <div style={{textAlign:"center",padding:40,color:C.muted}}>
                    <div style={{fontSize:40,marginBottom:8}}>📋</div>
                    <div>Nessun costo fisso registrato</div>
                  </div>
                ):costiGen.map(c=>(
                  <Card key={c.id} style={{cursor:"pointer"}} onClick={()=>setForm({...c})}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <Badge label={c.voce||"altro"} color={C.primary}/>
                        {c.descrizione&&<div style={{fontSize:13,marginTop:6}}>{c.descrizione}</div>}
                        {c.quantita&&<div style={{fontSize:12,color:C.muted,marginTop:2}}>
                          📦 {c.quantita} {c.unita}
                        </div>}
                        <div style={{fontSize:12,color:C.muted,marginTop:2}}>
                          {c.data_inizio}{c.data_fine&&" → "+c.data_fine}
                        </div>
                      </div>
                      <div style={{fontWeight:800,fontSize:17,color:C.primary}}>
                        €{(c.importo||0).toFixed(0)}
                      </div>
                    </div>
                  </Card>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
