// Versione 382 (Tenente Fatture, 13/11/2026): «Movimenti per conto e carta: consulta».
// Ordini del Dott. Bizzarri del 13/11: 19:12 («ci deve essere nel programma un modo di vedere i movimenti di cassa, banca,
// carte»), 19:22 (disegno approvato), 19:42 (oltre agli scontrini si pagano altre cose). Sola lettura: la pagina non scrive niente.
// Per ogni strumento: saldo iniziale, entrate, uscite, saldo finale; in giallo i movimenti in attesa (fuori dal saldo);
// sotto le righe con il documento: spesa dall'app, fattura (collegata o proposta per importo e data), tra conti, banca, manca.
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
// fetchAllPages restituisce { data, error }: qui un errore ferma la lettura con il suo messaggio
const tutte = async fn => { const r = await fetchAllPages(fn); if (r.error) throw new Error(r.error.message); return r.data; };
import { dataIt, euro } from "./analisiDocumentoBanca";
import { oggiRoma } from "./dateRoma";
import { apriEstratto } from "./estrattiProgramma";
import { costruisciElenco, intervallo, centesimi } from "./calcoloMovimenti";

const COLORE = { verde: C.green, rosso: C.red, blu: C.blue, grigio: C.muted };
const nomeP = p => String(p?.nome || "").trim() + (p?.cognome ? " " + p.cognome : "");

function periodiPossibili() {
  const oggi = oggiRoma(), a = +oggi.slice(0, 4), m = +oggi.slice(5, 7), out = [];
  for (let y = a; y >= a - 2; y--) {
    for (let k = (y === a ? m : 12); k >= 1; k--) out.push({ v: `${y}-${String(k).padStart(2, "0")}`, t: new Date(Date.UTC(y, k - 1, 1)).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }) });
    for (let t = (y === a ? Math.ceil(m / 3) : 4); t >= 1; t--) out.push({ v: `${y}-T${t}`, t: `${t}° trimestre ${y}` });
    out.push({ v: `${y}`, t: `anno ${y}` });
  }
  return out;
}

