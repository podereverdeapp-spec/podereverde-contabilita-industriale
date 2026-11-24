// Versione 397 (Tenente, 24/11/2026): «Registro delle spese» in «Banche, carte e cassa» (claude/progetto_391_registro_spese.md).
// Decisioni del Dott. Bizzarri: 20/11/2026 10:18–10:23 (registro mese per mese), 10:50 (soldi messi dal dipendente evidenziati), 24/11/2026
// 15:27–15:35 (mese della data del pagamento, otto colonne, posizione di ciascuno con rimando a «Contanti per persona», casi brutti).
// È un registro da GUARDARE: non scrive niente. Controllo, rimborsi e chiusura restano nelle loro pagine, raggiunte con un tasto.
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages, leggiInBlocchi } from "./parsingUtils";
import { dataIt, euro } from "./analisiDocumentoBanca";
import { fileDellaSpesa, apriFileSpesa, quotaDaMe, dallaCassa, nomeStrumento, daRimborsare } from "./fileSpesa";
import { meseIt, meseDi, spostaMese, righeDelMese, totali, testoFiltri, filtrato as eFiltrato, FILTRI_PRIMA_NOTA } from "./registroSpese";
const giornoRoma = t => new Date(t).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" });

const tutte = async fn => { const r = await fetchAllPages(fn); if (r.error) throw new Error(r.error.message); return r.data; };
const nomeP = p => String(p?.nome || "").trim() + (p?.cognome ? " " + p.cognome : "");
const oggiRoma = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const NON_PIU = "persona non più nel programma";
const COLORI = { green: C.green, blue: C.blue, accent: C.accent, red: C.red, muted: C.muted };
const statoColore = st => st === "Controllata" || st === "Rimborsata" ? C.green : st === "Annullata" ? C.muted : st === "Da chiarire" ? C.accent : C.blue;

