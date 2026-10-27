// Versione 314 — pagina 4 dell'Analisi Break Even: «Break Even» (analisi preventiva, decisioni del 27/10/2026).
// Logica del costo variabile: capi di pareggio = costi fissi ÷ (ricavo − costo variabile) per capo.
// Due pareggi legati dalla resa: sulla carcassa e sul capo vivo (prezzo al vivo = prezzo della carcassa × resa).
// Il prezzo parte da quello applicato nelle fatture di vendita e si cambia a mano, come tutte le leve.
// Sola lettura: nessuna scrittura nel database.
import { useState } from "react";
import { C } from "./style";
import { SPECIE, calcolaPareggio } from "./analisiBreakEven";
import { FASCE_BOVINI, contaFasceBovini } from "./calcoloBreakEven";
import { calcoloCorrente, impostaLeva, ripristinaLeve, impostaFascia } from "./statoBreakEven";
import { usaPaginaBreakEven, Intestazione, Titolo, Avviso, Dato, Schede, riquadro, th, td, sx, bottone, euro, numero, perc, NOMI, COLORE } from "./ComuniBreakEven";

const testo = (n, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? "" : String(Math.round(n * 10 ** d) / 10 ** d).replace(".", ","));
const NOME_MADRI = { bovino: "vacche", suino: "scrofe", ovino: "pecore" }, NOME_MASCHI = { bovino: "tori", suino: "verri", ovino: "arieti" };

export default function BreakEven({ onNavigate }) {
  const { s, calc } = usaPaginaBreakEven();
  const [scheda, setScheda] = useState("bovino");
  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <Intestazione s={s} onNavigate={onNavigate} titolo="⚖️ Break Even"
        sottotitolo="Analisi preventiva: si scrive un prezzo di vendita e si cambiano le leve; il programma calcola, sui costi del periodo, quanti capi servono per andare in pari, sulla carcassa e sul capo vivo, e quanto la produzione è lontana dal pareggio." />
      {calc && <>
        <Schede attiva={scheda} scegli={setScheda} voci={[...SPECIE.map(sp => [sp, NOMI[sp], COLORE[sp]]), ["azienda", "Azienda intera"]]} />
        {scheda === "azienda" ? <Azienda calc={calc} /> : <Specie s={s} calc={calc} specie={scheda} />}
      </>}
    </div>
  );
}

