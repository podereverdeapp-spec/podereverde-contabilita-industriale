import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";

const C = {
  bg:"#F5F0E8", card:"#FFFFFF", primary:"#5C3D1E", accent:"#A0522D",
  green:"#4A7C59", red:"#C0392B", yellow:"#D4A017", blue:"#2C6E9B",
  text:"#2D1B0E", muted:"#8B7355", border:"#D4C4A8",
  gold:"#C9920A", silver:"#7A8A99", bronze:"#9E6B3A",
  bovini:"#8B6914", suini:"#B5547A", ovini:"#4A7C59",
};
const specieColor=s=>({bovino:C.bovini,suino:C.suini,ovino:C.ovini}[s]||C.muted);
const specieIcon=s=>({bovino:"🐄",suino:"🐷",ovino:"🐑"}[s]||"🐾");
const daysBetween=(d1,d2)=>Math.max(1,Math.round((new Date(d2)-new Date(d1))/86400000));
const today=()=>new Date().toISOString().split("T")[0];

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
const Spinner=()=>(
  <div style={{textAlign:"center",padding:60,color:C.muted}}>
    <div style={{fontSize:40,marginBottom:12}}>⏳</div>
    <div>Caricamento KPI...</div>
  </div>
);

// ─── CALCOLO KPI ─────────────────────────────────────────────────────────────
function calcolaKPI(animaleId, animali, parti) {
  const mieiParti = parti.filter(p=>p.animale_id===animaleId)
    .sort((a,b)=>a.data_evento?.localeCompare(b.data_evento));
  if (mieiParti.length===0) return null;

  const rip = animali.find(a=>a.id===animaleId);
  if (!rip) return null;
  const anni = rip.nascita
    ? Math.max(0.5, daysBetween(rip.nascita, today())/365)
    : 1;

  // IIP - intervalli tra parti consecutivi
  const iipValues = [];
  for (let i=1; i<mieiParti.length; i++) {
    if (mieiParti[i-1].data_evento && mieiParti[i].data_evento) {
      iipValues.push(daysBetween(mieiParti[i-1].data_evento, mieiParti[i].data_evento));
    }
  }
  const iipMedio = iipValues.length>0
    ? Math.round(iipValues.reduce((a,b)=>a+b,0)/iipValues.length)
    : null;

  const totNatiVivi  = mieiParti.reduce((s,p)=>s+(p.nati_vivi||0),0);
  const totNatiMorti = mieiParti.reduce((s,p)=>s+(p.nati_morti||0),0);
  const totNati      = totNatiVivi + totNatiMorti;
  const pctNatiVivi  = totNati>0 ? Math.round(totNatiVivi/totNati*1000)/10 : null;
  const prolificita  = mieiParti.length>0
    ? Math.round(totNatiVivi/mieiParti.length*10)/10
    : null;

  // Figli nati in azienda
  const figli = animali.filter(a=>a.madre_id===animaleId||a.padre_id===animaleId);
  const pesoNascitaFigli = figli
    .filter(f=>f.peso_nascita)
    .map(f=>f.peso_nascita);
  const pesoMedioNati = pesoNascitaFigli.length>0
    ? Math.round(pesoNascitaFigli.reduce((a,b)=>a+b,0)/pesoNascitaFigli.length*10)/10
    : null;

  const etaPrimoParto = rip.nascita && mieiParti[0]?.data_evento
    ? Math.round(daysBetween(rip.nascita, mieiParti[0].data_evento)/30)
    : null;

  // Carriera riproduttiva: giorni dal primo parto ad oggi (o all'ultimo parto se uscita)
  const dataUltima = rip.stato==="attivo" ? today() : (rip.data_uscita||today());
  const giorniCarriera = mieiParti[0]?.data_evento
    ? daysBetween(mieiParti[0].data_evento, dataUltima)
    : 0;

  // Produttività annua stimata = figli vivi × 365 / giorni carriera
  const prodAnnua = giorniCarriera>0
    ? Math.round(totNatiVivi * 365 / giorniCarriera * 10)/10
    : null;

  // ── Statistiche macellazione figli (indicatore genetico) ─────────────────
  // Filtro solo figli con dati completi peso vivo + peso carcassa
  const figliMacellati = figli.filter(f=>
    f.peso_vivo_uscita&&f.peso_carcassa&&f.resa_percent
  );
  const rese = figliMacellati.map(f=>f.resa_percent);
  const resaMediaFigli = rese.length>0
    ? Math.round(rese.reduce((a,b)=>a+b,0)/rese.length*10)/10
    : null;
  const resaMinFigli = rese.length>0 ? Math.min(...rese) : null;
  const resaMaxFigli = rese.length>0 ? Math.max(...rese) : null;

  // IPG carcassa medio dei figli macellati (kg/gg)
  const ipgCarcFigli = figliMacellati
    .map(f=>{
      const gg = f.data_uscita&&f.data_ingresso
        ? daysBetween(f.data_ingresso, f.data_uscita) : 0;
      return gg>0 ? f.peso_carcassa/gg : null;
    })
    .filter(v=>v!==null);
  const ipgCarcMedioFigli = ipgCarcFigli.length>0
    ? Math.round(ipgCarcFigli.reduce((a,b)=>a+b,0)/ipgCarcFigli.length*1000)/1000
    : null;

  // Peso carcassa medio dei figli macellati
  const pesoCarcMedio = figliMacellati.length>0
    ? Math.round(figliMacellati.reduce((s,f)=>s+f.peso_carcassa,0)/figliMacellati.length*10)/10
    : null;

  return {
    nParti: mieiParti.length,
    iipMedio,
    iipMin: iipValues.length>0 ? Math.min(...iipValues) : null,
    iipMax: iipValues.length>0 ? Math.max(...iipValues) : null,
    prolificita,
    pctNatiVivi,
    totNatiVivi,
    totNatiMorti,
    pesoMedioNati,
    etaPrimoParto,
    prodAnnua,
    giorniCarriera,
    nFigli: figli.length,
    nFigliMacellati: figliMacellati.length,
    resaMediaFigli,
    resaMinFigli,
    resaMaxFigli,
    ipgCarcMedioFigli,
    pesoCarcMedio,
    longevita: Math.round(anni*10)/10,
  };
}

