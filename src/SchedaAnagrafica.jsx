import { useState, useMemo, useEffect } from "react";
import { C } from "./style";
import { btn, input, scheda, th, td, testata } from "./stileAruba";
import {
  CAMPI_ANAGRAFICA, etichettaCampo, avvisiForma, differenze, cercaDoppione, salvaAnagrafica, cfDaPiva,
  comunicazioniDi, TIPI_COMUNICAZIONE, SEZIONE_A_MANO, caricaAllegati, registraComunicazione, apriAllegato,
  mandaMail, LIMITE_ALLEGATI, quando, adessoLocale,
  puoSpedireMail, nuovoCodiceRichiesta, CASELLA_COMUNICAZIONI, FIRMA_PREDEFINITA, INTESTAZIONE_MAIL, PIEDE_MAIL,
  MOTIVI_TOLTA, togliDalRegistro, rimettiNelRegistro, dominioDi, contaRicevuteDa, anagraficheDi, bloccaMittente,
} from "./anagrafiche";

// Versione 304 — scheda di un cliente o di un fornitore: dati anagrafici modificabili e Registro delle Comunicazioni.
// Decisioni del Dott. Bizzarri del 26/10/2026 (ore 16:11–16:49).
// Versione 346 (03/11/2026): la mail parte da podereverdeapp@gmail.com attraverso il postino, con firma modificabile,
// anteprima di intestazione e piè di pagina, e solo per chi ha il permesso «Può spedire mail dal programma».
// Con lo stesso permesso, ore 21:47: «Togli dal registro» (con il motivo, recuperabile) e «Blocca mittente».

const GRUPPI = [["FCV", "FCV — classificazione per parola chiave"], ["FCF", "FCF — classificazione fissa"], ["FRO", "FRO — classificazione sempre manuale"]];

