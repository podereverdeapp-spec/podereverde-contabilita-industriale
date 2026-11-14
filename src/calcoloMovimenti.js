// Versione 382 (Tenente Fatture, 13/11/2026): calcoli della pagina «Movimenti per conto e carta: consulta».
// Ordini del Dott. Bizzarri del 13/11: 19:12 (un modo di vedere i movimenti di cassa, banca e carte), 19:22 (disegno approvato),
// 19:42 (oltre agli scontrini si pagano altre cose: dietro ogni movimento c'è un documento di tipo diverso).
// Solo calcolo: nessuna lettura né scrittura nel database.

export const centesimi = n => Math.round(Number(n || 0) * 100);
const giorni = d => Date.parse(String(d).slice(0, 10) + "T00:00:00Z") / 864e5;

// Che cosa c'è dietro una riga della banca o della carta, quando non c'è una spesa né una fattura
export function tipoDaDescrizione(descrizione) {
  const d = String(descrizione || "").toUpperCase();
  if (/RIC\.?\s*PREP|RICARICA/.test(d)) return { tipo: "tra conti", testo: "Tra conti: ricarica della carta" };
  if (/PRELEV|PRELIEVO/.test(d)) return { tipo: "tra conti", testo: "Tra conti: prelievo di contanti" };
  if (/BOLLO|COMMISSION|CANONE|SPESE TENUTA|COMPETENZE/.test(d)) return { tipo: "banca", testo: "Spesa della banca: è sull'estratto" };
  if (/AMZN|AMAZON|PAYPAL|PAY\.AMAZON/.test(d)) return { tipo: "online", testo: "Acquisto online: manca il PDF dall'app" };
  return null;
}

// Documento deciso dalla causale del movimento di prima nota collegato alla riga
export function tipoDaMovimento(m) {
  if (!m) return null;
  const g = m.causale_gruppo, v = m.causale_voce || "";
  if (g === "Giroconti") return { tipo: "tra conti", testo: `Tra conti: ${v.toLowerCase()}` };
  if (g === "Banca") return { tipo: "banca", testo: `Spesa della banca: ${v.toLowerCase()}` };
  if (g === "Tributi") return { tipo: "tributi", testo: v === "Versamento F24" ? "F24 (vedi «Consulta F24»)" : v };
  if (g === "Personale") return { tipo: "personale", testo: v };
  return null;
}

// Parole che legano la descrizione della banca al nome del fornitore della fattura (insegna ≠ ragione sociale)
const INSEGNE = { GIULIUS: "DEMAS", "CS RICAMBI": "C.S. RICAMBI" };
function stessoFornitore(descrizione, nomeFornitore) {
  const d = String(descrizione || "").toUpperCase(), f = String(nomeFornitore || "").toUpperCase();
  if (!f) return false;
  for (const [insegna, nome] of Object.entries(INSEGNE)) if (d.includes(insegna) && f.includes(nome)) return true;
  const VUOTE = new Set(["SOCIETA", "SOCIETÀ", "AGRICOLA", "SEMPLICE", "COOPERATIVA", "AZIENDA", "IMPRESA", "DITTA", "GRUPPO", "ITALIA", "ROMA", "SERVIZI", "COMMERCIALE"]);
  const primaParola = f.replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).find(p => p.length >= 4 && !VUOTE.has(p));
  return !!primaParola && d.includes(primaParola);
}

// Fatture elettroniche proposte per una spesa: stesso importo al centesimo, data della fattura da 20 giorni prima a 5 dopo.
// In testa quelle dello stesso fornitore. È una PROPOSTA: la conferma chi controlla.
export function fatturePossibili(importo, data, descrizione, fatture, giaUsate = new Set()) {
  const c = centesimi(importo), g = giorni(data);
  return (fatture || [])
    .filter(f => !giaUsate.has(f.id) && centesimi(f.totale_lordo) === c && giorni(f.data) >= g - 20 && giorni(f.data) <= g + 5)
    .map(f => ({ ...f, stessoFornitore: stessoFornitore(descrizione, f.fornitore_nome), distanza: Math.abs(giorni(f.data) - g) }))
    .sort((a, b) => (b.stessoFornitore - a.stessoFornitore) || (a.distanza - b.distanza) || (a.id - b.id));
}

