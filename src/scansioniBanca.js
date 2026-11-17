// Versione 386 (Tenente, 16/11/2026) — lettura dei documenti della banca da testo: distinte BPER (Smart CBI) e righe di una
// scansione. Solo calcolo, non scrive niente. Il testo arriva dalla lettura ottica (scansioni e foto) oppure da un PDF digitale.
// Regola del Dott. Bizzarri (16/11, 14:51–15:26): quello che il programma legge da una scansione è una PROPOSTA; ogni campo lo
// conferma una persona; una causale scritta a mano la scrive la persona. Qui ogni valore porta «sicuro: true/false».

// «2.046,72» → 2046.72 ; «-214 44€» → 214.44 non sicuro (manca la virgola) ; niente → null
export function numeroIt(testo) {
  const t = String(testo || "").replace(/[€\s]+$/g, "").trim();
  let m = t.match(/^[-+]?\s*(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/);
  if (m) return { valore: Number(m[1].replace(/\./g, "") + "." + m[2]), sicuro: true, negativo: /^-/.test(t) };
  m = t.match(/^[-+]?\s*(\d{1,3}(?:\.\d{3})*|\d+)[ .](\d{2})$/);
  if (m) return { valore: Number(m[1].replace(/\./g, "") + "." + m[2]), sicuro: false, negativo: /^-/.test(t) };
  return null;
}
const IMPORTO = /-?\s?\d{1,3}(?:\.\d{3})*,\d{2}|-?\s?\d+,\d{2}/g;

// date: 08/01/26, 08/01/2026, 20260326, 2026-03-26 → «2026-01-08»
export function dataIso(testo) {
  const t = String(testo || "").trim();
  let m = t.match(/^(\d{2})[/.-](\d{2})[/.-](\d{2}|\d{4})$/);
  let a, mm, g;
  if (m) { g = +m[1]; mm = +m[2]; a = m[3].length === 2 ? (+m[3] <= 79 ? 2000 : 1900) + +m[3] : +m[3]; }   // «99» è il 1999 (rifiutato), non il 2099
  else if ((m = t.match(/^(20\d{2})(\d{2})(\d{2})$/)) || (m = t.match(/^(20\d{2})-(\d{2})-(\d{2})$/))) { a = +m[1]; mm = +m[2]; g = +m[3]; }
  else return null;
  const d = new Date(Date.UTC(a, mm - 1, g));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== g || a < 2000 || a > 2100) return null;
  return d.toISOString().slice(0, 10);
}
const DATA_IN_RIGA = /\b(\d{2}[/.]\d{2}[/.](?:\d{4}|\d{2}))\b|\b(20\d{6})\b/;

const righeDi = testo => String(testo || "").split(/\r?\n/).map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const pulisciIban = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^1T/, "IT").replace(/^LT(?=\d{2})/, "IT");
export function ibanValido(iban) {
  const s = pulisciIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  if (s.startsWith("IT") && s.length !== 27) return false;
  const r = s.slice(4) + s.slice(0, 4);
  let resto = 0;
  for (const c of r) { const v = /\d/.test(c) ? c : String(c.charCodeAt(0) - 55); for (const d of v) resto = (resto * 10 + +d) % 97; }
  return resto === 1;
}

// Parole con cui comincia di solito una causale: servono a separare il beneficiario dalla causale sulla stessa riga
const INIZIO_CAUSALE = /\b(SALDO|ACCONTO|PAGAMENTO|PAG\.?|FATTURA|FATT\.?|FT\.?|RIF\.?|STIPENDIO|RIMBORSO|CANONE|RATA|BONIFICO|NS\.?|VS\.?)\b/i;

