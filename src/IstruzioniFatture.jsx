import PaginaIstruzioni from "./PaginaIstruzioni";

export default function IstruzioniFatture() {
  return (
    <PaginaIstruzioni
      titolo="Fatture"
      introduzione="Questa cartella raccoglie tutto ciò che riguarda le fatture — dal caricamento iniziale, alla consultazione, fino agli strumenti che controllano e ricercano nei dati già caricati."
      sezioni={[
        {
          pagina: "Carica Fatture", icon: "📥",
          aCosaServe: "È il punto di ingresso di ogni fattura, sia passiva (acquisti) sia attiva (vendite). Da qui si carica un file Excel con le fatture grezze, e il sistema prova a classificarle automaticamente riga per riga secondo il Piano dei Conti (Area, Centro di Costo, Destinazione, Tipo di Costo).",
          comeSiUsa: [
            "Prepara un file Excel con le colonne richieste (Data, Numero, Fornitore/Cliente, Descrizione, Quantità, Prezzo unitario, Imponibile — vedi il formato di esempio se disponibile).",
            "Carica il file: il sistema riconosce automaticamente ogni riga già vista in precedenza (stesso fornitore, stessa descrizione) e la classifica da solo, con un'etichetta colorata (verde = classificazione fissa o per parola chiave, blu = fissa per fornitore).",
            "Le righe che il sistema non riconosce appaiono con l'etichetta rossa \"⚖️ Da classificare a mano\": scegli tu Area, Centro di Costo, Destinazione e Tipo di Costo dal menu a tendina, poi premi Salva su quella riga.",
            "Se una riga appartiene a un centro di costo con quantità tracciate (Mangimi, Foraggio, ecc.) e non ha ancora un'unità di misura confermata, vedrai anche un avviso giallo \"⚖️ Da Armonizzare\" — salva comunque la riga, poi vai a definirla nella pagina Da Armonizzare.",
            "Le fatture già presenti nel sistema (stesso fornitore, numero e data) appaiono sbiadite con l'etichetta \"GIÀ CARICATA\" — non è possibile riclassificarle per sbaglio.",
            "Se scopri che una fattura risulta bloccata per errore (es. un caricamento precedente andato a vuoto), controlla la pagina Controllo Anomalie.",
          ],
          note: "Alcune Aree hanno un comportamento speciale: \"Ammortamenti\" crea automaticamente un Cespite; \"ACQUISTO ANIMALI\" manda la riga in Report Acquisto Animali; \"TRASPORTO ANIMALI\" richiede sempre una classificazione manuale, mai automatica.",
        },
        {
          pagina: "Fatture Passive", icon: "📄",
          aCosaServe: "Elenco di tutte le fatture di acquisto già registrate nel sistema, con la loro classificazione completa. Serve per consultare, verificare o esportare lo storico degli acquisti.",
          comeSiUsa: [
            "Sfoglia l'elenco, oppure usa la ricerca per trovare una fattura specifica per fornitore o numero.",
            "Clicca su una fattura per aprirla ed esaminare tutte le sue righe articolo, con la classificazione applicata a ciascuna.",
            "Usa il pulsante \"📥 Esporta Excel\" per scaricare l'elenco completo.",
          ],
        },
        {
          pagina: "Fatture Attive", icon: "💰",
          aCosaServe: "Stesso principio delle Fatture Passive, ma per le vendite (fatture emesse a clienti).",
          comeSiUsa: [
            "Sfoglia o cerca una fattura di vendita per cliente o numero.",
            "Apri una fattura per vederne il dettaglio riga per riga.",
            "Esporta in Excel quando serve un riepilogo delle vendite.",
          ],
        },
        {
          pagina: "Costi Diretti", icon: "💼",
          aCosaServe: "Per registrare costi che NON derivano da una fattura fornitore — principalmente il costo del lavoro (buste paga), ma anche altri costi simili. Usa la stessa classificazione delle fatture, per finire coerentemente negli stessi tipi di analisi.",
          comeSiUsa: [
            "Compila il modulo in alto: Data, Area (es. \"Lavoro\"), Centro di Costo, eventuale Destinazione, Tipo di Costo, Importo.",
            "Il campo \"Dipendente\" è facoltativo: compilalo per il dettaglio di una singola persona, oppure lascialo vuoto per un totale aggregato.",
            "Premi \"+ Registra costo\" per salvare.",
            "L'elenco sotto mostra tutti i costi già registrati, filtrabili per anno, con la possibilità di eliminarli se inseriti per errore.",
          ],
          note: "Attenzione: oggi questi costi si registrano e si consultano qui, ma non sono ancora inclusi nei calcoli di Report Costi.",
        },
        {
          pagina: "Ricerca", icon: "🔎",
          aCosaServe: "Ricerca trasversale su tutte le fatture — utile quando non ricordi esattamente dove si trova un'informazione (numero, fornitore, descrizione di un articolo, una nota).",
          comeSiUsa: [
            "Digita un termine di ricerca nella casella in alto: cerca contemporaneamente in numero fattura, nome fornitore/cliente, descrizione degli articoli e note.",
            "Affina con i filtri sotto: Tipo (acquisto/vendita), Area, Specie/Destinazione, Anno, intervallo di date, intervallo di importo.",
            "Clicca su un risultato per aprire il dettaglio completo della fattura.",
          ],
        },
        {
          pagina: "Controllo Anomalie", icon: "🔍",
          aCosaServe: "Trova automaticamente le fatture con problemi evidenti: totale a zero, nessuna riga articolo collegata, o (il caso più insidioso) righe salvate la cui somma non coincide con l'imponibile dichiarato — sintomo di una riga rimasta \"da classificare\" e mai completata.",
          comeSiUsa: [
            "Apri la pagina: il controllo parte da solo e mostra l'elenco delle fatture anomale trovate, con il tipo di problema indicato per ciascuna.",
            "Se una fattura non ha righe, puoi eliminarla direttamente da qui con \"🗑️ Elimina guscio\" — libera il numero/data per poterla ricaricare correttamente.",
            "Se invece la fattura ha già delle righe (anche solo alcune), il sistema non la elimina automaticamente: va completata a mano in Carica Fatture.",
          ],
        },
        {
          pagina: "Da Armonizzare", icon: "⚖️",
          aCosaServe: "Elenca i prodotti (nei centri di costo con quantità tracciate: Foraggio, Mangimi, Coltivazione Sementi, Coltivazione Concimi e Fitosanitari, Gasolio e lubrificanti) per cui non è ancora stata confermata l'unità di misura — passaggio necessario per i report di quantità.",
          comeSiUsa: [
            "Per ogni prodotto in attesa, clicca \"▼ vedi le fatture\" per controllare, senza cambiare pagina, le fatture reali che lo contengono — puoi anche aprire ciascuna fattura per intero con \"📄 apri fattura\".",
            "Se il sistema propone un suggerimento (stesso fornitore, prodotto scritto in modo simile), verificalo prima di usarlo.",
            "Scegli l'unità corretta dal menu a tendina e premi \"✓ Conferma unità\" — la regola vale poi automaticamente per tutte le fatture future dello stesso fornitore e prodotto.",
          ],
        },
        {
          pagina: "Articoli & Prezzi", icon: "🏷️",
          aCosaServe: "Confronta i prezzi pagati per lo stesso prodotto nel tempo, anche tra fornitori diversi — utile per capire se un prezzo è aumentato o se conviene cambiare fornitore.",
          comeSiUsa: [
            "Cerca un prodotto per nome, oppure filtra per fornitore/cliente o per tipo (acquisti/vendite).",
            "Ogni riga mostra prezzo minimo, medio, massimo e più recente — se il prezzo più recente è in rosso, ha raggiunto un nuovo massimo storico.",
            "Clicca sullo scostamento percentuale per vedere il grafico dell'andamento nel tempo.",
            "Clicca sulla riga per espandere lo storico completo di acquisti/vendite di quel prodotto.",
          ],
        },
      ]}
    />
  );
}
