// Versione 314 — pagina 5 dell'Analisi Break Even: «Strutture necessarie» (decisione del 27/10/2026 ore 12:32).
// prezzo → capi di pareggio → capi in stalla per categoria → superfici coperte e aperte, rastrelliere, abbeveratoi,
// foraggio → confronto con l'esistente → mancanze (gradino dei costi fissi). Sola lettura.
import { C } from "./style";
import { SPECIE } from "./analisiBreakEven";
import { impostaStruttura, ripristinaStrutture } from "./statoBreakEven";
import { FONTI, PARAMETRI_PARTENZA, UBA_CAPO, INVENTARIO_BOVINI, PASCOLI_BOVINI, esistenteBovini, m2BovinoIngrasso, m2SuinoIngrasso, fienoDelPeriodo } from "./struttureBreakEven";
import { usaPaginaBreakEven, Intestazione, Titolo, Avviso, riquadro, th, td, sx, bottone, euro, numero, NOMI, COLORE } from "./ComuniBreakEven";
import { leggiNumero } from "./analisiBreakEven";

export default function StruttureNecessarie({ onNavigate }) {
  const { s, calc } = usaPaginaBreakEven();
  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <Intestazione s={s} onNavigate={onNavigate} titolo="🏠 Strutture necessarie"
        sottotitolo="Al cambiare del prezzo nella pagina Break Even cambiano i capi di pareggio: qui si vede quanto spazio coperto e aperto, quante rastrelliere, abbeveratoi e quanto fieno servono a quei capi, rispetto a quello che l'azienda ha. Dove non basta, i costi fissi salgono a gradino." />
      {calc && <Contenuto s={s} calc={calc} />}
    </div>
  );
}

