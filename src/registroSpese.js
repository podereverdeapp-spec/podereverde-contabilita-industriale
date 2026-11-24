// Versione 397 (Tenente, 24/11/2026): i conti del «Registro delle spese» (claude/progetto_391_registro_spese.md, giro corretto
// e casi brutti approvati dal Dott. Bizzarri il 24/11/2026 alle 15:29 e 15:35). Funzioni pure: leggono, non scrivono niente.
// Il mese è quello della DATA DEL PAGAMENTO, come la «Chiusura del mese delle spese» (ci_spese_mese_impedimenti).
import { STRUMENTI_PERSONALI, daRimborsare, nomeStrumento } from "./fileSpesa";
const CARTE = ["Carta di debito", "Carta prepagata", "Carta di credito"];

export const cent = n => Math.round(Number(n || 0) * 100);
export const meseIt = m => { const [a, b] = String(m).split("-"); return ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"][Number(b) - 1] + " " + a; };
// primo giorno del mese di una data «AAAA-MM-GG»
export const meseDi = d => String(d || "").slice(0, 7) + "-01";
export const spostaMese = (m, n) => { const [a, b] = m.split("-").map(Number); const x = new Date(Date.UTC(a, b - 1 + n, 1)); return x.toISOString().slice(0, 10); };
export const fineMese = m => { const [a, b] = m.split("-").map(Number); return new Date(Date.UTC(a, b, 0)).toISOString().slice(0, 10); };

// ora del pagamento «HH:MM» (ora_pago può essere un orario o una data con ora); null se non letta
export function oraPagamento(s) {
  const v = s?.ora_pago;
  if (!v) return null;
  const t = String(v);
  if (/^\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
}

// un movimento di prima nota vale se c'è, non è stornato e non è a sua volta uno storno
const movimentoValido = m => !!m && !m.stornato_il && m.natura !== "STORNO";

// Stato in prima nota di una spesa (casi brutti 5, 6, 7, 8). Si legge ogni volta dal database: movimento, strumento, rimborso.
// Restituisce { chiave, testo, colore } — la chiave serve al filtro.
export function statoPrimaNota(s, { movimenti = {}, strumenti = {}, rimborsi = {} } = {}) {
  if (s.stato === "Annullata") return { chiave: "annullata", testo: "Annullata: fuori dalla prima nota", colore: "muted" };
  const t = strumenti[s.pagato_con] || null;
  if (STRUMENTI_PERSONALI.includes(s.pagato_con)) {
    // soldi della persona: in prima nota entra il rimborso, non la spesa
    const r = s.rimborso_id ? rimborsi[s.rimborso_id] : null;
    if (s.stato === "Rimborsata" || r?.stato === "Pagato") return { chiave: "definitivo", testo: "Rimborsata: in prima nota il rimborso", colore: "green" };
    // bonifico del rimborso stornato in banca: ci_rimborso_segue_banca lo rimette «Disposto» senza movimento (come «Rimborsi delle spese»)
    if (r && r.stato === "Disposto" && !r.movimento_id) return { chiave: "senza", testo: "Bonifico del rimborso stornato: collegare l'uscita giusta in «Rimborsi delle spese»", colore: "red" };
    if (r && r.stato === "Disposto") return { chiave: "attesa", testo: "Rimborso disposto: in attesa della banca", colore: "blue" };
    if (r && r.stato === "Approvato") return { chiave: "attesa", testo: "Rimborso approvato, da pagare", colore: "accent" };
    return { chiave: "rimborsare", testo: "Da rimborsare alla persona", colore: "accent" };
  }
  const m = movimentoValido(movimenti[s.movimento_id]) ? movimenti[s.movimento_id] : null;
  // movimento ancora collegato ma stornato in prima nota (le carte: nessuna funzione azzera movimento_id dopo lo storno della banca)
  if (!m && s.movimento_id && movimenti[s.movimento_id]) return { chiave: "senza", testo: "Movimento stornato in prima nota: da ricollegare", colore: "red" };
  if (m) {
    if (m.confermato_il) return { chiave: "definitivo", testo: "Definitivo" + (m.data && m.data !== s.data_pagamento ? ` (data contabile ${m.data.slice(8, 10)}/${m.data.slice(5, 7)}/${m.data.slice(0, 4)})` : ""), colore: "green" };
    if (Number(m.conto_id) === 3) return { chiave: "provvisorio", testo: "Provvisorio fino al rimborso", colore: "accent" };
    return { chiave: "attesa", testo: "In attesa della banca", colore: "blue" };
  }
  if (s.pagato_con === "Contanti") return { chiave: "senza", testo: "Senza riga di cassa: si riscrive al controllo", colore: "red" };
  if (t && CARTE.includes(t.tipo)) {
    // come ci_spese_mese_impedimenti: registrazione annullata, o rifatta dopo la spesa (strumento_registrato_il diverso da registrata_il)
    if (t.annullata_il || String(s.strumento_registrato_il || "") !== String(t.registrata_il || "")) return { chiave: "senza", testo: "Registrazione della carta annullata: spostare la spesa sulla carta giusta in «Abilitati alle spese» o annullarla", colore: "red" };
    if (t.conto_id === null || t.conto_id === undefined) return { chiave: "completare", testo: "Carta da completare in «Abilitati alle spese»", colore: "red" };
    if (t.tipo === "Carta di credito") return { chiave: "addebitare", testo: "Da addebitare", colore: "accent" };
  }
  return { chiave: "attesa", testo: "In attesa della banca", colore: "blue" };
}

export const FILTRI_PRIMA_NOTA = [
  ["definitivo", "Definitivo"], ["attesa", "In attesa (banca o rimborso)"], ["provvisorio", "Provvisorio fino al rimborso"],
  ["addebitare", "Da addebitare (carta di credito)"], ["completare", "Carta da completare"], ["rimborsare", "Da rimborsare alla persona"], ["senza", "Senza riga in prima nota"]];

// soldi messi dal dipendente non ancora restituiti (caso brutto 6 e 7): conta lo stato letto adesso
export const nonRestituito = s => s.stato !== "Annullata" && s.stato !== "Rimborsata" && daRimborsare(s) > 0;

// fattura elettronica (caso brutto 10)
export function statoFattura(s, fatture = {}) {
  if (s.stato === "Annullata") return { chiave: "annullata", testo: "Spesa annullata: nessuna fattura" };
  if (s.fattura_id) { const f = fatture[s.fattura_id]; return { chiave: "collegata", testo: f ? `Fattura collegata: ${f.fornitore || ""} n. ${f.numero} del ${String(f.data || "").split("-").reverse().join("/")}` : `Fattura collegata (id ${s.fattura_id})` }; }
  if (s.tipo_documento === "Fattura" || s.fattura_da_sdi) return { chiave: "da ricevere", testo: "Fattura da ricevere" };
  return { chiave: "non serve", testo: "Fattura: non serve" };
}

// possibili doppioni (caso brutto 2): stessa data del documento e stesso importo di un'altra spesa non annullata, come in «Spese pagate: controllo»
export function doppioniDi(s, tutte) {
  if (s.stato === "Annullata") return [];
  return tutte.filter(x => x.id !== s.id && x.stato !== "Annullata" && x.data_documento === s.data_documento && cent(x.importo) === cent(s.importo));
}

// le righe del mese, filtrate e ordinate per data e ora del pagamento
export function righeDelMese(tutte, mese, filtri = {}, ctx = {}) {
  const dal = meseDi(mese), al = fineMese(dal);
  return tutte
    .filter(s => s.data_pagamento >= dal && s.data_pagamento <= al)
    .map(s => ({ ...s, primaNota: statoPrimaNota(s, ctx), fattura: statoFattura(s, ctx.fatture), doppioni: doppioniDi(s, tutte), evidenziata: nonRestituito(s), ora: oraPagamento(s) }))
    .filter(s => filtri.annullate || s.stato !== "Annullata")
    .filter(s => !filtri.mezzo || nomeStrumento(s.pagato_con) === filtri.mezzo)
    .filter(s => !filtri.persona || s.salvata_da === filtri.persona)
    .filter(s => !filtri.primaNota || s.primaNota.chiave === filtri.primaNota)
    .filter(s => !filtri.bene || (filtri.bene === "bene" ? s.bene === true : filtri.bene === "servizio" ? s.bene === false : s.bene === null || s.bene === undefined))
    .sort((a, b) => (a.data_pagamento + (a.ora || "99:99") + String(a.salvata_il || "")).localeCompare(b.data_pagamento + (b.ora || "99:99") + String(b.salvata_il || "")) || a.id - b.id);
}

// totali (caso brutto 1: le annullate non contano mai, anche se mostrate)
export function totali(righe) {
  const valide = righe.filter(s => s.stato !== "Annullata");
  const per = chiave => { const o = {}; for (const s of valide) { const k = chiave(s); o[k] = (o[k] || 0) + cent(s.importo); } return Object.entries(o).map(([k, c]) => [k, c / 100]).sort((a, b) => a[0].localeCompare(b[0])); };
  return {
    quante: valide.length,
    totale: valide.reduce((t, s) => t + cent(s.importo), 0) / 100,
    perMezzo: per(s => nomeStrumento(s.pagato_con)),
    perPersona: per(s => s.salvata_da || ""),
    inAttesaBanca: valide.filter(s => s.primaNota.chiave === "attesa" && !STRUMENTI_PERSONALI.includes(s.pagato_con)).length,
    daSistemare: valide.filter(s => s.primaNota.chiave === "senza" || s.primaNota.chiave === "completare").length,
    daAddebitare: valide.filter(s => s.primaNota.chiave === "addebitare").length,
    daRestituire: valide.filter(s => s.evidenziata).reduce((t, s) => t + cent(daRimborsare(s)), 0) / 100,
  };
}

// testo dei filtri da scrivere in testa al file esportato (caso brutto 17)
export const filtrato = f => !!(f.mezzo || f.persona || f.primaNota || f.bene);
export function testoFiltri(filtri, nomi = {}) {
  const f = [];
  if (filtri.mezzo) f.push(`mezzo di pagamento: ${filtri.mezzo}`);
  if (filtri.persona) f.push(`persona: ${nomi[filtri.persona] || "persona non più nel programma"}`);
  if (filtri.primaNota) f.push(`stato in prima nota: ${(FILTRI_PRIMA_NOTA.find(x => x[0] === filtri.primaNota) || [, filtri.primaNota])[1]}`);
  if (filtri.bene) f.push(filtri.bene === "bene" ? "solo beni" : filtri.bene === "servizio" ? "solo servizi" : "bene o servizio non indicato");
  f.push(filtri.annullate ? "comprese le spese annullate (non contano nei totali)" : "senza le spese annullate");
  return (filtri.mezzo || filtri.persona || filtri.primaNota || filtri.bene ? "ATTENZIONE: elenco filtrato, non è il mese intero — " : "Mese intero — ") + f.join("; ");
}
