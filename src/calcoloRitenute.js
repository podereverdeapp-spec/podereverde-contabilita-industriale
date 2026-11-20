// Versione 390 (ordini del Dott. Bizzarri del 17/11/2026 ore 14:56 e 17:53; progetto claude/progetto_ritenute_acconto.md).
// Ritenute d'acconto delle fatture passive: dovute quando la fattura è pagata, si versano con l'F24 (codice tributo 1040)
// entro il 16 del mese dopo il pagamento, con mese e anno del pagamento nella riga dell'F24 («rateazione / mese» e «anno»).
// Solo calcolo: nessuna scrittura. Verificato sui dati veri del 17/11/2026: 4 ritenute pagate, 4 righe 1040 con lo stesso mese e importo.
// Versione 390b (18/11/2026, ordine del Dott. Bizzarri delle 13:05): i pagamenti disposti e non ancora addebitati dalla banca
// non fanno nascere la ritenuta; chi non può leggere gli F24 vede «F24 non visibili» e nessun avviso; se l'F24 comprende già la
// ritenuta di un pagamento disposto e non confermato: «pagamento da confermare», non «F24 diverso»; termine con sabati, feste e agosto.

const c2 = n => Math.round((Number(n) || 0) * 100) / 100;
export const meseDi = data => String(data || "").slice(0, 7); // «aaaa-mm»
// Pasqua (calendario gregoriano, algoritmo di Meeus/Jones/Butcher): serve per il lunedì dell'Angelo
function pasqua(a) {
  const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((c + 8) / 25), h = Math.floor((c - g + 1) / 3);
  const i = (19 * b + c - e - h + 15) % 30, k = Math.floor(d / 4), l = d % 4, mm = (32 + 2 * f + 2 * k - i - l) % 7, n = Math.floor((b + 11 * i + 22 * mm) / 451);
  const mese = Math.floor((i + mm - 7 * n + 114) / 31), giorno = ((i + mm - 7 * n + 114) % 31) + 1;
  return new Date(Date.UTC(a, mese - 1, giorno));
}
const iso = d => d.toISOString().slice(0, 10);
function festivo(d) { // sabato, domenica o festa nazionale
  const g = d.getUTCDay(); if (g === 0 || g === 6) return true;
  const md = iso(d).slice(5);
  if (["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26"].includes(md)) return true;
  const lunAngelo = pasqua(d.getUTCFullYear()); lunAngelo.setUTCDate(lunAngelo.getUTCDate() + 1);
  return iso(d) === iso(lunAngelo);
}
// Versione 390b: il 16 del mese dopo; ad agosto il 20 (art. 3-quater D.L. 16/2012, «proroga di Ferragosto»);
// se cade di sabato, domenica o festa, il primo giorno lavorativo dopo (es. 16/05/2026 sabato → 18/05/2026, come l'F24 vero)
export function termineVersamento(mese) {
  const [a, m] = String(mese || "").split("-").map(Number);
  if (!(a > 1900) || !(m >= 1 && m <= 12)) return null; // mese non valido (F24 senza anno, pagamento senza data): nessun termine, la riga è «dato da correggere»
  const a2 = m === 12 ? a + 1 : a, m2 = m === 12 ? 1 : m + 1;
  const d = new Date(Date.UTC(a2, m2 - 1, m2 === 8 ? 20 : 16));
  while (festivo(d)) d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}
const meseMenoUno = mese => { const [a, m] = mese.split("-").map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; };

