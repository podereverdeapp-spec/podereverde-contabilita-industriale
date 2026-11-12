import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda } from "./stileAruba";
import { quando, nuovoCodiceRichiesta, LIMITE_ALLEGATI, CASELLA_COMUNICAZIONI, FIRMA_PREDEFINITA, INTESTAZIONE_MAIL, PIEDE_MAIL } from "./anagrafiche";

// Versione 369 — «✏️ Scrivi» e «↩️ Rispondi» nella pagina «Posta» (ordine del Dott. Bizzarri dell'11/11/2026 ore 21:41–21:45
// e del 12/11/2026 ore 09:36).
// - Il destinatario si sceglie da un elenco: clienti e fornitori con l'email, persone dell'elenco dei report (destinatari_email,
//   anche «spente»: decisione delle 10:30) e la RUBRICA DELLA POSTA (ci_rubrica_posta, decisione delle 10:34–10:38): chi non c'è
//   si aggiunge con «➕ Nuovo destinatario» (nome, email, motivo; chi e quando li scrive il database). Avviso sempre visibile.
//   Nessun indirizzo scritto a mano (regola di sicurezza del 03/11). Con «Rispondi» il destinatario è il mittente della mail.
// - La mail parte subito dalla casella podereverdeapp@gmail.com (funzione del server «spedisci-mail», versione 2), con
//   intestazione, logo e piè di pagina di Podere Verde, e resta nel Registro delle Comunicazioni con chi l'ha spedita.
// - Firma: ognuno ha la sua (tabella ci_firme_mail); se non l'ha, «Amministrazione». Il nome del Dottore compare solo se lo scrive lui.
// - Rispondere a un mittente sconosciuto (non cliente, non fornitore, non nell'elenco) chiede una conferma esplicita.
// - Dopo il ricontrollo indipendente: mittente riconosciuto anche per PEC o collegamento della mail; la finestra non si chiude
//   durante l'invio e chiede prima di perdere il testo; firma con il nome del Dottore solo sua; massimo 10 allegati.
// Versione 371 (12/11/2026, ordine del Dott. Bizzarri delle 13:38–13:42): BOZZE. «💾 Salva come bozza» salva oggetto, testo, firma e
// destinatario (o la mail a cui si risponde) nella tabella ci_bozze_mail, senza mandare: ognuno vede solo le proprie. Una bozza si
// riapre dalla scheda «📝 Bozze», si corregge, si manda (e allora esce dalle Bozze) o si elimina. Gli allegati non si salvano.
// La conferma dell'invio e quella della chiusura sono DENTRO la pagina, non più finestre del browser (window.confirm): nel riquadro
// del browser di Claude quelle finestre si chiudevano da sole con «no» e la mail non partiva (fatti del 12/11 ore 13:00 e 13:30).
// Dopo il ricontrollo indipendente: la bozza conserva il codice della richiesta, così una bozza già partita (risposta persa per strada)
// non parte una seconda volta riaprendola; durante l'invio non si chiude; il destinatario non riconosciuto non si cancella salvando.

const minuscola = x => String(x || "").trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // come la funzione del server: un solo indirizzo valido
const NOME_DOTTORE = /filippo|\b(dott|dottor|dottore|dr|ing|avv|rag|f)\b\.?\s*bizzarri/i; // come la funzione del server
const MAX_ALLEGATI = 10;
const MAX_TESTO = 100000; // come la tabella ci_bozze_mail
const ora = () => new Date().toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
export const oggettoRisposta = o => { const t = String(o || "").trim(); return (/^(r|re|ri)\s*:/i.test(t) ? t : `R: ${t || "(senza oggetto)"}`).slice(0, 200); };
export const testoCitato = c => `\n\n----- Il ${quando(c.data_ora)} ${c.indirizzo} ha scritto: -----\n${String(c.testo || "").split("\n").map(r => `> ${r}`).join("\n")}`;

