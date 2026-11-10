import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { formattaEuro, fetchAllPages } from "./parsingUtils";
import { oggiRoma } from "./dateRoma";

// Versione 352 — «Banche, carte e cassa» → «Conti: stato e controlli» (decisioni del Dott. Bizzarri del 09/11/2026
// ore 20:46–21:42 e del 10/11/2026; progetto claude/progetto_prima_nota.md, sezione 10-bis).
// Per ogni conto (banca, carta, cassa): la scheda, le due righe «Controllo … ok alla data …» e «Quadratura con prima nota
// ok alla data …», i periodi mancanti in rosso (giorni senza estratto), i salti di saldo e la PARTENZA (saldo iniziale del
// primo estratto del conto: decisione del 10/11/2026 ore 09:11). La partenza la scrive e la annulla solo chi gestisce i conti
// (Dott. Bizzarri, Teresa Demaria, Colabucci). Tutti i controlli li fa il database (viste ci_v_stato_conti,
// ci_v_periodi_mancanti, ci_v_salti_di_saldo): la pagina li mostra e basta.

const TIPI_DOCUMENTO = {
  "banca": "estratti conto",
  "conto elettronico": "estratti conto",
  "carta di credito": "liste movimenti della carta",
  "carta prepagata": "liste movimenti della carta",
  "cassa": "conteggi della cassa",
};
const ICONA = { "banca": "🏦", "conto elettronico": "💻", "carta di credito": "💳", "carta prepagata": "💳", "cassa": "💶" };

const dataIt = d => { const s = String(d || "").slice(0, 10); const [a, m, g] = s.split("-"); return g ? `${g}/${m}/${a}` : "—"; };
const euro = n => (n === null || n === undefined || n === "" ? "—" : formattaEuro(Number(n)));
const piuGiorni = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const giorniTra = (dal, al) => Math.round((new Date(`${al}T12:00:00Z`) - new Date(`${dal}T12:00:00Z`)) / 86400000) + 1;

// «20.864,72» oppure «20864.72» oppure «-1.234,5» → numero con al massimo 2 decimali; null se non è un importo
export function leggiImporto(testo) {
  let s = String(testo || "").trim().replace(/\s|€/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}

function Riquadro({ etichetta, valore, nota, colore = C.primary }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", minWidth: 160, flex: "1 1 160px" }}>
      <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700 }}>{etichetta}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: colore, marginTop: 2 }}>{valore}</div>
      {nota && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{nota}</div>}
    </div>
  );
}

function Riga({ colore, children }) {
  return <div style={{ borderLeft: `4px solid ${colore}`, background: `${colore}14`, padding: "7px 10px", borderRadius: 6, margin: "6px 0", fontSize: 13 }}>{children}</div>;
}

// Le due righe dello stato del conto (formato del Dott. Bizzarri, 09/11/2026 ore 21:22)
export function righeStato(conto, stato) {
  const documenti = TIPI_DOCUMENTO[conto.tipo] || "documenti";
  const righe = [];
  if (!stato || !stato.partenza_alla_data) {
    righe.push({ colore: C.red, testo: `Controllo ${documenti} su ${conto.nome}: non possibile — manca la partenza (il saldo iniziale del primo documento del conto)` });
    righe.push({ colore: C.muted, testo: "Quadratura con prima nota: non possibile senza partenza" });
    return righe;
  }
  const mancanti = stato.periodi_mancanti || [];
  const ok = stato.controllo_ok_alla_data;
  const ieri = piuGiorni(oggiRoma(), -1);
  if (conto.tipo === "cassa" && ok < ieri) righe.push({ colore: C.yellow, testo: `Controllo conteggi della cassa: ok alla data ${dataIt(ok)} — contare i contanti: nessun conteggio dal ${dataIt(piuGiorni(ok, 1))}` });
  else if (mancanti.length === 0 && Number(stato.salti_di_saldo || 0) === 0) righe.push({ colore: C.green, testo: `Controllo ${documenti} su ${conto.nome}: ok alla data ${dataIt(ok)}` });
  else righe.push({ colore: C.red, testo: `Controllo ${documenti} su ${conto.nome}: ok alla data ${dataIt(ok)} — non ok dal ${dataIt(piuGiorni(ok, 1))}` });
  const q = stato.quadratura_ok_alla_data;
  if (stato.quadratura_non_ok_dal) righe.push({ colore: C.red, testo: `Quadratura con prima nota: ok alla data ${dataIt(q)} — non ok dal ${dataIt(stato.quadratura_non_ok_dal)}` });
  else if (q && q > stato.partenza_alla_data) righe.push({ colore: q >= ok ? C.green : C.yellow, testo: `Quadratura con prima nota: ok alla data ${dataIt(q)}${q < ok ? ` — da fare dal ${dataIt(piuGiorni(q, 1))} al ${dataIt(ok)}` : ""}` });
  else righe.push({ colore: C.yellow, testo: `Quadratura con prima nota: mai fatta dopo la partenza (${dataIt(stato.partenza_alla_data)})` });
  return righe;
}

