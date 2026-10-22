// Abbinamenti Fatture Acquisto (versione 232): il programma propone a quale capo o lotto dell'app
// appartiene ogni riga di fattura d'acquisto animali, spiega il motivo, aspetta la conferma e salva.
// Regole decise dal Dott. Bizzarri il 07/10/2026:
//  – alla conferma si salva il collegamento (stato ABBINATO) e sulla scheda dell'app si scrivono
//    fornitore, numero e data della fattura e prezzo d'acquisto SOLO dove sono vuoti;
//  – se la scheda ha già un valore diverso, si mostrano affiancati e si sceglie quale tenere;
//  – una proposta rifiutata non viene più riproposta.
// Versione 275 (decisione del Dott. Bizzarri del 22/10/2026: «occorre avere la possibilità di cambiare»):
//  – un abbinamento confermato si annulla dal gruppo «Abbinate»: la riga torna da abbinare e per i campi della
//    scheda dell'app si sceglie se lasciarli, rimettere il valore di prima (se noto) o svuotarli;
//  – alla conferma si salvano in scheda_prima i valori della scheda prima della scrittura;
//  – una proposta scartata («Rifiuta», «Non è questo») si ripristina dal gruppo «Da valutare»;
//  – una riga «Senza capo» si riapre e torna tra quelle da abbinare.
// Versione 277 (decisione del Dott. Bizzarri del 22/10/2026): anche i lotti di suini acquistati entrano tra le proposte.
//  – proposta sicura se il numero di lotto scritto in fattura è il codice del lotto; altrimenti candidati da valutare
//    (lotti non ancora collegati, entrati entro 120 giorni, punti come per i capi; il prezzo del lotto si confronta
//    con l'importo della riga, perché è il prezzo di tutto il lotto);
//  – alla conferma si scrivono sul lotto fornitore, numero e data della fattura e prezzo d'acquisto con le stesse regole
//    delle schede dei capi (solo dove vuoti, valori diversi affiancati), e l'annullamento li può rimettere come prima.
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { fetchAllPages, round2 } from "./parsingUtils";
import { dataIt } from "./controlliRegistri";

