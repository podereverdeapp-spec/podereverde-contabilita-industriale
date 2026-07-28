import { useState } from "react";
import { C } from "./style";

const PROMPT_PASSIVE = `Ti do l'indirizzo di una cartella dove sono salvate delle fatture PASSIVE (di acquisto) in formato PDF: [INSERISCI QUI IL PERCORSO DELLA CARTELLA SUL TUO COMPUTER, es. C:\\Utenti\\Filippo\\Documenti\\Fatture2025]. Estrai i dati di TUTTE le fatture caricate e componi un file Excel con DUE tabelle:

## Tabella 1 — "Fatture" (una riga per ogni articolo/voce di fattura)

Colonne esatte, in questo ordine:
Fornitore | P.IVA | Numero | Data | Descrizione | Quantità | U.M. | Prezzo unitario | Imponibile | Aliquota IVA | Tipo documento

## Tabella 2 — "Verifica Fatture" (una riga per ogni fattura, non per articolo)

Colonne esatte, in questo ordine:
Fornitore | Numero | Data | Imponibile calcolato (somma righe) | Imponibile da PDF | IVA calcolata (somma righe) | IVA da PDF | Totale calcolato | Totale da PDF | Corrisponde?

Per ogni fattura: somma l'Imponibile e l'IVA di tutte le righe che le appartengono nella Tabella 1, confrontali con l'Imponibile totale, l'IVA totale e il Totale fattura scritti per intero sul PDF originale. Scrivi "SI" in "Corrisponde?" se coincidono (tolleranza 1 centesimo per arrotondamenti), altrimenti "NO".

REGOLE OBBLIGATORIE PER LA TABELLA 1:

1. **Una riga = un articolo/voce della fattura.** Se una fattura contiene più voci diverse (es. mangime bovini + mangime suini + trasporto), crea una riga per ciascuna, MAI riassumere o sommare voci diverse in una sola. Ignora le righe che sono solo riepiloghi IVA o totali finali: non sono articoli.

2. **Nessuna cella vuota** nelle colonne Fornitore, Numero, Data, Descrizione, Imponibile, Aliquota IVA, Tipo documento. Se un dato non è leggibile con certezza, scrivi "DA VERIFICARE" invece di lasciarla vuota.

3. **Imponibile: sempre il numero calcolato** (es. 1000.00), mai una formula. Se conosci Quantità e Prezzo unitario ma non l'Imponibile scritto in fattura, calcolalo tu (Quantità × Prezzo unitario) e scrivi il risultato numerico.

4. **Aliquota IVA**: percentuale come numero intero (es. 22, 10, 4, 0), MAI come frazione (mai 0.22).

5. **U.M. — SOLO queste unità di misura sono ammesse**: Unità, Tons, Quintali, Kilogrammi, Litri, Balloni, Rotoballe, Rotoli, Balle, Rotoloni. Cerca nel testo della fattura se una di queste è esplicitamente indicata (anche in forma abbreviata: kg, q.li, lt, tn/t per Tons, ecc.). Se la fattura usa un'unità diversa (es. "Sacchi", "Pezzi", "Confezioni", "Scatole") o non specifica nessuna unità, **lascia la cella U.M. VUOTA** — non approssimare né inventare una delle dieci unità ammesse se non è quella scritta davvero in fattura.

6. **Tipo documento**: "Fattura" per un documento normale, "Nota di credito" se il documento è esplicitamente una nota di credito, un reso, uno storno o una rettifica (cerca diciture come "NOTA DI CREDITO", "RESO", "STORNO", "RETTIFICA FATTURA N...").

7. **Attenzione alle note di credito**: una nota di credito NON è una vendita da parte di Podere Verde, anche se riduce l'importo — resta un documento del fornitore che corregge un acquisto già fatto. Se è una nota di credito:
   - Quantità e Imponibile vanno scritti NEGATIVI (es. -5, -125.00)
   - Tipo documento = "Nota di credito"
   - NON scambiarla per una fattura di vendita solo perché l'importo è negativo

8. Se una fattura è invece **chiaramente una vendita** da parte di Podere Verde verso un cliente (Podere Verde emette la fattura, non la riceve), NON includerla in queste tabelle — segnalamela a parte, perché va gestita diversamente.

9. **Cassa Previdenziale/professionale** (INARCASSA, ENPAIA, cassa forense, ecc.): molti liberi professionisti aggiungono in fattura un addebito per la propria cassa di previdenza — di solito una percentuale fissa (es. 4%) sull'imponibile dei servizi. Questo addebito TIPICAMENTE NON compare come riga separata nella tabella prodotti/servizi, ma solo nel riepilogo finale della fattura (es. voce "Cassa (NOME)" o "Cassa previdenziale" vicino ai totali). Cercalo SEMPRE, anche se non è un articolo esplicito: se lo trovi, aggiungilo come UNA RIGA IN PIÙ nella Tabella 1 (oltre a quelle dei servizi veri), con Descrizione che inizia ESATTAMENTE con "[CASSA PROFESSIONALE] " seguito dal nome della cassa se indicato (es. "[CASSA PROFESSIONALE] INARCASSA"), Quantità 1, U.M. vuota, Imponibile pari all'importo della cassa, Aliquota IVA quella indicata per quella voce nel riepilogo (spesso 0). Questo per ogni fornitore che la applica, non solo per alcuni specifici — molti consulenti diversi possono averla.

Al termine, dammi entrambe le tabelle pronte da incollare in Excel (o generami direttamente il file .xlsx con i due fogli), e un riepilogo di:
- quante righe hai segnato "DA VERIFICARE"
- quante fatture sono "Nota di credito"
- quante fatture in "Verifica Fatture" hanno "Corrisponde?" = "NO" — controllale per prime, sono probabile segno di una riga persa o letta male

Infine, per ciascun PDF elaborato: rinomina il file sostituendo il nome esistente con uno nuovo composto da Nome del fornitore, Data della fattura e Numero della fattura (es. "COOPERATIVA CERI_2025-06-15_10-FE.pdf"), sostituendo con un trattino "-" ogni carattere non ammesso nei nomi file (come / \\ : * ? " < > |). (Questa parte richiede uno strumento IA che possa leggere e scrivere file direttamente sul tuo computer, es. Claude Desktop/Code — se invece usi una chat web dove carichi i PDF singolarmente, questa rinomina non è possibile e puoi ignorarla.)`;

