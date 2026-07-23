import { useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { calcolaReportUba, calcolaTassoAggressivo } from "./motoreUba";
import { numerizzaCampi, round2 } from "./parsingUtils";

export default function ReportCosti() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [calcolando, setCalcolando] = useState(false);
  const [risultato, setRisultato] = useState(null);
  const [salvando, setSalvando] = useState(false);

  async function calcola() {
    setCalcolando(true);
    setRisultato(null);
    try {
      const [{ data: animali, error: eA }, { data: lotti, error: eL }, { data: suiniLotto, error: eS }] = await Promise.all([
        supabase.from("animali").select("id,bdn,nome,specie,sesso,nascita,stato,data_uscita,motivo_uscita,data_ingresso,razza,riproduttore"),
        supabase.from("lotti_suini").select("*"),
        supabase.from("suini_lotto").select("*"),
      ]);
      if (eA || eL || eS) throw new Error((eA || eL || eS).message);

      const righeUba = calcolaReportUba(animali || [], lotti || [], suiniLotto || [], anno);
      if (righeUba.length === 0) {
        alert(`Nessun animale presente nell'anno ${anno}. Verifica prima con "Report UBA".`);
        setCalcolando(false);
        return;
      }

      // Costi ordinari dell'anno (Fisso + Variabile) dalle fatture classificate
      const { data: fattureAnno, error: eF } = await supabase
        .from("ci_fatture").select("id, data").eq("tipo", "PASSIVA")
        .gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`);
      if (eF) throw new Error(eF.message);
      const idFattureAnno = (fattureAnno || []).map(f => f.id);

      let costiOrdinari = 0;
      if (idFattureAnno.length > 0) {
        const { data: articoli, error: eArt } = await supabase
          .from("ci_articoli_fattura").select("totale_riga, tipo_costo")
          .in("fattura_id", idFattureAnno).in("tipo_costo", ["Fisso", "Variabile"]);
        if (eArt) throw new Error(eArt.message);
        costiOrdinari = (numerizzaCampi(articoli || [], ["totale_riga"])).reduce((s, r) => s + (r.totale_riga || 0), 0);
      }

      // Quote di ammortamento dell'anno (esclusi i cespiti con Imputazione=Nessuno, cioè specie=[])
      const { data: cespiti, error: eC } = await supabase.from("ci_cespiti").select("id, specie");
      if (eC) throw new Error(eC.message);
      const idCespitiValidi = (cespiti || []).filter(c => c.specie && c.specie.length > 0).map(c => c.id);
      let costoAmmortamenti = 0;
      if (idCespitiValidi.length > 0) {
        const { data: quote, error: eQ } = await supabase
          .from("ci_cespiti_ammortamento").select("quota, cespite_id").eq("anno", anno).in("cespite_id", idCespitiValidi);
        if (eQ) throw new Error(eQ.message);
        costoAmmortamenti = (numerizzaCampi(quote || [], ["quota"])).reduce((s, r) => s + (r.quota || 0), 0);
      }

      const costiTotali = round2(costiOrdinari + costoAmmortamenti);
      // NOTA: valore di riforma reale non ancora tracciato in Contabilità Industriale
      // (serve il meccanismo "valore di realizzo" per i riproduttori, sezione 15 del documento).
      // Per ora V(t)=0 — semplificazione esplicita, da raffinare quando costruiamo quel pezzo.
      const valoreRiformaTotale = 0;

      const tasso = calcolaTassoAggressivo(righeUba, costiTotali, valoreRiformaTotale);

      // Allocazione per specie: quota UBA-giorni della specie sul totale, come dato leggibile
      const ubaGiorniTotali = righeUba.reduce((s, r) => s + r.uba_giorni, 0);
      const perSpecie = ["bovino", "suino", "ovino"].map(sp => {
        const righeSp = righeUba.filter(r => r.specie === sp);
        if (righeSp.length === 0) return null;
        const ubaGiorniSp = righeSp.reduce((s, r) => s + r.uba_giorni, 0);
        const ubaGiorniSpProduttivi = righeSp.filter(r => r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);
        return {
          specie: sp,
          percentualeSulTotale: ubaGiorniTotali > 0 ? (ubaGiorniSp / ubaGiorniTotali * 100) : 0,
          costoAllocato: round2(ubaGiorniSpProduttivi * tasso.tassoRettificato),
        };
      }).filter(Boolean);

      // Costo per ogni animale/unità (per trasparenza e per il salvataggio)
      const costoPerAnimale = righeUba.map(r => ({
        ...r,
        costo_mantenimento: round2(r.uba_giorni * tasso.tassoRettificato),
      }));

      setRisultato({ costiOrdinari, costoAmmortamenti, costiTotali, valoreRiformaTotale, tasso, perSpecie, costoPerAnimale, righeUba });
    } catch (err) {
      alert(`⚠️ Errore nel calcolo:\n\n${err.message}`);
    }
    setCalcolando(false);
  }

  async function salvaRisultato() {
    if (!risultato) return;
    if (!window.confirm(`Salvare il costo calcolato per ${risultato.costoPerAnimale.length} animali/unità per l'anno ${anno}? Sostituirà eventuali dati già salvati per questo anno.`)) return;
    setSalvando(true);
    try {
      await supabase.from("ci_tasso_uba_annuale").delete().eq("anno", anno);
      const { error: eT } = await supabase.from("ci_tasso_uba_annuale").insert([{
        anno, costi_totali: risultato.costiTotali, valore_riforma_totale: risultato.valoreRiformaTotale,
        uba_giorni_produttivi: risultato.tasso.ubaGiorniProduttivi, uba_giorni_improduttivi: risultato.tasso.ubaGiorniImproduttivi,
        tasso_base: risultato.tasso.tassoSemplice, perdita: risultato.tasso.perditaSpalmata, tasso_rettificato: risultato.tasso.tassoRettificato,
      }]);
      if (eT) throw new Error(eT.message);

      await supabase.from("ci_costo_animale_annuale").delete().eq("anno", anno);
      const daInserire = risultato.costoPerAnimale.map(r => ({
        anno, animale_id: r.animale_id || null, lotto_id: r.lotto_id || null, unita_nr: r.unita_nr || null,
        specie: r.specie, categoria_contabile: r.categoria_contabile, uba_giorni: r.uba_giorni,
        costo_mantenimento: r.costo_mantenimento, costo_totale_anno: r.costo_mantenimento,
      }));
      for (let i = 0; i < daInserire.length; i += 200) {
        const { error } = await supabase.from("ci_costo_animale_annuale").insert(daInserire.slice(i, i + 200));
        if (error) throw new Error(error.message);
      }
      alert(`✓ Costo salvato per l'anno ${anno}.`);
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio:\n\n${err.message}`);
    }
    setSalvando(false);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Report Costi</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Tasso €/UBA-giorno (formula aggressiva: i costi degli animali improduttivi si ridistribuiscono sui produttivi/riproduttori) e allocazione per specie/animale.
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Anno</label>
            <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
              style={{ padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, width: 100 }} />
          </div>
          <button onClick={calcola} disabled={calcolando}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {calcolando ? "Calcolo..." : "📊 Calcola"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
          ⚠️ Semplificazione attuale: il valore di riforma (V(t)) è impostato a 0 — il meccanismo di stima del valore di realizzo dei riproduttori non è ancora costruito (sezione 15 del documento di riferimento).
        </div>
      </div>

      {risultato && (
        <>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 10 }}>RIEPILOGO AZIENDALE — ANNO {anno}</div>
            <Riga label="Costi ordinari (Fisso + Variabile)" valore={`${risultato.costiOrdinari.toFixed(2)}€`} />
            <Riga label="Quote di ammortamento" valore={`${risultato.costoAmmortamenti.toFixed(2)}€`} />
            <Riga label="Costi totali (C(t))" valore={`${risultato.costiTotali.toFixed(2)}€`} bold />
            <Riga label="UBA-giorni produttivi/riproduttori" valore={risultato.tasso.ubaGiorniProduttivi.toFixed(1)} />
            <Riga label="UBA-giorni improduttivi (esclusi dal divisore)" valore={risultato.tasso.ubaGiorniImproduttivo.toFixed(1)} color={C.red} />
            <Riga label="Tasso semplice (se si dividesse su tutti)" valore={`${risultato.tasso.tassoSemplice.toFixed(4)}€/UBA-gg`} color={C.muted} />
            <Riga label="Perdita spalmata sui produttivi" valore={`${risultato.tasso.perditaSpalmata.toFixed(2)}€`} color={C.red} />
            <Riga label="Tasso RETTIFICATO (quello usato)" valore={`${risultato.tasso.tassoRettificato.toFixed(4)}€/UBA-gg`} bold color={C.primary} />
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 10 }}>ALLOCAZIONE PER SPECIE</div>
            <table style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left" }}>
                  <th style={{ padding: "4px 8px" }}>Specie</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>% sul totale UBA-giorni</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>Costo allocato</th>
                </tr>
              </thead>
              <tbody>
                {risultato.perSpecie.map(r => (
                  <tr key={r.specie} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "6px 8px", textTransform: "capitalize" }}>{r.specie}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.percentualeSulTotale.toFixed(1)}%</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{r.costoAllocato.toFixed(2)}€</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={salvaRisultato} disabled={salvando}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            {salvando ? "Salvataggio..." : `💾 Salva questo calcolo per l'anno ${anno}`}
          </button>
        </>
      )}
    </div>
  );
}

function Riga({ label, valore, bold, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 13, color: color || C.text }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: color || C.text }}>{valore}</span>
    </div>
  );
}
