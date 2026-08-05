import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";

const C = {
  bg:"#F5F0E8", card:"#FFFFFF", primary:"#5C3D1E", accent:"#A0522D",
  green:"#4A7C59", red:"#C0392B", yellow:"#D4A017", blue:"#2C6E9B",
  text:"#2D1B0E", muted:"#8B7355", border:"#D4C4A8", suini:"#B5547A",
};
const today = () => new Date().toISOString().split("T")[0];

const RAZZA_LETTERA = {
  "Nero Apucalabro":"A","Cinta Senese":"C","Duroc":"D","Mora Romagnola":"G",
  "Large White":"L","Meticcia":"M","Meticcio":"M","Nero Casertano":"N","Landrace":"R","Altra":"0",
};
const getRazzaLettera = r => {
  if(!r) return "0";
  const match = Object.keys(RAZZA_LETTERA).find(k=>k.toLowerCase()===r.trim().toLowerCase());
  return match ? RAZZA_LETTERA[match] : "0";
};
export const generaCodLotto = (dataParto, razzaMadre, razzaPadre, bdnMadre) => {
  if(!dataParto) return "";
  const d = new Date(dataParto);
  const aa = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const lM = getRazzaLettera(razzaMadre);
  const lP = getRazzaLettera(razzaPadre);
  const ultime2 = (bdnMadre||"").replace(/[^0-9]/g,"").slice(-2).padStart(2,"0");
  return `${aa}${mm}${lM}${lP}${ultime2}`;
};
const codiceUnita = (codLotto, nr) => `${codLotto}${String(nr).padStart(2,"0")}`;

// ─── UI BASE ──────────────────────────────────────────────────────────────────
const inputStyle = {width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,
  borderRadius:10,padding:"10px 12px",fontSize:15,background:"#FAFAF8",color:C.text,outline:"none"};
const Card = ({children,style={}}) => (
  <div style={{background:C.card,borderRadius:16,padding:14,marginBottom:10,
    boxShadow:"0 2px 6px rgba(0,0,0,0.07)",border:`1px solid ${C.border}`,...style}}>
    {children}
  </div>
);
const Badge = ({label,color}) => (
  <span style={{background:color+"22",color,border:`1px solid ${color}44`,
    borderRadius:20,padding:"2px 9px",fontSize:11,fontWeight:700}}>{label}</span>
);
const Btn = ({label,onClick,variant="primary",small=false,icon,disabled=false,full=false}) => {
  const bg={primary:C.primary,danger:C.red,success:C.green,ghost:"transparent",
    outline:"transparent",blue:C.blue}[variant]||C.primary;
  const fg=variant==="ghost"||variant==="outline"?C.text:"#FFF";
  return (
    <button onClick={onClick} disabled={disabled}
      style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,
        background:bg,color:fg,border:variant==="outline"?`1.5px solid ${C.primary}`:"none",
        borderRadius:10,padding:small?"6px 12px":"10px 18px",
        fontSize:small?13:15,fontWeight:600,cursor:disabled?"default":"pointer",
        width:full?"100%":"auto",opacity:disabled?0.5:1}}>
      {icon&&<span>{icon}</span>}{label}
    </button>
  );
};
const Field = ({label,value,onChange,type="text",options,required,placeholder}) => (
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
         onChange={e=>onChange(e.target.value)} style={inputStyle}/>}
  </div>
);
const Spinner = () => (
  <div style={{textAlign:"center",padding:60,color:C.muted}}>
    <div style={{fontSize:36,marginBottom:12}}>⏳</div><div>Caricamento lotti...</div>
  </div>
);

