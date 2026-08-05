import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";

const C = {
  bg:"#F5F0E8", card:"#FFFFFF", primary:"#5C3D1E", accent:"#A0522D",
  green:"#4A7C59", red:"#C0392B", yellow:"#D4A017", blue:"#2C6E9B",
  text:"#2D1B0E", muted:"#8B7355", border:"#D4C4A8",
  bovini:"#8B6914", suini:"#B5547A", ovini:"#4A7C59",
};
const specieIcon  = s=>({bovino:"🐄",suino:"🐷",ovino:"🐑"}[s]||"🐾");
const specieLabel = s=>({bovino:"Bovini",suino:"Suini",ovino:"Ovini"}[s]||s);
const specieColor = s=>({bovino:C.bovini,suino:C.suini,ovino:C.ovini}[s]||C.muted);
const motivoColor = m=>{
  if(!m) return C.muted;
  const ml=m.toLowerCase();
  if(ml.includes("macellat")) return C.bovini;
  if(ml.includes("mort"))     return C.red;
  if(ml.includes("vendut"))   return C.green;
  if(ml.includes("furto")||ml.includes("scappat")) return C.yellow;
  return C.muted;
};
const motivoIcon = m=>{
  if(!m) return "📤";
  const ml=m.toLowerCase();
  if(ml.includes("macellat")) return "🔪";
  if(ml.includes("mort"))     return "✝️";
  if(ml.includes("vendut"))   return "💰";
  if(ml.includes("furto"))    return "🚨";
  if(ml.includes("scappat"))  return "🏃";
  return "📤";
};
const today=()=>new Date().toISOString().split("T")[0];

