import { useState } from "react";
import * as XLSX from "xlsx-js-style";
import JSZip from "jszip";
import { supabase } from "./supabase";
import { C } from "./style";

// Versione 271 (21/10/2026): carica l'Excel prodotto con il «Prompt per carico cedolini» e lo zip dei cedolini
// divisi per persona. Scrive le tabelle protette del lavoro (ci_dipendenti, ci_costo_lavoro_mensile,
// ci_cedolino_voci, ci_contributi_da_versare), archivia i PDF nel bucket «buste-paga» e, anno per anno,
// sostituisce in ci_costi_diretti le righe dell'area Lavoro con un totale per mese, senza nomi, delle sole
// persone che entrano nel costo degli animali (decisioni del Dott. Bizzarri del 21/10/2026).

const MESI = ["", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const TIPI = ["mensile", "tredicesima", "quattordicesima"];
const CENTRO_LAVORO = "Subordinato a Tempo indeterminato";

const euro = (n) => (n == null || isNaN(n) ? "—" : Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};
const ultimoGiorno = (anno, mese) => new Date(Date.UTC(anno, mese, 0)).toISOString().slice(0, 10);

// colonne dell'Excel → campi del database
const COL_COSTI = {
  "Anno": "anno", "Mese": "mese", "Tipo": "tipo", "Cognome e nome": "cognome_nome", "Codice fiscale": "codice_fiscale", "Qualifica": "qualifica",
  "Totale lordo": "totale_lordo", "di cui TFR liquidato": "tfr_liquidato", "TFR del mese": "tfr_mese", "Imponibile contributivo": "imponibile_contributivo",
  "INPS azienda (quota)": "inps_azienda", "INAIL azienda (quota)": "inail_azienda", "Contributi collaboratori azienda (quota)": "altri_contributi_azienda",
  "COSTO TOTALE": "costo_totale", "Contributi a carico del lavoratore": "contributi_dipendente", "Netto in busta": "netto_busta",
  "Ore ordinarie": "ore_ordinarie", "Ore straordinario": "ore_straordinario", "Ore festività godute": "ore_festivita_godute",
  "Giorni ferie godute": "giorni_ferie_godute", "Ore permessi goduti": "ore_permessi_goduti", "Ore ROL goduti": "ore_rol_goduti",
  "Giorni malattia": "giorni_malattia", "Giorni retribuiti": "giorni_retribuiti", "Ferie residue": "ferie_residue", "Permessi residui": "permessi_residui",
  "ROL residui": "rol_residui", "Festività residue": "festivita_residue", "PDF": "pdf", "Percorso archivio": "pdf_percorso", "File di origine": "file_origine",
};
const TESTO = new Set(["tipo", "cognome_nome", "codice_fiscale", "qualifica", "pdf", "pdf_percorso", "file_origine"]);
const COL_CONTRIBUTI = {
  "Anno": "anno", "Mese": "mese", "Tipo": "tipo", "Salari": "salari", "Stipendi": "stipendi", "Netto in busta": "netto_in_busta",
  "INPS agricoltura c/azienda": "inps_azienda", "INPS agricoltura c/dipendente": "inps_dipendente",
  "INPS collaboratori (azienda + collaboratore)": "inps_collaboratori", "INAIL": "inail", "IRPEF e addizionali": "irpef_e_addizionali",
  "Crediti da compensare in F24": "crediti_730", "Lordi OK": "ok_lordi", "Netti OK": "ok_netti", "File di origine": "file_origine",
};

function leggiFoglio(wb, nome, colonne) {
  const ws = wb.Sheets[nome];
  if (!ws) throw new Error(`Nell'Excel manca il foglio «${nome}».`);
  const righe = XLSX.utils.sheet_to_json(ws, { defval: null });
  const mancanti = Object.keys(colonne).filter(k => righe.length && !(k in righe[0]));
  if (mancanti.length) throw new Error(`Nel foglio «${nome}» mancano le colonne: ${mancanti.join(", ")}.`);
  return righe.map(r => {
    const o = {};
    for (const [k, campo] of Object.entries(colonne)) {
      const v = r[k];
      o[campo] = TESTO.has(campo) || campo.startsWith("ok_") ? (v == null ? null : String(v).trim()) : num(v);
    }
    return o;
  });
}

function Riquadro({ titolo, children, colore }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${colore || C.border}`, borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
      {titolo && <div style={{ fontWeight: 700, color: colore || C.primary, marginBottom: 8 }}>{titolo}</div>}
      {children}
    </div>
  );
}

const th = { textAlign: "left", padding: "6px 8px", fontSize: 12, background: "#E3EDE0", borderBottom: `1px solid ${C.border}` };
const td = { padding: "5px 8px", fontSize: 12.5, borderBottom: `1px solid ${C.border}` };
const tdN = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

export default function CaricaCostiLavoro() {
  const [dati, setDati] = useState(null);       // contenuto dell'Excel
  const [pdf, setPdf] = useState(null);         // { nome: Blob } dallo zip
  const [stato, setStato] = useState(null);     // situazione nel database per l'anno
  const [escluse, setEscluse] = useState({});   // codice fiscale → true se fuori dal costo degli animali
  const [sostituisci, setSostituisci] = useState(false);
  const [errore, setErrore] = useState("");
  const [lavoro, setLavoro] = useState("");
  const [esito, setEsito] = useState(null);

  async function leggiExcel(file) {
    setErrore(""); setEsito(null); setDati(null); setStato(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const costi = leggiFoglio(wb, "Costi e ore per dipendente", COL_COSTI);
      const voci = leggiFoglio(wb, "Voci dei cedolini", { "Anno": "anno", "Mese": "mese", "Tipo": "tipo", "Cognome e nome": "cognome_nome", "Codice": "codice", "Descrizione": "descrizione", "Ore o giorni": "ore_giorni", "Base": "base", "Competenza": "competenza", "Trattenuta": "trattenuta" });
      voci.forEach(v => { v.codice = v.codice == null ? null : String(v.codice).replace(/\.0+$/, ""); });
      const contributi = leggiFoglio(wb, "Contributi da versare", COL_CONTRIBUTI);
      const ws = wb.Sheets["Anomalie"];
      const anomalie = ws ? XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1).map(r => r[0]).filter(Boolean) : [];
      const anni = [...new Set(costi.map(r => r.anno))];
      if (anni.length !== 1) throw new Error(`L'Excel deve contenere un solo anno; contiene: ${anni.join(", ") || "nessuno"}.`);
      const problemi = [];
      costi.forEach((r, i) => {
        const dove = `riga ${i + 2} (${r.cognome_nome || "?"})`;
        if (!r.codice_fiscale || !/^[A-Z0-9]{16}$/.test(r.codice_fiscale)) problemi.push(`${dove}: codice fiscale mancante o non valido`);
        if (!(r.mese >= 1 && r.mese <= 12)) problemi.push(`${dove}: mese non valido`);
        if (!TIPI.includes(r.tipo)) problemi.push(`${dove}: tipo «${r.tipo}» non valido`);
        if (r.costo_totale == null) problemi.push(`${dove}: COSTO TOTALE vuoto`);
      });
      const chiavi = new Set();
      costi.forEach(r => { const k = `${r.codice_fiscale}|${r.mese}|${r.tipo}`; if (chiavi.has(k)) problemi.push(`${r.cognome_nome}: ${MESI[r.mese]} ${r.tipo} compare due volte`); chiavi.add(k); });
      contributi.forEach(c => { if (c.ok_lordi && c.ok_lordi.toUpperCase() !== "SÌ" && c.ok_lordi.toUpperCase() !== "SI") problemi.push(`Contributi ${MESI[c.mese]}: il controllo dei lordi non torna`); if (c.ok_netti && c.ok_netti.toUpperCase() !== "SÌ" && c.ok_netti.toUpperCase() !== "SI") problemi.push(`Contributi ${MESI[c.mese]}: il controllo dei netti non torna`); });
      const d = { anno: anni[0], costi, voci, contributi, anomalie, problemi, nomeFile: file.name };
      setDati(d);
      await leggiStato(d);
    } catch (e) {
      setErrore(e.message || String(e));
    }
  }

  async function leggiStato(d) {
    const cf = [...new Set(d.costi.map(r => r.codice_fiscale))];
    const { data: dip, error: e1 } = await supabase.from("ci_dipendenti").select("id, cognome_nome, codice_fiscale").in("codice_fiscale", cf);
    if (e1) { setErrore("Lettura dei dipendenti non riuscita: " + e1.message + ". Solo l'amministratore e le persone autorizzate possono caricare i costi del lavoro."); return; }
    const ids = (dip || []).map(x => x.id);
    const { data: gia } = ids.length ? await supabase.from("ci_costo_lavoro_mensile").select("dipendente_id, mese, tipo").eq("anno", d.anno).in("dipendente_id", ids) : { data: [] };
    const { data: esc } = ids.length ? await supabase.from("ci_dipendenti_esclusioni").select("dipendente_id, dal, al, motivo").in("dipendente_id", ids) : { data: [] };
    const { data: cd } = await supabase.from("ci_costi_diretti").select("id, data, importo, descrizione").eq("area", "Lavoro").eq("centro_costo", CENTRO_LAVORO).gte("data", `${d.anno}-01-01`).lte("data", `${d.anno}-12-31`).order("data");
    const cfDaId = Object.fromEntries((dip || []).map(x => [x.id, x.codice_fiscale]));
    const giaCaricate = new Set((gia || []).map(g => `${cfDaId[g.dipendente_id]}|${g.mese}|${g.tipo}`));
    const escAnno = {};
    (esc || []).forEach(e => { if (e.dal <= `${d.anno}-12-31` && (!e.al || e.al >= `${d.anno}-01-01`)) escAnno[cfDaId[e.dipendente_id]] = e; });
    setEscluse(Object.fromEntries(Object.keys(escAnno).map(k => [k, true])));
    setStato({ giaCaricate, escAnno, costiDiretti: cd || [] });
  }

  async function leggiZip(file) {
    setErrore("");
    try {
      const zip = await JSZip.loadAsync(file);
      const mappa = {};
      for (const f of Object.values(zip.files)) {
        if (f.dir || !/\.pdf$/i.test(f.name)) continue;
        mappa[f.name.split("/").pop()] = await f.async("blob");
      }
      setPdf(mappa);
    } catch (e) {
      setErrore("Lo zip non si apre: " + (e.message || e));
    }
  }

  const persone = dati ? Object.values(dati.costi.reduce((a, r) => {
    const p = a[r.codice_fiscale] || (a[r.codice_fiscale] = { cf: r.codice_fiscale, nome: r.cognome_nome, qualifica: r.qualifica, costo: 0, ore: 0, righe: 0 });
    p.costo += r.costo_totale || 0; p.ore += r.ore_ordinarie || 0; p.righe += 1; return a;
  }, {})) : [];
  const daSaltare = dati && stato && !sostituisci ? dati.costi.filter(r => stato.giaCaricate.has(`${r.codice_fiscale}|${r.mese}|${r.tipo}`)) : [];
  const pdfMancanti = dati && pdf ? dati.costi.filter(r => r.pdf && !pdf[r.pdf]) : [];

  async function carica() {
    setErrore(""); setEsito(null);
    const d = dati;
    try {
      // 1. anagrafica dei dipendenti, riconosciuti dal codice fiscale
      setLavoro("Anagrafica dei dipendenti…");
      const anagrafica = persone.map(p => ({ cognome_nome: p.nome, codice_fiscale: p.cf, qualifica: p.qualifica }));
      const { data: dip, error: e1 } = await supabase.from("ci_dipendenti").upsert(anagrafica, { onConflict: "codice_fiscale" }).select("id, codice_fiscale");
      if (e1) throw new Error("Anagrafica: " + e1.message);
      const idDaCf = Object.fromEntries(dip.map(x => [x.codice_fiscale, x.id]));

      // 2. esclusioni dal costo degli animali, per tutto l'anno
      setLavoro("Esclusioni dal costo degli animali…");
      for (const p of persone) {
        const giaEsclusa = !!stato.escAnno[p.cf];
        if (escluse[p.cf] && !giaEsclusa) {
          const { error } = await supabase.from("ci_dipendenti_esclusioni").insert({ dipendente_id: idDaCf[p.cf], dal: `${d.anno}-01-01`, al: `${d.anno}-12-31`, motivo: "escluso dal costo degli animali al carico dei cedolini" });
          if (error) throw new Error("Esclusione di " + p.nome + ": " + error.message);
        }
        if (!escluse[p.cf] && giaEsclusa) {
          const e = stato.escAnno[p.cf];
          if (e.dal === `${d.anno}-01-01` && e.al === `${d.anno}-12-31`) {
            const { error } = await supabase.from("ci_dipendenti_esclusioni").delete().eq("dipendente_id", idDaCf[p.cf]).eq("dal", e.dal).eq("al", e.al);
            if (error) throw new Error("Esclusione di " + p.nome + ": " + error.message);
          } else {
            throw new Error(`${p.nome} è escluso dal ${e.dal} al ${e.al || "oggi"}: questa esclusione va cambiata a mano, non dal carico di un anno.`);
          }
        }
      }

      // 3. costi mese per mese, con le voci e i PDF
      const salta = new Set(daSaltare.map(r => `${r.codice_fiscale}|${r.mese}|${r.tipo}`));
      let caricate = 0, pdfCaricati = 0;
      for (const r of d.costi) {
        if (salta.has(`${r.codice_fiscale}|${r.mese}|${r.tipo}`)) continue;
        setLavoro(`Cedolino ${r.cognome_nome}, ${MESI[r.mese]} ${r.tipo}…`);
        let percorso = r.pdf_percorso || null;
        if (pdf && r.pdf && pdf[r.pdf] && percorso) {
          const { error } = await supabase.storage.from("buste-paga").upload(percorso, pdf[r.pdf], { upsert: true, contentType: "application/pdf" });
          if (error) throw new Error(`PDF di ${r.cognome_nome} ${MESI[r.mese]}: ${error.message}`);
          pdfCaricati++;
        }
        const riga = {
          dipendente_id: idDaCf[r.codice_fiscale], anno: d.anno, mese: r.mese, tipo: r.tipo, qualifica: r.qualifica,
          totale_lordo: r.totale_lordo, tfr_mese: r.tfr_mese, imponibile_contributivo: r.imponibile_contributivo, contributi_dipendente: r.contributi_dipendente,
          inps_azienda: r.inps_azienda, inail_azienda: r.inail_azienda, altri_contributi_azienda: r.altri_contributi_azienda, costo_totale: r2(r.costo_totale),
          netto_busta: r.netto_busta, ore_ordinarie: r.ore_ordinarie, ore_straordinario: r.ore_straordinario, ore_festivita_godute: r.ore_festivita_godute,
          giorni_retribuiti: r.giorni_retribuiti, giorni_ferie_godute: r.giorni_ferie_godute, ore_permessi_goduti: r.ore_permessi_goduti, ore_rol_goduti: r.ore_rol_goduti,
          giorni_malattia: r.giorni_malattia, ferie_residue: r.ferie_residue, permessi_residui: r.permessi_residui, rol_residui: r.rol_residui,
          festivita_residue: r.festivita_residue, pdf_percorso: percorso, file_origine: r.file_origine, caricato_il: new Date().toISOString(),
        };
        const { data: salv, error: e2 } = await supabase.from("ci_costo_lavoro_mensile").upsert(riga, { onConflict: "dipendente_id,anno,mese,tipo" }).select("id").single();
        if (e2) throw new Error(`${r.cognome_nome} ${MESI[r.mese]}: ${e2.message}`);
        await supabase.from("ci_cedolino_voci").delete().eq("costo_lavoro_id", salv.id);
        const voci = d.voci.filter(v => v.cognome_nome === r.cognome_nome && v.mese === r.mese && v.tipo === r.tipo)
          .map(v => ({ costo_lavoro_id: salv.id, codice: v.codice, descrizione: v.descrizione || "", ore_giorni: v.ore_giorni, base: v.base, competenza: v.competenza, trattenuta: v.trattenuta }));
        if (voci.length) {
          const { error: e3 } = await supabase.from("ci_cedolino_voci").insert(voci);
          if (e3) throw new Error(`Voci di ${r.cognome_nome} ${MESI[r.mese]}: ${e3.message}`);
        }
        caricate++;
      }

      // 4. contributi da versare
      setLavoro("Contributi da versare…");
      const contr = d.contributi.map(c => ({
        anno: d.anno, mese: c.mese, tipo: c.tipo || "mensile", salari: c.salari, stipendi: c.stipendi, netto_in_busta: c.netto_in_busta,
        inps_azienda: c.inps_azienda, inps_dipendente: c.inps_dipendente, inps_collaboratori: c.inps_collaboratori, inail: c.inail,
        irpef_e_addizionali: c.irpef_e_addizionali, crediti_730: c.crediti_730, file_origine: c.file_origine, caricato_il: new Date().toISOString(),
      }));
      if (contr.length) {
        const { error } = await supabase.from("ci_contributi_da_versare").upsert(contr, { onConflict: "anno,mese,tipo" });
        if (error) throw new Error("Contributi da versare: " + error.message);
      }

      // 5. costi diretti dell'anno: un totale per mese, senza nomi, delle persone non escluse
      setLavoro("Costi diretti dell'anno…");
      const { data: tutte, error: e4 } = await supabase.from("ci_costo_lavoro_mensile").select("dipendente_id, mese, costo_totale").eq("anno", d.anno);
      if (e4) throw new Error("Rilettura dei costi: " + e4.message);
      const { data: esc } = await supabase.from("ci_dipendenti_esclusioni").select("dipendente_id, dal, al");
      const esclusa = (id, mese) => (esc || []).some(e => e.dipendente_id === id && e.dal <= ultimoGiorno(d.anno, mese) && (!e.al || e.al >= `${d.anno}-${String(mese).padStart(2, "0")}-01`));
      const perMese = {};
      for (const t of tutte) {
        if (esclusa(t.dipendente_id, t.mese)) continue;
        const m = perMese[t.mese] || (perMese[t.mese] = { costo: 0, persone: new Set() });
        m.costo += Number(t.costo_totale) || 0; m.persone.add(t.dipendente_id);
      }
      const nuove = Object.entries(perMese).sort((a, b) => a[0] - b[0]).map(([mese, m]) => ({
        data: ultimoGiorno(d.anno, Number(mese)), area: "Lavoro", centro_costo: CENTRO_LAVORO, destinazione: "Generali", tipo_costo: "Fisso",
        importo: r2(m.costo), descrizione: `Costo del lavoro di ${MESI[mese]} ${d.anno} dai cedolini caricati (${m.persone.size} ${m.persone.size === 1 ? "persona" : "persone"})`,
      }));
      const { error: e5 } = await supabase.from("ci_costi_diretti").delete().eq("area", "Lavoro").eq("centro_costo", CENTRO_LAVORO).gte("data", `${d.anno}-01-01`).lte("data", `${d.anno}-12-31`);
      if (e5) throw new Error("Cancellazione dei vecchi costi del lavoro dell'anno: " + e5.message);
      if (nuove.length) {
        const { error: e6 } = await supabase.from("ci_costi_diretti").insert(nuove);
        if (e6) throw new Error("Costi diretti: " + e6.message);
      }
      setEsito({ caricate, saltate: salta.size, pdfCaricati, nuove, totale: r2(nuove.reduce((s, x) => s + x.importo, 0)) });
      setLavoro("");
      await leggiStato(d);
    } catch (e) {
      setLavoro("");
      setErrore((e.message || String(e)) + " Il carico si è fermato a questo punto: quello che era già stato scritto resta; ricaricando lo stesso Excel con «Sostituisci» si completa.");
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 1050, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>👷 Carica Costi del Lavoro</h1>
      <p style={{ color: C.muted, marginTop: 0 }}>
        Si carica un anno alla volta: l'Excel «Costi_del_lavoro_AAAA.xlsx» e lo zip «Cedolini_AAAA.zip» preparati con il «Prompt per carico cedolini».
        I dati per persona restano visibili solo all'amministratore e alle persone autorizzate; nei Costi Diretti entra soltanto il totale di ogni mese, senza nomi.
      </p>

      <Riquadro titolo="1. L'Excel dei costi del lavoro">
        <input type="file" accept=".xlsx" onChange={e => e.target.files[0] && leggiExcel(e.target.files[0])} />
        {dati && <div style={{ marginTop: 8, fontSize: 13 }}>Letto «{dati.nomeFile}»: anno <b>{dati.anno}</b>, {dati.costi.length} buste, {dati.voci.length} voci, {dati.contributi.length} mesi di contributi.</div>}
      </Riquadro>

      <Riquadro titolo="2. Lo zip con i cedolini divisi per persona">
        <input type="file" accept=".zip" onChange={e => e.target.files[0] && leggiZip(e.target.files[0])} />
        {pdf && <div style={{ marginTop: 8, fontSize: 13 }}>Nello zip ci sono {Object.keys(pdf).length} PDF.</div>}
        {pdf && dati && (pdfMancanti.length
          ? <div style={{ marginTop: 6, fontSize: 13, color: C.red }}>Mancano nello zip {pdfMancanti.length} PDF: {pdfMancanti.map(r => r.pdf).join(", ")}.</div>
          : <div style={{ marginTop: 6, fontSize: 13, color: C.green }}>Ci sono i PDF di tutte le buste dell'Excel.</div>)}
        {!pdf && <div style={{ marginTop: 6, fontSize: 12, color: C.muted }}>Senza lo zip i costi si caricano lo stesso, ma nella consultazione non si potranno aprire i cedolini.</div>}
      </Riquadro>

      {errore && <Riquadro colore={C.red} titolo="Attenzione"><div style={{ fontSize: 13 }}>{errore}</div></Riquadro>}

      {dati && (dati.problemi.length > 0 || dati.anomalie.length > 0) && (
        <Riquadro colore={dati.problemi.length ? C.red : C.yellow} titolo={dati.problemi.length ? "Da correggere prima di caricare" : "Anomalie scritte da Claude nell'Excel: leggerle prima di caricare"}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {dati.problemi.map((p, i) => <li key={"p" + i} style={{ color: C.red }}>{p}</li>)}
            {dati.anomalie.map((a, i) => <li key={"a" + i}>{a}</li>)}
          </ul>
        </Riquadro>
      )}

      {dati && stato && (
        <Riquadro titolo={`3. Le persone del ${dati.anno}`}>
          <table>
            <thead><tr><th style={th}>Cognome e nome</th><th style={th}>Qualifica</th><th style={{ ...th, textAlign: "right" }}>Buste</th><th style={{ ...th, textAlign: "right" }}>Ore ordinarie</th><th style={{ ...th, textAlign: "right" }}>Costo totale</th><th style={th}>Nel costo degli animali</th></tr></thead>
            <tbody>
              {persone.map(p => (
                <tr key={p.cf}>
                  <td style={td}>{p.nome}</td><td style={td}>{p.qualifica}</td><td style={tdN}>{p.righe}</td><td style={tdN}>{p.ore.toLocaleString("it-IT")}</td><td style={tdN}>{euro(p.costo)}</td>
                  <td style={td}>
                    <label style={{ fontSize: 12.5, cursor: "pointer" }}>
                      <input type="checkbox" checked={!escluse[p.cf]} onChange={e => setEscluse(s => ({ ...s, [p.cf]: !e.target.checked }))} /> {escluse[p.cf] ? "escluso" : "sì"}
                    </label>
                  </td>
                </tr>
              ))}
              <tr><td style={{ ...td, fontWeight: 700 }} colSpan={4}>Totale</td><td style={{ ...tdN, fontWeight: 700 }}>{euro(persone.reduce((s, p) => s + p.costo, 0))}</td><td style={td}></td></tr>
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Chi è escluso resta nell'archivio e nella consultazione, ma il suo costo non entra nei Costi Diretti e quindi nel costo degli animali.</div>
        </Riquadro>
      )}

      {dati && stato && (
        <Riquadro titolo="4. Cosa succede caricando">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
            <li>Buste già caricate nel programma per il {dati.anno}: {stato.giaCaricate.size}. {stato.giaCaricate.size > 0 && (
              <label style={{ cursor: "pointer" }}><input type="checkbox" checked={sostituisci} onChange={e => setSostituisci(e.target.checked)} /> Sostituisci le buste già caricate {sostituisci ? "(verranno riscritte)" : `(${daSaltare.length} dell'Excel verranno saltate)`}</label>
            )}</li>
            <li>Nei Costi Diretti le righe dell'area Lavoro del {dati.anno} {stato.costiDiretti.length
              ? <>(oggi {stato.costiDiretti.length}: {stato.costiDiretti.map(c => `${c.data.split("-").reverse().join("/")} ${euro(c.importo)}`).join("; ")})</>
              : "(oggi nessuna)"} vengono sostituite da un totale per mese, senza nomi, delle persone che entrano nel costo degli animali.</li>
          </ul>
          <button disabled={!!lavoro || dati.problemi.length > 0} onClick={carica}
            style={{ marginTop: 12, background: dati.problemi.length ? C.muted : C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 14 }}>
            {lavoro ? "Caricamento in corso…" : `📥 Carica i costi del lavoro del ${dati.anno}`}
          </button>
          {lavoro && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>{lavoro}</div>}
        </Riquadro>
      )}

      {esito && (
        <Riquadro colore={C.green} titolo="Caricamento completato">
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Buste caricate: {esito.caricate}{esito.saltate ? `; saltate perché già presenti: ${esito.saltate}` : ""}. PDF archiviati: {esito.pdfCaricati}.<br />
            Costi Diretti del {dati.anno}: {esito.nuove.length} righe mensili, totale {euro(esito.totale)}.
          </div>
        </Riquadro>
      )}
    </div>
  );
}
