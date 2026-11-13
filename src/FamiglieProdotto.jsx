// Versione 240 — Pagina «Famiglie di Prodotto»: qui si decide quali descrizioni di fattura sono lo stesso prodotto
// (scelta del Dott. Bizzarri del 9 ottobre 2026: una tabella del programma che si vede e si corregge).
// Le famiglie servono al report «Attenzione Variazione Prezzi». Si scrive nel database solo quando l'utente
// cambia una famiglia o assegna una descrizione.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { C, FONT } from "./style";
import { fetchAllPages } from "./parsingUtils";
import { normalizza, it, data, UNITA, CENTRI_PRODOTTO, fornitoriSeguiti, regolaPerTutti } from "./calcoloVariazionePrezzi";
import { oggiRoma } from "./dateRoma";
import { RIFERIMENTI } from "./riferimentiEsterni";
import { Sezione, stileTabella as T } from "./ReportAnalisiParti";
import { NavigazionePagine } from "./FatturePassive";

const NOMI_UNITA = { tonnellata: "tonnellata", quintale: "quintale", kg: "kg", litro: "litro", pezzo: "pezzo", importo: "importo a fattura" };
const ESCLUSA = "escludi";

async function tutte(tabella, colonne, ordine = "id") {
  const { data: righe, error } = await fetchAllPages((da, a) => supabase.from(tabella).select(colonne).order(ordine).range(da, a));
  if (error) throw new Error(`${tabella}: ${error.message}`);
  return righe || [];
}

