// Versione 314 — pagina 8 dell'Analisi Break Even: «Fotografie e controllo».
// L'analista non ripresenta ogni volta la situazione: la fotografa a una data, la conserva e controlla
// l'evoluzione (decisione del 27/10/2026). Si salva la fotografia del periodo e dello scenario scelti, con le leve
// scritte; si confrontano due fotografie: prima gli indici tecnici, poi il risultato economico.
// Scrive solo nella tabella ci_fotografie_break_even (versione 314); le fotografie non si cancellano.
import { useState } from "react";
import { C } from "./style";
import { supabase } from "./supabase";
import { SPECIE, datiFotografia } from "./analisiBreakEven";
import { ricaricaFotografie } from "./statoBreakEven";
import { usaPaginaBreakEven, Intestazione, Titolo, Avviso, riquadro, th, td, sx, bottone, euro, numero, data, NOMI, COLORE } from "./ComuniBreakEven";

export default function FotografieControllo({ onNavigate }) {
  const { s, calc } = usaPaginaBreakEven();
  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <Intestazione s={s} onNavigate={onNavigate} titolo="📸 Fotografie e controllo"
        sottotitolo="Ogni analisi si salva con la sua data e non si cancella. Confrontando due fotografie si vede se gli interventi sono stati fatti (indici tecnici) e se hanno dato risultato (numeri economici)." />
      {calc && <Contenuto s={s} calc={calc} />}
    </div>
  );
}

function Contenuto({ s, calc }) {
  const [etichetta, setEtichetta] = useState("");
  const [nota, setNota] = useState("");
  const [esito, setEsito] = useState(null);
  const [scelte, setScelte] = useState([]);
  const lista = [...(s.A.fotografie || [])].sort((a, b) => (a.creata_il < b.creata_il ? 1 : -1));
  if (!s.A.fotografieDisponibili) return <Avviso tipo="rosso">⚠️ La tabella delle fotografie non c'è ancora: va lanciato il file SQL della versione 314. Le altre pagine del Break Even funzionano lo stesso.</Avviso>;

  const salva = async () => {
    setEsito("Salvataggio…");
    const dati = datiFotografia({ P: calc.P, scenario: calc.scenario, perSpecie: calc.perSpecie, azienda: calc.azienda });
    const { error } = await supabase.from("ci_fotografie_break_even").insert([{
      periodo_da: calc.P.da, periodo_a: calc.P.a, periodo_etichetta: calc.P.etichetta, scenario: calc.scenario,
      etichetta: etichetta.trim() || `Fotografia del ${new Date().toLocaleDateString("it-IT")}`, nota: nota.trim() || null, dati,
    }]);
    if (error) { setEsito(`⚠️ Non salvata: ${error.message}`); return; }
    try { await ricaricaFotografie(); } catch { /* la lista si aggiorna alla prossima apertura */ }
    setEtichetta(""); setNota(""); setEsito("✓ Fotografia salvata.");
  };
  const scegli = id => setScelte(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-2)));
  const confronto = scelte.length === 2 ? scelte.map(id => lista.find(f => f.id === id)).sort((a, b) => (a.creata_il < b.creata_il ? -1 : 1)) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={riquadro}>
        <Titolo sotto={`Si salvano il periodo (${calc.P.etichetta.toLowerCase()}), lo scenario (${calc.scenario === "base" ? "base prudente" : "con i dati da verificare"}), le leve scritte nella pagina Break Even e i risultati di ogni specie.`}>Salva la fotografia di oggi</Titolo>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, fontWeight: 700 }}>Nome<input value={etichetta} onChange={e => setEtichetta(e.target.value)} placeholder={`Fotografia del ${new Date().toLocaleDateString("it-IT")}`} style={{ display: "block", marginTop: 4, padding: "6px 9px", borderRadius: 6, border: `1.5px solid ${C.border}`, width: 280 }} /></label>
          <label style={{ fontSize: 12, fontWeight: 700, flex: 1, minWidth: 260 }}>Nota (che cosa si è deciso, quali interventi)<input value={nota} onChange={e => setNota(e.target.value)} style={{ display: "block", marginTop: 4, padding: "6px 9px", borderRadius: 6, border: `1.5px solid ${C.border}`, width: "100%" }} /></label>
          <button onClick={salva} style={{ ...bottone, background: C.primary, color: "#fff", padding: "8px 16px", fontSize: 13.5 }}>📸 Salva la fotografia</button>
        </div>
        {esito && <div style={{ marginTop: 8, fontSize: 13 }}>{esito}</div>}
      </div>

      <div style={riquadro}>
        <Titolo sotto="Spuntate due fotografie per confrontarle.">Fotografie salvate ({lista.length})</Titolo>
        {lista.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>Nessuna fotografia salvata.</div> : (
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th style={th} /><th style={{ ...th, ...sx }}>Salvata il</th><th style={{ ...th, ...sx }}>Nome</th><th style={{ ...th, ...sx }}>Periodo</th><th style={{ ...th, ...sx }}>Scenario</th>{SPECIE.map(sp => <th key={sp} style={th}>{NOMI[sp]}: capi di pareggio</th>)}<th style={{ ...th, ...sx }}>Nota</th></tr></thead>
            <tbody>{lista.map(f => (
              <tr key={f.id} style={{ background: scelte.includes(f.id) ? "#EEF5EC" : undefined }}>
                <td style={td}><input type="checkbox" checked={scelte.includes(f.id)} onChange={() => scegli(f.id)} /></td>
                <td style={{ ...td, ...sx }}>{new Date(f.creata_il).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</td>
                <td style={{ ...td, ...sx, fontWeight: 700 }}>{f.etichetta}</td><td style={{ ...td, ...sx }}>{f.periodo_etichetta}</td><td style={{ ...td, ...sx }}>{f.scenario === "base" ? "base prudente" : "con i dati da verificare"}</td>
                {SPECIE.map(sp => { const e = f.dati?.specie?.[sp]?.economici; return <td key={sp} style={td}>{e ? (e.capiPareggio === null ? "irraggiungibile" : numero(e.capiPareggio)) : "—"}</td>; })}
                <td style={{ ...td, ...sx }}>{f.nota || ""}</td></tr>))}
            </tbody>
          </table>)}
      </div>

      {confronto && <Confronto a={confronto[0]} b={confronto[1]} />}
    </div>
  );
}

