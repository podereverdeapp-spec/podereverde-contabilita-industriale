// Versione 386 (Tenente, 16/11/2026) — lettura ottica (Tesseract, lo stesso dell'app) per le scansioni e le foto dei documenti
// della banca. Tutto avviene nel browser: il file non esce dal computer. I file di Tesseract sono nel programma (public/ocr:
// tesseract.js 5.1.1, motore 5.1.1, lingua italiana «best_int», non compressa), non presi da internet.
// Quello che la lettura ottica trova è una PROPOSTA: la conferma una persona (decisione del Dott. Bizzarri del 16/11/2026).

const BASE = "/ocr/";
let caricamento = null;

function caricaScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("lettura ottica: serve il browser"));
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!caricamento) caricamento = new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = BASE + "tesseract.min.js";
    s.onload = () => (window.Tesseract ? ok(window.Tesseract) : ko(new Error("lettura ottica non caricata")));
    s.onerror = () => { caricamento = null; ko(new Error("i file della lettura ottica (cartella /ocr del programma) non si caricano")); };
    document.head.appendChild(s);
  });
  return caricamento;
}

// Pagine di un PDF come immagini (circa 300 punti per pollice), al massimo 30 pagine
export async function immaginiDalPdf(byte, massimo = 30) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(byte) }).promise;
  if (doc.numPages > massimo) throw new Error(`il PDF ha ${doc.numPages} pagine: la lettura ottica ne legge al massimo ${massimo}`);
  const out = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n);
    const v1 = pg.getViewport({ scale: 1 });
    const scala = Math.min(4.2, 2550 / Math.max(v1.width, 1));            // larghezza circa 2500 punti
    const v = pg.getViewport({ scale: scala });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.width); canvas.height = Math.round(v.height);
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport: v }).promise;
    out.push({ numero: n, immagine: canvas.toDataURL("image/png") });
  }
  return { pagine: out, numeroPagine: doc.numPages };
}
export async function immagineDaFile(byte, tipo) {
  const url = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(r.error); r.readAsDataURL(new Blob([byte], { type: tipo })); });
  return { pagine: [{ numero: 1, immagine: url }], numeroPagine: 1 };
}

// Il PDF ha testo? (se no, è una scansione)
export async function pdfSenzaTesto(byte) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(byte) }).promise;
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    if (tc.items.some(v => String(v.str || "").trim())) return false;
  }
  return true;
}

// Riconosce il testo di ogni pagina. avanzamento(testo) dice a che punto è. Esito: [{ numero, testo, fiducia, immagine }]
export async function leggiConOcr(pagine, avanzamento = () => {}) {
  const T = await caricaScript();
  avanzamento("Preparo la lettura ottica…");
  const w = await T.createWorker("ita", 1, { workerPath: BASE + "worker.min.js", corePath: BASE, langPath: BASE, gzip: false, workerBlobURL: false });
  try {
    await w.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "0" });
    const out = [];
    for (const p of pagine) {
      avanzamento(`Lettura ottica: pagina ${p.numero} di ${pagine.length}…`);
      const r = await w.recognize(p.immagine);
      out.push({ numero: p.numero, testo: r.data.text || "", fiducia: Math.round(r.data.confidence || 0), immagine: p.immagine });
    }
    return out;
  } finally { try { await w.terminate(); } catch { /* niente */ } }
}
