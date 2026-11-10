import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
import { dataIt, euro } from "./analisiDocumentoBanca";
import { NATURA } from "./propostePrimaNota";

// Versione 354 — «Prima nota» (progetto della prima nota, sezioni 3, 4.1, 8 e 9; decisioni del Dott. Bizzarri del 02/11, 03/11 e 09/11/2026).
// Una sola tabella dei movimenti; la pagina compone i mesi. In cima «In attesa di conferma della banca», fuori da totali e saldi;
// sotto il libro con i soli movimenti confermati (numero dato alla conferma). Ogni mese: saldo iniziale + entrate − uscite = saldo finale,
// e controllo contro l'estratto conto (saldo calcolato dalle righe della banca caricate).
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const centesimi = n => Math.round(Number(n) * 100);
const fineMese = (a, m) => new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
const numero = m => `${m.esercizio}/${String(m.progressivo).padStart(6, "0")}`;
const sigla = c => c.tipo === "banca" ? c.nome.split(" ")[0] + (c.nome.includes("BPER") ? " 2923" : "") : c.tipo === "carta prepagata" ? "Carta " + (c.nome.match(/\d{4}/)?.[0] || "") : c.nome;

export default function PrimaNota() {
  const [anno, setAnno] = useState(2026);
  const [mesi, setMesi] = useState([]);          // [] = tutti i mesi con movimenti
  const [contoFiltro, setContoFiltro] = useState(0);
  const [cerca, setCerca] = useState("");
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState("");

  async function carica() {
    setD(null); setErrore("");
    const [c, s, pa] = await Promise.all([supabase.from("ci_conti").select("id, nome, tipo, stato").order("id"), supabase.from("ci_v_stato_conti").select("*"),
      supabase.from("ci_storico_controlli").select("conto_id, tipo, fonte, annullato_il").eq("tipo", "partenza")]);
    if (c.error || s.error || pa.error) throw new Error((c.error || s.error || pa.error).message);
    const provvisori = new Set((pa.data || []).filter(x => !x.annullato_il && /^PROVVISORI/i.test(x.fonte || "")).map(x => x.conto_id));
    const conti = (c.data || []).filter(x => x.tipo !== "cassa" && (s.data || []).some(y => y.conto_id === x.id && y.partenza_alla_data && y.partenza_alla_data < `${anno}-01-01`));
    const senzaPartenza = (c.data || []).filter(x => !conti.includes(x) && x.stato !== "chiuso");
    const [mov, att, righe] = await Promise.all([
      fetchAllPages((a, b) => supabase.from("ci_pagamenti_fatture").select("id, conto_id, data, data_valuta, verso, importo, controparte, causale, causale_gruppo, causale_voce, causale_altro, natura, modalita, modalita_altro, numero_bonifico, esercizio, progressivo, confermato_il, riga_fonte_id, creato_il, stornato_il, motivo_storno, movimento_collegato_id, codice_attesa, data_disposizione")
        .eq("esercizio", anno).order("progressivo").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_pagamenti_fatture").select("id, conto_id, data, verso, importo, controparte, causale, confermato_il, codice_attesa, data_disposizione, causale_voce")
        .gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`).order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_righe_fonte").select("id, conto_id, data_contabile, documento_id").gte("data_contabile", `${anno}-01-01`).lte("data_contabile", `${anno}-12-31`).order("id").range(a, b)),
    ]);
    for (const x of [mov, att, righe]) if (x.error) throw new Error(x.error.message);
    const copertoAl = (contoId, giorno) => { const st = (s.data || []).find(y => y.conto_id === contoId); return !!st?.controllo_ok_alla_data && giorno <= st.controllo_ok_alla_data; };
    const docs = await fetchAllPages((a, b) => supabase.from("ci_documenti_fonte").select("id, annullato_il").order("id").range(a, b));
    if (docs.error) throw new Error(docs.error.message);
    const vivi = new Set((docs.data || []).filter(x => !x.annullato_il).map(x => x.id));
    const confermate = new Set((mov.data || []).map(m => m.riga_fonte_id));
    const daConfermare = (righe.data || []).filter(r => vivi.has(r.documento_id) && !confermate.has(r.id) && conti.some(c => c.id === r.conto_id));
    // saldi dell'estratto: al 31/12 dell'anno prima (partenza della prima nota) e a fine di ogni mese
    const estratto = {};
    for (const cc of conti) {
      estratto[cc.id] = {};
      const giorni = [`${anno - 1}-12-31`, ...MESI.map((_, i) => fineMese(anno, i + 1))];
      const st = (s.data || []).find(y => y.conto_id === cc.id);
      const res = await Promise.all(giorni.map(g => supabase.rpc("ci_saldo_al", { p_conto: cc.id, p_giorno: g })));
      const err = res.find(x => x.error); if (err) throw new Error("saldo dell'estratto: " + err.error.message);
      giorni.forEach((g, i) => { estratto[cc.id][g] = { saldo: res[i].data === null ? null : Number(res[i].data), coperto: !!st?.controllo_ok_alla_data && g <= st.controllo_ok_alla_data }; });
    }
    setD({ conti, provvisori, senzaPartenza, movimenti: mov.data || [], inAttesa: (att.data || []).filter(m => !m.confermato_il && conti.some(c => c.id === m.conto_id) && (m.codice_attesa || !copertoAl(m.conto_id, m.data))),
      nonConfermati: (att.data || []).filter(m => !m.confermato_il && !m.codice_attesa && conti.some(c => c.id === m.conto_id) && copertoAl(m.conto_id, m.data)), daConfermare, estratto });
  }
  useEffect(() => { carica().catch(x => setErrore("Lettura non riuscita: " + x.message)); }, [anno]);

  const conti = useMemo(() => (d?.conti || []).filter(c => !contoFiltro || c.id === contoFiltro), [d, contoFiltro]);
  const blocchi = useMemo(() => {
    if (!d) return [];
    const t = cerca.trim().toLowerCase();
    const filtra = m => conti.some(c => c.id === m.conto_id) && (!t || [m.controparte, m.causale, m.causale_voce, m.causale_altro, m.modalita, m.numero_bonifico, numero(m)].some(v => String(v || "").toLowerCase().includes(t)));
    const saldo = {}; for (const c of conti) { const s0 = d.estratto[c.id][`${anno - 1}-12-31`].saldo; if (s0 == null) return []; saldo[c.id] = centesimi(s0); }
    const out = [];
    for (let i = 1; i <= 12; i++) {
      const g1 = `${anno}-${String(i).padStart(2, "0")}-01`, g2 = fineMese(anno, i);
      const tuttiDelMese = d.movimenti.filter(m => m.data >= g1 && m.data <= g2 && conti.some(c => c.id === m.conto_id))
        .sort((a, b) => a.data.localeCompare(b.data) || a.progressivo - b.progressivo);
      const iniziale = { ...saldo };
      const tot = {}; for (const c of conti) tot[c.id] = { e: 0, u: 0 };
      for (const m of tuttiDelMese) { tot[m.conto_id][m.verso === "entrata" ? "e" : "u"] += centesimi(m.importo); saldo[m.conto_id] += (m.verso === "entrata" ? 1 : -1) * centesimi(m.importo); }
      const righe = tuttiDelMese.filter(filtra);
      const mancanti = d.daConfermare.filter(r => r.data_contabile >= g1 && r.data_contabile <= g2 && conti.some(c => c.id === r.conto_id));
      if (!tuttiDelMese.length && !mancanti.length) continue;
      const controllo = conti.map(c => { const e = d.estratto[c.id][g2]; return { conto: c, prima: saldo[c.id], estratto: e?.saldo == null ? null : centesimi(e.saldo), coperto: e?.coperto, mancanti: mancanti.filter(r => r.conto_id === c.id).length }; });
      out.push({ mese: i, iniziale, finale: { ...saldo }, tot, righe, controllo, nascosti: tuttiDelMese.length - righe.length });
    }
    return out.filter(b => !mesi.length || mesi.includes(b.mese));
  }, [d, conti, cerca, mesi, anno]);

  function excel() {
    const wb = XLSX.utils.book_new(); const ora = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
    const testa = (titolo) => [["SOCIETA' AGRICOLA PODERE VERDE A R.L."], [titolo], [`Scaricato il ${ora}${contoFiltro ? " — conto: " + conti[0]?.nome : ""}${cerca ? " — ricerca: " + cerca : ""}`], []];
    const intest = ["Numero", "Data dell'addebito o dell'accredito", "Data di disposizione", "Data valuta", "Natura", "Conto", "Soggetto", "Causale contabile", "Modalità", "Descrizione", ...conti.flatMap(c => [`${c.nome} entrate`, `${c.nome} uscite`])];
    const riepilogo = [...testa(`Prima nota ${anno} — riepilogo PROVVISORIO (mesi non chiusi)`), ["Mese", ...conti.flatMap(c => [`${c.nome} saldo iniziale`, "entrate", "uscite", "saldo finale", "saldo estratto conto"])]];
    for (const b of blocchi) {
      const righe = [...testa(`Prima nota ${MESI[b.mese - 1]} ${anno} — PROVVISORIA (mese non chiuso)`), intest,
        ["", "", "", "", "", "SALDI AL " + dataIt(`${anno}-${String(b.mese).padStart(2, "0")}-01`), "", "", "", "", ...conti.flatMap(c => [b.iniziale[c.id] / 100, ""])],
        ...b.righe.map(m => [numero(m), dataIt(m.data), m.data_disposizione ? dataIt(m.data_disposizione) : "", m.data_valuta ? dataIt(m.data_valuta) : "", m.natura, conti.find(c => c.id === m.conto_id)?.nome, m.controparte || "",
          m.causale_voce === "Altro" ? `Altro: ${m.causale_altro}` : m.causale_voce, m.modalita === "Altro" ? `Altro: ${m.modalita_altro}` : m.modalita, m.causale || "",
          ...conti.flatMap(c => c.id === m.conto_id ? [m.verso === "entrata" ? Number(m.importo) : "", m.verso === "uscita" ? Number(m.importo) : ""] : ["", ""])]),
        ["", "", "", "", "", "TOTALI", "", "", "", "", ...conti.flatMap(c => [b.tot[c.id].e / 100, b.tot[c.id].u / 100])],
        ["", "", "", "", "", "SALDO FINALE", "", "", "", "", ...conti.flatMap(c => [b.finale[c.id] / 100, ""])]];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(righe), `${anno}-${String(b.mese).padStart(2, "0")}`);
      riepilogo.push([MESI[b.mese - 1], ...b.controllo.flatMap(k => [b.iniziale[k.conto.id] / 100, b.tot[k.conto.id].e / 100, b.tot[k.conto.id].u / 100, k.prima / 100, k.estratto == null ? "" : k.estratto / 100])]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(riepilogo), "Riepilogo", true);
    const att = [...testa(`In attesa di conferma della banca — fuori da totali e saldi`), ["Movimento", "Data di disposizione", "Conto", "Entrata o uscita", "Importo", "Soggetto", "Causale"],
      ...d.inAttesa.map(m => [m.codice_attesa || m.id, dataIt(m.data_disposizione || m.data), d.conti.find(c => c.id === m.conto_id)?.nome, m.verso, Number(m.importo), m.controparte || "", m.causale || ""])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(att), "In attesa");
    const quali = mesi.length ? mesi.map(m => String(m).padStart(2, "0")).join("+") : "anno";
    XLSX.writeFile(wb, `Prima nota Podere Verde ${anno}-${quali}${contoFiltro ? " " + sigla(conti[0]) : ""}.xlsx`);
  }

  if (errore) return <div style={{ color: C.red }}>{errore}</div>;
  if (!d) return <div>Lettura in corso…</div>;
  const th = { padding: "5px 7px", textAlign: "left", whiteSpace: "nowrap" };
  return (
    <div style={{ maxWidth: "100%" }}>
      <h2 style={{ color: C.primary, margin: "0 0 4px" }}>Prima nota {anno}</h2>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 10 }}>Movimenti confermati dalla banca, con il numero di prima nota, mese per mese. Il saldo di ogni mese è confrontato con l'estratto conto. I mesi sono tutti aperti (provvisori): la chiusura del mese non è ancora nel programma.</div>
      <div style={{ ...scheda, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label>Anno <select style={input} value={anno} onChange={e => setAnno(Number(e.target.value))}>{[2026, 2027].map(a => <option key={a}>{a}</option>)}</select></label>
        <label>Conto <select style={input} value={contoFiltro} onChange={e => setContoFiltro(Number(e.target.value))}><option value={0}>tutti</option>{d.conti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
        <input style={{ ...input, flex: "1 1 220px" }} placeholder="cerca: soggetto, causale, voce, numero…" value={cerca} onChange={e => setCerca(e.target.value)} />
        <button style={btn(true)} onClick={excel}>Scarica in Excel</button>
        <div style={{ width: "100%", fontSize: 12.5 }}>Mesi: {MESI.map((m, i) => <label key={m} style={{ marginRight: 8, whiteSpace: "nowrap" }}><input type="checkbox" checked={mesi.includes(i + 1)} onChange={e => setMesi(e.target.checked ? [...mesi, i + 1].sort((a, b) => a - b) : mesi.filter(x => x !== i + 1))} /> {m}</label>)}
          {mesi.length > 0 && <button style={btn(false)} onClick={() => setMesi([])}>tutti</button>}</div>
      </div>
      {d.conti.some(c => d.provvisori.has(c.id)) && <div style={{ ...scheda, borderLeft: `4px solid ${C.red}`, fontSize: 13 }}>Partenza provvisoria (saldi da confermare con il documento della banca): {d.conti.filter(c => d.provvisori.has(c.id)).map(c => c.nome).join(", ")}.</div>}
      {d.senzaPartenza.length > 0 && <div style={{ ...scheda, borderLeft: `4px solid ${C.yellow}`, fontSize: 13 }}>Non in prima nota perché senza partenza o senza documenti della fonte: {d.senzaPartenza.map(c => c.nome).join(", ")}.</div>}

      <div style={{ ...scheda, borderLeft: `4px solid ${C.blue}` }}>
        <div style={{ fontWeight: 800, color: C.blue, marginBottom: 4 }}>In attesa di conferma della banca ({d.inAttesa.length}) — fuori da totali e saldi</div>
        {d.nonConfermati.length > 0 && <div style={{ fontSize: 13, color: C.red, fontWeight: 700, marginBottom: 4 }}>{d.nonConfermati.length} movimenti del programma hanno già la riga nell'estratto caricato ma non sono ancora confermati: pagina «Conferma dei movimenti».</div>}
        {d.inAttesa.length === 0 ? <div style={{ fontSize: 13 }}>Nessun movimento in attesa.</div>
          : <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}><tbody>{d.inAttesa.map(m => { const giorni = Math.round((Date.now() - new Date((m.data_disposizione || m.data) + "T12:00:00Z")) / 864e5); return <tr key={m.id} style={{ borderBottom: `1px solid ${C.border}`, color: giorni > 2 ? C.red : C.text }}>
            <td style={th}>{m.codice_attesa ? <b>{m.codice_attesa}</b> : `movimento n. ${m.id}`}</td><td style={th}>disposto il {dataIt(m.data_disposizione || m.data)} ({giorni} giorni)</td><td style={th}>{d.conti.find(c => c.id === m.conto_id)?.nome}</td><td style={th}>{m.verso}</td><td style={{ ...th, textAlign: "right" }}>{euro(m.importo)}</td><td style={th}>{m.controparte}</td><td style={th}>{m.causale}</td></tr>; })}</tbody></table>}
      </div>

      {blocchi.map(b => <div key={b.mese} style={scheda}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><div style={{ fontWeight: 800, color: C.primary, fontSize: 16, flex: 1 }}>{MESI[b.mese - 1]} {anno} <span style={{ fontSize: 12, color: C.yellow }}>aperto — provvisorio</span></div>
          {b.nascosti > 0 && <div style={{ fontSize: 12, color: C.muted }}>{b.nascosti} movimenti nascosti dalla ricerca (i saldi restano completi)</div>}</div>
        <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Numero", "Data dell'addebito o dell'accredito", "Data di disposizione", "Data valuta", "Natura", "Soggetto", "Causale contabile", "Modalità", "Descrizione"].map(h => <th key={h} style={th}>{h}</th>)}
            {conti.map(c => <th key={c.id} colSpan={2} style={{ ...th, textAlign: "center" }}>{c.nome}</th>)}</tr>
            <tr style={{ background: `${C.primary}22` }}><td colSpan={9} style={{ ...th, fontWeight: 800 }}>SALDI AL {dataIt(`${anno}-${String(b.mese).padStart(2, "0")}-01`)}</td>{conti.map(c => <td key={c.id} colSpan={2} style={{ ...th, textAlign: "center", fontWeight: 800 }}>{euro(b.iniziale[c.id] / 100)}{d.provvisori.has(c.id) ? <div style={{ fontSize: 10.5, color: C.red }}>partenza provvisoria</div> : null}</td>)}</tr>
            <tr style={{ background: `${C.primary}11`, fontSize: 11 }}><td colSpan={9} />{conti.map(c => [<td key={c.id + "e"} style={{ ...th, textAlign: "right" }}>Entrate</td>, <td key={c.id + "u"} style={{ ...th, textAlign: "right" }}>Uscite</td>])}</tr></thead>
          <tbody>{b.righe.map(m => <tr key={m.id} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ ...th, fontWeight: 700, textDecoration: m.stornato_il ? "line-through" : "none" }} title={m.stornato_il ? `stornato: ${m.motivo_storno}` : ""}>{numero(m)}{m.stornato_il ? <div style={{ fontSize: 10, color: C.red, textDecoration: "none" }}>STORNATO</div> : null}</td><td style={th}>{dataIt(m.data)}</td><td style={th}>{m.data_disposizione ? dataIt(m.data_disposizione) : "—"}</td><td style={th}>{m.data_valuta ? dataIt(m.data_valuta) : ""}</td>
            <td style={th} title={NATURA[m.natura]}>{m.natura}</td><td style={{ ...th, whiteSpace: "normal" }}>{m.controparte}</td>
            <td style={{ ...th, whiteSpace: "normal" }}>{m.causale_voce === "Altro" ? `Altro: ${m.causale_altro}` : m.causale_voce}</td><td style={th}>{m.modalita === "Altro" ? `Altro: ${m.modalita_altro}` : m.modalita}</td>
            <td style={{ ...th, whiteSpace: "normal", maxWidth: 240, fontSize: 11 }}>{m.causale}</td>
            {conti.map(c => [<td key={c.id + "e"} style={{ ...th, textAlign: "right", color: C.green }}>{c.id === m.conto_id && m.verso === "entrata" ? euro(m.importo) : ""}</td>,
              <td key={c.id + "u"} style={{ ...th, textAlign: "right", color: C.red }}>{c.id === m.conto_id && m.verso === "uscita" ? euro(m.importo) : ""}</td>])}
          </tr>)}
            <tr style={{ background: `${C.primary}11`, fontWeight: 800 }}><td colSpan={9} style={th}>TOTALI DEL MESE</td>{conti.map(c => [<td key={c.id + "e"} style={{ ...th, textAlign: "right" }}>{euro(b.tot[c.id].e / 100)}</td>, <td key={c.id + "u"} style={{ ...th, textAlign: "right" }}>{euro(b.tot[c.id].u / 100)}</td>])}</tr>
            <tr style={{ background: `${C.primary}22`, fontWeight: 800 }}><td colSpan={9} style={th}>SALDI AL {dataIt(fineMese(anno, b.mese))}</td>{conti.map(c => <td key={c.id} colSpan={2} style={{ ...th, textAlign: "center" }}>{euro(b.finale[c.id] / 100)}</td>)}</tr>
          </tbody></table></div>
        <div style={{ marginTop: 6 }}>{b.controllo.map(k => {
          const ok = k.estratto != null && k.coperto && k.prima === k.estratto && k.mancanti === 0;
          return <div key={k.conto.id} style={{ fontSize: 12.5, fontWeight: 700, color: ok ? C.green : C.red }}>
            {ok ? "✔" : "✘"} {k.conto.nome}: saldo della prima nota {euro(k.prima / 100)}{k.estratto != null ? `, estratto conto ${euro(k.estratto / 100)}` : ", estratto conto non caricato per tutto il mese"}
            {k.estratto != null && k.prima !== k.estratto ? ` — differenza ${euro((k.prima - k.estratto) / 100)}` : ""}{k.mancanti ? ` — ${k.mancanti} righe della banca del mese non ancora confermate (pagina «Conferma dei movimenti»)` : ""}
            {!k.coperto && k.estratto != null ? " — estratto non caricato fino a fine mese" : ""}</div>; })}</div>
      </div>)}
      {blocchi.length === 0 && <div style={scheda}>Nessun movimento confermato nel periodo scelto.</div>}
    </div>
  );
}