// ─── FORM ASSEGNA BDN ────────────────────────────────────────────────────────
function FormAssegnaBDN({unita, lotto, animali, onSave, onCancel}) {
  const [bdn,setBdn] = useState("");
  const [nome,setNome] = useState("");
  const [saving,setSaving] = useState(false);
  const codice = unita.codice_completo||codiceUnita(lotto.codice_lotto||lotto.codice, unita.nr);
  const madre = animali.find(a=>a.id===lotto.madre_id);
  const padre = animali.find(a=>a.id===lotto.padre_id);

  const salva = async () => {
    if(!bdn.trim()) return;
    if(!unita.sesso){
      alert("⚠️ Questa unità non ha ancora un sesso registrato.\n\nChiudi questo modulo, usa prima il pulsante ⚖️ per impostarlo, poi torna qui ad assegnare il BDN.");
      return;
    }
    setSaving(true);
    // 1. Crea scheda animale individuale con dati ereditati
    const acquistato = lotto.tipo_provenienza==="acquistato";
    const {data: nuovoAnimale, error: errInsert} = await supabase.from("animali").insert([{
      bdn: bdn.trim(),
      nome: nome||null,
      specie: "suino",
      sesso: unita.sesso||null,
      nascita: lotto.data_parto||null,
      razza: lotto.razza_madre||madre?.razza||null,
      razza_calcolata: lotto.razza_madre||madre?.razza||null,
      madre_id: acquistato?null:(lotto.madre_id||null),
      padre_id: acquistato?null:(lotto.padre_id||null),
      peso_nascita: unita.peso_nascita||null,
      provenienza: acquistato?"Acquistato":"Nato in azienda",
      origine: acquistato?(lotto.fornitore||null):null,
      data_ingresso: lotto.data_parto||null,
      stato: "attivo", vivo: true,
      note: `Da lotto ${lotto.codice_lotto||lotto.codice} unità ${codice}`,
    }]).select("id").single();
    if(errInsert){
      setSaving(false);
      alert(`⚠️ Errore nella creazione della scheda animale:\n\n${errInsert.message}`);
      return;
    }
    // 2. Aggiorna unità lotto: segna come "uscita con BDN"
    const {error: errUpdate} = await supabase.from("suini_lotto").update({
      bdn: bdn.trim(),
      matricola: bdn.trim(),
      stato: "registrato_individuale",
      vivo: false,
      destinazione: "riproduzione",
      motivo_uscita: "Registrato come animale individuale — BDN: "+bdn.trim(),
      data_uscita: today(),
    }).eq("id", unita.id);
    if(errUpdate){
      setSaving(false);
      alert(`⚠️ La scheda animale è stata creata, ma l'aggiornamento del lotto ha dato errore:\n\n${errUpdate.message}`);
      return;
    }
    // 3. Traghetta i costi già calcolati dalla Contabilità Industriale (ci_costo_animale_annuale)
    // dalla chiave lotto_id+unita_nr alla nuova chiave animale_id — senza questo passaggio la
    // storia costo del suinetto (mantenimento, nascita ereditata) andrebbe persa/azzerata.
    // Nota: questa è l'unica eccezione al principio "solo la Contabilità Industriale scrive in
    // questa tabella" — qui si spostano righe già calcolate, non se ne calcolano di nuove.
    try {
      const {data: righeLotto} = await supabase.from("ci_costo_animale_annuale").select("*")
        .eq("lotto_id", lotto.id).eq("unita_nr", unita.nr);
      for (const riga of (righeLotto||[])) {
        const {data: rigaEsistente} = await supabase.from("ci_costo_animale_annuale").select("*")
          .eq("animale_id", nuovoAnimale.id).eq("anno", riga.anno).maybeSingle();
        if (rigaEsistente) {
          await supabase.from("ci_costo_animale_annuale").update({
            uba_giorni: Math.round(((parseFloat(rigaEsistente.uba_giorni)||0)+(parseFloat(riga.uba_giorni)||0))*10000)/10000,
            costo_mantenimento: Math.round(((parseFloat(rigaEsistente.costo_mantenimento)||0)+(parseFloat(riga.costo_mantenimento)||0))*100)/100,
            costo_nascita_ereditato: Math.round(((parseFloat(rigaEsistente.costo_nascita_ereditato)||0)+(parseFloat(riga.costo_nascita_ereditato)||0))*100)/100,
            quota_scaricata_su_figli: Math.round(((parseFloat(rigaEsistente.quota_scaricata_su_figli)||0)+(parseFloat(riga.quota_scaricata_su_figli)||0))*100)/100,
            costo_totale_anno: Math.round(((parseFloat(rigaEsistente.costo_totale_anno)||0)+(parseFloat(riga.costo_totale_anno)||0))*100)/100,
          }).eq("id", rigaEsistente.id);
          await supabase.from("ci_costo_animale_annuale").delete().eq("id", riga.id);
        } else {
          await supabase.from("ci_costo_animale_annuale").update({
            animale_id: nuovoAnimale.id, lotto_id: null, unita_nr: null,
          }).eq("id", riga.id);
        }
      }
    } catch (errTraghetto) {
      console.error("Traghettamento costi non riuscito (la scheda animale resta comunque creata):", errTraghetto);
    }
    setSaving(false);
    onSave();
  };

  return (
    <div style={{background:"#E3F2FD",border:`2px solid ${C.blue}`,
      borderRadius:14,padding:14,marginBottom:10}}>
      <div style={{fontWeight:700,color:C.blue,marginBottom:10,fontSize:14}}>
        🏷️ Assegna BDN/ID a {codice}
      </div>
      <div style={{fontSize:12,color:C.muted,marginBottom:10}}>
        L'unità uscirà dal lotto ed entrerà nel Registro Suini con i dati ereditati:
        nascita {lotto.data_parto} · madre {madre?.nome||madre?.bdn||"—"} · padre {padre?.nome||padre?.bdn||"—"}
        {unita.peso_nascita&&` · peso nascita ${unita.peso_nascita}kg`}
      </div>
      <Field label="BDN / Matricola *" value={bdn} onChange={setBdn}
        placeholder="Es. IT058990123456 o 334966" required/>
      <Field label="Nome (facoltativo)" value={nome} onChange={setNome}
        placeholder="Es. NERO, BELINDA..."/>
      <div style={{display:"flex",gap:8}}>
        <Btn label={saving?"...":"✓ Registra e trasferisci"} onClick={salva}
          variant="blue" disabled={saving||!bdn.trim()} small/>
        <Btn label="Annulla" onClick={onCancel} variant="ghost" small/>
      </div>
    </div>
  );
}

