import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "./supabase";

const C = {
  bg:"#F5F0E8", card:"#FFFFFF", primary:"#5C3D1E", accent:"#A0522D",
  green:"#4A7C59", red:"#C0392B", yellow:"#D4A017", blue:"#2C6E9B",
  text:"#2D1B0E", muted:"#8B7355", border:"#D4C4A8",
  bovini:"#8B6914", suini:"#B5547A", ovini:"#4A7C59",
};

const today = () => new Date().toISOString().split("T")[0];
const specieIcon = s=>({bovino:"🐄",suino:"🐷",ovino:"🐑"}[s]||"🐾");
const specieColor = s=>({bovino:C.bovini,suino:C.suini,ovino:C.ovini}[s]||C.muted);

// ─── COEFFICIENTI UBA AZIENDALI ───────────────────────────────────────────────
const UBA_FASCE = {
  bovino: [
    { fino: 210,      coeff: 0.40,  label: "Vitella (<7 mesi)" },
    { fino: 730,      coeff: 0.70,  label: "Vitellone (7m-2a)" },
    { fino: Infinity, coeff: 1.00,  label: "Bovino adulto (≥2a)" },
  ],
  suino: [
    { fino: 90,       coeff: 0.027, label: "Lattonzolo (<3 mesi)" },
    { fino: 365,      coeff: 0.30,  label: "Magrone (3m-1a)" },
    { fino: Infinity, coeff: 0.50,  label: "Suino adulto (≥1a)" },
  ],
  ovino: [
    { fino: 120,      coeff: 0.027, label: "Agnello (<4 mesi)" },
    { fino: 365,      coeff: 0.10,  label: "Agnellone (4m-1a)" },
    { fino: Infinity, coeff: 0.15,  label: "Ovino adulto (≥1a)" },
  ],
};

// ─── PERIMETRO ANNUALE ────────────────────────────────────────────────────────
// Un animale è nel perimetro dell'anno se ha avuto presenza in azienda in quell'anno
function periodoNellAnno(animale, anno) {
  const nascita = animale.nascita || animale.data_ingresso;
  if (!nascita) return null;

  const inizioAnno = new Date(anno, 0, 1);
  const fineAnno   = new Date(anno, 11, 31, 23, 59, 59);
  const oggi       = new Date();

  const dataInizio = new Date(nascita);
  const dataFine = animale.data_uscita
    ? new Date(animale.data_uscita)
    : (oggi < fineAnno ? oggi : fineAnno);

  // Verifica sovrapposizione con l'anno
  if (dataFine < inizioAnno) return null;   // uscito prima dell'anno
  if (dataInizio > fineAnno) return null;   // nato dopo l'anno

  const inizio = dataInizio > inizioAnno ? dataInizio : inizioAnno;
  const fine   = dataFine < fineAnno ? dataFine : fineAnno;

  return {
    inizio: inizio.toISOString().split("T")[0],
    fine:   fine.toISOString().split("T")[0],
    giorni: Math.round((fine - inizio) / 86400000) + 1,
    etaAllInizio: Math.round((inizio - new Date(nascita)) / 86400000),
  };
}

// ─── CALCOLO UBA MEDIO ────────────────────────────────────────────────────────
function calcolaUBAMedio(specie, giorni, etaAllInizio) {
  if (!specie || !UBA_FASCE[specie] || giorni <= 0) return null;
  const fasce = UBA_FASCE[specie];
  let ubaPesata = 0;
  for (let i = 0; i < fasce.length; i++) {
    const prevSoglia = i > 0 ? fasce[i-1].fino : 0;
    const { fino, coeff } = fasce[i];
    const inizioFascia = Math.max(prevSoglia, etaAllInizio);
    const fineFascia   = Math.min(
      fino === Infinity ? etaAllInizio + giorni + 1 : fino,
      etaAllInizio + giorni
    );
    if (fineFascia > inizioFascia) {
      ubaPesata += (fineFascia - inizioFascia) * coeff;
    }
  }
  return Math.round(ubaPesata / giorni * 1000) / 1000;
}

