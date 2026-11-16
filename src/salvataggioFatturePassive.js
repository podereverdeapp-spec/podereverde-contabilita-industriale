// Versione 384 – Salvataggio delle righe delle fatture passive, comune a due pagine:
//  - «Carica Fatture» (CaricaFatture.jsx: carico da Excel, PDF e XML, e classificazione dentro «Documenti arrivati»);
//  - «Leggi le fatture passive di Aruba» (LetturaPassiveAruba.jsx, nuova nella 384).
// Il codice è SPOSTATO da CaricaFatture.jsx (versione 382, righe 445–643) senza cambiare le scritture nel database.
// Le sole differenze: quello che prima toccava la pagina (elenco dei fornitori, regole in memoria, finestre
// del browser) ora arriva da fuori come funzione («chiamate»), così ogni pagina decide come mostrarlo.
import { supabase } from "./supabase";
import { creaCespiteDaRiga, anniDaRiga } from "./cespitiDaFatture";
import { applicaDocumento, assicuraScadenze } from "./documentoFattura";
import { round2, formattaEuro, fetchAllPages } from "./parsingUtils";

// Trova il fornitore già presente nel database, oppure lo crea UNA SOLA VOLTA.
// Prima si creava una scheda nuova per ogni riga salvata di un fornitore nuovo: le righe
// della stessa fattura finivano su schede diverse e quindi su fatture diverse (fattura
// "spezzata"). Ora si cerca nel database al momento del salvataggio, prima per partita IVA
// (scritta sempre allo stesso modo: senza spazi, con o senza "IT"), poi per nome.
// La classificazione di ogni riga resta esattamente quella di prima.
// chiamate.nuovoFornitore(fornitore): la pagina aggiunge la scheda nuova al suo elenco (facoltativo)
export async function trovaOCreaFornitore(riga, chiamate = {}) {
  if (riga.fornitore_obj?.id) return riga.fornitore_obj.id;
  if (!riga.fornitore && !riga.piva) return null;

  const pivaPulita = (riga.piva || "").replace(/\s+/g, "").toUpperCase().replace(/^IT/, "");
  if (pivaPulita) {
    const { data: perPiva, error } = await supabase.from("ci_fornitori").select("*")
      .in("partita_iva", [pivaPulita, `IT${pivaPulita}`, (riga.piva || "").trim()])
      .order("id").limit(1);
    if (error) throw new Error(`Errore cercando il fornitore: ${error.message}`);
    if (perPiva && perPiva.length > 0) return perPiva[0].id;
  }

  const nomePulito = (riga.fornitore || "").trim().toLowerCase();
  if (nomePulito) {
    const { data: perNome, error } = await fetchAllPages((da, a) => supabase.from("ci_fornitori").select("*").order("id").range(da, a));
    if (error) throw new Error(`Errore cercando il fornitore: ${error.message}`);
    // Stesso nome: lo riuso solo se non ha una partita IVA diversa da quella della fattura
    const trovato = (perNome || []).find(f => (f.nome || "").trim().toLowerCase() === nomePulito &&
      (!pivaPulita || !f.partita_iva || f.partita_iva.replace(/\s+/g, "").toUpperCase().replace(/^IT/, "") === pivaPulita));
    if (trovato) return trovato.id;
  }

  // Come prima: senza nome del fornitore non si crea nessuna scheda nuova
  if (!riga.fornitore) return null;
  const { data: nuovo, error } = await supabase.from("ci_fornitori")
    .insert([{ nome: riga.fornitore, partita_iva: riga.piva || null, gruppo_classificazione: "FRO" }])
    .select().single();
  if (error) throw new Error(`Errore creando fornitore: ${error.message}`);
  if (chiamate.nuovoFornitore) chiamate.nuovoFornitore(nuovo);
  return nuovo.id;
}

