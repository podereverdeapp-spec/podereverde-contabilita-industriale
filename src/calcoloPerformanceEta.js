import { supabase } from "./supabase";
import { fetchAllPages, round2 } from "./parsingUtils";
import { UBA_FASCE_EXP } from "./motoreUba";
import { calcolaDatiMangimiAnno } from "./calcoloQuantitaMangimi";

// Curva di Gompertz: peso(t) = A * exp(-b * exp(-k*t)) — A=peso maturo asintotico,
// b=costante di scala, k=velocità di maturazione. Modello raccomandato in letteratura
// per bovini da carne al pascolo/estensivi (Angus Uruguay, Nellore al pascolo Brasile,
// bufali al pascolo) — scelto su richiesta di Filippo di privilegiare riferimenti
// estensivi/semi-bradi invece che da allevamento intensivo. I PARAMETRI però si stimano
// sempre dai dati reali dell'azienda, non dalla letteratura (razze/genetiche diverse).
function gompertz(t, A, b, k) { return A * Math.exp(-b * Math.exp(-k * t)); }

function sommaErroriQuadratici(punti, A, b, k) {
  return punti.reduce((s, p) => s + Math.pow(gompertz(p.x, A, b, k) - p.y, 2), 0);
}

// Adattamento ai minimi quadrati non lineare — discesa a coordinate (nessuna libreria
// esterna necessaria per un problema a 3 parametri).
function adattaGompertz(punti) {
  if (punti.length < 4) return null; // pochi punti, il modello a 3 parametri non è stimabile in modo affidabile
  const pesoMax = Math.max(...punti.map(p => p.y));
  const pesoMin = Math.min(...punti.map(p => p.y)) || 1;
  let A = pesoMax * 1.15, b = Math.log(A / pesoMin), k = 0.003;
  let passo = { A: A * 0.1, b: b * 0.1 || 0.1, k: 0.0003 };
  let errore = sommaErroriQuadratici(punti, A, b, k);

  for (let iter = 0; iter < 2000; iter++) {
    let migliorato = false;
    for (const param of ["A", "b", "k"]) {
      for (const segno of [1, -1]) {
        const prova = { A, b, k };
        prova[param] += segno * passo[param];
        if (prova.A <= 0 || prova.b <= 0 || prova.k <= 0) continue;
        const nuovoErrore = sommaErroriQuadratici(punti, prova.A, prova.b, prova.k);
        if (nuovoErrore < errore) { A = prova.A; b = prova.b; k = prova.k; errore = nuovoErrore; migliorato = true; }
      }
    }
    if (!migliorato) { passo.A *= 0.5; passo.b *= 0.5; passo.k *= 0.5; }
    if (passo.A < 1e-6 && passo.b < 1e-8 && passo.k < 1e-9) break;
  }
  return { A: round2(A), b: Math.round(b * 10000) / 10000, k: Math.round(k * 1000000) / 1000000 };
}


// Regressione lineare semplice (minimi quadrati): y = intercetta + pendenza*x.
// pendenza = IPG (kg/giorno) nel tratto. Richiede almeno 2 punti distinti in x.
function regressioneLineare(punti) {
  const n = punti.length;
  if (n < 2) return null;
  const sommaX = punti.reduce((s, p) => s + p.x, 0);
  const sommaY = punti.reduce((s, p) => s + p.y, 0);
  const sommaXY = punti.reduce((s, p) => s + p.x * p.y, 0);
  const sommaX2 = punti.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sommaX2 - sommaX * sommaX;
  if (Math.abs(denom) < 1e-9) return null; // tutti i punti hanno la stessa x, niente da stimare
  const pendenza = (n * sommaXY - sommaX * sommaY) / denom;
  const intercetta = (sommaY - pendenza * sommaX) / n;
  return { intercetta: round2(intercetta), pendenza: Math.round(pendenza * 10000) / 10000, nPunti: n };
}

