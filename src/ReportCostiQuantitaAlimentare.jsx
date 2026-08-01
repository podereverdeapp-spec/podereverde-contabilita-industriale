import { useState, useEffect, Fragment } from "react";
import { C } from "./style";
import { formattaEuro, formattaNumero, round2 } from "./parsingUtils";
import { calcolaDatiQuantitaAnno } from "./calcoloQuantitaMangimi";

const CENTRI = ["Mangimi", "Foraggio", "Integratori Alimentari"];
const SPECIE = [
  { chiave: "bovino", label: "Bovini", colore: C.bovini },
  { chiave: "suino", label: "Suini", colore: C.suini },
  { chiave: "ovino", label: "Ovini", colore: C.ovini },
];

// Unisce due strutture perCosto/perKg (shape di calcolaRigaAggregata: { imponibileComplessivo,
// tassoArea, perSpecie: { bovino:{costoAllocato,...}, suino:{...}, ovino:{...} } }) sommando
// i campi numerici — usato per accorpare tutti i prodotti "ORZO" in Mangimi in un'unica riga.
function sommaAggregati(a, b) {
  const perSpecie = {};
  for (const sp of ["bovino", "suino", "ovino"]) {
    perSpecie[sp] = {
      costoDiretto: round2((a.perSpecie[sp]?.costoDiretto || 0) + (b.perSpecie[sp]?.costoDiretto || 0)),
      quotaGenerali: round2((a.perSpecie[sp]?.quotaGenerali || 0) + (b.perSpecie[sp]?.quotaGenerali || 0)),
      quotaBovinoOvino: round2((a.perSpecie[sp]?.quotaBovinoOvino || 0) + (b.perSpecie[sp]?.quotaBovinoOvino || 0)),
      costoAllocato: round2((a.perSpecie[sp]?.costoAllocato || 0) + (b.perSpecie[sp]?.costoAllocato || 0)),
    };
  }
  return { imponibileComplessivo: round2(a.imponibileComplessivo + b.imponibileComplessivo), perSpecie };
}

// Per Mangimi: tutti i prodotti la cui descrizione contiene "orzo" (case-insensitive)
// vengono accorpati in un'unica riga "ORZO" — richiesto da Filippo, indipendentemente
// dalla dicitura esatta usata dai vari fornitori.
function accorpaOrzo(perProdotto) {
  const orzo = perProdotto.filter(p => p.descrizione.toLowerCase().includes("orzo"));
  const resto = perProdotto.filter(p => !p.descrizione.toLowerCase().includes("orzo"));
  if (orzo.length === 0) return perProdotto;
  const perCosto = orzo.map(p => p.perCosto).reduce(sommaAggregati);
  const perKg = orzo.map(p => p.perKg).reduce(sommaAggregati);
  return [...resto, { descrizione: "ORZO (accorpato)", perCosto, perKg }].sort((a, b) => a.descrizione.localeCompare(b.descrizione));
}

// Aggrega tutti i prodotti di un centro in un unico totale per specie — dà lo stesso
// risultato che si otterrebbe sommando le righe della tabella di dettaglio, usato per
// la riga del centro nella tabella principale.
function aggregaCentro(perProdotto) {
  if (perProdotto.length === 0) {
    const vuoto = { bovino: { costoAllocato: 0 }, suino: { costoAllocato: 0 }, ovino: { costoAllocato: 0 } };
    return { perCosto: { perSpecie: vuoto }, perKg: { perSpecie: vuoto } };
  }
  return { perCosto: perProdotto.map(p => p.perCosto).reduce(sommaAggregati), perKg: perProdotto.map(p => p.perKg).reduce(sommaAggregati) };
}

export default function ReportCostiQuantitaAlimentare() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [dati, setDati] = useState(null); // { [centro]: { righe, perProdotto, nonArmonizzate } }
  const [loading, setLoading] = useState(false);
  const [espanso, setEspanso] = useState(null);
  const [errore, setErrore] = useState(null);

  useEffect(() => { calcola(); }, []);

  async function calcola() {
    setLoading(true);
    setErrore(null);
    setDati(null);
    try {
      const risultati = await Promise.all(CENTRI.map(c => calcolaDatiQuantitaAnno(anno, c)));
      const nuoviDati = {};
      CENTRI.forEach((c, i) => { nuoviDati[c] = risultati[i]; });
      setDati(nuoviDati);
    } catch (err) {
      setErrore(err.message);
    }
    setLoading(false);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Costi e Quantità — Alimentazione</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Mangimi, Foraggio e Integratori Alimentari: quantità (Kg) e costo d'acquisto, totali e ripartiti tra Bovini/Suini/Ovini (quota propria della specie + quota parte dei consumi "Generali", secondo gli UBA-giorni). Clicca su un centro di costo per vederne il dettaglio per prodotto — i prodotti "ORZO" di Mangimi sono sempre accorpati in una riga unica, indipendentemente dal fornitore.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: C.muted }}>Anno:</label>
        <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
          style={{ width: 100, padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
        <button onClick={calcola} disabled={loading}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "Calcolo..." : "🔄 Calcola"}
        </button>
      </div>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}
      {loading && <p style={{ color: C.muted }}>Calcolo in corso — può richiedere qualche secondo...</p>}

      {dati && (
        <div style={{ overflowX: "auto" }}>
          <TabellaCostiQuantita dati={dati} espanso={espanso} setEspanso={setEspanso} />
        </div>
      )}
    </div>
  );
}

