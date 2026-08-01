import { useState, useEffect, Fragment } from "react";
import { C } from "./style";
import { formattaEuro, formattaNumero, round2 } from "./parsingUtils";
import { calcolaDatiQuantitaAnno } from "./calcoloQuantitaMangimi";
import GraficoMultiLinea from "./GraficoMultiLinea";

const CENTRI = ["Mangimi", "Foraggio", "Integratori alimentari"];
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

// Ricalcola l'incidenza (valore / UBA-giorni della specie) — va sempre ricalcolata DOPO
// eventuali somme (aggregazione centro, accorpamento ORZO), mai sommata insieme ai valori
// stessi, perché è un rapporto: la somma di due rapporti non è il rapporto della somma.
// Icone semplici delle 3 specie — sagome pulite, non foto realistiche, pensate per
// essere leggibili anche piccole e colorabili con il colore della specie.
function IconaMucca({ colore, dimensione = 64 }) {
  return (
    <svg width={dimensione} height={dimensione} viewBox="0 0 100 100" fill="none">
      <ellipse cx="50" cy="60" rx="34" ry="22" fill={colore} />
      <rect x="20" y="55" width="8" height="22" rx="3" fill={colore} />
      <rect x="72" y="55" width="8" height="22" rx="3" fill={colore} />
      <rect x="30" y="58" width="8" height="22" rx="3" fill={colore} />
      <rect x="62" y="58" width="8" height="22" rx="3" fill={colore} />
      <circle cx="76" cy="38" r="16" fill={colore} />
      <ellipse cx="76" cy="46" rx="9" ry="6" fill="#fff" opacity="0.85" />
      <circle cx="65" cy="30" r="4" fill="#fff" opacity="0.6" />
      <path d="M66 24 Q62 16 58 22" stroke={colore} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M86 24 Q90 16 94 22" stroke={colore} strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="30" cy="60" r="5" fill="#fff" opacity="0.5" />
      <circle cx="48" cy="70" r="6" fill="#fff" opacity="0.5" />
    </svg>
  );
}

function IconaMaiale({ colore, dimensione = 64 }) {
  return (
    <svg width={dimensione} height={dimensione} viewBox="0 0 100 100" fill="none">
      <ellipse cx="48" cy="58" rx="32" ry="20" fill={colore} />
      <rect x="22" y="52" width="8" height="20" rx="3" fill={colore} />
      <rect x="68" y="52" width="8" height="20" rx="3" fill={colore} />
      <rect x="34" y="55" width="8" height="20" rx="3" fill={colore} />
      <rect x="56" y="55" width="8" height="20" rx="3" fill={colore} />
      <circle cx="76" cy="42" r="15" fill={colore} />
      <ellipse cx="86" cy="44" rx="7" ry="5" fill={colore} />
      <circle cx="87" cy="42" r="1.8" fill="#fff" />
      <circle cx="87" cy="46" r="1.8" fill="#fff" />
      <path d="M68 30 L64 22 L72 26 Z" fill={colore} />
      <ellipse cx="30" cy="66" rx="18" ry="4" fill={colore} opacity="0.7" />
    </svg>
  );
}

function IconaPecora({ colore, dimensione = 64 }) {
  return (
    <svg width={dimensione} height={dimensione} viewBox="0 0 100 100" fill="none">
      <circle cx="38" cy="52" r="16" fill={colore} />
      <circle cx="50" cy="50" r="17" fill={colore} />
      <circle cx="62" cy="54" r="15" fill={colore} />
      <circle cx="46" cy="60" r="14" fill={colore} />
      <rect x="24" y="62" width="7" height="18" rx="3" fill={colore} />
      <rect x="64" y="62" width="7" height="18" rx="3" fill={colore} />
      <rect x="34" y="65" width="7" height="18" rx="3" fill={colore} />
      <rect x="54" y="65" width="7" height="18" rx="3" fill={colore} />
      <ellipse cx="82" cy="46" rx="10" ry="12" fill="#8B6F47" />
      <circle cx="79" cy="42" r="1.8" fill="#fff" />
    </svg>
  );
}

function IconaSpecie({ chiave, colore, dimensione }) {
  if (chiave === "bovino") return <IconaMucca colore={colore} dimensione={dimensione} />;
  if (chiave === "suino") return <IconaMaiale colore={colore} dimensione={dimensione} />;
  return <IconaPecora colore={colore} dimensione={dimensione} />;
}

