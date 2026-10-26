import { useState } from "react";
import { C } from "./style";

// Versione 293 (decisione del Dott. Bizzarri del 24/10/2026 ore 15:26): il carico diretto da Aruba con Claude.
// Versione 300: le fatture di vendita escono da questo prompt (vedi PromptFattureEmesseAruba.jsx).
// Claude entra in Aruba Fatturazione Elettronica nel browser della sua app (le credenziali le scrive chi lavora),
// confronta le fatture ricevute ed emesse con quelle del programma, prepara l'Excel delle sole mancanti e ne scarica
// i PDF. Il carico nel programma resta a chi lavora. Il testo va aggiornato a mano se cambia la procedura.

const PROMPT_ARUBA = `Lavoriamo sulle fatture di Società Agricola Podere Verde a r.l. (partita IVA IT15117871002) direttamente da Aruba Fatturazione Elettronica. Anno da controllare: [INSERISCI L'ANNO, es. 2026]. Cartella dell'anno sul computer: [INSERISCI IL PERCORSO, es. C:\\Users\\Filippo\\Desktop\\00.FATTURE PODERE RICLASSIFICATE ANNI19-24\\FATTURE 2026].

Ti servono: il browser integrato dell'app di Claude sul computer, il permesso di leggere e scrivere nella cartella dell'anno e il collegamento Supabase al database del programma (progetto pyjymnpnxatqwfhguaus). Se ti manca uno di questi, fermati subito e dimmelo.

## Regole fisse (valgono per tutto il lavoro)

1. Le credenziali di Aruba NON le scrivi mai tu: le scrivo io nel browser. Tu apri la pagina e aspetti.
2. Apri SEMPRE direttamente https://fatturazioneelettronica.aruba.it/ (pagina «Accedi a Fatturazione elettronica»). NON passare dall'elenco dei servizi di Aruba: il suo link «Fatturazione elettronica» porta all'Area clienti delle PEC, dove le credenziali della fatturazione non valgono.
3. In Aruba solo LETTURA. Non inviare, firmare, caricare, eliminare, segnare come pagate fatture; non salvare impostazioni o personalizzazioni; non chiudere avvisi. L'invio di fatture allo SdI lo faccio io (serve il codice SMS).
4. Prima di scaricare qualunque file chiedimi il permesso, dicendo nome dei file, provenienza e dimensione.
5. Il database del programma solo in LETTURA (select). Non scrivere mai nel database: i carichi li faccio io dal programma; le correzioni le prepari come file SQL che lancio io, con il testo completo anche in chat.
6. Una domanda alla volta. Prima di dirmi un numero, verificalo.
7. Prima di segnalarmi una differenza, leggi il registro delle mie decisioni nella memoria del progetto (decisioni-contabilita-animali): ciò che è già deciso non va riproposto. Ricordami invece le questioni che lì ho chiesto di ricordare.

## 1. Entrata in Aruba
Apri https://fatturazioneelettronica.aruba.it/ nel browser e dimmi che la pagina è pronta. Aspetta il mio «fatto».

## 2. Elenco delle fatture ricevute in Aruba
Leggi tutte le fatture ricevute dell'anno (anno fiscale scelto, e anche l'anno precedente per le fatture con data dell'anno arrivate in ritardo). Di ognuna prendi: numero, data, tipo documento (TD01 fattura, TD04 nota di credito, TD06 parcella, TD24 fattura differita…), fornitore, partita IVA del fornitore, imponibile, IVA, totale.

## 3. Elenco delle fatture nel programma
Dal database leggi la vista ci_v_ricerca_documenti (chiave, tipo, numero, data, partita_iva, controparte, totale_netto, totale_lordo, acquisto_animali) per lo stesso periodo. Contiene le fatture e gli acquisti di animali registrati solo nel Report Acquisto Animali.

## 4. Confronto
Una fattura di Aruba è nel programma se coincidono il numero e il fornitore:
- numero ridotto a sole lettere e cifre, minuscole, senza zeri iniziali («000140/QC9» = «140-QC9»); un documento del programma con più numeri («3 e 5») vale per ciascun numero;
- fornitore per partita IVA (senza «IT»); se nel programma la partita IVA manca, per le prime lettere del nome.
Poi confronta data e importo: imponibile di Aruba con totale_netto del programma; per le parcelle e i documenti con imponibile 0 in elenco, il totale con totale_lordo; per le note di credito i valori assoluti; tolleranza 5 centesimi.
Dammi, in quest'ordine:
a) le fatture di Aruba che nel programma mancano (fornitore, numero, data, imponibile, totale);
b) le differenze di numero scritto, data o importo, escluse quelle già decise;
c) i documenti del programma che in Aruba non ci sono (sono normali le assicurazioni e i documenti «da ricevere»/«da emettere»).

## 5. Righe delle fatture mancanti e file Excel
Per ogni fattura mancante leggi le righe dal file XML di Aruba (DettaglioLinee: descrizione, quantità, unità di misura, prezzo unitario, prezzo totale, aliquota IVA) e il riepilogo (DatiRiepilogo). La cassa previdenziale (DatiCassaPrevidenziale) diventa una riga in più con descrizione «[CASSA PROFESSIONALE] » seguita dal nome della cassa. Le righe a 0 € che sono solo annotazioni (es. «Importo già incassato») non si scrivono.
Crea nella cartella dell'anno il file «Fatture_AAAA_carico_AAAA-MM-GG.xlsx» con i fogli:
- «Fatture»: Fornitore | P.IVA | Numero | Data | Descrizione | Quantità | U.M. | Prezzo unitario | Imponibile | Aliquota IVA | Tipo documento
- «Verifica Fatture»: Fornitore | Numero | Data | Imponibile calcolato (somma righe) | Imponibile da PDF | IVA calcolata (somma righe) | IVA da PDF | Totale calcolato | Totale da PDF | Corrisponde?
Regole: numero e data copiati esattamente come in Aruba; data come vera data di Excel; partita IVA del fornitore (cedente), mai quella di Podere Verde; Imponibile come numero; Aliquota IVA come numero intero (22, 10, 4, 0); U.M. solo tra Unità, Tons, Quintali, Kilogrammi, Litri, Balloni, Rotoballe, Rotoli, Balle, Rotoloni (KGM = Kilogrammi, TNE = Tons), altrimenti vuota; note di credito (TD04) con quantità e imponibile negativi e Tipo documento «Nota di credito»; per le altre «Fattura». In «Verifica Fatture» l'IVA calcolata è la somma dell'IVA di ogni riga arrotondata al centesimo, come fa il programma; «Corrisponde?» = SI se coincide con Aruba entro 1 centesimo, altrimenti NO e me lo segnali.

## 6. Classificazione proposta
Per ogni riga guarda come la classificherà il programma: regole del fornitore (ci_regole_fornitore_fissa, ci_regole_fornitore_variabile; la regola per parola chiave del fornitore vale prima della regola fissa) e storico delle righe uguali in ci_articoli_fattura. Dammi una tabella con le righe già classificate (da confermare) e quelle da scegliere, con la tua proposta (Area, Centro di Costo, Destinazione, Tipo di Costo), la regola da salvare e i fornitori nuovi. Decido io.

## 7. PDF delle fatture mancanti
Chiedimi il permesso, poi scarica da Aruba il PDF di ogni fattura mancante e salvalo nella cartella dell'anno con il nome «FORNITORE_AAAA-MM-GG_numero.pdf» (ogni carattere non ammesso nei nomi dei file diventa «-»). Controlla che ogni PDF contenga il numero della sua fattura.

## 8. Fatture di vendita
Le fatture di vendita (emesse) NON si trattano con questo prompt: dalla versione 300 si leggono con il prompt «Prompt per Claude: Fatture Emesse in Aruba» della cartella Emissione Fatture di Vendita → Controllo Fatturazione Attiva e Numero Progressivo. Qui lavora solo sulle fatture d'acquisto.

## 9. Dove caricare
Dimmi i percorsi dei file e l'ordine:
1) Carica Dati Contabilità → 1. Carica Fatture Passive → Carica Fatture Passive massivamente: l'Excel delle fatture d'acquisto;
2) Carica Dati Contabilità → 1. Carica Fatture Passive → Carica PDF delle Fatture: la cartella dell'anno (sempre dopo il punto 1).

## 10. Controllo dopo il carico
Quando ti scrivo «fatto», controlla nel database che le fatture ci siano con gli importi di Aruba, che le righe abbiano la classificazione concordata e che i PDF siano collegati (ci_pdf_fatture). Riportami solo le anomalie, una alla volta. Ricordami di aggiornare i costi (Report Costi degli anni toccati, poi Report Riproduttori). Alla fine, su mio ordine, esci da Aruba con «Logout».

## Nota tecnica per leggere Aruba (solo lettura)
Dalla pagina di Aruba già aperta, con le intestazioni di sessione che la pagina stessa usa (Content-Type, aru-sub, aru-delegator, X-Requested-With: si leggono intercettando XMLHttpRequest.setRequestHeader mentre la pagina carica l'elenco delle fatture ricevute), si possono chiamare con POST questi servizi di sola lettura:
- /services/FatturaRicevutaFrontEnd/advancedSearch con {"PageNumber":1,"PageSize":null,"AnnoFiscale":AAAA}: elenco delle ricevute (Numero, Data, Tipo, Mittente, CodicePrimario = partita IVA, TotaleImponibile, TotaleIva, TotaleDocumento, Id, Posizione);
- /services/FatturaRicevutaFrontEnd/ExtractXmlInvoiceReceived oppure LoadReceivedToPreview con {"Id":…,"Posizione":…,"AnnoFiscale":AAAA}: righe della fattura;
- /services/FatturaRicevutaFrontEnd/ExtractPdfInvoiceReceived con lo stesso corpo: PDF in base64 (campo Content);
- /services/FatturaFrontEnd/advancedSearch e /services/FatturaFrontEnd/ExtractXmlInvoiceSend: le fatture emesse.
Nessun altro servizio. Se uno di questi non risponde, usa i pulsanti della pagina («Fatture ricevute», «Seleziona tutti», «Azioni» → «Scarica Report Excel» / «Scarica PDF»), sempre dopo il mio permesso.`;

