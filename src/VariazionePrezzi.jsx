// Versione 240 — Pagina «Attenzione Variazione Prezzi» (richiesta del Dott. Bizzarri del 9 ottobre 2026).
// Mostra, in ordine di gravità, i prodotti comprati il cui prezzo è cambiato da una fattura all'altra, con il
// grafico del prezzo nel tempo, i consigli e il testo di ricerca da copiare in un'intelligenza artificiale.
// Si ricalcola a ogni apertura. Sola lettura.
import { useEffect, useMemo, useState } from "react";
import { C, FONT } from "./style";
import { caricaDatiPrezzi, analisiPrezzi, it, data, SOGLIE } from "./calcoloVariazionePrezzi";
import { Intestazione, Sezione, Riquadri, Avvisi, Bollino, SALE, SCENDE, stileTabella as T } from "./ReportAnalisiParti";

const ora = () => new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const COLORI_FORNITORI = ["#2C6E9B", "#C0392B", "#4A7C59", "#D4A017", "#8B6F47", "#B5657A", "#5C7C63"];
const GRAVITA = { alta: ["b-rosso", "● gravità alta"], media: ["b-arancio", "▲ gravità media"], bassa: ["b-verde", "● gravità bassa"] };

export default function VariazionePrezzi({ onNavigate }) {
  const [dati, setDati] = useState(null);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState(null);
  const [calcolatoIl, setCalcolatoIl] = useState(null);

  async function carica() {
    setCaricando(true); setErrore(null);
    try { setDati(await caricaDatiPrezzi()); setCalcolatoIl(ora()); } catch (e) { setErrore(e.message || String(e)); }
    setCaricando(false);
  }
  useEffect(() => { carica(); }, []);
  const r = useMemo(() => { if (!dati) return null; try { return analisiPrezzi(dati); } catch (e) { return { errore: e.message || String(e) }; } }, [dati]);

  return (
    <div style={{ fontFamily: FONT, color: C.text, maxWidth: 1100 }}>
      <Intestazione titolo="⚠️ Attenzione Variazione Prezzi" sottotitolo="I prezzi d'acquisto cambiati da una fattura all'altra, in ordine di gravità, con cause possibili e consigli. Si ricalcola con le fatture caricate fino a oggi."
        aggiorna={carica} calcolatoIl={calcolatoIl} caricando={caricando} />
      {errore && <div style={{ background: "#F8E1DE", color: "#9B2C20", padding: 10, borderRadius: 8, marginTop: 10 }}>{errore}</div>}
      {!dati && !errore && <p style={{ color: C.muted }}>Calcolo in corso…</p>}
      {r && r.errore && <div style={{ background: "#F8E1DE", color: "#9B2C20", padding: 10, borderRadius: 8, marginTop: 10 }}>Errore nel calcolo: {r.errore}</div>}
      {r && !r.errore && <Contenuto r={r} onNavigate={onNavigate} />}
    </div>
  );
}

