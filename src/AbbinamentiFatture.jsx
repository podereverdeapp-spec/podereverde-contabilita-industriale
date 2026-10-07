// Abbinamenti Fatture Acquisto (versione 232): il programma propone a quale capo o lotto dell'app
// appartiene ogni riga di fattura d'acquisto animali, spiega il motivo, aspetta la conferma e salva.
// Regole decise dal Dott. Bizzarri il 07/10/2026:
//  – alla conferma si salva il collegamento (stato ABBINATO) e sulla scheda dell'app si scrivono
//    fornitore, numero e data della fattura e prezzo d'acquisto SOLO dove sono vuoti;
//  – se la scheda ha già un valore diverso, si mostrano affiancati e si sceglie quale tenere;
//  – una proposta rifiutata non viene più riproposta.
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { fetchAllPages, round2 } from "./parsingUtils";
import { dataIt } from "./controlliRegistri";

const bottone = (colore, pieno = true) => ({ background: pieno ? colore : "transparent", color: pieno ? "#fff" : colore, border: `1.5px solid ${colore}`, borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" });
const euro = n => n == null || n === "" || isNaN(Number(n)) ? "—" : `${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const normBdn = s => (s || "").toUpperCase().replace(/\s+/g, "");
const PAROLE_VUOTE = ["SRL", "S", "R", "L", "SOCIETA", "SOC", "AGRICOLA", "AGR", "AZ", "AZIENDA", "SS", "SAS", "SNC", "DI", "DEL", "DELLA", "E", "F", "LLI", "FRATELLI"];
const paroleFornitore = s => (s || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(p => p.length > 1 && !PAROLE_VUOTE.includes(p));
function stessoFornitore(a, b) {
  const pa = paroleFornitore(a), pb = paroleFornitore(b);
  if (!pa.length || !pb.length) return false;
  return pa.some(p => pb.includes(p));
}
const giorni = (d1, d2) => (d1 && d2) ? Math.round(Math.abs(new Date(d1) - new Date(d2)) / 86400000) : null;
const specieDi = s => { const x = (s || "").toLowerCase(); return x.startsWith("bovin") ? "bovino" : x.startsWith("suin") ? "suino" : x.startsWith("ovin") ? "ovino" : null; };
function prezzoRiga(r) {
  if (parseFloat(r.prezzo_unitario) > 0) return round2(parseFloat(r.prezzo_unitario));
  if (!(parseFloat(r.quantita) > 1) && parseFloat(r.importo) > 0) return round2(parseFloat(r.importo));
  return null;
}
function rifiutati(r) {
  return new Set([...(r.rifiuto_motivo || "").matchAll(/(animale|lotto):(\d+)/g)].map(m => `${m[1]}:${m[2]}`));
}

// Confronto campo per campo tra la riga di fattura e la scheda del capo
function confronto(r, a, nomeFornitore) {
  const prezzo = prezzoRiga(r);
  return [
    { campo: "fornitore", etichetta: "Fornitore", scheda: a.fornitore || "", fattura: nomeFornitore || "", uguale: stessoFornitore(a.fornitore, nomeFornitore) },
    { campo: "numero_fattura", etichetta: "Numero fattura", scheda: a.numero_fattura || "", fattura: r.numero_fattura || "", uguale: (a.numero_fattura || "").trim().toUpperCase() === (r.numero_fattura || "").trim().toUpperCase() },
    { campo: "data_fattura", etichetta: "Data fattura", scheda: a.data_fattura || "", fattura: r.data_fattura || "", uguale: a.data_fattura === r.data_fattura, data: true },
    { campo: "prezzo_acquisto", etichetta: "Prezzo d'acquisto", scheda: parseFloat(a.prezzo_acquisto) > 0 ? round2(parseFloat(a.prezzo_acquisto)) : "", fattura: prezzo ?? "", uguale: parseFloat(a.prezzo_acquisto) > 0 && prezzo != null && round2(parseFloat(a.prezzo_acquisto)) === prezzo, euro: true },
  ];
}
function motivi(r, a, nomeFornitore, perMatricola) {
  const m = [];
  if (perMatricola) m.push("la matricola scritta in fattura è quella del capo");
  if (stessoFornitore(a.fornitore, nomeFornitore)) m.push("stesso fornitore");
  const g = giorni(a.data_ingresso, r.data_fattura);
  if (g != null) m.push(g <= 15 ? `entrato ${g} giorni dalla data della fattura` : `ATTENZIONE: entrato a ${g} giorni dalla data della fattura`);
  const p = prezzoRiga(r);
  if (p != null && parseFloat(a.prezzo_acquisto) > 0) m.push(round2(parseFloat(a.prezzo_acquisto)) === p ? "stesso prezzo" : `ATTENZIONE: prezzo diverso (scheda ${euro(a.prezzo_acquisto)}, fattura ${euro(p)})`);
  if (specieDi(r.specie) && specieDi(r.specie) !== specieDi(a.specie)) m.push(`ATTENZIONE: specie diversa (fattura ${r.specie}, scheda ${a.specie})`);
  return m;
}

function PannelloConferma({ r, a, nomeFornitore, motivo, onFatto, onAnnulla }) {
  const righe = confronto(r, a, nomeFornitore);
  const [scelte, setScelte] = useState(() => Object.fromEntries(righe.map(x => [x.campo, x.scheda === "" && x.fattura !== "" ? "fattura" : "scheda"])));
  const [salvando, setSalvando] = useState(false);
  const mostra = x => x === "" ? "vuoto" : x;

  async function conferma() {
    const daScrivere = {};
    righe.forEach(x => { if (scelte[x.campo] === "fattura" && x.fattura !== "" && !x.uguale) daScrivere[x.campo] = x.fattura; });
    const elenco = Object.entries(daScrivere).map(([k, v]) => `${righe.find(x => x.campo === k).etichetta}: «${mostra(righe.find(x => x.campo === k).scheda)}» → «${v}»`);
    if (!window.confirm(`Confermi l'abbinamento?\n\nFattura ${r.numero_fattura || "senza numero"} del ${dataIt(r.data_fattura)} (${euro(r.importo)})\n→ ${a.bdn || a.nome}\n\n${elenco.length ? `Sulla scheda dell'app verrà scritto:\n${elenco.join("\n")}` : "Sulla scheda dell'app non viene scritto niente."}`)) return;
    setSalvando(true);
    try {
      if (Object.keys(daScrivere).length) {
        let q = supabase.from("animali").update(daScrivere).eq("id", a.id);
        for (const k of Object.keys(daScrivere)) { const v = a[k]; q = (v === null || v === undefined) ? q.is(k, null) : q.eq(k, v); }
        const { data, error } = await q.select("id");
        if (error) throw new Error(error.message);
        if (!data || data.length !== 1) throw new Error("La scheda è stata cambiata da qualcun altro nel frattempo (oppure manca il permesso): niente salvato. Ricaricare la pagina.");
      }
      const { data: d2, error: e2 } = await supabase.from("ci_report_acquisto_animali").update({
        animale_id: a.id, stato: "ABBINATO", abbinamento_motivo: motivo, abbinato_at: new Date().toISOString(),
      }).eq("id", r.id).is("animale_id", null).is("lotto_id", null).select("id");
      if (e2) throw new Error(e2.message);
      if (!d2 || d2.length !== 1) throw new Error("La riga di fattura risulta già abbinata: ricaricare la pagina.");
      onFatto();
    } catch (e) { alert(`⚠️ ${e.message}`); }
    setSalvando(false);
  }

  return (
    <div style={{ background: "#F4F8F5", border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginTop: 10 }}>
      <table style={{ fontSize: 13 }}>
        <thead><tr style={{ color: C.muted, textAlign: "left" }}><th style={{ padding: 4 }}>Campo</th><th style={{ padding: 4 }}>Scheda dell'app</th><th style={{ padding: 4 }}>Fattura</th><th style={{ padding: 4 }}>Cosa fare</th></tr></thead>
        <tbody>{righe.map(x => (
          <tr key={x.campo} style={{ borderTop: `1px solid ${C.border}` }}>
            <td style={{ padding: 4, fontWeight: 700 }}>{x.etichetta}</td>
            <td style={{ padding: 4 }}>{x.euro ? (x.scheda === "" ? "vuoto" : euro(x.scheda)) : x.data ? (x.scheda ? dataIt(x.scheda) : "vuoto") : mostra(x.scheda)}</td>
            <td style={{ padding: 4 }}>{x.euro ? (x.fattura === "" ? "—" : euro(x.fattura)) : x.data ? (x.fattura ? dataIt(x.fattura) : "—") : (x.fattura || "—")}</td>
            <td style={{ padding: 4 }}>
              {x.uguale ? <span style={{ color: C.green }}>uguale</span>
                : x.fattura === "" ? <span style={{ color: C.muted }}>niente da scrivere</span>
                : x.scheda === "" ? <label><input type="checkbox" checked={scelte[x.campo] === "fattura"} onChange={e => setScelte({ ...scelte, [x.campo]: e.target.checked ? "fattura" : "scheda" })} /> scrivi quello della fattura</label>
                : <span style={{ display: "flex", gap: 10 }}>
                    <label><input type="radio" checked={scelte[x.campo] === "scheda"} onChange={() => setScelte({ ...scelte, [x.campo]: "scheda" })} /> tieni la scheda</label>
                    <label><input type="radio" checked={scelte[x.campo] === "fattura"} onChange={() => setScelte({ ...scelte, [x.campo]: "fattura" })} /> usa la fattura</label>
                  </span>}
            </td>
          </tr>))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={conferma} disabled={salvando} style={bottone(C.green)}>{salvando ? "Salvataggio…" : "✓ Conferma l'abbinamento"}</button>
        <button onClick={onAnnulla} style={bottone(C.muted, false)}>Annulla</button>
      </div>
    </div>
  );
}

