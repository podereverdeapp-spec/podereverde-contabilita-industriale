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
            "Le viste \"Storico\" (Generale/Bovini/Suini/Ovini) confrontano l'anno scelto con i 3 precedenti più la media, gestendo i propri 4 anni in autonomia.",
            "I costi con Destinazione \"Cavalli\", \"Pollame\" o Area \"Orto\" appaiono in un riquadro rosso a parte — non vengono mai ripartiti sulle 3 specie d'allevamento, sono mostrati solo per confronto.",
            "Dopo il calcolo, il sistema salva i dati per ogni animale in `ci_costo_animale_annuale` — è il passaggio che rende poi disponibili i costi nella Scheda Animale e nella tab Costi di podereverdeapp.it.",
            "IMPORTANTE — ordine corretto: calcola sempre prima questo report, e solo dopo Report Riproduttori per lo stesso anno (che aggiorna i dati già salvati qui).",
            "Animali da macello morti (o predati, smarriti): il loro costo lo pagano i capi rimasti della stessa specie, perché i costi si dividono solo tra gli animali produttivi. Questo vale per TUTTI gli anni di vita dell'animale morto, non solo per l'anno della morte: per questo nella sua scheda il costo è 0 in ogni anno (c'è scritto «costo dell'anno spalmato sugli altri capi»), così il suo costo non è contato due volte e non resta fermo su un animale che non verrà mai venduto. Esempio: un vitello nato nel 2024 e morto nel 2025 costa 0 nel 2024 e nel 2025; il suo costo di quei due anni l'hanno pagato gli altri bovini, anno per anno.",
            "Chi è riproduttore: un animale segnato «riproduttore» nell'app OPPURE che risulta padre o madre di un nato o di un lotto di suinetti nati in azienda (regola del 05/10/2026: se si segna un parto, il padre e la madre diventano riproduttori). Il Report Costi li conta come riproduttori, non come animali da ingrasso; il loro costo va poi alla mandria con il Report Riproduttori.",
            "Animali trasferiti (riproduttori e da ingrasso): non sono mai trattati come morti, perché un trasferimento è uno scambio o una vendita, cioè porta un ricavo. Se c'è una fattura attiva con la matricola dell'animale, il ricavo è l'incasso della fattura; se non c'è, è considerato uno scambio ed è evidenziato in arancione (vedi Animali → Report Riproduttori, punto 10).",
            "Riproduttori morti, scambiati o trasferiti: la morte è registrata (ricavo zero), ma il loro costo non si spalma sugli altri capi come quello di un animale da ingrasso morto. Il loro costo resta loro in tutti gli anni, anche nell'anno della morte o dell'uscita, ed entra nel costo della mandria, cioè lo pagano i nati (vedi Animali → Report Riproduttori). La morte di un toro o di una vacca è un costo della linea vacca-vitello, non degli animali da ingrasso. Esempio: un toro comprato a 6.000 € muore dopo due anni di monta; il suo mantenimento di quei due anni e la parte di costo non ancora passata ai figli vanno sui vitelli (anche su quelli nati dopo la sua morte, concepiti quando era vivo), non sui vitelloni da ingrasso.",
            "Costo del lavoro: si divide tra allevamento, coltivazioni, lavorazione delle carni e orto secondo le percentuali dell'anno scritte in Parametri («Ripartizione del costo del lavoro»). Anno senza percentuali = tutto all'allevamento.",
          ],
        },
        {
          pagina: "Prezzo di Pareggio", icon: "🎯",
          aCosaServe: "Per ogni specie e anno, quanto è costato in media un kg di carcassa degli animali da macello usciti (macellati o venduti, con il peso della carcassa): è il prezzo di pareggio, sotto il quale si perde. Mostra da cosa è fatto il costo e cosa succede al prezzo di vendita scelto.",
          comeSiUsa: [
            "Scegli l'anno. Per ogni specie compaiono: numero di capi usciti, prezzo di pareggio al kg di carcassa, costo medio per capo diviso in acquisto, nascita, mantenimento e costo rimasto di riproduttori usciti, peso medio della carcassa.",
            "Il prezzo di vendita è proposto dalla media dei prezzi scritti nelle schede degli animali; si può cambiare per fare prove. Il programma mostra ricavo, guadagno o perdita totale e per capo, e il costo massimo per capo per andare in pari.",
            "Se si è in perdita, il riquadro «Fertilità della mandria» dice quanti nati sarebbero serviti quell'anno, a parità di costo della mandria, per recuperare la differenza solo con il costo di nascita; se non basta, lo dice.",
            "Il costo di ogni animale è lo stesso del Riepilogo Costo Animali e delle schede (un solo calcolo in tutto il programma).",
          ],
        },
        {
          pagina: "Cespiti", icon: "🏗️",
          aCosaServe: "Gestione dei beni ammortizzabili (macchinari, costruzioni, veicoli, ecc.) — un cespite si crea automaticamente quando classifichi una riga fattura come \"Ammortamenti\" in Carica Fatture. Due viste: Gestione (elenco e modifica) e Report (riepiloghi e piano futuro).",
          comeSiUsa: [
            "In Gestione, i cespiti sono raggruppati per categoria, con una fascia colorata che mostra il valore storico complessivo, la quota dell'anno corrente e il fondo ammortamento accumulato per quella categoria.",
            "Clicca su un cespite per espanderlo e vedere il piano di ammortamento completo, anno per anno.",
            "Puoi modificare categoria, imputazione, coefficiente, data e fornitore di un cespite, o eliminarlo (con conferma) se inserito per errore.",
            "Le imputazioni Nessuno/Cavalli/Pollame/Orto sono evidenziate in rosso con l'etichetta \"non imputabile in allevamento\" — quei cespiti non vengono mai ripartiti sulle specie d'allevamento.",
            "In Report trovi il riepilogo generale, la scomposizione per Categoria e per Imputazione, e il piano di ammortamento atteso per i prossimi 5 anni.",
          ],
          note: "Se sospetti dei cespiti duplicati (es. dopo un ricaricamento fatture), esiste una query diagnostica per trovarli — chiedila se serve.",
        },
      ]}
    />
  );
}
