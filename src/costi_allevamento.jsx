
import { useState, useMemo } from "react";

const C = {
  bg: "#F5F0E8", card: "#FFFFFF", primary: "#5C3D1E", accent: "#A0522D",
  green: "#4A7C59", red: "#C0392B", yellow: "#D4A017", blue: "#2C6E9B",
  text: "#2D1B0E", muted: "#8B7355", border: "#D4C4A8",
  bovini: "#8B6914", suini: "#B5547A", ovini: "#4A7C59",
  alimentazione: "#8B6914", sanitario: "#C0392B", manodopera: "#2C6E9B",
  ammortamenti: "#7A5C8A", energia: "#D4A017", affitti: "#4A7C59",
};

const VOCI = [
  { id: "alimentazione", label: "Alimentazione", icon: "🌾", color: C.alimentazione },
  { id: "sanitario",     label: "Sanitario",     icon: "💉", color: C.sanitario },
  { id: "manodopera",    label: "Manodopera",    icon: "👷", color: C.manodopera },
  { id: "ammortamenti",  label: "Ammortamenti",  icon: "🏗️", color: C.ammortamenti },
  { id: "energia",       label: "Energia",       icon: "⚡", color: C.energia },
  { id: "affitti",       label: "Affitti/Canoni",icon: "🏠", color: C.affitti },
];

const specieColor = s => ({ bovino: C.bovini, suino: C.suini, ovino: C.ovini }[s] || C.muted);
const specieIcon  = s => ({ bovino: "🐄", suino: "🐷", ovino: "🐑" }[s] || "🐾");
const resaDefault = s => ({ bovino: 56, suino: 78, ovino: 48 }[s] || 55);
const today = () => new Date().toISOString().split("T")[0];

