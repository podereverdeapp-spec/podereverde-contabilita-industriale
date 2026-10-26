// Versione 308 (decisione del Dott. Bizzarri del 26/10/2026, ore 19:04–19:13) — «Animali in stalla: quanto sono costati
// e quanto valgono». Per ogni specie, gli animali presenti alla fine dell'anno scelto (per l'anno in corso: oggi):
// - costo accumulato (acquisto o nascita + mantenimento salvato dal Report Costi), diviso tra anni precedenti e anno;
// - peso della carcassa STIMATO dall'età, con i pesi reali dei capi macellati (nel database non ci sono ancora pesate);
// - valore al prezzo al kg di carcassa (proposto dalle fatture di vendita, modificabile a mano).
// I riproduttori sono a parte: il loro mantenimento va ai figli (costo di nascita), quindi del loro costo si mostra solo
// il costo d'ingresso; il valore è quello della carcassa, con un suo prezzo al kg modificabile.
// Usa gli stessi dati e le stesse regole del Riepilogo Costi (Break Even): un solo calcolo del costo di ogni capo.
// Sola lettura: nessuna scrittura nel database.
import { supabase } from "./supabase";
import { fetchAllPages, round2 } from "./parsingUtils";
import { SPECIE } from "./calcoloBreakEven";

const MESE = 30.44;
const GIORNO = 86400000;
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const mesiTra = (da, a) => (new Date(a) - new Date(da)) / GIORNO / MESE;
const DESTINAZIONE = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" };

// Data di riferimento: 31/12 dell'anno scelto; per l'anno in corso, oggi
export function dataRiferimento(anno) {
  const oggi = new Date();
  const d = anno >= oggi.getFullYear() ? oggi : new Date(anno, 11, 31);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Prezzo al kg di carcassa dalle fatture di vendita: media pesata sui chili dell'ultimo anno con vendite (fino all'anno scelto).
// Si contano le righe intestate alla specie con almeno 10 kg e un prezzo tra 1 e 50 € al kg (così una riga «vendita torello»
// a corpo non sporca la media). Fatture lette da Aruba + fatture emesse dal programma non annullate.
// Versione 309: si tolgono le righe dei capi di riforma (usciti con più di 36 mesi, per esempio le vacche Aurelia della
// FPR 11/26 a 4,50 € al kg): il loro prezzo non è quello di un capo da macello e abbassava la media dei bovini.
const ETA_RIFORMA_MESI = 36;
const MATRICOLA = /\b(IT\s?\d{6,})\b/gi;
export async function prezziDaFatture(anno) {
  const [{ data: fatture }, { data: emesse }, { data: animali }] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("ci_fatture").select("id, data").eq("tipo", "ATTIVA").lte("data", `${anno}-12-31`).order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("ci_fatture_emesse_righe").select("specie, matricola, quantita_kg, importo, ci_fatture_emesse(data, stato)").order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("animali").select("id, bdn, nascita, data_uscita").order("id").range(da, a)),
  ]);
  const etaUscita = new Map((animali || []).filter(x => x.bdn && x.nascita && x.data_uscita).map(x => [String(x.bdn).toUpperCase().replace(/\s+/g, ""), (new Date(x.data_uscita) - new Date(x.nascita)) / GIORNO / MESE]));
  const diRiforma = testo => [...String(testo || "").matchAll(MATRICOLA)].some(m => (etaUscita.get(m[1].toUpperCase().replace(/\s+/g, "")) || 0) > ETA_RIFORMA_MESI);
  const annoFattura = new Map((fatture || []).map(f => [f.id, parseInt(String(f.data).slice(0, 4))]));
  const righe = [];
  if (annoFattura.size) {
    const { data: art } = await fetchAllPages((da, a) => supabase.from("ci_articoli_fattura").select("fattura_id, destinazione, descrizione, matricole, quantita, totale_riga")
      .in("destinazione", Object.values(DESTINAZIONE)).order("id").range(da, a));
    for (const r of art || []) {
      const an = annoFattura.get(r.fattura_id); if (!an) continue;
      if (diRiforma(`${r.descrizione || ""} ${Array.isArray(r.matricole) ? r.matricole.join(" ") : (r.matricole || "")}`)) continue;
      const specie = Object.keys(DESTINAZIONE).find(s => DESTINAZIONE[s] === (r.destinazione || "").trim());
      righe.push({ specie, anno: an, kg: num(r.quantita), importo: num(r.totale_riga), fonte: "fatture" });
    }
  }
  for (const r of emesse || []) {
    const f = r.ci_fatture_emesse; if (!f || f.stato === "annullata") continue;
    const an = parseInt(String(f.data).slice(0, 4)); if (an > anno) continue;
    if (diRiforma(r.matricola)) continue;
    righe.push({ specie: r.specie, anno: an, kg: num(r.quantita_kg), importo: num(r.importo), fonte: "programma" });
  }
  const valide = righe.filter(r => SPECIE.includes(r.specie) && r.kg >= 10 && r.importo / r.kg >= 1 && r.importo / r.kg <= 50);
  const risultato = {};
  for (const s of SPECIE) {
    const rs = valide.filter(r => r.specie === s);
    if (!rs.length) { risultato[s] = null; continue; }
    const ultimo = Math.max(...rs.map(r => r.anno));
    const dellAnno = rs.filter(r => r.anno === ultimo);
    const kg = dellAnno.reduce((t, r) => t + r.kg, 0);
    risultato[s] = { prezzo: round2(dellAnno.reduce((t, r) => t + r.importo, 0) / kg), anno: ultimo, kg: round2(kg), righe: dellAnno.length };
  }
  return risultato;
}