// ── Distinte BPER Smart CBI ──────────────────────────────────────────────────────────────────────
// Modelli visti il 16/11/2026 sulle due scansioni del Dottore (Veronesi srl):
//   «Smart CBI Distinta SEPA Credit Transfer»  e  «Smart CBI Storico Disp. BPER» (bonifico istantaneo).
// Esito: { modello, data, totale, numeroBonifici, riferimento, righe: [{ beneficiario, iban, importo, causale, esito, cro, data_esecuzione,
//          sicuri: { campo: true/false } }], avvisi: [] } oppure null se il testo non è una distinta conosciuta.
export function leggiDistinta(testo) {
  const r = righeDi(testo); const tutto = r.join("\n");
  if (/Distinta\s+SEPA\s+Credit\s+Transfer/i.test(tutto)) return distintaSepa(r);
  if (/Storico\s+Disp/i.test(tutto) && /Smart\s*CBI/i.test(tutto)) return storicoDisposizioni(r);
  return null;
}
// Nome per il confronto, uguale a ci_nome_confronto del database: maiuscole, senza accenti né punteggiatura, senza forme societarie
export function nomeConfronto(t) {
  const a = String(t ?? "").toUpperCase().replace(/[ÀÁÂÃÄÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑ]/g, c => "AAAAAEEEEIIIIOOOOOUUUUCN"["ÀÁÂÃÄÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑ".indexOf(c)]);
  return a.replace(/[^A-Z0-9]+/g, " ").replace(/\b(S R L S|S R L|S P A|S A S|S N C|SRLS|SRL|SPA|SAS|SNC|SOC|SOCIETA)\b/g, " ").replace(/[^A-Z0-9]/g, "");
}
// I bonifici di una distinta come elenco ordinato «nome|centesimi»: due distinte sono la stessa se l'elenco è uguale (come nel database)
export const chiaveBonifici = righe => (righe || []).map(r => `${nomeConfronto(r.beneficiario)}|${Math.round(Number(r.importo) * 100)}`).sort().join(";");

export const sembraDistinta = testo => /Smart\s*CBI/i.test(testo) && /(Distinta\s+SEPA|Storico\s+Disp)/i.test(testo);