// ─── DATI DEMO ───────────────────────────────────────────────────────────────
const initialData = {
  animali: [
    { id: 1, bdn: "IT034BN001", nome: "Ercole",  specie: "bovino", razza: "Limousine",   sesso: "M", nascita: "2022-03-10", stato: "attivo" },
    { id: 2, bdn: "IT034BN002", nome: "Bella",   specie: "bovino", razza: "Limousine",   sesso: "F", nascita: "2022-07-20", stato: "attivo" },
    { id: 3, bdn: "IT034SU001", nome: "Arturo",  specie: "suino",  razza: "Large White", sesso: "M", nascita: "2023-01-15", stato: "attivo" },
    { id: 4, bdn: "IT034SU002", nome: "Peppa",   specie: "suino",  razza: "Large White", sesso: "F", nascita: "2023-01-15", stato: "attivo" },
    { id: 5, bdn: "IT034OV001", nome: "Lana",    specie: "ovino",  razza: "Sarda",       sesso: "F", nascita: "2023-02-01", stato: "attivo" },
    { id: 6, bdn: "IT034BN005", nome: "Tornado", specie: "bovino", razza: "Chianina",    sesso: "M", nascita: "2021-11-05", stato: "macellato" },
  ],
  // Costi individuali per animale: { animaleId, voce, importo, data, descrizione }
  costi: [
    { id:1,  animaleId:1, voce:"alimentazione", importo:420,  data:"2024-01-01", descrizione:"Mangime invernale" },
    { id:2,  animaleId:1, voce:"alimentazione", importo:380,  data:"2024-06-01", descrizione:"Fieno estivo" },
    { id:3,  animaleId:1, voce:"sanitario",     importo:85,   data:"2024-03-15", descrizione:"Vaccinazione + visita" },
    { id:4,  animaleId:1, voce:"manodopera",    importo:240,  data:"2024-01-01", descrizione:"Gestione annuale" },
    { id:5,  animaleId:1, voce:"energia",       importo:60,   data:"2024-01-01", descrizione:"Quota energia" },
    { id:6,  animaleId:1, voce:"ammortamenti",  importo:110,  data:"2024-01-01", descrizione:"Quota strutture" },
    { id:7,  animaleId:1, voce:"affitti",       importo:95,   data:"2024-01-01", descrizione:"Quota pascolo" },
    { id:8,  animaleId:2, voce:"alimentazione", importo:390,  data:"2024-01-01", descrizione:"Mangime" },
    { id:9,  animaleId:2, voce:"sanitario",     importo:70,   data:"2024-02-10", descrizione:"Controllo" },
    { id:10, animaleId:2, voce:"manodopera",    importo:210,  data:"2024-01-01", descrizione:"Gestione" },
    { id:11, animaleId:2, voce:"energia",       importo:55,   data:"2024-01-01", descrizione:"Quota energia" },
    { id:12, animaleId:2, voce:"ammortamenti",  importo:100,  data:"2024-01-01", descrizione:"Quota strutture" },
    { id:13, animaleId:2, voce:"affitti",       importo:90,   data:"2024-01-01", descrizione:"Quota pascolo" },
    { id:14, animaleId:3, voce:"alimentazione", importo:180,  data:"2024-01-01", descrizione:"Mangime suini" },
    { id:15, animaleId:3, voce:"sanitario",     importo:45,   data:"2024-01-01", descrizione:"Vaccini" },
    { id:16, animaleId:3, voce:"manodopera",    importo:120,  data:"2024-01-01", descrizione:"Gestione" },
    { id:17, animaleId:3, voce:"energia",       importo:35,   data:"2024-01-01", descrizione:"Quota" },
    { id:18, animaleId:3, voce:"ammortamenti",  importo:50,   data:"2024-01-01", descrizione:"Quota" },
    { id:19, animaleId:3, voce:"affitti",       importo:40,   data:"2024-01-01", descrizione:"Quota" },
    { id:20, animaleId:4, voce:"alimentazione", importo:175,  data:"2024-01-01", descrizione:"Mangime" },
    { id:21, animaleId:4, voce:"sanitario",     importo:40,   data:"2024-01-01", descrizione:"Vaccini" },
    { id:22, animaleId:4, voce:"manodopera",    importo:115,  data:"2024-01-01", descrizione:"Gestione" },
    { id:23, animaleId:5, voce:"alimentazione", importo:95,   data:"2024-01-01", descrizione:"Fieno ovini" },
    { id:24, animaleId:5, voce:"sanitario",     importo:30,   data:"2024-01-01", descrizione:"Controllo" },
    { id:25, animaleId:5, voce:"manodopera",    importo:70,   data:"2024-01-01", descrizione:"Gestione" },
    { id:26, animaleId:6, voce:"alimentazione", importo:850,  data:"2023-01-01", descrizione:"Alimentazione totale" },
    { id:27, animaleId:6, voce:"sanitario",     importo:130,  data:"2023-01-01", descrizione:"Sanitario totale" },
    { id:28, animaleId:6, voce:"manodopera",    importo:320,  data:"2023-01-01", descrizione:"Manodopera" },
    { id:29, animaleId:6, voce:"energia",       importo:85,   data:"2023-01-01", descrizione:"Energia" },
    { id:30, animaleId:6, voce:"ammortamenti",  importo:140,  data:"2023-01-01", descrizione:"Ammortamenti" },
    { id:31, animaleId:6, voce:"affitti",       importo:120,  data:"2023-01-01", descrizione:"Affitti" },
  ],
  // Dati macellazione: { animaleId, data, peso_vivo, resa_percent, peso_carcassa, prezzo_vendita_kg }
  macellazioni: [
    { id:1, animaleId:6, data:"2024-05-10", peso_vivo:620, resa_percent:56, peso_carcassa:347, prezzo_vendita_kg:4.80, note:"Macello Cooperativa Roma" },
  ],
  nextId: { costi: 32, macellazioni: 2 },
};