function Specie({ s, calc, specie }) {
  const x = calc.perSpecie[specie];
  const altro = calcoloCorrente(s, s.scenario === "base" ? "con" : "base").perSpecie[specie];
  const { L, R, T, K, Q, p } = x;
  const val = c => (s.valori[specie][c] !== undefined ? s.valori[specie][c] : testo(p.leve[c], c === "interparto" || c === "permanenza" ? 1 : 2));
  const campi = [
    { k: "prezzo", l: "Prezzo di vendita (€ al kg di carcassa)", nota: p.prezzoInfo.prezzo !== null ? `applicato nelle fatture: ${euro(p.prezzoInfo.prezzo)}` : "nessuna fattura di vendita: scrivetene uno" },
    { k: "pesoCarcassa", l: "Peso della carcassa (kg)", nota: p.leve.pesoCarcassa !== null ? `${p.fontePeso === "fatture" ? "media delle fatture" : "capo tipo"}: ${numero(p.leve.pesoCarcassa, 1)} kg` : "dato mancante" },
    { k: "resa", l: "Resa (%)", nota: K.resa !== null ? `capo tipo: ${numero(K.resa, 2)}%` : "nessun peso vivo registrato: solo pareggio sulla carcassa" },
    { k: "permanenza", l: "Mesi in azienda del capo", nota: K.permanenzaMesi !== null ? `capo tipo: ${numero(K.permanenzaMesi, 1)} mesi` : "dato mancante: scrivetelo (agnello: mesi sotto la madre)" },
    { k: "quotaNati", l: "Capi nati in azienda (%)", nota: p.leve.quotaNati !== null ? `oggi: ${numero(p.leve.quotaNati, 0)}% — il resto è comprato` : "dato mancante" },
    { k: "acquisto", l: "Prezzo d'acquisto di un capo comprato (€)", nota: K.acquistoMedio !== null ? `media dei comprati: ${euro(K.acquistoMedio)}` : "nessun capo comprato nel campione" },
    { k: "interparto", l: "Interparto della mandria (giorni)", nota: `oggi ${numero(T.interpartoImplicito, 0)}; tra due parti della stessa madre: mediana ${numero(T.interpartoMisuratoMediana, 0)}` },
    { k: "natiPerParto", l: "Nati vivi per parto", nota: `oggi ${numero(T.natiPerParto, 2)}` },
    { k: "mortalita", l: "Mortalità dopo la nascita fino alla vendita (%)", nota: `oggi ${perc(T.mortalita * 100)} — i nati morti al parto sono già fuori dai nati vivi` },
    { k: "variazioneVariabili", l: "Variazione dei costi variabili (%)", nota: "es. −10 = alimentazione e altri costi variabili più bassi del 10%" },
    { k: "variazioneFissi", l: "Variazione dei costi fissi (%)", nota: "es. +5 = costi fissi più alti del 5%" },
  ];
  const fasce = specie === "bovino" ? contaFasceBovini(s.A) : null;
  const vivoOk = R.pesoVivo > 0 && R.prezzoVivo > 0;
  const lontano = R.capi !== null && R.prod > 0 && R.capi > R.prod * 3;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {fasce && (
        <div style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>Capo tipo: bovini macellati</strong>
          {FASCE_BOVINI.map(f => (
            <button key={f.id} onClick={() => impostaFascia(f.id)} style={{ ...bottone, background: s.fascia === f.id ? C.primary : "#fff", color: s.fascia === f.id ? "#fff" : C.text }}>
              {f.etichetta} ({fasce[f.id]} capi){f.id === "12-24" ? " — deciso" : ""}</button>))}
        </div>)}

      <div style={riquadro}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <Titolo sotto="I valori di partenza sono quelli reali del periodo; quelli cambiati a mano hanno il bordo blu e valgono in tutte le pagine del Break Even.">Prezzo e leve</Titolo>
          <span style={{ display: "flex", gap: 8 }}>
            <button onClick={() => ripristinaLeve(specie, ["prezzo"])} style={bottone}>Torna al prezzo applicato</button>
            <button onClick={() => ripristinaLeve(specie)} style={bottone}>Ripristina tutti i valori reali</button>
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
          {campi.map(c => (
            <label key={c.k} style={{ fontSize: 12, fontWeight: 700 }}>{c.l}
              <input type="text" inputMode="decimal" value={val(c.k)} onChange={e => impostaLeva(specie, c.k, e.target.value)}
                style={{ display: "block", marginTop: 4, padding: "6px 9px", borderRadius: 6, border: `1.5px solid ${s.valori[specie][c.k] !== undefined ? C.blue : C.border}`, fontSize: 14, fontWeight: 700, width: 130 }} />
              <span style={{ fontWeight: 400, color: C.muted, fontSize: 11 }}>{c.nota}</span>
            </label>))}
        </div>
        {vivoOk && <div style={{ marginTop: 10, fontSize: 13 }}>Prezzo equivalente al vivo: <strong>{euro(R.prezzoVivo)} al kg vivo</strong> ({euro(R.prezzo)} × resa {numero(R.resa, 2)}%).</div>}
      </div>

      <div style={{ ...riquadro, borderColor: COLORE[specie], borderWidth: 2 }}>
        <Titolo>Risultato — {NOMI[specie]}, {calc.P.etichetta.toLowerCase()}, scenario {calc.scenario === "base" ? "base prudente" : "con i dati da verificare"}</Titolo>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, fontSize: 13 }}>
          <Dato l="Ricavo di un capo" v={euro(R.ricavo)} nota={`${numero(R.peso, 1)} kg × ${euro(R.prezzo)}`} />
          <Dato l="Costo variabile di un capo" v={euro(R.costoVariabile)} nota={`nascita o acquisto ${euro(R.partenzaCapo)} + mantenimento ${euro(R.mantenimento)}`} />
          <Dato l="Margine di contribuzione di un capo" v={euro(R.margine)} colore={R.margine > 0 ? C.green : C.red} forte />
          <Dato l="Costi fissi del periodo" v={euro(R.fissi, 0)} nota={`propri ${euro(x.C.fissiPropri, 0)} · comuni ${euro(x.C.fissiComuni, 0)}`} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 14 }}>
          <div style={{ background: C.bg, borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Pareggio sulla carcassa</div>
            {R.capi === null ? <div style={{ color: C.red, fontWeight: 800 }}>Irraggiungibile a {euro(R.prezzo)} al kg: ogni capo costa più di quanto rende.</div> : lontano ? <FuoriPortata R={R} /> : <>
              <Dato l="Capi da vendere nel periodo" v={`${numero(R.capi)} capi`} forte colore={C.primary} />
              <Dato l="Chili di carcassa" v={`${numero(R.kgCarcassa, 0)} kg`} />
              <Dato l="Fatturato di pareggio" v={euro(R.fatturato, 0)} />
            </>}
          </div>
          <div style={{ background: C.bg, borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Pareggio sul capo vivo</div>
            {!vivoOk ? <div style={{ color: C.muted }}>Manca la resa (nessun peso vivo registrato): si guarda solo la carcassa.</div> : R.capi === null ?
              <div style={{ color: C.red, fontWeight: 800 }}>Irraggiungibile a {euro(R.prezzoVivo)} al kg vivo.</div> : lontano ? <FuoriPortata R={R} vivo /> : <>
                <Dato l="Capi da vendere nel periodo" v={`${numero(R.capi)} capi`} forte colore={C.primary} />
                <Dato l="Chili di peso vivo" v={`${numero(R.kgVivo, 0)} kg`} nota={`${numero(R.pesoVivo, 1)} kg vivi a capo a ${euro(R.prezzoVivo)} al kg`} />
                <Dato l="Fatturato di pareggio" v={euro(R.fatturato, 0)} />
              </>}
          </div>
          <div style={{ background: C.bg, borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Rispetto alla produzione del periodo</div>
            <Dato l="Capi prodotti nel periodo" v={numero(R.prod)} nota={`usciti ${numero(Q.capiUsciti)} + stalla ${Q.variazioneStalla >= 0 ? "+" : ""}${numero(Q.variazioneStalla, 1)} capi equivalenti (capi in stalla pesati per l'età: età ÷ età media d'uscita)`} />
            {R.sicurezza !== null && <Dato l="Margine di sicurezza" v={perc(R.sicurezza)} colore={C.green} nota="quanto può calare la produzione prima di andare in perdita" />}
            {R.copertura !== null && <Dato l="La produzione copre solo" v={`${perc(R.copertura)} del pareggio`} colore={C.red} />}
            <Dato l="Risultato con la produzione del periodo" v={euro(R.risultato, 0)} colore={R.risultato >= 0 ? C.green : C.red} />
            {R.leva !== null && <Dato l="Leva operativa" v={numero(R.leva, 2)} nota={`se la produzione cresce dell'1%, il risultato cresce del ${numero(R.leva, 2)}%`} />}
            <Dato l="Prezzo che pareggia la produzione del periodo" v={`${euro(R.prezzoPareggioProduzione)} al kg di carcassa`} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 12, fontSize: 13 }}>
          <Dato l="Pareggio di cassa (senza ammortamenti)" v={R.capiCassa === null ? "irraggiungibile" : R.prod > 0 && R.capiCassa > R.prod * 3 ? `fuori portata (${numero(R.capiCassa)} capi)` : `${numero(R.capiCassa)} capi`} nota={`costi fissi senza ammortamenti: ${euro(R.fissiCassa, 0)}`} />
          <Dato l="Costo variabile di un nato vendibile" v={euro(R.costoPerNato)} nota={`${euro(R.costoMandriaPerMadre, 0)} per madre all'anno ÷ ${numero(R.natiVendibiliPerMadre, 2)} nati vendibili`} />
          {altro && <Dato l={`Scenario ${calc.scenario === "base" ? "con i dati da verificare" : "base prudente"}`} v={altro.R.capi === null ? "irraggiungibile" : `${numero(altro.R.capi)} capi`} nota={`produzione ${numero(altro.R.prod)} · margine per capo ${euro(altro.R.margine)}`} />}
        </div>
        {lontano && <div style={{ marginTop: 10 }}><Avviso tipo="rosso">⚠️ Il pareggio chiede {numero(R.capi)} capi contro {numero(R.prod)} prodotti: a questo prezzo il margine di un capo ({euro(R.margine)}) è troppo piccolo. Il prezzo che pareggia la produzione di oggi è {euro(R.prezzoPareggioProduzione)} al kg.</Avviso></div>}
      </div>

      {R.stalla && !lontano && (
        <div style={riquadro}>
          <Titolo sotto="Capi da tenere per vendere i capi di pareggio: all'ingrasso = capi × mesi in azienda ÷ 12; madri = capi nati ÷ nati vendibili per madre; maschi secondo il rapporto di oggi.">Capi da tenere in stalla per il pareggio</Titolo>
          <table style={{ fontSize: 13, width: "auto" }}>
            <thead><tr><th style={{ ...th, ...sx }}>Categoria</th><th style={th}>Per il pareggio</th><th style={th}>Presenti a fine periodo</th></tr></thead>
            <tbody>
              <tr><td style={{ ...td, ...sx }}>All'ingrasso</td><td style={td}>{numero(R.stalla.ingrasso)}</td><td style={td}>{numero(Q.presentiFine)}</td></tr>
              <tr><td style={{ ...td, ...sx }}>Madri ({NOME_MADRI[specie]})</td><td style={td}>{R.stalla.madri === null ? "—" : numero(R.stalla.madri)}</td><td style={td}>{numero(T.madriMedie, 1)} medie</td></tr>
              <tr><td style={{ ...td, ...sx }}>Maschi riproduttori ({NOME_MASCHI[specie]})</td><td style={td}>{R.stalla.tori === null ? "—" : numero(R.stalla.tori)}</td><td style={td}>{numero(T.toriMedi, 1)} medi</td></tr>
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Se servono più posti di quelli che ci sono, i costi fissi salgono a gradino: si vede nella pagina «Strutture necessarie».</div>
        </div>)}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: 14 }}>
        <div style={riquadro}><Titolo sotto="Ricavi e costi totali al crescere dei capi venduti: dove si incrociano c'è il pareggio.">Diagramma di redditività</Titolo><Diagramma R={R} colore={COLORE[specie]} /></div>
        <div style={riquadro}>
          <Titolo sotto="Le altre leve restano quelle scritte sopra.">Tabella dei prezzi</Titolo>
          <TabellaPrezzi x={x} />
        </div>
      </div>
      <div style={riquadro}><Titolo sotto="Una leva per volta, a partire dalla situazione scritta sopra.">Cosa cambia se…</Titolo><Sensibilita x={x} /></div>
    </div>
  );
}

