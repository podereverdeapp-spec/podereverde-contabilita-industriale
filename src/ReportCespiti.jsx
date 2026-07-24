import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, round2, formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

export default function ReportCespiti() {
  const [loading, setLoading] = useState(true);
  const [dati, setDati] = useState(null);

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    try {
      const { data: cespiti, error: eC } = await supabase.from("ci_cespiti").select("*");
      if (eC) throw new Error(eC.message);
      const cespitiNum = numerizzaCampi(cespiti || [], ["costo_acquisto", "anni_ammortamento"]);

      const idCespiti = cespitiNum.map(c => c.id);
      let quote = [];
      if (idCespiti.length > 0) {
        const { data, error: eQ } = await supabase.from("ci_cespiti_ammortamento").select("cespite_id, anno, quota").in("cespite_id", idCespiti);
        if (eQ) throw new Error(eQ.message);
        quote = numerizzaCampi(data || [], ["quota"]);
      }

      const quoteGeneratePerCespite = new Map();
      quote.forEach(q => quoteGeneratePerCespite.set(q.cespite_id, (quoteGeneratePerCespite.get(q.cespite_id) || 0) + (q.quota || 0)));

      const cespitiConResiduo = cespitiNum.map(c => {
        const quoteGenerate = round2(quoteGeneratePerCespite.get(c.id) || 0);
        const residuo = round2(Math.max(0, c.costo_acquisto - quoteGenerate));
        const quotaAnnua = c.anni_ammortamento > 0 ? round2(c.costo_acquisto / c.anni_ammortamento) : 0;
        const annoFine = new Date(c.data_acquisto).getFullYear() + c.anni_ammortamento - 1;
        return { ...c, quoteGenerate, residuo, quotaAnnua, annoFine, completamenteAmmortizzato: residuo <= 0 };
      });

      // Riepilogo per categoria
      const categorie = [...new Set(cespitiConResiduo.map(c => c.categoria || "Senza categoria"))];
      const perCategoria = categorie.map(cat => {
        const gruppo = cespitiConResiduo.filter(c => (c.categoria || "Senza categoria") === cat);
        return {
          categoria: cat, nCespiti: gruppo.length,
          costoTotale: round2(gruppo.reduce((s, c) => s + c.costo_acquisto, 0)),
          quoteGenerate: round2(gruppo.reduce((s, c) => s + c.quoteGenerate, 0)),
          residuo: round2(gruppo.reduce((s, c) => s + c.residuo, 0)),
        };
      }).sort((a, b) => b.costoTotale - a.costoTotale);

      // Riepilogo per imputazione (specie)
      const specieChiavi = ["Bovini", "Suini", "Ovini", "Generale", "Cavalli", "Pollame", "Orto", "Nessuno"];
      const perImputazione = specieChiavi.map(sp => {
        const gruppo = cespitiConResiduo.filter(c => sp === "Nessuno" ? (!c.specie || c.specie.length === 0) : (c.specie || []).includes(sp));
        if (gruppo.length === 0) return null;
        return {
          imputazione: sp, nCespiti: gruppo.length,
          costoTotale: round2(gruppo.reduce((s, c) => s + c.costo_acquisto, 0)),
          quoteGenerate: round2(gruppo.reduce((s, c) => s + c.quoteGenerate, 0)),
          residuo: round2(gruppo.reduce((s, c) => s + c.residuo, 0)),
        };
      }).filter(Boolean);

      // Piano di ammortamento futuro (prossimi 5 anni)
      const annoCorrente = new Date().getFullYear();
      const pianoFuturo = Array.from({ length: 5 }, (_, i) => annoCorrente + i).map(anno => {
        const cespitiInVita = cespitiConResiduo.filter(c => {
          const annoAcquisto = new Date(c.data_acquisto).getFullYear();
          return anno >= annoAcquisto && anno <= c.annoFine;
        });
        return { anno, quotaAttesa: round2(cespitiInVita.reduce((s, c) => s + c.quotaAnnua, 0)), nCespiti: cespitiInVita.length };
      });

      const riepilogoGenerale = {
        nCespiti: cespitiConResiduo.filter(c => c.attivo !== false).length,
        costoTotale: round2(cespitiConResiduo.reduce((s, c) => s + c.costo_acquisto, 0)),
        quoteGenerate: round2(cespitiConResiduo.reduce((s, c) => s + c.quoteGenerate, 0)),
        residuo: round2(cespitiConResiduo.reduce((s, c) => s + c.residuo, 0)),
        completamenteAmmortizzati: cespitiConResiduo.filter(c => c.completamenteAmmortizzato).length,
      };

      setDati({ riepilogoGenerale, perCategoria, perImputazione, pianoFuturo, cespitiConResiduo });
    } catch (err) {
      alert(`⚠️ Errore nel caricamento:\n\n${err.message}`);
    }
    setLoading(false);
  }

  function esporta() {
    esportaExcel("ReportCespiti", [
      { nome: "Riepilogo Generale", righe: [{
        "N° Cespiti attivi": dati.riepilogoGenerale.nCespiti, "Costo totale": numeroExcel(dati.riepilogoGenerale.costoTotale),
        "Quote generate": numeroExcel(dati.riepilogoGenerale.quoteGenerate), "Residuo": numeroExcel(dati.riepilogoGenerale.residuo),
        "Completamente ammortizzati": dati.riepilogoGenerale.completamenteAmmortizzati,
      }] },
      { nome: "Per Categoria", righe: dati.perCategoria.map(r => ({
        "Categoria": r.categoria, "N° Cespiti": r.nCespiti, "Costo totale": numeroExcel(r.costoTotale),
        "Quote generate": numeroExcel(r.quoteGenerate), "Residuo": numeroExcel(r.residuo),
      })) },
      { nome: "Per Imputazione", righe: dati.perImputazione.map(r => ({
        "Imputazione": r.imputazione, "N° Cespiti": r.nCespiti, "Costo totale": numeroExcel(r.costoTotale),
        "Quote generate": numeroExcel(r.quoteGenerate), "Residuo": numeroExcel(r.residuo),
      })), coloriRiga: r => IMPUTAZIONI_NON_ALLEVAMENTO.includes(r["Imputazione"]) },
      { nome: "Piano Futuro", righe: dati.pianoFuturo.map(r => ({ "Anno": r.anno, "Quota attesa": numeroExcel(r.quotaAttesa), "N° Cespiti coinvolti": r.nCespiti })) },
      { nome: "Dettaglio Cespiti", righe: dati.cespitiConResiduo.map(c => ({
        "Descrizione": c.descrizione, "Categoria": c.categoria, "Imputazione": c.specie?.join(", ") || "Generali",
        "Data acquisto": c.data_acquisto, "Costo acquisto": numeroExcel(c.costo_acquisto), "Anni ammortamento": c.anni_ammortamento,
        "Quote generate": numeroExcel(c.quoteGenerate), "Residuo": numeroExcel(c.residuo), "Anno fine ammortamento": c.annoFine,
        "Completamente ammortizzato": c.completamenteAmmortizzato ? "Sì" : "No",
      })) },
    ]);
  }

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Caricamento...</div>;
  if (!dati) return null;

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <button onClick={esporta}
          style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          📥 Esporta Excel
        </button>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Riepilogo del patrimonio in cespiti: valore residuo, ripartizione per categoria/imputazione, e piano di ammortamento atteso nei prossimi 5 anni.
      </p>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <StatBox label="Cespiti attivi" value={dati.riepilogoGenerale.nCespiti} color={C.primary} />
        <StatBox label="Costo totale investito" value={formattaEuro(dati.riepilogoGenerale.costoTotale)} color={C.blue} />
        <StatBox label="Quote generate ad oggi" value={formattaEuro(dati.riepilogoGenerale.quoteGenerate)} color={C.accent} />
        <StatBox label="Valore residuo netto" value={formattaEuro(dati.riepilogoGenerale.residuo)} color={C.green} />
        <StatBox label="Completamente ammortizzati" value={dati.riepilogoGenerale.completamenteAmmortizzati} color={C.muted} />
      </div>

      <Sezione titolo="PER CATEGORIA">
        <TabellaSemplice righe={dati.perCategoria} etichetta="categoria" />
      </Sezione>

      <Sezione titolo="PER IMPUTAZIONE (SPECIE)">
        <TabellaSemplice righe={dati.perImputazione} etichetta="imputazione" />
      </Sezione>

      <Sezione titolo="PIANO DI AMMORTAMENTO ATTESO (PROSSIMI 5 ANNI)">
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", fontSize: 13 }}>
            <thead style={{ background: C.primary, color: "#fff" }}>
              <tr><th style={th}>Anno</th><th style={{ ...th, textAlign: "right" }}>Quota attesa</th><th style={{ ...th, textAlign: "right" }}>N° Cespiti coinvolti</th></tr>
            </thead>
            <tbody>
              {dati.pianoFuturo.map(r => (
                <tr key={r.anno} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td}>{r.anno}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(r.quotaAttesa)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.nCespiti}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sezione>
    </div>
  );
}

