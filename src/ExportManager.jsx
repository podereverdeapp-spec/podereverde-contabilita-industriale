import { useState } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";

const C = {
  bg:"#F5F0E8", card:"#FFFFFF", primary:"#5C3D1E", accent:"#A0522D",
  green:"#4A7C59", red:"#C0392B", yellow:"#D4A017", blue:"#2C6E9B",
  text:"#2D1B0E", muted:"#8B7355", border:"#D4C4A8",
  bovini:"#8B6914", suini:"#B5547A", ovini:"#4A7C59",
};

const today = () => new Date().toISOString().split("T")[0];

// ─── Helpers foglio Excel ──────────────────────────────────────────────────────
// Colonne "leggere": ogni colonna ha {key, label, width?, num?, cur?, center?, bold?, sumTotale?, media?}
// Se una colonna ha sumTotale:true, nella riga TOTALE viene messa la somma dei valori
// Se ha media:true, mette la media
// Se il tipo è testo, resta vuota nel totale (a meno di totaleLabel)
function creaFoglio(dati, colonne, opts={}) {
  if(!dati||dati.length===0) {
    const emptyCols = colonne.map(c => ({...c, key:c.key||c.label, label:c.label}));
    return creaSheetFormattato([{[colonne[0].key||colonne[0].label]:"Nessun dato disponibile"}], emptyCols);
  }
  // Normalizzo le colonne per usare key come identificatore
  const cols = colonne.map(c => ({
    key: c.key || c.label,
    label: c.label,
    width: c.width || 16,
    num: c.num || false,
    cur: c.cur || false,
    center: c.center || false,
    bold: c.bold || false,
    sumTotale: c.sumTotale || false,
    totaleLabel: c.totaleLabel || null,
  }));

  // Righe convertite in oggetti con chiave = key colonna
  const righe = dati.map(d => {
    const r = {};
    cols.forEach(col => {
      const v = d[col.key] ?? d[col.label] ?? "";
      r[col.key] = v;
    });
    return r;
  });

  // Riga TOTALE se abilitata
  if (opts.totale) {
    const rigaTot = {};
    cols.forEach((col, i) => {
      if (col.totaleLabel) {
        rigaTot[col.key] = col.totaleLabel;
      } else if (i === 0) {
        rigaTot[col.key] = opts.totaleLabel || "TOTALE";
      } else if (col.sumTotale) {
        const somma = righe.reduce((s,r) => {
          const v = parseFloat(r[col.key]);
          return s + (isNaN(v) ? 0 : v);
        }, 0);
        rigaTot[col.key] = col.cur ? Math.round(somma*100)/100 : Math.round(somma*1000)/1000;
      } else {
        rigaTot[col.key] = "";
      }
    });
    // Aggiungo conteggio capi/righe come default nella seconda colonna se non ha totaleLabel/sumTotale
    if (opts.contaRighe && !cols[1]?.totaleLabel && !cols[1]?.sumTotale) {
      rigaTot[cols[1].key] = righe.length;
    }
    rigaTot["_isTotaleRow"] = true;
    righe.push(rigaTot);
  }

  return creaSheetFormattato(righe, cols);
}

function scarica(wb, nomeFile) {
  XLSX.writeFile(wb, `${nomeFile}_${today()}.xlsx`);
}

// ─── GENERATORI FOGLI ─────────────────────────────────────────────────────────
function foglio_anagrafica(animali) {
  // Arricchisco con colonna qualifica + IPG calcolati
  const dati = animali.map(a => {
    const gg = a.data_uscita&&a.data_ingresso
      ? Math.round((new Date(a.data_uscita)-new Date(a.data_ingresso))/86400000) : 0;
    return {
      ...a,
      qualifica: a.riproduttore
        ? (a.sesso==="M" ? "Riproduttore" : "Riproduttrice")
        : "",
      giorni_vita: a.data_uscita&&a.nascita ? Math.round((new Date(a.data_uscita)-new Date(a.nascita))/86400000) : "",
      giorni_permanenza: gg>0 ? gg : "",
      ipg_peso_vivo: gg>0&&a.peso_vivo_uscita ? Math.round(a.peso_vivo_uscita/gg*1000)/1000 : "",
      ipg_carcassa:  gg>0&&a.peso_carcassa    ? Math.round(a.peso_carcassa/gg*1000)/1000 : "",
    };
  });
  return creaFoglio(dati, [
    {key:"bdn",                    label:"BDN / Matricola"},
    {key:"nome",                   label:"Nome"},
    {key:"specie",                 label:"Specie"},
    {key:"razza",                  label:"Razza"},
    {key:"razza_calcolata",        label:"Razza calcolata"},
    {key:"sesso",                  label:"Sesso"},
    {key:"qualifica",              label:"Qualifica riproduzione"},
    {key:"categoria",              label:"Categoria"},
    {key:"nascita",                label:"Data nascita"},
    {key:"data_registrazione_bdn", label:"Data registrazione BDN"},
    {key:"peso_nascita",           label:"Peso nascita (kg)"},
    {key:"peso_ingresso",          label:"Peso all'ingresso (kg)"},
    {key:"peso_attuale",           label:"Peso attuale (kg)"},
    {key:"provenienza",            label:"Provenienza"},
    {key:"origine",                label:"Azienda origine"},
    {key:"fornitore",              label:"Fornitore"},
    {key:"data_fattura",           label:"Data fattura"},
    {key:"numero_fattura",         label:"Numero fattura"},
    {key:"prezzo_acquisto",        label:"Prezzo acquisto (€)"},
    {key:"data_ingresso",          label:"Data ingresso"},
    {key:"lotto_box",              label:"Lotto / Box"},
    {key:"destinazione",           label:"Destinazione"},
    {key:"stato",                  label:"Stato"},
    {key:"data_uscita",            label:"Data uscita"},
    {key:"giorni_vita",             label:"Giorni di vita"},
    {key:"motivo_uscita",          label:"Motivo uscita"},
    {key:"causa_morte",            label:"Causa (se morto per malattia)"},
    {key:"peso_vivo_uscita",       label:"Peso vivo uscita (kg)"},
    {key:"peso_carcassa",          label:"Peso carcassa (kg)"},
    {key:"resa_percent",           label:"Resa %"},
    {key:"giorni_permanenza",      label:"Giorni permanenza"},
    {key:"ipg_peso_vivo",          label:"IPG peso vivo (kg/gg)"},
    {key:"ipg_carcassa",           label:"IPG carcassa (kg/gg)"},
    {key:"note_sanitarie",         label:"Note sanitarie"},
    {key:"note",                   label:"Note"},
  ]);
}

function foglio_sanitario(eventi, animali, suiniLotto, lotti) {
  const dati = eventi.map(e => {
    const a = e.animale_id ? animali.find(x=>x.id===e.animale_id) : null;
    const u = e.suini_lotto_id ? suiniLotto.find(x=>x.id===e.suini_lotto_id) : null;
    const l = u ? lotti.find(x=>x.id===u.lotto_id) : null;
    return {
      data:        e.data,
      specie:      a?.specie || (u?"suino (lotto)":""),
      animale:     a ? (a.nome||a.bdn||"") : (u ? `${l?.codice_lotto||l?.codice||""}${String(u.nr).padStart(2,"0")}` : ""),
      bdn:         a?.bdn || "",
      tipo:        e.tipo,
      descrizione: e.descrizione,
      prodotto:    e.prodotto||"",
      veterinario: e.veterinario||"",
      scadenza:    e.scadenza||"",
      costo:       e.costo||"",
      note:        e.note||"",
    };
  });
  return creaFoglio(dati, [
    {key:"data",        label:"Data"},
    {key:"specie",      label:"Specie"},
    {key:"animale",     label:"Animale / Tatuaggio"},
    {key:"bdn",         label:"BDN"},
    {key:"tipo",        label:"Tipo"},
    {key:"descrizione", label:"Descrizione"},
    {key:"prodotto",    label:"Prodotto / Farmaco"},
    {key:"veterinario", label:"Veterinario"},
    {key:"scadenza",    label:"Scadenza richiamo"},
    {key:"costo",       label:"Costo (€)"},
  ]);
}

function foglio_alimentazione(voci) {
  return creaFoglio(voci, [
    {key:"data",     label:"Data"},
    {key:"specie",   label:"Specie"},
    {key:"tipo",     label:"Tipo mangime / foraggio"},
    {key:"quantita", label:"Quantità"},
    {key:"unita",    label:"Unità"},
    {key:"costo",    label:"Costo (€)"},
    {key:"note",     label:"Note"},
  ]);
}

function foglio_parti(eventi, animali) {
  const dati = eventi.filter(e=>e.tipo_evento==="parto").map(e => {
    const madre = animali.find(a=>a.id===e.animale_id);
    const padre = e.padre_id ? animali.find(a=>a.id===e.padre_id) : null;
    return {
      data_parto:         e.data_evento,
      madre_bdn:          madre?.bdn||"",
      madre_nome:         madre?.nome||"",
      specie:             madre?.specie||"",
      razza_madre:        madre?.razza||"",
      padre_bdn:          padre?.bdn||"",
      padre_nome:         padre?.nome||"",
      tipo_parto:         e.tipo_parto||"",
      nati_vivi:          e.nati_vivi||0,
      nati_morti:         e.nati_morti||0,
      nati_totali:        (e.nati_vivi||0)+(e.nati_morti||0),
      data_accoppiamento: e.data_accoppiamento||"",
      note:               e.note||"",
    };
  });
  return creaFoglio(dati, [
    {key:"data_parto",         label:"Data parto"},
    {key:"specie",             label:"Specie"},
    {key:"madre_bdn",          label:"BDN Madre"},
    {key:"madre_nome",         label:"Nome Madre"},
    {key:"razza_madre",        label:"Razza Madre"},
    {key:"padre_bdn",          label:"BDN Padre"},
    {key:"padre_nome",         label:"Nome Padre"},
    {key:"tipo_parto",         label:"Tipo parto"},
    {key:"nati_totali",        label:"Nati totali"},
    {key:"nati_vivi",          label:"Nati vivi"},
    {key:"nati_morti",         label:"Nati morti"},
    {key:"data_accoppiamento", label:"Data accoppiamento"},
    {key:"note",               label:"Note"},
  ]);
}