function Contenuto({ r, onNavigate }) {
  const daSistemare = r.anomale.length + r.senzaConversione.length + r.nuove.length;
  const riquadri = [
    { etichetta: "Rincari: quanto costano in un anno", valore: `${it(r.totaleRincari, 0)} €`, nota: `${r.rincari.length} prodotti con l'ultima fattura più cara della precedente, calcolati sulle quantità comprate negli ultimi 12 mesi.`, bollino: r.rincari.some(s => s.gravita === "alta") ? ["b-rosso", "● da guardare subito"] : ["b-arancio", "▲ da tenere d'occhio"] },
    { etichetta: "Opportunità di risparmio", valore: `${it(r.totaleOpportunita, 0)} €`, nota: `${r.opportunita.length} prodotti con un altro fornitore o un prezzo di mercato più basso (stima sull'anno, da verificare).`, bollino: ["b-verde", "● da trattare"] },
    { etichetta: "Ribassi", valore: `${it(-r.totaleRibassi, 0)} €`, nota: `${r.ribassi.length} prodotti con l'ultima fattura più economica della precedente.`, bollino: ["b-verde", "● risparmio"] },
    { etichetta: "Da sistemare", valore: `${daSistemare}`, nota: "Righe di fattura con prezzi o quantità che non tornano e descrizioni nuove senza famiglia.", bollino: daSistemare ? ["b-rosso", "● da sistemare"] : ["b-verde", "● tutto in ordine"] },
  ];
  return (
    <>
      <Sezione titolo="In sintesi" sottotitolo={`Spesa delle fatture d'acquisto degli ultimi 12 mesi (dal ${data(r.da12)}), senza i cespiti: ${it(r.spesaTotale12)} €.`}><Riquadri voci={riquadri} /></Sezione>

      <Sezione titolo="Prezzi aumentati, in ordine di gravità" sottotitolo={`Gravità alta: più di ${it(SOGLIE.gravitaAltaEuro, 0)} € l'anno, oppure almeno +${SOGLIE.gravitaAltaPercento}% su un prodotto da oltre ${it(SOGLIE.gravitaAltaSpesa, 0)} € l'anno. Media: più di ${SOGLIE.gravitaMediaEuro} € l'anno. Cliccare su un prodotto per il grafico, i consigli e il testo di ricerca.`}>
        {r.rincari.length ? r.rincari.map(s => <Scheda key={s.famiglia.id} s={s} />) : <p style={{ color: C.muted }}>Nessun prezzo aumentato nell'ultima fattura.</p>}
      </Sezione>

      <Sezione titolo="Opportunità di risparmio" sottotitolo="Prodotti per cui un altro fornitore o il prezzo di mercato sono più bassi di quanto paghiamo oggi. Stima sulle quantità degli ultimi 12 mesi.">
        {r.opportunita.length ? r.opportunita.map(s => <Scheda key={s.famiglia.id} s={s} opportunita />) : <p style={{ color: C.muted }}>Nessuna opportunità evidente con i dati di oggi.</p>}
      </Sezione>

      <Sezione titolo="Prezzi scesi">
        {r.ribassi.length ? r.ribassi.map(s => <Scheda key={s.famiglia.id} s={s} />) : <p style={{ color: C.muted }}>Nessun prezzo sceso nell'ultima fattura.</p>}
      </Sezione>

      <Sezione titolo="Tutti gli altri prodotti comprati negli ultimi 24 mesi" sottotitolo="Prezzo invariato tra le ultime due fatture, o una sola fattura, o nessun acquisto negli ultimi 12 mesi.">
        <TabellaAltre l={r.altre} />
      </Sezione>

      <Sezione titolo="Da sistemare prima di fidarsi dei numeri">
        {r.anomale.length > 0 && <>
          <h3 style={{ fontSize: 15, margin: "6px 0" }}>Righe con un prezzo che non torna (escluse dal confronto)</h3>
          <div style={{ overflowX: "auto" }}><table style={T.tabella}>
            <thead><tr><th style={T.thSx}>Famiglia</th><th style={T.thSx}>Fattura</th><th style={T.thSx}>Fornitore</th><th style={T.th}>Quantità</th><th style={T.th}>Totale</th><th style={T.thSx}>Perché</th></tr></thead>
            <tbody>{r.anomale.map((a, i) => <tr key={i}><td style={T.tdSx}>{a.famiglia}</td><td style={T.tdSx}>{a.numero} del {data(a.data)}</td><td style={T.tdSx}>{a.fornitore}</td><td style={T.td}>{it(a.quantita, 3)} {a.unitaFattura}</td><td style={T.td}>{it(a.totale)} €</td><td style={{ ...T.tdSx, whiteSpace: "normal" }}>{a.motivo}</td></tr>)}</tbody>
          </table></div>
        </>}
        {r.senzaConversione.length > 0 && <>
          <h3 style={{ fontSize: 15, margin: "14px 0 6px" }}>Righe senza unità di misura convertibile in kg o litri</h3>
          <div style={{ overflowX: "auto" }}><table style={T.tabella}>
            <thead><tr><th style={T.thSx}>Famiglia</th><th style={T.thSx}>Fattura</th><th style={T.thSx}>Descrizione</th><th style={T.th}>Quantità</th><th style={T.th}>Totale</th></tr></thead>
            <tbody>{r.senzaConversione.map((a, i) => <tr key={i}><td style={T.tdSx}>{a.famiglia}</td><td style={T.tdSx}>{a.numero} del {data(a.data)} · {a.fornitore}</td><td style={{ ...T.tdSx, whiteSpace: "normal" }}>{a.descrizione}</td><td style={T.td}>{it(a.quantita, 3)} {a.unita}</td><td style={T.td}>{it(a.totale)} €</td></tr>)}</tbody>
          </table></div>
          <p style={{ fontSize: 12.5, color: C.muted }}>Si sistemano aggiungendo la regola di conversione nella pagina «Da Armonizzare».</p>
        </>}
        {r.nuove.length > 0 && <>
          <h3 style={{ fontSize: 15, margin: "14px 0 6px" }}>Descrizioni nuove senza famiglia (spesa di almeno {SOGLIE.segnalaNuoveEuro} € negli ultimi 24 mesi)</h3>
          <div style={{ overflowX: "auto" }}><table style={T.tabella}>
            <thead><tr><th style={T.thSx}>Descrizione</th><th style={T.thSx}>Centro di costo</th><th style={T.thSx}>Fornitore</th><th style={T.th}>Spesa</th><th style={T.th}>Ultima fattura</th></tr></thead>
            <tbody>{r.nuove.map((a, i) => <tr key={i}><td style={{ ...T.tdSx, whiteSpace: "normal" }}>{a.descrizione}</td><td style={T.tdSx}>{a.centro}</td><td style={T.tdSx}>{a.fornitori}</td><td style={T.td}>{it(a.spesa)} €</td><td style={T.td}>{data(a.ultima)}</td></tr>)}</tbody>
          </table></div>
          <p style={{ fontSize: 12.5, color: C.muted }}>Altre {r.nuoveSottoSoglia} descrizioni nuove hanno una spesa più piccola. Si assegnano a una famiglia, o si escludono dal confronto, nella pagina{" "}
            {onNavigate ? <a href="#" onClick={e => { e.preventDefault(); onNavigate("famiglie-prodotto"); }} style={{ color: C.primary }}>«Famiglie di Prodotto»</a> : "«Famiglie di Prodotto»"}.</p>
        </>}
        {!daSistemare && <p style={{ color: C.muted }}>Niente da sistemare.</p>}
      </Sezione>

      <p style={{ fontSize: 12, color: C.muted, marginTop: 24 }}>
        Come si calcola: ogni riga di fattura è convertita in € al kg (o al litro) con le regole di conversione del programma o con l'unità scritta in fattura; le righe della stessa fattura e della stessa famiglia si sommano.
        L'ultima fattura si confronta con la precedente dello stesso fornitore (se c'è), altrimenti con la precedente della famiglia. Quanto vale in un anno = differenza di prezzo × quantità comprata negli ultimi 12 mesi.
        Sono escluse le fatture con un prezzo oltre {it(SOGLIE.anomaliaSopra, 1)} volte o sotto {it(SOGLIE.anomaliaSotto, 1)} volte la mediana delle altre fatture della famiglia.
      </p>
    </>
  );
}

function Scheda({ s, opportunita }) {
  const [aperta, setAperta] = useState(false);
  const U = s.unita, dec = U.decimali;
  const var_ = s.variazione;
  const coloreVar = var_ > 0 ? SALE : var_ < 0 ? SCENDE : C.muted;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `5px solid ${s.gravita === "alta" ? C.red : s.gravita === "media" ? C.yellow : opportunita ? C.green : C.border}`, borderRadius: 8, marginBottom: 10 }}>
      <div onClick={() => setAperta(!aperta)} style={{ cursor: "pointer", padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: "8px 14px", alignItems: "center" }}>
        <div style={{ minWidth: 0, flex: "2 1 260px" }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>{aperta ? "▾" : "▸"} {s.famiglia.nome}</div>
          <div style={{ fontSize: 12.5, color: C.muted }}>{s.ultimo.fornitore}{s.cambioFornitore ? " · cambio di fornitore" : ""}</div>
          <div style={{ marginTop: 4 }}>{s.gravita && !opportunita && <Bollino tipo={GRAVITA[s.gravita][0]}>{GRAVITA[s.gravita][1]}</Bollino>}</div>
        </div>
        <div style={{ flex: "1 1 120px" }}><div style={{ fontSize: 11.5, color: C.muted }}>{U.etichetta}</div><div style={{ fontSize: 14 }}>{s.precedente ? `${it(s.precedente.prezzo, dec)} → ` : ""}<b>{it(s.ultimo.prezzo, dec)}</b></div><div style={{ fontSize: 12, color: C.muted }}>{data(s.ultimo.data)}</div></div>
        <div style={{ flex: "1 1 120px" }}><div style={{ fontSize: 11.5, color: C.muted }}>Variazione</div><div style={{ fontSize: 15, fontWeight: 700, color: coloreVar }}>{var_ === null ? "—" : `${var_ > 0 ? "+" : ""}${it(var_, 1)}%`}</div></div>
        {opportunita
          ? <div style={{ flex: "1 1 150px" }}><div style={{ fontSize: 11.5, color: C.muted }}>Risparmio possibile in un anno</div><div style={{ fontSize: 15, fontWeight: 700, color: SCENDE }}>{it(Math.max(s.risparmioFornitore, s.risparmioMercato), 0)} €</div><div style={{ fontSize: 12, color: C.muted }}>{s.voci.map(v => v.testo).join("; ")}</div></div>
          : <div style={{ flex: "1 1 120px" }}><div style={{ fontSize: 11.5, color: C.muted }}>Quanto vale in un anno</div><div style={{ fontSize: 15, fontWeight: 700, color: coloreVar }}>{s.impatto > 0 ? "+" : ""}{it(s.impatto, 0)} €</div></div>}
        <div style={{ flex: "1 1 120px" }}><div style={{ fontSize: 11.5, color: C.muted }}>Spesa ultimi 12 mesi</div><div style={{ fontSize: 14 }}>{it(s.spesa12, 0)} €</div><div style={{ fontSize: 12, color: C.muted }}>{it(s.incidenza, 1)}% degli acquisti</div></div>
      </div>
      {aperta && <Dettaglio s={s} />}
    </div>
  );
}

