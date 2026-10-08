import PaginaIstruzioni from "./PaginaIstruzioni";

// Istruzioni della cartella Emissione Fatture (fatture attive emesse da Podere Verde).
export default function IstruzioniEmissioneFatture() {
  return (
    <PaginaIstruzioni
      titolo="Emissione Fatture"
      introduzione={
        <>
          Questa sezione serve a preparare ed emettere le fatture di vendita di Podere Verde: per prime le consegne degli animali al macello.
          <br /><br />
          I dati dei capi consegnati (matricola o lotto, modello 4, peso della carcassa, numero di partita, cliente) arrivano dall'app Podere Verde, dove l'operatore li completa dopo la consegna. Qui si prepara la fattura, la si controlla e la si registra nel programma.
          <br /><br />
          La sezione è divisa in due sottocartelle:
          <br />• <strong>Fatturazione Animali Allevamento</strong>: le fatture per gli animali consegnati al macello o venduti ad altri allevamenti, preparate dai dati dei capi usciti;
          <br />• <strong>Altre Fatturazioni</strong>: tutte le altre fatture di vendita (riaddebiti, prodotti, servizi, vendite occasionali).
          <br /><br />
          Tutte le fatture emesse dal programma, animali e altre, seguono la stessa numerazione «FPR n/aa» usata in Aruba.
        </>
      }
      sezioni={[
        {
          pagina: "Fatturazione Animali Allevamento → Uscite da Fatturare", icon: "🔔",
          aCosaServe: "Avvisa chi fa le fatture che ci sono animali usciti da fatturare e li elenca. Sono i capi usciti per la macellazione che l'operatore ha completato nell'app Podere Verde (peso vivo, peso della carcassa, modello 4, numero di partita, cliente) e che l'app segna «pronto da fatturare».",
          comeSiUsa: [
            "Quando ci sono capi da fatturare compare un numero rosso nel menu, accanto a Emissione Fatture, a Fatturazione Animali Allevamento e a Uscite da Fatturare, e in cima a ogni pagina del programma una striscia rossa «Ci sono N capi usciti dall'allevamento da fatturare»: cliccandola si apre l'elenco.",
            "L'avviso si ricontrolla all'apertura del programma, a ogni cambio di pagina e ogni 5 minuti.",
            "I capi sono raggruppati per cliente e data di uscita, con i chili di carcassa e di peso vivo della consegna.",
            "Bordo verde «DATI COMPLETI»: la consegna si può fatturare. Bordo giallo «DATI DA COMPLETARE»: nella colonna «Da completare» è indicato cosa manca (peso della carcassa, modello 4, numero di partita, cliente, cliente non presente in anagrafica).",
            "«Aggiorna» rilegge i dati; «Esporta Excel» scarica l'elenco.",
          ],
          note: "Pagina in sola lettura: i dati mancanti si completano nell'app Podere Verde, non qui. Quando la fattura è emessa nel programma, i suoi capi non compaiono più tra quelli da fatturare e il numero rosso scende.",
        },
        {
          pagina: "Fatturazione Animali Allevamento → Prepara Fatture", icon: "🧾",
          aCosaServe: "Prepara una fattura per ogni cliente con i capi da fatturare, una riga per capo (matricola o lotto, modello 4, numero di partita, chili di carcassa, prezzo al kg, importo), e alla conferma scarica il file XML da caricare in Aruba Fatturazione Elettronica.",
          comeSiUsa: [
            "La prima volta aprire «Dati di Podere Verde in fattura», controllare i dati (ripresi dalla fattura FPR 8/26 emessa con Aruba) e salvarli. Finché non sono salvati le fatture non si possono emettere.",
            "Scegliere, se serve, il periodo dei capi usciti e la data delle fatture (di solito oggi).",
            "Ogni cliente ha la sua scheda. Numero: il programma propone il successivo all'ultima fattura che ha emesso; la prima volta va scritto il successivo all'ultima fattura emessa in Aruba nell'anno.",
            "Prezzo al kg per prodotto (bovino, suino, ovino): per i clienti abituali è già inserito l'ultimo prezzo applicato, ma va sempre confermato con «Confermi prezzo?»; per i clienti nuovi va inserito. Se si cambia un prezzo, la conferma va rifatta. Si può cambiare anche la descrizione in fattura (es. MEZZENA DI SCOTTONA).",
            "Se mancano dati del cliente necessari alla fattura elettronica (partita IVA, indirizzo, CAP, comune, provincia, codice destinatario o PEC) compare il modulo per completarli.",
            "Il pulsante «Conferma ed emetti» si attiva solo quando numero, prezzi confermati e dati sono a posto; altrimenti dice cosa manca. Alla conferma la fattura si registra nel programma e si scarica il file XML.",
            "In Aruba: «Carica fattura» → «Seleziona documenti» (oppure trascinare il file) → controllare → inviare allo SdI.",
            "Riquadro giallo «Cliente da assegnare»: i capi senza cliente o con un nome che non è in anagrafica. Scegliere il cliente dall'anagrafica (o crearlo con «+ nuovo cliente») e cliccare «Assegna»: il capo passa nella fattura di quel cliente. Il suggerimento indica l'ultimo cliente fatturato per lo stesso macello, ma non assegna nulla da solo. Se l'operatore aveva scritto un nome, il programma lo ricorda per le volte successive.",
            "Riquadro rosso: capi non fatturabili perché manca il peso della carcassa, il modello 4 o il numero di partita. Si completano nell'app.",
          ],
          note: "Il cliente assegnato, i prezzi confermati e le fatture si registrano solo nelle tabelle del programma: i dati dell'app non vengono mai modificati. Un capo si fattura una sola volta.",
        },
        {
          pagina: "Fatturazione Animali Allevamento → Fatture Emesse", icon: "📤",
          aCosaServe: "L'elenco delle fatture emesse dal programma, con le righe per capo, per riscaricare il file XML per Aruba o annullarne la registrazione.",
          comeSiUsa: [
            "Cliccare sul numero per vedere le righe della fattura.",
            "«XML per Aruba» riscarica il file di una fattura; spuntando più fatture, «Scarica per Aruba le selezionate» le mette in un unico .zip, che Aruba carica in un colpo solo.",
            "«Annulla registrazione» (con motivo obbligatorio) si usa solo se la fattura non è stata inviata con Aruba o è stata stornata con nota di credito: i capi tornano tra quelli da fatturare e il numero torna libero. Non cancella nulla: la fattura resta visibile tra le annullate.",
            "«Esporta Excel» scarica fatture e righe.",
          ],
          note: "Se la fattura è già stata inviata allo SdI, per stornarla serve una nota di credito emessa con Aruba.",
        },
        {
          pagina: "Altre Fatturazioni → Nuova Fattura", icon: "✍️",
          aCosaServe: "Prepara ed emette le fatture di vendita diverse dagli animali consegnati al macello: rifatturazione di costi sostenuti per conto di altri (es. concimi e sementi a Muratella), vendita di un equino, servizi, vendite occasionali. Le righe si scrivono a mano e ognuna ha la sua aliquota IVA.",
          comeSiUsa: [
            "1. Cliente: sceglierlo dall'elenco (si può cercare per nome o partita IVA), oppure crearlo con «+ Nuovo cliente». Se mancano dati necessari alla fattura elettronica (partita IVA o codice fiscale, indirizzo, CAP, comune, provincia, codice destinatario o PEC) sono indicati in rosso: si completano con «Modifica dati del cliente».",
            "2. Numero e data: il numero proposto è il successivo all'ultimo «FPR n/aa» dell'anno emesso dal programma o registrato in contabilità; va controllato con l'ultimo numero usato in Aruba. La nota interna resta nel programma e non va in fattura.",
            "3. Righe: per ogni riga descrizione, quantità, unità di misura (si può lasciare «nessuna»), prezzo unitario e aliquota IVA (22, 10, 5, 4 o 0). Con IVA 0 va scelta la natura dell'operazione (es. N4 esenti, N2.2 non soggette). L'importo si calcola da solo. «⧉» duplica una riga, «✕» la toglie, «+ Aggiungi riga» ne aggiunge una.",
            "«Riprendi le righe da una fattura precedente»: copia le righe di una fattura già emessa (dal programma o registrata in contabilità, es. la FPR 5/25 a Muratella) e, se noto, il cliente. Le righe copiate si possono poi modificare.",
            "4. Riepilogo: imponibile e IVA per aliquota e totale da pagare. Se gli importi senza IVA superano 77,47 € il programma suggerisce l'imposta di bollo virtuale di 2 €, che si può togliere o mettere con la spunta.",
            "Il pulsante di emissione compare solo quando tutto è a posto; altrimenti è indicato cosa manca. Chiede sempre conferma («Confermi l'emissione…?»). Alla conferma la fattura si registra nel programma e si scarica il file XML.",
            "In Aruba: «Carica fattura» → selezionare il file → controllare l'anteprima → inviare allo SdI.",
          ],
          note: "I dati di Podere Verde in fattura (intestazione, banca, IBAN) sono gli stessi delle fatture degli animali e si controllano dal riquadro in cima alla pagina.",
        },
        {
          pagina: "Altre Fatturazioni → Fatture Emesse", icon: "📤",
          aCosaServe: "L'elenco delle fatture libere emesse dal programma, con le righe, per riscaricare il file XML per Aruba o annullarne la registrazione.",
          comeSiUsa: [
            "Cliccare sul numero per vedere le righe (quantità, unità di misura, prezzo, aliquota IVA e natura, importo).",
            "«XML per Aruba» riscarica il file; spuntando più fatture si scarica un unico .zip.",
            "«Annulla registrazione» (con motivo obbligatorio) solo se la fattura non è stata inviata con Aruba o è stata stornata con nota di credito: il numero torna libero e la fattura resta visibile tra le annullate.",
            "«Esporta Excel» scarica fatture e righe.",
          ],
          note: "Se la fattura è già stata inviata allo SdI, per stornarla serve una nota di credito emessa con Aruba.",
        },
        {
          pagina: "Fatture da Ricevere e da Emettere → Rapporti con Muratella", icon: "🗂️",
          aCosaServe: "Raccoglie, anno per anno, le fatture che Podere deve ricevere da Muratella e quelle che deve emetterle, decise l'8 ottobre 2026 per rispettare i principi contabili. Da ricevere: i costi dei campi di Podere pagati da Muratella dal 2021 (gasolio, manutenzione delle macchine agricole, concimi, diserbanti, diserbo, semina, seme, reti). Da emettere: l'orzo raccolto da Podere che Muratella ha venduto alla Cooperativa Ceri (2025 e 2026), che Podere ricompra come farina.",
          comeSiUsa: [
            "In cima c'è la decisione spiegata per esteso: è il testo da dare al commercialista, che lo ritrova anche nell'Excel («Esporta in Excel per il commercialista»: nota, riepilogo per anno, righe da ricevere, righe da emettere).",
            "Il riepilogo per anno mostra quanto entra nei costi di Podere: le fatture da ricevere in più, l'orzo in meno nei Mangimi. Sono gli stessi importi che il Report Costi segnala nel riquadro arancione dell'anno.",
            "Ogni documento di competenza («DA RICEVERE MURATELLA 2021», «DA EMETTERE MURATELLA 2025»…) ha le sue righe: ogni riga riporta la fattura originale pagata da Muratella (fornitore, numero, data) con la stessa classificazione delle fatture di Podere.",
            "Stato arancione «da ricevere» / «da emettere»: la fattura vera non c'è ancora. Quando la fattura vera è registrata in contabilità (acquisto caricato in «Carica Fatture»; vendita emessa con Aruba o con «Altre Fatturazioni» e poi registrata in «Carica Fatture Attive»), la si sceglie nella tendina del documento e si clicca «Collega»: lo stato diventa verde «regolarizzato».",
            "Una fattura d'acquisto vera collegata NON si conta nei costi: il costo è già contato dal documento di competenza nell'anno giusto (es. il gasolio del 2022 resta nel 2022 anche se Muratella lo fattura nel 2026). Per questo le fatture di Muratella arrivate dopo l'8 ottobre 2026 e non ancora collegate sono elencate in rosso: vanno collegate, altrimenti il costo si conta due volte.",
            "Dopo ogni collegamento o modifica, gli anni interessati vanno ricalcolati (il programma lo segnala con l'avviso arancione «Occorre ricalcolare i costi»).",
          ],
          note: "Il 2019 e il 2020 non hanno documenti: in quegli anni Muratella fatturava a Podere le lavorazioni, le semine, il seme e il fieno, quindi i suoi costi erano già nel prezzo. Il 2026 contiene i costi di Muratella registrati fino al 22/04/2026: quelli successivi vanno aggiunti quando si caricano le sue fatture.",
        },
      ]}
    />
  );
}
