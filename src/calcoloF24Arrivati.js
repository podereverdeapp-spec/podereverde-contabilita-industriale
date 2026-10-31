// Versione 339 (31/10/2026, ordine del Dott. Bizzarri): regole della pagina «F24 arrivati: controlla e archivia».
// Lettura dell'Excel scritto dal «Prompt di lettura F24» (versione 2), confronto con il database, proposte di archiviazione
// e piano dei file da scrivere nell'ARCHIVIO. Qui non si scrive niente: scrivono la pagina e archivioF24.js.
import { leggiData, testo, r2, improntaRighe, SEZIONI, TRATTAMENTI } from "./calcoloCaricoF24";

export const PREFISSO_ARCHIVIO = "Z:\\SOCIETA\\SOCIETA' AGRICOLA PODERE VERDE A R.L\\F24\\ARCHIVIO\\"; // 61 caratteri
export const LIMITE_PERCORSO = 250;
export const CODICE_FISCALE = "15117871002";
// il nome di file più lungo che può finire in una cartella del pagamento (serve a controllare la lunghezza prima di scrivere)
const PEGGIOR_FILE = "SUPERATI\\CONTABILE BANCA 2026-12-31 superato il 2026-12-31_2.pdf";

export const COLONNE = {
  "Lettura": ["Data e ora della lettura", "Operatore", "Codice della cartella", "Numero di file trovati", "Numero di righe del foglio «Documenti»", "Versione del prompt"],
  "Documenti": ["Nome del file ricevuto", "Percorso", "Dimensione in byte", "Impronta MD5", "Estratto da", "Tipo di documento", "PDF digitale o scansione",
    "Codice fiscale letto", "Numero di deleghe, quietanze o contabili contenute", "Esito della lettura", "Note"],
  "F24": ["Codice delega", "Nome file PDF", "Nome del file ricevuto", "Delega nel file ricevuto", "Oggetto", "Data di scadenza", "Totale a debito",
    "Totale a credito", "Saldo", "Tipo di pagamento", "Stato", "Data del pagamento", "Codice banca e sportello", "Banca di addebito", "Protocollo telematico",
    "Nome file quietanza", "Nome file contabile della banca", "Numero dell'operazione della banca", "Note", "Pagine nel file ricevuto",
    "Pagine della quietanza nel suo file", "Pagine della contabile nel suo file"],
  "Righe tributo": ["Codice delega", "Nome file PDF", "Sezione", "Codice tributo o causale", "Descrizione del codice", "Codice ente o sede",
    "Matricola o riferimento", "Rateazione o mese di riferimento", "Anno di riferimento", "Periodo dal", "Periodo al", "Importo a debito",
    "Importo a credito", "Trattamento", "Codice nuovo confermato da"],
  "Verifica": ["Codice delega", "Nome file PDF", "Somma dei debiti delle righe", "Totale dei debiti stampato", "Somma dei crediti delle righe",
    "Totale dei crediti stampato", "Saldo calcolato", "Saldo finale stampato", "Corrisponde?", "Codice sconosciuto", "Avvisi"],
  "Comunicazioni": ["Nome del file ricevuto", "Chi la manda", "Data del documento", "Che cos'è", "Di che cosa parla", "Chiede un pagamento?",
    "Importo chiesto", "Scadenza", "Numero di protocollo o dell'atto", "Codice delega collegato", "Note"],
};
const CAMPI = {
  "Lettura": ["quando", "operatore", "codice_cartella", "file_trovati", "righe_documenti", "versione"],
  "Documenti": ["nome", "percorso", "dimensione", "md5", "estratto_da", "tipo", "digitale", "codice_fiscale", "contenuti", "esito", "note"],
  "F24": ["codice_delega", "nome_file_pdf", "nome_file_ricevuto", "delega_nel_file_ricevuto", "oggetto", "data_scadenza", "totale_debito",
    "totale_credito", "saldo", "tipo_pagamento", "stato", "data_pagamento", "codice_banca_sportello", "banca_addebito", "protocollo_telematico",
    "nome_file_quietanza", "nome_file_contabile", "numero_operazione_banca", "note", "pagine", "pagine_quietanza", "pagine_contabile"],
  "Righe tributo": ["codice_delega", "nome_file_pdf", "sezione", "codice_tributo", "descrizione_codice", "codice_ente_sede", "matricola_riferimento",
    "rateazione_mese", "anno_riferimento", "periodo_dal", "periodo_al", "importo_debito", "importo_credito", "trattamento", "codice_confermato_da"],
  "Verifica": ["codice_delega", "nome_file_pdf", "somma_debiti", "totale_debiti", "somma_crediti", "totale_crediti", "saldo_calcolato", "saldo_stampato",
    "corrisponde", "codice_sconosciuto", "avvisi"],
  "Comunicazioni": ["nome", "chi", "data", "cosa", "parla", "chiede_pagamento", "importo", "scadenza", "protocollo", "collegato", "note"],
};
const DATE = new Set(["data_scadenza", "data_pagamento", "data", "scadenza"]);
const IMPORTI = new Set(["totale_debito", "totale_credito", "saldo", "importo_debito", "importo_credito", "somma_debiti", "totale_debiti",
  "somma_crediti", "totale_crediti", "saldo_calcolato", "saldo_stampato", "importo"]);
