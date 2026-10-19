import PaginaIstruzioni from "./PaginaIstruzioni";

export default function IstruzioniAlimentaria() {
  return (
    <PaginaIstruzioni
      titolo="Alimentaria"
      introduzione="La cartella dell'alimentazione degli animali di Podere Verde, allevati allo stato brado e semibrado: quanto si compra e quanto costa, la scheda dei prezzi di riferimento con i preventivi, e le razioni di bovini, suini e ovini — classi, fabbisogni, razioni di riferimento e lo strumento per costruire le razioni vedendo subito fabbisogno coperto e costo. Obiettivo, deciso dal Dott. Bizzarri: ridurre il costo di alimentazione a parità di accrescimento."
      sezioni={[
        {
          pagina: "Costi e Quantità", icon: "📊",
          aCosaServe: "Mangimi, foraggio e integratori: quantità in kg e costo d'acquisto, totali e ripartiti tra bovini, suini e ovini (quota propria della specie più la quota dei consumi «Generali», secondo gli UBA-giorni).",
          comeSiUsa: ["Scegliere l'anno e leggere i totali per centro di costo; cliccare un centro di costo per il dettaglio per prodotto."],
        },
        {
          pagina: "Controlla prezzi e chiedi preventivi", icon: "💶",
          aCosaServe: "La scheda prezzi: per ogni alimento il prezzo di riferimento dell'anno in corso, da dove viene e quanto è sicuro. È il prezzo che usano tutte le razioni di bovini, suini e ovini. Serve a valorizzare le razioni con prezzi esatti e a sapere per quali alimenti chiedere un preventivo.",
          comeSiUsa: [
            "Controlla prezzi: una riga per alimento. Il prezzo di riferimento è scritto in nero se è sicuro (fatture dell'anno, con il fornitore accanto, oppure autoproduzione), in blu se viene da un preventivo, in arancione se è da verificare (Borsa Merci, ricerca online o listino), in rosso se manca. Accanto: fatture dell'anno, autoproduzione, preventivo e prezzo di Borsa o ricerca online, con fonte e data.",
            "In alto il riquadro «Anomalie»: alimenti da verificare o senza prezzo, fatture di piccole quantità che non fanno da riferimento, prezzi da scegliere, peso dei balloni da controllare.",
            "Per un alimento arancione: «Chiedi preventivo». Per scrivere un prezzo trovato in Borsa Merci o in rete: riquadro «Inserisci un prezzo da Borsa Merci o da ricerca online» (prezzo, fonte, data, collegamento).",
            "Chiedi preventivi: si spuntano gli alimenti, si scrivono quantità in tonnellate e confezione (sfuso, sacchi, balloni), fornitore, contatto e luogo di consegna; il programma prepara il testo della richiesta da copiare e inviare. «Registra la richiesta» la conserva; lo stato (preparata, inviata, risposta ricevuta, annullata) si cambia nell'elenco.",
            "Avviso nelle razioni: nelle pagine Razioni di riferimento, Report fabbisogni e Costruisci razione, se un alimento ha un prezzo non certo (arancione o mancante) compare in alto il riquadro «⚠️ Prezzi non certi: il costo della razione è indicativo», con l'elenco degli alimenti e la fonte del prezzo. «Apri la scheda prezzi» porta qui; «Chiedi i preventivi per questi alimenti» apre Chiedi preventivi con quegli alimenti già spuntati.",
            "Preventivi ricevuti: si inseriscono alimento, fornitore, prezzo per tonnellata IVA esclusa, data, scadenza, consegna (in azienda o da ritirare), confezione, quantità minima e la richiesta a cui risponde. Il preventivo valido più recente diventa il prezzo di riferimento (blu).",
          ],
          spiegazione: [
            { titolo: "Quale prezzo vince", testo: [
              "Borsa Merci o ricerca online → sostituito dal preventivo → sostituito dalla fattura dell'anno in corso (o dall'autoproduzione). Un preventivo scaduto (passata la data di scadenza o, se non ha scadenza, dopo 90 giorni) non vale più: il prezzo torna arancione e resta quello del preventivo se è più recente del prezzo di Borsa o online. Un prezzo di Borsa o di ricerca online più vecchio di 90 giorni va aggiornato.",
              "Fatture: prezzo medio dell'anno pesato sulle quantità e calcolato sull'importo di ogni riga; si aggiorna da solo a ogni carico di fatture. Le fatture di piccole quantità non fanno da riferimento: sotto 1 tonnellata nell'anno (per gli integratori comprati a secchi, 0,1 tonnellate) il prezzo non è sicuro — per esempio i sacchi di crusca del 2026, 339 € per tonnellata, contro i 210–240 € della crusca sfusa.",
            ] },
            { titolo: "Autoproduzione", testo: [
              "Fieni: media pesata sulle quantità tra il costo di produzione della sezione Coltivazioni (campagna che si chiude nell'anno in corso: per il 2026 la 2025/2026) e gli acquisti dell'anno. Esempio fieno misto 2026: produzione 80,92 tonnellate a 211,67 € e acquisti 180,54 tonnellate a 85,86 € → 124,80 € per tonnellata. Il fieno di medica non si compra: vale solo il costo di produzione (2025/2026: 56,56 €).",
              "Peso dei balloni: il costo per tonnellata usa il peso di riferimento dei parametri di Coltivazioni (oggi 340 kg per ballone e per rotoballa). È un peso dichiarato, non misurato: pesare i balloni e aggiornare il peso.",
              "Orzo: prezzo delle fatture (farina o granella). Se c'è anche la granella prodotta in azienda, la scheda mostra i due prezzi e la media pesata sulle quantità e chiede di scegliere media, fatture o produzione; finché non si sceglie si usa la media. Esempio 2026: fatture 310,20 € (67,30 tonnellate), produzione 648,56 € (39,84 tonnellate), media 436,02 €.",
            ] },
          ],
          note: "Il prezzo scelto qui vale per tutte le razioni. Nelle tabelle delle razioni si può scrivere un altro prezzo per fare prove: vale solo in quella pagina (in Costruisci razione si salva con la razione) e non cambia la scheda prezzi.",
        },
        {
          pagina: "Razioni — bovini, suini e ovini: come è organizzata l'alimentazione", icon: "🥣",
          aCosaServe: "Le stesse regole valgono per le tre specie. Per ogni specie: le classi (gruppi di animali con lo stesso fabbisogno), i fabbisogni al giorno per capo, gli alimenti divisi per gruppo e i prezzi. Sono le stesse nel programma, nell'app Podere Verde e nei file della cartella ALIMENTARIA del computer. Le pagine Razioni di riferimento, Report fabbisogni e Costruisci razione funzionano allo stesso modo per tutte le specie: in alto si sceglie la specie. Sono attive per bovini, suini e ovini.",
          comeSiUsa: [
            "Classi: si sceglie la classe dell'animale; ogni classe ha i suoi fabbisogni al giorno per capo.",
            "Fabbisogni: energia, proteine, minerali, microelementi e vitamine, presi da fonti ufficiali e scritti con la fonte accanto. Alcuni sono fissi al giorno, altri si moltiplicano per la sostanza secca della razione.",
            "Alimenti: divisi in gruppi — foraggi, energetici, proteici, mangimi composti, integratori minerali — con la composizione per kg tal quale; valore vuoto = non analizzato o non dichiarato.",
            "Due tipi di alimentazione: naturale (foraggi e farine semplici) oppure con mangimi (foraggi, orzo e mangimi composti).",
            "Prezzi: quelli della scheda prezzi (Alimentaria → Controlla prezzi e chiedi preventivi): nero = sicuro (fatture dell'anno o autoproduzione), blu = preventivo, arancione = da verificare (Borsa Merci, ricerca online o listino). In ogni tabella delle razioni il prezzo si può cambiare a mano per fare prove.",
          ],
          spiegazione: [
            { titolo: "Bovini", testo: [
              "14 classi della ripartizione del 16/10/2026: box 1 (svezzati 5–7 mesi), box 2 (giovani 8–10 mesi), box 3 (femmine 10–16 mesi), box 4 (maschi 10–15 mesi), box 5 (maschi da 16 mesi), paddock femmine da 16 mesi, finissaggio maschi e femmine, vacca in lattazione, asciutta e al 9° mese, manza pronta per la monta, toro adulto, toro giovane. Il vitello sotto la madre beve il latte e non ha razione.",
              "Ambienti: box 1–10, paddock A, B, C, D, paddock femmine adulte, box finissaggio, campo I Bettacchi, incastrino, quarantena.",
              "Alimenti: fieno misto, fieno tagliato a inizio spigatura, fieno di medica, farina d'orzo, crusca, farina di soia, mangimi Veronesi Finissaggio e Mignini Bovisistem e Baby, Codibloc. Energia e proteine dei concentrati dalle tabelle INRA; minerali di orzo, soia, crusca e medica da Feedipedia; fieno misto: stima di letteratura, NON analizzato; mangimi dal cartellino del produttore (la PDI non è dichiarata); Codibloc dalla scheda Martens del 28/11/2023, senza rame.",
              "Fabbisogni: crescita con la formula Chianina dell'Università di Firenze (energia e PDI) e NASEM 2016 (proteina grezza); vacche, manza e toro approvati il 14/10/2026; calcio e fosforo delle vacche Agroscope; magnesio, sodio e microelementi NASEM 2016; vitamina A NRC. Calcio, fosforo e vitamina A del toro sono un'ipotesi: per i tori non esiste una tabella.",
              "Studi del 16–17/10/2026 (schede «Fabbisogni bovini alimentazione naturale» e «… alimentazione mangimi»): con i soli mangimi composti la razione costa di più che con le farine semplici; in quattro classi (box 2, finissaggio maschi, vacca in lattazione, vacca al 9° mese) la proteina non si copre senza una fonte proteica. Il rame e la vitamina A dipendono dal fieno, che non è analizzato: il Codibloc non contiene rame.",
              "Fuori dal programma, nella cartella ALIMENTARIA\\BOVINI del computer, c'è anche il file Excel «CALCOLO RAZIONI INTERATTIVO» per usare le stesse razioni senza collegamento al database.",
            ] },
            { titolo: "Suini", testo: [
              "12 classi per età: verro; scrofa vuota e in copertura; scrofa in gestazione giorni 0–84 e dal giorno 85 al parto; scrofa in lattazione (6, 8, 10 suinetti); suinetto sotto la scrofa (fino a circa 10 kg); svezzato (10–30 kg); magrone (30–60 kg); accrescimento (60–110 kg); ingrasso (110–140 kg); finissaggio (140–170 kg); pesante (oltre 170 kg).",
              "Tre tipi di accrescimento, perché le razze crescono a velocità diverse: lenta (cinta senese, nero apulo-calabrese), intermedia (cinta × large white, cinta × duroc), veloce (large white, duroc, duroc × large white, large white × meticcio). Il peso di ogni classe è uguale per tutti; cambia l'età in cui un suino ci arriva.",
              "Quando separare: fino a 30 kg tutti insieme; le Cinta e le Nero Apulo-Calabrese si separano a fine svezzamento, verso i 30 kg (circa 105 giorni), e passano a una razione meno proteica; gli incroci con la Cinta restano con le veloci fino a circa 60 kg (verso i 4 mesi), poi vanno con le lente se destinati a salumi o carne di qualità, con le veloci se l'obiettivo è il peso. Alla bilancia: se il suino più leggero di un gruppo pesa meno di tre quarti del più pesante, il gruppo va diviso.",
              "Andamento del peso: per ogni tipo di accrescimento c'è il peso previsto mese per mese (report «Fabbisogni dei suini per classe — Parte 1» del 19/10/2026). È una prima versione: si corregge man mano che nell'app si registrano le pesate.",
              "Fabbisogni: linee guida ANAS-CREA 2021 e NRC 2012 per le razze veloci; per cinta e apulo-calabrese i valori del suino Iberico (Università di Granada), per decisione del Dott. Bizzarri; intermedia = media tra lenta e veloce. Oltre i 170 kg le linee guida non hanno valori: si usano quelli della classe 140–170 kg.",
              "Nel programma: 24 classi (svezzati 10–20 e 20–30 kg; magrone, accrescimento, ingrasso e finissaggio per tipo di accrescimento, con cinta e apulo-calabrese separate; verro; scrofe vuote, in gestazione e in lattazione). Per ogni classe: kg di mangime al giorno e concentrazione per kg di energia netta, proteina grezza, lisina digeribile, calcio e fosforo digeribile; il fabbisogno al giorno è kg × concentrazione. Per la scrofa cinta o apulo-calabrese a fine gestazione anche la lisina totale minima (17,2 g al giorno).",
              "Alimenti dei suini: farine semplici (orzo, mais, frumento, crusca, favino, pisello, soia) con i valori Feedipedia per i suini; minerali (fosfato bicalcico, carbonato di calcio, sale) in grammi; mangimi dal cartellino (Suistar 20 e 30, Sprint 170, Scrofe Opti-Gest). Dei mangimi Progeo e dello Sprint 60 manca il cartellino: compaiono con «non dichiarato». Nei mangimi energia e fosforo digeribile non sono dichiarati; la lisina digeribile è stimata (totale × 0,85).",
              "Razioni di riferimento dei suini (schede del 19/10/2026): naturale per 22 classi (dai 30 kg, al costo più basso con farine e minerali, senza lisina di sintesi: per questo la proteina esce sopra il fabbisogno, nella cinta di circa il 50%); con mangimi per 17 classi (mangime della classe tagliato con orzo quanto basta per la lisina, più carbonato di calcio). Gli svezzati non hanno razione naturale: servono derivati del latte. Manca l'integratore di vitamine e oligoelementi per suini, da aggiungere alle razioni naturali.",
            ] },
            { titolo: "Ovini", testo: [
              "8 classi, decise dal Dott. Bizzarri il 19/10/2026: pecora vuota, pecora in gestazione (primi 3 mesi) e pecora a fine gestazione con un agnello, separate per razza (sopravissana 50 kg, suffolk 90 kg); ariete sopravissana in mantenimento (70 kg); agnello svezzato all'ingrasso (30 kg, 250 g al giorno). L'agnello sotto la madre beve il latte e non ha razione.",
              "Fabbisogni: ricerca del 13/10/2026 (INRA 2018 tramite Seguí Parpal 2020; NRC 1985), con energia in UFL (pecore e ariete) o UFV (agnello), PDI, proteina grezza, calcio e fosforo al giorno; magnesio, sodio, microelementi e vitamina A per kg di sostanza secca. Pecore al pascolo: mantenimento × 1,1. Fine gestazione: valori a 2 settimane dal parto.",
              "Alimenti: gli stessi dei bovini (fieni, orzo, crusca, soia, Codibloc al massimo 40 g ogni 100 kg di peso vivo). Solo alimentazione naturale: i mangimi e i minerali per bovini hanno troppo rame per le pecore (limite di legge 15 mg per kg di mangime; il fabbisogno è 10). Nelle razioni il calcio è almeno 1,5 volte il fosforo, contro i calcoli urinari di arieti e agnelli.",
            ] },
          ],
        },
        {
          pagina: "Razioni (bovini, suini e ovini) → Razioni di riferimento", icon: "📋",
          aCosaServe: "La razione da dare per capo al giorno a ogni classe della specie, con alimentazione naturale (foraggi e farine semplici) oppure con mangimi (foraggi, orzo e mangimi composti), e il suo costo. Per ogni classe è la razione al costo più basso che copre i fabbisogni con gli alimenti di oggi; le quantità sono arrotondate per eccesso (10 g; integratore minerale al grammo), così che ogni fabbisogno coperto arrivi almeno al 100%.",
          comeSiUsa: [
            "Scegliere la specie, il tipo di alimentazione (una sola alternativa) e la classe: compaiono gli alimenti con la quantità al giorno per capo (integratore minerale in grammi), il prezzo, il costo e la riga «TOTALE COSTO AL GIORNO».",
            "Scrivere il numero di capi della classe e scegliere il box o l'ambiente del gruppo: le quantità e i costi si moltiplicano per i capi; il riquadro «Totale del costo» dà il costo al giorno, al mese e all'anno, per capo e per tutti i capi, e il costo per kg di crescita.",
            "Sotto: il grafico del fabbisogno coperto e la tabella fabbisogno e apporto.",
            "Se con gli alimenti di quel tipo un fabbisogno non si può coprire, compare una nota rossa (per esempio, per i bovini con i mangimi: «la proteina non è coperta, serve una fonte proteica»).",
          ],
          note: "Per modificare una razione di riferimento: Costruisci razione → scegliere il tipo → «Carica la razione di riferimento», cambiare e salvare con un nome. La razione di riferimento resta com'è.",
        },
        {
          pagina: "Razioni (bovini, suini e ovini) → Report fabbisogni", icon: "📑",
          aCosaServe: "Le due schede dei fabbisogni (alimentazione naturale e con mangimi) dentro il programma, con i dati del database e i prezzi dell'anno in corso: per ogni classe il fabbisogno al giorno e, sotto, da quale alimento viene e quanto ne porta.",
          comeSiUsa: [
            "Scegliere il tipo di alimentazione e la tabella: Tabella 1 energia, proteine e macroelementi; Tabella 2 microelementi e vitamina A.",
            "In alto il riquadro «Anomalie»: classe per classe le voci non coperte, quelle eccessive e gli alimenti di cui manca il valore.",
            "Nella tabella: prima colonna la classe, la razione da dare e il costo per capo al giorno; nelle altre colonne la riga verde è il fabbisogno, sotto i contributi di ogni alimento, il totale e l'esito (✓ Coperto, Manca, ECCESSIVO). «non analizzato» = valore di un foraggio o di una granella aziendale che non si conosce; «non dichiarato» = valore che il produttore del mangime non dichiara.",
            "«Stampa» stampa la pagina.",
          ],
          note: "Le quantità sono quelle delle schede Word arrotondate per eccesso (le schede le scrivono con un decimale): per questo apporti e costi possono differire di poco dalle schede.",
        },
        {
          pagina: "Razioni (bovini, suini e ovini) → Costruisci razione", icon: "🥣",
          aCosaServe: "Costruire una razione per una classe alimento per alimento, vedendo subito quanto del fabbisogno è coperto (barre che si riempiono verso il 100%), dove manca o eccede, e quanto costa per capo e per il gruppo. Le razioni salvate sono condivise con l'app Podere Verde: ciò che si salva qui si apre anche nell'app, e viceversa.",
          comeSiUsa: [
            "Scegliere il tipo di alimentazione: «Libera» (tutti gli alimenti), «Alimentazione naturale» (niente mangimi composti) o «Alimentazione con mangimi» (foraggi, orzo e mangimi composti). Le tendine mostrano solo gli alimenti ammessi.",
            "Scegliere la classe. Si lavora prima su un capo: lasciare il numero di capi a 1. Con un tipo scelto, «Carica la razione di riferimento» riempie gli alimenti con la razione delle schede, da modificare.",
            "Nei righi degli alimenti scegliere dalla tendina l'alimento del gruppo (foraggio, energetico, proteico, mangime composto, integratore minerale) e scrivere la quantità al giorno per capo: kg, oppure grammi per l'integratore minerale.",
            "Le barre del grafico si allungano: rosso = il fabbisogno non è coperto; verde = coperto; arancione «ECCESSIVO» = energia o proteine oltre la soglia della classe (per i bovini 110%). «Dati incompleti» = un alimento della razione non ha quel valore. L'esito è deciso sul valore esatto: sotto il 100% è «manca» anche se per poco, e la percentuale si scrive con i decimali che servono (per esempio 99,9%).",
            "Quando la razione va bene, scrivere il numero di capi e scegliere il box: la riga «TOTALE COSTO AL GIORNO» e il riquadro «Totale del costo» danno il costo per capo e per tutti i capi, al giorno, al mese (30 giorni) e all'anno, e il costo per kg di crescita.",
            "Scrivere il nome della razione e premere «Salva razione». Per riaprirla, sceglierla dall'elenco «Razioni salvate (programma e app)»; «Salva modifiche» la aggiorna, «Salva come nuova» ne crea una copia, «Elimina» la cancella (anche dall'app). Accanto a ogni razione si vede se è stata salvata dal programma o dall'app e da chi.",
          ],
          spiegazione: [
            { titolo: "Prezzi", testo: ["Il prezzo di ogni alimento è quello della scheda prezzi (Controlla prezzi e chiedi preventivi). Nelle fatture il fornitore si riconosce dalla partita IVA; il fieno in rotoballe si converte con la rotoballa da 340 kg; per la farina d'orzo si aggiunge il trasporto della Cooperativa Ceri, diviso per le tonnellate di orzo della stessa fattura.", "Nella colonna «Prezzo € per tonnellata» c'è una casella con il prezzo di riferimento e, sotto, da dove viene (fatture e fornitore, autoproduzione, preventivo, oppure «da verificare» in arancione). Si può scrivere un altro prezzo: la casella diventa arancione, il costo si ricalcola e il riquadro «Totale del costo» avvisa «Prezzo scritto a mano». ↺ riporta al prezzo di riferimento; «Tutti i prezzi di riferimento» li riporta tutti. In Costruisci razione il prezzo cambiato si salva con la razione e torna quando la si riapre; il database dei prezzi non cambia.", "Se un alimento non ha prezzo compare «prezzo mancante» e il totale è segnalato come incompleto."], esempio: ["bovini, box 3: fieno misto 5,93 kg + farina d'orzo 2,5 kg + crusca 0,9 kg + farina di soia 0,62 kg + Codibloc 73 g: energia 118% (ECCESSIVO), rame 53% e vitamina A 42% (mancano, dati del fieno incompleti); 2,22 € per capo al giorno con i prezzi del 2026."] },
            { titolo: "Fabbisogni e apporti", testo: ["Gli apporti sono la somma, alimento per alimento, di quantità × composizione. I minerali e la vitamina A richiesti si moltiplicano per la sostanza secca della razione. Un valore non analizzato o non dichiarato non si conta e l'esito lo segnala con il nome dell'alimento.", "Bovini: il Codibloc non entra nella sostanza secca della razione: la scheda Martens non dichiara l'umidità. I minerali richiesti per kg di sostanza secca risultano quindi più bassi di circa lo 0,9%; il dato va chiesto a Martens Italia."] },
            { titolo: "Come sono scritti i numeri", testo: ["Quantità: kg con due decimali (tre se scritti così), integratore minerale in grammi, anche per tutti i capi. Costi delle singole righe e riga «TOTALE COSTO AL GIORNO» con tre decimali; il riquadro «Totale del costo» con due decimali. Il totale è calcolato sui valori esatti: la somma delle righe arrotondate può differire dal totale di 0,001 €."] },
          ],
          note: "Il controllo della capacità di ingestione (quanto il capo riesce davvero a mangiare) non è ancora inserito: per ora si leggono la sostanza secca della razione e la quota di concentrati.",
        },
        {
          pagina: "Razioni Suini", icon: "🥣",
          aCosaServe: "Composizione delle razioni giornaliere dei suini per categoria e per anno, e confronto tra consumo teorico e acquistato.",
          comeSiUsa: ["Composizione Razioni: kg al giorno per categoria, modificabili finché l'anno non viene bloccato.", "Consumi: per l'anno scelto, consumo teorico confrontato con quanto acquistato e speso, alimento per alimento."],
        },
      ]}
    />
  );
}