const TECNICI = [["madri", "Madri medie", 1], ["interparto", "Interparto della mandria (giorni)", 0], ["natiPerParto", "Nati vivi per parto", 2], ["natiMortiAlParto", "Nati morti al parto (%)", 1], ["mortalita", "Mortalità dopo la nascita (%)", 1], ["natiVendibiliPerMadre", "Nati vendibili per madre all'anno", 2]];
const ECONOMICI = [["prezzo", "Prezzo al kg di carcassa", 2, "leve", "euro"], ["costoPerNato", "Costo variabile di un nato vendibile", 2, "economici", "euro"], ["costoVariabile", "Costo variabile di un capo", 2, "economici", "euro"], ["margine", "Margine di contribuzione di un capo", 2, "economici", "euro"], ["fissi", "Costi fissi", 0, "economici", "euro"], ["capiPareggio", "Capi di pareggio", 0, "economici"], ["capiProdotti", "Capi prodotti", 0, "economici"], ["sicurezza", "Margine di sicurezza (%)", 1, "economici"], ["risultato", "Risultato", 0, "economici", "euro"]];

function Confronto({ a, b }) {
  const fmt = (v, d, tipo) => (v === null || v === undefined ? "—" : tipo === "euro" ? euro(v, d) : numero(v, d));
  const diff = (x, y) => (Number.isFinite(x) && Number.isFinite(y) ? y - x : null);
  return (
    <div style={riquadro}>
      <Titolo sotto={`Dalla fotografia «${a.etichetta}» (${data(a.creata_il)}) a «${b.etichetta}» (${data(b.creata_il)}). Prima gli indici tecnici: dicono se gli interventi sono stati fatti; poi i numeri economici: dicono se hanno dato risultato.`}>Confronto</Titolo>
      {SPECIE.map(sp => {
        const x = a.dati?.specie?.[sp], y = b.dati?.specie?.[sp]; if (!x || !y) return null;
        return (
          <div key={sp} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 800, color: COLORE[sp], marginBottom: 4 }}>{NOMI[sp]}</div>
            <table style={{ fontSize: 12.5 }}>
              <thead><tr><th style={{ ...th, ...sx }}>Indice</th><th style={th}>Prima</th><th style={th}>Dopo</th><th style={th}>Differenza</th></tr></thead>
              <tbody>
                <tr><td colSpan={4} style={{ ...td, ...sx, fontWeight: 800, background: C.bg }}>Indici tecnici</td></tr>
                {TECNICI.map(([k, l, d]) => <tr key={k}><td style={{ ...td, ...sx }}>{l}</td><td style={td}>{fmt(x.tecnici[k], d)}</td><td style={td}>{fmt(y.tecnici[k], d)}</td><td style={td}>{fmt(diff(x.tecnici[k], y.tecnici[k]), d)}</td></tr>)}
                <tr><td colSpan={4} style={{ ...td, ...sx, fontWeight: 800, background: C.bg }}>Numeri economici</td></tr>
                {ECONOMICI.map(([k, l, d, gruppo, tipo]) => <tr key={k}><td style={{ ...td, ...sx }}>{l}</td><td style={td}>{fmt(x[gruppo][k], d, tipo)}</td><td style={td}>{fmt(y[gruppo][k], d, tipo)}</td><td style={td}>{fmt(diff(x[gruppo][k], y[gruppo][k]), d, tipo)}</td></tr>)}
              </tbody>
            </table>
          </div>);
      })}
    </div>
  );
}
