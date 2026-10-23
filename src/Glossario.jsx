// Versione 248 (20/10/2026) — Glossario del programma.
// Decisione del Dott. Bizzarri: il Glossario cresce sezione per sezione; contiene solo i termini a cui
// rimandano le istruzioni già approvate.
// Versione 261 (21/10/2026): 16 voci, quelle richiamate dalle Istruzioni Carica Fatture Passive e dal
// Piano dei Conti (stesso testo del documento Word «Glossario»). Nei testi **parola** = grassetto.
// Versione 280 (23/10/2026): voce «Lettura a pagine». Versione 281: estesa alle altre pagine di consultazione.
import { C } from "./style";

const VOCI = [
  {
    termine: "Ammortamento e quota di ammortamento",
    testi: ["Il modo di mettere nei costi un bene che dura più anni. Il prezzo del bene non entra tutto nell'anno in cui si compra: si divide sugli anni in cui il bene serve. La parte che entra ogni anno si chiama **quota di ammortamento**.", "Esempio: un'attrezzatura da 3.000 € che dura 10 anni porta nei costi 300 € l'anno per dieci anni.", "Nel programma la durata si sceglie secondo quanto il bene dura davvero in azienda, non secondo le regole fiscali: vedi «Contabilità industriale»."],
    dove: "Istruzioni Carica Fatture Passive; Il Piano dei Conti; Analisi Costi → Cespiti",
  },
  {
    termine: "Area",
    testi: ["Il grande capitolo di spesa a cui appartiene una riga di fattura: per esempio Allevamento, Coltivazione, Lavoro, Consulenze. È la prima delle quattro indicazioni che si danno a ogni riga. L'elenco completo e il suo significato sono nel documento «Il Piano dei Conti»."],
    dove: "Carica Fatture Passive massivamente; Inserimento Manuale Fattura; Report Costi",
  },
  {
    termine: "Break Even (punto di pareggio)",
    testi: ["Il punto in cui i ricavi coprono esattamente i costi, senza guadagno e senza perdita. Risponde alla domanda: a un certo prezzo di vendita, quanti capi devo vendere per non perdere?", "Si calcola così: **capi da vendere = costi fissi dell'anno ÷ margine di un capo**. Il margine di un capo è quello che resta del suo prezzo dopo aver pagato i suoi costi variabili.", "Esempio: costi fissi 100.000 € l'anno; un capo si vende a 4.000 € e ha 1.750 € di costi variabili. Il margine è 2.250 €. Per andare in pari servono 100.000 ÷ 2.250 = 44,4, cioè 45 capi.", "Nel programma il Break Even serve a simulare: si scrive un prezzo di vendita e il programma, con i costi veri, dice quanti capi servono. Vedi anche «Costo fisso» e «Costo variabile»."],
    dove: "Analisi Costi → Break Even sulla carcassa, Break Even sul capo vivo; Il Piano dei Conti",
  },
  {
    termine: "Capo produttivo e capo improduttivo",
    testi: ["**Produttivo** è il capo ancora in azienda, oppure uscito con un ricavo: macellato, venduto, riformato, trasferito o scambiato. **Improduttivo** è il capo da macello uscito senza ricavo: morto, predato, smarrito.", "Il costo di un capo improduttivo non si perde: lo pagano, anno per anno, i capi produttivi della sua specie. I riproduttori morti non sono improduttivi: il loro costo passa ai figli attraverso il costo di nascita."],
    dove: "Report Costi; Report UBA; Il Piano dei Conti",
  },
  {
    termine: "Carcassa",
    testi: ["L'animale macellato, senza pelle, testa, zampe e visceri: è la parte che si vende come carne. Il suo peso è la base del costo e del prezzo al chilo."],
    dove: "Report di Analisi; Break Even",
  },
  {
    termine: "Centro di Costo",
    testi: ["La voce precisa di spesa dentro un'Area: per esempio, dentro Allevamento, i Mangimi, il Foraggio o i Medicinali Veterinari. Ogni Area ha i suoi Centri di Costo: per questo si sceglie prima l'Area. L'elenco è nel documento «Il Piano dei Conti»."],
    dove: "Carica Fatture Passive massivamente; Inserimento Manuale Fattura; Report Costi → Per Area e Centro di Costo",
  },
  {
    termine: "Cespite",
    testi: ["Un bene che l'azienda usa per più anni: una macchina, un'attrezzatura, una costruzione, una recinzione. Nel programma un cespite nasce da una riga di fattura con Area «Ammortamenti». Ha una durata in anni, una specie a cui va la quota, detta imputazione, e un piano delle quote anno per anno. Vedi «Ammortamento»."],
    dove: "Carica Fatture Passive massivamente; Inserimento Manuale Fattura; Verifica Righe Mancanti; Analisi Costi → Cespiti",
  },
  {
    termine: "Contabilità industriale",
    testi: ["La contabilità che serve a sapere quanto costa davvero produrre: quanto costa allevare un capo, per specie, per UBA e per chilo di carcassa. È diversa dalla **contabilità fiscale**, quella del commercialista, che segue le regole per le tasse.", "La differenza più evidente è negli ammortamenti: per il fisco un bene si ammortizza in un numero di anni fissato dalle regole; nella contabilità industriale si sceglie la durata reale del bene in azienda, che può essere più lunga."],
    dove: "Tutto il programma; Istruzioni Carica Fatture Passive",
  },
  {
    termine: "Costi generali",
    testi: ["Le spese che servono a tutto l'allevamento e non a una specie sola: per esempio gasolio, ferramenta, consulenze, bollette. Si indicano con la Destinazione «Generali». Il programma le divide tra bovini, suini e ovini in proporzione alla loro presenza nell'anno, misurata in UBA-giorno."],
    dove: "Report Costi; Il Piano dei Conti",
  },
  {
    termine: "Costo fisso",
    testi: ["Una spesa che si paga comunque, anche con meno animali o senza vendere un capo: assicurazioni, consulenze, abbonamenti, canoni, ammortamenti di stalle e macchine. Nelle righe di fattura si indica con il Tipo di Costo «Fisso». Vedi anche «Break Even»."],
    dove: "Carica Fatture Passive massivamente; Inserimento Manuale Fattura; Break Even",
  },
  {
    termine: "Costo variabile",
    testi: ["Una spesa che cresce o cala con il numero di animali allevati: mangime, foraggio, medicinali, veterinario, marche auricolari. Nelle righe di fattura si indica con il Tipo di Costo «Variabile».", "Per capire se una spesa è fissa o variabile basta chiedersi: con la metà degli animali questa spesa si dimezzerebbe? Se sì, è variabile."],
    dove: "Carica Fatture Passive massivamente; Inserimento Manuale Fattura; Break Even",
  },
  {
    termine: "Destinazione",
    testi: ["A chi va il costo di una riga: a una specie (Bovini, Suini, Ovini), a due specie insieme, a tutto l'allevamento («Generali»), oppure a Cavalli o Pollame, che restano fuori dal costo di bovini, suini e ovini. Come si divide il costo in ogni caso è spiegato nel documento «Il Piano dei Conti»."],
    dove: "Carica Fatture Passive massivamente; Inserimento Manuale Fattura; Report Costi",
  },
  {
    termine: "Lettura a pagine",
    testi: [
      "Il database consegna al massimo **1.000 righe** per ogni richiesta. Per non perdere niente il programma legge i dati **a pagine**: chiede le prime 1.000 righe, poi le 1.000 successive, e così via finché non le ha ricevute tutte.",
      "Nelle pagine di **consultazione** (Fatture Passive, Fatture Attive, Ricerca, Registro delle Modifiche, Articoli & Prezzi, Famiglie di Prodotto, Riepilogo Costo Animali, Report UBA) si vedono 50, 100 o 200 righe per volta, con i pulsanti «◀ precedenti» e «successive ▶» sopra e sotto l'elenco; la ricerca, il numero e i totali sono però calcolati su **tutte** le righe trovate, anche quelle che non si vedono, e l'export Excel le scarica tutte.",
      "Nelle pagine di **calcolo e di controllo** (per esempio Report Costi, Report Riproduttori, Controllo Anomalie, Verifica Fatture Mancanti) la lettura a pagine è automatica: i conti si fanno sempre su tutti i dati.",
      "Esempio: oggi le righe di fattura sono 2.297; il programma fa tre richieste (righe 1–1.000, 1.001–2.000, 2.001–2.297) e le mette insieme.",
    ],
    dove: "Fatture Passive; Fatture Attive; Ricerca; Registro delle Modifiche; Istruzioni Carica Fatture, Costi, Animali, Emissione Fatture, Ricerca: Fatture e Anagrafiche",
  },
  {
    termine: "Margine di un capo",
    testi: ["Il prezzo di vendita di un capo meno i suoi costi variabili. È quello che ogni capo venduto lascia per pagare i costi fissi. Se è zero o negativo, il prezzo non copre nemmeno i costi variabili: più si vende, più si perde. Vedi «Break Even»."],
    dove: "Break Even",
  },
  {
    termine: "Tipo di Costo",
    testi: ["Dice se una spesa è **Fissa** o **Variabile**; per i beni che durano più anni il programma scrive da solo **Ammortizzabile**. Una riga senza Tipo di Costo resta fuori dal calcolo dei costi. Vedi «Costo fisso», «Costo variabile» e «Ammortamento»."],
    dove: "Carica Fatture Passive massivamente; Inserimento Manuale Fattura; Break Even",
  },
  {
    termine: "UBA (Unità di Bestiame Adulto)",
    testi: ["Unità di misura che rende confrontabili animali di specie ed età diverse. Un bovino adulto vale 1; gli altri animali valgono una frazione, come nella tabella. I costi comuni dell'azienda si dividono tra gli animali in proporzione alle UBA e ai giorni di presenza in azienda."],
    tabella: [["Bovino", "fino a 7 mesi", "0,40"], ["", "da 7 mesi a 2 anni", "0,70"], ["", "oltre 2 anni", "1,00"], ["Suino", "fino a 3 mesi", "0,027"], ["", "da 3 mesi a 1 anno", "0,30"], ["", "oltre 1 anno", "0,50"], ["Ovino", "fino a 4 mesi", "0,027"], ["", "da 4 mesi a 1 anno", "0,10"], ["", "oltre 1 anno", "0,15"]],
    notaTabella: "Valori usati dal programma e dall'app Podere Verde. Nel programma «7 mesi» corrisponde a 210 giorni.",
    dove: "Report di Analisi; Animali → Report UBA",
  },
  {
    termine: "UBA-giorno",
    testi: ["La presenza di un animale in azienda pesata per la sua taglia: le sue UBA moltiplicate per i giorni passati in azienda nell'anno. Esempio: un bovino adulto (1 UBA) presente tutto l'anno fa 365 UBA-giorno; un vitello (0,40 UBA) presente 100 giorni ne fa 40.", "Sommando gli UBA-giorno di tutti i capi di una specie si ottiene quanto quella specie ha «occupato» l'azienda nell'anno. Su questa base il programma divide i costi generali e quelli a due specie."],
    dove: "Report Costi; Report UBA; Il Piano dei Conti",
  },
];

