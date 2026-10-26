import JSZip from "jszip";
import { supabase } from "./supabase";
import { fetchAllPages, round2 } from "./parsingUtils";

// Versione 300 (decisione del Dott. Bizzarri del 26/10/2026, ore 13:14) — «Controllo Fatturazione Attiva e Numero Progressivo».
// Le fatture di vendita si leggono dai file XML di Aruba (preparati da Claude in un solo .zip con l'elenco degli stati):
// - una fattura emessa dal programma (ci_fatture_emesse) trovata in Aruba si COLLEGA: non si registra due volte;
// - una fattura già registrata in contabilità (ci_fatture, tipo ATTIVA) si confronta e si aggiorna lo stato di Aruba;
// - una fattura nuova si registra in ci_fatture (ATTIVA) con le sue righe in ci_articoli_fattura, come faceva
//   «Carica Fatture Attive»: così entra nei ricavi dei report e nel riconoscimento dei capi venduti;
// - i dati mancanti del cliente (indirizzo, CAP, comune, provincia, codice destinatario, PEC) si completano dalla fattura.
// Scrive solo nelle tabelle del programma: ci_fatture, ci_articoli_fattura, ci_clienti, ci_fatture_emesse, ci_letture_aruba.

export const PARTITA_IVA_PODERE = "15117871002";
export const DESTINAZIONI = ["Bovini", "Suini", "Ovini", "Generali", "Pollame", "Cavalli"];
const TOLLERANZA = 0.01;
const TIPI_DOCUMENTO = { TD01: "Fattura", TD02: "Acconto su fattura", TD04: "Nota di credito", TD05: "Nota di debito", TD06: "Parcella", TD24: "Fattura differita", TD25: "Fattura differita" };
export const nomeTipo = t => TIPI_DOCUMENTO[t] || t || "";

// ── Numero: «FPR 9/26», «FPR9/26», «fpr 09/26» sono lo stesso numero ───────────────────────────────
export const chiaveNumero = (numero, anno) => `${String(numero || "").toUpperCase().replace(/[^A-Z0-9/]/g, "").replace(/(^|\D)0+(\d)/g, "$1$2")}|${anno}`;
export function progressivoDi(numero) {
  const m = String(numero || "").match(/(\d+)\s*\/\s*\d{2,4}\s*$/) || String(numero || "").match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}
const senzaIT = p => String(p || "").toUpperCase().replace(/^IT/, "").replace(/\s/g, "");
const num = v => { const n = Number(String(v ?? "").trim()); return Number.isFinite(n) ? n : 0; };

// ── Lettura del file .zip (o di file .xml scelti insieme) ─────────────────────────────────────────
function decodifica(bytes) {
  let testo = new TextDecoder("utf-8").decode(bytes);
  const enc = (testo.slice(0, 200).match(/encoding=["']([^"']+)["']/i) || [])[1];
  if (enc && !/utf-?8/i.test(enc)) { try { testo = new TextDecoder(enc.toLowerCase()).decode(bytes); } catch { /* resta utf-8 */ } }
  return testo;
}
// File firmato (.p7m): si prende il testo XML contenuto tra l'inizio e la fine della fattura
function xmlDaP7m(bytes) {
  const s = new TextDecoder("latin1").decode(bytes);
  const i = s.search(/<\?xml|<([A-Za-z0-9_]+:)?FatturaElettronica[\s>]/);
  const m = s.match(/<\/([A-Za-z0-9_]+:)?FatturaElettronica>/);
  if (i < 0 || !m) return null;
  const fine = s.indexOf(m[0], i) + m[0].length;
  return decodifica(bytes.slice(i, fine));
}

