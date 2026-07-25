# Contabilità Industriale — Stato del Progetto
_Documento di riferimento — aggiornato ad ogni decisione importante. Se stai leggendo questo per riprendere il progetto da zero (nuova chat), leggi tutto prima di scrivere codice: contiene decisioni di business non ovvie dal solo codice._

## 1. Architettura

- **Repo GitHub**: podereverde-contabilita-industriale (separato da podereverdeapp)
- **Deploy**: Vercel, progetto separato
- **Database**: STESSO Supabase di Podere Verde App/podereverdeapp.it (pyjymnpnxatqwfhguaus) — non un database a parte
  - Motivo: `ci_report_uba_animale.animale_id`, `ci_costo_animale_annuale.animale_id/lotto_id`, `ci_report_acquisto_animali.animale_id/lotto_id` sono FK dirette verso `animali`/`lotti_suini` — niente sincronizzazione, dati in tempo reale
  - **Flusso a senso unico verso podereverdeapp.it**: Contabilità Industriale calcola e scrive (`ci_costo_animale_annuale`), podereverdeapp.it legge soltanto (tab "💰 Costi" nella scheda animale, aggiunta in allevamento v94 — vedi sezione 18)
- **Ispirazione iniziale**: "Prima App" di Colabucci (Next.js+Prisma, database separato) — analisi del codice sorgente reale fatta a fondo (sezione 19), non solo dalle pagine web
- **Lettura PDF fatture**: funzione server `api/leggi-fattura-pdf.js`, chiama Claude (chiave `ANTHROPIC_API_KEY` su Vercel, mai esposta al browser). **Bug noto irrisolto**: pagamento Anthropic Console bloccato per carte europee (Stripe SetupIntent 0€ + 3DS) — la lettura PDF non è mai stata testata con successo per questo motivo.
- **Stack tecnico**: React + Vite, Supabase diretto (`@supabase/supabase-js`), niente ORM. Libreria `xlsx` per import/export Excel.

## 2. Schema database (tabelle, prefisso `ci_`)

