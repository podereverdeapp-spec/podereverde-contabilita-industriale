import { oggiRoma } from "./dateRoma";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { C } from "./style";
import { formattaEuro, formattaNumero, round2 } from "./parsingUtils";
import { btn, scheda, th, td, testata, dataIt } from "./stileAruba";
import { caricaReportRicavi, dettaglioColonna, COLONNE_RICAVI } from "./calcoloReportRicavi";

// Versione 410 — Report Ricavi (prende il posto di «Vendite per Anno e per Tipo», versione 303).
// Decisioni del Dott. Bizzarri del 26/11/2026, ore 15:37–17:52: nove colonne senza IVA, un pulsante di dettaglio per ogni colonna,
// anno di competenza, contributi nell'anno della domanda, rifattura FPR 5/25 nel 2024.
// Con la nuova impaginazione questa pagina va nella sezione «Analisi dei costi e dei ricavi» (decisione delle 17:46).

const nomeColonna = k => (COLONNE_RICAVI.find(c => c.chiave === k) || {}).nome || "Totale";
// capi o kg di una vendita di animali vivi: dalla quantità e dall'unità della fattura, o dai capi scritti nella descrizione
const quantitaVivi = r => {
  const u = String(r.unita || "").toUpperCase(); const q = Math.abs(Number(r.quantita) || 0);
  if (/^K/.test(u) || (/\bKG\.?$/.test(String(r.descrizione || "").toUpperCase()) && q)) return `${formattaNumero(q)} kg`;
  const capi = String(r.descrizione || "").toUpperCase().match(/\b(?:N\.?|NR\.?)\s*(\d+)\s/);
  if (/^(NR|N|PZ|CAPI)/.test(u) && q) return `${formattaNumero(q, 0)} ${q === 1 ? "capo" : "capi"}`;
  if (capi) return `${capi[1]} ${capi[1] === "1" ? "capo" : "capi"}`;
  if (!u && q && q % 1 === 0 && q < 100) return `${q} ${q === 1 ? "capo" : "capi"}`;
  return q ? `${formattaNumero(q, q % 1 ? 2 : 0)} ${u.toLowerCase() || "(unità non scritta)"}` : "—";
};
const kgTesto = g => g.kg ? `${formattaNumero(g.kg)} kg${g.kgDalNome ? (g.kgDalNome === g.righe - g.kgMancanti ? " (dal nome)" : " (in parte dal nome)") : ""}${g.kgMancanti ? ` · ${g.kgMancanti} righe senza kg` : ""}` : (g.kgMancanti ? "kg non indicati" : "—");

