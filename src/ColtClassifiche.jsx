import { useState, useEffect, useMemo } from "react";
import { C } from "./style";
import { supabase } from "./supabase";
import { fetchAllPages, formattaEuro } from "./parsingUtils";
import { esportaExcel, numeroExcel } from "./esportaExcel";

// Coltivazioni → Campi e Stagioni → Classifiche dei Campi
// Sola lettura. Le tre classifiche dello «Storico» dell'app Podere Verde (coltivazione_storico.jsx),
// con lo STESSO metodo, così i risultati coincidono con quelli dell'app:
//  - il costo di ogni coltura si divide fra i suoi prodotti in proporzione al valore di mercato;
//    balloni e rotoballe pesano peso_ballone_kg (340);
//  - non contano le colture senza costi e i prodotti senza prezzo di mercato;
//  - il sorgo dopo il pascolo è seconda coltura; i pascoli sono esclusi dalle classifiche.

const COL_COLTURA = { "Erba medica": "#C6E0B4", "Erbaio misto": "#E2EFDA", "Orzo": "#F8CBAD", "Avena": "#FFE699",
  "Trifoglio": "#F4B6C2", "Sulla": "#D9C3E9", "Favino": "#D6B99A", "Pascolo erbaio": "#DDEBF7", "Sorgo": "#EDEDED" };
const PRINCIPALE = { "Orzo": ["Granella di orzo"], "Erba medica": ["Fieno di erba medica"], "Erbaio misto": ["Fieno misto"],
  "Avena": ["Semente di avena", "Granella di avena"], "Trifoglio": ["Fieno di trifoglio"], "Sulla": ["Fieno di sulla", "Semente di sulla"],
  "Favino": ["Granella di favino"] };
const COLTURE_ORDINE = ["Erba medica", "Erbaio misto", "Orzo", "Trifoglio", "Avena", "Favino", "Sulla"];
// colture nuove registrate nell'app: colore di riserva, sempre lo stesso per la stessa coltura
const RISERVA = ["#D0E4F5", "#FCE4D6", "#E4DFEC", "#FFF2CC", "#DDEBDD", "#F2DCDB", "#E7E6E6"];
const coloreColtura = (k, tutte) => COL_COLTURA[k] || RISERVA[Math.max(0, tutte.indexOf(k)) % RISERVA.length];

const normColtura = s => { if (!s) return s; const t = s.trim().toLowerCase(); if (t.startsWith("sorgo")) return "Sorgo"; return t.charAt(0).toUpperCase() + t.slice(1); };
const nomeCampo = s => (s || "").split(" — ")[0];
const n0 = v => Math.round(v).toLocaleString("it-IT");
const n1 = v => Number(v).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const perUnita = u => (u === "balloni" ? "a ballone" : u === "rotoballe" ? "a rotoballa" : "al quintale");
const gradazione = (i, n) => {
  const t = n <= 1 ? 0 : i / (n - 1);
  const S = [[0, [0x57, 0xBB, 0x8A]], [0.5, [0xFF, 0xD6, 0x66]], [1, [0xE6, 0x7C, 0x73]]];
  for (let k = 0; k < S.length - 1; k++) { const [t0, c0] = S[k], [t1, c1] = S[k + 1];
    if (t <= t1) { const f = (t - t0) / (t1 - t0 || 1); return "rgb(" + c0.map((c, m) => Math.round(c + (c1[m] - c) * f)).join(",") + ")"; } }
  return "rgb(230,124,115)";
};
const campagnaMenoTre = cp => { const a = Number((cp || "2023/2024").slice(0, 4)) - 2; return `${a}/${a + 1}`; };

