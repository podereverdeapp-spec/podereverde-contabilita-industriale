// Versione 292: abbinamento dei PDF di una cartella alle fatture del programma (funzioni pure, provate con i nomi veri).

// ---------- abbinamento automatico dei file di una cartella ----------

// numero della fattura ridotto a lettere e cifre, senza zeri iniziali: «000140/QC9» e «000140-QC9» → «140qc9»
export const numeroNorm = n => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^0+/, "");
const nomeNorm = n => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const pivaNorm = p => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^IT(?=\d{11}$)/, "");
const giorni = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);

// I due modi in cui sono scritti i nomi dei PDF nelle cartelle delle fatture:
//  a) rinominati da Claude: «FORNITORE_2025-01-07_000140-QC9.pdf»
//  b) originali di Aruba: «IT00319620563_00B9V.xml - 30_A.pdf» (partita IVA di chi emette la fattura, poi il numero)
export function leggiNomePdf(nome) {
  let m = nome.match(/^(.+)_(\d{4}-\d{2}-\d{2})_(.+)\.pdf$/i);
  if (m) return { tipo: "rinominato", nome: m[1], data: m[2], numero: m[3] };
  // dopo la partita IVA può esserci l'anno («IT01879020517A2026_…», «IT016417907022026D_…»)
  m = nome.match(/^(IT\d{11}|[A-Z]{2}[0-9A-Z]+)?([0-9A-Z]*)_[^.]+\.xml(?:\.p7m)?\s*-\s*(.+)\.pdf$/i);
  if (m && m[1]) {
    const anno = (m[2] || "").match(/20\d\d/);
    return { tipo: "aruba", partitaIva: pivaNorm(m[1]), anno: anno ? anno[0] : null, numero: m[3] };
  }
  return null;
}

// Prepara i documenti: numero ridotto e, per i documenti con più numeri («3 e 5», «14/E e 12/E»), ogni numero
export const preparaDocumenti = documenti => documenti.map(d => ({ ...d, _num: numeroNorm(d.numero),
  _nums: String(d.numero || "").split(/\s+e\s+/i).map(numeroNorm).filter(Boolean) }));

// Cerca il documento di un file. documenti: righe di ci_v_ricerca_documenti passate da preparaDocumenti;
// pivaFornitori: { partita IVA senza «IT»: [id fornitori] }; percorso: la cartella del file (una cartella
// con «attiv» nel nome contiene fatture di vendita, le altre fatture d'acquisto).
export function abbinaFile(nomeFile, documenti, pivaFornitori, percorso = "") {
  const n = leggiNomePdf(nomeFile);
  if (!n) return { motivo: "nome del file non riconosciuto" };
  const num = numeroNorm(n.numero);
  if (!num) return { motivo: "numero della fattura non leggibile nel nome" };
  const tipoCartella = /attiv/i.test(percorso) ? "ATTIVA" : "PASSIVA";
  const conNumero = documenti.filter(d => (d._num === num || (d._nums || []).includes(num)) && (d.tipo === tipoCartella || d.tipo === "DA_" + (tipoCartella === "ATTIVA" ? "EMETTERE" : "RICEVERE")));
  if (n.tipo === "rinominato") {
    const pref = nomeNorm(n.nome).slice(0, 6);
    let c = conNumero.filter(d => d.data === n.data);
    if (c.length > 1) c = c.filter(d => nomeNorm(d.controparte).slice(0, 6) === pref);
    if (c.length === 1) return { doc: c[0] };
    if (c.length === 0) {
      // stessa fattura con la data diversa di uno o due giorni (es. acquisti di animali registrati con un giorno in meno)
      const vicini = conNumero.filter(d => nomeNorm(d.controparte).slice(0, 6) === pref && giorni(d.data, n.data) <= 2);
      if (vicini.length === 1) return { doc: vicini[0], nota: `data nel programma ${vicini[0].data}, nel nome del file ${n.data}` };
      return { motivo: "nessuna fattura con questo numero e questa data" };
    }
    return { motivo: "più fatture possibili" };
  }
  // La partita IVA nel nome è di chi ha spedito il file: il fornitore, oppure un intermediario (per esempio Aruba).
  const ids = pivaFornitori[n.partitaIva];
  let c = conNumero.filter(d => !n.anno || String(d.data || "").startsWith(n.anno));
  if (ids) {
    const delFornitore = c.filter(d => ids.includes(d.fornitore_id));
    if (delFornitore.length === 1) return { doc: delFornitore[0] };
    if (delFornitore.length > 1) return { motivo: "più fatture possibili" };
  }
  if (c.length === 1) return { doc: c[0], nota: "abbinata con il solo numero della fattura" };
  if (c.length === 0) return { motivo: "nessuna fattura con questo numero" };
  return { motivo: "più fatture con lo stesso numero: il nome del file non dice quale" };
}
