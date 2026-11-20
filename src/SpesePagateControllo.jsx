// Versione 382 (Tenente Fatture, 13/11/2026): «Spese pagate: controllo» (B1 della procedura approvata, claude/procedura_spese_pagate.md).
// Chi gestisce i conti (Demaria; al suo posto il Dott. Bizzarri o Colabucci) controlla le spese salvate dall'app:
// «Controllata» (vale il documento: importo diverso solo con il motivo), «Da chiarire» con la domanda, collega la fattura elettronica
// (il programma la propone: stesso importo, data vicina), «Annulla» con il motivo. Si scrive solo con le funzioni del database.
// Versione 391 (Tenente, 20/11/2026), per l'app 149:
// - si aprono tutti i file della spesa: documento (manca solo con «Altro»), ricevuta di pagamento, foto del bene, foto dell'insegna;
// - si vedono i dati nuovi: partita IVA, numero del documento, IVA della fattura, che cosa è stato comprato (bene o servizio), prestazione
//   occasionale (lordo, ritenuta, codice fiscale), «Contanti + resto pagato da me», motivo del doppione confermato, ultime 4 cifre lette;
// - importo scritto diverso dal totale letto: «Controllata» solo scegliendo l'importo giusto e scrivendo il motivo (decisione del 20/11 ore 11:12, punto 3;
//   lo blocca anche ci_spesa_controlla);
// - contanti: la spesa è già in cassa dal salvataggio (decisione del 20/11 ore 09:24); un importo cambiato o l'annullamento stornano la riga di cassa (15:45).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
// fetchAllPages restituisce { data, error }: qui un errore ferma la lettura con il suo messaggio
const tutte = async fn => { const r = await fetchAllPages(fn); if (r.error) throw new Error(r.error.message); return r.data; };
import { dataIt, euro } from "./analisiDocumentoBanca";
import { fatturePossibili, centesimi } from "./calcoloMovimenti";
import { fileDellaSpesa, apriFileSpesa, quotaDaMe, dallaCassa, nomeStrumento } from "./fileSpesa";
const numeroIt = n => Number(n).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
// IVA della fattura salvata dall'app: [{ aliquota, imponibile, iva, natura }]
const testoIva = iva => Array.isArray(iva) && iva.length ? iva.map(r => `${numeroIt(r.aliquota)}%${r.natura ? ` (${r.natura})` : ""}: imponibile ${euro(r.imponibile)}, IVA ${euro(r.iva)}`).join(" · ") : "";

const nomeP = p => String(p?.nome || "").trim() + (p?.cognome ? " " + p.cognome : "");
// «45,60», «1.234,56», «45.60» e «45.6» (punto seguito da 1 o 2 cifre finali = decimali)
const leggiImporto = s => { let t = String(s || "").trim().replace(/\s|€/g, "");
  t = /^\d+\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null; const n = Number(t); return n > 0 ? n : null; };
export { leggiImporto };

