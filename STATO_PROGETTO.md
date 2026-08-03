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

## 17. Layout app — menu a cartelle (v79, struttura finale)

- **Dashboard** (voce singola)
- **Fatture** (cartella, 8 pagine): Carica Fatture, Fatture Passive, Fatture Attive, Costi Diretti, Ricerca, Controllo Anomalie, Da Armonizzare, **Articoli & Prezzi** (spostata qui da Studi — opera sugli stessi dati fattura degli altri strumenti della cartella, non fa calcoli di ripartizione costi/UBA come invece Report Costi/Cespiti)
- **Anagrafiche** (cartella): Fornitori, Clienti
- **Animali** (cartella): Report Acquisto Animali, Report UBA, Scheda Animale, Report Riproduttori
- **Costi** (cartella): Report Costi, Cespiti
- **Studi** (cartella) → sottocartella **Mangimi**: Report Quantità Mangimi, Storico Bovini/Suini/Ovini
- **Parametri** (voce singola)

Ogni cartella ha una voce "📖 Istruzioni" in cima. Struttura a 3 livelli quando serve (Studi → Mangimi → pagine), piatta altrove.

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

## 24. Performance per fascia d'età — COSTRUITA (Animali)

**Deciso con Filippo**: partire subito con i dati reali già disponibili (pochi, e spesso parziali — solo peso vivo o solo carcassa), invece di aspettare di avere uno storico pesate completo.

**Meccanismo a "step" con regressione, implementato in `calcoloPerformanceEta.js`**: per ogni fascia d'età (stesse fasce di `UBA_FASCE_EXP`), regressione lineare (minimi quadrati, `regressioneLineare()`) sugli animali usciti/pesati proprio in quella fascia. La prima fascia usa come "ancora" il peso di nascita (reale se noto, altrimenti lo standard di specie da `pesi_standard_specie`) — le fasce successive ereditano il peso proiettato di fine della fascia precedente, a cascata. Calcolato **separatamente per peso vivo e peso carcassa** (la carcassa non ha un'ancora di nascita, dato che un "peso carcassa alla nascita" non ha senso). Se una fascia ha meno di 2 animali con quel tipo di peso noto, mostra esplicitamente "Dati insufficienti" invece di inventare un numero.

**Testato con scenario misto realistico**: animali con solo vivo noto, altri con solo carcassa, distribuiti su fasce diverse — verificato che ogni combinazione desse il risultato atteso (incluse le fasce con dati insufficienti, correttamente rilevate).

**Pagina**: "Performance per Fascia d'Età" (Animali) — due tabelle per specie (Vivo/Carcassa), aggiornata automaticamente sui dati reali di `animali` (nessuna selezione anno, usa tutti gli usciti disponibili).

**Bug di dati reale trovato validando con un file vero** (bovini usciti, caricato da Filippo): 8 bovini avevano un "Peso nascita" palesemente sbagliato (275/276/500 kg — un vitello non pesa così tanto alla nascita). **Causa individuata**: tutti e 8 erano `Provenienza="Acquistato"` — quasi certamente il peso all'ingresso/acquisto, finito per errore nel campo peso di nascita (6 avevano anche la nota "Peso vivo stimato da resa media", a conferma). **Corretto**: soglia massima plausibile per specie (`SOGLIA_MASSIMA_PESO_NASCITA`: 80kg bovino, 3kg suino, 8kg ovino) — oltre la soglia, o se mancante, si usa lo standard di specie (`pesi_standard_specie`) invece del valore registrato, per QUALUNQUE animale (acquistato o nato in azienda, stessa regola per tutti — semplificazione scelta da Filippo rispetto alla mia proposta iniziale più complessa di "usa data_ingresso per gli acquistati"). **Validato con i dati reali**: la media del peso di nascita usato è passata da 82,76 kg (sbagliata, inquinata dagli 8 casi anomali) a 47,9 kg (plausibile) dopo la correzione.

**Validato anche il calcolo della fascia Adulto con dati reali** (56 bovini con oltre 730 giorni di vita, 51 con peso noto): nessun bug — "Dati insufficienti" era solo un artefatto del mio esempio di fantasia precedente, non del codice reale. Con i dati veri: IPG adulto 0,048 kg/gg (vivo), 0,028 kg/gg (carcassa) — piccolo ma positivo, biologicamente sensato.

**Peso all'ingresso integrato come punto aggiuntivo nella regressione (Vivo)**: nuovo campo `animali.peso_ingresso` (podereverdeapp.it) — quando un animale ha peso e data di ingresso noti, e questi cadono dentro una fascia d'età, si aggiunge come punto reale (giorni-dalla-nascita, peso) alla regressione di quella fascia, insieme ai punti di uscita — non solo per l'ancora, ma come dato pieno. Solo per il peso vivo (l'ingresso non è mai una misura di carcassa). Testato con un caso mock (nessun animale uscito in una fascia, ma un peso_ingresso presente → regressione comunque calcolabile con l'ancora di nascita).

**Adulto spezzato per anno di vita** (richiesto da Filippo, "mutatis mutandis" per ogni specie): la fascia finale (Adulto, `fino:Infinity`) viene ora espansa in segmenti di 365 giorni ciascuno — `espandiFasceAdulto()` — quanti ne servono per coprire l'animale più vecchio realmente presente nei dati (calcolato ogni volta, non fisso). Testato: con un bovino a 4339 giorni di vita, genera correttamente 10 fasce annuali (1° anno adulto, 2° anno adulto, ecc.), l'ultima chiusa esattamente sul massimo osservato — non lasciata infinita, altrimenti la prossima volta un animale ancora più vecchio non genererebbe una fascia in più da sola.

**Bug reale di instabilità numerica trovato e corretto, testando con i dati veri dei bovini**: con pochi animali per fascia annuale (alcuni anni hanno solo 1-2 capi), la regressione a catena può "esplodere" — nel test reale, il "4° anno adulto" (2 soli animali) proiettava un peso di **-28.720 kg**, un artefatto numerico propagato poi a tutte le fasce successive. **Corretto**: se la proiezione è ≤0 o implica una perdita di peso superiore al 10% rispetto all'ingresso (biologicamente implausibile per un adulto), non si propaga — il peso resta stabile rispetto all'ingresso, la fascia si segnala con `proiezioneInstabile:true` (badge ⚠️ nell'interfaccia), e €/kg e FCR non si calcolano per quella fascia (gate aggiunto anche lì). Verificato di nuovo con i dati reali dopo la correzione: nessun valore innaturale residuo.

**Secondo bug trovato da Filippo controllando il file Excel** (l'occhio clinico ha visto quello che il primo controllo non catturava): il "3° anno adulto" mostrava IPG **1,059 kg/gg — più alto del Vitellone in crescita attiva (0,897)!** Il controllo di stabilità esistente bloccava solo le proiezioni troppo BASSE (crescita negativa), non quelle troppo ALTE. **Corretto**: aggiunto un tetto — nessuna fascia "adulto" può avere un IPG superiore al massimo IPG osservato nelle fasce giovanili (Vitella/Vitellone), tracciato progressivamente (`ipgMassimoGiovanile`) mentre si attraversano le fasce in ordine. Oltre il tetto, stessa gestione delle altre proiezioni instabili (peso tenuto stabile, non propagato). Verificato di nuovo con i dati reali: il 3° anno ora si segnala correttamente come instabile invece di mostrare un IPG implausibile.

### Passo 2 — Curva di Gompertz (metodo B, affianca il metodo a fasce indipendenti)

**Ricerca**: modello Gompertz confermato in letteratura come il più raccomandato per bovini da carne al pascolo/estensivi (Angus Uruguay, Nellore al pascolo Brasile, bufali al pascolo) — scelto su richiesta esplicita di Filippo di privilegiare fonti estensive/semi-brade invece che da allevamento intensivo. **I parametri però si stimano sempre dai dati reali dell'azienda** (adattamento ai minimi quadrati non lineare, `adattaGompertz()`), mai importati dalla letteratura — razze e genetiche diverse renderebbero i parametri esterni fuorvianti.

**Validato rigorosamente prima di adottarlo**:
1. Confermato che l'ottimizzazione converge al vero minimo globale (5 punti di partenza diversi, stesso risultato) — non un artefatto numerico
2. Confrontato contro i 10 animali più vecchi realmente usciti (fino a 11,9 anni): la curva **unica** sottostimava sistematicamente un gruppo di animali pesanti (scarti fino a +328 kg)
3. **Causa trovata**: non è la razza (la maggioranza è "Meticcia" sia tra i pesanti sia tra i leggeri) — è la **differenza tra sesso**: maschi adulti sensibilmente più pesanti delle femmine (media 853 vs 652 kg nei dati reali)

**Corretto — curve separate per sesso + media ponderata per fascia** (soluzione proposta da Filippo): due curve Gompertz indipendenti (M/F) per peso vivo e per carcassa. Per ogni fascia d'età, il peso mostrato è una **media ponderata sulla composizione reale M/F osservata in quella specifica fascia** (non una percentuale fissa uguale ovunque — nella mandria di Filippo i maschi adulti sono pochissimi, la maggior parte viene macellata da giovane, quindi la composizione cambia molto con l'età). Se una fascia non ha animali di un dato dato/sesso, si usa 50/50 come riserva (genera qualche piccolo salto nella transizione dati-reali → nessun-dato, da affinare quando ci saranno più pesate).

**Interfaccia**: sezione "METODO B" nella pagina, affiancata al "METODO A" (fasce indipendenti) per confronto diretto. Per ciascun tipo di peso (Vivo/Carcassa), **tre tabelle in sequenza** (richiesto da Filippo): Ponderata M/F in cima (`TabellaStepCurva`, con %Maschi per trasparenza), poi Solo Maschi e Solo Femmine sotto (`TabellaStepSemplice`, stessa curva letta per fascia ma senza ponderazione) — così si vede sia il dato aggregato sia i due sessi separati che lo compongono.

**Ancora da fare**: estendere Passo 2 a suini/ovini (oggi validato solo su bovini, con dati reali caricati da Filippo); collegare costo/FCR anche al metodo B (oggi calcolati solo nel metodo A); eventualmente esplorare ulteriore stratificazione (razza) se la variabilità residua lo giustificherà.

**Ristrutturato in 3 pagine** (richiesto da Filippo): "Performance per Fascia d'Età" (Metodo A + Metodo B ponderato + spiegazione della metodologia + link alle altre due), "Performance — Solo Maschi", "Performance — Solo Femmine" (curve pure, senza ponderazione). Componenti `TabellaStepCurva`/`TabellaStepSemplice`/`NotaPochiDati` esportati da `PerformanceEta.jsx` e riusati dalle due pagine sesso-specifiche, nessuna duplicazione di codice UI.

**Colonne coefficiente UBA / costo-kg giornaliero per capo** (richiesta di Filippo — "il primo dato è Costo €/UBA-gg e kg/UBA-gg in ragione della fascia d'età"): nel Metodo A, esposte come colonne a sé (Coeff. UBA, €/gg per capo, Kg/gg per capo) — la base visibile da cui si derivano poi €/kg e FCR, prima calcolata solo internamente. Calcolate indipendentemente dall'IPG (bastano fascia+tasso mangime), quindi disponibili anche quando IPG non è ancora affidabile.

**Costo e consumo complessivo per fascia** (richiesto subito dopo): `costoGiornalieroPerCapo × giorni_nella_fascia` e `kgMangimeGiornalieroPerCapo × giorni_nella_fascia` — colonne "Giorni fascia", "Costo fascia (€)", "Consumo fascia (kg)" nel Metodo A. Ogni fascia ora ha sempre `giornoFine` finito (grazie a `espandiFasceAdulto`), quindi i giorni sono sempre calcolabili. Testato con un caso mock.

**Colonne economiche unificate anche nel Metodo B** (richiesto da Filippo: "unire i dati delle prime tabelle con tutti questi ulteriori... per pagina 1, 2 e 3"): logica economica estratta in `calcolaDatiEconomiciFascia()`, condivisa da tutti e 3 i modi di calcolare peso/IPG (fasce indipendenti, curva singola, curva ponderata) — nessuna duplicazione, verificato con test di non-regressione dopo il refactoring. Ora TUTTE le tabelle (Metodo A, Ponderata, Solo Maschi, Solo Femmine) mostrano lo stesso set completo di colonne: Peso ingr/usc, IPG, Coeff. UBA, €/gg e kg/gg per capo, Giorni fascia, Costo e Consumo fascia, €/kg mangime, FCR mangime.

**Colorazione a coppie €/kg** (richiesta esplicita): 3 sfondi colorati distinti per le 3 coppie di colonne accoppiate euro↔kg (€/gg↔kg/gg per capo; Costo↔Consumo fascia; €/kg mangime↔FCR mangime) — tutti i dati "singoli" (peso, IPG, coefficiente, giorni, N. animali, %Maschi) restano su sfondo bianco. Tabelle passate da affiancate a impilate verticalmente (ora troppo larghe, 12-13 colonne) in tutte e 3 le pagine.

### Storico Performance per Fascia d'Età (nuova pagina, Animali)

**Confronto tra anni** (richiesto da Filippo — "vedere se all'aumentare dei capi allevati migliora o peggiora la situazione"): stessa curva di crescita ponderata M/F (costruita su tutti gli animali di sempre — non abbiamo ancora abbastanza dati per farne una per anno), ma **tassi mangime diversi per anno** (anno scelto + 3 precedenti + media, stesso pattern degli altri Storico). Il tasso €/UBA-gg di ogni anno già incorpora gli UBA-giorni REALI di quell'anno (quanti animali c'erano davvero, da `caricaDatiGrezziAnno`) — non serve calcolarlo a parte, per questo il confronto è valido per misurare l'efficienza dell'allevatore nel tempo.

Tabella: righe = fasce d'età, colonne = "Costo per kg incremento peso" e "Kg mangime per kg incremento peso" per ciascuno dei 4 anni + media. **Media**: ignora gli anni senza tasso mangime armonizzato (non li tratta come zero) — testato con un caso mock (3 anni su 4 senza dato → media coincide col solo anno valido).

**Solo Ponderata/Peso Vivo per ora** — non ancora esteso a Solo Maschi/Femmine/Carcassa (da fare se utile).

## 25. Nuova destinazione "Bovini e Ovini" (mista) — per il Foraggio e altri centri di costo

**Problema trovato da Filippo**: il Foraggio non va solo ai bovini, va anche agli ovini (i suini invece non se ne cibano mai). Classificarlo come "Generali" sarebbe sbagliato: quel pool si ripartisce su TUTTE le specie, dando ai suini una quota di un costo che non consumano mai.

**Soluzione — nuova destinazione generale** (non solo per Foraggio, disponibile per qualunque centro di costo): "Bovini e Ovini", aggiunta al dropdown Destinazione (`CaricaFatture.jsx`, `CostiDiretti.jsx`, `Ricerca.jsx`). Si ripartisce **solo** tra bovino e ovino, in proporzione ai loro UBA-giorni — suini **completamente esclusi**, sia dalla riga diretta sia dal denominatore della ripartizione.

**Implementazione**: nuovo campo `bovinoOvino` nell'oggetto `costiDiretti`, gestito in `calcolaRigaAggregata()` (`motoreUba.js`, funzione condivisa — nessuna modifica necessaria nei consumatori a valle come Report Quantità Mangimi o Performance per Fascia d'Età, che leggono semplicemente `perSpecie.bovino/suino/ovino` già corretti). Aggiornati anche: `classificaDestinazione()` in `calcoloReportCosti.js` (usato dalla vista Per Area/Per Centro di Costo), `MAPPA_DESTINAZIONE_SPECIE` in `calcoloQuantitaMangimi.js`, e l'implementazione **indipendente** della vista Aggregato in `ReportCosti.jsx` (che non passa da `calcolaRigaAggregata`, ha la sua propria logica di ripartizione — trovata e corretta separatamente, stesso principio).

Testato con un caso mock (1000€ "Bovini e Ovini", UBA-giorni 5000/3000/2000 per bovino/suino/ovino): suino riceve esattamente 0, bovino+ovino si dividono l'intero importo in proporzione, nessun euro perso o creato.

