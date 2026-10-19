import PaginaIstruzioni from "./PaginaIstruzioni";

export default function IstruzioniAlimentaria() {
  return (
    <PaginaIstruzioni
      titolo="Alimentaria"
      introduzione="La cartella dell'alimentazione degli animali di Podere Verde, allevati allo stato brado e semibrado: quanto si compra e quanto costa, le razioni dei suini e, per i bovini, i fabbisogni per classe e lo strumento per costruire le razioni vedendo subito fabbisogno coperto e costo. Obiettivo, deciso dal Dott. Bizzarri: ridurre il costo di alimentazione a parità di accrescimento."
      sezioni={[
        {
          pagina: "Costi e Quantità", icon: "📊",
          aCosaServe: "Mangimi, foraggio e integratori: quantità in kg e costo d'acquisto, totali e ripartiti tra bovini, suini e ovini (quota propria della specie più la quota dei consumi «Generali», secondo gli UBA-giorni).",
          comeSiUsa: ["Scegliere l'anno e leggere i totali per centro di costo; cliccare un centro di costo per il dettaglio per prodotto."],
        },
        {
          pagina: "Razioni Suini", icon: "🥣",
          aCosaServe: "Composizione delle razioni giornaliere dei suini per categoria e per anno, e confronto tra consumo teorico e acquistato.",
          comeSiUsa: ["Composizione Razioni: kg al giorno per categoria, modificabili finché l'anno non viene bloccato.", "Consumi: per l'anno scelto, consumo teorico confrontato con quanto acquistato e speso, alimento per alimento."],
        },
        {
          pagina: "Bovini — come è organizzata l'alimentazione", icon: "🐄",
          aCosaServe: "Le basi su cui lavorano le razioni dei bovini: classi, ambienti, fabbisogni, alimenti e prezzi. Sono le stesse nel programma, nell'app Podere Verde e nei file della cartella ALIMENTARIA\\BOVINI.",
          comeSiUsa: [
            "Classi: le 14 della ripartizione decisa il 16/10/2026 — box 1 (svezzati 5–7 mesi), box 2 (giovani 8–10 mesi), box 3 (femmine 10–16 mesi), box 4 (maschi 10–15 mesi), box 5 (maschi da 16 mesi), paddock femmine da 16 mesi, finissaggio maschi e femmine, vacca in lattazione, asciutta e al 9° mese, manza pronta per la monta, toro adulto, toro giovane. Il vitello sotto la madre beve il latte e non ha razione.",
            "Ambienti: box e paddock della stessa ripartizione (box 1–10, paddock A, B, C, D, paddock femmine adulte, box finissaggio, campo I Bettacchi, incastrino, quarantena).",
            "Fabbisogni al giorno per capo (tabella ci_fabbisogni_classi): energia (UFV per la crescita, UFL per vacche e toro), proteina digeribile nell'intestino (PDI), proteina grezza, calcio, fosforo, magnesio, sodio, rame, zinco, manganese, selenio, iodio, cobalto, vitamina A.",
            "Alimenti (tabella ci_alimenti_nutrizione), divisi in gruppi: foraggi (fieno misto, fieno tagliato a inizio spigatura, fieno di medica), energetici (farina d'orzo, crusca), proteici (farina di soia), mangimi composti (Veronesi Finissaggio, Mignini Bovisistem e Baby), integratore minerale (Codibloc). Composizione per kg tal quale; valore vuoto = non analizzato o non dichiarato.",
            "Prezzi: media delle fatture dell'anno in corso, pesata sulle quantità acquistate; listino solo dove non ci sono fatture.",
          ],
          spiegazione: [
            { titolo: "Da dove vengono i fabbisogni", testo: ["Crescita: formula Chianina dell'Università di Firenze per energia e PDI; proteina grezza NASEM 2016. Vacche, manza e toro: valori approvati dal Dott. Bizzarri il 14/10/2026; calcio e fosforo delle vacche Agroscope. Magnesio, sodio, microelementi: NASEM 2016 per kg di sostanza secca. Vitamina A: NRC. Calcio, fosforo e vitamina A del toro sono un'ipotesi dichiarata: per i tori non esiste una tabella."] },
            { titolo: "Da dove vengono i valori degli alimenti", testo: ["Energia e proteine dei concentrati: tabelle INRA. Minerali di orzo, soia, crusca e medica: Feedipedia (INRA-CIRAD-AFZ). Fieno misto: stima di letteratura (Ammar 2010), NON analizzato. Mangimi composti: cartellino del produttore; l'energia è calcolata dall'analisi del cartellino (equazione Agroscope) e la PDI non è dichiarata da nessun produttore. Codibloc: scheda Martens del 28/11/2023, senza rame."] },
            { titolo: "Cosa hanno detto gli studi del 16–17 ottobre 2026", testo: [
              "Schede «Fabbisogni bovini alimentazione naturale» e «… alimentazione mangimi» (cartella ALIMENTARIA\\BOVINI): con i soli mangimi composti la razione costa di più che con le farine semplici in tutte le classi in cui copre i fabbisogni, e in quattro classi (box 2, finissaggio maschi, vacca in lattazione, vacca al 9° mese) la proteina non si copre senza una fonte proteica.",
              "In entrambe le alimentazioni il rame e la vitamina A dipendono dal fieno, che non è analizzato: il Codibloc non contiene rame. Per vacche, manza e toro anche magnesio e manganese dipendono dal fieno. L'analisi del fieno misto e della medica è il dato che manca di più.",
            ] },
          ],
          note: "Fuori dal programma, nella cartella ALIMENTARIA\\BOVINI, c'è anche il file Excel «CALCOLO RAZIONI INTERATTIVO» per usare le stesse razioni senza collegamento al database.",
        },
        {
          pagina: "Costruisci razione (bovini)", icon: "🥣",
          aCosaServe: "Costruire una razione per una classe di bovini alimento per alimento, vedendo subito quanto del fabbisogno è coperto (barre che si riempiono verso il 100%), dove manca o eccede, e quanto costa per capo e per il gruppo. Le razioni salvate sono condivise con l'app Podere Verde: ciò che si salva qui si apre anche nell'app, e viceversa.",
          comeSiUsa: [
            "Scegliere la classe. Si lavora prima su un capo: lasciare il numero di capi a 1.",
            "Negli otto righi degli alimenti scegliere dalla tendina l'alimento del gruppo (foraggio 1 e 2, energetico 1 e 2, proteico 1 e 2, mangime composto, integratore minerale) e scrivere la quantità al giorno per capo: kg, oppure grammi per l'integratore minerale.",
            "Le barre del grafico si allungano: rosso = il fabbisogno non è coperto; verde = coperto; arancione «ECCESSIVO» = energia o proteine oltre la soglia della classe (110%). «Dati incompleti» = un alimento della razione non ha quel valore.",
            "Quando la razione va bene, scrivere il numero di capi e scegliere il box: la riga «TOTALE COSTO AL GIORNO» e il riquadro «Totale del costo» danno il costo per capo e per tutti i capi, al giorno, al mese (30 giorni) e all'anno, e il costo per kg di crescita.",
            "Scrivere il nome della razione e premere «Salva razione». Per riaprirla, sceglierla dall'elenco «Razioni salvate (programma e app)»; «Salva modifiche» la aggiorna, «Salva come nuova» ne crea una copia, «Elimina» la cancella (anche dall'app). Accanto a ogni razione si vede se è stata salvata dal programma o dall'app e da chi.",
          ],
          spiegazione: [
            { titolo: "Prezzi", testo: ["Il prezzo di ogni alimento è la media delle fatture dell'anno in corso pesata sulle quantità acquistate (vista ci_v_prezzi_alimenti_anno). Il fornitore si riconosce dalla partita IVA. Il fieno in rotoballe si converte con la rotoballa da 340 kg. Per la farina d'orzo si aggiunge il trasporto della Cooperativa Ceri, diviso per le tonnellate di orzo della stessa fattura. Se nell'anno non ci sono fatture si usa il prezzo di listino, scritto in giallo; se manca anche quello compare «prezzo mancante» e il totale è segnalato come incompleto. A inizio anno, finché non arrivano le prime fatture del nuovo anno, alcuni prezzi possono mancare."], esempio: ["box 3, fieno misto 5,93 kg + farina d'orzo 2,5 kg + crusca 0,9 kg + farina di soia 0,62 kg + Codibloc 73 g: energia 118% (ECCESSIVO), rame 53% e vitamina A 42% (mancano, dati del fieno incompleti); 2,22 € per capo al giorno con i prezzi del 2026."] },
            { titolo: "Fabbisogni e apporti", testo: ["Gli apporti sono la somma, alimento per alimento, di quantità × composizione. I minerali e la vitamina A richiesti si moltiplicano per la sostanza secca della razione. Un valore non analizzato o non dichiarato non si conta e l'esito lo segnala con il nome dell'alimento."] },
          ],
          note: "Il controllo della capacità di ingestione (quanto il capo riesce davvero a mangiare) non è ancora inserito: per ora si leggono la sostanza secca della razione e la quota di concentrati.",
        },
      ]}
    />
  );
}
