import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";
import { C } from "./style";
import { classificaRiga } from "./motoreClassificazione";

const AREE_SENZA_CENTRO_ORDINARIO = ["Ammortamenti", "ACQUISTO ANIMALI", "TRASPORTO ANIMALI"];

export default function CaricaFatture() {
  const [fornitori, setFornitori] = useState([]);
  const [regoleFisse, setRegoleFisse] = useState([]);
  const [regoleVariabili, setRegoleVariabili] = useState([]);
  const [pianoConti, setPianoConti] = useState([]);
  const [righe, setRighe] = useState([]); // righe caricate + classificate
  const [loadingDati, setLoadingDati] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modalita, setModalita] = useState("excel"); // "excel" | "pdf"
  const [leggendoPdf, setLeggendoPdf] = useState(false);
  const [progressoPdf, setProgressoPdf] = useState({ fatti: 0, totale: 0, erroriFile: [] });
  const fileInputRef = useRef(null);
  const cartellaInputRef = useRef(null);

  useEffect(() => { caricaDatiRiferimento(); }, []);

  async function caricaDatiRiferimento() {
    setLoadingDati(true);
    const [{ data: f, error: eF }, { data: rf, error: eRF }, { data: rv, error: eRV }, { data: pc, error: ePC }] =
      await Promise.all([
        supabase.from("ci_fornitori").select("*"),
        supabase.from("ci_regole_fornitore_fissa").select("*"),
        supabase.from("ci_regole_fornitore_variabile").select("*"),
        supabase.from("ci_piano_dei_conti").select("*").order("area").order("centro_costo"),
      ]);
    const errore = eF || eRF || eRV || ePC;
    if (errore) {
      alert(`⚠️ Errore nel caricamento dei dati di riferimento:\n\n${errore.message}`);
    } else {
      setFornitori(f || []);
      setRegoleFisse(rf || []);
      setRegoleVariabili(rv || []);
      setPianoConti(pc || []);
    }
    setLoadingDati(false);
  }

  function areeDisponibili() {
    return [...new Set(pianoConti.map(p => p.area))];
  }
  function centriPerArea(area) {
    return pianoConti.filter(p => p.area === area).map(p => p.centro_costo);
  }

  function gestisciFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: "binary", cellDates: true });
      const foglio = wb.Sheets[wb.SheetNames[0]];
      const dati = XLSX.utils.sheet_to_json(foglio, { defval: "" });
      await elaboraRigheGrezze(dati);
    };
    reader.readAsBinaryString(file);
  }

  async function leggiPdfComeBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // readAsDataURL restituisce "data:application/pdf;base64,XXXX" — teniamo solo la parte dopo la virgola
        const base64 = reader.result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error(`Impossibile leggere il file ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function gestisciCartellaPdf(e) {
    const tuttiFile = Array.from(e.target.files || []);
    const pdfFile = tuttiFile.filter(f => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfFile.length === 0) {
      alert("Nessun file PDF trovato in questa cartella.");
      return;
    }
    if (!window.confirm(
      `Trovati ${pdfFile.length} file PDF. Verranno letti uno per uno tramite Claude ` +
      `(ogni lettura ha un piccolo costo — vedi nota sotto al pulsante). Procedere?`
    )) return;

    setLeggendoPdf(true);
    setProgressoPdf({ fatti: 0, totale: pdfFile.length, erroriFile: [] });
    const datiCombinati = [];
    const erroriFile = [];

    for (const file of pdfFile) {
      try {
        const base64 = await leggiPdfComeBase64(file);
        const risposta = await fetch("/api/leggi-fattura-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdfBase64: base64, filename: file.name }),
        });
        const risultato = await risposta.json();
        if (!risposta.ok || risultato.error) {
          erroriFile.push(`${file.name}: ${risultato.error || "errore sconosciuto"}`);
        } else {
          const est = risultato.estratto;
          (est.righe || []).forEach(riga => {
            datiCombinati.push({
              "Fornitore": est.fornitore || "",
              "P.IVA": est.piva || "",
              "Numero": est.numero || "",
              "Data": est.data || "",
              "Descrizione": riga.descrizione || "",
              "Quantità": riga.quantita ?? 1,
              "U.M.": riga.unita_misura || "PEZZI",
              "Prezzo unitario": riga.prezzo_unitario ?? 0,
              "Imponibile": riga.imponibile ?? 0,
            });
          });
        }
      } catch (err) {
        erroriFile.push(`${file.name}: ${err.message}`);
      }
      setProgressoPdf(p => ({ ...p, fatti: p.fatti + 1 }));
    }

    setLeggendoPdf(false);
    setProgressoPdf(p => ({ ...p, erroriFile }));

    if (erroriFile.length > 0) {
      alert(`⚠️ ${erroriFile.length} file su ${pdfFile.length} non sono stati letti correttamente:\n\n${erroriFile.join("\n")}\n\nGli altri file letti correttamente sono comunque pronti sotto per la revisione.`);
    }
    if (datiCombinati.length > 0) {
      await elaboraRigheGrezze(datiCombinati);
    }
  }

  async function elaboraRigheGrezze(dati) {
    const risultati = dati.map((r, i) => {
      const grezza = {
        id: `riga-${i}`,
        fornitore: String(r["Fornitore"] || r["fornitore"] || "").trim(),
        piva: String(r["P.IVA"] || r["Partita IVA"] || r["piva"] || "").trim(),
        numero: String(r["Numero"] || r["Numero Fattura"] || "").trim(),
        data: formattaData(r["Data"] || r["Data Fattura"]),
        descrizione: String(r["Descrizione"] || "").trim(),
        quantita: parseFloat(r["Quantità"] || r["Quantita"] || 1),
        unita_misura: String(r["U.M."] || r["Unità Misura"] || "PEZZI").trim().toUpperCase(),
        prezzo_unitario: parseFloat(r["Prezzo unitario"] || r["Prezzo Unitario"] || 0),
        imponibile: parseFloat(r["Imponibile"] || 0),
      };
      const { fornitore: fornitoreObj, ...classificazioneResto } = classificaRiga(grezza, { fornitori, regoleFisse, regoleVariabili });
      return {
        ...grezza,
        ...classificazioneResto,
        fornitore_obj: fornitoreObj, // evita di sovrascrivere grezza.fornitore (il nome testuale)
        // campi editabili per la maschera operatore
        editArea: classificazioneResto.area || "",
        editCentro: classificazioneResto.centro_costo || "",
        editDestinazione: classificazioneResto.destinazione || "",
        editTipo: classificazioneResto.tipo_costo || "",
        // campi speciali Acquisto Animali
        specieAcquisto: "", razzaAcquisto: "", destAcquisto: "", bdnAcquisto: "", lottoAcquisto: "",
        // campi speciali Trasporto Animali (doppia casella)
        importoMacello: "", importoIngresso: "",
        giaCaricata: false, // aggiornato dal controllo duplicati sotto
      };
    });

    // Controllo duplicati: per ogni fornitore riconosciuto tra le righe caricate,
    // recupero le fatture già esistenti (numero+data) e marco le righe corrispondenti.
    const fornitoreIds = [...new Set(risultati.map(r => r.fornitore_obj?.id).filter(Boolean))];
    if (fornitoreIds.length > 0) {
      const { data: fattureEsistenti, error } = await supabase
        .from("ci_fatture")
        .select("fornitore_id, numero, data")
        .in("fornitore_id", fornitoreIds);
      if (error) {
        alert(`⚠️ Non sono riuscito a controllare i duplicati (procedo comunque, ma verifica a mano):\n\n${error.message}`);
      } else {
        const chiaviEsistenti = new Set(
          (fattureEsistenti || []).map(f => `${f.fornitore_id}|${f.numero}|${f.data}`)
        );
        risultati.forEach(r => {
          if (r.fornitore_obj) {
            const chiave = `${r.fornitore_obj.id}|${r.numero}|${r.data}`;
            r.giaCaricata = chiaviEsistenti.has(chiave);
          }
        });
      }
    }

    setRighe(risultati);
  }

  function formattaData(v) {
    if (!v) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    if (s.includes("/")) {
      const [gg, mm, aa] = s.split("/");
      return `${aa}-${mm.padStart(2, "0")}-${gg.padStart(2, "0")}`;
    }
    return s;
  }

  function aggiornaRiga(id, campi) {
    setRighe(prev => prev.map(r => (r.id === id ? { ...r, ...campi } : r)));
  }

  const stats = {
    totale: righe.length,
    fcv: righe.filter(r => r.stato === "FCV" && !r.giaCaricata).length,
    fcf: righe.filter(r => r.stato === "FCF" && !r.giaCaricata).length,
    maschera: righe.filter(r => r.stato === "MASCHERA" && !r.giaCaricata).length,
    giaCaricate: righe.filter(r => r.giaCaricata).length,
  };

  async function salvaTutto() {
    const righeDaSalvare = righe.filter(r => !r.giaCaricata);
    if (righeDaSalvare.length === 0) {
      alert("Tutte le righe di questo file risultano già caricate in precedenza — nulla da salvare.");
      return;
    }

    // Validazione: righe Trasporto Animali devono avere le due caselle che sommano all'imponibile
    for (const r of righeDaSalvare) {
      if (r.editArea === "TRASPORTO ANIMALI") {
        const somma = (parseFloat(r.importoMacello) || 0) + (parseFloat(r.importoIngresso) || 0);
        if (Math.abs(somma - r.imponibile) > 0.01) {
          alert(`⚠️ Riga "${r.descrizione}" (${r.fornitore}): la somma di "Trasporto macello" + "Ingresso allevamento" (${somma.toFixed(2)}€) non torna con l'imponibile della riga (${r.imponibile.toFixed(2)}€). Correggi prima di salvare.`);
          return;
        }
      }
      if (!r.editArea) {
        alert(`⚠️ Riga "${r.descrizione}" (${r.fornitore}): manca l'Area. Completa la classificazione di tutte le righe prima di salvare.`);
        return;
      }
    }

    setSalvando(true);
    try {
      // Raggruppo le righe per fattura (fornitore+numero+data)
      const gruppiFattura = {};
      righeDaSalvare.forEach(r => {
        const chiave = `${r.fornitore}|${r.numero}|${r.data}`;
        if (!gruppiFattura[chiave]) gruppiFattura[chiave] = [];
        gruppiFattura[chiave].push(r);
      });

      for (const [chiave, righeFattura] of Object.entries(gruppiFattura)) {
        const prima = righeFattura[0];
        let fornitoreId = prima.fornitore_obj?.id;
        if (!fornitoreId && prima.fornitore) {
          // Fornitore non in anagrafica: lo creo al volo
          const { data: nuovo, error: eNuovo } = await supabase
            .from("ci_fornitori")
            .insert([{ nome: prima.fornitore, partita_iva: prima.piva || null, gruppo_classificazione: "FRO" }])
            .select().single();
          if (eNuovo) throw new Error(`Errore creando fornitore "${prima.fornitore}": ${eNuovo.message}`);
          fornitoreId = nuovo.id;
        }

        const totaleImponibile = righeFattura.reduce((s, r) => s + (r.imponibile || 0), 0);
        const { data: fattura, error: eFatt } = await supabase
          .from("ci_fatture")
          .insert([{
            numero: prima.numero, data: prima.data, tipo: "PASSIVA",
            fornitore_id: fornitoreId, totale_netto: totaleImponibile,
            totale_iva: 0, totale_lordo: totaleImponibile,
          }])
          .select().single();
        if (eFatt) throw new Error(`Errore creando fattura ${prima.numero}: ${eFatt.message}`);

        for (const r of righeFattura) {
          if (r.editArea === "ACQUISTO ANIMALI") {
            const { error } = await supabase.from("ci_report_acquisto_animali").insert([{
              fonte: "ACQUISTO_DIRETTO", fornitore_id: fornitoreId, data_fattura: r.data,
              numero_fattura: r.numero, importo: r.imponibile,
              specie: r.specieAcquisto || null, razza: r.razzaAcquisto || null,
              destinazione_acquisto: r.destAcquisto || null,
              bdn: r.bdnAcquisto || null, nr_lotto: r.lottoAcquisto || null,
            }]);
            if (error) throw new Error(`Errore salvando riga Acquisto Animali: ${error.message}`);
          } else if (r.editArea === "TRASPORTO ANIMALI") {
            const { data: art, error: eArt } = await supabase.from("ci_articoli_fattura").insert([{
              fattura_id: fattura.id, descrizione: r.descrizione,
              quantita: r.quantita, unita_misura: r.unita_misura, prezzo_unitario: r.prezzo_unitario,
              totale_riga: parseFloat(r.importoMacello) || 0,
              area: "TRASPORTO ANIMALI", centro_costo: "Lavorazione prodotti allevamento per Rivendita",
              destinazione: r.editDestinazione || null, tipo_costo: r.editTipo || null,
              stato_classificazione: "MANUALE",
            }]).select().single();
            if (eArt) throw new Error(`Errore salvando riga Trasporto (parte macello): ${eArt.message}`);
            const { error: eAcq } = await supabase.from("ci_report_acquisto_animali").insert([{
              articolo_fattura_id: art.id, fonte: "TRASPORTO_INGRESSO", fornitore_id: fornitoreId,
              data_fattura: r.data, numero_fattura: r.numero, importo: parseFloat(r.importoIngresso) || 0,
              specie: r.specieAcquisto || null, destinazione_acquisto: r.destAcquisto || null,
              bdn: r.bdnAcquisto || null, nr_lotto: r.lottoAcquisto || null,
            }]);
            if (eAcq) throw new Error(`Errore salvando riga Trasporto (parte ingresso): ${eAcq.message}`);
          } else {
            const { error } = await supabase.from("ci_articoli_fattura").insert([{
              fattura_id: fattura.id, descrizione: r.descrizione,
              quantita: r.quantita, unita_misura: r.unita_misura, prezzo_unitario: r.prezzo_unitario,
              totale_riga: r.imponibile,
              area: r.editArea, centro_costo: r.editCentro || null,
              destinazione: r.editDestinazione || null, tipo_costo: r.editTipo,
              stato_classificazione: r.stato,
            }]);
            if (error) throw new Error(`Errore salvando riga "${r.descrizione}": ${error.message}`);
          }
        }
      }

      const saltate = righe.length - righeDaSalvare.length;
      alert(`✓ Salvate ${righeDaSalvare.length} righe in ${Object.keys(gruppiFattura).length} fatture.` +
        (saltate > 0 ? `\n(${saltate} righe già presenti sono state saltate automaticamente.)` : ""));
      setRighe([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      alert(`⚠️ Errore durante il salvataggio:\n\n${err.message}\n\nNessuna modifica ulteriore è stata effettuata da questo punto in poi — controlla cosa è stato già salvato prima di riprovare.`);
    }
    setSalvando(false);
  }

  if (loadingDati) return <div style={{ padding: 20, color: C.muted }}>Caricamento dati di riferimento...</div>;

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Carica Fatture</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Carica un file Excel con le righe fattura grezze — il motore le classifica automaticamente dove possibile.
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button onClick={() => setModalita("excel")} style={toggleBtn(modalita === "excel")}>📊 File Excel</button>
          <button onClick={() => setModalita("pdf")} style={toggleBtn(modalita === "pdf")}>📁 Cartella PDF</button>
        </div>

        {modalita === "excel" ? (
          <>
            <label style={{ fontSize: 13, fontWeight: 700, color: C.muted, display: "block", marginBottom: 8 }}>
              File Excel (colonne: Fornitore, P.IVA, Numero, Data, Descrizione, Quantità, U.M., Prezzo unitario, Imponibile)
            </label>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={gestisciFile} />
          </>
        ) : (
          <>
            <label style={{ fontSize: 13, fontWeight: 700, color: C.muted, display: "block", marginBottom: 8 }}>
              Seleziona la cartella con i PDF delle fatture (es. quelli scaricati da Aruba) — vengono letti automaticamente uno per uno tramite Claude
            </label>
            <input
              ref={cartellaInputRef}
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              onChange={gestisciCartellaPdf}
              disabled={leggendoPdf}
            />
            <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
              Nota: ogni PDF letto tramite Claude ha un piccolo costo (a consumo, sul tuo account API Anthropic — separato dall'abbonamento Claude). Per centinaia di fatture storiche, conviene fare un test su una decina prima di caricare una cartella intera.
            </div>
            {leggendoPdf && (
              <div style={{ marginTop: 12, background: C.bg, borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>
                  Lettura in corso: {progressoPdf.fatti} / {progressoPdf.totale}
                </div>
                <div style={{ height: 6, background: C.border, borderRadius: 4, marginTop: 6, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", background: C.primary, borderRadius: 4,
                    width: `${progressoPdf.totale > 0 ? (progressoPdf.fatti / progressoPdf.totale) * 100 : 0}%`,
                    transition: "width 0.3s",
                  }} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {righe.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <StatBox label="Totale righe" value={stats.totale} color={C.primary} />
            <StatBox label="Classificate FCV" value={stats.fcv} color={C.green} />
            <StatBox label="Classificate FCF" value={stats.fcf} color={C.blue} />
            <StatBox label="Da classificare" value={stats.maschera} color={stats.maschera > 0 ? C.red : C.green} />
            {stats.giaCaricate > 0 && (
              <StatBox label="Già caricate (saltate)" value={stats.giaCaricate} color={C.accent} />
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {righe.map(r => (
              <RigaFattura
                key={r.id} riga={r}
                aree={areeDisponibili()} centriPerArea={centriPerArea}
                onChange={campi => aggiornaRiga(r.id, campi)}
              />
            ))}
          </div>

          <button
            onClick={salvaTutto}
            disabled={salvando}
            style={{
              background: C.primary, color: "#fff", border: "none", borderRadius: 10,
              padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}
          >
            {salvando ? "Salvataggio..." : `Salva tutte le ${righe.length} righe`}
          </button>
        </>
      )}
    </div>
  );
}

function toggleBtn(attivo) {
  return {
    background: attivo ? C.primary : "transparent",
    color: attivo ? "#fff" : C.muted,
    border: `1.5px solid ${attivo ? C.primary : C.border}`,
    borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
  };
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: color + "15", borderRadius: 10, padding: "10px 16px", minWidth: 120 }}>
      <div style={{ fontSize: 12, color, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function RigaFattura({ riga, aree, centriPerArea, onChange }) {
  const r = riga;
  const bordoColore = r.giaCaricata ? C.accent : r.stato === "MASCHERA" ? C.red : r.stato === "FCF" ? C.blue : C.green;
  const isTrasportoAnimali = r.editArea === "TRASPORTO ANIMALI";
  const isAcquistoAnimali = r.editArea === "ACQUISTO ANIMALI";

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${bordoColore}`, borderRadius: 10, padding: 14, opacity: r.giaCaricata ? 0.6 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div>
          <strong>{r.fornitore}</strong> — {r.descrizione}
          <div style={{ fontSize: 12, color: C.muted }}>
            Fatt. {r.numero} del {r.data} · Imponibile {r.imponibile?.toFixed(2)}€
          </div>
        </div>
        <span style={{
          background: bordoColore + "22", color: bordoColore, padding: "3px 10px",
          borderRadius: 8, fontSize: 12, fontWeight: 700, height: "fit-content",
        }}>
          {r.giaCaricata ? "GIÀ CARICATA" : r.stato}
        </span>
      </div>
      {r.giaCaricata && (
        <div style={{ fontSize: 12, color: C.accent, fontStyle: "italic", marginBottom: 8 }}>
          Questa fattura (stesso fornitore, numero e data) è già presente — verrà saltata automaticamente al salvataggio.
        </div>
      )}
      {!r.giaCaricata && r.nota && <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", marginBottom: 8 }}>{r.nota}</div>}
      {!r.giaCaricata && (
      <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
        <Select label="Area" value={r.editArea} options={aree}
          onChange={v => onChange({
            editArea: v, editCentro: "",
            editTipo: v === "Ammortamenti" ? "Ammortizzabile" : "",
          })} />
        {!isTrasportoAnimali && !isAcquistoAnimali && (
          <Select label="Centro di Costo" value={r.editCentro} options={centriPerArea(r.editArea)}
            onChange={v => onChange({ editCentro: v })} />
        )}
        {!isAcquistoAnimali && (
          <Select label="Destinazione" value={r.editDestinazione}
            options={["Bovini", "Suini", "Ovini", "Generali", "Pollame", "Cavalli"]}
            onChange={v => onChange({ editDestinazione: v })} />
        )}
        {!isTrasportoAnimali && !isAcquistoAnimali && (
          <Select label="Tipo di Costo" value={r.editTipo}
            options={r.editArea === "Ammortamenti" ? ["Ammortizzabile"] : ["Fisso", "Variabile"]}
            disabled={r.editArea === "Ammortamenti"}
            onChange={v => onChange({ editTipo: v })} />
        )}
      </div>

      {isAcquistoAnimali && (
        <div style={{ marginTop: 10, padding: 10, background: C.bg, borderRadius: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
          <Testo label="Specie" value={r.specieAcquisto} onChange={v => onChange({ specieAcquisto: v })} />
          <Testo label="Razza" value={r.razzaAcquisto} onChange={v => onChange({ razzaAcquisto: v })} />
          <Select label="Destinazione acquisto" value={r.destAcquisto}
            options={["Riproduzione", "Ingrasso", "Mista", "Lotti"]}
            onChange={v => onChange({ destAcquisto: v })} />
          <Testo label="BDN (se noto)" value={r.bdnAcquisto} onChange={v => onChange({ bdnAcquisto: v })} />
          <Testo label="Nr. Lotto (se noto)" value={r.lottoAcquisto} onChange={v => onChange({ lottoAcquisto: v })} />
        </div>
      )}

      {isTrasportoAnimali && (
        <div style={{ marginTop: 10, padding: 10, background: "#FFF3E0", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: C.accent, fontWeight: 700, marginBottom: 8 }}>
            ⚠️ Trasporto Animali richiede sempre la ripartizione manuale — dividi l'imponibile ({r.imponibile?.toFixed(2)}€) tra le due destinazioni:
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Testo label="Trasporto verso il macello (€)" tipo="number" value={r.importoMacello} onChange={v => onChange({ importoMacello: v })} />
            <Testo label="Ingresso in allevamento (€)" tipo="number" value={r.importoIngresso} onChange={v => onChange({ importoIngresso: v })} />
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
            Somma inserita: {((parseFloat(r.importoMacello) || 0) + (parseFloat(r.importoIngresso) || 0)).toFixed(2)}€
            {" "}— deve essere uguale a {r.imponibile?.toFixed(2)}€
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginTop: 8 }}>
            <Testo label="Specie (per la parte ingresso)" value={r.specieAcquisto} onChange={v => onChange({ specieAcquisto: v })} />
            <Testo label="BDN/Lotto (se noto)" value={r.bdnAcquisto} onChange={v => onChange({ bdnAcquisto: v })} />
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

function Select({ label, value, options, onChange, disabled }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>{label}</label>
      <select value={value || ""} disabled={disabled} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}>
        <option value="">— seleziona —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
function Testo({ label, value, onChange, tipo = "text" }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: "block", marginBottom: 3 }}>{label}</label>
      <input type={tipo} value={value || ""} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "7px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13 }}/>
    </div>
  );
}