const bottone = (colore, pieno = true) => ({ background: pieno ? colore : "transparent", color: pieno ? "#fff" : colore, border: `1.5px solid ${colore}`, borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" });
const euro = n => n == null || n === "" || isNaN(Number(n)) ? "—" : `${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const normBdn = s => (s || "").toUpperCase().replace(/\s+/g, "");
const PAROLE_VUOTE = ["SRL", "S", "R", "L", "SOCIETA", "SOC", "AGRICOLA", "AGR", "AZ", "AZIENDA", "SS", "SAS", "SNC", "DI", "DEL", "DELLA", "E", "F", "LLI", "FRATELLI"];
const paroleFornitore = s => (s || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(p => p.length > 1 && !PAROLE_VUOTE.includes(p));
function stessoFornitore(a, b) {
  const pa = paroleFornitore(a), pb = paroleFornitore(b);
  if (!pa.length || !pb.length) return false;
  return pa.some(p => pb.includes(p));
}
const giorni = (d1, d2) => (d1 && d2) ? Math.round(Math.abs(new Date(d1) - new Date(d2)) / 86400000) : null;
const specieDi = s => { const x = (s || "").toLowerCase(); return x.startsWith("bovin") ? "bovino" : x.startsWith("suin") ? "suino" : x.startsWith("ovin") ? "ovino" : null; };
function prezzoRiga(r) {
  if (parseFloat(r.prezzo_unitario) > 0) return round2(parseFloat(r.prezzo_unitario));
  if (!(parseFloat(r.quantita) > 1) && parseFloat(r.importo) > 0) return round2(parseFloat(r.importo));
  return null;
}
function rifiutati(r) {
  return new Set([...(r.rifiuto_motivo || "").matchAll(/(animale|lotto):(\d+)/g)].map(m => `${m[1]}:${m[2]}`));
}

// Confronto campo per campo tra la riga di fattura e la scheda del capo
function confronto(r, a, nomeFornitore) {
  const prezzo = prezzoRiga(r);
  return [
    { campo: "fornitore", etichetta: "Fornitore", scheda: a.fornitore || "", fattura: nomeFornitore || "", uguale: stessoFornitore(a.fornitore, nomeFornitore) },
    { campo: "numero_fattura", etichetta: "Numero fattura", scheda: a.numero_fattura || "", fattura: r.numero_fattura || "", uguale: (a.numero_fattura || "").trim().toUpperCase() === (r.numero_fattura || "").trim().toUpperCase() },
    { campo: "data_fattura", etichetta: "Data fattura", scheda: a.data_fattura || "", fattura: r.data_fattura || "", uguale: a.data_fattura === r.data_fattura, data: true },
    { campo: "prezzo_acquisto", etichetta: "Prezzo d'acquisto", scheda: parseFloat(a.prezzo_acquisto) > 0 ? round2(parseFloat(a.prezzo_acquisto)) : "", fattura: prezzo ?? "", uguale: parseFloat(a.prezzo_acquisto) > 0 && prezzo != null && round2(parseFloat(a.prezzo_acquisto)) === prezzo, euro: true },
  ];
}
// Lotto di suini acquistato: il prezzo è quello di tutto il lotto, si confronta con l'importo della riga
const importoRiga = r => parseFloat(r.importo) > 0 ? round2(parseFloat(r.importo)) : null;
const nomeLotto = lo => lo.codice_lotto || lo.codice;
function confrontoLotto(r, lo, nomeFornitore) {
  const imp = importoRiga(r);
  return [
    { campo: "fornitore", etichetta: "Fornitore", scheda: lo.fornitore || "", fattura: nomeFornitore || "", uguale: stessoFornitore(lo.fornitore, nomeFornitore) },
    { campo: "numero_fattura", etichetta: "Numero fattura", scheda: lo.numero_fattura || "", fattura: r.numero_fattura || "", uguale: (lo.numero_fattura || "").trim().toUpperCase() === (r.numero_fattura || "").trim().toUpperCase() },
    { campo: "data_fattura", etichetta: "Data fattura", scheda: lo.data_fattura || "", fattura: r.data_fattura || "", uguale: lo.data_fattura === r.data_fattura, data: true },
    { campo: "prezzo_acquisto", etichetta: "Prezzo d'acquisto del lotto", scheda: parseFloat(lo.prezzo_acquisto) > 0 ? round2(parseFloat(lo.prezzo_acquisto)) : "", fattura: imp ?? "", uguale: parseFloat(lo.prezzo_acquisto) > 0 && imp != null && round2(parseFloat(lo.prezzo_acquisto)) === imp, euro: true },
  ];
}
function motiviLotto(r, lo, nomeFornitore, perCodice) {
  const m = [];
  if (perCodice) m.push("il numero di lotto scritto in fattura è il codice del lotto");
  if (stessoFornitore(lo.fornitore, nomeFornitore)) m.push("stesso fornitore");
  if ((lo.numero_fattura || "").trim() && (lo.numero_fattura || "").trim().toUpperCase() === (r.numero_fattura || "").trim().toUpperCase()) m.push("stesso numero di fattura");
  const g = giorni(lo.data_parto, r.data_fattura);
  if (g != null) m.push(g <= 15 ? `entrato ${g} giorni dalla data della fattura` : `ATTENZIONE: entrato a ${g} giorni dalla data della fattura`);
  const imp = importoRiga(r);
  if (imp != null && parseFloat(lo.prezzo_acquisto) > 0) m.push(round2(parseFloat(lo.prezzo_acquisto)) === imp ? "stesso prezzo" : `ATTENZIONE: prezzo diverso (lotto ${euro(lo.prezzo_acquisto)}, fattura ${euro(imp)})`);
  if (specieDi(r.specie) && specieDi(r.specie) !== "suino") m.push(`ATTENZIONE: specie diversa (fattura ${r.specie}, lotto di suini)`);
  return m;
}
function motivi(r, a, nomeFornitore, perMatricola) {
  const m = [];
  if (perMatricola) m.push("la matricola scritta in fattura è quella del capo");
  if (stessoFornitore(a.fornitore, nomeFornitore)) m.push("stesso fornitore");
  const g = giorni(a.data_ingresso, r.data_fattura);
  if (g != null) m.push(g <= 15 ? `entrato ${g} giorni dalla data della fattura` : `ATTENZIONE: entrato a ${g} giorni dalla data della fattura`);
  const p = prezzoRiga(r);
  if (p != null && parseFloat(a.prezzo_acquisto) > 0) m.push(round2(parseFloat(a.prezzo_acquisto)) === p ? "stesso prezzo" : `ATTENZIONE: prezzo diverso (scheda ${euro(a.prezzo_acquisto)}, fattura ${euro(p)})`);
  if (specieDi(r.specie) && specieDi(r.specie) !== specieDi(a.specie)) m.push(`ATTENZIONE: specie diversa (fattura ${r.specie}, scheda ${a.specie})`);
  return m;
}

function PannelloConferma({ r, a, lotto, nomeFornitore, motivo, onFatto, onAnnulla }) {
  // a = capo dell'app (tabella animali) oppure lotto = lotto di suini acquistato (tabella lotti_suini)
  const ogg = lotto || a;
  const tabella = lotto ? "lotti_suini" : "animali";
  const nomeOgg = lotto ? `lotto ${nomeLotto(lotto)}` : (a.bdn || a.nome);
  const righe = lotto ? confrontoLotto(r, lotto, nomeFornitore) : confronto(r, a, nomeFornitore);
  const [scelte, setScelte] = useState(() => Object.fromEntries(righe.map(x => [x.campo, x.scheda === "" && x.fattura !== "" ? "fattura" : "scheda"])));
  const [salvando, setSalvando] = useState(false);
  const mostra = x => x === "" ? "vuoto" : x;

  async function conferma() {
    const daScrivere = {};
    righe.forEach(x => { if (scelte[x.campo] === "fattura" && x.fattura !== "" && !x.uguale) daScrivere[x.campo] = x.fattura; });
    const elenco = Object.entries(daScrivere).map(([k, v]) => `${righe.find(x => x.campo === k).etichetta}: «${mostra(righe.find(x => x.campo === k).scheda)}» → «${v}»`);
    if (!window.confirm(`Confermi l'abbinamento?\n\nFattura ${r.numero_fattura || "senza numero"} del ${dataIt(r.data_fattura)} (${euro(r.importo)})\n→ ${nomeOgg}\n\n${elenco.length ? `Sulla scheda dell'app verrà scritto:\n${elenco.join("\n")}` : "Sulla scheda dell'app non viene scritto niente."}`)) return;
    setSalvando(true);
    try {
      if (Object.keys(daScrivere).length) {
        let q = supabase.from(tabella).update(daScrivere).eq("id", ogg.id);
        for (const k of Object.keys(daScrivere)) { const v = ogg[k]; q = (v === null || v === undefined) ? q.is(k, null) : q.eq(k, v); }
        const { data, error } = await q.select("id");
        if (error) throw new Error(error.message);
        if (!data || data.length !== 1) throw new Error("La scheda è stata cambiata da qualcun altro nel frattempo (oppure manca il permesso): niente salvato. Ricaricare la pagina.");
      }
      const prima = Object.fromEntries(Object.keys(daScrivere).map(k => [k, ogg[k] ?? null]));
      const { data: d2, error: e2 } = await supabase.from("ci_report_acquisto_animali").update({
        ...(lotto ? { lotto_id: lotto.id } : { animale_id: a.id }), stato: "ABBINATO", abbinamento_motivo: motivo, abbinato_at: new Date().toISOString(),
        scheda_prima: Object.keys(prima).length ? prima : null,
      }).eq("id", r.id).is("animale_id", null).is("lotto_id", null).select("id");
      if (e2) throw new Error(e2.message);
      if (!d2 || d2.length !== 1) throw new Error("La riga di fattura risulta già abbinata: ricaricare la pagina.");
      onFatto();
    } catch (e) { alert(`⚠️ ${e.message}`); }
    setSalvando(false);
  }

  return (
    <div style={{ background: "#F4F8F5", border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginTop: 10 }}>
      <table style={{ fontSize: 13 }}>
        <thead><tr style={{ color: C.muted, textAlign: "left" }}><th style={{ padding: 4 }}>Campo</th><th style={{ padding: 4 }}>Scheda dell'app</th><th style={{ padding: 4 }}>Fattura</th><th style={{ padding: 4 }}>Cosa fare</th></tr></thead>
        <tbody>{righe.map(x => (
          <tr key={x.campo} style={{ borderTop: `1px solid ${C.border}` }}>
            <td style={{ padding: 4, fontWeight: 700 }}>{x.etichetta}</td>
            <td style={{ padding: 4 }}>{x.euro ? (x.scheda === "" ? "vuoto" : euro(x.scheda)) : x.data ? (x.scheda ? dataIt(x.scheda) : "vuoto") : mostra(x.scheda)}</td>
            <td style={{ padding: 4 }}>{x.euro ? (x.fattura === "" ? "—" : euro(x.fattura)) : x.data ? (x.fattura ? dataIt(x.fattura) : "—") : (x.fattura || "—")}</td>
            <td style={{ padding: 4 }}>
              {x.uguale ? <span style={{ color: C.green }}>uguale</span>
                : x.fattura === "" ? <span style={{ color: C.muted }}>niente da scrivere</span>
                : x.scheda === "" ? <label><input type="checkbox" checked={scelte[x.campo] === "fattura"} onChange={e => setScelte({ ...scelte, [x.campo]: e.target.checked ? "fattura" : "scheda" })} /> scrivi quello della fattura</label>
                : <span style={{ display: "flex", gap: 10 }}>
                    <label><input type="radio" checked={scelte[x.campo] === "scheda"} onChange={() => setScelte({ ...scelte, [x.campo]: "scheda" })} /> tieni la scheda</label>
                    <label><input type="radio" checked={scelte[x.campo] === "fattura"} onChange={() => setScelte({ ...scelte, [x.campo]: "fattura" })} /> usa la fattura</label>
                  </span>}
            </td>
          </tr>))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={conferma} disabled={salvando} style={bottone(C.green)}>{salvando ? "Salvataggio…" : "✓ Conferma l'abbinamento"}</button>
        <button onClick={onAnnulla} style={bottone(C.muted, false)}>Annulla</button>
      </div>
    </div>
  );
}

