// Versione 316 — Report di Analisi «Break Even» (cartella «Report di Analisi»), richiesto dal Dott. Bizzarri il 27/10/2026:
// analitico come i report iniziali. Per ogni specie e per l'azienda: il giudizio, l'andamento, perché, le leve in ordine
// di peso, le alternative quando il pareggio non è raggiungibile, quanto sono certi i numeri. Si ricalcola a ogni apertura
// con gli stessi dati e lo stesso motore delle pagine del Break Even (cartella «Analisi Costi»). Sola lettura.
import { useEffect, useMemo } from "react";
import { C } from "./style";
import { useStatoBreakEven, caricaSeServe } from "./statoBreakEven";
import { analisiReport } from "./calcoloReportBreakEven";
import { SPECIE, suiniLottoAnomali } from "./analisiBreakEven";
import { Sezione } from "./ReportAnalisiParti";
import { Avviso, Titolo, riquadro, th, td, sx, bottone, euro, numero, perc, NOMI, COLORE, TESTO_RISULTATO } from "./ComuniBreakEven";

const COLORE_STATO = { raggiunto: C.green, vicino: C.yellow, "fuori portata": C.red, irraggiungibile: C.red };
const ETICHETTA_STATO = { raggiunto: "Pareggio raggiunto", vicino: "Pareggio vicino", "fuori portata": "Pareggio fuori portata", irraggiungibile: "Pareggio irraggiungibile" };
const colRis = v => ((v ?? 0) >= 0 ? C.green : C.red);

export default function ReportBreakEven({ onNavigate }) {
  const s = useStatoBreakEven();
  useEffect(() => { caricaSeServe(); }, []);
  const r = useMemo(() => (s.A ? analisiReport(s.A) : null), [s.A]);
  const vai = id => onNavigate && onNavigate(id);
  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, margin: "0 0 4px" }}>⚖️ Report di Analisi — Break Even</h1>
      <p style={{ color: C.muted, margin: 0, fontSize: 13.5, lineHeight: 1.5, maxWidth: 900 }}>
        Dove siamo rispetto al pareggio, perché, quali leve contano e quanto, e — dove il pareggio non si raggiunge — quali alternative ci sono, con i numeri.
        Si ricalcola a ogni apertura con i dati del momento. Gli strumenti per provare altre ipotesi sono nella cartella «Analisi Costi», sottocartella «Analisi Break Even».
      </p>
      {s.errore && <div style={{ marginTop: 10 }}><Avviso tipo="rosso">⚠️ {s.errore}</Avviso></div>}
      {!r && !s.errore && <p style={{ color: C.muted }}>Calcolo del report (animali, parti, fatture, costi)…</p>}
      {r && <Contenuto r={r} A={s.A} vai={vai} />}
    </div>
  );
}

