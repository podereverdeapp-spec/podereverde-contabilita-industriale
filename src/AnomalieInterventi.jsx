// Versione 314 — pagina 7 dell'Analisi Break Even: «Anomalie e interventi».
// I problemi che spostano il pareggio, con il loro costo e l'effetto misurabile degli interventi:
// mortalità (con le cause registrate), madri improduttive, schede da correggere, dati da verificare con Sborchia.
// Regole del 27/10/2026: i nati morti sono un problema da risolvere che l'analista evidenzia a parte; madre improduttiva
// dopo due interparti senza parto; bovina mai partorita oltre 36 mesi = scottona. Sola lettura.
import { C } from "./style";
import { SPECIE, anomalie, calcolaPareggio, costoAnnuoCapo, leggiNumero, SOGLIA_MADRE_MESI } from "./analisiBreakEven";
import { impostaStruttura } from "./statoBreakEven";
import { usaPaginaBreakEven, Intestazione, Titolo, Avviso, riquadro, th, td, sx, euro, numero, perc, data, NOMI, COLORE } from "./ComuniBreakEven";

export default function AnomalieInterventi({ onNavigate }) {
  const { s, calc } = usaPaginaBreakEven();
  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <Intestazione s={s} onNavigate={onNavigate} titolo="🚩 Anomalie e interventi"
        sottotitolo="I problemi che spostano il pareggio, con quanto costano e quanto rende risolverli. Le cifre si leggono sul periodo e con i prezzi scritti nella pagina Break Even." />
      {calc && <Contenuto s={s} calc={calc} />}
    </div>
  );
}