// Annullamento di un abbinamento confermato (versione 275)
const CAMPI_SCHEDA = [["fornitore", "Fornitore"], ["numero_fattura", "Numero fattura"], ["data_fattura", "Data fattura"], ["prezzo_acquisto", "Prezzo d'acquisto"]];
function mostraValore(campo, v) {
  if (v === null || v === undefined || v === "") return "vuoto";
  if (campo === "prezzo_acquisto") return euro(v);
  if (campo === "data_fattura") return dataIt(v);
  return String(v);
}
function PannelloAnnulla({ r, a, lotto, onFatto, onChiudi }) {
  const prima = r.scheda_prima || {};
  const [scelte, setScelte] = useState(() => Object.fromEntries(CAMPI_SCHEDA.map(([k]) => [k, k in prima ? "prima" : "lascia"])));
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const nome = a ? (a.bdn || a.nome) : r.animale_id ? `capo n. ${r.animale_id}` : lotto ? `lotto ${lotto.codice_lotto || lotto.codice}` : `lotto n. ${r.lotto_id}`;
  const ogg = a || lotto; // scheda dell'app su cui si rimettono i valori (capo o lotto)
  const tabella = a ? "animali" : "lotti_suini";

  async function annulla() {
    if (!motivo.trim()) { alert("Scrivere il motivo dell'annullamento."); return; }
    const daScrivere = {};
    if (ogg) CAMPI_SCHEDA.forEach(([k]) => {
      const nuovo = scelte[k] === "prima" ? (prima[k] ?? null) : scelte[k] === "svuota" ? null : undefined;
      if (nuovo !== undefined && (ogg[k] ?? null) !== nuovo) daScrivere[k] = nuovo;
    });
    const elenco = Object.entries(daScrivere).map(([k, v]) => `${CAMPI_SCHEDA.find(x => x[0] === k)[1]}: «${mostraValore(k, ogg[k])}» → «${mostraValore(k, v)}»`);
    if (!window.confirm(`Annullare l'abbinamento?\n\nFattura ${r.numero_fattura || "senza numero"} del ${dataIt(r.data_fattura)} (${euro(r.importo)})\n→ ${nome}\n\nLa riga torna da abbinare e ${nome} non verrà più proposto per questa riga (si può ripristinare da «Da valutare»).\n\n${elenco.length ? `Sulla scheda dell'app verrà scritto:\n${elenco.join("\n")}` : "Sulla scheda dell'app non viene scritto niente."}`)) return;
    setSalvando(true);
    try {
      if (ogg && Object.keys(daScrivere).length) {
        let q = supabase.from(tabella).update(daScrivere).eq("id", ogg.id);
        for (const k of Object.keys(daScrivere)) { const v = ogg[k]; q = (v === null || v === undefined) ? q.is(k, null) : q.eq(k, v); }
        const { data, error } = await q.select("id");
        if (error) throw new Error(error.message);
        if (!data || data.length !== 1) throw new Error("La scheda è stata cambiata da qualcun altro nel frattempo (oppure manca il permesso): niente salvato. Ricaricare la pagina.");
      }
      const chiave = r.animale_id ? `animale:${r.animale_id}` : `lotto:${r.lotto_id}`;
      const riga = `${chiave} — abbinamento annullato: ${motivo.trim()} — ${new Date().toLocaleDateString("it-IT")}`;
      let q2 = supabase.from("ci_report_acquisto_animali").update({
        animale_id: null, lotto_id: null, stato: "DA_ELABORARE", abbinamento_motivo: null, abbinato_at: null, scheda_prima: null,
        rifiuto_motivo: `${r.rifiuto_motivo ? r.rifiuto_motivo + "\n" : ""}${riga}`,
      }).eq("id", r.id).eq("stato", "ABBINATO");
      q2 = r.animale_id ? q2.eq("animale_id", r.animale_id) : q2.eq("lotto_id", r.lotto_id);
      const { data: d2, error: e2 } = await q2.select("id");
      if (e2) throw new Error(e2.message);
      if (!d2 || d2.length !== 1) throw new Error("La riga di fattura è stata cambiata nel frattempo: ricaricare la pagina.");
      onFatto();
    } catch (e) { alert(`⚠️ ${e.message}`); }
    setSalvando(false);
  }

  return (
    <div style={{ background: "#FDF1F0", border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginTop: 10 }}>
      {ogg ? (<>
        <div style={{ fontSize: 12.5, marginBottom: 6 }}>Cosa fare dei dati scritti sulla scheda {a ? "di" : "del"} <b>{nome}</b> nell'app:</div>
        <table style={{ fontSize: 13 }}>
          <thead><tr style={{ color: C.muted, textAlign: "left" }}><th style={{ padding: 4 }}>Campo</th><th style={{ padding: 4 }}>Scheda oggi</th><th style={{ padding: 4 }}>Prima dell'abbinamento</th><th style={{ padding: 4 }}>Cosa fare</th></tr></thead>
          <tbody>{CAMPI_SCHEDA.map(([k, et]) => (
            <tr key={k} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: 4, fontWeight: 700 }}>{et}</td>
              <td style={{ padding: 4 }}>{mostraValore(k, ogg[k])}</td>
              <td style={{ padding: 4 }}>{k in prima ? mostraValore(k, prima[k]) : <span style={{ color: C.muted }}>non scritto da questo abbinamento o non noto</span>}</td>
              <td style={{ padding: 4 }}>
                <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <label><input type="radio" checked={scelte[k] === "lascia"} onChange={() => setScelte({ ...scelte, [k]: "lascia" })} /> lascia com'è</label>
                  {k in prima
                    ? <label><input type="radio" checked={scelte[k] === "prima"} onChange={() => setScelte({ ...scelte, [k]: "prima" })} /> rimetti il valore di prima</label>
                    : <label><input type="radio" checked={scelte[k] === "svuota"} onChange={() => setScelte({ ...scelte, [k]: "svuota" })} /> svuota</label>}
                </span>
              </td>
            </tr>))}
          </tbody>
        </table>
      </>) : <div style={{ fontSize: 12.5 }}>{r.animale_id ? "Il capo non si trova più nell'app" : "Il lotto non si trova più nell'app"}: annullando, si toglie solo il collegamento. I dati nell'app non cambiano.</div>}
      <div style={{ marginTop: 10, fontSize: 12.5 }}>
        Motivo dell'annullamento (obbligatorio):{" "}
        <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="es. capo sbagliato, la fattura è di IT…"
          style={{ padding: "5px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12.5, width: 380 }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={annulla} disabled={salvando} style={bottone(C.red)}>{salvando ? "Salvataggio…" : "Annulla l'abbinamento"}</button>
        <button onClick={onChiudi} style={bottone(C.muted, false)}>Chiudi</button>
      </div>
    </div>
  );
}

// Proposte scartate di una riga (righe «animale:ID — motivo — data» o «lotto:ID — …» di rifiuto_motivo)
function scartate(r) {
  return (r.rifiuto_motivo || "").split("\n").map((testo, i) => ({ i, testo, m: testo.match(/^(animale|lotto):(\d+) — (.*)$/) })).filter(x => x.m);
}

export default function AbbinamentiFatture() {
  const [dati, setDati] = useState(null);
  const [vista, setVista] = useState("sicure");
  const [aperto, setAperto] = useState(null); // `${rigaId}|${animaleId}`
  const [annullando, setAnnullando] = useState(null); // id della riga abbinata da annullare
  const [errore, setErrore] = useState("");

  async function carica() {
    try {
      const [r, f, a, l] = await Promise.all([
        fetchAllPages((da, b) => supabase.from("ci_report_acquisto_animali").select("*").order("data_fattura").range(da, b)),
        fetchAllPages((da, b) => supabase.from("ci_fornitori").select("id,nome").range(da, b)),
        fetchAllPages((da, b) => supabase.from("animali").select("id,bdn,nome,specie,razza,sesso,provenienza,stato,data_ingresso,fornitore,numero_fattura,data_fattura,prezzo_acquisto").order("id").range(da, b)),
        fetchAllPages((da, b) => supabase.from("lotti_suini").select("id,codice,codice_lotto,tipo_provenienza,fornitore,numero_fattura,data_fattura,prezzo_acquisto,data_parto").eq("tipo_provenienza", "acquistato").range(da, b)),
      ]);
      for (const x of [r, f, a, l]) if (x.error) throw new Error(x.error.message);
      setDati({ righe: r.data, fornitori: new Map(f.data.map(x => [x.id, x.nome])), animali: a.data, lotti: l.data });
    } catch (e) { setErrore(e.message); }
  }
  useEffect(() => { carica(); }, []);

  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;
  if (!dati) return <div style={{ padding: 20, color: C.muted }}>Caricamento…</div>;

  const { righe, fornitori, animali, lotti } = dati;
  const giaCollegati = new Set(righe.filter(r => r.animale_id).map(r => r.animale_id));
  const perBdn = new Map(animali.filter(a => a.bdn).map(a => [normBdn(a.bdn), a]));
  const perId = new Map(animali.map(a => [a.id, a]));
  const lottoPerId = new Map(lotti.map(x => [x.id, x]));
  const libere = righe.filter(r => !r.animale_id && !r.lotto_id && !["RIFIUTATA", "NON_ABBINABILE"].includes(r.stato));
  const trasporti = libere.filter(r => r.fonte === "TRASPORTO_INGRESSO");
  const lottiCollegati = new Set(righe.filter(r => r.lotto_id).map(r => r.lotto_id));
  const perCodiceLotto = new Map(lotti.flatMap(x => [[normBdn(x.codice_lotto), x], [normBdn(x.codice), x]]).filter(([k]) => k));
  const sicure = [], daValutare = [];
  for (const r of libere.filter(r => r.fonte !== "TRASPORTO_INGRESSO")) {
    const nomeF = fornitori.get(r.fornitore_id);
    const no = rifiutati(r);
    const a = r.bdn ? perBdn.get(normBdn(r.bdn)) : null;
    if (a && !no.has(`animale:${a.id}`)) {
      const m = motivi(r, a, nomeF, true);
      if (giaCollegati.has(a.id)) m.push("ATTENZIONE: questo capo è già collegato a un'altra riga di fattura");
      sicure.push({ r, a, nomeF, motivi: m }); continue;
    }
    const loS = r.nr_lotto ? perCodiceLotto.get(normBdn(r.nr_lotto)) : null;
    if (loS && !no.has(`lotto:${loS.id}`)) {
      const m = motiviLotto(r, loS, nomeF, true);
      if (lottiCollegati.has(loS.id)) m.push("ATTENZIONE: questo lotto è già collegato a un'altra riga di fattura");
      sicure.push({ r, lotto: loS, nomeF, motivi: m }); continue;
    }
    // Candidati: capi acquistati, non già collegati, stessa specie se indicata, entrati entro 120 giorni
    const cand = animali.filter(x => x.provenienza === "Acquistato" && !giaCollegati.has(x.id) && !no.has(`animale:${x.id}`)
      && (!specieDi(r.specie) || specieDi(r.specie) === specieDi(x.specie)) && (giorni(x.data_ingresso, r.data_fattura) ?? 999) <= 120)
      .map(x => {
        let punti = 0;
        if (stessoFornitore(x.fornitore, nomeF)) punti += 3;
        const g = giorni(x.data_ingresso, r.data_fattura); if (g != null) punti += g <= 7 ? 2 : g <= 30 ? 1 : 0;
        const p = prezzoRiga(r); if (p != null && round2(parseFloat(x.prezzo_acquisto) || 0) === p) punti += 2;
        if ((x.numero_fattura || "").trim() && (x.numero_fattura || "").trim().toUpperCase() === (r.numero_fattura || "").trim().toUpperCase()) punti += 3;
        return { x, punti };
      }).filter(c => c.punti >= 3);
    // Lotti di suini acquistati, non già collegati, entrati entro 120 giorni (solo se la riga non è di un'altra specie)
    const candLotti = (specieDi(r.specie) && specieDi(r.specie) !== "suino") ? [] : lotti.filter(x => !lottiCollegati.has(x.id) && !no.has(`lotto:${x.id}`)
      && (giorni(x.data_parto, r.data_fattura) ?? 999) <= 120)
      .map(x => {
        let punti = 0;
        if (stessoFornitore(x.fornitore, nomeF)) punti += 3;
        const g = giorni(x.data_parto, r.data_fattura); if (g != null) punti += g <= 7 ? 2 : g <= 30 ? 1 : 0;
        const imp = importoRiga(r); if (imp != null && round2(parseFloat(x.prezzo_acquisto) || 0) === imp) punti += 2;
        if ((x.numero_fattura || "").trim() && (x.numero_fattura || "").trim().toUpperCase() === (r.numero_fattura || "").trim().toUpperCase()) punti += 3;
        return { x, lotto: true, punti };
      }).filter(c => c.punti >= 3);
    daValutare.push({ r, nomeF, cand: [...cand, ...candLotti].sort((p, q) => q.punti - p.punti).slice(0, 5) });
  }
  const daConfermare = righe.filter(r => (r.animale_id || r.lotto_id) && r.stato !== "ABBINATO");
  const abbinate = righe.filter(r => r.stato === "ABBINATO");
  const senzaCapo = righe.filter(r => ["RIFIUTATA", "NON_ABBINABILE"].includes(r.stato));

  async function rifiuta(r, chiave) {
    const motivo = window.prompt("Perché questa proposta è sbagliata?");
    if (motivo === null) return;
    const testo = `${r.rifiuto_motivo ? r.rifiuto_motivo + "\n" : ""}${chiave} — ${motivo || "senza motivo"} — ${new Date().toLocaleDateString("it-IT")}`;
    const { error } = await supabase.from("ci_report_acquisto_animali").update({ rifiuto_motivo: testo }).eq("id", r.id);
    if (error) alert(`⚠️ ${error.message}`); else carica();
  }
  async function nessuno(r) {
    const motivo = window.prompt("Nessun capo o lotto corrisponde: scrivere il motivo (es. «capo mai registrato nell'app»).");
    if (!motivo) return;
    const { error } = await supabase.from("ci_report_acquisto_animali").update({ stato: "NON_ABBINABILE", rifiuto_motivo: `${r.rifiuto_motivo ? r.rifiuto_motivo + "\n" : ""}nessun capo — ${motivo} — ${new Date().toLocaleDateString("it-IT")}` }).eq("id", r.id);
    if (error) alert(`⚠️ ${error.message}`); else carica();
  }
  async function confermaEsistente(r) {
    if (!window.confirm("Confermi che questo collegamento già presente è giusto? Sulla scheda dell'app non viene scritto niente.")) return;
    const { error } = await supabase.from("ci_report_acquisto_animali").update({ stato: "ABBINATO", abbinamento_motivo: "collegamento già presente, confermato", abbinato_at: new Date().toISOString() }).eq("id", r.id);
    if (error) alert(`⚠️ ${error.message}`); else carica();
  }

  async function ripristina(r, x) {
    const nomeC = x.m[1] === "animale" ? (perId.get(Number(x.m[2]))?.bdn || `capo n. ${x.m[2]}`) : (lottoPerId.get(Number(x.m[2])) ? `lotto ${nomeLotto(lottoPerId.get(Number(x.m[2])))}` : `lotto n. ${x.m[2]}`);
    if (!window.confirm(`Ripristinare la proposta ${nomeC} per questa riga?\n\nScartata con il motivo: ${x.m[3]}`)) return;
    const righeTesto = (r.rifiuto_motivo || "").split("\n");
    righeTesto[x.i] = `ripristinata la proposta ${x.m[1]} n. ${x.m[2]} (scartata: ${x.m[3]}) — ${new Date().toLocaleDateString("it-IT")}`;
    const { data, error } = await supabase.from("ci_report_acquisto_animali").update({ rifiuto_motivo: righeTesto.join("\n") }).eq("id", r.id).eq("rifiuto_motivo", r.rifiuto_motivo).select("id");
    if (error) alert(`⚠️ ${error.message}`); else if (!data || data.length !== 1) alert("⚠️ La riga è stata cambiata nel frattempo: ricaricare la pagina."); else carica();
  }
  async function riapri(r) {
    const motivo = window.prompt("Perché questa riga va rimessa tra quelle da abbinare?");
    if (!motivo) return;
    const { data, error } = await supabase.from("ci_report_acquisto_animali").update({ stato: "DA_ELABORARE", rifiuto_motivo: `${r.rifiuto_motivo ? r.rifiuto_motivo + "\n" : ""}riaperta — ${motivo} — ${new Date().toLocaleDateString("it-IT")}` })
      .eq("id", r.id).in("stato", ["RIFIUTATA", "NON_ABBINABILE"]).is("animale_id", null).is("lotto_id", null).select("id");
    if (error) alert(`⚠️ ${error.message}`); else if (!data || data.length !== 1) alert("⚠️ La riga è stata cambiata nel frattempo: ricaricare la pagina."); else carica();
  }
  const Scartate = ({ r }) => {
    const el = scartate(r);
    if (!el.length) return null;
    return (
      <div style={{ marginTop: 8, fontSize: 12.5, background: "#FAFAF8", borderRadius: 6, padding: "6px 10px" }}>
        <div style={{ color: C.muted, fontWeight: 700, marginBottom: 2 }}>Proposte scartate per questa riga:</div>
        {el.map(x => (
          <div key={x.i} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3 }}>
            <span>{x.m[1] === "animale" ? (perId.get(Number(x.m[2]))?.bdn || `capo n. ${x.m[2]}`) : (lottoPerId.get(Number(x.m[2])) ? `lotto ${nomeLotto(lottoPerId.get(Number(x.m[2])))}` : `lotto n. ${x.m[2]}`)} — {x.m[3]}</span>
            <button onClick={() => ripristina(r, x)} style={{ ...bottone(C.blue, false), padding: "2px 8px", fontSize: 11.5 }}>↩ Ripristina la proposta</button>
          </div>))}
      </div>
    );
  };

  const Intestazione = ({ r, nomeF }) => (
    <div style={{ fontSize: 13.5 }}>
      <b>Fattura {r.numero_fattura || "senza numero"}</b> del {dataIt(r.data_fattura)} — {nomeF || "fornitore ignoto"} — <b>{euro(r.importo)}</b>
      {r.quantita && parseFloat(r.quantita) !== 1 ? ` (${r.quantita} capi a ${euro(r.prezzo_unitario)})` : ""}
      {r.bdn ? ` — matricola in fattura ${r.bdn}` : ""}{r.specie ? ` — ${r.specie}` : ""}{r.razza ? `, ${r.razza}` : ""}
      {r.note && <div style={{ fontSize: 12, color: C.muted }}>Nota: {r.note}</div>}
    </div>
  );
  const Capo = ({ a }) => <span><b>{a.bdn || a.nome}</b>{a.nome && a.bdn ? ` (${a.nome})` : ""} — {a.specie}{a.razza ? `, ${a.razza}` : ""}, entrato il {dataIt(a.data_ingresso)}, {a.stato}</span>;
  const Lotto = ({ lo }) => <span><b>lotto {nomeLotto(lo)}</b> — suini acquistati da {lo.fornitore || "fornitore non scritto"}, entrati il {dataIt(lo.data_parto)}, prezzo del lotto {euro(lo.prezzo_acquisto)}</span>;
  const scheda = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 };
  const VISTE = [["sicure", `Proposte sicure (${sicure.length})`], ["valutare", `Da valutare (${daValutare.length})`], ["confermare", `Già collegate, da confermare (${daConfermare.length})`],
    ["trasporti", `Trasporti (${trasporti.length})`], ["abbinate", `Abbinate (${abbinate.length})`], ["scartate", `Senza capo (${senzaCapo.length})`]];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
      <h2 style={{ margin: 0, color: C.primary }}>🔗 Abbinamenti Fatture Acquisto</h2>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Per ogni riga di fattura d'acquisto il programma propone il capo o il lotto di suini dell'app e spiega il motivo. Niente viene salvato senza la conferma.</div>
      <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
        {VISTE.map(([k, t]) => <button key={k} onClick={() => setVista(k)} style={{ ...bottone(C.primary, vista === k), padding: "8px 14px" }}>{t}</button>)}
      </div>
      <div style={{ marginTop: 14 }}>
        {vista === "sicure" && sicure.map(({ r, a, lotto, nomeF, motivi: m }) => { const k = lotto ? `L${lotto.id}` : a.id; return (
          <div key={r.id} style={scheda}>
            <Intestazione r={r} nomeF={nomeF} />
            <div style={{ marginTop: 6, fontSize: 13 }}>→ Proposta: {lotto ? <Lotto lo={lotto} /> : <Capo a={a} />}</div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>Motivo: {m.map((x, i) => <span key={i} style={{ color: x.startsWith("ATTENZIONE") ? C.red : C.text }}>{i ? "; " : ""}{x}</span>)}</div>
            {aperto === `${r.id}|${k}`
              ? <PannelloConferma r={r} a={a} lotto={lotto} nomeFornitore={nomeF} motivo={m.join("; ")} onFatto={() => { setAperto(null); carica(); }} onAnnulla={() => setAperto(null)} />
              : <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => setAperto(`${r.id}|${k}`)} style={bottone(C.green)}>Esamina e conferma</button>
                  <button onClick={() => rifiuta(r, lotto ? `lotto:${lotto.id}` : `animale:${a.id}`)} style={bottone(C.red, false)}>Rifiuta</button>
                </div>}
          </div>); })}
        {vista === "valutare" && daValutare.map(({ r, nomeF, cand }) => (
          <div key={r.id} style={scheda}>
            <Intestazione r={r} nomeF={nomeF} />
            {cand.length === 0 && <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>Nessun capo e nessun lotto di suini dell'app corrisponde (stesso fornitore o stessa fattura, entrato entro 120 giorni). Può essere un gruppo di capi o un capo mai registrato.</div>}
            {cand.map(({ x, lotto }) => { const k = lotto ? `L${x.id}` : x.id; const mm = lotto ? motiviLotto(r, x, nomeF, false) : motivi(r, x, nomeF, false); return (
              <div key={k} style={{ borderTop: `1px dashed ${C.border}`, marginTop: 8, paddingTop: 8, fontSize: 13 }}>
                → Candidato: {lotto ? <Lotto lo={x} /> : <Capo a={x} />}
                <div style={{ fontSize: 12.5, marginTop: 3 }}>Motivo: {mm.map((t, i) => <span key={i} style={{ color: t.startsWith("ATTENZIONE") ? C.red : C.text }}>{i ? "; " : ""}{t}</span>)}</div>
                {aperto === `${r.id}|${k}`
                  ? <PannelloConferma r={r} a={lotto ? null : x} lotto={lotto ? x : null} nomeFornitore={nomeF} motivo={mm.join("; ")} onFatto={() => { setAperto(null); carica(); }} onAnnulla={() => setAperto(null)} />
                  : <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button onClick={() => setAperto(`${r.id}|${k}`)} style={bottone(C.green)}>Esamina e conferma</button>
                      <button onClick={() => rifiuta(r, lotto ? `lotto:${x.id}` : `animale:${x.id}`)} style={bottone(C.red, false)}>Non è questo</button>
                    </div>}
              </div>); })}
            <Scartate r={r} />
            <div style={{ marginTop: 8 }}><button onClick={() => nessuno(r)} style={bottone(C.muted, false)}>Nessun capo o lotto corrisponde</button></div>
          </div>))}
        {vista === "confermare" && daConfermare.map(r => {
          const a = r.animale_id ? perId.get(r.animale_id) : null; const lo = r.lotto_id ? lottoPerId.get(r.lotto_id) : null; const nomeF = fornitori.get(r.fornitore_id);
          return (
            <div key={r.id} style={scheda}>
              <Intestazione r={r} nomeF={nomeF} />
              <div style={{ marginTop: 6, fontSize: 13 }}>Collegata a: {a ? <Capo a={a} /> : lo ? <b>lotto {lo.codice_lotto || lo.codice}</b> : `lotto ${r.lotto_id}`}</div>
              {a && <div style={{ fontSize: 12.5, marginTop: 4 }}>Verifica: {motivi(r, a, nomeF, !!r.bdn && normBdn(r.bdn) === normBdn(a.bdn)).map((t, i) => <span key={i} style={{ color: t.startsWith("ATTENZIONE") ? C.red : C.text }}>{i ? "; " : ""}{t}</span>)}</div>}
              <div style={{ marginTop: 8 }}><button onClick={() => confermaEsistente(r)} style={bottone(C.green)}>✓ Il collegamento è giusto</button></div>
            </div>);
        })}
        {vista === "trasporti" && (<>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Qui compaiono le parti «Ingresso in allevamento» dei trasporti, divise alla registrazione della fattura (la parte verso il macello va invece nella Lavorazione prodotti allevamento e non entra nel costo degli animali). Decisione del Dott. Bizzarri del 20/10/2026: il trasporto d'ingresso è compreso nel prezzo d'acquisto dei capi. Il suo importo si divide tra i capi di quell'ingresso e si somma al loro prezzo d'acquisto; poi la riga si segna «non abbinabile» con il motivo «trasporto già compreso nel prezzo dei capi», così non si conta due volte.</div>
          {trasporti.map(r => <div key={r.id} style={scheda}><Intestazione r={r} nomeF={fornitori.get(r.fornitore_id)} /></div>)}
        </>)}
        {vista === "abbinate" && abbinate.map(r => {
          const a = r.animale_id ? perId.get(r.animale_id) : null; const lo = r.lotto_id ? lottoPerId.get(r.lotto_id) : null;
          return <div key={r.id} style={scheda}><Intestazione r={r} nomeF={fornitori.get(r.fornitore_id)} />
            <div style={{ fontSize: 13, marginTop: 4 }}>→ {a ? <Capo a={a} /> : lo ? `lotto ${lo.codice_lotto || lo.codice}` : "—"} {r.abbinato_at ? `— confermato il ${new Date(r.abbinato_at).toLocaleDateString("it-IT")}` : ""}</div>
            {r.abbinamento_motivo && <div style={{ fontSize: 12, color: C.muted }}>Motivo: {r.abbinamento_motivo}</div>}
            {annullando === r.id
              ? <PannelloAnnulla r={r} a={a} lotto={lo} onFatto={() => { setAnnullando(null); carica(); }} onChiudi={() => setAnnullando(null)} />
              : <div style={{ marginTop: 8 }}><button onClick={() => setAnnullando(r.id)} style={bottone(C.red, false)}>Annulla l'abbinamento…</button></div>}</div>;
        })}
        {vista === "scartate" && senzaCapo.map(r => <div key={r.id} style={scheda}><Intestazione r={r} nomeF={fornitori.get(r.fornitore_id)} /><div style={{ fontSize: 12, color: C.muted, whiteSpace: "pre-wrap" }}>{r.rifiuto_motivo}</div>
          <div style={{ marginTop: 8 }}><button onClick={() => riapri(r)} style={bottone(C.blue, false)}>↩ Rimetti tra le righe da abbinare</button></div></div>)}
      </div>
    </div>
  );
}
