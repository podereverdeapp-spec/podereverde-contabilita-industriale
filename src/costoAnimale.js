import { round2 } from "./parsingUtils";

// ── Costo di un animale: UN SOLO calcolo per tutto il programma ─────────────────────────────
// Usato dal Riepilogo Costo Animali, dalla Scheda Animale, dal Grafico Macellazioni e dal
// Break Even, così lo stesso animale ha lo stesso costo in ogni pagina.
//
// Costo totale = costo di acquisto (solo se comprato)
//              + costo di nascita (se nato in azienda: dalla mandria dell'anno di nascita)
//              + mantenimento di tutti gli anni
//              + costo rimasto di riproduttori usciti ricevuto
// Per i suinetti di un lotto comprato il prezzo del lotto si divide per il numero di suinetti
// del lotto (tutti quelli registrati nel lotto, compresi quelli poi passati a matricola).
// Per un riproduttore il totale è quanto è costato all'azienda; la parte già passata ai nati
// (colonna «messo nella mandria») e quella ancora da recuperare si vedono a parte.

const num = v => parseFloat(v) || 0;

export function conteggioUnitaPerLotto(unita) {
  const m = new Map();
  (unita || []).forEach(u => m.set(u.lotto_id, (m.get(u.lotto_id) || 0) + 1));
  return m;
}

// Prezzo di acquisto a capo: animale con matricola comprato, oppure suinetto di un lotto comprato
export function costoAcquistoUnitario({ animale, unita, lotto, numeroUnitaLotto }) {
  if (animale) return animale.provenienza === "Acquistato" ? round2(num(animale.prezzo_acquisto)) : 0;
  if (unita && lotto?.tipo_provenienza === "acquistato") return round2(num(lotto.prezzo_acquisto) / (numeroUnitaLotto || 1));
  return 0;
}

// righe = righe di ci_costo_animale_annuale dell'animale (o del suinetto)
export function costoAnimale({ righe, costoAcquisto = 0 }) {
  const somma = campo => round2((righe || []).reduce((s, r) => s + num(r[campo]), 0));
  const costoNascita = somma("costo_nascita_ereditato");
  const mantenimento = somma("costo_mantenimento");
  const costoRimastoRicevuto = somma("quota_residuo_riproduttori");
  const messoNellaMandria = somma("quota_scaricata_su_figli");
  return {
    costoAcquisto: round2(costoAcquisto), costoNascita, mantenimento, costoRimastoRicevuto, messoNellaMandria,
    costoPartenza: round2(costoAcquisto + costoNascita),
    totale: round2(costoAcquisto + costoNascita + mantenimento + costoRimastoRicevuto),
  };
}

// Raggruppa le righe di costo per animale e per suinetto
export function righePerSoggetto(righeCosto) {
  const perAnimale = new Map(), perUnita = new Map();
  (righeCosto || []).forEach(r => {
    if (r.animale_id) { if (!perAnimale.has(r.animale_id)) perAnimale.set(r.animale_id, []); perAnimale.get(r.animale_id).push(r); }
    else if (r.lotto_id) { const k = `${r.lotto_id}|${r.unita_nr}`; if (!perUnita.has(k)) perUnita.set(k, []); perUnita.get(k).push(r); }
  });
  return { perAnimale, perUnita };
}

// Uscito = stato diverso da attivo (per i suinetti anche diverso da «vivo»)
export function eUscito(stato) {
  return !!stato && stato !== "attivo" && stato !== "vivo";
}
