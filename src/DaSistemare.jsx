// Versione 409 — Pagina «Da sistemare» del Controllo Prezzi di Acquisto (decisioni del Dott. Bizzarri del 26/11/2026, 10:23–12:20;
// giro approvato alle 14:12, claude/soldato_409_giro_e_casi_brutti.md).
// Qui si decide che cosa fare dei nomi di prodotto nuovi, dei possibili doppioni, dei servizi a canone, dei fornitori delle righe pagate
// da Muratella e delle righe con un'unità di misura che non torna. Le decisioni le scrive solo la funzione del database ci_prezzi_decidi,
// che controlla il permesso «Può sistemare i prodotti» e che la stessa cosa non sia già stata decisa da un altro.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { C, FONT } from "./style";
import { caricaDatiPrezzi, analisiPrezzi, it, data, normalizza, pulisciNome, regoleAccese } from "./calcoloVariazionePrezzi";
import { Intestazione, Sezione, Bollino, stileTabella as T } from "./ReportAnalisiParti";

const TIPI = {
  nome: ["Nome nuovo", "b-arancio"], stesso: ["Possibile stesso prodotto", "b-arancio"], canone: ["A canone?", "b-arancio"],
  muratella: ["Fornitore di Muratella da riconoscere", "b-rosso"], unita: ["Da controllare: unità di misura", "b-rosso"], confezione: ["Sacchi o sfuso?", "b-arancio"],
};
const UNITA = [["tonnellata", "€ a tonnellata"], ["quintale", "€ a quintale"], ["kg", "€ al kg"], ["litro", "€ al litro"], ["pezzo", "€ al pezzo"], ["importo", "€ a fattura"]];
const DECISIONI = { va_bene: "Va bene così, si confronta con sé stesso", escluso: "Escluso dal confronto", stesso: "È lo stesso prodotto di una famiglia", crea: "Famiglia creata",
  si: "Sì", no: "No", fornitore: "Fornitore scelto", nome_proprio: "Fornitore non in anagrafica: nome del riferimento", vista: "Riga controllata, resta fuori dal confronto", sacchi: "In sacchi", sfuso: "Sfuso" };
