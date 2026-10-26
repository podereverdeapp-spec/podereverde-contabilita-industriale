import JSZip from "jszip";
import { supabase } from "./supabase";
import { pulisciPiva, caricaAnagrafiche, TABELLA } from "./anagrafiche";
import { PARTITA_IVA_PODERE } from "./calcoloAruba";

// Versione 304 (decisione del Dott. Bizzarri del 26/10/2026, ore 16:11) — «Completa le Anagrafiche da Aruba».
// Legge i file XML delle fatture di Aruba (emesse e ricevute, nei file .zip preparati da Claude) e la rubrica di Aruba
// (file Rubrica_Aruba.csv), e propone di completare SOLO i campi vuoti delle schede di clienti e fornitori:
// - fattura emessa (Podere è il cedente): dati del cliente, Codice Univoco e PEC di ricezione del cliente;
// - fattura ricevuta o autofattura (Podere è il cessionario): dati del fornitore, con telefono ed email se il fornitore
//   li ha scritti. Il Codice Univoco e la PEC scritti in una fattura ricevuta sono quelli di Podere: non si usano;
// - il Codice Univoco di un fornitore che è anche cliente si prende dalle fatture emesse a quella Partita IVA;
// - un campo già scritto non si cambia mai: se Aruba ha un valore diverso, si mostra soltanto.
// Le schede si riconoscono per Partita IVA, poi per Codice Fiscale.

const figli = (el, nome) => (el ? [...el.getElementsByTagNameNS("*", nome)] : []);
const primo = (el, nome) => figli(el, nome)[0] || null;
const testoDi = (el, nome) => { const t = primo(el, nome); return t ? t.textContent.trim() : ""; };

function decodifica(bytes) {
  let testo = new TextDecoder("utf-8").decode(bytes);
  const enc = (testo.slice(0, 200).match(/encoding=["']([^"']+)["']/i) || [])[1];
  if (enc && !/utf-?8/i.test(enc)) { try { testo = new TextDecoder(enc.toLowerCase()).decode(bytes); } catch { /* resta utf-8 */ } }
  return testo;
}
function xmlDaP7m(bytes) {
  const s = new TextDecoder("latin1").decode(bytes);
  const i = s.search(/<\?xml|<([A-Za-z0-9_]+:)?FatturaElettronica[\s>]/);
  const m = s.match(/<\/([A-Za-z0-9_]+:)?FatturaElettronica>/);
  if (i < 0 || !m) return null;
  return decodifica(bytes.slice(i, s.indexOf(m[0], i) + m[0].length));
}

// Partita IVA completa con il paese, senza ripetere il prefisso («ES» + «ESB62394358» = «ESB62394358»)
function partitaIva(idIva) {
  if (!idIva) return "";
  const paese = (testoDi(idIva, "IdPaese") || "IT").toUpperCase(), codice = testoDi(idIva, "IdCodice").toUpperCase().replace(/\s+/g, "");
  if (!codice) return "";
  return codice.startsWith(paese) && paese !== "IT" ? codice : `${paese}${codice}`;
}
const chiave = (piva, cf) => (pulisciPiva(piva) ? `P${pulisciPiva(piva)}` : cf ? `C${String(cf).toUpperCase()}` : "");

function soggetto(el) {
  const da = primo(el, "DatiAnagrafici"), ana = primo(da, "Anagrafica"), sede = primo(el, "Sede"), cont = primo(el, "Contatti");
  return {
    nome: testoDi(ana, "Denominazione") || [testoDi(ana, "Nome"), testoDi(ana, "Cognome")].filter(Boolean).join(" "),
    partita_iva: partitaIva(primo(da, "IdFiscaleIVA")),
    codice_fiscale: testoDi(da, "CodiceFiscale").toUpperCase(),
    indirizzo: [testoDi(sede, "Indirizzo"), testoDi(sede, "NumeroCivico")].filter(Boolean).join(" "),
    cap: testoDi(sede, "CAP"), citta: testoDi(sede, "Comune"), provincia: testoDi(sede, "Provincia").toUpperCase(), nazione: testoDi(sede, "Nazione").toUpperCase(),
    telefoni: [testoDi(cont, "Telefono")].filter(Boolean), email: [testoDi(cont, "Email")].filter(Boolean).map(e => e.trim()),
  };
}

// Legge una fattura: chi è il cliente o il fornitore
function analizza(testo) {
  const doc = new DOMParser().parseFromString(testo, "application/xml");
  if (doc.getElementsByTagName("parsererror").length || doc.documentElement.localName !== "FatturaElettronica") return null;
  const h = primo(doc.documentElement, "FatturaElettronicaHeader");
  const ced = soggetto(primo(h, "CedentePrestatore")), cess = soggetto(primo(h, "CessionarioCommittente"));
  const data = testoDi(primo(doc.documentElement, "DatiGeneraliDocumento"), "Data");
  if (pulisciPiva(ced.partita_iva) === PARTITA_IVA_PODERE) {
    const trasm = primo(h, "DatiTrasmissione");
    const cu = testoDi(trasm, "CodiceDestinatario").toUpperCase();
    return { tipo: "cliente", data, ...cess, telefoni: [], email: [], codice_destinatario: cu && cu !== "0000000" && cu !== "XXXXXXX" ? cu : "", pec: testoDi(trasm, "PECDestinatario").trim() };
  }
  if (pulisciPiva(cess.partita_iva) === PARTITA_IVA_PODERE || String(cess.codice_fiscale) === PARTITA_IVA_PODERE) return { tipo: "fornitore", data, ...ced, codice_destinatario: "", pec: "" };
  return null;
}

