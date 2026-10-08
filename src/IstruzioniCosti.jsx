import PaginaIstruzioni from "./PaginaIstruzioni";

export default function IstruzioniCosti() {
  return (
    <PaginaIstruzioni
      titolo="Costi"
      introduzione="I report che ripartiscono tutti i costi aziendali tra le specie di allevamento, a diversi livelli di dettaglio, e la gestione dei cespiti (beni ammortizzabili) che generano quote di costo pluriennali."
      sezioni={[
        {
          pagina: "Report Costi", icon: "📊",
          aCosaServe: "Il report principale della contabilità industriale — calcola quanto costa mantenere ogni specie (Bovini/Suini/Ovini), ripartendo i costi diretti e quelli generali in base alle UBA-giorni di ciascuna specie. Ha più livelli di dettaglio, selezionabili con i pulsanti in alto.",
          comeSiUsa: [
            "Scegli l'anno in alto (condiviso tra i primi tre livelli), poi naviga tra le viste: Aggregato (un unico tasso per tutta l'azienda), Per Area (una riga per Area di spesa), Per Area e Centro di Costo (drill-down più fine).",
            "Le viste «Storico» (Generale/Bovini/Suini/Ovini) confrontano l'anno scelto con i 3 precedenti. Si aprono sull'ultimo anno completo. La media usa solo gli anni interi calcolati: un anno che non si riesce a calcolare compare in rosso come «non calcolato», un anno senza costi caricati come «nessun dato», l'anno in corso si vede ma non entra nella media. Gli importi sono la media semplice; il costo per giorno di presenza pesato è la media pesata (totale costi ÷ totale giorni pesati). Il riquadro «Come sono calcolate le medie» mostra i conti con i numeri.",
            "Riquadro rosso «Esclusi dal costo degli animali» (in tutte le viste, con la stessa regola): spese di macello e lavorazione delle carni (area «Lavorazioni prodotti allevamento», compresi i prodotti per la rivendita, e la parte di lavoro per la lavorazione delle carni — le paga la società del gruppo che riceve le carcasse), costi di Cavalli, Pollame e Orto, animali non d'allevamento, ammortamenti senza imputazione o intestati a Orto, Cavalli, Pollame, e cespiti con imputazione da correggere. Non entrano MAI nel costo di bovini, suini e ovini.",
            "Aggregato, tabella «Allocazione per specie»: per ogni specie costi diretti + quota dei costi generali + quote delle spese intestate a due specie (es. «Bovini e Ovini», divise solo tra quelle due in proporzione ai giorni pesati) = totale allocato. Un cespite intestato a due specie si divide allo stesso modo; a tre specie o «Generale» va tra i generali.",
            "Giorni di presenza: si contano sulle sole date, dal giorno di inizio al giorno di fine compresi (un animale presente tutto il 2025 = 365 giorni).",
            "Quando dopo un calcolo salvato cambiano dati che entrano nei costi (fatture, cespiti, quote, animali…), in cima al programma compare l'avviso arancione «Occorre ricalcolare i costi» con gli anni da rifare; il riquadro «Stato dei calcoli salvati» dice per ogni anno quando è stato salvato e se è aggiornato.",
            "Dopo il calcolo, il sistema salva i dati per ogni animale in `ci_costo_animale_annuale` — è il passaggio che rende poi disponibili i costi nella Scheda Animale e nella tab Costi di podereverdeapp.it.",
            "IMPORTANTE — ordine corretto: calcola sempre prima questo report, e solo dopo Report Riproduttori per lo stesso anno (che aggiorna i dati già salvati qui).",
            "Animali da macello morti (o predati, smarriti): il loro costo lo pagano i capi rimasti della stessa specie, perché i costi si dividono solo tra gli animali produttivi. Questo vale per TUTTI gli anni di vita dell'animale morto, non solo per l'anno della morte: per questo nella sua scheda il costo è 0 in ogni anno (c'è scritto «costo dell'anno spalmato sugli altri capi»), così il suo costo non è contato due volte e non resta fermo su un animale che non verrà mai venduto. Esempio: un vitello nato nel 2024 e morto nel 2025 costa 0 nel 2024 e nel 2025; il suo costo di quei due anni l'hanno pagato gli altri bovini, anno per anno.",
            "Chi è riproduttore: un animale segnato «riproduttore» nell'app OPPURE che risulta padre o madre di un nato o di un lotto di suinetti nati in azienda (regola del 05/10/2026: se si segna un parto, il padre e la madre diventano riproduttori). Il Report Costi li conta come riproduttori, non come animali da ingrasso; il loro costo va poi alla mandria con il Report Riproduttori.",
            "Animali trasferiti (riproduttori e da ingrasso): non sono mai trattati come morti, perché un trasferimento è uno scambio o una vendita, cioè porta un ricavo. Se c'è una fattura attiva con la matricola dell'animale, il ricavo è l'incasso della fattura; se non c'è, è considerato uno scambio ed è evidenziato in arancione (vedi Animali → Report Riproduttori, punto 10).",
            "Riproduttori morti, scambiati o trasferiti: la morte è registrata (ricavo zero), ma il loro costo non si spalma sugli altri capi come quello di un animale da ingrasso morto. Il loro costo resta loro in tutti gli anni, anche nell'anno della morte o dell'uscita, ed entra nel costo della mandria, cioè lo pagano i nati (vedi Animali → Report Riproduttori). La morte di un toro o di una vacca è un costo della linea vacca-vitello, non degli animali da ingrasso. Esempio: un toro comprato a 6.000 € muore dopo due anni di monta; il suo mantenimento di quei due anni e la parte di costo non ancora passata ai figli vanno sui vitelli (anche su quelli nati dopo la sua morte, concepiti quando era vivo), non sui vitelloni da ingrasso.",
            "Costo del lavoro: si divide tra allevamento, coltivazioni, lavorazione delle carni e orto secondo le percentuali dell'anno scritte in Parametri («Ripartizione del costo del lavoro»). Anno senza percentuali = tutto all'allevamento. La parte per la lavorazione delle carni e quella per l'orto restano fuori dal costo degli animali.",
            "Fatture da ricevere e da emettere (rapporti con Muratella, decisione dell'8/10/2026): i costi dei campi di Podere pagati da Muratella dal 2021 entrano nei costi di Podere nell'anno della fattura originale, come «fatture da ricevere»; l'orzo raccolto da Podere e venduto da Muratella alla Cooperativa Ceri entra in meno nei Mangimi nell'anno del conferimento, come «fattura da emettere», perché torna in azienda come farina comprata. Così l'orzo non si conta due volte e il costo per UBA e al chilo è giusto anno per anno. Nel riepilogo dell'anno un riquadro arancione dice quanto pesano; l'elenco riga per riga è in Emissione Fatture → Fatture da Ricevere e da Emettere. Le pagine di Alimentaria (Costi e Quantità) restano sui prezzi d'acquisto veri della farina, che servono per i confronti di mercato.",
          ],
        },
        {
          pagina: "Prezzo di Pareggio", icon: "🎯",
          aCosaServe: "Per ogni specie e anno, quanto è costato in media un kg di carcassa degli animali da macello usciti (macellati o venduti, con il peso della carcassa): è il prezzo di pareggio, sotto il quale si perde. Mostra da cosa è fatto il costo e cosa succede al prezzo di vendita scelto.",
          comeSiUsa: [
            "Scegli l'anno. Per ogni specie compaiono: numero di capi usciti, prezzo di pareggio al kg di carcassa, costo medio per capo diviso in acquisto, nascita, mantenimento e costo rimasto di riproduttori usciti, peso medio della carcassa.",
            "Il prezzo di vendita è proposto dalla media dei prezzi scritti nelle schede degli animali di quell'anno (pesata sui chili) e si aggiorna cambiando anno. Se lo scrivete a mano (casella con il bordo blu) resta anche cambiando anno, per fare prove; «Torna al prezzo registrato» lo riporta al prezzo dell'anno guardato. Il programma mostra ricavo, guadagno o perdita totale e per capo, e il costo massimo per capo per andare in pari.",
            "I capi usciti senza costi salvati (Report Costi del loro anno non ancora salvato) restano fuori dal calcolo, costo e chili, e sono elencati in un avviso arancione: salvare il Report Costi del loro anno e poi rifare il Report Riproduttori.",
            "Se si è in perdita, il riquadro «Fertilità della mandria» dice quanti nati sarebbero serviti quell'anno, a parità di costo della mandria, per recuperare la differenza solo con il costo di nascita; se non basta, lo dice.",
            "Il costo di ogni animale è lo stesso del Riepilogo Costo Animali e delle schede (un solo calcolo in tutto il programma).",
          ],
        },
        {
          pagina: "Break Even sulla carcassa · Break Even sul capo vivo · Riepilogo Costi (Break Even)", icon: "⚖️",
          aCosaServe: "Servono a simulare: scritto un prezzo di vendita (al kg di carcassa o al kg vivo), dicono sui costi reali quanti capi bisogna macellare ogni anno e quanti tenerne in stalla per andare in pari, qual è il prezzo minimo con i capi che si vendono davvero e di cosa è fatto il costo di un chilo. Il Riepilogo dice quanto è costato produrre un chilo di carcassa in un anno.",
          comeSiUsa: [
            "Tutte le spiegazioni sono nella pagina «Istruzioni del Break Even» (voce in questa cartella, oppure pulsante «📖 Istruzioni del Break Even» in cima alle tre pagine).",
          ],
        },
        {
          pagina: "Cespiti", icon: "🏗️",
          aCosaServe: "Gestione dei beni ammortizzabili (macchinari, costruzioni, veicoli, ecc.) — un cespite si crea automaticamente quando classifichi una riga fattura come \"Ammortamenti\" in Carica Fatture. Due viste: Gestione (elenco e modifica) e Report (riepiloghi e piano futuro).",
          comeSiUsa: [
            "In Gestione, i cespiti sono raggruppati per categoria, con una fascia colorata che mostra il valore storico complessivo, la quota dell'anno corrente e il fondo ammortamento accumulato per quella categoria.",
            "Clicca su un cespite per espanderlo e vedere il piano di ammortamento completo, anno per anno.",
            "Puoi modificare categoria, imputazione, coefficiente, data e fornitore di un cespite, o eliminarlo (con conferma) se inserito per errore.",
            "Coefficiente di ammortamento: si scrive in percentuale (anche con i decimali, es. 7,5) e si salva esatto. La quota di ogni anno è prezzo × coefficiente, l'ultimo anno riceve quello che resta (es. 2.000 € al 15%: sei anni da 300 € e un settimo da 200 €). Senza coefficiente la quota è prezzo ÷ anni, con i centesimi nell'ultimo anno. Il totale torna sempre esattamente al prezzo pagato, mai quote negative.",
            "Se cambiate il coefficiente (o la durata) o la data di acquisto di un cespite che ha già quote, il programma lo dice prima di salvare e rifà le quote di TUTTI gli anni, come se il valore nuovo ci fosse stato dall'inizio; gli anni toccati vanno poi ricalcolati (Report Costi). «Genera Quote» fa lo stesso per i cespiti che trova con quote diverse dal loro piano, dopo averli elencati e chiesto conferma.",
            "Le imputazioni Nessuno/Cavalli/Pollame/Orto sono evidenziate in rosso con l'etichetta \"non imputabile in allevamento\" — quei cespiti non vengono mai ripartiti sulle specie d'allevamento.",
            "In Report trovi il riepilogo generale, la scomposizione per Categoria e per Imputazione, e il piano di ammortamento atteso per i prossimi 5 anni.",
          ],
          note: "Se sospetti dei cespiti duplicati (es. dopo un ricaricamento fatture), esiste una query diagnostica per trovarli — chiedila se serve.",
        },
      ]}
    />
  );
}
