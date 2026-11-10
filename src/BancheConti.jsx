import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { formattaEuro, fetchAllPages } from "./parsingUtils";
import { oggiRoma } from "./dateRoma";
import { ibanValido, ibanPulito, ibanBello } from "./regoleIncassiPagamenti";

// Versione 352 — «Banche, carte e cassa» → «Conti: stato e controlli» (decisioni del Dott. Bizzarri del 09/11/2026
// ore 20:46–21:42 e del 10/11/2026; progetto claude/progetto_prima_nota.md, sezione 10-bis).
// Per ogni conto (banca, carta, cassa): la scheda, le due righe «Controllo … ok alla data …» e «Quadratura con prima nota
// ok alla data …», i periodi mancanti in rosso (giorni senza estratto), i salti di saldo e la PARTENZA (saldo iniziale del
// primo estratto del conto: decisione del 10/11/2026 ore 09:11). La partenza la scrive e la annulla solo chi gestisce i conti
// (Dott. Bizzarri, Teresa Demaria, Colabucci). Tutti i controlli li fa il database (viste ci_v_stato_conti,
// ci_v_periodi_mancanti, ci_v_salti_di_saldo): la pagina li mostra e basta.
// Versione 357: «Apri un conto o una carta» (banca, carta di credito, carta prepagata, conto elettronico, cassa) e, su ogni
// conto in banca, le carte di debito e i bancomat collegati («Aggiungi carta di debito o bancomat», «Disattiva»); «Chiudi il conto».
// Solo chi gestisce i conti (Dott. Bizzarri, Teresa Demaria, Colabucci: decisione del 09/11/2026, sezione 10-bis.3); il database
// rifiuta tutto il resto (regole della versione 352: IBAN unico, carte con le sole ultime 4 cifre, conto chiuso con data o nota).

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

function SchedaConto({ conto, stato, partenze, documenti, movimenti, mancanti, salti, gestore, nomi, onCambiato, carte, conti }) {
  const [aperto, setAperto] = useState(null); // "partenza" | "annulla" | "carta" | "chiudi"
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
          {conto.tipo === "banca" && conto.stato === "aperto" && <button onClick={() => setAperto("carta")} style={btn(false)}>Aggiungi carta di debito o bancomat</button>}
          {conto.stato === "aperto" && <button onClick={() => setAperto("chiudi")} style={btn(false, C.red)}>Chiudi il conto</button>}
        </div>
      )}
      {conto.tipo === "banca" && <CarteDelConto conto={conto} carte={carte} gestore={gestore} onCambiato={onCambiato} />}
      {conto.tipo === "carta di credito" && <div style={{ fontSize: 12.5, marginTop: 6 }}>Addebitata su: <b>{conti.find(x => x.id === conto.conto_di_addebito_id)?.nome || "—"}</b> il giorno {conto.giorno_di_addebito || "—"} di ogni mese{conto.limite ? ` — limite ${euro(conto.limite)}` : ""}</div>}
      {aperto === "carta" && <FormCarta conto={conto} onAnnulla={() => setAperto(null)} onFatto={() => { setAperto(null); onCambiato(); }} />}
      {aperto === "chiudi" && <ChiudiConto conto={conto} onAnnulla={() => setAperto(null)} onFatto={() => { setAperto(null); onCambiato(); }} />}
      {aperto === "partenza" && <FormPartenza conto={conto} onAnnulla={() => setAperto(null)} onFatto={() => { setAperto(null); onCambiato(); }} />}
      {aperto === "annulla" && <AnnullaPartenza conto={conto} onAnnulla={() => setAperto(null)} onFatto={() => { setAperto(null); onCambiato(); }} />}
    </div>
  );
}

