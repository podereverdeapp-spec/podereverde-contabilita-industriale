import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input } from "./stileAruba";
import { fetchAllPages } from "./parsingUtils";
import { dataIt, euro } from "./analisiDocumentoBanca";
import { oggiRoma, dataRoma } from "./dateRoma";
import { avvisoDaPagare, riepilogoControllo, esitoFile, giaNelProgramma, GIORNI_PREAVVISO, GIORNI_CONTROLLO_VECCHIO, DATA_PARTENZA } from "./calcoloAvvisiF24";
import { cartellaQuietanze, controllaFiscale, segnaNonDaCaricare, ID_FINESTRA } from "./controlloFiscale";

// Versione 363 (11/11/2026, ordini del Dott. Bizzarri delle 14:03–14:04): avvisi «F24 da pagare» e «F24 da caricare»
// in alto nel programma, con i tasti che portano alla pagina di carico («F24 arrivati») e alla «Consulta F24».

const SEL_F24 = "id, codice_delega, oggetto, data_scadenza, saldo, totale_debito, totale_credito, stato, data_pagamento, riga_fonte_id, nome_file_quietanza, md5_quietanza, lavoro_id, md5_pdf, md5_contabile, nome_file_ricevuto, nome_file_contabile";

// legge tutto quello che serve agli avvisi (poche righe: gli F24 e le sole uscite della banca con «F24»)
export async function caricaAvvisiF24() {
  const oggi = oggiRoma();
  const [f, docs, conti] = await Promise.all([
    fetchAllPages((a, b) => supabase.from("ci_f24").select(SEL_F24).order("id").range(a, b)),
    fetchAllPages((a, b) => supabase.from("ci_documenti_fonte").select("id, annullato_il, pdf_impronta, file_digitale_impronta").order("id").range(a, b)),
    supabase.from("ci_conti").select("id"),
  ]);
  for (const r of [f, docs, conti]) if (r.error) throw new Error(r.error.message);
  const vivi = new Set((docs.data || []).filter(x => !x.annullato_il).map(x => x.id));
  const primo = (f.data || []).map(x => x.data_scadenza).filter(Boolean).sort()[0] || oggi;
  const da = (() => { const x = new Date(primo + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() - 30); return x.toISOString().slice(0, 10); })();
  const [righe, ...ultime] = await Promise.all([
    fetchAllPages((a, b) => supabase.from("ci_righe_fonte").select("id, documento_id, conto_id, data_contabile, importo, descrizione, verso, pagina_pdf")
      .eq("verso", "uscita").ilike("descrizione", "%F24%").gte("data_contabile", da).order("id").range(a, b)),
    // copertura come nella «Chiusura»: l'ultimo giorno caricato del conto meno aggiornato (fra i conti con righe)
    ...(conti.data || []).map(c => supabase.from("ci_righe_fonte").select("documento_id, data_contabile").eq("conto_id", c.id).order("data_contabile", { ascending: false }).limit(40)),
  ]);
  for (const r of [righe, ...ultime]) if (r.error) throw new Error(r.error.message);
  const fino = ultime.map(u => (u.data || []).find(r => vivi.has(r.documento_id))?.data_contabile).filter(Boolean);
  const coperturaFino = fino.length ? fino.reduce((m, x) => (x < m ? x : m)) : null;
  const pagare = avvisoDaPagare({ f24: f.data || [], righeBanca: righe.data || [], documenti: docs.data || [], coperturaFino, oggi });
  // ultimo controllo di FISCALE finito (ore del server, non dei computer); i file sono quelli visti da quel controllo in poi (anche da un controllo successivo
  // ancora in corso o interrotto: sono letture vere della cartella). Un file tolto dalla cartella non viene più visto e esce.
  const { data: ctr, error: e3 } = await supabase.from("ci_f24_fiscale_controlli").select("id, eseguito_il, eseguito_da, file_trovati, da_caricare, storico, note")
    .like("note", "finito%").order("eseguito_il", { ascending: false }).limit(1);
  if (e3) return { pagare, fiscale: null, erroreFiscale: e3.message, oggi };
  const ultimo = ctr?.[0] || null;
  let righeF = [];
  if (ultimo) {
    const [r, f2, d2, a2] = await Promise.all([
      fetchAllPages((a, b) => supabase.from("ci_f24_fiscale_file").select("percorso, dimensione, md5, esito, motivo, controllo_id, visto_il").gte("visto_il", ultimo.eseguito_il).order("percorso").range(a, b)),
      Promise.resolve(f),
      fetchAllPages((a, b) => supabase.from("ci_f24_documenti").select("id, md5, md5_file_ricevuto, nome_file_ricevuto").order("id").range(a, b)),
      fetchAllPages((a, b) => supabase.from("ci_f24_file_archivio").select("id, md5").order("id").range(a, b)),
    ]);
    for (const x of [r, d2, a2]) if (x.error) return { pagare, fiscale: null, erroreFiscale: x.error.message, oggi };
    // l'esito si ricalcola su quello che c'è ADESSO nel programma: un F24 caricato dopo il controllo esce subito dall'avviso
    const gia = giaNelProgramma({ f24: f2.data || [], documenti: d2.data || [], fileArchivio: a2.data || [] });
    righeF = (r.data || []).map(x => { const ill = !x.md5 && /^il file non si legge/.test(x.motivo || "");
      const e = esitoFile({ percorso: x.percorso, md5: x.md5, dimensione: x.dimensione, illeggibile: ill, motivoIlleggibile: ill ? x.motivo : null }, gia, x);
      return { ...x, esito: e.esito, motivo: e.motivo || (e.esito === x.esito ? x.motivo : null) }; });   // il motivo salvato (per esempio «non si legge») resta
  }
  return { pagare, fiscale: riepilogoControllo(righeF, ultimo, oggi), oggi };
}

