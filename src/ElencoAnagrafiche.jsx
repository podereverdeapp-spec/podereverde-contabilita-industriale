import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { esportaExcel } from "./esportaExcel";
import { btn, input, th, td, testata } from "./stileAruba";
import SchedaAnagrafica from "./SchedaAnagrafica";
import { CAMPI_ANAGRAFICA, caricaAnagrafiche, caricaComunicazioni, comunicazioniDi } from "./anagrafiche";

// Versione 304 — elenco dei clienti o dei fornitori. Cliccando una riga si apre la scheda: dati anagrafici
// modificabili e Registro delle Comunicazioni (decisioni del Dott. Bizzarri del 26/10/2026).

const NOMI_GRUPPO = { FCV: "FCV — parola chiave", FCF: "FCF — fissa", FRO: "FRO — sempre manuale" };

export default function ElencoAnagrafiche({ tipo }) {
  const [righe, setRighe] = useState([]);
  const [comunicazioni, setComunicazioni] = useState([]);
  const [errore, setErrore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cerca, setCerca] = useState("");
  const [gruppo, setGruppo] = useState("tutti");
  const [mancanti, setMancanti] = useState("");
  const [aperto, setAperto] = useState(null); // record o {} per nuovo
  const fornitori = tipo === "fornitore";
  const nomePlurale = fornitori ? "fornitori" : "clienti";

  useEffect(() => { carica(); }, [tipo]);
  async function carica() {
    setLoading(true); setErrore(null);
    try {
      const [a, c] = await Promise.all([caricaAnagrafiche(tipo), caricaComunicazioni().catch(() => [])]);
      setRighe(a); setComunicazioni(c);
    } catch (e) { setErrore(e.message); }
    setLoading(false);
  }

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return righe.filter(r => {
      if (fornitori && gruppo !== "tutti" && (r.gruppo_classificazione || "") !== (gruppo === "senza" ? "" : gruppo)) return false;
      if (mancanti && String(r[mancanti] || "").trim()) return false;
      if (!q) return true;
      return [r.nome, r.partita_iva, r.codice_fiscale, r.email, r.pec, r.citta, r.telefono, r.telefono_2, r.codice_destinatario].some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [righe, cerca, gruppo, mancanti, fornitori]);

  const conteggio = campo => righe.filter(r => String(r[campo] || "").trim()).length;

  function esporta() {
    const dati = filtrate.map(r => {
      const o = {};
      for (const c of CAMPI_ANAGRAFICA) o[c.etichetta] = r[c.campo] || "";
      if (fornitori) { o["Gruppo"] = NOMI_GRUPPO[r.gruppo_classificazione] || ""; o["Fatture storiche"] = r.n_fatture_storiche || 0; }
      o["Comunicazioni registrate"] = comunicazioniDi(tipo, r, comunicazioni).length;
      return o;
    });
    esportaExcel(fornitori ? "Fornitori" : "Clienti", [{ nome: fornitori ? "Fornitori" : "Clienti", righe: dati }]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1250, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, margin: 0 }}>{fornitori ? "Fornitori" : "Clienti"}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={esporta} style={btn(false, C.green)}>📥 Esporta Excel</button>
          <button onClick={() => setAperto({})} style={btn(true)}>+ Nuovo {fornitori ? "fornitore" : "cliente"}</button>
        </div>
      </div>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
        {righe.length} {nomePlurale}: {conteggio("partita_iva")} con Partita IVA, {conteggio("codice_fiscale")} con Codice Fiscale, {conteggio("indirizzo")} con indirizzo,
        {" "}{conteggio("email")} con email, {conteggio("pec")} con PEC, {conteggio("telefono")} con telefono, {conteggio("codice_destinatario")} con Codice Univoco.
        Cliccando un {fornitori ? "fornitore" : "cliente"} si apre la scheda: dati modificabili e Registro delle Comunicazioni.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input placeholder="Cerca per nome, Partita IVA, Codice Fiscale, email, PEC, telefono, città…" value={cerca} onChange={e => setCerca(e.target.value)} style={{ ...input, flex: 1, minWidth: 260 }} />
        {fornitori && (
          <select value={gruppo} onChange={e => setGruppo(e.target.value)} style={input}>
            <option value="tutti">Tutti i gruppi</option>
            {Object.entries(NOMI_GRUPPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="senza">Senza gruppo</option>
          </select>
        )}
        <select value={mancanti} onChange={e => setMancanti(e.target.value)} style={input}>
          <option value="">Tutte le schede</option>
          {["partita_iva", "codice_fiscale", "indirizzo", "email", "pec", "telefono", "codice_destinatario"].map(c => <option key={c} value={c}>Senza {CAMPI_ANAGRAFICA.find(x => x.campo === c).etichetta.replace(/ \(.*\)$/, "")}</option>)}
        </select>
      </div>

      {errore && <p style={{ color: C.red, fontWeight: 700 }}>⚠️ {errore}</p>}
      {loading ? <p style={{ color: C.muted }}>Caricamento…</p> : (
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "auto" }}>
          <table>
            <thead><tr style={testata}>
              <th style={th}>Nome</th><th style={th}>Partita IVA</th><th style={th}>Codice Fiscale</th><th style={th}>Città</th>
              <th style={th}>Telefono</th><th style={th}>Email</th><th style={th}>Codice Univoco e PEC</th>
              {fornitori && <th style={th}>Gruppo</th>}{fornitori && <th style={{ ...th, textAlign: "right" }}>Fatture storiche</th>}
              <th style={{ ...th, textAlign: "right" }}>Comunicazioni</th>
            </tr></thead>
            <tbody>
              {filtrate.map((r, i) => (
                <tr key={r.id} onClick={() => setAperto(r)} style={{ background: i % 2 ? "#FAF8F4" : "#fff", cursor: "pointer", borderTop: `1px solid ${C.border}` }}>
                  <td style={{ ...td, fontWeight: 700 }}>{r.nome}</td>
                  <td style={{ ...td, color: r.partita_iva ? C.text : C.red, fontStyle: r.partita_iva ? "normal" : "italic" }}>{r.partita_iva || "mancante"}</td>
                  <td style={td}>{r.codice_fiscale || "—"}</td>
                  <td style={td}>{[r.citta, r.provincia && `(${r.provincia})`].filter(Boolean).join(" ") || "—"}</td>
                  <td style={td}>{[r.telefono, r.telefono_2].filter(Boolean).join(" · ") || "—"}</td>
                  <td style={td}>{r.email || "—"}</td>
                  <td style={td}>{[r.codice_destinatario, r.pec].filter(Boolean).join(" · ") || "—"}</td>
                  {fornitori && <td style={td}>{r.gruppo_classificazione || "—"}</td>}
                  {fornitori && <td style={{ ...td, textAlign: "right" }}>{r.n_fatture_storiche || 0}</td>}
                  <td style={{ ...td, textAlign: "right" }}>{comunicazioniDi(tipo, r, comunicazioni).length || "—"}</td>
                </tr>
              ))}
              {!filtrate.length && <tr><td colSpan={fornitori ? 10 : 8} style={{ ...td, textAlign: "center", color: C.muted, padding: 30 }}>Nessun {fornitori ? "fornitore" : "cliente"} trovato</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {aperto && (
        <SchedaAnagrafica key={aperto.id || "nuovo"} tipo={tipo} record={aperto.id ? aperto : null} tutteComunicazioni={comunicazioni}
          onChiudi={() => setAperto(null)}
          onSalvato={s => { setRighe(prev => (prev.some(x => x.id === s.id) ? prev.map(x => (x.id === s.id ? s : x)) : [...prev, s].sort((a, b) => a.nome.localeCompare(b.nome)))); setAperto(s); }}
          onComunicazioneRegistrata={async () => { setComunicazioni(await caricaComunicazioni().catch(() => comunicazioni)); }} />
      )}
    </div>
  );
}
