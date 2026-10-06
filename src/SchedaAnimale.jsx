import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { round2, fetchAllPages } from "./parsingUtils";
import SchedaRiproduttore from "./SchedaRiproduttore";
import SchedaAnimaleMacello from "./SchedaAnimaleMacello";
import { caricaIdGenitori } from "./genitori";

// Scheda Animale: ricerca per matricola, nome o codice del suinetto. Il risultato apre la
// scheda giusta: Scheda Riproduttore per i riproduttori, Scheda Animale (unica, con lo stesso
// calcolo del Riepilogo Costo Animali) per tutti gli altri e per i suinetti dei lotti.
export default function SchedaAnimale({ ricercaIniziale, onRicercaConsumata }) {
  const [ricerca, setRicerca] = useState(ricercaIniziale || "");
  const [risultatiRicerca, setRisultatiRicerca] = useState([]);
  const [cercando, setCercando] = useState(false);
  const [cercato, setCercato] = useState(false);
  const [selezionato, setSelezionato] = useState(null);
  const [traghettando, setTraghettando] = useState(false);

  useEffect(() => {
    if (ricercaIniziale) {
      setRicerca(ricercaIniziale);
      cerca(ricercaIniziale, true);
      if (onRicercaConsumata) onRicercaConsumata();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ricercaIniziale]);

  async function cerca(termine, apriSeUnico) {
    const q = (termine ?? ricerca).trim();
    if (!q) return;
    setCercando(true);
    setSelezionato(null);
    setCercato(true);
    try {
      const { data: animaliTrovati, error: eA } = await supabase
        .from("animali").select("id,bdn,nome,specie,razza,sesso,stato,nascita,data_ingresso,data_uscita,motivo_uscita,riproduttore,prezzo_acquisto,provenienza,peso_nascita,peso_attuale,peso_vivo_uscita,peso_carcassa,resa_percent,padre_id,madre_id")
        .or(`bdn.ilike.%${q}%,nome.ilike.%${q}%`).limit(20);
      if (eA) throw new Error(eA.message);

      const { data: unitaTrovate, error: eU } = await supabase
        .from("suini_lotto").select("id,lotto_id,nr,codice_completo,bdn,matricola,stato")
        .or(`codice_completo.ilike.%${q}%,matricola.ilike.%${q}%`).limit(20);
      if (eU) throw new Error(eU.message);

      let unitaConLotto = [];
      if (unitaTrovate && unitaTrovate.length > 0) {
        const idLotti = [...new Set(unitaTrovate.map(u => u.lotto_id))];
        const { data: lottiRel } = await supabase.from("lotti_suini").select("id, codice_lotto, codice, prezzo_acquisto, tipo_provenienza, nati_totali").in("id", idLotti);
        const mappaLotti = new Map((lottiRel || []).map(l => [l.id, l]));
        unitaConLotto = unitaTrovate.map(u => ({ ...u, lotto: mappaLotti.get(u.lotto_id) }));
      }

      // Regola del 05/10/2026: chi ha parti registrati (padre o madre di un nato o di un lotto)
      // è un riproduttore anche se nell'app manca il segno.
      const genitori = (animaliTrovati || []).some(a => !a.riproduttore) ? await caricaIdGenitori() : new Set();
      const elenco = [
        ...(animaliTrovati || []).map(a => (!a.riproduttore && genitori.has(a.id))
          ? { tipo: "animale", ...a, riproduttore: true, riproduttoreDaiParti: true }
          : { tipo: "animale", ...a }),
        // il suinetto già passato a matricola si trova come animale, non due volte
        ...unitaConLotto.filter(u => u.stato !== "registrato_individuale").map(u => ({ tipo: "lotto", ...u })),
      ];
      setRisultatiRicerca(elenco);
      if (apriSeUnico && elenco.length === 1) setSelezionato(elenco[0]);
    } catch (err) {
      alert(`⚠️ Errore nella ricerca:\n\n${err.message}`);
    }
    setCercando(false);
  }


  function selezionaEd(item) { setSelezionato(item); }

  async function traghettaCostiLottoBDN() {
    if (!window.confirm("Cerca tutti i suinetti passati da lotto ad animale individuale (BDN assegnato) e trasferisce i loro costi già calcolati (mantenimento, nascita ereditata) dal lotto al nuovo animale. Procedere?")) return;
    setTraghettando(true);
    try {
      const { data: unitaTrasferite, error: eU } = await fetchAllPages((da, a) => supabase
        .from("suini_lotto").select("id,lotto_id,nr,bdn").eq("stato", "registrato_individuale").not("bdn", "is", null).range(da, a));
      if (eU) throw new Error(eU.message);
      if (!unitaTrasferite || unitaTrasferite.length === 0) {
        alert("Nessuna unità di lotto risulta ancora trasferita a BDN individuale.");
        setTraghettando(false);
        return;
      }

      let righeTraghettate = 0, fuse = 0, animaliNonTrovati = 0;
      for (const unita of unitaTrasferite) {
        const { data: animale } = await supabase.from("animali").select("id").eq("bdn", unita.bdn).maybeSingle();
        if (!animale) { animaliNonTrovati++; continue; }

        const { data: righeLotto } = await supabase.from("ci_costo_animale_annuale").select("*")
          .eq("lotto_id", unita.lotto_id).eq("unita_nr", unita.nr);
        if (!righeLotto || righeLotto.length === 0) continue;

        for (const riga of righeLotto) {
          const { data: rigaEsistente } = await supabase.from("ci_costo_animale_annuale").select("*")
            .eq("animale_id", animale.id).eq("anno", riga.anno).maybeSingle();

          if (rigaEsistente) {
            await supabase.from("ci_costo_animale_annuale").update({
              uba_giorni: round2((parseFloat(rigaEsistente.uba_giorni) || 0) + (parseFloat(riga.uba_giorni) || 0)),
              costo_mantenimento: round2((parseFloat(rigaEsistente.costo_mantenimento) || 0) + (parseFloat(riga.costo_mantenimento) || 0)),
              costo_nascita_ereditato: round2((parseFloat(rigaEsistente.costo_nascita_ereditato) || 0) + (parseFloat(riga.costo_nascita_ereditato) || 0)),
              quota_scaricata_su_figli: round2((parseFloat(rigaEsistente.quota_scaricata_su_figli) || 0) + (parseFloat(riga.quota_scaricata_su_figli) || 0)),
              quota_residuo_riproduttori: round2((parseFloat(rigaEsistente.quota_residuo_riproduttori) || 0) + (parseFloat(riga.quota_residuo_riproduttori) || 0)),
              costo_totale_anno: round2((parseFloat(rigaEsistente.costo_totale_anno) || 0) + (parseFloat(riga.costo_totale_anno) || 0)),
            }).eq("id", rigaEsistente.id);
            await supabase.from("ci_costo_animale_annuale").delete().eq("id", riga.id);
            fuse++;
          } else {
            await supabase.from("ci_costo_animale_annuale").update({
              animale_id: animale.id, lotto_id: null, unita_nr: null,
            }).eq("id", riga.id);
          }
          righeTraghettate++;
        }
      }

      alert(`✓ Traghettate ${righeTraghettate} righe di costo (${fuse} fuse con costi già esistenti sull'animale).${animaliNonTrovati > 0 ? ` ${animaliNonTrovati} unità con BDN non trovato in anagrafica, saltate.` : ""}`);
    } catch (err) {
      alert(`⚠️ Errore nel traghettamento:\n\n${err.message}`);
    }
    setTraghettando(false);
  }


  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Scheda Animale</h1>
        <button onClick={traghettaCostiLottoBDN} disabled={traghettando}
          style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {traghettando ? "Trasferimento..." : "🔄 Trasferisci i costi dal lotto alla matricola"}
        </button>
      </div>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Cerca per matricola o nome (anche i suinetti dei lotti) e clicca il risultato per aprire la scheda. L'elenco completo con i costi è in «Riepilogo Costo Animali».
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={ricerca} onChange={e => setRicerca(e.target.value)}
          onKeyDown={e => e.key === "Enter" && cerca()}
          placeholder="Matricola, nome o codice del suinetto (es. IT058990123456, BELLA, L2501CN03)"
          style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14 }} />
        <button onClick={() => cerca()} disabled={cercando}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {cercando ? "..." : "🔍 Cerca"}
        </button>
      </div>

      {risultatiRicerca.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 20 }}>
          {risultatiRicerca.map(item => (
            <div key={`${item.tipo}-${item.id}`} onClick={() => selezionaEd(item)}
              style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
              <strong>{item.tipo === "animale" ? (item.bdn || item.nome) : (item.codice_completo || item.matricola)}</strong>
              {item.tipo === "animale" && <span style={{ color: C.muted, fontSize: 12 }}> — {item.nome || "senza nome"} · {item.specie} · {item.razza || "razza non indicata"}{item.riproduttore ? " · riproduttore" : ""}{item.riproduttoreDaiParti ? " (dai parti registrati: nell'app manca il segno «riproduttore»)" : ""}</span>}
              {item.tipo === "lotto" && <span style={{ color: C.muted, fontSize: 12 }}> — suinetto del lotto {item.lotto?.codice_lotto || item.lotto?.codice}</span>}
            </div>
          ))}
        </div>
      )}

      {cercato && risultatiRicerca.length === 0 && ricerca && !cercando && (
        <p style={{ color: C.muted }}>Nessun risultato per «{ricerca}».</p>
      )}

      {selezionato && (selezionato.tipo === "animale" && selezionato.riproduttore
        ? <SchedaRiproduttore animaleId={selezionato.id} onClose={() => setSelezionato(null)} onSalvato={() => {}} />
        : <SchedaAnimaleMacello
            animaleId={selezionato.tipo === "animale" ? selezionato.id : undefined}
            lottoId={selezionato.tipo === "lotto" ? selezionato.lotto_id : undefined}
            unitaNr={selezionato.tipo === "lotto" ? selezionato.nr : undefined}
            onClose={() => setSelezionato(null)} onSalvato={() => {}} />)}
    </div>
  );
}
