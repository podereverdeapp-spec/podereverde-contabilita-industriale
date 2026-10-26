import { useState } from "react";
import { C } from "./style";

// Versione 300 (decisione del Dott. Bizzarri del 26/10/2026, ore 13:14): le fatture di vendita non si caricano più
// con «Carica Fatture Attive». Claude legge in Aruba Fatturazione Elettronica TUTTE le fatture emesse (tutti gli anni),
// ne scarica i file XML con l'elenco e lo stato, e prepara un solo file .zip; il programma lo legge nella pagina
// «Leggi le Fatture di Aruba», confronta, registra e controlla. Il testo va aggiornato a mano se cambia la procedura.

export const PROMPT_FATTURE_EMESSE_ARUBA = `Lavoriamo sulle fatture di VENDITA (fatture emesse) di Società Agricola Podere Verde a r.l. (partita IVA IT15117871002) in Aruba Fatturazione Elettronica. Devi leggere TUTTE le fatture emesse, di tutti gli anni presenti in Aruba, e prepararmi un solo file .zip da caricare nel programma di contabilità industriale. Il confronto con il programma lo fa il programma: tu non leggi e non scrivi il database.

Cartella di lavoro sul computer: C:\\Users\\Filippo\\Downloads\\Podereverde contabilità industriale\\FATTURE EMESSE ARUBA (se non esiste, chiedimi il permesso e creala).

Ti servono: il browser integrato dell'app di Claude sul computer e il permesso di leggere e scrivere nella cartella di lavoro. Se ti manca uno dei due, fermati subito e dimmelo.

## Regole fisse (valgono per tutto il lavoro)

1. Le credenziali di Aruba NON le scrivi mai tu: le scrivo io nel browser. Tu apri la pagina e aspetti.
2. Apri SEMPRE direttamente https://fatturazioneelettronica.aruba.it/ (pagina «Accedi a Fatturazione elettronica»). NON passare dall'elenco dei servizi di Aruba: il suo link «Fatturazione elettronica» porta all'Area clienti delle PEC, dove le credenziali della fatturazione non valgono.
3. In Aruba solo LETTURA. Non creare, inviare, firmare, caricare, modificare, eliminare fatture; non salvare impostazioni; non chiudere avvisi.
4. Prima di scaricare o salvare file chiedimi il permesso, dicendo quanti file sono, da dove vengono e quanto pesano in tutto.
5. Una domanda alla volta. Prima di dirmi un numero, verificalo.

## 1. Entrata in Aruba
Apri https://fatturazioneelettronica.aruba.it/ nel browser e dimmi che la pagina è pronta. Aspetta il mio «fatto».

## 2. Elenco di tutte le fatture emesse
Apri la sezione delle fatture inviate (emesse) e leggi l'elenco di OGNI anno fiscale presente in Aruba, dal primo a quello in corso. Di ogni documento prendi, così come li mostra Aruba:
- anno fiscale, numero, data, tipo documento (TD01 fattura, TD04 nota di credito, TD24 fattura differita…);
- cliente e sua partita IVA (o codice fiscale);
- imponibile, imposta, totale;
- stato del documento in Aruba (per esempio Inviata, Consegnata, Non consegnata, Scartata) e, se c'è, l'identificativo del Sistema di Interscambio e la data di invio;
- il nome del file.
Dammi per ogni anno: quante fatture, quante note di credito, il totale degli imponibili, il primo e l'ultimo numero, e i documenti con stato diverso da «Consegnata». Se un anno non ha fatture dimmelo.

## 3. File XML
Chiedimi il permesso, poi salva nella cartella di lavoro il file XML di ogni documento dell'elenco (la fattura elettronica, NON il PDF). Se Aruba dà il file firmato (.xml.p7m), salva il file XML contenuto, senza firma. Nome: quello del file in Aruba, con estensione .xml.
Controlla che ogni file contenga il numero e la data del suo documento e che siano tutti: tanti file quanti documenti nell'elenco.

## 4. Elenco con gli stati
Nella stessa cartella crea il file «Elenco_Fatture_Emesse_Aruba.csv» (testo UTF-8, separatore punto e virgola, prima riga con i titoli esattamente così):
Anno fiscale;Numero;Data;Tipo documento;Cliente;Partita IVA del cliente;Imponibile;Imposta;Totale;Stato;Identificativo SdI;Data di invio;Nome del file
Regole: una riga per documento; date nella forma 2026-10-21; importi con il punto per i decimali e senza separatore delle migliaia (5362.83); note di credito con importi positivi come in Aruba (il tipo TD04 basta); «Nome del file» uguale al nome del file XML salvato.

## 5. Un solo file da caricare
Metti i file XML e l'elenco in un solo file «Fatture_Emesse_Aruba_AAAA-MM-GG.zip» (data di oggi) nella cartella di lavoro. Dimmi il percorso, quanti file contiene e quanto pesa.

## 6. Dove caricarlo
Nel programma di contabilità industriale: Emissione Fatture di Vendita → Controllo Fatturazione Attiva e Numero Progressivo → «Leggi le Fatture di Aruba» → scegliere il file .zip. Il programma confronta le fatture, registra le nuove, collega quelle emesse dal programma, segnala le differenze e aggiorna il numero progressivo.

## 7. Uscita
Quando ti scrivo «fatto», esci da Aruba con «Logout».

## Nota tecnica per leggere Aruba (solo lettura)
Dalla pagina di Aruba già aperta si possono chiamare i servizi che la pagina stessa usa, con le stesse intestazioni di sessione (Content-Type, aru-sub, aru-delegator, X-Requested-With: si leggono intercettando XMLHttpRequest.setRequestHeader mentre la pagina carica l'elenco delle fatture inviate):
- /services/FatturaFrontEnd/advancedSearch con l'anno fiscale: elenco delle fatture inviate;
- /services/FatturaFrontEnd/ExtractXmlInvoiceSend: il file XML di una fattura inviata.
Prima di usarli guarda, intercettandole, le richieste che la pagina fa quando apre l'elenco delle fatture inviate e quando scarica un XML, e usa gli stessi corpi e gli stessi nomi dei campi. Nessun altro servizio. Se un servizio non risponde, usa i pulsanti della pagina (filtro per anno, «Seleziona tutti», «Azioni» → «Scarica XML» / «Scarica Report Excel»), sempre dopo il mio permesso.`;

