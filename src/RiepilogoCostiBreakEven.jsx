import { useState, useEffect, Fragment } from "react";
import { C } from "./style";
import { formattaEuro, formattaNumero } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { caricaDatiGrezziAnno, AREE_ORDINARIE, classificaDestinazione, MAPPA_SPECIE } from "./calcoloReportCosti";
import { calcolaRigaAggregata } from "./motoreUba";

const ANNO_CORRENTE = new Date().getFullYear();

export default function RiepilogoCostiBreakEven() {
  const [anno, setAnno] = useState(ANNO_CORRENTE);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);
  const [dati, setDati] = useState(null); // { variabili, fissi, ammortamenti, totali }
  const [espansi, setEspansi] = useState(new Set());

  useEffect(() => { carica(); }, [anno]);

  async function carica() {
    setCaricando(true);
    setErrore(null);
    setEspansi(new Set());
    try {
      const { ubaGiorniProduttiviAziendali, ubaGiorniProduttiviPerSpecie, articoliAnno, quoteAnno, mappaCespiteSpecie, mappaCespiteCategoria } = await caricaDatiGrezziAnno(anno);

      function righePerArea(righeCosto) {
        return AREE_ORDINARIE.map(area => {
          const costiDiretti = { bovino: 0, suino: 0, ovino: 0, generale: 0, bovinoOvino: 0, bovinoSuino: 0, suinoOvino: 0 };
          righeCosto.filter(r => (r.area || "").trim() === area).forEach(r => {
            costiDiretti[classificaDestinazione((r.destinazione || "").trim())] += (r.totale_riga || 0);
          });
          return { etichetta: area, ...calcolaRigaAggregata(costiDiretti, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali) };
        }).filter(r => r.imponibileComplessivo > 0);
      }

      const variabili = righePerArea(articoliAnno.filter(r => r.tipo_costo === "Variabile"));
      const fissi = righePerArea(articoliAnno.filter(r => r.tipo_costo === "Fisso"));

      // Ammortamenti: stessa aggregazione, ma raggruppati per CATEGORIA del cespite (non per
      // area — i cespiti non hanno un'area, solo specie e categoria fiscale).
      const categorieViste = new Set();
      quoteAnno.forEach(r => categorieViste.add(mappaCespiteCategoria.get(r.cespite_id) || "Senza categoria"));
      const ammortamenti = [...categorieViste].sort().map(categoria => {
        const costiDiretti = { bovino: 0, suino: 0, ovino: 0, generale: 0, bovinoOvino: 0, bovinoSuino: 0, suinoOvino: 0 };
        quoteAnno.filter(r => (mappaCespiteCategoria.get(r.cespite_id) || "Senza categoria") === categoria).forEach(r => {
          const specieCespite = mappaCespiteSpecie.get(r.cespite_id) || [];
          const specieMatch = Object.entries(MAPPA_SPECIE).find(([, v]) => specieCespite.includes(v));
          if (specieMatch) costiDiretti[specieMatch[0]] += (r.quota || 0);
          else if (specieCespite.includes("Generale")) costiDiretti.generale += (r.quota || 0);
          // cespiti senza specie riconosciuta (Nessuno/Orto/Cavalli/Pollame): esclusi, come nel resto del sistema
        });
        return { etichetta: categoria, ...calcolaRigaAggregata(costiDiretti, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali) };
      }).filter(r => r.imponibileComplessivo > 0);

      const totali = {
        variabili: variabili.reduce((s, r) => s + r.imponibileComplessivo, 0),
        fissi: fissi.reduce((s, r) => s + r.imponibileComplessivo, 0),
        ammortamenti: ammortamenti.reduce((s, r) => s + r.imponibileComplessivo, 0),
      };

      setDati({ variabili, fissi, ammortamenti, totali });
    } catch (err) {
      setErrore(err.message);
    }
    setCaricando(false);
  }

  function toggleEspanso(chiave) {
    setEspansi(prev => { const n = new Set(prev); n.has(chiave) ? n.delete(chiave) : n.add(chiave); return n; });
  }

  function scarica() {
    const righeSezione = righe => righe.map(r => ({
      "Voce": r.etichetta,
      "Imponibile complessivo": numeroExcel(r.imponibileComplessivo),
      "€/UBA-gg azienda": numeroExcel(r.tassoArea),
      "Bovini €": numeroExcel(r.perSpecie.bovino.costoAllocato),
      "Bovini €/UBA-gg": numeroExcel(r.perSpecie.bovino.incidenza),
      "Suini €": numeroExcel(r.perSpecie.suino.costoAllocato),
      "Suini €/UBA-gg": numeroExcel(r.perSpecie.suino.incidenza),
      "Ovini €": numeroExcel(r.perSpecie.ovino.costoAllocato),
      "Ovini €/UBA-gg": numeroExcel(r.perSpecie.ovino.incidenza),
    }));
    esportaExcel(`riepilogo_costi_breakeven_${anno}`, [
      { nome: "Costi Variabili", righe: righeSezione(dati.variabili) },
      { nome: "Costi Fissi", righe: righeSezione(dati.fissi) },
      { nome: "Quote Ammortamento", righe: righeSezione(dati.ammortamenti) },
    ]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Riepilogo Costi (Break Even)</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Costi dell'anno suddivisi in Variabili, Fissi e Quote di Ammortamento — apri ogni voce con la freccetta per vedere la composizione per area (o, per gli ammortamenti, per categoria di cespite).
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Anno:
          <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value) || ANNO_CORRENTE)}
            style={{ marginLeft: 8, width: 90, padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
        </label>
        {dati && (
          <button onClick={scarica}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            📥 Scarica Excel
          </button>
        )}
      </div>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}
      {caricando ? <p style={{ color: C.muted }}>Caricamento...</p> : dati && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SezioneCosti titolo="Costi Variabili" colore={C.blue} righe={dati.variabili} totale={dati.totali.variabili}
            prefissoChiave="var" espansi={espansi} toggleEspanso={toggleEspanso} />
          <SezioneCosti titolo="Costi Fissi" colore={C.accent} righe={dati.fissi} totale={dati.totali.fissi}
            prefissoChiave="fis" espansi={espansi} toggleEspanso={toggleEspanso} />
          <SezioneCosti titolo="Quote di Ammortamento" colore={C.green} righe={dati.ammortamenti} totale={dati.totali.ammortamenti}
            prefissoChiave="amm" espansi={espansi} toggleEspanso={toggleEspanso} etichettaColonna="Categoria cespite" />
        </div>
      )}
    </div>
  );
}

