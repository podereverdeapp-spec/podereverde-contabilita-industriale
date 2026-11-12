// Versione 370 — «Anticipi in attesa di fattura»: calcoli della scheda (nessuna scrittura qui).
// Decisioni del Dott. Bizzarri del 12/11/2026 (12:35, 12:50, 13:35, 13:45): l'anticipo resta aperto finché arriva la fattura;
// quando arriva, il programma la mette accanto; chi gestisce i conti la controlla e chiude; se non arriva, avviso.
// Termini (da confermare con lo Studio Cacurri): fattura entro 12 giorni dal pagamento (art. 6 c. 4 e art. 21 c. 4 DPR 633/72);
// se non arriva, segnalazione all'Agenzia con il codice TD29 entro 90 giorni da quel termine (art. 6 c. 8 D.Lgs. 471/97).

export const PAROLE_ANTICIPO = /\b(ACCONTO|ACC\.|ANTICIPO|PROFORMA|PRO-FORMA|PRO FORMA|PREVENTIVO|PREV\.|OFFERTA|ORDINE N)/i;
// per la PROPOSTA della voce nella conferma solo le parole che dicono «prima della fattura» (non «saldo ordine», «saldo preventivo»)
export const PAROLE_ANTICIPO_SICURE = /\b(ACCONTO|ANTICIPO|PROFORMA|PRO-FORMA|PRO FORMA)\b|\bACCONTO SU .*OFFERTA/i;
export const GIORNI_PRIMA_DEL_PAGAMENTO = 60;   // una fattura datata fino a 60 giorni prima del pagamento si propone lo stesso
export const GIORNI_AVVISO_SEGNALAZIONE = 30;   // il rosso «segnalazione» parte 30 giorni prima del termine

