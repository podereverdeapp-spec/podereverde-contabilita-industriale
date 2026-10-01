import { useState, useEffect, useMemo, Fragment } from "react";
import { C } from "./style";
import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";
import { esportaExcel } from "./esportaExcel";

// Modelli 4 → Elenco dei Modelli 4
// SOLA LETTURA dell'archivio dei modelli 4 tenuto dall'app Podere Verde (tabelle
// modelli4_documenti e modelli4_capi, PDF nel bucket privato «modelli4»). L'archivio si
// aggiorna da solo ogni ora dalle mail di Stefano Cortesi. Qui non si scrive niente.
// Regole concordate: le uscite di Podere Verde sono solo tipo_movimento = 'Uscita da
// Podere Verde'; un documento si identifica con numero + codice di controllo; i numeri
// emessi due volte si segnalano e non si decide quale versione vale.

// La sezione riguarda solo Podere Verde: entrate e uscite dell'azienda. I documenti
// in cui Podere Verde non compare (uscite della Società Agricola Aurelia verso il macello)
// non si mostrano.
const eUscitaPV = d => d.tipo_movimento === "Uscita da Podere Verde";
const eEntrataPV = d => (d.tipo_movimento || "").startsWith("Ingresso in Podere Verde");
const MOVIMENTI = [
  { id: "tutti", label: "Entrate e uscite di Podere Verde", filtro: d => eUscitaPV(d) || eEntrataPV(d) },
  { id: "uscite", label: "Solo uscite da Podere Verde", filtro: eUscitaPV },
  { id: "entrate", label: "Solo entrate in Podere Verde", filtro: eEntrataPV },
];
const COLORE_SPECIE = { Bovini: C.bovini, Suini: C.suini, Ovini: C.ovini, Ovicaprini: C.ovini };

function dataItaliana(iso) {
  if (!iso) return "—";
  const [a, m, g] = String(iso).slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}
const dataRif = d => d.data_uscita || d.data_documento || "";
const urlMail = id => `https://mail.google.com/mail/?authuser=filippobizz4@gmail.com#all/${id}`;
const etichettaCapo = c => (c.matricola && !c.matricola.startsWith("Marchio")) ? c.matricola : `${c.matricola || "Insieme"}${c.riferimento_insieme ? ` — insieme ${c.riferimento_insieme}` : ""}`;

