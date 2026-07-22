# Contabilità Industriale — Podere Verde

## Setup iniziale

1. Crea un nuovo repository su GitHub (es. "podereverde-contabilita-industriale")
2. Estrai questo archivio dentro la cartella del repo
3. Crea un file `.env` (copiando `.env.example`) con le credenziali reali:
   - VITE_SUPABASE_URL = https://pyjymnpnxatqwfhguaus.supabase.co
   - VITE_SUPABASE_ANON_KEY = (la trovi su supabase.com → progetto → Settings → API Keys → "Publishable key")
4. `npm install`
5. `npm run dev` per provarlo in locale, `npm run build` per la build di produzione

## Deploy su Vercel

1. Collega il repo GitHub a un nuovo progetto Vercel
2. Nelle impostazioni del progetto Vercel, aggiungi le variabili d'ambiente:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
   - **ANTHROPIC_API_KEY** — la chiave API da console.anthropic.com (serve SOLO per la lettura PDF, resta lato server e non è mai visibile nel browser)
3. NON committare mai il file `.env` reale su GitHub
4. Deploy

## Cosa c'è già

- **Carica Fatture**: due modalità —
  - **File Excel**: carica un file con le righe fattura grezze
  - **Cartella PDF**: seleziona una cartella intera di PDF (es. scaricati da Aruba), li legge automaticamente uno per uno tramite Claude (ogni PDF ha un piccolo costo sul tuo account Anthropic), scomponendo ogni fattura in tutte le sue righe/articoli distinti
  - In entrambi i casi: classificazione automatica FCV/FCF, maschera per le righe non classificabili, controllo duplicati (fatture già caricate vengono segnalate e saltate), gestione speciale di Ammortamenti/Acquisto Animali/Trasporto Animali
- **Fornitori**: elenco dei 60 fornitori già caricati, filtrabile per gruppo
- **Report Acquisto Animali**: le righe in attesa di essere inserite manualmente in podereverdeapp.it
