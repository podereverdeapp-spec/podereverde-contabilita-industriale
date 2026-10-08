import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";

// Emissione Fatture → Fatturazione Animali Allevamento
// - uscite_consegne (app Podere Verde): SOLA LETTURA. Qui non si scrive mai.
// - uscite_consegne_pezzi (app, versione 238): SOLA LETTURA. I pezzi del capo con il numero di partita
//   del cliente: suino «mezzena 1» e «mezzena 2», bovino «quarto 1»…«quarto 4», ovino «carcassa intera».
// - Tabelle del programma: ci_fatture_emesse, ci_fatture_emesse_righe (una riga per PEZZO, oppure una
//   riga unica per il capo quando i pesi dei pezzi mancano), ci_uscite_cliente_assegnato,
//   ci_pezzi_cliente_assegnato, ci_clienti_alias, ci_prezzi_clienti, ci_clienti, ci_parametri.
// Versione 238 (decisione del Dott. Bizzarri dell'08/10/2026, regola unica con l'app):
//   «pronto da fatturare» = tutti i pezzi presenti con il numero di partita e nessuna riga di fattura attiva;
//   «fatturato» = almeno una riga di fattura ATTIVA. La colonna stato di uscite_consegne non si usa più.

export const STATO_DA_FATTURARE = "pronto da fatturare";
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const norm = s => (s || "").trim().toUpperCase().replace(/\s+/g, " ");

// ── Prodotti e descrizioni ─────────────────────────────────────────────────────
export const PRODOTTI = {
  // versione 238: il pezzo (mezzena, quarto) è scritto nella riga, la descrizione dice solo la specie
  bovino: { prodotto: "Bovino", descrizione: "BOVINO" },
  suino: { prodotto: "Suino", descrizione: "SUINO" },
  ovino: { prodotto: "Ovino", descrizione: "OVINO" },
};
export function prodottoDi(specie) {
  return PRODOTTI[specie] || { prodotto: specie ? specie[0].toUpperCase() + specie.slice(1) : "Altro", descrizione: (specie || "CAPO").toUpperCase() };
}
// Parole chiave per ritrovare l'ultimo prezzo nelle fatture attive registrate prima di questo modulo
const PAROLE_STORICHE = { Bovino: /SCOTTON|BOVIN|VITELL|MANZ/i, Suino: /SUIN|CINTA/i, Ovino: /OVIN|AGNELL/i };

// ── Dati fissi di Podere Verde in fattura (ci_parametri) ─────────────────────────
export const CHIAVE_CEDENTE = "fattura_elettronica_cedente";
// Valori ripresi dalla fattura FPR 8/26 emessa con Aruba (modificabili dalla pagina)
export const CEDENTE_PREDEFINITO = {
  partitaIva: "15117871002", codiceFiscale: "15117871002",
  denominazione: "SOC. AGRICOLA PODERE VERDE A R.L.", regimeFiscale: "RF01",
  indirizzo: "VIA PORTUENSE", numeroCivico: "1118", cap: "00148", comune: "Roma", provincia: "RM", nazione: "IT",
  reaUfficio: "RM", reaNumero: "1568951", capitaleSociale: "10000.00", socioUnico: "SM", statoLiquidazione: "LN",
  email: "",
  idTrasmittentePaese: "IT", idTrasmittenteCodice: "01879020517",
  condizioniPagamento: "TP02", modalitaPagamento: "MP05", istitutoFinanziario: "BPER BANCA", iban: "IT95I0538703206000047492923",
  aliquotaIva: "10", prefissoNumero: "FPR",
};

export async function caricaCedente() {
  const { data, error } = await supabase.from("ci_parametri").select("valore").eq("chiave", CHIAVE_CEDENTE).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.valore) return { ...CEDENTE_PREDEFINITO, salvato: false };
  try { return { ...CEDENTE_PREDEFINITO, ...JSON.parse(data.valore), salvato: true }; }
  catch { return { ...CEDENTE_PREDEFINITO, salvato: false }; }
}
export async function salvaCedente(cedente) {
  const { salvato, ...dati } = cedente;
  const { error } = await supabase.from("ci_parametri").upsert({
    chiave: CHIAVE_CEDENTE, valore: JSON.stringify(dati),
    descrizione: "Dati di Podere Verde (cedente) e di pagamento per le fatture elettroniche emesse dal programma",
    updated_at: new Date().toISOString(),
  }, { onConflict: "chiave" });
  if (error) throw new Error(error.message);
}