function foglio_uscite(animali, suiniLotto, lotti) {
  const usciti = animali.filter(a=>a.stato!=="attivo");
  const dati = usciti.map(a => ({
    bdn:              a.bdn||"",
    nome:             a.nome||"",
    specie:           a.specie||"",
    razza:            a.razza_calcolata||a.razza||"",
    sesso:            a.sesso||"",
    nascita:          a.nascita||"",
    data_ingresso:    a.data_ingresso||"",
    data_uscita:      a.data_uscita||"",
    giorni_permanenza:a.data_uscita&&a.data_ingresso
      ?Math.round((new Date(a.data_uscita)-new Date(a.data_ingresso))/86400000):"",
    stato:            a.stato||"",
    motivo_uscita:    a.motivo_uscita||"",
    causa_morte:      a.causa_morte||"",
    peso_vivo_uscita: a.peso_vivo_uscita||"",
    peso_carcassa:    a.peso_carcassa||"",
    resa_percent:     a.resa_percent||"",
    ipg_peso_vivo:    (()=>{
      const gg = a.data_uscita&&a.data_ingresso
        ? Math.round((new Date(a.data_uscita)-new Date(a.data_ingresso))/86400000) : 0;
      return gg>0&&a.peso_vivo_uscita ? Math.round(a.peso_vivo_uscita/gg*1000)/1000 : "";
    })(),
    ipg_carcassa:     (()=>{
      const gg = a.data_uscita&&a.data_ingresso
        ? Math.round((new Date(a.data_uscita)-new Date(a.data_ingresso))/86400000) : 0;
      return gg>0&&a.peso_carcassa ? Math.round(a.peso_carcassa/gg*1000)/1000 : "";
    })(),
    note:             a.note||"",
  }));

  // Aggiungo le unità di lotto uscite (macellate/morte/vendute/altro) — prima mancavano del tutto
  const lottiById = {};
  (lotti||[]).forEach(l => { lottiById[l.id] = l; });
  const unitaUscite = (suiniLotto||[]).filter(u =>
    (u.vivo===false || (u.stato&&u.stato!=="attivo")) && u.stato!=="registrato_individuale"
  );
  unitaUscite.forEach(u => {
    const l = lottiById[u.lotto_id] || {};
    const codLotto = l.codice_lotto||l.codice||"";
    const dataIngresso = l.data_parto||"";
    const gg = u.data_uscita&&dataIngresso
      ? Math.round((new Date(u.data_uscita)-new Date(dataIngresso))/86400000) : 0;
    const acquistato = l.tipo_provenienza==="acquistato";
    const guadagnoPeso = acquistato
      ? (u.peso_vivo_uscita!=null&&u.peso_nascita!=null ? u.peso_vivo_uscita-u.peso_nascita : null)
      : u.peso_vivo_uscita;
    dati.push({
      bdn:              u.codice_completo||`${codLotto}${String(u.nr||"").padStart(2,"0")}`,
      nome:             "",
      specie:           "suino",
      razza:            l.razza_madre||"",
      sesso:            u.sesso||"",
      nascita:          dataIngresso,
      data_ingresso:    dataIngresso,
      data_uscita:      u.data_uscita||"",
      giorni_permanenza:gg>0?gg:"",
      stato:            u.stato||"",
      motivo_uscita:    u.motivo_uscita||"",
      causa_morte:      u.causa_morte||"",
      peso_vivo_uscita: u.peso_vivo_uscita||"",
      peso_carcassa:    u.peso_carcassa||"",
      resa_percent:     u.resa_percent||"",
      ipg_peso_vivo:    gg>0&&guadagnoPeso!=null ? Math.round(guadagnoPeso/gg*1000)/1000 : "",
      ipg_carcassa:     gg>0&&u.peso_carcassa    ? Math.round(u.peso_carcassa/gg*1000)/1000 : "",
      note:             `Lotto ${codLotto}`,
    });
  });

  return creaFoglio(dati, [
    {key:"bdn",              label:"BDN / Matricola",         width:20, bold:true},
    {key:"nome",             label:"Nome",                    width:18},
    {key:"specie",           label:"Specie",                  width:10, center:true},
    {key:"razza",            label:"Razza",                   width:16},
    {key:"sesso",            label:"Sesso",                   width:8,  center:true},
    {key:"nascita",          label:"Data nascita",            width:13, center:true},
    {key:"data_ingresso",    label:"Data ingresso",           width:13, center:true},
    {key:"data_uscita",      label:"Data uscita",             width:13, center:true},
    {key:"giorni_permanenza",label:"Giorni permanenza",       width:11, num:true, center:true},
    {key:"stato",            label:"Stato",                   width:10, center:true},
    {key:"motivo_uscita",    label:"Motivo uscita",           width:20},
    {key:"causa_morte",      label:"Causa (se morto per malattia)", width:22},
    {key:"peso_vivo_uscita", label:"Peso vivo (kg)",          width:12, num:true, sumTotale:true},
    {key:"peso_carcassa",    label:"Peso carcassa (kg)",      width:13, num:true, sumTotale:true},
    {key:"resa_percent",     label:"Resa %",                  width:9,  num:true},
    {key:"ipg_peso_vivo",    label:"IPG peso vivo (kg/gg)",   width:13, num:true},
    {key:"ipg_carcassa",     label:"IPG carcassa (kg/gg)",    width:13, num:true},
    {key:"note",             label:"Note",                    width:24},
  ], {totale:true, contaRighe:true});
}

function foglio_lotti_riepilogo(lotti, suiniLotto, animali, costoNascitaPerLotto) {
  const cnl = costoNascitaPerLotto || {};
  const dati = lotti.map(l => {
    const us = suiniLotto.filter(s=>s.lotto_id===l.id);
    const madre = animali.find(a=>a.id===l.madre_id);
    const padre = animali.find(a=>a.id===l.padre_id);
    const nTotale = l.nati_totali||us.length;
    const codice = l.codice_lotto||l.codice||"";
    const cn = cnl[codice];
    return {
      codice,
      tipo:        l.tipo_provenienza==="acquistato"?"Acquistato":"Parto",
      data_parto:  l.data_parto||"",
      fornitore:   l.fornitore||"",
      madre_bdn:   madre?.bdn||"",
      madre_nome:  madre?.nome||"",
      razza_madre: l.razza_madre||madre?.razza||"",
      padre_bdn:   padre?.bdn||"",
      razza_padre: l.razza_padre||padre?.razza||"",
      nati_totali: nTotale,
      nati_vivi:   l.nati_vivi||us.filter(u=>u.vivo!==false).length,
      nati_morti:  l.nati_morti||0,
      vivi_attuali:us.filter(u=>u.vivo!==false&&u.stato==="attivo").length,
      macellati:   us.filter(u=>u.stato==="macellato").length,
      deceduti:    us.filter(u=>u.stato==="morto").length,
      venduti:     us.filter(u=>u.stato==="venduto").length,
      riproduttori:us.filter(u=>u.destinazione==="riproduzione").length,
      maschi:      us.filter(u=>u.sesso==="M").length,
      femmine:     us.filter(u=>u.sesso==="F").length,
      prezzo_acquisto:          l.prezzo_acquisto||"",
      prezzo_acquisto_per_capo: l.prezzo_acquisto&&nTotale?Math.round(l.prezzo_acquisto/nTotale*100)/100:"",
      costo_nascita_stimato:          cn?cn.costoTotale:"",
      costo_nascita_stimato_per_capo: cn?cn.costoPerCapo:"",
      note:        l.note||"",
    };
  });
  return creaFoglio(dati, [
    {key:"codice",      label:"Codice lotto"},
    {key:"tipo",        label:"Tipo"},
    {key:"data_parto",  label:"Data parto/acquisto"},
    {key:"fornitore",   label:"Fornitore"},
    {key:"madre_bdn",   label:"BDN Madre"},
    {key:"madre_nome",  label:"Nome Madre"},
    {key:"razza_madre", label:"Razza Madre"},
    {key:"padre_bdn",   label:"BDN Padre"},
    {key:"razza_padre", label:"Razza Padre"},
    {key:"nati_totali", label:"Nati totali"},
    {key:"nati_vivi",   label:"Nati vivi"},
    {key:"nati_morti",  label:"Nati morti"},
    {key:"vivi_attuali",label:"Vivi attuali"},
    {key:"macellati",   label:"Macellati"},
    {key:"deceduti",    label:"Deceduti"},
    {key:"venduti",     label:"Venduti"},
    {key:"riproduttori",label:"Riproduttori"},
    {key:"maschi",      label:"Maschi"},
    {key:"femmine",     label:"Femmine"},
    {key:"prezzo_acquisto",          label:"Prezzo acquisto (€)", cur:true, sumTotale:true},
    {key:"prezzo_acquisto_per_capo", label:"Prezzo acquisto/capo (€)", cur:true},
    {key:"costo_nascita_stimato",          label:"Costo nascita stimato (€)", cur:true, sumTotale:true},
    {key:"costo_nascita_stimato_per_capo", label:"Costo nascita stimato/capo (€)", cur:true},
    {key:"note",        label:"Note"},
  ]);
}

function foglio_lotti_unita(suiniLotto, lotti) {
  const dati = suiniLotto.map(u => {
    const l = lotti.find(x=>x.id===u.lotto_id);
    const cod = u.codice_completo || `${l?.codice_lotto||l?.codice||""}${String(u.nr).padStart(2,"0")}`;
    const dataIngresso = l?.data_parto||"";
    const gg = u.data_uscita&&dataIngresso
      ? Math.round((new Date(u.data_uscita)-new Date(dataIngresso))/86400000) : 0;
    const acquistato = l?.tipo_provenienza==="acquistato";
    // Per i lotti acquistati l'IPG è un vero accrescimento: (peso uscita - peso entrata) / giorni.
    // Per i nati in azienda il peso alla nascita è trascurabile, resta peso uscita / giorni (come per gli animali individuali).
    const guadagnoPeso = acquistato
      ? (u.peso_vivo_uscita!=null&&u.peso_nascita!=null ? u.peso_vivo_uscita-u.peso_nascita : null)
      : u.peso_vivo_uscita;
    return {
      tatuaggio:       cod,
      codice_lotto:    l?.codice_lotto||l?.codice||"",
      nr:              u.nr,
      sesso:           u.sesso||"",
      destinazione:    u.destinazione||"ingrasso",
      stato:           u.stato||"",
      matricola:       u.matricola||u.bdn||"",
      data_ingresso:   dataIngresso,
      peso_nascita:    u.peso_nascita||"",
      data_uscita:     u.data_uscita||"",
      giorni_permanenza:gg>0?gg:"",
      motivo_uscita:   u.motivo_uscita||"",
      causa_morte:     u.causa_morte||"",
      peso_vivo_uscita:u.peso_vivo_uscita||"",
      peso_carcassa:   u.peso_carcassa||"",
      resa_percent:    u.resa_percent||"",
      ipg_peso_vivo:   gg>0&&guadagnoPeso!=null ? Math.round(guadagnoPeso/gg*1000)/1000 : "",
      ipg_carcassa:    gg>0&&u.peso_carcassa    ? Math.round(u.peso_carcassa/gg*1000)/1000 : "",
    };
  });
  return creaFoglio(dati, [
    {key:"tatuaggio",       label:"Tatuaggio (cod. lotto + nr.)"},
    {key:"codice_lotto",    label:"Codice lotto"},
    {key:"nr",              label:"Nr. unità"},
    {key:"sesso",           label:"Sesso"},
    {key:"destinazione",    label:"Destinazione"},
    {key:"stato",           label:"Stato"},
    {key:"matricola",       label:"Matricola individuale"},
    {key:"data_ingresso",   label:"Data ingresso/nascita"},
    {key:"peso_nascita",    label:"Peso nascita/entrata (kg)"},
    {key:"data_uscita",     label:"Data uscita"},
    {key:"giorni_permanenza",label:"Giorni permanenza"},
    {key:"motivo_uscita",   label:"Motivo uscita"},
    {key:"causa_morte",     label:"Causa (se morto per malattia)"},
    {key:"peso_vivo_uscita",label:"Peso vivo uscita (kg)"},
    {key:"peso_carcassa",   label:"Peso carcassa (kg)"},
    {key:"resa_percent",    label:"Resa %"},
    {key:"ipg_peso_vivo",   label:"IPG peso vivo (kg/gg)"},
    {key:"ipg_carcassa",    label:"IPG carcassa (kg/gg)"},
  ]);
}

