import { C } from "./style";
import { formattaDataItaliana } from "./calcoloFattureColtivazione";
import { numeroExcel } from "./esportaExcel";

// Fogli Excel del registro (lavorazioni, semine, raccolte) per un elenco di colture
export function righeRegistro(colture) {
  const base = c => ({ "Campagna": c.campagna, "Numero del campo": c.numero, "Campo": c.campo, "Coltura": c.coltura });
  const d = x => (x ? formattaDataItaliana(x) : "");
  return [
    { nome: "Lavorazioni", righe: colture.flatMap(c => c.lavori.map(l => ({ ...base(c), "Data": d(l.data), "Lavorazione": l.tipo,
      "Ettari lavorati": numeroExcel(l.ettari ?? l.ettariEffettivi), "Giornate di lavoro": numeroExcel(l.giornate), "Chi l'ha fatta": l.contoTerzi ? "conto terzi" : "azienda",
      "Concimi e diserbi usati": [...l.concimi.map(k => `${k.nome} ${k.quintali ?? ""} quintali`), ...l.diserbi.map(x => `${x.nome} ${x.quantita ?? ""} ${x.unita || ""}`)].join("; "),
      "Nota": l.nota || "" }))) },
    { nome: "Semine", righe: colture.flatMap(c => c.semine.map(x => ({ ...base(c), "Data": d(x.data), "Seme": x.seme,
      "Quantità seminata": numeroExcel(x.quantita), "Unità di misura": x.unita || "", "Dose per ettaro": numeroExcel(x.dose),
      "Provenienza": x.provenienza || "", "Nota": x.nota || "" }))) },
    { nome: "Raccolte", righe: colture.flatMap(c => c.raccolte.map(x => ({ ...base(c), "Data": d(x.data), "Prodotto": x.prodotto,
      "Quantità raccolta": numeroExcel(x.quantita), "Unità di misura": x.unita || "", "Quintali": numeroExcel(x.quintali),
      "Resa in quintali per ettaro": numeroExcel(x.resa), "Nota": x.nota || "" }))) },
  ];
}

// Dettaglio dei lavori di una coltura, come registrati nell'app Podere Verde:
// lavorazioni eseguite (con concimi e diserbi), semine e raccolte. Sola lettura.
const th = { padding: "6px 8px", fontSize: 11, textAlign: "left", whiteSpace: "nowrap" };
const td = { padding: "5px 8px", textAlign: "left", borderTop: `1px solid ${C.border}`, verticalAlign: "top" };
const tdn = { ...td, textAlign: "right", whiteSpace: "nowrap" };
const q = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: d }));
const data = d => (d ? formattaDataItaliana(d) : "—");

function Titoletto({ children }) {
  return <div style={{ fontSize: 11.5, fontWeight: 800, color: C.accent, margin: "10px 0 4px", textTransform: "uppercase", letterSpacing: 0.3 }}>{children}</div>;
}
function Tabella({ intest, destra = [], children }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "#fff", border: `1px solid ${C.border}` }}>
      <thead><tr style={{ background: "#EEF3EF", color: C.primary }}>
        {intest.map((h, i) => <th key={h} style={{ ...th, textAlign: destra.includes(i) ? "right" : "left" }}>{h}</th>)}
      </tr></thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export default function ColtDettaglioLavori({ c }) {
  if (!c) return <div style={{ fontSize: 12, color: C.muted }}>Nessun lavoro registrato nell'app per questa coltura.</div>;
  const nessuno = !c.lavori.length && !c.semine.length && !c.raccolte.length;
  if (nessuno) return <div style={{ fontSize: 12, color: C.muted }}>Nessun lavoro registrato nell'app per questa coltura.</div>;
  const giornate = c.lavori.reduce((s, l) => s + (l.giornate || 0), 0);
  return (
    <div>
      {c.lavori.length > 0 && <>
        <Titoletto>Lavorazioni eseguite ({c.lavori.length}{giornate ? ` · ${q(giornate)} ${giornate === 1 ? "giornata" : "giornate"} di lavoro` : ""})</Titoletto>
        <Tabella intest={["Data", "Lavorazione", "Ettari lavorati", "Giornate di lavoro", "Chi l'ha fatta", "Concimi e diserbi usati", "Nota"]} destra={[2, 3]}>
          {c.lavori.map(l => (
            <tr key={l.id}>
              <td style={{ ...td, whiteSpace: "nowrap" }}>{data(l.data)}</td>
              <td style={{ ...td, fontWeight: 700 }}>{l.tipo}</td>
              <td style={tdn}>{l.ettari != null ? q(l.ettari) : <span style={{ color: C.muted }}>{q(l.ettariEffettivi)} (tutta la coltura)</span>}</td>
              <td style={tdn}>{q(l.giornate)}</td>
              <td style={td}>{l.contoTerzi ? "conto terzi" : "azienda"}</td>
              <td style={td}>{[...l.concimi.map(k => `${k.nome} ${q(k.quintali)} quintali${k.provenienza ? ` (${k.provenienza})` : ""}`),
                ...l.diserbi.map(d => `${d.nome} ${q(d.quantita)} ${d.unita || ""}${d.provenienza ? ` (${d.provenienza})` : ""}`)].join("; ") || "—"}</td>
              <td style={{ ...td, color: C.muted }}>{l.nota || ""}</td>
            </tr>))}
        </Tabella>
      </>}
      {c.semine.length > 0 && <>
        <Titoletto>Semine ({c.semine.length})</Titoletto>
        <Tabella intest={["Data", "Seme", "Quantità seminata", "Dose per ettaro", "Provenienza", "Nota"]} destra={[2, 3]}>
          {c.semine.map(s => (
            <tr key={s.id}>
              <td style={{ ...td, whiteSpace: "nowrap" }}>{data(s.data)}</td>
              <td style={{ ...td, fontWeight: 700 }}>{s.seme}</td>
              <td style={tdn}>{q(s.quantita)} {s.unita || ""}</td>
              <td style={tdn}>{s.dose != null ? `${q(s.dose)} ${s.unita || ""}` : "—"}</td>
              <td style={td}>{s.provenienza || "—"}</td>
              <td style={{ ...td, color: C.muted }}>{s.nota || ""}</td>
            </tr>))}
        </Tabella>
      </>}
      {c.raccolte.length > 0 && <>
        <Titoletto>Raccolte ({c.raccolte.length})</Titoletto>
        <Tabella intest={["Data", "Prodotto", "Quantità raccolta", "Quintali", "Resa in quintali per ettaro", "Nota"]} destra={[2, 3, 4]}>
          {c.raccolte.map(r => (
            <tr key={r.id}>
              <td style={{ ...td, whiteSpace: "nowrap" }}>{data(r.data)}</td>
              <td style={{ ...td, fontWeight: 700 }}>{r.prodotto}{r.sottoprodotto ? <span style={{ color: C.muted, fontWeight: 400 }}> (sottoprodotto)</span> : ""}</td>
              <td style={tdn}>{q(r.quantita)} {r.unita || ""}</td>
              <td style={tdn}>{q(r.quintali, 1)}</td>
              <td style={tdn}>{q(r.resa, 1)}</td>
              <td style={{ ...td, color: C.muted }}>{r.nota || ""}</td>
            </tr>))}
        </Tabella>
      </>}
    </div>
  );
}
