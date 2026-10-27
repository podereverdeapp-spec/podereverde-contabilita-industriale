// Versione 314 — pagina 3 dell'Analisi Break Even: «Fotografia dei dati».
// Tutto ciò su cui si basa il pareggio, per il periodo e lo scenario scelti: costi fissi e variabili per specie
// (propri e comuni), volumi, coefficienti tecnici della mandria, capo tipo, dati incerti. Sola lettura.
import { C } from "./style";
import { SPECIE, costiPeriodo, suiniLottoAnomali } from "./analisiBreakEven";
import { calcoloCorrente } from "./statoBreakEven";
import { usaPaginaBreakEven, Intestazione, Titolo, Avviso, riquadro, th, td, sx, euro, numero, perc, data, NOMI, COLORE } from "./ComuniBreakEven";

export default function FotografiaDati({ onNavigate }) {
  const { s, calc } = usaPaginaBreakEven();
  const altro = s.A && calc ? calcoloCorrente(s, s.scenario === "base" ? "con" : "base") : null;
  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <Intestazione s={s} onNavigate={onNavigate} titolo="📋 Fotografia dei dati"
        sottotitolo="Tutto ciò su cui si basa il Break Even, per il periodo e lo scenario scelti: costi fissi e variabili di ogni specie, volumi prodotti, coefficienti della mandria, capo tipo e dati ancora da verificare." />
      {calc && <Contenuto s={s} calc={calc} altro={altro} />}
    </div>
  );
}