// Un lotto è "attivo" se ha almeno un'unità ancora viva/attiva (o se non ha ancora unità registrate)
function foglio_lotti_attivi(lotti, suiniLotto, animali, costoNascitaPerLotto) {
  const attivi = lotti.filter(l => {
    const us = suiniLotto.filter(s=>s.lotto_id===l.id);
    return us.length===0 || us.some(u=>u.vivo!==false && u.stato==="attivo");
  });
  return foglio_lotti_riepilogo(attivi, suiniLotto, animali, costoNascitaPerLotto);
}

// Un lotto è "uscito/chiuso" quando tutte le sue unità sono uscite (nessuna più attiva)
function foglio_lotti_usciti(lotti, suiniLotto, animali, costoNascitaPerLotto) {
  const usciti = lotti.filter(l => {
    const us = suiniLotto.filter(s=>s.lotto_id===l.id);
    return us.length>0 && us.every(u=>u.vivo===false || u.stato!=="attivo");
  });
  return foglio_lotti_riepilogo(usciti, suiniLotto, animali, costoNascitaPerLotto);
}

function foglio_unita_attive(suiniLotto, lotti) {
  return foglio_lotti_unita(suiniLotto.filter(u=>u.vivo!==false && u.stato==="attivo"), lotti);
}

function foglio_unita_uscite(suiniLotto, lotti) {
  return foglio_lotti_unita(suiniLotto.filter(u=>u.vivo===false || u.stato!=="attivo"), lotti);
}

// Report costi di acquisto: animali individuali acquistati + unità di lotti acquistati
// (per i lotti, il costo unitario è il prezzo del lotto diviso per le unità ancora
// "economicamente conteggiabili": esclude morti per qualunque causa e smarriti/rubati,
// include invece attivi, macellati, venduti e quelli passati a BDN individuale)
function foglio_costi_acquisto(animali, lotti, suiniLotto) {
  const dati = [];

  // Animali individuali acquistati
  animali.filter(a=>a.provenienza==="Acquistato").forEach(a=>{
    dati.push({
      codice: a.bdn||"",
      tipo: "Individuale",
      stato: a.stato||"",
      data_ingresso: a.data_ingresso||"",
      data_fattura: a.data_fattura||"",
      numero_fattura: a.numero_fattura||"",
      fornitore: a.fornitore||"",
      costo_acquisto: a.prezzo_acquisto||"",
      nota: "",
    });
  });

  // Unità di lotti acquistati
  const ESCLUSI_DIVISORE = ["morto","disperso"];
  lotti.filter(l=>l.tipo_provenienza==="acquistato").forEach(l=>{
    const codLotto = l.codice_lotto||l.codice||"";
    const unita = suiniLotto.filter(u=>u.lotto_id===l.id);
    const denominatore = unita.filter(u=>!ESCLUSI_DIVISORE.includes(u.stato)).length;
    const costoUnitario = l.prezzo_acquisto&&denominatore>0
      ? Math.round(l.prezzo_acquisto/denominatore*100)/100 : "";
    unita.forEach(u=>{
      const escluso = ESCLUSI_DIVISORE.includes(u.stato);
      const codice = u.stato==="registrato_individuale"
        ? (u.bdn||u.matricola||u.codice_completo)
        : (u.codice_completo||`${codLotto}${String(u.nr).padStart(2,"0")}`);
      dati.push({
        codice,
        tipo: `Lotto ${codLotto}`,
        stato: u.stato||"",
        data_ingresso: l.data_parto||"",
        data_fattura: l.data_fattura||"",
        numero_fattura: l.numero_fattura||"",
        fornitore: l.fornitore||"",
        costo_acquisto: escluso?"":costoUnitario,
        nota: escluso?`Perdita — costo redistribuito sulle altre ${denominatore} unità del lotto`
             : u.stato==="registrato_individuale"?`Passato a BDN individuale (da ${codLotto})`:"",
      });
    });
  });

  return creaFoglio(dati, [
    {key:"codice",         label:"BDN / Codice unità", bold:true},
    {key:"tipo",           label:"Tipo"},
    {key:"stato",          label:"Stato"},
    {key:"data_ingresso",  label:"Data ingresso"},
    {key:"data_fattura",   label:"Data fattura"},
    {key:"numero_fattura", label:"Numero fattura"},
    {key:"fornitore",      label:"Fornitore"},
    {key:"costo_acquisto", label:"Costo acquisto (€)", cur:true, sumTotale:true},
    {key:"nota",           label:"Nota"},
  ]);
}

function foglio_kpi(animali, eventiRiprod) {
  const daysBetween = (d1,d2) => Math.round((new Date(d2)-new Date(d1))/86400000);
  const fattrici = animali.filter(a=>a.sesso==="F");
  const dati = fattrici.map(a => {
    const mieiParti = eventiRiprod
      .filter(e=>e.animale_id===a.id&&e.tipo_evento==="parto")
      .sort((x,y)=>x.data_evento?.localeCompare(y.data_evento));
    if(mieiParti.length===0) return null;
    const iipVals = [];
    for(let i=1;i<mieiParti.length;i++) {
      if(mieiParti[i-1].data_evento&&mieiParti[i].data_evento)
        iipVals.push(daysBetween(mieiParti[i-1].data_evento,mieiParti[i].data_evento));
    }
    const totVivi  = mieiParti.reduce((s,p)=>s+(p.nati_vivi||0),0);
    const totMorti = mieiParti.reduce((s,p)=>s+(p.nati_morti||0),0);
    const totNati  = totVivi+totMorti;
    return {
      bdn:          a.bdn||"",
      nome:         a.nome||"",
      specie:       a.specie||"",
      razza:        a.razza_calcolata||a.razza||"",
      n_parti:      mieiParti.length,
      nati_vivi:    totVivi,
      nati_morti:   totMorti,
      nati_medi_parto: mieiParti.length>0?Math.round(totNati/mieiParti.length*10)/10:"",
      pct_vivi:     totNati>0?Math.round(totVivi/totNati*1000)/10:"",
      prolificita:  mieiParti.length>0?Math.round(totVivi/mieiParti.length*10)/10:"",
      iip_medio_gg: iipVals.length>0?Math.round(iipVals.reduce((a,b)=>a+b,0)/iipVals.length):"",
      iip_medio_mesi:iipVals.length>0?Math.round(iipVals.reduce((a,b)=>a+b,0)/iipVals.length/30.4*10)/10:"",
      primo_parto:  mieiParti[0]?.data_evento||"",
      ultimo_parto: mieiParti[mieiParti.length-1]?.data_evento||"",
    };
  }).filter(Boolean)
    .sort((a,b) => b.prolificita - a.prolificita) // classifica: più nati vivi per parto = scrofa migliore
    .map((r,i) => ({ posizione: i+1, ...r }));
  return creaFoglio(dati, [
    {key:"posizione",       label:"Posizione"},
    {key:"bdn",             label:"BDN"},
    {key:"nome",            label:"Nome"},
    {key:"specie",          label:"Specie"},
    {key:"razza",           label:"Razza"},
    {key:"n_parti",         label:"N. parti"},
    {key:"nati_vivi",       label:"Tot. nati vivi"},
    {key:"nati_morti",      label:"Tot. nati morti"},
    {key:"nati_medi_parto", label:"Nati totali medi/parto"},
    {key:"pct_vivi",        label:"% nati vivi"},
    {key:"prolificita",     label:"⭐ Prolificità media (vivi/parto)", bold:true},
    {key:"iip_medio_gg",    label:"IIP medio (giorni)"},
    {key:"iip_medio_mesi",  label:"IIP medio (mesi)"},
    {key:"primo_parto",     label:"Primo parto"},
    {key:"ultimo_parto",    label:"Ultimo parto"},
  ]);
}

function foglio_costi_animale(costi, animali) {
  const dati = costi.map(c => {
    const a = animali.find(x=>x.id===c.animale_id);
    return { ...c, animale: a?.nome||a?.bdn||"", specie: a?.specie||"", bdn: a?.bdn||"" };
  });
  return creaFoglio(dati, [
    {key:"data",        label:"Data"},
    {key:"specie",      label:"Specie"},
    {key:"animale",     label:"Animale"},
    {key:"bdn",         label:"BDN"},
    {key:"voce",        label:"Voce"},
    {key:"importo",     label:"Importo (€)"},
    {key:"descrizione", label:"Descrizione"},
  ]);
}

function foglio_costi_generali(costi) {
  return creaFoglio(costi, [
    {key:"voce",        label:"Voce"},
    {key:"importo",     label:"Importo (€)"},
    {key:"specie",      label:"Specie"},
    {key:"data_inizio", label:"Dal"},
    {key:"data_fine",   label:"Al"},
    {key:"descrizione", label:"Descrizione"},
    {key:"fornitore",   label:"Fornitore"},
  ]);
}

function foglio_macchinari(macchinari) {
  const anno = new Date().getFullYear();
  const dati = macchinari.map(m => {
    const quotaAnnua = m.costo_storico&&m.anni_ammortamento ? m.costo_storico/m.anni_ammortamento : 0;
    const anniTrasc  = anno - (m.anno_acquisto||anno);
    const ammTot     = Math.min(m.costo_storico||0, quotaAnnua*anniTrasc);
    const residuo    = Math.max(0, (m.costo_storico||0)-ammTot);
    return { ...m, quota_annua: Math.round(quotaAnnua), ammortizzato: Math.round(ammTot), valore_residuo: Math.round(residuo) };
  });
  return creaFoglio(dati, [
    {key:"nome",              label:"Macchinario"},
    {key:"categoria",         label:"Categoria"},
    {key:"costo_storico",     label:"Costo storico (€)"},
    {key:"anno_acquisto",     label:"Anno acquisto"},
    {key:"anni_ammortamento", label:"Anni ammortamento"},
    {key:"quota_annua",       label:"Quota annua (€)"},
    {key:"ammortizzato",      label:"Tot. ammortizzato (€)"},
    {key:"valore_residuo",    label:"Valore residuo (€)"},
    {key:"note",              label:"Note"},
  ]);
}

// ─── STILI EXCEL ─────────────────────────────────────────────────────────────
const STYLE = {
  // Palette Podere Verde
  primary: "5C3D1E",       // marrone scuro
  primaryLight: "A0522D",  // marrone chiaro
  bg: "F5F0E8",            // beige sfondo
  bovini: "F5EDD8",        // beige bovini
  ovini:  "E4F0DC",        // verde chiaro ovini
  suini:  "F5DDE6",        // rosa chiaro suini
  totale: "5C3D1E",        // marrone totale
  totaleTxt: "FFFFFF",
  zebra: "FAF7F1",         // riga zebrata
};