function FormPartenza({ conto, onFatto, onAnnulla }) {
  const [data, setData] = useState("");
  const [saldo, setSaldo] = useState("");
  const [fonte, setFonte] = useState("");
  const [errore, setErrore] = useState("");
  const [salvo, setSalvo] = useState(false);
  async function salva() {
    setErrore("");
    const s = leggiImporto(saldo);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return setErrore("Indicare la data del saldo.");
    if (data > oggiRoma()) return setErrore("La data non può essere nel futuro.");
    if (s === null) return setErrore("Saldo non valido: scrivere l'importo come sull'estratto, per esempio 20.864,72 (al massimo due decimali).");
    if (!fonte.trim()) return setErrore("Indicare da quale documento è letto il saldo.");
    setSalvo(true);
    const { error } = await supabase.from("ci_storico_controlli").insert({ conto_id: conto.id, tipo: "partenza", esito: "ok", ok_alla_data: data, saldo: s, fonte: fonte.trim() });
    setSalvo(false);
    if (error) return setErrore(error.message);
    onFatto();
  }
  return (
    <div style={{ border: `1.5px solid ${C.primary}`, borderRadius: 10, padding: 12, marginTop: 8, background: "#fff" }}>
      <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>Scrivi la partenza di {conto.nome}</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>
        La partenza è il <b>saldo iniziale del primo documento</b> del conto (decisione del 10/11/2026), letto sul documento.
        La data è il <b>giorno prima</b> dell'inizio del primo documento: per un estratto che parte dal 22/02/2023 si scrive 21/02/2023.
        Dopo la partenza, il primo documento deve cominciare il giorno dopo e il suo saldo iniziale deve essere uguale a questo saldo.
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12, fontWeight: 700 }}>Data del saldo<br /><input type="date" value={data} max={oggiRoma()} onChange={e => setData(e.target.value)} style={input} /></label>
        <label style={{ fontSize: 12, fontWeight: 700 }}>Saldo (€)<br /><input value={saldo} onChange={e => setSaldo(e.target.value)} placeholder="20.864,72" style={{ ...input, width: 140 }} /></label>
        <label style={{ fontSize: 12, fontWeight: 700, flex: "1 1 320px" }}>Letto su<br /><input value={fonte} onChange={e => setFonte(e.target.value)} placeholder="estratto conto BPER dal 22/02/2023, saldo iniziale, pagina 1" style={{ ...input, width: "100%" }} /></label>
        <button onClick={salva} disabled={salvo} style={btn(true)}>{salvo ? "Salvo…" : "Salva la partenza"}</button>
        <button onClick={onAnnulla} style={btn(false, C.muted)}>Chiudi</button>
      </div>
      {leggiImporto(saldo) !== null && data && <div style={{ fontSize: 12.5, marginTop: 8 }}>Verrà scritto: saldo <b>{euro(leggiImporto(saldo))}</b> alla fine del giorno <b>{dataIt(data)}</b>.</div>}
      {errore && <div style={{ color: C.red, fontSize: 12.5, marginTop: 8, fontWeight: 700 }}>⚠️ {errore}</div>}
    </div>
  );
}