function FuoriPortata({ R, vivo }) {
  return (<div style={{ fontSize: 13 }}>
    <div style={{ color: C.red, fontWeight: 800 }}>Fuori portata a {euro(vivo ? R.prezzoVivo : R.prezzo)} al kg{vivo ? " vivo" : ""}.</div>
    <div style={{ marginTop: 4 }}>Servirebbero {numero(R.capi)} capi, {numero(R.capi / R.prod, 0)} volte i {numero(R.prod)} prodotti nel periodo: il margine di un capo è troppo piccolo per pagare i costi fissi.</div>
  </div>);
}

function TabellaPrezzi({ x }) {
  const { L, R } = x;
  if (!(R.prezzo > 0)) return <div style={{ color: C.muted }}>Scrivete un prezzo.</div>;
  const passo = R.prezzo >= 5 ? 1 : 0.5;
  const prezzi = [-3, -2, -1, 0, 1, 2, 3, 5, 8].map(k => Math.round((R.prezzo + k * passo) * 100) / 100).filter(v => v > 0);
  return (
    <table style={{ fontSize: 12.5 }}>
      <thead><tr><th style={th}>Prezzo al kg di carcassa</th><th style={th}>Al kg vivo</th><th style={th}>Margine per capo</th><th style={th}>Capi di pareggio</th><th style={th}>Risultato con la produzione</th></tr></thead>
      <tbody>{prezzi.map(v => {
        const y = calcolaPareggio({ L: { ...L, prezzo: v }, C: x.C, T: x.T, K: x.K, Q: x.Q });
        const qui = Math.abs(v - R.prezzo) < 0.005;
        return (<tr key={v} style={{ background: qui ? "#EEF5EC" : undefined, fontWeight: qui ? 800 : 400 }}>
          <td style={td}>{euro(v)}</td><td style={td}>{euro(y.prezzoVivo)}</td><td style={{ ...td, color: y.margine > 0 ? C.text : C.red }}>{euro(y.margine)}</td>
          <td style={td}>{y.capi === null ? "irraggiungibile" : numero(y.capi)}</td><td style={{ ...td, color: (y.risultato ?? 0) >= 0 ? C.green : C.red }}>{euro(y.risultato, 0)}</td></tr>);
      })}</tbody>
    </table>
  );
}

