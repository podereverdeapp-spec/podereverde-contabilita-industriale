// Versione 337 (ordine del Dott. Bizzarri del 31/10/2026): le parti del programma che si possono dare a ciascuno
// nella cartella «Accessi». L'id è quello della cartella (o sottocartella) del menu.
// «Tutto il programma» comprende tutto TRANNE i costi del lavoro (buste paga), che vanno sempre spuntati a parte.
export const PARTE_LAVORO = "sub-dati-lavoro";
// Versione 338: la sottocartella «Accessi» (solo amministratore e gestori degli accessi; non si dà con le spunte)
export const PARTE_ACCESSI = "sub-accessi";

export const PARTI = [
  { id: "dashboard", label: "Dashboard" },
  { id: "cart-report-analisi", label: "Report di Analisi" },
  { id: "cart-prezzi-acquisto", label: "Controllo Prezzi di Acquisto" },
  { id: "sub-dati-fatture-passive", label: "Carica Dati Contabilità → 1. Carica Fatture Passive" },
  { id: "sub-dati-costi-diretti", label: "Carica Dati Contabilità → 2. Carica Costi Diretti" },
  { id: PARTE_LAVORO, label: "Carica Dati Contabilità → 3. Carica Costi del Lavoro (buste paga)" },
  { id: "sub-dati-f24", label: "Carica Dati Contabilità → 4. Carica F24" },
  { id: "sub-dati-sistema", label: "Carica Dati Contabilità → 5. Sistema i dati caricati" },
  { id: "sub-dati-verifica", label: "Carica Dati Contabilità → 6. Verifica che non manchi niente" },
  { id: "sub-dati-controllo", label: "Carica Dati Contabilità → 7. Controllo finale" },
  { id: "cart-emissione-fatture", label: "Emissione Fatture di Vendita" },
  { id: "cart-ricerca", label: "Ricerca: Fatture e Anagrafiche" },
  { id: "cart-costi", label: "Analisi Costi" },
  { id: "cart-alimentaria", label: "Alimentaria" },
  { id: "cart-animali", label: "Animali" },
  { id: "cart-modelli4", label: "Modelli 4" },
  { id: "cart-studi", label: "Studi" },
  { id: "cart-coltivazioni", label: "Coltivazioni" },
  // Versione 338: il Registro delle modifiche è una sottocartella di «Accessi e Registro Modifiche»
  { id: "sub-registro-modifiche", label: "Accessi e Registro Modifiche → Registro delle modifiche" },
  { id: "glossario", label: "Glossario" },
  { id: "parametri", label: "Parametri" },
];

export const ID_PARTI = new Set(PARTI.map(p => p.id));
export const ETICHETTA_PARTE = Object.fromEntries(PARTI.map(p => [p.id, p.label]));

// Può vedere questa parte del menu? (accesso = risultato di useAccesso)
export function puoVedereParte(accesso, id) {
  if (!accesso || accesso.stato !== "attivo") return false;
  if (accesso.admin) return true;
  if (id === PARTE_ACCESSI) return !!accesso.gestore;
  if (id === PARTE_LAVORO) return !!accesso.lavoro;
  if (accesso.tutto) return true;
  return (accesso.parti || []).includes(id);
}

// Il menu con solo le parti che questa persona può vedere
export function filtraMenu(menu, accesso) {
  const out = [];
  for (const m of menu) {
    if (m.tipo === "voce") { if (puoVedereParte(accesso, m.id)) out.push(m); continue; }
    if (ID_PARTI.has(m.id)) { if (puoVedereParte(accesso, m.id)) out.push(m); continue; }
    // Cartella divisa in parti (Carica Dati Contabilità; Accessi e Registro Modifiche): restano le sottocartelle permesse;
    // le istruzioni in cima restano se c'è almeno una sottocartella
    const controllata = c => c.tipo === "sottocartella" && (ID_PARTI.has(c.id) || c.id === PARTE_ACCESSI);
    const contenuto = m.contenuto.filter(c => !controllata(c) || puoVedereParte(accesso, c.id));
    if (contenuto.some(controllata)) out.push({ ...m, contenuto });
  }
  return out;
}

// Tutti gli id delle pagine (voci) dentro un menu
export function pagineDelMenu(menu) {
  const ids = new Set();
  const visita = (lista) => {
    for (const x of lista) {
      if (x.tipo === "cartella") visita(x.contenuto);
      else if (x.tipo === "sottocartella") visita(x.voci);
      else ids.add(x.id);
    }
  };
  visita(menu);
  return ids;
}