export default function RegistroSpese({ vaiA, puo }) {
  const vai = id => (vaiA && (!puo || puo(id)) ? () => vaiA(id) : null);   // tasti solo per le pagine date a questa persona
  const [mese, setMese] = useState(meseDi(oggiRoma()));
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState("");
  const [leggo, setLeggo] = useState(false);
  const [filtri, setFiltri] = useState({});
  const [aperta, setAperta] = useState(null);
  const [avviso, setAvviso] = useState("");

  async function carica() {
    setErrore(""); setLeggo(true);
    try {
      const [spese, rimborsi, strumenti, profili, mesi, gestore] = await Promise.all([
        tutte((a, b) => supabase.from("ci_spese").select("*").order("id").range(a, b)),
        tutte((a, b) => supabase.from("ci_spese_rimborsi").select("id, persona, stato, data_pagamento, movimento_id").order("id").range(a, b)),
        supabase.from("ci_spese_strumenti").select("nome, tipo, conto_id, annullata_il, registrata_il"),
        supabase.from("profili").select("id, nome, cognome"),
        supabase.from("ci_spese_mesi").select("*"),
        supabase.rpc("ci_puo_gestire_conti")]);
      for (const x of [strumenti, profili, mesi, gestore]) if (x.error) throw new Error(x.error.message);
      const ids = spese.map(s => s.movimento_id).filter(Boolean);
      const mov = await leggiInBlocchi(ids, (blocco, a, b) => supabase.from("ci_pagamenti_fatture").select("id, data, conto_id, confermato_il, stornato_il, natura, esercizio, progressivo").in("id", blocco).order("id").range(a, b));
      if (mov.error) throw new Error(mov.error.message);
      const fids = spese.map(s => s.fattura_id).filter(Boolean);
      const fat = await leggiInBlocchi(fids, (blocco, a, b) => supabase.from("ci_fatture").select("id, numero, data, ci_fornitori(nome)").in("id", blocco).order("id").range(a, b));
      if (fat.error) throw new Error(fat.error.message);
      let saldi = null;
      if (gestore.data === true) {
        // la posizione di ciascuno la calcola solo «Contanti per persona»: qui si legge lo stesso conto del database
        const r = await supabase.rpc("ci_contanti_saldi");
        if (r.error) throw new Error("contanti per persona non letti: " + r.error.message);
        saldi = r.data || [];
      }
      setD({ spese, saldi, gestore: gestore.data === true, chiusi: mesi.data || [],
        nomi: Object.fromEntries((profili.data || []).map(p => [p.id, nomeP(p)])),
        ctx: { movimenti: Object.fromEntries((mov.data || []).map(m => [m.id, m])), strumenti: Object.fromEntries((strumenti.data || []).map(t => [t.nome, t])),
          rimborsi: Object.fromEntries(rimborsi.map(r => [r.id, r])), fatture: Object.fromEntries((fat.data || []).map(f => [f.id, { numero: f.numero, data: f.data, fornitore: f.ci_fornitori?.nome || "" }])) },
        letto: new Date().toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", second: "2-digit" }) });
    } catch (e) { setD(null); setErrore("Lettura non riuscita: " + e.message + ". Nessun totale mostrato: premere «Aggiorna»."); }
    setLeggo(false);
  }
  useEffect(() => { carica(); }, []);

  const righe = useMemo(() => (d ? righeDelMese(d.spese, mese, filtri, d.ctx) : []), [d, mese, filtri]);
  const tot = useMemo(() => totali(righe), [righe]);
  const nome = id => (d?.nomi[id] || NON_PIU);
  const chiuso = d?.chiusi.find(x => x.mese === mese);
  const mezzi = useMemo(() => d ? [...new Set(d.spese.map(s => nomeStrumento(s.pagato_con)))].sort() : [], [d]);
  const persone = useMemo(() => d ? [...new Set(d.spese.map(s => s.salvata_da))].sort((a, b) => nome(a).localeCompare(nome(b))) : [], [d]);
  const fil = (k, v) => { setFiltri(f => ({ ...f, [k]: v || undefined })); setAperta(null); };

  function righeFile() {
    return righe.map(s => ({
      "Numero": s.numero, "Data del pagamento": dataIt(s.data_pagamento), "Ora": s.ora || "", "Fornitore": s.fornitore_testo || "", "Partita IVA": s.partita_iva || "",
      "Importo": Number(s.importo), "Mezzo di pagamento": nomeStrumento(s.pagato_con) + (quotaDaMe(s) > 0 ? " + resto pagato da sé" : ""), "Chi ha speso": nome(s.salvata_da),
      "Controllo dell'ufficio": s.stato, "Stato in prima nota": s.primaNota.testo, "Messo dal dipendente da restituire": s.evidenziata ? daRimborsare(s) : "",
      "Documento": s.tipo_documento + (s.numero_documento ? " n. " + s.numero_documento : ""), "Data del documento": dataIt(s.data_documento), "Fattura elettronica": s.fattura.testo,
      "Che cosa": s.acquisto || "", "Bene o servizio": s.bene === true ? "Bene" : s.bene === false ? "Servizio" : "", "Possibile doppione": s.doppioni.length ? "con " + s.doppioni.map(x => x.numero).join(", ") + (s.doppione_motivo ? " (confermato: " + s.doppione_motivo + ")" : "") : "",
      "Annullata: motivo": s.annullata_motivo || "" }));
  }
  function esportaExcel() {
    const testa = [[`Registro delle spese — ${meseIt(mese)} (mese della data del pagamento)`], [testoFiltri(filtri, d.nomi)], [`Letto il ${dataIt(oggiRoma())} alle ${d.letto}${chiuso ? ` — mese chiuso il ${giornoRoma(chiuso.chiuso_il)}` : " — mese aperto"}`], []];
    const ws = XLSX.utils.aoa_to_sheet(testa);
    XLSX.utils.sheet_add_json(ws, righeFile(), { origin: "A5" });
    const n = righe.length + 6;
    XLSX.utils.sheet_add_aoa(ws, [["Totale (senza le annullate)", "", "", "", "", tot.totale], ["Spese contate", tot.quante]], { origin: `A${n}` });
    ws["A1"].s = { font: { bold: true, sz: 13 } }; ws["A2"].s = { font: { bold: true, color: { rgb: eFiltrato(filtri) ? "C0392B" : "2B2B26" } } };
    ws["!cols"] = [10, 12, 6, 28, 14, 11, 24, 20, 16, 30, 14, 22, 12, 30, 28, 10, 28, 28].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Registro");
    XLSX.writeFile(wb, `Registro delle spese ${mese.slice(0, 7)}${eFiltrato(filtri) ? " filtrato" : ""}.xlsx`);
  }
  async function esportaPdf() {
    const pdf = await PDFDocument.create(); const f = await pdf.embedFont(StandardFonts.Helvetica); const fb = await pdf.embedFont(StandardFonts.HelveticaBold);
    // il carattere standard non ha tutti i segni: quelli che non sa scrivere diventano «?»
    const pulito = t => [...String(t ?? "")].map(ch => { try { f.encodeText(ch); return ch; } catch { return "?"; } }).join("");
    const W = 842, H = 595, M = 28; let pag = pdf.addPage([W, H]); let y = H - M;
    const scrivi = (t, x, size = 8, font = f, colore = rgb(0.17, 0.17, 0.15), largo = 9999) => { let s = pulito(t); while (s.length > 1 && font.widthOfTextAtSize(s, size) > largo) s = s.slice(0, -2) + "…"; try { font.widthOfTextAtSize(s, size); } catch { s = s.replace(/…/g, "."); } pag.drawText(s, { x, y, size, font, color: colore }); };
    const col = [[M, 44, "Numero"], [M + 46, 62, "Data e ora"], [M + 110, 150, "Fornitore"], [M + 262, 60, "Importo"], [M + 326, 110, "Mezzo"], [M + 438, 100, "Chi ha speso"], [M + 540, 72, "Controllo"], [M + 614, 172, "Prima nota"]];
    const testa = () => { scrivi(`Registro delle spese — ${meseIt(mese)} (mese della data del pagamento)`, M, 12, fb); y -= 15;
      scrivi(testoFiltri(filtri, d.nomi), M, 8.5, fb, eFiltrato(filtri) ? rgb(0.75, 0.22, 0.17) : rgb(0.17, 0.17, 0.15), W - 2 * M); y -= 12;
      scrivi(`Letto il ${dataIt(oggiRoma())} alle ${d.letto}${chiuso ? ` — mese chiuso il ${giornoRoma(chiuso.chiuso_il)}` : " — mese aperto"}`, M, 8); y -= 16;
      for (const [x, w, t] of col) scrivi(t, x, 8, fb, undefined, w); y -= 12; };
    testa();
    for (const s of righe) {
      if (y < M + 40) { pag = pdf.addPage([W, H]); y = H - M; testa(); }
      const grigio = s.stato === "Annullata" ? rgb(0.48, 0.46, 0.42) : undefined;
      const v = [s.numero, dataIt(s.data_pagamento) + (s.ora ? " " + s.ora : ""), s.fornitore_testo || "", euro(s.importo), nomeStrumento(s.pagato_con) + (quotaDaMe(s) > 0 ? " + resto" : ""), nome(s.salvata_da), s.stato, s.primaNota.testo];
      col.forEach(([x, w], i) => scrivi(v[i], x, 7.5, f, grigio, w)); y -= 10;
      const nota = [s.evidenziata ? `messi dal dipendente da restituire ${euro(daRimborsare(s))}` : "", s.doppioni.length ? `possibile doppione con ${s.doppioni.map(x => x.numero).join(", ")}${s.doppione_motivo ? ` (confermato: ${s.doppione_motivo})` : ""}` : "", s.fattura.chiave === "da ricevere" ? "fattura da ricevere" : "", s.tipo_documento === "Altro" && !s.pdf_percorso ? "manca il documento" : "", s.annullata_motivo ? "annullata: " + s.annullata_motivo : ""].filter(Boolean).join(" — ");
      if (nota) { scrivi(nota, M + 46, 7, f, rgb(0.75, 0.22, 0.17), W - 2 * M - 46); y -= 10; }
    }
    y -= 6; if (y < M + 30) { pag = pdf.addPage([W, H]); y = H - M; }
    scrivi(`Totale (senza le annullate): ${euro(tot.totale)} — ${tot.quante} spese`, M, 9, fb); y -= 12;
    scrivi("Per mezzo: " + tot.perMezzo.map(([k, v]) => `${nomeStrumento(k)} ${euro(v)}`).join("; "), M, 8, f, undefined, W - 2 * M); y -= 11;
    scrivi("Per persona: " + tot.perPersona.map(([k, v]) => `${nome(k)} ${euro(v)}`).join("; "), M, 8, f, undefined, W - 2 * M);
    const blob = new Blob([await pdf.save()], { type: "application/pdf" }); const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `Registro delle spese ${mese.slice(0, 7)}${eFiltrato(filtri) ? " filtrato" : ""}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function apriFile(s, f) { const e = await apriFileSpesa(f.percorso); setAvviso(e ? `${f.etichetta} della spesa ${s.numero} non leggibile: ${e}` : ""); }

  const titolo = <h2 style={{ margin: "0 0 4px", color: C.primary }}>Registro delle spese</h2>;
  if (!d) return <div style={{ maxWidth: 1150 }}>{titolo}{errore ? <><div style={{ ...scheda, borderColor: C.red, color: C.red }}>{errore}</div><button style={btn(false)} disabled={leggo} onClick={carica}>Aggiorna</button></> : <div style={{ color: C.muted }}>Leggo le spese…</div>}</div>;
  const th = { padding: "6px 7px", textAlign: "left", fontWeight: 700, color: C.muted, borderBottom: `1.5px solid ${C.border}`, whiteSpace: "nowrap" };
  const td = { padding: "6px 7px", verticalAlign: "top" };
  const filtrato = eFiltrato(filtri);

  return (
    <div style={{ maxWidth: 1150 }}>
      {titolo}
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Tutte le spese pagate nel mese (il mese è quello della data del pagamento, come nella chiusura del mese). Da qui si guarda e si esporta: controllo, rimborsi e chiusura si fanno nelle loro pagine.</div>
      {!d.gestore && <div style={{ ...scheda, borderColor: C.yellow }}>Vedi solo le tue spese: il registro completo lo vede chi gestisce i conti.</div>}
      {errore && <div style={{ ...scheda, borderColor: C.red, color: C.red }}>{errore}</div>}
      {avviso && <div style={{ ...scheda, borderColor: C.red, color: C.red }}>{avviso}</div>}
      <div style={{ ...scheda, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button style={btn(false)} onClick={() => { setMese(spostaMese(mese, -1)); setAperta(null); }}>◀</button>
        <b style={{ minWidth: 130, textAlign: "center", fontSize: 15 }}>{meseIt(mese)}</b>
        <button style={btn(false)} onClick={() => { setMese(spostaMese(mese, 1)); setAperta(null); }}>▶</button>
        <button style={btn(false)} onClick={() => { setMese(meseDi(oggiRoma())); setAperta(null); }}>Mese corrente</button>
        <button style={btn(false)} disabled={leggo} onClick={carica}>{leggo ? "Leggo…" : "Aggiorna"}</button>
        <span style={{ fontSize: 12, color: C.muted }}>ultima lettura alle {d.letto}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button style={btn(false)} disabled={!righe.length} onClick={esportaExcel}>Esporta in Excel</button>
          <button style={btn(false)} disabled={!righe.length} onClick={esportaPdf}>Esporta in PDF</button></span>
      </div>
      {chiuso ? <div style={{ ...scheda, borderColor: C.green, color: C.green, fontWeight: 700 }}>Mese chiuso il {new Date(chiuso.chiuso_il).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })} da {nome(chiuso.chiuso_da)}{chiuso.nota ? ` — ${chiuso.nota}` : ""}: le spese di questo mese non cambiano più (si corregge solo con lo storno in prima nota).</div>
        : <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>Mese aperto: si chiude in «Chiusura del mese delle spese», entro il 5 del mese dopo.</div>}
      <div style={{ ...scheda, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
        <b>Filtri</b>
        <select style={input} value={filtri.mezzo || ""} onChange={e => fil("mezzo", e.target.value)}><option value="">tutti i mezzi di pagamento</option>{mezzi.map(m => <option key={m} value={m}>{m}</option>)}</select>
        <select style={input} value={filtri.persona || ""} onChange={e => fil("persona", e.target.value)}><option value="">tutte le persone</option>{persone.map(p => <option key={p} value={p}>{nome(p)}</option>)}</select>
        <select style={input} value={filtri.primaNota || ""} onChange={e => fil("primaNota", e.target.value)}><option value="">ogni stato in prima nota</option>{FILTRI_PRIMA_NOTA.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        <select style={input} value={filtri.bene || ""} onChange={e => fil("bene", e.target.value)}><option value="">beni e servizi</option><option value="bene">solo beni</option><option value="servizio">solo servizi</option><option value="nessuno">non indicato</option></select>
        <label style={{ display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={!!filtri.annullate} onChange={e => fil("annullate", e.target.checked)} /> mostra anche le annullate</label>
        {filtrato && <button style={btn(false, C.red)} onClick={() => { setFiltri(f => ({ annullate: f.annullate })); setAperta(null); }}>Togli i filtri</button>}
      </div>
      {filtrato && <div style={{ fontSize: 12.5, color: C.red, fontWeight: 700, marginBottom: 6 }}>Elenco filtrato: non è il mese intero.</div>}
      {righe.length === 0 ? <div style={{ ...scheda, color: C.muted }}>{filtrato ? "Nessuna spesa con questi filtri in questo mese." : "Nessuna spesa pagata in questo mese."}</div> :
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse", background: "#fff" }}>
          <thead><tr><th style={th}>Numero</th><th style={th}>Data e ora</th><th style={th}>Fornitore</th><th style={{ ...th, textAlign: "right" }}>Importo</th><th style={th}>Mezzo di pagamento</th><th style={th}>Chi ha speso</th><th style={th}>Controllo dell'ufficio</th><th style={th}>Stato in prima nota</th></tr></thead>
          <tbody>{righe.map(s => {
            const annullata = s.stato === "Annullata"; const senzaDoc = s.tipo_documento === "Altro" && !s.pdf_percorso;
            return [
              <tr key={s.id} onClick={() => setAperta(aperta === s.id ? null : s.id)} style={{ cursor: "pointer", borderTop: `1px solid ${C.border}`, background: aperta === s.id ? "#F1EEE6" : annullata ? "#F4F3F0" : s.evidenziata ? "#FFF4D6" : "#fff", color: annullata ? C.muted : C.text }}>
                <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>{s.numero}{s.doppioni.length > 0 && (s.doppione_motivo ? <span title={"salvata nonostante il possibile doppione: " + s.doppione_motivo} style={{ color: C.accent, marginLeft: 4 }}>● doppione confermato</span> : <span title="possibile doppione" style={{ color: C.red, marginLeft: 4 }}>● doppione?</span>)}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{dataIt(s.data_pagamento)}{s.ora ? ` ${s.ora}` : ""}</td>
                <td style={td}>{s.fornitore_testo || "—"}{senzaDoc && <div style={{ color: C.red, fontSize: 11.5 }}>manca il documento</div>}{s.fattura.chiave === "da ricevere" && !annullata && <div style={{ color: C.yellow, fontSize: 11.5, fontWeight: 700 }}>Fattura da ricevere</div>}{annullata && <div style={{ fontSize: 11.5 }}>annullata: {s.annullata_motivo}</div>}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800, whiteSpace: "nowrap", textDecoration: annullata ? "line-through" : "none" }}>{euro(s.importo)}</td>
                <td style={td}>{nomeStrumento(s.pagato_con)}{quotaDaMe(s) > 0 && <div style={{ fontSize: 11.5, color: C.accent, fontWeight: 700 }}>+ resto pagato da sé {euro(quotaDaMe(s))}</div>}</td>
                <td style={td}>{nome(s.salvata_da)}</td>
                <td style={{ ...td, fontWeight: 700, color: statoColore(s.stato) }}>{s.stato}</td>
                <td style={{ ...td, color: COLORI[s.primaNota.colore] }}>{s.primaNota.testo}{s.evidenziata && <div style={{ fontSize: 11.5, color: C.accent, fontWeight: 700 }}>da restituire al dipendente {euro(daRimborsare(s))}</div>}</td>
              </tr>,
              aperta === s.id && <tr key={s.id + "d"}><td colSpan={8} style={{ padding: 0 }}><Dettaglio s={s} nome={nome} d={d} apriFile={apriFile} vai={vai} /></td></tr>];
          })}</tbody></table></div>}
      {righe.length > 0 && <div style={{ ...scheda, marginTop: 14 }}>
        <b>Totali di {meseIt(mese)}{filtrato ? " (solo le spese filtrate)" : ""}: {euro(tot.totale)} in {tot.quante} spese</b> <span style={{ fontSize: 12, color: C.muted }}>(le annullate non contano)</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 8, fontSize: 12.5 }}>
          <div><b>Per mezzo di pagamento</b>{tot.perMezzo.map(([k, v]) => <div key={k}>{nomeStrumento(k)}: {euro(v)}</div>)}</div>
          <div><b>Per persona</b>{tot.perPersona.map(([k, v]) => <div key={k}>{nome(k)}: {euro(v)}</div>)}</div>
          <div><b>Da sistemare</b>
            <div>In attesa della banca: {tot.inAttesaBanca}</div>
            <div style={{ color: tot.daSistemare ? C.red : C.text }}>Senza riga valida in prima nota o carta da completare: {tot.daSistemare}</div>
            <div>Carta di credito da addebitare: {tot.daAddebitare}</div>
            <div style={{ color: tot.daRestituire ? C.accent : C.text }}>Messi dai dipendenti, da restituire: {euro(tot.daRestituire)}</div></div>
        </div></div>}
      {d.gestore && d.saldi && <div style={scheda}>
        <b>Contanti in carico a ciascuno, oggi</b>
        <div style={{ fontSize: 12, color: C.muted, margin: "2px 0 6px" }}>È il conto di «Contanti per persona» (prelievi e contanti ricevuti meno spese, consegne e rimborsi pagati), a oggi e non alla fine del mese scelto: il dettaglio e le correzioni sono solo in quella pagina.</div>
        {d.saldi.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted }}>Nessuno ha contanti in carico.</div> : d.saldi.map(x => <div key={x.persona} style={{ fontSize: 12.5 }}>{nome(x.persona)}: <b style={{ color: Number(x.saldo) < 0 ? C.red : C.text }}>{euro(x.saldo)}</b></div>)}
        {vai("spese-contanti") && <button style={{ ...btn(false), marginTop: 8 }} onClick={vai("spese-contanti")}>Contanti per persona</button>}
      </div>}
    </div>
  );
}

function Dettaglio({ s, nome, d, apriFile, vai }) {
  const r = []; const riga = (t, colore) => r.push(<div key={r.length} style={{ color: colore || C.text }}>{t}</div>);
  if (s.partita_iva) riga(`Partita IVA del fornitore: ${s.partita_iva}`);
  riga(`${s.bene === true ? "Bene" : s.bene === false ? "Servizio" : "Bene o servizio: non indicato"}${s.acquisto ? ` — ${s.acquisto}` : ""}`);
  riga(`Documento: ${s.tipo_documento}${s.tipo_altro ? ` (${s.tipo_altro})` : ""}${s.tipo_ricevuta ? ` — ${s.tipo_ricevuta}` : ""}${s.numero_documento ? ` n. ${s.numero_documento}` : ""}${s.ordine_numero ? `, ordine n. ${s.ordine_numero}` : ""}`);
  if (s.data_documento && s.data_documento !== s.data_pagamento) riga(`Documento del ${dataIt(s.data_documento)}, pagato il ${dataIt(s.data_pagamento)}: la spesa sta nel mese del pagamento.`, C.accent);
  if (s.lordo !== null && s.lordo !== undefined) riga(`Prestazione occasionale: lordo ${euro(s.lordo)}, ritenuta ${euro(s.ritenuta)}, netto ${euro(s.importo)}${s.cf_percipiente ? `, codice fiscale ${s.cf_percipiente}` : ""}`);
  if (quotaDaMe(s) > 0) riga(`Contanti + resto pagato da sé: ${euro(dallaCassa(s))} dalla cassa, ${euro(quotaDaMe(s))} messi da ${nome(s.salvata_da)}${s.evidenziata ? " — non ancora restituiti" : " — restituiti"}`, C.accent);
  else if (s.evidenziata) riga(`Pagata con soldi di ${nome(s.salvata_da)}: ${euro(daRimborsare(s))} da restituire`, C.accent);
  riga(s.fattura.testo, s.fattura.chiave === "da ricevere" ? C.yellow : undefined);
  if (s.controllata_da) riga(`Controllata da ${nome(s.controllata_da)} il ${new Date(s.controllata_il).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })}`);
  const m = s.movimento_id ? d.ctx.movimenti[s.movimento_id] : null;
  if (m) riga(`Movimento di prima nota: ${m.progressivo ? `n. ${m.progressivo}/${m.esercizio}` : `codice interno ${m.id}`} del ${dataIt(m.data)}${m.stornato_il ? " — stornato" : ""}`);
  riga(`Stato in prima nota: ${s.primaNota.testo}`, COLORI[s.primaNota.colore]);
  if (s.doppioni.length) riga(`Possibile doppione: stessa data del documento e stesso importo della spesa ${s.doppioni.map(x => x.numero).join(", ")}${s.doppione_motivo ? `. Salvata lo stesso, con il motivo: ${s.doppione_motivo}` : ". Lo decide chi controlla."}`, C.red);
  if (s.annullata_motivo) riga(`Annullata: ${s.annullata_motivo}`, C.muted);
  if (s.nota) riga(`Nota: ${s.nota}`);
  const file = fileDellaSpesa(s);
  return (
    <div style={{ padding: "10px 14px", background: "#FAF8F3", fontSize: 12.5, display: "grid", gap: 3 }}>
      {r}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        {file.map(f => <button key={f.campo} style={btn(false)} onClick={() => apriFile(s, f)}>Apri: {f.etichetta.toLowerCase()}</button>)}
        {file.length === 0 && <span style={{ color: C.red, alignSelf: "center" }}>Nessun file: spesa «Altro» senza documento.</span>}
        {vai("spese-controllo") && <button style={btn(false)} onClick={vai("spese-controllo")}>Vai al controllo</button>}
        {vai("spese-rimborsi") && <button style={btn(false)} onClick={vai("spese-rimborsi")}>Vai ai rimborsi</button>}
      </div>
    </div>);
}
