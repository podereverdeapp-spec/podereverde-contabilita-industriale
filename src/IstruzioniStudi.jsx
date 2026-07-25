import PaginaIstruzioni from "./PaginaIstruzioni";

export default function IstruzioniStudi() {
  return (
    <PaginaIstruzioni
      titolo="Studi"
      introduzione="Analisi più ampie, organizzate per argomento — oggi contiene la sottocartella Mangimi, con i report di quantità e il loro andamento storico."
      sezioni={[
        {
          pagina: "Mangimi → Report Quantità Mangimi", icon: "🌾",
          aCosaServe: "Per ogni fornitore e prodotto di mangime: quanto costato nell'anno, e quanto acquistato in tonnellate e kilogrammi, con la destinazione (specie). Sotto, una seconda sezione con €/UBA-giorno e kg/UBA-giorno per ogni prodotto, per Bovini/Suini/Ovini.",
          comeSiUsa: [
            "Scegli l'anno e premi Calcola.",
            "Solo i prodotti già armonizzati (unità di misura confermata in \"Da Armonizzare\", dentro Fatture) entrano nel calcolo — quelli ancora in attesa appaiono in un riquadro giallo a parte, esclusi dal totale.",
            "La seconda sezione ripartisce i costi/quantità \"Generali\" su Bovini/Suini/Ovini in proporzione ai loro UBA-giorni — stessa regola di Report Costi. In fondo, una riga TOTALE con la somma di tutti i mangimi.",
          ],
        },
        {
          pagina: "Mangimi → Storico — Bovini / Suini / Ovini", icon: "📈",
          aCosaServe: "Confronto tra l'anno scelto e i 3 precedenti (+ media), per ogni prodotto di mangime: quantità, costo, €/UBA-giorno e kg/UBA-giorno per quella specie. In cima, due grafici con l'andamento del totale aggregato nel tempo.",
          comeSiUsa: [
            "Scegli l'anno più recente del confronto e premi \"📊 Calcola confronto\".",
            "I due grafici in cima mostrano il totale di tutti i mangimi insieme (non un singolo prodotto), con una linea tratteggiata per la media dei 4 anni.",
            "La tabella sotto mostra ogni prodotto singolarmente, con una riga TOTALE in fondo per €/UBA-gg e kg/UBA-gg.",
          ],
        },
      ]}
    />
  );
}
