import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { formattaNumero } from "./parsingUtils";
import { calcolaRazione } from "./calcoloRazione";
import { caricaDatiRazioni, righeDaAlimenti, ANNO_CORRENTE } from "./RazioniBoviniDati";
import { GraficoCopertura, TabellaAlimenti, TotaleCosto, TabellaFabbisogno, riquadro, campo, etichetta } from "./RazioneViste";

// Alimentaria → Razioni Bovini → Razioni di riferimento (versione 244).
// Tipo di alimentazione → classe → numero di capi → box: razione da dare, costo e fabbisogno coperto.
// Le razioni sono quelle delle schede «Fabbisogni bovini alimentazione naturale» e «… mangimi» (17/10/2026),
// tabella ci_razioni_bovini_riferimento; i prezzi sono quelli delle fatture dell'anno in corso.

const TIPI = [
  { valore: "naturale", etichetta: "Alimentazione naturale (foraggi e farine)" },
  { valore: "mangimi", etichetta: "Alimentazione con mangimi (foraggi, orzo e mangimi)" },
];

export default function RazioniRiferimento() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [tipo, setTipo] = useState("naturale");
  const [classe, setClasse] = useState("");
  const [numeroCapi, setNumeroCapi] = useState(1);
  const [ambiente, setAmbiente] = useState("");

  useEffect(() => {
    caricaDatiRazioni().then(d => { setDati(d); if (d.classi.length) setClasse(d.classi[0].classe); }).catch(e => setErrore(e.message));
  }, []);

  const alimentiPerNome = useMemo(() => Object.fromEntries((dati?.alimenti || []).map(a => [a.nome, a])), [dati]);
  const classeRiga = dati?.classi.find(c => c.classe === classe);
  const rif = dati?.riferimento.find(r => r.tipo_alimentazione === tipo && r.classe === classe);
  const ris = useMemo(() => (dati && rif ? calcolaRazione(classeRiga, righeDaAlimenti(rif.alimenti), alimentiPerNome, dati.prezzi, numeroCapi) : null), [dati, rif, classeRiga, alimentiPerNome, numeroCapi]);

  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;
  if (!dati) return <div style={{ padding: 20, color: C.muted }}>Caricamento…</div>;

  return (
    <div style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>📋 Razioni di riferimento</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13 }}>
        Scelga il tipo di alimentazione e la classe: compare la razione da dare per capo al giorno, con il costo. Poi scriva il numero di capi e scelga il box. Razione: quella al costo più basso con il fieno di oggi (schede del 17/10/2026). Prezzi: media delle fatture del {ANNO_CORRENTE}, pesata sulle quantità acquistate.
      </p>

      <div style={{ ...riquadro, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div><label style={etichetta}>Tipo di alimentazione</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={campo}>{TIPI.map(t => <option key={t.valore} value={t.valore}>{t.etichetta}</option>)}</select></div>
        <div><label style={etichetta}>Classe</label>
          <select value={classe} onChange={e => setClasse(e.target.value)} style={campo}>{dati.classi.map(c => <option key={c.id}>{c.classe}</option>)}</select></div>
        <div><label style={etichetta}>Numero di capi</label>
          <input type="number" min={1} value={numeroCapi} onChange={e => setNumeroCapi(e.target.value)} style={campo} /></div>
        <div><label style={etichetta}>Box o ambiente del gruppo</label>
          <select value={ambiente} onChange={e => setAmbiente(e.target.value)} style={campo}><option value="">—</option>{dati.ambienti.map(a => <option key={a.id}>{a.nome}</option>)}</select></div>
      </div>
      {classeRiga && <div style={{ fontSize: 12, color: C.muted, marginTop: -8, marginBottom: 12 }}>Peso vivo {formattaNumero(classeRiga.peso_vivo_kg, 0)} kg · crescita {classeRiga.crescita_kg_giorno ? formattaNumero(classeRiga.crescita_kg_giorno, 2) + " kg al giorno" : "—"}{ambiente ? ` · ${ambiente}` : ""}</div>}

      {!rif && <div style={{ ...riquadro, color: C.red }}>Per questa classe e questo tipo di alimentazione non c'è una razione di riferimento.</div>}
      {rif && ris && <>
        {rif.nota && <div style={{ ...riquadro, background: "#FDECEA", borderColor: C.red, color: C.red, fontWeight: 700, fontSize: 13 }}>⚠️ {rif.nota}</div>}
        <TabellaAlimenti ris={ris} alimentiPerNome={alimentiPerNome} />
        <TotaleCosto ris={ris} />
        <GraficoCopertura ris={ris} soglia={classeRiga?.soglia_eccesso_pct} />
        <TabellaFabbisogno ris={ris}>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>Fonte della razione: {rif.fonte}. Per cambiarla: Costruisci razione → «Carica la razione di riferimento».</div>
        </TabellaFabbisogno>
      </>}
    </div>
  );
}
