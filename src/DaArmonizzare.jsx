import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { fetchAllPages } from "./parsingUtils";

// Centri di costo con quantità tracciate per i report — solo questi generano voci
// "Da Armonizzare"; gli altri centri di costo non hanno bisogno di unità armonizzate.
const CENTRI_CON_QUANTITA = ["Foraggio", "Mangimi", "Coltivazione Sementi", "Coltivazione Concimi e Fitosanitari", "Gasolio e lubrificanti"];

const UNITA_OPZIONI = ["Kilogrammi", "Tons", "Quintali", "Litri", "Unità"];
const FATTORE_KG = { Kilogrammi: 1, Tons: 1000, Quintali: 100, Litri: null, Unità: null };

// Similarità testuale semplice (Jaccard su parole) — solo un SUGGERIMENTO da confermare
// a mano, mai applicata automaticamente.
function similarita(a, b) {
  const parole = s => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length > 2));
  const pa = parole(a), pb = parole(b);
  const intersezione = [...pa].filter(w => pb.has(w)).length;
  const unione = new Set([...pa, ...pb]).size;
  return unione === 0 ? 0 : intersezione / unione;
}

export default function DaArmonizzare() {
  const [daArmonizzare, setDaArmonizzare] = useState([]);
  const [regole, setRegole] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(null);

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    try {
      const { data: righe, error: eR } = await fetchAllPages((da, a) => supabase
        .from("ci_articoli_fattura").select("descrizione, fattura_id, centro_costo").in("centro_costo", CENTRI_CON_QUANTITA).range(da, a));
      if (eR) throw new Error(eR.message);

      const idFatture = [...new Set((righe || []).map(r => r.fattura_id))];
      const { data: fatture } = await fetchAllPages((da, a) => supabase.from("ci_fatture").select("id, fornitore_id").in("id", idFatture).range(da, a));
      const mappaFattureFornitore = new Map((fatture || []).map(f => [f.id, f.fornitore_id]));

      const { data: fornitori } = await supabase.from("ci_fornitori").select("id, nome");
      const mappaFornitori = new Map((fornitori || []).map(f => [f.id, f.nome]));

      const { data: regoleEsistenti, error: eG } = await supabase.from("ci_regole_armonizzazione_unita").select("*");
      if (eG) throw new Error(eG.message);
      setRegole(regoleEsistenti || []);
      const chiaviConRegola = new Set((regoleEsistenti || []).map(g => `${g.fornitore_id}|${g.descrizione_prodotto.trim().toLowerCase()}`));

      const combinazioni = new Map();
      (righe || []).forEach(r => {
        const fornitoreId = mappaFattureFornitore.get(r.fattura_id);
        if (!fornitoreId) return;
        const chiave = `${fornitoreId}|${r.descrizione.trim().toLowerCase()}`;
        if (chiaviConRegola.has(chiave)) return;
        if (!combinazioni.has(chiave)) {
          combinazioni.set(chiave, { fornitore_id: fornitoreId, fornitore: mappaFornitori.get(fornitoreId) || "—", descrizione: r.descrizione, centro_costo: r.centro_costo, count: 0 });
        }
        combinazioni.get(chiave).count++;
      });

      // Per ciascuna combinazione senza regola, cerco un suggerimento simile tra le regole
      // già confermate PER LO STESSO FORNITORE
      const risultato = [...combinazioni.values()].map(c => {
        const regolePariFornitore = (regoleEsistenti || []).filter(g => g.fornitore_id === c.fornitore_id);
        let suggerimento = null, miglioreScore = 0.4; // soglia minima per proporre un suggerimento
        regolePariFornitore.forEach(g => {
          const score = similarita(c.descrizione, g.descrizione_prodotto);
          if (score > miglioreScore) { miglioreScore = score; suggerimento = g; }
        });
        return { ...c, suggerimento };
      });
      risultato.sort((a, b) => b.count - a.count);
      setDaArmonizzare(risultato);
    } catch (err) {
      alert(`⚠️ Errore nel caricamento:\n\n${err.message}`);
    }
    setLoading(false);
  }

  async function confermaRegola(c, unita, fattoreKg) {
    setSalvando(`${c.fornitore_id}|${c.descrizione}`);
    try {
      const { error } = await supabase.from("ci_regole_armonizzazione_unita").insert([{
        fornitore_id: c.fornitore_id, descrizione_prodotto: c.descrizione,
        unita_confermata: unita, fattore_kg: fattoreKg, centro_costo: c.centro_costo,
      }]);
      if (error) throw new Error(error.message);
      carica();
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio della regola:\n\n${err.message}`);
    }
    setSalvando(null);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Da Armonizzare</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Prodotti nei centri di costo con quantità tracciate (Foraggio, Mangimi, Coltivazione Sementi, Coltivazione Concimi e Fitosanitari, Gasolio e lubrificanti) per cui non è ancora confermata l'unità di misura — necessaria per i report di quantità. Una volta confermata una regola qui, si applica automaticamente a tutte le fatture future dello stesso fornitore e prodotto.
      </p>

      {loading ? <p style={{ color: C.muted }}>Caricamento...</p> : (
        <>
          <p style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>{daArmonizzare.length} prodotti da armonizzare</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {daArmonizzare.map(c => (
              <RigaArmonizza key={`${c.fornitore_id}|${c.descrizione}`} c={c} onConferma={confermaRegola}
                salvando={salvando === `${c.fornitore_id}|${c.descrizione}`} />
            ))}
            {daArmonizzare.length === 0 && <p style={{ color: C.muted }}>Nessun prodotto in attesa — tutto armonizzato.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function RigaArmonizza({ c, onConferma, salvando }) {
  const [unita, setUnita] = useState("Kilogrammi");

  return (
    <div style={{ background: "#FFF7E6", border: `1.5px solid ${C.yellow}`, borderRadius: 10, padding: 14 }}>
      <div style={{ fontWeight: 700 }}>{c.fornitore} — {c.descrizione}</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
        Centro di costo: {c.centro_costo} · comparso in {c.count} righe fattura, mai con un'unità confermata.
      </div>
      <div style={{ fontSize: 12, color: "#8B6F00", fontWeight: 700, marginBottom: 8 }}>
        ⚖️ Nessuna regola trovata per questo fornitore/prodotto — scegli qui sotto l'unità di misura corretta (controllando una fattura reale, se necessario) per includerlo nei report di quantità.
      </div>
      {c.suggerimento && (
        <div style={{ fontSize: 12, background: "#EAF2E8", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>
          💡 Suggerimento: per lo stesso fornitore, "<strong>{c.suggerimento.descrizione_prodotto}</strong>" è già confermato come <strong>{c.suggerimento.unita_confermata}</strong> — potrebbe essere lo stesso prodotto scritto in modo leggermente diverso. Verifica prima di confermare.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={unita} onChange={e => setUnita(e.target.value)}
          style={{ padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
          {UNITA_OPZIONI.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <button onClick={() => onConferma(c, unita, FATTORE_KG[unita])} disabled={salvando}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {salvando ? "Salvataggio..." : "✓ Conferma unità"}
        </button>
        {c.suggerimento && (
          <button onClick={() => onConferma(c, c.suggerimento.unita_confermata, c.suggerimento.fattore_kg)} disabled={salvando}
            style={{ background: "none", border: `1.5px solid ${C.green}`, color: C.green, borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Usa {c.suggerimento.unita_confermata} (come suggerito)
          </button>
        )}
      </div>
    </div>
  );
}
