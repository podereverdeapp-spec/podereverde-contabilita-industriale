// v331 — date secondo l'ora di Roma (ordine del Dott. Bizzarri del 30/10/2026, ore 17:05).
// toISOString() restituisce la data in ora UTC (Londra): tra mezzanotte e l'una (le due con l'ora legale)
// darebbe il giorno prima. Queste funzioni danno sempre la data di Roma, qualunque sia il fuso del computer.
// Stesse funzioni e stessi nomi dell'app (versione 145).
const FORMATO_ROMA = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });

// "AAAA-MM-GG" del giorno, in ora di Roma, dell'istante indicato (oggetto Date, stringa o numero)
export const dataRoma = (d) => FORMATO_ROMA.format(d instanceof Date ? d : new Date(d));

// "AAAA-MM-GG" di oggi a Roma
export const oggiRoma = () => dataRoma(new Date());
