import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { round2, formattaEuro } from "./parsingUtils";
import { classificaRiga } from "./motoreClassificazione";

const AREE_ORDINARIE = [
  "Allevamento", "Coltivazione", "Lavoro", "Energia Elettrica", "Acqua", "Consulenze",
  "Assicurazioni", "Lavorazioni prodotti allevamento", "Spese Promozionali",
  "Canoni ed Abbonamenti", "Varie", "Oneri Finanziari", "Orto", "Animali non d'allevamento", "Ammortamenti",
];
const DESTINAZIONI = ["Bovini", "Suini", "Ovini", "Bovini e Ovini", "Generali", "Pollame", "Cavalli"];
const UNITA_OPZIONI = ["", "Unità", "Tons", "Quintali", "Kilogrammi", "Litri", "Balloni", "Rotoballe", "Rotoli", "Balle", "Rotoloni"];

function rigaVuota() {
  return {
    id: crypto.randomUUID(), descrizione: "", quantita: "1", unita_misura: "", prezzo_unitario: "", imponibile: "",
    aliquota_iva: "22", area: "", centro_costo: "", destinazione: "", tipo_costo: "",
  };
}

export default function InserimentoManualeFattura() {
  const [fornitori, setFornitori] = useState([]);
  const [regoleFisse, setRegoleFisse] = useState([]);
  const [regoleVariabili, setRegoleVariabili] = useState([]);
  const [pianoDeiConti, setPianoDeiConti] = useState([]);
  const [loading, setLoading] = useState(true);

  const [fornitoreTesto, setFornitoreTesto] = useState("");
  const [fornitoreSelezionato, setFornitoreSelezionato] = useState(null);
  const [numero, setNumero] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [righe, setRighe] = useState([rigaVuota()]);
  const [salvando, setSalvando] = useState(false);
  const [messaggioOk, setMessaggioOk] = useState(null);

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    const [{ data: f }, { data: rf }, { data: rv }, { data: pdc }] = await Promise.all([
      supabase.from("ci_fornitori").select("*").order("nome"),
      supabase.from("ci_regole_fornitore_fissa").select("*"),
      supabase.from("ci_regole_fornitore_variabile").select("*"),
      supabase.from("ci_piano_dei_conti").select("*").order("area").order("centro_costo"),
    ]);
    setFornitori(f || []);
    setRegoleFisse(rf || []);
    setRegoleVariabili(rv || []);
    setPianoDeiConti(pdc || []);
    setLoading(false);
  }

  const suggerimentiFornitore = fornitoreTesto.trim().length > 0
    ? fornitori.filter(f => f.nome.toLowerCase().includes(fornitoreTesto.trim().toLowerCase())).slice(0, 8)
    : [];

  function centriPerArea(areaScelta) {
    return pianoDeiConti.filter(p => p.area === areaScelta).map(p => p.centro_costo);
  }

  function aggiornaRiga(id, campi) {
    setRighe(prev => prev.map(r => {
      if (r.id !== id) return r;
      const nuova = { ...r, ...campi };
      // Ricalcolo automatico dell'imponibile da quantità×prezzo, se entrambi presenti
      // e l'utente non ha appena modificato l'imponibile stesso a mano
      if (("quantita" in campi || "prezzo_unitario" in campi) && !("imponibile" in campi)) {
        const q = parseFloat(nuova.quantita), p = parseFloat(nuova.prezzo_unitario);
        if (Number.isFinite(q) && Number.isFinite(p)) nuova.imponibile = round2(q * p).toString();
      }
      // Suggerimento automatico di classificazione, quando descrizione e fornitore sono noti
      if ("descrizione" in campi && fornitoreSelezionato && campi.descrizione.trim().length > 2) {
        const suggerito = classificaRiga(
          { descrizione: campi.descrizione, fornitore: fornitoreSelezionato.nome, piva: fornitoreSelezionato.partita_iva },
          { fornitori, regoleFisse, regoleVariabili }
        );
        if (suggerito.area) {
          nuova.area = suggerito.area; nuova.centro_costo = suggerito.centro_costo || "";
          nuova.destinazione = suggerito.destinazione || ""; nuova.tipo_costo = suggerito.tipo_costo || "";
        }
      }
      return nuova;
    }));
  }

  function aggiungiRiga() { setRighe(prev => [...prev, rigaVuota()]); }
  function rimuoviRiga(id) { setRighe(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev); }

  function selezionaFornitore(f) {
    setFornitoreSelezionato(f);
    setFornitoreTesto(f.nome);
  }

  async function salvaFattura() {
    if (!fornitoreSelezionato && !fornitoreTesto.trim()) { alert("Indica il fornitore."); return; }
    if (!numero.trim()) { alert("Indica il numero fattura."); return; }
    if (righe.some(r => !r.descrizione.trim() || r.imponibile === "")) { alert("Ogni riga deve avere almeno Descrizione e Imponibile."); return; }

    setSalvando(true);
    try {
      // 1) Trova o crea il fornitore
      let fornitoreId = fornitoreSelezionato?.id;
      if (!fornitoreId) {
        const { data: nuovo, error } = await supabase.from("ci_fornitori").insert([{ nome: fornitoreTesto.trim() }]).select().single();
        if (error) throw new Error(error.message);
        fornitoreId = nuovo.id;
      }

      // 2) Trova o crea la fattura
      const { data: fatturaEsistente } = await supabase.from("ci_fatture")
        .select("id").eq("fornitore_id", fornitoreId).eq("numero", numero.trim()).eq("data", data).maybeSingle();
      let fatturaId = fatturaEsistente?.id;
      if (!fatturaId) {
        const { data: nuovaFattura, error } = await supabase.from("ci_fatture").insert([{
          numero: numero.trim(), data, tipo: "PASSIVA", fornitore_id: fornitoreId, totale_netto: 0, totale_iva: 0, totale_lordo: 0,
        }]).select().single();
        if (error) throw new Error(error.message);
        fatturaId = nuovaFattura.id;
      }

      // 3) Crea ogni riga articolo
      for (const r of righe) {
        const imponibile = round2(parseFloat(r.imponibile));
        const aliquota = parseFloat(r.aliquota_iva) || 0;
        const { error } = await supabase.from("ci_articoli_fattura").insert([{
          fattura_id: fatturaId, descrizione: r.descrizione.trim(),
          quantita: r.quantita !== "" ? parseFloat(r.quantita) : 1, unita_misura: r.unita_misura || null,
          prezzo_unitario: r.prezzo_unitario !== "" ? parseFloat(r.prezzo_unitario) : null,
          totale_riga: imponibile, aliquota_iva: aliquota, totale_iva: round2(imponibile * aliquota / 100),
          area: r.area || null, centro_costo: r.centro_costo || null, destinazione: r.destinazione || null, tipo_costo: r.tipo_costo || null,
        }]);
        if (error) throw new Error(error.message);
      }

      // 4) Ricalcola i totali fattura
      const { data: righeArt } = await supabase.from("ci_articoli_fattura").select("totale_riga, totale_iva").eq("fattura_id", fatturaId);
      const netto = (righeArt || []).reduce((s, x) => s + (parseFloat(x.totale_riga) || 0), 0);
      const iva = (righeArt || []).reduce((s, x) => s + (parseFloat(x.totale_iva) || 0), 0);
      await supabase.from("ci_fatture").update({ totale_netto: round2(netto), totale_iva: round2(iva), totale_lordo: round2(netto + iva) }).eq("id", fatturaId);

      setMessaggioOk(`Fattura ${numero} salvata con ${righe.length} righe.`);
      setFornitoreTesto(""); setFornitoreSelezionato(null); setNumero(""); setData(new Date().toISOString().slice(0, 10));
      setRighe([rigaVuota()]);
      await carica();
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio:\n\n${err.message}`);
    }
    setSalvando(false);
  }

  const totaleImponibile = righe.reduce((s, r) => s + (parseFloat(r.imponibile) || 0), 0);

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Inserimento Manuale Fattura</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Crea una fattura passiva scrivendo tu i dati, senza dover caricare un PDF — stessa struttura e stesso motore di classificazione di Carica Fatture. Per ora pensata per fatture ordinarie (non Ammortamenti, Acquisto Animali o Trasporto Animali, che hanno una gestione a parte).
      </p>

      {loading ? <p style={{ color: C.muted }}>Caricamento...</p> : (
        <>
          {messaggioOk && (
            <div style={{ background: "#E8F3EA", border: `1px solid ${C.green}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, marginBottom: 16 }}>
              ✓ {messaggioOk}
            </div>
          )}

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
              <div style={{ position: "relative" }}>
                <label style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>Fornitore</label>
                <input value={fornitoreTesto}
                  onChange={e => { setFornitoreTesto(e.target.value); setFornitoreSelezionato(null); }}
                  placeholder="Cerca o scrivi un nome nuovo..."
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, marginTop: 3 }} />
                {suggerimentiFornitore.length > 0 && !fornitoreSelezionato && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, zIndex: 5, maxHeight: 180, overflow: "auto" }}>
                    {suggerimentiFornitore.map(f => (
                      <div key={f.id} onClick={() => selezionaFornitore(f)}
                        style={{ padding: "7px 10px", fontSize: 13, cursor: "pointer", borderBottom: `1px solid ${C.border}` }}>
                        {f.nome}
                      </div>
                    ))}
                  </div>
                )}
                {!fornitoreSelezionato && fornitoreTesto.trim().length > 0 && (
                  <div style={{ fontSize: 11, color: C.accent, marginTop: 3 }}>Nessun fornitore selezionato dall'elenco — verrà creato "{fornitoreTesto.trim()}" come nuovo, se confermi.</div>
                )}
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>Numero fattura</label>
                <input value={numero} onChange={e => setNumero(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, marginTop: 3 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>Data</label>
                <input type="date" value={data} onChange={e => setData(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, marginTop: 3 }} />
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>Righe articolo</div>
          {righe.map((r, i) => (
            <div key={r.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                <CampoTesto label="Descrizione" value={r.descrizione} onChange={v => aggiornaRiga(r.id, { descrizione: v })} />
                <CampoNumero label="Quantità" value={r.quantita} onChange={v => aggiornaRiga(r.id, { quantita: v })} />
                <CampoSelect label="U.M." value={r.unita_misura} options={UNITA_OPZIONI} onChange={v => aggiornaRiga(r.id, { unita_misura: v })} />
                <CampoNumero label="Prezzo unitario" value={r.prezzo_unitario} onChange={v => aggiornaRiga(r.id, { prezzo_unitario: v })} />
                <CampoNumero label="Imponibile" value={r.imponibile} onChange={v => aggiornaRiga(r.id, { imponibile: v })} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                <CampoNumero label="Aliquota IVA %" value={r.aliquota_iva} onChange={v => aggiornaRiga(r.id, { aliquota_iva: v })} />
                <CampoSelect label="Area" value={r.area} options={["", ...AREE_ORDINARIE]} onChange={v => aggiornaRiga(r.id, { area: v, centro_costo: "" })} />
                <CampoSelect label="Centro di Costo" value={r.centro_costo} options={["", ...centriPerArea(r.area)]} onChange={v => aggiornaRiga(r.id, { centro_costo: v })} />
                <CampoSelect label="Destinazione" value={r.destinazione} options={["", ...DESTINAZIONI]} onChange={v => aggiornaRiga(r.id, { destinazione: v })} />
                <CampoSelect label="Tipo di Costo" value={r.tipo_costo} options={["", "Fisso", "Variabile"]} onChange={v => aggiornaRiga(r.id, { tipo_costo: v })} />
                <button onClick={() => rimuoviRiga(r.id)} disabled={righe.length === 1}
                  style={{ background: "none", border: "none", cursor: righe.length === 1 ? "not-allowed" : "pointer", fontSize: 16, color: C.red, opacity: righe.length === 1 ? 0.3 : 1 }} title="Rimuovi riga">🗑️</button>
              </div>
            </div>
          ))}
          <button onClick={aggiungiRiga}
            style={{ background: "none", border: `1.5px dashed ${C.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", color: C.primary, marginBottom: 20 }}>
            + Aggiungi riga
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.primary + "10", borderRadius: 8, padding: "10px 16px" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Totale imponibile: {formattaEuro(totaleImponibile)}</div>
            <button onClick={salvaFattura} disabled={salvando}
              style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              {salvando ? "Salvataggio..." : "✓ Salva Fattura"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CampoTesto({ label, value, onChange }) {
  return (
    <label style={{ fontSize: 11, color: C.muted }}>
      {label}
      <input value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, marginTop: 2 }} />
    </label>
  );
}
function CampoNumero({ label, value, onChange }) {
  return (
    <label style={{ fontSize: 11, color: C.muted }}>
      {label}
      <input type="number" step="0.01" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, marginTop: 2 }} />
    </label>
  );
}
function CampoSelect({ label, value, options, onChange }) {
  return (
    <label style={{ fontSize: 11, color: C.muted }}>
      {label}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, marginTop: 2 }}>
        {options.map(o => <option key={o} value={o}>{o || "—"}</option>)}
      </select>
    </label>
  );
}
