// Versioni 354 e 356 — proposte del programma per la conferma dei movimenti della banca (il programma propone, l'operatore conferma:
// regola del Dott. Bizzarri del 09/11/2026 ore 17:00). Nessuna scrittura qui: solo calcolo.
export const MODALITA = ["Bonifico", "Bonifico istantaneo", "Assegno bancario", "Assegno circolare", "Contanti", "Carta di debito", "Carta di credito",
  "Carta prepagata", "Modello F24", "Bollettino", "Addebito diretto SEPA", "Addebito della banca", "Altro"];
export const NATURA = { "ADD.": "Addebito in banca", "ACCR.": "Accredito in banca", "PAG. CONT.": "Uscita di cassa", "INC. CONT.": "Entrata di cassa", "GIRO": "Giroconto", "STORNO": "Storno", "ALTRO": "Altro" };
export const natura = (tipoConto, verso, gruppo) => gruppo === "Giroconti" ? "GIRO" : gruppo === "Altre" ? "ALTRO"
  : tipoConto === "cassa" ? (verso === "uscita" ? "PAG. CONT." : "INC. CONT.") : (verso === "uscita" ? "ADD." : "ACCR.");

const MODALITA_DA_GENERE = { "bonifico fatto": "Bonifico", "bonifico ricevuto": "Bonifico", "assegno": "Assegno bancario", "assegno circolare": "Assegno circolare",
  "carta di debito": "Carta di debito", "bollettino CBILL": "Bollettino", "contanti": "Contanti" };

// proposta per un movimento già nel programma (oggi: pagamenti e incassi di fatture)
export function propostaPerMovimento(m) {
  const t = String(m.causale || "").toUpperCase();
  const voce = /ACCONTO/.test(t) ? "Acconto su fattura" : /RITENUTA/.test(t) ? "Saldo con ritenuta d'acconto" : /NOTA DI CREDITO|N\.C\./.test(t) ? "Saldo al netto di nota di credito" : "Saldo fattura";
  const modalita = m.istantaneo ? "Bonifico istantaneo" : (MODALITA_DA_GENERE[m.genere] || null);
  return { causale_gruppo: m.causale_gruppo || "Fatture", causale_voce: m.causale_voce || voce, modalita: m.modalita || modalita, controparte: m.controparte || "" };
}