// --- modello, identico all'app ---------------------------------------------
function costruisci(righe, parametri) {
  const peso = {}; (parametri || []).forEach(p => { peso[p.campagna] = Number(p.peso_ballone_kg || 340); });
  const cc = {};
  righe.forEach(r => {
    if (!cc[r.coltura_campo_id]) cc[r.coltura_campo_id] = {
      id: r.coltura_campo_id, campagna: r.campagna, n: r.campo_numero, campo: nomeCampo(r.campo), ordine: r.ordine,
      coltura: normColtura(r.coltura), ettari: Number(r.ettari || 0), totale: Number(r.costo_totale || 0), prodotti: [] };
    if (r.prodotto && Number(r.quantita) > 0 && r.prezzo_q != null && Number(r.prezzo_q) > 0) {
      const kg = peso[r.campagna] || 340, balla = r.unita === "balloni" || r.unita === "rotoballe";
      const pu = balla ? Number(r.prezzo_q) * kg / 100 : Number(r.prezzo_q);
      const qq = balla ? Number(r.quantita) * kg / 100 : Number(r.quantita);
      cc[r.coltura_campo_id].prodotti.push({ prodotto: r.prodotto, unita: r.unita, q: Number(r.quantita), qq, pu, valore: Number(r.quantita) * pu });
    }
  });
  const colture = Object.values(cc).filter(c => c.totale > 0);
  colture.forEach(c => {
    const v = c.prodotti.reduce((s, p) => s + p.valore, 0);
    c.prodotti.forEach(p => { p.costo = v ? c.totale * p.valore / v : 0; p.cu = p.costo / p.q; });
  });
  const caricate = [...new Set(colture.map(c => c.campagna))].sort();
  const campi = {};
  [...colture].sort((a, b) => (a.campagna < b.campagna ? -1 : 1)).forEach(c => { campi[c.n] = c.campo; });
  const ultima = caricate[caricate.length - 1];
  const attivi = Object.keys(campi).map(Number).filter(n => colture.some(c => c.n === n && c.campagna >= campagnaMenoTre(ultima))).sort((a, b) => a - b);
  const tutte = [];
  if (caricate.length) { const a0 = Number(caricate[0].slice(0, 4)), a1 = Number(ultima.slice(0, 4)); for (let a = a1; a >= a0; a--) tutte.push(`${a}/${a + 1}`); }
  // prodotto principale: quello dell'app per le colture note; per le colture nuove
  // il prodotto con il valore di mercato più alto, ricavato dai dati (così compaiono da sole)
  const principale = { ...PRINCIPALE };
  const valorePerProdotto = {};
  colture.forEach(c => c.prodotti.forEach(p => { const m = (valorePerProdotto[c.coltura] ||= {}); m[p.prodotto] = (m[p.prodotto] || 0) + p.valore; }));
  Object.entries(valorePerProdotto).forEach(([k, m]) => {
    if (principale[k]) return;
    const pr = Object.entries(m).filter(([n]) => !/^paglia/i.test(n)).sort((a, b) => b[1] - a[1])[0] || Object.entries(m).sort((a, b) => b[1] - a[1])[0];
    if (pr) principale[k] = [pr[0]];
  });
  const altre = Object.keys(principale).filter(k => !COLTURE_ORDINE.includes(k) && colture.some(c => c.coltura === k)).sort();
  const ordine = [...COLTURE_ORDINE, ...altre];
  return { colture, caricate, stagioni: tutte, campi, attivi, principale, ordine };
}

function rankingStagione(d, cp) {
  const out = [];
  [...new Set(d.colture.filter(c => c.campagna === cp).map(c => c.n))].forEach(n => {
    const cs = d.colture.filter(c => c.campagna === cp && c.n === n && d.principale[c.coltura]);
    const ps = cs.flatMap(c => c.prodotti.map(p => ({ ...p, coltura: c.coltura })));
    const val = ps.reduce((s, p) => s + p.valore, 0); if (!cs.length || !val) return;
    const cl = [...new Set(cs.map(c => c.coltura))];
    let mp = ps.filter(p => p.coltura === cl[0] && d.principale[cl[0]].includes(p.prodotto));
    if (!mp.length) mp = [...ps].sort((a, b) => b.valore - a.valore).slice(0, 1);
    mp = mp.filter(p => p.prodotto === mp[0].prodotto && p.unita === mp[0].unita);
    const q = mp.reduce((s, p) => s + p.q, 0);
    out.push({ n, colture: cl, rapporto: ps.reduce((s, p) => s + p.costo, 0) / val, costo: ps.reduce((s, p) => s + p.costo, 0), valore: val,
      prodotto: mp[0].prodotto, unita: mp[0].unita, cu: mp.reduce((s, p) => s + p.costo, 0) / q, pm: mp.reduce((s, p) => s + p.valore, 0) / q });
  });
  return out.sort((a, b) => a.rapporto - b.rapporto);
}

