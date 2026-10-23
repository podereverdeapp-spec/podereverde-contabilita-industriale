import { ElencoFattureAPagine } from "./FatturePassive";
import { C } from "./style";

// Versione 280 (decisione del Dott. Bizzarri del 23/10/2026): stessa consultazione «a pagine» delle
// Fatture Passive. Il database cerca, conta e somma TUTTE le fatture emesse che corrispondono ai filtri;
// la pagina ne mostra 50, 100 o 200 per volta e l'export Excel le legge tutte, 1.000 alla volta.
export default function FattureAttive() {
  return <ElencoFattureAPagine tipo="ATTIVA" titolo="Fatture Attive" etichettaControparte="Cliente" nomeFile="FattureAttive" coloreTotale={C.green} />;
}
