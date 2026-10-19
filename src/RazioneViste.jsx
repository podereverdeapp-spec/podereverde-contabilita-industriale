// Razioni Bovini (versione 244): parti di pagina comuni — grafico del fabbisogno coperto,
// tabella degli alimenti con TOTALE COSTO, riquadro «Totale del costo», tabella fabbisogno e apporto.
import { useState, useMemo } from "react";
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

// Prezzo modificabile (versione 245): in ogni tabella interattiva compare il prezzo di riferimento
// della scheda prezzi (fatture o autoproduzione, preventivo, Borsa o ricerca online); si può scrivere un altro prezzo, che vale solo per il calcolo
// in pagina (e per la razione salvata, in Costruisci razione) e non cambia il database.
export function usePrezziModificabili(prezziRiferimento, iniziali = {}) {
  const [modificati, setModificati] = useState(iniziali);
  const prezzi = useMemo(() => {
    const p = { ...prezziRiferimento };
    Object.entries(modificati).forEach(([nome, v]) => {
      const x = Number(v);
      if (v !== "" && v !== null && Number.isFinite(x) && x >= 0) p[nome] = { alimento: nome, prezzo_euro_t: x, fonte_prezzo: "modificato" };
    });
    return p;
  }, [prezziRiferimento, modificati]);
  return {
    prezzi, modificati,
    riferimento: nome => prezziRiferimento[nome] || null,
    cambia: (nome, v) => setModificati(m => ({ ...m, [nome]: v })),
    ripristina: nome => setModificati(m => { const x = { ...m }; delete x[nome]; return x; }),
    ripristinaTutti: () => setModificati({}),
    imposta: m => setModificati(m || {}),
  };
}

const accorcia = t => { const x = t.split(" (")[0]; if (x.length <= 48) return x; const c = x.slice(0, 48); return c.slice(0, c.lastIndexOf(" ")) + "…"; };
// fonte del prezzo di riferimento (scheda prezzi, versione 245)
export function etichettaFonte(r) {
  if (!r) return "nessun prezzo di riferimento";
  if (r.livello === "preventivo") return "preventivo " + (r.preventivo_fornitore || "");
  if (r.livello === "da verificare" && r.fonte_prezzo === "preventivo scaduto") return "da verificare · preventivo scaduto " + (r.preventivo_fornitore || "");
  if (r.livello === "da verificare") return r.fonte_prezzo === "indicativo" ? "da verificare · " + accorcia(String(r.indicativo_fonte || "Borsa o ricerca online")) : "da verificare · listino";
  if (r.fonte_prezzo === "produzione") return "autoproduzione " + (r.campagna || "");
  if (r.fonte_prezzo === "media produzione e acquisti") return "media autoproduzione e fatture " + ANNO_CORRENTE;
  if (r.fonte_prezzo === "listino") return "listino";
  return "fatture " + ANNO_CORRENTE + (r.ultimo_fornitore ? " · " + r.ultimo_fornitore : "");
}
export const coloreFonte = r => (!r ? C.red : r.livello === "preventivo" ? C.blue : r.livello === "da verificare" || r.fonte_prezzo === "listino" ? "#D35400" : C.text);
const testoRiferimento = r => (r && r.prezzo_euro_t != null ? formattaNumero(Number(r.prezzo_euro_t), 2) + " (" + etichettaFonte(r) + ")" : "nessuno");

export function CellaPrezzo({ nome, modifica }) {
  if (!nome) return null;
  const rif = modifica.riferimento(nome);
  const valoreMod = modifica.modificati[nome];
  const modificato = valoreMod !== undefined && valoreMod !== "";
  const valore = modificato ? valoreMod : (rif?.prezzo_euro_t != null ? Number(Number(rif.prezzo_euro_t).toFixed(2)) : "");
  return (
    <div style={{ whiteSpace: "nowrap" }}>
      <input type="number" min={0} step={0.01} value={valore} placeholder="prezzo mancante"
        onChange={e => modifica.cambia(nome, e.target.value)}
        title={"Prezzo di riferimento: " + testoRiferimento(rif)}
        style={{ ...campo, width: 110, textAlign: "right", background: modificato ? "#FFE0B2" : campo.background, fontWeight: modificato ? 700 : 400 }} />
      {modificato && <button onClick={() => modifica.ripristina(nome)} title="Torna al prezzo di riferimento" style={{ marginLeft: 4, border: "none", background: "transparent", cursor: "pointer", fontSize: 14 }}>↺</button>}
      <div style={{ fontSize: 10.5, color: modificato ? "#B35C00" : coloreFonte(rif), maxWidth: 190, whiteSpace: "normal", textAlign: "right" }}>
        {modificato ? "modificato · riferimento " + testoRiferimento(rif) : etichettaFonte(rif)}
      </div>
    </div>
  );
}

