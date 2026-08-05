import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const C = {
  bg:"#F5F0E8", card:"#FFFFFF", primary:"#5C3D1E", accent:"#A0522D",
  green:"#4A7C59", red:"#C0392B", yellow:"#D4A017", blue:"#2C6E9B",
  text:"#2D1B0E", muted:"#8B7355", border:"#D4C4A8",
};

export default function Destinatari() {
  const [destinatari, setDestinatari] = useState([]);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);

  const carica = async () => {
    setLoading(true);
    const [{data:dest}, {data:cfg}, {data:lg}] = await Promise.all([
      supabase.from("destinatari_email").select("*").order("id"),
      supabase.from("configurazione").select("*"),
      supabase.from("log_invii_report").select("*").order("data_invio",{ascending:false}).limit(20),
    ]);
    setDestinatari(dest||[]);
    const cfgObj = {};
    (cfg||[]).forEach(c => cfgObj[c.chiave] = c.valore);
    setConfig(cfgObj);
    setLogs(lg||[]);
    setLoading(false);
  };
  useEffect(()=>{ carica(); }, []);

  const salva = async () => {
    if (!form.email || !form.nome) { alert("Nome ed email obbligatori"); return; }
    setSaving(true);
    if (form.id) {
      await supabase.from("destinatari_email").update({
        nome: form.nome, email: form.email, ruolo: form.ruolo||null,
        attivo: form.attivo, riceve_report: form.riceve_report,
        riceve_backup: form.riceve_backup, riceve_alert: form.riceve_alert,
        note: form.note||null, data_modifica: new Date().toISOString(),
      }).eq("id", form.id);
    } else {
      await supabase.from("destinatari_email").insert([{
        nome: form.nome, email: form.email, ruolo: form.ruolo||null,
        attivo: form.attivo!==false, riceve_report: form.riceve_report!==false,
        riceve_backup: form.riceve_backup===true, riceve_alert: form.riceve_alert===true,
        note: form.note||null,
      }]);
    }
    setSaving(false);
    setForm(null);
    carica();
  };

  const elimina = async (id) => {
    if (!window.confirm("Eliminare questo destinatario? L'operazione è definitiva.")) return;
    await supabase.from("destinatari_email").delete().eq("id", id);
    carica();
  };

  const salvaConfig = async (chiave, valore) => {
    await supabase.from("configurazione").upsert({chiave, valore, data_modifica: new Date().toISOString()});
    setConfig(prev => ({...prev, [chiave]: valore}));
  };

  const [inviandoTest, setInviandoTest] = useState(false);
  const testInvio = async () => {
    if (!window.confirm(
      "Verrà inviata un'email di TEST a tutti i destinatari attivi con permesso Report.\n\n" +
      "Vuoi procedere?"
    )) return;
    setInviandoTest(true);
    try {
      const resp = await fetch(
        "https://pyjymnpnxatqwfhguaus.supabase.co/functions/v1/invio-report-mensile",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ test: true }),
        }
      );
      const data = await resp.json();
      if (resp.ok && data.success) {
        let msg = `✅ Test completato!\n\n` +
          `Destinatari: ${data.destinatari_totali}\n` +
          `Inviate con successo: ${data.inviati_con_successo}\n` +
          `Errori: ${data.errori}\n\n`;
        if (data.errori > 0 && data.dettagli) {
          const primoErrore = data.dettagli.find(d => !d.ok);
          msg += `Dettaglio primo errore (${primoErrore?.email}):\n${primoErrore?.error}\n\n`;
        } else {
          msg += `Controlla le caselle email dei destinatari.`;
        }
        alert(msg);
      } else {
        alert(`⚠️ Errore durante il test:\n\n${data.error || JSON.stringify(data, null, 2)}`);
      }
      carica(); // ricarica log
    } catch (e) {
      alert(`⚠️ Errore di connessione:\n\n${e.message}`);
    }
    setInviandoTest(false);
  };

  if (loading) {
    return <div style={{textAlign:"center",padding:60,color:C.muted}}>⏳ Caricamento...</div>;
  }

  // ── FORM MODIFICA/NUOVO ───────────────────────────────────────────────────
  if (form) {
    return (
      <div style={{padding:"16px 16px 80px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <button onClick={()=>setForm(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
          <span style={{fontSize:18,fontWeight:800}}>{form.id?"Modifica destinatario":"Nuovo destinatario"}</span>
        </div>
        <div style={{background:C.card,borderRadius:16,padding:14,marginBottom:12,border:`1px solid ${C.border}`}}>
          <label style={{fontSize:12,fontWeight:700,color:C.muted}}>NOME *</label>
          <input type="text" value={form.nome||""} onChange={e=>setForm(f=>({...f,nome:e.target.value}))}
            placeholder="Es. Mario Rossi"
            style={{width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,
              borderRadius:10,padding:"9px 12px",fontSize:14,marginBottom:12,marginTop:4}}/>

          <label style={{fontSize:12,fontWeight:700,color:C.muted}}>EMAIL *</label>
          <input type="email" value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value.toLowerCase().trim()}))}
            placeholder="mario.rossi@esempio.it"
            style={{width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,
              borderRadius:10,padding:"9px 12px",fontSize:14,marginBottom:12,marginTop:4}}/>

          <label style={{fontSize:12,fontWeight:700,color:C.muted}}>RUOLO</label>
          <input type="text" value={form.ruolo||""} onChange={e=>setForm(f=>({...f,ruolo:e.target.value}))}
            placeholder="Es. Commercialista, Direttore, Consulente..."
            style={{width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,
              borderRadius:10,padding:"9px 12px",fontSize:14,marginBottom:16,marginTop:4}}/>

          <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:8}}>COSA DEVE RICEVERE</div>
          {[
            {k:"riceve_report",l:"📊 Report mensili completi",d:"Report Excel di tutte le sezioni + link Google Drive"},
            {k:"riceve_backup",l:"💾 Backup database mensile",d:"File SQL con backup completo del database (per archivio)"},
            {k:"riceve_alert",l:"🚨 Alert operativi",d:"Notifiche scadenze richiami, emergenze sanitarie (futuro)"},
          ].map(x=>(
            <div key={x.k} onClick={()=>setForm(f=>({...f,[x.k]:!f[x.k]}))}
              style={{display:"flex",gap:10,alignItems:"flex-start",padding:"8px 10px",
                background:form[x.k]?C.green+"12":C.bg,borderRadius:10,marginBottom:6,
                border:`1px solid ${form[x.k]?C.green+"55":C.border}`,cursor:"pointer"}}>
              <div style={{width:20,height:20,borderRadius:6,marginTop:2,
                background:form[x.k]?C.green:C.card,
                border:`2px solid ${form[x.k]?C.green:C.border}`,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {form[x.k]&&<span style={{color:"#FFF",fontWeight:800,fontSize:13}}>✓</span>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:C.text}}>{x.l}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:1}}>{x.d}</div>
              </div>
            </div>
          ))}

          <div style={{marginTop:16,marginBottom:12}}>
            <label style={{fontSize:12,fontWeight:700,color:C.muted}}>NOTE</label>
            <textarea value={form.note||""} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
              placeholder="Note interne (opzionale)"
              rows={2}
              style={{width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,
                borderRadius:10,padding:"9px 12px",fontSize:13,marginTop:4,resize:"vertical"}}/>
          </div>

          {form.id&&(
            <div onClick={()=>setForm(f=>({...f,attivo:!f.attivo}))}
              style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",
                background:form.attivo!==false?C.green+"12":C.red+"12",
                border:`1px solid ${form.attivo!==false?C.green+"55":C.red+"55"}`,
                borderRadius:10,cursor:"pointer"}}>
              <div style={{width:36,height:20,borderRadius:10,
                background:form.attivo!==false?C.green:C.red,
                position:"relative",transition:"background 0.2s"}}>
                <div style={{position:"absolute",left:form.attivo!==false?18:2,top:2,
                  width:16,height:16,borderRadius:8,background:"#FFF",
                  transition:"left 0.2s"}}/>
              </div>
              <span style={{fontSize:13,fontWeight:600,color:form.attivo!==false?C.green:C.red}}>
                {form.attivo!==false?"✅ Destinatario ATTIVO":"⛔ Destinatario DISATTIVATO"}
              </span>
            </div>
          )}
        </div>

        <div style={{display:"flex",gap:10}}>
          <button onClick={salva} disabled={saving}
            style={{background:C.green,color:"#FFF",border:"none",borderRadius:12,
              padding:"12px 24px",fontSize:15,fontWeight:700,cursor:"pointer",flex:1}}>
            {saving?"⏳ Salvataggio...":"✓ Salva"}
          </button>
          <button onClick={()=>setForm(null)}
            style={{background:C.card,color:C.muted,border:`1.5px solid ${C.border}`,
              borderRadius:12,padding:"12px 20px",fontSize:14,cursor:"pointer"}}>
            Annulla
          </button>
        </div>
      </div>
    );
  }

  // ── VISTA LOG INVII ───────────────────────────────────────────────────────
  if (showLogs) {
    return (
      <div style={{padding:"16px 16px 80px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <button onClick={()=>setShowLogs(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
          <span style={{fontSize:18,fontWeight:800}}>📋 Storico invii</span>
        </div>
        {logs.length===0 ? (
          <div style={{textAlign:"center",padding:40,color:C.muted}}>
            <div style={{fontSize:36,marginBottom:8}}>📭</div>
            <div>Nessun invio registrato</div>
            <div style={{fontSize:12,marginTop:8}}>
              Gli invii mensili appariranno qui una volta configurato il sistema
            </div>
          </div>
        ) : logs.map(l=>{
          const dt = new Date(l.data_invio);
          const statoColor = l.stato==="completato"?C.green : l.stato==="errore"?C.red : C.yellow;
          return (
            <div key={l.id} style={{background:C.card,borderRadius:12,padding:12,marginBottom:8,
              border:`1px solid ${C.border}`,borderLeft:`4px solid ${statoColor}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:12,fontWeight:700,color:statoColor,
                  background:statoColor+"15",padding:"2px 8px",borderRadius:8}}>
                  {l.tipo?.toUpperCase()}
                </span>
                <span style={{fontSize:11,color:C.muted}}>{dt.toLocaleString("it-IT")}</span>
              </div>
              <div style={{fontSize:13,color:C.text,marginBottom:4}}>
                Mese: <b>{l.mese_riferimento||"—"}</b> · Stato: <b>{l.stato}</b>
              </div>
              <div style={{fontSize:11,color:C.muted}}>
                Destinatari: {(l.destinatari||[]).length} · File: {(l.files_generati||[]).length}
              </div>
              {l.errore&&(
                <div style={{fontSize:11,color:C.red,marginTop:4,padding:6,
                  background:C.red+"10",borderRadius:6}}>
                  ⚠️ {l.errore}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── VISTA PRINCIPALE ──────────────────────────────────────────────────────
  const attivi = destinatari.filter(d=>d.attivo!==false);

  return (
    <div style={{padding:"16px 16px 80px"}}>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.primary},${C.accent})`,
        borderRadius:20,padding:"18px 16px",marginBottom:16,color:"#FFF"}}>
        <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>📮 Report Mensili</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.85)"}}>
          Gestione destinatari e invio automatico report + backup
        </div>
        <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
          <div style={{background:"rgba(255,255,255,0.2)",borderRadius:10,padding:"6px 12px",fontSize:12}}>
            👥 {attivi.length} destinatari attivi
          </div>
          <div style={{background:"rgba(255,255,255,0.2)",borderRadius:10,padding:"6px 12px",fontSize:12}}>
            📅 Invio: 1° del mese ore 06:00
          </div>
        </div>
      </div>

      {/* Card configurazione Google Drive */}
      <div style={{background:C.card,borderRadius:14,padding:14,marginBottom:12,
        border:`1.5px solid ${config.drive_folder_url?C.green+"55":C.yellow+"55"}`,
        borderLeft:`5px solid ${config.drive_folder_url?C.green:C.yellow}`}}>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
          <span style={{fontSize:18}}>📁</span>
          <span style={{fontWeight:700,fontSize:14}}>Cartella Google Drive</span>
          {config.drive_folder_url ?
            <span style={{fontSize:11,color:C.green,fontWeight:700,marginLeft:"auto"}}>✓ Configurata</span>
          :
            <span style={{fontSize:11,color:C.yellow,fontWeight:700,marginLeft:"auto"}}>⚠ Da configurare</span>
          }
        </div>
        <input type="text" value={config.drive_folder_url||""}
          onChange={e=>salvaConfig("drive_folder_url", e.target.value)}
          placeholder="Incolla qui il link della cartella Drive"
          style={{width:"100%",boxSizing:"border-box",border:`1px solid ${C.border}`,
            borderRadius:8,padding:"7px 10px",fontSize:12,fontFamily:"monospace"}}/>
        <div style={{fontSize:11,color:C.muted,marginTop:6,lineHeight:1.4}}>
          Crea su Drive la cartella <b>"Podere Verde — Archivio Report"</b>,
          condividila con i destinatari come "Visualizzatore" e incolla qui il link.
        </div>
      </div>

      {/* Card promemoria upload manuale mensile */}
      {(()=>{
        const oggi = new Date();
        const meseCorrente = `${oggi.getFullYear()}-${String(oggi.getMonth()+1).padStart(2,"0")}`;
        const ultimoUpload = config.ultimo_upload_manuale_mese || "";
        const giornoDelMese = oggi.getDate();
        const daConfermare = ultimoUpload !== meseCorrente;
        const inFinestraPromemoria = giornoDelMese <= 10; // primi 10 giorni del mese

        if (!daConfermare) {
          return (
            <div style={{background:C.green+"12",border:`1.5px solid ${C.green}44`,
              borderRadius:14,padding:14,marginBottom:12,display:"flex",
              justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:C.green}}>
                  ✅ Upload di questo mese confermato
                </div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                  Report caricati su Drive per {meseCorrente}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div style={{background:inFinestraPromemoria?C.yellow+"14":C.card,
            border:`1.5px solid ${inFinestraPromemoria?C.yellow+"55":C.border}`,
            borderRadius:14,padding:14,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:inFinestraPromemoria?C.yellow:C.muted}}>
                  {inFinestraPromemoria?"⏰ Promemoria: ":""}📁 Carica i report su Google Drive
                </div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                  Genera gli Excel dal tab 📥 Esporta e caricali nella cartella del mese {meseCorrente}.
                  Poi conferma qui sotto.
                </div>
              </div>
              <button onClick={async()=>{
                  await salvaConfig("ultimo_upload_manuale_mese", meseCorrente);
                }}
                style={{background:C.green,color:"#FFF",border:"none",borderRadius:16,
                  padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer",
                  whiteSpace:"nowrap",flexShrink:0}}>
                ✓ Fatto
              </button>
            </div>
          </div>
        );
      })()}

      {/* Pulsanti azione */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <button onClick={()=>setForm({attivo:true,riceve_report:true,riceve_backup:false,riceve_alert:false})}
          style={{background:C.green,color:"#FFF",border:"none",borderRadius:20,
            padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
          ➕ Nuovo destinatario
        </button>
        <button onClick={testInvio} disabled={inviandoTest}
          style={{background:C.blue,color:"#FFF",border:"none",borderRadius:20,
            padding:"8px 14px",fontSize:13,fontWeight:700,
            cursor:inviandoTest?"wait":"pointer",opacity:inviandoTest?0.7:1}}>
          {inviandoTest?"⏳ Invio in corso...":"🧪 Test invio"}
        </button>
        <button onClick={()=>setShowLogs(true)}
          style={{background:C.card,color:C.primary,border:`1.5px solid ${C.primary}`,
            borderRadius:20,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
          📋 Storico invii ({logs.length})
        </button>
      </div>

      {/* Lista destinatari */}
      <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>
        Destinatari registrati ({destinatari.length})
      </div>
      {destinatari.length===0 ? (
        <div style={{textAlign:"center",padding:40,color:C.muted}}>
          <div style={{fontSize:36,marginBottom:8}}>📭</div>
          <div>Nessun destinatario registrato</div>
        </div>
      ) : destinatari.map(d=>(
        <div key={d.id} onClick={()=>setForm({...d})}
          style={{background:C.card,borderRadius:12,padding:12,marginBottom:8,
            border:`1px solid ${C.border}`,cursor:"pointer",
            opacity:d.attivo===false?0.55:1,
            borderLeft:`4px solid ${d.attivo===false?C.red:C.green}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:3}}>
                <span style={{fontWeight:700,fontSize:14}}>{d.nome}</span>
                {d.attivo===false&&<span style={{fontSize:10,background:C.red+"22",color:C.red,
                  padding:"1px 6px",borderRadius:6,fontWeight:700}}>DISATTIVO</span>}
              </div>
              <div style={{fontSize:12,color:C.muted,marginBottom:3}}>{d.email}</div>
              {d.ruolo&&<div style={{fontSize:11,color:C.accent,fontWeight:600,marginBottom:4}}>{d.ruolo}</div>}
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {d.riceve_report&&<span style={{fontSize:10,background:C.blue+"18",color:C.blue,
                  padding:"2px 7px",borderRadius:6,fontWeight:700}}>📊 Report</span>}
                {d.riceve_backup&&<span style={{fontSize:10,background:C.primary+"18",color:C.primary,
                  padding:"2px 7px",borderRadius:6,fontWeight:700}}>💾 Backup</span>}
                {d.riceve_alert&&<span style={{fontSize:10,background:C.red+"18",color:C.red,
                  padding:"2px 7px",borderRadius:6,fontWeight:700}}>🚨 Alert</span>}
              </div>
            </div>
            <button onClick={(e)=>{e.stopPropagation();elimina(d.id);}}
              style={{background:C.red+"18",border:"none",borderRadius:8,padding:"5px 8px",
                cursor:"pointer",fontSize:12,color:C.red}}>🗑️</button>
          </div>
        </div>
      ))}

      {/* Info riepilogo */}
      <div style={{background:C.blue+"10",border:`1px solid ${C.blue}33`,
        borderRadius:12,padding:12,marginTop:16,fontSize:12,color:C.text}}>
        ℹ️ <b>Il 1° di ogni mese alle 06:00</b> l'app genererà automaticamente tutti i report Excel
        del mese chiuso, un backup SQL del database, li caricherà nella cartella Google Drive
        e invierà email di notifica ai destinatari attivi in base al loro tipo di ricezione.
      </div>
    </div>
  );
}