// Categoria attuale in base all'età
function categoriaEtà(specie, etaAllInizio, giorni) {
  if (!UBA_FASCE[specie]) return "—";
  const etaFinale = etaAllInizio + giorni;
  const fasce = UBA_FASCE[specie];
  for (const { fino, label } of fasce) {
    if (etaFinale < fino) return label;
  }
  return fasce.at(-1).label;
}

// ─── CATEGORIZZAZIONE CONTABILE ────────────────────────────────────────────
const MOTIVI_PRODUTTIVI = [
  "macellazione","macellato","venduto","riformato","riforma","vendita"
];
function categoriaContabile(animale, annoRif) {
  if (animale.stato === "attivo") {
    return animale.riproduttore ? "riproduttore" : "produttivo";
  }
  // Uscito → distinguo produttivo (macellato/venduto) da improduttivo
  const motivo = (animale.motivo_uscita || "").toLowerCase();
  const isProduttivo = MOTIVI_PRODUTTIVI.some(k => motivo.includes(k));
  if (isProduttivo) {
    return animale.riproduttore ? "riproduttore" : "produttivo";
  }
  return "improduttivo_uscito";
}

// ─── UI BASE ──────────────────────────────────────────────────────────────────
const Card = ({children,style={}}) => (
  <div style={{background:C.card,borderRadius:16,padding:14,marginBottom:12,
    boxShadow:"0 2px 8px rgba(0,0,0,0.07)",border:`1px solid ${C.border}`,...style}}>
    {children}
  </div>
);
const Badge = ({label,color}) => (
  <span style={{background:color+"22",color,border:`1px solid ${color}44`,
    borderRadius:20,padding:"2px 9px",fontSize:11,fontWeight:700}}>{label}</span>
);
const Spinner = () => (
  <div style={{textAlign:"center",padding:60,color:C.muted}}>
    <div style={{fontSize:36,marginBottom:12}}>⏳</div>
    <div>Calcolo UBA in corso...</div>
  </div>
);

// ─── STILI EXCEL ─────────────────────────────────────────────────────────────
const S_HEADER = {
  fill:{fgColor:{rgb:"5C3D1E"}},
  font:{color:{rgb:"FFFFFF"},bold:true,sz:11,name:"Century Gothic"},
  alignment:{horizontal:"center",vertical:"center",wrapText:true},
  border:{top:{style:"thin",color:{rgb:"888888"}},bottom:{style:"thin",color:{rgb:"888888"}},
    left:{style:"thin",color:{rgb:"888888"}},right:{style:"thin",color:{rgb:"888888"}}},
};
const S_SEZIONE = {
  fill:{fgColor:{rgb:"E8DCC4"}},
  font:{color:{rgb:"5C3D1E"},bold:true,sz:12,name:"Century Gothic"},
  alignment:{horizontal:"left",vertical:"center"},
};
const S_TOTALE_CAT = {
  fill:{fgColor:{rgb:"8B6914"}},
  font:{color:{rgb:"FFFFFF"},bold:true,sz:11,name:"Century Gothic"},
  alignment:{horizontal:"center",vertical:"center"},
};
const S_TOTALE_GEN = {
  fill:{fgColor:{rgb:"5C3D1E"}},
  font:{color:{rgb:"FFFFFF"},bold:true,sz:12,name:"Century Gothic"},
  alignment:{horizontal:"center",vertical:"center"},
};
const bordoLeggero = {top:{style:"thin",color:{rgb:"DDDDDD"}},bottom:{style:"thin",color:{rgb:"DDDDDD"}},
  left:{style:"thin",color:{rgb:"DDDDDD"}},right:{style:"thin",color:{rgb:"DDDDDD"}}};

const COLORI_CATEGORIA = {
  produttivo:   "F5EDD8",  // beige chiaro
  riproduttore: "E4F0DC",  // verde chiaro
  improduttivo_uscito: "F5DDE6", // rosa chiaro
};

