// Versione 410 — Report Ricavi (decisioni del Dott. Bizzarri del 26/11/2026, ore 15:37–17:52).
// Prende il posto di «Vendite per Anno e per Tipo» (versione 303). Importi sempre SENZA IVA.
// Nove colonne: vendita animali, vendita animali vivi, prodotti finiti, lavorazioni conto terzi, allevamento per conto terzi,
// contributi AGEA e pubblici, indennizzi, rifatture e rimborsi spese, altro.
// Anno di ogni vendita (17:34, scelta C): periodo scritto nella riga → periodo delle altre righe della stessa fattura →
// data di uscita del capo (fatture emesse dal programma) → anno della fattura con il segnale. Anno deciso dal Dottore
// (tabella ci_ricavi_anno_deciso, es. FPR 5/25 nel 2024) prima di tutto. Contributi nell'anno della domanda (17:09).
// I soldi dell'Opera Nazionale per le Città dei Ragazzi non entrano (16:59): non sono fatture e la tabella li rifiuta.
import { supabase } from "./supabase";
import { fetchAllPages } from "./parsingUtils";

export const COLONNE_RICAVI = [
  { chiave: "animali", nome: "Vendita animali" },
  { chiave: "vivi", nome: "Vendita animali vivi" },
  { chiave: "prodotti", nome: "Prodotti finiti" },
  { chiave: "contoterzi", nome: "Lavorazioni conto terzi" },
  { chiave: "allevamento", nome: "Allevamento per conto terzi" },
  { chiave: "contributi", nome: "Contributi AGEA e pubblici" },
  { chiave: "indennizzi", nome: "Indennizzi" },
  { chiave: "rifatture", nome: "Rifatture e rimborsi spese" },
  { chiave: "altro", nome: "Altro" },
];

const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
const MESI = { GENNAIO: 1, FEBBRAIO: 2, MARZO: 3, APRILE: 4, MAGGIO: 5, GIUGNO: 6, LUGLIO: 7, AGOSTO: 8, SETTEMBRE: 9, OTTOBRE: 10, NOVEMBRE: 11, DICEMBRE: 12 };
const RE_MESE = /(GENNAIO|FEBBRAIO|MARZO|APRILE|MAGGIO|GIUGNO|LUGLIO|AGOSTO|SETTEMBRE|OTTOBRE|NOVEMBRE|DICEMBRE)\s+(20\d\d)/g;
const RE_SEMESTRE = /(PRIMO|SECONDO|I|II)?\s*SEMESTRE\s+(20\d\d)/;
export const RE_PRODOTTI = /\b(PROSCIUTT|CAPOCOLL|SALAM|SALSICC|LONZ|INSACCAT|PACC[OH]I?|GUANCIAL|PANCETT|LARDO|BISTECC|FETTIN|SPEZZATIN|MACINAT|BIRR[AE]|ARROST|COSTAT|HAMBURG|COPP[AE]|FILONE|SGAMBAT|PORCHETT|STAGIONAT|SALUM|SPUNTATUR|SOPPRESSAT|COTICA|TRIPPA|LOMBI)/;
const RE_CONTOTERZI = /\b(NOLO|BOB ?CAT|ESCAVAT|MINIESCAVAT|TRITURAT|SCAV)/;
const RE_VIVI = /\bVENDITA (VERRO|TORELLO|TORO)|^TORO |CESSIONE|PER MACELLO|DA MACELLO|PRE MACELLO/;
const RE_PEZZI_ANIMALI = /MEZZEN|QUART|CARCASS/;
const RE_STORNO = /STORNO(?:\s+TOTALE)?(?:\s+DELLA)?(?:\s+FATTURA)?(?:\s+N\.?)?\s*(?:FPR\s*)?(\d+)\s*[-/]\s*(\d{2,4})/;
const SPECIE = ["Bovini", "Suini", "Ovini"];

// Periodo scritto in una descrizione: anno del mese più recente (o del semestre). null se non c'è.
export function periodoDi(descrizione) {
  const D = String(descrizione || "").toUpperCase();
  let migliore = null;
  const tieni = v => { if (migliore === null || v > migliore) migliore = v; };
  for (const m of D.matchAll(RE_MESE)) tieni(Number(m[2]) * 100 + MESI[m[1]]);
  // date in cifre di un periodo: solo la coppia «DAL 01/04/2024 AL 18/04/2024» (una data sola, «scadenza al …», non è un periodo)
  for (const m of D.matchAll(/\bDAL\s+\d{1,2}[/.-]\d{1,2}[/.-]20\d\d\s+AL\s+(\d{1,2})[/.-](\d{1,2})[/.-](20\d\d)\b/g)) tieni(Number(m[3]) * 100 + Number(m[2]));
  if (migliore !== null) return { anno: Math.floor(migliore / 100), mese: migliore % 100 };
  const s = D.match(RE_SEMESTRE);
  return s ? { anno: Number(s[2]), mese: /SECONDO|II/.test(s[1] || "") ? 12 : 6 } : null;
}