export default function SchedaAnagrafica({ tipo, record, tutteComunicazioni, onChiudi, onSalvato, onComunicazioneRegistrata }) {
  const nuovo = !record?.id;
  const [valori, setValori] = useState(() => ({ ...(record || {}), nazione: record?.nazione || (nuovo ? "IT" : "") }));
  const [cfUguale, setCfUguale] = useState(() => !!(record?.codice_fiscale && record?.partita_iva && cfDaPiva(record.partita_iva) === String(record.codice_fiscale).toUpperCase()));
  const [modifica, setModifica] = useState(nuovo);
  const [salvando, setSalvando] = useState(false);
  const [modulo, setModulo] = useState(null); // "mail" | "telefonata" | "esterna"
  const [aperta, setAperta] = useState(null);
  const nomeTipo = tipo === "cliente" ? "cliente" : "fornitore";

  const comunicazioni = useMemo(() => (record?.id ? comunicazioniDi(tipo, record, tutteComunicazioni || []) : []), [tipo, record, tutteComunicazioni]);

  const imposta = (campo, v) => setValori(prev => {
    const n = { ...prev, [campo]: v };
    if (campo === "partita_iva" && cfUguale) n.codice_fiscale = cfDaPiva(v);
    return n;
  });

  async function salva() {
    if (!String(valori.nome || "").trim()) { alert("Il nome è obbligatorio."); return; }
    const diff = differenze(record || {}, valori);
    if (tipo === "fornitore" && (record?.gruppo_classificazione || "") !== (valori.gruppo_classificazione || "")) diff.push({ campo: "gruppo_classificazione", prima: record?.gruppo_classificazione || "", dopo: valori.gruppo_classificazione || "" });
    if (!diff.length) { setModifica(false); return; }
    try {
      const doppio = await cercaDoppione(tipo, record?.id, valori);
      const avvisi = avvisiForma(valori);
      const svuotati = diff.filter(d => d.prima && !d.dopo);
      const righe = diff.map(d => `${d.campo === "gruppo_classificazione" ? "Gruppo" : etichettaCampo(d.campo)}: ${d.prima || "vuoto"} → ${d.dopo || "VUOTO"}`);
      let testo = `${nuovo ? `Creare il ${nomeTipo}` : `Salvare le modifiche del ${nomeTipo}`} «${valori.nome}»?\n\n${righe.join("\n")}`;
      if (svuotati.length) testo += `\n\nATTENZIONE: si cancellano ${svuotati.map(d => etichettaCampo(d.campo)).join(", ")}.`;
      if (svuotati.some(d => d.campo === "partita_iva")) testo += " La Partita IVA è il dato con cui il programma riconosce il " + nomeTipo + " nelle fatture.";
      if (doppio) testo += `\n\nATTENZIONE: esiste già il ${nomeTipo} «${doppio.nome}» con la stessa Partita IVA o lo stesso Codice Fiscale.`;
      if (avvisi.length) testo += `\n\nDa controllare:\n– ${avvisi.join("\n– ")}`;
      testo += "\n\nLa modifica resta scritta nel Registro delle Modifiche.";
      if (!window.confirm(testo)) return;
      setSalvando(true);
      const salvato = await salvaAnagrafica(tipo, record?.id, valori);
      setSalvando(false); setModifica(false);
      onSalvato?.(salvato);
    } catch (e) { setSalvando(false); alert(`⚠️ Non salvato:\n\n${e.message}`); }
  }

  const campo = (c) => {
    const v = valori[c.campo] ?? "";
    if (!modifica) return <div style={{ fontSize: 13.5, minHeight: 20, color: v ? C.text : C.muted, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{v || "—"}</div>;
    if (c.campo === "codice_fiscale") return (
      <div style={{ display: "flex", gap: 6 }}>
        <select value={cfUguale ? "uguale" : "mano"} onChange={e => { const u = e.target.value === "uguale"; setCfUguale(u); if (u) imposta("codice_fiscale", cfDaPiva(valori.partita_iva)); }} style={{ ...input, width: 190 }}>
          <option value="mano">scritto a mano</option>
          <option value="uguale">uguale alla Partita IVA</option>
        </select>
        <input value={v} disabled={cfUguale} onChange={e => imposta("codice_fiscale", e.target.value.toUpperCase())} style={{ ...input, flex: 1, minWidth: 120, background: cfUguale ? "#F3F1EA" : "#fff" }} />
      </div>
    );
    if (c.area) return <textarea value={v} onChange={e => imposta(c.campo, e.target.value)} rows={2} style={{ ...input, width: "100%", height: "auto", padding: 8 }} />;
    return <input value={v} onChange={e => imposta(c.campo, e.target.value)} style={{ ...input, width: "100%" }} />;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, overflow: "auto", padding: "24px 12px" }} onClick={onChiudi}>
      <div style={{ background: C.bg, borderRadius: 14, maxWidth: 1050, margin: "0 auto", padding: 18 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: tipo === "cliente" ? C.green : C.blue }}>{tipo === "cliente" ? "🤝 CLIENTE" : "🏢 FORNITORE"}</div>
            <h2 style={{ margin: 0, color: C.primary, fontSize: 21 }}>{nuovo ? `Nuovo ${nomeTipo}` : record.nome}</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!modifica && <button onClick={() => setModifica(true)} style={btn(true)}>✏️ Modifica i dati</button>}
            {modifica && <button onClick={salva} disabled={salvando} style={btn(true, C.green)}>{salvando ? "Salvataggio…" : "✓ Salva"}</button>}
            {modifica && !nuovo && <button onClick={() => { setValori({ ...record }); setCfUguale(!!(record?.codice_fiscale && record?.partita_iva && cfDaPiva(record.partita_iva) === String(record.codice_fiscale).toUpperCase())); setModifica(false); }} style={btn(false, C.muted)}>Annulla le modifiche</button>}
            <button onClick={onChiudi} style={btn(false, C.muted)}>✕ Chiudi</button>
          </div>
        </div>

        <div style={scheda}>
          <div style={{ fontWeight: 800, color: C.primary, marginBottom: 10 }}>Dati anagrafici</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "10px 14px" }}>
            {CAMPI_ANAGRAFICA.map(c => (
              <div key={c.campo} style={{ gridColumn: c.largo ? "1 / -1" : undefined }}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 3 }}>{c.etichetta}{c.obbligatorio && modifica ? " *" : ""}</div>
                {campo(c)}
              </div>
            ))}
            {tipo === "fornitore" && (
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 3 }}>Gruppo</div>
                {modifica
                  ? <select value={valori.gruppo_classificazione || ""} onChange={e => imposta("gruppo_classificazione", e.target.value)} style={{ ...input, width: "100%" }}><option value="">— nessuno —</option>{GRUPPI.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                  : <div style={{ fontSize: 13.5 }}>{(GRUPPI.find(g => g[0] === valori.gruppo_classificazione) || [, "—"])[1]}</div>}
              </div>
            )}
          </div>
          {modifica && avvisiForma(valori).length > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#9A6B00" }}>⚠️ {avvisiForma(valori).join(" ")}</div>
          )}
        </div>

        {!nuovo && (
          <div style={scheda}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              <div style={{ fontWeight: 800, color: C.primary }}>Registro delle Comunicazioni ({comunicazioni.length})</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => setModulo(modulo === "mail" ? null : "mail")} style={btn(modulo === "mail")} title={record.email ? "" : "Manca l'email nella scheda"}>✉️ Scrivi una mail</button>
                <button onClick={() => setModulo(modulo === "telefonata" ? null : "telefonata")} style={btn(modulo === "telefonata")}>📞 Registra una telefonata</button>
                <button onClick={() => setModulo(modulo === "esterna" ? null : "esterna")} style={btn(modulo === "esterna")}>📎 Registra una mail o PEC mandata fuori dal programma</button>
              </div>
            </div>
            {modulo === "mail" && <ModuloMail tipo={tipo} record={record} onFatto={c => { setModulo(null); onComunicazioneRegistrata?.(c); }} />}
            {(modulo === "telefonata" || modulo === "esterna") && <ModuloRegistrazione tipo={tipo} record={record} telefonata={modulo === "telefonata"} onFatto={c => { setModulo(null); onComunicazioneRegistrata?.(c); }} />}
            <ElencoComunicazioni righe={comunicazioni} aperta={aperta} setAperta={setAperta} onCambiato={() => onComunicazioneRegistrata?.()} />
          </div>
        )}
      </div>
    </div>
  );
}