function distintaSepa(r) {
  const avvisi = [];
  const trova = re => { for (const x of r) { const m = x.match(re); if (m) return m; } return null; };
  const mEsec = trova(/Data\s+esecuzione\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/i);
  const mTot = trova(/Totale\s+distinta\s*:?\s*([\d.]+,\d{2})\s*euro\s*\((\d+)\s*disp/i);
  const mMsg = trova(/Msg\s*[I1l]d\s*:?.*?(SCT[\w-]+)/i) || trova(/\b(SCT\d{6}-\d+)\b/);
  const data = mEsec ? dataIso(mEsec[1]) : null;
  const totale = mTot ? numeroIt(mTot[1]) : null;
  const numero = mTot ? +mTot[2] : null;
  const righe = [];
  // la tabella comincia dopo l'intestazione «Beneficiario … Importo …» e «IBAN creditore»
  let i = r.findIndex(x => /^Beneficiario\b.*\bImporto\b/i.test(x));
  if (i >= 0) { i++; if (r[i] && /^IBAN\s+creditore/i.test(r[i])) i++; }
  for (; i >= 0 && i < r.length; i++) {
    const x = r[i];
    const imp = [...x.matchAll(IMPORTO)].map(m => m[0]);
    if (!imp.length) continue;
    const valore = numeroIt(imp[imp.length - 1].replace(/\s/g, ""));
    const prima = x.slice(0, x.lastIndexOf(imp[imp.length - 1])).replace(/\s+(SUPP|CORE|B2B|SEPA)\s*$/i, "").trim();
    const k = prima.search(INIZIO_CAUSALE);
    const beneficiario = (k > 0 ? prima.slice(0, k) : prima).trim();
    const causale = k > 0 ? prima.slice(k).trim() : "";
    // la riga sotto: IBAN del beneficiario ed esito
    const sotto = r[i + 1] || "";
    const mIban = sotto.match(/^([A-Z1l]{2}\s?\d{2}[A-Z0-9 ]{11,40}?)\s+(Inviata|Accettata|Rifiutata|Eseguita|Consegnata|Respinta)?\s*$/i) || sotto.match(/^([A-Z1l]{2}\d{2}[A-Z0-9 ]{11,40})/i);
    const iban = mIban ? pulisciIban(mIban[1]) : "";
    const esitoTesto = (sotto.match(/(Inviata|Accettata|Rifiutata|Eseguita|Consegnata|Respinta)/i) || [])[1] || "";
    righe.push({ beneficiario, causale, iban, importo: valore?.valore ?? null, esitoBanca: esitoTesto, esito: esitoDa(esitoTesto), cro: "", data_esecuzione: data,
      sicuri: { beneficiario: !!beneficiario && k > 0, causale: !!causale, iban: ibanValido(iban), importo: !!valore?.sicuro, data_esecuzione: !!data } });
    if (mIban) i++;
  }
  if (numero != null && numero !== righe.length) avvisi.push(`la distinta dice ${numero} disposizioni, ne ho lette ${righe.length}`);
  const somma = Math.round(righe.reduce((t, x) => t + (x.importo || 0) * 100, 0));
  if (totale && somma !== Math.round(totale.valore * 100)) avvisi.push(`il totale stampato (${totale.valore.toFixed(2).replace(".", ",")}) è diverso dalla somma dei bonifici letti`);
  return { modello: "Distinta SEPA Credit Transfer", data, totale: totale?.valore ?? null, totaleSicuro: !!totale?.sicuro, numeroBonifici: numero,
    riferimento: mMsg ? mMsg[1] : "", righe, avvisi };
}

function storicoDisposizioni(r) {
  const avvisi = [];
  const tipo = (r.find(x => /^Tipo\s*:/i.test(x)) || "").replace(/^Tipo\s*:\s*/i, "");
  const righe = [];
  // una riga per bonifico: «… 10/09/26 VERONESI SRL 2.302,56 … Consegnata 10/09/26 262536069431798-…»
  for (let i = 0; i < r.length; i++) {
    const x = r[i];
    const m = x.match(/(\d{2}\/\d{2}\/\d{2,4})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\b(.*)$/);
    if (!m || /Data\s+spedizione/i.test(x)) continue;
    const data = dataIso(m[1]); const imp = numeroIt(m[3]);
    const resto = m[4] || "";
    const esitoTesto = (resto.match(/(Consegnata|Inviata|Accettata|Rifiutata|Eseguita|Respinta|Annullata)/i) || [])[1] || "";
    const cro = (resto.match(/\b(\d{12,20})-?/) || [])[1] || "";
    righe.push({ beneficiario: m[2].trim(), causale: "", iban: "", importo: imp?.valore ?? null, esitoBanca: esitoTesto, esito: esitoDa(esitoTesto), cro, data_esecuzione: data,
      sicuri: { beneficiario: !!m[2].trim(), causale: false, iban: true, importo: !!imp?.sicuro, data_esecuzione: !!data } });
  }
  if (!righe.length) avvisi.push("nessun bonifico letto");
  avvisi.push("questo modello non stampa la causale né l'IBAN del beneficiario: la causale si scrive guardando il documento (anche se è scritta a mano)");
  const data = righe[0]?.data_esecuzione || null;
  const totale = Math.round(righe.reduce((t, x) => t + (x.importo || 0) * 100, 0)) / 100;
  return { modello: "Storico disposizioni" + (tipo ? ` (${tipo.replace(/^\S+\s*-\s*/, "")})` : ""), data, totale: righe.length ? totale : null, totaleSicuro: false,
    numeroBonifici: righe.length, riferimento: righe.map(x => x.cro).filter(Boolean).join(", "), righe, avvisi };
}
function esitoDa(t) {
  const s = String(t || "").toLowerCase();
  if (/rifiut|respint|annullat/.test(s)) return "rifiutato";
  if (/eseguit|consegnat/.test(s)) return "eseguito";
  if (/accettat|inviat/.test(s)) return "accettato";
  return "";
}

// ── Righe di una scansione di estratto conto o lista movimenti della carta ────────────────────────────
// pagine: [{ numero, testo }]. Una riga comincia con una data; la descrizione sono le parole dopo la data e le righe sotto;
// l'importo è l'ultimo numero con la virgola. Segno meno o «-» davanti = uscita. Le righe incerte hanno sicuro: false.
export function leggiRigheScansione(pagine) {
  const out = []; let corrente = null;
  const chiudi = () => { if (corrente) { corrente.descrizione = corrente.descrizione.replace(/\s+/g, " ").trim(); out.push(corrente); corrente = null; } };
  for (const p of pagine || []) {
    for (const x of righeDi(p.testo)) {
      const md = x.match(DATA_IN_RIGA);
      const data = md ? dataIso(md[1] || md[2]) : null;
      const inizio = md && md.index <= 3 && data;
      // l'importo è in fondo alla riga (eventualmente con €), oppure seguito da €: «27,100» dentro un indirizzo non è un importo
      const imp = [...x.matchAll(/(?:^|\s)([-+]?\s?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})(?!\d)\s?(?:€\s*|\s*$)|(?:^|\s)([-+]?\d{1,3}(?:\.\d{3})*\s\d{2})€/g)].map(m => (m[1] || m[2]) + "€");
      if (inizio) {
        chiudi();
        corrente = { data_contabile: data, descrizione: x.slice(md.index + md[0].length).replace(IMPORTO, " ").replace(/€/g, " ").trim(), importo: null, verso: "uscita", pagina_pdf: p.numero, sicuro: true, note: [] };
      } else if (corrente && !imp.length && !/^(Da contabilizzare|Contabilizzat)/i.test(x)) {
        corrente.descrizione += " " + x;
      }
      if (corrente && imp.length && corrente.importo == null) {
        const t = imp[imp.length - 1];
        const n = numeroIt(t.replace(/\s(?=\d{2}€?$)/, " "));
        if (n) {
          corrente.importo = n.valore;
          // segno: «-» = uscita, «+» = entrata; senza segno non si sa: si propone uscita e la persona lo conferma
          corrente.verso = /^\s*-/.test(t) ? "uscita" : /^\s*\+/.test(t) || /\+\s*$/.test(x.slice(0, x.indexOf(t.trim()) + 1)) ? "entrata" : "uscita";
          if (!/^\s*[-+]/.test(t)) corrente.senzaSegno = true;
          if (!n.sicuro) { corrente.sicuro = false; corrente.note.push("importo letto senza virgola"); }
        }
      }
      if (corrente && /Da contabilizzare/i.test(x)) { corrente.daContabilizzare = true; corrente.note.push("«Da contabilizzare»: non è ancora un movimento"); }
    }
  }
  chiudi();
  // senza segno: se il documento mette il «-» alle uscite (lista Nexi), è un'entrata; altrimenti non si sa e la persona decide
  const conSegno = out.filter(r => r.importo != null && !r.senzaSegno).length, conMeno = out.filter(r => r.importo != null && !r.senzaSegno && r.verso === "uscita").length;
  const usaMeno = conSegno >= 3 && conMeno / conSegno >= 0.5;
  for (const r of out) if (r.senzaSegno) {
    if (usaMeno) { r.verso = "entrata"; r.note.push("senza «-»: entrata (il documento segna le uscite con il «-»)"); }
    else { r.sicuro = false; r.note.push("segno non stampato: entrata o uscita da confermare"); }
  }
  for (const r of out) {
    if (/^(SALDO\s+(INIZIALE|FINALE|CONTABILE|DISPONIBILE|AL|PRECEDENTE|ATTUALE)|TOTALE\s+(MOVIMENTI|ENTRATE|USCITE|DARE|AVERE|GENERALE)?)\b/i.test(r.descrizione)) { r.daContabilizzare = true; r.sicuro = false; r.note.push("riga di saldo o di totale: non è un movimento"); }
    if (r.importo == null) { r.sicuro = false; r.note.push("importo non letto"); }
    if (!r.descrizione) { r.sicuro = false; r.note.push("descrizione non letta"); }
  }
  return out;
}