// Righe del periodo con il saldo progressivo e il documento.
// righe: [{ id, data, descrizione, verso, importo, spesa?, fatturaCollegata? }] nell'ordine in cui si mostrano
// saldoIniziale: numero o null (non calcolabile)
export function costruisciElenco({ righe, saldoIniziale, fatture }) {
  let saldo = saldoIniziale === null || saldoIniziale === undefined ? null : centesimi(saldoIniziale);
  let entrate = 0, uscite = 0;
  const usate = new Set();
  // prima le fatture già collegate (non si propongono due volte)
  for (const r of righe) if (r.fatturaCollegata) usate.add(r.fatturaCollegata.id);
  const scelte = new Map();
  const libere = () => righe.filter(r => !(r.spesa || r.fatturaCollegata || (r.movimento && tipoDaMovimento(r.movimento)) || r.verso !== "uscita" || scelte.has(r.id))
    && !((t => t && t.tipo !== "online")(tipoDaDescrizione(r.descrizione))));
  for (const passo of [1, 2]) {
    const cand = libere().map(r => ({ r, p: fatturePossibili(r.importo, r.data, r.descrizione, fatture, usate) }));
    for (const { r, p } of cand) {
      const pp = p.filter(x => !usate.has(x.id));
      // passo 1: stesso fornitore; passo 2: una sola fattura possibile e nessun'altra riga libera che la possa prendere
      const f = passo === 1 ? pp.find(x => x.stessoFornitore)
        : (pp.length === 1 && cand.filter(c => c.r !== r && !scelte.has(c.r.id) && c.p.some(x => x.id === pp[0].id)).length === 0 ? pp[0] : null);
      if (f) { usate.add(f.id); scelte.set(r.id, { f, altre: pp.length - 1 }); }
    }
  }
  const out = righe.map(r => {
    const imp = centesimi(r.importo);
    if (r.verso === "entrata") entrate += imp; else uscite += imp;
    if (saldo !== null) saldo += r.verso === "entrata" ? imp : -imp;
    let documento;
    if (r.spesa) documento = { tipo: "spesa", colore: "verde", testo: `${r.spesa.tipo_documento} n. ${r.spesa.numero} dall'app`, spesa: r.spesa };
    else if (r.fatturaCollegata) documento = { tipo: "fattura", colore: "verde", testo: `Fattura ${r.fatturaCollegata.fornitore_nome || ""} n. ${r.fatturaCollegata.numero}`, fattura: r.fatturaCollegata };
    else {
      const tm = tipoDaMovimento(r.movimento);
      const t = tm || tipoDaDescrizione(r.descrizione);
      if (t && t.tipo !== "online") documento = { tipo: t.tipo, colore: t.tipo === "tra conti" ? "blu" : "grigio", testo: t.testo };
      else if (r.verso === "uscita") {
        const sc = scelte.get(r.id);
        if (sc) documento = { tipo: "fattura proposta", colore: "verde", testo: `Fattura ${sc.f.fornitore_nome || ""} n. ${sc.f.numero} (proposta)`, fattura: sc.f, altre: sc.altre };
        else documento = { tipo: "manca", colore: "rosso", testo: t ? t.testo : "Manca: scontrino, ricevuta o fattura" };
      } else documento = { tipo: "entrata", colore: "grigio", testo: r.movimento?.causale_voce || "Entrata" };
    }
    return { ...r, saldo: saldo === null ? null : saldo / 100, documento };
  });
  return { righe: out, entrate: entrate / 100, uscite: uscite / 100, saldoFinale: saldo === null ? null : saldo / 100 };
}

// Periodo: mese «2026-04», trimestre «2026-T2», anno «2026»
export function intervallo(periodo) {
  const s = String(periodo || "");
  let a, m1, m2;
  if (/^\d{4}-\d{2}$/.test(s)) { a = +s.slice(0, 4); m1 = m2 = +s.slice(5); }
  else if (/^\d{4}-T[1-4]$/.test(s)) { a = +s.slice(0, 4); m1 = (+s.slice(6) - 1) * 3 + 1; m2 = m1 + 2; }
  else if (/^\d{4}$/.test(s)) { a = +s; m1 = 1; m2 = 12; }
  else return null;
  const dal = `${a}-${String(m1).padStart(2, "0")}-01`;
  const al = new Date(Date.UTC(a, m2, 0)).toISOString().slice(0, 10);
  const prima = new Date(Date.UTC(a, m1 - 1, 0)).toISOString().slice(0, 10);
  return { dal, al, prima };
}
