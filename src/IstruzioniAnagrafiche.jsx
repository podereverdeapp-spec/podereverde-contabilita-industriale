import PaginaIstruzioni from "./PaginaIstruzioni";

// Istruzioni della cartella «Ricerca: Fatture, Articoli, Prezzi, Anagrafiche» — riscritte il
// 07/10/2026 (versione 234, aggiornate con le correzioni della versione 235) sul comportamento reale delle pagine.
export default function IstruzioniAnagrafiche() {
  return (
    <PaginaIstruzioni
      titolo="Ricerca: Fatture, Articoli, Prezzi, Anagrafiche"
      introduzione={
        <>
          Questa cartella serve a ritrovare le informazioni già caricate: una fattura, una riga di fattura, il prezzo pagato per un prodotto nel tempo, i dati di un fornitore o di un cliente.
          <br /><br />
          Attenzione: «Ricerca» e «Articoli &amp; Prezzi» non servono solo a guardare, ma permettono anche di MODIFICARE fatture, righe e classificazioni, e queste modifiche cambiano i costi. Ogni modifica resta scritta nel «Registro delle Modifiche» (cartella «Controlli»), con chi l'ha fatta e il valore prima e dopo.
        </>
      }
      sezioni={[
        {
          pagina: "Ricerca", icon: "🔎",
          aCosaServe: "Trovare qualsiasi fattura, di acquisto o di vendita, quando non si ricorda dove sia: per numero, fornitore o cliente, descrizione di un articolo o nota. Da qui si possono anche correggere la testata della fattura e la classificazione delle singole righe.",
          comeSiUsa: [
            "Scrivere nella casella «Cerca per numero, fornitore/cliente, descrizione articolo o note...»: il programma cerca il testo in tutti questi campi (le maiuscole non contano, gli accenti sì; la partita IVA non viene cercata).",
            "Restringere con i filtri: «Tipo» (acquisti o vendite), «Area», «Centro di Costo», «Specie/Destinazione», «Tipo di Costo», «Anno», «Data da» e «Data a», «Importo minimo» e «Importo massimo». Una fattura compare se almeno una delle sue righe corrisponde ai filtri di classificazione.",
            "In alto: quante fatture sono state trovate e il loro totale (IVA compresa). Se è scelto un Centro di Costo compare anche «Solo …»: la somma delle sole righe di quel centro, senza IVA.",
            "Si vedono le prime 200 fatture, dalla più recente; per le altre bisogna affinare la ricerca. «📥 Esporta Excel» scarica invece tutte le fatture trovate (dati di testata: controparte, numero, data, totali, note).",
            "«▼ dettaglio» apre le righe della fattura, ognuna con la sua classificazione (area · centro · destinazione · tipo di costo) e l'importo.",
            "✏️ accanto a una riga («Modifica classificazione») permette di cambiare descrizione, quantità, unità di misura, prezzo, importo, aliquota IVA, Area, Centro di Costo, Destinazione e Tipo di Costo; «✓ Salva» salva e ricalcola i totali della fattura.",
            "✏️ accanto al numero della fattura («Modifica fornitore/numero/data») permette di cambiare fornitore, numero e data, e i dati del fornitore (nome, partita IVA, codice fiscale).",
          ],
          note: "Prima di salvare, il programma mostra l'elenco di cosa cambia e chiede conferma. Per le righe delle fatture d'acquisto Quantità, Prezzo unitario e Tipo di Costo sono obbligatori (senza Tipo di Costo la riga resterebbe fuori dai costi). I dati del fornitore modificati qui valgono per TUTTE le sue fatture; se si lascia vuoto il campo della partita IVA o del codice fiscale, il programma chiede se cancellarli davvero (con «Annulla» restano come sono): la partita IVA è il dato con cui il fornitore viene riconosciuto nelle fatture successive.",
        },
        {
          pagina: "Articoli & Prezzi", icon: "🏷️",
          aCosaServe: "Vedere quanto si è pagato (o venduto) lo stesso prodotto nel tempo e da fornitori diversi: prezzo minimo, medio, massimo e più recente, con i grafici dell'andamento. Da qui si può anche cambiare in blocco la classificazione di un prodotto.",
          comeSiUsa: [
            "Cercare per descrizione o per nome del fornitore o cliente nella casella «Cerca per descrizione o fornitore/cliente...»; scegliere «Acquisti e vendite», «Solo acquisti» o «Solo vendite».",
            "Ordinare con il secondo menu: «Più recenti prima», «Aumenti di prezzo peggiori prima», «Diminuzioni di prezzo migliori prima», oppure «Fornitore con aumento peggiore per prodotto» (in questo caso lo stesso prodotto compare una volta per ogni fornitore).",
            "Ogni riga è un prodotto (righe con la stessa descrizione): fornitori o clienti, unità di misura dell'ultimo acquisto, numero di righe, prezzo minimo, medio, massimo, più recente, scostamento del prezzo più recente dalla media e data più recente.",
            "Il prezzo più recente è in rosso con ⚠️ quando è uguale o superiore al massimo pagato prima; lo scostamento è rosso ▲ se il prezzo recente è sopra la media, verde ▼ se è sotto.",
            "Cliccare sulla riga per aprire: il grafico dei prezzi nel tempo, il grafico del prezzo medio per anno con la variazione rispetto all'anno prima, la classificazione e lo storico completo (data, acquisto o vendita, controparte, numero della fattura, quantità, prezzo, imponibile).",
            "«📥 Esporta Excel» scarica due fogli: il riepilogo di tutti i prodotti trovati e lo storico completo.",
            "«✏️ Modifica classificazione» (solo per gli acquisti): si scelgono Area, Centro di Costo, Destinazione e Tipo di Costo e «✓ Salva e applica alle prossime fatture».",
          ],
          note: "Come leggere i prezzi: lo «stesso prodotto» è la stessa descrizione scritta in fattura, senza tener conto dell'unità di misura: se lo stesso prodotto è stato comprato a volte a chili e a volte a quintali, i prezzi si mescolano. Il prezzo medio è la media semplice dei prezzi unitari (non pesata sulle quantità); le righe con prezzo zero o negativo (per esempio le note di credito) non entrano in minimo, medio, massimo e recente, ma compaiono nei grafici. Se nello stesso prodotto ci sono unità di misura diverse, accanto all'unità compare ⚠️ (i prezzi non sono confrontabili tra loro). Si vedono i primi 300 prodotti. ATTENZIONE a «✓ Salva e applica alle prossime fatture»: cambia la classificazione di TUTTE le righe di quel prodotto già caricate, di tutti i fornitori e di tutti gli anni, e crea per ogni fornitore una regola che classificherà allo stesso modo le fatture future (questa regola passa davanti a tutte le altre). Prima di scrivere, il programma dice quante righe e quanti fornitori sono coinvolti e chiede conferma; i campi lasciati vuoti restano come sono.",
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
