import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro, formattaNumero, round2, fetchAllPages } from "./parsingUtils";
import {
  stimaPesoCarcassaPerEta, stimaFigliFuturi,
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
  const [tuttiScarichi, setTuttiScarichi] = useState([]);
  const [quotaNascitaMadre, setQuotaNascitaMadre] = useState(null);
  const [quotaNascitaPadre, setQuotaNascitaPadre] = useState(null);
  const [figliInfo, setFigliInfo] = useState(null);
  const [pesoStimatoInfo, setPesoStimatoInfo] = useState(null);
  const [vitaStandard, setVitaStandard] = useState(null);

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
      {
        const chiaveVita = `vita_produttiva_attesa_${a.specie === "bovino" ? "bovini" : a.specie === "suino" ? "suini" : "ovini"}`;
        const { data: pv } = await supabase.from("ci_parametri").select("valore").eq("chiave", chiaveVita).maybeSingle();
        setVitaStandard(pv ? parseFloat(pv.valore) : null);
      }
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
        const { data: scarichi } = await supabase.from("ci_scarico_riproduttore_annuale").select("*").eq("residuo_riproduttore_id", res.id).order("anno", { ascending: false });
        setTuttiScarichi(scarichi || []);
      }

      // Se nato in azienda: costo di nascita dalla sua riga di costo dell'anno di nascita
      // (parte delle madri e parte dei padri della mandria di quell'anno)
      if (a.provenienza === "Nato in azienda" && a.nascita) {
        const { data: rigaNascita } = await supabase.from("ci_costo_animale_annuale").select("costo_nascita_da_madre, costo_nascita_da_padre")
          .eq("animale_id", animaleId).eq("anno", new Date(a.nascita).getFullYear()).maybeSingle();
        setQuotaNascitaMadre(rigaNascita ? parseFloat(rigaNascita.costo_nascita_da_madre) || 0 : null);
        setQuotaNascitaPadre(rigaNascita ? parseFloat(rigaNascita.costo_nascita_da_padre) || 0 : null);
      }

      // Figli avuti/potenziali (solo se è un riproduttore con residuo calcolato)
      if (res) {
        const [{ data: tuttiAnimali }, { data: tuttiLotti }, { data: tutteUnita }, { data: righeMandria }] = await Promise.all([
          fetchAllPages((da, r) => supabase.from("animali").select("id,padre_id,madre_id,nascita,specie,razza,razza_calcolata,sesso,stato,data_uscita,peso_carcassa").range(da, r)),
          fetchAllPages((da, r) => supabase.from("lotti_suini").select("id,padre_id,madre_id,data_parto,tipo_provenienza").range(da, r)),
          fetchAllPages((da, r) => supabase.from("suini_lotto").select("id,lotto_id,stato").range(da, r)),
          supabase.from("ci_costo_nascita_mandria").select("anno,nati").eq("specie", a.specie),
        ]);
        const natiMandria = Object.fromEntries((righeMandria || []).map(m => [m.anno, m.nati]));

        // Peso carcassa: se già uscito mostriamo il reale (gestito altrove), se ancora
        // attivo stimiamo statisticamente dai macellati storici della stessa specie/razza/
        // sesso, a un'età simile alla sua — stesso motore usato nell'Import Massivo.
        if ((!a.stato || a.stato === "attivo") && a.nascita) {
          const etaAnni = (new Date() - new Date(a.nascita)) / (365.25 * 86400000);
          const stima = stimaPesoCarcassaPerEta({ specie: a.specie, razza: a.razza_calcolata || a.razza, sesso: a.sesso, etaAnniAnimale: etaAnni, animaliUsciti: tuttiAnimali || [] });
          setPesoStimatoInfo(stima.pesoStimato != null ? stima : null);
        }

        // Per un animale già uscito (macellato/venduto/deceduto) non ha senso proiettare
        // figli futuri — non è più produttivo, quindi gli anni residui sono azzerati:
        // "figli avuti" resterà il conteggio reale, "figli futuri stimati" sarà sempre 0.
        const isUscito = a.stato && a.stato !== "attivo";
        const anniProduttiviResidui = isUscito ? 0 : res.vita_produttiva_attesa_anni - (new Date().getFullYear() - (res.anno_inizio_riproduzione ?? new Date().getFullYear()));
        // Figli per anno, ognuno contato una volta: capi con matricola nati in azienda
        // + suinetti dei suoi lotti non ancora passati a matricola
        const conteggio = {};
        (tuttiAnimali || []).filter(x => (x.padre_id === animaleId || x.madre_id === animaleId) && x.nascita).forEach(x => {
          const y = new Date(x.nascita).getFullYear(); conteggio[y] = (conteggio[y] || 0) + 1;
        });
        const lottiSuoi = new Map((tuttiLotti || []).filter(l => (l.padre_id === animaleId || l.madre_id === animaleId) && l.data_parto && l.tipo_provenienza !== "acquistato").map(l => [l.id, l]));
        (tutteUnita || []).filter(u => lottiSuoi.has(u.lotto_id) && u.stato !== "registrato_individuale").forEach(u => {
          const y = new Date(lottiSuoi.get(u.lotto_id).data_parto).getFullYear(); conteggio[y] = (conteggio[y] || 0) + 1;
        });
        const annoCorrente = new Date().getFullYear();
        const stima = stimaFigliFuturi({ conteggioPerAnno: conteggio, annoCorrente, uscito: isUscito, anniProduttiviResidui });
        const ultimoAnno = annoCorrente - 1;
        setFigliInfo({ ...stima, conteggio, anniProduttiviResidui: Math.max(anniProduttiviResidui, 0),
          quotaMandria: natiMandria[ultimoAnno] ? { anno: ultimoAnno, suoi: conteggio[ultimoAnno] || 0, nati: natiMandria[ultimoAnno] } : null });
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
        // Vita produttiva: se è uguale allo standard di Parametri torna «standard» (seguirà lo
        // standard anche se cambia); se è diversa diventa la correzione di questo capo.
        const vitaInserita = parseFloat(form.vita_produttiva_attesa_anni);
        if (!Number.isFinite(vitaInserita) || vitaInserita < 1) throw new Error("La vita produttiva attesa deve essere di almeno 1 anno.");
        await supabase.from("ci_residuo_riproduttore").update({
          vita_produttiva_attesa_anni: vitaInserita,
          vita_produttiva_personalizzata: vitaStandard == null ? true : vitaInserita !== vitaStandard,
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
  const pesoPerRealizzo = animale.peso_carcassa || pesoStimatoInfo?.pesoStimato || null;
  const valoreRealizzoReale = pesoPerRealizzo && form.prezzo_vendita_kg_carcassa_reale
    ? round2(pesoPerRealizzo * parseFloat(form.prezzo_vendita_kg_carcassa_reale)) : null;


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
              <CampoSoloLettura label="Standard della specie (Parametri)" value={vitaStandard != null ? `${vitaStandard} anni` : "—"} />
              <CampoSoloLettura label="Valore usato per questo capo"
                value={residuo.vita_produttiva_personalizzata ? `Personalizzato: ${residuo.vita_produttiva_attesa_anni} anni (corretto caso per caso)` : `Standard: ${residuo.vita_produttiva_attesa_anni} anni`} />
            </Griglia>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
              Scrivendo un numero diverso dallo standard e salvando, il capo tiene la sua correzione; scrivendo lo stesso numero dello standard torna a seguire lo standard. Vale dal prossimo «Calcola e scarica sui figli».
            </p>
          </Sezione>

          {figliInfo && (
            <Sezione titolo="Figli">
              <Griglia>
                <CampoSoloLettura label="Figli avuti finora" value={figliInfo.figliAvuti} />
                <CampoSoloLettura label={`Figli all'anno (${figliInfo.anniUsati.join(" e ")})`} value={`${formattaNumero(figliInfo.figliAllAnno, 1)}${figliInfo.stimaDebole ? " — stima debole: un solo anno, non ancora completo" : ""}`} />
                <CampoSoloLettura label="Anni di carriera che restano" value={figliInfo.anniProduttiviResidui} />
                <CampoSoloLettura label="Figli futuri stimati" value={figliInfo.figliFuturiStimati} />
                {figliInfo.quotaMandria && (
                  <CampoSoloLettura label={`Nati del ${figliInfo.quotaMandria.anno} avuti da questo capo`}
                    value={`${figliInfo.quotaMandria.suoi} su ${figliInfo.quotaMandria.nati} della specie (${formattaNumero(figliInfo.quotaMandria.suoi / figliInfo.quotaMandria.nati * 100, 0)}%)`} />
                )}
              </Griglia>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                Figli per anno: {Object.entries(figliInfo.conteggio).sort().map(([y, n]) => `${y}: ${n}`).join(" · ") || "nessuno"}. Figli all'anno = media delle ultime due annate complete; figli futuri = anni che restano × figli all'anno.
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
              <CampoSoloLettura label="Peso carcassa (kg)"
                value={animale.peso_carcassa
                  ? `${animale.peso_carcassa} (reale)`
                  : pesoStimatoInfo ? `${pesoStimatoInfo.pesoStimato} stimato (${pesoStimatoInfo.fonteStima}, n=${pesoStimatoInfo.campioneUsato})` : "—"} />
              <Campo label="Prezzo vendita €/kg carcassa" tipo="number" value={form.prezzo_vendita_kg_carcassa_reale} onChange={v => setForm(p => ({ ...p, prezzo_vendita_kg_carcassa_reale: v }))} />
              <CampoSoloLettura label="Valore di realizzo con questo prezzo" value={valoreRealizzoReale != null ? `${formattaEuro(valoreRealizzoReale)}${!animale.peso_carcassa ? " (su peso stimato)" : ""}` : "— (serve peso carcassa e prezzo)"} />
              {residuo && <CampoSoloLettura label="Valore di realizzo stimato usato nel calcolo del residuo" value={formattaEuro(residuo.valore_realizzo_stimato)} />}
              {residuo && (() => { const ecc = Math.max(0, (Number(residuo.valore_realizzo_stimato) || 0) - (Number(residuo.costo_acquisto) || 0) - (Number(residuo.costi_crescita_preriproduttiva) || 0));
                return ecc > 0 ? <CampoSoloLettura label="⚠️ Eccedenza di realizzo non usata" value={`${formattaEuro(ecc)} — supera costo di partenza + crescita: non riduce il costo passato ai figli`} /> : null; })()}
            </Griglia>
          </Sezione>

          <Sezione titolo="Costo messo ogni anno nella mandria (mantenimento + quota annua del costo iniziale)">
            {tuttiScarichi.length === 0 ? (
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>— Non ancora elaborato (usa "Calcola e scarica sui figli" in Report Riproduttori).</p>
            ) : (
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    <th style={{ padding: "4px 8px", textAlign: "left" }}>Anno</th>
                    <th style={{ padding: "4px 8px", textAlign: "right" }}>Figli suoi nell'anno</th>
                    <th style={{ padding: "4px 8px", textAlign: "right" }}>Costo messo nella mandria</th>
                    <th style={{ padding: "4px 8px", textAlign: "right" }}>Costo di nascita di ogni nato dell'anno</th>
                  </tr>
                </thead>
                <tbody>
                  {tuttiScarichi.map(s => (
                    <tr key={s.anno} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "4px 8px" }}>{s.anno}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: s.n_figli_anno === 0 ? C.accent : C.text, fontWeight: s.n_figli_anno === 0 ? 700 : 400 }}>{s.n_figli_anno === 0 ? "nessuno" : s.n_figli_anno}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>{formattaEuro(s.totale_scaricato_anno)}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700 }}>{s.quota_per_figlio ? formattaEuro(s.quota_per_figlio) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Sezione>

          {residuo.residuo_uscita_anno != null && (
            <Sezione titolo="🔶 Costo rimasto all'uscita">
              <Griglia>
                <CampoSoloLettura label="Costo non ancora passato ai figli il giorno dell'uscita" value={formattaEuro(residuo.residuo_all_uscita)} />
                <CampoSoloLettura label="Valore di realizzo reale" value={residuo.valore_realizzo_reale != null ? formattaEuro(residuo.valore_realizzo_reale) : "non disponibile"} />
                <CampoSoloLettura label="Come è calcolato il realizzo reale" value={residuo.realizzo_reale_fonte || "—"} />
                <CampoSoloLettura label="Conguaglio (realizzo stimato usato meno realizzo reale)" value={formattaEuro(residuo.conguaglio_uscita || 0)} />
                <CampoSoloLettura label="Totale passato all'uscita" value={formattaEuro(round2((Number(residuo.residuo_all_uscita) || 0) + (Number(residuo.conguaglio_uscita) || 0)))} />
                <CampoSoloLettura label="Anno di uscita" value={residuo.residuo_uscita_anno} />
                <CampoSoloLettura label="Dove è andato" value={residuo.residuo_uscita_destinazione || "—"} />
              </Griglia>
            </Sezione>
          )}

        </>
      )}

      {animale.provenienza === "Nato in azienda" && (
        <Sezione titolo="Costo di nascita (dalla mandria dell'anno di nascita)">
          <Griglia>
            <CampoSoloLettura label="Parte delle madri" value={quotaNascitaMadre != null ? formattaEuro(quotaNascitaMadre) : "—"} />
            <CampoSoloLettura label="Parte dei padri" value={quotaNascitaPadre != null ? formattaEuro(quotaNascitaPadre) : "—"} />
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
