import { supabase } from "./supabase";
import { round2 } from "./parsingUtils";
import { leggiXmlFattura } from "./letturaXmlRicevute";

// Versione 350 (punto 28 dell'elenco dei lavori aperti, Tenente Fatture, 05/11/2026).
// Regola: la testata di una fattura (imponibile, IVA, totale) è quella scritta sul DOCUMENTO
// (riepilogo IVA dell'XML o del PDF), non la somma delle righe. Le righe servono ai costi.
// - ci_fatture.totali_da = 'documento'   → la testata non si ricalcola mai dalle righe;
// - ci_fatture.totali_da = 'somma_righe' → la testata è la somma delle righe (manca il documento)
//   e si aggiorna quando le righe cambiano, finché non arrivano i totali del documento.
// Ogni fattura ha sempre almeno una scadenza: dal documento se c'è, altrimenti una scadenza
// «da completare» (totale alla data della fattura, scadenza non indicata), che si aggiorna da sola
// finché non ha pagamenti abbinati.

export const NOTA_SCADENZA_AUTOMATICA = "Scadenza creata dal programma: il documento non indica la scadenza; da completare";
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Chiave di un documento: partita IVA (senza «IT» e spazi) oppure nome, numero, data
export function chiaveDocumento(pivaONome, numero, data) {
  const p = String(pivaONome || "").toUpperCase().replace(/\s+/g, "").replace(/^IT(?=\d)/, "");
  return `${p}|${String(numero || "").trim().toUpperCase()}|${String(data || "").slice(0, 10)}`;
}

async function sommaRighe(fatturaId) {
  const { data, error } = await supabase.from("ci_articoli_fattura").select("totale_riga, totale_iva").eq("fattura_id", fatturaId);
  if (error) throw new Error(`Lettura delle righe della fattura: ${error.message}`);
  const netto = round2((data || []).reduce((s, r) => s + num(r.totale_riga), 0));
  const iva = round2((data || []).reduce((s, r) => s + num(r.totale_iva), 0));
  return { netto, iva, lordo: round2(netto + iva), righe: (data || []).length };
}

// Confronto righe ↔ testata, per gli avvisi (non scrive nulla)
export async function confrontoRigheTestata(fatturaId) {
  const somma = await sommaRighe(fatturaId);
  const { data: f, error } = await supabase.from("ci_fatture").select("totale_netto, totale_iva, totale_lordo, totali_da").eq("id", fatturaId).single();
  if (error) throw new Error(`Lettura della fattura: ${error.message}`);
  const differenzaImponibile = round2(num(f.totale_netto) - somma.netto);
  return { somma, testata: f, differenzaImponibile, differenzaIva: round2(num(f.totale_iva) - somma.iva), uguali: Math.abs(differenzaImponibile) < 0.005 };
}

// Scrive la testata. doc = { imponibile, iva, totale } presi dal documento, oppure null (somma delle righe)
export async function scriviTestata(fatturaId, doc) {
  const { data: f, error: eF } = await supabase.from("ci_fatture").select("totali_da").eq("id", fatturaId).single();
  if (eF) throw new Error(`Lettura della fattura: ${eF.message}`);
  let valori;
  if (doc && [doc.imponibile, doc.iva, doc.totale].every(v => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)))) {
    valori = { totale_netto: round2(num(doc.imponibile)), totale_iva: round2(num(doc.iva)), totale_lordo: round2(num(doc.totale)), totali_da: "documento" };
  } else if (f.totali_da === "documento") {
    return { scritto: false, motivo: "la testata è già quella del documento: non si ricalcola dalle righe" };
  } else {
    const s = await sommaRighe(fatturaId);
    valori = { totale_netto: s.netto, totale_iva: s.iva, totale_lordo: s.lordo, totali_da: "somma_righe" };
  }
  const { error } = await supabase.from("ci_fatture").update(valori).eq("id", fatturaId);
  if (error) throw new Error(`Testata della fattura non aggiornata: ${error.message}`);
  return { scritto: true, ...valori };
}