const NUMERI = new Set(["dimensione", "file_trovati", "righe_documenti", "contenuti"]);

function cella(campo, grezzo, scritto) {
  if (DATE.has(campo)) return leggiData(grezzo);
  if (IMPORTI.has(campo)) {
    if (grezzo == null || grezzo === "") return { valore: 0 };
    if (typeof grezzo === "number" && Number.isFinite(grezzo)) return { valore: r2(grezzo) };
    return { errore: `«${grezzo}» è scritto come testo, non come numero` };
  }
  if (NUMERI.has(campo)) {
    const n = typeof grezzo === "number" ? grezzo : Number(String(grezzo ?? "").replace(/\./g, ""));
    return Number.isFinite(n) ? { valore: n } : { errore: `«${grezzo}» non è un numero` };
  }
  if (typeof grezzo === "number" && Number.isInteger(grezzo) && Math.abs(grezzo) >= 1e15)
    return { errore: `«${scritto ?? grezzo}» è scritto come numero e ha perso delle cifre: va scritto come testo` };
  const w = scritto == null ? "" : String(scritto).trim();
  if (typeof grezzo === "number") return { valore: testo(/^0\d+$/.test(w) || /^\d{1,4}[/-]\d{1,4}([/-]\d{1,4})?$/.test(w) ? w : String(grezzo)) };
  return { valore: testo(scritto ?? grezzo) };
}