// Colonna di una riga di fattura (senza storni: quelli seguono la riga stornata).
export function colonnaDi(riga, cliente) {
  const D = String(riga.descrizione || "").toUpperCase();
  const dest = riga.destinazione || "";
  const u = String(riga.unita || "").toUpperCase();
  const C = String(cliente || "").toUpperCase();
  if (C.includes("MURATELLA")) return "rifatture";
  if (D.includes("SERVIZIO DI MANTENIMENTO")) return "allevamento";
  if (dest === "Cavalli" || D.includes("EQUINO") || RE_VIVI.test(D) || (u === "NR" && /TORO|VITELL|MAIAL|VERR/.test(D))) return "vivi";
  if (RE_PEZZI_ANIMALI.test(D) || (SPECIE.includes(dest) && !RE_PRODOTTI.test(D))) return "animali";
  if (RE_PRODOTTI.test(D)) return "prodotti";
  if (C.includes("CERCHIO CHIUSO") || RE_CONTOTERZI.test(D)) return "contoterzi";
  if (SPECIE.includes(dest)) return "animali";
  return "altro";
}

// Specie di una vendita di animali (dettaglio: bovini, suini, ovini).
export function specieDi(riga) {
  if (SPECIE.includes(riga.destinazione)) return riga.destinazione;
  const D = String(riga.descrizione || "").toUpperCase();
  if (/BOVIN|SCOTTON|VITELL|MANZ|VACC|\bTOR[OIE]|CHIANIN|MARCHIGIAN|MAREMMAN|LIMOUSIN/.test(D)) return "Bovini";
  if (/SUIN|MAIAL|PORC|CINTA SENESE|SCROF|VERR|LATTONZOL|MAGRON/.test(D)) return "Suini";
  if (/OVIN|AGNELL|PECOR|MONTON/.test(D)) return "Ovini";
  return "Specie da sistemare";
}

// Voce dei prodotti finiti (16:32): carne bovina, carne suina, salumi, birre; i prodotti che ne mescolano due
// (birra con altro, bovino con suino, «misti», pacchi senza specie) vanno in «Misti», segnalati.
const RE_SALUMI = /PROSCIUTT|CAPOCOLL|SALAM|LONZ|INSACCAT|GUANCIAL|PANCETT|LARDO|COPP[AE]|FILONE|SGAMBAT|PORCHETT|STAGIONAT|SALUM|SOPPRESSAT|COTICA|SALSICC(?!E FRESC)/;
const RE_BOVINA = /BOVIN|MANZ|VITELL|SCOTTON|CHIANIN|MARCHIGIAN|MAREMMAN|LIMOUSIN/;
const RE_SUINA = /SUIN|MAIAL|PORC|LOMBI|CINTA|SALSICCE FRESC/;
export function voceProdotto(riga) {
  const D = String(riga.descrizione || "").toUpperCase();
  const birra = /BIRR[AE]/.test(D), salumi = RE_SALUMI.test(D), bovina = RE_BOVINA.test(D) || riga.destinazione === "Bovini", suina = RE_SUINA.test(D);
  if (/MIST/.test(D) || (birra && (salumi || bovina || suina || /CARNE|PACCO REGALO PASQUA/.test(D))) || (RE_BOVINA.test(D) && /SUIN|MAIAL|PORC|SALSICC|SALAM|CINTA/.test(D))) return "Misti (pacchi e prodotti misti)";
  if (birra) return "Birre";
  if (salumi) return "Salumi";
  if (bovina) return "Carne bovina";
  if (suina || riga.destinazione === "Suini") return "Carne suina";
  return "Misti (pacchi e prodotti misti)";
}