function Testo({ t }) {
  return t.split(/(\*\*[^*]+\*\*)/).map((p, i) => p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p);
}

export default function Glossario() {
  const cella = { padding: "5px 10px", borderBottom: `1px solid ${C.border}`, fontSize: 13 };
  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>📚 Glossario</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 14, lineHeight: 1.6 }}>
        I termini usati nelle istruzioni del programma, spiegati in parole semplici e in ordine alfabetico. Per ogni termine è indicato dove si incontra.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
        {VOCI.map(v => (
          <a key={v.termine} href={"#gl-" + v.termine} onClick={e => { e.preventDefault(); document.getElementById("gl-" + v.termine)?.scrollIntoView({ behavior: "smooth" }); }}
            style={{ fontSize: 12, padding: "3px 9px", borderRadius: 12, background: C.card, border: `1px solid ${C.border}`, color: C.primary, textDecoration: "none" }}>{v.termine}</a>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {VOCI.map(v => (
          <div key={v.termine} id={"gl-" + v.termine} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.primary, marginBottom: 6 }}>{v.termine}</div>
            {v.testi.map((t, i) => <p key={i} style={{ fontSize: 13, color: C.text, margin: "0 0 8px", lineHeight: 1.6 }}><Testo t={t} /></p>)}
            {v.tabella && (
              <>
                <table style={{ borderCollapse: "collapse", marginBottom: 4 }}>
                  <thead><tr>{["Specie", "Età", "Vale (UBA)"].map(t => <th key={t} style={{ ...cella, textAlign: "left", background: "#E3EDE0" }}>{t}</th>)}</tr></thead>
                  <tbody>{v.tabella.map((r, i) => <tr key={i}>{r.map((x, j) => <td key={j} style={{ ...cella, textAlign: j === 2 ? "right" : "left", fontWeight: j === 0 ? 700 : 400 }}>{x}</td>)}</tr>)}</tbody>
                </table>
                <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", marginBottom: 8 }}>{v.notaTabella}</div>
              </>
            )}
            <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>Dove si incontra: {v.dove}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