- `ci_fornitori`, `ci_clienti` — anagrafiche
- `ci_fatture`, `ci_articoli_fattura` — fatture (ATTIVA/PASSIVA) e righe, con classificazione a 4 livelli (Area/Centro di Costo/Destinazione/Tipo di costo)
- `ci_cespiti`, `ci_cespiti_ammortamento` — cespiti gestiti in app, con `fattura_id` (collegamento alla fattura di provenienza, NULL per i cespiti storici migrati) e `specie` (array, l'Imputazione)
- `ci_piano_dei_conti` — combinazioni valide Area × Centro di Costo
- `ci_regole_fornitore_variabile` (FCV, parola chiave), `ci_regole_fornitore_fissa` (FCF, fissa per fornitore)
- `ci_report_acquisto_animali` — righe da tradurre a mano in podereverdeapp.it (include quantità/unità_misura/prezzo_unitario)
- `ci_righe_scartate` — memoria righe da ignorare per fornitore+descrizione (persiste tra caricamenti)
- `ci_bozze_import` — bozza di importazione non ancora salvata (autosalvata ogni 1,5s)
- `ci_parametri` — soglie di business configurabili da UI (sezione 9)
- `ci_costo_animale_annuale` — costo calcolato per animale/unità di lotto, anno per anno (sezione 8) — **unica tabella scritta qui e letta da podereverdeapp.it**
- `ci_tasso_uba_annuale` — tasso €/UBA-giorno salvato per anno (trasparenza/debug)
- `ci_residuo_riproduttore`, `ci_scarico_riproduttore_annuale` — meccanismo riproduttori (sezione 10)
- **Tutte le tabelle hanno RLS disattivato** (`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`) — se una nuova tabella creata in futuro dà errore "row-level security policy", è quasi sempre perché questa riga è stata dimenticata nello script di creazione.
- **Policy aggiunta su tabelle di podereverdeapp.it** (non di Contabilità Industriale): `animali`, `lotti_suini`, `suini_lotto` avevano RLS che permetteva lettura solo ad utenti autenticati — Contabilità Industriale si connette come `anon` (nessun login), quindi leggeva 0 righe senza errore. Aggiunta una policy `FOR SELECT TO anon USING (true)` che si somma a quelle esistenti, senza toccare scrittura/autenticazione di podereverdeapp.it.

## 3. Classificazione a 4 livelli — LE REGOLE DI BUSINESS (fondamentali, non modificare senza motivo)

**AREA** (17 voci): Allevamento, Coltivazione, Lavoro, Energia Elettrica, Acqua, Consulenze, Assicurazioni,
Lavorazioni prodotti allevamento, Spese Promozionali, Oneri Finanziari, Varie, Animali non d'allevamento,
Orto, Canoni ed Abbonamenti, **Ammortamenti** (speciale), **ACQUISTO ANIMALI** (speciale), **TRASPORTO ANIMALI** (speciale)

**CENTRO DI COSTO**: a cascata sull'Area, espandibile dall'operatore (se scrive uno nuovo, si aggiunge al piano dei conti per il futuro — con controllo case-insensitive per non duplicare varianti dello stesso nome)

**DESTINAZIONE**: Bovini/Suini/Ovini/Generali(→ripartiti per UBA-giorno)/Pollame/Cavalli

**TIPO DI COSTO**: Fisso / Variabile / **Ammortizzabile** (quote di ammortamento — vincolo DB: Area="Ammortamenti" ⟹ Tipo="Ammortizzabile", sempre, non derogabile)

### Le 3 aree speciali

- **Ammortamenti**: NON è un costo ordinario — genera un **Cespite** automaticamente al salvataggio della riga (mappatura: descrizione riga→descrizione bene, Categoria Ammortamento→categoria, fornitore→fornitore, **fattura→fattura_id** (collegamento per tracciabilità), data fattura→data acquisto, imponibile→costo acquisto, %Ammortamento→anni=arrotonda(100/%), Imputazione→specie). **Bug storico trovato e corretto (v33)**: prima si salvava solo il dettaglio di classificazione, mai il Cespite vero e proprio — corretto, ora la creazione è automatica.
  - **Imputazione (tendina)**: Bovini, Suini, Ovini, Generali, **Cavalli, Pollame, Orto** (aggiunte in una sessione successiva), Nessuno
  - **Categoria Ammortamento — le 10 voci esatte (tendina, non testo libero)**: 3 - Attrezzatura specifica; 3 - Costruzioni leggere; 5 - Macchinari, apparecchi e attrezzature varie; 5 b - Macchinari, apparecchi e attrezzature varie extra allevamento; 6 - Spese atti notarili; 7 - Animali non oggetto di allevamento; 15 - Autovetture, motoveicoli e simili; 30 – Avviamento; 31 - Spese di costituzione e trasformazione; 34 - Altri oneri pluriennali
- **ACQUISTO ANIMALI**: "finta area" — non entra MAI nella contabilità industriale ordinaria (niente Centro Costo/Destinazione/Tipo Costo). Va in `ci_report_acquisto_animali` (stato DA_ELABORARE), che l'operatore umano traduce a mano in un animale o lotto su podereverdeapp.it.
  - **Specie (tendina)**: Bovini, Suini, Ovini, "Piu' specie acquistate insieme"
  - **Razza (tendina a cascata sulla specie)**: Bovini→Chianina/Marchigiana/Maremmana/Limousine/Charolais/Frisona/Pezzata Rossa/Meticcia/Altra; Suini→Large White/Landrace/Duroc/Cinta senese/Mora romagnola/Nero casertano/Nero apucalabro/Meticcia/Altra; Ovini→Sopravvissana/Suffolk/Meticcia/Altra
- **TRASPORTO ANIMALI**: SEMPRE manuale, mai auto-classificabile da FCV/FCF. Natura mista: una fattura può contenere sia trasporto verso il macello (resta in contabilità industriale ordinaria) sia trasporto di animali in ingresso (va nel Report Acquisto Animali). L'operatore divide l'imponibile tra le due caselle; il sistema verifica che la somma torni all'imponibile originale della riga.

## 4. Piano dei Conti — Area × Centro di Costo (dati reali caricati)

16 aree con centri di costo definiti (elenco completo caricato in `ci_piano_dei_conti`): Allevamento, Coltivazione, Lavoro, Energia Elettrica, Acqua, Consulenze, Assicurazioni, Lavorazioni prodotti allevamento, Spese Promozionali, Oneri Finanziari, Varie, Orto, Canoni ed Abbonamenti, TRASPORTO ANIMALI, più **Animali non d'allevamento** (aggiunta successivamente: Mangime e alimentazione/Veterinaria e cure/Attrezzature e manutenzione/Altro — copre Pollame e Cavalli). Ammortamenti e ACQUISTO ANIMALI non hanno centro di costo proprio (usano rispettivamente Categoria Ammortamento e Specie/Razza/Destinazione).

## 5. Motore di classificazione automatica (costruito e testato)

`src/motoreClassificazione.js` — ordine di applicazione:
1. Cerca regola fissa (FCF) per il fornitore (per P.IVA se nota, altrimenti nome case-insensitive) → se trovata, applica sempre
2. Altrimenti cerca regola variabile (FCV): fornitore + parola chiave contenuta nella descrizione
3. Altrimenti → stato MASCHERA (classificazione manuale richiesta)
4. Regole trasversali non derogabili: Area=Ammortamenti forza Tipo=Ammortizzabile; Area=TRASPORTO ANIMALI forza sempre MASCHERA

**Dati reali caricati**: 60 fornitori, 249 regole FCV, 11 regole FCF (Alfa Omega ha solo FCF).

**Sistema "che impara"**: quando una riga MASCHERA viene classificata a mano e salvata, l'operatore può scegliere: solo questa volta / regola fissa per il fornitore (FCF) / regola per parola chiave (FCV).

**Salvataggio per riga singola**: ogni riga si salva individualmente (`salvaRiga`), condividendo la fattura con altre righe già salvate. `annullaSalvataggioRiga` elimina i record creati (articolo/dettaglio ammortamento/cespite/report acquisto/regola) e ricalcola i totali fattura.

**Righe scartate con memoria**: pulsante "🗑️ Scarta e ricorda" salva in `ci_righe_scartate` (fornitore+descrizione); ai caricamenti successivi le righe dello stesso fornitore+descrizione compaiono già marcate.

**Unità di misura**: campo libero (nessun vincolo), accetta qualunque testo dalla fattura originale.

## 6. Motore di calcolo costi (`motoreUba.js`, `motoreRiproduttori.js`, `calcoloReportCosti.js`)

### 6.1 Motore UBA (`motoreUba.js`)
Identico a quello di podereverdeapp.it (`ExportManager.jsx`), calcolato **direttamente dagli animali/lotti reali**, nessun import Excel intermedio:
- `UBA_FASCE_EXP`: coefficienti per specie/fascia d'età (bovino: 0.40/0.70/1.00 a 210/730/∞ giorni; suino: 0.027/0.30/0.50 a 90/365/∞ giorni; ovino: 0.027/0.10/0.15 a 120/365/∞ giorni)
- `periodoNellAnnoExp`, `calcolaUBAMedioExp`, `categoriaContabileExp` — stessa logica di ExportManager.jsx (vedi sezione 19 per i dettagli trovati nel codice sorgente)
- `calcolaReportUba(animali, lotti, suiniLotto, anno)`: righe UBA per un anno, sia per animali individuali sia per unità di lotto suini non individualizzate

### 6.2 Formula "aggressiva" costo/UBA-giorno — DECISIONE FINALE (Filippo, non la formula semplice di podereverdeapp.it)
```
F(t)_produttivi = UBA-giorni SOLO di produttivi+riproduttori (esclusi improduttivi_usciti)
netto_da_recuperare = C(t) - V(t)
tasso_RETTIFICATO = netto_da_recuperare / F(t)_produttivi   ← usato per allocare, punto
```
Escludere gli improduttivi dal divisore realizza GIÀ da solo la ridistribuzione — **non si aggiunge nessuna "perdita" sopra** (bug di doppio conteggio trovato e corretto in fase di test: farlo genera euro dal nulla). Per trasparenza si mostra anche `tasso_semplice` (se si dividesse su tutti) e `perdita_spalmata` come dato informativo, mai sommato al calcolo.

**Correzione di fondo (non solo interfaccia)**: i costi **diretti** a una specie (Destinazione/Imputazione = quella specie) restano DENTRO quella specie — solo i costi **Generali** si ripartiscono proporzionalmente agli UBA-giorni produttivi di ciascuna specie. Ogni specie mostra un'**incidenza €/UBA-giorno propria** (non un tasso aziendale unico) — emergono differenze reali tra specie. Funzione condivisa `calcolaRigaAggregata(costiDiretti, ubaGiorniProduttiviPerSpecie, ubaGiorniProduttiviAziendali)` in `motoreUba.js`, riusata a ogni livello di granularità (aziendale, area, centro di costo).

### 6.3 Pollame, Cavalli, Orto — MAI ripartiti sulle 3 specie d'allevamento
Diversi dai costi "Generali": Pollame/Cavalli (Destinazione) e Orto (Area) sono attività collaterali, **esclusi sia dai costi diretti sia dai Generali**. Riconosciuti sia per Destinazione sia per Area (per "Animali non d'allevamento", entrambi i criteri — vedi sezione 7). Mostrati in un riquadro rosso a parte con l'incidenza calcolata sul totale UBA-giorni degli animali d'allevamento veri, come dato di confronto (non un costo allocato).

## 7. Ammortamenti — distinzione Generali vs "non imputabile in allevamento"

**Regola definitiva**: tra le Imputazioni possibili per un cespite (Bovini/Suini/Ovini/Generali/Nessuno/Cavalli/Pollame/Orto):
- **Generali** → SI ripartisce pro-quota su Bovini/Suini/Ovini in base agli UBA-giorni
- **Nessuno, Cavalli, Pollame, Orto** → MAI ripartiti su nessuna specie d'allevamento, né direttamente né via Generali — sempre esclusi ed evidenziati **in rosso** con l'etichetta "non imputabile in allevamento"

La logica di calcolo condivisa (`calcoloReportCosti.js`) gestiva già correttamente questa distinzione quando è stata scritta; il buco reale era altrove: le tendine Imputazione non offrivano ancora Cavalli/Pollame/Orto come opzioni (corretto), e Report Cespiti aveva un elenco di chiavi incompleto per cui quei cespiti sparivano senza traccia dalla scomposizione "per Imputazione" (corretto — ora appaiono evidenziati in rosso con l'etichetta, sia in Report Cespiti sia nella scheda del singolo cespite in Gestione).

**Attenzione per il futuro**: quando si tocca questa logica, verificare SEMPRE che un nuovo valore di Imputazione non finisca per errore nel bucket "Generale" (che si ripartisce) invece che nel bucket "non imputabile" (che resta escluso) — è la classe di bug più probabile qui.

## 8. Costo per animale — `ci_costo_animale_annuale`

**Scheda Animale — struttura completa (COSTRUITA)**: intestazione (BDN/nome/specie/razza/sesso, badge Stato allineato a podereverdeapp.it con rosso se improduttivo, badge Riproduttore/Riproduttrice), dati anagrafici (ingresso, uscita+motivo, genitori con link, età **da nascita**/categoria età/permanenza in azienda **da ingresso** — due date distinte, non confuse), pesi (nascita/attuale/vivo uscita/carcassa/resa%, letti da podereverdeapp.it), costi (costo iniziale + tabella anno per anno + VALORE COMPLESSIVO), dati riproduttore se pertinente (residuo, conto sospeso, valore realizzo stimato/reale, figli per anno), alert costo acquisto mancante. Accessibile da ricerca diretta o cliccando su una riga di Report UBA.

**VALORE COMPLESSIVO (costruito, Scheda Animale)**: costo iniziale (acquisto o quota pro-capite del lotto se acquistato — `prezzo_acquisto lotto / nati_totali`, stessa formula già usata in podereverdeapp.it `ExportManager.jsx`) + somma di `costo_totale_anno` per tutti gli anni. Se nato in azienda, il costo iniziale è 0 (il costo di nascita è già dentro la somma degli anni, come `costo_nascita_ereditato`) — per non contarlo due volte.

**Traghettamento costi all'assegnazione BDN — COSTRUITO** (pulsante "🔄 Traghetta costi lotto→BDN" in Scheda Animale): cerca tutte le unità di lotto con `stato="registrato_individuale"`, trova l'animale corrispondente per BDN, e sposta le righe di `ci_costo_animale_annuale` da `lotto_id`+`unita_nr` a `animale_id`. Se esiste già una riga per lo stesso anno sull'animale (es. Report Costi rilanciato dopo il passaggio a BDN), le **fonde** sommando i valori invece di sovrascrivere — testato che la somma torni esatta.

Ogni animale, in proporzione ai suoi UBA-giorni, si prende in carico sia i costi ordinari (Fisso/Variabile) sia la quota di ammortamento dell'anno — stesso meccanismo di ripartizione per entrambi. Copre sia l'animale individuale (`animale_id`) sia l'unità di lotto non individualizzata (`lotto_id`+`unita_nr`) — stesso meccanismo, non un secondo sistema a parte.

**Traghettamento costi all'assegnazione BDN**: vedi sopra — costruito.

**Flusso di calcolo (ordine d'uso corretto in Report Costi)**: 1) Report UBA per l'anno → 2) Report Costi per l'anno (calcola e salva `ci_costo_animale_annuale` + `ci_tasso_uba_annuale`) → 3) Report Riproduttori per lo stesso anno (calcola e scarica sui figli, aggiorna la riga di costo già salvata al punto 2).

## 9. Parametri configurabili (`ci_parametri`, pagina Parametri)

Tutte le soglie di business sono leggibili/modificabili da UI, non hardcoded:
- Soglia parti per consolidamento femmine riproduttrici (default: 3, uguale per tutte le specie)
- Soglia anni di attività riproduttiva per consolidamento maschi, per specie (Bovini: 3, Suini: 2, Ovini: 2)
- Vita produttiva attesa per riproduttore, per specie (valore iniziale impostato da Filippo, poi da affinare nel tempo — meccanismo di auto-affinamento non ancora costruito)
- Età minima (default: >3 anni) per includere un animale nel calcolo del peso medio storico per la stima del valore di realizzo riproduttori

## 10. Riproduttori — meccanismo completo (`motoreRiproduttori.js`, pagina Report Riproduttori)

**Correzione importante (bug reale trovato ragionando con Filippo)**: il riconoscimento dei "figli" di un riproduttore, per lo scarico del residuo e il conguaglio, controllava SOLO `animali.padre_id`/`madre_id` — ignorando completamente i suinetti ancora dentro un lotto (`suini_lotto`), che hanno padre/madre registrati sul LOTTO (`lotti_suini.padre_id`/`madre_id`), non sulla singola unità. Risultato: un suinetto in un lotto, anche se figlio di un riproduttore riconosciuto, non riceveva mai il costo di nascita ereditato. Corretto: ora si combinano figli individuali + unità di lotto in un unico conteggio, con lo stesso costo per figlio diviso su entrambi i gruppi insieme. **Discriminante esplicito aggiunto**: un figlio riceve il costo di nascita solo se `provenienza==="Nato in azienda"` (per gli individuali) o `lotto.tipo_provenienza!=="acquistato"` (per i lotti) — non basta più la sola presenza di padre_id/madre_id, che potrebbe essere valorizzata per errore anche su un animale acquistato. Testato con un caso misto (animale individuale + 3 suinetti di lotto, con un caso di ciascun tipo correttamente escluso).

**Perché**: la ripartizione costi ordinaria (UBA-giorni) resta uguale per tutti. In più, il costo di UN riproduttore si scarica sui SUOI figli, non resta a carico generico dell'azienda.

**Residuo da recuperare**:
```
Residuo = (Costo di acquisto, se presente + Costi di crescita pre-riproduttiva) − Valore di realizzo stimato
```
Ammortizzato sulla vita produttiva attesa; ogni anno la quota si somma al mantenimento ordinario e si scarica sui figli dell'anno.

**Conto sospeso**: se un anno non ha figli, la quota si accumula (il residuo NON si riduce, perché nessuno l'ha effettivamente recuperata) — alla prima cucciolata successiva si scarica quota corrente + tutto l'arretrato insieme, diviso tra i figli di quell'anno. **Bug trovato e corretto in fase di test**: il residuo rimanente si riduceva solo della quota dell'anno, non dell'intero importo scaricato (quota + arretrato) — corretto, verificato che dopo N anni il residuo torni esattamente a zero.

**Valore di realizzo stimato — 2 valutazioni indipendenti** (non derivate l'una dall'altra, altrimenti collassano matematicamente allo stesso numero — bug trovato prima di costruire, richiesto un campo `prezzo_kg_carcassa` separato su `prezzi_riforma` di podereverdeapp.it):
- Peso vivo medio storico (animali stessa specie/razza usciti con >3 anni di vita) × `prezzo_kg_vivo`
- Peso carcassa medio storico (stesso filtro) × `prezzo_kg_carcassa`
- Alla creazione del residuo si usa prudenzialmente la valutazione più bassa tra le due (non si sa ancora se uscirà vivo o macellato)

**Consolidamento dati personali**:
- Femmine: sotto 3 parti → media di specie/razza; da 3 parti in poi → dato personale (Prolificità = nati vivi÷parti; IIP = media giorni tra parti)
- Maschi: nessuna stima di prolificità necessaria, solo conteggio figli reali (via `padre_id`). Consolidato dopo N anni di attività (Bovini 3, Suini 2, Ovini 2); prima, media di specie/razza

**Meccanismo ricorsivo, di generazione in generazione**: il costo di nascita ereditato si accumula anno per anno; all'uscita dell'animale, il conto prende una di 3 strade — (1) uscita produttiva: si chiude, compensato da V(t); (2) diventa riproduttore: il suo conto accumulato diventa il residuo per i SUOI figli; (3) uscita improduttiva: si spalma sugli altri vivi (formula aggressiva).

**Conguaglio finale** (pulsante "⚖️ Applica conguagli"): quando il riproduttore esce davvero, si conosce il valore REALE (peso effettivo alla sua uscita, non più la media storica). La differenza tra reale e stimato si scarica come conguaglio sui figli dell'**ultimo anno soltanto** (quello di uscita), positivo o negativo. Se non ci sono figli quell'anno, resta un dato aziendale generico. Testato con casi realistici (valore superiore/inferiore alla stima, nessun figlio nell'anno).

## 11. Cespiti — Gestione e Report (sezione unificata, due viste)

"Cespiti" è un'unica voce di menu con due pulsanti interni: **Gestione** (elenco, modifica, elimina, genera quote) e **Report** (riepiloghi, piano futuro).

**Gestione**: i cespiti sono raggruppati per **categoria**, ognuna con una fascia colorata (colore diverso a rotazione) che mostra valore storico complessivo, quota di ammortamento dell'anno corrente, fondo ammortamento accumulato. Sotto ogni fascia, i cespiti di quella categoria in ordine alfabetico, consultabili (click per espandere → piano ammortamento), modificabili (categoria/imputazione/coefficiente/data/fornitore, con conferma prima di salvare), ed eliminabili (pulsante 🗑️, con conferma — cancella a cascata anche le quote collegate). Le imputazioni "non imputabile in allevamento" (Nessuno/Cavalli/Pollame/Orto) sono evidenziate in rosso con etichetta, sia in vista compatta sia espansa.

**Report**: riepilogo generale, scomposizione per Categoria e per Imputazione (con evidenziazione rossa per le non-allevamento), e **piano di ammortamento atteso per i prossimi 5 anni**.

**Problema reale trovato da Filippo (duplicati)**: dopo il fix v33 (creazione automatica del Cespite da riga Ammortamenti), risalvare in Carica Fatture una riga già salvata PRIMA di quel fix poteva creare un secondo Cespite duplicato per lo stesso bene. Query diagnostica fornita (`diagnosi_duplicati_cespiti.sql`, cerca cespiti con stessa descrizione+data+costo, e cespiti multipli collegati alla stessa fattura). **Da rilanciare periodicamente se si sospettano nuovi duplicati.**

## 12. Report Costi — struttura a più livelli (sezione unificata, 7 viste)

"Report Costi" è un'unica voce di menu con sfondi colorati diversi per livello:
1. **Aggregato (aziendale)** — un tasso unico per tutta l'azienda, allocazione per specie
2. **Per Area** — una riga per Area, con Imponibile complessivo, €/UBA-gg aziendale, e scomposizione Bovini/Suini/Ovini (costo allocato + incidenza specifica)
3. **Per Area e Centro di Costo** — stessa struttura, con drill-down per Centro di Costo (Categoria Ammortamento per gli Ammortamenti)
4. **Storico — Generale/Bovini/Suini/Ovini** (4 viste): confronto tra l'anno scelto e i 3 precedenti + media dei 4, stessa struttura a due parti (Area sopra, Centro di Costo sotto) per ciascuna

**Motore condiviso**: `calcoloReportCosti.js` estrae la logica comune (`calcolaDatiPerArea`, `calcolaDatiPerAreaCentro`), riusata sia dai report a un anno sia da quelli storici — nessuna duplicazione tra i due.

L'anno si sceglie una volta sola in alto (condiviso tra Aggregato/Per Area/Per Area e Centro); le viste Storiche gestiscono i propri 4 anni internamente.

## 13. Articoli & Prezzi

Allineato alla struttura reale di Prima App (verificata nel codice sorgente, sezione 19): raggruppa per **prodotto normalizzato** (non fornitore+prodotto — così lo stesso mangime da fornitori diversi si confronta in un'unica riga), fornitore/cliente come filtro applicabile, copre sia acquisti sia vendite. Colonne: prezzo minimo/medio/massimo/più recente, **scostamento % dalla media** (rosso se sopra, verde se sotto — cliccabile per aprire un grafico lineare SVG dell'andamento nel tempo con la media tratteggiata), evidenziazione rossa quando il prezzo recente eguaglia/supera il massimo di tutti gli acquisti precedenti.

## 14. Ricerca

Ricerca testuale trasversale su numero fattura, fornitore/cliente, descrizione articoli, note — filtri combinabili per Tipo (acquisto/vendita), Area, Specie/Destinazione, Anno, periodo date, range importo. Click su un risultato apre la stessa ricomposizione fattura usata in Fatture Passive/Attive.

## 15. Esportazione Excel (tutte le pagine) — con formattazione (v63)

`esportaExcel.js` ora usa `xlsx-js-style` (non più `xlsx` semplice, sostituito ovunque incluso l'import fatture — evita di portarsi dietro due librerie quasi identiche) — stessa libreria già usata con successo in podereverdeapp.it, stesse tecniche (verificate lì prima di riusarle): intestazione con sfondo colorato (verde, la palette di questa app — non il marrone di podereverdeapp.it) e testo bianco in grassetto, bordi sottili su ogni cella, zebratura leggera, formato numerico automatico sui valori numerici, filtro automatico e riga di intestazione bloccata scorrendo, font Century Gothic.

**Righe rosse**: nuovo parametro opzionale `coloriRiga: (riga) => boolean` per ogni foglio — se restituisce true, quella riga esce rossa anche in Excel (sfondo rosso chiaro, testo rosso in grassetto), stessa logica già usata a schermo. **Applicato finora** a Report Cespiti → foglio "Per Imputazione" (Nessuno/Cavalli/Pollame/Orto). Da estendere agli altri report con rosso a schermo (Report Costi zona rossa, Gestione Cespiti) quando si affina report per report — deciso con Filippo di partire da una base solida uguale ovunque, poi migliorare singolarmente.

## 16. Formattazione numeri (tutta l'app)

Formato italiano ovunque: punto per le migliaia, virgola per i decimali (`formattaNumero`/`formattaEuro` in `parsingUtils.js`, usa `toLocaleString("it-IT", {useGrouping:true})` — **attenzione**: senza `useGrouping:true` esplicito, i numeri a 4 cifre non venivano raggruppati correttamente, bug trovato in fase di test).

## 17. Layout app — menu a cartelle (v72, struttura finale dopo correzione)

Struttura finale (Filippo ha corretto un posizionamento sbagliato — Ricerca/Controllo Anomalie/Da Armonizzare erano finite in "Studi" insieme ad Articoli & Prezzi, ma andavano invece dentro "Fatture"):

- **Dashboard** (voce singola)
- **Fatture** (cartella, 7 pagine): Carica Fatture, Fatture Passive, Fatture Attive, Costi Diretti, **Ricerca, Controllo Anomalie, Da Armonizzare**
- **Anagrafiche** (cartella): Fornitori, Clienti
- **Animali** (cartella): Report Acquisto Animali, Report UBA, Scheda Animale, Report Riproduttori
- **Costi** (cartella): Report Costi, Cespiti
- **Studi** (cartella, solo analisi che non toccano le singole fatture): Articoli & Prezzi, Report Quantità Mangimi
- **Parametri** (voce singola)

Ogni cartella ha una voce "📖 Istruzioni" in cima (componente `PaginaIstruzioni.jsx` + un file di contenuto per cartella). **Struttura piatta ovunque** (nessuna sottocartella, dopo aver provato e poi tolto Gestione/Analisi dentro Fatture in una sessione precedente). `MENU` in App.jsx, `cartellaDiPagina()` cerca la cartella giusta per aprirla automaticamente, `vaiA()` sostituisce ogni `setTab()` diretto.

Menu laterale verticale a sinistra (non più orizzontale in alto) — più comodo con 14 voci. Sezioni con più viste interne (Report Costi, Cespiti) usano pulsanti di navigazione secondaria con sfondi colorati distinti per orientarsi.

## 18. Collegamento con podereverdeapp.it (in corso, sessione condivisa)

### 18.0 Quadro completo dei flussi dati (e perché vanno in quella direzione)

**Perché podereverdeapp.it è la fonte di verità sui dati grezzi**: è lì che gli operatori dentro l'allevamento registrano quello che succede realmente — nascite, ingressi, uscite, vaccinazioni, nati morti, ecc. La Contabilità Industriale (gestita dai contabili) non ha nessun altro modo di sapere cosa succede in azienda se non attraverso quello che gli operatori hanno già registrato lì. Da qui discendono tutti i flussi seguenti:

1. **podereverdeapp.it → Contabilità Industriale** (lettura): dati grezzi per il calcolo UBA-gg — nascita, data/motivo di uscita, stato, sia per animali individuali sia per lotti/unità di lotto. La Contabilità Industriale calcola da sola, con la stessa formula impostata in podereverdeapp.it (`ExportManager.jsx`) — non esiste una tabella con l'UBA-gg già calcolato da leggere, il risultato è comunque identico perché formula e dati sorgente sono gli stessi (sezione 6.1).
2. **Contabilità Industriale → podereverdeapp.it** (scrittura, senso unico): il costo calcolato (`ci_costo_animale_annuale`) — l'unica tabella che la Contabilità Industriale scrive e podereverdeapp.it legge soltanto (tab "💰 Costi").
3. **Bidirezionale**: il costo di acquisto (`animali.prezzo_acquisto`, o quota pro-capite di `lotti_suini.prezzo_acquisto`) — stesso campo condiviso, scrivibile da entrambi i programmi (dettagli più sotto in questa sezione).
4. **podereverdeapp.it → Contabilità Industriale** (eccezione consapevole): il traghettamento costi lotto→BDN, costruito dentro `FormAssegnaBDN` — sposta righe di costo già calcolate dalla Contabilità Industriale, non ne calcola di nuove (sezione 8).

**Costo di acquisto — campo condiviso, scrivibile da entrambi i programmi (decisione presa)**: a differenza di `ci_costo_animale_annuale` (a senso unico), il costo di acquisto (`animali.prezzo_acquisto`, con estremi fattura) resta **un solo campo condiviso** sulla stessa riga della stessa tabella — puoi inserirlo sia da podereverdeapp.it sia dalla Contabilità Industriale, non sono due dati da sincronizzare. **Fatto**: alert rosso "⚠️ Manca costo acquisto" quando `provenienza==="Acquistato"` e `prezzo_acquisto` mancante — badge nella card lista animali, banner prominente nella scheda dettaglio (podereverdeapp.it v96), e riquadro con l'elenco completo in Report Acquisto Animali (Contabilità Industriale). **Da fare**: la finestra di inserimento diretto del costo da Report Acquisto Animali (Filippo l'ha esplicitamente rimandata a un secondo momento, "che poi struttureremo").

**Flusso deciso**: Contabilità Industriale calcola e scrive `ci_costo_animale_annuale`; podereverdeapp.it legge soltanto, mai scrive.

**Fatto (podereverdeapp.it v94)**: nuova tab "💰 Costi" nella scheda completa di ogni animale (accanto a Info/Genealogia/Eventi, in `allevamento_app.jsx`, componente `Anagrafica`) — mostra lo storico anno per anno (UBA-giorni, categoria, mantenimento, nascita ereditata, scaricato sui figli, totale) + il totale cumulato, letti in sola lettura da `ci_costo_animale_annuale` filtrando per `animale_id`. Verificato nel codice che "Costo netto residuo" esisteva PRIMA solo nell'export Excel (`ExportManager.jsx`/`UBAReport.jsx`), nessuna vista a schermo — ora c'è.

**Da fare**: la stessa vista per i **componenti di lotto** (suinetti senza BDN individuale, riferiti a `lotto_id`+`unita_nr` invece che `animale_id`) — oggi la tab Costi funziona solo per animali con BDN individuale.

**Nota tecnica importante sull'ambiente di lavoro**: il codice sorgente di podereverdeapp.it (cartella `allevamento`) è stato analizzato a fondo in sessioni precedenti di questa stessa conversazione — i file erano già disponibili nell'ambiente sandbox senza bisogno di ricaricamento, fino a quando l'ambiente non si è resettato (evento imprevisto, non collegato a nulla fatto dall'utente). **Se l'ambiente risulta vuoto in una nuova sessione**: i pacchetti consegnati (`allevamento_v94.tar.gz` più recente) restano scaricabili e vanno richiesti/ricaricati da Filippo se non recuperabili da `/mnt/user-data/outputs/`.

## 19. Analisi del codice sorgente reale di Prima App (riferimento, confronto diretto)

**Confermato**: il sistema AREA/CENTRO DI COSTO/DESTINAZIONE/TIPO DI COSTO con regole FCV/FCF **non esiste nel codice reale di Prima App** — era un progetto di integrazione mai realizzato lì (proposto in un pacchetto di specifica tecnica per Colabucci, mai implementato). Quello costruito qui va oltre Prima App su questo punto.

**Articoli & Prezzi reale**: pagina `src/app/(main)/articoli/page.tsx`, API `GET /api/articoli` + `GET /api/articoli/storico-prezzi`. Raggruppa per `nomeProdottoNorm` (normalizzato e salvato una volta all'inserimento, non ricalcolato). Statistiche: conteggio, prezzo min/max/medio, ultimo prezzo, quantità totale, capi totali, ultima data. Copre sia fatture attive sia passive.

**Cespiti reale**: modello `Cespite` (Prisma) — `descrizione`, `categoria` (stringa libera), `fornitoreId`, `dataAcquisto`, `costoAcquisto`, `anniAmmortamento` (default 5), `specie` (array `SpecieAnimale`: BOVINI/OVINI/SUINI/GALLINE/MATERIALI/GENERALE/CAVALLI). Quote costanti = costoAcquisto/anniAmmortamento, generate fino a esaurimento. Import Excel ammortamenti da foglio "Matrice categoria x specie" — confermato compatibile col nostro Libro Cespiti.

**Motore UBA reale, in podereverdeapp.it `ExportManager.jsx`** (non in Prima App — Prima App usa `ripartizione-uba.ts` con formula SEMPLICE, diversa dalla nostra "aggressiva" per scelta esplicita di Filippo): `UBA_FASCE_EXP`, `periodoNellAnnoExp`, `calcolaUBAMedioExp`, `categoriaContabileExp` — funzioni reali, non ricostruite a memoria.

**Classificazione PRODUTTIVO/IMPRODUTTIVO_USCITO — funzione reale** (`categoriaContabileExp` in ExportManager.jsx):
```js
function categoriaContabileExp(animale) {
  if (animale.stato === "attivo") return animale.riproduttore ? "riproduttore" : "produttivo";
  const motivo = (animale.motivo_uscita||"").toLowerCase();
  const isProduttivo = MOTIVI_PRODUTTIVI_EXP.some(k => motivo.includes(k));
  if (isProduttivo) return animale.riproduttore ? "riproduttore" : "produttivo";
  return "improduttivo_uscito";
}
```
con `MOTIVI_PRODUTTIVI_EXP = ["macellazione","macellato","venduto","riformato","riforma","vendita"]` (sottostringa, non uguaglianza esatta). Qualunque motivo che non contiene una di queste parole (anche "Altro", "Morto", "Predato") è IMPRODUTTIVO_USCITO.

**"Riporto quota UBA"**: se un animale presente nel report UBA dell'anno precedente non compare nel nuovo import, si riporta l'ultima quota nota, a meno che non sia uscito per macellazione/decesso. Meccanismo di Prima App — probabilmente non più necessario dato che ora l'UBA si calcola direttamente dagli animali reali ogni volta, non da un import storico.

## 21. Costi Diretti e Controllo Anomalie (nuove pagine)

**Costi Diretti** (`ci_costi_diretti`, nuova tabella): per costi che non passano da una fattura fornitore — costo del lavoro (buste paga, per dipendente o come totale aggregato — campo `dipendente` facoltativo: valorizzato per il dettaglio, vuoto per un aggregato) e altri costi simili. Stessa classificazione Area/Centro di Costo/Destinazione/Tipo di Costo di `ci_articoli_fattura`, letta dinamicamente da `ci_piano_dei_conti`. **IMPORTANTE — limite noto**: questi costi sono oggi registrati e consultabili nella loro pagina, ma **non sono ancora inclusi nei calcoli di Report Costi** (calcoloReportCosti.js legge solo `ci_articoli_fattura`) — l'integrazione nei report resta da fare come passo successivo.

**Controllo Anomalie** (nuova pagina): trova fatture con totale a zero o senza righe articolo associate (sintomo di un caricamento interrotto — es. il caso reale trovato con Filippo: fattura PROGEO SCA V2-250008516 del 2025-02-18, un "guscio vuoto" che bloccava il ricaricamento tramite il controllo duplicati). Permette di eliminare il guscio vuoto direttamente dall'app (solo se non ha righe articolo — altrimenti richiede controllo manuale, per non perdere dati). **Terzo controllo aggiunto**: fatture con righe salvate ma la cui somma non coincide con l'imponibile dichiarato — il caso più insidioso, perché la fattura ESISTE con dei dati (supera i primi due controlli) ma è rimasta silenziosamente incompleta (una riga MASCHERA mai completata) — Report Costi lavorerebbe solo con la parte salvata, senza saperlo. Testato con un caso mock (somma coincidente → non segnalata; somma discordante → segnalata correttamente).

**Ancora da fare (discusso ma non costruito)**: finestra di dialogo per l'inserimento manuale di una singola fattura (senza passare da import Excel massivo) — utile sia per correggere casi come questo sia per fatture isolate.

## 23. Report Quantità Mangimi (primo report di quantità, Studi)

**Prima sezione**: per fornitore + prodotto + destinazione — costo dell'anno, quantità in tonnellate e kilogrammi (usa le regole di `ci_regole_armonizzazione_unita` per convertire; i prodotti non ancora armonizzati sono esclusi ed elencati a parte).

**Seconda sezione (sotto, stesso foglio)**: per ogni PRODOTTO complessivo (sommato su tutti i fornitori) — €/UBA-giorno e kg/UBA-giorno per Bovini, Suini (**incluse le unità di lotto non individualizzate**) e Ovini. Riusa **identica** `calcolaRigaAggregata` (da `motoreUba.js`, la stessa funzione di Report Costi) — chiamata due volte, una per i costi e una per i kg, dato che è pura aritmetica e funziona per qualunque grandezza. I costi/quantità con destinazione "Generali" si ripartiscono proporzionalmente agli UBA-giorni produttivi di ciascuna specie (stessa regola già stabilita per i costi ordinari) — non restano un blocco unico. Pollame/Cavalli sono esclusi da questa sezione (non pertinenti per bovini/suini/ovini). `caricaDatiGrezziAnno` di `calcoloReportCosti.js` esportata per riuso, invece di ricalcolare l'UBA-giorni da capo.

Testato con un caso con quota Generali da ripartire: nessun euro perso o creato, incidenza per specie calcolata esattamente come atteso.

**Logica estratta in modulo condiviso** `calcoloQuantitaMangimi.js` (`calcolaDatiMangimiAnno(anno)`) — riusata sia dal report ad anno singolo sia dai 3 nuovi Storico.

**Storico Mangimi — Bovini/Suini/Ovini (3 nuove pagine, Studi)**: stesso pattern di `ReportStorico.jsx` (Report Costi) — confronto anno scelto + 3 precedenti + media, ma per prodotto invece che per Area, con 4 colonne per anno (Quantità kg, Costo, €/UBA-gg, kg/UBA-gg) invece di 2. Componente generico `ReportStoricoMangimi.jsx`, parametrico per specie (`specieFiltro`/`titolo`), con funzione di unione `unisciPerProdotto` — prodotti assenti in un anno valgono 0 in quell'anno, senza spostare la media. Testato con un prodotto presente in 3 anni su 4.

**Riga TOTALE su €/UBA-gg e kg/UBA-gg** (richiesta di Filippo, sia nel report ad anno singolo sia nei 3 Storico): somma delle incidenze di tutti i prodotti. Matematicamente corretto sommarle direttamente (non serve ricalcolare da capo): dato che il divisore (UBA-giorni della specie) è identico per ogni prodotto in quell'anno, la somma dei rapporti equivale al rapporto delle somme — verificato numericamente. La riga totale copre solo €/UBA-gg e kg/UBA-gg (non Quantità/Costo, non richiesti).

**Grafici di andamento nei 3 Storico Mangimi**: due grafici SVG in cima a ogni pagina (€/UBA-gg totale e kg/UBA-gg totale, aggregato di tutti i mangimi) — linea di andamento sui 4 anni in ordine cronologico + linea tratteggiata della media. Solo per il TOTALE aggregato, non per singolo prodotto (deciso con Filippo). **Rifinito su richiesta esplicita** ("leggibile ma elegante"): area sfumata verde sotto la curva, font Century Gothic coerente con l'app, etichette valore su ogni punto, etichetta "media" spostata in un angolo fisso in alto a sinistra (non più sulla linea stessa) per evitare sovrapposizioni con le etichette dei punti quando un valore annuale è vicino alla media — verificato visivamente con `cairosvg` in un caso normale e nel caso peggiore (primo punto più alto in assoluto, stessa posizione x dell'etichetta media): nessuna sovrapposizione in nessuno dei due casi.

**Idea discussa e non ancora costruita — costo mangime cumulato per capo, per classe d'età**: moltiplicando il coefficiente UBA di una classe d'età (es. 0,40 per un vitello <7 mesi) per il tasso €/UBA-gg (o kg/UBA-gg) dell'anno, si ottiene il costo (o consumo) giornaliero per capo di quella classe — spezzando il periodo di vita dell'animale per classe d'età E anno solare (il tasso cambia per anno, il coefficiente cambia per classe). Bozza Excel dimostrativa creata con un caso concreto (vitello nato 01/01/2023, tassi di esempio) — formule verificate. Non ancora integrato nel programma: richiede prima i tassi reali multi-anno (serve completare l'armonizzazione su più anni).

**Bug reale trovato da Filippo — RLS non disattivato**: `ci_regole_armonizzazione_unita` dava errore "new row violates row-level security policy" al primo utilizzo — lo script originale probabilmente non era stato eseguito per intero (o l'`alter table ... disable row level security` non è passato). Fix a parte fornito (`fix_rls_armonizzazione.sql`). **Promemoria per il futuro**: quando si crea una tabella nuova, verificare sempre che RLS sia davvero disattivato provando un inserimento reale, non solo fidandosi di aver scritto la riga nello script.

**Migliorata l'esperienza in "Da Armonizzare"** (richiesta esplicita di Filippo — "datemi la possibilità di controllare le fatture dalla sezione Armonizzare, se no devo cambiare sezione", poi "e se mi dessi anche di aprirle quelle fatture"): ogni prodotto in attesa ha un link "▼ vedi le fatture" che espande, senza lasciare la pagina, l'elenco delle fatture reali che lo contengono (numero, data, quantità, unità scritta in originale) — e ogni riga ha un pulsante "📄 apri fattura" che mostra la ricomposizione completa della fattura (stesso componente `RicomposizioneFattura` riusato da Ricerca/Fatture Passive/Fatture Attive), inline, senza cambiare pagina.

**Nota di processo (errore reale commesso, da non ripetere)**: quando si genera un file (SQL, Excel, qualunque cosa), va SEMPRE consegnato subito con `present_files` — non basta scriverne il percorso nel testo della risposta, altrimenti Filippo non riceve il link per scaricarlo. Successo con `schema_costi_diretti.sql`: generato ma non consegnato nello stesso turno, notato solo perché Filippo l'ha richiesto esplicitamente.

**Schema**: `ci_regole_armonizzazione_unita` (fornitore_id + descrizione_prodotto esatta → unità confermata + fattore di conversione in kg), stesso spirito delle regole FCV/FCF esistenti — si impara una volta, si applica da sola alle fatture future dello stesso fornitore+prodotto.

**5 centri di costo con quantità tracciate** (costante `CENTRI_CON_QUANTITA`, condivisa tra `CaricaFatture.jsx` e `DaArmonizzare.jsx`): Foraggio, Mangimi, Coltivazione Sementi, Coltivazione Concimi e Fitosanitari, Gasolio e lubrificanti.

**Doppio livello di segnalazione, con testo esplicito per un operatore che non conosce il contesto** (richiesto esplicitamente da Filippo — "considera che posso non caricare io"):
1. **Al momento del caricamento** (`CaricaFatture.jsx`): se la riga è in uno dei 5 centri di costo e non esiste ancora una regola per quel fornitore+prodotto, appare un avviso giallo con istruzioni dirette ("salva comunque la riga, poi vai in *Da Armonizzare*...")
2. **Pagina dedicata "Da Armonizzare"**: elenco permanente di tutte le combinazioni ancora prive di regola, con **suggerimento di similarità testuale** (Jaccard su parole, soglia 0.4) se lo stesso fornitore ha già un prodotto scritto in modo simile — mostrato come proposta da confermare, mai applicato automaticamente. Testato con casi reali (stesso prodotto scritto diverso → punteggio alto; prodotti diversi dello stesso fornitore → punteggio basso, correttamente non suggerito).

**Stesso principio applicato anche a MASCHERA** (classificazione automatica non trovata): il badge ora dice esplicitamente "Nessuna regola automatica trovata... scegli qui sotto..." invece della sola parola "MASCHERA".

**Caso reale scoperto insieme a Filippo**: PROGEO SCA è in **Tons** (non Kilogrammi come inizialmente creduto) — confermato controllando la fattura PDF reale (V2-250008516, Boviformer, 2,75 TN). La stessa fattura ha anche rivelato una discrepanza di data tra il PDF (19/02/2025) e quanto risultava nel database (18/02/2025, un "guscio vuoto" poi individuabile/eliminabile da Controllo Anomalie).

**Ancora da fare**: il report di quantità vero e proprio (che userà queste regole per convertire e sommare le quantità) — questo è stato il lavoro preparatorio, il report in sé non è stato ancora costruito.

Le unità di misura sono oggi testo libero, senza vincoli — stesso prodotto/fornitore può avere unità diverse tra una fattura e l'altra (es. "Kilogrammi" e "Unità" per lo stesso articolo Cooperativa Ceri). Deciso con Filippo di procedere **fornitore per fornitore, prodotto per prodotto** (non una regola generale subito), partendo da Mangimi. Generato un file Excel di revisione (`Revisione_Unita_Mangimi.xlsx`) con evidenziazione dei casi da controllare (unità mancante, unità incoerente sullo stesso prodotto, righe che non sembrano prodotti mangime). Il prompt di lettura PDF fatture (`api/leggi-fattura-pdf.js`) oggi accetta solo 8 unità fisse (Unità/Tons/Quintali/Kilogrammi/Litri/Balloni/Rotoballe/Rotoli), senza nessuna conversione — da rivedere una volta chiarite le regole di armonizzazione per fornitore.

## 20. Problemi noti / da monitorare

**Limite di 1000 righe Supabase — CORRETTO (bug reale, trovato da Filippo)**: tutte le query dirette a `animali`/`lotti_suini`/`suini_lotto` (Report UBA, Report Costi, tutti i Report Costi per anno, Report Riproduttori, Report Acquisto Animali, Scheda Animale) usavano `select("*")` senza paginazione — Supabase/PostgREST limita di default ogni query a 1000 righe, troncando silenziosamente (nessun errore) i risultati se una tabella supera quella soglia. Sintomo osservato: animali/suinetti mancanti nel Report UBA, specialmente i più recenti (2026). Corretto con una nuova utilità condivisa `fetchAllPages()` in `parsingUtils.js`, che pagina automaticamente finché non esaurisce tutte le righe — applicata a tutte le query dirette su queste 3 tabelle in 6 file. Testato con un caso simulato di 2500 righe (oltre il limite).

**Terminologia Report UBA disallineata da podereverdeapp.it — CORRETTO**: la colonna "Categoria contabile" mostrava le etichette interne (PRODUTTIVO/RIPRODUTTORE/IMPRODUTTIVO_USCITO, inventate per il calcolo costi) invece del vocabolario reale usato in podereverdeapp.it (`stato`: Attivo/Venduto/Macellato/Deceduto/Trasferito per gli animali individuali; Attivo/Macellato/Morto/Venduto/Disperso per le unità di lotto — due vocabolari leggermente diversi, non unificati artificialmente). Corretto: la colonna ora si chiama "Stato" e mostra il valore reale (capitalizzato), con il rosso applicato in base alla classificazione interna (IMPRODUTTIVO_USCITO), e "· Riproduttore" aggiunto come qualificatore quando pertinente. **Nota**: il motore UBA per i lotti (`motoreUba.js`) collassava anche il vero `stato` dell'unità in un generico "uscito", perdendo l'informazione — corretto per preservare il valore reale (macellato/morto/venduto/disperso). La classificazione interna (usata per il calcolo costi) resta invariata, cambia solo cosa si mostra a schermo.

- Pagamento Anthropic Console bloccato per carte europee — lettura PDF fatture mai testata con successo
- Il browser di Filippo a volte traduce automaticamente la pagina, storpiando i nomi delle voci — disattivare la traduzione automatica per il sito
- **Report generali** e completamento **componenti di lotto** in podereverdeapp.it: ancora da fare (vedi sezioni 18 e task aperti)
- Traghettamento costi all'assegnazione BDN (sezione 8): requisito registrato, non ancora implementato
