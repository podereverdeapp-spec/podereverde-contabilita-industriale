// Versione 400 (Tenente, 24/11/2026; decisione del Dott. Bizzarri delle 18:41 «procedi per il meglio»):
// nei nomi dei file degli F24 nell'archivio c'è il protocollo interno al posto della data.
//   F24 → «F24 2025-0002.pdf»; quietanza → «F24 2025-0002 QUIETANZA.pdf»;
//   contabile della banca → «F24 2025-0002 CONTABILE.pdf»; pagina dell'estratto → «F24 2025-0002 ESTRATTO.pdf».
// Le cartelle restano come sono (data e oggetto). Originali ricevuti e comunicazioni non cambiano nome.
// Motivo: con protocollo E data, 23 file su 124 superavano i 250 caratteri (Windows si ferma a 260; Esplora risorse e Office non vanno oltre).
// Qui solo calcolo, nessuna scrittura.

// La cartella vera dell'archivio (dal 03/11/2026): 104 caratteri. È la stessa di calcoloF24Arrivati.js e calcoloConsultaF24.js.
export const BASE_ARCHIVIO = "Z:\\SOCIETA\\SOCIETA' AGRICOLA PODERE VERDE A R.L\\00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE\\F24\\ARCHIVIO\\";
export const LIMITE_FINALE = 250;        // percorso completo del file (Windows si ferma a 260: 10 caratteri di margine)
export const LIMITE_PROVVISORIO = 259;   // percorso durante la scrittura, con il nome provvisorio
export const NOME_PROVVISORIO_ESEMPIO = "PROVV 1234567891.pdf"; // il nome provvisorio più lungo usato (archivioF24.js: 6+3+1 cifre)

// I tipi di file che prendono il protocollo nel nome, con la parola dopo il protocollo
export const SUFFISSI = { "F24": "", "Quietanza": " QUIETANZA", "Contabile della banca": " CONTABILE", "Pagina dell'estratto conto": " ESTRATTO" };

// «F24 2025/0002» → «F24 2025-0002» (la barra non può stare in un nome di file); null se il protocollo non è di quella forma
export function etichettaProtocollo(protocollo) {
  const m = String(protocollo || "").trim().match(/^F24 (\d{4})\/(\d{4})$/);
  return m ? `F24 ${m[1]}-${m[2]}` : null;
}
// nome del file nell'archivio; null se quel tipo di file non prende il protocollo o se il protocollo manca
export function nomeConProtocollo(cosa, protocollo) {
  if (!(cosa in SUFFISSI)) return null;
  const e = etichettaProtocollo(protocollo);
  return e ? `${e}${SUFFISSI[cosa]}.pdf` : null;
}
// Prima dell'archiviazione un F24 nuovo non ha ancora il protocollo (lo dà il database quando l'F24 entra):
// nel piano si mostra un segnaposto della stessa lunghezza, sostituito al momento della scrittura.
export const SEGNAPOSTO = "F24 ____-____";
export function nomeConSegnaposto(cosa) {
  return cosa in SUFFISSI ? `${SEGNAPOSTO}${SUFFISSI[cosa]}.pdf` : null;
}

const cartellaDi = p => String(p || "").split("\\").slice(0, -1).join("\\");
const nomeDi = p => String(p || "").split("\\").pop();
export function lunghezzeArchivio(percorso) {
  return { finale: BASE_ARCHIVIO.length + percorso.length,
    provvisorio: BASE_ARCHIVIO.length + cartellaDi(percorso).length + 1 + NOME_PROVVISORIO_ESEMPIO.length };
}
// il nome è già quello giusto? (anche con «_2», «_3» che il programma aggiunge quando nella stessa cartella c'è già un file diverso)
export function nomeGiaGiusto(nomeAttuale, nomeGiusto) {
  if (!nomeGiusto) return true;
  const a = String(nomeAttuale).toUpperCase(), g = nomeGiusto.toUpperCase();
  if (a === g) return true;
  const base = g.replace(/\.PDF$/, "");
  return new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_\\d+\\.PDF$`).test(a);
}

// Piano della rinomina dei file già nell'archivio.
// fileArchivio: righe di ci_f24_file_archivio (id, percorso, cartella, cosa, superato, f24_id, md5); f24: righe di ci_f24 (id, protocollo_interno, codice_delega)
// Ritorna { daFare: [{ id, f24_id, protocollo, codice, cosa, vecchio, nuovo, md5, lunghezza }], problemi: [{ id, vecchio, motivo }], giaGiusti, fuori }
export function pianoRinomina(fileArchivio, f24) {
  const perId = new Map(f24.map(f => [f.id, f]));
  const daFare = [], problemi = []; let giaGiusti = 0, fuori = 0;
  // tutti i percorsi già usati nell'archivio (senza distinguere maiuscole: Windows non le distingue)
  const occupati = new Map(fileArchivio.map(x => [String(x.percorso).toUpperCase(), x.id]));
  const ordinati = [...fileArchivio].sort((a, b) => a.id - b.id);
  for (const x of ordinati) {
    if (x.superato || !(x.cosa in SUFFISSI)) { fuori++; continue; }
    const f = perId.get(x.f24_id);
    if (!f) { problemi.push({ id: x.id, vecchio: x.percorso, motivo: "il file non è collegato a un F24 del programma" }); continue; }
    const giusto = nomeConProtocollo(x.cosa, f.protocollo_interno);
    if (!giusto) { problemi.push({ id: x.id, vecchio: x.percorso, motivo: `l'F24 ${f.codice_delega} non ha il protocollo interno` }); continue; }
    if (nomeGiaGiusto(nomeDi(x.percorso), giusto)) { giaGiusti++; continue; }
    // stesso nome nuovo per due file della stessa cartella (per esempio due quietanze dello stesso F24): «_2», «_3»
    let nuovo = `${cartellaDi(x.percorso)}\\${giusto}`;
    for (let n = 2; occupati.has(nuovo.toUpperCase()) && occupati.get(nuovo.toUpperCase()) !== x.id; n++)
      nuovo = `${cartellaDi(x.percorso)}\\${giusto.replace(/\.pdf$/i, `_${n}.pdf`)}`;
    const l = lunghezzeArchivio(nuovo);
    if (l.finale > LIMITE_FINALE || l.provvisorio > LIMITE_PROVVISORIO) {
      problemi.push({ id: x.id, vecchio: x.percorso, motivo: `il nome nuovo porterebbe il percorso a ${l.finale} caratteri (massimo ${LIMITE_FINALE})` }); continue; }
    occupati.set(nuovo.toUpperCase(), x.id);
    daFare.push({ id: x.id, f24_id: x.f24_id, protocollo: f.protocollo_interno, codice: f.codice_delega, cosa: x.cosa, vecchio: x.percorso, nuovo, md5: x.md5, lunghezza: l.finale });
  }
  return { daFare, problemi, giaGiusti, fuori };
}
