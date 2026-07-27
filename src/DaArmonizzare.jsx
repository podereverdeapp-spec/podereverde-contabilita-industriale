import { useState, useEffect, Fragment } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { fetchAllPages } from "./parsingUtils";
import { RicomposizioneFattura } from "./FatturePassive";

// Centri di costo con quantità tracciate per i report — solo questi generano voci
// "Da Armonizzare"; gli altri centri di costo non hanno bisogno di unità armonizzate.
const CENTRI_CON_QUANTITA = ["Foraggio", "Mangimi", "Coltivazione Sementi", "Coltivazione Concimi e Fitosanitari", "Gasolio e lubrificanti"];

const UNITA_OPZIONI = ["Kilogrammi", "Tons", "Quintali", "Litri", "Unità", "Rotoballe", "Balle", "Balloni", "Rotoloni"];
const FATTORE_KG = { Kilogrammi: 1, Tons: 1000, Quintali: 100, Litri: null, Unità: null, Rotoballe: 340, Balle: 340, Balloni: 340, Rotoloni: 340 };

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
        .from("ci_articoli_fattura").select("descrizione, fattura_id, centro_costo, quantita, unita_misura").in("centro_costo", CENTRI_CON_QUANTITA).range(da, a));
      if (eR) throw new Error(eR.message);

      const idFatture = [...new Set((righe || []).map(r => r.fattura_id))];
      const { data: fatture } = await fetchAllPages((da, a) => supabase.from("ci_fatture").select("id, fornitore_id, numero, data").in("id", idFatture).range(da, a));
      const mappaFattureFornitore = new Map((fatture || []).map(f => [f.id, f.fornitore_id]));
      const mappaFattureDettaglio = new Map((fatture || []).map(f => [f.id, f]));

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
          combinazioni.set(chiave, { fornitore_id: fornitoreId, fornitore: mappaFornitori.get(fornitoreId) || "—", descrizione: r.descrizione, centro_costo: r.centro_costo, count: 0, occorrenze: [] });
        }
        const combo = combinazioni.get(chiave);
        combo.count++;
        const f = mappaFattureDettaglio.get(r.fattura_id);
        combo.occorrenze.push({ fattura_id: r.fattura_id, numero: f?.numero, data: f?.data, quantita: r.quantita, unita_misura: r.unita_misura });
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
  const [espansa, setEspansa] = useState(false);
  const [fatturaAperta, setFatturaAperta] = useState(null); // fattura_id in visualizzazione completa
  const [datiFatturaAperta, setDatiFatturaAperta] = useState(null); // { fattura, righe }
  const [caricandoFattura, setCaricandoFattura] = useState(false);

  async function apriFattura(fatturaId) {
    if (fatturaAperta === fatturaId) { setFatturaAperta(null); return; }
    setFatturaAperta(fatturaId);
    setCaricandoFattura(true);
    try {
      const { data: fattura, error: eF } = await supabase.from("ci_fatture").select("*, ci_fornitori(nome), ci_clienti(nome)").eq("id", fatturaId).single();
      if (eF) throw new Error(eF.message);
      const { data: righe, error: eR } = await supabase.from("ci_articoli_fattura").select("*").eq("fattura_id", fatturaId).order("id");
      if (eR) throw new Error(eR.message);
      setDatiFatturaAperta({ fattura, righe: (righe || []).map(r => ({ ...r, quantita: parseFloat(r.quantita), prezzo_unitario: parseFloat(r.prezzo_unitario), totale_riga: parseFloat(r.totale_riga), aliquota_iva: parseFloat(r.aliquota_iva), totale_iva: parseFloat(r.totale_iva) })) });
    } catch (err) {
      alert(`⚠️ Errore nell'apertura della fattura:\n\n${err.message}`);
    }
    setCaricandoFattura(false);
  }

  return (
    <div style={{ background: "#FFF7E6", border: `1.5px solid ${C.yellow}`, borderRadius: 10, padding: 14 }}>
      <div style={{ fontWeight: 700 }}>{c.fornitore} — {c.descrizione}</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
        Centro di costo: {c.centro_costo} · comparso in {c.count} righe fattura, mai con un'unità confermata.
        {" "}
        <button onClick={() => setEspansa(e => !e)}
          style={{ background: "none", border: "none", color: C.blue, textDecoration: "underline", cursor: "pointer", fontSize: 12, padding: 0 }}>
          {espansa ? "▲ nascondi fatture" : "▼ vedi le fatture"}
        </button>
      </div>
      {espansa && (
        <div style={{ background: "#fff", borderRadius: 8, padding: "8px 12px", marginBottom: 8, fontSize: 12 }}>
          <table style={{ width: "100%" }}>
            <thead>
              <tr style={{ color: C.muted, textAlign: "left" }}>
                <th style={{ padding: "3px 6px" }}>Fattura n.</th><th style={{ padding: "3px 6px" }}>Data</th>
                <th style={{ padding: "3px 6px", textAlign: "right" }}>Quantità</th><th style={{ padding: "3px 6px" }}>Unità scritta in fattura</th><th></th>
              </tr>
            </thead>
            <tbody>
              {c.occorrenze.map((o, i) => (
                <Fragment key={i}>
                  <tr style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "3px 6px" }}>{o.numero}</td>
                    <td style={{ padding: "3px 6px" }}>{o.data}</td>
                    <td style={{ padding: "3px 6px", textAlign: "right" }}>{o.quantita}</td>
                    <td style={{ padding: "3px 6px" }}>{o.unita_misura || <em style={{ color: C.muted }}>(vuota)</em>}</td>
                    <td style={{ padding: "3px 6px" }}>
                      <button onClick={() => apriFattura(o.fattura_id)}
                        style={{ background: "none", border: `1px solid ${C.blue}`, color: C.blue, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        {fatturaAperta === o.fattura_id ? "▲ chiudi" : "📄 apri fattura"}
                      </button>
                    </td>
                  </tr>
                  {fatturaAperta === o.fattura_id && (
                    <tr>
                      <td colSpan={5} style={{ padding: 0, background: "#FAFAF8" }}>
                        {caricandoFattura ? (
                          <div style={{ padding: 12, color: C.muted }}>Caricamento...</div>
                        ) : datiFatturaAperta && (
                          <RicomposizioneFattura fattura={datiFatturaAperta.fattura} righe={datiFatturaAperta.righe} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 12, color: "#8B6F00", fontWeight: 700, marginBottom: 8 }}>
        ⚖️ Nessuna regola trovata per questo fornitore/prodotto — scegli qui sotto l'unità di misura corretta (controllando le fatture qui sopra, se necessario) per includerlo nei report di quantità.
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
