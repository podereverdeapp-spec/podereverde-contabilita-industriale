// Versione 337 (ordine del Dott. Bizzarri del 31/10/2026): la cartella «Accessi».
// Qui si vede chi si è registrato e si decide chi entra nel programma e in quali parti.
// La vedono il Dott. Bizzarri (amministratore) e i gestori degli accessi (Colabucci e Demaria).
// Gestore degli accessi e porta di servizio li cambia solo l'amministratore (lo controlla anche il database).
import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import { C, FONT } from "./style";
import { PARTI, PARTE_LAVORO } from "./accessiParti";

export const PAGINA_TEAM_SUPABASE = "https://supabase.com/dashboard/org/yyfvpmlpdmogucnnwpne/team";

const dataOra = (d) => d ? new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const COLORE_STATO = { "In attesa": "#D4880F", "Attivo": "#4A7C59", "Bloccato": "#C0392B" };
const box = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 };
const bot = (attivo, colore) => ({ background: attivo ? colore : "transparent", color: attivo ? "#fff" : colore, border: `1.5px solid ${colore}`, borderRadius: 8, padding: "7px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT });

// Avvisi «non coincide» di una persona (anomalie: si mostrano in rosso, in cima)
function anomalieDi(r) {
  const a = [];
  if (r.porta_servizio !== "No" && r.stato !== "Attivo")
    a.push("Ha la porta di servizio ma nel programma non è «Attivo»: non coincide. Tolga la porta di servizio qui e anche nella pagina «Team» di Supabase.");
  if (r.gestore_accessi && r.stato !== "Attivo")
    a.push("È gestore degli accessi ma non è «Attivo»: finché non è Attivo non può gestire nulla.");
  if (r.stato === "Attivo" && !r.tutto_il_programma && !(r.parti || []).length)
    a.push("È «Attivo» ma non ha nessuna parte spuntata: vedrà il programma vuoto.");
  return a;
}

function SchedaPersona({ r, io, admin, onSalvato }) {
  const iniziale = { stato: r.stato || "In attesa", tutto: !!r.tutto_il_programma, parti: r.parti || [], gestore: !!r.gestore_accessi, porta: r.porta_servizio || "No", note: r.note || "" };
  const [b, setB] = useState(iniziale);
  const [salva, setSalva] = useState(false);
  const [esito, setEsito] = useState(null);
  const [aperta, setAperta] = useState(r.stato === "In attesa" || r.stato == null);
  useEffect(() => { setB(iniziale); }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  const cambiato = JSON.stringify(b) !== JSON.stringify(iniziale);
  const eAdmin = r.ruolo === "admin";
  const eIo = r.profilo_id === io;
  const modificabile = !eAdmin && (!eIo || admin);
  const anomalie = anomalieDi(r);

  function spunta(id) {
    setB(x => ({ ...x, parti: x.parti.includes(id) ? x.parti.filter(p => p !== id) : [...x.parti, id] }));
  }

  async function salvaScelte() {
    setSalva(true); setEsito(null);
    const dati = { stato: b.stato, tutto_il_programma: b.tutto, parti: b.parti, note: b.note.trim() || null };
    if (admin) { dati.gestore_accessi = b.gestore; dati.porta_servizio = b.porta; }
    const { error } = r.stato == null
      ? await supabase.from("ci_accessi_programma").insert([{ profilo_id: r.profilo_id, ...dati }])
      : await supabase.from("ci_accessi_programma").update(dati).eq("profilo_id", r.profilo_id);
    setSalva(false);
    if (error) { setEsito({ ok: false, testo: `Non salvato: ${error.message}` }); return; }
    setEsito({ ok: true, testo: "Salvato. La persona vedrà il cambiamento quando preme «Controlla di nuovo» o riapre il programma." });
    onSalvato();
  }

  const statoMostrato = r.stato || "Non ha mai aperto il programma";
  return (
    <div style={{ ...box, borderLeft: `5px solid ${COLORE_STATO[r.stato] || C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", cursor: "pointer" }} onClick={() => setAperta(x => !x)}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{r.nome || "(senza nome)"}{eIo && <span style={{ color: C.muted, fontWeight: 600 }}> (è Lei)</span>}</div>
        <div style={{ color: C.muted, fontSize: 13 }}>{r.email}</div>
        <span style={{ background: COLORE_STATO[r.stato] || "#9A958A", color: "#fff", borderRadius: 10, padding: "2px 9px", fontSize: 11.5, fontWeight: 800 }}>{eAdmin ? "Amministratore" : statoMostrato}</span>
        {r.gestore_accessi && <span style={{ background: C.blue, color: "#fff", borderRadius: 10, padding: "2px 9px", fontSize: 11.5, fontWeight: 800 }}>Gestore degli accessi</span>}
        {r.porta_servizio !== "No" && <span style={{ background: C.accent, color: "#fff", borderRadius: 10, padding: "2px 9px", fontSize: 11.5, fontWeight: 800 }}>Porta di servizio: {r.porta_servizio}</span>}
        <span style={{ marginLeft: "auto", color: C.muted, fontSize: 12 }}>{aperta ? "▾ chiudi" : "▸ apri"}</span>
      </div>
      {anomalie.map((t, i) => (
        <div key={i} style={{ background: "#FDECEA", color: C.red, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, marginTop: 10 }}>⚠️ {t}</div>
      ))}
      {aperta && (
        <div style={{ marginTop: 12, fontSize: 13.5 }}>
          <div style={{ color: C.muted, fontSize: 12.5, marginBottom: 10 }}>
            Registrato il {dataOra(r.registrato_il)} · ultimo ingresso {dataOra(r.ultimo_accesso)}
            {r.richiesto_il && <> · richiesta del {dataOra(r.richiesto_il)}</>}
            {r.deciso_il && <> · ultima decisione {dataOra(r.deciso_il)}</>}
          </div>
          {eAdmin && <div style={{ color: C.text }}>Entra sempre in tutto il programma. Non si modifica qui.</div>}
          {eIo && !eAdmin && <div style={{ color: C.text }}>È il Suo accesso: lo può cambiare solo il Dott. Filippo Bizzarri o un altro gestore degli accessi.</div>}
          {modificabile && <>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>1. Può entrare?</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <button onClick={() => setB(x => ({ ...x, stato: "Attivo" }))} style={bot(b.stato === "Attivo", COLORE_STATO.Attivo)}>✅ Sì, dai l'accesso</button>
              <button onClick={() => setB(x => ({ ...x, stato: "In attesa" }))} style={bot(b.stato === "In attesa", COLORE_STATO["In attesa"])}>⏳ Lascia in attesa</button>
              <button onClick={() => setB(x => ({ ...x, stato: "Bloccato" }))} style={bot(b.stato === "Bloccato", COLORE_STATO.Bloccato)}>⛔ Blocca</button>
            </div>

            <div style={{ fontWeight: 800, marginBottom: 6 }}>2. Che cosa può usare?</div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, cursor: "pointer" }}>
              <input type="radio" checked={b.tutto} onChange={() => setB(x => ({ ...x, tutto: true }))} /> Tutto il programma (tranne le buste paga)
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, cursor: "pointer" }}>
              <input type="radio" checked={!b.tutto} onChange={() => setB(x => ({ ...x, tutto: false }))} /> Solo le parti spuntate qui sotto
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "2px 16px", marginLeft: 22, marginBottom: 10, opacity: b.tutto ? 0.45 : 1 }}>
              {PARTI.filter(p => p.id !== PARTE_LAVORO).map(p => (
                <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: b.tutto ? "default" : "pointer" }}>
                  <input type="checkbox" disabled={b.tutto} checked={b.tutto || b.parti.includes(p.id)} onChange={() => spunta(p.id)} /> {p.label}
                </label>
              ))}
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", background: "#FFF6E5", border: "1px solid #E8C77A", borderRadius: 8, padding: "8px 10px", marginBottom: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={b.parti.includes(PARTE_LAVORO)} onChange={() => spunta(PARTE_LAVORO)} />
              <span><b>Costi del Lavoro (buste paga)</b> — sono dati riservati: si spunta sempre a parte, anche con «Tutto il programma».</span>
            </label>

            <div style={{ fontWeight: 800, marginBottom: 6 }}>3. Solo per il Dott. Bizzarri</div>
            {admin ? (
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={b.gestore} onChange={() => setB(x => ({ ...x, gestore: !x.gestore }))} /> Può gestire la cartella «Accessi»
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  Porta di servizio (entrare con il suo Claude):
                  <select value={b.porta} onChange={e => setB(x => ({ ...x, porta: e.target.value }))} style={{ fontFamily: FONT, padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}` }}>
                    <option value="No">No</option>
                    <option value="Sola lettura">Sola lettura</option>
                    <option value="Completa">Completa</option>
                  </select>
                </label>
              </div>
            ) : (
              <div style={{ color: C.muted, marginBottom: 14 }}>
                Gestore degli accessi: <b>{b.gestore ? "sì" : "no"}</b> · Porta di servizio: <b>{b.porta}</b> (li cambia solo il Dott. Bizzarri)
              </div>
            )}

            <div style={{ fontWeight: 800, marginBottom: 6 }}>4. Note (facoltative)</div>
            <input value={b.note} onChange={e => setB(x => ({ ...x, note: e.target.value }))} placeholder="Per esempio: impiegata dello studio, solo F24"
              style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13.5, fontFamily: FONT, marginBottom: 12 }} />

            <button onClick={salvaScelte} disabled={!cambiato || salva}
              style={{ background: cambiato ? C.primary : "#BDB8AC", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 800, cursor: cambiato ? "pointer" : "default", fontFamily: FONT }}>
              {salva ? "Salvataggio…" : "💾 Salva"}
            </button>
            {!cambiato && !esito && <span style={{ marginLeft: 10, color: C.muted, fontSize: 12.5 }}>Il tasto si accende quando cambia qualcosa.</span>}
          </>}
          {esito && <div style={{ marginTop: 10, background: esito.ok ? "#E6F2E8" : "#FDECEA", color: esito.ok ? C.green : C.red, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>{esito.testo}</div>}
        </div>
      )}
    </div>
  );
}

