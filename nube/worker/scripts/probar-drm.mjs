// Compara el token Sec-MS-GEC de src/drm.ts con el del paquete edge-tts de
// Python (pip install edge-tts) en varias horas. Uso, desde nube/worker:
//   node --experimental-strip-types scripts/probar-drm.mjs
import { execFileSync } from "node:child_process";
import { tokenSecMsGec } from "../src/drm.ts";

const horas = [0, 1_700_000_000, 1_792_000_123.45, 2_000_000_299, Math.floor(Date.now() / 1000)];
const python = execFileSync(
  "python",
  ["-c", `import sys\nfrom edge_tts.drm import generate_sec_ms_gec_v2 as g\nfor h in sys.argv[1:]: print(g(float(h)))`, ...horas.map(String)],
  { encoding: "utf8" },
).trim().split(/\r?\n/);
let fallos = 0;
horas.forEach((h, i) => {
  const propio = tokenSecMsGec(h);
  const ok = propio === python[i];
  if (!ok) fallos++;
  console.log(`${ok ? "igual  " : "DISTINTO"} ${h}\n  propio: ${propio}\n  python: ${python[i]}`);
});
process.exit(fallos ? 1 : 0);
