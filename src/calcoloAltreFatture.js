import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";

// Emissione Fatture → Altre Fatturazioni
// Fatture «libere» di Podere Verde (rifatturazione di costi, vendita di un equino, servizi…):
// righe scritte dall'operatore, ciascuna con quantità, unità di misura, prezzo e aliquota IVA.
// Stessa numerazione «FPR n/aa» delle fatture degli animali, stesso file XML per Aruba.
// Scrive solo nelle tabelle del programma (ci_fatture_emesse, ci_fatture_emesse_righe, ci_clienti).

export const TIPO_ALTRE = "altre_fatturazioni";
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const ALIQUOTE = ["22", "10", "5", "4", "0"];
export const UNITA_MISURA = ["", "KG", "NR", "PZ", "ORE", "LT", "Q", "T", "MC", "HA", "A CORPO"];

// Natura dell'operazione quando l'IVA è 0 (codici della fattura elettronica)
export const NATURE = [
  { codice: "N1", testo: "N1 — Escluse ex articolo 15 del DPR 633/72" },
  { codice: "N2.1", testo: "N2.1 — Non soggette: articoli da 7 a 7-septies del DPR 633/72" },
  { codice: "N2.2", testo: "N2.2 — Non soggette: altri casi" },
  { codice: "N3.1", testo: "N3.1 — Non imponibili: esportazioni" },
  { codice: "N3.2", testo: "N3.2 — Non imponibili: cessioni intracomunitarie" },
  { codice: "N3.3", testo: "N3.3 — Non imponibili: cessioni verso San Marino" },
  { codice: "N3.4", testo: "N3.4 — Non imponibili: operazioni assimilate alle cessioni all'esportazione" },
  { codice: "N3.5", testo: "N3.5 — Non imponibili: a seguito di dichiarazioni d'intento" },
  { codice: "N3.6", testo: "N3.6 — Non imponibili: altre operazioni" },
  { codice: "N4", testo: "N4 — Esenti" },
  { codice: "N5", testo: "N5 — Regime del margine / IVA non esposta in fattura" },
  { codice: "N6.9", testo: "N6.9 — Inversione contabile: altri casi" },
  { codice: "N7", testo: "N7 — IVA assolta in altro stato dell'Unione europea" },
];
// Nature per cui, oltre 77,47 € senza IVA, è dovuta l'imposta di bollo (2 €)
const NATURE_CON_BOLLO = ["N1", "N2.1", "N2.2", "N3.1", "N3.3", "N3.4", "N3.5", "N3.6", "N4", "N5"];
export const SOGLIA_BOLLO = 77.47;
export const IMPORTO_BOLLO = 2;

export function rigaVuota() {
  return { descrizione: "", quantita: "1", unitaMisura: "", prezzo: "", aliquota: "10", natura: "" };
}

const num = v => Number(String(v ?? "").replace(",", "."));

// Righe, riepilogo per aliquota (e natura), totali, bollo suggerito
export function calcolaFatturaLibera(righeInput, bolloScelto) {
  const righe = righeInput.map((r, i) => {
    const quantita = num(r.quantita), prezzo = num(r.prezzo);
    const ok = Number.isFinite(quantita) && Number.isFinite(prezzo) && String(r.quantita).trim() !== "" && String(r.prezzo).trim() !== "";
    return {
      numeroLinea: i + 1, descrizione: (r.descrizione || "").trim(), quantita, prezzo,
      unitaMisura: (r.unitaMisura || "").trim().toUpperCase(), aliquota: Number(r.aliquota), natura: Number(r.aliquota) === 0 ? r.natura : "",
      importo: ok ? round2(quantita * prezzo) : null,
    };
  });
  const gruppi = new Map();
  righe.forEach(r => {
    const chiave = `${r.aliquota}|${r.natura || ""}`;
    const g = gruppi.get(chiave) || { aliquota: r.aliquota, natura: r.natura || "", imponibile: 0 };
    g.imponibile = round2(g.imponibile + (r.importo || 0));
    gruppi.set(chiave, g);
  });
  const riepilogo = [...gruppi.values()].sort((a, b) => b.aliquota - a.aliquota)
    .map(g => ({ ...g, imposta: round2(g.imponibile * g.aliquota / 100) }));
  const imponibile = round2(riepilogo.reduce((s, g) => s + g.imponibile, 0));
  const imposta = round2(riepilogo.reduce((s, g) => s + g.imposta, 0));
  const senzaIvaConBollo = round2(riepilogo.filter(g => g.aliquota === 0 && NATURE_CON_BOLLO.includes(g.natura)).reduce((s, g) => s + g.imponibile, 0));
  const bolloSuggerito = senzaIvaConBollo > SOGLIA_BOLLO;
  const bollo = (bolloScelto ?? bolloSuggerito) ? IMPORTO_BOLLO : 0;
  return { righe, riepilogo, imponibile, imposta, totale: round2(imponibile + imposta), bollo, bolloSuggerito };
}

// Motivi per cui la fattura non si può ancora emettere
export function problemiFattura({ calcolo, numero, data }) {
  const p = [];
  if (!String(numero || "").trim()) p.push("manca il numero della fattura");
  if (!data) p.push("manca la data");
  if (!calcolo.righe.length) p.push("nessuna riga");
  calcolo.righe.forEach(r => {
    const dove = `riga ${r.numeroLinea}`;
    if (!r.descrizione) p.push(`${dove}: manca la descrizione`);
    if (r.importo === null) p.push(`${dove}: quantità o prezzo non validi`);
    if (r.aliquota === 0 && !r.natura) p.push(`${dove}: con IVA 0 va indicata la natura dell'operazione`);
    if (!r.unitaMisura && r.importo !== null && r.quantita !== 1) p.push(`${dove}: con quantità diversa da 1 va indicata l'unità di misura`);
  });
  return p;
}