// Versione 355: con lo scarico di Aruba la fattura nasce con il suo Identificativo SdI, il nome del file e il tipo di documento
export async function trovaOCreaFattura(fornitoreId, numero, data, documento = null) {
  // un file con più fatture ha un solo Identificativo SdI (indice unico nel database): non si scrive su nessuna (revisione, N5)
  const sdi = documento?.identificativoSdi && (documento.corpi || 1) <= 1 ? String(documento.identificativoSdi) : null;
  const { data: esistente, error: eE } = await supabase
    .from("ci_fatture").select("id, identificativo_sdi").eq("fornitore_id", fornitoreId).eq("numero", numero).eq("data", data).maybeSingle();
  if (eE) throw new Error(`Errore cercando la fattura ${numero}: ${eE.message}`);
  if (esistente) {
    if (sdi && !esistente.identificativo_sdi) {
      const { error: eS } = await supabase.from("ci_fatture").update({ identificativo_sdi: sdi, nome_file_xml: documento.nomeFileSdi || null, tipo_documento: documento.tipoDocumento || null })
        .eq("id", esistente.id).is("identificativo_sdi", null);
      if (eS) throw new Error(`Identificativo SdI della fattura ${numero} non scritto: ${eS.message}`);
    }
    return esistente.id;
  }
  const { data: nuova, error } = await supabase.from("ci_fatture").insert([{
    numero, data, tipo: "PASSIVA", fornitore_id: fornitoreId, totale_netto: 0, totale_iva: 0, totale_lordo: 0,
    ...(sdi ? { identificativo_sdi: sdi, nome_file_xml: documento.nomeFileSdi || null, tipo_documento: documento.tipoDocumento || null } : {}),
  }]).select().single();
  if (error) throw new Error(`Errore creando fattura ${numero}: ${error.message}`);
  return nuova.id;
}

// Versione 350: testata dal documento (XML o PDF) e scadenze create al carico. Senza documento:
// somma delle righe e scadenza «da completare». Una scadenza già nata dall'XML (acquisto di animali
// salvato prima delle altre righe) passa alla fattura, con i suoi pagamenti.
export async function ricalcolaTotaliFattura(fatturaId, documento = null) {
  const { data: giaSue } = await supabase.from("ci_scadenze").select("id").eq("fattura_id", fatturaId).limit(1);
  if ((giaSue || []).length === 0) {
    const { data: f } = await supabase.from("ci_fatture").select("fornitore_id, numero, data").eq("id", fatturaId).single();
    // stesso file XML, oppure stesso fornitore, numero e data (fattura caricata da PDF o Excel)
    let q = supabase.from("ci_scadenze").update({ fattura_id: fatturaId, file_xml: null }).is("fattura_id", null).eq("lato", "fornitore");
    q = documento?.fileXml ? q.eq("file_xml", documento.fileXml)
      : q.not("file_xml", "is", null).eq("fornitore_id", f.fornitore_id).eq("numero_documento", f.numero).eq("data_documento", f.data);
    const { error: eSp } = await q;
    if (eSp) throw new Error(`Scadenza dell'XML non collegata alla fattura: ${eSp.message}`);
  }
  await applicaDocumento(fatturaId, documento);
}

// Testo della domanda sul cespite forse già registrato (lo stesso di prima, con l'elenco)
export function testoPossibileCespiteDoppio(possibiliDuplicati) {
  const elenco = possibiliDuplicati.map(c => `- "${c.descrizione}" del ${c.data_acquisto}, ${formattaEuro(c.costo_acquisto)}`).join("\n");
  return `⚠️ Possibile cespite già registrato (stessa descrizione o stesso importo, anche di un fornitore diverso — i dati storici potrebbero avere il fornitore collegato in modo diverso):\n\n${elenco}\n\nQuesto bene NON ha numero fattura nei dati storici, quindi il confronto è approssimato — controlla tu se è davvero lo stesso.\n\nOK = registra comunque come nuovo cespite separato.\nAnnulla = fermati qui, non salvare nulla (decidi tu come procedere, es. modificando quello esistente).`;
}

