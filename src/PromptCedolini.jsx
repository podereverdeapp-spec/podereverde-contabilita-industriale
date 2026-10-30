import { useState } from "react";
import { C } from "./style";
import { ScelteDelPrompt, mancaQualcosa, intestazione, riempi, anniScelta, annoDiOggi } from "./SceltePrompt";

// Versione 270 (21/10/2026; codici di festività e malattia corretti nella 271): prompt per il carico dei cedolini, provato con il Dott. Bizzarri sulle buste
// paga e sui riepiloghi da gennaio ad agosto 2026 (tutti i controlli tornati). Salvato nella cartella
// «3. Carica Costi del Lavoro», come il prompt delle fatture passive.

const PROMPT_CEDOLINI = `Sei il contabile della Società Agricola Podere Verde a r.l. (partita IVA IT15117871002). Devi leggere le buste paga e i riepiloghi paghe e contributi di un anno, preparare un file Excel per il programma di contabilità industriale e dividere i cedolini per persona.

I file sono quelli della cartella LAVORO del cloud della società:
- «BUSTE PAGA\\ANNO AAAA»: un PDF per mese («MM.AAAA_BUSTE PAGA.pdf»), un cedolino per pagina, più i PDF di tredicesima e quattordicesima;
- «RIEPILOGO PAGHE E CONTRIBUTI\\ANNO AAAA»: un PDF per mese.

Te li do in uno di questi due modi:
- allegati a questa chat;
- oppure con l'indirizzo della cartella LAVORO sul computer: [INSERISCI QUI IL PERCORSO, es. Z:\\SOCIETA\\SOCIETA' AGRICOLA PODERE VERDE A R.L\\LAVORO] e l'anno: [INSERISCI QUI L'ANNO].

Questo lavoro richiede che tu possa leggere i PDF e creare file (Excel, PDF, zip). Se non puoi farlo, fermati subito e dimmelo.
Non inventare nessun numero: se un dato non si legge con certezza, lascia la cella vuota e scrivilo nel foglio «Anomalie». Non cancellare e non modificare mai i file originali.

## 1. Leggi ogni cedolino (una pagina = una persona)

Dall'intestazione: mese retribuito, anno, cognome e nome, codice fiscale, qualifica. Se in alto c'è «14a MENS.» è la quattordicesima, se c'è «13a MENS.» è la tredicesima; altrimenti è la busta mensile.

Dai riquadri in basso:
- TOTALE LORDO, IMPON. CONTR. SOC., TOTALE CONTRIBUTI SOCIALI (a carico del lavoratore), NETTO BUSTA;
- DATI STATISTICI: TFR MESE. Per i collaboratori e gli amministratori il TFR è zero: gli altri numeri di quella zona (ore, data e ora di stampa) non sono TFR;
- i residui alla fine del mese: FERIE RES., PERMESSI RES., ROL. RES., FEST. RES. (se la casella è vuota il residuo è zero).

Le voci, riga per riga: codice, descrizione, ore o giorni, base, competenza, trattenuta. Assegna ogni numero alla colonna sotto cui si trova. La voce 9424 «ULTERIORE DETRAZIONE MESE» sta nella colonna DATI STATISTICI: non è né competenza né trattenuta.

Dalle voci calcola:
- ore ordinarie: 8001;
- ore di straordinario: 8025 e 8006;
- ore di festività godute: 8109 e 8118 (la 8108 «FEST. NON GODUTA» è una festività pagata ma non goduta: non va contata);
- giorni di ferie godute: 8111, 106, 8101;
- ore di permessi goduti: 8205;
- ore di ROL goduti: 8116;
- giorni di malattia: 8864 «GIORNI RETR. AGR. TIPO M» (le voci 8875, 8877 e 8350 sono le indennità di malattia, in ore o in euro: non contarle come giorni);
- giorni retribuiti: 8212 (giorni di lavoro, tipo O) più 8864 (giorni di malattia, tipo M);
- TFR liquidato: 8400 (solo nella busta di chi lascia l'azienda);
- crediti fiscali anticipati in busta: 9824, 8992, 507, 1117. Non sono costo: l'azienda li recupera con l'F24.
Se trovi voci di ore o giorni con codici diversi da questi, scrivile nel foglio «Anomalie» con codice e descrizione.

## 2. Leggi ogni riepilogo paghe e contributi

Salari, Stipendi, NETTO IN BUSTA, «Ente : INPS AGRICOLTURA c/azienda», «Ente : INPS AGRICOLTURA c/dipendente», «Contributi INAIL», «Contributi c/Azie» e «Contributi c/collaboratori» (collaboratori e amministratori), «TOTALE irpef dovuta del periodo», crediti da compensare in F24 (bonus fiscali, trattamento integrativo, crediti IRPEF del 730).

## 3. Assegna la tredicesima e la quattordicesima al mese giusto

Stanno nel riepilogo del mese in cui sono state pagate, che può essere diverso da quello scritto sul PDF. Trova il mese in cui: Salari + Stipendi del riepilogo = lordi delle buste mensili di quel mese + lordi della mensilità aggiuntiva. Se non lo trovi, scrivilo nel foglio «Anomalie».

## 4. Calcola il costo di ogni persona, mese per mese

- Dipendenti: costo = totale lordo − TFR liquidato + TFR del mese + quota di INPS c/azienda + quota di INAIL.
- Collaboratori e amministratori (qualifica COLLABORATORE o AMMINISTRATORE): costo = totale lordo + quota di «Contributi c/Azie».
- Le quote si dividono, mese per mese, in proporzione all'imponibile contributivo di ciascuno: i dipendenti tra loro (compresi tredicesima e quattordicesima pagate in quel mese), i collaboratori tra loro. Arrotonda al centesimo; l'ultimo della lista prende il resto, così la somma delle quote è uguale al totale del riepilogo.
- Il TFR liquidato si toglie perché è già entrato nel costo degli anni passati, mese per mese.
- I crediti fiscali anticipati in busta non entrano nel costo.

## 5. Controlli, mese per mese

1. Somma dei lordi delle buste del mese (meno i TFR liquidati) = Salari + Stipendi del riepilogo.
2. Somma dei netti delle buste del mese = NETTO IN BUSTA del riepilogo.
3. Somma delle quote = totale del riepilogo, per INPS c/azienda, INAIL e Contributi c/Azie.
4. Per ogni cedolino: somma delle competenze (senza i crediti fiscali) = totale lordo.
5. Somma dei costi del mese = Salari + Stipendi + TFR del mese + INPS c/azienda + INAIL + Contributi c/Azie.
Tolleranza: 1 centesimo. Ogni controllo che non torna va nel foglio «Anomalie», con mese, persona e differenza.

## 6. L'Excel

Nome del file: «Costi_del_lavoro_AAAA.xlsx». Cinque fogli, con queste intestazioni esatte, in questo ordine. Gli importi sono numeri con due decimali, mai formule; il mese è un numero da 1 a 12; il tipo è «mensile», «tredicesima» o «quattordicesima».

Foglio «Costi e ore per dipendente» (una riga per persona, mese e tipo):
Anno | Mese | Tipo | Cognome e nome | Codice fiscale | Qualifica | Totale lordo | di cui TFR liquidato | TFR del mese | Imponibile contributivo | INPS azienda (quota) | INAIL azienda (quota) | Contributi collaboratori azienda (quota) | COSTO TOTALE | Contributi a carico del lavoratore | Netto in busta | Crediti fiscali anticipati in busta (non costo) | Ore ordinarie | Ore straordinario | Ore festività godute | Giorni ferie godute | Ore permessi goduti | Ore ROL goduti | Giorni malattia | Giorni retribuiti | Ferie residue | Permessi residui | ROL residui | Festività residue | PDF | Percorso archivio | File di origine

Foglio «Voci dei cedolini» (una riga per voce):
Anno | Mese | Tipo | Cognome e nome | Codice | Descrizione | Ore o giorni | Base | Competenza | Trattenuta

Foglio «Contributi da versare» (una riga per mese):
Anno | Mese | Tipo | Salari | Stipendi | Netto in busta | INPS agricoltura c/azienda | INPS agricoltura c/dipendente | INPS collaboratori (azienda + collaboratore) | INAIL | IRPEF e addizionali | Crediti da compensare in F24 | Controllo lordi (cedolini / riepilogo) | Lordi OK | Controllo netti (cedolini / riepilogo) | Netti OK | File di origine

Foglio «Riepilogo per dipendente» (una riga per persona, totali dell'anno):
Anno | Cognome e nome | Mesi | Totale lordo | TFR liquidato | TFR maturato | INPS azienda | INAIL azienda | Contributi collaboratori | COSTO TOTALE | Netto in busta | Ore ordinarie | Ore straordinario | Ore festività godute | Giorni ferie godute | Ore permessi | Ore ROL | Giorni malattia | Giorni retribuiti | Ferie residue (ultimo mese) | Festività residue (ultimo mese) | Costo per ora ordinaria

Foglio «Anomalie»: una riga per ogni cosa da controllare, scritta per esteso.

## 7. I PDF divisi per persona

Ogni pagina diventa un PDF a sé, con nome «AAAA-MM_COGNOME NOME_cedolino.pdf» (per le mensilità aggiuntive «_tredicesima.pdf» o «_quattordicesima.pdf», con il mese trovato al punto 3). Nella colonna «PDF» scrivi questo nome; nella colonna «Percorso archivio» scrivi «COGNOME NOME/AAAA/AAAA-MM_cedolino.pdf» (oppure «_tredicesima.pdf», «_quattordicesima.pdf»).
Metti tutti i PDF in un file «Cedolini_AAAA.zip».

## 8. Dove salvare

Se hai la cartella LAVORO sul computer, salva l'Excel e lo zip nella cartella «BUSTE PAGA\\ANNO AAAA», senza sovrascrivere nulla. Se i file erano allegati, dammi l'Excel e lo zip da scaricare.

Al termine scrivimi:
- quante buste hai letto, per mese, e quante persone;
- se i controlli del punto 5 tornano tutti, o quali no;
- le anomalie;
- il costo totale dell'anno e il costo di ogni persona;
- il nome dell'Excel e dello zip, da caricare nel programma con «Carica Costi del Lavoro».`;

