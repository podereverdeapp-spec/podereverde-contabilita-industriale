// Versione 316 — Report di Analisi «Break Even» (richiesta del Dott. Bizzarri del 27/10/2026 ore 15:09–15:45):
// un report analitico, come quelli iniziali, che legge le pagine del Break Even e ne trae le conclusioni:
// dove siamo, perché, quali leve contano e quanto, e — quando il pareggio non è raggiungibile — quali alternative
// ci sono, con i numeri. Usa lo stesso motore delle pagine (analisiBreakEven.js) e gli stessi dati: nessuna scrittura.
import { SPECIE, elencoPeriodi, calcolaSpecie, calcolaPareggio, pareggioAzienda, costiPeriodo } from "./analisiBreakEven";
import { esistenteBovini, m2BovinoIngrasso, PARAMETRI_PARTENZA } from "./struttureBreakEven";

const ok = n => n !== null && n !== undefined && Number.isFinite(n);
const conLeve = (x, leve, extraC = null) => calcolaPareggio({ L: { ...x.L, ...leve }, C: extraC ? { ...x.C, ...extraC } : x.C, T: x.T, K: x.K, Q: x.Q });
const conProduzione = (R, prod) => (ok(R.margine) ? prod * R.margine - R.fissi : null);

// Obiettivi tecnici realistici usati dall'analista (si dicono nel report, si possono discutere)
export const OBIETTIVI = {
  bovino: { interparto: 400, testoInterparto: "400 giorni (13 mesi: un vitello all'anno o quasi, obiettivo realistico per una linea vacca-vitello)" },
  suino: { interparto: 165, testoInterparto: "165 giorni (2,2 parti per scrofa all'anno)" },
  ovino: { interparto: 240, testoInterparto: "240 giorni (3 parti in 2 anni)" },
};

// Stato del pareggio di una specie con la produzione del periodo
export function giudizio(R) {
  if (!ok(R.margine) || R.margine <= 0) return { stato: "irraggiungibile", testo: "Irraggiungibile: ogni capo costa più di quanto rende, più capi si vendono più si perde." };
  if (R.prod > 0 && R.capi > R.prod * 3) return { stato: "fuori portata", testo: `Fuori portata: servirebbero ${Math.round(R.capi)} capi contro ${Math.round(R.prod)} prodotti. Il margine di un capo è troppo piccolo per pagare i costi fissi.` };
  if (R.prod > 0 && R.capiEsatti > R.prod) return { stato: "vicino", testo: `Vicino: servono ${R.capi} capi contro ${Math.round(R.prod)} prodotti (la produzione copre il ${Math.round(R.copertura)}% del pareggio).` };
  return { stato: "raggiunto", testo: `Raggiunto: ${R.capi} capi di pareggio contro ${Math.round(R.prod)} prodotti (margine di sicurezza ${Math.round(R.sicurezza)}%).` };
}

