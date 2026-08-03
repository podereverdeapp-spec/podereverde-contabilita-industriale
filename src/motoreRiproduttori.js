import { round2 } from "./parsingUtils";

// Calcola il valore REALE di realizzo di un riproduttore appena uscito, usando il SUO peso
// effettivo (non più una media storica) — vivo o carcassa a seconda di come è uscito.
export function calcolaValoreRealizzoReale({ motivoUscita, pesoVivoUscita, pesoCarcassa, prezzoKgVivo, prezzoKgCarcassa }) {
  const motivo = (motivoUscita || "").toLowerCase();
  const isMacellato = motivo.includes("macell");
  if (isMacellato && pesoCarcassa) return round2(pesoCarcassa * (prezzoKgCarcassa || 0));
  if (pesoVivoUscita) return round2(pesoVivoUscita * (prezzoKgVivo || 0));
  return 0;
}

// Calcola il conguaglio (positivo o negativo) tra il valore reale e la stima usata negli anni,
// e lo ripartisce sui figli dell'ANNO DI USCITA (non retroattivamente sugli anni precedenti).
export function calcolaConguaglio({ valoreRealizzoReale, valoreRealizzoStimato, numeroFigliAnnoUscita }) {
  const conguaglioTotale = round2((valoreRealizzoReale || 0) - (valoreRealizzoStimato || 0));
  if (numeroFigliAnnoUscita === 0) {
    // Nessun figlio quell'anno: il conguaglio non ha su chi ricadere — resta un dato
    // aziendale (utile/perdita), non si scarica su nessuno specifico.
    return { conguaglioTotale, conguaglioPerFiglio: 0, applicatoAiFigli: false };
  }
  return { conguaglioTotale, conguaglioPerFiglio: round2(conguaglioTotale / numeroFigliAnnoUscita), applicatoAiFigli: true };
}


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

// Ricostruisce lo storico dei PARTI di una riproduttrice (o le nascite generate da un
// riproduttore maschio), raggruppando i figli per evento di parto:
// - Suini: un parto = un lotto (lotti_suini) con quel padre_id/madre_id, i figli sono le
//   unità (suini_lotto) di quel lotto
// - Bovini/Ovini: un parto = i figli (animali) con la stessa data di nascita esatta da
//   quel genitore (di norma un solo figlio, ma gestisce anche i gemellari)
export function calcolaPartiStorici({ riproduttoreId, specie, tuttiAnimali, tuttiLotti, tutteUnita }) {
  if (specie === "suino") {
    const lottiSuoi = (tuttiLotti || []).filter(l => (l.padre_id === riproduttoreId || l.madre_id === riproduttoreId) && l.data_parto);
    return lottiSuoi.map(l => ({ data: l.data_parto, numeroFigli: (tutteUnita || []).filter(u => u.lotto_id === l.id).length }));
  }
  const figliSuoi = (tuttiAnimali || []).filter(a => (a.padre_id === riproduttoreId || a.madre_id === riproduttoreId) && a.nascita);
  const partiMappa = new Map();
  figliSuoi.forEach(f => partiMappa.set(f.nascita, (partiMappa.get(f.nascita) || 0) + 1));
  return [...partiMappa.entries()].map(([data, numeroFigli]) => ({ data, numeroFigli }));
}

// Media figli/parto e intervallo medio (in anni) tra un parto e il successivo, dalla
// storia REALE di un riproduttore — null se non ci sono abbastanza dati (serve il
// fallback alla media di popolazione in quel caso, calcolata a parte dal chiamante).
export function calcolaMediaEIntervalloParti(parti) {
  if (!parti || parti.length === 0) return { mediaFigliPerParto: null, intervalloMedioAnni: null, numeroParti: 0 };
  const totaleFigli = parti.reduce((s, p) => s + p.numeroFigli, 0);
  const mediaFigliPerParto = round2(totaleFigli / parti.length);
  if (parti.length < 2) return { mediaFigliPerParto, intervalloMedioAnni: null, numeroParti: parti.length };
  const ordinati = parti.slice().sort((a, b) => new Date(a.data) - new Date(b.data));
  const giorniTotali = (new Date(ordinati[ordinati.length - 1].data) - new Date(ordinati[0].data)) / 86400000;
  const intervalloMedioAnni = round2((giorniTotali / 365.25) / (ordinati.length - 1));
  return { mediaFigliPerParto, intervalloMedioAnni, numeroParti: parti.length };
}

