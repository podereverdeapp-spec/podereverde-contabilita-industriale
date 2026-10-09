// Versione 239 — Riferimenti esterni usati dai Report di Analisi (confronti con il mercato e con le razze).
// Ogni valore porta la sua fonte e la data. Si aggiornano qui, a mano, quando arrivano listini nuovi:
// i report li mostrano sempre insieme alla fonte, così si sa quanto sono vecchi.

export const RIFERIMENTI = {
  // Listino della Camera di Commercio di Modena, rilevazione del 1° dicembre 2025 (peso vivo, € al kg)
  vitelloRistallo: {
    fonte: "Listino della Camera di Commercio di Modena del 1° dicembre 2025",
    incrociNazionali: { pesoMin: 250, pesoMax: 320, prezzoMin: 4.53, prezzoMax: 4.74 },
    limousineNazionali: { pesoMin: 250, pesoMax: 300, prezzoMin: 5.91, prezzoMax: 6.48 },
  },
  femmineDaMacello: {
    fonte: "Listino della Camera di Commercio di Modena del 1° dicembre 2025",
    descrizione: "vitelloni femmine da macello, incroci nazionali di 1ª qualità",
    prezzoVivoMin: 4.96, prezzoVivoMax: 5.06,
  },
  vitelloneIGP: {
    fonte: "Disciplinare IGP Vitellone Bianco dell'Appennino Centrale",
    etaMinMesi: 12, etaMaxMesi: 24, resaMin: 62, resaMax: 64,
  },
  interpartoObiettivoGiorni: { valore: 365, fonte: "obiettivo di un vitello per vacca all'anno" },
  sopravissana: { fonte: "scheda della razza Sopravissana dell'associazione RARE", prolificita: 1.3, fertilita: 0.9, primoPartoMesi: 18 },
  // Versione 240: prezzi di mercato di confronto per il report «Attenzione Variazione Prezzi»
  // (la chiave è il «prodotto di mercato» scritto nella famiglia di prodotto; prezzo per unità di base: litro o kg)
  mercatiEsterni: {
    "Gasolio agricolo": {
      fonte: "Camera di Commercio di Modena, prezzi medi dei prodotti petroliferi del 30 agosto 2026 (franco destino, IVA esclusa, accise comprese)",
      data: "2026-08-30", unita: "litro", prezzoMin: 1.2733, prezzoMax: 1.3458,
      dettaglio: "consegne oltre 5.000 litri 1,2733 €; fino a 5.000 litri 1,2833 €; fino a 2.000 litri 1,3058 €; fino a 1.000 litri 1,3458 €",
      consiglio: "Il gasolio comprato è per autotrazione. Se serve ai trattori e alle macchine agricole, con l'assegnazione UMA si può comprare gasolio agricolo agevolato, con accisa ridotta. Da verificare con il consulente agricolo: il gasolio per autotrazione resta necessario per i mezzi che circolano su strada.",
    },
  },
  // Note di contesto per campagna: fatti esterni che aiutano a leggere i risultati dei campi
  contestoCampagne: {
    "2025/2026": [
      { prodotto: "Granella di orzo", testo: "In Italia nel 2026 il raccolto di orzo da birra è calato del 39% per siccità e maltempo (resa dell'orzo distico da 55 a 37 quintali per ettaro).", fonte: "Coldiretti e Consorzio Birra Italiana, 16 settembre 2026", calo: 0.39 },
    ],
  },
};
