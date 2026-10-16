// ============================================================
// Token Sec-MS-GEC (versión 2) que exige el servicio de voz de
// Microsoft Edge en cada conexión. Sin él responde 403.
//
// Es la hora (en bloques de 5 minutos) más un identificador fijo,
// pasados por dos resúmenes propios de Microsoft: un SHA-256 que parte
// de un estado intermedio secreto y un «CS64». Se reescribió aquí desde
// la descripción del protocolo en edge-tts (rany2, drm.py, 7.3.1);
// scripts/probar-drm.mjs compara el resultado con el paquete de Python.
//
// Todo en BigInt: las cuentas son de 32 bits con desbordes intermedios
// que hay que cortar justo donde los corta el original.
// ============================================================

export const TOKEN_CLIENTE = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EPOCA_WINDOWS = 11_644_473_600n;
const M = 0xffffffffn;

const INICIAL = [
  0x6a09e667n, 0xbb67ae85n, 0x3c6ef372n, 0xa54ff53an, 0x510e527fn, 0x9b05688cn, 0x1f83d9abn, 0x5be0cd19n,
];
const ESTADO = [
  0xfd9fbea2n, 0x91243ce7n, 0xbe499094n, 0xcd2e1e0an, 0x6c006f49n, 0x04bd35abn, 0xfeb0a7e4n, 0x03effbd2n,
];
const AGENDA = [
  0xeb24bf9en, 0x1558691fn, 0xa0c09ee2n, 0x0cfa32ban, 0xa622ee8cn, 0xd1dd9491n, 0xc0dd25a0n,
  0xf9e70ab6n, 0xf0c31573n, 0x7058ce4en, 0x7188e606n, 0x00e5ab33n, 0xd258b060n, 0x72766564n,
];
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
].map(BigInt);
const AJUSTE = 0xc9dc06a7n;
// En el primer bloque, la constante 14 va cambiada por AJUSTE.
const K_BLOQUE = [...K.slice(0, 14), AJUSTE, ...K.slice(15)];
const AJUSTE_SIGMA0 = 0x059c0b80n;
const AJUSTE_SIGMA1 = 0x000b92c0n;

const CS64: [bigint, bigint][] = [
  [0xe82e91b1n, 0xb32700d0n], [0x44de24c6n, 0x88dff51dn], [0x3beb65bcn, 0x29514038n],
  [0xc89c5933n, 0xb328cbdfn], [0x8d1ec211n, 0xd405b4d5n], [0x314ef5d5n, 0x26e55f3cn],
  [0xe92491b1n, 0x607801c6n], [0xf0a5b9d5n, 0x82b2c1fbn], [0x06064cf3n, 0xfa51a3dan],
  [0xda79fa60n, 0x207cc464n], [0xbed20560n, 0x3c3c74f3n], [0x89f9c9f8n, 0xd2d14b61n],
  [0x35fa38c6n, 0xbb04a2c1n], [0xcb49e3c6n, 0xc5626167n],
];
const CS64_FACTOR = 0x82893933n;
const CS64_AJUSTE0 = 0xf2f90b1an;
const CS64_AJUSTE1 = 0x0b1a0000n;

const rotr = (x: bigint, n: bigint) => ((x >> n) | (x << (32n - n))) & M;
const rol16 = (x: bigint) => {
  x &= M;
  return ((x << 16n) | (x >> 16n)) & M;
};
const sigma0 = (v: bigint) => ((v >> 7n) ^ (v << 25n) ^ (v >> 18n) ^ (v << 14n) ^ (v >> 3n)) & M;
const sigma1 = (v: bigint) => ((v >> 17n) ^ (v << 15n) ^ (v >> 19n) ^ (v << 13n) ^ (v >> 10n)) & M;

const bigEndian = (b: Uint8Array) => b.reduce((n, x) => (n << 8n) | BigInt(x), 0n);

// Rondas de SHA-256 desde `primera` (el estado intermedio arranca en la 14).
function rondas(estado: bigint[], w: bigint[], primera = 0): bigint[] {
  const k = primera === 14 ? K_BLOQUE : K;
  let [a, b, c, d, e, f, g, h] = estado;
  for (let i = primera; i < 64; i++) {
    const t1 = (h + (rotr(e, 6n) ^ rotr(e, 11n) ^ rotr(e, 25n)) + (g ^ (e & (f ^ g))) + k[i] + w[i]) & M;
    const t2 = ((rotr(a, 2n) ^ rotr(a, 13n) ^ rotr(a, 22n)) + ((a & b) | (c & (a | b)))) & M;
    [a, b, c, d, e, f, g, h] = [(t1 + t2) & M, a, b, c, (d + t1) & M, e, f, g];
  }
  return [a, b, c, d, e, f, g, h];
}

function expandir(w: bigint[], desde = 16): void {
  for (let i = desde; i < 64; i++) w.push((sigma1(w[i - 2]) + w[i - 7] + sigma0(w[i - 15]) + w[i - 16]) & M);
}