// Somma i 3 centri di costo insieme, per ottenere il totale per specie (costo e kg) —
// usata per le card di sintesi e per le righe delle tabelle storiche (dove la riga è
// l'anno, non più il singolo centro). Gli UBA-giorni per specie non dipendono dal centro
// di costo, quindi si possono prendere da uno qualsiasi dei tre (qui il primo disponibile).
function sommaSuiCentri(datiAnno) {
  const aggregatiPerCentro = CENTRI.map(c => aggregaCentro(datiAnno[c]?.perProdotto || []));
  const totale = { perCosto: { perSpecie: {} }, perKg: { perSpecie: {} } };
  for (const sp of ["bovino", "suino", "ovino"]) {
    totale.perCosto.perSpecie[sp] = { costoAllocato: round2(aggregatiPerCentro.reduce((s, a) => s + a.perCosto.perSpecie[sp].costoAllocato, 0)) };
    totale.perKg.perSpecie[sp] = { costoAllocato: round2(aggregatiPerCentro.reduce((s, a) => s + a.perKg.perSpecie[sp].costoAllocato, 0)) };
  }
  const ubaGiorniProduttiviPerSpecie = CENTRI.map(c => datiAnno[c]?.ubaGiorniProduttiviPerSpecie).find(Boolean) || {};
  const totaleKgGrezzo = CENTRI.reduce((s, c) => s + (datiAnno[c]?.righe || []).reduce((s2, r) => s2 + r.quantitaKg, 0), 0);
  const totaleCostoGrezzo = CENTRI.reduce((s, c) => s + (datiAnno[c]?.righe || []).reduce((s2, r) => s2 + r.costoAnno, 0), 0);
  return { ...totale, ubaGiorniProduttiviPerSpecie, totaleKgGrezzo, totaleCostoGrezzo };
}

function incidenza(valoreAllocato, ubaGiorniSp) {
  return ubaGiorniSp > 0 ? valoreAllocato / ubaGiorniSp : 0;
}

