// ============================================================
// Las colecciones y los textos del panorama, en un solo lugar.
// Los usa app.js en el navegador y también nube/worker/scripts/
// generar-panorama.mjs, que los escribe en index.html: así la portada
// llega ya pintada y nada se mueve cuando corre app.js (CLS).
// ============================================================

export const COLECCIONES = {
  anfibios: {
    api: "amphibia",
    nombre: "anfibios",
    sugeridas: [
      "¿Qué provincia tiene más especies?",
      "¿Dónde se ha visto la rana de ojos rojos?",
      "¿Cuál es la especie más avistada?",
      "¿Se ven más en temporada seca o lluviosa?",
      "¿Qué familia tuvo más especies distintas en Chiriquí en 2025?",
    ],
  },
  aves: {
    api: "aves",
    nombre: "aves",
    sugeridas: [
      "¿Qué provincia tiene más especies?",
      "¿En qué provincias se han visto colibríes?",
      "¿Cuál es el ave más avistada?",
      "¿Cuántos avistamientos de garzas hay por provincia?",
      "¿Qué familia tuvo más especies distintas en Chiriquí en 2025?",
    ],
  },
};

const formato = new Intl.NumberFormat("es-ES", { useGrouping: "always" });
export const num = (n) => (typeof n === "number" ? formato.format(n) : String(n));

export function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export const tituloMapa = (nombre) => `Especies de ${nombre} por provincia`;

export const notaMapa = (datos) => `${num(datos.total_avistamientos)} avistamientos · ${datos.rango_anios}`;

export const lead = (datos, nombre) =>
  "Pregunta en español, escribiendo o hablando, como le preguntarías a una persona. " +
  "Un modelo de lenguaje convierte tu pregunta en SQL y la respuesta sale de una base de datos real: " +
  `${num(datos.total_avistamientos)} avistamientos de ${nombre} hechos por ${num(datos.total_observadores)} personas en todo el país.`;

export function resumenHtml(datos) {
  const masDiversa = datos.provincias_detalle[0];
  return [
    [num(datos.total_especies), "especies"],
    [num(datos.total_avistamientos), "avistamientos"],
    [num(datos.total_observadores), "observadores"],
    [num(masDiversa.especies), `especies en ${masDiversa.provincia}, la provincia más diversa`],
  ]
    .map(([n, t]) => `<div class="dato"><b>${escapar(n)}</b><span>${escapar(t)}</span></div>`)
    .join("");
}

export const sugeridasHtml = (coleccion) =>
  COLECCIONES[coleccion].sugeridas.map((s) => `<button type="button">${escapar(s)}</button>`).join("");
