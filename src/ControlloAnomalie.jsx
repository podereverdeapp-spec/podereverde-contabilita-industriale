import { useState, useEffect } from "react";
import { etichettaTipo } from "./documentiCompetenza";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, formattaEuro, fetchAllPages } from "./parsingUtils";

// Versione 277 (decisione del Dott. Bizzarri del 22/10/2026):
//  – una fattura di trasporto a zero NON è incompleta se la sua parte «Ingresso in allevamento» ha un importo
//    (il costo sta nel Report Acquisto Animali);
//  – una fattura che vale davvero zero si segna «✓ È giusta così (vale zero)»: nelle note resta «verificata: vale zero»
//    con la data e la fattura non viene più segnalata.
const SEGNO_ZERO = "verificata: vale zero";

export default function ControlloAnomalie() {
  const [anomalie, setAnomalie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [eliminando, setEliminando] = useState(null);

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    try {
      const { data: fatture, error: eF } = await fetchAllPages((da, a) => supabase
        .from("ci_fatture").select("id, numero, data, tipo, fornitore_id, cliente_id, totale_netto, totale_iva, totale_lordo, note").range(da, a));
      if (eF) throw new Error(eF.message);
      const { data: righe, error: eR } = await fetchAllPages((da, a) => supabase
        .from("ci_articoli_fattura").select("id, fattura_id, totale_riga, aliquota_iva, area").range(da, a));
      if (eR) throw new Error(eR.message);
      const { data: ingressi, error: eI } = await fetchAllPages((da, a) => supabase
        .from("ci_report_acquisto_animali").select("articolo_fattura_id, importo").eq("fonte", "TRASPORTO_INGRESSO").range(da, a));
      if (eI) throw new Error(eI.message);
      const ingressoPerRiga = new Map();
      (ingressi || []).forEach(x => { if (x.articolo_fattura_id) ingressoPerRiga.set(x.articolo_fattura_id, (ingressoPerRiga.get(x.articolo_fattura_id) || 0) + (parseFloat(x.importo) || 0)); });
      const { data: fornitori } = await supabase.from("ci_fornitori").select("id, nome");
      const { data: clienti } = await supabase.from("ci_clienti").select("id, nome");
      const mappaFornitori = new Map((fornitori || []).map(f => [f.id, f.nome]));
      const mappaClienti = new Map((clienti || []).map(c => [c.id, c.nome]));

      const righePerFattura = new Map();
      (righe || []).forEach(r => {
        if (!righePerFattura.has(r.fattura_id)) righePerFattura.set(r.fattura_id, []);
        righePerFattura.get(r.fattura_id).push(r);
      });

      const fattureNum = numerizzaCampi(fatture || [], ["totale_netto", "totale_iva", "totale_lordo"]);
      const trovate = [];
      fattureNum.forEach(f => {
        const sueRighe = righePerFattura.get(f.id) || [];
        const nRighe = sueRighe.length;
        const sommaRighe = sueRighe.reduce((s, r) => s + (parseFloat(r.totale_riga) || 0), 0);
        const controparte = f.cliente_id ? mappaClienti.get(f.cliente_id) : mappaFornitori.get(f.fornitore_id);
        const problemi = [];
        const ingresso = sueRighe.reduce((s, r) => s + (ingressoPerRiga.get(r.id) || 0), 0);
        const trasportoInIngresso = nRighe > 0 && sueRighe.every(r => r.area === "TRASPORTO ANIMALI") && ingresso > 0;
        const verificataZero = (f.note || "").includes(SEGNO_ZERO);
        if ((f.totale_lordo || 0) === 0 && !trasportoInIngresso && !verificataZero) problemi.push("Totale fattura a zero");
        if (nRighe === 0) problemi.push("Nessuna riga articolo associata");
        if (nRighe > 0 && Math.abs(sommaRighe - (f.totale_netto || 0)) > 0.5) {
          problemi.push(`Fattura incompleta: la somma delle righe salvate (${sommaRighe.toFixed(2)}€) non coincide con l'imponibile dichiarato (${(f.totale_netto || 0).toFixed(2)}€) — probabile riga ancora da classificare, mai completata`);
        }
        if (problemi.length > 0) {
          trovate.push({ ...f, controparte, nRighe, problemi, aZero: (f.totale_lordo || 0) === 0 });
        }
      });
      trovate.sort((a, b) => new Date(b.data) - new Date(a.data));
      setAnomalie(trovate);
    } catch (err) {
      alert(`⚠️ Errore nel controllo anomalie:\n\n${err.message}`);
    }
    setLoading(false);
  }

  async function segnaZero(f) {
    if (!window.confirm(`Confermi che la fattura ${f.numero} del ${f.data} (${f.controparte || "controparte sconosciuta"}) vale davvero zero?\n\nNelle note della fattura verrà scritto «${SEGNO_ZERO}» con la data di oggi e la fattura non verrà più segnalata.`)) return;
    const testo = `${f.note ? f.note + "\n" : ""}${SEGNO_ZERO} (${new Date().toLocaleDateString("it-IT")})`;
    let q = supabase.from("ci_fatture").update({ note: testo }).eq("id", f.id).eq("totale_lordo", 0);
    q = f.note ? q.eq("note", f.note) : q.is("note", null);
    const { data, error } = await q.select("id");
    if (error) alert(`⚠️ ${error.message}`);
    else if (!data || data.length !== 1) alert("⚠️ La fattura è stata cambiata nel frattempo: ricaricare la pagina.");
    else carica();
  }

  async function elimina(f) {
    if (f.nRighe > 0) {
      alert("Questa fattura ha righe articolo associate — non la elimino automaticamente per non perdere dati. Controllala a mano.");
      return;
    }
    if (!window.confirm(`Eliminare il "guscio vuoto" della fattura ${f.numero} del ${f.data} (${f.controparte || "controparte sconosciuta"})? Non ha righe articolo, quindi non si perde nulla. Dopo l'eliminazione potrai ricaricarla correttamente.`)) return;
    setEliminando(f.id);
    try {
      const { error } = await supabase.from("ci_fatture").delete().eq("id", f.id);
      if (error) throw new Error(error.message);
      carica();
    } catch (err) {
      alert(`⚠️ Errore nell'eliminazione:\n\n${err.message}`);
    }
    setEliminando(null);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Fatture Incomplete</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Fatture con totale a zero, senza righe articolo, o con la somma delle righe salvate che non coincide con l'imponibile dichiarato — quest'ultimo caso è il più insidioso: succede quando una fattura viene caricata e alcune righe restano "da classificare" senza mai essere completate, lasciando la fattura silenziosamente incompleta nei report. Se una fattura non ha righe, puoi eliminare il "guscio vuoto" da qui per poterla ricaricare correttamente; se ha righe (anche solo alcune), va completata a mano in Carica Fatture — non viene eliminata automaticamente.
      </p>

      {loading ? <p style={{ color: C.muted }}>Controllo in corso...</p> : (
        <>
          <p style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>{anomalie.length === 1 ? "1 fattura segnalata" : `${anomalie.length} fatture segnalate`}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {anomalie.map(f => (
              <div key={f.id} style={{ background: "#FDECEC", border: `1.5px solid ${C.red}`, borderRadius: 10, padding: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: f.tipo === "ATTIVA" ? C.green : C.blue, marginRight: 8 }}>
                    {etichettaTipo(f.tipo)}
                  </span>
                  <strong>{f.controparte || "—"}</strong>
                  <div style={{ fontSize: 12, color: C.muted }}>Fatt. {f.numero} del {f.data} · {f.nRighe === 1 ? "1 riga" : `${f.nRighe} righe`}</div>
                  <div style={{ fontSize: 12, color: C.red, fontWeight: 700, marginTop: 4 }}>{f.problemi.join(" · ")}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 800, fontSize: 16, color: C.text }}>{formattaEuro(f.totale_lordo)}</span>
                  {f.aZero && f.nRighe > 0 && (
                    <button onClick={() => segnaZero(f)}
                      style={{ background: "none", border: `1.5px solid ${C.green}`, color: C.green, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      ✓ È giusta così (vale zero)
                    </button>)}
                  <button onClick={() => elimina(f)} disabled={eliminando === f.id}
                    style={{ background: "none", border: `1.5px solid ${C.red}`, color: C.red, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    {eliminando === f.id ? "..." : "🗑️ Elimina guscio"}
                  </button>
                </div>
              </div>
            ))}
            {anomalie.length === 0 && <p style={{ color: C.muted }}>Nessuna anomalia trovata — tutte le fatture hanno un totale e delle righe.</p>}
          </div>
        </>
      )}
    </div>
  );
}
