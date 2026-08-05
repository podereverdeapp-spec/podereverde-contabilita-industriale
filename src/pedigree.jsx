import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx-js-style";

const C = {
  bg:"#F5F0E8", card:"#FFFFFF", primary:"#5C3D1E", accent:"#A0522D",
  green:"#4A7C59", red:"#C0392B", yellow:"#D4A017", blue:"#2C6E9B",
  text:"#2D1B0E", muted:"#8B7355", border:"#D4C4A8",
  bovini:"#8B6914", suini:"#B5547A", ovini:"#4A7C59",
  maschio:"#2C6E9B", femmina:"#B5547A", morto:"#999",
};
const specieColor = s=>({bovino:C.bovini,suino:C.suini,ovino:C.ovini}[s]||C.muted);
const specieIcon  = s=>({bovino:"🐄",suino:"🐷",ovino:"🐑"}[s]||"🐾");
const today = ()=>new Date().toISOString().split("T")[0];

// ─── UI BASE ──────────────────────────────────────────────────────────────────
const Card=({children,style={}})=>(
  <div style={{background:C.card,borderRadius:16,padding:16,marginBottom:12,
    boxShadow:"0 2px 8px rgba(0,0,0,0.07)",border:`1px solid ${C.border}`,...style}}>
    {children}
  </div>
);
const Badge=({label,color})=>(
  <span style={{background:color+"22",color,border:`1px solid ${color}44`,
    borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>{label}</span>
);
const Btn=({label,onClick,variant="primary",small=false,icon,disabled=false})=>{
  const s={primary:{bg:C.primary,fg:"#FFF"},success:{bg:C.green,fg:"#FFF"},
    danger:{bg:C.red,fg:"#FFF"},ghost:{bg:"transparent",fg:C.text},
    outline:{bg:"transparent",fg:C.primary}}[variant]||{bg:C.primary,fg:"#FFF"};
  return(
    <button onClick={onClick} disabled={disabled}
      style={{display:"inline-flex",alignItems:"center",gap:5,background:s.bg,
        color:s.fg,border:variant==="outline"?`1.5px solid ${C.primary}`:"none",
        borderRadius:10,padding:small?"6px 12px":"10px 18px",
        fontSize:small?13:15,fontWeight:600,cursor:disabled?"default":"pointer",
        opacity:disabled?0.5:1,boxShadow:["primary","success","danger"].includes(variant)?"0 2px 6px rgba(0,0,0,0.15)":"none"}}>
      {icon}{label}
    </button>
  );
};
const inputStyle={width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,
  borderRadius:10,padding:"10px 12px",fontSize:15,background:"#FAFAF8",color:C.text,outline:"none"};
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
    <div style={{fontSize:40,marginBottom:12}}>⏳</div>
    <div>Caricamento dati...</div>
  </div>
);

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getAntenati(id, animali, livelli=3) {
  const a = animali.find(x=>x.id===id);
  if (!a||livelli===0) return null;
  return {
    ...a,
    madre: a.madre_id ? getAntenati(a.madre_id, animali, livelli-1) : null,
    padre: a.padre_id ? getAntenati(a.padre_id, animali, livelli-1) : null,
  };
}
// Calcola tutti i consanguinei diretti di un animale con tipo di rapporto
function getConsanguineiDiretti(animale, animali) {
  const risultato = [];
  const seen = new Set([animale.id]); // evita duplicati
  const push = (a, tipo) => {
    if (!a || seen.has(a.id)) return;
    seen.add(a.id);
    risultato.push({...a, _rapporto: tipo});
  };

  // Padre e madre
  const padre = animale.padre_id ? animali.find(x=>x.id===animale.padre_id) : null;
  const madre = animale.madre_id ? animali.find(x=>x.id===animale.madre_id) : null;
  push(padre, "Padre");
  push(madre, "Madre");

  // Figli (chiunque abbia lui/lei come padre_id o madre_id)
  animali.filter(x =>
    x.padre_id===animale.id || x.madre_id===animale.id
  ).forEach(f => {
    const tipo = f.sesso==="M" ? "Figlio" : "Figlia";
    push(f, tipo);
  });

  // Fratelli/sorelle (stesso padre O stessa madre, ma non lui stesso)
  if (animale.padre_id || animale.madre_id) {
    animali.filter(x => x.id!==animale.id && (
      (animale.padre_id && x.padre_id===animale.padre_id) ||
      (animale.madre_id && x.madre_id===animale.madre_id)
    )).forEach(f => {
      const stessoPadre = animale.padre_id && f.padre_id===animale.padre_id;
      const stessaMadre = animale.madre_id && f.madre_id===animale.madre_id;
      const pieno = stessoPadre && stessaMadre;
      const tipo = pieno
        ? (f.sesso==="M" ? "Fratello pieno" : "Sorella piena")
        : (f.sesso==="M" ? "Fratellastro" : "Sorellastra");
      push(f, tipo);
    });
  }

  return risultato;
}

function getDiscendenti(id, animali) {
  return animali.filter(a=>a.madre_id===id||a.padre_id===id);
}

// ─── MINI CARD ANIMALE ────────────────────────────────────────────────────────
function MiniCard({a, onClick, generazione=0}) {
  if (!a) return (
    <div style={{background:C.border+"40",borderRadius:10,padding:"8px 12px",
      textAlign:"center",border:`1.5px dashed ${C.border}`}}>
      <div style={{fontSize:12,color:C.muted}}>sconosciuto</div>
    </div>
  );
  const vivo = a.vivo !== false && a.stato === "attivo";
  const col = !vivo ? C.morto : a.sesso==="M" ? C.maschio : C.femmina;
  const size = generazione===0 ? 16 : generazione===1 ? 14 : 12;
  return (
    <div onClick={onClick} style={{background:col+"12",borderRadius:10,padding:"8px 10px",
      border:`1.5px solid ${col}33`,cursor:onClick?"pointer":"default",position:"relative"}}>
      {!vivo && <span style={{position:"absolute",top:4,right:6,fontSize:10}}>✝</span>}
      <div style={{fontWeight:700,fontSize:size,color:vivo?C.text:C.morto,
        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.nome||a.bdn}</div>
      <div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.bdn}</div>
      {(a.razza_calcolata||a.razza)&&(
        <div style={{fontSize:10,color:C.accent,fontWeight:600,marginTop:2,
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          🧬 {a.razza_calcolata||a.razza}
        </div>
      )}
      <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
        <Badge label={a.sesso==="M"?"♂":"♀"} color={col}/>
        {!vivo&&<Badge label="uscito" color={C.morto}/>}
      </div>
    </div>
  );
}

// ─── ALBERO SVG ───────────────────────────────────────────────────────────────
function AlberoGenealogicoView({animale, animali, onSeleziona}) {
  const tree = getAntenati(animale.id, animali, 3);

  const Rettangolo = ({a, x, y, w=130, h=62, gen=0}) => {
    if (!a) return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={8} fill={C.border+"30"}
          stroke={C.border} strokeWidth={1} strokeDasharray="4"/>
        <text x={x+w/2} y={y+h/2+4} textAnchor="middle" fontSize={10} fill={C.muted}>sconosciuto</text>
      </g>
    );
    const vivo = a.vivo !== false && a.stato === "attivo";
    const col = !vivo ? C.morto : a.sesso==="M" ? C.maschio : C.femmina;
    const isSelected = a.id===animale.id;
    return (
      <g onClick={()=>a.id!==animale.id&&onSeleziona(a)} style={{cursor:a.id!==animale.id?"pointer":"default"}}>
        <rect x={x} y={y} width={w} height={h} rx={8} fill={col+"18"}
          stroke={isSelected?C.primary:col+"55"} strokeWidth={isSelected?2.5:1.5}/>
        <text x={x+8} y={y+15} fontSize={11} fontWeight="700" fill={vivo?C.text:C.morto}>
          {(a.nome||a.bdn||"—").substring(0,14)}
        </text>
        <text x={x+8} y={y+28} fontSize={9} fill={C.muted}>{(a.bdn||"").substring(0,18)}</text>
        {(a.razza_calcolata||a.razza)&&(
          <text x={x+8} y={y+41} fontSize={9} fill={C.accent} fontWeight="600">
            🧬 {(a.razza_calcolata||a.razza).substring(0,17)}
          </text>
        )}
        <text x={x+8} y={y+54} fontSize={9} fill={col} fontWeight="600">
          {a.sesso==="M"?"♂ Maschio":"♀ Femmina"}{!vivo?" · ✝":""}
        </text>
      </g>
    );
  };
  const Linea=({x1,y1,x2,y2})=>(
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.border} strokeWidth={1.5}/>
  );

  const W=150,H=56,GAP_X=20,GAP_Y=20;
  const svgW=W*4+GAP_X*3+40;
  const svgH=H*8+GAP_Y*7+40;
  const posX=gen=>20+gen*(W+GAP_X);
  const gen0Y=svgH/2-H/2;
  const madreY=gen0Y-H-GAP_Y*2;
  const padreY=gen0Y+H+GAP_Y*2;
  const mm=tree?.madre?.madre, mp=tree?.madre?.padre;
  const pm=tree?.padre?.madre, pp=tree?.padre?.padre;
  const mmY=madreY-H-GAP_Y, mpY=madreY+GAP_Y;
  const pmY=padreY-GAP_Y,   ppY=padreY+H+GAP_Y;

  return (
    <div style={{overflowX:"auto",overflowY:"auto",maxHeight:500,borderRadius:12,
      border:`1px solid ${C.border}`,background:"#FAFAF8"}}>
      <svg width={svgW} height={Math.max(400,svgH)} style={{display:"block"}}>
        <Rettangolo a={tree} x={posX(0)} y={gen0Y} w={W} h={H} gen={0}/>
        {tree?.madre&&<><Linea x1={posX(0)+W} y1={gen0Y+H/2} x2={posX(1)} y2={madreY+H/2}/>
          <Rettangolo a={tree.madre} x={posX(1)} y={madreY} w={W} h={H} gen={1}/></>}
        {tree?.padre&&<><Linea x1={posX(0)+W} y1={gen0Y+H/2} x2={posX(1)} y2={padreY+H/2}/>
          <Rettangolo a={tree.padre} x={posX(1)} y={padreY} w={W} h={H} gen={1}/></>}
        {mm&&<><Linea x1={posX(1)+W} y1={madreY+H/2} x2={posX(2)} y2={mmY+H/2}/>
          <Rettangolo a={mm} x={posX(2)} y={mmY} w={W} h={H} gen={2}/></>}
        {mp&&<><Linea x1={posX(1)+W} y1={madreY+H/2} x2={posX(2)} y2={mpY+H/2}/>
          <Rettangolo a={mp} x={posX(2)} y={mpY} w={W} h={H} gen={2}/></>}
        {pm&&<><Linea x1={posX(1)+W} y1={padreY+H/2} x2={posX(2)} y2={pmY+H/2}/>
          <Rettangolo a={pm} x={posX(2)} y={pmY} w={W} h={H} gen={2}/></>}
        {pp&&<><Linea x1={posX(1)+W} y1={padreY+H/2} x2={posX(2)} y2={ppY+H/2}/>
          <Rettangolo a={pp} x={posX(2)} y={ppY} w={W} h={H} gen={2}/></>}
        {["Soggetto","Genitori","Nonni"].map((l,i)=>(
          <text key={l} x={posX(i)+W/2} y={16} textAnchor="middle"
            fontSize={10} fontWeight="700" fill={C.muted}>{l}</text>
        ))}
      </svg>
    </div>
  );
}

// ─── SCHEDA PEDIGREE ──────────────────────────────────────────────────────────
function SchedaPedigree({animale, animali, parti, onBack, onSeleziona}) {
  const [tab, setTab] = useState("pedigree"); // pedigree | consanguineita
  const vivo = animale.vivo !== false && animale.stato === "attivo";
  const madre = animale.madre_id ? animali.find(a=>a.id===animale.madre_id) : null;
  const padre = animale.padre_id ? animali.find(a=>a.id===animale.padre_id) : null;
  const figli = getDiscendenti(animale.id, animali);
  const consanguinei = getConsanguineiDiretti(animale, animali);
  const mieiParti = parti
    .filter(p=>p.animale_id===animale.id)
    .sort((a,b)=>b.data_evento?.localeCompare(a.data_evento));

  return (
    <div style={{padding:"16px 16px 80px"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
        <span style={{fontSize:18,fontWeight:800,color:C.text}}>Pedigree</span>
      </div>

      <Card style={{borderLeft:`5px solid ${specieColor(animale.specie)}`,
        background:`linear-gradient(135deg,${specieColor(animale.specie)}12,${C.card})`}}>
        <div>
          <div style={{fontSize:22,fontWeight:800}}>
            {specieIcon(animale.specie)} {animale.nome||animale.bdn}
          </div>
          <div style={{fontSize:13,color:C.muted}}>
            {animale.bdn} · {animale.razza_calcolata||animale.razza||"—"}
          </div>
          <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
            <Badge label={animale.sesso==="M"?"♂ Maschio":"♀ Femmina"}
              color={animale.sesso==="M"?C.maschio:C.femmina}/>
            {animale.nascita&&<Badge label={`nato ${animale.nascita}`} color={C.muted}/>}
            {animale.razza_calcolata==="METICCIA"&&<Badge label="🧬 Meticcio" color={C.accent}/>}
            {!vivo&&<Badge label="✝ Uscito" color={C.morto}/>}
            {consanguinei.length>0&&(
              <Badge label={`🚫 ${consanguinei.length} consanguinei`} color={C.red}/>
            )}
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div style={{display:"flex",gap:8,marginBottom:14,marginTop:12}}>
        <button onClick={()=>setTab("pedigree")}
          style={{background:tab==="pedigree"?C.primary:"transparent",
            color:tab==="pedigree"?"#FFF":C.muted,
            border:`1.5px solid ${tab==="pedigree"?C.primary:C.border}`,
            borderRadius:20,padding:"6px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
          🌳 Pedigree
        </button>
        <button onClick={()=>setTab("consanguineita")}
          style={{background:tab==="consanguineita"?C.red:"transparent",
            color:tab==="consanguineita"?"#FFF":C.muted,
            border:`1.5px solid ${tab==="consanguineita"?C.red:C.border}`,
            borderRadius:20,padding:"6px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
          🚫 Consanguineità {consanguinei.length>0&&`(${consanguinei.length})`}
        </button>
      </div>

      {/* VISTA CONSANGUINEITÀ */}
      {tab==="consanguineita"&&(
        <>
          <div style={{background:C.red+"12",border:`1px solid ${C.red}33`,
            borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:13,color:C.text}}>
            ⚠️ <strong>Riproduzione impedita</strong> con i seguenti animali per evitare consanguineità diretta.
            {vivo&&animale.sesso==="F"&&<span> Non accoppiare con i maschi elencati.</span>}
            {vivo&&animale.sesso==="M"&&<span> Non accoppiare con le femmine elencate.</span>}
          </div>

          {consanguinei.length===0?(
            <div style={{textAlign:"center",padding:36,color:C.muted}}>
              <div style={{fontSize:44,marginBottom:8}}>✓</div>
              <div style={{fontWeight:700,fontSize:15}}>Nessun consanguineo registrato</div>
              <div style={{fontSize:12,marginTop:6}}>
                Questo animale non ha genitori, figli o fratelli tracciati nel database
              </div>
            </div>
          ):(
            <>
              {/* Raggruppamento per tipo */}
              {["Padre","Madre","Figlio","Figlia","Fratello pieno","Sorella piena","Fratellastro","Sorellastra"].map(tipo=>{
                const gruppo = consanguinei.filter(c=>c._rapporto===tipo);
                if(gruppo.length===0) return null;
                const isFemmina = tipo.includes("Madre")||tipo.includes("Figlia")||tipo.includes("Sorella");
                const colTipo = isFemmina ? C.femmina : C.maschio;
                return (
                  <div key={tipo} style={{marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:colTipo,
                      marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>
                      {isFemmina?"♀":"♂"} {tipo}{gruppo.length>1?` (${gruppo.length})`:""}
                    </div>
                    {gruppo.map(c=>{
                      const vivoC = c.vivo!==false&&c.stato==="attivo";
                      return (
                        <div key={c.id} onClick={()=>onSeleziona(c)}
                          style={{background:C.card,borderRadius:12,padding:"10px 12px",
                            marginBottom:6,border:`1px solid ${C.border}`,
                            borderLeft:`4px solid ${colTipo}`,cursor:"pointer",
                            opacity:vivoC?1:0.55,
                            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <div style={{fontWeight:700,fontSize:14}}>
                              {c.nome||c.bdn||"—"}
                            </div>
                            <div style={{fontSize:11,color:C.muted}}>
                              {c.bdn}{(c.razza_calcolata||c.razza)?` · 🧬 ${c.razza_calcolata||c.razza}`:""}
                              {c.nascita&&` · nato ${c.nascita}`}
                            </div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            {!vivoC&&<Badge label="✝" color={C.morto}/>}
                            {vivoC&&<span style={{fontSize:20,color:C.red}}>🚫</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </>
      )}

      {/* VISTA PEDIGREE (originale) */}
      {tab==="pedigree"&&<>

      {/* Genitori */}
      <div style={{fontSize:12,fontWeight:700,color:C.muted,
        margin:"12px 0 8px",textTransform:"uppercase",letterSpacing:1}}>Genitori</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,color:C.femmina,marginBottom:4}}>♀ MADRE</div>
          <MiniCard a={madre} onClick={madre?()=>onSeleziona(madre):null} generazione={1}/>
        </div>
        <div>
          <div style={{fontSize:11,fontWeight:700,color:C.maschio,marginBottom:4}}>♂ PADRE</div>
          <MiniCard a={padre} onClick={padre?()=>onSeleziona(padre):null} generazione={1}/>
        </div>
      </div>

      {/* Albero */}
      <div style={{fontSize:12,fontWeight:700,color:C.muted,
        margin:"12px 0 8px",textTransform:"uppercase",letterSpacing:1}}>
        Albero genealogico (3 generazioni)
      </div>
      <AlberoGenealogicoView animale={animale} animali={animali} onSeleziona={onSeleziona}/>

      {/* Discendenti */}
      {figli.length>0&&<>
        <div style={{fontSize:12,fontWeight:700,color:C.muted,
          margin:"16px 0 8px",textTransform:"uppercase",letterSpacing:1}}>
          Discendenti diretti ({figli.length})
        </div>
        {figli.map(f=>(
          <div key={f.id} onClick={()=>onSeleziona(f)}
            style={{background:C.card,borderRadius:12,padding:"10px 14px",marginBottom:8,
              border:`1.5px solid ${C.border}`,cursor:"pointer",
              borderLeft:`3px solid ${f.sesso==="M"?C.maschio:C.femmina}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:14}}>{f.nome||f.bdn}</div>
                <div style={{fontSize:12,color:C.muted}}>
                  {f.bdn} · {f.nascita} · {f.razza_calcolata||f.razza||"—"}
                </div>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <Badge label={f.sesso==="M"?"♂":"♀"} color={f.sesso==="M"?C.maschio:C.femmina}/>
                <span style={{color:C.muted,fontSize:16}}>›</span>
              </div>
            </div>
          </div>
        ))}
      </>}

      {/* Storico parti */}
      {mieiParti.length>0&&<>
        <div style={{fontSize:12,fontWeight:700,color:C.muted,
          margin:"16px 0 8px",textTransform:"uppercase",letterSpacing:1}}>
          Storico parti ({mieiParti.length})
        </div>
        {mieiParti.map(p=>{
          const figliParto = animali.filter(a=>a.nascita===p.data_evento&&a.madre_id===animale.id);
          const altroGenitore = animale.sesso==="F"
            ? animali.find(a=>a.id===p.padre_id)
            : null;
          return (
            <Card key={p.id} style={{borderLeft:`3px solid ${C.green}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontWeight:700}}>📅 {p.data_evento}</span>
                <div style={{display:"flex",gap:6}}>
                  {p.nati_vivi>0&&<Badge label={`${p.nati_vivi} vivi`} color={C.green}/>}
                  {p.nati_morti>0&&<Badge label={`${p.nati_morti} morti`} color={C.red}/>}
                </div>
              </div>
              {altroGenitore&&(
                <div style={{fontSize:13,color:C.muted,marginBottom:6}}>
                  ♂ Padre: <b>{altroGenitore.nome||altroGenitore.bdn}</b>
                </div>
              )}
              {p.note&&<div style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>{p.note}</div>}
              {figliParto.length>0&&figliParto.map(f=>(
                <div key={f.id} onClick={()=>onSeleziona(f)}
                  style={{background:C.bg,borderRadius:8,padding:"6px 10px",marginTop:6,
                    fontSize:13,cursor:"pointer",display:"flex",
                    justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <span style={{fontWeight:700}}>{f.nome||f.bdn}</span>
                    <span style={{color:f.sesso==="M"?C.maschio:C.femmina,marginLeft:6}}>
                      {f.sesso==="M"?"♂":"♀"}
                    </span>
                    {f.peso_nascita&&<span style={{color:C.muted}}> · {f.peso_nascita}kg</span>}
                  </div>
                  <span style={{color:C.muted}}>›</span>
                </div>
              ))}
            </Card>
          );
        })}
      </>}
      </>}
    </div>
  );
}

// ─── LISTA ANIMALI ────────────────────────────────────────────────────────────
function ListaAnimali({animali, parti, onSeleziona, onReport}) {
  const [filtroSpecie,setFiltroSpecie]=useState("tutti");
  const [filtroSesso,setFiltroSesso]=useState("tutti");
  const [filtroStato,setFiltroStato]=useState("attivi");
  const [cerca,setCerca]=useState("");

  const lista=useMemo(()=>
    animali.filter(a=>{
      if(filtroSpecie!=="tutti"&&a.specie!==filtroSpecie) return false;
      if(filtroSesso!=="tutti"&&a.sesso!==filtroSesso) return false;
      if(filtroStato==="attivi"&&a.stato!=="attivo") return false;
      if(filtroStato==="usciti"&&a.stato==="attivo") return false;
      if(cerca&&!(a.bdn+""+(a.nome||"")).toLowerCase().includes(cerca.toLowerCase())) return false;
      return true;
    }).sort((a,b)=>(a.bdn||"").localeCompare(b.bdn||""))
  ,[animali,filtroSpecie,filtroSesso,filtroStato,cerca]);

  const conPedigree=animali.filter(a=>a.madre_id||a.padre_id).length;
  const totParti=parti.length;

  return (
    <div style={{paddingBottom:80}}>
      <div style={{background:`linear-gradient(135deg,${C.primary},${C.accent})`,
        borderRadius:"0 0 28px 28px",padding:"28px 20px 24px",marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
          <div style={{flex:1}}>
            <div style={{fontSize:22,fontWeight:800,color:"#FFF"}}>🧬 Registro Genealogico</div>
            <div style={{fontSize:14,color:"rgba(255,255,255,0.75)",marginTop:4}}>
              {animali.length} animali · {conPedigree} con pedigree · {totParti} parti
            </div>
          </div>
          {onReport&&(
            <button onClick={onReport}
              style={{background:"rgba(255,255,255,0.2)",border:"1.5px solid rgba(255,255,255,0.4)",
                borderRadius:12,padding:"8px 12px",cursor:"pointer",flexShrink:0,
                color:"#FFF",fontSize:12,fontWeight:700}}>
              🚫 Consanguineità
            </button>
          )}
        </div>
      </div>

      <div style={{padding:"0 16px"}}>
        <input placeholder="🔍  Cerca per BDN o nome..." value={cerca}
          onChange={e=>setCerca(e.target.value)} style={{...inputStyle,marginBottom:12}}/>

        <div style={{display:"flex",gap:8,marginBottom:12,overflowX:"auto",paddingBottom:4}}>
          {["tutti","bovino","suino","ovino"].map(s=>(
            <button key={s} onClick={()=>setFiltroSpecie(s)}
              style={{background:filtroSpecie===s?C.primary:C.card,
                color:filtroSpecie===s?"#FFF":C.muted,
                border:`1.5px solid ${filtroSpecie===s?C.primary:C.border}`,
                borderRadius:20,padding:"5px 14px",fontSize:12,fontWeight:600,
                cursor:"pointer",whiteSpace:"nowrap"}}>
              {s==="tutti"?"Tutte":specieIcon(s)+" "+s.charAt(0).toUpperCase()+s.slice(1)}
            </button>
          ))}
          {["tutti","M","F"].map(s=>(
            <button key={s} onClick={()=>setFiltroSesso(s)}
              style={{background:filtroSesso===s?(s==="M"?C.maschio:s==="F"?C.femmina:C.blue):C.card,
                color:filtroSesso===s?"#FFF":C.muted,
                border:`1.5px solid ${filtroSesso===s?(s==="M"?C.maschio:s==="F"?C.femmina:C.blue):C.border}`,
                borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
              {s==="tutti"?"♂♀ Tutti":s==="M"?"♂ Maschi":"♀ Femmine"}
            </button>
          ))}
        </div>

        <div style={{display:"flex",gap:8,marginBottom:12,overflowX:"auto",paddingBottom:4}}>
          {[
            {v:"attivi",l:"✅ Attivi",col:"#4A7C59"},
            {v:"usciti",l:"📤 Usciti",col:"#C0392B"},
            {v:"tutti",l:"Tutti",col:C.primary},
          ].map(x=>(
            <button key={x.v} onClick={()=>setFiltroStato(x.v)}
              style={{background:filtroStato===x.v?x.col:C.card,
                color:filtroStato===x.v?"#FFF":C.muted,
                border:`1.5px solid ${filtroStato===x.v?x.col:C.border}`,
                borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
              {x.l}
            </button>
          ))}
        </div>

        {lista.length===0&&(
          <div style={{textAlign:"center",padding:40,color:C.muted}}>
            <div style={{fontSize:40,marginBottom:8}}>🧬</div>
            <div>Nessun animale trovato</div>
          </div>
        )}

        {lista.map(a=>{
          const madre=a.madre_id?animali.find(x=>x.id===a.madre_id):null;
          const padre=a.padre_id?animali.find(x=>x.id===a.padre_id):null;
          const nFigli=getDiscendenti(a.id,animali).length;
          const vivo=a.vivo!==false&&a.stato==="attivo";
          const col=!vivo?C.morto:a.sesso==="M"?C.maschio:C.femmina;
          return (
            <div key={a.id} onClick={()=>onSeleziona(a)}
              style={{background:C.card,borderRadius:16,padding:14,marginBottom:10,
                boxShadow:"0 2px 8px rgba(0,0,0,0.07)",border:`1px solid ${C.border}`,
                borderLeft:`4px solid ${col}`,opacity:vivo?1:0.7,cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:15}}>
                    {specieIcon(a.specie)} {a.nome||a.bdn||"—"}
                  </div>
                  <div style={{fontSize:12,color:C.muted}}>
                    {a.bdn} · {a.razza_calcolata||a.razza||"—"} · {a.nascita||"—"}
                  </div>
                  <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                    <Badge label={a.sesso==="M"?"♂ M":"♀ F"} color={col}/>
                    {a.razza_calcolata==="METICCIA"&&<Badge label="🧬 Meticcio" color={C.accent}/>}
                    {!vivo&&<Badge label="✝" color={C.morto}/>}
                    {(madre||padre)&&<Badge label="pedigree ✓" color={C.green}/>}
                    {nFigli>0&&<Badge label={`${nFigli} figli`} color={C.primary}/>}
                  </div>
                  {(madre||padre)&&(
                    <div style={{fontSize:11,color:C.muted,marginTop:4}}>
                      {madre&&`♀ ${madre.nome||madre.bdn}`}
                      {madre&&padre&&" · "}
                      {padre&&`♂ ${padre.nome||padre.bdn}`}
                    </div>
                  )}
                </div>
                <span style={{color:C.muted,fontSize:16,marginLeft:8}}>›</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── REPORT CONSANGUINEITÀ ──────────────────────────────────────────────────
// A) Accoppiamenti a rischio: maschi × femmine attivi che sono consanguinei
function analizzaAccoppiamentiRischio(animali) {
  const attivi = animali.filter(a=>a.stato==="attivo"&&a.vivo!==false);
  const maschi   = attivi.filter(a=>a.sesso==="M");
  const femmine  = attivi.filter(a=>a.sesso==="F");
  const rischi = [];

  for(const m of maschi){
    for(const f of femmine){
      if(m.specie!==f.specie) continue; // solo stessa specie
      // Padre-Figlia
      if(f.padre_id===m.id) rischi.push({m,f,tipo:"Padre × Figlia",gravita:"Diretto"});
      // Madre-Figlio (m è figlio di f)
      else if(m.madre_id===f.id) rischi.push({m,f,tipo:"Madre × Figlio",gravita:"Diretto"});
      // Fratelli/sorelle
      else {
        const stessoPadre = m.padre_id&&f.padre_id&&m.padre_id===f.padre_id;
        const stessaMadre = m.madre_id&&f.madre_id&&m.madre_id===f.madre_id;
        if(stessoPadre&&stessaMadre)
          rischi.push({m,f,tipo:"Fratelli pieni",gravita:"Diretto"});
        else if(stessoPadre||stessaMadre)
          rischi.push({m,f,tipo:stessoPadre?"Fratellastri (stesso padre)":"Fratellastri (stessa madre)",gravita:"Diretto"});
      }
    }
  }
  return rischi;
}

// B) Capi già nati da unioni consanguinee
function analizzaCapiInconsanguinei(animali) {
  const result = [];
  for(const a of animali){
    if(a.stato!=="attivo"||a.vivo===false) continue;
    if(!a.padre_id||!a.madre_id) continue;
    const padre = animali.find(x=>x.id===a.padre_id);
    const madre = animali.find(x=>x.id===a.madre_id);
    if(!padre||!madre) continue;

    // Verifico se padre e madre sono consanguinei tra loro
    let tipo = null;
    // Padre-Figlia (madre è figlia del padre)
    if(madre.padre_id===padre.id) tipo="Padre × Figlia";
    // Madre-Figlio (padre è figlio della madre)
    else if(padre.madre_id===madre.id) tipo="Madre × Figlio";
    else {
      // Fratelli tra loro
      const stessoPadre = padre.padre_id&&madre.padre_id&&padre.padre_id===madre.padre_id;
      const stessaMadre = padre.madre_id&&madre.madre_id&&padre.madre_id===madre.madre_id;
      if(stessoPadre&&stessaMadre) tipo="Genitori fratelli pieni";
      else if(stessoPadre||stessaMadre) tipo="Genitori fratellastri";
    }
    if(tipo) result.push({a,padre,madre,tipo});
  }
  return result;
}

function esportaConsanguineita(rischi, capi) {
  const wb = XLSX.utils.book_new();

  // Foglio 1: Accoppiamenti a rischio
  const foglioA = rischi.map(r=>({
    "Tipo rischio": r.tipo,
    "Maschio (BDN)": r.m.bdn||"",
    "Maschio (Nome)": r.m.nome||"",
    "Maschio (Razza)": r.m.razza_calcolata||r.m.razza||"",
    "Femmina (BDN)": r.f.bdn||"",
    "Femmina (Nome)": r.f.nome||"",
    "Femmina (Razza)": r.f.razza_calcolata||r.f.razza||"",
    "Specie": r.m.specie,
  }));
  const wsA = XLSX.utils.json_to_sheet(foglioA.length>0?foglioA:[{"Info":"Nessun accoppiamento a rischio rilevato"}]);
  wsA["!cols"] = [{wch:20},{wch:20},{wch:16},{wch:16},{wch:20},{wch:16},{wch:16},{wch:10}];
  XLSX.utils.book_append_sheet(wb, wsA, "Accoppiamenti a rischio");

  // Foglio 2: Capi con consanguineità
  const foglioB = capi.map(x=>({
    "BDN": x.a.bdn||"",
    "Nome": x.a.nome||"",
    "Specie": x.a.specie,
    "Razza calcolata": x.a.razza_calcolata||x.a.razza||"",
    "Sesso": x.a.sesso,
    "Data nascita": x.a.nascita||"",
    "Tipo consanguineità genitori": x.tipo,
    "Padre (BDN)": x.padre.bdn||"",
    "Padre (Nome)": x.padre.nome||"",
    "Madre (BDN)": x.madre.bdn||"",
    "Madre (Nome)": x.madre.nome||"",
  }));
  const wsB = XLSX.utils.json_to_sheet(foglioB.length>0?foglioB:[{"Info":"Nessun capo con consanguineità nella genealogia"}]);
  wsB["!cols"] = [{wch:20},{wch:16},{wch:10},{wch:18},{wch:8},{wch:12},{wch:26},{wch:20},{wch:16},{wch:20},{wch:16}];
  XLSX.utils.book_append_sheet(wb, wsB, "Capi con consanguineità");

  XLSX.writeFile(wb, `Consanguineita_Podere_Verde_${new Date().toISOString().split("T")[0]}.xlsx`);
}

// Vista report consanguineità
function ReportConsanguineita({animali, onBack, onSeleziona}) {
  const [tab, setTab] = useState("rischi"); // rischi | capi
  const rischi = useMemo(()=>analizzaAccoppiamentiRischio(animali),[animali]);
  const capi   = useMemo(()=>analizzaCapiInconsanguinei(animali),[animali]);

  const rischiPerSpecie = {};
  rischi.forEach(r=>{
    const sp = r.m.specie;
    if(!rischiPerSpecie[sp]) rischiPerSpecie[sp]=[];
    rischiPerSpecie[sp].push(r);
  });

  return (
    <div style={{paddingBottom:80}}>
      <div style={{background:`linear-gradient(135deg,${C.red},${C.primary})`,
        borderRadius:"0 0 24px 24px",padding:"20px 16px 20px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
          <button onClick={onBack} style={{background:"rgba(255,255,255,0.2)",
            border:"none",borderRadius:10,padding:"6px 10px",color:"#FFF",
            cursor:"pointer",fontSize:18}}>←</button>
          <div>
            <div style={{fontSize:17,fontWeight:800,color:"#FFF"}}>🚫 Report Consanguineità</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.8)"}}>
              {rischi.length} accoppiamenti a rischio · {capi.length} capi con genealogia consanguinea
            </div>
          </div>
        </div>
      </div>

      <div style={{padding:"14px"}}>
        {/* Tabs */}
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          <button onClick={()=>setTab("rischi")}
            style={{background:tab==="rischi"?C.red:"transparent",
              color:tab==="rischi"?"#FFF":C.muted,
              border:`1.5px solid ${tab==="rischi"?C.red:C.border}`,
              borderRadius:20,padding:"6px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            ⚠️ Accoppiamenti a rischio ({rischi.length})
          </button>
          <button onClick={()=>setTab("capi")}
            style={{background:tab==="capi"?C.accent:"transparent",
              color:tab==="capi"?"#FFF":C.muted,
              border:`1.5px solid ${tab==="capi"?C.accent:C.border}`,
              borderRadius:20,padding:"6px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            🧬 Capi consanguinei ({capi.length})
          </button>
          <button onClick={()=>esportaConsanguineita(rischi,capi)}
            style={{background:C.green,color:"#FFF",border:"none",borderRadius:20,
              padding:"6px 14px",fontSize:13,fontWeight:700,cursor:"pointer",marginLeft:"auto"}}>
            📊 Excel
          </button>
        </div>

        {/* Tab A: Accoppiamenti a rischio */}
        {tab==="rischi"&&(
          <>
            <div style={{background:C.red+"12",border:`1px solid ${C.red}33`,
              borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:12,color:C.text}}>
              ⚠️ <strong>Prevenzione:</strong> potenziali accoppiamenti tra maschi e femmine attivi
              della stessa specie che sono consanguinei. Da evitare durante la stagione di monta.
            </div>
            {rischi.length===0?(
              <div style={{textAlign:"center",padding:36,color:C.muted}}>
                <div style={{fontSize:44,marginBottom:8}}>✓</div>
                <div style={{fontWeight:700,fontSize:15}}>Nessun accoppiamento a rischio</div>
                <div style={{fontSize:12,marginTop:6}}>
                  Nessuna coppia maschio-femmina attiva risulta consanguinea diretta
                </div>
              </div>
            ):(
              Object.entries(rischiPerSpecie).map(([sp,arr])=>(
                <div key={sp} style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:specieColor(sp),
                    marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>
                    {specieIcon(sp)} {sp} · {arr.length} coppie a rischio
                  </div>
                  {arr.map((r,i)=>(
                    <div key={i} style={{background:C.card,borderRadius:12,padding:"10px 12px",
                      marginBottom:6,border:`1px solid ${C.border}`,
                      borderLeft:`4px solid ${C.red}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.red,marginBottom:4}}>
                            🚫 {r.tipo}
                          </div>
                          <div onClick={()=>onSeleziona(r.m)}
                            style={{fontSize:12,color:C.maschio,fontWeight:600,cursor:"pointer",
                              marginBottom:2}}>
                            ♂ {r.m.nome||r.m.bdn} <span style={{color:C.muted,fontWeight:400}}>· {r.m.bdn}</span>
                          </div>
                          <div onClick={()=>onSeleziona(r.f)}
                            style={{fontSize:12,color:C.femmina,fontWeight:600,cursor:"pointer"}}>
                            ♀ {r.f.nome||r.f.bdn} <span style={{color:C.muted,fontWeight:400}}>· {r.f.bdn}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </>
        )}

        {/* Tab B: Capi già nati da unioni consanguinee */}
        {tab==="capi"&&(
          <>
            <div style={{background:C.accent+"12",border:`1px solid ${C.accent}33`,
              borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:12,color:C.text}}>
              🧬 <strong>Monitoraggio:</strong> capi attivi in azienda i cui genitori risultano
              consanguinei tra loro. Da valutare per la qualità genetica del patrimonio.
            </div>
            {capi.length===0?(
              <div style={{textAlign:"center",padding:36,color:C.muted}}>
                <div style={{fontSize:44,marginBottom:8}}>✓</div>
                <div style={{fontWeight:700,fontSize:15}}>Nessun capo con consanguineità</div>
                <div style={{fontSize:12,marginTop:6}}>
                  Non risultano capi nati da accoppiamenti consanguinei diretti
                </div>
              </div>
            ):(
              capi.map((x,i)=>(
                <div key={i} onClick={()=>onSeleziona(x.a)}
                  style={{background:C.card,borderRadius:12,padding:"10px 12px",
                    marginBottom:6,border:`1px solid ${C.border}`,
                    borderLeft:`4px solid ${C.accent}`,cursor:"pointer"}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.accent,marginBottom:4}}>
                    🧬 {x.tipo}
                  </div>
                  <div style={{fontWeight:700,fontSize:14}}>
                    {specieIcon(x.a.specie)} {x.a.nome||x.a.bdn}
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:6}}>
                    {x.a.bdn} · {x.a.razza_calcolata||x.a.razza||"—"} · {x.a.sesso==="M"?"♂":"♀"} · nato {x.a.nascita||"—"}
                  </div>
                  <div style={{fontSize:11,color:C.muted,paddingTop:6,
                    borderTop:`1px solid ${C.border}`}}>
                    ♂ Padre: <b>{x.padre.nome||x.padre.bdn}</b> ({x.padre.bdn})
                    <br/>
                    ♀ Madre: <b>{x.madre.nome||x.madre.bdn}</b> ({x.madre.bdn})
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function Pedigree() {
  const [animali,setAnimali]=useState([]);
  const [parti,setParti]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState("lista");
  const [selected,setSelected]=useState(null);

  useEffect(()=>{
    const carica=async()=>{
      setLoading(true);
      const[{data:anim},{data:part}]=await Promise.all([
        supabase.from("animali").select("*").order("created_at",{ascending:false}),
        supabase.from("eventi_riproduttivi").select("*")
          .eq("tipo_evento","parto").order("data_evento",{ascending:false}),
      ]);
      setAnimali(anim||[]);
      setParti(part||[]);
      setLoading(false);
    };
    carica();
  },[]);

  const wrap=ch=>(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,
      minHeight:"100vh",maxWidth:480,margin:"0 auto"}}>
      {ch}
    </div>
  );

  if(loading) return wrap(<Spinner/>);

  if(view==="scheda"&&selected) return wrap(
    <SchedaPedigree
      animale={selected} animali={animali} parti={parti}
      onBack={()=>setView("lista")}
      onSeleziona={a=>{setSelected(a);setView("scheda");}}
    />
  );

  if(view==="report") return wrap(
    <ReportConsanguineita
      animali={animali}
      onBack={()=>setView("lista")}
      onSeleziona={a=>{setSelected(a);setView("scheda");}}
    />
  );

  return wrap(
    <ListaAnimali
      animali={animali} parti={parti}
      onReport={()=>setView("report")}
      onSeleziona={a=>{setSelected(a);setView("scheda");}}
    />
  );
}
