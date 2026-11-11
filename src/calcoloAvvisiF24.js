// Versione 363 (11/11/2026, ordini del Dott. Bizzarri delle 14:03–14:04): due avvisi in alto nel programma.
//  1) «F24 da pagare»: F24 «Da pagare» o «Disposto» scaduti o che scadono entro 7 giorni, senza il pagamento nell'estratto della banca.
//     Le regole del pagamento in banca sono quelle della «Chiusura» (versione 355) attraverso calcoloConsultaF24.js: una sola regola nel programma.
//  2) «F24 da caricare»: PDF nuovi nella cartella del cloud FISCALE\QUIETANZE F24 che non sono ancora nel programma.
//     Il programma non può guardare il cloud da solo: il controllo lo fa chi preme «Controlla FISCALE» (sola lettura) e l'esito
//     resta nel database (ci_f24_fiscale_file, ci_f24_fiscale_controlli), uguale per tutti fino al controllo successivo.
// Qui solo calcolo, nessuna scrittura.
import { consulta } from "./calcoloConsultaF24";
import { dataRoma } from "./dateRoma";

export const GIORNI_PREAVVISO = 7;          // «in scadenza»: entro 7 giorni da oggi
export const GIORNI_CONTROLLO_VECCHIO = 7;  // l'ultimo controllo di FISCALE è «vecchio» dopo 7 giorni
export const DATA_PARTENZA = "2025-12-01";  // i file con una data precedente sono «Storico» (decisione del Dottore delle 14:00)
export const ESITI = ["Da caricare", "Caricato con lo stesso nome", "Caricato", "Storico", "Non da caricare"];

const piu = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const giorniTra = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);

// ── 1) F24 da pagare ───────────────────────────────────────────────────────────────────────────────
// dati: { f24, righeBanca (uscite con F24 nella descrizione, con documento_id), documenti (id, annullato_il, impronte), coperturaFino, oggi }
export function avvisoDaPagare({ f24, righeBanca, documenti, coperturaFino, oggi }) {
  const { elenco } = consulta({ f24, righeBanca, documenti, coperturaFino, oggi });
  const aperti = elenco.filter(f => f.stato === "Da pagare" || f.stato === "Disposto");
  const limite = piu(oggi, GIORNI_PREAVVISO);
  const pagatiDaConfermare = aperti.filter(f => f.rigaProposta);
  const senzaPagamento = aperti.filter(f => !f.rigaProposta);
  const saldoZero = f => Math.round(Number(f.saldo) * 100) === 0;
  // scaduti: con saldo, scadenza passata e nessun pagamento trovato in banca (anche quando l'estratto non è ancora caricato: si dice quale)
  // senza data di scadenza: si tratta come scaduto (non si può sapere se è in tempo) — secondo ricontrollo, minore 5
  const scaduti = senzaPagamento.filter(f => !saldoZero(f) && (!f.data_scadenza || f.data_scadenza < oggi))
    .map(f => ({ ...f, nota: f.esito === "scaduto-non-pagato" ? "in banca non c'è l'addebito" : f.esito === "attesa-estratto" ? "l'estratto della banca non è ancora caricato oltre la scadenza" : !f.data_scadenza ? "senza data di scadenza nel programma" : f.come }));
  const inScadenza = senzaPagamento.filter(f => !saldoZero(f) && f.data_scadenza && f.data_scadenza >= oggi && f.data_scadenza <= limite)
    .map(f => ({ ...f, giorni: giorniTra(oggi, f.data_scadenza) }));
  // a saldo zero (pagati con i crediti) non passano in banca: vanno presentati entro la scadenza; scaduti senza quietanza si segnalano a parte
  const saldoZeroDaPresentare = senzaPagamento.filter(f => saldoZero(f) && (!f.data_scadenza || f.data_scadenza <= limite));
  const ordina = l => l.sort((a, b) => String(a.data_scadenza || "").localeCompare(String(b.data_scadenza || "")));
  return { scaduti: ordina(scaduti), inScadenza: ordina(inScadenza), saldoZeroDaPresentare: ordina(saldoZeroDaPresentare), pagatiDaConfermare: ordina(pagatiDaConfermare),
    // il numero rosso conta anche gli F24 a saldo zero non presentati: vanno presentati entro la scadenza (ricontrollo indipendente, difetto 1)
    numero: scaduti.length + inScadenza.length + saldoZeroDaPresentare.length, importo: [...scaduti, ...inScadenza].reduce((s, f) => s + Number(f.saldo || 0), 0) };
}

