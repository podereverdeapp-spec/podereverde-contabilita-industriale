import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro, formattaNumero, round2, fetchAllPages } from "./parsingUtils";
import { conteggioUnitaPerLotto, costoAcquistoUnitario, costoAnimale, righePerSoggetto , idGenitori, normalizzaAnimali } from "./costoAnimale";

// Prezzo di pareggio per specie e anno: quanto è costato in media un kg di carcassa degli
// animali da macello usciti nell'anno (= prezzo sotto il quale si perde), da cosa è fatto il
// costo, e quanto si guadagna o si perde al prezzo di vendita scelto. Usa lo stesso calcolo
// del costo di tutto il programma (costoAnimale.js).

const ETICHETTE_SPECIE = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };

export default function PrezzoPareggio() {
  const [anno, setAnno] = useState(new Date().getFullYear() - 1);
  const [dati, setDati] = useState(null);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState(null);
  const [prezzi, setPrezzi] = useState({});

  useEffect(() => { carica(); }, [anno]);

  async function carica() {
    setCaricando(true); setErrore(null);
    try {
      const inizio = `${anno}-01-01`, fine = `${anno}-12-31`;
      const [rA, rL, rU, rC, rV, rM] = await Promise.all([
        fetchAllPages((da, a) => supabase.from("animali").select("id,bdn,specie,riproduttore,provenienza,prezzo_acquisto,stato,data_uscita,peso_carcassa,madre_id,padre_id,nascita,data_ingresso,note").range(da, a)),
        fetchAllPages((da, a) => supabase.from("lotti_suini").select("id,tipo_provenienza,prezzo_acquisto,specie,madre_id,padre_id").range(da, a)),
        fetchAllPages((da, a) => supabase.from("suini_lotto").select("id,lotto_id,nr,stato,data_uscita,peso_carcassa,bdn,codice_completo").range(da, a)),
        fetchAllPages((da, a) => supabase.from("ci_costo_animale_annuale").select("animale_id,lotto_id,unita_nr,costo_mantenimento,costo_nascita_ereditato,quota_residuo_riproduttori").range(da, a)),
        fetchAllPages((da, a) => supabase.from("ci_dati_vendita_ingrasso").select("id,animale_id,lotto_id,unita_nr,prezzo_vendita_kg_reale").order("id").range(da, a)),
        fetchAllPages((da, a) => supabase.from("ci_costo_nascita_mandria").select("*").eq("anno", anno).order("id").range(da, a)),
      ]);
      for (const r of [rA, rL, rU, rC, rV]) if (r.error) throw new Error(r.error.message);
      const lotti = new Map((rL.data || []).map(l => [l.id, l]));
      const genitori = idGenitori(normalizzaAnimali(rA.data || [], rL.data || [], rU.data || []), rL.data); // chi ha partorito o generato è un riproduttore
      const unitaPerLotto = conteggioUnitaPerLotto(rU.data);
      const { perAnimale, perUnita } = righePerSoggetto(rC.data);
      const prezzoAnimale = new Map((rV.data || []).filter(v => v.animale_id).map(v => [v.animale_id, parseFloat(v.prezzo_vendita_kg_reale)]));
      const prezzoUnita = new Map((rV.data || []).filter(v => v.lotto_id).map(v => [`${v.lotto_id}|${v.unita_nr}`, parseFloat(v.prezzo_vendita_kg_reale)]));
      const nellAnno = d => d && d.slice(0, 10) >= inizio && d.slice(0, 10) <= fine;
      const venduto = s => s === "macellato" || s === "venduto";

      const capi = [];
      normalizzaAnimali(rA.data || [], rL.data || [], rU.data || []).forEach(a => {
        if (a.riproduttore || genitori.has(a.id) || !venduto(a.stato) || !nellAnno(a.data_uscita) || !(parseFloat(a.peso_carcassa) > 0)) return;
        capi.push({ specie: a.specie, codice: a.bdn || `scheda ${a.id}`, senzaCosti: !perAnimale.has(a.id), peso: parseFloat(a.peso_carcassa), prezzo: prezzoAnimale.get(a.id) || null,
          ...costoAnimale({ righe: perAnimale.get(a.id), costoAcquisto: costoAcquistoUnitario({ animale: a }) }) });
      });
      (rU.data || []).forEach(u => {
        if (!venduto(u.stato) || !nellAnno(u.data_uscita) || !(parseFloat(u.peso_carcassa) > 0)) return;
        const l = lotti.get(u.lotto_id);
        capi.push({ specie: l?.specie || "suino", codice: u.codice_completo || u.bdn || `suinetto ${u.nr} del lotto ${u.lotto_id}`, senzaCosti: !perUnita.has(`${u.lotto_id}|${u.nr}`), peso: parseFloat(u.peso_carcassa), prezzo: prezzoUnita.get(`${u.lotto_id}|${u.nr}`) || null,
          ...costoAnimale({ righe: perUnita.get(`${u.lotto_id}|${u.nr}`), costoAcquisto: costoAcquistoUnitario({ unita: u, lotto: l, numeroUnitaLotto: unitaPerLotto.get(u.lotto_id) }) }) });
      });

      const perSpecie = {};
      for (const s of Object.keys(ETICHETTE_SPECIE)) {
        // Versione 236 (anomalia 9, decisione del 07/10/2026 ore 21:32): i capi usciti senza costi salvati
        // restano fuori dal calcolo (costo e chili) e sono elencati in un avviso; prima entravano i loro
        // chili con costo zero e il prezzo di pareggio risultava più basso del vero.
        const tutti = capi.filter(x => x.specie === s);
        const senzaCosti = tutti.filter(x => x.senzaCosti).map(x => x.codice);
        const c = tutti.filter(x => !x.senzaCosti);
        if (!c.length) { if (senzaCosti.length) perSpecie[s] = { capi: 0, senzaCosti }; continue; }
        const somma = k => round2(c.reduce((t, x) => t + (x[k] || 0), 0));
        const conPrezzo = c.filter(x => x.prezzo > 0);
        perSpecie[s] = {
          capi: c.length, kg: somma("peso"), costo: somma("totale"),
          acquisto: somma("costoAcquisto"), nascita: somma("costoNascita"), mantenimento: somma("mantenimento"), rimasto: somma("costoRimastoRicevuto"),
          prezzoMedioRegistrato: conPrezzo.length ? round2(conPrezzo.reduce((t, x) => t + x.prezzo * x.peso, 0) / conPrezzo.reduce((t, x) => t + x.peso, 0)) : null,
          capiConPrezzo: conPrezzo.length,
          mandria: (rM.data || []).find(m => m.specie === s) || null,
          senzaCosti,
        };
      }
      setDati(perSpecie);
      // Versione 236 (anomalia 9 punto 2, decisione del 07/10/2026 ore 21:35): in «prezzi» ci sono solo i
      // prezzi SCRITTI a mano, che restano cambiando anno; altrimenti la casella mostra il prezzo registrato
      // dell'anno guardato (prima restava quello dell'anno visto prima).
    } catch (err) {
      setErrore(err.message);
    }
    setCaricando(false);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Prezzo di Pareggio</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 16 }}>
        Per ogni specie, gli animali da macello usciti nell'anno (macellati o venduti, con il peso della carcassa): quanto è costato in media un kg di carcassa — il prezzo sotto il quale si perde — da cosa è fatto il costo e cosa succede al prezzo di vendita scritto qui sotto.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <label style={{ fontSize: 13, color: C.muted }}>Anno:</label>
        <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value) || anno)}
          style={{ width: 100, padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
        {caricando && <span style={{ color: C.muted, fontSize: 13 }}>Calcolo...</span>}
      </div>
      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}
      {dati && Object.keys(dati).length === 0 && <p style={{ color: C.muted }}>Nessun animale da macello uscito nel {anno} con il peso della carcassa.</p>}
      {dati && Object.entries(dati).map(([s, d]) => (
        <SchedaSpecie key={s} specie={s} d={d} anno={anno}
          prezzo={prezzi[s] !== undefined ? prezzi[s] : (d.prezzoMedioRegistrato != null ? String(d.prezzoMedioRegistrato) : "")}
          scrittoAMano={prezzi[s] !== undefined}
          onPrezzo={v => setPrezzi(p => ({ ...p, [s]: v }))}
          onRegistrato={() => setPrezzi(p => { const n = { ...p }; delete n[s]; return n; })} />
      ))}
    </div>
  );
}