// ── Lettura dell'Excel della lettura ────────────────────────────────────────────────────────────────
export function leggiLettura(XLSX, buffer) {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const anomalie = [];
  if (wb.Workbook?.WBProps?.date1904) return { anomalie: ["Il file usa il calendario di Excel per Mac «dal 1904»: le date verrebbero sbagliate di 4 anni."] };
  const fogli = {};
  for (const [nome, colonne] of Object.entries(COLONNE)) {
    const ws = wb.Sheets[nome];
    if (!ws) { anomalie.push(`Manca il foglio «${nome}».`); continue; }
    const grezze = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    const scritte = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null, blankrows: true });
    const intest = (grezze[0] || []).map(x => (x == null ? "" : String(x).trim()));
    if (colonne.some((c, i) => intest[i] !== c) || intest.filter(Boolean).length !== colonne.length) {
      anomalie.push(`Foglio «${nome}»: le colonne non sono quelle del prompt di lettura (attese: ${colonne.join(" | ")}).`); continue;
    }
    fogli[nome] = grezze.slice(1).map((r, i) => ({ riga: i + 2, grezzo: r, scritto: scritte[i + 1] || [] }))
      .filter(x => x.grezzo.some(c => c != null && String(c).trim() !== ""))
      .map(({ riga, grezzo, scritto }) => {
        const o = { riga, errori: [] };
        CAMPI[nome].forEach((campo, i) => { const x = cella(campo, grezzo[i], scritto[i]); if (x.errore) o.errori.push(`${colonne[i]}: ${x.errore}.`); o[campo] = x.valore ?? null; });
        return o;
      });
  }
  if (anomalie.length) return { anomalie };
  const lettura = fogli["Lettura"][0];
  if (!lettura) anomalie.push("Il foglio «Lettura» è vuoto.");
  const documenti = fogli["Documenti"];
  const deleghe = fogli["F24"].map(d => ({ ...d, righe: [], verifica: null }));
  const perCodice = new Map(deleghe.map(d => [d.codice_delega, d]));
  for (const r of fogli["Righe tributo"]) {
    const d = perCodice.get(r.codice_delega);
    if (!d) { anomalie.push(`Righe tributo, riga ${r.riga}: il Codice delega «${r.codice_delega ?? ""}» non è nel foglio «F24».`); continue; }
    if (r.codice_tributo) r.codice_tributo = r.codice_tributo.toUpperCase().replace(/\s+/g, "");
    d.righe.push(r);
  }
  for (const v of fogli["Verifica"]) {
    const d = perCodice.get(v.codice_delega);
    if (!d) { anomalie.push(`Verifica, riga ${v.riga}: il Codice delega «${v.codice_delega ?? ""}» non è nel foglio «F24».`); continue; }
    d.verifica = v;
  }
  // controlli di ogni delega (come il programma di carico): un errore ferma solo quella delega
  const visti = new Map();
  for (const d of deleghe) {
    if (!/^D-\d{8}-\d{4}-\d{3}$/.test(d.codice_delega || "")) d.errori.push(`Codice delega «${d.codice_delega ?? ""}» scritto male (forma D-AAAAMMGG-hhmm-NNN).`);
    if (visti.has(d.codice_delega)) d.errori.push(`Codice delega ripetuto (riga ${visti.get(d.codice_delega)}).`); else visti.set(d.codice_delega, d.riga);
    if (!d.oggetto) d.errori.push("Manca l'Oggetto.");
    if (!d.data_scadenza) d.errori.push("Manca la Data di scadenza.");
    if (!["Da pagare", "Pagato"].includes(d.stato)) d.errori.push(`Stato «${d.stato ?? ""}» non ammesso (Da pagare o Pagato).`);
    if (r2(d.totale_debito - d.totale_credito) !== r2(d.saldo)) d.errori.push("Il Saldo non è uguale al Totale a debito meno il Totale a credito.");
    if (d.stato === "Pagato" && !d.data_pagamento) d.errori.push("«Pagato» senza la Data del pagamento.");
    if (d.stato === "Pagato" && !d.nome_file_quietanza && !d.nome_file_contabile) d.errori.push("«Pagato» senza quietanza e senza contabile.");
    if (!d.righe.length) d.errori.push("Nessuna riga nel foglio «Righe tributo».");
    let deb = 0, cred = 0;
    for (const r of d.righe) {
      deb += r.importo_debito; cred += r.importo_credito;
      if (!SEZIONI.includes(r.sezione)) d.errori.push(`Righe tributo, riga ${r.riga}: Sezione «${r.sezione ?? ""}» non ammessa.`);
      if (!r.codice_tributo) d.errori.push(`Righe tributo, riga ${r.riga}: manca il codice.`);
      if (!TRATTAMENTI.some(t => (r.trattamento || "").startsWith(t))) d.errori.push(`Righe tributo, riga ${r.riga}: Trattamento non ammesso.`);
      d.errori.push(...r.errori);
    }
    if (d.righe.length && (r2(deb) !== r2(d.totale_debito) || r2(cred) !== r2(d.totale_credito))) d.errori.push("La somma delle righe non è uguale ai totali.");
    if (!d.verifica) d.errori.push("Manca la riga nel foglio «Verifica».");
    else if (!["SI", "DA CONFERMARE"].includes(d.verifica.corrisponde)) d.errori.push(`Verifica: «Corrisponde?» è «${d.verifica.corrisponde ?? ""}».`);
    d.scansione = d.verifica?.corrisponde === "DA CONFERMARE";
  }
  const comunicazioni = fogli["Comunicazioni"].map(c => ({ ...c, chiede_pagamento: String(c.chiede_pagamento || "").toUpperCase() === "SI" }));
  // conto dei file: quelli trovati da Claude devono avere tutti la loro riga
  if (lettura && documenti.filter(x => !x.estratto_da).length !== lettura.file_trovati)
    anomalie.push(`Claude ha trovato ${lettura.file_trovati} file, ma nel foglio «Documenti» ce ne sono ${documenti.filter(x => !x.estratto_da).length} (senza contare gli estratti): manca qualcosa.`);
  for (const x of documenti) if (x.codice_fiscale && x.codice_fiscale !== CODICE_FISCALE && x.esito !== "Non è di Podere Verde")
    anomalie.push(`«${x.nome}»: codice fiscale ${x.codice_fiscale}, non di Podere Verde, ma la lettura non lo ha scartato.`);
  return { lettura, documenti, deleghe, comunicazioni, anomalie };
}