export default function ReportCostiQuantitaAlimentare() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [dati, setDati] = useState(null); // { [centro]: { righe, perProdotto, nonArmonizzate, ubaGiorniProduttiviPerSpecie } }
  const [loading, setLoading] = useState(false);
  const [espanso, setEspanso] = useState(null);
  const [espansoIncidenza, setEspansoIncidenza] = useState(null);
  const [errore, setErrore] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [datiStorico, setDatiStorico] = useState(null); // { [anno]: { [centro]: {...} } }
  const [loadingStorico, setLoadingStorico] = useState(false);

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

  async function calcolaStorico() {
    setLoadingStorico(true);
    setErrore(null);
    try {
      const anni = [anno, anno - 1, anno - 2, anno - 3];
      const risultatiPerAnno = await Promise.all(
        anni.map(a => Promise.all(CENTRI.map(c => calcolaDatiQuantitaAnno(a, c))))
      );
      const nuovo = {};
      anni.forEach((a, i) => {
        nuovo[a] = {};
        CENTRI.forEach((c, j) => { nuovo[a][c] = risultatiPerAnno[i][j]; });
      });
      setDatiStorico(nuovo);
    } catch (err) {
      setErrore(err.message);
    }
    setLoadingStorico(false);
  }

  function apriPagina2() {
    setPagina(2);
    if (!datiStorico) calcolaStorico();
  }

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Costi e Quantità — Alimentazione</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Mangimi, Foraggio e Integratori alimentari: quantità (Kg) e costo d'acquisto, totali e ripartiti tra Bovini/Suini/Ovini (quota propria della specie + quota parte dei consumi "Generali", secondo gli UBA-giorni). Clicca su un centro di costo per vederne il dettaglio per prodotto — i prodotti "ORZO" di Mangimi sono sempre accorpati in una riga unica, indipendentemente dal fornitore.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setPagina(1)}
          style={{ background: pagina === 1 ? C.primary : "#fff", color: pagina === 1 ? "#fff" : C.primary, border: `1.5px solid ${C.primary}`, borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Pagina 1 — Anno corrente
        </button>
        <button onClick={apriPagina2}
          style={{ background: pagina === 2 ? C.primary : "#fff", color: pagina === 2 ? "#fff" : C.primary, border: `1.5px solid ${C.primary}`, borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Pagina 2 — Storico
        </button>
      </div>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}

      {pagina === 1 && (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: C.muted }}>Anno:</label>
            <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
              style={{ width: 100, padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
            <button onClick={calcola} disabled={loading}
              style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {loading ? "Calcolo..." : "🔄 Calcola"}
            </button>
          </div>

          {loading && <p style={{ color: C.muted }}>Calcolo in corso — può richiedere qualche secondo...</p>}

          {dati && (
            <div style={{ overflowX: "auto" }}>
              <TabellaCostiQuantita dati={dati} espanso={espanso} setEspanso={setEspanso} />
            </div>
          )}

          {dati && (
            <div style={{ overflowX: "auto", marginTop: 28 }}>
              <h2 style={{ color: C.primary, fontSize: 18, marginBottom: 4 }}>Incidenza per UBA-giorno</h2>
              <p style={{ color: C.muted, marginTop: 0, marginBottom: 12, fontSize: 13 }}>
                Kg e Costo per UBA-giorno di ciascuna specie — indipendente dalla dimensione dell'allevamento, utile per confrontare l'efficienza tra anni o tra prodotti diversi.
              </p>
              <TabellaIncidenza dati={dati} espanso={espansoIncidenza} setEspanso={setEspansoIncidenza} />
            </div>
          )}

          {dati && <SintesiVisiva dati={dati} />}
        </>
      )}

      {pagina === 2 && (
        <>
          {loadingStorico && <p style={{ color: C.muted }}>Calcolo storico in corso — 4 anni × 3 centri di costo, può richiedere qualche secondo in più...</p>}
          {datiStorico && <PaginaStorico datiStorico={datiStorico} anno={anno} />}
        </>
      )}
    </div>
  );
}

function SintesiVisiva({ dati }) {
  const totale = sommaSuiCentri(dati);
  const costoComplessivo = SPECIE.reduce((s, sp) => s + totale.perCosto.perSpecie[sp.chiave].costoAllocato, 0);
  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ color: C.primary, fontSize: 18, marginBottom: 12 }}>Sintesi per specie</h2>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
        {SPECIE.map(s => {
          const costo = totale.perCosto.perSpecie[s.chiave].costoAllocato;
          const kg = totale.perKg.perSpecie[s.chiave].costoAllocato;
          const pct = costoComplessivo > 0 ? round2(costo / costoComplessivo * 100) : 0;
          const uba = totale.ubaGiorniProduttiviPerSpecie[s.chiave];
          return (
            <div key={s.chiave} style={{ background: C.card, border: `1.5px solid ${s.colore}`, borderRadius: 14, padding: 18, width: 190, textAlign: "center" }}>
              <div style={{ fontWeight: 700, color: s.colore, fontSize: 15 }}>{formattaEuro(costo, 0)}</div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{formattaNumero(pct, 1)}% del totale</div>
              <IconaSpecie chiave={s.chiave} colore={s.colore} dimensione={72} />
              <div style={{ fontWeight: 700, fontSize: 15, marginTop: 8 }}>{s.label}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{formattaNumero(incidenza(kg, uba), 2)} Kg/UBA-gg</div>
              <div style={{ fontSize: 12, color: C.muted }}>{formattaEuro(incidenza(costo, uba), 3)}/UBA-gg</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PaginaStorico({ datiStorico, anno }) {
  const anni = [anno, anno - 1, anno - 2, anno - 3];
  const righeAnni = anni.map(a => ({ anno: a, totale: sommaSuiCentri(datiStorico[a]) }));

  const media = { perCosto: { perSpecie: {} }, perKg: { perSpecie: {} }, ubaGiorniProduttiviPerSpecie: {} };
  for (const sp of ["bovino", "suino", "ovino"]) {
    media.perCosto.perSpecie[sp] = { costoAllocato: round2(righeAnni.reduce((s, r) => s + r.totale.perCosto.perSpecie[sp].costoAllocato, 0) / righeAnni.length) };
    media.perKg.perSpecie[sp] = { costoAllocato: round2(righeAnni.reduce((s, r) => s + r.totale.perKg.perSpecie[sp].costoAllocato, 0) / righeAnni.length) };
    media.ubaGiorniProduttiviPerSpecie[sp] = round2(righeAnni.reduce((s, r) => s + (r.totale.ubaGiorniProduttiviPerSpecie[sp] || 0), 0) / righeAnni.length);
  }

  const serieCosti = [
    { nome: "Totale", colore: C.primary, punti: righeAnni.map(r => ({ anno: r.anno, valore: SPECIE.reduce((s, sp) => s + r.totale.perCosto.perSpecie[sp.chiave].costoAllocato, 0) })) },
    ...SPECIE.map(sp => ({ nome: sp.label, colore: sp.colore, punti: righeAnni.map(r => ({ anno: r.anno, valore: r.totale.perCosto.perSpecie[sp.chiave].costoAllocato })) })),
  ];
  const serieEuroUba = SPECIE.map(sp => ({
    nome: sp.label, colore: sp.colore,
    punti: righeAnni.map(r => ({ anno: r.anno, valore: incidenza(r.totale.perCosto.perSpecie[sp.chiave].costoAllocato, r.totale.ubaGiorniProduttiviPerSpecie[sp.chiave]) })),
  }));
  const serieKgUba = SPECIE.map(sp => ({
    nome: sp.label, colore: sp.colore,
    punti: righeAnni.map(r => ({ anno: r.anno, valore: incidenza(r.totale.perKg.perSpecie[sp.chiave].costoAllocato, r.totale.ubaGiorniProduttiviPerSpecie[sp.chiave]) })),
  }));

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <TabellaStoricoCostiQuantita righeAnni={righeAnni} media={media} />
      </div>
      <div style={{ overflowX: "auto", marginTop: 28 }}>
        <h2 style={{ color: C.primary, fontSize: 18, marginBottom: 12 }}>Incidenza per UBA-giorno — storico</h2>
        <TabellaStoricoIncidenza righeAnni={righeAnni} media={media} />
      </div>

      <div style={{ marginTop: 32 }}>
        <h2 style={{ color: C.primary, fontSize: 18, marginBottom: 4 }}>Andamento costi nel tempo</h2>
        <p style={{ color: C.muted, marginTop: 0, marginBottom: 12, fontSize: 13 }}>Totale (Mangimi+Foraggio+Integratori) e per specie — variazione % anno su anno sulla linea del Totale.</p>
        <GraficoMultiLinea serie={serieCosti} decimaliValore={0} mostraVariazione />
      </div>
      <div style={{ marginTop: 32 }}>
        <h2 style={{ color: C.primary, fontSize: 18, marginBottom: 12 }}>Andamento €/UBA-gg nel tempo</h2>
        <GraficoMultiLinea serie={serieEuroUba} decimaliValore={3} />
      </div>
      <div style={{ marginTop: 32 }}>
        <h2 style={{ color: C.primary, fontSize: 18, marginBottom: 12 }}>Andamento Kg/UBA-gg nel tempo</h2>
        <GraficoMultiLinea serie={serieKgUba} decimaliValore={2} />
      </div>
    </div>
  );
}

function TabellaStoricoCostiQuantita({ righeAnni, media }) {
  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", minWidth: 1000 }}>
      <thead>
        <tr>
          <th rowSpan={2} style={{ ...thBase, background: C.primary, verticalAlign: "bottom" }}>Anno</th>
          {SPECIE.map(s => <th key={s.chiave} colSpan={2} style={{ ...thBase, background: s.colore }}>{s.label}</th>)}
        </tr>
        <tr>
          {SPECIE.map(s => (
            <Fragment key={s.chiave}>
              <th style={{ ...thSub, background: s.colore + "cc" }}>Kg</th>
              <th style={{ ...thSub, background: s.colore + "cc" }}>Costo</th>
            </Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {righeAnni.map(r => (
          <tr key={r.anno} style={{ borderTop: `1px solid ${C.border}` }}>
            <td style={{ ...tdBase, fontWeight: 700 }}>{r.anno}</td>
            {SPECIE.map(s => (
              <Fragment key={s.chiave}>
                <td style={{ ...tdBase, color: s.colore }}>{formattaNumero(r.totale.perKg.perSpecie[s.chiave].costoAllocato, 0)}</td>
                <td style={{ ...tdBase, color: s.colore }}>{formattaEuro(r.totale.perCosto.perSpecie[s.chiave].costoAllocato)}</td>
              </Fragment>
            ))}
          </tr>
        ))}
        <tr style={{ borderTop: `2px solid ${C.border}`, fontWeight: 700, background: C.bg }}>
          <td style={tdBase}>Media</td>
          {SPECIE.map(s => (
            <Fragment key={s.chiave}>
              <td style={{ ...tdBase, color: s.colore }}>{formattaNumero(media.perKg.perSpecie[s.chiave].costoAllocato, 0)}</td>
              <td style={{ ...tdBase, color: s.colore }}>{formattaEuro(media.perCosto.perSpecie[s.chiave].costoAllocato)}</td>
            </Fragment>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function TabellaStoricoIncidenza({ righeAnni, media }) {
  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", minWidth: 900 }}>
      <thead>
        <tr>
          <th rowSpan={2} style={{ ...thBase, background: C.primary, verticalAlign: "bottom" }}>Anno</th>
          {SPECIE.map(s => <th key={s.chiave} colSpan={2} style={{ ...thBase, background: s.colore }}>{s.label}</th>)}
        </tr>
        <tr>
          {SPECIE.map(s => (
            <Fragment key={s.chiave}>
              <th style={{ ...thSub, background: s.colore + "cc" }}>Kg/UBA-gg</th>
              <th style={{ ...thSub, background: s.colore + "cc" }}>€/UBA-gg</th>
            </Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {righeAnni.map(r => (
          <tr key={r.anno} style={{ borderTop: `1px solid ${C.border}` }}>
            <td style={{ ...tdBase, fontWeight: 700 }}>{r.anno}</td>
            {SPECIE.map(s => (
              <Fragment key={s.chiave}>
                <td style={{ ...tdBase, color: s.colore }}>{formattaNumero(incidenza(r.totale.perKg.perSpecie[s.chiave].costoAllocato, r.totale.ubaGiorniProduttiviPerSpecie[s.chiave]), 2)}</td>
                <td style={{ ...tdBase, color: s.colore }}>{formattaEuro(incidenza(r.totale.perCosto.perSpecie[s.chiave].costoAllocato, r.totale.ubaGiorniProduttiviPerSpecie[s.chiave]), 3)}</td>
              </Fragment>
            ))}
          </tr>
        ))}
        <tr style={{ borderTop: `2px solid ${C.border}`, fontWeight: 700, background: C.bg }}>
          <td style={tdBase}>Media</td>
          {SPECIE.map(s => (
            <Fragment key={s.chiave}>
              <td style={{ ...tdBase, color: s.colore }}>{formattaNumero(incidenza(media.perKg.perSpecie[s.chiave].costoAllocato, media.ubaGiorniProduttiviPerSpecie[s.chiave]), 2)}</td>
              <td style={{ ...tdBase, color: s.colore }}>{formattaEuro(incidenza(media.perCosto.perSpecie[s.chiave].costoAllocato, media.ubaGiorniProduttiviPerSpecie[s.chiave]), 3)}</td>
            </Fragment>
          ))}
        </tr>
      </tbody>
    </table>
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

function TabellaIncidenza({ dati, espanso, setEspanso }) {
  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", minWidth: 900 }}>
      <thead>
        <tr>
          <th rowSpan={2} style={{ ...thBase, background: C.primary, verticalAlign: "bottom" }}>Centro di Costo</th>
          {SPECIE.map(s => <th key={s.chiave} colSpan={2} style={{ ...thBase, background: s.colore }}>{s.label}</th>)}
        </tr>
        <tr>
          {SPECIE.map(s => (
            <Fragment key={s.chiave}>
              <th style={{ ...thSub, background: s.colore + "cc" }}>Kg/UBA-gg</th>
              <th style={{ ...thSub, background: s.colore + "cc" }}>€/UBA-gg</th>
            </Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {CENTRI.map(centro => {
          const d = dati[centro];
          const uba = d.ubaGiorniProduttiviPerSpecie || {};
          const agg = aggregaCentro(d.perProdotto || []);
          const perProdottoVisualizzato = centro === "Mangimi" ? accorpaOrzo(d.perProdotto || []) : (d.perProdotto || []);
          return (
            <Fragment key={centro}>
              <tr onClick={() => setEspanso(espanso === centro ? null : centro)}
                style={{ cursor: "pointer", background: espanso === centro ? C.bg : "#fff", borderTop: `2px solid ${C.border}` }}>
                <td style={{ ...tdBase, fontWeight: 700 }}>{espanso === centro ? "▼" : "▶"} {centro}</td>
                {SPECIE.map(s => (
                  <Fragment key={s.chiave}>
                    <td style={{ ...tdBase, color: s.colore, fontWeight: 700 }}>{formattaNumero(incidenza(agg.perKg.perSpecie[s.chiave].costoAllocato, uba[s.chiave]), 3)}</td>
                    <td style={{ ...tdBase, color: s.colore, fontWeight: 700 }}>{formattaEuro(incidenza(agg.perCosto.perSpecie[s.chiave].costoAllocato, uba[s.chiave]), 3)}</td>
                  </Fragment>
                ))}
              </tr>
              {espanso === centro && perProdottoVisualizzato.map((p, i) => (
                <tr key={i} style={{ background: "#FAFAF8" }}>
                  <td style={{ ...tdBase, paddingLeft: 32, fontSize: 12, color: C.muted }}>{p.descrizione}</td>
                  {SPECIE.map(s => (
                    <Fragment key={s.chiave}>
                      <td style={{ ...tdBase, fontSize: 12, color: s.colore }}>{formattaNumero(incidenza(p.perKg.perSpecie[s.chiave].costoAllocato, uba[s.chiave]), 3)}</td>
                      <td style={{ ...tdBase, fontSize: 12, color: s.colore }}>{formattaEuro(incidenza(p.perCosto.perSpecie[s.chiave].costoAllocato, uba[s.chiave]), 3)}</td>
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