function Dettaglio({ s }) {
  const [copiato, setCopiato] = useState(false);
  const U = s.unita, dec = U.decimali;
  const ICONE = { problema: ["▲", SALE], consiglio: ["➜", C.blue], buono: ["●", SCENDE] };
  async function copia() {
    try { await navigator.clipboard.writeText(s.testoRicerca); setCopiato(true); setTimeout(() => setCopiato(false), 2500); }
    catch { const t = document.getElementById(`ricerca-${s.famiglia.id}`); if (t) { t.select(); document.execCommand("copy"); setCopiato(true); } }
  }
  return (
    <div style={{ padding: "4px 16px 14px", borderTop: `1px dashed ${C.border}` }}>
      <GraficoPrezzi s={s} />
      <h4 style={{ margin: "12px 0 6px", fontSize: 14 }}>Problemi e consigli</h4>
      <div style={{ display: "grid", gap: 6 }}>
        {s.consigli.map((c, i) => <div key={i} style={{ display: "flex", gap: 8, fontSize: 13.5 }}><span style={{ color: ICONE[c.tipo][1], fontWeight: 700 }}>{ICONE[c.tipo][0]}</span><span>{c.testo}</span></div>)}
      </div>
      <h4 style={{ margin: "14px 0 6px", fontSize: 14 }}>Ultime fatture</h4>
      <div style={{ overflowX: "auto" }}><table style={{ ...T.tabella, maxWidth: 860 }}>
        <thead><tr><th style={T.thSx}>Data</th><th style={T.thSx}>Fattura</th><th style={T.thSx}>Fornitore</th><th style={T.th}>Quantità in fattura</th><th style={T.th}>{U.base === "fatture" ? "Fatture" : U.base === "litri" ? "Litri" : U.base === "pezzi" ? "Pezzi" : "Kg"}</th><th style={T.th}>Totale</th><th style={T.th}>{U.etichetta}</th></tr></thead>
        <tbody>{s.fatture.slice(-10).reverse().map(x => <tr key={x.fatturaId}><td style={T.tdSx}>{data(x.data)}</td><td style={T.tdSx}>{x.numero}</td><td style={T.tdSx}>{x.fornitore}</td><td style={T.td}>{it(x.quantita, 3)} {x.unitaFattura}</td><td style={T.td}>{it(x.base, U.base === "kg" || U.base === "litri" ? 0 : 0)}</td><td style={T.td}>{it(x.totale)} €</td><td style={{ ...T.td, fontWeight: 700 }}>{it(x.prezzo, dec)}</td></tr>)}</tbody>
      </table></div>
      <h4 style={{ margin: "14px 0 6px", fontSize: 14 }}>Testo di ricerca per l'intelligenza artificiale</h4>
      <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 6px" }}>Copiarlo in un'intelligenza artificiale che sa cercare in internet. I dati sono presi dalle fatture; zona di consegna e distanza si cambiano nella pagina Parametri. Le caratteristiche tecniche si scrivono nella famiglia di prodotto.</p>
      <button onClick={copia} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 13, marginBottom: 6 }}>{copiato ? "✓ Copiato" : "📋 Copia il testo di ricerca"}</button>
      <textarea id={`ricerca-${s.famiglia.id}`} readOnly value={s.testoRicerca} style={{ width: "100%", height: 180, fontFamily: "monospace", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, boxSizing: "border-box" }} />
    </div>
  );
}