// Stili predefiniti
const S_HEADER = {
  fill:{fgColor:{rgb:STYLE.primary}},
  font:{color:{rgb:"FFFFFF"},bold:true,sz:11,name:"Century Gothic"},
  alignment:{horizontal:"center",vertical:"center",wrapText:true},
  border:{top:{style:"thin",color:{rgb:"888888"}},bottom:{style:"thin",color:{rgb:"888888"}},
    left:{style:"thin",color:{rgb:"888888"}},right:{style:"thin",color:{rgb:"888888"}}},
};
const S_TOTALE = {
  fill:{fgColor:{rgb:STYLE.totale}},
  font:{color:{rgb:STYLE.totaleTxt},bold:true,sz:11,name:"Century Gothic"},
  alignment:{horizontal:"center",vertical:"center"},
  border:{top:{style:"medium",color:{rgb:"000000"}},bottom:{style:"medium",color:{rgb:"000000"}},
    left:{style:"thin",color:{rgb:"888888"}},right:{style:"thin",color:{rgb:"888888"}}},
};
const bordo = {top:{style:"thin",color:{rgb:"DDDDDD"}},bottom:{style:"thin",color:{rgb:"DDDDDD"}},
  left:{style:"thin",color:{rgb:"DDDDDD"}},right:{style:"thin",color:{rgb:"DDDDDD"}}};

function styleCella(v, opts={}) {
  const {isTotale, colBg, num, center, bold} = opts;
  if (isTotale) return {v, s:{...S_TOTALE, numFmt: num?"#,##0.000":undefined}};
  const font = {sz:10, name:"Century Gothic", bold:bold||false};
  const fill = colBg ? {fgColor:{rgb:colBg}} : undefined;
  const alignment = center ? {horizontal:"center",vertical:"center"}
                     : num ? {horizontal:"right",vertical:"center"}
                     : {horizontal:"left",vertical:"center"};
  const s = {font,alignment,border:bordo};
  if (fill) s.fill = fill;
  if (num) s.numFmt = "#,##0.000";
  return {v:v??"",s};
}

// Foglio UBA unico con più riquadri (uno per specie), impilati verticalmente
function creaSheetUBACombinato(sezioni, colonne) {
  const ws = {};
  const merges = [];
  const rowHeights = [];
  const maxCol = colonne.length;
  let r = 0;

  sezioni.forEach(sez => {
    if(!sez.righe || sez.righe.length<=1) return; // niente dati reali oltre alla riga TOTALE: salto la specie

    // Riga titolo del riquadro, unita su tutte le colonne
    ws[XLSX.utils.encode_cell({c:0,r})] = {v: sez.titolo, s:{
      fill:{fgColor:{rgb:sez.colore}},
      font:{color:{rgb:"FFFFFF"},bold:true,sz:13,name:"Century Gothic"},
      alignment:{horizontal:"center",vertical:"center"},
    }};
    merges.push({s:{c:0,r}, e:{c:maxCol-1,r}});
    rowHeights[r] = {hpx:30};
    r++;

    // Intestazioni colonna
    colonne.forEach((col,ci)=>{
      ws[XLSX.utils.encode_cell({c:ci,r})] = {v:col.label, s:S_HEADER};
    });
    rowHeights[r] = {hpx:32};
    r++;

    // Righe dati
    sez.righe.forEach((riga,ri)=>{
      const isTotale = riga._isTotaleRow===true
        || (riga.BDN||"").toString().toUpperCase().startsWith("TOTALE");
      const rowBg = !isTotale && ri%2===1 ? STYLE.zebra : undefined;
      colonne.forEach((col,ci)=>{
        const val = riga[col.key];
        ws[XLSX.utils.encode_cell({c:ci,r})] = styleCella(val,
          {isTotale, colBg:rowBg, num:col.num, center:col.center, bold:isTotale||col.bold});
      });
      r++;
    });

    r++; // riga vuota di separazione tra un riquadro e il successivo
  });

  ws["!ref"] = XLSX.utils.encode_range({s:{c:0,r:0}, e:{c:maxCol-1,r:Math.max(0,r-1)}});
  ws["!merges"] = merges;
  ws["!cols"] = colonne.map(c=>({wch:c.width||14}));
  ws["!rows"] = rowHeights;
  return ws;
}

// Sheet formattato con colori per specie e riga TOTALE evidenziata
function creaSheetFormattato(righe, colonne) {
  const ws = {};
  const range = {s:{c:0,r:0},e:{c:colonne.length-1,r:righe.length}};

  // Intestazione
  colonne.forEach((col,ci)=>{
    const addr = XLSX.utils.encode_cell({c:ci,r:0});
    ws[addr] = {v:col.label, s:S_HEADER};
  });

  // Righe dati
  righe.forEach((riga,ri)=>{
    // Riconosco riga TOTALE via flag esplicita o via BDN iniziante per "TOTALE"
    const isTotale = riga._isTotaleRow === true
      || (riga.BDN||"").toString().toUpperCase().startsWith("TOTALE")
      || (riga[colonne[0]?.key]||"").toString().toUpperCase().startsWith("TOTALE");
    const specie = (riga.Specie||"").toLowerCase();
    let rowBg = ri%2===1 ? STYLE.zebra : undefined;
    // Colore per specie (solo se non totale)
    if (!isTotale) {
      if (specie==="bovino") rowBg = ri%2===1 ? STYLE.bovini : STYLE.bovini;
      else if (specie==="ovino") rowBg = ri%2===1 ? STYLE.ovini : STYLE.ovini;
      else if (specie==="suino") rowBg = ri%2===1 ? STYLE.suini : STYLE.suini;
    }
    colonne.forEach((col,ci)=>{
      const addr = XLSX.utils.encode_cell({c:ci,r:ri+1});
      const val = riga[col.key];
      const isNum = col.num;
      const bold = isTotale || col.bold;
      ws[addr] = styleCella(val, {isTotale, colBg:rowBg, num:isNum, center:col.center, bold});
    });
  });

  ws["!ref"] = XLSX.utils.encode_range(range);
  // Freeze prima riga (intestazione) e prima colonna (BDN)
  ws["!freeze"] = {xSplit:1, ySplit:1};
  // Filtri automatici su ogni colonna
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({s:{c:0,r:0}, e:{c:colonne.length-1,r:0}}) };
  // Larghezza colonne
  ws["!cols"] = colonne.map(c=>({wch:c.width||14}));
  // Altezza righe (intestazione più alta)
  ws["!rows"] = [{hpx:32}];
  return ws;
}

// ─── CALCOLO UBA PER EXPORT (allineato modulo v54) ─────────────────────────
const UBA_FASCE_EXP = {
  bovino: [{fino:210,coeff:0.40,label:"Vitella (<7 mesi)"},{fino:730,coeff:0.70,label:"Vitellone (7m-2a)"},{fino:Infinity,coeff:1.00,label:"Bovino adulto (≥2a)"}],
  suino: [{fino:90,coeff:0.027,label:"Lattonzolo (<3 mesi)"},{fino:365,coeff:0.30,label:"Magrone (3m-1a)"},{fino:Infinity,coeff:0.50,label:"Suino adulto (≥1a)"}],
  ovino: [{fino:120,coeff:0.027,label:"Agnello (<4 mesi)"},{fino:365,coeff:0.10,label:"Agnellone (4m-1a)"},{fino:Infinity,coeff:0.15,label:"Ovino adulto (≥1a)"}],
};

const MOTIVI_PRODUTTIVI_EXP = ["macellazione","macellato","venduto","riformato","riforma","vendita"];

// Perimetro annuale: solo se presenza effettiva nell'anno
function periodoNellAnnoExp(nascita, dataIngresso, dataUscita, stato, anno) {
  if(!nascita) return null;
  const inizioAnno = new Date(anno, 0, 1);
  const fineAnno   = new Date(anno, 11, 31, 23, 59, 59);
  const oggi = new Date();
  const dataNascita = new Date(nascita);
  // Il periodo di presenza in azienda parte dall'ingresso (acquisto/trasferimento) se noto,
  // altrimenti dalla nascita (animale nato in azienda: nascita = ingresso).
  const dataPresenzaInizio = dataIngresso ? new Date(dataIngresso) : dataNascita;
  const dataFine = dataUscita ? new Date(dataUscita) : (oggi < fineAnno ? oggi : fineAnno);
  if(dataFine < inizioAnno) return null;
  if(dataPresenzaInizio > fineAnno) return null;
  const inizio = dataPresenzaInizio > inizioAnno ? dataPresenzaInizio : inizioAnno;
  const fine   = dataFine < fineAnno ? dataFine : fineAnno;
  return {
    inizio: inizio.toISOString().split("T")[0],
    fine:   fine.toISOString().split("T")[0],
    giorni: Math.round((fine - inizio) / 86400000) + 1,
    // Età sempre calcolata dalla vera data di nascita, indipendentemente da quando
    // l'animale è arrivato in questa azienda — determina il coefficiente UBA corretto.
    etaAllInizio: Math.round((inizio - dataNascita) / 86400000),
  };
}

function calcolaUBAMedioExp(specie, giorni, etaAllInizio) {
  if(!specie || !UBA_FASCE_EXP[specie] || giorni <= 0) return null;
  const fasce = UBA_FASCE_EXP[specie];
  let uba = 0;
  for(let i=0; i<fasce.length; i++){
    const prev = i>0 ? fasce[i-1].fino : 0;
    const {fino, coeff} = fasce[i];
    const iniz = Math.max(prev, etaAllInizio);
    const finz = Math.min(fino===Infinity?etaAllInizio+giorni+1:fino, etaAllInizio+giorni);
    if(finz > iniz) uba += (finz - iniz) * coeff;
  }
  return Math.round(uba/giorni*1000)/1000;
}

function categoriaEtàExp(specie, etaAllInizio, giorni) {
  if(!UBA_FASCE_EXP[specie]) return "—";
  const etaFinale = etaAllInizio + giorni;
  for(const {fino, label} of UBA_FASCE_EXP[specie]) if(etaFinale < fino) return label;
  return UBA_FASCE_EXP[specie].at(-1).label;
}

function categoriaContabileExp(animale) {
  if(animale.stato === "attivo") return animale.riproduttore ? "riproduttore" : "produttivo";
  const motivo = (animale.motivo_uscita||"").toLowerCase();
  const isProduttivo = MOTIVI_PRODUTTIVI_EXP.some(k => motivo.includes(k));
  if(isProduttivo) return animale.riproduttore ? "riproduttore" : "produttivo";
  return "improduttivo_uscito";
}

