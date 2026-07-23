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

## 15. Riproduttori — recupero costo di acquisto sui figli (ragionamento passo-passo con Filippo)

**→ DA FARE su podereverdeapp.it (non qui in Contabilità Industriale)**: nel codice trovato (registrazione parto, sia in `allevamento_app.jsx` sia replicato altrove) c'è la riga `riproduttore:nato.sesso==="M"?true:false` — ogni maschio nato viene marcato AUTOMATICAMENTE riproduttore alla nascita solo per il sesso. Secondo Filippo questo è SBAGLIATO: un maschio deve restare `riproduttore:false` di default, e diventarlo solo tramite un pulsante di attivazione esplicita (esistente nell'app secondo Filippo, non ancora individuato con certezza nel codice disponibile). Le femmine restano invece automatiche: diventano riproduttrici *ipso facto* al primo parto registrato (comportamento corretto, non cambiare). Verificare e correggere quando si interviene su podereverdeapp.it.

**Distinzione riproduttore/non-riproduttore**: NON serve per la ripartizione dei costi ordinari (quella resta sempre via UBA-giorni, uguale per tutti). Serve invece per un meccanismo a parte: **il costo di un riproduttore si scarica sui suoi figli**, non resta a carico dell'azienda in generale.

**Due problemi distinti, tenuti separati per ora**:
- **Costo di mantenimento annuale senza figli quell'anno**: resta un "conto sospeso" per riproduttore, si scarica tutto l'arretrato insieme alla prossima cucciolata utile (miglioria da costruire dopo il caso base)
- **Costo di acquisto del riproduttore**: non si sa in anticipo quante cucciolate/figli totali avrà — si tratta come un **cespite con valore residuo stimato**: costo di acquisto − valore atteso di realizzo finale, solo la differenza si "ammortizza" (si scarica sui figli) nel tempo

**Valore atteso di realizzo finale — 2 valutazioni** (decisione presa):
- Peso vivo medio storico (da animali podereverdeapp.it, riproduttori usciti con **più di 3 anni di vita**, scartando i giovani) × prezzo di mercato per il vivo (tabella `prezzi_riforma` già esistente)
- Peso carcassa medio storico (stesso filtro >3 anni) × prezzo di mercato per la carcassa
- Si userà la valutazione pertinente a seconda di come esce quel riproduttore specifico (vivo o macellato)

**Dati reali della riproduttrice da usare per stimare figli futuri attesi** (formule già trovate in `foglio_kpi`, ExportManager.jsx):
- Prolificità = totale nati vivi ÷ numero di parti
- IIP (Intervallo Inter-Parto, non IPP) = media giorni tra parti consecutivi dello stesso animale
- % nati vivi = nati vivi ÷ (nati vivi + nati morti) × 100

**Vita produttiva attesa per specie**: nessun dato scientifico affidabile trovato per allevamento semibrado/brado su razze rare (Cinta Senese, Maremmana) — troppo generico o assente online. Decisione: **parametro configurabile** impostato inizialmente da Filippo/veterinario, che **il programma stesso affina nel tempo**, ricalcolando l'età media reale all'uscita dei riproduttori (per specie) man mano che ne escono altri — il dato via via si specializza sui dati reali dell'azienda invece di restare una stima esterna fissa.