function Contenuto({ s, calc }) {
  const par = k => { const v = leggiNumero(s.strutture[k]); return v !== null ? v : null; };
  const valore = (k, partenza) => (par(k) !== null ? par(k) : partenza);
  const casella = ({ k, partenza, l, nota }) => (
    <label key={k} style={{ fontSize: 12, fontWeight: 700 }}>{l}
      <input type="text" inputMode="decimal" value={s.strutture[k] !== undefined ? s.strutture[k] : (partenza === null || partenza === undefined ? "" : String(partenza).replace(".", ","))} placeholder="da definire"
        onChange={e => impostaStruttura(k, e.target.value)}
        style={{ display: "block", marginTop: 4, padding: "5px 8px", borderRadius: 6, border: `1.5px solid ${s.strutture[k] !== undefined ? C.blue : C.border}`, fontSize: 13.5, fontWeight: 700, width: 110 }} />
      {nota && <span style={{ fontWeight: 400, color: C.muted, fontSize: 11 }}>{nota}</span>}
    </label>);

  const b = calc.perSpecie.bovino, su = calc.perSpecie.suino, o = calc.perSpecie.ovino;
  const es = esistenteBovini();
  const pesoMedioBov = valore("pesoMedioBovini", b.R.pesoVivo ? Math.round((PARAMETRI_PARTENZA.bovino.pesoSvezzamento + b.R.pesoVivo) / 2) : null);
  const pesoMedioSui = valore("pesoMedioSuini", su.R.pesoVivo ? Math.round(su.R.pesoVivo / 2) : null);
  const m2Bov = valore("m2BovIngrasso", m2BovinoIngrasso(pesoMedioBov));
  const m2Sui = valore("m2SuiIngrasso", m2SuinoIngrasso(pesoMedioSui));
  const capiPerRastrelliera = par("capiPerRastrelliera"), capiPerAbbeveratoio = par("capiPerAbbeveratoio");
  const fienoUba = valore("fienoUba", PARAMETRI_PARTENZA.fienoPerUbaGiorno), pesoBallone = valore("pesoBallone", PARAMETRI_PARTENZA.pesoBallone);

  // capi: oggi (presenti) e per il pareggio
  const oggi = sp => ({ madri: calc.perSpecie[sp].T.madriMedie, tori: calc.perSpecie[sp].T.toriMedi, ingrasso: calc.perSpecie[sp].Q.presentiFine });
  const pareggio = sp => { const R = calc.perSpecie[sp].R; const ok = R.stalla && !(R.prod > 0 && R.capi > R.prod * 3); return ok ? R.stalla : null; };
  const colonne = [["oggi", "Capi presenti oggi"], ["pareggio", "Capi del pareggio"]];
  const capi = { oggi: Object.fromEntries(SPECIE.map(sp => [sp, oggi(sp)])), pareggio: Object.fromEntries(SPECIE.map(sp => [sp, pareggio(sp)])) };

  const righeBovini = [
    { v: "Superficie coperta per le madri e i tori (m²)", nec: c => c && c.madri * PARAMETRI_PARTENZA.bovino.madri + c.tori * PARAMETRI_PARTENZA.bovino.tori, es: es.riproduttori.coperta, fonte: `vacca 7 m², toro 10 m² — ${FONTI.ricovero}` },
    { v: "Superficie coperta per i capi all'ingrasso (m²)", nec: c => c && m2Bov && c.ingrasso * m2Bov, es: es.ingrasso.coperta, fonte: `${numero(m2Bov, 1)} m² a capo per un peso medio di ${numero(pesoMedioBov)} kg — ${FONTI.ricovero}` },
    { v: "Rastrelliere porta balloni", nec: c => c && capiPerRastrelliera && Math.ceil((c.madri + c.tori + c.ingrasso) / capiPerRastrelliera), es: es.riproduttori.rastrelliere + es.ingrasso.rastrelliere, fonte: capiPerRastrelliera ? `${capiPerRastrelliera} capi per rastrelliera (scritto)` : "capi per rastrelliera: da definire" },
    { v: "Abbeveratoi", nec: c => c && capiPerAbbeveratoio && Math.ceil((c.madri + c.tori + c.ingrasso) / capiPerAbbeveratoio), es: es.riproduttori.abbeveratoi + es.ingrasso.abbeveratoi, fonte: capiPerAbbeveratoio ? `${capiPerAbbeveratoio} capi per abbeveratoio (scritto)` : `capi per abbeveratoio: da definire; mancano gli abbeveratoi dei box 1–5` },
    { v: "Spazio aperto dei paddock (m²)", nec: () => null, es: es.riproduttori.aperta + es.ingrasso.aperta, fonte: "parametro per capo da definire" },
    { v: "Pascoli (ettari)", nec: () => null, es: es.pascoli, dec: 2, fonte: PASCOLI_BOVINI.map(p => `${p.nome} ${numero(p.ettari, 2)}`).join(" · ") },
  ];
  const righeSuini = [
    { v: "Superficie per scrofe e verri (m²)", nec: c => c && c.madri * PARAMETRI_PARTENZA.suino.madri + c.tori * PARAMETRI_PARTENZA.suino.tori, es: null, fonte: `scrofa 2,25 m² (${FONTI.suini}), verro 6 m² (${FONTI.ricovero})` },
    { v: "Superficie per i suini all'ingrasso (m²)", nec: c => c && m2Sui && c.ingrasso * m2Sui, es: null, fonte: `${numero(m2Sui, 2)} m² a capo per un peso medio di ${numero(pesoMedioSui)} kg — ${FONTI.suini}` },
  ];
  const righeOvini = [
    { v: "Superficie coperta per pecore e arieti (m²)", nec: c => c && c.madri * PARAMETRI_PARTENZA.ovino.madri + c.tori * PARAMETRI_PARTENZA.ovino.tori, es: null, fonte: `pecora 1,7 m², ariete 2,2 m² — ${FONTI.ricovero}` },
    { v: "Superficie coperta per gli agnelli (m²)", nec: c => c && c.ingrasso * PARAMETRI_PARTENZA.ovino.agnelli, es: null, fonte: `agnello 0,5 m² — ${FONTI.ricovero}` },
  ];

  // foraggio
  const fieno = fienoDelPeriodo(s.A, calc.P, s.A.raccolte, s.A.colture);
  const ubaFieno = c => c ? (c.bovino ? c.bovino.madri * UBA_CAPO.bovino.madri + c.bovino.tori * UBA_CAPO.bovino.tori + c.bovino.ingrasso * UBA_CAPO.bovino.ingrasso : 0)
    + (c.ovino ? c.ovino.madri * UBA_CAPO.ovino.madri + c.ovino.tori * UBA_CAPO.ovino.tori + c.ovino.ingrasso * UBA_CAPO.ovino.ingrasso : 0) : null;
  const balloniNecessari = u => (u !== null && fienoUba > 0 && pesoBallone > 0 ? u * fienoUba * 365 / pesoBallone : null);

  const Tabella = ({ sp, righe, nota }) => (
    <div style={riquadro}>
      <Titolo sotto={nota}><span style={{ color: COLORE[sp] }}>{NOMI[sp]}</span></Titolo>
      <table style={{ fontSize: 12.5 }}>
        <thead><tr><th style={{ ...th, ...sx }}>Voce</th>{colonne.map(([k, l]) => <th key={k} style={th}>{l}: necessario</th>)}<th style={th}>Esistente</th><th style={th}>Differenza oggi</th><th style={th}>Differenza col pareggio</th><th style={{ ...th, ...sx }}>Parametro e fonte</th></tr></thead>
        <tbody>
          <tr><td style={{ ...td, ...sx, color: C.muted }}>Capi (madri · maschi · all'ingrasso)</td>{colonne.map(([k]) => { const c = capi[k][sp]; return <td key={k} style={{ ...td, color: C.muted }}>{c ? `${numero(c.madri, 0)} · ${numero(c.tori, 0)} · ${numero(c.ingrasso, 0)}` : (() => { const R = calc.perSpecie[sp].R; return R.capi === null ? "pareggio irraggiungibile: il margine per capo non è positivo" : `pareggio fuori portata: ${numero(R.capi)} capi, più di 3 volte la produzione`; })()}</td>; })}<td style={td} /><td style={td} /><td style={td} /><td style={td} /></tr>
          {righe.map(r => {
            const n0 = r.nec(capi.oggi[sp]), n1 = r.nec(capi.pareggio[sp]);
            const differenza = n => (n !== null && n !== undefined && n !== false && r.es !== null ? r.es - n : null);
            const cella = d => <td style={{ ...td, fontWeight: 700, color: d === null ? C.muted : d >= 0 ? C.green : C.red }}>{d === null ? "—" : d >= 0 ? `basta (+${numero(d, 0)})` : `manca ${numero(-d, 0)}`}</td>;
            return (<tr key={r.v}><td style={{ ...td, ...sx }}>{r.v}</td><td style={td}>{numero(n0, 0)}</td><td style={td}>{numero(n1, 0)}</td>
              <td style={td}>{r.es === null ? "da scheda di rilevazione" : numero(r.es, r.dec ?? 0)}</td>
              {cella(differenza(n0))}{cella(differenza(n1))}
              <td style={{ ...td, ...sx, fontSize: 11.5, color: C.muted }}>{r.fonte}</td></tr>);
          })}
        </tbody>
      </table>
    </div>);

  const uOggi = ubaFieno(capi.oggi), uPar = ubaFieno(capi.pareggio.bovino || capi.pareggio.ovino ? capi.pareggio : null);
  const disponibili = fieno.balloniProdotti + fieno.balloniComprati;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={riquadro}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <Titolo sotto="I parametri con la fonte si possono correggere; quelli «da definire» vanno scritti per avere il confronto.">Parametri</Titolo>
          <button onClick={ripristinaStrutture} style={bottone}>Ripristina i parametri</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {casella({ k: "pesoMedioBovini", partenza: pesoMedioBov, l: "Peso medio dei bovini all'ingrasso (kg)", nota: "tra lo svezzamento (200 kg) e il peso vivo finale del capo tipo",  })}
          {casella({ k: "m2BovIngrasso", partenza: m2Bov, l: "m² coperti per bovino all'ingrasso",  })}
          {casella({ k: "pesoMedioSuini", partenza: pesoMedioSui, l: "Peso medio dei suini all'ingrasso (kg)", nota: "metà del peso vivo finale",  })}
          {casella({ k: "m2SuiIngrasso", partenza: m2Sui, l: "m² per suino all'ingrasso",  })}
          {casella({ k: "capiPerRastrelliera", partenza: null, l: "Capi per rastrelliera",  })}
          {casella({ k: "capiPerAbbeveratoio", partenza: null, l: "Capi per abbeveratoio",  })}
          {casella({ k: "fienoUba", partenza: fienoUba, l: "Fieno per UBA al giorno (kg)", nota: "vacca asciutta, razione del 16/10/2026" })}
          {casella({ k: "pesoBallone", partenza: pesoBallone, l: "Peso di un ballone (kg)",  })}
        </div>
      </div>
      <Tabella sp="bovino" righe={righeBovini} nota={`Esistente dai dati del 16/10/2026: ${INVENTARIO_BOVINI.filter(x => x.gruppo !== "servizio").length} ambienti per madri, tori e ingrasso; sale parto, nursery, infermeria e incastrino non contati.`} />
      <Tabella sp="suino" righe={righeSuini} nota="Esistente: dalla Scheda di rilevazione delle strutture, da compilare." />
      <Tabella sp="ovino" righe={righeOvini} nota="Esistente: dalla Scheda di rilevazione delle strutture, da compilare. Gli agnelli all'ingrasso dipendono dai mesi in azienda scritti nel Break Even." />
      <div style={riquadro}>
        <Titolo sotto={`Fieno disponibile: prodotto in azienda nella campagna ${fieno.campagna} (${Object.entries(fieno.perProdotto).map(([k, v]) => `${k.toLowerCase()} ${numero(v)}`).join(", ") || "nessuna raccolta registrata"}) + rotoballe comprate nel periodo. Bovini e ovini.`}>Foraggio: fieno necessario e fieno disponibile</Titolo>
        <table style={{ fontSize: 12.5, width: "auto" }}>
          <thead><tr><th style={{ ...th, ...sx }}>Voce</th><th style={th}>Oggi</th><th style={th}>Per il pareggio</th></tr></thead>
          <tbody>
            <tr><td style={{ ...td, ...sx }}>UBA da nutrire con il fieno</td><td style={td}>{numero(uOggi, 1)}</td><td style={td}>{numero(uPar, 1)}</td></tr>
            <tr><td style={{ ...td, ...sx }}>Balloni di fieno necessari in un anno</td><td style={td}>{numero(balloniNecessari(uOggi), 0)}</td><td style={td}>{numero(balloniNecessari(uPar), 0)}</td></tr>
            <tr><td style={{ ...td, ...sx }}>Balloni disponibili (prodotti {numero(fieno.balloniProdotti)} + comprati {numero(fieno.balloniComprati)})</td><td style={td}>{numero(disponibili)}</td><td style={td}>{numero(disponibili)}</td></tr>
            <tr style={{ fontWeight: 700 }}><td style={{ ...td, ...sx }}>Differenza</td>
              {[uOggi, uPar].map((u, i) => { const n = balloniNecessari(u); const d = n === null ? null : disponibili - n; return <td key={i} style={{ ...td, color: d === null ? C.muted : d >= 0 ? C.green : C.red }}>{d === null ? "—" : d >= 0 ? `avanzano ${numero(d, 0)}` : `mancano ${numero(-d, 0)}`}</td>; })}</tr>
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>UBA: vacca e toro 1, bovino all'ingrasso 0,70, pecora e ariete 0,15, agnello 0,027 (coefficienti del programma). Il fieno comprato manca dove la terra non basta: è un costo variabile in più per ogni capo oltre la capacità della terra.</div>
      </div>
      <Avviso tipo="blu">ℹ️ Quando la Scheda di rilevazione delle strutture sarà compilata, i dati di suini, ovini, abbeveratoi e mangiatoie entreranno nella colonna «Esistente».</Avviso>
    </div>
  );
}
