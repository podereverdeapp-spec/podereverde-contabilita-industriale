import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";
import { C } from "./style";
import { round2, numeroRobusto, calcolaImponibile, leggiAliquotaIva, formattaData } from "./parsingUtils";

export default function CaricaFattureAttive() {
  const [clienti, setClienti] = useState([]);
  const [righe, setRighe] = useState([]);
  const fileInputRef = useRef(null);
  const [caricatoClienti, setCaricatoClienti] = useState(false);

  async function assicuraClienti() {
    if (caricatoClienti) return clienti;
    const { data, error } = await supabase.from("ci_clienti").select("*");
    if (error) { alert(`⚠️ Errore nel caricamento clienti:\n\n${error.message}`); return []; }
    setClienti(data || []);
    setCaricatoClienti(true);
    return data || [];
  }

  function trovaCliente(listaClienti, { piva, nome }) {
    if (piva) {
      const c = listaClienti.find(c => c.partita_iva && c.partita_iva === piva.trim());
      if (c) return c;
    }
    if (nome) {
      const nomeNorm = nome.trim().toLowerCase();
      const c = listaClienti.find(c => c.nome.trim().toLowerCase() === nomeNorm);
      if (c) return c;
    }
    return null;
  }

  function gestisciFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: "binary", cellDates: true });
      const foglio = wb.Sheets[wb.SheetNames[0]];
      const dati = XLSX.utils.sheet_to_json(foglio, { defval: "" });
      await elaboraRigheGrezze(dati);
    };
    reader.readAsBinaryString(file);
  }

  async function elaboraRigheGrezze(dati) {
    const listaClienti = await assicuraClienti();

    const risultati = dati.map((r, i) => {
      const cliente = String(r["Cliente"] || r["cliente"] || "").trim();
      const piva = String(r["P.IVA"] || r["Partita IVA"] || "").trim();
      const clienteObj = trovaCliente(listaClienti, { piva, nome: cliente });
      return {
        id: `riga-${Date.now()}-${i}`,
        cliente, piva, cliente_obj: clienteObj,
        numero: String(r["Numero"] || "").trim(),
        data: formattaData(r["Data"]),
        descrizione: String(r["Descrizione"] || "").trim(),
        quantita: numeroRobusto(r["Quantità"] || r["Quantita"] || 1),
        unita_misura: String(r["U.M."] || "").trim(),
        prezzo_unitario: numeroRobusto(r["Prezzo unitario"] || 0),
        imponibile: calcolaImponibile(r),
        aliquota_iva: leggiAliquotaIva(r),
        destinazione: String(r["Destinazione"] || "").trim(),
        giaCaricata: false, salvata: false, salvataggioInCorso: false, idsSalvati: null,
      };
    });

    const clienteIds = [...new Set(risultati.map(r => r.cliente_obj?.id).filter(Boolean))];
    if (clienteIds.length > 0) {
      const { data: fattureEsistenti } = await supabase.from("ci_fatture").select("cliente_id, numero, data").in("cliente_id", clienteIds);
      const chiaviEsistenti = new Set((fattureEsistenti || []).map(f => `${f.cliente_id}|${f.numero}|${f.data}`));
      risultati.forEach(r => {
        if (r.cliente_obj) r.giaCaricata = chiaviEsistenti.has(`${r.cliente_obj.id}|${r.numero}|${r.data}`);
      });
    }

    setRighe(prev => [...prev, ...risultati]);
  }

  function aggiornaRiga(id, campi) {
    setRighe(prev => prev.map(r => (r.id === id ? { ...r, ...campi } : r)));
  }

  async function trovaOCreaFatturaAttiva(clienteId, numero, data) {
    const { data: esistente } = await supabase.from("ci_fatture").select("id").eq("cliente_id", clienteId).eq("numero", numero).eq("data", data).maybeSingle();
    if (esistente) return esistente.id;
    const { data: nuova, error } = await supabase.from("ci_fatture").insert([{
      numero, data, tipo: "ATTIVA", cliente_id: clienteId, totale_netto: 0, totale_iva: 0, totale_lordo: 0,
    }]).select().single();
    if (error) throw new Error(`Errore creando fattura ${numero}: ${error.message}`);
    return nuova.id;
  }

  async function ricalcolaTotali(fatturaId) {
    const { data: righeArt } = await supabase.from("ci_articoli_fattura").select("totale_riga, totale_iva").eq("fattura_id", fatturaId);
    const netto = (righeArt || []).reduce((s, r) => s + (r.totale_riga || 0), 0);
    const iva = (righeArt || []).reduce((s, r) => s + (r.totale_iva || 0), 0);
    await supabase.from("ci_fatture").update({ totale_netto: round2(netto), totale_iva: round2(iva), totale_lordo: round2(netto + iva) }).eq("id", fatturaId);
  }

  async function salvaRiga(riga) {
    if (riga.giaCaricata) { alert("Questa fattura risulta già caricata."); return; }
    if (!riga.descrizione.trim()) { alert("Manca la descrizione."); return; }
    aggiornaRiga(riga.id, { salvataggioInCorso: true });
    try {
      let clienteId = riga.cliente_obj?.id;
      if (!clienteId && riga.cliente) {
        const { data: nuovo, error } = await supabase.from("ci_clienti").insert([{ nome: riga.cliente, partita_iva: riga.piva || null }]).select().single();
        if (error) throw new Error(`Errore creando cliente: ${error.message}`);
        clienteId = nuovo.id;
        setClienti(prev => [...prev, nuovo]);
      }
      if (!clienteId) throw new Error("Nessun cliente indicato per questa riga.");

      const fatturaId = await trovaOCreaFatturaAttiva(clienteId, riga.numero, riga.data);
      const totaleIvaRiga = riga.aliquota_iva ? round2(riga.imponibile * riga.aliquota_iva / 100) : 0;
      const { data: art, error } = await supabase.from("ci_articoli_fattura").insert([{
        fattura_id: fatturaId, descrizione: riga.descrizione, quantita: riga.quantita || 0,
        unita_misura: riga.unita_misura || null, prezzo_unitario: riga.prezzo_unitario || 0,
        totale_riga: riga.imponibile, aliquota_iva: riga.aliquota_iva, totale_iva: totaleIvaRiga,
        destinazione: riga.destinazione || null,
      }]).select().single();
      if (error) throw new Error(error.message);
      await ricalcolaTotali(fatturaId);

      aggiornaRiga(riga.id, { salvata: true, salvataggioInCorso: false, idsSalvati: { articoloId: art.id, fatturaId } });
    } catch (err) {
      aggiornaRiga(riga.id, { salvataggioInCorso: false });
      alert(`⚠️ Errore nel salvataggio:\n\n${err.message}`);
    }
  }

  async function annullaRiga(riga) {
    if (!window.confirm("Annullare il salvataggio di questa riga?")) return;
    const ids = riga.idsSalvati || {};
    if (ids.articoloId) await supabase.from("ci_articoli_fattura").delete().eq("id", ids.articoloId);
    if (ids.fatturaId) await ricalcolaTotali(ids.fatturaId);
    aggiornaRiga(riga.id, { salvata: false, idsSalvati: null });
  }

  async function salvaTutte() {
    const daSalvare = righe.filter(r => !r.giaCaricata && !r.salvata);
    for (const r of daSalvare) {
      // eslint-disable-next-line no-await-in-loop
      await salvaRiga(r);
    }
  }

  const stats = {
    totale: righe.length,
    salvate: righe.filter(r => r.salvata).length,
    giaCaricate: righe.filter(r => r.giaCaricata).length,
  };

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Carica Fatture Attive</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Caricamento massivo delle vendite — colonne: Cliente, P.IVA, Numero, Data, Descrizione, Quantità, U.M., Prezzo unitario, Imponibile, Aliquota IVA, Destinazione (specie, opzionale).
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={gestisciFile} />
      </div>

      {righe.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <StatBox label="Totale righe" value={stats.totale} color={C.primary} />
            <StatBox label="Salvate" value={stats.salvate} color={C.green} />
            {stats.giaCaricate > 0 && <StatBox label="Già caricate" value={stats.giaCaricate} color={C.accent} />}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {righe.map(r => (
              <RigaAttiva key={r.id} riga={r} onChange={c => aggiornaRiga(r.id, c)} onSalva={() => salvaRiga(r)} onAnnulla={() => annullaRiga(r)} />
            ))}
          </div>

          {stats.salvate < righe.filter(r => !r.giaCaricata).length && (
            <button onClick={salvaTutte} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              Salva tutte le rimanenti
            </button>
          )}
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: color + "15", borderRadius: 10, padding: "10px 16px", minWidth: 120 }}>
      <div style={{ fontSize: 12, color, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function RigaAttiva({ riga, onChange, onSalva, onAnnulla }) {
  const r = riga;
  const bordo = r.giaCaricata ? C.accent : r.salvata ? C.green : C.blue;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${bordo}`, borderRadius: 10, padding: 14, opacity: r.giaCaricata ? 0.6 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div>
          <strong>{r.cliente}</strong> — {r.descrizione}
          <div style={{ fontSize: 12, color: C.muted }}>
            Fatt. {r.numero} del {r.data} · {r.quantita} {r.unita_misura} × {r.prezzo_unitario?.toFixed(2)}€ · Imponibile {r.imponibile?.toFixed(2)}€
            {r.aliquota_iva != null && ` · IVA ${r.aliquota_iva}%`}
          </div>
        </div>
        <span style={{ background: bordo + "22", color: bordo, padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, height: "fit-content" }}>
          {r.giaCaricata ? "GIÀ CARICATA" : r.salvata ? "✓ SALVATA" : "DA SALVARE"}
        </span>
      </div>
      {!r.giaCaricata && r.salvata && (
        <button onClick={onAnnulla} style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: C.muted, cursor: "pointer" }}>
          ↩️ Annulla e ricarica
        </button>
      )}
      {!r.giaCaricata && !r.salvata && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
            <Select label="Destinazione (specie)" value={r.destinazione} options={["Bovini", "Suini", "Ovini", "Generali", "Pollame", "Cavalli"]} onChange={v => onChange({ destinazione: v })} />
          </div>
          <button onClick={onSalva} disabled={r.salvataggioInCorso}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {r.salvataggioInCorso ? "Salvataggio..." : "💾 Salva questa riga"}
          </button>
        </>
      )}
    </div>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>{label}</label>
      <select value={value || ""} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
        <option value="">— seleziona —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
