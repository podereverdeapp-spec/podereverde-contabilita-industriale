import * as XLSX from 'xlsx';

function scarica(wb, nomeFile) {
  XLSX.writeFile(wb, `${nomeFile}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// Foglio generico da array di oggetti
function foglio(dati, colonne) {
  const righe = dati.map(d => {
    const r = {};
    colonne.forEach(c => { r[c.label] = d[c.key] ?? ''; });
    return r;
  });
  return XLSX.utils.json_to_sheet(righe);
}

// ─── EXPORT ANAGRAFICA ────────────────────────────────────────────────────────
export function exportAnagrafica(animali) {
  const wb = XLSX.utils.book_new();
  const ws = foglio(animali, [
    { key:'bdn',       label:'BDN / Matricola' },
    { key:'nome',      label:'Nome' },
    { key:'specie',    label:'Specie' },
    { key:'razza',     label:'Razza' },
    { key:'sesso',     label:'Sesso' },
    { key:'nascita',   label:'Data nascita' },
    { key:'origine',   label:'Origine' },
    { key:'stato',     label:'Stato' },
    { key:'note',      label:'Note' },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Anagrafica');
  scarica(wb, 'anagrafica');
}

// ─── EXPORT SANITARIO ─────────────────────────────────────────────────────────
export function exportSanitario(eventi, animali) {
  const wb = XLSX.utils.book_new();
  const dati = eventi.map(e => ({
    ...e,
    animale: animali.find(a => a.id === e.animale_id)?.nome || e.animale_id,
    bdn:     animali.find(a => a.id === e.animale_id)?.bdn || '',
  }));
  const ws = foglio(dati, [
    { key:'data',       label:'Data' },
    { key:'animale',    label:'Animale' },
    { key:'bdn',        label:'BDN' },
    { key:'tipo',       label:'Tipo' },
    { key:'descrizione',label:'Descrizione' },
    { key:'prodotto',   label:'Prodotto' },
    { key:'veterinario',label:'Veterinario' },
    { key:'scadenza',   label:'Scadenza' },
    { key:'costo',      label:'Costo €' },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Registro sanitario');
  scarica(wb, 'registro_sanitario');
}

// ─── EXPORT COSTI ─────────────────────────────────────────────────────────────
export function exportCosti(costi, animali) {
  const wb = XLSX.utils.book_new();
  const dati = costi.map(c => ({
    ...c,
    animale: animali.find(a => a.id === c.animale_id)?.nome || c.animale_id,
    bdn:     animali.find(a => a.id === c.animale_id)?.bdn || '',
  }));
  const ws = foglio(dati, [
    { key:'data',        label:'Data' },
    { key:'animale',     label:'Animale' },
    { key:'bdn',         label:'BDN' },
    { key:'voce',        label:'Voce costo' },
    { key:'descrizione', label:'Descrizione' },
    { key:'importo',     label:'Importo €' },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Costi animali');
  scarica(wb, 'costi_animali');
}

// ─── EXPORT LOTTI SUINI ───────────────────────────────────────────────────────
export function exportLottiSuini(lotti, suini) {
  const wb = XLSX.utils.book_new();

  // Foglio 1: riepilogo lotti
  const wsLotti = foglio(lotti, [
    { key:'codice',      label:'Codice lotto' },
    { key:'data_parto',  label:'Data parto' },
    { key:'nati_totali', label:'Nati totali' },
    { key:'nati_vivi',   label:'Nati vivi' },
    { key:'nati_morti',  label:'Nati morti' },
    { key:'note',        label:'Note' },
  ]);
  XLSX.utils.book_append_sheet(wb, wsLotti, 'Lotti');

  // Foglio 2: dettaglio singoli suini
  const datiSuini = suini.map(s => ({
    ...s,
    lotto: lotti.find(l => l.id === s.lotto_id)?.codice || '',
    identificativo: `${lotti.find(l=>l.id===s.lotto_id)?.codice||''} / nr.${s.nr}`,
  }));
  const wsSuini = foglio(datiSuini, [
    { key:'identificativo',    label:'Identificativo' },
    { key:'bdn',               label:'BDN' },
    { key:'sesso',             label:'Sesso' },
    { key:'stato',             label:'Stato' },
    { key:'peso_nascita',      label:'Peso nascita kg' },
    { key:'peso_svezzamento',  label:'Peso svezzamento kg' },
    { key:'data_svezzamento',  label:'Data svezzamento' },
    { key:'peso_attuale',      label:'Peso attuale kg' },
    { key:'note',              label:'Note' },
  ]);
  XLSX.utils.book_append_sheet(wb, wsSuini, 'Suini dettaglio');
  scarica(wb, 'lotti_suini');
}

// ─── EXPORT USCITE ────────────────────────────────────────────────────────────
export function exportUscite(uscite, animali) {
  const wb = XLSX.utils.book_new();
  const dati = uscite.map(u => ({
    ...u,
    animale: animali.find(a => a.id === u.animale_id)?.nome || u.animale_id,
    bdn:     animali.find(a => a.id === u.animale_id)?.bdn || '',
    ricavo:  u.peso_carcassa && u.prezzo_kg ? (u.peso_carcassa * u.prezzo_kg).toFixed(2) : '',
  }));
  const ws = foglio(dati, [
    { key:'data',          label:'Data' },
    { key:'animale',       label:'Animale' },
    { key:'bdn',           label:'BDN' },
    { key:'motivazione',   label:'Motivazione' },
    { key:'peso_vivo',     label:'Peso vivo kg' },
    { key:'peso_carcassa', label:'Peso carcassa kg' },
    { key:'resa_percent',  label:'Resa %' },
    { key:'prezzo_kg',     label:'€/kg' },
    { key:'ricavo',        label:'Ricavo totale €' },
    { key:'acquirente',    label:'Acquirente' },
    { key:'note',          label:'Note' },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Uscite');
  scarica(wb, 'registro_uscite');
}

// ─── EXPORT COMPLETO (tutti i fogli) ─────────────────────────────────────────
export function exportCompleto(animali, eventi_sanitari, costi, lotti, suini, uscite, macchinari, costi_generali) {
  const wb = XLSX.utils.book_new();

  // Anagrafica
  XLSX.utils.book_append_sheet(wb, foglio(animali, [
    {key:'bdn',label:'BDN'},{key:'nome',label:'Nome'},{key:'specie',label:'Specie'},
    {key:'razza',label:'Razza'},{key:'sesso',label:'Sesso'},{key:'nascita',label:'Nascita'},
    {key:'stato',label:'Stato'},
  ]), 'Anagrafica');

  // Sanitario
  const evSan = eventi_sanitari.map(e => ({...e, animale: animali.find(a=>a.id===e.animale_id)?.nome||''}));
  XLSX.utils.book_append_sheet(wb, foglio(evSan, [
    {key:'data',label:'Data'},{key:'animale',label:'Animale'},{key:'tipo',label:'Tipo'},
    {key:'descrizione',label:'Descrizione'},{key:'costo',label:'€'},
  ]), 'Sanitario');

  // Costi animali
  const costiD = costi.map(c => ({...c, animale: animali.find(a=>a.id===c.animale_id)?.nome||''}));
  XLSX.utils.book_append_sheet(wb, foglio(costiD, [
    {key:'data',label:'Data'},{key:'animale',label:'Animale'},{key:'voce',label:'Voce'},
    {key:'descrizione',label:'Descrizione'},{key:'importo',label:'€'},
  ]), 'Costi animali');

  // Lotti suini
  XLSX.utils.book_append_sheet(wb, foglio(lotti, [
    {key:'codice',label:'Codice'},{key:'data_parto',label:'Parto'},
    {key:'nati_vivi',label:'Vivi'},{key:'nati_morti',label:'Morti'},
  ]), 'Lotti suini');

  // Uscite
  const usciteD = uscite.map(u => ({...u,
    animale: animali.find(a=>a.id===u.animale_id)?.nome||'',
    ricavo: u.peso_carcassa&&u.prezzo_kg?(u.peso_carcassa*u.prezzo_kg).toFixed(2):'',
  }));
  XLSX.utils.book_append_sheet(wb, foglio(usciteD, [
    {key:'data',label:'Data'},{key:'animale',label:'Animale'},{key:'motivazione',label:'Motivazione'},
    {key:'peso_carcassa',label:'Kg carcassa'},{key:'resa_percent',label:'Resa %'},{key:'ricavo',label:'Ricavo €'},
  ]), 'Uscite');

  // Macchinari
  XLSX.utils.book_append_sheet(wb, foglio(macchinari, [
    {key:'nome',label:'Macchinario'},{key:'categoria',label:'Categoria'},
    {key:'costo_storico',label:'Costo storico €'},{key:'anno_acquisto',label:'Anno acquisto'},
    {key:'anni_ammortamento',label:'Anni amm.'},{key:'note',label:'Note'},
  ]), 'Macchinari');

  // Costi generali
  XLSX.utils.book_append_sheet(wb, foglio(costi_generali, [
    {key:'voce',label:'Voce'},{key:'descrizione',label:'Descrizione'},
    {key:'importo',label:'Importo €'},{key:'data_inizio',label:'Dal'},{key:'data_fine',label:'Al'},
  ]), 'Costi generali');

  scarica(wb, 'allevamento_completo');
}
