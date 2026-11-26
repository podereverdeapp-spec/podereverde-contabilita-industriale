// Versione 374 — «Prezzo aumentato» accanto alle fatture da pagare (decisioni del Dott. Bizzarri del 12/11/2026, 20:59–21:04).
// Stessi numeri del «Controllo Prezzi di Acquisto» (calcoloVariazionePrezzi.js, analisiPrezzi): per ogni famiglia di prodotto
// e per ogni fattura, prezzo contro la fattura precedente dello stesso fornitore (se non c'è, la precedente di qualunque fornitore),
// «quanto vale in un anno» con la stessa regola della pagina (versione 405: 12 mesi, anno precedente o una fattura), gravità con le stesse soglie.
// Qui si calcola per ogni fattura, perché una fattura da pagare può non essere più l'ultima. Sola lettura.
// Versione 407: la pagina del controllo prezzi confronta gli ultimi 12 mesi da oggi; qui i 12 mesi sono quelli prima della fattura,
// quindi i numeri delle due pagine possono essere diversi.
// Versione 407 (decisioni del Dott. Bizzarri del 26/11/2026 ore 12:53, 12:56, 13:01, 13:02): ogni fattura si confronta in due modi,
// con la media pesata sulle quantità dei 12 mesi prima della sua data e con la fattura precedente dello stesso fornitore
// (se non c'è, la precedente di qualunque fornitore). Gravità e «quanto vale in un anno» sul più grande dei due:
// la doppia conferma del pagamento scatta quando almeno uno dei due supera 200 € in un anno (gravità media o alta).
import { SOGLIE, it, data } from "./calcoloVariazionePrezzi";

