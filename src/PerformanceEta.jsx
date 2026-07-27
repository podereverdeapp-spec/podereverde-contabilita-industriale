import { useState, useEffect } from "react";
import { C } from "./style";
import { formattaNumero, formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { calcolaPerformanceEta } from "./calcoloPerformanceEta";

const SPECIE_LABEL = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };

// Colori distinti per ciascuna coppia €/kg (richiesto da Filippo) — i dati "singoli"
// (peso, IPG, coefficiente, giorni, N. animali) restano su sfondo bianco.
const COLORE_COPPIA_1 = "#EBF3F9"; // €/gg — kg/gg per capo
const COLORE_COPPIA_2 = "#EAF2E8"; // Costo — Consumo complessivo fascia
const COLORE_COPPIA_3 = "#FFF2DC"; // Costo per kg incremento peso — Kg mangime per kg incremento peso

export default function PerformanceEta({ onNavigate }) {
  const [dati, setDati] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [annoMangime, setAnnoMangime] = useState(new Date().getFullYear());

  useEffect(() => { carica(); }, []);

  async function carica() {
    setLoading(true);
    setErrore(null);
    try {
      setDati(await calcolaPerformanceEta(annoMangime));
    } catch (err) {
      setErrore(err.message);
    }
    setLoading(false);
  }

  function esporta() {
    if (!dati) return;
    const fogli = [];
    for (const specie of ["bovino", "suino", "ovino"]) {
      const d = dati[specie];
      if (!d) continue;
      const righe = [];
      ["stepVivo", "stepCarcassa"].forEach(chiave => {
        const tipoPeso = chiave === "stepVivo" ? "Vivo" : "Carcassa";
        d[chiave].forEach(s => {
          righe.push({
            "Tipo peso": tipoPeso, "Fascia": s.label,
            "Peso ingresso (kg)": s.datiSufficienti ? numeroExcel(s.pesoIngresso) : null,
            "Peso uscita (kg)": s.datiSufficienti ? numeroExcel(s.pesoUscita) : null,
            "IPG (kg/gg)": s.datiSufficienti ? numeroExcel(s.ipg) : null,
            "Coefficiente UBA": numeroExcel(s.coeffUba),
            "€/gg per capo": s.costoGiornalieroPerCapo != null ? numeroExcel(s.costoGiornalieroPerCapo) : null,
            "Kg/gg per capo": s.kgMangimeGiornalieroPerCapo != null ? numeroExcel(s.kgMangimeGiornalieroPerCapo) : null,
            "Giorni fascia": s.giorniFascia,
            "Costo fascia (€)": s.costoComplessivoFascia != null ? numeroExcel(s.costoComplessivoFascia) : null,
            "Consumo fascia (kg)": s.consumoComplessivoFascia != null ? numeroExcel(s.consumoComplessivoFascia) : null,
            "Costo per kg incremento peso": s.costoMangimeKg != null ? numeroExcel(s.costoMangimeKg) : null,
            "Kg mangime per kg incremento peso": s.fcrMangime != null ? numeroExcel(s.fcrMangime) : null,
            "N. animali": s.nAnimali,
            "Dati sufficienti": s.datiSufficienti ? "Sì" : "No",
          });
        });
      });
      fogli.push({ nome: SPECIE_LABEL[specie], righe });
    }
    esportaExcel(`PerformanceEta_${annoMangime}`, fogli);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1500, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Performance per Fascia d'Età</h1>
        {dati && (
          <button onClick={esporta}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            📥 Esporta Excel
          </button>
        )}
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Peso stimato all'ingresso/uscita di ogni fascia d'età e IPG (Incremento Peso Giornaliero) — basato sui dati disponibili oggi, anche se pochi o parziali (alcuni animali hanno solo il peso vivo, altri solo la carcassa). Si affina automaticamente man mano che si accumulano pesate in podereverdeapp.it.
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Come si calcola questa pagina</div>
        <p style={{ fontSize: 12, color: C.text, margin: 0, lineHeight: 1.6 }}>
          Due metodi affiancati per ogni specie: <strong>Metodo A</strong> (fasce indipendenti) stima ogni fascia d'età per conto proprio, con gli animali usciti proprio in quella fascia — semplice, ma fragile quando pochi animali cadono in una fascia. <strong>Metodo B</strong> (curva di Gompertz) adatta un'unica curva di crescita a tutti gli animali della specie insieme, separatamente per maschi e femmine (un maschio adulto pesa — e mangia — più di una femmina adulta), poi mostra qui sotto la <strong>media ponderata</strong> sulla composizione reale maschi/femmine osservata in ciascuna fascia. Le colonne €/kg e FCR usano <strong>solo il costo mangime</strong> dell'anno scelto sotto — primo passo di un percorso più ampio, un centro di costo alla volta.
        </p>
        <p style={{ fontSize: 12, color: C.text, margin: "10px 0 0 0", lineHeight: 1.6 }}>
          Le curve Solo Maschi e Solo Femmine che compongono la media ponderata sono su due pagine dedicate:
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={() => onNavigate?.("performanceeta-maschi")}
            style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            ♂️ Vedi Solo Maschi
          </button>
          <button onClick={() => onNavigate?.("performanceeta-femmine")}
            style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            ♀️ Vedi Solo Femmine
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <label style={{ fontSize: 13, color: C.muted }}>Anno di riferimento per il costo mangime:</label>
        <input type="number" value={annoMangime} onChange={e => setAnnoMangime(parseInt(e.target.value))}
          style={{ width: 100, padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
        <button onClick={carica} disabled={loading}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "Calcolo..." : "Ricalcola"}
        </button>
      </div>

      {loading ? <p style={{ color: C.muted }}>Calcolo in corso...</p> : errore ? (
        <p style={{ color: C.red }}>⚠️ {errore}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {["bovino", "suino", "ovino"].map(specie => {
            const d = dati[specie];
            if (!d) return null;
            return (
              <div key={specie}>
                <h2 style={{ color: C.primary, fontSize: 18, marginBottom: 4 }}>{SPECIE_LABEL[specie]}</h2>
                <p style={{ color: C.muted, fontSize: 12, marginTop: 0, marginBottom: 10 }}>
                  {d.nAnimaliTotali} animali usciti totali — {d.nConPesoVivo} con peso vivo noto, {d.nConPesoCarcassa} con peso carcassa noto.
                </p>
                {d.nAnimaliTotali === 0 ? (
                  <p style={{ color: C.muted, fontSize: 13 }}>Nessun animale uscito con data di nascita e uscita note.</p>
                ) : (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>METODO A — Fasce indipendenti</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                      <TabellaStep titolo="Peso vivo" step={d.stepVivo} />
                      <TabellaStep titolo="Peso carcassa" step={d.stepCarcassa} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>
                      METODO B — Media ponderata M/F (curva di Gompertz)
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16, overflowX: "auto" }}>
                      {d.stepVivoDaCurva ? <TabellaStepCurva titolo={`Peso vivo — maturo M: ${d.curveVivoPerSesso.M ? formattaNumero(d.curveVivoPerSesso.M.A, 0) + " kg" : "—"}, F: ${d.curveVivoPerSesso.F ? formattaNumero(d.curveVivoPerSesso.F.A, 0) + " kg" : "—"}`} step={d.stepVivoDaCurva} /> : <NotaPochiDati />}
                      {d.stepCarcassaDaCurva ? <TabellaStepCurva titolo={`Peso carcassa — maturo M: ${d.curveCarcassaPerSesso.M ? formattaNumero(d.curveCarcassaPerSesso.M.A, 0) + " kg" : "—"}, F: ${d.curveCarcassaPerSesso.F ? formattaNumero(d.curveCarcassaPerSesso.F.A, 0) + " kg" : "—"}`} step={d.stepCarcassaDaCurva} /> : <NotaPochiDati />}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabellaStep({ titolo, step }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ background: C.primary, color: "#fff", padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>{titolo}</div>
      <table style={{ width: "100%", fontSize: 12 }}>
        <thead>
          <tr style={{ color: C.muted, textAlign: "left" }}>
            <th style={{ padding: "6px 8px" }}>Fascia</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Peso ingr. (kg)</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Peso usc. (kg)</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>IPG (kg/gg)</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Coeff. UBA</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>€/gg per capo</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Kg/gg per capo</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Giorni fascia</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Costo fascia (€)</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Consumo fascia (kg)</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Costo per kg incremento peso</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Kg mangime per kg incremento peso</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>N. animali</th>
          </tr>
        </thead>
        <tbody>
          {step.map((s, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: "6px 8px" }}>{s.label}</td>
              {s.datiSufficienti ? (
                <>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{s.pesoIngresso != null ? formattaNumero(s.pesoIngresso, 1) : "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    {s.pesoUscita != null ? formattaNumero(s.pesoUscita, 1) : "—"}
                    {s.proiezioneInstabile && <span title="Proiezione instabile con questi pochi dati — peso mantenuto stabile invece di propagare un valore innaturale" style={{ color: C.yellow, marginLeft: 4 }}>⚠️</span>}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{s.ipg != null ? formattaNumero(s.ipg, 3) : "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: C.muted }}>{formattaNumero(s.coeffUba, 3)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: C.muted }}>{s.costoGiornalieroPerCapo != null ? formattaEuro(s.costoGiornalieroPerCapo, 3) : "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: C.muted }}>{s.kgMangimeGiornalieroPerCapo != null ? formattaNumero(s.kgMangimeGiornalieroPerCapo, 3) : "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: C.muted }}>{s.giorniFascia ?? "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{s.costoComplessivoFascia != null ? formattaEuro(s.costoComplessivoFascia, 2) : "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{s.consumoComplessivoFascia != null ? formattaNumero(s.consumoComplessivoFascia, 1) : "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{s.costoMangimeKg != null ? formattaEuro(s.costoMangimeKg, 2) : "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{s.fcrMangime != null ? formattaNumero(s.fcrMangime, 2) : "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{s.nAnimali}</td>
                </>
              ) : (
                <td colSpan={12} style={{ padding: "6px 8px", textAlign: "center", color: C.muted, fontStyle: "italic" }}>
                  Dati insufficienti ({s.nAnimali} animal{s.nAnimali === 1 ? "e" : "i"} — ne servono almeno 2 con peso noto)
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TabellaStepCurva({ titolo, step }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ background: C.accent, color: "#fff", padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>{titolo}</div>
      <table style={{ width: "100%", fontSize: 12 }}>
        <thead>
          <tr style={{ color: C.muted, textAlign: "left" }}>
            <th style={{ padding: "6px 8px" }}>Fascia</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Peso ingr. (kg)</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Peso usc. (kg)</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>IPG (kg/gg)</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Coeff. UBA</th>
            <th style={{ padding: "6px 8px", textAlign: "right", background: COLORE_COPPIA_1 }}>€/gg per capo</th>
            <th style={{ padding: "6px 8px", textAlign: "right", background: COLORE_COPPIA_1 }}>Kg/gg per capo</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Giorni fascia</th>
            <th style={{ padding: "6px 8px", textAlign: "right", background: COLORE_COPPIA_2 }}>Costo fascia (€)</th>
            <th style={{ padding: "6px 8px", textAlign: "right", background: COLORE_COPPIA_2 }}>Consumo fascia (kg)</th>
            <th style={{ padding: "6px 8px", textAlign: "right", background: COLORE_COPPIA_3 }}>Costo per kg incremento peso</th>
            <th style={{ padding: "6px 8px", textAlign: "right", background: COLORE_COPPIA_3 }}>Kg mangime per kg incremento peso</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>% Maschi</th>
          </tr>
        </thead>
        <tbody>
          {step.map((s, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: "6px 8px" }}>{s.label}</td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>{formattaNumero(s.pesoIngresso, 1)}</td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>{s.pesoUscita != null ? formattaNumero(s.pesoUscita, 1) : "—"}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{s.ipg != null ? formattaNumero(s.ipg, 3) : "—"}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", color: C.muted }}>{formattaNumero(s.coeffUba, 3)}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", background: COLORE_COPPIA_1 }}>{s.costoGiornalieroPerCapo != null ? formattaEuro(s.costoGiornalieroPerCapo, 3) : "—"}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", background: COLORE_COPPIA_1 }}>{s.kgMangimeGiornalieroPerCapo != null ? formattaNumero(s.kgMangimeGiornalieroPerCapo, 3) : "—"}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", color: C.muted }}>{s.giorniFascia ?? "—"}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", background: COLORE_COPPIA_2, fontWeight: 700 }}>{s.costoComplessivoFascia != null ? formattaEuro(s.costoComplessivoFascia, 2) : "—"}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", background: COLORE_COPPIA_2, fontWeight: 700 }}>{s.consumoComplessivoFascia != null ? formattaNumero(s.consumoComplessivoFascia, 1) : "—"}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", background: COLORE_COPPIA_3 }}>{s.costoMangimeKg != null ? formattaEuro(s.costoMangimeKg, 2) : "—"}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", background: COLORE_COPPIA_3 }}>{s.fcrMangime != null ? formattaNumero(s.fcrMangime, 2) : "—"}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", color: C.muted }} title={`${s.nM} maschi, ${s.nF} femmine con questo dato in questa fascia`}>{formattaNumero(s.percM, 0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NotaPochiDati() {
  return <p style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Servono almeno 4 animali con quel peso noto per adattare la curva in modo affidabile.</p>;
}

export function TabellaStepSemplice({ titolo, step }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ background: C.muted, color: "#fff", padding: "6px 12px", fontSize: 12, fontWeight: 700 }}>{titolo}</div>
      <table style={{ width: "100%", fontSize: 11 }}>
        <thead>
          <tr style={{ color: C.muted, textAlign: "left" }}>
            <th style={{ padding: "5px 8px" }}>Fascia</th>
            <th style={{ padding: "5px 8px", textAlign: "right" }}>Peso ingr. (kg)</th>
            <th style={{ padding: "5px 8px", textAlign: "right" }}>Peso usc. (kg)</th>
            <th style={{ padding: "5px 8px", textAlign: "right" }}>IPG (kg/gg)</th>
            <th style={{ padding: "5px 8px", textAlign: "right" }}>Coeff. UBA</th>
            <th style={{ padding: "5px 8px", textAlign: "right", background: COLORE_COPPIA_1 }}>€/gg per capo</th>
            <th style={{ padding: "5px 8px", textAlign: "right", background: COLORE_COPPIA_1 }}>Kg/gg per capo</th>
            <th style={{ padding: "5px 8px", textAlign: "right" }}>Giorni fascia</th>
            <th style={{ padding: "5px 8px", textAlign: "right", background: COLORE_COPPIA_2 }}>Costo fascia (€)</th>
            <th style={{ padding: "5px 8px", textAlign: "right", background: COLORE_COPPIA_2 }}>Consumo fascia (kg)</th>
            <th style={{ padding: "5px 8px", textAlign: "right", background: COLORE_COPPIA_3 }}>Costo per kg incremento peso</th>
            <th style={{ padding: "5px 8px", textAlign: "right", background: COLORE_COPPIA_3 }}>Kg mangime per kg incremento peso</th>
          </tr>
        </thead>
        <tbody>
          {step.map((s, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: "5px 8px" }}>{s.label}</td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>{formattaNumero(s.pesoIngresso, 1)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>{s.pesoUscita != null ? formattaNumero(s.pesoUscita, 1) : "—"}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>{s.ipg != null ? formattaNumero(s.ipg, 3) : "—"}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", color: C.muted }}>{formattaNumero(s.coeffUba, 3)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", background: COLORE_COPPIA_1 }}>{s.costoGiornalieroPerCapo != null ? formattaEuro(s.costoGiornalieroPerCapo, 3) : "—"}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", background: COLORE_COPPIA_1 }}>{s.kgMangimeGiornalieroPerCapo != null ? formattaNumero(s.kgMangimeGiornalieroPerCapo, 3) : "—"}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", color: C.muted }}>{s.giorniFascia ?? "—"}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", background: COLORE_COPPIA_2, fontWeight: 700 }}>{s.costoComplessivoFascia != null ? formattaEuro(s.costoComplessivoFascia, 2) : "—"}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", background: COLORE_COPPIA_2, fontWeight: 700 }}>{s.consumoComplessivoFascia != null ? formattaNumero(s.consumoComplessivoFascia, 1) : "—"}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", background: COLORE_COPPIA_3 }}>{s.costoMangimeKg != null ? formattaEuro(s.costoMangimeKg, 2) : "—"}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", background: COLORE_COPPIA_3 }}>{s.fcrMangime != null ? formattaNumero(s.fcrMangime, 2) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
