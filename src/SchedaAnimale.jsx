import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, formattaEuro, formattaNumero } from "./parsingUtils";

export default function SchedaAnimale({ ricercaIniziale, onRicercaConsumata }) {
  const [ricerca, setRicerca] = useState(ricercaIniziale || "");
  const [risultatiRicerca, setRisultatiRicerca] = useState([]);
  const [cercando, setCercando] = useState(false);
  const [selezionato, setSelezionato] = useState(null); // { tipo:"animale"|"lotto", ...dati }
  const [storicoCosto, setStoricoCosto] = useState(null);
  const [caricandoStorico, setCaricandoStorico] = useState(false);

  useEffect(() => {
    if (ricercaIniziale) {
      setRicerca(ricercaIniziale);
      cerca(ricercaIniziale);
      if (onRicercaConsumata) onRicercaConsumata();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ricercaIniziale]);

  async function cerca(termine) {
    const q = (termine ?? ricerca).trim();
    if (!q) return;
    setCercando(true);
    setSelezionato(null);
    try {
      const { data: animaliTrovati, error: eA } = await supabase
        .from("animali").select("id,bdn,nome,specie,razza,sesso,stato,nascita,data_uscita,riproduttore")
        .or(`bdn.ilike.%${q}%,nome.ilike.%${q}%`).limit(20);
      if (eA) throw new Error(eA.message);

      const { data: unitaTrovate, error: eU } = await supabase
        .from("suini_lotto").select("id,lotto_id,nr,codice_completo,bdn,matricola,stato")
        .or(`codice_completo.ilike.%${q}%,matricola.ilike.%${q}%`).limit(20);
      if (eU) throw new Error(eU.message);

      let unitaConLotto = [];
      if (unitaTrovate && unitaTrovate.length > 0) {
        const idLotti = [...new Set(unitaTrovate.map(u => u.lotto_id))];
        const { data: lottiRel } = await supabase.from("lotti_suini").select("id, codice_lotto, codice").in("id", idLotti);
        const mappaLotti = new Map((lottiRel || []).map(l => [l.id, l]));
        unitaConLotto = unitaTrovate.map(u => ({ ...u, lotto: mappaLotti.get(u.lotto_id) }));
      }

      setRisultatiRicerca([
        ...(animaliTrovati || []).map(a => ({ tipo: "animale", ...a })),
        ...unitaConLotto.map(u => ({ tipo: "lotto", ...u })),
      ]);
    } catch (err) {
      alert(`⚠️ Errore nella ricerca:\n\n${err.message}`);
    }
    setCercando(false);
  }

  async function selezionaEd(item) {
    setSelezionato(item);
    setCaricandoStorico(true);
    setStoricoCosto(null);
    try {
      let query = supabase.from("ci_costo_animale_annuale").select("*").order("anno");
      if (item.tipo === "animale") query = query.eq("animale_id", item.id);
      else query = query.eq("lotto_id", item.lotto_id).eq("unita_nr", item.nr);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      setStoricoCosto(numerizzaCampi(data || [], ["uba_giorni", "costo_mantenimento", "costo_nascita_ereditato", "quota_scaricata_su_figli", "costo_totale_anno"]));
    } catch (err) {
      alert(`⚠️ Errore nel caricamento dello storico costo:\n\n${err.message}`);
    }
    setCaricandoStorico(false);
  }

  const totaleCumulato = storicoCosto ? storicoCosto.reduce((s, r) => s + (r.costo_totale_anno || 0), 0) : 0;

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Scheda Animale</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Cerca per BDN o nome (anche unità di lotto suini) per vedere lo storico costo anno per anno e il totale cumulato.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={ricerca} onChange={e => setRicerca(e.target.value)}
          onKeyDown={e => e.key === "Enter" && cerca()}
          placeholder="BDN, nome, o codice unità (es. IT058990123456, BELLA, L2501CN03)"
          style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14 }} />
        <button onClick={() => cerca()} disabled={cercando}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {cercando ? "..." : "🔍 Cerca"}
        </button>
      </div>

      {risultatiRicerca.length > 0 && !selezionato && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 20 }}>
          {risultatiRicerca.map(item => (
            <div key={`${item.tipo}-${item.id}`} onClick={() => selezionaEd(item)}
              style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
              <strong>{item.tipo === "animale" ? (item.bdn || item.nome) : (item.codice_completo || item.matricola)}</strong>
              {item.tipo === "animale" && <span style={{ color: C.muted, fontSize: 12 }}> — {item.nome} · {item.specie} · {item.razza}</span>}
              {item.tipo === "lotto" && <span style={{ color: C.muted, fontSize: 12 }}> — unità di lotto {item.lotto?.codice_lotto || item.lotto?.codice}</span>}
            </div>
          ))}
        </div>
      )}

      {risultatiRicerca.length === 0 && ricerca && !cercando && !selezionato && (
        <p style={{ color: C.muted }}>Nessun risultato per "{ricerca}".</p>
      )}

      {selezionato && (
        <>
          <button onClick={() => { setSelezionato(null); setStoricoCosto(null); }}
            style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: C.muted, cursor: "pointer", marginBottom: 16 }}>
            ← Nuova ricerca
          </button>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.primary }}>
              {selezionato.tipo === "animale" ? (selezionato.bdn || selezionato.nome) : (selezionato.codice_completo || selezionato.matricola)}
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
              {selezionato.tipo === "animale"
                ? `${selezionato.nome || "—"} · ${selezionato.specie} · ${selezionato.razza || "—"} · ${selezionato.sesso || "—"} · Stato: ${selezionato.stato}${selezionato.riproduttore ? " · Riproduttore" : ""}`
                : `Unità di lotto ${selezionato.lotto?.codice_lotto || selezionato.lotto?.codice} · Stato: ${selezionato.stato}`}
            </div>
          </div>

          {caricandoStorico ? (
            <p style={{ color: C.muted }}>Caricamento storico costo...</p>
          ) : !storicoCosto || storicoCosto.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <p style={{ color: C.muted, margin: 0 }}>Nessun costo ancora calcolato per questo animale — usa "Report Costi" per l'anno di interesse, poi salva il calcolo.</p>
            </div>
          ) : (
            <>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
                <table style={{ width: "100%", fontSize: 13 }}>
                  <thead style={{ background: C.primary, color: "#fff" }}>
                    <tr>
                      <th style={th}>Anno</th><th style={th}>UBA-giorni</th><th style={th}>Categoria</th>
                      <th style={th}>Costo mantenimento</th><th style={th}>Costo nascita ereditato</th>
                      <th style={th}>Scaricato sui figli</th><th style={th}>Totale anno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storicoCosto.map(r => (
                      <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={td}>{r.anno}</td>
                        <td style={{ ...td, textAlign: "right" }}>{formattaNumero(r.uba_giorni, 1)}</td>
                        <td style={td}>{r.categoria_contabile}</td>
                        <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.costo_mantenimento)}</td>
                        <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.costo_nascita_ereditato)}</td>
                        <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.quota_scaricata_su_figli)}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(r.costo_totale_anno)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ background: C.primary + "15", borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, color: C.primary }}>Totale cumulato (tutti gli anni)</span>
                <span style={{ fontWeight: 800, fontSize: 18, color: C.primary }}>{formattaEuro(totaleCumulato)}</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700 };
const td = { padding: "6px 10px", fontSize: 12 };
