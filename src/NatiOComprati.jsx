// Versione 314 — pagina 6 dell'Analisi Break Even: «Nati o comprati» (stato attuale contro ipotesi).
// Approccio differenziale deciso il 27/10/2026: conviene comprare se il prezzo d'acquisto è sotto il prezzo di
// indifferenza = costo variabile di un nato vendibile + costi fissi evitabili della mandria ÷ nati vendibili all'anno.
// I risultati si leggono a regime (cambiare la mandria richiede tempo). Sola lettura.
import { useState } from "react";
import { C } from "./style";
import { calcolaPareggio, leggiNumero } from "./analisiBreakEven";
import { impostaStruttura } from "./statoBreakEven";
import { usaPaginaBreakEven, Intestazione, Titolo, Avviso, Dato, Schede, riquadro, th, td, sx, euro, numero, perc, NOMI, COLORE, NotaRisultato } from "./ComuniBreakEven";

const TEMPI = {
  bovino: "Una manza partorisce la prima volta a 27–30 mesi e il vitello va al macello dopo altri 16 mesi circa: i cambiamenti della mandria si vedono nelle vendite dopo circa 2 anni.",
  suino: "Una scrofetta partorisce la prima volta verso i 12 mesi e il suino va al macello dopo circa 11 mesi: i cambiamenti si vedono nelle vendite dopo circa un anno.",
  ovino: "Un'agnella partorisce la prima volta verso i 12–18 mesi: i cambiamenti si vedono nelle vendite dopo circa un anno e mezzo.",
};

export default function NatiOComprati({ onNavigate }) {
  const { s, calc } = usaPaginaBreakEven();
  const [scheda, setScheda] = useState("bovino");
  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <Intestazione s={s} onNavigate={onNavigate} titolo="🐄 Nati o comprati"
        sottotitolo="Lo stato attuale dell'allevamento a confronto con le ipotesi: tutti i capi nati in azienda, tutti comprati, o una via di mezzo. Conviene comprare solo se il prezzo d'acquisto sta sotto il prezzo di indifferenza." />
      {calc && <>
        <Schede attiva={scheda} scegli={setScheda} voci={["bovino", "suino", "ovino"].map(sp => [sp, NOMI[sp], COLORE[sp]])} />
        <Specie s={s} calc={calc} specie={scheda} />
      </>}
    </div>
  );
}