function AnnullaPartenza({ conto, onFatto, onAnnulla }) {
  const [motivo, setMotivo] = useState("");
  const [errore, setErrore] = useState("");
  async function conferma() {
    setErrore("");
    if (!motivo.trim()) return setErrore("Scrivere il motivo dell'annullamento.");
    const { error } = await supabase.rpc("ci_annulla_partenza", { p_conto: conto.id, p_motivo: motivo.trim() });
    if (error) return setErrore(error.message);
    onFatto();
  }
  return (
    <div style={{ border: `1.5px solid ${C.red}`, borderRadius: 10, padding: 12, marginTop: 8, background: "#fff" }}>
      <div style={{ fontWeight: 800, color: C.red, marginBottom: 6 }}>Annulla la partenza di {conto.nome}</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>Si può solo finché il conto non ha documenti caricati. La partenza annullata resta scritta, con chi, quando e perché; poi si scrive quella giusta.</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12, fontWeight: 700, flex: "1 1 320px" }}>Motivo<br /><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="saldo letto male: sull'estratto è …" style={{ ...input, width: "100%" }} /></label>
        <button onClick={conferma} style={btn(true, C.red)}>Annulla la partenza</button>
        <button onClick={onAnnulla} style={btn(false, C.muted)}>Chiudi</button>
      </div>
      {errore && <div style={{ color: C.red, fontSize: 12.5, marginTop: 8, fontWeight: 700 }}>⚠️ {errore}</div>}
    </div>
  );
}