// Colonne UBA complete (allineate al modulo v54)
const COL_UBA = [
  {key:"BDN",                    label:"BDN / Matricola",           width:20, bold:true},
  {key:"NUMERO CAPI",            label:"N° Capi",                   width:9,  center:true, num:true},
  {key:"Nome",                   label:"Nome",                      width:18},
  {key:"Specie",                 label:"Specie",                    width:10, center:true},
  {key:"Razza",                  label:"Razza",                     width:16},
  {key:"Categoria età",          label:"Categoria età",             width:22},
  {key:"Data nascita",           label:"Data nascita",              width:13, center:true},
  {key:"Data ingresso",          label:"Data ingresso",             width:13, center:true},
  {key:"Giorni permanenza",      label:"Giorni permanenza",         width:11, center:true, num:true},
  {key:"Inizio periodo",         label:"Inizio periodo",            width:13, center:true},
  {key:"Fine periodo",           label:"Fine periodo",              width:13, center:true},
  {key:"Giorni",                 label:"Giorni (nell'anno)",        width:8,  center:true, num:true},
  {key:"UBA medio",              label:"UBA medio",                 width:11, num:true},
  {key:"UBA-giorni",             label:"UBA-giorni",                width:12, num:true, bold:true},
  {key:"Categoria contabile",    label:"Categoria contabile",       width:20},
  {key:"Qualifica",              label:"Qualifica",                 width:16},
  {key:"Motivo uscita",          label:"Motivo uscita",             width:20},
  {key:"IPG peso vivo",          label:"IPG peso vivo (kg/gg)",     width:13, num:true},
  {key:"IPG carcassa",           label:"IPG carcassa (kg/gg)",      width:13, num:true},
  {key:"Costo iniziale",         label:"Costo iniziale (€)",        width:14, cur:true},
  {key:"Tipo costo iniziale",    label:"Tipo costo iniziale",       width:18},
  {key:"Costi mant. cumulati",   label:"Costi mant. cumulati (€)",  width:16, cur:true},
  {key:"V(t) riforma",           label:"V(t) riforma stimato (€)",  width:16, cur:true},
  {key:"Quota scaricata figli",  label:"Quota scaricata figli (€)", width:16, cur:true},
  {key:"Costo netto residuo",    label:"Costo netto residuo (€)",   width:16, cur:true, bold:true},
  {key:"Lotto",                  label:"Lotto",                     width:12, center:true},
];

const COL_RIEP = [
  {key:"Specie",             label:"Specie",             width:22, bold:true},
  {key:"Categoria",          label:"Categoria",          width:24},
  {key:"N° Capi",            label:"N° Capi",            width:10, center:true, num:true},
  {key:"UBA medio unitario", label:"UBA medio unitario", width:16, num:true},
  {key:"UBA-giorni totali",  label:"UBA-giorni totali",  width:16, num:true, bold:true},
];

// Costruzione righe per anno (accetta anno opzionale, default anno corrente)
function fogli_uba(animali, lotti, suiniLotto, prezziRiforma, annoRif, costiGenerali, costiAnimale) {
  const anno = annoRif || new Date().getFullYear();
  const righe = [];
  const perLotto = {}; // codLotto -> {ubaGiorni, vRiforma, nCapi}

  for(const a of animali) {
    if(!a.specie || !UBA_FASCE_EXP[a.specie]) continue;
    const nascita = a.nascita || a.data_ingresso;
    if(!nascita) continue;
    const periodo = periodoNellAnnoExp(nascita, a.data_ingresso, a.data_uscita, a.stato, anno);
    if(!periodo) continue;
    const uba = calcolaUBAMedioExp(a.specie, periodo.giorni, periodo.etaAllInizio);
    if(!uba) continue;
    const ubaGiorni = Math.round(uba * periodo.giorni * 1000) / 1000;
    const cat = categoriaContabileExp(a);

    const prezzo = (prezziRiforma||[]).find(p => p.specie===a.specie && p.razza===(a.razza_calcolata||a.razza));
    const pesoStimato = a.peso_attuale || a.peso_vivo_uscita || 0;
    const vRiforma = prezzo && pesoStimato
      ? Math.round(pesoStimato * prezzo.prezzo_kg_vivo * (prezzo.resa_percentuale/100) * 100) / 100
      : 0;

    const costoIniz = a.costo_iniziale || 0;
    const mantCum   = a.costi_mantenimento_cumulati || 0;
    const quotaFig  = a.quota_scaricata_figli || 0;
    const costoNetto = Math.max(0, costoIniz + mantCum - quotaFig - vRiforma);

    const dataIngresso = a.data_ingresso || nascita;
    const dataRif = a.data_uscita || new Date().toISOString().slice(0,10);
    const ggPermanenza = dataIngresso
      ? Math.round((new Date(dataRif)-new Date(dataIngresso))/86400000) : 0;
    const acquistatoA = a.provenienza==="Acquistato";
    const guadagnoPesoA = acquistatoA
      ? (a.peso_vivo_uscita!=null&&a.peso_nascita!=null ? a.peso_vivo_uscita-a.peso_nascita : null)
      : a.peso_vivo_uscita;

    righe.push({
      "_categoria_key": cat,
      "BDN": a.bdn||"",
      "NUMERO CAPI": "",
      "Nome": a.nome||"",
      "Specie": a.specie,
      "Razza": a.razza_calcolata||a.razza||"",
      "Categoria età": categoriaEtàExp(a.specie, periodo.etaAllInizio, periodo.giorni),
      "Data nascita": nascita,
      "Data ingresso": dataIngresso,
      "Giorni permanenza": ggPermanenza>0?ggPermanenza:"",
      "Inizio periodo": periodo.inizio,
      "Fine periodo": periodo.fine,
      "Giorni": periodo.giorni,
      "UBA medio": uba,
      "UBA-giorni": ubaGiorni,
      "Categoria contabile": cat,
      "Qualifica": a.riproduttore ? (a.sesso==="M"?"Riproduttore":"Riproduttrice") : "",
      "Motivo uscita": a.motivo_uscita||"",
      "IPG peso vivo": ggPermanenza>0&&guadagnoPesoA!=null ? Math.round(guadagnoPesoA/ggPermanenza*1000)/1000 : "",
      "IPG carcassa":  ggPermanenza>0&&a.peso_carcassa       ? Math.round(a.peso_carcassa/ggPermanenza*1000)/1000 : "",
      "Costo iniziale": costoIniz,
      "Tipo costo iniziale": a.tipo_costo_iniziale||"",
      "Costi mant. cumulati": mantCum,
      "V(t) riforma": vRiforma,
      "Quota scaricata figli": quotaFig,
      "Costo netto residuo": costoNetto,
      "Lotto": "",
    });
  }

  // Suini da lotto
  for(const l of lotti) {
    if(!l.data_parto) continue;
    const codLotto = l.codice_lotto||l.codice||"";
    const unitaLotto = suiniLotto.filter(x=>x.lotto_id===l.id);
    const nTotaleLotto = l.nati_totali||unitaLotto.length;
    // Per i lotti acquistati, il prezzo pagato va allocato pro-capite come costo iniziale
    const costoInizPerCapo = (l.tipo_provenienza==="acquistato" && l.prezzo_acquisto && nTotaleLotto)
      ? Math.round(l.prezzo_acquisto / nTotaleLotto * 100) / 100
      : 0;

    for(const u of unitaLotto) {
      if(u.stato==="registrato_individuale") continue;
      const finto = {
        nascita: l.data_parto,
        data_uscita: u.data_uscita,
        stato: u.stato==="attivo" ? "attivo" : "uscito",
        motivo_uscita: u.motivo_uscita,
        riproduttore: false,
      };
      const periodo = periodoNellAnnoExp(finto.nascita, finto.nascita, finto.data_uscita, finto.stato, anno);
      if(!periodo) continue;
      const uba = calcolaUBAMedioExp("suino", periodo.giorni, periodo.etaAllInizio);
      if(!uba) continue;
      const ubaGiorni = Math.round(uba * periodo.giorni * 1000) / 1000;
      const cat = categoriaContabileExp(finto);
      const codice = u.codice_completo || `${codLotto}${String(u.nr).padStart(2,"0")}`;

      const prezzoU = (prezziRiforma||[]).find(p => p.specie==="suino" && p.razza===(l.razza_madre||""));
      const pesoU = u.peso_vivo_uscita || 0;
      const vRiformaU = prezzoU && pesoU
        ? Math.round(pesoU * prezzoU.prezzo_kg_vivo * (prezzoU.resa_percentuale/100) * 100) / 100
        : 0;
      const costoNettoU = Math.max(0, costoInizPerCapo - vRiformaU);

      const dataIngressoU = l.data_parto;
      const dataRifU = u.data_uscita || new Date().toISOString().slice(0,10);
      const ggPermanenzaU = dataIngressoU
        ? Math.round((new Date(dataRifU)-new Date(dataIngressoU))/86400000) : 0;
      const acquistatoU = l.tipo_provenienza==="acquistato";
      const guadagnoPesoU = acquistatoU
        ? (u.peso_vivo_uscita!=null&&u.peso_nascita!=null ? u.peso_vivo_uscita-u.peso_nascita : null)
        : u.peso_vivo_uscita;

      if(!perLotto[codLotto]) perLotto[codLotto] = {ubaGiorni:0, vRiforma:0, nCapi:0};
      perLotto[codLotto].ubaGiorni += ubaGiorni;
      perLotto[codLotto].vRiforma  += vRiformaU;
      perLotto[codLotto].nCapi     += 1;

      righe.push({
        "_categoria_key": cat,
        "BDN": codice,
        "NUMERO CAPI": "",
        "Nome": "",
        "Specie": "suino",
        "Razza": l.razza_madre||"",
        "Categoria età": categoriaEtàExp("suino", periodo.etaAllInizio, periodo.giorni),
        "Data nascita": l.data_parto,
        "Data ingresso": dataIngressoU,
        "Giorni permanenza": ggPermanenzaU>0?ggPermanenzaU:"",
        "Inizio periodo": periodo.inizio,
        "Fine periodo": periodo.fine,
        "Giorni": periodo.giorni,
        "UBA medio": uba,
        "UBA-giorni": ubaGiorni,
        "Categoria contabile": cat,
        "Qualifica": "",
        "Motivo uscita": u.motivo_uscita||"",
        "IPG peso vivo": ggPermanenzaU>0&&guadagnoPesoU!=null ? Math.round(guadagnoPesoU/ggPermanenzaU*1000)/1000 : "",
        "IPG carcassa":  ggPermanenzaU>0&&u.peso_carcassa       ? Math.round(u.peso_carcassa/ggPermanenzaU*1000)/1000 : "",
        "Costo iniziale": costoInizPerCapo,
        "Tipo costo iniziale": l.tipo_provenienza==="acquistato" ? "acquisto_lotto" : "pre_migrazione",
        "Costi mant. cumulati": 0,
        "V(t) riforma": vRiformaU,
        "Quota scaricata figli": 0,
        "Costo netto residuo": costoNettoU,
        "Lotto": codLotto,
      });
    }
  }

  // ── Allocazione costo di nascita per lotto (stesso motore [C(t)-V(t)]/F(t), esteso al gruppo) ──
  // C(t): costi generali + costi animale dell'anno di riferimento
  const annoDi = d => d ? new Date(d).getFullYear() : null;
  const cTot = (costiGenerali||[]).filter(c=>annoDi(c.data_inizio)===anno).reduce((s,c)=>s+(parseFloat(c.importo)||0),0)
             + (costiAnimale||[]).filter(c=>annoDi(c.data)===anno).reduce((s,c)=>s+(parseFloat(c.importo)||0),0);
  // F(t): UBA-giorni totali dell'anno (tutto il perimetro aziendale, animali + lotti)
  const fTot = righe.reduce((s,r)=>s+(r["UBA-giorni"]||0), 0);
  // V(t): valore riforma totale dell'anno (animali + unità di lotto)
  const vTot = righe.reduce((s,r)=>s+(r["V(t) riforma"]||0), 0);
  const rateUbaGiorno = fTot>0 ? (cTot - vTot) / fTot : 0;

  const costoNascitaPerLotto = {};
  Object.entries(perLotto).forEach(([cod, v]) => {
    const costoTot = Math.max(0, rateUbaGiorno * v.ubaGiorni);
    costoNascitaPerLotto[cod] = {
      costoTotale: Math.round(costoTot*100)/100,
      costoPerCapo: v.nCapi>0 ? Math.round(costoTot/v.nCapi*100)/100 : 0,
      ubaGiorni: Math.round(v.ubaGiorni*1000)/1000,
      nCapi: v.nCapi,
    };
  });


  // Riepilogo per specie e categoria
  const riepilogo = [];
  ["bovino","suino","ovino"].forEach(sp => {
    const rSp = righe.filter(r=>r.Specie===sp);
    if(!rSp.length) return;
    ["produttivo","riproduttore","improduttivo_uscito"].forEach(cat => {
      const rCat = rSp.filter(r=>r["_categoria_key"]===cat);
      if(!rCat.length) return;
      riepilogo.push({
        "Specie": sp,
        "Categoria": cat,
        "N° Capi": rCat.length,
        "UBA medio unitario": Math.round(rCat.reduce((s,r)=>s+r["UBA medio"],0)/rCat.length*1000)/1000,
        "UBA-giorni totali": Math.round(rCat.reduce((s,r)=>s+r["UBA-giorni"],0)*1000)/1000,
      });
    });
    riepilogo.push({
      "Specie": sp.toUpperCase()+" TOTALE",
      "Categoria": "",
      "N° Capi": rSp.length,
      "UBA medio unitario": "",
      "UBA-giorni totali": Math.round(rSp.reduce((s,r)=>s+r["UBA-giorni"],0)*1000)/1000,
    });
  });
  riepilogo.push({
    "Specie": "TOTALE AZIENDALE",
    "Categoria": "",
    "N° Capi": righe.length,
    "UBA medio unitario": "",
    "UBA-giorni totali": Math.round(righe.reduce((s,r)=>s+r["UBA-giorni"],0)*1000)/1000,
  });

  // Righe TOTALE per specie (aggiunte alla fine di ogni foglio specie)
  const rigaTotale = (label, arr) => ({
    "_categoria_key": "totale",
    "BDN": label,
    "NUMERO CAPI": arr.length,
    "Nome":"","Specie":"","Razza":"","Categoria età":"","Data nascita":"",
    "Inizio periodo":"","Fine periodo":"","Giorni":"","UBA medio":"",
    "UBA-giorni": Math.round(arr.reduce((s,r)=>s+r["UBA-giorni"],0)*1000)/1000,
    "Categoria contabile":"","Qualifica":"","Motivo uscita":"",
    "Costo iniziale": Math.round(arr.reduce((s,r)=>s+(r["Costo iniziale"]||0),0)*100)/100,
    "Tipo costo iniziale":"",
    "Costi mant. cumulati": Math.round(arr.reduce((s,r)=>s+(r["Costi mant. cumulati"]||0),0)*100)/100,
    "V(t) riforma": Math.round(arr.reduce((s,r)=>s+(r["V(t) riforma"]||0),0)*100)/100,
    "Quota scaricata figli": Math.round(arr.reduce((s,r)=>s+(r["Quota scaricata figli"]||0),0)*100)/100,
    "Costo netto residuo": Math.round(arr.reduce((s,r)=>s+(r["Costo netto residuo"]||0),0)*100)/100,
    "Lotto":"",
  });

  const righeBov = righe.filter(r=>r.Specie==="bovino");
  const righeOv  = righe.filter(r=>r.Specie==="ovino");
  const righeSu  = righe.filter(r=>r.Specie==="suino");

  return {
    riepilogo,
    dettaglio: [...righe, rigaTotale("TOTALE AZIENDALE", righe)],
    bovini:    [...righeBov, rigaTotale("TOTALE BOVINI", righeBov)],
    ovini:     [...righeOv,  rigaTotale("TOTALE OVINI",  righeOv)],
    suini:     [...righeSu,  rigaTotale("TOTALE SUINI E LOTTI", righeSu)],
    anno,
    costoNascitaPerLotto,
    cTot: Math.round(cTot*100)/100,
    vTot: Math.round(vTot*100)/100,
    fTot: Math.round(fTot*1000)/1000,
    rateUbaGiorno: Math.round(rateUbaGiorno*10000)/10000,
  };
}