export default function AbbinamentiFatture() {
  const [dati, setDati] = useState(null);
  const [vista, setVista] = useState("sicure");
  const [aperto, setAperto] = useState(null); // `${rigaId}|${animaleId}`
  const [errore, setErrore] = useState("");

  async function carica() {
    try {
      const [r, f, a, l] = await Promise.all([
        fetchAllPages((da, b) => supabase.from("ci_report_acquisto_animali").select("*").order("data_fattura").range(da, b)),
        fetchAllPages((da, b) => supabase.from("ci_fornitori").select("id,nome").range(da, b)),
        fetchAllPages((da, b) => supabase.from("animali").select("id,bdn,nome,specie,razza,sesso,provenienza,stato,data_ingresso,fornitore,numero_fattura,data_fattura,prezzo_acquisto").order("id").range(da, b)),
        fetchAllPages((da, b) => supabase.from("lotti_suini").select("id,codice,codice_lotto,tipo_provenienza,fornitore,numero_fattura,data_fattura,prezzo_acquisto,data_parto").eq("tipo_provenienza", "acquistato").range(da, b)),
      ]);
      for (const x of [r, f, a, l]) if (x.error) throw new Error(x.error.message);
      setDati({ righe: r.data, fornitori: new Map(f.data.map(x => [x.id, x.nome])), animali: a.data, lotti: l.data });
    } catch (e) { setErrore(e.message); }
  }
  useEffect(() => { carica(); }, []);

  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;
  if (!dati) return <div style={{ padding: 20, color: C.muted }}>Caricamento…</div>;

  const { righe, fornitori, animali, lotti } = dati;
  const giaCollegati = new Set(righe.filter(r => r.animale_id).map(r => r.animale_id));
  const perBdn = new Map(animali.filter(a => a.bdn).map(a => [normBdn(a.bdn), a]));
  const perId = new Map(animali.map(a => [a.id, a]));
  const lottoPerId = new Map(lotti.map(x => [x.id, x]));
  const libere = righe.filter(r => !r.animale_id && !r.lotto_id && !["RIFIUTATA", "NON_ABBINABILE"].includes(r.stato));
  const trasporti = libere.filter(r => r.fonte === "TRASPORTO_INGRESSO");
  const sicure = [], daValutare = [];
  for (const r of libere.filter(r => r.fonte !== "TRASPORTO_INGRESSO")) {
    const nomeF = fornitori.get(r.fornitore_id);
    const no = rifiutati(r);
    const a = r.bdn ? perBdn.get(normBdn(r.bdn)) : null;
    if (a && !no.has(`animale:${a.id}`)) {
      const m = motivi(r, a, nomeF, true);
      if (giaCollegati.has(a.id)) m.push("ATTENZIONE: questo capo è già collegato a un'altra riga di fattura");
      sicure.push({ r, a, nomeF, motivi: m }); continue;
    }
    // Candidati: capi acquistati, non già collegati, stessa specie se indicata, entrati entro 120 giorni
    const cand = animali.filter(x => x.provenienza === "Acquistato" && !giaCollegati.has(x.id) && !no.has(`animale:${x.id}`)
      && (!specieDi(r.specie) || specieDi(r.specie) === specieDi(x.specie)) && (giorni(x.data_ingresso, r.data_fattura) ?? 999) <= 120)
      .map(x => {
        let punti = 0;
        if (stessoFornitore(x.fornitore, nomeF)) punti += 3;
        const g = giorni(x.data_ingresso, r.data_fattura); if (g != null) punti += g <= 7 ? 2 : g <= 30 ? 1 : 0;
        const p = prezzoRiga(r); if (p != null && round2(parseFloat(x.prezzo_acquisto) || 0) === p) punti += 2;
        if ((x.numero_fattura || "").trim() && (x.numero_fattura || "").trim().toUpperCase() === (r.numero_fattura || "").trim().toUpperCase()) punti += 3;
        return { x, punti };
      }).filter(c => c.punti >= 3).sort((p, q) => q.punti - p.punti).slice(0, 5);
    daValutare.push({ r, nomeF, cand });
  }
  const daConfermare = righe.filter(r => (r.animale_id || r.lotto_id) && r.stato !== "ABBINATO");
  const abbinate = righe.filter(r => r.stato === "ABBINATO");
  const scartate = righe.filter(r => ["RIFIUTATA", "NON_ABBINABILE"].includes(r.stato));

  async function rifiuta(r, chiave) {
    const motivo = window.prompt("Perché questa proposta è sbagliata?");
    if (motivo === null) return;
    const testo = `${r.rifiuto_motivo ? r.rifiuto_motivo + "\n" : ""}${chiave} — ${motivo || "senza motivo"} — ${new Date().toLocaleDateString("it-IT")}`;
    const { error } = await supabase.from("ci_report_acquisto_animali").update({ rifiuto_motivo: testo }).eq("id", r.id);
    if (error) alert(`⚠️ ${error.message}`); else carica();
  }
  async function nessuno(r) {
    const motivo = window.prompt("Nessun capo corrisponde: scrivere il motivo (es. «capo mai registrato nell'app»).");
    if (!motivo) return;
    const { error } = await supabase.from("ci_report_acquisto_animali").update({ stato: "NON_ABBINABILE", rifiuto_motivo: `${r.rifiuto_motivo ? r.rifiuto_motivo + "\n" : ""}nessun capo — ${motivo} — ${new Date().toLocaleDateString("it-IT")}` }).eq("id", r.id);
    if (error) alert(`⚠️ ${error.message}`); else carica();
  }
  async function confermaEsistente(r) {
    if (!window.confirm("Confermi che questo collegamento già presente è giusto? Sulla scheda dell'app non viene scritto niente.")) return;
    const { error } = await supabase.from("ci_report_acquisto_animali").update({ stato: "ABBINATO", abbinamento_motivo: "collegamento già presente, confermato", abbinato_at: new Date().toISOString() }).eq("id", r.id);
    if (error) alert(`⚠️ ${error.message}`); else carica();
  }

  const Intestazione = ({ r, nomeF }) => (
    <div style={{ fontSize: 13.5 }}>
      <b>Fattura {r.numero_fattura || "senza numero"}</b> del {dataIt(r.data_fattura)} — {nomeF || "fornitore ignoto"} — <b>{euro(r.importo)}</b>
      {r.quantita && parseFloat(r.quantita) !== 1 ? ` (${r.quantita} capi a ${euro(r.prezzo_unitario)})` : ""}
      {r.bdn ? ` — matricola in fattura ${r.bdn}` : ""}{r.specie ? ` — ${r.specie}` : ""}{r.razza ? `, ${r.razza}` : ""}
      {r.note && <div style={{ fontSize: 12, color: C.muted }}>Nota: {r.note}</div>}
    </div>
  );
  const Capo = ({ a }) => <span><b>{a.bdn || a.nome}</b>{a.nome && a.bdn ? ` (${a.nome})` : ""} — {a.specie}{a.razza ? `, ${a.razza}` : ""}, entrato il {dataIt(a.data_ingresso)}, {a.stato}</span>;
  const scheda = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 };
  const VISTE = [["sicure", `Proposte sicure (${sicure.length})`], ["valutare", `Da valutare (${daValutare.length})`], ["confermare", `Già collegate, da confermare (${daConfermare.length})`],
    ["trasporti", `Trasporti (${trasporti.length})`], ["abbinate", `Abbinate (${abbinate.length})`], ["scartate", `Senza capo (${scartate.length})`]];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
      <h2 style={{ margin: 0, color: C.primary }}>🔗 Abbinamenti Fatture Acquisto</h2>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Per ogni riga di fattura d'acquisto il programma propone il capo dell'app e spiega il motivo. Niente viene salvato senza la conferma.</div>
      <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
        {VISTE.map(([k, t]) => <button key={k} onClick={() => setVista(k)} style={{ ...bottone(C.primary, vista === k), padding: "8px 14px" }}>{t}</button>)}
      </div>
      <div style={{ marginTop: 14 }}>
        {vista === "sicure" && sicure.map(({ r, a, nomeF, motivi: m }) => (
          <div key={r.id} style={scheda}>
            <Intestazione r={r} nomeF={nomeF} />
            <div style={{ marginTop: 6, fontSize: 13 }}>→ Proposta: <Capo a={a} /></div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>Motivo: {m.map((x, i) => <span key={i} style={{ color: x.startsWith("ATTENZIONE") ? C.red : C.text }}>{i ? "; " : ""}{x}</span>)}</div>
            {aperto === `${r.id}|${a.id}`
              ? <PannelloConferma r={r} a={a} nomeFornitore={nomeF} motivo={m.join("; ")} onFatto={() => { setAperto(null); carica(); }} onAnnulla={() => setAperto(null)} />
              : <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => setAperto(`${r.id}|${a.id}`)} style={bottone(C.green)}>Esamina e conferma</button>
                  <button onClick={() => rifiuta(r, `animale:${a.id}`)} style={bottone(C.red, false)}>Rifiuta</button>
                </div>}
          </div>))}
        {vista === "valutare" && daValutare.map(({ r, nomeF, cand }) => (
          <div key={r.id} style={scheda}>
            <Intestazione r={r} nomeF={nomeF} />
            {cand.length === 0 && <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>Nessun capo dell'app corrisponde (stesso fornitore o stessa fattura, entrato entro 120 giorni). Può essere un gruppo di capi o un capo mai registrato.</div>}
            {cand.map(({ x }) => (
              <div key={x.id} style={{ borderTop: `1px dashed ${C.border}`, marginTop: 8, paddingTop: 8, fontSize: 13 }}>
                → Candidato: <Capo a={x} />
                <div style={{ fontSize: 12.5, marginTop: 3 }}>Motivo: {motivi(r, x, nomeF, false).map((t, i) => <span key={i} style={{ color: t.startsWith("ATTENZIONE") ? C.red : C.text }}>{i ? "; " : ""}{t}</span>)}</div>
                {aperto === `${r.id}|${x.id}`
                  ? <PannelloConferma r={r} a={x} nomeFornitore={nomeF} motivo={motivi(r, x, nomeF, false).join("; ")} onFatto={() => { setAperto(null); carica(); }} onAnnulla={() => setAperto(null)} />
                  : <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button onClick={() => setAperto(`${r.id}|${x.id}`)} style={bottone(C.green)}>Esamina e conferma</button>
                      <button onClick={() => rifiuta(r, `animale:${x.id}`)} style={bottone(C.red, false)}>Non è questo</button>
                    </div>}
              </div>))}
            <div style={{ marginTop: 8 }}><button onClick={() => nessuno(r)} style={bottone(C.muted, false)}>Nessun capo corrisponde</button></div>
          </div>))}
        {vista === "confermare" && daConfermare.map(r => {
          const a = r.animale_id ? perId.get(r.animale_id) : null; const lo = r.lotto_id ? lottoPerId.get(r.lotto_id) : null; const nomeF = fornitori.get(r.fornitore_id);
          return (
            <div key={r.id} style={scheda}>
              <Intestazione r={r} nomeF={nomeF} />
              <div style={{ marginTop: 6, fontSize: 13 }}>Collegata a: {a ? <Capo a={a} /> : lo ? <b>lotto {lo.codice_lotto || lo.codice}</b> : `lotto ${r.lotto_id}`}</div>
              {a && <div style={{ fontSize: 12.5, marginTop: 4 }}>Verifica: {motivi(r, a, nomeF, !!r.bdn && normBdn(r.bdn) === normBdn(a.bdn)).map((t, i) => <span key={i} style={{ color: t.startsWith("ATTENZIONE") ? C.red : C.text }}>{i ? "; " : ""}{t}</span>)}</div>}
              <div style={{ marginTop: 8 }}><button onClick={() => confermaEsistente(r)} style={bottone(C.green)}>✓ Il collegamento è giusto</button></div>
            </div>);
        })}
        {vista === "trasporti" && (<>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Le fatture di trasporto non si abbinano a un singolo capo: sono costi d'ingresso. Come entrano nei costi è ancora da decidere.</div>
          {trasporti.map(r => <div key={r.id} style={scheda}><Intestazione r={r} nomeF={fornitori.get(r.fornitore_id)} /></div>)}
        </>)}
        {vista === "abbinate" && abbinate.map(r => {
          const a = r.animale_id ? perId.get(r.animale_id) : null; const lo = r.lotto_id ? lottoPerId.get(r.lotto_id) : null;
          return <div key={r.id} style={scheda}><Intestazione r={r} nomeF={fornitori.get(r.fornitore_id)} />
            <div style={{ fontSize: 13, marginTop: 4 }}>→ {a ? <Capo a={a} /> : lo ? `lotto ${lo.codice_lotto || lo.codice}` : "—"} {r.abbinato_at ? `— confermato il ${new Date(r.abbinato_at).toLocaleDateString("it-IT")}` : ""}</div>
            {r.abbinamento_motivo && <div style={{ fontSize: 12, color: C.muted }}>Motivo: {r.abbinamento_motivo}</div>}</div>;
        })}
        {vista === "scartate" && scartate.map(r => <div key={r.id} style={scheda}><Intestazione r={r} nomeF={fornitori.get(r.fornitore_id)} /><div style={{ fontSize: 12, color: C.muted, whiteSpace: "pre-wrap" }}>{r.rifiuto_motivo}</div></div>)}
      </div>
    </div>
  );
}