export async function leggiFileAruba(files) {
  const xml = []; let elenco = null; const scartati = []; const nomi = [];
  const aggiungi = async (nome, bytes) => {
    const basso = nome.toLowerCase().split("/").pop();
    if (!basso || basso.startsWith(".") || nome.includes("__MACOSX")) return;
    if (basso.endsWith(".csv")) { elenco = leggiElenco(decodifica(bytes)); return; }
    if (basso.endsWith(".xml")) { xml.push({ nome: nome.split("/").pop(), testo: decodifica(bytes) }); return; }
    if (basso.endsWith(".p7m")) {
      const t = xmlDaP7m(bytes);
      if (t) xml.push({ nome: nome.split("/").pop(), testo: t }); else scartati.push({ file: nome, motivo: "file firmato non leggibile: chiedere a Claude il file XML senza firma" });
      return;
    }
    scartati.push({ file: nome, motivo: "non è un file XML né l'elenco .csv" });
  };
  for (const f of files) {
    nomi.push(f.name);
    if (f.name.toLowerCase().endsWith(".zip")) {
      const zip = await JSZip.loadAsync(await f.arrayBuffer());
      for (const voce of Object.values(zip.files)) if (!voce.dir) await aggiungi(voce.name, await voce.async("uint8array"));
    } else await aggiungi(f.name, new Uint8Array(await f.arrayBuffer()));
  }
  const fatture = [], autofatture = [];
  for (const x of xml) {
    try { fatture.push(...analizzaXml(x.testo, x.nome)); }
    catch (e) { if (e.autofattura) autofatture.push({ file: x.nome, numero: (x.testo.match(/<Numero>([^<]*)<\/Numero>/) || [])[1] || "", data: (x.testo.match(/<Data>([^<]*)<\/Data>/) || [])[1] || "" }); else scartati.push({ file: x.nome, motivo: e.message }); }
  }
  // stato di Aruba dall'elenco: per nome del file, altrimenti per numero e anno
  if (elenco) {
    const perFile = new Map(elenco.map(r => [String(r.nomeFile).toLowerCase().replace(/\.p7m$/, ""), r]));
    const perNumero = new Map(elenco.map(r => [chiaveNumero(r.numero, String(r.data).slice(0, 4)), r]));
    for (const f of fatture) {
      const r = perFile.get(f.nomeFile.toLowerCase().replace(/\.p7m$/, "")) || perNumero.get(chiaveNumero(f.numero, f.anno));
      if (r) { f.stato = r.stato; f.identificativoSdi = r.identificativoSdi; f.dataInvio = r.dataInvio; f.inElenco = true; }
    }
  }
  const nelleFatture = new Set(fatture.map(f => chiaveNumero(f.numero, f.anno)));
  const mancantiNeiFile = (elenco || []).filter(r => !nelleFatture.has(chiaveNumero(r.numero, String(r.data).slice(0, 4))));
  const autoNumeri = new Set(autofatture.map(a => chiaveNumero(a.numero, String(a.data).slice(0, 4))));
  return { fatture, elenco, scartati, autofatture, mancantiNeiFile: mancantiNeiFile.filter(r => !autoNumeri.has(chiaveNumero(r.numero, String(r.data).slice(0, 4)))), nomeFile: nomi.join(", ") };
}