// ─── CALCOLI ──────────────────────────────────────────────────────────────────
function calcolaEconomia(animaleId, data) {
  const costiA = data.costi.filter(c => c.animaleId === animaleId);
  const mac = data.macellazioni.find(m => m.animaleId === animaleId);

  const totalePerVoce = {};
  VOCI.forEach(v => {
    totalePerVoce[v.id] = costiA.filter(c => c.voce === v.id).reduce((s, c) => s + c.importo, 0);
  });
  const costoTotale = Object.values(totalePerVoce).reduce((a, b) => a + b, 0);

  let pesoCarcassa = null;
  let metodo = null;
  if (mac) {
    if (mac.peso_carcassa) { pesoCarcassa = mac.peso_carcassa; metodo = "diretto"; }
    else if (mac.peso_vivo && mac.resa_percent) { pesoCarcassa = +(mac.peso_vivo * mac.resa_percent / 100).toFixed(1); metodo = "stimato"; }
  }

  const costoPerKg = pesoCarcassa ? +(costoTotale / pesoCarcassa).toFixed(2) : null;
  const ricavo = mac && pesoCarcassa && mac.prezzo_vendita_kg ? +(pesoCarcassa * mac.prezzo_vendita_kg).toFixed(2) : null;
  const margine = ricavo ? +(ricavo - costoTotale).toFixed(2) : null;
  const marginePerKg = (ricavo && pesoCarcassa) ? +((ricavo - costoTotale) / pesoCarcassa).toFixed(2) : null;

  return { totalePerVoce, costoTotale, pesoCarcassa, metodo, costoPerKg, ricavo, margine, marginePerKg, mac };
}

