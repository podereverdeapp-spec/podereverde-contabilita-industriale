// Versione 357 — regole della «Gestione incassi e pagamenti» (solo calcolo, nessuna scrittura).
// Le stesse regole sono controllate di nuovo dal database (ci_disponi_movimento): qui servono a guidare l'operatore prima dell'invio.

export const SEZIONI = [
  { id: "pagamento_fatture", nome: "Pagamento fatture", verso: "uscita" },
  { id: "incasso_fatture", nome: "Incasso fatture", verso: "entrata" },
  { id: "altri_pagamenti", nome: "Altri pagamenti", verso: "uscita" },
  { id: "altri_incassi", nome: "Altri incassi", verso: "entrata" },
  { id: "giroconti", nome: "Giroconti", verso: null },
];
// gruppi della causale contabile per sezione (progetto, sezione 10.2, decisione del 09/11/2026 ore 16:28)
export const GRUPPI_SEZIONE = {
  pagamento_fatture: ["Fatture"], incasso_fatture: ["Fatture"],
  altri_pagamenti: ["Personale", "Tributi", "Altri costi", "Investimenti", "Soci", "Rimborsi", "Finanziamenti", "Altre"],
  altri_incassi: ["Soci", "Contributi", "Rimborsi", "Finanziamenti", "Investimenti", "Altre"],
  giroconti: ["Giroconti"],
};
const VOCI_ESCLUSE = {
  pagamento_fatture: ["Acconto su fattura da emettere", "Compensazione tra fatture"],
  incasso_fatture: ["Acconto su fattura da ricevere", "Caparra confirmatoria su preventivo", "Compensazione tra fatture"],
  altri_pagamenti: ["Versamento F24", "Storno di registrazione"],
  altri_incassi: ["Storno di registrazione"],
  giroconti: [],
};
export const vociDellaSezione = (causali, sezione, gruppo) => causali.filter(c => c.gruppo === gruppo && GRUPPI_SEZIONE[sezione].includes(gruppo) && !VOCI_ESCLUSE[sezione].includes(c.voce));

// «come si paga»: modalità per verso (F24 ha la sua sezione; «Addebito della banca» la assegna solo il programma)
export const MODALITA_USCITA = ["Bonifico", "Bonifico istantaneo", "Assegno bancario", "Assegno circolare", "Contanti", "Carta di debito", "Carta di credito", "Carta prepagata", "Bollettino", "Addebito diretto SEPA", "Altro"];
export const MODALITA_ENTRATA = ["Bonifico", "Bonifico istantaneo", "Assegno bancario", "Assegno circolare", "Contanti", "Altro"];
// «con che cosa»: stessa regola del database (ci_modalita_ammessa)
export function modalitaAmmessa(tipoConto, modalita, verso) {
  switch (tipoConto) {
    case "banca": return ["Bonifico", "Bonifico istantaneo", "Assegno bancario", "Assegno circolare", "Bollettino", "Addebito diretto SEPA", "Altro"].includes(modalita)
      || (verso === "uscita" && ["Carta di debito", "Modello F24"].includes(modalita));
    case "carta prepagata": return ["Carta prepagata", "Altro"].includes(modalita);
    case "carta di credito": return ["Carta di credito", "Altro"].includes(modalita);
    case "cassa": return modalita === "Contanti";
    case "conto elettronico": return ["Bonifico", "Altro"].includes(modalita);
    default: return false;
  }
}
// modalità scritta nella fattura elettronica (ModalitaPagamento) → proposta
export const MODALITA_DA_XML = { MP01: "Contanti", MP02: "Assegno bancario", MP03: "Assegno circolare", MP05: "Bonifico", MP08: "Carta di debito", MP12: "Bollettino", MP19: "Addebito diretto SEPA", MP20: "Addebito diretto SEPA", MP21: "Addebito diretto SEPA" };
export const NOME_MP = { MP01: "contanti", MP02: "assegno", MP03: "assegno circolare", MP05: "bonifico", MP08: "carta di pagamento", MP12: "RIBA", MP19: "SEPA Direct Debit", MP23: "PagoPA" };