// proposta per una riga della banca che non ha nessun movimento nel programma
export function propostaPerRiga(r, conto, movimenti) {
  const d = String(r.descrizione || ""); const D = d.toUpperCase();
  const banca = conto.banca_o_emittente || conto.nome;
  const p = { causale_gruppo: "", causale_voce: "", modalita: "", controparte: r.controparte || "", movimento_collegato_id: null, perche: "" };
  const set = (g, v, mo, sogg, perche) => Object.assign(p, { causale_gruppo: g, causale_voce: v, modalita: mo, controparte: sogg ?? p.controparte, perche });
  if (/^(COMMISSIONI|COMM\.)/.test(D)) {
    set("Banca", "Commissione", "Addebito della banca", banca, "commissione della banca");
    const num = String(r.numero_bonifico || "");
    const m = num && movimenti.find(x => x.numero_bonifico && (num === x.numero_bonifico || num.startsWith(String(x.numero_bonifico).split("-")[0])));
    if (m) { p.movimento_collegato_id = m.id; p.perche += ` del bonifico del movimento n. ${m.id}`; }
  } else if (/^(CANONE|SPESE )/.test(D)) set("Banca", "Canone e spese", "Addebito della banca", banca, "canone o spese della banca");
  else if (/IMPOSTA DI BOLLO|ADDEBITO BOLLO/.test(D)) set("Banca", "Imposta di bollo", "Addebito della banca", banca, "imposta di bollo");
  else if (/^(INTERESSI|COMPETENZE)/.test(D)) set("Banca", r.verso === "uscita" ? "Interessi passivi" : "Interessi attivi e accrediti", r.verso === "uscita" ? "Addebito della banca" : "", banca, "interessi o competenze");
  else if (/^PAGAM\.? DELEGA|^DELEGA F24|^PAGAMENTO F24/.test(D) && r.verso === "uscita") set("Tributi", "Versamento F24", "Modello F24", "Agenzia delle Entrate", "delega F24");
  else if (/RIC\.?\s?PREP/.test(D)) set("Giroconti", "Ricarica carta prepagata", "Carta prepagata", r.verso === "uscita" ? "Ricarica della carta prepagata 8006" : "Ricarica dal conto BPER 2923", "ricarica della carta prepagata");
  else if (/^PRELIEVO/.test(D)) set("Giroconti", "Prelievo di contanti", "Carta di debito", "Prelievo allo sportello automatico", "prelievo di contanti");
  else if (/^DISPOSIZIONE/.test(D) && r.verso === "uscita") {
    const mo = /ISTANTANEO/.test(D) ? "Bonifico istantaneo" : "Bonifico";
    // la voce si propone solo quando la causale del bonifico la dice con parole chiare; il gruppo e la voce restano da controllare
    if (/\bSTIPENDIO\b/.test(D)) set("Personale", "Stipendio", mo, null, "bonifico fatto in banca e non registrato nel programma: la causale dice «stipendio»");
    else if (/\bCOMPENSO\b/.test(D)) set("Personale", "Compenso", mo, null, "bonifico fatto in banca e non registrato nel programma: la causale dice «compenso»");
    else if (/FINANZIAMENTO SOCI/.test(D)) set("Soci", "", mo, null, "bonifico con causale «finanziamento soci»: scegliere la voce");
    else set("Fatture", /ACCONTO/.test(D) ? "Acconto su fattura" : "", mo, null,
      "bonifico fatto in banca e non registrato nel programma: scegliere la voce; se paga una fattura, dopo la conferma abbinarlo alla fattura (pagina degli abbinamenti) perché lo scadenzario si aggiorni");
  }
  else if (/^BONIFICO/.test(D) && r.verso === "entrata") {
    if (/AGEA/.test(D)) set("Contributi", "", "Bonifico", r.controparte || "AGEA", "bonifico AGEA: scegliere la voce del contributo");
    else if (/FINANZIAMENTO SOCI/.test(D)) set("Soci", "", "Bonifico", null, "bonifico ricevuto con causale «finanziamento soci»: scegliere la voce");
    else set("Fatture", /ACCONTO/.test(D) ? "Acconto su fattura" : "", "Bonifico", null,
      "incasso non registrato nel programma: scegliere la voce; se incassa una fattura, dopo la conferma abbinarlo alla fattura perché lo scadenzario si aggiorni");
  } else if (/CBILL/.test(D)) set("", "", "Bollettino", null, "bollettino: scegliere gruppo e voce");
  else if (conto.tipo === "carta prepagata" || conto.tipo === "carta di credito") {
    const negozio = d.replace(/\s+(VIA|VIALE|PIAZZA|LARGO|CORSO|STRADA|LOC\.)\b.*$/i, "").replace(/\s+\d.*$/, "").trim();
    set("", "", conto.tipo === "carta prepagata" ? "Carta prepagata" : "Carta di credito", negozio || d, "spesa con la carta: scegliere gruppo e voce e collegare lo scontrino o la fattura");
  } else if (/CIRCUITO INTERNAZIONALE|OPERAZIONE CARTA/.test(D)) set("", "", "Carta di debito", null, "pagamento con la carta di debito: scegliere gruppo e voce");
  else p.perche = "niente riconosciuto: scegliere tutto";
  p.livello = p.causale_gruppo && p.causale_voce && p.modalita && p.controparte ? "completa" : p.causale_gruppo || p.modalita ? "parziale" : "da classificare";
  return p;
}

// abbinamento righe della banca ↔ movimenti già nel programma: stesso conto, verso, importo; data = contabile o valuta.
// Versione 357: un movimento disposto dal programma (codice di attesa P-0001) si cerca con una tolleranza sulla data: la banca addebita
// di norma il giorno stesso o quello dopo (D.Lgs. 11/2010); si accetta dalla data di disposizione meno 2 giorni a più 15 giorni.
// Se più righe o più disposizioni sono possibili, decide l'operatore («da scegliere»).
const giorniTra = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
export const dentroTolleranza = (m, r) => {
  if (!m.codice_attesa) return m.data === r.data_contabile || (r.data_valuta && m.data === r.data_valuta);
  const d = giorniTra(m.data_disposizione || m.data, r.data_contabile);
  return d >= -2 && d <= 15;
};
export function abbina(righe, movimenti) {
  const liberiM = movimenti.filter(m => !m.riga_fonte_id && !m.confermato_il);
  const chiave = (c, v, i) => `${c}|${v}|${Number(i).toFixed(2)}`;
  const perChiave = new Map();
  for (const m of liberiM) { const k = chiave(m.conto_id, m.verso, m.importo); (perChiave.get(k) || perChiave.set(k, []).get(k)).push(m); }
  const candidati = new Map(); const usatiDa = new Map();
  for (const r of righe) {
    const lista = (perChiave.get(chiave(r.conto_id, r.verso, r.importo)) || []).filter(m => dentroTolleranza(m, r));
    candidati.set(r.id, lista);
    for (const m of lista) (usatiDa.get(m.id) || usatiDa.set(m.id, []).get(m.id)).push(r.id);
  }
  const esito = new Map();
  for (const r of righe) {
    const lista = candidati.get(r.id);
    if (!lista.length) { esito.set(r.id, { tipo: "senza movimento" }); continue; }
    const univoca = lista.length === 1 && usatiDa.get(lista[0].id).length === 1;
    esito.set(r.id, { tipo: univoca ? "univoca" : "da scegliere", candidati: lista });
  }
  return esito;
}