export default function PromptFattureEmesseAruba() {
  const [copiato, setCopiato] = useState(false);
  async function copia() {
    await navigator.clipboard.writeText(PROMPT_FATTURE_EMESSE_ARUBA);
    setCopiato(true);
    setTimeout(() => setCopiato(false), 2000);
  }
  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Prompt per Claude: Fatture Emesse in Aruba</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Il testo da dare a Claude perché legga in Aruba Fatturazione Elettronica tutte le fatture di vendita emesse, di tutti gli anni,
        e prepari un solo file .zip con i file XML e l'elenco degli stati. Si copia e si incolla in una chat nuova dell'app di Claude sul computer.
        Il file .zip si carica poi nella pagina «Leggi le Fatture di Aruba». Le credenziali di Aruba le scrive sempre chi lavora, mai Claude.
      </p>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ background: C.primary, color: "#fff", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Lettura delle fatture emesse in Aruba (tutti gli anni)</div>
          <button onClick={copia}
            style={{ background: copiato ? C.green : "rgba(255,255,255,0.2)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {copiato ? "✓ Copiato!" : "📋 Copia prompt"}
          </button>
        </div>
        <div style={{ padding: "8px 14px", fontSize: 12, color: C.muted, background: "#F7F7F5" }}>
          Serve l'app di Claude sul computer, con il browser integrato e il permesso sulla cartella «FATTURE EMESSE ARUBA».
          Claude lavora in sola lettura: in Aruba non crea, non invia e non cancella nulla, e il database non lo tocca.
        </div>
        <pre style={{ margin: 0, padding: 14, fontSize: 12, whiteSpace: "pre-wrap", fontFamily: "monospace", maxHeight: 500, overflow: "auto", color: C.text }}>
          {PROMPT_FATTURE_EMESSE_ARUBA}
        </pre>
      </div>
      <p style={{ fontSize: 12, color: C.muted }}>
        Nota: se cambia la procedura (indirizzi di Aruba, colonne dell'elenco, pagine del programma) questa pagina va aggiornata a mano.
      </p>
    </div>
  );
}
