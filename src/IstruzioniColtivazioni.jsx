import PaginaIstruzioni from "./PaginaIstruzioni";

// Istruzioni della cartella Coltivazioni. L'introduzione è su più paragrafi: uso solo
// elementi ammessi dentro un paragrafo (testo, <strong>, <br />), così il componente
// condiviso PaginaIstruzioni resta invariato.
export default function IstruzioniColtivazioni() {
  return (
    <PaginaIstruzioni
      titolo="Coltivazioni"
      introduzione={
        <>
          Questa sezione è fatta per chi sta sul trattore, ed è anche una fonte importante per tutta la squadra aziendale. Serve a controllare quanto costa coltivare e a capire se conviene produrre in azienda oppure comprare.
          <br /><br />
          Per ogni campagna agraria (dal 1° settembre al 31 agosto), per ogni campo e per ogni coltura mostra quanto è costato: semi, concimi, fitosanitari, lavorazioni fatte da terzi e lavorazioni fatte con i mezzi dell'azienda, reti, film e altre spese. Poi mostra quanto si è raccolto e quanto costa ogni prodotto: fieno, granella, sementi, paglia.
          <br /><br />
          Il costo del prodotto fatto in azienda si mette accanto a quanto costa lo stesso prodotto comprato fuori. Così si vede, campo per campo e anno per anno, dove produrre in proprio conviene e dove no. Sono informazioni che servono a chi lavora i campi, a chi governa gli animali e a chi decide cosa seminare, cosa comprare e cosa vendere.
          <br /><br />
          La sezione è un'isola dentro il programma di contabilità industriale:
          <br />• <strong>riceve</strong> dal programma le fatture connesse alla coltivazione e i prezzi del prodotto acquistato;
          <br />• <strong>legge</strong> i lavori registrati nella sezione Coltivazione dell'app Podere Verde: semine, lavorazioni, concimazioni, raccolte;
          <br />• <strong>non manda niente</strong> al programma: i costi degli animali, i report e le fatture restano esattamente come sono;
          <br />• <strong>non modifica niente</strong>: qui si consulta soltanto; i lavori si registrano nell'app Podere Verde.
          <br /><br />
          Il Programma di semina e concimazione è un piano per la campagna che viene. Non è un costo e in questa sezione non viene mai sommato.
        </>
      }
      sezioni={[
        {
          pagina: "Fatture Coltivazione → Elenco Fatture", icon: "📋",
          aCosaServe: "Tutte le fatture di coltivazione di Podere Verde e di Muratella S.r.l., lette in automatico dal programma: ogni riga di fattura con Area Coltivazione (sementi, concimi e fitosanitari, lavoro contoterzi, reti e film, gasolio, manutenzione delle macchine agricole). Le fatture di Muratella hanno sempre l'etichetta rossa MURATELLA S.r.l.",
          comeSiUsa: [
            "Scegliere il periodo: campagna agraria (dal 1° settembre al 31 agosto) oppure anno solare.",
            "Filtrare, se serve, per società, centro di costo o fornitore, oppure cercare una parola (es. gasolio, rete, orzo).",
            "In alto: il totale del periodo diviso tra Podere Verde e Muratella, e un riquadro per ogni centro di costo.",
            "Cliccare su una fattura per vedere le sue righe: descrizione, quantità, prezzo, imponibile, aliquota, centro di costo e destinazione.",
            "«Mista» vuol dire che la fattura contiene anche righe di altre aree, che qui non si mostrano.",
            "«Esporta Excel» scarica le righe mostrate e i totali per centro di costo.",
          ],
          note: "Pagina in sola lettura: per correggere una fattura si usa il programma (Carica Fatture, Fatture Passive o Contabilità Muratella); qui la modifica compare da sola.",
        },
        {
          pagina: "Fatture Coltivazione → Riepilogo per Anno e Centro di Costo", icon: "📊",
          aCosaServe: "Quanto si è speso per la coltivazione, anno per anno (o campagna per campagna), per ogni centro di costo, con la parte di Podere Verde e quella di Muratella S.r.l. sempre distinte.",
          comeSiUsa: [
            "Scegliere se avere in colonna gli anni solari o le campagne agrarie.",
            "Per ogni centro di costo: la riga del totale e, sotto, Podere Verde e Muratella S.r.l.",
            "In fondo: totale di Podere Verde, totale di Muratella e totale generale.",
            "Le righe rosse sono centri di costo insoliti per la coltivazione: si mostrano come sono nel programma.",
            "«Esporta Excel» scarica la tabella.",
          ],
        },
        {
          pagina: "Campi e Stagioni → Schede Campi", icon: "🗺️",
          aCosaServe: "Le schede campo registrate nell'app Podere Verde: per ogni campagna, campo e coltura i lavori fatti (semine, concimi, lavorazioni, raccolte), i costi divisi per voce e il raccolto, con il costo per unità e la resa per ettaro.",
          comeSiUsa: [
            "Scegliere la campagna; si può cercare un campo, una coltura o un prodotto.",
            "In alto i totali della campagna: costo totale, seme, concimi e fitosanitari, lavorazioni e altro.",
            "Cliccare su una riga per vedere i lavori e l'elenco delle voci di costo della coltura: tipo, descrizione, fornitore, documento, data, quantità, prezzo e importo.",
            "Quando un campo è diviso tra due colture, gli ettari sono quelli della coltura; sotto, in piccolo, quelli del campo.",
            "La resa è nell'unità del raccolto (balloni, rotoballe o quintali) per ettaro.",
            "«Esporta Excel» scarica le schede della campagna e le voci di costo.",
          ],
        },
        {
          pagina: "Campi e Stagioni → Rese e Costi per Stagione", icon: "📈",
          aCosaServe: "Quanto è costato ogni prodotto raccolto e quanto sarebbe costato comprarlo. Il costo di ogni coltura si divide tra i suoi prodotti (paglia e seme compresi) in proporzione al valore di mercato, con le stesse regole dei report dell'app. Balloni e rotoballe pesano 340 chilogrammi.",
          comeSiUsa: [
            "In alto il riepilogo di tutte le campagne: ettari, costi per voce, costo per ettaro, valore di mercato dei prodotti e saldo contro il mercato. Cliccare su una campagna per aprirla.",
            "Per la campagna scelta, ogni prodotto raccolto: quantità, quintali, resa in quintali per ettaro accanto alla resa di riferimento, costo attribuito, costo per unità e costo al quintale accanto al prezzo di mercato al quintale.",
            "Verde: produrre è costato meno che comprare. Rosso: è costato di più.",
            "Sotto: i pascoli (costo senza raccolta), i prezzi di mercato e le rese di riferimento con la loro fonte.",
            "«Esporta Excel» scarica il riepilogo delle campagne e i dati della campagna scelta.",
          ],
          note: "Prezzi di mercato e rese di riferimento si gestiscono nell'app Podere Verde: qui si consultano soltanto.",
        },
        {
          pagina: "Campi e Stagioni → Grafici", icon: "📊",
          aCosaServe: "I costi delle coltivazioni in grafico, campagna per campagna, con gli stessi dati di «Rese e Costi per Stagione»: il costo per ettaro dell'azienda diviso per voce, il costo per ettaro di ogni coltura e il costo unitario dei prodotti contro il prezzo di mercato.",
          comeSiUsa: [
            "Grafico 1: una colonna per campagna, divisa tra semi, concimi e fitosanitari, lavorazioni e altro; sopra, il totale per ettaro.",
            "Grafico 2: per ogni campagna una barra per coltura, ogni coltura sempre con lo stesso colore. Cliccando su un nome della legenda la coltura si nasconde o si mostra.",
            "Costo unitario dei prodotti: la barra è il costo al quintale del prodotto fatto in azienda, il trattino nero il prezzo di mercato al quintale. Numero rosso = produrre è costato più che comprare; verde = meno. I prodotti sono divisi per famiglia (fieni e paglia, granelle, sementi, altri).",
            "Passare il mouse su una barra per leggere i dettagli (ettari, quintali, costo per ballone). Sotto ogni grafico, «Tabella dei numeri».",
            "La campagna 2022/2023 compare vuota finché non viene caricata; la campagna in corso non compare finché non ha costi.",
          ],
        },
        {
          pagina: "Campi e Stagioni → Piano della Campagna", icon: "🗓️",
          aCosaServe: "Il programma di semina e concimazione approvato nell'app: per ogni campo la coltura prevista, i semi e i concimi con la dose per ettaro, la quantità e il costo previsti, e la lista di cosa acquistare.",
          comeSiUsa: [
            "Scegliere la campagna (compaiono solo quelle con un programma).",
            "«Da acquistare» somma i semi e i concimi di tutti i campi.",
            "«Esporta Excel» scarica il piano e la lista da acquistare.",
          ],
          note: "È un piano: non è un costo e non viene mai sommato ai costi di coltivazione.",
        },
        {
          pagina: "Campi e Stagioni → Archivio dei Report", icon: "🗄️",
          aCosaServe: "I report sulle coltivazioni preparati dall'app Podere Verde, con versione, data e stato: «corrente» = da usare; «non aggiornato» = precedente alle correzioni, i numeri non vanno usati; «superato» = sostituito da una versione più recente.",
          comeSiUsa: [
            "Per ogni report: titolo, file, versione, data, campagne, descrizione, note e fonti.",
            "«Scarica Excel» ricrea il file con i dati archiviati.",
            "Spuntare «Mostra anche le versioni superate» per vedere lo storico.",
          ],
          note: "Per i numeri sempre aggiornati si usano Schede Campi e Rese e Costi per Stagione, che leggono i dati dell'app in tempo reale.",
        },
      ]}
    />
  );
}
