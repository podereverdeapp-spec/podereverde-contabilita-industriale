import { supabase } from "./supabase";
import { fetchAllPages, round2 } from "./parsingUtils";
import { UBA_FASCE_EXP } from "./motoreUba";

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
function calcolaStepPerTipo(animaliConGiorni, fasce, pesoNascitaAncora, campoObiettivo) {
  const step = [];
  let pesoIngressoFascia = pesoNascitaAncora;
  let giornoInizioFascia = 0;

  fasce.forEach((fascia, i) => {
    const giornoFineFascia = fascia.fino;
    // Animali usciti PROPRIO dentro questa fascia (non chi l'ha solo attraversata restando vivo)
    const animaliInFascia = animaliConGiorni.filter(a =>
      a.giorniVita > giornoInizioFascia && a.giorniVita <= giornoFineFascia && a[campoObiettivo] != null
    );
    const punti = animaliInFascia.map(a => ({ x: a.giorniVita - giornoInizioFascia, y: a[campoObiettivo] }));
    // Per la prima fascia, e solo se il peso di partenza è noto, aggiungo l'ancora —
    // dà stabilità anche con pochissimi animali (retta forzata a passare da lì).
    const puntiConAncora = (i === 0 && pesoIngressoFascia != null) ? [{ x: 0, y: pesoIngressoFascia }, ...punti] : punti;

    const regressione = regressioneLineare(puntiConAncora);
    const durataFascia = Number.isFinite(giornoFineFascia) ? giornoFineFascia - giornoInizioFascia : null;
    const pesoUscitaFascia = regressione && durataFascia != null
      ? round2(regressione.intercetta + regressione.pendenza * durataFascia)
      : null;

    step.push({
      label: fascia.label, giornoInizio: giornoInizioFascia, giornoFine: giornoFineFascia,
      pesoIngresso: pesoIngressoFascia, pesoUscita: pesoUscitaFascia,
      ipg: regressione ? regressione.pendenza : null, nAnimali: animaliInFascia.length,
      datiSufficienti: !!regressione,
    });

    // Lo step successivo eredita il peso proiettato di uscita di questo (se calcolabile)
    pesoIngressoFascia = pesoUscitaFascia;
    giornoInizioFascia = Number.isFinite(giornoFineFascia) ? giornoFineFascia : giornoInizioFascia;
  });

  return step;
}

export async function calcolaPerformanceEta() {
  const { data: animaliGrezzi, error } = await fetchAllPages((da, a) => supabase
    .from("animali").select("id,specie,nascita,data_ingresso,provenienza,peso_nascita,data_uscita,peso_vivo_uscita,peso_carcassa,stato")
    .not("data_uscita", "is", null).range(da, a));
  if (error) throw new Error(error.message);

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
        pesoNascitaUsato: a.peso_nascita || mappaStandard.get(specie) || null,
      }))
      .filter(a => a.giorniVita > 0);

    const fasce = UBA_FASCE_EXP[specie];
    const pesoNascitaMedio = animaliSpecie.length > 0
      ? round2(animaliSpecie.reduce((s, a) => s + (a.pesoNascitaUsato || 0), 0) / animaliSpecie.filter(a => a.pesoNascitaUsato).length)
      : mappaStandard.get(specie);

    risultato[specie] = {
      nAnimaliTotali: animaliSpecie.length,
      nConPesoVivo: animaliSpecie.filter(a => a.peso_vivo_uscita != null).length,
      nConPesoCarcassa: animaliSpecie.filter(a => a.peso_carcassa != null).length,
      stepVivo: calcolaStepPerTipo(animaliSpecie, fasce, pesoNascitaMedio, "peso_vivo_uscita"),
      stepCarcassa: calcolaStepPerTipo(animaliSpecie, fasce, null, "peso_carcassa"),
    };
  }
  return risultato;
}
