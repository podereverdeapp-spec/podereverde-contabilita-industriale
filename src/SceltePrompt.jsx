import { C } from "./style";
import { oggiRoma } from "./dateRoma";

// Versione 335 (ordine del Dott. Bizzarri del 30/10/2026 ore 19:24): nelle pagine dei prompt, sopra «Copia prompt»,
// si scelgono anno, cartella, nome di chi lavora e gli altri dati del lavoro. Il programma li scrive da solo nel testo,
// nei punti previsti, e in cima al prompt mette la riga «DATI DI QUESTO LAVORO». Il resto del testo non cambia.

export const annoDiOggi = () => +oggiRoma().slice(0, 4);
// anni che si possono scegliere: dal 2019 (primo anno di Podere Verde nel programma) al prossimo
export const anniScelta = () => Array.from({ length: annoDiOggi() - 2019 + 2 }, (_, i) => 2019 + i).reverse();
// cartella delle fatture passive dell'anno sul computer del Dott. Bizzarri
export const cartellaFatture = anno => `C:\\Users\\Filippo\\Desktop\\00.FATTURE PODERE RICLASSIFICATE ANNI19-24\\FATTURE ${anno}`;

// campi: [{ chiave, etichetta, tipo: "anno" | "testo", obbligatorio, aiuto, opzioni: [{ valore, testo }] }]
export function ScelteDelPrompt({ campi, valori, imposta }) {
  return (
    <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, background: "#FFF8E6" }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#7A4A00", marginBottom: 8 }}>
        Prima di copiare: scegliere i dati di questo lavoro. Il programma li scrive nel prompt.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {campi.map(c => {
          const vuoto = c.obbligatorio && !String(valori[c.chiave] ?? "").trim();
          const stile = { padding: "7px 9px", border: `1px solid ${vuoto ? C.red : C.border}`, borderRadius: 8, fontSize: 13, background: "#fff" };
          return (
            <label key={c.chiave} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: C.text, flex: c.largo ? "1 1 100%" : "0 0 auto" }}>
              <span style={{ fontWeight: 600 }}>{c.etichetta}{c.obbligatorio ? " *" : ""}</span>
              {c.opzioni ? (
                <select value={valori[c.chiave] ?? ""} onChange={e => imposta(c.chiave, e.target.value)} style={stile}>
                  {c.opzioni.map(o => <option key={o.valore} value={o.valore}>{o.testo}</option>)}
                </select>
              ) : (
                <input value={valori[c.chiave] ?? ""} onChange={e => imposta(c.chiave, e.target.value)} placeholder={c.esempio || ""}
                  style={{ ...stile, width: c.largo ? "100%" : 260, boxSizing: "border-box" }} />
              )}
              {c.aiuto && <span style={{ color: C.muted, fontSize: 11 }}>{c.aiuto}</span>}
            </label>
          );
        })}
      </div>
      {campi.some(c => c.obbligatorio && !String(valori[c.chiave] ?? "").trim()) && (
        <div style={{ marginTop: 8, fontSize: 12, color: C.red, fontWeight: 600 }}>I dati con * sono obbligatori: finché mancano, il prompt non si copia.</div>
      )}
    </div>
  );
}

// true se manca un dato obbligatorio
export const mancaQualcosa = (campi, valori) => campi.some(c => c.obbligatorio && !String(valori[c.chiave] ?? "").trim());

// riga in cima al prompt con i dati scelti
export function intestazione(righe) {
  const r = righe.filter(([, v]) => String(v ?? "").trim());
  if (!r.length) return "";
  return `DATI DI QUESTO LAVORO (scelti nel programma prima di copiare il prompt; valgono per tutto il testo):\n${r.map(([k, v]) => `- ${k}: ${String(v).trim()}`).join("\n")}\n\n`;
}

// sostituisce nel testo ogni segnaposto con il suo valore; un segnaposto che non c'è è un errore di programma
export function riempi(testo, sostituzioni) {
  let t = testo;
  for (const [da, a] of sostituzioni) {
    if (!t.includes(da)) throw new Error(`Segnaposto non trovato nel prompt: ${da}`);
    t = t.split(da).join(a);
  }
  return t;
}
