import PaginaIstruzioni from "./PaginaIstruzioni";

// Istruzioni della cartella Modelli 4.
export default function IstruzioniModelli4() {
  return (
    <PaginaIstruzioni
      titolo="Modelli 4"
      introduzione={
        <>
          Il modello 4 è il documento di accompagnamento degli animali (Banca Dati Nazionale): si fa ogni volta che un animale esce dall'azienda, per il macello o per un altro allevamento, oppure vi entra. Questa sezione permette di ritrovare subito ogni modello 4, aprire il PDF originale e vedere quali capi conteneva.
          <br /><br />
          I modelli 4 vengono dall'archivio tenuto dall'app Podere Verde, che si aggiorna da solo ogni ora leggendo le mail di Stefano Cortesi. La sezione è di sola consultazione: non modifica nulla né nell'archivio né nel programma.
          <br /><br />
          La sezione riguarda solo Podere Verde: le entrate di animali in azienda (oggi le vitelle arrivate dalla Società Agricola Aurelia) e le uscite dall'azienda, per il macello o per un altro allevamento. I modelli 4 in cui Podere Verde non compare, come le uscite di Aurelia verso il macello, non sono mostrati.
        </>
      }
      sezioni={[
        {
          pagina: "Elenco dei Modelli 4", icon: "📑",
          aCosaServe: "Tutti i modelli 4 di Podere Verde dal 2021 a oggi, in entrata e in uscita: data del movimento, numero del documento con il codice di controllo, specie, numero di capi, destinazione (macello o allevamento), trasportatore. Per ogni documento si apre il PDF originale e si vedono i capi: matricola per bovini, ovini e caprini; marchio aziendale e numero dell'insieme per suini e agnelli.",
          comeSiUsa: [
            "All'apertura si vedono entrate e uscite di Podere Verde, ognuna con l'etichetta ENTRATA (verde) o USCITA (rossa); con il primo filtro si vedono solo le uscite o solo le entrate.",
            "Filtrare per anno, specie e destinazione (macello o allevamento), oppure cercare una matricola, un numero di documento, un macello o un trasportatore.",
            "In alto: quanti documenti e quanti capi per specie risultano con i filtri scelti.",
            "Cliccare su una riga per vedere i capi del documento.",
            "«Apri il PDF» apre il modello 4 originale in una nuova scheda; «mail» apre la mail con cui è arrivato.",
            "«Esporta Excel» scarica due fogli: i documenti mostrati e i loro capi.",
          ],
          note: "Ogni specie ha la sua numerazione, quindi lo stesso numero può esistere per bovini e per suini: un documento si riconosce da numero e codice di controllo. Quattro numeri risultano emessi due volte con codice di controllo diverso (probabile annullamento e riemissione): sono segnalati con ⚠️ e prima di contarli bisogna stabilire quale versione è valida.",
        },
        {
          pagina: "Altri documenti di Stefano Cortesi", icon: "🗂️",
          aCosaServe: "I PDF arrivati per mail da Stefano Cortesi che non sono modelli 4: registri di stalla, certificati, attestati di razza, censimenti, fatture e altro.",
          comeSiUsa: [
            "Scegliere il tipo di documento oppure vederli tutti.",
            "«Apri la mail» apre la mail in Gmail con il PDF allegato (bisogna essere collegati con l'account filippobizz4@gmail.com).",
          ],
          note: "Questo elenco è fisso: va aggiornato quando arrivano nuovi documenti di questo tipo.",
        },
      ]}
    />
  );
}
