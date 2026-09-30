import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { formattaEuro, round2 } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";
import { caricaReseStagioni, ordinaCampagne, campagneContinue, perUnita, PESO_BALLA_KG } from "./calcoloCampiStagioni";

// Coltivazioni → Campi e Stagioni → Rese e Costi per Stagione
// Sola lettura. Stesse regole dei report dell'app: il costo di ogni coltura si divide tra i suoi
// prodotti in proporzione al valore di mercato; balloni e rotoballe pesano 340 kg.
const stileSelect = { height: 36, padding: "0 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, background: "#fff" };
const stileEtichetta = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: C.muted, fontWeight: 700 };
const th = { padding: "8px 8px", fontSize: 11, textAlign: "right", whiteSpace: "nowrap" };
const td = { padding: "7px 8px", textAlign: "right", whiteSpace: "nowrap", borderTop: `1px solid ${C.border}` };
const q = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: d }));
const q1 = v => (v == null ? "—" : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const eu = v => (v == null ? "—" : formattaEuro(v));
const segno = v => (v == null ? "—" : (v >= 0 ? "+" : "−") + formattaEuro(Math.abs(v)));

function Titolo({ children, sotto }) {
  return (<>
    <h2 style={{ color: C.primary, fontSize: 17, margin: "22px 0 4px" }}>{children}</h2>
    {sotto && <p style={{ color: C.muted, fontSize: 12.5, margin: "0 0 8px" }}>{sotto}</p>}
  </>);
}

export default function ColtReseStagioni() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [campagna, setCampagna] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const d = await caricaReseStagioni();
        setDati(d);
        setCampagna(ordinaCampagne(d.campagne.filter(c => !c.inCorso).map(c => c.campagna))[0] || "");
      } catch (err) { setErrore(err.message); }
    })();
  }, []);

  const riepilogo = useMemo(() => {
    if (!dati) return [];
    const per = Object.fromEntries(dati.campagne.map(c => [c.campagna, c]));
    return campagneContinue(dati.campagne.map(c => c.campagna)).map(cp => per[cp] || { campagna: cp, nonCaricata: true });
  }, [dati]);

  const prodotti = useMemo(() => (dati ? dati.prodotti.filter(p => p.campagna === campagna && p.prodotto) : []), [dati, campagna]);
  const pascoli = useMemo(() => {
    if (!dati) return [];
    const m = {};
    dati.prodotti.filter(p => p.campagna === campagna && !p.prodotto).forEach(p => { m[p.id] = p; });
    return Object.values(m);
  }, [dati, campagna]);
  const prezzi = useMemo(() => (dati ? dati.prezzi.filter(p => p.campagna === campagna) : []), [dati, campagna]);
  const rese = useMemo(() => (dati ? dati.rese.filter(p => p.campagna === campagna) : []), [dati, campagna]);
  const tc = riepilogo.find(r => r.campagna === campagna);

  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;
  if (!dati) return <div style={{ padding: 20, color: C.muted }}>Lettura delle rese e dei costi...</div>;

  const esito = p => (p.costoQuintale == null || p.prezzoQ == null ? null : p.costoQuintale <= p.prezzoQ);

  function esporta() {
    const fogli = [{
      nome: "RIEPILOGO CAMPAGNE", righe: riepilogo.map(r => r.nonCaricata ? { "Campagna": r.campagna, "Stato": "non ancora caricata" } : {
        "Campagna": r.campagna, "Stato": r.inCorso ? "in corso" : "conclusa", "Numero di colture": r.colture, "Ettari": numeroExcel(r.ettari),
        "Semi in euro": numeroExcel(r.semi), "Concimi in euro": numeroExcel(r.concimi), "Fitosanitari in euro": numeroExcel(r.fitosanitari),
        "Lavorazioni in euro": numeroExcel(r.lavorazioni), "Altro in euro": numeroExcel(r.altro), "Costo totale in euro": numeroExcel(r.costo),
        "Costo per ettaro in euro": numeroExcel(r.perEttaro), "Valore di mercato dei prodotti in euro": numeroExcel(r.valore),
        "Saldo contro il mercato in euro": numeroExcel(r.saldo),
      }),
    }, {
      nome: `RESE ${campagna.replace("/", "-")}`, righe: prodotti.map(p => ({
        "Numero del campo": p.numero, "Campo": p.campo, "Coltura": p.coltura, "Ettari": numeroExcel(p.ettari),
        "Costo della coltura in euro": numeroExcel(p.costoColtura), "Prodotto": p.prodotto, "Quantità raccolta": numeroExcel(p.quantita),
        "Unità di misura": p.unita, "Quantità in quintali": numeroExcel(p.quintali), "Resa in quintali per ettaro": numeroExcel(p.resaQ),
        "Resa di riferimento in quintali per ettaro": p.resaRiferimento ?? "non indicata",
        "Prezzo di mercato in euro al quintale": numeroExcel(p.prezzoQ), "Prezzo di mercato per unità in euro": numeroExcel(p.prezzoUnita),
        "Valore di mercato in euro": numeroExcel(p.valore), "Quota del costo": p.quota != null ? Math.round(p.quota * 10000) / 10000 : null,
        "Costo attribuito al prodotto in euro": numeroExcel(p.costo), "Costo per unità in euro": numeroExcel(p.costoUnitario),
        "Costo al quintale in euro": numeroExcel(p.costoQuintale),
        "Esito": esito(p) == null ? "senza prezzo di mercato" : esito(p) ? "sotto il mercato" : "sopra il mercato",
      })),
      coloriRiga: r => r["Esito"] === "sopra il mercato",
    }];
    if (pascoli.length) fogli.push({ nome: "PASCOLI", righe: pascoli.map(p => ({
      "Numero del campo": p.numero, "Campo": p.campo, "Coltura": p.coltura, "Ettari": numeroExcel(p.ettari),
      "Costo in euro": numeroExcel(p.costoColtura), "Costo per ettaro in euro": numeroExcel(p.costoPerEttaro) })) });
    fogli.push({ nome: "PREZZI DI MERCATO", righe: prezzi.map(p => ({
      "Campagna": p.campagna, "Prodotto": p.prodotto, "Unità di raccolta": p.unita_raccolta,
      "Prezzo di mercato in euro al quintale": numeroExcel(Number(p.prezzo_q)),
      "Prezzo per unità di raccolta in euro": numeroExcel(p.unita_raccolta === "quintali" ? Number(p.prezzo_q) : Number(p.prezzo_q) * PESO_BALLA_KG / 100),
      "Fonte": p.fonte || "" })) });
    fogli.push({ nome: "RESE DI RIFERIMENTO", righe: rese.map(r => ({
      "Campagna": r.campagna, "Coltura": r.coltura, "Prodotto": r.prodotto,
      "Resa di riferimento in quintali per ettaro": numeroExcel(Number(r.resa_q_ha)), "Fonte": r.fonte || "" })) });
    esportaExcel(`Rese_e_Costi_${campagna.replace("/", "_")}`, fogli);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1500, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Rese e Costi per Stagione</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
        Quanto è costato ogni prodotto raccolto e quanto sarebbe costato comprarlo. Il costo di ogni coltura si divide tra i suoi prodotti (paglia e seme compresi) in proporzione al valore di mercato. Balloni e rotoballe: {PESO_BALLA_KG} chilogrammi.
      </p>

      <Titolo sotto="Tutte le campagne. Il saldo è il valore di mercato dei prodotti meno il costo di coltivazione (compresi i pascoli, che non hanno raccolta).">Riepilogo delle campagne</Titolo>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>
            <th style={{ ...th, textAlign: "left" }}>Campagna</th>
            {["Ettari", "Colture", "Semi", "Concimi", "Fitosanitari", "Lavorazioni", "Altro", "Costo totale", "Costo per ettaro", "Valore di mercato", "Saldo contro il mercato"].map(h => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>{[...riepilogo].reverse().map(r => (
            <tr key={r.campagna} onClick={() => !r.nonCaricata && !r.inCorso && setCampagna(r.campagna)}
              style={{ cursor: r.nonCaricata || r.inCorso ? "default" : "pointer", background: r.campagna === campagna ? "#EEF3EF" : undefined }}>
              <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>{r.campagna}</td>
              {r.nonCaricata ? <td colSpan={11} style={{ ...td, textAlign: "left", color: C.muted }}>campagna non ancora caricata</td>
                : r.inCorso ? <><td style={td}>{q(r.ettari)}</td><td style={td}>{r.colture}</td><td colSpan={9} style={{ ...td, textAlign: "left", color: C.muted }}>campagna in corso: costi e raccolte non ancora registrati</td></>
                : <>
                  <td style={td}>{q(r.ettari)}</td><td style={td}>{r.colture}</td>
                  <td style={td}>{eu(r.semi)}</td><td style={td}>{eu(r.concimi)}</td><td style={td}>{eu(r.fitosanitari)}</td>
                  <td style={td}>{eu(r.lavorazioni)}</td><td style={td}>{eu(r.altro)}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{eu(r.costo)}</td><td style={td}>{eu(r.perEttaro)}</td>
                  <td style={td}>{eu(r.valore)}</td>
                  <td style={{ ...td, fontWeight: 800, color: r.saldo == null ? C.muted : r.saldo < 0 ? C.red : C.green }}>{segno(r.saldo)}</td>
                </>}
            </tr>))}</tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", margin: "18px 0 0" }}>
        <label style={stileEtichetta}>Campagna
          <select value={campagna} onChange={e => setCampagna(e.target.value)} style={stileSelect}>
            {ordinaCampagne(dati.campagne.filter(c => !c.inCorso).map(c => c.campagna)).map(cp => <option key={cp}>{cp}</option>)}
          </select>
        </label>
        {tc && !tc.nonCaricata && <div style={{ fontSize: 13, color: C.text }}>
          <b>{q(tc.ettari)}</b> ettari · costo <b>{eu(tc.costo)}</b> · <b>{eu(tc.perEttaro)}</b> per ettaro · saldo <b style={{ color: tc.saldo < 0 ? C.red : C.green }}>{segno(tc.saldo)}</b>
        </div>}
        <button onClick={esporta} style={{ marginLeft: "auto", height: 38, padding: "0 16px", border: "none", borderRadius: 8, background: C.primary, color: "#fff", fontSize: 13, fontWeight: 700 }}>Esporta Excel</button>
      </div>

      <Titolo sotto="Verde: produrre è costato meno che comprare. Rosso: è costato di più. Il confronto è sempre al quintale.">Prodotti raccolti nella campagna {campagna}</Titolo>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: C.primary, color: "#fff" }}>
            <th style={{ ...th, textAlign: "left" }}>Campo</th><th style={{ ...th, textAlign: "left" }}>Coltura e prodotto</th>
            {["Quantità raccolta", "Resa in quintali per ettaro", "Costo attribuito", "Costo per unità", "Costo al quintale", "Prezzo di mercato al quintale", "Differenza al quintale"].map(h => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>{prodotti.map((p, i) => {
            const e = esito(p);
            const col = e == null ? C.muted : e ? C.green : C.red;
            return (
              <tr key={i}>
                <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}><b>{p.numero}</b> — {p.campo}<div style={{ fontSize: 10.5, color: C.muted }}>{q(p.ettari)} ettari</div></td>
                <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}>{p.coltura}<div style={{ fontWeight: 700 }}>{p.prodotto}</div></td>
                <td style={td}>{q(p.quantita)} {p.unita}{p.unita !== "quintali" && <div style={{ fontSize: 10.5, color: C.muted }}>{q(p.quintali)} quintali</div>}</td>
                <td style={td}>{q1(p.resaQ)}<div style={{ fontSize: 10.5, color: C.muted }}>riferimento {p.resaRiferimento == null ? "non indicato" : q1(p.resaRiferimento)}</div></td>
                <td style={td}>{eu(p.costo)}</td>
                <td style={td}>{eu(p.costoUnitario)}<div style={{ fontSize: 10.5, color: C.muted }}>{perUnita(p.unita)}</div></td>
                <td style={{ ...td, fontWeight: 800, color: col }}>{eu(p.costoQuintale)}</td>
                <td style={td}>{p.prezzoQ == null ? <span style={{ color: C.muted }}>senza prezzo</span> : eu(p.prezzoQ)}</td>
                <td style={{ ...td, fontWeight: 700, color: col }}>{e == null ? "—" : segno(round2(p.costoQuintale - p.prezzoQ))}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>

      {pascoli.length > 0 && <>
        <Titolo sotto="Colture pascolate dagli animali (o non ancora raccolte): hanno un costo ma nessuna raccolta.">Pascoli e colture senza raccolta</Titolo>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ background: C.primary, color: "#fff" }}>
              <th style={{ ...th, textAlign: "left" }}>Campo</th><th style={{ ...th, textAlign: "left" }}>Coltura</th>
              <th style={th}>Ettari</th><th style={th}>Costo</th><th style={th}>Costo per ettaro</th>
            </tr></thead>
            <tbody>{pascoli.map(p => (
              <tr key={p.id}>
                <td style={{ ...td, textAlign: "left" }}><b>{p.numero}</b> — {p.campo}</td>
                <td style={{ ...td, textAlign: "left" }}>{p.coltura}</td>
                <td style={td}>{q(p.ettari)}</td><td style={td}>{eu(p.costoColtura)}</td><td style={td}>{eu(p.costoPerEttaro)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 14 }}>
        <div>
          <Titolo>Prezzi di mercato {campagna}</Titolo>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "4px 12px", fontSize: 12.5 }}>
            {prezzi.length === 0 && <div style={{ padding: 8, color: C.muted }}>Nessun prezzo registrato.</div>}
            {prezzi.map(p => (
              <div key={p.id} style={{ padding: "7px 0", borderTop: `1px solid ${C.border}` }}>
                <b>{p.prodotto}</b> ({p.unita_raccolta}): <b>{formattaEuro(Number(p.prezzo_q))}</b> al quintale
                <div style={{ fontSize: 11.5, color: C.muted }}>{p.fonte || "fonte non indicata"}</div>
              </div>))}
          </div>
        </div>
        <div>
          <Titolo>Rese di riferimento {campagna}</Titolo>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "4px 12px", fontSize: 12.5 }}>
            {rese.length === 0 && <div style={{ padding: 8, color: C.muted }}>Nessuna resa di riferimento registrata.</div>}
            {rese.map(r => (
              <div key={r.id} style={{ padding: "7px 0", borderTop: `1px solid ${C.border}` }}>
                <b>{r.coltura} · {r.prodotto}</b>: <b>{q1(Number(r.resa_q_ha))}</b> quintali per ettaro
                <div style={{ fontSize: 11.5, color: C.muted }}>{r.fonte || "fonte non indicata"}</div>
              </div>))}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
        Prezzi e rese di riferimento si gestiscono nell'app Podere Verde (Coltivazione → Report → Prezzi e rese): qui si consultano soltanto.
      </p>
    </div>
  );
}
