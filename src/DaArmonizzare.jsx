import { useState, useEffect, Fragment } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { fetchAllPages } from "./parsingUtils";
import { RicomposizioneFattura } from "./FatturePassive";

// Centri di costo con quantità tracciate per i report — solo questi generano voci
// "Da Armonizzare"; gli altri centri di costo non hanno bisogno di unità armonizzate.
const CENTRI_CON_QUANTITA = ["Foraggio", "Mangimi", "Integratori alimentari", "Coltivazione Sementi", "Coltivazione Concimi e Fitosanitari", "Gasolio e lubrificanti"];

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

// Versione 275 (decisione del Dott. Bizzarri del 22/10/2026: «occorre avere la possibilità di cambiare»):
// scheda «Regole confermate», dove ogni regola si può modificare (unità e chili) o eliminare.
// Eliminata una regola, il prodotto torna tra quelli da armonizzare.
export default function DaArmonizzare() {
  const [daArmonizzare, setDaArmonizzare] = useState([]);
  const [regole, setRegole] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(null);
  const [vista, setVista] = useState("da");
  const [righePerRegola, setRighePerRegola] = useState(new Map());
  const [nomiFornitori, setNomiFornitori] = useState(new Map());

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
      setNomiFornitori(mappaFornitori);
      const conta = new Map();
      (righe || []).forEach(r => {
        const fornitoreId = mappaFattureFornitore.get(r.fattura_id);
        if (!fornitoreId) return;
        const k = `${fornitoreId}|${r.descrizione.trim().toLowerCase()}|${r.centro_costo || ""}`;
        conta.set(k, (conta.get(k) || 0) + 1);
      });
      setRighePerRegola(conta);

      const { data: regoleEsistenti, error: eG } = await supabase.from("ci_regole_armonizzazione_unita").select("*");
      if (eG) throw new Error(eG.message);
      setRegole(regoleEsistenti || []);
      // La chiave include il centro di costo: una regola confermata per lo stesso
      // fornitore+prodotto ma in un ALTRO centro di costo (es. Mangimi) non deve
      // "coprire" anche Foraggio — sono due armonizzazioni distinte, ciascuna con
      // il proprio fattore di conversione potenzialmente diverso.
      const chiaviConRegola = new Set((regoleEsistenti || []).filter(g => g.fattore_kg).map(g => `${g.fornitore_id}|${g.descrizione_prodotto.trim().toLowerCase()}|${g.centro_costo || ""}`));

      const combinazioni = new Map();
      (righe || []).forEach(r => {
        const fornitoreId = mappaFattureFornitore.get(r.fattura_id);
        if (!fornitoreId) return;
        const chiave = `${fornitoreId}|${r.descrizione.trim().toLowerCase()}|${r.centro_costo || ""}`;
        if (chiaviConRegola.has(chiave)) return;
        if (!combinazioni.has(chiave)) {
          combinazioni.set(chiave, { fornitore_id: fornitoreId, fornitore: mappaFornitori.get(fornitoreId) || "—", descrizione: r.descrizione, centro_costo: r.centro_costo, count: 0, occorrenze: [], unitaGrezza: r.unita_misura || null });
        }
        const combo = combinazioni.get(chiave);
        combo.count++;
        const f = mappaFattureDettaglio.get(r.fattura_id);
        combo.occorrenze.push({ fattura_id: r.fattura_id, numero: f?.numero, data: f?.data, quantita: r.quantita, unita_misura: r.unita_misura });
      });

      // Per ciascuna combinazione senza regola, cerco un suggerimento simile tra le regole
      // già confermate PER LO STESSO FORNITORE E STESSO CENTRO DI COSTO (un fattore di
      // conversione di Mangimi non ha senso suggerito per Foraggio, sono grandezze diverse)
      const risultato = [...combinazioni.values()].map(c => {
        const regolePariFornitore = (regoleEsistenti || []).filter(g => g.fornitore_id === c.fornitore_id && g.centro_costo === c.centro_costo);
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
      const { error } = await supabase.from("ci_regole_armonizzazione_unita").upsert([{
        fornitore_id: c.fornitore_id, descrizione_prodotto: c.descrizione,
        unita_confermata: unita, fattore_kg: fattoreKg, centro_costo: c.centro_costo,
      }], { onConflict: "fornitore_id,descrizione_prodotto,centro_costo" });
      if (error) throw new Error(error.message);
      carica();
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio della regola:\n\n${err.message}`);
    }
    setSalvando(null);
  }

  async function modificaRegola(g, unita, fattoreKg, righeUsate) {
    if (!(fattoreKg > 0)) { alert("Scrivere un numero di chili maggiore di zero."); return; }
    if (!window.confirm(`Cambiare la regola di «${g.descrizione_prodotto}» (${nomiFornitori.get(g.fornitore_id) || "fornitore"}, ${g.centro_costo || "senza centro di costo"})?\n\nPrima: ${g.unita_confermata || "—"}, ${g.fattore_kg ?? "—"} kg per unità\nDopo: ${unita}, ${fattoreKg} kg per unità\n\nCambiano i chili di ${righeUsate} righe di fattura, già caricate e future.`)) return false;
    setSalvando(`regola|${g.id}`);
    try {
      const { data, error } = await supabase.from("ci_regole_armonizzazione_unita").update({ unita_confermata: unita, fattore_kg: fattoreKg }).eq("id", g.id).select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length !== 1) throw new Error("La regola non c'è più: ricaricare la pagina.");
      await carica();
    } catch (err) { alert(`⚠️ Errore nella modifica della regola:\n\n${err.message}`); setSalvando(null); return false; }
    setSalvando(null);
    return true;
  }

  async function eliminaRegola(g, righeUsate) {
    if (!window.confirm(`Eliminare la regola di «${g.descrizione_prodotto}» (${nomiFornitori.get(g.fornitore_id) || "fornitore"}, ${g.centro_costo || "senza centro di costo"})?\n\nLe ${righeUsate} righe di fattura di questo prodotto escono dai chili finché non si conferma di nuovo l'unità: il prodotto torna tra quelli da armonizzare.`)) return;
    setSalvando(`regola|${g.id}`);
    try {
      const { error } = await supabase.from("ci_regole_armonizzazione_unita").delete().eq("id", g.id);
      if (error) throw new Error(error.message);
      await carica();
    } catch (err) { alert(`⚠️ Errore nell'eliminazione della regola:\n\n${err.message}`); }
    setSalvando(null);
  }

  const bottoneVista = attivo => ({ background: attivo ? C.primary : "transparent", color: attivo ? "#fff" : C.primary, border: `1.5px solid ${C.primary}`, borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" });

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Da Armonizzare</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Prodotti nei centri di costo con quantità tracciate (Foraggio, Mangimi, Coltivazione Sementi, Coltivazione Concimi e Fitosanitari, Gasolio e lubrificanti) per cui non è ancora confermata l'unità di misura — necessaria per i report di quantità. Una volta confermata una regola qui, si applica automaticamente a tutte le fatture future dello stesso fornitore e prodotto.
      </p>

      {!loading && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          <button onClick={() => setVista("da")} style={bottoneVista(vista === "da")}>Da armonizzare ({daArmonizzare.length})</button>
          <button onClick={() => setVista("regole")} style={bottoneVista(vista === "regole")}>Regole confermate ({regole.length})</button>
        </div>
      )}
      {loading ? <p style={{ color: C.muted }}>Caricamento...</p> : vista === "regole" ? (
        <ElencoRegole regole={regole} nomiFornitori={nomiFornitori} righePerRegola={righePerRegola} salvando={salvando}
          onModifica={modificaRegola} onElimina={eliminaRegola} />
      ) : (
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
  // Se la fattura ha già un'unità grezza riconosciuta (es. "Tons", anche se scritta
  // "TONS" o "tons" — l'estrazione PDF non garantisce sempre la maiuscola esatta),
  // parte già selezionata — un clic in meno invece di dover sempre ripartire da
  // "Kilogrammi" e cambiarla a mano
  const matchInsensibile = UNITA_OPZIONI.find(u => u.toLowerCase() === (c.unitaGrezza || "").toLowerCase());
  const unitaIniziale = matchInsensibile || "Kilogrammi";
  const [unita, setUnita] = useState(unitaIniziale);
  const [fattoreManuale, setFattoreManuale] = useState("");
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
        {(unita === "Unità" || unita === "Litri") && (
          <input type="number" placeholder="Fattore kg (es. 340)" value={fattoreManuale}
            onChange={e => setFattoreManuale(e.target.value)}
            style={{ padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, width: 190 }} />
        )}
        <button onClick={() => onConferma(c, unita, (unita === "Unità" || unita === "Litri") ? parseFloat(fattoreManuale) : FATTORE_KG[unita])}
          disabled={salvando || ((unita === "Unità" || unita === "Litri") && !(parseFloat(fattoreManuale) > 0))}
          title={(unita === "Unità" || unita === "Litri") && !(parseFloat(fattoreManuale) > 0) ? "Inserisci un fattore di conversione in kg valido prima di confermare" : undefined}
          style={{
            background: (unita === "Unità" || unita === "Litri") && !(parseFloat(fattoreManuale) > 0) ? C.muted : C.primary,
            color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700,
            cursor: salvando || ((unita === "Unità" || unita === "Litri") && !(parseFloat(fattoreManuale) > 0)) ? "not-allowed" : "pointer",
          }}>
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

// Elenco delle regole confermate, con modifica ed eliminazione (versione 275)
function ElencoRegole({ regole, nomiFornitori, righePerRegola, salvando, onModifica, onElimina }) {
  const [filtro, setFiltro] = useState("");
  const [inModifica, setInModifica] = useState(null);
  const f = filtro.trim().toLowerCase();
  const chiave = g => `${g.fornitore_id}|${(g.descrizione_prodotto || "").trim().toLowerCase()}|${g.centro_costo || ""}`;
  const elenco = regole
    .map(g => ({ g, fornitore: nomiFornitori.get(g.fornitore_id) || "—", righe: righePerRegola.get(chiave(g)) || 0 }))
    .filter(x => !f || `${x.fornitore} ${x.g.descrizione_prodotto} ${x.g.centro_costo || ""} ${x.g.unita_confermata || ""}`.toLowerCase().includes(f))
    .sort((a, b) => a.fornitore.localeCompare(b.fornitore) || (a.g.descrizione_prodotto || "").localeCompare(b.g.descrizione_prodotto || ""));
  const th = { padding: "6px 8px", textAlign: "left", color: C.muted, fontSize: 12, borderBottom: `1px solid ${C.border}` };
  const td = { padding: "6px 8px", fontSize: 12.5, borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
  return (
    <div>
      <p style={{ color: C.muted, fontSize: 13, marginTop: 0 }}>
        Ogni regola dice quanti chili vale una unità della quantità scritta nelle fatture di quel prodotto, di quel fornitore e in quel centro di costo.
        Una modifica cambia i chili di tutte le righe di fattura del prodotto, già caricate e future. Eliminando una regola il prodotto torna tra quelli da armonizzare.
      </p>
      <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Cerca per fornitore, prodotto, centro di costo o unità"
        style={{ padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, width: 380, marginBottom: 10 }} />
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{elenco.length} regole</div>
      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>Fornitore</th><th style={th}>Prodotto</th><th style={th}>Centro di costo</th><th style={th}>Unità</th><th style={{ ...th, textAlign: "right" }}>Kg per unità</th><th style={{ ...th, textAlign: "right" }}>Righe di fattura</th><th style={th}></th></tr></thead>
          <tbody>
            {elenco.map(({ g, fornitore, righe }) => inModifica === g.id
              ? <RigaRegolaModifica key={g.id} g={g} fornitore={fornitore} righe={righe} td={td} salvando={salvando === `regola|${g.id}`}
                  onSalva={async (u, k) => { if (await onModifica(g, u, k, righe)) setInModifica(null); }} onAnnulla={() => setInModifica(null)} />
              : (
                <tr key={g.id}>
                  <td style={td}>{fornitore}</td>
                  <td style={td}>{g.descrizione_prodotto}</td>
                  <td style={td}>{g.centro_costo || "—"}</td>
                  <td style={td}>{g.unita_confermata || "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{g.fattore_kg != null ? Number(g.fattore_kg).toLocaleString("it-IT") : "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{righe}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <button onClick={() => setInModifica(g.id)} disabled={!!salvando}
                      style={{ background: "none", border: `1px solid ${C.blue}`, color: C.blue, borderRadius: 6, padding: "3px 9px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", marginRight: 6 }}>✏️ Modifica</button>
                    <button onClick={() => onElimina(g, righe)} disabled={!!salvando}
                      style={{ background: "none", border: `1px solid ${C.red}`, color: C.red, borderRadius: 6, padding: "3px 9px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>🗑 Elimina</button>
                  </td>
                </tr>
              ))}
            {elenco.length === 0 && <tr><td colSpan={7} style={{ ...td, color: C.muted }}>Nessuna regola.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RigaRegolaModifica({ g, fornitore, righe, td, salvando, onSalva, onAnnulla }) {
  const iniziale = UNITA_OPZIONI.includes(g.unita_confermata) ? g.unita_confermata : "Unità";
  const [unita, setUnita] = useState(iniziale);
  const [fattore, setFattore] = useState(g.fattore_kg != null ? String(g.fattore_kg) : "");
  const manuale = unita === "Unità" || unita === "Litri";
  const kg = manuale ? parseFloat(String(fattore).replace(",", ".")) : FATTORE_KG[unita];
  return (
    <tr style={{ background: "#F4F8F5" }}>
      <td style={td}>{fornitore}</td>
      <td style={td}>{g.descrizione_prodotto}</td>
      <td style={td}>{g.centro_costo || "—"}</td>
      <td style={td}>
        <select value={unita} onChange={e => setUnita(e.target.value)} style={{ padding: "4px 6px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12.5 }}>
          {UNITA_OPZIONI.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </td>
      <td style={{ ...td, textAlign: "right" }}>
        {manuale
          ? <input type="number" value={fattore} onChange={e => setFattore(e.target.value)} placeholder="kg" style={{ width: 90, padding: "4px 6px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12.5 }} />
          : Number(FATTORE_KG[unita]).toLocaleString("it-IT")}
      </td>
      <td style={{ ...td, textAlign: "right" }}>{righe}</td>
      <td style={{ ...td, whiteSpace: "nowrap" }}>
        <button onClick={() => onSalva(unita, kg)} disabled={salvando || !(kg > 0)}
          style={{ background: kg > 0 ? C.primary : C.muted, color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, cursor: kg > 0 ? "pointer" : "not-allowed", marginRight: 6 }}>
          {salvando ? "Salvataggio…" : "✓ Salva"}
        </button>
        <button onClick={onAnnulla} disabled={salvando}
          style={{ background: "none", border: `1px solid ${C.muted}`, color: C.muted, borderRadius: 6, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Annulla</button>
      </td>
    </tr>
  );
}
