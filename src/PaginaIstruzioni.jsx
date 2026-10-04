import { C } from "./style";

// Componente generico per le pagine "Istruzioni" di ogni cartella — riceve un array
// di sezioni (una per pagina della cartella) e le mostra in modo uniforme.
export default function PaginaIstruzioni({ titolo, introduzione, sezioni }) {
  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ color: C.primary, fontSize: 24, marginBottom: 4 }}>📖 Istruzioni — {titolo}</h1>
      <p style={{ color: C.muted, marginTop: 0, marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>{introduzione}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {sezioni.map((s, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ background: C.primary, color: "#fff", padding: "10px 16px", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
              <span>{s.icon}</span> <span>{s.pagina}</span>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 4 }}>A cosa serve</div>
              <p style={{ fontSize: 13, color: C.text, marginTop: 0, marginBottom: 14, lineHeight: 1.6 }}>{s.aCosaServe}</p>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 4 }}>Come si usa</div>
              <ol style={{ fontSize: 13, color: C.text, marginTop: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                {s.comeSiUsa.map((passo, j) => <li key={j}>{passo}</li>)}
              </ol>
              {s.spiegazione && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 8 }}>{s.titoloSpiegazione || "Come funziona il calcolo, passo per passo"}</div>
                  {s.spiegazione.map((blocco, j) => (
                    <div key={j} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.primary, marginBottom: 4 }}>{blocco.titolo}</div>
                      {(Array.isArray(blocco.testo) ? blocco.testo : [blocco.testo]).map((t, k) => (
                        <p key={k} style={{ fontSize: 13, color: C.text, margin: "0 0 6px", lineHeight: 1.6 }}>{t}</p>
                      ))}
                      {blocco.esempio && (
                        <div style={{ fontSize: 12.5, background: "#F3F8EE", borderLeft: `3px solid ${C.green}`, borderRadius: 6, padding: "8px 12px", marginTop: 6, lineHeight: 1.7 }}>
                          <strong>Esempio — </strong>
                          {(Array.isArray(blocco.esempio) ? blocco.esempio : [blocco.esempio]).map((t, k) => <div key={k}>{t}</div>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {s.note && (
                <div style={{ fontSize: 12, color: C.muted, background: C.bg, borderRadius: 8, padding: "8px 12px", marginTop: 10 }}>
                  💡 {s.note}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
