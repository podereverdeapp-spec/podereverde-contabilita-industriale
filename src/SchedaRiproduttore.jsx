import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro, formattaNumero, round2, fetchAllPages } from "./parsingUtils";
import {
  calcolaPartiStorici, calcolaFigliFemmina, calcolaFigliMaschio,
  calcolaFallbackPopolazioneFemmine,
} from "./motoreRiproduttori";

export default function SchedaRiproduttore({ animaleId, onClose, onSalvato }) {
  const [caricando, setCaricando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState(null);

  const [animale, setAnimale] = useState(null);
  const [residuo, setResiduo] = useState(null);
  const [fatturaAcquisto, setFatturaAcquisto] = useState(null);
  const [fatturaTrasporto, setFatturaTrasporto] = useState(null);
  const [costiAnnuali, setCostiAnnuali] = useState([]);
  const [ultimoScarico, setUltimoScarico] = useState(null);
  const [quotaNascitaMadre, setQuotaNascitaMadre] = useState(null);
  const [quotaNascitaPadre, setQuotaNascitaPadre] = useState(null);
  const [figliInfo, setFigliInfo] = useState(null);

  const [form, setForm] = useState({});
  const [formAcquisto, setFormAcquisto] = useState({});
  const [formTrasporto, setFormTrasporto] = useState({});

  useEffect(() => { carica(); }, [animaleId]);

  async function carica() {
    setCaricando(true);
    setErrore(null);
    try {
      const { data: a, error: eA } = await supabase.from("animali")
        .select("id, bdn, nome, specie, razza, razza_calcolata, nascita, data_ingresso, provenienza, stato, padre_id, madre_id, peso_carcassa, costo_iniziale, prezzo_acquisto, sesso")
        .eq("id", animaleId).single();
      if (eA) throw new Error(eA.message);
      setAnimale(a);
      setForm({
        bdn: a.bdn || "", specie: a.specie || "", razza: a.razza || "",
        nascita: a.nascita || "", data_ingresso: a.data_ingresso || "",
      });

      const { data: res } = await supabase.from("ci_residuo_riproduttore").select("*").eq("animale_id", animaleId).maybeSingle();
      setResiduo(res);
      if (res) setForm(prev => ({ ...prev, vita_produttiva_attesa_anni: res.vita_produttiva_attesa_anni, prezzo_vendita_kg_carcassa_reale: res.prezzo_vendita_kg_carcassa_reale || "" }));

      if (a.bdn) {
        const { data: fatture } = await supabase.from("ci_report_acquisto_animali")
          .select("*, ci_fornitori(nome)").eq("bdn", a.bdn).in("fonte", ["ACQUISTO_DIRETTO", "TRASPORTO_INGRESSO"]);
        const acq = (fatture || []).find(f => f.fonte === "ACQUISTO_DIRETTO");
        const tra = (fatture || []).find(f => f.fonte === "TRASPORTO_INGRESSO");
        setFatturaAcquisto(acq || null);
        setFatturaTrasporto(tra || null);
        setFormAcquisto(acq ? { fornitore_nome: acq.ci_fornitori?.nome || "", data: acq.data_fattura, numero: acq.numero_fattura, importo: acq.importo } : { fornitore_nome: "", data: "", numero: "", importo: "" });
        setFormTrasporto(tra ? { fornitore_nome: tra.ci_fornitori?.nome || "", data: tra.data_fattura, numero: tra.numero_fattura, importo: tra.importo } : { fornitore_nome: "", data: "", numero: "", importo: "" });
      }

      const { data: costi } = await supabase.from("ci_costo_animale_annuale").select("anno, costo_mantenimento, costo_nascita_ereditato, costo_totale_anno").eq("animale_id", animaleId).order("anno");
      setCostiAnnuali(costi || []);

      if (res) {
        const { data: scarichi } = await supabase.from("ci_scarico_riproduttore_annuale").select("*").eq("residuo_riproduttore_id", res.id).order("anno", { ascending: false }).limit(1);
        setUltimoScarico(scarichi?.[0] || null);
      }

      // Se nato in azienda: quota nascita madre/padre, cercando lo scarico dell'anno di nascita dei genitori
      if (a.provenienza === "Nato in azienda" && a.nascita) {
        const annoNascita = new Date(a.nascita).getFullYear();
        for (const [genitoreId, setter] of [[a.madre_id, setQuotaNascitaMadre], [a.padre_id, setQuotaNascitaPadre]]) {
          if (!genitoreId) { setter(null); continue; }
          const { data: resGenitore } = await supabase.from("ci_residuo_riproduttore").select("id").eq("animale_id", genitoreId).maybeSingle();
          if (!resGenitore) { setter(null); continue; }
          const { data: scaricoGenitore } = await supabase.from("ci_scarico_riproduttore_annuale").select("quota_per_figlio").eq("residuo_riproduttore_id", resGenitore.id).eq("anno", annoNascita).maybeSingle();
          setter(scaricoGenitore?.quota_per_figlio ?? null);
        }
      }

      // Figli avuti/potenziali (solo se è un riproduttore con residuo calcolato)
      if (res) {
        const [{ data: tuttiAnimali }, { data: tuttiLotti }, { data: tutteUnita }, { data: altriRiproduttori }] = await Promise.all([
          fetchAllPages((da, r) => supabase.from("animali").select("id,padre_id,madre_id,nascita").range(da, r)),
          fetchAllPages((da, r) => supabase.from("lotti_suini").select("id,padre_id,madre_id,data_parto").range(da, r)),
          fetchAllPages((da, r) => supabase.from("suini_lotto").select("id,lotto_id").range(da, r)),
          supabase.from("ci_residuo_riproduttore").select("animale_id").eq("specie", a.specie),
        ]);

        // Per un animale già uscito (macellato/venduto/deceduto) non ha senso proiettare
        // figli futuri — non è più produttivo, quindi gli anni residui sono azzerati:
        // "figli avuti" resterà il conteggio reale, "figli futuri stimati" sarà sempre 0.
        const isUscito = a.stato && a.stato !== "attivo";
        const anniProduttiviResidui = isUscito ? 0 : res.vita_produttiva_attesa_anni - (new Date().getFullYear() - res.anno_inizio_riproduzione);
        const sesso = a.sesso;

        if (sesso === "M") {
          const figliTotali = (tuttiAnimali || []).filter(x => x.padre_id === animaleId).length
            + calcolaPartiStorici({ riproduttoreId: animaleId, specie: a.specie, tuttiAnimali: [], tuttiLotti, tutteUnita }).reduce((s, p) => s + p.numeroFigli, 0);
          const anniAttivo = Math.max(new Date().getFullYear() - res.anno_inizio_riproduzione, 1);
          setFigliInfo({ tipo: "maschio", ...calcolaFigliMaschio({ figliTotaliAvuti: figliTotali, anniAttivoComeRiproduttore: anniAttivo, anniProduttiviResidui }) });
        } else {
          const partiStorici = calcolaPartiStorici({ riproduttoreId: animaleId, specie: a.specie, tuttiAnimali, tuttiLotti, tutteUnita });
          const altreIds = (altriRiproduttori || []).map(r => r.animale_id).filter(id => id !== animaleId);
          const fallback = calcolaFallbackPopolazioneFemmine({ specie: a.specie, escludiId: animaleId, tutteLeRiproduttriciIds: altreIds, tuttiAnimali, tuttiLotti, tutteUnita });
          setFigliInfo({ tipo: "femmina", ...calcolaFigliFemmina({ partiStorici, anniProduttiviResidui, fallbackPopolazione: fallback }) });
        }
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
      await supabase.from("animali").update({
        bdn: form.bdn || null, razza: form.razza || null, nascita: form.nascita || null, data_ingresso: form.data_ingresso || null,
      }).eq("id", animaleId);

      if (residuo) {
        await supabase.from("ci_residuo_riproduttore").update({
          vita_produttiva_attesa_anni: parseFloat(form.vita_produttiva_attesa_anni) || residuo.vita_produttiva_attesa_anni,
          prezzo_vendita_kg_carcassa_reale: form.prezzo_vendita_kg_carcassa_reale !== "" ? parseFloat(form.prezzo_vendita_kg_carcassa_reale) : null,
        }).eq("id", residuo.id);
      }

      // Fattura acquisto: crea o aggiorna
      if (formAcquisto.data && formAcquisto.numero && formAcquisto.importo !== "") {
        let fornitoreId = null;
        if (formAcquisto.fornitore_nome) {
          const { data: fEsistente } = await supabase.from("ci_fornitori").select("id").eq("nome", formAcquisto.fornitore_nome).maybeSingle();
          fornitoreId = fEsistente?.id;
          if (!fornitoreId) {
            const { data: fNuovo } = await supabase.from("ci_fornitori").insert([{ nome: formAcquisto.fornitore_nome }]).select().single();
            fornitoreId = fNuovo?.id;
          }
        }
        const payload = { fonte: "ACQUISTO_DIRETTO", fornitore_id: fornitoreId, data_fattura: formAcquisto.data, numero_fattura: formAcquisto.numero, importo: round2(parseFloat(formAcquisto.importo)), specie: animale.specie, bdn: form.bdn };
        if (fatturaAcquisto) await supabase.from("ci_report_acquisto_animali").update(payload).eq("id", fatturaAcquisto.id);
        else await supabase.from("ci_report_acquisto_animali").insert([payload]);
      }

      // Fattura trasporto ingresso: crea o aggiorna
      if (formTrasporto.data && formTrasporto.numero && formTrasporto.importo !== "") {
        let fornitoreId = null;
        if (formTrasporto.fornitore_nome) {
          const { data: fEsistente } = await supabase.from("ci_fornitori").select("id").eq("nome", formTrasporto.fornitore_nome).maybeSingle();
          fornitoreId = fEsistente?.id;
          if (!fornitoreId) {
            const { data: fNuovo } = await supabase.from("ci_fornitori").insert([{ nome: formTrasporto.fornitore_nome }]).select().single();
            fornitoreId = fNuovo?.id;
          }
        }
        const payload = { fonte: "TRASPORTO_INGRESSO", fornitore_id: fornitoreId, data_fattura: formTrasporto.data, numero_fattura: formTrasporto.numero, importo: round2(parseFloat(formTrasporto.importo)), specie: animale.specie, bdn: form.bdn };
        if (fatturaTrasporto) await supabase.from("ci_report_acquisto_animali").update(payload).eq("id", fatturaTrasporto.id);
        else await supabase.from("ci_report_acquisto_animali").insert([payload]);
      }

      onSalvato?.();
      await carica();
    } catch (err) {
      setErrore(err.message);
    }
    setSalvando(false);
  }

  if (caricando) return <ModaleSfondo onClose={onClose}><p style={{ color: C.muted }}>Caricamento...</p></ModaleSfondo>;
  if (!animale) return <ModaleSfondo onClose={onClose}><p style={{ color: C.red }}>Animale non trovato.</p></ModaleSfondo>;

  const costoMantenimentoAnniPrecedenti = costiAnnuali.filter(c => c.anno < new Date().getFullYear()).reduce((s, c) => s + (parseFloat(c.costo_mantenimento) || 0), 0);
  const costoMantenimentoAnnoCorrente = costiAnnuali.find(c => c.anno === new Date().getFullYear())?.costo_mantenimento || 0;
  const valoreRealizzoReale = animale.peso_carcassa && form.prezzo_vendita_kg_carcassa_reale
    ? round2(animale.peso_carcassa * parseFloat(form.prezzo_vendita_kg_carcassa_reale)) : null;

  return (
    <ModaleSfondo onClose={onClose}>
      <h2 style={{ color: C.primary, fontSize: 20, marginTop: 0 }}>Scheda Riproduttore</h2>
      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}

      <Sezione titolo="Dati anagrafici">
        <Griglia>
          <Campo label="BDN / Codice lotto" value={form.bdn} onChange={v => setForm(p => ({ ...p, bdn: v }))} />
          <CampoSoloLettura label="Specie" value={animale.specie} />
          <Campo label="Razza" value={form.razza} onChange={v => setForm(p => ({ ...p, razza: v }))} />
          <Campo label="Anno di nascita" tipo="date" value={form.nascita} onChange={v => setForm(p => ({ ...p, nascita: v }))} />
          <Campo label="Anno di ingresso in azienda" tipo="date" value={form.data_ingresso} onChange={v => setForm(p => ({ ...p, data_ingresso: v }))} />
        </Griglia>
      </Sezione>

      {animale.provenienza === "Acquistato" && (
        <Sezione titolo="Fattura di acquisto">
          <Griglia>
            <Campo label="Fornitore" value={formAcquisto.fornitore_nome} onChange={v => setFormAcquisto(p => ({ ...p, fornitore_nome: v }))} placeholder={fatturaAcquisto ? "(già registrato — scrivi solo per correggere)" : ""} />
            <Campo label="Data fattura" tipo="date" value={formAcquisto.data} onChange={v => setFormAcquisto(p => ({ ...p, data: v }))} />
            <Campo label="Numero fattura" value={formAcquisto.numero} onChange={v => setFormAcquisto(p => ({ ...p, numero: v }))} />
            <Campo label="Costo (€)" tipo="number" value={formAcquisto.importo} onChange={v => setFormAcquisto(p => ({ ...p, importo: v }))} />
          </Griglia>
        </Sezione>
      )}

      <Sezione titolo="Fattura trasporto ingresso in azienda">
        <Griglia>
          <Campo label="Fornitore" value={formTrasporto.fornitore_nome} onChange={v => setFormTrasporto(p => ({ ...p, fornitore_nome: v }))} placeholder={fatturaTrasporto ? "(già registrato — scrivi solo per correggere)" : ""} />
          <Campo label="Data fattura" tipo="date" value={formTrasporto.data} onChange={v => setFormTrasporto(p => ({ ...p, data: v }))} />
          <Campo label="Numero fattura" value={formTrasporto.numero} onChange={v => setFormTrasporto(p => ({ ...p, numero: v }))} />
          <Campo label="Costo (€)" tipo="number" value={formTrasporto.importo} onChange={v => setFormTrasporto(p => ({ ...p, importo: v }))} />
        </Griglia>
      </Sezione>

      {residuo && (
        <>
          <Sezione titolo="Vita produttiva attesa">
            <Griglia>
              <Campo label="Vita attesa (anni)" tipo="number" value={form.vita_produttiva_attesa_anni} onChange={v => setForm(p => ({ ...p, vita_produttiva_attesa_anni: v }))} />
            </Griglia>
          </Sezione>

          {figliInfo && (
            <Sezione titolo="Figli">
              <Griglia>
                <CampoSoloLettura label="Figli avuti finora" value={figliInfo.figliAvuti} />
                <CampoSoloLettura label="Figli futuri stimati" value={figliInfo.figliFuturiStimati} />
              </Griglia>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                {figliInfo.tipo === "femmina"
                  ? `Media ${formattaNumero(figliInfo.mediaFigliPerParto, 1)} figli/parto, intervallo ${formattaNumero(figliInfo.intervalloMedioAnni, 2)} anni tra parti${figliInfo.stimaBasataSuDatiPropri ? " (dati propri)" : " (media di popolazione — dati propri ancora insufficienti)"}.`
                  : `Media ${formattaNumero(figliInfo.mediaFigliPerAnno, 2)} figli/anno.`}
              </p>
            </Sezione>
          )}

          <Sezione titolo="Riepilogo costi">
            <Griglia>
              <CampoSoloLettura label="Costo di acquisto" value={formattaEuro(residuo.costo_acquisto)} />
              <CampoSoloLettura label="Costo mantenimento anni precedenti" value={formattaEuro(costoMantenimentoAnniPrecedenti)} />
              <CampoSoloLettura label="Costo mantenimento anno in corso" value={formattaEuro(costoMantenimentoAnnoCorrente)} />
            </Griglia>
          </Sezione>

          <Sezione titolo="Vendita e valore di realizzo">
            <Griglia>
              <CampoSoloLettura label="Peso carcassa (kg)" value={animale.peso_carcassa || "—"} />
              <Campo label="Prezzo vendita €/kg carcassa" tipo="number" value={form.prezzo_vendita_kg_carcassa_reale} onChange={v => setForm(p => ({ ...p, prezzo_vendita_kg_carcassa_reale: v }))} />
              <CampoSoloLettura label="Valore di realizzo" value={valoreRealizzoReale != null ? formattaEuro(valoreRealizzoReale) : "— (serve peso carcassa e prezzo)"} />
            </Griglia>
          </Sezione>

          <Sezione titolo="Scarico sui figli">
            <Griglia>
              <CampoSoloLettura label={`Valore scaricato per figlio (anno ${ultimoScarico?.anno ?? "—"})`} value={ultimoScarico ? formattaEuro(ultimoScarico.quota_per_figlio) : "— (non ancora elaborato)"} />
            </Griglia>
          </Sezione>
        </>
      )}

      {animale.provenienza === "Nato in azienda" && (
        <Sezione titolo="Valore di nascita (ereditato dai genitori)">
          <Griglia>
            <CampoSoloLettura label="Quota da madre" value={quotaNascitaMadre != null ? formattaEuro(quotaNascitaMadre) : "—"} />
            <CampoSoloLettura label="Quota da padre" value={quotaNascitaPadre != null ? formattaEuro(quotaNascitaPadre) : "—"} />
            <CampoSoloLettura label="Totale valore di nascita" value={formattaEuro((quotaNascitaMadre || 0) + (quotaNascitaPadre || 0))} />
          </Griglia>
        </Sezione>
      )}

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
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 24, maxWidth: 800, width: "100%", marginTop: 20, marginBottom: 20 }}>
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
function Campo({ label, value, onChange, tipo = "text", placeholder }) {
  return (
    <label style={{ fontSize: 11, color: C.muted }}>
      {label}
      <input type={tipo} value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder}
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