// ── Pezzi del capo (versione 238) ───────────────────────────────────────────────
export const PEZZI_PER_SPECIE = {
  suino: ["mezzena 1", "mezzena 2"],
  bovino: ["quarto 1", "quarto 2", "quarto 3", "quarto 4"],
  ovino: ["carcassa intera"],
};
export function pezziAttesi(specie) { return PEZZI_PER_SPECIE[(specie || "").trim().toLowerCase()] || []; }
const TOLLERANZA_KG = 0.005;

// Capi usciti con quello che resta da fatturare. Per ogni capo:
//   pezzi (tutti), pezziDaFatturare, fatturatoIntero, mancanti (dati che impediscono la fattura),
//   pesoPezzi (somma, se tutti pesati), avvisoPesi (somma dei pezzi diversa dalla carcassa)
async function capiConPezzi() {
  const [uscR, pezR, attR, assPR] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("uscite_consegne").select("*").order("data_uscita").order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("uscite_consegne_pezzi").select("*").order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("ci_fatture_emesse_righe")
      .select("uscita_consegna_id, uscita_consegna_pezzo_id").eq("attiva", true).not("uscita_consegna_id", "is", null).range(da, a)),
    supabase.from("ci_pezzi_cliente_assegnato").select("*"),
  ]);
  for (const r of [uscR, pezR, attR, assPR]) if (r.error) throw new Error(r.error.message);
  const pezziFatturati = new Set((attR.data || []).filter(r => r.uscita_consegna_pezzo_id).map(r => r.uscita_consegna_pezzo_id));
  const capiInteriFatturati = new Set((attR.data || []).filter(r => !r.uscita_consegna_pezzo_id).map(r => r.uscita_consegna_id));
  const assegnatiPezzo = new Map((assPR.data || []).map(a => [a.uscita_consegna_pezzo_id, a]));
  const pezziPerCapo = new Map();
  (pezR.data || []).forEach(p => {
    if (!pezziPerCapo.has(p.uscita_consegna_id)) pezziPerCapo.set(p.uscita_consegna_id, []);
    pezziPerCapo.get(p.uscita_consegna_id).push({ ...p, fatturato: pezziFatturati.has(p.id), assegnato: assegnatiPezzo.get(p.id) || null });
  });

  const capi = [];
  for (const u of uscR.data || []) {
    if (capiInteriFatturati.has(u.id)) continue;                         // fatturato in una riga unica
    const attesi = pezziAttesi(u.specie);
    const pezzi = (pezziPerCapo.get(u.id) || []).sort((a, b) => attesi.indexOf(a.pezzo) - attesi.indexOf(b.pezzo));
    const pezziDaFatturare = pezzi.filter(p => !p.fatturato);
    if (pezzi.length && !pezziDaFatturare.length) continue;              // tutti i pezzi già fatturati
    const mancanti = [];
    const nomi = new Set(pezzi.filter(p => (p.numero_partita || "").trim()).map(p => p.pezzo));
    const senzaPartita = attesi.filter(n => !nomi.has(n));
    if (!attesi.length) mancanti.push(`specie «${u.specie || "vuota"}» senza pezzi previsti`);
    else if (senzaPartita.length) mancanti.push(`numero di partita: ${senzaPartita.join(", ")}`);
    const pesati = pezzi.length === attesi.length && attesi.length > 0 && pezzi.every(p => Number(p.peso_kg) > 0);
    const pesoPezzi = pesati ? round2(pezzi.reduce((s, p) => s + Number(p.peso_kg), 0)) : null;
    const avvisoPesi = pesati && u.peso_carcassa != null && Math.abs(pesoPezzi - Number(u.peso_carcassa)) > TOLLERANZA_KG
      ? `la somma dei pesi dei pezzi (${String(pesoPezzi).replace(".", ",")} kg) non torna con il peso della carcassa (${String(Number(u.peso_carcassa)).replace(".", ",")} kg)` : null;
    capi.push({ ...u, pezzi, pezziDaFatturare, pesati, pesoPezzi, avvisoPesi, mancanti, numero_partita: descriviPartite(pezzi) });
  }
  return capi;
}

