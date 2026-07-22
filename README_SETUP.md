# Contabilità Industriale — Podere Verde

## Setup iniziale

1. Crea un nuovo repository su GitHub (es. "podereverde-contabilita-industriale")
2. Estrai questo archivio dentro la cartella del repo
3. Crea un file `.env` (copiando `.env.example`) con le credenziali reali:
   - VITE_SUPABASE_URL = https://pyjymnpnxatqwfhguaus.supabase.co
   - VITE_SUPABASE_ANON_KEY = (la trovi su supabase.com → progetto → Settings → API)
4. `npm install`
5. `npm run dev` per provarlo in locale, `npm run build` per la build di produzione

## Deploy su Vercel

1. Collega il repo GitHub a un nuovo progetto Vercel
2. Nelle impostazioni del progetto Vercel, aggiungi le stesse 2 variabili d'ambiente (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) — NON committare mai il file `.env` reale su GitHub
3. Deploy

## Cosa c'è già

- **Carica Fatture**: carica un Excel con le righe fattura grezze, applica automaticamente le regole FCV/FCF, mostra una maschera per le righe non classificabili (inclusa la gestione speciale di Ammortamenti/Acquisto Animali/Trasporto Animali)
- **Fornitori**: elenco dei 60 fornitori già caricati, filtrabile per gruppo
- **Report Acquisto Animali**: le righe in attesa di essere inserite manualmente in podereverdeapp.it
