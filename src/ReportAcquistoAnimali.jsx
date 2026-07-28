import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, formattaEuro, fetchAllPages } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

export default function ReportAcquistoAnimali() {
  const [righe, setRighe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStato, setFiltroStato] = useState("DA_ELABORARE");
  const [animaliSenzaCosto, setAnimaliSenzaCosto] = useState([]);
  const [modificaId, setModificaId] = useState(null); // id della riga in modifica
  const [formModifica, setFormModifica] = useState({});
  const [salvando, setSalvando] = useState(null);

  useEffect(() => { carica(); caricaAnimaliSenzaCosto(); }, []);

  async function caricaAnimaliSenzaCosto() {
    const { data, error } = await fetchAllPages((da, a) => supabase
      .from("animali").select("id,bdn,nome,specie,razza,nascita,data_ingresso,prezzo_acquisto")
      .eq("provenienza", "Acquistato").range(da, a));
    if (error) { console.error("Errore caricamento animali senza costo:", error.message); return; }
    setAnimaliSenzaCosto((data || []).filter(a => !a.prezzo_acquisto));
  }

  async function carica() {
    setLoading(true);
    const { data, error } = await supabase
      .from("ci_report_acquisto_animali")
      .select("*, ci_fornitori(nome)")
      .order("data_fattura", { ascending: false });
    if (error) {
      alert(`⚠️ Errore nel caricamento:\n\n${error.message}`);
    } else {
      setRighe(numerizzaCampi(data || [], ["importo", "quantita", "prezzo_unitario"]));
    }
    setLoading(false);
  }

  async function segnaInserito(id) {
    const { error } = await supabase
      .from("ci_report_acquisto_animali")
      .update({ stato: "INSERITO_PODEREVERDE", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      alert(`⚠️ Errore nell'aggiornamento:\n\n${error.message}`);
      return;
    }
    carica();
  }

  async function annullaInserito(id) {
    const { error } = await supabase
      .from("ci_report_acquisto_animali")
      .update({ stato: "DA_ELABORARE", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      alert(`⚠️ Errore nell'aggiornamento:\n\n${error.message}`);
      return;
    }
    carica();
  }

  function iniziaModifica(r) {
    setModificaId(r.id);
    setFormModifica({
      numero_fattura: r.numero_fattura || "", data_fattura: r.data_fattura || "",
      specie: r.specie || "", razza: r.razza || "", destinazione_acquisto: r.destinazione_acquisto || "",
      bdn: r.bdn || "", nr_lotto: r.nr_lotto || "", quantita: r.quantita ?? "", unita_misura: r.unita_misura || "",
      prezzo_unitario: r.prezzo_unitario ?? "", importo: r.importo ?? "",
    });
  }

  function annullaModifica() {
    setModificaId(null);
    setFormModifica({});
  }

  async function salvaModifica(id) {
    setSalvando(id);
    try {
      const { error } = await supabase.from("ci_report_acquisto_animali").update({
        numero_fattura: formModifica.numero_fattura || null, data_fattura: formModifica.data_fattura || null,
        specie: formModifica.specie || null, razza: formModifica.razza || null,
        destinazione_acquisto: formModifica.destinazione_acquisto || null,
        bdn: formModifica.bdn || null, nr_lotto: formModifica.nr_lotto || null,
        quantita: formModifica.quantita === "" ? null : parseFloat(formModifica.quantita),
        unita_misura: formModifica.unita_misura || null,
        prezzo_unitario: formModifica.prezzo_unitario === "" ? null : parseFloat(formModifica.prezzo_unitario),
        importo: formModifica.importo === "" ? null : parseFloat(formModifica.importo),
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw new Error(error.message);
      setModificaId(null);
      setFormModifica({});
      await carica();
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio delle modifiche:\n\n${err.message}`);
    }
    setSalvando(null);
  }

  async function eliminaRiga(r) {
    if (!window.confirm(`Eliminare questa riga?\n\n"${r.ci_fornitori?.nome || "—"}" — Fatt. ${r.numero_fattura || "—"} del ${r.data_fattura} — ${formattaEuro(r.importo)}\n\nOperazione irreversibile.`)) return;
    setSalvando(r.id);
    try {
      const { error } = await supabase.from("ci_report_acquisto_animali").delete().eq("id", r.id);
      if (error) throw new Error(error.message);
      await carica();
    } catch (err) {
      alert(`⚠️ Errore nell'eliminazione:\n\n${err.message}`);
    }
    setSalvando(null);
  }

  const filtrate = righe.filter(r => filtroStato === "tutti" || r.stato === filtroStato);

  function esporta() {
    const righeExcel = filtrate.map(r => ({
      "Fornitore": r.ci_fornitori?.nome, "Numero fattura": r.numero_fattura, "Data fattura": r.data_fattura,
      "Specie": r.specie, "Razza": r.razza, "Destinazione": r.destinazione_acquisto, "BDN": r.bdn, "Lotto": r.nr_lotto,
      "Quantità": numeroExcel(r.quantita), "U.M.": r.unita_misura, "Prezzo unitario": numeroExcel(r.prezzo_unitario),
      "Importo": numeroExcel(r.importo), "Stato": r.stato,
    }));
    esportaExcel("ReportAcquistoAnimali", [{ nome: "Acquisto Animali", righe: righeExcel }]);
  }
  const daElaborare = righe.filter(r => r.stato === "DA_ELABORARE");
  const totaleDaElaborare = daElaborare.reduce((s, r) => s + (r.importo || 0), 0);

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Report Acquisto Animali</h1>
        <button onClick={esporta}
          style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          📥 Esporta Excel
        </button>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Righe fattura classificate come acquisto animali (o come trasporto in ingresso allevamento) — da tradurre
        manualmente in un animale o lotto su podereverdeapp.it.
      </p>

      {animaliSenzaCosto.length > 0 && (
        <div style={{ background: "#FDECEC", border: `1.5px solid ${C.red}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 8 }}>
            ⚠️ {animaliSenzaCosto.length} animali "Acquistato" senza costo di acquisto inserito
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {animaliSenzaCosto.map(a => (
              <div key={a.id} style={{ fontSize: 13, color: C.text, padding: "4px 0", borderTop: `1px solid ${C.red}33` }}>
                <strong>{a.bdn || a.nome || `ID ${a.id}`}</strong> — {a.specie}{a.razza && ` (${a.razza})`}
                {a.data_ingresso && ` · ingresso ${a.data_ingresso}`}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.text, marginTop: 8 }}>
            Inserire il costo di acquisto (con gli estremi della fattura) da podereverdeapp.it o da qui — l'avviso sparirà su entrambi una volta inserito. La finestra di inserimento diretto da questa pagina è ancora da costruire.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ background: C.red + "15", borderRadius: 10, padding: "10px 16px" }}>
          <div style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>Da elaborare</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.red }}>
            {daElaborare.length} righe — {formattaEuro(totaleDaElaborare)}
          </div>
        </div>
      </div>

      <select value={filtroStato} onChange={e => setFiltroStato(e.target.value)}
        style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, marginBottom: 16 }}>
        <option value="DA_ELABORARE">Da elaborare</option>
        <option value="INSERITO_PODEREVERDE">Già inserite</option>
        <option value="tutti">Tutte</option>
      </select>

      {loading ? (
        <p style={{ color: C.muted }}>Caricamento...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtrate.map(r => (
            <div key={r.id} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14,
              borderLeft: `4px solid ${r.stato === "DA_ELABORARE" ? C.red : C.green}`,
            }}>
              {modificaId === r.id ? (
                <div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}><strong>{r.ci_fornitori?.nome || "—"}</strong> (fornitore non modificabile qui)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                    <CampoModifica label="Numero fattura" value={formModifica.numero_fattura} onChange={v => setFormModifica(f => ({ ...f, numero_fattura: v }))} />
                    <CampoModifica label="Data fattura" tipo="date" value={formModifica.data_fattura} onChange={v => setFormModifica(f => ({ ...f, data_fattura: v }))} />
                    <CampoModifica label="Specie" value={formModifica.specie} onChange={v => setFormModifica(f => ({ ...f, specie: v }))} />
                    <CampoModifica label="Razza" value={formModifica.razza} onChange={v => setFormModifica(f => ({ ...f, razza: v }))} />
                    <CampoModifica label="Destinazione" value={formModifica.destinazione_acquisto} onChange={v => setFormModifica(f => ({ ...f, destinazione_acquisto: v }))} />
                    <CampoModifica label="BDN" value={formModifica.bdn} onChange={v => setFormModifica(f => ({ ...f, bdn: v }))} />
                    <CampoModifica label="Lotto" value={formModifica.nr_lotto} onChange={v => setFormModifica(f => ({ ...f, nr_lotto: v }))} />
                    <CampoModifica label="Quantità" tipo="number" value={formModifica.quantita} onChange={v => setFormModifica(f => ({ ...f, quantita: v }))} />
                    <CampoModifica label="U.M." value={formModifica.unita_misura} onChange={v => setFormModifica(f => ({ ...f, unita_misura: v }))} />
                    <CampoModifica label="Prezzo unitario" tipo="number" value={formModifica.prezzo_unitario} onChange={v => setFormModifica(f => ({ ...f, prezzo_unitario: v }))} />
                    <CampoModifica label="Importo" tipo="number" value={formModifica.importo} onChange={v => setFormModifica(f => ({ ...f, importo: v }))} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => salvaModifica(r.id)} disabled={salvando === r.id} style={btn(C.green)}>
                      {salvando === r.id ? "Salvataggio..." : "✓ Salva modifiche"}
                    </button>
                    <button onClick={annullaModifica} style={btn(C.muted)}>Annulla</button>
                  </div>
                </div>
              ) : (
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <strong>{r.ci_fornitori?.nome || "—"}</strong>
                  {" · "}{r.fonte === "TRASPORTO_INGRESSO" ? "Trasporto ingresso" : "Acquisto diretto"}
                  <div style={{ fontSize: 12, color: C.muted }}>
                    Fatt. {r.numero_fattura || "—"} del {r.data_fattura}
                    {r.specie && ` · ${r.specie}`}{r.razza && ` (${r.razza})`}
                    {r.destinazione_acquisto && ` · ${r.destinazione_acquisto}`}
                    {r.bdn && ` · BDN ${r.bdn}`}{r.nr_lotto && ` · Lotto ${r.nr_lotto}`}
                  </div>
                  {(r.quantita || r.prezzo_unitario) && (
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {r.quantita && `${r.quantita} ${r.unita_misura || ""}`}
                      {r.quantita && r.prezzo_unitario && " · "}
                      {r.prezzo_unitario && `${formattaEuro(r.prezzo_unitario)}/${r.unita_misura || "unità"}`}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.primary }}>{formattaEuro(r.importo)}</div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    {r.stato === "DA_ELABORARE" ? (
                      <button onClick={() => segnaInserito(r.id)} style={btn(C.green)}>✓ Segna inserito</button>
                    ) : (
                      <button onClick={() => annullaInserito(r.id)} style={btn(C.muted)}>↩️ Riporta a "da elaborare"</button>
                    )}
                    <button onClick={() => iniziaModifica(r)} style={btn(C.blue)}>✏️ Modifica</button>
                    <button onClick={() => eliminaRiga(r)} disabled={salvando === r.id} style={btn(C.red)}>🗑️ Elimina</button>
                  </div>
                </div>
              </div>
              )}
            </div>
          ))}
          {filtrate.length === 0 && <p style={{ color: C.muted }}>Nessuna riga in questo stato.</p>}
        </div>
      )}
    </div>
  );
}

function btn(color) {
  return {
    marginTop: 6, background: color + "20", color, border: "none", borderRadius: 8,
    padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
  };
}

function CampoModifica({ label, value, onChange, tipo = "text" }) {
  return (
    <label style={{ fontSize: 11, color: C.muted }}>
      {label}
      <input type={tipo} value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "5px 7px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12, marginTop: 2 }} />
    </label>
  );
}