function GraficoPrezzi({ s }) {
  const [tutto, setTutto] = useState(false);
  const U = s.unita, dec = U.decimali;
  const oggi = new Date().toISOString().slice(0, 10);
  const inizio = tutto ? s.fatture[0].data : new Date(Date.now() - 3 * 365 * 86400000).toISOString().slice(0, 10);
  const punti = s.fatture.filter(x => x.data >= inizio);
  if (!punti.length) return <p style={{ fontSize: 12.5, color: C.muted }}>Nessuna fattura negli ultimi 3 anni. <button onClick={() => setTutto(true)} style={{ fontSize: 12 }}>Mostra tutto lo storico</button></p>;
  const fornitori = [...new Set(s.fatture.map(x => x.fornitore))];
  const col = f => COLORI_FORNITORI[fornitori.indexOf(f) % COLORI_FORNITORI.length];
  const m = s.mercato;
  const mercatoPunti = m ? (m.storia && m.storia.length ? m.storia.filter(p => p.data >= inizio) : [{ data: m.data, prezzo: m.prezzoMin, prezzoMax: m.prezzoMax }]) : [];
  const valori = punti.map(x => x.prezzo).concat(mercatoPunti.flatMap(p => [p.prezzo, p.prezzoMax || p.prezzo]));
  // scala con tacche «tonde» (1, 2, 2,5 o 5 per una potenza di 10)
  const vmin = Math.min(...valori), vmax = Math.max(...valori), grezzo = ((vmax - vmin) || vmax * 0.2 || 1) / 4;
  const pot = Math.pow(10, Math.floor(Math.log10(grezzo))), passo = [1, 2, 2.5, 5, 10].map(k => k * pot).find(k => k >= grezzo);
  const lo = Math.max(0, Math.floor(vmin / passo) * passo - passo), hi = Math.ceil(vmax / passo) * passo + passo;
  const decTacche = Math.max(0, -Math.floor(Math.log10(passo) + 1e-9) + (passo / pot === 2.5 ? 1 : 0));
  const t0 = new Date(inizio).getTime(), t1 = new Date(oggi).getTime();
  const W = 860, H = 260, x0 = 70, x1 = W - 20, y0 = 20, y1 = H - 40;
  const X = d => x0 + (new Date(d).getTime() - t0) / Math.max(1, t1 - t0) * (x1 - x0), Y = v => y1 - (v - lo) / (hi - lo) * (y1 - y0);
  const tacche = []; for (let v = lo; v <= hi + passo / 2; v += passo) tacche.push(v);
  const anni = []; for (let a = new Date(inizio).getFullYear() + 1; a <= new Date(oggi).getFullYear(); a++) anni.push(a);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 560, fontSize: 12, fontFamily: "inherit" }} role="img" aria-label={`Prezzo di ${s.famiglia.nome} nel tempo`}>
          {tacche.map((v, i) => <g key={i}><line x1={x0} x2={x1} y1={Y(v)} y2={Y(v)} stroke={C.border} /><text x={x0 - 6} y={Y(v) + 4} textAnchor="end" fill={C.muted}>{it(v, decTacche)}</text></g>)}
          {anni.map(a => <g key={a}><line x1={X(`${a}-01-01`)} x2={X(`${a}-01-01`)} y1={y0} y2={y1} stroke={C.border} strokeDasharray="2 3" /><text x={X(`${a}-01-01`)} y={y1 + 16} textAnchor="middle" fill={C.muted}>{a}</text></g>)}
          <text x={4} y={12} fill={C.muted}>{U.etichetta}</text>
          {m && m.storia && m.storia.length > 0 && mercatoPunti.map((p, i) => <g key={i}><line x1={Math.max(x0, X(p.data) - 30)} x2={Math.min(x1, X(p.data) + 30)} y1={Y(p.prezzo)} y2={Y(p.prezzo)} stroke={C.text} strokeWidth={2} strokeDasharray="5 3" /><title>{`Mercato ${p.campagna}: ${it(p.prezzo, dec)} ${U.etichetta} (${p.fonte})`}</title></g>)}
          {m && (!m.storia || !m.storia.length) && <g><rect x={x0} width={x1 - x0} y={Y(m.prezzoMax)} height={Math.max(2, Y(m.prezzoMin) - Y(m.prezzoMax))} fill={SCENDE} opacity={0.15} /><text x={x0 + 6} y={Y(m.prezzoMin) + 14} textAnchor="start" fill={SCENDE}>{m.nome}: {it(m.prezzoMin, dec)}–{it(m.prezzoMax, dec)}</text></g>}
          {fornitori.map(f => { const l = punti.filter(x => x.fornitore === f); return l.length > 1 ? <polyline key={f} points={l.map(x => `${X(x.data)},${Y(x.prezzo)}`).join(" ")} fill="none" stroke={col(f)} strokeWidth={1.5} opacity={0.6} /> : null; })}
          {punti.map(x => <circle key={x.fatturaId} cx={X(x.data)} cy={Y(x.prezzo)} r={4} fill={col(x.fornitore)}><title>{`${data(x.data)} · ${x.fornitore} · fattura ${x.numero}: ${it(x.prezzo, dec)} ${U.etichetta}`}</title></circle>)}
        </svg>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: C.muted, alignItems: "center" }}>
        {fornitori.filter(f => punti.some(x => x.fornitore === f)).map(f => <span key={f}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: col(f), marginRight: 4 }} />{f}</span>)}
        {m && m.storia && m.storia.length > 0 && <span>– – prezzo di mercato «{m.nome}» per campagna</span>}
        <button onClick={() => setTutto(!tutto)} style={{ fontSize: 12, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 8px" }}>{tutto ? "Ultimi 3 anni" : "Tutto lo storico"}</button>
      </div>
    </div>
  );
}

