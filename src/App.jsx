import { useState } from "react";
import Fornitori from "./Fornitori";
import CaricaFatture from "./CaricaFatture";
import ReportAcquistoAnimali from "./ReportAcquistoAnimali";
import { C, FONT } from "./style";

const TAB = [
  { id: "carica", label: "Carica Fatture", icon: "📥" },
  { id: "fornitori", label: "Fornitori", icon: "🏢" },
  { id: "acquisto", label: "Report Acquisto Animali", icon: "🐄" },
];

export default function App() {
  const [tab, setTab] = useState("carica");

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT }}>
      <header style={{ background: C.primary, padding: "16px 20px", color: "#fff" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Contabilità Industriale</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Podere Verde</div>
          </div>
          <nav style={{ display: "flex", gap: 6 }}>
            {TAB.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  background: tab === t.id ? "rgba(255,255,255,0.2)" : "transparent",
                  color: "#fff", border: "none", borderRadius: 8,
                  padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main>
        {tab === "carica" && <CaricaFatture />}
        {tab === "fornitori" && <Fornitori />}
        {tab === "acquisto" && <ReportAcquistoAnimali />}
      </main>
    </div>
  );
}
