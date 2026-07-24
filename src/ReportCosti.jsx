import { useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { calcolaReportUba } from "./motoreUba";
import { numerizzaCampi, round2 } from "./parsingUtils";

// Mappa tra il nome specie usato nel motore UBA (minuscolo) e quello usato come
// Destinazione sulle fatture / Imputazione sui cespiti (maiuscolo, italiano)
const MAPPA_SPECIE = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };

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

      // Costi ordinari dell'anno (Fisso + Variabile), CON la destinazione (per separare diretti/generali)
      const { data: fattureAnno, error: eF } = await supabase
        .from("ci_fatture").select("id, data").eq("tipo", "PASSIVA")
        .gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`);
      if (eF) throw new Error(eF.message);
      const idFattureAnno = (fattureAnno || []).map(f => f.id);

      let articoliAnno = [];
      if (idFattureAnno.length > 0) {
        const { data: articoli, error: eArt } = await supabase
          .from("ci_articoli_fattura").select("totale_riga, tipo_costo, destinazione")
          .in("fattura_id", idFattureAnno).in("tipo_costo", ["Fisso", "Variabile"]);
        if (eArt) throw new Error(eArt.message);
        articoliAnno = numerizzaCampi(articoli || [], ["totale_riga"]);
      }
      const costiOrdinari = articoliAnno.reduce((s, r) => s + (r.totale_riga || 0), 0);

      // Quote di ammortamento dell'anno, CON la specie di imputazione del cespite
      const { data: cespiti, error: eC } = await supabase.from("ci_cespiti").select("id, specie");
      if (eC) throw new Error(eC.message);
      const mappaCespiteSpecie = new Map((cespiti || []).map(c => [c.id, c.specie || []]));
      const idCespitiValidi = (cespiti || []).filter(c => c.specie && c.specie.length > 0).map(c => c.id);

      let quoteAnno = [];
      if (idCespitiValidi.length > 0) {
        const { data: quote, error: eQ } = await supabase
          .from("ci_cespiti_ammortamento").select("quota, cespite_id").eq("anno", anno).in("cespite_id", idCespitiValidi);
        if (eQ) throw new Error(eQ.message);
        quoteAnno = numerizzaCampi(quote || [], ["quota"]);
      }
      const costoAmmortamenti = quoteAnno.reduce((s, r) => s + (r.quota || 0), 0);

      const costiTotali = round2(costiOrdinari + costoAmmortamenti);
      // NOTA: valore di riforma reale non ancora tracciato per gli animali ordinari (solo per
      // i riproduttori, in Report Riproduttori). Per ora V(t)=0 qui — semplificazione dichiarata.
      const valoreRiformaTotale = 0;

      // --- Separazione costi DIRETTI per specie vs GENERALI ---
      const ubaGiorniTotaliAzienda = righeUba.reduce((s, r) => s + r.uba_giorni, 0);
      const ubaGiorniProduttiviAzienda = righeUba.filter(r => r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);

      let costiGenerali = 0;
      const costiDirettiPerSpecie = { bovino: 0, suino: 0, ovino: 0 };

      articoliAnno.forEach(r => {
        const dest = (r.destinazione || "").trim();
        const specieMatch = Object.entries(MAPPA_SPECIE).find(([, v]) => v === dest);
        if (specieMatch) costiDirettiPerSpecie[specieMatch[0]] += (r.totale_riga || 0);
        else costiGenerali += (r.totale_riga || 0); // Generali, vuoto, o non riconosciuto -> generale
      });
      quoteAnno.forEach(r => {
        const specieCespite = mappaCespiteSpecie.get(r.cespite_id) || [];
        const specieMatch = Object.entries(MAPPA_SPECIE).find(([, v]) => specieCespite.includes(v));
        if (specieMatch) costiDirettiPerSpecie[specieMatch[0]] += (r.quota || 0);
        else costiGenerali += (r.quota || 0); // "Generale" o non riconosciuto -> generale
      });

      // Tasso dei costi Generali: formula aggressiva a livello aziendale (esclude tutti gli
      // improduttivi dal divisore), poi ripartito a ogni specie in proporzione ai suoi UBA-giorni
      const ubaGiorniImproduttiviAzienda = righeUba.filter(r => r.categoria_contabile === "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);
      const tassoGenerali = ubaGiorniProduttiviAzienda > 0 ? (costiGenerali - valoreRiformaTotale) / ubaGiorniProduttiviAzienda : 0;

      const perSpecie = ["bovino", "suino", "ovino"].map(sp => {
        const righeSp = righeUba.filter(r => r.specie === sp);
        if (righeSp.length === 0) return null;
        const ubaGiorniSp = righeSp.reduce((s, r) => s + r.uba_giorni, 0);
        const ubaGiorniSpProduttivi = righeSp.filter(r => r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);

        // Costi diretti di questa specie: formula aggressiva DENTRO la specie stessa
        // (i suoi improduttivi si spalmano sui suoi produttivi, non su altre specie)
        const costoDirettoSpecie = costiDirettiPerSpecie[sp] || 0;
        const tassoDirettoSpecie = ubaGiorniSpProduttivi > 0 ? costoDirettoSpecie / ubaGiorniSpProduttivi : 0;

        const quotaGeneraliSpecie = round2(tassoGenerali * ubaGiorniSpProduttivi);
        const costoAllocatoTotale = round2(costoDirettoSpecie + quotaGeneraliSpecie);
        const incidenzaUbaGiorno = ubaGiorniSpProduttivi > 0 ? costoAllocatoTotale / ubaGiorniSpProduttivi : 0;

        return {
          specie: sp,
          percentualeSulTotale: ubaGiorniTotaliAzienda > 0 ? (ubaGiorniSp / ubaGiorniTotaliAzienda * 100) : 0,
          costoDirettoSpecie: round2(costoDirettoSpecie),
          quotaGeneraliSpecie,
          costoAllocatoTotale,
          ubaGiorniSpProduttivi: round2(ubaGiorniSpProduttivi),
          incidenzaUbaGiorno: Math.round(incidenzaUbaGiorno * 1000000) / 1000000,
        };
      }).filter(Boolean);

      // Tasso aziendale complessivo (per il riepilogo in alto — resta utile come vista d'insieme)
      const tassoSemplice = ubaGiorniTotaliAzienda > 0 ? (costiTotali - valoreRiformaTotale) / ubaGiorniTotaliAzienda : 0;
      const tassoRettificatoAziendale = ubaGiorniProduttiviAzienda > 0 ? (costiTotali - valoreRiformaTotale) / ubaGiorniProduttiviAzienda : 0;
      const perditaSpalmata = round2((tassoRettificatoAziendale - tassoSemplice) * ubaGiorniProduttiviAzienda);
      const tasso = {
        tassoSemplice: Math.round(tassoSemplice * 1000000) / 1000000,
        tassoRettificato: Math.round(tassoRettificatoAziendale * 1000000) / 1000000,
        perditaSpalmata,
        ubaGiorniProduttivi: round2(ubaGiorniProduttiviAzienda),
        ubaGiorniImproduttivi: round2(ubaGiorniImproduttiviAzienda),
      };

      // Costo per ogni animale/unità: usa il tasso SPECIFICO della sua specie (incidenzaUbaGiorno),
      // coerente con l'allocazione per specie qui sopra — non più il tasso aziendale unico.
      const mappaIncidenzaPerSpecie = new Map(perSpecie.map(p => [p.specie, p.incidenzaUbaGiorno]));
      const costoPerAnimale = righeUba.map(r => {
        const tassoSpecie = mappaIncidenzaPerSpecie.get(r.specie) ?? tasso.tassoRettificato;
        return { ...r, costo_mantenimento: round2(r.uba_giorni * tassoSpecie) };
      });

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
            <Riga label="UBA-giorni improduttivi (esclusi dal divisore)" valore={risultato.tasso.ubaGiorniImproduttivi.toFixed(1)} color={C.red} />
            <Riga label="Tasso semplice (se si dividesse su tutti)" valore={`${risultato.tasso.tassoSemplice.toFixed(4)}€/UBA-gg`} color={C.muted} />
            <Riga label="Perdita spalmata sui produttivi" valore={`${risultato.tasso.perditaSpalmata.toFixed(2)}€`} color={C.red} />
            <Riga label="Tasso RETTIFICATO (quello usato)" valore={`${risultato.tasso.tassoRettificato.toFixed(4)}€/UBA-gg`} bold color={C.primary} />
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 10 }}>ALLOCAZIONE PER SPECIE</div>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 0, marginBottom: 10 }}>
              I costi diretti (Destinazione/Imputazione = quella specie) restano dentro la specie; i costi Generali si ripartiscono in proporzione agli UBA-giorni produttivi.
            </p>
            <table style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left" }}>
                  <th style={{ padding: "4px 8px" }}>Specie</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>% sul totale UBA-giorni</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>Costi diretti</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>Quota Generali</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>Totale allocato</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>Incidenza €/UBA-gg</th>
                </tr>
              </thead>
              <tbody>
                {risultato.perSpecie.map(r => (
                  <tr key={r.specie} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "6px 8px", textTransform: "capitalize" }}>{r.specie}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.percentualeSulTotale.toFixed(1)}%</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.costoDirettoSpecie.toFixed(2)}€</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.quotaGeneraliSpecie.toFixed(2)}€</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{r.costoAllocatoTotale.toFixed(2)}€</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: C.primary }}>{r.incidenzaUbaGiorno.toFixed(4)}€</td>
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
