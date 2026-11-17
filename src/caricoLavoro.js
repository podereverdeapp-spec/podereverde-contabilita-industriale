// Versione 387 (Tenente, 17/11/2026) — «Leggi le buste paga e i pagamenti»: dai file letti ai mesi da registrare.
// Regole L1–L9 del progetto approvato dal Dott. Bizzarri (claude/progetto_387_lavoro_caricamento_veloce.md):
// un mese alla volta, tutto o niente (buste del mese + riepilogo + tredicesima o quattordicesima pagate in quel mese);
// 5 controlli al centesimo; lo stesso PDF non entra due volte; un mese già nel programma solo con «Sostituisci il mese» e il motivo.
// Qui nessuna scrittura: la pagina chiama il database (ci_lavoro_carica_mese), che rifà i controlli.
import { costoDelMese, trovaMeseAggiuntiva } from "./lettoreBustePaga";

const MESI = ["", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export const nomeMese = (m, a) => `${MESI[m] || "?"} ${a}`;
const chiave = (a, m) => `${a}-${String(m).padStart(2, "0")}`;

// letti: [{ id, nome, impronta, tipo: "busta" | "riepilogo" | "senza testo" | null | "doppione", buste?, riep?, gemello? }]
// db: { mesi: Set("AAAA-MM"), file: Map(impronta → { anno, mese, tipo, nome_file }), dipendenti: Map(cf → { id, cognome_nome }),
//       esclusioni: [{ dipendente_id, dal, al }] }
// → { file: [{ ...f, stato, motivo, mese? }], mesi: [ ... ] }
export function componiMesi(letti, db) {
  const file = letti.map(f => ({ ...f }));
  const presenti = f => db.file.get(f.impronta);
  for (const f of file) {
    if (f.tipo === "doppione") { f.stato = "rosso"; f.motivo = `copia identica di «${f.gemello}»: si legge una volta sola`; continue; }
    // già nel programma: entra lo stesso nel suo mese (serve a «Sostituisci il mese» quando il consulente rimanda solo una parte dei file);
    // se tutti i file del mese sono già nel programma, il file resta giallo e va solo nell'archivio del cloud
    const g = presenti(f);
    if (g) { f.giaCaricato = g; f.motivoGia = `già nel programma (${g.tipo}, ${nomeMese(g.mese, g.anno)}, caricato come «${g.nome_file}»)`; }
    if (f.tipo === "senza testo") { f.stato = "rosso"; f.motivo = "è una scansione senza testo: chiedere al consulente del lavoro il PDF originale (non si caricano buste scansionate)"; continue; }
    if (f.tipo === null || f.tipo === undefined) { f.stato = "rosso"; f.motivo = "non è una busta paga TeamSystem né un riepilogo paghe e contributi"; continue; }
    if (f.tipo === "riepilogo") {
      if (!f.riep?.mese || !f.riep?.anno) { f.stato = "rosso"; f.motivo = "mese e anno del riepilogo non letti"; }
      continue;
    }
    // busta: tutte le pagine dello stesso mese e dello stesso tipo
    const tipi = new Set(f.buste.map(b => `${b.tipo}|${b.tipo === "mensile" ? b.mese : ""}|${b.anno}`));
    const conProblemi = f.buste.filter(b => b.problemi.length);
    if (conProblemi.length) { f.stato = "rosso"; f.motivo = conProblemi.map(b => `pagina ${b.pagina}: ${b.problemi.join(", ")}`).join("; "); continue; }
    if (tipi.size !== 1) { f.stato = "rosso"; f.motivo = "nel file ci sono buste di mesi o tipi diversi: un file deve avere le buste di un solo mese (o solo la tredicesima, o solo la quattordicesima)"; continue; }
  }
  const buoni = file.filter(f => !f.stato);
  const riepiloghi = buoni.filter(f => f.tipo === "riepilogo");
  const mensili = buoni.filter(f => f.tipo === "busta" && f.buste[0].tipo === "mensile");
  const aggiuntive = buoni.filter(f => f.tipo === "busta" && f.buste[0].tipo !== "mensile");
  const mesi = new Map();
  const mese = (a, m) => { const k = chiave(a, m); if (!mesi.has(k)) mesi.set(k, { chiave: k, anno: a, mese: m, riepiloghi: [], fileBuste: [], buste: [], motivi: [] }); return mesi.get(k); };
  for (const r of riepiloghi) mese(r.riep.anno, r.riep.mese).riepiloghi.push(r);
  for (const f of mensili) { const g = mese(f.buste[0].anno, f.buste[0].mese); g.fileBuste.push(f); f.buste.forEach(b => g.buste.push({ ...b, file: f })); }
  // tredicesima e quattordicesima: nel mese del riepilogo in cui salari + stipendi = lordi mensili + lordi della mensilità aggiuntiva (L6)
  const busteMensili = mensili.flatMap(f => f.buste);
  for (const f of aggiuntive) {
    const ri = trovaMeseAggiuntiva(riepiloghi.map(r => r.riep).filter(r => r.anno === f.buste[0].anno || r.anno === f.buste[0].anno + 1), busteMensili, f.buste);
    if (!ri) { f.stato = "rosso"; f.motivo = `non si trova il mese in cui è stata pagata la ${f.buste[0].tipo}: scegliere insieme le buste e il riepilogo di quel mese`; continue; }
    const g = mese(ri.anno, ri.mese); g.fileBuste.push(f); f.buste.forEach(b => g.buste.push({ ...b, mese: ri.mese, anno: ri.anno, file: f }));
  }
  const out = [];
  for (const g of [...mesi.values()].sort((a, b) => a.chiave.localeCompare(b.chiave))) {
    const nome = nomeMese(g.mese, g.anno);
    const tutti = [...g.fileBuste, ...g.riepiloghi];
    if (tutti.every(f => f.giaCaricato)) { tutti.forEach(f => { f.stato = "giallo"; f.motivo = f.motivoGia; }); continue; }
    tutti.filter(f => f.giaCaricato && (f.giaCaricato.anno !== g.anno || f.giaCaricato.mese !== g.mese))
      .forEach(f => g.motivi.push(`«${f.nome}» è già nel programma in ${nomeMese(f.giaCaricato.mese, f.giaCaricato.anno)}: toglierlo dalla scelta`));
    if (g.riepiloghi.length > 1) g.motivi.push(`ci sono ${g.riepiloghi.length} riepiloghi di ${nome}: sceglierne uno`);
    if (!g.riepiloghi.length) g.motivi.push(`manca il riepilogo paghe e contributi di ${nome}`);
    if (!g.fileBuste.some(f => f.buste[0].tipo === "mensile")) g.motivi.push(`mancano le buste paga di ${nome}`);
    if (g.fileBuste.filter(f => f.buste[0].tipo === "mensile").length > 1) g.motivi.push(`ci sono più file di buste di ${nome}: se uno è la busta corretta di una persona, togliere dal file del mese la busta vecchia non si può: chiedere al consulente il file del mese corretto`);
    const doppie = g.buste.filter((b, i) => g.buste.findIndex(x => x.codice_fiscale === b.codice_fiscale && x.tipo === b.tipo) !== i);
    if (doppie.length) g.motivi.push(`${doppie.map(b => b.cognome_nome).join(", ")} compare due volte`);
    g.riep = g.riepiloghi.length === 1 ? g.riepiloghi[0].riep : null;
    g.fileRiep = g.riepiloghi.length === 1 ? g.riepiloghi[0] : null;
    g.controlli = [];
    if (g.riep && g.buste.length && !doppie.length) {
      g.controlli = costoDelMese(g.buste, g.riep);
      g.controlli.filter(c => !c.ok).forEach(c => g.motivi.push(`controllo ${c.n} non torna: ${c.nome} (${c.a} invece di ${c.b})`));
    }
    g.daGuardare = g.buste.flatMap(b => (b.codici_da_guardare || []).map(c => `${b.cognome_nome}: voce ${c} con ore o giorni che il programma non conta`));
    g.giaNelProgramma = db.mesi.has(g.chiave);
    // persone: nuove o già note; nel costo degli animali o no per l'anno (L5, esclusioni come oggi: per anno intero)
    g.persone = [...new Map(g.buste.map(b => [b.codice_fiscale, b])).values()].map(b => {
      const d = db.dipendenti.get(b.codice_fiscale);
      const esc = a => !!d && db.esclusioni.some(e => e.dipendente_id === d.id && e.dal <= `${a}-12-31` && (!e.al || e.al >= `${a}-01-01`));
      return { cf: b.codice_fiscale, nome: b.cognome_nome, qualifica: b.qualifica, nuova: !d, id: d?.id || null, esclusaAnno: esc(g.anno), esclusaAnnoPrima: esc(g.anno - 1) };
    });
    g.stato = g.motivi.length ? "rosso" : g.giaNelProgramma ? "giallo" : g.daGuardare.length ? "attesa" : "verde";
    for (const f of [...g.fileBuste, ...g.riepiloghi]) { f.mese = g.chiave; if (!f.stato) f.stato = "nelMese"; }
    out.push(g);
  }
  for (const f of file) if (!f.stato) { f.stato = "rosso"; f.motivo = "non fa parte di nessun mese"; }
  // un file già nel programma che qui non entra in nessun mese resta giallo (va solo nell'archivio del cloud)
  for (const f of file) if (f.giaCaricato && f.stato === "rosso" && f.tipo !== "doppione") { f.stato = "giallo"; f.motivo = f.motivoGia; }
  return { file, mesi: out };
}

// Dati per il database (ci_lavoro_carica_mese). percorsi: { busta: Map(busta → percorso), riepilogo, mese: Map(impronta → percorso) }
export function datiDelMese(g, { escludi = [], sostituisci = false, motivo = "", percorsi = {} } = {}) {
  const num = v => (v == null || v === "" ? null : Number(v));
  return {
    anno: g.anno, mese: g.mese, sostituisci, motivo: motivo || null, escludi,
    riepilogo: { ...pulisci(g.riep), nome_file: g.fileRiep.nome, impronta: g.fileRiep.impronta, pdf_percorso: percorsi.riepilogo || null },
    buste: g.buste.map(b => ({
      tipo: b.tipo, cognome_nome: b.cognome_nome, codice_fiscale: b.codice_fiscale, qualifica: b.qualifica, livello: b.livello, retribuzione_oraria: num(b.retribuzione_oraria),
      data_assunzione: b.data_assunzione, data_cessazione: b.data_cessazione,
      totale_lordo: num(b.totale_lordo), tfr_liquidato: num(b.tfr_liquidato), tfr_mese: num(b.tfr_mese), imponibile_contributivo: num(b.imponibile_contributivo),
      contributi_dipendente: num(b.contributi_dipendente), inps_azienda: num(b.inps_azienda), inail_azienda: num(b.inail_azienda), altri_contributi_azienda: num(b.altri_contributi_azienda),
      costo_totale: num(b.costo_totale), netto_busta: num(b.netto_busta), crediti_fiscali: num(b.crediti_fiscali),
      ore_ordinarie: num(b.ore_ordinarie), ore_straordinario: num(b.ore_straordinario), ore_festivita_godute: num(b.ore_festivita_godute), giorni_retribuiti: num(b.giorni_retribuiti),
      giorni_ferie_godute: num(b.giorni_ferie_godute), ore_permessi_goduti: num(b.ore_permessi_goduti), ore_rol_goduti: num(b.ore_rol_goduti), giorni_malattia: num(b.giorni_malattia),
      ferie: b.ferie, permessi: b.permessi, rol: b.rol, festivita: b.festivita,
      voci: b.voci.map(v => ({ codice: v.codice, descrizione: v.descrizione, ore_giorni: v.ore_giorni, base: v.base, competenza: v.competenza, trattenuta: v.trattenuta, dato_statistico: v.dato_statistico })),
      pagina: b.pagina, file_origine: b.file.nome, file_impronta: b.file.impronta, pdf_percorso: percorsi.busta?.get(b) || null,
    })),
    file: [...g.fileBuste.map(f => ({ impronta: f.impronta, tipo: "buste paga", nome_file: f.nome, pdf_percorso: percorsi.mese?.get(f.impronta) || null })),
      { impronta: g.fileRiep.impronta, tipo: "riepilogo", nome_file: g.fileRiep.nome, pdf_percorso: percorsi.riepilogo || null }],
  };
}
function pulisci(r) { const { voci, ...resto } = r; return resto; }   // le righe lette del riepilogo non servono al database

// Archivio del programma («buste-paga»): stessi percorsi della versione 271
export const percorsoBusta = b => `${String(b.cognome_nome).replace(/[/\\]/g, " ").trim()}/${b.anno}/${b.anno}-${String(b.mese).padStart(2, "0")}_${b.tipo === "mensile" ? "cedolino" : b.tipo}.pdf`;
export const percorsoRiepilogo = g => `RIEPILOGHI/${g.anno}/${String(g.mese).padStart(2, "0")}.${g.anno}_RIEPILOGO.pdf`;
export const percorsoFileMese = (g, f) => `BUSTE DEL MESE/${g.anno}/${String(g.mese).padStart(2, "0")}.${g.anno}_${f.buste[0].tipo === "mensile" ? "BUSTE PAGA" : f.buste[0].tipo.toUpperCase()}.pdf`;
export const percorsoPagamento = (b, estensione = ".pdf") => `PAGAMENTI/${String(b.cognome_nome).replace(/[/\\]/g, " ").trim()}/${b.anno}/${b.anno}-${String(b.mese).padStart(2, "0")}_${b.tipo === "mensile" ? "stipendio" : b.tipo}_pagamento${estensione}`;