// ─── SCADENZE RICHIAMI SANITARI ────────────────────────────────────────────
function foglio_scadenze(eventi, animali, tipo) {
  // tipo: "scaduti" | "imminenti" | "programmati"
  const oggi = new Date(today());
  const in30 = new Date(oggi); in30.setDate(oggi.getDate()+30);
  const in90 = new Date(oggi); in90.setDate(oggi.getDate()+90);

  const filtrati = (eventi||[]).filter(e => {
    if (!e.scadenza) return false;
    const sc = new Date(e.scadenza);
    if (tipo === "scaduti") return sc < oggi;
    if (tipo === "imminenti") return sc >= oggi && sc <= in30;
    if (tipo === "programmati") return sc > in30 && sc <= in90;
    return false;
  }).sort((a,b) => new Date(a.scadenza) - new Date(b.scadenza));

  const righe = filtrati.map(e => {
    const a = e.animale_id ? animali.find(x=>x.id===e.animale_id) : null;
    const gg = Math.round((new Date(e.scadenza) - oggi)/86400000);
    return {
      "Data scadenza":   e.scadenza,
      "Giorni":          tipo === "scaduti" ? -gg : gg,
      "Stato":           tipo === "scaduti" ? `Scaduto da ${-gg} gg` : `Tra ${gg} gg`,
      "BDN":             a?a.bdn:"—",
      "Nome":            a?a.nome:"",
      "Specie":          a?a.specie:"",
      "Tipo evento":     e.tipo||"",
      "Descrizione":     e.descrizione||"",
      "Prodotto":        e.prodotto||"",
      "Veterinario":     e.veterinario||"",
      "Data ultimo":     e.data||"",
      "Costo (€)":       e.costo||"",
    };
  });

  if (righe.length === 0) {
    righe.push({
      "Data scadenza":"","Giorni":"","Stato":"","BDN":"","Nome":"","Specie":"",
      "Tipo evento":"","Descrizione": tipo==="scaduti"
        ? "✓ Nessun richiamo scaduto — tutto in regola"
        : tipo==="imminenti"
          ? "✓ Nessun richiamo in scadenza nei prossimi 30 giorni"
          : "✓ Nessun richiamo programmato tra 30 e 90 giorni",
      "Prodotto":"","Veterinario":"","Data ultimo":"","Costo (€)":"",
    });
  }

  return creaFoglio(righe, [
    {key:"Data scadenza", label:"Data scadenza",  width:13, center:true, bold:true},
    {key:"Giorni",        label:"Giorni",         width:8,  num:true, center:true},
    {key:"Stato",         label:"Stato",          width:16, bold:true},
    {key:"BDN",           label:"BDN",            width:20},
    {key:"Nome",          label:"Nome",           width:16},
    {key:"Specie",        label:"Specie",         width:10, center:true},
    {key:"Tipo evento",   label:"Tipo evento",    width:16},
    {key:"Descrizione",   label:"Descrizione",    width:26},
    {key:"Prodotto",      label:"Prodotto",       width:18},
    {key:"Veterinario",   label:"Veterinario",    width:18},
    {key:"Data ultimo",   label:"Data ultimo trattamento", width:14, center:true},
    {key:"Costo (€)",     label:"Costo (€)",      width:12, cur:true, sumTotale:true},
  ], {totale:filtrati.length>0, contaRighe:true,
    totaleLabel: tipo==="scaduti"?"TOTALE SCADUTI":tipo==="imminenti"?"TOTALE IMMINENTI (30gg)":"TOTALE PROGRAMMATI (30-90gg)"});
}

// ─── CONSANGUINEITÀ ─────────────────────────────────────────────────────────
function analizzaAccoppiamentiRischio(animali) {
  const attivi = animali.filter(a=>a.stato==="attivo"&&a.vivo!==false);
  const maschi   = attivi.filter(a=>a.sesso==="M");
  const femmine  = attivi.filter(a=>a.sesso==="F");
  const rischi = [];

  for(const m of maschi){
    for(const f of femmine){
      if(m.specie!==f.specie) continue;
      let tipo=null;
      if(f.padre_id===m.id) tipo="Padre × Figlia";
      else if(m.madre_id===f.id) tipo="Madre × Figlio";
      else {
        const stessoPadre = m.padre_id&&f.padre_id&&m.padre_id===f.padre_id;
        const stessaMadre = m.madre_id&&f.madre_id&&m.madre_id===f.madre_id;
        if(stessoPadre&&stessaMadre) tipo="Fratelli pieni";
        else if(stessoPadre) tipo="Fratellastri (stesso padre)";
        else if(stessaMadre) tipo="Fratellastri (stessa madre)";
      }
      if(tipo) rischi.push({m,f,tipo});
    }
  }
  return rischi;
}

function analizzaCapiInconsanguinei(animali) {
  const result = [];
  for(const a of animali){
    if(a.stato!=="attivo"||a.vivo===false) continue;
    if(!a.padre_id||!a.madre_id) continue;
    const padre = animali.find(x=>x.id===a.padre_id);
    const madre = animali.find(x=>x.id===a.madre_id);
    if(!padre||!madre) continue;
    let tipo=null;
    if(madre.padre_id===padre.id) tipo="Padre × Figlia";
    else if(padre.madre_id===madre.id) tipo="Madre × Figlio";
    else {
      const stessoPadre = padre.padre_id&&madre.padre_id&&padre.padre_id===madre.padre_id;
      const stessaMadre = padre.madre_id&&madre.madre_id&&padre.madre_id===madre.madre_id;
      if(stessoPadre&&stessaMadre) tipo="Genitori fratelli pieni";
      else if(stessoPadre||stessaMadre) tipo="Genitori fratellastri";
    }
    if(tipo) result.push({a,padre,madre,tipo});
  }
  return result;
}

function foglio_consang_rischi(animali) {
  const rischi = analizzaAccoppiamentiRischio(animali);
  const righe = rischi.map(r=>({
    "Specie": r.m.specie,
    "Tipo rischio": r.tipo,
    "Maschio BDN": r.m.bdn||"",
    "Maschio Nome": r.m.nome||"",
    "Maschio Razza": r.m.razza_calcolata||r.m.razza||"",
    "Femmina BDN": r.f.bdn||"",
    "Femmina Nome": r.f.nome||"",
    "Femmina Razza": r.f.razza_calcolata||r.f.razza||"",
    "Info": "",
  }));
  if(righe.length===0) {
    righe.push({
      "Specie":"","Tipo rischio":"","Maschio BDN":"","Maschio Nome":"",
      "Maschio Razza":"","Femmina BDN":"","Femmina Nome":"","Femmina Razza":"",
      "Info":"✓ Nessun accoppiamento a rischio rilevato — situazione ottimale",
    });
  }
  return creaFoglio(righe, [
    {key:"Specie",         label:"Specie",              width:10, center:true},
    {key:"Tipo rischio",   label:"Tipo rischio",        width:24, bold:true},
    {key:"Maschio BDN",    label:"Maschio BDN",         width:20},
    {key:"Maschio Nome",   label:"Maschio Nome",        width:18},
    {key:"Maschio Razza",  label:"Maschio Razza",       width:18},
    {key:"Femmina BDN",    label:"Femmina BDN",         width:20},
    {key:"Femmina Nome",   label:"Femmina Nome",        width:18},
    {key:"Femmina Razza",  label:"Femmina Razza",       width:18},
    {key:"Info",           label:"Info",                width:40},
  ], {totale:rischi.length>0, contaRighe:true, totaleLabel:"TOTALE COPPIE A RISCHIO"});
}