function TabellaCostiQuantita({ dati, espanso, setEspanso }) {
  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", minWidth: 1100 }}>
      <thead>
        <tr>
          <th rowSpan={2} style={{ ...thBase, background: C.primary, verticalAlign: "bottom" }}>Centro di Costo</th>
          <th colSpan={2} style={{ ...thBase, background: C.muted }}>Totali</th>
          {SPECIE.map(s => <th key={s.chiave} colSpan={2} style={{ ...thBase, background: s.colore }}>{s.label}</th>)}
        </tr>
        <tr>
          <th style={thSub}>Kg</th><th style={thSub}>Costo</th>
          {SPECIE.map(s => (
            <Fragment key={s.chiave}>
              <th style={{ ...thSub, background: s.colore + "cc" }}>Kg</th>
              <th style={{ ...thSub, background: s.colore + "cc" }}>Costo</th>
            </Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {CENTRI.map(centro => {
          const d = dati[centro];
          const totaleKg = (d.righe || []).reduce((s, r) => s + r.quantitaKg, 0);
          const totaleCosto = (d.righe || []).reduce((s, r) => s + r.costoAnno, 0);
          const agg = aggregaCentro(d.perProdotto || []);
          const perProdottoVisualizzato = centro === "Mangimi" ? accorpaOrzo(d.perProdotto || []) : (d.perProdotto || []);
          return (
            <Fragment key={centro}>
              <tr onClick={() => setEspanso(espanso === centro ? null : centro)}
                style={{ cursor: "pointer", background: espanso === centro ? C.bg : "#fff", borderTop: `2px solid ${C.border}` }}>
                <td style={{ ...tdBase, fontWeight: 700 }}>{espanso === centro ? "▼" : "▶"} {centro}</td>
                <td style={tdBase}>{formattaNumero(totaleKg, 0)}</td>
                <td style={tdBase}>{formattaEuro(totaleCosto)}</td>
                {SPECIE.map(s => (
                  <Fragment key={s.chiave}>
                    <td style={{ ...tdBase, color: s.colore, fontWeight: 700 }}>{formattaNumero(agg.perKg.perSpecie[s.chiave].costoAllocato, 0)}</td>
                    <td style={{ ...tdBase, color: s.colore, fontWeight: 700 }}>{formattaEuro(agg.perCosto.perSpecie[s.chiave].costoAllocato)}</td>
                  </Fragment>
                ))}
              </tr>
              {espanso === centro && perProdottoVisualizzato.map((p, i) => (
                <tr key={i} style={{ background: "#FAFAF8" }}>
                  <td style={{ ...tdBase, paddingLeft: 32, fontSize: 12, color: C.muted }}>{p.descrizione}</td>
                  <td style={{ ...tdBase, fontSize: 12 }}>—</td>
                  <td style={{ ...tdBase, fontSize: 12 }}>—</td>
                  {SPECIE.map(s => (
                    <Fragment key={s.chiave}>
                      <td style={{ ...tdBase, fontSize: 12, color: s.colore }}>{formattaNumero(p.perKg.perSpecie[s.chiave].costoAllocato, 0)}</td>
                      <td style={{ ...tdBase, fontSize: 12, color: s.colore }}>{formattaEuro(p.perCosto.perSpecie[s.chiave].costoAllocato)}</td>
                    </Fragment>
                  ))}
                </tr>
              ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

const thBase = { padding: "8px 10px", color: "#fff", fontSize: 12, textAlign: "right" };
const thSub = { padding: "6px 10px", color: "#fff", fontSize: 11, textAlign: "right", background: C.muted };
const tdBase = { padding: "8px 10px", textAlign: "right", borderBottom: `1px solid ${C.border}` };
