import PaginaIstruzioni from "./PaginaIstruzioni";

// Istruzioni della cartella «Ricerca: Fatture e Anagrafiche» — riscritte il 07/10/2026 (versione 234, aggiornate
// con le correzioni della versione 235). Versione 241 (09/10/2026): «Attenzione Variazione Prezzi», «Articoli & Prezzi»
// e «Famiglie di Prodotto» sono passate nella cartella «Controllo Prezzi di Acquisto» (IstruzioniPrezziAcquisto.jsx).
export default function IstruzioniAnagrafiche() {
  return (
    <PaginaIstruzioni
      titolo="Ricerca: Fatture e Anagrafiche"
      introduzione={
        <>
          Questa cartella serve a ritrovare le informazioni già caricate: una fattura, una riga di fattura, i dati di un fornitore o di un cliente. Il prezzo pagato per un prodotto nel tempo si trova nella cartella «Controllo Prezzi di Acquisto».
          <br /><br />
          Attenzione: «Ricerca» non serve solo a guardare, ma permette anche di MODIFICARE fatture, righe e classificazioni, e queste modifiche cambiano i costi. Ogni modifica resta scritta nel «Registro delle Modifiche» (Carica Dati Contabilità → 6. Controllo finale), con chi l'ha fatta e il valore prima e dopo.
          <br /><br />
          <strong>Lettura a pagine</strong> (versione 280, decisione del Dott. Bizzarri del 23/10/2026): il database consegna al massimo 1.000 righe per ogni richiesta. Le pagine di questa cartella che calcolano, controllano o elencano leggono i dati a gruppi di 1.000, uno dopo l'altro, finché non li hanno ricevuti tutti: nessuna fattura, riga o costo resta fuori, anche quando saranno decine di migliaia. Vedi nel Glossario «Lettura a pagine».
        </>
      }
      sezioni={[
        {
          pagina: "Ricerca", icon: "🔎",
          aCosaServe: "Trovare qualsiasi fattura, di acquisto o di vendita, quando non si ricorda dove sia: per numero, fornitore o cliente, descrizione di un articolo o nota. Da qui si possono anche correggere la testata della fattura e la classificazione delle singole righe.",
          comeSiUsa: [
            "Scrivere nella casella «Cerca per numero, fornitore/cliente, descrizione articolo o note...»: il database cerca il testo su TUTTE le fatture, in numero, controparte, partita IVA, note e descrizione delle righe (le maiuscole non contano, gli accenti sì). Per gli acquisti di animali cerca anche matricola, lotto, specie, razza e note dei capi. La ricerca parte mezzo secondo dopo l'ultima lettera scritta.",
            "Restringere con i filtri: «Tipo» (acquisti o vendite), «Area», «Centro di Costo», «Specie/Destinazione», «Tipo di Costo», «Anno», «Data da» e «Data a», «Importo minimo» e «Importo massimo». Aree e centri di costo sono quelli del Piano dei Conti, comprese «ACQUISTO ANIMALI» e «TRASPORTO ANIMALI»; scelta un'area, il menu dei centri mostra solo i suoi. Una fattura compare se almeno UNA delle sue righe ha tutte le classificazioni scelte.",
            "In alto: quante fatture sono state trovate e il loro totale (IVA compresa), calcolati dal database su tutte, anche quelle che non si vedono. Con un filtro di classificazione compare anche «di cui righe con …»: la somma delle sole righe che hanno le classificazioni scelte, senza IVA — cioè quanto si è speso davvero per quella voce.",
            "Le fatture si vedono a gruppi: «per volta» sceglie 50, 100 o 200. I pulsanti «◀ precedenti» e «successive ▶», sopra e sotto l'elenco, passano al gruppo prima o dopo; cambiando un filtro si riparte dalla prima. «📥 Esporta Excel» scarica TUTTE le fatture trovate (dati di testata: tipo, controparte, numero, data, totali, note), lette 1.000 alla volta.",
            "Gli acquisti di animali registrati solo nel Report Acquisto Animali compaiono come fatture segnate «🐄 Acquisto animali» (una per fornitore, numero e data; «senza numero» se il numero non è registrato): il totale è l'importo dei capi, l'IVA non è registrata. «▼ dettaglio» mostra i capi con matricola o lotto e prezzo; non si modificano da qui ma nella pagina «Report Acquisto Animali».",
            "🗂️ Documenti di competenza (versione 284): compaiono anche i documenti «da ricevere» (tra le passive) e «da emettere» (tra le attive) con Muratella. Non sono fatture arrivate o emesse: sono i costi e i ricavi con Muratella che si contano nell'anno giusto in attesa della fattura vera (decisione dell'8 ottobre 2026). Per capirli occorre leggere il rinvio: la pagina «Fatture da Ricevere e da Emettere → Rapporti con Muratella» spiega cosa contengono, come entrano nei costi e come si collegano alla fattura vera quando arriva. Accanto a ciascuno si legge se è già collegato; la fattura vera collegata è segnata «🔗» e non si conta di nuovo nei costi. Nel menu «Tipo» ci sono anche «Da ricevere» e «Da emettere».",
            "🚚 Trasporti attribuiti ai capi (versione 283): alcune fatture di trasporto degli animali in ingresso hanno la riga a 0, perché il loro importo è scritto nel Report Acquisto Animali e va nel costo dei capi trasportati (così non si conta due volte). Accanto a queste fatture, e sulla loro riga, si legge «🚚 trasporto … attribuito ai capi»; in alto si legge quanto valgono in tutto, non compreso nel totale delle fatture. Nel «di cui righe» (per esempio con l'area «TRASPORTO ANIMALI») questi trasporti sono invece compresi.",
            "«▼ dettaglio» apre le righe della fattura, ognuna con la sua classificazione (area · centro · destinazione · tipo di costo) e l'importo.",
            "✏️ accanto a una riga («Modifica classificazione») permette di cambiare descrizione, quantità, unità di misura, prezzo, importo, aliquota IVA, Area, Centro di Costo, Destinazione e Tipo di Costo; «✓ Salva» salva e ricalcola i totali della fattura.",
            "✏️ accanto al numero della fattura («Modifica fornitore/numero/data») permette di cambiare fornitore, numero e data, e i dati del fornitore (nome, partita IVA, codice fiscale).",
          ],
          note: "Prima di salvare, il programma mostra l'elenco di cosa cambia e chiede conferma. Per le righe delle fatture d'acquisto Quantità, Prezzo unitario e Tipo di Costo sono obbligatori (senza Tipo di Costo la riga resterebbe fuori dai costi). I dati del fornitore modificati qui valgono per TUTTE le sue fatture; se si lascia vuoto il campo della partita IVA o del codice fiscale, il programma chiede se cancellarli davvero (con «Annulla» restano come sono): la partita IVA è il dato con cui il fornitore viene riconosciuto nelle fatture successive.",
        },
        {
          pagina: "Fornitori", icon: "🏢",
          aCosaServe: "L'elenco dei fornitori registrati: nome, partita IVA, gruppo e numero di fatture storiche. Pagina di sola consultazione.",
          comeSiUsa: [
            "Cercare per nome nella casella «Cerca per nome...»; filtrare per gruppo: «FCV — parola chiave», «FCF — fissa», «FRO — sempre manuale».",
            "La partita IVA mancante è segnalata in rosso: «mancante — abbinamento per nome».",
            "«📥 Esporta Excel» scarica l'elenco.",
          ],
          note: "I fornitori nuovi vengono creati da soli durante il caricamento delle fatture: il programma li riconosce prima per partita IVA (con o senza «IT») e poi per nome. Un fornitore senza partita IVA viene riconosciuto solo se il nome è scritto esattamente uguale: per questo la partita IVA va sempre compilata. La colonna «Gruppo» è solo un'etichetta: la classificazione automatica delle fatture dipende dalle regole create durante il caricamento, non dal gruppo; un fornitore «FRO — sempre manuale» può quindi avere righe classificate da sole. Nome e partita IVA di un fornitore si correggono dalla pagina «Ricerca» (✏️ sulla testata di una sua fattura).",
        },
        {
          pagina: "Clienti", icon: "🤝",
          aCosaServe: "L'elenco dei clienti a cui l'azienda vende: nome, partita IVA, città e contatti.",
          comeSiUsa: [
            "Cercare per nome o partita IVA nella casella «Cerca per nome o P.IVA...».",
            "«+ Nuovo Cliente» apre il modulo: «Nome» (obbligatorio), «P.IVA», «Città», «Telefono», «Email»; «Salva» lo registra.",
            "«📥 Esporta Excel» scarica nome e partita IVA.",
          ],
          note: "I clienti vengono creati anche da soli quando si caricano le fatture di vendita o si emettono fatture dalla cartella «Emissione Fatture». Se si crea a mano un cliente con lo stesso nome o la stessa partita IVA di uno già presente, il programma lo segnala e chiede conferma. Da questa pagina i clienti non si modificano né si cancellano.",
        },
      ]}
    />
  );
}