function leggiElenco(testo) {
  const righe = testo.replace(/^﻿/, "").split(/\r?\n/).filter(r => r.trim());
  if (!righe.length) return [];
  const sep = righe[0].includes(";") ? ";" : ",";
  const dividi = r => { const out = []; let cur = "", q = false; for (const ch of r) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
  const titoli = dividi(righe[0]).map(t => t.toLowerCase());
  const col = nome => titoli.indexOf(nome.toLowerCase());
  const c = { anno: col("Anno fiscale"), numero: col("Numero"), data: col("Data"), tipo: col("Tipo documento"), cliente: col("Cliente"), piva: col("Partita IVA del cliente"),
    imponibile: col("Imponibile"), imposta: col("Imposta"), totale: col("Totale"), stato: col("Stato"), sdi: col("Identificativo SdI"), invio: col("Data di invio"), file: col("Nome del file") };
  if (c.numero < 0 || c.data < 0) throw new Error("L'elenco .csv non ha le colonne «Numero» e «Data»: va rifatto come scritto nel prompt.");
  return righe.slice(1).map(r => dividi(r)).map(v => ({
    anno: v[c.anno], numero: v[c.numero], data: dataIso(v[c.data]), tipo: v[c.tipo], cliente: v[c.cliente], partitaIva: v[c.piva],
    imponibile: num(String(v[c.imponibile] || "").replace(",", ".")), imposta: num(String(v[c.imposta] || "").replace(",", ".")), totale: num(String(v[c.totale] || "").replace(",", ".")),
    stato: c.stato >= 0 ? v[c.stato] : "", identificativoSdi: c.sdi >= 0 ? v[c.sdi] : "", dataInvio: c.invio >= 0 ? v[c.invio] : "", nomeFile: c.file >= 0 ? v[c.file] : "",
  }));
}
function dataIso(s) {
  const t = String(s || "").trim();
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : t.slice(0, 10);
}

// ── Lettura dell'XML della fattura elettronica (FatturaPA) ─────────────────────────────────────────
const figli = (el, nome) => el ? [...el.getElementsByTagNameNS("*", nome)] : [];
const primo = (el, nome) => figli(el, nome)[0] || null;
const testoDi = (el, nome) => { const t = primo(el, nome); return t ? t.textContent.trim() : ""; };

export function analizzaXml(testo, nomeFile) {
  const doc = new DOMParser().parseFromString(testo, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("il file non è un XML leggibile");
  const radice = doc.documentElement;
  if (radice.localName !== "FatturaElettronica") throw new Error("il file non è una fattura elettronica");
  const header = primo(radice, "FatturaElettronicaHeader");
  const cedente = primo(header, "CedentePrestatore");
  const cedentePiva = testoDi(primo(cedente, "IdFiscaleIVA"), "IdCodice");
  const cess = primo(header, "CessionarioCommittente");
  if (senzaIT(cedentePiva) !== PARTITA_IVA_PODERE) {
    // Versione 301: autofattura (Podere Verde è il cliente, il cedente è il fornitore): non è una vendita
    if (senzaIT(testoDi(primo(cess, "IdFiscaleIVA"), "IdCodice")) === PARTITA_IVA_PODERE) { const e = new Error("autofattura: Podere Verde è il cliente, non è una vendita"); e.autofattura = true; throw e; }
    throw new Error(`non è una fattura emessa da Podere Verde (partita IVA del cedente ${cedentePiva || "assente"})`);
  }
  const ana = primo(cess, "Anagrafica"), sede = primo(cess, "Sede"), idIva = primo(cess, "IdFiscaleIVA"), trasm = primo(header, "DatiTrasmissione");
  const nomeCliente = testoDi(ana, "Denominazione") || [testoDi(ana, "Nome"), testoDi(ana, "Cognome")].filter(Boolean).join(" ");
  const cliente = {
    nome: nomeCliente,
    partitaIva: idIva ? `${testoDi(idIva, "IdPaese") || "IT"}${testoDi(idIva, "IdCodice")}` : "",
    codiceFiscale: testoDi(primo(cess, "DatiAnagrafici"), "CodiceFiscale"),
    indirizzo: [testoDi(sede, "Indirizzo"), testoDi(sede, "NumeroCivico")].filter(Boolean).join(" "),
    cap: testoDi(sede, "CAP"), comune: testoDi(sede, "Comune"), provincia: testoDi(sede, "Provincia"), nazione: testoDi(sede, "Nazione"),
    codiceDestinatario: testoDi(trasm, "CodiceDestinatario"), pec: testoDi(trasm, "PECDestinatario"),
  };
  if (cliente.codiceDestinatario === "0000000") cliente.codiceDestinatario = "";
  return figli(radice, "FatturaElettronicaBody").map(body => {
    const gen = primo(primo(body, "DatiGenerali"), "DatiGeneraliDocumento");
    const tipo = testoDi(gen, "TipoDocumento");
    const segno = tipo === "TD04" ? -1 : 1;
    const data = testoDi(gen, "Data");
    const righe = figli(primo(body, "DatiBeniServizi"), "DettaglioLinee").map(l => ({
      numeroLinea: num(testoDi(l, "NumeroLinea")),
      descrizione: testoDi(l, "Descrizione"),
      quantita: segno * (testoDi(l, "Quantita") ? num(testoDi(l, "Quantita")) : 1),
      unitaMisura: testoDi(l, "UnitaMisura"),
      prezzoUnitario: num(testoDi(l, "PrezzoUnitario")),
      totale: round2(segno * num(testoDi(l, "PrezzoTotale"))),
      aliquota: num(testoDi(l, "AliquotaIVA")),
      natura: testoDi(l, "Natura"),
    }));
    const riepilogo = figli(primo(body, "DatiBeniServizi"), "DatiRiepilogo").map(r => ({
      aliquota: num(testoDi(r, "AliquotaIVA")), natura: testoDi(r, "Natura"),
      imponibile: round2(segno * num(testoDi(r, "ImponibileImporto"))), imposta: round2(segno * num(testoDi(r, "Imposta"))),
    }));
    const imponibile = round2(riepilogo.reduce((s, r) => s + r.imponibile, 0));
    const imposta = round2(riepilogo.reduce((s, r) => s + r.imposta, 0));
    return {
      nomeFile, tipoDocumento: tipo, numero: testoDi(gen, "Numero"), data, anno: Number(data.slice(0, 4)),
      cliente, righe, riepilogo, imponibile, imposta, totale: round2(imponibile + imposta),
      totaleDocumento: testoDi(gen, "ImportoTotaleDocumento") ? round2(segno * num(testoDi(gen, "ImportoTotaleDocumento"))) : null,
      bollo: num(testoDi(primo(gen, "DatiBollo"), "ImportoBollo")) || 0,
      stato: "", identificativoSdi: "", dataInvio: "", inElenco: false,
    };
  });
}

// ── Destinazione proposta per ogni riga ─────────────────────────────────────────────────────────────
const MATRICOLA = /\bIT\s?\d{9,12}\b/gi;
const SPECIE_DESTINAZIONE = { bovino: "Bovini", suino: "Suini", ovino: "Ovini", caprino: "Ovini", equino: "Cavalli" };
const PAROLE = [
  [/\b(SUIN|MAIAL|PORC|CINTA SENESE|LATTONZOL|SCROF|VERR|MAGRON)/i, "Suini"],
  [/\b(BOVIN|SCOTTON|VITELL|MANZ|VACC|TORO|TORI|TOREL|CHIANIN|MARCHIGIAN|MAREMMAN|LIMOUSIN|QUART[OI] )/i, "Bovini"],
  [/\b(OVIN|AGNELL|PECOR|MONTON|CAPR|CAPRETT)/i, "Ovini"],
  [/\b(EQUIN|CAVALL|PULEDR|CAVALLA)/i, "Cavalli"],
  [/\b(POLL|GALLIN|UOVA|TACCHIN)/i, "Pollame"],
];
// Versione 301: righe che non sono animali né carcasse. Vanno in «Generali», così non entrano nel prezzo al kg di carcassa
// delle specie (un prosciutto o un pacco di carne a pezzi non è una mezzena; un nolo o una potatura non è una vendita di animali).
const NON_ANIMALI = [
  [/\b(PROSCIUTT|CAPOCOLL|SALAM|SALSICC|LONZ|INSACCAT|PACC[OH]I?|GUANCIAL|PANCETT|LARDO|BISTECC|FETTIN|SPEZZATIN|MACINAT|BIRRA|ARROST|COSTAT|HAMBURG|COPPA|CARNE|FILONE|SGAMBAT|PORCHETT|STAGIONAT|SALUM)/i, "prodotto lavorato (salumi, carne a pezzi): non è una carcassa"],
  [/\b(NOLO|POTATUR|RECINZ|DISSERBO|DISERBO|DECESP|SFALCI|DRENAGG|POSA |PULIZIA|MANUTENZ|ABBATTIM|ANNAFF|CONCIMAZ|IMPIANTO|SCAV|TRASPORT|LAVORAZ|SERVIZIO|TAGLIO|ARATUR|SEMINA|TRINCIA|SMANTELL|RIPRISTIN|FRESA|MOVIMENTAZ|SOSTITUZ|FORNITURA|POSA IN OPERA)/i, "servizio o lavoro per conto di altri"],
  [/\b(FIENO|PAGLIA|BALLON|ROTOBALL|ORZO|GRANO|LEGNA|OLIO)/i, "prodotto agricolo, non animale"],
  [/\bCOME DA FATTURA\b|\bRIFATTUR/i, "rifatturazione di un costo"],
];
export async function caricaSpecieMatricole() {
  const { data, error } = await fetchAllPages((da, a) => supabase.from("animali").select("bdn, specie").not("bdn", "is", null).order("id").range(da, a));
  if (error) throw new Error(error.message);
  return new Map((data || []).map(r => [String(r.bdn).toUpperCase().replace(/\s/g, ""), String(r.specie || "").toLowerCase()]));
}
export function proponiDestinazione(descrizione, specieMatricole) {
  const matricole = [...new Set((String(descrizione || "").match(MATRICOLA) || []).map(m => m.toUpperCase().replace(/\s/g, "")))];
  const specie = [...new Set(matricole.map(m => SPECIE_DESTINAZIONE[specieMatricole.get(m)]).filter(Boolean))];
  if (specie.length === 1) return { destinazione: specie[0], motivo: `matricola ${matricole.find(m => specieMatricole.has(m))} nell'anagrafe` };
  for (const [re, motivo] of NON_ANIMALI) if (re.test(descrizione)) return { destinazione: "Generali", motivo };
  for (const [re, dest] of PAROLE) if (re.test(descrizione)) return { destinazione: dest, motivo: "parola della descrizione" };
  return { destinazione: "", motivo: "da scegliere" };
}

// ── Confronto con il programma ─────────────────────────────────────────────────────────────────────
export async function caricaArchivio() {
  const [att, em, cl] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("ci_fatture").select("id, numero, data, cliente_id, totale_netto, totale_iva, totale_lordo, provenienza, tipo_documento, stato_aruba, letta_da_aruba_il, ci_clienti(nome, partita_iva)").eq("tipo", "ATTIVA").order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("ci_fatture_emesse").select("id, numero, anno, data, cliente_denominazione, cliente_partita_iva, imponibile, imposta, totale, stato, in_aruba_il, stato_aruba, inviata_amministrazione_il").order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("ci_clienti").select("*").order("id").range(da, a)),
  ]);
  for (const r of [att, em, cl]) if (r.error) throw new Error(r.error.message);
  return { attive: att.data || [], emesse: em.data || [], clienti: cl.data || [] };
}

