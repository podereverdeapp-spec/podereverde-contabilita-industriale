// Versione 314 — Strutture necessarie (decisione del Dott. Bizzarri del 27/10/2026 ore 12:32):
// al cambiare del prezzo cambiano i capi di pareggio; la scheda dice quante superfici coperte, mangiatoie,
// abbeveratoi, spazi aperti e quanto foraggio servono a quei capi, e li confronta con quelli che l'azienda ha.
// Inventario dei bovini: dati del Dott. Bizzarri del 16/10/2026. Suini e ovini: dalla «Scheda di rilevazione
// delle strutture» (consegnata il 27/10/2026), quando sarà compilata e caricata.

// Fonti dei metri quadri coperti per capo (ricovero):
// - vitelli sotto i 6 mesi: D.Lgs. 126/2011 (1,5 m² sotto 150 kg; 1,7 m² 150–220 kg; 1,8 m² oltre 220 kg);
// - suini: D.Lgs. 122/2011 (ingrasso da 0,15 a 1,00 m² secondo il peso; scrofette 1,64 m²; scrofe 2,25 m²);
// - bovini adulti, manze, tori, bovini da ingrasso, verri, ovini: valori di riferimento per le aree di ricovero degli
//   allevamenti bradi e semibradi (Regione Basilicata, Programma di Sviluppo Rurale, Allegato 5, che cita Classyfarm,
//   Istituto Zooprofilattico della Lombardia e dell'Emilia-Romagna, Centro di Referenza Nazionale per il Benessere Animale).
export const FONTI = {
  vitelli: "D.Lgs. 126/2011",
  suini: "D.Lgs. 122/2011",
  ricovero: "Regione Basilicata, Programma di Sviluppo Rurale, Allegato 5 «aree di ricovero» (Classyfarm, IZS Lombardia ed Emilia-Romagna, CReNBA)",
};

// m² coperti per un bovino da ingrasso secondo il peso vivo (fonte: ricovero)
export function m2BovinoIngrasso(peso) {
  if (!(peso > 0)) return null;
  if (peso < 150) return 1.5;
  if (peso < 220) return 1.7;
  if (peso < 400) return 4.0; // manze (valore più vicino per questo peso)
  const passi = [[500, 4.5], [600, 5], [700, 5.5], [800, 6], [900, 6.5], [1000, 7]];
  for (const [fino, m2] of passi) if (peso < fino) return m2;
  return 7.5;
}
// m² per un suino all'ingrasso secondo il peso vivo (D.Lgs. 122/2011)
export function m2SuinoIngrasso(peso) {
  if (!(peso > 0)) return null;
  for (const [fino, m2] of [[10, 0.15], [20, 0.2], [30, 0.3], [50, 0.4], [85, 0.55], [110, 0.65]]) if (peso <= fino) return m2;
  return 1.0;
}
export const PARAMETRI_PARTENZA = {
  bovino: { madri: 7, tori: 10, pesoSvezzamento: 200 },
  suino: { madri: 2.25, tori: 6, pesoSvezzamento: 0 },
  ovino: { madri: 1.7, tori: 2.2, agnelli: 0.5 },
  fienoPerUbaGiorno: 10.3, // kg di fieno misto al giorno della vacca asciutta (razione del 16/10/2026): 1 vacca = 1 UBA
  pesoBallone: 340,
};
// UBA per capo (coefficienti del programma)
export const UBA_CAPO = { bovino: { madri: 1, tori: 1, ingrasso: 0.7 }, suino: { madri: 0.5, tori: 0.5, ingrasso: 0.3 }, ovino: { madri: 0.15, tori: 0.15, ingrasso: 0.027 } };

