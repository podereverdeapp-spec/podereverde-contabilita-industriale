import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";

// ─── MOTORE UBA — identico a quello reale di podereverdeapp.it (ExportManager.jsx) ───

const UBA_FASCE_EXP = {
  bovino: [{ fino: 210, coeff: 0.40, label: "Vitella (<7 mesi)" }, { fino: 730, coeff: 0.70, label: "Vitellone (7m-2a)" }, { fino: Infinity, coeff: 1.00, label: "Bovino adulto (≥2a)" }],
  suino: [{ fino: 90, coeff: 0.027, label: "Lattonzolo (<3 mesi)" }, { fino: 365, coeff: 0.30, label: "Magrone (3m-1a)" }, { fino: Infinity, coeff: 0.50, label: "Suino adulto (≥1a)" }],
  ovino: [{ fino: 120, coeff: 0.027, label: "Agnello (<4 mesi)" }, { fino: 365, coeff: 0.10, label: "Agnellone (4m-1a)" }, { fino: Infinity, coeff: 0.15, label: "Ovino adulto (≥1a)" }],
};

const MOTIVI_PRODUTTIVI_EXP = ["macellazione", "macellato", "venduto", "riformato", "riforma", "vendita"];

function periodoNellAnnoExp(nascita, dataUscita, stato, anno) {
  if (!nascita) return null;
  const inizioAnno = new Date(anno, 0, 1);
  const fineAnno = new Date(anno, 11, 31, 23, 59, 59);
  const oggi = new Date();
  const dataInizio = new Date(nascita);
  const dataFine = dataUscita ? new Date(dataUscita) : (oggi < fineAnno ? oggi : fineAnno);
  if (dataFine < inizioAnno) return null;
  if (dataInizio > fineAnno) return null;
  const inizio = dataInizio > inizioAnno ? dataInizio : inizioAnno;
  const fine = dataFine < fineAnno ? dataFine : fineAnno;
  return {
    inizio: inizio.toISOString().split("T")[0],
    fine: fine.toISOString().split("T")[0],
    giorni: Math.round((fine - inizio) / 86400000) + 1,
    etaAllInizio: Math.round((inizio - dataInizio) / 86400000),
  };
}

function calcolaUBAMedioExp(specie, giorni, etaAllInizio) {
  if (!specie || !UBA_FASCE_EXP[specie] || giorni <= 0) return null;
  const fasce = UBA_FASCE_EXP[specie];
  let uba = 0;
  for (let i = 0; i < fasce.length; i++) {
    const prev = i > 0 ? fasce[i - 1].fino : 0;
    const { fino, coeff } = fasce[i];
    const iniz = Math.max(prev, etaAllInizio);
    const finz = Math.min(fino === Infinity ? etaAllInizio + giorni + 1 : fino, etaAllInizio + giorni);
    if (finz > iniz) uba += (finz - iniz) * coeff;
  }
  return Math.round(uba / giorni * 1000) / 1000;
}

function categoriaEtàExp(specie, etaAllInizio, giorni) {
  if (!UBA_FASCE_EXP[specie]) return "—";
  const etaFinale = etaAllInizio + giorni;
  for (const { fino, label } of UBA_FASCE_EXP[specie]) if (etaFinale < fino) return label;
  return UBA_FASCE_EXP[specie].at(-1).label;
}

function categoriaContabileExp(animale) {
  if (animale.stato === "attivo") return animale.riproduttore ? "RIPRODUTTORE" : "PRODUTTIVO";
  const motivo = (animale.motivo_uscita || "").toLowerCase();
  const isProduttivo = MOTIVI_PRODUTTIVI_EXP.some(k => motivo.includes(k));
  if (isProduttivo) return animale.riproduttore ? "RIPRODUTTORE" : "PRODUTTIVO";
  return "IMPRODUTTIVO_USCITO";
}

// Calcola tutte le righe UBA per un anno, da animali + lotti suini reali
function calcolaReportUba(animali, lotti, suiniLotto, anno) {
  const righe = [];

  for (const a of animali) {
    if (!a.specie || !UBA_FASCE_EXP[a.specie]) continue;
    const nascita = a.nascita || a.data_ingresso;
    if (!nascita) continue;
    const periodo = periodoNellAnnoExp(nascita, a.data_uscita, a.stato, anno);
    if (!periodo) continue;
    const uba = calcolaUBAMedioExp(a.specie, periodo.giorni, periodo.etaAllInizio);
    if (!uba) continue;
    const ubaGiorni = Math.round(uba * periodo.giorni * 1000) / 1000;
    const cat = categoriaContabileExp(a);

    righe.push({
      bdn: a.bdn || "", nome: a.nome || "", specie: a.specie, categoria: categoriaEtàExp(a.specie, periodo.etaAllInizio, periodo.giorni),
      nascita, inizio_calcolo: periodo.inizio, data_riferimento: periodo.fine, giorni_presenza: periodo.giorni,
      uba_medio: uba, uba_giorni: ubaGiorni, stato: a.stato, qualifica_riproduzione: a.riproduttore ? "Riproduttore" : null,
      data_uscita: a.data_uscita || null, motivo_uscita: a.motivo_uscita || null, lotto: null,
      categoria_contabile: cat, animale_id: a.id,
    });
  }

  for (const l of lotti) {
    if (!l.data_parto) continue;
    const codLotto = l.codice_lotto || l.codice || "";
    for (const u of suiniLotto.filter(x => x.lotto_id === l.id)) {
      if (u.stato === "registrato_individuale") continue;
      const finto = {
        nascita: l.data_parto, data_uscita: u.data_uscita,
        stato: u.stato === "attivo" ? "attivo" : "uscito",
        motivo_uscita: u.motivo_uscita, riproduttore: false,
      };
      const periodo = periodoNellAnnoExp(finto.nascita, finto.data_uscita, finto.stato, anno);
      if (!periodo) continue;
      const uba = calcolaUBAMedioExp("suino", periodo.giorni, periodo.etaAllInizio);
      if (!uba) continue;
      const ubaGiorni = Math.round(uba * periodo.giorni * 1000) / 1000;
      const cat = categoriaContabileExp(finto);
      const codice = u.codice_completo || `${codLotto}${String(u.nr).padStart(2, "0")}`;

      righe.push({
        bdn: codice, nome: "", specie: "suino", categoria: categoriaEtàExp("suino", periodo.etaAllInizio, periodo.giorni),
        nascita: l.data_parto, inizio_calcolo: periodo.inizio, data_riferimento: periodo.fine, giorni_presenza: periodo.giorni,
        uba_medio: uba, uba_giorni: ubaGiorni, stato: finto.stato, qualifica_riproduzione: null,
        data_uscita: u.data_uscita || null, motivo_uscita: u.motivo_uscita || null, lotto: codLotto,
        categoria_contabile: cat, animale_id: null,
      });
    }
  }

  return righe;
}

// ─── COMPONENTE ───

export default function ReportUba() {
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
                  <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
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
