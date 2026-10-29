import { C } from "./style";

// Versione 261: mostra nel programma un documento di istruzioni scritto in Word (Istruzioni Carica
// Fatture Passive, Piano dei Conti). Il testo arriva da istruzioniDati.js, generato
// dal Word: così il programma e il documento dicono la stessa cosa.

const BASE = import.meta.env.BASE_URL || "/";

function Runs({ r }) {
  return r.map((x, i) => {
    if (x.img) {
      const piccola = x.w && x.w <= 48;
      return (
        <img key={i} src={BASE + x.img} alt=""
          style={piccola
            ? { width: x.w, height: x.h, verticalAlign: "middle", marginRight: 4 }
            : { display: "block", width: x.w ? Math.min(x.w, 860) : "100%", maxWidth: "100%", height: "auto", margin: "8px 0", border: `1px solid ${C.border}`, borderRadius: 6 }} />
      );
    }
    const testo = x.x.split("\n").flatMap((t, j) => j ? [<br key={j} />, t] : [t]);
    // Versione 327: colore e sottolineato del Word (l'avviso rosso delle Istruzioni Generali degli F24)
    const st = (x.c || x.u) ? { color: x.c, textDecoration: x.u ? "underline" : undefined } : undefined;
    if (x.b && x.i) return <b key={i} style={st}><i>{testo}</i></b>;
    if (x.b) return <b key={i} style={st}>{testo}</b>;
    if (x.i) return <i key={i} style={st}>{testo}</i>;
    return <span key={i} style={st}>{testo}</span>;
  });
}

function ancora(b, k) { return "doc-" + k; }

function Blocco({ b, k, inTabella }) {
  if (b.t === "titolo") return null;
  if (b.t === "h1") return <h2 id={ancora(b, k)} style={{ color: C.primary, fontSize: 20, margin: "26px 0 8px", paddingBottom: 4, borderBottom: `2px solid ${C.primary}22` }}><Runs r={b.r} /></h2>;
  if (b.t === "h2") return <h3 id={ancora(b, k)} style={{ color: C.primary, fontSize: 17, margin: "20px 0 6px" }}><Runs r={b.r} /></h3>;
  if (b.t === "h3") return <h4 style={{ color: C.text, fontSize: 15, margin: "16px 0 4px" }}><Runs r={b.r} /></h4>;
  if (b.t === "tab") {
    return (
      <div style={{ overflowX: "auto", margin: "10px 0 14px" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
          <colgroup>{b.col.map((w, i) => <col key={i} style={{ width: w + "%" }} />)}</colgroup>
          <tbody>
            {b.righe.map((riga, i) => (
              <tr key={i}>
                {riga.map((cella, j) => {
                  const Tag = i === 0 ? "th" : "td";
                  return (
                    <Tag key={j} style={{ border: `1px solid ${C.border}`, padding: "6px 9px", verticalAlign: "top", textAlign: "left", fontSize: 13, lineHeight: 1.5, background: i === 0 ? "#E3EDE0" : "#fff", fontWeight: i === 0 ? 700 : 400 }}>
                      {cella.map((p, z) => <Blocco key={z} b={p} k={`${k}-${i}-${j}-${z}`} inTabella />)}
                    </Tag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  // paragrafo
  const stile = { fontSize: inTabella ? 13 : 14, lineHeight: 1.6, color: C.text, margin: inTabella ? "0 0 4px" : "0 0 9px" };
  if (b.et || b.ind) {
    return (
      <div style={{ ...stile, display: "flex", gap: 8, marginLeft: (b.ind || 1) * 18 }}>
        {b.et && <span style={{ minWidth: 18, fontWeight: 700, color: C.primary }}>{b.et}</span>}
        <div style={{ flex: 1 }}><Runs r={b.r} /></div>
      </div>
    );
  }
  return <p style={stile}><Runs r={b.r} /></p>;
}

// Versione 296: «incorporato» = documento dentro un'altra pagina (lo studio nel Report di Analisi dei bovini):
// senza il titolo grande e senza margini propri.
export default function DocumentoIstruzioni({ doc, incorporato = false }) {
  const indice = doc.blocchi.map((b, k) => ({ b, k })).filter(x => x.b.t === "h1");
  return (
    <div style={incorporato ? {} : { padding: 20, maxWidth: 960, margin: "0 auto" }}>
      {!incorporato && <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 12 }}>📖 {doc.titolo}</h1>}
      {indice.length >= 2 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 4 }}>In questo documento</div>
          {indice.map(({ b, k }) => (
            <div key={k}>
              <a href={"#doc-" + k} onClick={e => { e.preventDefault(); document.getElementById("doc-" + k)?.scrollIntoView({ behavior: "smooth" }); }}
                style={{ fontSize: 13, color: C.primary, textDecoration: "none" }}>
                {b.r.map(x => x.x || "").join("")}
              </a>
            </div>
          ))}
        </div>
      )}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 22px" }}>
        {doc.blocchi.map((b, k) => <Blocco key={k} b={b} k={k} />)}
      </div>
    </div>
  );
}