// ── 2) F24 da caricare ─────────────────────────────────────────────────────────────────────────────
// La data di un file di FISCALE: prima la data nel nome («DEL 16.04.2026», «2026-04-16»), poi l'anno della cartella («ANNO 2026»).
export function dataDelFile(percorso) {
  // la data più recente fra il nome del file e le cartelle che lo contengono: un ravvedimento di una scadenza vecchia
  // sta in una cartella di quietanze recente (per esempio «QUIETANZE DEL 8.05.2026\\F24 DEL 16.03.2026 CON RAVVEDIMENTO.pdf»)
  const vera = (a, m, g) => { const d = new Date(Date.UTC(+a, +m - 1, +g)); return d.getUTCFullYear() === +a && d.getUTCMonth() === +m - 1 && d.getUTCDate() === +g ? `${a}-${String(m).padStart(2, "0")}-${String(g).padStart(2, "0")}` : null; };
  const date = [];
  for (const parte of String(percorso || "").split("\\")) {
    for (const m of parte.matchAll(/(?:^|\D)(\d{1,2})[.\-_ ](\d{1,2})[.\-_ ](\d{4})(?!\d)/g)) { const d = vera(m[3], m[2], m[1]); if (d) date.push(d); }
    for (const m of parte.matchAll(/(?:^|\D)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) { const d = vera(m[1], m[2], m[3]); if (d) date.push(d); }
  }
  if (date.length) return date.sort().pop();
  const anni = [...String(percorso || "").matchAll(/(?:^|\D)(20\d{2})(?!\d)/g)].map(m => m[1]).sort();
  return anni.length ? `${anni.pop()}-12-31` : null;   // senza data: non è «Storico», si controlla
}
export const eDaControllare = nome => /\.(pdf|p7m)$/i.test(nome || "");
const base = p => String(p || "").replace(/\//g, "\\").split("\\").pop().trim().toUpperCase().replace(/\.P7M$/, "");

// Insiemi di ciò che è già nel programma: impronte (F24, quietanze, contabili, documenti, archivio) e nomi dei file ricevuti
export function giaNelProgramma({ f24 = [], documenti = [], fileArchivio = [] }) {
  const impronte = new Set(), nomi = new Map(), senzaImpronta = new Set();
  const aggiungi = (imp) => { if (imp) impronte.add(String(imp).toLowerCase()); };
  // senzaImpronta: nomi di file registrati nel programma senza impronta (non si può dire se il contenuto è lo stesso)
  const nome = (n, chi, imp) => { const b = base(n); if (!b) return; if (!nomi.has(b)) nomi.set(b, chi); if (!imp) senzaImpronta.add(b); };
  for (const f of f24) {
    [f.md5_pdf, f.md5_quietanza, f.md5_contabile].forEach(aggiungi);
    [[f.nome_file_ricevuto, f.md5_pdf], [f.nome_file_quietanza, f.md5_quietanza], [f.nome_file_contabile, f.md5_contabile]].forEach(([n, imp]) => nome(n, `F24 ${f.codice_delega} (${f.oggetto || ""})`, imp));
  }
  for (const d of documenti) { aggiungi(d.md5); aggiungi(d.md5_file_ricevuto); nome(d.nome_file_ricevuto, `documento n. ${d.id}`, d.md5 || d.md5_file_ricevuto); }
  for (const x of fileArchivio) aggiungi(x.md5);
  return { impronte, nomi, senzaImpronta };
}

// Esito di un file: { percorso, md5 (o null se non letto), dimensione }, gia: da giaNelProgramma, vecchio: la riga salvata del controllo precedente
export function esitoFile(file, gia, vecchio) {
  // «Non da caricare» deciso da una persona resta finché il file non cambia
  if (vecchio?.esito === "Non da caricare" && (!file.md5 || !vecchio.md5 || vecchio.md5 === file.md5)) return { esito: "Non da caricare", motivo: vecchio.motivo };
  if (file.md5 && gia.impronte.has(file.md5)) return { esito: "Caricato", motivo: "impronta uguale a un file del programma" };
  const data = dataDelFile(file.percorso);
  if (data && data < DATA_PARTENZA && !/RAVV/i.test(file.percorso)) return { esito: "Storico", motivo: `data ${data.split("-").reverse().join("/")}, prima del ${DATA_PARTENZA.split("-").reverse().join("/")}` };
  // un file che il controllo non è riuscito a leggere resta «Da caricare» con il motivo (non si può dire niente del contenuto)
  if (file.illeggibile) return { esito: "Da caricare", motivo: file.motivoIlleggibile || "il file non si legge: forse non è scaricato dal cloud" };
  const chi = gia.nomi.get(base(file.percorso));
  if (chi) return { esito: "Caricato con lo stesso nome", motivo: !file.md5 ? `stesso nome di ${chi}; il file non è stato letto: da guardare`
    : gia.senzaImpronta?.has(base(file.percorso))
    ? `stesso nome di ${chi}, che nel programma è registrato senza impronta: non si sa se è lo stesso file, da guardare`
    : `stesso nome di ${chi}, ma il contenuto è diverso (impronta diversa): da guardare se è un'altra copia` };
  return { esito: "Da caricare", motivo: null };
}

// Riepilogo dell'ultimo controllo: i numeri che vanno nell'avviso
export function riepilogoControllo(righe, ultimo, oggi) {
  const per = Object.fromEntries(ESITI.map(e => [e, righe.filter(r => r.esito === e)]));
  const giorni = ultimo?.eseguito_il ? giorniTra(dataRoma(ultimo.eseguito_il), oggi) : null;
  return { daCaricare: per["Da caricare"], stessoNome: per["Caricato con lo stesso nome"], per, ultimo, giorni,
    vecchio: giorni === null || giorni > GIORNI_CONTROLLO_VECCHIO };
}
