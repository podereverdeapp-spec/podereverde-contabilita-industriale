import { useState, Fragment } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { calcolaReportUba, calcolaRigaAggregata } from "./motoreUba";
import { numerizzaCampi, round2, formattaEuro } from "./parsingUtils";

const AREE_ORDINARIE = [
  "Allevamento", "Coltivazione", "Lavoro", "Energia Elettrica", "Acqua", "Consulenze",
  "Assicurazioni", "Lavorazioni prodotti allevamento", "Spese Promozionali",
  "Canoni ed Abbonamenti", "Varie", "Oneri Finanziari",
];
const MAPPA_SPECIE = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };

function classificaDestinazione(dest) {
  const m = Object.entries(MAPPA_SPECIE).find(([, v]) => v === dest);
  return m ? m[0] : "generale";
}

export default function ReportPerAreaCentro() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [calcolando, setCalcolando] = useState(false);
  const [gruppi, setGruppi] = useState(null); // [{ area, riga, sottoRighe: [{ etichetta, ...calcolo }] }]
  const [rigaRossa, setRigaRossa] = useState(null);
  const [espansi, setEspansi] = useState({});

  async function calcola() {
    setCalcolando(true);
    setGruppi(null);
    setRigaRossa(null);
    try {
      const [{ data: animali, error: eA }, { data: lotti, error: eL }, { data: suiniLotto, error: eS }] = await Promise.all([
        supabase.from("animali").select("id,bdn,nome,specie,sesso,nascita,stato,data_uscita,motivo_uscita,data_ingresso,razza,riproduttore"),
        supabase.from("lotti_suini").select("*"),
        supabase.from("suini_lotto").select("*"),
      ]);
      if (eA || eL || eS) throw new Error((eA || eL || eS).message);

      const righeUba = calcolaReportUba(animali || [], lotti || [], suiniLotto || [], anno);
      if (righeUba.length === 0) {
        alert(`Nessun animale presente nell'anno ${anno}. Verifica prima con "Report UBA".`);
        setCalcolando(false);
        return;
      }
      const ubaGiorniProduttiviAziendali = righeUba.filter(r => r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0);
      const ubaGiorniProduttiviPerSpecie = {
        bovino: righeUba.filter(r => r.specie === "bovino" && r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0),
        suino: righeUba.filter(r => r.specie === "suino" && r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0),
        ovino: righeUba.filter(r => r.specie === "ovino" && r.categoria_contabile !== "IMPRODUTTIVO_USCITO").reduce((s, r) => s + r.uba_giorni, 0),
      };

      const { data: fattureAnno, error: eF } = await supabase
        .from("ci_fatture").select("id, data").eq("tipo", "PASSIVA")
        .gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`);
      if (eF) throw new Error(eF.message);
      const idFattureAnno = (fattureAnno || []).map(f => f.id);

      let articoliAnno = [];
      if (idFattureAnno.length > 0) {
        const { data: articoli, error: eArt } = await supabase
          .from("ci_articoli_fattura").select("totale_riga, tipo_costo, destinazione, area, centro_costo")
          .in("fattura_id", idFattureAnno).in("tipo_costo", ["Fisso", "Variabile"]);
        if (eArt) throw new Error(eArt.message);
        articoliAnno = numerizzaCampi(articoli || [], ["totale_riga"]);
      }

      const { data: cespiti, error: eC } = await supabase.from("ci_cespiti").select("id, specie, categoria");
      if (eC) throw new Error(eC.message);
      const mappaCespiteSpecie = new Map((cespiti || []).map(c => [c.id, c.specie || []]));
      const mappaCespiteCategoria = new Map((cespiti || []).map(c => [c.id, c.categoria || "Senza categoria"]));
      const idCespiti = (cespiti || []).map(c => c.id);
      let quoteAnno = [];
      if (idCespiti.length > 0) {
        const { data: quote, error: eQ } = await supabase
          .from("ci_cespiti_ammortamento").select("quota, cespite_id").eq("anno", anno).in("cespite_id", idCespiti);
        if (eQ) throw new Error(eQ.message);
        quoteAnno = numerizzaCampi(quote || [], ["quota"]);
      }

      function calcolaPerGruppo(righeFiltrate) {
        const costiDiretti = { bovino: 0, suino: 0, ovino: 0, generale: 0 };
        righeFiltrate.forEach(r => { costiDiretti[classificaDestinazione((r.destinazione || "").trim())] += (r.totale_riga || 0); });
        return calcolaRigaAggregata(costiDiretti, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali);
      }

      // --- Aree ordinarie, con sotto-righe per Centro di Costo ---
      const gruppiRisultato = AREE_ORDINARIE.map(area => {
        const righeArea = articoliAnno.filter(r => (r.area || "").trim() === area);
        if (righeArea.length === 0) return null;
        const rigaArea = { area, ...calcolaPerGruppo(righeArea) };

        const centri = [...new Set(righeArea.map(r => (r.centro_costo || "Senza centro di costo").trim() || "Senza centro di costo"))];
        const sottoRighe = centri.map(centro => {
          const righeCentro = righeArea.filter(r => ((r.centro_costo || "Senza centro di costo").trim() || "Senza centro di costo") === centro);
          return { etichetta: centro, ...calcolaPerGruppo(righeCentro) };
        }).filter(r => r.imponibileComplessivo > 0);

        return { area, riga: rigaArea, sottoRighe };
      }).filter(Boolean);

      // --- Ammortamenti: separo "Nessuno" (zona rossa) dal resto, poi suddivido per Categoria ---
      const righeAmmortamentoConSpecie = [];
      let quoteNessunoTotale = 0;
      quoteAnno.forEach(r => {
        const specieCespite = mappaCespiteSpecie.get(r.cespite_id) || [];
        if (specieCespite.length === 0) { quoteNessunoTotale += (r.quota || 0); return; }
        righeAmmortamentoConSpecie.push({ ...r, specieCespite, categoria: mappaCespiteCategoria.get(r.cespite_id) });
      });

      if (righeAmmortamentoConSpecie.length > 0) {
        function calcolaPerGruppoAmmortamento(righeFiltrate) {
          const costiDiretti = { bovino: 0, suino: 0, ovino: 0, generale: 0 };
          righeFiltrate.forEach(r => {
            const specieMatch = Object.entries(MAPPA_SPECIE).find(([, v]) => r.specieCespite.includes(v));
            costiDiretti[specieMatch ? specieMatch[0] : "generale"] += (r.quota || 0);
          });
          return calcolaRigaAggregata(costiDiretti, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali);
        }
        const rigaAmmortamenti = { area: "Ammortamenti", ...calcolaPerGruppoAmmortamento(righeAmmortamentoConSpecie) };
        const categorie = [...new Set(righeAmmortamentoConSpecie.map(r => r.categoria))];
        const sottoRigheAmmortamenti = categorie.map(cat => {
          const righeCat = righeAmmortamentoConSpecie.filter(r => r.categoria === cat);
          return { etichetta: cat, ...calcolaPerGruppoAmmortamento(righeCat) };
        }).filter(r => r.imponibileComplessivo > 0);

        gruppiRisultato.push({ area: "Ammortamenti", riga: rigaAmmortamenti, sottoRighe: sottoRigheAmmortamenti });
      }

      // --- Zona rossa ---
      const costiOrto = articoliAnno.filter(r => (r.area || "").trim() === "Orto").reduce((s, r) => s + (r.totale_riga || 0), 0);
      const costiAnimaliNonAllevamento = articoliAnno.filter(r => (r.area || "").trim() === "Animali non d'allevamento").reduce((s, r) => s + (r.totale_riga || 0), 0);
      const zonaRossa = [
        { label: "Orto", valore: costiOrto },
        { label: "Animali non d'allevamento", valore: costiAnimaliNonAllevamento },
        { label: "Ammortamenti (Imputazione: Nessuno)", valore: round2(quoteNessunoTotale) },
      ].filter(r => r.valore > 0).map(r => ({
        ...r, tasso: ubaGiorniProduttiviAziendali > 0 ? Math.round(r.valore / ubaGiorniProduttiviAziendali * 1000000) / 1000000 : 0,
      }));

      setGruppi(gruppiRisultato);
      setRigaRossa(zonaRossa);
    } catch (err) {
      alert(`⚠️ Errore nel calcolo:\n\n${err.message}`);
    }
    setCalcolando(false);
  }

  function toggleEspanso(area) {
    setEspansi(prev => ({ ...prev, [area]: !prev[area] }));
  }

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Report per Area e Centro di Costo</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Come Report per Area, ma con il dettaglio di ogni Centro di Costo sotto l'area (per gli Ammortamenti, la Categoria Ammortamento fa le veci del centro di costo). Clicca su un'area per espandere.
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Anno</label>
            <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
              style={{ padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, width: 100 }} />
          </div>
          <button onClick={calcola} disabled={calcolando}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {calcolando ? "Calcolo..." : "📊 Calcola"}
          </button>
        </div>
      </div>

      {gruppi && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto", marginBottom: 16 }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead style={{ background: C.primary, color: "#fff" }}>
              <tr>
                <th style={th} rowSpan={2}>Area / Centro di Costo</th>
                <th style={th} rowSpan={2}>Imponibile<br />complessivo</th>
                <th style={th} rowSpan={2}>€/UBA-gg<br />(tutte le specie)</th>
                <th style={{ ...th, borderLeft: "1px solid #ffffff55" }} colSpan={2}>Bovini</th>
                <th style={{ ...th, borderLeft: "1px solid #ffffff55" }} colSpan={2}>Suini (suini+lotti)</th>
                <th style={{ ...th, borderLeft: "1px solid #ffffff55" }} colSpan={2}>Ovini</th>
              </tr>
              <tr>
                <th style={{ ...th, borderLeft: "1px solid #ffffff55" }}>Costo allocato</th>
                <th style={th}>€/UBA-gg</th>
                <th style={{ ...th, borderLeft: "1px solid #ffffff55" }}>Costo allocato</th>
                <th style={th}>€/UBA-gg</th>
                <th style={{ ...th, borderLeft: "1px solid #ffffff55" }}>Costo allocato</th>
                <th style={th}>€/UBA-gg</th>
              </tr>
            </thead>
            <tbody>
              {gruppi.map(g => (
                <Fragment key={g.area}>
                  <tr key={g.area} onClick={() => toggleEspanso(g.area)}
                    style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer", background: C.primary + "10" }}>
                    <td style={{ ...td, fontWeight: 800 }}>{espansi[g.area] ? "▼" : "▶"} {g.area}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(g.riga.imponibileComplessivo)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(g.riga.tassoArea, 4)}</td>
                    <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(g.riga.perSpecie.bovino.costoAllocato)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(g.riga.perSpecie.bovino.incidenza, 4)}</td>
                    <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(g.riga.perSpecie.suino.costoAllocato)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(g.riga.perSpecie.suino.incidenza, 4)}</td>
                    <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(g.riga.perSpecie.ovino.costoAllocato)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{formattaEuro(g.riga.perSpecie.ovino.incidenza, 4)}</td>
                  </tr>
                  {espansi[g.area] && g.sottoRighe.map(sr => (
                    <tr key={g.area + sr.etichetta} style={{ borderTop: `1px solid ${C.border}`, background: "#FAFAF8" }}>
                      <td style={{ ...td, paddingLeft: 28, color: C.muted }}>↳ {sr.etichetta}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(sr.imponibileComplessivo)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(sr.tassoArea, 4)}</td>
                      <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(sr.perSpecie.bovino.costoAllocato)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(sr.perSpecie.bovino.incidenza, 4)}</td>
                      <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(sr.perSpecie.suino.costoAllocato)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(sr.perSpecie.suino.incidenza, 4)}</td>
                      <td style={{ ...td, textAlign: "right", borderLeft: `1px solid ${C.border}` }}>{formattaEuro(sr.perSpecie.ovino.costoAllocato)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{formattaEuro(sr.perSpecie.ovino.incidenza, 4)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rigaRossa && rigaRossa.length > 0 && (
        <div style={{ background: "#FDECEC", border: `1.5px solid ${C.red}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 8 }}>⚠️ ORTO, ANIMALI NON D'ALLEVAMENTO E AMMORTAMENTI SENZA IMPUTAZIONE</div>
          <table style={{ width: "100%", fontSize: 13 }}>
            <thead>
              <tr style={{ color: C.muted, textAlign: "left" }}>
                <th style={{ padding: "4px 8px" }}></th>
                <th style={{ padding: "4px 8px", textAlign: "right" }}>Imponibile complessivo</th>
                <th style={{ padding: "4px 8px", textAlign: "right" }}>€/UBA-gg (tutte le specie)</th>
              </tr>
            </thead>
            <tbody>
              {rigaRossa.map(r => (
                <tr key={r.label} style={{ borderTop: `1px solid ${C.red}55` }}>
                  <td style={{ padding: "6px 8px", fontWeight: 700, color: C.red }}>{r.label}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: C.red }}>{formattaEuro(r.valore)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: C.red }}>{formattaEuro(r.tasso, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = { padding: "8px 8px", textAlign: "center", fontSize: 11, fontWeight: 700 };
const td = { padding: "6px 8px", fontSize: 12 };