function estadoInicial(dato7: Uint8Array): bigint[] {
  const w: bigint[] = [...Array(14).fill(0n), bigEndian(dato7.subarray(0, 3)), bigEndian(dato7.subarray(3, 7))];
  for (let i = 16; i < 30; i++) {
    let v = AGENDA[i - 16];
    if (i - 2 >= 14) v += i === 16 ? sigma1(w[i - 2]) ^ AJUSTE_SIGMA1 : sigma1(w[i - 2]);
    if (i - 7 >= 14) v += w[i - 7];
    if (i - 15 >= 14) v += i === 29 ? sigma0(w[i - 15]) ^ AJUSTE_SIGMA0 : sigma0(w[i - 15]);
    w.push(v & M);
  }
  w.push((sigma1(w[28]) + w[23] + sigma0(w[15]) + w[14] + AJUSTE - K[14]) & M);
  expandir(w, 31);
  const trabajo = rondas(ESTADO, w, 14);
  return INICIAL.map((x, i) => (x + trabajo[i]) & M);
}

function sha256(dato: Uint8Array): Uint8Array {
  const largo = 57 + dato.length;
  const relleno = (((55 - largo) % 64) + 64) % 64;
  const bloques = new Uint8Array(dato.length - 7 + 1 + relleno + 8);
  bloques.set(dato.subarray(7));
  bloques[dato.length - 7] = 0x80;
  new DataView(bloques.buffer).setBigUint64(bloques.length - 8, BigInt(largo * 8));
  let estado = estadoInicial(dato.subarray(0, 7));
  for (let o = 0; o < bloques.length; o += 64) {
    const w: bigint[] = [];
    for (let i = 0; i < 16; i++) w.push(bigEndian(bloques.subarray(o + 4 * i, o + 4 * i + 4)));
    expandir(w);
    const trabajo = rondas(estado, w);
    estado = estado.map((x, i) => (x + trabajo[i]) & M);
  }
  const salida = new Uint8Array(32);
  const vista = new DataView(salida.buffer);
  estado.forEach((x, i) => vista.setUint32(4 * i, Number(x)));
  return salida;
}

// Palabras de 32 bits little-endian, con ceros hasta un número par.
function palabrasLE(dato: Uint8Array): bigint[] {
  const p = new Uint8Array(Math.ceil(dato.length / 4) * 4);
  p.set(dato);
  const vista = new DataView(p.buffer);
  const w: bigint[] = [];
  for (let i = 0; i < p.length; i += 4) w.push(BigInt(vista.getUint32(i, true)));
  if (w.length % 2) w.push(0n);
  return w;
}

function cs64(dato: Uint8Array, resumen: Uint8Array): [bigint, bigint] {
  const vista = new DataView(resumen.buffer, resumen.byteOffset);
  const ka = BigInt(vista.getUint32(0, true)) | 1n;
  const kb = BigInt(vista.getUint32(4, true)) | 1n;
  const factores = [(ka * CS64_FACTOR) & M, (kb * CS64_FACTOR) & M];
  const terminos = CS64.map(([coef], i) => (coef * factores[i % 2]) & M);
  const desplazamientos = CS64.map(([, d]) => d);
  const conCero = new Uint8Array(dato.length + 1);
  conCero.set(dato, 1);
  palabrasLE(conCero).forEach((palabra, i) => {
    const par = i % 2 === 0;
    let termino = palabra * (par ? ka : kb);
    let desp = rol16(palabra) * (par ? 0xef0569fbn : 0xc31713dbn);
    if (i === 0) {
      termino += CS64_AJUSTE0 * factores[0];
      desp += CS64_AJUSTE1;
    }
    terminos.push(termino & M);
    desplazamientos.push(desp & M);
  });
  let cambioAcum = 0n;
  let cambioUltimo = 0n;
  let estado = 0n;
  let acum = 0n;
  for (let i = 0; i < terminos.length; i += 2) {
    const [x, y] = [terminos[i], terminos[i + 1]];
    let t = rol16((desplazamientos[i] + x) & M);
    let q = (t * 0x76f50f34n) & M;
    cambioAcum += (rol16(q) * 0xc3efea97n + q) & M;
    t = rol16((desplazamientos[i + 1] + y) & M);
    q = (t * 0x1881ce3cn) & M;
    cambioUltimo = (rol16(q) * 0x35bd1ec9n + q) & M;
    cambioAcum = (cambioAcum + cambioUltimo) & M;

    estado = (estado * ka + x) & M;
    estado = (rol16(estado) * 0xcf98b111n) & M;
    estado = (rol16(estado) * 0x87085b9fn) & M;
    estado = (rol16(estado) * 0x12ceb96dn) & M;
    estado = (rol16(estado) * 0x257e1d83n) & M;
    acum += estado;
    t = (estado * kb + y) & M;
    t = (rol16(t) * 0xa27416f5n) & M;
    t = (rol16(t) * 0xd38396ffn) & M;
    estado = (rol16((rol16(t) * 0x7c932b89n) & M) * 0xbfa49f69n) & M;
    acum = (acum + estado) & M;
  }
  return [cambioUltimo ^ estado, cambioAcum ^ acum];
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();

/** Token para la hora dada (segundos Unix); cambia cada 5 minutos. */
export function tokenSecMsGec(segundosUnix = Date.now() / 1000): string {
  let marcas = BigInt(Math.floor(segundosUnix)) + EPOCA_WINDOWS;
  marcas -= marcas % 300n;
  marcas *= 10_000_000n; // de segundos a unidades de 100 ns
  const dato = new TextEncoder().encode(`${marcas}${TOKEN_CLIENTE}`);
  const resumen = sha256(dato);
  const [a, b] = cs64(dato, resumen);
  const le = new Uint8Array(8);
  new DataView(le.buffer).setUint32(0, Number(a), true);
  new DataView(le.buffer).setUint32(4, Number(b), true);
  return `${hex(le)}-${hex(resumen)}`;
}
