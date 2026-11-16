// Versione 384 (decisione del Dott. Bizzarri del 14/11/2026, 21:2x–23:28): riquadro comune «Dove sono i file e come ci si arriva»,
// uguale in tutte le pagine di caricamento veloce. Oggi: «Leggi le Fatture di Aruba» (vendite) e «Leggi le fatture passive di Aruba».
// Ogni pagina gli passa solo la sua cartella finale e che cosa ci si mette. Il testo va approvato dal Dott. Bizzarri.
import { useState } from "react";
import { C } from "./style";

export const CLOUD_SERVER = "\\\\192.168.120.2";
export const CLOUD_NOME = "Company";
export const PERCORSO_DATI = ["SOCIETA", "SOCIETA' AGRICOLA PODERE VERDE A R.L", "00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE"];

// cartellaFinale: le cartelle dopo «00.DATI PROGRAMMA CONTABILITA' INDUSTRIALE», es. ["FATTURE PASSIVE", "FATTURE PASSIVE DA SMISTARE"]
// cosaMetterci: una riga, es. "i tre file .zip scaricati da Aruba (XML, PDF, Report Excel)"
export default function RiquadroDoveSonoIFile({ cartellaFinale = [], cosaMetterci = "" }) {
  const [aperto, setAperto] = useState(false);
  const tutte = [...PERCORSO_DATI, ...cartellaFinale];
  const percorsoZ = `Z:\\${tutte.join("\\")}`;
  const percorsoRete = `${CLOUD_SERVER}\\${CLOUD_NOME}\\${tutte.join("\\")}`;
  const passo = { margin: "4px 0" };
  const codice = { fontFamily: "monospace", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 5px", wordBreak: "break-all" };
  return (
    <div style={{ background: "#F3F7EC", border: `1.5px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div><b>📁 Dove sono i file e come ci si arriva</b>{cosaMetterci && <> — qui si mettono {cosaMetterci}</>}</div>
        <button onClick={() => setAperto(a => !a)} style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: C.primary, whiteSpace: "nowrap" }}>
          {aperto ? "Chiudi" : "Apri la spiegazione"}
        </button>
      </div>
      <div style={{ marginTop: 6 }}>Cartella: <span style={codice}>{tutte.join(" → ")}</span>, nel disco del cloud «{CLOUD_NOME}».</div>
      {aperto && <div style={{ marginTop: 8 }}>
        <div style={passo}><b>1. Dal computer del Dott. Bizzarri.</b> Il cloud è il disco <b>Z:</b>. In Esplora file: Z: → {tutte.join(" → ")}.<br />Percorso da incollare nella barra di Esplora file: <span style={codice}>{percorsoZ}</span></div>
        <div style={passo}><b>2. Da un altro computer dell'ufficio.</b> Il cloud può avere un'altra lettera, oppure nessuna. Si apre sempre così: in Esplora file si clicca nella barra in alto, si incolla il percorso qui sotto e si preme Invio.<br /><span style={codice}>{percorsoRete}</span><br />Se Windows chiede nome utente e password del cloud, li scrive la persona: sono quelli che le ha dato l'ufficio.</div>
        <div style={passo}><b>3. Da un computer che non raggiunge il cloud</b> (per esempio fuori ufficio): i file scaricati si lasciano nella cartella dove li ha messi il browser (di solito «Download») e nel programma si scelgono da lì. Il programma li legge e li registra lo stesso. Mettere in ordine la cartella del cloud lo farà poi chi la raggiunge.</div>
        <div style={passo}><b>4. Nel programma</b> si preme «Scegli i file»: si apre la finestra di Windows (la stessa degli allegati della posta). Si va nella cartella, si selezionano i file (tenendo premuto Ctrl per sceglierne più di uno) e si preme «Apri».</div>
      </div>}
    </div>
  );
}
