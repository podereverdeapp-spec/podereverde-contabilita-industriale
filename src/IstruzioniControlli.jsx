import PaginaIstruzioni from "./PaginaIstruzioni";

// Istruzioni della cartella Controlli (versione 232).
export default function IstruzioniControlli() {
  return (
    <PaginaIstruzioni
      titolo="Controlli"
      introduzione={
        <>
          Questa cartella controlla che i dati dell'app Podere Verde e della Contabilità siano coerenti, prima che finiscano nei costi degli animali.
          I controlli partono da soli all'apertura del programma; quando trovano qualcosa, in cima a ogni pagina compare un avviso rosso con il numero di anomalie da decidere.
          <br /><br />
          Ogni anomalia resta scritta finché non è decisa: una decisione presa non viene riproposta. Accanto a ogni anomalia si vede chi ha inserito o cambiato per ultimo quel dato, dal registro delle modifiche attivo dal 07/10/2026.
        </>
      }
      sezioni={[
        {
          pagina: "Registro Controlli", icon: "🛡️",
          aCosaServe: "L'elenco delle anomalie trovate: madri non presenti al parto, lotti senza padre, capi acquistati senza prezzo o senza fattura, date di uscita incoerenti, parti senza lotto o troppo vicini, cespiti senza imputazione, righe di costo rimaste senza capo, fatture d'acquisto non abbinate, righe di fatture senza Tipo di Costo (che restano fuori dai costi), fornitori con fatture ma senza partita IVA.",
          comeSiUsa: [
            "In alto si sceglie l'elenco: «Da decidere», «Decisa», «Lasciata com'è», «Risolta», oppure il «Diario dei controlli» (quando sono stati fatti i controlli e con quale esito).",
            "«✏️ Correggi» (solo dove la correzione è semplice): mostra il valore attuale, si sceglie il nuovo valore e si conferma. Viene scritto solo quel campo di quel record, e solo se nessuno l'ha cambiato nel frattempo.",
            "«📝 Scrivi la decisione»: per le anomalie che si correggono altrove (per esempio nell'app). La decisione resta scritta con la data.",
            "«Lascia com'è»: il dato è giusto così; si scrive il motivo e l'anomalia non viene più proposta.",
            "«Riapri»: riporta una decisione tra quelle da decidere.",
            "«🔄 Esegui i controlli adesso»: ripete i controlli. Le anomalie che non si trovano più passano da sole tra le risolte.",
          ],
          note: "Prima di ricalcolare i costi, se ci sono anomalie da decidere il programma lo segnala e chiede conferma.",
        },
        {
          pagina: "Abbinamenti Fatture Acquisto", icon: "🔗",
          aCosaServe: "Collega ogni riga delle fatture d'acquisto animali al capo dell'app a cui si riferisce, con il motivo della proposta.",
          comeSiUsa: [
            "«Proposte sicure»: la matricola scritta in fattura è quella di un capo dell'app. Sotto si leggono i motivi; quelli in rosso sono differenze da guardare (prezzo, data, specie).",
            "«Esamina e conferma» mostra, campo per campo, la scheda dell'app e la fattura: dove la scheda è vuota si può scrivere il dato della fattura; dove sono diversi si sceglie quale tenere. Niente viene salvato prima di «Conferma l'abbinamento».",
            "«Rifiuta» / «Non è questo»: la proposta non verrà più fatta; si scrive il motivo.",
            "«Da valutare»: righe senza matricola; il programma propone i capi acquistati dallo stesso fornitore o con la stessa fattura, entrati entro 120 giorni. «Nessun capo corrisponde» le toglie dall'elenco con il motivo.",
            "«Già collegate, da confermare»: collegamenti fatti in passato e mai verificati; «Il collegamento è giusto» li conferma senza scrivere niente sulla scheda.",
            "«Trasporti»: le fatture di trasporto, che non si abbinano a un singolo capo.",
          ],
        },
        {
          pagina: "Registro delle Modifiche", icon: "🕓",
          aCosaServe: "Chi ha inserito, cambiato o cancellato cosa, quando, con il valore prima e dopo, nelle tabelle dell'app (animali, lotti, parti, coltivazioni, gasolio…) e in quelle della Contabilità (fatture, cespiti, fornitori, parametri…).",
          comeSiUsa: [
            "Filtrare per tabella, persona, numero del record o data.",
            "Le modifiche fatte senza un utente dell'app compaiono come «scrittura diretta sul database» (correzioni tecniche) o «app, senza utente collegato».",
            "«Esporta Excel» scarica le righe mostrate.",
          ],
          note: "Il registro esiste dal 07/10/2026: per i dati più vecchi l'autore non è noto.",
        },
      ]}
    />
  );
}
