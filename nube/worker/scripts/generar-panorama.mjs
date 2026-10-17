// `npm run panorama`: guarda el panorama de cada colección (lo que devuelve
// /explorar) como JSON estático en web/, para que la portada pinte el mapa y
// las cifras sin despertar a Neon (en frío tarda hasta 17 s). Además escribe
// en web/index.html el estado inicial (anfibios): el lead, el título y la nota
// del mapa, las preguntas sugeridas y el resumen, con los mismos textos que
// pone app.js (web/panorama-textos.js). Así la página llega ya pintada y nada
// se mueve al cargar (CLS).
// Los datos solo cambian si se vuelve a migrar una colección: entonces se
// corre otra vez. Por defecto lee producción; `npm run panorama --
// http://localhost:8787` lee el Worker local.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const web = join(aqui, "..", "..", "web");
const base = process.argv[2] ?? "https://biodiversidad.davidameth.dev";
const textos = await import(pathToFileURL(join(web, "panorama-textos.js")).href);

const panoramas = {};
for (const coleccion of ["amphibia", "aves"]) {
  const r = await fetch(`${base}/explorar?coleccion=${coleccion}`);
  const datos = await r.json();
  if (!r.ok || datos.error) throw new Error(`${coleccion}: ${datos.error ?? `HTTP ${r.status}`}`);
  panoramas[coleccion] = datos;
  const destino = join(web, `panorama-${coleccion}.json`);
  writeFileSync(destino, JSON.stringify(datos) + "\n");
  console.log(`${coleccion}: ${datos.total_avistamientos} avistamientos → ${destino}`);
}

// El contenido de cada elemento por su id; la etiqueta de cierre es la del
// propio elemento (ninguno de estos tiene otro igual dentro).
const inicial = panoramas[textos.COLECCIONES.anfibios.api];
const { nombre } = textos.COLECCIONES.anfibios;
const piezas = {
  lead: textos.escapar(textos.lead(inicial, nombre)),
  "titulo-mapa": textos.escapar(textos.tituloMapa(nombre)),
  "nota-mapa": textos.escapar(textos.notaMapa(inicial)),
  sugeridas: textos.sugeridasHtml("anfibios"),
  resumen: textos.resumenHtml(inicial),
};
const rutaHtml = join(web, "index.html");
let html = readFileSync(rutaHtml, "utf8");
for (const [id, contenido] of Object.entries(piezas)) {
  const patron = new RegExp(`(<(\\w+)\\b[^>]*\\bid="${id}"[^>]*>)[\\s\\S]*?(</\\2>)`);
  if (!patron.test(html)) throw new Error(`No encontré id="${id}" en index.html`);
  html = html.replace(patron, (_, abre, _etiqueta, cierra) => abre + contenido + cierra);
}
writeFileSync(rutaHtml, html);
console.log(`index.html: ${Object.keys(piezas).join(", ")}`);
