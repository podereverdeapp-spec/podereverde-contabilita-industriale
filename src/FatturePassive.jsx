import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

// Versione 280 (decisione del Dott. Bizzarri del 23/10/2026): la consultazione delle fatture si fa «a
// pagine». Il database consegna al massimo 1.000 righe per richiesta: la pagina NON legge più tutte le
// fatture in una volta. È il database a cercare, contare e sommare TUTTE le fatture che corrispondono ai
// filtri; la pagina mostra solo il gruppo richiesto (50, 100 o 200), con i pulsanti «◀ precedenti /
// successive ▶» in cima e in fondo all'elenco. L'export Excel legge tutte le fatture trovate, 1.000 alla volta.
// Versione 281 (decisione del 23/10/2026): la ricerca la fa la funzione ci_ricerca_documenti (file
// contabilita_strutture_v281.sql), che comprende anche gli acquisti di animali registrati solo nel Report
// Acquisto Animali: una «fattura» per fornitore, numero e data, con i capi come righe e l'IVA non registrata.
// Versione 283 (decisione del 23/10/2026): le fatture di trasporto d'ingresso la cui riga vale 0 (il trasporto è
// attribuito ai capi nel Report Acquisto Animali, per non contarlo due volte) mostrano l'importo del trasporto.
// Versione 284 (decisione del 23/10/2026): compaiono anche i documenti di competenza con Muratella («da ricevere»
// tra le passive, «da emettere» tra le attive), con la spiegazione che rimanda alla pagina «Rapporti con Muratella».
export const GRUPPI = [50, 100, 200];
export const DOCUMENTO_DI_COMPETENZA = t => t === "DA_RICEVERE" || t === "DA_EMETTERE";
export const PAGINA_COMPETENZA = "«Fatture da Ricevere e da Emettere → Rapporti con Muratella»";

export const EtichettaCompetenza = ({ tipo }) => (
  <span style={{ fontSize: 11, fontWeight: 700, color: C.blue, background: "#E4EEF5", borderRadius: 6, padding: "1px 6px", marginRight: 8 }}>
    🗂️ {tipo === "DA_RICEVERE" ? "Da ricevere" : "Da emettere"}
  </span>
);

// Spiegazione dei documenti di competenza e dei loro collegamenti con la fattura vera
export function NotaCompetenza({ f }) {
  if (DOCUMENTO_DI_COMPETENZA(f.tipo)) return (
    <div style={{ fontSize: 11.5, color: C.blue, marginTop: 2, maxWidth: 700 }}>
      Documento di competenza, non è una fattura {f.tipo === "DA_RICEVERE" ? "arrivata" : "emessa"}: per capire cosa contiene e come si conta nei costi occorre leggere il rinvio alla pagina {PAGINA_COMPETENZA}.
      {" "}{f.collegamento ? `Collegato alla ${f.collegamento}.` : "Non ancora collegato alla fattura vera."}
    </div>
  );
  if (f.regolarizzazione_di) return (
    <div style={{ fontSize: 11.5, color: C.blue, marginTop: 2, maxWidth: 700 }}>
      🔗 Fattura vera del documento di competenza «{f.collegamento || f.regolarizzazione_di}»: non si conta di nuovo nei costi. Leggere il rinvio alla pagina {PAGINA_COMPETENZA}.
    </div>
  );
  return null;
}
export const FUNZIONE_RICERCA = "ci_ricerca_documenti";

export function messaggioErroreRicerca(error) {
  return /ci_ricerca_documenti|function|funzione/i.test(error.message)
    ? `${error.message}\n\nIl database non ha ancora la funzione della versione 281: lanciare il file contabilita_strutture_v281.sql.`
    : error.message;
}

// Numero della fattura come si mostra: gli acquisti di animali senza numero restano riconoscibili
export const numeroFattura = f => (f.numero ? f.numero : "senza numero");

