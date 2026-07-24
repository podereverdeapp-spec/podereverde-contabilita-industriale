// Funzioni di parsing condivise tra Carica Fatture (passive) e Carica Fatture Attive

// Supabase (PostgREST) restituisce spesso le colonne numeric/decimal come TESTO
// (per non perdere precisione) invece che come numeri JavaScript veri. Questa funzione
// converte i campi indicati in numeri reali subito dopo la lettura, così il resto del
// codice (somme, .toFixed(), ecc.) funziona sempre correttamente.
export function numerizzaCampi(righe, campi) {
  if (!righe) return righe;
  return righe.map(r => {
    const copia = { ...r };
    campi.forEach(c => {
      if (copia[c] !== null && copia[c] !== undefined) {
        const n = parseFloat(copia[c]);
        copia[c] = Number.isNaN(n) ? copia[c] : n;
      }
    });
    return copia;
  });
}

// Formatta un numero in stile italiano: punto per le migliaia, virgola per i decimali
// (es. 1234.5 -> "1.234,50"). Usata ovunque un numero va mostrato a schermo.
export function formattaNumero(n, decimali = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("it-IT", { minimumFractionDigits: decimali, maximumFractionDigits: decimali, useGrouping: true });
}

export function formattaEuro(n, decimali = 2) {
  return `${formattaNumero(n, decimali)}€`;
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Interpreta un numero che potrebbe arrivare come vero numero, o come testo con la virgola
// decimale all'italiana (es. "1.000,50"), o con un punto come separatore delle migliaia.
export function numeroRobusto(v) {
  if (v === undefined || v === null || v === "") return NaN;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  return parseFloat(s);
}

// Se la colonna Imponibile è compilata la uso; altrimenti la calcolo da Quantità × Prezzo unitario
export function calcolaImponibile(rigaGrezza) {
  const diretto = rigaGrezza["Imponibile"];
  if (diretto !== undefined && diretto !== null && diretto !== "") {
    const v = numeroRobusto(diretto);
    if (!Number.isNaN(v)) return v;
  }
  const qta = numeroRobusto(rigaGrezza["Quantità"] ?? rigaGrezza["Quantita"]);
  const prezzo = numeroRobusto(rigaGrezza["Prezzo unitario"] ?? rigaGrezza["Prezzo Unitario"]);
  if (!Number.isNaN(qta) && !Number.isNaN(prezzo)) return round2(qta * prezzo);
  return 0;
}

// Cerca la colonna "aliquota iva" indipendentemente da maiuscole/minuscole/spazi,
// e converte automaticamente il valore in percentuale: 0.22 -> 22, ma 22 resta 22
export function leggiAliquotaIva(rigaGrezza) {
  const chiave = Object.keys(rigaGrezza).find(k => k.trim().toLowerCase() === "aliquota iva");
  if (!chiave) return null;
  const raw = rigaGrezza[chiave];
  if (raw === undefined || raw === null || raw === "") return null;
  const v = numeroRobusto(raw);
  if (Number.isNaN(v)) return null;
  return v <= 1 ? round2(v * 100) : v;
}

export function formattaData(v) {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (s.includes("/")) {
    const [gg, mm, aa] = s.split("/");
    return `${aa}-${mm.padStart(2, "0")}-${gg.padStart(2, "0")}`;
  }
  return s;
}
