import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda, th, td, testata } from "./stileAruba";
import { formattaEuro, fetchAllPages, leggiInBlocchi } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { dataIt } from "./FatturePassive";
import { PulsantePdf, leggiPdfDi, chiaveDoc } from "./pdfFatture";
import { PulsanteDistinta, leggiDistinte } from "./distintePagamento";
import { leggiCompensazioni, trovaControparte, CompensazioniDelDocumento, CompensaNota, CompensaTraSoggetti } from "./compensazioni";

// Versione 347 — Scadenzari Clienti e Fornitori (decisioni del Dott. Bizzarri del 04/11/2026, ore 10:23–15:33).
// Due schede separate, Clienti e Fornitori. Per ogni cliente e fornitore: posizione (fatture, pagato, residuo, scaduto),
// dilazione concessa (scadenza meno data della fattura), dilazione media reale (data di ogni pagamento meno data della
// fattura, ponderata sugli importi, su tutti i pagamenti) e ritardo medio; poi l'elenco delle fatture con scadenza,
// pagamenti, giorni concessi, giorni al pagamento e ritardo, il PDF della fattura e il PDF della distinta di ogni pagamento.
// Dati: viste ci_v_scadenzario e ci_v_dilazioni; tabelle ci_scadenze, ci_pagamenti_fatture, ci_abbinamenti_pagamenti
// (caricate il 04/11/2026 dagli XML delle fatture, dagli estratti conto BPER del conto 2923 dal 22/02/2023 al 30/09/2026 e, per gli anni prima, dalle quietanze dell'archivio: conto CARIGE 765780 e primi bonifici BPER).
// Una fattura è «scaduta» solo se è scaduta nel periodo degli estratti conto caricati, si paga con bonifico e non ha
// pagamenti fino all'ultimo giorno caricato; altrimenti «da verificare». Gli abbinamenti si possono togliere e rifare.
// Compensazioni (ore 21:16–21:38): note di credito e compensazioni tra cliente e fornitore chiudono le fatture senza banca
// (file compensazioni.jsx); il residuo e lo stato le contano già dalla vista ci_v_scadenzario.

const STATI = {
  "pagata": C.green,
  "nota di credito compensata": C.green,
  "scaduta": C.red,
  "pagata in parte, il resto è scaduto": C.red,
  "pagata in parte": C.yellow,
  "da scadere": C.blue,
  "in pagamento: in attesa della banca": C.blue, // versione 357
  "in pagamento in parte: in attesa della banca": C.blue,
  "pagata più del dovuto": C.accent,
  "nota di credito da compensare": C.accent,
  "annullata da nota di credito": C.green,
  "compensata": C.green,
  "pagata e compensata": C.green,
  "compensata in parte": C.yellow,
  "nota di credito compensata in parte": C.yellow,
  "compensazione in attesa di accettazione": C.blue,
};
const coloreStato = s => STATI[s] || C.muted;
const giorni = n => (n === null || n === undefined ? "—" : `${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 1 })}`);
const euro = n => (n === null || n === undefined ? "—" : formattaEuro(Number(n)));
const MODALITA = { MP01: "contanti", MP02: "assegno", MP05: "bonifico", MP08: "carta di pagamento", MP12: "RIBA", MP19: "addebito diretto SEPA" };
const docPdf = r => r.fattura_id ? { id: r.fattura_id, data: r.data_documento }
  : r.file_xml ? { chiave: `A|${r.fornitore_id ?? ""}|${r.numero_documento ?? ""}|${r.data_documento ?? ""}`, acquisto_animali: true, data: r.data_documento } : null;
const chiaveRiga = r => r.scadenza_id ? `S${r.scadenza_id}` : r.fattura_id ? `F${r.fattura_id}` : `E${r.fattura_emessa_id}`;

function Riquadro({ etichetta, valore, nota, colore = C.primary }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", minWidth: 150, flex: "1 1 150px" }}>
      <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700 }}>{etichetta}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: colore, marginTop: 2 }}>{valore}</div>
      {nota && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{nota}</div>}
    </div>
  );
}

const Stato = ({ s }) => <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, color: "#fff", background: coloreStato(s), whiteSpace: "normal" }}>{s}</span>;

