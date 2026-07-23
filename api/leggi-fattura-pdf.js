// Funzione server (Vercel) — legge un PDF di fattura tramite Claude e ne estrae
// i dati strutturati. Gira lato server per non esporre la chiave API nel browser.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo non consentito" });
  }
  const { pdfBase64, filename } = req.body || {};
  if (!pdfBase64) {
    return res.status(400).json({ error: "Nessun PDF ricevuto" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Chiave API Anthropic non configurata sul server (variabile ANTHROPIC_API_KEY mancante su Vercel)" });
  }

  const systemPrompt = `Sei un assistente che estrae dati strutturati da fatture italiane in formato PDF, per un'azienda agricola (Podere Verde - allevamento bovini/suini/ovini).

REGOLA FONDAMENTALE, da rispettare sempre: una fattura può contenere PIÙ articoli/righe con natura diversa (es. "mangime bovini" e "mangime suini" nella stessa fattura, ciascuno da classificare diversamente in contabilità industriale). Devi estrarre OGNI riga/articolo separatamente, MAI riassumere, raggruppare o sommare più righe in una sola. Se la fattura ha 5 articoli distinti, il risultato deve avere 5 elementi nell'array "righe". Ignora le righe che sono solo "IVA" o riepiloghi/totali: quelle non sono articoli.

Rispondi SOLO con un oggetto JSON valido, nessun testo prima o dopo, in questo formato esatto:
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

"unita_misura" — SOLO queste unità sono ammesse: "Unità", "Tons", "Quintali", "Kilogrammi", "Litri", "Balloni", "Rotoballe", "Rotoli". Cerca nel testo della fattura se una di queste è esplicitamente indicata (anche abbreviata: kg, q.li, lt). Se la fattura usa un'unità diversa (es. "Sacchi", "Pezzi", "Confezioni") o non la specifica, usa null — non approssimare né inventare una delle otto ammesse.

"verifica_totali": somma l'imponibile e l'IVA di tutte le righe che hai estratto, confrontali con l'imponibile totale, l'IVA totale e il totale fattura scritti per intero sul PDF originale (di solito nel riepilogo finale). "corrisponde" è true se la somma coincide con questi totali (tolleranza 1 centesimo), false altrimenti.

Se un campo non è presente o leggibile, usa null.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            { type: "text", text: `Estrai i dati da questa fattura (file: ${filename || "sconosciuto"}), riga per riga come da istruzioni.` },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Errore API Anthropic (${response.status}): ${errText.slice(0, 500)}` });
    }

    const data = await response.json();
    const testo = (data.content || []).find(c => c.type === "text")?.text || "";
    const pulito = testo.replace(/```json|```/g, "").trim();

    let estratto;
    try {
      estratto = JSON.parse(pulito);
    } catch (e) {
      return res.status(500).json({ error: `Risposta non interpretabile come JSON per "${filename}": ${pulito.slice(0, 300)}` });
    }

    return res.status(200).json({ estratto, filename });
  } catch (err) {
    return res.status(500).json({ error: `Errore imprevisto leggendo "${filename}": ${err.message}` });
  }
}