// «mezzena 1: 4512 · mezzena 2: 4513»
export function descriviPartite(pezzi) {
  return (pezzi || []).map(p => `${p.pezzo}: ${p.numero_partita || "—"}`).join(" · ");
}

// Numero per l'avviso nel menu e nella striscia rossa: capi con qualcosa ancora da fatturare
export async function contaUsciteDaFatturare() {
  return (await capiConPezzi()).length;
}

// ── Elenco «Uscite da Fatturare» (raggruppato per cliente e data) ──────────────
export async function caricaUsciteDaFatturare() {
  const [righe, { data: clienti, error: eC }] = await Promise.all([
    capiConPezzi(),
    supabase.from("ci_clienti").select("id, nome, partita_iva"),
  ]);
  if (eC) throw new Error(eC.message);
  const nomiClienti = new Set((clienti || []).map(c => norm(c.nome)));
  const idClienti = new Set((clienti || []).map(c => c.id));
  const nomePerId = new Map((clienti || []).map(c => [c.id, c.nome]));

  const capi = righe.map(r => {
    const mancanti = [...r.mancanti];
    if (r.peso_carcassa == null) mancanti.push("peso della carcassa");
    if (r.peso_vivo == null) mancanti.push("peso vivo");
    if (!r.modello4_numero) mancanti.push("modello 4");
    if (!r.cliente_nome && !r.cliente_id) mancanti.push("cliente");
    const clienteInAnagrafica = r.cliente_id ? idClienti.has(r.cliente_id) : nomiClienti.has(norm(r.cliente_nome));
    return { ...r, cliente_nome: r.cliente_nome || nomePerId.get(r.cliente_id) || null, mancanti, clienteInAnagrafica };
  });

  const gruppi = new Map();
  capi.forEach(c => {
    const chiave = `${c.cliente_nome || "Cliente non indicato"}|${c.data_uscita || ""}`;
    if (!gruppi.has(chiave)) gruppi.set(chiave, { cliente: c.cliente_nome || "Cliente non indicato", dataUscita: c.data_uscita, capi: [] });
    gruppi.get(chiave).capi.push(c);
  });
  return [...gruppi.values()].map(g => ({
    ...g,
    kgCarcassa: g.capi.reduce((s, c) => s + (Number(c.peso_carcassa) || 0), 0),
    kgVivo: g.capi.reduce((s, c) => s + (Number(c.peso_vivo) || 0), 0),
    completi: g.capi.every(c => c.mancanti.length === 0 && c.clienteInAnagrafica),
  })).sort((a, b) => (a.dataUscita || "").localeCompare(b.dataUscita || "") || a.cliente.localeCompare(b.cliente));
}