// Salva UNA riga già classificata e controllata (validaRiga resta nella pagina).
// chiamate:
//  - nuovoFornitore(fornitore)            → scheda fornitore appena creata (facoltativo)
//  - confermaCespiteDoppio(possibili, testo) → Promise<boolean>; false = non si salva niente
//  - avviso(testo)                         → messaggio che non ferma il salvataggio
// Risposta: { annullata: true } se la persona ha detto «no» al cespite doppio, altrimenti
//           { idsSalvati, regolaCreata, regola } (regola = la riga della regola scritta nel database).
// In caso di errore lancia l'eccezione, come prima: la pagina la mostra.
export async function salvaRigaFatturaPassiva(riga, chiamate = {}) {
  const avviso = chiamate.avviso || (() => {});
  const fornitoreId = await trovaOCreaFornitore(riga, chiamate);

  const idsSalvati = {};

  if (riga.editArea === "ACQUISTO ANIMALI") {
    const { data, error } = await supabase.from("ci_report_acquisto_animali").insert([{
      fonte: "ACQUISTO_DIRETTO", fornitore_id: fornitoreId, data_fattura: riga.data, numero_fattura: riga.numero,
      importo: riga.imponibile, quantita: riga.quantita, unita_misura: riga.unita_misura || null, prezzo_unitario: riga.prezzo_unitario,
      specie: riga.specieAcquisto || null, razza: riga.razzaAcquisto || null,
      destinazione_acquisto: riga.destAcquisto || null, bdn: riga.bdnAcquisto || null, nr_lotto: riga.lottoAcquisto || null,
    }]).select().single();
    if (error) throw new Error(error.message);
    idsSalvati.reportAcquistoId = data.id;
    // Versione 350: anche gli acquisti di animali vanno nello scadenzario (decisione del 04/11/2026)
    const { data: fatturaStessoDoc } = await supabase.from("ci_fatture").select("id").eq("fornitore_id", fornitoreId).eq("numero", riga.numero).eq("data", riga.data).maybeSingle();
    if (fatturaStessoDoc) await ricalcolaTotaliFattura(fatturaStessoDoc.id, riga.documento);
    else if (riga.documento?.fileXml) {
      const esitoScad = await assicuraScadenze({ lato: "fornitore", fileXml: riga.documento.fileXml, fornitoreId, numero: riga.numero, data: riga.data,
        tipoDocumento: riga.documento.tipoDocumento, totale: riga.documento.totale, ritenuta: riga.documento.ritenuta, rate: riga.documento.rate });
      idsSalvati.scadenzeCreate = esitoScad.ids || [];
    } else {
      avviso(`⚠️ Riga salvata nel Report Acquisto Animali, ma la scadenza della fattura ${riga.numero} non è stata creata: per gli acquisti di animali la scadenza nasce dall'XML. Caricare la fattura dall'XML di Aruba.`);
    }
  } else if (riga.editArea === "TRASPORTO ANIMALI") {
    const fatturaId = await trovaOCreaFattura(fornitoreId, riga.numero, riga.data, riga.documento);
    const importoMacello = parseFloat(riga.importoMacello) || 0;
    const { data: art, error: eArt } = await supabase.from("ci_articoli_fattura").insert([{
      fattura_id: fatturaId, descrizione: riga.descrizione, quantita: riga.quantita, unita_misura: riga.unita_misura || null,
      prezzo_unitario: riga.prezzo_unitario, totale_riga: importoMacello,
      aliquota_iva: riga.aliquota_iva, totale_iva: riga.aliquota_iva ? round2(importoMacello * riga.aliquota_iva / 100) : 0,
      area: "TRASPORTO ANIMALI", centro_costo: "Lavorazione prodotti allevamento per Rivendita",
      destinazione: riga.editDestinazione || null, tipo_costo: riga.editTipo || null, stato_classificazione: "MANUALE",
    }]).select().single();
    if (eArt) throw new Error(eArt.message);
    idsSalvati.articoloFatturaId = art.id; idsSalvati.fatturaId = fatturaId;
    const { data: acq, error: eAcq } = await supabase.from("ci_report_acquisto_animali").insert([{
      articolo_fattura_id: art.id, fonte: "TRASPORTO_INGRESSO", fornitore_id: fornitoreId,
      data_fattura: riga.data, numero_fattura: riga.numero, importo: parseFloat(riga.importoIngresso) || 0,
      quantita: riga.quantita, unita_misura: riga.unita_misura || null, prezzo_unitario: riga.prezzo_unitario,
      specie: riga.specieAcquisto || null, destinazione_acquisto: riga.destAcquisto || null,
      bdn: riga.bdnAcquisto || null, nr_lotto: riga.lottoAcquisto || null,
    }]).select().single();
    if (eAcq) throw new Error(eAcq.message);
    idsSalvati.reportAcquistoId = acq.id;
    await ricalcolaTotaliFattura(fatturaId, riga.documento);
  } else {
    if (riga.editArea === "Ammortamenti" && fornitoreId) {
      // Controllo anti-duplicati PRIMA di creare qualunque riga (richiesto da
      // Filippo: i cespiti storici importati non hanno numero fattura, quindi il
      // confronto si fa per descrizione simile E/O importo simile). ESTESO A TUTTI
      // I CESPITI, non solo quelli dello stesso fornitore — i dati storici possono
      // avere un fornitore collegato in modo diverso o assente, quindi limitare il
      // controllo al solo fornitore corrente perdeva i duplicati reali.
      const { data: tuttiCespiti } = await fetchAllPages((da, a) => supabase.from("ci_cespiti")
        .select("id,descrizione,data_acquisto,costo_acquisto,fornitore_id").order("id").range(da, a));
      const descrizioneNorm = riga.descrizione.trim().toLowerCase();
      const possibiliDuplicati = (tuttiCespiti || []).filter(c => {
        const descNormEsistente = (c.descrizione || "").trim().toLowerCase();
        const stessaDescrizione = descNormEsistente === descrizioneNorm ||
          (descNormEsistente.length > 5 && (descNormEsistente.includes(descrizioneNorm) || descrizioneNorm.includes(descNormEsistente)));
        const stessoImporto = Math.abs((c.costo_acquisto || 0) - riga.imponibile) < 0.01;
        return stessaDescrizione || stessoImporto;
      });
      if (possibiliDuplicati.length > 0) {
        const procedi = chiamate.confermaCespiteDoppio
          ? await chiamate.confermaCespiteDoppio(possibiliDuplicati, testoPossibileCespiteDoppio(possibiliDuplicati))
          : false; // senza chi risponde non si registra un possibile doppione
        if (!procedi) return { annullata: true };
      }
    }

    const fatturaId = await trovaOCreaFattura(fornitoreId, riga.numero, riga.data, riga.documento);
    const { data: art, error } = await supabase.from("ci_articoli_fattura").insert([{
      fattura_id: fatturaId, descrizione: riga.descrizione, quantita: riga.quantita, unita_misura: riga.unita_misura || null,
      prezzo_unitario: riga.prezzo_unitario, totale_riga: riga.imponibile,
      aliquota_iva: riga.aliquota_iva, totale_iva: riga.aliquota_iva ? round2(riga.imponibile * riga.aliquota_iva / 100) : 0,
      area: riga.editArea, centro_costo: riga.editCentro || null, destinazione: riga.editDestinazione || null,
      tipo_costo: riga.editTipo, stato_classificazione: riga.stato,
    }]).select().single();
    if (error) throw new Error(error.message);
    idsSalvati.articoloFatturaId = art.id; idsSalvati.fatturaId = fatturaId;

    if (riga.editArea === "Ammortamenti") {
      // Versione 261: dettaglio, cespite e quote fino all'anno in corso con la funzione comune
      const creato = await creaCespiteDaRiga({
        articoloId: art.id, descrizione: riga.descrizione, fornitoreId, fatturaId, data: riga.data,
        importo: riga.imponibile, categoria: riga.categoriaAmmortamento, imputazione: riga.imputazioneAmmortamento,
        anni: anniDaRiga(riga), annoAcquisto: riga.annoAcquistoAmmortamento,
      });
      idsSalvati.cespiteId = creato.cespiteId;
    }
    await ricalcolaTotaliFattura(fatturaId, riga.documento);
  }

  let regolaCreata = null;
  let regola = null;
  if (riga.memorizzaRegola === "fissa" && fornitoreId) {
    const { data: rf, error } = await supabase.from("ci_regole_fornitore_fissa").upsert([{
      fornitore_id: fornitoreId, area: riga.editArea, centro_costo: riga.editCentro || null,
      destinazione: riga.editDestinazione || null, tipo_costo: riga.editTipo,
    }], { onConflict: "fornitore_id" }).select().single();
    if (error) avviso(`⚠️ Riga salvata, ma non sono riuscito a creare la regola fissa:\n\n${error.message}`);
    else { regolaCreata = { tipo: "fissa", id: rf.id }; regola = rf; }
  } else if (riga.memorizzaRegola === "parolaChiave" && fornitoreId) {
    const { data: rv, error } = await supabase.from("ci_regole_fornitore_variabile").insert([{
      fornitore_id: fornitoreId, parola_chiave: riga.parolaChiaveRegola.trim(), area: riga.editArea,
      centro_costo: riga.editCentro || null, destinazione: riga.editDestinazione || null, tipo_costo: riga.editTipo,
    }]).select().single();
    if (error) avviso(`⚠️ Riga salvata, ma non sono riuscito a creare la regola per parola chiave:\n\n${error.message}`);
    else { regolaCreata = { tipo: "parolaChiave", id: rv.id }; regola = rv; }
  }

  return { idsSalvati, regolaCreata, regola, fornitoreId };
}
