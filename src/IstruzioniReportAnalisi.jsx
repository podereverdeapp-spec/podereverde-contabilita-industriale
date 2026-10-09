// Versione 239 — Istruzioni dei Report di Analisi (richiesti dal Dott. Bizzarri il 9 ottobre 2026):
// a cosa servono, come si leggono, come si calcolano, perché dipendono dai dati inseriti.
import PaginaIstruzioni from "./PaginaIstruzioni";

export default function IstruzioniReportAnalisi() {
  return (
    <PaginaIstruzioni
      titolo="Report di Analisi"
      introduzione="I Report di Analisi non danno solo numeri: dicono cosa sta andando bene e cosa no, cercano nei dati le cause, suggeriscono cosa fare e quanto vale farlo. Ci sono quattro report: Suini, Bovini, Ovini e Coltivazioni. Si ricalcolano da soli ogni volta che si aprono, con i dati inseriti fino a quel momento: per questo sono buoni solo quanto sono buoni i dati inseriti."
      sezioni={[
        {
          pagina: "1. Come si legge un report", icon: "📖",
          aCosaServe: "Ogni report segue lo stesso ordine, dal riassunto ai dettagli: prima le cose da sapere, poi le prove.",
          comeSiUsa: [
            "In sintesi: i numeri principali dell'anno (costo per UBA, costo per kg di carcassa, prezzo di vendita, peso dell'alimentazione), con un bollino che dice da dove vengono e quanto sono sicuri.",
            "In breve: il giudizio in poche righe.",
            "Cosa sta andando bene: i miglioramenti rispetto all'anno prima.",
            "Criticità: le cose che non vanno, prima quelle alte e poi le medie, ordinate per quanto valgono. Ogni criticità ha l'andamento negli anni, il dato, quanto costa, l'indagine, le cause, cosa fare e quanto vale intervenire.",
            "Segnali: le aree il cui costo per UBA è cresciuto più del 10% rispetto all'anno prima. Sono le criticità che potrebbero nascere.",
            "Quadri: quali aree pesano di più, come cambia la composizione negli anni, cosa è migliorato e cosa è peggiorato, da dove viene la differenza dei mangimi.",
            "Affidabilità dei dati: cosa va sistemato prima di fidarsi dei numeri.",
            "In alto si sceglie l'anno (o la campagna). Il pulsante «Ricalcola con i dati di adesso» rilegge tutto senza chiudere la pagina.",
          ],
          titoloSpiegazione: "I bollini delle cause",
          spiegazione: [
            { titolo: "Dimostrata", testo: "La causa si vede direttamente nei dati.", esempio: ["44 suini usciti dopo i 12 mesi: 31 vengono da lotti nati a gennaio e febbraio 2024. È un conteggio, non un'opinione."] },
            { titolo: "Probabile", testo: "I dati la indicano, ma non la provano da soli.", esempio: ["Nei mesi di picco nascono più suinetti di quanti se ne possano macellare quando sono pronti."] },
            { titolo: "Ipotesi", testo: "È una spiegazione possibile da verificare in stalla o nei campi.", esempio: ["Accrescimento lento: si potrà dire solo quando ci saranno le pesate."] },
          ],
        },
        {
          pagina: "2. Come si calcolano i numeri", icon: "🧮",
          aCosaServe: "I report usano gli stessi costi del resto del programma: non c'è un secondo calcolo dei costi.",
          comeSiUsa: [
            "Euro per UBA: i costi dell'anno attribuiti alla specie, con la stessa ripartizione del Report Costi (senza macello e lavorazioni delle carni), divisi per le UBA medie dell'anno (giorni di UBA produttivi diviso i giorni dell'anno).",
            "Euro per kg di carcassa: tutta la vita dei capi all'ingrasso macellati nell'anno e pesati. Ogni anno di mantenimento si divide tra le aree con le percentuali di quell'anno; il costo di nascita allo stesso modo, con la parte del costo rimasto dei genitori nella voce «Quota dei riproduttori»; il prezzo del capo comprato a parte.",
            "Le riforme (riproduttori macellati) sono escluse dal costo per kg: il loro mantenimento è già passato ai figli come costo di nascita.",
            "Se mancano dei pesi, il report dà due numeri: il costo per kg dei soli capi pesati e una stima con il peso medio anche per i non pesati.",
            "Prezzo di vendita: dalle fatture emesse della specie nell'anno (euro fatturati diviso chili fatturati).",
            "Mangimi: la differenza tra due anni si divide in quattro parti la cui somma è esatta: numero di animali, chili per animale, prezzo pagato e orzo di Podere rientrato come farina.",
            "Coltivazioni: costo al quintale di ogni prodotto (dalla sezione Coltivazioni dell'app) contro il prezzo di mercato della stessa campagna.",
            "I confronti esterni (prezzo del vitello da ristallo, disciplinare del Vitellone IGP, dati della pecora Sopravissana, andamento nazionale dell'orzo) sono scritti con la loro fonte e la loro data.",
          ],
          titoloSpiegazione: "Un esempio",
          spiegazione: [{
            titolo: "Il costo di un chilo di carcassa",
            testo: "Un suino è costato in tutta la sua vita 518 € e ha dato 112 kg di carcassa.",
            esempio: ["518 ÷ 112 = 4,63 € per kg", "Se il prezzo di vendita è 6,00 €, restano 1,37 € per kg.", "Se dello stesso gruppo 36 capi non hanno il peso, il report li stima con il peso medio dei pesati e li aggiunge."],
          }],
        },
        {
          pagina: "3. Perché i dati inseriti sono tutto", icon: "✍️",
          aCosaServe: "Un report può solo dire quello che i dati gli permettono di vedere. Dove i dati mancano, il report lo scrive tra le criticità o nell'affidabilità.",
          comeSiUsa: [
            "Ogni nascita va registrata nell'app, con i nati vivi.",
            "Ogni uscita al macello va chiusa con la data e il peso della carcassa (e se possibile il peso vivo).",
            "Gli agnelli e i capi venduti devono esistere nell'app: senza i capi il programma non può calcolare il costo per capo né per kg.",
            "Le pesate a date fisse e i chili di mangime dati a ogni gruppo sono la base per capire se una razione conviene.",
            "Dopo aver inserito dati nuovi, perché i report li usino vanno rielaborati il Report Costi e il Report Riproduttori.",
          ],
          note: "I report sono di sola lettura: non scrivono nulla nel database.",
        },
      ]}
    />
  );
}
