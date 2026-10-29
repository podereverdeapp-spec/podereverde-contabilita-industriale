// Versione 325 (29/10/2026): Alimentaria → Razioni attive e Controllo costi → Pollame.
// «Quanto costa nutrire il pollame» (decisione del 28/10/2026): acquisti dei mangimi per il pollame, periodo per periodo
// (tra un acquisto e il successivo dello stesso prodotto), capi che quel mangime può nutrire, confronto con le galline
// presenti e resa in uova. Il pollame resta fuori dal costo di bovini, suini e ovini.
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaNumero, formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

const GIORNO = 86400000;
const dataIt = d => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const th = { padding: "7px 8px", textAlign: "left", background: C.primary, color: "#fff", fontWeight: 700, fontSize: 12, verticalAlign: "bottom" };
const td = { padding: "6px 8px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
const num = { ...td, textAlign: "right", whiteSpace: "nowrap" };
const inp = { width: 90, padding: 6, borderRadius: 6, border: `1px solid ${C.border}` };

export default function ControlloPollame() {
  const [righe, setRighe] = useState(null);
  const [errore, setErrore] = useState(null);
  const [galline, setGalline] = useState("");
  const [grammi, setGrammi] = useState(138);
  const [uova, setUova] = useState(180);
  const [prezzoUovo, setPrezzoUovo] = useState(0.5);

  useEffect(() => {
    (async () => {
      try {
        const { data: al, error: e1 } = await supabase.from("ci_alimenti_nutrizione").select("nome,tipologia_prezzo,specie");
        if (e1) throw new Error(e1.message);
        const tip = (al || []).filter(a => (a.specie || []).includes("pollame")).map(a => a.tipologia_prezzo);
        if (!tip.length) { setRighe([]); return; }
        const { data, error } = await supabase.from("ci_v_prezzi_alimenti_righe").select("data,numero,fornitore,descrizione,tipologia,componente,tonnellate,euro_per_t").in("tipologia", tip).order("data");
        if (error) throw new Error(error.message);
        setRighe((data || []).filter(r => r.componente === "merce").map(r => ({ ...r, kg: Number(r.tonnellate) * 1000, euro: Number(r.tonnellate) * Number(r.euro_per_t) })));
      } catch (e) { setErrore(e.message); setRighe([]); }
    })();
  }, []);

  if (righe === null) return <div style={{ padding: 20, color: C.muted }}>Caricamento…</div>;
  const oggi = new Date().toISOString().slice(0, 10);
  const kgCapo = (Number(grammi) || 0) / 1000;
  const nGalline = Number(galline) > 0 ? Number(galline) : null;
  // periodi: per ogni prodotto, da un acquisto al successivo (stessa data = un acquisto solo)
  const perProdotto = {};
  righe.forEach(r => { const k = r.tipologia; (perProdotto[k] = perProdotto[k] || {}); perProdotto[k][r.data] = perProdotto[k][r.data] || { data: r.data, kg: 0, euro: 0, fatture: new Set() }; const x = perProdotto[k][r.data]; x.kg += r.kg; x.euro += r.euro; x.fatture.add(`${r.fornitore} ${r.numero}`); });
  const periodi = [];
  Object.entries(perProdotto).forEach(([prod, perData]) => {
    const L = Object.values(perData).sort((a, b) => a.data.localeCompare(b.data));
    L.forEach((x, i) => {
      const al = i + 1 < L.length ? L[i + 1].data : null;
      const giorni = Math.round(((al ? new Date(al) : new Date(oggi)) - new Date(x.data)) / GIORNO);
      // le galline ovaiole mangiano il mangime per ovaiole; il Tuttopollaio va a polli e pollastre (niente uova)
      const ovaiole = /ovaiol|gallin/i.test(prod);
      const inCorso = !al;
      const capi = !inCorso && giorni > 0 && kgCapo > 0 ? x.kg / (kgCapo * giorni) : null;
      const necessari = ovaiole && nGalline && giorni > 0 ? nGalline * kgCapo * giorni : null;
      const uovaProdotte = ovaiole && !inCorso && giorni > 0 ? (nGalline || capi || 0) * giorni * (Number(uova) || 0) / 365 : null;
      const uovaPerPagare = ovaiole && prezzoUovo > 0 ? x.euro / prezzoUovo : null;
      periodi.push({ prodotto: prod, per: ovaiole ? "Galline ovaiole" : "Polli e pollastre", dal: x.data, al, inCorso, giorni, kg: x.kg, euro: x.euro, fatture: [...x.fatture].join("; "), capi, necessari, eccesso: necessari != null ? x.kg - necessari : null, uovaProdotte, uovaPerPagare, costoUovo: uovaProdotte > 0 ? x.euro / uovaProdotte : null });
    });
  });
  periodi.sort((a, b) => a.prodotto.localeCompare(b.prodotto) || a.dal.localeCompare(b.dal));
  const totKg = periodi.reduce((s, p) => s + p.kg, 0), totEuro = periodi.reduce((s, p) => s + p.euro, 0);

  function esporta() {
    esportaExcel("Pollame_quanto_costa_nutrirlo", [{ nome: "Periodi", righe: periodi.map(p => ({
      "Prodotto": p.prodotto, "Per": p.per, "Dal": dataIt(p.dal), "Al": p.inCorso ? "in corso" : dataIt(p.al), "Giorni": p.giorni, "Chilogrammi": numeroExcel(p.kg), "Euro": numeroExcel(p.euro),
      "Capi nutriti": p.capi != null ? numeroExcel(p.capi) : null, "Chilogrammi necessari alle galline presenti": p.necessari != null ? numeroExcel(p.necessari) : null,
      [p.inCorso ? "Rimanenza stimata a oggi (chilogrammi)" : "Eccesso (chilogrammi)"]: p.eccesso != null ? numeroExcel(p.eccesso) : null, "Uova prodotte (stima)": p.uovaProdotte != null ? Math.round(p.uovaProdotte) : null,
      "Uova necessarie per pagare il mangime": p.uovaPerPagare != null ? Math.round(p.uovaPerPagare) : null, "Fatture": p.fatture,
    })) }]);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1300 }}>
      <h1 style={{ color: C.primary, fontSize: 24, margin: "0 0 4px" }}>🐔 Pollame — quanto costa nutrirlo</h1>
      <p style={{ color: C.muted, fontSize: 13, marginTop: 0, maxWidth: 1000 }}>
        I mangimi per il pollame comprati con le fatture, periodo per periodo (da un acquisto al successivo dello stesso prodotto). Con il consumo
        per capo si vede quanti capi quel mangime può nutrire; con il numero medio di galline presenti si vede l'eccesso. Il pollame resta fuori
        dal costo di bovini, suini e ovini.
      </p>
      {errore && <div style={{ color: C.red, marginBottom: 10 }}>Errore: {errore}</div>}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13 }}>
        <label>Galline ovaiole presenti in media<br /><input type="number" min={0} value={galline} placeholder="da indicare" onChange={e => setGalline(e.target.value)} style={inp} /></label>
        <label>Grammi al giorno per capo (spreco compreso)<br /><input type="number" min={0} value={grammi} onChange={e => setGrammi(e.target.value)} style={inp} /></label>
        <label>Uova all'anno per gallina<br /><input type="number" min={0} value={uova} onChange={e => setUova(e.target.value)} style={inp} /></label>
        <label>Prezzo di vendita di un uovo (euro)<br /><input type="number" min={0} step={0.05} value={prezzoUovo} onChange={e => setPrezzoUovo(Number(e.target.value))} style={inp} /></label>
        <button onClick={esporta} style={{ background: C.muted, color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700 }}>Esporta in Excel</button>
        <span style={{ color: C.muted }}>Totale: {formattaNumero(totKg, 0)} kg, {formattaEuro(totEuro)}</span>
      </div>
      {!nGalline && <div style={{ background: "#FFF4D6", border: `2px solid ${C.yellow}`, padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>⚠️ Indichi il numero medio di galline ovaiole presenti nei pollai: senza, il programma mostra solo quanti capi il mangime comprato può nutrire.</div>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 12.5, minWidth: 1150 }}>
          <thead><tr>{["Prodotto", "Per", "Dal", "Al", "Giorni", "Chilogrammi", "Euro", "Capi nutriti", "Chilogrammi necessari alle galline presenti", "Eccesso (kg) — per l'acquisto in corso: rimanenza stimata", "Uova prodotte (stima)", "Uova per pagare il mangime", "Costo del mangime per uovo"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{periodi.map((p, i) => (
            <tr key={i}>
              <td style={{ ...td, fontWeight: 700 }}>{p.prodotto}</td><td style={td}>{p.per}</td><td style={td}>{dataIt(p.dal)}</td><td style={td}>{p.inCorso ? <i>in corso</i> : dataIt(p.al)}</td>
              <td style={num}>{p.giorni}</td><td style={num}>{formattaNumero(p.kg, 0)}</td><td style={num}>{formattaEuro(p.euro)}</td>
              <td style={num}>{p.capi != null ? formattaNumero(p.capi, 0) : "—"}</td>
              <td style={num}>{p.necessari != null ? formattaNumero(p.necessari, 0) : "—"}</td>
              <td style={{ ...num, color: p.eccesso > 0 && !p.inCorso ? C.red : C.text, fontWeight: p.eccesso > 0 && !p.inCorso ? 700 : 400 }}>{p.eccesso != null ? (p.inCorso ? "rimanenza " : "") + formattaNumero(p.eccesso, 0) : "—"}</td>
              <td style={num}>{p.uovaProdotte != null ? formattaNumero(p.uovaProdotte, 0) : "—"}</td>
              <td style={num}>{p.uovaPerPagare != null ? formattaNumero(p.uovaPerPagare, 0) : "—"}</td>
              <td style={num}>{p.costoUovo != null ? formattaNumero(p.costoUovo, 3) + " €" : "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Il mangime per ovaiole si confronta con le galline presenti e con le uova; il Tuttopollaio va a polli e pollastre e mostra solo quanti capi può nutrire. Senza il numero di galline, le uova sono stimate sui capi che il mangime può nutrire. L'ultimo acquisto di ogni prodotto è «in corso»: il mangime non è ancora finito, quindi non si calcolano capi e uova, e la differenza è la rimanenza stimata a oggi.</div>
    </div>
  );
}