// ── Preparazione fatture ───────────────────────────────────────────────────────
// Ritorna: fatture proposte (una per cliente), capi con cliente da assegnare, capi esclusi
// per dati mancanti, anagrafica clienti, numero proposto.
export async function caricaPreparazione(dataDa, dataA) {
  const [capiTutti, clientiR, aliasR, assegnR, prezziR, attiveR, emesseR] = await Promise.all([
    capiConPezzi(),
    supabase.from("ci_clienti").select("*").order("nome"),
    supabase.from("ci_clienti_alias").select("*"),
    supabase.from("ci_uscite_cliente_assegnato").select("*"),
    supabase.from("ci_prezzi_clienti").select("*"),
    supabase.from("ci_fatture").select("id, numero, data, cliente_id, ci_articoli_fattura(descrizione, prezzo_unitario)").eq("tipo", "ATTIVA").order("data", { ascending: false }),
    supabase.from("ci_fatture_emesse").select("numero, anno, data").eq("stato", "emessa"),
  ]);
  for (const r of [clientiR, aliasR, assegnR, prezziR, attiveR, emesseR]) if (r.error) throw new Error(r.error.message);

  const clienti = clientiR.data || [];
  const clientePerId = new Map(clienti.map(c => [c.id, c]));
  const clientePerNome = new Map();
  clienti.forEach(c => { const k = norm(c.nome); if (!clientePerNome.has(k)) clientePerNome.set(k, c); });
  const alias = new Map((aliasR.data || []).map(a => [norm(a.nome_scritto), a.cliente_id]));
  const assegnati = new Map((assegnR.data || []).map(a => [a.uscita_consegna_id, a]));

  const capi = capiTutti.filter(c => (!dataDa || (c.data_uscita || "") >= dataDa) && (!dataA || (c.data_uscita || "") <= dataA));

  // Cliente da un nome scritto: nome collegato > nome identico
  function clienteDaNome(nome) {
    if (!nome) return null;
    const viaAlias = alias.get(norm(nome));
    if (viaAlias && clientePerId.has(viaAlias)) return { cliente: clientePerId.get(viaAlias), origine: "nome collegato" };
    const viaNome = clientePerNome.get(norm(nome));
    return viaNome ? { cliente: viaNome, origine: "app" } : null;
  }
  // Cliente del capo: assegnato dall'addetto > scelto nell'app > nome collegato > nome identico
  function clienteDelCapo(c) {
    const a = assegnati.get(c.id);
    if (a && clientePerId.has(a.cliente_id)) return { cliente: clientePerId.get(a.cliente_id), origine: "assegnato" };
    if (c.cliente_id && clientePerId.has(c.cliente_id)) return { cliente: clientePerId.get(c.cliente_id), origine: "app" };
    return clienteDaNome(c.cliente_nome);
  }
  // Cliente del pezzo: assegnato al pezzo > scelto per il pezzo nell'app > nome del pezzo > cliente del capo
  // (pezzoDiverso = il pezzo ha un cliente suo; se non si riconosce, va assegnato al pezzo)
  function clienteDelPezzo(p, capo) {
    if (p.assegnato && clientePerId.has(p.assegnato.cliente_id)) return { cliente: clientePerId.get(p.assegnato.cliente_id), origine: "assegnato al pezzo", pezzoDiverso: true };
    if (p.cliente_id && clientePerId.has(p.cliente_id)) return { cliente: clientePerId.get(p.cliente_id), origine: "app (pezzo)", pezzoDiverso: true };
    if (p.cliente_nome) { const n = clienteDaNome(p.cliente_nome); return n ? { ...n, pezzoDiverso: true } : { cliente: null, pezzoDiverso: true }; }
    const cc = clienteDelCapo(capo);
    return cc ? { ...cc, pezzoDiverso: false } : { cliente: null, pezzoDiverso: false };
  }

  // Ultimo prezzo per cliente e prodotto: tabella dei prezzi confermati, altrimenti l'ultima
  // fattura attiva registrata con quel prodotto nella descrizione
  const prezziConfermati = new Map((prezziR.data || []).map(p => [`${p.cliente_id}|${p.prodotto}`, p]));
  function ultimoPrezzo(clienteId, prodotto) {
    const p = prezziConfermati.get(`${clienteId}|${prodotto}`);
    if (p) return { prezzo: Number(p.prezzo_kg), fonte: p.fonte || "ultimo prezzo confermato" };
    const rx = PAROLE_STORICHE[prodotto];
    if (!rx) return null;
    for (const f of attiveR.data || []) {
      if (f.cliente_id !== clienteId) continue;
      const riga = (f.ci_articoli_fattura || []).find(r => rx.test(r.descrizione || "") && Number(r.prezzo_unitario) > 0);
      if (riga) return { prezzo: Number(riga.prezzo_unitario), fonte: `fattura ${f.numero} del ${f.data}` };
    }
    return null;
  }

  // Suggerimento per i capi senza cliente: l'ultimo cliente fatturato per lo stesso macello
  const ultimoClientePerMacello = new Map();

  // Le «voci» da fatturare: un pezzo (quando tutti i pezzi del capo sono pesati) oppure il capo intero
  // (pesi dei pezzi mancanti: una riga con i chili della carcassa e tutte le partite in descrizione)
  const fatture = new Map(), daAssegnare = [], esclusi = [];
  capi.forEach(c => {
    const base = { ...c, ...prodottoDi(c.specie), capoId: c.id };
    const mancanti = [...c.mancanti];
    if (!c.modello4_numero) mancanti.push("modello 4");
    const pezziGiaFatturati = c.pezzi.some(p => p.fatturato);
    if (c.pesati) {
      c.pezziDaFatturare.forEach(p => {
        const cp = clienteDelPezzo(p, c);
        const voce = { ...base, id: `p${p.id}`, chiave: `p${p.id}`, pezzoId: p.id, pezzo: p.pezzo, numero_partita: p.numero_partita,
          kg: round2(Number(p.peso_kg)), origineCliente: cp.cliente ? cp.origine : null,
          assegna: cp.pezzoDiverso ? { tipo: "pezzo", id: p.id, nomeScritto: p.cliente_nome || null } : { tipo: "capo", id: c.id, nomeScritto: c.cliente_nome || null },
          cliente_nome: cp.pezzoDiverso ? (p.cliente_nome || c.cliente_nome) : c.cliente_nome };
        if (!cp.cliente) { daAssegnare.push({ ...voce, mancanti }); return; }
        if (mancanti.length) { esclusi.push({ ...voce, mancanti, cliente: cp.cliente }); return; }
        aggiungi(cp.cliente, voce, c);
      });
      return;
    }
    // capo intero
    const voce = { ...base, id: `c${c.id}`, chiave: `c${c.id}`, pezzoId: null, pezzo: null, numero_partita: descriviPartite(c.pezzi),
      kg: c.peso_carcassa != null ? round2(Number(c.peso_carcassa)) : null, assegna: { tipo: "capo", id: c.id, nomeScritto: c.cliente_nome || null } };
    if (c.peso_carcassa == null || !(Number(c.peso_carcassa) > 0)) mancanti.push("peso della carcassa");
    if (pezziGiaFatturati) mancanti.push("alcuni pezzi sono già fatturati: servono i pesi di tutti i pezzi per fatturare gli altri");
    const clientiPezzi = new Set(c.pezzi.map(p => { const cp = clienteDelPezzo(p, c); return cp.pezzoDiverso ? (cp.cliente ? `id${cp.cliente.id}` : `nome${norm(p.cliente_nome)}`) : "capo"; }));
    if (clientiPezzi.size > 1) mancanti.push("pezzi a clienti diversi: servono i pesi di ogni pezzo");
    const cc = clienteDelCapo(c);
    voce.origineCliente = cc?.origine || null;
    if (!cc) { daAssegnare.push({ ...voce, mancanti }); return; }
    if (mancanti.length) { esclusi.push({ ...voce, mancanti, cliente: cc.cliente }); return; }
    aggiungi(cc.cliente, voce, c);
  });
  function aggiungi(cliente, voce, capo) {
    if (capo.destinatario) ultimoClientePerMacello.set(norm(capo.destinatario), cliente);
    if (!fatture.has(cliente.id)) fatture.set(cliente.id, { cliente, capi: [] });
    fatture.get(cliente.id).capi.push(voce);
  }

  const elencoFatture = [...fatture.values()].map(f => {
    const prodotti = [...new Set(f.capi.map(c => c.prodotto))].map(prodotto => {
      const up = ultimoPrezzo(f.cliente.id, prodotto);
      return { prodotto, descrizione: f.capi.find(c => c.prodotto === prodotto).descrizione, prezzoProposto: up?.prezzo ?? null, fonte: up?.fonte || null };
    });
    return { ...f, prodotti, nCapi: new Set(f.capi.map(c => c.capoId)).size, kgCarcassa: round2(f.capi.reduce((s, c) => s + Number(c.kg), 0)) };
  }).sort((a, b) => a.cliente.nome.localeCompare(b.cliente.nome));

  daAssegnare.forEach(c => { c.suggerito = c.destinatario ? ultimoClientePerMacello.get(norm(c.destinatario)) || null : null; });

  return { fatture: elencoFatture, daAssegnare, esclusi, clienti, numeroProposto: numeroSuccessivo(emesseR.data || [], attiveR.data || []) };
}

