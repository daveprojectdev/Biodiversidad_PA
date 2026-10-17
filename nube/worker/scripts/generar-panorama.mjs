// `npm run panorama`: guarda el panorama de cada colección (lo que devuelve
// /explorar) como JSON estático en web/, para que la portada pinte el mapa y
// las cifras sin despertar a Neon (en frío tarda hasta 17 s). Los datos solo
// cambian si se vuelve a migrar una colección: entonces se corre otra vez.
// Por defecto lee producción; `npm run panorama -- http://localhost:8787` lee
// el Worker local.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? "https://biodiversidad.davidameth.dev";

for (const coleccion of ["amphibia", "aves"]) {
  const r = await fetch(`${base}/explorar?coleccion=${coleccion}`);
  const datos = await r.json();
  if (!r.ok || datos.error) throw new Error(`${coleccion}: ${datos.error ?? `HTTP ${r.status}`}`);
  const destino = join(aqui, "..", "..", "web", `panorama-${coleccion}.json`);
  writeFileSync(destino, JSON.stringify(datos) + "\n");
  console.log(`${coleccion}: ${datos.total_avistamientos} avistamientos → ${destino}`);
}
