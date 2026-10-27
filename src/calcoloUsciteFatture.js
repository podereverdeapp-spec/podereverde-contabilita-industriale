// Versione 312 (richiesta del Dott. Bizzarri del 27/10/2026 ore 10:41): «Suini usciti e fatture».
// Confronta, mese per mese, i suini usciti nell'app come «macellato» con le fatture di vendita dei suini, e trova:
// - i capi usciti senza nessun peso della carcassa;
// - i capi pesati che non risultano in nessuna fattura.
// Il mese di una riga di fattura è quello scritto nella descrizione («PERIODO SETTEMBRE 2025», «DAL 19 AL 30 SETTEMBRE 2024»):
// le fatture si emettono anche mesi dopo (es. FPR 1/26 – 4/26 del 27/01/2026 per settembre–dicembre 2025). Senza periodo
// scritto vale il mese della fattura. Le righe emesse dal programma hanno la data di uscita e il capo: si abbinano direttamente.
// Le fatture di Aruba non nominano i suinetti: i capi fatturati si riconoscono dai pesi, cercando i capi del mese il cui peso
// della carcassa somma esattamente ai chili della fattura (al centesimo) con il numero di capi scritto. Se la soluzione non è
// una sola, il programma non sceglie e lo dice. Sola lettura: nessuna scrittura nel database.
import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";

export const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const centesimi = v => Math.round((parseFloat(v) || 0) * 100);
const norm = s => String(s || "").toUpperCase().replace(/\s+/g, "");

// Mese di competenza scritto nella descrizione (1–12 e anno), oppure null
export function periodoDaDescrizione(testo) {
  const t = String(testo || "").toUpperCase();
  const nomi = MESI.map(m => m.toUpperCase()).join("|");
  const m = t.match(new RegExp(`PERIODO\\s+(${nomi})\\s+(\\d{4})`)) || t.match(new RegExp(`AL\\s+\\d{1,2}\\s+(${nomi})\\s+(\\d{4})`));
  if (!m) return null;
  return { mese: MESI.indexOf(m[1].toLowerCase()) + 1, anno: parseInt(m[2]) };
}
export function capiDaDescrizione(testo) {
  const m = String(testo || "").toUpperCase().match(/(\d+)\s*CAPI/);
  return m ? parseInt(m[1]) : null;
}

export async function caricaFattureSuini() {
  const [{ data: fatture }, { data: righe }, { data: emesse }, { data: righeEmesse }] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("ci_fatture").select("id, numero, data").eq("tipo", "ATTIVA").order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("ci_articoli_fattura").select("id, fattura_id, destinazione, descrizione, quantita, totale_riga").eq("destinazione", "Suini").order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("ci_fatture_emesse").select("id, numero, data, stato").order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("ci_fatture_emesse_righe").select("id, fattura_id, specie, matricola, lotto, data_uscita, descrizione, quantita_kg, importo, attiva").eq("specie", "suino").order("id").range(da, a)),
  ]);
  const perId = new Map((fatture || []).map(f => [f.id, f]));
  const numeriAruba = new Set((fatture || []).map(f => norm(f.numero)));
  const out = [];
  // una riga senza periodo scritto prende il periodo di un'altra riga della stessa fattura (es. FPR 4/25: cinta senese con dicembre 2024)
  const periodoFattura = new Map();
  for (const r of righe || []) { const p = periodoDaDescrizione(r.descrizione); if (p && !periodoFattura.has(r.fattura_id)) periodoFattura.set(r.fattura_id, p); }
  for (const r of righe || []) {
    const f = perId.get(r.fattura_id); if (!f) continue;
    const p = periodoDaDescrizione(r.descrizione) || periodoFattura.get(r.fattura_id) || null;
    const d = new Date(f.data);
    out.push({ numero: f.numero, data: f.data, descrizione: r.descrizione, kg: centesimi(r.quantita), importo: parseFloat(r.totale_riga) || 0,
      capi: capiDaDescrizione(r.descrizione), anno: p ? p.anno : d.getFullYear(), mese: p ? p.mese : d.getMonth() + 1, periodoScritto: !!p, capo: null });
  }
  // fatture emesse dal programma non ancora lette da Aruba: una riga per capo, con la data di uscita
  const emessePerId = new Map((emesse || []).filter(e => e.stato !== "annullata").map(e => [e.id, e]));
  for (const r of righeEmesse || []) {
    const e = emessePerId.get(r.fattura_id); if (!e || r.attiva === false || numeriAruba.has(norm(e.numero))) continue;
    const d = new Date(r.data_uscita || e.data);
    out.push({ numero: e.numero, data: e.data, descrizione: r.descrizione, kg: centesimi(r.quantita_kg), importo: parseFloat(r.importo) || 0,
      capi: 1, anno: d.getFullYear(), mese: d.getMonth() + 1, periodoScritto: !!r.data_uscita, capo: norm(r.matricola || r.lotto) || null });
  }
  return out;
}

