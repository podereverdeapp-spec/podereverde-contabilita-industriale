import { useState } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";
import { C } from "./style";
import { round2 } from "./parsingUtils";
import { esportaExcel } from "./esportaExcel";

export default function CaricoMassivoMuratella({ coloreMuratella }) {
  const [importando, setImportando] = useState(false);
  const [risultato, setRisultato] = useState(null);
  const [errore, setErrore] = useState(null);

  function generaModello() {
    const righeEsempio = [{
      "Fattura Numero": "1/A", "Fattura Data (AAAA-MM-GG)": "2026-01-15", "Fornitore": "Esempio Fornitore S.r.l.",
      "Descrizione riga": "Esempio: manutenzione trattore", "Area": "Coltivazione", "Centro di Costo": "Manutenzione e Riparazione Macchine Agricole",
      "Tipo Costo (Fisso/Variabile)": "Variabile", "Importo (€)": 150.00, "Note fattura": "",
    }];
    esportaExcel("MURATELLA_modello_carico_massivo", [{ nome: "Fatture Muratella", righe: righeEsempio }]);
  }

  function gestisciFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async evt => {
      setImportando(true);
      setErrore(null);
      setRisultato(null);
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
    let fattureCreate = 0, righeCreate = 0, righeSaltate = 0;
    // Raggruppo per (numero+data+fornitore) così più righe della stessa fattura non ne
    // creano una copia ciascuna — stesso principio usato per le fatture di Podere Verde.
    const gruppi = new Map();
    for (const r of righe) {
      const numero = r["Fattura Numero"];
      const dataRaw = r["Fattura Data (AAAA-MM-GG)"];
      if (!dataRaw) { righeSaltate++; continue; }
      const dataStr = dataRaw instanceof Date ? dataRaw.toISOString().slice(0, 10) : String(dataRaw).slice(0, 10);
      const chiave = `${numero}|${dataStr}|${r["Fornitore"] || ""}`;
      if (!gruppi.has(chiave)) {
        gruppi.set(chiave, {
          numero, data: dataStr, fornitore: r["Fornitore"] || null, note: r["Note fattura"] || null, articoli: [],
        });
      }
      const importo = parseFloat(r["Importo (€)"]) || 0;
      gruppi.get(chiave).articoli.push({
        descrizione: r["Descrizione riga"] || null, area: r["Area"] || null, centro_costo: r["Centro di Costo"] || null,
        tipo_costo: r["Tipo Costo (Fisso/Variabile)"] || null, totale_riga: round2(importo),
      });
    }

    for (const g of gruppi.values()) {
      const totaleFattura = round2(g.articoli.reduce((s, a) => s + a.totale_riga, 0));
      const { data: fattura, error: eF } = await supabase.from("muratella_fatture")
        .insert([{ numero: g.numero, data: g.data, fornitore_nome: g.fornitore, note: g.note, totale_netto: totaleFattura }])
        .select().single();
      if (eF) { righeSaltate += g.articoli.length; continue; }
      fattureCreate++;
      const articoliConFattura = g.articoli.map(a => ({ ...a, fattura_id: fattura.id }));
      const { error: eA } = await supabase.from("muratella_articoli_fattura").insert(articoliConFattura);
      if (!eA) righeCreate += articoliConFattura.length;
      else righeSaltate += articoliConFattura.length;
    }

    setRisultato({ fattureCreate, righeCreate, righeSaltate, totaleRighe: righe.length });
  }

  return (
    <div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Carica in blocco le fatture della Muratella — ogni riga del file è una voce di costo; più righe con lo stesso numero+data+fornitore vengono raggruppate nella stessa fattura.
      </p>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>1. Scarica il modello</div>
        <button onClick={generaModello}
          style={{ background: coloreMuratella, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          📥 Scarica Modello Excel (MURATELLA)
        </button>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>2. Carica il file compilato</div>
        <input type="file" accept=".xlsx,.xls" onChange={gestisciFile} disabled={importando} />
        {importando && <p style={{ color: C.muted, marginTop: 10 }}>Importazione in corso...</p>}
        {risultato && (
          <div style={{ marginTop: 14, background: "#E8F3EA", border: `1px solid ${C.green}`, borderRadius: 8, padding: 14, fontSize: 13 }}>
            <div>✓ {risultato.totaleRighe} righe lette dal file</div>
            <div>✓ {risultato.fattureCreate} fatture Muratella create</div>
            <div>✓ {risultato.righeCreate} righe di costo registrate</div>
            {risultato.righeSaltate > 0 && <div style={{ color: C.red }}>⚠️ {risultato.righeSaltate} righe saltate (data mancante o errore)</div>}
          </div>
        )}
      </div>
    </div>
  );
}
