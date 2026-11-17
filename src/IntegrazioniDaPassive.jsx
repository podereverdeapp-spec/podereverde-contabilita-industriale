// Versione 389 (ordine del Dott. Bizzarri del 16/11/2026: «quando scarico tra le fatture attive la porta nelle fatture passive da caricare»).
// Un'integrazione IVA TD16–TD19 (autofattura per un acquisto dall'estero) Aruba la mette tra le fatture emesse, ma è una fattura passiva.
// Nella lettura delle fatture attive non si registra come vendita (versione 301); qui si dice, per ognuna, se è già tra le fatture
// passive del programma (stesso fornitore per partita IVA e stessa data) oppure se va ancora caricata, e da dove.
// Solo lettura: non scrive niente.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { formattaEuro } from "./parsingUtils";

const testoXml = b => { try { return new TextDecoder("utf-8").decode(b instanceof Uint8Array ? b : new Uint8Array(b)); } catch { return ""; } };
const tag = (s, t) => (s.match(new RegExp(`<(?:[\\w]+:)?${t}>([^<]*)</(?:[\\w]+:)?${t}>`)) || [])[1] || "";
const pulisci = p => String(p || "").toUpperCase().replace(/\s/g, "");
const dataIt = d => { const [a, m, g] = String(d || "").slice(0, 10).split("-"); return g ? `${g}/${m}/${a}` : (d || "—"); };

export function leggiIntegrazione(a) {
  const t = testoXml(a.byteXml);
  const td = tag(t, "TipoDocumento");
  if (!/^TD1[6-9]$/.test(td)) return null;
  const ced = (t.match(/<CedentePrestatore>([\s\S]*?)<\/CedentePrestatore>/) || [])[1] || "";
  const paese = tag(ced, "IdPaese"), codice = tag(ced, "IdCodice");
  const nome = tag(ced, "Denominazione") || [tag(ced, "Nome"), tag(ced, "Cognome")].filter(Boolean).join(" ");
  return { td, numero: a.numero, data: a.data, piva: `${paese}${codice}`, codice, nome: nome.replace(/<!\[CDATA\[|\]\]>/g, ""), totale: Number(tag(t, "ImportoTotaleDocumento")) || null, file: a.file };
}

export default function IntegrazioniDaPassive({ autofatture }) {
  const [righe, setRighe] = useState(null);
  const [errore, setErrore] = useState("");
  const chiave = (autofatture || []).map(a => `${a.file}|${a.numero}`).join(";");
  useEffect(() => {
    let vivo = true;
    (async () => {
      const lista = (autofatture || []).map(leggiIntegrazione).filter(Boolean);
      if (!lista.length) { if (vivo) setRighe([]); return; }
      try {
        const { data: forn, error: eF } = await supabase.from("ci_fornitori").select("id, nome, partita_iva").not("partita_iva", "is", null);
        if (eF) throw new Error(eF.message);
        const out = [];
        for (const x of lista) {
          const f = (forn || []).filter(fo => { const p = pulisci(fo.partita_iva); return p && (p === pulisci(x.piva) || p === pulisci(x.codice) || p.replace(/^[A-Z]{2}/, "") === pulisci(x.codice)); });
          let caricata = null;
          if (f.length) {
            const { data: fat, error: eA } = await supabase.from("ci_fatture").select("id, numero, data").in("fornitore_id", f.map(z => z.id)).eq("tipo", "PASSIVA").eq("data", x.data).limit(5);
            if (eA) throw new Error(eA.message);
            caricata = (fat || [])[0] || null;
          }
          out.push({ ...x, fornitoreProgramma: f[0]?.nome || "", caricata });
        }
        if (vivo) setRighe(out);
      } catch (er) { if (vivo) setErrore(`Controllo delle integrazioni non riuscito: ${er.message}`); }
    })();
    return () => { vivo = false; };
  }, [chiave]); // eslint-disable-line react-hooks/exhaustive-deps
  if (errore) return <div style={{ marginTop: 6, padding: 8, background: "#FBE1DE", borderRadius: 8, fontSize: 12.5 }}>⚠️ {errore}</div>;
  if (!righe || !righe.length) return null;
  return <div style={{ marginTop: 8, padding: 10, borderRadius: 8, border: "1.5px solid #E0A100", background: "#FFF6E0", fontSize: 12.5, lineHeight: 1.6 }}>
    <b>Integrazioni IVA per acquisti dall'estero ({righe.length}): sono fatture PASSIVE.</b> Aruba le mette tra le fatture emesse; qui non si registrano come vendite.
    {righe.map((r, i) => <div key={i} style={{ marginTop: 4 }}>
      {r.caricata
        ? <>✅ <b>{r.td} {r.numero}</b> del {dataIt(r.data)} · {r.nome}{r.totale != null ? ` · ${formattaEuro(r.totale)}` : ""}: <b>già tra le fatture passive</b> del programma (n. {r.caricata.numero} del {dataIt(r.caricata.data)}).</>
        : <>⛔ <b>{r.td} {r.numero}</b> del {dataIt(r.data)} · {r.nome}{r.totale != null ? ` · ${formattaEuro(r.totale)}` : ""}: <b>NON è ancora tra le fatture passive.</b> Si carica da «Leggi le fatture passive di Aruba» con lo scarico delle fatture ricevute, dove compare tra le nuove da classificare e approvare.{!r.fornitoreProgramma ? " Il fornitore non è nel programma: nasce con la registrazione." : ""}</>}
    </div>)}
  </div>;
}