function cellData(v, opts={}) {
  const {isTotaleCat, isTotaleGen, colBg, num, center, bold, cur} = opts;
  if (isTotaleGen) return {v:v??"", s:{...S_TOTALE_GEN, numFmt: num?"#,##0.000":cur?"€#,##0.00":undefined}};
  if (isTotaleCat) return {v:v??"", s:{...S_TOTALE_CAT, numFmt: num?"#,##0.000":cur?"€#,##0.00":undefined}};

  const font = {sz:10, name:"Century Gothic", bold:bold||false};
  const fill = colBg ? {fgColor:{rgb:colBg}} : undefined;
  const alignment = center ? {horizontal:"center",vertical:"center",wrapText:true}
                     : num||cur ? {horizontal:"right",vertical:"center"}
                     : {horizontal:"left",vertical:"center",wrapText:true};
  const s = {font, alignment, border:bordoLeggero};
  if (fill) s.fill = fill;
  if (num) s.numFmt = "#,##0.000";
  else if (cur) s.numFmt = "€#,##0.00";
  return {v:v??"", s};
}

// ─── COLONNE PER I FOGLI UBA ─────────────────────────────────────────────────
const COL_UBA = [
  {key:"BDN",                    label:"BDN / Matricola",           width:20, bold:true},
  {key:"NUMERO CAPI",             label:"N° Capi",                   width:9,  center:true, num:true},
  {key:"Nome",                    label:"Nome",                      width:18},
  {key:"Specie",                  label:"Specie",                    width:10, center:true},
  {key:"Razza",                   label:"Razza",                     width:16},
  {key:"Categoria età",           label:"Categoria età",             width:22},
  {key:"Data nascita",            label:"Data nascita",              width:13, center:true},
  {key:"Inizio periodo",          label:"Inizio periodo",            width:13, center:true},
  {key:"Fine periodo",            label:"Fine periodo",              width:13, center:true},
  {key:"Giorni",                  label:"Giorni",                    width:8,  center:true, num:true},
  {key:"UBA medio",               label:"UBA medio",                 width:11, num:true},
  {key:"UBA-giorni",              label:"UBA-giorni",                width:12, num:true, bold:true},
  {key:"Categoria contabile",     label:"Categoria contabile",       width:20},
  {key:"Qualifica",               label:"Qualifica",                 width:16},
  {key:"Motivo uscita",           label:"Motivo uscita",             width:20},
  {key:"Costo iniziale",          label:"Costo iniziale (€)",        width:14, cur:true},
  {key:"Tipo costo iniziale",     label:"Tipo costo iniziale",       width:18},
  {key:"Costi mant. cumulati",    label:"Costi mant. cumulati (€)",  width:16, cur:true},
  {key:"V(t) riforma",            label:"V(t) riforma stimato (€)",  width:16, cur:true},
  {key:"Quota scaricata figli",   label:"Quota scaricata figli (€)", width:16, cur:true},
  {key:"Costo netto residuo",     label:"Costo netto residuo (€)",   width:16, cur:true, bold:true},
  {key:"Lotto",                   label:"Lotto",                     width:12, center:true},
];

