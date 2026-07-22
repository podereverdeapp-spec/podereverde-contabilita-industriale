// ─── MOTORE DI CLASSIFICAZIONE AUTOMATICA ─────────────────────────────────
// Dato un fornitore (per P.IVA o nome) e una descrizione riga fattura,
// determina la classificazione (Area/Centro di Costo/Destinazione/Tipo di
// Costo) applicando, in ordine:
//   1. Regola fissa (FCF) — se il fornitore ne ha una, si applica sempre
//   2. Regola per parola chiave (FCV) — cerca nella descrizione
//   3. Nessun match → MASCHERA (classificazione manuale richiesta)
//
// Regole speciali (non derogabili dal motore, indipendenti da FCV/FCF):
//   - Area "TRASPORTO ANIMALI" → sempre MASCHERA (mai automatico)
//   - Area "Ammortamenti" → tipo_costo forzato a "Ammortizzabile"
//   - Area "ACQUISTO ANIMALI" → non genera una riga di costo ordinaria,
//     va indirizzata a ci_report_acquisto_animali (gestito dal chiamante)

export function normalizza(testo) {
  return (testo || "").trim().toLowerCase();
}

// Trova il fornitore corrispondente per P.IVA (se fornita) o per nome
// (case-insensitive). Ritorna il record fornitore o null.
export function trovaFornitore(fornitori, { piva, nome }) {
  if (piva) {
    const f = fornitori.find(f => f.partita_iva && f.partita_iva === piva.trim());
    if (f) return f;
  }
  if (nome) {
    const nomeNorm = normalizza(nome);
    const f = fornitori.find(f => normalizza(f.nome) === nomeNorm);
    if (f) return f;
  }
  return null;
}

// Applica il motore di classificazione a una riga grezza.
// Ritorna: { stato, area, centro_costo, destinazione, tipo_costo, nota, fornitore }
export function classificaRiga(riga, { fornitori, regoleFisse, regoleVariabili }) {
  const fornitore = trovaFornitore(fornitori, { piva: riga.piva, nome: riga.fornitore });

  if (!fornitore) {
    return {
      stato: "MASCHERA",
      area: null, centro_costo: null, destinazione: null, tipo_costo: null,
      nota: "Fornitore non riconosciuto in anagrafica",
      fornitore: null,
    };
  }

  // 1. Regola fissa (FCF)
  const fissa = regoleFisse.find(r => r.fornitore_id === fornitore.id);
  if (fissa) {
    const risultato = applicaRegoleSpeciali({
      area: fissa.area, centro_costo: fissa.centro_costo,
      destinazione: fissa.destinazione, tipo_costo: fissa.tipo_costo,
    });
    return { stato: risultato.forzaMaschera ? "MASCHERA" : "FCF", ...risultato, fornitore,
      nota: risultato.forzaMaschera ? "Area Trasporto Animali: richiede sempre classificazione manuale" : "" };
  }

  // 2. Regola per parola chiave (FCV)
  const descrizioneNorm = normalizza(riga.descrizione);
  const variabile = regoleVariabili.find(r =>
    r.fornitore_id === fornitore.id && descrizioneNorm.includes(normalizza(r.parola_chiave))
  );
  if (variabile) {
    const risultato = applicaRegoleSpeciali({
      area: variabile.area, centro_costo: variabile.centro_costo,
      destinazione: variabile.destinazione, tipo_costo: variabile.tipo_costo,
    });
    return { stato: risultato.forzaMaschera ? "MASCHERA" : "FCV", ...risultato, fornitore,
      nota: risultato.forzaMaschera ? "Area Trasporto Animali: richiede sempre classificazione manuale" : "" };
  }

  // 3. Nessun match
  return {
    stato: "MASCHERA",
    area: null, centro_costo: null, destinazione: null, tipo_costo: null,
    nota: "Nessuna regola FCV/FCF corrisponde a questo fornitore/descrizione",
    fornitore,
  };
}

// Applica le regole speciali trasversali (Ammortamenti, Trasporto Animali)
// a una classificazione già determinata da FCV/FCF.
function applicaRegoleSpeciali({ area, centro_costo, destinazione, tipo_costo }) {
  if (area === "TRASPORTO ANIMALI") {
    // Non derogabile: anche se una regola FCV/FCF esisteva, il trasporto
    // animali richiede sempre l'intervento umano per la ripartizione.
    return { area, centro_costo, destinazione, tipo_costo, forzaMaschera: true };
  }
  if (area === "Ammortamenti") {
    return { area, centro_costo, destinazione, tipo_costo: "Ammortizzabile", forzaMaschera: false };
  }
  return { area, centro_costo, destinazione, tipo_costo, forzaMaschera: false };
}

// Un articolo è "Acquisto Animali" (non genera costo ordinario, va nel
// Report Acquisto Animali) se Area = ACQUISTO ANIMALI, oppure se è la
// porzione "ingresso allevamento" di un Trasporto Animali misto (gestito
// esplicitamente dall'operatore nella maschera, non dal motore automatico).
export function isAcquistoAnimali(area) {
  return area === "ACQUISTO ANIMALI";
}