// ── Nomi e percorsi ────────────────────────────────────────────────────────────────────────────────
export function nomeCartellaValido(n) {
  if (!n) return "manca il nome";
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2} /.test(n)) return "deve cominciare con la data, per esempio «2026-11-16 »";
  if (/[\\/:*?"<>|~]/.test(n)) return "non può contenere \\ / : * ? \" < > | ~";
  if (/[ .]$/.test(n)) return "non può finire con uno spazio o un punto";
  if (n !== n.toUpperCase()) return "va scritto in maiuscolo";
  if (n.length > 60) return `è lungo ${n.length} caratteri: al massimo 60`;
  return null;
}
export const proponiNome = (data, oggetto) => `${data} ${String(oggetto || "").toUpperCase().replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ")}`.slice(0, 60).replace(/[ .]+$/, "");
export const lunghezzaPeggiore = (cartella, nome) => PREFISSO_ARCHIVIO.length + cartella.length + 1 + 5 + nome.length + 1 + PEGGIOR_FILE.length;
const nomeEnte = chi => {
  const s = String(chi || "ALTRO").toUpperCase().replace(/\./g, "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return s.slice(0, 40);
};
export const nomeFileComunicazione = c => `${String(c.cosa || "LETTERA").toUpperCase()} ${nomeEnte(c.chi)} ${c.data || "SENZA DATA"}.pdf`.replace(/\s+/g, " ");

// ── Confronto con il database e proposte ───────────────────────────────────────────────────────────
// db: { f24, righe, codici, cartelle, documenti, fileArchivio }; scelte: le scelte salvate nel lavoro in corso
// lavoroId: il lavoro di questa lettura (gli F24 salvati nel programma appena caricata la lettura sono «suoi», non doppioni)
export function classifica(letta, db, scelte = {}, lavoroId = null) {
  const codici = new Map(db.codici.map(c => [c.codice, c]));
  const righePerF24 = new Map();
  for (const r of db.righe) { if (!righePerF24.has(r.f24_id)) righePerF24.set(r.f24_id, []); righePerF24.get(r.f24_id).push(r); }
  const dbF24 = db.f24.map(f => ({ ...f, righe: righePerF24.get(f.id) || [], impronta: improntaRighe(righePerF24.get(f.id) || []) }));
  const docPerNome = new Map(letta.documenti.map(x => [x.nome, x]));
  const documentiMd5 = new Set(db.documenti.map(x => x.md5));
  const nomiCodiciNuovi = scelte.codici || {};
  const cartelleDi = d => [...new Set(d.righe.filter(r => r.importo_debito > 0).map(r => {
    const c = codici.get(r.codice_tributo);
    if (c?.cartella_nuova) return c.cartella_nuova;
    const n = nomiCodiciNuovi[r.codice_tributo];
    return n?.confermato ? n.cartella : null;
  }).filter(Boolean))];

  const deleghe = letta.deleghe.map(d => {
    const s = (scelte.deleghe || {})[d.codice_delega] || {};
    const doc = docPerNome.get(d.nome_file_ricevuto);
    const soloPagamento = !d.nome_file_pdf; // riga nata da una quietanza o contabile senza il suo F24
    const impronta = improntaRighe(d.righe);
    const problemi = [...d.errori];
    let esistente = null, decisione = null, colore = "verde";
    // 1) stesso F24 già nel programma (stesse righe; per un F24 anche la stessa scadenza)
    const uguali = dbF24.filter(f => f.impronta === impronta && f.stato !== "Sostituito" && (soloPagamento || f.data_scadenza === d.data_scadenza));
    if (uguali.length === 1) esistente = uguali[0];
    else if (uguali.length > 1) {
      const scelto = uguali.find(f => f.codice_delega === s.abbinaA);
      if (scelto) esistente = scelto; else { problemi.push("più F24 nel programma hanno le stesse righe: scegli quale"); decisione = { tipo: "scegli", candidati: uguali }; }
    }
    const suo = !!(esistente && lavoroId && esistente.lavoro_id === lavoroId); // salvato da questo lavoro appena caricata la lettura
    // 2) un F24 diverso con la stessa scadenza e le stesse cartelle: versione corretta o F24 in più?
    let sostituisce = null;
    const categorie = cartelleDi(d);
    if (!esistente && !soloPagamento) {
      const simili = dbF24.filter(f => f.data_scadenza === d.data_scadenza && f.stato !== "Sostituito" && f.impronta !== impronta && !(lavoroId && f.lavoro_id === lavoroId) &&
        cartelleDi(f).join("|") === categorie.join("|") && categorie.length);
      if (simili.length) {
        decisione = { tipo: "versione", candidati: simili };
        if (s.versione === "corretta" && s.sostituisce) {
          sostituisce = simili.find(f => f.codice_delega === s.sostituisce) || null;
          if (sostituisce?.stato === "Pagato") { problemi.push(`l'F24 ${sostituisce.codice_delega} è già pagato: non può essere sostituito. Chiedere allo studio`); sostituisce = null; }
          if (!sostituisce) problemi.push("scegli quale F24 sostituisce");
        } else if (s.versione !== "in più") problemi.push(`c'è già un F24 con la stessa scadenza e le stesse cartelle ma righe diverse (${simili.map(f => f.codice_delega).join(", ")}): è una versione corretta o un F24 in più?`);
      }
    }
    // archiviazione ripresa dopo un'interruzione: la versione corretta è già nel programma, ma il file vecchio va ancora in SUPERATI
    if (suo && s.versione === "corretta" && s.sostituisce) sostituisce = dbF24.find(f => f.codice_delega === s.sostituisce) || null;
    // codici nuovi (solo quelli a debito decidono la cartella; quelli a credito si registrano comunque)
    const nuovi = d.righe.filter(r => !codici.has(r.codice_tributo)).map(r => ({ sezione: r.sezione, codice: r.codice_tributo, debito: r.importo_debito, credito: r.importo_credito }));
    for (const n of nuovi) if (!nomiCodiciNuovi[n.codice]?.confermato) problemi.push(`codice nuovo ${n.codice} da controllare`);
    // il nome della cartella del pagamento: quello già nel programma, quello del F24 sostituito, quello scelto o la proposta
    const proposto = proponiNome(soloPagamento ? d.data_pagamento : d.data_scadenza, d.oggetto);
    const nome = esistente?.cartella_pagamento || sostituisce?.cartella_pagamento || s.nome || proposto;
    if (!esistente?.cartella_pagamento && !sostituisce?.cartella_pagamento) {
      const err = nomeCartellaValido(nome); if (err) problemi.push(`nome della cartella: ${err}`);
    }
    if (soloPagamento && (!esistente || suo)) {
      if (!s.categoria) problemi.push("scegli la cartella dell'archivio (l'F24 non è arrivato)");
      if (!s.confermato) problemi.push("conferma che l'F24 manca davvero");
    }
    const cartelle = soloPagamento && (!esistente || suo) ? (s.categoria ? [s.categoria] : []) : esistente ? cartelleDi(esistente).length ? cartelleDi(esistente) : categorie : categorie;
    if (!cartelle.length && !nuovi.length && !(soloPagamento && (!esistente || suo))) problemi.push("nessun codice a debito decide la cartella");
    for (const c of cartelle) { const l = lunghezzaPeggiore(c, nome); if (l > LIMITE_PERCORSO) problemi.push(`percorso troppo lungo in ${c}: ${l} caratteri (massimo ${LIMITE_PERCORSO}): accorcia il nome`); }
    const scansione = d.scansione || doc?.digitale === "Scansione";
    if (scansione && !s.scansioneConfermata) problemi.push("scansione: confronta scadenza, saldo, codici e importi con il PDF");
    // il file dell'F24 è già nell'archivio? (stesso F24 arrivato di nuovo)
    const giaArchiviato = esistente && db.fileArchivio.some(x => x.f24_id === esistente.id && x.cosa === "F24" && !x.superato);
    const quietanzaArchiviata = esistente && db.fileArchivio.some(x => x.f24_id === esistente.id && x.cosa === "Quietanza" && !x.superato);
    const contabileArchiviata = esistente && db.fileArchivio.some(x => x.f24_id === esistente.id && x.cosa === "Contabile della banca" && !x.superato);
    // una quietanza (o contabile) è nuova finché il suo file non è nell'archivio: il programma può averla già segnata appena aperta la lettura
    const nuovaQuietanza = !!d.nome_file_quietanza && !quietanzaArchiviata;
    const nuovaContabile = !!d.nome_file_contabile && !contabileArchiviata;
    const nienteDiNuovo = esistente && (giaArchiviato || soloPagamento) && !nuovaQuietanza && !nuovaContabile;
    if (problemi.length) colore = "rosso";
    else if (nienteDiNuovo) colore = "grigio";
    else if (scansione || (soloPagamento && (!esistente || suo))) colore = "arancione";
    return { ...d, s, doc, soloPagamento, impronta, esistente, suo, sostituisce, decisione, categorie, cartelle, nuovi, proposto, nome, scansione,
      giaArchiviato, nuovaQuietanza, nuovaContabile, nienteDiNuovo, problemi, colore };
  });

  // nomi uguali tra pagamenti diversi di questa lettura e del programma (Windows non distingue maiuscole e minuscole)
  const usati = new Map();
  for (const f of dbF24) if (f.cartella_pagamento && f.stato !== "Sostituito" && !(lavoroId && f.lavoro_id === lavoroId)) usati.set(f.cartella_pagamento.toUpperCase(), f.codice_delega);
  for (const d of deleghe) {
    if ((d.esistente && !d.suo) || d.sostituisce) continue;
    const k = d.nome.toUpperCase();
    if (usati.has(k)) { d.problemi.push(`il nome «${d.nome}» è già usato (${usati.get(k)}): aggiungi «_2»`); d.colore = "rosso"; }
    else usati.set(k, d.codice_delega);
  }

  const comunicazioni = letta.comunicazioni.map((c, i) => {
    const s = (scelte.comunicazioni || {})[c.nome + "|" + i] || {};
    const doc = docPerNome.get(c.nome);
    const cartella = s.cartella ?? proponiCartellaComunicazione(c, db.cartelle);
    const collegato = s.collegato ?? (deleghe.some(d => d.codice_delega === c.collegato) ? c.collegato : "");
    const problemi = [...c.errori];
    if (!cartella) problemi.push("scegli la cartella");
    const giaNelProgramma = doc?.md5 && documentiMd5.has(doc.md5);
    return { ...c, k: c.nome + "|" + i, s, doc, cartella, collegato, nomeFile: nomeFileComunicazione(c), giaNelProgramma, problemi,
      colore: problemi.length ? "rosso" : giaNelProgramma ? "grigio" : c.chiede_pagamento ? "arancione" : "verde" };
  });

  const scartati = letta.documenti.filter(x => ["Non è di Podere Verde", "Non è un F24", "Documento non riconosciuto", "Non letto"].includes(x.esito)
    || ["Non è un F24", "Documento non riconosciuto"].includes(x.tipo));
  return { deleghe, comunicazioni, scartati };
}

export function proponiCartellaComunicazione(c, cartelle) {
  const chi = String(c.chi || "").toUpperCase().replace(/\./g, "");
  const esiste = p => cartelle.some(x => x.percorso === p) ? p : null;
  if (/FIMI/.test(chi)) return /BONIFICO/i.test(c.cosa || "") ? esiste("FONDO FIMI\\BONIFICI") : esiste("FONDO FIMI\\COMUNICAZIONI");
  if (/INAIL/.test(chi)) return esiste("LAVORO\\INAIL\\COMUNICAZIONI");
  if (/INPS/.test(chi)) return esiste("LAVORO\\INPS\\COMUNICAZIONI");
  if (/CAMERA DI COMMERCIO/.test(chi)) return esiste("DIRITTI CAMERALI\\COMUNICAZIONI");
  if (/COMUNE|REGIONE/.test(chi)) return esiste("TRIBUTI LOCALI\\COMUNICAZIONI");
  if (/AGENZIA DELLE ENTRATE/.test(chi)) return esiste("IMPOSTE E IVA\\COMUNICAZIONI");
  return null;
}

// ── Piano dei file da scrivere nell'ARCHIVIO (percorsi relativi ad ARCHIVIO) ─────────────────────────
export function pianoArchivio(cl, oggi, documenti = []) {
  const passi = []; // { cosa, sorgente (nome ricevuto), pagine, destinazione, delega?, comunicazione? }
  const annoDi = d => String(d || oggi).slice(0, 4);
  for (const d of cl.deleghe) {
    if (d.colore === "rosso" || d.nienteDiNuovo) continue;
    const anno = annoDi(d.esistente?.data_scadenza || d.sostituisce?.data_scadenza || (d.soloPagamento ? d.data_pagamento : d.data_scadenza));
    for (const cat of d.cartelle) {
      const base = `${cat}\\${anno}\\${d.nome}`;
      if (!d.soloPagamento && !d.giaArchiviato)
        passi.push({ cosa: "F24", sorgente: d.nome_file_ricevuto, pagine: d.pagine, destinazione: `${base}\\F24 ${d.data_scadenza}.pdf`, delega: d.codice_delega, categoria: cat });
      if (d.nome_file_quietanza && d.nuovaQuietanza)
        passi.push({ cosa: "Quietanza", sorgente: d.nome_file_quietanza, pagine: d.pagine_quietanza, destinazione: `${base}\\QUIETANZA ${d.data_pagamento}.pdf`, delega: d.codice_delega, categoria: cat });
      if (d.nome_file_contabile && d.nuovaContabile)
        passi.push({ cosa: "Contabile della banca", sorgente: d.nome_file_contabile, pagine: d.pagine_contabile, destinazione: `${base}\\CONTABILE BANCA ${d.data_pagamento}.pdf`, delega: d.codice_delega, categoria: cat });
    }
  }
  for (const c of cl.comunicazioni) {
    if (c.colore === "rosso" || c.giaNelProgramma) continue;
    passi.push({ cosa: "Comunicazione o altro documento", sorgente: c.nome, destinazione: `${c.cartella}\\${annoDi(c.data)}\\${c.nomeFile}`, comunicazione: c.k, categoria: c.cartella });
    const d = cl.deleghe.find(x => x.codice_delega === c.collegato && x.colore !== "rosso");
    if (d) for (const cat of d.cartelle)
      passi.push({ cosa: "Comunicazione o altro documento", sorgente: c.nome, destinazione: `${cat}\\${annoDi(d.data_scadenza)}\\${d.nome}\\${c.nomeFile}`, comunicazione: c.k, categoria: cat });
  }
  // un file ricevuto che contiene più documenti (o più deleghe) si conserva intero in ORIGINALI RICEVUTI
  const usiPerFile = new Map();
  for (const p of passi) { const k = p.sorgente; if (!usiPerFile.has(k)) usiPerFile.set(k, new Set()); usiPerFile.get(k).add(p.pagine || "tutto"); }
  for (const [f, pagine] of usiPerFile) if (pagine.size > 1)
    passi.push({ cosa: "Originale ricevuto", sorgente: f, destinazione: `ORIGINALI RICEVUTI\\${annoDi(oggi)}\\${f}`, categoria: "ORIGINALI RICEVUTI" });
  // i contenitori (zip, PDF firmati, mail) da cui Claude ha estratto i file: si conservano interi in ORIGINALI RICEVUTI
  for (const x of documenti) if (documenti.some(y => y.estratto_da === x.nome) && passi.some(p => documenti.some(y => y.estratto_da === x.nome && y.nome === p.sorgente)))
    passi.push({ cosa: "Originale ricevuto", sorgente: x.nome, destinazione: `ORIGINALI RICEVUTI\\${annoDi(oggi)}\\${x.nome}`, categoria: "ORIGINALI RICEVUTI" });
  // due file con lo stesso nome nella stessa cartella: «_2», «_3» (senza distinguere maiuscole e minuscole)
  const visti = new Map();
  for (const p of passi) {
    let k = p.destinazione.toUpperCase();
    if (!visti.has(k)) { visti.set(k, p); continue; }
    if (visti.get(k).sorgente === p.sorgente && visti.get(k).pagine === p.pagine) { p.doppione = true; continue; }
    for (let n = 2; ; n++) {
      const alt = p.destinazione.replace(/(\.[^.\\]+)$/, `_${n}$1`);
      if (!visti.has(alt.toUpperCase())) { p.destinazione = alt; visti.set(alt.toUpperCase(), p); break; }
    }
  }
  return passi.filter(p => !p.doppione).map(p => ({ ...p, lunghezza: PREFISSO_ARCHIVIO.length + p.destinazione.length }));
}

// pagine «3-4», «2», «1,3» → indici (da 0); vuoto o «NON PRESENTE» → tutte
export function pagineDa(testoPagine, totale) {
  if (!testoPagine || /NON/i.test(testoPagine)) return null;
  const out = [];
  for (const parte of String(testoPagine).split(/[,;]/)) {
    const m = parte.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) return { errore: `pagine «${testoPagine}» scritte male` };
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b < a || b > totale) return { errore: `pagine «${testoPagine}» fuori dal file (${totale} pagine)` };
    for (let i = a; i <= b; i++) out.push(i - 1);
  }
  return out.length === totale && out.every((x, i) => x === i) ? null : out;
}