// IBAN: forma e cifre di controllo (ISO 13616, modulo 97); Italia 27 caratteri
export const ibanPulito = t => String(t || "").toUpperCase().replace(/\s+/g, "");
export function ibanValido(t) {
  const s = ibanPulito(t);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  if (s.startsWith("IT") && s.length !== 27) return false;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let resto = 0; for (const ch of r) resto = (resto * 10 + Number(ch)) % 97;
  return resto === 1;
}
export const ibanBello = t => ibanPulito(t).replace(/(.{4})/g, "$1 ").trim();
export const abiDiIban = t => { const s = ibanPulito(t); return s.startsWith("IT") ? s.slice(5, 10) : ""; };

// Causale del bonifico: 140 caratteri SEPA (EPC132-08: a-z A-Z 0-9 / - ? : ( ) . , ' + spazio) — decisione del 03/11/2026 ore 12:46.
// Pulizia (studio, sezione 16, punto 5): maiuscole; À È É Ì Ò Ù → A' E' I' O' U'; ° → . ; & → E ; @ → (AT); altri caratteri → spazio; niente «//».
export function pulisciCausale(t) {
  let s = String(t || "").toUpperCase()
    .replace(/[ÀÁÂÄ]/g, "A'").replace(/[ÈÉÊË]/g, "E'").replace(/[ÌÍÎÏ]/g, "I'").replace(/[ÒÓÔÖ]/g, "O'").replace(/[ÙÚÛÜ]/g, "U'")
    .replace(/°/g, ".").replace(/&/g, " E ").replace(/@/g, "(AT)")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9/?:().,'+ -]/g, " ").replace(/\/{2,}/g, "/").replace(/\s+/g, " ").trim();
  s = s.replace(/^\/+|\/+$/g, "").trim();
  return s;
}
export const causaleValida = s => s.length >= 1 && s.length <= 140 && /^[A-Za-z0-9/?:().,'+ -]+$/.test(s) && !/^\//.test(s) && !/\/$/.test(s) && !s.includes("//");
const dataBarre = (d, corta) => { const [a, m, g] = String(d).slice(0, 10).split("-"); return `${g}/${m}/${corta ? a.slice(2) : a}`; };
const PAROLA_TD = { TD01: ["FATTURA", "FT"], TD24: ["FATTURA", "FT"], TD25: ["FATTURA", "FT"], TD06: ["PARCELLA", "PARC."], TD05: ["NOTA DI DEBITO", "ND"], TD04: ["NOTA DI CREDITO", "NC"] };
// Composizione (studio, sezione 16, punti 1–4 e 7; decisioni del 03/11 ore 17:14, 17:58, 18:00, 18:02): TIPO + documento N. numero DEL data,
// altri documenti con «+», l'eventuale acconto «+ ACCONTO EUR x SU …», «NETTO RIT.» se c'è ritenuta. Se supera 140: forme brevi, poi anno a due cifre.
// quote = [{ numero, data, tipo, importo, resto, ritenuta }]
export function componiCausale(quote, incasso = false) {
  const saldi = quote.filter(q => Math.abs(q.importo - q.resto) < 0.005);
  const acconti = quote.filter(q => q.importo < q.resto - 0.005);
  const ritenuta = quote.some(q => Number(q.ritenuta) > 0);
  const euroCausale = n => Number(n).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  for (const livello of [0, 1, 2]) {
    const breve = livello >= 1, anno2 = livello >= 2;
    const doc = q => { const [lungo, corto] = PAROLA_TD[q.tipo] || PAROLA_TD.TD01; return `${breve ? corto : lungo} ${breve ? "" : "N. "}${q.numero} DEL ${dataBarre(q.data, anno2)}`; };
    const parti = [];
    if (saldi.length) parti.push("SALDO " + saldi.map(doc).join(" + "));
    if (acconti.length) parti.push((saldi.length ? "+ " : "") + (saldi.length ? `ACCONTO EUR ${euroCausale(acconti[0].importo)} SU ` : "ACCONTO SU ") + doc(acconti[0]));
    if (ritenuta) parti.push(breve ? "NETTO RIT." : "AL NETTO DELLA RITENUTA");
    const s = pulisciCausale(parti.join(" "));
    if (s.length <= 140) return { testo: s, livello };
  }
  return { testo: "", livello: 3, troppo: true };
}

// Giorni lavorativi (sabato, domenica e festività nazionali esclusi; 4 ottobre festivo dal 2026) — sezione 6 del progetto
function pasqua(a) { const f = Math.floor, g = a % 19, c = f(a / 100), h = (c - f(c / 4) - f((8 * c + 13) / 25) + 19 * g + 15) % 30,
  i = h - f(h / 28) * (1 - f(29 / (h + 1)) * f((21 - g) / 11)), j = (a + f(a / 4) + i + 2 - c + f(c / 4)) % 7, l = i - j, m = 3 + f((l + 40) / 44), d = l + 28 - 31 * f(m / 4);
  return new Date(Date.UTC(a, m - 1, d)); }
export function festivo(iso) {
  const d = new Date(`${iso}T12:00:00Z`); const w = d.getUTCDay(); if (w === 0 || w === 6) return true;
  const md = iso.slice(5, 10); const a = d.getUTCFullYear();
  if (["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26"].includes(md)) return true;
  if (a >= 2026 && md === "10-04") return true;
  if (md === "06-29") return true; // santi Pietro e Paolo: banche di Roma chiuse
  const p = pasqua(a); const lun = new Date(p), ven = new Date(p); lun.setUTCDate(p.getUTCDate() + 1); ven.setUTCDate(p.getUTCDate() - 2);
  return lun.toISOString().slice(0, 10) === iso || ven.toISOString().slice(0, 10) === iso; // Pasquetta; Venerdì Santo (pagamenti SEPA fermi)
}
export function giorniLavorativi(dal, al) {
  if (!dal || !al || al <= dal) return 0;
  let n = 0; const d = new Date(`${dal}T12:00:00Z`);
  while (true) { d.setUTCDate(d.getUTCDate() + 1); const iso = d.toISOString().slice(0, 10); if (iso > al) break; if (!festivo(iso)) n++; }
  return n;
}
export function piuLavorativi(dal, n) { const d = new Date(`${dal}T12:00:00Z`); let k = 0; while (k < n) { d.setUTCDate(d.getUTCDate() + 1); if (!festivo(d.toISOString().slice(0, 10))) k++; } return d.toISOString().slice(0, 10); }
// termine dell'avviso per un movimento in attesa (progetto, sezione 6)
export const termineAvviso = m => (m.causale_gruppo === "Personale" || m.causale_gruppo === "Tributi") ? 3 : 10;
export const oggiRoma = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());

