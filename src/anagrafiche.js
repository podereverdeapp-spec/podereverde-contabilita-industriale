import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";

// Versione 304 (decisioni del Dott. Bizzarri del 26/10/2026, ore 16:11–16:49) — anagrafiche di clienti e fornitori
// modificabili, con gli stessi campi, e Registro delle Comunicazioni (mail, PEC, telefonate).
// - Il Codice Fiscale si scrive a mano oppure si sceglie «uguale alla Partita IVA» (le cifre della partita IVA senza «IT»).
// - Ogni modifica si conferma prima di salvare e resta nel Registro delle Modifiche (lo scrive il database).
// - Una comunicazione appartiene a un cliente o a un fornitore se è stata registrata dalla sua scheda, oppure se è stata
//   mandata al suo indirizzo email o PEC, o al suo numero di telefono: così le mail partite da altre sezioni
//   (fatture all'amministrazione, report mensile) compaiono da sole nella scheda giusta.
// - Le comunicazioni non si cancellano.

export const CAMPI_ANAGRAFICA = [
  { campo: "nome", etichetta: "Nome", obbligatorio: true, largo: true },
  { campo: "partita_iva", etichetta: "Partita IVA" },
  { campo: "codice_fiscale", etichetta: "Codice Fiscale" },
  { campo: "indirizzo", etichetta: "Indirizzo", largo: true },
  { campo: "cap", etichetta: "CAP" },
  { campo: "citta", etichetta: "Città" },
  { campo: "provincia", etichetta: "Provincia" },
  { campo: "nazione", etichetta: "Nazione" },
  { campo: "telefono", etichetta: "Telefono 1" },
  { campo: "telefono_2", etichetta: "Telefono 2" },
  { campo: "email", etichetta: "Email (per le comunicazioni)" },
  { campo: "codice_destinatario", etichetta: "Codice Univoco" },
  { campo: "pec", etichetta: "PEC" },
  { campo: "note", etichetta: "Note", largo: true, area: true },
];
export const etichettaCampo = c => (CAMPI_ANAGRAFICA.find(x => x.campo === c) || {}).etichetta || c;

export const TABELLA = { cliente: "ci_clienti", fornitore: "ci_fornitori" };
export const NOME_TIPO = { cliente: "cliente", fornitore: "fornitore" };

// ── Normalizzazioni ─────────────────────────────────────────────────────────────────────────────────
export const pulisciPiva = p => String(p || "").toUpperCase().replace(/\s+/g, "").replace(/^IT/, "");
export const cfDaPiva = p => pulisciPiva(p).replace(/^[A-Z]{2}/, "");
export const pulisciEmail = e => String(e || "").trim().toLowerCase();
export const pulisciTelefono = t => String(t || "").replace(/[^\d+]/g, "").replace(/^0039/, "+39").replace(/^\+39/, "");
const vuoto = v => v === null || v === undefined || String(v).trim() === "";

// Controlli di forma: avvisi, non blocchi (si può salvare lo stesso dopo la conferma)
export function avvisiForma(r) {
  const a = [];
  const piva = String(r.partita_iva || "").toUpperCase().replace(/\s+/g, "");
  if (piva && /^IT/.test(piva) && !/^IT\d{11}$/.test(piva)) a.push("La Partita IVA italiana ha 11 cifre dopo «IT».");
  if (piva && /^\d+$/.test(piva) && piva.length !== 11) a.push("La Partita IVA italiana ha 11 cifre.");
  const cf = String(r.codice_fiscale || "").toUpperCase().replace(/\s+/g, "");
  if (cf && !/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z][0-9A-Z]{3}[A-Z]$/.test(cf) && !/^\d{11}$/.test(cf)) a.push("Il Codice Fiscale ha 16 caratteri (persona) oppure 11 cifre (società).");
  const cu = String(r.codice_destinatario || "").trim().toUpperCase();
  if (cu && !/^[A-Z0-9]{7}$/.test(cu) && !/^[A-Z0-9]{6}$/.test(cu)) a.push("Il Codice Univoco ha 7 caratteri (6 per la Pubblica Amministrazione).");
  if (cu === "0000000") a.push("Il Codice Univoco 0000000 vuol dire «nessun codice»: in quel caso la fattura arriva alla PEC o nel cassetto fiscale.");
  for (const [c, nome] of [["email", "L'email"], ["pec", "La PEC"]]) if (r[c] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r[c]).trim())) a.push(`${nome} non sembra un indirizzo valido.`);
  return a;
}

