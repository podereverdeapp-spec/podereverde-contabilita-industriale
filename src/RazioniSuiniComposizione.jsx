import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaNumero } from "./parsingUtils";

export default function RazioniSuini() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [categorie, setCategorie] = useState([]);
  const [prodottiPerCategoria, setProdottiPerCategoria] = useState({});
  const [bloccato, setBloccato] = useState(false);
  const [anniDisponibili, setAnniDisponibili] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [salvando, setSalvando] = useState(null);
  const [modificaProdotto, setModificaProdotto] = useState(null);
  const [nuovoProdotto, setNuovoProdotto] = useState({});
  const [mostraFormCategoria, setMostraFormCategoria] = useState(false);
  const [nuovaCategoria, setNuovaCategoria] = useState({
    categoria: "", tipo_animale: "", giorni_eta_da: "", giorni_eta_a: "", periodo_note: "",
    richiede_riproduttore: false, richiede_sesso: "", richiede_gravidanza_allattamento: false,
  });

  useEffect(() => { carica(); }, [anno]);

  async function carica() {
    setLoading(true);
    setErrore(null);
    try {
      const { data: cats, error: eC } = await supabase.from("ci_razioni_categorie").select("*").eq("specie", "suino").eq("anno", anno).order("ordine");
      if (eC) throw new Error(eC.message);

      const { data: tuttiAnni } = await supabase.from("ci_razioni_categorie").select("anno").eq("specie", "suino");
      const anniUnici = [...new Set((tuttiAnni || []).map(r => r.anno))].sort((a, b) => b - a);
      setAnniDisponibili(anniUnici);

      const { data: bloccoRow } = await supabase.from("ci_razioni_anni_bloccati").select("*").eq("specie", "suino").eq("anno", anno).maybeSingle();
      setBloccato(!!bloccoRow?.bloccato);

      let prods = [];
      if (cats && cats.length > 0) {
        const idCategorie = cats.map(c => c.id);
        const { data: p, error: eP } = await supabase.from("ci_razioni_prodotti").select("*").in("categoria_id", idCategorie).order("prodotto");
        if (eP) throw new Error(eP.message);
        prods = p || [];
      }
      const mappa = {};
      prods.forEach(p => {
        if (!mappa[p.categoria_id]) mappa[p.categoria_id] = [];
        mappa[p.categoria_id].push(p);
      });
      setCategorie(cats || []);
      setProdottiPerCategoria(mappa);
    } catch (err) {
      setErrore(err.message);
    }
    setLoading(false);
  }

  async function toggleBlocco() {
    const nuovoStato = !bloccato;
    if (nuovoStato && !window.confirm(`Bloccare le razioni Suini per il ${anno}? Da questo momento non saranno più modificabili finché non le sblocchi.`)) return;
    setSalvando("blocco");
    try {
      const { error } = await supabase.from("ci_razioni_anni_bloccati").upsert(
        [{ specie: "suino", anno, bloccato: nuovoStato, data_blocco: nuovoStato ? new Date().toISOString() : null }],
        { onConflict: "specie,anno" }
      );
      if (error) throw new Error(error.message);
      setBloccato(nuovoStato);
    } catch (err) {
      alert(`⚠️ Errore:\n\n${err.message}`);
    }
    setSalvando(null);
  }

  async function clonaDaAnnoPrecedente() {
    const annoOrigine = Math.max(...anniDisponibili.filter(a => a < anno));
    if (!isFinite(annoOrigine)) { alert("Nessun anno precedente da cui copiare."); return; }
    if (!window.confirm(`Copiare le razioni del ${annoOrigine} come punto di partenza per il ${anno}?`)) return;
    setSalvando("clona");
    try {
      const { data: catsOrigine, error: eC } = await supabase.from("ci_razioni_categorie").select("*").eq("specie", "suino").eq("anno", annoOrigine);
      if (eC) throw new Error(eC.message);
      for (const cat of catsOrigine || []) {
        const { id, created_at, anno: _a, ...catSenzaId } = cat;
        const { data: nuovaCat, error: eIns } = await supabase.from("ci_razioni_categorie").insert([{ ...catSenzaId, anno }]).select().single();
        if (eIns) throw new Error(eIns.message);
        const { data: prodOrigine } = await supabase.from("ci_razioni_prodotti").select("*").eq("categoria_id", id);
        for (const p of prodOrigine || []) {
          await supabase.from("ci_razioni_prodotti").insert([{ categoria_id: nuovaCat.id, prodotto: p.prodotto, kg_giorno: p.kg_giorno }]);
        }
      }
      await carica();
    } catch (err) {
      alert(`⚠️ Errore nella copia:\n\n${err.message}`);
    }
    setSalvando(null);
  }

  async function salvaKg(prodottoId, kgGiorno) {
    setSalvando(prodottoId);
    try {
      const { error } = await supabase.from("ci_razioni_prodotti").update({ kg_giorno: kgGiorno }).eq("id", prodottoId);
      if (error) throw new Error(error.message);
      await carica();
      setModificaProdotto(null);
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio:\n\n${err.message}`);
    }
    setSalvando(null);
  }

  async function eliminaProdotto(prodottoId) {
    if (!window.confirm("Eliminare questo prodotto dalla razione?")) return;
    setSalvando(prodottoId);
    try {
      const { error } = await supabase.from("ci_razioni_prodotti").delete().eq("id", prodottoId);
      if (error) throw new Error(error.message);
      await carica();
    } catch (err) {
      alert(`⚠️ Errore nell'eliminazione:\n\n${err.message}`);
    }
    setSalvando(null);
  }

  async function aggiungiProdotto(categoriaId) {
    const dati = nuovoProdotto[categoriaId];
    if (!dati?.nome || !dati?.kg) { alert("Inserisci nome prodotto e kg/giorno"); return; }
    setSalvando(`nuovo-${categoriaId}`);
    try {
      const { error } = await supabase.from("ci_razioni_prodotti").insert([{ categoria_id: categoriaId, prodotto: dati.nome, kg_giorno: parseFloat(dati.kg) }]);
      if (error) throw new Error(error.message);
      setNuovoProdotto(p => ({ ...p, [categoriaId]: { nome: "", kg: "" } }));
      await carica();
    } catch (err) {
      alert(`⚠️ Errore nell'aggiunta:\n\n${err.message}`);
    }
    setSalvando(null);
  }

  async function creaNuovaCategoria() {
    if (!nuovaCategoria.categoria.trim()) { alert("Il nome della categoria è obbligatorio"); return; }
    setSalvando("nuova-categoria");
    try {
      const ordineMax = categorie.length > 0 ? Math.max(...categorie.map(c => c.ordine || 0)) : 0;
      const { error } = await supabase.from("ci_razioni_categorie").insert([{
        specie: "suino", anno,
        categoria: nuovaCategoria.categoria.trim(),
        tipo_animale: nuovaCategoria.tipo_animale.trim() || null,
        giorni_eta_da: nuovaCategoria.giorni_eta_da !== "" ? parseInt(nuovaCategoria.giorni_eta_da) : null,
        giorni_eta_a: nuovaCategoria.giorni_eta_a !== "" ? parseInt(nuovaCategoria.giorni_eta_a) : null,
        periodo_note: nuovaCategoria.periodo_note.trim() || null,
        richiede_riproduttore: nuovaCategoria.richiede_riproduttore,
        richiede_sesso: nuovaCategoria.richiede_sesso || null,
        richiede_gravidanza_allattamento: nuovaCategoria.richiede_gravidanza_allattamento,
        ordine: ordineMax + 1,
      }]);
      if (error) throw new Error(error.message);
      setNuovaCategoria({ categoria: "", tipo_animale: "", giorni_eta_da: "", giorni_eta_a: "", periodo_note: "", richiede_riproduttore: false, richiede_sesso: "", richiede_gravidanza_allattamento: false });
      setMostraFormCategoria(false);
      await carica();
    } catch (err) {
      alert(`⚠️ Errore nella creazione della categoria:\n\n${err.message}`);
    }
    setSalvando(null);
  }

  function labelFasciaEta(cat) {
    if (cat.giorni_eta_da == null && cat.giorni_eta_a == null) return "—";
    if (cat.giorni_eta_a == null) return `oltre ${cat.giorni_eta_da} gg`;
    if (cat.giorni_eta_da == null) return `fino a ${cat.giorni_eta_a} gg`;
    return `da ${cat.giorni_eta_da} a ${cat.giorni_eta_a} gg`;
  }

  const esisteAnnoPrecedenteConDati = anniDisponibili.some(a => a < anno);

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Razioni → Suini → Composizione Razioni</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Razione giornaliera (kg/giorno) per categoria, per anno — le razioni possono cambiare di anno in anno. Modificabile finché l'anno non viene bloccato esplicitamente.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, color: C.muted }}>Anno:</label>
        <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
          style={{ width: 100, padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
        <button onClick={carica} disabled={loading}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "Caricamento..." : "Ricarica"}
        </button>
        {categorie.length > 0 && (
          <button onClick={toggleBlocco} disabled={salvando === "blocco"}
            style={{ background: bloccato ? C.yellow : C.muted, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {bloccato ? "🔓 Sblocca anno" : "🔒 Blocca anno"}
          </button>
        )}
        {categorie.length === 0 && esisteAnnoPrecedenteConDati && !loading && (
          <button onClick={clonaDaAnnoPrecedente} disabled={salvando === "clona"}
            style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {salvando === "clona" ? "Copia in corso..." : `📋 Copia le razioni dall'anno precedente`}
          </button>
        )}
      </div>
      {bloccato && (
        <div style={{ background: "#FFF2DC", border: `1px solid ${C.yellow}`, borderRadius: 8, padding: "8px 14px", fontSize: 12, color: C.text, marginBottom: 16 }}>
          🔒 Le razioni del {anno} sono bloccate — sola lettura. Sblocca se devi ancora correggerle.
        </div>
      )}

      {loading ? <p style={{ color: C.muted }}>Caricamento...</p> : errore ? (
        <p style={{ color: C.red }}>⚠️ {errore}</p>
      ) : (
        <>
          {categorie.length === 0 && (
            <p style={{ color: C.muted, fontSize: 13 }}>Nessuna razione per il {anno} — {esisteAnnoPrecedenteConDati ? "usa il pulsante sopra per copiarle dall'anno precedente, oppure" : ""} crea una categoria nuova qui sotto.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {categorie.map(cat => {
            const prodotti = prodottiPerCategoria[cat.id] || [];
            const totale = prodotti.reduce((s, p) => s + (p.kg_giorno || 0), 0);
            const nuovo = nuovoProdotto[cat.id] || { nome: "", kg: "" };
            return (
              <div key={cat.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ background: C.primary, color: "#fff", padding: "10px 14px" }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{cat.categoria}{cat.tipo_animale ? ` — ${cat.tipo_animale}` : ""}</div>
                  <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                    Fascia età: {labelFasciaEta(cat)} · {cat.periodo_note}
                    {cat.richiede_gravidanza_allattamento && " · si applica solo nella finestra -7/+45 giorni dal parto"}
                  </div>
                </div>
                <table style={{ width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: C.muted, textAlign: "left" }}>
                      <th style={{ padding: "6px 14px" }}>Prodotto</th>
                      <th style={{ padding: "6px 14px", textAlign: "right" }}>Kg/giorno</th>
                      <th style={{ padding: "6px 14px", width: 90 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {prodotti.map(p => (
                      <tr key={p.id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: "6px 14px" }}>{p.prodotto}</td>
                        <td style={{ padding: "6px 14px", textAlign: "right" }}>
                          {modificaProdotto?.id === p.id ? (
                            <input type="number" step="0.01" value={modificaProdotto.kg_giorno}
                              onChange={e => setModificaProdotto({ id: p.id, kg_giorno: e.target.value })}
                              style={{ width: 80, padding: "4px 6px", borderRadius: 6, border: `1.5px solid ${C.border}`, textAlign: "right" }} />
                          ) : formattaNumero(p.kg_giorno, 2)}
                        </td>
                        <td style={{ padding: "6px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {bloccato ? null : modificaProdotto?.id === p.id ? (
                            <button onClick={() => salvaKg(p.id, parseFloat(modificaProdotto.kg_giorno))} disabled={salvando === p.id}
                              style={{ background: C.green, color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>✓</button>
                          ) : (
                            <>
                              <button onClick={() => setModificaProdotto({ id: p.id, kg_giorno: p.kg_giorno })}
                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, marginRight: 8 }} title="Modifica">✏️</button>
                              <button onClick={() => eliminaProdotto(p.id)} disabled={salvando === p.id}
                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: C.red }} title="Elimina">🗑️</button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: `2px solid ${C.border}`, fontWeight: 700 }}>
                      <td style={{ padding: "6px 14px" }}>Totale</td>
                      <td style={{ padding: "6px 14px", textAlign: "right" }}>{formattaNumero(totale, 2)}</td>
                      <td></td>
                    </tr>
                    {!bloccato && (
                      <tr style={{ background: "#F7F7F5" }}>
                        <td style={{ padding: "6px 14px" }}>
                          <input placeholder="Nuovo prodotto..." value={nuovo.nome}
                            onChange={e => setNuovoProdotto(p => ({ ...p, [cat.id]: { ...nuovo, nome: e.target.value } }))}
                            style={{ width: "90%", padding: "4px 6px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12 }} />
                        </td>
                        <td style={{ padding: "6px 14px", textAlign: "right" }}>
                          <input type="number" step="0.01" placeholder="kg/gg" value={nuovo.kg}
                            onChange={e => setNuovoProdotto(p => ({ ...p, [cat.id]: { ...nuovo, kg: e.target.value } }))}
                            style={{ width: 70, padding: "4px 6px", borderRadius: 6, border: `1.5px solid ${C.border}`, textAlign: "right", fontSize: 12 }} />
                        </td>
                        <td style={{ padding: "6px 14px", textAlign: "right" }}>
                          <button onClick={() => aggiungiProdotto(cat.id)} disabled={salvando === `nuovo-${cat.id}`}
                            style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
                            + Aggiungi
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
          </div>

          {!bloccato && (
            <div style={{ background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12, marginTop: 16, padding: 14 }}>
              {!mostraFormCategoria ? (
                <button onClick={() => setMostraFormCategoria(true)}
                  style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  + Nuova categoria
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.primary }}>Nuova categoria per il {anno}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <label style={{ fontSize: 12, color: C.muted }}>Nome categoria*
                      <input value={nuovaCategoria.categoria} onChange={e => setNuovaCategoria(c => ({ ...c, categoria: e.target.value }))}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, marginTop: 3 }} />
                    </label>
                    <label style={{ fontSize: 12, color: C.muted }}>Tipo animale (nota descrittiva)
                      <input value={nuovaCategoria.tipo_animale} onChange={e => setNuovaCategoria(c => ({ ...c, tipo_animale: e.target.value }))}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, marginTop: 3 }} />
                    </label>
                    <label style={{ fontSize: 12, color: C.muted }}>Giorni età da
                      <input type="number" value={nuovaCategoria.giorni_eta_da} onChange={e => setNuovaCategoria(c => ({ ...c, giorni_eta_da: e.target.value }))}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, marginTop: 3 }} />
                    </label>
                    <label style={{ fontSize: 12, color: C.muted }}>Giorni età a (vuoto = "oltre")
                      <input type="number" value={nuovaCategoria.giorni_eta_a} onChange={e => setNuovaCategoria(c => ({ ...c, giorni_eta_a: e.target.value }))}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, marginTop: 3 }} />
                    </label>
                    <label style={{ fontSize: 12, color: C.muted, gridColumn: "1 / -1" }}>Periodo/note
                      <input value={nuovaCategoria.periodo_note} onChange={e => setNuovaCategoria(c => ({ ...c, periodo_note: e.target.value }))}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, marginTop: 3 }} />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                    <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="checkbox" checked={nuovaCategoria.richiede_riproduttore}
                        onChange={e => setNuovaCategoria(c => ({ ...c, richiede_riproduttore: e.target.checked }))} />
                      È una categoria riproduttiva (Riproduttore/Riproduttrice)
                    </label>
                    {nuovaCategoria.richiede_riproduttore && (
                      <>
                        <label style={{ fontSize: 12 }}>Sesso:
                          <select value={nuovaCategoria.richiede_sesso} onChange={e => setNuovaCategoria(c => ({ ...c, richiede_sesso: e.target.value }))}
                            style={{ marginLeft: 6, padding: "3px 6px", borderRadius: 6, border: `1.5px solid ${C.border}` }}>
                            <option value="">—</option>
                            <option value="M">Maschio (Riproduttore)</option>
                            <option value="F">Femmina (Riproduttrice)</option>
                          </select>
                        </label>
                        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                          <input type="checkbox" checked={nuovaCategoria.richiede_gravidanza_allattamento}
                            onChange={e => setNuovaCategoria(c => ({ ...c, richiede_gravidanza_allattamento: e.target.checked }))} />
                          Si applica solo nella finestra gravidanza/allattamento (-7/+45gg dal parto)
                        </label>
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button onClick={creaNuovaCategoria} disabled={salvando === "nuova-categoria"}
                      style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      {salvando === "nuova-categoria" ? "Salvataggio..." : "✓ Crea categoria"}
                    </button>
                    <button onClick={() => setMostraFormCategoria(false)}
                      style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>
                      Annulla
                    </button>
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, margin: "4px 0 0 0" }}>Dopo averla creata, aggiungi i prodotti (kg/giorno) dalla card che comparirà sopra.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
