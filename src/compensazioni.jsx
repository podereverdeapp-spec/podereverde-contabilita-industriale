import { useEffect, useMemo, useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "./supabase";
import { C } from "./style";
import { btn, input, scheda, th, td, testata, dataIt } from "./stileAruba";
import { formattaEuro, fetchAllPages, leggiInBlocchi } from "./parsingUtils";
import { caricaAllegati, nuovoCodiceRichiesta, CASELLA_COMUNICAZIONI, FIRMA_PREDEFINITA } from "./anagrafiche";

// Versione 347 — LE COMPENSAZIONI nello scadenzario (decisioni del Dott. Bizzarri del 03/11/2026 ore 18:14 e del
// 04/11/2026 ore 21:16–21:38). Tabella ci_compensazioni: ogni riga chiude due documenti senza movimento di banca.
//   «nota di credito»: A = la nota di credito, B = la fattura dello stesso soggetto; si registra già «accettata».
//   «tra cliente e fornitore»: A = la nostra fattura al cliente, B = la sua fattura come fornitore (stessa partita IVA);
//   nasce «in attesa di accettazione» con la lettera di proposta (articoli 1243 e 1252 del codice civile), da spedire
//   con il postino o da scaricare; diventa «accettata» quando si registra la risposta nel Registro delle Comunicazioni.
// Le righe con lo stesso «gruppo» sono una sola compensazione: una lettera, una accettazione, un «Togli».
// Ore 21:44: la lettera di proposta entra SUBITO nel Registro delle Comunicazioni del cliente e del fornitore come
// «da inviare»; quando parte con il postino, la riga del registro diventa quella della mail spedita (la riga «da inviare»
// si toglie dal registro come doppione, recuperabile); se parte a mano (PEC, raccomandata) si segna «inviata a mano».
// Il database rifiuta le compensazioni sbagliate (guardiano ci_compensazioni_controllo). La prima nota viene dopo.

const euro = n => (n === null || n === undefined ? "—" : formattaEuro(Number(n)));
const cent = v => Math.round((Number(v) || 0) * 100) / 100;
const numero = v => { const t = String(v ?? "").trim(); return cent(parseFloat(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t)); };
const pulisciPiva = v => String(v || "").toUpperCase().replace(/^IT/, "").replace(/\s/g, "");
const PEC_PODERE = "agricolapodereverdesrl@pec.it";
export const ARCHIVIO_LETTERE = "comunicazioni";

// Le compensazioni che toccano questi documenti, con i dati dell'altro documento
export async function leggiCompensazioni(idsScadenze) {
  const ids = [...new Set((idsScadenze || []).filter(Boolean))];
  if (!ids.length) return [];
  const [{ data: d1, error: e1 }, { data: d2, error: e2 }] = await Promise.all([
    leggiInBlocchi(ids, (b, da, a) => supabase.from("ci_compensazioni").select("*").in("documento_a_id", b).order("id").range(da, a)),
    leggiInBlocchi(ids, (b, da, a) => supabase.from("ci_compensazioni").select("*").in("documento_b_id", b).order("id").range(da, a)),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  const righe = [...new Map([...(d1 || []), ...(d2 || [])].map(x => [x.id, x])).values()];
  const docIds = [...new Set(righe.flatMap(r => [r.documento_a_id, r.documento_b_id]))];
  const { data: docs, error: e3 } = await leggiInBlocchi(docIds, (b, da, a) => supabase.from("ci_scadenze")
    .select("id, lato, numero_documento, data_documento, importo, fornitore_id, cliente_id").in("id", b).order("id").range(da, a));
  if (e3) throw new Error(e3.message);
  const perId = new Map((docs || []).map(d => [d.id, d]));
  const comIds = [...new Set(righe.flatMap(r => [r.comunicazione_id, r.risposta_id]).filter(Boolean))];
  let com = new Map();
  if (comIds.length) {
    const { data: cc, error: e4 } = await leggiInBlocchi(comIds, (b, da, a) => supabase.from("ci_comunicazioni")
      .select("id, data_ora, esito, oggetto, testo, firma, allegati, indirizzo, tolta_il, note").in("id", b).order("id").range(da, a));
    if (e4) throw new Error(e4.message);
    com = new Map((cc || []).map(c => [c.id, c]));
  }
  return righe.map(r => ({ ...r, a: perId.get(r.documento_a_id), b: perId.get(r.documento_b_id), lettera: com.get(r.comunicazione_id) || null }));
}

// Il cliente (o il fornitore) con la stessa partita IVA della scheda, se c'è
export async function trovaControparte(lato, schedaCorrente) {
  const piva = pulisciPiva(schedaCorrente?.partita_iva) || pulisciPiva(schedaCorrente?.codice_fiscale);
  if (!piva) return null;
  const tabella = lato === "fornitore" ? "ci_clienti" : "ci_fornitori";
  const { data, error } = await fetchAllPages((da, a) => supabase.from(tabella).select("id, nome, partita_iva, codice_fiscale, email").order("id").range(da, a));
  if (error) return null;
  return (data || []).find(x => (pulisciPiva(x.partita_iva) || pulisciPiva(x.codice_fiscale)) === piva) || null;
}

async function apriLettera(percorso) {
  const { data, error } = await supabase.storage.from(ARCHIVIO_LETTERE).createSignedUrl(percorso, 300);
  if (error) { alert(`La lettera non si apre: ${error.message}`); return; }
  window.open(data.signedUrl, "_blank");
}

// ───────────────────────── elenco delle compensazioni di un documento (nel dettaglio della fattura)
export function CompensazioniDelDocumento({ scadenzaId, compensazioni, lato, schedaId, onCambiato }) {
  const mie = compensazioni.filter(c => c.documento_a_id === scadenzaId || c.documento_b_id === scadenzaId);
  const [accettando, setAccettando] = useState(null);
  if (!mie.length) return null;
  async function togli(c) {
    const gruppo = compensazioni.filter(x => x.gruppo === c.gruppo);
    const testo = `Togliere la compensazione${gruppo.length > 1 ? ` (${gruppo.length} righe, un'unica compensazione)` : ""} di ${euro(gruppo.reduce((t, x) => t + Number(x.importo), 0))}?\n\n`
      + "I documenti tornano aperti. La compensazione resta scritta nel Registro delle modifiche."
      + (c.comunicazione_id ? "\n\nAttenzione: la lettera di proposta è già partita. Dopo aver tolto la compensazione, registri la revoca nel Registro delle Comunicazioni." : "");
    if (!window.confirm(testo)) return;
    const { error } = await supabase.from("ci_compensazioni").delete().eq("gruppo", c.gruppo);
    if (error) { alert(`⚠️ ${error.message}`); return; }
    onCambiato && onCambiato();
  }
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 800, color: C.accent, fontSize: 12.5, marginBottom: 4 }}>Compensazioni</div>
      <table><thead><tr><th style={th}>Data</th><th style={th}>Genere</th><th style={th}>Con il documento</th><th style={{ ...th, textAlign: "right" }}>Importo</th><th style={th}>Stato</th><th style={th}>Motivo e prova</th><th style={th}>Lettera</th><th style={th}></th></tr></thead>
        <tbody>{mie.map(c => {
          const altro = c.documento_a_id === scadenzaId ? c.b : c.a;
          const descr = altro ? `${altro.lato === lato ? "" : altro.lato === "cliente" ? "nostra fattura al cliente " : "sua fattura come fornitore "}${altro.importo < 0 ? "nota di credito " : ""}${altro.numero_documento} del ${dataIt(altro.data_documento)}` : "—";
          return (
            <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={td}>{dataIt(c.data_compensazione)}</td>
              <td style={td}>{c.genere}</td>
              <td style={td}>{descr}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{euro(c.importo)}</td>
              <td style={td}><span style={{ color: c.stato === "accettata" ? C.green : C.blue, fontWeight: 700 }}>{c.stato}</span>{c.accettata_il && <div style={{ fontSize: 10.5, color: C.muted }}>registrata il {dataIt(String(c.accettata_il).slice(0, 10))}</div>}</td>
              <td style={{ ...td, fontSize: 11.5 }}>{c.motivo}{c.prova && <div style={{ color: C.muted }}>{c.prova}</div>}</td>
              <td style={td}>{c.lettera_percorso ? <button style={{ ...btn(false), height: 26, fontSize: 11 }} onClick={() => apriLettera(c.lettera_percorso)}>📄 Lettera</button> : <span style={{ fontSize: 11, color: C.muted }}>—</span>}
                {c.lettera && <div style={{ fontSize: 10.5, fontWeight: 700, color: c.lettera.esito === "da inviare" ? C.red : C.muted }}>nel registro: {c.lettera.esito}</div>}
                {c.lettera?.esito === "da inviare" && c.stato !== "accettata" && <InviaLettera compensazione={c} onFatto={onCambiato} />}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                {c.stato !== "accettata" && <button style={{ ...btn(false, C.green), height: 26, fontSize: 11, marginRight: 4 }} onClick={() => setAccettando(c)}>Registra accettazione</button>}
                <button style={{ ...btn(false, C.red), height: 26, fontSize: 11 }} onClick={() => togli(c)}>Togli</button>
              </td>
            </tr>);
        })}</tbody></table>
      {accettando && <RegistraAccettazione compensazione={accettando} lato={lato} schedaId={schedaId} onChiudi={() => setAccettando(null)}
        onFatto={() => { setAccettando(null); onCambiato && onCambiato(); }} />}
    </div>
  );
}

// ───────────────────────── «Compensa» su una nota di credito
export function CompensaNota({ nota, aperte, onChiudi, onFatto }) {
  const disponibile = cent(Math.abs(Number(nota.residuo)));
  const [importi, setImporti] = useState({});
  const [motivo, setMotivo] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState("");
  const somma = cent(Object.values(importi).reduce((t, v) => t + numero(v), 0));
  async function salva() {
    setErrore("");
    const righe = Object.entries(importi).map(([sid, v]) => ({ id: Number(sid), importo: numero(v) })).filter(r => r.importo > 0);
    if (!righe.length) { setErrore("Scelga almeno una fattura e scriva l'importo."); return; }
    if (somma > disponibile + 0.005) { setErrore(`Non si può compensare più della nota: massimo ${euro(disponibile)}.`); return; }
    const oltre = righe.find(r => r.importo > cent(aperte.find(x => x.scadenza_id === r.id)?.residuo) + 0.005);
    if (oltre) { setErrore("Un importo supera il residuo della sua fattura."); return; }
    if (!motivo.trim()) { setErrore("Scriva il motivo: resta nella scheda delle compensazioni."); return; }
    setLavoro(true);
    const gruppo = crypto.randomUUID();
    const { error } = await supabase.from("ci_compensazioni").insert(righe.map(r => ({
      gruppo, genere: "nota di credito", documento_a_id: nota.scadenza_id, documento_b_id: r.id, importo: r.importo,
      stato: "accettata", motivo: motivo.trim(), accettata_il: new Date().toISOString(),
    })));
    setLavoro(false);
    if (error) { setErrore(error.message); return; }
    onFatto();
  }
  return (
    <div style={{ ...scheda, border: `2px solid ${C.accent}` }}>
      <div style={{ fontWeight: 800, color: C.accent }}>Compensa la nota di credito {nota.numero_documento} del {dataIt(nota.data_documento)}: da compensare {euro(disponibile)}</div>
      <div style={{ fontSize: 12, color: C.muted, margin: "4px 0 8px" }}>Scelga la fattura (o le fatture) dello stesso {nota.lato} che la nota annulla o riduce. La nota di credito è un documento già concordato: la compensazione vale subito, senza lettera.</div>
      {!aperte.length ? <div style={{ color: C.muted }}>Nessuna fattura aperta di questo {nota.lato}.</div> : (
        <table><thead><tr style={testata}><th style={th}>Numero</th><th style={th}>Data</th><th style={{ ...th, textAlign: "right" }}>Residuo</th><th style={th}>Importo da compensare</th></tr></thead>
          <tbody>{aperte.map(r => (
            <tr key={r.scadenza_id} style={{ borderTop: `1px solid ${C.border}`, background: cent(r.residuo) === disponibile ? "#EEF6EE" : undefined }}>
              <td style={td}>{r.numero_documento}{cent(r.residuo) === disponibile && <div style={{ fontSize: 10.5, color: C.green, fontWeight: 700 }}>stesso importo della nota</div>}</td>
              <td style={td}>{dataIt(r.data_documento)}</td>
              <td style={{ ...td, textAlign: "right" }}>{euro(r.residuo)}</td>
              <td style={td}><input value={importi[r.scadenza_id] ?? ""} onChange={e => { setErrore(""); setImporti(p => ({ ...p, [r.scadenza_id]: e.target.value })); }} style={{ ...input, width: 120 }} placeholder="0,00" />
                <button style={{ ...btn(false), height: 28, marginLeft: 6, fontSize: 11 }} onClick={() => { setErrore(""); setImporti(p => { const altri = cent(Object.entries(p).filter(([k]) => Number(k) !== r.scadenza_id).reduce((t, [, v]) => t + numero(v), 0)); return { ...p, [r.scadenza_id]: String(Math.max(0, Math.min(cent(r.residuo), cent(disponibile - altri)))).replace(".", ",") }; }); }}>tutto</button></td>
            </tr>))}</tbody></table>
      )}
      <div style={{ marginTop: 8 }}><input value={motivo} onChange={e => { setErrore(""); setMotivo(e.target.value); }} placeholder={`Motivo, per esempio: la nota di credito ${nota.numero_documento} annulla la fattura …`} style={{ ...input, width: "100%" }} /></div>
      {errore && <div style={{ color: C.red, fontSize: 12.5, marginTop: 6, fontWeight: 700 }}>⚠️ {errore}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <button style={btn(true, C.accent)} disabled={lavoro} onClick={salva}>{lavoro ? "Salvo…" : "Conferma compensazione"}</button>
        <button style={btn(false)} onClick={onChiudi}>Annulla</button>
        <span style={{ fontSize: 12.5, color: C.muted }}>scritto {euro(somma)} di {euro(disponibile)}</span>
      </div>
    </div>
  );
}

// Abbina le fatture scelte delle due parti, dalla più vecchia: resta aperta in parte al massimo la più recente
export function ripartisci(nostre, sue) {
  const A = [...nostre].sort((x, y) => String(x.data_documento).localeCompare(String(y.data_documento)) || x.scadenza_id - y.scadenza_id).map(x => ({ ...x, resto: cent(x.residuo) }));
  const B = [...sue].sort((x, y) => String(x.data_documento).localeCompare(String(y.data_documento)) || x.scadenza_id - y.scadenza_id).map(x => ({ ...x, resto: cent(x.residuo) }));
  const coppie = []; let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    const q = cent(Math.min(A[i].resto, B[j].resto));
    if (q > 0) coppie.push({ a: A[i], b: B[j], importo: q });
    A[i].resto = cent(A[i].resto - q); B[j].resto = cent(B[j].resto - q);
    if (A[i].resto <= 0.005) i++;
    if (B[j].resto <= 0.005) j++;
  }
  return coppie;
}

function testoLettera({ controparte, coppie, totale, restoNostre, restoSue }) {
  const nostre = [...new Map(coppie.map(c => [c.a.scadenza_id, c.a])).values()];
  const sue = [...new Map(coppie.map(c => [c.b.scadenza_id, c.b])).values()];
  const perA = id => cent(coppie.filter(c => c.a.scadenza_id === id).reduce((t, c) => t + c.importo, 0));
  const perB = id => cent(coppie.filter(c => c.b.scadenza_id === id).reduce((t, c) => t + c.importo, 0));
  const righe = [
    `Spettabile ${controparte.nome},`,
    "",
    "con la presente vi proponiamo di compensare, ai sensi degli articoli 1243 e 1252 del codice civile, i reciproci crediti e debiti qui elencati.",
    "",
    "Nostre fatture a vostro carico:",
    ...nostre.map(x => `– fattura ${x.numero_documento} del ${dataIt(x.data_documento)}: residuo ${euro(x.residuo)}, compensati ${euro(perA(x.scadenza_id))}`),
    "",
    "Vostre fatture a nostro carico:",
    ...sue.map(x => `– fattura ${x.numero_documento} del ${dataIt(x.data_documento)}: residuo ${euro(x.residuo)}, compensati ${euro(perB(x.scadenza_id))}`),
    "",
    `Importo compensato: ${euro(totale)}.`,
    restoNostre > 0.005 ? `Dopo la compensazione resta a vostro debito ${euro(restoNostre)}.` : restoSue > 0.005 ? `Dopo la compensazione resta a nostro debito ${euro(restoSue)}, che vi pagheremo indicando nella causale «DEDOTTA COMPENSAZIONE».` : "Dopo la compensazione le partite elencate risultano chiuse.",
    "",
    `Vi chiediamo di restituirci la presente firmata per accettazione, oppure di confermarla via PEC all'indirizzo ${PEC_PODERE}. La compensazione avrà effetto dalla data della vostra accettazione.`,
  ];
  return righe.join("\n");
}

async function pdfLettera({ oggetto, testo, firma }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const grassetto = await doc.embedFont(StandardFonts.HelveticaBold);
  const pulito = s => String(s).replace(/[^\x20-\x7E -ÿ€–«»’]/g, "");
  let pagina = doc.addPage([595.28, 841.89]);
  let y = 790; const x = 60, largo = 475;
  const scrivi = (t, f = font, size = 10.5, colore = rgb(0.1, 0.1, 0.1)) => {
    const parole = pulito(t).split(" "); let riga = "";
    const vai = r => { if (y < 70) { pagina = doc.addPage([595.28, 841.89]); y = 790; } pagina.drawText(r, { x, y, size, font: f, color: colore }); y -= size + 5; };
    for (const p of parole) { const prova = riga ? `${riga} ${p}` : p; if (f.widthOfTextAtSize(prova, size) > largo && riga) { vai(riga); riga = p; } else riga = prova; }
    vai(riga);
  };
  scrivi("SOCIETÀ AGRICOLA PODERE VERDE a r.l.", grassetto, 12);
  scrivi("Via Portuense 1118 – 00148 Roma · partita IVA 15117871002 · PEC " + PEC_PODERE, font, 9, rgb(0.35, 0.35, 0.35));
  y -= 16;
  scrivi(`Roma, ${dataIt(new Date().toISOString().slice(0, 10))}`);
  y -= 8;
  scrivi(`Oggetto: ${oggetto}`, grassetto);
  y -= 6;
  for (const r of testo.split("\n")) { if (!r) { y -= 8; continue; } scrivi(r); }
  y -= 12;
  scrivi("Distinti saluti");
  scrivi(firma || FIRMA_PREDEFINITA);
  y -= 30;
  scrivi("Per accettazione (timbro e firma) ______________________________   data ____________");
  return new File([await doc.save()], `Proposta di compensazione ${dataIt(new Date().toISOString().slice(0, 10)).replace(/\//g, "-")}.pdf`, { type: "application/pdf" });
}

async function spedisciLettera({ tipo, id, oggetto, testo, firma, file, documentoId }) {
  const b = new Uint8Array(await file.arrayBuffer());
  let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  const { data, error } = await supabase.functions.invoke("spedisci-mail", {
    body: { tipo, id, oggetto, testo, firma, allegati: [{ nome: file.name, tipo: "application/pdf", contenuto: btoa(s) }], codice_richiesta: nuovoCodiceRichiesta(),
      documento_tipo: "compensazione", documento_id: documentoId, sezione: "Scadenzario: proposta di compensazione" },
  });
  if (error) {
    let messaggio = error.message;
    try { const j = await error.context.json(); if (j?.errore || j?.error) messaggio = j.errore || j.error; } catch { /* risposta senza testo */ }
    throw new Error(`Lettera non spedita: ${messaggio}`);
  }
  if (!data?.ok) throw new Error(`Lettera non spedita: ${data?.errore || "risposta non valida"}`);
  return data;
}

const emailDi = x => String(x?.email || "").trim();
const SEZIONE_LETTERA = "Scadenzario: proposta di compensazione";

// La lettera entra subito nel registro, nella scheda del cliente e in quella del fornitore, «da inviare»
async function registraDaInviare({ idCliente, idFornitore, indirizzo, oggetto, testo, firma, allegato, documentoId }) {
  const { data, error } = await supabase.from("ci_comunicazioni").insert([{
    data_ora: new Date().toISOString(), tipo: "Email", direzione: "inviata", esito: "da inviare",
    cliente_id: idCliente, fornitore_id: idFornitore, indirizzo: indirizzo || null,
    oggetto, testo: `${testo}\n\nCordiali saluti\n${firma || FIRMA_PREDEFINITA}`, firma: firma || FIRMA_PREDEFINITA,
    allegati: [allegato], sezione: SEZIONE_LETTERA, documento_tipo: "compensazione", documento_id: documentoId,
    note: "Lettera di proposta di compensazione preparata nello scadenzario: da inviare",
  }]).select("id, esito, oggetto, testo, firma, allegati").single();
  if (error) throw new Error(`Registro delle Comunicazioni non scritto: ${error.message}`);
  return data;
}
// Dopo la spedizione con il postino: la mail spedita (scritta dal postino nel registro) prende il posto della riga «da inviare»
async function dopoSpedizione({ gruppo, daInviare, spedita }) {
  const { error } = await supabase.from("ci_compensazioni").update({ comunicazione_id: spedita.riga }).eq("gruppo", gruppo);
  if (error) throw new Error(error.message);
  if (daInviare?.id) {
    const { error: e2 } = await supabase.from("ci_comunicazioni").update({
      esito: "spedita con il postino", tolta_il: new Date().toISOString(), motivo_tolta: "Doppione",
      note: `Lettera spedita con il postino: è la comunicazione n. ${spedita.riga} del registro`,
    }).eq("id", daInviare.id);
    if (e2) throw new Error(`Lettera spedita, ma la riga «da inviare» del registro non è stata aggiornata: ${e2.message}`);
  }
}

// Spedire più tardi, dallo scadenzario, una lettera rimasta «da inviare»; oppure segnarla inviata a mano
function InviaLettera({ compensazione, onFatto }) {
  const [lavoro, setLavoro] = useState(false);
  const c = compensazione, l = c.lettera;
  const idCliente = c.a?.cliente_id, idFornitore = c.b?.fornitore_id;
  async function spedisci(tipo, id) {
    setLavoro(true);
    try {
      const allegato = (l.allegati || [])[0];
      if (!allegato?.percorso) throw new Error("Nel registro manca il PDF della lettera.");
      const { data: blob, error } = await supabase.storage.from(ARCHIVIO_LETTERE).download(allegato.percorso);
      if (error) throw new Error(`PDF della lettera non letto: ${error.message}`);
      const file = new File([blob], allegato.nome || "Proposta di compensazione.pdf", { type: "application/pdf" });
      const testo = String(l.testo || "").replace(/\n\nCordiali saluti\n[\s\S]*$/, "");
      const r = await spedisciLettera({ tipo, id, oggetto: l.oggetto, testo, firma: l.firma, file, documentoId: c.id });
      await dopoSpedizione({ gruppo: c.gruppo, daInviare: l, spedita: r });
      alert(`✓ Lettera spedita a ${r.destinatario}. È nel Registro delle Comunicazioni.`);
      onFatto && onFatto();
    } catch (e) { alert(`⚠️ ${e.message}`); }
    setLavoro(false);
  }
  async function aMano() {
    if (!window.confirm("Segnare la lettera «inviata a mano» (PEC, raccomandata o consegna)? La data è quella di oggi.")) return;
    setLavoro(true);
    const { error } = await supabase.from("ci_comunicazioni").update({ esito: "inviata a mano", data_ora: new Date().toISOString() }).eq("id", l.id);
    setLavoro(false);
    if (error) { alert(`⚠️ ${error.message}`); return; }
    onFatto && onFatto();
  }
  const piccolo = { ...btn(false), height: 24, fontSize: 10.5, marginTop: 3, marginRight: 3 };
  return (
    <div>
      <button style={piccolo} disabled={lavoro} onClick={() => spedisci("cliente", idCliente)}>Spedisci al cliente</button>
      <button style={piccolo} disabled={lavoro} onClick={() => spedisci("fornitore", idFornitore)}>Spedisci al fornitore</button>
      <button style={piccolo} disabled={lavoro} onClick={aMano}>Inviata a mano</button>
    </div>
  );
}

// ───────────────────────── compensazione tra cliente e fornitore (stessa partita IVA)
export function CompensaTraSoggetti({ lato, schedaCorrente, controparte, onChiudi, onFatto }) {
  const idCliente = lato === "cliente" ? schedaCorrente.id : controparte.id;
  const idFornitore = lato === "fornitore" ? schedaCorrente.id : controparte.id;
  const [nostre, setNostre] = useState([]);
  const [sue, setSue] = useState([]);
  const [selA, setSelA] = useState(new Set());
  const [selB, setSelB] = useState(new Set());
  const [errore, setErrore] = useState("");
  const [fase, setFase] = useState("scelta");
  const [lavoro, setLavoro] = useState(false);
  const [oggetto, setOggetto] = useState("Proposta di compensazione – Società Agricola Podere Verde a r.l.");
  const [testo, setTesto] = useState("");
  const [firma, setFirma] = useState(FIRMA_PREDEFINITA);
  const [creata, setCreata] = useState(null);

  useEffect(() => {
    (async () => {
      const prendi = (campo, idv, l) => fetchAllPages((da, a) => supabase.from("ci_v_scadenzario").select("*").eq("lato", l).eq(campo, idv).gt("residuo", 0.005).gt("importo", 0).order("data_documento").order("scadenza_id").range(da, a));
      const [{ data: x, error: e1 }, { data: y, error: e2 }] = await Promise.all([prendi("cliente_id", idCliente, "cliente"), prendi("fornitore_id", idFornitore, "fornitore")]);
      if (e1 || e2) { setErrore((e1 || e2).message); return; }
      setNostre((x || []).filter(r => r.scadenza_id && !(Number(r.in_attesa_di_accettazione) > 0)));
      setSue((y || []).filter(r => r.scadenza_id && !(Number(r.in_attesa_di_accettazione) > 0)));
    })();
  }, [idCliente, idFornitore]);

  const sceltiA = nostre.filter(r => selA.has(r.scadenza_id));
  const sceltiB = sue.filter(r => selB.has(r.scadenza_id));
  const sommaA = cent(sceltiA.reduce((t, r) => t + Number(r.residuo), 0));
  const sommaB = cent(sceltiB.reduce((t, r) => t + Number(r.residuo), 0));
  const totale = cent(Math.min(sommaA, sommaB));
  const coppie = useMemo(() => ripartisci(sceltiA, sceltiB), [sceltiA, sceltiB]); // eslint-disable-line react-hooks/exhaustive-deps
  const conRitenuta = sceltiB.filter(r => Number(r.ritenuta) > 0);
  const nomeCliente = lato === "cliente" ? schedaCorrente.nome : controparte.nome;

  function prepara() {
    setErrore("");
    if (!sceltiA.length || !sceltiB.length) { setErrore("Scelga almeno una fattura per parte."); return; }
    setTesto(testoLettera({ controparte: { nome: nomeCliente }, coppie, totale, restoNostre: cent(sommaA - totale), restoSue: cent(sommaB - totale) }));
    setFase("lettera");
  }
  async function registra() {
    setErrore(""); setLavoro(true);
    try {
      const gruppo = crypto.randomUUID();
      const motivo = `Proposta di compensazione tra le nostre fatture a ${nomeCliente} e le sue fatture come fornitore: ${euro(totale)}`;
      const { data: ins, error } = await supabase.from("ci_compensazioni").insert(coppie.map(c => ({
        gruppo, genere: "tra cliente e fornitore", documento_a_id: c.a.scadenza_id, documento_b_id: c.b.scadenza_id, importo: c.importo,
        stato: "in attesa di accettazione", motivo,
      }))).select("id");
      if (error) throw new Error(error.message);
      const file = await pdfLettera({ oggetto, testo, firma });
      const [salvata] = await caricaAllegati([file]);
      const com = await registraDaInviare({ idCliente, idFornitore, indirizzo: emailDi(lato === "cliente" ? schedaCorrente : controparte) || emailDi(lato === "cliente" ? controparte : schedaCorrente),
        oggetto, testo, firma, allegato: salvata, documentoId: ins?.[0]?.id });
      const { error: e2 } = await supabase.from("ci_compensazioni").update({ lettera_percorso: salvata.percorso, comunicazione_id: com.id }).eq("gruppo", gruppo);
      if (e2) throw new Error(e2.message);
      setCreata({ gruppo, file, primo: ins?.[0]?.id, percorso: salvata.percorso, comunicazione: com });
      setFase("spedizione");
    } catch (e) { setErrore(e.message); }
    setLavoro(false);
  }
  async function spedisci(tipo, idScheda) {
    setErrore(""); setLavoro(true);
    try {
      const r = await spedisciLettera({ tipo, id: idScheda, oggetto, testo, firma, file: creata.file, documentoId: creata.primo });
      await dopoSpedizione({ gruppo: creata.gruppo, daInviare: creata.comunicazione, spedita: r });
      alert(`✓ Lettera spedita a ${r.destinatario} da ${r.mittente || CASELLA_COMUNICAZIONI}. È nel Registro delle Comunicazioni.`);
      onFatto();
    } catch (e) { setErrore(e.message); }
    setLavoro(false);
  }
  function scarica() {
    const url = URL.createObjectURL(creata.file);
    const a = document.createElement("a"); a.href = url; a.download = creata.file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const tabella = (titolo, elenco, sel, setSel) => (
    <div style={{ flex: "1 1 320px", minWidth: 0 }}>
      <div style={{ fontWeight: 800, fontSize: 12.5, color: C.primary, marginBottom: 4 }}>{titolo}</div>
      {!elenco.length ? <div style={{ fontSize: 12, color: C.muted }}>Nessuna fattura aperta.</div> : (
        <table><thead><tr style={testata}><th style={th}></th><th style={th}>Numero</th><th style={th}>Data</th><th style={{ ...th, textAlign: "right" }}>Residuo</th></tr></thead>
          <tbody>{elenco.map(r => (
            <tr key={r.scadenza_id} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={td}><input type="checkbox" checked={sel.has(r.scadenza_id)} onChange={() => { setErrore(""); setSel(s => { const n = new Set(s); n.has(r.scadenza_id) ? n.delete(r.scadenza_id) : n.add(r.scadenza_id); return n; }); }} /></td>
              <td style={td}>{r.numero_documento}{Number(r.ritenuta) > 0 && <div style={{ fontSize: 10.5, color: C.accent }}>con ritenuta</div>}</td>
              <td style={td}>{dataIt(r.data_documento)}</td>
              <td style={{ ...td, textAlign: "right" }}>{euro(r.residuo)}</td>
            </tr>))}</tbody></table>
      )}
    </div>
  );

  return (
    <div style={{ ...scheda, border: `2px solid ${C.accent}` }}>
      <div style={{ fontWeight: 800, color: C.accent }}>Compensazione tra cliente e fornitore: {nomeCliente}</div>
      <div style={{ fontSize: 12, color: C.muted, margin: "4px 0 8px" }}>Stessa partita IVA come cliente e come fornitore. Si compensa l'importo minore; le fatture si chiudono dalla più vecchia e al massimo la più recente resta aperta in parte. La compensazione nasce «in attesa di accettazione» con la lettera di proposta (articoli 1243 e 1252 del codice civile) e vale quando si registra l'accettazione.</div>
      {fase === "scelta" && <>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {tabella("Nostre fatture da incassare", nostre, selA, setSelA)}
          {tabella("Sue fatture da pagare", sue, selB, setSelB)}
        </div>
        <div style={{ marginTop: 10, fontSize: 13 }}>Nostre scelte {euro(sommaA)} · sue scelte {euro(sommaB)} · <b>si compensano {euro(totale)}</b>
          {sommaA > totale + 0.005 && <span style={{ color: C.muted }}> · resta da incassare {euro(sommaA - totale)}</span>}
          {sommaB > totale + 0.005 && <span style={{ color: C.muted }}> · resta da pagare {euro(sommaB - totale)}, con la causale «… DEDOTTA COMPENSAZIONE DEL gg/mm/aa»</span>}</div>
        {conRitenuta.length > 0 && <div style={{ color: C.accent, fontSize: 12.5, marginTop: 6, fontWeight: 700 }}>⚠️ Compensare una parcella con ritenuta equivale a pagarla: la ritenuta va versata con l'F24.</div>}
        <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Se una fattura è con IVA per cassa, va confermato con lo Studio prima di compensare.</div>
        {errore && <div style={{ color: C.red, fontSize: 12.5, marginTop: 6, fontWeight: 700 }}>⚠️ {errore}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button style={btn(true, C.accent)} onClick={prepara}>Prepara la lettera di proposta</button>
          <button style={btn(false)} onClick={onChiudi}>Annulla</button>
        </div>
      </>}
      {fase === "lettera" && <>
        <input value={oggetto} onChange={e => setOggetto(e.target.value)} style={{ ...input, width: "100%", marginBottom: 8 }} />
        <textarea value={testo} onChange={e => setTesto(e.target.value)} rows={16} style={{ ...input, width: "100%", height: "auto", padding: 8 }} />
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, margin: "8px 0" }}>Firma: <input value={firma} onChange={e => setFirma(e.target.value)} maxLength={120} style={{ ...input, flex: 1 }} /></label>
        {errore && <div style={{ color: C.red, fontSize: 12.5, marginTop: 6, fontWeight: 700 }}>⚠️ {errore}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button style={btn(true, C.accent)} disabled={lavoro} onClick={registra}>{lavoro ? "Registro…" : "Registra la proposta e crea la lettera in PDF"}</button>
          <button style={btn(false)} onClick={() => setFase("scelta")}>Indietro</button>
        </div>
      </>}
      {fase === "spedizione" && creata && <>
        <div style={{ fontSize: 13, color: C.green, fontWeight: 700, marginBottom: 8 }}>✓ Proposta registrata «in attesa di accettazione». La lettera in PDF è agganciata alla compensazione.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn(true, C.primary)} disabled={lavoro} onClick={() => spedisci("cliente", idCliente)}>{lavoro ? "Spedisco…" : "Spedisci all'email della scheda cliente"}</button>
          <button style={btn(false, C.primary)} disabled={lavoro} onClick={() => spedisci("fornitore", idFornitore)}>Spedisci all'email della scheda fornitore</button>
          <button style={btn(false)} onClick={scarica}>📥 Scarica la lettera</button>
          <button style={btn(false)} onClick={onFatto}>Chiudi: resta «da inviare»</button>
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>La lettera è già nel Registro delle Comunicazioni del cliente e del fornitore, segnata «da inviare». Per spedirla con il programma servono il permesso «Può spedire mail dal programma» e l'email nella scheda; altrimenti la scarichi, la mandi a mano (anche via PEC) e poi, dallo scadenzario, la segni «inviata a mano».</div>
        {errore && <div style={{ color: C.red, fontSize: 12.5, marginTop: 6, fontWeight: 700 }}>⚠️ {errore}</div>}
      </>}
    </div>
  );
}

// ───────────────────────── registrare la risposta di accettazione
function RegistraAccettazione({ compensazione, onChiudi, onFatto }) {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState("PEC");
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState("");
  async function salva() {
    setErrore("");
    if (!data) { setErrore("Scriva la data dell'accettazione."); return; }
    if (!file && !note.trim()) { setErrore("Alleghi la lettera firmata o la PEC, oppure scriva una nota che dica dove si trova."); return; }
    setLavoro(true);
    try {
      const allegati = file ? await caricaAllegati([file]) : [];
      const a = compensazione.a, b = compensazione.b;
      const { data: com, error } = await supabase.from("ci_comunicazioni").insert([{
        data_ora: new Date(`${data}T12:00:00`).toISOString(), tipo, direzione: "ricevuta",
        cliente_id: a?.cliente_id || null, fornitore_id: a?.cliente_id ? null : (b?.fornitore_id || null),
        oggetto: "Accettazione della proposta di compensazione", testo: note.trim() || null, allegati,
        sezione: "Scadenzario: accettazione della compensazione", documento_tipo: "compensazione", documento_id: compensazione.id,
      }]).select("id").single();
      if (error) throw new Error(error.message);
      const { error: e2 } = await supabase.from("ci_compensazioni").update({
        stato: "accettata", risposta_id: com.id, accettata_il: new Date().toISOString(), data_compensazione: data,
      }).eq("gruppo", compensazione.gruppo);
      if (e2) throw new Error(e2.message);
      onFatto();
    } catch (e) { setErrore(e.message); }
    setLavoro(false);
  }
  return (
    <div style={{ ...scheda, border: `2px solid ${C.green}`, marginTop: 8 }}>
      <div style={{ fontWeight: 800, color: C.green, marginBottom: 6 }}>Registra l'accettazione della compensazione</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 12.5 }}>Data <input type="date" value={data} onChange={e => setData(e.target.value)} style={input} /></label>
        <label style={{ fontSize: 12.5 }}>Arrivata con <select value={tipo} onChange={e => setTipo(e.target.value)} style={input}><option>PEC</option><option>Email</option></select></label>
        <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: 12 }} />
      </div>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Nota (per esempio: lettera firmata ricevuta via PEC il …)" style={{ ...input, width: "100%", marginTop: 8 }} />
      {errore && <div style={{ color: C.red, fontSize: 12.5, marginTop: 6, fontWeight: 700 }}>⚠️ {errore}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button style={btn(true, C.green)} disabled={lavoro} onClick={salva}>{lavoro ? "Registro…" : "Registra: compensazione accettata"}</button>
        <button style={btn(false)} onClick={onChiudi}>Annulla</button>
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>La risposta entra nel Registro delle Comunicazioni; la compensazione vale dalla data dell'accettazione e chiude le fatture.</div>
    </div>
  );
}