// avvisi che si aggiornano all'apertura, a ogni cambio di pagina, ogni 5 minuti e dopo un controllo
export function useAvvisiF24(attivo, tab) {
  const [a, setA] = useState(null);
  const giro = useRef(0);
  // un errore NON fa sparire l'avviso in silenzio: si mostra in alto (ricontrollo indipendente, difetto 2); una risposta vecchia non copre una nuova
  const leggi = useCallback(() => { if (!attivo) return; const n = ++giro.current;
    caricaAvvisiF24().then(x => { if (n === giro.current) setA(v => (x.erroreFiscale && v?.fiscale ? { ...x, fiscale: v.fiscale } : x)); }).catch(x => { if (n === giro.current) setA(v => ({ ...(v || {}), errore: String(x?.message || x) })); }); }, [attivo]);
  useEffect(() => {
    if (!attivo) return undefined;
    leggi(); const t = setInterval(leggi, 5 * 60 * 1000);
    window.addEventListener("avvisi-f24-cambiati", leggi);
    return () => { clearInterval(t); window.removeEventListener("avvisi-f24-cambiati", leggi); };
  }, [attivo, tab, leggi]);
  // senza dati per un errore il numero rosso non va a zero: resta 1 finché la lettura non riesce
  const numero = a?.pagare ? a.pagare.numero + (a.fiscale ? a.fiscale.daCaricare.length : 0) : (a?.errore ? 1 : 0);
  return { avvisi: a, numero };
}

// «Controlla FISCALE»: la finestra di Windows si apre subito, dentro il clic (Chrome lo vuole)
export async function eseguiControlloFiscale(utente, avanzamento) {
  if (typeof window.showDirectoryPicker !== "function") throw new Error("serve Chrome o Edge sul computer");
  let h;
  try { h = await window.showDirectoryPicker({ id: ID_FINESTRA, mode: "read" }); }
  catch (x) { if (x?.name === "AbortError") return null; throw x; }
  const c = await cartellaQuietanze(h); if (c.problema) throw new Error(c.problema);
  return controllaFiscale(c.h, utente?.email || "utente", avanzamento);
}

