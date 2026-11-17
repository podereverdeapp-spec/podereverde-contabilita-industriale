// Versione 387 (Tenente, 17/11/2026) — lettura delle buste paga e del riepilogo paghe e contributi TeamSystem («Mod. Cedolino TS»,
// «RIEPILOGO PAGHE E CONTRIBUTI»). Riceve le pagine già lette da pdf.js: [{ numero, items: [{ x, r, y, s }] }] (y dall'alto).
// Una pagina = una persona. Le colonne si riconoscono dalle intestazioni stampate: un numero va sotto l'intestazione
// più a destra che comincia prima della fine del numero (i numeri sono allineati a destra).

// pagine del PDF come le vuole questo lettore (pdfjs passato da chi chiama: nel browser «pdfjs-dist», nelle prove la versione legacy)
export async function pagineBuste(byte, pdfjs) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(byte), verbosity: 0 }).promise;
  const out = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n); const vp = pg.getViewport({ scale: 1 }); const tc = await pg.getTextContent();
    out.push({ numero: n, items: tc.items.filter(i => i.str && i.str.trim()).map(i => ({ x: i.transform[4], r: i.transform[4] + i.width, y: vp.height - i.transform[5], s: i.str })) });
  }
  return out;
}

export const MESI_IT =["", "GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE"];