function Specie({ s, calc, specie }) {
  const x = calc.perSpecie[specie];
  const { L, R, T, C: Cs } = x;
  const chiave = `evitabili_${specie}`, chiaveIbrido = `ibrido_${specie}`;
  const stima = Cs.ubaProduttivi > 0 ? Cs.fissiPropri * Cs.ubaRiproduttori / Cs.ubaProduttivi : 0;
  const evitabili = leggiNumero(s.strutture[chiave]) ?? stima;
  const ibrido = leggiNumero(s.strutture[chiaveIbrido]) ?? 50;
  const q0 = L.quotaNati ?? 0;
  const natiAnno = T.madriAnno > 0 && R.natiVendibiliPerMadre > 0 ? T.madriAnno * R.natiVendibiliPerMadre * 365 / ((new Date(calc.P.a) - new Date(calc.P.da)) / 86400000 + 1) : null;
  const indifferenza = R.costoPerNato !== null && natiAnno > 0 ? R.costoPerNato + evitabili / natiAnno : null;
  const scenari = [
    ["Stato attuale", q0], ["Tutti nati in azienda", 100], ["Via di mezzo", ibrido], ["Tutti comprati", 0],
  ].map(([nome, q]) => {
    const fattore = q0 > 0 ? q / q0 : (q > 0 ? 1 : 0);
    const C2 = { ...Cs, fissi: Math.max(Cs.fissi - evitabili * (1 - fattore), 0) };
    const y = calcolaPareggio({ L: { ...L, quotaNati: q }, C: C2, T: x.T, K: x.K, Q: x.Q });
    return { nome, q, y };
  });
  const Casella = (k, v, l, nota) => (
    <label style={{ fontSize: 12, fontWeight: 700 }}>{l}
      <input type="text" inputMode="decimal" value={s.strutture[k] !== undefined ? s.strutture[k] : String(Math.round(v * 100) / 100).replace(".", ",")} onChange={e => impostaStruttura(k, e.target.value)}
        style={{ display: "block", marginTop: 4, padding: "6px 9px", borderRadius: 6, border: `1.5px solid ${s.strutture[k] !== undefined ? C.blue : C.border}`, fontSize: 14, fontWeight: 700, width: 130 }} />
      <span style={{ fontWeight: 400, color: C.muted, fontSize: 11 }}>{nota}</span>
    </label>);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={riquadro}>
        <Titolo sotto="Il costo variabile del nato viene dai coefficienti della mandria (pagina Break Even: interparto, nati per parto, mortalità); i costi fissi evitabili sono quelli che sparirebbero senza madri.">Il prezzo di indifferenza</Titolo>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, fontSize: 13 }}>
          <Dato l="Costo variabile di un nato vendibile" v={euro(R.costoPerNato)} nota={`${euro(R.costoMandriaPerMadre, 0)} per madre all'anno ÷ ${numero(R.natiVendibiliPerMadre, 2)} nati vendibili`} />
          {Casella(chiave, evitabili, "Costi fissi evitabili della mandria (€ all'anno)", `stima prudente di partenza ${euro(stima, 0)}: solo i costi fissi propri della specie, in proporzione agli UBA dei riproduttori. I costi comuni (lavoro, consulenze, ammortamenti generali) non spariscono: passerebbero sugli altri capi. Scrivete i costi che sparirebbero davvero.`)}
          <Dato l="Nati vendibili all'anno" v={numero(natiAnno, 1)} />
          <Dato l="PREZZO D'ACQUISTO DI INDIFFERENZA" v={euro(indifferenza)} forte colore={C.primary} nota="costo variabile del nato + costi fissi evitabili ÷ nati all'anno" />
          <Dato l="Prezzo d'acquisto scritto nel Break Even" v={euro(L.acquisto)} colore={L.acquisto > 0 && indifferenza !== null ? (L.acquisto < indifferenza ? C.green : C.red) : C.text}
            nota={L.acquisto > 0 && indifferenza !== null ? (L.acquisto < indifferenza ? "sotto l'indifferenza: comprare costa meno che far nascere" : "sopra l'indifferenza: far nascere costa meno che comprare") : "nessun capo comprato"} />
        </div>
      </div>
      <div style={riquadro}>
        <Titolo sotto={`Stessa produzione del periodo (${numero(R.prod)} capi) e stessi prezzi. I costi fissi evitabili diminuiscono (o crescono) in proporzione alle madri. ${TEMPI[specie]}`}>Gli scenari</Titolo>
        <div style={{ marginBottom: 10 }}>{Casella(chiaveIbrido, ibrido, "Via di mezzo: capi nati in azienda (%)", `oggi ${numero(q0, 0)}%`)}</div>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr><th style={{ ...th, ...sx }}>Scenario</th><th style={th}>Nati in azienda</th><th style={th}>Costo variabile di un capo</th><th style={th}>Costi fissi</th><th style={th}>Margine per capo</th><th style={th}>Capi di pareggio</th><th style={th}>Madri necessarie</th><th style={th}>Risultato con la produzione</th></tr></thead>
          <tbody>{scenari.map(({ nome, q, y }) => (
            <tr key={nome} style={{ fontWeight: nome === "Stato attuale" ? 800 : 400 }}>
              <td style={{ ...td, ...sx }}>{nome}</td><td style={td}>{perc(q, 0)}</td><td style={td}>{euro(y.costoVariabile)}</td><td style={td}>{euro(y.fissi, 0)}</td>
              <td style={{ ...td, color: y.margine > 0 ? C.text : C.red }}>{euro(y.margine)}</td><td style={td}>{y.capi === null ? "irraggiungibile" : y.prod > 0 && y.capi > y.prod * 3 ? <span title="più di 3 volte la produzione del periodo">fuori portata ({numero(y.capi)})</span> : numero(y.capi)}</td>
              <td style={td}>{y.prod && y.natiVendibiliPerMadre > 0 ? numero(y.prod * q / 100 / y.natiVendibiliPerMadre, 0) : q > 0 ? "—" : "0"}</td>
              <td style={{ ...td, color: (y.risultato ?? 0) >= 0 ? C.green : C.red, fontWeight: 700 }}>{euro(y.risultato, 0)}</td></tr>))}
          </tbody>
        </table>
        <NotaRisultato />
      </div>
      <Avviso tipo="blu">ℹ️ Il passaggio da uno scenario all'altro non è immediato: vendere le madri porta un incasso una volta sola (valore di riforma), comprarle o tenerne di più richiede capitale e tempo. Questa pagina confronta le situazioni a regime; la mortalità e la prolificità delle madri si cambiano nella pagina Break Even.</Avviso>
    </div>
  );
}
