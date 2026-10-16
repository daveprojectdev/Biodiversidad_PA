// Genera nube/web/tarjeta-social.png (1200x630, la og:image) con Edge sin
// ventana, a partir de la página servida por `npm run dev` en :8787.
//   node scripts/tarjeta-social.mjs
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const salida = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "tarjeta-social.png");
execFileSync(EDGE, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
  "--window-size=1200,630", "--virtual-time-budget=5000",
  `--screenshot=${salida}`, "http://localhost:8787/",
], { stdio: "ignore" });
console.log(`Tarjeta social: ${salida}`);
