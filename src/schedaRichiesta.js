// Versione 377: un'altra pagina chiede di aprire «Documenti arrivati» su una scheda precisa (per esempio «Fatture di vendita»).
// La richiesta vale solo per l'apertura che segue subito (10 secondi), poi si perde.
let richiesta = null;
export function chiediScheda(s) { richiesta = { s, quando: Date.now() }; }
export function prendiSchedaRichiesta() { const r = richiesta; richiesta = null; return r && Date.now() - r.quando < 10000 ? r.s : null; }