// ---- Versione 357: soggetto e fatture aperte per una riga della banca senza movimento ----
// Il nome dell'ordinante o del beneficiario (colonna «controparte» della riga, oppure «a favore di … EUR» nella descrizione)
// si confronta con l'anagrafica parola per parola, senza forme societarie e parole brevi. Proposta, mai decisione.
const FORME = new Set(["SRL", "SRLS", "SPA", "SAS", "SNC", "SCA", "SCARL", "SOC", "SOCIETA", "COOP", "COOPERATIVA", "AGRICOLA", "AZIENDA", "DITTA", "INDIVIDUALE",
  "DEI", "DEL", "DELLA", "DELLE", "DI", "DA", "E", "C", "F", "LLI", "FLLI", "STABILE", "ORGANIZZAZIONE", "SEDE", "SECONDARIA", "ITALIA", "SERVIZI", "SEMPLIFICATA"]);
export const parole = t => String(t || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/S\.?\s?R\.?\s?L\.?/g, " SRL ")
  .replace(/[^A-Z0-9]+/g, " ").split(" ").filter(w => w.length >= 4 && !FORME.has(w));
export const nomeDellaRiga = r => {
  if (r.controparte) return r.controparte;
  const m = /a favore di (.+?) EUR /i.exec(r.descrizione || "") || /o\/c:\s*(.+?) ABI-CAB/i.exec(r.descrizione || "");
  return m ? m[1] : "";
};
export function soggettoPerNome(nome, anagrafica) {
  const p = new Set(parole(nome)); if (!p.size) return null;
  let migliore = null, punti = 0;
  for (const a of anagrafica) {
    const q = parole(a.nome); if (!q.length) continue;
    const comuni = q.filter(w => p.has(w)).length; const s = comuni / Math.max(q.length, 1);
    // almeno due parole in comune, oppure tutte le parole di un nome di una parola sola («MARTENS»)
    if (comuni && (comuni >= 2 || q.length === 1) && s > punti) { punti = s; migliore = a; }
  }
  return punti >= 0.5 ? migliore : null;
}
// fatture aperte del soggetto che la riga può chiudere: una con resto uguale, oppure tutte insieme se la somma torna;
// la fattura deve avere data non successiva al giorno della banca (un pagamento non chiude una fattura emessa dopo)
export function fatturePerRiga(r, aperte, soggettoId) {
  const lato = r.verso === "uscita" ? "fornitore" : "cliente";
  const sue = aperte.filter(s => s.lato === lato && (lato === "fornitore" ? s.fornitore_id : s.cliente_id) === soggettoId
    && s.data_documento <= r.data_contabile && Number(s.residuo) > 0.005 && !(Number(s.in_attesa_della_banca) > 0));
  const imp = Number(r.importo);
  const una = sue.filter(s => Math.abs(Number(s.residuo) - imp) < 0.005);
  if (una.length === 1) return { scelte: [una[0].scadenza_id], perche: "una fattura aperta del soggetto con lo stesso resto" };
  // il numero della fattura scritto nella descrizione della banca
  const D = String(r.descrizione || "").toUpperCase();
  const perNumero = sue.filter(s => s.numero_documento && D.includes(String(s.numero_documento).toUpperCase()));
  const somma = l => l.reduce((t, s) => t + Number(s.residuo), 0);
  if (perNumero.length && Math.abs(somma(perNumero) - imp) < 0.005) return { scelte: perNumero.map(s => s.scadenza_id), perche: "fatture citate nella causale della banca, somma uguale" };
  if (sue.length > 1 && sue.length <= 12 && Math.abs(somma(sue) - imp) < 0.005) return { scelte: sue.map(s => s.scadenza_id), perche: "tutte le fatture aperte del soggetto, somma uguale" };
  return { scelte: [], perche: sue.length ? "fatture aperte del soggetto: scegliere quelle pagate con questo movimento" : "nessuna fattura aperta del soggetto prima di questa data" };
}
