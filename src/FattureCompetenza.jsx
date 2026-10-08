// Versione 237 — «Fatture da Ricevere e da Emettere» (rapporti con Muratella).
// Decisione del Dott. Bizzarri, 08/10/2026 ore 09:56–10:26 (vedi documentiCompetenza.js).
import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro, round2, fetchAllPages } from "./parsingUtils";

// Data in formato italiano gg/mm/aaaa
function formattaData(v) { const s = String(v || "").slice(0, 10); const [a, m, g] = s.split("-"); return g ? `${g}/${m}/${a}` : s; }
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { TIPO_DA_RICEVERE, TIPO_DA_EMETTERE } from "./documentiCompetenza";

const DATA_DECISIONE = "2026-10-08";

// Testo della decisione, uguale nella pagina e nel foglio Excel per il commercialista
export const NOTA_DECISIONE = [
  "Decisione del Dott. Filippo Bizzarri dell'8 ottobre 2026, presa per rispettare i principi contabili di competenza, inerenza e non compensazione delle partite.",
  "1. Dal 2021 (campagna 2021/2022, da quando le lavorazioni dei campi di Podere si fanno in proprio) Muratella ha pagato costi dei campi di Podere Verde senza rifatturarli: gasolio, manutenzione delle macchine agricole, concimi, diserbanti, servizio di diserbo e di semina, seme d'orzo e di erbaio, reti per rotopresse. Sono costi di Podere: Muratella li deve rifatturare a Podere (fatture da ricevere).",
  "2. Nel 2019 e nel 2020 non c'è nulla da rifatturare: Muratella fatturava a Podere le lavorazioni, le semine, il seme e il fieno (43.712,70 € nel 2020, 6.910,00 € a inizio 2021), quindi i suoi costi erano già nel prezzo.",
  "3. Dal 2025 l'orzo raccolto da Podere viene conferito da Muratella alla Cooperativa Ceri (fatture di Muratella FAT/2025 000241 del 04/11/2025, 88.575 kg, 17.032,97 €; FAT/2026 000245 del 05/10/2026, 37.029 kg, 7.776,09 €; la FAT/2026 000221 è stornata dalla nota di credito NCE/2026 000244). Podere ricompra l'orzo come farina dalla Cooperativa Ceri. L'orzo è di Podere: Podere deve fatturare a Muratella l'intero imponibile dell'orzo venduto (fatture da emettere), soluzione «lorda»: costi e ricavi restano interi, nessuna compensazione.",
  "4. Nei costi di Podere (contabilità industriale) le fatture da ricevere si contano nell'anno della fattura originale pagata da Muratella; la fattura da emettere dell'orzo si conta in meno nei Mangimi, nell'anno del conferimento: così l'orzo venduto e ricomprato come farina non si conta due volte e il costo degli animali, per UBA e al chilo, è giusto anno per anno.",
  "5. Quando arrivano le fatture vere, si collegano qui al documento di competenza: la fattura vera di acquisto collegata non si conta di nuovo nei costi (il costo è già nell'anno giusto).",
  "Da valutare dal commercialista: competenza degli esercizi 2021–2026 (eventuali sopravvenienze se i bilanci sono chiusi), termini di emissione e regolarizzazione IVA per le operazioni degli anni passati, aliquote IVA voce per voce (cereali, concimi, fitosanitari, gasolio agricolo, servizi), regime IVA agricolo di Podere; per Muratella le scritture speculari (il suo risultato sull'orzo e sui costi dei campi di Podere torna a zero).",
];

