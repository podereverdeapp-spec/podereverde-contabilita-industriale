import PaginaIstruzioni from "./PaginaIstruzioni";

export default function IstruzioniAnimali() {
  return (
    <PaginaIstruzioni
      titolo="Animali"
      introduzione="Tutto ciò che riguarda il calcolo dei costi per singolo animale — dalla registrazione dell'acquisto, al calcolo dell'UBA-giorni (la base per ripartire i costi), fino alla scheda che riassume la storia completa di ciascun animale. I dati anagrafici degli animali (nascite, uscite, pesi) restano in podereverdeapp.it: queste pagine leggono da lì, non li registrano."
      sezioni={[
        {
          pagina: "Report Acquisto Animali", icon: "🐄",
          aCosaServe: "Elenco delle righe fattura classificate come acquisto di animali (o come trasporto di animali in ingresso) — vanno tradotte manualmente in un nuovo animale o lotto su podereverdeapp.it, dato che l'inserimento anagrafico avviene sempre lì.",
          comeSiUsa: [
            "Consulta l'elenco delle righe in stato \"DA_ELABORARE\": ciascuna riporta specie, razza, quantità e importo.",
            "Vai su podereverdeapp.it e crea l'animale (o il lotto) corrispondente, inserendo anche il costo di acquisto con gli estremi della fattura.",
            "Se in cima alla pagina vedi un riquadro rosso \"Animali 'Acquistato' senza costo di acquisto\", significa che in podereverdeapp.it esiste già un animale marcato come acquistato ma senza il prezzo inserito — vai a completarlo da lì (o, in futuro, da qui una volta costruita la finestra di inserimento diretto).",
          ],
        },
        {
          pagina: "Report UBA", icon: "🐮",
          aCosaServe: "Calcola le UBA-giorni (Unità di Bestiame Adulto per giorno di presenza) di ogni animale in un anno specifico — è il numero alla base di come si ripartiscono tutti i costi dell'azienda tra le specie. Copre sia gli animali con BDN individuale sia i suinetti ancora nei lotti.",
          comeSiUsa: [
            "Scegli l'anno da calcolare in alto, poi premi il pulsante di calcolo.",
            "Il report include automaticamente solo gli animali davvero presenti in quell'anno: chi era già in azienda al 1° gennaio, chi è nato durante l'anno, chi è uscito durante l'anno (qualunque motivo), e chi era ancora presente al 31 dicembre.",
            "La colonna \"Stato\" mostra la situazione reale dell'animale (Attivo, Venduto, Macellato, Deceduto, Trasferito...) — evidenziata in rosso quando si tratta di un'uscita improduttiva (senza corrispettivo per l'azienda, es. morte).",
            "Clicca su un animale nell'elenco per aprire direttamente la sua Scheda Animale.",
            "Usa \"📥 Esporta Excel\" per il dettaglio completo, comprensivo anche della classificazione tecnica interna (colonna \"Categoria contabile\").",
          ],
        },
        {
          pagina: "Scheda Animale", icon: "🔍",
          aCosaServe: "La storia completa di un singolo animale (o unità di lotto): dati anagrafici, età e permanenza in azienda, pesi, e soprattutto tutti i costi che gli sono stati attribuiti anno per anno, fino al Valore Complessivo.",
          comeSiUsa: [
            "Cerca l'animale per BDN, nome o codice, oppure arrivaci direttamente cliccando una riga in Report UBA.",
            "La scheda mostra: intestazione con stato e qualifica (riproduttore/riproduttrice se pertinente); dati anagrafici (età calcolata dalla nascita, permanenza in azienda calcolata dall'ingresso — sono due date diverse, non confonderle); pesi; e infine i costi.",
            "Nella sezione costi trovi il costo iniziale (acquisto, o quota del lotto se acquistato in gruppo), la tabella anno per anno (mantenimento, nascita ereditata se riproduttore, quota scaricata sui figli), e in fondo il VALORE COMPLESSIVO — la somma di tutto.",
            "Se compare un avviso rosso \"Manca costo acquisto\", va completato da podereverdeapp.it (o da Report Acquisto Animali).",
            "Il pulsante \"🔄 Traghetta costi lotto→BDN\" in cima è un'utility di recupero: serve solo per i suinetti passati da lotto ad animale individuale PRIMA che questo passaggio diventasse automatico — nei casi recenti non serve più, avviene da solo al momento dell'assegnazione BDN in podereverdeapp.it.",
          ],
        },
        {
          pagina: "Report Riproduttori", icon: "🐄",
          aCosaServe: "Calcola e scarica sui figli il costo di un riproduttore (acquisto o crescita, meno il valore stimato di realizzo) — il cuore del meccanismo per cui il costo di un genitore non resta genericamente a carico dell'azienda, ma si attribuisce a chi ha effettivamente generato.",
          comeSiUsa: [
            "Scegli l'anno e premi il pulsante di elaborazione — il sistema calcola quanto ogni riproduttore attivo deve scaricare quell'anno, dividendolo tra i suoi figli nati nell'anno (individuali e nei lotti insieme).",
            "IMPORTANTE — ordine corretto: elabora sempre prima il Report Costi dello stesso anno, e solo dopo il Report Riproduttori — quest'ultimo aggiorna righe di costo già create dal primo.",
            "Quando un riproduttore esce davvero dall'azienda (macellato/venduto), usa \"⚖️ Applica conguagli\": confronta il valore stimato con quello reale e corregge la differenza sui figli dell'anno di uscita.",
          ],
        },
        {
          pagina: "Performance per Fascia d'Età", icon: "📐",
          aCosaServe: "Stima il peso di un animale all'ingresso e all'uscita di ogni fascia d'età, e l'IPG (Incremento Peso Giornaliero) — con due metodi affiancati: Metodo A (fasce indipendenti, semplice ma fragile con pochi animali) e Metodo B (curva di Gompertz, un'unica curva su tutti gli animali insieme, separata per maschi e femmine e poi ricomposta in una media ponderata sulla composizione reale). Tutte le tabelle includono anche il coefficiente UBA, il costo/consumo giornaliero e complessivo per fascia, e il \"Costo per kg incremento peso\" / \"Kg mangime per kg incremento peso\" (colonne accoppiate colorate) — usano il tasso mangime dell'anno scelto.",
          comeSiUsa: [
            "Si apre già calcolata — nessun anno da scegliere per i pesi, solo per il costo mangime.",
            "Se una fascia mostra \"Dati insufficienti\", significa che non ci sono abbastanza animali con quel dato — non si inventa un numero, si aspetta più dati.",
            "L'icona ⚠️ nel Metodo A segnala una proiezione instabile (peso mantenuto stabile invece di un valore innaturale).",
            "In fondo alla spiegazione, due pulsanti portano alle pagine \"Solo Maschi\" e \"Solo Femmine\" — le due curve separate che compongono la media ponderata del Metodo B.",
            "Il calcolo si affina da solo mano a mano che si registrano nuove pesate nella tab \"⚖️ Pesate\" di podereverdeapp.it.",
          ],
        },
        {
          pagina: "Performance — Solo Maschi / Solo Femmine", icon: "♂️♀️",
          aCosaServe: "Le due curve di Gompertz separate (una per sesso) che, ponderate sulla composizione reale di ciascuna fascia, formano il Metodo B della pagina principale — utile per capire quanto pesano davvero i due sessi separatamente, non solo il dato aggregato.",
          comeSiUsa: [
            "Si raggiungono dai due pulsanti nella pagina principale, o direttamente dal menu.",
            "Stessa struttura per fascia d'età, ma senza ponderazione — è la curva di un solo sesso alla volta.",
          ],
        },
      ]}
    />
  );
}