// Versione 335 (ordine del 30/10/2026 ore 19:24): anno e cartella LAVORO si scelgono sopra «Copia prompt»; il programma li scrive nel testo.
const LAVORO = "Z:\\SOCIETA\\SOCIETA' AGRICOLA PODERE VERDE A R.L\\LAVORO";
export default function PromptCedolini() {
  const [copiato, setCopiato] = useState(false);
  const [valori, setValori] = useState({ anno: String(annoDiOggi()), cartella: LAVORO });
  const imposta = (k, v) => setValori(x => ({ ...x, [k]: v }));
  const campi = [
    { chiave: "anno", etichetta: "Anno delle buste paga", obbligatorio: true, opzioni: anniScelta().map(a => ({ valore: String(a), testo: String(a) })) },
    { chiave: "cartella", etichetta: "Cartella LAVORO sul computer (se i PDF non si allegano alla chat)", largo: true },
  ];
  const fermo = mancaQualcosa(campi, valori);
  const testo = intestazione([["Anno delle buste paga", valori.anno], ["Cartella LAVORO sul computer", valori.cartella]])
    + riempi(PROMPT_CEDOLINI, [
      ["[INSERISCI QUI IL PERCORSO, es. Z:\\SOCIETA\\SOCIETA' AGRICOLA PODERE VERDE A R.L\\LAVORO]", valori.cartella.trim() || "(nessuna: i PDF sono allegati alla chat)"],
      ["[INSERISCI QUI L'ANNO]", valori.anno],
      ["AAAA", valori.anno],
    ]);
  async function copia() {
    if (fermo) return;
    await navigator.clipboard.writeText(testo);
    setCopiato(true);
    setTimeout(() => setCopiato(false), 2000);
  }
  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Prompt per carico cedolini</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Il testo da dare a Claude per leggere le buste paga e i riepiloghi paghe e contributi di un anno: copialo e incollalo in una chat
        di Claude, insieme ai PDF della cartella LAVORO (oppure con l'indirizzo della cartella, se Claude può leggere il computer).
        Claude restituisce l'Excel dei costi del lavoro e lo zip con i cedolini divisi per persona.
      </p>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ background: C.primary, color: "#fff", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Cedolini e riepiloghi paghe e contributi</div>
          <button onClick={copia} disabled={fermo}
            style={{ background: copiato ? C.green : fermo ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.2)", color: fermo ? "rgba(255,255,255,0.5)" : "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: fermo ? "default" : "pointer" }}>
            {copiato ? "✓ Copiato!" : "📋 Copia prompt"}
          </button>
        </div>
        <ScelteDelPrompt campi={campi} valori={valori} imposta={imposta} />
        <pre style={{ margin: 0, padding: 14, fontSize: 12, whiteSpace: "pre-wrap", fontFamily: "monospace", maxHeight: 520, overflow: "auto", color: C.text }}>
          {testo}
        </pre>
      </div>
    </div>
  );
}