export default function ScadenzariClientiFornitori() {
  const [lato, setLato] = useState("fornitore");
  const [posizioni, setPosizioni] = useState([]);
  const [periodo, setPeriodo] = useState({ dal: "", al: "" });
  const [errore, setErrore] = useState("");
  const [loading, setLoading] = useState(true);
  const [cerca, setCerca] = useState("");
  const [soloAperte, setSoloAperte] = useState(true);
  const [ordine, setOrdine] = useState("scaduto");
  const [scelta, setScelta] = useState(null);

  async function caricaPosizioni(l) {
    setLoading(true); setErrore("");
    try {
      const tabella = l === "fornitore" ? "ci_fornitori" : "ci_clienti";
      const [{ data: dil, error: e1 }, { data: an, error: e2 }, { data: par }] = await Promise.all([
        fetchAllPages((da, a) => supabase.from("ci_v_dilazioni").select("*").eq("lato", l).order("anagrafica_id").range(da, a)),
        fetchAllPages((da, a) => supabase.from(tabella).select("id, nome, partita_iva, codice_fiscale, email").order("id").range(da, a)),
        supabase.from("ci_parametri").select("chiave, valore").in("chiave", ["estratto_conto_bper_dal", "estratto_conto_bper_al"]),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);
      const nomi = new Map((an || []).map(x => [x.id, x]));
      setPosizioni((dil || []).filter(d => d.anagrafica_id != null).map(d => ({ ...d, scheda: nomi.get(d.anagrafica_id) || { id: d.anagrafica_id, nome: `scheda ${d.anagrafica_id}` } })));
      const p = Object.fromEntries((par || []).map(r => [r.chiave, r.valore]));
      setPeriodo({ dal: p.estratto_conto_bper_dal || "", al: p.estratto_conto_bper_al || "" });
    } catch (e) { setErrore(e.message); setPosizioni([]); }
    setLoading(false);
  }
  useEffect(() => { setScelta(null); caricaPosizioni(lato); }, [lato]);

  const elenco = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    const l = posizioni.filter(p => {
      if (soloAperte && Math.abs(Number(p.residuo || 0)) < 0.005 && !Number(p.movimenti_da_abbinare) && !(Number(p.residuo_scaduto) > 0.005)) return false;
      if (!q) return true;
      return [p.scheda.nome, p.scheda.partita_iva, p.scheda.codice_fiscale].some(v => String(v || "").toLowerCase().includes(q));
    });
    const n = v => Number(v || 0);
    const cmp = {
      scaduto: (a, b) => n(b.residuo_scaduto) - n(a.residuo_scaduto) || n(b.residuo) - n(a.residuo),
      residuo: (a, b) => n(b.residuo) - n(a.residuo),
      ritardo: (a, b) => n(b.ritardo_medio) - n(a.ritardo_medio),
      nome: (a, b) => String(a.scheda.nome).localeCompare(String(b.scheda.nome), "it"),
    }[ordine];
    return [...l].sort(cmp);
  }, [posizioni, cerca, soloAperte, ordine]);

  const totali = useMemo(() => elenco.reduce((t, p) => ({ residuo: t.residuo + Number(p.residuo || 0), scaduto: t.scaduto + Number(p.residuo_scaduto || 0) }), { residuo: 0, scaduto: 0 }), [elenco]);
  const parola = lato === "fornitore" ? { chi: "fornitore", chiPl: "fornitori", pag: "Pagato", pagamenti: "pagamenti" } : { chi: "cliente", chiPl: "clienti", pag: "Incassato", pagamenti: "incassi" };

  function esportaPosizioni() {
    esportaExcel(`Posizioni_${parola.chiPl}`, [{ nome: `Posizioni ${parola.chiPl}`, righe: elenco.map(p => ({
      [lato === "fornitore" ? "Fornitore" : "Cliente"]: p.scheda.nome, "Partita IVA": p.scheda.partita_iva || "",
      "Numero fatture": p.numero_fatture, "Totale documenti": numeroExcel(p.totale_documenti), [parola.pag]: numeroExcel(p.totale_pagato),
      "Residuo": numeroExcel(p.residuo), "Di cui scaduto": numeroExcel(p.residuo_scaduto),
      "Dilazione concessa media (giorni)": p.dilazione_concessa_media === null ? null : Number(p.dilazione_concessa_media),
      "Dilazione media reale (giorni)": p.dilazione_media_reale === null ? null : Number(p.dilazione_media_reale),
      "Ritardo medio (giorni)": p.ritardo_medio === null ? null : Number(p.ritardo_medio),
      [`Numero ${parola.pagamenti}`]: p.numero_pagamenti, "Movimenti da abbinare": p.movimenti_da_abbinare,
    })) }]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, margin: 0 }}>Scadenzari Clienti e Fornitori</h1>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
        La posizione di ogni {lato === "fornitore" ? "fornitore" : "cliente"}: fatture, scadenze, {parola.pagamenti} abbinati, residuo e giorni di pagamento.
        Pagamenti e incassi letti dagli estratti conto BPER (conto che finisce in 2923) {periodo.dal ? `dal ${dataIt(periodo.dal)} al ${dataIt(periodo.al)}` : ""};
        per gli anni prima, quelli provati dalle quietanze dell'archivio (conto CARIGE che finisce in 765780 e primi bonifici BPER).
        Una fattura è «scaduta» solo se è scaduta in quel periodo, si paga con bonifico e non ha {parola.pagamenti}; negli altri casi è «da verificare»
        (cassa, carta prepagata e assegni non sono ancora caricati).
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setLato("cliente")} style={btn(lato === "cliente")}>🤝 Clienti</button>
        <button onClick={() => setLato("fornitore")} style={btn(lato === "fornitore")}>🏢 Fornitori</button>
      </div>
      {errore && <div style={{ ...scheda, color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>}

      {!scelta && (
        <>
          <div style={{ ...scheda, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input placeholder={`Cerca il ${parola.chi} per nome, partita IVA o codice fiscale…`} value={cerca} onChange={e => setCerca(e.target.value)} style={{ ...input, flex: 1, minWidth: 260 }} />
            <label style={{ fontSize: 12.5, color: C.muted, display: "flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" checked={soloAperte} onChange={e => setSoloAperte(e.target.checked)} /> Solo con residuo, scaduto o movimenti da abbinare
            </label>
            <label style={{ fontSize: 12.5, color: C.muted }}>Ordine{" "}
              <select value={ordine} onChange={e => setOrdine(e.target.value)} style={input}>
                <option value="scaduto">per scaduto</option><option value="residuo">per residuo</option>
                <option value="ritardo">per ritardo medio</option><option value="nome">per nome</option>
              </select>
            </label>
            <button onClick={esportaPosizioni} style={btn(false, C.green)}>📥 Esporta Excel</button>
          </div>
          <div style={{ fontSize: 13, color: C.muted, margin: "0 0 8px" }}>
            {loading ? "Carico…" : `${elenco.length} ${parola.chiPl} · residuo ${euro(totali.residuo)} · di cui scaduto ${euro(totali.scaduto)}`}
          </div>
          <div style={{ ...scheda, padding: 0, overflowX: "auto" }}>
            <table>
              <thead><tr style={testata}>
                <th style={th}>{lato === "fornitore" ? "Fornitore" : "Cliente"}</th><th style={th}>Fatture</th><th style={{ ...th, textAlign: "right" }}>Totale documenti</th>
                <th style={{ ...th, textAlign: "right" }}>{parola.pag}</th><th style={{ ...th, textAlign: "right" }}>Residuo</th><th style={{ ...th, textAlign: "right" }}>Di cui scaduto</th>
                <th style={{ ...th, textAlign: "right" }}>Dilazione concessa</th><th style={{ ...th, textAlign: "right" }}>Dilazione reale</th><th style={{ ...th, textAlign: "right" }}>Ritardo medio</th>
                <th style={th}>{parola.pagamenti[0].toUpperCase() + parola.pagamenti.slice(1)}</th><th style={th}>Da abbinare</th>
              </tr></thead>
              <tbody>
                {elenco.map(p => (
                  <tr key={p.anagrafica_id} onClick={() => setScelta(p)} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }} title="Apri lo scadenzario">
                    <td style={{ ...td, fontWeight: 700, color: C.primary }}>{p.scheda.nome}<div style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>{p.scheda.partita_iva || p.scheda.codice_fiscale || "senza partita IVA"}</div></td>
                    <td style={td}>{p.numero_fatture}</td>
                    <td style={{ ...td, textAlign: "right" }}>{euro(p.totale_documenti)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{euro(p.totale_pagato)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{euro(p.residuo)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: Number(p.residuo_scaduto) > 0.005 ? C.red : C.muted }}>{p.residuo_scaduto ? euro(p.residuo_scaduto) : "—"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{giorni(p.dilazione_concessa_media)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{giorni(p.dilazione_media_reale)}</td>
                    <td style={{ ...td, textAlign: "right", color: Number(p.ritardo_medio) > 0 ? C.red : C.text }}>{giorni(p.ritardo_medio)}</td>
                    <td style={td}>{p.numero_pagamenti}</td>
                    <td style={{ ...td, color: Number(p.movimenti_da_abbinare) ? C.accent : C.muted, fontWeight: 700 }}>{p.movimenti_da_abbinare || "—"}</td>
                  </tr>
                ))}
                {!loading && !elenco.length && <tr><td style={td} colSpan={11}>Nessun {parola.chi} trovato.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {scelta && <Scadenzario lato={lato} posizione={scelta} parola={parola} periodo={periodo}
        onChiudi={() => setScelta(null)} onCambiato={async () => { await caricaPosizioni(lato); }} />}
    </div>
  );
}

// Lo scadenzario di un solo cliente o fornitore (si può usare anche da altre pagine)
export function Scadenzario({ lato, posizione, parola, periodo, onChiudi, onCambiato }) {
  const id = posizione.anagrafica_id;
  const campo = lato === "fornitore" ? "fornitore_id" : "cliente_id";
  const [righe, setRighe] = useState([]);
  const [movimenti, setMovimenti] = useState([]);
  const [abbinamenti, setAbbinamenti] = useState([]);
  const [pdf, setPdf] = useState({});
  const [distinte, setDistinte] = useState({});
  const [pos, setPos] = useState(posizione);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");
  const [aperta, setAperta] = useState(null);
  const [filtroStato, setFiltroStato] = useState("");
  const [anno, setAnno] = useState("");
  const [abbinando, setAbbinando] = useState(null);
  const [compensazioni, setCompensazioni] = useState([]);
  const [compensando, setCompensando] = useState(null);
  const [controparte, setControparte] = useState(null);
  const [traSoggetti, setTraSoggetti] = useState(false);

  async function carica() {
    setLoading(true); setErrore("");
    try {
      const [{ data: sc, error: e1 }, { data: mv, error: e2 }, { data: po }] = await Promise.all([
        fetchAllPages((da, a) => supabase.from("ci_v_scadenzario").select("*").eq("lato", lato).eq(campo, id)
          .order("data_documento", { ascending: false }).order("numero_documento").order("scadenza_id").range(da, a)),
        fetchAllPages((da, a) => supabase.from("ci_pagamenti_fatture").select("*").eq(campo, id).order("data", { ascending: false }).order("id").range(da, a)),
        supabase.from("ci_v_dilazioni").select("*").eq("lato", lato).eq("anagrafica_id", id).maybeSingle(),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);
      const idsScad = (sc || []).map(r => r.scadenza_id).filter(Boolean);
      const idsMov = (mv || []).map(m => m.id);
      const [{ data: a1, error: e3 }, { data: a2, error: e4 }] = await Promise.all([
        leggiInBlocchi(idsScad, (b, da, a) => supabase.from("ci_abbinamenti_pagamenti").select("*").in("scadenza_id", b).order("id").range(da, a)),
        leggiInBlocchi(idsMov, (b, da, a) => supabase.from("ci_abbinamenti_pagamenti").select("*").in("pagamento_id", b).order("id").range(da, a)),
      ]);
      if (e3) throw new Error(e3.message);
      if (e4) throw new Error(e4.message);
      const ab = [...new Map([...(a1 || []), ...(a2 || [])].map(x => [x.id, x])).values()];
      // movimenti abbinati a queste fatture ma intestati a un'altra scheda (schede doppie)
      const mancanti = [...new Set(ab.map(x => x.pagamento_id))].filter(x => !idsMov.includes(x));
      let altri = [];
      if (mancanti.length) {
        const { data, error } = await leggiInBlocchi(mancanti, (b, da, a) => supabase.from("ci_pagamenti_fatture").select("*").in("id", b).order("id").range(da, a));
        if (error) throw new Error(error.message);
        altri = data || [];
      }
      const tutti = [...(mv || []), ...altri];
      setRighe(sc || []); setMovimenti(tutti); setAbbinamenti(ab);
      if (po) setPos(p => ({ ...p, ...po }));
      leggiPdfDi((sc || []).map(docPdf).filter(Boolean)).then(setPdf).catch(() => setPdf({}));
      leggiDistinte(tutti.map(m => m.distinta_id), tutti.map(m => m.data)).then(setDistinte).catch(() => setDistinte({}));
      setCompensazioni(await leggiCompensazioni(idsScad));
    } catch (e) { setErrore(e.message); }
    setLoading(false);
  }
  useEffect(() => { carica(); }, [lato, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setControparte(null); trovaControparte(lato, posizione.scheda).then(setControparte).catch(() => setControparte(null)); }, [lato, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const totaleCompensato = righe.reduce((t, r) => t + (Number(r.importo) > 0 ? Number(r.compensato || 0) : 0), 0);
  const dopoCompensazione = async () => { setCompensando(null); setTraSoggetti(false); await carica(); onCambiato && onCambiato(); };

  const movPerId = useMemo(() => new Map(movimenti.map(m => [m.id, m])), [movimenti]);
  const abbPerScadenza = useMemo(() => {
    const m = new Map();
    abbinamenti.forEach(a => { if (!m.has(a.scadenza_id)) m.set(a.scadenza_id, []); m.get(a.scadenza_id).push(a); });
    return m;
  }, [abbinamenti]);
  const abbinatoPerMovimento = useMemo(() => {
    const m = new Map();
    abbinamenti.forEach(a => m.set(a.pagamento_id, (m.get(a.pagamento_id) || 0) + Number(a.importo)));
    return m;
  }, [abbinamenti]);
  const daAbbinare = movimenti.filter(m => (m[campo] === id) && Number(m.importo) - (abbinatoPerMovimento.get(m.id) || 0) > 0.005);
  const anni = useMemo(() => [...new Set(righe.map(r => String(r.data_documento).slice(0, 4)))].sort().reverse(), [righe]);
  const stati = useMemo(() => [...new Set(righe.map(r => r.stato))].sort(), [righe]);
  const filtrate = righe.filter(r => (!filtroStato || r.stato === filtroStato) && (!anno || String(r.data_documento).startsWith(anno)));
  const aperte = righe.filter(r => r.scadenza_id && Number(r.residuo) > 0.005);

  async function togli(a) {
    const m = movPerId.get(a.pagamento_id);
    if (!window.confirm(`Togliere l'abbinamento?\n\n${m ? `${parola.pagamenti === "pagamenti" ? "Pagamento" : "Incasso"} del ${dataIt(m.data)} di ${euro(m.importo)}` : ""} → ${euro(a.importo)} su questa fattura.\n\nIl movimento resta e torna «da abbinare». L'abbinamento resta scritto nel Registro delle modifiche.`)) return;
    const { error } = await supabase.from("ci_abbinamenti_pagamenti").delete().eq("id", a.id);
    if (error) { alert(`⚠️ ${error.message}`); return; }
    await carica(); onCambiato && onCambiato();
  }

  function esporta() {
    esportaExcel(`Scadenzario_${(pos.scheda?.nome || "").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40)}`, [
      { nome: "Fatture", righe: righe.map(r => ({
        "Numero": r.numero_documento, "Data": dataIt(r.data_documento), "Tipo": r.importo < 0 ? "Nota di credito" : "Fattura",
        "Importo da pagare": numeroExcel(r.importo), "Scadenza": dataIt(r.data_scadenza), "Scadenza indicata nella fattura": r.scadenza_indicata ? "sì" : "no",
        "Modalità di pagamento": MODALITA[r.modalita_pagamento] || r.modalita_pagamento || "", [parola.pag]: numeroExcel(r.pagato), "Compensato": numeroExcel(r.compensato), "Residuo": numeroExcel(r.residuo),
        "Giorni concessi": r.giorni_concessi, "Giorni al pagamento": r.giorni_al_pagamento, "Giorni di ritardo": r.giorni_di_ritardo,
        "Ultimo pagamento": dataIt(r.ultimo_pagamento), "Stato": r.stato, "Fuori dalla contabilità industriale": r.fuori_contabilita_industriale ? "sì" : "",
      })) },
      { nome: parola.pagamenti[0].toUpperCase() + parola.pagamenti.slice(1), righe: movimenti.map(m => ({
        "Data": dataIt(m.data), "Valuta": dataIt(m.data_valuta), "Conto": m.conto || "", "Importo": numeroExcel(m.importo), "Genere": m.genere, "Controparte": m.controparte || "",
        "Causale": m.causale || "", "Numero del bonifico, dell'ordine o dell'assegno": m.numero_bonifico || "", "Fonte": m.fonte || "", "Commissione": numeroExcel(m.commissione),
        "Abbinato": numeroExcel(abbinatoPerMovimento.get(m.id) || 0), "Da abbinare": numeroExcel(Number(m.importo) - (abbinatoPerMovimento.get(m.id) || 0)),
        "Note": m.note || "", "Distinta": m.distinta_id ? (distinte[m.distinta_id]?.nome_file || "sì") : "",
      })) },
    ]);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <div>
          <button onClick={onChiudi} style={btn(false)}>◀ Tutti i {parola.chiPl}</button>
          <span style={{ fontSize: 20, fontWeight: 800, color: C.primary, marginLeft: 12 }}>{pos.scheda?.nome}</span>
          <span style={{ fontSize: 12.5, color: C.muted, marginLeft: 8 }}>{pos.scheda?.partita_iva || pos.scheda?.codice_fiscale || ""}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {controparte && <button onClick={() => setTraSoggetti(true)} style={btn(false, C.accent)}>⇄ Compensa con le fatture {lato === "fornitore" ? "del cliente" : "del fornitore"}</button>}
          <button onClick={esporta} style={btn(false, C.green)}>📥 Esporta Excel</button>
        </div>
      </div>
      {errore && <div style={{ ...scheda, color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Riquadro etichetta="Totale documenti" valore={euro(pos.totale_documenti)} nota={`${pos.numero_fatture} fatture`} />
        <Riquadro etichetta={parola.pag} valore={euro(pos.totale_pagato)} nota={`${pos.numero_pagamenti} ${parola.pagamenti}`} colore={C.green} />
        {totaleCompensato > 0.005 && <Riquadro etichetta="Compensato" valore={euro(totaleCompensato)} nota="note di credito e compensazioni" colore={C.accent} />}
        <Riquadro etichetta="Residuo" valore={euro(pos.residuo)} />
        <Riquadro etichetta="Di cui scaduto" valore={pos.residuo_scaduto ? euro(pos.residuo_scaduto) : "—"} colore={Number(pos.residuo_scaduto) > 0.005 ? C.red : C.muted} />
        <Riquadro etichetta="Dilazione concessa media" valore={`${giorni(pos.dilazione_concessa_media)} giorni`} nota="scadenza meno data della fattura" />
        <Riquadro etichetta="Dilazione media reale" valore={`${giorni(pos.dilazione_media_reale)} giorni`} nota={`su ${pos.numero_pagamenti} ${parola.pagamenti}, ponderata sugli importi`} colore={C.accent} />
        <Riquadro etichetta="Ritardo medio" valore={`${giorni(pos.ritardo_medio)} giorni`} nota="pagamento meno scadenza" colore={Number(pos.ritardo_medio) > 0 ? C.red : C.green} />
        <Riquadro etichetta="Movimenti da abbinare" valore={daAbbinare.length} nota={daAbbinare.length ? euro(daAbbinare.reduce((t, m) => t + Number(m.importo) - (abbinatoPerMovimento.get(m.id) || 0), 0)) : "nessuno"} colore={daAbbinare.length ? C.accent : C.muted} />
      </div>

      {daAbbinare.length > 0 && (
        <div style={scheda}>
          <div style={{ fontWeight: 800, color: C.accent, marginBottom: 6 }}>Movimenti da abbinare ({daAbbinare.length})</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Bonifici, assegni e altri movimenti di questo {parola.chi} non ancora abbinati (in tutto o in parte) a una fattura. «Abbina» li collega a una fattura aperta.</div>
          <table><thead><tr style={testata}><th style={th}>Data</th><th style={th}>Conto</th><th style={{ ...th, textAlign: "right" }}>Importo</th><th style={{ ...th, textAlign: "right" }}>Da abbinare</th><th style={th}>Genere</th><th style={th}>Causale</th><th style={th}>Distinta</th><th style={th}></th></tr></thead>
            <tbody>{daAbbinare.map(m => (
              <tr key={m.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={td}>{dataIt(m.data)}</td>
                <td style={{ ...td, fontSize: 11 }}>{m.conto || "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>{euro(m.importo)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{euro(Number(m.importo) - (abbinatoPerMovimento.get(m.id) || 0))}</td>
                <td style={td}>{m.genere}</td>
                <td style={td}>{m.causale}{m.note && <div style={{ fontSize: 11, color: C.accent }}>{m.note}</div>}</td>
                <td style={td}><PulsanteDistinta movimento={m} distinte={distinte} onCambiato={carica} /></td>
                <td style={td}><button style={btn(false, C.accent)} onClick={() => setAbbinando(m)}>Abbina</button></td>
              </tr>))}</tbody></table>
        </div>
      )}

      {traSoggetti && controparte && <CompensaTraSoggetti lato={lato} schedaCorrente={pos.scheda} controparte={controparte} onChiudi={() => setTraSoggetti(false)} onFatto={dopoCompensazione} />}
      {compensando && <CompensaNota nota={compensando} aperte={aperte} onChiudi={() => setCompensando(null)} onFatto={dopoCompensazione} />}

      {abbinando && <Abbina movimento={abbinando} resto={Number(abbinando.importo) - (abbinatoPerMovimento.get(abbinando.id) || 0)} aperte={aperte}
        parola={parola} onChiudi={() => setAbbinando(null)} onFatto={async () => { setAbbinando(null); await carica(); onCambiato && onCambiato(); }} />}

      <div style={{ ...scheda, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filtroStato} onChange={e => setFiltroStato(e.target.value)} style={{ ...input, maxWidth: 360 }}><option value="">Tutti gli stati</option>{stati.map(s => <option key={s}>{s}</option>)}</select>
        <select value={anno} onChange={e => setAnno(e.target.value)} style={input}><option value="">Tutti gli anni</option>{anni.map(a => <option key={a}>{a}</option>)}</select>
        <span style={{ fontSize: 12.5, color: C.muted }}>{loading ? "Carico…" : `${filtrate.length} di ${righe.length} documenti · clic su una fattura per vedere i suoi ${parola.pagamenti}`}</span>
      </div>
      <div style={{ ...scheda, padding: 0, overflowX: "auto" }}>
        <table>
          <thead><tr style={testata}>
            <th style={th}>Numero</th><th style={th}>Data</th><th style={{ ...th, textAlign: "right" }}>Da pagare</th><th style={th}>Scadenza</th>
            <th style={{ ...th, textAlign: "right" }}>Giorni concessi</th><th style={{ ...th, textAlign: "right" }}>{parola.pag}</th><th style={{ ...th, textAlign: "right" }}>Residuo</th>
            <th style={{ ...th, textAlign: "right" }}>Giorni al pagamento</th><th style={{ ...th, textAlign: "right" }}>Ritardo</th><th style={th}>Stato</th><th style={th}>PDF</th>
          </tr></thead>
          <tbody>
            {filtrate.map(r => {
              const k = chiaveRiga(r);
              const lista = r.scadenza_id ? (abbPerScadenza.get(r.scadenza_id) || []) : [];
              const doc = docPdf(r);
              return [
                <tr key={k} onClick={() => setAperta(aperta === k ? null : k)} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer", background: aperta === k ? "#F1EEE6" : undefined }}>
                  <td style={{ ...td, fontWeight: 700 }}>{r.numero_documento}
                    {r.importo < 0 && <div style={{ fontSize: 10.5, color: C.accent, fontWeight: 700 }}>nota di credito</div>}
                    {r.importo < 0 && r.scadenza_id && Number(r.residuo) < -0.005 && <button style={{ ...btn(false, C.accent), height: 24, fontSize: 10.5, marginTop: 3 }} onClick={e => { e.stopPropagation(); setCompensando(r); }}>Compensa</button>}
                    {r.fuori_contabilita_industriale && <div style={{ fontSize: 10.5, color: C.accent, fontWeight: 700 }}>fuori dalla contabilità industriale</div>}
                  </td>
                  <td style={td}>{dataIt(r.data_documento)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{euro(r.importo)}{Number(r.ritenuta) > 0 && <div style={{ fontSize: 10.5, color: C.muted }}>al netto della ritenuta {euro(r.ritenuta)}</div>}</td>
                  <td style={td}>{dataIt(r.data_scadenza)}
                    {!r.scadenza_indicata && <div style={{ fontSize: 10.5, color: C.muted }}>{r.giorni_termine != null ? `calcolata: ${r.giorni_termine} giorni` : "scadenza non indicata"}</div>}
                    {r.modalita_pagamento && <div style={{ fontSize: 10.5, color: C.muted }}>{MODALITA[r.modalita_pagamento] || r.modalita_pagamento}</div>}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{giorni(r.giorni_concessi)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{Number(r.pagato) ? euro(r.pagato) : "—"}{Number(r.compensato) ? <div style={{ fontSize: 10.5, color: C.accent }}>compensato {euro(Math.abs(Number(r.compensato)))}</div> : null}{Number(r.in_attesa_di_accettazione) ? <div style={{ fontSize: 10.5, color: C.blue }}>in attesa {euro(r.in_attesa_di_accettazione)}</div> : null}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{euro(r.residuo)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{giorni(r.giorni_al_pagamento)}</td>
                  <td style={{ ...td, textAlign: "right", color: Number(r.giorni_di_ritardo) > 0 ? C.red : C.text }}>{giorni(r.giorni_di_ritardo)}</td>
                  <td style={td}><Stato s={r.stato} /></td>
                  <td style={td}>{doc ? <PulsantePdf doc={doc} pdf={pdf[chiaveDoc(doc)]} compatto onCaricato={(kk, rr) => setPdf(p => ({ ...p, [kk]: rr }))} /> : <span style={{ fontSize: 11, color: C.muted }}>—</span>}</td>
                </tr>,
                aperta === k && (
                  <tr key={k + "-d"}><td colSpan={11} style={{ ...td, background: "#FAF8F3" }}>
                    {!r.scadenza_id && <div style={{ color: C.muted }}>Questa fattura non ha ancora la scadenza caricata: si vede con la data della fattura come scadenza.</div>}
                    {r.scadenza_id && !lista.length && !compensazioni.some(c => c.documento_a_id === r.scadenza_id || c.documento_b_id === r.scadenza_id) && <div style={{ color: C.muted }}>Nessun {parola.pagamenti === "pagamenti" ? "pagamento" : "incasso"} abbinato.</div>}
                    {lista.length > 0 && (
                      <table><thead><tr><th style={th}>Data</th><th style={th}>Conto</th><th style={{ ...th, textAlign: "right" }}>Movimento</th><th style={{ ...th, textAlign: "right" }}>Su questa fattura</th><th style={th}>Genere</th><th style={th}>Causale</th><th style={th}>Numero</th><th style={th}>Come è stato abbinato</th><th style={th}>Distinta</th><th style={th}></th></tr></thead>
                        <tbody>{lista.map(a => { const m = movPerId.get(a.pagamento_id) || {}; return (
                          <tr key={a.id} style={{ borderTop: `1px solid ${C.border}` }}>
                            <td style={td}>{dataIt(m.data)}</td>
                            <td style={{ ...td, fontSize: 11 }}>{m.conto || "—"}</td>
                            <td style={{ ...td, textAlign: "right" }}>{euro(m.importo)}</td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{euro(a.importo)}</td>
                            <td style={td}>{m.genere}{m.commissione ? <div style={{ fontSize: 10.5, color: C.muted }}>commissione {euro(m.commissione)}</div> : null}</td>
                            <td style={td}>{m.causale}{m.note && <div style={{ fontSize: 11, color: C.accent }}>{m.note}</div>}</td>
                            <td style={{ ...td, fontSize: 11 }}>{m.numero_bonifico || "—"}</td>
                            <td style={{ ...td, fontSize: 11 }}>{a.modo === "manuale" ? "a mano" : a.motivo || a.modo}</td>
                            <td style={td}>{m.id && <PulsanteDistinta movimento={m} distinte={distinte} onCambiato={carica} />}</td>
                            <td style={td}><button style={{ ...btn(false, C.red), height: 26, fontSize: 11 }} onClick={() => togli(a)}>Togli</button></td>
                          </tr>); })}</tbody></table>
                    )}
                    {r.scadenza_id && <CompensazioniDelDocumento scadenzaId={r.scadenza_id} compensazioni={compensazioni} lato={lato} schedaId={id} onCambiato={dopoCompensazione} />}
                  </td></tr>
                ),
              ];
            })}
            {!loading && !filtrate.length && <tr><td style={td} colSpan={11}>Nessun documento.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Abbinare a mano un movimento a una o più fatture aperte dello stesso cliente o fornitore
function Abbina({ movimento, resto, aperte, parola, onChiudi, onFatto }) {
  const [importi, setImporti] = useState({});
  const [lavoro, setLavoro] = useState(false);
  const somma = Object.values(importi).reduce((t, v) => t + (parseFloat(String(v).replace(",", ".")) || 0), 0);
  async function salva() {
    const righe = Object.entries(importi).map(([sid, v]) => ({ scadenza_id: Number(sid), importo: Math.round((parseFloat(String(v).replace(",", ".")) || 0) * 100) / 100 })).filter(r => r.importo !== 0);
    if (!righe.length) { alert("Scrivere almeno un importo."); return; }
    if (somma > resto + 0.005) { alert(`Gli importi (${euro(somma)}) superano quanto resta da abbinare (${euro(resto)}).`); return; }
    if (!window.confirm(`Abbinare ${euro(somma)} del movimento del ${dataIt(movimento.data)} a ${righe.length} fattura/e?`)) return;
    setLavoro(true);
    const { error } = await supabase.from("ci_abbinamenti_pagamenti").insert(righe.map(r => ({ pagamento_id: movimento.id, scadenza_id: r.scadenza_id, importo: r.importo, modo: "manuale", motivo: "abbinato a mano dallo scadenzario" })));
    setLavoro(false);
    if (error) { alert(`⚠️ ${error.message}`); return; }
    onFatto();
  }
  return (
    <div style={{ ...scheda, border: `2px solid ${C.accent}` }}>
      <div style={{ fontWeight: 800, color: C.accent }}>Abbina il movimento del {dataIt(movimento.data)} di {euro(movimento.importo)} — resta da abbinare {euro(resto)}</div>
      <div style={{ fontSize: 12, margin: "4px 0 8px" }}>{movimento.causale}</div>
      {!aperte.length ? <div style={{ color: C.muted }}>Nessuna fattura aperta.</div> : (
        <table><thead><tr style={testata}><th style={th}>Numero</th><th style={th}>Data</th><th style={{ ...th, textAlign: "right" }}>Residuo</th><th style={th}>Importo da abbinare</th></tr></thead>
          <tbody>{aperte.map(r => (
            <tr key={r.scadenza_id} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={td}>{r.numero_documento}</td><td style={td}>{dataIt(r.data_documento)}</td><td style={{ ...td, textAlign: "right" }}>{euro(r.residuo)}</td>
              <td style={td}><input value={importi[r.scadenza_id] ?? ""} onChange={e => setImporti(p => ({ ...p, [r.scadenza_id]: e.target.value }))} style={{ ...input, width: 120 }} placeholder="0,00" />
                <button style={{ ...btn(false), height: 28, marginLeft: 6, fontSize: 11 }} onClick={() => setImporti(p => ({ ...p, [r.scadenza_id]: String(Math.min(Number(r.residuo), Math.max(0, resto - somma + (parseFloat(String(p[r.scadenza_id] || 0).replace(",", ".")) || 0)))).replace(".", ",") }))}>tutto</button></td>
            </tr>))}</tbody></table>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <button style={btn(true, C.accent)} disabled={lavoro} onClick={salva}>{lavoro ? "Salvo…" : "Salva l'abbinamento"}</button>
        <button style={btn(false)} onClick={onChiudi}>Annulla</button>
        <span style={{ fontSize: 12.5, color: C.muted }}>scritto {euro(somma)} di {euro(resto)}</span>
      </div>
    </div>
  );
}
