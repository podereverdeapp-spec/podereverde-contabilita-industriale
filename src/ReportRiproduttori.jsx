import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { numerizzaCampi, round2 } from "./parsingUtils";
import { calcolaResiduoIniziale, calcolaPianoScarico, calcolaValoreRealizzoStimato } from "./motoreRiproduttori";

export default function ReportRiproduttori() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [elaborando, setElaborando] = useState(false);
  const [riproduttori, setRiproduttori] = useState(null);
  const [parametri, setParametri] = useState(null);

  useEffect(() => { caricaElenco(); }, []);

  async function caricaElenco() {
    const { data } = await supabase.from("ci_residuo_riproduttore").select("*, animali(bdn, nome, specie, stato)").order("updated_at", { ascending: false });
    setRiproduttori(numerizzaCampi(data || [], ["costo_acquisto", "costi_crescita_preriproduttiva", "valore_realizzo_stimato", "residuo_totale", "residuo_rimanente", "conto_sospeso"]));
  }

  async function caricaParametri() {
    const { data } = await supabase.from("ci_parametri").select("chiave, valore");
    const mappa = {};
    (data || []).forEach(p => { mappa[p.chiave] = parseFloat(p.valore); });
    return mappa;
  }

  async function elabora() {
    setElaborando(true);
    try {
      const parametriMap = await caricaParametri();
      setParametri(parametriMap);

      const { data: tuttiAnimali, error: eA } = await supabase
        .from("animali").select("id,bdn,nome,specie,razza,razza_calcolata,riproduttore,costo_iniziale,padre_id,madre_id,nascita,stato,data_uscita,peso_vivo_uscita,peso_carcassa");
      if (eA) throw new Error(eA.message);

      const { data: prezziRiforma } = await supabase.from("prezzi_riforma").select("*");
      const etaMinimaAnni = parametriMap.eta_minima_calcolo_peso_storico || 3;

      const riproduttoriAttivi = (tuttiAnimali || []).filter(a => a.riproduttore);
      if (riproduttoriAttivi.length === 0) {
        alert("Nessun animale marcato come riproduttore in anagrafica.");
        setElaborando(false);
        return;
      }

      let elaborati = 0, figliAggiornati = 0;

      for (const rip of riproduttoriAttivi) {
        // Figli di questo riproduttore (come padre o madre), con anno di nascita
        const figli = (tuttiAnimali || []).filter(a => a.padre_id === rip.id || a.madre_id === rip.id);
        const figliDellAnno = figli.filter(f => f.nascita && new Date(f.nascita).getFullYear() === anno);
        const primoAnnoRiproduzione = figli.length > 0
          ? Math.min(...figli.filter(f => f.nascita).map(f => new Date(f.nascita).getFullYear()))
          : anno;

        // Costi di crescita pre-riproduttiva: somma costo_mantenimento negli anni prima del primo figlio
        const { data: costiPreRiprod } = await supabase
          .from("ci_costo_animale_annuale").select("costo_mantenimento, anno")
          .eq("animale_id", rip.id).lt("anno", primoAnnoRiproduzione);
        const costiCrescita = (numerizzaCampi(costiPreRiprod || [], ["costo_mantenimento"])).reduce((s, r) => s + (r.costo_mantenimento || 0), 0);

        // Trovo o creo il record di residuo per questo riproduttore
        const { data: esistente } = await supabase.from("ci_residuo_riproduttore").select("*").eq("animale_id", rip.id).maybeSingle();

        let residuoRecord = esistente ? numerizzaCampi([esistente], ["costo_acquisto", "costi_crescita_preriproduttiva", "valore_realizzo_stimato", "residuo_totale", "residuo_rimanente", "conto_sospeso"])[0] : null;

        if (!residuoRecord) {
          const razzaRip = rip.razza_calcolata || rip.razza;
          const realizzo = calcolaValoreRealizzoStimato({
            specie: rip.specie, razza: razzaRip, animaliUsciti: tuttiAnimali || [],
            prezziRiforma: prezziRiforma || [], etaMinimaAnni,
          });
          // Uso la valutazione "vivo" come stima prudenziale di default (di norma la più bassa
          // delle due) — quando il riproduttore uscirà davvero, si userà il valore reale.
          const valoreRealizzoStimato = Math.min(
            realizzo.valutazioneVivo || Infinity,
            realizzo.valutazioneCarcassa || Infinity
          );
          const valoreRealizzoFinale = Number.isFinite(valoreRealizzoStimato) ? valoreRealizzoStimato : 0;

          const residuoTotale = calcolaResiduoIniziale({
            costoAcquisto: rip.costo_iniziale || 0,
            costiCrescitaPreRiproduttiva: costiCrescita,
            valoreRealizzoStimato: valoreRealizzoFinale,
          });
          const chiaveVita = `vita_produttiva_attesa_${rip.specie === "bovino" ? "bovini" : rip.specie === "suino" ? "suini" : "ovini"}`;
          const vitaAttesa = parametriMap[chiaveVita] || 5;

          const { data: nuovo, error: eIns } = await supabase.from("ci_residuo_riproduttore").insert([{
            animale_id: rip.id, specie: rip.specie, costo_acquisto: rip.costo_iniziale || 0,
            costi_crescita_preriproduttiva: costiCrescita, valore_realizzo_stimato: valoreRealizzoFinale,
            residuo_totale: residuoTotale, residuo_rimanente: residuoTotale,
            vita_produttiva_attesa_anni: vitaAttesa, anno_inizio_riproduzione: primoAnnoRiproduzione, conto_sospeso: 0,
          }]).select().single();
          if (eIns) throw new Error(`Errore creando residuo per ${rip.bdn}: ${eIns.message}`);
          residuoRecord = numerizzaCampi([nuovo], ["costo_acquisto", "costi_crescita_preriproduttiva", "valore_realizzo_stimato", "residuo_totale", "residuo_rimanente", "conto_sospeso"])[0];
        }

        if (anno < residuoRecord.anno_inizio_riproduzione) continue; // non ancora riproduttore in quell'anno

        const piano = calcolaPianoScarico({
          residuoTotaleIniziale: residuoRecord.residuo_totale,
          vitaProduttivaAttesaAnni: residuoRecord.vita_produttiva_attesa_anni,
          contoSospesoPrecedente: residuoRecord.conto_sospeso,
          numeroFigliAnno: figliDellAnno.length,
          residuoRimanentePrimaDellAnno: residuoRecord.residuo_rimanente,
        });

        await supabase.from("ci_scarico_riproduttore_annuale").delete().eq("residuo_riproduttore_id", residuoRecord.id).eq("anno", anno);
        await supabase.from("ci_scarico_riproduttore_annuale").insert([{
          residuo_riproduttore_id: residuoRecord.id, anno,
          quota_annuale_dovuta: piano.quotaAnnualeDovuta, conto_sospeso_utilizzato: residuoRecord.conto_sospeso,
          totale_scaricato_anno: piano.totaleScaricatoAnno, n_figli_anno: figliDellAnno.length, quota_per_figlio: piano.quotaPerFiglio,
        }]);

        await supabase.from("ci_residuo_riproduttore").update({
          residuo_rimanente: piano.residuoRimanenteDopo, conto_sospeso: piano.contoSospesoNuovo, updated_at: new Date().toISOString(),
        }).eq("id", residuoRecord.id);

        // Aggiorno il costo_nascita_ereditato dei figli dell'anno (sommando, per il caso di 2 genitori riproduttori)
        for (const figlio of figliDellAnno) {
          const { data: costoEsistente } = await supabase.from("ci_costo_animale_annuale").select("id, costo_nascita_ereditato, costo_mantenimento, costo_totale_anno")
            .eq("animale_id", figlio.id).eq("anno", anno).maybeSingle();
          if (costoEsistente) {
            const nuovoNascita = round2((parseFloat(costoEsistente.costo_nascita_ereditato) || 0) + piano.quotaPerFiglio);
            const nuovoTotale = round2((parseFloat(costoEsistente.costo_mantenimento) || 0) + nuovoNascita);
            await supabase.from("ci_costo_animale_annuale").update({ costo_nascita_ereditato: nuovoNascita, costo_totale_anno: nuovoTotale }).eq("id", costoEsistente.id);
            figliAggiornati++;
          }
        }

        // Aggiorno quota_scaricata_su_figli sul riproduttore stesso, per l'anno
        const { data: costoRipEsistente } = await supabase.from("ci_costo_animale_annuale").select("id").eq("animale_id", rip.id).eq("anno", anno).maybeSingle();
        if (costoRipEsistente) {
          await supabase.from("ci_costo_animale_annuale").update({ quota_scaricata_su_figli: piano.totaleScaricatoAnno }).eq("id", costoRipEsistente.id);
        }

        elaborati++;
      }

      alert(`✓ Elaborati ${elaborati} riproduttori per l'anno ${anno}. Aggiornato il costo di nascita per ${figliAggiornati} figli (di quelli con costo già calcolato per quest'anno — per gli altri, ricalcola Report Costi prima).`);
      caricaElenco();
    } catch (err) {
      alert(`⚠️ Errore nell'elaborazione:\n\n${err.message}`);
    }
    setElaborando(false);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Report Riproduttori</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Residuo da recuperare (acquisto + crescita − valore stimato), ammortizzato sulla vita produttiva attesa e scaricato sui figli nati ogni anno. Se un anno non ha figli, la quota si accumula nel conto sospeso.
      </p>

      <div style={{ background: "#FFF9E6", border: `1.5px solid ${C.accent}`, borderRadius: 10, padding: 12, marginBottom: 20, fontSize: 12, color: C.text }}>
        ⚠️ Esegui prima "Report Costi" per l'anno scelto (e salvalo) — questo passaggio aggiorna il costo di nascita dei figli che hanno già una riga di costo per quell'anno. Il valore di realizzo stimato ora usa il peso medio storico (animali della stessa specie/razza usciti con più di {parametri?.eta_minima_calcolo_peso_storico || 3} anni) × i prezzi di mercato da "prezzi_riforma" — per la stima iniziale si usa prudenzialmente la valutazione più bassa tra vivo e carcassa; il valore reale sostituirà questa stima quando il riproduttore uscirà davvero (conguaglio, non ancora costruito). Il valore di realizzo si calcola una sola volta, alla prima elaborazione di ogni riproduttore.
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Anno</label>
            <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
              style={{ padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, width: 100 }} />
          </div>
          <button onClick={elabora} disabled={elaborando}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {elaborando ? "Elaborazione..." : "🐄 Calcola e scarica sui figli"}
          </button>
        </div>
      </div>

      {riproduttori && riproduttori.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", fontSize: 13 }}>
            <thead style={{ background: C.primary, color: "#fff" }}>
              <tr>
                <th style={th}>Riproduttore</th><th style={th}>Specie</th>
                <th style={th}>Residuo totale</th><th style={th}>Residuo rimanente</th>
                <th style={th}>Conto sospeso</th><th style={th}>Vita attesa (anni)</th><th style={th}>Valore realizzo stimato</th>
              </tr>
            </thead>
            <tbody>
              {riproduttori.map(r => (
                <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td}>{r.animali?.bdn || r.animali?.nome || "—"}</td>
                  <td style={td}>{r.specie}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.residuo_totale.toFixed(2)}€</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{r.residuo_rimanente.toFixed(2)}€</td>
                  <td style={{ ...td, textAlign: "right", color: r.conto_sospeso > 0 ? C.accent : C.muted }}>{r.conto_sospeso.toFixed(2)}€</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.vita_produttiva_attesa_anni}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.valore_realizzo_stimato?.toFixed(2)}€</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {riproduttori && riproduttori.length === 0 && (
        <p style={{ color: C.muted }}>Nessun riproduttore ancora elaborato — usa "Calcola e scarica sui figli".</p>
      )}
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700 };
const td = { padding: "6px 10px", fontSize: 12 };
