import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { C } from "./style";
import { formattaEuro, formattaNumero, round2, fetchAllPages } from "./parsingUtils";
import { allocaCostiPerSpecie, MAPPA_SPECIE } from "./calcoloAllocazioneSpecie";

const ETICHETTE = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };
const ANNO_CORRENTE = new Date().getFullYear();

export default function BreakEven() {
  const [anno, setAnno] = useState(ANNO_CORRENTE);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);
  const [dati, setDati] = useState(null); // { bovino: {...}, suino: {...}, ovino: {...} }
  const [prezziVendita, setPrezziVendita] = useState({ bovino: "", suino: "", ovino: "" });

  useEffect(() => { carica(); }, [anno]);

  async function carica() {
    setCaricando(true);
    setErrore(null);
    try {
      // Righe UBA-giorno dell'anno — stessa fonte di ReportCosti.jsx
      const { data: righeUba, error: eUba } = await fetchAllPages((da, a) => supabase
        .from("ci_report_uba_animale").select("specie,uba_giorni,categoria_contabile,animale_id")
        .eq("anno", anno).range(da, a));
      if (eUba) throw new Error(`Errore UBA-giorni: ${eUba.message}`);

      // Articoli fattura dell'anno, con tipo_costo — per separare Fisso da Variabile
      const { data: fattureAnno, error: eF } = await supabase.from("ci_fatture").select("id").gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`);
      if (eF) throw new Error(`Errore fatture: ${eF.message}`);
      const idFattureAnno = (fattureAnno || []).map(f => f.id);
      let articoli = [];
      if (idFattureAnno.length > 0) {
        const { data, error: eA } = await fetchAllPages((da, a) => supabase.from("ci_articoli_fattura")
          .select("totale_riga,tipo_costo,destinazione,area").in("fattura_id", idFattureAnno).in("tipo_costo", ["Fisso", "Variabile"]).range(da, a));
        if (eA) throw new Error(`Errore articoli: ${eA.message}`);
        articoli = data || [];
      }
      const { data: costiDiretti, error: eCD } = await fetchAllPages((da, a) => supabase.from("ci_costi_diretti")
        .select("importo,tipo_costo,destinazione,area").gte("data", `${anno}-01-01`).lte("data", `${anno}-12-31`).in("tipo_costo", ["Fisso", "Variabile"]).range(da, a));
      if (eCD) throw new Error(`Errore costi diretti: ${eCD.message}`);
      const costiDirettiNorm = (costiDiretti || []).map(c => ({ ...c, totale_riga: parseFloat(c.importo) || 0 }));

      // Ammortamenti dell'anno (sempre Fisso) — stessa logica di ReportCosti.jsx
      const { data: cespiti, error: eC } = await supabase.from("ci_cespiti").select("id, specie");
      if (eC) throw new Error(`Errore cespiti: ${eC.message}`);
      const mappaCespiteSpecie = new Map((cespiti || []).map(c => [c.id, c.specie || []]));
      const idCespitiValidi = (cespiti || []).filter(c => c.specie && c.specie.length > 0).map(c => c.id);
      let quoteAmmortamento = [];
      if (idCespitiValidi.length > 0) {
        const { data: quote, error: eQ } = await supabase.from("ci_cespiti_ammortamento").select("quota,cespite_id").eq("anno", anno).in("cespite_id", idCespitiValidi);
        if (eQ) throw new Error(`Errore ammortamenti: ${eQ.message}`);
        quoteAmmortamento = (quote || []).map(q => {
          const specieCespite = mappaCespiteSpecie.get(q.cespite_id) || [];
          const specieMatch = Object.entries(MAPPA_SPECIE).find(([, v]) => specieCespite.includes(v));
          return { totale_riga: parseFloat(q.quota) || 0, destinazione: specieMatch ? specieMatch[1] : "", area: "" };
        });
      }

      const tuttiFissi = [...articoli.filter(a => a.tipo_costo === "Fisso"), ...costiDirettiNorm.filter(c => c.tipo_costo === "Fisso"), ...quoteAmmortamento];
      const tuttiVariabili = [...articoli.filter(a => a.tipo_costo === "Variabile"), ...costiDirettiNorm.filter(c => c.tipo_costo === "Variabile")];

      const perSpecieFissi = allocaCostiPerSpecie(tuttiFissi, righeUba || []);
      const perSpecieVariabili = allocaCostiPerSpecie(tuttiVariabili, righeUba || []);

      // Peso carcassa medio e prezzo di vendita medio REALE, per specie, dagli animali
      // MACELLATI (non venduti/deceduti/altro) quest'anno con dati completi — usati come
      // default modificabile.
      const { data: usciti, error: eU } = await fetchAllPages((da, a) => supabase.from("animali")
        .select("specie,peso_carcassa,id").eq("stato", "macellato").not("peso_carcassa", "is", null)
        .gte("data_uscita", `${anno}-01-01`).lte("data_uscita", `${anno}-12-31`).range(da, a));
      if (eU) throw new Error(`Errore animali usciti: ${eU.message}`);

      // Suinetti nei lotti macellati quest'anno — mancavano dal conteggio "capi usciti",
      // che guardava solo la tabella animali (segnalato da Filippo: il numero sembrava troppo
      // basso per i suini, dove la maggior parte sono in lotti, non animali individuali).
      const { data: unitaLottoAnno } = await fetchAllPages((da, a) => supabase.from("suini_lotto")
        .select("id").eq("stato", "macellato")
        .gte("data_uscita", `${anno}-01-01`).lte("data_uscita", `${anno}-12-31`).range(da, a));
      const numeroSuiniLottoMacellatiAnno = (unitaLottoAnno || []).length;

      const { data: venditeIngrasso } = await supabase.from("ci_dati_vendita_ingrasso").select("animale_id,prezzo_vendita_kg_reale");
      const mappaVendite = new Map((venditeIngrasso || []).filter(v => v.animale_id).map(v => [v.animale_id, parseFloat(v.prezzo_vendita_kg_reale) || null]));

      const pesoMedioPerSpecie = {}, prezzoMedioPerSpecie = {};
      ["bovino", "suino", "ovino"].forEach(sp => {
        const animaliSp = (usciti || []).filter(a => a.specie === sp && a.peso_carcassa > 0);
        pesoMedioPerSpecie[sp] = animaliSp.length > 0 ? round2(animaliSp.reduce((s, a) => s + a.peso_carcassa, 0) / animaliSp.length) : null;
        const prezziNoti = animaliSp.map(a => mappaVendite.get(a.id)).filter(p => p != null && p > 0);
        prezzoMedioPerSpecie[sp] = prezziNoti.length > 0 ? round2(prezziNoti.reduce((s, p) => s + p, 0) / prezziNoti.length) : null;
      });

      // Per i bovini specificamente: "bovino adulto" = macellato tra 12 e 24 mesi di età —
      // presi su TUTTI gli anni (non solo quello selezionato, campione più robusto), peso
      // medio maschi+femmine insieme. Sostituisce il peso/anno per il solo bovino, e aggiunge
      // il costo di nascita medio e il costo totale medio di questo stesso gruppo, come
      // riferimento — richiesto da Filippo per rendere la break even più realistica.
      const { data: tuttiBoviniUsciti, error: eB } = await fetchAllPages((da, a) => supabase.from("animali")
        .select("id,nascita,data_uscita,peso_carcassa").eq("specie", "bovino").eq("stato", "macellato")
        .not("peso_carcassa", "is", null).not("nascita", "is", null).not("data_uscita", "is", null).range(da, a));
      if (eB) throw new Error(`Errore bovini storici: ${eB.message}`);

      const { data: tuttiCostiAnimale } = await fetchAllPages((da, a) => supabase.from("ci_costo_animale_annuale")
        .select("animale_id,lotto_id,unita_nr,costo_totale_anno,costo_nascita_ereditato").range(da, a));
      const costiBovini = tuttiCostiAnimale; // stesso dataset, riusato anche per i suini più sotto
      const costoTotalePerAnimale = new Map(), costoNascitaPerAnimale = new Map();
      (costiBovini || []).forEach(c => {
        costoTotalePerAnimale.set(c.animale_id, (costoTotalePerAnimale.get(c.animale_id) || 0) + (parseFloat(c.costo_totale_anno) || 0));
        const nascitaVal = parseFloat(c.costo_nascita_ereditato) || 0;
        if (nascitaVal > 0) costoNascitaPerAnimale.set(c.animale_id, nascitaVal);
      });

      const boviniAdulti = (tuttiBoviniUsciti || []).filter(a => {
        const etaMesi = (new Date(a.data_uscita) - new Date(a.nascita)) / (30.44 * 86400000);
        return etaMesi >= 12 && etaMesi <= 24 && a.peso_carcassa > 0;
      });
      const pesoMedioBovinoAdulto = boviniAdulti.length > 0 ? round2(boviniAdulti.reduce((s, a) => s + a.peso_carcassa, 0) / boviniAdulti.length) : null;
      const costiTotaliNoti = boviniAdulti.map(a => costoTotalePerAnimale.get(a.id)).filter(c => c != null && c > 0);
      const costoTotaleMedioBovinoAdulto = costiTotaliNoti.length > 0 ? round2(costiTotaliNoti.reduce((s, c) => s + c, 0) / costiTotaliNoti.length) : null;
      const costiNascitaNoti = boviniAdulti.map(a => costoNascitaPerAnimale.get(a.id)).filter(c => c != null && c > 0);
      const costoNascitaMedioBovinoAdulto = costiNascitaNoti.length > 0 ? round2(costiNascitaNoti.reduce((s, c) => s + c, 0) / costiNascitaNoti.length) : null;
      if (pesoMedioBovinoAdulto != null) pesoMedioPerSpecie.bovino = pesoMedioBovinoAdulto;

      // Stesso principio per i suini, ma sul PESO VIVO (non l'età): "suino campione" = uscito
      // con peso vivo oltre 130kg — includendo sia gli animali individuali sia i suinetti nei
      // lotti (suini_lotto), che sono la maggioranza dei suini dell'azienda.
      const { data: suiniIndividuali, error: eSI } = await fetchAllPages((da, a) => supabase.from("animali")
        .select("id,peso_carcassa,peso_vivo_uscita,riproduttore").eq("specie", "suino").eq("stato", "macellato")
        .not("peso_carcassa", "is", null).not("peso_vivo_uscita", "is", null).range(da, a));
      if (eSI) throw new Error(`Errore suini individuali: ${eSI.message}`);

      // Per capire quali riproduttori suini non hanno mai avuto figli — servono sia i figli
      // registrati come "animali" (padre_id/madre_id) sia quelli nati in un lotto
      // (lotti_suini.padre_id/madre_id) — un riproduttore suino può comparire in entrambi.
      const { data: tuttiSuiniConGenitori } = await fetchAllPages((da, a) => supabase.from("animali")
        .select("padre_id,madre_id").eq("specie", "suino").range(da, a));
      const { data: lottiConGenitori } = await supabase.from("lotti_suini").select("padre_id,madre_id");
      const idConFigli = new Set();
      (tuttiSuiniConGenitori || []).forEach(f => { if (f.padre_id) idConFigli.add(f.padre_id); if (f.madre_id) idConFigli.add(f.madre_id); });
      (lottiConGenitori || []).forEach(l => { if (l.padre_id) idConFigli.add(l.padre_id); if (l.madre_id) idConFigli.add(l.madre_id); });
      const { data: unitaLotto, error: eUL } = await fetchAllPages((da, a) => supabase.from("suini_lotto")
        .select("id,lotto_id,nr,peso_carcassa,peso_vivo_uscita").eq("stato", "macellato")
        .not("peso_carcassa", "is", null).not("peso_vivo_uscita", "is", null).range(da, a));
      if (eUL) throw new Error(`Errore suinetti lotto: ${eUL.message}`);

      const costoTotalePerUnita = new Map();
      (costiBovini || []).forEach(c => {
        if (c.lotto_id != null && c.unita_nr != null) {
          costoTotalePerUnita.set(`${c.lotto_id}|${c.unita_nr}`, (costoTotalePerUnita.get(`${c.lotto_id}|${c.unita_nr}`) || 0) + (parseFloat(c.costo_totale_anno) || 0));
        }
      });

      const suiniCampioneIndividuali = (suiniIndividuali || []).filter(a =>
        a.peso_vivo_uscita > 130 && a.peso_carcassa > 0 && !(a.riproduttore && !idConFigli.has(a.id))
      );
      const suiniCampioneLotto = (unitaLotto || []).filter(u => u.peso_vivo_uscita > 130 && u.peso_carcassa > 0);
      const pesiCampioneSuino = [...suiniCampioneIndividuali.map(a => a.peso_carcassa), ...suiniCampioneLotto.map(u => u.peso_carcassa)];
      const pesoMedioSuinoCampione = pesiCampioneSuino.length > 0 ? round2(pesiCampioneSuino.reduce((s, p) => s + p, 0) / pesiCampioneSuino.length) : null;
      const costiCampioneSuino = [
        ...suiniCampioneIndividuali.map(a => costoTotalePerAnimale.get(a.id)).filter(c => c != null && c > 0),
        ...suiniCampioneLotto.map(u => costoTotalePerUnita.get(`${u.lotto_id}|${u.nr}`)).filter(c => c != null && c > 0),
      ];
      const costoTotaleMedioSuinoCampione = costiCampioneSuino.length > 0 ? round2(costiCampioneSuino.reduce((s, c) => s + c, 0) / costiCampioneSuino.length) : null;
      const numeroSuiniCampione = pesiCampioneSuino.length;
      if (pesoMedioSuinoCampione != null) pesoMedioPerSpecie.suino = pesoMedioSuinoCampione;

      const risultato = {};
      ["bovino", "suino", "ovino"].forEach(sp => {
        const numeroCapiAnno = (usciti || []).filter(a => a.specie === sp).length + (sp === "suino" ? numeroSuiniLottoMacellatiAnno : 0);
        const ubaGiorniProduttivi = perSpecieVariabili[sp].ubaGiorniProduttivi;
        // UBA-giorni medio per capo in un anno intero (365) — usato per "annualizzare" il
        // costo variabile per UBA-giorno in un costo variabile medio per capo.
        const costoVariabilePerCapoAnnuo = round2(perSpecieVariabili[sp].perUbaGiorno * 365);
        risultato[sp] = {
          costiFissiTotali: perSpecieFissi[sp].totale,
          costiVariabiliTotali: perSpecieVariabili[sp].totale,
          ubaGiorniProduttivi,
          costoVariabilePerCapoAnnuo,
          pesoMedioCarcassa: pesoMedioPerSpecie[sp],
          prezzoVenditaMedioReale: prezzoMedioPerSpecie[sp],
          numeroCapiUscitiAnno: numeroCapiAnno,
          ...(sp === "bovino" ? {
            numeroBoviniAdulti: boviniAdulti.length,
            costoTotaleMedioBovinoAdulto,
            costoNascitaMedioBovinoAdulto,
          } : {}),
          ...(sp === "suino" ? {
            numeroSuiniCampione,
            costoTotaleMedioSuinoCampione,
          } : {}),
        };
      });

      setDati(risultato);
      setPrezziVendita({
        bovino: risultato.bovino.prezzoVenditaMedioReale ?? "",
        suino: risultato.suino.prezzoVenditaMedioReale ?? "",
        ovino: risultato.ovino.prezzoVenditaMedioReale ?? "",
      });
    } catch (err) {
      setErrore(err.message);
    }
    setCaricando(false);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Break Even Analysis</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Punto di pareggio per specie: numero di capi da vendere a carcassa perché i ricavi coprano i costi fissi e variabili dell'anno. Il prezzo di vendita è modificabile — prova diversi scenari.
      </p>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Anno:
          <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value) || ANNO_CORRENTE)}
            style={{ marginLeft: 8, width: 90, padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }} />
        </label>
      </div>

      {errore && <p style={{ color: C.red }}>⚠️ {errore}</p>}
      {caricando ? <p style={{ color: C.muted }}>Caricamento...</p> : dati && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {["bovino", "suino", "ovino"].map(sp => {
            const d = dati[sp];
            if (d.costiFissiTotali === 0 && d.costiVariabiliTotali === 0 && d.numeroCapiUscitiAnno === 0) return null;
            const prezzoInput = prezziVendita[sp];
            const prezzo = parseFloat(prezzoInput) || 0;
            const pesoMedio = d.pesoMedioCarcassa;
            const ricavoPerCapo = pesoMedio ? round2(prezzo * pesoMedio) : null;
            const margineContribuzionePerCapo = ricavoPerCapo != null ? round2(ricavoPerCapo - d.costoVariabilePerCapoAnnuo) : null;
            const puntoPareggio = margineContribuzionePerCapo != null && margineContribuzionePerCapo > 0
              ? Math.ceil(d.costiFissiTotali / margineContribuzionePerCapo) : null;

            return (
              <div key={sp} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                <h2 style={{ fontSize: 18, color: C.primary, marginTop: 0, marginBottom: 12 }}>{ETICHETTE[sp]}</h2>
                {sp === "bovino" && d.numeroBoviniAdulti > 0 && (
                  <div style={{ background: C.primaryLight + "18", border: `1px solid ${C.primaryLight}`, borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 12 }}>
                    <strong>Riferimento "bovino adulto"</strong> (macellati tra 12 e 24 mesi, tutti gli anni, M+F insieme — {d.numeroBoviniAdulti} capi):
                    {" "}peso {formattaNumero(d.pesoMedioCarcassa, 1)} kg
                    {d.costoTotaleMedioBovinoAdulto != null && ` · costo totale medio ${formattaEuro(d.costoTotaleMedioBovinoAdulto)}`}
                    {d.costoNascitaMedioBovinoAdulto != null && ` · costo di nascita medio ${formattaEuro(d.costoNascitaMedioBovinoAdulto)}`}
                  </div>
                )}
                {sp === "suino" && d.numeroSuiniCampione > 0 && (
                  <div style={{ background: C.primaryLight + "18", border: `1px solid ${C.primaryLight}`, borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 12 }}>
                    <strong>Riferimento "suino campione"</strong> (usciti con peso vivo oltre 130 kg, tutti gli anni, animali e suinetti nei lotti insieme, esclusi i riproduttori mai diventati genitori — {d.numeroSuiniCampione} capi):
                    {" "}peso carcassa {formattaNumero(d.pesoMedioCarcassa, 1)} kg
                    {d.costoTotaleMedioSuinoCampione != null && ` · costo totale medio ${formattaEuro(d.costoTotaleMedioSuinoCampione)}`}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
                  <CampoInfo label="Costi fissi totali (incl. ammortamenti)" value={formattaEuro(d.costiFissiTotali)} />
                  <CampoInfo label="Costi variabili totali" value={formattaEuro(d.costiVariabiliTotali)} />
                  <CampoInfo label="UBA-giorni produttivi" value={formattaNumero(d.ubaGiorniProduttivi, 0)} />
                  <CampoInfo label="Costo variabile medio/capo (annuo)" value={formattaEuro(d.costoVariabilePerCapoAnnuo)} />
                  <CampoInfo label="Peso carcassa medio (usciti quest'anno)" value={pesoMedio ? `${formattaNumero(pesoMedio, 1)} kg` : "— nessun dato"} />
                  <CampoInfo label="Capi macellati quest'anno" value={d.numeroCapiUscitiAnno} />
                </div>

                <div style={{ background: C.bg, borderRadius: 10, padding: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>
                    Prezzo di vendita carcassa (€/kg) {d.prezzoVenditaMedioReale != null && <span style={{ fontWeight: 400 }}>— media reale registrata: {formattaEuro(d.prezzoVenditaMedioReale, 2)}</span>}
                    <input type="number" step="0.01" value={prezzoInput}
                      onChange={e => setPrezziVendita(prev => ({ ...prev, [sp]: e.target.value }))}
                      placeholder={d.prezzoVenditaMedioReale == null ? "nessun dato reale — inserisci un valore" : ""}
                      style={{ display: "block", marginTop: 6, width: 140, padding: "6px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 14, fontWeight: 700 }} />
                  </label>

                  {!pesoMedio ? (
                    <p style={{ color: C.muted, fontSize: 13, marginTop: 12 }}>Nessun animale uscito quest'anno con peso noto — impossibile calcolare il punto di pareggio senza un peso di riferimento.</p>
                  ) : (
                    <div style={{ marginTop: 14, display: "flex", gap: 24, flexWrap: "wrap", fontSize: 14 }}>
                      <div>Ricavo per capo: <strong>{ricavoPerCapo != null ? formattaEuro(ricavoPerCapo) : "—"}</strong></div>
                      <div>Margine di contribuzione/capo: <strong style={{ color: margineContribuzionePerCapo > 0 ? C.green : C.red }}>{margineContribuzionePerCapo != null ? formattaEuro(margineContribuzionePerCapo) : "—"}</strong></div>
                      <div style={{ fontSize: 16 }}>
                        Punto di pareggio: {puntoPareggio != null ? (
                          <strong style={{ color: C.primary }}>{puntoPareggio} capi</strong>
                        ) : (
                          <strong style={{ color: C.red }}>irraggiungibile a questo prezzo</strong>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CampoInfo({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
