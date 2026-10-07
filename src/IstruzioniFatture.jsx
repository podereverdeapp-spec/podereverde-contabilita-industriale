import PaginaIstruzioni from "./PaginaIstruzioni";

// Istruzioni della cartella «Carica Fatture» — aggiornate il 07/10/2026 (versione 233, aggiornate con le correzioni della versione 235) sul
// comportamento reale delle pagine.
export default function IstruzioniFatture() {
  return (
    <PaginaIstruzioni
      titolo="Carica Fatture"
      introduzione={
        <>
          Questa cartella serve a far entrare nel programma tutti i costi e i ricavi: le fatture di acquisto (passive), le fatture di vendita (attive) e i costi che non hanno una fattura, come le buste paga.
          Contiene anche gli strumenti per controllare che non manchi niente: fatture con problemi, fatture o righe presenti nei documenti ma non nel programma, prodotti senza unità di misura.
          <br /><br />
          Ogni fattura di acquisto si scompone in righe: ogni riga ha la sua classificazione (Area, Centro di Costo, Destinazione, Tipo di Costo), perché nella stessa fattura possono esserci, per esempio, un attrezzo da ammortizzare e un sacco di mangime.
          Sono queste righe che poi finiscono nei costi degli animali e delle coltivazioni.
          <br /><br />
          La ricerca delle fatture e il confronto dei prezzi si trovano nella cartella «Ricerca: Fatture, Articoli, Prezzi, Anagrafiche».
        </>
      }
      sezioni={[
        {
          pagina: "Carica Fatture Passive massivamente", icon: "📥",
          aCosaServe: "Il modo principale per caricare le fatture di acquisto, molte alla volta: da un file Excel oppure direttamente da una cartella di PDF. Il programma propone la classificazione di ogni riga secondo le regole già imparate; le righe che non sa classificare le classifica l'utente, una volta sola. Qui si caricano solo fatture di acquisto: le vendite si caricano da «Carica Fatture Attive».",
          comeSiUsa: [
            "Scegliere il tipo di caricamento: «📊 File Excel» oppure «📁 Cartella PDF».",
            "File Excel: le colonne sono Fornitore, P.IVA, Numero, Data, Descrizione, Quantità, U.M., Prezzo unitario, Imponibile, Aliquota IVA (il file preparato con la pagina «Prompt per carico Massivo» è già in questo formato). Viene letto il foglio «Fatture» (se manca, il primo foglio); se c'è anche il foglio «Verifica Fatture», le fatture la cui somma delle righe non torna con il totale del documento vengono segnalate «⚠️ NON QUADRA».",
            "Cartella PDF: si sceglie la cartella e il programma legge i PDF uno per uno con Claude (ogni lettura ha un piccolo costo sull'account Anthropic; prima di partire chiede conferma). Alla fine si possono scaricare i PDF rinominati Fornitore_Data_Numero con «📦 Scarica … PDF rinominati (ZIP)».",
            "In alto i riquadri contano: Totale righe, Salvate, Da classificare, Già caricate (saltate), Non quadrano, Scartate.",
            "Ogni riga ha un'etichetta: «FCF» (blu) = classificata dalla regola fissa del fornitore; «FCV» (verde) = classificata da una parola chiave nella descrizione (anche la regola del gasolio, valida per tutti i fornitori); «⚖️ Da classificare a mano» (rosso) = nessuna regola: scegliere Area, Centro di Costo, Destinazione e Tipo di Costo.",
            "Quando si classifica a mano una riga, il programma chiede «💡 Vuoi che le prossime fatture di questo fornitore si classifichino da sole?»: «Solo questa volta», «Sempre per questo fornitore (regola fissa)» oppure «Solo quando la descrizione contiene una parola chiave» (scrivendo la parola).",
            "«💾 Salva questa riga» salva la riga; «Salva tutte le rimanenti» (in fondo) salva tutte quelle già classificate. Non serve aspettare la fine: ogni riga si salva da sola.",
            "«🗑️ Scarta e ricorda» scarta la riga e la volta successiva scarta da sola le righe con lo stesso fornitore e la stessa descrizione.",
            "«↩️ Annulla e ricarica» su una riga già salvata la toglie dal programma (con l'eventuale cespite, riga di acquisto animali o regola appena creata).",
            "Se si chiude la pagina a metà, il lavoro resta in bozza: alla riapertura compare «Hai un'importazione non salvata … vuoi riprenderla?» con «Riprendi» o «Scarta».",
          ],
          note: "Fatture già presenti: se nel programma esiste già una fattura con lo stesso fornitore, numero e data (anche solo tra gli acquisti di animali), TUTTE le sue righe compaiono sbiadite con «GIÀ CARICATA» e non si possono salvare; per aggiungere una riga a una fattura già presente si usa «Inserimento Manuale Fattura» o «Verifica Righe Mancanti». Il riconoscimento funziona se il fornitore è già in anagrafica (si cerca per partita IVA, poi per nome; se manca viene creato). Aree particolari: «Ammortamenti» chiede Categoria, Imputazione, anno e percentuale di ammortamento e crea il Cespite (avvisa se esiste già un cespite simile); «ACQUISTO ANIMALI» non diventa una riga di fattura ma va nel «Report Acquisto Animali» (Specie, Razza, Destinazione, BDN, numero del lotto); «TRASPORTO ANIMALI» va sempre ripartito a mano tra «Trasporto verso il macello» e «Ingresso in allevamento» (la somma deve essere uguale all'imponibile; per la parte verso il macello si indica il Tipo di Costo; la parte d'ingresso va nel Report Acquisto Animali). Prodotti di Foraggio, Mangimi, Integratori alimentari, Sementi, Concimi e Fitosanitari, Gasolio senza unità di misura confermata: compare un riquadro giallo; si salva comunque e poi si va in «Armonizzare Unità Misura Fatture». Note di credito: si caricano con quantità e imponibile negativi (segno meno).",
        },
        {
          pagina: "Inserimento Manuale Fattura", icon: "✍️",
          aCosaServe: "Registrare a mano una fattura di acquisto (per esempio una fattura cartacea), oppure aggiungere righe a una fattura già presente nel programma.",
          comeSiUsa: [
            "«Fornitore»: scrivere il nome e sceglierlo dall'elenco; se non esiste viene creato con quel nome (senza partita IVA).",
            "Compilare «Numero fattura» e «Data».",
            "Per ogni riga: Descrizione, Quantità, U.M., Prezzo unitario (l'Imponibile si calcola da solo), Aliquota IVA, poi Area, Centro di Costo, Destinazione e Tipo di Costo. Mentre si scrive la descrizione il programma propone la classificazione con le stesse regole del caricamento massivo.",
            "«+ Aggiungi riga» per altre righe, 🗑️ per toglierne una; «✓ Salva Fattura» salva tutto.",
          ],
          note: "Ogni riga deve avere Area e Tipo di Costo (senza, resterebbe fuori dai costi). Se esiste già una fattura con lo stesso fornitore, numero e data, il programma mostra le righe già presenti e chiede se aggiungere quelle nuove. Le righe di Ammortamenti, Acquisto Animali e Trasporto Animali non si inseriscono da qui (il programma lo impedisce): si usa il caricamento massivo, che crea il cespite o la riga nel Report Acquisto Animali.",
        },
        {
          pagina: "Fatture Passive", icon: "📄",
          aCosaServe: "Consultare le fatture di acquisto salvate, dalla più recente.",
          comeSiUsa: [
            "Cercare per fornitore, numero o partita IVA; filtrare per anno o per una data precisa (✕ toglie la data).",
            "In alto: quante fatture e il loro totale con i filtri scelti.",
            "«▼ vedi righe» ricompone la fattura: righe con quantità, prezzo e imponibile, IVA per aliquota e totale.",
            "«📥 Esporta Excel» scarica l'elenco delle fatture filtrate (fornitore, partita IVA, numero, data, totali).",
          ],
          note: "Pagina di sola consultazione: la classificazione delle singole righe si vede nella cartella «Ricerca».",
        },
        {
          pagina: "Carica Fatture Attive", icon: "💰",
          aCosaServe: "Le fatture di vendita: elenco, inserimento di una fattura e caricamento massivo da Excel.",
          comeSiUsa: [
            "«📋 Elenco»: le fatture di vendita, con ricerca per cliente, numero o partita IVA, filtro per anno, «▼ vedi righe» ed «📥 Esporta Excel».",
            "«+ Nuova Fattura»: scegliere il «Cliente» (solo clienti già in anagrafica), numero e data, poi gli articoli (descrizione, quantità, unità di misura, prezzo, aliquota IVA, specie facoltativa) e «💾 Salva fattura».",
            "«📥 Carica Massivo»: file Excel (primo foglio) con le colonne Cliente, P.IVA, Numero, Data, Descrizione, Quantità, U.M., Prezzo unitario, Imponibile, Aliquota IVA, Destinazione (specie, facoltativa). Ogni riga si salva con «💾 Salva questa riga» o tutte con «Salva tutte le rimanenti»; i clienti nuovi vengono creati con nome e partita IVA.",
          ],
          note: "Nel caricamento massivo le fatture già presenti (stesso cliente, numero e data) compaiono «GIÀ CARICATA». La «Nuova Fattura» invece non controlla i doppioni: ogni salvataggio crea una fattura nuova. Le fatture emesse dal programma per gli animali si trovano nella cartella «Emissione Fatture».",
        },
        {
          pagina: "Carica Costi Diretti", icon: "💼",
          aCosaServe: "Registrare i costi che non arrivano con una fattura, soprattutto le buste paga del personale. Entrano nei costi come le righe delle fatture: Report Costi, costo degli animali, Riepilogo Costi e Break Even; i costi con Area «Lavoro» vengono ripartiti tra le attività secondo le percentuali impostate in «Parametri».",
          comeSiUsa: [
            "Compilare Data, Area (proposta «Lavoro»), Centro di Costo, Destinazione, Tipo di Costo (Fisso o Variabile), Importo; facoltativi «Dipendente» (vuoto = totale complessivo) e «Descrizione».",
            "«+ Registra costo» salva.",
            "Sotto: l'elenco filtrabile per anno con il totale; 🗑️ elimina un costo (chiede conferma, non si può annullare); «📥 Esporta Excel» scarica l'elenco.",
          ],
        },
        {
          pagina: "Controllo Anomalie", icon: "🔍",
          aCosaServe: "Trovare le fatture (di acquisto e di vendita) con problemi evidenti: totale a zero, nessuna riga, oppure somma delle righe diversa dall'imponibile della fattura.",
          comeSiUsa: [
            "Il controllo parte da solo all'apertura e mostra le fatture con il problema trovato.",
            "«🗑️ Elimina guscio» cancella una fattura rimasta senza righe (per poterla ricaricare); se la fattura ha delle righe, non viene cancellata.",
            "Per completare una fattura a cui mancano righe: «Inserimento Manuale Fattura» oppure «Verifica Righe Mancanti» → «➕ Registra» (il caricamento massivo la considera già caricata).",
          ],
          note: "Il totale delle fatture viene ricalcolato dalle righe salvate: una fattura caricata solo in parte, quindi, qui non risulta. Per scoprire le righe mancanti si usa «Verifica Righe Mancanti». I controlli sui registri dell'app e sui dati degli animali sono nella cartella «Controlli».",
        },
        {
          pagina: "Armonizzare Unità Misura Fatture", icon: "⚖️",
          aCosaServe: "Fissare l'unità di misura e il peso in chilogrammi dei prodotti di Foraggio, Mangimi, Integratori alimentari, Coltivazione Sementi, Coltivazione Concimi e Fitosanitari, Gasolio e lubrificanti: serve ai report delle quantità (chili di mangime, quintali di fieno…).",
          comeSiUsa: [
            "L'elenco mostra ogni prodotto (fornitore + descrizione + centro di costo) senza unità confermata, dal più frequente.",
            "«▼ vedi le fatture» mostra le fatture in cui compare, con l'unità scritta in fattura; «📄 apri fattura» le apre.",
            "Se c'è un prodotto simile già confermato compare «💡 Suggerimento» con il pulsante «Usa … (come suggerito)»: verificarlo prima di usarlo.",
            "Scegliere l'unità: Kilogrammi (1 kg), Tons (1.000 kg), Quintali (100 kg), Rotoballe, Balle, Balloni, Rotoloni (340 kg); per «Unità» e «Litri» scrivere quanti kg vale un'unità.",
            "«✓ Conferma unità»: la regola vale per tutte le righe di quel fornitore, prodotto e centro di costo, anche quelle già caricate.",
          ],
        },
        {
          pagina: "Prompt per carico Massivo", icon: "🤖",
          aCosaServe: "Due testi già pronti («Fatture Passive (acquisto)» e «Fatture Attive (vendita)») da incollare in una chat di intelligenza artificiale insieme ai PDF delle fatture, per ottenere il file Excel da caricare.",
          comeSiUsa: [
            "«📋 Copia prompt» copia il testo; incollarlo nella chat insieme ai PDF.",
            "La chat restituisce due tabelle: «Fatture» (una riga per articolo) e «Verifica Fatture» (il totale di ogni documento confrontato con la somma delle righe).",
            "Salvare le due tabelle in un file Excel con due fogli «Fatture» e «Verifica Fatture» e caricarlo in «Carica Fatture Passive massivamente» (oppure, per le vendite, in «Carica Fatture Attive» → «📥 Carica Massivo», che legge solo il primo foglio).",
          ],
          note: "Per gli acquisti si possono anche caricare i PDF direttamente con «📁 Cartella PDF», senza passare dalla chat.",
        },
        {
          pagina: "Verifica Fatture Mancanti", icon: "🔍",
          aCosaServe: "Controllare che nel programma ci siano tutte le fatture di acquisto di un anno, confrontandole con un elenco Excel (dal cassetto fiscale, dal commercialista, dalla PEC).",
          comeSiUsa: [
            "Scegliere l'anno e il file con «📎 Scegli file Excel».",
            "Indicare le colonne: «Numero fattura» (obbligatoria), «Fornitore» (consigliata), «Data» (per l'anno). Il programma prova a riconoscerle da solo.",
            "«🔍 Confronta con il database»: compare l'elenco delle fatture del file che nel programma non ci sono.",
          ],
          note: "Il confronto è per numero (senza zeri iniziali, spazi, barre e trattini) e, se indicato, per nome del fornitore scritto esattamente come in anagrafica. Le fatture d'acquisto di animali registrate solo nel Report Acquisto Animali risultano mancanti: verificarle lì.",
        },
        {
          pagina: "Verifica Righe Mancanti", icon: "🔎",
          aCosaServe: "Controllare riga per riga che ogni importo di un file Excel (per esempio quello prodotto dal prompt) sia registrato nel programma: tra le righe delle fatture di acquisto, tra i cespiti o tra gli acquisti di animali.",
          comeSiUsa: [
            "Scegliere l'anno e il file, poi indicare le colonne: «Fornitore» e «Importo» (obbligatorie), «Descrizione» e «Data»; le altre (P.IVA, Numero, Quantità, U.M., Prezzo unitario, Aliquota IVA) servono per l'esportazione.",
            "«🔍 Confronta con il database»: compaiono le righe del file non trovate (confronto per fornitore e importo, con tolleranza di 5 centesimi o del 2%).",
            "«📥 Scarica Excel per Carica Fatture» scarica le righe mancanti già nel formato da ricaricare.",
            "«➕ Registra» registra una riga mancante come riga di fattura o come cespite; «🏷️ Non da registrare» la toglie dal controllo (l'elenco è in «▼ Fatture escluse», da cui «✕ Rimuovi esclusione»).",
          ],
          note: "I fornitori del file devono avere lo stesso nome dell'anagrafica, altrimenti tutte le loro righe risultano mancanti. Con «➕ Registra» il numero della fattura va riscritto a mano; una riga normale richiede Area e Tipo di Costo; come cespite vengono creati la riga di fattura «Ammortamenti», il dettaglio dell'ammortamento e il cespite, come nel caricamento massivo.",
        },
      ]}
    />
  );
}
