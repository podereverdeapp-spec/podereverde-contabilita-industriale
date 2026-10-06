import { caricaIdGenitori } from "./genitori";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { costoAnimale, costoAcquistoUnitario, righePerSoggetto } from "./costoAnimale";
import { C } from "./style";
import { formattaEuro, formattaNumero, round2, fetchAllPages } from "./parsingUtils";
import GraficoDispersioneCostoKg from "./GraficoDispersioneCostoKg";

export default function GraficoMacellazioni() {
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);
  const [punti, setPunti] = useState([]);

  useEffect(() => { carica(); }, []);

  async function carica() {
    setCaricando(true);
    setErrore(null);
    try {
      const { data: animali, error: eAnimali } = await fetchAllPages((da, a) => supabase.from("animali")
        .select("id,bdn,nascita,data_uscita,peso_carcassa,riproduttore,provenienza,prezzo_acquisto")
        .eq("specie", "bovino").neq("stato", "attivo").not("peso_carcassa", "is", null).range(da, a));
      if (eAnimali) throw new Error(`Errore caricando gli animali: ${eAnimali.message}`);

      const { data: costi, error: eCosti } = await fetchAllPages((da, a) => supabase.from("ci_costo_animale_annuale")
        .select("animale_id,costo_mantenimento,costo_nascita_ereditato,quota_residuo_riproduttori").range(da, a));
      if (eCosti) throw new Error(`Errore caricando i costi: ${eCosti.message}`);

      // Costo dell'animale calcolato come in tutto il programma (costoAnimale.js): acquisto,
      // nascita, mantenimento, costo rimasto ricevuto. I riproduttori non sono animali da macello.
      const { perAnimale } = righePerSoggetto(costi);
      const genitori = await caricaIdGenitori(); // chi ha partorito o generato è un riproduttore

      const risultati = [];
      for (const a of (animali || [])) {
        if (a.riproduttore || genitori.has(a.id)) continue;
        const peso = parseFloat(a.peso_carcassa);
        if (!peso || peso <= 0 || !a.nascita || !a.data_uscita) continue;
        const etaMesi = round2((new Date(a.data_uscita) - new Date(a.nascita)) / (30.44 * 86400000));
        const costoCumulato = costoAnimale({ righe: perAnimale.get(a.id), costoAcquisto: costoAcquistoUnitario({ animale: a }) }).totale;
        if (costoCumulato <= 0) continue;
        risultati.push({ bdn: a.bdn, etaMesi, costoKg: round2(costoCumulato / peso) });
      }
      setPunti(risultati);
    } catch (err) {
      setErrore(err.message);
    }
    setCaricando(false);
  }

  // Finestra "ottimale": il 25° percentile di età fino al 75° percentile, e sotto la
  // mediana del costo/kg — approssima a occhio la fascia centrale a basso costo vista nel
  // grafico, senza doverla fissare a mano (si adatta da sola se i dati cambiano).
  function calcolaFinestraOttimale(pts) {
    if (pts.length < 4) return null;
    const eta = pts.map(p => p.etaMesi).sort((a, b) => a - b);
    const costi = pts.map(p => p.costoKg).sort((a, b) => a - b);
    const percentile = (arr, p) => arr[Math.floor(arr.length * p)];
    return {
      etaMin: percentile(eta, 0.20), etaMax: percentile(eta, 0.65),
      costoMax: percentile(costi, 0.45),
    };
  }
  const finestra = calcolaFinestraOttimale(punti);
  const dentroFinestra = finestra ? punti.filter(p => p.etaMesi >= finestra.etaMin && p.etaMesi <= finestra.etaMax && p.costoKg <= finestra.costoMax) : [];

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Grafico per le Macellazioni</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Ogni punto è un bovino uscito (macellato o venduto) — età alla macellazione/vendita in mesi, e il suo costo cumulato al kg di carcassa. L'area verde tratteggiata mostra la fascia d'età dove il costo/kg è tipicamente più basso, in base ai dati attuali.
      </p>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}

      {caricando ? <p style={{ color: C.muted }}>Caricamento...</p> : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          {finestra && (
            <GraficoDispersioneCostoKg punti={punti}
              etaMinOttimale={finestra.etaMin} etaMaxOttimale={finestra.etaMax} costoMaxOttimale={finestra.costoMax} />
          )}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}`, display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
            <div><strong>{punti.length}</strong> animali usciti con peso e costo noti</div>
            {finestra && (
              <div style={{ color: C.green, fontWeight: 700 }}>
                {dentroFinestra.length} nell'area macellazione (età {formattaNumero(finestra.etaMin, 0)}–{formattaNumero(finestra.etaMax, 0)} mesi, ≤{formattaEuro(finestra.costoMax, 0)}/kg)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