export function aumentiPerFattura(analisi) {
  const out = new Map();
  const da24 = new Date(new Date(analisi.oggi) - 730 * 86400000).toISOString().slice(0, 10);
  for (const s of analisi.schede) {
    const F = s.famiglia, U = s.unita, valide = s.fatture;
    // Versione 405: stessa regola del Controllo Prezzi — almeno due fatture negli ultimi 12 mesi → quantità dei 12 mesi;
    // altrimenti almeno due nell'anno solare precedente → quantità di quell'anno; altrimenti una fattura (la sua quantità).
    // I prodotti che il Controllo Prezzi non considera più (ultima fattura prima del 1° gennaio dell'anno precedente) si saltano.
    if (!s.attivo) continue;
    const annoPrecF = valide.filter(y => String(y.data).slice(0, 4) === String(s.annoPrec));
    const quantitaAnno = x => s.n12 >= 2 ? (F.unita === "importo" ? s.n12 : s.base12)
      : annoPrecF.length >= 2 ? (F.unita === "importo" ? annoPrecF.length : annoPrecF.reduce((t, y) => t + y.base, 0))
      : (F.unita === "importo" ? 1 : x.base);
    valide.forEach((x, i) => {
      if (i === 0 || x.data < da24) return;   // (versione 407: la prima fattura non ha né precedente né media)
      const prima = valide.slice(0, i);
      const stesso = prima.filter(y => y.fornitore === x.fornitore);
      const prec = stesso.length ? stesso[stesso.length - 1] : prima[prima.length - 1];
      const q = quantitaAnno(x);
      // 1) contro la fattura precedente
      let variazione = null, impattoPrec = 0;
      if (prec && prec.prezzoBase > 0) {
        variazione = (x.prezzoBase / prec.prezzoBase - 1) * 100;
        const deltaBase = Math.abs(variazione) < 0.05 ? 0 : x.prezzoBase - prec.prezzoBase;
        if (Math.abs(variazione) < 0.05) variazione = 0;
        impattoPrec = deltaBase * q;
      }
      // 2) versione 407: contro la media pesata dei 12 mesi prima della fattura
      const da = new Date(new Date(x.data) - 365 * 86400000).toISOString().slice(0, 10);
      const anno = prima.filter(y => y.data >= da);   // fatture prima di questa (ordinate per data) negli ultimi 12 mesi
      const baseAnno = anno.reduce((t, y) => t + y.base, 0);
      const mediaBase = baseAnno > 0 ? anno.reduce((t, y) => t + y.totale, 0) / baseAnno : null;
      let variazioneMedia = null, impattoMedia = 0;
      if (mediaBase > 0) {
        variazioneMedia = (x.prezzoBase / mediaBase - 1) * 100;
        const deltaMedia = Math.abs(variazioneMedia) < 0.05 ? 0 : x.prezzoBase - mediaBase;
        if (Math.abs(variazioneMedia) < 0.05) variazioneMedia = 0;
        impattoMedia = deltaMedia * q;
      }
      const impatto = Math.max(impattoPrec, impattoMedia);
      if (!(impatto > 0)) return;   // nessun aumento in nessuno dei due confronti (o nessuna quantità nell'ultimo anno)
      const variazioneUsata = impattoMedia >= impattoPrec ? variazioneMedia : variazione;
      const gravita = impatto >= SOGLIE.gravitaAltaEuro || (variazioneUsata >= SOGLIE.gravitaAltaPercento && s.spesa12 >= SOGLIE.gravitaAltaSpesa) ? "alta"
        : impatto >= SOGLIE.gravitaMediaEuro ? "media" : "bassa";
      // versione 407 (decisione del Dott. Bizzarri del 26/11/2026 ore 13:56, scelta B): la doppia conferma al pagamento scatta solo se la fattura
      // costa più della precedente (da 200 € l'anno); l'aumento sulla media resta scritto nell'avviso ma non chiede la conferma
      const conferma = impattoPrec >= SOGLIE.gravitaAltaEuro || (impattoPrec > 0 && variazione >= SOGLIE.gravitaAltaPercento && s.spesa12 >= SOGLIE.gravitaAltaSpesa) ? "alta"
        : impattoPrec >= SOGLIE.gravitaMediaEuro ? "media" : "bassa";
      const r = { famiglia: F.nome, unita: U.etichetta, decimali: U.decimali, prima: prec ? prec.prezzo : null, dataPrima: prec ? prec.data : null, numeroPrima: prec ? prec.numero : null,
        fornitorePrima: prec ? prec.fornitore : null, cambioFornitore: !!prec && prec.fornitore !== x.fornitore, ora: x.prezzo, variazione, impatto, gravita, conferma,
        // versione 407
        media: mediaBase !== null ? mediaBase * U.fattore : null, variazioneMedia, impattoMedia, impattoPrec, fattureMedia: anno.length,
        altriFornitoriMedia: [...new Set(anno.map(y => y.fornitore))].filter(n => n !== x.fornitore) };   // versione 407: chi altro entra nella media
      const f = out.get(x.fatturaId) || { righe: [], gravita: "bassa", conferma: "bassa", impatto: 0 };
      f.righe.push(r); f.impatto += impatto;
      if (gravita === "alta" || (gravita === "media" && f.gravita === "bassa")) f.gravita = gravita;
      if (conferma === "alta" || (conferma === "media" && f.conferma === "bassa")) f.conferma = conferma;
      out.set(x.fatturaId, f);
    });
  }
  for (const f of out.values()) f.righe.sort((a, b) => b.impatto - a.impatto);
  return out;
}

// Testo del dettaglio (resta scritto con il «Visto»)
// versione 407: tutti e due i confronti
const segno = v => (v > 0 ? "+" : "") + it(v, 1) + "%";
export const testoAumenti = f => f.righe.map(r => `${r.famiglia}: ${it(r.ora, r.decimali)} ${r.unita}` +
  (r.media !== null ? ` contro la media dei 12 mesi prima di questa fattura ${it(r.media, r.decimali)} (${segno(r.variazioneMedia)})${r.altriFornitoriMedia.length ? `, media con anche ${r.altriFornitoriMedia.join(", ")}` : ""}` : "") +
  (r.prima !== null ? `${r.media !== null ? " e" : ""} contro la fattura precedente ${it(r.prima, r.decimali)} del ${data(r.dataPrima)}${r.cambioFornitore ? " di " + r.fornitorePrima : ""} (${segno(r.variazione)})` : "") +
  `, in un anno ${it(r.impatto, 0)} €`).join("; ");
export const NOME_GRAVITA = { alta: "gravità alta", media: "gravità media", bassa: "gravità bassa" };