// Elenco dei destinatari possibili, ordinato per nome: chiave «cliente:12», «fornitore:9», «persona:14», «contatto:3»
export function elencoDestinatari(clienti, fornitori, persone, contatti) {
  const v = [];
  for (const c of clienti || []) if (EMAIL.test(minuscola(c.email))) v.push({ chiave: `cliente:${c.id}`, tipo: "cliente", id: c.id, nome: c.nome, email: minuscola(c.email) });
  for (const f of fornitori || []) if (EMAIL.test(minuscola(f.email))) v.push({ chiave: `fornitore:${f.id}`, tipo: "fornitore", id: f.id, nome: f.nome, email: minuscola(f.email) });
  for (const p of persone || []) if (EMAIL.test(minuscola(p.email))) v.push({ chiave: `persona:${p.id}`, tipo: "persona", id: p.id, nome: String(p.nome || "").trim(), email: minuscola(p.email), ruolo: p.ruolo, spenta: p.attivo !== true });
  for (const k of contatti || []) if (EMAIL.test(minuscola(k.email))) v.push({ chiave: `contatto:${k.id}`, tipo: "contatto", id: k.id, nome: String(k.nome || "").trim(), email: minuscola(k.email), ruolo: k.motivo });
  return v.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "it"));
}
// Chi è il mittente di una mail ricevuta: cliente o fornitore (email, PEC o collegamento della mail), persona dell'elenco, rubrica.
// Nessuno = sconosciuto. Stessa regola della funzione del server.
export function chiE(c, destinatari, clienti, fornitori) {
  const m = minuscola(c.indirizzo);
  const v = destinatari.filter(d => d.email === m);
  const gia = new Set(v.map(d => d.chiave));
  const aggiungi = (tipo, r) => { const k = `${tipo}:${r.id}`; if (!gia.has(k)) { gia.add(k); v.push({ chiave: k, tipo, id: r.id, nome: r.nome, email: m }); } };
  for (const r of clienti || []) if (r.id === c.cliente_id || (m && minuscola(r.pec) === m)) aggiungi("cliente", r);
  for (const r of fornitori || []) if (r.id === c.fornitore_id || (m && minuscola(r.pec) === m)) aggiungi("fornitore", r);
  return v;
}

async function spedisci({ tipo, id, oggetto, testo, firma, files, codiceRichiesta, confermaSconosciuto }) {
  const totale = files.reduce((s, f) => s + f.size, 0);
  if (totale > LIMITE_ALLEGATI) throw new Error(`Gli allegati pesano ${(totale / 1048576).toFixed(1)} MB: il massimo è 8 MB.`);
  const allegati = [];
  for (const f of files) {
    const b = new Uint8Array(await f.arrayBuffer());
    let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    allegati.push({ nome: f.name, tipo: f.type || "application/octet-stream", contenuto: btoa(s) });
  }
  const { data, error } = await supabase.functions.invoke("spedisci-mail", {
    body: { tipo, id, oggetto, testo, firma, allegati, codice_richiesta: codiceRichiesta, conferma_sconosciuto: confermaSconosciuto === true },
  });
  if (error) {
    let messaggio = error.message;
    let doppione = false, riga = null;
    try { const j = await error.context.json(); if (j?.errore || j?.error) messaggio = j.errore || j.error; doppione = j?.doppione === true; riga = j?.riga || null; } catch { /* risposta senza testo */ }
    const e = new Error(`Mail non mandata: ${messaggio}`); e.doppione = doppione; e.riga = riga; throw e;
  }
  if (!data?.ok) throw new Error(`Mail non mandata: ${data?.errore || data?.error || "risposta non valida"}`);
  return data;
}