const ora = () => new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const btn = (pieno, colore = C.primary) => ({ background: pieno ? colore : "#fff", color: pieno ? "#fff" : colore, border: `1.5px solid ${colore}`, borderRadius: 7, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" });
const unitaProposta = centro => /gasolio/i.test(centro) ? "litro" : /medicinali/i.test(centro) ? "pezzo" : /mangimi|foraggio|integratori/i.test(centro) ? "tonnellata" : "kg";

export default function DaSistemare() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [caricando, setCaricando] = useState(false);
  const [calcolatoIl, setCalcolatoIl] = useState(null);
  const [permesso, setPermesso] = useState(false);
  const [dottore, setDottore] = useState(false);
  const [nomi, setNomi] = useState({});
  const [aperto, setAperto] = useState(null);
  const [filtro, setFiltro] = useState("tutti");
  const [messaggio, setMessaggio] = useState(null);
  const [daAnnullare, setDaAnnullare] = useState(null); const [motivo, setMotivo] = useState("");
  const [assegnazioni, setAssegnazioni] = useState([]);

  async function carica() {
    setCaricando(true); setErrore(null);
    try {
      const d = await caricaDatiPrezzi();
      const [p, u] = await Promise.all([supabase.rpc("ci_puo_sistemare_prodotti"), supabase.auth.getUser()]);
      setPermesso(p.data === true);
      const id = u.data?.user?.id;
      if (id) { const pr = await supabase.from("profili").select("ruolo").eq("id", id).maybeSingle(); setDottore(pr.data?.ruolo === "admin"); }
      // assegnazioni fatte dalla pagina «Famiglie di Prodotto» (chi e quando, caso brutto 4)
      const as = await supabase.from("ci_famiglie_prodotto_descrizioni").select("id, descrizione_norm, famiglia_id, cambiata_da, updated_at").not("cambiata_da", "is", null).order("updated_at", { ascending: false }).limit(100);
      const vive = (d.decisioni || []).filter(x => !x.annullata_il);
      const daDecisioni = new Set(vive.map(x => x.chiave)), idCreati = new Set(vive.flatMap(x => x.descrizioni_create || []));
      const ass = as.error ? [] : (as.data || []).filter(x => !daDecisioni.has(x.descrizione_norm) && !idCreati.has(x.id)); setAssegnazioni(ass);
      const chi = [...new Set([...(d.decisioni || []).map(x => x.deciso_da), ...ass.map(x => x.cambiata_da)].filter(Boolean))];
      if (chi.length) { const pr = await supabase.from("profili").select("id, nome, cognome").in("id", chi); setNomi(Object.fromEntries((pr.data || []).map(x => [x.id, `${x.nome || ""} ${x.cognome || ""}`.trim()]))); }
      setDati(d); setCalcolatoIl(ora());
    } catch (e) { setErrore(e.message || String(e)); }
    setCaricando(false);
  }
  useEffect(() => { carica(); }, []);
  const r = useMemo(() => { if (!dati) return null; try { return analisiPrezzi(dati); } catch (e) { return { errore: e.message || String(e) }; } }, [dati]);

  // famiglie con il centro di costo delle loro righe e l'ultimo prezzo (per «È lo stesso prodotto di…»)
  const famiglie = useMemo(() => {
    if (!dati || !r || r.errore) return [];
    const regole = regoleAccese(dati.regolePulizia);
    const mappa = new Map(dati.descrizioni.map(x => [x.descrizione_norm, x.famiglia_id])), mp = new Map(dati.descrizioni.map(x => [pulisciNome(x.descrizione_norm, null, regole), x.famiglia_id]));
    const centri = new Map();
    for (const a of dati.articoli) {
      const fid = mappa.get(normalizza(a.descrizione)) ?? mp.get(pulisciNome(a.descrizione, a.centro_costo, regole)); if (!fid) continue;
      if (!centri.has(fid)) centri.set(fid, new Set()); centri.get(fid).add((a.centro_costo || "").trim());
    }
    return dati.famiglie.map(f => { const s = r.schede.find(x => x.famiglia.id === f.id || x.famiglia.chiaveFamiglia === String(f.id)); return { ...f, centri: centri.get(f.id) || new Set(), ultimo: s ? s.ultimo : null, etichetta: s ? s.unita.etichetta : "", base: s ? s.unita.base : "" }; })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [dati, r]);

  async function decidi(p) {
    setMessaggio(null);
    const { error } = await supabase.rpc("ci_prezzi_decidi", { p });
    if (error) { setMessaggio({ errore: true, testo: error.message }); return false; }
    setAperto(null); await carica(); setMessaggio({ testo: "Decisione registrata." }); return true;
  }
  async function letto(id) { const { error } = await supabase.rpc("ci_prezzi_decisione_letta", { p_id: id }); if (error) setMessaggio({ errore: true, testo: error.message }); else await carica(); }
  async function annulla(x) {
    const { error } = await supabase.rpc("ci_prezzi_annulla", { p_id: x.id, p_motivo: motivo.trim() });
    if (error) setMessaggio({ errore: true, testo: error.message }); else { setDaAnnullare(null); setMotivo(""); await carica(); setMessaggio({ testo: "Decisione annullata: la cosa torna in «Da sistemare»." }); }
  }

  const elenco = r && !r.errore ? r.daSistemare.filter(x => filtro === "tutti" || x.tipo === filtro) : [];
  const decisioni = r && !r.errore ? [...r.decisioni].sort((a, b) => (a.deciso_il < b.deciso_il ? 1 : -1)) : [];
  const daLeggere = decisioni.filter(x => !x.letto_dal_dottore_il);
  return (
    <div style={{ fontFamily: FONT, color: C.text, maxWidth: 1100 }}>
      <Intestazione titolo="🧹 Da sistemare" sottotitolo="Nomi di prodotto nuovi, possibili doppioni, servizi a canone, fornitori delle righe pagate da Muratella e righe con un'unità che non torna. Ogni decisione vale subito per «Attenzione Variazione Prezzi» e resta scritta con chi l'ha presa e quando."
        aggiorna={carica} calcolatoIl={calcolatoIl} caricando={caricando} />
      {errore && <div style={{ background: "#F8E1DE", color: "#9B2C20", padding: 10, borderRadius: 8, marginTop: 10 }}>{errore}</div>}
      {r && r.errore && <div style={{ background: "#F8E1DE", color: "#9B2C20", padding: 10, borderRadius: 8, marginTop: 10 }}>Errore nel calcolo: {r.errore}</div>}
      {r && !r.errore && r.manca409 && <div style={{ background: "#F8E1DE", color: "#9B2C20", padding: 10, borderRadius: 8, marginTop: 10, fontWeight: 700 }}>Le tabelle della versione 409 non si leggono: va lanciato il file 1_contabilita_strutture_v409_da_sistemare.sql. Fino ad allora non si possono registrare decisioni.</div>}
      {r && !r.errore && !permesso && <div style={{ background: "#FFF4E0", color: "#8A5A00", padding: 10, borderRadius: 8, marginTop: 10 }}>Si vede l'elenco, ma per decidere serve il permesso <b>«Può sistemare i prodotti»</b>, che dà il Dott. Bizzarri nella pagina Accessi.</div>}
      {messaggio && <div style={{ background: messaggio.errore ? "#F8E1DE" : "#E3F1E6", color: messaggio.errore ? "#9B2C20" : "#2E6B3A", padding: 10, borderRadius: 8, marginTop: 10, fontWeight: 700 }}>{messaggio.testo}</div>}
      {!dati && !errore && <p style={{ color: C.muted }}>Calcolo in corso…</p>}
      {r && !r.errore && <>
        <Sezione titolo={`Da sistemare (${r.daSistemare.length})`} sottotitolo={`In ordine di spesa. In rosso quelli che aspettano da più di 30 giorni (${r.daSistemare.filter(x => x.vecchio).length}). Si apre una cosa alla volta.`}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {[["tutti", "Tutti"], ...Object.entries(TIPI).map(([k, v]) => [k, v[0]])].map(([k, l]) => { const n = k === "tutti" ? r.daSistemare.length : r.daSistemare.filter(x => x.tipo === k).length;
              return <button key={k} style={btn(filtro === k)} onClick={() => setFiltro(k)}>{l} ({n})</button>; })}
          </div>
          {!elenco.length && <p style={{ color: C.muted }}>Niente da sistemare.</p>}
          {elenco.map(x => { const k = `${x.tipo}|${x.chiave}`, ap = aperto === k;
            return <div key={k} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `5px solid ${x.vecchio ? C.red : C.yellow}`, borderRadius: 8, marginBottom: 8 }}>
              <div onClick={() => setAperto(ap ? null : k)} style={{ cursor: "pointer", padding: "8px 12px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ flex: "3 1 320px" }}><div style={{ fontWeight: 700 }}>{ap ? "▾" : "▸"} {x.titolo}</div>
                  <div style={{ fontSize: 12.5, color: C.muted }}>{[x.fornitori, x.centro].filter(Boolean).join(" · ")}</div></div>
                <div><Bollino tipo={TIPI[x.tipo][1]}>{TIPI[x.tipo][0]}</Bollino></div>
                <div style={{ flex: "1 1 110px", fontSize: 13 }}>{x.spesa ? `${it(x.spesa, 0)} € in 24 mesi` : ""}{x.prima ? <div style={{ fontSize: 12, color: x.vecchio ? C.red : C.muted, fontWeight: x.vecchio ? 700 : 400 }}>dal {data(x.prima)}{x.vecchio ? " · da più di 30 giorni" : ""}</div> : null}</div>
              </div>
              {ap && <Dettaglio x={x} r={r} famiglie={famiglie} fornitori={dati.fornitori} permesso={permesso} decidi={decidi} />}
            </div>; })}
        </Sezione>

        <Sezione titolo={`Decisioni prese (${decisioni.length})${dottore ? ` · da leggere: ${daLeggere.length}` : ""}`} sottotitolo="Chi ha deciso, quando e che cosa. Il Dott. Bizzarri le segna come lette e può annullarle («Separa»): la cosa torna in «Da sistemare».">
          {!decisioni.length ? <p style={{ color: C.muted }}>Nessuna decisione ancora.</p> :
            <div style={{ overflowX: "auto" }}><table style={T.tabella}><thead><tr><th style={T.thSx}>Quando</th><th style={T.thSx}>Chi</th><th style={T.thSx}>Che cosa</th><th style={T.thSx}>Decisione</th><th style={T.thSx}></th></tr></thead>
              <tbody>{decisioni.slice(0, 200).map(x => { const f = x.famiglia_id && dati.famiglie.find(y => y.id === x.famiglia_id), fo = x.fornitore_id && dati.fornitori.find(y => y.id === x.fornitore_id);
                return <tr key={x.id} style={{ background: dottore && !x.letto_dal_dottore_il ? "#FFF8EC" : undefined }}>
                  <td style={T.tdSx}>{new Date(x.deciso_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td style={T.tdSx}>{nomi[x.deciso_da] || "—"}</td>
                  <td style={{ ...T.tdSx, whiteSpace: "normal" }}>{TIPI[x.tipo]?.[0]}: {x.chiave}</td>
                  <td style={{ ...T.tdSx, whiteSpace: "normal" }}>{DECISIONI[x.decisione] || x.decisione}{f ? ` – ${f.nome}` : ""}{fo ? ` – ${fo.nome}` : ""}{x.unita ? ` (${x.unita})` : ""}{x.nota ? ` · nota: ${x.nota}` : ""}</td>
                  <td style={T.tdSx}>{dottore && !x.letto_dal_dottore_il && <button style={btn(false)} onClick={() => letto(x.id)}>Letto</button>} {dottore && daAnnullare !== x.id && <button style={btn(false, C.red)} onClick={() => { setDaAnnullare(x.id); setMotivo(""); }}>Separa / annulla</button>}
                    {daAnnullare === x.id && <span><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (obbligatorio)" style={{ padding: 4, width: 200 }} /> <button style={btn(true, C.red)} disabled={!motivo.trim()} onClick={() => annulla(x)}>Conferma</button> <button style={btn(false)} onClick={() => setDaAnnullare(null)}>Lascia stare</button></span>}</td>
                </tr>; })}</tbody></table></div>}
          {assegnazioni.length > 0 && <>
            <h3 style={{ fontSize: 15, margin: "14px 0 6px" }}>Assegnazioni fatte dalla pagina «Famiglie di Prodotto» ({assegnazioni.length})</h3>
            <div style={{ overflowX: "auto" }}><table style={T.tabella}><thead><tr><th style={T.thSx}>Quando</th><th style={T.thSx}>Chi</th><th style={T.thSx}>Nome</th><th style={T.thSx}>Famiglia</th></tr></thead>
              <tbody>{assegnazioni.map(x => <tr key={x.descrizione_norm}><td style={T.tdSx}>{new Date(x.updated_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td style={T.tdSx}>{nomi[x.cambiata_da] || "—"}</td>
                <td style={{ ...T.tdSx, whiteSpace: "normal" }}>{x.descrizione_norm}</td><td style={T.tdSx}>{x.famiglia_id ? (dati.famiglie.find(f => f.id === x.famiglia_id)?.nome || x.famiglia_id) : "escluso dal confronto"}</td></tr>)}</tbody></table></div>
          </>}
        </Sezione>
      </>}
    </div>
  );
}

function Dettaglio({ x, r, famiglie, fornitori, permesso, decidi }) {
  const [nota, setNota] = useState("");
  const [unita, setUnita] = useState(unitaProposta(x.centro || ""));
  const [fam, setFam] = useState("");
  const [nuova, setNuova] = useState({ nome: x.titolo, unita: unitaProposta(x.centro || "") });
  const [forn, setForn] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const [confermo, setConfermo] = useState(false);
  const [altriNomi, setAltriNomi] = useState([]);
  // N5: nella famiglia nuova si possono mettere anche altri nomi nuovi dello stesso prodotto (stesso fornitore o stesso centro di costo)
  const candidati = x.tipo === "nome" ? (r?.daSistemare || []).filter(y => y.tipo === "nome" && y.chiave !== x.chiave && ((x.centro && y.centro === x.centro) || (x.fornitori && y.fornitori === x.fornitori))).slice(0, 20) : [];
  // caso brutto 1: prezzi che differiscono più del 15% → si chiede «Sono davvero lo stesso prodotto?»
  const famScelta = fam ? famiglie.find(f => f.id === Number(fam)) : null;
  const diverso = !!(famScelta && famScelta.ultimo && famScelta.ultimo.prezzoBase > 0 && x.prezzoBase > 0 && ["kg", "litri"].includes(famScelta.base) && Math.abs(x.prezzoBase / famScelta.ultimo.prezzoBase - 1) > 0.15);
  const vai = async p => { setLavoro(true); await decidi({ tipo: x.tipo, chiave: x.chiave, nota, ...p }); setLavoro(false); };
  const spento = !permesso || lavoro;
  const stessoCentro = famiglie.filter(f => x.centro && f.centri.has(x.centro)), altre = famiglie.filter(f => !(x.centro && f.centri.has(x.centro)));
  const riga = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 };
  return <div style={{ padding: "6px 14px 12px", borderTop: `1px dashed ${C.border}`, fontSize: 13.5 }}>
    {x.tipo === "nome" && <>
      <div style={{ color: C.muted }}>Come è scritto in fattura: {x.esempio || x.titolo} · {x.righe} righe dal {data(x.prima)} al {data(x.ultima)}</div>
      {x.fatture?.length > 0 && <table style={{ ...T.tabella, maxWidth: 760, marginTop: 6 }}><thead><tr><th style={T.thSx}>Data</th><th style={T.thSx}>Fattura</th><th style={T.thSx}>Fornitore</th><th style={T.th}>Quantità</th><th style={T.th}>Totale</th><th style={T.th}>€ al kg o al litro</th></tr></thead>
        <tbody>{x.fatture.map((f, i) => <tr key={i}><td style={T.tdSx}>{data(f.data)}</td><td style={T.tdSx}>{f.numero}</td><td style={T.tdSx}>{f.fornitore}</td><td style={T.td}>{it(f.quantita, 2)} {f.unita}</td><td style={T.td}>{it(f.totale)} €</td><td style={T.td}>{f.prezzoBase ? it(f.prezzoBase, 4) : "—"}</td></tr>)}</tbody></table>}
      <div style={{ fontWeight: 700, marginTop: 8 }}>a) Il nome va bene da solo?</div>
      <div style={riga}><select value={unita} onChange={e => setUnita(e.target.value)} style={{ padding: 5 }}>{UNITA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button style={btn(true)} disabled={spento} onClick={() => vai({ decisione: "va_bene", unita })}>Va bene così, si confronta con sé stesso</button>
        <button style={btn(false, C.muted)} disabled={spento} onClick={() => vai({ decisione: "escluso" })}>Escluso dal confronto</button></div>
      <div style={{ fontWeight: 700, marginTop: 12 }}>b) È lo stesso prodotto di una famiglia che c'è già?</div>
      <div style={riga}><select value={fam} onChange={e => setFam(e.target.value)} style={{ padding: 5, minWidth: 320 }}>
        <option value="">— scegliere la famiglia —</option>
        {stessoCentro.length > 0 && <optgroup label={`Stesso centro di costo (${x.centro})`}>{stessoCentro.map(f => <option key={f.id} value={f.id}>{f.nome}{f.ultimo ? ` – ${it(f.ultimo.prezzo, 2)} ${f.etichetta} il ${data(f.ultimo.data)}` : ""}</option>)}</optgroup>}
        <optgroup label="Altre famiglie">{altre.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</optgroup></select>
        <button style={btn(true)} disabled={spento || !fam || (diverso && !confermo)} onClick={() => vai({ decisione: "stesso", famiglia_id: Number(fam) })}>È lo stesso prodotto</button></div>
      {diverso && <div style={{ background: "#FFF4E0", color: "#8A5A00", padding: 8, borderRadius: 6, marginTop: 6 }}>
        Sono davvero lo stesso prodotto? Il prezzo di questo nome ({it(x.prezzoBase, 4)} € al {famScelta.base === "litri" ? "litro" : "kg"}) e quello della famiglia ({it(famScelta.ultimo.prezzoBase, 4)}) differiscono del {it(Math.abs(x.prezzoBase / famScelta.ultimo.prezzoBase - 1) * 100, 0)}%.
        <label style={{ display: "block", marginTop: 4 }}><input type="checkbox" checked={confermo} onChange={e => setConfermo(e.target.checked)} /> Sì, sono lo stesso prodotto anche con il prezzo diverso</label></div>}
      <div style={{ fontWeight: 700, marginTop: 12 }}>c) Solo se non c'è una famiglia: crearla</div>
      <div style={riga}><input value={nuova.nome} onChange={e => setNuova({ ...nuova, nome: e.target.value })} style={{ padding: 5, minWidth: 280 }} />
        <select value={nuova.unita} onChange={e => setNuova({ ...nuova, unita: e.target.value })} style={{ padding: 5 }}>{UNITA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button style={btn(false)} disabled={spento || !nuova.nome.trim()} onClick={() => vai({ decisione: "crea", nuova_famiglia: nuova, nomi: [x.chiave, ...altriNomi] })}>Crea la famiglia{altriNomi.length ? ` con ${altriNomi.length + 1} nomi` : ""}</button></div>
      {candidati.length > 0 && <div style={{ marginTop: 6 }}><div style={{ color: C.muted }}>Nella famiglia nuova metto anche questi nomi nuovi, se sono lo stesso prodotto scritto in un altro modo:</div>
        {candidati.map(y => <label key={y.chiave} style={{ display: "block", marginTop: 2 }}><input type="checkbox" checked={altriNomi.includes(y.chiave)} onChange={e => setAltriNomi(e.target.checked ? [...altriNomi, y.chiave] : altriNomi.filter(k => k !== y.chiave))} /> {y.titolo} <span style={{ color: C.muted }}>({y.fornitori}{y.prezzoBase ? ` · ${it(y.prezzoBase, 4)} € al kg o al litro` : ""})</span></label>)}</div>}
    </>}
    {x.tipo === "stesso" && <>
      <div>Stesso fornitore ({x.fornitori}) e stesso centro di costo; prezzi a meno del 2% a non più di 60 giorni, mai nella stessa fattura.</div>
      <table style={{ ...T.tabella, maxWidth: 700, marginTop: 6 }}><tbody>{x.nomi.map((n, i) => <tr key={n}><td style={T.tdSx}>{n}</td><td style={T.tdSx}>{x.famiglie[i] ? `famiglia: ${famiglie.find(f => f.id === x.famiglie[i])?.nome || x.famiglie[i]}` : "senza famiglia"}</td><td style={T.td}>{it(x.prezzi[i].prezzo, 4)} € al kg o al litro il {data(x.prezzi[i].data)}</td></tr>)}</tbody></table>
      {(() => { const conFam = x.famiglie.findIndex(f => f != null);
        return <div style={riga}>
          {conFam >= 0 ? <button style={btn(true)} disabled={spento} onClick={() => vai({ decisione: "si", famiglia_id: x.famiglie[conFam], nomi: x.nomi.filter((_, i) => i !== conFam) })}>Sì, uniscili nella famiglia {famiglie.find(f => f.id === x.famiglie[conFam])?.nome}</button>
            : <><input value={nuova.nome} onChange={e => setNuova({ ...nuova, nome: e.target.value })} style={{ padding: 5, minWidth: 240 }} />
              <select value={nuova.unita} onChange={e => setNuova({ ...nuova, unita: e.target.value })} style={{ padding: 5 }}>{UNITA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <button style={btn(true)} disabled={spento || !nuova.nome.trim()} onClick={() => vai({ decisione: "si", nomi: x.nomi, nuova_famiglia: nuova })}>Sì, uniscili in una famiglia nuova</button></>}
          <button style={btn(false, C.muted)} disabled={spento} onClick={() => vai({ decisione: "no" })}>No, sono diversi</button></div>; })()}
    </>}
    {x.tipo === "canone" && <>
      <div>Stessa prestazione, stesso fornitore, una fattura ogni {x.cadenza} giorni circa, importo di solito {it(x.importo)} €. Se è un canone, entra nel controllo prezzi come «€ a fattura» con le stesse soglie; le prestazioni una tantum dello stesso fornitore non contano come aumento.</div>
      <table style={{ ...T.tabella, maxWidth: 500, marginTop: 6 }}><tbody>{x.fatture.map(f => <tr key={f.numero + f.data}><td style={T.tdSx}>{data(f.data)}</td><td style={T.tdSx}>{f.numero}</td><td style={T.td}>{it(f.totale)} €</td></tr>)}</tbody></table>
      <div style={riga}><button style={btn(true)} disabled={spento} onClick={() => vai({ decisione: "si" })}>Sì, è un canone</button><button style={btn(false, C.muted)} disabled={spento} onClick={() => vai({ decisione: "no" })}>No</button></div>
    </>}
    {x.tipo === "muratella" && <>
      <div>Righe pagate da Muratella con il riferimento a una fattura di «{x.titolo}», che non è fra i fornitori del programma ({x.righe} righe, {it(x.spesa)} €). Esempio: {x.esempi?.[0]}</div>
      <div style={riga}><select value={forn} onChange={e => setForn(e.target.value)} style={{ padding: 5, minWidth: 280 }}><option value="">— è uno di questi fornitori —</option>
        {[...fornitori].sort((a, b) => a.nome.localeCompare(b.nome)).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
        <button style={btn(true)} disabled={spento || !forn} onClick={() => vai({ decisione: "fornitore", fornitore_id: Number(forn) })}>È questo fornitore</button>
        <button style={btn(false)} disabled={spento} onClick={() => vai({ decisione: "nome_proprio" })}>Non è nella nostra anagrafica: usa «{x.titolo}»</button></div>
    </>}
    {x.tipo === "confezione" && <>
      <div>{x.motivo}</div>
      <div style={riga}><button style={btn(true)} disabled={spento} onClick={() => vai({ decisione: "sacchi" })}>È in sacchi</button><button style={btn(true)} disabled={spento} onClick={() => vai({ decisione: "sfuso" })}>È sfuso</button></div>
    </>}
    {x.tipo === "unita" && <>
      <div>{x.motivo}</div>
      <div style={{ color: C.muted }}>Se la quantità o l'unità in fattura sono sbagliate, la fattura si corregge nella pagina delle fatture passive; la riga intanto resta fuori dal confronto.</div>
      <div style={riga}><button style={btn(true)} disabled={spento} onClick={() => vai({ decisione: "vista" })}>Riga controllata: resta fuori dal confronto</button></div>
    </>}
    <div style={riga}><input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (facoltativa)" style={{ padding: 5, flex: 1, minWidth: 240 }} /></div>
    {!permesso && <div style={{ color: "#8A5A00", marginTop: 6 }}>Serve il permesso «Può sistemare i prodotti».</div>}
    {void r}
  </div>;
}
