import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { leggiInBlocchi } from "./parsingUtils";

// Versione 292 (decisione del Dott. Bizzarri del 24/10/2026 ore 11:07): i PDF delle fatture stanno nel
// programma, nell'archivio file privato «fatture» (non nel database). La tabella ci_pdf_fatture collega
// ogni PDF al suo documento: una fattura vera (fattura_id) oppure un acquisto di animali registrato solo nel
// Report Acquisto Animali (chiave_acquisto = 'A|fornitore|numero|data', la stessa chiave di Fatture Passive).

export const ARCHIVIO_PDF = "fatture";

// La chiave di un documento come la usano Fatture Passive e Ricerca: «F<id>» oppure «A|…»
export const chiaveDoc = d => (d.acquisto_animali || String(d.chiave || "").startsWith("A|")) ? d.chiave : `F${d.id}`;

// Dove si salva il file: anno/chiave, con i caratteri strani sostituiti
export function percorsoPdf(d) {
  const anno = String(d.data || "").slice(0, 4) || "senza-anno";
  return `${anno}/${chiaveDoc(d).replace(/[^A-Za-z0-9-]/g, "_")}.pdf`;
}

// Legge i PDF già caricati per un elenco di documenti; restituisce { chiave: riga di ci_pdf_fatture }
export async function leggiPdfDi(documenti) {
  const ids = [...new Set(documenti.filter(d => !String(chiaveDoc(d)).startsWith("A|")).map(d => d.id).filter(Boolean))];
  const chiavi = [...new Set(documenti.map(chiaveDoc).filter(k => String(k).startsWith("A|")))];
  const mappa = {};
  if (ids.length) {
    const { data, error } = await leggiInBlocchi(ids, (b, da, a) => supabase.from("ci_pdf_fatture").select("*").in("fattura_id", b).order("id").range(da, a));
    if (error) throw new Error(error.message);
    (data || []).forEach(r => { mappa[`F${r.fattura_id}`] = r; });
  }
  if (chiavi.length) {
    const { data, error } = await leggiInBlocchi(chiavi, (b, da, a) => supabase.from("ci_pdf_fatture").select("*").in("chiave_acquisto", b).order("id").range(da, a));
    if (error) throw new Error(error.message);
    (data || []).forEach(r => { mappa[r.chiave_acquisto] = r; });
  }
  return mappa;
}

export async function apriPdf(riga) {
  const { data, error } = await supabase.storage.from(ARCHIVIO_PDF).createSignedUrl(riga.percorso, 300);
  if (error) { alert("Il PDF non si apre: " + error.message); return; }
  window.open(data.signedUrl, "_blank");
}