// Calcola, per una specie e un tipo di peso (vivo/carcassa), la crescita a step per
// fascia d'età — ogni fascia usa come ancora il peso proiettato di fine della fascia
// precedente (o il peso di nascita standard/reale per la prima fascia).
// Dati economici di una fascia — condivisi da tutti e 3 i modi di calcolare peso/IPG
// (fasce indipendenti, curva singola, curva ponderata), per non duplicare la logica.
function calcolaDatiEconomiciFascia(fascia, giornoInizio, giornoFine, ipg, tassoMangime) {
  const giorniFascia = Number.isFinite(giornoFine) ? giornoFine - giornoInizio : null;
  let costoGiornalieroPerCapo = null, kgMangimeGiornalieroPerCapo = null;
  if (tassoMangime) {
    costoGiornalieroPerCapo = round2(fascia.coeff * tassoMangime.euroUba);
    kgMangimeGiornalieroPerCapo = round2(fascia.coeff * tassoMangime.kgUba);
  }
  const costoComplessivoFascia = costoGiornalieroPerCapo != null && giorniFascia != null ? round2(costoGiornalieroPerCapo * giorniFascia) : null;
  const consumoComplessivoFascia = kgMangimeGiornalieroPerCapo != null && giorniFascia != null ? round2(kgMangimeGiornalieroPerCapo * giorniFascia) : null;
  let costoMangimeKg = null, fcrMangime = null;
  if (costoGiornalieroPerCapo != null && ipg > 0) {
    costoMangimeKg = Math.round((costoGiornalieroPerCapo / ipg) * 100) / 100;
    fcrMangime = Math.round((kgMangimeGiornalieroPerCapo / ipg) * 100) / 100;
  }
  return { coeffUba: fascia.coeff, giorniFascia, costoGiornalieroPerCapo, kgMangimeGiornalieroPerCapo, costoComplessivoFascia, consumoComplessivoFascia, costoMangimeKg, fcrMangime };
}

function calcolaStepPerTipo(animaliConGiorni, fasce, pesoNascitaAncora, campoObiettivo, tassoMangime, includiPesoIngresso) {
  const step = [];
  let pesoIngressoFascia = pesoNascitaAncora;
  let giornoInizioFascia = 0;
  // Tetto di IPG plausibile per le fasce adulte: un adulto non può crescere più in
  // fretta di quanto crescesse da giovane in piena crescita attiva — tengo il massimo
  // IPG osservato nelle fasce PRIMA che inizi la sequenza "adulto".
  let ipgMassimoGiovanile = null;

  fasce.forEach((fascia, i) => {
    const eFasciaAdulta = fascia.label.includes("anno adulto");
    const giornoFineFascia = fascia.fino;
    // Animali usciti PROPRIO dentro questa fascia (non chi l'ha solo attraversata restando vivo)
    const animaliInFascia = animaliConGiorni.filter(a =>
      a.giorniVita > giornoInizioFascia && a.giorniVita <= giornoFineFascia && a[campoObiettivo] != null
    );
    const punti = animaliInFascia.map(a => ({ x: a.giorniVita - giornoInizioFascia, y: a[campoObiettivo] }));

    // Peso all'ingresso: un secondo punto vero per ogni animale (non solo nascita/uscita),
    // specialmente prezioso per gli acquistati — se cade dentro questa fascia, lo aggiungo
    // ai punti della regressione. Solo per il peso vivo (l'ingresso non è mai una carcassa).
    if (includiPesoIngresso) {
      animaliConGiorni.forEach(a => {
        if (a.peso_ingresso != null && a.giorniVitaAIngresso != null &&
          a.giorniVitaAIngresso > giornoInizioFascia && a.giorniVitaAIngresso <= giornoFineFascia) {
          punti.push({ x: a.giorniVitaAIngresso - giornoInizioFascia, y: a.peso_ingresso });
        }
      });
    }

    // Per la prima fascia, e solo se il peso di partenza è noto, aggiungo l'ancora —
    // dà stabilità anche con pochissimi animali (retta forzata a passare da lì).
    const puntiConAncora = (i === 0 && pesoIngressoFascia != null) ? [{ x: 0, y: pesoIngressoFascia }, ...punti] : punti;

    const regressione = regressioneLineare(puntiConAncora);
    const durataFascia = Number.isFinite(giornoFineFascia) ? giornoFineFascia - giornoInizioFascia : null;
    let pesoUscitaFascia = regressione && durataFascia != null
      ? round2(regressione.intercetta + regressione.pendenza * durataFascia)
      : null;

    // Controllo di plausibilità, in entrambe le direzioni: con pochi punti (specialmente
    // 2) la retta può "esplodere" — proiettando un peso negativo/una perdita innaturale
    // (limite basso), oppure un adulto che cresce più in fretta di un giovane in piena
    // crescita attiva (limite alto, trovato da Filippo controllando i dati reali). In
    // entrambi i casi non propago la proiezione: il peso resta stabile, e segnalo la
    // fascia come instabile.
    let proiezioneInstabile = false;
    if (pesoUscitaFascia != null && pesoIngressoFascia != null && pesoUscitaFascia < pesoIngressoFascia * 0.9) {
      proiezioneInstabile = true;
    }
    if (!proiezioneInstabile && pesoUscitaFascia != null && pesoUscitaFascia <= 0) {
      proiezioneInstabile = true;
    }
    if (!proiezioneInstabile && eFasciaAdulta && regressione && ipgMassimoGiovanile != null && regressione.pendenza > ipgMassimoGiovanile) {
      proiezioneInstabile = true;
    }
    if (proiezioneInstabile) {
      pesoUscitaFascia = pesoIngressoFascia; // nessuna crescita stimabile in modo affidabile
    }

    if (!eFasciaAdulta && regressione && regressione.pendenza != null) {
      ipgMassimoGiovanile = ipgMassimoGiovanile == null ? regressione.pendenza : Math.max(ipgMassimoGiovanile, regressione.pendenza);
    }

    const datiEconomici = calcolaDatiEconomiciFascia(fascia, giornoInizioFascia, giornoFineFascia, proiezioneInstabile ? 0 : (regressione?.pendenza ?? 0), tassoMangime);

    step.push({
      label: fascia.label, giornoInizio: giornoInizioFascia, giornoFine: giornoFineFascia,
      pesoIngresso: pesoIngressoFascia, pesoUscita: pesoUscitaFascia,
      ...datiEconomici,
      ipg: regressione ? regressione.pendenza : null, nAnimali: animaliInFascia.length,
      datiSufficienti: !!regressione, proiezioneInstabile,
    });

    // Lo step successivo eredita il peso proiettato di uscita di questo (se calcolabile)
    pesoIngressoFascia = pesoUscitaFascia;
    giornoInizioFascia = Number.isFinite(giornoFineFascia) ? giornoFineFascia : giornoInizioFascia;
  });

  return step;
}

