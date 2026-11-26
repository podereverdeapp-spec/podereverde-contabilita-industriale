// Versione 240 — Pagina «Attenzione Variazione Prezzi» (richiesta del Dott. Bizzarri del 9 ottobre 2026).
// Mostra, in ordine di gravità, i prodotti comprati il cui prezzo è cambiato da una fattura all'altra, con il
// grafico del prezzo nel tempo, i consigli e il testo di ricerca da copiare in un'intelligenza artificiale.
// Si ricalcola a ogni apertura. Sola lettura.
// Versione 407 (decisioni del Dott. Bizzarri del 26/11/2026 ore 12:33, 12:49, 13:02, 12:01): prezzo medio pesato degli ultimi
// 12 mesi contro i 12 mesi prima, con accanto l'ultima fattura contro la precedente; nelle famiglie miste una media per nome;
// soglie di ingresso; i prodotti sotto soglia in un elenco a parte.
import { oggiRoma, dataRoma } from "./dateRoma";
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
  const daSistemare = r.daSistemare.length;   // versione 409: lo stesso numero della pagina «Da sistemare» e del menu
  const riquadri = [
    { etichetta: "Rincari: quanto costano in un anno", valore: `${it(r.totaleRincari, 0)} €`, nota: `${r.rincari.length} prodotti più cari: prezzo medio degli ultimi 12 mesi contro i 12 mesi prima, per la quantità degli ultimi 12 mesi (o, se manca uno dei due periodi, l'ultima fattura contro la precedente).`, bollino: r.rincari.some(s => s.gravita === "alta") ? ["b-rosso", "● da guardare subito"] : ["b-arancio", "▲ da tenere d'occhio"] },
    { etichetta: "Opportunità di risparmio", valore: `${it(r.totaleOpportunita, 0)} €`, nota: `${r.opportunita.length} prodotti con un altro fornitore o un prezzo di mercato più basso (stima sull'anno, da verificare).`, bollino: ["b-verde", "● da trattare"] },
    { etichetta: "Ribassi", valore: `${it(-r.totaleRibassi, 0)} €`, nota: `${r.ribassi.length} prodotti più economici, con lo stesso calcolo dei rincari.`, bollino: ["b-verde", "● risparmio"] },
    { etichetta: "Da sistemare", valore: `${daSistemare}`, nota: `Nomi nuovi, possibili doppioni, servizi a canone, sacchi o sfuso, fornitori di Muratella e righe che non tornano: si decidono nella pagina «Da sistemare».${r.senzaConversione.length ? ` In più ${r.senzaConversione.length} righe senza unità convertibile (elenco qui sotto).` : ""}`, bollino: daSistemare ? ["b-rosso", "● da sistemare"] : ["b-verde", "● tutto in ordine"] },
  ];
  return (
    <>
      <Sezione titolo="In sintesi" sottotitolo={`Periodo: ultimi 12 mesi (${data(r.da12)} – ${data(r.oggi)}) contro i 12 mesi prima (${data(r.da24)} – ${data(new Date(new Date(r.da12) - 86400000).toISOString().slice(0, 10))}). Ultima fattura d'acquisto caricata: ${r.ultimaFatturaCaricata ? data(r.ultimaFatturaCaricata) : "nessuna"}. Spesa delle fatture d'acquisto degli ultimi 12 mesi, senza i cespiti: ${it(r.spesaTotale12)} €.`}><Riquadri voci={riquadri} /></Sezione>

      <Sezione titolo="Prezzi aumentati, dal più grande in euro in un anno" sottotitolo={`Entrano i prodotti con una spesa in un anno da ${it(SOGLIE.ingressoSpesa, 0)} €, oppure un aumento da ${it(SOGLIE.ingressoAumento, 0)} € l'anno, oppure una fattura da ${it(SOGLIE.ingressoFattura, 0)} €. Gravità alta: più di ${it(SOGLIE.gravitaAltaEuro, 0)} € l'anno, oppure almeno +${SOGLIE.gravitaAltaPercento}% su un prodotto da oltre ${it(SOGLIE.gravitaAltaSpesa, 0)} € l'anno. Media: più di ${SOGLIE.gravitaMediaEuro} € l'anno. Cliccare su un prodotto per il grafico, i consigli e il testo di ricerca.`}>
        {r.rincari.length ? r.rincari.map(s => <Scheda key={s.chiave} s={s} />) : <p style={{ color: C.muted }}>Nessun prezzo aumentato sopra le soglie.</p>}
      </Sezione>

      <Sezione titolo="Opportunità di risparmio" sottotitolo="Prodotti per cui un altro fornitore o il prezzo di mercato sono più bassi di quanto paghiamo oggi. Stima sulle quantità degli ultimi 12 mesi.">
        {r.opportunita.length ? r.opportunita.map(s => <Scheda key={s.chiave} s={s} opportunita />) : <p style={{ color: C.muted }}>Nessuna opportunità evidente con i dati di oggi.</p>}
      </Sezione>

      <Sezione titolo="Prezzi scesi">
        {r.ribassi.length ? r.ribassi.map(s => <Scheda key={s.chiave} s={s} />) : <p style={{ color: C.muted }}>Nessun prezzo sceso sopra le soglie.</p>}
      </Sezione>

      {/* versione 407: sotto le soglie di ingresso */}
      <Sezione titolo={`Variazioni sotto soglia (${r.sottoSoglia.length})`} sottotitolo={`Prodotti con una variazione di prezzo ma spesa in un anno sotto ${it(SOGLIE.ingressoSpesa, 0)} €, aumento sotto ${it(SOGLIE.ingressoAumento, 0)} € l'anno e nessuna fattura da ${it(SOGLIE.ingressoFattura, 0)} €: non entrano nei rincari né nei ribassi.`}>
        <TabellaAltre l={r.sottoSoglia} annoPrec={r.annoPrec} />
      </Sezione>

      {/* versione 407: comprati negli ultimi 12 mesi e mai nei 12 mesi prima: senza rincaro */}
      <Sezione titolo={`Prodotti nuovi (${r.prodottiNuovi.length})`} sottotitolo={`Comprati negli ultimi 12 mesi e mai nei 12 mesi prima (${data(r.da24)} – ${data(new Date(new Date(r.da12) - 86400000).toISOString().slice(0, 10))}; possono essere stati comprati anni prima). Non c'è una media di prima con cui confrontarli. Quelli che negli ultimi 12 mesi hanno già cambiato prezzo da una fattura all'altra sono fra i rincari o i ribassi, con la scritta «aumento recente».`}>
        <TabellaAltre l={r.prodottiNuovi} annoPrec={r.annoPrec} />
      </Sezione>

      <Sezione titolo={`Tutti gli altri prodotti comprati dal 1° gennaio ${r.annoPrec}`} sottotitolo="Prezzo invariato, oppure una sola fattura.">
        <TabellaAltre l={r.altre} annoPrec={r.annoPrec} />
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
          <p style={{ fontSize: 12.5, color: C.muted }}>Altre {r.nuoveSottoSoglia} descrizioni nuove hanno una spesa più piccola. Si decidono (stesso prodotto di una famiglia, prodotto a sé o escluse) nella pagina{" "}
            {onNavigate ? <a href="#" onClick={e => { e.preventDefault(); onNavigate("da-sistemare-prezzi"); }} style={{ color: C.primary }}>«Da sistemare»</a> : "«Da sistemare»"}.</p>
        </>}
        {!daSistemare && !r.senzaConversione.length && !r.anomale.length && !r.nuove.length && <p style={{ color: C.muted }}>Niente da sistemare.</p>}
      </Sezione>

      {/* Versione 405: ultima fattura più vecchia dell'anno solare precedente → il prodotto non si considera più */}
      <Sezione titolo="Prodotti non più considerati" sottotitolo={`L'ultima fattura è più vecchia del 1° gennaio ${r.annoPrec}: le loro variazioni di prezzo non entrano nei rincari né nei ribassi. Se il prodotto si ricompra, rientra da solo.`}>
        <TabellaAltre l={r.nonPiuComprati} annoPrec={r.annoPrec} />
      </Sezione>

      <p style={{ fontSize: 12, color: C.muted, marginTop: 24 }}>
        Come si calcola: ogni riga di fattura è convertita in € al kg (o al litro) con le regole di conversione del programma o con l'unità scritta in fattura; le righe della stessa fattura e della stessa famiglia si sommano.
        Versione 407: si confronta il prezzo medio pesato sulle quantità degli ultimi 12 mesi con quello dei 12 mesi prima; quanto vale in un anno = differenza delle due medie × quantità degli ultimi 12 mesi. Accanto si vede l'ultima fattura contro la precedente dello stesso fornitore (se c'è, altrimenti la precedente della famiglia): se sull'anno non c'è aumento ma sull'ultima fattura sì, il prodotto entra come «aumento recente» con il calcolo qui sotto. Nelle famiglie miste (Fieno, Mais, Crusca) ogni nome ha la sua media. Le spese di trasporto hanno una scheda per ogni fornitore. Una riga «storno della fattura n. …» toglie dal confronto anche la riga stornata. I prodotti comprati negli ultimi 12 mesi e mai nei 12 mesi prima sono «Prodotti nuovi»: senza media di prima; se fra le loro fatture il prezzo è già cambiato, entrano come «aumento recente». Se negli ultimi 12 mesi non c'è nessun acquisto vale la regola che segue. Quanto vale in un anno = differenza di prezzo × quantità comprata negli ultimi 12 mesi; se negli ultimi 12 mesi ci sono meno di due fatture ma nell'anno precedente almeno due, × quantità dell'anno precedente; se il prodotto si compra una volta l'anno, × quantità di una fattura. Se l'ultima fattura è di oltre 12 mesi fa, il numero è quello dell'anno passato e resta fino all'arrivo della fattura nuova; se è più vecchia del 1° gennaio dell'anno precedente il prodotto non si considera.
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
  const coloreImp = s.impatto > 0 ? SALE : s.impatto < 0 ? SCENDE : C.muted;   // versione 407
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `5px solid ${s.gravita === "alta" ? C.red : s.gravita === "media" ? C.yellow : opportunita ? C.green : C.border}`, borderRadius: 8, marginBottom: 10 }}>
      <div onClick={() => setAperta(!aperta)} style={{ cursor: "pointer", padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: "8px 14px", alignItems: "center" }}>
        <div style={{ minWidth: 0, flex: "2 1 260px" }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>{aperta ? "▾" : "▸"} {s.famiglia.nome}</div>
          <div style={{ fontSize: 12.5, color: C.muted }}>{s.ultimo.fornitore}{s.cambioFornitore ? " · cambio di fornitore" : ""}</div>
          <div style={{ marginTop: 4 }}>{s.gravita && !opportunita && <Bollino tipo={GRAVITA[s.gravita][0]}>{GRAVITA[s.gravita][1]}</Bollino>}</div>
        </div>
        {/* versione 407: media dei 12 mesi prima → ultimi 12 mesi */}
        <div style={{ flex: "1 1 150px" }}><div style={{ fontSize: 11.5, color: C.muted }}>Media 12 mesi prima → ultimi 12 mesi ({U.etichetta})</div>{s.conMedia
          ? <><div style={{ fontSize: 14 }}>{it(s.mediaPrima, dec)} → <b>{it(s.media12, dec)}</b></div><div style={{ fontSize: 14, fontWeight: 700, color: s.variazioneMedia > 0 ? SALE : s.variazioneMedia < 0 ? SCENDE : C.muted }}>{`${s.variazioneMedia > 0 ? "+" : ""}${it(s.variazioneMedia, 1)}%`}</div></>
          : <div style={{ fontSize: 12, color: C.muted }}>{s.prodottoNuovo ? "prodotto nuovo: nessun acquisto nei 12 mesi prima" : "manca uno dei due periodi"}</div>}
          {s.pezzo && s.conMedia && <div style={{ fontSize: 12, color: C.muted }}>a pezzo da {it(s.pezzo.kg, 0)} {s.unita.base}: {it(s.pezzo.prima, 2)} → {it(s.pezzo.ora, 2)} €</div>}
          {s.altraConfezione && <div style={{ fontSize: 12, color: C.muted }}>{s.famiglia.confezione} contro {s.altraConfezione.tipo}: {s.altraConfezione.differenza > 0 ? "+" : ""}{it(s.altraConfezione.differenza, dec)} ({s.altraConfezione.percento != null ? `${s.altraConfezione.percento > 0 ? "+" : ""}${it(s.altraConfezione.percento, 1)}%` : "—"}){s.altraConfezione.suMedia ? " sulle medie degli ultimi 12 mesi" : " sulle ultime fatture"}</div>}
          {s.famiglia.canone && <div style={{ fontSize: 12, color: C.muted }}>servizio a canone: prezzo per fattura</div>}
          {s.cambioFornitoriPeriodo && s.impatto > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: C.yellow }}>aumento forse dovuto al cambio di fornitore: vedere il dettaglio</div>}</div>
        <div style={{ flex: "1 1 130px" }}><div style={{ fontSize: 11.5, color: C.muted }}>Ultima fattura contro la precedente</div><div style={{ fontSize: 14 }}>{s.precedente ? `${it(s.precedente.prezzo, dec)} → ` : ""}<b>{it(s.ultimo.prezzo, dec)}</b></div><div style={{ fontSize: 13, fontWeight: 700, color: coloreVar }}>{var_ === null ? "—" : `${var_ > 0 ? "+" : ""}${it(var_, 1)}%`}<span style={{ fontWeight: 400, color: C.muted, fontSize: 12 }}> · {data(s.ultimo.data)}</span></div>
          {s.aumentoRecente && <div style={{ fontSize: 12, fontWeight: 700, color: SALE }}>aumento recente</div>}
          {s.discordanti && <div style={{ fontSize: 12, fontWeight: 700, color: C.yellow }}>⚠ i due confronti dicono cose opposte: guardare le fatture</div>}</div>
        {opportunita
          ? <div style={{ flex: "1 1 150px" }}><div style={{ fontSize: 11.5, color: C.muted }}>Risparmio possibile in un anno</div><div style={{ fontSize: 15, fontWeight: 700, color: SCENDE }}>{it(Math.max(s.risparmioFornitore, s.risparmioMercato), 0)} €</div><div style={{ fontSize: 12, color: C.muted }}>{s.voci.map(v => v.testo).join("; ")}</div></div>
          : <div style={{ flex: "1 1 120px" }}><div style={{ fontSize: 11.5, color: C.muted }}>Quanto vale in un anno</div><div style={{ fontSize: 15, fontWeight: 700, color: coloreImp }}>{s.impatto > 0 ? "+" : ""}{it(s.impatto, 0)} €</div>{s.annoPassato && s.impatto !== 0 && <div style={{ fontSize: 12, fontWeight: 700, color: C.yellow }}>{s.impatto > 0 ? "incremento" : "ribasso"} dell'anno passato</div>}{!s.annoPassato && s.impatto !== 0 && (s.conMedia && !s.aumentoRecente ? <div style={{ fontSize: 12, color: C.muted }}>sulla media, quantità degli ultimi 12 mesi</div> : !s.piuVolte ? <div style={{ fontSize: 12, color: C.muted }}>su una fattura l'anno</div> : s.n12 < 2 ? <div style={{ fontSize: 12, color: C.muted }}>quantità del {s.annoPrec}</div> : null)}</div>}
        <div style={{ flex: "1 1 120px" }}><div style={{ fontSize: 11.5, color: C.muted }}>Spesa ultimi 12 mesi</div><div style={{ fontSize: 14 }}>{it(s.spesa12, 0)} €</div><div style={{ fontSize: 12, color: C.muted }}>{s.unita.base === "fatture" ? `${s.n12} fatture` : `${it(s.base12, 0)} ${s.unita.base}`}{s.pezzo ? ` (${it(s.pezzo.quantita12, 0)} pezzi)` : ""} · {it(s.incidenza, 1)}% degli acquisti</div></div>
        <div style={{ flex: "1 1 110px" }}><div style={{ fontSize: 11.5, color: C.muted }}>Spesa {s.annoPrec}</div><div style={{ fontSize: 14 }}>{it(s.spesaAnnoPrec, 0)} €</div><div style={{ fontSize: 12, color: C.muted }}>anno intero</div></div>
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
    catch { const t = document.getElementById(`ricerca-${s.chiave}`); if (t) { t.select(); document.execCommand("copy"); setCopiato(true); } }
  }
  return (
    <div style={{ padding: "4px 16px 14px", borderTop: `1px dashed ${C.border}` }}>
      <GraficoPrezzi s={s} />
      {s.conMedia && <div style={{ fontSize: 13, marginTop: 8 }}>{/* versione 407: il conto delle due medie */}
        <b>Il conto delle due medie</b> ({U.etichetta}):{" "}
        12 mesi prima: {it(s.spesaPrima)} € per {U.base === "fatture" ? `${s.n12Prima} fatture` : `${it(s.basePrima, 0)} ${U.base}`} = <b>{it(s.mediaPrima, dec)}</b> ({s.n12Prima} fatture);{" "}
        ultimi 12 mesi: {it(s.spesa12)} € per {U.base === "fatture" ? `${s.n12} fatture` : `${it(s.base12, 0)} ${U.base}`} = <b>{it(s.media12, dec)}</b> ({s.n12} fatture).{" "}
        {!s.aumentoRecente && s.impatto !== 0 && <>In un anno: ({it(s.media12, dec)} − {it(s.mediaPrima, dec)}) × quantità degli ultimi 12 mesi = <b>{it(s.impatto, 0)} €</b>.</>}
        {s.cambioFornitoriPeriodo && <div style={{ color: C.yellow, fontWeight: 600 }}>Fornitori diversi nei due periodi. Media per fornitore, 12 mesi prima → ultimi 12 mesi: {s.medieFornitori.map(f => `${f.nome} ${f.prima !== null ? it(f.prima, dec) : "—"} → ${f.ora !== null ? it(f.ora, dec) : "—"}`).join(" · ")}.</div>}
        {s.fornitori.length > 1 && <div style={{ color: C.muted }}>Prezzo medio per fornitore: {s.fornitori.map(f => `${f.nome} ${it(f.prezzo, dec)} (${f.fatture} fatture)`).join(" · ")}</div>}
      </div>}
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
      <textarea id={`ricerca-${s.chiave}`} readOnly value={s.testoRicerca} style={{ width: "100%", height: 180, fontFamily: "monospace", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, boxSizing: "border-box" }} />
    </div>
  );
}

