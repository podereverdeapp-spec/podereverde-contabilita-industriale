// Versione 362 (11/11/2026, ordini del Dott. Bizzarri delle 12:52 e delle 13:07): «Consulta F24».
// Per ogni F24: come è stato pagato (banca o compensazione con i crediti), la data del pagamento e le prove
// (la pagina dell'estratto conto con l'addebito, la quietanza). Qui solo calcolo, nessuna scrittura.
// Le regole per riconoscere il pagamento in banca NON sono nuove: sono quelle della versione 355 (abbinaPagamenti),
// così la consultazione e la pagina «Chiusura» dicono sempre la stessa cosa.
import { abbinaPagamenti, eRigaF24, GIORNI_PRIMA } from "./calcoloPagamentiF24";

// Nuovo tipo di file nell'archivio F24 (SQL della versione 362): la pagina dell'estratto conto con l'addebito
export const COSA_ESTRATTO = "Pagina dell'estratto conto";
// La cartella dell'archivio F24 è stata spostata il 03/11/2026 in 00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE: 104 caratteri
export const BASE_ARCHIVIO_F24 = "Z:\\SOCIETA\\SOCIETA' AGRICOLA PODERE VERDE A R.L\\00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE\\F24\\ARCHIVIO\\";
export const LIMITE_FINALE = 250;        // percorso completo del file con il suo nome
export const LIMITE_PROVVISORIO = 259;   // percorso completo durante la scrittura (Windows si ferma a 260)
export const NOME_PROVVISORIO_ESEMPIO = "PROVV 123456789.pdf";   // 19 caratteri: la lunghezza del nome provvisorio usato

const it = d => { const [a, m, g] = String(d || "").slice(0, 10).split("-"); return g ? `${g}/${m}/${a}` : "—"; };
const cent = v => Math.round(Math.abs(Number(v) || 0) * 100);
const cartellaDi = p => String(p || "").split("\\").slice(0, -1).join("\\");
export const nomeAllegatoEstratto = riga => `ESTRATTO CONTO ${riga.data_contabile}.pdf`;

// Lunghezze del percorso per scrivere la pagina dell'estratto nella cartella di un F24 dell'archivio
export function lunghezze(cartella, nome) {
  return { finale: BASE_ARCHIVIO_F24.length + cartella.length + 1 + nome.length,
    provvisorio: BASE_ARCHIVIO_F24.length + cartella.length + 1 + NOME_PROVVISORIO_ESEMPIO.length };
}

