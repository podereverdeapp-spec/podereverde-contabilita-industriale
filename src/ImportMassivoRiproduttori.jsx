import { useState } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro, round2, fetchAllPages } from "./parsingUtils";
import { esportaExcel } from "./esportaExcel";
import { stimaPesoCarcassaPerEta } from "./motoreRiproduttori";

export default function ImportMassivoRiproduttori() {
  const [generando, setGenerando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [risultatoImport, setRisultatoImport] = useState(null);
  const [errore, setErrore] = useState(null);

  async function generaTemplate() {
    setGenerando(true);
    setErrore(null);
    try {
      const { data: tuttiAnimali } = await fetchAllPages((da, a) => supabase
        .from("animali").select("id,bdn,nome,specie,razza,razza_calcolata,riproduttore,costo_iniziale,prezzo_acquisto,padre_id,madre_id,nascita,stato,data_uscita,peso_vivo_uscita,peso_carcassa,provenienza,sesso")
        .range(da, a));

      const riproduttori = (tuttiAnimali || []).filter(a => a.riproduttore);
      if (riproduttori.length === 0) { alert("Nessun animale marcato come riproduttore in anagrafica."); setGenerando(false); return; }

      const idRiproduttori = riproduttori.map(r => r.id);
      const bdnRiproduttori = riproduttori.map(r => r.bdn).filter(Boolean);

      const [{ data: residui }, { data: fattureTrasporto }] = await Promise.all([
        supabase.from("ci_residuo_riproduttore").select("*").in("animale_id", idRiproduttori),
        bdnRiproduttori.length > 0
          ? supabase.from("ci_report_acquisto_animali").select("*, ci_fornitori(nome)").in("bdn", bdnRiproduttori).eq("fonte", "TRASPORTO_INGRESSO")
          : Promise.resolve({ data: [] }),
      ]);
      const mappaResidui = new Map((residui || []).map(r => [r.animale_id, r]));
      const mappaTrasporto = new Map((fattureTrasporto || []).map(f => [f.bdn, f]));

      const oggi = new Date();
      const righe = riproduttori.map(r => {
        const residuo = mappaResidui.get(r.id);
        const trasporto = mappaTrasporto.get(r.bdn);
        const costoNoto = r.provenienza === "Nato in azienda" ? (r.costo_iniziale || 0) : (r.prezzo_acquisto || 0);
        const isUscito = r.stato && r.stato !== "attivo";

        let pesoCarcassaStimato = "";
        if (!isUscito && r.nascita) {
          const etaAnni = (oggi - new Date(r.nascita)) / (365.25 * 86400000);
          const stima = stimaPesoCarcassaPerEta({ specie: r.specie, razza: r.razza_calcolata || r.razza, sesso: r.sesso, etaAnniAnimale: etaAnni, animaliUsciti: tuttiAnimali || [] });
          pesoCarcassaStimato = stima.pesoStimato != null ? `${stima.pesoStimato} (${stima.fonteStima}, n=${stima.campioneUsato})` : "";
        }

        return {
          "BDN": r.bdn || "", "Nome": r.nome || "", "Specie": r.specie || "", "Razza": r.razza_calcolata || r.razza || "",
          "Provenienza": r.provenienza || "", "Stato": r.stato || "",
          "Nascita": r.nascita || "", "Data Ingresso": r.data_ingresso || "",
          "Costo (acquisto o nascita)": costoNoto,
          "Vita Attesa (anni) — MODIFICABILE": residuo?.vita_produttiva_attesa_anni ?? "",
          "Peso Carcassa REALE (kg) — solo se uscito, MODIFICABILE": isUscito ? (r.peso_carcassa ?? "") : "",
          "Peso Carcassa Stimato (kg) — solo informativo, se ancora attivo": pesoCarcassaStimato,
          "Prezzo Vendita €/kg Carcassa — MODIFICABILE": residuo?.prezzo_vendita_kg_carcassa_reale ?? "",
          "Trasporto — Fornitore — MODIFICABILE": trasporto?.ci_fornitori?.nome || "",
          "Trasporto — Data Fattura — MODIFICABILE": trasporto?.data_fattura || "",
          "Trasporto — Numero Fattura — MODIFICABILE": trasporto?.numero_fattura || "",
          "Trasporto — Importo (€) — MODIFICABILE": trasporto?.importo ?? "",
        };
      });

      esportaExcel("import_riproduttori", [{ nome: "Riproduttori", righe }]);
    } catch (err) {
      setErrore(err.message);
    }
    setGenerando(false);
  }

  function gestisciFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async evt => {
      setImportando(true);
      setErrore(null);
      setRisultatoImport(null);
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary", cellDates: true });
        const foglio = wb.Sheets[wb.SheetNames[0]];
        const righe = XLSX.utils.sheet_to_json(foglio, { defval: "" });
        await importaRighe(righe);
      } catch (err) {
        setErrore(err.message);
      }
      setImportando(false);
    };
    reader.readAsBinaryString(file);
  }

  async function importaRighe(righe) {
    const { data: tuttiAnimali } = await fetchAllPages((da, a) => supabase.from("animali").select("id,bdn").range(da, a));
    const mappaBdn = new Map((tuttiAnimali || []).map(x => [x.bdn, x.id]));

    let aggiornatiResiduo = 0, aggiornatiPeso = 0, fattureTrasporto = 0, righeSenzaMatch = [];

    for (const r of righe) {
      const bdn = r["BDN"];
      const animaleId = mappaBdn.get(bdn);
      if (!animaleId) { if (bdn) righeSenzaMatch.push(bdn); continue; }

      const vitaAttesa = r["Vita Attesa (anni) — MODIFICABILE"];
      const prezzoVendita = r["Prezzo Vendita €/kg Carcassa — MODIFICABILE"];
      if (vitaAttesa !== "" || prezzoVendita !== "") {
        const { data: residuo } = await supabase.from("ci_residuo_riproduttore").select("id").eq("animale_id", animaleId).maybeSingle();
        if (residuo) {
          const payload = {};
          if (vitaAttesa !== "") payload.vita_produttiva_attesa_anni = parseFloat(vitaAttesa);
          if (prezzoVendita !== "") payload.prezzo_vendita_kg_carcassa_reale = round2(parseFloat(prezzoVendita));
          await supabase.from("ci_residuo_riproduttore").update(payload).eq("id", residuo.id);
          aggiornatiResiduo++;
        }
      }

      const pesoReale = r["Peso Carcassa REALE (kg) — solo se uscito, MODIFICABILE"];
      if (pesoReale !== "") {
        await supabase.from("animali").update({ peso_carcassa: parseFloat(pesoReale) }).eq("id", animaleId);
        aggiornatiPeso++;
      }

      const fTrasportoFornitore = r["Trasporto — Fornitore — MODIFICABILE"];
      const fTrasportoData = r["Trasporto — Data Fattura — MODIFICABILE"];
      const fTrasportoNumero = r["Trasporto — Numero Fattura — MODIFICABILE"];
      const fTrasportoImporto = r["Trasporto — Importo (€) — MODIFICABILE"];
      if (fTrasportoData && fTrasportoNumero && fTrasportoImporto !== "") {
        let fornitoreId = null;
        if (fTrasportoFornitore) {
          const { data: fEsistente } = await supabase.from("ci_fornitori").select("id").eq("nome", fTrasportoFornitore).maybeSingle();
          fornitoreId = fEsistente?.id;
          if (!fornitoreId) {
            const { data: fNuovo } = await supabase.from("ci_fornitori").insert([{ nome: fTrasportoFornitore }]).select().single();
            fornitoreId = fNuovo?.id;
          }
        }
        const dataFatturaStr = fTrasportoData instanceof Date ? fTrasportoData.toISOString().slice(0, 10) : String(fTrasportoData).slice(0, 10);
        const { data: esistente } = await supabase.from("ci_report_acquisto_animali").select("id").eq("bdn", bdn).eq("fonte", "TRASPORTO_INGRESSO").maybeSingle();
        const payload = { fonte: "TRASPORTO_INGRESSO", fornitore_id: fornitoreId, data_fattura: dataFatturaStr, numero_fattura: String(fTrasportoNumero), importo: round2(parseFloat(fTrasportoImporto)), bdn };
        if (esistente) await supabase.from("ci_report_acquisto_animali").update(payload).eq("id", esistente.id);
        else await supabase.from("ci_report_acquisto_animali").insert([payload]);
        fattureTrasporto++;
      }
    }

    setRisultatoImport({ totaleRighe: righe.length, aggiornatiResiduo, aggiornatiPeso, fattureTrasporto, righeSenzaMatch });
  }

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Import Massivo Riproduttori</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Scarica il file con tutti i riproduttori e i dati già noti (da podereverdeapp.it e dalla Contabilità Industriale), compila le colonne mancanti, poi ricaricalo — aggiorna vita attesa, prezzo di vendita, peso carcassa reale (per gli usciti), e la fattura di trasporto ingresso.
      </p>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>1. Scarica il template</div>
        <button onClick={generaTemplate} disabled={generando}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {generando ? "Generazione..." : "📥 Scarica Excel Riproduttori"}
        </button>
        <p style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
          Il peso carcassa stimato (per gli animali ancora attivi) è calcolato dai pesi reali di animali della stessa specie/razza già macellati a un'età simile — è solo un riferimento, non viene salvato automaticamente da nessuna parte.
        </p>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>2. Ricarica il file compilato</div>
        <input type="file" accept=".xlsx,.xls" onChange={gestisciFile} disabled={importando} />
        {importando && <p style={{ color: C.muted, marginTop: 10 }}>Importazione in corso...</p>}
        {risultatoImport && (
          <div style={{ marginTop: 14, background: "#E8F3EA", border: `1px solid ${C.green}`, borderRadius: 8, padding: 14, fontSize: 13 }}>
            <div>✓ {risultatoImport.totaleRighe} righe lette</div>
            <div>✓ {risultatoImport.aggiornatiResiduo} riproduttori con vita attesa/prezzo vendita aggiornati</div>
            <div>✓ {risultatoImport.aggiornatiPeso} pesi carcassa reali aggiornati</div>
            <div>✓ {risultatoImport.fattureTrasporto} fatture trasporto create/aggiornate</div>
            {risultatoImport.righeSenzaMatch.length > 0 && (
              <div style={{ color: C.red, marginTop: 6 }}>⚠️ BDN non trovati in anagrafica: {risultatoImport.righeSenzaMatch.join(", ")}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