function Sensibilita({ x }) {
  const { L, specie } = x;
  const leve = [
    { v: "Situazione scritta sopra", q: {} },
    { v: "Prezzo più alto di 1 € al kg", q: { prezzo: L.prezzo + 1 } },
    { v: "Costi variabili più bassi del 10%", q: { variazioneVariabili: (L.variazioneVariabili || 0) - 10 } },
    { v: "Costi fissi più bassi del 10%", q: { variazioneFissi: (L.variazioneFissi || 0) - 10 } },
    { v: "Interparto più corto di 30 giorni", q: { interparto: Math.max((L.interparto || 0) - 30, 1) } },
    { v: specie === "suino" ? "Un nato vivo in più per parto" : "Nati vivi per parto +0,1", q: { natiPerParto: (L.natiPerParto || 0) + (specie === "suino" ? 1 : 0.1) } },
    L.mortalita > 0 && { v: "Mortalità dopo la nascita dimezzata", q: { mortalita: L.mortalita / 2 } },
    L.permanenza > 1 && { v: "Un mese in meno in azienda", q: { permanenza: L.permanenza - 1 } },
    L.quotaNati < 100 && { v: "Tutti i capi nati in azienda", q: { quotaNati: 100 } },
    L.acquisto > 0 && { v: "Tutti i capi comprati", q: { quotaNati: 0 } },
  ].filter(Boolean);
  return (
    <table style={{ fontSize: 12.5 }}>
      <thead><tr><th style={{ ...th, ...sx }}>Leva</th><th style={th}>Costo variabile di un capo</th><th style={th}>Margine per capo</th><th style={th}>Capi di pareggio</th><th style={th}>Risultato con la produzione</th></tr></thead>
      <tbody>{leve.map(l => {
        const y = calcolaPareggio({ L: { ...L, ...l.q }, C: x.C, T: x.T, K: x.K, Q: x.Q });
        return (<tr key={l.v}><td style={{ ...td, ...sx }}>{l.v}</td><td style={td}>{euro(y.costoVariabile)}</td><td style={{ ...td, color: y.margine > 0 ? C.text : C.red }}>{euro(y.margine)}</td>
          <td style={td}>{y.capi === null ? "irraggiungibile" : numero(y.capi)}</td><td style={{ ...td, color: (y.risultato ?? 0) >= 0 ? C.green : C.red }}>{euro(y.risultato, 0)}</td></tr>);
      })}</tbody>
    </table>
  );
}