// dati: { f24, righeTributo, fileArchivio, righeBanca (tutte le righe, anche entrate), documenti (estratti), bancheArchivio: Map impronta→percorso,
//         conti: { id: nome }, lavori: [{ id, stato, file_lettura }], oggi }
export function consulta(dati) {
  const { f24, righeTributo = [], fileArchivio = [], righeBanca = [], documenti = [], bancheArchivio = new Map(), conti = {}, lavori = [], oggi } = dati;
  const docVivi = new Map(documenti.filter(d => !d.annullato_il).map(d => [d.id, d]));
  const tutteVive = righeBanca.filter(r => docVivi.has(r.documento_id));
  const rigaPerId = new Map(righeBanca.map(r => [String(r.id), r]));
  // Come nella pagina «Chiusura» (PagamentiF24.jsx): una riga collegata che è di un estratto eliminato resta valida se l'estratto
  // ricaricato ha la stessa riga (conto, data, importo, descrizione); la riga gemella si usa al suo posto e non si offre ad altri F24.
  const chiave = x => `${x.conto_id}|${x.data_contabile}|${Math.round(Number(x.importo) * 100)}|${String(x.descrizione || "").trim()}`;
  const collegate = new Set(f24.filter(f => f.riga_fonte_id != null).map(f => String(f.riga_fonte_id)));
  const perChiave = new Map(); tutteVive.forEach(x => { const k = chiave(x); if (!perChiave.has(k)) perChiave.set(k, []); perChiave.get(k).push(x); });
  const gemellaDi = new Map(), gemelleUsate = new Set();
  for (const x of righeBanca) {
    if (docVivi.has(x.documento_id) || !collegate.has(String(x.id))) continue;
    const g = (perChiave.get(chiave(x)) || []).find(y => !gemelleUsate.has(String(y.id)) && !collegate.has(String(y.id)));
    if (g) { gemelleUsate.add(String(g.id)); gemellaDi.set(String(x.id), g); }
  }
  const righeVive = tutteVive.filter(r => !gemelleUsate.has(String(r.id)));
  // copertura: l'ultimo giorno caricato del conto meno aggiornato (come nella pagina «Chiusura»)
  const perConto = {};
  righeVive.forEach(r => { if (!perConto[r.conto_id] || r.data_contabile > perConto[r.conto_id]) perConto[r.conto_id] = r.data_contabile; });
  const date = Object.values(perConto);
  // versione 363: chi passa solo una parte delle righe (gli avvisi in alto) dà la copertura già calcolata su tutte le righe
  const coperturaFino = dati.coperturaFino !== undefined ? dati.coperturaFino : (date.length ? date.reduce((m, x) => (x < m ? x : m)) : null);
  const righeDaGuardare = {};
  for (const f of f24) if (f.riga_fonte_id != null) {
    const r = rigaPerId.get(String(f.riga_fonte_id));
    if (!r) righeDaGuardare[String(f.riga_fonte_id)] = "non si trova più fra le righe della banca";
    else if (!docVivi.has(r.documento_id) && !gemellaDi.has(String(r.id))) righeDaGuardare[String(f.riga_fonte_id)] = "è di un estratto eliminato e nell'estratto ricaricato non c'è la stessa riga";
  }
  const stati = new Map(abbinaPagamenti({ f24, righe: righeVive.filter(r => r.verso === "uscita"), coperturaFino, oggi, righeDaGuardare }).map(s => [s.id, s]));
  const lavoriAperti = new Map(lavori.filter(l => l.stato === "Aperto").map(l => [l.id, l]));

  const estrattoDi = riga => {
    if (!riga) return null;
    const doc = docVivi.get(riga.documento_id) || documenti.find(d => d.id === riga.documento_id) || null;
    const imp = doc ? (doc.pdf_impronta || doc.file_digitale_impronta) : null;
    return { riga, documento: doc, pagina: riga.pagina_pdf || 1, percorso: imp ? bancheArchivio.get(imp) || null : null,
      conto: conti[riga.conto_id] || `conto ${riga.conto_id}`, eliminato: doc ? !!doc.annullato_il : true };
  };

  const elenco = f24.map(f => {
    const s = stati.get(f.id) || { esito: f.stato === "Sostituito" ? "sostituito" : "?", motivo: "", proposta: null, candidati: [] };
    const saldoZero = cent(f.saldo) === 0;
    const rigaOriginale = f.riga_fonte_id != null ? rigaPerId.get(String(f.riga_fonte_id)) || null : null;
    const rigaCollegata = rigaOriginale ? gemellaDi.get(String(rigaOriginale.id)) || rigaOriginale : null;   // con l'estratto ricaricato: la riga gemella
    const rigaProposta = !rigaCollegata && s.proposta && (s.esito === "da-collegare" || s.esito === "proposta") ? s.proposta : null;
    let come, dataPagamento = f.data_pagamento || null, daConfermare = false, colore = "grigio";
    if (f.stato === "Sostituito") { come = "Sostituito: non si paga"; colore = "grigio"; }
    else if (f.stato === "Pagato") {
      if (rigaCollegata) { come = `Banca: ${conti[rigaCollegata.conto_id] || "conto " + rigaCollegata.conto_id}`; colore = righeDaGuardare[String(f.riga_fonte_id)] ? "arancione" : "verde"; }
      else if (saldoZero) { come = "Compensazione con i crediti (nessun addebito in banca)"; colore = "verde"; }
      else if (rigaProposta) { come = `Banca: ${conti[rigaProposta.conto_id] || "conto " + rigaProposta.conto_id} (riga trovata, da collegare)`; daConfermare = true; colore = "arancione"; }
      else { come = "Pagato, senza la riga della banca"; colore = "arancione"; }
    } else {
      // stesse conclusioni della pagina «Chiusura»: si dice «non pagato» solo quando lo dice lei (esito «scaduto-non-pagato»)
      const scaduto = f.data_scadenza && f.data_scadenza < oggi;
      if (rigaProposta) { come = `Banca: ${conti[rigaProposta.conto_id] || "conto " + rigaProposta.conto_id} — pagato secondo l'estratto, da confermare`; dataPagamento = rigaProposta.data_contabile; daConfermare = true; colore = "arancione"; }
      else if (saldoZero) { come = scaduto ? "Saldo zero: da presentare; senza la quietanza non risulta presentato" : `Saldo zero: da presentare entro il ${it(f.data_scadenza)}`; colore = scaduto ? "arancione" : "grigio"; }
      else if (s.esito === "scaduto-non-pagato") { come = "Non pagato: in banca non c'è l'addebito"; colore = "rosso"; }
      else if (s.esito === "attesa-estratto") { come = "Scaduto: l'estratto della banca non è ancora caricato oltre la scadenza"; colore = "arancione"; }
      else if (s.esito === "ritardo") { come = "In banca c'è un'uscita F24 dello stesso importo dopo la scadenza: da scegliere nella «Chiusura»"; colore = "arancione"; }
      else if (s.esito === "scegliere") { come = "In banca ci sono più righe possibili: da scegliere nella «Chiusura»"; colore = "arancione"; }
      else if (s.esito === "senza-scadenza") { come = "Senza data di scadenza nel programma: da guardare"; colore = "arancione"; }
      else { come = scaduto ? "Scaduto: da guardare" : `Da pagare entro il ${it(f.data_scadenza)}`; colore = scaduto ? "arancione" : "grigio"; }
    }
    const file = fileArchivio.filter(x => x.f24_id === f.id && !x.superato);
    const fileF24 = file.filter(x => x.cosa === "F24");
    const quietanze = file.filter(x => x.cosa === "Quietanza");
    const allegati = file.filter(x => x.cosa === COSA_ESTRATTO);
    // pagato con i crediti: la prova è la quietanza; se non c'è, la riga è arancione
    if (f.stato === "Pagato" && saldoZero && !f.md5_quietanza && !quietanze.length) colore = "arancione";
    const cartelle = [...new Set(fileF24.map(x => cartellaDi(x.percorso)))].map(c => ({ cartella: c, categoria: fileF24.find(x => cartellaDi(x.percorso) === c).cartella }));
    const estratto = estrattoDi(rigaCollegata || rigaProposta);
    const lavoro = f.lavoro_id != null ? lavoriAperti.get(f.lavoro_id) : null;
    const avvisi = [];
    if (lavoro) avvisi.push(`la lettura «${lavoro.file_lettura}» non è ancora archiviata: il PDF e la quietanza sono in F24\\PROGRAMMA\\DA SMISTARE`);
    if (f.stato === "Pagato" && !saldoZero && !rigaCollegata && !rigaProposta) avvisi.push(s.motivo);
    if (rigaCollegata && righeDaGuardare[String(f.riga_fonte_id)]) avvisi.push(`la riga della banca collegata ${righeDaGuardare[String(f.riga_fonte_id)]}`);
    if (f.stato === "Pagato" && saldoZero && !f.md5_quietanza && !quietanze.length) avvisi.push("la quietanza non è nel programma né nell'archivio");
    if (f.stato !== "Pagato" && f.stato !== "Sostituito" && s.motivo && !rigaProposta) avvisi.push(`Chiusura: ${s.motivo}`);
    if (estratto && !estratto.percorso) avvisi.push("l'estratto conto di questo addebito non è nell'archivio BANCHE");
    // allegare la pagina: solo con il pagamento confermato (riga collegata), un estratto nell'archivio e l'F24 nell'archivio
    const daAllegare = !!(rigaCollegata && estratto?.percorso && !estratto.eliminato && cartelle.length)
      ? cartelle.filter(c => !allegati.some(a => cartellaDi(a.percorso) === c.cartella)) : [];
    return { ...f, esito: s.esito, motivo: s.motivo, come, colore, dataPagamento, daConfermare, rigaCollegata, rigaProposta, estratto,
      fileF24, quietanze, allegati, cartelle, daAllegare, avvisi, righe: righeTributo.filter(r => r.f24_id === f.id).sort((a, b) => (a.numero_riga || 0) - (b.numero_riga || 0)),
      anno: f.data_scadenza ? f.data_scadenza.slice(0, 4) : "senza scadenza" };
  });

  // Pagamenti di F24 in banca che non corrispondono a nessun F24 del programma (dal primo F24 del programma, meno 15 giorni)
  const primo = f24.map(f => f.data_scadenza).filter(Boolean).sort()[0] || null;
  const daQuando = primo ? (() => { const x = new Date(primo + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() - GIORNI_PRIMA); return x.toISOString().slice(0, 10); })() : null;
  const usate = new Set();
  elenco.forEach(f => { if (f.rigaCollegata) usate.add(String(f.rigaCollegata.id)); if (f.rigaProposta) usate.add(String(f.rigaProposta.id)); });
  [...stati.values()].forEach(s => (s.candidati || []).forEach(r => usate.add(String(r.id))));
  const senzaF24 = daQuando ? righeVive.filter(r => r.verso === "uscita" && eRigaF24(r.descrizione) && r.data_contabile >= daQuando && !usate.has(String(r.id)))
    .sort((a, b) => a.data_contabile.localeCompare(b.data_contabile)).map(r => ({ ...r, estratto: estrattoDi(r) })) : [];

  return { elenco, senzaF24, daQuando, coperturaFino };
}

