// Versione 372 (12/11/2026, ordini del Dott. Bizzarri delle 18:55–19:00): elenco UNICO delle autorizzazioni speciali.
// Ogni autorizzazione è una colonna «puo_…» di ci_accessi_programma: il database la protegge da solo (trigger
// ci_accessi_programma_protezione: la danno o la tolgono solo l'amministratore e i gestori degli accessi, nessuno la propria).
// Una versione futura che ne aggiunge una: (1) SQL con la colonna «puo_…» (boolean not null default false) e la sua funzione
// ci_puo_…(); (2) una riga qui sotto. La pagina «Accessi» mostra da sola la casella, la spiegazione e il riepilogo.
// REGOLA per le colonne nuove: sempre «boolean not null default false» (spenta per tutti finché un gestore non la dà).
// Se il database ha una colonna «puo_…» che qui non c'è ancora, la pagina la mostra lo stesso con il nome della colonna.
export const AUTORIZZAZIONI = [
  {
    colonna: "puo_spedire_mail",
    nome: "Può spedire mail dal programma",
    icona: "✉️",
    spiega: "Manda mail dalla casella podereverdeapp@gmail.com (Posta, schede di clienti e fornitori, compensazioni); toglie comunicazioni dal registro e blocca i mittenti.",
    versione: 346,
  },
  {
    colonna: "puo_gestire_conti",
    nome: "Gestisce i conti",
    icona: "🏦",
    spiega: "Registra pagamenti e incassi, conferma e corregge i movimenti della banca, gestisce conti, carte ed estratti conto, controlla e chiude gli anticipi.",
    versione: 357,
  },
  {
    colonna: "puo_forzare_pagamento_senza_mail",
    nome: "Può forzare il pagamento senza mail",
    icona: "⚠️",
    spiega: "Per le fatture in attesa di nota di credito: registra il pagamento senza mandare la mail al fornitore, scrivendo il motivo. Servirà con la versione delle fatture contestate.",
    versione: 372,
  },
];

// L'elenco da mostrare: quelle descritte qui che il database conosce, più quelle del database non ancora descritte
export function elencoAutorizzazioni(colonneDatabase) {
  const note = AUTORIZZAZIONI.filter(x => colonneDatabase.includes(x.colonna));
  const sconosciute = colonneDatabase.filter(c => !AUTORIZZAZIONI.some(x => x.colonna === c)).sort()
    .map(c => ({ colonna: c, nome: c, icona: "🔑", spiega: "Autorizzazione presente nel database ma non ancora descritta nel programma (va aggiunta in autorizzazioni.js)." }));
  return [...note, ...sconosciute];
}

// Riepilogo «chi può fare che cosa»: per ogni autorizzazione, chi ce l'ha e vale (Attivo) e chi ce l'ha ma non vale
export function riepilogoAutorizzazioni(righe, mappa, elenco = AUTORIZZAZIONI) {
  return elenco.map(x => {
    const valgono = [], nonValgono = [];
    for (const r of righe) {
      if (r.ruolo === "admin") continue;
      if (!mappa?.[r.profilo_id]?.[x.colonna]) continue;
      (r.stato === "Attivo" ? valgono : nonValgono).push(r.nome || r.email);
    }
    return { ...x, valgono, nonValgono };
  });
}
