import * as XLSX from "xlsx";

// Esporta uno o più fogli in un unico file Excel scaricabile.
// fogli: [{ nome: "Foglio1", righe: [{colonna1: valore, ...}, ...] }, ...]
// Ogni "riga" è un oggetto semplice {chiave: valore} — le chiavi diventano intestazioni colonna.
export function esportaExcel(nomeFile, fogli) {
  const wb = XLSX.utils.book_new();
  fogli.forEach(({ nome, righe }) => {
    const ws = XLSX.utils.json_to_sheet(righe && righe.length > 0 ? righe : [{}]);
    // Larghezza colonne approssimata in base al contenuto, per leggibilità immediata
    if (righe && righe.length > 0) {
      const chiavi = Object.keys(righe[0]);
      ws["!cols"] = chiavi.map(k => {
        const maxLen = Math.max(k.length, ...righe.map(r => String(r[k] ?? "").length));
        return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
      });
    }
    // Nomi foglio Excel: max 31 caratteri, niente caratteri speciali problematici
    const nomeSicuro = nome.replace(/[\\/*?[\]:]/g, "").slice(0, 31) || "Foglio1";
    XLSX.utils.book_append_sheet(wb, ws, nomeSicuro);
  });
  const dataOggi = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${nomeFile}_${dataOggi}.xlsx`);
}

// Appiattisce un numero (già arrotondato) in un valore Excel pulito — evita che virgolette/€
// finiscano dentro la cella come testo invece che come numero utilizzabile in Excel
export function numeroExcel(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Math.round(Number(n) * 100) / 100;
}