// ─── COSTRUZIONE FOGLIO EXCEL ────────────────────────────────────────────────
function creaFoglioAnno(righeAnno, prezziRiforma, animali) {
  const ws = {};
  let riga = 0;

  // Intestazione
  COL_UBA.forEach((col, ci) => {
    ws[XLSX.utils.encode_cell({c:ci, r:riga})] = {v:col.label, s:S_HEADER};
  });
  riga++;

  const sezioni = [
    {key:"produttivo",         label:"■ ANIMALI PRODUTTIVI (attivi + macellati/venduti/riformati)"},
    {key:"riproduttore",       label:"■ ANIMALI RIPRODUTTORI (attivi con qualifica)"},
    {key:"improduttivo_uscito",label:"■ ANIMALI IMPRODUTTIVI USCITI (morti/predati/smarriti)"},
  ];

  const rigaTotaleCategoria = {};
  let totGenerale = {capi:0, ubaGiorni:0};

  sezioni.forEach(sez => {
    const righeCat = righeAnno.filter(r => r["_categoria_key"] === sez.key);

    // Riga separatrice sezione (occupa tutta la larghezza)
    const cellSep = {v: sez.label, s: S_SEZIONE};
    for (let ci = 0; ci < COL_UBA.length; ci++) {
      ws[XLSX.utils.encode_cell({c:ci, r:riga})] = ci===0 ? cellSep : {v:"", s:S_SEZIONE};
    }
    ws["!merges"] = ws["!merges"] || [];
    ws["!merges"].push({s:{c:0,r:riga}, e:{c:COL_UBA.length-1,r:riga}});
    riga++;

    if (righeCat.length === 0) {
      // Riga "nessun dato"
      ws[XLSX.utils.encode_cell({c:0, r:riga})] = {v: "  (nessun animale in questa categoria)",
        s:{font:{sz:10,italic:true,color:{rgb:"999999"},name:"Century Gothic"}}};
      riga++;
    } else {
      // Righe animali
      righeCat.forEach(r => {
        const rowBg = COLORI_CATEGORIA[sez.key];
        COL_UBA.forEach((col, ci) => {
          const val = r[col.key];
          ws[XLSX.utils.encode_cell({c:ci, r:riga})] = cellData(val, {
            colBg: rowBg,
            num: col.num,
            center: col.center,
            bold: col.bold,
            cur: col.cur,
          });
        });
        riga++;
      });

      // Riga TOTALE categoria
      const totUbaGiorni = righeCat.reduce((s,r) => s + (r["UBA-giorni"]||0), 0);
      const totCostoInit = righeCat.reduce((s,r) => s + (r["Costo iniziale"]||0), 0);
      const totMant      = righeCat.reduce((s,r) => s + (r["Costi mant. cumulati"]||0), 0);
      rigaTotaleCategoria[sez.key] = {capi: righeCat.length, ubaGiorni: totUbaGiorni};
      totGenerale.capi += righeCat.length;
      totGenerale.ubaGiorni += totUbaGiorni;

      COL_UBA.forEach((col, ci) => {
        let val = "";
        if (col.key === "BDN") val = `TOTALE ${sez.key.toUpperCase()}`;
        else if (col.key === "NUMERO CAPI") val = righeCat.length;
        else if (col.key === "UBA-giorni") val = Math.round(totUbaGiorni*1000)/1000;
        else if (col.key === "Costo iniziale") val = Math.round(totCostoInit*100)/100;
        else if (col.key === "Costi mant. cumulati") val = Math.round(totMant*100)/100;
        ws[XLSX.utils.encode_cell({c:ci, r:riga})] = cellData(val, {
          isTotaleCat: true,
          num: col.num,
          cur: col.cur,
        });
      });
      riga++;
    }
    // Riga vuota separatrice
    riga++;
  });

  // Riga TOTALE GENERALE
  COL_UBA.forEach((col, ci) => {
    let val = "";
    if (col.key === "BDN") val = "TOTALE AZIENDALE";
    else if (col.key === "NUMERO CAPI") val = totGenerale.capi;
    else if (col.key === "UBA-giorni") val = Math.round(totGenerale.ubaGiorni*1000)/1000;
    ws[XLSX.utils.encode_cell({c:ci, r:riga})] = cellData(val, {
      isTotaleGen: true,
      num: col.num,
      cur: col.cur,
    });
  });
  riga++;

  // Riepilogo denominatori per Prima App
  riga++;
  ws[XLSX.utils.encode_cell({c:0, r:riga})] = {v:"─── COEFFICIENTI PER RIPARTIZIONE COSTI PRIMA APP ───",
    s:{font:{sz:11,bold:true,name:"Century Gothic",color:{rgb:"5C3D1E"}}}};
  riga++;
  ws[XLSX.utils.encode_cell({c:0, r:riga})] = {v:"UBA-giorni PRODUTTIVI (denominatore ripartizione costi ordinari)",
    s:{font:{sz:10,name:"Century Gothic"}}};
  ws[XLSX.utils.encode_cell({c:11, r:riga})] = cellData(
    Math.round((rigaTotaleCategoria.produttivo?.ubaGiorni||0)*1000)/1000,
    {num:true, bold:true, colBg:"F5EDD8"}
  );
  riga++;
  ws[XLSX.utils.encode_cell({c:0, r:riga})] = {v:"UBA-giorni RIPRODUTTORI",
    s:{font:{sz:10,name:"Century Gothic"}}};
  ws[XLSX.utils.encode_cell({c:11, r:riga})] = cellData(
    Math.round((rigaTotaleCategoria.riproduttore?.ubaGiorni||0)*1000)/1000,
    {num:true, bold:true, colBg:"E4F0DC"}
  );
  riga++;
  ws[XLSX.utils.encode_cell({c:0, r:riga})] = {v:"UBA-giorni IMPRODUTTIVI (perdita da ridistribuire su produttivi+riproduttori)",
    s:{font:{sz:10,name:"Century Gothic"}}};
  ws[XLSX.utils.encode_cell({c:11, r:riga})] = cellData(
    Math.round((rigaTotaleCategoria.improduttivo_uscito?.ubaGiorni||0)*1000)/1000,
    {num:true, bold:true, colBg:"F5DDE6"}
  );
  riga++;

  ws["!ref"] = XLSX.utils.encode_range({s:{c:0,r:0}, e:{c:COL_UBA.length-1, r:riga}});
  ws["!cols"] = COL_UBA.map(c => ({wch:c.width||14}));
  ws["!rows"] = [{hpx:38}];  // header più alto
  ws["!freeze"] = {xSplit:1, ySplit:1};  // freeze prima riga E prima colonna
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({s:{c:0,r:0}, e:{c:COL_UBA.length-1, r:0}}) };

  return ws;
}

