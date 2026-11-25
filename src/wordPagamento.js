// Versione 401 (Soldato, 24/11/2026) — Word del pagamento (decisione del Dott. Bizzarri del 23/11/2026 ore 18:32):
// «una volta predisposto e salvato il pagamento si scarica una versione in Word, dove copiare i dati IBAN fornitore e causale
// fattura, che vanno poi incollati nel modulo della banca». File .docx vero (Word, LibreOffice, Google Documenti), fatto con jszip.
import JSZip from "jszip";

const xml = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const par = (testo, { grassetto = false, misura = 22 } = {}) =>
  `<w:p><w:r><w:rPr>${grassetto ? "<w:b/>" : ""}<w:sz w:val="${misura}"/></w:rPr><w:t xml:space="preserve">${xml(testo)}</w:t></w:r></w:p>`;
const cella = (testo, larghezza, grassetto, mono) => `<w:tc><w:tcPr><w:tcW w:w="${larghezza}" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr>${grassetto ? "<w:b/>" : ""}${mono ? '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>' : ""}<w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${xml(testo)}</w:t></w:r></w:p></w:tc>`;

// dati = { codice, beneficiario, iban, importo, causale, data, conto, modalita, fatture: [testo], note_credito: [testo] }
export async function scaricaWordPagamento(dati) {
  const righe = [
    ["Beneficiario", dati.beneficiario], ["IBAN", dati.iban], ["Importo", dati.importo], ["Causale", dati.causale],
    ["Data di esecuzione", dati.data], ["Conto da cui si paga", dati.conto], ["Come si paga", dati.modalita],
  ].filter(r => r[1]);
  const tabella = `<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(b => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join("")}</w:tblBorders></w:tblPr>
    <w:tblGrid><w:gridCol w:w="2600"/><w:gridCol w:w="6700"/></w:tblGrid>
    ${righe.map(([e, v]) => `<w:tr>${cella(e, 2600, true, false)}${cella(v, 6700, false, e === "IBAN" || e === "Causale")}</w:tr>`).join("")}</w:tbl>`;
  const corpo = [
    par(`Pagamento ${dati.codice || ""} – Società Agricola Podere Verde a r.l.`, { grassetto: true, misura: 28 }),
    par("Copiare questi dati nel modulo del bonifico della banca (home banking). Non cambiare la causale: serve a riconoscere il pagamento nell'estratto conto."),
    tabella,
    dati.fatture?.length ? par("Fatture pagate: " + dati.fatture.join("; ")) : "",
    dati.note_credito?.length ? par("Note di credito dedotte: " + dati.note_credito.join("; ")) : "",
    par("Fatto il bonifico, scaricare la distinta della banca, salvarla senza cambiarle nome in BANCHE\\ESTRATTI CONTO E DISTINTE DA SMISTARE e caricarla nel programma con «Carica la distinta» (Gestione incassi e pagamenti)."),
  ].join("");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`);
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const nome = `Pagamento ${dati.codice || ""} ${dati.beneficiario || ""}`.replace(/[^A-Za-z0-9 ._-]+/g, " ").replace(/\s+/g, " ").trim() + ".docx";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return nome;
}