const PROMPT_ATTIVE = `Ti do l'indirizzo di una cartella dove sono salvate delle fatture ATTIVE (di vendita, emesse da Podere Verde verso un cliente) in formato PDF: [INSERISCI QUI IL PERCORSO DELLA CARTELLA SUL TUO COMPUTER, es. C:\\Utenti\\Filippo\\Documenti\\FattureAttive2025]. Estrai i dati di TUTTE le fatture caricate e componi un file Excel con DUE tabelle:

## Tabella 1 — "Fatture" (una riga per ogni articolo/voce di fattura)

Colonne esatte, in questo ordine:
Cliente | P.IVA | Numero | Data | Descrizione | Quantità | U.M. | Prezzo unitario | Imponibile | Aliquota IVA | Tipo documento

## Tabella 2 — "Verifica Fatture" (una riga per ogni fattura, non per articolo)

Colonne esatte, in questo ordine:
Cliente | Numero | Data | Imponibile calcolato (somma righe) | Imponibile da PDF | IVA calcolata (somma righe) | IVA da PDF | Totale calcolato | Totale da PDF | Corrisponde?

Per ogni fattura: somma l'Imponibile e l'IVA di tutte le righe che le appartengono nella Tabella 1, confrontali con l'Imponibile totale, l'IVA totale e il Totale fattura scritti per intero sul PDF originale. Scrivi "SI" in "Corrisponde?" se coincidono (tolleranza 1 centesimo per arrotondamenti), altrimenti "NO".

REGOLE OBBLIGATORIE PER LA TABELLA 1:

1. **Una riga = un articolo/voce della fattura.** Se una fattura contiene più voci diverse, crea una riga per ciascuna, MAI riassumere o sommare voci diverse in una sola. Ignora le righe che sono solo riepiloghi IVA o totali finali: non sono articoli.

2. **Nessuna cella vuota** nelle colonne Cliente, Numero, Data, Descrizione, Imponibile, Aliquota IVA, Tipo documento. Se un dato non è leggibile con certezza, scrivi "DA VERIFICARE" invece di lasciarla vuota.

3. **Imponibile: sempre il numero calcolato** (es. 1000.00), mai una formula. Se conosci Quantità e Prezzo unitario ma non l'Imponibile scritto in fattura, calcolalo tu (Quantità × Prezzo unitario) e scrivi il risultato numerico.

4. **Aliquota IVA**: percentuale come numero intero (es. 22, 10, 4, 0), MAI come frazione (mai 0.22).

5. **U.M. — SOLO queste unità di misura sono ammesse**: Unità, Tons, Quintali, Kilogrammi, Litri, Balloni, Rotoballe, Rotoli, Balle, Rotoloni. Cerca nel testo della fattura se una di queste è esplicitamente indicata (anche in forma abbreviata: kg, q.li, lt, tn/t per Tons, ecc.). Se la fattura usa un'unità diversa o non specifica nessuna unità, **lascia la cella U.M. VUOTA** — non approssimare né inventare una delle dieci unità ammesse se non è quella scritta davvero in fattura.

6. **Tipo documento**: "Fattura" per un documento normale, "Nota di credito" se il documento è esplicitamente una nota di credito, un reso, uno storno o una rettifica (cerca diciture come "NOTA DI CREDITO", "RESO", "STORNO", "RETTIFICA FATTURA N...").

7. **Attenzione alle note di credito**: una nota di credito riduce una vendita già fatta, non è un nuovo acquisto da parte di Podere Verde. Se è una nota di credito:
   - Quantità e Imponibile vanno scritti NEGATIVI (es. -5, -125.00)
   - Tipo documento = "Nota di credito"

8. Se una fattura è invece **chiaramente un acquisto** ricevuto da Podere Verde da un fornitore (Podere Verde riceve la fattura, non la emette), NON includerla in queste tabelle — segnalamela a parte, perché va gestita diversamente (fatture Passive).

9. **Cassa Previdenziale/professionale**: se il cliente/emittente applica un addebito per la propria cassa di previdenza professionale nel riepilogo finale (non come riga prodotto/servizio separata), aggiungilo come UNA RIGA IN PIÙ nella Tabella 1, con Descrizione che inizia ESATTAMENTE con "[CASSA PROFESSIONALE] " seguito dal nome della cassa se indicato, Quantità 1, U.M. vuota, Imponibile pari all'importo della cassa, Aliquota IVA quella indicata per quella voce (spesso 0).

Al termine, dammi entrambe le tabelle pronte da incollare in Excel (o generami direttamente il file .xlsx con i due fogli), e un riepilogo di:
- quante righe hai segnato "DA VERIFICARE"
- quante fatture sono "Nota di credito"
- quante fatture in "Verifica Fatture" hanno "Corrisponde?" = "NO" — controllale per prime, sono probabile segno di una riga persa o letta male

Infine, per ciascun PDF elaborato: rinomina il file sostituendo il nome esistente con uno nuovo composto da Nome del cliente, Data della fattura e Numero della fattura (es. "MARIO_ROSSI_2025-06-15_10.pdf"), sostituendo con un trattino "-" ogni carattere non ammesso nei nomi file (come / \\ : * ? " < > |). (Questa parte richiede uno strumento IA che possa leggere e scrivere file direttamente sul tuo computer — se invece usi una chat web dove carichi i PDF singolarmente, questa rinomina non è possibile e puoi ignorarla.)`;

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
        note="Pensato per uso esterno (chat IA fuori dal programma): produce direttamente un file Excel a due tabelle, con verifica dei totali e gestione delle note di credito. Diverso dal prompt interno del programma (in formato JSON, usato da Carica Fatture per l'elaborazione automatica) — stessa logica di fondo, output pensato per un uso manuale."
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
