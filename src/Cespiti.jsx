import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, round2, formattaEuro, fetchAllPages } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

const CATEGORIE_AMMORTAMENTO = [
  "3 - Attrezzatura specifica",
  "3 - Costruzioni leggere",
  "5 - Macchinari, apparecchi e attrezzature varie",
  "5 b - Macchinari, apparecchi e attrezzature varie extra allevamento",
  "6 - Spese atti notarili",
  "7 - Animali non oggetto di allevamento",
  "15 - Autovetture, motoveicoli e simili",
  "30 – Avviamento",
  "31 - Spese di costituzione e trasformazione",
  "34 - Altri oneri pluriennali",
];

// Una tinta diversa per ogni categoria, ciclica se le categorie superano i colori disponibili
const PALETTE_CATEGORIE = ["#2C6E9B", "#4A7C59", "#8B6F47", "#B5657A", "#6B8E4E", "#D4A017", "#7A5C8E", "#3A5A40"];

// Imputazioni che NON rientrano mai tra le specie d'allevamento (Bovini/Suini/Ovini) — né
// direttamente né tramite Generali: vanno sempre evidenziate a parte
const IMPUTAZIONI_NON_ALLEVAMENTO = ["Cavalli", "Pollame", "Orto"];
function nonImputabileInAllevamento(specie) {
  return !specie || specie.length === 0 || specie.some(s => IMPUTAZIONI_NON_ALLEVAMENTO.includes(s));
}

// Versione 236 (anomalia 12, decisione del Dott. Bizzarri del 07/10/2026 ore 21:44): piano delle quote
// sempre uguale per tutti gli anni = prezzo ÷ durata; i centesimi di arrotondamento vanno nell'ultimo anno,
// così il totale torna esattamente al prezzo pagato. Mai quote negative, mai oltre il prezzo.
// Con il coefficiente esatto (punto 2, decisione delle 21:47): quota = prezzo × coefficiente ogni anno,
// l'ultimo anno riceve il residuo (es. 2.000 € al 15%: sei anni da 300 € e un settimo da 200 €).
export function pianoQuote(costo, durata, annoAcquisto, coefficiente = null) {
  const tot = Math.round((parseFloat(costo) || 0) * 100), righe = [];
  const coeff = parseFloat(coefficiente);
  let fondo = 0;
  if (coeff > 0) {
    const q = Math.round(tot * coeff / 100);
    for (let i = 0; fondo < tot && q > 0 && i < 1000; i++) {
      const quota = Math.min(q, tot - fondo);
      fondo += quota;
      righe.push({ anno: annoAcquisto + i, quota: quota / 100, fondo: fondo / 100 });
    }
    return righe;
  }
  const n = Math.max(parseInt(durata) || 0, 1);
  const base = Math.round(tot / n);
  for (let i = 0; i < n; i++) {
    const q = i === n - 1 ? tot - base * (n - 1) : base;
    fondo += q;
    righe.push({ anno: annoAcquisto + i, quota: q / 100, fondo: fondo / 100 });
  }
  return righe;
}
// Coefficiente annuo del cespite: quello esatto salvato, altrimenti 100 ÷ anni
export const coefficienteDi = c => (parseFloat(c?.coefficiente_percentuale) > 0 ? parseFloat(c.coefficiente_percentuale) : (c?.anni_ammortamento ? 100 / c.anni_ammortamento : null));
const testoCoeff = n => (n === null ? "—" : `${String(Math.round(n * 10000) / 10000).replace(".", ",")}%`);
const annoDiData = d => (d ? parseInt(String(d).slice(0, 4)) : null);