export default function SpesePagateControllo({ onCambio }) {
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState(null);
  const [aperta, setAperta] = useState(null);       // id della spesa aperta
  const [modulo, setModulo] = useState({});         // importo, motivo, fattura, domanda, annulla
  const [occupato, setOccupato] = useState(false);
  const [mostra, setMostra] = useState("da fare");

  async function carica() {
    setErrore("");
    try {
      const [spese, domande, profili, gestore] = await Promise.all([
        tutte((a, b) => supabase.from("ci_spese").select("*").order("id").range(a, b)),
        tutte((a, b) => supabase.from("ci_spese_domande").select("*").order("id").range(a, b)),
        supabase.from("profili").select("id, nome, cognome"),
        supabase.rpc("ci_puo_gestire_conti")]);
      if (profili.error) throw new Error(profili.error.message);
      const date = spese.map(s => s.data_documento).sort();
      let fatture = [];
      if (date.length) {
        const dal = new Date(Date.parse(date[0]) - 20 * 864e5).toISOString().slice(0, 10), al = new Date(Date.parse(date.at(-1)) + 5 * 864e5).toISOString().slice(0, 10);
        const resti = await tutte((a, b) => supabase.from("ci_v_scadenzario").select("fattura_id, residuo").eq("lato", "fornitore").gte("data_documento", dal).lte("data_documento", al).order("scadenza_id").range(a, b));
        const daPagare = new Set(resti.filter(x => Number(x.residuo) > 0.005).map(x => x.fattura_id));
        fatture = (await tutte((a, b) => supabase.from("ci_fatture").select("id, numero, data, totale_lordo, tipo, ci_fornitori(nome)").eq("tipo", "PASSIVA").gte("data", dal).lte("data", al).order("id").range(a, b)))
          .map(f => ({ id: f.id, numero: f.numero, data: f.data, totale_lordo: f.totale_lordo, fornitore_nome: f.ci_fornitori?.nome || "", daPagare: daPagare.has(f.id) }));
      }
      setD({ spese, domande, nomi: Object.fromEntries((profili.data || []).map(p => [p.id, nomeP(p)])), fatture, gestore: gestore.data === true });
    } catch (e) { setErrore("Lettura non riuscita: " + e.message); }
  }
  useEffect(() => { carica(); }, []);

  const elenco = useMemo(() => {
    if (!d) return [];
    const usate = new Set(d.spese.filter(s => s.fattura_id && s.stato !== "Annullata").map(s => s.fattura_id));
    const filtro = mostra === "da fare" ? s => s.stato === "Da controllare" || s.stato === "Da chiarire" : mostra === "controllate" ? s => s.stato === "Controllata" : s => s.stato === "Annullata";
    return d.spese.filter(filtro).sort((a, b) => a.salvata_il.localeCompare(b.salvata_il)).map(s => ({
      ...s,
      // come ci_spesa_controlla: il totale letto dal documento è diverso dall'importo della spesa
      diverso: s.totale_letto !== null && s.totale_letto !== undefined && centesimi(s.totale_letto) !== centesimi(s.importo),
      file: fileDellaSpesa(s),
      doppioni: d.spese.filter(x => x.id !== s.id && x.stato !== "Annullata" && x.data_documento === s.data_documento && centesimi(x.importo) === centesimi(s.importo)),
      proposte: s.fattura_id ? [] : fatturePossibili(s.importo, s.data_documento, s.fornitore_testo, d.fatture.filter(f => f.daPagare), usate),
      fattura: s.fattura_id ? d.fatture.find(f => f.id === s.fattura_id) || { id: s.fattura_id, numero: `id ${s.fattura_id}` } : null,
      domande: d.domande.filter(q => q.spesa_id === s.id),
    }));
  }, [d, mostra]);

  async function apri(s, f) {
    const errore = await apriFileSpesa(f.percorso);
    if (errore) setEsito({ ok: false, testo: `${f.etichetta} della spesa ${s.numero} non leggibile: ${errore}` });
  }

  async function esegui(s, tipo) {
    if (occupato) return;
    setOccupato(true); setEsito(null);
    let r;
    if (tipo === "Controllata") {
      let imp = null;
      if (s.diverso) {
        // importo scritto diverso dal totale letto: si sceglie quale vale e si scrive il motivo (decisione del 20/11 ore 11:12, punto 3)
        if (!modulo.scelta) { setOccupato(false); return setEsito({ ok: false, testo: `Spesa ${s.numero}: guarda il documento e scegli quale importo vale.` }); }
        imp = modulo.scelta === "scritto" ? Number(s.importo) : modulo.scelta === "letto" ? Number(s.totale_letto) : leggiImporto(modulo.importo);
        if (imp === null) { setOccupato(false); return setEsito({ ok: false, testo: "Importo non valido: scriverlo come sul documento, per esempio 45,60." }); }
        if (!String(modulo.motivo || "").trim()) { setOccupato(false); return setEsito({ ok: false, testo: `Spesa ${s.numero}: scrivi il motivo della scelta dell'importo.` }); }
      } else {
        imp = modulo.importo ? leggiImporto(modulo.importo) : null;
        if (modulo.importo && imp === null) { setOccupato(false); return setEsito({ ok: false, testo: "Importo non valido: scriverlo come sul documento, per esempio 45,60." }); }
      }
      r = await supabase.rpc("ci_spesa_controlla", { p_spesa: s.id, p_esito: "Controllata", p_importo: imp, p_motivo: modulo.motivo || null, p_fattura: modulo.fattura ? Number(modulo.fattura) : null, p_domanda: null });
    } else if (tipo === "Da chiarire") r = await supabase.rpc("ci_spesa_controlla", { p_spesa: s.id, p_esito: "Da chiarire", p_importo: null, p_motivo: null, p_fattura: null, p_domanda: modulo.domanda || null });
    else r = await supabase.rpc("ci_spesa_annulla", { p_spesa: s.id, p_motivo: modulo.annulla || null });
    setOccupato(false);
    if (r.error) return setEsito({ ok: false, testo: `Spesa ${s.numero}: ${r.error.message}` });
    setEsito({ ok: true, testo: `Spesa ${s.numero}: ${tipo === "Annulla" ? "annullata" : tipo === "Da chiarire" ? "domanda mandata a chi ha pagato" : "controllata"}.` });
    setAperta(null); setModulo({}); await carica(); onCambio?.();
  }

  if (!d) return <div style={{ maxWidth: 1100 }}><h2 style={{ color: C.primary }}>Spese pagate: controllo</h2>{errore ? <div style={{ color: C.red }}>{errore}</div> : <div style={{ color: C.muted }}>Leggo le spese…</div>}</div>;
  const quanti = { "da fare": d.spese.filter(s => s.stato === "Da controllare" || s.stato === "Da chiarire").length, controllate: d.spese.filter(s => s.stato === "Controllata").length, annullate: d.spese.filter(s => s.stato === "Annullata").length };

  return (
    <div style={{ maxWidth: 1100 }}>
      <h2 style={{ margin: "0 0 4px", color: C.primary }}>Spese pagate: controllo</h2>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Le spese fotografate con l'app, le più vecchie in alto. Si apre il documento, si confronta e si sceglie: «Controllata», «Da chiarire» (con la domanda) o «Annulla». Vale il documento.</div>
      {!d.gestore && <div style={{ ...scheda, borderColor: C.yellow }}>Puoi vedere solo le tue spese: il controllo lo fa chi gestisce i conti.</div>}
      {errore && <div style={{ ...scheda, borderColor: C.red, color: C.red }}>{errore}</div>}
      {esito && <div style={{ ...scheda, borderColor: esito.ok ? C.green : C.red, color: esito.ok ? C.green : C.red, fontWeight: 700 }}>{esito.testo}</div>}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>{["da fare", "controllate", "annullate"].map(k => <button key={k} style={btn(mostra === k)} onClick={() => setMostra(k)}>{k === "da fare" ? "Da controllare e da chiarire" : k[0].toUpperCase() + k.slice(1)} ({quanti[k]})</button>)}</div>
      {elenco.length === 0 && <div style={{ color: C.muted }}>Nessuna spesa.</div>}
      {elenco.map(s => (
        <div key={s.id} style={{ ...scheda, borderColor: s.diverso ? C.red : s.stato === "Da chiarire" ? C.yellow : C.border }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
            <b>n. {s.numero}</b><span>{dataIt(s.data_documento)}</span><span>{s.tipo_documento}{s.tipo_altro ? ` (${s.tipo_altro})` : ""}</span>
            <span>pagato con <b>{s.pagato_con === "Contanti" && quotaDaMe(s) > 0 ? "Contanti + resto pagato da me" : nomeStrumento(s.pagato_con)}</b></span><span>da {d.nomi[s.salvata_da] || "—"}</span><span>{s.fornitore_testo || ""}</span>
            <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 800 }}>{euro(s.importo)}</span>
            <span style={{ fontWeight: 700, color: s.stato === "Controllata" ? C.green : s.stato === "Annullata" ? C.muted : s.stato === "Da chiarire" ? C.accent : C.blue }}>{s.stato}</span>
          </div>
          {s.diverso && (s.stato === "Da controllare" || s.stato === "Da chiarire") && <div style={{ color: C.red, fontSize: 12.5 }}>Importo della spesa {euro(s.importo)}{centesimi(s.importo_scritto) !== centesimi(s.importo) ? ` (scritto ${euro(s.importo_scritto)})` : ""}, totale letto dal documento {euro(s.totale_letto)}: guarda il documento, scegli l'importo giusto e scrivi il motivo.</div>}
          <DatiSpesa s={s} nomi={d.nomi} />
          {s.doppioni.length > 0 && <div style={{ color: C.red, fontSize: 12.5 }}>Possibile doppione: stessa data e stesso importo della spesa {s.doppioni.map(x => "n. " + x.numero).join(", ")}.</div>}
          {s.nota && <div style={{ fontSize: 12.5 }}>Nota: {s.nota}</div>}
          {s.fattura && <div style={{ fontSize: 12.5, color: C.green }}>Fattura collegata: {s.fattura.fornitore_nome} n. {s.fattura.numero} del {dataIt(s.fattura.data)}</div>}
          {s.annullata_motivo && <div style={{ fontSize: 12.5, color: C.muted }}>Annullata: {s.annullata_motivo}</div>}
          {s.domande.map(q => <div key={q.id} style={{ fontSize: 12.5, color: q.tipo === "Domanda" ? C.accent : C.text }}>{q.tipo === "Domanda" ? "Domanda" : "Risposta"} di {d.nomi[q.scritta_da] || "—"} ({new Date(q.scritta_il).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}): {q.testo}</div>)}
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {s.file.map(f => <button key={f.campo} style={btn(false)} onClick={() => apri(s, f)}>Apri: {f.etichetta.toLowerCase()}</button>)}
            {s.file.length === 0 && <span style={{ fontSize: 12.5, color: C.muted, alignSelf: "center" }}>Nessun file: spesa «Altro» senza documento.</span>}
            {d.gestore && (s.stato === "Da controllare" || s.stato === "Da chiarire") && <button style={btn(aperta === s.id)} onClick={() => { setAperta(aperta === s.id ? null : s.id); setModulo({ fattura: s.proposte.find(f => f.stessoFornitore)?.id || "" }); }}>{aperta === s.id ? "Chiudi" : "Controlla"}</button>}
          </div>
          {aperta === s.id && (
            <div style={{ marginTop: 8, padding: 10, background: "#FAF8F3", borderRadius: 8, display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13 }}><b>Fattura elettronica.</b> {s.proposte.length === 0 ? "Nessuna fattura da pagare nel programma con lo stesso importo e data vicina. La fattura si collega solo qui, al controllo: se deve ancora arrivare, usare «Da chiarire» e controllare quando arriva." : "Proposte con lo stesso importo e data vicina:"}</div>
              {s.proposte.length > 0 && <select style={input} value={modulo.fattura || ""} onChange={e => setModulo(m => ({ ...m, fattura: e.target.value }))}>
                <option value="">Nessuna fattura (scontrino, ricevuta o fattura non ancora arrivata)</option>
                {s.proposte.map(f => <option key={f.id} value={f.id}>{f.fornitore_nome} n. {f.numero} del {dataIt(f.data)} — {euro(f.totale_lordo)}{f.stessoFornitore ? " (stesso fornitore)" : ""}</option>)}</select>}
              {s.diverso ? <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                <b style={{ color: C.red }}>Quale importo vale? (guarda il documento)</b>
                <label><input type="radio" name={`scelta-${s.id}`} checked={modulo.scelta === "scritto"} onChange={() => setModulo(m => ({ ...m, scelta: "scritto" }))} /> quello della spesa: {euro(s.importo)}</label>
                <label><input type="radio" name={`scelta-${s.id}`} checked={modulo.scelta === "letto"} onChange={() => setModulo(m => ({ ...m, scelta: "letto" }))} /> il totale letto dal documento: {euro(s.totale_letto)}</label>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" name={`scelta-${s.id}`} checked={modulo.scelta === "altro"} onChange={() => setModulo(m => ({ ...m, scelta: "altro" }))} /> un altro importo:
                  <input style={{ ...input, width: 110 }} placeholder="45,60" value={modulo.importo || ""} onChange={e => setModulo(m => ({ ...m, scelta: "altro", importo: e.target.value }))} /></label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input style={{ ...input, flex: "1 1 260px" }} placeholder="motivo della scelta (obbligatorio)" value={modulo.motivo || ""} onChange={e => setModulo(m => ({ ...m, motivo: e.target.value }))} />
                  <button style={btn(true, C.green)} disabled={occupato || !modulo.scelta || !String(modulo.motivo || "").trim()} onClick={() => esegui(s, "Controllata")}>Controllata</button>
                </div>
                {s.pagato_con === "Contanti" && <span style={{ fontSize: 12, color: C.muted }}>Contanti: se l'importo cambia, la riga di cassa si storna e se ne scrive una nuova. Se cresce e i contanti di {d.nomi[s.salvata_da] || "chi ha pagato"} non bastano, la differenza diventa «messa da sé» e si rimborsa; se cala, cala prima la parte messa da sé, poi quella presa dalla cassa.</span>}
              </div>
              : <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>Importo del documento, se diverso da {euro(s.importo)}:</span>
                <input style={{ ...input, width: 110 }} placeholder="45,60" value={modulo.importo || ""} onChange={e => setModulo(m => ({ ...m, importo: e.target.value }))} />
                <input style={{ ...input, flex: "1 1 220px" }} placeholder="motivo (obbligatorio se l'importo cambia)" value={modulo.motivo || ""} onChange={e => setModulo(m => ({ ...m, motivo: e.target.value }))} />
                <button style={btn(true, C.green)} disabled={occupato} onClick={() => esegui(s, "Controllata")}>Controllata</button>
              </div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input style={{ ...input, flex: "1 1 300px" }} placeholder="domanda per chi ha pagato" value={modulo.domanda || ""} onChange={e => setModulo(m => ({ ...m, domanda: e.target.value }))} />
                <button style={btn(true, C.accent)} disabled={occupato} onClick={() => esegui(s, "Da chiarire")}>Da chiarire</button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input style={{ ...input, flex: "1 1 300px" }} placeholder="motivo dell'annullamento" value={modulo.annulla || ""} onChange={e => setModulo(m => ({ ...m, annulla: e.target.value }))} />
                <button style={btn(false, C.red)} disabled={occupato} onClick={() => esegui(s, "Annulla")}>Annulla la spesa</button>
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>Con una fattura collegata, la fattura risulta pagata da questa spesa. Contanti: la spesa entra in cassa al salvataggio, alla data del pagamento; un importo cambiato o l'annullamento stornano la riga di cassa (lo storno resta visibile con il motivo). Una spesa tornata qui con «Rifai il controllo» non ha riga di cassa: la riga si riscrive con «Controllata». Con «Contanti + resto pagato da me» la riga di cassa resta provvisoria finché la parte messa da sé non è rimborsata. Carte 1894 e 8006: la spesa è già in prima nota in attesa; si conferma in «Conferma dei movimenti» quando arriva l'estratto. «Pagato da me» e «La mia carta»: nessuna riga in prima nota; si rimborsano in «Rimborsi delle spese».</div>
            </div>)}
        </div>))}
    </div>
  );
}

// I dati della spesa salvati dall'app 149, in righe brevi; mostra solo quelli presenti (le spese della 148 non li hanno)
function DatiSpesa({ s, nomi }) {
  const righe = [];
  const fornitore = [s.partita_iva ? `partita IVA ${s.partita_iva}` : "", s.insegna_percorso && !s.partita_iva ? "senza partita IVA: c'è la foto dell'insegna" : ""].filter(Boolean).join(" — ");
  if (fornitore) righe.push(fornitore);
  const doc = [s.numero_documento ? `documento n. ${s.numero_documento}` : "", s.ora_documento ? `ore ${String(s.ora_documento).slice(0, 5)}` : "",
    s.tipo_ricevuta ? `ricevuta: ${s.tipo_ricevuta}` : "", s.fattura_da_sdi ? "fattura elettronica: arriva dallo SDI" : "",
    s.ordine_numero ? `ordine n. ${s.ordine_numero}` : "", s.venditore ? `venditore ${s.venditore}` : "",
    s.ora_pago ? `pagata il ${new Date(s.ora_pago).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })}` : "",
    s.carta_letta ? `carta letta sulla ricevuta: …${s.carta_letta}` : ""].filter(Boolean).join(" — ");
  if (doc) righe.push(doc);
  const iva = testoIva(s.iva);
  if (iva) righe.push("IVA: " + iva);
  if (s.acquisto || s.bene !== null && s.bene !== undefined) righe.push(`${s.bene === true ? "Bene" : s.bene === false ? "Servizio" : "Acquisto"}: ${s.acquisto || "—"}${s.acquisto_origine ? ` (${s.acquisto_origine === "letto" ? "letto dal documento" : "scritto dalla persona"})` : ""}`);
  if (s.lordo !== null && s.lordo !== undefined) righe.push(`Prestazione occasionale: lordo ${euro(s.lordo)}, ritenuta 20% ${euro(s.ritenuta)} (da versare con F24, codice 1040), netto consegnato ${euro(s.importo)}${s.cf_percipiente ? `, codice fiscale ${s.cf_percipiente}` : ""}`);
  return (
    <>
      {righe.map((t, i) => <div key={i} style={{ fontSize: 12.5, color: C.muted }}>{t}</div>)}
      {quotaDaMe(s) > 0 && <div style={{ fontSize: 12.5, color: C.accent, fontWeight: 700 }}>Contanti + resto pagato da me: {euro(dallaCassa(s))} dalla cassa, {euro(quotaDaMe(s))} messi da {nomi[s.salvata_da] || "chi ha pagato"} (da rimborsare; riga di cassa provvisoria fino al rimborso).</div>}
      {s.doppione_motivo && <div style={{ fontSize: 12.5, color: C.red }}>Salvata nonostante il possibile doppione, con il motivo: {s.doppione_motivo}</div>}
    </>
  );
}