// Le leve una per volta, ordinate per effetto sul risultato del periodo
function leve(x) {
  const { L, T, specie } = x, base = x.R.risultato;
  const ob = OBIETTIVI[specie];
  const out = [];
  const prova = (nome, indice, leveNuove, nota) => {
    const y = conLeve(x, leveNuove);
    if (!ok(y.risultato) || !ok(base)) return;
    out.push({ nome, indice, nota, delta: y.risultato - base, risultato: y.risultato, capi: y.capi, margine: y.margine, costoPerNato: y.costoPerNato });
  };
  if (L.prezzo > 0) prova(`Prezzo di vendita +10% (da ${fmt(L.prezzo)} a ${fmt(L.prezzo * 1.1)} € al kg di carcassa)`, "prezzo medio delle fatture", { prezzo: L.prezzo * 1.1 });
  prova("Costi variabili −10% (soprattutto alimentazione)", "costo variabile per UBA al giorno", { variazioneVariabili: -10 });
  prova("Costi fissi −10%", "costi fissi del periodo", { variazioneFissi: -10 });
  if (L.interparto > ob.interparto && x.R.natiVendibiliPerMadre > 0) prova(`Interparto della mandria a ${ob.testoInterparto} (oggi ${Math.round(L.interparto)})`, "interparto della mandria", { interparto: ob.interparto });
  if (T.partiP > 0 && T.mortiP > 0) {
    const natiMeta = (T.viviP + T.mortiP / 2) / T.partiP;
    prova(`Nati morti al parto dimezzati (dal ${fmt(T.natiMortiPerc * 100, 1)}% al ${fmt(T.natiMortiPerc * 50, 1)}%)`, "nati morti al parto (%) · nati vivi per parto", { natiPerParto: natiMeta });
  }
  if (L.mortalita > 0) prova("Mortalità dopo la nascita dimezzata", "mortalità dopo la nascita (%)", { mortalita: L.mortalita / 2 });
  if (L.permanenza > 1 && x.K.ubaVita) prova("Un mese in meno in azienda a parità di peso", "mesi in azienda · peso della carcassa", { permanenza: L.permanenza - 1 });
  return out.sort((a, b) => b.delta - a.delta);
}
const fmt = (n, d = 2) => (ok(n) ? n.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");

// Capi prodotti con le stesse madri quando cambiano i nati vendibili per madre: cambia solo la parte nata in azienda
const prodStesseMadri = (x, y) => (ok(x.R.prod) && x.R.natiVendibiliPerMadre > 0 && ok(y.natiVendibiliPerMadre)
  ? x.R.prod * (1 - x.L.quotaNati / 100) + x.R.prod * (x.L.quotaNati / 100) * y.natiVendibiliPerMadre / x.R.natiVendibiliPerMadre : null);

// Costi fissi evitabili senza la mandria: stima prudente (solo i fissi propri, in proporzione agli UBA dei riproduttori)
const evitabiliMandria = C => (C.ubaProduttivi > 0 ? C.fissiPropri * C.ubaRiproduttori / C.ubaProduttivi : 0);

// ── Alternative per specie ──────────────────────────────────────────────────────────────────────
function alternativeBovini(x) {
  const out = [], R = x.R, L = x.L;
  // 1. Solo ingrasso di vitelli comprati, con i posti di oggi (anche quelli delle madri)
  if (L.acquisto > 0) {
    const es = esistenteBovini();
    const pesoMedio = ((PARAMETRI_PARTENZA.bovino.pesoSvezzamento || 200) + (R.pesoVivo || 0)) / 2;
    const m2 = m2BovinoIngrasso(pesoMedio) || 4;
    const posti = Math.floor((es.ingrasso.coperta + es.riproduttori.coperta) / m2);
    const capiAnno = L.permanenza > 0 ? Math.floor(posti * 12 / L.permanenza) : null;
    const ev = evitabiliMandria(x.C);
    const y = conLeve(x, { quotaNati: 0 }, { fissi: Math.max(x.C.fissi - ev, 0) });
    out.push({
      titolo: "Solo ingrasso di vitelli comprati (niente mandria)",
      testo: `Ogni capo costa ${fmt(y.costoVariabile)} € (acquisto ${fmt(L.acquisto)} € + mantenimento) e porta un margine di ${fmt(y.margine)} €. Senza madri i costi fissi scendono di circa ${fmt(ev, 0)} € (stima prudente: solo i fissi propri dei riproduttori). Il pareggio è a ${y.capi ?? "—"} capi all'anno. Con lo spazio coperto di oggi (${Math.round(es.ingrasso.coperta + es.riproduttori.coperta)} m², ${fmt(m2, 1)} m² a capo per un peso medio di ${Math.round(pesoMedio)} kg) stanno ${posti} capi, cioè ${capiAnno ?? "—"} capi venduti all'anno con ${fmt(L.permanenza, 1)} mesi in azienda.`,
      righe: [["Con la produzione di oggi", R.prod, conProduzione(y, R.prod)], ["Con le stalle piene", capiAnno, ok(capiAnno) ? conProduzione(y, capiAnno) : null]],
      capi: y.capi, nota: `Capitale: ${fmt((capiAnno || 0) * L.acquisto, 0)} € all'anno per comprare i vitelli; la vendita delle madri porta un incasso una volta sola. Tempi: i primi capi comprati escono dopo ${fmt(L.permanenza, 0)} mesi. Rischio: dipende dal prezzo e dalla disponibilità dei vitelli sul mercato.`,
    });
  }
  // 2. Vendere i vitelli allo svezzamento (linea vacca-vitello)
  if (ok(R.costoPerNato) && L.acquisto > 0) {
    out.push({
      titolo: "Vendere i vitelli allo svezzamento invece di ingrassarli",
      testo: `Un vitello nato in azienda costa ${fmt(R.costoPerNato)} € di soli costi variabili della mandria; un vitello si compra a ${fmt(L.acquisto)} € (media dei comprati, il riferimento di mercato che abbiamo). Venduto a quel prezzo, ogni vitello perderebbe ${fmt(R.costoPerNato - L.acquisto)} € prima ancora dei costi fissi: con la fertilità di oggi la linea vacca-vitello non regge.`,
      righe: [], nota: "Da escludere finché il costo di un nato non scende sotto il prezzo di mercato del vitello.",
    });
  }
  // 3. Mandria più efficiente
  const ob = OBIETTIVI.bovino;
  if (x.T.partiP > 0) {
    const nuoviNati = (x.T.viviP + x.T.mortiP / 2) / x.T.partiP;
    const y = conLeve(x, { interparto: Math.min(L.interparto, ob.interparto), natiPerParto: nuoviNati });
    out.push({
      titolo: "Tenere la mandria ma farla rendere",
      testo: `Interparto a ${ob.interparto} giorni (oggi ${Math.round(L.interparto)}) e nati morti dimezzati: il costo di un nato passa da ${fmt(R.costoPerNato)} € a ${fmt(y.costoPerNato)} €, il margine di un capo da ${fmt(R.margine)} € a ${fmt(y.margine)} €. ${y.costoPerNato > L.acquisto ? `Resta sopra il prezzo di un vitello comprato (${fmt(L.acquisto)} €).` : "Scende sotto il prezzo di un vitello comprato."}`,
      righe: [["Con la produzione di oggi (ogni nato costa meno)", R.prod, conProduzione(y, R.prod)], ["Con le stesse madri (più nati da vendere)", prodStesseMadri(x, y), conProduzione(y, prodStesseMadri(x, y))]], capi: y.capi,
      nota: "Più nati con le stesse madri chiedono più posti all'ingrasso (pagina «Strutture necessarie»). Strumenti: fecondazione e diagnosi di gravidanza regolari, riforma delle vacche che non restano gravide, controllo dei parti. Tempi: almeno un ciclo (circa 2 anni) prima di vederlo nelle vendite.",
    });
  }
  return out;
}

function alternativeSuini(x) {
  const out = [], R = x.R, L = x.L, T = x.T;
  if (T.partiP > 0) {
    const totaliPerParto = (T.viviP + T.mortiP) / T.partiP;
    const obiettivoVivi = totaliPerParto * 0.75; // 25% di perdite tra nati morti e persi prima della registrazione: obiettivo prudente per il semibrado
    const y = conLeve(x, { natiPerParto: Math.max(obiettivoVivi, L.natiPerParto) });
    out.push({
      titolo: "Salvare i suinetti alla nascita",
      testo: `Oggi nascono ${fmt(totaliPerParto, 1)} suinetti per parto ma ne restano vivi ${fmt(L.natiPerParto, 2)} (${fmt(T.natiMortiPerc * 100, 0)}% di perdite tra nati morti e morti prima della registrazione nel lotto). Con perdite al 25% (obiettivo prudente per il semibrado) resterebbero ${fmt(obiettivoVivi, 1)} vivi per parto: il costo di un nato passa da ${fmt(R.costoPerNato)} € a ${fmt(y.costoPerNato)} €.`,
      righe: [["Con la produzione di oggi (ogni nato costa meno)", R.prod, conProduzione(y, R.prod)], ["Con le stesse scrofe (più suini da vendere)", prodStesseMadri(x, y), conProduzione(y, prodStesseMadri(x, y))]], capi: y.capi,
      nota: "Con le stesse scrofe i suinetti salvati diventano suini da vendere: servono i posti all'ingrasso (pagina «Strutture necessarie») e i clienti per la carne in più. È la leva più grande dei suini. Strumenti: protocollo di sala parto e di registrazione dei morti con la causa (già ordinato), controllo dei parti. Effetto entro un anno.",
    });
  }
  if (ok(R.capi) && R.prod > 0 && R.capi > R.prod) {
    out.push({
      titolo: "Produrre i capi che mancano",
      testo: `Mancano ${R.capi - Math.round(R.prod)} capi al pareggio. Con ${fmt(R.natiVendibiliPerMadre, 2)} nati vendibili per scrofa all'anno servirebbero circa ${Math.ceil((R.capi - R.prod) * (L.quotaNati / 100) / (R.natiVendibiliPerMadre || 1))} scrofe in più, oppure gli stessi capi ottenuti salvando più suinetti con le scrofe di oggi.`,
      righe: [], nota: "Prima si salva la nidiata (costa poco), poi semmai si aumentano le scrofe (costa stalla e capitale).",
    });
  }
  return out;
}

function alternativeOvini(x, risultatiAltri) {
  const out = [], R = x.R, L = x.L;
  const contributo = ok(R.prod) ? R.prod * R.margine : null;
  out.push({
    titolo: "Ridurre o chiudere il gregge",
    testo: `Con ${Math.round(R.prod)} agnelli a ${fmt(R.margine)} € di margine ciascuno, gli ovini tolgono ${fmt(-(contributo ?? 0), 0)} € all'anno prima ancora dei costi fissi. I costi fissi propri degli ovini sono ${fmt(x.C.fissiPropri, 0)} €; i ${fmt(x.C.fissiComuni, 0)} € di costi comuni non sparirebbero: passerebbero sui bovini e sui suini. Per l'azienda il risultato migliorerebbe di circa ${fmt(-(contributo ?? 0) + x.C.fissiPropri, 0)} € all'anno.`,
    righe: [], nota: "Da pesare con quello che i numeri non vedono: pascolo dei terreni, PAC, richiesta dei clienti, valore della razza.",
  });
  if (x.T.partiP > 0) {
    const y = conLeve(x, { natiPerParto: Math.max(L.natiPerParto, 1.4), interparto: Math.min(L.interparto, OBIETTIVI.ovino.interparto) });
    out.push({
      titolo: "Più agnelli per pecora",
      testo: `Con 1,4 agnelli vivi per parto (oggi ${fmt(L.natiPerParto, 2)}) e interparto a 240 giorni il costo di un agnello passa da ${fmt(R.costoPerNato)} € a ${fmt(y.costoPerNato)} €, contro un ricavo di ${fmt(R.ricavo)} €.${y.margine > 0 ? "" : " Non basta: il costo resta sopra il ricavo."}`,
      righe: [["Con la produzione di oggi", R.prod, conProduzione(y, R.prod)]], capi: y.capi,
      nota: "I parti delle pecore non sono registrati tutti: prima di decidere, i dati vanno completati (Sborchia).",
    });
  }
  return out;
}

// ── Analisi completa ────────────────────────────────────────────────────────────────────────────
export function analisiReport(A, oggi = new Date()) {
  const periodi = elencoPeriodi(oggi);
  const principale = periodi[0];                          // ultimo anno completo (dato certo)
  const mobili = periodi.filter(p => p.tipo === "mobile");
  const corrente = mobili[0] || null;
  const ordineSerie = [...periodi.filter(p => p.tipo === "anno").sort((a, b) => (a.a < b.a ? -1 : 1)), ...mobili.slice().reverse()];
  const specie = {};
  for (const s of SPECIE) {
    const x = calcolaSpecie(A, principale, s, "base");
    const xc = calcolaSpecie(A, principale, s, "con");
    const serie = ordineSerie.map(P => { const y = calcolaSpecie(A, P, s, "base"); return { P, R: y.R, L: y.L }; });
    const xm = corrente ? calcolaSpecie(A, corrente, s, "base") : null;
    const lev = leve(x);
    let alt = [];
    if (s === "bovino") alt = alternativeBovini(x);
    if (s === "suino") alt = alternativeSuini(x);
    if (s === "ovino") alt = alternativeOvini(x);
    specie[s] = { x, xc, xm, serie, giudizio: giudizio(x.R), giudizioCorrente: xm ? giudizio(xm.R) : null, leve: lev, alternative: alt, perche: perche(x), certezza: certezza(x, xc) };
  }
  const az = pareggioAzienda(SPECIE.map(s => specie[s].x.R));
  const comuni = SPECIE.map(s => { const x = specie[s].x; const contr = ok(x.R.prod) ? x.R.prod * x.R.margine : null;
    return { specie: s, margine: contr, propri: x.C.fissiPropri, contributo: ok(contr) ? contr - x.C.fissiPropri : null, comuni: x.C.fissiComuni, risultato: x.R.risultato }; });
  return { principale, corrente, specie, azienda: az, comuni, piano: piano(specie) };
}

// Perché: di cosa è fatto il costo di un capo e chi paga i costi fissi
function perche(x) {
  const R = x.R, L = x.L, C = x.C, out = [];
  if (ok(R.ricavo) && R.ricavo > 0) {
    out.push(`Un capo rende ${fmt(R.ricavo)} € (${fmt(R.peso, 1)} kg di carcassa a ${fmt(L.prezzo)} €). Di questi, ${fmt(R.partenzaCapo)} € (${fmt(R.partenzaCapo / R.ricavo * 100, 0)}%) servono a farlo nascere o a comprarlo${L.quotaNati > 0 && L.quotaNati < 100 ? ` (${fmt(L.quotaNati, 0)}% nati in azienda, ${fmt(100 - L.quotaNati, 0)}% comprati)` : ""} e ${fmt(R.mantenimento)} € (${fmt(R.mantenimento / R.ricavo * 100, 0)}%) a mantenerlo: restano ${fmt(R.margine)} € per i costi fissi.`);
  }
  if (ok(R.costoPerNato)) {
    const conf = L.acquisto > 0 ? ` Un capo comprato costa ${fmt(L.acquisto)} €: far nascere costa ${R.costoPerNato > L.acquisto ? `${fmt(R.costoPerNato / L.acquisto, 1)} volte tanto` : "meno che comprare"}.` : "";
    out.push(`Un nato vendibile costa ${fmt(R.costoPerNato)} €: ${fmt(R.costoMandriaPerMadre, 0)} € di costi variabili per madre all'anno divisi su ${fmt(R.natiVendibiliPerMadre, 2)} nati vendibili (interparto ${Math.round(L.interparto)} giorni, ${fmt(L.natiPerParto, 2)} nati vivi per parto${L.mortalita > 0 ? `, mortalità ${fmt(L.mortalita, 1)}%` : ""}).${conf}`);
  }
  if (C.fissi > 0) out.push(`Costi fissi ${fmt(C.fissi, 0)} €: ${fmt(C.fissiPropri, 0)} € propri della specie e ${fmt(C.fissiComuni, 0)} € (${fmt(C.fissiComuni / C.fissi * 100, 0)}%) comuni dell'azienda (lavoro, consulenze, assicurazioni, ammortamenti generali) ripartiti per UBA-giorno; gli ammortamenti sono ${fmt(C.ammortamenti, 0)} €.${ok(R.prod) && R.prod > 0 ? ` Su ${Math.round(R.prod)} capi prodotti fanno ${fmt(C.fissi / R.prod, 0)} € a capo.` : ""}`);
  return out;
}

// Quanto sono certi i numeri: differenza tra scenario base e scenario con i dati da verificare
function certezza(x, xc) {
  return { base: x.R, con: xc.R, differenzaRisultato: ok(x.R.risultato) && ok(xc.R.risultato) ? xc.R.risultato - x.R.risultato : null,
    senzaPeso: x.Q.senzaPeso.length, fonte: x.Q.fonte };
}

// Il piano dell'analista: la migliore alternativa di ogni specie messa insieme, a livello di azienda
function piano(specie) {
  const b = specie.bovino, su = specie.suino, o = specie.ovino;
  const bov = b.alternative.find(a => a.titolo.startsWith("Solo ingrasso"));
  const sui = su.alternative.find(a => a.titolo.startsWith("Salvare"));
  const voci = [];
  const ris = (a, i) => (a && a.righe[i] && ok(a.righe[i][2]) ? a.righe[i][2] : null);
  voci.push({ specie: "bovino", oggi: b.x.R.risultato, piano: ris(bov, 1) ?? b.x.R.risultato, cosa: bov ? "solo ingrasso di vitelli comprati, con le stalle piene" : "come oggi" });
  voci.push({ specie: "suino", oggi: su.x.R.risultato, piano: ris(sui, 1) ?? su.x.R.risultato, cosa: sui ? "suinetti salvati alla nascita (perdite al 25%), con le stesse scrofe" : "come oggi" });
  voci.push({ specie: "ovino", oggi: o.x.R.risultato, piano: -(o.x.C.fissiComuni || 0), cosa: "gregge chiuso: restano i costi comuni che portava" });
  return { voci, oggi: voci.reduce((t, v) => t + (v.oggi || 0), 0), piano: voci.reduce((t, v) => t + (v.piano || 0), 0) };
}