// Differenze tra la scheda salvata e il modulo, campo per campo
export function differenze(prima, dopo) {
  const out = [];
  for (const { campo } of CAMPI_ANAGRAFICA) {
    const a = vuoto(prima?.[campo]) ? "" : String(prima[campo]).trim();
    const b = vuoto(dopo?.[campo]) ? "" : String(dopo[campo]).trim();
    if (a !== b) out.push({ campo, prima: a, dopo: b });
  }
  return out;
}

// Doppioni: un'altra scheda con la stessa Partita IVA o lo stesso Codice Fiscale
export async function cercaDoppione(tipo, id, r) {
  const piva = pulisciPiva(r.partita_iva), cf = String(r.codice_fiscale || "").toUpperCase().trim();
  if (!piva && !cf) return null;
  const { data, error } = await fetchAllPages((da, a) => supabase.from(TABELLA[tipo]).select("id, nome, partita_iva, codice_fiscale").order("id").range(da, a));
  if (error) throw new Error(error.message);
  return (data || []).find(x => x.id !== id && ((piva && pulisciPiva(x.partita_iva) === piva) || (cf && String(x.codice_fiscale || "").toUpperCase().trim() === cf))) || null;
}

export async function salvaAnagrafica(tipo, id, valori) {
  const dati = {};
  for (const { campo } of CAMPI_ANAGRAFICA) dati[campo] = vuoto(valori[campo]) ? null : String(valori[campo]).trim();
  if (dati.codice_destinatario) dati.codice_destinatario = dati.codice_destinatario.toUpperCase();
  if (dati.codice_fiscale) dati.codice_fiscale = dati.codice_fiscale.toUpperCase();
  if (dati.partita_iva) dati.partita_iva = dati.partita_iva.toUpperCase().replace(/\s+/g, "");
  if (dati.provincia) dati.provincia = dati.provincia.toUpperCase();
  if (dati.nazione) dati.nazione = dati.nazione.toUpperCase();
  if (tipo === "fornitore" && valori.gruppo_classificazione !== undefined) dati.gruppo_classificazione = valori.gruppo_classificazione || null;
  if (id) {
    const { data, error } = await supabase.from(TABELLA[tipo]).update(dati).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  if (tipo === "cliente") dati.attivo = true;
  if (tipo === "fornitore" && !dati.gruppo_classificazione) dati.gruppo_classificazione = "FRO";
  const { data, error } = await supabase.from(TABELLA[tipo]).insert([dati]).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function caricaAnagrafiche(tipo) {
  const { data, error } = await fetchAllPages((da, a) => supabase.from(TABELLA[tipo]).select("*").order("nome").order("id").range(da, a));
  if (error) throw new Error(error.message);
  return data || [];
}

// ── Registro delle Comunicazioni ───────────────────────────────────────────────────────────────────
export const TIPI_COMUNICAZIONE = ["Email", "PEC", "Telefonata"];
export const SEZIONE_A_MANO = "Registrata a mano";

// Tutte le comunicazioni: quelle del registro e i report mensili (registro a parte, scritto dall'invio automatico)
export async function caricaComunicazioni() {
  const [reg, rep] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("ci_comunicazioni").select("*").order("data_ora", { ascending: false }).order("id", { ascending: false }).range(da, a)),
    supabase.from("log_invii_report").select("id, data_invio, tipo, mese_riferimento, destinatari, stato, errore").order("data_invio", { ascending: false }),
  ]);
  if (reg.error) throw new Error(`Registro delle Comunicazioni: ${reg.error.message}`);
  const righe = (reg.data || []).map(r => ({ ...r, origine: "registro", chiave: `c${r.id}` }));
  // Il report mensile: una riga per destinatario, in sola lettura
  for (const l of rep.data || []) {
    for (const d of l.destinatari || []) {
      righe.push({
        // data_invio è scritta in ora UTC senza fuso: si aggiunge «Z» per leggerla giusta
        chiave: `r${l.id}-${d}`, origine: "report", id: null, data_ora: l.data_invio ? `${String(l.data_invio).replace(" ", "T")}${/[zZ]|[+-]\d\d:?\d\d$/.test(String(l.data_invio)) ? "" : "Z"}` : null,
        tipo: "Email", direzione: "inviata", indirizzo: d,
        oggetto: `Report mensile di Podere Verde — ${l.mese_riferimento || ""}${l.tipo === "test" ? " (invio di prova)" : ""}`,
        testo: `Invio automatico del report mensile${l.mese_riferimento ? ` del mese ${l.mese_riferimento}` : ""} a ${(l.destinatari || []).length} destinatari.${l.errore ? `\nErrore: ${l.errore}` : ""}`,
        allegati: [], sezione: "Report mensile", esito: l.stato === "completato" ? "inviata" : (l.stato || ""), note: null,
      });
    }
  }
  righe.sort((a, b) => String(b.data_ora).localeCompare(String(a.data_ora)));
  return righe;
}

