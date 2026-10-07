import { useState, Fragment } from "react";
import { C } from "./style";
import { calcolaDatiPerArea, calcolaDatiPerAreaCentro } from "./calcoloReportCosti";
import { formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import GraficoAndamento from "./GraficoAndamento";
import GraficoBarre from "./GraficoBarre";

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

// Un colore per ciascuno dei 4 anni (dal più vecchio al più recente) + uno per la
// media — tonalità scura per il valore assoluto, chiara per €/UBA-gg. Riusa tonalità
// già presenti nella palette (bovini/suini/ovini/primary) per coerenza visiva.
const COLORI_ANNO = [
  { scuro: "#2C6E9B", chiaro: "#4A87B0" }, // blu (3 anni fa) — contrasto 5.51 / 3.90
  { scuro: "#8B3A52", chiaro: "#A54F68" }, // bordeaux (2 anni fa) — contrasto 7.43 / 5.36
  { scuro: "#5A7A3E", chiaro: "#75925A" }, // verde oliva (1 anno fa) — contrasto 4.90 / 3.49
  { scuro: "#2E4A34", chiaro: "#4A6B50" }, // verde primary (anno di consultazione) — contrasto 9.79 / 5.98
];
const COLORE_MEDIA = { scuro: "#7A5F3D", chiaro: "#957B54" }; // accent — contrasto 5.95 / 4.01

// Unisce le righe di 4 anni per una data chiave (area, o area+centro), restituendo
// per ognuna i 4 valori annuali + la media. Le aree assenti in un anno valgono 0 quell'anno.
// Versione 236 (anomalia 8, punto 1): un anno che non si è riuscito a calcolare vale null (non zero),
// è mostrato come «non calcolato» e NON entra nella media.
// Punto 3 (decisione delle 21:20): l'anno in corso si mostra ma non entra nella media (indici in «fuoriMedia»)
// Punto 4 (decisione delle 21:27): la media del costo per giorno di presenza pesato è PESATA —
// totale dei costi degli anni usati ÷ totale dei loro giorni pesati — non la media semplice dei valori.
// campiTasso: { campoTasso: campoImporto } (es. { tasso: "imponibile" }); ubaPerAnno: giorni pesati di ogni anno.
function unisciPerChiave(datiPerAnno, estraiChiavi, estraiValori, fuoriMedia = [], ubaPerAnno = [], campiTasso = {}) {
  const validi = datiPerAnno.filter(Boolean);
  const tutteChiavi = [...new Set(validi.flatMap(d => estraiChiavi(d)))];
  return tutteChiavi.map(chiave => {
    const valoriPerAnno = datiPerAnno.map(d => (d ? estraiValori(d, chiave) : null));
    const indici = valoriPerAnno.map((v, i) => (v && !fuoriMedia.includes(i) ? i : null)).filter(i => i !== null);
    const media = {};
    const campi = Object.keys(valoriPerAnno[indici[0]] || {});
    campi.forEach(campo => {
      if (!indici.length) { media[campo] = null; return; }
      const campoImporto = campiTasso[campo];
      if (campoImporto) {
        const uba = indici.reduce((s, i) => s + (ubaPerAnno[i] || 0), 0);
        media[campo] = uba > 0 ? indici.reduce((s, i) => s + (valoriPerAnno[i][campoImporto] || 0), 0) / uba : null;
      } else {
        media[campo] = round2(indici.reduce((s, i) => s + (valoriPerAnno[i][campo] || 0), 0) / indici.length);
      }
    });
    return { chiave, valoriPerAnno, media };
  });
}
const euroOppure = (v, d = 2) => (v === null || v === undefined ? "non calcolato" : formattaEuro(v, d));
const OGGI = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
const notaInCorso = (statoAnni, i) => (statoAnni?.[i] === "inCorso" ? <div style={{ fontWeight: 400, fontSize: 9 }}>anno in corso, costi fino al {OGGI} — fuori dalla media</div> : null);
const ETICHETTA_STATO = { errore: "non calcolato", vuoto: "nessun dato" };
const cellaAnno = (v, campo, statoAnni, i, d = 2) => (v ? formattaEuro(v[campo], d) : ETICHETTA_STATO[statoAnni?.[i]] || "non calcolato");

export default function ReportStorico({ specieFiltro, titolo }) {
  const ANNO_CORRENTE = new Date().getFullYear();
  const [annoBase, setAnnoBase] = useState(ANNO_CORRENTE - 1); // ultimo anno completo
  const [calcolando, setCalcolando] = useState(false);
  const [risultato, setRisultato] = useState(null);
  const [espansi, setEspansi] = useState({});

  function toggleEspanso(area) { setEspansi(prev => ({ ...prev, [area]: !prev[area] })); }

  const anni = [annoBase, annoBase - 1, annoBase - 2, annoBase - 3];

  async function calcola() {
    setCalcolando(true);
    setRisultato(null);
    try {
      // Versione 236: se un anno non si riesce a calcolare lo si dice (prima diventava zero in silenzio)
      const errori = [];
      const prova = (anno, fn) => fn(anno).catch(e => { errori.push({ anno, motivo: e?.message || String(e) }); return null; });
      const datiPerArea0 = await Promise.all(anni.map(a => prova(a, calcolaDatiPerArea)));
      const datiPerAreaCentro0 = await Promise.all(anni.map(a => prova(a, calcolaDatiPerAreaCentro)));
      // un anno è calcolato solo se sono riuscite tutte e due le letture
      // Punto 2 (decisione delle 21:17): un anno senza nessun costo caricato è «nessun dato» e non entra nella media
      const vuoto = d => d && d.righe.reduce((t, r) => t + (r.imponibileComplessivo || 0), 0) === 0 && d.rigaRossa.reduce((t, r) => t + (r.valore || 0), 0) === 0;
      const statoAnni = anni.map((a, i) => (!datiPerArea0[i] || !datiPerAreaCentro0[i] ? "errore" : vuoto(datiPerArea0[i]) ? "vuoto" : a >= ANNO_CORRENTE ? "inCorso" : "ok"));
      const datiPerArea = datiPerArea0.map((d, i) => (statoAnni[i] === "ok" || statoAnni[i] === "inCorso" ? d : null));
      const datiPerAreaCentro = datiPerAreaCentro0.map((d, i) => (statoAnni[i] === "ok" || statoAnni[i] === "inCorso" ? d : null));
      const fuoriMedia = statoAnni.map((st, i) => (st === "inCorso" ? i : null)).filter(i => i !== null);
      const ubaPerAnno = datiPerArea.map(d => (d ? (specieFiltro ? d.ubaGiorniProduttiviPerSpecie[specieFiltro] : d.ubaGiorniProduttiviAziendali) || 0 : null));
      const ubaAziendaPerAnno = datiPerArea.map(d => (d ? d.ubaGiorniProduttiviAziendali || 0 : null));
      const tassi = specieFiltro ? { incidenza: "costoAllocato" } : { tasso: "imponibile" };
      const anniErrore = [...new Map(errori.map(e => [e.anno, e])).values()].sort((a, b) => b.anno - a.anno);

      function valoriArea(d, area) {
        const r = d.righe.find(x => x.area === area);
        if (!r) return { imponibile: 0, tasso: 0, costoAllocato: 0, incidenza: 0 };
        return specieFiltro
          ? { costoAllocato: r.perSpecie[specieFiltro].costoAllocato, incidenza: r.perSpecie[specieFiltro].incidenza }
          : { imponibile: r.imponibileComplessivo, tasso: r.tassoArea };
      }
      const righeArea = unisciPerChiave(datiPerArea, d => d.righe.map(r => r.area), valoriArea, fuoriMedia, ubaPerAnno, tassi);

      function valoriRossa(d, label) {
        const r = d.rigaRossa.find(x => x.label === label);
        return { valore: r ? r.valore : 0, tasso: r ? r.tasso : 0 };
      }
      const rigaRossa = unisciPerChiave(datiPerArea, d => d.rigaRossa.map(r => r.label), valoriRossa, fuoriMedia, ubaAziendaPerAnno, { tasso: "valore" });

      // Disaggregato per Centro di Costo/Categoria (chiave = "Area||Centro")
      function chiaviCentro(d) {
        return d.gruppi.flatMap(g => g.sottoRighe.map(sr => `${g.area}||${sr.etichetta}`));
      }
      function valoriCentro(d, chiaveCompleta) {
        const [area, etichetta] = chiaveCompleta.split("||");
        const gruppo = d.gruppi.find(g => g.area === area);
        const sr = gruppo?.sottoRighe.find(s => s.etichetta === etichetta);
        if (!sr) return { imponibile: 0, tasso: 0, costoAllocato: 0, incidenza: 0 };
        return specieFiltro
          ? { costoAllocato: sr.perSpecie[specieFiltro].costoAllocato, incidenza: sr.perSpecie[specieFiltro].incidenza }
          : { imponibile: sr.imponibileComplessivo, tasso: sr.tassoArea };
      }
      const righeCentro = unisciPerChiave(datiPerAreaCentro, chiaviCentro, valoriCentro, fuoriMedia, ubaPerAnno, tassi)
        .map(r => { const [area, etichetta] = r.chiave.split("||"); return { ...r, area, etichetta }; });

      // Totali aggregati per anno (somma di tutte le Aree — zona rossa esclusa, resta
      // sempre a parte) — per i due grafici in cima alla pagina. Valido sommare
      // direttamente anche il tasso/incidenza: lo stesso UBA-giorni è il divisore per
      // ogni Area nello stesso anno, quindi la somma dei rapporti è il rapporto delle somme.
      const totaliPerAnno = anni.map((anno, i) => {
        const d = datiPerArea[i];
        if (!d) return { anno, valoreAssoluto: null, tasso: null };
        const valoreAssoluto = round2(d.righe.reduce((s, r) => s + (specieFiltro ? r.perSpecie[specieFiltro].costoAllocato : r.imponibileComplessivo), 0));
        const uba = specieFiltro ? d.ubaGiorniProduttiviPerSpecie[specieFiltro] || 0 : d.ubaGiorniProduttiviAziendali || 0;
        const tasso = uba > 0 ? valoreAssoluto / uba : 0; // senza arrotondare: si mostrano 4 decimali veri
        return { anno, valoreAssoluto, tasso, uba };
      });

      setRisultato({ righeArea, rigaRossa, righeCentro, totaliPerAnno, anniErrore, statoAnni, anniCalcolati: statoAnni.filter(st => st === "ok").length });
    } catch (err) {
      alert(`⚠️ Errore nel calcolo storico:\n\n${err.message}`);
    }
    setCalcolando(false);
  }

  const campo1 = specieFiltro ? "costoAllocato" : "imponibile";
  const campo2 = specieFiltro ? "incidenza" : "tasso";
  const labelCampo1 = specieFiltro ? "Costo allocato" : "Imponibile";
  const labelCampo2 = "€/UBA-gg";

  // media dei grafici: solo anni interi calcolati (senza l'anno in corso), come nella tabella
  function mediaGrafico(campo) {
    const ok = risultato.totaliPerAnno.filter((t, i) => t[campo] !== null && risultato.statoAnni[i] === "ok");
    if (!ok.length) return null;
    if (campo === "tasso") { const uba = ok.reduce((s, t) => s + t.uba, 0); return uba > 0 ? ok.reduce((s, t) => s + t.valoreAssoluto, 0) / uba : null; }
    return ok.reduce((s, t) => s + t[campo], 0) / ok.length;
  }

  function esporta() {
    function righeExcelDa(righe, etichettaFn, c1 = campo1, c2 = campo2, l1 = labelCampo1, l2 = labelCampo2) {
      return righe.map(r => {
        const riga = { "Voce": etichettaFn(r) };
        anni.forEach((a, i) => {
          const v = r.valoriPerAnno[i], et = ETICHETTA_STATO[risultato.statoAnni[i]] || "non calcolato";
          riga[`${l1} ${a}`] = v ? numeroExcel(v[c1]) : et;
          riga[`${l2} ${a}`] = v ? numeroExcel(v[c2]) : et;
        });
        riga[`${l1} Media`] = r.media[c1] === null ? "" : numeroExcel(r.media[c1]);
        riga[`${l2} Media`] = r.media[c2] === null ? "" : numeroExcel(r.media[c2]);
        return riga;
      });
    }
    esportaExcel(`ReportStorico_${specieFiltro || "Generale"}_${annoBase}`, [
      { nome: "Per Area", righe: righeExcelDa(risultato.righeArea, r => r.chiave) },
      { nome: "Esclusi dal costo animali", righe: righeExcelDa(risultato.rigaRossa, r => r.chiave, "valore", "tasso", "Imponibile", "€/UBA-gg") },
      { nome: "Per Centro di Costo", righe: righeExcelDa(risultato.righeCentro, r => `${r.area} - ${r.etichetta}`) },
    ]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Confronto tra l'anno scelto e i 3 precedenti, con la media degli anni calcolati — per vedere l'andamento nel tempo dell'efficacia della contabilità industriale.{titolo && ` (${titolo})`}
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Anno più recente del confronto</label>
            <input type="number" value={annoBase} onChange={e => setAnnoBase(parseInt(e.target.value))}
              style={{ padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, width: 100 }} />
          </div>
          <button onClick={calcola} disabled={calcolando}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {calcolando ? "Calcolo (4 anni)..." : "📊 Calcola confronto"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Confronta {anni.slice().reverse().join(", ")} — un anno senza costi caricati compare come «nessun dato» e non entra nella media; l'anno in corso si vede ma non entra nella media.</div>
      </div>

      {risultato && (
        <>
          {risultato.anniErrore.length > 0 && (
            <div style={{ background: "#FDECEC", border: `1.5px solid ${C.red}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: C.red }}>
              {risultato.anniErrore.map(e => <div key={e.anno}>⚠️ <strong>Il {e.anno} non è stato calcolato</strong>: {e.motivo}. Nella tabella compare come «non calcolato» e non entra nella media.</div>)}
            </div>
          )}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
            <div style={{ flex: 1, minWidth: 300, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 4 }}>{labelCampo1} totale — andamento</div>
              <GraficoAndamento punti={risultato.totaliPerAnno.filter(t => t.valoreAssoluto !== null).map(t => ({ anno: t.anno, valore: t.valoreAssoluto }))} decimaliValore={2} media={mediaGrafico("valoreAssoluto")} />
            </div>
            <div style={{ flex: 1, minWidth: 300, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 4 }}>€/UBA-gg totale — andamento</div>
              <GraficoAndamento punti={risultato.totaliPerAnno.filter(t => t.tasso !== null).map(t => ({ anno: t.anno, valore: t.tasso }))} decimaliValore={4} media={mediaGrafico("tasso")} />
            </div>
          </div>

          <button onClick={esporta}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 16 }}>
            📥 Esporta Excel
          </button>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>PER AREA E CENTRO DI COSTO</div>
          <TabellaConfrontoAccordion
            righeArea={risultato.righeArea} righeCentro={risultato.righeCentro}
            espansi={espansi} toggleEspanso={toggleEspanso}
            anni={anni} campo1={campo1} campo2={campo2} labelCampo1={labelCampo1} labelCampo2={labelCampo2}
            totaliPerAnno={risultato.totaliPerAnno} anniMedia={risultato.anniCalcolati} statoAnni={risultato.statoAnni}
          />
          <RiquadroMedia totaliPerAnno={risultato.totaliPerAnno} statoAnni={risultato.statoAnni} labelCampo1={labelCampo1} />

          {risultato.rigaRossa.length > 0 && (
            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 8 }}>⚠️ ESCLUSI DAL COSTO DEGLI ANIMALI: MACELLO E LAVORAZIONE DELLE CARNI, ORTO, CAVALLI, POLLAME, ANIMALI NON D'ALLEVAMENTO E AMMORTAMENTI SENZA IMPUTAZIONE</div>
              <TabellaConfronto righe={risultato.rigaRossa} anni={anni} campo1="valore" campo2="tasso" labelCampo1="Imponibile" labelCampo2="€/UBA-gg" etichettaRiga={r => r.chiave} rosso anniMedia={risultato.anniCalcolati} statoAnni={risultato.statoAnni} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TabellaConfrontoAccordion({ righeArea, righeCentro, espansi, toggleEspanso, anni, campo1, campo2, labelCampo1, labelCampo2, totaliPerAnno, anniMedia, statoAnni }) {
  if (righeArea.length === 0) return <p style={{ color: C.muted, fontSize: 13 }}>Nessun dato.</p>;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto", marginBottom: 8 }}>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead style={{ background: C.primary, color: "#fff", position: "sticky", top: 0, zIndex: 1 }}>
          <tr>
            <th style={th} rowSpan={2}>Area / Centro di Costo</th>
            {anni.map((a, i) => {
              const col = COLORI_ANNO[anni.length - 1 - i];
              return <th key={a} style={{ ...th, borderLeft: i === 0 ? undefined : "1px solid #ffffff55", borderBottom: `3px solid ${col.scuro}` }} colSpan={2}>{a}{notaInCorso(statoAnni, i)}</th>;
            })}
            <th style={{ ...th, borderLeft: "1px solid #ffffff55", borderBottom: `3px solid ${COLORE_MEDIA.scuro}` }} colSpan={2}>Media {anniMedia} {anniMedia === 1 ? "anno" : "anni"}</th>
          </tr>
          <tr>
            {anni.map(a => <Fragment key={a}>
              <th style={th}>{labelCampo1}</th>
              <th style={th}>{labelCampo2}</th>
            </Fragment>)}
            <th style={th}>{labelCampo1}</th>
            <th style={th}>{labelCampo2}</th>
          </tr>
        </thead>
        <tbody>
          {righeArea.map(rArea => {
            const centriDiQuestaArea = righeCentro.filter(rc => rc.area === rArea.chiave);
            return (
              <Fragment key={rArea.chiave}>
                <tr onClick={() => toggleEspanso(rArea.chiave)}
                  style={{ borderTop: `1px solid ${C.border}`, cursor: centriDiQuestaArea.length > 0 ? "pointer" : "default", background: C.primary + "10" }}>
                  <td style={{ ...td, fontWeight: 800 }}>
                    {centriDiQuestaArea.length > 0 ? (espansi[rArea.chiave] ? "▼" : "▶") : "·"} {rArea.chiave}
                  </td>
                  {rArea.valoriPerAnno.map((v, i) => {
                    const col = COLORI_ANNO[anni.length - 1 - i];
                    return (
                      <Fragment key={i}>
                        <td style={{ ...td, textAlign: "right", color: v ? col.scuro : (statoAnni?.[i] === "vuoto" ? C.muted : C.red), fontWeight: 700 }}>{cellaAnno(v, campo1, statoAnni, i)}</td>
                        <td style={{ ...td, textAlign: "right", color: v ? col.chiaro : C.red, fontWeight: 600 }}>{v ? formattaEuro(v[campo2], 4) : ""}</td>
                      </Fragment>
                    );
                  })}
                  <td style={{ ...td, textAlign: "right", fontWeight: 800, color: COLORE_MEDIA.scuro }}>{euroOppure(rArea.media[campo1])}</td>
                  <td style={{ ...td, textAlign: "right", color: COLORE_MEDIA.chiaro, fontWeight: 600 }}>{euroOppure(rArea.media[campo2], 4)}</td>
                </tr>
                {espansi[rArea.chiave] && (
                  <tr>
                    <td colSpan={1 + anni.length * 2 + 2} style={{ padding: "12px 20px", background: "#FAFAF8", borderTop: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4 }}>{labelCampo2} — andamento {rArea.chiave}</div>
                      <GraficoBarre punti={rArea.valoriPerAnno.map((v, i) => (v ? { anno: anni[i], valore: v[campo2] } : null)).filter(Boolean)} decimaliValore={4} />
                    </td>
                  </tr>
                )}
                {espansi[rArea.chiave] && centriDiQuestaArea.map(rc => (
                  <tr key={rArea.chiave + rc.etichetta} style={{ borderTop: `1px solid ${C.border}`, background: "#FAFAF8" }}>
                    <td style={{ ...td, paddingLeft: 28, color: C.muted }}>↳ {rc.etichetta}</td>
                    {rc.valoriPerAnno.map((v, i) => {
                      const col = COLORI_ANNO[anni.length - 1 - i];
                      return (
                        <Fragment key={i}>
                          <td style={{ ...td, textAlign: "right", color: v ? col.scuro : (statoAnni?.[i] === "vuoto" ? C.muted : C.red) }}>{cellaAnno(v, campo1, statoAnni, i)}</td>
                          <td style={{ ...td, textAlign: "right", color: col.chiaro, fontWeight: 600 }}>{v ? formattaEuro(v[campo2], 4) : ""}</td>
                        </Fragment>
                      );
                    })}
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: COLORE_MEDIA.scuro }}>{euroOppure(rc.media[campo1])}</td>
                    <td style={{ ...td, textAlign: "right", color: COLORE_MEDIA.chiaro, fontWeight: 600 }}>{euroOppure(rc.media[campo2], 4)}</td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
          {totaliPerAnno && (
            <tr style={{ borderTop: `2px solid ${C.primary}`, fontWeight: 800, background: C.bg }}>
              <td style={td}>Totale</td>
              {totaliPerAnno.map((t, i) => (
                <Fragment key={i}>
                  <td style={{ ...td, textAlign: "right", color: t.valoreAssoluto === null ? C.red : undefined }}>{t.valoreAssoluto === null ? ETICHETTA_STATO[statoAnni?.[i]] || "non calcolato" : formattaEuro(t.valoreAssoluto)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{t.tasso === null ? "" : formattaEuro(t.tasso, 4)}</td>
                </Fragment>
              ))}
              {(() => { const ok = totaliPerAnno.filter((t, i) => t.valoreAssoluto !== null && statoAnni?.[i] !== "inCorso"); return (<>
                <td style={{ ...td, textAlign: "right" }}>{ok.length ? formattaEuro(round2(ok.reduce((s, t) => s + t.valoreAssoluto, 0) / ok.length)) : "non calcolato"}</td>
                <td style={{ ...td, textAlign: "right" }}>{ok.length && ok.reduce((s, t) => s + t.uba, 0) > 0 ? formattaEuro(ok.reduce((s, t) => s + t.valoreAssoluto, 0) / ok.reduce((s, t) => s + t.uba, 0), 4) : ""}</td>
              </>); })()}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TabellaConfronto({ righe, anni, campo1, campo2, labelCampo1, labelCampo2, etichettaRiga, rosso, anniMedia, statoAnni }) {
  if (righe.length === 0) return <p style={{ color: C.muted, fontSize: 13 }}>Nessun dato.</p>;
  const coloreTesto = rosso ? C.red : C.text;
  return (
    <div style={{ background: C.card, border: `1px solid ${rosso ? C.red : C.border}`, borderRadius: 12, overflow: "auto", marginBottom: 8 }}>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead style={{ background: rosso ? "#FDECEC" : C.primary, color: rosso ? C.red : "#fff" }}>
          <tr>
            <th style={th} rowSpan={2}></th>
            {anni.map((a, i) => <th key={a} style={{ ...th, borderLeft: i === 0 ? undefined : "1px solid #ffffff55" }} colSpan={2}>{a}{notaInCorso(statoAnni, i)}</th>)}
            <th style={{ ...th, borderLeft: "1px solid #ffffff55" }} colSpan={2}>Media {anniMedia} {anniMedia === 1 ? "anno" : "anni"}</th>
          </tr>
          <tr>
            {anni.map(a => <Fragment key={a}>
              <th style={th}>{labelCampo1}</th>
              <th style={th}>{labelCampo2}</th>
            </Fragment>)}
            <th style={th}>{labelCampo1}</th>
            <th style={th}>{labelCampo2}</th>
          </tr>
        </thead>
        <tbody>
          {righe.map(r => (
            <tr key={r.chiave} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ ...td, fontWeight: 700, color: coloreTesto }}>{etichettaRiga(r)}</td>
              {r.valoriPerAnno.map((v, i) => (
                <Fragment key={i}>
                  <td style={{ ...td, textAlign: "right", color: coloreTesto }}>{cellaAnno(v, campo1, statoAnni, i)}</td>
                  <td style={{ ...td, textAlign: "right", color: coloreTesto }}>{v ? formattaEuro(v[campo2], 4) : ""}</td>
                </Fragment>
              ))}
              <td style={{ ...td, textAlign: "right", fontWeight: 700, color: coloreTesto }}>{euroOppure(r.media[campo1])}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700, color: coloreTesto }}>{euroOppure(r.media[campo2], 4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = { padding: "6px 8px", textAlign: "center", fontSize: 10, fontWeight: 700 };
const td = { padding: "5px 8px", fontSize: 11 };

// Riquadro che spiega come sono calcolate le medie (richiesto dal Dott. Bizzarri il 07/10/2026 ore 21:27)
function RiquadroMedia({ totaliPerAnno, statoAnni, labelCampo1 }) {
  const usati = totaliPerAnno.filter((t, i) => statoAnni[i] === "ok");
  const esclusi = totaliPerAnno.map((t, i) => ({ t, st: statoAnni[i] })).filter(x => x.st !== "ok");
  const costi = usati.reduce((s, t) => s + t.valoreAssoluto, 0), uba = usati.reduce((s, t) => s + t.uba, 0);
  const num = (n, d = 1) => n.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
  const motivo = { errore: "non calcolato", vuoto: "nessun dato", inCorso: "anno in corso" };
  return (
    <div style={{ background: "#F6F9F4", border: `1px solid ${C.primaryLight}`, borderRadius: 10, padding: "10px 14px", margin: "12px 0", fontSize: 12.5, lineHeight: 1.6 }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>Come sono calcolate le medie</div>
      <div><strong>Anni usati:</strong> {usati.length ? usati.map(t => t.anno).sort().join(", ") : "nessuno"}
        {esclusi.length > 0 && <> · <strong>esclusi:</strong> {esclusi.map(x => `${x.t.anno} (${motivo[x.st]})`).join(", ")}</>}.</div>
      <div><strong>{labelCampo1}:</strong> media semplice = somma degli anni usati ÷ numero degli anni usati{usati.length ? ` (${formattaEuro(costi)} ÷ ${usati.length} = ${formattaEuro(costi / usati.length)})` : ""}.</div>
      <div><strong>€ per giorno di presenza pesato:</strong> media pesata = totale dei costi degli anni usati ÷ totale dei loro giorni di presenza pesati
        {uba > 0 ? ` (${formattaEuro(costi)} ÷ ${num(uba)} giorni = ${formattaEuro(costi / uba, 4)})` : ""}. Così un anno con pochi animali non pesa quanto un anno con molti.
        Lo stesso metodo vale per ogni area e centro di costo.</div>
    </div>
  );
}