export default function FamiglieProdotto() {
  const [famiglie, setFamiglie] = useState([]);
  const [mappa, setMappa] = useState(new Map());
  const [descrizioni, setDescrizioni] = useState([]);
  const [mercati, setMercati] = useState([]);
  const [errore, setErrore] = useState(null);
  const [messaggio, setMessaggio] = useState(null);
  const [filtro, setFiltro] = useState("da-assegnare");
  const [cerca, setCerca] = useState("");
  const [nuova, setNuova] = useState({ nome: "", unita: "tonnellata", prodotto_mercato: "", caratteristiche: "" });
  const [modifiche, setModifiche] = useState({});
  const [salvando, setSalvando] = useState(false);
  // Versione 376: regole «stesso fornitore e la descrizione comincia con»
  const [regole, setRegole] = useState([]);
  const [fornitori, setFornitori] = useState([]);
  const [nuovaRegola, setNuovaRegola] = useState({ fornitore_id: "", inizia_con: "", famiglia_id: "" });
  const [erroreRegole, setErroreRegole] = useState(null);
  // Versione 281 (decisione del 23/10/2026): elenco a pagine (50, 100 o 200 descrizioni per volta) al posto
  // delle sole prime 300.
  const [gruppo, setGruppo] = useState(50);
  const [inizio, setInizio] = useState(0);
  useEffect(() => { setInizio(0); }, [filtro, cerca, gruppo]);

  async function carica() {
    setErrore(null);
    try {
      const [f, m, art, fat, forn, merc, reg] = await Promise.all([
        tutte("ci_famiglie_prodotto", "id, nome, unita, prodotto_mercato, caratteristiche, note", "nome"),
        tutte("ci_famiglie_prodotto_descrizioni", "id, descrizione_norm, famiglia_id"),
        tutte("ci_articoli_fattura", "id, fattura_id, descrizione, totale_riga, centro_costo, area"),
        tutte("ci_fatture", "id, data, tipo, fornitore_id"),
        tutte("ci_fornitori", "id, nome"),
        tutte("coltivazione_prezzi_mercato", "prodotto", "prodotto").catch(() => []),
        tutte("ci_famiglie_prodotto_regole", "id, fornitore_id, inizia_con, famiglia_id").catch(e => { setErroreRegole(`Le regole non si leggono (${e.message}): va lanciato il file 1_contabilita_strutture_v376_regole_prodotti.sql.`); return []; }),
      ]);
      const fm = new Map(fat.map(x => [x.id, x])), fn = new Map(forn.map(x => [x.id, x.nome]));
      const mm = new Map(m.map(x => [x.descrizione_norm, x]));
      // versione 376: fornitori di cui si seguono già dei prodotti (le loro descrizioni nuove si mostrano anche fuori dai centri dei prodotti)
      // (stessa funzione del calcolo, così il numero della pagina è quello del numero rosso del menu)
      const seguiti = fornitoriSeguiti(art, m, f, reg, fm);
      const da24 = new Date(new Date(oggiRoma()) - 730 * 86400000).toISOString().slice(0, 10);
      const per = new Map();
      for (const a of art) {
        const ft = fm.get(a.fattura_id); if (!ft || ft.tipo !== "PASSIVA") continue;
        const n = normalizza(a.descrizione); if (!n) continue;
        const centro = (a.centro_costo || "").trim();
        if (!mm.has(n) && !CENTRI_PRODOTTO.includes(centro) && !seguiti.has(ft.fornitore_id)) continue;
        const x = per.get(n) || { n, testo: a.descrizione, centri: new Set(), fornitori: new Set(), fornitoriId: new Set(), fornitoriRecenti: new Set(), spesa: 0, righe: 0, ultima: "", recente: false };
        x.centri.add(centro); x.fornitori.add(fn.get(ft.fornitore_id) || ""); x.fornitoriId.add(ft.fornitore_id);
        // «recente» = conta nel numero rosso: ultimi 24 mesi, importo positivo, non un cespite (stesse condizioni del calcolo)
        if (String(ft.data).slice(0, 10) >= da24 && (parseFloat(a.totale_riga) || 0) > 0 && (a.area || "").trim() !== "Ammortamenti"
            && (CENTRI_PRODOTTO.includes(centro) || seguiti.has(ft.fornitore_id))) { x.recente = true; x.fornitoriRecenti.add(ft.fornitore_id); } x.spesa += parseFloat(a.totale_riga) || 0; x.righe++;
        if (String(ft.data) > x.ultima) x.ultima = String(ft.data).slice(0, 10);
        per.set(n, x);
      }
      setFamiglie(f); setMappa(mm); setRegole(reg); setFornitori(forn.slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome))));
      setDescrizioni([...per.values()].map(x => ({ ...x, centri: [...x.centri].join(", "), fornitori: [...x.fornitori].join(", "), fornitoriId: [...x.fornitoriId], fornitoriRecenti: [...x.fornitoriRecenti] })).sort((a, b) => b.spesa - a.spesa));
      setMercati([...new Set(merc.map(x => x.prodotto).concat(Object.keys(RIFERIMENTI.mercatiEsterni || {})))].sort());
    } catch (e) {
      setErrore(`${e.message}. Se le tabelle non esistono, va lanciato una volta il file contabilita_strutture_v240.sql nell'SQL Editor di Supabase.`);
    }
  }
  useEffect(() => { carica(); }, []);

  async function assegna(n, valore) {
    setSalvando(true); setMessaggio(null);
    const famiglia_id = valore === ESCLUSA ? null : parseInt(valore);
    const { error } = await supabase.from("ci_famiglie_prodotto_descrizioni").upsert({ descrizione_norm: n, famiglia_id, updated_at: new Date().toISOString() }, { onConflict: "descrizione_norm" });
    setSalvando(false);
    if (error) { setMessaggio(`Errore: ${error.message}`); return; }
    const nm = new Map(mappa); nm.set(n, { ...(mappa.get(n) || {}), descrizione_norm: n, famiglia_id }); setMappa(nm);
    setMessaggio(`Salvato: «${n.slice(0, 60)}» → ${famiglia_id ? (famiglie.find(f => f.id === famiglia_id) || {}).nome : "esclusa dal confronto"}.`);
  }

  async function salvaFamiglia(f) {
    const m = modifiche[f.id]; if (!m) return;
    setSalvando(true); setMessaggio(null);
    const { error } = await supabase.from("ci_famiglie_prodotto").update(m).eq("id", f.id);
    setSalvando(false);
    if (error) { setMessaggio(`Errore: ${error.message}`); return; }
    setFamiglie(famiglie.map(x => (x.id === f.id ? { ...x, ...m } : x)));
    const r = { ...modifiche }; delete r[f.id]; setModifiche(r);
    setMessaggio(`Famiglia «${m.nome || f.nome}» salvata.`);
  }

  async function creaFamiglia() {
    if (!nuova.nome.trim()) { setMessaggio("Scrivere il nome della famiglia."); return; }
    setSalvando(true); setMessaggio(null);
    const riga = { nome: nuova.nome.trim(), unita: nuova.unita, prodotto_mercato: nuova.prodotto_mercato.trim() || null, caratteristiche: nuova.caratteristiche.trim() || null };
    const { data: ins, error } = await supabase.from("ci_famiglie_prodotto").insert(riga).select();
    setSalvando(false);
    if (error) { setMessaggio(`Errore: ${error.message}`); return; }
    setFamiglie([...famiglie, ...(ins || [])].sort((a, b) => a.nome.localeCompare(b.nome)));
    setNuova({ nome: "", unita: "tonnellata", prodotto_mercato: "", caratteristiche: "" });
    setMessaggio(`Famiglia «${riga.nome}» creata.`);
  }

  // versione 376: regola che copre una descrizione (solo se la descrizione non è assegnata una per una)
  const regolaDi = x => regolaPerTutti(regole, x.n, x.fornitoriRecenti && x.fornitoriRecenti.length ? x.fornitoriRecenti : x.fornitoriId);
  const nomeFamiglia = id => (famiglie.find(f => f.id === id) || {}).nome || "?";
  const nomeFornitore = id => (fornitori.find(f => f.id === id) || {}).nome || "?";
  async function creaRegola() {
    const t = normalizza(nuovaRegola.inizia_con);
    if (!nuovaRegola.fornitore_id || !nuovaRegola.famiglia_id) { setMessaggio("Scegliere il fornitore e la famiglia della regola."); return; }
    if (t.length < 6) { setMessaggio("Il testo «comincia con» deve avere almeno 6 caratteri."); return; }
    const coperte = descrizioni.filter(x => !mappa.has(x.n) && x.n.startsWith(t) && x.fornitoriId.includes(parseInt(nuovaRegola.fornitore_id)));
    setSalvando(true); setMessaggio(null);
    const { data: ins, error } = await supabase.from("ci_famiglie_prodotto_regole").insert({ fornitore_id: parseInt(nuovaRegola.fornitore_id), inizia_con: t, famiglia_id: parseInt(nuovaRegola.famiglia_id) }).select();
    setSalvando(false);
    if (error) { setMessaggio(`Errore: ${error.message}`); return; }
    setRegole([...regole, ...(ins || [])]);
    setNuovaRegola({ fornitore_id: "", inizia_con: "", famiglia_id: "" });
    carica();   // il fornitore della regola diventa «seguito»: si rilegge l'elenco
    setMessaggio(`Regola salvata: ${nomeFornitore(parseInt(nuovaRegola.fornitore_id))}, «${t}…» → ${nomeFamiglia(parseInt(nuovaRegola.famiglia_id))}. Descrizioni da assegnare coperte adesso: ${coperte.length}.`);
  }
  async function togliRegola(r) {
    setSalvando(true); setMessaggio(null);
    const { error } = await supabase.from("ci_famiglie_prodotto_regole").delete().eq("id", r.id);
    setSalvando(false);
    if (error) { setMessaggio(`Errore: ${error.message}`); return; }
    setRegole(regole.filter(x => x.id !== r.id));
    carica();
    setMessaggio(`Regola tolta: ${nomeFornitore(r.fornitore_id)}, «${r.inizia_con}…». Le descrizioni che copriva tornano da assegnare (se non sono assegnate una per una).`);
  }
  const contaPerFamiglia = useMemo(() => { const c = {}; for (const x of mappa.values()) if (x.famiglia_id) c[x.famiglia_id] = (c[x.famiglia_id] || 0) + 1; return c; }, [mappa]);
  const visibili = descrizioni.filter(x => {
    const m = mappa.get(x.n);
    if (filtro === "da-assegnare" && (m || regolaDi(x) || !x.recente)) return false;
    if (filtro === "da-assegnare-tutte" && (m || regolaDi(x))) return false;
    if (filtro === "da-regola" && (m || !regolaDi(x))) return false;
    if (filtro === "escluse" && !(m && !m.famiglia_id)) return false;
    if (filtro.startsWith("f:") && !(m && m.famiglia_id === parseInt(filtro.slice(2)))) return false;
    return !cerca || x.n.includes(cerca.toLowerCase()) || x.fornitori.toLowerCase().includes(cerca.toLowerCase());
  });
  const daAssegnare = descrizioni.filter(x => !mappa.has(x.n) && !regolaDi(x)).length;
  const daAssegnareRecenti = descrizioni.filter(x => !mappa.has(x.n) && !regolaDi(x) && x.recente).length;
  // se assegnando le descrizioni l'elenco si accorcia, si resta sull'ultima pagina che esiste
  const inizioValido = visibili.length === 0 ? 0 : Math.min(inizio, Math.floor((visibili.length - 1) / gruppo) * gruppo);
  const campo = { padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: FONT, boxSizing: "border-box" };

  return (
    <div style={{ fontFamily: FONT, color: C.text, maxWidth: 1150 }}>
      <h1 style={{ margin: 0, fontSize: 24, color: C.primary }}>🗂️ Famiglie di Prodotto</h1>
      <p style={{ color: C.muted, fontSize: 13.5, margin: "4px 0 0" }}>Qui si decide quali descrizioni di fattura sono lo stesso prodotto. Il report «Attenzione Variazione Prezzi» confronta i prezzi dentro ogni famiglia, con l'unità di misura scelta.</p>
      {errore && <div style={{ background: "#F8E1DE", color: "#9B2C20", padding: 10, borderRadius: 8, marginTop: 10 }}>{errore}</div>}
      {messaggio && <div style={{ background: "#E6F0E8", color: "#2F5E3B", padding: 8, borderRadius: 8, marginTop: 10, fontSize: 13.5 }}>{messaggio}</div>}

      <Sezione titolo={`Descrizioni delle fatture (${daAssegnareRecenti} da assegnare negli ultimi 24 mesi, il numero rosso del menu; ${daAssegnare} in tutto)`} sottotitolo="Per ogni descrizione si sceglie la famiglia, oppure «Esclusa dal confronto» per le righe che non sono un prodotto (bolli, pallet, prestazioni diverse ogni volta). Il salvataggio è immediato.">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <select value={filtro} onChange={e => setFiltro(e.target.value)} style={campo}>
            <option value="da-assegnare">Da assegnare (ultimi 24 mesi: il numero rosso del menu)</option>
            <option value="da-assegnare-tutte">Da assegnare (anche più vecchie)</option>
            <option value="da-regola">Riconosciute da una regola</option>
            <option value="tutte">Tutte</option>
            <option value="escluse">Escluse dal confronto</option>
            {famiglie.map(f => <option key={f.id} value={`f:${f.id}`}>Famiglia: {f.nome}</option>)}
          </select>
          <input placeholder="Cerca descrizione o fornitore" value={cerca} onChange={e => setCerca(e.target.value)} style={{ ...campo, minWidth: 260 }} />
          <span style={{ fontSize: 12.5, color: C.muted, alignSelf: "center" }}>{visibili.length} descrizioni</span>
        </div>
        <NavigazionePagine numero={visibili.length} inizio={inizioValido} gruppo={gruppo} setInizio={setInizio} setGruppo={setGruppo} cosa="descrizioni" />
        <div style={{ overflowX: "auto" }}><table style={T.tabella}>
          <thead><tr><th style={T.thSx}>Descrizione in fattura</th><th style={T.thSx}>Centro di costo</th><th style={T.thSx}>Fornitori</th><th style={T.th}>Spesa totale</th><th style={T.th}>Ultima fattura</th><th style={T.thSx}>Famiglia</th></tr></thead>
          <tbody>{visibili.slice(inizioValido, inizioValido + gruppo).map(x => {
            const m = mappa.get(x.n);
            const valore = !m ? "" : m.famiglia_id ? String(m.famiglia_id) : ESCLUSA;
            const rg = !m ? regolaDi(x) : null;
            return (
              <tr key={x.n}>
                <td style={{ ...T.tdSx, whiteSpace: "normal", maxWidth: 360 }}>{x.testo}</td><td style={T.tdSx}>{x.centri}</td><td style={{ ...T.tdSx, whiteSpace: "normal" }}>{x.fornitori}</td>
                <td style={T.td}>{it(x.spesa)} €</td><td style={T.td}>{data(x.ultima)}</td>
                <td style={T.tdSx}>
                  <select value={valore} disabled={salvando} onChange={e => e.target.value !== "" && assegna(x.n, e.target.value)} style={{ ...campo, maxWidth: 260, background: valore ? "#fff" : "#FBF0D9" }}>
                    {!m && <option value="">{rg ? `— dalla regola: ${nomeFamiglia(rg.famiglia_id)} —` : "— da assegnare —"}</option>}
                    <option value={ESCLUSA}>Esclusa dal confronto</option>
                    {famiglie.map(f => <option key={f.id} value={String(f.id)}>{f.nome}</option>)}
                  </select>
                  {!m && !rg && x.fornitoriId.length === 1 && <button disabled={salvando} title="Prepara una regola per questo fornitore con l'inizio di questa descrizione" onClick={() => { const p = x.n.split(" "); let t = ""; for (const w of p) { t = t ? `${t} ${w}` : w; if (t.length >= 6 && t.split(" ").length >= 2) break; } setNuovaRegola({ fornitore_id: String(x.fornitoriId[0]), inizia_con: t, famiglia_id: "" }); setTimeout(() => document.getElementById("nuova-regola")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }} style={{ marginLeft: 6, fontSize: 11.5, border: `1px solid ${C.border}`, background: "#fff", borderRadius: 6, padding: "3px 6px", cursor: "pointer" }}>➕ regola</button>}
                </td>
              </tr>);
          })}</tbody>
        </table></div>
        <NavigazionePagine numero={visibili.length} inizio={inizioValido} gruppo={gruppo} setInizio={setInizio} setGruppo={setGruppo} cosa="descrizioni" />
      </Sezione>

      <Sezione titolo={`Regole «stesso fornitore e la descrizione comincia con» (${regole.length})`} sottotitolo="Per le descrizioni che cambiano da una fattura all'altra (per esempio il gasolio, dove nel testo c'è l'importo dell'accisa): una regola scritta una volta riconosce anche le fatture future. La descrizione assegnata una per una vale sempre più della regola. Versione 376.">
        {erroreRegole && <div style={{ background: "#F8E1DE", color: "#9B2C20", padding: 8, borderRadius: 8, marginBottom: 8, fontSize: 13 }}>{erroreRegole}</div>}
        <div style={{ overflowX: "auto" }}><table style={T.tabella}>
          <thead><tr><th style={T.thSx}>Fornitore</th><th style={T.thSx}>La descrizione comincia con</th><th style={T.thSx}>Famiglia</th><th style={T.th}>Descrizioni riconosciute</th><th style={T.th}></th></tr></thead>
          <tbody>{regole.map(r => <tr key={r.id}>
            <td style={T.tdSx}>{nomeFornitore(r.fornitore_id)}</td><td style={T.tdSx}>«{r.inizia_con}…»</td><td style={T.tdSx}>{nomeFamiglia(r.famiglia_id)}</td>
            <td style={T.td}>{descrizioni.filter(x => !mappa.has(x.n) && regolaDi(x)?.id === r.id).length}</td>
            <td style={T.td}><button disabled={salvando} onClick={() => togliRegola(r)} style={{ border: `1px solid ${C.border}`, background: "#fff", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>Togli</button></td></tr>)}
            {!regole.length && <tr><td colSpan={5} style={{ ...T.tdSx, color: C.muted }}>Nessuna regola.</td></tr>}</tbody>
        </table></div>
        <div id="nuova-regola" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <b style={{ width: "100%", fontSize: 14 }}>Nuova regola</b>
          <select value={nuovaRegola.fornitore_id} onChange={e => setNuovaRegola({ ...nuovaRegola, fornitore_id: e.target.value })} style={{ ...campo, maxWidth: 260, borderColor: nuovaRegola.fornitore_id ? C.border : "#C0392B" }}>
            <option value="">— fornitore —</option>{fornitori.map(f => <option key={f.id} value={String(f.id)}>{f.nome}</option>)}</select>
          <input placeholder="La descrizione comincia con (almeno 6 caratteri)" value={nuovaRegola.inizia_con} onChange={e => setNuovaRegola({ ...nuovaRegola, inizia_con: e.target.value })} style={{ ...campo, width: 300 }} />
          <select value={nuovaRegola.famiglia_id} onChange={e => setNuovaRegola({ ...nuovaRegola, famiglia_id: e.target.value })} style={{ ...campo, maxWidth: 240, borderColor: nuovaRegola.famiglia_id ? C.border : "#C0392B" }}>
            <option value="">— famiglia —</option>{famiglie.map(f => <option key={f.id} value={String(f.id)}>{f.nome}</option>)}</select>
          <button disabled={salvando} onClick={creaRegola} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px" }}>Salva la regola</button>
          {nuovaRegola.fornitore_id && normalizza(nuovaRegola.inizia_con).length >= 6 && <span style={{ fontSize: 12.5, color: C.muted, width: "100%" }}>
            Descrizioni di questo fornitore che la regola riconoscerebbe: {descrizioni.filter(x => x.fornitoriId.includes(parseInt(nuovaRegola.fornitore_id)) && x.n.startsWith(normalizza(nuovaRegola.inizia_con))).map(x => `«${x.testo}»${mappa.has(x.n) ? " (già assegnata una per una)" : ""}`).join("; ") || "nessuna per ora"}</span>}
        </div>
      </Sezione>

      <Sezione titolo={`Famiglie (${famiglie.length})`} sottotitolo="Unità = come si mostra il prezzo (il calcolo è sempre in € al kg o al litro). Prodotto di mercato = il listino di confronto. Le caratteristiche tecniche finiscono nel testo di ricerca dei fornitori.">
        <div style={{ overflowX: "auto" }}><table style={T.tabella}>
          <thead><tr><th style={T.thSx}>Nome</th><th style={T.thSx}>Unità</th><th style={T.thSx}>Prodotto di mercato</th><th style={T.thSx}>Caratteristiche tecniche</th><th style={T.th}>Descrizioni</th><th style={T.th}></th></tr></thead>
          <tbody>{famiglie.map(f => {
            const m = { ...f, ...(modifiche[f.id] || {}) };
            const cambia = (k, v) => setModifiche({ ...modifiche, [f.id]: { ...(modifiche[f.id] || {}), [k]: v } });
            return (
              <tr key={f.id}>
                <td style={T.tdSx}><input value={m.nome} onChange={e => cambia("nome", e.target.value)} style={{ ...campo, width: 230 }} /></td>
                <td style={T.tdSx}><select value={m.unita} onChange={e => cambia("unita", e.target.value)} style={campo}>{Object.keys(UNITA).map(u => <option key={u} value={u}>{NOMI_UNITA[u]}</option>)}</select></td>
                <td style={T.tdSx}><input list="mercati" value={m.prodotto_mercato || ""} onChange={e => cambia("prodotto_mercato", e.target.value || null)} style={{ ...campo, width: 170 }} /></td>
                <td style={T.tdSx}><textarea value={m.caratteristiche || ""} onChange={e => cambia("caratteristiche", e.target.value || null)} rows={2} style={{ ...campo, width: 300 }} /></td>
                <td style={T.td}>{contaPerFamiglia[f.id] || 0}</td>
                <td style={T.td}>{modifiche[f.id] && <button disabled={salvando} onClick={() => salvaFamiglia(f)} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 6, padding: "5px 10px" }}>Salva</button>}</td>
              </tr>);
          })}</tbody>
        </table></div>
        <datalist id="mercati">{mercati.map(x => <option key={x} value={x} />)}</datalist>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <b style={{ width: "100%", fontSize: 14 }}>Nuova famiglia</b>
          <input placeholder="Nome" value={nuova.nome} onChange={e => setNuova({ ...nuova, nome: e.target.value })} style={{ ...campo, width: 230 }} />
          <select value={nuova.unita} onChange={e => setNuova({ ...nuova, unita: e.target.value })} style={campo}>{Object.keys(UNITA).map(u => <option key={u} value={u}>{NOMI_UNITA[u]}</option>)}</select>
          <input list="mercati" placeholder="Prodotto di mercato (facoltativo)" value={nuova.prodotto_mercato} onChange={e => setNuova({ ...nuova, prodotto_mercato: e.target.value })} style={{ ...campo, width: 220 }} />
          <input placeholder="Caratteristiche tecniche (facoltativo)" value={nuova.caratteristiche} onChange={e => setNuova({ ...nuova, caratteristiche: e.target.value })} style={{ ...campo, width: 300 }} />
          <button disabled={salvando} onClick={creaFamiglia} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px" }}>Crea</button>
        </div>
      </Sezione>
    </div>
  );
}
