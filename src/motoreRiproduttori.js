import { round2 } from "./parsingUtils";

// Calcola le due valutazioni di realizzo stimato per un riproduttore (vivo e carcassa),
// usando il peso medio storico di animali della stessa specie/razza usciti con più di
// "etaMinimaAnni" anni di vita, moltiplicato per i due prezzi di mercato separati
// (prezzo_kg_vivo e prezzo_kg_carcassa da prezzi_riforma — due campi indipendenti,
// non uno derivato dall'altro tramite la resa%, altrimenti collasserebbero allo stesso numero).
export function calcolaValoreRealizzoStimato({ specie, razza, animaliUsciti, prezziRiforma, etaMinimaAnni }) {
  const oggi = new Date();
  const etaAnni = a => {
    if (!a.nascita || !a.data_uscita) return null;
    return (new Date(a.data_uscita) - new Date(a.nascita)) / (365.25 * 86400000);
  };

  // Prima provo per specie+razza esatta; se il campione è troppo piccolo (<3), allargo alla sola specie
  const filtroBase = a => a.specie === specie && a.stato !== "attivo" && etaAnni(a) !== null && etaAnni(a) >= etaMinimaAnni;
  let campione = animaliUsciti.filter(a => filtroBase(a) && (a.razza_calcolata || a.razza) === razza);
  if (campione.length < 3) campione = animaliUsciti.filter(filtroBase);

  const pesiVivi = campione.map(a => a.peso_vivo_uscita).filter(p => p != null && p > 0);
  const pesiCarcassa = campione.map(a => a.peso_carcassa).filter(p => p != null && p > 0);
  const pesoVivoMedio = pesiVivi.length > 0 ? round2(pesiVivi.reduce((s, p) => s + p, 0) / pesiVivi.length) : 0;
  const pesoCarcassaMedio = pesiCarcassa.length > 0 ? round2(pesiCarcassa.reduce((s, p) => s + p, 0) / pesiCarcassa.length) : 0;

  let prezzo = (prezziRiforma || []).find(p => p.specie === specie && (p.razza === razza));
  if (!prezzo) prezzo = (prezziRiforma || []).find(p => p.specie === specie);

  const prezzoKgVivo = prezzo?.prezzo_kg_vivo || 0;
  const prezzoKgCarcassa = prezzo?.prezzo_kg_carcassa || 0;

  return {
    campioneUsato: campione.length,
    pesoVivoMedio, pesoCarcassaMedio, prezzoKgVivo, prezzoKgCarcassa,
    valutazioneVivo: round2(pesoVivoMedio * prezzoKgVivo),
    valutazioneCarcassa: round2(pesoCarcassaMedio * prezzoKgCarcassa),
  };
}

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