export default function PaginaAccessi({ accesso, utente, onCambiato }) {
  const [righe, setRighe] = useState(null);
  const [errore, setErrore] = useState("");
  const [filtro, setFiltro] = useState("");
  const admin = !!accesso?.admin;

  const carica = useCallback(async () => {
    const { data, error } = await supabase.rpc("ci_elenco_accessi");
    if (error) { setErrore(error.message); setRighe([]); return; }
    setErrore(""); setRighe(data || []);
  }, []);
  useEffect(() => { carica(); }, [carica]);

  if (righe === null) return <div style={{ padding: 30, color: C.muted, fontFamily: FONT }}>Caricamento degli accessi…</div>;

  const ordine = (r) => r.ruolo === "admin" ? 5 : r.stato === "In attesa" ? 0 : r.stato == null ? 1 : anomalieDi(r).length ? 2 : r.stato === "Attivo" ? 3 : 4;
  const visibili = righe
    .filter(r => !filtro || `${r.nome} ${r.email}`.toLowerCase().includes(filtro.toLowerCase()))
    .sort((a, b) => ordine(a) - ordine(b) || (a.nome || "").localeCompare(b.nome || ""));
  const inAttesa = righe.filter(r => r.stato === "In attesa").length;
  const conAnomalie = righe.filter(r => anomalieDi(r).length).length;
  const conPorta = righe.filter(r => r.porta_servizio && r.porta_servizio !== "No");

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20, fontFamily: FONT, color: C.text }}>
      <h2 style={{ margin: "4px 0 6px", color: C.primary }}>🔐 Accessi — chi entra nel programma</h2>
      <div style={{ color: C.muted, fontSize: 13.5, marginBottom: 16 }}>
        Qui arrivano le richieste di chi si registra. Si decide se può entrare e in quali parti del programma. Le istruzioni sono nella pagina «Istruzioni» di questa cartella.
      </div>

      {errore && <div style={{ ...box, background: "#FDECEA", color: C.red, fontWeight: 700 }}>⚠️ Non riesco a leggere gli accessi: {errore}</div>}
      {inAttesa > 0 && (
        <div style={{ ...box, background: "#FBE1DE", border: "2px solid #C0392B", color: "#8B1E14", fontWeight: 800 }}>
          🔔 {inAttesa === 1 ? "C'è 1 richiesta di accesso" : `Ci sono ${inAttesa} richieste di accesso`} da decidere: sono le prime dell'elenco qui sotto.
        </div>
      )}
      {conAnomalie > 0 && (
        <div style={{ ...box, background: "#FDECEA", border: "2px solid #C0392B", color: C.red, fontWeight: 800 }}>
          ⚠️ {conAnomalie === 1 ? "1 persona ha" : `${conAnomalie} persone hanno`} qualcosa che non coincide (scritto in rosso nella sua scheda).
        </div>
      )}

      {admin && (
        <div style={{ ...box, background: "#F6F1E8" }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>🚪 Porta di servizio (entrare con il proprio Claude) — solo per il Dott. Bizzarri</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
            Il Dott. Bizzarri entra sempre da tutte le porte. Per gli altri, la porta di servizio <b>si apre e si chiude davvero</b> nella pagina «Team» di Supabase;
            la colonna «Porta di servizio» di questa pagina è il promemoria di chi deve esserci. <b>Le due cose devono coincidere</b>: se nella pagina «Team» c'è una persona che qui ha «No», la si toglie da lì.
            <div style={{ marginTop: 8 }}>
              Oggi qui hanno la porta di servizio: <b>{conPorta.length ? conPorta.map(r => `${r.nome} (${r.porta_servizio})`).join(", ") : "nessuno oltre al Dott. Bizzarri"}</b>.
            </div>
            <a href={PAGINA_TEAM_SUPABASE} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, color: C.primary, fontWeight: 800 }}>Apri la pagina «Team» di Supabase →</a>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Cerca per nome o email"
          style={{ flex: 1, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: FONT }} />
        <button onClick={carica} style={{ ...bot(false, C.primary), padding: "9px 14px" }}>🔄 Aggiorna</button>
      </div>
      <div style={{ color: C.muted, fontSize: 12.5, marginBottom: 10 }}>{righe.length} persone registrate · {righe.filter(r => r.stato === "Attivo").length} attive · {inAttesa} in attesa · {righe.filter(r => r.stato === "Bloccato").length} bloccate · {righe.filter(r => r.stato == null).length} mai entrate nel programma</div>

      {visibili.map(r => (
        <SchedaPersona key={r.profilo_id} r={r} io={utente?.id} admin={admin} onSalvato={() => { carica(); onCambiato?.(); }} />
      ))}
    </div>
  );
}