// Numero successivo «FPR n/aa» dell'anno in corso. La numerazione è unica per tutte le fatture
// di Podere Verde (animali e altre): si guarda sia a quelle emesse dal programma sia a quelle
// emesse con Aruba e caricate in contabilità (fatture attive «FPR n/aa» dell'anno).
function numeroSuccessivo(emesse, attive = []) {
  const anno = new Date().getFullYear();
  const aa = String(anno).slice(-2);
  const daProgramma = emesse.filter(f => f.anno === anno).map(f => parseInt(String(f.numero).replace(/^\D+/, ""), 10));
  const daContabilita = attive.filter(f => String(f.data || "").startsWith(String(anno)))
    .map(f => { const m = String(f.numero || "").match(/(\d+)\s*\/\s*(\d{2})\s*$/); return m && m[2] === aa ? parseInt(m[1], 10) : NaN; });
  const nums = [...daProgramma, ...daContabilita].filter(Number.isFinite);
  if (!nums.length) return null;
  return Math.max(...nums) + 1;
}
export async function caricaNumeroProposto() {
  const [e, a] = await Promise.all([
    supabase.from("ci_fatture_emesse").select("numero, anno").eq("stato", "emessa"),
    supabase.from("ci_fatture").select("numero, data").eq("tipo", "ATTIVA"),
  ]);
  return numeroSuccessivo(e.data || [], a.data || []);
}
export function componiNumero(prefisso, n, anno) {
  return `${prefisso} ${n}/${String(anno).slice(-2)}`;
}

