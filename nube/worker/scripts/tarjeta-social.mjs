// Genera nube/web/tarjeta-social.png (1200x630, la og:image) con Edge sin
// ventana y en modo claro, a partir de la página servida por `npm run dev` en :8787.
//   node scripts/tarjeta-social.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const salida = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "tarjeta-social.png");
// Perfil aparte: si hay un Edge abierto, sin esto la captura no se escribe.
const perfil = mkdtempSync(join(tmpdir(), "tarjeta-"));
const antes = Date.now();
execFileSync(EDGE, [
  "--headless=new", `--user-data-dir=${perfil}`, "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
  "--window-size=1200,630", "--virtual-time-budget=5000",
  // Siempre en modo claro (lo pidió David), aunque Windows esté en oscuro.
  `--screenshot=${salida}`, "http://localhost:8787/?tema=claro",
], { stdio: "ignore" });
// Edge termina de escribir el archivo un instante después de salir.
const hasta = Date.now() + 10_000;
while (Date.now() < hasta && !(statSync(salida, { throwIfNoEntry: false })?.mtimeMs >= antes)) {
  await new Promise((r) => setTimeout(r, 250));
}
// Edge puede seguir soltando el perfil: se reintenta y, si no, queda en Temp.
try {
  rmSync(perfil, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
} catch {}
if (!(statSync(salida, { throwIfNoEntry: false })?.mtimeMs >= antes)) throw new Error("Edge no escribió la captura");
console.log(`Tarjeta social: ${salida}`);
