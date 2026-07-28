import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaNumero } from "./parsingUtils";

export default function RazioniSuini() {
  const [categorie, setCategorie] = useState([]);
  const [prodottiPerCategoria, setProdottiPerCategoria] = useState({});
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [salvando, setSalvando] = useState(null);
  const [modificaProdotto, setModificaProdotto] = useState(null); // { id, kg_giorno }
  const [nuovoProdotto, setNuovoProdotto] = useState({}); // { [categoriaId]: { nome, kg } }

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    setErrore(null);
    try {
      const { data: cats, error: eC } = await supabase.from("ci_razioni_categorie").select("*").eq("specie", "suino").order("ordine");
      if (eC) throw new Error(eC.message);
      const { data: prods, error: eP } = await supabase.from("ci_razioni_prodotti").select("*").order("prodotto");
      if (eP) throw new Error(eP.message);
      const mappa = {};
      (prods || []).forEach(p => {
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

  function labelFasciaEta(cat) {
    if (cat.giorni_eta_da == null && cat.giorni_eta_a == null) return "—";
    if (cat.giorni_eta_a == null) return `oltre ${cat.giorni_eta_da} gg`;
    if (cat.giorni_eta_da == null) return `fino a ${cat.giorni_eta_a} gg`;
    return `da ${cat.giorni_eta_da} a ${cat.giorni_eta_a} gg`;
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Razioni — Suini</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Razione giornaliera (kg/giorno) per categoria — modificabile: cambia la quantità di un prodotto esistente, o aggiungine uno nuovo a una categoria. Verrà usata per calcolare il consumo teorico complessivo da confrontare con gli acquisti reali.
      </p>

      {loading ? <p style={{ color: C.muted }}>Caricamento...</p> : errore ? (
        <p style={{ color: C.red }}>⚠️ {errore}</p>
      ) : (
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
                          {modificaProdotto?.id === p.id ? (
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
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
