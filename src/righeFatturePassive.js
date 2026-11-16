// Versione 384 – Come nasce e come si controlla una riga di fattura passiva prima del salvataggio.
// Comune a «Carica Fatture» (CaricaFatture.jsx) e a «Leggi le fatture passive di Aruba» (LetturaPassiveAruba.jsx).
// Il codice è SPOSTATO da CaricaFatture.jsx (versione 382: elaboraRigheGrezze righe 279–315, validaRiga righe 419–437)
// senza cambiarlo: la classificazione resta quella di sempre (motoreClassificazione.classificaRiga).
import { classificaRiga } from "./motoreClassificazione";
import { anniDaRiga } from "./cespitiDaFatture";
import { chiaveDocumento } from "./documentoFattura";
import { numeroRobusto, calcolaImponibile, leggiAliquotaIva, formattaData, formattaEuro } from "./parsingUtils";

// Una riga letta (Excel, PDF, XML: stessi nomi di colonna) → riga classificata, pronta per la pagina.
// contesto = { fornitori, regoleFisse, regoleVariabili }; documentiPerChiave = Map(chiaveDocumento → documento) oppure null
export function rigaDaGrezza(r, i, contesto, documentiPerChiave = null, prefissoId = `riga-${Date.now()}`) {
  const { fornitori, regoleFisse, regoleVariabili } = contesto;
  const grezza = {
    id: `${prefissoId}-${i}`,
    fornitore: String(r["Fornitore"] || r["fornitore"] || "").trim(),
    piva: String(r["P.IVA"] || r["Partita IVA"] || r["piva"] || "").trim(),
    numero: String(r["Numero"] || r["Numero Fattura"] || "").trim(),
    data: formattaData(r["Data"] || r["Data Fattura"]),
    descrizione: String(r["Descrizione"] || "").trim(),
    quantita: numeroRobusto(r["Quantità"] || r["Quantita"] || 1),
    unita_misura: String(r["U.M."] || r["Unità Misura"] || "").trim(),
    prezzo_unitario: numeroRobusto(r["Prezzo unitario"] || r["Prezzo Unitario"] || 0),
    aliquota_iva: leggiAliquotaIva(r),
    imponibile: calcolaImponibile(r),
  };
  const { fornitore: fornitoreObj, ...classificazioneResto } = classificaRiga(grezza, { fornitori, regoleFisse, regoleVariabili });
  return {
    ...grezza,
    ...classificazioneResto,
    fornitore_obj: fornitoreObj,
    editArea: classificazioneResto.area || "",
    editCentro: classificazioneResto.centro_costo || "",
    editDestinazione: classificazioneResto.destinazione || "",
    editTipo: classificazioneResto.tipo_costo || "",
    specieAcquisto: "", razzaAcquisto: "", destAcquisto: "", bdnAcquisto: "", lottoAcquisto: "",
    importoMacello: "", importoIngresso: "",
    categoriaAmmortamento: "", imputazioneAmmortamento: "",
    annoAcquistoAmmortamento: new Date(grezza.data || Date.now()).getFullYear() || "",
    anniAmmortamento: "",
    memorizzaRegola: "nessuna", parolaChiaveRegola: "",
    giaCaricata: false,
    // Versione 350: totali e pagamento del documento (XML o PDF), se noti
    documento: documentiPerChiave ? (documentiPerChiave.get(chiaveDocumento(grezza.piva || grezza.fornitore, grezza.numero, grezza.data)) || null) : null,
    nonQuadra: false, dettaglioQuadratura: null,
    scartata: false, giaScartataInPrecedenza: false,
    salvata: false, salvataggioInCorso: false, idsSalvati: null, regolaCreata: null,
  };
}

// Le righe di un documento letto (XML di Aruba) con gli stessi nomi di colonna del carico da Excel.
// Un documento senza righe dà una riga sola con l'imponibile, come prima.
export function righeGrezzeDelDocumento(d) {
  return (d.righe.length ? d.righe : [{ descrizione: "(documento senza righe)", quantita: 1, prezzo_unitario: d.imponibile, imponibile: d.imponibile, aliquota_iva: 0 }]).map(r => ({
    "Fornitore": d.fornitore, "P.IVA": d.piva, "Numero": d.numero, "Data": d.data, "Descrizione": r.descrizione,
    "Quantità": r.quantita, "U.M.": r.unita_misura, "Prezzo unitario": r.prezzo_unitario, "Imponibile": r.imponibile, "Aliquota IVA": r.aliquota_iva,
  }));
}

// Che cosa manca a una riga prima di salvarla (null = a posto)
export function validaRiga(r) {
  if (r.editArea === "TRASPORTO ANIMALI") {
    const somma = (parseFloat(r.importoMacello) || 0) + (parseFloat(r.importoIngresso) || 0);
    if (Math.abs(somma - r.imponibile) > 0.01) {
      return `La somma di "Trasporto macello" + "Ingresso allevamento" (${formattaEuro(somma)}) non torna con l'imponibile della riga (${formattaEuro(r.imponibile)}).`;
    }
    if ((parseFloat(r.importoMacello) || 0) !== 0 && !r.editTipo) return "Indicare il Tipo di Costo della parte verso il macello (Fisso o Variabile).";
  }
  if (r.editArea === "Ammortamenti") {
    if (!r.categoriaAmmortamento || !r.imputazioneAmmortamento || !anniDaRiga(r)) {
      return `Per un Ammortamento servono Categoria, Imputazione e Anni di ammortamento (numero intero da 1 a 100).`;
    }
  }
  if (!r.editArea) return `Manca l'Area.`;
  if (r.memorizzaRegola === "parolaChiave" && !r.parolaChiaveRegola.trim()) {
    return `Hai scelto di memorizzare una regola per parola chiave, ma non hai scritto la parola chiave.`;
  }
  return null;
}