export default function Modelli4() {
  const [documenti, setDocumenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [movimento, setMovimento] = useState("tutti");
  const [anno, setAnno] = useState("tutti");
  const [specie, setSpecie] = useState("tutte");
  const [destinazione, setDestinazione] = useState("tutte");
  const [testo, setTesto] = useState("");
  const [aperti, setAperti] = useState(() => new Set());
  const [apertura, setApertura] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await fetchAllPages((da, a) => supabase
          .from("modelli4_documenti").select("*, modelli4_capi(*)")
          .order("data_documento", { ascending: false }).order("id", { ascending: false }).range(da, a));
        if (error) throw new Error(error.message);
        setDocumenti((data || []).filter(d => eUscitaPV(d) || eEntrataPV(d)));
      } catch (err) { setErrore(err.message); }
      setLoading(false);
    })();
  }, []);

  // Numeri emessi due volte con codice di controllo diverso (stessa specie)
  const doppi = useMemo(() => {
    const m = new Map();
    documenti.forEach(d => {
      const k = `${d.specie}|${d.numero_documento}`;
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(d.codice_controllo);
    });
    return new Set([...m.entries()].filter(([, s]) => s.size > 1).map(([k]) => k));
  }, [documenti]);
  const eDoppio = d => doppi.has(`${d.specie}|${d.numero_documento}`);

  const anni = useMemo(() => [...new Set(documenti.map(d => dataRif(d).slice(0, 4)).filter(Boolean))].sort().reverse(), [documenti]);
  const specieDisponibili = useMemo(() => [...new Set(documenti.map(d => d.specie).filter(Boolean))].sort(), [documenti]);

  const visibili = useMemo(() => {
    const t = testo.trim().toLowerCase();
    const filtroMov = MOVIMENTI.find(m => m.id === movimento).filtro;
    return documenti.filter(d =>
      filtroMov(d) &&
      (anno === "tutti" || dataRif(d).startsWith(anno)) &&
      (specie === "tutte" || d.specie === specie) &&
      (destinazione === "tutte" || d.destinazione_tipo === destinazione) &&
      (!t || [d.numero_documento, d.destinatario, d.trasportatore, d.email_oggetto, ...(d.modelli4_capi || []).map(c => `${c.matricola} ${c.riferimento_insieme || ""} ${c.razza || ""}`)]
        .join(" ").toLowerCase().includes(t))
    ).sort((a, b) => dataRif(b).localeCompare(dataRif(a)) || b.id - a.id);
  }, [documenti, movimento, anno, specie, destinazione, testo]);

  const capiPerSpecie = specieDisponibili.map(s => ({
    s, documenti: visibili.filter(d => d.specie === s).length,
    capi: visibili.filter(d => d.specie === s).reduce((t, d) => t + (Number(d.numero_capi) || 0), 0),
  })).filter(x => x.documenti > 0);
  const nDoppi = visibili.filter(eDoppio).length;

  async function apriPdf(d) {
    // La finestra si apre subito (altrimenti il browser la blocca), poi riceve l'indirizzo firmato
    const finestra = window.open("", "_blank");
    setApertura(d.id);
    try {
      const { data, error } = await supabase.storage.from("modelli4").createSignedUrl(d.file_percorso, 300);
      if (error) throw new Error(error.message);
      if (finestra) finestra.location.href = data.signedUrl; else window.location.href = data.signedUrl;
    } catch (err) {
      if (finestra) finestra.close();
      setErrore(`PDF non disponibile (${d.file_percorso}): ${err.message}`);
    }
    setApertura(null);
  }

  function apriChiudi(id) {
    setAperti(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function esporta() {
    const righeDoc = visibili.map(d => ({
      "Data del movimento": dataItaliana(d.data_uscita), "Data del documento": dataItaliana(d.data_documento),
      "Numero del documento": d.numero_documento, "Codice di controllo": d.codice_controllo,
      "Specie": d.specie, "Numero di capi": Number(d.numero_capi) || null, "Movimento": eUscitaPV(d) ? "Uscita da Podere Verde" : `Entrata in Podere Verde da ${d.proprietario_partenza || d.codice_azienda_partenza}`,
      "Tipo di destinazione": d.destinazione_tipo, "Destinatario": d.destinatario, "Codice del destinatario": d.destinatario_codice,
      "Data del trasporto": dataItaliana(d.data_trasporto), "Ora di partenza": d.ora_partenza, "Trasportatore": d.trasportatore,
      "Numero emesso due volte": eDoppio(d) ? "Sì — chiedere quale versione è valida" : "", "Nome del file": d.file_nome,
    }));
    const righeCapi = visibili.flatMap(d => (d.modelli4_capi || []).map(c => ({
      "Numero del documento": d.numero_documento, "Codice di controllo": d.codice_controllo, "Data di uscita": dataItaliana(d.data_uscita),
      "Destinatario": d.destinatario, "Specie": c.specie, "Matricola o marchio": c.matricola, "Riferimento dell'insieme": c.riferimento_insieme,
      "Categoria": c.categoria, "Numero di capi": Number(c.numero_capi) || null, "Sesso": c.sesso, "Razza": c.razza,
      "Data di nascita": dataItaliana(c.data_nascita), "Età in mesi": c.eta_mesi, "Provenienza": c.provenienza, "Data di ingresso": dataItaliana(c.data_ingresso),
    })));
    const nomeMov = MOVIMENTI.find(m => m.id === movimento).label.replace(/[^A-Za-z]+/g, "_");
    esportaExcel(`Modelli_4_${nomeMov}_${anno === "tutti" ? "tutti_gli_anni" : anno}`, [
      { nome: "Documenti", righe: righeDoc }, { nome: "Capi", righe: righeCapi },
    ]);
  }

  if (loading) return <div style={{ padding: 20, color: C.muted }}>Lettura dell'archivio dei modelli 4...</div>;

  const sel = { height: 36, padding: "0 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, background: "#fff" };

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Elenco dei Modelli 4</h1>
        <button onClick={esporta} disabled={!visibili.length}
          style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700 }}>
          📥 Esporta Excel
        </button>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
        L'archivio dei modelli 4 (documenti di accompagnamento della Banca Dati Nazionale) tenuto dall'app Podere Verde: {documenti.length} documenti{anni.length ? ` dal ${anni[anni.length - 1]} a oggi` : ""}.
        Si aggiorna da solo ogni ora con le mail di Stefano Cortesi. Sola consultazione: «Apri il PDF» mostra il documento originale; cliccando su una riga si vedono i capi.
      </p>
      {errore && <div style={{ color: C.red, marginBottom: 12, fontSize: 13 }}>⚠️ {errore}</div>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <select value={movimento} onChange={e => setMovimento(e.target.value)} style={sel}>
          {MOVIMENTI.map(m => <option key={m.id} value={m.id}>{m.label} ({documenti.filter(m.filtro).length})</option>)}
        </select>
        <select value={anno} onChange={e => setAnno(e.target.value)} style={sel}>
          <option value="tutti">Tutti gli anni</option>
          {anni.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={specie} onChange={e => setSpecie(e.target.value)} style={sel}>
          <option value="tutte">Tutte le specie</option>
          {specieDisponibili.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={destinazione} onChange={e => setDestinazione(e.target.value)} style={sel}>
          <option value="tutte">Macello e allevamento</option>
          <option value="Macello">Solo macello</option>
          <option value="Allevamento">Solo allevamento</option>
        </select>
        <input value={testo} onChange={e => setTesto(e.target.value)} placeholder="Cerca matricola, numero del documento, macello, trasportatore"
          style={{ ...sel, flex: "1 1 280px", minWidth: 220 }} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, fontSize: 12.5 }}>
        <span style={{ padding: "4px 10px", borderRadius: 6, background: C.primary, color: "#fff", fontWeight: 700 }}>{visibili.length} documenti</span>
        {capiPerSpecie.map(({ s, documenti: n, capi }) => (
          <span key={s} style={{ padding: "4px 10px", borderRadius: 6, background: (COLORE_SPECIE[s] || C.accent) + "22", color: COLORE_SPECIE[s] || C.accent, fontWeight: 700 }}>
            {s}: {n} documenti, {capi} capi
          </span>
        ))}
        {nDoppi > 0 && <span style={{ padding: "4px 10px", borderRadius: 6, background: C.yellow + "33", color: "#8a6500", fontWeight: 700 }}>⚠️ {nDoppi} con numero emesso due volte</span>}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: C.primary, color: "#fff", textAlign: "left" }}>
              <th style={th}>Data del movimento</th>
              <th style={th}>Numero del documento</th>
              <th style={th}>Movimento</th>
              <th style={th}>Specie</th>
              <th style={{ ...th, textAlign: "right" }}>Capi</th>
              <th style={th}>Destinazione</th>
              <th style={th}>Trasportatore</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {visibili.map((d, i) => {
              const aperto = aperti.has(d.id);
              const colore = COLORE_SPECIE[d.specie] || C.accent;
              return (
                <Fragment key={d.id}>
                  <tr onClick={() => apriChiudi(d.id)} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 ? C.bg : "#fff", cursor: "pointer" }}>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>{aperto ? "▾" : "▸"} {dataItaliana(d.data_uscita)}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{d.numero_documento}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>codice di controllo {d.codice_controllo || "—"} · documento del {dataItaliana(d.data_documento)}</div>
                      {eDoppio(d) && <div style={{ fontSize: 11, color: "#8a6500", fontWeight: 700 }}>⚠️ Numero emesso due volte: chiedere quale versione è valida</div>}
                    </td>
                    <td style={td}>
                      {eUscitaPV(d)
                        ? <span style={{ padding: "1px 7px", borderRadius: 5, fontSize: 11, fontWeight: 800, background: C.red + "18", color: C.red }}>USCITA</span>
                        : <span style={{ padding: "1px 7px", borderRadius: 5, fontSize: 11, fontWeight: 800, background: C.green + "22", color: C.green }}>ENTRATA</span>}
                      {eEntrataPV(d) && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>da {d.proprietario_partenza || d.codice_azienda_partenza}</div>}
                    </td>
                    <td style={td}><span style={{ padding: "1px 7px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: colore + "22", color: colore }}>{d.specie}</span></td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{d.numero_capi ?? "—"}</td>
                    <td style={td}>
                      <div><b>{d.destinazione_tipo || "—"}</b> · {d.destinatario || "—"}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{d.destinatario_indirizzo || ""}</div>
                    </td>
                    <td style={td}>
                      <div>{d.trasportatore || "—"}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{d.data_trasporto ? `${dataItaliana(d.data_trasporto)}${d.ora_partenza ? ` ore ${d.ora_partenza}` : ""}` : ""}</div>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => apriPdf(d)} disabled={apertura === d.id || !d.file_percorso}
                        style={{ padding: "5px 12px", borderRadius: 7, border: `1.5px solid ${C.primary}`, color: "#fff", background: C.primary, fontWeight: 700, fontSize: 12 }}>
                        {apertura === d.id ? "Apertura..." : "Apri il PDF"}
                      </button>
                      {d.email_id && (
                        <a href={urlMail(d.email_id)} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, fontSize: 11.5, color: C.primary }}>mail</a>
                      )}
                    </td>
                  </tr>
                  {aperto && (
                    <tr style={{ background: "#fff" }}>
                      <td colSpan={8} style={{ padding: "6px 14px 14px 34px" }}>
                        <table style={{ fontSize: 12, background: C.bg, borderRadius: 8 }}>
                          <thead>
                            <tr style={{ color: C.muted, textAlign: "left" }}>
                              <th style={th2}>Matricola o marchio</th><th style={th2}>Categoria</th><th style={{ ...th2, textAlign: "right" }}>Capi</th>
                              <th style={th2}>Sesso</th><th style={th2}>Razza</th><th style={th2}>Data di nascita</th><th style={th2}>Età in mesi</th><th style={th2}>Provenienza</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(d.modelli4_capi || []).map(c => (
                              <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}>
                                <td style={td2}><b>{etichettaCapo(c)}</b></td><td style={td2}>{c.categoria || "—"}</td>
                                <td style={{ ...td2, textAlign: "right" }}>{c.numero_capi ?? "—"}</td><td style={td2}>{c.sesso || "—"}</td>
                                <td style={td2}>{c.razza || "—"}</td><td style={td2}>{dataItaliana(c.data_nascita)}</td>
                                <td style={td2}>{c.eta_mesi ?? "—"}</td><td style={td2}>{c.provenienza || "—"}</td>
                              </tr>
                            ))}
                            {!(d.modelli4_capi || []).length && <tr><td colSpan={8} style={{ ...td2, color: C.muted }}>Nessun capo registrato per questo documento.</td></tr>}
                          </tbody>
                        </table>
                        {d.note && <div style={{ fontSize: 12, marginTop: 6 }}><b>Note:</b> {d.note}</div>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {visibili.length === 0 && (
              <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: C.muted, padding: 20 }}>Nessun documento con questi filtri.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: "8px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" };
const td = { padding: "7px 10px", verticalAlign: "top" };
const th2 = { padding: "5px 8px", fontSize: 11, fontWeight: 700 };
const td2 = { padding: "4px 8px", verticalAlign: "top" };
