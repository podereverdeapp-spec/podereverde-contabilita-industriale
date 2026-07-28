import { useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { fetchAllPages } from "./parsingUtils";
import { esportaExcel } from "./esportaExcel";

const SPECIE_LABEL = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };
const SPECIE_COLORE = { bovino: C.bovini, suino: C.suini, ovino: C.ovini };

export default function ConsultazioneAnimali() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [dati, setDati] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState(null);

  async function calcola() {
    setLoading(true);
    setErrore(null);
    setDati(null);
    try {
      const inizioAnno = `${anno}-01-01`, fineAnno = `${anno}-12-31`;

      const { data: animali, error: eA } = await fetchAllPages((da, a) => supabase
        .from("animali").select("id,bdn,nome,specie,razza,sesso,stato,nascita,data_uscita,motivo_uscita")
        .lte("nascita", fineAnno).range(da, a));
      if (eA) throw new Error(eA.message);

      // Suinetti nei lotti (principio generale: suini = singoli + lotti sempre insieme)
      const { data: lotti, error: eL } = await fetchAllPages((da, a) => supabase
        .from("lotti_suini").select("id,codice_lotto,codice,data_parto").lte("data_parto", fineAnno).range(da, a));
      if (eL) throw new Error(eL.message);
      const idLotti = (lotti || []).map(l => l.id);
      let unitaLotto = [];
      if (idLotti.length > 0) {
        const { data: u, error: eU } = await supabase.from("suini_lotto")
          .select("id,lotto_id,nr,codice_completo,sesso,stato,data_uscita").in("lotto_id", idLotti);
        if (eU) throw new Error(eU.message);
        unitaLotto = u || [];
      }
      const mappaLotti = new Map((lotti || []).map(l => [l.id, l]));

      // Presente nell'anno: nato/costituito prima della fine anno, E (mai uscito, oppure uscito dopo l'inizio anno)
      const presenteNellAnno = (dataUscita) => !dataUscita || dataUscita >= inizioAnno;

      const righePerSpecie = { bovino: [], suino: [], ovino: [] };

      (animali || []).forEach(a => {
        if (!a.specie || !righePerSpecie[a.specie]) return;
        if (!presenteNellAnno(a.data_uscita)) return;
        const uscitoNellAnno = a.data_uscita && a.data_uscita <= fineAnno;
        righePerSpecie[a.specie].push({
          identificativo: a.bdn || a.nome || "—", nome: a.nome, sesso: a.sesso,
          nascita: a.nascita, uscitoNellAnno, dataUscita: a.data_uscita, motivoUscita: a.motivo_uscita,
          presenteAFineAnno: !uscitoNellAnno,
        });
      });

      unitaLotto.forEach(u => {
        if (u.stato === "registrato_individuale") return; // già contato come animale individuale
        const lotto = mappaLotti.get(u.lotto_id);
        if (!lotto) return;
        if (!presenteNellAnno(u.data_uscita)) return;
        const uscitoNellAnno = u.data_uscita && u.data_uscita <= fineAnno;
        righePerSpecie.suino.push({
          identificativo: u.codice_completo || `${lotto.codice_lotto || lotto.codice}${String(u.nr).padStart(2, "0")}`,
          nome: null, sesso: u.sesso, nascita: lotto.data_parto,
          uscitoNellAnno, dataUscita: u.data_uscita, motivoUscita: null, presenteAFineAnno: !uscitoNellAnno,
        });
      });

      Object.values(righePerSpecie).forEach(arr => arr.sort((a, b) => (a.nascita || "").localeCompare(b.nascita || "")));
      setDati(righePerSpecie);
    } catch (err) {
      setErrore(err.message);
    }
    setLoading(false);
  }

  function esporta() {
    if (!dati) return;
    const fogli = ["bovino", "suino", "ovino"].filter(sp => dati[sp].length > 0).map(sp => ({
      nome: SPECIE_LABEL[sp],
      righe: dati[sp].map(r => ({
        "Identificativo": r.identificativo, "Nome": r.nome || "", "Sesso": r.sesso || "",
        "Nascita": r.nascita, "Stato nell'anno": r.presenteAFineAnno ? "Presente a fine anno" : "Uscito nell'anno",
        "Data uscita": r.dataUscita || "", "Motivo uscita": r.motivoUscita || "",
      })),
    }));
    esportaExcel(`AnimaliPresenti_${anno}`, fogli);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Consultazione Animali per Anno</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Tutti gli animali presenti in azienda in un qualunque momento dell'anno scelto (nati/costituiti prima della fine anno, e non usciti prima dell'inizio anno) — raggruppati per specie, con indicazione se sono usciti durante l'anno o ancora presenti alla fine.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <label style={{ fontSize: 13, color: C.muted }}>Anno:</label>
        <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
          style={{ width: 100, padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
        <button onClick={calcola} disabled={loading}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "Calcolo..." : "Calcola"}
        </button>
        {dati && (
          <button onClick={esporta}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            📥 Esporta Excel
          </button>
        )}
      </div>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}

      {dati && ["bovino", "suino", "ovino"].map(sp => {
        const righe = dati[sp];
        if (righe.length === 0) return null;
        const colore = SPECIE_COLORE[sp];
        return (
          <div key={sp} style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 6, height: 24, background: colore, borderRadius: 3 }} />
              <div style={{ fontSize: 17, fontWeight: 800, color: colore }}>{SPECIE_LABEL[sp]}</div>
              <div style={{ fontSize: 12, color: C.muted }}>({righe.length} capi)</div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${colore}`, borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead style={{ background: colore, color: "#fff" }}>
                  <tr>
                    <th style={th}>Identificativo</th><th style={th}>Nome</th><th style={th}>Sesso</th>
                    <th style={th}>Nascita</th><th style={th}>Stato nell'anno</th><th style={th}>Data/Motivo uscita</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={td}>{r.identificativo}</td>
                      <td style={td}>{r.nome || "—"}</td>
                      <td style={td}>{r.sesso || "—"}</td>
                      <td style={td}>{r.nascita}</td>
                      <td style={td}>
                        <span style={{
                          background: r.presenteAFineAnno ? C.green : C.yellow, color: "#fff",
                          borderRadius: 14, padding: "3px 10px", fontSize: 11, fontWeight: 700,
                        }}>
                          {r.presenteAFineAnno ? "Presente a fine anno" : "Uscito nell'anno"}
                        </span>
                      </td>
                      <td style={td}>{r.uscitoNellAnno ? `${r.dataUscita}${r.motivoUscita ? " — " + r.motivoUscita : ""}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const th = { padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 700 };
const td = { padding: "7px 12px" };
