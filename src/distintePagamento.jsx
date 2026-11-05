import { useRef, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";

// Versione 347 (richiesta del Dott. Bizzarri del 04/11/2026 ore 15:33): i PDF delle distinte dei pagamenti.
// Una distinta (per esempio la distinta dei bonifici caricata in BPER) è un PDF nell'archivio file privato
// «distinte»; la tabella ci_distinte_pagamento la descrive e ogni movimento di ci_pagamenti_fatture la indica con
// distinta_id. Una distinta può valere per più movimenti dello stesso giorno. Oggi non ce n'è nessuna: si caricano
// dal pulsante «📎 aggiungi distinta» accanto a ogni pagamento.

export const ARCHIVIO_DISTINTE = "distinte";

export async function leggiDistinte(ids, date) {
  const out = {};
  const lista = [...new Set((ids || []).filter(Boolean))];
  if (lista.length) {
    const { data, error } = await supabase.from("ci_distinte_pagamento").select("*").in("id", lista);
    if (error) throw new Error(error.message);
    (data || []).forEach(d => { out[d.id] = d; });
  }
  const giorni = [...new Set((date || []).filter(Boolean))];
  if (giorni.length) {
    const { data, error } = await supabase.from("ci_distinte_pagamento").select("*").in("data", giorni);
    if (error) throw new Error(error.message);
    (data || []).forEach(d => { out[d.id] = d; });
  }
  return out;
}

export async function apriDistinta(d) {
  const { data, error } = await supabase.storage.from(ARCHIVIO_DISTINTE).createSignedUrl(d.percorso, 300);
  if (error) { alert("La distinta non si apre: " + error.message); return; }
  window.open(data.signedUrl, "_blank");
}

// Carica il PDF come nuova distinta del giorno del movimento e la collega al movimento
export async function caricaDistinta(movimento, file) {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error(`«${file.name}» non è un PDF.`);
  const anno = String(movimento.data || "").slice(0, 4) || "senza-anno";
  const pulito = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
  const percorso = `${anno}/${movimento.data}_${crypto.randomUUID().slice(0, 8)}_${pulito}`;
  const { error: eS } = await supabase.storage.from(ARCHIVIO_DISTINTE).upload(percorso, file, { upsert: false, contentType: "application/pdf" });
  if (eS) throw new Error(eS.message);
  const { data: d, error: eD } = await supabase.from("ci_distinte_pagamento")
    .insert({ data: movimento.data, conto: movimento.conto || "BPER conto 2923", percorso, nome_file: file.name, byte: file.size })
    .select().single();
  if (eD) throw new Error(eD.message);
  await collegaDistinta(movimento.id, d.id);
  return d;
}

export async function collegaDistinta(movimentoId, distintaId) {
  const { error } = await supabase.from("ci_pagamenti_fatture").update({ distinta_id: distintaId }).eq("id", movimentoId);
  if (error) throw new Error(error.message);
}

// Il pulsante accanto a un movimento: «📄 Distinta» se c'è, altrimenti «📎 aggiungi distinta»
// (con la scelta di una distinta già caricata per lo stesso giorno)
export function PulsanteDistinta({ movimento, distinte, onCambiato }) {
  const input = useRef(null);
  const [lavoro, setLavoro] = useState(false);
  const d = movimento.distinta_id ? distinte[movimento.distinta_id] : null;
  const stesse = Object.values(distinte || {}).filter(x => x.data === movimento.data && x.id !== movimento.distinta_id);
  const stile = { background: "none", border: `1.5px solid ${d ? C.primary : C.border}`, color: d ? C.primary : C.muted,
    borderRadius: 8, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
  async function scelto(e) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setLavoro(true);
    try { await caricaDistinta(movimento, file); onCambiato && onCambiato(); }
    catch (err) { alert(`⚠️ Distinta non caricata:\n\n${err.message}`); }
    setLavoro(false);
  }
  async function usaEsistente(id) {
    if (!id) return;
    setLavoro(true);
    try { await collegaDistinta(movimento.id, Number(id)); onCambiato && onCambiato(); }
    catch (err) { alert(`⚠️ ${err.message}`); }
    setLavoro(false);
  }
  return (
    <span onClick={e => e.stopPropagation()} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {d
        ? <button style={stile} title={`Apre la distinta (${d.nome_file || ""})`} onClick={() => apriDistinta(d)}>📄 Distinta</button>
        : <button style={stile} disabled={lavoro} title="Questo pagamento non ha ancora la distinta: sceglierla dal computer (PDF)" onClick={() => input.current.click()}>{lavoro ? "carico…" : "📎 aggiungi distinta"}</button>}
      {!d && stesse.length > 0 && (
        <select defaultValue="" disabled={lavoro} onChange={e => usaEsistente(e.target.value)} style={{ fontSize: 11, padding: "1px 4px", borderRadius: 6, border: `1px solid ${C.border}` }}
          title="Collega una distinta già caricata per lo stesso giorno">
          <option value="">oppure una distinta dello stesso giorno…</option>
          {stesse.map(x => <option key={x.id} value={x.id}>{x.nome_file || x.percorso}</option>)}
        </select>
      )}
      <input ref={input} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={scelto} />
    </span>
  );
}