export const piuGiorni = (d, n) => { const x = new Date(`${String(d).slice(0, 10)}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const giorniTra = (a, b) => Math.round((Date.parse(`${String(b).slice(0, 10)}T12:00:00Z`) - Date.parse(`${String(a).slice(0, 10)}T12:00:00Z`)) / 86400000);
const pivaPulita = t => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^IT(?=\d{11}$)/, "");

// Le fatture da mettere accanto a un anticipo: dello stesso fornitore (scelto nell'anticipo, oppure riconosciuto dalla partita IVA),
// con un resto da pagare, non in attesa della banca, datate al massimo 60 giorni prima del pagamento, non scartate con «Non è questa»
// e non già agganciate a questo anticipo.
export function fattureCandidate(a, scadenze, fornitori, scarti, agganciate = []) {
  if (!a || a.stato !== "aperto") return [];
  const piva = pivaPulita(a.partita_iva);
  const idFornitori = new Set([a.fornitore_id, ...(piva ? fornitori.filter(f => pivaPulita(f.partita_iva) === piva).map(f => f.id) : [])].filter(Boolean));
  if (!idFornitori.size) return [];
  const scartate = new Set(scarti.filter(s => s.anticipo_id === a.anticipo_id).map(s => s.fattura_id));
  const gia = new Set(agganciate.map(x => x.scadenza_id));
  const dal = piuGiorni(a.data_pagamento, -GIORNI_PRIMA_DEL_PAGAMENTO);
  return scadenze.filter(s => s.lato === "fornitore" && idFornitori.has(s.fornitore_id) && Number(s.residuo) > 0.005 && Number(s.importo) > 0
      && !(Number(s.in_attesa_della_banca) > 0) && String(s.data_documento || "") >= dal && !(s.fattura_id && scartate.has(s.fattura_id)) && !gia.has(s.scadenza_id))
    .sort((x, y) => String(x.data_documento || "").localeCompare(String(y.data_documento || "")) || x.scadenza_id - y.scadenza_id);
}

// Lo stato da mostrare (colore e frase), dal più urgente
export function statoAnticipo(a, candidate, oggi) {
  if (a.stato === "chiuso" && a.tipo === "caparra") return { codice: "chiuso", nome: { imputata: "Imputata alla fattura", restituita: "Restituita", trattenuta: "Trattenuta (perdita)", restituita_doppio: "Restituita il doppio" }[a.esito] || "Chiusa", colore: a.esito === "trattenuta" ? "rosso" : "verde", testo: a.motivo_chiusura || (a.esito === "imputata" ? "Caparra entrata nella fattura della consegna" : "Chiusa") };
  if (a.stato === "chiuso") return { codice: "chiuso", nome: "Chiuso", colore: "verde", testo: a.motivo_chiusura ? `Chiuso: ${a.motivo_chiusura}` : "Chiuso: fattura controllata" };
  if (a.stato === "annullato") return { codice: "annullato", nome: "Annullato", colore: "grigio", testo: a.motivo_chiusura || "Annullato" };
  if (a.codice_attesa && !a.confermato_il) return { codice: "in banca", nome: "In attesa della banca", colore: "blu", testo: `Pagamento ${a.codice_attesa} disposto il ${dataIt(a.data_disposizione || a.data_pagamento)}: si controlla dopo l'addebito della banca` };
  const resto = Number(a.residuo);
  const parte = Number(a.abbinato) > 0.005;
  // versione 374 — caparra confirmatoria (decisioni del Dott. Bizzarri del 12/11/2026 ore 17:57 e 18:05): niente «fattura in ritardo» né TD29;
  // fino alla consegna prevista giallo, dopo arancione «consegna in ritardo»; arrivata la fattura, da controllare e chiudere come gli anticipi
  if (a.tipo === "caparra") {
    if (parte && Math.abs(resto) < 0.005) return { codice: "da chiudere", nome: "Coperta: da chiudere", colore: "azzurro", testo: "La fattura della consegna copre tutta la caparra: controllare (prezzo intero in fattura) e chiudere" };
    if (candidate.length) return { codice: "da controllare", nome: "Fattura arrivata: da controllare", colore: "azzurro", testo: `${candidate.length === 1 ? "1 fattura" : candidate.length + " fatture"} del fornitore da mettere accanto alla caparra e controllare` };
    if (!a.consegna_prevista) return { codice: "senza consegna", nome: "Caparra: manca la consegna prevista", colore: "arancione", testo: "Scrivere la data di consegna prevista (dal preventivo o chiedendo al fornitore)" };
    if (oggi > a.consegna_prevista) return { codice: "consegna in ritardo", nome: "Consegna in ritardo", colore: "arancione", testo: `La consegna era prevista entro il ${dataIt(a.consegna_prevista)} (${giorniTra(a.consegna_prevista, oggi)} giorni fa): chiedere al fornitore` };
    return { codice: "in attesa", nome: parte ? "Caparra coperta in parte" : "Caparra: consegna attesa", colore: "giallo", testo: `Caparra: consegna attesa entro il ${dataIt(a.consegna_prevista)}` };
  }
  const nota = candidate.length ? ` C'è ${candidate.length === 1 ? "1 fattura" : candidate.length + " fatture"} del fornitore da controllare accanto.` : "";
  // coperto del tutto: si chiude (le altre fatture aperte del fornitore non c'entrano)
  if (parte && Math.abs(resto) < 0.005) return { codice: "da chiudere", nome: "Coperto: da chiudere", colore: "azzurro", testo: "Le fatture agganciate coprono tutto l'anticipo: controllare e chiudere" };
  // il termine della segnalazione all'Agenzia viene prima di tutto: si vede anche se c'è una fattura da controllare
  const segnalaDal = piuGiorni(a.segnalazione_entro, -GIORNI_AVVISO_SEGNALAZIONE);
  const senza = parte ? ` per ${resto.toFixed(2).replace(".", ",")} €` : "";
  if (oggi > a.segnalazione_entro) return { codice: "segnalazione", nome: "Segnalazione all'Agenzia: termine passato", colore: "rosso", testo: `Senza fattura${senza}: il termine per la segnalazione TD29 è passato il ${dataIt(a.segnalazione_entro)} (da verificare subito con lo Studio).${nota}` };
  if (oggi >= segnalaDal) return { codice: "segnalazione", nome: "Segnalazione all'Agenzia", colore: "rosso", testo: `Senza fattura${senza}: segnalazione TD29 entro il ${dataIt(a.segnalazione_entro)} (termine da confermare con lo Studio).${nota}` };
  if (candidate.length) return { codice: "da controllare", nome: "Fattura arrivata: da controllare", colore: "azzurro", testo: `${candidate.length === 1 ? "1 fattura" : candidate.length + " fatture"} del fornitore da mettere accanto e controllare` };
  if (oggi > a.fattura_attesa_entro) return { codice: "in ritardo", nome: "Fattura in ritardo", colore: "rosso", testo: `La fattura doveva arrivare entro il ${dataIt(a.fattura_attesa_entro)} (${giorniTra(a.fattura_attesa_entro, oggi)} giorni fa; per un servizio può arrivare entro il 15 del mese dopo): chiederla al fornitore` };
  return { codice: "in attesa", nome: parte ? "Coperto in parte" : "In attesa della fattura", colore: "giallo", testo: `La fattura deve arrivare entro il ${dataIt(a.fattura_attesa_entro)}` };
}
export const dataIt = d => { const s = String(d || "").slice(0, 10); const [a, m, g] = s.split("-"); return g ? `${g}/${m}/${a}` : "—"; };

// Gli anticipi che chiedono un'azione (per il numero rosso nel menu e la striscia in alto)
export const DA_GUARDARE = new Set(["da controllare", "da chiudere", "in ritardo", "segnalazione", "consegna in ritardo", "senza consegna"]);
export const NOME_TIPO = { acconto: "Acconto su fattura da ricevere", caparra: "Caparra confirmatoria su preventivo" };   // versione 374

// Righe della banca del 2026 in uscita che sembrano anticipi e non hanno ancora un movimento confermato (da registrare in «Conferma dei movimenti»)
export function righeSospette(righe, confermate, documentiVivi) {
  return righe.filter(r => r.verso === "uscita" && String(r.data_contabile) >= "2026-01-01" && documentiVivi.has(r.documento_id) && !confermate.has(r.id)
    && /^(DISPOSIZIONE|BONIFICO)/i.test(String(r.descrizione || "")) && PAROLE_ANTICIPO.test(String(r.descrizione || "")))
    .sort((a, b) => String(a.data_contabile).localeCompare(String(b.data_contabile)) || a.id - b.id);
}

// Movimenti già in prima nota (gruppo Fatture, in uscita, senza fatture abbinate, non stornati) con le parole dell'anticipo nella causale:
// possono essere anticipi registrati come «Acconto su fattura» o «Saldo fattura» → «Segna come anticipo»
export function movimentiDaSegnare(movimenti, conAbbinamenti) {
  return movimenti.filter(m => m.verso === "uscita" && m.confermato_il && !m.stornato_il && m.natura !== "STORNO" && m.causale_gruppo === "Fatture"
    && m.causale_voce !== "Acconto su fattura da ricevere" && m.causale_voce !== "Caparra confirmatoria su preventivo" && !conAbbinamenti.has(m.id) && PAROLE_ANTICIPO.test(String(m.causale || "")))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)) || a.id - b.id);
}

// Causale del bonifico per un anticipo disposto dal programma («ACCONTO SU OFFERTA N. 12 DEL 10/11/2026»)
export function causaleAnticipo(tipo, numero, data) {
  const nome = { proforma: "PROFORMA", preventivo: "PREVENTIVO", offerta: "OFFERTA", ordine: "ORDINE", contratto: "CONTRATTO", altro: "DOCUMENTO" }[tipo] || "DOCUMENTO";
  return `ACCONTO SU ${nome}${numero ? " N. " + String(numero).trim() : ""}${data ? " DEL " + dataIt(data) : ""}`;
}