function SezioneCosti({ titolo, colore, righe, totale, prefissoChiave, espansi, toggleEspanso, etichettaColonna = "Area" }) {
  if (righe.length === 0) return null;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", background: colore, color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{titolo}</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{formattaEuro(totale)}</span>
      </div>
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <thead style={{ background: C.bg }}>
          <tr>
            <th style={th}></th>
            <th style={th}>{etichettaColonna}</th>
            <th style={{ ...th, textAlign: "right" }}>Imponibile</th>
            <th style={{ ...th, textAlign: "right" }}>€/UBA-gg</th>
          </tr>
        </thead>
        <tbody>
          {righe.map(r => {
            const chiave = `${prefissoChiave}-${r.etichetta}`;
            const aperta = espansi.has(chiave);
            return (
              <Fragment key={chiave}>
                <tr onClick={() => toggleEspanso(chiave)} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}>
                  <td style={{ ...td, width: 24 }}>{aperta ? "▼" : "▶"}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{r.etichetta}</td>
                  <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.imponibileComplessivo)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.tassoArea, 4)}</td>
                </tr>
                {aperta && ["bovino", "suino", "ovino"].map(sp => (
                  <tr key={`${chiave}-${sp}`} style={{ background: C.bg, fontSize: 12 }}>
                    <td style={td}></td>
                    <td style={{ ...td, paddingLeft: 24, color: C.muted }}>{sp === "bovino" ? "Bovini" : sp === "suino" ? "Suini" : "Ovini"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.perSpecie[sp].costoAllocato)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.perSpecie[sp].incidenza, 4)}</td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
          <tr style={{ borderTop: `2px solid ${colore}`, fontWeight: 700, background: C.bg }}>
            <td style={td}></td>
            <td style={td}>Totale</td>
            <td style={{ ...td, textAlign: "right" }}>{formattaEuro(totale)}</td>
            <td style={{ ...td, textAlign: "right", color: C.muted, fontWeight: 400, fontSize: 11 }}>—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11 };
const td = { padding: "8px 10px" };