function calcolaScore(kpi, specie) {
  if (!kpi || kpi.prolificita==null) return 0;

  if (specie === "suino") {
    // Punteggio diretto: nati vivi medi per parto (= nati totali/parto × % vivi),
    // senza soglie fisse che azzerano i valori fuori standard industriale.
    return Math.round(kpi.prolificita * 10 * 10) / 10;
  }

  // Bovini e ovini: l'intervallo interparto (IIP) conta più della dimensione della cucciolata
  // (di norma 1 solo nato) — minore è l'IIP e maggiore la % di nati vivi, migliore la riproduttrice.
  if (kpi.pctNatiVivi == null) return 0;
  if (!kpi.iipMedio || kpi.iipMedio <= 0) {
    // Serve almeno 2 parti per calcolare un intervallo: nel frattempo il punteggio
    // riflette solo la % di nati vivi, così la riproduttrice resta comunque in classifica.
    return Math.round(kpi.pctNatiVivi * 10) / 10;
  }
  // (365 / IIP) × % nati vivi = "nati vivi equivalenti all'anno" — premia insieme
  // la rapidità dei parti e la loro riuscita, senza soglie che azzerano il punteggio.
  return Math.round((365 / kpi.iipMedio) * kpi.pctNatiVivi * 10) / 10;
}

