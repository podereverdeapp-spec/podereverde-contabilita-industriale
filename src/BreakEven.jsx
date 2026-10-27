// Versione 236 — Break Even sulla carcassa e sul capo vivo (decisioni del Dott. Bizzarri del 07/10/2026).
// Serve a SIMULARE: si scrive un prezzo di vendita (anche fuori da ogni tabella) e le leve, il programma
// calcola sui costi reali quanti capi macellare e quanti tenere in stalla per andare in pari.
// Sola lettura: nessuna scrittura nel database.
import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { formattaEuro, formattaNumero } from "./parsingUtils";
import { statoCalcoli, testoAvvisoCalcoli } from "./statoCalcoli";
import { caricaDatiBase, campione, datiMandriaAnno, anniDiRiferimento, capiAnno, pareggio, contaFasceBovini, FASCE_BOVINI, SPECIE, ETICHETTE, ETA_ADULTA_MESI } from "./calcoloBreakEven";

const leggi = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const testoNumero = (n, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? "" : String(Math.round(n * 10 ** d) / 10 ** d).replace(".", ","));
const COLORE = { bovino: C.bovini, suino: C.suini, ovino: C.ovini };
const casella = { padding: "6px 9px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 14, fontWeight: 700, width: 120 };
const riquadro = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 };
const th = { padding: "6px 8px", textAlign: "right", fontSize: 11.5, background: C.bg, borderBottom: `1px solid ${C.border}` };
const td = { padding: "6px 8px", textAlign: "right", borderBottom: `1px solid ${C.border}` };
const euro = (n, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : formattaEuro(n, d));
const numero = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : formattaNumero(n, d));

