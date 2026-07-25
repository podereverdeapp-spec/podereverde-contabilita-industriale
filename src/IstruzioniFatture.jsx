import PaginaIstruzioni from "./PaginaIstruzioni";

export default function IstruzioniFatture() {
  return (
    <PaginaIstruzioni
      titolo="Fatture"
      introduzione="Questa cartella raccoglie tutto ciò che riguarda le fatture — dal caricamento iniziale alla loro consultazione, fino agli strumenti che analizzano i dati che contengono. È divisa in due sotto-cartelle: Gestione (dove le fatture entrano nel sistema) e Analisi (dove si consultano e controllano i dati già caricati)."
      sezioni={[
        {
          pagina: "Gestione → Carica Fatture", icon: "📥",
          aCosaServe: "È il punto di ingresso di ogni fattura, sia passiva (acquisti) sia attiva (vendite). Da qui si carica un file Excel con le fatture grezze, e il sistema prova a classificarle automaticamente riga per riga secondo il Piano dei Conti (Area, Centro di Costo, Destinazione, Tipo di Costo).",
          comeSiUsa: [
            "Prepara un file Excel con le colonne richieste (Data, Numero, Fornitore/Cliente, Descrizione, Quantità, Prezzo unitario, Imponibile — vedi il formato di esempio se disponibile).",
            "Carica il file: il sistema riconosce automaticamente ogni riga già vista in precedenza (stesso fornitore, stessa descrizione) e la classifica da solo, con un'etichetta colorata (verde = classificazione fissa o per parola chiave, blu = fissa per fornitore).",
            "Le righe che il sistema non riconosce appaiono con l'etichetta rossa \"⚖️ Da classificare a mano\": scegli tu Area, Centro di Costo, Destinazione e Tipo di Costo dal menu a tendina, poi premi Salva su quella riga.",
            "Se una riga appartiene a un centro di costo con quantità tracciate (Mangimi, Foraggio, ecc.) e non ha ancora un'unità di misura confermata, vedrai anche un avviso giallo \"⚖️ Da Armonizzare\" — salva comunque la riga, poi vai a definirla nella pagina Da Armonizzare.",
            "Le fatture già presenti nel sistema (stesso fornitore, numero e data) appaiono sbiadite con l'etichetta \"GIÀ CARICATA\" — non è possibile riclassificarle per sbaglio.",
            "Se scopri che una fattura risulta bloccata per errore (es. un caricamento precedente andato a vuoto), controlla la pagina Controllo Anomalie: potresti dover eliminare un \"guscio vuoto\" prima di poter ricaricare quella fattura.",
          ],
          note: "Alcune Aree hanno un comportamento speciale: \"Ammortamenti\" crea automaticamente un Cespite; \"ACQUISTO ANIMALI\" manda la riga in Report Acquisto Animali; \"TRASPORTO ANIMALI\" richiede sempre una classificazione manuale, mai automatica.",
        },
        {
          pagina: "Gestione → Fatture Passive", icon: "📄",
          aCosaServe: "Elenco di tutte le fatture di acquisto già registrate nel sistema, con la loro classificazione completa. Serve per consultare, verificare o esportare lo storico degli acquisti.",
          comeSiUsa: [
            "Sfoglia l'elenco, oppure usa la ricerca per trovare una fattura specifica per fornitore o numero.",
            "Clicca su una fattura per aprirla ed esaminare tutte le sue righe articolo, con la classificazione applicata a ciascuna.",
            "Usa il pulsante \"📥 Esporta Excel\" per scaricare l'elenco completo, con formattazione pronta per la stampa o l'archiviazione.",
          ],
        },
        {
          pagina: "Gestione → Fatture Attive", icon: "💰",
          aCosaServe: "Stesso principio delle Fatture Passive, ma per le vendite (fatture emesse a clienti).",
          comeSiUsa: [
            "Sfoglia o cerca una fattura di vendita per cliente o numero.",
            "Apri una fattura per vederne il dettaglio riga per riga.",
            "Esporta in Excel quando serve un riepilogo delle vendite.",
          ],
        },
        {
          pagina: "Gestione → Costi Diretti", icon: "💼",
          aCosaServe: "Per registrare costi che NON derivano da una fattura fornitore — principalmente il costo del lavoro (buste paga), ma anche altri costi simili. Usa la stessa classificazione Area/Centro di Costo/Destinazione/Tipo di Costo delle fatture, per finire coerentemente negli stessi tipi di analisi.",
          comeSiUsa: [
            "Compila il modulo in alto: Data, Area (es. \"Lavoro\"), Centro di Costo, eventuale Destinazione (specie), Tipo di Costo, Importo.",
            "Il campo \"Dipendente\" è facoltativo: compilalo per registrare il costo di una singola persona (dettaglio busta paga), oppure lascialo vuoto per registrare un totale aggregato (es. il totale mensile di un tipo di lavoro).",
            "Premi \"+ Registra costo\" per salvare.",
            "L'elenco sotto mostra tutti i costi già registrati, filtrabili per anno, con la possibilità di eliminarli con il cestino se inseriti per errore.",
          ],
          note: "Attenzione: oggi questi costi si registrano e si consultano qui, ma non sono ancora inclusi nei calcoli di Report Costi — è un'integrazione futura, non ancora costruita.",
        },
        {
          pagina: "Analisi → Articoli & Prezzi", icon: "🏷️",
          aCosaServe: "Confronta i prezzi pagati per lo stesso prodotto nel tempo, anche tra fornitori diversi — utile per capire se un prezzo è aumentato o se conviene cambiare fornitore.",
          comeSiUsa: [
            "Cerca un prodotto per nome nella casella di ricerca, oppure filtra per fornitore/cliente o per tipo (acquisti/vendite).",
            "Ogni riga mostra prezzo minimo, medio, massimo e più recente per quel prodotto — se il prezzo più recente è evidenziato in rosso, significa che ha raggiunto un nuovo massimo storico.",
            "Clicca sullo scostamento percentuale (colonna a destra) per vedere un grafico dell'andamento del prezzo nel tempo.",
            "Clicca sulla riga stessa per espandere lo storico completo di tutti gli acquisti/vendite di quel prodotto.",
          ],
        },
        {
          pagina: "Analisi → Ricerca", icon: "🔎",
          aCosaServe: "Ricerca trasversale su tutte le fatture — utile quando non ricordi esattamente dove si trova un'informazione (numero, fornitore, descrizione di un articolo, una nota).",
          comeSiUsa: [
            "Digita un termine di ricerca nella casella in alto: cerca contemporaneamente in numero fattura, nome fornitore/cliente, descrizione degli articoli e note.",
            "Affina con i filtri sotto: Tipo (acquisto/vendita), Area, Specie/Destinazione, Anno, intervallo di date, intervallo di importo.",
            "Clicca su un risultato per aprire il dettaglio completo della fattura.",
          ],
        },
        {
          pagina: "Analisi → Controllo Anomalie", icon: "🔍",
          aCosaServe: "Trova automaticamente le fatture con problemi evidenti — totale a zero, o nessuna riga articolo collegata — sintomo di un caricamento interrotto o incompleto.",
          comeSiUsa: [
            "Apri la pagina: il controllo parte da solo e mostra l'elenco delle fatture anomale trovate.",
            "Se una fattura non ha righe articolo, puoi eliminarla direttamente da qui con il pulsante \"🗑️ Elimina guscio\" — libera il numero/data per poterla ricaricare correttamente.",
            "Se invece la fattura ha già delle righe, il sistema non la elimina automaticamente (per non perdere dati): va controllata a mano.",
          ],
        },
        {
          pagina: "Analisi → Da Armonizzare", icon: "⚖️",
          aCosaServe: "Elenca i prodotti (nei centri di costo con quantità tracciate: Foraggio, Mangimi, Coltivazione Sementi, Coltivazione Concimi e Fitosanitari, Gasolio e lubrificanti) per cui non è ancora stata confermata l'unità di misura — passaggio necessario per i futuri report di quantità.",
          comeSiUsa: [
            "Per ogni prodotto in attesa, controlla (se serve, andando a vedere la fattura originale) quale sia la vera unità di misura.",
            "Se il sistema propone un suggerimento (perché lo stesso fornitore ha già un prodotto scritto in modo simile), verificalo: se è davvero lo stesso prodotto, usa il pulsante del suggerimento; altrimenti scegli l'unità corretta dal menu a tendina e premi \"✓ Conferma unità\".",
            "Una volta confermata, la regola vale automaticamente per tutte le fatture future dello stesso fornitore e prodotto — non serve rifarlo.",
          ],
        },
      ]}
    />
  );
}