// scadenze: righe di ci_scadenze con ritenuta (lato fornitore), con fornitore { nome }
// abbinamenti: { scadenza_id, importo, data, inAttesa } dei pagamenti non stornati; inAttesa = disposto, la banca non l'ha ancora addebitato
// righe1040: { anno_riferimento, rateazione_mese, importo_debito, stato, data_pagamento, f24_id } (F24 «Sostituito» esclusi dal chiamante)
// primaScadenzaF24: la scadenza più vecchia fra gli F24 del programma (prima di quel mese i versamenti non si possono controllare)
// oggi: «aaaa-mm-gg» a Roma
// f24Visibili: false se chi guarda non può leggere gli F24 (le righe 1040 non gli arrivano: non si può dire niente sul versamento)
export function calcolaRitenute({ scadenze, abbinamenti, righe1040, primaScadenzaF24, oggi, f24Visibili = true }) {
  // una fattura per documento: la ritenuta è del documento, le rate sono il netto da pagare
  const fatture = new Map();
  for (const s of scadenze) {
    const k = s.fattura_id != null ? `f${s.fattura_id}` : `${s.fornitore_id}|${s.numero_documento}|${s.data_documento}`;
    const f = fatture.get(k) || { chiave: k, fornitore: s.fornitore_nome || "", numero: s.numero_documento, data: s.data_documento, totale: Number(s.totale_documento) || 0,
      ritenuta: 0, netto: 0, scadenzeIds: [], pagamenti: [], disposti: [] };
    f.ritenuta = Math.max(f.ritenuta, c2(s.ritenuta)); f.netto = c2(f.netto + (Number(s.importo) || 0)); f.scadenzeIds.push(s.id);
    fatture.set(k, f);
  }
  const perScadenza = new Map();
  const dispostiPerScadenza = new Map();
  for (const a of abbinamenti) { const mappa = a.inAttesa ? dispostiPerScadenza : perScadenza; if (!mappa.has(a.scadenza_id)) mappa.set(a.scadenza_id, []); mappa.get(a.scadenza_id).push(a); }
  // la quota di ritenuta di ogni mese: in proporzione al netto pagato in quel mese
  const quotePerMese = new Map(); // mese → [{ chiave, quota }]
  const dispostiPerMese = new Map(); // mese → quota dei pagamenti disposti e non confermati
  for (const f of fatture.values()) {
    f.pagamenti = f.scadenzeIds.flatMap(id => perScadenza.get(id) || []).sort((x, y) => String(x.data).localeCompare(String(y.data)));
    f.disposti = f.scadenzeIds.flatMap(id => dispostiPerScadenza.get(id) || []).sort((x, y) => String(x.data).localeCompare(String(y.data)));
    f.pagato = c2(f.pagamenti.reduce((t, p) => t + (Number(p.importo) || 0), 0));
    f.mesi = new Map();
    if (f.netto > 0) for (const p of f.pagamenti) {
      const m = meseDi(p.data); const quota = c2(f.ritenuta * (Number(p.importo) || 0) / f.netto);
      f.mesi.set(m, c2((f.mesi.get(m) || 0) + quota));
    }
    // l'ultimo centesimo va all'ultimo mese, così le quote sommano la ritenuta quando la fattura è pagata tutta
    if (f.pagato >= f.netto - 0.01 && f.mesi.size) { const somma = c2([...f.mesi.values()].reduce((t, q) => t + q, 0)); const ultimo = [...f.mesi.keys()].pop(); f.mesi.set(ultimo, c2(f.mesi.get(ultimo) + f.ritenuta - somma)); }
    for (const [m, q] of f.mesi) { if (!quotePerMese.has(m)) quotePerMese.set(m, []); quotePerMese.get(m).push({ chiave: f.chiave, quota: q }); }
    // versione 390b: le quote dei pagamenti disposti e non ancora confermati, per mese della disposizione (non sono dovute:
    // servono solo a riconoscere un F24 che le comprende già, quando l'estratto della banca non è ancora stato confermato)
    if (f.netto > 0) for (const p of f.disposti) { const m = meseDi(p.data); dispostiPerMese.set(m, c2((dispostiPerMese.get(m) || 0) + c2(f.ritenuta * (Number(p.importo) || 0) / f.netto))); }
  }
  // F24 1040 per mese del pagamento
  const f24PerMese = new Map();
  for (const r of (f24Visibili ? righe1040 : [])) {
    const mm = String(r.rateazione_mese || "").replace(/\D/g, "").slice(-2).padStart(2, "0");
    const m = `${r.anno_riferimento}-${mm}`;
    const x = f24PerMese.get(m) || { importo: 0, pagato: true, date: [] };
    x.importo = c2(x.importo + (Number(r.importo_debito) || 0)); x.pagato = x.pagato && r.stato === "Pagato"; if (r.data_pagamento) x.date.push(r.data_pagamento);
    f24PerMese.set(m, x);
  }
  // l'F24 del mese comprende anche la ritenuta di un pagamento disposto in quel mese o in quello prima (addebito a cavallo del mese)
  const copreDisposti = (importo, dovuto, m) => {
    const qui = dispostiPerMese.get(m) || 0, prima = dispostiPerMese.get(meseMenoUno(m)) || 0;
    return [qui, prima, c2(qui + prima)].some(x => x > 0 && Math.abs(importo - c2(dovuto + x)) <= 0.01);
  };
  const primoMeseControllabile = f24Visibili && primaScadenzaF24 ? meseMenoUno(meseDi(primaScadenzaF24)) : null;
  const mesi = [...new Set([...quotePerMese.keys(), ...f24PerMese.keys()])].sort().map(m => {
    const dovuto = c2((quotePerMese.get(m) || []).reduce((t, q) => t + q.quota, 0));
    const f24 = f24PerMese.get(m) || null; const termine = termineVersamento(m);
    let stato;
    if (!termine) stato = "dato da correggere";
    else if (!f24Visibili) stato = "F24 non visibili";
    else if (primoMeseControllabile && m < primoMeseControllabile) stato = "non controllabile";
    else if (f24 && Math.abs(f24.importo - dovuto) <= 0.01) stato = f24.pagato ? "versata" : "F24 da pagare";
    else if (f24 && copreDisposti(f24.importo, dovuto, m)) stato = f24.pagato ? "pagamento da confermare" : "F24 da pagare";
    else if (f24) stato = "F24 diverso";
    else if (dovuto <= 0) stato = "versata";
    else stato = oggi > termine ? "scaduta" : "da versare";
    return { mese: m, termine, dovuto, f24, stato, differenza: f24 ? c2(f24.importo - dovuto) : null };
  });
  const perMese = new Map(mesi.map(x => [x.mese, x]));
  const righe = [...fatture.values()].map(f => {
    const pagata = f.pagato >= f.netto - 0.01 && f.netto > 0;
    const statiMesi = [...f.mesi.keys()].map(m => perMese.get(m)?.stato);
    const ordine = ["dato da correggere", "scaduta", "F24 diverso", "da versare", "F24 da pagare", "pagamento da confermare", "F24 non visibili", "non controllabile", "versata"];
    let stato = statiMesi.length ? ordine.find(s => statiMesi.includes(s)) : "da pagare";
    if (!pagata && stato === "versata") stato = "pagata in parte";
    if (!statiMesi.length) stato = f.disposti.length ? "pagamento disposto" : "da pagare";
    const mesiF = [...f.mesi.keys()];
    return { ...f, pagata, stato, mesiPagamento: mesiF, termine: mesiF.length ? termineVersamento(mesiF[mesiF.length - 1]) : null };
  }).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  return { righe, mesi, primoMeseControllabile, f24Visibili };
}

// le ritenute che chiedono un'azione: scadute, o da versare con il termine entro 7 giorni; F24 diverso
export function daSegnalare(mesi, oggi) {
  const tra7 = new Date(`${oggi}T12:00:00Z`); tra7.setUTCDate(tra7.getUTCDate() + 7);
  const limite = tra7.toISOString().slice(0, 10);
  return mesi.filter(x => x.stato === "scaduta" || x.stato === "F24 diverso" || (x.stato === "da versare" && x.termine <= limite));
}
