// Versione 404 (25/11/2026): le istruzioni del Controllo Prezzi di Acquisto con le immagini della pagina vera,
// dallo stesso testo del Word (istruzioniPrezziAcquisto.js). Sostituiscono il testo della versione 249.
import DocumentoIstruzioni from "./DocumentoIstruzioni";
import { ISTRUZIONI_PREZZI_ACQUISTO } from "./testoIstruzioniPrezziAcquisto";

export default function IstruzioniPrezziAcquisto() {
  return <DocumentoIstruzioni doc={ISTRUZIONI_PREZZI_ACQUISTO} />;
}