function righeResa(colture, principale) {
  const R = [];
  colture.forEach(c => {
    const pn = principale[c.coltura]; if (!pn) return;
    let mp = c.prodotti.filter(p => pn.includes(p.prodotto));
    if (c.coltura === "Sulla") mp = mp.filter(p => p.prodotto === "Fieno di sulla");
    if (!mp.length || !c.ettari) return;
    R.push({ campagna: c.campagna, n: c.n, coltura: c.coltura, ha: c.ettari, resa: mp.reduce((s, p) => s + p.qq, 0) / c.ettari });
  });
  const M = {};
  R.forEach(x => { const k = x.campagna + "|" + x.coltura; const m = M[k] || (M[k] = { h: 0, s: 0, n: 0 }); m.h += x.ha; m.s += x.resa * x.ha; m.n++; });
  R.forEach(x => {
    let m = M[x.campagna + "|" + x.coltura];
    x.solo = m.n === 1; x.rif = null;
    if (x.coltura === "Sulla" && M[x.campagna + "|Erba medica"]) { m = M[x.campagna + "|Erba medica"]; x.solo = false; x.rif = "medica"; }
    x.media = m.s / m.h; x.indice = 100 * x.resa / x.media;
  });
  return R;
}
function rankingResa(d) {
  const R = righeResa(d.colture, d.principale).filter(x => !x.solo);
  return d.attivi.map(n => {
    const xs = R.filter(x => x.n === n); if (!xs.length) return null;
    const h = xs.reduce((s, x) => s + x.ha, 0);
    const per = {};
    d.stagioni.forEach(cp => { const ys = xs.filter(x => x.campagna === cp);
      if (ys.length) per[cp] = { i: ys.reduce((s, x) => s + x.indice * x.ha, 0) / ys.reduce((s, x) => s + x.ha, 0), c: [...new Set(ys.map(y => y.coltura))], resa: ys.reduce((s, x) => s + x.resa * x.ha, 0) / ys.reduce((s, x) => s + x.ha, 0) }; });
    return { n, indice: xs.reduce((s, x) => s + x.indice * x.ha, 0) / h, per, na: Object.keys(per).length, sopra: Object.values(per).filter(v => v.i > 100).length };
  }).filter(Boolean).sort((a, b) => b.indice - a.indice);
}
function rankingColtura(d, col) {
  const cs = d.colture.filter(c => c.coltura === col && c.prodotti.length);
  const out = [];
  [...new Set(cs.map(c => c.n))].forEach(n => {
    const xs = cs.filter(c => c.n === n), ps = xs.flatMap(c => c.prodotti);
    const val = ps.reduce((s, p) => s + p.valore, 0); if (!val) return;
    const mp = ps.filter(p => (d.principale[col] || []).includes(p.prodotto)), qq = mp.reduce((s, p) => s + p.qq, 0);
    out.push({ n, rapporto: ps.reduce((s, p) => s + p.costo, 0) / val, cu: qq ? mp.reduce((s, p) => s + p.costo, 0) / qq : null,
      pm: qq ? mp.reduce((s, p) => s + p.valore, 0) / qq : null, stagioni: [...new Set(xs.map(c => c.campagna))].sort() });
  });
  return out.sort((a, b) => a.rapporto - b.rapporto);
}

// --- interfaccia ---------------------------------------------------------------
const Chips = ({ voci, valore, onScegli, colori }) => (
  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
    {voci.map(v => (
      <button key={v} onClick={() => onScegli(v)}
        style={{ background: valore === v ? C.primary : (colori?.[v] || "#fff"), color: valore === v ? "#fff" : C.text,
          border: `1.5px solid ${valore === v ? C.primary : C.border}`, borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 600 }}>{v}</button>
    ))}
  </div>
);
const Nota = ({ children }) => (
  <div style={{ margin: "0 0 12px", padding: "8px 12px", borderRadius: 8, background: C.blue + "14", borderLeft: `4px solid ${C.blue}`, fontSize: 12.5, lineHeight: 1.45 }}>{children}</div>
);
// barra orizzontale: posizione, campo, colture, rapporto costo / mercato
function Riga({ pos, n, nome, sotto, colore, grigio, box, boxColore, destra }) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 6 }}>
      <div style={{ width: 48, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: C.primary, background: "#FAF7F2" }}>{pos}°</div>
      <div style={{ flex: 1, padding: "8px 12px", background: colore || "#EEE" }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: grigio ? "#666" : C.text }}>{n} — {nome}</div>
        <div style={{ fontSize: 12, color: C.text }}>{sotto}</div>
      </div>
      {box}
      <div style={{ width: 130, padding: "6px 10px", display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "right", background: boxColore }}>{destra}</div>
    </div>
  );
}

