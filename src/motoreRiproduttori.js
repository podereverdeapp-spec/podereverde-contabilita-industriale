import { round2 } from "./parsingUtils";

// Calcola il residuo totale da recuperare per un riproduttore:
// (costo acquisto + costi di crescita pre-riproduttiva) - valore di realizzo stimato.
// Semplificazione dichiarata (come in Report Costi): valore di realizzo stimato = 0 per ora,
// finché non costruiamo il meccanismo di stima (peso medio storico × prezzi di mercato).
export function calcolaResiduoIniziale({ costoAcquisto, costiCrescitaPreRiproduttiva, valoreRealizzoStimato }) {
  const totale = (costoAcquisto || 0) + (costiCrescitaPreRiproduttiva || 0) - (valoreRealizzoStimato || 0);
  return round2(Math.max(0, totale));
}

// Calcola lo scarico di un anno per un riproduttore, con il meccanismo del "conto sospeso":
// - la quota annuale dovuta è SEMPRE una frazione fissa del residuo TOTALE iniziale
//   (ammortamento a quote costanti, come i Cespiti), non del residuo rimanente
// - se non ci sono figli quell'anno, la quota si accumula nel conto sospeso SENZA scaricarsi
//   (il residuo rimanente non si riduce, perché non è stato effettivamente recuperato da nessuno)
// - quando arrivano figli, si scarica la quota dell'anno PIÙ tutto l'arretrato del conto sospeso,
//   diviso in parti uguali tra i figli di quell'anno
export function calcolaPianoScarico({ residuoTotaleIniziale, vitaProduttivaAttesaAnni, contoSospesoPrecedente, numeroFigliAnno, residuoRimanentePrimaDellAnno }) {
  const quotaAnnualeTeorica = vitaProduttivaAttesaAnni > 0 ? round2(residuoTotaleIniziale / vitaProduttivaAttesaAnni) : 0;
  // Non si può scaricare più di quanto resta davvero da recuperare
  const quotaAnnualeDovuta = Math.min(quotaAnnualeTeorica, residuoRimanentePrimaDellAnno);

  if (numeroFigliAnno === 0) {
    return {
      quotaAnnualeDovuta,
      totaleScaricatoAnno: 0,
      contoSospesoNuovo: round2((contoSospesoPrecedente || 0) + quotaAnnualeDovuta),
      residuoRimanenteDopo: residuoRimanentePrimaDellAnno, // invariato: nessuno scarico avvenuto
      quotaPerFiglio: 0,
    };
  }

  const totaleScaricatoAnno = round2(quotaAnnualeDovuta + (contoSospesoPrecedente || 0));
  return {
    quotaAnnualeDovuta,
    totaleScaricatoAnno,
    contoSospesoNuovo: 0,
    residuoRimanenteDopo: round2(Math.max(0, residuoRimanentePrimaDellAnno - totaleScaricatoAnno)),
    quotaPerFiglio: round2(totaleScaricatoAnno / numeroFigliAnno),
  };
}