function foglio_consang_capi(animali) {
  const capi = analizzaCapiInconsanguinei(animali);
  const righe = capi.map(x=>({
    "Specie": x.a.specie,
    "BDN": x.a.bdn||"",
    "Nome": x.a.nome||"",
    "Sesso": x.a.sesso,
    "Razza calcolata": x.a.razza_calcolata||x.a.razza||"",
    "Data nascita": x.a.nascita||"",
    "Tipo consanguineità": x.tipo,
    "Padre BDN": x.padre.bdn||"",
    "Padre Nome": x.padre.nome||"",
    "Madre BDN": x.madre.bdn||"",
    "Madre Nome": x.madre.nome||"",
    "Info": "",
  }));
  if(righe.length===0) {
    righe.push({
      "Specie":"","BDN":"","Nome":"","Sesso":"","Razza calcolata":"",
      "Data nascita":"","Tipo consanguineità":"","Padre BDN":"","Padre Nome":"",
      "Madre BDN":"","Madre Nome":"",
      "Info":"✓ Nessun capo con consanguineità nella genealogia — situazione ottimale",
    });
  }
  return creaFoglio(righe, [
    {key:"Specie",              label:"Specie",             width:10, center:true},
    {key:"BDN",                 label:"BDN",                width:20, bold:true},
    {key:"Nome",                label:"Nome",               width:18},
    {key:"Sesso",               label:"Sesso",              width:8,  center:true},
    {key:"Razza calcolata",     label:"Razza calcolata",    width:18},
    {key:"Data nascita",        label:"Data nascita",       width:13, center:true},
    {key:"Tipo consanguineità", label:"Tipo consanguineità",width:26, bold:true},
    {key:"Padre BDN",           label:"Padre BDN",          width:20},
    {key:"Padre Nome",          label:"Padre Nome",         width:18},
    {key:"Madre BDN",           label:"Madre BDN",          width:20},
    {key:"Madre Nome",          label:"Madre Nome",         width:18},
    {key:"Info",                label:"Info",               width:40},
  ], {totale:capi.length>0, contaRighe:true, totaleLabel:"TOTALE CAPI CONSANGUINEI"});
}

// ─── SEZIONI DISPONIBILI ──────────────────────────────────────────────────────
const SEZIONI = [
  { id:"costi_acquisto",           label:"Costi Acquisto (animali e lotti)", icon:"🧾", gruppo:"ACQUISTI" },
  { id:"anagrafica_bovini",       label:"Bovini attivi",             icon:"🐄", gruppo:"ANIMALI ATTIVI" },
  { id:"anagrafica_suini",        label:"Suini attivi",              icon:"🐷", gruppo:"ANIMALI ATTIVI" },
  { id:"anagrafica_ovini",        label:"Ovini attivi",              icon:"🐑", gruppo:"ANIMALI ATTIVI" },
  { id:"anagrafica_bovini_usciti",label:"Bovini usciti",             icon:"🐄", gruppo:"ANIMALI USCITI" },
  { id:"anagrafica_suini_usciti", label:"Suini usciti",              icon:"🐷", gruppo:"ANIMALI USCITI" },
  { id:"anagrafica_ovini_usciti", label:"Ovini usciti",              icon:"🐑", gruppo:"ANIMALI USCITI" },
  { id:"uscite",             label:"Registro Uscite",           icon:"📤", gruppo:"MOVIMENTI" },
  { id:"parti",              label:"Registro Parti",            icon:"🐣", gruppo:"MOVIMENTI" },
  { id:"sanitario",          label:"Registro Sanitario",        icon:"💉", gruppo:"REGISTRI" },
  { id:"alimentazione",      label:"Alimentazione",             icon:"🌾", gruppo:"REGISTRI" },
  { id:"lotti_riepilogo",    label:"Lotti Suini — Riepilogo (tutti)", icon:"📋", gruppo:"LOTTI SUINI" },
  { id:"lotti_attivi",       label:"Lotti Attivi",              icon:"🟢", gruppo:"LOTTI SUINI" },
  { id:"lotti_usciti",       label:"Lotti Usciti/Chiusi",       icon:"🔴", gruppo:"LOTTI SUINI" },
  { id:"lotti_unita",        label:"Lotti Suini — Unità (tutte)",icon:"🏷️", gruppo:"LOTTI SUINI" },
  { id:"unita_attive",       label:"Unità di Lotto — Attive",   icon:"🟢", gruppo:"LOTTI SUINI" },
  { id:"unita_uscite",       label:"Unità di Lotto — Uscite",   icon:"🔴", gruppo:"LOTTI SUINI" },
  { id:"kpi_selezione",      label:"Selezione Genetica (KPI)",  icon:"🏆", gruppo:"GENETICA" },
  { id:"costi_animale",      label:"Costi per Animale",         icon:"🧾", gruppo:"COSTI" },
  { id:"costi_generali",     label:"Costi Generali",            icon:"📊", gruppo:"COSTI" },
  { id:"macchinari",         label:"Macchinari / Ammortamenti", icon:"🏭", gruppo:"COSTI" },
  { id:"uba_riepilogo",      label:"UBA — Riepilogo per specie",icon:"🐾", gruppo:"UBA" },
  { id:"uba_dettaglio",      label:"UBA — Dettaglio tutti",     icon:"📋", gruppo:"UBA" },
  { id:"uba_bovini",         label:"UBA — Bovini",              icon:"🐄", gruppo:"UBA" },
  { id:"uba_ovini",          label:"UBA — Ovini",               icon:"🐑", gruppo:"UBA" },
  { id:"uba_suini",          label:"UBA — Suini e Lotti",       icon:"🐷", gruppo:"UBA" },
  { id:"uba_combinato",      label:"UBA — Foglio unico a riquadri per specie", icon:"📐", gruppo:"UBA" },
  { id:"scadenze_scaduti",   label:"Richiami SCADUTI",          icon:"⚠️", gruppo:"SCADENZE SANITARIE" },
  { id:"scadenze_imminenti", label:"Richiami in scadenza 30gg", icon:"⏰", gruppo:"SCADENZE SANITARIE" },
  { id:"scadenze_programmati",label:"Richiami programmati 30-90gg",icon:"📅",gruppo:"SCADENZE SANITARIE" },
  { id:"consang_rischi",     label:"Accoppiamenti a rischio",   icon:"⚠️", gruppo:"CONSANGUINEITÀ" },
  { id:"consang_capi",       label:"Capi con genealogia consanguinea", icon:"🧬", gruppo:"CONSANGUINEITÀ" },
];