// Modello di stima del peso della carcassa per specie, dai capi macellati con data di nascita, data di uscita e peso della carcassa
function modelloPeso(base, specie, pesoNascitaVivo, resaStandard) {
  const mac = base.soggetti.filter(s => s.specie === specie && s.pesoCarcassa > 0 && s.nascita && s.uscita && !s.riproduttore && !s.codiceNonValido);
  const rip = base.soggetti.filter(s => s.specie === specie && s.pesoCarcassa > 0 && s.riproduttore);
  const etaMedia = mac.length ? mac.reduce((t, s) => t + mesiTra(s.nascita, s.uscita), 0) / mac.length : null;
  const carcassaMedia = mac.length ? mac.reduce((t, s) => t + s.pesoCarcassa, 0) / mac.length : null;
  const conVivo = mac.filter(s => s.pesoVivo > 0);
  const resa = conVivo.length ? conVivo.reduce((t, s) => t + s.pesoCarcassa / s.pesoVivo, 0) / conVivo.length : (resaStandard || null);
  const carcassaNascita = resa && pesoNascitaVivo ? pesoNascitaVivo * resa : 0;
  return {
    capiMacellati: mac.length, etaMedia: etaMedia && round2(etaMedia), carcassaMedia: carcassaMedia && round2(carcassaMedia), carcassaNascita: round2(carcassaNascita),
    resa: resa && round2(resa * 100),
    riproduttoriMacellati: rip.length, carcassaRiproduttori: rip.length ? round2(rip.reduce((t, s) => t + s.pesoCarcassa, 0) / rip.length) : null,
  };
}

// Peso stimato della carcassa a una certa età: dalla carcassa alla nascita cresce in proporzione all'età fino all'età media
// di macellazione, dove vale la carcassa media dei macellati; oltre quell'età resta la carcassa media.
function pesoStimato(m, etaMesi) {
  if (!m.etaMedia || !m.carcassaMedia) return null;
  if (etaMesi >= m.etaMedia) return m.carcassaMedia;
  return m.carcassaNascita + (m.carcassaMedia - m.carcassaNascita) * Math.max(etaMesi, 0) / m.etaMedia;
}

export async function calcolaStalla(base, anno) {
  const data = dataRiferimento(anno);
  const { data: standard } = await supabase.from("pesi_standard_specie").select("specie, peso_nascita_kg, resa_media_percent");
  const std = new Map((standard || []).map(r => [r.specie, r]));
  const perSpecie = {};
  for (const specie of SPECIE) {
    const st = std.get(specie) || {};
    const m = modelloPeso(base, specie, num(st.peso_nascita_kg), num(st.resa_media_percent) / 100);
    const ingrasso = { capi: 0, costoPrecedenti: 0, costoAnno: 0, kg: 0, capiSenzaStima: 0, capiSenzaCosto: 0 };
    const riproduttori = { capi: 0, costoIngresso: 0, kg: 0, capiSenzaStima: 0 };
    for (const s of base.soggetti) {
      if (s.specie !== specie || !base.presenteIl(s, data)) continue;
      const righe = base.righeSoggetto.get(s.chiave) || [];
      const eta = s.nascita ? mesiTra(s.nascita, data) : null;
      if (s.riproduttore) {
        riproduttori.capi++;
        const nascita = righe.reduce((t, r) => t + num(r.costo_nascita_ereditato), 0);
        riproduttori.costoIngresso += s.acquistato ? s.costoAcquisto : nascita;
        const kg = m.carcassaRiproduttori ?? (eta !== null ? pesoStimato(m, eta) : null);
        if (kg) riproduttori.kg += kg; else riproduttori.capiSenzaStima++;
        continue;
      }
      ingrasso.capi++;
      const annoIngresso = s.inizio ? parseInt(s.inizio.slice(0, 4)) : null;
      const acquisto = s.acquistato ? s.costoAcquisto : 0;
      const valoreRiga = r => num(r.costo_mantenimento) + num(r.costo_nascita_ereditato) + num(r.quota_residuo_riproduttori);
      const prec = righe.filter(r => r.anno < anno).reduce((t, r) => t + valoreRiga(r), 0) + (annoIngresso !== null && annoIngresso < anno ? acquisto : 0);
      const dellAnno = righe.filter(r => r.anno === anno).reduce((t, r) => t + valoreRiga(r), 0) + (annoIngresso === anno ? acquisto : 0);
      if (!righe.some(r => r.anno <= anno) && !acquisto) ingrasso.capiSenzaCosto++;
      ingrasso.costoPrecedenti += prec; ingrasso.costoAnno += dellAnno;
      const kg = eta !== null ? pesoStimato(m, eta) : null;
      if (kg) ingrasso.kg += kg; else ingrasso.capiSenzaStima++;
    }
    for (const o of [ingrasso, riproduttori]) for (const k of Object.keys(o)) if (!/^capi/.test(k)) o[k] = round2(o[k]);
    ingrasso.costoTotale = round2(ingrasso.costoPrecedenti + ingrasso.costoAnno);
    perSpecie[specie] = { ingrasso, riproduttori, modello: m };
  }
  return { data, perSpecie };
}