export function ElencoComunicazioni({ righe, aperta, setAperta, intestatario, onCambiato }) {
  const [puo, setPuo] = useState(false);
  useEffect(() => { let vivo = true; puoSpedireMail().then(p => { if (vivo) setPuo(p); }); return () => { vivo = false; }; }, []);
  if (!righe.length) return <div style={{ color: C.muted, fontSize: 13, padding: "6px 0" }}>Nessuna comunicazione registrata.</div>;
  const icona = t => (t === "Telefonata" ? "📞" : t === "PEC" ? "📮" : "✉️");
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead><tr style={testata}>
          <th style={th}>Data e ora</th><th style={th}>Tipo</th>{intestatario && <th style={th}>Cliente o fornitore</th>}<th style={th}>Destinatario o numero</th><th style={th}>Oggetto</th><th style={th}>Da dove</th><th style={th}>Esito</th><th style={th}>Allegati</th>
        </tr></thead>
        <tbody>
          {righe.map(c => (
            <FilaComunicazione key={c.chiave} c={c} aperta={aperta === c.chiave} onClick={() => setAperta(aperta === c.chiave ? null : c.chiave)} icona={icona} intestatario={intestatario} puo={puo} onCambiato={onCambiato} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilaComunicazione({ c, aperta, onClick, icona, intestatario, puo, onCambiato }) {
  const colonne = 7 + (intestatario ? 1 : 0);
  const apri = async (a, e) => { e.stopPropagation(); try { await apriAllegato(a); } catch (err) { alert(`⚠️ ${err.message}`); } };
  return (
    <>
      <tr style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer", background: aperta ? "#E8F0E4" : c.tolta_il ? "#F1EFEA" : undefined, opacity: c.tolta_il ? 0.6 : 1 }} onClick={onClick}>
        <td style={{ ...td, whiteSpace: "nowrap" }}>{quando(c.data_ora)}</td>
        <td style={{ ...td, whiteSpace: "nowrap" }}>{icona(c.tipo)} {c.tipo}{c.direzione === "ricevuta" ? " ricevuta" : ""}</td>
        {intestatario && <td style={td}>{intestatario(c)}</td>}
        <td style={td}>{c.indirizzo || "—"}</td>
        <td style={{ ...td, fontWeight: 700 }}>{c.tolta_il && <span style={{ color: C.red }}>🗑 TOLTA · </span>}{c.oggetto || "—"}</td>
        <td style={td}>{c.sezione}</td>
        <td style={{ ...td, color: /errore/i.test(c.esito) ? C.red : C.green, fontWeight: 700 }}>{c.esito}</td>
        <td style={td}>{(c.allegati || []).length ? (c.allegati || []).map((a, i) => <div key={i}><a href="#" onClick={e => apri(a, e)}>📎 {a.nome}</a></div>) : "—"}</td>
      </tr>
      {aperta && (
        <tr><td colSpan={colonne} style={{ ...td, background: "#FAFAF7" }}>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5 }}>{c.testo || "(nessun testo)"}</div>
          {c.mittente && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Mittente: {c.mittente}</div>}
          {c.note && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Nota: {c.note}</div>}
          {c.codice_invio && <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Codice di invio: {c.codice_invio}</div>}
          {c.tolta_il && <div style={{ fontSize: 12, color: C.red, fontWeight: 700, marginTop: 6 }}>Tolta dal registro il {quando(c.tolta_il)} — motivo: {c.motivo_tolta}</div>}
          {c.origine === "registro" && c.id && puo && <AzioniComunicazione c={c} onCambiato={onCambiato} />}
        </td></tr>
      )}
    </>
  );
}

// Versione 346 (03/11/2026, ore 21:47): togliere o rimettere una comunicazione nel registro e bloccare un mittente.
// Solo per chi ha il permesso «Può spedire mail dal programma» (lo controlla anche il database).
function AzioniComunicazione({ c, onCambiato }) {
  const [modo, setModo] = useState(null);
  const [motivo, setMotivo] = useState(MOTIVI_TOLTA[0]);
  const [altro, setAltro] = useState("");
  const [genere, setGenere] = useState("indirizzo");
  const [motivoBlocco, setMotivoBlocco] = useState("");
  const [togliGia, setTogliGia] = useState(true);
  const [quante, setQuante] = useState(null);
  const [legati, setLegati] = useState([]);
  const [lavoro, setLavoro] = useState(false);
  const mail = String(c.indirizzo || "").trim().toLowerCase();
  const dominio = dominioDi(mail);
  const bloccabile = c.tipo !== "Telefonata" && c.direzione === "ricevuta" && mail.includes("@");
  const valore = genere === "dominio" ? dominio : mail;
  useEffect(() => {
    if (modo !== "blocca") return;
    let vivo = true;
    setQuante(null); setLegati([]);
    contaRicevuteDa({ valore, genere }).then(n => { if (vivo) setQuante(n); }).catch(() => { if (vivo) setQuante(0); });
    anagraficheDi({ valore, genere }).then(l => { if (vivo) setLegati(l); }).catch(() => {});
    return () => { vivo = false; };
  }, [modo, valore, genere]);
  const fermo = e => e.stopPropagation();
  async function esegui(azione) {
    setLavoro(true);
    try { await azione(); setModo(null); onCambiato?.(); }
    catch (e) { alert(`⚠️ ${e.message}`); }
    setLavoro(false);
  }
  const togli = () => {
    const m = motivo === "Altro" ? altro.trim() : motivo;
    if (!m) { alert("Scrivere il motivo."); return; }
    if (!window.confirm(`Togliere dal registro «${c.oggetto || "senza oggetto"}»?\n\nMotivo: ${m}\n\nNon si cancella: resta conservata e si può rimettere con «Mostra anche le tolte». La mail originale resta nella casella di posta.`)) return;
    esegui(() => togliDalRegistro(c.id, m));
  };
  const blocca = () => {
    if (!motivoBlocco.trim()) { alert("Scrivere il motivo del blocco."); return; }
    const chi = genere === "dominio" ? `tutto il dominio @${dominio}` : `l'indirizzo ${mail}`;
    const avviso = legati.length ? `\n\n⚠️ ATTENZIONE: appartiene a ${legati.join(", ")}. Bloccandolo non entreranno più nel registro neppure le loro mail buone.` : "";
    if (!window.confirm(`Bloccare ${chi}?\n\nMotivo: ${motivoBlocco.trim()}${togliGia && quante ? `\nSi tolgono anche ${quante} mail già entrate.` : ""}${avviso}\n\nDa ora le sue mail non entrano più nel registro. Si sblocca dal Registro delle Comunicazioni, riquadro «Mittenti bloccati».`)) return;
    esegui(async () => { const r = await bloccaMittente({ valore, genere, motivo: motivoBlocco, togliGia }); alert(`✓ Bloccato ${chi}.${r.tolte ? ` Tolte ${r.tolte} mail già entrate.` : ""}`); });
  };
  const pannello = { marginTop: 8, padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
  return (
    <div onClick={fermo} style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {c.tolta_il
          ? <button disabled={lavoro} onClick={() => { if (window.confirm("Rimettere questa comunicazione nel registro?")) esegui(() => rimettiNelRegistro(c.id)); }} style={btn(false, C.green)}>↩ Rimetti nel registro</button>
          : <button disabled={lavoro} onClick={() => setModo(modo === "togli" ? null : "togli")} style={btn(modo === "togli", C.red)}>🗑 Togli dal registro</button>}
        {bloccabile && !c.tolta_il && <button disabled={lavoro} onClick={() => setModo(modo === "blocca" ? null : "blocca")} style={btn(modo === "blocca", C.red)}>⛔ Blocca mittente</button>}
      </div>
      {modo === "togli" && (
        <div style={pannello}>
          Motivo:
          <select value={motivo} onChange={e => setMotivo(e.target.value)} style={input}>{MOTIVI_TOLTA.map(m => <option key={m}>{m}</option>)}</select>
          {motivo === "Altro" && <input value={altro} onChange={e => setAltro(e.target.value)} placeholder="Scrivere il motivo" maxLength={200} style={{ ...input, flex: 1 }} />}
          <button disabled={lavoro} onClick={togli} style={btn(true, C.red)}>Conferma: togli</button>
          <span style={{ color: C.muted }}>Resta conservata e si può rimettere.</span>
        </div>
      )}
      {modo === "blocca" && (
        <div style={{ ...pannello, display: "block" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}><input type="radio" checked={genere === "indirizzo"} onChange={() => setGenere("indirizzo")} /> Solo l'indirizzo <b>{mail}</b></label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}><input type="radio" checked={genere === "dominio"} onChange={() => setGenere("dominio")} /> Tutto il dominio <b>@{dominio}</b> (tutti gli indirizzi dopo la @)</label>
          {legati.length > 0 && <div style={{ background: "#FDECEA", color: C.red, fontWeight: 700, borderRadius: 6, padding: "6px 8px", marginBottom: 6 }}>⚠️ Appartiene a {legati.join(", ")}: bloccandolo non entreranno più neppure le loro mail buone.</div>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            Motivo: <input value={motivoBlocco} onChange={e => setMotivoBlocco(e.target.value)} placeholder="Per esempio: pubblicità" maxLength={200} style={{ ...input, flex: 1 }} />
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={togliGia} onChange={() => setTogliGia(x => !x)} /> Togli anche le {quante === null ? "…" : quante} mail già entrate</label>
            <button disabled={lavoro} onClick={blocca} style={btn(true, C.red)}>Conferma: blocca</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ModuloMail({ tipo, record, onFatto }) {
  const [oggetto, setOggetto] = useState("");
  const [testo, setTesto] = useState("");
  const [firma, setFirma] = useState(FIRMA_PREDEFINITA);
  const [files, setFiles] = useState([]);
  const [invio, setInvio] = useState(false);
  const [permesso, setPermesso] = useState(null);
  const [codiceRichiesta, setCodiceRichiesta] = useState(nuovoCodiceRichiesta);
  useEffect(() => { let vivo = true; puoSpedireMail().then(p => { if (vivo) setPermesso(p); }); return () => { vivo = false; }; }, []);
  if (permesso === null) return <div style={{ ...scheda, fontSize: 13, color: C.muted }}>Controllo del permesso di spedire mail…</div>;
  if (!permesso) return (
    <div style={{ ...scheda, background: "#FDECEA", borderColor: C.red, fontSize: 13, color: C.red, fontWeight: 700 }}>
      Non ha il permesso di spedire mail dal programma: lo danno il Dott. Filippo Bizzarri, Teresa Demaria o Colabucci dalla cartella «Accessi».
    </div>
  );
  if (!record.email) return (
    <div style={{ ...scheda, background: "#FFF7E6", borderColor: "#E8A33D", fontSize: 13 }}>
      Nella scheda manca l'email: la mail si può mandare solo all'indirizzo «Email (per le comunicazioni)» della scheda. Premere «✏️ Modifica i dati» e scriverlo.
      {record.pec && <> La PEC ({record.pec}) non si usa per le mail del programma: una PEC vale solo se parte da una casella PEC.</>}
    </div>
  );
  const peso = files.reduce((s, f) => s + f.size, 0);
  const firmaUsata = firma.trim() || FIRMA_PREDEFINITA;
  async function manda() {
    if (invio) return;
    if (!oggetto.trim() || !testo.trim()) { alert("Scrivere l'oggetto e il testo."); return; }
    if (peso > LIMITE_ALLEGATI) { alert("Gli allegati superano 8 MB."); return; }
    if (!window.confirm(`Mandare la mail a ${record.email}?\n\nOggetto: ${oggetto}\nFirma: ${firmaUsata}\nAllegati: ${files.length ? files.map(f => f.name).join(", ") : "nessuno"}\n\nLa mail parte da ${CASELLA_COMUNICAZIONI}, con intestazione, logo e piè di pagina di Podere Verde. Le risposte arrivano lì ed entrano da sole nel Registro delle Comunicazioni.`)) return;
    setInvio(true);
    try {
      const r = await mandaMail({ tipo, id: record.id, oggetto: oggetto.trim(), testo, firma: firmaUsata, files, codiceRichiesta });
      setInvio(false); setCodiceRichiesta(nuovoCodiceRichiesta());
      alert(`✓ Mail mandata a ${r.destinatario} da ${r.mittente || CASELLA_COMUNICAZIONI}.`); onFatto?.(r);
    } catch (e) { setInvio(false); alert(`⚠️ ${e.message}`); }
  }
  const anteprima = { fontSize: 12, color: C.muted, whiteSpace: "pre-wrap" };
  return (
    <div style={{ ...scheda, borderColor: C.primary }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Da: <b style={{ color: C.text }}>{CASELLA_COMUNICAZIONI}</b> · A: <b style={{ color: C.text }}>{record.email}</b> · le risposte tornano a {CASELLA_COMUNICAZIONI} ed entrano nel registro</div>
      <input placeholder="Oggetto" value={oggetto} onChange={e => setOggetto(e.target.value)} style={{ ...input, width: "100%", marginBottom: 8 }} />
      <textarea placeholder="Testo della mail" value={testo} onChange={e => setTesto(e.target.value)} rows={7} style={{ ...input, width: "100%", height: "auto", padding: 8, marginBottom: 6 }} />
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginBottom: 8 }}>
        Firma: <input value={firma} onChange={e => setFirma(e.target.value)} maxLength={120} placeholder={FIRMA_PREDEFINITA} style={{ ...input, flex: 1 }} />
        <span style={{ color: C.muted }}>per esempio «Amministrazione – Teresa Demaria»</span>
      </label>
      <div style={{ border: `1px dashed ${C.border}`, borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, marginBottom: 4 }}>COME ARRIVA</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
          <img src="/logo512.png" alt="Logo di Podere Verde" style={{ width: 36, height: "auto" }} />
          <div style={{ ...anteprima, color: C.text, fontWeight: 700 }}>{INTESTAZIONE_MAIL}</div>
        </div>
        <div style={{ ...anteprima, color: C.text }}>{(testo.trim() || "(testo della mail)") + "\n\nCordiali saluti\n" + firmaUsata}</div>
        <div style={{ ...anteprima, fontSize: 10.5, borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 4 }}>{PIEDE_MAIL}</div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" multiple onChange={e => setFiles([...e.target.files])} />
        <span style={{ fontSize: 12, color: peso > LIMITE_ALLEGATI ? C.red : C.muted }}>{files.length ? `${files.length} allegati, ${(peso / 1048576).toFixed(2)} MB (massimo 8 MB)` : "nessun allegato"}</span>
        <button onClick={manda} disabled={invio} style={{ ...btn(true, C.green), marginLeft: "auto" }}>{invio ? "Invio…" : "✉️ Manda la mail"}</button>
      </div>
    </div>
  );
}

function ModuloRegistrazione({ tipo, record, telefonata, onFatto }) {
  const [r, setR] = useState(() => ({
    tipo: telefonata ? "Telefonata" : "Email", direzione: "inviata", data_ora: adessoLocale(),
    indirizzo: telefonata ? (record.telefono || record.telefono_2 || "") : (record.email || ""), oggetto: "", testo: "",
  }));
  const [files, setFiles] = useState([]);
  const [salva, setSalva] = useState(false);
  const imposta = (k, v) => setR(p => {
    const n = { ...p, [k]: v };
    if (k === "tipo" && !telefonata) n.indirizzo = v === "PEC" ? (record.pec || "") : (record.email || "");
    return n;
  });
  async function registra() {
    if (!r.oggetto.trim()) { alert(telefonata ? "Scrivere l'oggetto della telefonata." : "Scrivere l'oggetto."); return; }
    if (!r.data_ora) { alert("Scrivere data e ora."); return; }
    if (!window.confirm(`Registrare ${telefonata ? "la telefonata" : `la ${r.tipo === "PEC" ? "PEC" : "mail"}`} del ${quando(new Date(r.data_ora).toISOString())}?\n\nOggetto: ${r.oggetto}${files.length ? `\nAllegati: ${files.map(f => f.name).join(", ")}` : ""}\n\nLe comunicazioni registrate non si cancellano: si possono solo togliere dal registro, con il motivo, e rimettere.`)) return;
    setSalva(true);
    try {
      const allegati = files.length ? await caricaAllegati(files) : [];
      const c = await registraComunicazione({
        data_ora: new Date(r.data_ora).toISOString(), tipo: r.tipo, direzione: r.direzione, indirizzo: r.indirizzo.trim() || null,
        oggetto: r.oggetto.trim(), testo: r.testo.trim() || null, allegati, sezione: SEZIONE_A_MANO, esito: r.direzione === "ricevuta" ? "ricevuta" : (telefonata ? "effettuata" : "inviata"),
        cliente_id: tipo === "cliente" ? record.id : null, fornitore_id: tipo === "fornitore" ? record.id : null,
      });
      setSalva(false); onFatto?.(c);
    } catch (e) { setSalva(false); alert(`⚠️ Non registrata:\n\n${e.message}`); }
  }
  const etichetta = t => <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 3 }}>{t}</div>;
  return (
    <div style={{ ...scheda, borderColor: C.primary }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginBottom: 8 }}>
        {!telefonata && <div>{etichetta("Tipo")}<select value={r.tipo} onChange={e => imposta("tipo", e.target.value)} style={{ ...input, width: "100%" }}>{TIPI_COMUNICAZIONE.filter(t => t !== "Telefonata").map(t => <option key={t}>{t}</option>)}</select></div>}
        <div>{etichetta("Direzione")}<select value={r.direzione} onChange={e => imposta("direzione", e.target.value)} style={{ ...input, width: "100%" }}><option value="inviata">{telefonata ? "fatta da noi" : "mandata da noi"}</option><option value="ricevuta">{telefonata ? "ricevuta" : "ricevuta da loro"}</option></select></div>
        <div>{etichetta("Data e ora")}<input type="datetime-local" value={r.data_ora} onChange={e => imposta("data_ora", e.target.value)} style={{ ...input, width: "100%" }} /></div>
        <div>{etichetta(telefonata ? "Numero di telefono" : "Indirizzo")}<input value={r.indirizzo} onChange={e => imposta("indirizzo", e.target.value)} style={{ ...input, width: "100%" }} /></div>
      </div>
      {etichetta(telefonata ? "Oggetto della telefonata" : "Oggetto")}
      <input value={r.oggetto} onChange={e => imposta("oggetto", e.target.value)} style={{ ...input, width: "100%", marginBottom: 8 }} />
      {etichetta(telefonata ? "Cosa ci si è detti" : "Testo (si può incollare)")}
      <textarea value={r.testo} onChange={e => imposta("testo", e.target.value)} rows={4} style={{ ...input, width: "100%", height: "auto", padding: 8, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {!telefonata && <>{etichetta("File della mail o della PEC (.eml, .pdf, ricevute)")}<input type="file" multiple onChange={e => setFiles([...e.target.files])} /></>}
        <button onClick={registra} disabled={salva} style={{ ...btn(true, C.green), marginLeft: "auto" }}>{salva ? "Registrazione…" : "✓ Registra"}</button>
      </div>
    </div>
  );
}
