import { supabase } from "./supabase";
import { fetchAllPages, round2 } from "./parsingUtils";

// Sezione Coltivazioni — lettura del registro delle fatture di coltivazione.
// Fonte unica: la vista in sola lettura v_fatture_coltivazione (righe con Area = Coltivazione
// delle fatture passive di Podere Verde e delle fatture di Muratella S.r.l.).
// Questa sezione legge soltanto: non scrive nulla e non cambia nessun calcolo del programma.

export const SOCIETA = ["Podere Verde", "Muratella S.r.l."];

// Ordine di presentazione dei centri di costo: prima le voci dirette della coltivazione
export const ORDINE_CENTRI = [
  "Coltivazione Lavoro Contoterzi",
  "Coltivazione Sementi",
  "Coltivazione Concimi e Fitosanitari",
  "Coltivazione Reti e Film",
  "Gasolio e lubrificanti",
  "Manutenzione e Riparazione Macchine Agricole",
];

export function ordinaCentri(centri) {
  return [...centri].sort((a, b) => {
    const ia = ORDINE_CENTRI.indexOf(a), ib = ORDINE_CENTRI.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
}

export async function caricaRegistroFattureColtivazione() {
  const { data, error } = await fetchAllPages((da, a) => supabase
    .from("v_fatture_coltivazione").select("*")
    .order("data", { ascending: false }).order("fattura_id").order("articolo_id")
    .range(da, a));
  if (error) throw new Error(error.message);
  return (data || []).map(r => ({
    ...r,
    imponibile: r.imponibile != null ? Number(r.imponibile) : 0,
    iva: r.iva != null ? Number(r.iva) : null,
    quantita: r.quantita != null ? Number(r.quantita) : null,
    prezzo_unitario: r.prezzo_unitario != null ? Number(r.prezzo_unitario) : null,
    totale_documento: r.totale_documento != null ? Number(r.totale_documento) : null,
  }));
}

// Raggruppa le righe per fattura (una fattura = società + registrazione)
export function raggruppaPerFattura(righe) {
  const mappa = new Map();
  for (const r of righe) {
    const chiave = `${r.societa}|${r.fattura_id}`;
    if (!mappa.has(chiave)) {
      mappa.set(chiave, {
        chiave, societa: r.societa, fattura_id: r.fattura_id, numero: r.numero, data: r.data,
        fornitore: r.fornitore, partita_iva: r.partita_iva, tipo_documento: r.tipo_documento,
        totale_documento: r.totale_documento, righe_totali: Number(r.righe_totali_della_fattura || 0),
        nei_costi_coltivazione_podere_verde: r.nei_costi_coltivazione_podere_verde,
        righe: [], imponibile: 0, centri: new Set(),
      });
    }
    const f = mappa.get(chiave);
    f.righe.push(r);
    f.imponibile = round2(f.imponibile + r.imponibile);
    f.centri.add(r.centro_costo);
  }
  return [...mappa.values()];
}

export function campagneDisponibili(righe) {
  return [...new Set(righe.map(r => r.campagna_da_data))].sort().reverse();
}

export function anniDisponibili(righe) {
  return [...new Set(righe.map(r => r.anno))].sort((a, b) => b - a);
}

export function formattaDataItaliana(iso) {
  if (!iso) return "";
  const [a, m, g] = String(iso).slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}
