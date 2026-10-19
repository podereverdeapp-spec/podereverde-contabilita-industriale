import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaNumero } from "./parsingUtils";
import { GRUPPI_RIGHE, calcolaRazione } from "./calcoloRazione";

// Alimentaria → Costruisci razione (versione 243).
// Si lavora su un capo; poi numero di capi e box. Le razioni salvate stanno in ci_razioni_salvate,
// la stessa tabella usata dall'app Podere Verde: ciò che si salva qui si vede anche nell'app, e viceversa.

const ANNO = new Date().getFullYear();
const righeVuote = () => GRUPPI_RIGHE.map(g => ({ gruppo: g.gruppo, etichetta: g.etichetta, alimento: "", quantita: "" }));
const COLORE = { manca: C.red, coperto: C.green, eccessivo: "#E67E22", "—": C.muted };

export default function CostruisciRazione() {
  const [alimenti, setAlimenti] = useState([]);
  const [classi, setClassi] = useState([]);
  const [ambienti, setAmbienti] = useState([]);
  const [prezzi, setPrezzi] = useState({});
  const [salvate, setSalvate] = useState([]);
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
      const [a, f, amb, pr, rs] = await Promise.all([
        supabase.from("ci_alimenti_nutrizione").select("*").eq("attivo", true).order("ordine"),
        supabase.from("ci_fabbisogni_classi").select("*").order("ordine"),
        supabase.from("ci_ambienti_allevamento").select("*").eq("attivo", true).order("ordine"),
        supabase.from("ci_v_prezzi_alimenti_anno").select("*").eq("anno", ANNO),
        supabase.from("ci_razioni_salvate").select("*").order("updated_at", { ascending: false }),
      ]);
      for (const r of [a, f, amb, pr, rs]) if (r.error) throw new Error(r.error.message + " — il database ha le strutture della versione 243? (file contabilita_strutture_v243.sql)");
      setAlimenti(a.data || []); setClassi(f.data || []); setAmbienti(amb.data || []);
      const mp = {}; (pr.data || []).forEach(p => { mp[p.alimento] = p; }); setPrezzi(mp);
      setSalvate(rs.data || []);
      if (!classe && f.data?.length) setClasse(f.data[0].classe);
    } catch (e) { setErrore(e.message); }
    setCaricamento(false);
  }

  const alimentiPerNome = useMemo(() => Object.fromEntries(alimenti.map(a => [a.nome, a])), [alimenti]);
  const classeRiga = classi.find(c => c.classe === classe);
  const ris = useMemo(() => calcolaRazione(classeRiga, righe, alimentiPerNome, prezzi, numeroCapi), [classeRiga, righe, alimentiPerNome, prezzi, numeroCapi]);

  function cambiaRiga(i, campo, valore) {
    setRighe(rs => rs.map((r, j) => (j === i ? { ...r, [campo]: valore, ...(campo === "alimento" && !valore ? { quantita: "" } : {}) } : r)));
  }

  function nuova() {
    setIdAperta(null); setNome(""); setNote(""); setRighe(righeVuote()); setNumeroCapi(1); setAmbiente(""); setMessaggio(null);
  }

  function apri(id) {
    const r = salvate.find(s => String(s.id) === String(id));
    if (!r) { nuova(); return; }
    setIdAperta(r.id); setNome(r.nome || ""); setNote(r.note || ""); setClasse(r.classe); setNumeroCapi(r.numero_capi || 1); setAmbiente(r.ambiente || "");
    const base = righeVuote();
    (r.alimenti || []).forEach((x, k) => {
      const pos = Number.isInteger(x.posizione) ? x.posizione : k;
      if (base[pos]) base[pos] = { ...base[pos], alimento: x.alimento || "", quantita: x.quantita ?? "" };
    });
    setRighe(base);
    setMessaggio({ tipo: "info", testo: `Aperta «${r.nome}» — salvata da ${r.creata_da || "—"} (${r.origine === "app" ? "dall'app" : "dal programma"}).` });
  }

  async function salva(comeNuova) {
    if (!nome.trim()) { setMessaggio({ tipo: "errore", testo: "Scriva il nome della razione prima di salvare." }); return; }
    if (!righe.some(r => r.alimento && Number(r.quantita) > 0)) { setMessaggio({ tipo: "errore", testo: "La razione non ha alimenti." }); return; }
    setSalvando(true); setMessaggio(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const record = {
        nome: nome.trim(), classe, numero_capi: Math.max(1, parseInt(numeroCapi, 10) || 1), ambiente: ambiente || null, note: note || null,
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

  const euro = v => (v === null || v === undefined ? "—" : formattaNumero(v, 2) + " €");
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
        <div><label style={lab}>Classe</label>
          <select value={classe} onChange={e => setClasse(e.target.value)} style={sel}>{classi.map(c => <option key={c.id}>{c.classe}</option>)}</select></div>
        <div><label style={lab}>Numero di capi</label>
          <input type="number" min={1} value={numeroCapi} onChange={e => setNumeroCapi(e.target.value)} style={sel} /></div>
        <div><label style={lab}>Box o ambiente</label>
          <select value={ambiente} onChange={e => setAmbiente(e.target.value)} style={sel}><option value="">—</option>{ambienti.map(a => <option key={a.id}>{a.nome}</option>)}</select></div>
        <div><label style={lab}>Nome della razione</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="es. Box 3 – meno orzo" style={sel} /></div>
      </div>
      {classeRiga && <div style={{ fontSize: 12, color: C.muted, marginTop: -8, marginBottom: 12 }}>Peso vivo {formattaNumero(classeRiga.peso_vivo_kg, 0)} kg · crescita {classeRiga.crescita_kg_giorno ? formattaNumero(classeRiga.crescita_kg_giorno, 2) + " kg al giorno" : "—"}</div>}

      {/* grafico */}
      <div style={box}>
        <div style={{ fontWeight: 700, color: C.primary, marginBottom: 10 }}>Fabbisogno coperto per capo</div>
        {ris.voci.map(v => {
          const pct = v.pct === null ? 0 : v.pct;
          const w = Math.min(pct, 150) / 150 * 100;
          const col = COLORE[v.stato];
          const testo = v.pct === null ? "—" : `${Math.round(v.pct)}%` + (v.stato === "manca" ? " — manca" : v.stato === "eccessivo" ? " — ECCESSIVO" : "") + (v.stato === "manca" && v.incompleta?.length ? " (dati incompleti)" : "");
          return (
            <div key={v.chiave} style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0", fontSize: 12.5 }}>
              <div style={{ width: 170 }}>{v.nome}</div>
              <div style={{ flex: 1, height: 13, background: "#EEE", borderRadius: 3, position: "relative" }}>
                <div style={{ width: `${w}%`, height: "100%", background: col, borderRadius: 3, transition: "width .3s" }} />
                <div style={{ position: "absolute", left: "66.67%", top: -3, bottom: -3, borderLeft: "2px dashed #333" }} />
              </div>
              <div style={{ width: 210, textAlign: "right", fontWeight: 700, color: col }}>{testo}</div>
            </div>
          );
        })}
        <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Linea tratteggiata = 100% del fabbisogno · rosso: manca · verde: coperto · arancione: eccessivo (energia e proteine oltre il {classeRiga?.soglia_eccesso_pct || 110}%) · le barre si fermano al 150%.</div>
      </div>

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
              const grammi = a?.unita_dose === "grammi" || r.gruppo === "Integratore minerale";
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: 6, color: C.muted, fontSize: 12 }}>{r.etichetta}</td>
                  <td style={{ padding: 6 }}>
                    <select value={r.alimento} onChange={e => cambiaRiga(i, "alimento", e.target.value)} style={sel}>
                      <option value="">—</option>
                      {alimenti.filter(x => x.gruppo === r.gruppo).map(x => <option key={x.id}>{x.nome}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                    <input type="number" step={grammi ? 1 : 0.05} min={0} value={r.quantita} disabled={!r.alimento} onChange={e => cambiaRiga(i, "quantita", e.target.value)} style={{ ...sel, width: 90, textAlign: "right" }} /> {grammi ? "g" : "kg"}
                  </td>
                  <td style={{ padding: 6, textAlign: "right", color: rc?.fonte === "listino" ? "#8A5A00" : C.text }}>{r.alimento ? (rc?.prezzoEuroT ? formattaNumero(rc.prezzoEuroT, 2) + (rc.fonte === "listino" ? " (listino)" : "") : "prezzo mancante") : ""}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{rc?.costoCapo != null ? formattaNumero(rc.costoCapo, 2) : ""}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{rc?.kg > 0 ? formattaNumero(rc.kgTutti, grammi ? 2 : 1) + " kg" : ""}</td>
                  <td style={{ padding: 6, textAlign: "right", fontWeight: 700 }}>{rc?.costoTutti != null ? formattaNumero(rc.costoTutti, 2) : ""}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr style={{ background: "#DCE8D8", fontWeight: 800 }}>
            <td colSpan={4} style={{ padding: 8 }}>TOTALE COSTO AL GIORNO</td>
            <td style={{ padding: 8, textAlign: "right" }}>{euro(ris.costi.capoGiorno)}</td>
            <td></td>
            <td style={{ padding: 8, textAlign: "right" }}>{euro(ris.costi.tuttiGiorno)}</td>
          </tr></tfoot>
        </table>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Sostanza secca della razione: {formattaNumero(ris.sostanzaSeccaKg, 2)} kg per capo · concentrati sulla sostanza secca: {formattaNumero(ris.quotaConcentratoPct, 0)}%</div>
      </div>

      {/* TOTALE DEL COSTO */}
      <div style={{ ...box, background: "#EEF4EC", border: `2px solid ${C.primary}` }}>
        <div style={{ fontWeight: 800, color: C.primary, fontSize: 17, marginBottom: 10 }}>💶 Totale del costo</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          {[["Per capo al giorno", ris.costi.capoGiorno], ["Per capo all'anno", ris.costi.capoAnno], [`Per ${ris.numeroCapi} capi al giorno`, ris.costi.tuttiGiorno], [`Per ${ris.numeroCapi} capi al mese (30 giorni)`, ris.costi.tuttiMese], [`Per ${ris.numeroCapi} capi all'anno`, ris.costi.tuttiAnno], ["Per kg di crescita", ris.costi.perKgCrescita]].map(([t, v]) => (
            <div key={t} style={{ background: "#fff", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: C.muted }}>{t}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{euro(v)}</div>
            </div>
          ))}
        </div>
        {!ris.costi.completo && <div style={{ color: C.red, fontSize: 12.5, marginTop: 8, fontWeight: 700 }}>⚠️ Nel {ANNO} manca il prezzo di: {ris.prezziMancanti.join(", ")}. Il totale non è completo.</div>}
        {ris.prezziListino.length > 0 && <div style={{ color: "#8A5A00", fontSize: 12, marginTop: 6 }}>Prezzo di listino, non di fattura: {ris.prezziListino.join(", ")}.</div>}
      </div>

      {/* dettaglio */}
      <div style={box}>
        <div style={{ fontWeight: 700, color: C.primary, marginBottom: 10 }}>Fabbisogno e apporto per capo al giorno</div>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>{["Voce", "Fabbisogno", "Apporto", "Copertura", "Esito"].map(h => <th key={h} style={{ padding: 6 }}>{h}</th>)}</tr></thead>
          <tbody>{ris.voci.map(v => (
            <tr key={v.chiave} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: 6 }}>{v.nome}{v.unita && v.chiave !== "energia" ? ` (${v.unita})` : ""}</td>
              <td style={{ padding: 6, textAlign: "right" }}>{v.fabbisogno === null ? "—" : formattaNumero(v.fabbisogno, v.decimali)}</td>
              <td style={{ padding: 6, textAlign: "right" }}>{formattaNumero(v.apporto, v.decimali)}</td>
              <td style={{ padding: 6, textAlign: "right" }}>{v.pct === null ? "—" : Math.round(v.pct) + "%"}</td>
              <td style={{ padding: 6, color: COLORE[v.stato], fontWeight: 700 }}>
                {v.stato === "manca" ? `manca ${formattaNumero(v.mancaQuanto, v.decimali)}` : v.stato === "eccessivo" ? "ECCESSIVO" : v.stato === "coperto" ? "✓ coperto" : "—"}
                {v.incompleta?.length > 0 && <span style={{ color: "#8A5A00", fontWeight: 400 }}> · non analizzato o non dichiarato in: {v.incompleta.join(", ")}</span>}
              </td>
            </tr>))}</tbody>
        </table>
        <div style={{ marginTop: 10 }}><label style={lab}>Note sulla razione</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ ...sel, fontFamily: "inherit" }} /></div>
      </div>
    </div>
  );
}

function btn(colore) {
  return { background: colore, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
}
