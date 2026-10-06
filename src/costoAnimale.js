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
  if (animale) return animale.provenienza === "Acquistato" && !animale.natoConLaMadre ? round2(num(animale.prezzo_acquisto)) : 0;
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

// ── Riproduttore «effettivo» (deciso dal Dott. Bizzarri il 05/10/2026) ───────────────────────
// Se nell'app è registrato un parto, l'animale È un riproduttore, anche se nella sua scheda il
// segno «riproduttore» manca: è madre o padre di almeno un capo con matricola o di un lotto di
// suinetti nati in azienda. Il programma lo tratta come riproduttore in tutti i calcoli; l'app
// non viene modificata. Gli elenchi lo indicano come «riproduttore dai parti registrati».
export function idGenitori(animali, lotti) {
  const g = new Set();
  for (const a of animali || []) { if (a.madre_id) g.add(a.madre_id); if (a.padre_id) g.add(a.padre_id); }
  for (const l of lotti || []) {
    if (l.tipo_provenienza === "acquistato") continue;
    if (l.madre_id) g.add(l.madre_id); if (l.padre_id) g.add(l.padre_id);
  }
  return g;
}
export function segnaRiproduttoriEffettivi(animali, genitori) {
  return (animali || []).map(a => (!a.riproduttore && genitori.has(a.id)) ? { ...a, riproduttore: true, riproduttoreDaiParti: true } : a);
}

// ── Vitelli entrati in azienda con la madre (deciso dal Dott. Bizzarri il 05/10/2026) ─────────
// Un vitello nato presso il venditore ed entrato in azienda insieme alla madre comprata è un
// FIGLIO DI QUELLA MADRE: entra nella mandria dell'anno in cui è nato, riceve il costo di
// nascita come gli altri nati e conta tra i nati di quell'anno. Il prezzo pagato è tutto della
// madre (si ammortizza sui suoi figli, compreso questo). ECCEZIONE: se al vitello è stata data una
// parte del prezzo (prezzo di acquisto maggiore di zero nell'app), resta un capo acquistato con quel prezzo.
// Riconoscimento: madre comprata registrata nell'app, vitello nato prima del suo ingresso ed
// entrato lo stesso giorno della madre (al massimo 7 giorni di differenza).
// La presenza in azienda (e quindi il mantenimento) del vitello parte sempre dal suo ingresso.
// Il vitello è stato concepito presso il venditore: il padre scritto nell'app non si usa (non è un
// toro dell'azienda e non riceve il costo di quel vitello).
const giorniTra = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000;
export function applicaNatiConLaMadre(animali) {
  const lista = animali || [];
  const perId = new Map(lista.map(a => [a.id, a]));
  const vitelliDi = new Map(); // id madre → vitelli entrati con lei
  for (const a of lista) {
    if (a.provenienza === "Nato in azienda" || !a.madre_id || !a.nascita || !a.data_ingresso) continue;
    // Vitello a cui è stata data una parte del prezzo (es. femmina Dominici tenuta come futura
    // fattrice, decisione del Dott. Bizzarri del 05/10/2026): resta un capo acquistato con il suo prezzo
    if (num(a.prezzo_acquisto) > 0) continue;
    const m = perId.get(a.madre_id);
    if (!m || m.provenienza === "Nato in azienda" || !m.data_ingresso) continue;
    if (String(a.nascita).slice(0, 10) > String(a.data_ingresso).slice(0, 10)) continue;
    if (giorniTra(a.data_ingresso, m.data_ingresso) > 7) continue;
    if (!vitelliDi.has(m.id)) vitelliDi.set(m.id, []);
    vitelliDi.get(m.id).push(a);
  }
  if (!vitelliDi.size) return lista;
  const idVitelli = new Set([...vitelliDi.values()].flat().map(v => v.id));
  return lista.map(a => {
    if (idVitelli.has(a.id)) {
      // Concepito presso il venditore: il padre scritto nell'app non può essere un toro dell'azienda
      return { ...a, natoConLaMadre: true, prezzoAcquistoNellApp: num(a.prezzo_acquisto), prezzo_acquisto: 0, padreNellApp: a.padre_id ?? null, padre_id: null };
    }
    if (vitelliDi.has(a.id)) {
      const vitelli = vitelliDi.get(a.id);
      const aggiunto = round2(vitelli.reduce((s, v) => s + num(v.prezzo_acquisto), 0));
      return { ...a, vitelliEntratiConLei: vitelli.map(v => v.bdn || v.id), prezzoAcquistoNellApp: num(a.prezzo_acquisto),
        prezzo_acquisto: round2(num(a.prezzo_acquisto) + aggiunto) };
    }
    return a;
  });
}
// Nato della mandria: nato in azienda oppure entrato con la madre
export const eNatoDellaMandria = a => !!a && (a.provenienza === "Nato in azienda" || !!a.natoConLaMadre);

// ── Capi passati a scheda individuale da un LOTTO COMPRATO (deciso il 05/10/2026) ────────────
// Il prezzo del lotto si divide per il numero di capi del lotto (compresi quelli poi passati a
// scheda individuale). Il capo con la scheda individuale vale la sua parte del lotto, anche se
// nell'app ha un prezzo di acquisto diverso: così il totale non supera mai la fattura del lotto.
// Il capo si riconosce dalla matricola del suinetto nel lotto, oppure dal codice del suinetto
// scritto nella nota della scheda («Da lotto … unità <codice>»).
export function applicaAcquistoDaLotto(animali, lotti, unita) {
  const lista = animali || [];
  const lottiComprati = new Map((lotti || []).filter(l => l.tipo_provenienza === "acquistato").map(l => [l.id, l]));
  if (!lottiComprati.size) return lista;
  const nUnita = conteggioUnitaPerLotto(unita);
  const perMatricola = new Map(), perCodice = new Map();
  for (const u of unita || []) {
    if (u.stato !== "registrato_individuale" || !lottiComprati.has(u.lotto_id)) continue;
    if (u.bdn) perMatricola.set(String(u.bdn).trim().toUpperCase(), u);
    if (u.codice_completo) perCodice.set(String(u.codice_completo).trim().toUpperCase(), u);
  }
  return lista.map(a => {
    if (a.provenienza === "Nato in azienda") return a;
    let u = a.bdn ? perMatricola.get(String(a.bdn).trim().toUpperCase()) : null;
    if (!u && a.note) {
      const m = String(a.note).match(/da lotto .*?unit[aà]\s+([A-Z0-9]+)/i);
      if (m) u = perCodice.get(m[1].toUpperCase());
    }
    if (!u) return a;
    const l = lottiComprati.get(u.lotto_id);
    const quota = round2(num(l.prezzo_acquisto) / (nUnita.get(l.id) || 1));
    return { ...a, daLottoComprato: l.codice_lotto || l.codice, prezzoAcquistoNellApp: num(a.prezzo_acquisto), prezzo_acquisto: quota };
  });
}

// Tutte le regole sui costi di partenza, nell'ordine giusto
export function normalizzaAnimali(animali, lotti, unita) {
  return applicaNatiConLaMadre(applicaAcquistoDaLotto(animali, lotti, unita));
}