// Che cosa sembra il testo di una scansione (proposta: la persona conferma)
export function tipoProposto(testo) {
  const t = String(testo || "");
  if (sembraDistinta(t) || /Distinta\s+(SEPA|di\s+pagamento|bonifici)/i.test(t)) return "distinta";
  if (/Relative alla carta|Lista movimenti|\*{4}\s*\d{4}|CARTA\s+\d{4}/i.test(t)) return "lista movimenti della carta";
  if (/ESTRATTO|Saldo iniziale|Saldo finale|Saldo contabile/i.test(t)) return "estratto conto";
  return "";
}
export const cartaNelTesto = testo => (String(testo || "").match(/(?:[*x×]{2,}\s*){2,3}(\d{4})\b|Relative alla carta[^\n]*?(\d{4})\s*$|CARTA\s+(?!(?:19|20)\d\d\b)(\d{4})\b/im) || []).slice(1).find(Boolean) || "";
// la lettura ottica scambia spesso I/1, O/0, S/5, B/8: nel CIN (5ª lettera dell'IBAN italiano) si prova la lettera; vale solo se il controllo dell'IBAN torna
export const ibanNelTesto = testo => {
  const lettera = { "1": "I", "l": "I", "0": "O", "5": "S", "8": "B", "2": "Z" };
  for (const m of String(testo || "").matchAll(/\b[I1l][T7]\s?\d{2}\s?[A-Z0-9]\s?(?:\d\s?){10}[A-Z0-9 ]{12,16}/g)) {
    const s = pulisciIban(m[0]).slice(0, 27);
    const prove = [s, s.slice(0, 4) + (lettera[s[4]] || s[4]) + s.slice(5)];
    for (const x of prove) if (ibanValido(x)) return x;
  }
  return "";
};