function GraficoPrezzi({ s }) {
  const [tutto, setTutto] = useState(false);
  const U = s.unita, dec = U.decimali;
  const oggi = oggiRoma();
  const inizio = tutto ? s.fatture[0].data : dataRoma(Date.now() - 3 * 365 * 86400000);
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

function TabellaAltre({ l, annoPrec }) {
  if (!l.length) return <p style={{ color: C.muted }}>Nessun altro prodotto.</p>;
  return (
    <div style={{ overflowX: "auto" }}><table style={T.tabella}>
      <thead><tr><th style={T.thSx}>Famiglia</th><th style={T.thSx}>Fornitore</th><th style={T.th}>Ultima fattura</th><th style={T.th}>Prezzo</th><th style={T.th}>Fattura precedente</th><th style={T.th}>Spesa ultimi 12 mesi</th><th style={T.th}>Spesa {annoPrec}</th></tr></thead>
      <tbody>{l.map(s => (
        <tr key={s.chiave}>
          <td style={T.tdSx}>{s.famiglia.nome}</td><td style={T.tdSx}>{s.ultimo.fornitore}</td><td style={T.td}>{data(s.ultimo.data)}</td>
          <td style={T.td}>{it(s.ultimo.prezzo, s.unita.decimali)} {s.unita.etichetta}</td>
          <td style={T.td}>{s.precedente ? `${it(s.precedente.prezzo, s.unita.decimali)} (${data(s.precedente.data)})` : "—"}{s.variazione ? ` ${s.variazione > 0 ? "+" : ""}${it(s.variazione, 1)}%` : ""}</td>
          <td style={T.td}>{it(s.spesa12, 0)} €</td><td style={T.td}>{it(s.spesaAnnoPrec, 0)} €</td>
        </tr>))}</tbody>
    </table></div>
  );
}
