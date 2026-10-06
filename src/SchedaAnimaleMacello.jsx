import { useState, useEffect } from "react";
import { caricaRigheVendita, uscitaTrasferimento, eTrasferito } from "./venditeDaFatture";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro, formattaNumero, round2, fetchAllPages } from "./parsingUtils";
import { stimaPesoCarcassaPerEta } from "./motoreRiproduttori";
import { costoAnimale, eUscito, applicaNatiConLaMadre, applicaAcquistoDaLotto } from "./costoAnimale";

export default function SchedaAnimaleMacello({ animaleId, lottoId, unitaNr, onClose, onSalvato }) {
  const [caricando, setCaricando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState(null);

  const [soggetto, setSoggetto] = useState(null); // dati anagrafici uniformati (animale o unità di lotto)
  const [costiAnnuali, setCostiAnnuali] = useState([]);
  const [vendita, setVendita] = useState(null);
  const [trasferimento, setTrasferimento] = useState(null);
  const [pesoStimatoInfo, setPesoStimatoInfo] = useState(null);
  const [genitori, setGenitori] = useState({ madre: null, padre: null });
  const [form, setForm] = useState({});

  useEffect(() => { carica(); }, [animaleId, lottoId, unitaNr]);

  async function carica() {
    setCaricando(true);
    setErrore(null);
    try {
      let s;
      if (animaleId) {
        const { data: a, error } = await supabase.from("animali")
          .select("id,bdn,nome,specie,razza,razza_calcolata,sesso,provenienza,stato,nascita,data_ingresso,data_uscita,motivo_uscita,peso_carcassa,peso_vivo_uscita,costo_iniziale,prezzo_acquisto,madre_id,padre_id,note")
          .eq("id", animaleId).single();
        if (error) throw new Error(error.message);
        s = { ...a, identificativo: a.bdn || a.nome, razzaFinale: a.razza_calcolata || a.razza,
          prezzo_acquisto: a.provenienza === "Acquistato" ? (parseFloat(a.prezzo_acquisto) || 0) : 0 };
        // Capo passato a scheda individuale da un lotto comprato: vale la sua parte del lotto
        if (a.provenienza === "Acquistato") {
          const codice = (String(a.note || "").match(/da lotto .*?unit[aà]\s+([A-Z0-9]+)/i) || [])[1];
          const filtro = [a.bdn ? `bdn.eq.${a.bdn}` : null, codice ? `codice_completo.eq.${codice}` : null].filter(Boolean).join(",");
          if (filtro) {
            const { data: un } = await supabase.from("suini_lotto").select("id,lotto_id,nr,bdn,codice_completo,stato").eq("stato", "registrato_individuale").or(filtro);
            const u = (un || [])[0];
            if (u) {
              const { data: l } = await supabase.from("lotti_suini").select("id,codice_lotto,codice,tipo_provenienza,prezzo_acquisto").eq("id", u.lotto_id).maybeSingle();
              const { data: tutte } = await supabase.from("suini_lotto").select("id,lotto_id,nr,bdn,codice_completo,stato").eq("lotto_id", u.lotto_id);
              const x = l ? applicaAcquistoDaLotto([a], [l], tutte || [])[0] : null;
              if (x?.daLottoComprato) s = { ...s, prezzo_acquisto: x.prezzo_acquisto, provenienzaTesto: `Acquistato nel lotto ${x.daLottoComprato}: vale la sua parte del lotto (nell'app ${formattaEuro(x.prezzoAcquistoNellApp)})` };
            }
          }
        }
        // Vitello entrato con la madre: è un figlio della mandria (costo di nascita, acquisto zero)
        if (a.madre_id && a.provenienza !== "Nato in azienda") {
          const { data: m } = await supabase.from("animali").select("id,provenienza,data_ingresso,prezzo_acquisto").eq("id", a.madre_id).maybeSingle();
          if (m && applicaNatiConLaMadre([a, m]).find(x => x.id === a.id)?.natoConLaMadre) {
            s = { ...s, natoConLaMadre: true, prezzo_acquisto: 0, provenienza: "Nato in azienda", provenienzaTesto: "Entrato in azienda con la madre: è un figlio della mandria" };
          }
        }
        const ids = [a.madre_id, a.padre_id].filter(Boolean);
        if (ids.length) {
          const { data: g } = await supabase.from("animali").select("id,bdn,nome").in("id", ids);
          const nome = id => { const x = (g || []).find(y => y.id === id); return x ? (x.bdn || x.nome) : null; };
          setGenitori({ madre: nome(a.madre_id), padre: nome(a.padre_id) });
        }
      } else {
        const { data: u, error } = await supabase.from("suini_lotto")
          .select("id,lotto_id,nr,sesso,stato,data_uscita,motivo_uscita,peso_carcassa,peso_vivo_uscita,bdn,codice_completo")
          .eq("lotto_id", lottoId).eq("nr", unitaNr).single();
        if (error) throw new Error(error.message);
        const { data: lotto } = await supabase.from("lotti_suini").select("*").eq("id", lottoId).single();
        const { count: numeroUnitaLotto } = await supabase.from("suini_lotto").select("id", { count: "exact", head: true }).eq("lotto_id", lottoId);
        const acquistato = lotto?.tipo_provenienza === "acquistato";
        const prezzoAcquistoUnitario = acquistato && lotto?.prezzo_acquisto ? round2(lotto.prezzo_acquisto / (numeroUnitaLotto || 1)) : 0;
        s = { ...u, specie: lotto?.specie || "suino", razzaFinale: lotto?.razza_madre, provenienza: lotto?.tipo_provenienza === "acquistato" ? "Acquistato" : "Nato in azienda",
          nascita: lotto?.data_parto, identificativo: u.bdn || u.codice_completo || `${lotto?.codice_lotto || lotto?.codice} n. ${u.nr}`,
          costo_iniziale: null, prezzo_acquisto: prezzoAcquistoUnitario, prezzoAcquistoLottoTotale: acquistato ? lotto?.prezzo_acquisto : null, numeroUnitaLotto,
          fornitore: lotto?.fornitore, data_fattura: lotto?.data_fattura, numero_fattura: lotto?.numero_fattura };
      }
      setSoggetto(s);

      const { data: costi } = animaleId
        ? await supabase.from("ci_costo_animale_annuale").select("anno,uba_giorni,categoria_contabile,costo_mantenimento,costo_nascita_ereditato,costo_nascita_da_madre,costo_nascita_da_padre,quota_residuo_riproduttori,costo_totale_anno").eq("animale_id", animaleId).order("anno")
        : await supabase.from("ci_costo_animale_annuale").select("anno,uba_giorni,categoria_contabile,costo_mantenimento,costo_nascita_ereditato,costo_nascita_da_madre,costo_nascita_da_padre,quota_residuo_riproduttori,costo_totale_anno").eq("lotto_id", lottoId).eq("unita_nr", unitaNr).order("anno");
      setCostiAnnuali(costi || []);

      const { data: v } = animaleId
        ? await supabase.from("ci_dati_vendita_ingrasso").select("*").eq("animale_id", animaleId).maybeSingle()
        : await supabase.from("ci_dati_vendita_ingrasso").select("*").eq("lotto_id", lottoId).eq("unita_nr", unitaNr).maybeSingle();
      setVendita(v);
      setForm({ prezzo_vendita_kg_reale: v?.prezzo_vendita_kg_reale ?? "" });
      // Trasferito: venduto con fattura (incasso dalla fattura) o scambiato
      setTrasferimento(eTrasferito(s.stato) ? uscitaTrasferimento({ stato: s.stato, bdn: s.bdn }, await caricaRigheVendita()) : null);

      // Stima peso, solo se ancora attivo (non uscito) e con data di nascita nota
      const isUscito = eUscito(s.stato);
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

  const isUscito = eUscito(soggetto.stato);
  const costo = costoAnimale({ righe: costiAnnuali, costoAcquisto: soggetto.prezzo_acquisto || 0 });
  const costoTotale = costo.totale;
  const nascitaMadre = round2(costiAnnuali.reduce((t, c) => t + (parseFloat(c.costo_nascita_da_madre) || 0), 0));
  const nascitaPadre = round2(costiAnnuali.reduce((t, c) => t + (parseFloat(c.costo_nascita_da_padre) || 0), 0));

  // Giorni ed età: dalla nascita a oggi (se attivo) o alla data di uscita (se uscito)
  const dataRiferimentoEta = isUscito && soggetto.data_uscita ? new Date(soggetto.data_uscita) : new Date();
  const giorniVita = soggetto.nascita ? Math.round((dataRiferimentoEta - new Date(soggetto.nascita)) / 86400000) : null;
  const anniVita = giorniVita != null ? round2(giorniVita / 365.25) : null;

  // Periodo in azienda: dalla data di INGRESSO (non nascita) a oggi (attivi) o all'uscita (usciti)
  // Per i nati in azienda l'ingresso coincide con la nascita
  const dataIngresso = soggetto.data_ingresso || (soggetto.provenienza === "Nato in azienda" ? soggetto.nascita : null);
  const giorniInAzienda = dataIngresso ? Math.round((dataRiferimentoEta - new Date(dataIngresso)) / 86400000) : null;
  const mesiInAzienda = giorniInAzienda != null ? round2(giorniInAzienda / 30.44) : null;
  const costoAlGiorno = giorniVita > 0 ? round2(costoTotale / giorniVita) : null;

  const pesoVivo = soggetto.peso_vivo_uscita || null; // non c'è un "peso vivo attuale" tracciato per gli animali ancora in vita
  const costoAlKgVivo = pesoVivo ? round2(costoTotale / pesoVivo) : null;

  const pesoReale = soggetto.peso_carcassa;
  const pesoPerValore = pesoReale || pesoStimatoInfo?.pesoStimato || null;
  const valoreVendita = trasferimento?.incasso != null ? trasferimento.incasso
    : pesoPerValore && form.prezzo_vendita_kg_reale ? round2(pesoPerValore * parseFloat(form.prezzo_vendita_kg_reale)) : null;
  const margine = valoreVendita != null ? round2(valoreVendita - costoTotale) : null;
  const costoAlKgCarcassa = pesoPerValore ? round2(costoTotale / pesoPerValore) : null;

  return (
    <ModaleSfondo onClose={onClose}>
      <h2 style={{ color: C.primary, fontSize: 20, marginTop: 0 }}>Scheda Animale — {soggetto.identificativo}</h2>
      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}

      <Sezione titolo="Dati anagrafici">
        <Griglia>
          <CampoSoloLettura label="Matricola o codice" value={soggetto.identificativo || "—"} />
          <CampoSoloLettura label="Specie" value={soggetto.specie} />
          <CampoSoloLettura label="Razza" value={soggetto.razzaFinale || "—"} />
          <CampoSoloLettura label="Sesso" value={soggetto.sesso || "—"} />
          <CampoSoloLettura label="Provenienza" value={soggetto.provenienzaTesto || soggetto.provenienza || "—"} />
          <CampoSoloLettura label="Stato" value={soggetto.stato || "—"} />
          <CampoSoloLettura label="Data di nascita" value={soggetto.nascita || "—"} />
          <CampoSoloLettura label="Data di ingresso in azienda" value={dataIngresso || "—"} />
          {isUscito && <CampoSoloLettura label="Data di uscita" value={soggetto.data_uscita || "—"} />}
          {isUscito && <CampoSoloLettura label="Motivo di uscita" value={soggetto.motivo_uscita || "—"} />}
          {genitori.madre && <CampoSoloLettura label="Madre" value={genitori.madre} />}
          {genitori.padre && <CampoSoloLettura label="Padre" value={genitori.padre} />}
          <CampoSoloLettura label={isUscito ? "Età alla uscita" : "Età attuale"} value={anniVita != null ? `${anniVita} anni (${giorniVita} giorni)` : "—"} />
          <CampoSoloLettura label={isUscito ? "Periodo in azienda (fino all'uscita)" : "Periodo in azienda (ad oggi)"}
            value={giorniInAzienda != null ? `${giorniInAzienda} giorni (${mesiInAzienda} mesi)` : "—"} />
        </Griglia>
      </Sezione>

      <Sezione titolo="Costo">
        <Griglia>
          {soggetto.provenienza === "Acquistato"
            ? <CampoSoloLettura label="Costo di acquisto" value={formattaEuro(costo.costoAcquisto)} />
            : <CampoSoloLettura label="Costo di nascita (dalla mandria dell'anno di nascita)" value={`${formattaEuro(costo.costoNascita)} (madri ${formattaEuro(nascitaMadre)}, padri ${formattaEuro(nascitaPadre)})`} />}
          <CampoSoloLettura label="Mantenimento di tutti gli anni" value={formattaEuro(costo.mantenimento)} />
          <CampoSoloLettura label="Costo rimasto di riproduttori usciti" value={costo.costoRimastoRicevuto > 0 ? formattaEuro(costo.costoRimastoRicevuto) : "—"} />
          <CampoSoloLettura label={isUscito ? "Costo totale" : "Costo totale ad oggi"} value={formattaEuro(costoTotale)} />
          <CampoSoloLettura label="Costo al giorno di vita" value={costoAlGiorno != null ? formattaEuro(costoAlGiorno, 3) : "—"} />
        </Griglia>
        {soggetto.prezzoAcquistoLottoTotale != null && (
          <p style={{ fontSize: 11, color: C.muted, marginTop: 6, marginBottom: 0 }}>
            Prezzo del lotto: {formattaEuro(soggetto.prezzoAcquistoLottoTotale)} ÷ {soggetto.numeroUnitaLotto} suinetti = {formattaEuro(costo.costoAcquisto)} a capo.
          </p>
        )}
      </Sezione>

      <Sezione titolo="Costo anno per anno">
        {costiAnnuali.length === 0 ? <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>— Nessun costo calcolato (fare il Report Costi degli anni in cui è stato in azienda).</p> : (
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.bg }}>
                <th style={cella}>Anno</th><th style={cellaD}>UBA-giorni</th><th style={cellaD}>Mantenimento</th><th style={cellaD}>Costo di nascita</th>
                <th style={cellaD}>Costo rimasto di riproduttori usciti</th><th style={cellaD}>Totale dell'anno</th>
              </tr>
            </thead>
            <tbody>
              {costiAnnuali.map(c => (
                <tr key={c.anno} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={cella}>{c.anno}</td>
                  <td style={cellaD}>{formattaNumero(parseFloat(c.uba_giorni) || 0, 1)}</td>
                  <td style={cellaD}>{c.categoria_contabile === "IMPRODUTTIVO_USCITO"
                    ? <span style={{ fontSize: 11, color: C.muted }}>animale morto: costo dell'anno spalmato sugli altri capi</span>
                    : formattaEuro(parseFloat(c.costo_mantenimento) || 0)}</td>
                  <td style={cellaD}>{parseFloat(c.costo_nascita_ereditato) ? formattaEuro(parseFloat(c.costo_nascita_ereditato)) : "—"}</td>
                  <td style={{ ...cellaD, ...(parseFloat(c.quota_residuo_riproduttori) > 0 ? { background: "#FDE2D3", color: "#A0440E" } : {}) }}>{parseFloat(c.quota_residuo_riproduttori) > 0 ? formattaEuro(parseFloat(c.quota_residuo_riproduttori)) : "—"}</td>
                  <td style={{ ...cellaD, fontWeight: 700 }}>{formattaEuro(round2((parseFloat(c.costo_mantenimento) || 0) + (parseFloat(c.costo_nascita_ereditato) || 0) + (parseFloat(c.quota_residuo_riproduttori) || 0)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

      {trasferimento && (
        <div style={{ background: trasferimento.tipo === "vendita" ? "#E3F1E4" : "#FDE2D3", color: trasferimento.tipo === "vendita" ? C.green : "#A0440E",
          borderRadius: 10, padding: "10px 14px", margin: "10px 0", fontSize: 13, fontWeight: 700 }}>
          {trasferimento.testo}
        </div>
      )}

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

const cella = { padding: "4px 8px", textAlign: "left" };
const cellaD = { padding: "4px 8px", textAlign: "right" };

function ModaleSfondo({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24, overflowY: "auto", zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 24, maxWidth: 820, width: "100%", marginTop: 20, marginBottom: 20 }}>
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
