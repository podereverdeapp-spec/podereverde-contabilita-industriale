// Versione 236 — Istruzioni del Break Even (richieste dal Dott. Bizzarri il 07/10/2026):
// che cos'è un'analisi di Break Even, come è impostata la nostra, come lavorarci, i limiti.
import PaginaIstruzioni from "./PaginaIstruzioni";

export default function IstruzioniBreakEven() {
  return (
    <PaginaIstruzioni
      titolo="Break Even"
      introduzione="Le pagine del Break Even servono a immaginare: si scrive un prezzo di vendita e il programma, partendo dai costi reali dell'allevamento, dice quanti capi bisogna macellare ogni anno e quanti tenerne in stalla per andare in pari. Lo scopo è conoscere con esattezza quanto costa allevare un chilo di carne, per contenere il più possibile il prezzo di vendita della carcassa lavorando sui costi."
      sezioni={[
        {
          pagina: "1. Che cos'è un'analisi di Break Even", icon: "📘",
          aCosaServe: "«Break Even» vuol dire «punto di pareggio»: il punto in cui i ricavi coprono esattamente i costi, senza guadagno e senza perdita. L'analisi risponde alla domanda: a un certo prezzo di vendita, quanto devo vendere per non perdere?",
          comeSiUsa: [
            "I costi si dividono in due famiglie. Costi FISSI: si pagano comunque, anche senza vendere un capo (ammortamenti di stalle e macchine, assicurazioni, stipendi fissi, consulenze). Costi VARIABILI: crescono con ogni capo allevato (mangimi, foraggi, veterinario, medicinali).",
            "Margine di un capo = ricavo del capo − i suoi costi variabili. È quanto ogni capo venduto lascia per pagare i costi fissi.",
            "Capi da vendere per andare in pari = costi fissi dell'anno ÷ margine di un capo.",
            "Se il margine è zero o negativo (il prezzo non copre nemmeno i costi variabili), il pareggio è irraggiungibile: più si vende, più si perde.",
          ],
          titoloSpiegazione: "Un esempio semplice",
          spiegazione: [{
            titolo: "Bovini, numeri inventati",
            testo: "Costi fissi dell'anno 100.000 €. Un capo si vende a 4.000 € e costa 1.750 € di costi variabili.",
            esempio: ["Margine di un capo = 4.000 − 1.750 = 2.250 €", "Capi da vendere = 100.000 ÷ 2.250 = 44,4 → 45 capi", "Con 50 capi venduti si guadagnano 50 × 2.250 − 100.000 = 12.500 €; con 40 se ne perdono 100.000 − 40 × 2.250 = 10.000 €."],
          }],
        },
        {
          pagina: "2. Come è impostato il nostro", icon: "⚙️",
          aCosaServe: "Il nostro Break Even usa i costi reali registrati nel programma (fatture, costi diretti, quote di ammortamento) e il costo di ogni capo lungo tutta la sua vita, dall'acquisto o dalla nascita fino al macello.",
          comeSiUsa: [
            "Costi fissi e variabili: si prendono le righe delle fatture con il tipo di costo «Fisso» o «Variabile», i costi diretti (lavoro) e le quote di ammortamento (sempre fisse), dell'anno scelto. Si dividono tra bovini, suini e ovini con la stessa regola del Report Costi: i costi di una specie vanno a quella specie, i costi comuni si dividono in proporzione ai giorni di presenza pesati (i giorni in azienda moltiplicati per il coefficiente di ogni capo).",
            "Esclusi: le spese di macello e di lavorazione delle carni (area «Lavorazioni prodotti allevamento» e la parte di lavoro per la lavorazione delle carni). Non sono costi di allevamento: le paga la società del gruppo che riceve le carcasse. Sono esclusi anche i costi di Cavalli, Pollame, Orto e i cespiti senza imputazione. Le spese di macello escluse sono mostrate a parte, anno per anno.",
            "Il costo di acquisto o di nascita sta DENTRO il singolo capo, come costo variabile: un capo in più da vendere vuol dire un capo in più da comprare o da far nascere. Non è un costo fisso da ammortizzare.",
            "Capo comprato: il suo prezzo d'acquisto, intero (per un suinetto di un lotto comprato, il prezzo del lotto diviso per i suinetti del lotto).",
            "Capo nato in azienda: il costo di nascita (dal Report Riproduttori) ha due parti. Il «costo rimasto» dei genitori (il loro acquisto e la loro crescita, diviso sugli anni di vita produttiva) resta intero, perché non è tra i costi fissi dell'anno. Il mantenimento delle madri nell'anno contiene anche una quota di costi fissi, che sono già contati: di questa parte si tiene solo la quota variabile (la percentuale dei costi variabili della specie nell'anno di nascita, calcolata con la regola del Report Costi).",
            "Mantenimento del capo: costo variabile per giorno di presenza pesato dell'anno scelto × giorni di presenza pesati della vita intera del capo tipo (non più 365 giorni fissi).",
          ],
          titoloSpiegazione: "Perché la nascita si divide",
          spiegazione: [{
            titolo: "Il doppio conteggio da evitare",
            testo: "Il costo di nascita di un vitello contiene il mantenimento della madre, che a sua volta contiene una quota di stalle, stipendi e ammortamenti. Quei costi fissi sono già nei costi fissi dell'anno: se si mettesse nel vitello tutto il costo di nascita, si conterebbero due volte.",
            esempio: ["Costi fissi 100.000 €, costi variabili 60.000 € (37,5%). Costo di nascita 2.000 €, tutto da mantenimento delle madri.", "Sbagliato: costo variabile del vitello = 2.000 + 1.000 = 3.000 €; margine 1.000 €; capi = 100 capi.", "Giusto: 2.000 × 37,5% = 750 € + 1.000 = 1.750 €; margine 2.250 €; capi = 45 capi."],
          }],
        },
        {
          pagina: "3. Carcassa, capo vivo e campione del capo tipo", icon: "🐄",
          aCosaServe: "Ci sono due pagine: «Break Even sulla carcassa» (prezzo al kg di carcassa, come si vende alla società del gruppo) e «Break Even sul capo vivo» (prezzo al kg vivo). Il calcolo è lo stesso; cambiano il peso di riferimento e il prezzo.",
          comeSiUsa: [
            "Resa = peso della carcassa ÷ peso vivo. Un bovino di 540 kg vivo con resa 58% dà circa 313 kg di carcassa (540 × 0,58 = 313,2). La resa è mostrata in tutte e due le pagine, pesata sui chili, con il numero di capi su cui è calcolata.",
            "Il «capo tipo» è la media di un campione: bovini macellati tra 12 e 24 mesi di età; suini macellati con peso vivo oltre 130 kg (animali con matricola e suinetti dei lotti insieme); ovini macellati. Tutti gli anni insieme, esclusi i riproduttori.",
            "Per i bovini il campione deciso è «tra 12 e 24 mesi». Con i pulsanti sopra il riquadro si può guardare, per confronto, anche il capo tipo dei vitelli sotto i 12 mesi, dei capi oltre i 24 mesi o di tutte le età: accanto a ogni pulsante c'è il numero di capi macellati in quella fascia.",
            "Restano nel campione solo i capi con il peso vivo e il peso della carcassa, con il codice scritto correttamente e con una resa credibile: bovini tra il 50% e il 66%, suini tra il 65% e l'85% (limiti decisi il 07/10/2026).",
            "I capi anomali NON entrano nel calcolo, ma sono elencati nel riquadro arancione «Capi esclusi» (pulsante «mostra l'elenco») con codice, pesi, resa e motivo, così si possono andare a correggere nell'app. Quando un capo viene corretto, rientra da solo nel campione.",
            "Peso, resa e durata del capo tipo si aggiornano da soli ogni volta che nell'app si inseriscono nuovi pesi di carcassa o di capi vivi.",
            "Prezzo reale proposto: sulla carcassa, la media dei prezzi registrati per i capi del campione, pesata sui chili; sul vivo, lo stesso prezzo moltiplicato per la resa (prezzo equivalente al kg vivo).",
            "Ovini: finché i dati non sono inseriti nell'app (pesi, nascite, uscite), compare «dato mancante» e i valori si scrivono a mano.",
          ],
        },
        {
          pagina: "4. Capi da macellare e capi da allevare", icon: "🔢",
          aCosaServe: "Il risultato principale non è solo quanti capi vendere, ma quanti capi tenere in stalla per poterne vendere tanti ogni anno.",
          comeSiUsa: [
            "Capi da macellare all'anno = costi fissi ÷ margine di un capo (vedi punto 1).",
            "Capi all'ingrasso da tenere in stalla = capi da macellare all'anno × mesi in azienda del capo ÷ 12. Esempio: 40 capi all'anno che restano 23 mesi = 77 capi sempre presenti.",
            "Madri = capi da macellare all'anno × percentuale di capi nati in azienda ÷ nati vivi per madre all'anno. Esempio: 40 capi, tutti nati in azienda, 0,67 nati per vacca = 60 vacche. Se una parte dei capi si compra, servono meno madri, ma c'è il prezzo d'acquisto.",
            "Tori (verri, arieti) = madri × tori per madre.",
            "Il totale si confronta con i capi presenti al 31/12 dell'anno scelto, divisi in femmine adulte, maschi riproduttori e altri.",
            "Nati per madre e tori per madre: media degli ultimi tre anni completi fino all'anno scelto (l'anno in corso non conta perché non è finito); il valore di ogni anno è scritto sotto la casella. Femmina adulta = oltre 24 mesi (bovini), 10 mesi (suini), 12 mesi (ovini).",
          ],
          note: "Attenzione: i nati per madre dipendono dai parti registrati nell'app. Per i suini, nel 2024 e nel 2025 i nati morti risultano quasi quanti o più dei vivi: dato da verificare con il registro parti prima di usarlo.",
        },
        {
          pagina: "5. Il valore degli animali in stalla", icon: "🏠",
          aCosaServe: "Il costo di allevamento di un anno dei capi non macellati non è perso: passa all'anno dopo, dentro il costo di quegli animali, e diventa costo quando vengono macellati.",
          comeSiUsa: [
            "Nel Break Even questo avviene da sé, perché il costo di ogni capo si somma anno per anno, dalla nascita (o dall'acquisto) al macello.",
            "Nel Riepilogo annuale si tiene conto così: costo della carne uscita = spese di allevamento dell'anno + valore degli animali in stalla al 1° gennaio − valore degli animali in stalla al 31 dicembre.",
            "Valore degli animali in stalla = quanto sono costati fino a quella data i capi presenti che non sono riproduttori (acquisto, nascita e mantenimento salvati). I costi dei riproduttori passano ai figli attraverso il costo di nascita.",
            "Così un anno in cui si comprano molti vitelli che saranno venduti l'anno dopo non appare in perdita: si spende, ma il valore della stalla cresce.",
          ],
        },
        {
          pagina: "6. Riepilogo Costi (Break Even) e differenza con il Break Even", icon: "📋",
          aCosaServe: "Il Riepilogo risponde a: «in quell'anno quanto mi è costato produrre un chilo di carcassa?»",
          comeSiUsa: [
            "Si sceglie l'anno. Per ogni specie: spese di allevamento per area (variabili e fisse, senza macello e lavorazioni), valore della stalla a inizio e fine anno, costo della carne uscita, capi macellati (all'ingrasso e riforme) e chili di carcassa.",
            "Costo di un kg di carcassa = costo della carne uscita ÷ chili di carcassa dei capi macellati nell'anno. Per confronto è mostrato anche il costo senza tener conto della stalla.",
            "Capi senza peso della carcassa: i loro chili sono stimati con il peso medio dei macellati dello stesso anno, e il riquadro arancione lo dice. Capi e chili si possono cambiare a mano per fare prove.",
            "Differenza con il Break Even: il Break Even segue il singolo capo lungo tutta la sua vita; il Riepilogo guarda un solo anno (tutto ciò che si è speso ÷ tutto ciò che è uscito). Se ogni anno si allevano e si vendono più o meno gli stessi capi, i due numeri si somigliano; se si allontanano, l'allevamento sta crescendo o calando.",
          ],
        },
        {
          pagina: "7. Come lavorarci", icon: "🛠️",
          aCosaServe: "Le pagine sono fatte per provare scenari: ogni valore si può cambiare e i risultati si ricalcolano subito.",
          comeSiUsa: [
            "Scegliere l'anno dei costi (in alto). Costi fissi e costo variabile per giorno sono quelli di quell'anno.",
            "Scrivere il prezzo di vendita: qualunque valore, anche molto lontano da quello reale. Il prezzo scritto resta anche se si cambia anno; «Torna al prezzo reale» lo riporta al prezzo registrato.",
            "Le altre leve: peso, mesi in azienda, nati vivi per madre, tori per madre, percentuale di capi nati in azienda, variazione dei costi variabili e dei costi fissi, posti disponibili in stalla. Una casella con il bordo blu è un valore scritto a mano; «Ripristina tutti i valori reali» le riporta tutte ai dati reali.",
            "Risultato: margine di un capo, capi da macellare all'anno, capi da tenere in stalla, prezzo minimo con i capi realmente macellati nell'anno, margine di sicurezza (quanti capi reali in più o in meno rispetto al pareggio), guadagno o perdita con i capi reali.",
            "Di cosa è fatto il costo di un chilo: acquisto o nascita e ogni area di costo (alimentazione, lavoro, ammortamenti…), parte variabile e parte fissa, per capo e al kg. Mostra dove intervenire per contenere il costo.",
            "Tabella dei prezzi: sette prezzi attorno a quello scritto, a colpo d'occhio. Per altri prezzi basta scriverli nella casella.",
            "Le leve: quanto cambiano i capi da macellare, i capi in stalla e il prezzo minimo se i costi variabili o fissi scendono del 10%, se il capo resta un mese in meno, se ogni madre fa più nati, se il prezzo sale.",
            "Posti in stalla: se si scrivono, il programma avvisa quando i capi da tenere li superano; oltre quella soglia servirebbero nuove strutture e i costi fissi salirebbero.",
          ],
        },
        {
          pagina: "8. Limiti da tenere a mente", icon: "⚠️",
          aCosaServe: "I numeri valgono quanto i dati da cui partono.",
          comeSiUsa: [
            "Se in cima alla pagina compare l'avviso arancione «Occorre ricalcolare i costi», i calcoli salvati non sono aggiornati: finché non si fa il ricalcolo (Report Costi anno per anno, poi Report Riproduttori) i numeri non sono definitivi.",
            "Se il Report Riproduttori non è elaborato, il costo di nascita non si può dividere esattamente: il programma lo dice in un avviso giallo.",
            "Il costo di partenza vale solo per i capi del campione che hanno i costi salvati; i capi senza costi salvati sono contati a parte.",
            "Report Costi e Break Even dividono i costi tra le specie con la stessa regola (decisione del 07/10/2026): stesse esclusioni (macello e lavorazione delle carni, Cavalli, Pollame, Orto) e stessa divisione dei cespiti. Per questo la parte variabile della nascita è esatta, una volta fatto il ricalcolo generale.",
            "Le pagine non scrivono nulla nel database: si può provare tutto senza timore.",
          ],
        },
      ]}
    />
  );
}
