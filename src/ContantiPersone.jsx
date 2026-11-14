// Versione 382 (Tenente Fatture, 13/11/2026): «Contanti per persona» (B3 della procedura approvata; decisione del 12/11:
// una sola cassa aziendale con i contanti in carico a ogni persona e il rendiconto per persona).
// Per ogni persona: prelievi + contanti ricevuti − spese in contanti − contanti consegnati = contanti che deve avere.
// Sola lettura: prelievi, consegne e conferme si fanno dall'app.
import { useEffect, useState } from "react";
import { input } from "./stileAruba";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
// fetchAllPages restituisce { data, error }: qui un errore ferma la lettura con il suo messaggio
const tutte = async fn => { const r = await fetchAllPages(fn); if (r.error) throw new Error(r.error.message); return r.data; };
import { dataIt, euro } from "./analisiDocumentoBanca";

const nomeP = p => String(p?.nome || "").trim() + (p?.cognome ? " " + p.cognome : "");

export default function ContantiPersone() {
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState("");
  const [annullo, setAnnullo] = useState(null); const [motivo, setMotivo] = useState(""); const [esito, setEsito] = useState("");
  // chi gestisce i conti può annullare una consegna registrata per errore (il prelievo no: è già nella cassa)
  async function annullaConsegna(c) {
    const r = await supabase.rpc("ci_contanti_annulla", { p_id: c.id, p_motivo: motivo || null });
    setEsito(r.error ? "Consegna non annullata: " + r.error.message : "Consegna annullata."); setAnnullo(null); setMotivo(""); await carica();
  }
  async function carica() {
    setErrore("");
    try {
      const [saldi, profili, cont] = await Promise.all([
        supabase.rpc("ci_contanti_saldi"), supabase.from("profili").select("id, nome, cognome"),
        tutte((a, b) => supabase.from("ci_contanti").select("*").order("id", { ascending: false }).range(a, b))]);
      if (saldi.error) throw new Error(saldi.error.message);
      if (profili.error) throw new Error(profili.error.message);
      setD({ saldi: saldi.data || [], nomi: Object.fromEntries((profili.data || []).map(p => [p.id, nomeP(p)])), cont });
    } catch (e) { setErrore("Lettura non riuscita: " + e.message); }
  }
  useEffect(() => { carica(); }, []);
  if (!d) return <div><h2 style={{ color: C.primary }}>Contanti per persona</h2>{errore ? <div style={{ color: C.red }}>{errore}</div> : <div style={{ color: C.muted }}>Leggo…</div>}</div>;
  const daConfermare = d.cont.filter(c => c.tipo === "Consegna" && !c.confermata_il && !c.annullata_il);
  const td = { padding: "5px 8px", textAlign: "right" };
  return (
    <div style={{ maxWidth: 1000 }}>
      <h2 style={{ margin: "0 0 4px", color: C.primary }}>Contanti per persona</h2>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Quanti contanti dell'azienda deve avere ciascuno. Prelievi, consegne e conferme si registrano dall'app; le spese in contanti contano dal salvataggio.</div>
      <button style={{ ...btn(false), marginBottom: 10 }} onClick={carica}>Aggiorna</button>
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", background: "#fff", marginBottom: 14 }}>
        <thead><tr style={{ color: C.muted }}><th style={{ padding: 6, textAlign: "left" }}>Persona</th><th style={td}>Prelievi</th><th style={td}>Ricevuti</th><th style={td}>Spese in contanti</th><th style={td}>Consegnati</th><th style={td}>Deve avere</th><th style={td}>Consegne da confermare</th></tr></thead>
        <tbody>{d.saldi.map(s => (
          <tr key={s.persona} style={{ borderTop: `1px solid ${C.border}` }}><td style={{ padding: "5px 8px", fontWeight: 700 }}>{d.nomi[s.persona] || "—"}</td>
            <td style={td}>{euro(s.prelievi)}</td><td style={td}>{euro(s.ricevuti)}</td><td style={td}>{euro(s.spese)}</td><td style={td}>{euro(s.consegnati)}</td>
            <td style={{ ...td, fontWeight: 800, color: Number(s.saldo) < 0 ? C.red : C.text }}>{euro(s.saldo)}</td>
            <td style={{ ...td, color: C.accent }}>{Number(s.da_confermare_in_uscita) || Number(s.da_confermare_in_entrata) ? `${euro(s.da_confermare_in_uscita)} da dare, ${euro(s.da_confermare_in_entrata)} da ricevere` : ""}</td></tr>))}</tbody>
      </table>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>«Deve avere» negativo: la persona ha speso più contanti di quanti ne ha avuti, cioè ha anticipato soldi suoi (da rimborsare).</div>
      <div style={scheda}><b>Consegne da confermare ({daConfermare.length})</b>
        {esito && <div style={{ fontSize: 12.5, fontWeight: 700, color: esito.startsWith("Consegna annullata") ? C.green : C.red }}>{esito}</div>}
        {daConfermare.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted }}>Nessuna.</div> : daConfermare.map(c => <div key={c.id} style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
          <span>{dataIt(c.data)} — {d.nomi[c.persona]} a {d.nomi[c.a_persona]}: {euro(c.importo)} (la conferma chi riceve, dall'app)</span>
          {annullo === c.id ? <><input style={{ ...input, width: 240 }} placeholder="motivo dell'annullamento" value={motivo} onChange={e => setMotivo(e.target.value)} />
            <button style={btn(true, C.red)} onClick={() => annullaConsegna(c)}>Annulla la consegna</button><button style={btn(false)} onClick={() => setAnnullo(null)}>Lascia stare</button></>
            : <button style={{ ...btn(false, C.red), height: 26 }} onClick={() => { setAnnullo(c.id); setMotivo(""); setEsito(""); }}>Annulla…</button>}</div>)}</div>
      <div style={scheda}><b>Ultimi prelievi</b>
        {d.cont.filter(c => c.tipo === "Prelievo").slice(0, 20).map(c => <div key={c.id} style={{ fontSize: 12.5, color: c.annullata_il ? C.muted : C.text }}>{dataIt(c.data)} — {d.nomi[c.persona]}: {euro(c.importo)}{c.annullata_il ? " (annullato)" : ""}</div>)}
        {!d.cont.some(c => c.tipo === "Prelievo") && <div style={{ fontSize: 12.5, color: C.muted }}>Nessuno.</div>}</div>
    </div>
  );
}
