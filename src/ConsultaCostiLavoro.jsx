import { Fragment, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";
import { C } from "./style";

// Versione 271 (21/10/2026): consultazione dei costi del lavoro caricati dai cedolini, chiesta dal Dott. Bizzarri:
// ore lavorate nell'anno (per persona e in totale), straordinari, ferie e permessi goduti e residui, malattia,
// costo e costo per ora, confronto con l'anno prima, cedolini in PDF, contributi da versare. Visibile solo
// all'amministratore e alle persone autorizzate (regole del database della versione 269).

const MESI = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const euro = (n) => (n == null || isNaN(n) ? "—" : Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const numero = (n) => (n == null || isNaN(n) || Number(n) === 0 ? "—" : Number(n).toLocaleString("it-IT", { maximumFractionDigits: 2 }));
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const th = { textAlign: "left", padding: "6px 7px", fontSize: 11.5, background: "#E3EDE0", borderBottom: `1px solid ${C.border}`, verticalAlign: "bottom" };
const thN = { ...th, textAlign: "right" };
const td = { padding: "5px 7px", fontSize: 12.5, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const tdN = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const tdT = { ...tdN, fontWeight: 700, background: "#F4F7F2" };

const SOMME = ["totale_lordo", "tfr_mese", "inps_azienda", "inail_azienda", "altri_contributi_azienda", "costo_totale", "netto_busta", "ore_ordinarie",
  "ore_straordinario", "ore_festivita_godute", "giorni_ferie_godute", "ore_permessi_goduti", "ore_rol_goduti", "giorni_malattia", "giorni_retribuiti"];

function somma(righe) {
  const t = Object.fromEntries(SOMME.map(k => [k, 0]));
  righe.forEach(r => SOMME.forEach(k => { t[k] += Number(r[k]) || 0; }));
  SOMME.forEach(k => { t[k] = r2(t[k]); });
  t.mesi = new Set(righe.filter(r => r.tipo === "mensile").map(r => r.mese)).size;
  t.contributi = r2(t.inps_azienda + t.inail_azienda + t.altri_contributi_azienda);
  t.costo_ora = t.ore_ordinarie ? r2(t.costo_totale / (t.ore_ordinarie + t.ore_straordinario)) : null;
  return t;
}
// residui: quelli dell'ultima busta mensile dell'anno
function residui(righe) {
  const m = righe.filter(r => r.tipo === "mensile").sort((a, b) => b.mese - a.mese)[0];
  return m ? { ferie: m.ferie_residue, permessi: m.permessi_residui, rol: m.rol_residui, festivita: m.festivita_residue, mese: m.mese } : {};
}

function Schede({ attiva, onChange, voci }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
      {voci.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)}
          style={{ border: `1px solid ${attiva === id ? C.primary : C.border}`, background: attiva === id ? C.primary : C.card, color: attiva === id ? "#fff" : C.text, borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700 }}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function ConsultaCostiLavoro() {
  const [righe, setRighe] = useState(null);
  const [contributi, setContributi] = useState([]);
  const [esclusioni, setEsclusioni] = useState([]);
  const [errore, setErrore] = useState("");
  const [anno, setAnno] = useState(null);
  const [persona, setPersona] = useState("tutte");
  const [scheda, setScheda] = useState("persone");
  const [aperta, setAperta] = useState(null);      // id della busta di cui si vedono le voci
  const [voci, setVoci] = useState({});

  useEffect(() => {
    (async () => {
      const { data, error } = await fetchAllPages((da, a) => supabase.from("ci_costo_lavoro_mensile")
        .select("*, ci_dipendenti(cognome_nome, codice_fiscale)").order("anno").order("mese").order("id").range(da, a));
      if (error) { setErrore("I dati del lavoro non si possono leggere: " + error.message + ". Sono visibili solo all'amministratore e alle persone autorizzate."); setRighe([]); return; }
      const rr = (data || []).map(r => ({ ...r, cognome_nome: r.ci_dipendenti?.cognome_nome || "?", codice_fiscale: r.ci_dipendenti?.codice_fiscale }));
      setRighe(rr);
      const anni = [...new Set(rr.map(r => r.anno))].sort();
      setAnno(anni[anni.length - 1] || null);
      const { data: c } = await fetchAllPages((da, a) => supabase.from("ci_contributi_da_versare").select("*").order("anno").order("mese").order("id").range(da, a));
      setContributi(c || []);
      const { data: e } = await fetchAllPages((da, a) => supabase.from("ci_dipendenti_esclusioni").select("dipendente_id, dal, al, motivo").order("id").range(da, a));
      setEsclusioni(e || []);
    })();
  }, []);

  const anni = useMemo(() => [...new Set((righe || []).map(r => r.anno))].sort(), [righe]);
  const dellAnno = useMemo(() => (righe || []).filter(r => r.anno === anno), [righe, anno]);
  const precedente = useMemo(() => (righe || []).filter(r => r.anno === anno - 1), [righe, anno]);
  const nomi = useMemo(() => [...new Set(dellAnno.map(r => r.cognome_nome))].sort(), [dellAnno]);
  const filtrate = persona === "tutte" ? dellAnno : dellAnno.filter(r => r.cognome_nome === persona);

  const esclusa = (id) => esclusioni.some(e => e.dipendente_id === id && e.dal <= `${anno}-12-31` && (!e.al || e.al >= `${anno}-01-01`));

  const perPersona = nomi.map(n => {
    const rr = dellAnno.filter(r => r.cognome_nome === n);
    return { nome: n, qualifica: rr[rr.length - 1]?.qualifica, esclusa: esclusa(rr[0]?.dipendente_id), ...somma(rr), res: residui(rr) };
  });
  const totAnno = somma(dellAnno);
  const totPrec = precedente.length ? somma(precedente) : null;

  async function apriPdf(r) {
    const { data, error } = await supabase.storage.from("buste-paga").createSignedUrl(r.pdf_percorso, 300);
    if (error) { alert("Il cedolino non si apre: " + error.message); return; }
    window.open(data.signedUrl, "_blank");
  }
  async function mostraVoci(r) {
    if (aperta === r.id) { setAperta(null); return; }
    setAperta(r.id);
    if (!voci[r.id]) {
      const { data } = await supabase.from("ci_cedolino_voci").select("*").eq("costo_lavoro_id", r.id).order("id");
      setVoci(v => ({ ...v, [r.id]: data || [] }));
    }
  }

  function esporta() {
    const wb = XLSX.utils.book_new();
    const fogli = [
      ["Riepilogo per persona", perPersona.map(p => ({
        "Cognome e nome": p.nome, "Qualifica": p.qualifica, "Nel costo degli animali": p.esclusa ? "no" : "sì", "Mesi": p.mesi,
        "Ore ordinarie": p.ore_ordinarie, "Ore straordinario": p.ore_straordinario, "Ore festività godute": p.ore_festivita_godute, "Giorni ferie godute": p.giorni_ferie_godute,
        "Ore permessi goduti": p.ore_permessi_goduti, "Ore ROL goduti": p.ore_rol_goduti, "Giorni malattia": p.giorni_malattia, "Giorni retribuiti": p.giorni_retribuiti,
        "Ferie residue": p.res.ferie, "Permessi residui": p.res.permessi, "ROL residui": p.res.rol, "Festività residue": p.res.festivita,
        "Totale lordo": p.totale_lordo, "TFR maturato": p.tfr_mese, "Contributi a carico dell'azienda": p.contributi, "Costo totale": p.costo_totale,
        "Netto in busta": p.netto_busta, "Costo per ora lavorata": p.costo_ora,
      }))],
      ["Mese per mese", filtrate.map(r => ({
        "Mese": MESI[r.mese], "Tipo": r.tipo, "Cognome e nome": r.cognome_nome, "Ore ordinarie": r.ore_ordinarie, "Ore straordinario": r.ore_straordinario,
        "Ore festività godute": r.ore_festivita_godute, "Giorni ferie godute": r.giorni_ferie_godute, "Ore permessi goduti": r.ore_permessi_goduti, "Ore ROL goduti": r.ore_rol_goduti,
        "Giorni malattia": r.giorni_malattia, "Ferie residue": r.ferie_residue, "Permessi residui": r.permessi_residui, "ROL residui": r.rol_residui, "Festività residue": r.festivita_residue,
        "Totale lordo": Number(r.totale_lordo), "TFR del mese": Number(r.tfr_mese), "Contributi a carico dell'azienda": r2((+r.inps_azienda || 0) + (+r.inail_azienda || 0) + (+r.altri_contributi_azienda || 0)),
        "Costo totale": Number(r.costo_totale), "Netto in busta": Number(r.netto_busta),
      }))],
      ["Contributi da versare", contributi.filter(c => c.anno === anno).map(c => ({
        "Mese": MESI[c.mese], "Salari": +c.salari, "Stipendi": +c.stipendi, "Netto in busta": +c.netto_in_busta, "INPS agricoltura a carico dell'azienda": +c.inps_azienda,
        "INPS agricoltura a carico del dipendente": +c.inps_dipendente, "INPS collaboratori": +c.inps_collaboratori, "INAIL": +c.inail, "IRPEF e addizionali": +c.irpef_e_addizionali,
        "Crediti da compensare in F24": +c.crediti_730,
      }))],
    ];
    for (const [nome, dati] of fogli) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dati), nome);
    XLSX.writeFile(wb, `Consultazione_costi_del_lavoro_${anno}${persona === "tutte" ? "" : "_" + persona}.xlsx`);
  }

  if (righe === null) return <div style={{ padding: 30, color: C.muted }}>Lettura dei costi del lavoro…</div>;

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>🔍 Consulta Costi del Lavoro</h1>
      <p style={{ color: C.muted, marginTop: 0 }}>Ore, ferie, permessi, costi e cedolini di ogni persona, dai cedolini caricati. Visibile solo all'amministratore e alle persone autorizzate.</p>
      {errore && <div style={{ background: "#FDECEA", border: `1px solid ${C.red}`, borderRadius: 10, padding: 12, color: C.red, marginBottom: 14 }}>{errore}</div>}
      {!errore && righe.length === 0 && <div style={{ color: C.muted }}>Non ci sono ancora cedolini caricati: si caricano da «Carica Costi del Lavoro».</div>}

      {righe.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13 }}>Anno{" "}
              <select value={anno || ""} onChange={e => { setAnno(Number(e.target.value)); setPersona("tutte"); }}>{anni.map(a => <option key={a} value={a}>{a}</option>)}</select>
            </label>
            <label style={{ fontSize: 13 }}>Persona{" "}
              <select value={persona} onChange={e => setPersona(e.target.value)}>
                <option value="tutte">Tutte</option>{nomi.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button onClick={esporta} style={{ background: C.card, border: `1px solid ${C.primary}`, color: C.primary, borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700 }}>📊 Esporta in Excel</button>
          </div>

          {/* numeri principali dell'anno, con il confronto con l'anno prima */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 16 }}>
            {[
              ["Costo totale", euro(somma(filtrate).costo_totale), totPrec && persona === "tutte" ? `${anno - 1}: ${euro(totPrec.costo_totale)}` : null],
              ["Ore ordinarie", numero(somma(filtrate).ore_ordinarie), totPrec && persona === "tutte" ? `${anno - 1}: ${numero(totPrec.ore_ordinarie)}` : null],
              ["Ore di straordinario", numero(somma(filtrate).ore_straordinario), totPrec && persona === "tutte" ? `${anno - 1}: ${numero(totPrec.ore_straordinario)}` : null],
              ["Costo per ora lavorata", euro(somma(filtrate).costo_ora), totPrec && persona === "tutte" ? `${anno - 1}: ${euro(totPrec.costo_ora)}` : null],
              ["Mesi caricati", String(new Set(filtrate.filter(r => r.tipo === "mensile").map(r => r.mese)).size), `ultimo: ${MESI[Math.max(0, ...filtrate.filter(r => r.tipo === "mensile").map(r => r.mese))] || "—"}`],
            ].map(([t, v, s]) => (
              <div key={t} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 11.5, color: C.muted }}>{t}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.primary }}>{v}</div>
                {s && <div style={{ fontSize: 11.5, color: C.muted }}>{s}</div>}
              </div>
            ))}
          </div>

          <Schede attiva={scheda} onChange={setScheda} voci={[["persone", "Riepilogo per persona"], ["mesi", "Mese per mese e cedolini"], ["contributi", "Contributi da versare"]]} />

          {scheda === "persone" && (
            <div style={{ overflowX: "auto", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <table>
                <thead><tr>
                  <th style={th}>Cognome e nome</th><th style={th}>Qualifica</th><th style={thN}>Mesi</th>
                  <th style={thN}>Ore ordinarie</th><th style={thN}>Ore straordinario</th><th style={thN}>Ore festività godute</th>
                  <th style={thN}>Giorni ferie godute</th><th style={thN}>Ore permessi goduti</th><th style={thN}>Ore ROL goduti</th><th style={thN}>Giorni malattia</th>
                  <th style={thN}>Ferie residue</th><th style={thN}>Permessi residui</th><th style={thN}>ROL residui</th><th style={thN}>Festività residue</th>
                  <th style={thN}>Totale lordo</th><th style={thN}>TFR maturato</th><th style={thN}>Contributi azienda</th><th style={thN}>Costo totale</th><th style={thN}>Costo per ora</th>
                </tr></thead>
                <tbody>
                  {perPersona.filter(p => persona === "tutte" || p.nome === persona).map(p => (
                    <tr key={p.nome}>
                      <td style={td}>{p.nome}{p.esclusa && <span title="Fuori dal costo degli animali" style={{ marginLeft: 6, fontSize: 11, color: C.accent }}>(escluso dal costo degli animali)</span>}</td>
                      <td style={td}>{p.qualifica}</td><td style={tdN}>{p.mesi}</td>
                      <td style={tdN}>{numero(p.ore_ordinarie)}</td><td style={tdN}>{numero(p.ore_straordinario)}</td><td style={tdN}>{numero(p.ore_festivita_godute)}</td>
                      <td style={tdN}>{numero(p.giorni_ferie_godute)}</td><td style={tdN}>{numero(p.ore_permessi_goduti)}</td><td style={tdN}>{numero(p.ore_rol_goduti)}</td><td style={tdN}>{numero(p.giorni_malattia)}</td>
                      <td style={tdN}>{numero(p.res.ferie)}</td><td style={tdN}>{numero(p.res.permessi)}</td><td style={tdN}>{numero(p.res.rol)}</td><td style={tdN}>{numero(p.res.festivita)}</td>
                      <td style={tdN}>{euro(p.totale_lordo)}</td><td style={tdN}>{euro(p.tfr_mese)}</td><td style={tdN}>{euro(p.contributi)}</td><td style={{ ...tdN, fontWeight: 700 }}>{euro(p.costo_totale)}</td><td style={tdN}>{euro(p.costo_ora)}</td>
                    </tr>
                  ))}
                  {persona === "tutte" && (
                    <tr>
                      <td style={tdT} colSpan={2}>Totale {anno}</td><td style={tdT}>{totAnno.mesi}</td>
                      <td style={tdT}>{numero(totAnno.ore_ordinarie)}</td><td style={tdT}>{numero(totAnno.ore_straordinario)}</td><td style={tdT}>{numero(totAnno.ore_festivita_godute)}</td>
                      <td style={tdT}>{numero(totAnno.giorni_ferie_godute)}</td><td style={tdT}>{numero(totAnno.ore_permessi_goduti)}</td><td style={tdT}>{numero(totAnno.ore_rol_goduti)}</td><td style={tdT}>{numero(totAnno.giorni_malattia)}</td>
                      <td style={tdT} colSpan={4}></td>
                      <td style={tdT}>{euro(totAnno.totale_lordo)}</td><td style={tdT}>{euro(totAnno.tfr_mese)}</td><td style={tdT}>{euro(totAnno.contributi)}</td><td style={tdT}>{euro(totAnno.costo_totale)}</td><td style={tdT}>{euro(totAnno.costo_ora)}</td>
                    </tr>
                  )}
                  {persona === "tutte" && totPrec && (
                    <tr>
                      <td style={{ ...td, color: C.muted }} colSpan={2}>Totale {anno - 1}</td><td style={{ ...tdN, color: C.muted }}>{totPrec.mesi}</td>
                      <td style={{ ...tdN, color: C.muted }}>{numero(totPrec.ore_ordinarie)}</td><td style={{ ...tdN, color: C.muted }}>{numero(totPrec.ore_straordinario)}</td><td style={{ ...tdN, color: C.muted }}>{numero(totPrec.ore_festivita_godute)}</td>
                      <td style={{ ...tdN, color: C.muted }}>{numero(totPrec.giorni_ferie_godute)}</td><td style={{ ...tdN, color: C.muted }}>{numero(totPrec.ore_permessi_goduti)}</td><td style={{ ...tdN, color: C.muted }}>{numero(totPrec.ore_rol_goduti)}</td><td style={{ ...tdN, color: C.muted }}>{numero(totPrec.giorni_malattia)}</td>
                      <td style={td} colSpan={4}></td>
                      <td style={{ ...tdN, color: C.muted }}>{euro(totPrec.totale_lordo)}</td><td style={{ ...tdN, color: C.muted }}>{euro(totPrec.tfr_mese)}</td><td style={{ ...tdN, color: C.muted }}>{euro(totPrec.contributi)}</td><td style={{ ...tdN, color: C.muted }}>{euro(totPrec.costo_totale)}</td><td style={{ ...tdN, color: C.muted }}>{euro(totPrec.costo_ora)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div style={{ fontSize: 11.5, color: C.muted, padding: "8px 10px" }}>
                Residui: quelli dell'ultima busta mensile caricata dell'anno (ferie in giorni, permessi, ROL e festività come scritti in busta). Costo per ora: costo totale diviso per le ore ordinarie e di straordinario.
                {totPrec && precedente.length && ` Il ${anno - 1} ha ${totPrec.mesi} mesi caricati: il confronto vale solo a parità di mesi.`}
              </div>
            </div>
          )}

          {scheda === "mesi" && (
            <div style={{ overflowX: "auto", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <table>
                <thead><tr>
                  <th style={th}>Mese</th><th style={th}>Tipo</th><th style={th}>Cognome e nome</th>
                  <th style={thN}>Ore ordinarie</th><th style={thN}>Ore straordinario</th><th style={thN}>Ore festività</th><th style={thN}>Giorni ferie</th>
                  <th style={thN}>Ore permessi</th><th style={thN}>Ore ROL</th><th style={thN}>Giorni malattia</th><th style={thN}>Ferie residue</th>
                  <th style={thN}>Totale lordo</th><th style={thN}>Costo totale</th><th style={thN}>Netto in busta</th><th style={th}>Cedolino</th>
                </tr></thead>
                <tbody>
                  {filtrate.slice().sort((a, b) => a.mese - b.mese || a.cognome_nome.localeCompare(b.cognome_nome)).map(r => (
                    <Fragment key={r.id}>
                      <tr>
                        <td style={td}>{MESI[r.mese]}</td><td style={td}>{r.tipo}</td><td style={td}>{r.cognome_nome}</td>
                        <td style={tdN}>{numero(r.ore_ordinarie)}</td><td style={tdN}>{numero(r.ore_straordinario)}</td><td style={tdN}>{numero(r.ore_festivita_godute)}</td><td style={tdN}>{numero(r.giorni_ferie_godute)}</td>
                        <td style={tdN}>{numero(r.ore_permessi_goduti)}</td><td style={tdN}>{numero(r.ore_rol_goduti)}</td><td style={tdN}>{numero(r.giorni_malattia)}</td><td style={tdN}>{numero(r.ferie_residue)}</td>
                        <td style={tdN}>{euro(r.totale_lordo)}</td><td style={{ ...tdN, fontWeight: 700 }}>{euro(r.costo_totale)}</td><td style={tdN}>{euro(r.netto_busta)}</td>
                        <td style={td}>
                          {r.pdf_percorso ? <button onClick={() => apriPdf(r)} style={{ border: "none", background: "transparent", color: C.primary, fontWeight: 700, fontSize: 12.5 }}>📄 PDF</button> : <span style={{ color: C.muted, fontSize: 12 }}>nessun PDF</span>}
                          <button onClick={() => mostraVoci(r)} style={{ border: "none", background: "transparent", color: C.primary, fontSize: 12.5 }}>{aperta === r.id ? "▾ voci" : "▸ voci"}</button>
                        </td>
                      </tr>
                      {aperta === r.id && (
                        <tr><td colSpan={15} style={{ background: "#FAFAF7", padding: "6px 14px" }}>
                          {!voci[r.id] ? "…" : (
                            <table style={{ width: "auto" }}>
                              <thead><tr><th style={th}>Codice</th><th style={th}>Descrizione</th><th style={thN}>Ore o giorni</th><th style={thN}>Base</th><th style={thN}>Competenza</th><th style={thN}>Trattenuta</th></tr></thead>
                              <tbody>{voci[r.id].map(v => (
                                <tr key={v.id}><td style={td}>{v.codice}</td><td style={td}>{v.descrizione}</td><td style={tdN}>{numero(v.ore_giorni)}</td><td style={tdN}>{v.base == null ? "—" : Number(v.base).toLocaleString("it-IT", { maximumFractionDigits: 5 })}</td><td style={tdN}>{v.competenza == null ? "—" : euro(v.competenza)}</td><td style={tdN}>{v.trattenuta == null ? "—" : euro(v.trattenuta)}</td></tr>
                              ))}</tbody>
                            </table>
                          )}
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {scheda === "contributi" && (
            <div style={{ overflowX: "auto", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <table>
                <thead><tr>
                  <th style={th}>Mese</th><th style={thN}>Salari</th><th style={thN}>Stipendi</th><th style={thN}>Netto in busta</th>
                  <th style={thN}>INPS agricoltura a carico dell'azienda</th><th style={thN}>INPS agricoltura a carico del dipendente</th><th style={thN}>INPS collaboratori</th>
                  <th style={thN}>INAIL</th><th style={thN}>IRPEF e addizionali</th><th style={thN}>Crediti da compensare in F24</th>
                </tr></thead>
                <tbody>
                  {contributi.filter(c => c.anno === anno).map(c => (
                    <tr key={c.id}>
                      <td style={td}>{MESI[c.mese]}{c.tipo !== "mensile" ? ` (${c.tipo})` : ""}</td><td style={tdN}>{euro(c.salari)}</td><td style={tdN}>{euro(c.stipendi)}</td><td style={tdN}>{euro(c.netto_in_busta)}</td>
                      <td style={tdN}>{euro(c.inps_azienda)}</td><td style={tdN}>{euro(c.inps_dipendente)}</td><td style={tdN}>{euro(c.inps_collaboratori)}</td>
                      <td style={tdN}>{euro(c.inail)}</td><td style={tdN}>{euro(c.irpef_e_addizionali)}</td><td style={tdN}>{euro(c.crediti_730)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11.5, color: C.muted, padding: "8px 10px" }}>Dai riepiloghi paghe e contributi. Servirà alla sezione Adempimenti fiscali per controllare gli F24.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