// Kg di una riga (16:28 solo kg carcassa; 17:22 kg dal nome per i prodotti a pezzi):
// unità di peso (KG, Kilogrammi, KGM) → quantità; unità vuota e vendita a peso (animali) o descrizione che finisce con «KG» → quantità;
// a pezzi (PZ, NR, vuota) → peso scritto nel nome («da 400 gr», «5 kg») × pezzi, con la scritta «kg dal nome»; altrimenti «kg non indicati».
const RE_PESO_NOME_TUTTI = /(?:^|[\s(])(\d{1,3}(?:[.,]\d+)?)\s*(KG|GR|G)\b/g;
export function kgDi(riga, aPeso) {
  const u = String(riga.unita || "").toUpperCase().replace(/[.\s]/g, "");
  const q = Math.abs(Number(riga.quantita) || 0);
  const segno = (Number(riga.importo) || 0) < 0 ? -1 : 1;
  const D = String(riga.descrizione || "").toUpperCase().trim();
  const unitaPeso = /^(KG|KGM|KILO|KILOGRAMM[IO]|CHILOGRAMM[IO])$/.test(u);
  const vuota = u === "" || u === "NULL";
  // «pacco … da 1,2 kg»: il peso del pezzo è nel nome, la quantità sono i pezzi (anche se la descrizione finisce con «kg»)
  const pesoPezzo = !aPeso && vuota && /\bDA\s+(?:KG\.?\s*\d|\d{1,3}(?:[.,]\d+)?\s*(?:KG|GR|G)\b)/.test(D);
  if (unitaPeso || (vuota && !pesoPezzo && (aPeso || /\bKG\.?$/.test(D)))) return q > 0 ? { kg: segno * q, come: "quantità della fattura" } : { kg: null, come: "kg non indicati" };
  // peso di un pezzo: somma dei pesi scritti nel nome («1 kg bistecca, 1 kg fettine…»), anche nella forma «KG. 1,6»
  let v = 0;
  for (const m of D.matchAll(RE_PESO_NOME_TUTTI)) v += Number(m[1].replace(",", ".")) * (m[2] === "KG" ? 1 : 0.001);
  if (!v) { const k = D.match(/\bKG\.?\s*(\d{1,3}(?:[.,]\d+)?)\b/); if (k) v = Number(k[1].replace(",", ".")); }
  if (v > 0 && q > 0) return { kg: segno * r2(v * q), come: "kg dal nome" };
  return { kg: null, come: "kg non indicati" };
}

const numeroBreve = n => { const m = String(n || "").match(/(\d+)\s*\/\s*(\d{2,4})/); return m ? `${Number(m[1])}/${m[2].slice(-2)}` : null; };

// Costruisce il report da dati già letti (funzione pura: la usano la pagina e le prove).
// fatture: [{ numero, data, cliente, tipoDocumento, righe: [{ descrizione, quantita, unita, importo, destinazione }] }]
// emesse: [{ numero, data, cliente, righe: [{ descrizione, quantita, importo, specie, dataUscita }] }]
// altre: righe di ci_ricavi_altre_entrate; decisi: righe di ci_ricavi_anno_deciso; oggi: "aaaa-mm-gg"
export function costruisciReport({ fatture = [], emesse = [], altre = [], decisi = [], oggi }) {
  const righe = [];
  const anniDecisi = new Map(decisi.map(d => [String(d.numero).trim().toUpperCase() + "|" + d.data_fattura, d]));
  const perNumero = new Map(); // "4/21" → righe già classificate della fattura (per gli storni)
  const progressivo = n => { const m = String(n || "").match(/(\d+)\s*\/\s*\d{2,4}/); return m ? Number(m[1]) : 0; };
  const ordinate = [...fatture].sort((a, b) => String(a.data).localeCompare(String(b.data)) || progressivo(a.numero) - progressivo(b.numero));
  for (const f of ordinate) {
    const annoFattura = Number(String(f.data).slice(0, 4));
    const deciso = anniDecisi.get(String(f.numero).trim().toUpperCase() + "|" + f.data);
    const periodi = f.righe.map(r => periodoDi(r.descrizione));
    const conPeriodo = periodi.filter(Boolean);
    const mesiPeriodo = [...new Set(conPeriodo.map(p => p.anno * 100 + p.mese))];
    const periodoFattura = conPeriodo.length ? conPeriodo.reduce((a, b) => (b.anno * 100 + b.mese > a.anno * 100 + a.mese ? b : a)) : null;
    const classificate = [];
    f.righe.forEach((r, i) => {
      const D = String(r.descrizione || "").toUpperCase();
      let colonna, anno, come, segnale = "";
      const st = D.match(RE_STORNO);
      if (st) {
        const rif = perNumero.get(`${Number(st[1])}/${st[2].slice(-2)}`);
        const resto = D.replace(RE_STORNO, "").replace(/^[\s:.-]+/, "").slice(0, 25);
        const stornata = rif && (rif.find(x => resto && String(x.descrizione).toUpperCase().startsWith(resto)) || rif.find(x => Math.abs(Math.abs(x.importo) - Math.abs(Number(r.importo))) < 0.005) || (rif.length === 1 ? rif[0] : null));
        if (stornata) { colonna = stornata.colonna; anno = stornata.anno; come = `come la fattura stornata ${stornata.numero}`; }
        else { colonna = "altro"; anno = annoFattura; come = "anno della fattura"; segnale = "storno: fattura stornata non trovata"; }
      } else {
        colonna = colonnaDi(r, f.cliente);
        if (deciso) { anno = deciso.anno; come = "anno deciso dal Dottore"; }
        else if (periodi[i]) { anno = periodi[i].anno; come = "periodo della riga"; }
        else if (periodoFattura) { anno = periodoFattura.anno; come = "periodo della fattura"; if (mesiPeriodo.length > 1) segnale = "periodi diversi nella fattura: preso il più recente"; }
        else { anno = annoFattura; come = "anno della fattura"; segnale = "nessun periodo scritto"; }
        if (colonna === "altro" && Math.abs(Number(r.importo) || 0) > 0.005) segnale = segnale ? segnale + "; da classificare" : "da classificare";
      }
      const x = { origine: "fattura", numero: f.numero, data: f.data, cliente: f.cliente, descrizione: r.descrizione, importo: r2(r.importo), destinazione: r.destinazione || "", quantita: r.quantita, unita: r.unita, colonna, anno, come, segnale };
      if (colonna === "animali") { x.specie = specieDi(r); const k = kgDi(r, true); x.kg = k.kg; x.kgCome = k.come; }
      if (colonna === "prodotti") { x.voce = voceProdotto(r); const k = kgDi(r, false); x.kg = k.kg; x.kgCome = k.come; }
      classificate.push(x); righe.push(x);
    });
    const nb = numeroBreve(f.numero);
    if (nb) perNumero.set(nb, classificate);
  }
  for (const f of emesse) {
    for (const r of f.righe) {
      const specie = { bovino: "Bovini", suino: "Suini", ovino: "Ovini" }[String(r.specie || "").toLowerCase()] || specieDi(r);
      const anno = r.dataUscita ? Number(String(r.dataUscita).slice(0, 4)) : Number(String(f.data).slice(0, 4));
      righe.push({ origine: "programma", numero: f.numero, data: f.data, cliente: f.cliente, descrizione: r.descrizione, importo: r2(r.importo), destinazione: specie, quantita: r.quantita, unita: "KG",
        colonna: "animali", anno, come: r.dataUscita ? "data di uscita del capo" : "anno della fattura", segnale: r.dataUscita ? "" : "nessuna data di uscita", specie, kg: Number(r.quantita) || null, kgCome: "quantità della fattura" });
    }
  }
  for (const a of altre) {
    righe.push({ origine: "entrata", numero: "", data: a.data_accredito, cliente: a.ente, descrizione: a.descrizione, importo: r2(a.importo), destinazione: "", colonna: a.colonna === "indennizzo" ? "indennizzi" : "contributi",
      anno: Number(a.anno_domanda), come: a.colonna === "indennizzo" ? "data dell'indennizzo" : (a.anno_dedotto ? "anno della domanda (dedotto)" : "anno della domanda"), segnale: a.anno_dedotto ? "anno dedotto" : "", fonte: a.fonte || "" });
  }
  const anni = new Map();
  for (const x of righe) {
    const a = anni.get(x.anno) || { anno: x.anno, totale: 0, ...Object.fromEntries(COLONNE_RICAVI.map(c => [c.chiave, 0])) };
    a[x.colonna] = r2(a[x.colonna] + x.importo); a.totale = r2(a.totale + x.importo);
    anni.set(x.anno, a);
  }
  const annoOggi = Number(String(oggi).slice(0, 4));
  const elenco = [...anni.values()].sort((p, q) => p.anno - q.anno).map(a => ({ ...a, inCorso: a.anno === annoOggi }));
  return { anni: elenco, righe, oggi };
}

// Dettaglio di una colonna: gruppi per anno (specie per gli animali, voci per i prodotti, cliente per i conti terzi).
export function dettaglioColonna(report, colonna) {
  const righe = report.righe.filter(x => x.colonna === colonna);
  const chiaveGruppo = x => colonna === "animali" ? x.specie : colonna === "prodotti" ? x.voce : (colonna === "contoterzi" || colonna === "allevamento") ? x.cliente : null;
  const anni = [...new Set(righe.map(x => x.anno))].sort((a, b) => a - b);
  return anni.map(anno => {
    const ra = righe.filter(x => x.anno === anno);
    const gruppi = new Map();
    if (ra.length && chiaveGruppo(ra[0]) !== null) {
      for (const x of ra) {
        const k = chiaveGruppo(x) || "—";
        const g = gruppi.get(k) || { nome: k, importo: 0, kg: 0, kgMancanti: 0, kgDalNome: 0, righe: 0 };
        g.importo = r2(g.importo + x.importo); g.righe++;
        if (x.kg === null || x.kg === undefined) { if (colonna === "animali" || colonna === "prodotti") g.kgMancanti++; }
        else { g.kg = r2(g.kg + x.kg); if (x.kgCome === "kg dal nome") g.kgDalNome++; }
        gruppi.set(k, g);
      }
    }
    const ordine = colonna === "animali" ? ["Bovini", "Suini", "Ovini", "Specie da sistemare"] : colonna === "prodotti" ? ["Carne bovina", "Carne suina", "Salumi", "Birre", "Misti (pacchi e prodotti misti)"] : null;
    const lista = [...gruppi.values()].sort((p, q) => ordine ? ordine.indexOf(p.nome) - ordine.indexOf(q.nome) : q.importo - p.importo)
      .map(g => ({ ...g, euroKg: g.kg > 0 && g.kgMancanti === 0 ? r2(g.importo / g.kg) : null }));
    return { anno, totale: r2(ra.reduce((s, x) => s + x.importo, 0)), gruppi: lista, righe: ra };
  });
}

// Lettura dal database. Le registrazioni in contabilità delle fatture emesse dal programma (fattura_emessa_id)
// non si leggono: la fattura c'è già come «programma» (come nell'elenco delle fatture attive, versione 350).
export async function caricaReportRicavi(oggi) {
  const [att, em, alt, dec] = await Promise.all([
    fetchAllPages((da, a) => supabase.from("ci_fatture").select("id, numero, data, tipo_documento, ci_clienti(nome), ci_articoli_fattura(id, descrizione, quantita, unita_misura, totale_riga, destinazione)").eq("tipo", "ATTIVA").is("fattura_emessa_id", null).order("data").order("id").range(da, a)),
    fetchAllPages((da, a) => supabase.from("ci_fatture_emesse").select("id, numero, data, cliente_denominazione, ci_fatture_emesse_righe(id, numero_linea, descrizione, quantita_kg, importo, specie, data_uscita, attiva)").eq("stato", "emessa").order("data").order("id").range(da, a)),
    supabase.from("ci_ricavi_altre_entrate").select("*").order("data_accredito").order("id"),
    supabase.from("ci_ricavi_anno_deciso").select("*"),
  ]);
  if (att.error) throw new Error(att.error.message);
  if (em.error) throw new Error(em.error.message);
  if (alt.error || dec.error) throw new Error("Mancano le tabelle dei contributi e degli anni decisi: va lanciato l'SQL della versione 410 (" + (alt.error || dec.error).message + ").");
  const fatture = (att.data || []).map(f => ({ numero: f.numero, data: f.data, cliente: f.ci_clienti?.nome || "", tipoDocumento: f.tipo_documento,
    righe: (f.ci_articoli_fattura || []).sort((a, b) => a.id - b.id).map(r => ({ descrizione: r.descrizione, quantita: Number(r.quantita), unita: r.unita_misura, importo: Number(r.totale_riga), destinazione: r.destinazione })) }));
  const emesse = (em.data || []).map(f => ({ numero: f.numero, data: f.data, cliente: f.cliente_denominazione,
    righe: (f.ci_fatture_emesse_righe || []).filter(r => r.attiva !== false).sort((a, b) => a.numero_linea - b.numero_linea).map(r => ({ descrizione: r.descrizione, quantita: Number(r.quantita_kg), importo: Number(r.importo), specie: r.specie, dataUscita: r.data_uscita })) }));
  return costruisciReport({ fatture, emesse, altre: alt.data || [], decisi: dec.data || [], oggi });
}