// Inventario dei bovini (16/10/2026). gruppo: riproduttori | ingrasso | servizio
export const INVENTARIO_BOVINI = [
  { ambiente: "Box 1", gruppo: "ingrasso", uso: "svezzati 5–7 mesi", coperta: 52, totale: null, rastrelliere: 1, abbeveratoi: null },
  { ambiente: "Box 2", gruppo: "ingrasso", uso: "giovani 8–10 mesi", coperta: 33, totale: null, rastrelliere: 1, abbeveratoi: null },
  { ambiente: "Box 3", gruppo: "ingrasso", uso: "femmine 10–16 mesi e manze da rimonta", coperta: 52, totale: null, rastrelliere: 1, abbeveratoi: null },
  { ambiente: "Box 4", gruppo: "ingrasso", uso: "maschi 10–15 mesi", coperta: 52, totale: null, rastrelliere: 1, abbeveratoi: null },
  { ambiente: "Box 5", gruppo: "ingrasso", uso: "maschi 16 mesi e oltre", coperta: 52, totale: null, rastrelliere: 1, abbeveratoi: null },
  { ambiente: "Paddock femmine adulte (con il box finissaggio di 15 m² sotto la tettoia)", gruppo: "ingrasso", uso: "vitellone e scottone dai 16 mesi; finissaggio", coperta: 160, totale: 3800, rastrelliere: 3, abbeveratoi: 5 },
  { ambiente: "Paddock B", gruppo: "riproduttori", uso: "Marchigiane e Maremmane con toro", coperta: 110, totale: 2400, rastrelliere: 4, abbeveratoi: 6 },
  { ambiente: "Paddock C", gruppo: "riproduttori", uso: "Chianine con toro", coperta: 35, totale: 470, rastrelliere: 1, abbeveratoi: 2 },
  { ambiente: "Paddock D", gruppo: "riproduttori", uso: "Limousine con toro", coperta: 30, totale: 563, rastrelliere: 1, abbeveratoi: 2 },
  { ambiente: "Box 7 e Box 8 — sale parto", gruppo: "servizio", uso: "vacche al parto", coperta: 36, totale: 110, rastrelliere: null, abbeveratoi: null },
  { ambiente: "10 — nursery (3 box in legno)", gruppo: "servizio", uso: "vitelli piccoli", coperta: 45, totale: 90, rastrelliere: null, abbeveratoi: null },
  { ambiente: "Box 6 — infermeria", gruppo: "servizio", uso: "animali malati", coperta: 15, totale: 45, rastrelliere: null, abbeveratoi: null },
  { ambiente: "Box 9", gruppo: "servizio", uso: "vari usi", coperta: 30, totale: 30, rastrelliere: null, abbeveratoi: null },
  { ambiente: "Incastrino I", gruppo: "servizio", uso: "trattamenti, anche per tenerci animali", coperta: 25, totale: 118, rastrelliere: null, abbeveratoi: 1 },
];
export const PASCOLI_BOVINI = [
  { nome: "F — Uliveto (campo 7)", ettari: 1.8, gruppo: "riproduttori Marchigiane e Maremmane" },
  { nome: "G — Pascolo Riproduttori (campo 8)", ettari: 1.3, gruppo: "riproduttori Marchigiane e Maremmane" },
  { nome: "H — Pascolo Ingrasso (campo 9)", ettari: 2.0, gruppo: "femmine da ingrasso, paddock C e D a turni" },
  { nome: "I — Bettacchi (campo 11)", ettari: 2.0, gruppo: "Marchigiane con il toro (in allestimento)" },
];

const somma = l => l.reduce((s, x) => s + (x || 0), 0);
export function esistenteBovini() {
  const g = gr => INVENTARIO_BOVINI.filter(x => x.gruppo === gr);
  const aperto = l => somma(l.filter(x => x.totale).map(x => x.totale - x.coperta));
  return {
    riproduttori: { coperta: somma(g("riproduttori").map(x => x.coperta)), aperta: aperto(g("riproduttori")), rastrelliere: somma(g("riproduttori").map(x => x.rastrelliere)), abbeveratoi: somma(g("riproduttori").map(x => x.abbeveratoi)) },
    ingrasso: { coperta: somma(g("ingrasso").map(x => x.coperta)), aperta: aperto(g("ingrasso")), rastrelliere: somma(g("ingrasso").map(x => x.rastrelliere)), abbeveratoi: somma(g("ingrasso").map(x => x.abbeveratoi)), abbeveratoiMancanti: g("ingrasso").filter(x => x.abbeveratoi === null).length },
    servizio: { coperta: somma(g("servizio").map(x => x.coperta)) },
    pascoli: somma(PASCOLI_BOVINI.map(x => x.ettari)),
  };
}

// Fieno: prodotto in azienda (balloni della campagna che si raccoglie nel periodo) e comprato nel periodo (rotoballe)
const FIENI = /^fieno/i;
export function fienoDelPeriodo(A, P, raccolte, colture) {
  const annoFine = parseInt(P.a.slice(0, 4)), meseFine = parseInt(P.a.slice(5, 7));
  // la fienagione è a giugno: conta la campagna che si chiude nell'anno in cui il periodo comprende giugno
  const annoRaccolta = meseFine >= 6 ? annoFine : annoFine - 1;
  const campagna = `${annoRaccolta - 1}/${annoRaccolta}`;
  const idColture = new Set((colture || []).filter(c => c.campagna === campagna).map(c => c.id));
  const prodotti = (raccolte || []).filter(r => idColture.has(r.coltura_campo_id) && FIENI.test(r.prodotto || "") && /ballon|rotoball/i.test(r.unita || ""));
  const balloniProdotti = somma(prodotti.map(r => parseFloat(r.quantita) || 0));
  const fatture = new Map((A.g.fatture || []).filter(f => f.tipo === "PASSIVA" || f.tipo === "DA_RICEVERE").map(f => [f.id, f]));
  const comprate = (A.g.articoli || []).filter(a => {
    const f = fatture.get(a.fattura_id); if (!f) return false;
    const d = String(f.data || "").slice(0, 10);
    return d >= P.da && d <= P.a && a.centro_costo === "Foraggio" && /fieno/i.test(a.descrizione || "") && parseFloat(a.prezzo_unitario) > 0 && parseFloat(a.prezzo_unitario) < 80;
  });
  const balloniComprati = somma(comprate.map(a => parseFloat(a.quantita) || 0));
  return { campagna, balloniProdotti, balloniComprati, perProdotto: prodotti.reduce((m, r) => ({ ...m, [r.prodotto]: (m[r.prodotto] || 0) + (parseFloat(r.quantita) || 0) }), {}) };
}
