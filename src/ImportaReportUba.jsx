import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";
import { C } from "./style";
import { numeroRobusto, formattaData } from "./parsingUtils";

// Motivi di uscita che, nella NOSTRA app di allevamento, rappresentano una perdita
// (esclusa dal calcolo del costo/UBA-giorno) — governa podereverdeapp.it, non Prima App
const MOTIVI_PERDITA = ["morto (malattia)", "morto (causa naturale)", "predato", "smarrito", "altro"];

function classificaCategoriaContabile(riga) {
  const stato = (riga.stato || "").trim().toLowerCase();
  const motivo = (riga.motivo_uscita || "").trim().toLowerCase();
  const qualifica = (riga.qualifica_riproduzione || "").trim();

  if (stato === "uscito" || riga.data_uscita) {
    if (MOTIVI_PERDITA.includes(motivo)) return "IMPRODUTTIVO_USCITO";
    return "PRODUTTIVO"; // macellato, venduto, ecc.
  }
  if (qualifica) return "RIPRODUTTORE";
  return "PRODUTTIVO";
}

export default function ImportaReportUba() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [righe, setRighe] = useState([]);
  const [nomeFile, setNomeFile] = useState("");
  const [caricando, setCaricando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [importiPrecedenti, setImportiPrecedenti] = useState([]);
  const fileInputRef = useRef(null);

  useState(() => { caricaImportiPrecedenti(); }, []);
  async function caricaImportiPrecedenti() {
    const { data } = await supabase.from("ci_report_uba_import").select("*").order("anno", { ascending: false });
    setImportiPrecedenti(data || []);
  }

  function leggiCampo(r, varianti) {
    for (const v of varianti) {
      const chiave = Object.keys(r).find(k => k.trim().toLowerCase() === v.toLowerCase());
      if (chiave && r[chiave] !== "") return r[chiave];
    }
    return null;
  }

  function gestisciFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setNomeFile(file.name);
    setCaricando(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: "binary", cellDates: true });
      const nomeFoglio = wb.SheetNames.find(n => n.trim().toLowerCase().includes("uba") && n.trim().toLowerCase().includes("dettagli")) || wb.SheetNames[0];
      const dati = XLSX.utils.sheet_to_json(wb.Sheets[nomeFoglio], { defval: "" });

      const risultati = dati.map((r, i) => {
        const riga = {
          id: `riga-${i}`,
          bdn: leggiCampo(r, ["BDN", "BDN / Matricola"]),
          nome: leggiCampo(r, ["Nome"]),
          specie: leggiCampo(r, ["Specie"]),
          categoria: leggiCampo(r, ["Categoria", "Qualifica"]),
          nascita: formattaData(leggiCampo(r, ["Data nascita", "Nascita"])),
          inizio_calcolo: formattaData(leggiCampo(r, ["Data ingresso", "Inizio calcolo"])),
          data_riferimento: formattaData(leggiCampo(r, ["Data riferimento", "Data uscita"])) || null,
          giorni_presenza: numeroRobusto(leggiCampo(r, ["Giorni permanenza", "Giorni presenza"])),
          uba_medio: numeroRobusto(leggiCampo(r, ["UBA medio", "Coefficiente UBA"])),
          uba_giorni: numeroRobusto(leggiCampo(r, ["UBA-giorni", "UBA giorni"])),
          stato: leggiCampo(r, ["Stato"]),
          qualifica_riproduzione: leggiCampo(r, ["Qualifica riproduzione", "Riproduttore"]),
          data_uscita: formattaData(leggiCampo(r, ["Data uscita"])) || null,
          motivo_uscita: leggiCampo(r, ["Motivo uscita"]),
          lotto: leggiCampo(r, ["Lotto", "Codice lotto"]),
        };
        riga.categoria_contabile = classificaCategoriaContabile(riga);
        return riga;
      }).filter(r => r.bdn || r.lotto); // scarto righe totalmente vuote

      setRighe(risultati);
      setCaricando(false);
    };
    reader.readAsBinaryString(file);
  }

  const riepilogo = {
    produttivo: righe.filter(r => r.categoria_contabile === "PRODUTTIVO").length,
    riproduttore: righe.filter(r => r.categoria_contabile === "RIPRODUTTORE").length,
    improduttivo: righe.filter(r => r.categoria_contabile === "IMPRODUTTIVO_USCITO").length,
    ubaGiorniProduttivo: righe.filter(r => r.categoria_contabile === "PRODUTTIVO").reduce((s, r) => s + (r.uba_giorni || 0), 0),
    ubaGiorniRiproduttore: righe.filter(r => r.categoria_contabile === "RIPRODUTTORE").reduce((s, r) => s + (r.uba_giorni || 0), 0),
    ubaGiorniImproduttivo: righe.filter(r => r.categoria_contabile === "IMPRODUTTIVO_USCITO").reduce((s, r) => s + (r.uba_giorni || 0), 0),
  };

  async function confermaImport() {
    if (righe.length === 0) return;
    if (!window.confirm(`Importare ${righe.length} righe per l'anno ${anno}? Se esiste già un import per questo anno, verrà sostituito.`)) return;

    setSalvando(true);
    try {
      // Rimuovo un eventuale import precedente per lo stesso anno (cascade elimina anche le righe animale)
      await supabase.from("ci_report_uba_import").delete().eq("anno", anno);

      const { data: importRecord, error: eImp } = await supabase.from("ci_report_uba_import").insert([{
        anno, nome_file: nomeFile, nome_foglio: "UBA Dettaglio",
        tot_produttivo: riepilogo.produttivo, uba_giorni_produttivo: riepilogo.ubaGiorniProduttivo,
        tot_riproduttore: riepilogo.riproduttore, uba_giorni_riproduttore: riepilogo.ubaGiorniRiproduttore,
        tot_improduttivo: riepilogo.improduttivo, uba_giorni_improduttivo: riepilogo.ubaGiorniImproduttivo,
        righe_saltate: 0,
      }]).select().single();
      if (eImp) throw new Error(eImp.message);

      // Risolvo animale_id per BDN, in blocco
      const bdnList = [...new Set(righe.map(r => r.bdn).filter(Boolean))];
      const { data: animaliTrovati } = await supabase.from("animali").select("id, bdn").in("bdn", bdnList);
      const mappaAnimali = new Map((animaliTrovati || []).map(a => [a.bdn, a.id]));

      const daInserire = righe.map(r => ({
        import_id: importRecord.id, anno, animale_id: r.bdn ? mappaAnimali.get(r.bdn) || null : null,
        bdn: r.bdn, nome: r.nome, specie: r.specie, categoria: r.categoria,
        nascita: r.nascita || null, inizio_calcolo: r.inizio_calcolo || null, data_riferimento: r.data_riferimento,
        giorni_presenza: r.giorni_presenza, uba_medio: r.uba_medio, uba_giorni: r.uba_giorni,
        stato: r.stato, qualifica_riproduzione: r.qualifica_riproduzione, data_uscita: r.data_uscita,
        motivo_uscita: r.motivo_uscita, lotto: r.lotto, categoria_contabile: r.categoria_contabile,
      }));

      // Inserisco a blocchi da 200 per non superare limiti di dimensione richiesta
      for (let i = 0; i < daInserire.length; i += 200) {
        const { error } = await supabase.from("ci_report_uba_animale").insert(daInserire.slice(i, i + 200));
        if (error) throw new Error(error.message);
      }

      alert(`✓ Importate ${righe.length} righe per l'anno ${anno}.`);
      setRighe([]);
      setNomeFile("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      caricaImportiPrecedenti();
    } catch (err) {
      alert(`⚠️ Errore durante l'importazione:\n\n${err.message}`);
    }
    setSalvando(false);
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>Importa Report UBA</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 20 }}>
        Carica il foglio "UBA Dettaglio" esportato da podereverdeapp.it — riconosce e collega direttamente gli animali reali (nessuna sincronizzazione).
      </p>

      {importiPrecedenti.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>IMPORT GIÀ PRESENTI</div>
          {importiPrecedenti.map(imp => (
            <div key={imp.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
              <span>Anno {imp.anno}</span>
              <span style={{ color: C.muted }}>
                {imp.tot_produttivo} produttivi · {imp.tot_riproduttore} riproduttori · {imp.tot_improduttivo} improduttivi — importato il {new Date(imp.imported_at).toLocaleDateString("it-IT")}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 3 }}>Anno di riferimento</label>
            <input type="number" value={anno} onChange={e => setAnno(parseInt(e.target.value))}
              style={{ padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 13, width: 100 }} />
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={gestisciFile} disabled={caricando} />
        {caricando && <p style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>Lettura del file...</p>}
      </div>

      {righe.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <StatBox label="Produttivo" value={riepilogo.produttivo} sub={`${riepilogo.ubaGiorniProduttivo.toFixed(1)} UBA-gg`} color={C.green} />
            <StatBox label="Riproduttore" value={riepilogo.riproduttore} sub={`${riepilogo.ubaGiorniRiproduttore.toFixed(1)} UBA-gg`} color={C.blue} />
            <StatBox label="Improduttivo (perdita)" value={riepilogo.improduttivo} sub={`${riepilogo.ubaGiorniImproduttivo.toFixed(1)} UBA-gg`} color={C.red} />
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16, maxHeight: 400, overflowY: "auto" }}>
            <table style={{ width: "100%", fontSize: 12 }}>
              <thead style={{ position: "sticky", top: 0, background: C.primary, color: "#fff" }}>
                <tr>
                  <th style={th}>BDN</th><th style={th}>Nome</th><th style={th}>Specie</th>
                  <th style={th}>UBA-giorni</th><th style={th}>Stato</th><th style={th}>Categoria contabile</th>
                </tr>
              </thead>
              <tbody>
                {righe.slice(0, 100).map(r => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td}>{r.bdn || "—"}</td>
                    <td style={td}>{r.nome || "—"}</td>
                    <td style={td}>{r.specie || "—"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{r.uba_giorni?.toFixed(2) ?? "—"}</td>
                    <td style={td}>{r.stato || "—"}</td>
                    <td style={{ ...td, fontWeight: 700, color: r.categoria_contabile === "IMPRODUTTIVO_USCITO" ? C.red : r.categoria_contabile === "RIPRODUTTORE" ? C.blue : C.green }}>
                      {r.categoria_contabile}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {righe.length > 100 && <div style={{ padding: 10, textAlign: "center", color: C.muted, fontSize: 12 }}>... e altre {righe.length - 100} righe</div>}
          </div>

          <button onClick={confermaImport} disabled={salvando}
            style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            {salvando ? "Importazione..." : `Conferma import di ${righe.length} righe per l'anno ${anno}`}
          </button>
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, sub, color }) {
  return (
    <div style={{ background: color + "15", borderRadius: 10, padding: "10px 16px", minWidth: 140 }}>
      <div style={{ fontSize: 12, color, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700 };
const td = { padding: "6px 10px", fontSize: 12 };