// Totali per anno della scadenza: quanti F24, debito, credito, saldo; e per trattamento (dalle righe dei codici)
export function totaliPerAnno(elenco) {
  const out = {};
  for (const f of elenco) {
    if (f.stato === "Sostituito") continue;
    const a = out[f.anno] = out[f.anno] || { anno: f.anno, numero: 0, debito: 0, credito: 0, saldo: 0, pagatoSaldo: 0, pagatoCompensazione: 0, daPagare: 0, perTrattamento: {} };
    a.numero++; a.debito += Number(f.totale_debito) || 0; a.credito += Number(f.totale_credito) || 0; a.saldo += Number(f.saldo) || 0;
    if (f.stato === "Pagato") { if (cent(f.saldo)) a.pagatoSaldo += Number(f.saldo); else a.pagatoCompensazione++; } else a.daPagare += Number(f.saldo) || 0;
    for (const r of f.righe) {
      const t = String(r.trattamento || "Da decidere").split(":")[0].trim() || "Da decidere";
      const x = a.perTrattamento[t] = a.perTrattamento[t] || { debito: 0, credito: 0 };
      x.debito += Number(r.importo_debito) || 0; x.credito += Number(r.importo_credito) || 0;
    }
  }
  return Object.values(out).sort((a, b) => String(b.anno).localeCompare(String(a.anno)));
}

// Testo per la ricerca libera: oggetto, codice delega, codici tributo, importi
export function corrisponde(f, testo) {
  const t = String(testo || "").trim().toLowerCase();
  if (!t) return true;
  const num = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  if (/^[\d.,]+$/.test(t) && !Number.isNaN(num) && [f.saldo, f.totale_debito, f.totale_credito].some(v => Math.abs(Number(v) - num) < 0.005)) return true;
  return [f.oggetto, f.codice_delega, f.come, f.nome_file_ricevuto, it(f.data_scadenza), it(f.dataPagamento), ...f.righe.map(r => r.codice_tributo), ...f.righe.map(r => r.descrizione_codice)]
    .some(v => String(v || "").toLowerCase().includes(t));
}
