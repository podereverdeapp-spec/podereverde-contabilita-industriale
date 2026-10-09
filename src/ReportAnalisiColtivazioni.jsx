// Versione 239 — Report di Analisi delle coltivazioni: per ogni campagna, quanto è costato produrre un
// quintale di ogni prodotto contro il prezzo di mercato, quali campi convengono e quali no, perché e cosa fare.
// Legge i dati della sezione Coltivazioni dell'app e i prezzi di mercato; si ricalcola a ogni apertura.
// Sola lettura: nessuna scrittura nel database.
import { useEffect, useMemo, useState } from "react";
import { C, FONT } from "./style";
import { caricaDatiColtivazioni, analisiColtivazioni, campagneConRaccolto, it } from "./calcoloReportAnalisi";
import { Intestazione, Sezione, Riquadri, Buoni, Critiche, Segnali, Avvisi, SALE, stileTabella as T } from "./ReportAnalisiParti";

const ora = () => new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function ReportAnalisiColtivazioni() {
  const [dati, setDati] = useState(null);
  const [campagna, setCampagna] = useState(null);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState(null);
  const [calcolatoIl, setCalcolatoIl] = useState(null);

  async function carica() {
    setCaricando(true); setErrore(null);
    try {
      const d = await caricaDatiColtivazioni();
      setDati(d); setCalcolatoIl(ora());
      const cc = campagneConRaccolto(d);
      setCampagna(c => c ?? cc[cc.length - 1] ?? null);
    } catch (e) { setErrore(e.message || String(e)); }
    setCaricando(false);
  }
  useEffect(() => { carica(); }, []);

  const r = useMemo(() => {
    if (!dati || !campagna) return null;
    try { return analisiColtivazioni(dati, campagna); } catch (e) { return { errore: e.message || String(e) }; }
  }, [dati, campagna]);

  const campagne = dati ? campagneConRaccolto(dati) : [];
  const selettore = (
    <label style={{ fontSize: 13.5 }}>Campagna{" "}
      <select value={campagna || ""} onChange={e => setCampagna(e.target.value)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}` }}>
        {campagne.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );

  return (
    <div style={{ fontFamily: FONT, color: C.text, maxWidth: 1100 }}>
      <Intestazione titolo="Report di Analisi · Coltivazioni" sottotitolo="Quanto costa produrre in azienda contro il prezzo di mercato: cosa conviene, cosa no, perché e cosa fare."
        selettore={selettore} aggiorna={carica} calcolatoIl={calcolatoIl} caricando={caricando} />
      {errore && <div style={{ background: "#F8E1DE", color: "#9B2C20", padding: 10, borderRadius: 8, marginTop: 10 }}>Errore nella lettura dei dati: {errore}</div>}
      {!dati && !errore && <p style={{ color: C.muted }}>Calcolo in corso…</p>}
      {dati && !campagne.length && <p style={{ color: C.muted }}>Non ci sono ancora campagne con raccolto registrato nella sezione Coltivazioni.</p>}
      {r && r.errore && <div style={{ background: "#F8E1DE", color: "#9B2C20", padding: 10, borderRadius: 8, marginTop: 10 }}>Errore nel calcolo: {r.errore}</div>}
      {r && !r.errore && <Contenuto r={r} />}
    </div>
  );
}

function Contenuto({ r }) {
  const diff = r.totCosto - r.totValore;
  const riquadri = [
    { etichetta: `Costo delle coltivazioni ${r.campagna}`, valore: `${it(r.totCosto)} €`, nota: `Di cui campi pascolati senza raccolta: ${it(r.pascoli)} €.`, bollino: ["b-arancio", "▲ dalla sezione Coltivazioni"] },
    { etichetta: "Valore dei raccolti a prezzo di mercato", valore: `${it(r.totValore)} €`, nota: "Quintali raccolti per il prezzo di mercato della campagna.", bollino: ["b-verde", "● listini di mercato"] },
    { etichetta: diff > 0 ? "Costato più del mercato" : "Risparmiato sul mercato", valore: `${it(Math.abs(diff))} €`,
      nota: diff > 0 ? "Comprare gli stessi prodotti sarebbe costato meno (pascoli compresi nel costo)." : "Produrre in azienda è costato meno che comprare.", bollino: diff > 0 ? ["b-rosso", "● da migliorare"] : ["b-verde", "● conviene"] },
  ];
  return (
    <>
      <Sezione titolo="In sintesi"><Riquadri voci={riquadri} /></Sezione>
      <Sezione titolo="In breve">
        <p style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `5px solid ${C.primary}`, borderRadius: 8, padding: "12px 16px", margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>{r.giudizio}</p>
      </Sezione>
      <Sezione titolo="Cosa conviene produrre"><Buoni voci={r.buoni} /></Sezione>
      <Sezione titolo="Criticità: analisi, cause e cosa si può fare"
        sottotitolo="Prima le criticità alte, ordinate per quanto valgono. Le cause hanno un bollino: dimostrata (si vede nei dati), probabile (i dati la indicano), ipotesi (da verificare).">
        <Critiche voci={r.critiche} />
      </Sezione>
      <Sezione titolo="Cosa è cambiato di più del 10% rispetto alla campagna prima" sottotitolo={r.prec ? `Costi per ettaro coltivato, ${r.prec} contro ${r.campagna}.` : "Non c'è una campagna precedente con raccolto."}>
        <Segnali voci={r.segnali} />
      </Sezione>

      <Sezione titolo="Prodotti: costo al quintale e prezzo di mercato" sottotitolo="Ordinati dal più caro rispetto al mercato. Rosso: costa più del mercato.">
        <div style={{ overflowX: "auto" }}>
          <table style={T.tabella}>
            <thead><tr><th style={T.thSx}>Prodotto</th><th style={T.th}>Ettari</th><th style={T.th}>Quintali</th><th style={T.th}>Quintali per ettaro</th><th style={T.th}>Costo</th><th style={T.th}>Costo al quintale</th><th style={T.th}>Mercato al quintale</th><th style={T.th}>Costo sul mercato</th></tr></thead>
            <tbody>{r.tabella.map(x => {
              const rap = x.prezzo > 0 ? x.costoQ / x.prezzo : null;
              return (
                <tr key={x.prodotto}>
                  <td style={T.tdSx}>{x.prodotto}</td><td style={T.td}>{it(x.ha)}</td><td style={T.td}>{it(x.q, 1)}</td><td style={T.td}>{it(x.resa, 1)}</td><td style={T.td}>{it(x.costo)} €</td>
                  <td style={{ ...T.td, fontWeight: 700, color: rap !== null && rap > 1 ? SALE : C.green }}>{it(x.costoQ)} €</td><td style={T.td}>{x.prezzo > 0 ? `${it(x.prezzo)} €` : "—"}</td>
                  <td style={{ ...T.td, color: rap !== null && rap > 1 ? SALE : C.green }}>{rap !== null ? `${it(rap * 100, 0)}%` : "—"}</td>
                </tr>);
            })}</tbody>
          </table>
        </div>
      </Sezione>

      <Sezione titolo="Campo per campo" sottotitolo="Ordinati dal più caro rispetto al mercato.">
        <div style={{ overflowX: "auto" }}>
          <table style={T.tabella}>
            <thead><tr><th style={T.thSx}>Campo</th><th style={T.thSx}>Coltura</th><th style={T.thSx}>Prodotto</th><th style={T.th}>Ettari</th><th style={T.th}>Quintali per ettaro</th><th style={T.th}>Costo al quintale</th><th style={T.th}>Mercato</th></tr></thead>
            <tbody>{r.campi.map((x, i) => (
              <tr key={i}>
                <td style={T.tdSx}>{x.campo}</td><td style={T.tdSx}>{x.coltura}</td><td style={T.tdSx}>{x.prodotto}</td><td style={T.td}>{it(x.ha)}</td><td style={T.td}>{it(x.resa, 1)}</td>
                <td style={{ ...T.td, fontWeight: 700, color: x.prezzo > 0 && x.costoQ > x.prezzo ? SALE : C.green }}>{it(x.costoQ)} €</td><td style={T.td}>{x.prezzo > 0 ? `${it(x.prezzo)} €` : "—"}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </Sezione>

      <Sezione titolo="Le campagne a confronto" sottotitolo="Costo delle coltivazioni e valore dei raccolti a prezzo di mercato.">
        <table style={{ ...T.tabella, maxWidth: 760 }}>
          <thead><tr><th style={T.thSx}>Campagna</th><th style={T.th}>Costo</th><th style={T.th}>di cui pascoli</th><th style={T.th}>Valore di mercato dei raccolti</th><th style={T.th}>Differenza</th></tr></thead>
          <tbody>{r.campagneTab.map(c => (
            <tr key={c.campagna} style={c.campagna === r.campagna ? { background: "#F1F6F2", fontWeight: 700 } : null}>
              <td style={T.tdSx}>{c.campagna}</td><td style={T.td}>{it(c.costo)} €</td><td style={T.td}>{it(c.pascoli)} €</td><td style={T.td}>{it(c.valore)} €</td>
              <td style={{ ...T.td, color: c.costo > c.valore ? SALE : C.green }}>{it(c.valore - c.costo)} €</td>
            </tr>))}</tbody>
        </table>
      </Sezione>

      <Sezione titolo="Affidabilità dei dati: cosa va sistemato prima di fidarsi dei numeri">
        <Avvisi voci={r.affidabilita} vuoto="Nessun problema noto nei dati." />
      </Sezione>
    </>
  );
}
