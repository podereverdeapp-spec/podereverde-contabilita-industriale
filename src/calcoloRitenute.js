// Versione 390 (ordini del Dott. Bizzarri del 17/11/2026 ore 14:56 e 17:53; progetto claude/progetto_ritenute_acconto.md).
// Ritenute d'acconto delle fatture passive: dovute quando la fattura è pagata, si versano con l'F24 (codice tributo 1040)
// entro il 16 del mese dopo il pagamento, con mese e anno del pagamento nella riga dell'F24 («rateazione / mese» e «anno»).
// Solo calcolo: nessuna scrittura. Verificato sui dati veri del 17/11/2026: 4 ritenute pagate, 4 righe 1040 con lo stesso mese e importo.

const c2 = n => Math.round((Number(n) || 0) * 100) / 100;
export const meseDi = data => String(data || "").slice(0, 7); // «aaaa-mm»
export function termineVersamento(mese) { // il 16 del mese dopo
  const [a, m] = mese.split("-").map(Number);
  const a2 = m === 12 ? a + 1 : a, m2 = m === 12 ? 1 : m + 1;
  return `${a2}-${String(m2).padStart(2, "0")}-16`;
}
const meseMenoUno = mese => { const [a, m] = mese.split("-").map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; };

// scadenze: righe di ci_scadenze con ritenuta (lato fornitore), con fornitore { nome }
// abbinamenti: { scadenza_id, importo, data } dei pagamenti non stornati
// righe1040: { anno_riferimento, rateazione_mese, importo_debito, stato, data_pagamento, f24_id } (F24 «Sostituito» esclusi dal chiamante)
// primaScadenzaF24: la scadenza più vecchia fra gli F24 del programma (prima di quel mese i versamenti non si possono controllare)
// oggi: «aaaa-mm-gg» a Roma
export function calcolaRitenute({ scadenze, abbinamenti, righe1040, primaScadenzaF24, oggi }) {
  // una fattura per documento: la ritenuta è del documento, le rate sono il netto da pagare
  const fatture = new Map();
  for (const s of scadenze) {
    const k = s.fattura_id != null ? `f${s.fattura_id}` : `${s.fornitore_id}|${s.numero_documento}|${s.data_documento}`;
    const f = fatture.get(k) || { chiave: k, fornitore: s.fornitore_nome || "", numero: s.numero_documento, data: s.data_documento, totale: Number(s.totale_documento) || 0,
      ritenuta: 0, netto: 0, scadenzeIds: [], pagamenti: [] };
    f.ritenuta = Math.max(f.ritenuta, c2(s.ritenuta)); f.netto = c2(f.netto + (Number(s.importo) || 0)); f.scadenzeIds.push(s.id);
    fatture.set(k, f);
  }
  const perScadenza = new Map();
  for (const a of abbinamenti) { if (!perScadenza.has(a.scadenza_id)) perScadenza.set(a.scadenza_id, []); perScadenza.get(a.scadenza_id).push(a); }
  // la quota di ritenuta di ogni mese: in proporzione al netto pagato in quel mese
  const quotePerMese = new Map(); // mese → [{ chiave, quota }]
  for (const f of fatture.values()) {
    f.pagamenti = f.scadenzeIds.flatMap(id => perScadenza.get(id) || []).sort((x, y) => String(x.data).localeCompare(String(y.data)));
    f.pagato = c2(f.pagamenti.reduce((t, p) => t + (Number(p.importo) || 0), 0));
    f.mesi = new Map();
    if (f.netto > 0) for (const p of f.pagamenti) {
      const m = meseDi(p.data); const quota = c2(f.ritenuta * (Number(p.importo) || 0) / f.netto);
      f.mesi.set(m, c2((f.mesi.get(m) || 0) + quota));
    }
    // l'ultimo centesimo va all'ultimo mese, così le quote sommano la ritenuta quando la fattura è pagata tutta
    if (f.pagato >= f.netto - 0.01 && f.mesi.size) { const somma = c2([...f.mesi.values()].reduce((t, q) => t + q, 0)); const ultimo = [...f.mesi.keys()].pop(); f.mesi.set(ultimo, c2(f.mesi.get(ultimo) + f.ritenuta - somma)); }
    for (const [m, q] of f.mesi) { if (!quotePerMese.has(m)) quotePerMese.set(m, []); quotePerMese.get(m).push({ chiave: f.chiave, quota: q }); }
  }
  // F24 1040 per mese del pagamento
  const f24PerMese = new Map();
  for (const r of righe1040) {
    const mm = String(r.rateazione_mese || "").replace(/\D/g, "").slice(-2).padStart(2, "0");
    const m = `${r.anno_riferimento}-${mm}`;
    const x = f24PerMese.get(m) || { importo: 0, pagato: true, date: [] };
    x.importo = c2(x.importo + (Number(r.importo_debito) || 0)); x.pagato = x.pagato && r.stato === "Pagato"; if (r.data_pagamento) x.date.push(r.data_pagamento);
    f24PerMese.set(m, x);
  }
  const primoMeseControllabile = primaScadenzaF24 ? meseMenoUno(meseDi(primaScadenzaF24)) : null;
  const mesi = [...new Set([...quotePerMese.keys(), ...f24PerMese.keys()])].sort().map(m => {
    const dovuto = c2((quotePerMese.get(m) || []).reduce((t, q) => t + q.quota, 0));
    const f24 = f24PerMese.get(m) || null; const termine = termineVersamento(m);
    let stato;
    if (primoMeseControllabile && m < primoMeseControllabile) stato = "non controllabile";
    else if (f24 && Math.abs(f24.importo - dovuto) <= 0.01) stato = f24.pagato ? "versata" : "F24 da pagare";
    else if (f24) stato = "F24 diverso";
    else if (dovuto <= 0) stato = "versata";
    else stato = oggi > termine ? "scaduta" : "da versare";
    return { mese: m, termine, dovuto, f24, stato, differenza: f24 ? c2(f24.importo - dovuto) : null };
  });
  const perMese = new Map(mesi.map(x => [x.mese, x]));
  const righe = [...fatture.values()].map(f => {
    const pagata = f.pagato >= f.netto - 0.01 && f.netto > 0;
    const statiMesi = [...f.mesi.keys()].map(m => perMese.get(m)?.stato);
    const ordine = ["scaduta", "F24 diverso", "da versare", "F24 da pagare", "non controllabile", "versata"];
    let stato = statiMesi.length ? ordine.find(s => statiMesi.includes(s)) : "da pagare";
    if (!pagata && stato === "versata") stato = "pagata in parte";
    if (!statiMesi.length) stato = "da pagare";
    const mesiF = [...f.mesi.keys()];
    return { ...f, pagata, stato, mesiPagamento: mesiF, termine: mesiF.length ? termineVersamento(mesiF[mesiF.length - 1]) : null };
  }).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  return { righe, mesi, primoMeseControllabile };
}

// le ritenute che chiedono un'azione: scadute, o da versare con il termine entro 7 giorni; F24 diverso
export function daSegnalare(mesi, oggi) {
  const tra7 = new Date(`${oggi}T12:00:00Z`); tra7.setUTCDate(tra7.getUTCDate() + 7);
  const limite = tra7.toISOString().slice(0, 10);
  return mesi.filter(x => x.stato === "scaduta" || x.stato === "F24 diverso" || (x.stato === "da versare" && x.termine <= limite));
}