function leggiRubrica(testo) {
  const righe = testo.replace(/^﻿/, "").split(/\r?\n/).filter(r => r.trim());
  if (!righe.length) return [];
  const sep = righe[0].includes(";") ? ";" : ",";
  const t = righe[0].split(sep).map(x => x.trim().toLowerCase());
  const col = n => t.indexOf(n.toLowerCase());
  const c = { tipo: col("Tipo"), nome: col("Nome"), piva: col("Partita IVA"), cf: col("Codice Fiscale"), cu: col("Codice Univoco"), pec: col("PEC"), email: col("Email"), tel: col("Telefono"), ind: col("Indirizzo"), cap: col("CAP"), citta: col("Città"), prov: col("Provincia"), naz: col("Nazione") };
  if (c.tipo < 0 || c.nome < 0) return [];
  return righe.slice(1).map(r => r.split(sep).map(x => x.trim())).map(v => {
    const cu = (v[c.cu] || "").toUpperCase(), pec = v[c.pec] || "", email = v[c.email] || "";
    return {
      tipo: /fornit/i.test(v[c.tipo]) ? "fornitore" : "cliente", data: "", rubrica: true, nome: v[c.nome], partita_iva: (v[c.piva] || "").toUpperCase(), codice_fiscale: (v[c.cf] || "").toUpperCase(),
      codice_destinatario: cu && cu !== "0000000" ? cu : "", pec: /@/.test(pec) && /pec|legalmail|cert|arubapec|postacert/i.test(pec) ? pec : "",
      email: [email, /@/.test(pec) && !/pec|legalmail|cert|arubapec|postacert/i.test(pec) ? pec : ""].filter(Boolean), telefoni: [v[c.tel]].filter(Boolean),
      indirizzo: v[c.ind] || "", cap: v[c.cap] || "", citta: v[c.citta] || "", provincia: (v[c.prov] || "").toUpperCase(), nazione: (v[c.naz] || "").toUpperCase(),
    };
  });
}

export async function leggiFileAnagrafiche(files, avanzamento) {
  const soggetti = []; let fatture = 0, scartati = 0, rubrica = 0; const nomi = [];
  const aggiungi = async (nome, bytes) => {
    const n = nome.toLowerCase();
    if (n.includes("__macosx") || n.split("/").pop().startsWith(".")) return;
    if (n.endsWith(".csv")) { if (/rubrica/i.test(n)) { const r = leggiRubrica(decodifica(bytes)); rubrica += r.length; soggetti.push(...r); } return; }
    let testo = null;
    if (n.endsWith(".xml")) testo = decodifica(bytes); else if (n.endsWith(".p7m")) testo = xmlDaP7m(bytes); else return;
    const s = testo && analizza(testo);
    if (s) { soggetti.push(s); fatture++; } else scartati++;
    if (fatture % 100 === 0) avanzamento?.(fatture);
  };
  for (const f of files) {
    nomi.push(f.name);
    if (f.name.toLowerCase().endsWith(".zip")) {
      const zip = await JSZip.loadAsync(await f.arrayBuffer());
      for (const v of Object.values(zip.files)) if (!v.dir) await aggiungi(v.name, await v.async("uint8array"));
    } else await aggiungi(f.name, new Uint8Array(await f.arrayBuffer()));
  }
  return { soggetti, fatture, scartati, rubrica, nomeFile: nomi.join(", ") };
}

const CAMPI_SEMPLICI = ["codice_fiscale", "indirizzo", "cap", "citta", "provincia", "nazione", "codice_destinatario", "pec"];

// Unisce i dati di Aruba per soggetto: indirizzo dall'ultima fattura, telefoni ed email da tutte
function unisci(lista) {
  const ord = [...lista].sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const u = { ...ord[0], fatture: lista.filter(x => !x.rubrica).length, telefoni: [], email: [] };
  for (const c of [...CAMPI_SEMPLICI, "nome", "partita_iva"]) u[c] = (ord.find(x => x[c]) || {})[c] || "";
  const telefoni = new Map(), email = new Map();
  for (const x of ord) {
    for (const t of x.telefoni || []) { const k = t.replace(/[^\d]/g, ""); if (k.length >= 6 && !telefoni.has(k)) telefoni.set(k, t.trim()); }
    for (const e of x.email || []) { const k = e.toLowerCase(); if (!email.has(k)) email.set(k, e.trim()); }
  }
  u.telefoni = [...telefoni.values()]; u.email = [...email.values()];
  return u;
}

