import JSZip from "jszip";

// File XML della fattura elettronica (FatturaPA 1.2, FPR12) da caricare in Aruba Fatturazione
// Elettronica con «Carica fattura». La struttura riprende la fattura FPR 8/26 emessa con Aruba.

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const n2 = v => Number(v).toFixed(2);
const tag = (nome, valore) => (valore === null || valore === undefined || valore === "") ? "" : `<${nome}>${esc(valore)}</${nome}>\n`;
const soloCifre = s => String(s || "").replace(/^IT/i, "").replace(/\s/g, "");

// Nome del file secondo le regole SdI: IT + partita IVA del cedente + "_" + progressivo (5 caratteri)
export function nomeFileXml(cedente, idFattura) {
  const prog = Number(idFattura).toString(36).toUpperCase().padStart(5, "0").slice(-5);
  return `IT${soloCifre(cedente.partitaIva)}_${prog}.xml`;
}

export function generaXmlFattura({ cedente, cliente, numero, data, calcolo, aliquota, progressivoInvio }) {
  const pivaCliente = soloCifre(cliente.partita_iva);
  const paeseCliente = (cliente.nazione || "IT").toUpperCase();
  const codiceDestinatario = (cliente.codice_destinatario || "").trim().toUpperCase() || "0000000";
  const pec = codiceDestinatario === "0000000" ? (cliente.pec || "").trim() : "";

  let x = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  x += `<FatturaElettronica xmlns="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" versione="FPR12">\n`;
  x += `<FatturaElettronicaHeader xmlns="">\n<DatiTrasmissione>\n<IdTrasmittente>\n`;
  x += tag("IdPaese", cedente.idTrasmittentePaese) + tag("IdCodice", cedente.idTrasmittenteCodice);
  x += `</IdTrasmittente>\n` + tag("ProgressivoInvio", progressivoInvio) + tag("FormatoTrasmissione", "FPR12");
  x += tag("CodiceDestinatario", codiceDestinatario) + tag("PECDestinatario", pec);
  x += `</DatiTrasmissione>\n`;

  // Cedente: Podere Verde
  x += `<CedentePrestatore>\n<DatiAnagrafici>\n<IdFiscaleIVA>\n` + tag("IdPaese", "IT") + tag("IdCodice", soloCifre(cedente.partitaIva)) + `</IdFiscaleIVA>\n`;
  x += tag("CodiceFiscale", cedente.codiceFiscale) + `<Anagrafica>\n` + tag("Denominazione", cedente.denominazione) + `</Anagrafica>\n`;
  x += tag("RegimeFiscale", cedente.regimeFiscale) + `</DatiAnagrafici>\n<Sede>\n`;
  x += tag("Indirizzo", cedente.indirizzo) + tag("NumeroCivico", cedente.numeroCivico) + tag("CAP", cedente.cap) + tag("Comune", cedente.comune) + tag("Provincia", cedente.provincia) + tag("Nazione", cedente.nazione || "IT");
  x += `</Sede>\n`;
  if (cedente.reaNumero) {
    x += `<IscrizioneREA>\n` + tag("Ufficio", cedente.reaUfficio) + tag("NumeroREA", cedente.reaNumero) + tag("CapitaleSociale", cedente.capitaleSociale) + tag("SocioUnico", cedente.socioUnico) + tag("StatoLiquidazione", cedente.statoLiquidazione || "LN") + `</IscrizioneREA>\n`;
  }
  if (cedente.email) x += `<Contatti>\n` + tag("Email", cedente.email) + `</Contatti>\n`;
  x += `</CedentePrestatore>\n`;

  // Cessionario: il cliente
  x += `<CessionarioCommittente>\n<DatiAnagrafici>\n`;
  if (pivaCliente) x += `<IdFiscaleIVA>\n` + tag("IdPaese", paeseCliente) + tag("IdCodice", pivaCliente) + `</IdFiscaleIVA>\n`;
  x += tag("CodiceFiscale", cliente.codice_fiscale || (paeseCliente === "IT" ? pivaCliente : "")) + `<Anagrafica>\n` + tag("Denominazione", cliente.nome) + `</Anagrafica>\n</DatiAnagrafici>\n`;
  x += `<Sede>\n` + tag("Indirizzo", cliente.indirizzo) + tag("CAP", cliente.cap) + tag("Comune", cliente.citta) + tag("Provincia", paeseCliente === "IT" ? cliente.provincia : "") + tag("Nazione", paeseCliente) + `</Sede>\n`;
  x += `</CessionarioCommittente>\n</FatturaElettronicaHeader>\n`;

  // Corpo
  x += `<FatturaElettronicaBody xmlns="">\n<DatiGenerali>\n<DatiGeneraliDocumento>\n`;
  x += tag("TipoDocumento", "TD01") + tag("Divisa", "EUR") + tag("Data", data) + tag("Numero", numero);
  // Bollo virtuale (2 €) sulle fatture con importi senza IVA oltre 77,47 €
  if (calcolo.bollo) x += `<DatiBollo>\n` + tag("BolloVirtuale", "SI") + tag("ImportoBollo", n2(calcolo.bollo)) + `</DatiBollo>\n`;
  x += tag("ImportoTotaleDocumento", n2(calcolo.totale));
  x += `</DatiGeneraliDocumento>\n</DatiGenerali>\n<DatiBeniServizi>\n`;

  // Righe: aliquota, natura e unità di misura per riga (fatture libere); se mancano valgono
  // quelle della fattura (fatture animali: tutte al kg con un'unica aliquota).
  calcolo.righe.forEach(r => {
    const aliq = r.aliquota ?? aliquota;
    const um = r.unitaMisura === undefined ? "KG" : r.unitaMisura;
    // Senza unità di misura la quantità si omette (riga «a corpo» con quantità 1)
    const conQuantita = !!um || Number(r.quantita) !== 1;
    x += `<DettaglioLinee>\n` + tag("NumeroLinea", r.numeroLinea) + tag("Descrizione", r.descrizione.slice(0, 1000));
    if (conQuantita) x += tag("Quantita", n2(r.quantita)) + tag("UnitaMisura", um);
    x += tag("PrezzoUnitario", n2(r.prezzo)) + tag("PrezzoTotale", n2(r.importo)) + tag("AliquotaIVA", n2(aliq));
    if (Number(aliq) === 0) x += tag("Natura", r.natura);
    x += `</DettaglioLinee>\n`;
  });
  const riepilogo = calcolo.riepilogo || [{ aliquota, imponibile: calcolo.imponibile, imposta: calcolo.imposta }];
  riepilogo.forEach(g => {
    x += `<DatiRiepilogo>\n` + tag("AliquotaIVA", n2(g.aliquota));
    if (Number(g.aliquota) === 0) x += tag("Natura", g.natura);
    x += tag("ImponibileImporto", n2(g.imponibile)) + tag("Imposta", n2(g.imposta));
    if (Number(g.aliquota) === 0) x += tag("RiferimentoNormativo", g.riferimentoNormativo);
    x += `</DatiRiepilogo>\n`;
  });
  x += `</DatiBeniServizi>\n`;

  if (cedente.iban) {
    x += `<DatiPagamento>\n` + tag("CondizioniPagamento", cedente.condizioniPagamento || "TP02") + `<DettaglioPagamento>\n`;
    x += tag("ModalitaPagamento", cedente.modalitaPagamento || "MP05") + tag("DataScadenzaPagamento", data) + tag("ImportoPagamento", n2(calcolo.totale));
    x += tag("IstitutoFinanziario", cedente.istitutoFinanziario) + tag("IBAN", cedente.iban.replace(/\s/g, "")) + `</DettaglioPagamento>\n</DatiPagamento>\n`;
  }
  x += `</FatturaElettronicaBody>\n</FatturaElettronica>\n`;
  return x;
}

export function scaricaFile(nome, contenuto, tipo = "application/xml") {
  const blob = contenuto instanceof Blob ? contenuto : new Blob([contenuto], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Più fatture insieme: un solo .zip, caricabile in Aruba in un colpo solo
export async function scaricaZip(nomeZip, fatture) {
  const zip = new JSZip();
  fatture.forEach(f => zip.file(f.nome_file_xml, f.xml));
  scaricaFile(nomeZip, await zip.generateAsync({ type: "blob" }), "application/zip");
}
