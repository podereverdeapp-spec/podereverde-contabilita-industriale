import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, round2 } from "./parsingUtils";

const CATEGORIE_AMMORTAMENTO = [
  "3 - Attrezzatura specifica",
  "3 - Costruzioni leggere",
  "5 - Macchinari, apparecchi e attrezzature varie",
  "5 b - Macchinari, apparecchi e attrezzature varie extra allevamento",
  "6 - Spese atti notarili",
  "7 - Animali non oggetto di allevamento",
  "15 - Autovetture, motoveicoli e simili",
  "30 – Avviamento",
  "31 - Spese di costituzione e trasformazione",
  "34 - Altri oneri pluriennali",
];

export default function Cespiti() {
  const [cespiti, setCespiti] = useState([]);
  const [ammortamentiPerCespite, setAmmortamentiPerCespite] = useState({});
  const [loading, setLoading] = useState(true);
  const [espanso, setEspanso] = useState(null);
  const [cerca, setCerca] = useState("");
  const [nuovo, setNuovo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [generandoQuote, setGenerandoQuote] = useState(false);
  const [annoGenerazione, setAnnoGenerazione] = useState(new Date().getFullYear());
  const [fornitori, setFornitori] = useState([]);
  const [modificaId, setModificaId] = useState(null);
  const [formModifica, setFormModifica] = useState(null);
  const [salvandoModifica, setSalvandoModifica] = useState(false);

  useEffect(() => { carica(); caricaFornitori(); }, []);
  async function caricaFornitori() {
    const { data } = await supabase.from("ci_fornitori").select("id, nome").order("nome");
    setFornitori(data || []);
  }

  async function carica() {
    setLoading(true);
    const { data, error } = await supabase.from("ci_cespiti").select("*, ci_fornitori(nome), ci_fatture(numero, data)").order("data_acquisto", { ascending: false });
    if (error) alert(`⚠️ Errore nel caricamento cespiti:\n\n${error.message}`);
    else setCespiti(numerizzaCampi(data || [], ["costo_acquisto", "anni_ammortamento"]));
    setLoading(false);
  }

  function iniziaModifica(c) {
    setModificaId(c.id);
    setFormModifica({
      categoria: c.categoria || "",
      specieSelezionata: c.specie?.[0] || "",
      coefficientePct: c.anni_ammortamento ? round2(100 / c.anni_ammortamento) : "",
      data_acquisto: c.data_acquisto || "",
      fornitore_id: c.fornitore_id || "",
    });
  }

  function annullaModifica() {
    setModificaId(null);
    setFormModifica(null);
  }

  async function salvaModifica(cespiteId) {
    if (!window.confirm("Confermi le modifiche a questo cespite? L'aggiornamento della categoria/imputazione/coefficiente non ricalcola automaticamente le quote già generate per gli anni passati — se necessario, rilancia \"Genera Quote\" dopo.")) return;
    setSalvandoModifica(true);
    try {
      const coeff = parseFloat(formModifica.coefficientePct);
      const nuoviAnni = coeff > 0 ? Math.round(100 / coeff) : null;
      const mappaSpecie = { "Bovini": ["Bovini"], "Suini": ["Suini"], "Ovini": ["Ovini"], "Generali": ["Generale"], "Nessuno": [] };
      const { error } = await supabase.from("ci_cespiti").update({
        categoria: formModifica.categoria || null,
        specie: mappaSpecie[formModifica.specieSelezionata] ?? [],
        anni_ammortamento: nuoviAnni || 5,
        data_acquisto: formModifica.data_acquisto || null,
        fornitore_id: formModifica.fornitore_id || null,
        updated_at: new Date().toISOString(),
      }).eq("id", cespiteId);
      if (error) throw new Error(error.message);
      setModificaId(null);
      setFormModifica(null);
      carica();
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio:\n\n${err.message}`);
    }
    setSalvandoModifica(false);
  }

  async function espandi(cespiteId) {
    if (espanso === cespiteId) { setEspanso(null); return; }
    setEspanso(cespiteId);
    if (!ammortamentiPerCespite[cespiteId]) {
      const { data, error } = await supabase.from("ci_cespiti_ammortamento").select("*").eq("cespite_id", cespiteId).order("anno");
      if (error) { alert(`⚠️ Errore nel caricamento del piano di ammortamento:\n\n${error.message}`); return; }
      setAmmortamentiPerCespite(prev => ({ ...prev, [cespiteId]: numerizzaCampi(data || [], ["quota", "fondo_ammortamento_fine"]) }));
    }
  }

  async function salvaNuovo() {
    if (!nuovo.descrizione?.trim()) { alert("La descrizione è obbligatoria."); return; }
    if (!nuovo.data_acquisto) { alert("La data di acquisto è obbligatoria."); return; }
    if (!nuovo.costo_acquisto) { alert("Il costo di acquisto è obbligatorio."); return; }
    setSalvando(true);
    const { error } = await supabase.from("ci_cespiti").insert([{
      descrizione: nuovo.descrizione.trim(),
      categoria: nuovo.categoria || null,
      data_acquisto: nuovo.data_acquisto,
      costo_acquisto: parseFloat(nuovo.costo_acquisto),
      anni_ammortamento: parseInt(nuovo.anni_ammortamento) || 5,
      specie: nuovo.specie ? [nuovo.specie] : ["GENERALE"],
      note: nuovo.note || null,
    }]);
    setSalvando(false);
    if (error) { alert(`⚠️ Errore nel salvataggio:\n\n${error.message}`); return; }
    setNuovo(null);
    carica();
  }

  // Genera (o ricalcola) la quota di ammortamento per l'anno scelto, per tutti i cespiti attivi
  async function generaQuote() {
    const anno = parseInt(annoGenerazione);
    if (!anno) { alert("Anno non valido."); return; }
    if (!window.confirm(`Generare/ricalcolare le quote di ammortamento per l'anno ${anno}, per tutti i cespiti attivi?`)) return;

    setGenerandoQuote(true);
    let generate = 0, saltati = 0;
    try {
      for (const c of cespiti) {
        if (!c.attivo && c.attivo !== undefined) { saltati++; continue; }
        const annoAcquisto = new Date(c.data_acquisto).getFullYear();
        const indiceAnno = anno - annoAcquisto; // 0 = primo anno di ammortamento
        if (indiceAnno < 0 || indiceAnno >= c.anni_ammortamento) { saltati++; continue; }

        const quotaAnnua = round2(c.costo_acquisto / c.anni_ammortamento);
        const fondoTeorico = round2(Math.min(quotaAnnua * (indiceAnno + 1), c.costo_acquisto));
        // Quota di QUESTO anno = differenza rispetto al fondo dell'anno precedente (se già generato),
        // altrimenti quota teorica piena per l'anno.
        const { data: precedente } = await supabase
          .from("ci_cespiti_ammortamento").select("fondo_ammortamento_fine")
          .eq("cespite_id", c.id).eq("anno", anno - 1).maybeSingle();
        const fondoPrecedente = precedente ? parseFloat(precedente.fondo_ammortamento_fine) : round2(quotaAnnua * indiceAnno);
        const quotaAnno = round2(fondoTeorico - fondoPrecedente);

        const { error } = await supabase.from("ci_cespiti_ammortamento")
          .upsert([{ cespite_id: c.id, anno, quota: quotaAnno, fondo_ammortamento_fine: fondoTeorico }], { onConflict: "cespite_id,anno" });
        if (error) throw new Error(`Errore sul cespite "${c.descrizione}": ${error.message}`);
        generate++;
      }
      alert(`✓ Quote generate per ${generate} cespiti (${saltati} saltati perché non attivi in quell'anno o già completamente ammortizzati).`);
      setAmmortamentiPerCespite({});
    } catch (err) {
      alert(`⚠️ Errore durante la generazione:\n\n${err.message}`);
    }
    setGenerandoQuote(false);
  }

  const filtrati = useMemo(() => {
    if (!cerca.trim()) return cespiti;
    const q = cerca.trim().toLowerCase();
    return cespiti.filter(c => `${c.descrizione} ${c.categoria || ""}`.toLowerCase().includes(q));
  }, [cespiti, cerca]);

  const totaleCosto = filtrati.reduce((s, c) => s + (c.costo_acquisto || 0), 0);

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, margin: 0 }}>Cespiti</h1>
        {!nuovo && (
          <button onClick={() => setNuovo({ descrizione: "", categoria: "", data_acquisto: new Date().toISOString().slice(0, 10), costo_acquisto: "", anni_ammortamento: "5", specie: "", note: "" })}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            + Nuovo Cespite
          </button>
        )}
      </div>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 20 }}>{cespiti.length} cespiti — costo totale {totaleCosto.toFixed(2)}€</p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>GENERA QUOTE DI AMMORTAMENTO</div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Anno</label>
            <input type="number" value={annoGenerazione} onChange={e => setAnnoGenerazione(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, width: 100 }} />
          </div>
          <button onClick={generaQuote} disabled={generandoQuote}
            style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {generandoQuote ? "Generazione..." : "📐 Genera Quote"}
          </button>
        </div>
      </div>

      {nuovo && (
        <div style={{ background: C.card, border: `1.5px solid ${C.primary}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
            <div style={{ gridColumn: "span 2" }}>
              <Campo label="Descrizione *" value={nuovo.descrizione} onChange={v => setNuovo({ ...nuovo, descrizione: v })} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>Categoria</label>
              <select value={nuovo.categoria} onChange={e => setNuovo({ ...nuovo, categoria: e.target.value })}
                style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
                <option value="">— seleziona —</option>
                {CATEGORIE_AMMORTAMENTO.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Campo label="Data acquisto *" tipo="date" value={nuovo.data_acquisto} onChange={v => setNuovo({ ...nuovo, data_acquisto: v })} />
            <Campo label="Costo acquisto (€) *" tipo="number" value={nuovo.costo_acquisto} onChange={v => setNuovo({ ...nuovo, costo_acquisto: v })} />
            <Campo label="Anni ammortamento" tipo="number" value={nuovo.anni_ammortamento} onChange={v => setNuovo({ ...nuovo, anni_ammortamento: v })} />
            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>Specie (Imputazione)</label>
              <select value={nuovo.specie} onChange={e => setNuovo({ ...nuovo, specie: e.target.value })}
                style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
                <option value="">GENERALE</option>
                {["Bovini", "Suini", "Ovini", "Nessuno"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={salvaNuovo} disabled={salvando}
              style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {salvando ? "Salvataggio..." : "Salva"}
            </button>
            <button onClick={() => setNuovo(null)}
              style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: C.muted, cursor: "pointer" }}>
              Annulla
            </button>
          </div>
        </div>
      )}

      <input placeholder="Cerca per descrizione o categoria..." value={cerca} onChange={e => setCerca(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, marginBottom: 16 }} />

      {loading ? (
        <p style={{ color: C.muted }}>Caricamento...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtrati.map(c => (
            <div key={c.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <div onClick={() => espandi(c.id)} style={{ display: "flex", justifyContent: "space-between", padding: 14, cursor: "pointer", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <strong>{c.descrizione}</strong>
                  <div style={{ fontSize: 12, color: C.muted }}>
                    {c.categoria || "Categoria non specificata"} · Acquisto {c.data_acquisto} · {c.anni_ammortamento} anni
                    {c.specie?.length > 0 && ` · ${c.specie.join(", ")}`}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: C.primary }}>{c.costo_acquisto?.toFixed(2)}€</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{espanso === c.id ? "▲ nascondi piano" : "▼ vedi piano ammortamento"}</div>
                </div>
              </div>
              {espanso === c.id && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: 14 }}>
                  {modificaId === c.id ? (
                    <div style={{ background: "#F5F0E8", border: `1.5px solid ${C.primary}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>Categoria</label>
                          <select value={formModifica.categoria} onChange={e => setFormModifica({ ...formModifica, categoria: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
                            <option value="">— nessuna —</option>
                            {CATEGORIE_AMMORTAMENTO.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>Imputazione</label>
                          <select value={formModifica.specieSelezionata} onChange={e => setFormModifica({ ...formModifica, specieSelezionata: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
                            <option value="">Generali</option>
                            {["Bovini", "Suini", "Ovini", "Nessuno"].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>Coefficiente ammortamento (%/anno)</label>
                          <input type="number" value={formModifica.coefficientePct} onChange={e => setFormModifica({ ...formModifica, coefficientePct: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>Data acquisto</label>
                          <input type="date" value={formModifica.data_acquisto} onChange={e => setFormModifica({ ...formModifica, data_acquisto: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>Fornitore</label>
                          <select value={formModifica.fornitore_id} onChange={e => setFormModifica({ ...formModifica, fornitore_id: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
                            <option value="">— nessuno —</option>
                            {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => salvaModifica(c.id)} disabled={salvandoModifica}
                          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                          {salvandoModifica ? "Salvataggio..." : "✓ Salva modifiche"}
                        </button>
                        <button onClick={annullaModifica}
                          style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, color: C.muted, cursor: "pointer" }}>
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: "#FAFAF8", border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                          <div><strong>Fattura di provenienza:</strong> {c.ci_fatture ? `n. ${c.ci_fatture.numero} del ${c.ci_fatture.data}` : "— (cespite storico migrato, nessuna fattura collegata)"}</div>
                          <div><strong>Fornitore:</strong> {c.ci_fornitori?.nome || "—"}</div>
                          <div><strong>Data acquisto:</strong> {c.data_acquisto}</div>
                          <div><strong>Categoria:</strong> {c.categoria || "—"}</div>
                          <div><strong>Imputazione:</strong> {c.specie?.length > 0 ? c.specie.join(", ") : "Generali (o Nessuno se escluso)"}</div>
                          <div><strong>Coefficiente ammortamento:</strong> {c.anni_ammortamento ? `${round2(100 / c.anni_ammortamento)}%/anno (${c.anni_ammortamento} anni)` : "—"}</div>
                        </div>
                        <button onClick={() => iniziaModifica(c)}
                          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          ✏️ Modifica
                        </button>
                      </div>
                    </div>
                  )}

                  {!ammortamentiPerCespite[c.id] ? (
                    <p style={{ color: C.muted, fontSize: 13 }}>Caricamento...</p>
                  ) : ammortamentiPerCespite[c.id].length === 0 ? (
                    <p style={{ color: C.muted, fontSize: 13 }}>Nessuna quota generata ancora per questo cespite — usa "Genera Quote" sopra.</p>
                  ) : (
                    <table style={{ width: "100%", fontSize: 13 }}>
                      <thead>
                        <tr style={{ color: C.muted, textAlign: "left" }}>
                          <th style={{ padding: "4px 8px" }}>Anno</th>
                          <th style={{ padding: "4px 8px", textAlign: "right" }}>Quota</th>
                          <th style={{ padding: "4px 8px", textAlign: "right" }}>Fondo ammortamento a fine anno</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ammortamentiPerCespite[c.id].map(a => (
                          <tr key={a.id} style={{ borderTop: `1px solid ${C.border}` }}>
                            <td style={{ padding: "6px 8px" }}>{a.anno}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right" }}>{a.quota?.toFixed(2)}€</td>
                            <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{a.fondo_ammortamento_fine?.toFixed(2)}€</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
          {filtrati.length === 0 && <p style={{ color: C.muted }}>Nessun cespite trovato.</p>}
        </div>
      )}
    </div>
  );
}

function Campo({ label, value, onChange, tipo = "text" }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>{label}</label>
      <input type={tipo} value={value || ""} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
    </div>
  );
}