export default function ScriviMail({ risposta, bozza, clienti, fornitori, bloccati, onChiudi, onSpedita, onStato, onBozzaSalvata, chiusuraChiesta, onChiudiDavvero, onAnnullaChiusura }) {
  const [persone, setPersone] = useState([]);
  const [contatti, setContatti] = useState([]);
  const [nuovo, setNuovo] = useState(null); // null | { nome, email, motivo, avviso, lavoro }
  const [scelto, setScelto] = useState(bozza?.destinatario || "");
  const [filtro, setFiltro] = useState("");
  const [oggetto, setOggetto] = useState(bozza ? bozza.oggetto || "" : risposta ? oggettoRisposta(risposta.oggetto) : "");
  const [testo, setTesto] = useState(bozza ? bozza.testo || "" : risposta ? testoCitato(risposta) : "");
  const [firma, setFirma] = useState(bozza?.firma || FIRMA_PREDEFINITA);
  // Bozza: quella aperta (o salvata in questa finestra) e la fotografia di ciò che è salvato, per sapere se ci sono modifiche
  const [bozzaId, setBozzaId] = useState(bozza?.id || null);
  const [salvato, setSalvato] = useState(bozza ? { oggetto: bozza.oggetto || "", testo: bozza.testo || "", firma: bozza.firma || FIRMA_PREDEFINITA, scelto: bozza.destinatario || "" } : null);
  const [salvataggio, setSalvataggio] = useState(false);
  const [notaBozza, setNotaBozza] = useState(bozza ? `Bozza aperta: salvata l'ultima volta ${quando(bozza.aggiornata_il)}. Gli allegati non si salvano nelle bozze.` : "");
  const [confermaInvio, setConfermaInvio] = useState(false);
  const [elenchiLetti, setElenchiLetti] = useState(false);
  const [giaPartita, setGiaPartita] = useState(false); // la bozza risultava già spedita: non si salva e non si rimanda
  const [firmaSalvata, setFirmaSalvata] = useState(null);
  const [ricorda, setRicorda] = useState(true);
  const [files, setFiles] = useState([]);
  const [confermaSconosciuto, setConfermaSconosciuto] = useState(false);
  const [invio, setInvio] = useState(false);
  const [avviso, setAvviso] = useState("");
  // Il codice della richiesta impedisce il doppio invio: per una bozza è quello salvato con la bozza (versione 371)
  const [codiceRichiesta, setCodiceRichiesta] = useState(() => bozza?.codice_richiesta || nuovoCodiceRichiesta());
  const [utente, setUtente] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [{ data: p, error: eP }, { data: k, error: eK }] = await Promise.all([
        supabase.from("destinatari_email").select("id, nome, email, ruolo, attivo").order("nome"),
        supabase.from("ci_rubrica_posta").select("id, nome, email, motivo").order("nome"),
      ]);
      if (vivo) {
        if (eP) setAvviso(`Elenco delle persone non letto: ${eP.message}`); else setPersone(p || []);
        if (eK) setAvviso(a => a || `Rubrica della Posta non letta: ${eK.message}`); else setContatti(k || []);
        setElenchiLetti(!eP && !eK);
      }
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id || null;
      if (!vivo) return;
      setUtente(uid);
      if (uid) {
        const { data: f, error: eF } = await supabase.from("ci_firme_mail").select("firma").eq("utente", uid).maybeSingle();
        if (!vivo) return;
        if (eF) setAvviso(a => a || `La firma salvata non si legge (${eF.message}): si usa «${FIRMA_PREDEFINITA}».`);
        else if (f?.firma) { if (!bozza) setFirma(f.firma); setFirmaSalvata(f.firma); }
      }
    })();
    return () => { vivo = false; };
  }, []);

  const destinatari = useMemo(() => elencoDestinatari(clienti, fornitori, persone, contatti), [clienti, fornitori, persone, contatti]);
  const visibili = useMemo(() => { const q = minuscola(filtro); return q ? destinatari.filter(d => minuscola(d.nome).includes(q) || d.email.includes(q)) : destinatari; }, [destinatari, filtro]);
  const dest = destinatari.find(d => d.chiave === scelto) || null;
  const mittente = risposta ? chiE(risposta, destinatari, clienti, fornitori) : [];
  const sconosciuto = !!risposta && !mittente.length;
  const a = risposta ? minuscola(risposta.indirizzo) : dest?.email || "";
  const peso = files.reduce((s, f) => s + f.size, 0);
  const firmaUsata = firma.trim() || FIRMA_PREDEFINITA;
  const nomeTipo = { cliente: "🤝 cliente", fornitore: "🏢 fornitore", persona: "👤 persona", contatto: "📇 rubrica" };

  // «➕ Nuovo destinatario»: entra nella rubrica della Posta e si sceglie subito
  async function aggiungiContatto() {
    const nome = String(nuovo.nome || "").trim(), email = minuscola(nuovo.email), motivo = String(nuovo.motivo || "").trim();
    const ferma = avviso => setNuovo(x => ({ ...x, avviso, lavoro: false }));
    if (nome.length < 2) return ferma("Scrivere il nome (almeno 2 lettere).");
    if (!EMAIL.test(email) || email.length > 200) return ferma("L'indirizzo non è scritto bene: un solo indirizzo, per esempio nome@dominio.it.");
    if (motivo.length < 3) return ferma("Scrivere il motivo: chi è e perché lo si contatta.");
    const dominio = email.split("@").pop();
    const spam = (bloccati || []).find(b => (b.genere === "dominio" ? minuscola(b.valore) === dominio : minuscola(b.valore) === email));
    if (spam) return ferma(`L'indirizzo è bloccato come spam (${spam.genere === "dominio" ? `tutto il dominio @${dominio}` : email}): non si aggiunge. Si sblocca dalla scheda «Spam: mittenti bloccati».`);
    const pec = [...(clienti || []).map(r => ["cliente", r]), ...(fornitori || []).map(r => ["fornitore", r])].find(([, r]) => minuscola(r.pec) === email);
    if (pec) return ferma(`L'indirizzo è la PEC del ${pec[0]} ${pec[1].nome}: dal programma non si scrive alle PEC (regola del 03/11). Usare l'email della scheda.`);
    const gia = destinatari.find(d => d.email === email);
    if (gia) { setScelto(gia.chiave); setFiltro(""); return ferma(`L'indirizzo è già nell'elenco (${nomeTipo[gia.tipo]} · ${gia.nome}): l'ho scelto.`); }
    setNuovo(x => ({ ...x, avviso: "", lavoro: true }));
    const { data, error } = await supabase.from("ci_rubrica_posta").insert([{ nome, email, motivo }]).select("id, nome, email, motivo").single();
    if (error) return ferma(String(error.code) === "23505" ? "L'indirizzo è già nella rubrica: cercarlo nell'elenco." : `Non aggiunto alla rubrica: ${error.message}`);
    setContatti(v => [...v, data]); setScelto(`contatto:${data.id}`); setFiltro(""); setNuovo(null);
  }

  // Controlli prima dell'invio; se è tutto in ordine compare la conferma DENTRO la pagina (non una finestra del browser)
  function manda() {
    if (invio) return;
    setAvviso("");
    if (!risposta && !dest) { setAvviso("Scegliere il destinatario dall'elenco."); return; }
    if (!oggetto.trim() || !testo.trim()) { setAvviso("Scrivere l'oggetto e il testo."); return; }
    if (risposta && !testo.split("\n----- Il ")[0].trim()) { setAvviso("Scrivere la risposta sopra il testo citato."); return; }
    if (peso > LIMITE_ALLEGATI) { setAvviso("Gli allegati superano 8 MB."); return; }
    if (files.length > MAX_ALLEGATI) { setAvviso(`Al massimo ${MAX_ALLEGATI} allegati.`); return; }
    if (NOME_DOTTORE.test(firmaUsata) && utente && utente !== "a916b8a1-fdd5-440a-ae4b-7023b77058f1") { setAvviso("La firma con il nome del Dott. Bizzarri la può usare solo lui: scrivere la propria firma."); return; }
    if (sconosciuto && !confermaSconosciuto) { setAvviso("Il mittente è sconosciuto: per rispondere va spuntata la conferma."); return; }
    setConfermaInvio(true);
  }

  async function eseguiInvio() {
    if (invio) return;
    setConfermaInvio(false);
    onAnnullaChiusura?.(); // una domanda di chiusura rimasta aperta sparisce: durante l'invio la finestra non si chiude
    setInvio(true);
    try {
      const r = await spedisci({ tipo: risposta ? "risposta" : dest.tipo, id: risposta ? risposta.id : dest.id, oggetto: oggetto.trim(), testo, firma: firmaUsata, files, codiceRichiesta, confermaSconosciuto: sconosciuto && confermaSconosciuto });
      setCodiceRichiesta(nuovoCodiceRichiesta());
      let nota = "";
      if (ricorda && utente && firmaUsata !== (firmaSalvata ?? FIRMA_PREDEFINITA)) { // si ricorda solo una firma diversa da quella che già comparirebbe
        const { error } = await supabase.from("ci_firme_mail").upsert({ utente, firma: firmaUsata, aggiornata_il: new Date().toISOString() }, { onConflict: "utente" });
        nota = error ? ` La firma non è stata ricordata: ${error.message}.` : " La firma è ricordata per le prossime mail.";
      }
      if (bozzaId) { // mandata: la bozza esce dalle Bozze
        const { error } = await supabase.from("ci_bozze_mail").delete().eq("id", bozzaId);
        nota += error ? ` ⚠️ La bozza non è stata tolta dalle Bozze (${error.message}): eliminarla a mano per non mandarla due volte.` : " La bozza è uscita dalle Bozze.";
      }
      setInvio(false);
      onSpedita?.(r, `✓ Mail mandata a ${r.destinatario} da ${r.mittente || CASELLA_COMUNICAZIONI}.${nota}`);
    } catch (e) {
      let nota = "";
      if (e.doppione && bozzaId && e.riga?.esito === "inviata") { // la bozza era già partita (risposta persa per strada): esce dalle Bozze
        const { error } = await supabase.from("ci_bozze_mail").delete().eq("id", bozzaId);
        if (!error) { setBozzaId(null); setSalvato(null); setNotaBozza(""); setGiaPartita(true); onBozzaSalvata?.(); nota = " La bozza è uscita dalle Bozze: chiudere la finestra."; }
        else nota = ` ⚠️ La bozza non è stata tolta dalle Bozze (${error.message}): eliminarla a mano.`;
      }
      setInvio(false);
      setAvviso(e.doppione ? `⚠️ Questa mail risulta già spedita o in spedizione: non è partita una seconda volta. Controllare in «📤 Inviate» prima di riprovare.${nota}` : e.message);
    }
  }

  // «💾 Salva come bozza»: nuova oppure aggiorna quella aperta. Restituisce true se è salvata.
  async function salvaBozza() {
    if (salvataggio || invio) return false;
    setAvviso("");
    const corpo = risposta ? testo.split("\n----- Il ")[0].trim() : testo.trim();
    if (!oggetto.trim() && !corpo) { setAvviso("Niente da salvare: scrivere l'oggetto o il testo."); return false; }
    if (testo.length > MAX_TESTO) { setAvviso(`Il testo è troppo lungo per una bozza (${testo.length} caratteri, massimo ${MAX_TESTO}).`); return false; }
    // destinatario scelto ma non (ancora) riconosciuto nell'elenco: si conserva quello della bozza, non si cancella
    const tenuto = !risposta && !dest && /^(cliente|fornitore|persona|contatto):[0-9]+$/.test(scelto) ? scelto : null;
    const riga = {
      risposta_a: risposta ? risposta.id : null,
      destinatario: risposta ? null : (dest ? dest.chiave : tenuto),
      destinatario_descritto: (risposta ? String(risposta.indirizzo || "") : dest ? `${dest.nome} <${dest.email}>` : tenuto && tenuto === bozza?.destinatario ? String(bozza.destinatario_descritto || "") : "").slice(0, 300) || null,
      oggetto: oggetto.slice(0, 200), testo, firma: firma.slice(0, 120), codice_richiesta: codiceRichiesta,
    };
    setSalvataggio(true);
    let data = null, error = null, nota = "";
    if (bozzaId) {
      ({ data, error } = await supabase.from("ci_bozze_mail").update(riga).eq("id", bozzaId).select("id, aggiornata_il"));
      if (!error && !(data || []).length) nota = " ⚠️ La bozza di prima non c'era più (eliminata, o già mandata da un'altra finestra: controllare «📤 Inviate»): è salvata come bozza nuova.";
      if (!error && (data || []).length) data = data[0]; else if (!error) data = null;
    }
    if (!error && !data) ({ data, error } = await supabase.from("ci_bozze_mail").insert([riga]).select("id, aggiornata_il").single());
    setSalvataggio(false);
    if (error) { setAvviso(`Bozza non salvata: ${error.message}`); return false; }
    setBozzaId(data.id);
    setSalvato({ oggetto: riga.oggetto, testo: riga.testo, firma: riga.firma, scelto: risposta ? "" : scelto });
    setNotaBozza(`💾 Bozza salvata alle ${ora()}: si ritrova in «📝 Bozze». Gli allegati non si salvano nelle bozze.${nota}`);
    onBozzaSalvata?.();
    return true;
  }

  // La finestra sa se si sta spedendo o se c'è testo scritto: non si chiude a metà invio, e chiede prima di perdere il testo
  const modificata = !giaPartita && ((salvato
    ? oggetto !== salvato.oggetto || testo !== salvato.testo || firma !== salvato.firma || (!risposta && scelto !== salvato.scelto)
    : !!(testo.trim() && testo !== (risposta ? testoCitato(risposta) : "")) || (!risposta && !!oggetto.trim()))
    || files.length > 0 || !!(nuovo && [nuovo.nome, nuovo.email, nuovo.motivo].some(x => String(x || "").trim())));
  const destPerso = !!(bozza?.destinatario && !risposta && !dest && elenchiLetti && scelto === bozza.destinatario);
  // Se dopo la richiesta di conferma si cambia qualcosa, la conferma sparisce: si conferma solo ciò che si vede
  useEffect(() => { setConfermaInvio(false); }, [oggetto, testo, firma, scelto, files, confermaSconosciuto]);
  const rifChiusura = useRef(null);
  useEffect(() => { if (chiusuraChiesta) rifChiusura.current?.scrollIntoView?.({ block: "nearest" }); }, [chiusuraChiesta]);
  useEffect(() => { onStato?.({ invio, modificata }); }, [invio, modificata, onStato]);

  const anteprima = { fontSize: 12, color: C.muted, whiteSpace: "pre-wrap" };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ flex: 1, fontWeight: 800, color: C.primary, fontSize: 16 }}>{risposta ? "↩️ Rispondi" : "✏️ Scrivi una mail"}{bozzaId ? " · 📝 bozza" : ""}</div>
        <button onClick={onChiudi} disabled={invio} title={invio ? "La mail sta partendo: aspettare" : undefined} style={btn(false)}>Chiudi</button>
      </div>
      {chiusuraChiesta && !invio && (
        <div ref={rifChiusura} role="alertdialog" aria-label="Chiudere la mail?" style={{ background: "#FFF8E6", border: `2px solid ${C.red}`, borderRadius: 8, padding: "10px 12px", marginBottom: 10, fontSize: 13 }}>
          <b>La mail non è mandata e le ultime modifiche non sono salvate.</b> Che cosa faccio?
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button onClick={async () => { if (await salvaBozza()) onChiudiDavvero?.(); }} disabled={salvataggio} style={btn(true, C.green)}>{salvataggio ? "Salvo…" : "💾 Salva come bozza e chiudi"}</button>
            <button onClick={() => onChiudiDavvero?.()} style={btn(true, C.red)}>Chiudi senza salvare</button>
            <button onClick={() => onAnnullaChiusura?.()} style={btn(false)}>Torna alla mail</button>
          </div>
          {files.length > 0 && <div style={{ color: C.muted, marginTop: 6 }}>Gli allegati non si salvano nella bozza: andranno aggiunti di nuovo.</div>}
          {avviso && <div style={{ color: C.red, fontWeight: 700, marginTop: 6 }}>{avviso}</div>}
        </div>
      )}
      {notaBozza && <div style={{ fontSize: 12.5, color: C.green, fontWeight: 700, marginBottom: 6 }}>{notaBozza}</div>}
      {destPerso && <div style={{ fontSize: 12.5, color: C.red, fontWeight: 700, marginBottom: 6 }}>Il destinatario della bozza ({bozza.destinatario_descritto || bozza.destinatario}) non è più nell'elenco: sceglierlo di nuovo.</div>}
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>Da: <b style={{ color: C.text }}>{CASELLA_COMUNICAZIONI}</b> · le risposte tornano lì ed entrano da sole nella Posta.</div>

      {!risposta && (
        <div style={{ background: "#EEF5FB", border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", marginBottom: 8, fontSize: 12.5, lineHeight: 1.45 }}>
          <b>Come si sceglie il destinatario.</b> L'indirizzo non si scrive a mano: si sceglie dall'elenco qui sotto, che contiene i clienti e i fornitori con l'email nella scheda, le persone dell'elenco dei report e la <b>rubrica della Posta</b>. Se il destinatario non c'è, premere <b>«➕ Nuovo destinatario»</b> e scrivere nome, email e motivo: entra nella rubrica, resta registrato chi l'ha aggiunto e quando, e da quel momento si sceglie dall'elenco. Prima di aggiungere un indirizzo, controllare che sia quello giusto.
        </div>
      )}
      {risposta ? (
        <div style={{ fontSize: 13, marginBottom: 8 }}>A: <b>{risposta.indirizzo}</b>{mittente.length ? ` — ${mittente.map(m => `${nomeTipo[m.tipo]} ${m.nome}`).join(", ")}` : ""}</div>
      ) : (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>A: {dest ? <b>{dest.nome} &lt;{dest.email}&gt;</b> : <span style={{ color: C.red }}>scegliere dall'elenco</span>}</div>
          <input placeholder="Cerca nell'elenco: nome o indirizzo…" value={filtro} onChange={e => setFiltro(e.target.value)} style={{ ...input, width: "100%", marginBottom: 4 }} />
          <select size={6} value={scelto} onChange={e => setScelto(e.target.value)} style={{ ...input, width: "100%", height: "auto" }} aria-label="Destinatario">
            {scelto && !dest && <option value={scelto} disabled>— destinatario della bozza non trovato nell'elenco: sceglierne uno —</option>}
            {visibili.map(d => <option key={d.chiave} value={d.chiave}>{nomeTipo[d.tipo]} · {d.nome} — {d.email}{d.ruolo ? ` (${String(d.ruolo).toLowerCase()})` : ""}{d.spenta ? " (non riceve i report)" : ""}</option>)}
          </select>
          {!visibili.length && <div style={{ fontSize: 12, color: C.red, marginTop: 2 }}>Nessuno nell'elenco con «{filtro}»: se è un destinatario nuovo, premere «➕ Nuovo destinatario».</div>}
          {nuovo ? (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, marginTop: 6, fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>➕ Nuovo destinatario nella rubrica della Posta</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input placeholder="Nome (per esempio Dott. Rossi)" aria-label="Nome del nuovo destinatario" value={nuovo.nome} onChange={e => setNuovo(x => ({ ...x, nome: e.target.value }))} maxLength={120} style={{ ...input, flex: 1, minWidth: 160 }} />
                <input placeholder="Email" aria-label="Email del nuovo destinatario" value={nuovo.email} onChange={e => setNuovo(x => ({ ...x, email: e.target.value }))} maxLength={200} style={{ ...input, flex: 1, minWidth: 180 }} />
                <input placeholder="Motivo (per esempio veterinario dei bovini)" aria-label="Motivo del nuovo destinatario" value={nuovo.motivo} onChange={e => setNuovo(x => ({ ...x, motivo: e.target.value }))} maxLength={200} style={{ ...input, flex: 2, minWidth: 200 }} />
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={aggiungiContatto} disabled={nuovo.lavoro} style={btn(true, C.green)}>{nuovo.lavoro ? "…" : "Aggiungi e scegli"}</button>
                <button onClick={() => setNuovo(null)} style={btn(false)}>Annulla</button>
              </div>
              {nuovo.avviso && <div style={{ color: C.red, fontWeight: 700, marginTop: 4 }}>{nuovo.avviso}</div>}
            </div>
          ) : <button onClick={() => setNuovo({ nome: "", email: minuscola(filtro).includes("@") ? minuscola(filtro) : "", motivo: "" })} style={{ ...btn(false), marginTop: 6 }}>➕ Nuovo destinatario</button>}
        </div>
      )}

      {sconosciuto && (
        <div style={{ background: "#FDECEA", color: C.red, borderRadius: 6, padding: "8px 10px", marginBottom: 8, fontSize: 13 }}>
          <b>⚠️ Mittente sconosciuto:</b> {risposta.indirizzo} non è un cliente, un fornitore, una persona dell'elenco o un contatto della rubrica. Le mail di sconosciuti possono essere truffe (richieste di pagamento, di dati, di aprire collegamenti): non mandare dati, IBAN o documenti senza aver verificato chi è.
          <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, fontWeight: 700 }}>
            <input type="checkbox" checked={confermaSconosciuto} onChange={() => setConfermaSconosciuto(x => !x)} /> Ho verificato chi è: rispondo lo stesso
          </label>
        </div>
      )}

      <input placeholder="Oggetto" value={oggetto} onChange={e => setOggetto(e.target.value)} maxLength={200} style={{ ...input, width: "100%", marginBottom: 8 }} />
      <textarea placeholder="Testo della mail" value={testo} onChange={e => setTesto(e.target.value)} rows={9} style={{ ...input, width: "100%", height: "auto", padding: 8, marginBottom: 6 }} />
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginBottom: 4, flexWrap: "wrap" }}>
        Firma: <input value={firma} onChange={e => setFirma(e.target.value)} maxLength={120} placeholder={FIRMA_PREDEFINITA} style={{ ...input, flex: 1, minWidth: 200 }} />
        <label style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={ricorda} onChange={() => setRicorda(x => !x)} /> ricordala per le prossime mail</label>
      </label>
      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>Per esempio «Amministrazione – Teresa Demaria». Nella Posta e nel Registro resta comunque scritto chi ha spedito la mail.</div>
      <div style={{ border: `1px dashed ${C.border}`, borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, marginBottom: 4 }}>COME ARRIVA</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
          <img src="/logo512.png" alt="Logo di Podere Verde" style={{ width: 36, height: "auto" }} />
          <div style={{ ...anteprima, color: C.text, fontWeight: 700 }}>{INTESTAZIONE_MAIL}</div>
        </div>
        <div style={{ ...anteprima, color: C.text, maxHeight: 180, overflow: "auto" }}>{(testo.trim() || "(testo della mail)") + "\n\nCordiali saluti\n" + firmaUsata}</div>
        <div style={{ ...anteprima, fontSize: 10.5, borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 4 }}>{PIEDE_MAIL}</div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" multiple onChange={e => setFiles([...e.target.files])} />
        <span style={{ fontSize: 12, color: peso > LIMITE_ALLEGATI ? C.red : C.muted }}>{files.length ? `${files.length} allegati, ${(peso / 1048576).toFixed(2)} MB (massimo 8 MB)` : "nessun allegato"}</span>
        <button onClick={salvaBozza} disabled={invio || salvataggio || confermaInvio || giaPartita} style={{ ...btn(false), marginLeft: "auto" }}>{salvataggio ? "Salvo…" : "💾 Salva come bozza"}</button>
        <button onClick={manda} disabled={invio || confermaInvio || giaPartita} style={btn(true, C.green)}>{invio ? "Invio…" : "✉️ Manda la mail"}</button>
      </div>
      {confermaInvio && (
        <div role="alertdialog" aria-label="Conferma dell'invio" style={{ background: "#EEF7EE", border: `2px solid ${C.green}`, borderRadius: 8, padding: "10px 12px", marginTop: 8, fontSize: 13, lineHeight: 1.5 }}>
          <b>Mandare la mail a {a}?</b>
          <div>Oggetto: {oggetto.trim()}</div>
          <div>Firma: {firmaUsata}</div>
          <div>Allegati: {files.length ? files.map(f => f.name).join(", ") : "nessuno"}</div>
          <div style={{ color: C.muted, marginTop: 4 }}>La mail parte subito da {CASELLA_COMUNICAZIONI}, con intestazione, logo e piè di pagina di Podere Verde, e resta nel Registro delle Comunicazioni con il Suo nome come mittente.{bozzaId ? " Mandata, esce dalle Bozze." : ""}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={eseguiInvio} disabled={invio} style={btn(true, C.green)}>✉️ Sì, manda</button>
            <button onClick={() => setConfermaInvio(false)} disabled={invio} style={btn(false)}>Annulla</button>
          </div>
        </div>
      )}
      {avviso && <div style={{ ...scheda, borderLeft: `4px solid ${C.red}`, color: C.red, fontWeight: 700, marginTop: 8 }}>{avviso}</div>}
    </div>
  );
}