// ─── COMPONENTE PRINCIPALE ────────────────────────────────────────────────────
export default function ExportManager() {
  const [sel,setSel]       = useState(new Set(SEZIONI.map(s=>s.id)));
  const [loading,setLoading] = useState(false);
  const [dataDa,setDataDa] = useState("");
  const [dataA,setDataA]   = useState(today());
  const [annoUba,setAnnoUba] = useState(new Date().getFullYear());

  const toggle = id => setSel(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const selAll  = () => setSel(new Set(SEZIONI.map(s=>s.id)));
  const deselAll= () => setSel(new Set());

  const gruppi = [...new Set(SEZIONI.map(s=>s.gruppo))];

  const genera = async () => {
    if(sel.size===0) return;
    setLoading(true);
    try {
      // Carico solo i dati necessari
      const [
        {data:animali},{data:prezziRif},{data:sanitari},{data:alim},
        {data:evRiprod},{data:costiAnim},{data:costiGen},{data:macchinari},
        {data:lotti},{data:suiniLotto}
      ] = await Promise.all([
        supabase.from("animali").select("id,bdn,nome,specie,sesso,nascita,stato,data_uscita,motivo_uscita,causa_morte,data_ingresso,razza,razza_calcolata,categoria,peso_nascita,peso_ingresso,peso_attuale,provenienza,origine,fornitore,data_fattura,numero_fattura,prezzo_acquisto,lotto_box,destinazione,resa_percent,peso_carcassa,peso_vivo_uscita,note_sanitarie,note,riproduttore,data_registrazione_bdn,padre_id,madre_id,costo_iniziale,tipo_costo_iniziale,costi_mantenimento_cumulati,quota_scaricata_figli,valore_v_riforma,categoria_contabile").order("specie").order("nome"),
        supabase.from("prezzi_riforma").select("*"),
        supabase.from("eventi_sanitari").select("*").order("data",{ascending:false}),
        supabase.from("alimentazione").select("*").order("data",{ascending:false}),
        supabase.from("eventi_riproduttivi").select("*").order("data_evento",{ascending:false}),
        supabase.from("costi_animale").select("*").order("data",{ascending:false}),
        supabase.from("costi_generali").select("*").order("data_inizio",{ascending:false}),
        supabase.from("macchinari").select("*").order("nome"),
        supabase.from("lotti_suini").select("*").order("data_parto",{ascending:false}),
        supabase.from("suini_lotto").select("*").order("lotto_id").order("nr"),
      ]);

      const an = animali||[];
      // Filtra per data se specificata
      const filtraData = (arr, campo) => arr.filter(r => {
        if(dataDa&&r[campo]&&r[campo]<dataDa) return false;
        if(dataA&&r[campo]&&r[campo]>dataA)   return false;
        return true;
      });

      const wb = XLSX.utils.book_new();

      if(sel.has("anagrafica_bovini"))
        XLSX.utils.book_append_sheet(wb, foglio_anagrafica(an.filter(a=>a.specie==="bovino"&&a.stato==="attivo")), "Bovini attivi");
      if(sel.has("anagrafica_suini"))
        XLSX.utils.book_append_sheet(wb, foglio_anagrafica(an.filter(a=>a.specie==="suino"&&a.stato==="attivo")), "Suini attivi");
      if(sel.has("anagrafica_ovini"))
        XLSX.utils.book_append_sheet(wb, foglio_anagrafica(an.filter(a=>a.specie==="ovino"&&a.stato==="attivo")), "Ovini attivi");
      if(sel.has("anagrafica_bovini_usciti"))
        XLSX.utils.book_append_sheet(wb, foglio_anagrafica(an.filter(a=>a.specie==="bovino"&&a.stato!=="attivo")), "Bovini usciti");
      if(sel.has("anagrafica_suini_usciti"))
        XLSX.utils.book_append_sheet(wb, foglio_anagrafica(an.filter(a=>a.specie==="suino"&&a.stato!=="attivo")), "Suini usciti");
      if(sel.has("anagrafica_ovini_usciti"))
        XLSX.utils.book_append_sheet(wb, foglio_anagrafica(an.filter(a=>a.specie==="ovino"&&a.stato!=="attivo")), "Ovini usciti");
      if(sel.has("uscite"))
        XLSX.utils.book_append_sheet(wb, foglio_uscite(an, suiniLotto||[], lotti||[]), "Uscite");
      if(sel.has("parti"))
        XLSX.utils.book_append_sheet(wb, foglio_parti(filtraData(evRiprod||[],"data_evento"), an), "Parti");
      if(sel.has("sanitario"))
        XLSX.utils.book_append_sheet(wb, foglio_sanitario(filtraData(sanitari||[],"data"), an, suiniLotto||[], lotti||[]), "Sanitario");
      if(sel.has("alimentazione"))
        XLSX.utils.book_append_sheet(wb, foglio_alimentazione(filtraData(alim||[],"data")), "Alimentazione");
      // Calcolo il motore UBA in anticipo se serve sia per i fogli UBA sia per il costo di nascita nei lotti
      const needUba = sel.has("uba_riepilogo")||sel.has("uba_dettaglio")||
                      sel.has("uba_bovini")||sel.has("uba_ovini")||sel.has("uba_suini")||
                      sel.has("uba_combinato");
      const needCostoLotti = sel.has("lotti_riepilogo")||sel.has("lotti_attivi")||sel.has("lotti_usciti");
      const ubaData = (needUba||needCostoLotti)
        ? fogli_uba(an, lotti||[], suiniLotto||[], prezziRif||[], annoUba, costiGen||[], costiAnim||[])
        : null;
      const costoNascitaPerLotto = ubaData?.costoNascitaPerLotto || {};

      if(sel.has("costi_acquisto"))
        XLSX.utils.book_append_sheet(wb, foglio_costi_acquisto(an, lotti||[], suiniLotto||[]), "Costi acquisto");
      if(sel.has("lotti_riepilogo"))
        XLSX.utils.book_append_sheet(wb, foglio_lotti_riepilogo(lotti||[], suiniLotto||[], an, costoNascitaPerLotto), "Lotti riepilogo");
      if(sel.has("lotti_attivi"))
        XLSX.utils.book_append_sheet(wb, foglio_lotti_attivi(lotti||[], suiniLotto||[], an, costoNascitaPerLotto), "Lotti attivi");
      if(sel.has("lotti_usciti"))
        XLSX.utils.book_append_sheet(wb, foglio_lotti_usciti(lotti||[], suiniLotto||[], an, costoNascitaPerLotto), "Lotti usciti");
      if(sel.has("lotti_unita"))
        XLSX.utils.book_append_sheet(wb, foglio_lotti_unita(suiniLotto||[], lotti||[]), "Lotti unità");
      if(sel.has("unita_attive"))
        XLSX.utils.book_append_sheet(wb, foglio_unita_attive(suiniLotto||[], lotti||[]), "Unità attive");
      if(sel.has("unita_uscite"))
        XLSX.utils.book_append_sheet(wb, foglio_unita_uscite(suiniLotto||[], lotti||[]), "Unità uscite");
      if(sel.has("kpi_selezione"))
        XLSX.utils.book_append_sheet(wb, foglio_kpi(an, evRiprod||[]), "KPI Selezione genetica");
      if(sel.has("costi_animale"))
        XLSX.utils.book_append_sheet(wb, foglio_costi_animale(filtraData(costiAnim||[],"data"), an), "Costi animali");
      if(sel.has("costi_generali"))
        XLSX.utils.book_append_sheet(wb, foglio_costi_generali(costiGen||[]), "Costi generali");
      if(sel.has("macchinari"))
        XLSX.utils.book_append_sheet(wb, foglio_macchinari(macchinari||[]), "Macchinari");
      if(needUba){
        if(sel.has("uba_riepilogo"))
          XLSX.utils.book_append_sheet(wb,creaSheetFormattato(ubaData.riepilogo,COL_RIEP),"UBA Riepilogo");
        if(sel.has("uba_dettaglio"))
          XLSX.utils.book_append_sheet(wb,creaSheetFormattato(ubaData.dettaglio,COL_UBA),"UBA Dettaglio");
        if(sel.has("uba_bovini"))
          XLSX.utils.book_append_sheet(wb,creaSheetFormattato(ubaData.bovini,COL_UBA),"UBA BOVINI");
        if(sel.has("uba_ovini"))
          XLSX.utils.book_append_sheet(wb,creaSheetFormattato(ubaData.ovini,COL_UBA),"UBA OVINI");
        if(sel.has("uba_suini"))
          XLSX.utils.book_append_sheet(wb,creaSheetFormattato(ubaData.suini,COL_UBA),"UBA SUINI e LOTTI");
        if(sel.has("uba_combinato"))
          XLSX.utils.book_append_sheet(wb, creaSheetUBACombinato([
            {titolo:`🐄 BOVINI — Anno ${ubaData.anno}`,        colore:STYLE.primaryLight, righe:ubaData.bovini},
            {titolo:`🐑 OVINI — Anno ${ubaData.anno}`,         colore:"6B8E4E",           righe:ubaData.ovini},
            {titolo:`🐷 SUINI E LOTTI — Anno ${ubaData.anno}`, colore:"B5657A",           righe:ubaData.suini},
          ], COL_UBA), `UBA ${ubaData.anno} - per specie`);
      }
      if(sel.has("scadenze_scaduti"))
        XLSX.utils.book_append_sheet(wb, foglio_scadenze(sanitari, an, "scaduti"), "Richiami scaduti");
      if(sel.has("scadenze_imminenti"))
        XLSX.utils.book_append_sheet(wb, foglio_scadenze(sanitari, an, "imminenti"), "Richiami imminenti 30gg");
      if(sel.has("scadenze_programmati"))
        XLSX.utils.book_append_sheet(wb, foglio_scadenze(sanitari, an, "programmati"), "Richiami programmati 30-90gg");
      if(sel.has("consang_rischi"))
        XLSX.utils.book_append_sheet(wb, foglio_consang_rischi(an), "Accoppiamenti a rischio");
      if(sel.has("consang_capi"))
        XLSX.utils.book_append_sheet(wb, foglio_consang_capi(an), "Capi consanguinei");

      scarica(wb, `Podere_Verde_Export_${dataDa||"tutto"}_${dataA}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,
      minHeight:"100vh",maxWidth:480,margin:"0 auto",paddingBottom:80}}>

      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.primary},${C.accent})`,
        borderRadius:"0 0 28px 28px",padding:"24px 20px 20px",marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:800,color:"#FFF"}}>📥 Esporta Dati</div>
        <div style={{fontSize:14,color:"rgba(255,255,255,0.75)",marginTop:4}}>
          Seleziona le sezioni da includere nel file Excel
        </div>
      </div>

      <div style={{padding:"0 16px"}}>

        {/* Filtro date */}
        <div style={{background:C.card,borderRadius:16,padding:16,marginBottom:16,
          border:`1px solid ${C.border}`}}>
          <div style={{fontSize:13,fontWeight:700,color:C.muted,marginBottom:10}}>
            📅 FILTRO DATA (opzionale)
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Da:",dataDa,setDataDa],["A:",dataA,setDataA]].map(([lbl,val,set])=>(
              <div key={lbl}>
                <div style={{fontSize:11,fontWeight:600,color:C.muted,marginBottom:4}}>{lbl}</div>
                <input type="date" value={val} onChange={e=>set(e.target.value)}
                  style={{width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,
                    borderRadius:10,padding:"8px 10px",fontSize:14,background:"#FAFAF8",
                    color:C.text,outline:"none"}}/>
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:C.muted,marginTop:8}}>
            Si applica a: registro sanitario, alimentazione, parti, costi animali
          </div>
        </div>

        {/* Anno di riferimento UBA */}
        <div style={{background:C.card,borderRadius:16,padding:16,marginBottom:16,
          border:`1px solid ${C.border}`}}>
          <div style={{fontSize:13,fontWeight:700,color:C.muted,marginBottom:10}}>
            📆 ANNO DI RIFERIMENTO (fogli UBA e Costi Acquisto)
          </div>
          <input type="number" value={annoUba} onChange={e=>setAnnoUba(parseInt(e.target.value)||new Date().getFullYear())}
            min="2000" max={new Date().getFullYear()}
            style={{width:"100%",boxSizing:"border-box",border:`1.5px solid ${C.border}`,
              borderRadius:10,padding:"8px 10px",fontSize:14,background:"#FAFAF8",
              color:C.text,outline:"none"}}/>
          <div style={{fontSize:11,color:C.muted,marginTop:8}}>
            Il report UBA considera tutti gli animali presenti in quell'anno (anche già usciti dopo),
            limitando il conteggio dei giorni al solo periodo di reale presenza nell'anno scelto.
          </div>
        </div>

        {/* Selezione sezioni */}
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <button onClick={selAll}
            style={{background:C.primary,color:"#FFF",border:"none",borderRadius:10,
              padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
            ☑ Seleziona tutto
          </button>
          <button onClick={deselAll}
            style={{background:C.card,color:C.muted,border:`1.5px solid ${C.border}`,
              borderRadius:10,padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
            ☐ Deseleziona tutto
          </button>
        </div>

        {gruppi.map(gruppo=>(
          <div key={gruppo} style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:800,color:C.muted,letterSpacing:1.2,
              textTransform:"uppercase",marginBottom:8}}>{gruppo}</div>
            {SEZIONI.filter(s=>s.gruppo===gruppo).map(s=>(
              <div key={s.id} onClick={()=>toggle(s.id)}
                style={{display:"flex",alignItems:"center",gap:12,
                  background:sel.has(s.id)?C.primary+"10":C.card,
                  border:`1.5px solid ${sel.has(s.id)?C.primary:C.border}`,
                  borderRadius:12,padding:"10px 14px",marginBottom:8,cursor:"pointer"}}>
                <div style={{width:22,height:22,borderRadius:6,flexShrink:0,
                  background:sel.has(s.id)?C.primary:"transparent",
                  border:`2px solid ${sel.has(s.id)?C.primary:C.border}`,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {sel.has(s.id)&&<span style={{color:"#FFF",fontSize:14,fontWeight:800}}>✓</span>}
                </div>
                <span style={{fontSize:18}}>{s.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,
                    color:sel.has(s.id)?C.primary:C.text}}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Pulsante genera */}
        <button onClick={genera} disabled={loading||sel.size===0}
          style={{width:"100%",background:sel.size>0?C.green:"#CCC",color:"#FFF",
            border:"none",borderRadius:14,padding:"16px",fontSize:17,fontWeight:800,
            cursor:sel.size>0?"pointer":"default",marginTop:8,
            boxShadow:sel.size>0?"0 4px 16px rgba(74,124,89,0.35)":"none"}}>
          {loading
            ?"⏳ Generazione in corso..."
            :sel.size===0
              ?"Seleziona almeno una sezione"
              :`📥 Genera Excel (${sel.size} fogli)`}
        </button>
        <div style={{textAlign:"center",fontSize:12,color:C.muted,marginTop:10}}>
          Il file viene scaricato automaticamente sul tuo dispositivo
        </div>
      </div>
    </div>
  );
}