export function numeroIt(t) {
  const s = String(t ?? "").trim();
  if (!/^-?(?:[\d.]*\d)?(?:,\d+)?-?$/.test(s) || !/\d/.test(s)) return null;
  const neg = s.startsWith("-") || s.endsWith("-");
  const n = Number(s.replace(/-/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

// un elemento con più numeri separati da spazi («26,00 26») si divide in pezzi, con la posizione stimata
function dividi(items) {
  const out = [];
  for (const i of items) {
    const parti = i.s.trim().split(/\s+/);
    if (parti.length > 1 && parti.every(p => numeroIt(p) != null)) {
      const tot = i.s.trim().length, w = (i.r - i.x) / Math.max(tot, 1);
      let pos = 0; const testo = i.s.trim();
      for (const p of parti) { const da = testo.indexOf(p, pos); out.push({ x: i.x + da * w, r: i.x + (da + p.length) * w, y: i.y, s: p }); pos = da + p.length; }
    } else out.push({ ...i, s: i.s.trim() });
  }
  return out;
}
function righe(items, tolleranza = 2.5) {
  const ord = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const out = [];
  for (const i of ord) { const l = out[out.length - 1]; if (l && Math.abs(l.y - i.y) <= tolleranza) l.items.push(i); else out.push({ y: i.y, items: [i] }); }
  out.forEach(l => l.items.sort((a, b) => a.x - b.x));
  return out;
}
// valori sotto una riga di intestazioni: { etichetta: testo }, letti nelle righe tra l'intestazione e la prossima intestazione
function blocco(linee, primaEtichetta, altre = [], fino = 30) {
  const i0 = linee.findIndex(l => l.items.some(i => i.s === primaEtichetta));
  if (i0 < 0) return null;
  const y0 = linee[i0].y;
  // le intestazioni possono stare su due righe vicine (y entro 6)
  const testate = [];
  for (let k = i0; k < linee.length && linee[k].y - y0 <= 6; k++) testate.push(...linee[k].items.filter(i => !numeroIt(i.s) && i.s.length > 1));
  const nomi = new Set([primaEtichetta, ...altre]);
  const col = testate.filter(t => nomi.size <= 1 || nomi.has(t.s) || altre.length === 0).sort((a, b) => a.x - b.x);
  const valori = {};
  for (let k = i0 + 1; k < linee.length && linee[k].y - y0 <= fino; k++) {
    if (linee[k].y - y0 <= 6 && linee[k].items.every(i => !numeroIt(i.s))) continue;
    for (const v of linee[k].items) {
      if (numeroIt(v.s) == null && !/^\d{2}\/\d{2}\/\d{2}$/.test(v.s)) continue;
      let c = null; for (const t of col) if (t.x <= v.r - 1) c = t;
      if (c && valori[c.s] == null) valori[c.s] = v.s;
    }
  }
  return valori;
}

export function tipoDocumento(pagine) {
  const t = pagine.map(p => p.items.map(i => i.s).join(" ")).join(" ");
  if (/R\s*I\s*E\s*P\s*I\s*L\s*O\s*G\s*O\s+P\s*A\s*G\s*H\s*E/.test(t)) return "riepilogo";
  if (/Mod\. Cedolino TS/.test(t) || (/TOTALE LORDO/.test(t) && /NETTO BUSTA/.test(t))) return "busta";
  if (!t.trim()) return "senza testo";
  return null;
}

// ── Riepilogo paghe e contributi ─────────────────────────────────────────────────────────────────────
export function leggiRiepilogo(pagine) {
  const voci = [];   // [{ etichetta, importo, colonna }]
  let mese = null, anno = null;
  for (const p of pagine) for (const l of righe(dividi(p.items))) {
    const tutto = l.items.map(i => i.s).join(" ");
    const m = tutto.match(/mese di\s+(\S+)\s+(\d{4})/i);
    if (m && !mese) { mese = MESI_IT.indexOf(m[1].toUpperCase()); anno = Number(m[2]); }
    const etichetta = l.items.filter(i => i.x > 85 && i.x < 330 && numeroIt(i.s) == null).map(i => i.s).join(" ").replace(/\s+/g, " ").trim();
    const num = l.items.filter(i => numeroIt(i.s) != null && i.x > 300);
    if (etichetta && num.length) voci.push({ etichetta, importo: numeroIt(num[0].s), colonna: Math.round(num[0].r) });
  }
  const prendi = (re, prima = true) => { const v = voci.filter(x => re.test(x.etichetta)); return v.length ? (prima ? v[0].importo : v.reduce((s, x) => s + x.importo, 0)) : 0; };
  const r = {
    mese, anno,
    salari: prendi(/^Salari$/), stipendi: prendi(/^Stipendi$/),
    netto_in_busta: prendi(/^NETTO IN BUSTA$/),
    inps_azienda: prendi(/^Ente\s*:\s*INPS AGRICOLTURA\s+c\/azienda$/i),
    inps_dipendente: prendi(/^Ente\s*:\s*INPS AGRICOLTURA\s+c\/dipendente$/i),
    contributi_collab_azienda: prendi(/^Contributi c\/Azie$/),
    contributi_collab_collaboratore: prendi(/^Contributi c\/collaboratori$/),
    inail: prendi(/^Contributi INAIL$/),
    irpef_e_addizionali: prendi(/^TOTALE irpef dovuta del periodo$/i),
    crediti_730: r2(prendi(/da compensare F24$/i, false) + prendi(/^Totale crediti Irpef$/i)),
    tfr_anno_azienda: prendi(/^TFR dell'anno c\/azie/i),
    voci,
  };
  r.inps_collaboratori = r2(r.contributi_collab_azienda + r.contributi_collab_collaboratore);
  return r;
}

// crediti fiscali anticipati in busta (non sono costo: si recuperano con l'F24). 1105 aggiunto il 17/11/2026 (addizionale comunale a credito del 730)
export const CREDITI_FISCALI = ["9824", "8992", "507", "1117", "1105"];

// codici delle ore e dei giorni contati (prompt della versione 270) e codici con ore o giorni già visti nelle buste 2025–2026 che non si
// contano (carenza di malattia, festività non goduta pagata, mensilità e ferie residue pagate alla cessazione)
const CODICI_ORE_CONTATI = new Set(["8001", "8025", "8006", "8109", "8118", "8111", "106", "8101", "8205", "8116", "8864", "8212"]);
const CODICI_ORE_NON_CONTATI = new Set(["8875", "8108", "8608", "8121", "8830", "8833", "8834", "8835"]);

// ── Busta paga (una pagina = una persona) ─────────────────────────────────────────────────────────
const COLONNE_VOCI = ["ORE/GIORNI", "BASE", "COMPETENZE", "TRATTENUTE", "DATI STATISTICI"];
export function leggiBusta(pagina) {
  const items = dividi(pagina.items); const L = righe(items);
  const testo = items.map(i => i.s).join(" ");
  const b = { pagina: pagina.numero, problemi: [] };
  // intestazione: mese (o 13a / 14a MENS.), anno, codice e nome, data di assunzione
  const iMese = L.findIndex(l => l.items.some(i => i.s === "MESE RETRIBUITO"));
  const lMese = L.slice(iMese + 1).find(l => l.y - L[iMese].y > 6);
  const primo = lMese ? lMese.items.filter(i => i.x < 120).map(i => i.s).join(" ") : "";
  let m;
  if ((m = primo.match(/(13|14)a\s*MENS\.?\s*(\d{4})?/i))) { b.tipo = m[1] === "13" ? "tredicesima" : "quattordicesima"; b.mese = null; b.anno = Number(m[2] || (primo.match(/\d{4}/) || [])[0]); }
  else if ((m = primo.match(/([A-Z]+)\s*(\d{4})/))) { b.tipo = "mensile"; b.mese = MESI_IT.indexOf(m[1].toUpperCase()); b.anno = Number(m[2]); }
  if (!b.anno) b.problemi.push("mese e anno non letti");
  const nome = lMese?.items.find(i => i.x > 300 && i.x < 500);
  b.cognome_nome = nome ? nome.s.replace(/^\d+\s+/, "").replace(/\s+/g, " ").trim() : null;
  const dataAss = lMese?.items.find(i => i.x >= 500 && /^\d{2}\/\d{2}\/\d{2}$/.test(i.s));
  b.data_assunzione = dataAss ? dataAss.s : null;
  const cf = items.find(i => /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(i.s));
  b.codice_fiscale = cf ? cf.s : null;
  if (!b.cognome_nome) b.problemi.push("nome non letto");
  if (!b.codice_fiscale) b.problemi.push("codice fiscale non letto");
  // qualifica, livello, retribuzione di fatto, data di cessazione
  const iQ = L.findIndex(l => l.items.some(i => i.s === "QUALIFICA"));
  if (iQ >= 0) {
    const lq = L.slice(iQ + 1).find(l => l.y - L[iQ].y > 8);
    if (lq) {
      const q = lq.items.find(i => i.x >= 100 && i.x < 270 && numeroIt(i.s) == null);
      b.qualifica = q ? q.s.replace(/^\d+\s+/, "").trim() : null;
      const rf = lq.items.find(i => i.x < 100 && numeroIt(i.s) != null); b.retribuzione_oraria = rf ? numeroIt(rf.s) : null;
      const liv = lq.items.find(i => i.x >= 370 && i.x < 420); b.livello = liv ? liv.s : null;
      const ces = lq.items.find(i => i.x >= 515 && /^\d{2}\/\d{2}\/\d{2}$/.test(i.s)); b.data_cessazione = ces ? ces.s : null;
    }
  }
  // voci
  const iV = L.findIndex(l => l.items.some(i => i.s === "DESCRIZIONE VOCE"));
  const iFine = L.findIndex((l, k) => k > iV && l.items.some(i => i.s === "TOTALE LORDO"));
  const testate = iV >= 0 ? L[iV].items.filter(i => COLONNE_VOCI.includes(i.s)) : [];
  b.voci = [];
  if (iV >= 0 && iFine > iV) for (const l of L.slice(iV + 1, iFine)) {
    const prima = l.items[0];
    const mm = prima && prima.x < 60 ? prima.s.match(/^(\d{1,5})\s+(.+)$/) : null;
    if (!mm) continue;
    const v = { codice: mm[1], descrizione: mm[2].trim(), ore_giorni: null, base: null, competenza: null, trattenuta: null, dato_statistico: null };
    for (const n of l.items.slice(1)) {
      const val = numeroIt(n.s); if (val == null) { v.descrizione += " " + n.s; continue; }
      let c = null; for (const t of testate) if (t.x <= n.r - 1) c = t.s;
      if (c === "ORE/GIORNI") v.ore_giorni = val; else if (c === "BASE") v.base = val; else if (c === "COMPETENZE") v.competenza = val;
      else if (c === "TRATTENUTE") v.trattenuta = val; else if (c === "DATI STATISTICI") v.dato_statistico = val;
    }
    b.voci.push(v);
  }
  if (!b.voci.length) b.problemi.push("nessuna voce letta");
  // riquadri in basso
  const t1 = blocco(L, "TOTALE LORDO", ["TOTALE LORDO", "IMPON. CONTR. SOC.", "CONTRIBUTO 1", "CONTRIBUTO 2", "CONTRIBUTO 3", "CONTRIBUTO 4", "CONTRIBUTO 5", "TOTALE CONTRIBUTI SOCIALI"], 20) || {};
  // busta senza competenze (es. collaboratore cessato con sole trattenute): il riquadro del lordo è vuoto, il lordo è zero
  b.totale_lordo = numeroIt(t1["TOTALE LORDO"]) ?? (Object.keys(t1).length || L.some(l => l.items.some(i => i.s === "TOTALE LORDO")) ? (b.voci.some(v => v.competenza) ? null : 0) : null); b.imponibile_contributivo = numeroIt(t1["IMPON. CONTR. SOC."]) ?? 0;
  b.contributi_dipendente = numeroIt(t1["TOTALE CONTRIBUTI SOCIALI"]) ?? 0;
  const t3 = blocco(L, "IMP. T.S. ARR. A.P.", ["IMP. T.S. ARR. A.P.", "IRPEF A.P.", "ONERI DEDUCIBILI", "IMPONIBILE IRPEF", "IRPEF LORDA", "TOTALE DETRAZIONI", "TOTALE TRATTENUTE IRPEF"], 20) || {};
  b.irpef = numeroIt(t3["TOTALE TRATTENUTE IRPEF"]) ?? 0;
  const t4 = blocco(L, "ACCONTO", ["ACCONTO", "RATA PRESTITO", "RESIDUO PRESTITO", "TRATT. SINDACALE", "COVELCO", "ARROTOND. PRECED.", "TRATTENUTE CORPO", "TOTALE TRATTENUTE"], 20) || {};
  b.totale_trattenute = numeroIt(t4["TOTALE TRATTENUTE"]) ?? 0;
  const t5 = blocco(L, "IRPEF ERARIO", ["IRPEF ERARIO", "ADDIZIONALE REGIONALE", "ADDIZIONALE COMUNALE", "ARROTONDAMENTO", "NETTO BUSTA"], 20) || {};
  b.netto_busta = numeroIt(t5["NETTO BUSTA"]);
  const fe = blocco(L, "FERIE A.P.", ["FERIE A.P.", "FERIE MAT.", "FERIE GOD.", "FERIE RES.", "PERMESSI A.P.", "PERMESSI MAT.", "PERMESSI GOD.", "PERMESSI RES.", "ROL A.P.", "ROL MAT.", "ROL. GOD.", "ROL. RES."], 20) || {};
  const fs = blocco(L, "FEST. A.P.", ["FEST. A.P.", "FEST. MAT.", "FEST. GOD.", "FEST. RES.", "FLESS. A.P.", "FLESS. MAT.", "FLESS. GOD.", "FLESS. RES.", "B. ORE A.P.", "B. ORE MAT.", "B. ORE GOD.", "B. ORE RES."], 20) || {};
  const q = (o, k) => numeroIt(o[k]) ?? 0;
  b.ferie = { ap: q(fe, "FERIE A.P."), mat: q(fe, "FERIE MAT."), god: q(fe, "FERIE GOD."), res: q(fe, "FERIE RES.") };
  b.permessi = { ap: q(fe, "PERMESSI A.P."), mat: q(fe, "PERMESSI MAT."), god: q(fe, "PERMESSI GOD."), res: q(fe, "PERMESSI RES.") };
  b.rol = { ap: q(fe, "ROL A.P."), mat: q(fe, "ROL MAT."), god: q(fe, "ROL. GOD."), res: q(fe, "ROL. RES.") };
  b.festivita = { ap: q(fs, "FEST. A.P."), mat: q(fs, "FEST. MAT."), god: q(fs, "FEST. GOD."), res: q(fs, "FEST. RES.") };
  const st = blocco(L, "TFR MESE", ["Q/INPS", "POS.", "SETT.", "ORE INPS", "GG. INPS", "GG. MINIM.", "ORE INAIL", "GG. INAIL", "IMPONIBILE INAIL", "IMPONIBILE SILICOSI", "TFR MESE"], 20) || {};
  b.tfr_mese = numeroIt(st["TFR MESE"]) ?? 0;
  b.imponibile_inail = numeroIt(st["IMPONIBILE INAIL"]) ?? 0;
  if (b.totale_lordo == null) b.problemi.push("totale lordo non letto");
  if (b.netto_busta == null) b.problemi.push("netto in busta non letto");
  // dalle voci: ore, giorni, TFR liquidato, crediti fiscali (regole del prompt della versione 270)
  const somma = (codici, campo = "ore_giorni") => r2(b.voci.filter(v => codici.includes(v.codice)).reduce((s, v) => s + (Number(v[campo]) || 0), 0));
  b.ore_ordinarie = somma(["8001"]);
  b.ore_straordinario = somma(["8025", "8006"]);
  b.ore_festivita_godute = somma(["8109", "8118"]);
  b.giorni_ferie_godute = somma(["8111", "106", "8101"]);
  b.ore_permessi_goduti = somma(["8205"]);
  b.ore_rol_goduti = somma(["8116"]);
  b.giorni_malattia = somma(["8864"]);
  b.giorni_retribuiti = r2(somma(["8212"]) + somma(["8864"]));
  b.tfr_liquidato = somma(["8400"], "competenza");
  b.crediti_fiscali = r2(CREDITI_FISCALI.reduce((s, c) => s + b.voci.filter(v => v.codice === c).reduce((t, v) => t + (Number(v.competenza) || 0), 0), 0));
  // L3: una voce con ore o giorni e un codice che non è né contato né già visto e lasciato fuori → la busta va guardata (giallo)
  b.codici_da_guardare = b.voci.filter(v => v.ore_giorni != null && !CODICI_ORE_CONTATI.has(v.codice) && !CODICI_ORE_NON_CONTATI.has(v.codice)).map(v => `${v.codice} ${v.descrizione}`);
  // controllo 4: somma delle competenze (senza crediti fiscali) = totale lordo
  b.somma_competenze = r2(b.voci.reduce((s, v) => s + (Number(v.competenza) || 0), 0) - b.crediti_fiscali);
  return b;
}
export function leggiBuste(pagine) { return pagine.map(leggiBusta); }

// ── Costo del mese (regole del prompt della versione 270, invariate) ─────────────────────────────────
const AUTONOMO = q => /COLLABORATORE|AMMINISTRATORE/i.test(q || "");
function ripartisci(totale, persone, peso) {
  const tot = persone.reduce((s, p) => s + (peso(p) || 0), 0);
  const out = new Map(); let assegnato = 0;
  persone.forEach((p, k) => {
    let v = k === persone.length - 1 ? r2(totale - assegnato) : (tot > 0 ? r2(totale * (peso(p) || 0) / tot) : 0);
    out.set(p, v); assegnato = r2(assegnato + v);
  });
  return out;
}
export function costoDelMese(buste, riep) {
  const dip = buste.filter(b => !AUTONOMO(b.qualifica)), aut = buste.filter(b => AUTONOMO(b.qualifica));
  const inps = ripartisci(riep.inps_azienda, dip, b => b.imponibile_contributivo);
  const inail = ripartisci(riep.inail, dip, b => b.imponibile_contributivo);
  const coll = ripartisci(riep.contributi_collab_azienda, aut, b => b.imponibile_contributivo);
  for (const b of buste) {
    if (AUTONOMO(b.qualifica)) { b.inps_azienda = 0; b.inail_azienda = 0; b.altri_contributi_azienda = coll.get(b) || 0; b.tfr_mese = 0; }
    else { b.inps_azienda = inps.get(b) || 0; b.inail_azienda = inail.get(b) || 0; b.altri_contributi_azienda = 0; }
    b.costo_totale = r2(b.totale_lordo - b.tfr_liquidato + b.tfr_mese + b.inps_azienda + b.inail_azienda + b.altri_contributi_azienda);
  }
  const s = k => r2(buste.reduce((t, b) => t + (Number(b[k]) || 0), 0));
  const controlli = [
    { n: 1, nome: "Somma dei lordi (meno il TFR liquidato) = Salari + Stipendi del riepilogo", a: r2(s("totale_lordo") - s("tfr_liquidato")), b: r2(riep.salari + riep.stipendi) },
    { n: 2, nome: "Somma dei netti in busta = NETTO IN BUSTA del riepilogo", a: s("netto_busta"), b: riep.netto_in_busta },
    { n: 3, nome: "Quote INPS, INAIL e contributi dei collaboratori = totali del riepilogo", a: r2(s("inps_azienda") + s("inail_azienda") + s("altri_contributi_azienda")), b: r2(riep.inps_azienda + riep.inail + riep.contributi_collab_azienda) },
    { n: 5, nome: "Somma dei costi = Salari + Stipendi + TFR del mese + INPS + INAIL + contributi dei collaboratori", a: s("costo_totale"), b: r2(riep.salari + riep.stipendi + s("tfr_mese") + riep.inps_azienda + riep.inail + riep.contributi_collab_azienda) },
  ];
  buste.forEach(b => controlli.push({ n: 4, nome: `${b.cognome_nome}: somma delle competenze (senza crediti fiscali) = totale lordo`, a: b.somma_competenze, b: b.totale_lordo }));
  controlli.forEach(c => { c.ok = Math.abs((c.a ?? NaN) - (c.b ?? NaN)) <= 0.011; });
  return controlli;
}

// ── Il mese: buste mensili + riepilogo + mensilità aggiuntive pagate in quel mese ─────────────────────
// La tredicesima o la quattordicesima va nel mese del riepilogo in cui Salari + Stipendi = lordi mensili + lordi della mensilità aggiuntiva
export function trovaMeseAggiuntiva(riepiloghi, busteMensili, aggiuntive) {
  const lordo = bb => r2(bb.reduce((s, b) => s + (Number(b.totale_lordo) || 0) - (Number(b.tfr_liquidato) || 0), 0));
  const extra = lordo(aggiuntive);
  const trovati = riepiloghi.filter(r => {
    const mens = busteMensili.filter(b => b.anno === r.anno && b.mese === r.mese);
    return Math.abs(lordo(mens) + extra - r2(r.salari + r.stipendi)) <= 0.011;
  });
  return trovati.length === 1 ? trovati[0] : null;
}
