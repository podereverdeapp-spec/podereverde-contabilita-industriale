// Versione 375 (12/11/2026, Coglione): fatture d'acquisto CONTESTATE e IN ATTESA DI NOTA DI CREDITO.
// Decisioni del Dott. Bizzarri del 12/11/2026 ore 18:12–18:47 (claude/progetto_caparre_preventivi_contestate.md, sezione 3-bis):
//  a) Contestata: pagamento bloccato (lo blocca il database), motivo obbligatorio, mail al fornitore facoltativa,
//     motivi in rosso nel dettaglio della fattura, «contestata» dovunque la si consulti;
//  b) In attesa di nota di credito: pagabile anche in parte; a ogni pagamento la mail al fornitore è obbligatoria e si
//     compone da sola; senza mail il pagamento non si registra, salvo forzatura con il motivo (versione 372).
// Qui: lettura degli stati, etichetta, riquadro del dettaglio con i tasti, testo della mail, spedizione della mail.
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C, FONT } from "./style";

export const CONTESTATA = "Contestata";
export const ATTESA_NC = "In attesa di nota di credito";
export const DOC_MAIL_NC = "Fattura in attesa di nota di credito";
export const DOC_MAIL_CONTESTATA = "Fattura contestata";

// importo scritto a mano: «1.220,50», «220,5», «220.50» (un solo punto con 1-2 cifre dopo = decimali)
export function numeroScritto(t) {
  const x = String(t || "").trim().replace(/\s|€/g, "");
  if (!x) return NaN;
  const n = x.includes(",") ? x.replace(/\./g, "").replace(",", ".") : /^\d+\.\d{1,2}$/.test(x) ? x : x.replace(/\./g, "");
  return /^-?\d+(\.\d+)?$/.test(n) ? Number(n) : NaN;
}
// € 1.000,00 (con il punto delle migliaia anche sotto 10.000: lo scrive così una lettera)
const euro = (n) => { const [i, d] = Math.abs(Number(n || 0)).toFixed(2).split("."); return `${Number(n) < 0 ? "-" : ""}€ ${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`; };
const dataIt = (d) => d ? new Date(d).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "";

// stato aperto delle fatture indicate: { fattura_id: riga di ci_v_fatture_contestate }
export async function leggiStatiFatture(ids) {
  const lista = [...new Set((ids || []).filter(Boolean).map(Number))];
  const mappa = {};
  for (let i = 0; i < lista.length; i += 200) {
    const { data, error } = await supabase.from("ci_v_fatture_contestate").select("*").in("fattura_id", lista.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const r of data || []) mappa[r.fattura_id] = { ...r, noteArrivate: [] };
  }
  // avviso (Demaria 14:10): note di credito (TD04) dello stesso fornitore arrivate dopo la messa «in attesa»
  const attese = Object.values(mappa).filter(r => r.stato === ATTESA_NC && r.fornitore_id);
  const fornitori = [...new Set(attese.map(r => r.fornitore_id))];
  if (fornitori.length) {
    const { data, error } = await supabase.from("ci_fatture").select("id, numero, data, totale_lordo, fornitore_id, created_at").in("fornitore_id", fornitori).eq("tipo_documento", "TD04");
    if (error) throw new Error(error.message);
    for (const r of attese) r.noteArrivate = (data || []).filter(n => n.fornitore_id === r.fornitore_id && new Date(n.created_at) >= new Date(r.aperta_il));
  }
  return mappa;
}

// hook: stati delle fatture mostrate in una pagina (si ricaricano quando cambia l'elenco o «versione»)
export function useStatiFatture(ids, versione = 0) {
  const chiave = [...new Set((ids || []).filter(Boolean).map(Number))].sort((a, b) => a - b).join(",");
  const [stati, setStati] = useState({});
  const [errore, setErrore] = useState("");
  useEffect(() => {
    let vivo = true;
    if (!chiave) { setStati({}); return; }
    leggiStatiFatture(chiave.split(",")).then(m => { if (vivo) { setStati(m); setErrore(""); } })
      .catch(e => { if (vivo) setErrore(e.message); });
    return () => { vivo = false; };
  }, [chiave, versione]);
  return [stati, errore];
}

