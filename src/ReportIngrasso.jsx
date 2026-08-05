import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro, round2, fetchAllPages } from "./parsingUtils";
import SchedaIngrasso from "./SchedaIngrasso";

const ETICHETTE_SPECIE = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };

export default function ReportIngrasso() {
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);
  const [righe, setRighe] = useState([]);
  const [specieEspanse, setSpecieEspanse] = useState(new Set());
  const [selezionato, setSelezionato] = useState(null); // { animaleId } o { lottoId, unitaNr }

  useEffect(() => { carica(); }, []);

  async function carica() {
    setCaricando(true);
    setErrore(null);
    try {
      const [rAnimali, rLotti, rUnita, rCosti, rVendite] = await Promise.all([
        fetchAllPages((da, a) => supabase.from("animali").select("id,bdn,nome,specie,razza,razza_calcolata,sesso,riproduttore,provenienza,costo_iniziale,prezzo_acquisto,nascita,stato,data_uscita,peso_vivo_uscita,peso_carcassa").range(da, a)),
        supabase.from("lotti_suini").select("id,codice_lotto,codice,tipo_provenienza,prezzo_acquisto,razza_madre,specie"),
        fetchAllPages((da, a) => supabase.from("suini_lotto").select("id,lotto_id,nr,sesso,stato,data_uscita,peso_carcassa,peso_vivo_uscita").range(da, a)),
        fetchAllPages((da, a) => supabase.from("ci_costo_animale_annuale").select("animale_id,lotto_id,unita_nr,anno,costo_mantenimento,costo_nascita_ereditato").range(da, a)),
        supabase.from("ci_dati_vendita_ingrasso").select("*"),
      ]);
      if (rLotti.error) throw new Error(`Errore caricando i lotti suini: ${rLotti.error.message}`);
      if (rVendite.error) throw new Error(`Errore caricando i dati di vendita: ${rVendite.error.message}`);
      if (rAnimali.error) throw new Error(`Errore caricando gli animali: ${rAnimali.error.message}`);
      if (rUnita.error) throw new Error(`Errore caricando le unità dei lotti: ${rUnita.error.message}`);
      if (rCosti.error) throw new Error(`Errore caricando i costi annuali: ${rCosti.error.message}`);
      const animali = rAnimali.data, lotti = rLotti.data, unita = rUnita.data, costiAnnuali = rCosti.data, venditeIngrasso = rVendite.data;

      const mappaLotti = new Map((lotti || []).map(l => [l.id, l]));
      const mappaVenditeAnimale = new Map((venditeIngrasso || []).filter(v => v.animale_id).map(v => [v.animale_id, v]));
      const mappaVenditeUnita = new Map((venditeIngrasso || []).filter(v => v.lotto_id).map(v => [`${v.lotto_id}|${v.unita_nr}`, v]));

      // Numero di unità per lotto — serve per dividere il prezzo di acquisto del LOTTO
      // (unico, registrato una volta su podereverdeapp.it) tra i singoli suinetti, così da
      // ottenere il costo di acquisto UNITARIO — esattamente come il costo di nascita si
      // divide tra i figli, non si duplica per intero su ciascuno.
      const conteggioUnitaPerLotto = new Map();
      for (const u of (unita || [])) {
        conteggioUnitaPerLotto.set(u.lotto_id, (conteggioUnitaPerLotto.get(u.lotto_id) || 0) + 1);
      }

      const risultati = [];

      // Animali individuali NON riproduttori
      for (const a of (animali || [])) {
        if (a.riproduttore) continue;
        const costiSuoi = (costiAnnuali || []).filter(c => c.animale_id === a.id);
        const costoNascita = costiSuoi.reduce((s, c) => s + (parseFloat(c.costo_nascita_ereditato) || 0), 0);
        const costoPartenza = a.provenienza === "Nato in azienda" ? costoNascita : (a.prezzo_acquisto || 0);
        const mantenimentoTotale = round2(costiSuoi.reduce((s, c) => s + (parseFloat(c.costo_mantenimento) || 0), 0));
        const costoTotale = round2(costoPartenza + mantenimentoTotale);
        const vendita = mappaVenditeAnimale.get(a.id);
        const isUscito = a.stato && a.stato !== "attivo";
        const valoreVendita = isUscito && a.peso_carcassa && vendita?.prezzo_vendita_kg_reale
          ? round2(a.peso_carcassa * vendita.prezzo_vendita_kg_reale) : null;
        risultati.push({
          tipo: "animale", animaleId: a.id, bdn: a.bdn, nome: a.nome, specie: a.specie,
          razza: a.razza_calcolata || a.razza, sesso: a.sesso, provenienza: a.provenienza, stato: a.stato,
          costoPartenza, mantenimentoTotale, costoTotale, valoreVendita,
          margine: valoreVendita != null ? round2(valoreVendita - costoTotale) : null,
        });
      }

      // Suinetti nei lotti NON riproduttori (i riproduttori suini nati in lotto hanno comunque
      // un proprio record in animali una volta identificati come tali — qui si escludono i
      // lotti "riproduttore" a livello di singola unità, se il flag esiste sull'unità)
      for (const u of (unita || [])) {
        const lotto = mappaLotti.get(u.lotto_id);
        if (!lotto) continue;
        const costiSuoi = (costiAnnuali || []).filter(c => c.lotto_id === u.lotto_id && c.unita_nr === u.nr);
        const costoNascita = costiSuoi.reduce((s, c) => s + (parseFloat(c.costo_nascita_ereditato) || 0), 0);
        const numeroUnitaLotto = conteggioUnitaPerLotto.get(u.lotto_id) || 1;
        const costoPartenza = lotto.tipo_provenienza === "acquistato" ? round2((lotto.prezzo_acquisto || 0) / numeroUnitaLotto) : costoNascita;
        const mantenimentoTotale = round2(costiSuoi.reduce((s, c) => s + (parseFloat(c.costo_mantenimento) || 0), 0));
        const costoTotale = round2(costoPartenza + mantenimentoTotale);
        const vendita = mappaVenditeUnita.get(`${u.lotto_id}|${u.nr}`);
        const isUscito = u.stato && u.stato !== "attivo" && u.stato !== "vivo";
        const valoreVendita = isUscito && u.peso_carcassa && vendita?.prezzo_vendita_kg_reale
          ? round2(u.peso_carcassa * vendita.prezzo_vendita_kg_reale) : null;
        risultati.push({
          tipo: "unita", lottoId: u.lotto_id, unitaNr: u.nr, bdn: u.bdn || `${lotto.codice_lotto || lotto.codice}#${u.nr}`,
          nome: null, specie: lotto.specie || "suino", razza: lotto.razza_madre, sesso: u.sesso,
          provenienza: lotto.tipo_provenienza === "acquistato" ? "Acquistato" : "Nato in azienda", stato: u.stato,
          costoPartenza, mantenimentoTotale, costoTotale, valoreVendita,
          margine: valoreVendita != null ? round2(valoreVendita - costoTotale) : null,
        });
      }

      setRighe(risultati);
    } catch (err) {
      setErrore(err.message || String(err));
    }
    setCaricando(false);
  }

  function toggleSpecie(s) {
    setSpecieEspanse(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  }

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Report Accrescimento / Ingrasso</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Tutti gli animali (e i suinetti nei lotti) non destinati alla riproduzione — costo di partenza (acquisto o nascita) + mantenimento accumulato, e per chi è già uscito il margine sulla vendita. Clicca un animale per la scheda di dettaglio.
        {!caricando && <> — {righe.filter(r => r.tipo === "animale").length} animali individuali, {righe.filter(r => r.tipo === "unita").length} suinetti nei lotti.</>}
      </p>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}
      {caricando ? <p style={{ color: C.muted }}>Caricamento...</p> : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          {["bovino", "suino", "ovino"].map(specie => {
            const righeSpecie = righe.filter(r => r.specie === specie);
            if (righeSpecie.length === 0) return null;
            const isAttivo = r => !(r.stato && r.stato !== "attivo" && r.stato !== "vivo");
            const attivi = righeSpecie.filter(isAttivo).sort((a, b) => b.costoTotale - a.costoTotale);
            const usciti = righeSpecie.filter(r => !isAttivo(r)).sort((a, b) => (b.valoreVendita ?? -Infinity) - (a.valoreVendita ?? -Infinity));
            const aperta = specieEspanse.has(specie);
            return (
              <div key={specie}>
                <div onClick={() => toggleSpecie(specie)}
                  style={{ padding: "12px 16px", background: C.primary, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
                  <span>{aperta ? "▼" : "▶"} {ETICHETTE_SPECIE[specie]}</span>
                  <span style={{ fontWeight: 400, fontSize: 12 }}>{righeSpecie.length} animali</span>
                </div>
                {aperta && (
                  <table style={{ width: "100%", fontSize: 13 }}>
                    <thead style={{ background: C.primaryLight, color: "#fff" }}>
                      <tr>
                        <th style={th}>Animale</th><th style={th}>Razza</th><th style={th}>Provenienza</th>
                        <th style={th}>Costo totale</th><th style={th}>Valore vendita</th><th style={th}>Margine</th><th style={th}>Stato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attivi.length > 0 && (
                        <tr><td colSpan={7} style={{ padding: "6px 10px", background: C.bg, fontWeight: 700, fontSize: 11, color: C.muted }}>ATTIVI ({attivi.length}) — ordinati per costo totale</td></tr>
                      )}
                      {attivi.map(r => (
                        <RigaIngrasso key={r.tipo === "animale" ? `a${r.animaleId}` : `u${r.lottoId}_${r.unitaNr}`} r={r} onClick={() => setSelezionato(r.tipo === "animale" ? { animaleId: r.animaleId } : { lottoId: r.lottoId, unitaNr: r.unitaNr })} />
                      ))}
                      {usciti.length > 0 && (
                        <tr><td colSpan={7} style={{ padding: "6px 10px", background: C.bg, fontWeight: 700, fontSize: 11, color: C.muted }}>USCITI ({usciti.length}) — ordinati per valore di vendita</td></tr>
                      )}
                      {usciti.map(r => (
                        <RigaIngrasso key={r.tipo === "animale" ? `a${r.animaleId}` : `u${r.lottoId}_${r.unitaNr}`} r={r} onClick={() => setSelezionato(r.tipo === "animale" ? { animaleId: r.animaleId } : { lottoId: r.lottoId, unitaNr: r.unitaNr })} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selezionato && (
        <SchedaIngrasso {...selezionato} onClose={() => setSelezionato(null)} onSalvato={carica} />
      )}
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11 };
const td = { padding: "8px 10px" };

function RigaIngrasso({ r, onClick }) {
  return (
    <tr onClick={onClick} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}>
      <td style={td}>{r.bdn || r.nome || "—"}</td>
      <td style={td}>{r.razza || "—"}</td>
      <td style={td}>{r.provenienza}</td>
      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.costoTotale)}</td>
      <td style={{ ...td, textAlign: "right" }}>{r.valoreVendita != null ? formattaEuro(r.valoreVendita) : "—"}</td>
      <td style={{ ...td, textAlign: "right", fontWeight: 700, color: r.margine == null ? C.muted : r.margine >= 0 ? C.green : C.red }}>
        {r.margine != null ? formattaEuro(r.margine) : "—"}
      </td>
      <td style={td}>
        {r.stato && r.stato !== "attivo" && r.stato !== "vivo"
          ? <span style={{ color: r.valoreVendita != null ? C.green : C.accent, fontWeight: 700 }}>{r.valoreVendita != null ? "✓ Venduto" : "Uscito — da valorizzare"}</span>
          : <span style={{ color: C.muted }}>Attivo</span>}
      </td>
    </tr>
  );
}