export default function Cespiti() {
  const [cespiti, setCespiti] = useState([]);
  const [ammortamentiPerCespite, setAmmortamentiPerCespite] = useState({});
  const [quoteTutte, setQuoteTutte] = useState([]);
  const [loading, setLoading] = useState(true);
  const [espanso, setEspanso] = useState(null);
  const [cerca, setCerca] = useState("");
  const [nuovo, setNuovo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [generandoQuote, setGenerandoQuote] = useState(false);
  const [annoGenerazione, setAnnoGenerazione] = useState(new Date().getFullYear());
  const [fornitori, setFornitori] = useState([]);
  const [modificaId, setModificaId] = useState(null);
  const [formModifica, setFormModifica] = useState(null);
  const [salvandoModifica, setSalvandoModifica] = useState(false);
  const [eliminando, setEliminando] = useState(null);

  useEffect(() => { carica(); caricaFornitori(); }, []);
  async function caricaFornitori() {
    const { data } = await fetchAllPages((da, a) => supabase.from("ci_fornitori").select("id, nome").order("nome").order("id").range(da, a));
    setFornitori(data || []);
  }

  async function carica() {
    setLoading(true);
    const { data, error } = await fetchAllPages((da, a) => supabase.from("ci_cespiti").select("*, ci_fornitori(nome), ci_fatture(numero, data)").order("data_acquisto", { ascending: false }).order("id").range(da, a));
    if (error) { alert(`⚠️ Errore nel caricamento cespiti:\n\n${error.message}`); setLoading(false); return; }
    const cespitiNum = numerizzaCampi(data || [], ["costo_acquisto", "anni_ammortamento", "coefficiente_percentuale"]);
    setCespiti(cespitiNum);

    const idCespiti = cespitiNum.map(c => c.id);
    if (idCespiti.length > 0) {
      // Versione 236 (anomalia 13): tutte le quote a pagine (le quote saranno presto più di 1.000)
      const idSet = new Set(idCespiti);
      const { data: quoteTutteLette, error: eQ } = await fetchAllPages((da, a) => supabase.from("ci_cespiti_ammortamento").select("cespite_id, anno, quota").order("id").range(da, a));
      const quote = (quoteTutteLette || []).filter(q => idSet.has(q.cespite_id));
      if (eQ) alert(`⚠️ Errore nel caricamento delle quote:\n\n${eQ.message}`);
      else setQuoteTutte(numerizzaCampi(quote || [], ["quota"]));
    } else {
      setQuoteTutte([]);
    }
    setLoading(false);
  }

  async function eliminaCespite(c) {
    if (!window.confirm(`Eliminare definitivamente il cespite "${c.descrizione}"? Verranno eliminate anche tutte le sue quote di ammortamento generate. Questa azione non si può annullare.`)) return;
    setEliminando(c.id);
    try {
      const { error } = await supabase.from("ci_cespiti").delete().eq("id", c.id);
      if (error) throw new Error(error.message);
      carica();
    } catch (err) {
      alert(`⚠️ Errore nell'eliminazione:\n\n${err.message}`);
    }
    setEliminando(null);
  }

  function iniziaModifica(c) {
    setModificaId(c.id);
    setFormModifica({
      categoria: c.categoria || "",
      // Versione 236: «Generale» nel database corrisponde alla voce «Generali» del menu, nessuna
      // imputazione alla voce «Nessuno» (prima il menu non riconosceva il valore e salvava «Nessuno»)
      specieSelezionata: !c.specie?.length ? "Nessuno" : (c.specie[0] === "Generale" || c.specie[0] === "GENERALE" ? "Generali" : c.specie[0]),
      coefficientePct: coefficienteDi(c) !== null ? String(Math.round(coefficienteDi(c) * 10000) / 10000).replace(".", ",") : "",
      data_acquisto: c.data_acquisto || "",
      fornitore_id: c.fornitore_id || "",
    });
  }

  function annullaModifica() {
    setModificaId(null);
    setFormModifica(null);
  }

  async function salvaModifica(cespiteId) {
    const c0 = cespiti.find(x => x.id === cespiteId);
    const primaImp = !c0?.specie?.length ? "Nessuno" : c0.specie.join(", ");
    const coeff = parseFloat(String(formModifica.coefficientePct).replace(",", "."));
    // Punto 2: si salva il coefficiente esatto; la durata è il numero di anni necessari (es. 15% → 7 anni)
    const coeffNuovo = coeff > 0 && coeff <= 100 ? Math.round(coeff * 10000) / 10000 : null;
    if (!coeffNuovo) { alert("Coefficiente non valido: scrivere una percentuale tra 0 e 100."); return; }
    const durataNuova = Math.ceil(100 / coeffNuovo - 1e-9);
    const coeffPrima = Math.round((coefficienteDi(c0) || 0) * 10000) / 10000;
    const annoNuovo = annoDiData(formModifica.data_acquisto || c0.data_acquisto);
    const quoteEsistenti = quoteTutte.filter(q => q.cespite_id === cespiteId);
    // Cambio di durata o di data di acquisto su un cespite che ha già quote: si rifà il piano di tutti gli anni
    const rifarePiano = quoteEsistenti.length > 0 && (coeffNuovo !== coeffPrima || durataNuova !== c0.anni_ammortamento || annoNuovo !== annoDiData(c0.data_acquisto));
    const annoCorrente = new Date().getFullYear();
    const pianoNuovo = rifarePiano ? pianoQuote(c0.costo_acquisto, durataNuova, annoNuovo, coeffNuovo).filter(r => r.anno <= annoCorrente) : [];
    const anniToccati = rifarePiano ? [...new Set([...quoteEsistenti.map(q => q.anno), ...pianoNuovo.map(r => r.anno)])].sort() : [];
    const testoPiano = rifarePiano
      ? `\n\nIl coefficiente passa da ${testoCoeff(coeffPrima)} a ${testoCoeff(coeffNuovo)} (durata da ${c0.anni_ammortamento} a ${durataNuova} anni)${annoNuovo !== annoDiData(c0.data_acquisto) ? ` e l'anno di acquisto da ${annoDiData(c0.data_acquisto)} a ${annoNuovo}` : ""}: rifaccio le quote di TUTTI gli anni dal ${annoNuovo} in poi (${pianoNuovo.length ? `${formattaEuro(pianoNuovo[0].quota)} all'anno` : "nessun anno fino a oggi"}). Gli anni ${anniToccati.join(", ")} andranno ricalcolati (Report Costi).`
      : "";
    if (!window.confirm(`Imputazione: da «${primaImp}» a «${formModifica.specieSelezionata}»${formModifica.specieSelezionata === "Nessuno" ? " (la quota resterà FUORI dai costi degli animali)" : ""}.${testoPiano}\n\nConfermi le modifiche a questo cespite?`)) return;
    setSalvandoModifica(true);
    try {
      const mappaSpecie = { "Bovini": ["Bovini"], "Suini": ["Suini"], "Ovini": ["Ovini"], "Generali": ["Generale"], "Nessuno": [], "Cavalli": ["Cavalli"], "Pollame": ["Pollame"], "Orto": ["Orto"] };
      const nuovaSpecie = mappaSpecie[formModifica.specieSelezionata];
      if (!nuovaSpecie) throw new Error(`Imputazione «${formModifica.specieSelezionata}» non riconosciuta: niente salvato.`);
      const { error } = await supabase.from("ci_cespiti").update({
        categoria: formModifica.categoria || null,
        specie: nuovaSpecie,
        anni_ammortamento: durataNuova,
        coefficiente_percentuale: coeffNuovo,
        data_acquisto: formModifica.data_acquisto || null,
        fornitore_id: formModifica.fornitore_id || null,
        updated_at: new Date().toISOString(),
      }).eq("id", cespiteId);
      if (error) throw new Error(/coefficiente_percentuale/.test(error.message) ? "Il database non ha ancora la colonna del coefficiente: lanciare il file contabilita_strutture_v236.sql. Niente è stato cambiato." : error.message);
      if (rifarePiano) {
        if (pianoNuovo.length) {
          const { error: eUp } = await supabase.from("ci_cespiti_ammortamento")
            .upsert(pianoNuovo.map(r => ({ cespite_id: cespiteId, anno: r.anno, quota: r.quota, fondo_ammortamento_fine: r.fondo })), { onConflict: "cespite_id,anno" });
          if (eUp) throw new Error(`Cespite salvato, ma quote non rifatte: ${eUp.message}`);
        }
        const anniPiano = new Set(pianoNuovo.map(r => r.anno));
        const daTogliere = quoteEsistenti.filter(q => !anniPiano.has(q.anno)).map(q => q.anno);
        if (daTogliere.length) {
          const { error: eDel } = await supabase.from("ci_cespiti_ammortamento").delete().eq("cespite_id", cespiteId).in("anno", daTogliere);
          if (eDel) throw new Error(`Quote rifatte, ma non tolte quelle degli anni ${daTogliere.join(", ")}: ${eDel.message}`);
        }
        setAmmortamentiPerCespite({});
        alert(`✓ Quote rifatte per gli anni ${pianoNuovo.map(r => r.anno).join(", ") || "—"}${daTogliere.length ? `; tolte quelle degli anni ${daTogliere.join(", ")}` : ""}.\n\nRicordarsi di ricalcolare il Report Costi di questi anni.`);
      }
      setModificaId(null);
      setFormModifica(null);
      carica();
    } catch (err) {
      alert(`⚠️ Errore nel salvataggio:\n\n${err.message}`);
    }
    setSalvandoModifica(false);
  }

  async function espandi(cespiteId) {
    if (espanso === cespiteId) { setEspanso(null); return; }
    setEspanso(cespiteId);
    if (!ammortamentiPerCespite[cespiteId]) {
      const { data, error } = await supabase.from("ci_cespiti_ammortamento").select("*").eq("cespite_id", cespiteId).order("anno");
      if (error) { alert(`⚠️ Errore nel caricamento del piano di ammortamento:\n\n${error.message}`); return; }
      setAmmortamentiPerCespite(prev => ({ ...prev, [cespiteId]: numerizzaCampi(data || [], ["quota", "fondo_ammortamento_fine"]) }));
    }
  }

  async function salvaNuovo() {
    if (!nuovo.descrizione?.trim()) { alert("La descrizione è obbligatoria."); return; }
    if (!nuovo.data_acquisto) { alert("La data di acquisto è obbligatoria."); return; }
    if (!nuovo.costo_acquisto) { alert("Il costo di acquisto è obbligatorio."); return; }
    setSalvando(true);
    const { error } = await supabase.from("ci_cespiti").insert([{
      descrizione: nuovo.descrizione.trim(),
      categoria: nuovo.categoria || null,
      data_acquisto: nuovo.data_acquisto,
      costo_acquisto: parseFloat(nuovo.costo_acquisto),
      anni_ammortamento: parseInt(nuovo.anni_ammortamento) || 5,
      // Versione 236: «Generali» si salva «Generale» (come lo leggono i report) e «Nessuno» come
      // nessuna imputazione; prima si salvavano «GENERALE» in maiuscolo e «Nessuno», non riconosciuti
      specie: ({ "": ["Generale"], "Generali": ["Generale"], "Nessuno": [] })[nuovo.specie] ?? [nuovo.specie],
      note: nuovo.note || null,
    }]);
    setSalvando(false);
    if (error) { alert(`⚠️ Errore nel salvataggio:\n\n${error.message}`); return; }
    setNuovo(null);
    carica();
  }

  // Genera (o ricalcola) la quota di ammortamento per l'anno scelto, per tutti i cespiti attivi
  async function generaQuote() {
    const anno = parseInt(annoGenerazione);
    if (!anno) { alert("Anno non valido."); return; }
    // Versione 236: cespiti con quote già salvate diverse dal piano (durata o data cambiate dopo averle
    // generate): per la decisione del 07/10/2026 ore 21:44 si rifanno TUTTI i loro anni con la durata attuale.
    const attivi = cespiti.filter(c => c.attivo || c.attivo === undefined);
    const fuoriPiano = attivi.map(c => {
      const piano = pianoQuote(c.costo_acquisto, c.anni_ammortamento, annoDiData(c.data_acquisto), c.coefficiente_percentuale);
      const perAnno = new Map(piano.map(r => [r.anno, r]));
      const esistenti = quoteTutte.filter(q => q.cespite_id === c.id);
      const diverse = esistenti.filter(q => !perAnno.has(q.anno) || Math.abs(perAnno.get(q.anno).quota - q.quota) > 0.004);
      return diverse.length ? { c, piano, esistenti, anni: diverse.map(q => q.anno).sort() } : null;
    }).filter(Boolean);
    const testoFuori = fuoriPiano.length
      ? `\n\nATTENZIONE: ${fuoriPiano.length} cespiti hanno quote già salvate diverse dal loro piano (durata o data di acquisto cambiate dopo averle generate):\n${fuoriPiano.map(x => `• ${x.c.descrizione}: anni ${x.anni.join(", ")}`).join("\n")}\nPer questi si rifanno le quote di TUTTI gli anni fino al ${anno} con la durata attuale; quegli anni andranno ricalcolati (Report Costi).`
      : "";
    if (!window.confirm(`Generare le quote di ammortamento dell'anno ${anno} per tutti i cespiti attivi?${testoFuori}`)) return;

    setGenerandoQuote(true);
    let generate = 0, saltati = 0;
    const rifatti = [];
    try {
      for (const x of fuoriPiano) {
        const righe = x.piano.filter(r => r.anno <= anno);
        if (righe.length) {
          const { error } = await supabase.from("ci_cespiti_ammortamento")
            .upsert(righe.map(r => ({ cespite_id: x.c.id, anno: r.anno, quota: r.quota, fondo_ammortamento_fine: r.fondo })), { onConflict: "cespite_id,anno" });
          if (error) throw new Error(`Errore sul cespite "${x.c.descrizione}": ${error.message}`);
        }
        const anniPiano = new Set(x.piano.map(r => r.anno));
        const daTogliere = x.esistenti.filter(q => !anniPiano.has(q.anno)).map(q => q.anno);
        if (daTogliere.length) {
          const { error } = await supabase.from("ci_cespiti_ammortamento").delete().eq("cespite_id", x.c.id).in("anno", daTogliere);
          if (error) throw new Error(`Errore sul cespite "${x.c.descrizione}": ${error.message}`);
        }
        rifatti.push(x.c.descrizione);
      }
      for (const c of attivi) {
        // La quota dell'anno viene dal piano (prezzo ÷ durata, uguale ogni anno), non dalla differenza con
        // il fondo salvato l'anno prima: dopo un cambio di durata quella dava quote negative.
        const rigaPiano = pianoQuote(c.costo_acquisto, c.anni_ammortamento, annoDiData(c.data_acquisto), c.coefficiente_percentuale).find(r => r.anno === anno);
        if (!rigaPiano) { saltati++; continue; }
        const { error } = await supabase.from("ci_cespiti_ammortamento")
          .upsert([{ cespite_id: c.id, anno, quota: rigaPiano.quota, fondo_ammortamento_fine: rigaPiano.fondo }], { onConflict: "cespite_id,anno" });
        if (error) throw new Error(`Errore sul cespite "${c.descrizione}": ${error.message}`);
        generate++;
      }
      saltati += cespiti.length - attivi.length;
      alert(`✓ Quote del ${anno} generate per ${generate} cespiti (${saltati} saltati perché non attivi in quell'anno o già completamente ammortizzati).${rifatti.length ? `\n\nPiano rifatto per tutti gli anni: ${rifatti.join(", ")}. Ricalcolare il Report Costi degli anni toccati.` : ""}`);
      setAmmortamentiPerCespite({});
      carica();
    } catch (err) {
      alert(`⚠️ Errore durante la generazione:\n\n${err.message}`);
    }
    setGenerandoQuote(false);
  }

  const filtrati = useMemo(() => {
    if (!cerca.trim()) return cespiti;
    const q = cerca.trim().toLowerCase();
    return cespiti.filter(c => `${c.descrizione} ${c.categoria || ""}`.toLowerCase().includes(q));
  }, [cespiti, cerca]);

  const annoCorrente = new Date().getFullYear();

  const gruppiPerCategoria = useMemo(() => {
    const categorie = [...new Set(filtrati.map(c => c.categoria || "Senza categoria"))];
    return categorie.map((cat, i) => {
      const cespitiCat = filtrati.filter(c => (c.categoria || "Senza categoria") === cat)
        .slice().sort((a, b) => a.descrizione.localeCompare(b.descrizione, "it"));
      const idCat = new Set(cespitiCat.map(c => c.id));
      const quoteCat = quoteTutte.filter(q => idCat.has(q.cespite_id));
      return {
        categoria: cat, colore: PALETTE_CATEGORIE[i % PALETTE_CATEGORIE.length], cespiti: cespitiCat,
        valoreStorico: round2(cespitiCat.reduce((s, c) => s + (c.costo_acquisto || 0), 0)),
        quotaAnnoCorrente: round2(quoteCat.filter(q => q.anno === annoCorrente).reduce((s, q) => s + (q.quota || 0), 0)),
        fondoAmmortamento: round2(quoteCat.reduce((s, q) => s + (q.quota || 0), 0)),
      };
    }).sort((a, b) => b.valoreStorico - a.valoreStorico);
  }, [filtrati, quoteTutte, annoCorrente]);

  const totaleCosto = filtrati.reduce((s, c) => s + (c.costo_acquisto || 0), 0);

  function esporta() {
    const righeExcel = filtrati.map(c => ({
      "Descrizione": c.descrizione, "Categoria": c.categoria, "Imputazione": c.specie?.join(", ") || "Generali",
      "Fornitore": c.ci_fornitori?.nome, "Fattura n.": c.ci_fatture?.numero, "Data fattura": c.ci_fatture?.data,
      "Data acquisto": c.data_acquisto, "Costo acquisto": numeroExcel(c.costo_acquisto), "Anni ammortamento": c.anni_ammortamento,
      "Coefficiente %/anno": coefficienteDi(c) !== null ? numeroExcel(coefficienteDi(c)) : null,
    }));
    esportaExcel("Cespiti", [{ nome: "Cespiti", righe: righeExcel }]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={esporta}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            📥 Esporta Excel
          </button>
          {!nuovo && (
            <button onClick={() => setNuovo({ descrizione: "", categoria: "", data_acquisto: new Date().toISOString().slice(0, 10), costo_acquisto: "", anni_ammortamento: "5", specie: "Generali", note: "" })}
              style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              + Nuovo Cespite
            </button>
          )}
        </div>
      </div>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 20 }}>{cespiti.length} cespiti — costo totale {formattaEuro(totaleCosto)}</p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>GENERA QUOTE DI AMMORTAMENTO</div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Anno</label>
            <input type="number" value={annoGenerazione} onChange={e => setAnnoGenerazione(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, width: 100 }} />
          </div>
          <button onClick={generaQuote} disabled={generandoQuote}
            style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {generandoQuote ? "Generazione..." : "📐 Genera Quote"}
          </button>
        </div>
      </div>

      {nuovo && (
        <div style={{ background: C.card, border: `1.5px solid ${C.primary}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
            <div style={{ gridColumn: "span 2" }}>
              <Campo label="Descrizione *" value={nuovo.descrizione} onChange={v => setNuovo({ ...nuovo, descrizione: v })} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>Categoria</label>
              <select value={nuovo.categoria} onChange={e => setNuovo({ ...nuovo, categoria: e.target.value })}
                style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
                <option value="">— seleziona —</option>
                {CATEGORIE_AMMORTAMENTO.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Campo label="Data acquisto *" tipo="date" value={nuovo.data_acquisto} onChange={v => setNuovo({ ...nuovo, data_acquisto: v })} />
            <Campo label="Costo acquisto (€) *" tipo="number" value={nuovo.costo_acquisto} onChange={v => setNuovo({ ...nuovo, costo_acquisto: v })} />
            <Campo label="Anni ammortamento" tipo="number" value={nuovo.anni_ammortamento} onChange={v => setNuovo({ ...nuovo, anni_ammortamento: v })} />
            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>Specie (Imputazione)</label>
              <select value={nuovo.specie} onChange={e => setNuovo({ ...nuovo, specie: e.target.value })}
                style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
                {["Generali", "Bovini", "Suini", "Ovini", "Cavalli", "Pollame", "Orto", "Nessuno"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={salvaNuovo} disabled={salvando}
              style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {salvando ? "Salvataggio..." : "Salva"}
            </button>
            <button onClick={() => setNuovo(null)}
              style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: C.muted, cursor: "pointer" }}>
              Annulla
            </button>
          </div>
        </div>
      )}

      <input placeholder="Cerca per descrizione o categoria..." value={cerca} onChange={e => setCerca(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, marginBottom: 16 }} />

      {loading ? (
        <p style={{ color: C.muted }}>Caricamento...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {gruppiPerCategoria.map(gruppo => (
            <div key={gruppo.categoria}>
              <div style={{ background: gruppo.colore, borderRadius: "10px 10px 0 0", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <strong style={{ color: "#fff", fontSize: 15 }}>{gruppo.categoria}</strong>
                <div style={{ display: "flex", gap: 20, color: "#fff", fontSize: 12 }}>
                  <span>Valore storico: <strong>{formattaEuro(gruppo.valoreStorico)}</strong></span>
                  <span>Quota {annoCorrente}: <strong>{formattaEuro(gruppo.quotaAnnoCorrente)}</strong></span>
                  <span>Fondo ammortamento: <strong>{formattaEuro(gruppo.fondoAmmortamento)}</strong></span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0 0 0", borderLeft: `3px solid ${gruppo.colore}`, paddingLeft: 10 }}>
          {gruppo.cespiti.map(c => (
            <div key={c.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <div onClick={() => espandi(c.id)} style={{ display: "flex", justifyContent: "space-between", padding: 14, cursor: "pointer", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <strong>{c.descrizione}</strong>
                  <div style={{ fontSize: 12, color: C.muted }}>
                    {c.categoria || "Categoria non specificata"} · Acquisto {c.data_acquisto} · {c.anni_ammortamento} anni
                    {c.specie?.length > 0 && !nonImputabileInAllevamento(c.specie) && ` · ${c.specie.join(", ")}`}
                    {nonImputabileInAllevamento(c.specie) && (
                      <span style={{ color: C.red, fontWeight: 700 }}> · {c.specie?.length > 0 ? c.specie.join(", ") : "Nessuno"} (non imputabile in allevamento)</span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: C.primary }}>{formattaEuro(c.costo_acquisto)}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{espanso === c.id ? "▲ nascondi piano" : "▼ vedi piano ammortamento"}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); eliminaCespite(c); }} disabled={eliminando === c.id}
                    style={{ background: "none", border: `1.5px solid ${C.red}`, color: C.red, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    {eliminando === c.id ? "..." : "🗑️"}
                  </button>
                </div>
              </div>
              {espanso === c.id && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: 14 }}>
                  {modificaId === c.id ? (
                    <div style={{ background: "#F5F0E8", border: `1.5px solid ${C.primary}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>Categoria</label>
                          <select value={formModifica.categoria} onChange={e => setFormModifica({ ...formModifica, categoria: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
                            <option value="">— nessuna —</option>
                            {CATEGORIE_AMMORTAMENTO.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>Imputazione</label>
                          <select value={formModifica.specieSelezionata} onChange={e => setFormModifica({ ...formModifica, specieSelezionata: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
                            {["Generali", "Bovini", "Suini", "Ovini", "Cavalli", "Pollame", "Orto", "Nessuno"].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>Coefficiente ammortamento (%/anno)</label>
                          <input type="text" inputMode="decimal" value={formModifica.coefficientePct} onChange={e => setFormModifica({ ...formModifica, coefficientePct: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>Data acquisto</label>
                          <input type="date" value={formModifica.data_acquisto} onChange={e => setFormModifica({ ...formModifica, data_acquisto: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>Fornitore</label>
                          <select value={formModifica.fornitore_id} onChange={e => setFormModifica({ ...formModifica, fornitore_id: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
                            <option value="">— nessuno —</option>
                            {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => salvaModifica(c.id)} disabled={salvandoModifica}
                          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                          {salvandoModifica ? "Salvataggio..." : "✓ Salva modifiche"}
                        </button>
                        <button onClick={annullaModifica}
                          style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, color: C.muted, cursor: "pointer" }}>
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: "#FAFAF8", border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                          <div><strong>Fattura di provenienza:</strong> {c.ci_fatture ? `n. ${c.ci_fatture.numero} del ${c.ci_fatture.data}` : "— (cespite storico migrato, nessuna fattura collegata)"}</div>
                          <div><strong>Fornitore:</strong> {c.ci_fornitori?.nome || "—"}</div>
                          <div><strong>Data acquisto:</strong> {c.data_acquisto}</div>
                          <div><strong>Categoria:</strong> {c.categoria || "—"}</div>
                          <div>
                            <strong>Imputazione:</strong>{" "}
                            {nonImputabileInAllevamento(c.specie) ? (
                              <span style={{ color: C.red, fontWeight: 700 }}>{c.specie?.length > 0 ? c.specie.join(", ") : "Nessuno"} — non imputabile in allevamento</span>
                            ) : (
                              c.specie?.length > 0 ? c.specie.join(", ") : "Generali"
                            )}
                          </div>
                          <div><strong>Coefficiente ammortamento:</strong> {coefficienteDi(c) !== null ? `${testoCoeff(coefficienteDi(c))}/anno (${c.anni_ammortamento} anni)` : "—"}</div>
                        </div>
                        <button onClick={() => iniziaModifica(c)}
                          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          ✏️ Modifica
                        </button>
                      </div>
                    </div>
                  )}

                  {!ammortamentiPerCespite[c.id] ? (
                    <p style={{ color: C.muted, fontSize: 13 }}>Caricamento...</p>
                  ) : ammortamentiPerCespite[c.id].length === 0 ? (
                    <p style={{ color: C.muted, fontSize: 13 }}>Nessuna quota generata ancora per questo cespite — usa "Genera Quote" sopra.</p>
                  ) : (
                    <table style={{ width: "100%", fontSize: 13 }}>
                      <thead>
                        <tr style={{ color: C.muted, textAlign: "left" }}>
                          <th style={{ padding: "4px 8px" }}>Anno</th>
                          <th style={{ padding: "4px 8px", textAlign: "right" }}>Quota</th>
                          <th style={{ padding: "4px 8px", textAlign: "right" }}>Fondo ammortamento a fine anno</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ammortamentiPerCespite[c.id].map(a => (
                          <tr key={a.id} style={{ borderTop: `1px solid ${C.border}` }}>
                            <td style={{ padding: "6px 8px" }}>{a.anno}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right" }}>{formattaEuro(a.quota)}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{formattaEuro(a.fondo_ammortamento_fine)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
              </div>
            </div>
          ))}
          {filtrati.length === 0 && <p style={{ color: C.muted }}>Nessun cespite trovato.</p>}
        </div>
      )}
    </div>
  );
}

function Campo({ label, value, onChange, tipo = "text" }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>{label}</label>
      <input type={tipo} value={value || ""} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
    </div>
  );
}