function TabellaAltre({ l }) {
  if (!l.length) return <p style={{ color: C.muted }}>Nessun altro prodotto.</p>;
  return (
    <div style={{ overflowX: "auto" }}><table style={T.tabella}>
      <thead><tr><th style={T.thSx}>Famiglia</th><th style={T.thSx}>Fornitore</th><th style={T.th}>Ultima fattura</th><th style={T.th}>Prezzo</th><th style={T.th}>Fattura precedente</th><th style={T.th}>Spesa ultimi 12 mesi</th></tr></thead>
      <tbody>{l.map(s => (
        <tr key={s.famiglia.id}>
          <td style={T.tdSx}>{s.famiglia.nome}</td><td style={T.tdSx}>{s.ultimo.fornitore}</td><td style={T.td}>{data(s.ultimo.data)}</td>
          <td style={T.td}>{it(s.ultimo.prezzo, s.unita.decimali)} {s.unita.etichetta}</td>
          <td style={T.td}>{s.precedente ? `${it(s.precedente.prezzo, s.unita.decimali)} (${data(s.precedente.data)})` : "—"}{s.variazione ? ` ${s.variazione > 0 ? "+" : ""}${it(s.variazione, 1)}%` : ""}</td>
          <td style={T.td}>{it(s.spesa12, 0)} €</td>
        </tr>))}</tbody>
    </table></div>
  );
}