// Cerca tra i capi un gruppo di «quanti» capi (o di qualunque numero, se quanti è null) che pesi esattamente «obiettivo» centesimi.
// Restituisce { soluzione, numero } con numero = 0, 1 o 2 (2 = più di una soluzione: non si sceglie).
function cercaGruppo(capi, quanti, obiettivo) {
  const lista = [...capi].sort((a, b) => b.kg - a.kg);
  const resto = []; let s = 0; for (let i = lista.length - 1; i >= 0; i--) { s += lista[i].kg; resto[i] = s; }
  const trovate = []; const scelti = []; let passi = 0; const LIMITE = 3000000;
  const giro = (i, somma) => {
    if (trovate.length > 1 || ++passi > LIMITE) return;
    if (somma === obiettivo && (quanti === null || scelti.length === quanti)) {
      // due capi con lo stesso peso danno «soluzioni» uguali: conta come diversa solo se cambia l'insieme dei pesi
      const firma = scelti.map(c => c.kg).sort((a, b) => a - b).join(",");
      if (!trovate.some(t => t.firma === firma)) trovate.push({ firma, capi: [...scelti] });
      return;
    }
    if (i >= lista.length || somma > obiettivo || somma + resto[i] < obiettivo) return;
    if (quanti !== null && scelti.length >= quanti) return;
    scelti.push(lista[i]); giro(i + 1, somma + lista[i].kg); scelti.pop();
    giro(i + 1, somma);
  };
  giro(0, 0);
  if (passi > LIMITE) return { soluzione: null, numero: 2 };
  return { soluzione: trovate[0]?.capi || null, numero: trovate.length };
}