// ── Righe della fattura ────────────────────────────────────────────────────────
export function descrizioneRiga(capo, descrizioneProdotto) {
  const parti = [`${descrizioneProdotto} ${capo.matricola || ""}`.trim()];
  if (capo.lotto) parti.push(`LOTTO ${capo.lotto}`);
  parti.push(`MOD. 4 ${capo.modello4_numero}`);
  if (capo.pezzoId) parti.push(`${capo.pezzo.toUpperCase()} PARTITA ${capo.numero_partita}`);
  else if ((capo.pezzi || []).length) parti.push(`PARTITE ${capo.pezzi.map(p => `${p.pezzo.toUpperCase()} ${p.numero_partita}`).join(", ")}`);
  else parti.push(`PARTITA ${capo.numero_partita}`);
  return `${parti.join(" - ")} - KG`;
}

export function calcolaFattura(capi, prezzi, descrizioni, aliquota) {
  const righe = capi.map((c, i) => {
    const kg = round2(c.kg ?? c.peso_carcassa);
    const prezzo = Number(prezzi[c.prodotto]);
    return {
      numeroLinea: i + 1, capo: c, descrizione: descrizioneRiga(c, descrizioni[c.prodotto] || c.descrizione),
      quantita: kg, prezzo, importo: Number.isFinite(prezzo) ? round2(kg * prezzo) : null,
    };
  });
  const imponibile = round2(righe.reduce((s, r) => s + (r.importo || 0), 0));
  const imposta = round2(imponibile * Number(aliquota) / 100);
  return { righe, imponibile, imposta, totale: round2(imponibile + imposta) };
}

// ── Scritture (solo tabelle del programma) ─────────────────────────────────────
// destinazione: { tipo: "capo" | "pezzo", id } (versione 238); un numero = id del capo (come prima)
export async function assegnaCliente(destinazione, clienteId, nota, nomeScritto) {
  const d = typeof destinazione === "object" ? destinazione : { tipo: "capo", id: destinazione };
  const { error } = d.tipo === "pezzo"
    ? await supabase.from("ci_pezzi_cliente_assegnato").upsert({ uscita_consegna_pezzo_id: d.id, cliente_id: clienteId, nota: nota || null, assegnato_il: new Date().toISOString() })
    : await supabase.from("ci_uscite_cliente_assegnato").upsert({ uscita_consegna_id: d.id, cliente_id: clienteId, nota: nota || null, assegnato_il: new Date().toISOString() });
  if (error) throw new Error(error.message);
  if (nomeScritto) {
    const { error: eA } = await supabase.from("ci_clienti_alias").upsert({ nome_scritto: norm(nomeScritto), cliente_id: clienteId });
    if (eA) throw new Error(eA.message);
  }
}