// Le istruzioni della cartella «Accessi», in parole semplici
export function IstruzioniAccessi() {
  const p = { fontSize: 14.5, lineHeight: 1.65, margin: "0 0 10px" };
  const h = { color: C.primary, margin: "22px 0 8px", fontSize: 17 };
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: 24, fontFamily: FONT, color: C.text }}>
      <h2 style={{ color: C.primary, marginTop: 4 }}>📖 Istruzioni della cartella «Accessi»</h2>
      <p style={p}>Questa cartella serve a decidere <b>chi può entrare nel programma</b> e <b>quali parti può usare</b>. La vedono solo il Dott. Filippo Bizzarri e i gestori degli accessi (oggi Colabucci e Demaria).</p>

      <h3 style={h}>1. Come chiede l'accesso una persona nuova</h3>
      <p style={p}>1) Apre il programma. 2) Sotto il tasto «Entra» preme <b>«Chieda l'accesso»</b>. 3) Scrive nome, cognome, email e una password (almeno 8 caratteri, due volte). 4) Preme <b>«Invia la richiesta di accesso»</b>.</p>
      <p style={p}>Da quel momento vede solo una pagina che dice <b>«Richiesta di accesso arrivata»</b>: il programma non si apre finché qualcuno non dice di sì.</p>
      <p style={p}>Chi ha già email e password dell'app Podere Verde non deve registrarsi: preme «Entra». Se non ha ancora l'accesso al programma, la sua richiesta nasce da sola.</p>

      <h3 style={h}>2. Come si dà l'accesso</h3>
      <p style={p}>1) Quando arriva una richiesta, accanto a «Accessi» nel menu compare un <b>numero rosso</b>. 2) Si apre «Chi entra nel programma». 3) Le richieste da decidere sono <b>le prime dell'elenco</b>, con il bordo arancione.</p>
      <p style={p}>4) Nella scheda della persona: al punto 1 si preme <b>«✅ Sì, dai l'accesso»</b>. 5) Al punto 2 si sceglie <b>«Tutto il programma»</b> oppure <b>«Solo le parti spuntate»</b> e si spuntano le parti. 6) Si preme <b>«💾 Salva»</b>.</p>
      <p style={p}>7) Si dice alla persona di premere <b>«Controlla di nuovo»</b> nella sua pagina d'attesa: il programma si apre con le sole parti scelte.</p>

      <h3 style={h}>3. Le buste paga</h3>
      <p style={p}>I <b>Costi del Lavoro (buste paga)</b> sono dati riservati. Non sono compresi in «Tutto il programma»: si danno solo spuntando la loro casella gialla.</p>

      <h3 style={h}>4. Come si toglie l'accesso</h3>
      <p style={p}>Nella scheda della persona si preme <b>«⛔ Blocca»</b> e poi «💾 Salva». Al prossimo ingresso vedrà «Accesso bloccato». Per togliere solo una parte, si toglie la spunta e si salva.</p>

      <h3 style={h}>5. Che cosa non si può fare (lo blocca anche il database)</h3>
      <p style={p}>Nessuno può cambiare il proprio accesso: lo fa un altro gestore o il Dott. Bizzarri. Nessuno può toccare l'accesso del Dott. Bizzarri. Solo il Dott. Bizzarri decide chi è <b>gestore degli accessi</b> e chi ha la <b>porta di servizio</b>.</p>

      <h3 style={h}>6. La porta di servizio (entrare con il proprio Claude)</h3>
      <p style={p}>La «porta principale» è il programma: si entra con email e password. La «porta di servizio» serve a far lavorare il <b>proprio Claude</b> direttamente nel database, senza passare dal programma. Il Dott. Bizzarri ce l'ha sempre. Gli altri solo se lui lo decide.</p>
      <p style={p}><b>Come si apre la porta di servizio a una persona</b> (lo fa solo il Dott. Bizzarri):</p>
      <p style={p}>1) Nella scheda della persona, al punto 3, si sceglie «Sola lettura» o «Completa» e si salva: è il promemoria. 2) Si apre la pagina <b>«Team» di Supabase</b> (c'è il collegamento in cima alla pagina «Chi entra nel programma»). 3) Si preme <b>«Invite»</b>, si scrive l'email della persona e si sceglie il ruolo: per «Sola lettura» il ruolo di sola lettura («Read-only», se la pagina lo offre); per «Completa» il ruolo <b>«Developer»</b>. Mai «Owner» o «Administrator». 4) La persona riceve un'email, accetta l'invito e da quel momento il suo Claude, collegato a Supabase con il suo nome, può entrare.</p>
      <p style={p}><b>Come entra la persona dalla porta di servizio:</b> 1) Apre Claude. 2) Nelle impostazioni, alla voce dei collegamenti (connettori), sceglie <b>Supabase</b> e preme «Collega». 3) Entra in Supabase con la sua email (quella invitata). 4) Da quel momento può chiedere al suo Claude di leggere (o, se «Completa», modificare) i dati del progetto Podere Verde.</p>
      <p style={p}><b>Come si chiude:</b> nella pagina «Team» di Supabase, accanto al nome, si preme il menu e «Remove from team»; poi qui si rimette «No» e si salva.</p>
      <p style={p}>Se in quella pagina c'è qualcuno che qui ha «No», o il contrario, <b>non coincide</b>: va corretto subito. Chiunque altro su internet resta fuori.</p>
    </div>
  );
}