// capiApp: [{ chiave, codice, lotto, provenienza, nascita, sesso, uscita, pesoVivo, pesoCarcassa, riproduttore }]
export function confronta(capiApp, righeFatture, anno) {
  const usciti = capiApp.filter(c => c.uscita && parseInt(c.uscita.slice(0, 4)) === anno)
    .map(c => ({ ...c, mese: parseInt(c.uscita.slice(5, 7)), kg: centesimi(c.pesoCarcassa), fatturato: null }));
  const fatture = righeFatture.filter(r => r.anno === anno);
  const mesi = [];
  let avanzati = []; // capi pesati del mese prima non ancora trovati in una fattura
  for (let m = 1; m <= 12; m++) {
    const delMese = usciti.filter(c => c.mese === m);
    const righe = fatture.filter(r => r.mese === m);
    const pesati = delMese.filter(c => c.kg > 0);
    // 1) righe emesse dal programma: abbinate al capo per codice
    for (const r of righe.filter(x => x.capo)) {
      const c = [...pesati, ...avanzati].find(x => !x.fatturato && (norm(x.codice) === r.capo || norm(x.matricola) === r.capo));
      if (c) c.fatturato = r.numero;
    }
    const aggregate = righe.filter(x => !x.capo);
    const kgFatture = aggregate.reduce((t, r) => t + r.kg, 0), capiFatture = aggregate.every(r => r.capi !== null) ? aggregate.reduce((t, r) => t + r.capi, 0) : null;
    const liberi = pesati.filter(c => !c.fatturato);
    // se la fattura del mese pesa più dei capi del mese, comprende capi del mese prima (es. agosto 2025 con 3 capi di luglio)
    const kgLiberi = liberi.reduce((t, c) => t + c.kg, 0);
    const pool = kgFatture > kgLiberi ? [...liberi, ...avanzati.filter(c => !c.fatturato)] : liberi;
    let esito = "nessuna fattura";
    if (aggregate.length) {
      const r = cercaGruppo(pool, capiFatture, kgFatture);
      if (r.numero === 1) { r.soluzione.forEach(c => { c.fatturato = aggregate.map(x => x.numero).join(", "); }); esito = "trovati"; }
      else if (r.numero === 0) esito = kgFatture > pool.reduce((t, c) => t + c.kg, 0) || (capiFatture !== null && capiFatture > pool.length)
        ? "le fatture hanno più capi o più chili di quelli pesati nell'app: mancano uscite o pesi nell'app"
        : "nessun gruppo di capi torna con la fattura";
      else esito = "più gruppi di capi tornano con la fattura: non si sceglie";
    }
    // gli avanzati del mese prima non usati qui restano «pesati non fatturati»; quelli di questo mese passano al mese dopo
    avanzati = pesati.filter(c => !c.fatturato);
    mesi.push({ mese: m, capi: delMese.length, senzaPeso: delMese.filter(c => !(c.kg > 0)).length, kg: pesati.reduce((t, c) => t + c.kg, 0),
      capiFatturati: capiFatture, kgFatturati: kgFatture + righe.filter(x => x.capo).reduce((t, r) => t + r.kg, 0), numeri: [...new Set(righe.map(r => r.numero))], esito });
  }
  const senzaPeso = usciti.filter(c => !(c.kg > 0)).sort((a, b) => a.uscita.localeCompare(b.uscita) || String(a.codice).localeCompare(String(b.codice)));
  // mesi in cui la ricerca non ha deciso: i loro capi pesati non si possono dire «fatturati» o «non fatturati» uno per uno
  const mesiIncerti = new Set(mesi.filter(x => x.esito !== "trovati" && x.esito !== "nessuna fattura").map(x => x.mese));
  const nonFatturati = usciti.filter(c => c.kg > 0 && !c.fatturato && !mesiIncerti.has(c.mese));
  const nonAbbinati = mesi.filter(x => mesiIncerti.has(x.mese)).map(x => {
    const capiMese = usciti.filter(c => c.mese === x.mese && c.kg > 0 && !c.fatturato);
    return { ...x, capiPesati: capiMese.length, kgPesati: capiMese.reduce((t, c) => t + c.kg, 0) };
  });
  // pesi uguali nello stesso giorno: possibile doppione (se c'è un riproduttore) o pesi stimati (tre o più capi)
  const gruppi = new Map();
  usciti.filter(c => c.kg > 0).forEach(c => { const k = `${c.uscita}|${c.pesoVivo}|${c.kg}`; if (!gruppi.has(k)) gruppi.set(k, []); gruppi.get(k).push(c); });
  const osservazione = c => {
    const g = gruppi.get(`${c.uscita}|${c.pesoVivo}|${c.kg}`) || [];
    if (c.riproduttore) return "riproduttore di riforma";
    if (g.length === 2 && g.some(x => x.riproduttore && x !== c)) return `possibile doppione: stessi pesi e stesso giorno di ${g.find(x => x !== c).codice}`;
    if (g.length >= 3) return `pesi uguali ad altri ${g.length - 1} capi dello stesso giorno: stimati?`;
    return "";
  };
  return { mesi, senzaPeso, nonAbbinati, nonFatturati: nonFatturati.map(c => ({ ...c, osservazione: osservazione(c) })),
    totali: { capi: usciti.length, senzaPeso: senzaPeso.length, kg: usciti.reduce((t, c) => t + (c.kg > 0 ? c.kg : 0), 0),
      capiFatturati: mesi.reduce((t, x) => t + (x.capiFatturati || 0), 0), kgFatturati: mesi.reduce((t, x) => t + x.kgFatturati, 0),
      kgNonFatturati: nonFatturati.reduce((t, c) => t + c.kg, 0) } };
}
