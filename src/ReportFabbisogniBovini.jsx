import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { formattaNumero } from "./parsingUtils";
import { calcolaRazione, testoPercentuale, decimaliMancante, SPECIE } from "./calcoloRazione";
import { caricaDatiRazioni, righeDaAlimenti, ANNO_CORRENTE } from "./RazioniBoviniDati";
import { riquadro, campo, etichetta, euro, COLORE_STATO, bottone, testoQuantita, AvvisoPrezzi } from "./RazioneViste";

// Alimentaria → Razioni Bovini → Report fabbisogni (versione 244).
// Le schede «Fabbisogni bovini alimentazione naturale» e «… alimentazione mangimi» (17/10/2026):
// per ogni classe il fabbisogno al giorno e, sotto, da quale alimento viene e quanto ne porta.

const TIPI_SUINI = [
  { valore: "naturale", etichetta: "Alimentazione naturale (farine semplici e minerali)" },
  { valore: "mangimi", etichetta: "Alimentazione con mangimi (mangime, orzo e carbonato)" },
];
const TABELLE_SUINI = [{ valore: 1, etichetta: "Energia, proteine, lisina, calcio e fosforo", voci: ["energia", "pg", "lisina", "ca", "pdig", "lisinatot"] }];
const TIPI = [
  { valore: "naturale", etichetta: "Alimentazione naturale (foraggi e farine)" },
  { valore: "mangimi", etichetta: "Alimentazione con mangimi (foraggi, orzo e mangimi)" },
];
const TABELLE = [
  { valore: 1, etichetta: "Tabella 1 – Energia, proteine e macroelementi", voci: ["energia", "pdi", "pg", "ca", "p", "mg", "na"] },
  { valore: 2, etichetta: "Tabella 2 – Microelementi e vitamina A", voci: ["cu", "zn", "mn", "se", "i", "co", "vita"] },
];
const breve = nome => nome.replace(" (stima, da analizzare)", "").replace(" (Martens)", "");