// ── Nome del file nell'archivio (decisione del Dottore delle 15:28) ─────────────────────────────────
// BPER 2923 - distinta del 2026-01-08 - VERONESI SRL - 2.046,72.pdf ; più bonifici: «3 bonifici» ; da scansione: « - da scansione»
export function nomeDistinta(conto, { data, righe, totale, daScansione, estensione }) {
  const banca = String(conto.cartella_su_z || conto.nome).replace(/^BANCHE\\/i, "").toUpperCase().split(/ - | \(/)[0].trim();
  const sigla = `${banca.split(" ")[0]} ${String(conto.iban || "").slice(-4)}`;
  const chi = righe.length === 1 ? String(righe[0].beneficiario || "").toUpperCase() : `${righe.length} bonifici`;
  const pulito = chi.replace(/[\x00-\x1f"~*/:<>?\\|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60).replace(/[ .]+$/, "");
  const [interi, cent] = Math.abs(Number(totale)).toFixed(2).split(".");
  const euro = interi.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + cent;
  const ext = String(estensione || ".pdf").toLowerCase();
  return `${sigla} - distinta del ${data} - ${pulito} - ${euro}${daScansione ? " - da scansione" : ""}${ext}`;
}
export function posizioneDistinta(conto, opz) {
  const base = String(conto.cartella_su_z || conto.nome).replace(/^BANCHE\\/i, "").toUpperCase();
  const banca = base.split(/ - | \(/)[0].trim();
  const t = `DISTINTE DI PAGAMENTO ${banca}`;
  return `${base}\\${t}\\${String(opz.data).slice(0, 4)} ${t}\\${nomeDistinta(conto, opz)}`;
}

// ── Proposta del pagamento per un bonifico della distinta ───────────────────────────────────────────
// pagamenti: righe di ci_pagamenti_fatture dello stesso conto, in uscita, non stornate, già filtrate per importo uguale.
// Regola: stesso importo al centesimo; data entro 10 giorni; il CRO uguale al numero del bonifico vale come prova;
// altrimenti il beneficiario deve stare nella controparte. Proposto già scelto solo se è uno solo.
const norm = s => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, " ").replace(/\b(SRL|SPA|SAS|SNC|S R L|S P A)\b/g, " ").replace(/\s+/g, " ").trim();
const giorni = (a, b) => Math.abs((new Date(a + "T12:00:00Z") - new Date(b + "T12:00:00Z")) / 86400000);
export function proponiPagamento(riga, pagamenti, uniti = new Set()) {
  const c = (pagamenti || []).filter(p => Math.round(Number(p.importo) * 100) === Math.round(Number(riga.importo) * 100) && !uniti.has(p.id)
    && giorni(p.data_disposizione || p.data, riga.data_esecuzione) <= 10).map(p => {
    const cro = riga.cro && p.numero_bonifico && String(p.numero_bonifico).replace(/\D/g, "").startsWith(String(riga.cro).replace(/\D/g, ""));
    // stesso nome: parola per parola, almeno 4 lettere (un nome corto come «A» non basta)
    const a = norm(riga.beneficiario), b = norm(p.controparte);
    const parole = (x, y) => x.length >= 4 && y.length >= 4 && (` ${y} `.includes(` ${x} `) || ` ${x} `.includes(` ${y} `));
    const nome = parole(a, b);
    return { pagamento: p, cro: !!cro, nome, punti: (cro ? 2 : 0) + (nome ? 1 : 0) };
  }).sort((a, b) => b.punti - a.punti || giorni(a.pagamento.data, riga.data_esecuzione) - giorni(b.pagamento.data, riga.data_esecuzione));
  // tutti i pagamenti con lo stesso importo e la data vicina si possono scegliere; è proposto solo l'unico con lo stesso CRO o lo stesso nome
  const buoni = c.filter(x => x.punti > 0), migliori = buoni.filter(x => x.punti === (buoni[0]?.punti ?? -1));
  return { candidati: c, proposto: migliori.length === 1 ? migliori[0].pagamento : null };
}