// Clienti senza doppioni (stesso nome e stessa partita IVA: si tiene il primo)
export async function caricaClienti() {
  const { data, error } = await supabase.from("ci_clienti").select("*").order("nome").order("id");
  if (error) throw new Error(error.message);
  const visti = new Set();
  return (data || []).filter(c => {
    const k = `${(c.nome || "").trim().toUpperCase()}|${(c.partita_iva || "").trim().toUpperCase()}`;
    if (visti.has(k)) return false; visti.add(k); return true;
  });
}

// Fatture precedenti da cui riprendere le righe: quelle «altre» emesse dal programma e le
// fatture attive registrate in contabilità (emesse con Aruba)
export async function caricaFatturePrecedenti() {
  const [emesse, attive] = await Promise.all([
    supabase.from("ci_fatture_emesse").select("id, numero, data, cliente_id, cliente_denominazione, ci_fatture_emesse_righe(*)").eq("tipo", TIPO_ALTRE).eq("stato", "emessa").order("data", { ascending: false }),
    fetchAllPages((da, a) => supabase.from("ci_fatture").select("id, numero, data, cliente_id, ci_clienti(nome), ci_articoli_fattura(id, descrizione, quantita, unita_misura, prezzo_unitario, aliquota_iva)")
      .eq("tipo", "ATTIVA").order("data", { ascending: false }).range(da, a)),
  ]);
  if (emesse.error) throw new Error(emesse.error.message);
  if (attive.error) throw new Error(attive.error.message);
  const elenco = [];
  (emesse.data || []).forEach(f => elenco.push({
    chiave: `p${f.id}`, data: f.data, etichetta: `${f.numero} del ${f.data} — ${f.cliente_denominazione} (dal programma)`, cliente_id: f.cliente_id,
    righe: (f.ci_fatture_emesse_righe || []).filter(r => r.attiva !== false).sort((a, b) => a.numero_linea - b.numero_linea).map(r => ({
      descrizione: r.descrizione, quantita: String(r.quantita_kg), unitaMisura: r.unita_misura || "", prezzo: String(r.prezzo_kg),
      aliquota: String(Number(r.aliquota_iva)), natura: r.natura_iva || "",
    })),
  }));
  (attive.data || []).forEach(f => elenco.push({
    chiave: `c${f.id}`, data: f.data, etichetta: `${f.numero} del ${f.data} — ${f.ci_clienti?.nome || "cliente non indicato"} (da contabilità)`, cliente_id: f.cliente_id,
    righe: (f.ci_articoli_fattura || []).sort((a, b) => a.id - b.id).map(r => ({
      descrizione: r.descrizione || "", quantita: String(Number(r.quantita ?? 1)), unitaMisura: r.unita_misura || "", prezzo: String(Number(r.prezzo_unitario ?? 0)),
      aliquota: String(Number(r.aliquota_iva ?? 10)), natura: "",
    })),
  }));
  return elenco.filter(f => f.righe.length > 0).sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

// creaXml(idFattura) → { xml, nomeFile }
export async function emettiFatturaLibera({ numero, anno, data, cliente, calcolo, note, creaXml }) {
  const aliquote = [...new Set(calcolo.riepilogo.map(g => g.aliquota))];
  const { data: testata, error } = await supabase.from("ci_fatture_emesse").insert({
    numero, anno, data, tipo: TIPO_ALTRE, cliente_id: cliente.id, cliente_denominazione: cliente.nome,
    cliente_partita_iva: cliente.partita_iva, aliquota_iva: aliquote.length === 1 ? aliquote[0] : null,
    imponibile: calcolo.imponibile, imposta: calcolo.imposta, totale: calcolo.totale, bollo: calcolo.bollo || null,
    note: (note || "").trim() || null, stato: "emessa",
  }).select().single();
  if (error) throw new Error(error.message.includes("numero_unico") ? `Il numero ${numero} risulta già usato per una fattura emessa nel ${anno}.` : error.message);

  const righe = calcolo.righe.map(r => ({
    fattura_id: testata.id, numero_linea: r.numeroLinea, descrizione: r.descrizione,
    quantita_kg: r.quantita, prezzo_kg: r.prezzo, unita_misura: r.unitaMisura || null,
    importo: r.importo, aliquota_iva: r.aliquota, natura_iva: r.natura || null,
  }));
  const { error: eR } = await supabase.from("ci_fatture_emesse_righe").insert(righe);
  if (eR) {
    await supabase.from("ci_fatture_emesse").update({ stato: "annullata", annullata_il: new Date().toISOString(), motivo_annullamento: `Registrazione delle righe non riuscita: ${eR.message}` }).eq("id", testata.id);
    throw new Error(eR.message);
  }
  const { xml, nomeFile } = creaXml(testata.id);
  const { error: eX } = await supabase.from("ci_fatture_emesse").update({ xml, nome_file_xml: nomeFile }).eq("id", testata.id);
  if (eX) throw new Error(eX.message);
  return { ...testata, xml, nome_file_xml: nomeFile };
}