export default function ReportFabbisogniBovini({ onNavigate }) {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [specie, setSpecie] = useState("bovino");
  const [tipo, setTipo] = useState("naturale");
  const [tabella, setTabella] = useState(1);

  useEffect(() => { caricaDatiRazioni().then(setDati).catch(e => setErrore(e.message)); }, []);

  const alimentiPerNome = useMemo(() => Object.fromEntries((dati?.alimenti || []).map(a => [a.nome, a])), [dati]);
  const righeReport = useMemo(() => {
    if (!dati) return [];
    return dati.classi.filter(c => (c.specie || "bovino") === specie).map(c => {
      const rif = dati.riferimento.find(r => (r.specie || "bovino") === specie && r.tipo_alimentazione === tipo && r.classe === c.classe);
      return { classe: c, rif, ris: rif ? calcolaRazione(c, righeDaAlimenti(rif.alimenti, specie), alimentiPerNome, dati.prezzi, 1) : null };
    });
  }, [dati, tipo, alimentiPerNome, specie]);

  // anomalie: voci non coperte per classe
  const anomalie = useMemo(() => righeReport.filter(r => r.ris).map(r => ({
    classe: r.classe.classe, nota: r.rif.nota,
    manca: r.ris.voci.filter(v => v.stato === "manca").map(v => v.nome + (v.incompleta.length ? " (valore non analizzato o non dichiarato in: " + v.incompleta.map(breve).join(", ") + ")" : "")),
    eccesso: r.ris.voci.filter(v => v.stato === "eccessivo").map(v => v.nome),
  })).filter(a => a.manca.length || a.eccesso.length || a.nota), [righeReport]);

  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;
  if (!dati) return <div style={{ padding: 20, color: C.muted }}>Caricamento…</div>;

  const tabelle = specie === "suino" ? TABELLE_SUINI : TABELLE;
  const tab = tabelle.find(t => t.valore === tabella) || tabelle[0];
  // intestazioni: tutte le voci presenti in almeno una classe (es. lisina totale solo per la scrofa cinta in gestazione)
  const intestazioni = (() => { const viste = {}; righeReport.forEach(r => r.ris && r.ris.voci.forEach(v => { if (tab.voci.includes(v.chiave) && !viste[v.chiave]) viste[v.chiave] = v; })); return tab.voci.filter(k => viste[k]).map(k => viste[k]); })();
  const cella = { padding: "6px 7px", borderRight: `1px solid ${C.border}`, verticalAlign: "top", minWidth: 120 };

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>📑 Report fabbisogni</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13 }}>
        Per ogni classe la riga verde è il fabbisogno al giorno per capo; sotto, da quale alimento viene e quanto ne porta. La prima colonna riporta la razione da dare (integratori minerali in grammi) e il suo costo con i prezzi di riferimento del {ANNO_CORRENTE} (scheda prezzi). Razione: quella al costo più basso che copre i fabbisogni (bovini: schede del 17/10/2026; suini e ovini: schede del 19/10/2026).
      </p>

      <div style={{ ...riquadro, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, alignItems: "end" }}>
        <div><label style={etichetta}>Specie</label>
          <select value={specie} onChange={e => { setSpecie(e.target.value); setTabella(1); setTipo("naturale"); }} style={campo}>{SPECIE.map(t => <option key={t.valore} value={t.valore}>{t.etichetta}</option>)}</select></div>
        <div><label style={etichetta}>Tipo di alimentazione</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={campo}>{(specie === "suino" ? TIPI_SUINI : specie === "ovino" ? TIPI.slice(0, 1) : TIPI).map(t => <option key={t.valore} value={t.valore}>{t.etichetta}</option>)}</select></div>
        <div><label style={etichetta}>Tabella</label>
          <select value={tabella} onChange={e => setTabella(Number(e.target.value))} style={campo}>{tabelle.map(t => <option key={t.valore} value={t.valore}>{t.etichetta}</option>)}</select></div>
        <div><button onClick={() => window.print()} style={bottone(C.muted)}>🖨️ Stampa</button></div>
      </div>

      <AvvisoPrezzi ris={{ prezziListino: [...new Set(righeReport.flatMap(r => r.ris?.prezziListino || []))], prezziMancanti: [...new Set(righeReport.flatMap(r => r.ris?.prezziMancanti || []))] }} prezzi={dati.prezzi} onNavigate={onNavigate} />
      <div style={{ ...riquadro, background: "#FDF6EC", borderColor: "#E0B97A" }}>
        <div style={{ fontWeight: 800, color: "#8A5A00", marginBottom: 6 }}>Anomalie</div>
        {anomalie.length === 0 && <div style={{ fontSize: 13 }}>Nessuna: tutte le classi hanno il fabbisogno coperto.</div>}
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
          {anomalie.map(a => (
            <li key={a.classe} style={{ marginBottom: 3 }}><b>{a.classe}.</b>{" "}
              {a.nota && <span style={{ color: C.red, fontWeight: 700 }}>{a.nota} </span>}
              {a.manca.length > 0 && <span>Non coperto: {a.manca.join("; ")}. </span>}
              {a.eccesso.length > 0 && <span style={{ color: "#E67E22" }}>Eccessivo: {a.eccesso.join(", ")}.</span>}
            </li>
          ))}
        </ul>
        {specie === "suino" && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Mangimi: energia netta e fosforo digeribile non dichiarati dai cartellini («non dichiarato»); lisina digeribile = lisina totale × 0,85 (ipotesi). Farine: tabelle Feedipedia per i suini. Le classi senza razione con mangimi non hanno il cartellino del mangime (Sprint 60, Progeo L 13, L 16, NDP 3.1, SL 1 Life, NI 50% 5).</div>}
        {specie === "bovino" && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Il fieno misto non è analizzato: i valori di energia, proteina, calcio e fosforo sono stime da letteratura; magnesio, sodio, microelementi e vitamine del fieno non si conoscono e non sono contati. Il Codibloc non contiene rame.</div>}
      </div>

      <div style={{ ...riquadro, padding: 0, overflowX: "auto" }}>
        <table style={{ fontSize: 12, borderCollapse: "collapse", width: "100%" }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>
            <th style={{ ...cella, textAlign: "left", minWidth: 200, position: "sticky", left: 0, background: C.primary }}>Classe e razione da dare</th>
            {intestazioni.map(v => <th key={v.chiave} style={{ ...cella, fontSize: 11.5 }}>{v.nome}{v.chiave !== "energia" ? ` ${v.unita}` : ""}</th>)}
          </tr></thead>
          <tbody>
            {specie === "bovino" ? <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ ...cella, fontWeight: 700, position: "sticky", left: 0, background: C.card }}>Vitello sotto la madre (fino a 5 mesi)</td>
              <td colSpan={intestazioni.length} style={{ ...cella, fontStyle: "italic", color: C.muted }}>Beve il latte della madre: i fabbisogni sono coperti dal latte e non entrano nella razione.</td>
            </tr> : <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ ...cella, fontWeight: 700, position: "sticky", left: 0, background: C.card }}>{specie === "ovino" ? "Agnello sotto la madre" : "Suinetto sotto la scrofa (fino a circa 10 kg)"}</td>
              <td colSpan={intestazioni.length} style={{ ...cella, fontStyle: "italic", color: C.muted }}>{specie === "ovino" ? "Beve il latte della pecora (fabbisogni non trovati in letteratura): non entra nella razione." : "Beve il latte della scrofa: i fabbisogni sono coperti dal latte e non entrano nella razione."}</td>
            </tr>}
            {righeReport.map((r, i) => {
              const fondo = i % 2 ? "#F3F7F1" : C.card;
              if (!r.ris) return (
                <tr key={r.classe.classe}><td style={{ ...cella, fontWeight: 700, position: "sticky", left: 0, background: fondo }}>{r.classe.classe}</td>
                  <td colSpan={intestazioni.length} style={{ ...cella, color: C.red }}>{specie === "suino" && tipo === "mangimi" ? "Razione con mangimi non calcolabile: manca il cartellino del mangime (o la classe non usa mangimi di cui abbiamo il cartellino)." : specie === "suino" ? "Con farine semplici non si alimenta: servono derivati del latte, resta il mangime." : "Razione di riferimento mancante."}</td></tr>
              );
              const voci = intestazioni.map(h => r.ris.voci.find(v => v.chiave === h.chiave) || { chiave: h.chiave, vuota: true, fabbisogno: null, contributi: [] });
              return [
                <tr key={r.classe.classe + "f"} style={{ background: "#E3EDE0" }}>
                  <td rowSpan={2} style={{ ...cella, position: "sticky", left: 0, background: fondo, borderBottom: `2px solid ${C.border}` }}>
                    <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>{r.classe.classe}</div>
                    {r.ris.righe.filter(x => x.alimento && x.kg > 0).map(x => (
                      <div key={x.alimento} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                        <span>{breve(x.alimento)}</span>
                        <span>{alimentiPerNome[x.alimento]?.unita_dose === "grammi" ? testoQuantita(x.quantita, true) : testoQuantita(x.kg)}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 4, color: C.muted }}>{r.ris.specie === "suino" ? `Totale ${formattaNumero(r.ris.totaleKg, 3)} kg (mangia ${formattaNumero(r.ris.kgClasse, 2)} kg)` : `Sostanza secca ${formattaNumero(r.ris.sostanzaSeccaKg, 2)} kg`}</div>
                    <div style={{ fontWeight: 800, color: C.primary }}>Costo per capo al giorno {euro(r.ris.costi.capoGiorno)}{r.ris.costi.completo ? "" : " (incompleto)"}</div>
                  </td>
                  {voci.map(v => <td key={v.chiave} style={{ ...cella, textAlign: "center", fontWeight: 800, color: "#1F3A28", fontSize: 13 }}>{v.fabbisogno === null ? "—" : formattaNumero(v.fabbisogno, v.decimali) + (v.chiave === "energia" ? " " + v.unita : "")}</td>)}
                </tr>,
                <tr key={r.classe.classe + "a"} style={{ background: fondo, borderBottom: `2px solid ${C.border}` }}>
                  {voci.map(v => (
                    <td key={v.chiave} style={cella}>
                      {v.contributi.filter(x => x.valore !== 0).map(x => (
                        <div key={x.alimento} style={{ display: "flex", justifyContent: "space-between", gap: 6, color: x.valore === null ? "#8A5A00" : C.text }}>
                          <span>{breve(x.alimento)}</span><span>{x.valore === null ? (alimentiPerNome[x.alimento]?.gruppo === "Mangime composto" ? "non dichiarato" : "non analizzato") : formattaNumero(x.valore, v.decimali)}</span>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, borderTop: `1px solid ${C.border}`, marginTop: 2 }}>
                        <span>Totale</span><span>{formattaNumero(v.apporto, v.decimali)}</span>
                      </div>
                      <div style={{ fontWeight: 800, color: COLORE_STATO[v.stato] }}>
                        {v.stato === "coperto" ? "✓ Coperto" : v.stato === "eccessivo" ? `ECCESSIVO (${testoPercentuale(v)})` : v.stato === "manca" ? `Manca ${formattaNumero(v.mancaQuanto, decimaliMancante(v))} (${testoPercentuale(v)})` : "—"}
                      </div>
                    </td>
                  ))}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      {specie === "ovino" && <div style={{ fontSize: 11.5, color: C.muted }}>Fabbisogni: ricerca «Fabbisogni nutritivi degli ovini» del 13/10/2026 (INRA 2018 tramite Seguí Parpal 2020; NRC 1985); pecore al pascolo (mantenimento × 1,1); fine gestazione a 2 settimane dal parto. Alimenti: gli stessi dei bovini; niente mangimi né minerali per bovini, che hanno troppo rame per le pecore (limite di legge 15 mg per kg di mangime). Il fieno misto non è analizzato: rame, cobalto e vitamina A restano incerti.</div>}
      {specie === "suino" && <div style={{ fontSize: 11.5, color: C.muted }}>Fabbisogni: report «Fabbisogni suini per classe» del 19/10/2026 (linee guida ANAS-CREA 2021; suino Iberico per cinta e apulo-calabrese; intermedia = media tra lenta e veloce). Fabbisogno al giorno = kg di mangime della classe × concentrazione per kg. Alimenti: Feedipedia per i suini; mangimi dal cartellino del produttore.</div>}
      {specie === "bovino" && <div style={{ fontSize: 11.5, color: C.muted }}>
        Fabbisogni: crescita con la formula Chianina (Università di Firenze) per energia e PDI, proteina grezza NASEM 2016; vacche, manza e toro come approvato il 14/10/2026; calcio e fosforo delle vacche Agroscope; magnesio, sodio e microelementi NASEM 2016 per kg di sostanza secca; vitamina A NRC. Calcio, fosforo e vitamina A del toro: ipotesi, per i tori non c'è tabella. Composizione degli alimenti: tabelle INRA e Feedipedia; mangimi dal cartellino del produttore; Codibloc dalla scheda Martens del 28/11/2023.
      </div>}
    </div>
  );
}
