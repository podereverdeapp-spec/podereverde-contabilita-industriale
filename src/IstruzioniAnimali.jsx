import PaginaIstruzioni from "./PaginaIstruzioni";

export default function IstruzioniAnimali() {
  return (
    <PaginaIstruzioni
      titolo="Animali"
      introduzione="Tutto ciò che riguarda il calcolo dei costi per singolo animale — dalla registrazione dell'acquisto, al calcolo dell'UBA-giorni (la base per ripartire i costi), fino alla scheda che riassume la storia completa di ciascun animale. I dati anagrafici degli animali (nascite, uscite, pesi) restano in podereverdeapp.it: queste pagine leggono da lì, non li registrano."
      sezioni={[
        {
          pagina: "Report Acquisto Animali", icon: "🐄",
          aCosaServe: "Elenco delle righe fattura classificate come acquisto di animali (o come trasporto di animali in ingresso) — vanno tradotte manualmente in un nuovo animale o lotto su podereverdeapp.it, dato che l'inserimento anagrafico avviene sempre lì.",
          comeSiUsa: [
            "Consulta l'elenco delle righe in stato \"DA_ELABORARE\": ciascuna riporta specie, razza, quantità e importo.",
            "Vai su podereverdeapp.it e crea l'animale (o il lotto) corrispondente, inserendo anche il costo di acquisto con gli estremi della fattura.",
            "Se in cima alla pagina vedi un riquadro rosso \"Animali 'Acquistato' senza costo di acquisto\", significa che in podereverdeapp.it esiste già un animale marcato come acquistato ma senza il prezzo inserito — vai a completarlo da lì (o, in futuro, da qui una volta costruita la finestra di inserimento diretto).",
          ],
        },
        {
          pagina: "Report UBA", icon: "🐮",
          aCosaServe: "Calcola le UBA-giorni (Unità di Bestiame Adulto per giorno di presenza) di ogni animale in un anno specifico — è il numero alla base di come si ripartiscono tutti i costi dell'azienda tra le specie. Copre sia gli animali con BDN individuale sia i suinetti ancora nei lotti.",
          comeSiUsa: [
            "Scegli l'anno da calcolare in alto, poi premi il pulsante di calcolo.",
            "Il report include automaticamente solo gli animali davvero presenti in quell'anno: chi era già in azienda al 1° gennaio, chi è nato durante l'anno, chi è uscito durante l'anno (qualunque motivo), e chi era ancora presente al 31 dicembre.",
            "La colonna \"Stato\" mostra la situazione reale dell'animale (Attivo, Venduto, Macellato, Deceduto, Trasferito...) — evidenziata in rosso quando si tratta di un'uscita improduttiva (senza corrispettivo per l'azienda, es. morte).",
            "Un riproduttore (marcato «riproduttore» nell'app) morto, scambiato o trasferito ha ricavo zero se è morto, ma il suo costo non si spalma sugli animali da ingrasso come quello di un vitellone morto: va alla mandria e quindi ai nati, compresi i figli nati dopo la sua morte (vedi Report Riproduttori, punti 9 e 10).",
            "Clicca su un animale nell'elenco per aprire direttamente la sua Scheda Animale.",
            "Usa \"📥 Esporta Excel\" per il dettaglio completo, comprensivo anche della classificazione tecnica interna (colonna \"Categoria contabile\").",
          ],
        },
        {
          pagina: "Riepilogo Costo Animali", icon: "📋",
          aCosaServe: "L'elenco di tutti gli animali con il loro costo, calcolato in un solo modo per tutto il programma: acquisto (se comprato) o nascita (se nato in azienda), più il mantenimento di tutti gli anni, più l'eventuale costo rimasto di riproduttori usciti. Per chi è uscito con il prezzo di vendita: valore di vendita e margine. Sostituisce il vecchio «Report Accrescimento/Ingrasso» e la «Consultazione Animali per Anno».",
          comeSiUsa: [
            "Scegli la specie (Bovini, Suini, Ovini) e la categoria: «Da macello» (tutti gli animali non riproduttori e i suinetti dei lotti) oppure «Riproduttori».",
            "Filtra per stato (tutti, in azienda, usciti) e, se vuoi, per anno: scrivendo un anno vedi solo gli animali presenti in azienda in quell'anno (come faceva la Consultazione Animali per Anno). Puoi anche cercare una matricola.",
            "In alto i totali: numero di capi, costo totale e, per gli animali da macello venduti con il prezzo, valore di vendita e margine; per i riproduttori, quanto hanno già messo nella mandria (passato ai nati) e quanto resta da recuperare.",
            "Colonne degli animali da macello: costo di acquisto o di nascita, mantenimento, costo rimasto di riproduttori usciti (in arancione), costo totale, peso della carcassa (reale, oppure stimato per chi è in azienda), costo al kg di carcassa, valore di vendita, margine (verde se positivo, rosso se negativo).",
            "Clicca una riga per aprire la scheda: Scheda Riproduttore per i riproduttori, Scheda Animale per tutti gli altri.",
            "«📥 Esporta Excel» scarica l'elenco con i filtri scelti.",
            "Un suinetto passato dal lotto alla matricola compare una volta sola, come animale con matricola. Per i suinetti di un lotto comprato il prezzo del lotto si divide per il numero di suinetti del lotto.",
          ],
        },
        {
          pagina: "Scheda Animale", icon: "🔍",
          aCosaServe: "La scheda di un singolo animale da macello (o di un suinetto di un lotto): dati anagrafici, madre e padre, costo (acquisto o nascita, mantenimento, costo rimasto ricevuto, totale, costo al giorno), costo anno per anno, peso, costo al kg, vendita e margine. È la stessa scheda che si apre dal Riepilogo Costo Animali.",
          comeSiUsa: [
            "Dalla voce di menu «Scheda Animale» cerca per matricola, nome o codice del suinetto e clicca il risultato; se il risultato è uno solo la scheda si apre da sola. Dal Report UBA, cliccando un animale, si arriva qui.",
            "Se l'animale cercato è un riproduttore si apre la Scheda Riproduttore.",
            "Nella sezione «Vendita e margine» si può scrivere il prezzo di vendita al kg e salvarlo: il valore di vendita e il margine si aggiornano anche nel Riepilogo.",
            "Il pulsante «🔄 Trasferisci i costi dal lotto alla matricola» è un'utilità di recupero per i suinetti passati da lotto a matricola prima che il passaggio diventasse automatico.",
          ],
        },
        {
          pagina: "Report Riproduttori", icon: "🐄",
          aCosaServe: "Calcola il costo di nascita dei nati in azienda: il costo di mantenere madri e padri (più la quota annua del loro costo di acquisto o di allevamento, meno quanto si ricaverà alla fine) diviso tra i nati di ogni anno. È il dato che dice quanto costa far nascere un vitello, un suinetto, un agnello.",
          comeSiUsa: [
            "Scegli l'anno (di solito quello in corso) e premi «Calcola e scarica sui figli»: il programma rifà tutta la storia, anno per anno, e calcola il costo di nascita di ogni nato sulla mandria (vedi la spiegazione passo per passo qui sotto).",
            "IMPORTANTE — ordine corretto: elabora sempre prima il Report Costi dello stesso anno, e solo dopo il Report Riproduttori — quest'ultimo aggiorna righe di costo già create dal primo.",
            "Quando un riproduttore esce (macellato, venduto, morto) non c'è nessun pulsante a parte: «Calcola e scarica sui figli» confronta da solo il ricavo stimato con quello vero e aggiunge (o toglie) la differenza al costo rimasto all'uscita (vedi punto 7 della spiegazione qui sotto).",
            "Costo di partenza di un riproduttore: per gli acquistati il prezzo di acquisto; per i nati in azienda il loro costo di nascita, cioè la quota ricevuta dalla madre più quella del padre. Così il costo passa di generazione in generazione (nonna → madre → nipoti).",
            "Il calcolo procede anno per anno dal più vecchio al più recente: il costo di nascita di una manza nata nel 2021 è già pronto quando, diventata vacca, entra nella mandria; basta un solo clic.",
            "Il costo di nascita di ogni capo nato in azienda viene anche scritto nella sua scheda dell'app Podere Verde (campo «costo iniziale», tipo «nascita»).",
            "Valore di realizzo stimato (quanto si ricaverà dal riproduttore a fine carriera, sottratto dal suo costo): peso medio della carcassa dei capi adulti usciti della stessa specie, razza e sesso (con almeno 3 anni; se sono meno di 3 capi, di tutte le razze) × prezzo di riforma al kg di carcassa della specie. Il prezzo di partenza è 7 € per i bovini, 5 € per i suini e 3 € per gli ovini, e si cambia in Parametri, separatamente per ogni specie.",
            "Se il valore di realizzo supera costo di partenza + crescita, l'eccedenza non riduce il costo passato ai figli: è evidenziata in giallo nella colonna «Eccedenza di realizzo non usata» e nella scheda del riproduttore.",
            "Vita produttiva attesa: lo standard per specie è in Parametri (di partenza 11 anni bovini, 4 suini, 6 ovini). Nella scheda del riproduttore si corregge caso per caso: se si scrive un numero diverso dallo standard il capo tiene la sua correzione (nell'elenco compare «personalizzata»), se si scrive lo stesso numero dello standard torna a seguire lo standard. Un valore impossibile (meno di 1 anno) torna da solo allo standard.",
            "Quando un riproduttore esce, la parte di costo non ancora passata ai figli («costo rimasto all'uscita») è evidenziata in arancione nell'elenco, nell'Excel e nella scheda, con scritto dove è andata.",
            "PRIMA DI CALCOLARE controllare nell'app Podere Verde: 1) ogni maschio che ha fatto la monta deve essere marcato «riproduttore»; 2) ogni nato deve avere il padre giusto (per i suini basta il padre del lotto); 3) il padre deve essere vivo e presente in azienda circa 9 mesi e mezzo prima del parto nei bovini (circa 4 mesi nei suini, 5 negli ovini). Altrimenti il costo di quel maschio non arriva ai nati (vedi punto 9).",
          ],
          titoloSpiegazione: "Come si calcola il costo di nascita — spiegato passo per passo",
          spiegazione: [
            {
              titolo: "1. L'idea in una riga",
              testo: [
                "Un vitello (o un agnello, o un suinetto) nato in azienda non costa zero: per farlo nascere l'azienda mantiene ogni anno una mandria di madri e di padri. Il costo di quella mandria nell'anno, diviso per i nati dell'anno, è il costo di nascita di ogni nato.",
                "COSTO DI NASCITA DI OGNI NATO = COSTO DELLA MANDRIA DELL'ANNO ÷ NATI DELL'ANNO (per ogni specie separatamente). Tutti i vitelli nati nello stesso anno hanno lo stesso costo di nascita; lo stesso per i suinetti e per gli agnelli.",
                "Perché sulla mandria e non vacca per vacca: una vacca che in un anno non partorisce non deve caricare tutto il suo costo sull'unico vitello dell'anno dopo, e una vacca con un anno di spese anomale non deve far costare migliaia di euro un solo vitello. Il costo delle vacche vuote pesa su tutti i nati dell'anno: è il costo vero della fertilità della mandria.",
              ],
            },
            {
              titolo: "2. Da dove parte il conto di un riproduttore (costo di partenza)",
              testo: [
                "Se il riproduttore è stato COMPRATO: si parte dal prezzo pagato (fattura di acquisto).",
                "Se è NATO IN AZIENDA: si parte dal suo costo di nascita (il costo di nascita dell'anno in cui è nato). Così il costo passa di generazione in generazione.",
              ],
              esempio: "la vacca Bianca è stata comprata nel 2019 a 2.000 €: il suo costo di partenza è 2.000 €.",
            },
            {
              titolo: "3. Si aggiunge la crescita, si toglie quello che si ricaverà alla fine",
              testo: [
                "CRESCITA: tutto il mantenimento del riproduttore (alimenti, lavoro, spese, calcolati dal Report Costi) negli anni PRIMA del suo primo figlio. È un investimento per tutti i figli futuri, quindi non pesa sui nati di quegli anni: si aggiunge al suo costo da recuperare. Finché non ha figli, il riproduttore non entra nella mandria.",
                "VALORE DI REALIZZO: a fine carriera il riproduttore si vende o si macella e qualcosa si ricava. Questo ricavo si toglie subito, perché non è un costo da far pagare ai figli. Si stima così: peso medio della carcassa dei capi adulti già usciti della stessa specie, razza e sesso × prezzo di riforma al kg di carcassa (Parametri: 7 € bovini, 5 € suini, 3 € ovini).",
                "COSTO INIZIALE DA RECUPERARE (residuo) = costo di partenza + crescita − valore di realizzo (mai sotto zero).",
              ],
              esempio: [
                "Bianca: costo di partenza 2.000 € + crescita (2019 e 2020, prima del primo vitello) 1.000 € − realizzo (250 kg di carcassa × 7 €) 1.750 € = costo iniziale da recuperare 1.250 €.",
              ],
            },
            {
              titolo: "4. Ogni anno: quanto mette ogni riproduttore nel costo della mandria",
              testo: [
                "Dal primo figlio in poi, il riproduttore è «in carriera» e ogni anno, che partorisca o no, mette nel costo della mandria due cose:",
                "a) il suo MANTENIMENTO di quell'anno (alimenti, lavoro, spese): è il costo del ciclo di quell'anno (gravidanza, parto, allattamento);",
                "b) la QUOTA ANNUA del suo costo iniziale, come un attrezzo che si ammortizza: costo iniziale che resta ÷ anni di carriera che restano (vita produttiva attesa meno gli anni già passati dal primo figlio; nell'ultimo anno, o oltre, si divide per 1, cioè va tutto quello che resta).",
              ],
              esempio: [
                "Bianca, vita produttiva attesa 11 anni, primo vitello nel 2021.",
                "2021: mantenimento 900 € + quota annua 1.250 ÷ 11 = 113,64 € → mette 1.013,64 € nella mandria. Restano da recuperare 1.136,36 €.",
                "2022 (non partorisce): mantenimento 950 € + quota annua 1.136,36 ÷ 10 = 113,64 € → mette 1.063,64 € nella mandria. Anche se non ha fatto il vitello, il suo costo c'è e lo pagano i vitelli nati quell'anno.",
              ],
            },
            {
              titolo: "5. Il costo di nascita dell'anno",
              testo: [
                "COSTO DELLA MANDRIA = somma di quanto hanno messo tutti i riproduttori in carriera della specie (madri e padri).",
                "COSTO DI NASCITA DI OGNI NATO = costo della mandria ÷ nati dell'anno della specie (capi con matricola e suinetti dei lotti, purché nati in azienda). La parte delle madri e quella dei padri si vedono separate.",
                "Se in un anno non nasce nessuno, il costo della mandria non si perde: passa all'anno dopo.",
                "Il riepilogo anno per anno è in cima al Report Riproduttori (tabella «Costo di nascita per anno»): riproduttori in carriera, quanti senza figli, mantenimento, quota annua, nati, costo di ogni nato.",
              ],
              esempio: [
                "Nel 2023 la mandria ha 10 vacche in carriera (2 non hanno partorito) e 1 toro.",
                "Vacche: mantenimento 10.000 € + quote annue 1.200 € = 11.200 €. Toro: mantenimento 1.200 € + quota annua 300 € = 1.500 €. Costo della mandria: 12.700 €.",
                "Nati 8 vitelli: costo di nascita di ogni vitello = 12.700 ÷ 8 = 1.587,50 € (di cui 1.400 € dalle madri e 187,50 € dai padri).",
                "Se avessero partorito tutte e 10, ogni vitello sarebbe costato 12.700 ÷ 10 = 1.270 €: la differenza è il costo delle 2 vacche vuote.",
                "Per i suini è uguale: costo della scrofaia nell'anno ÷ suinetti nati nell'anno.",
              ],
            },
            {
              titolo: "6. Dove si vede e dove finisce il costo di nascita",
              testo: [
                "Nel costo annuale del nato (anno di nascita) compaiono separati «da madre» (parte delle madri) e «da padre» (parte dei padri) e la somma «costo di nascita ereditato», che entra nel suo totale dell'anno.",
                "Per i capi nati in azienda con matricola, lo stesso importo viene scritto anche nella loro scheda dell'app Podere Verde (campo «costo iniziale», tipo «nascita»).",
                "Nella scheda del riproduttore, la tabella «Costo messo ogni anno nella mandria» mostra anno per anno quanto ha messo, quanti figli suoi sono nati e il costo di nascita di ogni nato di quell'anno.",
                "Se il nato diventa a sua volta riproduttore, quel costo di nascita è il suo costo di partenza (punto 2).",
              ],
            },
            {
              titolo: "7. Quando il riproduttore esce: il costo rimasto",
              testo: [
                "Quando un riproduttore esce (venduto, macellato, morto) di solito una parte del suo residuo non è ancora stata passata. Non si perde: il programma la passa così, in quest'ordine:",
                "a) ai figli dell'ULTIMO anno in cui ha avuto figli, se il giorno della sua uscita sono ancora in vita (in parti uguali);",
                "b) se quelli non ci sono più, ai figli ancora in vita degli anni precedenti (il gruppo dell'anno più recente con almeno un figlio vivo);",
                "c) se non ha nessun figlio in vita, si spalma su tutti gli animali della stessa specie presenti in azienda il giorno dell'uscita, in proporzione agli UBA-giorni dell'anno (come si fa con i costi dei morti). Gli altri riproduttori sono esclusi, salvo che non ci sia nessun altro.",
                "CONGUAGLIO: al costo rimasto si aggiunge la differenza tra il ricavo che era stato stimato (punto 3) e il ricavo vero. Se il capo ha reso MENO del previsto, ai figli passa di più; se ha reso DI PIÙ, passa di meno (mai sotto zero). Il ricavo vero è: per un capo macellato, il peso reale della carcassa × il prezzo scritto nella sua scheda (o, se manca, il prezzo di riforma della specie); per un capo venduto vivo, il peso vivo × il prezzo al kg vivo; per un capo morto, zero. Se mancano il peso o il prezzo, si tiene la stima e non si fa conguaglio (è scritto nella scheda).",
                "L'importo entra nel costo dell'anno di uscita di chi lo riceve (colonna «costo rimasto di riproduttori usciti») ed è evidenziato in arancione nel Report Riproduttori, con il costo rimasto, il conguaglio, il ricavo stimato e quello vero, e dove è andato.",
              ],
              esempio: [
                "Bianca viene macellata a giugno 2025 e le restano 1.200 € di residuo non ancora passati. Il ricavo era stato stimato in 1.750 €, ma la carcassa pesava 220 kg × 7 € = 1.540 €: ha reso 210 € meno del previsto. Totale da passare: 1.200 + 210 = 1.410 €. Il vitello del 2025 è vivo: riceve tutti i 1.410 €.",
                "Se il vitello del 2025 fosse morto e quello del 2024 fosse vivo, i 1.410 € andrebbero a quello del 2024.",
                "Se non ci fossero figli vivi, i 1.410 € si dividerebbero tra tutti i bovini presenti quel giorno: un capo con 365 UBA-giorni nel 2025 ne riceve il doppio di uno con 182.",
              ],
            },
            {
              titolo: "8. L'ordine giusto dei pulsanti (importante)",
              testo: [
                "1) Report Costi: «Calcola» e «Salva» per ogni anno da aggiornare. Questo riscrive il mantenimento di tutti gli animali e AZZERA i costi di nascita.",
                "2) Report Riproduttori: «🐄 Calcola e scarica sui figli» con l'ultimo anno. Rifà tutta la storia di tutti i riproduttori e rimette i costi di nascita e il costo rimasto.",
                "Si può premere il pulsante quante volte si vuole: il risultato è sempre lo stesso, non raddoppia niente.",
                "Un figlio che non ha ancora il costo dell'anno di nascita (Report Costi non fatto per quell'anno) non riceve la sua quota: rifare il punto 1 e poi il punto 2.",
              ],
            },
            {
              titolo: "9. I maschi (tori, verri, arieti): perché la paternità conta",
              testo: [
                "Un maschio entra nella mandria (e il suo costo comincia ad andare sui nati) dall'anno del suo PRIMO FIGLIO REGISTRATO nell'app. Il programma lo riconosce come padre solo se:",
                "a) nell'app è marcato «riproduttore»;",
                "b) almeno un nato ha lui come padre (per i bovini e gli ovini nella scheda del nato, per i suini nel lotto del parto).",
                "Se una di queste due cose manca, per il programma quel maschio è un animale qualsiasi: il suo costo finisce sugli animali da ingrasso e i nati risultano senza costo del padre. È un errore che fa sembrare il vitello più economico e il vitellone più caro di quanto sono davvero.",
                "Una volta in carriera, il maschio mette ogni anno nella mandria il suo mantenimento più la quota annua del suo costo iniziale, come le femmine (punto 4). La parte dei maschi si divide su TUTTI i nati della specie dell'anno, non solo sui figli suoi: con un toro solo è la stessa cosa; con due verri si evita che quello che ha coperto meno scrofe faccia costare di più i suoi suinetti.",
              ],
              esempio: [
                "Ornello (toro nato in azienda nel 2022) ha fatto 18 vitelli nel 2025 e 14 nel 2026, ma nell'app non era marcato «riproduttore»: il programma lo trattava come un vitellone e nel 2025 il costo del padre per ogni vitello risultava 0 €. Marcato «riproduttore», dal 2025 il suo costo va sui vitelli.",
              ],
            },
            {
              titolo: "10. Riproduttori morti, scambiati o trasferiti",
              testo: [
                "Quando muore un riproduttore la sua morte è registrata (ricavo zero), ma il suo costo NON si spalma sugli animali da ingrasso come quello di un vitellone morto: resta suo in tutti gli anni, anche nell'anno della morte, ed entra nel costo della mandria, quindi lo pagano i nati. Lo stesso se viene scambiato o trasferito.",
                "FIGLI NATI DOPO LA MORTE (o dopo l'uscita): è normale che un toro morto abbia figli nei 9-10 mesi successivi, concepiti quando era vivo. Il programma li riconosce come suoi ultimi figli se nascono entro 300 giorni dall'uscita nei bovini (120 nei suini, 155 negli ovini) e dà a loro il costo rimasto, nella riga dell'anno in cui nascono. Solo se non ce ne sono si passa ai figli vivi il giorno dell'uscita (punto 7).",
                "Il costo non ancora passato ai figli segue il punto 7 (figli ancora vivi dell'ultimo anno con figli, poi gli anni precedenti, poi tutti i capi della specie).",
                "Il ricavo vero all'uscita: morto = zero; macellato = carcassa × prezzo; venduto, scambiato o trasferito con il peso vivo scritto = peso vivo × prezzo di riforma al kg vivo (Parametri → prezzi di riforma). Se il peso manca, si tiene la stima.",
              ],
              esempio: [
                "Lanciotto, toro comprato a 6.042 €, muore il 06/06/2023 dopo aver fatto 30 vitelli. Il suo mantenimento 2021, 2022 e 2023 entra nel costo della mandria di quegli anni; il costo non ancora passato (con ricavo vero zero, perché è morto) va ai suoi ultimi figli: i vitelli nati nel 2024 dopo la sua morte, concepiti quando era vivo.",
                "Ornello viene scambiato con un altro toro il 25/09/2026, peso vivo 980 kg: il ricavo vero è 980 kg × 2,50 € (prezzo di riforma al kg vivo della Marchigiana) = 2.450 €.",
              ],
            },
            {
              titolo: "11. I figli futuri (nella scheda del riproduttore)",
              testo: [
                "La regola è uguale per maschi e femmine: si contano i figli registrati anno per anno (ogni figlio una volta sola; per i suini i suinetti dei lotti in cui è padre o madre).",
                "FIGLI ALL'ANNO = media delle ultime due annate complete (per esempio nel 2026: media del 2024 e del 2025). Se ha figli solo nell'anno in corso, si usa quell'anno e la scheda scrive «stima debole».",
                "ANNI CHE RESTANO = vita produttiva attesa − anni già passati dal primo figlio.",
                "FIGLI FUTURI = anni che restano × figli all'anno. Se il riproduttore è uscito, i figli futuri sono zero.",
                "È un'informazione per la gestione (quanto può ancora rendere quel capo): NON cambia il costo di nascita, che si calcola sulla mandria anno per anno (punti 4 e 5).",
                "Per un maschio la stima è giusta solo se le paternità sono registrate bene (punto 9): un verro con i lotti senza padre risulta con meno figli di quanti ne ha fatti davvero.",
              ],
              esempio: [
                "Verro con vita produttiva 5 anni, primo figlio nel 2024: suinetti 2024 = 50, 2025 = 80. Nel 2026: figli all'anno = (50 + 80) ÷ 2 = 65; anni che restano = 5 − 2 = 3; figli futuri = 3 × 65 = 195.",
                "Verro con i primi figli nel 2026 (nessuna annata completa): si usano i figli del 2026 e la scheda scrive «stima debole».",
              ],
            },
          ],
        },
      ]}
    />
  );
}
