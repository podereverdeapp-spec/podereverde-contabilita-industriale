// Versione 296 — In coda al Report di Analisi dei bovini (decisione del Dott. Bizzarri del 26/10/2026):
//   A. «Acquistare o far nascere? Come cambiano i numeri nel tempo»: gli indicatori dello studio ricalcolati
//      con i dati di oggi, accanto ai valori di ottobre 2026 (si ricalcola da solo, calcoloStudioBovini.js);
//   B. «Studio: Acquistare o far nascere? Situazione a ottobre 2026»: lo studio approvato, fermo (studiDati.js).
// Alla parte B rinvia la criticità «Un vitello nato in azienda costa più di uno comprato già svezzato».
// Sola lettura: nessuna scrittura nel database.
import { useMemo } from "react";
import { C } from "./style";
import { it, prezzoVendita } from "./calcoloReportAnalisi";
import { studioBovini, OTTOBRE_2026 } from "./calcoloStudioBovini";
import { Sezione, Riquadri, Avvisi, vaiA, stileTabella as T } from "./ReportAnalisiParti";
import DocumentoIstruzioni from "./DocumentoIstruzioni";
import { STUDIO_ACQUISTARE_O_FAR_NASCERE } from "./studiDati";

const ID_OGGI = "acquistare-o-far-nascere-oggi", ID_STUDIO = "studio-acquistare-o-far-nascere";
const dataIt = s => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const Novita = ({ children }) => <span style={{ display: "inline-block", background: C.primary, color: "#fff", borderRadius: 10, padding: "2px 9px", fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>{children}</span>;
const thA = { ...T.th, whiteSpace: "normal", verticalAlign: "bottom" };
const pulsante = { background: C.primary, color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 13.5, fontWeight: 700 };

export default function StudioBovini({ dati }) {
  const s = useMemo(() => {
    try {
      const st = studioBovini({ animali: dati.base.g.animali, lotti: dati.base.g.lotti, costiAnimali: dati.base.g.costiAnimali, mandria: dati.base.mandria, razze: dati.razze });
      const anno = st.indicatori.annoIntero;
      const pv = anno ? prezzoVendita(dati, "bovino", anno) : null;
      st.indicatori.prezzoVendita = pv ? pv.prezzo : null;
      st.indicatori.annoPrezzoVendita = pv ? pv.anno : null;
      return st;
    } catch (e) { return { errore: e.message || String(e) }; }
  }, [dati]);

  return (
    <>
      <div id={ID_OGGI} style={{ scrollMarginTop: 10 }}>
        <Sezione titolo="Acquistare o far nascere? Come cambiano i numeri nel tempo"
          sottotitolo="Gli indicatori dello studio di ottobre 2026 ricalcolati con i dati del programma di oggi e messi accanto ai valori di allora. Si ricalcola da solo a ogni apertura del report.">
          {s.errore ? <div style={{ background: "#F8E1DE", color: "#9B2C20", padding: 10, borderRadius: 8 }}>Errore nel calcolo: {s.errore}</div> : <ParteOggi s={s} />}
        </Sezione>
      </div>
      <div id={ID_STUDIO} style={{ scrollMarginTop: 10 }}>
        <Sezione titolo="Studio: Acquistare o far nascere? Situazione a ottobre 2026">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", background: "#EAF1F7", border: "1px solid #BCD3E6", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
            <span style={{ fontSize: 13.5 }}>📌 Dati del programma al {OTTOBRE_2026.data}, con il costo di nascita del 2026 del Report Riproduttori rifatto il 26/10/2026. Lo studio non si ricalcola: per i valori di oggi vedere la sezione precedente.</span>
            <button onClick={() => vaiA(ID_OGGI)} style={pulsante}>↑ Valori di oggi</button>
          </div>
          <DocumentoIstruzioni doc={STUDIO_ACQUISTARE_O_FAR_NASCERE} incorporato />
        </Sezione>
      </div>
    </>
  );
}

function ParteOggi({ s }) {
  const o = s.indicatori, O = OTTOBRE_2026, ui = s.ultimoIntero;
  const riquadri = [
    { etichetta: `Costo di nascita di un vitello (${o.annoIntero ?? "—"})`, valore: o.costoNascita !== null ? `${it(o.costoNascita)} €` : "—",
      nota: o.costoNascita && o.prezzoAcquisto ? `${it(o.costoNascita / o.prezzoAcquisto, 1)} volte il prezzo medio di un vitello acquistato` : "",
      bollino: ["b-verde", "● dal Report Riproduttori"] },
    { etichetta: "Prezzo medio di un vitello acquistato", valore: o.prezzoAcquisto !== null ? `${it(o.prezzoAcquisto)} €` : "—",
      nota: `${o.capiAcquistati} capi da ingrasso comprati fino a 30 mesi di età, età media all'acquisto ${it(o.etaAcquisto, 1)} mesi`,
      bollino: ["b-verde", "● dalle schede degli animali"] },
    { etichetta: `Vitelli per vacca in carriera (${o.annoIntero ?? "—"})`, valore: o.vitelliPerVacca !== null ? it(o.vitelliPerVacca) : "—",
      nota: `Obiettivo: un vitello per vacca all'anno. Così il vitello costerebbe ${it(o.costoUnVitelloPerVacca)} €.`,
      bollino: o.vitelliPerVacca !== null && o.vitelliPerVacca < 0.9 ? ["b-arancio", "▲ sotto l'obiettivo"] : ["b-verde", "● vicino all'obiettivo"] },
  ];
  const eur = v => (v === null || v === undefined ? "—" : `${it(v)} €`);
  const dueDec = v => (v === null || v === undefined ? "—" : it(v));
  const conAnno = (testo, anno) => <>{testo}{anno ? <span style={{ color: C.muted, fontSize: 12 }}> ({anno})</span> : null}</>;
  const righe = [
    { n: "Costo di nascita di un vitello, ultimo anno intero", ot: O.costoNascita, og: o.costoNascita, f: eur, aO: O.annoIntero, aG: o.annoIntero },
    { n: "Vitelli per vacca in carriera, ultimo anno intero", ot: O.vitelliPerVacca, og: o.vitelliPerVacca, f: dueDec, alto: true, aO: O.annoIntero, aG: o.annoIntero },
    { n: "Costo per vitello se ogni vacca in carriera ne facesse uno", ot: O.costoUnVitelloPerVacca, og: o.costoUnVitelloPerVacca, f: eur, aO: O.annoIntero, aG: o.annoIntero },
    { n: "Costo di un riproduttore adulto all'anno", ot: O.costoAdulto, og: o.costoAdulto, f: eur, aO: O.annoIntero, aG: o.annoIntero },
    { n: "Prezzo medio di un vitello acquistato da ingrasso", ot: O.prezzoAcquisto, og: o.prezzoAcquisto, f: eur, nO: `${O.capiAcquistati} capi`, nG: `${o.capiAcquistati} capi` },
    { n: "Costo medio di nascita dei capi da ingrasso nati in azienda", ot: O.nascitaMedia, og: o.nascitaMedia, f: eur, nO: `${O.capiNati} capi`, nG: `${o.capiNati} capi` },
    { n: "Costo accumulato a 18 mesi: nato in azienda", ot: O.costo18Nato, og: o.costo18Nato, f: eur },
    { n: "Costo accumulato a 18 mesi: acquistato", ot: O.costo18Acquistato, og: o.costo18Acquistato, f: eur },
    { n: "Differenza a 18 mesi: nato in azienda meno acquistato", ot: O.costo18Nato - O.costo18Acquistato, og: o.costo18Acquistato !== null ? o.costo18Nato - o.costo18Acquistato : null, f: eur, forte: true },
    { n: "Costo al kg di carcassa dei macellati nati in azienda", ot: O.kgNati, og: o.kgNati, f: eur, nO: `${O.capiKgNati} capi`, nG: `${o.capiKgNati} capi` },
    { n: "Costo al kg di carcassa dei macellati acquistati", ot: O.kgAcquistati, og: o.kgAcquistati, f: eur, nO: `${O.capiKgAcquistati} capi`, nG: `${o.capiKgAcquistati} capi` },
    { n: "Prezzo medio di vendita della carcassa, al kg", ot: 9, og: o.prezzoVendita, f: eur, neutro: true, aO: 2025, aG: o.annoPrezzoVendita },
    { n: "Vacche da controllare", ot: O.vacche, og: o.vacche, f: v => (v === null ? "—" : String(v)), nO: eur(O.costoVacche) + " all'anno", nG: eur(o.costoVacche) + " all'anno" },
  ];
  const variazione = r => {
    if (r.og === null || r.og === undefined || r.ot === null) return <span style={{ color: C.muted }}>—</span>;
    const d = Math.round((r.og - r.ot) * 100) / 100;
    if (Math.abs(d) < 0.005) return <span style={{ color: C.muted }}>invariato</span>;
    const meglio = r.alto ? d > 0 : d < 0;
    const col = r.neutro ? C.text : meglio ? C.green : C.red;
    const testo = r.f === eur ? `${it(Math.abs(d))} €` : r.f === dueDec ? it(Math.abs(d)) : String(Math.abs(d));
    return <span style={{ color: col, fontWeight: 700 }}>{d > 0 ? "▲ +" : "▼ −"}{testo}</span>;
  };
  const sotto = t => (t ? <div style={{ color: C.muted, fontSize: 11.5 }}>{t}</div> : null);

  return (
    <>
      <Riquadri voci={riquadri} />

      <h3 style={{ fontSize: 15.5, margin: "20px 0 8px" }}>Indicatori: ottobre 2026 e oggi</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ ...T.tabella, minWidth: 620 }}>
          <thead><tr><th style={T.thSx}>Indicatore</th><th style={T.th}>Ottobre 2026</th><th style={T.th}>Oggi</th><th style={T.th}>Variazione</th></tr></thead>
          <tbody>
            {righe.map(r => (
              <tr key={r.n} style={r.forte ? { fontWeight: 700 } : null}>
                <td style={{ ...T.tdSx, minWidth: 260 }}>{r.n}</td>
                <td style={T.td}>{conAnno(r.f(r.ot), r.aO)}{sotto(r.nO)}</td>
                <td style={T.td}>{conAnno(r.f(r.og), r.aG)}{sotto(r.nG)}</td>
                <td style={T.td}>{variazione(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: C.muted, margin: "6px 0 0" }}>
        Variazione: <span style={{ color: C.green, fontWeight: 700 }}>▼ verde</span> se migliora, <span style={{ color: C.red, fontWeight: 700 }}>▲ rosso</span> se peggiora (per i vitelli per vacca è il contrario: più è alto, meglio è).
        Ottobre 2026 = valori dello studio, dati del programma al {O.data}. Oggi = dati del programma fino al {dataIt(s.fineCalcolo)} (ultimo giorno dei costi calcolati dal Report Costi).
        Il costo al kg usa solo i pesi scritti nelle schede: lo studio, con altri 2 pesi ricavati dalle fatture, dà 23,44 € per i nati in azienda.
      </p>

      <h3 style={{ fontSize: 15.5, margin: "22px 0 8px" }}>Anno per anno</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ ...T.tabella, minWidth: 760 }}>
          <thead><tr>
            <th style={T.thSx}>Anno</th><th style={thA}>Costo della mandria</th><th style={thA}>Vacche in carriera</th><th style={thA}>Vitelli nati</th>
            <th style={thA}>Vitelli per vacca</th><th style={thA}>Costo di nascita</th><th style={thA}>Con un vitello per vacca</th><th style={thA}>Vitelli acquistati entrati</th><th style={thA}>Prezzo medio dei vitelli acquistati</th>
          </tr></thead>
          <tbody>
            {s.anni.map(a => (
              <tr key={a.anno} style={a.inCorso ? { color: C.muted } : null}>
                <td style={{ ...T.tdSx, whiteSpace: "nowrap" }}>{a.anno}{a.inCorso ? " in corso" : ""}</td>
                <td style={T.td}>{it(a.costoMandria)} €</td><td style={T.td}>{a.vacche}</td><td style={T.td}>{a.nati}</td>
                <td style={T.td}>{a.vitelliPerVacca !== null ? it(a.vitelliPerVacca) : "—"}</td>
                <td style={{ ...T.td, fontWeight: 700 }}>{it(a.costoNascita)} €</td>
                <td style={T.td}>{a.costoUnVitelloPerVacca !== null ? `${it(a.costoUnVitelloPerVacca)} €` : "—"}</td>
                <td style={T.td}>{a.acquistatiNellAnno || "—"}</td>
                <td style={T.td}>{a.prezzoAcquistatiNellAnno !== null ? `${it(a.prezzoAcquistatiNellAnno)} €` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <GraficoAnni anni={s.anni} prezzoMedio={o.prezzoAcquisto} />
      <p style={{ fontSize: 12, color: C.muted, margin: "4px 0 0" }}>
        Costo della mandria, vitelli nati e costo di nascita: Report Riproduttori del programma (metodo deciso il 03/10/2026). Vacche in carriera: vacche dal primo figlio nato in azienda fino all'uscita.
        Il 2019 e il 2020 sono gli anni di avvio della mandria, con pochi nati.{ui ? "" : " Nessun anno intero calcolato."}
      </p>

      <h3 style={{ fontSize: 15.5, margin: "22px 0 8px" }}>Vacche da controllare oggi</h3>
      {s.vacche.length === 0 ? <Avvisi voci={[]} vuoto="Nessuna vacca senza parto da oltre 15 mesi." /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ ...T.tabella, maxWidth: 820, minWidth: 560 }}>
            <thead><tr><th style={T.thSx}>Matricola</th><th style={T.thSx}>Razza</th><th style={T.thSx}>Ultimo parto</th><th style={T.th}>Costo all'anno</th></tr></thead>
            <tbody>
              {s.vacche.map(v => (
                <tr key={v.id}>
                  <td style={T.tdSx}>{v.matricola}{v.nome ? ` (${v.nome})` : ""}</td>
                  <td style={T.tdSx}>{v.razza ? v.razza.charAt(0).toUpperCase() + v.razza.slice(1) : "—"}</td>
                  <td style={T.tdSx}>{v.ultimoParto ? `${dataIt(v.ultimoParto)} (${it(v.mesiDallUltimo, 1)} mesi fa)` : `mai partorito (${it(v.etaMesi, 1)} mesi di età)`}</td>
                  <td style={T.td}>{v.costoAnno !== null ? `${it(v.costoAnno)} €` : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ fontWeight: 700 }}><td style={T.tdSx} colSpan={3}>Totale ({s.vacche.length} vacche)</td><td style={T.td}>{o.costoVacche !== null ? `${it(o.costoVacche)} €` : "—"}</td></tr></tfoot>
          </table>
        </div>
      )}
      <p style={{ fontSize: 12, color: C.muted, margin: "6px 0 0" }}>
        Da controllare: vacca in azienda senza parto da oltre 15 mesi, oppure mai partorita oltre i 30 mesi di età. Costo all'anno: quanto costa un riproduttore adulto presente tutto il {o.annoIntero ?? "—"} nel programma. Prima di decidere: visita di gravidanza.
      </p>

      <div style={{ marginTop: 14 }}>
        <button onClick={() => vaiA(ID_STUDIO)} style={pulsante}>↓ Vai allo studio di ottobre 2026</button>
      </div>
    </>
  );
}

// Barre: costo di nascita per anno; rombi: prezzo medio dei vitelli acquistati entrati nell'anno; tratteggio: prezzo medio di tutti gli acquistati
function GraficoAnni({ anni, prezzoMedio }) {
  if (!anni.length) return null;
  const valori = anni.flatMap(a => [a.costoNascita, a.prezzoAcquistatiNellAnno || 0]).concat([prezzoMedio || 0]);
  const passo = 1000, max = Math.ceil(Math.max(...valori) * 1.1 / passo) * passo;
  const W = 860, H = 300, x0 = 70, dx = W - 150, base = 250, top = 20, larg = (dx - x0) / anni.length, bar = Math.min(56, larg * 0.55);
  const Y = v => base - (base - top) * v / max;
  const tacche = []; for (let t = 0; t <= max; t += passo) tacche.push(t);
  return (
    <div style={{ overflowX: "auto", marginTop: 14 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 560, fontSize: 12.5, fontFamily: "inherit" }} role="img" aria-label="Costo di nascita per anno e prezzo dei vitelli acquistati">
        {tacche.map(t => <g key={t}><line x1={x0} x2={dx} y1={Y(t)} y2={Y(t)} stroke={C.border} /><text x={x0 - 8} y={Y(t) + 4} textAnchor="end" fill={C.muted}>{it(t, 0)}</text></g>)}
        <text x={4} y={12} fill={C.muted}>euro</text>
        {anni.map((a, i) => {
          const cx = x0 + larg * i + larg / 2;
          return (
            <g key={a.anno}>
              <rect x={cx - bar / 2} y={Y(a.costoNascita)} width={bar} height={base - Y(a.costoNascita)} rx={2} fill={a.inCorso ? "#E0A98A" : "#D9773F"}>
                <title>{`${a.anno}: costo di nascita ${it(a.costoNascita)} €`}</title>
              </rect>
              <text x={cx} y={Y(a.costoNascita) - 6} textAnchor="middle" fill={C.text} fontWeight={700}>{it(a.costoNascita, 0)}</text>
              {a.prezzoAcquistatiNellAnno !== null && <g>
                <rect x={cx - 6} y={Y(a.prezzoAcquistatiNellAnno) - 6} width={12} height={12} transform={`rotate(45 ${cx} ${Y(a.prezzoAcquistatiNellAnno)})`} fill={C.blue} stroke="#fff" strokeWidth={1.5}>
                  <title>{`${a.anno}: ${a.acquistatiNellAnno} vitelli acquistati, prezzo medio ${it(a.prezzoAcquistatiNellAnno)} €`}</title>
                </rect>
              </g>}
              <text x={cx} y={base + 18} textAnchor="middle" fill={C.text}>{a.anno}</text>
              {a.inCorso && <text x={cx} y={base + 34} textAnchor="middle" fill={C.muted}>in corso</text>}
            </g>);
        })}
        {prezzoMedio && <>
          <line x1={x0} x2={dx} y1={Y(prezzoMedio)} y2={Y(prezzoMedio)} stroke={C.blue} strokeWidth={2} strokeDasharray="6 4" />
          <text x={dx + 8} y={Y(prezzoMedio) - 4} fill={C.blue} fontWeight={700}>vitello acquistato,</text>
          <text x={dx + 8} y={Y(prezzoMedio) + 12} fill={C.blue} fontWeight={700}>prezzo medio {it(prezzoMedio, 0)} €</text>
        </>}
      </svg>
      <div style={{ fontSize: 12, color: C.muted }}>
        <span style={{ color: "#D9773F", fontWeight: 700 }}>■</span> costo di nascita di un vitello nato in azienda ·{" "}
        <span style={{ color: C.blue, fontWeight: 700 }}>◆</span> prezzo medio dei vitelli acquistati entrati nell'anno ·{" "}
        <span style={{ color: C.blue, fontWeight: 700 }}>- - -</span> prezzo medio di tutti i vitelli acquistati
      </div>
    </div>
  );
}
