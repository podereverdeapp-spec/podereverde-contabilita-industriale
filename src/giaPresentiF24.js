// Versione 342 (31/10/2026, ordine del Dott. Bizzarri): gli F24 che erano già nel programma prima della pagina «F24 arrivati»
// si mettono nell'archivio nuovo SENZA rileggerli: si usano i PDF già salvati nel programma (impronta controllata).
// Non si cambiano importi, stati, scadenze: si scrivono solo i file e la cartella del pagamento (già decisa nel programma).
import { LIMITE_PERCORSO, PREFISSO_ARCHIVIO, nomeCartellaValido } from "./calcoloF24Arrivati";
import { nomeNonAccettato } from "./archivioF24";

// cartelle di pagamento decise dai codici a debito (i crediti non contano)
function categorieDi(f, db) {
  const pagamenti = new Set(db.cartelle.filter(c => c.tipo === "Pagamenti" && c.attiva !== false).map(c => c.percorso));
  const righe = db.righe.filter(r => r.f24_id === f.id && Number(r.importo_debito) > 0);
  return [...new Set(righe.map(r => db.codici.find(k => k.codice === r.codice_tributo && (!r.sezione || !k.sezione || k.sezione === r.sezione))?.cartella_nuova
    || db.codici.find(k => k.codice === r.codice_tributo)?.cartella_nuova).filter(c => c && pagamenti.has(c)))].sort();
}

export function pianoGiaPresenti(db, oggi) {
  if (!db) return [];
  const daFare = db.f24.filter(f => f.stato !== "Sostituito" && !db.fileArchivio.some(x => x.f24_id === f.id && x.cosa === "F24" && !x.superato));
  const originaliVisti = new Set();
  return daFare.map(f => {
    const problemi = [];
    let categorie = categorieDi(f, db), daAltro = null;
    // nessun codice a debito decide la cartella (es. solo sanzioni): si usa quella dell'altro F24 arrivato nello stesso file
    if (!categorie.length && f.nome_file_ricevuto) {
      const fratello = db.f24.find(g => g.id !== f.id && g.nome_file_ricevuto === f.nome_file_ricevuto && categorieDi(g, db).length);
      if (fratello) { categorie = categorieDi(fratello, db); daAltro = fratello.codice_delega; }
    }
    if (!categorie.length) problemi.push("nessun codice a debito decide la cartella e non c'è un altro F24 dello stesso file");
    const nome = f.cartella_pagamento;
    if (!nome) problemi.push("manca il nome della cartella del pagamento nel programma");
    else { const no = nomeCartellaValido(nome); if (no) problemi.push(`nome della cartella: ${no}`); }
    const anno = String(f.data_scadenza || "").slice(0, 4);
    if (!/^\d{4}$/.test(anno)) problemi.push("manca la scadenza");
    const pezzi = [{ cosa: "F24", archivio: `${f.codice_delega}/F24.pdf`, md5Atteso: f.md5_pdf, nomeFile: `F24 ${f.data_scadenza}.pdf` }];
    if (f.md5_quietanza) pezzi.push({ cosa: "Quietanza", archivio: `${f.codice_delega}/quietanza.pdf`, md5Atteso: f.md5_quietanza, nomeFile: `QUIETANZA ${f.data_pagamento || "SENZA DATA"}.pdf` });
    if (f.md5_contabile) pezzi.push({ cosa: "Contabile della banca", archivio: `${f.codice_delega}/contabile.pdf`, md5Atteso: f.md5_contabile, nomeFile: `CONTABILE BANCA ${f.data_pagamento || "SENZA DATA"}.pdf` });
    const file = [];
    for (const cat of categorie) for (const p of pezzi) {
      const destinazione = `${cat}\\${anno}\\${nome}\\${p.nomeFile}`;
      file.push({ ...p, categoria: cat, destinazione });
      if (PREFISSO_ARCHIVIO.length + destinazione.length > LIMITE_PERCORSO) problemi.push(`percorso troppo lungo: ${destinazione}`);
      for (const n of destinazione.split("\\")) { const no = nomeNonAccettato(n); if (no) problemi.push(`«${n}» ${no}`); }
    }
    // un file ricevuto con più deleghe si conserva intero in ORIGINALI RICEVUTI (una volta sola)
    let originale = null;
    const quante = Number((String(f.delega_nel_file_ricevuto || "").match(/di\s+(\d+)/) || [])[1] || 1);
    if (quante >= 2 && f.nome_file_ricevuto && !originaliVisti.has(f.nome_file_ricevuto.toUpperCase())) {
      originaliVisti.add(f.nome_file_ricevuto.toUpperCase());
      originale = { nome: f.nome_file_ricevuto, destinazione: `ORIGINALI RICEVUTI\\${oggi.slice(0, 4)}\\${f.nome_file_ricevuto}`, categoria: "ORIGINALI RICEVUTI" };
      const no = nomeNonAccettato(f.nome_file_ricevuto); if (no) problemi.push(`«${f.nome_file_ricevuto}» ${no}`);
    }
    return { f, categorie, daAltro, nome, anno, file, originale, problemi };
  });
}
