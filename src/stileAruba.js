import { C } from "./style";
// Stili comuni delle pagine «Controllo Fatturazione Attiva e Numero Progressivo» (versione 300)
export const input = { height: 34, padding: "0 9px", borderRadius: 7, border: `1.5px solid ${C.border}`, fontSize: 13, background: "#fff", color: C.text, boxSizing: "border-box" };
export const btn = (pieno, colore = C.primary) => ({ height: 34, padding: "0 14px", borderRadius: 8, border: `1.5px solid ${colore}`, background: pieno ? colore : "#fff", color: pieno ? "#fff" : colore, fontSize: 12.5, fontWeight: 700, cursor: "pointer" });
export const scheda = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14 };
export const titolo = { fontWeight: 800, color: C.primary, marginBottom: 8, fontSize: 15 };
export const th = { padding: "7px 8px", fontSize: 11.5, fontWeight: 700, textAlign: "left", whiteSpace: "nowrap" };
export const td = { padding: "6px 8px", verticalAlign: "top", fontSize: 12.5 };
export const testata = { background: C.primary, color: "#fff" };
export const chip = (colore, pieno = true) => ({ display: "inline-block", padding: "4px 10px", borderRadius: 14, fontSize: 12.5, fontWeight: 800, background: pieno ? colore : "#fff", color: pieno ? "#fff" : colore, border: `1.5px solid ${colore}`, marginRight: 6, marginBottom: 6 });
export const dataIt = d => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}` : "");