// Oltre questa soglia, un "peso di nascita" registrato è considerato inattendibile
// (quasi certamente un peso all'ingresso/acquisto finito per errore in quel campo,
// come i casi reali trovati con Filippo sui bovini acquistati) — si usa lo standard
// di specie al suo posto, indipendentemente da nato in azienda o acquistato.
const SOGLIA_MASSIMA_PESO_NASCITA = { bovino: 80, suino: 3, ovino: 8 };

// Spezza la fascia finale (Adulto, fino:Infinity) in segmenti di un anno (365 giorni)
// ciascuno, quanti ne servono per coprire l'animale più vecchio nei dati reali —
// "mutatis mutandis" per ogni specie, richiesto da Filippo. Le fasce precedenti
// (Vitella/Vitellone o equivalenti) restano invariate.
function espandiFasceAdulto(fasceBase, maxGiorniVita) {
  const fasceFinite = fasceBase.filter(f => Number.isFinite(f.fino));
  const fasciaAdulto = fasceBase.find(f => !Number.isFinite(f.fino));
  if (!fasciaAdulto) return fasceBase;

  const inizioAdulto = fasceFinite.length > 0 ? fasceFinite[fasceFinite.length - 1].fino : 0;
  const fasceAdulteAnnuali = [];
  let annoInizio = inizioAdulto;
  let numeroAnno = 1;
  // Se non ci sono animali (o nessuno adulto), genera comunque un primo anno adulto
  // per non lasciare la specie senza nessuna fascia "adulto" da mostrare.
  const limite = Number.isFinite(maxGiorniVita) && maxGiorniVita > inizioAdulto ? maxGiorniVita : inizioAdulto + 365;
  while (annoInizio < limite) {
    const annoFine = annoInizio + 365;
    fasceAdulteAnnuali.push({
      fino: annoFine, coeff: fasciaAdulto.coeff,
      label: `${fasciaAdulto.label} — ${numeroAnno}° anno adulto`,
    });
    annoInizio = annoFine;
    numeroAnno++;
  }
  // Ogni fascia resta un anno pieno — quando comparirà un animale più vecchio del
  // massimo osservato oggi, la prossima esecuzione genererà da sola una fascia in più.

  return [...fasceFinite, ...fasceAdulteAnnuali];
}

