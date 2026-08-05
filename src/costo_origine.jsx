import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";

const C = {
  bg:"#F5F0E8", card:"#FFFFFF", primary:"#5C3D1E", accent:"#A0522D",
  green:"#4A7C59", red:"#C0392B", yellow:"#D4A017", blue:"#2C6E9B",
  text:"#2D1B0E", muted:"#8B7355", border:"#D4C4A8",
  bovini:"#8B6914", suini:"#B5547A", ovini:"#4A7C59",
};
const specieIcon  = s=>({bovino:"🐄",suino:"🐷",ovino:"🐑"}[s]||"🐾");
const specieLabel = s=>({bovino:"Bovino",suino:"Suino",ovino:"Ovino"}[s]||s);
const specieColor = s=>({bovino:C.bovini,suino:C.suini,ovino:C.ovini}[s]||C.muted);

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
const Row=({label,val,col})=>(
  <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",
    borderBottom:`1px solid ${C.border}`,fontSize:14}}>
    <span style={{color:C.muted,fontSize:13}}>{label}</span>
    <span style={{fontWeight:600,color:col||C.text}}>{val||"—"}</span>
  </div>
);

// ─── DETTAGLIO ANIMALE ────────────────────────────────────────────────────────
function DettaglioAnimale({animale, animali, costi, onBack, onAddCosto}) {
  const madre = animale.madre_id ? animali.find(a=>a.id===animale.madre_id) : null;
  const padre = animale.padre_id ? animali.find(a=>a.id===animale.padre_id) : null;
  const mieiCosti = costi.filter(c=>c.animale_id===animale.id);
  const totaleCosti = mieiCosti.reduce((s,c)=>s+(c.importo||0),0);
  const costoBase = animale.provenienza==="Acquistato"
    ? (animale.peso_acquisto||animale.prezzo_acquisto||0)
    : 0;
  const costoTotale = costoBase + totaleCosti;
  const pesoUscita = animale.peso_vivo_uscita||animale.peso_attuale||animale.peso_nascita||null;
  const costoPerKg = (pesoUscita&&costoTotale>0)
    ? Math.round(costoTotale/pesoUscita*100)/100 : null;

  const voceColor={
    alimentazione:C.bovini,sanitario:C.blue,manodopera:C.primary,
    energia:C.yellow,ammortamenti:C.muted,affitti:C.accent,altro:C.muted,
  };

  return(
    <div style={{padding:"16px 16px 80px"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
        <span style={{fontSize:18,fontWeight:800}}>Costo origine</span>
      </div>

      <Card style={{background:specieColor(animale.specie)+"12",
        borderLeft:`4px solid ${specieColor(animale.specie)}`}}>
        <div style={{fontWeight:800,fontSize:18}}>
          {specieIcon(animale.specie)} {animale.nome||animale.bdn}
        </div>
        <div style={{fontSize:13,color:C.muted}}>{animale.bdn} · {animale.razza_calcolata||animale.razza||"—"}</div>
        <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
          <Badge label={specieLabel(animale.specie)} color={specieColor(animale.specie)}/>
          <Badge label={animale.provenienza==="Nato in azienda"||animale.provenienza==="nato"?"🐣 Nato":"💰 Acquistato"}
            color={animale.provenienza==="Nato in azienda"||animale.provenienza==="nato"?C.green:C.bovini}/>
          <Badge label={animale.stato==="attivo"?"Attivo":animale.stato} color={animale.stato==="attivo"?C.green:C.muted}/>
        </div>
      </Card>

      {/* Riepilogo costo */}
      <Card style={{background:`linear-gradient(135deg,${C.primary}15,${C.card})`}}>
        <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:10}}>COSTO ORIGINE TOTALE</div>
        <div style={{fontSize:36,fontWeight:900,color:C.primary}}>€ {costoTotale.toFixed(2)}</div>
        {costoPerKg&&(
          <div style={{fontSize:14,color:C.green,marginTop:4,fontWeight:600}}>
            € {costoPerKg} / kg peso vivo
          </div>
        )}
        {costoBase>0&&<Row label="Prezzo acquisto" val={`€ ${costoBase.toFixed(2)}`}/>}
        <Row label="Costi allevamento" val={`€ ${totaleCosti.toFixed(2)}`}/>
        {pesoUscita&&<Row label="Peso di riferimento" val={`${pesoUscita} kg`}/>}
      </Card>

      {/* Genealogia costi */}
      {(madre||padre)&&(
        <Card>
          <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:8}}>GENEALOGIA</div>
          {madre&&<Row label="Madre" val={madre.nome||madre.bdn}/>}
          {padre&&<Row label="Padre" val={padre.nome||padre.bdn}/>}
        </Card>
      )}

      {/* Costi individuali */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"16px 0 8px"}}>
        <div style={{fontSize:13,fontWeight:700,color:C.muted}}>COSTI ALLEVAMENTO ({mieiCosti.length})</div>
        <Btn label="+ Aggiungi" onClick={()=>onAddCosto(animale)} variant="primary" small/>
      </div>
      {mieiCosti.length===0?(
        <div style={{textAlign:"center",padding:20,color:C.muted,fontSize:13}}>
          Nessun costo registrato per questo animale
        </div>
      ):mieiCosti.map(c=>(
        <Card key={c.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <Badge label={c.voce||"altro"} color={voceColor[c.voce]||C.muted}/>
              {c.descrizione&&<div style={{fontSize:13,marginTop:4}}>{c.descrizione}</div>}
              <div style={{fontSize:12,color:C.muted,marginTop:2}}>{c.data}</div>
            </div>
            <div style={{fontWeight:700,fontSize:16,color:C.primary}}>€ {(c.importo||0).toFixed(2)}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── FORM AGGIUNGI COSTO ──────────────────────────────────────────────────────
function FormCosto({animale, onSave, onCancel}) {
  const today=()=>new Date().toISOString().split("T")[0];
  const [form,setForm]=useState({animale_id:animale.id,voce:"alimentazione",importo:"",data:today(),descrizione:""});
  const [saving,setSaving]=useState(false);
  const salva=async()=>{
    if(!form.importo)return;
    setSaving(true);
    const{error}=await supabase.from("costi_animale").insert([{
      animale_id:animale.id,voce:form.voce,importo:parseFloat(form.importo),
      data:form.data,descrizione:form.descrizione||null,
    }]);
    setSaving(false);
    if(!error)onSave();
  };
  return(
    <div style={{padding:"16px 16px 80px"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onCancel} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
        <span style={{fontSize:18,fontWeight:800}}>Aggiungi costo — {animale.nome||animale.bdn}</span>
      </div>
      <Field label="Voce di costo" value={form.voce} onChange={v=>setForm(f=>({...f,voce:v}))}
        options={["alimentazione","sanitario","manodopera","energia","ammortamenti","affitti","altro"]}/>
      <Field label="Importo (€)" value={form.importo} onChange={v=>setForm(f=>({...f,importo:v}))}
        type="number" required/>
      <Field label="Data" value={form.data} onChange={v=>setForm(f=>({...f,data:v}))} type="date"/>
      <Field label="Descrizione" value={form.descrizione} onChange={v=>setForm(f=>({...f,descrizione:v}))}/>
      <div style={{display:"flex",gap:10,marginTop:8}}>
        <Btn label={saving?"...":"Salva"} icon="✓" onClick={salva} variant="success" disabled={saving}/>
        <Btn label="Annulla" onClick={onCancel} variant="ghost"/>
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function CostoOrigine() {
  const [animali,setAnimali]=useState([]);
  const [costi,setCosti]=useState([]);
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState(null);
  const [formCosto,setFormCosto]=useState(null);
  const [filtro,setFiltro]=useState("tutti");

  const carica=async()=>{
    setLoading(true);
    const[{data:anim},{data:cst}]=await Promise.all([
      supabase.from("animali").select("*").order("specie").order("nome"),
      supabase.from("costi_animale").select("*").order("data",{ascending:false}),
    ]);
    setAnimali(anim||[]);
    setCosti(cst||[]);
    setLoading(false);
  };
  useEffect(()=>{carica();},[]);

  const lista=useMemo(()=>
    animali.filter(a=>filtro==="tutti"||a.specie===filtro)
  ,[animali,filtro]);

  const wrap=ch=>(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,
      minHeight:"100vh",maxWidth:480,margin:"0 auto"}}>{ch}</div>
  );

  if(formCosto) return wrap(
    <FormCosto animale={formCosto} onSave={()=>{setFormCosto(null);carica();}}
      onCancel={()=>setFormCosto(null)}/>
  );
  if(selected) return wrap(
    <DettaglioAnimale animale={selected} animali={animali} costi={costi}
      onBack={()=>setSelected(null)}
      onAddCosto={a=>{setFormCosto(a);}}/>
  );

  const totAcquistati=animali.filter(a=>a.provenienza==="Acquistato")
    .reduce((s,a)=>s+(a.peso_acquisto||a.prezzo_acquisto||0),0);
  const totCostiInd=costi.reduce((s,c)=>s+(c.importo||0),0);

  return wrap(
    <div style={{paddingBottom:80}}>
      <div style={{background:`linear-gradient(135deg,${C.primary},${C.accent})`,
        borderRadius:"0 0 28px 28px",padding:"24px 20px 20px",marginBottom:16}}>
        <div style={{fontSize:22,fontWeight:800,color:"#FFF"}}>🧾 Costo Origine</div>
        <div style={{fontSize:14,color:"rgba(255,255,255,0.75)",marginTop:4}}>
          {animali.length} animali · {costi.length} voci di costo
        </div>
      </div>

      <div style={{padding:"0 16px"}}>
        {/* Riepilogo */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div style={{background:C.card,borderRadius:14,padding:14,textAlign:"center",
            boxShadow:"0 2px 6px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:11,color:C.muted,fontWeight:600}}>ACQUISTI</div>
            <div style={{fontSize:22,fontWeight:800,color:C.bovini}}>€ {totAcquistati.toFixed(0)}</div>
          </div>
          <div style={{background:C.card,borderRadius:14,padding:14,textAlign:"center",
            boxShadow:"0 2px 6px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:11,color:C.muted,fontWeight:600}}>COSTI IND.</div>
            <div style={{fontSize:22,fontWeight:800,color:C.primary}}>€ {totCostiInd.toFixed(0)}</div>
          </div>
        </div>

        {/* Filtri */}
        <div style={{display:"flex",gap:8,marginBottom:12,overflowX:"auto",paddingBottom:4}}>
          {["tutti","bovino","suino","ovino"].map(s=>(
            <button key={s} onClick={()=>setFiltro(s)}
              style={{background:filtro===s?C.primary:C.card,
                color:filtro===s?"#FFF":C.muted,
                border:`1.5px solid ${filtro===s?C.primary:C.border}`,
                borderRadius:20,padding:"5px 14px",fontSize:12,fontWeight:600,
                cursor:"pointer",whiteSpace:"nowrap"}}>
              {s==="tutti"?"Tutti":specieIcon(s)+" "+s.charAt(0).toUpperCase()+s.slice(1)}
            </button>
          ))}
        </div>

        {loading?<Spinner/>:lista.length===0?(
          <div style={{textAlign:"center",padding:40,color:C.muted}}>
            <div style={{fontSize:40,marginBottom:8}}>🧾</div>
            <div>Nessun animale registrato</div>
          </div>
        ):lista.map(a=>{
          const mieiCosti=costi.filter(c=>c.animale_id===a.id);
          const tot=(a.peso_acquisto||a.prezzo_acquisto||0)+mieiCosti.reduce((s,c)=>s+(c.importo||0),0);
          const peso=a.peso_vivo_uscita||a.peso_attuale||null;
          const kgCost=peso&&tot>0?Math.round(tot/peso*100)/100:null;
          return(
            <Card key={a.id} style={{cursor:"pointer"}} onClick={()=>setSelected(a)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <div style={{background:specieColor(a.specie)+"20",borderRadius:10,
                    padding:8,fontSize:22}}>{specieIcon(a.specie)}</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:15}}>{a.nome||a.bdn||"—"}</div>
                    <div style={{fontSize:12,color:C.muted}}>
                      {a.bdn} · {a.razza_calcolata||a.razza||"—"}
                    </div>
                    <div style={{display:"flex",gap:6,marginTop:4}}>
                      <Badge label={a.provenienza==="Nato in azienda"||a.provenienza==="nato"?"🐣 Nato":"💰 Acquistato"}
                        color={a.provenienza==="Nato in azienda"||a.provenienza==="nato"?C.green:C.bovini}/>
                      {mieiCosti.length>0&&<Badge label={`${mieiCosti.length} costi`} color={C.muted}/>}
                    </div>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:800,fontSize:17,color:C.primary}}>€ {tot.toFixed(0)}</div>
                  {kgCost&&<div style={{fontSize:11,color:C.green}}>€{kgCost}/kg</div>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
