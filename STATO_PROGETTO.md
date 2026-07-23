# Contabilità Industriale — Stato del Progetto
_Documento di riferimento — aggiornato ad ogni decisione importante_

## 1. Architettura

- **Repo GitHub**: podereverde-contabilita-industriale (separato da podereverdeapp)
- **Deploy**: Vercel, progetto separato
- **Database**: STESSO Supabase di Podere Verde App (pyjymnpnxatqwfhguaus) — non un database a parte
  - Motivo: `ci_report_uba_animale.animale_id` e `ci_report_acquisto_animali.animale_id/lotto_id` sono FK dirette verso `animali`/`lotti_suini` — niente sincronizzazione, dati in tempo reale
- **Ispirazione**: "Prima App" di Colabucci (Next.js+Prisma, database separato con sync notturna) — noi replichiamo le stesse funzionalità ma con Supabase diretto, senza la sincronizzazione
- **Lettura PDF fatture**: funzione server `api/leggi-fattura-pdf.js`, chiama Claude (chiave `ANTHROPIC_API_KEY` su Vercel, mai esposta al browser)

## 2. Schema database (tabelle, prefisso `ci_`)

- `ci_fornitori`, `ci_clienti`, `ci_categorie` — anagrafiche
- `ci_fatture`, `ci_articoli_fattura` — fatture e righe, con classificazione a 4 livelli
- `ci_cespiti`, `ci_cespiti_ammortamento` — cespiti gestiti in app
- `ci_ammortamenti_import`, `ci_ammortamenti_righe` — import Excel ammortamenti da Colabucci
- `ci_report_uba_import`, `ci_report_uba_animale` — import del nostro export "UBA Dettaglio"
- `ci_consistenza_allevamento` — conteggio capi per anni pre-UBA
- `ci_piano_dei_conti` — combinazioni valide Area × Centro di Costo (68 righe)
- `ci_regole_fornitore_variabile` (FCV, parola chiave), `ci_regole_fornitore_fissa` (FCF, fissa per fornitore)
- `ci_report_acquisto_animali` — righe da tradurre a mano in podereverdeapp.it
- `ci_bozze_import` — bozza di importazione non ancora salvata (per non perdere lavoro in corso)

## 3. Classificazione a 4 livelli — LE REGOLE DI BUSINESS (fondamentali, non modificare senza motivo)

**AREA** (17 voci): Allevamento, Coltivazione, Lavoro, Energia Elettrica, Acqua, Consulenze, Assicurazioni,
Lavorazioni prodotti allevamento, Spese Promozionali, Oneri Finanziari, Varie, Animali non d'allevamento,
Orto, Canoni ed Abbonamenti, **Ammortamenti** (speciale), **ACQUISTO ANIMALI** (speciale), **TRASPORTO ANIMALI** (speciale)

**CENTRO DI COSTO**: a cascata sull'Area, espandibile dall'operatore (se scrive uno nuovo, si aggiunge al piano dei conti per il futuro — con controllo case-insensitive per non duplicare varianti dello stesso nome)

**DESTINAZIONE**: Bovini/Suini/Ovini/Generali(→ripartiti per UBA-giorno)/Pollame/Cavalli

**TIPO DI COSTO**: Fisso / Variabile / **Ammortizzabile** (quote di ammortamento — vincolo DB: Area="Ammortamenti" ⟹ Tipo="Ammortizzabile", sempre, non derogabile)

### Le 3 aree speciali

