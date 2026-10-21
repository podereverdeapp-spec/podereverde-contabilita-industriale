// Versione 249 (20/10/2026) — Istruzioni della cartella «Controllo Prezzi di Acquisto» riscritte come guida di lavoro
// passo per passo; testo approvato dal Dott. Bizzarri alle 13:01, identico al Word «Istruzioni_Controllo_Prezzi_di_Acquisto.docx».
// (Versione 241: prima stesura, con le tre sezioni prese dalle Istruzioni della cartella Ricerca.)
import PaginaIstruzioni from "./PaginaIstruzioni";

export default function IstruzioniPrezziAcquisto() {
  return (
    <PaginaIstruzioni
      titolo="Controllo Prezzi di Acquisto"
      introduzione={<b>Cosa è il Controllo Prezzi di Acquisto: lo strumento che controlla, fattura dopo fattura, se i prezzi di ciò che l'azienda compra sono cambiati. Dice cosa è rincarato, quanto costa il rincaro in un anno e cosa conviene fare. Funziona bene solo se le fatture sono caricate bene.</b>}
      sezioni={[
        {
          pagina: "Il Controllo Prezzi in breve", icon: "💶",
          parti: [
            { titolo: "A cosa serve", blocchi: [
          <>Un esempio. Il fornitore del fieno passa da 27,50 € a 30,00 € a balla. Sulla singola fattura sembra poco. Ma se in un anno si comprano 545 balle, sono circa 1.360 € in più.</>,
          <>Confrontando le fatture a mano nessuno se ne accorge. Questa cartella lo segnala da sola, appena la fattura è caricata. Indica anche quanto vale il rincaro e se un altro fornitore, o il mercato, costa meno.</>] },
            { titolo: "Quando si usa", blocchi: [
          <>Dopo ogni caricamento di fatture di acquisto. Il controllo completo richiede pochi minuti se i dati sono in ordine.</>] },
            { titolo: "Le tre pagine", blocchi: [
          { numerato: false, elenco: [
            <><b>Attenzione Variazione Prezzi</b>: è la pagina di lavoro. Dice cosa è cambiato e cosa fare. Si parte sempre da qui.</>,
            <><b>Articoli {"&"} Prezzi</b>: serve quando si vuole controllare il prezzo di un prodotto riga per riga, o correggere a cosa è servita una spesa.</>,
            <><b>Famiglie di Prodotto</b>: serve a dire al programma quali descrizioni di fattura sono lo stesso prodotto. Senza questo passaggio i prezzi non si possono confrontare.</>] },
          <>Perché servono le famiglie: nelle fatture lo stesso prodotto è scritto in modi diversi, per esempio «orzo farina sfusa» e «farina d'orzo sfuso». Il programma confronta i prezzi solo dentro lo stesso gruppo di descrizioni, che si chiama <b>famiglia di prodotto</b>.</>] },
          ],
        },
        {
          pagina: "A. Il controllo, passo per passo", icon: "✅",
          parti: [
            { titolo: "Passo 1 — Aprire la pagina", blocchi: [
          <>Nel menu a sinistra aprire <i>Controllo Prezzi di Acquisto → Attenzione Variazione Prezzi</i>. Compare la scritta «Calcolo in corso…»: attendere qualche secondo. Il programma legge tutte le fatture di acquisto caricate fino a quel momento.</>] },
            { titolo: "Passo 2 — Leggere i quattro numeri in alto", blocchi: [
          <>In alto, sotto il titolo «In sintesi», ci sono quattro riquadri. Riguardano gli acquisti degli ultimi 12 mesi.</>,
          { tabella: [[<>Riquadro</>, <>Cosa dice</>, <>Cosa fare</>], [<><b>Da sistemare</b></>, <>Quante righe di fattura e descrizioni impediscono un confronto corretto.</>, <>Se è diverso da zero, fare <b>prima</b> il passo 3. Altrimenti i numeri degli altri riquadri non sono affidabili.</>], [<><b>Rincari: quanto costano in un anno</b></>, <>La somma, in euro, di tutti gli aumenti di prezzo, calcolata sulle quantità comprate in un anno.</>, <>Passo 5.</>], [<><b>Opportunità di risparmio</b></>, <>Quanto si potrebbe risparmiare in un anno pagando come il fornitore più economico o come il mercato.</>, <>Passo 6.</>], [<><b>Ribassi</b></>, <>Quanto si risparmia in un anno grazie ai prezzi scesi.</>, <>Nessuna azione: è un'informazione.</>]] }] },
            { titolo: "Passo 3 — Sistemare i dati", blocchi: [
          <>Scorrere fino alla parte «Da sistemare prima di fidarsi dei numeri», in fondo alla pagina. Può contenere tre elenchi. Ognuno ha una causa diversa e si sistema in una pagina diversa.</>,
          { sottotitolo: "3a. «Righe con un prezzo che non torna»" },
          <><b>Cosa si vede:</b> righe di fattura con un prezzo al chilo più di 2,5 volte, o meno del 40%, del prezzo abituale di quel prodotto. La colonna «Perché» indica il prezzo trovato e quello abituale.</>,
          <><b>Perché succede:</b> quasi sempre la quantità o l'unità di misura sono state caricate male. Esempio: 1 al posto di 25 sacchi, oppure chili scritti come quintali. Queste righe restano fuori dal confronto finché non si correggono.</>,
          <><b>Cosa fare:</b> prendere la fattura originale e confrontarla con la riga.</>,
          { numerato: true, elenco: [
            <>Aprire <i>Ricerca: Fatture e Anagrafiche → Ricerca</i>.</>,
            <>Nella casella di ricerca scrivere il numero della fattura, indicato nella colonna «Fattura».</>,
            <>Cliccare sulla fattura per vederne le righe.</>,
            <>Sulla riga sbagliata premere la matita ✏️.</>,
            <>Correggere <b>Quantità</b>, <b>U.M.</b> (unità di misura) e <b>Prezzo unitario</b> come sulla fattura originale. Non cambiare l'<b>Importo</b>: è quanto si è pagato davvero.</>,
            <>Premere <b>«✓ Salva»</b> e confermare. La modifica resta scritta in <i>Carica Dati Contabilità → 4. Controllo finale → Registro delle Modifiche</i>.</>] },
          <>Può anche succedere che la riga sia giusta. Allora quasi sempre il prodotto è nella famiglia sbagliata: per esempio un mangime per suinetti tra i mangimi da ingrasso. In questo caso spostare la descrizione nella famiglia giusta, come al punto 3c.</>,
          { sottotitolo: "3b. «Righe senza unità di misura convertibile in kg o litri»" },
          <><b>Cosa si vede:</b> righe con la quantità in sacchi, balle, rotoballe o pezzi.</>,
          <><b>Perché succede:</b> il programma non sa quanti chili vale una balla o un sacco di quel fornitore. Senza i chili non può calcolare il prezzo al chilo, e la riga resta fuori dal confronto.</>,
          <><b>Cosa fare:</b> dire al programma, una volta sola, quanti chili vale l'unità. La regola vale poi per tutte le fatture di quel fornitore e di quel prodotto, passate e future.</>,
          { numerato: true, elenco: [
            <>Aprire <i>Carica Dati Contabilità → 2. Sistema i dati caricati → Armonizzare Unità Misura Fatture</i>. La pagina si intitola «Da Armonizzare».</>,
            <>Cercare il riquadro con il nome del fornitore e la descrizione del prodotto.</>,
            <>Se non si è sicuri dell'unità, premere <b>«▼ vedi le fatture»</b> e poi <b>«📄 apri fattura»</b> per vedere la fattura.</>,
            <>Nel menu scegliere l'unità: Kilogrammi, Tons (tonnellate), Quintali, oppure Rotoballe, Balle, Balloni, Rotoloni.</>,
            <>Premere <b>«✓ Conferma unità»</b>.</>] },
          <><b>Attenzione al peso delle balle.</b> Rotoballe, Balle, Balloni e Rotoloni valgono sempre 340 kg. Se le balle di quel fornitore pesano diversamente, scegliere invece <b>Unità</b> e scrivere il peso vero nel campo «Fattore kg». Lo stesso per i sacchi: per un sacco da 25 kg, scegliere Unità e scrivere 25.</>,
          <>Se compare un <b>💡 Suggerimento</b>, il programma ha trovato lo stesso prodotto dello stesso fornitore già convertito. Se è davvero lo stesso prodotto, premere <b>«Usa … (come suggerito)»</b>.</>,
          <>La pagina mostra solo foraggio, mangimi, integratori, sementi, concimi e fitosanitari, gasolio. Per gli altri prodotti si sceglie, per la famiglia, l'unità «pezzo» o «importo a fattura» (vedi parte C).</>,
          { sottotitolo: "3c. «Descrizioni nuove senza famiglia»" },
          <><b>Cosa si vede:</b> descrizioni di fattura mai viste prima, con una spesa di almeno 300 € negli ultimi 24 mesi. Sotto l'elenco è indicato quante altre descrizioni, più piccole, sono nella stessa situazione.</>,
          <><b>Perché succede:</b> il fornitore ha scritto il prodotto in un modo nuovo, oppure è un prodotto nuovo. Finché non ha una famiglia, il suo prezzo non viene controllato.</>,
          <><b>Cosa fare:</b></>,
          { numerato: true, elenco: [
            <>Aprire <i>Controllo Prezzi di Acquisto → Famiglie di Prodotto</i>. Il filtro è già su «Da assegnare».</>,
            <>Trovare la descrizione; se serve, scriverne una parola nella casella «Cerca descrizione o fornitore».</>,
            <>Nella colonna <b>Famiglia</b> scegliere la famiglia giusta. La scelta si salva subito e compare un messaggio verde.</>,
            <>Se nessuna famiglia va bene, crearne una nuova (vedi parte C) e poi assegnarla.</>,
            <>Se la riga non è un prodotto da confrontare, per esempio un bollo, un pallet o una prestazione diversa ogni volta, scegliere <b>«Esclusa dal confronto»</b>.</>] }] },
            { titolo: "Passo 4 — Ricalcolare", blocchi: [
          <>Tornare su <i>Attenzione Variazione Prezzi</i> e premere <b>«Ricalcola con i dati di adesso»</b>, in alto a destra. Controllare che il riquadro «Da sistemare» sia sceso. Da qui in avanti i numeri sono affidabili.</>] },
            { titolo: "Passo 5 — Esaminare i rincari", blocchi: [
          <>La parte «Prezzi aumentati, in ordine di gravità» elenca i prodotti la cui ultima fattura è più cara della precedente. Il primo è quello che costa di più all'azienda. Si esaminano dall'alto.</>,
          <><b>Cosa dice la riga di ogni prodotto:</b></>,
          { numerato: false, elenco: [
            <>il nome della famiglia e il fornitore dell'ultima fattura; «cambio di fornitore» se è diverso dal precedente;</>,
            <>l'etichetta di gravità;</>,
            <>il prezzo precedente → il prezzo nuovo, e la variazione in percentuale;</>,
            <><b>Quanto vale in un anno</b>: l'aumento moltiplicato per le quantità comprate negli ultimi 12 mesi;</>,
            <>la spesa degli ultimi 12 mesi per quel prodotto e la sua percentuale su tutti gli acquisti.</>] },
          <><b>Cosa fare in base alla gravità:</b></>,
          { tabella: [[<>Gravità</>, <>Quando</>, <>Cosa conviene fare</>], [<><b>Alta</b> (rossa)</>, <>L'aumento costa almeno 1.000 € in un anno; oppure è di almeno il 10% su un prodotto che costa almeno 5.000 € in un anno.</>, <>Intervenire subito: chiedere spiegazioni al fornitore e almeno un altro preventivo.</>], [<><b>Media</b> (arancione)</>, <>L'aumento costa almeno 200 € in un anno.</>, <>Verificare al prossimo ordine; chiedere un preventivo se l'aumento si ripete.</>], [<><b>Bassa</b> (verde)</>, <>Tutti gli altri aumenti.</>, <>Prenderne nota.</>]] },
          <><b>Per capire il rincaro, cliccare sul prodotto.</b> Si apre il dettaglio:</>,
          { numerato: false, elenco: [
            <><b>Il grafico del prezzo</b> degli ultimi 3 anni. Ogni punto è una fattura, ogni colore un fornitore. La linea tratteggiata, se c'è, è il prezzo di mercato. Il grafico fa capire se è un aumento isolato o una salita continua. Il pulsante <b>«Tutto lo storico»</b> mostra tutti gli anni.</>,
            { testo: <><b>«Problemi e consigli»</b>: ▲ indica un problema, ➜ un consiglio, ● una cosa che va bene. Alcuni consigli tipici:</>, sotto: [<>chiedere un prezzo bloccato, se le ultime tre fatture salgono;</>, <>chiedere due preventivi, se c'è un solo fornitore;</>, <>chiedere il prezzo franco azienda, se il trasporto è fatturato a parte.</>] },
            <><b>«Ultime fatture»</b>: le ultime 10 fatture del prodotto, con quantità e prezzo. Servono a controllare che l'aumento sia vero e non un errore di caricamento.</>] }] },
            { titolo: "Passo 6 — Esaminare le opportunità di risparmio", blocchi: [
          <>La parte «Opportunità di risparmio» elenca i prodotti che si potrebbero pagare meno. Compaiono solo se il risparmio supera 50 € in un anno. Le opportunità sono di due tipi:</>,
          { numerato: false, elenco: [
            <><b>un altro fornitore</b> ha fatturato lo stesso prodotto ad almeno il 3% in meno negli ultimi 12 mesi;</>,
            <><b>il mercato</b>: si paga più del 15% sopra il prezzo di mercato.</>] },
          <>Il risparmio indicato è una stima. Prima di decidere, verificare che il prodotto sia davvero equivalente: stessa composizione, stesso formato, trasporto compreso o no.</>,
          <><b>Per cercare fornitori e prezzi migliori:</b></>,
          { numerato: true, elenco: [
            <>Cliccare sul prodotto per aprire il dettaglio.</>,
            <>In fondo, premere <b>«📋 Copia il testo di ricerca»</b>.</>,
            <>Aprire un'intelligenza artificiale che sa cercare in internet, per esempio Claude, e incollare il testo.</>,
            <>L'intelligenza artificiale restituisce prezzi di mercato, fornitori della zona, una tabella di confronto e il risparmio possibile. Prima di usarli, verificare prezzi e contatti con una telefonata.</>] },
          <>Il testo contiene già il prodotto, le quantità comprate, il prezzo attuale e il fornitore. Se contiene parti tra parentesi quadre, mancano dei dati: vedi parte C.</>] },
            { titolo: "Passo 7 — Uno sguardo al resto", blocchi: [
          { numerato: false, elenco: [
            <><b>«Prezzi scesi»</b>: i prodotti diventati più economici. Utile per sapere con chi il rapporto funziona.</>,
            <><b>«Tutti gli altri prodotti comprati negli ultimi 24 mesi»</b>: prodotti con il prezzo invariato, con una sola fattura o non comprati nell'ultimo anno. Nessuna azione.</>] }] },
          ],
        },
        {
          pagina: "B. Controllare un prezzo in Articoli & Prezzi", icon: "🏷️",
          parti: [
            { blocchi: [
          <>Serve quando si ha un dubbio su un prodotto o su una fattura precisa: per esempio, quanto lo si pagava due anni fa, o da quale fornitore.</>,
          { numerato: true, elenco: [
            <>Aprire <i>Controllo Prezzi di Acquisto → Articoli {"&"} Prezzi</i>.</>,
            <>Nella casella <b>«Cerca per descrizione o fornitore/cliente...»</b> scrivere una parola del prodotto o il nome del fornitore.</>,
            <>Nel primo menu scegliere <b>«Solo acquisti»</b>.</>,
            <>Cliccare sul prodotto. Si aprono il grafico del prezzo fattura per fattura, il grafico del prezzo medio di ogni anno e l'elenco di tutte le righe di fattura.</>,
            <>Per avere tutto in un file, premere <b>«📥 Esporta Excel»</b>.</>] },
          <><b>Come leggere l'elenco:</b></>,
          { numerato: false, elenco: [
            <>prezzo recente <b>rosso con ⚠️</b>: è il prezzo più alto mai pagato per quel prodotto;</>,
            <>colonna dello scostamento <b>rossa ▲</b> o <b>verde ▼</b>: il prezzo recente è sopra o sotto la media;</>,
            <><b>⚠️ accanto all'unità di misura</b>: il prodotto è stato fatturato con unità diverse, per esempio a chili e a quintali. I suoi prezzi qui non sono confrontabili: usare <i>Attenzione Variazione Prezzi</i>.</>] },
          <><b>Differenze con Attenzione Variazione Prezzi.</b> Qui il prezzo è quello scritto in fattura, nell'unità della fattura, senza conversione in chili. I prodotti sono raggruppati per descrizione, non per famiglia. La media è semplice, senza tener conto delle quantità. Per questo i numeri delle due pagine possono essere diversi.</>] },
          ],
        },
        {
          pagina: "C. Lavori occasionali", icon: "🛠️",
          parti: [
            { titolo: "Creare una famiglia di prodotto", blocchi: [
          <>Serve quando si compra un prodotto nuovo, che nessuna famiglia rappresenta.</>,
          { numerato: true, elenco: [
            <>Aprire <i>Famiglie di Prodotto</i> e scendere fino al riquadro <b>«Nuova famiglia»</b>.</>,
            <>Scrivere il <b>nome</b>: chiaro e generale, per esempio «Mangime suini ingrasso».</>,
            <>Scegliere l'<b>unità</b> in cui leggere il prezzo: tonnellata o quintale per i prodotti sfusi, kg per gli integratori, litro per il gasolio, pezzo per i prodotti a pezzo, importo a fattura per polizze e servizi.</>,
            <>Se esiste un listino di confronto, sceglierlo in <b>«Prodotto di mercato»</b>.</>,
            <>Scrivere le <b>caratteristiche tecniche</b>: per i mangimi proteina, grassi, fibra e forma; per il fieno tipo di erba, taglio, balla e peso. Servono al testo di ricerca.</>,
            <>Premere <b>«Crea»</b>. Poi assegnare alla famiglia le descrizioni, come al passo 3c.</>] },
          <>Per modificare una famiglia esistente, cambiare i dati nella sua riga e premere <b>«Salva»</b>, che compare solo dopo una modifica.</>] },
            { titolo: "Correggere a cosa è servita una spesa", blocchi: [
          <>Ogni riga di fattura dice a cosa è servita la spesa: <b>Area</b> (per esempio Allevamento), <b>Centro di Costo</b> (per esempio Mangimi), <b>Destinazione</b> (gli animali, oppure Generali se è servita a tutti) e <b>Tipo di Costo</b> (Fisso, Variabile, Ammortizzabile). Questi dati decidono su quali animali va il costo.</>,
          { numerato: false, elenco: [
            <><b>Per una sola riga:</b> correggerla in <i>Ricerca</i>, come al passo 3a.</>,
            <><b>Per tutte le righe di un prodotto:</b> usare <i>Articoli {"&"} Prezzi</i>:</>] },
          { numerato: true, elenco: [
            <>cercare il prodotto, cliccarlo e premere <b>«✏️ Modifica classificazione»</b>;</>,
            <>scegliere i nuovi valori, iniziando dall'Area; i campi lasciati vuoti restano come sono;</>,
            <>premere <b>«✓ Salva e applica alle prossime fatture»</b>;</>,
            <>leggere il messaggio: dice quante righe e quanti fornitori cambieranno. Confermare solo se i numeri sono quelli attesi.</>] },
          <><b>Attenzione:</b> la modifica vale per tutte le righe con quella descrizione, di tutti i fornitori e di tutti gli anni, e per le fatture future. Cambia quindi i costi degli animali. Dopo la modifica, salvare di nuovo il calcolo dei costi in <i>Analisi Costi → Report Costi</i>. Se si sbaglia, i valori di prima si leggono nella colonna «Prima» di <i>Carica Dati Contabilità → 4. Controllo finale → Registro delle Modifiche</i>: rifare la modifica con quei valori.</>] },
            { titolo: "Impostare zona di consegna e distanza", blocchi: [
          <>Il testo di ricerca indica dove consegnare e entro quanti chilometri cercare fornitori. Si impostano una volta sola nella pagina <i>Parametri</i> del menu. Se la zona non è impostata, nel testo compare «[ZONA DI CONSEGNA]»; la distanza, se non impostata, è 100 km.</>] },
          ],
        },
        {
          pagina: "D. Se qualcosa non torna", icon: "❓",
          parti: [
            { blocchi: [
          <><b>Un prodotto che compro non compare.</b> Le cause possibili:</>,
          { numerato: false, elenco: [
            <>la descrizione non ha una famiglia. Attenzione: tra le descrizioni nuove sono segnalate solo quelle di mangimi, foraggio, integratori, gasolio, sementi, concimi e fitosanitari, reti e film, medicinali veterinari e assicurazioni. Le altre vanno cercate in <i>Famiglie di Prodotto</i> con il filtro «Tutte»;</>,
            <>la descrizione è «Esclusa dal confronto»;</>,
            <>le righe non sono convertibili in chili (passo 3b);</>,
            <>l'ultima fattura è più vecchia di 24 mesi.</>] },
          <><b>Il rincaro sembra enorme, ma la fattura è giusta.</b> Quasi sempre nella famiglia ci sono prodotti diversi, oppure il peso della balla o del sacco è sbagliato. Controllare la famiglia (passo 3c) e la regola dei chili (passo 3b).</>,
          <><b>Ho sistemato i dati ma la pagina non cambia.</b> Premere «Ricalcola con i dati di adesso».</>,
          <><b>Il testo di ricerca contiene parti tra parentesi quadre.</b> Mancano le caratteristiche tecniche della famiglia o la zona di consegna: vedi parte C.</>] },
          ],
        },
        {
          pagina: "E. Come calcola il programma", icon: "🧮",
          parti: [
            { blocchi: [
          <>Per chi vuole sapere da dove vengono i numeri.</>,
          { numerato: false, elenco: [
            <><b>Prezzo al chilo.</b> Ogni riga di fattura viene portata a euro al chilo, o al litro, con la regola dei chili del passo 3b oppure con l'unità scritta in fattura (tonnellate, quintali, chili, litri). Le righe della stessa famiglia nella stessa fattura si sommano.</>,
            <><b>Confronto.</b> L'ultima fattura si confronta con la precedente dello stesso fornitore; se non c'è, con la precedente della famiglia. Differenze sotto lo 0,05% sono arrotondamenti e non contano.</>,
            <><b>Quanto vale in un anno</b> = differenza di prezzo × chili comprati negli ultimi 12 mesi.</>,
            <><b>Prezzo abituale</b> di una famiglia: il valore centrale dei prezzi delle altre fatture dell'anno prima e dopo (la mediana).</>,
            <><b>Fatture considerate:</b> solo quelle di acquisto con importo positivo; le note di credito restano fuori. Nella spesa totale non entrano gli acquisti di macchine, attrezzature e strutture.</>,
            <><b>Prezzi di mercato:</b> vengono dai listini delle coltivazioni, campagna per campagna, o da riferimenti scritti nel programma con fonte e data, per esempio il gasolio agricolo.</>] },
          <><b>La correttezza dei controlli si fonda sulla correttezza delle fatture caricate.</b> Per questo le fatture vanno caricate in modo completo e tempestivo, seguendo le Istruzioni Carica Fatture Passive della cartella Carica Dati Contabilità.</>] },
          ],
        },
      ]}
    />
  );
}