export default function BancheConti() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState("");
  const [loading, setLoading] = useState(true);
  const [nuovo, setNuovo] = useState(false);

  async function carica() {
    setLoading(true); setErrore("");
    try {
      const [conti, stato, mancanti, salti, storico, documenti, movimenti, gestore, carte] = await Promise.all([
        supabase.from("ci_conti").select("*").order("id"),
        supabase.from("ci_v_stato_conti").select("*"),
        supabase.from("ci_v_periodi_mancanti").select("*").order("dal"),
        supabase.from("ci_v_salti_di_saldo").select("*"),
        supabase.from("ci_storico_controlli").select("id, conto_id, tipo, esito, ok_alla_data, saldo, fonte, eseguito_il, eseguito_da, annullato_il, annullato_da, motivo_annullamento").eq("tipo", "partenza").order("eseguito_il"),
        fetchAllPages((da, a) => supabase.from("ci_documenti_fonte").select("id, conto_id, tipo, annullato_il").order("id").range(da, a)),
        fetchAllPages((da, a) => supabase.from("ci_pagamenti_fatture").select("id, conto_id").order("id").range(da, a)),
        supabase.rpc("ci_puo_gestire_conti"),
        supabase.from("ci_carte_di_debito").select("*").order("id"),
      ]);
      for (const r of [conti, stato, mancanti, salti, storico, documenti, movimenti, carte]) if (r.error) throw new Error(r.error.message);
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
        gestore: gestore.error ? false : !!gestore.data, nomi, carte: carte.data || [],
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
        {dati?.gestore && !nuovo && <button onClick={() => setNuovo(true)} style={btn(true)}>＋ Apri un conto o una carta</button>}
        {dati && <span style={{ fontSize: 12, color: C.muted, alignSelf: "center" }}>{dati.gestore ? "Lei può aprire e chiudere i conti e le carte e scrivere o annullare le partenze." : "Conti, carte e partenze li gestiscono il Dott. Bizzarri, Teresa Demaria e Colabucci."}</span>}
      </div>
      {nuovo && dati && <FormNuovoConto conti={dati.conti} onAnnulla={() => setNuovo(false)} onFatto={() => { setNuovo(false); carica(); }} />}
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
          gestore={dati.gestore} nomi={dati.nomi} onCambiato={carica} carte={dati.carte.filter(x => x.conto_id === c.id)} conti={dati.conti} />
      ))}
    </div>
  );
}