// ─── UI BASE ──────────────────────────────────────────────────────────────────
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
  const bg={primary:C.primary,danger:C.red,success:C.green,ghost:"transparent",outline:"transparent"}[variant]||C.primary;
  const fg=variant==="ghost"||variant==="outline"?C.text:"#FFF";
  return(
    <button onClick={onClick} disabled={disabled}
      style={{display:"flex",alignItems:"center",gap:6,background:bg,color:fg,
        border:variant==="outline"?`1.5px solid ${C.primary}`:"none",
        borderRadius:10,padding:small?"6px 12px":"10px 18px",
        fontSize:small?13:15,fontWeight:600,cursor:disabled?"default":"pointer",
        opacity:disabled?0.5:1}}>
      {icon&&<span>{icon}</span>}{label}
    </button>
  );
};
const Field=({label,value,onChange,type="text",options,required,placeholder})=>(
  <div style={{marginBottom:12}}>
    <div style={{fontSize:12,fontWeight:600,color:C.muted,marginBottom:4}}>
      {label}{required&&<span style={{color:C.red}}> *</span>}
    </div>
    {options
      ?<select value={value??""} onChange={e=>onChange(e.target.value)} style={inputStyle}>
          <option value="">— seleziona —</option>
          {options.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
      :<input type={type} value={value??""} placeholder={placeholder||""}
          onChange={e=>onChange(e.target.value)} style={inputStyle}/>
    }
  </div>
);
const Spinner=()=>(
  <div style={{textAlign:"center",padding:60,color:C.muted}}>
    <div style={{fontSize:36,marginBottom:12}}>⏳</div>
    <div>Caricamento animali...</div>
  </div>
);

// ─── FILTRI SPECIE ─────────────────────────────────────────────────────────────
function FiltriSpecie({valore, onChange}) {
  return(
    <div style={{display:"flex",gap:8,marginBottom:12,overflowX:"auto",paddingBottom:4}}>
      {["tutti","bovino","suino","ovino"].map(s=>{
        const sel=valore===s;
        const col=s==="tutti"?C.primary:specieColor(s);
        return(
          <button key={s} onClick={()=>onChange(s)}
            style={{background:sel?col:C.card,
              color:sel?"#FFF":C.muted,
              border:`1.5px solid ${sel?col:C.border}`,
              borderRadius:20,padding:"5px 14px",fontSize:13,fontWeight:600,
              cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
            {s==="tutti"?"🐾 Tutti":specieIcon(s)+" "+specieLabel(s)}
          </button>
        );
      })}
    </div>
  );
}

// ─── FORM USCITA ──────────────────────────────────────────────────────────────
function FormUscita({animale, onSave, onCancel}) {
  const [form,setForm]=useState({
    stato: animale.stato!=="attivo"?animale.stato:"macellato",
    data_uscita: animale.data_uscita||today(),
    motivo_uscita: animale.motivo_uscita||"",
    causa_morte: animale.causa_morte||"",
    peso_vivo_uscita: animale.peso_vivo_uscita||"",
    peso_carcassa: animale.peso_carcassa||"",
    note: animale.note||"",
  });
  const [saving,setSaving]=useState(false);

  const resa = form.peso_carcassa&&form.peso_vivo_uscita
    ? Math.round(parseFloat(form.peso_carcassa)/parseFloat(form.peso_vivo_uscita)*1000)/10
    : null;
  const gg = form.data_uscita&&animale.data_ingresso
    ? Math.round((new Date(form.data_uscita)-new Date(animale.data_ingresso))/86400000)
    : null;

  const salva=async()=>{
    if(!form.motivo_uscita) return;
    setSaving(true);
    const payload={
      stato: form.stato||"uscito",
      data_uscita: form.data_uscita||null,
      motivo_uscita: form.motivo_uscita||null,
      causa_morte: form.motivo_uscita==="Morto (malattia)"?(form.causa_morte||null):null,
      peso_vivo_uscita: form.peso_vivo_uscita?parseFloat(form.peso_vivo_uscita):null,
      peso_carcassa: form.peso_carcassa?parseFloat(form.peso_carcassa):null,
      resa_percent: resa,
      note: form.note||null,
      vivo: false,
    };
    const{error}=await supabase.from("animali").update(payload).eq("id",animale.id);
    setSaving(false);
    if(error){
      alert(`⚠️ Errore nel salvataggio dell'uscita:\n\n${error.message}`);
      return;
    }
    onSave();
  };

  return(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,
      minHeight:"100vh",maxWidth:480,margin:"0 auto",padding:"16px 16px 100px"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onCancel} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
        <span style={{fontSize:18,fontWeight:800}}>Registra uscita</span>
      </div>
      <Card style={{background:specieColor(animale.specie)+"12",
        borderLeft:`4px solid ${specieColor(animale.specie)}`}}>
        <div style={{fontWeight:700,fontSize:16}}>
          {specieIcon(animale.specie)} {animale.nome||animale.bdn}
        </div>
        <div style={{fontSize:13,color:C.muted}}>{animale.bdn} · {animale.razza||"—"}</div>
        {animale.data_ingresso&&<div style={{fontSize:12,color:C.muted}}>📥 Ingresso: {animale.data_ingresso}</div>}
      </Card>

      <Field label="Motivo uscita" value={form.motivo_uscita} onChange={v=>setForm(f=>({...f,motivo_uscita:v}))}
        options={["Macellato","Morto (cause naturali)","Morto (malattia)","Venduto vivo","Furto","Scappato","Trasferito","Altro"]}
        required/>
      {form.motivo_uscita==="Morto (malattia)"&&
        <Field label="Causa (malattia/diagnosi)" value={form.causa_morte}
          onChange={v=>setForm(f=>({...f,causa_morte:v}))} placeholder="Es. Polmonite, PRRS, setticemia..."/>}
      <Field label="Nuovo stato" value={form.stato} onChange={v=>setForm(f=>({...f,stato:v}))}
        options={["macellato","deceduto","venduto","trasferito"]}/>
      <Field label="Data uscita" value={form.data_uscita} onChange={v=>setForm(f=>({...f,data_uscita:v}))} type="date"/>

      {gg>0&&(
        <div style={{background:C.blue+"12",border:`1px solid ${C.blue}33`,borderRadius:10,
          padding:"8px 12px",marginBottom:12,fontSize:13}}>
          📅 Permanenza: <strong style={{color:C.blue}}>{gg} giorni</strong>
          {gg>=365&&<span style={{color:C.muted}}> ({(gg/365).toFixed(1)} anni)</span>}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <Field label="Peso vivo (kg)" value={form.peso_vivo_uscita}
          onChange={v=>setForm(f=>({...f,peso_vivo_uscita:v}))} type="number"/>
        {form.motivo_uscita==="Macellato"&&
          <Field label="Peso carcassa (kg)" value={form.peso_carcassa}
            onChange={v=>setForm(f=>({...f,peso_carcassa:v}))} type="number"/>}
      </div>

      {resa&&(
        <div style={{background:C.green+"12",border:`1px solid ${C.green}33`,borderRadius:10,
          padding:"8px 12px",marginBottom:12,fontSize:13}}>
          ⚖️ Resa: <strong style={{color:C.green}}>{resa}%</strong>
        </div>
      )}
      {/* IPG - visualizzazione dinamica in fase di registrazione */}
      {(()=>{
        const gg = form.data_uscita&&animale.data_ingresso
          ? Math.round((new Date(form.data_uscita)-new Date(animale.data_ingresso))/86400000) : 0;
        const ipgVivo = gg>0&&form.peso_vivo_uscita ? Math.round(parseFloat(form.peso_vivo_uscita)/gg*1000)/1000 : null;
        const ipgCarc = gg>0&&form.peso_carcassa    ? Math.round(parseFloat(form.peso_carcassa)/gg*1000)/1000 : null;
        if(!ipgVivo&&!ipgCarc) return null;
        return (
          <div style={{background:C.primary+"12",borderRadius:8,padding:"6px 10px",marginBottom:8,fontSize:12,color:C.primary}}>
            📈 Permanenza: <b>{gg} gg</b>
            {ipgVivo&&<> · IPG vivo: <b>{ipgVivo} kg/gg</b></>}
            {ipgCarc&&<> · IPG carcassa: <b>{ipgCarc} kg/gg</b></>}
          </div>
        );
      })()}

      <Field label="Note" value={form.note} onChange={v=>setForm(f=>({...f,note:v}))}/>
      <div style={{display:"flex",gap:10,marginTop:16}}>
        <Btn label={saving?"Salvataggio...":"Registra uscita"} icon="✓" onClick={salva}
          variant="success" disabled={saving||!form.motivo_uscita}/>
        <Btn label="Annulla" onClick={onCancel} variant="ghost"/>
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function RegistroUscite() {
  const [animali,setAnimali]=useState([]);
  const [loading,setLoading]=useState(true);
  const [subTab,setSubTab]=useState("attivi");
  const [formUscita,setFormUscita]=useState(null);

  // Filtri tab In Stalla
  const [filtroSpecie,setFiltroSpecie]=useState("tutti");
  const [cerca,setCerca]=useState("");

  // Filtro tab Usciti
  const [filtroUsciti,setFiltroUsciti]=useState("tutti");

  const carica=async()=>{
    setLoading(true);
    const{data,error}=await supabase
      .from("animali")
      .select("*")
      .order("specie")
      .order("nome");
    if(!error) setAnimali(data||[]);
    setLoading(false);
  };
  useEffect(()=>{carica();},[]);

  // Lista animali attivi filtrati
  const attivi = useMemo(()=>
    animali.filter(a=>{
      if(a.stato!=="attivo") return false;
      if(filtroSpecie!=="tutti"&&a.specie!==filtroSpecie) return false;
      if(!cerca.trim()) return true;
      const q=cerca.trim().toLowerCase();
      return (a.bdn||"").toLowerCase().includes(q)||
             (a.nome||"").toLowerCase().includes(q)||
             (a.bdn||"").slice(-4)===q||
             (a.lotto_box||"").toLowerCase().includes(q)||
             (a.razza||"").toLowerCase().includes(q);
    })
  ,[animali,filtroSpecie,cerca]);

  // Lista usciti filtrati
  const usciti = useMemo(()=>
    animali.filter(a=>{
      if(a.stato==="attivo") return false;
      if(filtroUsciti!=="tutti"&&a.specie!==filtroUsciti) return false;
      return true;
    })
  ,[animali,filtroUsciti]);

  const totAttivi  = animali.filter(a=>a.stato==="attivo").length;
  const macellati  = usciti.filter(a=>a.motivo_uscita?.toLowerCase().includes("macellat"));
  const totPesoVivo     = macellati.reduce((s,a)=>s+(a.peso_vivo_uscita||0),0);
  const totPesoCarcassa = macellati.reduce((s,a)=>s+(a.peso_carcassa||0),0);
  const resaMedia = totPesoVivo>0?Math.round(totPesoCarcassa/totPesoVivo*1000)/10:null;

  if(formUscita) return(
    <FormUscita animale={formUscita}
      onSave={()=>{setFormUscita(null);carica();}}
      onCancel={()=>setFormUscita(null)}/>
  );

  return(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,
      minHeight:"100vh",maxWidth:480,margin:"0 auto",paddingBottom:80}}>

      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.primary},${C.accent})`,
        borderRadius:"0 0 28px 28px",padding:"24px 20px 20px"}}>
        <div style={{fontSize:22,fontWeight:800,color:"#FFF"}}>📤 Registro Uscite</div>
        <div style={{fontSize:14,color:"rgba(255,255,255,0.75)",marginTop:4}}>
          {usciti.length} usciti · {totAttivi} in stalla
        </div>
      </div>

      {/* Sub tab */}
      <div style={{display:"flex",background:C.card,borderBottom:`1.5px solid ${C.border}`}}>
        {[["attivi",`📋 In stalla (${totAttivi})`],
          ["usciti", `📤 Usciti (${animali.filter(a=>a.stato!=="attivo").length})`]
        ].map(([id,label])=>(
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

        {/* ── TAB IN STALLA ─────────────────────────────────────────────── */}
        {subTab==="attivi"&&(
          <>
            {/* Filtri specie */}
            <FiltriSpecie valore={filtroSpecie} onChange={s=>{setFiltroSpecie(s);setCerca("");}}/>

            {/* Barra di ricerca */}
            <div style={{position:"relative",marginBottom:12}}>
              <span style={{position:"absolute",left:12,top:"50%",
                transform:"translateY(-50%)",fontSize:18,color:C.muted,
                pointerEvents:"none"}}>🔍</span>
              <input
                type="text"
                value={cerca}
                onChange={e=>setCerca(e.target.value)}
                placeholder={
                  filtroSpecie==="suino"
                    ?"Cerca per nome, matricola, ultime 4 cifre o lotto..."
                    :"Cerca per nome, matricola, ultime 4 cifre o razza..."
                }
                style={{...inputStyle,
                  border:`2px solid ${cerca?C.primary:C.border}`,
                  borderRadius:12,padding:"11px 40px 11px 42px",
                  boxShadow:cerca?`0 0 0 3px ${C.primary}22`:"none"}}
              />
              {cerca&&(
                <button onClick={()=>setCerca("")}
                  style={{position:"absolute",right:12,top:"50%",
                    transform:"translateY(-50%)",background:"none",
                    border:"none",cursor:"pointer",fontSize:18,color:C.muted}}>✕</button>
              )}
            </div>

            {/* Contatore */}
            {(cerca||filtroSpecie!=="tutti")&&(
              <div style={{fontSize:13,fontWeight:600,marginBottom:10,
                color:attivi.length>0?C.green:C.red,
                background:attivi.length>0?C.green+"12":C.red+"12",
                borderRadius:8,padding:"4px 10px",display:"inline-block"}}>
                {attivi.length>0?`✓ ${attivi.length} trovato/i`:"Nessun risultato"}
              </div>
            )}

            {/* Lista */}
            {loading?(
              <Spinner/>
            ):totAttivi===0?(
              <div style={{textAlign:"center",padding:40,color:C.muted}}>
                <div style={{fontSize:40,marginBottom:8}}>🐄</div>
                <div>Nessun animale in stalla</div>
              </div>
            ):attivi.length===0?(
              <div style={{textAlign:"center",padding:32,color:C.muted}}>
                <div style={{fontSize:36,marginBottom:8}}>🔍</div>
                <div>Nessun animale trovato</div>
                <button onClick={()=>{setCerca("");setFiltroSpecie("tutti");}}
                  style={{marginTop:10,background:C.primary,color:"#FFF",border:"none",
                    borderRadius:10,padding:"8px 16px",cursor:"pointer",fontSize:13}}>
                  Mostra tutti
                </button>
              </div>
            ):(
              attivi.map(a=>(
                <Card key={a.id} style={{borderLeft:`3px solid ${specieColor(a.specie)}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",gap:10,alignItems:"center",flex:1}}>
                      <div style={{background:specieColor(a.specie)+"20",
                        borderRadius:10,padding:8,fontSize:24,flexShrink:0}}>
                        {specieIcon(a.specie)}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:15}}>{a.nome||a.bdn||"—"}</div>
                        <div style={{fontSize:12,color:C.muted}}>
                          {a.bdn} · {a.razza_calcolata||a.razza||"—"}
                        </div>
                        <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                          <Badge label={specieLabel(a.specie)} color={specieColor(a.specie)}/>
                          <Badge label={a.sesso==="M"?"♂":"♀"} color={a.sesso==="M"?C.blue:"#B5547A"}/>
                          {a.categoria&&<Badge label={a.categoria} color={C.muted}/>}
                          {a.peso_attuale&&<Badge label={a.peso_attuale+"kg"} color={C.muted}/>}
                          {a.lotto_box&&<Badge label={"Lotto: "+a.lotto_box} color={C.suini}/>}
                        </div>
                      </div>
                    </div>
                    <Btn label="Uscita" icon="📤" onClick={()=>setFormUscita(a)}
                      variant="danger" small/>
                  </div>
                </Card>
              ))
            )}
          </>
        )}

        {/* ── TAB USCITI ─────────────────────────────────────────────────── */}
        {subTab==="usciti"&&(
          <>
            {/* Filtri specie usciti */}
            <FiltriSpecie valore={filtroUsciti} onChange={setFiltroUsciti}/>

            {/* Riepilogo macellazioni filtrate */}
            {macellati.length>0&&(
              <Card style={{background:`linear-gradient(135deg,${C.bovini}15,${C.card})`}}>
                <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:10}}>
                  🔪 MACELLAZIONI ({macellati.length} capi{filtroUsciti!=="tutti"?" · "+specieLabel(filtroUsciti):""})
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  {[
                    {label:"Peso vivo",val:totPesoVivo.toFixed(0)+"kg",col:C.primary},
                    {label:"Carcassa",val:totPesoCarcassa.toFixed(0)+"kg",col:C.bovini},
                    {label:"Resa media",val:resaMedia?resaMedia+"%":"—",col:C.green},
                  ].map(s=>(
                    <div key={s.label} style={{textAlign:"center",
                      background:s.col+"12",borderRadius:10,padding:"8px 4px"}}>
                      <div style={{fontSize:16,fontWeight:800,color:s.col}}>{s.val}</div>
                      <div style={{fontSize:10,color:C.muted}}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {loading?(
              <Spinner/>
            ):usciti.length===0?(
              <div style={{textAlign:"center",padding:40,color:C.muted}}>
                <div style={{fontSize:40,marginBottom:8}}>📤</div>
                <div>
                  {filtroUsciti!=="tutti"
                    ?"Nessuna uscita per "+specieLabel(filtroUsciti)
                    :"Nessuna uscita registrata"}
                </div>
              </div>
            ):(
              usciti.map(a=>{
                const gg=(a.data_uscita&&a.data_ingresso)
                  ?Math.round((new Date(a.data_uscita)-new Date(a.data_ingresso))/86400000)
                  :null;
                const col=motivoColor(a.motivo_uscita);
                return(
                  <Card key={a.id} style={{borderLeft:`4px solid ${col}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      alignItems:"flex-start",marginBottom:8}}>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <span style={{fontSize:22}}>{motivoIcon(a.motivo_uscita)}</span>
                        <div>
                          <div style={{fontWeight:700,fontSize:15}}>{a.nome||a.bdn||"—"}</div>
                          <div style={{fontSize:12,color:C.muted}}>
                            {a.bdn} · {a.razza_calcolata||a.razza||"—"}
                          </div>
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        {a.data_uscita&&<div style={{fontSize:13,color:C.muted}}>{a.data_uscita}</div>}
                        {gg>0&&<div style={{fontSize:11,color:C.blue}}>{gg}gg stalla</div>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                      <Badge label={specieIcon(a.specie)+" "+specieLabel(a.specie)} color={specieColor(a.specie)}/>
                      {a.motivo_uscita&&<Badge label={a.motivo_uscita} color={col}/>}
                    </div>
                    {(a.peso_vivo_uscita||a.peso_carcassa)&&(
                      <div style={{display:"flex",gap:12,fontSize:13,color:C.muted,marginTop:4,flexWrap:"wrap"}}>
                        {a.peso_vivo_uscita&&<span>⚖️ Vivo: <b>{a.peso_vivo_uscita}kg</b></span>}
                        {a.peso_carcassa&&<span>🥩 Carcassa: <b>{a.peso_carcassa}kg</b></span>}
                        {a.resa_percent&&<span style={{color:C.green}}>↩ <b>{a.resa_percent}%</b></span>}
                      </div>
                    )}
                    {/* IPG - Incremento Peso Giornaliero */}
                    {(()=>{
                      const gg = a.data_uscita&&a.data_ingresso
                        ? Math.round((new Date(a.data_uscita)-new Date(a.data_ingresso))/86400000) : 0;
                      const ipgVivo = gg>0&&a.peso_vivo_uscita ? Math.round(a.peso_vivo_uscita/gg*1000)/1000 : null;
                      const ipgCarc = gg>0&&a.peso_carcassa    ? Math.round(a.peso_carcassa/gg*1000)/1000 : null;
                      if(!ipgVivo&&!ipgCarc) return null;
                      return (
                        <div style={{display:"flex",gap:12,fontSize:12,color:C.muted,marginTop:3,flexWrap:"wrap"}}>
                          <span style={{color:C.primary}}>📈 {gg}gg</span>
                          {ipgVivo&&<span>IPG vivo: <b>{ipgVivo} kg/gg</b></span>}
                          {ipgCarc&&<span>IPG carcassa: <b>{ipgCarc} kg/gg</b></span>}
                        </div>
                      );
                    })()}
                    {a.note&&<div style={{fontSize:12,color:C.muted,marginTop:4,fontStyle:"italic"}}>{a.note}</div>}
                    <div style={{display:"flex",gap:6,marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                      <button onClick={()=>setFormUscita(a)}
                        style={{flex:1,background:C.blue+"18",border:"none",borderRadius:8,
                          padding:"7px 4px",cursor:"pointer",fontSize:11,fontWeight:700,color:C.blue}}>
                        ✏️ Modifica
                      </button>
                      <button onClick={async()=>{
                          if(!window.confirm(`Annullare l'uscita di ${a.nome||a.bdn} e riportarla ad "attivo"?\nI dati di uscita (data, motivo, pesi) verranno cancellati.`)) return;
                          const{error}=await supabase.from("animali").update({
                            stato:"attivo", vivo:true,
                            motivo_uscita:null, causa_morte:null, data_uscita:null,
                            peso_vivo_uscita:null, peso_carcassa:null, resa_percent:null,
                          }).eq("id",a.id);
                          if(error){ alert(`⚠️ Errore nell'annullamento:\n\n${error.message}`); return; }
                          carica();
                        }}
                        style={{flex:1,background:C.green+"18",border:"none",borderRadius:8,
                          padding:"7px 4px",cursor:"pointer",fontSize:11,fontWeight:700,color:C.green}}>
                        ↩️ Annulla
                      </button>
                      <button onClick={async()=>{
                          if(!window.confirm(`Eliminare DEFINITIVAMENTE la scheda di ${a.nome||a.bdn} (${a.bdn})?\nUsa questa opzione solo se l'animale è già stato reinserito altrove — questa operazione non è reversibile.`)) return;
                          const{error}=await supabase.from("animali").delete().eq("id",a.id);
                          if(error){
                            alert(`⚠️ Impossibile eliminare:\n\n${error.message}\n\nProbabile causa: la scheda è ancora collegata a un lotto (come madre/padre) o a un evento riproduttivo/sanitario.`);
                            return;
                          }
                          carica();
                        }}
                        style={{flex:1,background:"#00000015",border:"none",borderRadius:8,
                          padding:"7px 4px",cursor:"pointer",fontSize:11,fontWeight:700,color:C.muted}}>
                        🗑️ Elimina
                      </button>
                    </div>
                  </Card>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}
