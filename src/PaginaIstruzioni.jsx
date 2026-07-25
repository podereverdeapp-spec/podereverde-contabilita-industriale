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