export default function ColtClassifiche() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [vista, setVista] = useState("stagione");
  const [cp, setCp] = useState(null);
  const [col, setCol] = useState(null);

  useEffect(() => {
    (async () => {
      const [r, p] = await Promise.all([
        fetchAllPages((da, a) => supabase.from("v_coltivazione_report_prodotti").select("*").range(da, a)),
        supabase.from("coltivazione_parametri").select("campagna,peso_ballone_kg"),
      ]);
      if (r.error || p.error) { setErrore((r.error || p.error).message); return; }
      const d = costruisci(r.data || [], p.data || []);
      setDati(d); setCp(d.caricate[d.caricate.length - 1]);
      setCol(d.ordine.find(k => d.colture.some(c => c.coltura === k && c.prodotti.length)));
    })();
  }, []);

  const lista = useMemo(() => {
    if (!dati) return [];
    if (vista === "stagione") return rankingStagione(dati, cp);
    if (vista === "resa") return rankingResa(dati);
    return rankingColtura(dati, col);
  }, [dati, vista, cp, col]);

  if (errore) return <div style={{ padding: 20, color: C.red }}>⚠️ {errore}</div>;
  if (!dati) return <div style={{ padding: 20, color: C.muted }}>Preparazione delle classifiche...</div>;

  const presenti = dati.ordine.filter(k => dati.colture.some(c => c.coltura === k && c.prodotti.length));
  const breve = s => s.slice(2, 4) + "/" + s.slice(7, 9);

  function esporta() {
    const fogli = [];
    dati.caricate.slice().reverse().forEach(s => fogli.push({ nome: `STAGIONE ${s.replace("/", "-")}`, righe: rankingStagione(dati, s).map((x, i) => ({
      "Posizione": i + 1, "Numero del campo": x.n, "Campo": dati.campi[x.n], "Colture": x.colture.join(" + "),
      "Costo attribuito ai prodotti in euro": numeroExcel(x.costo), "Valore di mercato dei prodotti in euro": numeroExcel(x.valore),
      "Costo per ogni euro di valore di mercato": Math.round(x.rapporto * 1000) / 1000,
      "Prodotto principale": x.prodotto, "Unità": x.unita, "Costo per unità in euro": numeroExcel(x.cu), "Mercato per unità in euro": numeroExcel(x.pm) })) }));
    fogli.push({ nome: "RESA", righe: rankingResa(dati).map((x, i) => ({
      "Posizione": i + 1, "Numero del campo": x.n, "Campo": dati.campi[x.n], "Indice di resa (100 = media dell'azienda)": Math.round(x.indice),
      "Stagioni sopra la media": x.sopra, "Stagioni confrontate": x.na,
      ...Object.fromEntries(dati.stagioni.slice().reverse().map(s => [`Indice ${s}`, x.per[s] ? Math.round(x.per[s].i) : null])) })) });
    presenti.forEach(k => fogli.push({ nome: `COLTURA ${k}`.slice(0, 31), righe: rankingColtura(dati, k).map((x, i) => ({
      "Posizione": i + 1, "Numero del campo": x.n, "Campo": dati.campi[x.n], "Stagioni": x.stagioni.join(", "),
      "Costo per ogni euro di valore di mercato": Math.round(x.rapporto * 1000) / 1000,
      "Costo al quintale del prodotto principale in euro": numeroExcel(x.cu), "Mercato al quintale in euro": numeroExcel(x.pm) })) }));
    esportaExcel("Classifiche_dei_Campi", fogli);
  }

  const VISTE = [["stagione", "🏅 Classifica della stagione"], ["resa", "🏆 Classifica per resa"], ["coltura", "🥇 Classifica per coltura"]];

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Classifiche dei Campi</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
        Le classifiche dello Storico dell'app Podere Verde, con lo stesso metodo e gli stessi dati: i risultati coincidono con quelli dell'app. Si aggiornano da sole.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {VISTE.map(([id, l]) => (
          <button key={id} onClick={() => setVista(id)}
            style={{ background: vista === id ? C.accent : "#fff", color: vista === id ? "#fff" : C.text, border: `1.5px solid ${vista === id ? C.accent : C.border}`,
              borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700 }}>{l}</button>
        ))}
        <button onClick={esporta} style={{ marginLeft: "auto", height: 38, padding: "0 16px", border: "none", borderRadius: 8, background: C.primary, color: "#fff", fontSize: 13, fontWeight: 700 }}>Esporta Excel</button>
      </div>

      {vista === "stagione" && <>
        <Nota><b>Classifica della stagione</b> · I campi dal migliore al peggiore per costo del raccolto rapportato al suo valore di mercato (i prodotti sono diversi, così si confrontano). Il colore del campo è la coltura; la casella del costo va dal verde al rosso; numero rosso = sopra il mercato. Costo e mercato sono del prodotto principale; la posizione tiene conto di tutti i prodotti del campo, paglia e seme compresi. Esclusi i pascoli.</Nota>
        <Chips voci={dati.caricate.slice().reverse()} valore={cp} onScegli={setCp} />
        {lista.map((x, i) => (
          <Riga key={x.n} pos={i + 1} n={x.n} nome={dati.campi[x.n]} sotto={x.colture.join(" + ").toLowerCase()} colore={coloreColtura(x.colture[0], dati.ordine)} grigio={!dati.attivi.includes(x.n)}
            box={<div style={{ width: 150, padding: "6px 8px", textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", borderLeft: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10.5, color: C.muted }}>costo per 1 € di mercato</div><div style={{ fontSize: 14, fontWeight: 800 }}>{x.rapporto.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div></div>}
            boxColore={gradazione(i, lista.length)}
            destra={<><div style={{ fontSize: 13.5, fontWeight: 800, color: x.cu > x.pm ? "#9C0006" : "#10381F" }}>{formattaEuro(x.cu)}</div>
              <div style={{ fontSize: 10.5 }}>{perUnita(x.unita)} · mercato {formattaEuro(x.pm)}</div></>} />
        ))}
      </>}

      {vista === "resa" && <>
        <Nota><b>Classifica per resa</b> · I campi coltivati negli ultimi tre anni, su tutte le stagioni. Ogni campo è confrontato con gli altri della stessa coltura nella stessa stagione: 100 = media dell'azienda, 150 = una volta e mezza. La sulla, unica, è confrontata con la medica. Non contano le stagioni in cui un campo era l'unico con la sua coltura.</Nota>
        {lista.map((x, i) => (
          <div key={x.n} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.primary, width: 34 }}>{i + 1}°</div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{x.n} — {dati.campi[x.n]}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{x.sopra} {x.sopra === 1 ? "stagione" : "stagioni"} sopra la media su {x.na}</div></div>
              <div style={{ background: gradazione(i, lista.length), borderRadius: 10, padding: "6px 12px", fontWeight: 800, fontSize: 17, minWidth: 56, textAlign: "center" }}>{n0(x.indice)}</div>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8, paddingLeft: 46 }}>
              {dati.stagioni.slice().reverse().filter(s => x.per[s]).map(s => (
                <div key={s} style={{ background: coloreColtura(x.per[s].c[0], dati.ordine), borderRadius: 8, padding: "3px 9px", textAlign: "center" }}>
                  <div style={{ fontSize: 10.5 }}>{s}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: x.per[s].i >= 100 ? C.green : C.red }}>{n0(x.per[s].i)}</div>
                  <div style={{ fontSize: 10 }}>{x.per[s].c.join(" + ").toLowerCase()}{x.per[s].c.includes("Sulla") ? " (contro la medica)" : ""} · {n1(x.per[s].resa)} q/ha</div>
                </div>))}
            </div>
          </div>
        ))}
      </>}

      {vista === "coltura" && <>
        <Nota><b>Classifica per coltura</b> · Scegliere una coltura: i campi che l'hanno avuta, dal migliore al peggiore, sommando tutte le stagioni. Conta quanto è costato il raccolto rispetto al suo valore di mercato; costo e mercato sono al quintale del prodotto principale. Numero rosso = sopra il mercato. I campi in grigio non sono più coltivati. Esclusi i pascoli.</Nota>
        <Chips voci={presenti} valore={col} onScegli={setCol} colori={Object.fromEntries(presenti.map(k => [k, coloreColtura(k, dati.ordine)]))} />
        {lista.map((x, i) => (
          <Riga key={x.n} pos={i + 1} n={x.n} nome={dati.campi[x.n]} colore={coloreColtura(col, dati.ordine)} grigio={!dati.attivi.includes(x.n)}
            sotto={`${x.stagioni.length === 1 ? "1 stagione" : x.stagioni.length + " stagioni"}: ${x.stagioni.map(breve).join(" · ")}`}
            boxColore={gradazione(i, lista.length)}
            destra={<><div style={{ fontSize: 13.5, fontWeight: 800, color: x.cu != null && x.cu > x.pm ? "#9C0006" : "#10381F" }}>{x.cu != null ? formattaEuro(x.cu) : "—"}</div>
              <div style={{ fontSize: 10.5 }}>al quintale · mercato {x.pm != null ? formattaEuro(x.pm) : "—"}</div></>} />
        ))}
        {lista.length === 1 && <div style={{ fontSize: 12, color: C.muted }}>Un solo campo ha avuto questa coltura: non c'è confronto.</div>}
      </>}
    </div>
  );
}
