import PaginaIstruzioni from "./PaginaIstruzioni";

export default function IstruzioniStudi() {
  return (
    <PaginaIstruzioni
      titolo="Studi"
      introduzione="Analisi di sola lettura su prodotti e quantità — non calcolano né scrivono nulla di nuovo, guardano dati già esistenti da un'angolatura diversa rispetto alle pagine di Fatture."
      sezioni={[
        {
          pagina: "Articoli & Prezzi", icon: "🏷️",
          aCosaServe: "Confronta i prezzi pagati per lo stesso prodotto nel tempo, anche tra fornitori diversi — utile per capire se un prezzo è aumentato o se conviene cambiare fornitore.",
          comeSiUsa: [
            "Cerca un prodotto per nome, oppure filtra per fornitore/cliente o per tipo (acquisti/vendite).",
            "Ogni riga mostra prezzo minimo, medio, massimo e più recente — se il prezzo più recente è in rosso, ha raggiunto un nuovo massimo storico.",
            "Clicca sullo scostamento percentuale per vedere il grafico dell'andamento nel tempo.",
            "Clicca sulla riga per espandere lo storico completo di acquisti/vendite di quel prodotto.",
          ],
        },
        {
          pagina: "Report Quantità Mangimi", icon: "🌾",
          aCosaServe: "Per ogni fornitore e prodotto di mangime: quanto costato nell'anno, e quanto acquistato in tonnellate e kilogrammi, con la destinazione (specie). Il primo di una serie di report di quantità, uno per ciascun centro di costo tracciato.",
          comeSiUsa: [
            "Scegli l'anno e premi Calcola.",
            "Solo i prodotti già armonizzati (unità di misura confermata in \"Da Armonizzare\") entrano nel calcolo — quelli ancora in attesa appaiono in un riquadro giallo a parte, esclusi dal totale, con l'invito ad andare a completarli.",
            "Ogni riga è una combinazione fornitore + prodotto + destinazione — se lo stesso prodotto va a specie diverse, compaiono righe separate.",
          ],
        },
      ]}
    />
  );
}
