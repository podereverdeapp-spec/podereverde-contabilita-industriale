// Versione 296 — «Acquistare o far nascere? Come cambiano i numeri nel tempo» (Report di Analisi · Bovini).
// Ricalcola con i dati del programma di oggi gli indicatori dello studio di ottobre 2026
// (Word «Studio_Acquistare_o_far_nascere_bovini_2026-10-26», approvato dal Dott. Bizzarri il 26/10/2026)
// e li mette accanto ai valori di allora, che restano fissi in OTTOBRE_2026.
// Stesse regole dello studio:
// - costo di nascita, costo della mandria, nati: Report Riproduttori del programma (ci_costo_nascita_mandria);
// - vacche in carriera: femmine riproduttrici dal primo figlio nato in azienda fino all'uscita (come il Report Riproduttori);
// - capi da ingrasso acquistati: comprati da vitelli o giovani (fino a 30 mesi), non riproduttori, macellati o in azienda,
//   esclusi i vitelli entrati con la madre senza prezzo proprio; capi da ingrasso nati in azienda: macellati o in azienda;
// - costo accumulato mese per mese: mantenimento dell'anno (ci_costo_animale_annuale) diviso tra i giorni di presenza
//   con i coefficienti UBA per età (0,4 fino a 210 giorni, 0,7 fino a 730, poi 1), media dei capi presenti in ogni mese;
// - costo di un riproduttore adulto: mantenimento per UBA-giorno dell'anno × giorni dell'anno (uguale per tori e vacche);
// - vacche da controllare: in azienda, ultimo parto oltre 15 mesi fa, oppure mai partorito oltre i 30 mesi.
// Sola lettura: nessuna scrittura nel database.
import { normalizzaAnimali, idGenitori, eNatoDellaMandria, eUscito } from "./costoAnimale";

const MESE = 30.4375;
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const g10 = d => (d ? String(d).slice(0, 10) : null);
const annoDi = d => (d ? parseInt(String(d).slice(0, 4)) : null);
const UTC = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const giorni = (da, a) => Math.round((UTC(a) - UTC(da)) / 86400000);
const piuGiorni = (s, n) => new Date(UTC(s) + n * 86400000).toISOString().slice(0, 10);
const coeff = eta => (eta < 210 ? 0.4 : eta < 730 ? 0.7 : 1);
const media = l => (l.length ? l.reduce((s, x) => s + x, 0) / l.length : null);
const r2 = v => (v === null || v === undefined ? null : Math.round(v * 100) / 100);

// Valori dello studio, fermi a ottobre 2026 (dati del programma al 24/10/2026, costo di nascita 2026 ricalcolato il 26/10/2026)
export const OTTOBRE_2026 = {
  data: "24/10/2026",
  annoIntero: 2025,
  costoNascita: 3579.55, vitelliPerVacca: 0.85, costoUnVitelloPerVacca: 3028.85, costoAdulto: 2730.25,
  prezzoAcquisto: 960.34, capiAcquistati: 35, etaAcquisto: 6.58,
  nascitaMedia: 3269.29, capiNati: 84,
  costo18Nato: 5505.69, costo18Acquistato: 2694.41,
  // costo al kg con i soli pesi scritti nelle schede (49 nati, 10 acquistati); lo studio, con 2 pesi ricavati dalle fatture, dà 23,44 € su 51 nati
  kgNati: 23.34, capiKgNati: 49, kgAcquistati: 15.34, capiKgAcquistati: 10,
  vacche: 5, costoVacche: 13651.25,
};

