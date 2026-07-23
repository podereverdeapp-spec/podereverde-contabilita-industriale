import pg from 'pg';
const client = new pg.Client({ host: '127.0.0.1', database: 'testacq', user: 'postgres', password: 'test1234' });
await client.connect();

const { rows: [f] } = await client.query(`insert into ci_fornitori (nome, gruppo_classificazione) values ('AGRICOLA PAOLUCCI S.R.L.','FRO') returning id`);

const casi = [
  { nome: "Tutto vuoto tranne l'obbligatorio", specie:"", razza:"", dest:"", bdn:"", lotto:"", qta:null, um:"", prezzo:null },
  { nome: "Specie/dest valorizzate, resto vuoto", specie:"Suini", razza:"", dest:"Ingrasso", bdn:"", lotto:"", qta:10, um:"Unità", prezzo:250 },
  { nome: "Destinazione NON tra i valori ammessi (probabile causa)", specie:"Suini", razza:"", dest:"", bdn:"", lotto:"", qta:10, um:"", prezzo:250 },
];

for (const c of casi) {
  console.log(`\n--- Caso: ${c.nome} ---`);
  try {
    await client.query(
      `insert into ci_report_acquisto_animali (fonte, fornitore_id, data_fattura, numero_fattura, importo, quantita, unita_misura, prezzo_unitario, specie, razza, destinazione_acquisto, bdn, nr_lotto)
       values ('ACQUISTO_DIRETTO',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [f.id, "2025-06-05", "FT-TEST", 2500, c.qta, c.um || null, c.prezzo, c.specie || null, c.razza || null, c.dest || null, c.bdn || null, c.lotto || null]
    );
    console.log("✓ Salvato correttamente");
  } catch (err) {
    console.log("✗ ERRORE:", err.message);
  }
}
await client.end();