const diversi = (a, b) => Math.abs(round2(a) - round2(b)) > TOLLERANZA;
export function confronta(fatture, archivio, specieMatricole) {
  const attive = new Map(archivio.attive.map(f => [chiaveNumero(f.numero, String(f.data).slice(0, 4)), f]));
  const emesse = new Map();
  archivio.emesse.forEach(f => { const k = chiaveNumero(f.numero, f.anno); if (!emesse.has(k) || f.stato === "emessa") emesse.set(k, f); });
  const viste = new Map();
  const risultati = fatture.map(f => {
    const k = chiaveNumero(f.numero, f.anno);
    // Versione 301: una fattura scartata dal Sistema di Interscambio vale come non emessa (spesso è stata rimandata con lo stesso numero)
    const scartata = statoScartata(f.stato);
    const doppia = !scartata && viste.has(k); if (!scartata) viste.set(k, true);
    const differenze = [];
    const p = emesse.get(k), c = attive.get(k);
    let esito, collegata = null;
    if (scartata) esito = "scartata";
    else if (doppia) esito = "doppia";
    else if (p && p.stato === "emessa") {
      esito = "programma"; collegata = p;
      if (p.data !== f.data) differenze.push(`data ${p.data} nel programma, ${f.data} in Aruba`);
      if (senzaIT(p.cliente_partita_iva) && senzaIT(p.cliente_partita_iva) !== senzaIT(f.cliente.partitaIva)) differenze.push(`cliente ${p.cliente_denominazione} nel programma, ${f.cliente.nome} in Aruba`);
      if (diversi(p.imponibile, f.imponibile)) differenze.push(`imponibile ${p.imponibile} nel programma, ${f.imponibile} in Aruba`);
      if (diversi(p.imposta, f.imposta)) differenze.push(`IVA ${p.imposta} nel programma, ${f.imposta} in Aruba`);
    } else if (p && p.stato !== "emessa") { esito = "annullata"; collegata = p; differenze.push("nel programma la registrazione è annullata, ma in Aruba la fattura c'è"); }
    else if (c) {
      esito = "presente"; collegata = c;
      if (c.data !== f.data) differenze.push(`data ${c.data} in contabilità, ${f.data} in Aruba`);
      if (diversi(c.totale_netto, f.imponibile)) differenze.push(`imponibile ${c.totale_netto} in contabilità, ${f.imponibile} in Aruba`);
      if (diversi(c.totale_iva, f.imposta)) differenze.push(`IVA ${c.totale_iva} in contabilità, ${f.imposta} in Aruba`);
    } else esito = "nuova";
    if (f.totaleDocumento !== null && diversi(f.totaleDocumento, f.totale + (f.bollo || 0)) && diversi(f.totaleDocumento, f.totale))
      differenze.push(`totale del documento ${f.totaleDocumento} diverso da imponibile più IVA ${f.totale}`);
    const righe = f.righe.map(r => ({ ...r, ...proponiDestinazione(r.descrizione, specieMatricole) }));
    return { ...f, chiave: k, esito, collegata, differenze, righe };
  });
  // Versione 301: una nota di credito che storna una fattura prende la destinazione delle righe di quella fattura
  for (const n of risultati.filter(f => f.tipoDocumento === "TD04")) {
    n.righe.forEach(r => {
      if (r.destinazione && r.motivo !== "parola della descrizione") return;
      const m = String(r.descrizione).match(/(?:FATTURA|FPR)\s*(?:N\.?\s*)?(\d+)\s*[-/]\s*(\d{2})\b/i) || String(r.descrizione).match(/(?:FATTURA|FPR)\s*(?:N\.?\s*)?(\d+)\s+DEL\s+\d{1,2}[./]\d{1,2}[./](\d{2,4})/i);
      if (!m) return;
      const anno = Number(m[2].length === 2 ? "20" + m[2] : m[2]);
      const orig = risultati.find(f => f.tipoDocumento !== "TD04" && f.anno === anno && progressivoDi(f.numero) === Number(m[1]) && f.esito !== "scartata");
      const dest = orig ? [...new Set(orig.righe.map(x => x.destinazione).filter(Boolean))] : [];
      if (dest.length === 1) { r.destinazione = dest[0]; r.motivo = `storno della ${orig.numero}`; }
      // storno totale di una fattura con più destinazioni: la riga si divide come le righe della fattura stornata
      else if (dest.length > 1 && n.righe.length === 1 && Math.abs(Math.abs(r.totale) - Math.abs(orig.imponibile)) <= TOLLERANZA) {
        n.righeDivise = orig.righe.map((x, i) => ({ ...x, numeroLinea: i + 1, descrizione: `STORNO ${orig.numero}: ${x.descrizione}`, quantita: -Math.abs(x.quantita), totale: -Math.abs(x.totale), motivo: `storno della ${orig.numero}, riga ${x.numeroLinea}` }));
      }
    });
    if (n.righeDivise) { n.righe = n.righeDivise; delete n.righeDivise; }
  }
  return risultati;
}

