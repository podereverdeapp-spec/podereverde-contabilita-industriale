import * as XLSX from "xlsx-js-style";

// Palette allineata a style.js (C), in esadecimale senza # per xlsx-js-style
const STILE = {
  primario: "3A5A40",      // verde scuro — intestazioni
  primarioTesto: "FFFFFF",
  rosso: "C0392B",
  rossoSfondo: "FBE1DE",   // rosso chiaro per sfondo riga, non il rosso pieno (troppo pesante su tante celle)
  bordo: "D8D3C5",
  zebra: "F7F5F0",
};
const FONT_NOME = "Century Gothic";

const STILE_INTESTAZIONE = {
  fill: { fgColor: { rgb: STILE.primario } },
  font: { color: { rgb: STILE.primarioTesto }, bold: true, sz: 11, name: FONT_NOME },
  border: bordoCompleto("FFFFFF"),
  alignment: { vertical: "center" },
};

function bordoCompleto(colore) {
  const lato = { style: "thin", color: { rgb: colore } };
  return { top: lato, bottom: lato, left: lato, right: lato };
}

// Rileva se un valore è un numero "vero" (non una stringa che assomiglia a un numero) —
// solo in questo caso applichiamo un formato numerico, altrimenti resta testo
function eNumero(v) {
  return typeof v === "number" && Number.isFinite(v);
}

// Esporta uno o più fogli in un unico file Excel scaricabile, con formattazione.
// fogli: [{ nome, righe, coloriRiga? }]
//   - righe: [{colonna1: valore, ...}, ...] — ogni oggetto è una riga, le chiavi diventano intestazioni
//   - coloriRiga: (riga, indice) => boolean — se true, evidenzia quella riga in rosso (facoltativo,
//     usato per i casi già rossi a schermo: cespiti/costi non imputabili in allevamento, ecc.)
export function esportaExcel(nomeFile, fogli) {
  const wb = XLSX.utils.book_new();

  fogli.forEach(({ nome, righe, coloriRiga }) => {
    const righeEffettive = righe && righe.length > 0 ? righe : [{}];
    const chiavi = Object.keys(righeEffettive[0]);
    const ws = XLSX.utils.json_to_sheet(righeEffettive);

    // Intestazione (riga 0)
    chiavi.forEach((_, c) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[cellRef]) ws[cellRef].s = STILE_INTESTAZIONE;
    });

    // Righe dati: bordo sottile ovunque, zebra leggera, rosso se coloriRiga lo richiede,
    // formato numerico automatico per i valori numerici
    righeEffettive.forEach((riga, i) => {
      const rossa = typeof coloriRiga === "function" && coloriRiga(riga, i);
      const zebrata = i % 2 === 1;
      chiavi.forEach((k, c) => {
        const cellRef = XLSX.utils.encode_cell({ r: i + 1, c });
        const cell = ws[cellRef];
        if (!cell) return;
        const stileBase = {
          font: { name: FONT_NOME, sz: 10, color: rossa ? { rgb: STILE.rosso } : undefined, bold: rossa || undefined },
          border: bordoCompleto(STILE.bordo),
          fill: rossa ? { fgColor: { rgb: STILE.rossoSfondo } } : zebrata ? { fgColor: { rgb: STILE.zebra } } : undefined,
        };
        if (eNumero(cell.v)) stileBase.numFmt = "#,##0.00";
        cell.s = stileBase;
      });
    });

    // Larghezza colonne in base al contenuto
    ws["!cols"] = chiavi.map(k => {
      const maxLen = Math.max(k.length, ...righeEffettive.map(r => String(r[k] ?? "").length));
      return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
    });

    // Filtro automatico sull'intestazione + riga intestazione sempre visibile scorrendo
    const ultimaColonna = XLSX.utils.encode_col(chiavi.length - 1);
    ws["!autofilter"] = { ref: `A1:${ultimaColonna}1` };
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    ws["!rows"] = [{ hpx: 22 }];

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
