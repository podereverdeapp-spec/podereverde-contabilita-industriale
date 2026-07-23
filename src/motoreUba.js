// Motore UBA — identico a quello reale di podereverdeapp.it (ExportManager.jsx)
// Condiviso tra ReportUba.jsx e ReportCosti.jsx

export const UBA_FASCE_EXP = {
  bovino: [{ fino: 210, coeff: 0.40, label: "Vitella (<7 mesi)" }, { fino: 730, coeff: 0.70, label: "Vitellone (7m-2a)" }, { fino: Infinity, coeff: 1.00, label: "Bovino adulto (≥2a)" }],
  suino: [{ fino: 90, coeff: 0.027, label: "Lattonzolo (<3 mesi)" }, { fino: 365, coeff: 0.30, label: "Magrone (3m-1a)" }, { fino: Infinity, coeff: 0.50, label: "Suino adulto (≥1a)" }],
  ovino: [{ fino: 120, coeff: 0.027, label: "Agnello (<4 mesi)" }, { fino: 365, coeff: 0.10, label: "Agnellone (4m-1a)" }, { fino: Infinity, coeff: 0.15, label: "Ovino adulto (≥1a)" }],
};

const MOTIVI_PRODUTTIVI_EXP = ["macellazione", "macellato", "venduto", "riformato", "riforma", "vendita"];

export function periodoNellAnnoExp(nascita, dataUscita, stato, anno) {
  if (!nascita) return null;
  const inizioAnno = new Date(anno, 0, 1);
  const fineAnno = new Date(anno, 11, 31, 23, 59, 59);
  const oggi = new Date();
  const dataInizio = new Date(nascita);
  const dataFine = dataUscita ? new Date(dataUscita) : (oggi < fineAnno ? oggi : fineAnno);
  if (dataFine < inizioAnno) return null;
  if (dataInizio > fineAnno) return null;
  const inizio = dataInizio > inizioAnno ? dataInizio : inizioAnno;
  const fine = dataFine < fineAnno ? dataFine : fineAnno;
  return {
    inizio: inizio.toISOString().split("T")[0],
    fine: fine.toISOString().split("T")[0],
    giorni: Math.round((fine - inizio) / 86400000) + 1,
    etaAllInizio: Math.round((inizio - dataInizio) / 86400000),
  };
}

export function calcolaUBAMedioExp(specie, giorni, etaAllInizio) {
  if (!specie || !UBA_FASCE_EXP[specie] || giorni <= 0) return null;
  const fasce = UBA_FASCE_EXP[specie];
  let uba = 0;
  for (let i = 0; i < fasce.length; i++) {
    const prev = i > 0 ? fasce[i - 1].fino : 0;
    const { fino, coeff } = fasce[i];
    const iniz = Math.max(prev, etaAllInizio);
    const finz = Math.min(fino === Infinity ? etaAllInizio + giorni + 1 : fino, etaAllInizio + giorni);
    if (finz > iniz) uba += (finz - iniz) * coeff;
  }
  return Math.round(uba / giorni * 1000) / 1000;
}

export function categoriaEtàExp(specie, etaAllInizio, giorni) {
  if (!UBA_FASCE_EXP[specie]) return "—";
  const etaFinale = etaAllInizio + giorni;
  for (const { fino, label } of UBA_FASCE_EXP[specie]) if (etaFinale < fino) return label;
  return UBA_FASCE_EXP[specie].at(-1).label;
}

export function categoriaContabileExp(animale) {
  if (animale.stato === "attivo") return animale.riproduttore ? "RIPRODUTTORE" : "PRODUTTIVO";
  const motivo = (animale.motivo_uscita || "").toLowerCase();
  const isProduttivo = MOTIVI_PRODUTTIVI_EXP.some(k => motivo.includes(k));
  if (isProduttivo) return animale.riproduttore ? "RIPRODUTTORE" : "PRODUTTIVO";
  return "IMPRODUTTIVO_USCITO";
}

