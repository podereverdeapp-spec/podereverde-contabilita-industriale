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