// Le comunicazioni che appartengono a una scheda
export function comunicazioniDi(tipo, record, tutte) {
  const indirizzi = new Set([record.email, record.pec].map(pulisciEmail).filter(Boolean));
  const telefoni = new Set([record.telefono, record.telefono_2].map(pulisciTelefono).filter(t => t.length >= 6));
  return tutte.filter(c => {
    if (tipo === "cliente" && c.cliente_id === record.id) return true;
    if (tipo === "fornitore" && c.fornitore_id === record.id) return true;
    if (c.tipo === "Telefonata") return telefoni.has(pulisciTelefono(c.indirizzo));
    return indirizzi.has(pulisciEmail(c.indirizzo));
  });
}

// A chi appartiene una comunicazione (per il registro generale)
export function intestatarioDi(c, clienti, fornitori) {
  const out = [];
  const tel = pulisciTelefono(c.indirizzo), mail = pulisciEmail(c.indirizzo);
  const coincide = r => (c.tipo === "Telefonata"
    ? tel.length >= 6 && [r.telefono, r.telefono_2].map(pulisciTelefono).includes(tel)
    : mail && [r.email, r.pec].map(pulisciEmail).includes(mail));
  for (const r of clienti) if (c.cliente_id === r.id || coincide(r)) out.push({ tipo: "cliente", id: r.id, nome: r.nome });
  for (const r of fornitori) if (c.fornitore_id === r.id || coincide(r)) out.push({ tipo: "fornitore", id: r.id, nome: r.nome });
  return out;
}

const nomeSicuro = n => String(n || "file").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);

// Carica gli allegati nella cartella «comunicazioni» e restituisce [{nome, percorso}]
export async function caricaAllegati(files) {
  const out = [];
  const anno = new Date().getFullYear();
  for (const f of files) {
    const percorso = `${anno}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${nomeSicuro(f.name)}`;
    const { error } = await supabase.storage.from("comunicazioni").upload(percorso, f, { contentType: f.type || "application/octet-stream", upsert: false });
    if (error) throw new Error(`Allegato «${f.name}» non caricato: ${error.message}`);
    out.push({ nome: f.name, percorso });
  }
  return out;
}

export async function registraComunicazione(r) {
  const { data, error } = await supabase.from("ci_comunicazioni").insert([r]).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// Apre un allegato: file nella cartella «comunicazioni», oppure il file XML di una fattura emessa dal programma
export async function apriAllegato(a) {
  if (a.percorso) {
    const { data, error } = await supabase.storage.from("comunicazioni").createSignedUrl(a.percorso, 300);
    if (error) throw new Error(error.message);
    window.open(data.signedUrl, "_blank", "noopener");
    return;
  }
  if (a.fattura_emessa_id) {
    const { data, error } = await supabase.from("ci_fatture_emesse").select("xml, nome_file_xml").eq("id", a.fattura_emessa_id).single();
    if (error) throw new Error(error.message);
    const url = URL.createObjectURL(new Blob([data.xml || ""], { type: "application/xml" }));
    const link = document.createElement("a");
    link.href = url; link.download = data.nome_file_xml || a.nome || "fattura.xml"; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

// Manda una mail dal programma al cliente o al fornitore (funzione del server invia-mail-anagrafica)
export const LIMITE_ALLEGATI = 8 * 1024 * 1024;
export async function mandaMail({ tipo, id, oggetto, testo, files }) {
  const totale = files.reduce((s, f) => s + f.size, 0);
  if (totale > LIMITE_ALLEGATI) throw new Error(`Gli allegati pesano ${(totale / 1048576).toFixed(1)} MB: il massimo è 8 MB.`);
  const allegati = [];
  for (const f of files) {
    const b = new Uint8Array(await f.arrayBuffer());
    let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    allegati.push({ nome: f.name, tipo: f.type || "application/octet-stream", contenuto: btoa(s) });
  }
  const { data, error } = await supabase.functions.invoke("invia-mail-anagrafica", { body: { tipo, id, oggetto, testo, allegati } });
  if (error) {
    let messaggio = error.message;
    try { const j = await error.context.json(); if (j?.error) messaggio = j.error; } catch { /* risposta senza testo */ }
    throw new Error(`Mail non mandata: ${messaggio}`);
  }
  if (!data?.ok) throw new Error(`Mail non mandata: ${data?.error || "risposta non valida"}`);
  return data;
}

export const FIRMA = "Società Agricola Podere Verde a r.l.\nVia Portuense 1118, 00148 Roma\nPartita IVA 15117871002";

export function quando(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
}
// Data e ora locali per i campi del modulo (aaaa-mm-ggThh:mm)
export function adessoLocale() {
  const d = new Date(); const z = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}
