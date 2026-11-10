// Versione 355 (10/11/2026, procedura unica di carico, capitolo F24 – punto 5.6 di claude/procedura_unica_carico.md):
// il pagamento di un F24 si prova con la riga della banca (prova esterna, come il Report di Aruba per le fatture).
// Regole provate sui dati veri il 10/11/2026 (30 F24, 1.740 righe della banca):
//  - la riga è un'uscita con «F24» come parola a sé nella descrizione (un bonifico qualsiasi dello stesso importo non vale)
//    e con lo stesso importo del saldo, al centesimo;
//  - F24 già «Pagato»: la riga deve avere la data del pagamento scritta nel programma (± 5 giorni). Sui 13 F24 «Pagato»
//    con saldo la data è sempre la stessa, anche per i due pagati 93 giorni dopo la scadenza (id 4 e 5);
//  - F24 «Da pagare» o «Disposto»: proposta automatica solo con una riga da 15 giorni prima a 5 giorni dopo la scadenza
//    (sui dati veri: 0, −1, −10 e 0 giorni). Una riga più tardi (fino a 120 giorni) non si propone da sola: può essere
//    il pagamento in ritardo oppure un altro F24 dello stesso importo; la persona sceglie (revisione indipendente, G1);
//  - una riga della banca prova un solo F24; una riga che va bene per due F24 non si propone, si sceglie;
//  - «in banca non c'è il pagamento» si dice solo se tutti i conti CON RIGHE CARICATE vanno oltre la scadenza (revisione, G4);
//    un conto senza nessuna riga (per esempio CARIGE chiuso, la cassa) non entra nel calcolo: limite scritto nelle istruzioni.
// Qui solo calcolo, nessuna scrittura.

export const GIORNI_PRIMA = 15;      // proposta automatica: da 15 giorni prima…
export const GIORNI_DOPO = 5;        // …a 5 giorni dopo la scadenza
export const GIORNI_RITARDO = 120;   // righe più tarde, fino a 120 giorni: solo scelta a mano
export const GIORNI_PAGAMENTO = 5;   // F24 «Pagato»: ± 5 giorni dalla data del pagamento scritta nel programma
const piu = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const it = d => { const [a, m, g] = String(d || "").slice(0, 10).split("-"); return g ? `${g}/${m}/${a}` : "—"; };
const cent = v => Math.round(Math.abs(Number(v) || 0) * 100);
export const eRigaF24 = descrizione => /(^|[^A-Za-z0-9])F24([^A-Za-z0-9]|$)/i.test(descrizione || "");
const fra = (d, da, a) => d >= da && d <= a;