// ─── CARD RIPRODUTTORE ────────────────────────────────────────────────────────
function CardRiproduttore({rip, kpi, score, rank, animali, onClick}) {
  const col = rank===1?C.gold:rank===2?C.silver:rank===3?C.bronze:C.muted;
  const medaglia = rank===1?"🥇":rank===2?"🥈":rank===3?"🥉":"";
  const scoreColor = score>=70?C.green:score>=50?C.yellow:C.red;
  const vivo = rip.vivo!==false && rip.stato==="attivo";

  return (
    <div onClick={onClick}
      style={{background:C.card,borderRadius:16,padding:14,marginBottom:10,
        boxShadow:"0 2px 8px rgba(0,0,0,0.08)",border:`1.5px solid ${col}44`,
        cursor:"pointer",borderLeft:`4px solid ${col}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <span style={{fontSize:20}}>{medaglia||`#${rank}`}</span>
            <div>
              <div style={{fontWeight:800,fontSize:15}}>
                {specieIcon(rip.specie)} {rip.nome||rip.bdn}
              </div>
              <div style={{fontSize:12,color:C.muted}}>
                {rip.bdn} · {rip.razza_calcolata||rip.razza||"—"}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
            <Badge label={specieLabel(rip.specie)} color={specieColor(rip.specie)}/>
            <Badge label={rip.sesso==="M"?"♂ Maschio":"♀ Femmina"}
              color={rip.sesso==="M"?C.blue:"#B5547A"}/>
            {!vivo&&<Badge label="uscito" color={C.muted}/>}
          </div>
          {kpi&&(
            <div style={{display:"flex",gap:12,marginTop:8,flexWrap:"wrap"}}>
              <Stat label="Parti" val={kpi.nParti}/>
              {kpi.prolificita&&<Stat label="Nati/parto" val={kpi.prolificita}/>}
              {kpi.pctNatiVivi&&<Stat label="Vivi %" val={kpi.pctNatiVivi+"%"}/>}
              {kpi.iipMedio&&<Stat label="IIP" val={`${(kpi.iipMedio/30.4).toFixed(1)} mesi`}/>}
              {kpi.resaMediaFigli&&<Stat label="Resa figli" val={`${kpi.resaMediaFigli}%`}/>}
            </div>
          )}
        </div>
        <div style={{textAlign:"center",minWidth:52}}>
          <div style={{fontSize:26,fontWeight:900,color:scoreColor}}>{score}</div>
          <div style={{fontSize:10,color:C.muted,fontWeight:600}}>/ 100</div>
        </div>
      </div>
    </div>
  );
}
const Stat=({label,val})=>(
  <div style={{textAlign:"center"}}>
    <div style={{fontSize:13,fontWeight:700,color:C.text}}>{val}</div>
    <div style={{fontSize:10,color:C.muted}}>{label}</div>
  </div>
);
const specieLabel=s=>({bovino:"Bovino",suino:"Suino",ovino:"Ovino"}[s]||s);

// ─── DETTAGLIO KPI ────────────────────────────────────────────────────────────
function DettaglioKPI({rip, kpi, score, animali, parti, onBack}) {
  const scoreColor=score>=70?C.green:score>=50?C.yellow:C.red;
  const figliDiretti=animali.filter(a=>a.madre_id===rip.id||a.padre_id===rip.id);
  const mieiParti=parti.filter(p=>p.animale_id===rip.id)
    .sort((a,b)=>b.data_evento?.localeCompare(a.data_evento));

  const KPIRow=({label,val,unit="",col,note})=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
      padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
      <div>
        <div style={{fontSize:13,color:C.muted}}>{label}</div>
        {note&&<div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>{note}</div>}
      </div>
      <div style={{fontWeight:700,fontSize:16,color:col||C.text}}>
        {val!==null&&val!==undefined?val+unit:"—"}
      </div>
    </div>
  );

  return (
    <div style={{padding:"16px 16px 80px"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
        <span style={{fontSize:18,fontWeight:800}}>KPI Riproduttivi</span>
      </div>

      {/* Header */}
      <Card style={{background:`linear-gradient(135deg,${specieColor(rip.specie)}15,${C.card})`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:20,fontWeight:800}}>
              {specieIcon(rip.specie)} {rip.nome||rip.bdn}
            </div>
            <div style={{fontSize:13,color:C.muted}}>
              {rip.razza_calcolata||rip.razza||"—"} · {rip.nascita||"—"}
            </div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:36,fontWeight:900,color:scoreColor}}>{score}</div>
            <div style={{fontSize:11,color:C.muted}}>INDICE</div>
          </div>
        </div>
      </Card>

      {/* KPI Fertilità */}
      <Card>
        <div style={{fontSize:13,fontWeight:700,color:C.muted,marginBottom:8}}>📊 FERTILITÀ</div>
        <KPIRow label="N° parti totali" val={kpi.nParti}/>
        <KPIRow label="Età al primo parto" val={kpi.etaPrimoParto} unit=" mesi"
          note="dalla nascita al 1° parto"/>
        <KPIRow label="IIP medio" 
          val={kpi.iipMedio?`${kpi.iipMedio} gg  (${(kpi.iipMedio/30.4).toFixed(1)} mesi)`:null}
          unit=""
          col={kpi.iipMedio&&kpi.iipMedio<350?C.green:C.yellow}
          note="intervallo inter-parto"/>
        {kpi.iipMin&&<KPIRow label="IIP minimo" val={`${kpi.iipMin} gg (${(kpi.iipMin/30.4).toFixed(1)} mesi)`} unit=""/>}
        {kpi.iipMax&&<KPIRow label="IIP massimo" val={`${kpi.iipMax} gg (${(kpi.iipMax/30.4).toFixed(1)} mesi)`} unit=""/>}
        {kpi.etaPrimoParto&&<KPIRow label="Età al primo parto" val={`${kpi.etaPrimoParto} mesi`} unit=""/>}
        {kpi.prodAnnua!==null&&kpi.prodAnnua!==undefined&&
          <KPIRow label="Produttività annua stimata"
            val={`${kpi.prodAnnua} figli/anno`} unit=""/>}
        {/* Statistiche macellazione figli */}
        {kpi.nFigliMacellati>0&&(
          <>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,
              marginTop:12,marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>
              🥩 Statistiche figli macellati ({kpi.nFigliMacellati})
            </div>
            <KPIRow label="Resa carcassa media figli" val={`${kpi.resaMediaFigli}%`} unit=""/>
            {kpi.resaMinFigli!==kpi.resaMaxFigli&&(
              <KPIRow label="Range resa figli"
                val={`${kpi.resaMinFigli}% — ${kpi.resaMaxFigli}%`} unit=""/>
            )}
            {kpi.pesoCarcMedio&&
              <KPIRow label="Peso carcassa medio figli"
                val={`${kpi.pesoCarcMedio} kg`} unit=""/>}
            {kpi.ipgCarcMedioFigli&&
              <KPIRow label="IPG carcassa medio figli"
                val={`${kpi.ipgCarcMedioFigli} kg/gg`} unit=""/>}
          </>
        )}
      </Card>

      {/* KPI Prolificità */}
      <Card>
        <div style={{fontSize:13,fontWeight:700,color:C.muted,marginBottom:8}}>🐣 PROLIFICITÀ</div>
        <KPIRow label="Nati vivi totali" val={kpi.totNatiVivi} col={C.green}/>
        <KPIRow label="Nati morti totali" val={kpi.totNatiMorti} col={kpi.totNatiMorti>0?C.red:C.green}/>
        <KPIRow label="% nati vivi" val={kpi.pctNatiVivi} unit="%"
          col={kpi.pctNatiVivi&&kpi.pctNatiVivi>=90?C.green:C.yellow}/>
        <KPIRow label="Media nati vivi/parto" val={kpi.prolificita}
          col={C.primary} note="prolificità media"/>
        {kpi.pesoMedioNati&&<KPIRow label="Peso medio nati" val={kpi.pesoMedioNati} unit=" kg"/>}
      </Card>

      {/* Figli */}
      {figliDiretti.length>0&&(
        <Card>
          <div style={{fontSize:13,fontWeight:700,color:C.muted,marginBottom:8}}>
            👶 DISCENDENTI ({figliDiretti.length})
          </div>
          {figliDiretti.slice(0,5).map(f=>(
            <div key={f.id} style={{display:"flex",justifyContent:"space-between",
              padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
              <span style={{fontWeight:600}}>{f.nome||f.bdn}</span>
              <span style={{color:C.muted}}>
                {f.nascita} · {f.razza_calcolata||f.razza||"—"}
              </span>
            </div>
          ))}
          {figliDiretti.length>5&&(
            <div style={{fontSize:12,color:C.muted,marginTop:6,fontStyle:"italic"}}>
              e altri {figliDiretti.length-5}...
            </div>
          )}
        </Card>
      )}

      {/* Storico parti */}
      {mieiParti.length>0&&(
        <Card>
          <div style={{fontSize:13,fontWeight:700,color:C.muted,marginBottom:8}}>
            📅 STORICO PARTI
          </div>
          {mieiParti.map((p,i)=>(
            <div key={p.id} style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",padding:"6px 0",
              borderBottom:`1px solid ${C.border}`,fontSize:13}}>
              <span style={{fontWeight:600}}>#{mieiParti.length-i} · {p.data_evento}</span>
              <div style={{display:"flex",gap:6}}>
                {p.nati_vivi>0&&<Badge label={`${p.nati_vivi}V`} color={C.green}/>}
                {p.nati_morti>0&&<Badge label={`${p.nati_morti}M`} color={C.red}/>}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function SelezioneGenetica() {
  const [animali,setAnimali]=useState([]);
  const [parti,setParti]=useState([]);
  const [loading,setLoading]=useState(true);
  const [filtroSpecie,setFiltroSpecie]=useState("tutti");
  const [filtroStato,setFiltroStato]=useState("attivi");
  const [filtroSesso,setFiltroSesso]=useState("tutti");
  const [selected,setSelected]=useState(null);

  useEffect(()=>{
    const carica=async()=>{
      setLoading(true);
      const[{data:anim},{data:part}]=await Promise.all([
        supabase.from("animali").select("*").order("created_at",{ascending:false}),
        supabase.from("eventi_riproduttivi").select("*")
          .eq("tipo_evento","parto").order("data_evento",{ascending:true}),
      ]);
      setAnimali(anim||[]);
      setParti(part||[]);
      setLoading(false);
    };
    carica();
  },[]);

  // Calcola ranking
  const ranking=useMemo(()=>{
    const candidati=animali.filter(a=>{
      if(filtroSpecie!=="tutti"&&a.specie!==filtroSpecie) return false;
      if(filtroStato==="attivi"&&a.stato!=="attivo") return false;
      if(filtroStato==="usciti"&&a.stato==="attivo") return false;
      if(filtroSesso!=="tutti"&&a.sesso!==filtroSesso) return false;
      return parti.some(p=>p.animale_id===a.id);
    });
    return candidati
      .map(a=>{
        const kpi=calcolaKPI(a.id,animali,parti);
        const score=calcolaScore(kpi,a.specie);
        return{animale:a,kpi,score};
      })
      .sort((a,b)=>b.score-a.score)
      .map((x,i)=>({...x,rank:i+1}));
  },[animali,parti,filtroSpecie,filtroSesso]);

  // Statistiche generali
  const stats=useMemo(()=>{
    const femmine=animali.filter(a=>a.sesso==="F"&&parti.some(p=>p.animale_id===a.id));
    const totParti=parti.length;
    const totNatiVivi=parti.reduce((s,p)=>s+(p.nati_vivi||0),0);
    const totNatiMorti=parti.reduce((s,p)=>s+(p.nati_morti||0),0);
    const totNati=totNatiVivi+totNatiMorti;
    return{
      nRiproduttori:femmine.length,
      totParti,
      pctNatiVivi:totNati>0?Math.round(totNatiVivi/totNati*1000)/10:null,
      prolificita:totParti>0?Math.round(totNatiVivi/totParti*10)/10:null,
    };
  },[animali,parti]);

  const wrap=ch=>(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,
      minHeight:"100vh",maxWidth:480,margin:"0 auto"}}>
      {ch}
    </div>
  );

  if(loading) return wrap(<Spinner/>);

  // Vista dettaglio
  if(selected){
    const{animale:rip,kpi,score}=selected;
    return wrap(
      <DettaglioKPI
        rip={rip} kpi={kpi} score={score}
        animali={animali} parti={parti}
        onBack={()=>setSelected(null)}
      />
    );
  }

  // Vista lista ranking
  return wrap(
    <div style={{paddingBottom:80}}>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.primary},${C.accent})`,
        borderRadius:"0 0 28px 28px",padding:"28px 20px 24px",marginBottom:16}}>
        <div style={{fontSize:22,fontWeight:800,color:"#FFF"}}>🏆 Selezione Genetica</div>
        <div style={{fontSize:14,color:"rgba(255,255,255,0.75)",marginTop:4}}>
          Ranking basato su dati reali · {stats.totParti} parti registrati
        </div>
      </div>

      {/* Statistiche mandria */}
      {stats.totParti>0&&(
        <div style={{padding:"0 16px 4px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
            {[
              {label:"Riprod.",val:stats.nRiproduttori,col:C.primary},
              {label:"Parti",val:stats.totParti,col:C.blue},
              {label:"Vivi %",val:stats.pctNatiVivi?stats.pctNatiVivi+"%":"—",col:C.green},
              {label:"Nati/p",val:stats.prolificita||"—",col:C.bovini},
            ].map(s=>(
              <div key={s.label} style={{background:C.card,borderRadius:12,padding:"10px 8px",
                textAlign:"center",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
                <div style={{fontSize:18,fontWeight:800,color:s.col}}>{s.val}</div>
                <div style={{fontSize:10,color:C.muted,fontWeight:600}}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtri */}
      <div style={{padding:"0 16px"}}>
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
          {["tutti","F","M"].map(s=>(
            <button key={s} onClick={()=>setFiltroSesso(s)}
              style={{background:filtroSesso===s?C.blue:C.card,
                color:filtroSesso===s?"#FFF":C.muted,
                border:`1.5px solid ${filtroSesso===s?C.blue:C.border}`,
                borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
              {s==="tutti"?"Tutti":s==="F"?"♀ Femmine":"♂ Maschi"}
            </button>
          ))}
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

        {ranking.length===0?(
          <div style={{textAlign:"center",padding:48,color:C.muted}}>
            <div style={{fontSize:48,marginBottom:12}}>🏆</div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Nessun dato disponibile</div>
            <div style={{fontSize:14}}>
              Registra eventi parto nella scheda animale per calcolare il ranking.
            </div>
          </div>
        ):ranking.map(({animale,kpi,score,rank})=>(
          <CardRiproduttore
            key={animale.id}
            rip={animale} kpi={kpi} score={score} rank={rank}
            animali={animali}
            onClick={()=>setSelected({animale,kpi,score,rank})}
          />
        ))}
      </div>
    </div>
  );
}