const striscia = colore => ({ background: colore, color: "#fff", padding: "9px 20px", fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" });
const tasto = { background: "#fff", color: C.text, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" };

export function StrisciaAvvisiF24({ avvisi, vaiA, utente, puoCaricare, puoConsultare }) {
  const [lavoro, setLavoro] = useState("");
  const [errore, setErrore] = useState("");
  if (!avvisi) return null;
  const { pagare, fiscale } = avvisi;
  if (!pagare) return <div style={striscia("#C0392B")}>⚠️ Gli avvisi degli F24 non si possono calcolare: {avvisi.errore}. Gli F24 da pagare vanno guardati in «Consulta F24».
    {puoConsultare && <button style={tasto} onClick={() => vaiA("consulta-f24")}>Vai a «Consulta F24» →</button>}</div>;
  const controlla = async () => {
    setErrore(""); setLavoro("Scegli la cartella QUIETANZE F24…");
    try { const r = await eseguiControlloFiscale(utente, setLavoro); setLavoro(r ? `Controllo finito: ${r.trovati} PDF, ${r.daCaricare} da caricare${r.illeggibili ? `, di cui ${r.illeggibili} non leggibil${r.illeggibili === 1 ? "e" : "i"}` : ""}.` : ""); setTimeout(() => setLavoro(""), 6000); }
    catch (x) { setLavoro(""); setErrore(`Controllo non riuscito: ${x.message}`); }
  };
  const elencoPagare = [...pagare.scaduti.map(f => `${dataIt(f.data_scadenza)} ${euro(f.saldo)} scaduto`), ...pagare.inScadenza.map(f => `${dataIt(f.data_scadenza)} ${euro(f.saldo)}`)].join(" · ");
  const zero = pagare.saldoZeroDaPresentare, nPagare = pagare.scaduti.length + pagare.inScadenza.length;
  return <>
    {avvisi.errore && <div style={striscia("#C0392B")}>⚠️ Avvisi degli F24 non aggiornati: {avvisi.errore}. Quelli sotto sono dell'ultima lettura riuscita.</div>}
    {nPagare > 0 && <div style={striscia(pagare.scaduti.length ? "#C0392B" : "#B9770E")}>
      🧾 {nPagare === 1 ? "C'è 1 F24 da pagare" : `Ci sono ${nPagare} F24 da pagare`}{pagare.scaduti.length ? ` (${pagare.scaduti.length} scadut${pagare.scaduti.length === 1 ? "o" : "i"})` : ""}: {euro(pagare.importo)} — {elencoPagare}
      {puoConsultare && <button style={tasto} onClick={() => vaiA("consulta-f24")}>Vai a «Consulta F24» →</button>}
    </div>}
    {zero.length > 0 && <div style={striscia(zero.some(f => !f.data_scadenza || f.data_scadenza < avvisi.oggi) ? "#C0392B" : "#B9770E")}>
      🧾 {zero.length === 1 ? "C'è 1 F24 a saldo zero" : `Ci sono ${zero.length} F24 a saldo zero`} (pagat{zero.length === 1 ? "o" : "i"} con i crediti) ancora «Da pagare»: va presentato entro la scadenza (se è già stato presentato, si segna con la quietanza) — {zero.map(f => `${f.oggetto || f.codice_delega}, ${!f.data_scadenza ? "senza data di scadenza nel programma" : `scadenza ${dataIt(f.data_scadenza)}${f.data_scadenza < avvisi.oggi ? " (scaduto)" : ""}`}`).join(" · ")}
      {puoConsultare && <button style={tasto} onClick={() => vaiA("consulta-f24")}>Vai a «Consulta F24» →</button>}
    </div>}
    {pagare.pagatiDaConfermare.length > 0 && <div style={striscia("#5D6D7E")}>
      ✔ {pagare.pagatiDaConfermare.length === 1 ? "1 F24 risulta pagato" : `${pagare.pagatiDaConfermare.length} F24 risultano pagati`} secondo l'estratto conto (stesso importo, data vicina alla scadenza), ma non è confermato: si conferma nella «Chiusura» in fondo a «Consulta F24».
      {puoConsultare && <button style={tasto} onClick={() => vaiA("consulta-f24")}>Vai a «Consulta F24» →</button>}
    </div>}
    {fiscale && fiscale.daCaricare.length > 0 && <div style={striscia("#C0392B")}>
      📥 {fiscale.daCaricare.length === 1 ? "C'è 1 F24 da caricare" : `Ci sono ${fiscale.daCaricare.length} F24 da caricare`}: PDF nuovi nella cartella FISCALE\QUIETANZE F24 (controllo del {dataIt(dataRoma(fiscale.ultimo.eseguito_il))}).
      {puoCaricare && <button style={tasto} onClick={() => vaiA("f24-arrivati")}>Vai a «F24 arrivati» per caricarli →</button>}
      {puoConsultare && <button style={tasto} onClick={() => vaiA("consulta-f24")}>Vedi l'elenco</button>}
      {!fiscale.vecchio && <button style={tasto} onClick={controlla} disabled={!!lavoro}>Controlla di nuovo FISCALE</button>}
    </div>}
    {fiscale && fiscale.stessoNome.length > 0 && <div style={striscia("#B9770E")}>
      🔎 {fiscale.stessoNome.length === 1 ? "1 PDF" : `${fiscale.stessoNome.length} PDF`} della cartella FISCALE\QUIETANZE F24 {fiscale.stessoNome.length === 1 ? "ha" : "hanno"} il nome di un file caricato ma un contenuto non riconosciuto: da guardare una volta (se è lo stesso documento, «Non è da caricare» con il motivo).
      {puoConsultare && <button style={tasto} onClick={() => vaiA("consulta-f24")}>Vedi l'elenco</button>}
    </div>}
    {avvisi.erroreFiscale && <div style={striscia("#C0392B")}>⚠️ Il controllo della cartella FISCALE non si legge: {avvisi.erroreFiscale}. Non si sa se ci sono F24 da caricare.</div>}
    {fiscale?.ultimo && Number(fiscale.ultimo.file_trovati) === 0 && <div style={striscia("#C0392B")}>⚠️ L'ultimo controllo della cartella FISCALE\QUIETANZE F24 ha trovato 0 PDF: la cartella forse non è sincronizzata col cloud. Non si sa se ci sono F24 da caricare.
      <button style={tasto} onClick={controlla} disabled={!!lavoro}>Controlla di nuovo FISCALE</button></div>}
    {!avvisi.erroreFiscale && (!fiscale || fiscale.vecchio) && <div style={striscia("#B9770E")}>
      📂 {!fiscale?.ultimo ? "La cartella FISCALE\\QUIETANZE F24 non è mai stata controllata: non si sa se ci sono F24 da caricare." : `La cartella FISCALE\\QUIETANZE F24 non è controllata da ${fiscale.giorni} giorni.`}
      <button style={tasto} onClick={controlla} disabled={!!lavoro}>Controlla FISCALE</button>
    </div>}
    {(lavoro || errore) && <div style={{ background: errore ? "#FBE1DE" : "#EAF2FB", color: C.text, padding: "6px 20px", fontSize: 13 }}>{errore || `⏳ ${lavoro}`}</div>}
  </>;
}

// Riquadro nella «Consulta F24»: l'elenco dei file di FISCALE da caricare, con «Non è da caricare» e il controllo
export function RiquadroFiscale({ utente, vaiA }) {
  const [a, setA] = useState(null);
  const [lavoro, setLavoro] = useState("");
  const [errore, setErrore] = useState("");
  const [erroreLettura, setErroreLettura] = useState("");
  const [motivo, setMotivo] = useState({});
  const giro = useRef(0);
  const leggi = useCallback(() => { const n = ++giro.current; return caricaAvvisiF24().then(x => { if (n !== giro.current) return; setA(v => (x.erroreFiscale && v?.fiscale ? { ...x, fiscale: v.fiscale } : x)); setErroreLettura(x.erroreFiscale ? `Il controllo di FISCALE non si legge: ${x.erroreFiscale}` : ""); }).catch(x => { if (n === giro.current) setErroreLettura(`Gli avvisi non si leggono: ${x.message}`); }); }, []);
  useEffect(() => { leggi(); window.addEventListener("avvisi-f24-cambiati", leggi); return () => window.removeEventListener("avvisi-f24-cambiati", leggi); }, [leggi]);
  const controlla = async () => {
    setErrore(""); setLavoro("Scegli la cartella QUIETANZE F24…");
    try { const r = await eseguiControlloFiscale(utente, setLavoro); setLavoro(r ? `Controllo finito: ${r.trovati} PDF trovati, ${r.daCaricare} da caricare, ${r.storico} storici (prima del ${DATA_PARTENZA.split("-").reverse().join("/")})${r.illeggibili ? `, ${r.illeggibili} non leggibil${r.illeggibili === 1 ? "e" : "i"} (se non sono storici o già decisi, restano «da caricare» con il motivo)` : ""}.` : ""); }
    catch (x) { setLavoro(""); setErrore(`Controllo non riuscito: ${x.message}`); }
  };
  const nonDaCaricare = async (p) => {
    const m = String(motivo[p] || "").trim(); if (!m) { setErrore("Scrivere il motivo: è obbligatorio."); return; }
    try { await segnaNonDaCaricare(p, m, utente?.email || "utente"); setMotivo(x => ({ ...x, [p]: "" })); setErrore(""); } catch (x) { setErrore(`Non segnato: ${x.message}`); }
  };
  const f = a?.fiscale; const cella = { padding: "4px 8px", fontSize: 12.5, borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
  return <div>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
      <div style={{ fontWeight: 800, color: C.primary, flex: 1 }}>F24 da caricare dalla cartella FISCALE\QUIETANZE F24</div>
      <button style={btn(true)} onClick={controlla} disabled={!!lavoro && !/finito/.test(lavoro)}>Controlla FISCALE</button>
      <button style={btn(false)} onClick={() => vaiA("f24-arrivati")}>Vai a «F24 arrivati» per caricarli</button>
    </div>
    <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>Il programma guarda la cartella del cloud solo in lettura: non sposta, non copia e non cancella niente. Un PDF è «caricato» se la sua impronta è nel programma; «stesso nome» se nel programma c'è un file con lo stesso nome ma non si può dire che sia lo stesso (da guardare). I file con una data prima del {DATA_PARTENZA.split("-").reverse().join("/")} sono «storico». Se il controllo ha più di {GIORNI_CONTROLLO_VECCHIO} giorni, in alto compare l'avviso.</div>
    {lavoro && <div style={{ fontSize: 13, background: "#EAF2FB", padding: 6, marginBottom: 6 }}>⏳ {lavoro}</div>}
    {[errore, erroreLettura].filter(Boolean).map(e => <div key={e} style={{ fontSize: 13, background: "#FBE1DE", padding: 6, marginBottom: 6 }}>⚠️ {e}</div>)}
    {!f?.ultimo ? (erroreLettura ? null : <div style={{ fontSize: 13 }}>La cartella non è ancora stata controllata.</div>) : <>
      <div style={{ fontSize: 13, marginBottom: 6 }}>Ultimo controllo: {dataIt(dataRoma(f.ultimo.eseguito_il))} alle {String(new Date(f.ultimo.eseguito_il).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }))}, di {f.ultimo.eseguito_da}: {f.ultimo.file_trovati} PDF — da caricare <b>{f.daCaricare.length}</b>, stesso nome {f.stessoNome.length}, caricati {f.per["Caricato"].length}, storico {f.per["Storico"].length}, non da caricare {f.per["Non da caricare"].length}.</div>
      {[...f.daCaricare, ...f.stessoNome].length > 0 && <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr style={{ background: C.primary, color: "#fff" }}>{["File nella cartella QUIETANZE F24", "Esito", "Perché", ""].map(h => <th key={h} style={{ padding: "5px 8px", fontSize: 11.5, textAlign: "left" }}>{h}</th>)}</tr></thead>
        <tbody>{[...f.daCaricare, ...f.stessoNome].map(r => <tr key={r.percorso} style={{ background: r.esito === "Da caricare" ? "#FBE1DE" : "#FFF1DC" }}>
          <td style={{ ...cella, fontFamily: "monospace", fontSize: 11.5 }}>{r.percorso}</td><td style={cella}><b>{r.esito}</b></td><td style={cella}>{r.motivo || ""}</td>
          <td style={{ ...cella, whiteSpace: "nowrap" }}><input style={{ ...input, height: 28, width: 220 }} placeholder="motivo, per esempio: è una lettera" value={motivo[r.percorso] || ""} onChange={e => setMotivo(x => ({ ...x, [r.percorso]: e.target.value }))} />{" "}
            <button style={{ ...btn(false), height: 28 }} onClick={() => nonDaCaricare(r.percorso)}>Non è da caricare</button></td>
        </tr>)}</tbody></table></div>}
    </>}
    {a && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>F24 da pagare: scaduti {a.pagare.scaduti.length}, entro {GIORNI_PREAVVISO} giorni {a.pagare.inScadenza.length}; a saldo zero da presentare {a.pagare.saldoZeroDaPresentare.length}; pagati secondo l'estratto, da confermare {a.pagare.pagatiDaConfermare.length}.</div>}
  </div>;
}
