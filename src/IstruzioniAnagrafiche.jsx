import PaginaIstruzioni from "./PaginaIstruzioni";

export default function IstruzioniAnagrafiche() {
  return (
    <PaginaIstruzioni
      titolo="Anagrafiche"
      introduzione="Le liste di fornitori e clienti dell'azienda — dati anagrafici semplici, usati automaticamente da tutto il resto dell'app (fatture, regole di classificazione, report) ogni volta che serve identificare una controparte."
      sezioni={[
        {
          pagina: "Fornitori", icon: "🏢",
          aCosaServe: "Elenco di tutti i fornitori con cui l'azienda ha rapporti — nome, Partita IVA, e le regole di classificazione automatica eventualmente associate a ciascuno.",
          comeSiUsa: [
            "Sfoglia o cerca un fornitore per nome.",
            "Un nuovo fornitore si crea automaticamente la prima volta che compare in una fattura caricata — non serve inserirlo qui manualmente in anticipo.",
            "Da qui puoi consultare quali regole di classificazione automatica (fissa o per parola chiave) sono già collegate a un fornitore specifico.",
          ],
        },
        {
          pagina: "Clienti", icon: "🤝",
          aCosaServe: "Stesso principio dei Fornitori, ma per i clienti a cui l'azienda vende (fatture attive).",
          comeSiUsa: [
            "Sfoglia o cerca un cliente per nome.",
            "Anche qui, un nuovo cliente si crea da solo alla prima fattura attiva caricata che lo cita.",
          ],
        },
      ]}
    />
  );
}