export async function salvaCliente(cliente) {
  const campi = {
    nome: (cliente.nome || "").trim(), partita_iva: (cliente.partita_iva || "").trim() || null, codice_fiscale: (cliente.codice_fiscale || "").trim() || null,
    indirizzo: (cliente.indirizzo || "").trim() || null, cap: (cliente.cap || "").trim() || null, citta: (cliente.citta || "").trim() || null,
    provincia: (cliente.provincia || "").trim().toUpperCase() || null, nazione: (cliente.nazione || "IT").trim().toUpperCase(),
    codice_destinatario: (cliente.codice_destinatario || "").trim().toUpperCase() || null, pec: (cliente.pec || "").trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (cliente.id) {
    const { data, error } = await supabase.from("ci_clienti").update(campi).eq("id", cliente.id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase.from("ci_clienti").insert({ ...campi, attivo: true }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// Dati del cliente che la fattura elettronica richiede
export function datiMancantiCliente(c) {
  const m = [];
  if (!c.partita_iva && !c.codice_fiscale) m.push("partita IVA o codice fiscale");
  if (!c.indirizzo) m.push("indirizzo");
  if (!c.cap) m.push("CAP");
  if (!c.citta) m.push("comune");
  if ((c.nazione || "IT") === "IT" && !c.provincia) m.push("provincia");
  if (!c.codice_destinatario && !c.pec) m.push("codice destinatario o PEC");
  return m;
}

// creaXml(idFattura) → { xml, nomeFile }: il nome del file dipende dall'id assegnato alla fattura
export async function emettiFattura({ numero, anno, data, cliente, calcolo, aliquota, creaXml, prezzi }) {
  const { data: testata, error } = await supabase.from("ci_fatture_emesse").insert({
    numero, anno, data, tipo: "animali_allevamento", cliente_id: cliente.id, cliente_denominazione: cliente.nome,
    cliente_partita_iva: cliente.partita_iva, aliquota_iva: aliquota, imponibile: calcolo.imponibile, imposta: calcolo.imposta,
    totale: calcolo.totale, stato: "emessa",
  }).select().single();
  if (error) throw new Error(error.message.includes("numero_unico") ? `Il numero ${numero} risulta già usato per una fattura emessa nel ${anno}.` : error.message);

  const righe = calcolo.righe.map(r => ({
    fattura_id: testata.id, numero_linea: r.numeroLinea, uscita_consegna_id: r.capo.capoId ?? r.capo.id,
    uscita_consegna_pezzo_id: r.capo.pezzoId || null, pezzo: r.capo.pezzo || null, specie: r.capo.specie, prodotto: r.capo.prodotto,
    matricola: r.capo.matricola, lotto: r.capo.lotto || null, modello4_numero: r.capo.modello4_numero, numero_partita: r.capo.numero_partita,
    data_uscita: r.capo.data_uscita, descrizione: r.descrizione, quantita_kg: r.quantita, prezzo_kg: r.prezzo, importo: r.importo, aliquota_iva: aliquota,
  }));
  const { error: eR } = await supabase.from("ci_fatture_emesse_righe").insert(righe);
  if (eR) {
    // senza righe la fattura non vale: la si segna annullata, così il numero torna libero
    await supabase.from("ci_fatture_emesse").update({ stato: "annullata", annullata_il: new Date().toISOString(), motivo_annullamento: `Registrazione delle righe non riuscita: ${eR.message}` }).eq("id", testata.id);
    throw new Error(/capo_unico|pezzo_unico|capo_intero_unico|GIÀ FATTURATO/.test(eR.message)
      ? "Uno o più capi o pezzi risultano già fatturati in un'altra fattura: aggiornare la pagina. Nessuna fattura registrata (numero di nuovo libero)." : eR.message);
  }

  const { xml, nomeFile } = creaXml(testata.id);
  const { error: eX } = await supabase.from("ci_fatture_emesse").update({ xml, nome_file_xml: nomeFile }).eq("id", testata.id);
  if (eX) throw new Error(eX.message);

  const oggi = new Date().toISOString();
  const prezziDaSalvare = Object.entries(prezzi).map(([prodotto, prezzo]) => ({
    cliente_id: cliente.id, prodotto, prezzo_kg: Number(prezzo), fonte: `fattura ${numero} del ${data}`, aggiornato_il: oggi,
  }));
  if (prezziDaSalvare.length) await supabase.from("ci_prezzi_clienti").upsert(prezziDaSalvare);
  return { ...testata, xml, nome_file_xml: nomeFile };
}

export async function caricaFattureEmesse() {
  const { data, error } = await fetchAllPages((da, a) => supabase.from("ci_fatture_emesse")
    .select("*, ci_fatture_emesse_righe(*)").order("data", { ascending: false }).order("id", { ascending: false }).range(da, a));
  if (error) throw new Error(error.message);
  return data || [];
}

export async function annullaFattura(id, motivo) {
  const { error } = await supabase.from("ci_fatture_emesse").update({ stato: "annullata", annullata_il: new Date().toISOString(), motivo_annullamento: motivo }).eq("id", id);
  if (error) throw new Error(error.message);
  const { error: eR } = await supabase.from("ci_fatture_emesse_righe").update({ attiva: false }).eq("fattura_id", id);
  if (eR) throw new Error(eR.message);
}