**Semplificazioni ancora da affinare**: la fascia "Adulto" oggi è trattata come un blocco unico (non ancora spezzata per anno di vita da adulto); le altre 2 metriche economiche (costo per IPG oltre a quello già fatto, FCR già fatto) restano da estendere agli altri centri di costo oltre Mangimi.



### Piano a 5 step concordato per collegare i costi (partendo da Mangimi)

1. **Fatto**: €/kg e FCR mangime per fascia, un anno di riferimento scelto dall'utente — `costoGiornalieroPerCapo = coefficiente_UBA_fascia × tasso_€/UBA-gg_mangime`; `€/kg = costoGiornalieroPerCapo / IPG_fascia`; stessa formula per kg/UBA-gg → FCR. Riusa il tasso mangime totale (somma su tutti i prodotti armonizzati) già validato in Report Quantità Mangimi. Testato numericamente.
2. Da fare: agganciare il vero anno di ciascun segmento (oggi mescola animali usciti in anni diversi con un unico tasso di riferimento)
3. Da fare: estendere da "solo mangime" a tutti i costi (Report Costi, non solo Quantità Mangimi)
4. Da fare: spezzare "Adulto" per anno di vita da adulto
5. Da fare: confronto costo marginale al kg vs prezzo di vendita (`prezzi_riforma`) per il momento ottimale di macellazione/vendita

**Deciso con Filippo**: il report "complessivo" (Step 3, tutti i costi insieme) resta per dopo — si procede per centri di costo separati, uno alla volta, partendo da Mangimi.

**Prima sezione**: per fornitore + prodotto + destinazione — costo dell'anno, quantità in tonnellate e kilogrammi (usa le regole di `ci_regole_armonizzazione_unita` per convertire; i prodotti non ancora armonizzati sono esclusi ed elencati a parte).

**Seconda sezione (sotto, stesso foglio)**: per ogni PRODOTTO complessivo (sommato su tutti i fornitori) — €/UBA-giorno e kg/UBA-giorno per Bovini, Suini (**incluse le unità di lotto non individualizzate**) e Ovini. Riusa **identica** `calcolaRigaAggregata` (da `motoreUba.js`, la stessa funzione di Report Costi) — chiamata due volte, una per i costi e una per i kg, dato che è pura aritmetica e funziona per qualunque grandezza. I costi/quantità con destinazione "Generali" si ripartiscono proporzionalmente agli UBA-giorni produttivi di ciascuna specie (stessa regola già stabilita per i costi ordinari) — non restano un blocco unico. Pollame/Cavalli sono esclusi da questa sezione (non pertinenti per bovini/suini/ovini). `caricaDatiGrezziAnno` di `calcoloReportCosti.js` esportata per riuso, invece di ricalcolare l'UBA-giorni da capo.

Testato con un caso con quota Generali da ripartire: nessun euro perso o creato, incidenza per specie calcolata esattamente come atteso.

**Logica estratta in modulo condiviso** `calcoloQuantitaMangimi.js` (`calcolaDatiMangimiAnno(anno)`) — riusata sia dal report ad anno singolo sia dai 3 nuovi Storico.

**Storico Mangimi — Bovini/Suini/Ovini (3 nuove pagine, Studi)**: stesso pattern di `ReportStorico.jsx` (Report Costi) — confronto anno scelto + 3 precedenti + media, ma per prodotto invece che per Area, con 4 colonne per anno (Quantità kg, Costo, €/UBA-gg, kg/UBA-gg) invece di 2. Componente generico `ReportStoricoMangimi.jsx`, parametrico per specie (`specieFiltro`/`titolo`), con funzione di unione `unisciPerProdotto` — prodotti assenti in un anno valgono 0 in quell'anno, senza spostare la media. Testato con un prodotto presente in 3 anni su 4.

**Riga TOTALE su €/UBA-gg e kg/UBA-gg** (richiesta di Filippo, sia nel report ad anno singolo sia nei 3 Storico): somma delle incidenze di tutti i prodotti. Matematicamente corretto sommarle direttamente (non serve ricalcolare da capo): dato che il divisore (UBA-giorni della specie) è identico per ogni prodotto in quell'anno, la somma dei rapporti equivale al rapporto delle somme — verificato numericamente. La riga totale copre solo €/UBA-gg e kg/UBA-gg (non Quantità/Costo, non richiesti).

**Grafici di andamento nei 3 Storico Mangimi**: due grafici SVG in cima a ogni pagina (€/UBA-gg totale e kg/UBA-gg totale, aggregato di tutti i mangimi) — linea di andamento sui 4 anni in ordine cronologico + linea tratteggiata della media. Solo per il TOTALE aggregato, non per singolo prodotto (deciso con Filippo). **Rifinito su richiesta esplicita** ("leggibile ma elegante"): area sfumata verde sotto la curva, font Century Gothic coerente con l'app, etichette valore su ogni punto, etichetta "media" spostata in un angolo fisso in alto a sinistra (non più sulla linea stessa) per evitare sovrapposizioni con le etichette dei punti quando un valore annuale è vicino alla media — verificato visivamente con `cairosvg` in un caso normale e nel caso peggiore (primo punto più alto in assoluto, stessa posizione x dell'etichetta media): nessuna sovrapposizione in nessuno dei due casi.

**Componente estratto in modulo condiviso** `GraficoAndamento.jsx` (interfaccia generica `punti: [{anno, valore}]` + `decimaliValore`) — riusato identico da Storico Mangimi E dai 4 Storico di Report Costi (Generale/Bovini/Suini/Ovini), nessuna duplicazione.

**Grafici anche negli Storico di Report Costi**: due grafici in cima a ogni pagina — valore assoluto totale (Imponibile o Costo allocato, a seconda della vista) e €/UBA-gg (o tasso) totale — sempre sommando **tutte le Aree** (Zona Rossa esclusa, resta sempre a parte). Stessa proprietà matematica di Mangimi: dato che ogni Area nello stesso anno divide per lo stesso UBA-giorni, sommare i tassi/incidenze delle Aree equivale al tasso aggregato aziendale — verificato con un caso mock (3 Aree, stesso UBA-giorni, somma tasso = tasso su totale).

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

## 26. Foraggio — unità di misura rotoballe/balle/balloni/rotoloni = 340 kg

Il Foraggio si esprime in fattura con termini diversi per la stessa cosa (una balla/rotoballa di fieno): "Rotoballe", "Balle", "Balloni", "Rotoloni". Confermato da Filippo: 1 unità di qualunque di questi termini = 340 kg.

**Aggiunte a `UNITA_OPZIONI`/`FATTORE_KG` in `DaArmonizzare.jsx`**: tutti e 4 i termini ora selezionabili, ciascuno con fattore di conversione fisso 340 kg — si armonizzano come qualunque altro prodotto, per fornitore+descrizione, tramite il meccanismo "Da Armonizzare" già esistente.

