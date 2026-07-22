import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { C } from "./style";

const MESI = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

export default function Dashboard({ onNavigate }) {
  const [fatture, setFatture] = useState([]);
  const [fornitori, setFornitori] = useState([]);
  const [reportAcquisto, setReportAcquisto] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anno, setAnno] = useState(new Date().getFullYear());

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    const [{ data: f, error: eF }, { data: fo, error: eFo }, { data: ra, error: eRA }] = await Promise.all([
      supabase.from("ci_fatture").select("*, ci_fornitori(nome)").order("data", { ascending: false }),
      supabase.from("ci_fornitori").select("*"),
      supabase.from("ci_report_acquisto_animali").select("*").eq("stato", "DA_ELABORARE"),
    ]);
    const errore = eF || eFo || eRA;
    if (errore) {
      alert(`⚠️ Errore nel caricamento della dashboard:\n\n${errore.message}`);
    } else {
      setFatture(f || []);
      setFornitori(fo || []);
      setReportAcquisto(ra || []);
    }
    setLoading(false);
  }

  const anniDisponibili = useMemo(() => {
    const anni = new Set(fatture.map(f => new Date(f.data).getFullYear()));
    anni.add(new Date().getFullYear());
    return [...anni].sort((a, b) => b - a);
  }, [fatture]);

  const fattureAnno = useMemo(
    () => fatture.filter(f => new Date(f.data).getFullYear() === anno),
    [fatture, anno]
  );
  const fatturePassiveAnno = fattureAnno.filter(f => f.tipo === "PASSIVA");
  const fattureAttiveAnno = fattureAnno.filter(f => f.tipo === "ATTIVA");

  const totaleSpeseAnno = fatturePassiveAnno.reduce((s, f) => s + (f.totale_lordo || 0), 0);
  const totaleRicaviAnno = fattureAttiveAnno.reduce((s, f) => s + (f.totale_lordo || 0), 0);

  const perMese = useMemo(() => {
    const mesi = Array.from({ length: 12 }, () => 0);
    fatturePassiveAnno.forEach(f => {
      const m = new Date(f.data).getMonth();
      mesi[m] += f.totale_lordo || 0;
    });
    return mesi;
  }, [fatturePassiveAnno]);
  const maxMese = Math.max(...perMese, 1);

  const fornitoriRecenti = useMemo(() => {
    const perFornitore = {};
    fatture.forEach(f => {
      if (!f.fornitore_id) return;
      if (!perFornitore[f.fornitore_id] || f.data > perFornitore[f.fornitore_id].data) {
        perFornitore[f.fornitore_id] = f;
      }
    });
    return Object.values(perFornitore).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5);
  }, [fatture]);

  const fornitoriAttivi = fornitori.filter(f => f.attivo).length;

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Caricamento...</div>;

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, margin: 0 }}>Dashboard</h1>
        <select value={anno} onChange={e => setAnno(parseInt(e.target.value))}
          style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14 }}>
          {anniDisponibili.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        <Kpi label={`Spese ${anno}`} value={`${totaleSpeseAnno.toFixed(2)}€`} color={C.red} sub={`${fatturePassiveAnno.length} fatture passive`} />
        <Kpi label={`Ricavi ${anno}`} value={`${totaleRicaviAnno.toFixed(2)}€`} color={C.green} sub={`${fattureAttiveAnno.length} fatture attive`} />
        <Kpi label="Fornitori attivi" value={fornitoriAttivi} color={C.blue} sub={`su ${fornitori.length} totali`} />
        <Kpi
          label="Acquisto animali da elaborare" value={reportAcquisto.length} color={C.accent}
          sub={`${reportAcquisto.reduce((s, r) => s + (r.importo || 0), 0).toFixed(2)}€`}
          onClick={() => onNavigate?.("acquisto")}
        />
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, marginBottom: 14 }}>ANDAMENTO SPESE {anno}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
          {perMese.map((val, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{
                width: "100%", background: val > 0 ? C.primary : C.border, borderRadius: "4px 4px 0 0",
                height: `${Math.max((val / maxMese) * 100, 2)}px`,
                transition: "height 0.3s",
              }} title={`${MESI[i]}: ${val.toFixed(2)}€`} />
              <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{MESI[i]}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, marginBottom: 12 }}>FORNITORI RECENTI</div>
          {fornitoriRecenti.length === 0 && <p style={{ color: C.muted, fontSize: 13 }}>Nessuna fattura ancora caricata.</p>}
          {fornitoriRecenti.map(f => (
            <div key={f.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
              <span>{f.ci_fornitori?.nome || "—"}</span>
              <span style={{ color: C.muted }}>{f.data}</span>
            </div>
          ))}
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, marginBottom: 12 }}>ULTIME FATTURE INSERITE</div>
          {fatture.length === 0 && <p style={{ color: C.muted, fontSize: 13 }}>Nessuna fattura ancora caricata.</p>}
          {fatture.slice(0, 5).map(f => (
            <div key={f.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
              <span>{f.ci_fornitori?.nome || "—"} · {f.numero}</span>
              <span style={{ fontWeight: 700, color: f.tipo === "ATTIVA" ? C.green : C.red }}>
                {f.totale_lordo?.toFixed(2)}€
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color, sub, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: color + "15", borderRadius: 12, padding: 16,
      cursor: onClick ? "pointer" : "default",
    }}>
      <div style={{ fontSize: 12, color, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