export default function MovimentiConsulta() {
  const [base, setBase] = useState(null);
  const [strumento, setStrumento] = useState("");
  const [periodo, setPeriodo] = useState(oggiRoma().slice(0, 7));
  const [cerca, setCerca] = useState("");
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState("");
  const [avviso, setAvviso] = useState("");
  const [carico, setCarico] = useState(false);
  const periodi = useMemo(periodiPossibili, []);
  const ultimaLettura = useRef(0); // una lettura vecchia, finita dopo una nuova scelta, non sovrascrive quella nuova

  useEffect(() => { (async () => {
    try {
      const [conti, carte, profili, abil] = await Promise.all([
        supabase.from("ci_conti").select("id, nome, tipo, stato").order("id"),
        supabase.from("ci_carte_di_debito").select("id, conto_id, ultime_quattro_cifre, limite_mensile, attiva"),
        supabase.from("profili").select("id, nome, cognome"),
        supabase.from("ci_spese_abilitati").select("profilo_id, puo_avere_contanti, attivo")]);
      for (const r of [conti, carte, profili]) if (r.error) throw new Error(r.error.message);
      const nomi = Object.fromEntries((profili.data || []).map(p => [p.id, nomeP(p)]));
      const scelte = [];
      for (const c of conti.data || []) scelte.push({ v: `conto:${c.id}`, t: c.nome + (c.stato === "chiuso" ? " (chiuso)" : ""), conto: c });
      for (const k of carte.data || []) if (k.attiva) scelte.push({ v: `carta:${k.id}`, t: `Carta di debito ${k.ultime_quattro_cifre} (spese e prelievi dall'app)`, carta: k });
      for (const a of abil.data || []) if (a.attivo && a.puo_avere_contanti) scelte.push({ v: `persona:${a.profilo_id}`, t: `Contanti di ${nomi[a.profilo_id] || "—"}`, persona: a.profilo_id });
      setBase({ scelte, nomi });
      setStrumento(s => s || scelte.find(x => x.conto?.tipo === "cassa")?.v || scelte[0]?.v || "");
    } catch (e) { setErrore("Lettura dei conti non riuscita: " + e.message); }
  })(); }, []);

  useEffect(() => { if (base && strumento && periodo) carica(); }, [base, strumento, periodo]); // eslint-disable-line react-hooks/exhaustive-deps

  async function carica() {
    const scelta = base.scelte.find(s => s.v === strumento); const iv = intervallo(periodo);
    if (!scelta || !iv) return;
    const n = ++ultimaLettura.current;
    setCarico(true); setErrore(""); setAvviso(""); setDati(null);
    try {
      const spese = await tutte((a, b) => supabase.from("ci_spese").select("id, numero, tipo_documento, pagato_con, data_documento, data_pagamento, importo, stato, pdf_percorso, movimento_id, fattura_id, salvata_da, fornitore_testo").order("id").range(a, b));
      const daA = new Date(Date.parse(iv.dal) - 20 * 864e5).toISOString().slice(0, 10), alA = new Date(Date.parse(iv.al) + 5 * 864e5).toISOString().slice(0, 10);
      const fatt = await tutte((a, b) => supabase.from("ci_fatture").select("id, numero, data, totale_lordo, tipo, ci_fornitori(nome)").gte("data", daA).lte("data", alA).order("id").range(a, b));
      // si propongono solo fatture ricevute (PASSIVA) che hanno ancora qualcosa da pagare
      const resti = await tutte((a, b) => supabase.from("ci_v_scadenzario").select("fattura_id, residuo").eq("lato", "fornitore").gte("data_documento", daA).lte("data_documento", alA).order("scadenza_id").range(a, b));
      const daPagare = new Set(resti.filter(x => Number(x.residuo) > 0.005).map(x => x.fattura_id));
      const tutteFatt = fatt.map(f => ({ id: f.id, numero: f.numero, data: f.data, totale_lordo: f.totale_lordo, tipo: f.tipo, fornitore_nome: f.ci_fornitori?.nome || "" }));
      const fatture = tutteFatt.filter(f => f.tipo === "PASSIVA" && daPagare.has(f.id));
      const fatturaDi = Object.fromEntries(tutteFatt.map(f => [f.id, f]));
      // fatture già abbinate in prima nota ai movimenti (abbinamento → scadenza → fattura)
      const fatturaDelMov = async (ids) => {
        if (!ids.length) return {};
        const ab = [];
        for (let i = 0; i < ids.length; i += 150) // a pezzi: un anno di banca non fa un indirizzo troppo lungo
          ab.push(...await tutte((a, b) => supabase.from("ci_abbinamenti_pagamenti").select("pagamento_id, ci_scadenze(fattura_id, numero_documento, data_documento)").in("pagamento_id", ids.slice(i, i + 150)).order("id").range(a, b)));
        const out = {};
        for (const x of ab) if (x.ci_scadenze && !out[x.pagamento_id]) out[x.pagamento_id] = fatturaDi[x.ci_scadenze.fattura_id] || { id: x.ci_scadenze.fattura_id, numero: x.ci_scadenze.numero_documento, data: x.ci_scadenze.data_documento, fornitore_nome: "" };
        return out;
      };
      const spesaPerMov = Object.fromEntries(spese.filter(s => s.movimento_id && s.stato !== "Annullata").map(s => [s.movimento_id, s]));
      let righe = [], saldoIniziale = null, provvisori = [], nota = "", limite = null;

      if (scelta.conto) {
        const c = scelta.conto;
        const mov = await tutte((a, b) => supabase.from("ci_pagamenti_fatture").select("id, data, verso, importo, controparte, causale, causale_gruppo, causale_voce, codice_attesa, data_disposizione, confermato_il, riga_fonte_id, stornato_il, esercizio, progressivo").eq("conto_id", c.id).order("id").range(a, b));
        provvisori = mov.filter(m => m.codice_attesa && !m.confermato_il && !m.stornato_il).map(m => ({ ...m, spesa: spesaPerMov[m.id] }));
        if (c.tipo === "cassa") {
          // la cassa non ha estratto: saldo = partenza + movimenti confermati
          const p = await supabase.from("ci_storico_controlli").select("ok_alla_data, saldo").eq("conto_id", c.id).eq("tipo", "partenza").is("annullato_il", null).maybeSingle();
          if (p.error) throw new Error(p.error.message);
          const conf = mov.filter(m => m.confermato_il && !m.stornato_il);
          if (p.data && iv.prima >= p.data.ok_alla_data) {
            saldoIniziale = (centesimi(p.data.saldo) + conf.filter(m => m.data > p.data.ok_alla_data && m.data <= iv.prima).reduce((s, m) => s + (m.verso === "entrata" ? 1 : -1) * centesimi(m.importo), 0)) / 100;
          } else nota = p.data ? `La cassa parte dal ${dataIt(p.data.ok_alla_data)} con ${euro(p.data.saldo)}: per i periodi prima il saldo non si calcola.` : "La cassa non ha il saldo di partenza: il saldo non si calcola.";
          const nelPeriodo = conf.filter(m => m.data >= iv.dal && m.data <= iv.al).sort((x, y) => x.data.localeCompare(y.data) || x.id - y.id);
          const fm = await fatturaDelMov(nelPeriodo.map(m => m.id));
          righe = nelPeriodo.map(m => { const s = spesaPerMov[m.id]; return { id: `m${m.id}`, data: m.data, verso: m.verso, importo: m.importo, descrizione: [m.controparte, m.causale].filter(Boolean).join(" — "), spesa: s, movimento: m, fatturaCollegata: fm[m.id] || (s?.fattura_id ? fatturaDi[s.fattura_id] : null) }; });
        } else {
          const s0 = await supabase.rpc("ci_saldo_al", { p_conto: c.id, p_giorno: iv.prima });
          if (s0.error) throw new Error(s0.error.message);
          saldoIniziale = s0.data === null ? null : Number(s0.data);
          if (saldoIniziale === null) nota = "Per questo periodo il saldo non si calcola: è prima della partenza del conto (vedi «Conti: stato e controlli»).";
          const rf = await tutte((a, b) => supabase.from("ci_righe_fonte").select("id, data_contabile, verso, importo, descrizione, documento_id, ci_documenti_fonte!inner(annullato_il, pdf_impronta)").eq("conto_id", c.id).gte("data_contabile", iv.dal).lte("data_contabile", iv.al).is("ci_documenti_fonte.annullato_il", null).order("data_contabile").order("id", { ascending: false }).range(a, b));
          const movPerRiga = Object.fromEntries(mov.filter(m => m.riga_fonte_id && !m.stornato_il).map(m => [m.riga_fonte_id, m]));
          const fm = await fatturaDelMov(rf.map(r => movPerRiga[r.id]?.id).filter(Boolean));
          righe = rf.map(r => { const m = movPerRiga[r.id]; const s = m ? spesaPerMov[m.id] : null;
            return { id: `r${r.id}`, data: r.data_contabile, verso: r.verso, importo: r.importo, descrizione: r.descrizione, impronta: r.ci_documenti_fonte?.pdf_impronta, movimento: m,
              numeroPrimaNota: m?.progressivo ? `${m.esercizio}/${String(m.progressivo).padStart(6, "0")}` : "", spesa: s, fatturaCollegata: (m && fm[m.id]) || (s?.fattura_id ? fatturaDi[s.fattura_id] : null) }; });
          if (c.tipo === "carta prepagata") nota = "Il saldo della carta parte dalla partenza scritta in «Conti: stato e controlli»: se lì è segnata come provvisoria, anche questi saldi lo sono.";
        }
      } else if (scelta.carta) {
        // carta di debito: le sue righe sono sull'estratto del conto (scegliere il conto); qui le spese e i prelievi dall'app e il limite del mese
        const k = scelta.carta;
        const pre = await tutte((a, b) => supabase.from("ci_contanti").select("id, data, importo, persona, annullata_il").eq("tipo", "Prelievo").gte("data", iv.dal).lte("data", iv.al).order("id").range(a, b));
        righe = [
          ...spese.filter(s => s.pagato_con === `Carta di debito ${k.ultime_quattro_cifre}` && s.stato !== "Annullata" && s.data_pagamento >= iv.dal && s.data_pagamento <= iv.al)
            .map(s => ({ id: `s${s.id}`, data: s.data_pagamento, verso: "uscita", importo: s.importo, descrizione: [s.fornitore_testo, base.nomi[s.salvata_da]].filter(Boolean).join(" — "), spesa: s, fatturaCollegata: s.fattura_id ? fatturaDi[s.fattura_id] : null })),
          ...pre.filter(p => !p.annullata_il).map(p => ({ id: `p${p.id}`, data: p.data, verso: "uscita", importo: p.importo, descrizione: `Prelievo di ${base.nomi[p.persona] || "—"}`, documentoFisso: { tipo: "tra conti", colore: "blu", testo: "Tra conti: prelievo di contanti" } }))
        ].sort((x, y) => x.data.localeCompare(y.data));
        limite = k.limite_mensile && /^\d{4}-\d{2}$/.test(periodo) ? Number(k.limite_mensile) : null; // il limite vale per mese: solo con un mese scelto
        nota = `Le righe della carta ${k.ultime_quattro_cifre} sull'estratto della banca si vedono scegliendo il conto della banca. Il limite vale per mese di calendario.`;
      } else if (scelta.persona) {
        const p = scelta.persona;
        const cont = await tutte((a, b) => supabase.from("ci_contanti").select("id, tipo, persona, a_persona, data, importo, confermata_il, annullata_il").or(`persona.eq.${p},a_persona.eq.${p}`).order("id").range(a, b));
        const tutti = [
          ...cont.filter(c => !c.annullata_il && (c.tipo === "Prelievo" || c.confermata_il)).map(c => ({ id: `c${c.id}`, data: c.data, importo: c.importo,
            verso: c.tipo === "Prelievo" || c.a_persona === p ? "entrata" : "uscita",
            descrizione: c.tipo === "Prelievo" ? "Prelievo con la carta 1894" : c.a_persona === p ? `Contanti ricevuti da ${base.nomi[c.persona] || "—"}` : `Contanti consegnati a ${base.nomi[c.a_persona] || "—"}`,
            documentoFisso: { tipo: "tra conti", colore: "blu", testo: c.tipo === "Prelievo" ? "Tra conti: prelievo" : "Tra persone: consegna confermata" } })),
          ...spese.filter(s => s.pagato_con === "Contanti" && s.salvata_da === p && s.stato !== "Annullata").map(s => ({ id: `s${s.id}`, data: s.data_pagamento, verso: "uscita", importo: s.importo, descrizione: s.fornitore_testo || "", spesa: s, fatturaCollegata: s.fattura_id ? fatturaDi[s.fattura_id] : null }))
        ].sort((x, y) => x.data.localeCompare(y.data));
        saldoIniziale = tutti.filter(r => r.data < iv.dal).reduce((s, r) => s + (r.verso === "entrata" ? 1 : -1) * centesimi(r.importo), 0) / 100;
        righe = tutti.filter(r => r.data >= iv.dal && r.data <= iv.al);
        provvisori = cont.filter(c => c.tipo === "Consegna" && !c.confermata_il && !c.annullata_il && (c.persona === p || c.a_persona === p))
          .map(c => ({ id: c.id, data: c.data, importo: c.importo, verso: c.a_persona === p ? "entrata" : "uscita", controparte: c.a_persona === p ? `da ${base.nomi[c.persona]}` : `a ${base.nomi[c.a_persona]}`, codice_attesa: "consegna da confermare" }));
      }
      const elenco = costruisciElenco({ righe, saldoIniziale, fatture });
      elenco.righe = elenco.righe.map(r => r.documentoFisso ? { ...r, documento: r.documentoFisso } : r);
      if (n !== ultimaLettura.current) return;
      setDati({ ...elenco, saldoIniziale, provvisori, nota, limite, scelta, iv });
    } catch (e) { if (n === ultimaLettura.current) setErrore("Lettura non riuscita: " + e.message); }
    if (n === ultimaLettura.current) setCarico(false);
  }

  async function apriSpesa(s) {
    setAvviso("");
    const { data, error } = await supabase.storage.from("cassa").createSignedUrl(s.pdf_percorso, 120);
    if (error || !data?.signedUrl) return setAvviso(`Documento della spesa ${s.numero} non leggibile: ${error?.message || "nessun indirizzo"}. Lo vede chi l'ha salvato e chi gestisce i conti.`);
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function apriRiga(r) {
    setAvviso("");
    try {
      const e = await apriEstratto({ impronta: r.impronta });
      if (e.serveCartella) throw new Error("serve la cartella BANCHE");
      const url = URL.createObjectURL(new Blob([e.byte], { type: e.tipo || "application/pdf" }));
      window.open(url, "_blank", "noopener");
    } catch (er) { setAvviso(`L'estratto non è nell'archivio del programma (${er.message}): aprirlo da «Estratti e movimenti: consulta».`); }
  }

  const visibili = useMemo(() => {
    if (!dati) return [];
    const t = cerca.trim().toLowerCase();
    return t ? dati.righe.filter(r => [r.descrizione, r.documento?.testo, String(r.importo)].some(v => String(v || "").toLowerCase().includes(t))) : dati.righe;
  }, [dati, cerca]);

  function scarica() {
    if (!dati) return;
    const nome = dati.scelta.t;
    const aoa = [["SOCIETA' AGRICOLA PODERE VERDE A R.L."], [`Movimenti: ${nome} — ${periodi.find(p => p.v === periodo)?.t || periodo}`], [`Scaricato il ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })}${cerca ? " — ricerca: " + cerca : ""}`], [],
      ["Saldo iniziale", dati.saldoIniziale], ["Entrate", dati.entrate], ["Uscite", dati.uscite], ["Saldo finale", dati.saldoFinale], [],
      ["Data", "Descrizione", "Entrata", "Uscita", "Saldo", "Documento", "Numero di prima nota"],
      ...visibili.map(r => [dataIt(r.data), r.descrizione, r.verso === "entrata" ? Number(r.importo) : "", r.verso === "uscita" ? Number(r.importo) : "", r.saldo ?? "", r.documento?.testo || "", r.numeroPrimaNota || ""])];
    if (dati.provvisori.length) aoa.push([], ["In attesa (fuori dal saldo)"], ...dati.provvisori.map(m => [dataIt(m.data_disposizione || m.data), m.controparte || m.causale || "", m.verso === "entrata" ? Number(m.importo) : "", m.verso === "uscita" ? Number(m.importo) : "", "", m.codice_attesa]));
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = [{ wch: 12 }, { wch: 52 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 44 }, { wch: 16 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Movimenti");
    XLSX.writeFile(wb, `Movimenti ${nome.replace(/[\\/:*?"<>|]/g, "")} ${periodo}.xlsx`);
  }

  const tile = (titolo, valore, colore) => (
    <div style={{ flex: "1 1 130px", border: `${colore ? 2 : 1}px solid ${colore || C.border}`, background: colore ? colore + "1A" : "#fff", borderRadius: 10, padding: "8px 12px" }}>
      <div style={{ fontSize: 11.5, color: C.muted }}>{titolo}</div><div style={{ fontSize: 17, fontWeight: 800 }}>{valore}</div></div>);
  const usatoMese = dati?.limite ? dati.righe.reduce((s, r) => s + centesimi(r.importo), 0) / 100 : 0;

  return (
    <div style={{ maxWidth: 1180 }}>
      <h2 style={{ margin: "0 0 4px", color: C.primary }}>Movimenti per conto e carta: consulta</h2>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Sola lettura. Si sceglie lo strumento e il periodo: in alto i saldi, in giallo ciò che aspetta la banca (fuori dal saldo), sotto ogni movimento con il suo documento.</div>
      {errore && <div style={{ ...scheda, borderColor: C.red, color: C.red }}>{errore}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <select style={{ ...input, minWidth: 300 }} value={strumento} onChange={e => setStrumento(e.target.value)}>{(base?.scelte || []).map(s => <option key={s.v} value={s.v}>{s.t}</option>)}</select>
        <select style={input} value={periodo} onChange={e => setPeriodo(e.target.value)}>{periodi.map(p => <option key={p.v} value={p.v}>{p.t}</option>)}</select>
        <input style={{ ...input, width: 200 }} placeholder="Cerca fornitore, importo…" value={cerca} onChange={e => setCerca(e.target.value)} />
        <button style={btn(true)} onClick={scarica} disabled={!dati}>Scarica Excel</button>
        <button style={btn(false)} onClick={carica} disabled={carico}>{carico ? "Leggo…" : "Aggiorna"}</button>
      </div>
      {avviso && <div style={{ ...scheda, borderColor: C.yellow }}>{avviso}</div>}
      {carico && <div style={{ color: C.muted }}>Leggo i movimenti…</div>}
      {dati && <>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          {tile(`Saldo al ${dataIt(dati.iv.prima)}`, dati.saldoIniziale === null ? "non calcolabile" : euro(dati.saldoIniziale))}
          {tile("Entrate", euro(dati.entrate))}{tile("Uscite", euro(dati.uscite))}
          {tile(`Saldo al ${dataIt(dati.iv.al)}`, dati.saldoFinale === null ? "non calcolabile" : euro(dati.saldoFinale), dati.saldoFinale === null ? null : C.green)}
          {dati.limite ? tile(`Limite del mese ${euro(dati.limite)}: resta`, euro(dati.limite - usatoMese), dati.limite - usatoMese < dati.limite * 0.2 ? C.red : C.green) : null}
        </div>
        {dati.nota && <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>{dati.nota}</div>}
        <div style={{ ...scheda, background: "#FFF6DD", borderColor: C.yellow }}>
          <b>In attesa (fuori dal saldo)</b>
          {dati.provvisori.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted }}>Nessuno. Qui compaiono in giallo le spese salvate dall'app e i pagamenti disposti, finché la banca non li conferma.</div>
            : <table style={{ width: "100%", fontSize: 12.5, marginTop: 6, borderCollapse: "collapse" }}><tbody>{dati.provvisori.map(m => (
              <tr key={m.id} style={{ borderTop: `1px solid ${C.border}` }}><td style={{ padding: "4px 6px", fontWeight: 700 }}>{m.codice_attesa}</td><td style={{ padding: "4px 6px" }}>{dataIt(m.data_disposizione || m.data)}</td>
                <td style={{ padding: "4px 6px" }}>{m.controparte || m.causale || ""}</td><td style={{ padding: "4px 6px", textAlign: "right" }}>{m.verso === "entrata" ? "+" : "−"}{euro(m.importo)}</td>
                <td style={{ padding: "4px 6px" }}>{m.spesa ? <button style={{ ...btn(false), height: 26 }} onClick={() => apriSpesa(m.spesa)}>Apri {m.spesa.tipo_documento.toLowerCase()} {m.spesa.numero}</button> : null}</td></tr>))}</tbody></table>}
        </div>
        <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse", background: "#fff" }}>
          <thead><tr style={{ color: C.muted, textAlign: "left" }}><th style={{ padding: 6 }}>Data</th><th style={{ padding: 6 }}>Descrizione</th><th style={{ padding: 6, textAlign: "right" }}>Entrata</th><th style={{ padding: 6, textAlign: "right" }}>Uscita</th><th style={{ padding: 6, textAlign: "right" }}>Saldo</th><th style={{ padding: 6 }}>Documento</th><th style={{ padding: 6 }}></th></tr></thead>
          <tbody>{visibili.length === 0 ? <tr><td colSpan={7} style={{ padding: 10, color: C.muted }}>Nessun movimento in questo periodo.</td></tr> : visibili.map(r => (
            <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: "5px 6px", whiteSpace: "nowrap" }}>{dataIt(r.data)}</td><td style={{ padding: "5px 6px" }}>{r.descrizione}{r.numeroPrimaNota ? <div style={{ fontSize: 11, color: C.muted }}>prima nota {r.numeroPrimaNota}</div> : null}</td>
              <td style={{ padding: "5px 6px", textAlign: "right" }}>{r.verso === "entrata" ? euro(r.importo) : ""}</td><td style={{ padding: "5px 6px", textAlign: "right" }}>{r.verso === "uscita" ? euro(r.importo) : ""}</td>
              <td style={{ padding: "5px 6px", textAlign: "right" }}>{r.saldo === null ? "" : euro(r.saldo)}</td>
              <td style={{ padding: "5px 6px", color: COLORE[r.documento.colore], fontWeight: 700 }}>{r.documento.testo}{r.documento.altre > 0 ? <span style={{ fontWeight: 400, color: C.muted }}> (e altre {r.documento.altre} con lo stesso importo)</span> : null}</td>
              <td style={{ padding: "5px 6px", whiteSpace: "nowrap" }}>
                {r.documento.spesa ? <button style={{ ...btn(false), height: 26 }} onClick={() => apriSpesa(r.documento.spesa)}>Apri</button> : null}
                {r.impronta ? <button style={{ ...btn(false, C.blue), height: 26, marginLeft: 4 }} onClick={() => apriRiga(r)}>Estratto</button> : null}</td></tr>))}</tbody>
        </table>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Documento: <span style={{ color: C.green }}>verde</span> spesa dall'app o fattura (quella «proposta» ha stesso importo e data vicina: la conferma chi controlla); <span style={{ color: C.blue }}>blu</span> tra conti o tra persone; grigio spesa della banca; <span style={{ color: C.red }}>rosso</span> manca il documento.</div>
      </>}
    </div>
  );
}