function Contenuto({ s, calc }) {
  const an = anomalie(s.A, calc.P, calc.scenario);
  const mortalita = SPECIE.map(sp => {
    const x = calc.perSpecie[sp], t = an.mortalita[sp];
    const percAttuale = t.percAlParto !== null ? t.percAlParto * 100 : null;
    const k = `obiettivoMortalita_${sp}`;
    const obiettivo = leggiNumero(s.strutture[k]) ?? (percAttuale !== null ? Math.round(percAttuale / 2 * 10) / 10 : null);
    let effetto = null;
    if (percAttuale !== null && obiettivo !== null && x.T.partiP > 0 && x.L.natiPerParto > 0 && !x.T.notaOvini) {
      const totaliPerParto = (x.T.viviP + x.T.mortiP) / x.T.partiP;
      const viviObiettivo = totaliPerParto * (1 - obiettivo / 100);
      const y = calcolaPareggio({ L: { ...x.L, natiPerParto: viviObiettivo }, C: x.C, T: x.T, K: x.K, Q: x.Q });
      effetto = { viviObiettivo, costoPerNato: y.costoPerNato, capi: y.capi, risultato: y.risultato, delta: y.risultato !== null && x.R.risultato !== null ? y.risultato - x.R.risultato : null };
    }
    return { sp, x, t, percAttuale, k, obiettivo, effetto };
  });
  const improduttive = an.madriImproduttive.map(m => ({ ...m, costo: costoAnnuoCapo(s.A, calc.P, calc.scenario, m.specie, m.id) }));
  const scottone = an.scottoneSegnateMadri.map(m => ({ ...m, costo: costoAnnuoCapo(s.A, calc.P, calc.scenario, m.specie, m.id) }));
  const somma = l => l.reduce((t, x) => t + (x.costo || 0), 0);
  const interparto = SPECIE.map(sp => {
    const x = calc.perSpecie[sp];
    if (!(x.L.interparto > 30)) return null;
    const y = calcolaPareggio({ L: { ...x.L, interparto: x.L.interparto - 30 }, C: x.C, T: x.T, K: x.K, Q: x.Q });
    return { sp, prima: x.L.interparto, dopo: x.L.interparto - 30, costoPrima: x.R.costoPerNato, costoDopo: y.costoPerNato, delta: y.risultato !== null && x.R.risultato !== null ? y.risultato - x.R.risultato : null };
  }).filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={riquadro}>
        <Titolo sotto="Nati morti al parto = parte dei nati totali registrati come morti al parto. Il costo della madre si divide sui nati vivi: ogni nato morto rende più caro ogni vivo. Obiettivo: si scrive, la partenza è la metà di oggi.">1. Mortalità</Titolo>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr><th style={{ ...th, ...sx }}>Specie</th><th style={th}>Nati vivi</th><th style={th}>Nati morti al parto</th><th style={th}>Morti dopo la nascita</th><th style={th}>Obiettivo nati morti (%)</th><th style={th}>Costo di un nato oggi</th><th style={th}>Costo di un nato all'obiettivo</th><th style={th}>Risultato in più all'obiettivo</th></tr></thead>
          <tbody>{mortalita.map(({ sp, t, percAttuale, k, obiettivo, effetto, x }) => (
            <tr key={sp}><td style={{ ...td, ...sx, fontWeight: 700, color: COLORE[sp] }}>{NOMI[sp]}</td><td style={td}>{numero(t.vivi)}</td>
              <td style={{ ...td, color: percAttuale > 20 ? C.red : C.text, fontWeight: 700 }}>{numero(t.nonViviAlParto)} ({perc(percAttuale)})</td><td style={td}>{numero(t.mortiDopo)}</td>
              <td style={td}><input type="text" inputMode="decimal" value={s.strutture[k] !== undefined ? s.strutture[k] : (obiettivo === null ? "" : String(obiettivo).replace(".", ","))} onChange={e => impostaStruttura(k, e.target.value)}
                style={{ width: 70, padding: "4px 6px", borderRadius: 6, border: `1.5px solid ${s.strutture[k] !== undefined ? C.blue : C.border}`, fontWeight: 700, textAlign: "right" }} /></td>
              <td style={td}>{euro(x.R.costoPerNato)}</td><td style={td}>{euro(effetto?.costoPerNato)}</td>
              <td style={{ ...td, fontWeight: 700, color: (effetto?.delta ?? 0) >= 0 ? C.green : C.red }}>{euro(effetto?.delta, 0)}</td></tr>))}
          </tbody>
        </table>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10 }}>
          {SPECIE.map(sp => (
            <div key={sp} style={{ fontSize: 12.5 }}><strong style={{ color: COLORE[sp] }}>Cause di morte registrate — {NOMI[sp]}:</strong>{" "}
              {an.causeMorte[sp].length ? an.causeMorte[sp].map(c => `${c.causa} ${c.n}`).join(" · ") : "nessuna morte registrata nel periodo"}</div>))}
        </div>
        <div style={{ marginTop: 8 }}><Avviso>La causa di morte si chiede dall'ottobre 2026 (suinetti dei lotti: obbligatoria dalla versione 136 dell'app; capi con scheda: oggi facoltativa e solo per «malattia»). Prima di allora le cause non sono state rilevate: si vedono solo i totali. Il protocollo per gli operatori è in preparazione. Dove i morti dopo la nascita risultano 0 (per esempio suinetti dei lotti nel 2025) i suinetti morti nei primi giorni non sono stati registrati a parte: è probabile che stiano dentro i «nati morti al parto», che quindi vanno letti come morti prima della registrazione nel lotto (dopo la registrazione i morti si segnano come «morto» nel lotto).</Avviso></div>
      </div>

      <div style={riquadro}>
        <Titolo sotto={`Madri presenti a fine periodo che non partoriscono da più di due interparti (bovini ${SOGLIA_MADRE_MESI.bovino} mesi, suini ${SOGLIA_MADRE_MESI.suino}, ovini ${SOGLIA_MADRE_MESI.ovino}), escluse quelle gravide. Il loro costo resta nella mandria; riformarle lo toglie.`}>2. Madri improduttive</Titolo>
        {improduttive.length === 0 ? <div style={{ fontSize: 13, color: C.green }}>Nessuna.</div> : (
          <table style={{ fontSize: 12.5, width: "auto" }}>
            <thead><tr><th style={{ ...th, ...sx }}>Specie</th><th style={{ ...th, ...sx }}>Codice</th><th style={th}>Ultimo parto</th><th style={th}>Mesi senza parto</th><th style={th}>Costo variabile all'anno</th></tr></thead>
            <tbody>{improduttive.map(m => (
              <tr key={m.codice}><td style={{ ...td, ...sx }}>{NOMI[m.specie]}</td><td style={{ ...td, ...sx }}>{m.codice}{an.partiPrimaDellaNascita.some(x => x.codice === m.codice) ? " (date da verificare: parto prima della nascita)" : ""}</td><td style={td}>{data(m.ultimoParto)}</td><td style={td}>{numero(m.mesi, 0)}</td><td style={td}>{euro(m.costo, 0)}</td></tr>))}
              <tr style={{ fontWeight: 800 }}><td style={{ ...td, ...sx }} colSpan={4}>Totale: risparmio con la riforma</td><td style={td}>{euro(somma(improduttive), 0)}</td></tr>
            </tbody>
          </table>)}
        {an.madriImproduttive.some(m => m.specie === "ovino") && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Per le pecore i parti non sono registrati tutti: prima di riformare, verificare con Sborchia.</div>}
      </div>

      <div style={riquadro}>
        <Titolo>3. Schede da correggere</Titolo>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <strong>Bovine segnate riproduttrici che non hanno mai partorito, oltre i 36 mesi</strong> (sono scottone: il loro mantenimento entra nel costo della mandria e rende più caro ogni vitello):{" "}
          {scottone.length ? scottone.map(m => `${m.codice} (${numero(m.mesi, 0)} mesi, ${euro(m.costo, 0)} all'anno)`).join(" · ") : "nessuna"}.
          <br /><strong>Femmine che hanno partorito senza il segno «riproduttore» nell'app</strong> (il programma le conta come madri dai parti, l'app no):{" "}
          {an.partoriteNonSegnate.length ? an.partoriteNonSegnate.map(m => `${m.codice} (${NOMI[m.specie].toLowerCase()}, parto del ${data(m.ultimoParto)}${m.uscita ? `, uscita il ${data(m.uscita)}` : ""})`).join(" · ") : "nessuna"}.
          <br /><strong>Parti registrati prima della data di nascita della madre</strong> (una delle due date è sbagliata):{" "}
          {an.partiPrimaDellaNascita.length ? an.partiPrimaDellaNascita.map(m => `${m.codice} (nata il ${data(m.nascita)}, parto del ${data(m.parto)})`).join(" · ") : "nessuno"}.
        </div>
      </div>

      <div style={riquadro}>
        <Titolo sotto="Nello scenario base prudente restano fuori; nello scenario «con» entrano. Si chiudono con la verifica di Sborchia.">4. Dati da verificare</Titolo>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <strong>Suinetti dei lotti ancora «attivi» con più di 15 mesi, quasi certamente usciti e non registrati ({an.suiniLotto.length}):</strong> {an.suiniLotto.map(u => u.codice).join(", ") || "nessuno"}.
          <br /><strong>Capi macellati nel periodo senza peso della carcassa:</strong> {SPECIE.map(sp => `${NOMI[sp].toLowerCase()} ${an.senzaPeso[sp].length}`).join(" · ")}
          {an.senzaPeso.suino.length > 0 && <details style={{ marginTop: 4 }}><summary style={{ cursor: "pointer" }}>elenco</summary>{SPECIE.flatMap(sp => an.senzaPeso[sp].map(x => `${x.codice} (${data(x.uscita)})`)).join(" · ")}</details>}
          <strong>Agnelli:</strong> {calc.perSpecie.ovino.T.notaOvini || "nessuna differenza tra fatture e app"}.
        </div>
      </div>

      <div style={riquadro}>
        <Titolo sotto="Effetto misurabile sul risultato del periodo, con la produzione e i prezzi di oggi. Prima si controllano gli indici tecnici (interparto, nati per parto, mortalità), poi il risultato economico; i miglioramenti della mandria si vedono nelle vendite dopo circa un ciclo (bovini circa 2 anni).">5. Interventi e quanto valgono</Titolo>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr><th style={{ ...th, ...sx }}>Intervento</th><th style={{ ...th, ...sx }}>Indice da controllare</th><th style={th}>Effetto sul risultato all'anno</th></tr></thead>
          <tbody>
            {mortalita.filter(m => m.effetto).map(m => (
              <tr key={"m" + m.sp}><td style={{ ...td, ...sx }}>{NOMI[m.sp]}: nati morti dal {perc(m.percAttuale)} al {perc(m.obiettivo)}</td><td style={{ ...td, ...sx }}>nati morti al parto (%) · nati vivi per parto</td><td style={{ ...td, color: (m.effetto.delta ?? 0) >= 0 ? C.green : C.red }}>{euro(m.effetto.delta, 0)}</td></tr>))}
            {interparto.map(i => (
              <tr key={"i" + i.sp}><td style={{ ...td, ...sx }}>{NOMI[i.sp]}: interparto da {numero(i.prima, 0)} a {numero(i.dopo, 0)} giorni</td><td style={{ ...td, ...sx }}>interparto della mandria (giorni)</td><td style={{ ...td, color: (i.delta ?? 0) >= 0 ? C.green : C.red }}>{euro(i.delta, 0)}</td></tr>))}
            {improduttive.length > 0 && <tr><td style={{ ...td, ...sx }}>Riforma delle madri improduttive ({improduttive.length})</td><td style={{ ...td, ...sx }}>madri improduttive (numero)</td><td style={{ ...td, color: C.green }}>{euro(somma(improduttive), 0)}</td></tr>}
            {scottone.length > 0 && <tr><td style={{ ...td, ...sx }}>Bovine mai partorite oltre 36 mesi: correggere la scheda e decidere (ingrasso o riforma)</td><td style={{ ...td, ...sx }}>scheda corretta</td><td style={{ ...td, color: C.green }}>{euro(somma(scottone), 0)} fuori dal costo della mandria</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
