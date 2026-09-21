# podereverdeapp.it (Allevamento) — Stato del Progetto
_Documento di riferimento — creato per la prima volta insieme al backup della Contabilità Industriale, così un'eventuale nuova sessione possa ripartire senza soluzione di continuità. Da tenere aggiornato come il documento gemello della Contabilità Industriale._

## 1. Architettura

- **App**: React 19 (Create React App, `react-scripts` 5.0.1) — non Next.js/Vite
- **Database**: Supabase (`pyjymnpnxatqwfhguaus`) — **stesso identico progetto Supabase** usato dalla Contabilità Industriale (`podereverde-contabilita-industriale`). Non c'è sincronizzazione: sono due app separate sullo stesso database condiviso.
- **Client Supabase**: `src/supabase.js`
- **Librerie**: `xlsx` + `xlsx-js-style` (export Excel con formattazione)
- **Autenticazione**: `Auth.jsx` — richiede login (utenti autenticati), a differenza della Contabilità Industriale che si connette come `anon` senza login
  - **Nota tecnica importante**: le tabelle `animali`, `lotti_suini`, `suini_lotto` avevano RLS che permetteva la SELECT solo ad utenti autenticati. È stata aggiunta una policy aggiuntiva `FOR SELECT TO anon USING (true)` (per permettere alla Contabilità Industriale, che si connette senza login, di leggerle) — non tocca in alcun modo l'autenticazione o le policy di scrittura di questa app.

## 2. Struttura dell'app — 12 tab principali (`App.js`)

Gestione 🐄 · Pedigree 🧬 · Lotti 🐷 · Selezione 🏆 · Costi 📊 · Origine 🧾 · Uscite 📤 · Struttura 🏭 · UBA 🐾 · Esporta 📥 · Email 📮 · Guida 📖