export function studioBovini({ animali, lotti, costiAnimali, mandria, razze }, oggiData = new Date()) {
  const oggi = oggiData.toISOString().slice(0, 10);
  const annoCorrente = annoDi(oggi);
  const bov = (costiAnimali || []).filter(r => r.specie === "bovino" && r.animale_id);
  const righe = new Map();
  bov.forEach(r => { if (!righe.has(r.animale_id)) righe.set(r.animale_id, new Map()); righe.get(r.animale_id).set(r.anno, r); });

  // Fine del calcolo dei costi di ogni anno: un capo adulto presente tutto l'anno ha tanti UBA-giorno quanti i giorni calcolati
  const maxUba = new Map();
  bov.forEach(r => maxUba.set(r.anno, Math.max(maxUba.get(r.anno) || 0, num(r.uba_giorni))));
  const ultimoAnnoCosti = Math.max(...[...maxUba.keys()]);
  const fineAnno = y => {
    const dic = `${y}-12-31`, m = maxUba.get(y);
    if (!m) return dic;
    const f = piuGiorni(`${y}-01-01`, Math.round(m) - 1);
    return f < dic ? f : dic;
  };
  const fineCalcolo = fineAnno(ultimoAnnoCosti);

  const tutti = normalizzaAnimali(animali || [], lotti || [], []).filter(a => a.specie === "bovino");
  const genitori = idGenitori(animali || [], lotti || []);
  const rip = a => !!a.riproduttore || genitori.has(a.id);
  const mand = y => (mandria instanceof Map ? mandria.get(`bovino|${y}`) : (mandria || []).find(m => m.specie === "bovino" && m.anno === y)) || null;

  // ── Mandria anno per anno ─────────────────────────────────────────────────────────────
  const figliDi = new Map();
  tutti.filter(eNatoDellaMandria).forEach(f => { if (f.madre_id && f.nascita) { if (!figliDi.has(f.madre_id)) figliDi.set(f.madre_id, []); figliDi.get(f.madre_id).push(f); } });
  const vacche = tutti.filter(a => a.sesso === "F" && rip(a));
  const carriera = vacche.map(v => {
    const fine = !eUscito(v.stato) || !v.data_uscita ? annoCorrente : annoDi(v.data_uscita);
    const anni = (figliDi.get(v.id) || []).map(f => annoDi(f.nascita)).filter(y => y <= fine);
    return { v, primo: anni.length ? Math.min(...anni) : null, fine };
  });
  const vaccheInCarriera = y => carriera.filter(c => c.primo !== null && c.primo <= y && y <= c.fine).length;

  const acquistati = tutti.filter(a => (a.provenienza === "Acquistato" || a.provenienza === "Trasferito") && !a.natoConLaMadre && !rip(a)
    && (a.stato === "macellato" || a.stato === "attivo") && a.nascita && a.data_ingresso && num(a.prezzo_acquisto) > 0
    && giorni(g10(a.nascita), g10(a.data_ingresso)) / MESE <= 30);
  const nati = tutti.filter(a => a.provenienza === "Nato in azienda" && !rip(a) && (a.stato === "macellato" || a.stato === "attivo") && a.nascita);

  const anniMandria = [];
  for (let y = 2019; y <= annoCorrente; y++) {
    const m = mand(y); if (!m) continue;
    const vc = vaccheInCarriera(y), entrati = acquistati.filter(a => annoDi(a.data_ingresso) === y);
    anniMandria.push({ anno: y, inCorso: y === annoCorrente, costoMandria: num(m.costo_mandria), nati: num(m.nati), vacche: vc,
      vitelliPerVacca: vc ? num(m.nati) / vc : null, costoNascita: num(m.costo_nascita_per_nato), costoUnVitelloPerVacca: vc ? num(m.costo_mandria) / vc : null,
      acquistatiNellAnno: entrati.length, prezzoAcquistatiNellAnno: media(entrati.map(a => num(a.prezzo_acquisto))) });
  }
  const interi = anniMandria.filter(a => !a.inCorso);
  const ultimoIntero = interi[interi.length - 1] || null;

  // Costo di un riproduttore adulto presente tutto l'anno
  const costoAdulto = y => {
    const rr = bov.filter(r => r.anno === y), u = rr.reduce((s, r) => s + num(r.uba_giorni), 0);
    const gg = giorni(`${y}-01-01`, fineAnno(y)) + 1;
    return u > 0 ? rr.reduce((s, r) => s + num(r.costo_mantenimento), 0) / u * gg : null;
  };

  // ── Costo accumulato mese per mese di vita ─────────────────────────────────────────────
  const curva = (gruppo, inizioDi) => {
    const somma = new Map(), gg = new Map();
    for (const a of gruppo) {
      const nascita = g10(a.nascita), inizio = inizioDi(a);
      const uscita = a.data_uscita && eUscito(a.stato) ? g10(a.data_uscita) : fineCalcolo;
      const fine = uscita < fineCalcolo ? uscita : fineCalcolo;
      if (!inizio || inizio > fine) continue;
      const rr = righe.get(a.id) || new Map();
      for (let y = annoDi(inizio); y <= annoDi(fine); y++) {
        const da = y === annoDi(inizio) ? inizio : `${y}-01-01`, a2 = y === annoDi(fine) ? fine : `${y}-12-31`;
        const n = giorni(da, a2) + 1, e0 = giorni(nascita, da);
        let sc = 0; for (let k = 0; k < n; k++) sc += coeff(e0 + k);
        const costo = num(rr.get(y)?.costo_mantenimento);
        for (let k = 0; k < n; k++) {
          const mese = Math.floor((e0 + k) / MESE);
          somma.set(mese, (somma.get(mese) || 0) + (sc ? costo * coeff(e0 + k) / sc : 0));
          gg.set(mese, (gg.get(mese) || 0) + 1);
        }
      }
    }
    // come il foglio Excel dello studio: il costo di ogni mese si arrotonda al centesimo prima di sommarlo
    return k => (gg.get(k) ? r2(somma.get(k) / gg.get(k) * MESE) : 0);
  };
  const meseA = curva(acquistati, a => g10(a.data_ingresso)), meseN = curva(nati, a => g10(a.nascita));
  const prezzoAcquisto = media(acquistati.map(a => num(a.prezzo_acquisto)));
  const etaAcquisto = media(acquistati.map(a => giorni(g10(a.nascita), g10(a.data_ingresso)) / MESE));
  const nascitaDi = a => num(mand(annoDi(a.nascita))?.costo_nascita_per_nato);
  const nascitaMedia = media(nati.map(nascitaDi));
  const accumulato = mesi => {
    let n = nascitaMedia; for (let k = 0; k < mesi; k++) n += meseN(k);
    let ac = null;
    if (prezzoAcquisto !== null) {
      const k0 = Math.floor(etaAcquisto); ac = prezzoAcquisto + meseA(k0) * (k0 + 1 - etaAcquisto);
      for (let k = k0 + 1; k < mesi; k++) ac += meseA(k);
    }
    return { nato: n, acquistato: ac };
  };
  const a18 = accumulato(18);

  // ── Costo al kg di carcassa dei capi macellati e pesati (tutte le età) ───────────────────
  const mant = a => [...(righe.get(a.id) || new Map()).values()].reduce((s, r) => s + num(r.costo_mantenimento), 0);
  const perKg = (gruppo, partenza) => {
    const mac = gruppo.filter(a => a.stato === "macellato" && num(a.peso_carcassa) > 0);
    const kg = mac.reduce((s, a) => s + num(a.peso_carcassa), 0);
    return { capi: mac.length, perKg: kg ? mac.reduce((s, a) => s + partenza(a) + mant(a), 0) / kg : null };
  };
  const kgN = perKg(nati, nascitaDi), kgA = perKg(acquistati, a => num(a.prezzo_acquisto));

  // ── Vacche da controllare oggi ───────────────────────────────────────────────────────────
  const adulto = ultimoIntero ? costoAdulto(ultimoIntero.anno) : null;
  const daControllare = [];
  for (const v of vacche) {
    if (eUscito(v.stato) || !v.nascita) continue;
    const tuttiFigli = (animali || []).filter(f => f.madre_id === v.id && f.nascita).map(f => g10(f.nascita)).sort();
    const ultimo = tuttiFigli[tuttiFigli.length - 1] || null;
    const etaMesi = giorni(g10(v.nascita), oggi) / MESE;
    if (ultimo && giorni(ultimo, oggi) <= 456) continue;
    if (!ultimo && etaMesi < 30) continue;
    daControllare.push({ id: v.id, matricola: v.bdn || `scheda ${v.id}`, nome: v.nome || "", razza: (razze && razze.get(v.id)) || "",
      ultimoParto: ultimo, mesiDallUltimo: ultimo ? giorni(ultimo, oggi) / MESE : null, etaMesi, costoAnno: adulto });
  }
  daControllare.sort((a, b) => (a.ultimoParto || "9999").localeCompare(b.ultimoParto || "9999"));

  return {
    oggi, fineCalcolo, anni: anniMandria, ultimoIntero,
    indicatori: {
      annoIntero: ultimoIntero ? ultimoIntero.anno : null,
      costoNascita: ultimoIntero ? ultimoIntero.costoNascita : null,
      vitelliPerVacca: ultimoIntero ? ultimoIntero.vitelliPerVacca : null,
      costoUnVitelloPerVacca: ultimoIntero ? ultimoIntero.costoUnVitelloPerVacca : null,
      costoAdulto: adulto,
      prezzoAcquisto, capiAcquistati: acquistati.length, etaAcquisto,
      nascitaMedia, capiNati: nati.length,
      costo18Nato: a18.nato, costo18Acquistato: a18.acquistato,
      kgNati: kgN.perKg, capiKgNati: kgN.capi, kgAcquistati: kgA.perKg, capiKgAcquistati: kgA.capi,
      vacche: daControllare.length, costoVacche: adulto !== null ? r2(adulto) * daControllare.length : null,
    },
    vacche: daControllare,
    arrotonda: r2,
  };
}
