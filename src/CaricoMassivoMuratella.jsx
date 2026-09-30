import { useState } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";
import { C } from "./style";
import { round2, numeroRobusto, calcolaImponibile, leggiAliquotaIva, formattaData } from "./parsingUtils";
import { esportaExcel } from "./esportaExcel";

// Stesso schema colonne del "Prompt per carico Massivo" già usato per estrarre le fatture
// di Podere Verde dai PDF (PromptEstrazionePDF.jsx, tabella "Fatture") — con in più le 3
// colonne di classificazione che qui vanno inserite a mano riga per riga (Area, Centro di
// Costo, Tipo), dato che per la Muratella non c'è un motore di classificazione automatica.
export default function CaricoMassivoMuratella({ coloreMuratella }) {
  const [importando, setImportando] = useState(false);
  const [risultato, setRisultato] = useState(null);
  const [errore, setErrore] = useState(null);

  async function generaModello() {
    setErrore(null);
    const righeEsempio = [{
      "Fornitore": "Esempio Fornitore S.r.l.", "P.IVA": "01234567890", "Numero": "1/A", "Data": "2026-01-15",
      "Descrizione": "Esempio: manutenzione trattore", "Quantità": 1, "U.M.": "Unità", "Prezzo unitario": 150.00,
      "Imponibile": 150.00, "Aliquota IVA": 22, "Tipo documento": "Fattura",
      "Area": "Coltivazione", "Centro di Costo": "Manutenzione e Riparazione Macchine Agricole", "Tipo (Fisso/Variabile)": "Variabile",
    }];
    // Foglio di riferimento con le combinazioni Area/Centro di Costo valide — lo stesso
    // vocabolario già usato per le fatture di Podere Verde (ci_piano_dei_conti), così le due
    // contabilità restano coerenti nella classificazione pur restando su tabelle separate.
    const { data: piano, error } = await supabase.from("ci_piano_dei_conti").select("area,centro_costo").order("area").order("centro_costo");
    if (error) { setErrore(`Errore caricando il piano dei conti: ${error.message}`); return; }
    const righePiano = (piano || []).map(p => ({ "Area": p.area, "Centro di Costo valido per quell'Area": p.centro_costo }));
    esportaExcel("MURATELLA_modello_carico_massivo", [
      { nome: "Fatture Muratella", righe: righeEsempio },
      { nome: "Piano dei Conti (riferimento)", righe: righePiano },
    ]);
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

  // Partita IVA scritta sempre allo stesso modo (senza spazi, senza "IT"), per riconoscere il fornitore
  function pivaPulita(v) {
    return String(v || "").replace(/\s+/g, "").toUpperCase().replace(/^IT/, "");
  }

  async function importaRighe(righe) {
    let righeSaltate = 0;
    const { data: piano } = await supabase.from("ci_piano_dei_conti").select("area,centro_costo");
    const combinazioniValide = new Set((piano || []).map(p => `${p.area}|${p.centro_costo}`));
    const areeCentriNonStandard = new Set();

    // Raggruppo per (Numero + Data + Fornitore) così più righe della stessa fattura non ne
    // creano una copia ciascuna — stesso principio usato per le fatture di Podere Verde.
    // Il fornitore si riconosce dalla partita IVA; se manca, dal nome.
    const gruppi = new Map();
    for (const r of righe) {
      const numero = String(r["Numero"] ?? "").trim();
      const dataRaw = r["Data"];
      if (!dataRaw) { righeSaltate++; continue; }
      const dataStr = dataRaw instanceof Date ? dataRaw.toISOString().slice(0, 10) : formattaData(dataRaw).slice(0, 10);
      const fornitore = String(r["Fornitore"] || "").trim();
      const piva = String(r["P.IVA"] || r["Partita IVA"] || "").trim();
      const chiave = `${numero}|${dataStr}|${pivaPulita(piva) || fornitore.toLowerCase()}`;
      if (!gruppi.has(chiave)) {
        gruppi.set(chiave, { numero, data: dataStr, fornitore: fornitore || null, piva: piva || null, articoli: [] });
      }
      const area = r["Area"] || null;
      const centroCosto = r["Centro di Costo"] || null;
      if (area && centroCosto && !combinazioniValide.has(`${area}|${centroCosto}`)) {
        areeCentriNonStandard.add(`${area} / ${centroCosto}`);
      }
      const quantita = numeroRobusto(r["Quantità"] ?? r["Quantita"]);
      const prezzo = numeroRobusto(r["Prezzo unitario"] ?? r["Prezzo Unitario"]);
      const imponibile = round2(calcolaImponibile(r));
      const aliquota = leggiAliquotaIva(r);
      gruppi.get(chiave).articoli.push({
        descrizione: r["Descrizione"] || null, area, centro_costo: centroCosto,
        tipo_costo: r["Tipo (Fisso/Variabile)"] || null,
        quantita: Number.isNaN(quantita) ? null : quantita,
        unita_misura: String(r["U.M."] || r["Unità Misura"] || "").trim() || null,
        prezzo_unitario: Number.isNaN(prezzo) ? null : prezzo,
        totale_riga: imponibile,
        aliquota_iva: aliquota,
        totale_iva: aliquota != null ? round2(imponibile * aliquota / 100) : null,
      });
    }

    // Fatture già caricate: stesso numero e stessa data, e stesso fornitore (per partita IVA o per nome)
    const { data: esistenti } = await supabase.from("muratella_fatture").select("numero, data, fornitore_nome, fornitore_piva");
    const chiaviEsistenti = new Set();
    (esistenti || []).forEach(f => {
      if (f.fornitore_piva) chiaviEsistenti.add(`${String(f.numero).trim()}|${f.data}|${pivaPulita(f.fornitore_piva)}`);
      chiaviEsistenti.add(`${String(f.numero).trim()}|${f.data}|${String(f.fornitore_nome || "").trim().toLowerCase()}`);
    });

    let fattureCreate = 0, righeCreate = 0;
    const giaPresenti = [];
    for (const g of gruppi.values()) {
      const perPiva = g.piva ? `${g.numero}|${g.data}|${pivaPulita(g.piva)}` : null;
      const perNome = `${g.numero}|${g.data}|${String(g.fornitore || "").toLowerCase()}`;
      if ((perPiva && chiaviEsistenti.has(perPiva)) || chiaviEsistenti.has(perNome)) {
        giaPresenti.push(`${g.fornitore || "—"} n. ${g.numero} del ${g.data}`);
        continue;
      }
      const totaleFattura = round2(g.articoli.reduce((s, a) => s + a.totale_riga, 0));
      const totaleIva = round2(g.articoli.reduce((s, a) => s + (a.totale_iva || 0), 0));
      const { data: fattura, error: eF } = await supabase.from("muratella_fatture")
        .insert([{ numero: g.numero, data: g.data, fornitore_nome: g.fornitore, fornitore_piva: g.piva,
          totale_netto: totaleFattura, totale_iva: totaleIva, totale_lordo: round2(totaleFattura + totaleIva) }])
        .select().single();
      if (eF) { righeSaltate += g.articoli.length; continue; }
      fattureCreate++;
      const articoliConFattura = g.articoli.map(a => ({ ...a, fattura_id: fattura.id }));
      const { error: eA } = await supabase.from("muratella_articoli_fattura").insert(articoliConFattura);
      if (!eA) righeCreate += articoliConFattura.length;
      else righeSaltate += articoliConFattura.length;
    }

    setRisultato({ fattureCreate, righeCreate, righeSaltate, totaleRighe: righe.length, areeCentriNonStandard: [...areeCentriNonStandard], giaPresenti });
  }

  return (
    <div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Carica in blocco le fatture della Muratella — stesso schema colonne del "Prompt per carico Massivo" di Podere Verde, con in più Area/Centro di Costo/Tipo da compilare per ogni riga. Più righe con lo stesso Numero+Data+Fornitore vengono raggruppate nella stessa fattura.
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
            {risultato.giaPresenti.length > 0 && (
              <div style={{ color: C.accent, marginTop: 6 }}>
                ⚠️ {risultato.giaPresenti.length} fatture erano già caricate e sono state saltate: {risultato.giaPresenti.join("; ")}
              </div>
            )}
            {risultato.righeSaltate > 0 && <div style={{ color: C.red }}>⚠️ {risultato.righeSaltate} righe saltate (data mancante o errore)</div>}
            {risultato.areeCentriNonStandard.length > 0 && (
              <div style={{ color: C.accent, marginTop: 6 }}>
                ⚠️ Combinazioni Area/Centro non presenti nel piano dei conti di Podere Verde (importate comunque): {risultato.areeCentriNonStandard.join(", ")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
