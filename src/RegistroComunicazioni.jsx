import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { esportaExcel } from "./esportaExcel";
import { btn, input, scheda } from "./stileAruba";
import { ElencoComunicazioni } from "./SchedaAnagrafica";
import { caricaComunicazioni, caricaAnagrafiche, intestatarioDi, quando, TIPI_COMUNICAZIONE } from "./anagrafiche";

// Versione 304 — Registro delle Comunicazioni: tutte le mail, PEC e telefonate con clienti e fornitori, e le mail
// partite dalle altre sezioni del programma (fatture all'amministrazione, report mensile). Decisione del Dott. Bizzarri
// del 26/10/2026 (ore 16:16–16:49): il registro si legge per data e ora; le righe non si cancellano.

export default function RegistroComunicazioni() {
  const [righe, setRighe] = useState([]);
  const [clienti, setClienti] = useState([]);
  const [fornitori, setFornitori] = useState([]);
  const [errore, setErrore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ testo: "", tipo: "", sezione: "", dal: "", al: "", chi: "" });
  const [aperta, setAperta] = useState(null);

  useEffect(() => { (async () => {
    try {
      const [r, c, fo] = await Promise.all([caricaComunicazioni(), caricaAnagrafiche("cliente"), caricaAnagrafiche("fornitore")]);
      setRighe(r); setClienti(c); setFornitori(fo);
    } catch (e) { setErrore(e.message); }
    setLoading(false);
  })(); }, []);

  const intest = useMemo(() => new Map(righe.map(c => [c.chiave, intestatarioDi(c, clienti, fornitori)])), [righe, clienti, fornitori]);
  const nomeIntestatario = c => { const l = intest.get(c.chiave) || []; return l.length ? l.map(x => `${x.tipo === "cliente" ? "🤝" : "🏢"} ${x.nome}`).join(" · ") : <span style={{ color: C.muted }}>nessuno</span>; };
  const sezioni = useMemo(() => [...new Set(righe.map(r => r.sezione))].sort(), [righe]);

  const filtrate = useMemo(() => righe.filter(c => {
    if (f.tipo && c.tipo !== f.tipo) return false;
    if (f.sezione && c.sezione !== f.sezione) return false;
    const giorno = String(quando(c.data_ora)).slice(0, 10).split("/").reverse().join("-");
    if (f.dal && giorno < f.dal) return false;
    if (f.al && giorno > f.al) return false;
    const l = intest.get(c.chiave) || [];
    if (f.chi === "con" && !l.length) return false;
    if (f.chi === "senza" && l.length) return false;
    const q = f.testo.trim().toLowerCase();
    if (q && ![c.oggetto, c.testo, c.indirizzo, c.mittente, ...l.map(x => x.nome)].some(v => String(v || "").toLowerCase().includes(q))) return false;
    return true;
  }), [righe, f, intest]);

  function esporta() {
    esportaExcel("Registro_delle_Comunicazioni", [{ nome: "Comunicazioni", righe: filtrate.map(c => ({
      "Data e ora": quando(c.data_ora), "Tipo": c.tipo, "Direzione": c.direzione, "Cliente o fornitore": (intest.get(c.chiave) || []).map(x => `${x.tipo}: ${x.nome}`).join(" · "),
      "Destinatario o numero": c.indirizzo || "", "Oggetto": c.oggetto || "", "Testo": c.testo || "", "Da dove": c.sezione, "Esito": c.esito || "",
      "Allegati": (c.allegati || []).map(a => a.nome).join(", "), "Codice di invio": c.codice_invio || "", "Nota": c.note || "",
    })) }]);
  }

  const imposta = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ color: C.primary, fontSize: 24, margin: 0 }}>Registro delle Comunicazioni</h1>
        <button onClick={esporta} style={btn(false, C.green)}>📥 Esporta Excel</button>
      </div>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
        Tutte le comunicazioni, dalla più recente: le mail mandate dalla scheda dei clienti e dei fornitori, le mail, PEC e telefonate registrate a mano,
        le fatture mandate all'amministrazione e il report mensile. Ogni comunicazione compare anche nella scheda del cliente o del fornitore che ha
        quell'indirizzo email o PEC, o quel numero di telefono. Cliccando una riga si legge il testo. Le comunicazioni non si cancellano.
      </p>
      <div style={{ ...scheda, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Cerca in oggetto, testo, indirizzo, cliente o fornitore…" value={f.testo} onChange={e => imposta("testo", e.target.value)} style={{ ...input, flex: 1, minWidth: 240 }} />
        <select value={f.tipo} onChange={e => imposta("tipo", e.target.value)} style={input}><option value="">Tutti i tipi</option>{TIPI_COMUNICAZIONE.map(t => <option key={t}>{t}</option>)}</select>
        <select value={f.sezione} onChange={e => imposta("sezione", e.target.value)} style={input}><option value="">Da tutte le sezioni</option>{sezioni.map(s => <option key={s}>{s}</option>)}</select>
        <select value={f.chi} onChange={e => imposta("chi", e.target.value)} style={input}><option value="">Con e senza cliente o fornitore</option><option value="con">Solo di clienti e fornitori</option><option value="senza">Solo senza cliente o fornitore</option></select>
        <label style={{ fontSize: 12, color: C.muted }}>Dal <input type="date" value={f.dal} onChange={e => imposta("dal", e.target.value)} style={input} /></label>
        <label style={{ fontSize: 12, color: C.muted }}>al <input type="date" value={f.al} onChange={e => imposta("al", e.target.value)} style={input} /></label>
      </div>
      {errore && <p style={{ color: C.red, fontWeight: 700 }}>⚠️ {errore}{/ci_comunicazioni|does not exist|relation/i.test(errore) ? " — il database non ha ancora le strutture della versione 304 (file contabilita_strutture_v304.sql)." : ""}</p>}
      {loading ? <p style={{ color: C.muted }}>Caricamento…</p> : (
        <div style={scheda}>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>{filtrate.length} comunicazioni{filtrate.length !== righe.length ? ` su ${righe.length}` : ""}</div>
          <ElencoComunicazioni righe={filtrate} aperta={aperta} setAperta={setAperta} intestatario={nomeIntestatario} />
        </div>
      )}
    </div>
  );
}
