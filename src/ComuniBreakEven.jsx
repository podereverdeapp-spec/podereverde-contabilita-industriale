// Versione 314 — pezzi comuni delle pagine dell'Analisi Break Even (intestazione, barra di periodo e scenario, riquadri).
import { useEffect, useState } from "react";
import { C } from "./style";
import { formattaEuro, formattaNumero } from "./parsingUtils";
import { statoCalcoli, testoAvvisoCalcoli } from "./statoCalcoli";
import { useStatoBreakEven, caricaSeServe, impostaPeriodo, impostaScenario, calcoloCorrente } from "./statoBreakEven";
import { elencoPeriodi, ETICHETTE } from "./analisiBreakEven";

export const COLORE = { bovino: C.bovini, suino: C.suini, ovino: C.ovini };
export const NOMI = ETICHETTE;
const ok = n => n !== null && n !== undefined && Number.isFinite(n);
export const euro = (n, d = 2) => (ok(n) ? formattaEuro(n, d) : "—");
export const numero = (n, d = 0) => (ok(n) ? formattaNumero(n, d) : "—");
export const perc = (n, d = 1) => (ok(n) ? `${formattaNumero(n, d)}%` : "—");
export const data = d => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
export const riquadro = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 };
export const th = { padding: "6px 8px", textAlign: "right", fontSize: 11.5, background: C.bg, borderBottom: `1px solid ${C.border}`, verticalAlign: "bottom" };
export const td = { padding: "6px 8px", textAlign: "right", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
export const sx = { textAlign: "left" };
export const bottone = { background: "#fff", border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontWeight: 700 };

export function Dato({ l, v, forte, colore, nota }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.muted }}>{l}</div>
      <div style={{ fontSize: forte ? 17 : 14.5, fontWeight: 800, color: colore || C.text }}>{v}</div>
      {nota && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{nota}</div>}
    </div>
  );
}
export function Titolo({ children, sotto }) {
  return <div style={{ marginBottom: 8 }}><div style={{ fontWeight: 800, fontSize: 15 }}>{children}</div>{sotto && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{sotto}</div>}</div>;
}
export function Avviso({ children, tipo = "giallo" }) {
  const t = { giallo: ["#FFF8E1", C.yellow], rosso: ["#FDECEA", C.red], blu: ["#EAF2F8", C.blue], verde: ["#EEF5EC", C.green] }[tipo];
  return <div style={{ background: t[0], border: `1px solid ${t[1]}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, lineHeight: 1.5 }}>{children}</div>;
}

// Intestazione + scelta del periodo e dello scenario (uguale in tutte le pagine): restituisce il calcolo corrente
export function usaPaginaBreakEven() {
  const s = useStatoBreakEven();
  useEffect(() => { caricaSeServe(); }, []);
  return { s, calc: calcoloCorrente(s) };
}

export function Intestazione({ titolo, sottotitolo, onNavigate, s }) {
  const [avviso, setAvviso] = useState(null);
  useEffect(() => { statoCalcoli().then(x => setAvviso(testoAvvisoCalcoli(x))).catch(() => {}); }, []);
  const periodi = elencoPeriodi();
  const P = periodi.find(p => p.id === s.periodoId);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ color: C.primary, fontSize: 24, margin: "0 0 4px" }}>{titolo}</h1>
          <p style={{ color: C.muted, margin: 0, fontSize: 13.5, maxWidth: 820, lineHeight: 1.5 }}>{sottotitolo}</p>
        </div>
        {onNavigate && <button onClick={() => onNavigate("istr-break-even")}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>📖 Istruzioni del Break Even</button>}
      </div>
      <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", marginTop: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
        <label style={{ fontWeight: 700 }}>Periodo{" "}
          <select value={s.periodoId || ""} onChange={e => impostaPeriodo(e.target.value)} style={{ padding: "6px 9px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13.5, fontWeight: 700 }}>
            {periodi.map(p => <option key={p.id} value={p.id}>{p.etichetta}</option>)}
          </select>
        </label>
        {P && <span style={{ color: C.muted }}>dal {data(P.da)} al {data(P.a)}{P.tipo === "mobile" ? " — ultimi 12 mesi alla fine del trimestre" : " — dato certo"}</span>}
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <strong>Scenario</strong>
          {[["base", "Base prudente: senza i dati da verificare"], ["con", "Con i dati da verificare"]].map(([k, l]) => (
            <button key={k} onClick={() => impostaScenario(k)} style={{ ...bottone, background: s.scenario === k ? C.primary : "#fff", color: s.scenario === k ? "#fff" : C.text }}>{l}</button>))}
        </span>
      </div>
      {avviso && <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>🔄 Le pagine del Break Even leggono direttamente i dati dell'app e delle fatture: il ricalcolo dei costi chiesto in alto serve solo al campione del capo tipo (costi salvati per capo) e alla quota di rimonta del Report Riproduttori.</div>}
      {s.A && !s.A.eventiLeggibili && <div style={{ marginTop: 8 }}><Avviso tipo="rosso">⚠️ I parti registrati non sono leggibili: accedere al programma con nome e password. Senza i parti madri, nati e interparto non si possono calcolare.</Avviso></div>}
      {s.errore && <div style={{ marginTop: 8 }}><Avviso tipo="rosso">⚠️ {s.errore}</Avviso></div>}
      {!s.A && !s.errore && <p style={{ color: C.muted }}>Caricamento dei dati (animali, parti, fatture, costi)…</p>}
    </div>
  );
}

export function Schede({ voci, attiva, scegli }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "4px 0 14px" }}>
      {voci.map(([k, l, col]) => (
        <button key={k} onClick={() => scegli(k)} style={{ ...bottone, padding: "8px 16px", fontSize: 13.5, background: attiva === k ? (col || C.primary) : "#fff", color: attiva === k ? "#fff" : C.text, borderColor: col || C.border }}>{l}</button>))}
    </div>
  );
}

// Nota sul «Risultato con la produzione» (richiesta del Dott. Bizzarri del 27/10/2026)
export const TESTO_RISULTATO = "Risultato con la produzione = margine di contribuzione di un capo × capi prodotti nel periodo − costi fissi del periodo. Dice quanto si guadagna o si perde con i capi prodotti davvero, al prezzo e con le leve scritte. Non è l'utile del bilancio: usa peso e costo del capo tipo, conta l'aumento della stalla in capi equivalenti al margine pieno e non comprende il valore dei riproduttori riformati, che riduce il costo della rimonta.";
export function NotaRisultato() {
  return <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>ℹ️ {TESTO_RISULTATO}</div>;
}