// ─── UI BASE ──────────────────────────────────────────────────────────────────
const Card = ({ children, style = {} }) => (
  <div style={{ background: C.card, borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", border: `1px solid ${C.border}`, ...style }}>
    {children}
  </div>
);
const Badge = ({ label, color }) => (
  <span style={{ background: color+"22", color, border:`1px solid ${color}44`, borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700 }}>{label}</span>
);
const Btn = ({ label, onClick, variant="primary", small=false, icon }) => {
  const styles = {
    primary: { bg: C.primary, fg: "#FFF" }, success: { bg: C.green, fg: "#FFF" },
    danger:  { bg: C.red,     fg: "#FFF" }, ghost:   { bg: "transparent", fg: C.text },
    outline: { bg: "transparent", fg: C.primary },
  };
  const s = styles[variant] || styles.primary;
  return (
    <button onClick={onClick} style={{ display:"inline-flex", alignItems:"center", gap:5, background:s.bg, color:s.fg, border: variant==="outline" ? `1.5px solid ${C.primary}` : "none", borderRadius:10, padding: small?"6px 12px":"10px 18px", fontSize: small?13:15, fontWeight:600, cursor:"pointer" }}>
      {icon}{label}
    </button>
  );
};
const inputStyle = { width:"100%", boxSizing:"border-box", border:`1.5px solid ${C.border}`, borderRadius:10, padding:"10px 12px", fontSize:15, background:"#FAFAF8", color:C.text, outline:"none" };
const Field = ({ label, value, onChange, type="text", options, required }) => (
  <div style={{ marginBottom:12 }}>
    <div style={{ fontSize:12, fontWeight:600, color:C.muted, marginBottom:4 }}>{label}{required && " *"}</div>
    {options
      ? <select value={value??""} onChange={e=>onChange(e.target.value)} style={inputStyle}>
          <option value="">— seleziona —</option>
          {options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
        </select>
      : <input type={type} value={value??""} onChange={e=>onChange(e.target.value)} style={inputStyle}/>
    }
  </div>
);

// Grafico a barre orizzontali per composizione costi
function GraficoCosti({ totalePerVoce, costoTotale }) {
  const max = Math.max(...Object.values(totalePerVoce), 1);
  return (
    <div>
      {VOCI.map(v => {
        const val = totalePerVoce[v.id] || 0;
        if (val === 0) return null;
        const pct = costoTotale > 0 ? (val / costoTotale * 100).toFixed(1) : 0;
        return (
          <div key={v.id} style={{ marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:3 }}>
              <span style={{ color:C.text, fontWeight:600 }}>{v.icon} {v.label}</span>
              <span style={{ color:v.color, fontWeight:700 }}>€{val.toFixed(2)} <span style={{ color:C.muted, fontWeight:400 }}>({pct}%)</span></span>
            </div>
            <div style={{ background:C.border, borderRadius:6, height:10, overflow:"hidden" }}>
              <div style={{ background:v.color, width:`${(val/max)*100}%`, height:"100%", borderRadius:6, transition:"width 0.5s" }}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── SCHEDA ECONOMICA ANIMALE ─────────────────────────────────────────────────
function SchedaEconomica({ animale, data, onBack, onAddCosto, onAddMacellazione }) {
  const eco = calcolaEconomia(animale.id, data);
  const specie = animale.specie;

  return (
    <div style={{ padding:"16px 16px 80px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22 }}>←</button>
        <span style={{ fontSize:18, fontWeight:800, color:C.text }}>Scheda Economica</span>
      </div>

      {/* Header animale */}
      <Card style={{ borderLeft:`5px solid ${specieColor(specie)}`, background:`linear-gradient(135deg,${specieColor(specie)}12,${C.card})` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ fontSize:22, fontWeight:800 }}>{specieIcon(specie)} {animale.nome}</div>
            <div style={{ fontSize:13, color:C.muted }}>{animale.bdn} · {animale.razza}</div>
            <div style={{ display:"flex", gap:6, marginTop:6, flexWrap:"wrap" }}>
              <Badge label={animale.specie} color={specieColor(specie)}/>
              <Badge label={animale.stato === "macellato" ? "✓ Macellato" : "In allevamento"} color={animale.stato==="macellato"?C.green:C.blue}/>
            </div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:11, color:C.muted, fontWeight:600 }}>COSTO TOTALE</div>
            <div style={{ fontSize:32, fontWeight:900, color:C.primary }}>€{eco.costoTotale.toFixed(0)}</div>
          </div>
        </div>
      </Card>

      {/* KPI macellazione */}
      {eco.pesoCarcassa ? (
        <Card style={{ background:`linear-gradient(135deg,${C.primary}10,${C.accent}08)` }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.muted, marginBottom:12, textTransform:"uppercase", letterSpacing:1 }}>
            Risultato macellazione {eco.metodo === "stimato" && <span style={{ color:C.yellow, fontSize:11 }}>(peso stimato)</span>}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
            {[
              { label:"Peso carcassa", value: eco.pesoCarcassa+" kg", color:C.primary },
              { label:"Costo/kg carcassa", value: "€"+eco.costoPerKg, color:eco.costoPerKg>5?C.red:eco.costoPerKg>3.5?C.yellow:C.green },
              eco.mac?.prezzo_vendita_kg && { label:"Prezzo vendita/kg", value:"€"+eco.mac.prezzo_vendita_kg, color:C.blue },
              eco.ricavo && { label:"Ricavo totale", value:"€"+eco.ricavo.toFixed(0), color:C.green },
            ].filter(Boolean).map(item=>(
              <div key={item.label} style={{ background:item.color+"12", borderRadius:12, padding:"10px 14px" }}>
                <div style={{ fontSize:11, color:C.muted, fontWeight:600 }}>{item.label}</div>
                <div style={{ fontSize:20, fontWeight:800, color:item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          {eco.margine !== null && (
            <div style={{ background: eco.margine>=0 ? C.green+"15" : C.red+"15", borderRadius:12, padding:"12px 16px", border:`1.5px solid ${eco.margine>=0?C.green:C.red}33` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:C.muted }}>MARGINE NETTO</div>
                  <div style={{ fontSize:11, color:C.muted }}>Ricavo − Costi totali</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:28, fontWeight:900, color:eco.margine>=0?C.green:C.red }}>{eco.margine>=0?"+":""}{eco.margine>=0?"€"+eco.margine.toFixed(0):"−€"+Math.abs(eco.margine).toFixed(0)}</div>
                  <div style={{ fontSize:14, color:eco.marginePerKg>=0?C.green:C.red, fontWeight:700 }}>{eco.marginePerKg>=0?"+":""}{eco.marginePerKg} €/kg carcassa</div>
                </div>
              </div>
            </div>
          )}

          {eco.mac?.peso_vivo && (
            <div style={{ marginTop:10, fontSize:13, color:C.muted }}>
              Peso vivo: <b>{eco.mac.peso_vivo} kg</b> · Resa: <b>{eco.mac.resa_percent}%</b>
              {eco.mac.note && ` · ${eco.mac.note}`}
            </div>
          )}
        </Card>
      ) : (
        <Card style={{ borderLeft:`4px solid ${C.yellow}` }}>
          <div style={{ fontSize:14, color:C.yellow, fontWeight:600, marginBottom:8 }}>⚠ Nessuna macellazione registrata</div>
          <div style={{ fontSize:13, color:C.muted, marginBottom:12 }}>
            Resa standard stimata per {specie}: <b>{resaDefault(specie)}%</b><br/>
            Con {eco.costoTotale > 0 ? `€${eco.costoTotale} di costi registrati` : "costi da registrare"}, il costo/kg stimato sarà calcolato dopo la macellazione.
          </div>
          <Btn label="Registra macellazione" onClick={onAddMacellazione} variant="success" small icon="🔪 " />
        </Card>
      )}

      {/* Composizione costi */}
      <Card>
        <div style={{ fontSize:13, fontWeight:700, color:C.muted, marginBottom:12, textTransform:"uppercase", letterSpacing:1 }}>Composizione costi</div>
        <GraficoCosti totalePerVoce={eco.totalePerVoce} costoTotale={eco.costoTotale}/>
        <div style={{ display:"flex", justifyContent:"space-between", borderTop:`1.5px solid ${C.border}`, marginTop:8, paddingTop:8 }}>
          <span style={{ fontWeight:700, color:C.text }}>Totale</span>
          <span style={{ fontWeight:900, fontSize:18, color:C.primary }}>€{eco.costoTotale.toFixed(2)}</span>
        </div>
      </Card>

      {/* Lista costi */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", margin:"16px 0 8px" }}>
        <div style={{ fontSize:13, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1 }}>Movimenti costo</div>
        <Btn label="+ Costo" onClick={onAddCosto} small variant="primary" />
      </div>
      {data.costi.filter(c=>c.animaleId===animale.id).sort((a,b)=>b.data.localeCompare(a.data)).map(c => {
        const v = VOCI.find(v=>v.id===c.voce);
        return (
          <div key={c.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background:C.bg, borderRadius:10, marginBottom:6, border:`1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{v?.icon} {c.descrizione}</div>
              <div style={{ fontSize:12, color:C.muted }}>{c.data}</div>
              <Badge label={v?.label||c.voce} color={v?.color||C.muted}/>
            </div>
            <div style={{ fontSize:18, fontWeight:800, color:C.accent }}>€{c.importo.toFixed(2)}</div>
          </div>
        );
      })}
      {data.costi.filter(c=>c.animaleId===animale.id).length===0 && (
        <div style={{ color:C.muted, fontSize:14, textAlign:"center", padding:20 }}>Nessun costo registrato</div>
      )}
    </div>
  );
}

// ─── FORM AGGIUNGI COSTO ──────────────────────────────────────────────────────
function FormCosto({ animale, onSave, onCancel }) {
  const [form, setForm] = useState({ animaleId: animale.id, voce:"alimentazione", importo:"", data:today(), descrizione:"" });
  const salva = () => {
    if (!form.importo || !form.descrizione) return;
    onSave({ ...form, importo: parseFloat(form.importo) });
  };
  return (
    <div style={{ padding:"16px 16px 80px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={onCancel} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22 }}>←</button>
        <span style={{ fontSize:18, fontWeight:800 }}>Aggiungi costo — {animale.nome}</span>
      </div>
      <Field label="Voce di costo" value={form.voce} onChange={v=>setForm(f=>({...f,voce:v}))} options={VOCI.map(v=>({value:v.id,label:v.icon+" "+v.label}))} required/>
      <Field label="Importo (€)" value={form.importo} onChange={v=>setForm(f=>({...f,importo:v}))} type="number" required/>
      <Field label="Descrizione" value={form.descrizione} onChange={v=>setForm(f=>({...f,descrizione:v}))} required/>
      <Field label="Data" value={form.data} onChange={v=>setForm(f=>({...f,data:v}))} type="date"/>
      <div style={{ display:"flex", gap:10, marginTop:8 }}>
        <Btn label="Salva" onClick={salva} variant="success" icon="✓ "/>
        <Btn label="Annulla" onClick={onCancel} variant="ghost"/>
      </div>
    </div>
  );
}

// ─── FORM MACELLAZIONE ────────────────────────────────────────────────────────
function FormMacellazione({ animale, onSave, onCancel }) {
  const [form, setForm] = useState({ animaleId: animale.id, data:today(), peso_vivo:"", resa_percent: resaDefault(animale.specie), peso_carcassa:"", prezzo_vendita_kg:"", note:"" });
  const pesoCarcassaStimato = form.peso_vivo && form.resa_percent ? (parseFloat(form.peso_vivo)*parseFloat(form.resa_percent)/100).toFixed(1) : null;

  const salva = () => {
    if (!form.peso_vivo && !form.peso_carcassa) return;
    onSave({ ...form, peso_vivo:parseFloat(form.peso_vivo)||null, resa_percent:parseFloat(form.resa_percent)||null, peso_carcassa:parseFloat(form.peso_carcassa)||null, prezzo_vendita_kg:parseFloat(form.prezzo_vendita_kg)||null });
  };

  return (
    <div style={{ padding:"16px 16px 80px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={onCancel} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22 }}>←</button>
        <span style={{ fontSize:18, fontWeight:800 }}>Registra macellazione — {animale.nome}</span>
      </div>
      <Card style={{ borderLeft:`4px solid ${C.muted}`, marginBottom:16 }}>
        <div style={{ fontSize:13, color:C.muted }}>Resa media di riferimento per <b>{animale.specie}</b>: <b>{resaDefault(animale.specie)}%</b></div>
      </Card>

      <Field label="Data macellazione" value={form.data} onChange={v=>setForm(f=>({...f,data:v}))} type="date"/>

      <div style={{ fontSize:13, fontWeight:700, color:C.muted, margin:"8px 0 8px", textTransform:"uppercase" }}>Metodo 1 — Peso vivo + resa</div>
      <div style={{ display:"flex", gap:10 }}>
        <div style={{ flex:1 }}><Field label="Peso vivo (kg)" value={form.peso_vivo} onChange={v=>setForm(f=>({...f,peso_vivo:v}))} type="number"/></div>
        <div style={{ flex:1 }}><Field label="Resa (%)" value={form.resa_percent} onChange={v=>setForm(f=>({...f,resa_percent:v}))} type="number"/></div>
      </div>
      {pesoCarcassaStimato && (
        <div style={{ background:C.blue+"15", borderRadius:10, padding:"8px 14px", marginBottom:12, fontSize:14, fontWeight:600, color:C.blue }}>
          📊 Peso carcassa stimato: <b>{pesoCarcassaStimato} kg</b>
        </div>
      )}

      <div style={{ fontSize:13, fontWeight:700, color:C.muted, margin:"8px 0 8px", textTransform:"uppercase" }}>Metodo 2 — Peso carcassa diretto (bolla macello)</div>
      <Field label="Peso carcassa effettivo (kg)" value={form.peso_carcassa} onChange={v=>setForm(f=>({...f,peso_carcassa:v}))} type="number"/>

      <div style={{ fontSize:13, fontWeight:700, color:C.muted, margin:"8px 0 8px", textTransform:"uppercase" }}>Ricavo</div>
      <Field label="Prezzo di vendita (€/kg carcassa)" value={form.prezzo_vendita_kg} onChange={v=>setForm(f=>({...f,prezzo_vendita_kg:v}))} type="number"/>
      <Field label="Note (macello, acquirente…)" value={form.note} onChange={v=>setForm(f=>({...f,note:v}))}/>

      {form.prezzo_vendita_kg && (form.peso_carcassa || pesoCarcassaStimato) && (
        <Card style={{ background:`linear-gradient(135deg,${C.green}15,${C.card})`, borderLeft:`4px solid ${C.green}` }}>
          <div style={{ fontSize:13, color:C.muted, marginBottom:4 }}>Anteprima ricavo</div>
          <div style={{ fontSize:22, fontWeight:800, color:C.green }}>
            €{((parseFloat(form.peso_carcassa)||parseFloat(pesoCarcassaStimato))*parseFloat(form.prezzo_vendita_kg)).toFixed(2)}
          </div>
        </Card>
      )}

      <div style={{ display:"flex", gap:10, marginTop:12 }}>
        <Btn label="Salva macellazione" onClick={salva} variant="success" icon="✓ "/>
        <Btn label="Annulla" onClick={onCancel} variant="ghost"/>
      </div>
    </div>
  );
}

// ─── LISTA ANIMALI + SUMMARY ─────────────────────────────────────────────────
function ListaAnimali({ data, onSeleziona }) {
  const [filtroSpecie, setFiltroSpecie] = useState("tutti");
  const [filtroStato, setFiltroStato] = useState("tutti");

  const animali = data.animali
    .filter(a => filtroSpecie==="tutti" || a.specie===filtroSpecie)
    .filter(a => filtroStato==="tutti" || a.stato===filtroStato);

  // Summary globale
  const summary = useMemo(() => {
    const macellati = data.animali.filter(a => data.macellazioni.some(m => m.animaleId===a.id));
    const costiTotali = data.costi.reduce((s,c)=>s+c.importo,0);
    const kgTotali = data.macellazioni.reduce((s,m)=>{
      const kg = m.peso_carcassa || (m.peso_vivo*m.resa_percent/100);
      return s + (kg||0);
    },0);
    const costo_kg_medio = kgTotali > 0 ? (data.costi.filter(c=>data.macellazioni.some(m=>m.animaleId===c.animaleId)).reduce((s,c)=>s+c.importo,0) / kgTotali).toFixed(2) : null;
    return { costiTotali, kgTotali: kgTotali.toFixed(0), costo_kg_medio, nMacellati: macellati.length };
  }, [data]);

  return (
    <div style={{ padding:"0 0 80px" }}>
      {/* Header */}
      <div style={{ background:`linear-gradient(135deg,${C.primary},${C.accent})`, borderRadius:"0 0 28px 28px", padding:"28px 20px 24px", marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:800, color:"#FFF" }}>💰 Costi di Allevamento</div>
        <div style={{ fontSize:14, color:"rgba(255,255,255,0.75)", marginTop:4 }}>Analisi costo/kg carcassa per animale</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:16 }}>
          {[
            { label:"Costi totali", value:`€${summary.costiTotali.toFixed(0)}`, color:"#FFF" },
            { label:"Kg prodotti", value:`${summary.kgTotali} kg`, color:"#FFF" },
            { label:"€/kg medio", value: summary.costo_kg_medio ? `€${summary.costo_kg_medio}` : "—", color:"#FFD700" },
          ].map(item=>(
            <div key={item.label} style={{ background:"rgba(255,255,255,0.15)", borderRadius:12, padding:"10px 12px", textAlign:"center" }}>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", fontWeight:600 }}>{item.label}</div>
              <div style={{ fontSize:18, fontWeight:800, color:item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding:"0 16px" }}>
        {/* Filtri */}
        <div style={{ display:"flex", gap:8, marginBottom:16, overflowX:"auto", paddingBottom:4 }}>
          {["tutti","bovino","suino","ovino"].map(s=>(
            <button key={s} onClick={()=>setFiltroSpecie(s)} style={{ background:filtroSpecie===s?C.primary:C.card, color:filtroSpecie===s?"#FFF":C.muted, border:`1.5px solid ${filtroSpecie===s?C.primary:C.border}`, borderRadius:20, padding:"5px 14px", fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
              {s==="tutti"?"Tutti":specieIcon(s)+" "+s.charAt(0).toUpperCase()+s.slice(1)}
            </button>
          ))}
          {["tutti","attivo","macellato"].map(s=>(
            <button key={s} onClick={()=>setFiltroStato(s)} style={{ background:filtroStato===s?C.blue:C.card, color:filtroStato===s?"#FFF":C.muted, border:`1.5px solid ${filtroStato===s?C.blue:C.border}`, borderRadius:20, padding:"5px 14px", fontSize:13, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
              {s==="tutti"?"Tutti stati":s==="macellato"?"✓ Macellati":"In allevam."}
            </button>
          ))}
        </div>

        {/* Cards animali */}
        {animali.map(a => {
          const eco = calcolaEconomia(a.id, data);
          const hasMac = !!eco.mac;
          return (
            <div key={a.id} onClick={()=>onSeleziona(a)} style={{ background:C.card, borderRadius:16, padding:16, marginBottom:10, boxShadow:"0 2px 8px rgba(0,0,0,0.07)", border:`1px solid ${C.border}`, cursor:"pointer", borderLeft:`4px solid ${specieColor(a.specie)}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:16 }}>{specieIcon(a.specie)} {a.nome}</div>
                  <div style={{ fontSize:12, color:C.muted }}>{a.bdn} · {a.razza}</div>
                  <div style={{ display:"flex", gap:6, marginTop:6, flexWrap:"wrap" }}>
                    <Badge label={a.stato==="macellato"?"✓ Macellato":"In allevamento"} color={a.stato==="macellato"?C.green:C.blue}/>
                    {eco.costoTotale > 0 && <Badge label={`€${eco.costoTotale.toFixed(0)} costi`} color={C.accent}/>}
                  </div>
                </div>
                <div style={{ textAlign:"right", minWidth:90 }}>
                  {eco.costoPerKg ? (
                    <>
                      <div style={{ fontSize:11, color:C.muted, fontWeight:600 }}>€/kg CARCASSA</div>
                      <div style={{ fontSize:26, fontWeight:900, color: eco.costoPerKg>5?C.red:eco.costoPerKg>3.5?C.yellow:C.green }}>{eco.costoPerKg}</div>
                      {eco.marginePerKg!==null && (
                        <div style={{ fontSize:13, fontWeight:700, color:eco.marginePerKg>=0?C.green:C.red }}>
                          {eco.marginePerKg>=0?"+":""}{eco.marginePerKg} €/kg
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize:12, color:C.muted, fontStyle:"italic" }}>
                      {hasMac ? "calcola→" : "da macellare"}
                    </div>
                  )}
                </div>
              </div>
              {/* Mini barre costi */}
              {eco.costoTotale > 0 && (
                <div style={{ display:"flex", gap:3, marginTop:10, height:6, borderRadius:99, overflow:"hidden" }}>
                  {VOCI.map(v=>{
                    const val = eco.totalePerVoce[v.id]||0;
                    const pct = val/eco.costoTotale*100;
                    if(pct<1) return null;
                    return <div key={v.id} style={{ background:v.color, width:`${pct}%`, transition:"width 0.4s" }} title={`${v.label}: €${val}`}/>;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(initialData);
  const [view, setView] = useState("lista"); // lista | scheda | form_costo | form_mac
  const [selected, setSelected] = useState(null);

  const addCosto = (costo) => {
    setData(d => ({ ...d, costi:[...d.costi,{...costo,id:d.nextId.costi}], nextId:{...d.nextId,costi:d.nextId.costi+1} }));
    setView("scheda");
  };
  const addMacellazione = (mac) => {
    setData(d => {
      const animali = d.animali.map(a => a.id===mac.animaleId ? {...a,stato:"macellato"} : a);
      return { ...d, animali, macellazioni:[...d.macellazioni,{...mac,id:d.nextId.macellazioni}], nextId:{...d.nextId,macellazioni:d.nextId.macellazioni+1} };
    });
    setView("scheda");
  };

  if (view==="form_costo" && selected) return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif", background:C.bg, minHeight:"100vh", maxWidth:480, margin:"0 auto" }}>
      <FormCosto animale={selected} onSave={addCosto} onCancel={()=>setView("scheda")}/>
    </div>
  );
  if (view==="form_mac" && selected) return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif", background:C.bg, minHeight:"100vh", maxWidth:480, margin:"0 auto" }}>
      <FormMacellazione animale={selected} onSave={addMacellazione} onCancel={()=>setView("scheda")}/>
    </div>
  );
  if (view==="scheda" && selected) return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif", background:C.bg, minHeight:"100vh", maxWidth:480, margin:"0 auto" }}>
      <SchedaEconomica
        animale={selected}
        data={data}
        onBack={()=>setView("lista")}
        onAddCosto={()=>setView("form_costo")}
        onAddMacellazione={()=>setView("form_mac")}
      />
    </div>
  );

  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif", background:C.bg, minHeight:"100vh", maxWidth:480, margin:"0 auto" }}>
      <ListaAnimali data={data} onSeleziona={a=>{ setSelected(a); setView("scheda"); }}/>
    </div>
  );
}
