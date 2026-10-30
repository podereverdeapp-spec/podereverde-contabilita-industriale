// Versione 333 (30/10/2026): impronta MD5 calcolata nel programma, senza librerie esterne (RFC 1321).
// Serve a riconoscere i file: due file con la stessa impronta sono identici.
const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);

// impronta MD5 di un ArrayBuffer o Uint8Array, in 32 caratteri esadecimali minuscoli
export function md5(dati) {
  const b = dati instanceof Uint8Array ? dati : new Uint8Array(dati);
  const n = b.length;
  const blocchi = ((n + 8) >>> 6) + 1;
  const m = new Uint8Array(blocchi * 64);
  m.set(b);
  m[n] = 0x80;
  const bit = n * 8;
  const v = new DataView(m.buffer);
  v.setUint32(m.length - 8, bit >>> 0, true);
  v.setUint32(m.length - 4, Math.floor(bit / 4294967296), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const X = new Uint32Array(16);
  for (let o = 0; o < m.length; o += 64) {
    for (let i = 0; i < 16; i++) X[i] = v.getUint32(o + i * 4, true);
    let A = a0, B = b0, Cc = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & Cc) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & Cc); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ Cc ^ D; g = (3 * i + 5) % 16; }
      else { F = Cc ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + X[g]) >>> 0;
      A = D; D = Cc; Cc = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + Cc) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((x, i) => out.setUint32(i * 4, x, true));
  return Array.from(new Uint8Array(out.buffer), x => x.toString(16).padStart(2, "0")).join("");
}

// impronta MD5 di un file scelto nel browser
export async function md5File(file) {
  return md5(new Uint8Array(await file.arrayBuffer()));
}