// Fatture emesse dal programma che nel file di Aruba non ci sono (per gli anni contenuti nel file)
export function emesseNonInAruba(fatture, archivio) {
  const inAruba = new Set(fatture.filter(f => !statoScartata(f.stato)).map(f => chiaveNumero(f.numero, f.anno)));
  const anni = new Set(fatture.map(f => f.anno));
  return archivio.emesse.filter(f => f.stato === "emessa" && anni.has(f.anno) && !inAruba.has(chiaveNumero(f.numero, f.anno)));
}

// Prefisso della numerazione («FPR» in «FPR 9/26»): ogni prefisso è una sequenza a sé
export const prefissoDi = numero => String(numero || "").toUpperCase().replace(/\d.*$/, "").replace(/[^A-Z]/g, "") || "senza prefisso";
export const PREFISSO_PRINCIPALE = "FPR";
// Ultimo numero per anno della sequenza «FPR» (fatture e note di credito, se hanno lo stesso prefisso)
export function ultimoNumeroPerAnno(fatture) {
  const per = {};
  fatture.filter(f => prefissoDi(f.numero) === PREFISSO_PRINCIPALE && !statoScartata(f.stato)).forEach(f => {
    const n = progressivoDi(f.numero);
    if (n !== null && (!per[f.anno] || n > per[f.anno].n)) per[f.anno] = { n, numero: f.numero, data: f.data };
  });
  return per;
}

