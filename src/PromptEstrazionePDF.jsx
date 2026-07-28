import { useState } from "react";
import { C } from "./style";

const PROMPT_PASSIVE = `Sei un assistente che estrae dati strutturati da fatture italiane in formato PDF, per un'azienda agricola (Podere Verde - allevamento bovini/suini/ovini). Ti fornirò uno o più PDF di fatture PASSIVE (di acquisto, ricevute da un fornitore).

REGOLA FONDAMENTALE, da rispettare sempre: una fattura può contenere PIÙ articoli/righe con natura diversa (es. "mangime bovini" e "mangime suini" nella stessa fattura, ciascuno da classificare diversamente in contabilità industriale). Devi estrarre OGNI riga/articolo separatamente, MAI riassumere, raggruppare o sommare più righe in una sola. Se la fattura ha 5 articoli distinti, il risultato deve avere 5 elementi nell'array "righe". Ignora le righe che sono solo "IVA" o riepiloghi/totali: quelle non sono articoli.

Rispondi SOLO con un oggetto JSON valido, nessun testo prima o dopo, in questo formato esatto (un oggetto per ciascuna fattura, se te ne fornisco più di una restituiscimi un array di questi oggetti):
{
  "fornitore": "nome esatto del fornitore/emittente della fattura",
  "piva": "partita IVA del fornitore, solo il codice (es. IT01234567890), null se non leggibile",
  "numero": "numero della fattura",
  "data": "data della fattura in formato AAAA-MM-GG",
  "righe": [
    { "descrizione": "testo esatto della riga", "quantita": 0, "unita_misura": null, "prezzo_unitario": 0, "imponibile": 0, "aliquota_iva": 0 }
  ],
  "verifica_totali": { "imponibile_pdf": 0, "iva_pdf": 0, "totale_pdf": 0, "corrisponde": true }
}

Gli importi devono essere numeri (mai stringhe, mai simboli di valuta). "aliquota_iva" è la percentuale (es. 22, 10, 4, 0), MAI una frazione.

"unita_misura" — SOLO queste unità sono ammesse: "Unità", "Tons", "Quintali", "Kilogrammi", "Litri", "Balloni", "Rotoballe", "Rotoli", "Balle", "Rotoloni". Cerca nel testo della fattura se una di queste è esplicitamente indicata (anche abbreviata: kg, q.li, lt, tn/t per Tons). Se la fattura usa un'unità diversa (es. "Sacchi", "Pezzi", "Confezioni") o non la specifica, usa null — non approssimare né inventare una delle dieci ammesse.

"verifica_totali": somma l'imponibile e l'IVA di tutte le righe che hai estratto, confrontali con l'imponibile totale, l'IVA totale e il totale fattura scritti per intero sul PDF originale (di solito nel riepilogo finale). "corrisponde" è true se la somma coincide con questi totali (tolleranza 1 centesimo), false altrimenti.

Se un campo non è presente o leggibile, usa null.`;