export function EtichettaStatoFattura({ stato, piccola }) {
  if (!stato) return null;
  const contestata = stato.stato === CONTESTATA;
  return (
    <span data-stato-fattura={stato.stato} title={stato.motivo}
      style={{ display: "inline-block", background: contestata ? "#C0392B" : "#D4880F", color: "#fff", borderRadius: 6, padding: piccola ? "1px 6px" : "2px 8px", fontSize: piccola ? 10.5 : 11.5, fontWeight: 800, marginRight: 6, whiteSpace: "nowrap" }}>
      {contestata ? "⛔ CONTESTATA" : "⏳ IN ATTESA DI NOTA DI CREDITO"}{!contestata && stato.noteArrivate?.length > 0 && " · 📩 nota di credito arrivata"}{stato.avvisi?.length > 0 && " · ⚠️ PAGATA"}
    </span>
  );
}

// testo della mail per un pagamento di una fattura in attesa di nota di credito (decisione delle 18:16 e 18:45).
// DEVE restare uguale a ci_testo_mail_nota_credito() del database: il database accetta la mail solo se comincia così.
// la data si scrive spezzando «AAAA-MM-GG» (uguale al database, non dipende dal browser: secondo ricontrollo, difetto 1)
const dataLettera = (d) => String(d || "").slice(0, 10).split("-").reverse().join("/");
export function testoMailNotaCredito({ numero, data, pagato, notaCredito }) {
  return `Come da accordi abbiamo provveduto al saldo della Vs. fornitura relativa alla Vs. fattura n. ${numero ?? ""} del ${dataLettera(data)}, per l'importo di ${euro(pagato)} (IVA inclusa), e rimaniamo in attesa della Vs. nota di credito di ${euro(notaCredito)} (IVA inclusa).`;
}

function nuovoCodice() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

// manda una mail al fornitore della fattura (funzione del server «spedisci-mail»): ritorna l'id della riga del registro
export async function mandaMailFornitore({ fornitoreId, fatturaId, documentoTipo, oggetto, testo, sezione }) {
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  let firma = "";
  if (uid) {
    const { data: f } = await supabase.from("ci_firme_mail").select("firma").eq("utente", uid).maybeSingle();
    firma = f?.firma || "";
  }
  const { data, error } = await supabase.functions.invoke("spedisci-mail", {
    body: { tipo: "fornitore", id: fornitoreId, oggetto, testo, firma, allegati: [], codice_richiesta: nuovoCodice(), documento_tipo: documentoTipo, documento_id: fatturaId, sezione },
  });
  if (error) {
    let messaggio = error.message;
    try { const j = await error.context.json(); if (j?.errore || j?.error) messaggio = j.errore || j.error; } catch { /* risposta senza testo */ }
    throw new Error(`Mail non mandata: ${messaggio}`);
  }
  if (!data?.ok || !data?.riga) throw new Error(`Mail non mandata: ${data?.errore || "risposta non valida"}`);
  return data.riga;
}

const bottone = (colore, pieno = true) => ({ background: pieno ? colore : "transparent", color: pieno ? "#fff" : colore, border: `1.5px solid ${colore}`, borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT });
const campo = { width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: FONT };

