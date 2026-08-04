import { useState } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";
import { C } from "./style";
import { round2, fetchAllPages } from "./parsingUtils";
import { esportaExcel } from "./esportaExcel";

export default function ImportFattureAcquistoAnimali() {
  const [generando, setGenerando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [risultatoImport, setRisultatoImport] = useState(null);
  const [errore, setErrore] = useState(null);

  async function generaTemplate() {
    setGenerando(true);
    setErrore(null);
    try {
      const { data: animali } = await fetchAllPages((da, a) => supabase
        .from("animali").select("bdn,nome,specie,razza,razza_calcolata,prezzo_acquisto,fornitore,data_fattura,numero_fattura")
        .eq("provenienza", "Acquistato").range(da, a));

      const { data: lotti } = await supabase.from("lotti_suini")
        .select("codice_lotto,codice,specie,razza_madre,prezzo_acquisto,fornitore,data_fattura,numero_fattura")
        .eq("tipo_provenienza", "acquistato");

      const righeAnimali = (animali || []).map(a => ({
        "Tipo": "Animale", "BDN / Codice Lotto": a.bdn || "", "Nome": a.nome || "", "Specie": a.specie || "",
        "Razza": a.razza_calcolata || a.razza || "", "Prezzo noto (€)": a.prezzo_acquisto ?? "",
        "Fornitore — MODIFICABILE": a.fornitore || "", "Data Fattura — MODIFICABILE": a.data_fattura || "",
        "Numero Fattura — MODIFICABILE": a.numero_fattura || "",
      }));
      const righeLotti = (lotti || []).map(l => ({
        "Tipo": "Lotto Suini", "BDN / Codice Lotto": l.codice_lotto || l.codice || "", "Nome": "", "Specie": l.specie || "",
        "Razza": l.razza_madre || "", "Prezzo noto (€)": l.prezzo_acquisto ?? "",
        "Fornitore — MODIFICABILE": l.fornitore || "", "Data Fattura — MODIFICABILE": l.data_fattura || "",
        "Numero Fattura — MODIFICABILE": l.numero_fattura || "",
      }));

      const righe = [...righeAnimali, ...righeLotti];
      if (righe.length === 0) { alert("Nessun animale o lotto con provenienza Acquistato trovato."); setGenerando(false); return; }
      esportaExcel("fatture_acquisto_animali", [{ nome: "Fatture Acquisto", righe }]);
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
    let animaliAggiornati = 0, lottiAggiornati = 0, righeSenzaMatch = [];

    for (const r of righe) {
      const identificativo = r["BDN / Codice Lotto"];
      if (!identificativo) continue;
      const fornitore = r["Fornitore — MODIFICABILE"];
      const dataRaw = r["Data Fattura — MODIFICABILE"];
      const numero = r["Numero Fattura — MODIFICABILE"];
      if (!fornitore && !dataRaw && !numero) continue; // nessuna modifica per questa riga

      const dataStr = dataRaw instanceof Date ? dataRaw.toISOString().slice(0, 10) : (dataRaw ? String(dataRaw).slice(0, 10) : null);
      const payload = { fornitore: fornitore || null, data_fattura: dataStr, numero_fattura: numero ? String(numero) : null };

      if (r["Tipo"] === "Lotto Suini") {
        const { data, error } = await supabase.from("lotti_suini").update(payload).eq("codice_lotto", identificativo).select();
        if (!error && data?.length > 0) lottiAggiornati++;
        else if (!error) righeSenzaMatch.push(identificativo);
      } else {
        const { data, error } = await supabase.from("animali").update(payload).eq("bdn", identificativo).select();
        if (!error && data?.length > 0) {
          animaliAggiornati++;
          // Sincronizzo anche in ci_report_acquisto_animali, per non disallineare di nuovo
          // i due sistemi (stesso problema già risolto una volta per i riproduttori).
          const importo = data[0].prezzo_acquisto;
          if (fornitore && dataStr && numero && importo) {
            let fornitoreId = null;
            const { data: fEsistente } = await supabase.from("ci_fornitori").select("id").eq("nome", fornitore).maybeSingle();
            fornitoreId = fEsistente?.id;
            if (!fornitoreId) {
              const { data: fNuovo } = await supabase.from("ci_fornitori").insert([{ nome: fornitore }]).select().single();
              fornitoreId = fNuovo?.id;
            }
            const { data: acqEsistente } = await supabase.from("ci_report_acquisto_animali").select("id").eq("bdn", identificativo).eq("fonte", "ACQUISTO_DIRETTO").maybeSingle();
            const payloadAcq = { fonte: "ACQUISTO_DIRETTO", bdn: identificativo, fornitore_id: fornitoreId, data_fattura: dataStr, numero_fattura: String(numero), importo: round2(parseFloat(importo)) };
            if (acqEsistente) await supabase.from("ci_report_acquisto_animali").update(payloadAcq).eq("id", acqEsistente.id);
            else await supabase.from("ci_report_acquisto_animali").insert([payloadAcq]);
          }
        }
        else if (!error) righeSenzaMatch.push(identificativo);
      }
    }

    setRisultatoImport({ totaleRighe: righe.length, animaliAggiornati, lottiAggiornati, righeSenzaMatch });
  }

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Import Fatture Acquisto Animali</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Scarica il file con tutti gli animali e i lotti suini acquistati (dati già noti da podereverdeapp.it), compila fornitore/data/numero fattura mancanti, poi ricaricalo — aggiorna direttamente su podereverdeapp.it (stesse tabelle animali/lotti_suini). Copre tutti gli animali acquistati, non solo i riproduttori.
      </p>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>1. Scarica il template</div>
        <button onClick={generaTemplate} disabled={generando}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {generando ? "Generazione..." : "📥 Scarica Excel Fatture Acquisto"}
        </button>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>2. Ricarica il file compilato</div>
        <input type="file" accept=".xlsx,.xls" onChange={gestisciFile} disabled={importando} />
        {importando && <p style={{ color: C.muted, marginTop: 10 }}>Importazione in corso...</p>}
        {risultatoImport && (
          <div style={{ marginTop: 14, background: "#E8F3EA", border: `1px solid ${C.green}`, borderRadius: 8, padding: 14, fontSize: 13 }}>
            <div>✓ {risultatoImport.totaleRighe} righe lette</div>
            <div>✓ {risultatoImport.animaliAggiornati} animali aggiornati</div>
            <div>✓ {risultatoImport.lottiAggiornati} lotti aggiornati</div>
            {risultatoImport.righeSenzaMatch.length > 0 && (
              <div style={{ color: C.red, marginTop: 6 }}>⚠️ Non trovati: {risultatoImport.righeSenzaMatch.join(", ")}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
