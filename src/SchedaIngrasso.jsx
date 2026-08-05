import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro, round2, fetchAllPages } from "./parsingUtils";
import { stimaPesoCarcassaPerEta } from "./motoreRiproduttori";

export default function SchedaIngrasso({ animaleId, lottoId, unitaNr, onClose, onSalvato }) {
  const [caricando, setCaricando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState(null);

  const [soggetto, setSoggetto] = useState(null); // dati anagrafici uniformati (animale o unità di lotto)
  const [costiAnnuali, setCostiAnnuali] = useState([]);
  const [vendita, setVendita] = useState(null);
  const [pesoStimatoInfo, setPesoStimatoInfo] = useState(null);
  const [annoConsultazione, setAnnoConsultazione] = useState(new Date().getFullYear());
  const [form, setForm] = useState({});

  useEffect(() => { carica(); }, [animaleId, lottoId, unitaNr]);

  async function carica() {
    setCaricando(true);
    setErrore(null);
    try {
      let s;
      if (animaleId) {
        const { data: a, error } = await supabase.from("animali")
          .select("id,bdn,nome,specie,razza,razza_calcolata,sesso,provenienza,stato,nascita,data_ingresso,data_uscita,peso_carcassa,peso_vivo_uscita,costo_iniziale,prezzo_acquisto")
          .eq("id", animaleId).single();
        if (error) throw new Error(error.message);
        s = { ...a, identificativo: a.bdn || a.nome, razzaFinale: a.razza_calcolata || a.razza };
      } else {
        const { data: u, error } = await supabase.from("suini_lotto")
          .select("id,lotto_id,nr,sesso,stato,data_uscita,peso_carcassa,peso_vivo_uscita,bdn")
          .eq("lotto_id", lottoId).eq("nr", unitaNr).single();
        if (error) throw new Error(error.message);
        const { data: lotto } = await supabase.from("lotti_suini").select("*").eq("id", lottoId).single();
        s = { ...u, specie: lotto?.specie || "suino", razzaFinale: lotto?.razza_madre, provenienza: lotto?.tipo_provenienza === "acquistato" ? "Acquistato" : "Nato in azienda",
          nascita: lotto?.data_parto, identificativo: u.bdn || `${lotto?.codice_lotto || lotto?.codice}#${u.nr}`,
          costo_iniziale: null, prezzo_acquisto: lotto?.prezzo_acquisto, fornitore: lotto?.fornitore, data_fattura: lotto?.data_fattura, numero_fattura: lotto?.numero_fattura };
      }
      setSoggetto(s);

      const { data: costi } = animaleId
        ? await supabase.from("ci_costo_animale_annuale").select("anno,costo_mantenimento,costo_nascita_ereditato,costo_totale_anno").eq("animale_id", animaleId).order("anno")
        : await supabase.from("ci_costo_animale_annuale").select("anno,costo_mantenimento,costo_nascita_ereditato,costo_totale_anno").eq("lotto_id", lottoId).eq("unita_nr", unitaNr).order("anno");
      setCostiAnnuali(costi || []);

      const { data: v } = animaleId
        ? await supabase.from("ci_dati_vendita_ingrasso").select("*").eq("animale_id", animaleId).maybeSingle()
        : await supabase.from("ci_dati_vendita_ingrasso").select("*").eq("lotto_id", lottoId).eq("unita_nr", unitaNr).maybeSingle();
      setVendita(v);
      setForm({ prezzo_vendita_kg_reale: v?.prezzo_vendita_kg_reale ?? "" });

      // Stima peso, solo se ancora attivo (non uscito) e con data di nascita nota
      const isUscito = s.stato && s.stato !== "attivo" && s.stato !== "vivo";
      if (!isUscito && s.nascita) {
        const { data: tuttiAnimali } = await fetchAllPages((da, r) => supabase.from("animali")
          .select("specie,razza,razza_calcolata,sesso,nascita,data_uscita,peso_carcassa").range(da, r));
        const etaAnni = (new Date() - new Date(s.nascita)) / (365.25 * 86400000);
        const stima = stimaPesoCarcassaPerEta({ specie: s.specie, razza: s.razzaFinale, sesso: s.sesso, etaAnniAnimale: etaAnni, animaliUsciti: tuttiAnimali || [] });
        setPesoStimatoInfo(stima.pesoStimato != null ? stima : null);
      }
    } catch (err) {
      setErrore(err.message);
    }
    setCaricando(false);
  }

  async function salva() {
    setSalvando(true);
    setErrore(null);
    try {
      const payload = animaleId
        ? { animale_id: animaleId, lotto_id: null, unita_nr: null, prezzo_vendita_kg_reale: form.prezzo_vendita_kg_reale !== "" ? round2(parseFloat(form.prezzo_vendita_kg_reale)) : null, updated_at: new Date().toISOString() }
        : { animale_id: null, lotto_id: lottoId, unita_nr: unitaNr, prezzo_vendita_kg_reale: form.prezzo_vendita_kg_reale !== "" ? round2(parseFloat(form.prezzo_vendita_kg_reale)) : null, updated_at: new Date().toISOString() };

      if (vendita) {
        const { error: eUpd } = await supabase.from("ci_dati_vendita_ingrasso").update(payload).eq("id", vendita.id);
        if (eUpd) throw new Error(`Salvataggio non riuscito: ${eUpd.message}`);
      } else {
        const { error: eIns } = await supabase.from("ci_dati_vendita_ingrasso").insert([payload]);
        if (eIns) throw new Error(`Salvataggio non riuscito: ${eIns.message}`);
      }

      onSalvato?.();
      await carica();
    } catch (err) {
      setErrore(err.message);
    }
    setSalvando(false);
  }

  if (caricando) return <ModaleSfondo onClose={onClose}><p style={{ color: C.muted }}>Caricamento...</p></ModaleSfondo>;
  if (!soggetto) return <ModaleSfondo onClose={onClose}><p style={{ color: C.red }}>⚠️ {errore || "Non trovato."}</p></ModaleSfondo>;

  const isUscito = soggetto.stato && soggetto.stato !== "attivo" && soggetto.stato !== "vivo";
  const costoNascita = costiAnnuali.reduce((s, c) => s + (parseFloat(c.costo_nascita_ereditato) || 0), 0);
  const costoPartenza = soggetto.provenienza === "Nato in azienda" ? costoNascita : (soggetto.prezzo_acquisto || 0);
  const mantenimentoTotale = round2(costiAnnuali.reduce((s, c) => s + (parseFloat(c.costo_mantenimento) || 0), 0));
  const costoTotale = round2(costoPartenza + mantenimentoTotale);

  // Costi accumulati prima dell'anno di consultazione, e in quello specifico anno
  const costoPrimaDellAnno = round2(costiAnnuali.filter(c => c.anno < annoConsultazione).reduce((s, c) => s + (parseFloat(c.costo_totale_anno) || 0), 0));
  const costoNellAnno = round2(costiAnnuali.filter(c => c.anno === annoConsultazione).reduce((s, c) => s + (parseFloat(c.costo_totale_anno) || 0), 0));

  // Giorni ed età: dalla nascita a oggi (se attivo) o alla data di uscita (se uscito)
  const dataRiferimentoEta = isUscito && soggetto.data_uscita ? new Date(soggetto.data_uscita) : new Date();
  const giorniVita = soggetto.nascita ? Math.round((dataRiferimentoEta - new Date(soggetto.nascita)) / 86400000) : null;
  const anniVita = giorniVita != null ? round2(giorniVita / 365.25) : null;
  const costoAlGiorno = giorniVita > 0 ? round2(costoTotale / giorniVita) : null;

  const pesoVivo = soggetto.peso_vivo_uscita || null; // non c'è un "peso vivo attuale" tracciato per gli animali ancora in vita
  const costoAlKgVivo = pesoVivo ? round2(costoTotale / pesoVivo) : null;

  const pesoReale = soggetto.peso_carcassa;
  const pesoPerValore = pesoReale || pesoStimatoInfo?.pesoStimato || null;
  const valoreVendita = pesoPerValore && form.prezzo_vendita_kg_reale
    ? round2(pesoPerValore * parseFloat(form.prezzo_vendita_kg_reale)) : null;
  const margine = valoreVendita != null ? round2(valoreVendita - costoTotale) : null;
  const costoAlKgCarcassa = pesoPerValore ? round2(costoTotale / pesoPerValore) : null;

  return (
    <ModaleSfondo onClose={onClose}>
      <h2 style={{ color: C.primary, fontSize: 20, marginTop: 0 }}>Scheda Accrescimento/Ingrasso</h2>
      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}

      <Sezione titolo="Dati anagrafici">
        <Griglia>
          <CampoSoloLettura label="BDN / Codice" value={soggetto.identificativo || "—"} />
          <CampoSoloLettura label="Specie" value={soggetto.specie} />
          <CampoSoloLettura label="Razza" value={soggetto.razzaFinale || "—"} />
          <CampoSoloLettura label="Sesso" value={soggetto.sesso || "—"} />
          <CampoSoloLettura label="Provenienza" value={soggetto.provenienza || "—"} />
          <CampoSoloLettura label="Stato" value={soggetto.stato || "—"} />
          <CampoSoloLettura label="Data di nascita" value={soggetto.nascita || "—"} />
          <CampoSoloLettura label="Data di ingresso in azienda" value={soggetto.data_ingresso || "—"} />
          <CampoSoloLettura label={isUscito ? "Età alla uscita" : "Età attuale"} value={anniVita != null ? `${anniVita} anni (${giorniVita} giorni)` : "—"} />
        </Griglia>
      </Sezione>

      <Sezione titolo="Costo di partenza e mantenimento">
        <Griglia>
          <CampoSoloLettura label={soggetto.provenienza === "Nato in azienda" ? "Costo di nascita" : "Costo di acquisto"} value={formattaEuro(costoPartenza)} />
          <CampoSoloLettura label="Costo totale ad oggi" value={formattaEuro(costoTotale)} />
          <CampoSoloLettura label="Costo al giorno" value={costoAlGiorno != null ? formattaEuro(costoAlGiorno, 3) : "—"} />
        </Griglia>
        <div style={{ marginTop: 10, marginBottom: 6 }}>
          <label style={{ fontSize: 11, color: C.muted }}>Anno di consultazione (per lo spacchettamento sotto)
            <input type="number" value={annoConsultazione} onChange={e => setAnnoConsultazione(parseInt(e.target.value) || new Date().getFullYear())}
              style={{ width: 100, marginLeft: 8, padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
          </label>
        </div>
        <Griglia>
          <CampoSoloLettura label={`Costi accumulati prima del ${annoConsultazione}`} value={formattaEuro(costoPrimaDellAnno)} />
          <CampoSoloLettura label={`Costi accumulati nel ${annoConsultazione}`} value={formattaEuro(costoNellAnno)} />
        </Griglia>
      </Sezione>

      <Sezione titolo="Costo per unità">
        <Griglia>
          <CampoSoloLettura label="Costo al kg peso vivo" value={costoAlKgVivo != null ? formattaEuro(costoAlKgVivo, 3) : "— (serve peso vivo, disponibile solo per gli usciti)"} />
          <CampoSoloLettura label="Costo al kg carcassa" value={costoAlKgCarcassa != null ? formattaEuro(costoAlKgCarcassa, 3) : "— (serve peso carcassa reale o stimato)"} />
        </Griglia>
      </Sezione>

      <Sezione titolo="Peso">
        <Griglia>
          <CampoSoloLettura label="Peso carcassa (kg)"
            value={pesoReale ? `${pesoReale} (reale)` : pesoStimatoInfo ? `${pesoStimatoInfo.pesoStimato} stimato (${pesoStimatoInfo.fonteStima}, n=${pesoStimatoInfo.campioneUsato})` : "—"} />
        </Griglia>
      </Sezione>

      <Sezione titolo="Vendita e margine">
        <Griglia>
          <Campo label="Prezzo vendita €/kg (reale o di riferimento)" tipo="number" value={form.prezzo_vendita_kg_reale} onChange={v => setForm({ prezzo_vendita_kg_reale: v })} />
          <CampoSoloLettura label="Valore di vendita" value={valoreVendita != null ? `${formattaEuro(valoreVendita)}${!pesoReale ? " (su peso stimato)" : ""}` : "— (serve peso e prezzo)"} />
          <CampoSoloLettura label="Margine" value={margine != null ? formattaEuro(margine) : "—"} />
        </Griglia>
      </Sezione>

      <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>Chiudi</button>
        <button onClick={salva} disabled={salvando}
          style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {salvando ? "Salvataggio..." : "✓ Salva"}
        </button>
      </div>
    </ModaleSfondo>
  );
}

function ModaleSfondo({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24, overflowY: "auto", zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 24, maxWidth: 700, width: "100%", marginTop: 20, marginBottom: 20 }}>
        {children}
      </div>
    </div>
  );
}
function Sezione({ titolo, children }) {
  return (
    <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: "uppercase" }}>{titolo}</div>
      {children}
    </div>
  );
}
function Griglia({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>{children}</div>;
}
function Campo({ label, value, onChange, tipo = "text" }) {
  return (
    <label style={{ fontSize: 11, color: C.muted }}>
      {label}
      <input type={tipo} value={value ?? ""} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, marginTop: 2, boxSizing: "border-box" }} />
    </label>
  );
}
function CampoSoloLettura({ label, value }) {
  return (
    <label style={{ fontSize: 11, color: C.muted }}>
      {label}
      <div style={{ padding: "6px 8px", borderRadius: 6, background: C.bg, fontSize: 13, marginTop: 2, fontWeight: 700 }}>{value}</div>
    </label>
  );
}
