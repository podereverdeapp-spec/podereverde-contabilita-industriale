import JSZip from "jszip";

// Versione 355 (10/11/2026): cliente, cassa previdenziale come riga, nota di credito TD08, lettura dai byte.
// Versione 350 (punto 28): lettura delle fatture elettroniche RICEVUTE (XML dello SdI, anche .p7m e .zip di Aruba).
// Restituisce, per ogni documento, i totali del riepilogo IVA, i dati di pagamento (scadenze) e le righe.
// È la fonte dei totali della testata e delle scadenze: le righe servono solo alla classificazione dei costi.

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
  const fine = s.indexOf(m[0], i) + m[0].length;
  return decodifica(bytes.slice(i, fine));
}
const figli = (el, nome) => el ? Array.from(el.children).filter(c => c.localName === nome) : [];
const primo = (el, percorso) => {
  let cur = [el];
  for (const p of percorso.split("/")) cur = cur.flatMap(c => figli(c, p));
  return cur[0] || null;
};
const tutti = (el, percorso) => {
  let cur = [el];
  for (const p of percorso.split("/")) cur = cur.flatMap(c => figli(c, p));
  return cur;
};
const testo = (el, percorso) => { const n = primo(el, percorso); return n ? n.textContent.trim() : null; };
const numero = (v) => { const n = Number(String(v ?? "").trim()); return Number.isFinite(n) ? n : 0; };
const c2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// TipoCassa dalle specifiche tecniche della fattura elettronica (Agenzia delle Entrate, paragrafo 2.2.9.1). I nomi sono quelli già
// usati nelle righe e nelle regole del programma («[CASSA PROFESSIONALE] INARCASSA», «… ENPAIA», «… ENPAV», «… CASSAFORENSE»)
const CASSE = { TC01: "CASSAFORENSE", TC02: "CASSA DOTTORI COMMERCIALISTI", TC03: "CASSA GEOMETRI", TC04: "INARCASSA", TC05: "CASSA NOTARIATO",
  TC06: "CASSA RAGIONIERI", TC07: "ENASARCO", TC08: "ENPACL", TC09: "ENPAM", TC10: "ENPAF", TC11: "ENPAV", TC12: "ENPAIA",
  TC13: "FONDO SPEDIZIONIERI", TC14: "INPGI", TC15: "ONAOSI", TC16: "CASAGIT", TC17: "EPPI", TC18: "EPAP", TC19: "ENPAB", TC20: "ENPAPI", TC21: "ENPAP", TC22: "INPS" };