// Garantisce le scadenze di un documento.
// documento = { lato: 'fornitore'|'cliente', fatturaId?, fileXml?, fornitoreId?, clienteId?, numero, data,
//               tipoDocumento?, totale, ritenuta?, rate?: [{ importo, scadenza, modalita, iban, giorni }] }
export async function assicuraScadenze(documento) {
  const colonna = documento.fatturaId ? "fattura_id" : documento.fatturaEmessaId ? "fattura_emessa_id" : "file_xml";
  const valore = documento.fatturaId || documento.fatturaEmessaId || documento.fileXml;
  if (!valore) return { create: 0, aggiornate: 0, motivo: "documento senza fattura né file XML: scadenza non creata" };
  const { data: esistenti, error } = await supabase.from("ci_scadenze").select("id, importo, note, scadenza_indicata").eq(colonna, valore);
  if (error) throw new Error(`Lettura delle scadenze: ${error.message}`);
  const segno = num(documento.totale) < 0 ? -1 : 1;
  const totaleDocumento = round2(Math.abs(num(documento.totale)));
  const rate = (documento.rate || []).filter(r => Number.isFinite(Number(r.importo)) && Number(r.importo) !== 0);

  if ((esistenti || []).length > 0) {
    // Si aggiorna solo la scadenza automatica, senza pagamenti abbinati, quando il totale cambia
    const automatiche = esistenti.filter(s => (s.note || "").startsWith(NOTA_SCADENZA_AUTOMATICA));
    if (automatiche.length !== 1 || esistenti.length !== 1) return { create: 0, aggiornate: 0 };
    const s = automatiche[0];
    const { data: abb } = await supabase.from("ci_abbinamenti_pagamenti").select("id").eq("scadenza_id", s.id).limit(1);
    if ((abb || []).length > 0) return { create: 0, aggiornate: 0, motivo: "scadenza con pagamenti: non si cambia" };
    if (rate.length === 0 && round2(num(s.importo)) === round2(segno * totaleDocumento)) return { create: 0, aggiornate: 0 };
    if (rate.length === 0) {
      const { error: eU } = await supabase.from("ci_scadenze").update({ importo: round2(segno * totaleDocumento), totale_documento: totaleDocumento }).eq("id", s.id);
      if (eU) throw new Error(`Scadenza non aggiornata: ${eU.message}`);
      return { create: 0, aggiornate: 1 };
    }
    // Sono arrivati i dati di pagamento del documento: la scadenza automatica lascia il posto a quelle vere
    const { error: eD } = await supabase.from("ci_scadenze").delete().eq("id", s.id);
    if (eD) throw new Error(`Scadenza automatica non sostituita: ${eD.message}`);
  }

  const base = {
    lato: documento.lato, fattura_id: documento.fatturaId || null, fattura_emessa_id: documento.fatturaId ? null : (documento.fatturaEmessaId || null),
    file_xml: (documento.fatturaId || documento.fatturaEmessaId) ? null : documento.fileXml,
    fornitore_id: documento.lato === "fornitore" ? documento.fornitoreId : null,
    cliente_id: documento.lato === "cliente" ? documento.clienteId : null,
    numero_documento: documento.numero, data_documento: documento.data, tipo_documento: documento.tipoDocumento || "TD01",
    totale_documento: totaleDocumento, ritenuta: round2(num(documento.ritenuta)),
  };
  const nuove = rate.length > 0
    ? rate.map((r, i) => ({ ...base, numero_rata: i + 1, importo: round2(segno * Math.abs(num(r.importo))),
        data_scadenza: r.scadenza || documento.data, scadenza_indicata: !!r.scadenza,
        giorni_termine: Number.isFinite(Number(r.giorni)) && r.giorni !== null && r.giorni !== "" ? Number(r.giorni) : null,
        modalita_pagamento: r.modalita || null, iban: r.iban || null, note: r.scadenza ? null : "Il documento non indica la data di scadenza" }))
    : [{ ...base, numero_rata: 1, importo: round2(segno * totaleDocumento), data_scadenza: documento.data, scadenza_indicata: false, note: NOTA_SCADENZA_AUTOMATICA }];
  const { data: inserite, error: eI } = await supabase.from("ci_scadenze").insert(nuove).select("id");
  if (eI) throw new Error(`Scadenze non create: ${eI.message}`);
  return { create: nuove.length, aggiornate: 0, ids: (inserite || []).map(r => r.id) };
}