// Pulsanti «◀ precedenti / successive ▶» e scelta di quante fatture vedere per volta (sopra e sotto l'elenco)
export function NavigazionePagine({ numero, inizio, gruppo, setInizio, setGruppo, loading, cosa = "fatture" }) {
  if (!numero) return null;
  const ultima = Math.min(inizio + gruppo, numero);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "8px 0" }}>
      <button onClick={() => setInizio(Math.max(0, inizio - gruppo))} disabled={inizio === 0 || loading} style={stilePulsante(inizio === 0)}>◀ precedenti</button>
      <span style={{ fontSize: 13, color: C.muted }}>{cosa} {(inizio + 1).toLocaleString("it-IT")}–{ultima.toLocaleString("it-IT")} di {numero.toLocaleString("it-IT")}</span>
      <button onClick={() => setInizio(inizio + gruppo)} disabled={ultima >= numero || loading} style={stilePulsante(ultima >= numero)}>successive ▶</button>
      <label style={{ fontSize: 13, color: C.muted, marginLeft: 8 }}>per volta:{" "}
        <select value={gruppo} onChange={e => setGruppo(parseInt(e.target.value))} style={{ padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${C.border}` }}>
          {GRUPPI.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>
    </div>
  );
}

// Legge TUTTE le fatture trovate (1.000 alla volta) per l'esportazione; avanzamento(testo) mostra a che punto è
export async function leggiTutteLeTrovate(parametri, totaleTrovate, avanzamento) {
  const tutte = [];
  for (let da = 0; ; da += 1000) {
    avanzamento(`letto ${tutte.length.toLocaleString("it-IT")} di ${Number(totaleTrovate).toLocaleString("it-IT")}`);
    const { data, error } = await supabase.rpc(FUNZIONE_RICERCA, { ...parametri, p_offset: da, p_limite: 1000 });
    if (error) throw new Error(error.message);
    const blocco = data?.fatture || [];
    tutte.push(...blocco);
    if (blocco.length < 1000) break;
  }
  if (tutte.length !== Number(totaleTrovate)) throw new Error(`Lette ${tutte.length} fatture invece di ${totaleTrovate}: riprovare.`);
  return tutte;
}

// Righe di una fattura, con il trasporto d'ingresso attribuito ai capi accanto alle righe che valgono 0
export async function leggiRigheFattura(fatturaId) {
  const { data, error } = await supabase.from("ci_articoli_fattura").select("*").eq("fattura_id", fatturaId).order("id");
  if (error) throw new Error(error.message);
  const righe = numerizzaCampi(data || [], ["quantita", "prezzo_unitario", "totale_riga", "aliquota_iva", "totale_iva"]);
  const aZero = righe.filter(r => !r.totale_riga).map(r => r.id);
  if (aZero.length) {
    const { data: tr, error: eT } = await supabase.from("ci_report_acquisto_animali").select("articolo_fattura_id, importo")
      .eq("fonte", "TRASPORTO_INGRESSO").in("articolo_fattura_id", aZero);
    if (eT) throw new Error(eT.message);
    const perRiga = {};
    (tr || []).forEach(t => { perRiga[t.articolo_fattura_id] = (perRiga[t.articolo_fattura_id] || 0) + (parseFloat(t.importo) || 0); });
    righe.forEach(r => { if (perRiga[r.id] > 0) r.trasporto_ai_capi = perRiga[r.id]; });
  }
  return righe;
}

export const NotaTrasportoAiCapi = ({ importo, riga = false }) => (
  <div style={{ fontSize: 11.5, color: C.accent, marginTop: 2 }}>
    🚚 trasporto {formattaEuro(importo)} attribuito ai capi (Report Acquisto Animali){riga ? ": la riga vale 0 per non contarlo due volte" : ""}
  </div>
);

// I capi di un acquisto di animali (stesso fornitore, numero e data; solo quelli senza riga in una fattura)
export async function leggiCapiAcquisto(f) {
  let q = supabase.from("ci_report_acquisto_animali").select("id, bdn, nr_lotto, specie, razza, quantita, prezzo_unitario, importo, stato, note")
    .eq("fonte", "ACQUISTO_DIRETTO").is("articolo_fattura_id", null);
  q = f.fornitore_id == null ? q.is("fornitore_id", null) : q.eq("fornitore_id", f.fornitore_id);
  q = f.numero == null ? q.is("numero_fattura", null) : q.eq("numero_fattura", f.numero);
  q = f.data == null ? q.is("data_fattura", null) : q.eq("data_fattura", f.data);
  const { data, error } = await q.order("id");
  if (error) throw new Error(error.message);
  return numerizzaCampi(data || [], ["quantita", "prezzo_unitario", "importo"]);
}

export function CapiAcquisto({ capi }) {
  const totale = capi.reduce((s, c) => s + (c.importo || 0), 0);
  return (
    <div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
        Acquisto di animali registrato nel Report Acquisto Animali: l'IVA non è registrata. I dati si correggono nella pagina «Report Acquisto Animali».
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 8 }}>
        <thead>
          <tr style={{ borderBottom: `1.5px solid ${C.border}`, color: C.muted, fontSize: 12 }}>
            <th style={{ padding: "4px 8px", textAlign: "left" }}>Matricola o lotto</th>
            <th style={{ padding: "4px 8px", textAlign: "left" }}>Specie</th>
            <th style={{ padding: "4px 8px", textAlign: "left" }}>Razza</th>
            <th style={{ padding: "4px 8px", textAlign: "left" }}>Note</th>
            <th style={{ padding: "4px 8px", textAlign: "right" }}>Importo</th>
          </tr>
        </thead>
        <tbody>
          {capi.map(c => (
            <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "6px 8px" }}>{c.bdn || c.nr_lotto || "—"}</td>
              <td style={{ padding: "6px 8px" }}>{c.specie || "—"}</td>
              <td style={{ padding: "6px 8px" }}>{c.razza || "—"}</td>
              <td style={{ padding: "6px 8px", fontSize: 12, color: C.muted }}>{c.note || ""}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{formattaEuro(c.importo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: "right", fontWeight: 800 }}>Totale dei capi: {formattaEuro(totale)}</div>
    </div>
  );
}

export const EtichettaAcquistoAnimali = () => (
  <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, background: "#F3ECE2", borderRadius: 6, padding: "1px 6px", marginRight: 8 }}>🐄 Acquisto animali</span>
);

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
  const ultimaRichiesta = useRef(0); // conta solo la risposta dell'ultima ricerca partita

  // la ricerca parte mezzo secondo dopo l'ultima lettera scritta
  useEffect(() => { const t = setTimeout(() => setCercaApplicata(cerca.trim()), 500); return () => clearTimeout(t); }, [cerca]);
  // cambiando un filtro o la grandezza del gruppo si riparte dalla prima fattura
  useEffect(() => { setInizio(0); }, [cercaApplicata, filtroAnno, filtroData, gruppo]);
  useEffect(() => { carica(); }, [cercaApplicata, filtroAnno, filtroData, gruppo, inizio]);

  const parametri = (offset, limite) => ({
    p_tipo: tipo, p_anno: filtroAnno === "tutti" ? null : parseInt(filtroAnno), p_data: filtroData || null,
    // versione 286: la ricerca cerca anche nelle descrizioni delle righe, nelle note e, per gli acquisti di animali, nella matricola
    p_testo: cercaApplicata || null, p_cerca_righe: true, p_offset: offset, p_limite: limite,
  });

  async function carica() {
    const n = ++ultimaRichiesta.current;
    setLoading(true); setErrore("");
    const { data, error } = await supabase.rpc(FUNZIONE_RICERCA, parametri(inizio, gruppo));
    if (n !== ultimaRichiesta.current) return; // nel frattempo è partita una ricerca più recente
    if (error) {
      setErrore(messaggioErroreRicerca(error));
      setRisposta(null);
    } else {
      setRisposta({ ...data, fatture: numerizzaCampi(data?.fatture || [], ["totale_netto", "totale_iva", "totale_lordo"]) });
    }
    setLoading(false);
  }

  async function espandi(f) {
    if (espansa === f.chiave) { setEspansa(null); return; }
    setEspansa(f.chiave);
    if (righePerFattura[f.chiave]) return;
    try {
      if (f.acquisto_animali) {
        const capi = await leggiCapiAcquisto(f);
        setRighePerFattura(prev => ({ ...prev, [f.chiave]: capi }));
      } else {
        const righe = await leggiRigheFattura(f.id);
        setRighePerFattura(prev => ({ ...prev, [f.chiave]: righe }));
      }
    } catch (err) {
      alert(`⚠️ Errore nel caricamento delle righe:\n\n${err.message}`);
    }
  }

  // Export: tutte le fatture trovate, 1.000 alla volta, con l'avanzamento
  async function esporta() {
    try {
      const tutte = await leggiTutteLeTrovate(parametri(0, 1000), risposta?.numero || 0, setEsportando);
      const righeExcel = tutte.map(f => ({
        [etichettaControparte]: f.controparte, "P.IVA": f.partita_iva, "Numero": f.numero, "Data": f.data,
        "Totale netto": numeroExcel(f.totale_netto), "Totale IVA": f.acquisto_animali ? "non registrata" : numeroExcel(f.totale_iva),
        "Totale lordo": numeroExcel(f.totale_lordo), "Acquisto animali": f.acquisto_animali ? "sì" : "",
        "Documento di competenza": f.tipo === "DA_RICEVERE" ? "da ricevere" : f.tipo === "DA_EMETTERE" ? "da emettere" : "",
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
  const numeroAnimali = Number(risposta?.numero_acquisti_animali || 0);
  const navigazione = <NavigazionePagine numero={numero} inizio={inizio} gruppo={gruppo} setInizio={setInizio} setGruppo={setGruppo} loading={loading} />;

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
        {numeroAnimali > 0 && <><br />di cui {numeroAnimali.toLocaleString("it-IT")} acquisti di animali: {formattaEuro(Number(risposta.totale_acquisti_animali || 0))} (solo l'importo dei capi: l'IVA non è registrata)</>}
        {Number(risposta?.numero_competenza || 0) > 0 && <><br />🗂️ di cui {Number(risposta.numero_competenza).toLocaleString("it-IT")} documenti di competenza («{tipo.includes("DA_RICEVERE") ? "da ricevere" : "da emettere"}»): {formattaEuro(Number(risposta.totale_competenza || 0))} — leggere il rinvio alla pagina {PAGINA_COMPETENZA}</>}
        {Number(risposta?.numero_trasporti_ai_capi || 0) > 0 && <><br />🚚 trasporti attribuiti ai capi: {formattaEuro(Number(risposta.totale_trasporti_ai_capi || 0))} in {Number(risposta.numero_trasporti_ai_capi).toLocaleString("it-IT")} fatture (non compresi nel totale qui sopra: le loro righe valgono 0 e l'importo è nel Report Acquisto Animali)</>}
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <input placeholder={`Cerca per ${etichettaControparte.toLowerCase()}, numero, P.IVA, prodotto, note o matricola...`} value={cerca} onChange={e => setCerca(e.target.value)}
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
      {navigazione}
      {loading ? (
        <p style={{ color: C.muted }}>Caricamento...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {fatture.map(f => {
            const conControparte = { ...f, ci_fornitori: { nome: f.controparte, partita_iva: f.partita_iva } };
            const righe = righePerFattura[f.chiave];
            return (
              <div key={f.chiave} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <div onClick={() => espandi(f)} style={{ display: "flex", justifyContent: "space-between", padding: 14, cursor: "pointer", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    {f.acquisto_animali && <EtichettaAcquistoAnimali />}
                    {DOCUMENTO_DI_COMPETENZA(f.tipo) && <EtichettaCompetenza tipo={f.tipo} />}
                    <strong>{f.controparte || "—"}</strong>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      Fatt. {numeroFattura(f)} del {f.data} {f.partita_iva && `· P.IVA ${f.partita_iva}`}
                    </div>
                    {Number(f.trasporto_ai_capi) > 0 && <NotaTrasportoAiCapi importo={Number(f.trasporto_ai_capi)} />}
                    <NotaCompetenza f={f} />
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: coloreTotale }}>{formattaEuro(f.totale_lordo)}</div>
                    {f.acquisto_animali && <div style={{ fontSize: 11, color: C.muted }}>IVA non registrata</div>}
                    <div style={{ fontSize: 11, color: C.muted }}>{espansa === f.chiave ? "▲ nascondi righe" : "▼ vedi righe"}</div>
                  </div>
                </div>
                {espansa === f.chiave && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: 14 }}>
                    {!righe ? <p style={{ color: C.muted, fontSize: 13 }}>Caricamento righe...</p>
                      : righe.length === 0 ? <p style={{ color: C.muted, fontSize: 13 }}>Nessuna riga trovata.</p>
                      : f.acquisto_animali ? <CapiAcquisto capi={righe} />
                      : <RicomposizioneFattura fattura={conControparte} righe={righe} />}
                  </div>
                )}
              </div>
            );
          })}
          {!errore && fatture.length === 0 && <p style={{ color: C.muted }}>Nessuna fattura trovata.</p>}
        </div>
      )}
      {!loading && navigazione}
    </div>
  );
}

const stilePulsante = disabilitato => ({
  background: disabilitato ? "#ddd" : C.primary, color: disabilitato ? "#888" : "#fff", border: "none", borderRadius: 8,
  padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: disabilitato ? "default" : "pointer",
});

export default function FatturePassive() {
  return <ElencoFattureAPagine tipo="PASSIVA,DA_RICEVERE" titolo="Fatture Passive" etichettaControparte="Fornitore" nomeFile="FatturePassive" conFiltroData />;
}

// Versione 285 (decisione del Dott. Bizzarri del 23/10/2026): la fattura ricomposta, uguale in Fatture Passive,
// Fatture Attive e Ricerca. Per ogni riga: prodotto o bene, unità di misura, quantità, prezzo unitario, imponibile,
// aliquota IVA, importo IVA e totale della riga; sotto, in piccolo, la classificazione (area · centro di costo ·
// destinazione · tipo di costo). In fondo imponibile totale, IVA per aliquota e totale della fattura.
// azioneRiga(r): pulsanti accanto alla riga (in Ricerca la matita ✏️); sostituisciRiga(r): se restituisce qualcosa,
// la riga è sostituita da quel contenuto (in Ricerca il modulo di modifica).
const num = v => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v)); // valore assente o non numerico → null
const numeroIt = (n, max = 3) => (num(n) == null ? "—" : num(n).toLocaleString("it-IT", { maximumFractionDigits: max }));
const prezzoIt = n => (num(n) == null ? "—" : formattaEuro(num(n), Math.round(num(n) * 100) === num(n) * 100 ? 2 : 4));
const classificazione = r => [r.area, r.centro_costo, r.destinazione, r.tipo_costo];

export function RicomposizioneFattura({ fattura, righe, azioneRiga, sostituisciRiga }) {
  const f = fattura;
  const controparte = f.ci_fornitori || f.ci_clienti;
  const conClassificazione = righe.some(r => classificazione(r).some(Boolean));
  const colonne = 8 + (azioneRiga ? 1 : 0);

  const imponibileTotale = righe.reduce((s, r) => s + (r.totale_riga || 0), 0);
  const ivaTotale = righe.reduce((s, r) => s + (r.totale_iva || 0), 0);
  const totaleComplessivo = imponibileTotale + ivaTotale;

  // Raggruppo l'IVA per aliquota, per il riepilogo (una fattura può avere aliquote diverse su righe diverse)
  const ivaPerAliquota = {};
  righe.forEach(r => {
    const aliq = num(r.aliquota_iva) ?? 0;
    if (!ivaPerAliquota[aliq]) ivaPerAliquota[aliq] = { imponibile: 0, iva: 0 };
    ivaPerAliquota[aliq].imponibile += r.totale_riga || 0;
    ivaPerAliquota[aliq].iva += r.totale_iva || 0;
  });
  const titolo = f.tipo === "DA_RICEVERE" ? "Documento da ricevere" : f.tipo === "DA_EMETTERE" ? "Documento da emettere" : "Fattura n.";
  const th = { padding: "4px 8px", textAlign: "right", whiteSpace: "nowrap" };
  const td = { padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap", verticalAlign: "top" };

  return (
    <div style={{ background: "#FAF8F4", borderRadius: 10, padding: 16 }}>
      {/* Intestazione */}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: `2px solid ${C.primary}` }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{controparte?.nome || "—"}</div>
          {controparte?.partita_iva && <div style={{ fontSize: 12, color: C.muted }}>P.IVA {controparte.partita_iva}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{titolo} {f.numero}</div>
          <div style={{ fontSize: 12, color: C.muted }}>del {f.data}</div>
        </div>
      </div>

      {/* Righe */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 13, marginBottom: 12 }}>
          <thead>
            <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
              <th style={{ ...th, textAlign: "left" }}>Prodotto o bene</th>
              <th style={{ ...th, textAlign: "center" }}>Unità di misura</th>
              <th style={th}>Quantità</th>
              <th style={th}>Prezzo unitario</th>
              <th style={th}>Imponibile</th>
              <th style={th}>Aliquota IVA</th>
              <th style={th}>Importo IVA</th>
              <th style={th}>Totale riga</th>
              {azioneRiga && <th style={th}></th>}
            </tr>
          </thead>
          <tbody>
            {righe.map(r => {
              const sostituto = sostituisciRiga ? sostituisciRiga(r) : null;
              if (sostituto) return <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}><td colSpan={colonne} style={{ padding: "8px" }}>{sostituto}</td></tr>;
              return (
                <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                    {r.descrizione}
                    {r.trasporto_ai_capi > 0 && <NotaTrasportoAiCapi importo={r.trasporto_ai_capi} riga />}
                    {conClassificazione && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{classificazione(r).map(x => x || "—").join(" · ")}</div>}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>{r.unita_misura || "—"}</td>
                  <td style={td}>{numeroIt(r.quantita)}</td>
                  <td style={td}>{prezzoIt(r.prezzo_unitario)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{formattaEuro(r.totale_riga || 0)}</td>
                  <td style={td}>{num(r.aliquota_iva) != null ? `${numeroIt(r.aliquota_iva, 2)}%` : "—"}</td>
                  <td style={td}>{formattaEuro(r.totale_iva || 0)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{formattaEuro((r.totale_riga || 0) + (r.totale_iva || 0))}</td>
                  {azioneRiga && <td style={td}>{azioneRiga(r)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totali */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ minWidth: 260 }}>
          <RigaTotale label="Imponibile totale" valore={imponibileTotale} />
          {Object.entries(ivaPerAliquota).sort((a, b) => Number(b[0]) - Number(a[0])).map(([aliq, v]) => (
            <RigaTotale key={aliq} label={`IVA ${numeroIt(aliq, 2)}%`} valore={v.iva} muted />
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