**Unificazione proposta e accettata, con formula del residuo aggiornata**: il residuo da recuperare NON è solo (acquisto − valore di realizzo stimato) — include ANCHE i costi di allevamento sostenuti prima dell'inizio dell'attività riproduttiva (rilevante soprattutto per i riproduttori nati in azienda, che non hanno un costo di acquisto ma hanno comunque un residuo proprio da questi costi):
```
Residuo = (Costo di acquisto, se presente + Costi di crescita pre-riproduttiva) − Valore di realizzo stimato
```
Il residuo si tratta come un ammortamento su un numero di anni pari alla vita riproduttiva attesa residua; ogni anno quella quota si somma al costo di mantenimento ordinario (via UBA-giorni), e il totale annuale si scarica sui figli con lo stesso meccanismo (compreso il conto sospeso se manca la cucciolata quell'anno).

**Femmine con scarsa/nessuna storia di parti — regola concordata**: soglia netta a **3 parti**. Sotto i 3 parti si usa la media di specie/razza (non il dato personale, troppo poco significativo); da 3 parti compiuti in poi, si passa al dato reale personale della riproduttrice (prolificità e IIP suoi).

**Padri — più semplice delle femmine**: nessuna stima di prolificità/IIP necessaria — per un padre **consolidato** basta il conteggio reale dei figli avuti nell'anno (tracciati via `padre_id` nel pedigree). Per i padri **giovani** (non ancora consolidati), stessa logica delle femmine (media di specie/razza finché non consolidato), ma la soglia si misura in **anni di attività riproduttiva**, non in numero di parti (un padre non partorisce):
- Bovini: consolidato dal **3° anno** di attività riproduttiva in poi
- Suini: consolidato dal **2° anno** in poi
- Ovini: consolidato dal **2° anno** in poi

**Quadro riassuntivo — il meccanismo è ricorsivo, di generazione in generazione** (sintesi di Filippo, confermata): il "costo di nascita" ereditato dai genitori riproduttori si aggiunge al conto che l'animale accumula anno per anno (via UBA-giorni). Alla fine, quel conto prende una di tre strade:
1. **Uscita produttiva** (venduto vivo/macellato) → il conto si chiude, compensato dal valore di vendita V(t)
2. **Diventa riproduttore lui stesso** → il suo conto accumulato (nascita ereditata + costi annuali sostenuti) diventa il NUOVO "residuo da recuperare" che ripartirà sui SUOI figli — stesso meccanismo, una generazione più in là
3. **Uscita improduttiva** → il conto si spalma sugli altri animali vivi quell'anno (regola aggressiva)

**Conguaglio finale — DECISIONE PRESA (punto chiuso)**: quando il riproduttore esce davvero (macellato o venduto vivo), si conosce il **valore reale** (non più una stima) — il ricavo vero della vendita/cessione. La differenza tra questo valore reale e la stima usata negli anni precedenti si scarica come **conguaglio sui figli dell'ultimo anno** (quello in cui il riproduttore esce), positivo o negativo: se il valore reale è più alto della stima, il conguaglio riduce quanto quei figli devono assorbire; se è più basso, lo aumenta. Il conguaglio non si applica retroattivamente sui figli degli anni precedenti (già chiusi), solo su quelli dell'anno di uscita.

## 16. Parametri configurabili — requisito trasversale (non hardcodare le regole di business)

Tutte le soglie/regole decise nella sezione 15 devono essere **leggibili e modificabili da una pagina dell'app** (non hardcoded nel codice):
- Soglia parti per consolidamento femmine riproduttrici (oggi: 3, uguale per tutte le specie)
- Soglia anni di attività riproduttiva per consolidamento maschi, per specie (Bovini: 3, Suini: 2, Ovini: 2)
- Vita produttiva attesa per riproduttore, per specie (valore iniziale impostato da Filippo, poi affinato automaticamente dal programma — ma sempre visibile e correggibile a mano)
- Età minima (oggi: >3 anni) per includere un animale nel calcolo del peso medio storico per la stima del valore di realizzo riproduttori

Da costruire come tabella dedicata (es. `ci_parametri`) + una schermata semplice di configurazione, quando si arriva a costruire questa parte (Blocco 4).

## 14. Costo per animale — flusso concordato passo-passo con Filippo (Blocco 4, guida la costruzione)

**Struttura pagine Report concordata (Blocco 4)**:
1. **Report UBA** (già costruito) — da arricchire con riepilogo per anno/specie (con % specie sul totale) e tabella perdite per specie (capi improduttivi, UBA-giorni persi, costo economico)
2. **Report Costi** (nuovo) — livello specie/anno: costi totali, valore riforma, UBA-giorni, tasso €/UBA-giorno (formula aggressiva), sia aziendale sia per singola specie, con andamento anno su anno
3. **Scheda Animale — dettaglio costo** (nuovo) — storia costo anno per anno + totale cumulato per un singolo animale/unità di lotto, incluso costo di nascita ereditato, quota di perdita assorbita, e residuo scaricato sui figli se diventato riproduttore
4. **Report Riproduttori** (nuovo) — elenco riproduttori (attivi/usciti) con residuo da recuperare, figli su cui è stato scaricato, conto sospeso in attesa di cucciolata, conguaglio finale per chi è uscito
5. **Parametri** (sezione 16) — le soglie configurabili in un'unica schermata

**Accesso alla Scheda Animale — due strade**:
- Cliccando su una riga della tabella Report UBA (contestuale, da un anno specifico)
- **Ricerca diretta per BDN/nome** (utile se non si ricorda in quale anno era presente) — casella di ricerca, probabilmente in cima a Report UBA

**Principio**: ogni animale, in proporzione ai suoi UBA-giorni, si prende in carico sia i costi ordinari (Fisso/Variabile) sia la quota di ammortamento dell'anno — stesso meccanismo di ripartizione per entrambi. Per i Cespiti il collegamento a una specie passa dal campo **Imputazione** (Bovini/Suini/Ovini/Generali/Nessuno), non dalla Destinazione delle fatture ordinarie — stesso ruolo, campo diverso. Cespiti con Imputazione="Nessuno" restano sempre fuori dal calcolo.

**Nota — copre anche i componenti di lotto**: la nuova tabella dovrà gestire sia l'animale individuale (`animale_id`, riferimento diretto a `animali`) sia l'unità di lotto non individualizzata (riferimento a `lotti_suini`/`suini_lotto`, stessa identica logica già usata in `ci_report_uba_animale`) — stesso meccanismo, non un secondo sistema a parte. Il costo deve essere consultabile da podereverdeapp.it sia per anno sia complessivo, per entrambi i casi.

**Traghettamento costi all'assegnazione BDN (requisito importante)**: quando un suinetto passa da unità di lotto anonima ad animale individuale con BDN (pulsante "🏷️ Assegna BDN" già presente in podereverdeapp.it, visto in `FormAssegnaBDN`), tutti i costi già maturati mentre era nel lotto (quota UBA-giorni, costo di nascita ereditato) devono **traghettare** sul nuovo `animale_id` — non ripartire da zero. Serve un passaggio che ricollega le righe di costo già registrate sotto lotto+numero al nuovo animale individuale, mantenendo il totale continuo.

**Lavoro parallelo da ricordare**: oltre a scrivere il dato, sarà probabilmente necessario **anche modificare podereverdeapp.it** (progetto separato) per aggiungere una schermata che mostri bene questi costi (per anno e complessivi) sulla scheda del singolo animale o lotto — oggi il campo `costi_mantenimento_cumulati` esiste e viene usato nel calcolo interno, ma probabilmente non ha ancora una vista dedicata per l'utente. Da affrontare quando si arriva a quel punto, sull'altro progetto.

**Flusso dati — a senso unico, Contabilità Industriale → podereverdeapp.it**:
1. La Contabilità Industriale **calcola e scrive** il costo di ogni animale, anno per anno (nuova tabella da creare, es. `ci_costo_animale_annuale`), consultabile qui cliccando sul singolo animale (come le schede animale di podereverdeapp.it) — mostra il dettaglio per anno e la somma di tutti gli anni
2. La Contabilità Industriale **aggiorna anche** il campo cumulativo `animali.costi_mantenimento_cumulati` (già esistente nella tabella `animali`, già letto da ExportManager.jsx nel calcolo "Costo netto residuo" — costo iniziale + mantenimento cumulati − quota scaricata figli − valore riforma)
3. **podereverdeapp.it non scrive mai questo dato, lo legge soltanto** — nessuna modifica necessaria lì, il campo esiste già e viene già consultato nel suo calcolo esistente; diventa "vivo" nel momento in cui la Contabilità Industriale inizia a scriverci dentro

## 13. Unità di misura — cambio di approccio (decisione presa)

Il campo `unita_misura` di `ci_articoli_fattura` **non è più vincolato** a un elenco fisso (il vincolo alle 8 unità è stato rimosso) — accetta qualunque testo presente nella fattura originale (millilitri, centilitri, sacchi, confezioni, ecc.), per non perdere il dato reale né bloccare il caricamento massivo. Il campo U.M. nel modulo manuale (Nuova Fattura Attiva) è ora un testo libero con suggerimenti (datalist), non più una tendina chiusa.

**Requisito per i report futuri (Blocco 4/5)**: dato che le unità non sono più uniformi, i report che aggregano quantità (es. "totale kg di mangime acquistato") dovranno prevedere una **conversione tra unità diverse** (es. Millilitri→Litri, Sacchi→Kg se si conosce il peso standard di un sacco) — funzione ancora da progettare, non dimenticarla in fase di report.

## 12. Analisi del codice sorgente reale di Prima App (confronto diretto, non solo riassunto)

**Confermato**: il sistema AREA/CENTRO DI COSTO/DESTINAZIONE/TIPO DI COSTO con regole FCV/FCF **non esiste nel codice reale di Prima App** — era un progetto di integrazione mai realizzato lì. Quello che abbiamo costruito noi va oltre Prima App su questo punto specifico.

**Formula costo/UBA-giorno — DECISIONE FINALE E DEFINITIVA (dopo ragionamento approfondito passo-passo, CORRETTA da un bug di doppio conteggio trovato durante l'implementazione)**: il motore reale di podereverdeapp.it usa la formula semplice `(C(t)-V(t))/F(t)` con F(t) = tutti gli UBA-giorni inclusi gli improduttivi — MA Filippo ha deciso esplicitamente di **non** usarla: vuole la formula "aggressiva", perché **i costi degli animali improduttivi devono essere recuperati in qualche modo**. La formula corretta (testata: il totale allocato ai produttivi torna esatto ai costi reali, nessun euro creato dal nulla) è:
```
F(t)_produttivi = UBA-giorni SOLO di produttivi+riproduttori (esclusi improduttivi_usciti)
netto_da_recuperare = C(t) - V(t)
tasso_RETTIFICATO = netto_da_recuperare / F(t)_produttivi   ← usato per allocare, punto
```
Escludere gli improduttivi dal divisore realizza GIÀ da solo la ridistribuzione — non si aggiunge nessuna "perdita" sopra (farlo raddoppia il conteggio, bug trovato e corretto in fase di test). Per trasparenza si può mostrare anche `tasso_semplice = netto_da_recuperare / F(t)_totale` (F(t)_totale include gli improduttivi) e `perdita_spalmata = (tasso_RETTIFICATO - tasso_semplice) × F(t)_produttivi` come dato informativo (quanto in più pagano i sopravvissuti), ma questo NON entra nel calcolo del tasso stesso. Il costo dei capi "inutili" viene così esplicitamente spalmato sopra il costo dei capi "utili", aumentando il loro costo unitario per UBA-giorno — non resta un dato aziendale a parte.

**Struttura Report UBA/KPI concordata passo-passo con Filippo (importante, guida la costruzione del Blocco 4)**:
1. **Dimensione Anno**: i dati UBA sono organizzati per anno solare; i costi di un anno si imputano agli animali "presenti" in quell'anno
2. **"Presente in un anno"**: qualunque animale fisicamente in azienda per almeno un giorno dentro l'anno solare (non un taglio secco sì/no — un conteggio di giorni effettivi, da `periodoNellAnnoExp`) — età e giorni di presenza sono i due soli ingredienti di tutto il calcolo UBA
3. **Dimensione Specie**: Bovini, Suini (inclusi quelli ancora nei lotti, non solo individualizzati), Ovini — la somma delle tre dà il totale aziendale
4. **% specie sul totale UBA-giorni**: da mostrare sempre nel report come dato leggibile a sé (anche se il calcolo interno userà il tasso diretto, non passa esplicitamente per questa percentuale — matematicamente equivalenti)
5. **Animali "utili" vs "inutili"**: utili = PRODUTTIVO + RIPRODUTTORE (vivi, venduti vivi, macellati); inutili = IMPRODUTTIVO_USCITO (morti, predati, smarriti, "Altro")
6. **Tabella perdite UBA per specie**: per ogni specie, N° capi improduttivi usciti, UBA-giorni persi, % sul totale UBA-giorni di quella specie, e il costo economico di quella perdita (UBA-giorni persi × tasso) — da mostrare esplicitamente nella pagina Report
7. Questo costo delle perdite **si somma esplicitamente** al costo dei capi utili (formula aggressiva sopra), non resta un dato a sé stante

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