export default function VenditePerAnno() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [scelta, setScelta] = useState(null); // { anno, colonna, gruppo? }
  const [dettaglio, setDettaglio] = useState(null); // chiave della colonna
  const [quando, setQuando] = useState(null);

  function leggi() {
    setDati(null); setErrore(null);
    const oggi = oggiRoma();
    caricaReportRicavi(oggi).then(d => { setDati(d); setQuando(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })); }).catch(e => setErrore(e.message));
  }
  useEffect(leggi, []);
  if (errore) return <div style={{ padding: 20, color: C.red, fontWeight: 700 }}>⚠️ {errore}</div>;
  if (!dati) return <div style={{ padding: 20, color: C.muted }}>Lettura delle fatture e dei contributi…</div>;

  const totali = Object.fromEntries(COLONNE_RICAVI.map(c => [c.chiave, round2(dati.anni.reduce((s, a) => s + a[c.chiave], 0))]));
  const totaleGenerale = round2(dati.anni.reduce((s, a) => s + a.totale, 0));
  const oggiIt = dataIt(dati.oggi);
  const etichettaAnno = a => a.inCorso ? `${a.anno} fino al ${oggiIt.slice(0, 5)}` : String(a.anno);
  const gruppoDi = r => r.colonna === "animali" ? r.specie : r.colonna === "prodotti" ? r.voce : r.cliente;
  const righeScelte = scelta ? dati.righe.filter(r => (scelta.anno === "tutti" || r.anno === scelta.anno) && (scelta.colonna === "tutti" || r.colonna === scelta.colonna) && (!scelta.gruppo || gruppoDi(r) === scelta.gruppo)).sort((a, b) => String(a.data).localeCompare(String(b.data))) : [];
  const conSegnale = dati.righe.filter(r => r.segnale);
  const daClassificare = dati.righe.filter(r => /da classificare|non trovata/.test(r.segnale));
  const specieDaSistemare = dati.righe.filter(r => r.specie === "Specie da sistemare");

  const cella = (anno, colonna, valore, forte) => (
    <td key={colonna} style={{ ...td, padding: "6px 6px", whiteSpace: "nowrap", textAlign: "right", fontWeight: forte ? 800 : 400, cursor: "pointer", textDecoration: valore ? "underline dotted" : "none", color: valore ? undefined : C.muted, background: scelta && !scelta.gruppo && scelta.anno === anno && scelta.colonna === colonna ? "#E8F0E4" : undefined }}
      onClick={() => setScelta(scelta && scelta.anno === anno && scelta.colonna === colonna && !scelta.gruppo ? null : { anno, colonna })}>{valore ? formattaEuro(valore) : "—"}</td>
  );

  function esporta() {
    const riepilogo = dati.anni.map(a => ({ Anno: etichettaAnno(a), ...Object.fromEntries(COLONNE_RICAVI.map(c => [c.nome, a[c.chiave]])), Totale: a.totale }));
    const righe = dati.righe.map(r => ({ Anno: r.anno, "Da dove viene l'anno": r.come, Colonna: nomeColonna(r.colonna), Numero: r.numero, Data: r.data, "Cliente o ente": r.cliente, Descrizione: r.descrizione,
      "Importo senza IVA": r.importo, Specie: r.specie || "", "Voce del prodotto": r.voce || "", Kg: r.kg ?? "", "Come sono i kg": r.kgCome || "", Segnale: r.segnale || "" }));
    const animali = dettaglioColonna(dati, "animali").flatMap(a => a.gruppi.map(g => ({ Anno: a.anno, Specie: g.nome, "Importo senza IVA": g.importo, "Kg carcassa": g.kg, "Euro al kg": g.euroKg ?? "" })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(riepilogo), "Report Ricavi");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(animali), "Animali per specie");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(righe), "Righe");
    XLSX.writeFile(wb, `Report_Ricavi_${oggiRoma()}.xlsx`);
  }

  const det = dettaglio ? dettaglioColonna(dati, dettaglio) : null;
  const conGruppi = ["animali", "prodotti", "contoterzi", "allevamento"].includes(dettaglio);

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ color: C.primary, fontSize: 24, margin: 0 }}>Report Ricavi</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: C.muted }}>Letto alle {quando}</span>
          <button onClick={leggi} style={btn(false)}>🔄 Ricarica</button>
          <button onClick={esporta} style={btn(false)}>📥 Esporta Excel</button>
        </div>
      </div>
      <p style={{ color: C.muted, marginTop: 4, marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
        Tutti i ricavi dell'azienda anno per anno, <b>senza IVA</b>: fatture di vendita (registrate in contabilità ed emesse dal programma), contributi e indennizzi.
        Ogni vendita è nell'anno in cui è avvenuta (periodo scritto in fattura o data di uscita del capo); i contributi nell'anno della domanda.
        Le note di credito sono in negativo, nella colonna e nell'anno della fattura che stornano. Il pulsante <b>▸ Dettaglio</b> sotto ogni colonna la divide; cliccando un importo si vedono le righe che lo formano.
      </p>
      {(daClassificare.length > 0 || specieDaSistemare.length > 0) && (
        <div style={{ ...scheda, borderLeft: `4px solid ${C.orange || "#D08602"}`, fontSize: 13 }}>
          {daClassificare.length > 0 && <div>⚠️ <b>{daClassificare.length} righe da classificare</b> sono in «Altro» ({formattaEuro(round2(daClassificare.reduce((s, r) => s + r.importo, 0)))}): si vedono aprendo il dettaglio di «Altro».</div>}
          {specieDaSistemare.length > 0 && <div>⚠️ <b>{specieDaSistemare.length} vendite di animali senza specie riconosciuta</b>: nel dettaglio di «Vendita animali» alla voce «Specie da sistemare».</div>}
        </div>
      )}
      <div style={{ ...scheda, padding: 0, overflow: "auto" }}>
        <table style={{ width: "100%", fontSize: 12.5 }}>
          <thead>
            <tr style={testata}>
              <th style={th}>Anno</th>
              {COLONNE_RICAVI.map(c => <th key={c.chiave} style={{ ...th, textAlign: "right", whiteSpace: "normal", minWidth: 72, padding: "6px 6px" }}>{c.nome}</th>)}
              <th style={{ ...th, textAlign: "right" }}>Totale</th>
            </tr>
            <tr style={{ background: "#F7F6F1" }}>
              <th style={th}></th>
              {COLONNE_RICAVI.map(c => (
                <th key={c.chiave} style={{ ...th, textAlign: "right", padding: "4px 6px" }}>
                  <button onClick={() => setDettaglio(dettaglio === c.chiave ? null : c.chiave)} style={{ ...btn(dettaglio === c.chiave), height: 24, padding: "0 6px", fontSize: 11 }}>{dettaglio === c.chiave ? "▾ Dettaglio" : "▸ Dettaglio"}</button>
                </th>
              ))}
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {dati.anni.map(a => (
              <tr key={a.anno} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>{etichettaAnno(a)}</td>
                {COLONNE_RICAVI.map(c => cella(a.anno, c.chiave, a[c.chiave]))}
                {cella(a.anno, "tutti", a.totale, true)}
              </tr>
            ))}
            <tr style={{ borderTop: `2px solid ${C.primary}`, background: "#F3F1EA" }}>
              <td style={{ ...td, fontWeight: 800 }}>Tutti gli anni</td>
              {COLONNE_RICAVI.map(c => cella("tutti", c.chiave, totali[c.chiave], true))}
              {cella("tutti", "tutti", totaleGenerale, true)}
            </tr>
          </tbody>
        </table>
      </div>

      {det && (
        <div style={scheda}>
          <div style={{ fontWeight: 800, color: C.primary, marginBottom: 6 }}>
            Dettaglio — {nomeColonna(dettaglio)}
            <button onClick={() => setDettaglio(null)} style={{ ...btn(false), height: 26, padding: "0 8px", fontSize: 11.5, marginLeft: 10 }}>Chiudi</button>
          </div>
          {dettaglio === "animali" && <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Per specie, con i kg carcassa scritti in fattura (mezzene e quarti sommati) e il prezzo medio al kg.</div>}
          {dettaglio === "prodotti" && <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Carne bovina, carne suina, salumi, birre. I prodotti che ne mescolano due (pacco con birra, salsicce bovino-suino, pacchi senza specie scritta) sono in «Misti». I kg dei prodotti venduti a pezzi sono letti dal nome («da 400 gr»); dove il nome non li ha: «kg non indicati».</div>}
          {dettaglio === "contributi" && <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Contributi AGEA, contributi a fondo perduto e crediti d'imposta, nell'anno della domanda; «anno dedotto» dove l'anno viene dai codici della causale. Finché non c'è la sezione «Contributi PAC e agricoli» in Gestione contabilità, un contributo nuovo entra qui solo con un SQL.</div>}
          <table style={{ fontSize: 12.5 }}>
            <thead><tr style={{ color: C.muted }}>
              <th style={th}>Anno</th>
              {conGruppi ? <><th style={th}>{dettaglio === "animali" ? "Specie" : dettaglio === "prodotti" ? "Voce" : "Cliente"}</th><th style={{ ...th, textAlign: "right" }}>Importo</th>{(dettaglio === "animali" || dettaglio === "prodotti") && <><th style={{ ...th, textAlign: "right" }}>Kg</th><th style={{ ...th, textAlign: "right" }}>€ al kg</th></>}<th style={{ ...th, textAlign: "right" }}>Righe</th></>
                : <><th style={th}>Data</th><th style={th}>Documento</th><th style={th}>Cliente o ente</th><th style={th}>Descrizione</th><th style={th}>Da dove viene l'anno</th>{dettaglio === "vivi" && <th style={{ ...th, textAlign: "right" }}>Capi o kg</th>}<th style={{ ...th, textAlign: "right" }}>Importo</th></>}
            </tr></thead>
            <tbody>
              {det.map(a => conGruppi ? a.gruppi.map((g, i) => (
                <tr key={a.anno + g.nome} style={{ borderTop: i === 0 ? `2px solid ${C.border}` : `1px solid ${C.border}`, color: g.nome === "Specie da sistemare" ? C.red : undefined }}>
                  <td style={{ ...td, fontWeight: 700 }}>{i === 0 ? a.anno : ""}</td><td style={td}>{g.nome}</td>
                  <td style={{ ...td, textAlign: "right" }}>{formattaEuro(g.importo)}</td>
                  {(dettaglio === "animali" || dettaglio === "prodotti") && <><td style={{ ...td, textAlign: "right" }}>{kgTesto(g)}</td><td style={{ ...td, textAlign: "right" }}>{g.euroKg ? formattaEuro(g.euroKg) : "—"}</td></>}
                  <td style={{ ...td, textAlign: "right", cursor: "pointer", textDecoration: "underline dotted" }} onClick={() => setScelta({ anno: a.anno, colonna: dettaglio, gruppo: g.nome })}>{g.righe}</td>
                </tr>
              )) : a.righe.map((r, i) => (
                <tr key={a.anno + "-" + i} style={{ borderTop: i === 0 ? `2px solid ${C.border}` : `1px solid ${C.border}` }}>
                  <td style={{ ...td, fontWeight: 700 }}>{i === 0 ? a.anno : ""}</td><td style={td}>{dataIt(r.data)}</td><td style={{ ...td, whiteSpace: "nowrap" }}>{r.numero || (r.origine === "entrata" ? "accredito" : "")}</td>
                  <td style={td}>{r.cliente}</td><td style={td}>{r.descrizione}{r.segnale ? <span style={{ color: C.red, fontWeight: 700 }}> · {r.segnale}</span> : null}</td><td style={td}>{r.come}</td>
                  {dettaglio === "vivi" && <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{quantitaVivi(r)}</td>}
                  <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.importo)}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}

      {scelta && (
        <div style={scheda}>
          <div style={{ fontWeight: 800, color: C.primary, marginBottom: 8 }}>
            {nomeColonna(scelta.colonna)}{scelta.gruppo ? ` — ${scelta.gruppo}` : ""} — {scelta.anno === "tutti" ? "tutti gli anni" : scelta.anno}: {righeScelte.length} righe, {formattaEuro(round2(righeScelte.reduce((s, r) => s + (r.importo || 0), 0)))}
            <button onClick={() => setScelta(null)} style={{ ...btn(false), height: 26, padding: "0 8px", fontSize: 11.5, marginLeft: 10 }}>Chiudi</button>
          </div>
          <table style={{ fontSize: 12 }}>
            <thead><tr style={{ color: C.muted }}><th style={th}>Documento</th><th style={th}>Data</th><th style={th}>Cliente o ente</th><th style={th}>Descrizione</th>{scelta.colonna === "tutti" && <th style={th}>Colonna</th>}<th style={th}>Anno da</th><th style={{ ...th, textAlign: "right" }}>Kg</th><th style={{ ...th, textAlign: "right" }}>Importo</th></tr></thead>
            <tbody>{righeScelte.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 700 }}>{r.numero || (r.origine === "entrata" ? "accredito" : "")}</td><td style={td}>{dataIt(r.data)}</td><td style={td}>{r.cliente}</td>
                <td style={td}>{r.descrizione}{r.segnale ? <span style={{ color: C.red, fontWeight: 700 }}> · {r.segnale}</span> : null}</td>{scelta.colonna === "tutti" && <td style={td}>{nomeColonna(r.colonna)}</td>}
                <td style={td}>{r.come}</td><td style={{ ...td, textAlign: "right" }}>{r.kg ? `${formattaNumero(r.kg)}${r.kgCome === "kg dal nome" ? " (dal nome)" : ""}` : ""}</td>
                <td style={{ ...td, textAlign: "right" }}>{formattaEuro(r.importo)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
        Righe con un segnale: {conSegnale.length} (per lo più «nessun periodo scritto»: la vendita è nell'anno della fattura). La rifattura a Muratella FPR 5/25 è nel 2024 come nel bilancio (decisione del Dott. Bizzarri del 26/11/2026).
      </p>
    </div>
  );
}
