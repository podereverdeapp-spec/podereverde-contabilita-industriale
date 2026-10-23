import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

// Versione 280 (decisione del Dott. Bizzarri del 23/10/2026): la consultazione delle fatture si fa «a
// pagine». Il database consegna al massimo 1.000 righe per richiesta: per questo la pagina NON legge più
// tutte le fatture in una volta (oltre le 1.000 le più vecchie sarebbero sparite senza avviso). È il
// database (funzione ci_cerca_fatture, file contabilita_strutture_v280.sql) a cercare, contare e
// sommare TUTTE le fatture che corrispondono ai filtri; la pagina mostra solo il gruppo richiesto
// (50, 100 o 200), con i pulsanti «◀ precedenti / successive ▶» in cima e in fondo all'elenco.
// L'export Excel legge tutte le fatture trovate, 1.000 alla volta, finché non le ha ricevute tutte.
const GRUPPI = [50, 100, 200];

export function ElencoFattureAPagine({ tipo, titolo, etichettaControparte, nomeFile, conFiltroData = false, coloreTotale = C.primary }) {
  const [risposta, setRisposta] = useState(null);
  const [righePerFattura, setRighePerFattura] = useState({});
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");
  const [espansa, setEspansa] = useState(null);
  const [cerca, setCerca] = useState("");
  const [cercaApplicata, setCercaApplicata] = useState("");
  const [filtroAnno, setFiltroAnno] = useState("tutti");
  const [filtroData, setFiltroData] = useState("");
  const [gruppo, setGruppo] = useState(50);
  const [inizio, setInizio] = useState(0);
  const [esportando, setEsportando] = useState("");

  // la ricerca parte mezzo secondo dopo l'ultima lettera scritta
  useEffect(() => { const t = setTimeout(() => setCercaApplicata(cerca.trim()), 500); return () => clearTimeout(t); }, [cerca]);
  // cambiando un filtro o la grandezza del gruppo si riparte dalla prima fattura
  useEffect(() => { setInizio(0); }, [cercaApplicata, filtroAnno, filtroData, gruppo]);
  useEffect(() => { carica(); }, [cercaApplicata, filtroAnno, filtroData, gruppo, inizio]);

  const parametri = (offset, limite) => ({
    p_tipo: tipo, p_anno: filtroAnno === "tutti" ? null : parseInt(filtroAnno), p_data: filtroData || null,
    p_testo: cercaApplicata || null, p_offset: offset, p_limite: limite,
  });

  async function carica() {
    setLoading(true); setErrore("");
    const { data, error } = await supabase.rpc("ci_cerca_fatture", parametri(inizio, gruppo));
    if (error) {
      setErrore(/ci_cerca_fatture|function|funzione/i.test(error.message)
        ? `${error.message}\n\nIl database non ha ancora la funzione della versione 280: lanciare il file contabilita_strutture_v280.sql.`
        : error.message);
      setRisposta(null);
    } else {
      setRisposta({ ...data, fatture: numerizzaCampi(data?.fatture || [], ["totale_netto", "totale_iva", "totale_lordo"]) });
    }
    setLoading(false);
  }

  async function espandi(fatturaId) {
    if (espansa === fatturaId) { setEspansa(null); return; }
    setEspansa(fatturaId);
    if (!righePerFattura[fatturaId]) {
      const { data, error } = await supabase.from("ci_articoli_fattura").select("*").eq("fattura_id", fatturaId).order("id");
      if (error) { alert(`⚠️ Errore nel caricamento delle righe:\n\n${error.message}`); return; }
      setRighePerFattura(prev => ({ ...prev, [fatturaId]: numerizzaCampi(data || [], ["quantita", "prezzo_unitario", "totale_riga", "aliquota_iva", "totale_iva"]) }));
    }
  }

  // Export: tutte le fatture trovate, 1.000 alla volta, con l'avanzamento
  async function esporta() {
    const totaleTrovate = Number(risposta?.numero || 0);
    const tutte = [];
    try {
      for (let da = 0; ; da += 1000) {
        setEsportando(`letto ${tutte.length.toLocaleString("it-IT")} di ${totaleTrovate.toLocaleString("it-IT")}`);
        const { data, error } = await supabase.rpc("ci_cerca_fatture", parametri(da, 1000));
        if (error) throw new Error(error.message);
        const blocco = data?.fatture || [];
        tutte.push(...blocco);
        if (blocco.length < 1000) break;
      }
      if (tutte.length !== totaleTrovate) throw new Error(`Lette ${tutte.length} fatture invece di ${totaleTrovate}: riprovare.`);
      const righeExcel = tutte.map(f => ({
        [etichettaControparte]: f.controparte, "P.IVA": f.partita_iva, "Numero": f.numero, "Data": f.data,
        "Totale netto": numeroExcel(f.totale_netto), "Totale IVA": numeroExcel(f.totale_iva), "Totale lordo": numeroExcel(f.totale_lordo),
      }));
      esportaExcel(nomeFile, [{ nome: titolo, righe: righeExcel }]);
    } catch (err) {
      alert(`⚠️ Errore nell'esportazione:\n\n${err.message}`);
    }
    setEsportando("");
  }

  const numero = Number(risposta?.numero || 0);
  const fatture = risposta?.fatture || [];
  const anni = risposta?.anni || [];
  const ultima = Math.min(inizio + gruppo, numero);

  const Navigazione = () => numero > 0 && (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "8px 0" }}>
      <button onClick={() => setInizio(Math.max(0, inizio - gruppo))} disabled={inizio === 0 || loading} style={stilePulsante(inizio === 0)}>◀ precedenti</button>
      <span style={{ fontSize: 13, color: C.muted }}>fatture {(inizio + 1).toLocaleString("it-IT")}–{ultima.toLocaleString("it-IT")} di {numero.toLocaleString("it-IT")}</span>
      <button onClick={() => setInizio(inizio + gruppo)} disabled={ultima >= numero || loading} style={stilePulsante(ultima >= numero)}>successive ▶</button>
      <label style={{ fontSize: 13, color: C.muted, marginLeft: 8 }}>per volta:{" "}
        <select value={gruppo} onChange={e => setGruppo(parseInt(e.target.value))} style={{ padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${C.border}` }}>
          {GRUPPI.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>
    </div>
  );

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>{titolo}</h1>
        <button onClick={esporta} disabled={!numero || !!esportando}
          style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {esportando ? `📥 Esportazione… ${esportando}` : "📥 Esporta Excel"}
        </button>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        {risposta ? `${numero.toLocaleString("it-IT")} fatture — totale ${formattaEuro(Number(risposta.totale_lordo || 0))} (calcolato su tutte le fatture trovate, anche quelle non mostrate)` : ""}
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <input placeholder={`Cerca per ${etichettaControparte.toLowerCase()}, numero o P.IVA...`} value={cerca} onChange={e => setCerca(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14 }} />
        {conFiltroData && (
          <>
            <input type="date" value={filtroData} onChange={e => setFiltroData(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14 }} />
            {filtroData && <button onClick={() => setFiltroData("")} style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 10px", cursor: "pointer", color: C.muted }}>✕</button>}
          </>
        )}
        <select value={filtroAnno} onChange={e => setFiltroAnno(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14 }}>
          <option value="tutti">Tutti gli anni</option>
          {anni.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {errore && <div style={{ color: C.red, whiteSpace: "pre-wrap", margin: "12px 0", fontWeight: 700 }}>⚠️ {errore}</div>}
      <Navigazione />
      {loading ? (
        <p style={{ color: C.muted }}>Caricamento...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {fatture.map(f => {
            const conControparte = { ...f, ci_fornitori: { nome: f.controparte, partita_iva: f.partita_iva } };
            return (
              <div key={f.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <div onClick={() => espandi(f.id)} style={{ display: "flex", justifyContent: "space-between", padding: 14, cursor: "pointer", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <strong>{f.controparte || "—"}</strong>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      Fatt. {f.numero} del {f.data} {f.partita_iva && `· P.IVA ${f.partita_iva}`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: coloreTotale }}>{formattaEuro(f.totale_lordo)}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{espansa === f.id ? "▲ nascondi righe" : "▼ vedi righe"}</div>
                  </div>
                </div>
                {espansa === f.id && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: 14 }}>
                    {!righePerFattura[f.id] ? <p style={{ color: C.muted, fontSize: 13 }}>Caricamento righe...</p>
                      : righePerFattura[f.id].length === 0 ? <p style={{ color: C.muted, fontSize: 13 }}>Nessuna riga trovata.</p>
                      : <RicomposizioneFattura fattura={conControparte} righe={righePerFattura[f.id]} />}
                  </div>
                )}
              </div>
            );
          })}
          {!errore && fatture.length === 0 && <p style={{ color: C.muted }}>Nessuna fattura trovata.</p>}
        </div>
      )}
      {!loading && <Navigazione />}
    </div>
  );
}

const stilePulsante = disabilitato => ({
  background: disabilitato ? "#ddd" : C.primary, color: disabilitato ? "#888" : "#fff", border: "none", borderRadius: 8,
  padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: disabilitato ? "default" : "pointer",
});

export default function FatturePassive() {
  return <ElencoFattureAPagine tipo="PASSIVA" titolo="Fatture Passive" etichettaControparte="Fornitore" nomeFile="FatturePassive" conFiltroData />;
}

export function RicomposizioneFattura({ fattura, righe }) {
  const f = fattura;
  const controparte = f.ci_fornitori || f.ci_clienti;
  const mostraUM = righe.some(r => r.unita_misura);
  const mostraQuantita = righe.some(r => r.quantita != null);
  const mostraPrezzoUnit = righe.some(r => r.prezzo_unitario != null);

  const imponibileTotale = righe.reduce((s, r) => s + (r.totale_riga || 0), 0);
  const ivaTotale = righe.reduce((s, r) => s + (r.totale_iva || 0), 0);
  const totaleComplessivo = imponibileTotale + ivaTotale;

  // Raggruppo l'IVA per aliquota, per il riepilogo (una fattura può avere aliquote diverse su righe diverse)
  const ivaPerAliquota = {};
  righe.forEach(r => {
    const aliq = r.aliquota_iva != null ? r.aliquota_iva : 0;
    if (!ivaPerAliquota[aliq]) ivaPerAliquota[aliq] = { imponibile: 0, iva: 0 };
    ivaPerAliquota[aliq].imponibile += r.totale_riga || 0;
    ivaPerAliquota[aliq].iva += r.totale_iva || 0;
  });

  return (
    <div style={{ background: "#FAF8F4", borderRadius: 10, padding: 16 }}>
      {/* Intestazione */}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: `2px solid ${C.primary}` }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{controparte?.nome || "—"}</div>
          {controparte?.partita_iva && <div style={{ fontSize: 12, color: C.muted }}>P.IVA {controparte.partita_iva}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Fattura n. {f.numero}</div>
          <div style={{ fontSize: 12, color: C.muted }}>del {f.data}</div>
        </div>
      </div>

      {/* Righe */}
      <table style={{ width: "100%", fontSize: 13, marginBottom: 12 }}>
        <thead>
          <tr style={{ color: C.muted, textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
            <th style={{ padding: "4px 8px" }}>Descrizione</th>
            {mostraUM && <th style={{ padding: "4px 8px", textAlign: "center" }}>U.M.</th>}
            {mostraQuantita && <th style={{ padding: "4px 8px", textAlign: "right" }}>Quantità</th>}
            {mostraPrezzoUnit && <th style={{ padding: "4px 8px", textAlign: "right" }}>Prezzo unitario</th>}
            <th style={{ padding: "4px 8px", textAlign: "right" }}>Imponibile</th>
          </tr>
        </thead>
        <tbody>
          {righe.map(r => (
            <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "6px 8px" }}>{r.descrizione}</td>
              {mostraUM && <td style={{ padding: "6px 8px", textAlign: "center" }}>{r.unita_misura || "—"}</td>}
              {mostraQuantita && <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.quantita != null ? r.quantita : "—"}</td>}
              {mostraPrezzoUnit && <td style={{ padding: "6px 8px", textAlign: "right" }}>{r.prezzo_unitario != null ? `${formattaEuro(r.prezzo_unitario)}` : "—"}</td>}
              <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{formattaEuro(r.totale_riga)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totali */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ minWidth: 260 }}>
          <RigaTotale label="Imponibile totale" valore={imponibileTotale} />
          {Object.entries(ivaPerAliquota).map(([aliq, v]) => (
            <RigaTotale key={aliq} label={`IVA ${aliq}%`} valore={v.iva} muted />
          ))}
          <div style={{ borderTop: `1.5px solid ${C.primary}`, marginTop: 6, paddingTop: 6 }}>
            <RigaTotale label="Totale fattura" valore={totaleComplessivo} bold />
          </div>
        </div>
      </div>
    </div>
  );
}

function RigaTotale({ label, valore, bold, muted }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px", fontSize: bold ? 15 : 13 }}>
      <span style={{ color: muted ? C.muted : C.text, fontWeight: bold ? 800 : 600 }}>{label}</span>
      <span style={{ color: bold ? C.primary : muted ? C.muted : C.text, fontWeight: bold ? 800 : 600 }}>{formattaEuro(valore)}</span>
    </div>
  );
}