// ─── COSTRUZIONE RIGHE UBA PER ANNO ──────────────────────────────────────────
function costruisciRighe(animali, lotti, suiniLotto, anno, prezziRiforma, filtroSpecie) {
  const righe = [];

  for (const a of animali) {
    if (!a.specie || !UBA_FASCE[a.specie]) continue;
    if (filtroSpecie && filtroSpecie !== "tutti" && a.specie !== filtroSpecie) continue;
    const nascita = a.nascita || a.data_ingresso;
    if (!nascita) continue;

    const periodo = periodoNellAnno({...a, nascita}, anno);
    if (!periodo) continue;

    const uba = calcolaUBAMedio(a.specie, periodo.giorni, periodo.etaAllInizio);
    if (!uba) continue;

    const ubaGiorni = Math.round(uba * periodo.giorni * 1000) / 1000;
    const cat = categoriaContabile(a, anno);

    // Prezzi riforma
    const prezzo = prezziRiforma.find(p => p.specie===a.specie && p.razza===(a.razza_calcolata||a.razza));
    const pesoStimato = a.peso_attuale || a.peso_vivo_uscita || 0;
    const vRiforma = prezzo && pesoStimato
      ? Math.round(pesoStimato * prezzo.prezzo_kg_vivo * (prezzo.resa_percentuale/100) * 100) / 100
      : 0;

    const costoIniz = a.costo_iniziale || 0;
    const mantCum   = a.costi_mantenimento_cumulati || 0;
    const quotaFig  = a.quota_scaricata_figli || 0;
    const costoNetto = Math.max(0, costoIniz + mantCum - quotaFig - vRiforma);

    righe.push({
      "_categoria_key": cat,
      "BDN": a.bdn || "",
      "NUMERO CAPI": "",
      "Nome": a.nome || "",
      "Specie": a.specie,
      "Razza": a.razza_calcolata || a.razza || "",
      "Categoria età": categoriaEtà(a.specie, periodo.etaAllInizio, periodo.giorni),
      "Data nascita": nascita,
      "Inizio periodo": periodo.inizio,
      "Fine periodo": periodo.fine,
      "Giorni": periodo.giorni,
      "UBA medio": uba,
      "UBA-giorni": ubaGiorni,
      "Categoria contabile": cat,
      "Qualifica": a.riproduttore ? (a.sesso==="M"?"Riproduttore":"Riproduttrice") : "",
      "Motivo uscita": a.motivo_uscita || "",
      "Costo iniziale": costoIniz,
      "Tipo costo iniziale": a.tipo_costo_iniziale || "",
      "Costi mant. cumulati": mantCum,
      "V(t) riforma": vRiforma,
      "Quota scaricata figli": quotaFig,
      "Costo netto residuo": costoNetto,
      "Lotto": "",
    });
  }

  // Suini da lotto
  for (const l of lotti) {
    if (!l.data_parto) continue;
    if (filtroSpecie && filtroSpecie !== "tutti" && filtroSpecie !== "suino") continue;
    const codLotto = l.codice_lotto || l.codice || "";
    for (const u of suiniLotto.filter(x => x.lotto_id === l.id)) {
      if (u.stato === "registrato_individuale") continue;
      const nascita = l.data_parto;
      const fintoAnimale = {
        nascita,
        data_uscita: u.data_uscita,
        stato: u.stato==="attivo" ? "attivo" : "uscito",
        motivo_uscita: u.motivo_uscita,
        riproduttore: false,
      };
      const periodo = periodoNellAnno(fintoAnimale, anno);
      if (!periodo) continue;
      const uba = calcolaUBAMedio("suino", periodo.giorni, periodo.etaAllInizio);
      if (!uba) continue;
      const ubaGiorni = Math.round(uba * periodo.giorni * 1000) / 1000;
      const cat = categoriaContabile(fintoAnimale, anno);
      const codice = u.codice_completo || `${codLotto}${String(u.nr).padStart(2,"0")}`;

      righe.push({
        "_categoria_key": cat,
        "BDN": codice,
        "NUMERO CAPI": "",
        "Nome": "",
        "Specie": "suino",
        "Razza": l.razza_madre || "",
        "Categoria età": categoriaEtà("suino", periodo.etaAllInizio, periodo.giorni),
        "Data nascita": nascita,
        "Inizio periodo": periodo.inizio,
        "Fine periodo": periodo.fine,
        "Giorni": periodo.giorni,
        "UBA medio": uba,
        "UBA-giorni": ubaGiorni,
        "Categoria contabile": cat,
        "Qualifica": "",
        "Motivo uscita": u.motivo_uscita || "",
        "Costo iniziale": 0,
        "Tipo costo iniziale": "pre_migrazione",
        "Costi mant. cumulati": 0,
        "V(t) riforma": 0,
        "Quota scaricata figli": 0,
        "Costo netto residuo": 0,
        "Lotto": codLotto,
      });
    }
  }

  return righe;
}