export default function PromptCaricoAruba() {
  const [copiato, setCopiato] = useState(false);
  async function copia() {
    await navigator.clipboard.writeText(PROMPT_ARUBA);
    setCopiato(true);
    setTimeout(() => setCopiato(false), 2000);
  }
  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Prompt per carico da Aruba</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Il testo da dare a Claude per caricare le fatture direttamente da Aruba Fatturazione Elettronica: Claude entra in Aruba
        nel browser della sua app, confronta le fatture con quelle del programma, prepara l'Excel delle sole fatture mancanti e
        ne scarica i PDF. Si copia, si incolla in una chat nuova dell'app di Claude sul computer e si completano anno e cartella
        tra parentesi quadre. Le credenziali di Aruba le scrive sempre chi lavora, mai Claude.
      </p>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ background: C.primary, color: "#fff", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Carico diretto da Aruba (fatture di acquisto)</div>
          <button onClick={copia}
            style={{ background: copiato ? C.green : "rgba(255,255,255,0.2)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {copiato ? "✓ Copiato!" : "📋 Copia prompt"}
          </button>
        </div>
        <div style={{ padding: "8px 14px", fontSize: 12, color: C.muted, background: "#F7F7F5" }}>
          Serve l'app di Claude sul computer, con il browser integrato, il permesso sulla cartella dell'anno e il collegamento al
          database. Claude lavora in sola lettura: in Aruba non invia, non firma e non cancella nulla, e nel database non scrive.
          I carichi si fanno dal programma, come spiegato nelle Istruzioni Carica Fatture Passive (parte «A bis»).
        </div>
        <pre style={{ margin: 0, padding: 14, fontSize: 12, whiteSpace: "pre-wrap", fontFamily: "monospace", maxHeight: 500, overflow: "auto", color: C.text }}>
          {PROMPT_ARUBA}
        </pre>
      </div>
      <p style={{ fontSize: 12, color: C.muted }}>
        Nota: se cambia la procedura (indirizzi di Aruba, colonne dell'Excel, pagine del programma) questa pagina va aggiornata a mano.
      </p>
    </div>
  );
}
