import PaginaIstruzioni from "./PaginaIstruzioni";

// Istruzioni della cartella Coltivazioni. L'introduzione è su più paragrafi: uso solo
// elementi ammessi dentro un paragrafo (testo, <strong>, <br />), così il componente
// condiviso PaginaIstruzioni resta invariato.
export default function IstruzioniColtivazioni() {
  return (
    <PaginaIstruzioni
      titolo="Coltivazioni"
      introduzione={
        <>
          Questa sezione è fatta per chi sta sul trattore, ed è anche una fonte importante per tutta la squadra aziendale. Serve a controllare quanto costa coltivare e a capire se conviene produrre in azienda oppure comprare.
          <br /><br />
          Per ogni campagna agraria (dal 1° settembre al 31 agosto), per ogni campo e per ogni coltura mostra quanto è costato: semi, concimi, fitosanitari, lavorazioni fatte da terzi e lavorazioni fatte con i mezzi dell'azienda, reti, film e altre spese. Poi mostra quanto si è raccolto e quanto costa ogni prodotto: fieno, granella, sementi, paglia.
          <br /><br />
          Il costo del prodotto fatto in azienda si mette accanto a quanto costa lo stesso prodotto comprato fuori. Così si vede, campo per campo e anno per anno, dove produrre in proprio conviene e dove no. Sono informazioni che servono a chi lavora i campi, a chi governa gli animali e a chi decide cosa seminare, cosa comprare e cosa vendere.
          <br /><br />
          La sezione è un'isola dentro il programma di contabilità industriale:
          <br />• <strong>riceve</strong> dal programma le fatture connesse alla coltivazione e i prezzi del prodotto acquistato;
          <br />• <strong>legge</strong> i lavori registrati nella sezione Coltivazione dell'app Podere Verde: semine, lavorazioni, concimazioni, raccolte;
          <br />• <strong>non manda niente</strong> al programma: i costi degli animali, i report e le fatture restano esattamente come sono;
          <br />• <strong>non modifica niente</strong>: qui si consulta soltanto; i lavori si registrano nell'app Podere Verde.
          <br /><br />
          Il Programma di semina e concimazione è un piano per la campagna che viene. Non è un costo e in questa sezione non viene mai sommato.
        </>
      }
      sezioni={[]}
    />
  );
}