function SchedaConto({ conto, stato, partenze, documenti, movimenti, mancanti, salti, gestore, nomi, onCambiato }) {
  const [aperto, setAperto] = useState(null); // "partenza" | "annulla"
  const partenza = partenze.find(p => !p.annullato_il);
  const annullate = partenze.filter(p => p.annullato_il);
  const docValidi = documenti.filter(d => !d.annullato_il);
  const docAnnullati = documenti.length - docValidi.length;
  const chiusoSenzaData = conto.stato === "chiuso" && !conto.data_chiusura;
  const identificativo = conto.iban ? `IBAN ${conto.iban}` : conto.ultime_quattro_cifre ? `carta …${conto.ultime_quattro_cifre}${conto.titolare ? ` — ${conto.titolare}` : ""}` : "";
  return (
    <div style={{ ...scheda, borderLeft: `5px solid ${conto.stato === "chiuso" ? C.muted : C.primary}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.primary }}>{ICONA[conto.tipo] || "🏦"} {conto.nome} <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: conto.stato === "chiuso" ? C.muted : C.green, borderRadius: 10, padding: "2px 8px", marginLeft: 6 }}>{conto.stato}</span></div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
            {conto.tipo}{conto.banca_o_emittente ? ` — ${conto.banca_o_emittente}` : ""}{identificativo ? ` — ${identificativo}` : ""}
            {conto.conto_studio ? ` — conto dello Studio ${conto.conto_studio}` : ""}
          </div>
          <div style={{ fontSize: 12.5, color: C.muted }}>
            Nei movimenti: «{conto.nome_nei_movimenti || conto.nome}» — {movimenti.toLocaleString("it-IT")} movimenti nel programma — {docValidi.length.toLocaleString("it-IT")} documenti caricati{docAnnullati ? ` (più ${docAnnullati} annullati)` : ""}
          </div>
          {conto.stato === "chiuso" && <div style={{ fontSize: 12.5, color: chiusoSenzaData ? C.red : C.muted }}>{chiusoSenzaData ? `Data di chiusura non indicata${conto.nota_chiusura ? ` (${conto.nota_chiusura})` : ""}. Finché manca, il conto non accetta documenti né movimenti nuovi.` : `Chiuso il ${dataIt(conto.data_chiusura)}${conto.nota_chiusura ? ` — ${conto.nota_chiusura}` : ""}`}</div>}
        </div>
      </div>

      {righeStato(conto, stato).map((r, i) => <Riga key={i} colore={r.colore}>{r.testo}</Riga>)}

      {mancanti.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 800, color: C.red, fontSize: 13 }}>Periodi mancanti ({mancanti.length})</div>
          {mancanti.map((m, i) => (
            <div key={i} style={{ fontSize: 12.5, color: C.red, margin: "3px 0 0 8px" }}>
              • dal {dataIt(m.dal)} al {dataIt(m.al)} ({giorniTra(m.dal, m.al).toLocaleString("it-IT")} giorni): {conto.tipo === "cassa" ? "contare i contanti" : `scaricare il documento dal ${dataIt(m.dal)} al ${dataIt(m.al)}${conto.banca_o_emittente ? ` da ${conto.banca_o_emittente}` : ""}`}
            </div>
          ))}
        </div>
      )}
      {salti.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 800, color: C.red, fontSize: 13 }}>Salti di saldo ({salti.length})</div>
          {salti.map((s, i) => (
            <div key={i} style={{ fontSize: 12.5, color: C.red, margin: "3px 0 0 8px" }}>
              • il documento che finisce il {dataIt(s.fine_precedente)} chiude a {euro(s.saldo_finale_precedente)}, quello che comincia il {dataIt(s.inizio)} parte da {euro(s.saldo_iniziale)}: differenza {euro(s.differenza)}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 13 }}>
        <b>Partenza:</b>{" "}
        {partenza
          ? <>saldo {euro(partenza.saldo)} alla fine del {dataIt(partenza.ok_alla_data)} — letto su: {partenza.fonte}{nomi[partenza.eseguito_da] ? ` — scritta da ${nomi[partenza.eseguito_da]}` : ""} il {dataIt(partenza.eseguito_il)}</>
          : <span style={{ color: C.red, fontWeight: 700 }}>non ancora scritta</span>}
      </div>
      {annullate.map(p => (
        <div key={p.id} style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>
          <s>partenza annullata: {euro(p.saldo)} al {dataIt(p.ok_alla_data)}</s> — {p.motivo_annullamento}{nomi[p.annullato_da] ? ` — ${nomi[p.annullato_da]}` : ""} il {dataIt(p.annullato_il)}
        </div>
      ))}

      {gestore && !aperto && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!partenza && !chiusoSenzaData && <button onClick={() => setAperto("partenza")} style={btn(true)}>Scrivi la partenza</button>}
          {partenza && docValidi.filter(d => d.tipo !== "distinta" && d.tipo !== "esito della distinta").length === 0 && <button onClick={() => setAperto("annulla")} style={btn(false, C.red)}>Annulla la partenza</button>}
        </div>
      )}
      {aperto === "partenza" && <FormPartenza conto={conto} onAnnulla={() => setAperto(null)} onFatto={() => { setAperto(null); onCambiato(); }} />}
      {aperto === "annulla" && <AnnullaPartenza conto={conto} onAnnulla={() => setAperto(null)} onFatto={() => { setAperto(null); onCambiato(); }} />}
    </div>
  );
}

export default function BancheConti() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState("");
  const [loading, setLoading] = useState(true);

  async function carica() {
    setLoading(true); setErrore("");
    try {
      const [conti, stato, mancanti, salti, storico, documenti, movimenti, gestore] = await Promise.all([
        supabase.from("ci_conti").select("*").order("id"),
        supabase.from("ci_v_stato_conti").select("*"),
        supabase.from("ci_v_periodi_mancanti").select("*").order("dal"),
        supabase.from("ci_v_salti_di_saldo").select("*"),
        supabase.from("ci_storico_controlli").select("id, conto_id, tipo, esito, ok_alla_data, saldo, fonte, eseguito_il, eseguito_da, annullato_il, annullato_da, motivo_annullamento").eq("tipo", "partenza").order("eseguito_il"),
        fetchAllPages((da, a) => supabase.from("ci_documenti_fonte").select("id, conto_id, tipo, annullato_il").order("id").range(da, a)),
        fetchAllPages((da, a) => supabase.from("ci_pagamenti_fatture").select("id, conto_id").order("id").range(da, a)),
        supabase.rpc("ci_puo_gestire_conti"),
      ]);
      for (const r of [conti, stato, mancanti, salti, storico, documenti, movimenti]) if (r.error) throw new Error(r.error.message);
      // nomi di chi ha scritto o annullato una partenza (se la tabella dei profili non si legge, restano senza nome)
      const ids = [...new Set((storico.data || []).flatMap(p => [p.eseguito_da, p.annullato_da]).filter(Boolean))];
      let nomi = {};
      if (ids.length) {
        const { data: prof } = await supabase.from("profili").select("id, nome, cognome").in("id", ids);
        nomi = Object.fromEntries((prof || []).map(p => [p.id, `${(p.nome || "").trim()} ${(p.cognome || "").trim()}`.trim()]));
      }
      setDati({
        conti: conti.data || [], stato: stato.data || [], mancanti: mancanti.data || [], salti: salti.data || [],
        partenze: storico.data || [], documenti: documenti.data || [], movimenti: movimenti.data || [],
        gestore: gestore.error ? false : !!gestore.data, nomi,
      });
    } catch (e) { setErrore(e.message || String(e)); }
    setLoading(false);
  }
  useEffect(() => { carica(); }, []);

  const riepilogo = useMemo(() => {
    if (!dati) return null;
    const aperti = dati.conti.filter(c => c.stato === "aperto");
    const conPartenza = new Set(dati.partenze.filter(p => !p.annullato_il).map(p => p.conto_id));
    const ieri = piuGiorni(oggiRoma(), -1);
    const okPieni = dati.stato.filter(s => s.partenza_alla_data && s.controllo_ok_alla_data >= ieri && (s.periodi_mancanti || []).length === 0 && Number(s.salti_di_saldo || 0) === 0).length;
    return { aperti: aperti.length, chiusi: dati.conti.length - aperti.length, senzaPartenza: dati.conti.filter(c => !conPartenza.has(c.id)).length, periodi: dati.mancanti.length, okPieni };
  }, [dati]);

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.primary, marginBottom: 4 }}>🏦 Conti: stato e controlli</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 12, maxWidth: 980 }}>
        Ogni posto dove Podere Verde ha dei soldi: banche, carte, cassa. Per ognuno, fino a quale giorno i documenti della banca
        sono completi e tornano tra loro (<b>Controllo</b>) e fino a quale giorno la prima nota è uguale ai documenti (<b>Quadratura</b>).
        I periodi senza documenti sono in rosso, con che cosa scaricare. Tutti i controlli li fa il database.
      </div>
      <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
        <button onClick={carica} style={btn(false)}>{loading ? "Aggiorno…" : "↻ Aggiorna"}</button>
        {dati && <span style={{ fontSize: 12, color: C.muted, alignSelf: "center" }}>{dati.gestore ? "Lei può scrivere e annullare le partenze dei conti." : "Le partenze le scrivono il Dott. Bizzarri, Teresa Demaria e Colabucci."}</span>}
      </div>
      {errore && <div style={{ ...scheda, color: C.red, fontWeight: 700 }}>⚠️ Lettura non riuscita: {errore}</div>}
      {riepilogo && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <Riquadro etichetta="Conti aperti" valore={riepilogo.aperti} nota={riepilogo.chiusi ? `più ${riepilogo.chiusi} chiusi` : ""} />
          <Riquadro etichetta="Conti senza partenza" valore={riepilogo.senzaPartenza} colore={riepilogo.senzaPartenza ? C.red : C.green} nota="senza partenza il controllo non parte" />
          <Riquadro etichetta="Periodi mancanti" valore={riepilogo.periodi} colore={riepilogo.periodi ? C.red : C.green} nota="giorni senza documenti, su tutti i conti" />
          <Riquadro etichetta="Conti controllati fino a ieri" valore={riepilogo.okPieni} colore={C.green} />
        </div>
      )}
      {dati && dati.conti.length === 0 && <div style={scheda}>Nessun conto registrato.</div>}
      {dati && dati.conti.map(c => (
        <SchedaConto key={c.id} conto={c}
          stato={dati.stato.find(s => s.conto_id === c.id)}
          partenze={dati.partenze.filter(p => p.conto_id === c.id)}
          documenti={dati.documenti.filter(d => d.conto_id === c.id)}
          movimenti={dati.movimenti.filter(m => m.conto_id === c.id).length}
          mancanti={dati.mancanti.filter(m => m.conto_id === c.id)}
          salti={dati.salti.filter(s => s.conto_id === c.id)}
          gestore={dati.gestore} nomi={dati.nomi} onCambiato={carica} />
      ))}
    </div>
  );
}