// Carica (o sostituisce) il PDF di un documento e lo registra in ci_pdf_fatture
export async function caricaPdf(d, file) {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error(`«${file.name}» non è un PDF.`);
  const percorso = percorsoPdf(d);
  const { error: eS } = await supabase.storage.from(ARCHIVIO_PDF).upload(percorso, file, { upsert: true, contentType: "application/pdf" });
  if (eS) throw new Error(eS.message);
  const chiave = chiaveDoc(d);
  const riga = { percorso, nome_file: file.name, byte: file.size, caricato_il: new Date().toISOString() };
  if (chiave.startsWith("A|")) Object.assign(riga, { chiave_acquisto: chiave, fattura_id: null });
  else Object.assign(riga, { fattura_id: d.id, chiave_acquisto: null });
  const { data, error } = await supabase.from("ci_pdf_fatture")
    .upsert(riga, { onConflict: chiave.startsWith("A|") ? "chiave_acquisto" : "fattura_id" }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// Il pulsante da mettere accanto a una fattura: «📄 PDF» se c'è, altrimenti «📎 aggiungi PDF»
export function PulsantePdf({ doc, pdf, onCaricato, compatto = false }) {
  const input = useRef(null);
  const [lavoro, setLavoro] = useState(false);
  const stile = { background: "none", border: `1.5px solid ${pdf ? C.primary : C.border}`, color: pdf ? C.primary : C.muted,
    borderRadius: 8, padding: compatto ? "2px 8px" : "4px 10px", fontSize: compatto ? 11 : 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
  async function scelto(e) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setLavoro(true);
    try { const r = await caricaPdf(doc, file); onCaricato && onCaricato(chiaveDoc(doc), r); }
    catch (err) { alert(`⚠️ PDF non caricato:\n\n${err.message}`); }
    setLavoro(false);
  }
  if (!doc || (!doc.id && !String(doc.chiave || "").startsWith("A|"))) return null;
  return (
    <span onClick={e => e.stopPropagation()} style={{ display: "inline-flex", gap: 4 }}>
      {pdf
        ? <button style={stile} title={`Apre il PDF della fattura (${pdf.nome_file || ""})`} onClick={() => apriPdf(pdf)}>📄 PDF</button>
        : <button style={stile} disabled={lavoro} title="Questa fattura non ha ancora il PDF nel programma: sceglierlo dal computer" onClick={() => input.current.click()}>{lavoro ? "carico…" : "📎 aggiungi PDF"}</button>}
      <input ref={input} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={scelto} />
    </span>
  );
}

// Il pulsante per un documento solo (elenchi brevi): legge da sé se il PDF c'è
export function PdfDelDocumento({ doc, compatto = true }) {
  const [pdf, setPdf] = useState(undefined);
  const chiave = doc ? chiaveDoc(doc) : "";
  useEffect(() => {
    let vivo = true;
    if (!chiave) return;
    leggiPdfDi([doc]).then(m => { if (vivo) setPdf(m[chiave] || null); }).catch(() => vivo && setPdf(null));
    return () => { vivo = false; };
  }, [chiave]); // eslint-disable-line react-hooks/exhaustive-deps
  if (pdf === undefined) return null;
  return <PulsantePdf doc={doc} pdf={pdf} compatto={compatto} onCaricato={(k, r) => setPdf(r)} />;
}

// Il documento a cui appartiene una riga del Report Acquisto Animali: la fattura della riga collegata (trasporti),
// la fattura con lo stesso fornitore, numero e data, oppure l'acquisto di animali registrato solo nel Report.
export async function documentoDiRigaReport(r) {
  if (r.articolo_fattura_id) {
    const { data } = await supabase.from("ci_articoli_fattura").select("fattura_id").eq("id", r.articolo_fattura_id).maybeSingle();
    if (data?.fattura_id) return { id: data.fattura_id, data: r.data_fattura };
  }
  if (r.fornitore_id && r.numero_fattura && r.data_fattura) {
    const { data } = await supabase.from("ci_fatture").select("id").eq("fornitore_id", r.fornitore_id).eq("numero", r.numero_fattura).eq("data", r.data_fattura).limit(1);
    if (data && data.length) return { id: data[0].id, data: r.data_fattura };
  }
  return { chiave: `A|${r.fornitore_id ?? ""}|${r.numero_fattura ?? ""}|${r.data_fattura ?? ""}`, acquisto_animali: true, data: r.data_fattura };
}

// Pulsante per una riga del Report: cerca il PDF solo quando si preme (gli elenchi sono lunghi)
export function PulsantePdfRigaReport({ riga }) {
  const [lavoro, setLavoro] = useState(false);
  async function premi(e) {
    e.stopPropagation();
    setLavoro(true);
    try {
      const doc = await documentoDiRigaReport(riga);
      const m = await leggiPdfDi([doc]);
      const pdf = m[chiaveDoc(doc)];
      if (pdf) await apriPdf(pdf);
      else alert("Questa fattura non ha ancora il PDF nel programma.\n\nSi aggiunge da Carica Dati Contabilità → 1. Carica Fatture Passive → Carica PDF delle Fatture, oppure da Fatture Passive con «📎 aggiungi PDF».");
    } catch (err) { alert("Il PDF non si apre: " + err.message); }
    setLavoro(false);
  }
  return (
    <button onClick={premi} disabled={lavoro} title="Apre il PDF della fattura"
      style={{ background: "none", border: `1.5px solid ${C.primary}`, color: C.primary, borderRadius: 8, padding: "1px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer", marginLeft: 6 }}>
      {lavoro ? "…" : "📄 PDF"}
    </button>
  );
}

export { numeroNorm, pivaNorm, leggiNomePdf, abbinaFile } from "./abbinaPdf";
