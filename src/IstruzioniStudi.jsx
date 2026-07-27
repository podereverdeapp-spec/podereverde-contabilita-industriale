import PaginaIstruzioni from "./PaginaIstruzioni";

export default function IstruzioniStudi() {
  return (
    <PaginaIstruzioni
      titolo="Studi"
      introduzione="Analisi più ampie, organizzate per argomento — Mangimi e Foraggio (quantità e storico), e Accrescimento e Costi (peso/IPG collegati al costo dell'alimentazione, per fascia d'età)."
      sezioni={[
        {
          pagina: "Mangimi → Report Quantità Mangimi", icon: "🌾",
          aCosaServe: "Per ogni fornitore e prodotto di mangime: quanto costato nell'anno, e quanto acquistato in tonnellate e kilogrammi, con la destinazione (specie). Sotto, una seconda sezione con €/UBA-giorno e kg/UBA-giorno per ogni prodotto, per Bovini/Suini/Ovini.",
          comeSiUsa: [
            "Scegli l'anno e premi Calcola.",
            "Solo i prodotti già armonizzati (unità di misura confermata in \"Da Armonizzare\", dentro Fatture) entrano nel calcolo — quelli ancora in attesa appaiono in un riquadro giallo a parte, esclusi dal totale.",
            "La seconda sezione ripartisce i costi/quantità \"Generali\" (e \"Bovini e Ovini\", se presente) su Bovini/Suini/Ovini in proporzione ai loro UBA-giorni — stessa regola di Report Costi. In fondo, una riga TOTALE con la somma di tutti i mangimi.",
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
        {
          pagina: "Foraggio → Report Quantità Foraggio / Storico", icon: "🌱",
          aCosaServe: "Stessa identica struttura e logica di Mangimi (stesso modulo di calcolo, riusato), ma per il centro di costo Foraggio — fieno/rotoballe, che va tipicamente a Bovini e Ovini insieme (i suini non se ne cibano), non solo Bovini.",
          comeSiUsa: [
            "Stesso funzionamento di Mangimi: scegli l'anno, i prodotti non ancora armonizzati appaiono a parte.",
            "La destinazione \"Bovini e Ovini\" (se usata sulle fatture) si ripartisce solo tra queste due specie — i suini non ricevono mai una quota da questo centro di costo.",
          ],
        },
        {
          pagina: "Accrescimento e Costi → Bovini (Tutti gli Alimenti / Mangimi / Foraggio / Pascolo)", icon: "⚖️",
          aCosaServe: "Collega il peso/IPG per fascia d'età (curva di Gompertz Ponderata M/F, la stessa di \"Performance per Fascia d'Età\") al costo dell'alimentazione — 4 pagine separate, ciascuna isola un centro di costo diverso: Tutti gli Alimenti (Mangimi+Foraggio insieme), solo Mangimi, solo Foraggio, e Pascolo (segnaposto, dati non ancora disponibili — arriveranno con Coltivazione). Gli Integratori restano sempre esclusi, servono al benessere non alla crescita.",
          comeSiUsa: [
            "Solo Bovini per ora — Ovini e Suini si aggiungeranno in seguito.",
            "Scegli l'anno di riferimento (tranne nella pagina Pascolo, che non ne ha bisogno) e premi Ricalcola.",
            "Le pagine \"Performance per Fascia d'Età\", \"Solo Maschi\", \"Solo Femmine\" e \"Storico\" (nella stessa sottocartella) restano quelle già viste, con Mangimi+Foraggio già uniti nel loro calcolo economico.",
          ],
        },
      ]}
    />
  );
}