// ── Registrazione ─────────────────────────────────────────────────────────────────────────────────
function trovaCliente(clienti, c) {
  const p = senzaIT(c.partitaIva), cf = String(c.codiceFiscale || "").toUpperCase();
  return clienti.find(x => p && senzaIT(x.partita_iva) === p)
    || clienti.find(x => cf && String(x.codice_fiscale || "").toUpperCase() === cf)
    || clienti.find(x => String(x.nome || "").trim().toUpperCase() === String(c.nome || "").trim().toUpperCase()) || null;
}
// Completa SOLO i campi vuoti del cliente con i dati della fattura di Aruba
async function completaCliente(cliente, c) {
  const campi = { indirizzo: c.indirizzo, cap: c.cap, citta: c.comune, provincia: c.provincia, codice_destinatario: c.codiceDestinatario, pec: c.pec, codice_fiscale: c.codiceFiscale, partita_iva: c.partitaIva };
  const agg = {};
  for (const [k, v] of Object.entries(campi)) if (v && !String(cliente[k] || "").trim()) agg[k] = v;
  if (!Object.keys(agg).length) return [];
  const { error } = await supabase.from("ci_clienti").update(agg).eq("id", cliente.id);
  if (error) throw new Error(`cliente ${cliente.nome}: ${error.message}`);
  Object.assign(cliente, agg);
  return Object.keys(agg);
}

export async function registraLettura({ risultati, archivio, nomeFile, ultimi }) {
  const quando = new Date().toISOString();
  const esito = { registrate: [], collegate: [], aggiornate: [], clientiCompletati: [], errori: [] };
  const clienti = [...archivio.clienti];
  for (const f of risultati) {
    try {
      // dati del cliente: si completano sempre i campi vuoti
      let cl = trovaCliente(clienti, f.cliente);
      if (cl) { const fatti = await completaCliente(cl, f.cliente); if (fatti.length) esito.clientiCompletati.push(`${cl.nome}: ${fatti.join(", ")}`); }
      const stato = { stato_aruba: f.stato || null, identificativo_sdi: f.identificativoSdi || null };
      if (f.esito === "programma" || f.esito === "annullata") {
        const { error } = await supabase.from("ci_fatture_emesse").update({ in_aruba_il: quando, ...stato, differenza_aruba: f.differenze.join("; ") || null }).eq("id", f.collegata.id);
        if (error) throw new Error(error.message);
        esito.collegate.push(f.numero);
      } else if (f.esito === "presente") {
        const { error } = await supabase.from("ci_fatture").update({ letta_da_aruba_il: quando, tipo_documento: f.tipoDocumento, nome_file_xml: f.nomeFile, ...stato }).eq("id", f.collegata.id);
        if (error) throw new Error(error.message);
        esito.aggiornate.push(f.numero);
      } else if (f.esito === "nuova") {
        if (f.righe.some(r => !r.destinazione)) throw new Error("righe senza destinazione: sceglierla prima di registrare");
        if (!cl) {
          const c = f.cliente;
          const { data, error } = await supabase.from("ci_clienti").insert([{ nome: c.nome, partita_iva: c.partitaIva || null, codice_fiscale: c.codiceFiscale || null, indirizzo: c.indirizzo || null, cap: c.cap || null, citta: c.comune || null, provincia: c.provincia || null, nazione: c.nazione || "IT", codice_destinatario: c.codiceDestinatario || null, pec: c.pec || null }]).select().single();
          if (error) throw new Error(`nuovo cliente ${c.nome}: ${error.message}`);
          cl = data; clienti.push(data);
        }
        const { data: testata, error } = await supabase.from("ci_fatture").insert([{
          numero: f.numero, data: f.data, tipo: "ATTIVA", cliente_id: cl.id, totale_netto: f.imponibile, totale_iva: f.imposta, totale_lordo: f.totale,
          provenienza: "aruba", tipo_documento: f.tipoDocumento, nome_file_xml: f.nomeFile, letta_da_aruba_il: quando, ...stato,
          note: f.tipoDocumento === "TD04" ? "Nota di credito letta da Aruba" : null,
        }]).select().single();
        if (error) throw new Error(error.message);
        const righe = f.righe.map(r => {
          const imposta = round2(r.totale * r.aliquota / 100);
          return { fattura_id: testata.id, descrizione: r.descrizione, quantita: r.quantita, unita_misura: r.unitaMisura || null, prezzo_unitario: r.prezzoUnitario,
            totale_riga: r.totale, aliquota_iva: r.aliquota, totale_iva: imposta, destinazione: r.destinazione };
        });
        const { error: eR } = await supabase.from("ci_articoli_fattura").insert(righe);
        if (eR) { await supabase.from("ci_fatture").delete().eq("id", testata.id); throw new Error(`righe: ${eR.message}`); }
        esito.registrate.push(f.numero);
      }
    } catch (e) { esito.errori.push(`${f.numero} del ${f.data}: ${e.message}`); }
  }
  const anni = [...new Set(risultati.map(f => f.anno))].sort();
  const { error } = await supabase.from("ci_letture_aruba").insert([{
    nome_file: nomeFile, anni: anni.join(", "), fatture_lette: risultati.length,
    gia_presenti: esito.aggiornate.length, del_programma: esito.collegate.length, registrate: esito.registrate.length,
    con_differenze: risultati.filter(f => f.differenze.length).length, ultimo_numero_per_anno: ultimi,
    note: esito.errori.length ? `Errori: ${esito.errori.join(" | ")}` : null,
  }]);
  if (error) esito.errori.push(`registro della lettura: ${error.message}`);
  return esito;
}

