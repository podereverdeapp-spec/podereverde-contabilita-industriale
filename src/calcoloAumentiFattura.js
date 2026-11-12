// Versione 374 — «Prezzo aumentato» accanto alle fatture da pagare (decisioni del Dott. Bizzarri del 12/11/2026, 20:59–21:04).
// Stessi numeri del «Controllo Prezzi di Acquisto» (calcoloVariazionePrezzi.js, analisiPrezzi): per ogni famiglia di prodotto
// e per ogni fattura, prezzo contro la fattura precedente dello stesso fornitore (se non c'è, la precedente di qualunque fornitore),
// «quanto vale in un anno» = aumento × quantità comprate negli ultimi 12 mesi, gravità con le stesse soglie.
// Per l'ultima fattura di ogni famiglia il risultato è identico a quello della pagina del controllo prezzi; qui si calcola
// anche per le fatture precedenti, perché una fattura da pagare può non essere più l'ultima. Sola lettura.
import { SOGLIE, it, data } from "./calcoloVariazionePrezzi";

export function aumentiPerFattura(analisi) {
  const out = new Map();
  const da24 = new Date(new Date(analisi.oggi) - 730 * 86400000).toISOString().slice(0, 10);
  for (const s of analisi.schede) {
    const F = s.famiglia, U = s.unita, valide = s.fatture;
    const quantitaAnno = F.unita === "importo" ? Math.max(1, s.n12) : s.base12;
    valide.forEach((x, i) => {
      if (i === 0 || x.data < da24) return;
      const prima = valide.slice(0, i);
      const stesso = prima.filter(y => y.fornitore === x.fornitore);
      const prec = stesso.length ? stesso[stesso.length - 1] : prima[prima.length - 1];
      if (!prec || !(prec.prezzoBase > 0)) return;
      let variazione = (x.prezzoBase / prec.prezzoBase - 1) * 100;
      let deltaBase = x.prezzoBase - prec.prezzoBase;
      if (Math.abs(variazione) < 0.05) { variazione = 0; deltaBase = 0; }
      if (!(deltaBase > 0)) return;
      const impatto = deltaBase * quantitaAnno;
      if (!(impatto > 0)) return;   // nessuna quantità comprata nell'ultimo anno: il controllo prezzi non la conta come rincaro
      const gravita = impatto >= SOGLIE.gravitaAltaEuro || (variazione >= SOGLIE.gravitaAltaPercento && s.spesa12 >= SOGLIE.gravitaAltaSpesa) ? "alta"
        : impatto >= SOGLIE.gravitaMediaEuro ? "media" : "bassa";
      const r = { famiglia: F.nome, unita: U.etichetta, decimali: U.decimali, prima: prec.prezzo, dataPrima: prec.data, numeroPrima: prec.numero,
        fornitorePrima: prec.fornitore, cambioFornitore: prec.fornitore !== x.fornitore, ora: x.prezzo, variazione, impatto, gravita };
      const f = out.get(x.fatturaId) || { righe: [], gravita: "bassa", impatto: 0 };
      f.righe.push(r); f.impatto += impatto;
      if (gravita === "alta" || (gravita === "media" && f.gravita === "bassa")) f.gravita = gravita;
      out.set(x.fatturaId, f);
    });
  }
  for (const f of out.values()) f.righe.sort((a, b) => b.impatto - a.impatto);
  return out;
}

// Testo del dettaglio (resta scritto con il «Visto»)
export const testoAumenti = f => f.righe.map(r => `${r.famiglia}: ${it(r.prima, r.decimali)} → ${it(r.ora, r.decimali)} ${r.unita} (+${it(r.variazione, 1)}%, prima ${data(r.dataPrima)}${r.cambioFornitore ? " da " + r.fornitorePrima : ""}), in un anno ${it(r.impatto, 0)} €`).join("; ");
export const NOME_GRAVITA = { alta: "gravità alta", media: "gravità media", bassa: "gravità bassa" };
