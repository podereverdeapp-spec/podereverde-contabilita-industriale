// Razioni Bovini (versione 244): parti di pagina comuni — grafico del fabbisogno coperto,
// tabella degli alimenti con TOTALE COSTO, riquadro «Totale del costo», tabella fabbisogno e apporto.
import { C } from "./style";
import { formattaNumero } from "./parsingUtils";
import { ANNO_CORRENTE } from "./RazioniBoviniDati";
import { testoPercentuale, decimaliMancante } from "./calcoloRazione";

export const COLORE_STATO = { manca: C.red, coperto: C.green, eccessivo: "#E67E22", "—": C.muted };
export const riquadro = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 };
export const campo = { padding: "7px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: "#FFF8E1", width: "100%", boxSizing: "border-box" };
export const etichetta = { fontSize: 12, color: C.muted, display: "block", marginBottom: 3 };
// quantità esatta: kg con almeno 2 decimali, grammi interi; più decimali solo se servono (fino a 3)
export function testoQuantita(valore, grammi) {
  const x = Number(valore);
  if (!Number.isFinite(x)) return "—";
  let d = grammi ? 0 : 2;
  while (d < 3 && Math.abs(Math.round(x * 10 ** d) - x * 10 ** d) > 1e-6) d++;
  return formattaNumero(x, d) + (grammi ? " g" : " kg");
}
export const euro = (v, decimali = 2) => (v === null || v === undefined ? "—" : formattaNumero(v, decimali) + " €");
export function bottone(colore) {
  return { background: colore, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
}

export function GraficoCopertura({ ris, soglia }) {
  return (
    <div style={riquadro}>
      <div style={{ fontWeight: 700, color: C.primary, marginBottom: 10 }}>Fabbisogno coperto per capo</div>
      {ris.voci.map(v => {
        const pct = v.pct === null ? 0 : v.pct;
        const w = Math.min(pct, 150) / 150 * 100;
        const col = COLORE_STATO[v.stato];
        const testo = v.pct === null ? "—" : testoPercentuale(v) + (v.stato === "manca" ? " — manca" : v.stato === "eccessivo" ? " — ECCESSIVO" : "") + (v.stato === "manca" && v.incompleta?.length ? " (dati incompleti)" : "");
        return (
          <div key={v.chiave} style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0", fontSize: 12.5 }}>
            <div style={{ width: 170 }}>{v.nome}</div>
            <div style={{ flex: 1, height: 13, background: "#EEE", borderRadius: 3, position: "relative" }}>
              <div style={{ width: `${w}%`, height: "100%", background: col, borderRadius: 3, transition: "width .3s" }} />
              <div style={{ position: "absolute", left: "66.67%", top: -3, bottom: -3, borderLeft: "2px dashed #333" }} />
            </div>
            <div style={{ width: 210, textAlign: "right", fontWeight: 700, color: col }}>{testo}</div>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Linea tratteggiata = 100% del fabbisogno · rosso: manca · verde: coperto · arancione: eccessivo (energia e proteine oltre il {soglia || 110}%) · le barre si fermano al 150%.</div>
    </div>
  );
}

// tabella degli alimenti in sola lettura (Razioni di riferimento)
export function TabellaAlimenti({ ris, alimentiPerNome }) {
  const righe = ris.righe.filter(r => r.alimento && r.kg > 0);
  return (
    <div style={riquadro}>
      <div style={{ fontWeight: 700, color: C.primary, marginBottom: 10 }}>Alimenti della razione</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 13, width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>
            {["Gruppo", "Alimento", "Quantità al giorno per capo", "Prezzo € per tonnellata", "€ al giorno per capo", "Quantità al giorno per tutti i capi", "€ al giorno per tutti i capi"].map(h => <th key={h} style={{ padding: 6, fontSize: 11.5 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {righe.map((r, i) => {
              const grammi = alimentiPerNome[r.alimento]?.unita_dose === "grammi";
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: 6, color: C.muted, fontSize: 12 }}>{r.gruppo}</td>
                  <td style={{ padding: 6 }}>{r.alimento}</td>
                  <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>{grammi ? testoQuantita(r.quantita, true) : testoQuantita(r.kg)}</td>
                  <td style={{ padding: 6, textAlign: "right", color: r.fonte === "listino" ? "#8A5A00" : C.text }}>{r.prezzoEuroT ? formattaNumero(r.prezzoEuroT, 2) + (r.fonte === "listino" ? " (listino)" : "") : "prezzo mancante"}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{r.costoCapo != null ? formattaNumero(r.costoCapo, 3) : "—"}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{grammi ? testoQuantita(Number(r.quantita) * ris.numeroCapi, true) : testoQuantita(r.kgTutti)}</td>
                  <td style={{ padding: 6, textAlign: "right", fontWeight: 700 }}>{r.costoTutti != null ? formattaNumero(r.costoTutti, 3) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr style={{ background: "#DCE8D8", fontWeight: 800 }}>
            <td colSpan={4} style={{ padding: 8 }}>TOTALE COSTO AL GIORNO</td>
            <td style={{ padding: 8, textAlign: "right" }}>{euro(ris.costi.capoGiorno, 3)}</td>
            <td></td>
            <td style={{ padding: 8, textAlign: "right" }}>{euro(ris.costi.tuttiGiorno, 3)}</td>
          </tr></tfoot>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Sostanza secca della razione: {formattaNumero(ris.sostanzaSeccaKg, 2)} kg per capo · concentrati sulla sostanza secca: {formattaNumero(ris.quotaConcentratoPct, 0)}%</div>
    </div>
  );
}

export function TotaleCosto({ ris }) {
  return (
    <div style={{ ...riquadro, background: "#EEF4EC", border: `2px solid ${C.primary}` }}>
      <div style={{ fontWeight: 800, color: C.primary, fontSize: 17, marginBottom: 10 }}>💶 Totale del costo</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        {[["Per capo al giorno", ris.costi.capoGiorno], ["Per capo all'anno", ris.costi.capoAnno], [`Per ${ris.numeroCapi} capi al giorno`, ris.costi.tuttiGiorno], [`Per ${ris.numeroCapi} capi al mese (30 giorni)`, ris.costi.tuttiMese], [`Per ${ris.numeroCapi} capi all'anno`, ris.costi.tuttiAnno], ["Per kg di crescita", ris.costi.perKgCrescita]].map(([t, v]) => (
          <div key={t} style={{ background: "#fff", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 12, color: C.muted }}>{t}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{euro(v)}</div>
          </div>
        ))}
      </div>
      {!ris.costi.completo && <div style={{ color: C.red, fontSize: 12.5, marginTop: 8, fontWeight: 700 }}>⚠️ Nel {ANNO_CORRENTE} manca il prezzo di: {ris.prezziMancanti.join(", ")}. Il totale non è completo.</div>}
      {ris.prezziListino.length > 0 && <div style={{ color: "#8A5A00", fontSize: 12, marginTop: 6 }}>Prezzo di listino, non di fattura: {ris.prezziListino.join(", ")}.</div>}
    </div>
  );
}

export function TabellaFabbisogno({ ris, children }) {
  return (
    <div style={riquadro}>
      <div style={{ fontWeight: 700, color: C.primary, marginBottom: 10 }}>Fabbisogno e apporto per capo al giorno</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 12.5, width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Voce", "Fabbisogno", "Apporto", "Copertura", "Esito"].map(h => <th key={h} style={{ padding: 6 }}>{h}</th>)}</tr></thead>
          <tbody>{ris.voci.map(v => (
            <tr key={v.chiave} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: 6 }}>{v.nome}{v.unita && v.chiave !== "energia" ? ` (${v.unita})` : ""}</td>
              <td style={{ padding: 6, textAlign: "right" }}>{v.fabbisogno === null ? "—" : formattaNumero(v.fabbisogno, v.decimali)}</td>
              <td style={{ padding: 6, textAlign: "right" }}>{formattaNumero(v.apporto, v.decimali)}</td>
              <td style={{ padding: 6, textAlign: "right" }}>{testoPercentuale(v)}</td>
              <td style={{ padding: 6, color: COLORE_STATO[v.stato], fontWeight: 700 }}>
                {v.stato === "manca" ? `manca ${formattaNumero(v.mancaQuanto, decimaliMancante(v))}` : v.stato === "eccessivo" ? "ECCESSIVO" : v.stato === "coperto" ? "✓ coperto" : "—"}
                {v.incompleta?.length > 0 && <span style={{ color: "#8A5A00", fontWeight: 400 }}> · non analizzato o non dichiarato in: {v.incompleta.join(", ")}</span>}
              </td>
            </tr>))}</tbody>
        </table>
      </div>
      {children}
    </div>
  );
}