// ─── FORM USCITA UNITÀ ────────────────────────────────────────────────────────
function FormUscitaUnita({unita, lotto, onSave, onCancel}) {
  const giaUscita = unita.vivo===false || (unita.stato&&unita.stato!=="attivo");
  const [form,setForm] = useState({
    motivo: unita.motivo_uscita || "Macellato",
    stato: giaUscita ? unita.stato : "macellato",
    data_uscita: unita.data_uscita || today(),
    causa_morte: unita.causa_morte || "",
    peso_vivo_uscita: unita.peso_vivo_uscita ?? "",
    peso_carcassa: unita.peso_carcassa ?? "",
  });
  const [saving,setSaving] = useState(false);
  const codice = unita.codice_completo||codiceUnita(lotto.codice_lotto||lotto.codice, unita.nr);

  // Accrescimento giornaliero
  const giorni = lotto.data_parto&&form.data_uscita
    ? Math.round((new Date(form.data_uscita)-new Date(lotto.data_parto))/86400000) : null;
  const pesoNascita = unita.peso_nascita||0;
  const accrescimento = giorni&&giorni>0&&form.peso_vivo_uscita
    ? Math.round((parseFloat(form.peso_vivo_uscita)-pesoNascita)/giorni*1000)/1000 : null;
  const resa = form.peso_carcassa&&form.peso_vivo_uscita
    ? Math.round(parseFloat(form.peso_carcassa)/parseFloat(form.peso_vivo_uscita)*1000)/10 : null;

  const MOTIVI = [
    {label:"Macellato",stato:"macellato"},
    {label:"Morto (malattia)",stato:"morto"},
    {label:"Morto (causa naturale)",stato:"morto"},
    {label:"Venduto vivo",stato:"venduto"},
    {label:"Predato",stato:"morto"},
    {label:"Smarrito",stato:"disperso"},
    {label:"Altro",stato:"uscito"},
  ];

  const salva = async () => {
    setSaving(true);
    const {error} = await supabase.from("suini_lotto").update({
      stato: form.stato,
      vivo: false,
      motivo_uscita: form.motivo,
      causa_morte: form.motivo==="Morto (malattia)"?(form.causa_morte||null):null,
      data_uscita: form.data_uscita||null,
      peso_vivo_uscita: form.peso_vivo_uscita?parseFloat(form.peso_vivo_uscita):null,
      peso_carcassa: form.peso_carcassa?parseFloat(form.peso_carcassa):null,
      resa_percent: resa,
    }).eq("id", unita.id);
    setSaving(false);
    if(error){
      alert(`⚠️ Errore nel salvataggio dell'uscita:\n\n${error.message}`);
      return;
    }
    onSave();
  };

  return (
    <div style={{background:"#FFEBEE",border:`2px solid ${C.red}`,
      borderRadius:14,padding:14,marginBottom:10}}>
      <div style={{fontWeight:700,color:C.red,marginBottom:10,fontSize:14}}>
        📤 {giaUscita?"Modifica":"Registra"} uscita — {codice}
      </div>
      <Field label="Motivo uscita" value={form.motivo}
        onChange={v=>{
          const m=MOTIVI.find(x=>x.label===v);
          setForm(f=>({...f,motivo:v,stato:m?.stato||"uscito"}));
        }}
        options={MOTIVI.map(m=>m.label)}/>
      {form.motivo==="Morto (malattia)"&&
        <Field label="Causa (malattia/diagnosi)" value={form.causa_morte}
          onChange={v=>setForm(f=>({...f,causa_morte:v}))} placeholder="Es. Polmonite, PRRS, setticemia..."/>}
      <Field label="Data uscita" value={form.data_uscita}
        onChange={v=>setForm(f=>({...f,data_uscita:v}))} type="date"/>
      {giorni>0&&<div style={{fontSize:12,color:C.blue,marginBottom:8}}>
        📅 {giorni} giorni di permanenza
      </div>}
      {(form.motivo==="Macellato"||form.motivo==="Venduto vivo")&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Field label="Peso vivo (kg)" value={form.peso_vivo_uscita}
            onChange={v=>setForm(f=>({...f,peso_vivo_uscita:v}))} type="number"/>
          {form.motivo==="Macellato"&&
            <Field label="Peso carcassa (kg)" value={form.peso_carcassa}
              onChange={v=>setForm(f=>({...f,peso_carcassa:v}))} type="number"/>}
        </div>
      )}
      {resa&&<div style={{fontSize:12,color:C.green,marginBottom:8}}>
        ⚖️ Resa: <strong>{resa}%</strong>
      </div>}
      {accrescimento&&<div style={{fontSize:12,color:C.primary,marginBottom:8}}>
        📈 Accrescimento: <strong>{accrescimento} kg/giorno</strong>
        {pesoNascita>0&&` (da ${pesoNascita}kg)`}
      </div>}
      <div style={{display:"flex",gap:8}}>
        <Btn label={saving?"...":"✓ Conferma"} onClick={salva}
          variant="danger" disabled={saving} small/>
        <Btn label="Annulla" onClick={onCancel} variant="ghost" small/>
      </div>
    </div>
  );
}

// ─── FORM PESO E SESSO UNITÀ (nascita o entrata) ──────────────────────────────
function FormPesoUnita({unita, lotto, onSave, onCancel}) {
  const [peso,setPeso] = useState(unita.peso_nascita ?? "");
  const [sesso,setSesso] = useState(unita.sesso ?? "");
  const [saving,setSaving] = useState(false);
  const codice = unita.codice_completo||codiceUnita(lotto.codice_lotto||lotto.codice, unita.nr);
  const acquistato = lotto.tipo_provenienza==="acquistato";

  const salva = async () => {
    setSaving(true);
    const {error} = await supabase.from("suini_lotto").update({
      peso_nascita: peso!==""?parseFloat(peso):null,
      sesso: sesso||null,
    }).eq("id", unita.id);
    setSaving(false);
    if(error){
      alert(`⚠️ Errore nel salvataggio:\n\n${error.message}`);
      return;
    }
    onSave();
  };

  return (
    <div style={{background:"#FFF3E0",border:`2px solid ${C.yellow}`,
      borderRadius:14,padding:14,marginBottom:10}}>
      <div style={{fontWeight:700,color:C.yellow,marginBottom:10,fontSize:14}}>
        ⚖️ Peso e sesso — {codice}
      </div>
      <Field label="Sesso" value={sesso} onChange={setSesso}
        options={[{value:"M",label:"♂ Maschio"},
                  {value:"F",label:"♀ Femmina"},{value:"Castrato",label:"✂ Castrato"}]}/>
      <Field label={`Peso ${acquistato?"in entrata":"alla nascita"} (kg)`} value={peso}
        onChange={setPeso} type="number" placeholder="Es. 1.4"/>
      <div style={{display:"flex",gap:8}}>
        <Btn label={saving?"...":"✓ Salva"} onClick={salva}
          variant="success" disabled={saving} small/>
        <Btn label="Annulla" onClick={onCancel} variant="ghost" small/>
      </div>
    </div>
  );
}