export async function calcolaPerformanceEta(annoMangime) {
  const { data: animaliGrezzi, error } = await fetchAllPages((da, a) => supabase
    .from("animali").select("id,specie,sesso,nascita,data_ingresso,provenienza,peso_nascita,peso_ingresso,data_uscita,peso_vivo_uscita,peso_carcassa,stato")
    .not("data_uscita", "is", null).range(da, a));
  if (error) throw new Error(error.message);

  // Tassi mangime totali (€/UBA-gg e kg/UBA-gg, sommati su tutti i prodotti mangime)
  // per l'anno di riferimento scelto — stessa proprietà matematica già usata in
  // Report Quantità Mangimi: divisore uguale per ogni prodotto, la somma è legittima.
  let tassiMangimePerSpecie = null;
  if (annoMangime) {
    const datiMangime = await calcolaDatiMangimiAnno(annoMangime);
    tassiMangimePerSpecie = {};
    for (const specie of ["bovino", "suino", "ovino"]) {
      tassiMangimePerSpecie[specie] = {
        euroUba: round2(datiMangime.perProdotto.reduce((s, p) => s + p.perCosto.perSpecie[specie].incidenza, 0)),
        kgUba: round2(datiMangime.perProdotto.reduce((s, p) => s + p.perKg.perSpecie[specie].incidenza, 0)),
      };
    }
  }

  const { data: pesiStandard, error: eP } = await supabase.from("pesi_standard_specie").select("*");
  if (eP) throw new Error(eP.message);
  const mappaStandard = new Map((pesiStandard || []).map(p => [p.specie, p.peso_nascita_kg]));

  const risultato = {};
  for (const specie of ["bovino", "suino", "ovino"]) {
    const animaliSpecie = (animaliGrezzi || [])
      .filter(a => a.specie === specie && a.nascita && a.data_uscita)
      .map(a => ({
        ...a,
        giorniVita: Math.round((new Date(a.data_uscita) - new Date(a.nascita)) / 86400000),
        giorniVitaAIngresso: a.data_ingresso ? Math.round((new Date(a.data_ingresso) - new Date(a.nascita)) / 86400000) : null,
        pesoNascitaUsato: (a.peso_nascita && a.peso_nascita <= (SOGLIA_MASSIMA_PESO_NASCITA[specie] ?? Infinity))
          ? a.peso_nascita : (mappaStandard.get(specie) || null),
      }))
      .filter(a => a.giorniVita > 0);

    const maxGiorniVita = animaliSpecie.length > 0 ? Math.max(...animaliSpecie.map(a => a.giorniVita)) : null;
    const fasce = espandiFasceAdulto(UBA_FASCE_EXP[specie], maxGiorniVita);
    const pesoNascitaMedio = animaliSpecie.length > 0
      ? round2(animaliSpecie.reduce((s, a) => s + (a.pesoNascitaUsato || 0), 0) / animaliSpecie.filter(a => a.pesoNascitaUsato).length)
      : mappaStandard.get(specie);

    // Passo 2 raffinato: curve di Gompertz SEPARATE per sesso (un maschio adulto pesa
    // — e mangia — più di una femmina adulta: unire tutto in una sola curva sottostimava
    // sistematicamente i maschi, scoperto validando contro i dati reali). Poi media
    // ponderata per fascia, usando la percentuale REALE di maschi/femmine osservata IN
    // QUELLA fascia (non una percentuale fissa uguale ovunque — la composizione cambia
    // con l'età: nella mandria di Filippo i maschi adulti sono pochi, la maggior parte
    // viene macellata da giovane).
    function curvaPerSesso(campoObiettivo) {
      const perSesso = {};
      ["M", "F"].forEach(sesso => {
        const punti = animaliSpecie.filter(a => a.sesso === sesso && a[campoObiettivo] != null).map(a => ({ x: a.giorniVita, y: a[campoObiettivo] }));
        if (campoObiettivo === "peso_vivo_uscita" && pesoNascitaMedio != null) punti.push({ x: 0, y: pesoNascitaMedio });
        perSesso[sesso] = adattaGompertz(punti);
      });
      return perSesso;
    }
    const curveVivoPerSesso = curvaPerSesso("peso_vivo_uscita");
    const curveCarcassaPerSesso = curvaPerSesso("peso_carcassa");

    function leggiFasceDaCurvaSingola(curva, tassoMangime) {
      if (!curva) return null;
      let giornoInizio = 0;
      return fasce.map(fascia => {
        const giornoFine = fascia.fino;
        const pesoIngresso = round2(gompertz(giornoInizio, curva.A, curva.b, curva.k));
        const pesoUscita = Number.isFinite(giornoFine) ? round2(gompertz(giornoFine, curva.A, curva.b, curva.k)) : null;
        const durata = Number.isFinite(giornoFine) ? giornoFine - giornoInizio : null;
        const ipg = pesoUscita != null && durata ? Math.round((pesoUscita - pesoIngresso) / durata * 10000) / 10000 : null;
        const datiEconomici = calcolaDatiEconomiciFascia(fascia, giornoInizio, giornoFine, ipg ?? 0, tassoMangime);
        giornoInizio = Number.isFinite(giornoFine) ? giornoFine : giornoInizio;
        return { label: fascia.label, pesoIngresso, pesoUscita, ipg, ...datiEconomici };
      });
    }

    function leggiFasceDaCurvePonderate(curvePerSesso, campoObiettivo, tassoMangime) {
      if (!curvePerSesso.M && !curvePerSesso.F) return null;
      let giornoInizio = 0;
      return fasce.map(fascia => {
        const giornoFine = fascia.fino;
        // Composizione reale M/F degli animali con questo dato noto, IN QUESTA fascia
        const animaliInFascia = animaliSpecie.filter(a => a.giorniVita > giornoInizio && a.giorniVita <= giornoFine && a[campoObiettivo] != null);
        const nM = animaliInFascia.filter(a => a.sesso === "M").length;
        const nF = animaliInFascia.filter(a => a.sesso === "F").length;
        const totale = nM + nF;
        // Se la fascia non ha animali con questo dato, uso la composizione dell'intera specie come riserva
        const percM = totale > 0 ? nM / totale : (curvePerSesso.M ? 0.5 : 0);
        const percF = totale > 0 ? nF / totale : (curvePerSesso.F ? 0.5 : 0);

        function pesoA(giorni) {
          const pM = curvePerSesso.M ? gompertz(giorni, curvePerSesso.M.A, curvePerSesso.M.b, curvePerSesso.M.k) : null;
          const pF = curvePerSesso.F ? gompertz(giorni, curvePerSesso.F.A, curvePerSesso.F.b, curvePerSesso.F.k) : null;
          if (pM != null && pF != null) return round2(pM * percM + pF * percF);
          return round2(pM ?? pF);
        }

        const pesoIngresso = pesoA(giornoInizio);
        const pesoUscita = Number.isFinite(giornoFine) ? pesoA(giornoFine) : null;
        const durata = Number.isFinite(giornoFine) ? giornoFine - giornoInizio : null;
        const ipg = pesoUscita != null && durata ? Math.round((pesoUscita - pesoIngresso) / durata * 10000) / 10000 : null;
        const datiEconomici = calcolaDatiEconomiciFascia(fascia, giornoInizio, giornoFine, ipg ?? 0, tassoMangime);
        giornoInizio = Number.isFinite(giornoFine) ? giornoFine : giornoInizio;
        return { label: fascia.label, pesoIngresso, pesoUscita, ipg, percM: round2(percM * 100), nM, nF, ...datiEconomici };
      });
    }

    risultato[specie] = {
      nAnimaliTotali: animaliSpecie.length,
      nConPesoVivo: animaliSpecie.filter(a => a.peso_vivo_uscita != null).length,
      nConPesoCarcassa: animaliSpecie.filter(a => a.peso_carcassa != null).length,
      stepVivo: calcolaStepPerTipo(animaliSpecie, fasce, pesoNascitaMedio, "peso_vivo_uscita", tassiMangimePerSpecie?.[specie], true),
      stepCarcassa: calcolaStepPerTipo(animaliSpecie, fasce, null, "peso_carcassa", tassiMangimePerSpecie?.[specie], false),
      curveVivoPerSesso, curveCarcassaPerSesso,
      stepVivoDaCurva: leggiFasceDaCurvePonderate(curveVivoPerSesso, "peso_vivo_uscita", tassiMangimePerSpecie?.[specie]),
      stepCarcassaDaCurva: leggiFasceDaCurvePonderate(curveCarcassaPerSesso, "peso_carcassa", tassiMangimePerSpecie?.[specie]),
      stepVivoM: leggiFasceDaCurvaSingola(curveVivoPerSesso.M, tassiMangimePerSpecie?.[specie]),
      stepVivoF: leggiFasceDaCurvaSingola(curveVivoPerSesso.F, tassiMangimePerSpecie?.[specie]),
      stepCarcassaM: leggiFasceDaCurvaSingola(curveCarcassaPerSesso.M, tassiMangimePerSpecie?.[specie]),
      stepCarcassaF: leggiFasceDaCurvaSingola(curveCarcassaPerSesso.F, tassiMangimePerSpecie?.[specie]),
    };
  }
  return risultato;
}
