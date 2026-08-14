import { useState, useEffect, Fragment } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro, formattaNumero, round2 } from "./parsingUtils";
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
  const [numeroCapi, setNumeroCapi] = useState({ bovino: 0, suino: 0, ovino: 0 });
  const [pesi, setPesi] = useState({ bovino: "", suino: "", ovino: "" });

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

      // Numero di capi attualmente presenti in azienda, per specie — per i suini include sia
      // gli animali individuali sia i suinetti nei lotti (dove sta la maggior parte).
      const { data: bovOvi } = await supabase.from("animali").select("specie").in("specie", ["bovino", "ovino"]).eq("stato", "attivo");
      const { data: suiniIndiv } = await supabase.from("animali").select("id").eq("specie", "suino").eq("stato", "attivo");
      const { data: suiniLottoAttivi } = await supabase.from("suini_lotto").select("id").eq("stato", "attivo");
      setNumeroCapi({
        bovino: (bovOvi || []).filter(a => a.specie === "bovino").length,
        ovino: (bovOvi || []).filter(a => a.specie === "ovino").length,
        suino: (suiniIndiv || []).length + (suiniLottoAttivi || []).length,
      });
    } catch (err) {
      setErrore(err.message);
    }
    setCaricando(false);
  }

  function toggleEspanso(chiave) {
    setEspansi(prev => { const n = new Set(prev); n.has(chiave) ? n.delete(chiave) : n.add(chiave); return n; });
  }

  function scarica() {
    const righeSezione = righe => righe.map(r => {
      const riga = {
        "Voce": r.etichetta,
        "Imponibile complessivo": numeroExcel(r.imponibileComplessivo),
        "€/UBA-gg azienda": numeroExcel(r.tassoArea),
      };
      ["bovino", "suino", "ovino"].forEach(sp => {
        const etichetta = sp === "bovino" ? "Bovini" : sp === "suino" ? "Suini" : "Ovini";
        const capi = numeroCapi[sp];
        const imponibileSpecie = r.perSpecie[sp].costoAllocato;
        const costoPerCapo = capi > 0 ? round2(imponibileSpecie / capi) : null;
        const pesoSpecie = parseFloat(pesi[sp]) || null;
        const costoAlKg = costoPerCapo != null && pesoSpecie ? round2(costoPerCapo / pesoSpecie) : null;
        riga[`${etichetta} €`] = numeroExcel(imponibileSpecie);
        riga[`${etichetta} €/UBA-gg`] = numeroExcel(r.perSpecie[sp].incidenza);
        riga[`${etichetta} Capi`] = capi;
        riga[`${etichetta} €/capo`] = costoPerCapo != null ? numeroExcel(costoPerCapo) : "";
        riga[`${etichetta} Peso (kg)`] = pesoSpecie || "";
        riga[`${etichetta} €/kg`] = costoAlKg != null ? numeroExcel(costoAlKg) : "";
      });
      return riga;
    });
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
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, display: "flex", gap: 24, flexWrap: "wrap" }}>
            {["bovino", "suino", "ovino"].map(sp => (
              <label key={sp} style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>
                Peso {sp === "bovino" ? "bovini" : sp === "suino" ? "suini" : "ovini"} (kg) — {numeroCapi[sp]} capi presenti
                <input type="number" value={pesi[sp]} onChange={e => setPesi(prev => ({ ...prev, [sp]: e.target.value }))}
                  placeholder="inserisci peso"
                  style={{ display: "block", marginTop: 4, width: 110, padding: "5px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, fontWeight: 700 }} />
              </label>
            ))}
          </div>
          <SezioneCosti titolo="Costi Variabili" colore={C.blue} righe={dati.variabili} totale={dati.totali.variabili}
            prefissoChiave="var" espansi={espansi} toggleEspanso={toggleEspanso} numeroCapi={numeroCapi} pesi={pesi} />
          <SezioneCosti titolo="Costi Fissi" colore={C.accent} righe={dati.fissi} totale={dati.totali.fissi}
            prefissoChiave="fis" espansi={espansi} toggleEspanso={toggleEspanso} numeroCapi={numeroCapi} pesi={pesi} />
          <SezioneCosti titolo="Quote di Ammortamento" colore={C.green} righe={dati.ammortamenti} totale={dati.totali.ammortamenti}
            prefissoChiave="amm" espansi={espansi} toggleEspanso={toggleEspanso} etichettaColonna="Categoria cespite" numeroCapi={numeroCapi} pesi={pesi} />
        </div>
      )}
    </div>
  );
}