// f24: [{ id, codice_delega, oggetto, data_scadenza, saldo, stato, data_pagamento, riga_fonte_id, nome_file_quietanza }]
// righe: uscite della banca utilizzabili [{ id, conto_id, data_contabile, importo, descrizione }]
//        (la pagina toglie le righe degli estratti annullati; le righe legate anche alla prima nota restano valide, decisione D13 aperta)
// coperturaFino: l'ultimo giorno caricato del conto MENO aggiornato (sotto quella data tutti i conti sono caricati)
// righeDaGuardare: { id riga: motivo } per le righe già collegate a un F24 ma non più valide (estratto annullato)
export function abbinaPagamenti({ f24, righe, coperturaFino, oggi, righeDaGuardare = {} }) {
  const usate = new Set(f24.filter(f => f.riga_fonte_id != null).map(f => String(f.riga_fonte_id)));
  const libere = righe.filter(r => !usate.has(String(r.id)) && eRigaF24(r.descrizione));
  const stessoImporto = f => libere.filter(r => cent(r.importo) === cent(f.saldo));
  const elenco = f24.filter(f => f.stato !== "Sostituito").map(f => {
    let vicine = [], tarde = [];
    if (f.riga_fonte_id == null && cent(f.saldo) !== 0) {
      const c = stessoImporto(f);
      if (f.stato === "Pagato" && f.data_pagamento) vicine = c.filter(r => fra(r.data_contabile, piu(f.data_pagamento, -GIORNI_PAGAMENTO), piu(f.data_pagamento, GIORNI_PAGAMENTO)));
      else if (f.data_scadenza) {
        vicine = c.filter(r => fra(r.data_contabile, piu(f.data_scadenza, -GIORNI_PRIMA), piu(f.data_scadenza, GIORNI_DOPO)));
        tarde = c.filter(r => r.data_contabile > piu(f.data_scadenza, GIORNI_DOPO) && r.data_contabile <= piu(f.data_scadenza, GIORNI_RITARDO));
      }
    }
    return { ...f, vicine, tarde };
  });
  // una riga che va bene (vicina) per due F24 non si propone a nessuno dei due
  const conteggio = new Map();
  elenco.forEach(f => f.vicine.forEach(r => conteggio.set(String(r.id), (conteggio.get(String(r.id)) || 0) + 1)));
  return elenco.map(f => {
    const saldoZero = cent(f.saldo) === 0;
    const condivisa = f.vicine.some(r => conteggio.get(String(r.id)) > 1);
    const unica = f.vicine.length === 1 && !condivisa ? f.vicine[0] : null;
    // le righe tarde che sono la riga vicina di un altro F24 non si offrono
    const tarde = f.tarde.filter(r => !conteggio.has(String(r.id)));
    const scaduto = f.data_scadenza && f.data_scadenza < oggi;
    // la banca può registrare il giorno dopo: «coperto» solo se il conto meno aggiornato va oltre la scadenza
    const coperto = coperturaFino && f.data_scadenza && coperturaFino > f.data_scadenza;
    const copertoPagamento = coperturaFino && f.data_pagamento && coperturaFino > f.data_pagamento;
    let esito, colore, motivo, proposta = null, candidati = [];
    if (f.stato === "Pagato") {
      if (f.riga_fonte_id != null) {
        const da = righeDaGuardare[String(f.riga_fonte_id)];
        if (da) { esito = "riga-da-guardare"; colore = "arancione"; motivo = `pagato, ma la riga della banca n. ${f.riga_fonte_id} che lo provava ${da}: da guardare`; }
        else { esito = "provato"; colore = "grigio"; motivo = "pagato: provato dalla riga della banca"; }
      }
      else if (saldoZero) { esito = "saldo-zero"; colore = f.nome_file_quietanza ? "grigio" : "arancione"; motivo = f.nome_file_quietanza ? "a saldo zero: c'è la ricevuta" : "a saldo zero: la banca non lo prova; serve la ricevuta di presentazione (scheda F24, lettura della quietanza)"; }
      else if (!f.data_pagamento) { esito = "scegliere"; colore = "arancione"; candidati = stessoImporto(f); motivo = "segnato «Pagato» senza la data del pagamento: scegliere la riga della banca a mano, guardando la quietanza"; }
      else if (unica) { esito = "da-collegare"; colore = "verde"; proposta = unica; motivo = `pagato il ${it(f.data_pagamento)}: la riga della banca c'è${unica.data_contabile !== f.data_pagamento ? ` (data ${it(unica.data_contabile)})` : ""}; si collega`; }
      else if (f.vicine.length) { esito = "scegliere"; colore = "arancione"; candidati = f.vicine; motivo = "pagato: più righe della banca possibili, o la stessa riga va bene per due F24; scegliere quella giusta guardando la quietanza"; }
      else { esito = copertoPagamento ? "pagato-senza-banca" : "pagato-banca-non-caricata"; colore = copertoPagamento ? "arancione" : "grigio"; motivo = copertoPagamento ? `segnato «Pagato» il ${it(f.data_pagamento)} ma nella banca quel giorno non c'è la riga: da guardare (altra banca, importo o data diversi)` : "pagato: l'estratto della banca di quel periodo non è ancora caricato"; }
    } else {
      if (!f.data_scadenza) { esito = "senza-scadenza"; colore = "arancione"; motivo = "senza data di scadenza nel programma: da guardare"; candidati = cent(f.saldo) ? stessoImporto(f) : []; }
      else if (saldoZero) { esito = "saldo-zero-da-pagare"; colore = "arancione"; motivo = "a saldo zero: nessun pagamento in banca; si chiude con la ricevuta di presentazione (scheda F24, lettura della quietanza)"; }
      else if (unica) { esito = "proposta"; colore = "verde"; proposta = unica; motivo = `in banca c'è il pagamento del ${it(unica.data_contabile)}: confermare «Pagato»`; }
      else if (f.vicine.length) { esito = "scegliere"; colore = "arancione"; candidati = f.vicine; motivo = "più righe della banca possibili, o la stessa riga va bene per due F24: scegliere quella giusta guardando la quietanza"; }
      else if (tarde.length) { esito = "ritardo"; colore = "arancione"; candidati = tarde; motivo = `in banca c'è un'uscita F24 dello stesso importo più di ${GIORNI_DOPO} giorni dopo la scadenza: può essere questo F24 pagato in ritardo oppure un altro F24 dello stesso importo. Controllare la quietanza prima di scegliere`; }
      else if (scaduto && coperto) { esito = "scaduto-non-pagato"; colore = "rosso"; motivo = `scaduto il ${it(f.data_scadenza)}: in banca non c'è il pagamento (tutti i conti con righe caricate arrivano almeno al ${it(coperturaFino)})`; }
      else if (scaduto) { esito = "attesa-estratto"; colore = "arancione"; motivo = `scaduto il ${it(f.data_scadenza)}: non tutti i conti sono caricati oltre il ${it(coperturaFino)}`; }
      else { esito = "da-scadere"; colore = "grigio"; motivo = `scade il ${it(f.data_scadenza)}`; }
    }
    const { vicine, tarde: _t, ...resto } = f;
    return { ...resto, esito, colore, motivo, proposta, candidati, anno: f.data_scadenza ? Number(f.data_scadenza.slice(0, 4)) : null };
  });
}

// La chiusura degli F24, per anno della scadenza
export function chiusuraF24(stati) {
  const perAnno = {};
  for (const f of stati) {
    const a = f.anno || "senza scadenza";
    const x = perAnno[a] = perAnno[a] || { anno: a, totale: 0, provati: 0, saldoZero: 0, daCollegare: 0, proposte: 0, daGuardare: 0, scadutiNonPagati: 0, inAttesa: 0, daScadere: 0 };
    x.totale++;
    if (f.esito === "provato") x.provati++;
    else if (f.esito === "saldo-zero" || f.esito === "saldo-zero-da-pagare") x.saldoZero++;
    else if (f.esito === "da-collegare") x.daCollegare++;
    else if (f.esito === "proposta") x.proposte++;
    else if (f.esito === "scaduto-non-pagato") x.scadutiNonPagati++;
    else if (f.esito === "attesa-estratto" || f.esito === "pagato-banca-non-caricata") x.inAttesa++;
    else if (f.esito === "da-scadere") x.daScadere++;
    else x.daGuardare++;
  }
  return Object.values(perAnno).sort((a, b) => String(a.anno).localeCompare(String(b.anno)));
}