// ─── EXPORT EXCEL COMPLETO ─────────────────────────────────────────────────────
function esportaUBA(animali, lotti, suiniLotto, anni, prezziRiforma, filtroSpecie) {
  const wb = XLSX.utils.book_new();

  anni.forEach(anno => {
    ["tutti","bovino","suino","ovino"].forEach(sp => {
      if (filtroSpecie !== "tutti" && filtroSpecie !== sp && sp !== "tutti") return;
      if (filtroSpecie === "tutti" && sp !== "tutti") {
        // Genera solo il foglio "tutti" per l'anno se filtroSpecie=tutti
      }
    });

    // Solo un foglio per anno: contiene tutti gli animali (o filtrati)
    const righe = costruisciRighe(animali, lotti, suiniLotto, anno, prezziRiforma, filtroSpecie);
    if (righe.length === 0) return;

    const ws = creaFoglioAnno(righe, prezziRiforma, animali);
    const nomeFoglio = `UBA ${anno}`;
    XLSX.utils.book_append_sheet(wb, ws, nomeFoglio);
  });

  const nomeFile = `UBA_Podere_Verde_${anni[0]}${anni.length>1?"-"+anni[anni.length-1]:""}.xlsx`;
  XLSX.writeFile(wb, nomeFile);
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function UBAReport() {
  const [animali,setAnimali]   = useState([]);
  const [lotti,setLotti]       = useState([]);
  const [suiniLotto,setSuini]  = useState([]);
  const [prezzi,setPrezzi]     = useState([]);
  const [loading,setLoading]   = useState(true);
  const [annoRif,setAnnoRif]   = useState(new Date().getFullYear());
  const [filtroSpecie,setFiltro] = useState("tutti");

  const carica = async () => {
    setLoading(true);
    const [{data:anim},{data:lot},{data:sui},{data:pr}] = await Promise.all([
      supabase.from("animali").select("*"),
      supabase.from("lotti_suini").select("*"),
      supabase.from("suini_lotto").select("*"),
      supabase.from("prezzi_riforma").select("*"),
    ]);
    setAnimali(anim||[]);
    setLotti(lot||[]);
    setSuini(sui||[]);
    setPrezzi(pr||[]);
    setLoading(false);
  };
  useEffect(()=>{carica();},[]);

  // Anni disponibili in base ai dati
  const anniDisponibili = useMemo(()=>{
    if (animali.length === 0) return [new Date().getFullYear()];
    let annoMin = Infinity, annoMax = new Date().getFullYear();
    animali.forEach(a => {
      const nascita = a.nascita || a.data_ingresso;
      if (nascita) {
        const y = parseInt(nascita.slice(0,4));
        if (y < annoMin) annoMin = y;
      }
      if (a.data_uscita) {
        const y = parseInt(a.data_uscita.slice(0,4));
        if (y > annoMax) annoMax = y;
      }
    });
    if (annoMin === Infinity) annoMin = annoMax;
    const out = [];
    for (let y = annoMax; y >= annoMin; y--) out.push(y);
    return out;
  },[animali]);

  // Costruzione righe per anno di riferimento selezionato
  const righeAnno = useMemo(()=>
    costruisciRighe(animali, lotti, suiniLotto, annoRif, prezzi, filtroSpecie)
  ,[animali, lotti, suiniLotto, annoRif, prezzi, filtroSpecie]);

  // Aggregati per specie
  const perSpecie = ["bovino","suino","ovino"].map(sp => {
    const r = righeAnno.filter(x => x.Specie === sp);
    const uba = r.reduce((s,x) => s + x["UBA-giorni"], 0);
    return { specie:sp, n:r.length, uba };
  }).filter(x => x.n > 0);
  const totUBAGiorni = perSpecie.reduce((s,x) => s + x.uba, 0);

  // Aggregati per categoria contabile
  const perCategoria = ["produttivo","riproduttore","improduttivo_uscito"].map(cat => {
    const r = righeAnno.filter(x => x["_categoria_key"] === cat);
    const uba = r.reduce((s,x) => s + x["UBA-giorni"], 0);
    return { cat, n:r.length, uba };
  }).filter(x => x.n > 0);

  const catColor = c => ({
    produttivo: C.blue,
    riproduttore: C.green,
    improduttivo_uscito: C.red,
  }[c] || C.muted);
  const catLabel = c => ({
    produttivo: "Produttivi",
    riproduttore: "Riproduttori",
    improduttivo_uscito: "Improduttivi",
  }[c] || c);
  const catIcon = c => ({
    produttivo: "🐾",
    riproduttore: "♂♀",
    improduttivo_uscito: "✝",
  }[c] || "🐾");

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,
      minHeight:"100vh",maxWidth:480,margin:"0 auto",paddingBottom:80}}>

      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.primary},${C.accent})`,
        borderRadius:"0 0 28px 28px",padding:"24px 16px 20px"}}>
        <div style={{fontSize:22,fontWeight:800,color:"#FFF"}}>🐾 Report UBA</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.8)",marginTop:2}}>
          Interfaccia con Prima App per ripartizione costi
        </div>

        {/* Selettore anno */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginTop:12,
          background:"rgba(255,255,255,0.15)",borderRadius:10,padding:"8px 12px"}}>
          <span style={{color:"rgba(255,255,255,0.85)",fontSize:13}}>📅 Anno:</span>
          <select value={annoRif} onChange={e=>setAnnoRif(parseInt(e.target.value))}
            style={{background:"transparent",border:"none",color:"#FFF",
              fontSize:16,fontWeight:700,outline:"none",cursor:"pointer"}}>
            {anniDisponibili.map(y => (
              <option key={y} value={y} style={{color:"#000"}}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{padding:"14px"}}>
        {loading ? <Spinner/> : (
          <>
            {/* Totale UBA-giorni */}
            <Card style={{background:`linear-gradient(135deg,${C.primary}18,${C.card})`}}>
              <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:4}}>
                TOTALE UBA-GIORNI · Anno {annoRif}
              </div>
              <div style={{fontSize:36,fontWeight:900,color:C.primary}}>
                {totUBAGiorni.toFixed(2)}
              </div>
              <div style={{fontSize:13,color:C.muted}}>
                {righeAnno.length} capi presenti nel {annoRif}
              </div>
            </Card>

            {/* Filtri specie */}
            <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              {["tutti","bovino","suino","ovino"].map(s => (
                <button key={s} onClick={()=>setFiltro(s)}
                  style={{background:filtroSpecie===s?specieColor(s)||C.primary:C.card,
                    color:filtroSpecie===s?"#FFF":C.muted,
                    border:`1.5px solid ${filtroSpecie===s?specieColor(s)||C.primary:C.border}`,
                    borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:600,
                    cursor:"pointer"}}>
                  {s==="tutti"?"🐾 Tutti":specieIcon(s)+" "+s.charAt(0).toUpperCase()+s.slice(1)}
                </button>
              ))}
              <button onClick={()=>esportaUBA(animali,lotti,suiniLotto,[annoRif],prezzi,filtroSpecie)}
                style={{background:C.green,color:"#FFF",border:"none",borderRadius:20,
                  padding:"5px 14px",fontSize:12,fontWeight:700,cursor:"pointer",marginLeft:"auto"}}>
                📊 Excel {annoRif}
              </button>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
              <button onClick={()=>esportaUBA(animali,lotti,suiniLotto,anniDisponibili,prezzi,filtroSpecie)}
                style={{background:C.blue,color:"#FFF",border:"none",borderRadius:20,
                  padding:"5px 14px",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                📊 Excel tutti gli anni
              </button>
            </div>

            {/* Ripartizione per categoria contabile */}
            <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:8}}>
              RIPARTIZIONE PER CATEGORIA CONTABILE
            </div>
            {perCategoria.map(c => (
              <div key={c.cat} style={{background:C.card,borderRadius:12,padding:"10px 14px",
                marginBottom:8,border:`1px solid ${C.border}`,
                borderLeft:`5px solid ${catColor(c.cat)}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:catColor(c.cat)}}>
                      {catIcon(c.cat)} {catLabel(c.cat)}
                    </div>
                    <div style={{fontSize:11,color:C.muted}}>{c.n} capi</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:20,fontWeight:900,color:C.primary}}>{c.uba.toFixed(3)}</div>
                    <div style={{fontSize:10,color:C.muted}}>UBA-giorni</div>
                  </div>
                </div>
              </div>
            ))}

            {/* Ripartizione per specie */}
            <div style={{fontSize:12,fontWeight:700,color:C.muted,margin:"16px 0 8px"}}>
              RIPARTIZIONE PER SPECIE
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {perSpecie.map(s => (
                <div key={s.specie} style={{background:C.card,borderRadius:12,padding:12,
                  textAlign:"center",borderTop:`4px solid ${specieColor(s.specie)}`,
                  boxShadow:"0 2px 6px rgba(0,0,0,0.06)"}}>
                  <div style={{fontSize:22}}>{specieIcon(s.specie)}</div>
                  <div style={{fontSize:18,fontWeight:800,color:specieColor(s.specie)}}>
                    {s.uba.toFixed(2)}
                  </div>
                  <div style={{fontSize:10,color:C.muted,fontWeight:600}}>
                    {s.n} capi
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