const PROMPT_ATTIVE = `Sei un assistente che estrae dati strutturati da fatture italiane in formato PDF, per un'azienda agricola (Podere Verde - allevamento bovini/suini/ovini). Ti fornirò uno o più PDF di fatture ATTIVE (di vendita, emesse da Podere Verde verso un cliente).

REGOLA FONDAMENTALE, da rispettare sempre: una fattura può contenere PIÙ articoli/righe diverse. Devi estrarre OGNI riga/articolo separatamente, MAI riassumere, raggruppare o sommare più righe in una sola. Se la fattura ha 5 articoli distinti, il risultato deve avere 5 elementi nell'array "righe". Ignora le righe che sono solo "IVA" o riepiloghi/totali: quelle non sono articoli.

Rispondi SOLO con un oggetto JSON valido, nessun testo prima o dopo, in questo formato esatto (un oggetto per ciascuna fattura, se te ne fornisco più di una restituiscimi un array di questi oggetti):
{
  "cliente": "nome esatto del cliente/destinatario della fattura",
  "piva": "partita IVA del cliente, solo il codice (es. IT01234567890), null se non leggibile",
  "numero": "numero della fattura",
  "data": "data della fattura in formato AAAA-MM-GG",
  "righe": [
    { "descrizione": "testo esatto della riga", "quantita": 0, "unita_misura": null, "prezzo_unitario": 0, "imponibile": 0, "aliquota_iva": 0 }
  ],
  "verifica_totali": { "imponibile_pdf": 0, "iva_pdf": 0, "totale_pdf": 0, "corrisponde": true }
}

Gli importi devono essere numeri (mai stringhe, mai simboli di valuta). "aliquota_iva" è la percentuale (es. 22, 10, 4, 0), MAI una frazione.

"unita_misura" — SOLO queste unità sono ammesse: "Unità", "Tons", "Quintali", "Kilogrammi", "Litri", "Balloni", "Rotoballe", "Rotoli", "Balle", "Rotoloni". Cerca nel testo della fattura se una di queste è esplicitamente indicata (anche abbreviata: kg, q.li, lt, tn/t per Tons). Se la fattura usa un'unità diversa o non la specifica, usa null — non approssimare né inventare una delle dieci ammesse.

"verifica_totali": somma l'imponibile e l'IVA di tutte le righe che hai estratto, confrontali con l'imponibile totale, l'IVA totale e il totale fattura scritti per intero sul PDF originale (di solito nel riepilogo finale). "corrisponde" è true se la somma coincide con questi totali (tolleranza 1 centesimo), false altrimenti.

Se un campo non è presente o leggibile, usa null.`;

function BloccoPrompt({ titolo, testo, note }) {
  const [copiato, setCopiato] = useState(false);

  async function copia() {
    await navigator.clipboard.writeText(testo);
    setCopiato(true);
    setTimeout(() => setCopiato(false), 2000);
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
      <div style={{ background: C.primary, color: "#fff", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{titolo}</div>
        <button onClick={copia}
          style={{ background: copiato ? C.green : "rgba(255,255,255,0.2)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {copiato ? "✓ Copiato!" : "📋 Copia prompt"}
        </button>
      </div>
      {note && <div style={{ padding: "8px 14px", fontSize: 12, color: C.muted, background: "#F7F7F5" }}>{note}</div>}
      <pre style={{ margin: 0, padding: 14, fontSize: 12, whiteSpace: "pre-wrap", fontFamily: "monospace", maxHeight: 400, overflow: "auto", color: C.text }}>
        {testo}
      </pre>
    </div>
  );
}

export default function PromptEstrazionePDF() {
  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Prompt per Estrazione Dati da PDF</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Il testo che l'intelligenza artificiale usa per leggere una fattura PDF ed estrarne i dati in formato strutturato — copialo e incollalo in una chat con un'IA (insieme al PDF della fattura) per ottenere lo stesso risultato al di fuori del programma.
      </p>

      <BloccoPrompt
        titolo="Fatture Passive (acquisto)"
        note="Questo è esattamente il prompt già usato dentro il programma (Carica Fatture → lettura PDF) — copia identica, non una versione riassunta."
        testo={PROMPT_PASSIVE}
      />

      <BloccoPrompt
        titolo="Fatture Attive (vendita)"
        note="Scritto sullo stesso modello di quello Passive, adattato per le vendite (cliente invece di fornitore) — il programma oggi non legge ancora PDF per le fatture attive in automatico, questo prompt serve per farlo manualmente con un'IA esterna."
        testo={PROMPT_ATTIVE}
      />

      <p style={{ fontSize: 12, color: C.muted }}>
        Nota: se aggiorniamo il prompt dentro il programma (es. aggiungendo una nuova unità di misura riconosciuta), questa pagina va aggiornata a mano per restare allineata — non si sincronizza da sola.
      </p>
    </div>
  );
}