// Media di popolazione (figli/parto e intervallo tra parti) calcolata su TUTTE le altre
// riproduttrici della stessa specie che hanno almeno 2 parti nella loro storia — usata
// come fallback per chi ne ha 0 o 1 (dati propri ancora insufficienti).
export function calcolaFallbackPopolazioneFemmine({ specie, escludiId, tutteLeRiproduttriciIds, tuttiAnimali, tuttiLotti, tutteUnita }) {
  const medieValide = [];
  for (const id of tutteLeRiproduttriciIds) {
    if (id === escludiId) continue;
    const parti = calcolaPartiStorici({ riproduttoreId: id, specie, tuttiAnimali, tuttiLotti, tutteUnita });
    const stat = calcolaMediaEIntervalloParti(parti);
    if (stat.numeroParti >= 2) medieValide.push(stat);
  }
  if (medieValide.length === 0) return { mediaFigliPerParto: 0, intervalloMedioAnni: 0 };
  return {
    mediaFigliPerParto: round2(medieValide.reduce((s, m) => s + m.mediaFigliPerParto, 0) / medieValide.length),
    intervalloMedioAnni: round2(medieValide.reduce((s, m) => s + m.intervalloMedioAnni, 0) / medieValide.length),
  };
}
// sua storia reale se ha almeno 2 parti; altrimenti usa la media di popolazione (altre
// riproduttrici della stessa specie con almeno 2 parti) passata dal chiamante come fallback.
export function calcolaFigliFemmina({ partiStorici, anniProduttiviResidui, fallbackPopolazione }) {
  const propri = calcolaMediaEIntervalloParti(partiStorici);
  const figliAvuti = (partiStorici || []).reduce((s, p) => s + p.numeroFigli, 0);
  const usaFallback = propri.numeroParti < 2;
  const mediaFigliPerParto = usaFallback ? (fallbackPopolazione?.mediaFigliPerParto || 0) : propri.mediaFigliPerParto;
  const intervalloMedioAnni = usaFallback ? (fallbackPopolazione?.intervalloMedioAnni || 0) : propri.intervalloMedioAnni;
  const partiFuturiStimati = intervalloMedioAnni > 0 ? Math.floor(Math.max(anniProduttiviResidui, 0) / intervalloMedioAnni) : 0;
  const figliFuturiStimati = Math.round(partiFuturiStimati * mediaFigliPerParto);
  return { figliAvuti, mediaFigliPerParto, intervalloMedioAnni, partiFuturiStimati, figliFuturiStimati, stimaBasataSuDatiPropri: !usaFallback };
}

// Figli avuti finora e stima dei figli futuri per un RIPRODUTTORE (maschio): usa una
// media annuale (figli totali / anni attivo come riproduttore), non i parti — dato che
// un maschio può generare più figli nello stesso periodo da femmine diverse.
export function calcolaFigliMaschio({ figliTotaliAvuti, anniAttivoComeRiproduttore, anniProduttiviResidui }) {
  const mediaFigliPerAnno = anniAttivoComeRiproduttore > 0 ? round2(figliTotaliAvuti / anniAttivoComeRiproduttore) : 0;
  const figliFuturiStimati = Math.round(Math.max(anniProduttiviResidui, 0) * mediaFigliPerAnno);
  return { figliAvuti: figliTotaliAvuti, mediaFigliPerAnno, figliFuturiStimati };
}
// - la quota da scaricare SE ci sono figli si ricalcola ogni anno come
//   residuo_rimanente / anni_produttivi_residui_da_qui_in_poi (non più una quota fissa)
// - se un anno non ci sono figli, non si scarica nulla — il residuo resta intatto — ma
//   l'anno successivo gli anni residui sono comunque uno in meno, quindi la quota per gli
//   anni restanti si ricalcola automaticamente più alta, spalmando l'arretrato sulle
//   annate future con figli, invece di scaricarlo tutto insieme sulla prima che arriva
//   (come un mutuo a saldo residuo: una rata saltata non si accumula da pagare in un colpo
//   solo, si ridistribuisce sulle rate rimanenti)
export function calcolaPianoScarico({ residuoRimanentePrimaDellAnno, anniProduttiviResiduiAllInizioAnno, numeroFigliAnno }) {
  const anniResidui = Math.max(anniProduttiviResiduiAllInizioAnno, 1); // almeno 1, per non dividere per zero o numeri negativi
  const quotaAnnualeTeorica = round2(residuoRimanentePrimaDellAnno / anniResidui);

  if (numeroFigliAnno === 0) {
    return {
      quotaAnnualeDovuta: 0,
      totaleScaricatoAnno: 0,
      residuoRimanenteDopo: residuoRimanentePrimaDellAnno, // invariato: nessuno scarico avvenuto
      quotaPerFiglio: 0,
    };
  }

  const totaleScaricatoAnno = Math.min(quotaAnnualeTeorica, residuoRimanentePrimaDellAnno);
  return {
    quotaAnnualeDovuta: totaleScaricatoAnno,
    totaleScaricatoAnno,
    residuoRimanenteDopo: round2(Math.max(0, residuoRimanentePrimaDellAnno - totaleScaricatoAnno)),
    quotaPerFiglio: round2(totaleScaricatoAnno / numeroFigliAnno),
  };
}