// Calcola tutte le righe UBA per un anno, da animali + lotti suini reali
export function calcolaReportUba(animali, lotti, suiniLotto, anno) {
  const righe = [];

  for (const a of animali) {
    if (!a.specie || !UBA_FASCE_EXP[a.specie]) continue;
    const nascita = a.nascita || a.data_ingresso;
    if (!nascita) continue;
    const periodo = periodoNellAnnoExp(nascita, a.data_uscita, a.stato, anno);
    if (!periodo) continue;
    const uba = calcolaUBAMedioExp(a.specie, periodo.giorni, periodo.etaAllInizio);
    if (!uba) continue;
    const ubaGiorni = Math.round(uba * periodo.giorni * 1000) / 1000;
    const cat = categoriaContabileExp(a);

    righe.push({
      bdn: a.bdn || "", nome: a.nome || "", specie: a.specie, categoria: categoriaEtàExp(a.specie, periodo.etaAllInizio, periodo.giorni),
      nascita, inizio_calcolo: periodo.inizio, data_riferimento: periodo.fine, giorni_presenza: periodo.giorni,
      uba_medio: uba, uba_giorni: ubaGiorni, stato: a.stato, qualifica_riproduzione: a.riproduttore ? "Riproduttore" : null,
      data_uscita: a.data_uscita || null, motivo_uscita: a.motivo_uscita || null, lotto: null,
      categoria_contabile: cat, animale_id: a.id,
    });
  }

  for (const l of lotti) {
    if (!l.data_parto) continue;
    const codLotto = l.codice_lotto || l.codice || "";
    for (const u of suiniLotto.filter(x => x.lotto_id === l.id)) {
      if (u.stato === "registrato_individuale") continue;
      const finto = {
        nascita: l.data_parto, data_uscita: u.data_uscita,
        stato: u.stato === "attivo" ? "attivo" : "uscito",
        motivo_uscita: u.motivo_uscita, riproduttore: false,
      };
      const periodo = periodoNellAnnoExp(finto.nascita, finto.data_uscita, finto.stato, anno);
      if (!periodo) continue;
      const uba = calcolaUBAMedioExp("suino", periodo.giorni, periodo.etaAllInizio);
      if (!uba) continue;
      const ubaGiorni = Math.round(uba * periodo.giorni * 1000) / 1000;
      const cat = categoriaContabileExp(finto);
      const codice = u.codice_completo || `${codLotto}${String(u.nr).padStart(2, "0")}`;

      righe.push({
        bdn: codice, nome: "", specie: "suino", categoria: categoriaEtàExp("suino", periodo.etaAllInizio, periodo.giorni),
        nascita: l.data_parto, inizio_calcolo: periodo.inizio, data_riferimento: periodo.fine, giorni_presenza: periodo.giorni,
        uba_medio: uba, uba_giorni: ubaGiorni, stato: finto.stato, qualifica_riproduzione: null,
        data_uscita: u.data_uscita || null, motivo_uscita: u.motivo_uscita || null, lotto: codLotto,
        categoria_contabile: cat, animale_id: null, lotto_id: l.id, unita_nr: u.nr,
      });
    }
  }

  return righe;
}

// Formula aggressiva decisa con Filippo: gli improduttivi_usciti sono ESCLUSI dal divisore,
// quindi tutto il costo netto da recuperare ricade sui soli produttivi/riproduttori.
// "perditaSpalmata" è un dato di TRASPARENZA (quanto in più pagano i sopravvissuti
// rispetto a un'ipotetica ripartizione su tutti) — non viene mai sommato al calcolo,
// altrimenti si conterebbe due volte lo stesso costo.
export function calcolaTassoAggressivo(righeUba, costiTotali, valoreRiformaTotale) {
  const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

  const ubaGiorniProduttivi = righeUba
    .filter(r => r.categoria_contabile !== "IMPRODUTTIVO_USCITO")
    .reduce((s, r) => s + r.uba_giorni, 0);
  const ubaGiorniImproduttivi = righeUba
    .filter(r => r.categoria_contabile === "IMPRODUTTIVO_USCITO")
    .reduce((s, r) => s + r.uba_giorni, 0);
  const ubaGiorniTotali = ubaGiorniProduttivi + ubaGiorniImproduttivi;
  const nettoDaRecuperare = costiTotali - valoreRiformaTotale;

  if (ubaGiorniProduttivi <= 0) {
    return { tassoSemplice: 0, tassoRettificato: 0, perditaSpalmata: 0, ubaGiorniProduttivi: 0, ubaGiorniImproduttivi: round2(ubaGiorniImproduttivi) };
  }

  const tassoSemplice = ubaGiorniTotali > 0 ? nettoDaRecuperare / ubaGiorniTotali : 0;
  const tassoRettificato = nettoDaRecuperare / ubaGiorniProduttivi;
  const perditaSpalmata = round2((tassoRettificato - tassoSemplice) * ubaGiorniProduttivi);

  return {
    tassoSemplice: Math.round(tassoSemplice * 1000000) / 1000000,
    tassoRettificato: Math.round(tassoRettificato * 1000000) / 1000000,
    perditaSpalmata,
    ubaGiorniProduttivi: round2(ubaGiorniProduttivi),
    ubaGiorniImproduttivi: round2(ubaGiorniImproduttivi),
  };
}