File principali in `src/`:
- `allevamento_app.jsx` (il più grande, ~165.000 caratteri) — contiene `Anagrafica` (gestione/scheda animali, il cuore dell'app), `Dashboard`, `Sanitario`, `Alimentazione`, `Magazzino`, `Report`
- `ExportManager.jsx` — motore di export (Excel), include il motore UBA reale e il calcolo "Costo netto residuo"
- `UBAReport.jsx` — report UBA a schermo (probabilmente la tab "UBA")
- `lotti_suini.jsx` — gestione lotti suini (nascite non individualizzate, assegnazione BDN)
- `pedigree.jsx` — genealogia
- `selezione_genetica.jsx` — tab Selezione
- `registro_uscite.jsx` — tab Uscite
- `costi_allevamento.jsx`, `costi_complessivi.jsx`, `costi_generali.jsx`, `costo_origine.jsx` — varie viste costo (pre-esistenti, indipendenti dalla Contabilità Industriale)
- `destinatari.jsx` — probabilmente la tab Email

## 3. Anagrafica animali — struttura dati chiave

Tabella `animali` — campi principali (dal `SELECT` in `ExportManager.jsx`): `id,bdn,nome,specie,sesso,nascita,stato,data_uscita,motivo_uscita,causa_morte,data_ingresso,razza,razza_calcolata,categoria,peso_nascita,peso_attuale,provenienza,origine,fornitore,data_fattura,numero_fattura,prezzo_acquisto,lotto_box,destinazione,resa_percent,peso_carcassa,peso_vivo_uscita,note_sanitarie,note,riproduttore,data_registrazione_bdn,padre_id,madre_id,costo_iniziale,tipo_costo_iniziale,costi_mantenimento_cumulati,quota_scaricata_figli,valore_v_riforma,categoria_contabile`

**Campi scritti dalla Contabilità Industriale (in prospettiva, non ancora collegati salvo il tab Costi)**: `costi_mantenimento_cumulati`, `quota_scaricata_figli` — letti da `ExportManager.jsx` nel calcolo "Costo netto residuo" (riga 888-890): `costoNetto = Math.max(0, costoIniz + mantCum - quotaFig - vRiforma)`.

**Scheda animale (dentro `Anagrafica`)**: apertura tramite lo stato `dettaglio` (oggetto animale o null), con tab interne gestite da `tabDettaglio`: `info` · `genealogia` · `eventi` · **`costi`** (aggiunta v94, vedi sezione 5).

## 4. Lotti suini — struttura dati chiave

- `lotti_suini` — un parto/nascita di gruppo (non ogni suinetto ha subito un BDN individuale)
- `suini_lotto` — le singole unità dentro un lotto, identificate da `nr` (numero progressivo), con `codice_completo` o `matricola`, `stato` (`attivo` di norma, o `registrato_individuale` quando gli viene assegnato un BDN proprio)
- **Assegnazione BDN**: pulsante/form (`FormAssegnaBDN`, citato nelle sessioni precedenti) che trasforma un'unità di lotto in un animale individuale con BDN proprio — crea un nuovo record in `animali` e marca l'unità di lotto come `stato:"registrato_individuale"`.
  - **Requisito registrato ma NON ancora implementato**: quando questo passaggio avviene, i costi già maturati dalla Contabilità Industriale mentre l'unità era ancora nel lotto (righe in `ci_costo_animale_annuale` con `lotto_id`+`unita_nr`) devono traghettare sul nuovo `animale_id` — oggi ripartirebbero da zero. Da costruire lato Contabilità Industriale quando si arriva a quel punto.

## 5. Collegamento con la Contabilità Industriale (in corso)

**Peso all'ingresso — nuovo campo `peso_ingresso` su `animali`**: aggiunto per registrare il peso rilevato all'ingresso in azienda — utile soprattutto per gli animali acquistati (di cui non si conosce il vero peso di nascita), ma è un secondo punto di crescita reale utile per qualunque animale. Campo nel form (`allevamento_app.jsx`, vicino a Peso nascita/Peso attuale) e mostrato nella scheda (tab Info).

**Bug di dati reale trovato e corretto**: 8 bovini acquistati avevano il loro peso all'ingresso (275-500 kg) registrato per errore nel campo "peso di nascita" — impossibile per un vitello. Corretti manualmente (spostato il valore nel nuovo campo `peso_ingresso`, azzerato `peso_nascita` per quei record) dopo verifica su un export reale caricato da Filippo.

**Giorni di vita — aggiunto solo all'esportazione Excel** (non a schermo, per scelta di Filippo): nuova colonna "Giorni di vita" (nascita→uscita) nell'export principale animali di `ExportManager.jsx`, subito dopo "Data uscita" — prima andava calcolato a mano in Excel ogni volta.

**Perché serve tutto questo**: la Contabilità Industriale (Performance per Fascia d'Età) usa sia il peso di nascita sia — quando disponibile — il peso all'ingresso come punti reali per una regressione che stima crescita/IPG per fascia d'età; più punti reali per animale (non solo nascita+uscita) rendono la stima più solida, specialmente per gli acquistati.

**Storico Pesate — COSTRUITO** (`pesate_storico`, nuova tabella condivisa — **eccezione consapevole**: qui, a differenza dei costi, è podereverdeapp.it a scrivere, non solo a leggere, dato che è qui che si pesano gli animali). Sostituisce concettualmente il vecchio campo singolo `peso_attuale` (che si sovrascriveva) con una riga per ogni pesata nel tempo — tipo di rilevazione (nascita/ingresso/vita/uscita_vivo/uscita_carcassa), con un flag `stimato` per distinguere un peso reale da uno standard di specie usato quando la nascita reale è sconosciuta (animali acquistati). Nuova tab "⚖️ Pesate" nella scheda animale (`allevamento_app.jsx`), con form di registrazione ed elenco storico eliminabile riga per riga.

**Perché**: prepara i dati per un futuro report nella Contabilità Industriale che stimerà, per fascia d'età, il peso medio/IPG/costo per kg — usando una **regressione lineare** sui punti data/peso di tutti gli animali (decisione presa con Filippo: la regressione, a differenza di medie semplici o ponderate, sfrutta naturalmente sempre più punti man mano che si accumulano pesate nel tempo, senza dover cambiare formula). Tabella di supporto `pesi_standard_specie` (45kg bovino, 0,5kg suino, 2kg ovino) per quando il peso di nascita reale non è noto.

**Ancora da fare**: lo stesso meccanismo di pesata per le unità di lotto suini (oggi la tab Pesate esiste solo per animali con BDN individuale); il report di analisi vero e proprio in Contabilità Industriale (regressione per fascia d'età, calcolo IPG/costo al kg/FCR) — bozze Excel dimostrative create (`Bozza_Costo_Mangime_Cumulato_Vitello.xlsx`, `Bozza_Performance_Fascia_Eta.xlsx`) ma non ancora integrate nel programma.

**Perché questa app è la fonte di verità sui dati grezzi**: qui gli operatori dentro l'allevamento registrano quello che succede realmente — nascite, ingressi, uscite, vaccinazioni, nati morti, ecc. La Contabilità Industriale (gestita dai contabili) non ha altro modo di sapere cosa succede in azienda se non attraverso quello che è già stato registrato qui. Quadro completo dei flussi:

1. **Questa app → Contabilità Industriale** (lettura): dati grezzi per il calcolo UBA-gg (nascita, uscita, stato) — nessuna tabella con UBA-gg pre-calcolato, la Contabilità Industriale lo ricalcola da sola con la stessa formula di `ExportManager.jsx`
2. **Contabilità Industriale → questa app** (scrittura, senso unico): `ci_costo_animale_annuale`, letta nella tab "💰 Costi"
3. **Bidirezionale**: costo di acquisto (`prezzo_acquisto`), stesso campo condiviso
4. **Questa app → Contabilità Industriale** (eccezione consapevole): traghettamento costi lotto→BDN dentro `FormAssegnaBDN`

**Traghettamento costi lotto→BDN — COSTRUITO in `FormAssegnaBDN`** (`lotti_suini.jsx`): al momento della conferma di assegnazione BDN (dopo aver creato la scheda animale e aggiornato l'unità di lotto), un terzo passaggio cerca le righe già calcolate in `ci_costo_animale_annuale` (chiave `lotto_id`+`unita_nr`) e le ricollega al nuovo `animale_id` — fondendo con eventuali righe già esistenti per lo stesso anno invece di sovrascrivere. **Eccezione consapevole al principio "solo la Contabilità Industriale scrive in quella tabella"**: qui si spostano righe già calcolate altrove, non se ne calcolano di nuove — Filippo ha confermato che va bene così, dato che il pulsante BDN è il punto naturale per farlo (si conosce già la corrispondenza esatta lotto+unità→animale in quel preciso momento). Resta anche un pulsante di recupero manuale in Contabilità Industriale (Scheda Animale, "🔄 Traghetta costi lotto→BDN") per i passaggi avvenuti PRIMA di questa modifica.

**Costo di acquisto mancante — alert rosso (v96)**: quando `provenienza==="Acquistato"` e `prezzo_acquisto` è vuoto, compare un badge "⚠️ Manca costo acquisto" nella card della lista Anagrafica, e un banner rosso prominente in cima alla tab Info della scheda dettaglio. Stesso alert (elenco) anche in Report Acquisto Animali della Contabilità Industriale — è lo stesso campo condiviso (`animali.prezzo_acquisto`), scrivibile da entrambi i programmi: una volta inserito da uno dei due, l'alert sparisce su entrambi.

**Flusso a senso unico**: la Contabilità Industriale (progetto separato, stesso Supabase) calcola e scrive `ci_costo_animale_annuale`; questa app **legge soltanto**, non scrive mai in quella tabella.

**Fatto (v94)**: nuova tab "💰 Costi" nella scheda animale (`Anagrafica`, dentro `allevamento_app.jsx`) — al click su un animale, un `useEffect` interroga `ci_costo_animale_annuale` filtrando per `animale_id` e mostra: tabella anno per anno (UBA-giorni, categoria contabile, costo mantenimento, costo nascita ereditato, quota scaricata sui figli, totale anno) + totale cumulato in fondo. Stati aggiunti: `costiAnimale`, `caricandoCosti`.

**Verificato nel codice prima di costruire**: "Costo netto residuo" esisteva PRIMA solo come colonna nell'export Excel (`ExportManager.jsx` riga 852, `UBAReport.jsx` riga 202) — nessuna vista a schermo lo mostrava. Ora c'è, nella tab Costi.

**Da fare**: stessa vista per le unità di lotto suini (oggi la tab Costi cerca solo per `animale_id`, non gestisce `lotto_id`+`unita_nr` — serve capire dove si apre il "dettaglio" di un'unità di lotto in `lotti_suini.jsx`, probabilmente un meccanismo simile a `dettaglio`/`tabDettaglio` di Anagrafica ma non ancora esplorato).

## 6. Motore UBA reale (`ExportManager.jsx`) — riferimento autorevole

Questo è il motore che la Contabilità Industriale ha **copiato identico** (in `motoreUba.js`) per calcolare Report UBA/Report Costi. Se il motore qui cambia, va aggiornato anche lì (o viceversa, valutare se unificarli in futuro invece di mantenerne due copie).

- `UBA_FASCE_EXP`: bovino 0.40/0.70/1.00 a 210/730/∞ giorni; suino 0.027/0.30/0.50 a 90/365/∞ giorni; ovino 0.027/0.10/0.15 a 120/365/∞ giorni
- `categoriaContabileExp(animale)`: PRODUTTIVO se attivo o uscito con motivo che contiene macellazione/macellato/venduto/riformato/riforma/vendita (sottostringa); RIPRODUTTORE se inoltre `riproduttore:true`; altrimenti IMPRODUTTIVO_USCITO (include "Altro", "Morto", "Predato", ecc.)
- `periodoNellAnnoExp`, `calcolaUBAMedioExp` — calcolo giorni di presenza e UBA medio ponderato tra fasce d'età

**Formula costo/UBA-giorno QUI (diversa da quella scelta per la Contabilità Industriale)**: formula SEMPLICE `(C(t)-V(t))/F(t)` con F(t) = tutti gli UBA-giorni, inclusi gli improduttivi. La Contabilità Industriale usa invece una formula "aggressiva" (esclude gli improduttivi dal divisore) per scelta esplicita di Filippo — le due app calcolano il tasso in modo diverso, di proposito.

## 7. Tabella `prezzi_riforma`

Usata per stimare il valore di realizzo degli animali. Campi noti: `specie`, `razza`, `prezzo_kg_vivo`, `resa_percentuale`, e **`prezzo_kg_carcassa`** (aggiunto su richiesta della Contabilità Industriale — prima esisteva solo `prezzo_kg_vivo`+`resa_percentuale`, insufficiente perché derivare il prezzo carcassa da quello vivo tramite la resa dava un valore matematicamente equivalente, non una stima indipendente).

## 8. Problema noto, NON ancora corretto

**Riproduttore automatico per i maschi alla nascita** (`allevamento_app.jsx`, riga ~675, dentro la registrazione parto):
```js
riproduttore: nato.sesso==="M"?true:false,
```
Ogni maschio nato viene marcato **automaticamente** riproduttore alla nascita, solo in base al sesso. Secondo Filippo questo è sbagliato: un maschio deve restare `riproduttore:false` di default, e diventarlo solo tramite un'attivazione esplicita (pulsante, da individuare con certezza nel codice — potrebbe già esistere altrove nell'app). **Le femmine restano invece corrette**: diventano riproduttrici automaticamente al primo parto registrato, comportamento voluto, non toccare.

Verificato nel codice il 24/07: il bug è ancora presente, non è mai stato corretto in nessuna sessione precedente — resta da fare.

## 9. Note per chi riprende questo progetto da zero

- Ambiente di lavoro: la cartella sorgente (`allevamento`) potrebbe non essere presente in una sandbox nuova — chiedere a Filippo l'ultimo pacchetto `allevamento_vNN.tar.gz`, o verificare `/mnt/user-data/outputs/` prima di chiedere
- Prima di ogni modifica: `cd allevamento && npm install && CI=true npm run build` per verificare che l'app compili, poi ripacchettare con `tar -czf allevamento_vNN.tar.gz --exclude=.git .`
- Le versioni sono numerate progressivamente (v66...v94 al momento di scrivere) — usare il numero successivo per ogni nuovo pacchetto, mai sovrascrivere
- Repo GitHub e deploy Vercel separati da quelli della Contabilità Industriale, ma stesso account/proprietario (Filippo) per entrambi i progetti — l'accesso condiviso è a livello di **database** (stesso Supabase), non di codice sorgente: ogni sessione di chat vede solo i file che vengono caricati o che restano nell'ambiente di lavoro di quella sessione specifica.

## 125. PROBLEMA GRAVE TROVATO E RISOLTO — repository contaminato con file di podereverdeapp.it

**Scoperto per caso**, mentre costruivo il nuovo "Grafico per le Macellazioni": ricompilando il progetto dopo un mio riavvio d'ambiente, ho dovuto riscaricare i due repository da GitHub — e ho trovato che il repository **podereverde-contabilita-industriale** aveva il `package.json` **sbagliato**: nome "allevamento", basato su `react-scripts` (Create React App) invece di **Vite**. Controllando meglio, **20 file sorgente di podereverdeapp.it** (allevamento_app.jsx, Auth.jsx, lotti_suini.jsx, pedigree.jsx, selezione_genetica.jsx, registro_uscite.jsx, UBAReport.jsx, ExportManager.jsx, Guida.jsx, costi_allevamento.jsx, costi_complessivi.jsx, costi_generali.jsx, costo_origine.jsx, destinatari.jsx, exportExcel.js + boilerplate CRA come App.js/index.js/setupTests.js) erano finiti **dentro** questo repository — insieme a due file .tar residui.

**Causa probabile**: in qualche momento precedente (prima di questa sessione, o durante un deploy da parte tua), è stato estratto/committato il pacchetto sbagliato nella cartella sbagliata, mescolando i due progetti nello stesso repository Contabilità Industriale su GitHub.

**Impatto reale**: non so con certezza se questo abbia mai causato un deploy rotto su Vercel per Contabilità Industriale — dipende da come Vercel ha configurato la build (se ha rilevato Vite comunque, o se ha provato a usare `react-scripts` fallendo). Ma è un rischio concreto da quando si è verificato.

**Corretto**: ricostruito `package.json` corretto (Vite, dipendenze reali usate nel codice: supabase-js, react, xlsx, xlsx-js-style, jszip — verificate cercando ogni `import` nei sorgenti, non a memoria). Rimossi tutti i 20 file estranei e i due archivi .tar residui. Ricompilato da zero: **147 moduli, build pulita**.

**Trovata ANCHE una seconda ondata di contaminazione** durante l'impacchettamento (il file era sospettosamente da 3.3MB anziché i soliti ~250KB): una cartella build/ intera di react-scripts (7.7MB tra JS e sourcemap) e le immagini generiche di boilerplate CRA (logo192.png, logo512.png, favicon.ico duplicato, public/index.html, manifest.json) — rimosse anche quelle. Verificata anche la cartella api/ (leggi-fattura-pdf.js): quella è legittima, propria di Contabilità Industriale, non toccata.

**IMPORTANTE — verificare su GitHub**: la prossima volta che fai push, questo pulisce definitivamente il repository remoto. Ti consiglio di controllare tu stesso, una volta fatto il push, che la cartella del repository su GitHub non contenga più questi file — giusto per stare tranquilli che la pulizia sia arrivata fino in fondo.

## 126. Nuova "Break Even Analysis" — punto di pareggio per specie, con ammortamenti inclusi

**Costruita insieme a Filippo**, discutendo il modello prima di scriverlo:
- Prezzo di vendita carcassa: **parametro modificabile** dall'utente, precompilato con la media reale registrata (se disponibile) — così si possono provare scenari diversi
- Costi fissi totali per specie: stessa allocazione Area/Destinazione→UBA-giorni già usata in Report Costi, **ma applicata separatamente** ai soli costi `tipo_costo='Fisso'` — **includendo gli ammortamenti** (quote Cespiti dell'anno, già correttamente integrate — vedi indagine sezione precedente, si è scoperto che erano già agganciate)
- Costi variabili totali per specie: stessa logica, sui soli `tipo_costo='Variabile'`
- Costo variabile per capo: tasso variabile per UBA-giorno della specie × 365 (un anno intero di UBA-giorni per un capo tipo)
- Punto di pareggio (numero di capi) = Costi fissi totali ÷ (Ricavo per capo − Costo variabile per capo)

**Nuovo modulo condiviso** `calcoloAllocazioneSpecie.js`: estratta la logica di allocazione Area/Destinazione→UBA-giorni già presente (duplicata) in ReportCosti.jsx, in una funzione parametrica riutilizzabile — permette di far girare la stessa allocazione due volte sugli stessi dati (una per Fisso, una per Variabile) senza duplicare 80 righe di codice a mano.

**Nuova pagina `BreakEven.jsx`** (Analisi Costi → Break Even Analysis): un riquadro per specie con tutti i dati di supporto (costi fissi/variabili totali, UBA-giorni, peso carcassa medio degli usciti nell'anno) e il calcolo interattivo — cambiando il prezzo di vendita, punto di pareggio e margine si aggiornano subito.

Testato con caso mock (costi fissi 50.000€, variabili 30.000€/8.000 UBA-gg, peso 350kg, prezzo 6€/kg): punto di pareggio corretto a 69 capi, verificato che 69×margine copra effettivamente i costi fissi.

**Nota per Filippo, durante la costruzione**: inizialmente avevo detto che gli ammortamenti (Cespiti) fossero completamente scollegati da Report Costi — sbagliavo, dopo un controllo più attento ho trovato che erano già integrati correttamente (cespiti taggati per specie → 100% a quella specie; "Generale" → spalmato via UBA-giorni). Corretto l'errore prima di procedere.

## 127. Break Even — riferimento "bovino adulto" (12-24 mesi)

**Richiesto da Filippo**: per i bovini, usare come peso di riferimento quello dei capi macellati tra 12 e 24 mesi di età (non tutti gli usciti dell'anno, che mischiano vitelli giovani e animali tenuti a lungo) — peso medio maschi+femmine insieme, su tutti gli anni disponibili (campione più ampio, non solo l'anno selezionato).

**Aggiunto**: nuovo riquadro informativo nella scheda Bovini che mostra questo gruppo (numero di capi, peso medio, costo totale medio, costo di nascita medio) come riferimento — il peso di questo gruppo **sostituisce** quello "tutti gli usciti nell'anno" usato per calcolare ricavo/margine/punto di pareggio, specificamente per i bovini (suini e ovini restano sulla logica precedente, non richiesta qui).

## 128. Break Even — riferimento "suino campione" (oltre 130kg peso vivo)

**Richiesto da Filippo**: stessa logica dei bovini adulti, ma per i suini — "campione" = uscito con **peso vivo** oltre 130kg (non un'età, come per i bovini). Include sia gli animali suini individuali sia i suinetti nei lotti (`suini_lotto`), che sono la maggioranza.

**Aggiunto**: stesso riquadro informativo dei bovini, ora anche per i suini — numero di capi nel campione, peso carcassa medio, costo totale medio. Entrambi i riquadri (bovino e suino) spiegano esplicitamente in pagina come è stato scelto il campione, così chi legge il report capisce subito il criterio senza doverlo chiedere.

Corretta anche una sintassi Supabase non standard (`.not("stato","eq","attivo")` → `.neq("stato","attivo")`) trovata mentre scrivevo la query dei suinetti nei lotti.

## 129. Break Even — esclusi dal "suino campione" i riproduttori mai diventati genitori

**Richiesto da Filippo**: nel campione suini (>130kg peso vivo), non contare i riproduttori che non hanno mai avuto figli — la loro storia di costo non è rappresentativa di un normale capo da ingrasso.

**Corretto**: verificato se un suino riproduttore compare come padre/madre in **entrambe** le fonti possibili (`animali.padre_id/madre_id` per i figli individuali, `lotti_suini.padre_id/madre_id` per i figli nati in lotto — un riproduttore suino può comparire in entrambe) — se non ha figli in nessuna delle due, viene escluso dal campione. Aggiornata anche la descrizione visibile in pagina per rendere esplicito questo criterio.

## 130. Bug reale trovato — "Capi usciti quest'anno" contava solo la tabella animali, mai i lotti

**Segnalato da Filippo con screenshot**: "Capi usciti quest'anno" per i suini mostrava 5 — troppo pochi. Aveva ragione: verificato che nel 2025 ci sono **146 suinetti macellati nei lotti** contro i 5 soli individuali contati — il conteggio doveva essere 151, non 5. La query di questo specifico contatore guardava solo `animali`, mai `suini_lotto` — diversamente dal calcolo del "campione", che invece già includeva entrambe le fonti correttamente.

**Segnalato anche**: il dato deve riferirsi ai soli animali **macellati**, non a "qualunque uscita" (venduto/deceduto/altro).

**Corretto**:
- Aggiunta una query separata per contare i suinetti nei lotti macellati nell'anno, sommata al conteggio per i soli suini
- Tutte le query della pagina (capi macellati dell'anno, campione bovino adulto, campione suino) ora filtrano `stato = 'macellato'` esplicitamente, non più "qualunque stato diverso da attivo" — coerente in tutta la pagina
- Etichetta aggiornata da "Capi usciti quest'anno" a "Capi macellati quest'anno"

## 131. Break Even — esclusi anche dal campione bovini i riproduttori mai diventati genitori

**Segnalato da Filippo**: la stessa esclusione applicata ai suini (sezione 129) mancava per i bovini.

**Corretto**: stessa logica ora anche sul campione "bovino adulto" — un riproduttore mai diventato genitore (controllato sia via `animali.padre_id/madre_id` sia via `lotti_suini.padre_id/madre_id`, utile anche per eventuali riproduttori bovini con figli tracciati diversamente) viene escluso. **Unificato** il calcolo di "chi ha avuto figli" in un unico blocco condiviso all'inizio della funzione (prima era duplicato — lo stesso identificatore `idConFigli` veniva dichiarato due volte nello stesso scope, un errore che avrebbe rotto la build se non l'avessi notato ricompilando).

## 132. Nuova pagina "Riepilogo Costi (Break Even)" — Variabili/Fissi/Ammortamenti con dettaglio per area, esportabile

**Richiesto da Filippo**: nella cartella Break Even, un riepilogo separato in tre blocchi (Variabili, Fissi, Quote di Ammortamento), con le frecce per espandere ogni voce e vedere la composizione per specie (come già in Report Per Area) — tutto scaricabile in Excel.

**Riuso di codice esistente, non duplicato**: esportata `classificaDestinazione` da `calcoloReportCosti.js` (prima privata) e riusate `caricaDatiGrezziAnno`, `AREE_ORDINARIE`, `calcolaRigaAggregata` (da `motoreUba.js`) — la stessa macchina già usata da Report Per Area, applicata due volte (una sui soli costi `tipo_costo='Fisso'`, una sui soli `Variabile`) per tenerli sempre separati.

**Ammortamenti raggruppati per Categoria cespite** (non per Area, che i cespiti non hanno) — le categorie sono quelle fiscali reali già in Cespiti (es. "5 - Macchinari, apparecchi e attrezzature varie", "15 - Autovetture..."). Stessa logica di allocazione per specie del resto del sistema (specie-specifico → 100% a quella specie; "Generale" → via UBA-giorni; "Nessuno"/Orto/Cavalli/Pollame → esclusi, coerente col resto).

**Nuova pagina `RiepilogoCostiBreakEven.jsx`** (Analisi Costi → Riepilogo Costi Break Even): tre sezioni con frecce di espansione, e un pulsante "Scarica Excel" che esporta un foglio per sezione (Costi Variabili, Costi Fissi, Quote Ammortamento), ciascuno con la stessa struttura vista in pagina (imponibile + incidenza per specie).

## 133. EMERGENZA — trovato e corretto: perché "il costo di nascita non compare"

**Segnalato da Filippo**: "AIUTO, non mi compare il costo di nascita nel Report Riproduttori".

**Prima scoperta, grave**: le correzioni delle sezioni 123-124 (idempotenza di Elabora, pool unificato residuo+mantenimento) risultavano **assenti dal codice attuale**, nonostante fossero state consegnate come v193/v194 — probabilmente perse in un passaggio precedente (mai arrivate su GitHub prima del ripristino v195). Riapplicate integralmente entrambe.

**Causa reale del problema specifico segnalato**: un bug nuovo, mai notato prima. `anno_inizio_riproduzione` viene calcolato correttamente ogni volta che "Elabora" gira, ma **solo per i riproduttori nuovi** — per quelli già esistenti, il valore salvato al **primo** utilizzo non viene mai più aggiornato. Quando in questa sessione abbiamo corretto delle parentele scoprendo figli **più vecchi** di quanto risultasse (es. Filippo, figlio di Angelica, nato nel 2019 — ma Angelica aveva "anno inizio riproduzione" fermo al 2020 da prima), "Elabora" salta silenziosamente tutti gli anni precedenti a quello salvato — quel figlio non riceve mai il costo di nascita.

**Portata reale, controllata su tutto il database**: non solo Angelica — **23 riproduttori** interessati (molti suini: le femmine Large White, IT392011, IT392019, ecc. — probabilmente per lo stesso motivo strutturale, non solo per le correzioni di questa sessione).

**Corretto**:
1. Riapplicato il pool unificato residuo+mantenimento (motoreRiproduttori.js) — mai arrivato su GitHub prima d'ora
2. Riapplicato il reset di idempotenza (residuo_rimanente sempre ripristinato al totale prima di ogni rilancio)
3. **Nuovo fix**: prima di ripercorrere la storia, `anno_inizio_riproduzione` viene sempre riallineato al valore più aggiornato (se emerge un figlio più vecchio di quanto risultasse, lo cattura)
4. **Corretti direttamente nel database tutti e 23 i riproduttori interessati** — così anche PRIMA del prossimo deploy, rilanciando "Elabora" i costi di nascita mancanti dovrebbero comparire

**AZIONE NECESSARIA PER FILIPPO**: deployare questa versione, poi rilanciare "Elabora" su Report Riproduttori — un solo rilancio finale sistema tutti i 23 casi insieme.

## 133. Riepilogo Costi Break Even — aggiunte colonne Capi/Costo per capo/Peso/Costo al kg

**Richiesto da Filippo**: dopo l'imponibile, aggiungere numero di capi presenti in azienda per specie (suini: animali individuali + suinetti nei lotti), imponibile diviso capi, un campo peso modificabile, e il costo al kg risultante.

**Aggiunto**: un peso **per specie** (non per singola riga — altrimenti andrebbe reinserito decine di volte), mostrato in un pannello in cima alla pagina insieme al numero di capi attualmente attivi. Le 4 nuove colonne (Capi, €/capo, Peso, €/kg) compaiono nelle righe di dettaglio per specie (quelle che si aprono con la freccetta) — coerente col fatto che "numero capi" e "peso" sono per specie, non per singola area/categoria. Anche l'export Excel aggiornato con le stesse colonne per ciascuna specie.

Numero capi = animali con `stato='attivo'` al momento del caricamento (non filtrato per anno — è una fotografia di "quanti ce ne sono adesso in azienda", non storica).

## 134. Riepilogo Costi Break Even — riga Totale espandibile con somma per specie

**Richiesto da Filippo**: nel riepilogo, la somma dei costi variabili (e fissi, ammortamenti) per specie — non solo il totale complessivo, ma il riepilogo di tutte le aree sommate per Bovini/Suini/Ovini separatamente.

**Corretto**: la riga "Totale" di ogni sezione ora si apre con la stessa freccetta delle altre righe, mostrando la somma per specie di imponibile, €/UBA-gg (somma valida qui, stesso principio già confermato altrove — denominatore costante), capi, €/capo, peso e €/kg — stessa struttura a 8 colonne di ogni riga di dettaglio, applicata al totale della sezione.

## 135. Nuova sezione "Muratella S.r.l." — contabilità separata dentro Contabilità Industriale

**Richiesto da Filippo**: la Società Agricola Muratella S.r.l. ha sostenuto costi per Podere Verde — serve una sezione dedicata, con contabilità **nettamente separata** da quella di Podere Verde, che segua gli stessi principi (Area, Centro di Costo, Tipo Costo) ma con carico massivo e ben evidenziata ovunque come "Muratella", per non confondersi col resto.

**Due nuove tabelle**, mai condivise con quelle di Podere Verde (`ci_fatture`/`ci_articoli_fattura`): `muratella_fatture` e `muratella_articoli_fattura` — stessa struttura concettuale (numero, data, fornitore, area, centro di costo, tipo di costo, importo), ma completamente separate. Applicate direttamente via Supabase in sessione.

**Nuova cartella di menu "Muratella S.r.l."** (icona 🏛️, distinta dalle altre), con due pagine:
- **`ContabilitaMuratella.jsx`**: riepilogo costi per Area (espandibile per Centro di Costo, stessa logica ad accordion del resto del sistema, ma senza allocazione per specie — qui non ha senso, non è bestiame di Podere Verde), banner rosso "🏛️ SOCIETÀ AGRICOLA MURATELLA S.R.L." sempre visibile in cima, export Excel con "MURATELLA" nel nome del file e dei fogli
- **`CaricoMassivoMuratella.jsx`**: modello Excel scaricabile + import — righe con lo stesso numero+data+fornitore si raggruppano automaticamente nella stessa fattura (stesso principio già usato per Podere Verde)

**Colore distintivo**: rosso mattone (`#B03A2E`), deliberatamente diverso dal verde di Podere Verde, usato in banner, pulsanti e intestazioni di questa sezione — per rendere impossibile confondere a colpo d'occhio le due contabilità.

**Nota tecnica**: durante questa sessione il mio ambiente di lavoro si è resettato una seconda volta (già successo prima, sezione 125) — riscaricato il repository da GitHub e reintegrati i 2 file appena creati prima del reset, senza perdite.

Testato il raggruppamento fatture con caso mock (2 righe stesso numero/data/fornitore + 1 riga diversa): raggruppamento corretto, 2 fatture invece di 3 righe separate.


## 136. Contaminazione ricorrente — successa di nuovo, causa identificata con certezza

**Trovato mentre preparavo il pacchetto v205**: il file pesava 2MB invece dei soliti ~250KB — stessa identica contaminazione della sezione 125 (file di podereverdeapp.it dentro il repository Contabilità Industriale), tornata indietro.

**Causa identificata con certezza questa volta**: il commit `22d29d1` ("Filtro maschi riproduttori anche nella scheda di modifica animale...") — che è un lavoro fatto su **podereverdeapp.it**, non su questo progetto — è stato pushato nel repository sbagliato (Contabilità Industriale invece di allevamento), probabilmente perché il pacchetto podereverdeapp è stato estratto nella cartella locale sbagliata prima di un `git add .`.

**Pulito di nuovo**: stessi 20 file estranei + i 2 archivi .tar residui + la cartella build/ + le immagini generiche CRA. Verificato che il package.json sia rimasto corretto questa volta (solo i sorgenti erano tornati, non la configurazione). Ricompilato, 266KB, nessun residuo.

**Raccomandazione per evitare che succeda una terza volta**: prima di ogni `git add .` in uno dei due progetti, vale la pena controllare con `pwd` o `ls` di essere davvero nella cartella giusta — i due progetti si assomigliano abbastanza (entrambi React/Supabase) da confondersi facilmente estraendo l'archivio sbagliato sopra la cartella sbagliata.