// stato di un movimento in attesa: ok (azzurro) o avviso (rosso) con la causa scritta per l'operatore
export function statoAttesa(m, coperturaConto, oggi) {
  const dd = m.data_disposizione || m.data;
  const giorni = giorniLavorativi(dd, oggi);
  const due = piuLavorativi(dd, 2);
  if (coperturaConto && coperturaConto >= due)
    return { rosso: true, giorni, causa: `movimenti della banca caricati fino al ${dataIt(coperturaConto)}, ma ${m.verso === "uscita" ? "il pagamento" : "l'incasso"} non risulta: controlla in banca che sia stato autorizzato e spedito; se non è partito, annullalo` };
  const t = termineAvviso(m);
  if (giorni >= t) return { rosso: true, giorni, causa: `in attesa da ${giorni} giorni lavorativi (termine ${t}): movimenti della banca caricati solo fino al ${coperturaConto ? dataIt(coperturaConto) : "—"}: scarica l'estratto conto o la lista movimenti e caricalo in «Banche, carte e cassa»` };
  return { rosso: false, giorni, causa: `in attesa da ${giorni} giorni lavorativi (avviso dopo ${t})` };
}
export const dataIt = d => { const s = String(d || "").slice(0, 10); const [a, m, g] = s.split("-"); return g ? `${g}/${m}/${a}` : "—"; };