// ---------------- Versione 357: aprire un conto o una carta ----------------
const TIPI_CONTO = [
  { tipo: "banca", nome: "Conto corrente in banca", spiega: "serve l'IBAN; i documenti sono gli estratti conto" },
  { tipo: "carta di credito", nome: "Carta di credito", spiega: "spende oggi e paga dopo: serve il conto da cui viene addebitata e il giorno dell'addebito" },
  { tipo: "carta prepagata", nome: "Carta prepagata", spiega: "ha un suo saldo, si ricarica dal conto in banca (giroconto)" },
  { tipo: "conto elettronico", nome: "Conto elettronico", spiega: "per esempio un conto di pagamento online" },
  { tipo: "cassa", nome: "Cassa contanti", spiega: "ne esiste una sola aperta" },
];
const campoStile = { fontSize: 12, fontWeight: 700, display: "block" };
function FormNuovoConto({ conti, onFatto, onAnnulla }) {
  const [v, setV] = useState({ tipo: "", nome: "", banca_o_emittente: "", iban: "", ultime_quattro_cifre: "", titolare: "", conto_di_addebito_id: "", giorno_di_addebito: "", limite: "", conto_studio: "", data_apertura: "" });
  const [ibanOk, setIbanOk] = useState(false);
  const [errore, setErrore] = useState(""); const [salvo, setSalvo] = useState(false); const [riepilogo, setRiepilogo] = useState(false);
  const cambia = (k, x) => { setV(o => ({ ...o, [k]: x })); setRiepilogo(false); if (k === "iban") setIbanOk(false); };
  const banche = conti.filter(c => c.tipo === "banca" && c.stato === "aperto");
  const t = v.tipo; const carta = t === "carta di credito" || t === "carta prepagata";
  const ib = ibanPulito(v.iban);
  const problemi = [];
  if (!t) problemi.push("scegliere il tipo");
  if (!v.nome.trim()) problemi.push("scrivere il nome del conto (come lo si vuole vedere nel programma)");
  if (conti.some(c => c.nome.trim().toLowerCase() === v.nome.trim().toLowerCase() || (c.nome_nei_movimenti || "").toLowerCase() === v.nome.trim().toLowerCase())) problemi.push("esiste già un conto con questo nome");
  if (t === "banca" || (t === "conto elettronico" && ib)) {
    if (!ib) problemi.push("scrivere l'IBAN");
    else if (!ibanValido(ib)) problemi.push("IBAN non valido: controllare le cifre (forma o cifre di controllo sbagliate)");
    else if (conti.some(c => c.iban === ib)) problemi.push("questo IBAN è già di un altro conto");
    else if (!ibanOk) problemi.push("premere «Confermi IBAN» dopo averlo riletto sul contratto o sull'estratto");
  }
  if ((t === "banca" || carta) && !v.banca_o_emittente.trim()) problemi.push(t === "banca" ? "scrivere la banca" : "scrivere chi ha emesso la carta");
  if (carta && !/^\d{4}$/.test(v.ultime_quattro_cifre)) problemi.push("scrivere le ultime 4 cifre della carta (mai il numero intero)");
  if (carta && !v.titolare.trim()) problemi.push("scrivere il titolare della carta");
  if (t === "carta di credito" && !v.conto_di_addebito_id) problemi.push("scegliere il conto da cui viene addebitata");
  if (t === "carta di credito" && !(Number(v.giorno_di_addebito) >= 1 && Number(v.giorno_di_addebito) <= 31)) problemi.push("scrivere il giorno dell'addebito (1–31)");
  if (t === "cassa" && conti.some(c => c.tipo === "cassa" && c.stato === "aperto")) problemi.push("c'è già una cassa aperta");
  if (v.limite && leggiImporto(v.limite) === null) problemi.push("limite non valido");
  async function salva() {
    if (problemi.length || salvo) return;
    setSalvo(true); setErrore("");
    const riga = { tipo: t, nome: v.nome.trim(), banca_o_emittente: v.banca_o_emittente.trim() || null, iban: ib || null,
      ultime_quattro_cifre: carta ? v.ultime_quattro_cifre : null, titolare: carta ? v.titolare.trim() : null,
      conto_di_addebito_id: t === "carta di credito" ? Number(v.conto_di_addebito_id) : (t === "carta prepagata" && v.conto_di_addebito_id ? Number(v.conto_di_addebito_id) : null),
      giorno_di_addebito: t === "carta di credito" ? Number(v.giorno_di_addebito) : null, limite: v.limite ? leggiImporto(v.limite) : null,
      conto_studio: v.conto_studio.trim() || null, data_apertura: v.data_apertura || null };
    const { error } = await supabase.from("ci_conti").insert(riga);
    setSalvo(false);
    if (error) return setErrore("Il database non ha accettato il conto: " + error.message);
    onFatto();
  }
  return (
    <div style={{ ...scheda, border: `2px solid ${C.primary}` }}>
      <div style={{ fontWeight: 800, color: C.primary, fontSize: 16, marginBottom: 6 }}>Apri un conto o una carta</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>Si registra qui ogni posto dove Podere Verde ha dei soldi. Le carte di debito e i bancomat non sono conti: si aggiungono dentro la scheda del conto in banca che muovono («Aggiungi carta di debito o bancomat»). Dopo l'apertura: scrivere la partenza e caricare il primo documento. Un conto non si cancella mai: si chiude.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {TIPI_CONTO.map(x => <button key={x.tipo} onClick={() => cambia("tipo", x.tipo)} title={x.spiega} style={btn(t === x.tipo)}>{x.nome}</button>)}
      </div>
      {t && <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>{TIPI_CONTO.find(x => x.tipo === t).spiega}.</div>}
      {t && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
        <label style={campoStile}>Nome del conto nel programma<input style={{ ...input, width: "100%" }} value={v.nome} onChange={e => cambia("nome", e.target.value)} placeholder={t === "banca" ? "Banca del Fucino" : carta ? "Carta di credito Nexi 1234" : t === "cassa" ? "Cassa" : "Conto PayPal"} /></label>
        {(t === "banca" || carta) && <label style={campoStile}>{t === "banca" ? "Banca" : "Emessa da"}<input style={{ ...input, width: "100%" }} value={v.banca_o_emittente} onChange={e => cambia("banca_o_emittente", e.target.value)} placeholder={t === "banca" ? "Banca del Fucino" : "Nexi"} /></label>}
        {(t === "banca" || t === "conto elettronico") && <label style={campoStile}>IBAN{t === "conto elettronico" ? " (se c'è)" : ""}
          <input style={{ ...input, width: "100%", borderColor: ib && !ibanValido(ib) ? C.red : C.border }} value={v.iban} onChange={e => cambia("iban", e.target.value)} placeholder="IT00 X000 0000 0000 0000 0000 000" />
          {ib && <span style={{ fontWeight: 400, color: ibanValido(ib) ? C.green : C.red }}>{ibanValido(ib) ? `IBAN valido: ${ibanBello(ib)}` : "IBAN non valido"}</span>}
          {ib && ibanValido(ib) && <div><button style={{ ...btn(ibanOk, C.green), marginTop: 4 }} onClick={() => setIbanOk(true)}>{ibanOk ? "✔ IBAN confermato" : "Confermi IBAN"}</button></div>}</label>}
        {carta && <label style={campoStile}>Ultime 4 cifre della carta<input style={{ ...input, width: 100, display: "block" }} maxLength={4} value={v.ultime_quattro_cifre} onChange={e => cambia("ultime_quattro_cifre", e.target.value.replace(/\D/g, ""))} placeholder="1234" /><span style={{ fontWeight: 400, color: C.muted }}>mai il numero intero</span></label>}
        {carta && <label style={campoStile}>Titolare (persona a cui è intestata)<input style={{ ...input, width: "100%" }} value={v.titolare} onChange={e => cambia("titolare", e.target.value)} /></label>}
        {carta && <label style={campoStile}>{t === "carta di credito" ? "Addebitata sul conto" : "Ricaricata dal conto (se fisso)"}<select style={{ ...input, width: "100%" }} value={v.conto_di_addebito_id} onChange={e => cambia("conto_di_addebito_id", e.target.value)}><option value="">— scegliere —</option>{banche.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>}
        {t === "carta di credito" && <label style={campoStile}>Giorno dell'addebito ogni mese<input style={{ ...input, width: 80, display: "block" }} value={v.giorno_di_addebito} onChange={e => cambia("giorno_di_addebito", e.target.value.replace(/\D/g, ""))} placeholder="15" /></label>}
        {carta && <label style={campoStile}>Limite (se c'è)<input style={{ ...input, width: 140, display: "block" }} value={v.limite} onChange={e => cambia("limite", e.target.value)} placeholder="3.000,00" /></label>}
        <label style={campoStile}>Conto dello Studio Cacurri (se noto)<input style={{ ...input, width: 140, display: "block" }} value={v.conto_studio} onChange={e => cambia("conto_studio", e.target.value)} placeholder="24/05/001" /></label>
        <label style={campoStile}>Data di apertura in banca (se nota)<input type="date" style={{ ...input, display: "block" }} value={v.data_apertura} max={oggiRoma()} onChange={e => cambia("data_apertura", e.target.value)} /></label>
      </div>}
      {t && problemi.length > 0 && <div style={{ marginTop: 10, color: C.red, fontSize: 12.5 }}>Prima di salvare: {problemi.join("; ")}.</div>}
      {t && !problemi.length && !riepilogo && <div style={{ marginTop: 10 }}><button style={btn(true)} onClick={() => setRiepilogo(true)}>Controlla e salva</button></div>}
      {riepilogo && !problemi.length && <div style={{ marginTop: 10, padding: 10, border: `1.5px solid ${C.green}`, borderRadius: 8, fontSize: 13 }}>
        Si apre: <b>{v.nome.trim()}</b> — {t}{v.banca_o_emittente ? ` — ${v.banca_o_emittente.trim()}` : ""}{ib ? ` — IBAN ${ibanBello(ib)}` : ""}{carta ? ` — carta …${v.ultime_quattro_cifre} di ${v.titolare.trim()}` : ""}.
        Dopo il salvataggio tipo, IBAN e cifre della carta non si cambiano più quando il conto avrà documenti o movimenti.
        <div style={{ marginTop: 6, display: "flex", gap: 8 }}><button style={btn(true)} disabled={salvo} onClick={salva}>{salvo ? "Salvo…" : "Salva il conto"}</button><button style={btn(false)} onClick={() => setRiepilogo(false)}>Correggo</button></div></div>}
      <div style={{ marginTop: 8 }}><button style={btn(false, C.muted)} onClick={onAnnulla}>Chiudi senza salvare</button></div>
      {errore && <div style={{ color: C.red, fontWeight: 700, marginTop: 8 }}>⚠️ {errore}</div>}
    </div>
  );
}

function CarteDelConto({ conto, carte, gestore, onCambiato }) {
  const [disattiva, setDisattiva] = useState(null); const [errore, setErrore] = useState("");
  if (!carte.length) return <div style={{ fontSize: 12.5, marginTop: 6, color: C.muted }}>Carte di debito e bancomat collegati: nessuna registrata.</div>;
  return <div style={{ fontSize: 12.5, marginTop: 6 }}><b>Carte di debito e bancomat collegati:</b>
    {carte.map(k => <div key={k.id} style={{ marginLeft: 8, color: k.attiva ? C.text : C.muted }}>
      • {k.tipo} …{k.ultime_quattro_cifre} — {k.titolare} — {k.attiva ? "attiva" : "disattivata"}
      {gestore && k.attiva && disattiva !== k.id && <button style={{ ...btn(false, C.red), height: 24, fontSize: 11, marginLeft: 8 }} onClick={() => setDisattiva(k.id)}>Disattiva</button>}
      {disattiva === k.id && <span> — disattivare la carta …{k.ultime_quattro_cifre}? Resta registrata ma non si può più scegliere nei pagamenti.
        <button style={{ ...btn(true, C.red), height: 24, fontSize: 11, marginLeft: 6 }} onClick={async () => {
          const { error } = await supabase.from("ci_carte_di_debito").update({ attiva: false }).eq("id", k.id);
          if (error) return setErrore(error.message); setDisattiva(null); onCambiato(); }}>Sì, disattiva</button>
        <button style={{ ...btn(false), height: 24, fontSize: 11, marginLeft: 6 }} onClick={() => setDisattiva(null)}>No</button></span>}
    </div>)}
    {errore && <div style={{ color: C.red }}>⚠️ {errore}</div>}
  </div>;
}

function FormCarta({ conto, onFatto, onAnnulla }) {
  const [v, setV] = useState({ tipo: "carta di debito", ultime_quattro_cifre: "", titolare: "" });
  const [errore, setErrore] = useState(""); const [salvo, setSalvo] = useState(false);
  const ok = /^\d{4}$/.test(v.ultime_quattro_cifre) && v.titolare.trim();
  return <div style={{ border: `1.5px solid ${C.primary}`, borderRadius: 10, padding: 12, marginTop: 8, background: "#fff" }}>
    <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>Aggiungi una carta di debito o un bancomat a {conto.nome}</div>
    <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>La carta non è un conto: i suoi pagamenti e prelievi sono righe dell'estratto di {conto.nome} («Operazione carta ****1234»). Serve per sceglierla nei pagamenti («Carta di debito») e per riconoscerla negli estratti.</div>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
      <label style={campoStile}>Tipo<select style={input} value={v.tipo} onChange={e => setV({ ...v, tipo: e.target.value })}><option>carta di debito</option><option>bancomat</option></select></label>
      <label style={campoStile}>Ultime 4 cifre<input style={{ ...input, width: 90 }} maxLength={4} value={v.ultime_quattro_cifre} onChange={e => setV({ ...v, ultime_quattro_cifre: e.target.value.replace(/\D/g, "") })} placeholder="1894" /></label>
      <label style={{ ...campoStile, flex: "1 1 220px" }}>Titolare<input style={{ ...input, width: "100%" }} value={v.titolare} onChange={e => setV({ ...v, titolare: e.target.value })} /></label>
      <button style={btn(true)} disabled={!ok || salvo} onClick={async () => {
        setSalvo(true); setErrore("");
        const { error } = await supabase.from("ci_carte_di_debito").insert({ conto_id: conto.id, tipo: v.tipo, ultime_quattro_cifre: v.ultime_quattro_cifre, titolare: v.titolare.trim() });
        setSalvo(false); if (error) return setErrore("Il database non l'ha accettata: " + error.message); onFatto();
      }}>{salvo ? "Salvo…" : "Salva la carta"}</button>
      <button style={btn(false, C.muted)} onClick={onAnnulla}>Chiudi</button>
    </div>
    {!ok && <div style={{ color: C.red, fontSize: 12.5, marginTop: 6 }}>Servono le ultime 4 cifre e il titolare.</div>}
    {errore && <div style={{ color: C.red, fontWeight: 700, marginTop: 6 }}>⚠️ {errore}</div>}
  </div>;
}

function ChiudiConto({ conto, onFatto, onAnnulla }) {
  const [data, setData] = useState(""); const [nota, setNota] = useState(""); const [errore, setErrore] = useState(""); const [salvo, setSalvo] = useState(false);
  const ok = data && nota.trim();
  return <div style={{ border: `1.5px solid ${C.red}`, borderRadius: 10, padding: 12, marginTop: 8, background: "#fff" }}>
    <div style={{ fontWeight: 800, color: C.red, marginBottom: 6 }}>Chiudi {conto.nome}</div>
    <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>Il conto non si cancella: resta con tutti i suoi documenti e movimenti. Dopo la data di chiusura non accetta movimenti né documenti nuovi. Scrivere la data in cui la banca ha chiuso il conto (dal documento di chiusura) e da dove la si legge.</div>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
      <label style={campoStile}>Data di chiusura<input type="date" style={input} max={oggiRoma()} value={data} onChange={e => setData(e.target.value)} /></label>
      <label style={{ ...campoStile, flex: "1 1 300px" }}>Letta su / motivo<input style={{ ...input, width: "100%" }} value={nota} onChange={e => setNota(e.target.value)} placeholder="lettera di chiusura della banca del …" /></label>
      <button style={btn(true, C.red)} disabled={!ok || salvo} onClick={async () => {
        setSalvo(true); setErrore("");
        const { error } = await supabase.from("ci_conti").update({ stato: "chiuso", data_chiusura: data, nota_chiusura: nota.trim() }).eq("id", conto.id);
        setSalvo(false); if (error) return setErrore("Il database non l'ha accettato: " + error.message); onFatto();
      }}>{salvo ? "Salvo…" : "Chiudi il conto"}</button>
      <button style={btn(false, C.muted)} onClick={onAnnulla}>Lascia aperto</button>
    </div>
    {errore && <div style={{ color: C.red, fontWeight: 700, marginTop: 6 }}>⚠️ {errore}</div>}
  </div>;
}