function Sezione({ titolo, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>{titolo}</div>
      {children}
    </div>
  );
}

const IMPUTAZIONI_NON_ALLEVAMENTO = ["Nessuno", "Cavalli", "Pollame", "Orto"];

function TabellaSemplice({ righe, etichetta }) {
  if (righe.length === 0) return <p style={{ color: C.muted, fontSize: 13 }}>Nessun dato.</p>;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", fontSize: 13 }}>
        <thead style={{ background: C.primary, color: "#fff" }}>
          <tr>
            <th style={th}></th><th style={{ ...th, textAlign: "right" }}>N° Cespiti</th>
            <th style={{ ...th, textAlign: "right" }}>Costo totale</th><th style={{ ...th, textAlign: "right" }}>Quote generate</th>
            <th style={{ ...th, textAlign: "right" }}>Residuo</th>
          </tr>
        </thead>
        <tbody>
          {righe.map(r => {
            const nonImputabile = etichetta === "imputazione" && IMPUTAZIONI_NON_ALLEVAMENTO.includes(r[etichetta]);
            const colore = nonImputabile ? C.red : C.text;
            return (
              <tr key={r[etichetta]} style={{ borderTop: `1px solid ${C.border}`, background: nonImputabile ? "#FDECEC" : "transparent" }}>
                <td style={{ ...td, fontWeight: 700, color: colore }}>
                  {r[etichetta]}{nonImputabile && <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6 }}>(non imputabile in allevamento)</span>}
                </td>
                <td style={{ ...td, textAlign: "right", color: colore }}>{r.nCespiti}</td>
                <td style={{ ...td, textAlign: "right", color: colore }}>{formattaEuro(r.costoTotale)}</td>
                <td style={{ ...td, textAlign: "right", color: colore }}>{formattaEuro(r.quoteGenerate)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700, color: colore }}>{formattaEuro(r.residuo)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: color + "15", borderRadius: 10, padding: "10px 16px", minWidth: 150 }}>
      <div style={{ fontSize: 12, color, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700 };
const td = { padding: "7px 10px", fontSize: 13 };