- **Ammortamenti**: NON è un costo ordinario — genera un **Cespite** (mappatura: descrizione riga→descrizione bene, Categoria Ammortamento→categoria, fornitore→fornitore, data fattura→data acquisto, imponibile→costo acquisto, %Ammortamento→anni=arrotonda(100/%), Imputazione Bovini/Ovini/Generali/**Nessuno**→specie). "Nessuno" = cespite estraneo all'attività di allevamento, escluso dal calcolo costi.
  - **Categoria Ammortamento — le 10 voci esatte (tendina, non testo libero)**: 3 - Attrezzatura specifica; 3 - Costruzioni leggere; 5 - Macchinari, apparecchi e attrezzature varie; 5 b - Macchinari, apparecchi e attrezzature varie extra allevamento; 6 - Spese atti notarili; 7 - Animali non oggetto di allevamento; 15 - Autovetture, motoveicoli e simili; 30 – Avviamento; 31 - Spese di costituzione e trasformazione; 34 - Altri oneri pluriennali
- **ACQUISTO ANIMALI**: "finta area" — non entra MAI nella contabilità industriale ordinaria (niente Centro Costo/Destinazione/Tipo Costo). Va in `ci_report_acquisto_animali` (stato DA_ELABORARE), che l'operatore umano traduce a mano in un animale o lotto su podereverdeapp.it (usando i campi Fornitore/Data fattura/Numero fattura già presenti lì).
  - **Specie (tendina)**: Bovini, Suini, Ovini, "Piu' specie acquistate insieme"
  - **Razza (tendina a cascata sulla specie)**: Bovini→Chianina/Marchigiana/Maremmana/Limousine/Charolais/Frisona/Pezzata Rossa/Meticcia/Altra; Suini→Large White/Landrace/Duroc/Cinta senese/Mora romagnola/Nero casertano/Nero apucalabro/Meticcia/Altra; Ovini→Sopravvissana/Suffolk/Meticcia/Altra; "Piu' specie..."→"Da definire in podereverdeapp.it"
- **TRASPORTO ANIMALI**: SEMPRE manuale, mai auto-classificabile da FCV/FCF (nessuna eccezione, anche se esistesse una regola per quel fornitore). Natura mista: una fattura può contenere sia trasporto verso il macello (resta in contabilità industriale ordinaria, Centro Costo="Lavorazione prodotti allevamento per Rivendita") sia trasporto di animali in ingresso (va nel Report Acquisto Animali, stessa logica di ACQUISTO ANIMALI). L'operatore divide l'imponibile tra le due caselle; il sistema verifica che la somma torni all'imponibile originale della riga.

## 4. Ripartizione costi per UBA-giorno (stesso motore già usato in Podere Verde App)

- Costo diretto a una specie → allocato ai singoli animali di quella specie in base ai loro UBA-giorni personali
- Costo Generale (tra 3 specie) → tasso unitario = costo ÷ UBA-giorni totali → moltiplicato per UBA-giorni di specie/singolo capo
- Animali **improduttivi usciti** (morti/dispersi/predati — qualunque causa, non solo malattia) → ESCLUSI dal divisore, il loro costo si ridistribuisce sui rimasti in vita nella stessa specie/lotto
- Animali macellati/venduti → contano regolarmente per il loro periodo reale di presenza (dalla nascita/ingresso alla data di uscita) — sono "produttivi", non improduttivi
- Quote di ammortamento seguono la STESSA logica (specie-specifiche o generali-da-ripartire), tranne Imputazione=Nessuno che è sempre esclusa
- **Break-even**: Costi Fissi Totali = Costo Fisso (operativo) + Costo Ammortizzabile (sommati insieme per il calcolo, ma sempre disaggregabili per il dettaglio)

## 5. Motore di classificazione automatica (già costruito e testato)

`src/motoreClassificazione.js` — ordine di applicazione:
1. Cerca regola fissa (FCF) per il fornitore (per P.IVA se nota, altrimenti nome case-insensitive) → se trovata, applica sempre
2. Altrimenti cerca regola variabile (FCV): fornitore + parola chiave contenuta nella descrizione
3. Altrimenti → stato MASCHERA (classificazione manuale richiesta)
4. Regole trasversali non derogabili: Area=Ammortamenti forza Tipo=Ammortizzabile; Area=TRASPORTO ANIMALI forza sempre MASCHERA

**Nota**: un fornitore NON dovrebbe avere contemporaneamente una regola FCF e una FCV per motivi diversi (creava ambiguità — vedi caso Alfa Omega risolto rimuovendo la FCV). Se capita, il codice controlla FCF prima.

## 6. Sistema "che impara" (v7)

Quando una riga MASCHERA viene classificata a mano e salvata, l'operatore può scegliere:
- Solo questa volta (nessuna regola)
- Regola fissa per il fornitore (FCF, upsert — sostituisce eventuale regola fissa precedente per lo stesso fornitore)
- Regola per parola chiave (FCV — nuova riga in ci_regole_fornitore_variabile)

## 7. Salvataggio (v7) — per riga singola, non più solo massivo

- Ogni riga si salva individualmente (`salvaRiga`), condividendo la fattura (fornitore+numero+data) con altre righe già salvate per la stessa fattura
- `annullaSalvataggioRiga`: elimina i record creati (articolo/dettaglio ammortamento/report acquisto/regola), ricalcola i totali fattura, riporta la riga a modificabile
- Bozza di importazione salvata automaticamente ogni 1,5s (tabella `ci_bozze_import`) — se si chiude senza salvare, alla riapertura si può riprendere

## 8. Pagine dell'app (stato ad oggi)

| Pagina | Stato |
|---|---|
| Dashboard | ✅ (Blocco 1) |
| Fatture Passive (elenco) | ✅ (Blocco 1) |
| Carica Fatture (Excel + PDF) | ✅ |
| Fornitori | ✅ |
| Report Acquisto Animali | ✅ |
| Clienti | ❌ (Blocco 2) |
| Fatture Attive | ❌ (Blocco 2) |
| Cespiti (interfaccia) | ❌ (Blocco 3 — tabelle già pronte) |
| Importa Report UBA (interfaccia) | ❌ (Blocco 3 — tabelle già pronte) |
| Articoli & Prezzi | ❌ (Blocco 4) |
| Report Animali | ❌ (Blocco 4) |
| Report Cespiti | ❌ (Blocco 4) |
| Ricerca | ❌ (Blocco 5) |
| Report generali | ❌ (Blocco 5) |

## 9. Dati reali già caricati nel database

- 60 fornitori (52 originali + 10 aggiunti senza P.IVA per Gruppo II, 2 doppioni uniti: Aruba, Agrilinea)
- 248 regole FCV, 11 regole FCF (Alfa Omega ha solo FCF, non più FCV)
- 68 combinazioni Area/Centro di Costo

## 11. Fix importanti (dopo segnalazioni dirette)

- `ci_report_acquisto_animali` ora salva anche `quantita`, `unita_misura`, `prezzo_unitario` (non solo il totale) — mancavano nella prima versione

## 13. Unità di misura — cambio di approccio (decisione presa)

Il campo `unita_misura` di `ci_articoli_fattura` **non è più vincolato** a un elenco fisso (il vincolo alle 8 unità è stato rimosso) — accetta qualunque testo presente nella fattura originale (millilitri, centilitri, sacchi, confezioni, ecc.), per non perdere il dato reale né bloccare il caricamento massivo. Il campo U.M. nel modulo manuale (Nuova Fattura Attiva) è ora un testo libero con suggerimenti (datalist), non più una tendina chiusa.

**Requisito per i report futuri (Blocco 4/5)**: dato che le unità non sono più uniformi, i report che aggregano quantità (es. "totale kg di mangime acquistato") dovranno prevedere una **conversione tra unità diverse** (es. Millilitri→Litri, Sacchi→Kg se si conosce il peso standard di un sacco) — funzione ancora da progettare, non dimenticarla in fase di report.

## 12. Analisi del codice sorgente reale di Prima App (confronto diretto, non solo riassunto)

**Confermato**: il sistema AREA/CENTRO DI COSTO/DESTINAZIONE/TIPO DI COSTO con regole FCV/FCF **non esiste nel codice reale di Prima App** — era un progetto di integrazione mai realizzato lì. Quello che abbiamo costruito noi va oltre Prima App su questo punto specifico.

**Formula costo/UBA-giorno — CORREZIONE (la formula di Prima App era stata scelta per errore, sostituita da quella reale)**: il vero motore di podereverdeapp.it (ExportManager.jsx, funzione `fogli_uba`) usa una formula più semplice, già scritta e testata:
```
rateUbaGiorno = (C(t) - V(t)) / F(t)
```
dove **F(t) = somma degli UBA-giorni di TUTTI gli animali**, inclusi gli improduttivi usciti (nessuna esclusione dal divisore, a differenza di quanto avevamo preso da Prima App). "Podereverdeapp.it governa" — questa è la formula definitiva da usare.

**Classificazione PRODUTTIVO/IMPRODUTTIVO_USCITO — CORREZIONE (trovata la funzione reale in ExportManager.jsx, `categoriaContabileExp`)**:
```js
function categoriaContabileExp(animale) {
  if (animale.stato === "attivo") return animale.riproduttore ? "riproduttore" : "produttivo";
  const motivo = (animale.motivo_uscita||"").toLowerCase();
  const isProduttivo = MOTIVI_PRODUTTIVI_EXP.some(k => motivo.includes(k));
  if (isProduttivo) return animale.riproduttore ? "riproduttore" : "produttivo";
  return "improduttivo_uscito";
}
```
con `MOTIVI_PRODUTTIVI_EXP = ["macellazione","macellato","venduto","riformato","riforma","vendita"]` cercate come sottostringa (non uguaglianza esatta). Qualunque motivo di uscita che NON contiene una di queste parole (quindi anche "Altro", "Morto", "Predato", "Smarrito", ecc.) risulta IMPRODUTTIVO_USCITO. Questa è la funzione reale e testata, sostituisce la lista scritta a mano in precedenza.

**Motore UBA completo, trovato in `/home/claude/allevamento/src/ExportManager.jsx`** (da riusare identico, non reinventare):
- `UBA_FASCE_EXP`: coefficienti per specie/fascia d'età (bovino: 0.40/0.70/1.00 a 210/730/∞ giorni; suino: 0.027/0.30/0.50 a 90/365/∞ giorni; ovino: 0.027/0.10/0.15 a 120/365/∞ giorni)
- `periodoNellAnnoExp(nascita, dataUscita, stato, anno)`: calcola il periodo di presenza effettiva nell'anno
- `calcolaUBAMedioExp(specie, giorni, etaAllInizio)`: UBA medio ponderato tra fasce d'età attraversate nel periodo
- `fogli_uba(...)`: orchestratore che calcola tutto, incluso il costo di nascita per lotto tramite `rateUbaGiorno`

**"Riporto quota UBA"** (meccanismo non documentato prima, utile per Importa Report UBA — Blocco 3): se un animale presente nel report UBA dell'anno precedente **non compare** nel nuovo import, il sistema ne riporta automaticamente l'ultima quota nota (stessi giorni/UBA-medio/UBA-giorni), A MENO CHE l'anagrafica Podere Verde non mostri che è uscito per **macellazione o decesso** (altri motivi di uscita come vendita non fermano il riporto — l'azienda considera solo macellazione/decesso come "fine vita" nel perimetro UBA). Nota: questo meccanismo era descritto in Prima App — da verificare se serve ancora, dato che ora calcoliamo l'UBA direttamente dagli animali reali ogni volta, non da un import storico.

**Dettagli minori da recepire**:
- Il parser Excel di Prima App gestisce i numeri con virgola decimale all'italiana (es. "1.000,50" scritto come testo) — il nostro parser attuale non lo fa ancora, va aggiunto per robustezza
- Il controllo duplicati di Prima App ha due livelli: "esatto" (fornitore+numero+data identici) e "possibile" (stesso numero fattura nello stesso mese, anche con fornitore/giorno diversi) mostrato come avviso non bloccante — il nostro oggi ha solo il livello "esatto"

**Confermato senza correzioni**: il formato "Matrice categoria × specie" del nostro Libro Cespiti Excel (foglio REPORT AMMORTAMENTI) è esattamente quello che Prima App si aspetta per l'import ammortamenti — nessuna modifica necessaria lì. Anche la formula di ammortamento a quote costanti (costo/anni) e il meccanismo "genera quote" (upsert per cespite+anno, richiamabile più volte senza duplicare) coincidono con quanto già costruito per i 94 cespiti migrati.

## 10. Problemi noti / da monitorare

- Pagamento Anthropic Console: bug noto per carte europee (Stripe SetupIntent 0€ + 3DS) — Filippo ancora non è riuscito a sbloccarlo, la lettura PDF non è ancora testata con successo
- Il browser di Filippo a volte traduce automaticamente la pagina, storpiando i nomi delle voci (Area→"Zona", "Consulenze"→parole a caso) — soluzione: disattivare la traduzione automatica per il sito
