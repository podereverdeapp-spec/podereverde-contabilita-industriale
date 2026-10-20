// Versione 248 (20/10/2026) — Glossario del programma.
// Decisione del Dott. Bizzarri: il Glossario cresce sezione per sezione; contiene solo i termini a cui
// rimandano le istruzioni già approvate (per ora: Report di Analisi → UBA e carcassa).
import { C } from "./style";

const VOCI = [
  {
    termine: "Carcassa",
    testo: "L'animale macellato, senza pelle, testa, zampe e visceri: è la parte che si vende come carne. Il suo peso è la base del costo e del prezzo al chilo.",
    dove: "Report di Analisi",
  },
  {
    termine: "UBA (Unità di Bestiame Adulto)",
    testo: "Unità di misura che rende confrontabili animali di specie ed età diverse. Un bovino adulto vale 1; gli altri animali valgono una frazione, come nella tabella. I costi comuni dell'azienda si dividono tra gli animali in proporzione alle UBA e ai giorni di presenza in azienda.",
    tabella: [
      ["Bovino", "fino a 7 mesi", "0,40"], ["", "da 7 mesi a 2 anni", "0,70"], ["", "oltre 2 anni", "1,00"],
      ["Suino", "fino a 3 mesi", "0,027"], ["", "da 3 mesi a 1 anno", "0,30"], ["", "oltre 1 anno", "0,50"],
      ["Ovino", "fino a 4 mesi", "0,027"], ["", "da 4 mesi a 1 anno", "0,10"], ["", "oltre 1 anno", "0,15"],
    ],
    notaTabella: "Valori usati dal programma e dall'app Podere Verde.",
    dove: "Report di Analisi; Animali → Report UBA",
  },
];

export default function Glossario() {
  const cella = { padding: "5px 10px", borderBottom: `1px solid ${C.border}`, fontSize: 13 };
  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>📚 Glossario</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        I termini usati nelle istruzioni del programma, spiegati in parole semplici. Per ogni termine è indicato dove si incontra.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {VOCI.map(v => (
          <div key={v.termine} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.primary, marginBottom: 6 }}>{v.termine}</div>
            <p style={{ fontSize: 13, color: C.text, margin: "0 0 8px", lineHeight: 1.6 }}>{v.testo}</p>
            {v.tabella && (
              <>
                <table style={{ borderCollapse: "collapse", marginBottom: 4 }}>
                  <thead><tr>{["Specie", "Età", "Vale (UBA)"].map(t => <th key={t} style={{ ...cella, textAlign: "left", background: "#E3EDE0" }}>{t}</th>)}</tr></thead>
                  <tbody>{v.tabella.map((r, i) => <tr key={i}>{r.map((x, j) => <td key={j} style={{ ...cella, textAlign: j === 2 ? "right" : "left", fontWeight: j === 0 ? 700 : 400 }}>{x}</td>)}</tr>)}</tbody>
                </table>
                <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", marginBottom: 8 }}>{v.notaTabella}</div>
              </>
            )}
            <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>Dove si incontra: {v.dove}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