// Testata + scadenze di una fattura del programma, in un passo solo
export async function applicaDocumento(fatturaId, doc) {
  const testata = await scriviTestata(fatturaId, doc);
  const { data: f, error } = await supabase.from("ci_fatture").select("id, numero, data, tipo, fornitore_id, cliente_id, totale_lordo, tipo_documento, fattura_emessa_id").eq("id", fatturaId).single();
  if (error) throw new Error(`Lettura della fattura: ${error.message}`);
  if (!["PASSIVA", "ATTIVA"].includes(f.tipo)) return { testata, scadenze: { create: 0, aggiornate: 0 } };
  // Una fattura emessa dal programma ha la sua scadenza legata alla fattura emessa: non se ne crea una seconda
  if (f.fattura_emessa_id) return { testata, scadenze: { create: 0, aggiornate: 0, motivo: "scadenza della fattura emessa" } };
  const scadenze = await assicuraScadenze({
    lato: f.tipo === "PASSIVA" ? "fornitore" : "cliente", fatturaId: f.id, fornitoreId: f.fornitore_id, clienteId: f.cliente_id,
    numero: f.numero, data: f.data, tipoDocumento: doc?.tipoDocumento || f.tipo_documento || (num(f.totale_lordo) < 0 ? "TD04" : "TD01"),
    totale: f.totale_lordo, ritenuta: doc?.ritenuta, rate: doc?.rate,
  });
  return { testata, scadenze };
}

// ── Punto 26: le fatture emesse dal programma entrano anche nella tabella delle fatture ─────────────
// Così Ricerca, Dashboard, Report di analisi, Break Even e Fatture di competenza le vedono come le altre
// vendite. Il collegamento è ci_fatture.fattura_emessa_id. Le vendite dei capi (venditeDaFatture.js,
// calcoloStalla.js) leggono già ci_fatture_emesse_righe e quindi SALTANO queste registrazioni, per non
// contare due volte lo stesso capo (condizione del Tenente del 05/11/2026 ore 21:14).
const DESTINAZIONE_DA_SPECIE = { bovino: "Bovini", bovini: "Bovini", suino: "Suini", suini: "Suini", ovino: "Ovini", ovini: "Ovini" };
export const destinazioneDaSpecie = (specie) => DESTINAZIONE_DA_SPECIE[String(specie || "").trim().toLowerCase()] || null;