function Contenuto({ r, A, vai }) {
  const P = r.principale, M = r.corrente;
  return (<>
    <div style={{ ...riquadro, marginTop: 14, fontSize: 13, lineHeight: 1.6 }}>
      <strong>Come si legge.</strong> I numeri principali sono dell'{P.etichetta.toLowerCase()}, il dato certo, nello scenario base prudente (senza i dati da verificare)
      e ai prezzi delle fatture di vendita. Accanto, l'ultimo anno mobile ({M ? M.breve : "—"}) dice come sta andando il lavoro in corso.
      «Risultato con la produzione» = margine di un capo × capi prodotti − costi fissi: non è l'utile del bilancio.
    </div>

    <Sezione titolo="1. Il giudizio" sottotitolo="Per ogni specie: il pareggio con i capi prodotti davvero.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(330px, 100%), 1fr))", gap: 12 }}>
        {SPECIE.map(sp => { const v = r.specie[sp], R = v.x.R; return (
          <div key={sp} style={{ ...riquadro, borderTop: `4px solid ${COLORE_STATO[v.giudizio.stato]}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <strong style={{ color: COLORE[sp], fontSize: 16 }}>{NOMI[sp]}</strong>
              <span style={{ fontWeight: 800, color: COLORE_STATO[v.giudizio.stato], fontSize: 13 }}>{ETICHETTA_STATO[v.giudizio.stato]}</span>
            </div>
            <div style={{ fontSize: 13, margin: "6px 0", lineHeight: 1.5 }}>{v.giudizio.testo}</div>
            <table style={{ fontSize: 12.5, width: "100%" }}><tbody>
              <tr><td style={{ ...td, ...sx }}>Risultato con la produzione ({P.breve})</td><td style={{ ...td, fontWeight: 800, color: colRis(R.risultato) }}>{euro(R.risultato, 0)}</td></tr>
              <tr><td style={{ ...td, ...sx }}>Prezzo che pareggia la produzione</td><td style={td}>{euro(R.prezzoPareggioProduzione)} al kg (oggi {euro(R.prezzo)})</td></tr>
              {v.xm && <tr><td style={{ ...td, ...sx }}>Anno mobile {M.breve}</td><td style={{ ...td, color: colRis(v.xm.R.risultato) }}>{euro(v.xm.R.risultato, 0)} — {ETICHETTA_STATO[v.giudizioCorrente.stato].toLowerCase()}</td></tr>}
            </tbody></table>
          </div>); })}
        <div style={{ ...riquadro, borderTop: `4px solid ${colRis(r.azienda.risultato)}` }}>
          <strong style={{ fontSize: 16 }}>Azienda intera</strong>
          <table style={{ fontSize: 12.5, width: "100%", marginTop: 6 }}><tbody>
            <tr><td style={{ ...td, ...sx }}>Risultato con la produzione</td><td style={{ ...td, fontWeight: 800, color: colRis(r.azienda.risultato) }}>{euro(r.azienda.risultato, 0)}</td></tr>
            <tr><td style={{ ...td, ...sx }}>Costi fissi delle tre specie</td><td style={td}>{euro(r.azienda.fissi, 0)}</td></tr>
            <tr><td style={{ ...td, ...sx }}>Margine di contribuzione totale</td><td style={td}>{euro(r.azienda.margine, 0)}</td></tr>
            <tr><td style={{ ...td, ...sx }}>Fatturato di pareggio con il mix di oggi</td><td style={td}>{r.azienda.fatturatoPareggio === null ? "irraggiungibile" : euro(r.azienda.fatturatoPareggio, 0)} (oggi {euro(r.azienda.ricavi, 0)})</td></tr>
          </tbody></table>
        </div>
      </div>
    </Sezione>

    {SPECIE.map((sp, i) => <SezioneSpecie key={sp} n={i + 2} sp={sp} v={r.specie[sp]} P={P} vai={vai} />)}

    <Sezione titolo="5. L'azienda: chi copre i costi comuni" sottotitolo="Ogni specie paga prima i suoi costi fissi propri; quello che avanza contribuisce ai costi comuni (lavoro, consulenze, assicurazioni, ammortamenti generali).">
      <table style={{ fontSize: 12.5 }}>
        <thead><tr><th style={{ ...th, ...sx }}>Specie</th><th style={th}>Margine di contribuzione con la produzione</th><th style={th}>Costi fissi propri</th><th style={th}>Contributo ai costi comuni</th><th style={th}>Costi comuni ripartiti</th><th style={th}>Risultato con la produzione</th></tr></thead>
        <tbody>{r.comuni.map(c => (
          <tr key={c.specie}><td style={{ ...td, ...sx, fontWeight: 700, color: COLORE[c.specie] }}>{NOMI[c.specie]}</td><td style={{ ...td, color: colRis(c.margine) }}>{euro(c.margine, 0)}</td><td style={td}>{euro(c.propri, 0)}</td>
            <td style={{ ...td, color: colRis(c.contributo), fontWeight: 700 }}>{euro(c.contributo, 0)}</td><td style={td}>{euro(c.comuni, 0)}</td><td style={{ ...td, color: colRis(c.risultato) }}>{euro(c.risultato, 0)}</td></tr>))}
        </tbody>
      </table>
      <p style={{ fontSize: 13, lineHeight: 1.6 }}>{testoComuni(r.comuni)}</p>
    </Sezione>

    <Sezione titolo="6. Il piano dell'analista" sottotitolo="La migliore alternativa di ogni specie messa insieme, a livello di azienda. È una direzione da discutere, non una decisione: ogni voce ha i suoi tempi, il suo capitale e i suoi rischi, scritti nelle sezioni delle specie.">
      <table style={{ fontSize: 12.5 }}>
        <thead><tr><th style={{ ...th, ...sx }}>Specie</th><th style={{ ...th, ...sx }}>Che cosa cambia</th><th style={th}>Risultato oggi</th><th style={th}>Risultato con il piano</th><th style={th}>Differenza</th></tr></thead>
        <tbody>
          {r.piano.voci.map(v => (<tr key={v.specie}><td style={{ ...td, ...sx, fontWeight: 700, color: COLORE[v.specie] }}>{NOMI[v.specie]}</td><td style={{ ...td, ...sx }}>{v.cosa}</td>
            <td style={{ ...td, color: colRis(v.oggi) }}>{euro(v.oggi, 0)}</td><td style={{ ...td, color: colRis(v.piano) }}>{euro(v.piano, 0)}</td><td style={{ ...td, fontWeight: 700 }}>{euro(v.piano - v.oggi, 0)}</td></tr>))}
          <tr style={{ fontWeight: 800 }}><td style={{ ...td, ...sx }} colSpan={2}>Azienda intera</td><td style={{ ...td, color: colRis(r.piano.oggi) }}>{euro(r.piano.oggi, 0)}</td><td style={{ ...td, color: colRis(r.piano.piano) }}>{euro(r.piano.piano, 0)}</td><td style={td}>{euro(r.piano.piano - r.piano.oggi, 0)}</td></tr>
        </tbody>
      </table>
      <div style={{ marginTop: 10 }}><Avviso tipo="blu">ℹ️ Il piano tiene i costi comuni dell'azienda come sono oggi (il lavoro compreso): più capi all'ingrasso possono chiedere più lavoro, e i suini in più chiedono posti all'ingrasso e clienti per la carne (da controllare con la Scheda di rilevazione delle strutture). I prezzi di vendita restano quelli delle fatture. Il piano si rifà da solo quando cambiano i dati; le singole ipotesi si provano nelle pagine «Break Even» e «Nati o comprati».</Avviso></div>
    </Sezione>

    <Sezione titolo="7. Che cosa manca per decidere con certezza" sottotitolo="I dati da verificare e da completare: finché mancano, il report ragiona sullo scenario prudente.">
      <ul style={{ fontSize: 13, lineHeight: 1.7, margin: 0 }}>
        <li><strong>Suini «attivi» troppo vecchi ({suiniLottoAnomali(A).length}):</strong> suinetti dei lotti ancora «attivi» con più di 15 mesi, quasi certamente usciti e non registrati. Nello scenario base contano fino a 15 mesi di età e poi escono senza vendita. Da verificare in stalla (Sborchia).</li>
        <li><strong>Capi macellati senza peso della carcassa:</strong> nello scenario base non contano tra i capi prodotti ({SPECIE.map(sp => `${NOMI[sp].toLowerCase()} ${r.specie[sp].certezza.senzaPeso}`).join(", ")} nell'{P.breve}).</li>
        <li><strong>Ovini:</strong> parti delle pecore non registrati tutti e agnelli senza peso nell'app: capi e chili vengono dalle fatture, i mesi in azienda degli agnelli mancano (il loro mantenimento non è calcolato).</li>
        <li><strong>Nati morti dei suini:</strong> l'app non distingue i nati morti dai morti prima della registrazione nel lotto: il protocollo per gli operatori è stato ordinato.</li>
        <li><strong>Vita economica dei cespiti:</strong> proposta del 27/10/2026 in attesa di decisione (file «Vita_economica_cespiti_v316.xlsx»): gli ammortamenti del 2025 scenderebbero di 9.926 €.</li>
      </ul>
    </Sezione>
    <p style={{ fontSize: 11.5, color: C.muted, marginTop: 18 }}>ℹ️ {TESTO_RISULTATO}</p>
  </>);
}

function testoComuni(comuni) {
  const pos = comuni.filter(c => (c.contributo ?? 0) > 0), neg = comuni.filter(c => (c.contributo ?? 0) <= 0);
  const tot = comuni.reduce((t, c) => t + (c.comuni || 0), 0);
  const netto = comuni.reduce((t, c) => t + (c.contributo || 0), 0);
  return `${pos.length ? `Contribuisce ai costi comuni: ${pos.map(c => `${NOMI[c.specie].toLowerCase()} con ${euro(c.contributo, 0)}`).join(", ")}.` : "Nessuna specie contribuisce ai costi comuni."} `
    + `${neg.length ? `Non coprono nemmeno i propri costi fissi e pesano sulle altre: ${neg.map(c => `${NOMI[c.specie].toLowerCase()} (${euro(c.contributo, 0)})`).join(", ")}. ` : ""}`
    + `I costi comuni sono ${euro(tot, 0)}; il contributo netto delle tre specie è ${euro(netto, 0)}${tot > 0 ? `, cioè il ${perc(Math.max(netto, 0) / tot * 100, 0)} dei costi comuni` : ""}. `
    + (neg.length ? "Chiudere una specie con contributo negativo migliora l'azienda di quel contributo, ma i suoi costi comuni restano e passano sulle altre." : "");
}

function SezioneSpecie({ n, sp, v, P, vai }) {
  const R = v.x.R;
  const serie = v.serie;
  const incerto = z => z.R.prod !== null && z.R.prod < 0;
  return (
    <Sezione titolo={`${n}. ${NOMI[sp]}`} sottotitolo={v.giudizio.testo}>
      <Titolo sotto="Scenario base, ai prezzi delle fatture di ogni periodo. Gli anni mobili sono gli ultimi 12 mesi alla fine di ogni trimestre.">L'andamento</Titolo>
      <table style={{ fontSize: 12.5 }}>
        <thead><tr><th style={{ ...th, ...sx }}>Periodo</th><th style={th}>Prezzo al kg di carcassa</th><th style={th}>Margine di un capo</th><th style={th}>Costi fissi</th><th style={th}>Capi di pareggio</th><th style={th}>Capi prodotti</th><th style={th}>Risultato con la produzione</th><th style={th}>Prezzo che pareggia la produzione</th></tr></thead>
        <tbody>{serie.map(z => (
          <tr key={z.P.id} style={{ background: z.P.id === P.id ? "#EEF5EC" : undefined, color: incerto(z) ? C.muted : undefined }}>
            <td style={{ ...td, ...sx, fontWeight: z.P.id === P.id ? 800 : 400 }}>{z.P.tipo === "anno" ? z.P.breve : `anno mobile ${z.P.breve}`}{incerto(z) ? " (dati incompleti)" : ""}</td>
            <td style={td}>{euro(z.L.prezzo)}</td><td style={{ ...td, color: z.R.margine > 0 ? C.text : C.red }}>{euro(z.R.margine)}</td><td style={td}>{euro(z.R.fissi, 0)}</td>
            <td style={td}>{z.R.capi === null ? "irraggiungibile" : numero(z.R.capi)}</td><td style={td}>{numero(z.R.prod)}</td>
            <td style={{ ...td, color: colRis(z.R.risultato), fontWeight: 700 }}>{euro(z.R.risultato, 0)}</td><td style={td}>{z.R.prod > 0 ? euro(z.R.prezzoPareggioProduzione) : "—"}</td></tr>))}
        </tbody>
      </table>
      {serie.some(incerto) && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>«Dati incompleti»: quasi tutti i capi macellati del periodo sono senza peso della carcassa; nello scenario base non contano e i capi prodotti escono negativi.</div>}

      <div style={{ marginTop: 14 }}><Titolo>Perché</Titolo>
        <ul style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>{v.perche.map((t, i) => <li key={i}>{t}</li>)}
          {sp === "ovino" && !(v.x.L.permanenza > 0) && <li>Il mantenimento degli agnelli non è calcolato perché mancano i mesi in azienda: il costo vero di un agnello è più alto di quello scritto.</li>}
        </ul>
      </div>

      <div style={{ marginTop: 14 }}><Titolo sotto="Una leva per volta, a partire dalla situazione dell'anno; in ordine di quanto spostano il risultato.">Le leve, in ordine di peso</Titolo>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr><th style={{ ...th, ...sx }}>Leva</th><th style={{ ...th, ...sx }}>Indice da controllare</th><th style={th}>Effetto sul risultato all'anno</th><th style={th}>Margine di un capo</th><th style={th}>Capi di pareggio</th></tr></thead>
          <tbody>{v.leve.map(l => (<tr key={l.nome}><td style={{ ...td, ...sx }}>{l.nome}</td><td style={{ ...td, ...sx, color: C.muted }}>{l.indice}</td>
            <td style={{ ...td, color: colRis(l.delta), fontWeight: 700 }}>{l.delta >= 0 ? "+" : ""}{euro(l.delta, 0)}</td><td style={td}>{euro(l.margine)}</td><td style={td}>{l.capi === null ? "irraggiungibile" : numero(l.capi)}</td></tr>))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14 }}><Titolo sotto={v.giudizio.stato === "raggiunto" ? "Il pareggio c'è: le alternative servono ad allargare il margine di sicurezza." : "Il pareggio con la produzione di oggi non c'è: queste sono le strade, con i numeri."}>Le alternative</Titolo>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {v.alternative.map(a => (
            <div key={a.titolo} style={{ ...riquadro, borderLeft: `4px solid ${COLORE[sp]}` }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>{a.titolo}</div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>{a.testo}</div>
              {a.righe.length > 0 && <table style={{ fontSize: 12.5, marginTop: 6 }}>
                <thead><tr><th style={{ ...th, ...sx }}>Ipotesi</th><th style={th}>Capi venduti all'anno</th><th style={th}>Risultato con la produzione</th><th style={th}>Rispetto a oggi</th></tr></thead>
                <tbody>{a.righe.map(([l, capi, ris]) => (<tr key={l}><td style={{ ...td, ...sx }}>{l}</td><td style={td}>{numero(capi)}</td><td style={{ ...td, color: colRis(ris), fontWeight: 700 }}>{euro(ris, 0)}</td><td style={td}>{ris !== null && R.risultato !== null ? `${ris - R.risultato >= 0 ? "+" : ""}${euro(ris - R.risultato, 0)}` : "—"}</td></tr>))}</tbody>
              </table>}
              <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{a.nota}</div>
            </div>))}
          <div style={{ ...riquadro, borderLeft: `4px solid ${C.border}`, fontSize: 13, lineHeight: 1.6 }}>
            <strong>Il prezzo.</strong> Con la produzione di oggi il pareggio chiede {euro(R.prezzoPareggioProduzione)} al kg di carcassa contro {euro(R.prezzo)} delle fatture
            ({R.prezzo > 0 && R.prezzoPareggioProduzione ? `${R.prezzoPareggioProduzione >= R.prezzo ? "+" : ""}${perc((R.prezzoPareggioProduzione / R.prezzo - 1) * 100, 0)}` : "—"}).
            {R.prezzoPareggioProduzione > R.prezzo * 1.5 ? " Nessun prezzo di vendita realistico chiude questo divario: va cambiato il modo di produrre." : R.prezzoPareggioProduzione > R.prezzo ? " Il divario si può chiudere solo in parte con il prezzo (vendita diretta, qualità certificata): il resto va dai costi." : " Il prezzo di oggi basta."}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}><Titolo>Quanto sono certi i numeri</Titolo>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          Con i dati da verificare (scenario «con») il risultato sarebbe {euro(v.certezza.con.risultato, 0)} invece di {euro(v.certezza.base.risultato, 0)}
          ({v.certezza.differenzaRisultato >= 0 ? "+" : ""}{euro(v.certezza.differenzaRisultato, 0)}) e il pareggio {v.certezza.con.capi === null ? "irraggiungibile" : `${numero(v.certezza.con.capi)} capi`}.
          {Math.abs(v.certezza.differenzaRisultato || 0) > Math.abs(v.certezza.base.risultato || 0) * 0.25 ? " La differenza è grande: verificare i dati prima di decidere." : " La differenza non cambia la conclusione."}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {[["break-even", "⚖️ Apri il Break Even"], ["be-nati-comprati", "🐄 Apri Nati o comprati"], ["be-anomalie", "🚩 Apri Anomalie e interventi"], ["be-fotografia-dati", "📋 Apri la Fotografia dei dati"]].map(([id, l]) =>
          <button key={id} onClick={() => vai(id)} style={bottone}>{l}</button>)}
      </div>
    </Sezione>
  );
}