export default function FattureCompetenza() {
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState(null);
  const [senzaStruttura, setSenzaStruttura] = useState(false);
  const [documenti, setDocumenti] = useState([]);       // DA_RICEVERE / DA_EMETTERE con righe
  const [fattureVere, setFattureVere] = useState([]);   // fatture di/a Muratella dopo la decisione
  const [aperto, setAperto] = useState(null);
  const [scelta, setScelta] = useState({});              // docId -> id fattura vera scelta

  useEffect(() => { carica(); }, []);

  async function carica() {
    setCaricamento(true); setErrore(null);
    try {
      const prova = await supabase.from("ci_fatture").select("id, regolarizzazione_di").limit(1);
      if (prova.error) { setSenzaStruttura(true); setCaricamento(false); return; }
      const { data: docs, error: eD } = await fetchAllPages((da, a) => supabase.from("ci_fatture")
        .select("id, numero, data, tipo, note, totale_netto, fornitore_id, cliente_id, ci_fornitori(nome), ci_clienti(nome), ci_articoli_fattura(id, descrizione, area, centro_costo, destinazione, quantita, unita_misura, prezzo_unitario, totale_riga)")
        .in("tipo", [TIPO_DA_RICEVERE, TIPO_DA_EMETTERE]).order("data").order("id").range(da, a));
      if (eD) throw new Error(eD.message);
      const { data: vere, error: eV } = await fetchAllPages((da, a) => supabase.from("ci_fatture")
        .select("id, numero, data, tipo, totale_netto, regolarizzazione_di, fornitore_id, cliente_id, ci_fornitori(nome, partita_iva), ci_clienti(nome, partita_iva)")
        .in("tipo", ["PASSIVA", "ATTIVA"]).gte("data", DATA_DECISIONE).order("data").order("id").range(da, a));
      if (eV) throw new Error(eV.message);
      const diMuratella = (vere || []).filter(f => /02014901009/.test(f.ci_fornitori?.partita_iva || f.ci_clienti?.partita_iva || "") || f.regolarizzazione_di);
      setDocumenti(docs || []); setFattureVere(diMuratella);
    } catch (e) { setErrore(e.message); }
    setCaricamento(false);
  }

  const perAnno = useMemo(() => {
    const m = new Map();
    for (const d of documenti) {
      const anno = String(d.data).slice(0, 4);
      if (!m.has(anno)) m.set(anno, { anno, daRicevere: 0, daEmettere: 0, righe: 0 });
      const r = m.get(anno);
      const tot = (d.ci_articoli_fattura || []).reduce((s, x) => s + Number(x.totale_riga || 0), 0);
      if (d.tipo === TIPO_DA_RICEVERE) r.daRicevere += tot; else r.daEmettere += tot;
      r.righe += (d.ci_articoli_fattura || []).length;
    }
    return [...m.values()].sort((a, b) => a.anno.localeCompare(b.anno)).map(r => ({ ...r, daRicevere: round2(r.daRicevere), daEmettere: round2(r.daEmettere), netto: round2(r.daRicevere + r.daEmettere) }));
  }, [documenti]);

  const collegataA = useMemo(() => {
    const m = new Map();
    fattureVere.filter(f => f.regolarizzazione_di).forEach(f => m.set(f.regolarizzazione_di, [...(m.get(f.regolarizzazione_di) || []), f]));
    return m;
  }, [fattureVere]);
  const nonCollegate = fattureVere.filter(f => !f.regolarizzazione_di);

  async function collega(doc) {
    const idVera = Number(scelta[doc.id]);
    const vera = fattureVere.find(f => f.id === idVera);
    if (!vera) { alert("Scegliere la fattura vera da collegare."); return; }
    const attesoTipo = doc.tipo === TIPO_DA_RICEVERE ? "PASSIVA" : "ATTIVA";
    if (vera.tipo !== attesoTipo) { alert(`A un documento «${doc.tipo === TIPO_DA_RICEVERE ? "da ricevere" : "da emettere"}» si collega una fattura ${attesoTipo === "PASSIVA" ? "di acquisto" : "di vendita"}.`); return; }
    if (!window.confirm(`Collegare la fattura ${vera.numero} del ${formattaData(vera.data)} (${formattaEuro(vera.totale_netto)}) al documento «${doc.numero}»?\n\n${vera.tipo === "PASSIVA" ? "Da quel momento la fattura vera NON si conta nei costi: il costo resta quello del documento di competenza, nell'anno giusto." : "La fattura di vendita non entra nei costi: il collegamento serve a segnare il documento come emesso."}\n\nGli anni interessati andranno ricalcolati.`)) return;
    const { error } = await supabase.from("ci_fatture").update({ regolarizzazione_di: doc.id }).eq("id", vera.id);
    if (error) { alert(`Errore: ${error.message}`); return; }
    await carica();
  }

  async function scollega(vera) {
    if (!window.confirm(`Scollegare la fattura ${vera.numero}? ${vera.tipo === "PASSIVA" ? "Tornerà a contare nei costi del suo anno, insieme al documento di competenza: attenzione al doppio conteggio." : ""}`)) return;
    const { error } = await supabase.from("ci_fatture").update({ regolarizzazione_di: null }).eq("id", vera.id);
    if (error) { alert(`Errore: ${error.message}`); return; }
    await carica();
  }

  function esporta() {
    const nota = NOTA_DECISIONE.map((t, i) => ({ "N.": i + 1, "Testo": t }));
    const riepilogo = perAnno.map(r => ({ "Anno": r.anno, "Fatture da ricevere da Muratella": numeroExcel(r.daRicevere), "Fatture da emettere a Muratella (orzo)": numeroExcel(-r.daEmettere), "Effetto sui costi di Podere": numeroExcel(r.netto) }));
    const righeRicevere = [], righeEmettere = [];
    for (const d of documenti) {
      for (const x of d.ci_articoli_fattura || []) {
        const riga = { "Anno": String(d.data).slice(0, 4), "Documento": d.numero, "Data documento": formattaData(d.data), "Descrizione (fattura originale)": x.descrizione, "Area": x.area, "Centro di costo": x.centro_costo, "Quantità": numeroExcel(Number(x.quantita)), "Unità": x.unita_misura || "", "Imponibile": numeroExcel(Math.abs(Number(x.totale_riga))), "Stato": (collegataA.get(d.id) || []).length ? `regolarizzato con ${(collegataA.get(d.id) || []).map(f => f.numero).join(", ")}` : (d.tipo === TIPO_DA_RICEVERE ? "da ricevere" : "da emettere") };
        (d.tipo === TIPO_DA_RICEVERE ? righeRicevere : righeEmettere).push(riga);
      }
    }
    esportaExcel("Fatture_da_ricevere_e_da_emettere_Muratella", [
      { nome: "Nota per il commercialista", righe: nota },
      { nome: "Riepilogo per anno", righe: riepilogo },
      { nome: "Da ricevere da Muratella", righe: righeRicevere },
      { nome: "Da emettere a Muratella", righe: righeEmettere },
    ]);
  }

  const box = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 };
  const th = { padding: "6px 8px", textAlign: "left", color: C.muted, fontSize: 12 };
  const td = { padding: "6px 8px", borderTop: `1px solid ${C.border}`, fontSize: 13 };

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Fatture da Ricevere e da Emettere</h1>
      <p style={{ color: C.muted, marginTop: 0 }}>Rapporti con Muratella: costi dei campi di Podere pagati da Muratella e orzo di Podere conferito da Muratella alla Cooperativa Ceri.</p>

      <div style={{ ...box, background: "#FFF7E6", borderColor: "#E8A33D" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>📌 La decisione, spiegata (anche per il commercialista)</div>
        {NOTA_DECISIONE.map((t, i) => <p key={i} style={{ fontSize: 13, margin: "0 0 8px 0" }}>{t}</p>)}
        <button onClick={esporta} disabled={!documenti.length} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700 }}>📥 Esporta in Excel per il commercialista</button>
      </div>

      {caricamento && <p>Caricamento…</p>}
      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}
      {senzaStruttura && <div style={{ ...box, borderColor: C.red, color: C.red }}>⚠️ Il database non ha ancora la struttura della versione 237: lanciare il file contabilita_strutture_v237.sql nell'SQL Editor di Supabase.</div>}

      {!caricamento && !senzaStruttura && (
        <>
          {nonCollegate.length > 0 && (
            <div style={{ ...box, borderColor: C.red }}>
              <div style={{ fontWeight: 700, color: C.red, marginBottom: 6 }}>⚠️ Fatture con Muratella arrivate dopo la decisione e non ancora collegate</div>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 0 }}>Una fattura d'acquisto di Muratella non collegata si conta nei costi del suo anno: se è la rifatturazione dei costi già presenti qui sotto, va collegata al documento giusto, altrimenti il costo è contato due volte.</p>
              {nonCollegate.map(f => <div key={f.id} style={{ fontSize: 13 }}>{f.tipo === "PASSIVA" ? "Acquisto" : "Vendita"} n. {f.numero} del {formattaData(f.data)} — {formattaEuro(f.totale_netto)}</div>)}
            </div>
          )}

          <div style={box}>
            <div style={{ fontWeight: 700, color: C.muted, marginBottom: 8 }}>RIEPILOGO PER ANNO (effetto sui costi di Podere)</div>
            <table><thead><tr><th style={th}>Anno</th><th style={{ ...th, textAlign: "right" }}>Da ricevere da Muratella (+)</th><th style={{ ...th, textAlign: "right" }}>Da emettere a Muratella, orzo (−)</th><th style={{ ...th, textAlign: "right" }}>Effetto netto</th></tr></thead>
              <tbody>
                {perAnno.map(r => <tr key={r.anno}><td style={td}>{r.anno}</td><td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.daRicevere)}</td><td style={{ ...td, textAlign: "right" }}>{r.daEmettere ? formattaEuro(r.daEmettere) : "—"}</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(r.netto)}</td></tr>)}
                <tr><td style={{ ...td, fontWeight: 700 }}>Totale</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(round2(perAnno.reduce((s, r) => s + r.daRicevere, 0)))}</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(round2(perAnno.reduce((s, r) => s + r.daEmettere, 0)))}</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formattaEuro(round2(perAnno.reduce((s, r) => s + r.netto, 0)))}</td></tr>
              </tbody></table>
          </div>

          <div style={box}>
            <div style={{ fontWeight: 700, color: C.muted, marginBottom: 8 }}>DOCUMENTI DI COMPETENZA</div>
            {documenti.map(d => {
              const righe = d.ci_articoli_fattura || [];
              const tot = round2(righe.reduce((s, x) => s + Number(x.totale_riga || 0), 0));
              const collegate = collegataA.get(d.id) || [];
              const candidati = nonCollegate.filter(f => f.tipo === (d.tipo === TIPO_DA_RICEVERE ? "PASSIVA" : "ATTIVA"));
              return (
                <div key={d.id} style={{ borderTop: `1px solid ${C.border}`, padding: "10px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: d.tipo === TIPO_DA_RICEVERE ? C.blue : C.green, marginRight: 8 }}>{d.tipo === TIPO_DA_RICEVERE ? "DA RICEVERE" : "DA EMETTERE"}</span>
                      <b>{d.numero}</b> — {formattaData(d.data)} — {d.ci_fornitori?.nome || d.ci_clienti?.nome} — {righe.length} {righe.length === 1 ? "riga" : "righe"} — <b>{formattaEuro(tot)}</b>
                    </div>
                    <div>
                      {collegate.length
                        ? collegate.map(f => <span key={f.id} style={{ color: C.green, fontSize: 13, marginRight: 8 }}>✓ regolarizzato con n. {f.numero} del {formattaData(f.data)} <button onClick={() => scollega(f)} style={{ fontSize: 11 }}>scollega</button></span>)
                        : <span style={{ color: "#B7791F", fontSize: 13, fontWeight: 700 }}>● {d.tipo === TIPO_DA_RICEVERE ? "da ricevere" : "da emettere"}</span>}
                      {!collegate.length && candidati.length > 0 && (
                        <span style={{ marginLeft: 8 }}>
                          <select value={scelta[d.id] || ""} onChange={e => setScelta({ ...scelta, [d.id]: e.target.value })} style={{ fontSize: 12 }}>
                            <option value="">collega la fattura vera…</option>
                            {candidati.map(f => <option key={f.id} value={f.id}>n. {f.numero} del {formattaData(f.data)} — {formattaEuro(f.totale_netto)}</option>)}
                          </select>
                          <button onClick={() => collega(d)} style={{ fontSize: 12, marginLeft: 4 }}>Collega</button>
                        </span>
                      )}
                      <button onClick={() => setAperto(aperto === d.id ? null : d.id)} style={{ fontSize: 12, marginLeft: 8 }}>{aperto === d.id ? "Chiudi" : "Righe"}</button>
                    </div>
                  </div>
                  {d.note && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{d.note}</div>}
                  {aperto === d.id && (
                    <table style={{ marginTop: 8 }}><thead><tr><th style={th}>Descrizione (fattura originale)</th><th style={th}>Centro di costo</th><th style={{ ...th, textAlign: "right" }}>Imponibile</th></tr></thead>
                      <tbody>{righe.sort((a, b) => a.id - b.id).map(x => <tr key={x.id}><td style={td}>{x.descrizione}</td><td style={td}>{x.area} · {x.centro_costo}</td><td style={{ ...td, textAlign: "right" }}>{formattaEuro(Number(x.totale_riga))}</td></tr>)}</tbody></table>
                  )}
                </div>
              );
            })}
            {!documenti.length && <p style={{ color: C.muted }}>Nessun documento di competenza.</p>}
          </div>
        </>
      )}
    </div>
  );
}