// ── Controlli (striscia rossa e pagina dei controlli) ───────────────────────────────────────────────
// Versione 301: «Emessa e non consegnata» e «Recapito impossibile» sono fatture VALIDE (il cliente le trova nel cassetto fiscale):
// sono un problema solo «Scartata», «Errore elaborazione» e «Rifiutata».
export const statoProblema = s => /scart|rifiut|errore/i.test(String(s || ""));
export const statoScartata = s => /scart/i.test(String(s || ""));
export async function caricaUltimaLettura() {
  const { data, error } = await supabase.from("ci_letture_aruba").select("*").order("letta_il", { ascending: false }).limit(1);
  if (error) return null;
  return (data || [])[0] || null;
}
export async function caricaControlli() {
  const [em, att, lettura] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("ci_fatture_emesse").select("id, numero, anno, data, cliente_denominazione, totale, stato, in_aruba_il, stato_aruba, differenza_aruba, inviata_amministrazione_il").eq("stato", "emessa").order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("ci_fatture").select("id, numero, data, totale_lordo, stato_aruba, provenienza, ci_clienti(nome)").eq("tipo", "ATTIVA").order("id").range(da, a)),
    caricaUltimaLettura(),
  ]);
  if (em.error) throw new Error(em.error.message);
  if (att.error) throw new Error(att.error.message);
  const emesse = em.data || [];
  return {
    lettura,
    nonInAruba: emesse.filter(f => !f.in_aruba_il),
    differenze: emesse.filter(f => f.in_aruba_il && f.differenza_aruba),
    problemi: [...emesse.filter(f => statoProblema(f.stato_aruba)).map(f => ({ numero: f.numero, data: f.data, cliente: f.cliente_denominazione, totale: f.totale, stato: f.stato_aruba })),
      ...(att.data || []).filter(f => statoProblema(f.stato_aruba)).map(f => ({ numero: f.numero, data: f.data, cliente: f.ci_clienti?.nome, totale: f.totale_lordo, stato: f.stato_aruba }))],
  };
}
export async function contaAllarmiFatturazione() {
  try { const c = await caricaControlli(); return c.nonInAruba.length + c.problemi.length + c.differenze.length; } catch { return 0; }
}