export async function registraEmessaInContabilita(emessaId) {
  const { data: gia, error: eG } = await supabase.from("ci_fatture").select("id").eq("fattura_emessa_id", emessaId).maybeSingle();
  if (eG) throw new Error(`Controllo della registrazione: ${eG.message}`);
  if (gia) return { fatturaId: gia.id, giaRegistrata: true };
  const { data: e, error: eE } = await supabase.from("ci_fatture_emesse")
    .select("id, numero, data, cliente_id, imponibile, imposta, totale, stato, nome_file_xml, ci_fatture_emesse_righe(numero_linea, descrizione, quantita_kg, unita_misura, prezzo_kg, importo, aliquota_iva, specie, matricola, attiva)")
    .eq("id", emessaId).single();
  if (eE) throw new Error(`Lettura della fattura emessa: ${eE.message}`);
  if (e.stato !== "emessa") return { fatturaId: null, motivo: "fattura emessa annullata: non si registra" };
  const righeEmesse = (e.ci_fatture_emesse_righe || []).filter(r => r.attiva !== false).sort((a, b) => a.numero_linea - b.numero_linea);
  if (righeEmesse.length === 0) throw new Error(`La fattura ${e.numero} non ha righe: non si registra`);
  const { data: testata, error: eT } = await supabase.from("ci_fatture").insert([{
    numero: e.numero, data: e.data, tipo: "ATTIVA", cliente_id: e.cliente_id,
    totale_netto: round2(num(e.imponibile)), totale_iva: round2(num(e.imposta)), totale_lordo: round2(num(e.totale)), totali_da: "documento",
    provenienza: "programma", tipo_documento: "TD01", nome_file_xml: e.nome_file_xml || null, fattura_emessa_id: e.id,
    note: "Fattura emessa dal programma (registrata da sola, versione 350)",
  }]).select("id").single();
  if (eT) throw new Error(`Registrazione della fattura ${e.numero}: ${eT.message}`);
  const righe = righeEmesse.map(r => ({
    fattura_id: testata.id, descrizione: r.descrizione, quantita: num(r.quantita_kg), unita_misura: r.unita_misura || (r.specie ? "Kilogrammi" : null),
    prezzo_unitario: num(r.prezzo_kg), totale_riga: round2(num(r.importo)), aliquota_iva: num(r.aliquota_iva),
    totale_iva: round2(num(r.importo) * num(r.aliquota_iva) / 100), destinazione: destinazioneDaSpecie(r.specie), matricole: r.matricola || null,
  }));
  const { error: eR } = await supabase.from("ci_articoli_fattura").insert(righe);
  if (eR) {
    await supabase.from("ci_fatture").delete().eq("id", testata.id);
    throw new Error(`Righe della fattura ${e.numero} non registrate: ${eR.message}`);
  }
  return { fatturaId: testata.id, giaRegistrata: false };
}

// Fattura emessa annullata: la sua registrazione esce dalla tabella delle fatture (righe e testata)
export async function togliEmessaDaContabilita(emessaId) {
  const { data: f, error } = await supabase.from("ci_fatture").select("id").eq("fattura_emessa_id", emessaId).maybeSingle();
  if (error) throw new Error(`Controllo della registrazione: ${error.message}`);
  if (!f) return { tolta: false };
  const { error: eR } = await supabase.from("ci_articoli_fattura").delete().eq("fattura_id", f.id);
  if (eR) throw new Error(`Righe non tolte: ${eR.message}`);
  const { error: eF } = await supabase.from("ci_fatture").delete().eq("id", f.id);
  if (eF) throw new Error(`Registrazione non tolta (ha scadenze o pagamenti propri?): ${eF.message}`);
  return { tolta: true };
}

// Dopo l'emissione: registrazione nella tabella delle fatture e scadenza presa dall'XML appena creato
// (DatiPagamento: modalità, data e importo). Un errore qui NON annulla la fattura emessa: si segnala.
export async function dopoEmissione({ emessaId, clienteId, numero, data, totale, xml, nomeFile }) {
  const avvisi = [];
  try { await registraEmessaInContabilita(emessaId); }
  catch (err) { avvisi.push(`registrazione nella tabella delle fatture non riuscita (${err.message})`); }
  try {
    let rate = [];
    try { rate = (leggiXmlFattura(nomeFile || "fattura.xml", xml)[0] || {}).rate || []; } catch { rate = []; }
    await assicuraScadenze({ lato: "cliente", fatturaEmessaId: emessaId, clienteId, numero, data, tipoDocumento: "TD01", totale, rate });
  } catch (err) { avvisi.push(`scadenza non creata (${err.message})`); }
  // Le pagine dell'emissione non sono cambiate nella versione 350: l'avviso si dà qui
  if (avvisi.length && typeof window !== "undefined") window.alert(`⚠️ La fattura ${numero} è emessa, ma:\n\n- ${avvisi.join("\n- ")}\n\nAvvisare il Tenente Fatture.`);
  return avvisi;
}
