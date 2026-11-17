// Versione 387 (Tenente, 17/11/2026): unisce un bonifico di stipendio letto dalla banca alla busta paga giusta.
// La persona si riconosce dal nome del beneficiario (anche con gli errori della lettura delle scansioni: «PARABHJIOT»),
// il mese dalla causale («STIPENDIO GENNAIO 2026», «QUATTORDICESIMA 2026») o, se manca, dalla data del bonifico.
// Il programma PROPONE: chi carica vede la proposta e la può cambiare; il database rifà i controlli.

const MESI = ["GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE"];
const VUOTE = new Set(["STIPENDIO", "STIPENDI", "DIFFERENZA", "ACCONTO", "SALDO", "MESE", "DEL", "DELLA", "SU", "PER", "PAG", "PAGAMENTO", "BONIFICO",
  "TREDICESIMA", "QUATTORDICESIMA", "MENSILITA", "SIG", "SIGRA", "PODERE", "VERDE", ...MESI]);

const parole = (t) => String(t || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, " ")
  .split(/\s+/).filter(w => w.length >= 3 && !/^\d+$/.test(w) && !VUOTE.has(w));

function distanza(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const simili = (a, b) => a === b || distanza(a, b) <= Math.max(1, Math.floor(Math.min(a.length, b.length) / 4));

// quante parole del nome della persona si ritrovano nel beneficiario (tutte = riconosciuta)
export function somiglianzaNome(beneficiario, cognomeNome) {
  const b = parole(beneficiario), n = parole(cognomeNome);
  if (!n.length) return 0;
  return n.filter(w => b.some(x => simili(w, x))).length / n.length;
}

// mese e tipo scritti nella causale (o nel beneficiario, dove a volte la banca li mette)
export function meseDallaCausale(testo) {
  const t = String(testo || "").toUpperCase();
  const tipo = /QUATTORDICESIMA|\b14\s*(?:MA|A|°|ª|\^)?\s*MENS|\b14MA\b|\bXIV\b/.test(t) ? "quattordicesima" : /TREDICESIMA|\b13\s*(?:MA|A|°|ª|\^)?\s*MENS|\b13MA\b|\bXIII\b/.test(t) ? "tredicesima" : null;
  const anno = (t.match(/\b(20\d{2})\b/) || [])[1];
  const m = MESI.findIndex(x => new RegExp("\\b" + x + "\\b").test(t));
  return { tipo, anno: anno ? Number(anno) : null, mese: m >= 0 ? m + 1 : null };
}

// pagamento: { beneficiario, causale, importo, data_esecuzione }
// buste: [{ id, dipendente_id, cognome_nome, anno, mese, tipo, netto_busta, gia_pagato }]
// → { persona, busta, certezza: "sicura" | "da controllare", motivo_proposto, spiegazione }
export function abbinaPagamento(pag, buste) {
  const testo = `${pag.causale || ""} ${pag.beneficiario || ""}`;
  const persone = new Map();
  for (const b of buste) {
    const s = somiglianzaNome(pag.beneficiario, b.cognome_nome);
    if (s > 0) persone.set(b.dipendente_id, Math.max(persone.get(b.dipendente_id) || 0, s));
  }
  const ordinate = [...persone.entries()].sort((a, b) => b[1] - a[1]);
  if (!ordinate.length || ordinate[0][1] < 1 || (ordinate[1] && ordinate[1][1] >= 1)) {
    return { persona: null, busta: null, certezza: "da controllare", spiegazione: ordinate.length && ordinate[0][1] >= 1 ? "Il nome del beneficiario somiglia a più persone: scegliere la busta." : "Il nome del beneficiario non corrisponde a nessuna persona delle buste caricate: scegliere la busta." };
  }
  const dip = ordinate[0][0];
  const sue = buste.filter(b => b.dipendente_id === dip).map(b => ({ ...b, resta: Math.round((Number(b.netto_busta) - Number(b.gia_pagato || 0)) * 100) / 100 }));
  const c = meseDallaCausale(testo);
  const data = new Date(pag.data_esecuzione + "T00:00:00Z");
  const mesiPrima = (b) => (data.getUTCFullYear() * 12 + data.getUTCMonth()) - (b.anno * 12 + b.mese - 1); // 1 = pagata il mese dopo
  let cand = sue.filter(b => b.resta > 0.005);
  if (c.tipo) cand = cand.filter(b => b.tipo === c.tipo && (!c.anno || b.anno === c.anno));
  else if (c.mese && c.anno) cand = cand.filter(b => b.anno === c.anno && b.mese === c.mese && b.tipo === "mensile");
  else cand = cand.filter(b => mesiPrima(b) >= 0 && mesiPrima(b) <= 2);
  const esatte = cand.filter(b => Math.abs(b.resta - pag.importo) <= 0.005);
  const scegli = (l) => l.sort((a, b) => (c.tipo || (c.mese && c.anno) ? 0 : Math.abs(mesiPrima(a) - 1) - Math.abs(mesiPrima(b) - 1)) || (a.anno * 12 + a.mese) - (b.anno * 12 + b.mese))[0];
  if (esatte.length) {
    const b = scegli(esatte);
    // più buste con lo stesso netto (es. 100,00 ogni mese): è sicura se una sola è del mese prima del bonifico (lo stipendio si paga il mese dopo)
    const unicaDelMesePrima = esatte.length > 1 && !c.tipo && !(c.mese && c.anno) && esatte.filter(x => mesiPrima(x) === 1).length === 1 && mesiPrima(b) === 1;
    return { persona: dip, busta: b.id, certezza: esatte.length === 1 || unicaDelMesePrima ? "sicura" : "da controllare", motivo_proposto: null,
      spiegazione: esatte.length === 1 ? "Stessa persona e importo uguale al netto da pagare." : "Più buste con lo stesso netto: controllare il mese." };
  }
  if (cand.length) {
    const b = scegli(cand);
    const motivo = pag.importo < b.resta ? (/DIFFERENZA|SALDO/i.test(testo) ? "più bonifici" : "acconto") : "altro";
    return { persona: dip, busta: b.id, certezza: "da controllare", motivo_proposto: motivo,
      spiegazione: `Importo ${pag.importo} diverso dal netto ancora da pagare (${b.resta}): scrivere il motivo.` };
  }
  return { persona: dip, busta: null, certezza: "da controllare", spiegazione: "Nessuna busta di questa persona aspetta ancora un pagamento in quel mese: scegliere la busta." };
}