function SezioneCosti({ titolo, colore, righe, totale, prefissoChiave, espansi, toggleEspanso, etichettaColonna = "Area", numeroCapi, pesi }) {
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
            <th style={{ ...th, textAlign: "right" }}>Capi</th>
            <th style={{ ...th, textAlign: "right" }}>€/capo</th>
            <th style={{ ...th, textAlign: "right" }}>Peso</th>
            <th style={{ ...th, textAlign: "right" }}>€/kg</th>
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
                  <td colSpan={4} style={{ ...td, textAlign: "right", color: C.muted, fontSize: 11 }}>clicca per il dettaglio per specie →</td>
                </tr>
                {aperta && ["bovino", "suino", "ovino"].map(sp => {
                  const capi = numeroCapi[sp];
                  const imponibileSpecie = r.perSpecie[sp].costoAllocato;
                  const costoPerCapo = capi > 0 ? round2(imponibileSpecie / capi) : null;
                  const pesoSpecie = parseFloat(pesi[sp]) || null;
                  const costoAlKg = costoPerCapo != null && pesoSpecie ? round2(costoPerCapo / pesoSpecie) : null;
                  return (
                    <tr key={`${chiave}-${sp}`} style={{ background: C.bg, fontSize: 12 }}>
                      <td style={td}></td>
                      <td style={{ ...td, paddingLeft: 24, color: C.muted }}>{sp === "bovino" ? "Bovini" : sp === "suino" ? "Suini" : "Ovini"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(imponibileSpecie)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.perSpecie[sp].incidenza, 4)}</td>
                      <td style={{ ...td, textAlign: "right", color: C.muted }}>{capi} capi</td>
                      <td style={{ ...td, textAlign: "right" }}>{costoPerCapo != null ? formattaEuro(costoPerCapo, 2) : "—"}</td>
                      <td style={{ ...td, textAlign: "right", color: C.muted }}>{pesoSpecie ? `${formattaNumero(pesoSpecie, 0)} kg` : "— inserisci peso sopra"}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{costoAlKg != null ? formattaEuro(costoAlKg, 3) : "—"}</td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
          {(() => {
            const chiaveTotale = `${prefissoChiave}-totale`;
            const apertaTotale = espansi.has(chiaveTotale);
            const totalePerSpecie = { bovino: 0, suino: 0, ovino: 0 };
            const incidenzaTotalePerSpecie = { bovino: 0, suino: 0, ovino: 0 };
            righe.forEach(r => ["bovino", "suino", "ovino"].forEach(sp => {
              totalePerSpecie[sp] += r.perSpecie[sp].costoAllocato;
              incidenzaTotalePerSpecie[sp] += r.perSpecie[sp].incidenza;
            }));
            return (
              <Fragment key={chiaveTotale}>
                <tr onClick={() => toggleEspanso(chiaveTotale)} style={{ borderTop: `2px solid ${colore}`, fontWeight: 700, background: C.bg, cursor: "pointer" }}>
                  <td style={{ ...td, width: 24 }}>{apertaTotale ? "▼" : "▶"}</td>
                  <td style={td}>Totale</td>
                  <td style={{ ...td, textAlign: "right" }}>{formattaEuro(totale)}</td>
                  <td colSpan={5} style={{ ...td, textAlign: "right", color: C.muted, fontWeight: 400, fontSize: 11 }}>
                    {apertaTotale ? "" : "clicca per la somma per specie →"}
                  </td>
                </tr>
                {apertaTotale && ["bovino", "suino", "ovino"].map(sp => {
                  const capi = numeroCapi[sp];
                  const imponibileSpecie = round2(totalePerSpecie[sp]);
                  const costoPerCapo = capi > 0 ? round2(imponibileSpecie / capi) : null;
                  const pesoSpecie = parseFloat(pesi[sp]) || null;
                  const costoAlKg = costoPerCapo != null && pesoSpecie ? round2(costoPerCapo / pesoSpecie) : null;
                  return (
                    <tr key={`${chiaveTotale}-${sp}`} style={{ background: C.bg, fontSize: 12, fontWeight: 700 }}>
                      <td style={td}></td>
                      <td style={{ ...td, paddingLeft: 24, color: C.muted }}>{sp === "bovino" ? "Bovini" : sp === "suino" ? "Suini" : "Ovini"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(imponibileSpecie)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(incidenzaTotalePerSpecie[sp], 4)}</td>
                      <td style={{ ...td, textAlign: "right", color: C.muted }}>{capi} capi</td>
                      <td style={{ ...td, textAlign: "right" }}>{costoPerCapo != null ? formattaEuro(costoPerCapo, 2) : "—"}</td>
                      <td style={{ ...td, textAlign: "right", color: C.muted }}>{pesoSpecie ? `${formattaNumero(pesoSpecie, 0)} kg` : "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{costoAlKg != null ? formattaEuro(costoAlKg, 3) : "—"}</td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })()}
        </tbody>
      </table>
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11 };
const td = { padding: "8px 10px" };