export default function BreakEven({ base: tipoBase = "carcassa", onNavigate }) {
  const vivo = tipoBase === "vivo";
  const [base, setBase] = useState(null);
  const [errore, setErrore] = useState("");
  const [avviso, setAvviso] = useState(null);
  const [anno, setAnno] = useState(null);
  const [valori, setValori] = useState({ bovino: {}, suino: {}, ovino: {} }); // valori scritti a mano (restano finché non si ripristina)

  useEffect(() => {
    caricaDatiBase().then(b => {
      setBase(b);
      const corrente = new Date().getFullYear();
      setAnno(b.anniCalcolati.includes(corrente - 1) ? corrente - 1 : b.ultimoAnno);
    }).catch(e => setErrore(e.message));
    statoCalcoli().then(s => setAvviso(testoAvvisoCalcoli(s))).catch(() => {});
  }, []);

  const unita = vivo ? "kg vivo" : "kg di carcassa";
  return (
    <div style={{ padding: 20, maxWidth: 1150, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ color: C.primary, fontSize: 24, margin: "0 0 4px" }}>⚖️ Break Even {vivo ? "sul capo vivo" : "sulla carcassa"}</h1>
          <p style={{ color: C.muted, margin: 0, fontSize: 13.5, maxWidth: 800, lineHeight: 1.5 }}>
            Scrivete un prezzo di vendita al {unita} (qualunque valore) e, se volete, cambiate le leve: il programma calcola sui costi reali
            quanti capi bisogna macellare ogni anno e quanti tenerne in stalla per andare in pari. Le spese di macello e di lavorazione non sono comprese.
          </p>
        </div>
        <button onClick={() => onNavigate?.("istr-break-even")}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
          📖 Istruzioni del Break Even
        </button>
      </div>

      {avviso && <div style={{ background: "#FFF3E0", border: "1px solid #F0B44C", borderRadius: 8, padding: "8px 12px", marginTop: 14, fontSize: 13 }}>
        🔄 {avviso} Finché non si ricalcola, i numeri di questa pagina non sono definitivi.</div>}
      {base?.avvisiDati.map((t, i) => <div key={i} style={{ background: "#FFF8E1", border: `1px solid ${C.yellow}`, borderRadius: 8, padding: "8px 12px", marginTop: 8, fontSize: 13 }}>⚠️ {t}</div>)}
      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}
      {!base && !errore && <p style={{ color: C.muted }}>Caricamento dei dati…</p>}

      {base && anno && (
        <>
          <div style={{ margin: "16px 0", fontSize: 13.5, fontWeight: 700 }}>
            Costi dell'anno:{" "}
            <select value={anno} onChange={e => setAnno(parseInt(e.target.value))} style={{ ...casella, width: 110 }}>
              {base.anniCalcolati.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span style={{ fontWeight: 400, color: C.muted, marginLeft: 10 }}>
              Costi fissi e costo variabile per giorno sono quelli di quest'anno; peso, resa e durata del capo tipo vengono da tutti gli anni.
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {SPECIE.map(sp => (
              <SchedaSpecie key={sp} base={base} specie={sp} anno={anno} vivo={vivo}
                valori={valori[sp]} imposta={(campo, v) => setValori(p => ({ ...p, [sp]: { ...p[sp], [campo]: v } }))}
                ripristina={campi => setValori(p => { const n = { ...p[sp] }; (campi || Object.keys(n)).forEach(c => delete n[c]); return { ...p, [sp]: n }; })} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SchedaSpecie({ base, specie, anno, vivo, valori, imposta, ripristina }) {
  const [fascia, setFascia] = useState("12-24");
  const camp = useMemo(() => campione(base, specie, fascia), [base, specie, fascia]);
  const fasce = useMemo(() => (specie === "bovino" ? contaFasceBovini(base) : null), [base, specie]);
  const costi = base.costiAnno(anno, "BE");
  const cs = costi.perSpecie[specie];
  const capi = useMemo(() => capiAnno(base, specie, anno), [base, specie, anno]);
  const anniRif = anniDiRiferimento(anno);
  const mandria = useMemo(() => anniRif.map(a => datiMandriaAnno(base, specie, a)), [base, specie, anno]); // eslint-disable-line
  const mediaValida = l => { const v = l.filter(x => x !== null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

  // Valori di partenza (reali) delle leve
  const prezzoRealeCarcassa = camp.prezzoRealeCarcassa;
  const predefiniti = {
    prezzo: vivo ? (prezzoRealeCarcassa !== null && camp.resa ? prezzoRealeCarcassa * camp.resa / 100 : null) : prezzoRealeCarcassa,
    peso: vivo ? camp.pesoVivo : camp.pesoCarcassa,
    permanenza: camp.permanenzaMesi,
    natiPerMadre: mediaValida(mandria.map(m => m.natiPerMadre)),
    toriPerMadre: mediaValida(mandria.map(m => m.toriPerMadre)),
    quotaNati: camp.quotaNati !== null ? camp.quotaNati * 100 : null,
    variazioneVariabili: 0, variazioneFissi: 0, posti: null,
  };
  const val = campo => (valori[campo] !== undefined ? valori[campo] : testoNumero(predefiniti[campo], campo === "natiPerMadre" || campo === "toriPerMadre" ? 2 : campo === "prezzo" ? 2 : 1));
  const p = Object.fromEntries(Object.keys(predefiniti).map(k => [k, leggi(val(k))]));
  const rif = {
    fissi: cs.fissi, tassoVariabile: cs.tassoVariabile, ubaVita: camp.ubaVita || 0, permanenzaCampione: camp.permanenzaMesi || 0,
    partenza: camp.partenza || 0, capiReali: capi.ingrasso,
  };
  const r = pareggio(p, rif);
  const nessunDato = cs.fissi === 0 && cs.variabili === 0 && capi.macellati === 0 && camp.numero === 0 && capi.presenti === 0;
  if (nessunDato) return null;

  const etichettaPeso = vivo ? "Peso vivo del capo (kg)" : "Peso della carcassa (kg)";
  const etichettaPrezzo = vivo ? "Prezzo di vendita (€ al kg vivo)" : "Prezzo di vendita (€ al kg di carcassa)";
  const campi = [
    { k: "prezzo", l: etichettaPrezzo, nota: predefiniti.prezzo !== null ? `prezzo reale: ${euro(predefiniti.prezzo)}${vivo ? " (equivalente del prezzo reale della carcassa, con la resa)" : ` (media pesata sui chili, ${camp.numeroConPrezzo} capi)`}` : "nessun prezzo reale registrato: scrivetene uno" },
    { k: "peso", l: etichettaPeso, nota: predefiniti.peso !== null ? `media del campione: ${numero(predefiniti.peso, 1)} kg` : "dato mancante: scrivetelo voi" },
    { k: "permanenza", l: "Mesi in azienda del capo", nota: predefiniti.permanenza !== null ? `media del campione: ${numero(predefiniti.permanenza, 1)} mesi` : "dato mancante: scrivetelo voi" },
    { k: "natiPerMadre", l: "Nati vivi per madre all'anno", nota: `media ${anniRif.join(", ")}: ${mandria.map(m => `${m.anno} ${m.natiPerMadre === null ? "—" : numero(m.natiPerMadre, 2)}`).join(" · ")}` },
    { k: "toriPerMadre", l: specie === "suino" ? "Verri per scrofa" : specie === "ovino" ? "Arieti per pecora" : "Tori per vacca", nota: `media ${anniRif.join(", ")}: ${mandria.map(m => `${m.anno} ${m.toriPerMadre === null ? "—" : numero(m.toriPerMadre, 2)}`).join(" · ")}` },
    { k: "quotaNati", l: "Capi nati in azienda (%)", nota: predefiniti.quotaNati !== null ? `nel campione: ${numero(predefiniti.quotaNati, 0)}% (il resto è comprato)` : "dato mancante" },
    { k: "variazioneVariabili", l: "Variazione costi variabili (%)", nota: "es. −10 = alimentazione e altri costi variabili più bassi del 10%" },
    { k: "variazioneFissi", l: "Variazione costi fissi (%)", nota: "es. +5 = costi fissi più alti del 5%" },
    { k: "posti", l: "Posti disponibili in stalla", nota: "facoltativo: avvisa se i capi da tenere li superano" },
  ];

  // Composizione del costo di un chilo, con i capi realmente macellati
  const fattoreDurata = rif.permanenzaCampione > 0 && p.permanenza > 0 ? p.permanenza / rif.permanenzaCampione : 1;
  const composizione = capi.ingrasso > 0 && r.peso > 0 ? [
    { voce: "Acquisto o nascita del capo", variabile: r.partenza, fisso: 0 },
    ...costi.perArea.map(a => ({
      voce: a.area,
      variabile: cs.ubaProduttivi > 0 ? a.perSpecie[specie].variabili / cs.ubaProduttivi * rif.ubaVita * fattoreDurata * (1 + p.variazioneVariabili / 100) : 0,
      fisso: a.perSpecie[specie].fissi * (1 + p.variazioneFissi / 100) / capi.ingrasso,
    })),
  ].filter(x => Math.abs(x.variabile) + Math.abs(x.fisso) > 0.005) : null;

  // Tabella dei prezzi attorno al prezzo scritto
  const passo = r.prezzo >= 5 ? 1 : 0.5;
  const prezzi = r.prezzo > 0 ? [-3, -2, -1, 0, 1, 2, 3].map(k => Math.round((r.prezzo + k * passo) * 100) / 100).filter(x => x > 0) : [];
  const leve = [
    { voce: "Situazione scritta sopra", q: {} },
    { voce: "Costi variabili 10% più bassi", q: { variazioneVariabili: p.variazioneVariabili - 10 } },
    { voce: "Costi fissi 10% più bassi", q: { variazioneFissi: p.variazioneFissi - 10 } },
    { voce: "Un mese in meno in azienda", q: { permanenza: Math.max(p.permanenza - 1, 0.5) } },
    { voce: `${specie === "suino" ? "Un suinetto" : "0,1 nati"} in più per madre all'anno`, q: { natiPerMadre: p.natiPerMadre + (specie === "suino" ? 1 : 0.1) } },
    { voce: `Prezzo di vendita più alto di ${formattaEuro(passo)}`, q: { prezzo: p.prezzo + passo } },
  ];
  const sopraPosti = p.posti > 0 && r.stalla?.totale > p.posti;

  return (
    <div style={{ border: `2px solid ${COLORE[specie]}`, borderRadius: 14, overflow: "hidden", background: C.bg }}>
      <div style={{ background: COLORE[specie], color: "#fff", padding: "10px 16px", fontWeight: 800, fontSize: 17 }}>{ETICHETTE[specie]}</div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

        {fasce && (
          <div style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong>Capo tipo: bovini macellati</strong>
            {FASCE_BOVINI.map(f => (
              <button key={f.id} onClick={() => setFascia(f.id)}
                style={{ ...bottone, background: fascia === f.id ? C.primary : "#fff", color: fascia === f.id ? "#fff" : C.text }}>
                {f.etichetta} ({fasce[f.id]} capi){f.id === "12-24" ? " — deciso" : ""}
              </button>))}
          </div>
        )}
        <RiquadroCampione camp={camp} vivo={vivo} />

        <div style={riquadro}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Costi di allevamento {anno} (senza macello e lavorazioni)</div>
          {!costi.haCalcolo && <div style={{ color: C.red, fontSize: 13, marginBottom: 6 }}>⚠️ Per il {anno} il Report Costi non è salvato: i costi non si possono dividere tra le specie.</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, fontSize: 13 }}>
            <Dato l="Costi fissi dell'anno (con gli ammortamenti)" v={euro(cs.fissi)} />
            <Dato l="Costi variabili dell'anno" v={euro(cs.variabili)} />
            <Dato l="Costo variabile per giorno di presenza pesato" v={euro(cs.tassoVariabile, 4)} />
            <Dato l="Giorni di presenza pesati nella vita del capo tipo" v={numero(rif.ubaVita * fattoreDurata, 1)} />
            <Dato l="Costo di partenza del capo (acquisto o nascita, parte variabile)" v={camp.numeroConCosti ? euro(r.partenza) : "— dato mancante"} />
            <Dato l="Costo variabile di un capo" v={euro(r.costoVariabile)} forte />
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
            {camp.numeroAcquistati > 0 && <>Capi comprati nel campione: {camp.numeroAcquistati}, prezzo medio {euro(camp.acquistoMedio)}. </>}
            {camp.numeroNati > 0 && <>Capi nati in azienda: {camp.numeroNati}, costo di nascita medio {euro(camp.nascitaMediaIntera)}, di cui variabile {euro(camp.nascitaMediaVariabile)}{camp.nascitaSenzaDivisione ? " (divisione non completa: Report Riproduttori da rifare)" : ""}. </>}
            {costi.lavorazioniEscluse > 0 && <>Spese di macello e lavorazione escluse nel {anno} (tutte le specie): {euro(costi.lavorazioniEscluse)}.</>}
          </div>
        </div>

        <div style={riquadro}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontWeight: 800 }}>Prezzo e leve — scrivete qualunque valore</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button onClick={() => ripristina(["prezzo"])} style={bottone}>Torna al prezzo reale</button>
              <button onClick={() => ripristina()} style={bottone}>Ripristina tutti i valori reali</button>
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
            {campi.map(c => (
              <label key={c.k} style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                {c.l}
                <input type="text" inputMode="decimal" value={val(c.k)} onChange={e => imposta(c.k, e.target.value)}
                  style={{ ...casella, display: "block", marginTop: 4, borderColor: valori[c.k] !== undefined ? C.blue : C.border }} />
                <span style={{ fontWeight: 400, color: C.muted, fontSize: 11 }}>{c.nota}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ ...riquadro, borderColor: COLORE[specie] }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Risultato</div>
          {!(r.peso > 0) ? <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Scrivete il peso per vedere il risultato.</p> : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, fontSize: 13 }}>
                <Dato l="Ricavo di un capo" v={euro(r.ricavo)} />
                <Dato l="Costo variabile di un capo" v={euro(r.costoVariabile)} />
                <Dato l="Margine di un capo (ricavo − costo variabile)" v={euro(r.margine)} colore={r.margine > 0 ? C.green : C.red} />
                <Dato l="CAPI DA MACELLARE ALL'ANNO per andare in pari" v={r.capi === null ? "irraggiungibile a questo prezzo" : `${numero(r.capi)} capi`} forte colore={r.capi === null ? C.red : C.primary} />
              </div>
              {r.stalla && (
                <div style={{ marginTop: 12, fontSize: 13, background: C.bg, borderRadius: 8, padding: 10 }}>
                  <strong>Capi da tenere in stalla</strong> per macellarne {numero(r.capi)} all'anno:{" "}
                  {numero(r.stalla.ingrasso)} all'ingrasso (capi all'anno × {numero(r.permanenza, 1)} mesi ÷ 12)
                  {" + "}{r.stalla.madri === null ? "madri: dato mancante (nati per madre)" : `${numero(r.stalla.madri)} madri`}
                  {r.stalla.tori !== null && ` + ${numero(r.stalla.tori)} ${specie === "suino" ? "verri" : specie === "ovino" ? "arieti" : "tori"}`}
                  {r.stalla.totale !== null && <> = <strong>{numero(r.stalla.totale)} capi</strong></>}.
                  <div style={{ color: C.muted, marginTop: 4 }}>
                    Presenti al 31/12/{anno}: {numero(capi.presenti)} capi, di cui {numero(capi.femmineAdulte)} femmine adulte (oltre {ETA_ADULTA_MESI[specie]} mesi), {numero(capi.maschiRiproduttori)} maschi riproduttori, {numero(capi.altri)} altri.
                  </div>
                  {sopraPosti && <div style={{ color: C.red, fontWeight: 700, marginTop: 4 }}>⚠️ Servono più capi dei {numero(p.posti)} posti disponibili: oltre questa soglia i costi fissi salgono (nuove strutture).</div>}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10, fontSize: 13, marginTop: 12 }}>
                <Dato l={`Capi realmente macellati nel ${anno} (senza riproduttori)`} v={numero(capi.ingrasso)} />
                <Dato l={`PREZZO MINIMO al ${vivo ? "kg vivo" : "kg di carcassa"} con i capi reali`} v={euro(r.prezzoMinimo)} forte />
                <Dato l="Margine di sicurezza (capi reali rispetto al pareggio)" v={r.margineSicurezza === null ? "—" : `${numero(r.margineSicurezza, 0)}%`} colore={r.margineSicurezza > 0 ? C.green : C.red} />
                <Dato l="Guadagno o perdita con i capi reali a questo prezzo" v={euro(r.risultatoReale)} colore={r.risultatoReale >= 0 ? C.green : C.red} />
              </div>
            </>
          )}
        </div>

        {composizione && (
          <div style={riquadro}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Di cosa è fatto il costo di un {vivo ? "kg vivo" : "kg di carcassa"} (con i {numero(capi.ingrasso)} capi macellati nel {anno})</div>
            <table style={{ fontSize: 12.5 }}>
              <thead><tr><th style={{ ...th, textAlign: "left" }}>Voce</th><th style={th}>Variabile per capo</th><th style={th}>Fisso per capo</th><th style={th}>Totale per capo</th><th style={th}>Al kg</th><th style={th}>% del costo</th></tr></thead>
              <tbody>
                {composizione.map(x => {
                  const tot = x.variabile + x.fisso, totaleKg = (r.costoVariabile + r.fissi / capi.ingrasso);
                  return (<tr key={x.voce}><td style={{ ...td, textAlign: "left" }}>{x.voce}</td><td style={td}>{euro(x.variabile)}</td><td style={td}>{euro(x.fisso)}</td>
                    <td style={td}>{euro(tot)}</td><td style={{ ...td, fontWeight: 700 }}>{euro(tot / r.peso, 3)}</td><td style={td}>{totaleKg > 0 ? `${numero(tot / totaleKg * 100, 1)}%` : "—"}</td></tr>);
                })}
                <tr style={{ fontWeight: 800 }}><td style={{ ...td, textAlign: "left" }}>Totale = prezzo minimo</td><td style={td}>{euro(r.costoVariabile)}</td><td style={td}>{euro(r.fissi / capi.ingrasso)}</td>
                  <td style={td}>{euro(r.costoVariabile + r.fissi / capi.ingrasso)}</td><td style={td}>{euro(r.prezzoMinimo, 3)}</td><td style={td}>100%</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {r.peso > 0 && prezzi.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 14 }}>
            <div style={riquadro}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Tabella dei prezzi <span style={{ fontWeight: 400, color: C.muted, fontSize: 12 }}>(per altri prezzi scriveteli sopra)</span></div>
              <table style={{ fontSize: 12.5 }}>
                <thead><tr><th style={th}>Prezzo al kg</th><th style={th}>Margine per capo</th><th style={th}>Capi da macellare</th><th style={th}>Capi in stalla</th><th style={th}>Risultato con i capi reali</th></tr></thead>
                <tbody>{prezzi.map(x => {
                  const y = pareggio({ ...p, prezzo: x }, rif);
                  return (<tr key={x} style={{ background: x === Math.round(r.prezzo * 100) / 100 ? "#EEF5EC" : undefined, fontWeight: x === Math.round(r.prezzo * 100) / 100 ? 800 : 400 }}>
                    <td style={td}>{euro(x)}</td><td style={td}>{euro(y.margine)}</td><td style={td}>{y.capi === null ? "irraggiungibile" : numero(y.capi)}</td>
                    <td style={td}>{y.stalla?.totale ?? "—"}</td><td style={{ ...td, color: (y.risultatoReale ?? 0) >= 0 ? C.green : C.red }}>{euro(y.risultatoReale, 0)}</td></tr>);
                })}</tbody>
              </table>
            </div>
            <div style={riquadro}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Le leve: cosa cambia se…</div>
              <table style={{ fontSize: 12.5 }}>
                <thead><tr><th style={{ ...th, textAlign: "left" }}>Leva</th><th style={th}>Capi da macellare</th><th style={th}>Capi in stalla</th><th style={th}>Prezzo minimo</th></tr></thead>
                <tbody>{leve.map(l => {
                  const y = pareggio({ ...p, ...l.q }, rif);
                  return (<tr key={l.voce}><td style={{ ...td, textAlign: "left" }}>{l.voce}</td><td style={td}>{y.capi === null ? "irraggiungibile" : numero(y.capi)}</td>
                    <td style={td}>{y.stalla?.totale ?? "—"}</td><td style={td}>{euro(y.prezzoMinimo, 2)}</td></tr>);
                })}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RiquadroCampione({ camp, vivo }) {
  const [aperto, setAperto] = useState(false);
  const lim = camp.limiti;
  return (
    <div style={{ ...riquadro, background: "#F6F9F4", borderColor: C.primaryLight }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>Come è formato il campione del capo tipo</div>
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>
        Sono {camp.descrizione}; esclusi i riproduttori (anche quelli riconosciuti dai parti registrati). Restano solo i capi con il peso vivo e il peso della carcassa
        {lim ? `, con resa tra il ${lim.min}% e il ${lim.max}%` : " (per questa specie non sono stati decisi limiti di resa)"} e con il codice scritto correttamente.
        <div style={{ marginTop: 6 }}>
          {camp.numero > 0 ? <>
            <strong>Capi nel campione: {camp.numero}</strong> · peso vivo medio {numero(camp.pesoVivo, 1)} kg · peso della carcassa medio {numero(camp.pesoCarcassa, 1)} kg ·
            resa pesata sui chili <strong>{numero(camp.resa, 1)}%</strong> · {numero(camp.permanenzaMesi, 1)} mesi in azienda
            {camp.senzaCosti > 0 && <> · {camp.senzaCosti} capi senza costi salvati (esclusi dal costo medio)</>}
          </> : <span style={{ color: C.red, fontWeight: 700 }}>Nessun capo con i dati completi: peso, resa e costo di partenza sono «dato mancante», scriveteli a mano per simulare.</span>}
        </div>
        <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
          {vivo ? "Il peso di riferimento è il peso vivo medio." : "Il peso di riferimento è il peso medio della carcassa."} I valori si aggiornano da soli ogni volta che nell'app si inseriscono nuovi pesi.
        </div>
      </div>
      {(camp.esclusi.length > 0 || camp.senzaPeso.length > 0) && (
        <div style={{ marginTop: 8, background: "#FFF6E5", border: "1px solid #F0B44C", borderRadius: 8, padding: "8px 10px", fontSize: 12.5 }}>
          ⚠️ <strong>Capi esclusi perché anomali (da verificare): {camp.esclusi.length}</strong>
          {camp.senzaPeso.length > 0 && <> · <strong>esclusi perché manca un peso: {camp.senzaPeso.length}</strong></>}
          {" "}<button onClick={() => setAperto(!aperto)} style={{ ...bottone, padding: "2px 8px", fontSize: 11.5 }}>{aperto ? "nascondi l'elenco" : "mostra l'elenco"}</button>
          {aperto && (
            <table style={{ fontSize: 12, marginTop: 6, background: "#fff" }}>
              <thead><tr>{["Codice", "Scheda", "Uscita", "Peso vivo", "Peso carcassa", "Resa", "Motivo"].map(h => <th key={h} style={{ ...th, textAlign: "left" }}>{h}</th>)}</tr></thead>
              <tbody>{[...camp.esclusi, ...camp.senzaPeso].map(s => (
                <tr key={s.chiave}><td style={{ ...td, textAlign: "left" }}>{s.codice}</td><td style={{ ...td, textAlign: "left" }}>{s.tipo === "animale" ? `animale ${s.id}` : "suinetto di lotto"}</td>
                  <td style={{ ...td, textAlign: "left" }}>{s.uscita ? s.uscita.split("-").reverse().join("/") : "—"}</td>
                  <td style={td}>{s.pesoVivo > 0 ? `${numero(s.pesoVivo, 1)} kg` : "—"}</td><td style={td}>{s.pesoCarcassa > 0 ? `${numero(s.pesoCarcassa, 1)} kg` : "—"}</td>
                  <td style={td}>{s.resa === null ? "—" : `${numero(s.resa, 1)}%`}</td><td style={{ ...td, textAlign: "left" }}>{s.motivo}</td></tr>))}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

const bottone = { background: "#fff", border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontWeight: 700 };
function Dato({ l, v, forte, colore }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.muted }}>{l}</div>
      <div style={{ fontSize: forte ? 17 : 14.5, fontWeight: 800, color: colore || C.text }}>{v}</div>
    </div>
  );
}