// Proposte: per ogni scheda del programma, i campi vuoti che Aruba può completare
export async function preparaProposte(soggetti) {
  const [clienti, fornitori] = await Promise.all([caricaAnagrafiche("cliente"), caricaAnagrafiche("fornitore")]);
  const gruppi = { cliente: new Map(), fornitore: new Map() };
  for (const s of soggetti) { const k = chiave(s.partita_iva, s.codice_fiscale); if (!k) continue; const g = gruppi[s.tipo]; if (!g.has(k)) g.set(k, []); g.get(k).push(s); }
  // Codice Univoco e PEC di ricezione di chi è anche cliente
  const ricezione = new Map();
  for (const [k, l] of gruppi.cliente) { const u = unisci(l); if (u.codice_destinatario || u.pec) ricezione.set(k, { codice_destinatario: u.codice_destinatario, pec: u.pec }); }
  const out = { cliente: [], fornitore: [], nonTrovati: [] };
  for (const tipo of ["cliente", "fornitore"]) {
    const schede = tipo === "cliente" ? clienti : fornitori;
    const perPiva = new Map(), perCf = new Map();
    for (const r of schede) { if (pulisciPiva(r.partita_iva)) perPiva.set(`P${pulisciPiva(r.partita_iva)}`, r); if (r.codice_fiscale) perCf.set(`C${String(r.codice_fiscale).toUpperCase()}`, r); }
    for (const [k, l] of gruppi[tipo]) {
      const u = unisci(l);
      if (tipo === "fornitore" && ricezione.has(k)) { const r = ricezione.get(k); u.codice_destinatario = u.codice_destinatario || r.codice_destinatario; u.pec = u.pec || r.pec; u.ricezioneDaCliente = true; }
      const scheda = perPiva.get(k) || (u.codice_fiscale && perCf.get(`C${u.codice_fiscale}`)) || null;
      if (!scheda) { out.nonTrovati.push({ tipo, chiave: k, aruba: u }); continue; }
      const p = proposta(scheda, u);
      if (p.campi.length || p.diversi.length) out[tipo].push({ tipo, scheda, aruba: u, ...p });
    }
  }
  const schedeSenzaPiva = { cliente: clienti.filter(r => !pulisciPiva(r.partita_iva)), fornitore: fornitori.filter(r => !pulisciPiva(r.partita_iva)) };
  return { ...out, schedeSenzaPiva, totaleSchede: { cliente: clienti.length, fornitore: fornitori.length } };
}

export function proposta(scheda, u, conPartitaIva = false) {
  const campi = [], diversi = [];
  const vuoto = c => !String(scheda[c] || "").trim();
  const confronta = (c, v) => {
    if (!v) return;
    if (vuoto(c)) campi.push({ campo: c, valore: v, scelto: true });
    else if (String(scheda[c]).trim().toUpperCase().replace(/\s+/g, " ") !== String(v).trim().toUpperCase().replace(/\s+/g, " ")) diversi.push({ campo: c, programma: scheda[c], aruba: v });
  };
  if (conPartitaIva) confronta("partita_iva", u.partita_iva);
  for (const c of CAMPI_SEMPLICI) confronta(c, u[c]);
  // telefoni: il primo nel Telefono 1, un secondo diverso nel Telefono 2
  const giaScritti = [scheda.telefono, scheda.telefono_2].map(t => String(t || "").replace(/[^\d]/g, "")).filter(Boolean);
  const nuovi = u.telefoni.filter(t => !giaScritti.includes(t.replace(/[^\d]/g, "")));
  for (const c of ["telefono", "telefono_2"]) if (vuoto(c) && nuovi.length) campi.push({ campo: c, valore: nuovi.shift(), scelto: true });
  const email = u.email.filter(e => e.toLowerCase() !== String(scheda.email || "").toLowerCase() && e.toLowerCase() !== String(scheda.pec || "").toLowerCase());
  if (vuoto("email") && email.length) campi.push({ campo: "email", valore: email[0], scelto: true });
  else if (!vuoto("email") && email.length) diversi.push({ campo: "email", programma: scheda.email, aruba: email.join(", ") });
  return { campi, diversi };
}

// Scrive i campi scelti (solo quelli vuoti nella scheda: si ricontrolla sul database prima di scrivere)
export async function scriviProposte(lista, avanzamento) {
  const esito = { schede: 0, campi: 0, errori: [] };
  let n = 0;
  for (const p of lista) {
    avanzamento?.(++n, lista.length);
    const scelti = p.campi.filter(c => c.scelto);
    if (!scelti.length) continue;
    const { data: ora, error: e1 } = await supabase.from(TABELLA[p.tipo]).select("*").eq("id", p.scheda.id).single();
    if (e1) { esito.errori.push(`${p.scheda.nome}: ${e1.message}`); continue; }
    const agg = {};
    for (const c of scelti) if (!String(ora[c.campo] || "").trim()) agg[c.campo] = c.valore;
    if (!Object.keys(agg).length) continue;
    const { error } = await supabase.from(TABELLA[p.tipo]).update(agg).eq("id", p.scheda.id);
    if (error) { esito.errori.push(`${p.scheda.nome}: ${error.message}`); continue; }
    esito.schede++; esito.campi += Object.keys(agg).length;
  }
  return esito;
}
