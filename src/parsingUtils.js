// Funzioni di parsing condivise tra Carica Fatture (passive) e Carica Fatture Attive

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
