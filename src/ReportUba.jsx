import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { calcolaReportUba } from "./motoreUba";

// ─── COMPONENTE ───

export default function ReportUba({ onVediScheda }) {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [righe, setRighe] = useState(null);
  const [calcolando, setCalcolando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [importiPrecedenti, setImportiPrecedenti] = useState([]);

  useEffect(() => { caricaImportiPrecedenti(); }, []);
  async function caricaImportiPrecedenti() {
    const { data } = await supabase.from("ci_report_uba_import").select("*").order("anno", { ascending: false });
    setImportiPrecedenti(data || []);
  }

  async function calcola() {
    setCalcolando(true);
    setRighe(null);
    try {
      const [{ data: animali, error: eA }, { data: lotti, error: eL }, { data: suiniLotto, error: eS }] = await Promise.all([
        supabase.from("animali").select("id,bdn,nome,specie,sesso,nascita,stato,data_uscita,motivo_uscita,data_ingresso,razza,riproduttore"),
        supabase.from("lotti_suini").select("*"),
        supabase.from("suini_lotto").select("*"),
      ]);
      const errore = eA || eL || eS;
      if (errore) throw new Error(errore.message);

      const risultati = calcolaReportUba(animali || [], lotti || [], suiniLotto || [], anno);
      setRighe(risultati);
    } catch (err) {
      alert(`⚠️ Errore nel calcolo:\n\n${err.message}`);
    }
    setCalcolando(false);
  }

  const riepilogo = righe ? {
    produttivo: righe.filter(r => r.categoria_contabile === "PRODUTTIVO").length,
    riproduttore: righe.filter(r => r.categoria_contabile === "RIPRODUTTORE").length,
    improduttivo: righe.filter(r => r.categoria_contabile === "IMPRODUTTIVO_USCITO").length,
    ubaGiorniProduttivo: righe.filter(r => r.categoria_contabile === "PRODUTTIVO").reduce((s, r) => s + r.uba_giorni, 0),
    ubaGiorniRiproduttore: righe.filter(r => r.categoria_contabile === "RIPRODUTTORE").reduce((s, r) => s + r.uba_giorni, 0),
    ubaGiorniImproduttivo: righe.filter(r => r.categoria_contabile === "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0),
  } : null;

  const riepilogoPerSpecie = righe ? (() => {
    const ubaGiorniTotaliAzienda = righe.reduce((s, r) => s + r.uba_giorni, 0);
    return ["bovino", "suino", "ovino"].map(sp => {
      const righeSp = righe.filter(r => r.specie === sp);
      if (righeSp.length === 0) return null;
      const ubaGiorniSp = righeSp.reduce((s, r) => s + r.uba_giorni, 0);
      const improduttiviSp = righeSp.filter(r => r.categoria_contabile === "IMPRODUTTIVO_USCITO");
      const ubaGiorniPersiSp = improduttiviSp.reduce((s, r) => s + r.uba_giorni, 0);
      return {
        specie: sp, nCapi: righeSp.length, ubaGiorni: ubaGiorniSp,
        percentualeSulTotale: ubaGiorniTotaliAzienda > 0 ? (ubaGiorniSp / ubaGiorniTotaliAzienda * 100) : 0,
        nCapiImproduttivi: improduttiviSp.length, ubaGiorniPersi: ubaGiorniPersiSp,
        percentualePersaSullaSpecie: ubaGiorniSp > 0 ? (ubaGiorniPersiSp / ubaGiorniSp * 100) : 0,
      };
    }).filter(Boolean);
  })() : null;

  async function salvaReport() {
    if (!righe || righe.length === 0) return;
    if (!window.confirm(`Salvare il report UBA per l'anno ${anno} (${righe.length} righe)? Se esiste già un report per questo anno, verrà sostituito.`)) return;

    setSalvando(true);
    try {
      await supabase.from("ci_report_uba_import").delete().eq("anno", anno);
      const { data: importRecord, error: eImp } = await supabase.from("ci_report_uba_import").insert([{
        anno, nome_file: null, nome_foglio: "Calcolato direttamente da animali reali",
        tot_produttivo: riepilogo.produttivo, uba_giorni_produttivo: riepilogo.ubaGiorniProduttivo,
        tot_riproduttore: riepilogo.riproduttore, uba_giorni_riproduttore: riepilogo.ubaGiorniRiproduttore,
        tot_improduttivo: riepilogo.improduttivo, uba_giorni_improduttivo: riepilogo.ubaGiorniImproduttivo,
        righe_saltate: 0,
      }]).select().single();
      if (eImp) throw new Error(eImp.message);

      const daInserire = righe.map(r => ({
        import_id: importRecord.id, anno, animale_id: r.animale_id,
        bdn: r.bdn, nome: r.nome, specie: r.specie, categoria: r.categoria,
        nascita: r.nascita, inizio_calcolo: r.inizio_calcolo, data_riferimento: r.data_riferimento,
        giorni_presenza: r.giorni_presenza, uba_medio: r.uba_medio, uba_giorni: r.uba_giorni,
        stato: r.stato, qualifica_riproduzione: r.qualifica_riproduzione, data_uscita: r.data_uscita,
        motivo_uscita: r.motivo_uscita, lotto: r.lotto, categoria_contabile: r.categoria_contabile,
      }));
      for (let i = 0; i < daInserire.length; i += 200) {
        const { error } = await supabase.from("ci_report_uba_animale").insert(daInserire.slice(i, i + 200));
        if (error) throw new Error(error.message);
      }
      alert(`✓ Report UBA salvato per l'anno ${anno} (${righe.length} righe).`);
      caricaImportiPrecedenti();
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio:\n\n${err.message}`);
    }
    setSalvando(false);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Report UBA</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Calcolato direttamente dagli animali e lotti reali di podereverdeapp.it — nessun file da caricare, stesso motore usato in ExportManager.jsx (fasce d'età, giorni di presenza, categoria contabile).
      </p>

      {importiPrecedenti.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>REPORT GIÀ SALVATI</div>
          {importiPrecedenti.map(imp => (
            <div key={imp.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
              <span>Anno {imp.anno}</span>
              <span style={{ color: C.muted }}>{imp.tot_produttivo} produttivi · {imp.tot_riproduttore} riproduttori · {imp.tot_improduttivo} improduttivi</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Anno</label>
            <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
              style={{ padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, width: 100 }} />
          </div>
          <button onClick={calcola} disabled={calcolando}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {calcolando ? "Calcolo in corso..." : "🐮 Calcola Report UBA"}
          </button>
        </div>
      </div>

      {righe && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <StatBox label="Produttivo" value={riepilogo.produttivo} sub={`${riepilogo.ubaGiorniProduttivo.toFixed(1)} UBA-gg`} color={C.green} />
            <StatBox label="Riproduttore" value={riepilogo.riproduttore} sub={`${riepilogo.ubaGiorniRiproduttore.toFixed(1)} UBA-gg`} color={C.blue} />
            <StatBox label="Improduttivo (perdita)" value={riepilogo.improduttivo} sub={`${riepilogo.ubaGiorniImproduttivo.toFixed(1)} UBA-gg`} color={C.red} />
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 10 }}>RIEPILOGO PER SPECIE</div>
            <table style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left" }}>
                  <th style={{ padding: "4px 8px" }}>Specie</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>N° Capi</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>UBA-giorni</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>% sul totale</th>
                </tr>
              </thead>
              <tbody>
                {riepilogoPerSpecie.map(r => (
                  <tr key={r.specie} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "6px 8px", textTransform: "capitalize" }}>{r.specie}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.nCapi}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.ubaGiorni.toFixed(1)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{r.percentualeSulTotale.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {riepilogoPerSpecie.some(r => r.nCapiImproduttivi > 0) && (
            <div style={{ background: "#FFF3E0", border: `1.5px solid ${C.red}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 10 }}>⚠️ PERDITE PER SPECIE (animali improduttivi usciti)</div>
              <table style={{ width: "100%", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: C.muted, textAlign: "left" }}>
                    <th style={{ padding: "4px 8px" }}>Specie</th>
                    <th style={{ padding: "4px 8px", textAlign: "right" }}>N° Capi persi</th>
                    <th style={{ padding: "4px 8px", textAlign: "right" }}>UBA-giorni persi</th>
                    <th style={{ padding: "4px 8px", textAlign: "right" }}>% sulla specie</th>
                  </tr>
                </thead>
                <tbody>
                  {riepilogoPerSpecie.filter(r => r.nCapiImproduttivi > 0).map(r => (
                    <tr key={r.specie} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "6px 8px", textTransform: "capitalize" }}>{r.specie}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.nCapiImproduttivi}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.ubaGiorniPersi.toFixed(1)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: C.red }}>{r.percentualePersaSullaSpecie.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
                Il costo economico di questa perdita (spalmato sui capi utili) è calcolato in Report Costi.
              </div>
            </div>
          )}

          <p style={{ fontSize: 12, color: C.muted, marginTop: 0, marginBottom: 8 }}>Clicca su una riga per aprire la Scheda Animale con lo storico costo completo.</p>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16, maxHeight: 400, overflowY: "auto" }}>
            <table style={{ width: "100%", fontSize: 12 }}>
              <thead style={{ position: "sticky", top: 0, background: C.primary, color: "#fff" }}>
                <tr>
                  <th style={th}>BDN/Codice</th><th style={th}>Specie</th><th style={th}>Categoria età</th>
                  <th style={th}>Giorni</th><th style={th}>UBA-giorni</th><th style={th}>Categoria contabile</th>
                </tr>
              </thead>
              <tbody>
                {righe.slice(0, 150).map((r, i) => (
                  <tr key={i} onClick={() => onVediScheda && r.bdn && onVediScheda(r.bdn)}
                    style={{ borderTop: `1px solid ${C.border}`, cursor: onVediScheda ? "pointer" : "default" }}>
                    <td style={td}>{r.bdn || "—"}</td>
                    <td style={td}>{r.specie}</td>
                    <td style={td}>{r.categoria}</td>
                    <td style={{ ...td, textAlign: "right" }}>{r.giorni_presenza}</td>
                    <td style={{ ...td, textAlign: "right" }}>{r.uba_giorni.toFixed(2)}</td>
                    <td style={{ ...td, fontWeight: 700, color: r.categoria_contabile === "IMPRODUTTIVO_USCITO" ? C.red : r.categoria_contabile === "RIPRODUTTORE" ? C.blue : C.green }}>
                      {r.categoria_contabile}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {righe.length > 150 && <div style={{ padding: 10, textAlign: "center", color: C.muted, fontSize: 12 }}>... e altre {righe.length - 150} righe</div>}
          </div>

          <button onClick={salvaReport} disabled={salvando}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            {salvando ? "Salvataggio..." : `💾 Salva questo report (${righe.length} righe) per l'anno ${anno}`}
          </button>
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, sub, color }) {
  return (
    <div style={{ background: color + "15", borderRadius: 10, padding: "10px 16px", minWidth: 140 }}>
      <div style={{ fontSize: 12, color, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
    </div>
  );
}
const th = { padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700 };
const td = { padding: "6px 10px", fontSize: 12 };
