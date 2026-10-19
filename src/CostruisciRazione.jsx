import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaNumero } from "./parsingUtils";
import { calcolaRazione, TIPI_ALIMENTAZIONE, alimentoAmmesso } from "./calcoloRazione";
import { caricaDatiRazioni, righeVuote, righeDaAlimenti, ANNO_CORRENTE as ANNO } from "./RazioniBoviniDati";
import { GraficoCopertura, TotaleCosto, TabellaFabbisogno, euro, testoQuantita, bottone as btn } from "./RazioneViste";

// Alimentaria → Razioni Bovini → Costruisci razione (versione 244; nata nella 243).
// Tipo di alimentazione: libera, naturale (niente mangimi composti) o con mangimi (foraggi, orzo e mangimi);
// con «Carica la razione di riferimento» si parte dalla razione delle schede del 17/10/2026.
// Si lavora su un capo; poi numero di capi e box. Le razioni salvate stanno in ci_razioni_salvate,
// la stessa tabella usata dall'app Podere Verde: ciò che si salva qui si vede anche nell'app, e viceversa.


export default function CostruisciRazione() {
  const [alimenti, setAlimenti] = useState([]);
  const [classi, setClassi] = useState([]);
  const [ambienti, setAmbienti] = useState([]);
  const [prezzi, setPrezzi] = useState({});
  const [salvate, setSalvate] = useState([]);
  const [riferimento, setRiferimento] = useState([]);
  const [tipo, setTipo] = useState("libera");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState(null);
  const [messaggio, setMessaggio] = useState(null);

  const [classe, setClasse] = useState("");
  const [numeroCapi, setNumeroCapi] = useState(1);
  const [ambiente, setAmbiente] = useState("");
  const [nome, setNome] = useState("");
  const [note, setNote] = useState("");
  const [righe, setRighe] = useState(righeVuote());
  const [idAperta, setIdAperta] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { carica(); }, []);

  async function carica() {
    setCaricamento(true); setErrore(null);
    try {
      const d = await caricaDatiRazioni({ salvate: true });
      setAlimenti(d.alimenti); setClassi(d.classi); setAmbienti(d.ambienti); setPrezzi(d.prezzi);
      setSalvate(d.salvate); setRiferimento(d.riferimento);
      if (!classe && d.classi.length) setClasse(d.classi[0].classe);
    } catch (e) { setErrore(e.message); }
    setCaricamento(false);
  }

  const alimentiPerNome = useMemo(() => Object.fromEntries(alimenti.map(a => [a.nome, a])), [alimenti]);
  const classeRiga = classi.find(c => c.classe === classe);
  const ris = useMemo(() => calcolaRazione(classeRiga, righe, alimentiPerNome, prezzi, numeroCapi), [classeRiga, righe, alimentiPerNome, prezzi, numeroCapi]);

  function cambiaRiga(i, campo, valore) {
    setRighe(rs => rs.map((r, j) => (j === i ? { ...r, [campo]: valore, ...(campo === "alimento" && !valore ? { quantita: "" } : {}) } : r)));
  }

  // cambiando tipo si tolgono gli alimenti non ammessi
  function cambiaTipo(t) {
    setTipo(t);
    setRighe(rs => rs.map(r => (r.alimento && !alimentoAmmesso(t, alimentiPerNome[r.alimento]) ? { ...r, alimento: "", quantita: "" } : r)));
  }

  const rifClasse = riferimento.find(r => r.tipo_alimentazione === tipo && r.classe === classe);
  function caricaRiferimento() {
    if (!rifClasse) return;
    setRighe(righeDaAlimenti(rifClasse.alimenti));
    setMessaggio({ tipo: "info", testo: `Caricata la razione di riferimento (${tipo === "naturale" ? "alimentazione naturale" : "alimentazione con mangimi"}) di «${classe}». Ora la può modificare.` + (rifClasse.nota ? " ⚠️ " + rifClasse.nota : "") });
  }

  function nuova() {
    setIdAperta(null); setNome(""); setNote(""); setRighe(righeVuote()); setNumeroCapi(1); setAmbiente(""); setMessaggio(null);
  }

  function apri(id) {
    const r = salvate.find(s => String(s.id) === String(id));
    if (!r) { nuova(); return; }
    setIdAperta(r.id); setNome(r.nome || ""); setNote(r.note || ""); setClasse(r.classe); setNumeroCapi(r.numero_capi || 1); setAmbiente(r.ambiente || "");
    setTipo(r.tipo_alimentazione || "libera");
    setRighe(righeDaAlimenti(r.alimenti));
    setMessaggio({ tipo: "info", testo: `Aperta «${r.nome}» — salvata da ${r.creata_da || "—"} (${r.origine === "app" ? "dall'app" : "dal programma"}).` });
  }

  async function salva(comeNuova) {
    if (!nome.trim()) { setMessaggio({ tipo: "errore", testo: "Scriva il nome della razione prima di salvare." }); return; }
    if (!righe.some(r => r.alimento && Number(r.quantita) > 0)) { setMessaggio({ tipo: "errore", testo: "La razione non ha alimenti." }); return; }
    setSalvando(true); setMessaggio(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const record = {
        nome: nome.trim(), classe, tipo_alimentazione: tipo, numero_capi: Math.max(1, parseInt(numeroCapi, 10) || 1), ambiente: ambiente || null, note: note || null,
        alimenti: righe.map((r, k) => ({ posizione: k, gruppo: r.gruppo, alimento: r.alimento || null, quantita: r.alimento && r.quantita !== "" ? Number(r.quantita) : null, unita: alimentiPerNome[r.alimento]?.unita_dose || "kg" })).filter(x => x.alimento),
        costo_capo_giorno: ris.costi.completo ? Number(ris.costi.capoGiorno.toFixed(4)) : null,
        anno_prezzi: ANNO, creata_da: u?.user?.email || null, origine: "programma",
      };
      let res;
      if (idAperta && !comeNuova) res = await supabase.from("ci_razioni_salvate").update(record).eq("id", idAperta).select().single();
      else res = await supabase.from("ci_razioni_salvate").insert([record]).select().single();
      if (res.error) throw new Error(res.error.message);
      setIdAperta(res.data.id);
      const { data: rs } = await supabase.from("ci_razioni_salvate").select("*").order("updated_at", { ascending: false });
      setSalvate(rs || []);
      setMessaggio({ tipo: "ok", testo: `Razione «${record.nome}» salvata. Si vede anche nell'app Podere Verde.` });
    } catch (e) { setMessaggio({ tipo: "errore", testo: "Salvataggio non riuscito: " + e.message }); }
    setSalvando(false);
  }

  async function elimina() {
    if (!idAperta) return;
    if (!window.confirm(`Eliminare la razione «${nome}»? Sparisce anche dall'app.`)) return;
    const { error } = await supabase.from("ci_razioni_salvate").delete().eq("id", idAperta);
    if (error) { setMessaggio({ tipo: "errore", testo: error.message }); return; }
    setSalvate(s => s.filter(x => x.id !== idAperta)); nuova();
    setMessaggio({ tipo: "ok", testo: "Razione eliminata." });
  }

  const box = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 };
  const sel = { padding: "7px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: "#FFF8E1", width: "100%" };
  const lab = { fontSize: 12, color: C.muted, display: "block", marginBottom: 3 };

  if (caricamento) return <div style={{ padding: 20, color: C.muted }}>Caricamento…</div>;
  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;

  return (
    <div style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>🥣 Costruisci razione</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13 }}>
        Si lavora su un capo: scelga la classe e gli alimenti, scriva le quantità e guardi le barre riempirsi. Poi scriva il numero di capi e scelga il box. Prezzi: media delle fatture del {ANNO}, pesata sulle quantità acquistate.
      </p>

      {/* razioni salvate */}
      <div style={{ ...box, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 260px" }}>
          <label style={lab}>Razioni salvate (programma e app)</label>
          <select value={idAperta || ""} onChange={e => apri(e.target.value)} style={sel}>
            <option value="">— razione nuova —</option>
            {salvate.map(s => <option key={s.id} value={s.id}>{s.nome} · {s.classe} · {s.origine === "app" ? "app" : "programma"}</option>)}
          </select>
        </div>
        <button onClick={nuova} style={btn(C.muted)}>Nuova</button>
        <button onClick={() => salva(false)} disabled={salvando} style={btn(C.primary)}>{idAperta ? "Salva modifiche" : "Salva razione"}</button>
        {idAperta && <button onClick={() => salva(true)} disabled={salvando} style={btn(C.blue)}>Salva come nuova</button>}
        {idAperta && <button onClick={elimina} style={btn(C.red)}>Elimina</button>}
      </div>
      {messaggio && <div style={{ ...box, padding: 10, fontSize: 13, color: messaggio.tipo === "errore" ? C.red : messaggio.tipo === "ok" ? C.green : C.text }}>{messaggio.testo}</div>}

      {/* scelte */}
      <div style={{ ...box, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div><label style={lab}>Tipo di alimentazione</label>
          <select value={tipo} onChange={e => cambiaTipo(e.target.value)} style={sel}>{TIPI_ALIMENTAZIONE.map(t => <option key={t.valore} value={t.valore}>{t.etichetta}</option>)}</select></div>
        <div><label style={lab}>Classe</label>
          <select value={classe} onChange={e => setClasse(e.target.value)} style={sel}>{classi.map(c => <option key={c.id}>{c.classe}</option>)}</select></div>
        <div><label style={lab}>Numero di capi</label>
          <input type="number" min={1} value={numeroCapi} onChange={e => setNumeroCapi(e.target.value)} style={sel} /></div>
        <div><label style={lab}>Box o ambiente</label>
          <select value={ambiente} onChange={e => setAmbiente(e.target.value)} style={sel}><option value="">—</option>{ambienti.map(a => <option key={a.id}>{a.nome}</option>)}</select></div>
        <div><label style={lab}>Nome della razione</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="es. Box 3 – meno orzo" style={sel} /></div>
      </div>
      {classeRiga && <div style={{ fontSize: 12, color: C.muted, marginTop: -8, marginBottom: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span>Peso vivo {formattaNumero(classeRiga.peso_vivo_kg, 0)} kg · crescita {classeRiga.crescita_kg_giorno ? formattaNumero(classeRiga.crescita_kg_giorno, 2) + " kg al giorno" : "—"}</span>
        {tipo !== "libera" && <button onClick={caricaRiferimento} disabled={!rifClasse} style={{ ...btn(C.blue), padding: "5px 10px", fontSize: 12 }}>Carica la razione di riferimento</button>}
      </div>}

      <GraficoCopertura ris={ris} soglia={classeRiga?.soglia_eccesso_pct} />

      {/* alimenti */}
      <div style={box}>
        <div style={{ fontWeight: 700, color: C.primary, marginBottom: 10 }}>Alimenti della razione</div>
        <table style={{ fontSize: 13 }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>
            {["Gruppo", "Alimento", "Quantità al giorno per capo", "Prezzo € per tonnellata", "€ al giorno per capo", "Quantità al giorno per tutti i capi", "€ al giorno per tutti i capi"].map(h => <th key={h} style={{ padding: 6, fontSize: 11.5 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {righe.map((r, i) => {
              const rc = ris.righe[i]; const a = alimentiPerNome[r.alimento];
              if (!r.alimento && !alimenti.some(x => x.gruppo === r.gruppo && alimentoAmmesso(tipo, x))) return null;
              const grammi = a?.unita_dose === "grammi" || r.gruppo === "Integratore minerale";
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: 6, color: C.muted, fontSize: 12 }}>{r.etichetta}</td>
                  <td style={{ padding: 6 }}>
                    <select value={r.alimento} onChange={e => cambiaRiga(i, "alimento", e.target.value)} style={sel}>
                      <option value="">—</option>
                      {alimenti.filter(x => x.gruppo === r.gruppo && alimentoAmmesso(tipo, x)).map(x => <option key={x.id}>{x.nome}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                    <input type="number" step={grammi ? 1 : 0.05} min={0} value={r.quantita} disabled={!r.alimento} onChange={e => cambiaRiga(i, "quantita", e.target.value)} style={{ ...sel, width: 90, textAlign: "right" }} /> {grammi ? "g" : "kg"}
                  </td>
                  <td style={{ padding: 6, textAlign: "right", color: rc?.fonte === "listino" ? "#8A5A00" : C.text }}>{r.alimento ? (rc?.prezzoEuroT ? formattaNumero(rc.prezzoEuroT, 2) + (rc.fonte === "listino" ? " (listino)" : "") : "prezzo mancante") : ""}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{rc?.costoCapo != null ? formattaNumero(rc.costoCapo, 3) : ""}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{rc?.kg > 0 ? (grammi ? testoQuantita(Number(r.quantita) * ris.numeroCapi, true) : testoQuantita(rc.kgTutti)) : ""}</td>
                  <td style={{ padding: 6, textAlign: "right", fontWeight: 700 }}>{rc?.costoTutti != null ? formattaNumero(rc.costoTutti, 3) : ""}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr style={{ background: "#DCE8D8", fontWeight: 800 }}>
            <td colSpan={4} style={{ padding: 8 }}>TOTALE COSTO AL GIORNO</td>
            <td style={{ padding: 8, textAlign: "right" }}>{euro(ris.costi.capoGiorno, 3)}</td>
            <td></td>
            <td style={{ padding: 8, textAlign: "right" }}>{euro(ris.costi.tuttiGiorno, 3)}</td>
          </tr></tfoot>
        </table>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Sostanza secca della razione: {formattaNumero(ris.sostanzaSeccaKg, 2)} kg per capo · concentrati sulla sostanza secca: {formattaNumero(ris.quotaConcentratoPct, 0)}%</div>
      </div>

      <TotaleCosto ris={ris} />

      <TabellaFabbisogno ris={ris}>
        <div style={{ marginTop: 10 }}><label style={lab}>Note sulla razione</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ ...sel, fontFamily: "inherit" }} /></div>
      </TabellaFabbisogno>
    </div>
  );
}