// ─── CARD UNITÀ ───────────────────────────────────────────────────────────────
function CardUnita({u, lotto, animali, onUpdate}) {
  const [modal,setModal] = useState(null); // null | "bdn" | "uscita" | "peso"
  const codice = u.codice_completo||codiceUnita(lotto.codice_lotto||lotto.codice, u.nr);
  const vivo = u.vivo!==false&&u.stato==="attivo";
  const sessoColor = s=>({M:C.blue,F:C.suini,Castrato:C.muted}[s]||C.muted);

  if(modal==="bdn") return (
    <FormAssegnaBDN unita={u} lotto={lotto} animali={animali}
      onSave={()=>{setModal(null);onUpdate();}}
      onCancel={()=>setModal(null)}/>
  );
  if(modal==="uscita") return (
    <FormUscitaUnita unita={u} lotto={lotto}
      onSave={()=>{setModal(null);onUpdate();}}
      onCancel={()=>setModal(null)}/>
  );
  if(modal==="peso") return (
    <FormPesoUnita unita={u} lotto={lotto}
      onSave={()=>{setModal(null);onUpdate();}}
      onCancel={()=>setModal(null)}/>
  );

  return (
    <div style={{background:vivo?C.card:"#F5F5F5",borderRadius:12,padding:12,
      marginBottom:8,border:`1.5px solid ${vivo?C.border:"#DDD"}`,
      borderLeft:`4px solid ${vivo?C.suini:C.muted}`,opacity:vivo?1:0.65}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontFamily:"monospace",fontSize:16,fontWeight:800,
            color:vivo?C.primary:C.muted,letterSpacing:1}}>{codice}</div>
          <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
            {u.sesso&&<Badge label={u.sesso==="M"?"♂ M":u.sesso==="F"?"♀ F":"✂ Castrato"}
              color={sessoColor(u.sesso)}/>}
            {u.peso_nascita&&<Badge label={u.peso_nascita+"kg"} color={C.muted}/>}
            {!vivo&&<Badge label={u.motivo_uscita||u.stato} color={C.muted}/>}
            {u.bdn&&u.stato==="registrato_individuale"&&
              <Badge label={"→ BDN: "+u.bdn} color={C.green}/>}
          </div>
          {u.data_uscita&&(
            <div style={{fontSize:11,color:C.muted,marginTop:3}}>
              Uscito: {u.data_uscita}
              {u.peso_vivo_uscita&&` · ${u.peso_vivo_uscita}kg vivo`}
              {u.peso_carcassa&&` · ${u.peso_carcassa}kg carcassa`}
              {u.resa_percent&&<strong style={{color:C.green}}> · resa {u.resa_percent}%</strong>}
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          {vivo&&(<>
            <button onClick={()=>setModal("peso")}
              style={{background:C.yellow+"20",border:"none",borderRadius:8,
                padding:"6px 8px",cursor:"pointer",fontSize:12,fontWeight:700,color:C.yellow}}>
              ⚖️
            </button>
            <button onClick={()=>setModal("bdn")}
              style={{background:C.blue+"20",border:"none",borderRadius:8,
                padding:"6px 8px",cursor:"pointer",fontSize:12,fontWeight:700,color:C.blue}}>
              🏷️ BDN
            </button>
          </>)}
          <button onClick={()=>setModal("uscita")}
            style={{background:C.red+"20",border:"none",borderRadius:8,
              padding:"6px 8px",cursor:"pointer",fontSize:12,fontWeight:700,color:C.red}}>
            📤{!vivo&&" ✏️"}
          </button>
          {!vivo&&u.stato!=="registrato_individuale"&&(
            <button onClick={async()=>{
                if(!window.confirm(`Annullare l'uscita di ${codice} e riportarla ad "attivo"?\nI dati di uscita (data, motivo, pesi) verranno cancellati.`)) return;
                const {error} = await supabase.from("suini_lotto").update({
                  stato:"attivo", vivo:true,
                  motivo_uscita:null, causa_morte:null, data_uscita:null,
                  peso_vivo_uscita:null, peso_carcassa:null, resa_percent:null,
                }).eq("id", u.id);
                if(error){ alert(`⚠️ Errore nell'annullamento:\n\n${error.message}`); return; }
                onUpdate();
              }}
              style={{background:C.green+"20",border:"none",borderRadius:8,
                padding:"6px 8px",cursor:"pointer",fontSize:12,fontWeight:700,color:C.green}}>
              ↩️
            </button>
          )}
          <button onClick={async()=>{
              if(!window.confirm(`Eliminare definitivamente l'unità ${codice}?\nQuesta operazione NON è reversibile.`)) return;
              const {error} = await supabase.from("suini_lotto").delete().eq("id", u.id);
              if(error){ alert(`⚠️ Errore nell'eliminazione:\n\n${error.message}`); return; }
              onUpdate();
            }}
            style={{background:"#00000015",border:"none",borderRadius:8,
              padding:"6px 8px",cursor:"pointer",fontSize:12,fontWeight:700,color:C.muted}}>
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SCHEDA LOTTO ─────────────────────────────────────────────────────────────
function SchedaLotto({lotto, suini, animali, onBack, onUpdate, onDelete}) {
  const [cerca,setCerca] = useState("");
  const [form,setForm] = useState(null);
  const [saving,setSaving] = useState(false);
  const [eliminando,setEliminando] = useState(false);

  const unita = useMemo(()=>
    suini.filter(s=>s.lotto_id===lotto.id).sort((a,b)=>a.nr-b.nr)
  ,[suini,lotto.id]);

  const eliminaLotto = async () => {
    const nUnita = unita.length;
    if(!window.confirm(
      `Eliminare definitivamente il lotto ${lotto.codice_lotto||lotto.codice}?\n\n`+
      `Verranno cancellate anche tutte le ${nUnita} unità al suo interno.\n`+
      `Questa operazione NON è reversibile.`
    )) return;
    if(!window.confirm("Confermi? Non si può tornare indietro.")) return;
    setEliminando(true);
    const {error: errUnita} = await supabase.from("suini_lotto").delete().eq("lotto_id", lotto.id);
    if(errUnita){
      setEliminando(false);
      alert(`⚠️ Errore nell'eliminazione delle unità del lotto:\n\n${errUnita.message}`);
      return;
    }
    const {error: errLotto} = await supabase.from("lotti_suini").delete().eq("id", lotto.id);
    setEliminando(false);
    if(errLotto){
      alert(`⚠️ Le unità sono state eliminate, ma il lotto stesso ha dato errore:\n\n${errLotto.message}`);
      return;
    }
    onDelete();
  };

  const unitaFiltrate = useMemo(()=>{
    if(!cerca.trim()) return unita;
    const q=cerca.trim().toLowerCase();
    return unita.filter(u=>{
      const cod=(u.codice_completo||"").toLowerCase();
      return cod.includes(q)||String(u.nr).padStart(2,"0")===q.padStart(2,"0");
    });
  },[unita,cerca]);

  const madre = animali.find(a=>a.id===lotto.madre_id);
  const padre = animali.find(a=>a.id===lotto.padre_id);
  const vivi = unita.filter(u=>u.vivo!==false&&u.stato==="attivo").length;
  const macellati = unita.filter(u=>u.stato==="macellato").length;
  const deceduti = unita.filter(u=>["morto","disperso"].includes(u.stato)).length;
  const conBDN = unita.filter(u=>u.stato==="registrato_individuale").length;
  const maschi = unita.filter(u=>u.sesso==="M").length;
  const femmine = unita.filter(u=>u.sesso==="F").length;
  const castrati = unita.filter(u=>u.sesso==="Castrato").length;

  const salvaLotto = async () => {
    setSaving(true);
    const codice = (form.codice_lotto||form.codice||"").trim()||null;
    const payload = {
      codice, codice_lotto: codice,
      tipo_provenienza: form.tipo_provenienza||null,
      data_parto: form.data_parto||null,
      madre_id: form.madre_id?parseInt(form.madre_id):null,
      padre_id: form.padre_id?parseInt(form.padre_id):null,
      razza_madre: form.razza_madre||null,
      razza_padre: form.razza_padre||null,
      nati_totali: form.nati_totali!==""&&form.nati_totali!=null?parseInt(form.nati_totali):null,
      nati_vivi: form.nati_vivi!==""&&form.nati_vivi!=null?parseInt(form.nati_vivi):null,
      nati_morti: form.nati_morti!==""&&form.nati_morti!=null?parseInt(form.nati_morti):null,
      fornitore: form.fornitore||null,
      data_fattura: form.data_fattura||null,
      numero_fattura: form.numero_fattura||null,
      prezzo_acquisto: form.prezzo_acquisto?parseFloat(form.prezzo_acquisto):null,
      note: form.note||null,
    };
    const {error} = await supabase.from("lotti_suini").update(payload).eq("id", lotto.id);
    setSaving(false);
    if(!error){ setForm(null); onUpdate(); }
  };

  // ── Vista FORM (modifica lotto) ─────────────────────────────────────────────
  if(form){
    const madri = animali.filter(a=>a.sesso==="F");
    const padri = animali.filter(a=>a.sesso==="M");
    return (
      <div style={{padding:"16px 16px 100px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <button onClick={()=>setForm(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
          <span style={{fontSize:18,fontWeight:800}}>✏️ Modifica lotto {lotto.codice_lotto||lotto.codice}</span>
        </div>

        <Field label="Codice lotto" value={form.codice_lotto??form.codice}
          onChange={v=>setForm(f=>({...f,codice_lotto:v.toUpperCase()}))}/>
        <Field label="Tipo provenienza" value={form.tipo_provenienza}
          onChange={v=>setForm(f=>({...f,tipo_provenienza:v}))}
          options={[{value:"nato",label:"🐣 Nato in azienda"},{value:"acquistato",label:"📦 Acquistato"}]}/>
        <Field label="Data parto / acquisto" value={form.data_parto}
          onChange={v=>setForm(f=>({...f,data_parto:v}))} type="date"/>

        <Field label="Madre (in azienda)" value={form.madre_id}
          onChange={v=>setForm(f=>({...f,madre_id:v}))}
          options={madri.map(a=>({value:a.id,label:`${a.nome||a.bdn} (${a.razza||"—"})`}))}/>
        <Field label="Padre (in azienda)" value={form.padre_id}
          onChange={v=>setForm(f=>({...f,padre_id:v}))}
          options={padri.map(a=>({value:a.id,label:`${a.nome||a.bdn} (${a.razza||"—"})`}))}/>
        <Field label="Razza madre" value={form.razza_madre} onChange={v=>setForm(f=>({...f,razza_madre:v}))}/>
        <Field label="Razza padre" value={form.razza_padre} onChange={v=>setForm(f=>({...f,razza_padre:v}))}/>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <Field label="Nati totali" value={form.nati_totali} onChange={v=>setForm(f=>({...f,nati_totali:v}))} type="number"/>
          <Field label="Nati vivi" value={form.nati_vivi} onChange={v=>setForm(f=>({...f,nati_vivi:v}))} type="number"/>
          <Field label="Nati morti" value={form.nati_morti} onChange={v=>setForm(f=>({...f,nati_morti:v}))} type="number"/>
        </div>

        <Field label="Fornitore" value={form.fornitore} onChange={v=>setForm(f=>({...f,fornitore:v}))}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Field label="Data fattura" value={form.data_fattura}
            onChange={v=>setForm(f=>({...f,data_fattura:v}))} type="date"/>
          <Field label="Numero fattura" value={form.numero_fattura}
            onChange={v=>setForm(f=>({...f,numero_fattura:v}))} placeholder="Es. FT-2026-0042"/>
        </div>
        <Field label="Prezzo acquisto (€)" value={form.prezzo_acquisto}
          onChange={v=>setForm(f=>({...f,prezzo_acquisto:v}))} type="number"/>
        <Field label="Note" value={form.note} onChange={v=>setForm(f=>({...f,note:v}))}/>

        <div style={{display:"flex",gap:10,marginTop:16}}>
          <Btn label={saving?"Salvataggio...":"Salva"} icon="✓" onClick={salvaLotto} variant="success" disabled={saving}/>
          <Btn label="Annulla" onClick={()=>setForm(null)} variant="ghost"/>
        </div>
      </div>
    );
  }

  return (
    <div style={{paddingBottom:80}}>
      <div style={{background:`linear-gradient(135deg,${C.suini},${C.primary})`,
        padding:"20px 16px 24px",borderRadius:"0 0 24px 24px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <button onClick={onBack} style={{background:"rgba(255,255,255,0.2)",
              border:"none",borderRadius:10,padding:"6px 10px",color:"#FFF",
              cursor:"pointer",fontSize:18}}>←</button>
            <div>
              <div style={{fontSize:22,fontWeight:900,color:"#FFF",
                fontFamily:"monospace",letterSpacing:2}}>{lotto.codice_lotto||lotto.codice}</div>
              <div style={{fontSize:13,color:"rgba(255,255,255,0.8)"}}>
                {lotto.tipo_provenienza==="acquistato"?"📦 Acquistato":"🐣 Parto"} {lotto.data_parto}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexShrink:0}}>
            <button onClick={()=>setForm({...lotto})} style={{background:"rgba(255,255,255,0.2)",
              border:"none",borderRadius:10,padding:"6px 10px",color:"#FFF",
              cursor:"pointer",fontSize:16}}>✏️ Modifica</button>
            <button onClick={eliminaLotto} disabled={eliminando} style={{background:"rgba(0,0,0,0.25)",
              border:"none",borderRadius:10,padding:"6px 10px",color:"#FFF",
              cursor:"pointer",fontSize:16}}>{eliminando?"...":"🗑️"}</button>
          </div>
        </div>
        {(madre||padre)&&(
          <div style={{fontSize:13,color:"rgba(255,255,255,0.85)"}}>
            {madre&&`♀ ${madre.nome||madre.bdn}`}
            {madre&&padre&&" · "}
            {padre&&`♂ ${padre.nome||padre.bdn}`}
          </div>
        )}
      </div>

      <div style={{padding:"14px"}}>
        {/* Statistiche */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
          {[
            {l:"Vivi nel lotto",v:vivi,c:C.green},
            {l:"Macellati",v:macellati,c:C.muted},
            {l:"Deceduti/Dispersi",v:deceduti,c:C.red},
            {l:"Trasferiti a registro",v:conBDN,c:C.blue},
            {l:"Maschi",v:maschi,c:C.blue},
            {l:"Femmine",v:femmine,c:C.suini},
          ].map(s=>(
            <div key={s.l} style={{background:C.card,borderRadius:12,padding:"10px 6px",
              textAlign:"center",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
              <div style={{fontSize:20,fontWeight:800,color:s.c}}>{s.v}</div>
              <div style={{fontSize:9,color:C.muted,fontWeight:600}}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Ricerca */}
        <div style={{position:"relative",marginBottom:12}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",
            fontSize:16,color:C.muted}}>🔍</span>
          <input type="text" value={cerca} onChange={e=>setCerca(e.target.value)}
            placeholder="Cerca per tatuaggio (es. 2304CC1905) o numero..."
            style={{...inputStyle,border:`2px solid ${cerca?C.primary:C.border}`,
              borderRadius:12,padding:"10px 38px"}}/>
          {cerca&&<button onClick={()=>setCerca("")}
            style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
              background:"none",border:"none",cursor:"pointer",fontSize:16}}>✕</button>}
        </div>

        <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:8}}>
          UNITÀ DEL LOTTO — {unitaFiltrate.length} / {unita.length}
          {castrati>0&&` · ${castrati} castrati`}
        </div>

        {unitaFiltrate.map(u=>(
          <CardUnita key={u.id} u={u} lotto={lotto} animali={animali} onUpdate={onUpdate}/>
        ))}

        {vivi===0&&unita.length>0&&(
          <div style={{textAlign:"center",padding:20,background:C.green+"15",
            borderRadius:12,marginTop:8,fontSize:13,color:C.green,fontWeight:600}}>
            ✓ Tutte le unità sono uscite dal lotto
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LISTA LOTTI ──────────────────────────────────────────────────────────────
function ListaLotti({lotti, suini, animali, onSeleziona, onAcquisto}) {
  const [cerca,setCerca] = useState("");

  const lottiFiltrati = useMemo(()=>{
    if(!cerca.trim()) return lotti;
    const q=cerca.trim().toLowerCase();
    return lotti.filter(l=>{
      const cod=(l.codice_lotto||l.codice||"").toLowerCase();
      if(cod.includes(q)) return true;
      const madre=animali.find(a=>a.id===l.madre_id);
      if((madre?.bdn||"").toLowerCase().includes(q)) return true;
      // Cerca per tatuaggio unità
      return suini.some(u=>u.lotto_id===l.id&&
        (u.codice_completo||"").toLowerCase().includes(q));
    });
  },[lotti,suini,animali,cerca]);

  const totVivi = suini.filter(u=>u.vivo!==false&&u.stato==="attivo").length;

  return (
    <div style={{paddingBottom:80}}>
      <div style={{background:`linear-gradient(135deg,${C.suini},${C.primary})`,
        borderRadius:"0 0 28px 28px",padding:"24px 16px 20px"}}>
        <div style={{fontSize:22,fontWeight:800,color:"#FFF"}}>🐷 Lotti Suini</div>
        <div style={{fontSize:14,color:"rgba(255,255,255,0.75)",marginTop:4}}>
          {lotti.length} lotti · <strong style={{color:"#FFF"}}>{totVivi} suinetti vivi nei lotti</strong>
        </div>
      </div>

      <div style={{padding:"14px"}}>
        {/* Ricerca */}
        <div style={{position:"relative",marginBottom:12}}>
          <span style={{position:"absolute",left:12,top:"50%",
            transform:"translateY(-50%)",fontSize:16,color:C.muted}}>🔍</span>
          <input type="text" value={cerca} onChange={e=>setCerca(e.target.value)}
            placeholder="Cerca per codice lotto, tatuaggio unità o BDN madre..."
            style={{...inputStyle,border:`2px solid ${cerca?C.suini:C.border}`,
              borderRadius:12,padding:"10px 38px"}}/>
          {cerca&&<button onClick={()=>setCerca("")}
            style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
              background:"none",border:"none",cursor:"pointer",fontSize:16}}>✕</button>}
        </div>

        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <Btn label="📦 Lotto acquistato" onClick={onAcquisto} variant="outline" small/>
          <Btn label="📊 Excel" onClick={()=>esportaExcel(lotti,suini,animali)} variant="outline" small/>
        </div>

        {lottiFiltrati.length===0?(
          <div style={{textAlign:"center",padding:48,color:C.muted}}>
            <div style={{fontSize:48,marginBottom:12}}>🐷</div>
            <div style={{fontWeight:700,fontSize:16}}>
              {cerca?"Nessun lotto trovato":"Nessun lotto registrato"}
            </div>
            <div style={{fontSize:13,marginTop:8}}>
              {cerca?"Prova con un codice diverso":"I lotti si creano automaticamente registrando un parto suino dalla scheda della madre"}
            </div>
          </div>
        ):lottiFiltrati.map(l=>{
          const us = suini.filter(s=>s.lotto_id===l.id);
          const vivi = us.filter(u=>u.vivo!==false&&u.stato==="attivo").length;
          const tot = us.length;
          const pct = tot>0?Math.round(vivi/tot*100):0;
          const madre = animali.find(a=>a.id===l.madre_id);
          const padre = animali.find(a=>a.id===l.padre_id);
          const chiuso = tot>0&&vivi===0;
          return (
            <div key={l.id} onClick={()=>onSeleziona(l)}
              style={{background:chiuso?"#F5F5F5":C.card,borderRadius:16,padding:14,
                marginBottom:10,boxShadow:"0 2px 6px rgba(0,0,0,0.07)",
                border:`1px solid ${chiuso?"#DDD":C.border}`,
                borderLeft:`5px solid ${chiuso?C.muted:C.suini}`,cursor:"pointer",
                opacity:chiuso?0.75:1}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{fontSize:20,fontWeight:900,
                    color:chiuso?C.muted:C.suini,fontFamily:"monospace",letterSpacing:2}}>
                    {l.codice_lotto||l.codice}
                  </div>
                  <div style={{fontSize:12,color:C.muted}}>
                    {l.tipo_provenienza==="acquistato"?"📦":"🐣"} {l.data_parto}
                    {l.fornitore&&` · ${l.fornitore}`}
                  </div>
                  {(madre||padre)&&(
                    <div style={{fontSize:12,color:C.muted,marginTop:2}}>
                      {madre&&`♀ ${madre.nome||madre.bdn}`}
                      {madre&&padre&&" · "}
                      {padre&&`♂ ${padre.nome||padre.bdn}`}
                    </div>
                  )}
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:26,fontWeight:900,color:chiuso?C.muted:C.green}}>{vivi}</div>
                  <div style={{fontSize:11,color:C.muted}}>vivi / {tot}</div>
                  {chiuso&&<div style={{fontSize:10,color:C.muted,fontWeight:600}}>✓ CHIUSO</div>}
                </div>
              </div>
              {tot>0&&(
                <div style={{background:C.border,borderRadius:6,height:5,overflow:"hidden",marginBottom:8}}>
                  <div style={{background:chiuso?C.muted:C.green,width:`${pct}%`,height:"100%"}}/>
                </div>
              )}
              <div style={{fontSize:12,color:C.blue,fontWeight:600}}>
                👆 Tocca per aprire la scheda completa
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── FORM LOTTO ACQUISTATO ────────────────────────────────────────────────────
function FormLottoAcquistato({onSave, onCancel}) {
  const [form,setForm] = useState({
    data_acquisto:today(),fornitore:"",n_capi:"",
    data_fattura:"",numero_fattura:"",
    razza:"Cinta Senese",prezzo_acquisto:"",note:"",codice_manuale:"",
  });
  const [saving,setSaving] = useState(false);
  const codiceAuto = form.data_acquisto?(()=>{
    const d=new Date(form.data_acquisto);
    return `${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,"0")}AQ`;
  })():"";
  const codice = form.codice_manuale||codiceAuto;
  const nCapi = parseInt(form.n_capi)||0;

  const salva = async () => {
    if(!form.data_acquisto||!nCapi) return;
    setSaving(true);
    const{data:nuovoLotto, error:errLotto}=await supabase.from("lotti_suini").insert([{
      codice,codice_lotto:codice,
      anno:new Date(form.data_acquisto).getFullYear(),
      data_parto:form.data_acquisto,
      tipo_provenienza:"acquistato",
      fornitore:form.fornitore||null,
      data_fattura:form.data_fattura||null,
      numero_fattura:form.numero_fattura||null,
      prezzo_acquisto:form.prezzo_acquisto?parseFloat(form.prezzo_acquisto):null,
      nati_totali:nCapi,nati_vivi:nCapi,nati_morti:0,
      razza_madre:form.razza||null,note:form.note||null,specie:"suino",
    }]).select("id").single();
    if(errLotto){
      setSaving(false);
      alert(`⚠️ Errore nella creazione del lotto:\n\n${errLotto.message}`);
      return;
    }
    if(nuovoLotto){
      const{error:errUnita}=await supabase.from("suini_lotto").insert(
        Array.from({length:nCapi},(_,i)=>({
          lotto_id:nuovoLotto.id,nr:i+1,
          codice_completo:codiceUnita(codice,i+1),
          vivo:true,stato:"attivo",destinazione:"ingrasso",
        }))
      );
      if(errUnita){
        setSaving(false);
        alert(`⚠️ Il lotto è stato creato, ma il salvataggio delle unità è fallito:\n\n${errUnita.message}`);
        return;
      }
    }
    setSaving(false);onSave();
  };

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,
      minHeight:"100vh",maxWidth:480,margin:"0 auto",padding:"16px 16px 80px"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <button onClick={onCancel} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
        <span style={{fontSize:18,fontWeight:800}}>📦 Lotto acquistato</span>
      </div>
      {codice&&(
        <div style={{background:"#E3F2FD",border:`2px solid ${C.blue}`,borderRadius:14,
          padding:"12px 16px",marginBottom:16,textAlign:"center"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:4}}>🏷️ CODICE LOTTO</div>
          <div style={{fontSize:30,fontWeight:900,color:C.blue,fontFamily:"monospace",letterSpacing:3}}>{codice}</div>
          {nCapi>0&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>
            Unità: {codice}01 … {codice}{String(nCapi).padStart(2,"0")}
          </div>}
        </div>
      )}
      <Field label="Data acquisto *" value={form.data_acquisto}
        onChange={v=>setForm(f=>({...f,data_acquisto:v}))} type="date" required/>
      <Field label="Fornitore / Azienda" value={form.fornitore}
        onChange={v=>setForm(f=>({...f,fornitore:v}))} placeholder="Es. Az. Agr. Rossi"/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <Field label="Data fattura" value={form.data_fattura}
          onChange={v=>setForm(f=>({...f,data_fattura:v}))} type="date"/>
        <Field label="Numero fattura" value={form.numero_fattura}
          onChange={v=>setForm(f=>({...f,numero_fattura:v}))} placeholder="Es. FT-2026-0042"/>
      </div>
      <Field label="N° capi acquistati *" value={form.n_capi}
        onChange={v=>setForm(f=>({...f,n_capi:v}))} type="number" required/>
      <Field label="Razza" value={form.razza} onChange={v=>setForm(f=>({...f,razza:v}))}
        options={["Cinta Senese","Nero Apucalabro","Nero Casertano","Mora Romagnola",
          "Duroc","Large White","Landrace","Meticcia","Altra"]}/>
      <Field label="Prezzo totale (€)" value={form.prezzo_acquisto}
        onChange={v=>setForm(f=>({...f,prezzo_acquisto:v}))} type="number"/>
      <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:12,marginBottom:12}}>
        <div style={{fontSize:11,color:C.muted,marginBottom:6}}>
          Codice tatuaggio (lascia vuoto per generazione automatica: {codiceAuto})
        </div>
        <input type="text" value={form.codice_manuale}
          onChange={e=>setForm(f=>({...f,codice_manuale:e.target.value.toUpperCase()}))}
          placeholder={codiceAuto}
          style={{...inputStyle,fontFamily:"monospace"}}/>
      </div>
      <Field label="Note" value={form.note} onChange={v=>setForm(f=>({...f,note:v}))}/>
      <Btn label={saving?"...":nCapi>0?`📦 Crea lotto con ${nCapi} unità`:"Inserisci il numero di capi"}
        onClick={salva} disabled={saving||!form.data_acquisto||!nCapi} full variant="primary"/>
    </div>
  );
}

// ─── EXPORT EXCEL ─────────────────────────────────────────────────────────────
function esportaExcel(lotti, suini, animali) {
  const wb = require("xlsx").utils.book_new();
  const XLSX = require("xlsx");
  const righeL = lotti.map(l=>{
    const us=suini.filter(s=>s.lotto_id===l.id);
    const madre=animali.find(a=>a.id===l.madre_id);
    return {"Codice Lotto":l.codice_lotto||l.codice,"Data":l.data_parto,
      "Tipo":l.tipo_provenienza==="acquistato"?"Acquistato":"Parto",
      "Fornitore":l.fornitore||"","Madre BDN":madre?.bdn||"","Madre Nome":madre?.nome||"",
      "Nati Totali":l.nati_totali||us.length,"Nati Vivi":l.nati_vivi||0,"Nati Morti":l.nati_morti||0,
      "Vivi Attuali":us.filter(u=>u.vivo!==false&&u.stato==="attivo").length,
      "Macellati":us.filter(u=>u.stato==="macellato").length};
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(righeL),"Lotti");
  const righeU = suini.map(u=>{
    const l=lotti.find(x=>x.id===u.lotto_id);
    return {"Tatuaggio":u.codice_completo||"","Lotto":l?.codice_lotto||"","Nr":u.nr,
      "Sesso":u.sesso||"","Stato":u.stato||"","BDN individuale":u.bdn||u.matricola||"",
      "Peso nascita":u.peso_nascita||"","Data uscita":u.data_uscita||"",
      "Motivo":u.motivo_uscita||"","Peso vivo":u.peso_vivo_uscita||"",
      "Peso carcassa":u.peso_carcassa||"","Resa %":u.resa_percent||""};
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(righeU),"Unità");
  XLSX.writeFile(wb,`Lotti_Suini_${new Date().toISOString().split("T")[0]}.xlsx`);
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function LottiSuini() {
  const [animali,setAnimali] = useState([]);
  const [lotti,setLotti]     = useState([]);
  const [suini,setSuini]     = useState([]);
  const [loading,setLoading] = useState(true);
  const [view,setView]       = useState("lista");
  const [selLottoId,setSelLottoId] = useState(null);
  const selLotto = lotti.find(l=>l.id===selLottoId)||null;

  const carica = async () => {
    setLoading(true);
    const [{data:anim},{data:lot},{data:sui}] = await Promise.all([
      supabase.from("animali").select("*").eq("specie","suino").order("nome"),
      supabase.from("lotti_suini").select("*").order("data_parto",{ascending:false}),
      supabase.from("suini_lotto").select("*").order("lotto_id").order("nr"),
    ]);
    setAnimali(anim||[]);
    setLotti(lot||[]);
    setSuini(sui||[]);
    setLoading(false);
  };
  useEffect(()=>{carica();},[]);

  if(loading) return(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,
      minHeight:"100vh",maxWidth:480,margin:"0 auto"}}><Spinner/></div>
  );

  const wrap = ch => (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,
      minHeight:"100vh",maxWidth:480,margin:"0 auto"}}>{ch}</div>
  );

  if(view==="acquisto") return wrap(
    <FormLottoAcquistato
      onSave={()=>{carica();setView("lista");}}
      onCancel={()=>setView("lista")}/>
  );
  if(view==="lotto"&&selLotto) return wrap(
    <SchedaLotto lotto={selLotto} suini={suini} animali={animali}
      onBack={()=>{setView("lista");setSelLottoId(null);}}
      onUpdate={async()=>{await carica();}}
      onDelete={async()=>{setView("lista");setSelLottoId(null);await carica();}}/>
  );
  return wrap(
    <ListaLotti lotti={lotti} suini={suini} animali={animali}
      onSeleziona={l=>{setSelLottoId(l.id);setView("lotto");}}
      onAcquisto={()=>setView("acquisto")}/>
  );
}