// ── Numero progressivo per anno ───────────────────────────────────────────────────────────────────
export async function caricaNumeri() {
  const [att, em, lettura] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("ci_fatture").select("numero, data, tipo_documento, provenienza").eq("tipo", "ATTIVA").order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("ci_fatture_emesse").select("numero, anno, data, stato, in_aruba_il").order("id").range(da, a)),
    caricaUltimaLettura(),
  ]);
  if (att.error) throw new Error(att.error.message);
  if (em.error) throw new Error(em.error.message);
  // una sequenza per anno e prefisso; le fatture del programma ritrovate in Aruba si contano una volta sola
  const perAnno = {};
  const metti = (anno, numero, data, fonte, tipo) => {
    const n = progressivoDi(numero); if (n === null) return;
    const k = `${anno}|${prefissoDi(numero)}`;
    (perAnno[k] = perAnno[k] || []).push({ n, numero, data, fonte, tipo });
  };
  (att.data || []).forEach(f => metti(Number(String(f.data).slice(0, 4)), f.numero, f.data, f.provenienza === "aruba" ? "letta da Aruba" : "contabilità", f.tipo_documento === "TD04" ? "nota di credito" : "fattura"));
  (em.data || []).filter(f => f.stato === "emessa").forEach(f => metti(f.anno, f.numero, f.data, f.in_aruba_il ? "programma, in Aruba" : "programma, non ancora in Aruba", "fattura"));
  const anni = Object.keys(perAnno).sort((a, b) => b.localeCompare(a)).map(k => {
    const [annoTesto, prefisso] = k.split("|"); const anno = Number(annoTesto);
    const elenco = perAnno[k].sort((a, b) => a.n - b.n);
    const ns = elenco.map(e => e.n), max = Math.max(...ns);
    const conti = ns.reduce((m, n) => m.set(n, (m.get(n) || 0) + 1), new Map());
    const mancanti = []; for (let i = 1; i <= max; i++) if (!conti.has(i)) mancanti.push(i);
    const doppi = [...conti.entries()].filter(([, c]) => c > 1).map(([n]) => n);
    const ultimo = elenco.filter(e => e.n === max).sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
    const arubaAnno = prefisso === PREFISSO_PRINCIPALE ? (lettura?.ultimo_numero_per_anno?.[anno] || null) : null;
    return { anno, prefisso, quante: elenco.length, elenco, ultimo, prossimo: max + 1, mancanti, doppi, arubaAnno };
  });
  return { anni, lettura };
}

// ── Elenco delle fatture attive (contabilità + programma), con le righe ─────────────────────────────
export async function caricaElencoAttive() {
  const [att, em] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("ci_fatture").select("id, numero, data, totale_netto, totale_iva, totale_lordo, provenienza, tipo_documento, stato_aruba, letta_da_aruba_il, ci_clienti(nome, partita_iva), ci_articoli_fattura(id, descrizione, quantita, unita_misura, prezzo_unitario, totale_riga, aliquota_iva, destinazione)").eq("tipo", "ATTIVA").order("data", { ascending: false }).order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("ci_fatture_emesse").select("id, numero, anno, data, tipo, cliente_denominazione, cliente_partita_iva, imponibile, imposta, totale, stato, in_aruba_il, stato_aruba, ci_fatture_emesse_righe(id, numero_linea, descrizione, quantita_kg, unita_misura, prezzo_kg, importo, aliquota_iva, attiva, specie)").eq("stato", "emessa").order("data", { ascending: false }).order("id").range(da, a)),
  ]);
  if (att.error) throw new Error(att.error.message);
  if (em.error) throw new Error(em.error.message);
  const elenco = [];
  (att.data || []).forEach(f => elenco.push({
    chiave: `c${f.id}`, numero: f.numero, data: f.data, anno: Number(String(f.data).slice(0, 4)), cliente: f.ci_clienti?.nome || "", partitaIva: f.ci_clienti?.partita_iva || "",
    tipo: f.tipo_documento === "TD04" ? "Nota di credito" : "Fattura", imponibile: Number(f.totale_netto), imposta: Number(f.totale_iva), totale: Number(f.totale_lordo),
    provenienza: f.provenienza === "aruba" ? "Letta da Aruba" : "Contabilità", stato: f.stato_aruba || (f.letta_da_aruba_il ? "in Aruba" : ""),
    righe: (f.ci_articoli_fattura || []).sort((a, b) => a.id - b.id).map(r => ({ descrizione: r.descrizione, quantita: Number(r.quantita), unita: r.unita_misura, prezzo: Number(r.prezzo_unitario), importo: Number(r.totale_riga), aliquota: Number(r.aliquota_iva), destinazione: r.destinazione })),
  }));
  (em.data || []).forEach(f => elenco.push({
    chiave: `p${f.id}`, numero: f.numero, data: f.data, anno: f.anno, cliente: f.cliente_denominazione, partitaIva: f.cliente_partita_iva,
    tipo: "Fattura", imponibile: Number(f.imponibile), imposta: Number(f.imposta), totale: Number(f.totale),
    provenienza: f.tipo === "animali_allevamento" ? "Programma, animali" : "Programma, altre", stato: f.stato_aruba || (f.in_aruba_il ? "in Aruba" : "non ancora in Aruba"),
    righe: (f.ci_fatture_emesse_righe || []).filter(r => r.attiva !== false).sort((a, b) => a.numero_linea - b.numero_linea).map(r => ({ descrizione: r.descrizione, quantita: Number(r.quantita_kg), unita: r.unita_misura || "KG", prezzo: Number(r.prezzo_kg), importo: Number(r.importo), aliquota: Number(r.aliquota_iva), destinazione: SPECIE_DESTINAZIONE[String(r.specie || "").toLowerCase()] || "" })),
  }));
  return elenco.sort((a, b) => String(b.data).localeCompare(String(a.data)) || (progressivoDi(b.numero) || 0) - (progressivoDi(a.numero) || 0));
}