// Diagramma di redditività: ricavi totali, costi totali, costi fissi al crescere dei capi venduti
export function Diagramma({ R, colore }) {
  const W = 620, H = 300, m = { l: 70, r: 20, t: 14, b: 40 };
  const prod = R.prod > 0 ? R.prod : 0;
  const base = Math.max(prod, R.capi && R.capi < prod * 3 ? R.capi : 0, 10);
  const xmax = Math.ceil(base * 1.5);
  const ricavi = q => q * R.ricavo, costi = q => R.fissi + q * R.costoVariabile;
  const ymax = Math.max(ricavi(xmax), costi(xmax), R.fissi) * 1.05 || 1;
  const X = q => m.l + q / xmax * (W - m.l - m.r), Y = v => H - m.b - v / ymax * (H - m.t - m.b);
  const tacche = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(xmax * f));
  const tY = [0, 0.25, 0.5, 0.75, 1].map(f => ymax * f);
  const fmtK = v => (v >= 1000 ? `${Math.round(v / 1000).toLocaleString("it-IT")} mila €` : `${Math.round(v)} €`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", fontFamily: "inherit" }} role="img" aria-label="Diagramma di redditività">
      {tY.map((v, i) => <g key={i}><line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} stroke={C.border} strokeWidth="1" /><text x={m.l - 6} y={Y(v) + 4} fontSize="10.5" textAnchor="end" fill={C.muted}>{fmtK(v)}</text></g>)}
      {tacche.map((q, i) => <text key={i} x={X(q)} y={H - m.b + 16} fontSize="10.5" textAnchor="middle" fill={C.muted}>{q.toLocaleString("it-IT")}</text>)}
      <text x={(W + m.l) / 2} y={H - 6} fontSize="11" textAnchor="middle" fill={C.muted}>capi venduti nel periodo</text>
      <line x1={X(0)} x2={X(xmax)} y1={Y(R.fissi)} y2={Y(R.fissi)} stroke={C.muted} strokeWidth="2" strokeDasharray="6 4" />
      <line x1={X(0)} x2={X(xmax)} y1={Y(costi(0))} y2={Y(costi(xmax))} stroke={C.red} strokeWidth="2" />
      <line x1={X(0)} x2={X(xmax)} y1={Y(0)} y2={Y(ricavi(xmax))} stroke={C.green} strokeWidth="2" />
      <text x={X(xmax) - 4} y={Y(ricavi(xmax)) - 6} fontSize="11" textAnchor="end" fill={C.green} fontWeight="700">ricavi</text>
      <text x={X(xmax) - 4} y={Y(costi(xmax)) + 14} fontSize="11" textAnchor="end" fill={C.red} fontWeight="700">costi totali</text>
      <text x={X(0) + 4} y={Y(R.fissi) - 6} fontSize="11" fill={C.muted} fontWeight="700">costi fissi</text>
      {prod > 0 && <g><line x1={X(prod)} x2={X(prod)} y1={m.t} y2={H - m.b} stroke={colore} strokeWidth="2" strokeDasharray="3 3" /><text x={X(prod) + 4} y={m.t + 10} fontSize="11" fill={colore} fontWeight="700">produzione {prod}</text><title>Capi prodotti nel periodo: {prod}</title></g>}
      {R.capi !== null && R.capi <= xmax && <g><circle cx={X(R.capiEsatti)} cy={Y(ricavi(R.capiEsatti))} r="6" fill={C.primary} stroke="#fff" strokeWidth="2" /><text x={X(R.capiEsatti) - 8} y={Y(ricavi(R.capiEsatti)) - 10} fontSize="11" textAnchor="end" fill={C.primary} fontWeight="800">pareggio {R.capi}</text><title>Pareggio: {R.capi} capi</title></g>}
    </svg>
  );
}

