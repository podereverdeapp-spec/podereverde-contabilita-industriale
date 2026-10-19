import PaginaIstruzioni from "./PaginaIstruzioni";

// Versione 241 (09/10/2026) — Istruzioni della cartella «Controllo Prezzi di Acquisto», voluta dal Dott. Bizzarri
// per la rilevanza dei prezzi sul bilancio. Le tre sezioni vengono dalle Istruzioni della cartella Ricerca, invariate.
export default function IstruzioniPrezziAcquisto() {
  return (
    <PaginaIstruzioni
      titolo="Controllo Prezzi di Acquisto"
      introduzione={
        <>
          Questa cartella serve a tenere sotto controllo quanto paghiamo ciò che compriamo: avvisa quando un prezzo cambia da una fattura all'altra, dice quanto vale in un anno, mostra la storia dei prezzi di ogni prodotto e suggerisce cosa fare.
          <br /><br />
          Le tre pagine si usano una dopo l'altra: «Attenzione Variazione Prezzi» segnala il rincaro; «Articoli &amp; Prezzi» mostra le singole righe delle fatture di quel prodotto; «Famiglie di Prodotto» decide quali descrizioni di fattura sono lo stesso prodotto, cioè il raggruppamento su cui lavora l'avviso.
          <br /><br />
          Attenzione: «Articoli &amp; Prezzi» permette anche di MODIFICARE la classificazione delle righe, e queste modifiche cambiano i costi. Ogni modifica resta scritta nel «Registro delle Modifiche» (cartella «Controlli»).
        </>
      }
      sezioni={[
        {
          // Versione 240
          pagina: "Attenzione Variazione Prezzi", icon: "⚠️",
          aCosaServe: "Avvisare quando un prodotto comprato costa di più (o di meno) rispetto alla fattura precedente, dire quanto vale la differenza in un anno, indicare cause possibili e cosa fare: cambiare fornitore, trattare, confrontare con il mercato, cercare fornitori nuovi. Si ricalcola da solo a ogni apertura con le fatture caricate.",
          comeSiUsa: [
            "In alto la sintesi: quanto costano in un anno i rincari, le opportunità di risparmio, i ribassi e quante righe vanno sistemate.",
            "«Prezzi aumentati, in ordine di gravità»: ogni riga è una famiglia di prodotto, con il prezzo della fattura precedente e dell'ultima, la variazione e quanto vale in un anno con le quantità comprate negli ultimi 12 mesi.",
            "Cliccando su un prodotto si aprono il grafico del prezzo nel tempo (un colore per fornitore, con il prezzo di mercato quando c'è), i problemi e i consigli, le ultime fatture e il testo di ricerca.",
            "«📋 Copia il testo di ricerca» copia un testo già compilato con prodotto, quantità, prezzo e fornitore: si incolla in un'intelligenza artificiale che sa cercare in internet per trovare fornitori e prezzi alternativi.",
            "«Opportunità di risparmio»: prodotti per cui un altro fornitore o il mercato costano meno di quanto paghiamo oggi.",
            "«Da sistemare»: righe di fattura con un prezzo che non torna (di solito la quantità scritta «1»), righe senza unità di misura e descrizioni nuove da assegnare a una famiglia.",
          ],
          titoloSpiegazione: "Come si confrontano i prezzi",
          spiegazione: [{
            titolo: "Un'unità di misura unica",
            testo: "Ogni riga si converte in € al kg (o al litro) con le regole di conversione del programma o con l'unità scritta in fattura, poi si mostra nell'unità più comoda della famiglia.",
            esempio: ["Fieno in rotoballe da 340 kg: 27,50 € a balla = 8,09 € a quintale; 30,00 € a balla = 8,82 € a quintale.", "Rincaro: 0,0074 € al kg × 185.300 kg comprati negli ultimi 12 mesi = circa 1.363 € l'anno."],
          }],
          note: "Il report non scrive nulla. Zona di consegna e distanza dei fornitori da cercare si cambiano nella pagina «Parametri».",
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
          pagina: "Famiglie di Prodotto", icon: "🗂️",
          aCosaServe: "Decidere quali descrizioni di fattura sono lo stesso prodotto (per esempio «orzo farina sfusa» e «orzo farina sfuso»), così il report confronta i prezzi giusti.",
          comeSiUsa: [
            "In «Descrizioni delle fatture» si sceglie la famiglia di ogni descrizione, oppure «Esclusa dal confronto» per bolli, pallet e prestazioni diverse ogni volta. Il salvataggio è immediato.",
            "Il filtro «Da assegnare» mostra le descrizioni nuove: vanno assegnate quando compaiono.",
            "In «Famiglie» si cambiano nome, unità di misura, prodotto di mercato di confronto e caratteristiche tecniche (finiscono nel testo di ricerca). Il pulsante «Salva» compare dopo una modifica.",
            "«Nuova famiglia» crea un gruppo nuovo.",
          ],
          note: "Questa pagina scrive nel database solo le famiglie e le assegnazioni: non tocca fatture, righe o costi.",
        },
      ]}
    />
  );
}