**Aggiunti anche a `api/leggi-fattura-pdf.js`** (lista unità riconosciute in lettura PDF): mancavano "Balle" e "Rotoloni" (c'erano già "Balloni" e "Rotoballe", più "Rotoli" che resta distinto) — ora tutti e 4 vengono riconosciuti in automatico invece di tornare null.

## 27. Pulizia dati Foraggio — sessione di correzione con Filippo

Durante il controllo del Foraggio, emerse due anomalie reali nei dati caricati, corrette via SQL (query fornite, eseguite da Filippo su Supabase):

- **Azienda Agricola Mario Mariotti**: unico fornitore Foraggio 2025-2026 — destinazione corretta da "Bovini" a "Bovini e Ovini" (il foraggio serve entrambe le specie, non solo i bovini). Riscontrato che un primo update proposto non era stato eseguito (la verifica successiva mostrava ancora "Bovini") — poi rieseguito su tutti gli anni insieme.
- **Canteri** (fornitore di ferramenta): finito per errore sotto Foraggio — spostato con tutte le sue fatture/righe ad Area Allevamento, Centro di Costo "Ferramenta e materiali di consumo", Tipo di Costo Variabile. Verificato che non fosse un fornitore FCF con una regola fissa sbagliata (era FRO, quindi errore umano puntuale in fase di classificazione, non un problema di sistema che si sarebbe ripetuto da solo).

## 28. Report Quantità Foraggio + Storico (nuove pagine, Studi → sottocartella Foraggio)

**Generalizzato il modulo di calcolo**: `calcoloQuantitaMangimi.js` ora espone `calcolaDatiQuantitaAnno(anno, centroCosto)`, generico per qualunque centro di costo con quantità tracciate — `calcolaDatiMangimiAnno(anno)` e `calcolaDatiForaggioAnno(anno)` sono wrapper sottili sopra la stessa funzione, nessuna duplicazione di logica. Gestisce già correttamente "Bovini e Ovini" (grazie al lavoro fatto per quella destinazione), senza bisogno di modifiche aggiuntive.

**4 nuove pagine** (stessa sottocartella Studi, nuova voce "Foraggio" accanto a "Mangimi"): Report Quantità Foraggio, Storico Foraggio — Bovini/Suini/Ovini — generate dal template Mangimi (stessa UI, stesso pattern), `ReportStoricoForaggio.jsx` riusa lo stesso componente generico parametrico per specie di Mangimi.

Testato con il caso reale (Foraggio Mariotti, 13.526,50€ tutto "Bovini e Ovini"): suino riceve esattamente 0, bovino e ovino si dividono l'intero importo in proporzione ai loro UBA-giorni.

## 29. Bug reale trovato da Filippo — "Da Armonizzare" nascondeva righe che il report segnalava

**Sintomo**: Report Quantità Foraggio segnalava prodotti da armonizzare, ma la pagina "Da Armonizzare" non ne mostrava nessuno.

**Causa trovata**: la chiave usata da `DaArmonizzare.jsx` per decidere "questo fornitore+prodotto ha già una regola" ignorava il **centro di costo** — se lo stesso fornitore+descrizione aveva già una regola confermata per un ALTRO centro di costo (es. Mangimi), la riga Foraggio veniva considerata "già a posto" per errore, anche se non aveva nessuna regola propria. Il report invece controllava correttamente `.eq("centro_costo", centroCosto)`, per questo i due si contraddicevano.

**Corretto**: chiave estesa a `fornitore_id|descrizione|centro_costo` sia per il controllo "ha regola" sia per il suggerimento di similarità (che ora resta anche lui dentro lo stesso centro di costo — un fattore di conversione di Mangimi non ha senso suggerito per Foraggio, sono grandezze diverse).

**Trovato anche un problema di schema correlato**: il vincolo di unicità su `ci_regole_armonizzazione_unita` era `(fornitore_id, descrizione_prodotto)`, senza centro di costo — se davvero fosse servita una regola diversa per lo stesso fornitore+prodotto in due centri di costo diversi, il salvataggio della seconda sarebbe fallito. Migrazione fornita (`fix_vincolo_armonizzazione.sql`) per estendere il vincolo a `(fornitore_id, descrizione_prodotto, centro_costo)`.

Riprodotto lo scenario esatto con un test mock (regola Mangimi esistente, riga Foraggio) — confermato il bug prima della correzione, confermata la correzione dopo.

## 30. Secondo bug reale trovato con la query diagnostica — regola esistente ma con fattore_kg NULL

**Sintomo persistente** (dopo il fix precedente): "Da Armonizzare" mostrava ancora tutto sistemato per Foraggio.

**Causa trovata con la query diagnostica** (Filippo ha lanciato `verifica_foraggio_armonizzazione.sql`): la riga "fieno in **totoballe**" (refuso in fattura per "rotoballe") aveva già una regola salvata, ma con **fattore_kg = null** (qualcuno l'aveva confermata come "Unità" senza fattore) — una regola incompleta/inutilizzabile. Il report la segnala correttamente come "da armonizzare" (controlla `!regola.fattore_kg`, non solo l'esistenza della regola) — ma "Da Armonizzare" considerava "ha già una regola" chiunque avesse UNA riga salvata, fattore valido o no.

**Corretto**: `chiaviConRegola` ora filtra solo le regole con `fattore_kg` valido (`.filter(g => g.fattore_kg)`), coerente col report.

**Correlato**: dato che una regola "rotta" può già esistere per quella combinazione esatta, confermarne una nuova corretta userebbe un `insert` semplice che violerebbe il vincolo di unicità — cambiato in `upsert` con `onConflict: "fornitore_id,descrizione_prodotto,centro_costo"`, così una correzione aggiorna la riga esistente invece di fallire.

## 31. Orzo classificato per errore come Foraggio (invece che Mangime)

Notato da Filippo controllando il risultato della query: una riga di storno con "orzo al naturale" risultava sotto centro_costo Foraggio — ma l'orzo (cereale) è Mangime, non Foraggio (fieno/rotoballe). Query di verifica + update forniti (`verifica_orzo_foraggio.sql`) per trovare e spostare tutte le righe con "orzo" nella descrizione, oggi sotto Foraggio, verso Mangimi.

## 32. Performance per Fascia d'Età — Mangimi + Foraggio uniti nel calcolo economico

**Deciso con Filippo**: ciò che serve alla crescita corporea (e quindi va collegato all'IPG in questo report) è Mangimi + Foraggio insieme — non solo Mangimi come finora. Il Pascolo si affronterà quando si parlerà di Coltivazione. Gli Integratori restano esclusi: servono al benessere dell'animale, non al suo accrescimento.

**Implementato**: `calcolaPerformanceEta` ora chiama sia `calcolaDatiMangimiAnno` sia `calcolaDatiForaggioAnno` (in parallelo) e **somma** le loro incidenze €/UBA-gg e kg/UBA-gg per specie — stessa proprietà matematica di sempre (stesso UBA-giorni come divisore per entrambi i centri di costo, nello stesso anno/specie → sommare le incidenze è legittimo). Testato con un caso mock (0,36 + 0,14 = 0,50 €/UBA-gg).

**Etichette aggiornate** in tutte le pagine (Performance, Solo Maschi, Solo Femmine, Storico): "Kg mangime per kg incremento peso" → "Kg alimenti per kg incremento peso"; "Anno di riferimento per il costo mangime" → "...mangime+foraggio"; testi esplicativi aggiornati per menzionare entrambi i centri di costo.

## 33. Nuova sottocartella "Accrescimento e Costi" (Studi) — 4 pagine, solo Bovini per ora

**Deciso con Filippo** (dopo diverse iterazioni sulla struttura): la vecchia cartella Animali → Performance per Fascia d'Età si è spostata in Studi → **Accrescimento e Costi**, insieme alle sue pagine Solo Maschi/Solo Femmine/Storico (stessi componenti, solo riposizionati nel menu). Aggiunte **4 nuove pagine**, solo per Bovini (Ovini/Suini in seguito), ciascuna che isola un centro di costo diverso nel calcolo economico:

- **Tutti gli Alimenti** — Mangimi + Foraggio insieme (tasso combinato)
- **Mangimi** — solo Mangimi
- **Foraggio** — solo Foraggio
- **Pascolo** — segnaposto vuoto (nessun tasso ancora — arriverà con Coltivazione)

**Implementato**: `calcolaPerformanceEta` ora calcola **tre tassi distinti** (`tassiSoloMangimePerSpecie`, `tassiSoloForaggioPerSpecie`, `tassiCombinatoPerSpecie`) invece di uno solo già sommato — il Metodo A/B esistenti continuano a usare il Combinato (nessuna modifica al comportamento attuale), le 4 nuove pagine usano il tasso specifico che serve. Nuovi campi nel risultato per specie: `stepVivoTuttiAlimenti`, `stepVivoSoloMangimi`, `stepVivoSoloForaggio`, `stepVivoPascolo` (quest'ultimo con tasso `null`, tutte le colonne economiche mostrano "—").

**Componente generico** `AccrescimentoCostiPagina.jsx` (parametrico per `campo`/`titolo`/`descrizione`/`vuota`), riusa `TabellaStepCurva` — nessuna duplicazione di UI tra le 4 pagine.

Testato con un caso mock: combinato = solo Mangimi + solo Foraggio, verificato numericamente.

**Ancora da fare**: estendere le 4 pagine (+ Solo Maschi/Femmine/Storico) a Ovini e Suini.

## 34. Bug di DATI (non di codice) — regola Quintali/100 sbagliata per Orzo Farina di Cooperativa Ceri

**Sintomo**: Filippo ha notato un valore assurdo (177 kg/giorno per capo) nella pagina Accrescimento e Costi.

**Indagine**: partendo dal dato grezzo (quanti kg di Mangime per Bovini nel 2025), è emerso che "-ORZO FARINA..." di Cooperativa Ceri aveva una regola confermata **Quintali/100**, ma le fatture sono realmente espresse in **Kilogrammi** (quantità tipiche 5.000-6.000, del tutto normali per kg, assurde per quintali che sarebbero 500-600 tonnellate a consegna). La regola sbagliata moltiplicava per 100 quantità già in kg.

**Nota di processo**: la prima query diagnostica confondeva `a.unita_misura` (unità grezza di fattura) con `r.unita_confermata` (unità della regola realmente usata nel calcolo) — sembravano dire "Kilogrammi" ma la colonna mostrata era quella sbagliata. Corretto con una seconda query che mostra entrambe fianco a fianco, isolando la vera discrepanza.

**Corretto**: regola aggiornata a Kilogrammi/1 per tutti i prodotti "-ORZO FARINA..." di Cooperativa Ceri (query fornita, eseguita da Filippo). Nessuna modifica al codice necessaria — era un dato sbagliato nel database, non un bug applicativo.

**Promemoria per il futuro**: quando si controllano regole di armonizzazione, controllare sempre `r.unita_confermata`/`r.fattore_kg` (la regola realmente applicata), non `a.unita_misura` (il dato grezzo di fattura, che può essere inconsistente o irrilevante una volta che una regola è confermata).

## 35. Continuazione indagine anomalie unità — OVIFORMER, Canteri, e abbreviazione TN mancante

**OVIFORMER (Progeo)**: regola era Unità/null (fattore nullo, contribuiva zero kg). Confrontando con il prodotto gemello BOVIFORMER (stesso fornitore, stessa famiglia "-FORMER"), e verificando che il prezzo per tonnellata torni coerente (~380€/ton in entrambi i casi), corretto a Tons/1000.

**Causa probabile trovata**: il prompt di lettura PDF fatture riconosceva le abbreviazioni "kg, q.li, lt" ma non menzionava "tn/t" per Tons — probabile motivo per cui l'IA non ha riconosciuto l'unità sulla fattura originale (probabilmente scritta "TN") e ha lasciato null invece di leggerla come Tons. Aggiunta l'abbreviazione mancante al prompt.

**Canteri**: regole residue (VETRO MASC, VITE PERF) spostate da centro_costo Foraggio a "Ferramenta e materiali di consumo", coerenti con dove sono ora le fatture reali.

**Bilancio della sessione di pulizia Mangimi/Foraggio**: nessun bug di codice trovato in questa sessione (tutti i problemi erano regole di armonizzazione con unità/fattore sbagliati, dati non logica applicativa) — tranne la mancanza dell'abbreviazione TN nel prompt PDF, unica correzione di codice.

## 36. Rinomina in blocco dei PDF fattura (Carica Fatture)

**Richiesto da Filippo**: le fatture scaricate da Aruba arrivano con un nome file generico — vuole rinominarle con Fornitore_Data_Numero.pdf, usando gli stessi dati che l'app già estrae leggendole.

**Implementato**: dopo la lettura in blocco di una cartella di PDF (funzione già esistente), un nuovo pulsante "📦 Scarica N PDF rinominati (ZIP)" — genera uno ZIP (libreria `jszip`, aggiunta al progetto) con tutti i PDF letti, ciascuno rinominato `Fornitore_Data_Numero.pdf` (caratteri non ammessi nei nomi file sanificati; se due fatture producessero lo stesso nome, si aggiunge un contatore per non sovrascrivere). Se mancano tutti i dati, resta il nome originale come riserva. L'app non salva mai il PDF stesso da nessuna parte (lo legge solo per estrarne i dati) — questo è un download aggiuntivo, non uno storage persistente.

Testato con casi reali (nomi fornitore lunghi con punteggiatura, numeri fattura con slash come "V2/250008516").

## 37. Nuova metrica "peso vivo (media)" — sostituisce le colonne che esplodevano nelle fasce adulte tarde

**Problema**: "Costo/FCR per kg di CRESCITA" esplode matematicamente quando l'IPG tende a zero (fasce adulte tarde, 7°-10° anno) — non un errore di dati, ma un limite intrinseco di dividere per un numero vicinissimo a zero. Confuso da distinguere da un vero errore (come i due appena corretti).

**Soluzione proposta da Filippo**: sostituire quelle due colonne con costo/consumo per kg di **peso vivo mantenuto** (non di crescita) — non esplode mai, perché il peso di un animale non è mai zero, nemmeno da adulto fermo. Usa il **peso medio** della fascia (ingresso+uscita)/2, scelto perché il peso cambia durante la fascia (specialmente da giovane) — decisione presa insieme dopo discussione sull'alternativa (peso di uscita).

**Implementato**: nuovi campi `costoPerKgPesoVivo`/`kgAlimentiPerKgPesoVivo` in `calcolaDatiEconomiciFascia()` (parametro `pesoMedio` aggiunto, passato da tutti e 3 i generatori di step). Colonne rinominate in tutte le tabelle (Metodo A, Ponderata, Solo M/F): "Costo/kg peso vivo (media)" e "Kg alim./kg peso vivo (media)" — con **tooltip esplicativo** (richiesto da Filippo: "occorre avvisare che è una media") che chiarisce l'uso del peso medio, non un valore esatto.

Testato con un caso mock a IPG quasi-zero: vecchia metrica dava 94,91€/kg (assurdo), nuova dà 0,22€/kg peso vivo (ragionevole e stabile).

## 38. Metrica peso vivo (media) — estesa correttamente anche a Carcassa

**Confermato da Filippo**: la metrica di mantenimento serve sia per peso vivo sia per peso carcassa. Il calcolo era **già corretto** per entrambi (la funzione è generica, usa qualunque peso le viene passato) — mancava solo l'etichetta: le tabelle Carcassa mostravano comunque "peso vivo" nell'intestazione, fuorviante.

**Corretto**: `TabellaStep`/`TabellaStepCurva`/`TabellaStepSemplice` ora accettano un prop `tipoPeso` ("vivo" o "carcassa", default "vivo" per compatibilità), usato nell'intestazione e nel tooltip della colonna. Tutte le chiamate per le tabelle Carcassa (Metodo A, Ponderata, Solo Maschi, Solo Femmine) aggiornate per passare `tipoPeso="carcassa"`.

## 39. Nuova cartella "Razioni" (Passo 1) — Razioni Suini

**Richiesto da Filippo**: cartella a sé stante (stesso livello di Fatture/Animali/Costi/Studi) per gestire le razioni alimentari teoriche distribuite per specie/categoria, da confrontare in futuro con i consumi reali (Passo 3). Iniziato dai Suini.

**Schema DB** (`schema_razioni.sql`): `ci_razioni_categorie` (specie, categoria, tipo_animale, fascia età in giorni, flag `richiede_riproduttore`/`richiede_sesso`/`richiede_gravidanza_allattamento`, periodo_note) + `ci_razioni_prodotti` (categoria_id, prodotto, kg_giorno) — **normalizzato apposta** (una riga per prodotto, non colonne fisse) perché Filippo ha richiesto esplicitamente che le razioni siano modificabili sia in quantità sia aggiungendo nuovi tipi di mangime a una categoria, senza dover alterare lo schema.

**Seed iniziale**: le 8 categorie suine da `TABELLA_RAZIONI_SUINI.xlsx` (Riproduttore, Riproduttrice, Riproduttrice gravidanza/allattamento, Magroncello ×3 fasi, Magrone, Da Ingrasso), con i relativi prodotti/kg-giorno.

**Pagina** `RazioniSuini.jsx`: una card per categoria, tabella prodotti con modifica inline (kg/giorno), eliminazione riga, e aggiunta nuovo prodotto — tutto CRUD diretto su Supabase, nessuna logica di calcolo ancora.

**Logica di assegnazione confermata con Filippo per il Passo 2** (non ancora costruita): per ogni suino/lotto realmente presente durante l'anno, la razione si assegna giorno per giorno in base a fascia d'età + tipo (Riproduttore=maschio riproduttore; Riproduttrice=femmina riproduttore, con **due** razioni diverse a seconda che la data cada o no nella finestra [-7,+45] giorni da un evento "parto" registrato; Magroncello/Magrone solo per età; Da Ingrasso=adulto non riproduttore). **Vale sia per i suini tracciati singolarmente sia per i suinetti nei lotti (`lotti_suini`)** — principio generale ribadito da Filippo: quando si parla di suini, considerare sempre entrambe le fonti insieme.

**Dati disponibili in podereverdeapp.it, verificati nel codice** (`allevamento_app.jsx`/`ExportManager.jsx`): campo booleano `riproduttore` + `sesso` sull'animale per Riproduttore/Riproduttrice; tabella eventi con `tipo_evento="parto"` e `data_evento` per le date dei parti; `lotti_suini.data_parto` per la nascita dei lotti.

**Passo 3 (non ancora costruito)**: confronto consumo teorico (somma razioni × giorni-presenza-anno per tutti i suini/lotti) contro consumo reale (Report Quantità Mangimi, destinazione Suini).

## 40. Bug reale — schermo bianco su Razioni Suini (tipo:"voce" mancante)

**Sintomo**: schermo completamente bianco cliccando "Razioni Suini" (non solo "nessun dato" — un crash vero).

**Causa trovata**: la voce "razioni-suini", dentro `contenuto:` di una cartella di primo livello, mancava di `tipo: "voce"` esplicito. Il rendering del menu laterale controlla `c.tipo === "voce"` per decidere se disegnare un pulsante semplice o una sottocartella (con `c.voci.map(...)`) — senza quel tipo, il codice provava a leggere `.voci` su un oggetto che non ce l'ha, causando un crash React (schermo bianco, nessun error boundary). La stessa funzione `cartellaDiPagina()` (apertura automatica della cartella da shortcut esterni) ha lo stesso controllo stretto.

**Corretto**: aggiunto `tipo: "voce"` esplicito. Verificato che nessun'altra voce nel menu avesse lo stesso problema — le voci senza `tipo:` altrove sono tutte dentro array `voci:` di sottocartelle, un contesto diverso dove l'ambiguità voce/sottocartella non esiste (quell'array contiene sempre e solo voci semplici).

**Nota per il futuro**: ogni nuova voce aggiunta DIRETTAMENTE dentro `contenuto:` di una cartella di primo livello deve avere `tipo: "voce"` esplicito — le voci dentro `voci:` di una sottocartella invece non ne hanno bisogno.

## 41. Razioni ristrutturate: sottocartella Suini con Composizione Razioni (per anno, con blocco) + Consumi

**Ristrutturazione richiesta da Filippo**: le razioni possono cambiare di anno in anno, ma un anno già "dato/fornito" non deve più cambiare — tranne durante il caricamento iniziale dei dati storici, quando serve poterle ancora correggere. Struttura finale:

`Razioni → Suini (sottocartella) → Composizione Razioni + Consumi`

**Composizione Razioni** (`RazioniSuiniComposizione.jsx`, sostituisce il vecchio `RazioniSuini.jsx`): selettore anno, stesso CRUD di prima (modifica/aggiungi/elimina prodotto) ma ora **per anno** (`ci_razioni_categorie.anno`, nuova colonna). **Blocco esplicito** (non automatico per calendario, deciso con Filippo — un pulsante 🔒/🔓 "Blocca/Sblocca anno", tabella `ci_razioni_anni_bloccati` (specie, anno, bloccato)) — quando bloccato, tutti i controlli di modifica spariscono (sola lettura). **Clonazione da anno precedente**: se l'anno scelto non ha ancora razioni ma un anno precedente sì, appare un pulsante per copiarle come punto di partenza (poi modificabili se serve).

**Consumi** (`RazioniSuiniConsumi.jsx`): pagina segnaposto con selettore anno — è il prossimo passo da costruire (assegnazione giorno per giorno + confronto teorico/reale).

**Bug trovato e corretto in questa sessione**: schermo bianco su "Razioni Suini" causato da una voce di menu senza `tipo: "voce"` esplicito, dentro `contenuto:` di una cartella di primo livello — il rendering del menu prova a leggere `.voci` (proprietà delle sottocartelle) su un oggetto che non ce l'ha, causando un crash React senza error boundary. Verificato che nessun'altra voce nel menu avesse lo stesso problema (le voci senza tipo altrove sono tutte dentro array `voci:` di sottocartelle, dove l'ambiguità non esiste).

**Migrazione**: `schema_razioni_anni.sql` (aggiunge `anno` a `ci_razioni_categorie`, crea `ci_razioni_anni_bloccati`, assegna le razioni suine già inserite al 2025).

## 42. Composizione Razioni — form "Nuova Categoria" per operatori senza SQL

**Richiesto da Filippo**: possibilità di inserire razioni per anni passati (o categorie nuove) direttamente dall'interfaccia, per operatori che non caricano dati in modo massivo/via SQL come nella sessione con Filippo.

**Aggiunto**: sezione "+ Nuova categoria" in fondo alla pagina (nascosta quando l'anno è bloccato) — form con nome categoria, tipo animale (nota descrittiva), fascia età (da/a in giorni), periodo/note, e i 3 flag usati dalla logica di assegnazione futura (è riproduttiva, sesso M/F, si applica solo nella finestra gravidanza/allattamento). Dopo la creazione, i prodotti (kg/giorno) si aggiungono dalla card che compare subito sopra, con lo stesso meccanismo già esistente.

**Bug trovato e corretto in questa sessione (correlato)**: RLS (Row Level Security) risultava attivo su tutte e 3 le tabelle Razioni (`rowsecurity: true`), nonostante gli script di schema includessero `disable row level security` — la CAUSA per cui l'app mostrava "Nessuna razione" mentre la query SQL diretta (che bypassa RLS) vedeva correttamente i dati. Verificato e ridisattivato esplicitamente.

**Nota di processo**: durante il caricamento dati, uno script è stato eseguito due volte per errore, duplicando le 8 categorie 2025 — corretto con una query di deduplicazione (usando `row_number()` invece di `min(uuid)`, che non esiste in Postgres per colonne UUID — primo tentativo fallito, corretto al secondo).

## 43. Razioni → Suini → Consumi — confronto teorico/reale costruito

**Costruito il Passo 2/3** (Consumi): confronto tra consumo teorico (dalle razioni × suini/lotti realmente presenti nell'anno) e consumo reale (Report Quantità Mangimi, quota Suini), suddiviso per alimento — kg e valore (€), con scarto.

**Schema DB reale usato** (verificato in `allevamento_app.jsx`, non supposto): `animali` (sesso, riproduttore, nascita, data_uscita, stato), `lotti_suini` (data_parto), `suini_lotto` (unità individuali dentro un lotto, con proprio `stato`/`data_uscita` — **esclude** `stato==="registrato_individuale"` per non contare due volte un suinetto "promosso" a tracciamento individuale), `eventi_riproduttivi` (`tipo_evento="parto"`, `data_evento`, `animale_id`).

**Logica di assegnazione** (`calcoloConsumiRazioniSuini.js`):
- Riusa `periodoNellAnnoExp` (già in `motoreUba.js`) per calcolare la presenza nell'anno — stessa logica di Report UBA, per coerenza
- **Riproduttore (M)**: tutta la presenza → categoria Riproduttore
- **Riproduttrice (F)**: calcolo **analitico** (non giorno-per-giorno) delle finestre [-7,+45] attorno a ciascun parto registrato, unite se si sovrappongono (parti ravvicinati) — il resto dei giorni è Riproduttrice normale
- **Non riproduttori** (Magroncello ×3/Magrone/Da Ingrasso): calcolo **analitico** per fascia d'età (nessun ciclo giorno-per-giorno, solo intersezione di intervalli di date) — testato: la somma dei giorni per tutte le fasce torna esattamente al totale dei giorni di presenza, nessuna sovrapposizione o buco
- Suinetti nei lotti: stessa logica età-based, usando `lotto.data_parto` come nascita

**Match teorico↔reale per prodotto**: parole chiave (non nome esatto) — "Orzo Farina" matcha descrizioni contenenti "orzo" o "grancereale" (richiesto esplicitamente da Filippo, dato che Gruppo Italiano Mangimi chiama lo stesso prodotto "Grancereale"); gli altri 3 prodotti per parola chiave specifica (suistar/sprint/sl 1).

**Valore teorico**: non esiste un listino prezzi teorico separato — usa il prezzo medio reale pagato (costo reale ÷ kg reale) per quell'alimento, moltiplicato per il kg teorico.

**Testato con casi mock** prima di consegnare: fasce d'età (somma esatta a 365 giorni, nessuna sovrapposizione), finestra riproduttrice singola (53 giorni = 7+1+45, esatto) e parti multipli ravvicinati (somma esatta a 365, finestre unite correttamente).

**Pagina** `RazioniSuiniConsumi.jsx`: tabella con Kg teorico/reale/scarto, Valore teorico/reale/scarto per alimento; tooltip sul nome alimento mostra quali descrizioni fattura sono state riconosciute come corrispondenti (trasparenza sul matching).

## 44. Bug reale — "Da Armonizzare" permetteva di confermare senza un fattore valido

**Sintomo**: alcune fatture, dopo aver premuto "Conferma unità", restavano lì come se non fosse successo nulla.

**Causa**: per "Unità" (e anche "Litri", che ha lo stesso problema — nessun fattore predefinito, serve un numero specifico per prodotto) il pulsante era **sempre cliccabile**, anche senza aver inserito un fattore di conversione — la regola si salvava comunque, ma con `fattore_kg = null`. Il controllo (corretto in precedenza) che considera "risolto" solo chi ha un fattore valido faceva ricomparire quella riga — comportamento corretto per il calcolo, ma confuso da vedere: sembrava che "non registrasse", mentre in realtà registrava un dato incompleto.

**Corretto**: il pulsante "✓ Conferma unità" ora è **disabilitato** (grigio, non cliccabile) quando l'unità scelta è Unità o Litri e non è stato inserito un numero valido — tooltip esplicativo su hover. Impossibile ormai confermare "a vuoto" per queste due unità.

**Query fornita** per trovare le regole già salvate con fattore mancante (da vecchie conferme prima del fix), da sistemare ora che l'interfaccia lo impedisce.

## 45. Nuova pagina "Prompt Estrazione PDF" (Fatture) — prompt copiabili per uso esterno

**Richiesto da Filippo**: una pagina in Fatture che mostri il prompt usato per estrarre dati da PDF, copiabile per darlo a un'IA esterna (fuori dal programma).

**Costruito**: `PromptEstrazionePDF.jsx` — due blocchi con pulsante "📋 Copia prompt" (clipboard):
- **Fatture Passive**: copia ESATTA (non riassunta) del prompt realmente usato in `api/leggi-fattura-pdf.js`
- **Fatture Attive**: nuovo prompt scritto sullo stesso modello (cliente invece di fornitore) — dato che oggi **non esiste** lettura PDF per le attive nel programma (verificato: `CaricaFattureAttive.jsx` legge solo Excel), confermato con Filippo di NON costruire quella funzionalità per ora, solo documentare il prompt per uso manuale esterno

**Nota inclusa nella pagina stessa**: se il prompt reale nel codice cambia, questa pagina non si aggiorna da sola — va tenuta allineata a mano.

**Ancora aperto**: Filippo aveva anche chiesto la rinomina file (fornitore/cliente+data+numero) "anche per i clienti" — non costruita in questa sessione, dato che le fatture attive non hanno un flusso di caricamento PDF a cui agganciarla (si carica solo da Excel). Da chiarire se serve un percorso diverso (es. un tool di sola rinomina, senza caricamento in contabilità) quando si ripresenta l'argomento.

## 46. Casse Previdenziali/professionali — rilevate nel riepilogo fattura, mai perse

**Problema reale trovato da Filippo con due fatture vere** (Ing. Stefano Tiberi, Stefano Cortesi): molti liberi professionisti aggiungono un addebito di Cassa previdenziale (INARCASSA, ENPAIA, ecc.) — di solito il 4% dell'imponibile — che compare **solo nel riepilogo finale** della fattura ("Calcolo Fattura"), MAI come riga separata in "PRODOTTI E SERVIZI". Il prompt di lettura PDF, leggendo solo la tabella prodotti, perdeva completamente questo importo.

**Corretto in due punti**:
1. **Prompt** (`api/leggi-fattura-pdf.js`, e allineata la copia in `PromptEstrazionePDF.jsx`): istruzione esplicita di cercare SEMPRE la Cassa nel riepilogo, anche se non è un articolo esplicito, e aggiungerla come riga IN PIÙ con descrizione che inizia con `"[CASSA PROFESSIONALE] "` + nome cassa se indicato.
2. **Motore di classificazione** (`motoreClassificazione.js`): nuovo controllo **universale, indipendente dal fornitore** (prima ancora della ricerca fornitore) — qualunque riga con descrizione che inizia con quel tag va sempre in area Consulenze, centro di costo "Casse Professionisti" (nuovo, aggiunto al piano dei conti), restando MASCHERA per assegnare destinazione/tipo di costo a mano (richiesto da Filippo: "bisogna stare attenti anche agli altri" — non solo ai due fornitori visti, qualunque consulente la usi viene riconosciuto allo stesso modo).

**Testato** con un caso mock replicando i due fornitori reali (INARCASSA/ENPAIA) — entrambi riconosciuti correttamente, una riga normale di consulenza non scatta il controllo.

**Migrazione**: `aggiungi_casse_professionisti.sql` (nuovo centro di costo nel piano dei conti, sicura da rilanciare).

## 47. Prompt Estrazione PDF — riscritti sulla struttura proposta da Filippo (2 tabelle Excel, non JSON)

**Filippo ha proposto un prompt alternativo**, strutturalmente migliore per l'uso esterno (output diretto in 2 tabelle Excel — "Fatture" e "Verifica Fatture" — invece di JSON, regole numerate esplicite, gestione delle Note di Credito che il prompt precedente non aveva). Adottato come base per entrambi i prompt (Passive/Attive), aggiungendo:
- La rilevazione Cassa Previdenziale (stessa logica già nel prompt interno dell'app)
- L'istruzione di rinominare ogni PDF elaborato (Fornitore/Cliente_Data_Numero.pdf) al termine
- Correzione: la lista U.M. nella proposta di Filippo aveva 8 unità, mancavano "Balle" e "Rotoloni" (ora 10, coerenti con `api/leggi-fattura-pdf.js`)
- Aggiunta la regola simmetrica per le Attive (segnalare a parte se un PDF è chiaramente un acquisto, non una vendita)

**Chiarito nelle note della pagina**: questo prompt (2 tabelle Excel) è ORA DIVERSO dal prompt interno del programma (`api/leggi-fattura-pdf.js`, formato JSON per l'elaborazione automatica in Carica Fatture) — stessa logica di fondo (Cassa, unità di misura, note di credito), ma output pensato per uso manuale/esterno. Se uno dei due cambia in futuro, l'altro va aggiornato a mano per restare coerente.

## 48. Nuova pagina "Consultazione Animali per Anno" (Animali)

**Richiesto da Filippo**: oltre alla ricerca puntuale (Scheda Animale), una vista che mostri TUTTI gli animali presenti nell'azienda durante un anno scelto, raggruppati per specie con una demarcazione colorata, evidenziando se sono usciti durante l'anno o ancora presenti a fine anno.

**Costruita** `ConsultazioneAnimali.jsx`: selettore anno, poi 3 blocchi (Bovini/Suini/Ovini) — ciascuno con una barra colorata laterale e intestazione tabella nel colore della specie (riusa `C.bovini`/`C.suini`/`C.ovini`, già esistenti nella palette). Per ogni capo: identificativo, nome, sesso, nascita, badge "Presente a fine anno" (verde) o "Uscito nell'anno" (giallo) con data/motivo.

**Logica presenza nell'anno**: un animale entra in lista se nato/costituito prima della fine dell'anno E (mai uscito, oppure uscito dopo l'inizio dell'anno) — chi era già uscito PRIMA dell'inizio dell'anno scelto viene correttamente escluso. Testato con 4 casi (mai uscito, uscito dentro l'anno, uscito prima dell'anno [escluso], uscito dopo l'anno [incluso senza segnalazione]) — tutti corretti.

**Suini**: include sia gli animali tracciati singolarmente sia i suinetti nei lotti (`suini_lotto`, escludendo `stato==="registrato_individuale"` per non contare due volte chi è stato promosso a tracciamento individuale) — stesso principio generale già seguito per Razioni/Consumi.

**Nota sul bug "Scheda Animale non si compila"**: indagine in corso, non ancora risolta — confermato che NON è RLS (verificate le policy, `animali`/`lotti_suini`/`suini_lotto` hanno già una policy anon aperta "per Contabilita Industriale"). Cliccando su un risultato di ricerca, la scheda resta vuota senza errore visibile — controllato il codice (rendering, guardie null) senza trovare un crash evidente finora. Da riprendere.

## 49. Controllo anti-duplicati per Cespiti/Ammortamenti (Carica Fatture)

**Richiesto da Filippo**: caricando acquisti di anni precedenti per gli ammortamenti, non vuole creare cespiti duplicati. I dati storici già importati **non hanno numero fattura**, quindi il confronto per numero non è possibile — serve un controllo per descrizione simile e/o importo simile, separatamente o congiuntamente.

**Implementato**: prima di creare qualunque riga (fattura/articolo/dettaglio ammortamento) per una riga classificata "Ammortamenti", si cercano cespiti esistenti dello STESSO fornitore con descrizione uguale/simile (contenimento reciproco normalizzato, non solo match esatto) **oppure** stesso importo (tolleranza 1 centesimo). Se trovato, un avviso mostra il/i possibile/i duplicato/i con data e importo, e chiede: OK = registra comunque come nuovo cespite separato; Annulla = non salvare nulla.

**Punto di attenzione risolto durante la costruzione**: il controllo doveva stare PRIMA di `trovaOCreaFattura` e di qualunque insert — il primo tentativo lo aveva messo dopo la creazione di fattura/articolo/dettaglio ammortamento, il che avrebbe lasciato dati orfani se l'utente avesse annullato. Spostato all'inizio del ramo di salvataggio.

**Non ancora costruito**: la vera funzione "sostituisci" (aggiorna il cespite esistente invece di crearne uno nuovo) — per ora l'utente può solo scegliere "registra comunque" o "annulla e decidi tu"; se serve un vero replace, va costruito come passo successivo (richiede un'interfaccia più ricca del semplice confirm() del browser).

Testato con 4 casi mock (descrizione esatta, descrizione simile per sottostringa, stesso importo con descrizione diversa, nessun match) — tutti corretti.

## 50. Indagine bug "salvataggio Acquisto Animali non risponde"

Controllato `validaRiga()`: nessuna validazione specifica blocca l'area "ACQUISTO ANIMALI" (solo Trasporto Animali e Ammortamenti hanno controlli dedicati) — quindi il pulsante dovrebbe essere sempre cliccabile per questa area. Sospetto principale, dato il pattern ripetuto in questa sessione: RLS su `ci_report_acquisto_animali` — query di verifica fornita, ancora da controllare con Filippo. Non ancora risolto.

## 51. Corretti due bug reali trovati da Filippo con l'uso reale

**Bug 1 — colonna mancante**: "Errore nel salvataggio della riga... Could not find the 'prezzo_unitario' column of 'ci_report_acquisto_animali' in the schema cache" — il codice salva questa colonna da tempo, ma non è mai stata creata nel database. Migrazione fornita (`aggiungi_prezzo_unitario_acquisto_animali.sql`). Questo bug spiega retroattivamente anche l'indagine precedente su "il salvataggio Acquisto Animali non risponde" — il salvataggio falliva silenziosamente prima che l'alert diventasse visibile a Filippo nella sua interazione.

**Bug 2 — controllo anti-duplicati troppo ristretto**: il controllo (sezione 49) verificava i duplicati **solo tra cespiti dello stesso fornitore** (`eq("fornitore_id", fornitoreId)`) — se i dati storici hanno il fornitore collegato in modo diverso (o assente), il controllo non li trovava. **Corretto**: ora confronta con TUTTI i cespiti esistenti, indipendentemente dal fornitore — la nota nell'avviso lo segnala esplicitamente ("anche di un fornitore diverso").

## 52. Schema ci_report_acquisto_animali — mancavano PIÙ colonne, non solo prezzo_unitario

Dopo aver corretto "prezzo_unitario", è emerso un secondo errore identico per "quantita" — segno che la tabella ha probabilmente diverse colonne mancanti rispetto a quello che il codice si aspetta di scrivere, non solo una. Fornita migrazione completa (`fix_completo_schema_acquisto_animali.sql`) con TUTTE le colonne usate nei due punti del codice che scrivono su questa tabella (fonte, fornitore_id, data_fattura, numero_fattura, importo, quantita, unita_misura, prezzo_unitario, specie, razza, destinazione_acquisto, bdn, nr_lotto, articolo_fattura_id) — include una query di verifica finale per controllare l'elenco completo delle colonne prima di considerare il problema chiuso.

## 53. Bug reale — "già caricata" non riconosceva mai Acquisto Animali

**Causa trovata**: il controllo "questa fattura è già stata caricata" verifica solo `ci_fatture` — ma "ACQUISTO ANIMALI" salva DIRETTAMENTE in `ci_report_acquisto_animali`, senza mai passare da `ci_fatture`/`ci_articoli_fattura`. Risultato: ricaricando lo stesso PDF di acquisto animali, non veniva MAI riconosciuto come già presente, comparendo sempre come nuovo (rischio di duplicati se salvato due volte).

**Corretto**: il controllo ora interroga ANCHE `ci_report_acquisto_animali` (fornitore+numero+data), unendo le chiavi trovate a quelle di `ci_fatture`.

**Sospetto aperto sul "non appaiono nel report"**: la query di `ReportAcquistoAnimali.jsx` (`select("*, ci_fornitori(nome)")`, nessun filtro) sembra strutturalmente corretta — probabile che il vero problema fosse semplicemente che il salvataggio falliva ancora silenziosamente per colonne mancanti (sezione 52) prima che Filippo eseguisse la migrazione completa. Da confermare dopo che avrà eseguito `fix_completo_schema_acquisto_animali.sql` e riprovato.

## 54. Report Acquisto Animali — modifica ed eliminazione righe

**Richiesto da Filippo**: oltre a consultare (già esisteva), poter modificare i dati di una riga e poter eliminare i duplicati direttamente dal programma.

**Aggiunto** a `ReportAcquistoAnimali.jsx`:
- **✏️ Modifica**: trasforma la riga in un piccolo form inline (numero/data fattura, specie, razza, destinazione, BDN, lotto, quantità, U.M., prezzo unitario, importo — il fornitore non è modificabile da qui) con "✓ Salva modifiche"/Annulla. Il fornitore resta fisso (cambiarlo richiederebbe altre implicazioni, non richiesto ora).
- **🗑️ Elimina**: rimuove la riga dopo conferma esplicita (mostra fornitore/fattura/importo nel messaggio di conferma) — pensato apposta per i duplicati che possono comparire ricaricando le fatture prima del fix del controllo "già caricata" (sezione 53).

Entrambe le azioni operano direttamente su `ci_report_acquisto_animali`, la stessa tabella che la pagina già legge — nessuna nuova tabella o schema necessario.

## 55. Due miglioramenti richiesti da Filippo: default unità intelligente + regola universale Gasolio

**"Da Armonizzare" partiva sempre da Kilogrammi**: anche quando la fattura diceva già chiaramente "Tons" (o altra unità riconosciuta), il menu a tendina ripartiva sempre da Kilogrammi, costringendo a cambiarla manualmente ogni volta. **Corretto**: ora il menu parte già sull'unità grezza estratta dalla fattura, se è una delle 10 riconosciute — confronto reso insensibile a maiuscolo/minuscolo (trovato e corretto durante il test: "TONS"/"tons" non avrebbero altrimenti fatto match con "Tons").

**Nuova regola universale Gasolio**: come per le Casse Professionali, un controllo indipendente dal fornitore in `motoreClassificazione.js` — qualunque riga con "gasolio" nella descrizione va sempre in Area Coltivazione, Centro di Costo "Gasolio e lubrificanti", Destinazione Generali, Tipo di Costo Variabile (stato "FCV", completamente auto-classificata, non richiede più scelta manuale). Non ancora impostato un fattore di conversione fisso Litri→kg per il gasolio (Filippo ha chiesto solo che l'unità sia sempre Litri, non un fattore specifico — da chiarire se serve, dato che densità del gasolio può variare leggermente).

Testato entrambi con casi mock prima di consegnare.

## 56. Ricerca — modifica classificazione riga direttamente dal risultato

**Richiesto da Filippo**: trovata un'anomalia (centro di costo "Pallet" 2025), chiedeva come richiamare, trovare e correggere. Controllato: Ricerca era di **sola consultazione**, nessuna modifica possibile su una riga già salvata da nessuna parte nell'app.

**Costruito**: aprendo il dettaglio di una fattura in Ricerca, ogni riga ha ora un'icona ✏️ — attiva un form inline (Area/Centro di Costo/Destinazione/Tipo di Costo, con Centro di Costo filtrato in base all'Area scelta) e un pulsante "✓ Salva". Sostituita la vecchia vista di sola lettura (`RicomposizioneFattura`, condivisa con Fatture Passive — non toccata, per non rischiare di romperla lì) con una vista propria di Ricerca che include l'editabilità.

Questo risolve anche in generale il caso "Finiss Bovini" e qualunque altra riga classificata male in passato — ora correggibile direttamente, senza bisogno di query SQL per correzioni singole.

## 57. Ricerca — filtri Centro di Costo e Tipo di Costo, totale specifico per il centro filtrato

**Richiesto da Filippo**: trovare l'anomalia "Pallet 2025 oltre 6.000€" era difficile senza poter filtrare direttamente per centro di costo (solo Area e Destinazione erano filtrabili prima).

**Aggiunto**: due nuovi filtri — **Centro di Costo** (elenco dinamico, costruito dai valori realmente presenti nei dati, non una lista fissa) e **Tipo di Costo** (Fisso/Variabile/Ammortizzabile). Aggiunto anche `centro_costo` e `tipo_costo` alla query leggera degli articoli (prima non caricati, servivano solo per il filtro).

**Totale specifico**: quando un Centro di Costo è selezionato, appare accanto al totale generale un **totale solo per quel centro di costo** (somma delle righe corrispondenti nelle fatture filtrate, non il totale_lordo dell'intera fattura) — così si vede subito la cifra esatta (es. "Pallet: 6.234,00€") senza dover sommare a mano fattura per fattura.

## 58. Intestazioni di tabella fisse (sticky) — richiesto da Filippo per facilità di lettura

**Richiesto**: le righe di intestazione delle tabelle restino visibili mentre si scorre sotto, per non perdere il riferimento alle colonne su tabelle lunghe.

**Applicato** (`position: "sticky", top: 0, zIndex: 1` sul `<thead>`) a tutte le tabelle con intestazione a sfondo colorato esplicito: ArticoliPrezzi, RazioniSuiniConsumi, ReportCespiti (2 tabelle), ReportPerArea, ReportPerAreaCentro, ReportQuantitaForaggio (2), ReportQuantitaMangimi (2), ReportRiproduttori, ReportStoricoForaggio, ReportStoricoMangimi, SchedaAnimale, StoricoPerformanceEta, ConsultazioneAnimali (colore dinamico per specie). **ReportUba.jsx** era già sticky da prima (nessun intervento necessario).

**Non ancora applicato**: le tabelle con `<thead>` senza stile esplicito (Cespiti, Clienti, DaArmonizzare, FatturePassive, Fornitori, PerformanceEta, RazioniSuiniComposizione, ReportCosti — queste usano stili per-cella `th` invece di uno stile sul thead stesso) — da fare come passo successivo se serve, richiede un approccio leggermente diverso (aggiungere sticky al `th` invece che al `thead`, o introdurre uno stile thead dove non c'è).

## 59. Storico Report Costi (Generale/Bovini/Suini/Ovini) — unificato in tabella a fisarmonica

**Richiesto da Filippo**: le pagine Storico (dentro Report Costi → SezioneReportCosti.jsx, che usa `ReportStorico.jsx` con 4 `specieFiltro` diversi) mostravano "Per Area" e "Disaggregato per Centro di Costo" come **due tabelle separate** — bisognava scorrere e cercare a mano quale centro di costo apparteneva a quale area. Voleva lo stesso schema a fisarmonica già usato in "Per Area e Centro di Costo" (`ReportPerAreaCentro.jsx`): area riepilogata, clic sulla freccetta per aprire i centri di costo di quell'area.

**Ricostruito**: nuovo componente `TabellaConfrontoAccordion` in `ReportStorico.jsx` — sostituisce le due tabelle "PER AREA" e "DISAGGREGATO PER CENTRO DI COSTO" con un'unica tabella, dove ogni riga Area (`righeArea`) trova le sue righe Centro di Costo corrispondenti (`righeCentro`, filtrate per `.area === areaRow.chiave`) e le mostra come sotto-righe espandibili — stesso pattern ▶/▼ di `ReportPerAreaCentro.jsx`. La riga "Orto/Non Allevamento/Ammortamenti senza imputazione" resta separata (è un avviso a parte, non naviga per area).

**Si applica automaticamente a tutte e 4 le viste** (Generale/Bovini/Suini/Ovini) dato che condividono lo stesso componente — nessuna modifica separata necessaria per ciascuna. L'esportazione Excel resta con i fogli separati (Per Area / Per Centro di Costo) — Excel non ha comunque un concetto di "espandi/comprimi", quindi non serve cambiarla lì.

## 60. Grafico a barre per Area negli Storici, con riga tratteggiata della media

**Richiesto da Filippo**: usare lo spazio liberato dalla fisarmonica (sezione 59) per un grafico a barre per Area — €/UBA-gg dell'anno di consultazione affiancato alle barre dei 3 anni precedenti, con una riga tratteggiata "valore medio".

**Costruito** `GraficoBarre.jsx` — nuovo componente SVG puro, stesso stile/font/colori di `GraficoAndamento.jsx` già esistente (riusato come riferimento), ma a colonne invece che a linea. Gestisce anche valori negativi (aste sotto lo zero) senza crash. L'ultima barra (anno di consultazione) è evidenziata in un colore più scuro (`C.primary`) rispetto alle precedenti (`C.primaryLight`), per distinguerla a colpo d'occhio.

**Integrato** in `ReportStorico.jsx`: quando un'Area viene espansa nella tabella a fisarmonica, appare il grafico (per €/UBA-gg di quell'Area) PRIMA delle righe Centro di Costo — dando prima un colpo d'occhio visivo dell'andamento, poi il dettaglio numerico sotto.

Testato con caso normale (4 anni, valori positivi) e caso con un valore negativo — entrambi corretti.

## 61. Colori per anno nella tabella Storico — scuro per valore assoluto, chiaro per €/UBA-gg

**Richiesto da Filippo**: migliorare la leggibilità della tabella a fisarmonica assegnando un colore a ciascun anno (e alla media), con tonalità scura per i valori assoluti e chiara per €/UBA-gg.

**Implementato**: 5 coppie di colori (scuro/chiaro) — 4 per gli anni (dal più vecchio al più recente: blu, rosa, verde oliva, verde primary — quest'ultimo per l'anno di consultazione, il più in evidenza) + una per la Media (accent/dorato, stessa tonalità già usata per la riga tratteggiata nei grafici, per coerenza visiva). Applicati sia ai valori nelle celle sia a un bordo colorato sotto l'intestazione di ciascun blocco anno.

**Attenzione all'indicizzazione**: l'array `anni` è ordinato dal più recente al più vecchio (`[annoBase, annoBase-1, annoBase-2, annoBase-3]`), mentre la palette è ordinata dal più vecchio al più recente — l'accesso corretto è `COLORI_ANNO[anni.length - 1 - i]`. Verificato con test: anno di consultazione → verde primary, anno più vecchio → blu.

Applicato alla tabella principale (`TabellaConfrontoAccordion`); la tabella "Orto/Non Allevamento" (`TabellaConfronto`, usa un colore rosso fisso per l'intera riga) non è stata toccata, dato che è già un avviso a parte con la sua logica colore.

## 62. Colori Storico corretti per leggibilità reale (calcolo contrasto WCAG)

**Filippo ha giustamente segnalato**: le tonalità "chiare" scelte inizialmente rischiavano di essere poco leggibili contro lo sfondo bianco. Invece di aggiustare a occhio, ho calcolato il **contrasto WCAG** (luminanza relativa) di ogni colore contro bianco — la rosa iniziale risultava la più debole (contrasto 3.09-4.11, sotto la soglia raccomandata 4.5 per testo normale). Sostituita con un bordeaux più scuro (contrasto 7.43/5.36). Le altre tonalità "chiare" restano nella fascia 3.5-4 (accettabile per testo in grassetto secondo WCAG, non ideale per testo normale piccolo) — per questo aggiunto anche `fontWeight: 600` alle celle €/UBA-gg (tonalità chiara), a compensare ulteriormente.

Palette finale: blu (contrasto 5.51/3.90), bordeaux (7.43/5.36), verde oliva (4.90/3.49), verde primary (9.79/5.98), media/accent (5.95/4.01).

## 63. Articoli & Prezzi — modifica classificazione, applicata a passato e futuro

**Richiesto da Filippo**: correggere errori di classificazione (es. "Finiss.Bovini" attribuito a Suini invece di Bovini) direttamente da Articoli & Prezzi, e che la correzione valga anche per le fatture future dello stesso prodotto.

**Punto tecnico chiarito e confermato con Filippo prima di costruire**: questa pagina raggruppa i prodotti per nome attraverso TUTTI i fornitori insieme (normalizzazione descrizione), mentre le regole di classificazione sono per singolo fornitore — quindi la correzione doveva propagarsi a tutti i fornitori coinvolti, non a uno solo.

**Costruito**: espandendo un prodotto, mostra la classificazione attuale (Area/Centro di Costo/Destinazione/Tipo di Costo — solo per le righe di acquisto/PASSIVA, le vendite non hanno questo concetto) — se le fatture già caricate hanno classificazioni diverse tra loro, mostra "MISTA" invece di un valore sbagliato. Pulsante "✏️ Modifica classificazione" apre un form; salvando:
1. Aggiorna TUTTE le righe fattura già caricate con questa descrizione (corregge il passato)
2. Per OGNI fornitore distinto che vende questo prodotto, crea o aggiorna una regola in `ci_regole_fornitore_variabile` (parola_chiave = descrizione esatta del prodotto) — così le prossime fatture di qualunque di questi fornitori si classificano da sole allo stesso modo, non serve ripetere la correzione fornitore per fornitore

Testato il rilevamento coerente/misto/assente con 3 casi mock prima di consegnare.

## 64. Bug reale trovato — le regole specifiche (Articoli & Prezzi) venivano sempre ignorate dai controlli universali

**Causa**: i controlli universali (Cassa Professionale, Gasolio) in `classificaRiga` erano i PRIMI ad essere valutati, prima ancora di controllare se esisteva una regola specifica fornitore+prodotto creata da Filippo (es. da Articoli & Prezzi). Risultato: modificare la classificazione di una Cassa specifica (Tiberi, Cortesi, o qualunque altra come ENPAV) creava correttamente la regola nel database, ma quella regola **non veniva mai applicata** alle fatture future — il controllo universale vinceva sempre comunque.

**Corretto**: `classificaRiga` ora cerca PRIMA una regola specifica (fornitore + descrizione esatta) — se la trova, la usa e si ferma lì (con precedenza assoluta). Solo se NON esiste una regola specifica, cade sui controlli universali (Cassa/Gasolio) come comportamento di default. Così qualunque correzione fatta da Articoli & Prezzi ora funziona davvero per le fatture future, per qualunque fornitore/tipo di cassa (non solo Tiberi/Cortesi/INARCASSA/ENPAIA — anche ENPAV o altre).

**Ripulito nel passaggio**: rimossa una doppia chiamata a `trovaFornitore()` e una doppia dichiarazione di `descrizioneNorm` (bug di sintassi introdotto durante la modifica, corretto prima del deploy) — ora calcolati una sola volta in cima alla funzione e riusati.

Testato con caso mock: Tiberi con una regola specifica sulla propria Cassa → la regola specifica vince; Cortesi senza ancora una regola specifica sulla propria Cassa → cade correttamente sul controllo universale.

## 65. Nuova pagina "Inserimento Manuale Fattura" (Fatture)

**Richiesto da Filippo**: poter creare una fattura passiva scrivendo i dati a mano, senza dover caricare un PDF — stessa struttura di Carica Fatture (fornitore, numero, data, più righe con descrizione/quantità/prezzo/classificazione).

**Costruita** `InserimentoManualeFattura.jsx`: ricerca/creazione fornitore (autocomplete sui fornitori esistenti, crea nuovo se non trovato), numero e data fattura, righe multiple (+ Aggiungi riga) con Descrizione/Quantità/U.M./Prezzo Unitario/Imponibile (calcolato automaticamente da quantità×prezzo, sovrascrivibile a mano) e Aliquota IVA. Per ogni riga, **suggerimento automatico di classificazione** (Area/Centro di Costo/Destinazione/Tipo di Costo) non appena descrizione e fornitore sono noti — riusa lo stesso `classificaRiga()` di Carica Fatture, quindi beneficia automaticamente di tutte le regole già esistenti (fisse, variabili, e i controlli universali Cassa/Gasolio).

**Salvataggio**: stessa logica di `trovaOCreaFattura` di Carica Fatture (trova la fattura se esiste già per fornitore+numero+data, altrimenti la crea), poi crea ogni riga in `ci_articoli_fattura`, poi ricalcola i totali della fattura.

**Limite dichiarato nella pagina stessa**: per ora pensata per fatture ordinarie — non gestisce le aree speciali (Ammortamenti/Acquisto Animali/Trasporto Animali), che nel Carica Fatture hanno un flusso di salvataggio diverso (tabelle diverse, campi aggiuntivi) — da estendere se serve, come passo successivo.

**Bug RLS corretto in parallelo**: `ci_costi_diretti` aveva RLS attivo senza policy — disattivato (`fix_rls_costi_diretti.sql`).

## 66. Nuova pagina "Verifica Fatture Mancanti" (Fatture)

**Richiesto da Filippo**: paura che alcune fatture non siano state rilevate/caricate — serve un confronto tra un Excel esterno (es. dal portale Fatture e Corrispettivi, dal commercialista) e quello che risulta nel database, per un anno scelto.

**Costruita** `VerificaFattureMancanti.jsx`: carica un file Excel (qualunque struttura — legge le intestazioni e propone da solo quali colonne usare per Fornitore/Numero/Data, indovinando dal nome colonna, ma sempre modificabile a mano). Confronta con `ci_fatture` (tipo PASSIVA) per l'anno scelto, normalizzando numero fattura (rimuove zeri iniziali, spazi, trattini, maiuscole/minuscole) e mostra le fatture del file che NON risultano nel database.

**Nota onestà nella pagina**: senza la colonna Fornitore mappata, il confronto è solo per numero — meno preciso, rischia falsi positivi se fornitori diversi riusano lo stesso numero.

Testato le funzioni di normalizzazione (zeri iniziali, separatori, formato data) con casi mock prima di consegnare.

## 67. Nuova pagina "Verifica Righe Mancanti" (Fatture)

**Richiesto da Filippo**: un controllo più fine di "Verifica Fatture Mancanti" — non solo "manca l'intera fattura", ma "questa singola voce/riga manca", includendo quelle finite su Ammortamenti (Cespiti) o Acquisto Animali (tabelle diverse da quella normale). File Excel di riferimento: una riga per voce/articolo (stesso formato prodotto dal prompt di estrazione PDF).

**Costruita** `VerificaRigheMancanti.jsx`: per ogni fornitore distinto nel file, carica TUTTI i costi registrati per lui nell'anno da **tre fonti insieme** — `ci_articoli_fattura` (fatture normali), `ci_cespiti` (Ammortamenti), `ci_report_acquisto_animali` (Acquisto Animali) — poi confronta ogni riga del file per **importo** (il confronto principale, con tolleranza combinata: assoluta fino a 0,05€ per gli arrotondamenti, percentuale 2% oltre) contro questo insieme combinato.

**Scelta di design**: il match è basato sull'importo, non sulla descrizione — la descrizione può cambiare tra estrazione PDF e classificazione finale, mentre l'importo resta stabile. La descrizione viene comunque mostrata nel risultato, a titolo informativo.

**Bug trovato e corretto durante il test**: la tolleranza percentuale da sola falliva per importi vicini allo zero (una differenza minima diventa enorme in percentuale) — aggiunta una soglia assoluta minima (0,05€) che viene controllata per prima.

Testato con 5 casi (importi uguali, vicini, lontani, vicini allo zero, non numerici) — tutti corretti dopo la correzione.

## 68. Verifica Righe Mancanti — registrazione diretta delle righe trovate mancanti

**Richiesto da Filippo**: dato che il controllo (sezione 67) trova righe mancanti, serve poterle registrare direttamente da lì, sia come riga fattura normale sia come Cespite (Ammortamento).

**Aggiunto**: per ogni riga mancante (con fornitore riconosciuto), pulsante "➕ Registra" apre un form inline — sceglie "Riga fattura normale" o "Cespite (Ammortamento)":
- **Riga fattura normale**: Numero/Data fattura (trova o crea la fattura sottostante) + Area/Centro di Costo/Destinazione/Tipo di Costo
- **Cespite**: Numero/Data fattura (idem) + Categoria Ammortamento (stessa lista di 10 categorie di Carica Fatture) + Anni Ammortamento + Imputazione (mappata a `specie` come in Carica Fatture: Bovini/Suini/Ovini/Generali/Nessuno/Cavalli/Pollame/Orto)

Fornitore, descrizione e importo sono già noti dalla riga Excel — non richiede di reinserirli. Dopo la registrazione, la riga sparisce dall'elenco "mancanti" mostrato (senza dover rifare tutto il confronto da capo).

**Bug corretto durante la costruzione**: avevo scritto `useState` invece di `useEffect` per il caricamento del piano dei conti al mount — corretto prima del deploy (avrebbe causato un caricamento ripetuto ad ogni render invece che una volta sola).

## 69. Bug corretto — "quantita" mancante nell'inserimento riga fattura (Verifica Righe Mancanti + Inserimento Manuale)

**Causa**: la colonna `quantita` di `ci_articoli_fattura` ha un vincolo NOT NULL — la registrazione da Verifica Righe Mancanti non la passava affatto (errore bloccante), e Inserimento Manuale Fattura la salvava `null` se il campo veniva svuotato dall'utente.

**Corretto**: entrambe ora salvano sempre un valore di default (1) quando non specificato, mai null.

**SESSIONE DEPLOY (risolta)**: dopo il push di v136, il sito continuava a mostrare v135 nonostante `git status` risultasse pulito e i file locali corretti — il push GitHub era andato a buon fine (verificato con `git log`), ma Vercel non generava un nuovo deployment automatico. Risolto con un commit vuoto (`git commit --allow-empty` + push) che ha sbloccato il collegamento automatico GitHub→Vercel.

## 70. Bug corretto — altri due campi obbligatori mancanti (prezzo_unitario, stato_classificazione)

Stesso tipo di problema della sezione 69, trovato subito dopo dal test reale di Filippo: anche `prezzo_unitario` (NOT NULL) mancava nell'inserimento da Verifica Righe Mancanti, e poteva mancare (diventando null) in Inserimento Manuale Fattura se il campo veniva svuotato. Corretto in entrambi i file — default all'imponibile/importo quando non specificato. Aggiunto anche `stato_classificazione: "MANUALE"` in entrambi, per coerenza con come Carica Fatture classifica le righe inserite a mano (visto in uno dei due percorsi di CaricaFatture.jsx ma non nell'altro — aggiunto difensivamente ovunque per evitare un terzo giro dello stesso tipo di errore).

## 71. Verifica Righe Mancanti — esportazione diretta verso Carica Fatture

**Richiesto da Filippo**: invece di registrare una riga alla volta a mano, poter trovare le righe mancanti nel file Excel e ricaricarle direttamente su Carica Fatture (che gestisce già tutto il flusso completo, incluse le aree speciali Ammortamenti/Acquisto Animali/Trasporto Animali).

**Scoperta chiave**: la modalità "File Excel" di Carica Fatture si aspetta ESATTAMENTE lo stesso formato di colonne del file che Filippo usa per Verifica Righe Mancanti (Fornitore, P.IVA, Numero, Data, Descrizione, Quantità, U.M., Prezzo unitario, Imponibile, Aliquota IVA) — sono compatibili.

**Costruito**: pulsante "📥 Scarica Excel per Carica Fatture" accanto all'avviso delle righe mancanti — esporta solo quelle righe (non l'intera fattura, per non ricaricare righe già corrette), in un nuovo file Excel con esattamente le colonne attese da Carica Fatture. Aggiunte 6 mappature colonna opzionali aggiuntive (P.IVA/Numero/Quantità/U.M./Prezzo unitario/Aliquota IVA), rilevate automaticamente dal nome colonna come le altre, usate solo per popolare questo export (non influenzano il confronto).

**Flusso finale per Filippo**: Verifica Righe Mancanti trova le righe → scarica l'Excel generato → lo carica in Carica Fatture (modalità File Excel) → passa per il flusso di classificazione normale, incluse le aree speciali.

Testato con caso mock: la mappatura produce esattamente le colonne e i tipi di dato attesi.

## 72. Verifica Righe Mancanti — esclusione fatture dalle verifiche future

**Richiesto da Filippo**: poter escludere una fattura intera dalla segnalazione "mancante" (es. per casi che sa già di non voler caricare).

**Nuova tabella**: `ci_fatture_escluse_verifica` (fornitore_id, numero, data, motivo, creato_il) — `crea_tabella_fatture_escluse.sql`.

**Costruito**: pulsante "🚫 Escludi fattura" su ogni riga mancante (visibile solo se la colonna Numero è mappata, dato che serve per identificare la fattura) — salva l'esclusione e rimuove SUBITO dall'elenco corrente tutte le righe con lo stesso fornitore+numero (non solo quella cliccata). Nei confronti futuri, le righe di fatture escluse vengono saltate silenziosamente, prima ancora di essere valutate come mancanti.

**Bug in corso di investigazione (non risolto)**: Filippo segnala che righe esportate verso Carica Fatture vengono registrate con Imponibile a zero — controllato `calcolaImponibile`/`numeroRobusto` in parsingUtils.js, la logica sembra corretta in teoria (legge "Imponibile" come chiave esatta, gestisce sia numeri che stringhe con virgola). In attesa di conferma da Filippo se il valore è già a zero nel file scaricato o solo dopo il caricamento in Carica Fatture, per isolare dove nasce il problema.

## 73. Verifica Righe Mancanti — consultazione e rimozione delle fatture escluse

**Richiesto da Filippo**: poter vedere quali fatture ha escluso e toglierle dall'esclusione se serve, non solo aggiungerle.

**Aggiunto**: pulsante "▼ Fatture escluse (N)" in alto — apre un pannello con l'elenco (fornitore, numero, data) e un "✕ Rimuovi esclusione" per ciascuna.

**Correzione migrazione SQL**: `ci_fornitori.id` in questo database è `bigint`, non `uuid` come inizialmente assunto — corretto `crea_tabella_fatture_escluse.sql` (fornitore_id ora bigint).

## 74. Ridisegnata la marcatura fatture — resta visibile invece di sparire

**Correzione di Filippo**: "escludere" era un termine improprio — non voleva che le righe sparissero dall'elenco, ma che restassero visibili con un'etichetta "Non da registrare", così da poterle rivedere quando vuole.

**Ridisegnato**: il pulsante ora si chiama "🏷️ Non da registrare" (non più "🚫 Escludi fattura") — la riga resta nell'elenco, ma con etichetta al posto del motivo, opacità ridotta, e un pulsante "↩ Riconsidera" al posto di Registra/Non da registrare (toglie la marcatura, la riga torna normale). Il riepilogo in cima ora distingue "N righe NON risultano registrate" da "altre M marcate come non da registrare". L'esportazione verso Carica Fatture (sezione 71) ora esclude automaticamente le righe marcate, dato che Filippo ha già deciso di non caricarle.

La tabella `ci_fatture_escluse_verifica` e il pannello di consultazione/rimozione (sezioni 72-73) restano invariati — cambia solo il comportamento nella lista principale.

## 75. Ricerca — modifica estesa di riga (Descrizione/Quantità/Prezzo/Importo) e Data fattura

**Richiesto da Filippo**: poter modificare una fattura già registrata — non solo la classificazione (che già c'era), ma anche Descrizione/Importo/Quantità di una riga, e la Data della fattura.

**Estesa la modifica riga** (già esistente in Ricerca): aggiunti campi Descrizione/Quantità/Prezzo unitario/Importo prima dei campi di classificazione — al salvataggio, ricalcola anche i totali della fattura (dato che l'importo di una riga può cambiare).

**Aggiunta modifica Data fattura**: icona ✏️ accanto alla data nell'intestazione di ogni fattura (nella vista non espansa) — click apre un campo data inline con ✓/✕ per confermare o annullare, senza dover aprire il dettaglio della fattura.

Numero fattura e Fornitore non sono ancora modificabili da qui (Filippo ha specificato Data, oltre a quanto già discusso su Descrizione/Importo/Quantità) — da estendere se serve anche quello.

## 76. Ricerca — modifica completa: Fornitore/Numero fattura + Aliquota IVA riga

**Richiesto da Filippo**: "vorrei avere la possibilità di modificare tutto".

**Sostituita** la modifica-solo-data (sezione 75) con un form combinato: Fornitore (select da anagrafica), Numero, Data — tutti e tre modificabili insieme dall'icona ✏️ nell'intestazione della fattura.

**Aggiunta Aliquota IVA** alla modifica riga (accanto a Descrizione/Quantità/Prezzo/Importo già fatti in sezione 75) — al salvataggio ricalcola anche `totale_iva` della riga, oltre ai totali della fattura.

Campi ancora non modificabili da qui: Tipo (ATTIVA/PASSIVA) e Note della fattura — non richiesti esplicitamente, da aggiungere se servono.

## 77. Articoli & Prezzi — grafico prezzo medio annuale con variazione %

**Richiesto da Filippo**: oltre allo storico esistente, un grafico con il prezzo medio per anno (un punto per anno) e, sulla linea che unisce due anni consecutivi, la variazione % — blu se il prezzo è diminuito, rosso se è aumentato.

**Costruito** `GraficoPrezzoAnnuale` — mostrato subito sotto il grafico esistente (per singolo acquisto) quando si apre il grafico di un prodotto in Articoli & Prezzi. Raggruppa lo storico per anno (media dei prezzi unitari di quell'anno), traccia una linea che unisce i punti, ed etichetta ogni segmento con la variazione % rispetto all'anno precedente (colore C.blue se negativa, C.red se positiva, C.muted se zero). Non mostrato se ci sono meno di 2 anni di dati.

Testato con caso mock: media annuale e variazione % calcolate correttamente, colori coerenti con la direzione della variazione.

## 78. Ricerca — aggiunta Unità di Misura alla modifica riga

**Richiesto da Filippo**: modificare anche l'Unità di Misura di una riga (oltre a tutto il resto già fatto in sezioni 75-76).

**Aggiunto**: campo "U.M." (stessa lista di 10 opzioni usata in Inserimento Manuale Fattura — Unità/Tons/Quintali/Kilogrammi/Litri/Balloni/Rotoballe/Rotoli/Balle/Rotoloni) nel form di modifica riga, tra Quantità e Prezzo unitario.

## 79. Articoli & Prezzi — chiarito: le fatture manuali NON mancavano, era il campo di ricerca sbagliato

**Segnalazione di Filippo**: cercando "Unipol Sai" (la polizza inserita a mano) non la trovava in Articoli & Prezzi — sospettava che le fatture inserite manualmente non comparissero.

**Verificato**: nessun filtro nella query esclude le righe inserite a mano — il problema era che la casella di ricerca principale cerca SOLO nella descrizione dell'articolo, non nel nome del fornitore (esisteva già un campo separato "Filtra per fornitore/cliente..." accanto, probabilmente non notato).

**Migliorato comunque**: la casella di ricerca principale ora cerca ANCHE nel nome del fornitore/cliente, oltre alla descrizione — evita questa confusione in futuro. Placeholder aggiornato di conseguenza.

## 80. Articoli & Prezzi — unificati grafici e storico, un solo click sulla riga

**Causa del problema di Filippo**: i grafici (compreso quello nuovo per anno, sezione 77) si attivavano SOLO cliccando sulla piccola cella della percentuale di scostamento (con sottolineatura, poco visibile) — un'interazione diversa da quella che apre lo storico/classificazione (che si apre cliccando sulla riga). Filippo cliccava sulla riga come sempre e non vedeva più comparire i grafici.

**Corretto**: unificato tutto sotto un solo click (sulla riga, `espanso`) — ora cliccando un articolo compaiono insieme, in quest'ordine: grafico per singolo acquisto, grafico prezzo medio annuale, poi lo storico/classificazione come prima. Rimosso lo stato `grafico` separato, ormai inutile. Aggiornato il testo esplicativo in cima alla pagina.

## 81. Ricerca — modifica/inserimento Partita IVA e Codice Fiscale del fornitore

**Richiesto da Filippo**: poter modificare o inserire Partita IVA e Codice Fiscale del fornitore, dal solito punto in Ricerca.

**Nuova colonna**: `ci_fornitori.codice_fiscale` (non esisteva) — `aggiungi_codice_fiscale_fornitori.sql`.

**Esteso** il form combinato Fornitore/Numero/Data (sezione 76) con due campi in più: P.IVA e Cod. Fiscale — si popolano automaticamente con i valori del fornitore selezionato (cambiano se si sceglie un fornitore diverso dal menu), e al salvataggio aggiornano `ci_fornitori` (non `ci_fatture`, dato che P.IVA/CF appartengono all'anagrafica del fornitore, condivisa tra tutte le sue fatture).

Nota: questa modifica NON era collegata all'indagine in corso sul fornitore Unipolsai (ancora in attesa del risultato della query su `ci_fornitori`) — se dal risultato di quella query risultasse che Unipolsai non è mai stato creato in anagrafica, questa nuova funzione permetterebbe comunque di aggiungere P.IVA/CF una volta creato il fornitore corretto.

## 82. Ricerca — aggiunto anche il Nome del fornitore: ora davvero tutto modificabile

**Chiarimento di Filippo**: "se ho detto tutto è tutto" — anche il nome del fornitore, non solo P.IVA/CF.

**Aggiunto**: campo "Nome fornitore" nel form combinato — si popola col nome attuale (o quello del fornitore scelto dal menu), modificabile liberamente, salva su `ci_fornitori.nome` per il fornitore selezionato. Non svuota mai il nome per errore (se lasciato vuoto, il campo non viene inviato all'aggiornamento).

Il form ora copre, in un solo posto: Fornitore (quale, tramite il menu) + suo Nome/P.IVA/Cod.Fiscale, oltre a Numero e Data della fattura — e la modifica riga (sezioni 75-76-78) copre Descrizione/Quantità/U.M./Prezzo/Importo/Aliquota IVA/classificazione. Non ancora modificabili: Tipo (ATTIVA/PASSIVA) e Note della fattura.

## 83. RISOLTO — bug reale trovato: righe con prezzo_unitario nullo sparivano da Articoli & Prezzi

**Indagine "Unipolsai non si trova"**: dopo aver verificato che il fornitore esisteva (3 duplicati "UNIPOL SAI", id 225/226/227 — Filippo ha scelto di tenere il 225) e che le fatture esistevano complete in `ci_fatture` (818/819/821, tutti i campi popolati), il colpevole era la query di caricamento di `ArticoliPrezzi.jsx`: un filtro `.gt("prezzo_unitario", 0)` che esclude silenziosamente qualunque riga con prezzo_unitario nullo o zero — probabile eredità delle fatture inserite manualmente PRIMA delle correzioni v138/v139 (quando quel campo poteva salvarsi nullo).

**Corretto**: rimosso il filtro dalla query. I calcoli statistici (prezzo minimo/massimo/medio/recente) ora usano solo i prezzi validi (>0) tra quelli disponibili nel gruppo, invece di escludere la riga intera dalla vista — così la riga resta visibile (cercabile, modificabile) anche se il suo prezzo va ancora inserito a mano.

**Verifica per le altre 4 fatture di Filippo**: query `verifica_righe_prezzo_mancante.sql` — trova tutte le righe con prezzo_unitario nullo/zero nell'intero database, per sistemarle tutte insieme (non solo Unipolsai).

## 84. Bug reale trovato — Articoli & Prezzi non scaricava tutte le fatture/righe (limite 1000 righe di Supabase)

**Causa**: le query di `ci_fatture` e `ci_articoli_fattura` in `ArticoliPrezzi.jsx` non avevano paginazione — Supabase per default restituisce al massimo 1000 righe per chiamata. Se il totale supera 1000 (molto probabile su più anni di storico), le righe "in fondo" (senza un ORDER BY esplicito, l'ordine non è nemmeno garantito) sparivano silenziosamente, senza errore — esattamente il sintomo di Unipolsai introvabile, dopo aver escluso RLS, filtri di ricerca, e il filtro prezzo_unitario (sezione 83).

**Corretto**: aggiunta `fetchTutto()`, una utility che scarica a blocchi da 1000 finché non arriva una pagina incompleta, con `order("id")` esplicito per una paginazione stabile. Applicata sia a `ci_fatture` che a `ci_articoli_fattura`.

**Nota per il futuro**: questo stesso pattern (query senza `.range()`/paginazione su tabelle che possono crescere oltre 1000 righe) andrebbe verificato anche nelle altre pagine con query simili (Ricerca, ReportStorico, ecc.) se si presentano sintomi analoghi — non ancora fatto sistematicamente in questa sessione.

## 85. Estesa la correzione paginazione a Ricerca, Dashboard, ReportCosti — unificata su fetchAllPages esistente

**Scoperta durante la correzione di ArticoliPrezzi.jsx (sezione 84)**: esisteva già una utility `fetchAllPages` in `parsingUtils.js`, usata correttamente in molte altre pagine (ConsultazioneAnimali, ControlloAnomalie, DaArmonizzare, ReportAcquistoAnimali, ReportRiproduttori, ReportUba, SchedaAnimale) — ma NON nelle query di `ci_fatture`/`ci_articoli_fattura` in Ricerca.jsx, Dashboard.jsx e ReportCosti.jsx, che soffrivano dello stesso bug (limite 1000 righe di Supabase) mai notato prima perché il totale (1452 righe) ha superato la soglia solo di recente.

**Corretto**: rimossa la `fetchTutto` che avevo creato nella sezione 84 (duplicava `fetchAllPages`) — tutte le query ora usano `fetchAllPages((da, a) => query.range(da, a))`, la stessa convenzione già in uso nel resto del codice:
- `Ricerca.jsx`: query fatture, articoli (caricamento iniziale), e articoli (refresh dopo modifica riga)
- `Dashboard.jsx`: query fatture
- `ReportCosti.jsx`: query fatture e articoli per anno (rischio più basso, filtrate per anno, ma corrette per coerenza e sicurezza futura)

**Non ancora verificato/corretto** (rischio più basso, da controllare se emergono sintomi simili): la query per-fornitore in `VerificaRigheMancanti.jsx` (un fornitore + un anno alla volta, difficilmente supera 1000 righe) e altre query non elencate qui.

## 86. Articoli & Prezzi — ordinamento per variazione prezzo (i peggiori aumenti in cima)

**Richiesto da Filippo**: ordinare mettendo per primi gli articoli con il maggior incremento di prezzo recente.

**Aggiunto** select "Più recenti prima / Aumenti di prezzo peggiori prima / Diminuzioni di prezzo migliori prima" — usa lo `scostamentoPct` già calcolato (prezzo più recente vs. media). Il comportamento di default (per data più recente) resta invariato se non si tocca il nuovo controllo.

## 87. Articoli & Prezzi — nuova modalità "Fornitore con aumento peggiore per prodotto"

**Richiesto da Filippo**: isolare l'andamento prezzo di UN fornitore specifico su UN prodotto specifico, non mescolato con altri fornitori che vendono lo stesso prodotto — integrato come opzione nella stessa tendina di ordinamento (non una tendina separata, come inizialmente proposto e poi corretto da Filippo).

**Ristrutturato**: estratta `raggruppaRighe(righeInput, chiaveFn)` come funzione pura riusabile (fuori dal componente) — la stessa logica di calcolo (media/min/max/scostamento) ora si può applicare con chiavi di raggruppamento diverse. Aggiunta `gruppiPerFornitore`, che raggruppa per `fornitore+prodotto` insieme invece che solo prodotto.

**Nuova opzione nella tendina "ordinamento"**: "Fornitore con aumento peggiore per prodotto" — quando selezionata, la tabella usa `gruppiPerFornitore` invece di `gruppi`, quindi ogni riga rappresenta UN fornitore su UN prodotto (non più un prodotto con più fornitori mescolati), ordinata per scostamento % decrescente.

**Rimossa** la vecchia casella di testo "Filtra per fornitore/cliente..." (ridondante e meno precisa della nuova modalità — filtrava DOPO aver già mescolato le statistiche tra fornitori).

Testato con caso mock: due fornitori con lo stesso prodotto a prezzi/andamenti diversi — raggruppando solo per prodotto la variazione risulta una media poco rappresentativa (31,81%); raggruppando per fornitore+prodotto, ciascuno mostra la propria variazione reale (20% e 2,44%).

## 88. Nuova cartella "Alimentaria" — Report "Costi e Quantità"

**Richiesto da Filippo**: nuova cartella "Alimentaria" con un primo report "Costi e Quantità" — tabella con 3 righe (Mangimi/Foraggio/Integratori Alimentari) e 4 coppie di colonne (Totali/Bovini/Suini/Ovini), colori distinti per coppia. Click sulla riga → disaggregazione per prodotto (stessa struttura a colonne), aggregata indipendentemente dal fornitore, con i Mangimi contenenti "ORZO" sempre sommati insieme.

**Prerequisito sistemato**: "Integratori Alimentari" esisteva già come centro di costo nel piano dei conti (confermato da Filippo) ma non era nell'elenco `CENTRI_CON_QUANTITA` (Carica Fatture + Da Armonizzare) — aggiunto, altrimenti le sue righe non avrebbero mai avuto un Kg associato.

**Riuso del motore esistente**: `calcolaDatiQuantitaAnno(anno, centroCosto)` (già generico, usato da Report Quantità Mangimi/Foraggio) fa già tutto il lavoro pesante — aggregazione per prodotto indipendente dal fornitore, e ripartizione dei "Generali"/"Bovini e Ovini" tra le specie tramite `calcolaRigaAggregata` (stesso motore UBA di Report Costi). Nessuna nuova query o calcolo di ripartizione da scrivere da zero.

**Costruito** `ReportCostiQuantitaAlimentare.jsx` (cartella "Alimentaria" → "Costi e Quantità"):
- Tabella principale: 3 righe (i 3 centri), 8 colonne — Totali (Kg/Costo, grezzi, non ripartiti) + Bovini/Suini/Ovini (Kg/Costo, con quota Generali inclusa), colori dedicati già esistenti nello stile condiviso (`C.bovini`, `C.suini`, `C.ovini`)
- Click su una riga → righe di dettaglio per prodotto, sotto, con la stessa struttura a colonne
- `accorpaOrzo()`: per Mangimi, unisce tutti i prodotti con "orzo" nella descrizione (case-insensitive) in un'unica riga sommata, prima di mostrare il dettaglio
- `aggregaCentro()`: somma tutti i prodotti di un centro per ottenere i totali per specie della riga principale (stesso risultato che si avrebbe sommando manualmente le righe di dettaglio)

Testato con caso mock: due prodotti "orzo" con diciture diverse (fornitori diversi) accorpati correttamente in un'unica riga con costo/kg sommati; un terzo prodotto non-orzo resta separato.

**Non ancora fatto**: export Excel di questo report (gli altri report Quantità/Storico ce l'hanno) — da aggiungere se richiesto.

## 89. Bug corretto — dicitura esatta "Integratori alimentari" (minuscolo), verificata da Filippo sul database reale

Avevo scritto "Integratori Alimentari" (A maiuscola) sia in `CENTRI_CON_QUANTITA` (Carica Fatture, Da Armonizzare) sia nel nuovo report — il nome ESATTO nel database, verificato da Filippo con una query diretta (righe reali con fornitore Martens/Agrilinea/Vitasol/Demas già classificate), è **"Integratori alimentari"** (a minuscola). Corretto in tutti e tre i file. Senza questa correzione, il filtro per centro di costo non avrebbe trovato nessuna riga (confronto esatto case-sensitive).

## 90. Seconda tabella "Incidenza per UBA-giorno" in Alimentaria → Costi e Quantità

**Richiesto da Filippo**: sotto la prima tabella, una seconda che mostri per ciascuna specie Kg/UBA-gg e €/UBA-gg (invece dei totali assoluti) — stesso sistema di frecce per il dettaglio prodotto.

**Punto tecnico importante**: l'incidenza (valore/UBA-giorni) è un rapporto — sommare due incidenze non equivale a ricalcolare il rapporto dopo aver sommato i valori (verificato con caso mock: sommare darebbe 3,67, il ricalcolo corretto dà 1,25). Per questo `calcolaDatiQuantitaAnno` ora espone anche `ubaGiorniProduttiviPerSpecie` nel suo valore di ritorno, e la nuova funzione `incidenza(valoreAllocato, ubaGiorniSp)` viene chiamata sempre DOPO aver aggregato/accorpato i valori assoluti (mai sull'incidenza già calcolata dal motore originale, che diventerebbe sbagliata una volta accorpati più prodotti insieme, es. ORZO).

**Costruito** `TabellaIncidenza` — stessa struttura a frecce della prima tabella (stato di espansione indipendente, `espansoIncidenza`), 3 righe (centri di costo) × 3 specie × 2 colonne (Kg/UBA-gg, €/UBA-gg) — niente colonna "Totali" qui, dato che l'UBA-giorno è per specie per definizione.

**Bug di editing corretto durante la costruzione**: una mia modifica precedente aveva rimosso per errore la riga `export default function ReportCostiQuantitaAlimentare()`, causando un errore di build — corretto prima della consegna.

**Falso allarme chiarito**: Filippo temeva avessi creato un centro di costo duplicato "Integratori Alimentari" nel database — verificato che non è mai successo (l'errore precedente era solo una stringa scritta male nel codice JS, mai un comando SQL). Confermato con `grep` che non resta nessuna occorrenza della dicitura sbagliata nel codice.

## 91. Alimentaria → Costi e Quantità: sintesi visiva + pagina 2 storico con grafici

**Richiesto da Filippo**: sotto le due tabelle di pagina 1, una sintesi visiva con icona per specie (mucca/maiale/pecora), costo totale (Mangimi+Foraggio+Integratori) + % sul totale, e Kg/UBA-gg + €/UBA-gg. Poi una "pagina 2" dello stesso report con le stesse due tabelle ma storiche (anno corrente + 3 precedenti + media), e sotto 3 grafici: andamento costi (4 linee, con variazione % anno su anno), andamento €/UBA-gg per specie, andamento Kg/UBA-gg per specie.

**Costruito**:
- `IconaMucca`/`IconaMaiale`/`IconaPecora` — sagome SVG semplici, colorabili col colore della specie (non foto realistiche, pensate per essere leggibili anche piccole)
- `sommaSuiCentri(datiAnno)` — somma Mangimi+Foraggio+Integratori per specie (costo e kg), usata sia dalla sintesi di pagina 1 sia dalle righe delle tabelle storiche di pagina 2
- `SintesiVisiva` — le 3 card (una per specie), con icona, costo+%, e le due incidenze
- `GraficoMultiLinea.jsx` (nuovo, riusabile) — grafico SVG puro a più linee con legenda, variazione % opzionale sui segmenti della prima serie (usata solo per il grafico costi, dove la prima serie è il Totale)
- `PaginaStorico` — orchestratore di pagina 2: calcola 4 anni × 3 centri (12 chiamate a `calcolaDatiQuantitaAnno`), costruisce le righe per anno (via `sommaSuiCentri`) e la media, le due tabelle storiche (righe=anni invece di righe=centri, dato che qui la vista è per specie nel tempo, non per centro di costo), e le 3 serie per i grafici
- Navigazione "Pagina 1 / Pagina 2" con due pulsanti in cima — pagina 2 calcola lo storico solo al primo accesso (non ricalcola se già fatto)

**Nota di design**: la Pagina 2 aggrega SEMPRE sui 3 centri insieme (Mangimi+Foraggio+Integratori) — non mostra più il dettaglio per singolo centro di costo, perché i grafici richiesti sono per specie nel tempo, non per centro. Il dettaglio per prodotto (drill-down) resta solo in Pagina 1.

Testato con caso mock: somma corretta su 3 centri (170€/1600kg bovini dai tre parziali), incidenza calcolata correttamente sul totale sommato.

**Non ancora fatto**: export Excel di pagina 2 (pagina 1 non ce l'ha nemmeno ancora, vedi nota sezione 88) — da aggiungere se richiesto. La media storica nella pagina 2 non gestisce ancora il caso in cui uno dei 4 anni non abbia dati (es. azienda non ancora attiva) — divide sempre per 4, da correggere se capita un caso reale.

## 92. Riordino menu — Alimentaria assorbe Razioni, Animali assorbe Accrescimento e Costi, eliminate Mangimi/Foraggio da Studi

**Richiesto da Filippo**: ora che Alimentaria → Costi e Quantità copre Mangimi/Foraggio/Integratori, le vecchie sottocartelle "Mangimi" e "Foraggio" in Studi non servono più (eliminate). "Razioni" (cartella di primo livello) spostata come sottocartella dentro "Alimentaria". "Accrescimento e Costi" (sottocartella di Studi) spostata dentro "Animali".

**Vincolo tecnico scoperto**: il menu supporta solo UN livello di sottocartella (cartella → sottocartella → voci semplici) — non sottocartella dentro sottocartella. "Razioni" aveva al suo interno una sottocartella "Suini" — spostandola dentro Alimentaria, il livello "Suini" è stato appiattito nell'etichetta della sottocartella stessa ("Razioni Suini", invece di "Razioni" → "Suini" → voci).

**Struttura risultante**:
- Alimentaria: Costi e Quantità (voce) + Razioni Suini (sottocartella: Composizione Razioni, Consumi)
- Animali: le voci di sempre + Accrescimento e Costi (sottocartella, con le sue 8 voci invariate)
- Studi: solo Istruzioni (Mangimi e Foraggio eliminate)

**Pulizia completa**: rimosse anche le righe di rendering (`{tab === "quantitamangimi" && ...}` ecc.) e i 4 import (`ReportQuantitaMangimi`, `ReportStoricoMangimi`, `ReportQuantitaForaggio`, `ReportStoricoForaggio`) ormai orfani, non più raggiungibili da nessun punto del menu — i relativi 4 file `.jsx` restano nel progetto (non cancellati) ma non più collegati all'app.

## 93. Nuove destinazioni "Bovini e Suini" e "Suini e Ovini" — ripartizione a due specie, ovunque nell'app

**Richiesto da Filippo**, partito da Trasporto Animali: oltre a "Bovini e Ovini" (già esistente), vuole poter scegliere anche "Bovini Suini" e "Suini Ovini" come destinazione, con ripartizione del costo tra le due specie coinvolte (UBA-giorni), escludendo sempre la terza.

**Chiarimento importante emerso durante l'indagine**: in Carica Fatture, per le righe di area TRASPORTO ANIMALI, il campo "Destinazione" standard (quello ora esteso) si applica alla parte "trasporto verso il macello" dell'importo; il campo "Specie" separato si applica alla parte "ingresso in allevamento" — sono due campi distinti per due parti diverse della stessa fattura, non un doppione come inizialmente (erroneamente) segnalato da me a Filippo.

**Esteso ovunque, seguendo esattamente lo stesso schema già usato per "Bovini e Ovini"**:
- `motoreUba.js` → `calcolaRigaAggregata`: aggiunte `quotaBovinoSuino`/`quotaSuinoOvino`, ciascuna ripartita SOLO tra le due specie coinvolte (il denominatore UBA-giorni esclude del tutto la terza)
- `calcoloReportCosti.js` → `classificaDestinazione` + le 3 inizializzazioni di `costiDiretti`
- `calcoloQuantitaMangimi.js` → `MAPPA_DESTINAZIONE_SPECIE` + `costiDiretti`/`kgDiretti`
- `ReportCosti.jsx` → ha una propria logica NON condivisa (formula "aggressiva" per gli improduttivi, diversa da motoreUba.js) — estesa in parallelo con lo stesso pattern (`costiBovinoSuino`/`costiSuinoOvino`, tassi dedicati, quote nel costo allocato finale)
- Tendine "Destinazione" aggiornate in tutti i 6 file che la usano: ArticoliPrezzi, CaricaFatture, CostiDiretti, InserimentoManualeFattura, Ricerca, VerificaRigheMancanti

Testato con caso mock: ripartizione 50/50 con UBA-giorni uguali, e ripartizione proporzionale 2:1 con UBA-giorni diversi — in entrambi i casi la terza specie riceve sempre zero.

**Non toccato**: `SPECIE_ACQUISTO` (usato per Acquisto Animali e per la parte "ingresso" di Trasporto Animali) resta invariato — ha già "Piu' specie acquistate insieme" come opzione generica, Filippo non ha chiesto di renderla più specifica lì.

## 94. Bug reale trovato — "Costi Diretti" (es. costo del lavoro) mai letti da nessun report

**Segnalazione di Filippo**: costo del lavoro caricato via "Costi Diretti" per il 2025, ma non compare in nessun report.

**Causa confermata**: `ci_costi_diretti` è una tabella completamente separata da `ci_articoli_fattura` (Costi Diretti non passa da una fattura) — e NESSUNA query di report la leggeva mai. Una funzionalità di inserimento costruita ma mai davvero collegata al resto.

**Corretto in due punti**:
- `calcoloReportCosti.js` → `caricaDatiGrezziAnno` (la funzione condivisa): aggiunta query su `ci_costi_diretti` per l'anno, mappata (`importo` → `totale_riga`) e unita ad `articoliAnno`. Grazie alla condivisione, questo fix si propaga automaticamente a `calcolaDatiPerArea`/`calcolaDatiPerAreaCentro`, e quindi a Report Per Area, Report Per Area/Centro, e a **tutti e 4** gli Storici (Generale/Bovini/Suini/Ovini) via ReportStorico.jsx — nessuna modifica aggiuntiva necessaria lì.
- `ReportCosti.jsx` → ha una propria implementazione separata (non passa da `caricaDatiGrezziAnno`) — corretta in parallelo con lo stesso pattern.

**Non toccato, e correttamente escluso**: `calcoloQuantitaMangimi.js` (Report Quantità/Alimentaria) — i Costi Diretti non hanno descrizione prodotto né quantità, quindi non c'entrano con quel flusso (non sono mangimi/foraggio/integratori).

Testato con caso mock: unione corretta, totale_riga mappato da importo, campi di classificazione preservati.

## 95. Costi → Report Costi: righe di totale in fondo alle due tabelle

**Richiesto da Filippo**: totali in fondo alle tabelle di Report Costi.

**Aggiunto**:
- Tabella "Allocazione per Specie": riga Totale con somma di %/Costi diretti/Quota Generali/Totale allocato — la colonna Incidenza €/UBA-gg mostra un trattino con nota ("denominatori diversi per specie"), dato che sommare rapporti con denominatori diversi (UBA-giorni di specie diverse) non avrebbe un significato corretto
- Tabella "Altre Specie" (Pollame/Cavalli/Orto): riga Totale con somma del costo diretto E dell'incidenza (qui la somma è corretta, perché tutte le righe condividono lo stesso denominatore — gli UBA-giorni produttivi dell'allevamento)

## 96. Riorganizzazione completa del menu — nuova cartella Ricerca, rinomine, nuovo ordine

**Richiesto da Filippo**: riordino strutturale completo del menu, con nuovi nomi e una nuova cartella dedicata alla ricerca trasversale.

**Struttura risultante**:
- Dashboard
- **Carica Fatture** (era "Fatture"): Istruzioni, Carica Fatture Passive massivamente (era "Carica Fatture"), Inserimento Manuale Fattura, Fatture Passive, Carica Fatture Attive (era "Fatture Attive"), Carica Costi Diretti (era "Costi Diretti"), Controllo Anomalie, Armonizzare Unità Misura Fatture (era "Da Armonizzare"), Prompt per carico Massivo (era "Prompt Estrazione PDF"), Verifica Fatture Mancanti, Verifica Righe Mancanti
- **Ricerca: Fatture, Articoli, Prezzi, Anagrafiche** (nuova): Istruzioni, Ricerca (da Fatture), Articoli & Prezzi (da Fatture), Fornitori (da Anagrafiche), Clienti (da Anagrafiche) — la cartella "Anagrafiche" come tale non esiste più, assorbita qui
- **Analisi Costi** (era "Costi", spostata qui sotto Ricerca): Istruzioni, Report Costi, Cespiti
- Alimentaria, Animali, Studi — invariate nella struttura interna
- Parametri (in fondo, invariato)

**Nessun id interno cambiato** — solo `label` (visibili nel menu) e posizione nell'albero; le righe di rendering (`{tab === "..." && <Componente />}`) non hanno richiesto modifiche, dato che accoppiano per id, non per etichetta o posizione.

**Placeholder temporaneo**: la nuova cartella Ricerca punta provvisoriamente a `IstruzioniAnagrafiche.jsx` per le sue Istruzioni (contenuto solo parzialmente pertinente, dato che la cartella ora mischia Ricerca/Articoli&Prezzi con Fornitori/Clienti) — da riscrivere come parte del prossimo punto.

## DA FARE (promemoria aggiornato)

- **Scrivere Istruzioni Generali** (nuova pagina, sopra Dashboard nel menu) che spieghi le 7 cartelle e cosa contiene ciascuna
- **Riscrivere le Istruzioni di dettaglio di ogni cartella** (Carica Fatture, Ricerca, Analisi Costi, Alimentaria, Animali, Studi) in base a tutti gli sviluppi fatti in questa sessione — sostituisce e completa il promemoria precedente (sezione "DA FARE" originale, ora assorbito qui)

## 97. Scarico costi riproduttore→figli: nuovo meccanismo "saldo residuo" al posto del conto sospeso

**Contesto**: revisione della logica di `motoreRiproduttori.js`/`ReportRiproduttori.jsx`, costruita in una sessione precedente (non coperta dal riassunto di questa conversazione). Filippo non voleva che l'arretrato di un anno senza figli si scaricasse tutto in un colpo solo sul primo anno con figli successivo — voleva che si spalmasse su più annate future.

**Cambiato** `calcolaPianoScarico`: la quota da scaricare (quando ci sono figli) non è più una frazione fissa del residuo TOTALE iniziale (`residuo_totale / vita_produttiva_attesa_anni`, con un "conto sospeso" che si scaricava tutto insieme alla prima buona occasione) — ora si ricalcola OGNI ANNO come `residuo_rimanente / anni_produttivi_residui_da_qui_in_poi`. Se un anno non ci sono figli, non si scarica nulla (il residuo resta intatto), ma l'anno dopo gli anni residui sono comunque uno in meno — quindi la quota per gli anni restanti aumenta automaticamente da sola, ridistribuendo l'arretrato su tutto quello che resta invece che tutto sul primo anno buono. Stesso principio di un mutuo a saldo residuo: una rata saltata non si accumula da pagare tutta insieme, si ridistribuisce sulle rate rimanenti.

**Rimosso** il concetto di "conto sospeso" (non più necessario col nuovo meccanismo) — dalla funzione, dal punto di chiamata in `ReportRiproduttori.jsx`, dalla tabella a schermo e dall'export Excel. La colonna `conto_sospeso` in `ci_residuo_riproduttore` resta nel database (non cancellata, solo non più aggiornata/mostrata) — nessuna migrazione necessaria dato che non viene più letta.

Testato con scenario mock a 3 anni (2 figli / 0 figli / 2 figli): confermato che l'anno senza figli non scarica nulla e non perde il residuo, e l'anno successivo la quota si ricalcola automaticamente più alta (1333,33€ invece di 1000€) per assorbire l'arretrato sui restanti anni.

## 98. Report Riproduttori — struttura ad albero navigabile (Acquistati/Nati in azienda → specie)

**Richiesto da Filippo**: due categorie in cima (Acquistati / Nati in azienda), ciascuna suddivisa per specie (Bovini/Suini/Ovini), navigabile con le frecce — per facilitare la consultazione su un elenco altrimenti piatto.

**Aggiunto** `provenienza` alla query principale (mancava, serviva per raggruppare). Costruita `TabellaRiproduttoriRaggruppata` — due livelli di espansione indipendenti (`provenienzeEspanse`, `specieEspanse`, entrambi Set per permettere più gruppi aperti insieme): livello 1 = Acquistati/Nati in azienda (intestazione verde scuro, conteggio), livello 2 = specie dentro la provenienza aperta (intestazione più chiara, conteggio), livello 3 = tabella dei riproduttori di quel gruppo, identica a prima (tolta solo la colonna "Specie", ormai ridondante col raggruppamento).

## 99. Nuova "Scheda Riproduttore" — modificabile, cliccando un animale in Report Riproduttori

**Richiesto da Filippo**: scheda dettagliata e modificabile per ogni riproduttore, con dati anagrafici, fatture acquisto/trasporto, vita attesa, figli avuti/potenziali, riepilogo costi, vendita/valore di realizzo, scarico sui figli, e per i nati in azienda il valore di nascita diviso tra madre e padre.

**Nuovo campo**: `ci_residuo_riproduttore.prezzo_vendita_kg_carcassa_reale` — `aggiungi_prezzo_vendita_reale.sql`.

**Costruito `SchedaRiproduttore.jsx`** (modale), collegata cliccando una riga in Report Riproduttori:
- Dati anagrafici (BDN, specie, razza, anno nascita, anno ingresso) — editabile, scrive su `animali`
- Fattura acquisto e fattura trasporto ingresso: **riusa dati già esistenti** in `ci_report_acquisto_animali` (collegati per BDN) se già inseriti da Carica Fatture — altrimenti permette di inserirli/correggerli direttamente da qui (crea/aggiorna la riga in quella stessa tabella, crea il fornitore se non esiste)
- Vita attesa (anni) — editabile
- Figli avuti/potenziali futuri — usa il nuovo motore di calcolo (sezione precedente): femmine per parti storici + fallback di popolazione, maschi per media annua
- Riepilogo costi: acquisto, mantenimento anni precedenti, mantenimento anno corrente (da `ci_costo_animale_annuale`)
- Prezzo vendita €/kg carcassa (editabile) → valore di realizzo calcolato (peso_carcassa dell'animale × prezzo inserito)
- Valore scaricato per figlio, dall'ultimo anno elaborato in `ci_scarico_riproduttore_annuale`
- Per i nati in azienda: quota nascita madre/padre, calcolata cercando lo scarico dell'anno di nascita per ciascun genitore in `ci_scarico_riproduttore_annuale` (non richiede nuove colonne — i due valori sommati corrispondono al `costo_nascita_ereditato` già esistente)

**Punti da verificare con dati reali (non testabili da qui)**:
- Il campo `sesso` (valore `"M"` per maschio, confermato dall'uso in `SchedaAnimale.jsx`) — usato per decidere se applicare il calcolo "femmina" (parti storici) o "maschio" (media annua). Da verificare che TUTTI i riproduttori abbiano questo campo popolato, altrimenti finiscono di default nel ramo femmina.
- Il calcolo dei figli per un maschio somma `animali` (bovini/ovini, filtrando per padre_id) E `lotti_suini`/`suini_lotto` (per suini) in un'unica espressione che sfrutta il fatto che, per la specie sbagliata, l'altro termine risulta sempre zero — funziona ma è scritto in modo poco leggibile, da ripulire se si presenta occasione.
- Non testato con dati mock (a differenza del motore di calcolo sottostante, verificato con casi mock nella sezione precedente) — la SCHEDA in sé va provata da Filippo con un animale reale prima di considerarla definitiva.

## 100. Bug reale trovato — Contabilità Industriale leggeva `costo_iniziale` invece di `prezzo_acquisto`

**Scoperta**: Filippo aveva modificato IT058990327628 su podereverdeapp.it aggiungendo data/numero fattura (il prezzo era già presente) — ma il costo continuava a risultare zero nella Contabilità Industriale. Verificato con query diretta (collegato Supabase MCP in questa sessione): il prezzo era correttamente in `prezzo_acquisto` (1300€, con fornitore/data/numero) — **il nostro codice legge invece `costo_iniziale`**, una colonna diversa e distinta, mai sincronizzata da podereverdeapp.it per gli animali acquistati (viene invece popolata solo per i nati in azienda, col costo di nascita).

**Portata**: verificato con query aggregata — **24 riproduttori su 124** hanno un prezzo reale in `prezzo_acquisto` ma zero in `costo_iniziale` — quindi la maggior parte dei "senza prezzo" segnalati nell'export Excel della sezione precedente in realtà UN prezzo ce l'hanno, solo nella colonna sbagliata.

**Corretto**: `ReportRiproduttori.jsx` e `SchedaRiproduttore.jsx` ora usano `costo_iniziale || prezzo_acquisto || 0` (preferisce costo_iniziale se presente — es. il costo di nascita per i nati in azienda — altrimenti usa prezzo_acquisto). Nessun'altra parte dell'app (motori di calcolo condivisi) legge `costo_iniziale`, quindi la correzione è contenuta a questi due file.

**Da rifare**: l'export Excel dei "riproduttori senza prezzo" (sezione precedente) è ora **superato** — la maggior parte di quegli animali ha in realtà il prezzo, solo in `prezzo_acquisto`. Da rigenerare con la query corretta se serve ancora un elenco di chi è VERAMENTE senza prezzo in nessuna delle due colonne.

**Nota di processo**: in questa sessione è stato collegato un connettore MCP Supabase, che ha permesso di interrogare direttamente il database invece di chiedere a Filippo di lanciare query manualmente — molto più rapido per verifiche di questo tipo.

## 101. Precisazione — due sole fonti di costo iniziale, mai mescolate, scelta esplicita per provenienza

**Confermato da Filippo**: il costo di partenza di un riproduttore può venire da una delle due fonti soltanto — costo di acquisto (per gli "Acquistato") oppure costo di nascita (per i "Nato in azienda") — mai un mix o un fallback generico.

**Corretto**: sostituito il fallback generico (`costo_iniziale || prezzo_acquisto`) con una scelta esplicita basata sulla provenienza: `rip.provenienza === "Nato in azienda" ? rip.costo_iniziale : rip.prezzo_acquisto` — così anche nel caso raro in cui un animale avesse (per errore) valori in entrambi i campi, si usa sempre e solo quello corretto per la sua provenienza, mai un mix ambiguo.