function Azienda({ calc }) {
  const a = calc.azienda;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={riquadro}>
        <Titolo sotto="Con il mix dei capi prodotti nel periodo e i prezzi scritti nelle schede delle specie.">Pareggio dell'azienda intera</Titolo>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, fontSize: 13 }}>
          <Dato l="Costi fissi delle tre specie" v={euro(a.fissi, 0)} />
          <Dato l="Ricavi con la produzione del periodo" v={euro(a.ricavi, 0)} />
          <Dato l="Margine di contribuzione totale" v={euro(a.margine, 0)} colore={a.margine >= 0 ? C.green : C.red} />
          <Dato l="Risultato" v={euro(a.risultato, 0)} colore={a.risultato >= 0 ? C.green : C.red} forte />
          <Dato l="Fatturato di pareggio" v={a.fatturatoPareggio === null ? "irraggiungibile con questo mix" : euro(a.fatturatoPareggio, 0)} forte colore={C.primary} />
          <Dato l={a.sicurezza !== null && a.sicurezza >= 0 ? "Margine di sicurezza" : "Distanza dal pareggio"} v={perc(a.sicurezza)} colore={(a.sicurezza ?? -1) >= 0 ? C.green : C.red} />
          {a.leva !== null && <Dato l="Leva operativa" v={numero(a.leva, 2)} />}
        </div>
      </div>
      <div style={riquadro}>
        <Titolo sotto="Ogni specie deve coprire prima i suoi costi fissi propri; quello che avanza contribuisce ai costi comuni (lavoro, consulenze, assicurazioni, ammortamenti generali).">Chi copre i costi comuni</Titolo>
        <table style={{ fontSize: 13 }}>
          <thead><tr><th style={{ ...th, ...sx }}>Specie</th><th style={th}>Margine di contribuzione con la produzione</th><th style={th}>Costi fissi propri</th><th style={th}>Contributo ai costi comuni</th><th style={th}>Costi comuni ripartiti</th><th style={th}>Risultato</th></tr></thead>
          <tbody>{SPECIE.map(sp => {
            const x = calc.perSpecie[sp]; const mc = x.R.contribuzioneTotale ?? 0; const contributo = mc - x.C.fissiPropri;
            return (<tr key={sp}><td style={{ ...td, ...sx, fontWeight: 700, color: COLORE[sp] }}>{NOMI[sp]}</td><td style={td}>{euro(mc, 0)}</td><td style={td}>{euro(x.C.fissiPropri, 0)}</td>
              <td style={{ ...td, color: contributo >= 0 ? C.green : C.red, fontWeight: 700 }}>{euro(contributo, 0)}</td><td style={td}>{euro(x.C.fissiComuni, 0)}</td><td style={{ ...td, color: (x.R.risultato ?? 0) >= 0 ? C.green : C.red }}>{euro(x.R.risultato, 0)}</td></tr>);
          })}</tbody>
        </table>
      </div>
    </div>
  );
}