// Avviso dei prezzi non certi (versione 245): compare in ogni pagina delle razioni quando un alimento
// ha un prezzo da verificare (Borsa Merci, ricerca online, listino) o manca. Rimanda alla scheda prezzi e ai preventivi.
const CHIAVE_PRESCELTI = "alimentaria_preventivo_alimenti";
export function AvvisoPrezzi({ ris, prezzi, onNavigate }) {
  const incerti = [...new Set([...(ris?.prezziListino || []), ...(ris?.prezziMancanti || [])])];
  if (incerti.length === 0) return null;
  const testo = n => {
    const r = prezzi?.[n];
    if (!r || r.prezzo_euro_t == null) return n + " (prezzo mancante)";
    return n + " (" + etichettaFonte(r) + (r.indicativo_data ? ", " + new Date(r.indicativo_data + "T00:00:00").toLocaleDateString("it-IT") : "") + ")";
  };
  function chiedi() { try { sessionStorage.setItem(CHIAVE_PRESCELTI, JSON.stringify(incerti)); } catch { /* niente */ } onNavigate && onNavigate("chiedi-preventivi"); }
  return (
    <div style={{ ...riquadro, background: "#FFF1E6", border: "2px solid #D35400" }}>
      <div style={{ fontWeight: 800, color: "#D35400", fontSize: 14, marginBottom: 6 }}>⚠️ Prezzi non certi: il costo della razione è indicativo</div>
      <div style={{ fontSize: 12.5, marginBottom: 8 }}>{incerti.map(testo).join(" · ")}.</div>
      <div style={{ fontSize: 12.5, marginBottom: 8 }}>Specificare questi prezzi nella <b>scheda prezzi</b> (Alimentaria → Controlla prezzi e chiedi preventivi) e <b>chiedere i preventivi</b>: quando il preventivo è inserito, il prezzo diventa di riferimento e il costo si aggiorna.</div>
      {onNavigate && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => onNavigate("controlla-prezzi")} style={bottone("#D35400")}>Apri la scheda prezzi</button>
        <button onClick={chiedi} style={bottone(C.primary)}>Chiedi i preventivi per questi alimenti</button>
      </div>}
    </div>
  );
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
export function TabellaAlimenti({ ris, alimentiPerNome, modifica }) {
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
                  <td style={{ padding: 6, textAlign: "right", color: r.fonte === "listino" ? "#8A5A00" : C.text }}>{modifica ? <CellaPrezzo nome={r.alimento} modifica={modifica} /> : r.prezzoEuroT ? formattaNumero(r.prezzoEuroT, 2) + (r.fonte === "listino" ? " (da verificare)" : "") : "prezzo mancante"}</td>
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
      <RigaTotaliRazione ris={ris} />
      {modifica && <NotaPrezzi modifica={modifica} />}
    </div>
  );
}

export function RigaTotaliRazione({ ris }) {
  if (ris.specie === "suino") return <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Totale della razione: {formattaNumero(ris.totaleKg, 3)} kg per capo{ris.kgClasse ? ` (la classe mangia ${formattaNumero(ris.kgClasse, 2)} kg al giorno)` : ""}</div>;
  return <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Sostanza secca della razione: {formattaNumero(ris.sostanzaSeccaKg, 2)} kg per capo · concentrati sulla sostanza secca: {formattaNumero(ris.quotaConcentratoPct, 0)}%</div>;
}

export function NotaPrezzi({ modifica }) {
  const n = Object.values(modifica.modificati).filter(v => v !== "" && v !== undefined).length;
  return (
    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>
      Il prezzo si può cambiare: scriva il nuovo prezzo in € per tonnellata e il costo si ricalcola. Con ↺ si torna al prezzo di riferimento. Il database non cambia.
      {n > 0 && <button onClick={modifica.ripristinaTutti} style={{ marginLeft: 8, fontSize: 11.5, cursor: "pointer" }}>Tutti i prezzi di riferimento</button>}
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
      {ris.prezziListino.length > 0 && <div style={{ color: "#D35400", fontSize: 12, marginTop: 6 }}>Prezzo da verificare (Borsa Merci, ricerca online o listino), non di fattura né di preventivo: {ris.prezziListino.join(", ")}. Chiedere un preventivo (Alimentaria → Controlla prezzi e chiedi preventivi).</div>}
      {ris.prezziModificati?.length > 0 && <div style={{ color: "#B35C00", fontSize: 12, marginTop: 6, fontWeight: 700 }}>Prezzo scritto a mano, non di riferimento: {ris.prezziModificati.join(", ")}.</div>}
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