function SchedaSpecie({ specie, d, prezzo, onPrezzo, anno, scrittoAMano, onRegistrato }) {
  const avvisoSenzaCosti = d.senzaCosti?.length > 0 && (
    <div style={{ background: "#FFF6E5", border: "1px solid #F0B44C", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>
      ⚠️ <strong>{d.senzaCosti.length} {d.senzaCosti.length === 1 ? "capo uscito" : "capi usciti"} senza costi salvati</strong>, {d.senzaCosti.length === 1 ? "escluso" : "esclusi"} dal calcolo: salvare il Report Costi del loro anno (e poi rifare il Report Riproduttori). {d.senzaCosti.join(", ")}.
    </div>
  );
  if (!d.capi) return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: C.primary, marginBottom: 8 }}>{ETICHETTE_SPECIE[specie]} — nessun capo calcolabile nel {anno}</div>
      {avvisoSenzaCosti}
    </div>
  );
  const pareggio = d.kg > 0 ? round2(d.costo / d.kg) : null;
  const costoCapo = round2(d.costo / d.capi), pesoMedio = round2(d.kg / d.capi);
  const p = parseFloat(String(prezzo).replace(",", "."));
  const haPrezzo = p > 0;
  const ricavo = haPrezzo ? round2(d.kg * p) : null;
  const risultato = haPrezzo ? round2(ricavo - d.costo) : null;
  // calcolati sui valori non arrotondati, così «per capo» e «da togliere» coincidono al centesimo
  const costoMassimoCapo = haPrezzo ? round2(p * d.kg / d.capi) : null;
  const differenzaCapo = haPrezzo ? round2(d.costo / d.capi - p * d.kg / d.capi) : null;
  // Fertilità: quanti nati sarebbero serviti perché il costo di nascita scendesse della differenza
  const m = d.mandria;
  const costoNascitaMedio = d.capi ? round2(d.nascita / d.capi) : 0;
  let natiNecessari = null;
  if (m && haPrezzo && differenzaCapo > 0 && parseFloat(m.costo_nascita_per_nato) > differenzaCapo) {
    natiNecessari = Math.ceil((parseFloat(m.costo_mandria) + parseFloat(m.riporto_anno_precedente || 0)) / (parseFloat(m.costo_nascita_per_nato) - differenzaCapo));
  }
  const voce = (etichetta, valore) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
      <span>{etichetta}</span><span style={{ fontWeight: 700 }}>{valore}</span>
    </div>
  );
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>
      {avvisoSenzaCosti}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.primary }}>{ETICHETTE_SPECIE[specie]} — {d.capi} capi usciti nel {anno}</div>
        <div style={{ fontSize: 14 }}>Prezzo di pareggio: <span style={{ fontSize: 22, fontWeight: 800, color: C.red }}>{pareggio != null ? `${formattaEuro(pareggio)} al kg` : "—"}</span> di carcassa</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginTop: 12 }}>
        <div>
          <div style={titolo}>DA COSA È FATTO IL COSTO (MEDIA PER CAPO)</div>
          {d.acquisto > 0 && voce("Acquisto", formattaEuro(round2(d.acquisto / d.capi)))}
          {voce("Nascita (dalla mandria)", formattaEuro(costoNascitaMedio))}
          {voce("Mantenimento", formattaEuro(round2(d.mantenimento / d.capi)))}
          {d.rimasto > 0 && voce("Costo rimasto di riproduttori usciti", formattaEuro(round2(d.rimasto / d.capi)))}
          {voce("Costo per capo", formattaEuro(costoCapo))}
          {voce("Peso medio della carcassa", `${formattaNumero(pesoMedio, 1)} kg`)}
          {voce("Costo totale dei capi usciti", formattaEuro(d.costo))}
          {voce("Kg di carcassa venduti", formattaNumero(d.kg, 0))}
        </div>
        <div>
          <div style={titolo}>AL PREZZO DI VENDITA</div>
          <label style={{ fontSize: 12, color: C.muted }}>Prezzo di vendita (€ al kg di carcassa)
            <input type="text" inputMode="decimal" value={prezzo} onChange={e => onPrezzo(e.target.value)}
              style={{ display: "block", width: 120, padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${scrittoAMano ? C.blue : C.primary}`, fontSize: 14, marginTop: 3, marginBottom: 6 }} />
          </label>
          {scrittoAMano && <button onClick={onRegistrato} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 6 }}>Torna al prezzo registrato</button>}
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
            {d.prezzoMedioRegistrato != null ? `Prezzo medio registrato nelle schede: ${formattaEuro(d.prezzoMedioRegistrato)} al kg (${d.capiConPrezzo} capi).` : "Nessun prezzo di vendita registrato nelle schede: scriverlo qui."}
          </div>
          {haPrezzo ? (
            <>
              {voce("Ricavo", formattaEuro(ricavo))}
              {voce(risultato >= 0 ? "Guadagno" : "Perdita", <span style={{ color: risultato >= 0 ? C.green : C.red }}>{formattaEuro(Math.abs(risultato))}</span>)}
              {voce("Per capo", <span style={{ color: risultato >= 0 ? C.green : C.red }}>{formattaEuro(round2(risultato / d.capi))}</span>)}
              {voce("Costo massimo per capo per andare in pari", formattaEuro(costoMassimoCapo))}
              {differenzaCapo > 0 && voce("Costo per capo da togliere", <span style={{ color: C.red }}>{formattaEuro(differenzaCapo)}</span>)}
            </>
          ) : <p style={{ fontSize: 13, color: C.muted }}>Scrivere un prezzo per vedere ricavo e risultato.</p>}
        </div>
      </div>
      {haPrezzo && differenzaCapo > 0 && m && (
        <div style={{ marginTop: 14, background: C.bg, borderRadius: 8, padding: "10px 14px", fontSize: 13, lineHeight: 1.6 }}>
          <strong>Fertilità della mandria nel {anno}:</strong> {m.riproduttori_in_carriera} riproduttori in carriera, {m.riproduttori_senza_figli} senza figli, {m.nati} nati, costo di nascita di ogni nato {formattaEuro(parseFloat(m.costo_nascita_per_nato))}.{" "}
          {natiNecessari != null
            ? <>Per togliere {formattaEuro(differenzaCapo)} a capo solo con la fertilità sarebbero serviti <strong>{natiNecessari} nati</strong> invece di {m.nati}, a parità di costo della mandria.</>
            : <>Anche con il costo di nascita a zero non si andrebbe in pari: servono anche meno costo di mantenimento, più peso o un prezzo più alto.</>}
        </div>
      )}
    </div>
  );
}

const titolo = { fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 };
