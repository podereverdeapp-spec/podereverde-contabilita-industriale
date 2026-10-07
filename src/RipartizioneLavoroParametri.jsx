import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { fetchAllPages, round2 } from "./parsingUtils";
import { ATTIVITA_LAVORO } from "./ripartizioneLavoro";

// Parametri → Ripartizione del costo del lavoro tra le attività, anno per anno.
// Anno senza riga = 100% allevamento (il calcolo di prima). Il totale deve fare 100.
export default function RipartizioneLavoroParametri() {
  const annoCorrente = new Date().getFullYear();
  const anni = Array.from({ length: annoCorrente - 2019 + 1 }, (_, i) => 2019 + i);
  const [righe, setRighe] = useState({});
  const [modificati, setModificati] = useState(new Set());
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState(null);
  const [giornateColtivazione, setGiornateColtivazione] = useState({});

  useEffect(() => { carica(); }, []);

  async function carica() {
    const { data, error } = await supabase.from("ci_ripartizione_lavoro").select("*");
    if (error) { setErrore(`Tabella non ancora creata: eseguire il file SQL della versione 225. (${error.message})`); return; }
    const m = {};
    anni.forEach(a => { m[a] = { allevamento: "100", coltivazione: "0", lavorazione_carni: "0", orto_altro: "0", giornate_totali: "", salvato: false }; });
    (data || []).forEach(r => { m[r.anno] = { allevamento: String(r.allevamento), coltivazione: String(r.coltivazione), lavorazione_carni: String(r.lavorazione_carni), orto_altro: String(r.orto_altro), giornate_totali: r.giornate_lavorative_totali != null ? String(r.giornate_lavorative_totali) : "", salvato: true }; });
    // Giornate di lavoro registrate nell'app nelle lavorazioni dei campi (escluse quelle in conto terzi)
    const { data: lav } = await fetchAllPages((da, a) => supabase.from("lavorazioni_campo").select("data_esecuzione,giornate_lavoro,conto_terzi").range(da, a));
    const g = {};
    (lav || []).forEach(l => {
      if (!l.data_esecuzione || l.conto_terzi || !l.giornate_lavoro) return;
      const y = Number(String(l.data_esecuzione).slice(0, 4));
      g[y] = round2((g[y] || 0) + (parseFloat(l.giornate_lavoro) || 0));
    });
    setGiornateColtivazione(g);
    setRighe(m);
    setModificati(new Set());
  }

  const totale = r => ATTIVITA_LAVORO.reduce((s, a) => s + (parseFloat(String(r[a.campo]).replace(",", ".")) || 0), 0);

  function cambia(anno, campo, valore) {
    setRighe(prev => ({ ...prev, [anno]: { ...prev[anno], [campo]: valore } }));
    setModificati(prev => new Set(prev).add(anno));
  }

  const numero = v => parseFloat(String(v ?? "").replace(",", ".")) || 0;
  // Percentuale delle coltivazioni calcolata dalle giornate registrate nell'app
  const percentualeDaGiornate = anno => {
    const tot = numero(righe[anno]?.giornate_totali);
    return tot > 0 && giornateColtivazione[anno] ? round2(Math.min(100, giornateColtivazione[anno] / tot * 100)) : null;
  };
  function usaGiornate(anno) {
    const p = percentualeDaGiornate(anno);
    if (p == null) return;
    const r = righe[anno];
    const allevamento = round2(Math.max(0, 100 - p - numero(r.lavorazione_carni) - numero(r.orto_altro)));
    setRighe(prev => ({ ...prev, [anno]: { ...prev[anno], coltivazione: String(p), allevamento: String(allevamento) } }));
    setModificati(prev => new Set(prev).add(anno));
  }

  async function salva() {
    const sbagliati = [...modificati].filter(a => Math.abs(totale(righe[a]) - 100) > 0.01);
    if (sbagliati.length) { alert(`Il totale deve fare 100 per ogni anno. Da correggere: ${sbagliati.join(", ")}.`); return; }
    setSalvando(true);
    try {
      const daSalvare = [...modificati].map(a => ({
        anno: a, ...Object.fromEntries(ATTIVITA_LAVORO.map(x => [x.campo, parseFloat(String(righe[a][x.campo]).replace(",", ".")) || 0])),
        giornate_lavorative_totali: righe[a].giornate_totali !== "" ? numero(righe[a].giornate_totali) : null,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("ci_ripartizione_lavoro").upsert(daSalvare, { onConflict: "anno" });
      if (error) throw new Error(error.message);
      alert("✓ Ripartizione del lavoro salvata. Per applicarla: Report Costi «Calcola» e «Salva» degli anni cambiati, poi Report Riproduttori «Calcola e scarica sui figli».");
      carica();
    } catch (err) {
      alert(`⚠️ ${err.message}`);
    }
    setSalvando(false);
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 6 }}>RIPARTIZIONE DEL COSTO DEL LAVORO TRA LE ATTIVITÀ (PERCENTUALI PER ANNO)</div>
      <p style={{ fontSize: 12, color: C.muted, marginTop: 0 }}>
        Il lavoro finisce sugli animali seguendo l'attività per cui è svolto: «Allevamento» su tutte le specie in base agli UBA-giorni; «Coltivazioni» come i costi delle coltivazioni dell'anno (il foraggio va a bovini e ovini); «Lavorazione delle carni» non va sugli animali, come le spese di macello e lavorazione (decisione del 07/10/2026); «Orto e altre attività non zootecniche» non va sugli animali. Il totale di ogni anno deve fare 100. Scrivendo le giornate lavorative totali dei dipendenti, il programma calcola la percentuale delle coltivazioni dalle giornate registrate nell'app (Coltivazioni → lavorazioni dei campi, escluse quelle in conto terzi): con «Usa» la mette nella riga, e la differenza va all'allevamento.
      </p>
      {errore ? <p style={{ color: C.red, fontSize: 13 }}>⚠️ {errore}</p> : (
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.bg }}>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Anno</th>
              {ATTIVITA_LAVORO.map(a => <th key={a.campo} style={{ padding: "6px 8px", textAlign: "center", fontSize: 11 }}>{a.etichetta} (%)</th>)}
              <th style={{ padding: "6px 8px", textAlign: "center" }}>Totale</th>
              <th style={{ padding: "6px 8px", textAlign: "center", fontSize: 11 }}>Giornate in coltivazione registrate nell'app</th>
              <th style={{ padding: "6px 8px", textAlign: "center", fontSize: 11 }}>Giornate lavorative totali dei dipendenti nell'anno</th>
              <th style={{ padding: "6px 8px", textAlign: "center", fontSize: 11 }}>Coltivazioni calcolate dalle giornate</th>
            </tr>
          </thead>
          <tbody>
            {anni.map(anno => righe[anno] && (
              <tr key={anno} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: "6px 8px", fontWeight: 700 }}>{anno}{!righe[anno].salvato && <span style={{ fontSize: 10, color: C.muted, fontWeight: 400 }}> (non impostato)</span>}</td>
                {ATTIVITA_LAVORO.map(a => (
                  <td key={a.campo} style={{ padding: "4px 8px", textAlign: "center" }}>
                    <input type="number" value={righe[anno][a.campo]} onChange={e => cambia(anno, a.campo, e.target.value)}
                      style={{ width: 70, padding: "5px 6px", borderRadius: 6, border: `1.5px solid ${modificati.has(anno) ? C.primary : C.border}`, textAlign: "center", fontSize: 13 }} />
                  </td>
                ))}
                <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: Math.abs(totale(righe[anno]) - 100) > 0.01 ? C.red : C.green }}>{totale(righe[anno])}</td>
                <td style={{ padding: "6px 8px", textAlign: "center" }}>{giornateColtivazione[anno] ? giornateColtivazione[anno].toLocaleString("it-IT") : "—"}</td>
                <td style={{ padding: "4px 8px", textAlign: "center" }}>
                  <input type="number" value={righe[anno].giornate_totali} onChange={e => cambia(anno, "giornate_totali", e.target.value)} placeholder="es. 560"
                    style={{ width: 80, padding: "5px 6px", borderRadius: 6, border: `1.5px solid ${C.border}`, textAlign: "center", fontSize: 13 }} />
                </td>
                <td style={{ padding: "4px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                  {percentualeDaGiornate(anno) != null ? (
                    <>{percentualeDaGiornate(anno).toLocaleString("it-IT")}% <button onClick={() => usaGiornate(anno)} style={{ marginLeft: 4, fontSize: 11, padding: "3px 8px", borderRadius: 6, border: `1.5px solid ${C.primary}`, background: "#fff", color: C.primary, cursor: "pointer", fontWeight: 700 }}>Usa</button></>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {modificati.size > 0 && (
        <button onClick={salva} disabled={salvando}
          style={{ marginTop: 12, background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {salvando ? "Salvataggio..." : `Salva ripartizione (${modificati.size} ${modificati.size === 1 ? "anno" : "anni"})`}
        </button>
      )}
    </div>
  );
}