// Riquadro del dettaglio della fattura: lo stato con i motivi in rosso e, per chi gestisce i conti, i tasti
export function RiquadroStatoFattura({ fattura, stato, onCambiato }) {
  const [puo, setPuo] = useState(false);
  const [puoForzare, setPuoForzare] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [pagato, setPagato] = useState("");
  const [motivoForza, setMotivoForza] = useState("");
  const [modulo, setModulo] = useState(null); // "Contestata" | "In attesa di nota di credito" | "chiudi"
  const [motivo, setMotivo] = useState("");
  const [nc, setNc] = useState("");
  const [esito, setEsito] = useState("Liberata");
  const [mail, setMail] = useState(false);
  const [testoMail, setTestoMail] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const [messaggio, setMessaggio] = useState(null);
  useEffect(() => {
    supabase.rpc("ci_puo_gestire_conti").then(({ data }) => setPuo(data === true));
    supabase.rpc("ci_puo_forzare_pagamento_senza_mail").then(({ data }) => setPuoForzare(data === true));
    supabase.rpc("ci_e_admin").then(({ data }) => setAdmin(data === true));
  }, []);
  if (!fattura?.fornitore_id) return null; // solo fatture d'acquisto

  function apri(m) {
    setModulo(m); setMotivo(""); setNc(""); setEsito("Liberata"); setMail(false); setMessaggio(null); setPagato(""); setMotivoForza("");
    setTestoMail(`Vi comunichiamo che la Vs. fattura n. ${fattura.numero} del ${dataIt(fattura.data)} è da noi contestata per il seguente motivo: `);
  }
  async function conferma() {
    setLavoro(true); setMessaggio(null);
    try {
      if (modulo === "paga" || modulo === "forza") {
        const importo = Math.round(numeroScritto(pagato) * 100) / 100;
        if (!(importo > 0)) throw new Error("Scrivere l'importo pagato (IVA inclusa)");
        if (modulo === "paga") {
          const riga = await mandaMailFornitore({ fornitoreId: fattura.fornitore_id, fatturaId: fattura.id, documentoTipo: DOC_MAIL_NC, sezione: "Fattura in attesa di nota di credito",
            oggetto: `${Number(stato.resto_mail_da_rettificare) > 0.005 ? "RETTIFICA – " : ""}Saldo fattura n. ${stato.numero ?? ""} del ${dataLettera(stato.data)} – in attesa della Vs. nota di credito`,
            testo: testoMailNotaCredito({ numero: stato.numero, data: stato.data, pagato: importo, notaCredito: stato.nota_credito_attesa }) });
          const { error } = await supabase.rpc("ci_fattura_nc_mail_mandata", { p_fattura: fattura.id, p_importo: importo, p_comunicazione: riga });
          if (error) throw new Error(`La mail è partita, ma il permesso di pagare non è registrato: ${error.message}`);
        } else {
          const { error } = await supabase.rpc("ci_fattura_nc_forza", { p_fattura: fattura.id, p_importo: importo, p_motivo: motivoForza.trim() });
          if (error) throw new Error(error.message);
        }
        setModulo(null); setMessaggio({ ok: true, testo: `Fatto: ora si può registrare il pagamento di ${euro(importo)} (Gestione incassi e pagamenti → Pagamento fatture, oppure Conferma dei movimenti).` }); onCambiato?.();
        setLavoro(false); return;
      }
      if (modulo === "chiudi") {
        const { error } = await supabase.rpc("ci_fattura_chiudi_contestazione", { p_contestazione: stato.contestazione_id, p_esito: esito, p_motivo: motivo.trim() || null });
        if (error) throw new Error(error.message);
      } else {
        const importoNc = modulo === ATTESA_NC ? numeroScritto(nc) : null;
        const { error } = await supabase.rpc("ci_fattura_contesta", { p_fattura: fattura.id, p_stato: modulo, p_motivo: motivo.trim(), p_nota_credito: importoNc });
        if (error) throw new Error(error.message);
        if (modulo === CONTESTATA && mail) {
          try {
            await mandaMailFornitore({ fornitoreId: fattura.fornitore_id, fatturaId: fattura.id, documentoTipo: DOC_MAIL_CONTESTATA, sezione: "Fattura contestata",
              oggetto: `Contestazione fattura n. ${fattura.numero} del ${dataIt(fattura.data)}`, testo: testoMail.trim() });
          } catch (e) { setModulo(null); setMessaggio({ ok: false, testo: `La fattura è segnata «Contestata», ma ${e.message}` }); onCambiato?.(); setLavoro(false); return; }
        }
      }
      setModulo(null); setMessaggio({ ok: true, testo: "Fatto." }); onCambiato?.();
    } catch (e) { setMessaggio({ ok: false, testo: e.message }); }
    setLavoro(false);
  }

  const contestata = stato?.stato === CONTESTATA;
  return (
    <div data-riquadro-stato="1" style={{ marginBottom: 10 }}>
      {stato && (
        <div style={{ background: contestata ? "#FDECEA" : "#FFF6E5", border: `2px solid ${contestata ? "#C0392B" : "#D4880F"}`, color: contestata ? "#8B1E14" : "#7A4B00", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
          <b>{contestata ? "⛔ FATTURA CONTESTATA — il pagamento è bloccato" : "⏳ IN ATTESA DI NOTA DI CREDITO — pagabile, ma a ogni pagamento parte la mail al fornitore"}</b>
          <div style={{ color: "#C0392B", fontWeight: 700, marginTop: 4 }}>Motivo: {stato.motivo}</div>
          {!contestata && <div style={{ marginTop: 2 }}>Nota di credito attesa: <b>{euro(stato.nota_credito_attesa)}</b> (IVA inclusa) · pagato con la mail o con la forzatura: {euro(stato.pagato_con_mail_o_forzatura)}</div>}
          <div style={{ fontSize: 11.5, marginTop: 2 }}>Dal {dataIt(stato.aperta_il)}</div>
          {/* Versione 375 (decisione del 13/11 ore 09:14): pagamento già avvenuto, registrato con l'avviso al Dottore */}
          {(stato.avvisi || []).map(a => (
            <div key={a.id} data-avviso-pagata="1" style={{ marginTop: 6, background: "#C0392B", color: "#fff", borderRadius: 6, padding: "6px 8px", fontWeight: 700, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span>⚠️ {a.genere}: {euro(a.importo)} il {dataIt(a.creato_il)}</span>
              {admin && <button onClick={async () => { const { error } = await supabase.rpc("ci_fattura_avviso_letto", { p_avviso: a.id, p_importo: a.importo }); if (error) setMessaggio({ ok: false, testo: error.message }); else onCambiato?.(); }}
                style={{ background: "#fff", color: "#C0392B", border: "none", borderRadius: 6, padding: "3px 10px", fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>Letto</button>}
            </div>
          ))}
          {!contestata && stato.noteArrivate?.length > 0 && (
            <div data-nota-arrivata="1" style={{ marginTop: 6, background: "#E6F2E8", color: "#1E5E2E", borderRadius: 6, padding: "6px 8px", fontWeight: 700 }}>
              📩 È arrivata dallo SdI una nota di credito dello stesso fornitore: {stato.noteArrivate.map(n => `n. ${n.numero} del ${dataIt(n.data)}, ${euro(Math.abs(n.totale_lordo))}`).join("; ")} (attesa {euro(stato.nota_credito_attesa)}). Se è quella, chiuda l'attesa con «Nota di credito arrivata».
            </div>
          )}
        </div>
      )}
      {puo && !modulo && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {!contestata && <button onClick={() => apri(CONTESTATA)} style={bottone("#C0392B", false)}>⛔ Contesta</button>}
          {stato?.stato !== ATTESA_NC && <button onClick={() => apri(ATTESA_NC)} style={bottone("#D4880F", false)}>⏳ In attesa di nota di credito</button>}
          {stato && <button onClick={() => apri("chiudi")} style={bottone(C.green, false)}>✅ {contestata ? "Libera la fattura" : "Chiudi l'attesa"}</button>}
          {stato?.stato === ATTESA_NC && <button onClick={() => apri("paga")} style={bottone(C.primary)}>💶 Prepara un pagamento (manda la mail)</button>}
          {stato?.stato === ATTESA_NC && puoForzare && <button onClick={() => apri("forza")} style={bottone("#7A4B00", false)}>⚠️ Pagamento senza mail (forzatura)</button>}
        </div>
      )}
      {modulo && (
        <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 8, padding: 10, marginTop: 8, background: "#fff" }}>
          {modulo === "paga" || modulo === "forza" ? (<>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>{modulo === "paga" ? "Prima del pagamento: la mail al fornitore (obbligatoria)" : "Pagamento senza mail: scriva il motivo"}</div>
            {Number(stato.resto_da_sostituire) > 0.005 && <div style={{ color: "#7A4B00", fontSize: 12.5, marginBottom: 6 }}>C'è già un pagamento preparato (con la mail o con la forzatura) e non ancora fatto, o fatto solo in parte, per <b>{euro(stato.resto_da_sostituire)}</b>: questo lo <b>sostituisce</b>{modulo === "paga" && Number(stato.resto_mail_da_rettificare) > 0.005 ? " (al fornitore parte una mail di rettifica)." : "."}</div>}
            <input value={pagato} onChange={e => setPagato(e.target.value)} placeholder="Importo che si paga, IVA inclusa (obbligatorio)" aria-label="Importo pagato" style={{ ...campo, marginBottom: 6 }} />
            {modulo === "paga" ? (
              <div data-anteprima-mail="1" style={{ background: "#F6F1E8", borderRadius: 8, padding: "8px 10px", fontSize: 12.5 }}>
                <b>Mail che parte al fornitore:</b><br />{numeroScritto(pagato) > 0 ? testoMailNotaCredito({ numero: stato.numero, data: stato.data, pagato: Math.round(numeroScritto(pagato) * 100) / 100, notaCredito: stato.nota_credito_attesa }) : "(scriva l'importo)"}
              </div>
            ) : <input value={motivoForza} onChange={e => setMotivoForza(e.target.value)} placeholder="Perché non si manda la mail (obbligatorio)" aria-label="Motivo della forzatura" style={campo} />}
          </>) : modulo === "chiudi" ? (<>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Come è finita?</div>
            <select value={esito} onChange={e => setEsito(e.target.value)} style={{ ...campo, marginBottom: 6 }}>
              <option>Liberata</option><option>Nota di credito arrivata</option><option>Pagata dopo chiarimento</option><option>Pagata in parte</option>
            </select>
            <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Note (facoltative)" style={campo} />
          </>) : (<>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>{modulo === CONTESTATA ? "Contesta la fattura (il pagamento si blocca)" : "In attesa di nota di credito (resta pagabile)"}</div>
            <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (obbligatorio)" aria-label="Motivo" style={{ ...campo, marginBottom: 6 }} />
            {modulo === ATTESA_NC && <input value={nc} onChange={e => setNc(e.target.value)} placeholder="Importo della nota di credito attesa, IVA inclusa (obbligatorio)" aria-label="Nota di credito attesa" style={campo} />}
            {modulo === CONTESTATA && (<>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, fontSize: 13 }}><input type="checkbox" checked={mail} onChange={() => setMail(x => !x)} /> Scrivi anche al fornitore (facoltativo)</label>
              {mail && <textarea value={testoMail} onChange={e => setTestoMail(e.target.value)} rows={4} aria-label="Testo della mail" style={{ ...campo, marginTop: 6 }} />}
            </>)}
          </>)}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={conferma} disabled={lavoro || ((modulo === "paga" || modulo === "forza") ? !(numeroScritto(pagato) > 0) || (modulo === "forza" && !motivoForza.trim()) : modulo !== "chiudi" && (!motivo.trim() || (modulo === ATTESA_NC && !(numeroScritto(nc) > 0))))} style={bottone(C.primary)}>{lavoro ? "…" : modulo === "paga" ? "✉️ Manda la mail" : "Conferma"}</button>
            <button onClick={() => setModulo(null)} disabled={lavoro} style={bottone(C.muted, false)}>Annulla</button>
          </div>
        </div>
      )}
      {messaggio && <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: messaggio.ok ? C.green : C.red }}>{messaggio.testo}</div>}
    </div>
  );
}
