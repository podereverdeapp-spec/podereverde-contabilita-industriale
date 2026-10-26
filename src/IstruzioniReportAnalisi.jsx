// Versione 239 — Istruzioni dei Report di Analisi (richiesti dal Dott. Bizzarri il 9 ottobre 2026):
// a cosa servono, come si leggono, come si calcolano, perché dipendono dai dati inseriti.
// Versione 248 (20/10/2026): testo approvato dal Dott. Bizzarri alle 11:28 (Word «Istruzioni_Report_di_Analisi_v248.docx»):
// introduzione, 1. Come è strutturato un report, 2. Come si calcolano i numeri, 3. Quali dati servono e cosa succede se mancano.
import PaginaIstruzioni from "./PaginaIstruzioni";

export default function IstruzioniReportAnalisi() {
  return (
    <PaginaIstruzioni
      titolo="Report di Analisi"
      introduzione={<b>Cosa sono i Report di analisi: I Report di Analisi non danno solo numeri: dicono cosa sta andando bene e cosa no, cercano nei dati le cause, suggeriscono cosa fare e quanto vale farlo. Ci sono quattro report: Suini, Bovini, Ovini e Coltivazioni. Si aggiornano con i dati inseriti e con l'ultimo calcolo dei costi salvato: per questo sono buoni solo quanto sono buoni i dati inseriti.</b>}
      sezioni={[
        {
          // Versione 248: punto 1 riscritto e approvato dal Dott. Bizzarri il 20/10/2026 (ore 11:28)
          pagina: "1. Come è strutturato un report", icon: "🧩",
          parti: [
            { blocchi: [
              "Ogni report (Suini, Bovini, Ovini) è una pagina unica, da leggere dall'alto in basso. Si va dal quadro generale ai dettagli: prima i risultati, poi le spiegazioni, infine le verifiche. È divisa in parti, ognuna con un titolo che ne indica il contenuto.",
              { numerato: true, elenco: [
                <><b>«I numeri principali dell'anno»</b>: quattro riquadri.
                  <ul style={{ paddingLeft: 20, margin: "4px 0" }}>
                    <li><b>Costo di mantenimento per UBA</b>: quanto è costato in un anno mantenere un animale (per maggiori dettagli sull'unità di misura UBA si rinvia al Glossario).</li>
                    <li><b>Costo per kg di carcassa</b>: quanto è costato produrre un chilo di carne. La carcassa è l'animale macellato e pulito, pronto per la vendita.</li>
                    <li><b>Prezzo di vendita della carcassa</b>: quanto si è incassato in media per ogni chilo venduto.</li>
                    <li><b>Peso dell'alimentazione</b>: quanta parte del costo totale è stata spesa per nutrire gli animali.</li>
                  </ul>
                  Sotto ogni numero, una riga lo confronta con l'anno precedente o spiega come è stato ottenuto. Un'etichetta colorata dice quanto ci si può fidare del numero: <b>verde</b> affidabile, <b>arancione</b> da verificare, <b>rosso</b> mancante.</>,
                <><b>«Il giudizio sull'anno»</b>: in poche righe, com'è andato l'anno.</>,
                <><b>«Cosa sta andando bene»</b>: ciò che è migliorato rispetto all'anno precedente.</>,
                <><b>«Criticità: analisi, cause e cosa si può fare»</b>: i problemi, dai più gravi ai meno gravi. Per ciascuno il report spiega:
                  <ul style={{ paddingLeft: 20, margin: "4px 0" }}>
                    <li>come è andato negli ultimi anni;</li>
                    <li>cosa dicono i numeri e quanto costa il problema in euro;</li>
                    <li>le cause trovate nei dati;</li>
                    <li>cosa si può fare e quanto si guadagnerebbe intervenendo.</li>
                  </ul>
                  Ogni causa ha un'etichetta che dice quanto è certa:
                  <ul style={{ paddingLeft: 20, margin: "4px 0" }}>
                    <li><b>Dimostrata</b>: si vede direttamente nei dati. <i>Esempio:</i> dei 44 suini usciti dopo i 12 mesi, 31 vengono da lotti nati a gennaio e febbraio 2024.</li>
                    <li><b>Probabile</b>: i dati la indicano ma non la provano da soli. <i>Esempio:</i> nei mesi di picco nascono più suinetti di quanti se ne possano macellare quando sono pronti.</li>
                    <li><b>Ipotesi</b>: una spiegazione da verificare in stalla o nei campi. <i>Esempio:</i> accrescimento lento, che si potrà dimostrare solo con le pesate.</li>
                  </ul></>,
                <><b>«Cosa è cambiato di più del 10% rispetto all'anno prima»</b>: le spese aumentate di oltre il 10% e di oltre 200 € in un anno. Non sono ancora problemi, ma vanno tenute d'occhio.</>,
                <><b>«Quali aree pesano di più»</b>: le spese dell'anno raggruppate per tipo (alimentazione, lavoro, macchine e strutture, altre spese di allevamento…), dalla più grande alla più piccola. Il pulsante <b>«Mostra le voci di conto»</b> apre il dettaglio di ogni gruppo.</>,
                <><b>«Come cambia la composizione negli anni»</b>: come si sono divise le spese tra i gruppi negli ultimi tre anni.</>,
                <><b>«Cosa è migliorato e cosa è peggiorato»</b>: per ogni gruppo di spesa, di quanto è salito o sceso rispetto all'anno precedente.</>,
                <><b>«Mangimi: numero di animali, quantità, prezzo»</b>: spiega se la spesa per i mangimi è cambiata perché c'erano più animali, perché ognuno ha mangiato di più o perché il mangime è costato di più.</>,
                <><b>«Affidabilità dei dati»</b>: l'elenco dei dati mancanti o incompleti da sistemare prima di fidarsi dei numeri.</>,
              ] },
            ] },
          ],
        },
        {
          // Versione 248: punto 2 riscritto e approvato dal Dott. Bizzarri il 20/10/2026 (ore 09:42)
          pagina: "2. Come si calcolano i numeri", icon: "🧮",
          aCosaServe: "Il report analizza le performance dell'azienda realizzate nel corso di un anno ed evidenzia gli scostamenti rispetto all'anno precedente. Serve a capire dove l'azienda guadagna e dove perde, e a decidere dove intervenire.",
          parti: [
            { titolo: "Cosa offre", blocchi: [
              "Per ogni specie (suini, bovini, ovini) il report calcola e spiega:",
              { elenco: [
                <><b>il costo di mantenimento degli animali</b>: il costo per UBA (vedi Glossario), diviso per voce di spesa (alimentazione, lavoro, ammortamenti e altre);</>,
                <><b>il costo di produzione della carne</b>: il costo per kg di carcassa (vedi Glossario) dei capi macellati nell'anno, comprensivo di tutta la loro vita, dalla nascita o dall'acquisto fino al macello;</>,
                <><b>il prezzo di vendita e il margine</b>: il prezzo per kg ricavato dalle fatture di vendita, confrontato con il costo di produzione;</>,
                <><b>gli scostamenti rispetto all'anno precedente</b>: le voci migliorate e quelle peggiorate; per queste ultime, la causa, gli interventi possibili e il loro valore.</>,
              ] },
            ] },
            { titolo: "Come funziona", blocchi: [
              "Il report si basa su due gruppi di dati.",
              <><b>I dati economici</b>, cioè costi e ricavi, registrati nella contabilità industriale tenuta con questo programma:</>,
              { elenco: [
                <>le fatture di acquisto e le spese senza fattura, in <i>Carica Dati Contabilità</i>;</>,
                <>le fatture di vendita, in <i>Emissione Fatture</i> (anche «Carica Fatture Attive»);</>,
                <>il costo annuo di macchine, attrezzature e strutture, in <i>Analisi Costi → Cespiti</i>;</>,
                <>le spese per le coltivazioni, in <i>Coltivazioni → Fatture Coltivazione</i>.</>,
              ] },
              <><b>I dati di allevamento e di coltivazione</b>, inseriti ogni giorno nell'app Podere Verde da chi lavora in azienda. Servono al programma per stabilire su quali animali e su quali colture ripartire i costi, e quanto hanno prodotto:</>,
              { elenco: [
                <><b>allevamento</b>: consistenza degli animali (quanti capi e per quanti giorni), nascite e parti, acquisti e uscite (macello, vendita, morte), pesate e incremento di peso, peso vivo e peso della carcassa al macello;</>,
                <><b>coltivazioni</b>: lavorazioni eseguite e giornate di lavoro impiegate, semine, concimazioni, raccolti e rese per ettaro, gasolio rifornito ai mezzi.</>,
              ] },
              "Con questi dati il programma:",
              { numerato: true, elenco: [
                "ripartisce i costi dell'anno tra le specie e tra gli animali, in proporzione al loro numero e ai giorni di permanenza in azienda;",
                "somma per ogni capo macellato i costi di tutta la sua vita e li divide per i chili di carcassa;",
                "confronta il risultato con il prezzo di vendita e con l'anno precedente.",
              ] },
            ] },
            { titolo: "Come si usa — ottenere il report di un anno", blocchi: [
              <>Prima di cominciare, il calcolo dei costi dell'anno deve essere salvato, come spiegato nelle istruzioni di <i>Analisi Costi</i> (Report Costi) e di <i>Animali</i> (Report Riproduttori).</>,
              { numerato: true, elenco: [
                <>Nel menu <i>Report di Analisi</i>, aprire la specie: <i>Suini</i>, <i>Bovini</i> o <i>Ovini</i>.</>,
                <>In alto, scegliere l'anno di riferimento dal menu <b>Anno</b>.</>,
              ] },
              "Il report si compone da solo e riporta in alto la data e l'ora del calcolo.",
            ] },
            { titolo: "Attenzione", blocchi: [
              { elenco: [
                "I dati si accumulano nel corso dell'anno. Dopo ogni nuovo inserimento di fatture o di movimenti degli animali, il calcolo dei costi va salvato di nuovo, come indicato nelle istruzioni di quelle sezioni. Finché non lo si fa, il report mostra i numeri dell'ultimo salvataggio.",
                "L'anno in corso è parziale: il report lo segnala e il confronto con l'anno precedente va letto come un andamento, non come un risultato definitivo.",
                <>Se i dati cambiano mentre il report è aperto, premere <b>«Ricalcola con i dati di adesso»</b>.</>,
              ] },
              <><b>La correttezza delle analisi e delle risultanze fornite dal report si fonda sulla correttezza e sull'aggiornamento dei dati inseriti.</b> Per questo i dati vanno inseriti in modo completo e tempestivo, seguendo le istruzioni di ciascuna sezione. Le mancanze che il report rileva sono indicate nella parte «Affidabilità dei dati», con quanto va sistemato.</>,
            ] },
          ],
        },
        {
          // Versione 248: punto 3 riscritto e approvato dal Dott. Bizzarri il 20/10/2026 (ore 10:31)
          pagina: "3. Quali dati servono e cosa succede se mancano", icon: "✍️",
          parti: [
            { blocchi: [
              "Ogni numero del report nasce da dati precisi, inseriti nell'app Podere Verde o nel programma. Di seguito, per ciascun dato: a quale calcolo serve e cosa succede se manca o è sbagliato.",
            ] },
            { titolo: "Dati inseriti nell'app Podere Verde", blocchi: [
              { elenco: [
                <><b>Nascite e parti, con il numero dei nati vivi.</b> Servono a calcolare il costo di nascita di ogni capo. Se mancano, il costo della mandria si divide su pochi nati e risulta troppo alto: il report lo segnala.</>,
                <><b>Uscite chiuse con data e peso della carcassa (e, se possibile, il peso vivo).</b> Servono al costo per kg di carcassa e alla resa al macello. Se il peso manca, il costo per kg si calcola sui soli capi pesati e il report dà anche una stima per tutti; quando i capi senza peso superano un quinto, il report lo indica come dato da sistemare.</>,
                <><b>Tutti i capi venduti, compresi gli agnelli.</b> Senza il capo registrato non si può calcolare né il costo per capo né il costo per kg.</>,
                <><b>Pesate a date fisse.</b> Servono a misurare l'accrescimento. Senza pesate il report non può dire se gli animali crescono poco, e la causa resta un'«ipotesi».</>,
              ] },
            ] },
            { titolo: "Dati inseriti nel programma", blocchi: [
              <>Nel programma si registrano i <b>costi</b> e i <b>ricavi</b> dell'azienda. Per il report contano tre cose.</>,
              { elenco: [
                <><b>I costi, attribuiti correttamente.</b> Ogni spesa, con o senza fattura, va registrata indicando a cosa è servita e per quali animali. Se l'attribuzione è sbagliata, il costo finisce sugli animali sbagliati e i risultati non sono più veri. Le spese che servono a tutti gli animali, come il gasolio, si registrano come «Generali»: il programma le divide tra le specie in proporzione agli animali presenti, e per questo il report le indica come «da verificare». Quando si sa a quale specie è servita una spesa, è sempre meglio indicarla. <i>(Vedi le Istruzioni Carica Fatture Passive e il Piano dei Conti, nella cartella Carica Dati Contabilità.)</i></>,
                <><b>Le quantità acquistate.</b> Per mangimi e foraggi serve sapere anche quanto si è comprato, in chili. Se la fattura riporta sacchi o balle, va indicato una sola volta per ogni prodotto a quanti chili corrispondono. Senza le quantità il report non può dire se si è speso di più perché si è comprato di più o perché il prezzo è salito. <i>(Vedi Carica Dati Contabilità → 4. Sistema i dati caricati → Armonizzare Unità Misura Fatture.)</i></>,
                <><b>I ricavi.</b> Le vendite di animali e di carne vanno registrate con le fatture di vendita, complete dei chili venduti. Da queste il report ricava il prezzo di vendita al chilo e il margine. <i>(Vedi Emissione Fatture di Vendita → Carica Fatture Attive.)</i></>,
              ] },
            ] },
            { titolo: "Attenzione", blocchi: [
              { elenco: [
                "Dopo aver inserito o corretto dati, il calcolo dei costi va salvato di nuovo, come spiegato al punto 2.",
                "I report sono di sola lettura: non modificano nessun dato.",
              ] },
            ] },
          ],
        },
      ]}
    />
  );
}