function Contenuto({ s, calc, altro }) {
  const { P, perSpecie } = calc;
  const costi = costiPeriodo(s.A, P, calc.scenario);
  const righe = (l, f, d = 2, tipo = "euro") => SPECIE.map(sp => { const v = f(perSpecie[sp]); return tipo === "euro" ? euro(v, d) : tipo === "perc" ? perc(v, d) : numero(v, d); });
  const Riga = ({ l, valori, forte, nota }) => (
    <tr style={{ fontWeight: forte ? 800 : 400 }}><td style={{ ...td, ...sx }}>{l}{nota && <div style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>{nota}</div>}</td>{valori.map((v, i) => <td key={i} style={td}>{v}</td>)}</tr>);
  const Testa = ({ prima = "Voce" }) => <thead><tr><th style={{ ...th, ...sx }}>{prima}</th>{SPECIE.map(sp => <th key={sp} style={{ ...th, color: COLORE[sp] }}>{NOMI[sp]}</th>)}</tr></thead>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={riquadro}>
        <Titolo sotto={`Dal ${data(P.da)} al ${data(P.a)}. Ripartiti tra le specie come nel Report Costi (giorni di presenza pesati). Spese di macello e lavorazione escluse: ${euro(costi.lavorazioniEscluse)}. Costi di cavalli, pollame e orto esclusi: ${euro(costi.fuori.totale)}.`}>1. Costi del periodo</Titolo>
        <table style={{ fontSize: 13 }}>
          <Testa />
          <tbody>
            <Riga l="Costi fissi" valori={righe("f", x => x.C.fissi)} forte />
            <Riga l="— di cui propri della specie" nota="fatture e ammortamenti intestati solo a quella specie" valori={righe("f", x => x.C.fissiPropri)} />
            <Riga l="— di cui comuni, ripartiti" nota="lavoro, consulenze, assicurazioni, ammortamenti generali…" valori={righe("f", x => x.C.fissiComuni)} />
            <Riga l="— di cui ammortamenti" nota="non sono uscite di cassa: si tolgono nel pareggio di cassa" valori={righe("f", x => x.C.ammortamenti)} />
            <Riga l="Costi variabili" valori={righe("v", x => x.C.variabili)} forte />
            <Riga l="UBA medie presenti" nota="giorni di presenza pesati ÷ giorni del periodo" valori={righe("u", x => x.C.ubaMedie, 1, "numero")} />
            <Riga l="Costo variabile per UBA al giorno" valori={righe("t", x => x.C.tassoVariabile, 4)} />
          </tbody>
        </table>
        <details style={{ marginTop: 10, fontSize: 12.5 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Costi per area (fissi e variabili)</summary>
          <table style={{ fontSize: 12, marginTop: 6 }}>
            <thead><tr><th style={{ ...th, ...sx }}>Area</th>{SPECIE.map(sp => <th key={sp} style={th} colSpan={2}>{NOMI[sp]}: fissi · variabili</th>)}</tr></thead>
            <tbody>{costi.perArea.map(a => (
              <tr key={a.area}><td style={{ ...td, ...sx }}>{a.area}</td>{SPECIE.map(sp => [<td key={sp + "f"} style={td}>{euro(a.perSpecie[sp].fissi, 0)}</td>, <td key={sp + "v"} style={td}>{euro(a.perSpecie[sp].variabili, 0)}</td>])}</tr>))}</tbody>
          </table>
        </details>
      </div>

      <div style={riquadro}>
        <Titolo sotto="Capi prodotti = capi usciti per la vendita o il macello (non riproduttori) + aumento dei capi in stalla nel periodo, in capi equivalenti: un capo in stalla conta per la parte di vita fatta (età ÷ età media d'uscita), perché un suinetto di un mese non è un suino finito. È il volume con cui si confronta il pareggio.">2. Volumi del periodo</Titolo>
        <table style={{ fontSize: 13 }}>
          <Testa />
          <tbody>
            <Riga l="Capi usciti venduti o macellati" valori={SPECIE.map(sp => `${numero(perSpecie[sp].Q.capiUsciti)}${perSpecie[sp].Q.fonte === "fatture" ? " (dalle fatture)" : ""}`)} />
            <Riga l="Chili di carcassa" valori={righe("k", x => x.Q.kg, 1, "numero")} />
            <Riga l="Capi in stalla all'inizio del periodo" nota="non riproduttori" valori={righe("i", x => x.Q.presentiInizio, 0, "numero")} />
            <Riga l="Capi in stalla alla fine del periodo" valori={righe("e", x => x.Q.presentiFine, 0, "numero")} />
            <Riga l="Età media d'uscita dei capi venduti o macellati (giorni)" valori={righe("u", x => x.Q.etaUscitaGiorni, 0, "numero")} />
            <Riga l="Capi equivalenti in stalla all'inizio del periodo" nota="ogni capo conta per età ÷ età media d'uscita (al massimo 1)" valori={righe("ie", x => x.Q.presentiInizioEquivalenti, 1, "numero")} />
            <Riga l="Capi equivalenti in stalla alla fine del periodo" valori={righe("ee", x => x.Q.presentiFineEquivalenti, 1, "numero")} />
            <Riga l="Capi prodotti" valori={righe("p", x => x.Q.capiProdotti, 0, "numero")} forte />
            <Riga l="Riproduttori riformati (venduti o macellati)" nota="il loro valore riduce il costo della rimonta: non è un ricavo dell'ingrasso" valori={righe("r", x => x.Q.riforme, 0, "numero")} />
            <Riga l="Macellati senza peso della carcassa" nota="dato da verificare: nello scenario base non contano tra i capi prodotti" valori={righe("s", x => x.Q.senzaPeso.length, 0, "numero")} />
          </tbody>
        </table>
      </div>

      <div style={riquadro}>
        <Titolo sotto="Madre = femmina che ha partorito (dall'inizio della prima gravidanza); non conta più come madre dopo due interparti senza partorire (bovini 27 mesi, suini 12, ovini 19). Nati per madre solo sui vivi.">3. Coefficienti della mandria</Titolo>
        <table style={{ fontSize: 13 }}>
          <Testa />
          <tbody>
            <Riga l="Madri medie presenti" valori={righe("m", x => x.T.madriMedie, 1, "numero")} />
            <Riga l="Maschi riproduttori medi presenti" valori={righe("t", x => x.T.toriMedi, 1, "numero")} />
            <Riga l="Parti registrati nel periodo" valori={righe("p", x => x.T.partiP, 0, "numero")} />
            <Riga l="Nati vivi" valori={SPECIE.map(sp => { const t = perSpecie[sp].T; return t.natiViviStima !== t.viviP ? `${numero(t.viviP)} registrati · ${numero(t.natiViviStima)} dalle fatture` : numero(t.viviP); })} />
            <Riga l="Nati morti al parto" valori={SPECIE.map(sp => { const t = perSpecie[sp].T; return `${numero(t.mortiP)} (${perc(t.natiMortiPerc !== null ? t.natiMortiPerc * 100 : null)})`; })} />
            <Riga l="Morti dopo la nascita, prima della vendita" valori={righe("d", x => x.T.mortiDopo, 0, "numero")} />
            <Riga l="Interparto della mandria (giorni)" nota="365 ÷ parti per madre all'anno: comprende le madri che nel periodo non hanno partorito" valori={righe("i", x => x.T.interpartoImplicito, 0, "numero")} forte />
            <Riga l="Interparto misurato tra due parti della stessa madre (giorni)" nota="mediana · media · numero di intervalli" valori={SPECIE.map(sp => { const t = perSpecie[sp].T; return t.intervalliMisurati ? `${numero(t.interpartoMisuratoMediana)} · ${numero(t.interpartoMisuratoMedia)} · ${t.intervalliMisurati}` : "—"; })} />
            <Riga l="Nati vivi per parto" valori={righe("n", x => x.T.natiPerParto, 2, "numero")} />
            <Riga l="Nati vendibili per madre all'anno" nota="(365 ÷ interparto) × nati vivi per parto × (1 − mortalità dopo la nascita)" valori={righe("v", x => x.T.natiVendibiliPerMadre, 2, "numero")} forte />
            <Riga l="Costo variabile della mandria nel periodo" nota="mantenimento variabile dei riproduttori + quota di rimonta" valori={righe("c", x => x.T.costoMandria, 0)} />
            <Riga l="— per madre all'anno" valori={righe("cm", x => x.T.costoMandriaPerMadre, 0)} />
            <Riga l="Costo variabile di un nato vendibile" valori={righe("cn", x => x.T.costoPerNato, 2)} forte />
          </tbody>
        </table>
        {perSpecie.ovino.T.notaOvini && <div style={{ marginTop: 8 }}><Avviso>🐑 Ovini: {perSpecie.ovino.T.notaOvini}. Interparto preso dagli intervalli misurati tra parti registrati.</Avviso></div>}
      </div>

      <div style={riquadro}>
        <Titolo sotto="Peso, resa e durata vengono dai capi macellati di tutti gli anni (campione deciso il 07/10/2026); per gli ovini, senza pesi nell'app, il peso viene dalle fatture.">4. Il capo tipo</Titolo>
        <table style={{ fontSize: 13 }}>
          <Testa />
          <tbody>
            <Riga l="Capi nel campione" valori={SPECIE.map(sp => perSpecie[sp].K.numero ? numero(perSpecie[sp].K.numero) : perSpecie[sp].p.fontePeso === "fatture" ? "nessuno (peso dalle fatture)" : "nessuno")} />
            <Riga l="Peso della carcassa (kg)" valori={righe("pc", x => x.p.leve.pesoCarcassa, 1, "numero")} />
            <Riga l="Resa (%)" valori={righe("r", x => x.K.resa, 2, "numero")} />
            <Riga l="Peso vivo (kg)" valori={righe("pv", x => x.K.pesoVivo, 1, "numero")} />
            <Riga l="Mesi in azienda" valori={righe("m", x => x.K.permanenzaMesi, 1, "numero")} />
            <Riga l="Capi nati in azienda (%)" valori={righe("q", x => x.p.leve.quotaNati, 0, "numero")} />
            <Riga l="Prezzo d'acquisto medio dei capi comprati" valori={righe("a", x => x.K.acquistoMedio, 2)} />
            <Riga l="Prezzo di vendita applicato (€ al kg di carcassa)" nota="dalle fatture di vendita del periodo; si cambia nella pagina Break Even" valori={righe("pz", x => x.p.prezzoInfo.prezzo, 2)} forte />
          </tbody>
        </table>
      </div>

      <div style={riquadro}>
        <Titolo sotto="Finché il dato non è certo il Break Even si guarda in due scenari: base prudente (senza) e con. Quando il dato è verificato lo scenario sparisce e il dato entra o esce.">5. Dati da verificare e dati che mancano</Titolo>
        <DatiIncerti s={s} calc={calc} altro={altro} />
      </div>
    </div>
  );
}

function DatiIncerti({ s, calc, altro }) {
  const base = calc.scenario === "base" ? calc : altro, con = calc.scenario === "con" ? calc : altro;
  const suini = base?.perSpecie.suino, suiniCon = con?.perSpecie.suino;
  const voci = [
    { t: `Suinetti dei lotti ancora «attivi» con più di 24 mesi: ${suiniLottoAnomali(s.A).length}`, effetto: suini && suiniCon ? `Scenario base: fuori dagli UBA e dai capi in stalla. Costi fissi dei suini ${euro(suini.C.fissi, 0)} senza, ${euro(suiniCon.C.fissi, 0)} con; costo variabile per UBA al giorno ${euro(suini.C.tassoVariabile, 4)} senza, ${euro(suiniCon.C.tassoVariabile, 4)} con.` : "", verifica: "Sborchia" },
    { t: "Capi macellati senza peso della carcassa", effetto: suini && suiniCon ? `Suini prodotti ${numero(suini.Q.capiProdotti)} senza, ${numero(suiniCon.Q.capiProdotti)} con (peso medio del capo tipo); bovini ${numero(base.perSpecie.bovino.Q.capiProdotti)} senza, ${numero(con.perSpecie.bovino.Q.capiProdotti)} con.` : "", verifica: "Sborchia e fatture" },
    { t: "Agnelli: non registrati nell'app", effetto: "Capi, chili e nati presi dalle fatture di vendita (le fatture di gennaio valgono per l'anno prima). La registrazione dei parti delle pecore entra nel protocollo per gli operatori.", verifica: "Sborchia" },
    { t: "Scorte di fieno e mangimi a inizio e fine periodo", effetto: "Non registrate: i costi sono gli acquisti del periodo. Lo scenario «con le scorte» sarà possibile con il registro dei balloni.", verifica: "registro dei balloni nell'app" },
    { t: "Contributi PAC", effetto: "Non registrati nel programma: il pareggio è calcolato senza PAC. I pagamenti per ettaro ridurranno i costi fissi, quelli per capo aumenteranno il margine di ogni capo.", verifica: "dati della PAC" },
  ];
  return (
    <table style={{ fontSize: 12.5 }}>
      <thead><tr><th style={{ ...th, ...sx }}>Dato</th><th style={{ ...th, ...sx }}>Come entra e quanto pesa</th><th style={{ ...th, ...sx }}>Si verifica con</th></tr></thead>
      <tbody>{voci.map(v => <tr key={v.t}><td style={{ ...td, ...sx, fontWeight: 700 }}>{v.t}</td><td style={{ ...td, ...sx }}>{v.effetto}</td><td style={{ ...td, ...sx }}>{v.verifica}</td></tr>)}</tbody>
    </table>
  );
}