export function leggiXmlFattura(nomeFile, xmlTesto) {
  const doc = new DOMParser().parseFromString(xmlTesto, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error(`${nomeFile}: XML non leggibile`);
  const radice = doc.documentElement;
  const hdr = primo(radice, "FatturaElettronicaHeader");
  const ced = primo(hdr, "CedentePrestatore/DatiAnagrafici");
  const piva = `${testo(ced, "IdFiscaleIVA/IdPaese") || ""}${testo(ced, "IdFiscaleIVA/IdCodice") || ""}`;
  const fornitore = testo(ced, "Anagrafica/Denominazione") || `${testo(ced, "Anagrafica/Nome") || ""} ${testo(ced, "Anagrafica/Cognome") || ""}`.trim();
  // Versione 355: il cliente (cessionario), per controllare che la fattura sia di Podere Verde
  const ces = primo(hdr, "CessionarioCommittente/DatiAnagrafici");
  const pivaCliente = `${testo(ces, "IdFiscaleIVA/IdCodice") || ""}`.trim();
  const cfCliente = `${testo(ces, "CodiceFiscale") || ""}`.trim();
  const corpi = tutti(radice, "FatturaElettronicaBody");
  return corpi.map((body, indice) => {
    const g = primo(body, "DatiGenerali/DatiGeneraliDocumento");
    const riepilogo = tutti(body, "DatiBeniServizi/DatiRiepilogo");
    const imponibile = c2(riepilogo.reduce((s, r) => s + numero(testo(r, "ImponibileImporto")), 0));
    const iva = c2(riepilogo.reduce((s, r) => s + numero(testo(r, "Imposta")), 0));
    const totaleScritto = testo(g, "ImportoTotaleDocumento");
    const tipoDocumento = testo(g, "TipoDocumento") || "TD01";
    // Nel programma le note di credito hanno importi negativi. Nell'XML di solito sono positivi
    // (si cambia segno), a volte già negativi (si lasciano così).
    // versione 355: anche TD08 (nota di credito semplificata)
    const notaDiCredito = tipoDocumento === "TD04" || tipoDocumento === "TD08";
    const segno = notaDiCredito && (imponibile + iva) > 0 ? -1 : 1;
    const rate = tutti(body, "DatiPagamento").flatMap(dp => tutti(dp, "DettaglioPagamento").map(dd => ({
      importo: numero(testo(dd, "ImportoPagamento")), scadenza: testo(dd, "DataScadenzaPagamento"),
      giorni: testo(dd, "GiorniTerminiPagamento"), modalita: testo(dd, "ModalitaPagamento"), iban: testo(dd, "IBAN"),
    })));
    const ritenuta = c2(tutti(g, "DatiRitenuta").reduce((s, r) => s + numero(testo(r, "ImportoRitenuta")), 0));
    const righe = tutti(body, "DatiBeniServizi/DettaglioLinee").map(l => ({
      descrizione: testo(l, "Descrizione") || "",
      quantita: testo(l, "Quantita") !== null ? numero(testo(l, "Quantita")) : 1,
      unita_misura: "", // come nella versione 350: l'unità di misura si sceglie nella classificazione (versione 355: niente cambi non richiesti)
      prezzo_unitario: numero(testo(l, "PrezzoUnitario")),
      imponibile: c2(segno * numero(testo(l, "PrezzoTotale"))),
      aliquota_iva: numero(testo(l, "AliquotaIVA")),
    }));
    // Versione 355: la cassa previdenziale (DatiCassaPrevidenziale) è nel riepilogo IVA ma non nelle righe:
    // diventa una riga «[CASSA PROFESSIONALE] …», come nel prompt del carico da Aruba, così righe = imponibile
    tutti(g, "DatiCassaPrevidenziale").forEach(cp => {
      const imp = numero(testo(cp, "ImportoContributoCassa"));
      if (!imp) return;
      righe.push({ descrizione: `[CASSA PROFESSIONALE] ${CASSE[testo(cp, "TipoCassa")] || testo(cp, "TipoCassa") || ""}`.trim(), quantita: 1, unita_misura: "",
        prezzo_unitario: c2(segno * imp), imponibile: c2(segno * imp), aliquota_iva: numero(testo(cp, "AliquotaIVA")) });
    });
    return {
      pivaCliente, cfCliente, posizione: indice + 1, corpi: corpi.length,
      fileXml: nomeFile.split("/").pop().replace(/\.p7m$/i, "") + (corpi.length > 1 ? `#${indice + 1}` : ""),
      piva, fornitore, numero: testo(g, "Numero") || "", data: testo(g, "Data") || "", tipoDocumento,
      imponibile: c2(segno * imponibile), iva: c2(segno * iva),
      totale: c2(totaleScritto !== null ? (notaDiCredito ? -Math.abs(numero(totaleScritto)) : numero(totaleScritto)) : segno * (imponibile + iva)),
      totaleScrittoNelDocumento: totaleScritto !== null,
      ritenuta, rate, righe,
    };
  });
}

// Versione 355: lettura di un solo file (.xml o .p7m) dai suoi byte, per la pagina «Documenti arrivati»
export function leggiDocumentiDaByte(nome, bytes) {
  const basso = String(nome).toLowerCase();
  if (!basso.endsWith(".xml") && !basso.endsWith(".p7m")) return { documenti: [], scartato: `${nome}: non è un XML né un .p7m` };
  const testoXml = basso.endsWith(".p7m") ? xmlDaP7m(bytes) : decodifica(bytes);
  if (!testoXml || !/FatturaElettronica/.test(testoXml)) return { documenti: [], scartato: `${nome}: non è una fattura elettronica` };
  try { return { documenti: leggiXmlFattura(nome, testoXml), scartato: null }; }
  catch (e) { return { documenti: [], scartato: e.message }; }
}

// files: File scelti dall'utente (.xml, .p7m, .zip). Restituisce { documenti, scartati }
export async function leggiFattureRicevute(files) {
  const documenti = []; const scartati = [];
  const aggiungi = async (nome, bytes) => {
    const basso = nome.toLowerCase();
    if (basso.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(bytes);
      for (const f of Object.values(zip.files)) if (!f.dir) await aggiungi(f.name, await f.async("uint8array"));
      return;
    }
    if (!basso.endsWith(".xml") && !basso.endsWith(".p7m")) { scartati.push(`${nome}: non è un XML né un .p7m`); return; }
    const testoXml = basso.endsWith(".p7m") ? xmlDaP7m(bytes) : decodifica(bytes);
    if (!testoXml || !/FatturaElettronica/.test(testoXml)) { scartati.push(`${nome}: non è una fattura elettronica`); return; }
    try { documenti.push(...leggiXmlFattura(nome, testoXml)); }
    catch (e) { scartati.push(e.message); }
  };
  for (const f of files) await aggiungi(f.name, new Uint8Array(await f.arrayBuffer()));
  return { documenti, scartati };
}
